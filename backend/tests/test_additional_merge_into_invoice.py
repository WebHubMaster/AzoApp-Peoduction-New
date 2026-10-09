"""Backend invoice math: ensure PAID rate-card additional work is folded into the
main booking invoice (user chose: single merged invoice, not a separate one).

Rules verified numerically (derived from live settings — not hardcoded):
  (1) product/parts carry NO GST and NO platform commission (100% to partner),
  (2) service/labour carries platform commission,
  (3) GST = platform_commission_on_labour * gst_pct.

Also:
  • CUSTOMER view: total_amount == original booking total + additional total (= parts + labour + gst).
  • PARTNER  view: role_earning.net == main partner net + additional partner_earning
                   AND role_earning.additional_earning == additional partner_earning
                   AND platform commission / Convenience / Platform fees NOT exposed.
  • Idempotency: regenerating does not double-count the additional work.
"""
import os
import sys
import uuid
import asyncio
import pytest

# Ensure the backend package is importable when pytest is invoked from /app.
sys.path.insert(0, "/app/backend")
# load_dotenv already runs in config.database, but xdist worker subprocess
# does not inherit env; load it explicitly so os.environ['MONGO_URL'] exists.
from dotenv import load_dotenv  # noqa: E402
load_dotenv("/app/backend/.env")

from config.database import db, get_settings, now_iso  # noqa: E402
from services.invoice_service import (                 # noqa: E402
    ensure_booking_invoice,
    prepare_for_role,
)
from controllers.booking_controller import _recompute_additional  # noqa: E402


