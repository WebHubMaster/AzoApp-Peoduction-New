"""Iter 177 — Cancellation money-math regression.

Verifies the new _compute_cancellation branch for a partner-assigned paid booking:
    cancellation_fee     = service_net × partner_cancellation_pct%
    commission_charge    = fee − fee × partner_pct%
    cancellation_tax     = commission × gst%
    refund               = total_paid − (fee + tax)

Also exercises:
  * GET /api/bookings/{id}/cancellation-preview
  * POST /api/bookings/{id}/cancel
  * commission_ledger rows created (kind=cancellation)
  * GET /api/invoices/{id}/view returns a 2-page GST template for the
    partner-assigned case and the old credit-note template for the unassigned case.
"""
import os
import json
import asyncio
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
SERVICE_ID = "0fc1d006-b3ca-4bf0-8cda-2b9a35f882e5"
CUSTOMER_PHONE = "+919000000004"
PARTNER_PHONE = "+919000000003"
ADMIN_PHONE = "+919000000000"
OTP = "123456"


def _login(phone: str) -> str:
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=60)
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def tokens():
    return {
        "customer": _login(CUSTOMER_PHONE),
        "partner": _login(PARTNER_PHONE),
        "admin": _login(ADMIN_PHONE),
    }


@pytest.fixture(scope="module")
def mongo():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    return cli[os.environ.get("DB_NAME", "test_database")]


# ---------------------------------------------------------------------- helpers
async def _get_partner_id(mongo):
    u = await mongo.users.find_one({"phone": PARTNER_PHONE}, {"id": 1})
    return u["id"]


async def _create_booking_direct(mongo, total=488.29, gst=44.39, subtotal=443.90) -> str:
    """Seed a booking directly in Mongo — we only need an authorised customer
    booking in a 'cancellable' state to drive the controller end-to-end."""
    import uuid, datetime
    cust = await mongo.users.find_one({"phone": CUSTOMER_PHONE}, {"id": 1})
    bid = f"TEST177-{uuid.uuid4().hex[:10]}"
    # Electrician commission (matches /category_commissions row for the Electrician cat)
    cc = {"partner_pct": 80, "platform_pct": 15,
          "merchant_partner_referral_pct": 3, "merchant_customer_pct": 2,
          "customer_refund_pct": 80, "partner_cancellation_pct": 20}
    doc = {
        "id": bid,
        "code": f"BK{bid[-6:].upper()}",
        "customer_id": cust["id"],
        "status": "pending",
        "payment_status": "pending",
        "partner_id": None,
        "service_id": SERVICE_ID,
        "items": [{"service_id": SERVICE_ID, "service_name": "Fan Installation",
                   "qty": 1, "base_price": subtotal, "unit_service_value": subtotal}],
        "pricing": {"total": total, "gst": gst, "gst_pct": 18,
                    "subtotal": subtotal, "platform_fee": 0, "discount": 0},
        "commission_config": {"commission": cc},
        "address": {"line1": "Test", "city": "Jaipur", "state": "Rajasthan",
                    "pincode": "302001", "lat": 26.9, "lng": 75.8},
        "created_at": datetime.datetime.utcnow().isoformat(),
    }
    await mongo.bookings.insert_one(doc)
    return bid


