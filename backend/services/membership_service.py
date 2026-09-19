"""Membership subscription system.

- Admin manages tiered plans (price, duration, % discount benefit, perks).
- Customers purchase a plan through the SAME payment rail as bookings
  (real Razorpay when configured, mock fallback in dev).
- An active membership is stored on the user doc (`membership`) and grants an
  automatic % discount on every booking (applied at checkout + on the charged
  booking, platform-absorbed so partner earnings are unaffected).
"""
import re
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException
from config.database import db, now_iso
from models.user import new_id
from services import payment_service

COLL = "membership_plans"


def _slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-") or new_id()[:8]


def _public(plan: dict) -> dict:
    if not plan:
        return plan
    plan.pop("_id", None)
    return plan


# ---------------- Admin plan CRUD ----------------
async def list_plans(active_only: bool = False) -> list:
    q = {"status": "active"} if active_only else {}
    rows = await db[COLL].find(q, {"_id": 0}).to_list(200)
    rows.sort(key=lambda p: (p.get("sort_order", 0), p.get("price", 0)))
    return rows


async def get_plan(plan_id: str, active_only: bool = False) -> dict:
    q = {"id": plan_id}
    if active_only:
        q["status"] = "active"
    p = await db[COLL].find_one(q, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Membership plan not found")
    return p


async def get_plan_by_slug(slug: str) -> dict:
    p = await db[COLL].find_one({"slug": slug}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Membership plan not found")
    return p


def _validate(data: dict):
    if not (data.get("name") or "").strip():
        raise HTTPException(status_code=400, detail="Plan name is required")
    if float(data.get("price", 0) or 0) < 0:
        raise HTTPException(status_code=400, detail="Price cannot be negative")
    if int(data.get("duration_days", 0) or 0) <= 0:
        raise HTTPException(status_code=400, detail="Duration (days) must be greater than 0")
    pct = float(data.get("discount_pct", 0) or 0)
    if pct < 0 or pct > 100:
        raise HTTPException(status_code=400, detail="Discount % must be between 0 and 100")


async def create_plan(data: dict) -> dict:
    _validate(data)
    doc = {
        "id": new_id(),
        "slug": _slugify(data.get("name")),
        "name": data["name"].strip(),
        "tagline": data.get("tagline", "") or "",
        "description": data.get("description", "") or "",
        "price": round(float(data.get("price", 0) or 0), 2),
        "original_price": round(float(data.get("original_price", 0) or 0), 2),
        "duration_days": int(data.get("duration_days", 365) or 365),
        "discount_pct": round(float(data.get("discount_pct", 0) or 0), 2),
        "max_discount_per_booking": round(float(data.get("max_discount_per_booking", 0) or 0), 2),
        "free_visits": int(data.get("free_visits", 0) or 0),
        "priority_support": bool(data.get("priority_support", False)),
        "benefits": [b for b in (data.get("benefits") or []) if str(b).strip()],
        "badge": data.get("badge", "") or "",
        "color": data.get("color", "#4f46e5") or "#4f46e5",
        "icon": data.get("icon", "crown") or "crown",
        "sort_order": int(data.get("sort_order", 0) or 0),
        "status": data.get("status", "active") or "active",
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    # ensure slug uniqueness
    if await db[COLL].find_one({"slug": doc["slug"]}):
        doc["slug"] = f"{doc['slug']}-{new_id()[:4]}"
    await db[COLL].insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


async def update_plan(plan_id: str, data: dict) -> dict:
    existing = await get_plan(plan_id)
    merged = {**existing, **{k: v for k, v in data.items() if v is not None}}
    _validate(merged)
    upd = {k: v for k, v in data.items() if v is not None}
    if "benefits" in upd:
        upd["benefits"] = [b for b in upd["benefits"] if str(b).strip()]
    if "name" in upd and upd["name"] != existing.get("name"):
        upd["slug"] = _slugify(upd["name"])
        if await db[COLL].find_one({"slug": upd["slug"], "id": {"$ne": plan_id}}):
            upd["slug"] = f"{upd['slug']}-{new_id()[:4]}"
    upd["updated_at"] = now_iso()
    await db[COLL].update_one({"id": plan_id}, {"$set": upd})
    return await get_plan(plan_id)


async def delete_plan(plan_id: str) -> dict:
    await get_plan(plan_id)
    await db[COLL].delete_one({"id": plan_id})
    return {"ok": True}


# ---------------- Membership state on the user ----------------
def _is_active(m: dict) -> bool:
    if not m or m.get("status") != "active":
        return False
    exp = m.get("expires_at")
    if not exp:
        return True
    try:
        return datetime.fromisoformat(exp) > datetime.now(timezone.utc)
    except Exception:
        return True


async def get_active_membership(user_id: str) -> dict | None:
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "membership": 1})
    m = (u or {}).get("membership")
    return m if _is_active(m) else None


async def my_membership(user: dict) -> dict:
    m = await get_active_membership(user["id"])
    if m:
        _ft = int(m.get("free_visits", 0) or 0)
        _us = int(m.get("used_free_visits", 0) or 0)
        m["free_visits_left"] = max(0, _ft - _us)
    plans = await list_plans(active_only=True)
    purchases = await db.membership_purchases.find(
        {"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    # total saved so far via membership discount on bookings
    saved = 0.0
    async for b in db.bookings.aggregate([
        {"$match": {"customer_id": user["id"], "pricing.membership_discount": {"$gt": 0}}},
        {"$group": {"_id": None, "s": {"$sum": "$pricing.membership_discount"}}},
    ]):
        saved = round(b.get("s", 0), 2)
    return {"active": bool(m), "membership": m, "plans": plans,
            "purchases": purchases, "total_saved": saved}


async def _activate(user: dict, plan: dict, method: str, amount: float,
                    razorpay_order_id: str = None, razorpay_payment_id: str = None) -> dict:
    start = datetime.now(timezone.utc)
    expires = start + timedelta(days=int(plan.get("duration_days", 365)))
    membership = {
        "plan_id": plan["id"], "plan_name": plan["name"], "slug": plan.get("slug"),
        "discount_pct": float(plan.get("discount_pct", 0)),
        "max_discount_per_booking": float(plan.get("max_discount_per_booking", 0)),
        "free_visits": int(plan.get("free_visits", 0)),
        "used_free_visits": 0,
        "priority_support": bool(plan.get("priority_support", False)),
        "badge": plan.get("badge", ""), "color": plan.get("color", "#4f46e5"),
        "status": "active", "started_at": start.isoformat(), "expires_at": expires.isoformat(),
    }
    purchase = {
        "id": new_id(), "user_id": user["id"], "user_name": user.get("name"),
        "user_phone": user.get("phone"), "plan_id": plan["id"], "plan_name": plan["name"],
        "amount": round(float(amount), 2), "method": method, "status": "paid",
        "razorpay_order_id": razorpay_order_id, "razorpay_payment_id": razorpay_payment_id,
        "started_at": start.isoformat(), "expires_at": expires.isoformat(),
        "created_at": now_iso(),
    }
    membership["purchase_id"] = purchase["id"]
    await db.users.update_one({"id": user["id"]}, {"$set": {"membership": membership}})
    await db.membership_purchases.insert_one(dict(purchase))
    purchase.pop("_id", None)
    if amount > 0:
        await db.transactions.insert_one({
            "id": new_id(), "user_id": user["id"], "amount": round(float(amount), 2),
            "type": "debit", "kind": "membership",
            "note": f"{plan['name']} membership purchase", "created_at": now_iso()})
    try:
        from services import notification_service
        await notification_service.notify(
            user["id"], "Membership activated \U0001F389",
            f"Your {plan['name']} membership is active. Enjoy {plan.get('discount_pct', 0)}% off every booking!",
            link="/account", data={"plan_id": plan["id"]})
    except Exception:
        pass
    return purchase


async def purchase_order(user: dict, plan_id: str) -> dict:
    plan = await get_plan(plan_id, active_only=True)
    amt = round(float(plan.get("price", 0) or 0), 2)
    if amt <= 0:
        pur = await _activate(user, plan, method="free", amount=0)
        return {"mock": True, "free": True, "amount": 0, "plan": _public(plan), "purchase_id": pur["id"]}
    receipt = f"MEMB-{user['id'][:8]}"
    order = await payment_service.create_order(amt, receipt)
    if not order:
        return {"mock": True, "amount": amt, "plan": _public(plan)}
    return {"mock": False, "amount": amt, "plan": _public(plan), **order}


async def purchase_verify(user: dict, plan_id: str, order_id: str,
                          payment_id: str, signature: str) -> dict:
    ok = await payment_service.verify_signature(order_id, payment_id, signature)
    if not ok:
        raise HTTPException(status_code=400, detail="Payment verification failed")
    plan = await get_plan(plan_id, active_only=True)
    await _activate(user, plan, method="razorpay", amount=plan.get("price", 0),
                    razorpay_order_id=order_id, razorpay_payment_id=payment_id)
    return {"ok": True, "membership": await my_membership(user)}


async def purchase_mock(user: dict, plan_id: str) -> dict:
    if await payment_service.is_configured():
        raise HTTPException(status_code=400, detail="Live payments enabled \u2014 use the payment gateway")
    plan = await get_plan(plan_id, active_only=True)
    await _activate(user, plan, method="mock", amount=plan.get("price", 0))
    return {"ok": True, "membership": await my_membership(user)}


# ---------------- Checkout benefit ----------------
def discount_for(membership: dict, pricing: dict) -> float:
    """Membership discount amount for a booking's pricing block (platform-absorbed)."""
    if not membership:
        return 0.0
    pct = float(membership.get("discount_pct", 0) or 0)
    if pct <= 0:
        return 0.0
    base = float(pricing.get("commissionable_base") or pricing.get("base") or 0)
    disc = round(base * pct / 100, 2)
    cap = float(membership.get("max_discount_per_booking", 0) or 0)
    if cap > 0:
        disc = min(disc, cap)
    net = float(pricing.get("taxable") or pricing.get("commissionable_base") or 0)
    disc = max(0.0, min(disc, net))
    return round(disc, 2)


async def apply_to_pricing(customer: dict, pricing: dict) -> dict:
    """Mutate a pricing dict in place to include active membership benefits.

    Benefits (both are pre-tax discounts, like a coupon — GST + commission are then
    recomputed on the net amount via PricingEngine.finalize):
      1) % discount on the tax-excluded amount (capped by max_discount_per_booking)
      2) free visiting charge — waives the visiting_charge for the first N bookings
         (N = plan.free_visits). Consumption happens on payment success, not preview.
    """
    if not customer or not customer.get("id"):
        return pricing
    m = await get_active_membership(customer["id"])
    if not m:
        return pricing
    from services.engines import PricingEngine
    from config.database import get_settings
    settings = await get_settings()

    # 1) percentage discount
    disc = discount_for(m, pricing)
    if disc > 0:
        pricing["membership_discount"] = disc
        pricing["membership_plan"] = m.get("plan_name")
        pricing["membership_discount_pct"] = m.get("discount_pct")

    # 2) free visiting charge waiver (only if visits remaining and a charge exists)
    free_total = int(m.get("free_visits", 0) or 0)
    used = int(m.get("used_free_visits", 0) or 0)
    left = max(0, free_total - used)
    vc = float(pricing.get("visiting_charge", 0) or 0)
    if free_total > 0 and left > 0 and vc > 0:
        pricing["membership_visit_waiver"] = round(vc, 2)
        pricing["membership_free_visits_left"] = left
        pricing["membership_plan"] = m.get("plan_name")

    return PricingEngine.finalize(pricing, settings.get("gst_pct", 0))


async def consume_free_visit(user_id: str, booking: dict) -> None:
    """Consume one free visiting charge once a booking that used the waiver is paid.

    Idempotent: guarded by the booking's `membership_visit_consumed` flag.
    """
    if not user_id or not booking:
        return
    pr = booking.get("pricing") or {}
    if float(pr.get("membership_visit_waiver", 0) or 0) <= 0:
        return
    if booking.get("membership_visit_consumed"):
        return
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "membership": 1})
    if not (u and _is_active((u or {}).get("membership"))):
        return
    await db.users.update_one({"id": user_id}, {"$inc": {"membership.used_free_visits": 1}})
    await db.bookings.update_one({"id": booking["id"]}, {"$set": {"membership_visit_consumed": True}})


# ---------------- Admin analytics ----------------
def _days_left(expires_at: str) -> int:
    if not expires_at:
        return 9999
    try:
        exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        return int((exp - datetime.now(timezone.utc)).total_seconds() // 86400)
    except Exception:
        return 9999


async def admin_subscribers() -> dict:
    users = await db.users.find(
        {"membership": {"$exists": True, "$ne": None}},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1, "membership": 1}).to_list(5000)
    # map latest purchase per user for amount + payment info
    purchases = await db.membership_purchases.find({}, {"_id": 0}).to_list(20000)
    pmap: dict = {}
    for p in purchases:
        uid = p.get("user_id")
        if uid not in pmap or (p.get("created_at") or "") > (pmap[uid].get("created_at") or ""):
            pmap[uid] = p
    rows = []
    active = expiring_soon = expired = 0
    revenue = 0.0
    for u in users:
        m = u.get("membership") or {}
        is_active = _is_active(m)
        dleft = _days_left(m.get("expires_at"))
        pur = pmap.get(u["id"], {})
        amount = float(pur.get("amount", 0) or 0)
        revenue += amount
        if is_active:
            active += 1
            if 0 <= dleft <= 7:
                expiring_soon += 1
        else:
            expired += 1
        rows.append({
            "user_id": u["id"], "name": u.get("name"), "phone": u.get("phone"),
            "email": u.get("email"), "plan_name": m.get("plan_name"),
            "discount_pct": m.get("discount_pct"),
            "amount_paid": amount, "method": pur.get("method") or "—",
            "payment_status": pur.get("status") or ("paid" if amount > 0 else "free"),
            "auto_renew": bool(m.get("auto_renew", False)),
            "status": "active" if is_active else "expired",
            "days_left": dleft if is_active else 0,
            "started_at": m.get("started_at"), "expires_at": m.get("expires_at"),
        })
    rows.sort(key=lambda r: r.get("started_at") or "", reverse=True)
    return {"rows": rows, "total": len(rows), "active": active, "expired": expired,
            "expiring_soon": expiring_soon, "revenue": round(revenue, 2)}


async def admin_analytics() -> dict:
    purchases = await db.membership_purchases.find({"status": "paid"}, {"_id": 0}).to_list(10000)
    revenue = round(sum(p.get("amount", 0) for p in purchases), 2)
    plans = await list_plans(active_only=False)
    plan_meta = {p["name"]: p for p in plans}
    by_plan: dict = {}
    # renewals: a user with >1 purchase of the same plan
    user_plan_counts: dict = {}
    for p in purchases:
        key = (p.get("user_id"), p.get("plan_name"))
        user_plan_counts[key] = user_plan_counts.get(key, 0) + 1
    renewals_total = 0
    for p in purchases:
        name = p.get("plan_name") or "Plan"
        e = by_plan.setdefault(name, {"plan": name, "count": 0, "revenue": 0, "renewals": 0,
                                      "subscribers": 0})
        e["count"] += 1
        e["revenue"] = round(e["revenue"] + p.get("amount", 0), 2)
    # count renewals (purchases beyond the first for a user+plan)
    for (uid, name), cnt in user_plan_counts.items():
        if cnt > 1 and name:
            r = by_plan.get(name)
            if r:
                r["renewals"] += (cnt - 1)
                renewals_total += (cnt - 1)
    subs = await admin_subscribers()
    # subscriber counts per plan (current)
    for row in subs["rows"]:
        pn = row.get("plan_name")
        if pn in by_plan:
            by_plan[pn]["subscribers"] += 1
    for name, e in by_plan.items():
        e["renewal_rate"] = round((e["renewals"] / e["count"]) * 100, 1) if e["count"] else 0.0
        e["avg_revenue"] = round(e["revenue"] / e["count"], 2) if e["count"] else 0.0
        e["discount_pct"] = float((plan_meta.get(name) or {}).get("discount_pct", 0) or 0)
    total_purchases = len(purchases)
    renewal_rate = round((renewals_total / total_purchases) * 100, 1) if total_purchases else 0.0
    avg_value = round(revenue / total_purchases, 2) if total_purchases else 0.0
    # estimated savings delivered to members from booking discounts
    disc_agg = await db.bookings.aggregate([
        {"$match": {"pricing.membership_discount": {"$gt": 0}}},
        {"$group": {"_id": None, "s": {"$sum": "$pricing.membership_discount"}}}]).to_list(1)
    savings = round(disc_agg[0]["s"], 2) if disc_agg else 0.0
    # monthly purchase series (last 6 months)
    series: dict = {}
    for p in purchases:
        mth = (p.get("created_at") or "")[:7]
        if mth:
            series[mth] = series.get(mth, {"month": mth, "purchases": 0, "revenue": 0})
            series[mth]["purchases"] += 1
            series[mth]["revenue"] = round(series[mth]["revenue"] + p.get("amount", 0), 2)
    series_list = sorted(series.values(), key=lambda x: x["month"])[-6:]
    return {"revenue": revenue, "total_purchases": total_purchases,
            "active_members": subs["active"], "expired_members": subs["expired"],
            "expiring_soon": subs["expiring_soon"], "renewals": renewals_total,
            "renewal_rate": renewal_rate, "avg_membership_value": avg_value,
            "discount_given": savings, "savings_delivered": savings,
            "series": series_list,
            "by_plan": sorted(by_plan.values(), key=lambda x: x["revenue"], reverse=True)}
