"""Enterprise SEO engine: settings, inheritance resolver, page index, audit, sitemap, robots, schema.

Every value is derived from live collections (categories, subcategories, services,
service_areas, city_pricing, bookings, blogs, pages) plus admin overrides. Nothing
is fabricated: ratings come from real booking reviews, prices from real records,
city availability from the Price Manager.
"""
import asyncio
import html
import json
import os
import re
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import HTTPException

from config.database import db, now_iso
from models.user import new_id

# ------------------------------------------------------------------ defaults
GLOBAL_DEFAULTS = {
    "site_title": "",
    "default_meta_title": "",
    "title_template": "{title} | {site_name}",
    "meta_description": "",
    "meta_keywords": "",
    "canonical_policy": "self",
    "preferred_host": "",
    "trailing_slash": False,
    "robots_default": "index,follow",
    "og_title": "",
    "og_description": "",
    "og_image": "",
    "twitter": "",
    "twitter_card": "summary_large_image",
    "org_name": "",
    "org_logo": "",
    "org_same_as": [],
    "org_phone": "",
    "locale": "en_IN",
    "language": "en",
    "service_title_template": "{name} — {category}",
    "category_title_template": "{name} Services",
    "city_title_template": "Home Services in {city}",
    "city_service_title_template": "{name} in {city}",
    "business_locations": [],
    "version": 0,
}

TECH_DEFAULTS = {
    "private_paths": ["/admin", "/account", "/partner", "/merchant", "/agent", "/login",
                      "/book", "/payment", "/api/admin", "/api/panel", "/__poster_dev"],
    "robots_custom": "",
    "sitemap_chunk_size": 5000,
    "include_blog": True,
    "include_static": True,
    "city_min_unique_chars": 250,
    "city_service_min_unique_chars": 300,
    "auto_slug_redirects": True,
    "version": 0,
}

ESSENTIAL_PREFIXES = ["/", "/service", "/services", "/category", "/city", "/blog", "/static",
                      "/assets", "/about", "/contact", "/membership", "/api/site", "/api/sitemap", "/sitemap"]

ROBOTS_TOKENS = {"index", "noindex", "follow", "nofollow", "noarchive", "nosnippet", "noimageindex",
                 "max-snippet:-1", "max-image-preview:large", "max-image-preview:standard",
                 "max-video-preview:-1", "notranslate"}

STATIC_PAGES = [
    ("home", "/", "Home", 1.0), ("services", "/services", "All Services", 0.9),
    ("membership", "/membership", "Membership", 0.6), ("blog", "/blog", "Blog", 0.6),
    ("about", "/about", "About Us", 0.4), ("contact", "/contact", "Contact Us", 0.4),
    ("privacy", "/privacy", "Privacy Policy", 0.2), ("terms", "/terms", "Terms & Conditions", 0.2),
    ("refund", "/refund", "Refund Policy", 0.2),
]

SEV_WEIGHT = {"critical": 25, "high": 12, "medium": 6, "low": 2, "info": 0}

# ------------------------------------------------------------------ sanitizers
_TAG = re.compile(r"<[^>]*>")
_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def clean_text(v, maxlen=600):
    if v is None:
        return ""
    s = _CTRL.sub("", _TAG.sub("", html.unescape(str(v)))).strip()
    return re.sub(r"\s+", " ", s)[:maxlen]


def clean_long(v, maxlen=8000):
    if v is None:
        return ""
    s = _CTRL.sub("", _TAG.sub("", html.unescape(str(v)))).strip()
    return s[:maxlen]


def safe_url(v, allow_relative=True):
    """Return a cleaned http(s) or relative URL; raise on unsafe schemes."""
    s = clean_text(v, 1000)
    if not s:
        return ""
    if s.startswith("/") and not s.startswith("//"):
        if allow_relative:
            return s
        raise HTTPException(400, f"Absolute URL required: {s}")
    p = urlparse(s)
    if p.scheme not in ("http", "https") or not p.netloc:
        raise HTTPException(400, f"Unsafe or invalid URL: {s[:80]}")
    return s


def clean_robots(v):
    toks = [t.strip().lower() for t in str(v or "").split(",") if t.strip()]
    bad = [t for t in toks if t not in ROBOTS_TOKENS]
    if bad:
        raise HTTPException(400, f"Unsupported robots directive: {', '.join(bad)}")
    if "index" in toks and "noindex" in toks:
        raise HTTPException(400, "Robots cannot contain both index and noindex")
    return ",".join(toks)


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")


def clean_path(v):
    s = clean_text(v, 500)
    if not s.startswith("/") or s.startswith("//") or " " in s:
        raise HTTPException(400, f"Path must start with a single '/': {s[:80]}")
    return s


def jsonld_safe(obj):
    """Serialize JSON-LD safely for embedding inside <script>."""
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


