"""Loyalty points system.

- Customers EARN points automatically when a booking is completed.
- Points can be REDEEMED at checkout for an instant discount (capped so it can
  never wipe out the whole bill).
- Admin configures earn rate / redeem value / limits from Settings.

Config lives on the global settings doc under `loyalty`.
"""
import math
from config.database import db, get_settings, now_iso
from models.user import new_id

DEFAULTS = {
    "enabled": False,        # Loyalty Points system removed — permanently disabled.
    "earn_rate": 5,          # points earned per ₹100 spent
    "redeem_value": 1.0,     # ₹ value of 1 point when redeeming
    "min_redeem_points": 50, # minimum points required to redeem
    "max_redeem_pct": 20,    # max % of an order that points can cover
    "welcome_bonus": 0,      # points granted on first completed booking
}


async def get_config() -> dict:
    s = await get_settings()
    cfg = {**DEFAULTS, **(s.get("loyalty") or {})}
    cfg["enabled"] = False   # hard kill — no earning/redeeming anywhere, DB left dormant
    return cfg


async def update_config(data: dict) -> dict:
    cur = await get_config()
    merged = {**cur, **{k: v for k, v in (data or {}).items() if v is not None}}
    # sanitise
    merged["earn_rate"] = max(0, float(merged.get("earn_rate", 0) or 0))
    merged["redeem_value"] = max(0.0, float(merged.get("redeem_value", 0) or 0))
    merged["min_redeem_points"] = max(0, int(merged.get("min_redeem_points", 0) or 0))
    merged["max_redeem_pct"] = min(100, max(0, float(merged.get("max_redeem_pct", 0) or 0)))
    merged["welcome_bonus"] = max(0, int(merged.get("welcome_bonus", 0) or 0))
    merged["enabled"] = bool(merged.get("enabled", True))
    await db.settings.update_one({"id": "global"}, {"$set": {"loyalty": merged}}, upsert=True)
    return merged


async def get_balance(user_id: str) -> int:
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "loyalty_points": 1})
    return int((u or {}).get("loyalty_points", 0) or 0)


async def _ledger(user_id, direction, points, note, ref_code=None, balance=None):
    await db.loyalty_ledger.insert_one({
        "id": new_id(), "user_id": user_id, "direction": direction,
        "points": int(points), "note": note, "ref_code": ref_code,
        "balance_after": balance, "created_at": now_iso()})


