"""Customer Mobile App — Home page CMS (admin-managed) + resolved public feed.
Single document `app_home` (key=customer_app_home). GET /app/home merges config with live catalog/promotion data."""
from config.database import db, now_iso
from services import cache_service
from controllers import site_controller as sc

KEY = "customer_app_home"
CACHE = "app:home"

DEFAULT = {
    "key": KEY,
    "branding": {"logo": "", "tagline": "", "show_tagline": True},
    "hero_slides": [
        {"id": "slide-1", "enabled": True, "badge": "Verified & Trusted Professionals",
         "title": "Home Services", "highlight": "Made Simple",
         "subtitle": "Book verified professionals for all your home needs. Fast, safe and reliable.",
         "image": "", "side_text": "Your Trusted Partner", "rating_value": "4.8", "rating_label": "Customer Rating",
         "cta_label": "Book a Service", "cta_link": "/services",
         "features": [{"icon": "shield-check", "title": "Verified", "sub": "Experts"},
                      {"icon": "clock", "title": "On-time", "sub": "Service"},
                      {"icon": "indian-rupee", "title": "Safe & Secure", "sub": "Payments"}]},
    ],
    "quick_features": [
        {"id": "qf-1", "enabled": True, "icon": "zap", "title": "Express Booking", "sub": "Get quick service", "link": "/services"},
        {"id": "qf-2", "enabled": True, "icon": "map-pin", "title": "Live Tracking", "sub": "Track your professional", "link": "/account?tab=orders"},
        {"id": "qf-3", "enabled": True, "icon": "wallet", "title": "AzoApp Wallet", "sub": "Extra discounts", "link": "/account?tab=wallet"},
        {"id": "qf-4", "enabled": True, "icon": "gift", "title": "Refer & Earn", "sub": "Invite & get rewards", "link": "/account?tab=referral"},
    ],
    "why_choose": {"enabled": True, "title": "Why Choose AzoApp?", "image": "",
                   "side_text": "Hassle-free Home Services for a Better Life",
                   "items": [{"icon": "shield-check", "title": "Verified Professionals"},
                             {"icon": "indian-rupee", "title": "Transparent Pricing"},
                             {"icon": "credit-card", "title": "Safe & Secure Payments"},
                             {"icon": "clock", "title": "On-time Service"},
                             {"icon": "headphones", "title": "24/7 Customer Support"}]},
    "salon": {"enabled": True, "title": "Salon at Home", "icon": "sparkles", "tabs": [], "limit": 8},
    "categories": {"limit": 11, "show_more": True, "more_label": "All services"},
    "offer_banner": {"enabled": True, "eyebrow": "LIMITED TIME OFFER", "cta_label": "Book Now", "cta_link": "/services", "image": "", "offer_id": ""},
    "sections": [
        {"key": "categories", "enabled": True, "title": ""},
        {"key": "offer_banner", "enabled": True, "title": ""},
        {"key": "quick_features", "enabled": True, "title": ""},
        {"key": "most_booked", "enabled": True, "title": "Most Booked Services", "icon": "flame", "limit": 8},
        {"key": "why_choose", "enabled": True, "title": ""},
        {"key": "trending", "enabled": True, "title": "Trending Near You", "icon": "map-pin", "limit": 8},
        {"key": "salon", "enabled": True, "title": ""},
        {"key": "offers", "enabled": True, "title": "Offers & Savings", "icon": "badge-percent", "limit": 8},
    ],
}


def _merge(doc):
    out = {**DEFAULT, **(doc or {})}
    for k in ("branding", "why_choose", "salon", "categories", "offer_banner"):
        out[k] = {**DEFAULT[k], **((doc or {}).get(k) or {})}
    return out


async def get_config():
    doc = await db.app_home.find_one({"key": KEY}, {"_id": 0})
    return _merge(doc)


async def save_config(data: dict):
    data = {k: v for k, v in (data or {}).items() if k not in ("_id",)}
    data["key"] = KEY
    data["updated_at"] = now_iso()
    await db.app_home.update_one({"key": KEY}, {"$set": data}, upsert=True)
    await cache_service.bust_prefix(CACHE)
    return await get_config()


