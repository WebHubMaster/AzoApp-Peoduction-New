"""Starter Kit — premium partner onboarding kit (branded merchandise + perks).

Single global admin-configurable kit (price/discount, included items with images,
benefits, and the service-area pincodes where purchase is MANDATORY). Partners
purchase it (reuses the mock/dev or Razorpay payment path like membership),
get a premium badge, and — in mandatory areas — are locked out of the rest of
the partner app until they buy.
"""
from fastapi import HTTPException
from datetime import datetime, timezone, timedelta
from config.database import db, now_iso
from models.user import new_id
from services import payment_service


DEFAULT_KIT = {
    "id": "config",
    "enabled": True,
    "title": "AzoApp Pro Starter Kit",
    "subtitle": "Look the part. Win customer trust. Earn more.",
    "tagline": "Join 10,000+ verified AzoApp Pro partners",
    "hero_image": "",
    "actual_price": 1499,
    "discounted_price": 999,
    "currency": "INR",
    "badge_label": "AzoApp Pro",
    "items": [
        {"id": "kit-tshirt", "name": "Branded T-Shirt", "icon": "shirt",
         "description": "Premium dry-fit AzoApp branded t-shirt so customers instantly recognise a verified pro.",
         "image": "", "size_hint": "Square image ≥ 800×800px (PNG/JPG/WebP)"},
        {"id": "kit-cap", "name": "Branded Cap", "icon": "cap",
         "description": "Matching AzoApp cap — complete the professional look on every job.",
         "image": "", "size_hint": "Square image ≥ 800×800px (PNG/JPG/WebP)"},
        {"id": "kit-idcard", "name": "Official ID Card", "icon": "id",
         "description": "Photo ID card with your partner code — builds instant trust at the doorstep.",
         "image": "", "size_hint": "Landscape image ~1011×638px / CR80 card ratio (PNG/JPG)"},
        {"id": "kit-support", "name": "Dedicated Support", "icon": "support",
         "description": "Priority partner support line — get help faster, whenever you need it.",
         "image": "", "size_hint": "Optional square image ≥ 600×600px"},
    ],
    "benefits": [
        "Premium 'AzoApp Pro' badge on your profile",
        "Branded merchandise kit (t-shirt, cap, ID card)",
        "Dedicated priority partner support",
        "Higher customer trust → more jobs & better ratings",
    ],
    "mandatory_pincodes": [],
    "renewal_days": 365,
    "renewal_reminder_days": 15,
    "updated_at": None,
}

_PUBLIC_KEYS = ["enabled", "title", "subtitle", "tagline", "hero_image",
                "actual_price", "discounted_price", "currency", "badge_label",
                "items", "benefits", "renewal_days"]


def _public(cfg: dict) -> dict:
    out = {k: cfg.get(k, DEFAULT_KIT.get(k)) for k in _PUBLIC_KEYS}
    ap = float(out.get("actual_price") or 0)
    dp = float(out.get("discounted_price") or 0)
    out["savings"] = round(max(ap - dp, 0), 2)
    out["discount_pct"] = round((out["savings"] / ap) * 100) if ap > 0 else 0
    return out


async def get_config() -> dict:
    doc = await db.starter_kit.find_one({"id": "config"}, {"_id": 0})
    if not doc:
        doc = dict(DEFAULT_KIT)
        doc["updated_at"] = now_iso()
        await db.starter_kit.insert_one(dict(doc))
    merged = {**DEFAULT_KIT, **doc}
    return merged


async def update_config(data: dict) -> dict:
    cur = await get_config()
    upd = {**cur}
    for k, v in (data or {}).items():
        if k in ("id", "_id"):
            continue
        upd[k] = v
    items = upd.get("items") or []
    clean_items = []
    for it in items:
        if not isinstance(it, dict):
            continue
        it["id"] = it.get("id") or new_id()
        clean_items.append(it)
    upd["items"] = clean_items
    upd["mandatory_pincodes"] = [str(p).strip() for p in (upd.get("mandatory_pincodes") or []) if str(p).strip()]
    upd["id"] = "config"
    upd["updated_at"] = now_iso()
    upd.pop("_id", None)
    await db.starter_kit.update_one({"id": "config"}, {"$set": upd}, upsert=True)
    return await get_config()


def _partner_pincodes(user: dict) -> set:
    pins = set()
    for p in (user.get("service_pincodes") or []):
        if p:
            pins.add(str(p).strip())
    for a in (user.get("addresses") or []):
        if isinstance(a, dict) and a.get("pincode"):
            pins.add(str(a["pincode"]).strip())
    reg = user.get("registration") or {}
    basic = (reg.get("basic") or {}) if isinstance(reg, dict) else {}
    if basic.get("pincode"):
        pins.add(str(basic["pincode"]).strip())
    return {p for p in pins if p}


