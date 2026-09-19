"""Idempotent demo seeder for the two report features:
  1. Merchant "My Network" member earnings breakdown (network_member.earning_jobs)
  2. Admin Coupon Platform-Absorption report (coupon_absorption_report)

Run:  python -m scripts.seed_demo_reports        (from /app/backend)

Strategy (all report-compatible, matching CommissionEngine.settle schema):
  • Link 3 partners + 2 customers to the demo merchant (referred_by_merchant / customer_merchant_id).
  • Create completed bookings — a mix of:
      - coupon bookings (pricing.discount>0)  -> drives absorption report + coupon usage
      - merchant-referred partner bookings    -> drives network member earnings (merchant_referral)
      - merchant customer bookings            -> merchant_customer commission (absorption merchant_paid)
  • Write a full commission_ledger row per booking via CommissionEngine.split.
Everything created here is tagged {"seed_demo": True} and wiped + re-created on each run.
"""
import asyncio
import os
import random
import uuid
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

from services.engines import CommissionEngine, PricingEngine  # noqa: E402

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

SEED = {"seed_demo": True}


def now_iso(dt=None):
    return (dt or datetime.now(timezone.utc)).isoformat()


def nid():
    return str(uuid.uuid4())


# (coupon_code, discount_type, value) — must exist in db.coupons (seeded by seed_service)
COUPONS = {
    "AZO50": ("percentage", 50),
    "SAVE100": ("flat", 100),
    "MONSOON20": ("percentage", 20),
}


def coupon_discount(code, base):
    dt, val = COUPONS[code]
    if dt == "percentage":
        return round(base * val / 100.0, 2)
    return round(min(float(val), base), 2)


async def main():
    merchant = await db.users.find_one({"role": "merchant"}, {"_id": 0})
    if not merchant:
        print("No merchant user found — aborting.")
        return
    mid = merchant["id"]
    mcode = merchant.get("merchant_code") or "DEMO"

    partners = await db.users.find(
        {"role": "partner"}, {"_id": 0, "id": 1, "name": 1}).to_list(20)
    customers = await db.users.find(
        {"role": "customer"}, {"_id": 0, "id": 1, "name": 1}).to_list(20)
    if len(partners) < 3 or len(customers) < 3:
        print(f"Need >=3 partners & customers (have {len(partners)}/{len(customers)}) — aborting.")
        return

    # 1) Link 3 partners + 2 customers to the merchant network
    ref_partners = partners[:3]
    for p in ref_partners:
        await db.users.update_one({"id": p["id"]}, {"$set": {"referred_by_merchant": mid}})
    ref_customers = customers[:2]
    for cst in ref_customers:
        await db.users.update_one(
            {"id": cst["id"]},
            {"$set": {"customer_merchant_id": mid, "customer_merchant_code": mcode}})

    # 2) Wipe previous seed docs (idempotent)
    old = await db.bookings.find(SEED, {"_id": 0, "id": 1}).to_list(5000)
    old_ids = [b["id"] for b in old]
    if old_ids:
        await db.commission_ledger.delete_many({"booking_id": {"$in": old_ids}})
    await db.bookings.delete_many(SEED)
    await db.commission_ledger.delete_many(SEED)

    settings = await db.settings.find_one({}, {"_id": 0}) or {}
    gst_pct = float((settings or {}).get("gst_pct", 18) or 18)
    cm = CommissionEngine._cm(settings)

    # 3) Build a mix of completed bookings
    #   plan rows: (coupon_or_None, use_ref_partner, use_ref_customer, base)
    plan = [
        ("AZO50", True, True, 800),
        ("AZO50", True, False, 600),
        ("SAVE100", True, False, 500),
        ("SAVE100", False, True, 450),
        ("MONSOON20", True, True, 1200),
        ("MONSOON20", False, False, 900),
        ("AZO50", True, False, 700),
        ("SAVE100", True, True, 999),
        ("MONSOON20", True, False, 1500),
        (None, True, True, 650),          # no-coupon merchant booking (network only)
        (None, True, False, 350),
        (None, False, True, 480),
    ]

    created = 0
    base_day = datetime.now(timezone.utc)
    for i, (code, use_rp, use_rc, base) in enumerate(plan):
        partner = ref_partners[i % 3] if use_rp else partners[3 + (i % max(1, len(partners) - 3))] if len(partners) > 3 else partners[i % len(partners)]
        customer = ref_customers[i % 2] if use_rc else customers[2 + (i % max(1, len(customers) - 2))] if len(customers) > 2 else customers[i % len(customers)]

        disc = coupon_discount(code, base) if code else 0.0
        pricing = {
            "base": float(base), "addons_total": 0.0, "emergency_fee": 0.0,
            "surge": 0.0, "visiting_charge": 0.0, "convenience_fee": 0.0,
            "platform_fee": 0.0,
        }
        if disc:
            pricing["discount"] = disc
        pricing = PricingEngine.finalize(pricing, gst_pct)

        partner_merchant_id = mid if use_rp else None
        customer_merchant_id = mid if use_rc else None
        base_excl = PricingEngine.commission_base_excl_tax(pricing)
        split = CommissionEngine.split(base_excl, cm, partner_merchant_id, customer_merchant_id)

        bid = nid()
        bcode = f"AZODEMO{1000 + i}"
        created_at = now_iso(base_day - timedelta(days=len(plan) - i, hours=i))
        booking = {
            **SEED,
            "id": bid, "code": bcode, "booking_code": bcode,
            "customer_id": customer["id"], "customer_name": customer.get("name") or "Customer",
            "partner_id": partner["id"],
            "merchant_id": customer_merchant_id,      # customer-via-merchant relationship
            "status": "completed", "payment_status": "paid",
            "coupon_code": code, "pricing": pricing,
            "total_amount": pricing.get("total"),
            "commission_config": {"commission": cm},
            "created_at": created_at, "completed_at": created_at,
            "items": [{"service_id": "demo", "name": "Demo Service", "qty": 1, "price": float(base)}],
        }
        await db.bookings.insert_one(booking)

        ledger = {
            **SEED,
            "id": nid(), "booking_id": bid, "booking_code": bcode,
            "partner_id": partner["id"], "customer_id": customer["id"],
            "partner_earning": split["partner_earning"],
            "visiting_charge": 0.0, "partner_total": split["partner_earning"],
            "platform_gross": split["platform_gross"], "platform_earning": split["platform_earning"],
            "merchant_referral": split["merchant_referral"], "referral_merchant_id": split["referral_merchant_id"],
            "merchant_customer": split["merchant_customer"], "customer_merchant_id": split["customer_merchant_id"],
            "merchant_booking": split["merchant_customer"], "merchant_id": split["customer_merchant_id"],
            "base": split["base"], "gross": float(pricing.get("total") or 0),
            "tax": float(pricing.get("gst") or 0), "rates": split["rates"],
            "kind": "completion", "created_at": created_at,
        }
        await db.commission_ledger.insert_one(ledger)
        created += 1

    print(f"Merchant: {merchant.get('name')} ({mid}) code={mcode}")
    print(f"Linked partners: {[p['id'][:8] for p in ref_partners]}")
    print(f"Linked customers: {[c['id'][:8] for c in ref_customers]}")
    print(f"Created {created} completed demo bookings + ledgers.")
    coupon_bk = await db.bookings.count_documents(
        {**SEED, "coupon_code": {"$nin": [None, ""]}, "pricing.discount": {"$gt": 0}})
    print(f"Coupon bookings (drive absorption report): {coupon_bk}")


if __name__ == "__main__":
    asyncio.run(main())
