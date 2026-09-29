"""Idempotent seed: a Maid category + a recurring (subscription) Maid service with
daily/weekly/monthly plans, so the customer app shows the Recurring Subscription
plan picker for the maid category. Also tags seeded maid partners with the 'maid' skill."""
import asyncio
from config.database import db, now_iso
from models.user import new_id

CAT_ID = "cat-maid"
SVC_ID = "svc-maid-fulltime"

PLANS = [
    {"plan_type": "daily", "label": "Daily", "price": 400, "duration_days": 1, "weekly_offs": []},
    {"plan_type": "weekly", "label": "Weekly", "price": 2200, "duration_days": 7, "weekly_offs": [6]},
    {"plan_type": "monthly", "label": "Monthly", "price": 8000, "duration_days": 30, "weekly_offs": [6]},
]


async def main():
    cat = await db.categories.find_one({"id": CAT_ID}, {"_id": 0})
    if not cat:
        await db.categories.insert_one({
            "id": CAT_ID, "name": "Maid Services", "slug": "maid-services",
            "icon": "sparkles", "image": "", "status": "active",
            "show_on_home": True, "order": 1, "created_at": now_iso()})
        print("created category Maid Services")
    else:
        await db.categories.update_one({"id": CAT_ID}, {"$set": {"status": "active", "show_on_home": True}})

    svc = {
        "id": SVC_ID, "name": "Full-time Maid", "slug": "full-time-maid",
        "category_id": CAT_ID, "category_name": "Maid Services",
        "short_description": "Recurring maid service — daily, weekly or monthly plans.",
        "description": "Book a verified maid on a recurring plan. The maid visits every working day, and attendance is captured by location.",
        "image": "", "base_price": 400, "discounted_price": 0, "price_type": "plan",
        "duration_min": 60, "status": "active", "approval_status": "approved",
        "is_subscription": True, "subscription_plans": PLANS,
        "required_skill": "maid", "tax_pct": 0, "show_on_home": True,
        "is_featured": True, "rating": 4.8, "rating_count": 120,
        "created_at": now_iso(),
    }
    existing = await db.services.find_one({"id": SVC_ID}, {"_id": 0})
    if existing:
        await db.services.update_one({"id": SVC_ID}, {"$set": {
            "is_subscription": True, "subscription_plans": PLANS, "status": "active",
            "approval_status": "approved", "category_id": CAT_ID, "category_name": "Maid Services",
            "required_skill": "maid"}})
        print("updated subscription service")
    else:
        await db.services.insert_one(dict(svc))
        print("created subscription service Full-time Maid")

    res = await db.users.update_many(
        {"role": "partner", "name": {"$regex": "Devi|Sharma|Bai|Kumari|maid", "$options": "i"}},
        {"$addToSet": {"skills": "maid"}})
    print("tagged maid skill on", res.modified_count, "partners")
    # Ensure at least the primary demo partner is a maid.
    await db.users.update_one({"phone": "+919000000003"}, {"$addToSet": {"skills": "maid"}})


if __name__ == "__main__":
    asyncio.run(main())
