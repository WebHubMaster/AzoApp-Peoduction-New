import asyncio, sys
sys.path.insert(0, '/app/backend')
from dotenv import load_dotenv; load_dotenv('/app/backend/.env')
from config.database import db
from services import invoice_service as inv_svc
from controllers import booking_controller as bc

async def m():
    b = await db.bookings.find_one({"code": "AZO432C38"}, {"_id": 0})
    inv = await db.invoices.find_one({"booking_id": b["id"], "invoice_type": "booking"}, {"_id": 0})
    # simulate a legacy invoice without additional work so the in-place update fires
    base = round(inv["total_amount"] - inv["additional_work"]["total"], 2)
    await db.invoices.update_one({"id": inv["id"]}, {"$unset": {"additional_work": ""},
        "$set": {"total_amount": base, "line_items": [l for l in inv["line_items"] if not l.get("additional")],
                 "breakdown.additional_work": None}})
    n0 = await db.notifications.count_documents({"user_id": b["customer_id"]})
    await inv_svc.get_invoice({"id": b["customer_id"], "role": "customer"}, inv["id"])
    await inv_svc.get_invoice({"id": b["customer_id"], "role": "customer"}, inv["id"])
    await asyncio.sleep(3)
    notes = await db.notifications.find({"user_id": b["customer_id"]}, {"_id": 0, "title": 1, "body": 1}).sort("created_at", -1).to_list(5)
    print("new notifications:", await db.notifications.count_documents({"user_id": b["customer_id"]}) - n0)
    print(notes[:2])
    nb = await db.bookings.find_one({"code": "AZOADDL01"}, {"_id": 0})
    await bc._notify_invoice_updated(nb, nb["additional"]); await asyncio.sleep(2)
    print((await db.notifications.find({"user_id": b["customer_id"]}, {"_id": 0, "body": 1}).sort("created_at", -1).to_list(1)))

asyncio.run(m())
