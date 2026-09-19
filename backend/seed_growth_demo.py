"""Seed demo data for the Growth features: scratch reward pool, combo packages,
referrals and a few scratch cards for the demo customer. Idempotent."""
import asyncio
from uuid import uuid4

from config.database import db, now_iso, get_settings


def nid():
    return str(uuid4())


async def seed_reward_pool():
    pool = [
        {"amount": 20, "label": "₹20 Cashback", "weight": 40},
        {"amount": 50, "label": "₹50 Cashback", "weight": 30},
        {"amount": 100, "label": "₹100 Cashback", "weight": 15},
        {"amount": 200, "label": "₹200 Cashback", "weight": 8},
        {"amount": 500, "label": "₹500 Jackpot!", "weight": 2},
        {"amount": 0, "label": "Better luck next time!", "weight": 25},
    ]
    n = 0
    for r in pool:
        exists = await db.scratch_rewards.find_one({"amount": r["amount"], "label": r["label"]})
        if exists:
            continue
        await db.scratch_rewards.insert_one({
            "id": nid(), "amount": r["amount"], "label": r["label"], "weight": r["weight"],
            "max_quantity": 0, "daily_limit": 0, "active": True,
            "issued_count": 0, "issued_by_day": {}, "created_at": now_iso(),
        })
        n += 1
    print(f"scratch reward pool: +{n} (total {await db.scratch_rewards.count_documents({})})")


async def seed_packages():
    svcs = await db.services.find({}, {"_id": 0, "id": 1, "name": 1, "base_price": 1,
                                       "category_id": 1, "category_name": 1, "image": 1}).to_list(100)
    if len(svcs) < 3:
        print("not enough services to build packages")
        return
    by_cat = {}
    for s in svcs:
        by_cat.setdefault(s.get("category_name"), []).append(s)

    def pick(names_contains, fallback_n=4):
        chosen = []
        for s in svcs:
            if any(k.lower() in (s.get("name") or "").lower() for k in names_contains):
                chosen.append(s)
        if len(chosen) < 2:
            chosen = svcs[:fallback_n]
        return chosen[:4]

    defs = [
        {"name": "Full Home Deep Clean Combo", "short": "4 cleaning services, one unbeatable price",
         "img": "https://images.pexels.com/photos/4239146/pexels-photo-4239146.jpeg",
         "pick": ["clean", "bathroom", "kitchen", "sofa"], "disc": 0.28, "featured": True},
        {"name": "AC Care Combo", "short": "Service + gas check + deep clean for all your ACs",
         "img": "https://images.pexels.com/photos/6474471/pexels-photo-6474471.jpeg",
         "pick": ["ac", "air"], "disc": 0.22, "featured": True},
        {"name": "Kitchen & Bath Combo", "short": "Sparkling kitchen and bathrooms, guaranteed",
         "img": "https://images.pexels.com/photos/6197119/pexels-photo-6197119.jpeg",
         "pick": ["kitchen", "bathroom", "clean"], "disc": 0.2, "featured": False},
    ]
    order = 0
    n = 0
    for d in defs:
        if await db.service_packages.find_one({"name": d["name"]}):
            continue
        chosen = pick(d["pick"])
        items = [{"service_id": s["id"], "qty": 1} for s in chosen]
        original = sum(float(s.get("base_price") or 0) for s in chosen)
        price = round(original * (1 - d["disc"]) / 10) * 10 or round(original * (1 - d["disc"]), 2)
        await db.service_packages.insert_one({
            "id": nid(), "name": d["name"], "slug": d["name"].lower().replace(" ", "-"),
            "short_desc": d["short"],
            "description": f"{d['name']} bundles {len(chosen)} of our most-loved services so you save more and book once.",
            "image": d["img"], "banner": d["img"], "icon": "",
            "category_id": chosen[0].get("category_id"), "category_name": "Combo Package",
            "tags": ["combo", "popular", "save"],
            "items": items, "price": price, "tax_inclusive": False,
            "active": True, "featured": d["featured"], "display_order": order,
            "cities": [], "always_active": True, "start_date": "", "end_date": "",
            "total_quantity": 0, "daily_limit": 0, "per_customer_limit": 0,
            "sold_count": 0, "created_at": now_iso(), "updated_at": now_iso(),
        })
        order += 1
        n += 1
    print(f"packages: +{n} (total {await db.service_packages.count_documents({})})")


async def seed_referrals_and_cards():
    priya = await db.users.find_one({"phone": {"$regex": "9000000004$"}, "role": "customer"}, {"_id": 0})
    if not priya:
        priya = await db.users.find_one({"role": "customer"}, {"_id": 0})
    if not priya:
        print("no customer to seed referrals")
        return
    code = priya.get("referral_code") or ("AZO" + (priya.get("phone") or "0000")[-4:])
    await db.users.update_one({"id": priya["id"]}, {"$set": {"referral_code": code}})

    others = await db.users.find({"role": "customer", "id": {"$ne": priya["id"]}}, {"_id": 0}).to_list(5)
    reward = float(((await get_settings() or {}).get("referral") or {}).get("reward_amount") or 100)
    made = 0
    for i, o in enumerate(others[:3]):
        if await db.referrals.find_one({"referrer_id": priya["id"], "referee_id": o["id"]}):
            continue
        credited = i == 0
        await db.referrals.insert_one({
            "id": nid(), "referrer_id": priya["id"], "referrer_name": priya.get("name"),
            "referrer_code": code, "referee_id": o["id"], "referee_name": o.get("name"),
            "reward_amount": reward, "status": "first_booking" if credited else "joined",
            "referrer_credited": credited, "eligible": True, "created_at": now_iso(),
            "booking_code": "AZO12345" if credited else None,
            "credited_at": now_iso() if credited else None,
        })
        made += 1
    # a couple of scratch cards for Priya (one available, one claimed)
    if await db.scratch_cards.count_documents({"user_id": priya["id"]}) == 0:
        await db.scratch_cards.insert_one({
            "id": nid(), "user_id": priya["id"], "booking_id": nid(), "booking_code": "AZO55010",
            "status": "available", "reward_amount": 50, "reward_id": None,
            "reward_label": "₹50 Cashback", "is_win": True,
            "issued_at": now_iso(), "scratched_at": None, "claimed_at": None, "expires_at": None,
        })
        await db.scratch_cards.insert_one({
            "id": nid(), "user_id": priya["id"], "booking_id": nid(), "booking_code": "AZO55008",
            "status": "claimed", "reward_amount": 20, "reward_id": None,
            "reward_label": "₹20 Cashback", "is_win": True,
            "issued_at": now_iso(), "scratched_at": now_iso(), "claimed_at": now_iso(), "expires_at": None,
        })
    print(f"referrals: +{made}; scratch cards for {priya.get('name')} ensured")


async def main():
    await get_settings()  # ensure defaults (referral/cashback/packages/pwa) exist
    await seed_reward_pool()
    await seed_packages()
    await seed_referrals_and_cards()
    print("growth demo seed complete")


if __name__ == "__main__":
    asyncio.run(main())
