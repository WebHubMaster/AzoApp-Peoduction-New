"""Public site config, dynamic homepage aggregation, and admin global search."""
from config.database import db, get_settings
from services import cache_service


async def public_site_config():
    return await cache_service.cached("site:config", 120, _public_site_config)


async def _home_stats(s):
    """Storefront trust stats. Admin toggle `home_stats.live`:
      • ON  (default) → real numbers computed live from the DB.
      • OFF            → admin-entered manual values (strings like "50K+" allowed).
    """
    hs = (s.get("home_stats") or {})
    if hs.get("live", True) is False:
        return {
            "live": False,
            "jobs_done": hs.get("jobs_done"),
            "partners": hs.get("partners"),
            "verified_partners": hs.get("verified_partners"),
            "merchants": hs.get("merchants"),
            "customers": hs.get("customers"),
            "reviews": hs.get("reviews"),
            "rating": hs.get("rating"),
        }
    jobs_done = await db.bookings.count_documents({"status": {"$in": ["completed", "paid"]}})
    partners = await db.users.count_documents({"role": "partner"})
    verified_partners = await db.users.count_documents({"role": "partner", "kyc_status": "approved"})
    merchants = await db.users.count_documents({"role": "merchant"})
    customers = await db.users.count_documents({"role": "customer"})
    rev = await db.bookings.aggregate([
        {"$match": {"review.rating": {"$gt": 0}}},
        {"$group": {"_id": None, "avg": {"$avg": "$review.rating"}, "n": {"$sum": 1}}},
    ]).to_list(1)
    reviews = int(rev[0]["n"]) if rev else 0
    if rev and rev[0].get("n"):
        rating = round(float(rev[0]["avg"]), 1)
    else:
        agg = await db.users.aggregate([
            {"$match": {"role": "partner", "rating": {"$gt": 0}}},
            {"$group": {"_id": None, "avg": {"$avg": "$rating"}, "n": {"$sum": 1}}},
        ]).to_list(1)
        rating = round(float(agg[0]["avg"]), 1) if agg and agg[0].get("n") else 0
    cities = await db.service_areas.distinct("city", {"status": {"$ne": "inactive"}})
    return {
        "live": True,
        "jobs_done": jobs_done,
        "partners": partners,
        "verified_partners": verified_partners,
        "merchants": merchants,
        "customers": customers,
        "reviews": reviews,
        "rating": rating,
        "cities": len([c for c in cities if c]),
    }


async def _public_site_config():
    s = await get_settings()
    seo = s.get("seo", {}) or {}
    branding = dict(s.get("branding", {}) or {})
    general = s.get("general", {}) or {}
    site_name = branding.get("site_name") or branding.get("name") or "AzoApp"
    # Merge General-Settings → Social & Apps into branding.social so the public
    # footer renders dynamically from admin config (General Settings wins over
    # legacy Branding social; empty values are simply omitted → icon hidden).
    _soc = dict(branding.get("social") or {})
    for _plat, _gk in (("facebook", "facebook_url"), ("instagram", "instagram_url"),
                       ("twitter", "twitter_url"), ("linkedin", "linkedin_url"), ("youtube", "youtube_url")):
        if general.get(_gk):
            _soc[_plat] = general[_gk]
    branding["social"] = _soc
    if not branding.get("phone") and general.get("support_phone"):
        branding["phone"] = general["support_phone"]
    if not branding.get("email") and general.get("support_email"):
        branding["email"] = general["support_email"]
    return {
        "branding": branding,
        "theme": s.get("theme", {}),
        "stats": await _home_stats(s),
        "currency": s.get("currency", "INR"),
        "maps_api_key": ((s.get("integrations", {}) or {}).get("google_maps_api_key") or ""),
        "cancellation_reasons": s.get("cancellation_reasons", []),
        "apps": {"playstore": general.get("playstore_url", ""), "appstore": general.get("appstore_url", "")},
        "business": {
            "site_name": general.get("site_name") or site_name,
            "tagline": general.get("tagline") or branding.get("tagline", ""),
            "support_email": general.get("support_email", ""),
            "support_phone": general.get("support_phone", ""),
            "support_hours": general.get("support_hours", ""),
            "website": general.get("company_website", ""),
            "address": general.get("company_address", ""),
            "currency_symbol": general.get("currency_symbol", ""),
            "currency_code": general.get("currency_code", s.get("currency", "INR")),
            "timezone": general.get("timezone", "Asia/Kolkata"),
            "date_format": general.get("date_format", "DD/MM/YYYY"),
            "country": general.get("country", ""),
            "language": general.get("default_language", "en"),
        },
        "maintenance": {
            "enabled": bool(general.get("maintenance_mode")),
            "message": general.get("maintenance_message")
            or "We're performing scheduled maintenance. Some features may be temporarily unavailable.",
        },
        "seo": {
            "site_title": seo.get("site_title") or site_name,
            "meta_description": seo.get("meta_description", ""),
            "meta_keywords": seo.get("meta_keywords", ""),
            "og_image": seo.get("og_image") or branding.get("logo", ""),
            "twitter": seo.get("twitter", ""),
            "title_suffix": seo.get("title_suffix") or site_name,
            "site_name": site_name,
            "logo": branding.get("logo", ""),
            "phone": branding.get("phone") or seo.get("phone", ""),
        },
    }


