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
    if card.get("category_id") not in set(doc.get("categories") or []):
        return None
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


def _sp_is_priced(sp: dict) -> bool:
    """A service entry counts as priced when it is enabled and has at least one positive price."""
    if not isinstance(sp, dict) or sp.get("enabled") is False:
        return False
    if (_num(sp.get("price")) or 0) > 0:
        return True
    for t in (sp.get("tiers") or {}).values():
        if isinstance(t, dict) and (_num(t.get("price")) or 0) > 0:
            return True
    for v in (sp.get("plans") or {}).values():
        if (_num(v) or 0) > 0:
            return True
    return False


# ------------------------------------------------------------------ admin
async def list_cities(include_all: bool = False):
    """Cities come ONLY from active Service Areas (source of truth). Inactive/removed
    areas are not offered for pricing. `include_all=True` keeps legacy behaviour for seeding."""
    q = {} if include_all else {"status": {"$ne": "inactive"}}
    areas = await db.service_areas.find(q, {"_id": 0, "city": 1, "status": 1}).to_list(2000)
    names, status = {}, {}
    for a in areas:
        c = (a.get("city") or "").strip()
        if not c:
            continue
        k = key(c)
        names.setdefault(k, c)
        if a.get("status") != "inactive":
            status[k] = "active"
        else:
            status.setdefault(k, "inactive")
    total_services = await db.services.count_documents({})
    docs = {d["city_key"]: d async for d in db.city_pricing.find({}, {"_id": 0, "city_key": 1, "city": 1,
                                                                      "services": 1, "categories": 1, "fees": 1,
                                                                      "updated_at": 1, "updated_by": 1})}
    out = []
    for k, n in sorted(names.items(), key=lambda x: x[1].lower()):
        d = docs.get(k) or {}
        priced = sum(1 for v in (d.get("services") or {}).values() if _sp_is_priced(v))
        out.append({"city": n, "city_key": k, "configured": bool(d), "status": status.get(k, "active"),
                    "priced_services": priced, "total_services": total_services,
                    "categories": len(d.get("categories") or []), "updated_at": d.get("updated_at"),
                    "updated_by": d.get("updated_by")})
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
        "updated_at": doc.get("updated_at"), "updated_by": doc.get("updated_by"),
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
        "rate_cards": [{"id": c.get("id"), "title": c.get("title"), "subtitle": c.get("subtitle"),
                        "brand_label": c.get("brand_label"), "accent_color": c.get("accent_color") or "#0D47A1",
                        "intro": c.get("intro"), "footer_note": c.get("footer_note"), "status": c.get("status"),
                        "category_id": c.get("category_id"), "category_name": c.get("category_name"),
                        "groups": [{"id": g.get("id"), "name": g.get("name"), "note": g.get("note"),
                                    "rows": [{"id": r.get("id"), "description": r.get("description"),
                                              "service_charge": r.get("service_charge") or "", "labour_charge": r.get("labour_charge") or "",
                                              "original_charge": r.get("original_charge") or "", "warranty": r.get("warranty") or "",
                                              "note": r.get("note") or "", "discount_pct": r.get("discount_pct") or 0}
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


async def copy_city(src: str, dst: str, pct: float = 0, admin: dict = None, include=None):
    s = await get_doc(src)
    if not s:
        from fastapi import HTTPException
        raise HTTPException(404, "Source city has no prices")
    f = 1 + float(pct or 0) / 100
    inc = set(include) if include else {"services", "addons", "mrp", "fees", "categories", "ratecards"}

    def adj(v):
        n = _num(v)
        return round(n * f, 2) if n is not None else v

    def walk(o):
        if isinstance(o, dict):
            return {kk: (adj(vv) if kk in ("price", "mrp") else walk(vv)) for kk, vv in o.items()}
        return o
    services = {}
    for sid, sp in (s.get("services") or {}).items():
        sp = walk(copy.deepcopy(sp))
        if "mrp" not in inc:
            src_sp = (s.get("services") or {}).get(sid) or {}
            sp.pop("mrp", None)
            for tk, tv in (sp.get("tiers") or {}).items():
                if isinstance(tv, dict):
                    tv.pop("mrp", None)
        sp["addons"] = {n: adj(v) for n, v in (sp.get("addons") or {}).items()} if "addons" in inc else {}
        sp["plans"] = {n: adj(v) for n, v in (sp.get("plans") or {}).items()}
        services[sid] = sp
    payload = {}
    if "services" in inc:
        payload["services"] = services
    if "categories" in inc:
        payload["categories"] = s.get("categories") or []
    if "fees" in inc:
        payload["fees"] = s.get("fees") or {}
    if "ratecards" in inc:
        payload["ratecards"] = s.get("ratecards") or {}
    return await save_city(dst, payload, admin)


async def apply_across(src: str, category_id: str, cities: list, admin: dict = None, include=None):
    """Push one category's config from `src` city to several target cities at once."""
    from fastapi import HTTPException
    s = await get_doc(src)
    if not s:
        raise HTTPException(404, "Source city has no prices")
    if not category_id:
        raise HTTPException(400, "Category is required")
    inc = set(include) if include else {"services", "ratecards"}
    svc_ids = {x["id"] for x in await db.services.find({"category_id": category_id}, {"_id": 0, "id": 1}).to_list(5000)}
    card = await db.rate_cards.find_one({"category_id": category_id}, {"_id": 0})
    row_ids = {r.get("id") for g in (card or {}).get("groups") or [] for r in g.get("rows") or [] if r.get("id")}
    src_services = s.get("services") or {}
    src_rc = s.get("ratecards") or {}
    applied = []
    for city in cities:
        if key(city) == key(src):
            continue
        doc = await get_doc(city) or {}
        services = dict(doc.get("services") or {})
        rc = dict(doc.get("ratecards") or {})
        cats = list(doc.get("categories") or [])
        if "services" in inc:
            for sid in svc_ids:
                if sid in src_services:
                    services[sid] = copy.deepcopy(src_services[sid])
            if category_id not in cats:
                cats.append(category_id)
        if "ratecards" in inc:
            for rid in row_ids:
                if rid in src_rc:
                    rc[rid] = copy.deepcopy(src_rc[rid])
        fees = copy.deepcopy(s.get("fees") or {}) if "fees" in inc else (doc.get("fees") or {})
        await save_city(city, {"services": services, "ratecards": rc, "categories": cats,
                               "fees": fees}, admin)
        applied.append(city)
    return {"applied": applied, "count": len(applied)}


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
    for c in await list_cities(include_all=True):
        await db.city_pricing.update_one({"city_key": c["city_key"]}, {"$set": {
            "city": c["city"], "city_key": c["city_key"], "categories": cats, "fees": fees,
            "services": services, "ratecards": ratecards, "updated_at": now_iso(), "seeded": True}}, upsert=True)
        n += 1
    bust()
    return n
