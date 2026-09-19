"""Dev-only: seed varied Starter Kit purchases to exercise the admin report
(filters, pagination, date range). Idempotent-ish: clears prior seeded rows
tagged with _seed=True before inserting."""
import asyncio
import os
import random
from datetime import datetime, timezone, timedelta

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

STATUSES = ["processing", "shipped", "out_for_delivery", "delivered"]
METHODS = ["mock", "razorpay"]


def new_id():
    import uuid
    return str(uuid.uuid4())


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    await db.starter_kit_purchases.delete_many({"_seed": True})

    partners = await db.users.find({"role": "partner"}, {"_id": 0}).to_list(100)
    if not partners:
        print("No partner users found; run backend once to seed users.")
        return

    now = datetime.now(timezone.utc)
    rows = []
    for i in range(22):
        p = random.choice(partners)
        created = now - timedelta(days=random.randint(0, 45),
                                  hours=random.randint(0, 23),
                                  minutes=random.randint(0, 59))
        amount = random.choice([999, 999, 999, 1499, 799])
        status = random.choice(STATUSES)
        method = random.choice(METHODS)
        timeline = []
        cursor = created
        for st in STATUSES:
            timeline.append({"status": st, "at": cursor.isoformat()})
            cursor = cursor + timedelta(hours=random.randint(6, 40))
            if st == status:
                break
        rows.append({
            "id": new_id(), "user_id": p["id"], "user_name": p.get("name"),
            "user_phone": p.get("phone"), "amount": float(amount),
            "method": method, "status": "paid",
            "order_id": f"order_{new_id()[:12]}",
            "payment_id": (f"pay_{new_id()[:12]}" if method == "razorpay" else "MOCK"),
            "expires_at": (created + timedelta(days=365)).isoformat(),
            "tracking_status": status,
            "created_at": created.isoformat(),
            "_seed": True,
        })
        # keep the partner's starter_kit timeline in sync for enrichment
        await db.users.update_one(
            {"id": p["id"]},
            {"$set": {"starter_kit.tracking_status": status,
                      "starter_kit.tracking_timeline": timeline}},
        )

    await db.starter_kit_purchases.insert_many(rows)
    print(f"Inserted {len(rows)} seeded starter-kit purchases across {len(partners)} partners.")


if __name__ == "__main__":
    asyncio.run(main())