async def _active_sets():
    cats = await db.categories.find({"status": "active"}, {"_id": 0, "id": 1}).to_list(1000)
    subs = await db.subcategories.find({"status": "active"}, {"_id": 0, "id": 1}).to_list(2000)
    return {c["id"] for c in cats}, {s["id"] for s in subs}


def _visible(svc, ac, asub):
    if svc.get("status") != "active" or svc.get("approval_status", "approved") != "approved":
        return False
    if svc.get("category_id") not in ac:
        return False
    sub = svc.get("subcategory_id")
    return not (sub and sub not in asub)


async def homepage(city: str = ""):
    """Return ordered, enabled sections with resolved data. Fully admin-controlled.
    Read-through cached (45s) — the storefront's hottest, heaviest public query."""
    city = (city or "").strip().lower()[:60]
    key = f"site:homepage:c:{city}" if city else "site:homepage"
    return await cache_service.cached(key, 45, lambda: _homepage(city))


async def _service_demand(city: str):
    """Real demand signal: bookings per service in the last 90 days (optionally per city)."""
    from datetime import datetime, timedelta, timezone
    since = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    match = {"created_at": {"$gte": since}, "status": {"$nin": ["cancelled"]}}
    if city:
        match["address.city"] = {"$regex": f"^{city}$", "$options": "i"}
    rows = await db.bookings.aggregate([{"$match": match}, {"$group": {"_id": "$service_id", "n": {"$sum": 1}}}]).to_list(2000)
    return {r["_id"]: int(r["n"]) for r in rows if r.get("_id")}