async def _fresh(user: dict) -> dict:
    return await db.users.find_one({"id": user["id"]}, {"_id": 0}) or user


TRACKING_FLOW = ["processing", "shipped", "out_for_delivery", "delivered"]
TRACKING_LABEL = {
    "processing": "Order confirmed — being prepared",
    "shipped": "Shipped",
    "out_for_delivery": "Out for delivery",
    "delivered": "Delivered",
}


def _renewal_info(kit: dict) -> dict:
    """Compute expiry/renewal state from a purchased kit's expires_at."""
    exp = kit.get("expires_at")
    if not exp:
        return {"expires_at": None, "expired": False, "expiring_soon": False, "days_left": None}
    try:
        exp_dt = datetime.fromisoformat(exp)
        now = datetime.now(timezone.utc)
        days_left = (exp_dt - now).days
        return {
            "expires_at": exp,
            "expired": now >= exp_dt,
            "expiring_soon": 0 <= days_left <= 30,
            "days_left": days_left,
        }
    except Exception:
        return {"expires_at": exp, "expired": False, "expiring_soon": False, "days_left": None}


async def partner_status(user: dict) -> dict:
    user = await _fresh(user)
    cfg = await get_config()
    kit = user.get("starter_kit") or {}
    purchased = bool(kit.get("purchased"))
    renewal = _renewal_info(kit)
    active = purchased and not renewal["expired"]
    mand_pins = {str(p).strip() for p in (cfg.get("mandatory_pincodes") or []) if str(p).strip()}
    part_pins = _partner_pincodes(user)
    matched = sorted(mand_pins & part_pins)
    mandatory = bool(cfg.get("enabled")) and len(matched) > 0
    locked = mandatory and not active
    return {
        "config": _public(cfg),
        "purchased": purchased,
        "active": active,
        "purchase": kit if purchased else None,
        "mandatory": mandatory,
        "locked": locked,
        "matched_pincodes": matched,
        "badge_label": kit.get("badge_label") or cfg.get("badge_label", "AzoApp Pro"),
        "tracking_status": kit.get("tracking_status") if purchased else None,
        "tracking_timeline": kit.get("tracking_timeline") if purchased else None,
        "renewal": renewal,
    }


async def _activate(user: dict, cfg: dict, method: str, amount: float,
                    order_id: str = None, payment_id: str = None) -> dict:
    renewal_days = int(cfg.get("renewal_days", 0) or 0)
    expires_at = None
    if renewal_days > 0:
        expires_at = (datetime.now(timezone.utc) + timedelta(days=renewal_days)).isoformat()
    kit = {
        "purchased": True, "purchased_at": now_iso(),
        "amount": round(float(amount), 2), "method": method,
        "order_id": order_id, "payment_id": payment_id,
        "badge_label": cfg.get("badge_label", "AzoApp Pro"),
        "expires_at": expires_at,
        "tracking_status": "processing",
        "tracking_timeline": [{"status": "processing", "at": now_iso()}],
        "renewal_reminded_on": None,
    }
    await db.users.update_one({"id": user["id"]}, {"$set": {
        "starter_kit": kit, "premium_partner": True,
        "partner_badge": cfg.get("badge_label", "AzoApp Pro"),
    }})
    pur = {
        "id": new_id(), "user_id": user["id"], "user_name": user.get("name"),
        "user_phone": user.get("phone"), "amount": round(float(amount), 2),
        "method": method, "status": "paid", "order_id": order_id,
        "payment_id": payment_id, "expires_at": expires_at,
        "tracking_status": "processing", "created_at": now_iso(),
    }
    await db.starter_kit_purchases.insert_one(dict(pur))
    pur.pop("_id", None)
    if amount > 0:
        await db.transactions.insert_one({
            "id": new_id(), "user_id": user["id"], "amount": round(float(amount), 2),
            "type": "debit", "kind": "starter_kit",
            "note": "AzoApp Pro Starter Kit purchase", "created_at": now_iso()})
    try:
        from services import notification_service
        await notification_service.notify(
            user["id"], "Starter Kit activated \U0001F389",
            "You're now an AzoApp Pro partner! Your premium badge is live and your kit is being prepared.",
            link="/partner")
    except Exception:
        pass
    return pur