# ------------------------------------------------------------------ base url
def env_base():
    return (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")


def site_base(g=None):
    host = ((g or {}).get("preferred_host") or "").strip().rstrip("/")
    return host or env_base()


def abs_url(base, path):
    if not path:
        return base + "/"
    if path.startswith("http"):
        return path
    return base + path


# ------------------------------------------------------------------ settings
async def get_global():
    s = await db.settings.find_one({"id": "global"}, {"_id": 0, "seo": 1, "branding": 1}) or {}
    g = {**GLOBAL_DEFAULTS, **(s.get("seo") or {})}
    br = s.get("branding") or {}
    g["_site_name"] = br.get("site_name") or "AzoApp"
    g["_brand_logo"] = br.get("logo") or br.get("logo_light") or ""
    g["_brand_phone"] = br.get("phone") or ""
    return g


async def get_tech():
    doc = await db.settings.find_one({"id": "seo_technical"}, {"_id": 0}) or {}
    return {**TECH_DEFAULTS, **{k: v for k, v in doc.items() if k != "id"}}


GLOBAL_TEXT = {"site_title": 120, "default_meta_title": 120, "title_template": 120, "meta_description": 400,
               "meta_keywords": 500, "og_title": 160, "og_description": 400, "twitter": 60, "org_name": 160,
               "org_phone": 40, "locale": 10, "language": 10, "service_title_template": 120,
               "category_title_template": 120, "city_title_template": 120, "city_service_title_template": 120}


async def save_global(data: dict, admin: dict):
    cur = await get_global()
    exp = data.get("version")
    if exp is not None and int(exp) != int(cur.get("version") or 0):
        raise HTTPException(409, "These settings were changed by someone else. Reload to see the latest version.")
    upd = {}
    for k, mx in GLOBAL_TEXT.items():
        if k in data:
            upd[k] = clean_text(data[k], mx)
    for k in ("og_image", "org_logo", "preferred_host"):
        if k in data:
            upd[k] = safe_url(data[k], allow_relative=(k != "preferred_host"))
    if upd.get("preferred_host"):
        p = urlparse(upd["preferred_host"])
        upd["preferred_host"] = f"{p.scheme}://{p.netloc}"
    if "robots_default" in data:
        upd["robots_default"] = clean_robots(data["robots_default"]) or "index,follow"
    if "canonical_policy" in data:
        if data["canonical_policy"] not in ("self", "preferred_host"):
            raise HTTPException(400, "Invalid canonical policy")
        upd["canonical_policy"] = data["canonical_policy"]
    if "trailing_slash" in data:
        upd["trailing_slash"] = bool(data["trailing_slash"])
    if "twitter_card" in data:
        upd["twitter_card"] = "summary" if data["twitter_card"] == "summary" else "summary_large_image"
    if "org_same_as" in data:
        upd["org_same_as"] = [safe_url(u, False) for u in (data["org_same_as"] or []) if str(u).strip()][:10]
    if "business_locations" in data:
        locs = []
        for loc in (data["business_locations"] or [])[:20]:
            nm, street, city = clean_text(loc.get("name"), 120), clean_text(loc.get("street"), 200), clean_text(loc.get("city"), 80)
            if not (nm and street and city):
                raise HTTPException(400, "Each business location needs a name, street address and city")
            locs.append({"name": nm, "street": street, "city": city, "state": clean_text(loc.get("state"), 80),
                         "postal_code": clean_text(loc.get("postal_code"), 12), "phone": clean_text(loc.get("phone"), 30),
                         "country": clean_text(loc.get("country"), 4) or "IN"})
        upd["business_locations"] = locs
    for t in ("title_template",):
        if t in upd and "{title}" not in upd[t]:
            raise HTTPException(400, "Title template must contain {title}")
    upd["version"] = int(cur.get("version") or 0) + 1
    upd["updated_at"] = now_iso()
    upd["updated_by"] = (admin or {}).get("name") or (admin or {}).get("phone") or ""
    cv = int(cur.get("version") or 0)
    flt = {"id": "global", "$or": [{"seo.version": cv}] + ([{"seo.version": {"$exists": False}}] if cv == 0 else [])}
    res = await db.settings.update_one(flt, {"$set": {f"seo.{k}": v for k, v in upd.items()}})
    if res.matched_count == 0:
        raise HTTPException(409, "Settings changed while saving. Reload and try again.")
    await invalidate("global_seo")
    return await get_global()


async def reset_global(admin: dict):
    cur = await get_global()
    keep = {k: cur.get(k) for k in ("site_title", "meta_description")}
    upd = {**GLOBAL_DEFAULTS, **{k: v for k, v in keep.items() if v}, "version": int(cur.get("version") or 0) + 1,
           "updated_at": now_iso()}
    await db.settings.update_one({"id": "global"}, {"$set": {f"seo.{k}": v for k, v in upd.items()}})
    await invalidate("global_seo_reset")
    return await get_global()


async def save_tech(data: dict):
    cur = await get_tech()
    if data.get("version") is not None and int(data["version"]) != int(cur.get("version") or 0):
        raise HTTPException(409, "Technical settings changed elsewhere. Reload first.")
    upd = {}
    if "private_paths" in data:
        paths = [clean_path(p) for p in data["private_paths"] if str(p).strip()]
        for p in paths:
            if p in ("/",) or any(p == e or e.startswith(p + "/") for e in ESSENTIAL_PREFIXES if e != "/"):
                raise HTTPException(400, f"'{p}' would block essential public pages or assets")
        upd["private_paths"] = paths[:60]
    if "robots_custom" in data:
        lines = []
        for ln in str(data["robots_custom"] or "").splitlines()[:100]:
            ln = clean_text(ln, 300)
            if not ln or ln.startswith("#"):
                lines.append(ln)
                continue
            m = re.match(r"^(user-agent|allow|disallow|crawl-delay|sitemap)\s*:\s*(.*)$", ln, re.I)
            if not m:
                raise HTTPException(400, f"Invalid robots.txt line: {ln[:80]}")
            if m.group(1).lower() == "disallow":
                v = m.group(2).strip()
                if v == "/" or any(v.rstrip("*") == e for e in ESSENTIAL_PREFIXES):
                    raise HTTPException(400, f"Refusing to disallow essential path '{v}'")
            lines.append(ln)
        upd["robots_custom"] = "\n".join(lines)
    for k, lo, hi in (("sitemap_chunk_size", 100, 50000), ("city_min_unique_chars", 50, 5000),
                      ("city_service_min_unique_chars", 100, 5000)):
        if k in data:
            upd[k] = max(lo, min(hi, int(data[k] or 0)))
    for k in ("include_blog", "include_static", "auto_slug_redirects"):
        if k in data:
            upd[k] = bool(data[k])
    upd["version"] = int(cur.get("version") or 0) + 1
    upd["updated_at"] = now_iso()
    await db.settings.update_one({"id": "seo_technical"}, {"$set": {"id": "seo_technical", **upd}}, upsert=True)
    await invalidate("technical")
    return await get_tech()


# ------------------------------------------------------------------ cache
_INDEX = {"data": None, "ts": 0}
_LOCK = asyncio.Lock()
INDEX_TTL = 300


async def invalidate(reason="update"):
    _INDEX["data"] = None
    try:
        from services import cache_service
        await cache_service.bust_prefix("site:")
    except Exception:  # noqa: BLE001
        pass
    await db.settings.update_one({"id": "seo_sitemap"}, {"$set": {"id": "seo_sitemap", "stale": True,
                                                                     "stale_reason": reason, "stale_at": now_iso()}}, upsert=True)


async def get_index(force=False):
    if not force and _INDEX["data"] and time.time() - _INDEX["ts"] < INDEX_TTL:
        return _INDEX["data"]
    async with _LOCK:
        if not force and _INDEX["data"] and time.time() - _INDEX["ts"] < INDEX_TTL:
            return _INDEX["data"]
        data = await _build_index()
        _INDEX.update(data=data, ts=time.time())
        return data


# ------------------------------------------------------------------ helpers
def _tpl(t, ctx):
    try:
        out = t
        for k, v in ctx.items():
            out = out.replace("{" + k + "}", str(v or ""))
        return re.sub(r"\s+", " ", re.sub(r"\s*[—|-]\s*$", "", out)).strip()
    except Exception:  # noqa: BLE001
        return ""


def _trim(s, n=158):
    s = clean_text(s, 2000)
    if len(s) <= n:
        return s
    cut = s[:n].rsplit(" ", 1)[0]
    return cut.rstrip(",.;:") + "…"


def _pick(levels, field):
    """First non-empty value from ordered (source, dict) levels."""
    for src, d in levels:
        v = (d or {}).get(field)
        if v not in (None, "", []):
            return v, src
    return "", "none"


def _ts(*vals):
    for v in vals:
        if v:
            return str(v)
    return ""


def _price_str(svc):
    p = svc.get("discounted_price") or svc.get("base_price") or 0
    try:
        p = float(p)
    except (TypeError, ValueError):
        return ""
    return f"₹{int(p)}" if p > 0 else ""


# ------------------------------------------------------------------ index build
async def _build_index():
    g = await get_global()
    tech = await get_tech()
    base = site_base(g)
    site_name = g["_site_name"]
    from services.city_service import _cities
    from services.city_pricing_service import apply_service, get_doc

    cats = await db.categories.find({}, {"_id": 0}).to_list(3000)
    subs = await db.subcategories.find({}, {"_id": 0}).to_list(5000)
    svcs = await db.services.find({}, {"_id": 0, "addons": 0, "tiers": 0}).to_list(10000)
    redirects = await db.redirects.find({}, {"_id": 0}).to_list(5000)
    redirect_from = {r.get("from_path"): r for r in redirects if r.get("from_path")}
    cat_by = {c["id"]: c for c in cats}
    sub_by = {s["id"]: s for s in subs}
    active_cats = {c["id"] for c in cats if c.get("status") == "active"}
    active_subs = {s["id"] for s in subs if s.get("status") == "active"}

    # real ratings from bookings
    rating_by_svc = {}
    async for r in db.bookings.aggregate([
        {"$match": {"review.rating": {"$gt": 0}}},
        {"$group": {"_id": "$service_id", "avg": {"$avg": "$review.rating"}, "n": {"$sum": 1}}},
    ]):
        if r["_id"]:
            rating_by_svc[r["_id"]] = (round(float(r["avg"]), 1), int(r["n"]))

    cities = await _cities()
    city_overrides = {c["slug"]: c for c in await db.seo_cities.find({}, {"_id": 0}).to_list(2000)}
    city_pages = await db.seo_city_pages.find({}, {"_id": 0}).to_list(5000)
    city_docs = {}
    for c in cities:
        city_docs[c["slug"]] = await get_doc(c["city"])

    pages = []
    svc_count_by_cat = {}
    for s in svcs:
        svc_count_by_cat[s.get("category_id")] = svc_count_by_cat.get(s.get("category_id"), 0) + 1

    gl_levels = [("global", {"robots": g.get("robots_default"), "og_image": g.get("og_image"),
                             "keywords": g.get("meta_keywords")})]

    def finalize(p, levels, auto_title, auto_desc):
        ov = p["override"]
        title, tsrc = _pick([("page", ov)] + levels, "title")
        if not title:
            title, tsrc = auto_title, "auto"
        desc, dsrc = _pick([("page", ov)] + levels, "description")
        if not desc:
            desc, dsrc = auto_desc, "auto"
        robots, rsrc = _pick([("page", ov)] + levels + gl_levels, "robots")
        og_image, osrc = _pick([("page", ov)] + levels + [("record", {"og_image": p.get("image")})] + gl_levels, "og_image")
        kw, _ = _pick([("page", ov)] + levels + gl_levels, "keywords")
        canon = (ov.get("canonical") or "").strip() or abs_url(base, p["path"])
        if g.get("trailing_slash") and not canon.endswith("/"):
            canon += "/"
        p["resolved"] = {
            "title": clean_text(title, 200), "full_title": _full_title(g, title, site_name),
            "description": clean_text(desc, 400), "robots": robots or "index,follow",
            "canonical": canon, "keywords": kw if isinstance(kw, str) else ", ".join(kw or []),
            "og_title": ov.get("og_title") or _full_title(g, title, site_name),
            "og_description": ov.get("og_description") or clean_text(desc, 300),
            "og_image": og_image or "", "image_alt": ov.get("image_alt") or "",
        }
        p["sources"] = {"title": tsrc, "description": dsrc, "robots": rsrc, "og_image": osrc}
        p["custom"] = bool(ov.get("title") or ov.get("description"))
        return p

    # static pages
    if tech.get("include_static"):
        page_docs = {d.get("key"): d for d in await db.pages.find({}, {"_id": 0, "key": 1, "seo": 1, "title": 1, "updated_at": 1, "body": 1}).to_list(500) if d.get("key")}
        for key, path, label, prio in STATIC_PAGES:
            pd = page_docs.get(key) or {}
            ps = pd.get("seo") or {}
            ov = {"title": ps.get("seo_title"), "description": ps.get("meta_description"),
                  "canonical": ps.get("canonical_url"), "og_image": ps.get("og_image"),
                  "robots": None if ps.get("robots_index", True) else "noindex,follow"}
            if key == "home":
                ov = {"title": g.get("default_meta_title") or g.get("site_title"), "description": g.get("meta_description"),
                      "og_image": g.get("og_image"), "og_title": g.get("og_title"), "og_description": g.get("og_description")}
            p = {"key": f"static:{key}", "type": "static", "entity_id": key, "name": label, "path": path,
                 "published": True, "override": {k: v for k, v in ov.items() if v}, "priority": prio,
                 "updated_at": _ts(pd.get("updated_at"), g.get("updated_at")), "content_len": len(clean_text(pd.get("body"), 20000)),
                 "category_id": "", "category_name": "", "city": "", "image": "", "linked": True}
            finalize(p, [], f"{label}" if key != "home" else (g.get("site_title") or site_name),
                     g.get("meta_description") or f"{site_name} — book verified home service professionals.")
            if key == "home":
                p["resolved"]["full_title"] = clean_text(p["resolved"]["title"], 200)
            pages.append(p)

    # categories + subcategories
    for c in cats:
        seo = c.get("seo") or {}
        path = f"/category/{c.get('slug') or c['id']}"
        n = svc_count_by_cat.get(c["id"], 0)
        p = {"key": f"category:{c['id']}", "type": "category", "entity_id": c["id"], "name": c.get("name") or "",
             "path": path, "slug": c.get("slug") or "", "published": c.get("status") == "active", "override": seo,
             "defaults": c.get("seo_defaults") or {}, "priority": 0.8, "category_id": c["id"], "category_name": c.get("name"),
             "city": "", "image": c.get("image") or "", "updated_at": _ts(c.get("updated_at"), c.get("created_at")),
             "content_len": len(clean_text(c.get("description"), 5000)), "linked": c.get("status") == "active",
             "service_count": n}
        ctx = {"name": c.get("name"), "category": c.get("name"), "site_name": site_name}
        auto_desc = _trim(f"{clean_text(c.get('description'))} Book {n} verified {c.get('name')} service{'s' if n != 1 else ''} with {site_name}." if c.get("description") else f"Book verified {c.get('name')} services with {site_name}.")
        finalize(p, [], _tpl(g.get("category_title_template") or "{name} Services", ctx), auto_desc)
        pages.append(p)
    for s in subs:
        seo = s.get("seo") or {}
        parent = cat_by.get(s.get("category_id")) or {}
        path = f"/category/{s.get('slug') or s['id']}"
        p = {"key": f"subcategory:{s['id']}", "type": "subcategory", "entity_id": s["id"], "name": s.get("name") or "",
             "path": path, "slug": s.get("slug") or "",
             "published": s.get("status") == "active" and parent.get("status") == "active", "override": seo,
             "defaults": s.get("seo_defaults") or {}, "priority": 0.7, "category_id": s.get("category_id"),
             "category_name": parent.get("name") or "", "city": "", "image": s.get("image") or parent.get("image") or "",
             "updated_at": _ts(s.get("updated_at"), s.get("created_at")), "content_len": len(clean_text(s.get("description"), 5000)),
             "linked": s.get("status") == "active"}
        ctx = {"name": s.get("name"), "category": parent.get("name"), "site_name": site_name}
        lv = [("category_defaults", parent.get("seo_defaults") or {})]
        finalize(p, lv, _tpl(g.get("category_title_template") or "{name} Services", ctx),
                 _trim(clean_text(s.get("description")) or f"Book {s.get('name')} under {parent.get('name') or 'home services'} with {site_name}."))
        pages.append(p)

    # services
    served_by_svc = {}
    for s in svcs:
        cat = cat_by.get(s.get("category_id")) or {}
        sub = sub_by.get(s.get("subcategory_id")) or {}
        visible = (s.get("status") == "active" and s.get("approval_status", "approved") == "approved"
                   and s.get("category_id") in active_cats and (not s.get("subcategory_id") or s.get("subcategory_id") in active_subs)
                   and not (s.get("source") == "custom_job"))
        served = [c["city"] for c in cities if city_docs.get(c["slug"]) and apply_service(s, city_docs[c["slug"]])]
        served_by_svc[s["id"]] = served
        rating = rating_by_svc.get(s["id"])
        seo = s.get("seo") or {}
        ctx = {"name": s.get("name"), "category": cat.get("name"), "subcategory": sub.get("name"),
               "site_name": site_name, "price": _price_str(s)}
        desc_src = s.get("short_description") or s.get("description") or ""
        bits = [clean_text(desc_src)]
        if _price_str(s):
            bits.append(f"Starting at {_price_str(s)}.")
        if rating:
            bits.append(f"Rated {rating[0]}★ by {rating[1]} customer{'s' if rating[1] != 1 else ''}.")
        if served:
            bits.append(f"Available in {', '.join(served[:4])}.")
        auto_desc = _trim(" ".join(b for b in bits if b)) or f"Book {s.get('name')} with {site_name}."
        p = {"key": f"service:{s['id']}", "type": "service", "entity_id": s["id"], "name": s.get("name") or "",
             "path": f"/service/{s.get('slug') or s['id']}", "slug": s.get("slug") or "", "published": visible,
             "override": seo, "priority": 0.7, "category_id": s.get("category_id"), "category_name": cat.get("name") or "",
             "subcategory_name": sub.get("name") or "", "city": "", "image": s.get("image") or ((s.get("gallery") or [None])[0] or ""),
             "gallery": s.get("gallery") or [], "updated_at": _ts(s.get("updated_at"), s.get("created_at")),
             "content_len": len(clean_text(s.get("description"), 20000)) + len(clean_text(s.get("short_description"), 2000)),
             "linked": visible, "served_cities": served, "rating": rating, "price": _price_str(s)}
        tpl = (sub.get("seo_defaults") or {}).get("title_template") or (cat.get("seo_defaults") or {}).get("title_template") \
            or g.get("service_title_template") or "{name} — {category}"
        lv = [("subcategory_defaults", sub.get("seo_defaults") or {}), ("category_defaults", cat.get("seo_defaults") or {})]
        lv = [(n, {k: v for k, v in d.items() if k != "title_template"}) for n, d in lv]
        finalize(p, lv, _tpl(tpl, ctx), auto_desc)
        pages.append(p)

    # cities
    min_city = int(tech.get("city_min_unique_chars") or 250)
    served_slugs = {c["slug"] for c in cities}
    svc_by_id = {s["id"]: s for s in svcs}
    pub_svc = {pp["entity_id"] for pp in pages if pp["type"] == "service" and pp["published"]}
    page_by_key = {pp["key"]: pp for pp in pages}
    for c in cities:
        ov = city_overrides.get(c["slug"]) or {}
        avail_pub = [sid for sid, cl in served_by_svc.items() if c["city"] in cl and sid in pub_svc]
        unique_len = len(clean_text(ov.get("intro"), 20000))
        reasons = []
        if not avail_pub:
            reasons.append("No published service is priced/available in this city (Price Manager)")
        if ov.get("indexable") is False:
            reasons.append("Admin disabled indexing")
        eligible = not reasons
        p = {"key": f"city:{c['slug']}", "type": "city", "entity_id": c["slug"], "name": c["city"],
             "path": f"/city/{c['slug']}", "slug": c["slug"], "published": True, "override": ov, "priority": 0.8,
             "category_id": "", "category_name": "", "city": c["city"], "image": "", "linked": True,
             "updated_at": _ts(ov.get("updated_at")), "content_len": unique_len,
             "areas": c.get("areas") or [], "pincodes": c.get("pincodes") or [], "partners": c.get("partners", 0),
             "bookings": c.get("bookings", 0), "available_services": len(avail_pub), "served": True,
             "eligible": eligible, "eligibility_reasons": reasons, "thin": unique_len < min_city,
             "state": ov.get("state") or "", "country": ov.get("country") or "India"}
        ctx = {"city": c["city"], "site_name": site_name}
        cat_names = sorted({(cat_by.get((svc_by_id.get(sid) or {}).get("category_id")) or {}).get("name") for sid in avail_pub} - {None})
        auto_desc = _trim(f"Book verified professionals in {c['city']} for {', '.join(cat_names[:5]) or 'home services'}. "
                          f"{len(avail_pub)} services available" + (f" across {', '.join(c['areas'][:3])}." if c.get("areas") else "."))
        if not eligible:
            p["override"] = {**ov, "robots": "noindex,follow"}
        finalize(p, [], _tpl(g.get("city_title_template") or "Home Services in {city}", ctx), auto_desc)
        pages.append(p)
    for slug, ov in city_overrides.items():
        if slug not in served_slugs:
            pages.append({"key": f"city:{slug}", "type": "city", "entity_id": slug, "name": ov.get("city") or slug,
                          "path": f"/city/{slug}", "slug": slug, "published": False, "override": ov, "served": False,
                          "eligible": False, "eligibility_reasons": ["City is not served (no active service area)"],
                          "category_id": "", "category_name": "", "city": ov.get("city") or slug, "image": "", "linked": False,
                          "updated_at": _ts(ov.get("updated_at")), "content_len": 0, "priority": 0.0,
                          "resolved": {"title": ov.get("title") or "", "full_title": ov.get("title") or "", "description": ov.get("description") or "",
                                       "robots": "noindex,follow", "canonical": abs_url(base, f"/city/{slug}"), "keywords": "",
                                       "og_title": "", "og_description": "", "og_image": "", "image_alt": ""},
                          "sources": {}, "custom": False})

    # city-service pages (opt-in only)
    min_cs = int(tech.get("city_service_min_unique_chars") or 300)
    intros = {}
    city_by_slug = {c["slug"]: c for c in cities}
    for cp in city_pages:
        svc = svc_by_id.get(cp.get("service_id")) or {}
        city = city_by_slug.get(cp.get("city_slug"))
        svc_page = page_by_key.get(f"service:{cp.get('service_id')}")
        intro = clean_text(cp.get("intro"), 20000)
        reasons = []
        if not city:
            reasons.append("City is not served")
        elif not (city_docs.get(city["slug"]) and svc and apply_service(svc, city_docs[city["slug"]])):
            reasons.append("Service is not available in this city (Price Manager)")
        if not svc_page or not svc_page["published"]:
            reasons.append("Service is not published")
        if len(intro) < min_cs:
            reasons.append(f"Local content too thin ({len(intro)}/{min_cs} unique characters)")
        if cp.get("status") != "published":
            reasons.append("Page is a draft")
        if cp.get("indexable") is False:
            reasons.append("Admin disabled indexing")
        key_intro = intro.lower()[:400]
        if key_intro and key_intro in intros:
            reasons.append(f"Local content duplicates {intros[key_intro]}")
        intros.setdefault(key_intro, cp.get("path"))
        city_name = (city or {}).get("city") or cp.get("city_slug")
        priced = apply_service(svc, city_docs.get(cp.get("city_slug"))) if svc and city_docs.get(cp.get("city_slug")) else None
        p = {"key": f"city_service:{cp['id']}", "type": "city_service", "entity_id": cp["id"],
             "name": f"{svc.get('name') or 'Service'} in {city_name}", "path": cp.get("path"),
             "published": cp.get("status") == "published" and bool(city) and bool(svc_page and svc_page["published"]),
             "override": cp, "priority": 0.6, "category_id": svc.get("category_id"),
             "category_name": (cat_by.get(svc.get("category_id")) or {}).get("name") or "", "city": city_name,
             "image": svc.get("image") or "", "updated_at": _ts(cp.get("updated_at"), cp.get("created_at")),
             "content_len": len(intro), "eligible": not reasons, "eligibility_reasons": reasons,
             "service_id": svc.get("id"), "city_slug": cp.get("city_slug"), "thin": len(intro) < min_cs,
             "linked": cp.get("status") == "published", "price": _price_str(priced) if priced else ""}
        ctx = {"name": svc.get("name"), "city": city_name, "category": p["category_name"], "site_name": site_name}
        if reasons:
            p["override"] = {**cp, "robots": "noindex,follow"}
        auto_desc = _trim(f"{svc.get('name')} in {city_name}" + (f" from {p['price']}" if p["price"] else "") + f". {intro}")
        finalize(p, [], _tpl(g.get("city_service_title_template") or "{name} in {city}", ctx), auto_desc)
        pages.append(p)

    # blog
    if tech.get("include_blog"):
        for b in await db.blogs.find({}, {"_id": 0, "body": 0, "content": 0}).to_list(3000):
            bs = b.get("seo") or {}
            ov = {"title": bs.get("seo_title"), "description": bs.get("meta_description"), "canonical": bs.get("canonical_url"),
                  "og_image": bs.get("og_image"), "robots": None if bs.get("robots_index", True) else "noindex,follow"}
            p = {"key": f"blog:{b['id']}", "type": "blog", "entity_id": b["id"], "name": b.get("title") or "",
                 "path": f"/blog/{b.get('slug') or b['id']}", "published": b.get("status") == "published",
                 "override": {k: v for k, v in ov.items() if v}, "priority": 0.5, "category_id": "", "category_name": b.get("category") or "",
                 "city": "", "image": b.get("image") or "", "updated_at": _ts(b.get("updated_at"), b.get("created_at")),
                 "content_len": len(clean_text(b.get("excerpt"), 2000)) + 500, "linked": b.get("status") == "published"}
            finalize(p, [], b.get("title") or "", _trim(b.get("excerpt") or b.get("title") or ""))
            pages.append(p)

    # redirect shadowing + indexability + audit
    for p in pages:
        p["redirected"] = p["path"] in redirect_from
        p["indexable"] = _indexable(p, base)
    _audit(pages, g, base, tech)
    by_path = {p["path"]: p for p in pages}
    for p in pages:
        if p["type"] == "service":
            by_path.setdefault(f"/service/{p['entity_id']}", p)
        if p["type"] in ("category", "subcategory"):
            by_path.setdefault(f"/category/{p['entity_id']}", p)
    return {"pages": pages, "by_key": {p["key"]: p for p in pages}, "by_path": by_path, "global": g, "tech": tech,
            "base": base, "built_at": now_iso(), "redirects": redirects, "cities": cities}


def _full_title(g, title, site_name):
    title = clean_text(title, 200)
    if not title:
        return site_name
    if site_name.lower() in title.lower():
        return title
    return _tpl(g.get("title_template") or "{title} | {site_name}", {"title": title, "site_name": site_name})


def _indexable(p, base):
    r = p["resolved"]
    if not p.get("published") or p.get("redirected"):
        return False
    if "noindex" in (r.get("robots") or ""):
        return False
    if p.get("type") in ("city", "city_service") and not p.get("eligible", True):
        return False
    canon = r.get("canonical") or ""
    return canon.rstrip("/") == abs_url(base, p["path"]).rstrip("/")


# ------------------------------------------------------------------ audit rules
def _issue(code, severity, message, fix=""):
    return {"code": code, "severity": severity, "message": message, "fix": fix}


ISSUE_LABELS = {
    "missing_title": "Missing title", "title_long": "Title too long", "title_short": "Title too short",
    "duplicate_title": "Duplicate title", "missing_description": "Missing description",
    "description_short": "Description too short", "description_long": "Description too long",
    "generic_description": "Generic description", "duplicate_description": "Duplicate description",
    "invalid_canonical": "Invalid canonical", "canonical_elsewhere": "Canonical points elsewhere",
    "unintended_noindex": "Noindex on published page", "missing_alt": "Missing image alt text",
    "thin_content": "Thin content", "no_slug": "No URL slug", "redirect_shadow": "URL is redirected",
    "not_eligible": "Not eligible for indexing", "no_image": "No social image", "orphan": "No internal links",
    "unpublished": "Not published",
}


def _audit(pages, g, base, tech):
    host = urlparse(base).netloc
    live = [p for p in pages if p.get("published") and not p.get("redirected")]
    tcount, dcount = {}, {}
    for p in live:
        t = (p["resolved"].get("full_title") or "").lower()
        d = (p["resolved"].get("description") or "").lower()
        if t:
            tcount[t] = tcount.get(t, 0) + 1
        if d:
            dcount[d] = dcount.get(d, 0) + 1
    gdesc = (g.get("meta_description") or "").strip().lower()
    for p in pages:
        r = p["resolved"]
        iss = []
        t, d = r.get("full_title") or "", r.get("description") or ""
        if not p.get("published"):
            iss.append(_issue("unpublished", "info", "Page is not publicly visible, so it is excluded from the sitemap."))
        if not t:
            iss.append(_issue("missing_title", "critical", "No title tag could be generated.", "Add an SEO title."))
        elif len(t) > 65:
            iss.append(_issue("title_long", "low", f"Title is {len(t)} chars; search results usually truncate around 60.", "Shorten the SEO title."))
        elif len(t) < 15:
            iss.append(_issue("title_short", "low", f"Title is only {len(t)} chars.", "Make the title more descriptive."))
        if p.get("published") and t and tcount.get(t.lower(), 0) > 1:
            iss.append(_issue("duplicate_title", "high", f"{tcount[t.lower()]} published pages share this title.", "Give each page a unique title."))
        if not d:
            iss.append(_issue("missing_description", "high", "No meta description.", "Write a 120–160 character summary."))
        else:
            if len(d) < 50:
                iss.append(_issue("description_short", "medium", f"Description is only {len(d)} chars.", "Expand to ~120–160 chars."))
            elif len(d) > 170:
                iss.append(_issue("description_long", "low", f"Description is {len(d)} chars and may be truncated.", "Trim to ~160 chars."))
            if p["type"] != "static" and gdesc and d.strip().lower() == gdesc:
                iss.append(_issue("generic_description", "medium", "Uses the site-wide default description.", "Write a page-specific description."))
            if p.get("published") and dcount.get(d.lower(), 0) > 1:
                iss.append(_issue("duplicate_description", "medium", f"{dcount[d.lower()]} published pages share this description.", "Make it unique."))
        canon = r.get("canonical") or ""
        cp = urlparse(canon)
        if cp.scheme not in ("http", "https") or not cp.netloc:
            iss.append(_issue("invalid_canonical", "critical", f"Canonical URL is invalid: {canon[:80]}", "Use an absolute https URL."))
        elif cp.netloc != host:
            iss.append(_issue("invalid_canonical", "high", f"Canonical host {cp.netloc} differs from preferred host {host}.", "Use the preferred domain."))
        elif canon.rstrip("/") != abs_url(base, p["path"]).rstrip("/"):
            iss.append(_issue("canonical_elsewhere", "info", f"Canonical points to {cp.path}; this URL is excluded from the sitemap."))
        if p.get("published") and "noindex" in (r.get("robots") or "") and p.get("eligible", True):
            iss.append(_issue("unintended_noindex", "medium", "Published page carries a noindex directive.", "Remove noindex if this page should rank."))
        if p.get("type") in ("city", "city_service") and not p.get("eligible", True):
            iss.append(_issue("not_eligible", "info", "; ".join(p.get("eligibility_reasons") or []) or "Not eligible."))
        if p.get("image") and not r.get("image_alt") and p["type"] in ("service", "category", "subcategory"):
            iss.append(_issue("missing_alt", "low", "Main image has no descriptive alt text (falls back to the page name).", "Add alt text in the SEO editor."))
        if not r.get("og_image") and p["type"] != "static":
            iss.append(_issue("no_image", "low", "No social sharing image.", "Upload an OG image."))
        if p["type"] == "service" and p.get("content_len", 0) < 120:
            iss.append(_issue("thin_content", "medium", f"Service description is only {p.get('content_len', 0)} characters.", "Add a richer description of what is included."))
        if p["type"] == "city" and p.get("thin"):
            iss.append(_issue("thin_content", "low", f"Local intro has {p.get('content_len', 0)} characters (recommended ≥ {tech.get('city_min_unique_chars')}).", "Add genuine local coverage details."))
        if p["type"] in ("service", "category", "subcategory") and not p.get("slug"):
            iss.append(_issue("no_slug", "medium", "No URL slug; the URL uses an internal ID.", "Set a readable slug."))
        if p.get("redirected"):
            iss.append(_issue("redirect_shadow", "high", "A redirect rule sends this URL elsewhere; it is excluded from the sitemap.", "Remove the redirect or the page."))
        if p.get("published") and not p.get("linked"):
            iss.append(_issue("orphan", "medium", "No crawlable internal link points to this page."))
        p["issues"] = iss
        p["score"] = max(0, 100 - sum(SEV_WEIGHT[i["severity"]] for i in iss))
        p["meta_status"] = "missing" if any(i["code"] in ("missing_title", "missing_description") for i in iss) else (
            "custom" if p.get("custom") else "auto")
        p["duplicate"] = any(i["code"] in ("duplicate_title", "duplicate_description") for i in iss)


# ------------------------------------------------------------------ schema
def build_schema(p, idx):
    g, base = idx["global"], idx["base"]
    site_name = g.get("org_name") or g["_site_name"]
    org = {"@type": "Organization", "@id": f"{base}/#organization", "name": site_name, "url": base + "/"}
    logo = g.get("org_logo") or g.get("_brand_logo")
    if logo:
        org["logo"] = abs_url(base, logo)
    if g.get("org_same_as"):
        org["sameAs"] = g["org_same_as"]
    phone = g.get("org_phone") or g.get("_brand_phone")
    if phone:
        org["contactPoint"] = {"@type": "ContactPoint", "telephone": phone, "contactType": "customer service"}
    blocks = []
    crumbs = [("Home", "/")]
    r = p["resolved"]
    t = p["type"]
    if t == "static" and p["entity_id"] == "home":
        blocks.append({"@context": "https://schema.org", **org})
        blocks.append({"@context": "https://schema.org", "@type": "WebSite", "@id": f"{base}/#website", "name": site_name,
                       "url": base + "/", "inLanguage": g.get("language") or "en",
                       "potentialAction": {"@type": "SearchAction", "target": f"{base}/services?q={{search_term_string}}",
                                           "query-input": "required name=search_term_string"}})
        for loc in g.get("business_locations") or []:
            lb = {"@context": "https://schema.org", "@type": "LocalBusiness", "name": loc["name"], "url": base + "/",
                  "parentOrganization": {"@id": f"{base}/#organization"},
                  "address": {"@type": "PostalAddress", "streetAddress": loc["street"], "addressLocality": loc["city"],
                              "addressRegion": loc.get("state") or "", "postalCode": loc.get("postal_code") or "",
                              "addressCountry": loc.get("country") or "IN"}}
            if loc.get("phone"):
                lb["telephone"] = loc["phone"]
            blocks.append(lb)
        return blocks
    if t == "static":
        crumbs.append((p["name"], p["path"]))
    elif t in ("category", "subcategory"):
        crumbs += [("Services", "/services"), (p["name"], p["path"])]
    elif t == "service":
        crumbs += [("Services", "/services")]
        cat = idx["by_key"].get(f"category:{p.get('category_id')}")
        if cat:
            crumbs.append((cat["name"], cat["path"]))
        crumbs.append((p["name"], p["path"]))
        svc = {"@context": "https://schema.org", "@type": "Service", "name": p["name"], "description": r["description"],
               "url": r["canonical"], "provider": {"@id": f"{base}/#organization", "@type": "Organization", "name": site_name, "url": base + "/"},
               "serviceType": p.get("category_name") or "Home service"}
        if p.get("image"):
            svc["image"] = abs_url(base, p["image"])
        if p.get("served_cities"):
            svc["areaServed"] = [{"@type": "City", "name": c} for c in p["served_cities"]]
        if p.get("rating") and p["rating"][1] > 0:
            svc["aggregateRating"] = {"@type": "AggregateRating", "ratingValue": p["rating"][0], "reviewCount": p["rating"][1]}
        blocks.append(svc)
    elif t == "city":
        crumbs.append((p["name"], p["path"]))
        blocks.append({"@context": "https://schema.org", "@type": "Service", "name": r["title"], "description": r["description"],
                       "url": r["canonical"], "provider": {"@id": f"{base}/#organization", "@type": "Organization", "name": site_name, "url": base + "/"},
                       "areaServed": {"@type": "City", "name": p["name"]}})
    elif t == "city_service":
        city = idx["by_key"].get(f"city:{p.get('city_slug')}")
        if city:
            crumbs.append((city["name"], city["path"]))
        crumbs.append((p["name"], p["path"]))
        svc = {"@context": "https://schema.org", "@type": "Service", "name": p["name"], "description": r["description"],
               "url": r["canonical"], "provider": {"@id": f"{base}/#organization", "@type": "Organization", "name": site_name, "url": base + "/"},
               "areaServed": {"@type": "City", "name": p.get("city")}, "serviceType": p.get("category_name") or "Home service"}
        if p.get("price"):
            svc["offers"] = {"@type": "Offer", "price": p["price"].replace("₹", ""), "priceCurrency": "INR"}
        blocks.append(svc)
    elif t == "blog":
        crumbs += [("Blog", "/blog"), (p["name"], p["path"])]
        blocks.append({"@context": "https://schema.org", "@type": "BlogPosting", "headline": p["name"][:110],
                       "description": r["description"], "url": r["canonical"],
                       "publisher": {"@id": f"{base}/#organization", "@type": "Organization", "name": site_name},
                       **({"image": abs_url(base, p["image"])} if p.get("image") else {}),
                       **({"dateModified": p["updated_at"]} if p.get("updated_at") else {})})
    custom = (p.get("override") or {}).get("schema_jsonld")
    if custom:
        try:
            cj = json.loads(custom) if isinstance(custom, str) else custom
            if isinstance(cj, dict) and cj.get("@type") and cj.get("@type") not in [b.get("@type") for b in blocks]:
                blocks.append({"@context": "https://schema.org", **{k: v for k, v in cj.items() if k != "@context"}})
        except (ValueError, TypeError):
            pass
    blocks.insert(0, {"@context": "https://schema.org", "@type": "BreadcrumbList",
                      "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": n, "item": abs_url(base, u)}
                                          for i, (n, u) in enumerate(crumbs)]})
    return blocks


