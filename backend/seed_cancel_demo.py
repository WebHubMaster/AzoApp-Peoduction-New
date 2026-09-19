"""Idempotent demo seeder: creates ONE paid + partner-assigned booking that matches
the invoice screenshots (Service 299 + Visiting 100 + GST 71.82 = 470.82) and runs
the REAL cancellation flow so the cancellation snapshot, commission ledger and both
invoices (Cancellation + Refund Receipt) are generated exactly as in production.

Run:  python -m seed_cancel_demo   (from /app/backend)
"""
import asyncio
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from config.database import db, now_iso, get_settings  # noqa: E402
from models.user import new_id  # noqa: E402
from controllers import booking_controller as bc  # noqa: E402

DEMO_CODE = "AZODEMOCX1"


async def main():
    settings = await get_settings()

    # Remove any previous demo run (idempotent).
    old = await db.bookings.find_one({"code": DEMO_CODE}, {"_id": 0, "id": 1})
    if old:
        bid = old["id"]
        await db.bookings.delete_many({"code": DEMO_CODE})
        await db.invoices.delete_many({"booking_id": bid})
        await db.commission_ledger.delete_many({"booking_id": bid})
        await db.refunds.delete_many({"booking_id": bid})
        print("cleared previous demo booking", bid)

    # Target the specific demo accounts used for UI verification so the seeded
    # booking/invoices are visible when logging in as these users.
    customer = await db.users.find_one({"phone": "+919000000004"}, {"_id": 0, "id": 1, "name": 1, "phone": 1})
    partner = await db.users.find_one({"phone": "+919000000003"}, {"_id": 0, "id": 1, "name": 1})
    # Fallbacks if the demo accounts are not present.
    if not customer:
        customer = await db.users.find_one({"role": "customer"}, {"_id": 0, "id": 1, "name": 1, "phone": 1})
    if not partner:
        partner = await db.users.find_one({"role": "partner"}, {"_id": 0, "id": 1, "name": 1})
    if not customer or not partner:
        print("ERROR: need at least one customer and one partner in DB")
        return

    bid = new_id()
    booking = {
        "id": bid,
        "code": DEMO_CODE,
        "customer_id": customer["id"],
        "customer_name": customer.get("name") or "Demo Customer",
        "customer_phone": customer.get("phone") or "+919000000000",
        "service_id": new_id(),
        "service_name": "Fan Installation",
        "category_name": "Electrician",
        "merchant_id": None,
        "merchant_name": None,
        "booking_type": "direct",
        "partner_id": partner["id"],
        "partner_name": partner.get("name") or "Demo Partner",
        "address": {"line": "Gali Number 1, Kashipur", "city": "Samastipur",
                    "state": "Bihar", "pincode": "848101"},
        "schedule_type": "now",
        "scheduled_at": None,
        "notes": "",
        "addons": [],
        "items": [{"service_name": "Fan Installation", "qty": 1, "base_price": 299, "addons": []}],
        # Service 299 + Visiting 100 = subtotal 399 ; GST 71.82 ; Total 470.82
        "pricing": {
            "base": 299, "addons_total": 0, "emergency_fee": 0, "surge": 0,
            "subtotal": 399, "convenience_fee": 0, "platform_fee": 0,
            "visiting_charge": 100, "gst": 71.82, "discount": 0,
            "total": 470.82, "commissionable_base": 399,
        },
        "status": "assigned",
        "payment_status": "paid",
        # partner 80% / platform 20% split, customer refund 80% on cancel
        "commission_config": {
            "partner_commission_pct": 80, "platform_commission_pct": 20,
            "merchant_referral_pct": 0, "merchant_booking_pct": 0,
            "customer_refund_pct": 80, "partner_cancellation_pct": 20,
        },
        "timeline": [{"status": "searching", "at": now_iso()},
                     {"status": "assigned", "at": now_iso()}],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.bookings.insert_one(dict(booking))
    print("created booking", DEMO_CODE, bid, "→ cancelling via real flow…")

    cust_ctx = {"id": customer["id"], "role": "customer"}
    try:
        await bc.cancel_booking(cust_ctx, bid, "Changed my mind")
    except Exception as e:  # noqa: BLE001
        import traceback
        print("cancel_booking raised:", e)
        traceback.print_exc()

    # Report
    b = await db.bookings.find_one({"id": bid}, {"_id": 0})
    c = b.get("cancellation") or {}
    print("\n--- BOOKING after cancel ---")
    print("status:", b.get("status"), "payment_status:", b.get("payment_status"))
    print("cancellation.refund:", c.get("refund"), "refund_pct:", c.get("refund_pct"),
          "cancel_charge:", c.get("cancel_charge"), "original_amount:", c.get("original_amount"))
    invs = await db.invoices.find({"booking_id": bid}, {"_id": 0, "invoice_number": 1,
                                  "invoice_type": 1, "total_amount": 1, "refund": 1}).to_list(10)
    print("\n--- INVOICES ---")
    for i in invs:
        print(i)
    led = await db.commission_ledger.find_one({"booking_id": bid, "kind": "cancellation"},
                                              {"_id": 0, "base": 1, "partner_earning": 1,
                                               "platform_earning": 1, "rates": 1})
    print("\n--- CANCELLATION LEDGER ---")
    print(led)
    print("\nDONE. Partner id:", partner["id"], "| Customer id:", customer["id"])


if __name__ == "__main__":
    asyncio.run(main())
