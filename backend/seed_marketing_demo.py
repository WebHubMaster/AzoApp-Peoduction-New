"""Idempotent demo seeder for the Marketing module (loyalty, offers, memberships, banners).

Run:  python -m seed_marketing_demo   (from /app/backend)
Safe to run multiple times — it clears + reseeds its own demo docs.
"""
import asyncio
import random
from datetime import datetime, timezone, timedelta

from config.database import db, now_iso
from models.user import new_id

random.seed(42)


def iso(dt):
    return dt.isoformat()


FIRST = ["Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Krishna", "Ishaan",
         "Ananya", "Diya", "Aadhya", "Saanvi", "Pari", "Riya", "Meera", "Kavya", "Anika",
         "Rohan", "Kabir", "Neha", "Pooja", "Sneha", "Priya", "Rahul", "Amit", "Sunil", "Deepak",
         "Nikhil", "Karan", "Shreya", "Divya", "Manish", "Rajesh", "Sonia", "Tanvi"]
LAST = ["Sharma", "Verma", "Gupta", "Kumar", "Singh", "Patel", "Reddy", "Nair", "Das", "Jain",
        "Mehta", "Agarwal", "Chopra", "Bose", "Iyer", "Rao"]


async def seed_customers(target=32):
    """Create demo customers (idempotent by phone) so tables have realistic data."""
    existing = await db.users.count_documents({"role": "customer"})
    to_make = max(0, target - existing)
    created = 0
    base = 9100000000
    for i in range(to_make):
        phone = f"+91{base + i}"
        if await db.users.find_one({"phone": phone}):
            continue
        name = f"{random.choice(FIRST)} {random.choice(LAST)}"
        await db.users.insert_one({
            "id": new_id(), "phone": phone, "role": "customer", "name": name,
            "email": f"{name.split()[0].lower()}{i}@example.com", "photo": "", "gender": "",
            "language": "en", "status": "active", "is_demo": True, "addresses": [],
            "wallet_balance": 0, "loyalty_points": 0, "kyc_status": "na",
            "created_at": iso(datetime.now(timezone.utc) - timedelta(days=random.randint(5, 200))),
            "demo_marketing": True,
        })
        created += 1
    return {"customers_created": created}


async def seed_loyalty():
    cfg_rate = 5
    redeem_value = 1.0
    # pick some customers
    customers = await db.users.find(
        {"role": "customer"}, {"_id": 0, "id": 1, "name": 1}).to_list(60)
    if not customers:
        return {"loyalty": "no customers"}
    # reset demo ledger
    await db.loyalty_ledger.delete_many({"demo": True})
    now = datetime.now(timezone.utc)
    names_notes = [
        ("earned", "credit", "Earned on booking"),
        ("earned", "credit", "Earned on booking"),
        ("redeemed", "debit", "Redeemed on booking"),
        ("bonus", "credit", "Welcome bonus"),
        ("adjusted", "credit", "Manual adjustment by admin"),
        ("expired", "debit", "Points expired"),
    ]
    total_by_user = {}
    for cust in customers[:40]:
        bal = 0
        n = random.randint(2, 7)
        for _ in range(n):
            kind, direction, base_note = random.choice(names_notes)
            pts = random.choice([20, 30, 50, 75, 100, 120, 150])
            if direction == "credit":
                bal += pts
            else:
                pts = min(pts, bal)
                if pts <= 0:
                    continue
                bal -= pts
            code = f"AZO{random.randint(10000, 99999)}"
            created = now - timedelta(days=random.randint(0, 85), hours=random.randint(0, 23))
            await db.loyalty_ledger.insert_one({
                "id": new_id(), "user_id": cust["id"], "direction": direction,
                "points": int(pts), "note": f"{base_note} {code}" if "booking" in base_note else base_note,
                "ref_code": code if "booking" in base_note else None,
                "balance_after": bal, "kind": kind,
                "source": random.choice(["system", "admin", "checkout"]),
                "status": "completed", "created_at": iso(created), "demo": True,
            })
        total_by_user[cust["id"]] = bal
    # set current balances on users
    for uid, bal in total_by_user.items():
        await db.users.update_one({"id": uid}, {"$set": {"loyalty_points": int(bal)}})
    return {"loyalty_members": len(total_by_user)}