SCHEMA_REQUIRED = {
    "Organization": ["name", "url"], "WebSite": ["name", "url"], "BreadcrumbList": ["itemListElement"],
    "Service": ["name", "provider"], "LocalBusiness": ["name", "address"], "BlogPosting": ["headline"],
}
SCHEMA_RECOMMENDED = {"Organization": ["logo"], "Service": ["description", "areaServed", "url"],
                      "BlogPosting": ["image", "dateModified"], "LocalBusiness": ["telephone"]}


def validate_schema(blocks):
    out = []
    seen = {}
    for b in blocks:
        typ = b.get("@type")
        res = {"type": typ, "errors": [], "warnings": []}
        if b.get("@context") != "https://schema.org":
            res["errors"].append("@context must be https://schema.org")
        for f in SCHEMA_REQUIRED.get(typ, []):
            if not b.get(f):
                res["errors"].append(f"Missing required property '{f}'")
        for f in SCHEMA_RECOMMENDED.get(typ, []):
            if not b.get(f):
                res["warnings"].append(f"Recommended property '{f}' is missing")
        if typ == "BreadcrumbList":
            for it in b.get("itemListElement") or []:
                if not str(it.get("item", "")).startswith("http"):
                    res["errors"].append("Breadcrumb item URLs must be absolute")
        seen[typ] = seen.get(typ, 0) + 1
        if seen[typ] > 1 and typ in ("BreadcrumbList", "Organization", "WebSite"):
            res["errors"].append(f"Duplicate {typ} block")
        out.append(res)
    return out


