"""
Backend tests: Customer-side additional work merged into booking breakdown and invoice.
Covers:
 - GET /api/bookings/{id} (customer) for AZO432C38 (PAID additional) and AZOADDL01 (pending)
 - GET /api/invoices?booking_id=... + GET /api/invoices/{id} idempotency and GST block
 - Partner view should NOT have additional merged
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://azo-seo-console.preview.emergentagent.com").rstrip("/")

CUSTOMER_PHONE = "+919000000004"
PARTNER_PHONE = "+919000000003"
OTP = "123456"

ADDL_PARTS = 300
ADDL_LABOUR = 200
ADDL_TOTAL = 514.40  # 500 + 2.86% GST ~ as expected per request


def _login(phone):
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp",
                      json={"phone": phone, "otp": OTP}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def customer_token():
    return _login(CUSTOMER_PHONE)


@pytest.fixture(scope="session")
def partner_token():
    return _login(PARTNER_PHONE)


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _find_booking(token, number):
    """Fetch booking id by booking number via customer list."""
    r = requests.get(f"{BASE_URL}/api/bookings", headers=_h(token), timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data if isinstance(data, list) else data.get("items") or data.get("bookings") or []
    for b in items:
        if number in (b.get("code"), b.get("booking_code"), b.get("booking_number"), b.get("number"), b.get("id")):
            return b
    pytest.skip(f"Booking {number} not found for this customer in list; items={len(items)}")


# ---------- Booking breakdown tests ----------
class TestCustomerBookingBreakdown:
    def test_azo432c38_paid_additional_merged(self, customer_token):
        bk = _find_booking(customer_token, "AZO432C38")
        bid = bk["id"]
        r = requests.get(f"{BASE_URL}/api/bookings/{bid}", headers=_h(customer_token), timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        bd = b.get("breakdown") or {}
        items = bd.get("service_items") or bd.get("items") or []
        names = [str(i.get("name", "")).lower() for i in items]
        tier_labels = " ".join(str(i.get("tier_label", "")).lower() for i in items)
        assert any("tap replacement" in n and ("product" in n or "parts" in n) for n in names), f"missing parts line in {names}"
        assert any("tap replacement" in n and ("service" in n or "labour" in n) for n in names), f"missing labour line in {names}"
        assert "additional" in tier_labels, f"tier_label missing 'Additional work': {tier_labels}"
        # Totals
        total = float(bd.get("total") or b.get("total") or 0)
        assert total >= 1700, f"total {total} does not include additional (expected ~1714.40)"
        # balance_due must be 0 (paid)
        assert float(bd.get("balance_due") or 0) == 0
        assert bd.get("additional_work") is not None

    def test_azoaddl01_pending_balance_due(self, customer_token):
        bk = _find_booking(customer_token, "AZOADDL01")
        bid = bk["id"]
        r = requests.get(f"{BASE_URL}/api/bookings/{bid}", headers=_h(customer_token), timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        bd = b.get("breakdown") or {}
        items = bd.get("service_items") or bd.get("items") or []
        names = [str(i.get("name", "")).lower() for i in items]
        assert any("tap replacement" in n for n in names), f"additional lines missing: {names}"
        assert abs(float(bd.get("balance_due") or 0) - ADDL_TOTAL) < 0.5, f"balance_due={bd.get('balance_due')}"


# ---------- Invoice tests ----------
class TestCustomerInvoiceAdditional:
    def test_invoice_includes_additional_and_idempotent(self, customer_token):
        bk = _find_booking(customer_token, "AZO432C38")
        bid = bk["id"]
        r = requests.get(f"{BASE_URL}/api/invoices", params={"booking_id": bid},
                         headers=_h(customer_token), timeout=15)
        assert r.status_code == 200, r.text
        lst = r.json()
        invs = lst if isinstance(lst, list) else lst.get("items") or lst.get("invoices") or []
        assert len(invs) >= 1, "no invoice found for booking"
        inv = invs[0]
        inv_id = inv["id"]
        inv_number = inv.get("invoice_number") or inv.get("number")

        # Fetch twice to confirm idempotency
        results = []
        for _ in range(2):
            r = requests.get(f"{BASE_URL}/api/invoices/{inv_id}", headers=_h(customer_token), timeout=15)
            assert r.status_code == 200, r.text
            results.append(r.json())

        a, b = results
        assert (a.get("invoice_number") or a.get("number")) == inv_number
        assert (b.get("invoice_number") or b.get("number")) == inv_number
        assert a.get("line_items") and b.get("line_items")
        assert len(a["line_items"]) == len(b["line_items"]), "line_items duplicated across calls"
        assert float(a["total_amount"]) == float(b["total_amount"]), "total_amount changed"

        # Additional lines present
        li_names = [str(li.get("name") or li.get("desc") or "").lower() for li in a["line_items"]]
        assert any("tap replacement" in n and ("product" in n or "parts" in n) for n in li_names), f"missing parts: {li_names}"
        assert any("tap replacement" in n and ("service" in n or "labour" in n) for n in li_names), f"missing labour: {li_names}"

        # Total includes additional
        total = float(a["total_amount"])
        assert total >= 1700, f"total_amount {total} does not include additional"

        # GST block consistency
        gst = a.get("gst_invoice") or {}
        if gst:
            grand = float(gst.get("grand_total", 0))
            assert abs(grand - total) < 0.5, f"gst grand_total {grand} != total {total}"
            plat_sub = float((gst.get("platform") or {}).get("subtotal", 0))
            part_sub = float((gst.get("partner") or {}).get("subtotal", 0))
            # Subtotals (ex-GST) may be less than grand; sanity check they're positive
            assert plat_sub + part_sub > 0

    def test_invoice_pdf(self, customer_token):
        bk = _find_booking(customer_token, "AZO432C38")
        bid = bk["id"]
        r = requests.get(f"{BASE_URL}/api/invoices", params={"booking_id": bid},
                         headers=_h(customer_token), timeout=15)
        invs = r.json()
        invs = invs if isinstance(invs, list) else invs.get("items") or []
        inv_id = invs[0]["id"]
        r = requests.get(f"{BASE_URL}/api/invoices/{inv_id}/pdf",
                         headers=_h(customer_token), timeout=30)
        assert r.status_code == 200, r.text[:300]
        ctype = r.headers.get("content-type", "").lower()
        assert "pdf" in ctype or r.content[:4] == b"%PDF", f"not a pdf, ctype={ctype}"


# ---------- Partner regression ----------
class TestPartnerNoMerge:
    def test_partner_breakdown_has_no_additional_merged(self, partner_token):
        # Try to GET booking directly by AZO432C38 - partner may own this booking
        # Attempt via list first
        r = requests.get(f"{BASE_URL}/api/bookings", headers=_h(partner_token), timeout=15)
        if r.status_code != 200:
            pytest.skip("partner bookings list not accessible")
        items = r.json()
        items = items if isinstance(items, list) else items.get("items") or items.get("bookings") or []
        target = next((x for x in items if "AZO432C38" in (x.get("code"), x.get("booking_code"), x.get("booking_number"))), None)
        if not target:
            pytest.skip("partner cannot see AZO432C38")
        bid = target["id"]
        r = requests.get(f"{BASE_URL}/api/bookings/{bid}", headers=_h(partner_token), timeout=15)
        assert r.status_code == 200
        bd = r.json().get("breakdown") or {}
        items = bd.get("service_items") or bd.get("items") or []
        tier_labels = " ".join(str(i.get("tier_label", "")).lower() for i in items)
        assert "additional work" not in tier_labels, "partner view should NOT contain additional work merged into breakdown"
