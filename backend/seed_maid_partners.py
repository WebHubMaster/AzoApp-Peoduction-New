"""Seed 5 dummy maid partners + demo subscription bookings with attendance history.
Also activates the "Home Maid" subscription service (image/description) and hides
TEST_* subscription services from the catalog. Idempotent — safe to re-run."""
import asyncio
import os
import sys
from datetime import date, datetime, timedelta, timezone

import dotenv

dotenv.load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

SEED_TAG = "maid_demo"

MAIDS = [
    {"name": "Sunita Devi", "phone": "+919000000020", "rating": 4.9, "jobs_completed": 132},
    {"name": "Geeta Sharma", "phone": "+919000000021", "rating": 4.7, "jobs_completed": 98},
    {"name": "Lakshmi Bai", "phone": "+919000000022", "rating": 4.8, "jobs_completed": 115},
    {"name": "Anita Kumari", "phone": "+919000000023", "rating": 4.6, "jobs_completed": 74},
    {"name": "Meena Devi", "phone": "+919000000024", "rating": 4.5, "jobs_completed": 61},
]

HOME_MAID_IMG = ("https://images.unsplash.com/photo-1646980241033-cd7abda2ee88"
                 "?crop=entropy&cs=srgb&fm=jpg&q=85&w=1080")


async def main():
    from config.database import db, now_iso
    from models.user import new_id
    from models.subscription import SubscriptionCreate, DayMarkRequest
    from controllers import subscription_controller as sc

    # ---- 1) Maid partners (idempotent by phone) ----
    maid_ids = {}
    for m in MAIDS:
        ex = await db.users.find_one({"phone": m["phone"]}, {"_id": 0, "id": 1})
        if ex:
            maid_ids[m["name"]] = ex["id"]
            await db.users.update_one({"phone": m["phone"]}, {"$set": {
                "skills": ["maid", "cleaning"], "status": "active", "kyc_status": "approved"}})
            continue
        doc = {
            "id": new_id(), "phone": m["phone"], "role": "partner", "name": m["name"],
            "email": "", "photo": "", "gender": "female", "language": "en",
            "status": "active", "is_demo": True, "seed": SEED_TAG,
            "addresses": [], "wallet_balance": 0.0, "loyalty_points": 0,
            "skills": ["maid", "cleaning"], "service_pincodes": ["800001"],
            "kyc_status": "approved", "partner_status": "online", "availability": "online",
            "rating": m["rating"], "jobs_completed": m["jobs_completed"],
            "city": "Patna", "state": "Bihar",
            "created_at": now_iso(), "onboarding_tour_status": "pending",
        }
        await db.users.insert_one(doc)
        maid_ids[m["name"]] = doc["id"]
        print("created maid:", m["name"], m["phone"])

    # ---- 2) Activate + enrich Home Maid; hide TEST_* subscription services ----
    await db.services.update_one({"name": "Home Maid"}, {"$set": {
        "status": "active",
        "image": HOME_MAID_IMG,
        "short_description": "Daily / Weekly / Monthly / Yearly maid subscription — one upfront payment",
        "description": ("Trained, background-verified home maids for jhadu-pocha, utensils, "
                        "dusting & kitchen help. Subscribe once and the same trusted maid visits "
                        "every day. You pay the full plan amount upfront; daily attendance is "
                        "tracked in-app and a free replacement is arranged if your maid is absent."),
        "highlights": ["Background-verified, trained maids", "Same maid every day",
                       "Free replacement on absent days", "Daily attendance tracked in-app",
                       "Weekly off as per plan"],
    }})
    res = await db.services.update_many(
        {"is_subscription": True, "name": {"$regex": "^TEST"}}, {"$set": {"status": "inactive"}})
    print("deactivated TEST services:", res.modified_count)

    # ---- 3) Demo subscriptions with attendance history ----
    if await db.subscriptions.count_documents({"seed": SEED_TAG}):
        print("demo subscriptions already seeded — skipping")
        return

    svc = await db.services.find_one({"name": "Home Maid"}, {"_id": 0})
    cust = await db.users.find_one({"phone": "+919000000004"}, {"_id": 0})
    if not svc or not cust:
        print("Home Maid service or demo customer missing — aborting")
        return
    addr = (cust.get("addresses") or [None])[0]
    if not addr:
        addr = {"id": new_id(), "label": "Home", "line": "12 MG Road",
                "pincode": "800001", "city": "Patna"}
        await db.users.update_one({"id": cust["id"]}, {"$push": {"addresses": addr}})
    today = date.today()

    async def make_sub(plan_type, days_ago, time_, maid_name, absent_ago=()):
        start = (today - timedelta(days=days_ago)).isoformat()
        sub = await sc.create_subscription(cust, SubscriptionCreate(
            service_id=svc["id"], plan_type=plan_type, start_date=start,
            preferred_time=time_, address_id=addr["id"]))
        await sc.pay_mock(cust, sub["id"])
        await sc.admin_assign_partner(sub["id"], maid_ids[maid_name])
        doc = await db.subscriptions.find_one({"id": sub["id"]}, {"_id": 0})
        for d in doc.get("schedule", []):
            if d["date"] >= today.isoformat() or d.get("status") != "scheduled":
                continue
            ago = (today - date.fromisoformat(d["date"])).days
            st = "maid_absent" if ago in absent_ago else "completed"
            await sc.admin_mark_day(sub["id"], d["date"], DayMarkRequest(status=st, note="seeded demo"))
        await db.subscriptions.update_one({"id": sub["id"]}, {"$set": {"seed": SEED_TAG}})
        doc = await db.subscriptions.find_one({"id": sub["id"]}, {"_id": 0})
        print(f"seeded {plan_type} sub ({doc['code']}) maid={maid_name} "
              f"earned={doc.get('accrued_earning')} absent_adj={doc.get('absent_adjustment')} "
              f"completed={doc.get('completed_days')}/{doc.get('working_days')}")

    await make_sub("monthly", 8, "09:00", "Sunita Devi", absent_ago=(3,))
    await make_sub("weekly", 5, "08:00", "Geeta Sharma")


if __name__ == "__main__":
    asyncio.run(main())