async def me(user: dict) -> dict:
    cfg = await get_config()
    pts = await get_balance(user["id"])
    ledger = await db.loyalty_ledger.find(
        {"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"points": pts, "value": round(pts * cfg["redeem_value"], 2),
            "config": cfg, "ledger": ledger}


async def earn(user_id: str, amount: float, booking_code: str = None) -> int:
    """Credit points for a completed booking. Returns points earned."""
    cfg = await get_config()
    if not cfg["enabled"] or not user_id:
        return 0
    pts = int(math.floor((float(amount or 0) / 100.0) * float(cfg["earn_rate"])))
    # one-time welcome bonus on the first ever earn
    first = await db.loyalty_ledger.find_one({"user_id": user_id, "direction": "credit"})
    if not first and cfg.get("welcome_bonus"):
        pts += int(cfg["welcome_bonus"])
    if pts <= 0:
        return 0
    await db.users.update_one({"id": user_id}, {"$inc": {"loyalty_points": pts}})
    bal = await get_balance(user_id)
    await _ledger(user_id, "credit", pts, f"Earned on booking {booking_code}" if booking_code else "Points earned", booking_code, bal)
    try:
        from services import notification_service
        await notification_service.notify(
            user_id, f"You earned {pts} points \u2b50",
            f"You now have {bal} loyalty points. Redeem them on your next booking!",
            link="/account", data={"points": pts})
    except Exception:
        pass
    return pts


def preview_redeem(cfg: dict, available: int, redeem_points: int, order_total: float) -> dict:
    """Pure calc: how much discount `redeem_points` gives on `order_total`."""
    if not cfg.get("enabled"):
        return {"points_used": 0, "discount": 0.0}
    want = int(redeem_points or 0)
    if want <= 0 or available <= 0:
        return {"points_used": 0, "discount": 0.0}
    if want < cfg["min_redeem_points"]:
        return {"points_used": 0, "discount": 0.0, "error": f"Redeem at least {cfg['min_redeem_points']} points"}
    usable = min(want, available)
    value = usable * float(cfg["redeem_value"])
    cap = float(order_total) * float(cfg["max_redeem_pct"]) / 100.0
    disc = round(min(value, cap, float(order_total)), 2)
    points_used = int(math.ceil(disc / float(cfg["redeem_value"]))) if cfg["redeem_value"] > 0 else 0
    points_used = min(points_used, usable)
    return {"points_used": points_used, "discount": disc}


async def apply_preview(user, pricing: dict, redeem_points: int) -> dict:
    """Preview-only (used in cart-quote): annotate pricing, no deduction."""
    if not user or not user.get("id") or not redeem_points:
        return pricing
    cfg = await get_config()
    avail = await get_balance(user["id"])
    r = preview_redeem(cfg, avail, redeem_points, pricing.get("taxable", pricing.get("total", 0)))
    if r["discount"] > 0:
        from services.engines import PricingEngine
        from config.database import get_settings
        settings = await get_settings()
        pricing["loyalty_discount"] = r["discount"]
        pricing["loyalty_points_used"] = r["points_used"]
        PricingEngine.finalize(pricing, settings.get("gst_pct", 0))
    return pricing


async def apply_redemption(user: dict, booking: dict, redeem_points: int) -> dict:
    """Actually redeem points against a just-created booking (deducts + records)."""
    if not user or not redeem_points:
        return booking
    cfg = await get_config()
    avail = await get_balance(user["id"])
    pricing = booking.get("pricing", {}) or {}
    r = preview_redeem(cfg, avail, redeem_points, pricing.get("taxable", pricing.get("total", 0)))
    if r["discount"] <= 0:
        return booking
    from services.engines import PricingEngine
    from config.database import get_settings
    settings = await get_settings()
    pricing["loyalty_discount"] = r["discount"]
    pricing["loyalty_points_used"] = r["points_used"]
    PricingEngine.finalize(pricing, settings.get("gst_pct", 0))
    booking["pricing"] = pricing
    await db.bookings.update_one({"id": booking["id"]}, {"$set": {"pricing": pricing}})
    await db.users.update_one({"id": user["id"]}, {"$inc": {"loyalty_points": -r["points_used"]}})
    bal = await get_balance(user["id"])
    await _ledger(user["id"], "debit", r["points_used"],
                  f"Redeemed on booking {booking.get('code')}", booking.get("code"), bal)
    return booking


async def admin_overview() -> dict:
    cfg = await get_config()
    agg = await db.users.aggregate([
        {"$match": {"loyalty_points": {"$gt": 0}}},
        {"$group": {"_id": None, "total": {"$sum": "$loyalty_points"}, "members": {"$sum": 1}}},
    ]).to_list(1)
    outstanding = agg[0]["total"] if agg else 0
    members = agg[0]["members"] if agg else 0
    earned = await db.loyalty_ledger.aggregate([
        {"$match": {"direction": "credit"}}, {"$group": {"_id": None, "s": {"$sum": "$points"}}}]).to_list(1)
    redeemed = await db.loyalty_ledger.aggregate([
        {"$match": {"direction": "debit"}}, {"$group": {"_id": None, "s": {"$sum": "$points"}}}]).to_list(1)
    issued = int(earned[0]["s"]) if earned else 0
    redeemed_pts = int(redeemed[0]["s"]) if redeemed else 0
    redemption_rate = round((redeemed_pts / issued) * 100, 1) if issued > 0 else 0.0
    return {
        "config": cfg,
        "outstanding_points": int(outstanding),
        "outstanding_value": round(outstanding * cfg["redeem_value"], 2),
        "members": int(members),
        "total_earned": issued,
        "points_issued": issued,
        "total_redeemed": redeemed_pts,
        "points_redeemed": redeemed_pts,
        "redemption_rate": redemption_rate,
    }


_TYPE_LABELS = {"credit": "Earned", "debit": "Redeemed"}


def _txn_type(row: dict) -> str:
    """Derive a rich transaction type from a ledger row."""
    note = (row.get("note") or "").lower()
    if row.get("kind"):
        return row["kind"]
    if row.get("direction") == "credit":
        if "welcome" in note or "bonus" in note:
            return "bonus"
        if "adjust" in note:
            return "adjusted"
        return "earned"
    if row.get("direction") == "debit":
        if "expire" in note:
            return "expired"
        if "adjust" in note:
            return "adjusted"
        return "redeemed"
    return "earned"


async def admin_transactions(q: str = "", type: str = "", date_from: str = "",
                             date_to: str = "", page: int = 1, page_size: int = 25) -> dict:
    """Paginated loyalty ledger with customer names + rich type + ₹ value."""
    cfg = await get_config()
    rv = float(cfg["redeem_value"])
    query: dict = {}
    if date_from:
        query.setdefault("created_at", {})["$gte"] = date_from
    if date_to:
        query.setdefault("created_at", {})["$lte"] = date_to + "T23:59:59"
    rows = await db.loyalty_ledger.find(query, {"_id": 0}).sort("created_at", -1).to_list(20000)
    # resolve user names
    uids = list({r.get("user_id") for r in rows if r.get("user_id")})
    users = await db.users.find({"id": {"$in": uids}}, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(20000)
    umap = {u["id"]: u for u in users}
    out = []
    for r in rows:
        u = umap.get(r.get("user_id"), {})
        t = _txn_type(r)
        item = {
            "id": r.get("id"),
            "user_id": r.get("user_id"),
            "customer": u.get("name") or "—",
            "phone": u.get("phone") or "",
            "type": t,
            "direction": r.get("direction"),
            "points": int(r.get("points", 0) or 0),
            "value": round(int(r.get("points", 0) or 0) * rv, 2),
            "balance": r.get("balance_after"),
            "booking": r.get("ref_code") or "",
            "note": r.get("note") or "",
            "source": r.get("source") or "system",
            "status": r.get("status") or "completed",
            "created_at": r.get("created_at"),
        }
        out.append(item)
    # filters (in-python for flexibility on derived type)
    if q:
        ql = q.lower()
        out = [x for x in out if ql in (x["customer"] or "").lower() or ql in (x["phone"] or "")
               or ql in (x["booking"] or "").lower()]
    if type:
        out = [x for x in out if x["type"] == type]
    total = len(out)
    start = max(0, (page - 1) * page_size)
    items = out[start:start + page_size]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


async def admin_members(q: str = "", page: int = 1, page_size: int = 25) -> dict:
    """Per-customer loyalty rollup: available / earned / redeemed / LTV / last activity."""
    cfg = await get_config()
    rv = float(cfg["redeem_value"])
    # ledger rollup
    agg = await db.loyalty_ledger.aggregate([
        {"$group": {
            "_id": "$user_id",
            "earned": {"$sum": {"$cond": [{"$eq": ["$direction", "credit"]}, "$points", 0]}},
            "redeemed": {"$sum": {"$cond": [{"$eq": ["$direction", "debit"]}, "$points", 0]}},
            "last": {"$max": "$created_at"},
        }},
    ]).to_list(20000)
    roll = {a["_id"]: a for a in agg}
    # users with any loyalty activity or balance
    ids = set(roll.keys())
    bal_users = await db.users.find({"loyalty_points": {"$gt": 0}}, {"_id": 0, "id": 1}).to_list(20000)
    ids.update(u["id"] for u in bal_users)
    ids.discard(None)
    users = await db.users.find({"id": {"$in": list(ids)}},
                                {"_id": 0, "id": 1, "name": 1, "phone": 1, "loyalty_points": 1}).to_list(20000)
    # lifetime spend per customer from paid/completed bookings
    spend_agg = await db.bookings.aggregate([
        {"$match": {"status": {"$in": ["completed", "paid", "assigned", "ongoing"]}}},
        {"$group": {"_id": "$customer_id", "spend": {"$sum": "$pricing.total"}}},
    ]).to_list(20000)
    spend = {s["_id"]: s["spend"] for s in spend_agg}
    rows = []
    for u in users:
        r = roll.get(u["id"], {})
        avail = int(u.get("loyalty_points", 0) or 0)
        rows.append({
            "user_id": u["id"], "name": u.get("name") or "—", "phone": u.get("phone") or "",
            "available": avail, "available_value": round(avail * rv, 2),
            "earned": int(r.get("earned", 0) or 0), "redeemed": int(r.get("redeemed", 0) or 0),
            "lifetime_value": round(float(spend.get(u["id"], 0) or 0), 2),
            "last_activity": r.get("last"),
            "status": "active" if avail > 0 else "inactive",
        })
    if q:
        ql = q.lower()
        rows = [x for x in rows if ql in (x["name"] or "").lower() or ql in (x["phone"] or "")]
    rows.sort(key=lambda x: x["available"], reverse=True)
    total = len(rows)
    start = max(0, (page - 1) * page_size)
    return {"items": rows[start:start + page_size], "total": total, "page": page, "page_size": page_size}