# ------------------------------------------------------------------ robots
async def robots_txt():
    idx = await get_index()
    tech, base = idx["tech"], idx["base"]
    lines = ["User-agent: *", "Allow: /"]
    for p in tech.get("private_paths") or []:
        lines.append(f"Disallow: {p}")
    if (tech.get("robots_custom") or "").strip():
        lines += ["", tech["robots_custom"].strip()]
    lines += ["", f"Sitemap: {base}/sitemap.xml"]
    return "\n".join(lines) + "\n"


def is_private_path(path, tech):
    return any(path == p or path.startswith(p.rstrip("/") + "/") for p in (tech.get("private_paths") or []))


# ------------------------------------------------------------------ sitemap
SITEMAP_TYPES = ["pages", "categories", "services", "cities", "city-services", "blog"]
_TYPE_MAP = {"static": "pages", "category": "categories", "subcategory": "categories", "service": "services",
             "city": "cities", "city_service": "city-services", "blog": "blog"}


def _lastmod(v):
    if not v:
        return ""
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")).strftime("%Y-%m-%d")
    except ValueError:
        return ""


async def sitemap_entries():
    idx = await get_index()
    groups = {t: [] for t in SITEMAP_TYPES}
    for p in idx["pages"]:
        if not p["indexable"]:
            continue
        groups[_TYPE_MAP[p["type"]]].append({"loc": p["resolved"]["canonical"], "lastmod": _lastmod(p.get("updated_at")),
                                             "priority": p.get("priority", 0.5)})
    for k in groups:
        seen, out = set(), []
        for u in groups[k]:
            if u["loc"] not in seen:
                seen.add(u["loc"])
                out.append(u)
        groups[k] = out
    return idx, groups