async def seed_offers():
    now = datetime.now(timezone.utc)
    offers = [
        {"title": "Monsoon 20% Off", "code": "MONSOON20", "discount": 20,
         "discount_label": "20% OFF", "audience": "all", "priority": 1,
         "start_date": iso(now - timedelta(days=10)), "end_date": iso(now + timedelta(days=20)),
         "status": "active", "views": 4200, "clicks": 980, "claims": 420, "conversions": 210,
         "revenue": 189000, "cta_text": "Book Now", "destination": "/services",
         "subtitle": "On all AC services", "image": "https://images.pexels.com/photos/6195274/pexels-photo-6195274.jpeg"},
        {"title": "First Booking ₹100 Off", "code": "FIRST100", "discount": 100,
         "discount_label": "₹100 OFF", "audience": "new", "priority": 2,
         "start_date": iso(now - timedelta(days=30)), "end_date": iso(now + timedelta(days=60)),
         "status": "active", "views": 6100, "clicks": 1520, "claims": 890, "conversions": 610,
         "revenue": 245000, "cta_text": "Claim Offer", "destination": "/services",
         "subtitle": "For first-time customers", "image": "https://images.pexels.com/photos/4239146/pexels-photo-4239146.jpeg"},
        {"title": "Diwali Cleaning Bonanza", "code": "DIWALI30", "discount": 30,
         "discount_label": "30% OFF", "audience": "all", "priority": 1,
         "start_date": iso(now + timedelta(days=15)), "end_date": iso(now + timedelta(days=45)),
         "status": "active", "views": 0, "clicks": 0, "claims": 0, "conversions": 0,
         "revenue": 0, "cta_text": "Notify Me", "destination": "/services",
         "subtitle": "Deep home cleaning", "image": "https://images.pexels.com/photos/4108715/pexels-photo-4108715.jpeg"},
        {"title": "Summer Special (Ended)", "code": "SUMMER15", "discount": 15,
         "discount_label": "15% OFF", "audience": "all", "priority": 3,
         "start_date": iso(now - timedelta(days=120)), "end_date": iso(now - timedelta(days=30)),
         "status": "active", "views": 3300, "clicks": 700, "claims": 300, "conversions": 180,
         "revenue": 96000, "cta_text": "Book", "destination": "/services",
         "subtitle": "Beat the heat", "image": "https://images.pexels.com/photos/5824883/pexels-photo-5824883.jpeg"},
        {"title": "Weekend Flash Sale", "code": "FLASH25", "discount": 25,
         "discount_label": "25% OFF", "audience": "all", "priority": 2,
         "start_date": iso(now - timedelta(days=2)), "end_date": iso(now + timedelta(days=5)),
         "status": "paused", "views": 1200, "clicks": 340, "claims": 120, "conversions": 70,
         "revenue": 42000, "cta_text": "Grab Deal", "destination": "/services",
         "subtitle": "Limited time", "image": "https://images.pexels.com/photos/6197119/pexels-photo-6197119.jpeg"},
        {"title": "Loyalty Members Exclusive", "code": "LOYAL10", "discount": 10,
         "discount_label": "Extra 10% OFF", "audience": "members", "priority": 2,
         "start_date": iso(now - timedelta(days=5)), "end_date": iso(now + timedelta(days=90)),
         "status": "draft", "views": 0, "clicks": 0, "claims": 0, "conversions": 0,
         "revenue": 0, "cta_text": "Book", "destination": "/services",
         "subtitle": "For members only", "image": "https://images.pexels.com/photos/8102631/pexels-photo-8102631.jpeg"},
    ]
    # replace demo offers by code
    for o in offers:
        await db.offers.delete_many({"code": o["code"]})
        await db.offers.insert_one({"id": new_id(), "created_at": now_iso(), **o})
    return {"offers": len(offers)}