def _svc_card(s, demand):
    return {"id": s["id"], "name": s.get("name"), "image": s.get("image"), "base_price": s.get("base_price"),
            "price_type": s.get("price_type"), "rating": s.get("rating") or 0,
            "rating_count": int(s.get("rating_count") or s.get("reviews_count") or 0),
            "booking_count": demand.get(s["id"], 0), "category_id": s.get("category_id"), "category_name": s.get("category_name"),
            "duration_min": s.get("duration_min")}


async def public_home(city: str = ""):
    city = (city or "").strip().lower()[:60]
    key = f"{CACHE}:c:{city}" if city else CACHE
    return await cache_service.cached(key, 45, lambda: _public_home(city))


async def _public_home(city: str):
    cfg = await get_config()
    ac, asub = await sc._active_sets()
    all_services = await db.services.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    visible = [s for s in all_services if sc._visible(s, ac, asub)]
    demand = await sc._service_demand("")
    local = await sc._service_demand(city) if city else demand
    per_cat = {}
    for s in visible:
        per_cat[s.get("category_id")] = per_cat.get(s.get("category_id"), 0) + 1
    cats = await db.categories.find({"status": "active"}, {"_id": 0}).sort("order", 1).to_list(500)
    cats = [{"id": c["id"], "name": c["name"], "slug": c.get("slug"), "icon": c.get("icon"), "image": c.get("image"),
             "service_count": per_cat.get(c["id"], 0)} for c in cats if c.get("show_on_home", True)]
    promos = await sc.promotions()
    offers = promos.get("offers") or []
    coupons = promos.get("coupons") or []

    def by_demand(key_demand):
        hot = sorted(visible, key=lambda s: (-(key_demand.get(s["id"], 0)), -(float(s.get("rating") or 0))))
        return hot

    sections = []
    for sec in cfg["sections"]:
        if not sec.get("enabled", True):
            continue
        k = sec["key"]
        lim = int(sec.get("limit") or 8)
        item = {**sec}
        if k == "categories":
            item["data"] = cats
            item["config"] = cfg["categories"]
        elif k == "offer_banner":
            ob = cfg["offer_banner"]
            off = next((o for o in offers if o.get("id") == ob.get("offer_id")), None) if ob.get("offer_id") else (offers[0] if offers else None)
            if not off and not ob.get("title"):
                continue
            item["data"] = off
            item["config"] = ob
        elif k == "quick_features":
            item["data"] = [q for q in cfg["quick_features"] if q.get("enabled", True)]
        elif k == "most_booked":
            item["data"] = [_svc_card(s, demand) for s in by_demand(demand)[:lim]]
        elif k == "trending":
            hot = [s for s in visible if local.get(s["id"], 0) > 0] if city else []
            rows = sorted(hot, key=lambda s: -local[s["id"]]) if hot else [s for s in by_demand(demand) if s.get("is_trending")] or by_demand(demand)[lim:lim * 2] or by_demand(demand)[:lim]
            item["data"] = [_svc_card(s, local if hot else demand) for s in rows[:lim]]
            item["city_based"] = bool(hot)
        elif k == "why_choose":
            wc = cfg["why_choose"]
            if not wc.get("enabled", True):
                continue
            item["data"] = wc
        elif k == "salon":
            sal = cfg["salon"]
            if not sal.get("enabled", True):
                continue
            tabs = sal.get("tabs") or []
            if not tabs:
                tabs = [{"label": c["name"], "category_id": c["id"]} for c in cats if "salon" in (c.get("slug") or c["name"]).lower()][:3]
            if not tabs:
                continue
            for t in tabs:
                t["data"] = [_svc_card(s, demand) for s in visible if s.get("category_id") == t.get("category_id")][: int(sal.get("limit") or 8)]
            item["data"] = tabs
            item["title"] = sal.get("title") or "Salon at Home"
            item["icon"] = sal.get("icon") or "sparkles"
        elif k == "offers":
            item["data"] = offers[:lim]
            item["coupons"] = coupons
        sections.append(item)

    branding = await sc.public_site_config()
    b = branding.get("branding") or {}
    return {
        "branding": {"site_name": b.get("site_name") or "AzoApp",
                     "logo": cfg["branding"].get("logo") or b.get("logo") or "",
                     "tagline": cfg["branding"].get("tagline") or b.get("tagline") or "",
                     "show_tagline": cfg["branding"].get("show_tagline", True)},
        "hero_slides": [s for s in cfg["hero_slides"] if s.get("enabled", True)],
        "sections": sections,
        "stats": branding.get("stats") or {},
    }