def _urlset(urls):
    items = "".join(
        f"<url><loc>{html.escape(u['loc'])}</loc>" + (f"<lastmod>{u['lastmod']}</lastmod>" if u["lastmod"] else "")
        + f"<priority>{u['priority']:.1f}</priority></url>" for u in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{items}</urlset>'


async def sitemap_index_xml():
    idx, groups = await sitemap_entries()
    base, chunk = idx["base"], int(idx["tech"].get("sitemap_chunk_size") or 5000)
    parts = []
    for t, urls in groups.items():
        for i in range(0, len(urls), chunk):
            lm = max([u["lastmod"] for u in urls[i:i + chunk] if u["lastmod"]] or [""])
            parts.append((f"{base}/sitemaps/{t}-{i // chunk + 1}.xml", lm))
    body = "".join(f"<sitemap><loc>{html.escape(loc)}</loc>" + (f"<lastmod>{lm}</lastmod>" if lm else "") + "</sitemap>"
                   for loc, lm in parts)
    await _record_sitemap(idx, groups, len(parts))
    return f'<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{body}</sitemapindex>'


async def sitemap_part_xml(name):
    m = re.match(r"^([a-z-]+)-(\d+)$", name)
    if not m or m.group(1) not in SITEMAP_TYPES:
        return None
    idx, groups = await sitemap_entries()
    chunk = int(idx["tech"].get("sitemap_chunk_size") or 5000)
    n = int(m.group(2))
    urls = groups[m.group(1)][(n - 1) * chunk: n * chunk]
    if not urls:
        return None
    return _urlset(urls)


async def _record_sitemap(idx, groups, files):
    total = sum(len(v) for v in groups.values())
    host = urlparse(idx["base"]).netloc
    errors = []
    for t, urls in groups.items():
        for u in urls:
            pu = urlparse(u["loc"])
            if pu.netloc != host:
                errors.append(f"{u['loc']} is not on preferred host {host}")
            if pu.scheme != "https":
                errors.append(f"{u['loc']} is not https")
    await db.settings.update_one({"id": "seo_sitemap"}, {"$set": {
        "id": "seo_sitemap", "generated_at": now_iso(), "url_count": total, "files": files,
        "counts": {k: len(v) for k, v in groups.items()}, "errors": errors[:50], "stale": False}}, upsert=True)


# ------------------------------------------------------------------ migration
async def ensure_slugs():
    """Backfill readable slugs for services that have none (old /service/{id} URLs still resolve)."""
    n = 0
    taken = set(await db.services.distinct("slug"))
    async for s in db.services.find({"$or": [{"slug": {"$exists": False}}, {"slug": ""}, {"slug": None}]}, {"_id": 0, "id": 1, "name": 1}):
        base = slugify(s.get("name")) or s["id"][:8]
        slug = base if base not in taken else f"{base}-{s['id'][:6]}"
        taken.add(slug)
        await db.services.update_one({"id": s["id"]}, {"$set": {"slug": slug}})
        n += 1
    if n:
        await invalidate("slug_backfill")
    return n


async def ensure_indexes():
    await db.seo_city_pages.create_index("id", unique=True)
    await db.seo_city_pages.create_index("path", unique=True)
    await db.seo_cities.create_index("slug", unique=True)
    await db.seo_jobs.create_index([("status", 1), ("next_run_at", 1)])
    await db.seo_events.create_index([("created_at", -1)])
    await db.seo_page_status.create_index("key", unique=True)


# ------------------------------------------------------------------ redirects
async def add_redirect(from_path, to_path, rtype="301", source="manual", admin=None):
    from_path, to_path = clean_path(from_path), to_path.strip()
    g = await get_global()
    base = site_base(g)
    if to_path.startswith("http"):
        to_path = safe_url(to_path, False)
        if urlparse(to_path).netloc != urlparse(base).netloc:
            raise HTTPException(400, "Redirect destination must be on your own domain (open redirects are not allowed)")
        to_path = urlparse(to_path).path or "/"
    else:
        to_path = clean_path(to_path)
    if from_path == to_path:
        raise HTTPException(400, "Redirect source and destination are the same")
    if rtype not in ("301", "302", "308", "307"):
        raise HTTPException(400, "Type must be 301, 302, 307 or 308")
    existing = {r["from_path"]: r for r in await db.redirects.find({}, {"_id": 0}).to_list(5000) if r.get("from_path")}
    # collapse chains: follow destination
    seen = {from_path}
    dest = to_path
    while dest in existing:
        if dest in seen:
            raise HTTPException(400, "This redirect would create a loop")
        seen.add(dest)
        dest = existing[dest]["to_path"]
    if dest == from_path:
        raise HTTPException(400, "This redirect would create a loop")
    # re-point any rules that targeted from_path (avoid chains)
    await db.redirects.update_many({"to_path": from_path}, {"$set": {"to_path": dest, "updated_at": now_iso()}})
    doc = {"from_path": from_path, "to_path": dest, "type": rtype, "source": source, "updated_at": now_iso(),
           "created_by": (admin or {}).get("name") or source}
    if from_path in existing:
        await db.redirects.update_one({"from_path": from_path}, {"$set": doc})
    else:
        await db.redirects.insert_one({"id": new_id(), "created_at": now_iso(), "hits": 0, **doc})
    await invalidate("redirect")
    return await db.redirects.find_one({"from_path": from_path}, {"_id": 0})


def redirect_problems(redirects, known_paths):
    by = {r.get("from_path"): r for r in redirects if r.get("from_path")}
    out = []
    for r in redirects:
        f, t = r.get("from_path") or "", r.get("to_path") or ""
        probs = []
        if not f.startswith("/"):
            probs.append(("invalid_source", "high", "Source must be a path starting with /"))
        if t.startswith("http") or t.startswith("//") or t.lower().startswith("javascript"):
            probs.append(("external", "high", "Destination is absolute/external (possible open redirect)"))
        hops, cur, seen = 0, t, {f}
        while cur in by:
            if cur in seen:
                probs.append(("loop", "critical", "Redirect loop"))
                break
            seen.add(cur)
            cur = by[cur].get("to_path")
            hops += 1
        if hops and not any(p[0] == "loop" for p in probs):
            probs.append(("chain", "medium", f"Redirect chain with {hops + 1} hops"))
        if cur and cur.startswith("/") and cur not in known_paths and not _matches_route(cur):
            probs.append(("broken_target", "high", f"Destination {cur} does not match any known public page"))
        out.append({**r, "problems": [{"code": c, "severity": s, "message": m} for c, s, m in probs]})
    return out


_ROUTES = [r"^/$", r"^/services/?$", r"^/membership/?$", r"^/blog/?$", r"^/(about|contact|privacy|terms|refund)/?$"]


def _matches_route(path):
    return any(re.match(rx, path.split("?")[0]) for rx in _ROUTES)