async def update_tracking(purchase_id: str, status: str) -> dict:
    """Admin: advance a kit's delivery tracking status."""
    if status not in TRACKING_FLOW:
        raise HTTPException(status_code=400, detail=f"Invalid status. Use one of {TRACKING_FLOW}")
    pur = await db.starter_kit_purchases.find_one({"id": purchase_id}, {"_id": 0})
    if not pur:
        raise HTTPException(status_code=404, detail="Purchase not found")
    entry = {"status": status, "at": now_iso()}
    await db.starter_kit_purchases.update_one({"id": purchase_id}, {"$set": {"tracking_status": status}})
    user = await db.users.find_one({"id": pur["user_id"]}, {"_id": 0, "starter_kit": 1})
    kit = (user or {}).get("starter_kit") or {}
    timeline = kit.get("tracking_timeline") or []
    if not timeline or timeline[-1].get("status") != status:
        timeline.append(entry)
    await db.users.update_one({"id": pur["user_id"]},
                              {"$set": {"starter_kit.tracking_status": status,
                                        "starter_kit.tracking_timeline": timeline}})
    try:
        from services import notification_service
        await notification_service.notify(
            pur["user_id"], "Starter Kit update \U0001F4E6",
            f"Your AzoApp Pro kit is now: {TRACKING_LABEL.get(status, status)}.",
            link="/partner")
    except Exception:
        pass
    return {"ok": True, "tracking_status": status}


async def send_renewal_reminders() -> dict:
    """Daily sweep: nudge partners whose kit expires within renewal_reminder_days."""
    cfg = await get_config()
    window = int(cfg.get("renewal_reminder_days", 15) or 15)
    today = now_iso()[:10]
    nudged = 0
    partners = await db.users.find(
        {"role": "partner", "starter_kit.purchased": True, "starter_kit.expires_at": {"$ne": None}},
        {"_id": 0, "id": 1, "starter_kit": 1}).to_list(5000)
    for p in partners:
        kit = p.get("starter_kit") or {}
        info = _renewal_info(kit)
        if info["days_left"] is None:
            continue
        if kit.get("renewal_reminded_on") == today:
            continue
        if 0 <= info["days_left"] <= window:
            await db.users.update_one({"id": p["id"]}, {"$set": {"starter_kit.renewal_reminded_on": today}})
            try:
                from services import notification_service
                await notification_service.notify(
                    p["id"], "Renew your AzoApp Pro kit \u23F3",
                    f"Your AzoApp Pro membership expires in {info['days_left']} day(s). Renew now to keep your premium badge and perks.",
                    link="/partner")
                nudged += 1
            except Exception:
                pass
        elif info["expired"]:
            await db.users.update_one({"id": p["id"]}, {"$set": {"premium_partner": False}})
    return {"nudged": nudged}


async def purchase_order(user: dict) -> dict:
    cfg = await get_config()
    if not cfg.get("enabled"):
        raise HTTPException(status_code=400, detail="Starter Kit is not available right now")
    if (user.get("starter_kit") or {}).get("purchased") or ((await _fresh(user)).get("starter_kit") or {}).get("purchased"):
        raise HTTPException(status_code=400, detail="You already own the Starter Kit")
    amt = round(float(cfg.get("discounted_price") or 0), 2)
    if amt <= 0:
        pur = await _activate(user, cfg, "free", 0)
        return {"mock": True, "free": True, "amount": 0, "purchase_id": pur["id"]}
    order = await payment_service.create_order(amt, f"KIT-{user['id'][:8]}")
    if not order:
        return {"mock": True, "amount": amt}
    return {"mock": False, "amount": amt, **order}


async def purchase_mock(user: dict) -> dict:
    if await payment_service.is_configured():
        raise HTTPException(status_code=400, detail="Live payments enabled \u2014 use the payment gateway")
    fresh = await _fresh(user)
    if (fresh.get("starter_kit") or {}).get("purchased"):
        raise HTTPException(status_code=400, detail="You already own the Starter Kit")
    cfg = await get_config()
    await _activate(fresh, cfg, "mock", cfg.get("discounted_price", 0))
    return {"ok": True, "status": await partner_status(fresh)}


async def purchase_verify(user: dict, order_id: str, payment_id: str, signature: str) -> dict:
    ok = await payment_service.verify_signature(order_id, payment_id, signature)
    if not ok:
        raise HTTPException(status_code=400, detail="Payment verification failed")
    fresh = await _fresh(user)
    if (fresh.get("starter_kit") or {}).get("purchased"):
        return {"ok": True, "status": await partner_status(fresh)}
    cfg = await get_config()
    await _activate(fresh, cfg, "razorpay", cfg.get("discounted_price", 0), order_id, payment_id)
    return {"ok": True, "status": await partner_status(fresh)}


async def purchase_confirm_return(user: dict, order_id: str, gateway: str = None) -> dict:
    """Hosted-checkout RETURN for the Starter Kit (Cashfree/Juspay/Easebuzz). Verifies
    the gateway order status and, if paid, activates AzoApp Pro for the partner."""
    fresh = await _fresh(user)
    if (fresh.get("starter_kit") or {}).get("purchased"):
        return {"ok": True, "paid": True, "kind": "starter_kit", "already": True}
    paid = await payment_service.check_order_paid(order_id, gateway)
    if not paid:
        return {"ok": True, "paid": False, "kind": "starter_kit"}
    cfg = await get_config()
    await _activate(fresh, cfg, gateway or "gateway", cfg.get("discounted_price", 0), order_id)
    return {"ok": True, "paid": True, "kind": "starter_kit"}


