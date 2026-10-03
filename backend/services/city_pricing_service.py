"""Price Manager: city-wise service prices, categories, fees and rate cards.

One doc per city in db.city_pricing:
  {city, city_key, categories: [category_id], fees: {...},
   services: {service_id: {enabled, price, mrp, tiers: {label: {price, mrp}},
                           addons: {name: price}, plans: {plan_type: price}}},
   ratecards: {row_id: {service_charge, labour_charge, original_charge}}}
A configured city is STRICT: a service shows only when it has a price there and its
category is enabled. Requests with no city (or an unconfigured city) see nothing priced
by city — callers decide the fallback (see `active_doc`)."""
import contextvars
import copy
import re
from config.database import db, now_iso

current_city = contextvars.ContextVar("current_city", default="")
FEE_KEYS = ("global_visiting_charge", "min_service_amount_for_visiting", "emergency_fee",
            "platform_fee", "min_labour_charge")
_CACHE: dict = {}


def key(city) -> str:
    return re.sub(r"\s+", " ", str(city or "").strip().lower())


def bust():
    _CACHE.clear()


async def get_doc(city):
    k = key(city)
    if not k:
        return None
    if k.isdigit():
        area = await db.service_areas.find_one({"pincodes": {"$in": [k, int(k)]}}, {"_id": 0, "city": 1})
        k = key((area or {}).get("city")) or k
    if k not in _CACHE:
        _CACHE[k] = await db.city_pricing.find_one({"city_key": k}, {"_id": 0})
    return _CACHE[k]


async def active_doc(city=None):
    """City doc for the explicit city, else the request's X-City. No city → None (legacy
    pricing); a city with no Price Manager setup → empty doc (nothing is sold there)."""
    c = city if city else current_city.get()
    if not key(c):
        return None
    return await get_doc(c) or {"city": c, "categories": [], "services": {}, "fees": {}, "ratecards": {}}