# =============================================================== CORE MATH
def test_cancellation_math_partner_assigned_paid(tokens, mongo):
    """Create → force paid + partner assigned → preview + cancel → verify math."""
    async def _run():
        booking_id = await _create_booking_direct(mongo)
        partner_id = await _get_partner_id(mongo)
        # Force to the exact Scenario from the spec
        await mongo.bookings.update_one(
            {"id": booking_id},
            {"$set": {
                "status": "accepted",
                "payment_status": "paid",
                "partner_id": partner_id,
            }}
        )

        # ---------- preview ----------
        pv = requests.get(
            f"{API}/bookings/{booking_id}/cancellation-preview",
            headers={"Authorization": f"Bearer {tokens['customer']}"}, timeout=15,
        )
        assert pv.status_code == 200, pv.text
        pv = pv.json()
        print("PREVIEW:", json.dumps(pv, indent=2, default=str))
        assert pv["partner_was_assigned"] is True
        assert pv["partner_cancellation_pct"] == 20
        # fee = service_net × 20%  (service_net ≈ 443.9); allow ≤0.5 variance for base derivation
        fee = pv["cancellation_fee"]; tax = pv["cancellation_tax"]; refund = pv["refund"]
        # Invariant 1: fee + tax + refund == total_paid (to the paisa)
        assert round(fee + tax + refund, 2) == 488.29, f"{fee}+{tax}+{refund}"
        # Invariant 2: tax = commission × 18%; commission = fee × (100-partner_pct)% = fee × 20%
        # Electrician commission on this booking: partner=80 → platform_gross=20% of fee
        expected_commission = round(fee * 0.20, 2)
        expected_tax = round(expected_commission * 0.18, 2)
        assert abs(tax - expected_tax) <= 0.05, (tax, expected_tax, fee)
        # Invariant 3: 20% of service_amount == fee (Electrician partner_cancellation_pct = 20)
        assert abs(fee - pv["service_amount"] * 0.20) <= 0.02, (fee, pv["service_amount"])
        assert "reason" in pv and "cancellation fee" in pv["reason"].lower()

        # ---------- cancel ----------
        cx = requests.post(
            f"{API}/bookings/{booking_id}/cancel",
            headers={"Authorization": f"Bearer {tokens['customer']}"},
            json={"reason": "test"}, timeout=20,
        )
        assert cx.status_code == 200, cx.text

        bk = await mongo.bookings.find_one({"id": booking_id})
        assert bk["status"] == "cancelled"
        c = bk.get("cancellation") or {}
        assert c, "booking.cancellation missing"
        assert round(c.get("cancellation_fee") or c.get("cancel_charge"), 2) == round(fee, 2)
        assert round(c.get("cancellation_tax") or c.get("gst_retained"), 2) == round(tax, 2)
        assert round(c.get("refund") or 0, 2) == round(refund, 2)

        # ---------- ledger ----------
        ledger = await mongo.commission_ledger.find(
            {"booking_id": booking_id}).to_list(length=100)
        kinds = {row.get("kind") for row in ledger}
        print("LEDGER kinds:", kinds)
        assert "cancellation" in kinds, kinds
        cancel_row = next(r for r in ledger if r.get("kind") == "cancellation")
        # Spec-level invariants on the cancellation ledger row
        for key in ("partner_earning", "platform_earning", "merchant_referral", "tax", "base"):
            assert key in cancel_row, f"ledger row missing {key}"
        assert cancel_row["partner_earning"] > 0
        assert cancel_row["platform_earning"] > 0
        # Raj is merchant-referred → non-zero merchant_referral
        assert cancel_row["merchant_referral"] > 0
        assert round(cancel_row["tax"], 2) == round(tax, 2)
        assert round(cancel_row["base"], 2) == round(fee, 2)
        return booking_id

    asyncio.get_event_loop().run_until_complete(_run())


# ========================================================== UNASSIGNED PAID
def test_cancellation_unassigned_full_refund(tokens, mongo):
    async def _run():
        booking_id = await _create_booking_direct(mongo, total=300, gst=27, subtotal=273)
        await mongo.bookings.update_one(
            {"id": booking_id},
            {"$set": {
                "status": "pending",
                "payment_status": "paid",
                "partner_id": None,
            }}
        )
        pv = requests.get(
            f"{API}/bookings/{booking_id}/cancellation-preview",
            headers={"Authorization": f"Bearer {tokens['customer']}"}, timeout=15,
        ).json()
        print("UNASSIGNED PREVIEW:", pv)
        assert pv["partner_was_assigned"] is False
        assert pv["refund_pct"] == 100
        assert round(pv["refund"], 2) == 300.00
        assert round(pv.get("cancellation_fee", 0), 2) == 0.00
    asyncio.get_event_loop().run_until_complete(_run())


# ========================================================== INVOICE TEMPLATES
def test_cancellation_invoice_templates(tokens):
    with open("/app/test_reports/cancel_inv_ids.json") as fh:
        ids = json.load(fh)
    assigned_id = ids["True"]
    unassigned_id = ids["False"]

    r1 = requests.get(f"{API}/invoices/{assigned_id}/view",
                      headers={"Authorization": f"Bearer {tokens['customer']}"},
                      timeout=15, allow_redirects=True)
    assert r1.status_code == 200, (r1.status_code, r1.text[:400])
    html1 = r1.text.lower()
    print("ASSIGNED HTML len:", len(html1))
    assert "tax invoice (cancellation fee)" in html1, "title mismatch"
    assert "cancellation fee commission" in html1, "page1 commission line missing"
    assert "cgst" in html1 and "sgst" in html1
    assert "cancellation charge" in html1 and "page" in html1  # 2-page template

    r2 = requests.get(f"{API}/invoices/{unassigned_id}/view",
                      headers={"Authorization": f"Bearer {tokens['customer']}"},
                      timeout=15, allow_redirects=True)
    assert r2.status_code == 200
    html2 = r2.text.lower()
    print("UNASSIGNED HTML len:", len(html2))
    # Old credit-note template → no gst-invoice-page id
    assert "gst-invoice-page" not in html2, "unassigned should not render GST 2-page template"
