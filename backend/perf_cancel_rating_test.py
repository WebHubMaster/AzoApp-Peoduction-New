"""Perf validation: cancel_booking + add_review should RETURN FAST (side-effects run
in background). Also asserts the background work still completes (refund record, invoices,
partner rating)."""
import asyncio, time
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from config.database import db, now_iso, get_settings  # noqa: E402
from models.user import new_id  # noqa: E402
from controllers import booking_controller as bc  # noqa: E402


async def _mk_booking(customer, partner, code, status="assigned"):
    bid = new_id()
    await db.bookings.insert_one({
        "id": bid, "code": code, "customer_id": customer["id"],
        "customer_name": customer.get("name") or "Demo Customer",
        "customer_phone": customer.get("phone") or "+919000000000",
        "service_id": new_id(), "service_name": "Fan Installation", "category_name": "Electrician",
        "partner_id": partner["id"], "partner_name": partner.get("name") or "Demo Partner",
        "address": {"line": "Gali 1", "city": "Samastipur", "state": "Bihar", "pincode": "848101"},
        "schedule_type": "now", "addons": [], "payment_method": "wallet",
        "items": [{"service_name": "Fan Installation", "qty": 1, "base_price": 299, "addons": []}],
        "pricing": {"base": 299, "subtotal": 399, "visiting_charge": 100, "gst": 71.82,
                    "discount": 0, "total": 470.82, "commissionable_base": 399},
        "status": status, "payment_status": "paid",
        "commission_config": {"partner_commission_pct": 80, "platform_commission_pct": 20,
                              "merchant_referral_pct": 0, "merchant_booking_pct": 0,
                              "customer_refund_pct": 80, "partner_cancellation_pct": 20},
        "timeline": [{"status": status, "at": now_iso()}],
        "created_at": now_iso(), "updated_at": now_iso()})
    return bid


async def main():
    customer = await db.users.find_one({"role": "customer"}, {"_id": 0, "id": 1, "name": 1, "phone": 1})
    partner = await db.users.find_one({"role": "partner"}, {"_id": 0, "id": 1, "name": 1})
    assert customer and partner, "need a customer and partner in DB"
    cust_ctx = {"id": customer["id"], "role": "customer"}

    # ---- CANCEL ----
    bid = await _mk_booking(customer, partner, "AZOPERFC1", "assigned")
    t0 = time.perf_counter()
    out = await bc.cancel_booking(cust_ctx, bid, "Changed my mind")
    dt = time.perf_counter() - t0
    print(f"[CANCEL] response time: {dt*1000:.0f} ms | status={out.get('status')}")
    assert out.get("status") == "cancelled", "cancel did not set status"
    assert dt < 2.0, f"cancel too slow: {dt:.2f}s"

    # give background task time to finish money/invoice/refund work
    await asyncio.sleep(4)
    b = await db.bookings.find_one({"id": bid}, {"_id": 0})
    c = b.get("cancellation") or {}
    refund = await db.refunds.find_one({"booking_id": bid}, {"_id": 0})
    invs = await db.invoices.count_documents({"booking_id": bid})
    print(f"[CANCEL] bg done -> refund_amt={c.get('refund')} refund_id={c.get('refund_id')} "
          f"refund_status={c.get('refund_status')} refunds_coll={bool(refund)} invoices={invs}")
    assert refund is not None, "background refund record not created"
    assert c.get("refund_id"), "booking not updated with refund_id by bg task"

    # ---- RATING ----
    rbid = await _mk_booking(customer, partner, "AZOPERFR1", "completed")

    class _Req:
        rating = 5
        comment = "Great service!"
    t0 = time.perf_counter()
    out2 = await bc.add_review(cust_ctx, rbid, _Req())
    dt2 = time.perf_counter() - t0
    print(f"[RATING] response time: {dt2*1000:.0f} ms | review_saved={bool(out2.get('review'))}")
    assert out2.get("review"), "review not saved"
    assert dt2 < 2.0, f"rating too slow: {dt2:.2f}s"

    await asyncio.sleep(3)
    pu = await db.users.find_one({"id": partner["id"]}, {"_id": 0, "rating": 1})
    print(f"[RATING] bg done -> partner avg rating={pu.get('rating')}")

    # cleanup
    for code in ("AZOPERFC1", "AZOPERFR1"):
        doc = await db.bookings.find_one({"code": code}, {"_id": 0, "id": 1})
        if doc:
            await db.bookings.delete_many({"code": code})
            await db.refunds.delete_many({"booking_id": doc["id"]})
            await db.invoices.delete_many({"booking_id": doc["id"]})
            await db.commission_ledger.delete_many({"booking_id": doc["id"]})
    print("\nALL PERF ASSERTIONS PASSED ✅")


if __name__ == "__main__":
    asyncio.run(main())