def _num(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def apply_service(svc: dict, doc: dict):
    """Priced copy of `svc` for the city, or None when it is not sold there."""
    if not doc:
        return svc
    if svc.get("category_id") not in set(doc.get("categories") or []):
        return None
    sp = (doc.get("services") or {}).get(svc.get("id")) or {}
    if not sp.get("enabled", True):
        return None
    s = copy.deepcopy(svc)
    tiers = s.get("tiers") or []
    tp = sp.get("tiers") or {}
    if tiers:
        kept = []
        for t in tiers:
            p = tp.get(t.get("label") or "") or {}
            if _num(p.get("price")) is None or p.get("enabled") is False:
                continue
            t["price"] = _num(p["price"])
            t["original_price"] = _num(p.get("mrp")) or t["price"]
            kept.append(t)
        if not kept:
            return None
        s["tiers"] = kept
        price, mrp = kept[0]["price"], kept[0]["original_price"]
    else:
        price = _num(sp.get("price"))
        if price is None:
            if not s.get("is_subscription"):
                return None
            price = 0.0
        mrp = _num(sp.get("mrp")) or price
    s["base_price"] = mrp if mrp and mrp > price else price
    s["discounted_price"] = price
    ap = sp.get("addons") or {}
    s["addons"] = [dict(a, price=_num(ap[a.get("name")])) for a in (s.get("addons") or [])
                   if isinstance(a, dict) and _num(ap.get(a.get("name"))) is not None]
    if s.get("is_subscription"):
        pp = sp.get("plans") or {}
        s["subscription_plans"] = [dict(p, price=_num(pp[p.get("plan_type")])) for p in (s.get("subscription_plans") or [])
                                   if _num(pp.get(p.get("plan_type"))) is not None]
        if not s["subscription_plans"]:
            return None
    s["city_priced"] = doc.get("city")
    return s


async def filter_services(services: list, city=None) -> list:
    doc = await active_doc(city)
    if not doc:
        return services
    return [x for x in (apply_service(s, doc) for s in services) if x]


async def price_one(svc: dict, city=None):
    doc = await active_doc(city)
    return apply_service(svc, doc) if doc else svc


async def filter_categories(cats: list, city=None) -> list:
    doc = await active_doc(city)
    if not doc:
        return cats
    allowed = set(doc.get("categories") or [])
    return [c for c in cats if c.get("id") in allowed]


async def settings_for(settings: dict, city=None) -> dict:
    doc = await active_doc(city)
    if not doc:
        return settings
    fees = {k: v for k, v in (doc.get("fees") or {}).items() if k in FEE_KEYS and _num(v) is not None}
    out = dict(settings)
    out["business_config"] = {**(settings.get("business_config") or {}), **fees}
    if "emergency_fee" in fees:
        out["emergency_fee"] = fees["emergency_fee"]
    return out


async def apply_ratecard(card: dict, city=None) -> dict:
    doc = await active_doc(city)
    if not doc or not card:
        return card
    rp = doc.get("ratecards") or {}
    card = copy.deepcopy(card)
    for g in card.get("groups") or []:
        rows = []
        for r in g.get("rows") or []:
            o = rp.get(r.get("id")) or {}
            if not o.get("service_charge"):
                continue
            r.update({k: str(o.get(k) or "") for k in ("service_charge", "labour_charge", "original_charge")})
            rows.append(r)
        g["rows"] = rows
    card["groups"] = [g for g in card.get("groups") or [] if g["rows"]]
    return card


# ------------------------------------------------------------------ admin
async def list_cities():
    areas = await db.service_areas.find({}, {"_id": 0, "city": 1}).to_list(2000)
    names = {}
    for a in areas:
        if (a.get("city") or "").strip():
            names.setdefault(key(a["city"]), a["city"].strip())
    docs = {d["city_key"]: d async for d in db.city_pricing.find({}, {"_id": 0, "city_key": 1, "city": 1,
                                                                      "services": 1, "categories": 1, "updated_at": 1})}
    for k, d in docs.items():
        names.setdefault(k, d.get("city"))
    out = []
    for k, n in sorted(names.items(), key=lambda x: x[1]):
        d = docs.get(k) or {}
        priced = sum(1 for v in (d.get("services") or {}).values() if v.get("enabled", True))
        out.append({"city": n, "city_key": k, "configured": bool(d), "priced_services": priced,
                    "categories": len(d.get("categories") or []), "updated_at": d.get("updated_at")})
    return out


async def admin_city(city: str):
    from config.database import get_settings
    doc = await get_doc(city) or {}
    settings = await get_settings()
    biz = settings.get("business_config") or {}
    cats = await db.categories.find({}, {"_id": 0, "id": 1, "name": 1, "icon": 1, "image": 1, "status": 1,
                                         "order": 1}).sort("order", 1).to_list(500)
    svcs = await db.services.find({}, {"_id": 0, "id": 1, "name": 1, "category_id": 1, "category_name": 1,
                                       "image": 1, "status": 1, "tiers": 1, "addons": 1, "is_subscription": 1,
                                       "subscription_plans": 1}).sort("name", 1).to_list(3000)
    cards = await db.rate_cards.find({}, {"_id": 0}).to_list(500)
    defaults = {k: biz.get(k) for k in FEE_KEYS}
    defaults["emergency_fee"] = settings.get("emergency_fee")
    return {
        "city": doc.get("city") or city, "configured": bool(doc),
        "categories": doc.get("categories") or [], "fees": doc.get("fees") or {}, "fee_defaults": defaults,
        "prices": doc.get("services") or {}, "ratecards": doc.get("ratecards") or {},
        "all_categories": cats,
        "all_services": [{"id": s["id"], "name": s.get("name"), "category_id": s.get("category_id"),
                          "category_name": s.get("category_name"), "image": s.get("image"), "status": s.get("status"),
                          "tiers": [t.get("label") for t in (s.get("tiers") or []) if t.get("label")],
                          "addons": [a.get("name") for a in (s.get("addons") or []) if isinstance(a, dict) and a.get("name")],
                          "is_subscription": bool(s.get("is_subscription")),
                          "plans": [{"plan_type": p.get("plan_type"), "label": p.get("label") or p.get("plan_type")}
                                    for p in (s.get("subscription_plans") or [])]} for s in svcs],
        "rate_cards": [{"id": c.get("id"), "title": c.get("title"), "category_id": c.get("category_id"),
                        "groups": [{"id": g.get("id"), "name": g.get("name"),
                                    "rows": [{"id": r.get("id"), "description": r.get("description")}
                                             for r in g.get("rows") or []]} for g in c.get("groups") or []]}
                       for c in cards],
    }


async def save_city(city: str, data: dict, admin: dict = None):
    k = key(city)
    if not k:
        from fastapi import HTTPException
        raise HTTPException(400, "City is required")
    upd = {"city": city.strip(), "city_key": k, "updated_at": now_iso(), "updated_by": (admin or {}).get("id")}
    for f in ("categories", "fees", "services", "ratecards"):
        if f in data and data[f] is not None:
            upd[f] = data[f]
    await db.city_pricing.update_one({"city_key": k}, {"$set": upd}, upsert=True)
    bust()
    await _bust_public()
    return await admin_city(city)


async def copy_city(src: str, dst: str, pct: float = 0, admin: dict = None):
    s = await get_doc(src)
    if not s:
        from fastapi import HTTPException
        raise HTTPException(404, "Source city has no prices")
    f = 1 + float(pct or 0) / 100

    def adj(v):
        n = _num(v)
        return round(n * f, 2) if n is not None else v

    def walk(o):
        if isinstance(o, dict):
            return {kk: (adj(vv) if kk in ("price", "mrp") else walk(vv)) for kk, vv in o.items()}
        return o
    services = {}
    for sid, sp in (s.get("services") or {}).items():
        sp = walk(sp)
        sp["addons"] = {n: adj(v) for n, v in (sp.get("addons") or {}).items()}
        sp["plans"] = {n: adj(v) for n, v in (sp.get("plans") or {}).items()}
        services[sid] = sp
    return await save_city(dst, {"categories": s.get("categories") or [], "fees": s.get("fees") or {},
                                 "services": services, "ratecards": s.get("ratecards") or {}}, admin)


async def _bust_public():
    from services import cache_service as _cache
    await _cache.bust("catalog:services:all", "catalog:categories:active")
    await _cache.bust_prefix("site:")
    await _cache.bust_prefix("app:home")


async def seed_from_current():
    """One-time migration: every serviced city gets today's global prices/fees so the
    live app keeps working after the switch to strict city pricing."""
    if await db.city_pricing.count_documents({}):
        return 0
    from config.database import get_settings
    settings = await get_settings()
    biz = settings.get("business_config") or {}
    cats = [c["id"] for c in await db.categories.find({}, {"_id": 0, "id": 1}).to_list(500)]
    services = {}
    for s in await db.services.find({}, {"_id": 0}).to_list(3000):
        _b, _d = _num(s.get("base_price")) or 0, _num(s.get("discounted_price")) or 0
        sp = {"enabled": True, "price": _d if 0 < _d < _b else _b,
              "mrp": _num(s.get("base_price")),
              "tiers": {t.get("label"): {"price": _num(t.get("price")), "mrp": _num(t.get("original_price"))}
                        for t in (s.get("tiers") or []) if t.get("label")},
              "addons": {a.get("name"): _num(a.get("price")) for a in (s.get("addons") or [])
                         if isinstance(a, dict) and a.get("name")},
              "plans": {p.get("plan_type"): _num(p.get("price")) for p in (s.get("subscription_plans") or [])
                        if p.get("plan_type")}}
        services[s["id"]] = sp
    ratecards = {}
    for c in await db.rate_cards.find({}, {"_id": 0}).to_list(500):
        for g in c.get("groups") or []:
            for r in g.get("rows") or []:
                if r.get("id"):
                    ratecards[r["id"]] = {k: r.get(k) or "" for k in ("service_charge", "labour_charge", "original_charge")}
    fees = {k: biz.get(k) for k in FEE_KEYS if biz.get(k) is not None}
    fees["emergency_fee"] = settings.get("emergency_fee")
    n = 0
    for c in await list_cities():
        await db.city_pricing.update_one({"city_key": c["city_key"]}, {"$set": {
            "city": c["city"], "city_key": c["city_key"], "categories": cats, "fees": fees,
            "services": services, "ratecards": ratecards, "updated_at": now_iso(), "seeded": True}}, upsert=True)
        n += 1
    bust()
    return n
