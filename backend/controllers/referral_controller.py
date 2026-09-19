from fastapi import HTTPException
from config.database import db, now_iso
from models.user import build_user, new_id


async def onboard_partner(merchant, req):
    """Merchant registers a partner → permanent lifetime-referral relationship."""
    existing = await db.users.find_one({"phone": req.phone, "role": "partner"}, {"_id": 0})
    if existing:
        if existing.get("referred_by_merchant"):
            raise HTTPException(status_code=400, detail="Partner already referred by another merchant")
        await db.users.update_one({"id": existing["id"]},
                                  {"$set": {"referred_by_merchant": merchant["id"]}})
        partner = existing
    else:
        partner = build_user(req.phone, "partner", req.name, skills=req.skills,
                             service_pincodes=req.service_pincodes, referred_by_merchant=merchant["id"])
        await db.users.insert_one(dict(partner))
        partner.pop("_id", None)
    await db.merchant_partner_referrals.insert_one({
        "id": new_id(), "merchant_id": merchant["id"], "merchant_name": merchant["name"],
        "partner_phone": req.phone, "partner_name": req.name, "partner_id": partner["id"],
        "status": "pending_kyc", "lifetime": True, "total_jobs": 0, "total_commission": 0.0,
        "created_at": now_iso(),
    })
    return {"partner": partner}


async def my_referrals(merchant):
    refs = await db.merchant_partner_referrals.find(
        {"merchant_id": merchant["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    # enrich with live partner status
    for r in refs:
        p = await db.users.find_one({"phone": r["partner_phone"], "role": "partner"},
                                    {"_id": 0, "partner_status": 1, "kyc_status": 1, "jobs_completed": 1, "rating": 1})
        if p:
            r.update({"partner_status": p.get("partner_status"), "kyc_status": p.get("kyc_status"),
                      "jobs_completed": p.get("jobs_completed"), "rating": p.get("rating")})
    return refs


async def merchant_dashboard(merchant):
    refs = await db.merchant_partner_referrals.find({"merchant_id": merchant["id"]}, {"_id": 0}).to_list(500)
    total_referral = sum(r.get("total_commission", 0) for r in refs)
    bookings = await db.bookings.find({"merchant_id": merchant["id"]}, {"_id": 0}).to_list(1000)
    completed = [b for b in bookings if b["status"] in ("completed", "paid")]
    booking_commission = sum(
        (b.get("commission") or {}).get("merchant_booking", 0) for b in completed)
    return {
        "wallet_balance": merchant.get("wallet_balance", 0),
        "referred_partners": len(refs),
        "active_partners": len([r for r in refs if r.get("status") == "active"]),
        "lifetime_referral_earning": round(total_referral, 2),
        "total_bookings": len(bookings),
        "completed_bookings": len(completed),
        "booking_commission_earning": round(booking_commission, 2),
        "total_earning": round(total_referral + booking_commission, 2),
    }



async def merchant_earnings(merchant):
    """Per-booking breakdown of this merchant's referral + customer commissions,
    computed from the immutable commission_ledger (source of truth) — Point 6."""
    mid = merchant["id"]
    rows = await db.commission_ledger.find(
        {"$or": [{"referral_merchant_id": mid}, {"customer_merchant_id": mid}]},
        {"_id": 0}).sort("created_at", -1).to_list(1000)
    items, tot_ref, tot_cust = [], 0.0, 0.0
    for l in rows:
        ref = float(l.get("merchant_referral", 0)) if l.get("referral_merchant_id") == mid else 0.0
        cust = float(l.get("merchant_customer", l.get("merchant_booking", 0))) if l.get("customer_merchant_id") == mid else 0.0
        if ref == 0 and cust == 0:
            continue
        tot_ref += ref
        tot_cust += cust
        rt = l.get("rates") or {}
        items.append({
            "booking_code": l.get("booking_code"), "booking_id": l.get("booking_id"),
            "service_cost": l.get("base", 0), "partner_referral_commission": round(ref, 2),
            "partner_referral_pct": round(float(rt.get("merchant_partner_referral_pct") or 0), 2),
            "customer_commission": round(cust, 2),
            "customer_pct": round(float(rt.get("merchant_customer_pct") or 0), 2),
            "total": round(ref + cust, 2),
            "created_at": l.get("created_at"),
        })
    return {
        "wallet_balance": merchant.get("wallet_balance", 0),
        "total_partner_referral": round(tot_ref, 2),
        "total_customer_commission": round(tot_cust, 2),
        "total_earning": round(tot_ref + tot_cust, 2),
        "count": len(items), "items": items,
    }
