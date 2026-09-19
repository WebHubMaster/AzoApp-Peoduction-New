"""Seed realistic HISTORICAL bookings + commission ledger spread across the last
~90 days so the Admin Dashboard trends, comparisons and analytics render with rich,
dynamic data. Idempotent: every doc is tagged seed_source='dash_history' and the
previous batch is removed before re-inserting.

Run:  python3 seed_dashboard_history.py
"""
import asyncio
import os
import random
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / ".env")
client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

TAG = "dash_history"
random.seed(42)

CITIES = [
    ("Patna", "Bihar", "800001", 25.5941, 85.1376),
    ("Patna", "Bihar", "800002", 25.6100, 85.1440),
    ("Ranchi", "Jharkhand", "834001", 23.3441, 85.3096),
]

# status → weight (business realistic: most jobs complete)
STATUS_WEIGHTS = [
    ("paid", 34), ("completed", 24), ("cancelled", 9), ("searching", 6),
    ("assigned", 6), ("started", 5), ("arrived_customer", 4), ("on_hold", 2),
    ("pending", 4),
]
STATUSES = [s for s, w in STATUS_WEIGHTS for _ in range(w)]


def gst_total(base):
    gst = round(base * 0.18, 2)
    return round(base + gst, 2), gst


async def main():
    services = await db.services.find({}, {"_id": 0, "id": 1, "name": 1, "category_id": 1,
                                            "category_name": 1, "base_price": 1,
                                            "discounted_price": 1}).to_list(500)
    partners = await db.users.find({"role": "partner"}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    customers = await db.users.find({"role": "customer", "seed_source": {"$ne": TAG}}, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(500)
    merchants = await db.users.find({"role": "merchant"}, {"_id": 0, "id": 1, "name": 1}).to_list(500)

    # Cities come ONLY from configured Service Areas (real created data — no invented cities).
    areas = await db.service_areas.find({}, {"_id": 0}).to_list(500)
    _coords = {"patna": (25.5941, 85.1376), "ranchi": (23.3441, 85.3096)}
    cities = []
    for a in areas:
        cty = a.get("city")
        if not cty:
            continue
        pins = a.get("pincodes") or a.get("service_pincodes") or ["000000"]
        lat, lng = _coords.get(cty.lower(), (a.get("lat") or 25.6, a.get("lng") or 85.1))
        cities.append((cty, a.get("state") or "", pins[0], lat, lng))
    if not cities:
        cities = list(CITIES)

    if not services or not customers:
        print("Need services + customers seeded first. Abort.")
        return

    # Synthesise extra demo customers so the dashboard shows many customers.
    demo_names = ["Anita Sharma", "Rahul Mehta", "Sneha Gupta", "Vikram Rao", "Pooja Nair",
                  "Arjun Das", "Kavya Reddy", "Rohan Iyer", "Meera Joshi", "Sahil Khan",
                  "Divya Menon", "Karan Malhotra", "Nisha Verma", "Aditya Bose", "Tanvi Shah"]
    all_customers = list(customers)
    for nm in demo_names:
        all_customers.append({"id": str(uuid.uuid4()), "name": nm,
                              "phone": "+9198" + str(random.randint(10000000, 99999999))})

    now = datetime.now(timezone.utc)

    # wipe previous batch
    await db.bookings.delete_many({"seed_source": TAG})
    await db.commission_ledger.delete_many({"seed_source": TAG})
    await db.payouts.delete_many({"seed_source": TAG})
    await db.users.delete_many({"seed_source": TAG})

    # Register the synthetic demo customers as real user records so the "Customers"
    # KPI and per-customer filters stay consistent with the booking data.
    demo_user_docs = []
    for cu in all_customers:
        if cu in customers:
            continue
        demo_user_docs.append({
            "id": cu["id"], "name": cu["name"], "phone": cu["phone"], "role": "customer",
            "created_at": (now - timedelta(days=random.randint(20, 88))).isoformat(),
            "seed_source": TAG,
        })
    if demo_user_docs:
        await db.users.insert_many(demo_user_docs)

    now = datetime.now(timezone.utc)
    bookings = []
    ledgers = []
    N = 260
    for _ in range(N):
        # weighted towards recent but spread over 90 days
        day_ago = int(abs(random.gauss(0, 30))) % 90
        created = now - timedelta(days=day_ago, hours=random.randint(0, 23), minutes=random.randint(0, 59))
        svc = random.choice(services)
        cust = random.choice(all_customers)
        city, state, pincode, lat, lng = random.choice(cities)
        status = random.choice(STATUSES)
        btype = random.choices(["direct", "merchant"], weights=[7, 3])[0]
        has_partner = status not in ("searching", "pending")
        partner = random.choice(partners) if (partners and has_partner) else None
        merch = random.choice(merchants) if (btype == "merchant" and merchants) else None

        base = svc.get("discounted_price") or svc.get("base_price") or random.choice([299, 499, 699, 999, 1499])
        base = float(base)
        total, gst = gst_total(base)
        pay_status = "paid" if status in ("paid", "completed") else ("failed" if random.random() < 0.06 else "pending")
        code = "AZO" + uuid.uuid4().hex[:6].upper()
        b = {
            "id": str(uuid.uuid4()), "code": code,
            "customer_id": cust["id"], "customer_name": cust["name"],
            "customer_phone": cust.get("phone", ""),
            "service_id": svc["id"], "service_name": svc["name"],
            "category_id": svc.get("category_id", ""), "category_name": svc.get("category_name", ""),
            "merchant_id": (merch or {}).get("id"), "merchant_name": (merch or {}).get("name"),
            "booking_type": btype,
            "partner_id": (partner or {}).get("id"), "partner_name": (partner or {}).get("name"),
            "address": {"line": f"{random.randint(1,120)} Main Road", "city": city, "state": state,
                        "pincode": pincode, "lat": lat, "lng": lng},
            "schedule_type": random.choice(["now", "schedule"]),
            "scheduled_at": None,
            "pricing": {"base": base, "addons_total": 0, "subtotal": base, "gst": gst,
                        "discount": 0, "total": total, "commissionable_base": base},
            "status": status, "payment_status": pay_status,
            "created_at": created.isoformat(), "updated_at": created.isoformat(),
            "seed_source": TAG,
        }
        bookings.append(b)

        if status in ("paid", "completed") and partner:
            partner_earning = round(base * 0.60, 2)
            platform_earning = round(base * 0.32, 2)
            merchant_referral = round(base * 0.05, 2) if merch else 0
            ledgers.append({
                "id": str(uuid.uuid4()), "booking_code": code, "gross": base,
                "partner_earning": partner_earning, "platform_earning": platform_earning,
                "merchant_referral": merchant_referral,
                "created_at": created.isoformat(), "seed_source": TAG,
            })

    await db.bookings.insert_many(bookings)
    if ledgers:
        await db.commission_ledger.insert_many(ledgers)

    # A few pending payouts so "Needs Attention" + Pending Payouts KPI show data.
    payouts = []
    for p in (partners[:5] if partners else []):
        payouts.append({"id": str(uuid.uuid4()), "partner_id": p["id"], "partner_name": p["name"],
                        "amount": round(random.uniform(800, 4200), 2), "status": "pending",
                        "created_at": (now - timedelta(days=random.randint(0, 6))).isoformat(),
                        "seed_source": TAG})
    if payouts:
        await db.payouts.insert_many(payouts)

    print(f"Seeded {len(bookings)} historical bookings, {len(ledgers)} ledger rows, {len(payouts)} pending payouts.")
    print(f"Cities (from Service Areas): {sorted(set(c[0] for c in cities))} · Services: {len(services)} · Partners: {len(partners)} · Customers(incl demo): {len(all_customers)}")


if __name__ == "__main__":
    asyncio.run(main())