async def admin_purchases(q: str = "", status: str = "all", method: str = "all",
                          date_from: str = "", date_to: str = "",
                          page: int = 1, page_size: int = 10, sort: str = "newest") -> dict:
    """Admin: paginated + filterable Starter Kit purchase report.

    Filters: free-text (name/phone), delivery status, payment method, and a
    custom created_at date range. Returns paginated rows enriched with the
    partner's location and delivery timeline, plus filtered/all revenue and
    per-status counts (for filter chips)."""
    from datetime import date as _date

    # --- base filter (everything except tracking status) ---
    base: dict = {}
    term = (q or "").strip()
    if term:
        rx = {"$regex": term, "$options": "i"}
        base["$or"] = [{"user_name": rx}, {"user_phone": rx}]
    if method and method != "all":
        base["method"] = method
    # created_at is a sortable ISO string; use half-open [from, to+1day) range
    created: dict = {}
    if date_from:
        created["$gte"] = f"{date_from}T00:00:00"
    if date_to:
        try:
            nxt = (_date.fromisoformat(date_to) + timedelta(days=1)).isoformat()
            created["$lt"] = f"{nxt}T00:00:00"
        except ValueError:
            pass
    if created:
        base["created_at"] = created

    # --- per-status counts over the base filter (powers the filter chips) ---
    status_counts = {s: 0 for s in TRACKING_FLOW}
    async for r in db.starter_kit_purchases.find(base, {"_id": 0, "tracking_status": 1}):
        st = r.get("tracking_status") or "processing"
        status_counts[st] = status_counts.get(st, 0) + 1
    base_total = sum(status_counts.values())

    # --- apply the status filter on top of the base filter ---
    query = dict(base)
    if status and status != "all":
        query["tracking_status"] = status

    # revenue over the (fully) filtered set
    filtered_rows = await db.starter_kit_purchases.find(
        query, {"_id": 0, "amount": 1}).to_list(50000)
    filtered_revenue = round(sum(float(r.get("amount", 0) or 0) for r in filtered_rows), 2)
    filtered_total = len(filtered_rows)

    # all-time (unfiltered) revenue + count for the headline stat
    all_rows = await db.starter_kit_purchases.find({}, {"_id": 0, "amount": 1}).to_list(50000)
    total_all = len(all_rows)
    total_revenue_all = round(sum(float(r.get("amount", 0) or 0) for r in all_rows), 2)

    # --- paginate ---
    try:
        page = max(1, int(page))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(100, max(1, int(page_size)))
    except (TypeError, ValueError):
        page_size = 10
    skip = (page - 1) * page_size
    sort_map = {"newest": ("created_at", -1), "oldest": ("created_at", 1),
                "amount_high": ("amount", -1), "amount_low": ("amount", 1),
                "partner": ("user_name", 1), "partner_desc": ("user_name", -1)}
    sort_key, sort_dir = sort_map.get(sort or "newest", sort_map["newest"])
    rows = await (db.starter_kit_purchases.find(query, {"_id": 0})
                  .sort([(sort_key, sort_dir), ("created_at", -1)]).skip(skip).limit(page_size).to_list(page_size))
    methods = sorted([m for m in await db.starter_kit_purchases.distinct("method") if m])

    # --- enrich with partner location + delivery timeline (batch fetch) ---
    user_ids = list({r.get("user_id") for r in rows if r.get("user_id")})
    umap: dict = {}
    if user_ids:
        async for u in db.users.find(
            {"id": {"$in": user_ids}},
            {"_id": 0, "id": 1, "city": 1, "state": 1, "email": 1,
             "service_pincodes": 1, "starter_kit": 1},
        ):
            umap[u["id"]] = u
    for r in rows:
        u = umap.get(r.get("user_id"), {})
        pincodes = u.get("service_pincodes") or []
        r["location"] = {
            "city": u.get("city") or "",
            "state": u.get("state") or "",
            "pincode": pincodes[0] if pincodes else "",
        }
        r["user_email"] = u.get("email") or ""
        sk_data = u.get("starter_kit") or {}
        r["tracking_timeline"] = sk_data.get("tracking_timeline") or []

    total_pages = max(1, (filtered_total + page_size - 1) // page_size)
    return {
        "purchases": rows,
        "count": total_all,                 # back-compat: total purchases (all-time)
        "total_revenue": total_revenue_all,  # back-compat: all-time revenue
        "filtered_count": filtered_total,
        "filtered_revenue": filtered_revenue,
        "total_all": total_all,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "status_counts": status_counts,
        "base_total": base_total,
        "methods": methods,
        "sort": sort or "newest",
    }