# ------------------------------------------------------------------ helpers
async def _seed(booking_total=1000.0, main_partner_earning=600.0,
                main_partner_pct=60, parts=399.0, labour=150.0):
    """Insert a completed booking + main commission_ledger row + additional_work
    ledger row that mirror what complete_job writes in production. Returns the
    seeded ids so the test can clean them up afterwards."""
    settings = await get_settings()
    gst_pct = float(settings.get("gst_pct", 18) or 18)

    booking_id = f"TEST_bk_{uuid.uuid4().hex[:10]}"
    code = f"TESTBK{uuid.uuid4().hex[:6].upper()}"
    customer_id = f"TEST_cust_{uuid.uuid4().hex[:8]}"
    partner_id = f"TEST_prt_{uuid.uuid4().hex[:8]}"

    additional = {
        "status": "paid",
        "items": [{"description": "Pipe + wrench service",
                   "part_charge": parts, "labour_charge": labour}],
    }
    booking = {
        "id": booking_id,
        "code": code,
        "status": "completed",
        "payment_status": "paid",
        "customer_id": customer_id,
        "partner_id": partner_id,
        "customer_name": "TEST Customer",
        "service_name": "TEST Plumbing",
        "category_name": "Plumbing",
        "commission_config": {"commission": {"partner_pct": main_partner_pct}},
        "pricing": {
            "base": booking_total - 100,  # subtotal
            "subtotal": booking_total - 100,
            "gst": 100,
            "total": booking_total,
            "commissionable_base": booking_total - 100,
            "gst_pct": gst_pct,
            "partner_share": main_partner_earning,
            "visiting_charge": 0,
        },
        "additional": additional,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    # Recompute additional like production does.
    booking["additional"] = await _recompute_additional(booking, settings)

    await db.bookings.insert_one(dict(booking))
    # main ledger row (completion split).
    main_ledger_id = f"TEST_ml_{uuid.uuid4().hex[:8]}"
    await db.commission_ledger.insert_one({
        "id": main_ledger_id, "booking_id": booking_id, "booking_code": code,
        "partner_id": partner_id,
        "base": booking_total - 100,
        "partner_earning": main_partner_earning,
        "partner_total": main_partner_earning,
        "platform_earning": (booking_total - 100) - main_partner_earning,
        "merchant_referral": 0, "merchant_customer": 0,
        "rates": {"partner_pct": main_partner_pct},
        "visiting_charge": 0,
        "gross": booking_total,
        "kind": "booking",
        "created_at": now_iso(),
    })
    # additional_work ledger row (what complete_job inserts).
    addl = booking["additional"]
    addl_ledger_id = f"TEST_al_{uuid.uuid4().hex[:8]}"
    await db.commission_ledger.insert_one({
        "id": addl_ledger_id, "booking_id": booking_id, "booking_code": code,
        "partner_id": partner_id,
        "partner_earning": addl["partner_earning"],
        "platform_earning": addl["platform_earning"],
        "merchant_referral": 0, "merchant_customer": 0,
        "base": addl["parts_total"] + addl["labour_total"],
        "gross": addl["total"],
        "kind": "additional_work",
        "created_at": now_iso(),
    })
    return {
        "booking_id": booking_id,
        "code": code,
        "customer_id": customer_id,
        "partner_id": partner_id,
        "main_ledger_id": main_ledger_id,
        "addl_ledger_id": addl_ledger_id,
        "additional": addl,
        "booking_total": booking_total,
        "main_partner_earning": main_partner_earning,
        "settings": settings,
    }


async def _cleanup(seed):
    await db.bookings.delete_many({"id": seed["booking_id"]})
    await db.commission_ledger.delete_many({"booking_id": seed["booking_id"]})
    await db.invoices.delete_many({"booking_id": seed["booking_id"]})
    await db.transactions.delete_many({"booking_id": seed["booking_id"]})


# ------------------------------------------------------------------ fixture
@pytest.fixture(scope="module")
def seed_and_invoice():
    """Seed once per module, generate the merged invoice, clean up on teardown."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    seed = loop.run_until_complete(_seed())
    booking = loop.run_until_complete(db.bookings.find_one({"id": seed["booking_id"]}, {"_id": 0}))
    inv = loop.run_until_complete(ensure_booking_invoice(booking, seed["settings"]))
    seed["invoice"] = inv
    yield seed, loop
    try:
        loop.run_until_complete(_cleanup(seed))
    finally:
        loop.close()


# ------------------------------------------------------------------ tests
# -- merged breakdown & headline totals -------------------------------
def test_additional_folds_into_invoice_breakdown(seed_and_invoice):
    seed, _loop = seed_and_invoice
    inv = seed["invoice"]
    assert inv is not None, "ensure_booking_invoice returned None"
    addl = seed["additional"]
    bd = inv.get("breakdown") or {}
    aw = bd.get("additional_work") or inv.get("additional_work") or {}
    assert aw, "additional_work block missing on invoice/breakdown"
    assert round(aw["total"], 2) == round(addl["total"], 2)
    assert round(aw["parts_total"], 2) == round(addl["parts_total"], 2)
    assert round(aw["labour_total"], 2) == round(addl["labour_total"], 2)
    assert round(aw["gst"], 2) == round(addl["gst"], 2)

    # The service_items list must have grown with an "Additional work" entry.
    svc_items = bd.get("service_items") or []
    assert any((s.get("additional") or s.get("category") == "Additional work")
               for s in svc_items), "service_items missing additional work rows"

    # line_items must contain additional work entries too (customer-visible lines).
    assert any("Additional work" in (li.get("detail") or "") or "Additional work" in (li.get("desc") or "")
               for li in (inv.get("line_items") or [])), "line_items missing additional work"


def test_headline_subtotal_tax_total_increase(seed_and_invoice):
    seed, _loop = seed_and_invoice
    inv = seed["invoice"]
    addl = seed["additional"]
    # Headline totals must have increased exactly by parts+labour (subtotal),
    # gst (tax), and total.  Original pricing: subtotal 900, gst 100, total 1000.
    assert round(inv["subtotal"] - (900), 2) == round(addl["parts_total"] + addl["labour_total"], 2)
    assert round(inv["tax"] - 100, 2) == round(addl["gst"], 2)
    assert round(inv["total_amount"] - seed["booking_total"], 2) == round(addl["total"], 2)


# -- customer view ----------------------------------------------------
def test_customer_view_total_and_parts_no_tax(seed_and_invoice):
    seed, loop = seed_and_invoice
    inv = seed["invoice"]
    addl = seed["additional"]
    cust = loop.run_until_complete(prepare_for_role(dict(inv), "customer"))

    # total_amount == original booking total + additional total
    assert round(cust["total_amount"], 2) == round(seed["booking_total"] + addl["total"], 2)

    # Customer sees no commission/net fields.
    for forb in ("commission", "partner_earning", "platform_earning",
                 "role_earning", "partner_total"):
        assert forb not in cust, f"customer leaked field {forb}"

    # Parts line items are tagged "no tax" (customer-visible).
    parts_lines = [li for li in (cust.get("line_items") or [])
                   if "product/parts" in (li.get("desc") or "")]
    assert parts_lines, "customer invoice missing product/parts line"
    assert all("no tax" in (li.get("detail") or "").lower() for li in parts_lines)


# -- partner view -----------------------------------------------------
def test_partner_view_role_earning_and_no_platform_fees(seed_and_invoice):
    seed, loop = seed_and_invoice
    inv = seed["invoice"]
    addl = seed["additional"]
    partner_inv = loop.run_until_complete(prepare_for_role(dict(inv), "partner"))

    re = partner_inv.get("role_earning") or {}
    assert re.get("role") == "partner"
    # role_earning.additional_earning present & equals ledger partner_earning.
    assert round(re.get("additional_earning") or 0, 2) == round(addl["partner_earning"], 2)
    # role_earning.net == main partner net + additional partner_earning.
    expected_net = round(seed["main_partner_earning"] + addl["partner_earning"], 2)
    assert round(re["net"], 2) == expected_net, (re["net"], expected_net)

    # Partner MUST NOT see the raw platform commission or convenience/platform fees.
    for forb in ("commission", "commission_pct", "commission_base",
                 "platform_commission", "platform_earning",
                 "convenience_fee", "platform_fee"):
        assert forb not in partner_inv, f"partner leaked field {forb}"


# -- idempotency ------------------------------------------------------
def test_regeneration_is_idempotent_no_double_count(seed_and_invoice):
    seed, loop = seed_and_invoice
    first = seed["invoice"]
    # Re-fetch the booking + call ensure_booking_invoice again.
    booking = loop.run_until_complete(db.bookings.find_one({"id": seed["booking_id"]}, {"_id": 0}))
    second = loop.run_until_complete(ensure_booking_invoice(booking, seed["settings"]))
    # Must return the SAME invoice (uniq_booking_type index) — not a new one.
    assert second["id"] == first["id"], (second["id"], first["id"])
    assert round(second["total_amount"], 2) == round(first["total_amount"], 2)
    # And only ONE invoice doc exists for this booking.
    cnt = loop.run_until_complete(db.invoices.count_documents(
        {"booking_id": seed["booking_id"], "invoice_type": "booking"}))
    assert cnt == 1, f"duplicate invoices created: {cnt}"
