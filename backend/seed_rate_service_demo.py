"""Idempotent seed: 3 completed, unrated bookings for demo customer (+919000000004) to test Rate Service."""
import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from config.database import db

SVCS = [("Salon Prime", 3), ("AC Service", 2), ("Plumbing Repair", 1)]


async def main():
    cust = await db.users.find_one({"phone": "+919000000004"}, {"_id": 0})
    part = await db.users.find_one({"role": "partner"}, {"_id": 0})
    for i, (svc, hrs) in enumerate(SVCS):
        code = f"AZORATE{i+1}"
        at = (datetime.now(timezone.utc) - timedelta(hours=hrs)).isoformat()
        await db.bookings.delete_one({"code": code})
        await db.bookings.insert_one({
            "id": str(uuid.uuid4()), "code": code, "customer_id": cust["id"], "customer_name": cust.get("name"),
            "partner_id": part["id"], "partner_name": part.get("name"), "service_name": svc,
            "status": "completed", "payment_status": "paid", "pricing": {"total": 499.0},
            "timeline": [{"status": "completed", "at": at}], "created_at": at, "updated_at": at, "review": None})
    print("seeded", len(SVCS))

asyncio.run(main())
