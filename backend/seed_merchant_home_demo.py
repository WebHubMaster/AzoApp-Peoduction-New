"""
Idempotent demo-data enricher for the Merchant Home dashboard.

The Merchant Home 'Earnings snapshot' reads /merchant/dashboard which derives:
  - lifetime_referral_earning  = sum(merchant_partner_referrals.total_commission)
  - booking_commission_earning = sum(bookings.commission.merchant_booking) for completed
  - referred_partners / active_partners = referral docs

The startup seed leaves total_commission = 0 and bookings without merchant_booking
commission, so the home shows all zeros. This script fills realistic demo values
for the demo merchant so the redesigned dashboard looks alive.

Run:  python seed_merchant_home_demo.py
"""
import asyncio
from config.database import db

MERCHANT_PHONE = "+919000000002"


async def main():
    merchant = await db.users.find_one({"phone": MERCHANT_PHONE, "role": "merchant"}, {"_id": 0})
    if not merchant:
        merchant = await db.users.find_one({"role": "merchant"}, {"_id": 0})
    if not merchant:
        print("No merchant found — run the app once to seed base data first.")
        return
    mid = merchant["id"]
    mname = merchant.get("shop_name") or merchant.get("name") or "Merchant"
    print(f"Enriching demo data for merchant {mname} ({mid})")

    # 0) Ensure a richer set of referred partners (idempotent by partner_phone).
    from models.user import new_id
    from config.database import now_iso
    demo_partners = [
        ("+919000000021", "Amit Sharma", "active", "online", 58, 4.9),
        ("+919000000022", "Suresh Verma", "active", "online", 41, 4.7),
        ("+919000000023", "Neha Gupta", "active", "offline", 33, 4.8),
        ("+919000000024", "Vikram Singh", "active", "online", 27, 4.6),
        ("+919000000025", "Pooja Yadav", "pending_kyc", "offline", 8, 4.5),
    ]
    added = 0
    for phone, name, status, pstatus, jobs, rating in demo_partners:
        exists = await db.merchant_partner_referrals.find_one({"merchant_id": mid, "partner_phone": phone})
        if exists:
            continue
        await db.merchant_partner_referrals.insert_one({
            "id": new_id(), "merchant_id": mid, "merchant_name": mname,
            "partner_phone": phone, "partner_name": name, "partner_id": new_id(),
            "status": status, "lifetime": True, "total_jobs": jobs, "jobs_completed": jobs,
            "total_commission": 0.0, "rating": rating, "partner_status": pstatus,
            "kyc_status": "approved" if status == "active" else "pending",
            "created_at": now_iso(),
        })
        added += 1
    if added:
        print(f"  ✓ added {added} demo referred partner(s)")

    # 1) Give each referred partner a realistic lifetime referral commission.
    refs = await db.merchant_partner_referrals.find({"merchant_id": mid}, {"_id": 0}).to_list(500)
    ref_total = 0.0
    for r in refs:
        jobs = int(r.get("total_jobs") or r.get("jobs_completed") or 20)
        # ~₹85 average referral commission per completed job
        commission = round(jobs * 85.0, 2)
        ref_total += commission
        await db.merchant_partner_referrals.update_one(
            {"id": r["id"]},
            {"$set": {"total_commission": commission,
                      "status": r.get("status") if r.get("status") in ("active",) else "active"}},
        )
    print(f"  ✓ referral commission set on {len(refs)} partner(s) · total ₹{round(ref_total,2)}")

    # 2) Ensure completed bookings carry a merchant_booking commission (~5% of amount).
    bookings = await db.bookings.find({"merchant_id": mid}, {"_id": 0}).to_list(1000)
    booking_total = 0.0
    touched = 0
    for b in bookings:
        if b.get("status") not in ("completed", "paid"):
            continue
        amount = float(b.get("amount") or b.get("total") or (b.get("pricing") or {}).get("total") or 1200)
        comm = b.get("commission") or {}
        merchant_booking = round(amount * 0.05, 2)
        comm["merchant_booking"] = merchant_booking
        booking_total += merchant_booking
        touched += 1
        await db.bookings.update_one({"id": b["id"]}, {"$set": {"commission": comm}})
    print(f"  ✓ booking commission set on {touched} completed booking(s) · total ₹{round(booking_total,2)}")

    # 3) Make sure the merchant has a healthy wallet balance for the snapshot.
    if not merchant.get("wallet_balance"):
        await db.users.update_one({"id": mid}, {"$set": {"wallet_balance": round(ref_total + booking_total, 2)}})
        print(f"  ✓ wallet balance set to ₹{round(ref_total + booking_total,2)}")

    print("Done. Merchant Home dashboard will now show live demo earnings.")


if __name__ == "__main__":
    asyncio.run(main())