async def _homepage(city: str = ""):
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    sections = await db.homepage_sections.find({"enabled": True}, {"_id": 0}).sort("order", 1).to_list(100)
    ac, asub = await _active_sets()
    all_services = await db.services.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    visible = [s for s in all_services if _visible(s, ac, asub)]
    demand = await _service_demand(city)
    global_demand = await _service_demand("") if city else demand
    for s in visible:
        s["booking_count"] = global_demand.get(s["id"], 0)
        s["local_booking_count"] = demand.get(s["id"], 0)
    per_cat = {}
    for s in visible:
        per_cat[s.get("category_id")] = per_cat.get(s.get("category_id"), 0) + 1
    cats = await db.categories.find({"status": "active"}, {"_id": 0}).sort("order", 1).to_list(500)
    for c in cats:
        c["service_count"] = per_cat.get(c["id"], 0)
    banners = await db.banners.find({"status": "active"}, {"_id": 0}).sort("order", 1).to_list(100)
    banners = [b for b in banners
               if (not b.get("start_date") or b["start_date"] <= now) and (not b.get("end_date") or b["end_date"] >= now)]
    coupons = await db.coupons.find({"status": "active"}, {"_id": 0}).to_list(50)
    faqs = await db.faqs.find({"status": "active"}, {"_id": 0}).to_list(50)
    # published blogs for the homepage "blog" section (respect draft/scheduled)
    _now_iso = now
    _blogs_raw = await db.blogs.find({"status": {"$ne": "draft"}}, {"_id": 0}).sort("created_at", -1).to_list(200)
    blogs = [b for b in _blogs_raw if not (b.get("publish_at") and b["publish_at"] > _now_iso)]

    out = []
    for sec in sections:
        cfg = sec.get("config", {}) or {}
        limit = int(cfg.get("limit", 8) or 8)
        t = sec.get("type")
        data = None
        if t in ("popular_categories", "featured_categories", "category_slider"):
            cl = cats
            if t == "featured_categories":
                cl = [c for c in cats if c.get("is_featured")]
            data = [c for c in cl if c.get("show_on_home", True)][:limit] or cl[:limit]
        elif t == "featured_services":
            data = [s for s in visible if s.get("is_featured")][:limit]
        elif t == "trending_services":
            # Real demand first (city-level when known), admin-flagged trending fills the rest.
            key = "local_booking_count" if city and any(s["local_booking_count"] for s in visible) else "booking_count"
            hot = sorted([s for s in visible if s.get(key, 0) > 0], key=lambda x: -x[key])
            flagged = [s for s in visible if s.get("is_trending") and s not in hot]
            data = (hot + flagged)[:limit]
            cfg = {**cfg, "demand_based": bool(hot), "city_based": key == "local_booking_count"}
        elif t in ("most_requested", "recommended_services", "service_collection"):
            ids = cfg.get("service_ids") or []
            if ids:
                data = [s for s in visible if s["id"] in ids][:limit]
            else:
                data = [s for s in visible if s.get("show_on_home", True)][:limit]
        elif t in ("hero_banner", "promo_banner", "slider"):
            bids = cfg.get("banner_ids") or []
            data = [b for b in banners if b["id"] in bids] if bids else banners
        elif t == "coupons":
            data = coupons[:limit]
        elif t == "faq":
            data = faqs[:limit]
        elif t in ("blog", "latest_blogs", "blogs", "insights"):
            data = blogs[:limit]
        else:
            data = cfg.get("items", [])
        out.append({"type": t, "title": sec.get("title", ""), "subtitle": sec.get("subtitle", ""),
                    "id": sec.get("id"), "config": cfg, "data": data})
    return out


def _public_coupon(c):
    dv = c.get("discount_value", 0)
    label = f"{int(dv)}% OFF" if c.get("discount_type") == "percentage" else f"\u20b9{int(dv)} OFF"
    return {
        "code": c.get("code"), "discount_type": c.get("discount_type"),
        "discount_value": dv, "min_order": c.get("min_order", 0),
        "max_discount": c.get("max_discount", 0),
        "title": c.get("title") or label, "label": label,
        "description": c.get("description") or (f"On orders above \u20b9{c.get('min_order')}" if c.get("min_order") else "On all services"),
        "valid_until": c.get("valid_until") or c.get("expires_at"),
    }


async def promotions():
    return await cache_service.cached("site:promotions", 60, _promotions)


async def _promotions():
    """Public marketing payload for the storefront: live coupons, offer cards and
    membership plans \u2014 all admin-controlled."""
    coupons = await db.coupons.find({"status": "active"}, {"_id": 0}).to_list(50)
    coupons = [c for c in coupons
               if not (c.get("usage_limit") and c.get("used", 0) >= c.get("usage_limit"))]
    offers = await db.offers.find({"status": "active"}, {"_id": 0}).sort("order", 1).to_list(50)
    plans = await db.membership_plans.find({"status": "active"}, {"_id": 0}).to_list(20)
    plans.sort(key=lambda p: (p.get("sort_order", 0), p.get("price", 0)))
    return {
        "coupons": [_public_coupon(c) for c in coupons],
        "offers": offers,
        "membership": plans,
    }


SEARCH_MAP = [
    ("users", ["name", "phone", "email"], "user"),
    ("services", ["name", "short_description", "category_name"], "service"),
    ("categories", ["name", "slug"], "category"),
    ("subcategories", ["name", "category_name"], "subcategory"),
    ("bookings", ["code", "service_name", "customer_name"], "booking"),
    ("coupons", ["code"], "coupon"),
    ("transactions", ["note", "kind"], "transaction"),
]


async def global_search(q):
    q = (q or "").strip()
    if not q:
        return {"query": q, "groups": []}
    groups = []
    for coll, fields, label in SEARCH_MAP:
        or_q = [{f: {"$regex": q, "$options": "i"}} for f in fields]
        rows = await db[coll].find({"$or": or_q}, {"_id": 0}).limit(8).to_list(8)
        if rows:
            groups.append({"type": label, "collection": coll, "count": len(rows), "results": rows})
    return {"query": q, "groups": groups}