async def seed_memberships():
    plans = await db.membership_plans.find({}, {"_id": 0}).to_list(50)
    if not plans:
        return {"memberships": "no plans"}
    customers = await db.users.find(
        {"role": "customer"}, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(80)
    if not customers:
        return {"memberships": "no customers"}
    await db.membership_purchases.delete_many({"demo": True})
    now = datetime.now(timezone.utc)
    chosen = customers[:24]
    count = 0
    for i, cust in enumerate(chosen):
        plan = plans[i % len(plans)]
        # some expired, some active, some expiring soon
        bucket = i % 5
        if bucket == 0:  # expired
            started = now - timedelta(days=400)
            expires = now - timedelta(days=20)
            status = "expired"
        elif bucket == 1:  # expiring soon
            started = now - timedelta(days=360)
            expires = now + timedelta(days=random.randint(1, 7))
            status = "active"
        else:  # active
            started = now - timedelta(days=random.randint(10, 120))
            expires = started + timedelta(days=int(plan.get("duration_days", 365)))
            status = "active"
        amount = float(plan.get("price", 0) or 0)
        membership = {
            "plan_id": plan["id"], "plan_name": plan["name"], "slug": plan.get("slug"),
            "discount_pct": float(plan.get("discount_pct", 0)),
            "max_discount_per_booking": float(plan.get("max_discount_per_booking", 0)),
            "free_visits": int(plan.get("free_visits", 0)), "used_free_visits": random.randint(0, 2),
            "priority_support": bool(plan.get("priority_support", False)),
            "badge": plan.get("badge", ""), "color": plan.get("color", "#0D47A1"),
            "auto_renew": bool(random.random() > 0.5),
            "status": status, "started_at": iso(started), "expires_at": iso(expires),
        }
        await db.users.update_one({"id": cust["id"]}, {"$set": {"membership": membership}})
        # first purchase
        pid = new_id()
        await db.membership_purchases.insert_one({
            "id": pid, "user_id": cust["id"], "user_name": cust.get("name"),
            "user_phone": cust.get("phone"), "plan_id": plan["id"], "plan_name": plan["name"],
            "amount": amount, "method": random.choice(["razorpay", "mock"]), "status": "paid",
            "started_at": iso(started), "expires_at": iso(expires),
            "created_at": iso(started), "demo": True})
        count += 1
        # some renewals (2nd purchase same plan)
        if bucket >= 2 and random.random() > 0.55:
            renew_at = started + timedelta(days=int(plan.get("duration_days", 365)))
            if renew_at < now:
                await db.membership_purchases.insert_one({
                    "id": new_id(), "user_id": cust["id"], "user_name": cust.get("name"),
                    "user_phone": cust.get("phone"), "plan_id": plan["id"], "plan_name": plan["name"],
                    "amount": amount, "method": "razorpay", "status": "paid",
                    "started_at": iso(renew_at), "expires_at": iso(renew_at + timedelta(days=int(plan.get("duration_days", 365)))),
                    "created_at": iso(renew_at), "demo": True})
                count += 1
    return {"membership_purchases": count, "subscribers": len(chosen)}


async def seed_banners():
    banners = await db.banners.find({}, {"_id": 0}).to_list(100)
    positions = ["home_hero", "home_hero", "category_top", "checkout"]
    for i, b in enumerate(banners):
        clicks = random.randint(200, 3000)
        impressions = clicks * random.randint(6, 14)
        await db.banners.update_one({"id": b["id"]}, {"$set": {
            "order": i,
            "position": b.get("position") or positions[i % len(positions)],
            "priority": b.get("priority") or (i + 1),
            "impressions": impressions, "clicks": clicks,
            "conversions": int(clicks * random.uniform(0.05, 0.18)),
            "ctr": round((clicks / impressions) * 100, 2),
            "desktop_image": b.get("desktop_image") or b.get("image"),
            "mobile_image": b.get("mobile_image") or b.get("image"),
            "start_date": b.get("start_date") or iso(datetime.now(timezone.utc) - timedelta(days=10)),
            "end_date": b.get("end_date") or iso(datetime.now(timezone.utc) + timedelta(days=30)),
        }})
    return {"banners": len(banners)}


async def main():
    out = {}
    out.update(await seed_customers())
    out.update(await seed_loyalty())
    out.update(await seed_offers())
    out.update(await seed_memberships())
    out.update(await seed_banners())
    print("Marketing demo seed complete:", out)
    return out


if __name__ == "__main__":
    asyncio.run(main())
