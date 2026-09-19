"""Catalog: categories, sub-categories, services with full cascade visibility logic.

Visibility rule (frontend/public): a service shows only when
  service.status == active AND service.approval_status == approved
  AND parent category is active
  AND (no subcategory OR subcategory is active).
Deactivating a category hides all its services on the frontend but keeps them in admin.
"""
import re
from fastapi import HTTPException
from config.database import db, now_iso
from models.user import new_id
from services.seo_service import auto_ping as _seo_ping


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return s or new_id()[:8]


async def _active_category_ids():
    cats = await db.categories.find({"status": "active"}, {"_id": 0, "id": 1}).to_list(1000)
    return {c["id"] for c in cats}


async def _active_subcategory_ids():
    subs = await db.subcategories.find({"status": "active"}, {"_id": 0, "id": 1}).to_list(2000)
    return {s["id"] for s in subs}


def _service_visible(svc, active_cats, active_subs):
    if svc.get("status") != "active":
        return False
    if svc.get("approval_status", "approved") != "approved":
        return False
    if svc.get("category_id") not in active_cats:
        return False
    sub = svc.get("subcategory_id")
    if sub and sub not in active_subs:
        return False
    return True


async def _apply_addon_library(services):
    """Reconcile each service's customer-facing `addons` against the admin Add-on
    Library (db.catalog_addons — the source of truth). Only add-ons that exist as an
    ACTIVE library entry in the SAME category are shown; seeded/orphaned embedded
    add-ons the admin never created are hidden. Prices are synced from the library
    so the admin's library price is authoritative. Mutates + returns `services`."""
    if not services:
        return services
    cat_ids = {s.get("category_id") for s in services if s.get("category_id")}
    lib = []
    if cat_ids:
        lib = await db.catalog_addons.find(
            {"category_id": {"$in": list(cat_ids)}, "status": "active"},
            {"_id": 0, "category_id": 1, "name": 1, "price": 1}).to_list(5000)
    allowed = {}  # category_id -> {name_lower: price}
    for a in lib:
        allowed.setdefault(a.get("category_id"), {})[(a.get("name") or "").strip().lower()] = a.get("price")
    for s in services:
        by_name = allowed.get(s.get("category_id"), {})
        kept = []
        for a in (s.get("addons") or []):
            nm = (a.get("name") if isinstance(a, dict) else a) or ""
            key = str(nm).strip().lower()
            if key and key in by_name:
                price = by_name[key]
                kept.append({"name": (a.get("name") if isinstance(a, dict) else a),
                             "price": float(price if price is not None else (a.get("price", 0) if isinstance(a, dict) else 0))})
        s["addons"] = kept
    return services


# ---- shared cache (read-through) ---------------------------------------------
# Hot, param-less public catalog reads are cached via the admin-configured Redis
# (or in-memory fallback) so enabling Redis has a real, observable effect. Any
# catalog write busts these keys immediately, so data is never stale.
_CK_CATEGORIES = "catalog:categories:active"
_CK_SUBCATEGORIES = "catalog:subcategories:active"
_CK_SERVICES = "catalog:services:all"


async def _after_write(event):
    """Called after every catalog mutation: ping search engines + bust caches."""
    _seo_ping(event)
    from services import cache_service as _cache
    await _cache.bust(_CK_CATEGORIES, _CK_SUBCATEGORIES, _CK_SERVICES)
    await _cache.bust_prefix("site:")


async def _list_all_services():
    rows = await db.services.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    active_cats = await _active_category_ids()
    active_subs = await _active_subcategory_ids()
    visible = [s for s in rows if _service_visible(s, active_cats, active_subs)]
    return await _apply_addon_library(visible)


# ---------- PUBLIC ----------
async def list_categories():
    from services import cache_service as _cache
    return await _cache.cached(_CK_CATEGORIES, 60,
        lambda: db.categories.find({"status": "active"}, {"_id": 0}).sort("order", 1).to_list(500))


async def list_subcategories(category_id=None):
    if category_id:
        return await db.subcategories.find(
            {"status": "active", "category_id": category_id}, {"_id": 0}).sort("order", 1).to_list(2000)
    from services import cache_service as _cache
    return await _cache.cached(_CK_SUBCATEGORIES, 60,
        lambda: db.subcategories.find({"status": "active"}, {"_id": 0}).sort("order", 1).to_list(2000))


async def list_services(category_id=None, subcategory_id=None, q=None, featured=None, trending=None):
    if not any([category_id, subcategory_id, q, featured, trending]):
        from services import cache_service as _cache
        return await _cache.cached(_CK_SERVICES, 45, _list_all_services)
    query = {}
    if category_id:
        query["category_id"] = category_id
    if subcategory_id:
        query["subcategory_id"] = subcategory_id
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"short_description": {"$regex": q, "$options": "i"}},
            {"tags": {"$regex": q, "$options": "i"}},
        ]
    if featured:
        query["is_featured"] = True
    if trending:
        query["is_trending"] = True
    rows = await db.services.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    active_cats = await _active_category_ids()
    active_subs = await _active_subcategory_ids()
    visible = [s for s in rows if _service_visible(s, active_cats, active_subs)]
    return await _apply_addon_library(visible)

async def upsell_suggestions(service_ids):
    """Checkout cross-sell/upsell: given the services already in the cart, return
      (1) popular_addons  – the most-frequently-chosen add-ons for each cart
          service (derived from real booking history; falls back to the catalog
          order when history is thin), and
      (2) frequently_together – services most often booked in the SAME
          categories that are NOT already in the cart (full service objects so
          the client can one-tap add them).
    Public, read-only, and defensive so a thin/empty history never errors."""
    from collections import Counter
    service_ids = [s for s in (service_ids or []) if s]
    all_services = await _list_all_services()
    by_id = {s["id"]: s for s in all_services}
    cart_svcs = [by_id[s] for s in service_ids if s in by_id]
    cart_cat_ids = {s.get("category_id") for s in cart_svcs if s.get("category_id")}

    # Frequency counters from recent booking history (bounded for safety).
    svc_freq = Counter()
    addon_freq = Counter()  # key = (service_id, addon_name)

    def _bump(sid, addons):
        if not sid:
            return
        svc_freq[sid] += 1
        for a in (addons or []):
            nm = a.get("name") if isinstance(a, dict) else a
            if nm:
                addon_freq[(sid, nm)] += 1

    cursor = db.bookings.find(
        {}, {"_id": 0, "service_id": 1, "addons": 1, "items": 1}
    ).sort("created_at", -1).limit(3000)
    async for b in cursor:
        _bump(b.get("service_id"), b.get("addons"))
        for it in (b.get("items") or []):
            _bump(it.get("service_id"), it.get("addons"))

    # (1) popular add-ons per cart service (top 3, popularity then catalog order).
    popular_addons = {}
    for s in cart_svcs:
        catalog = s.get("addons") or []  # [{name, price}]
        if not catalog:
            continue
        ordered = sorted(
            list(enumerate(catalog)),
            key=lambda pair: (-addon_freq.get((s["id"], (pair[1] or {}).get("name")), 0), pair[0]),
        )
        picks = [
            {"name": a.get("name"), "price": a.get("price", 0),
             "count": addon_freq.get((s["id"], a.get("name")), 0)}
            for _, a in ordered[:3] if a and a.get("name")
        ]
        if picks:
            popular_addons[s["id"]] = picks

    # (2) frequently booked together (same categories, excluding cart services).
    cart_set = set(service_ids)
    candidates = [
        s for s in all_services
        if s.get("category_id") in cart_cat_ids and s["id"] not in cart_set
    ]
    candidates.sort(key=lambda s: (
        -svc_freq.get(s["id"], 0),
        0 if s.get("is_trending") else 1,
        0 if s.get("is_featured") else 1,
        -(float(s.get("rating") or 0)),
    ))
    frequently_together = candidates[:6]

    return {"popular_addons": popular_addons, "frequently_together": frequently_together}




def build_service_jsonld(svc: dict) -> dict:
    """Build schema.org Service + Offer + AggregateRating JSON-LD so Google can
    show rich results with star ratings. Auto-generated fresh on every read so it
    always reflects the latest price/rating (admins never hand-write it)."""
    seo = svc.get("seo") or {}
    price = svc.get("discounted_price") or svc.get("base_price") or 0
    name = seo.get("title") or svc.get("name") or "Service"
    desc = seo.get("description") or svc.get("short_description") or svc.get("name") or ""
    image = svc.get("image") or seo.get("og_image") or seo.get("image") or ""
    rating = float(svc.get("rating") or 0)
    review_count = int(svc.get("review_count") or 0)
    data = {
        "@context": "https://schema.org",
        "@type": "Service",
        "name": name,
        "description": desc,
        "serviceType": svc.get("category_name") or "Home Service",
        "areaServed": "IN",
        "provider": {"@type": "Organization", "name": "AzoApp"},
    }
    if image:
        data["image"] = image
    if seo.get("canonical"):
        data["url"] = seo["canonical"]
    if price:
        data["offers"] = {
            "@type": "Offer",
            "price": str(price),
            "priceCurrency": "INR",
            "availability": "https://schema.org/InStock",
        }
    # AggregateRating drives the ⭐ stars in Google search results
    if rating > 0 and review_count > 0:
        data["aggregateRating"] = {
            "@type": "AggregateRating",
            "ratingValue": str(round(rating, 2)),
            "reviewCount": str(review_count),
            "bestRating": "5",
            "worstRating": "1",
        }
    return data


async def get_service(service_id, public=True):
    svc = await db.services.find_one({"id": service_id}, {"_id": 0})
    if not svc:
        svc = await db.services.find_one({"slug": service_id}, {"_id": 0})
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")
    if public:
        active_cats = await _active_category_ids()
        active_subs = await _active_subcategory_ids()
        if not _service_visible(svc, active_cats, active_subs):
            raise HTTPException(status_code=404, detail="Service not available")
        await _apply_addon_library([svc])
    # Always attach fresh auto-generated JSON-LD for SEO rich snippets
    svc["jsonld"] = build_service_jsonld(svc)
    return svc


def build_category_jsonld(cat: dict) -> dict:
    """schema.org CollectionPage + BreadcrumbList for a category/sub-category so
    it can rank with rich results in Google. Auto-generated on every read."""
    seo = cat.get("seo") or {}
    name = seo.get("title") or cat.get("name") or "Category"
    desc = seo.get("description") or cat.get("description") or name
    image = cat.get("image") or seo.get("og_image") or seo.get("image") or ""
    url = seo.get("canonical") or ""
    data = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": name,
        "description": desc,
        "provider": {"@type": "Organization", "name": "AzoApp"},
    }
    if image:
        data["image"] = image
    if url:
        data["url"] = url
    crumbs = [{"@type": "ListItem", "position": 1, "name": "Home", "item": "/"}]
    if cat.get("category_name"):
        crumbs.append({"@type": "ListItem", "position": 2, "name": cat["category_name"]})
        crumbs.append({"@type": "ListItem", "position": 3, "name": name})
    else:
        crumbs.append({"@type": "ListItem", "position": 2, "name": name})
    data["breadcrumb"] = {"@type": "BreadcrumbList", "itemListElement": crumbs}
    return data


async def get_category(slug_or_id):
    cat = await db.categories.find_one({"$or": [{"id": slug_or_id}, {"slug": slug_or_id}]}, {"_id": 0})
    if not cat:
        cat = await db.subcategories.find_one({"$or": [{"id": slug_or_id}, {"slug": slug_or_id}]}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    cat["jsonld"] = build_category_jsonld(cat)
    return cat


# ---------- ADMIN (returns everything) ----------
async def admin_list_categories():
    cats = await db.categories.find({}, {"_id": 0}).sort("order", 1).to_list(1000)
    for c in cats:
        c["service_count"] = await db.services.count_documents({"category_id": c["id"]})
        c["subcategory_count"] = await db.subcategories.count_documents({"category_id": c["id"]})
    return cats


async def admin_list_subcategories(category_id=None):
    q = {"category_id": category_id} if category_id else {}
    subs = await db.subcategories.find(q, {"_id": 0}).sort("order", 1).to_list(3000)
    cats = {c["id"]: c["name"] for c in await db.categories.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)}
    for s in subs:
        s["category_name"] = cats.get(s.get("category_id"), "")
        s["service_count"] = await db.services.count_documents({"subcategory_id": s["id"]})
    return subs


async def admin_list_services(category_id=None, subcategory_id=None, q=None):
    query = {}
    if category_id:
        query["category_id"] = category_id
    if subcategory_id:
        query["subcategory_id"] = subcategory_id
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    return await db.services.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)


async def admin_get_service(service_id):
    return await get_service(service_id, public=False)


# ---------- CATEGORY CRUD ----------
async def create_category(data: dict):
    if not data.get("slug"):
        data["slug"] = slugify(data.get("name", ""))
    cat = {"id": new_id(), "created_at": now_iso(), **data}
    await db.categories.insert_one(dict(cat))
    cat.pop("_id", None)
    await _after_write("category_create")
    return cat


async def update_category(category_id, data: dict):
    upd = {k: v for k, v in data.items() if v is not None and k not in ("id", "created_at")}
    await db.categories.update_one({"id": category_id}, {"$set": upd})
    await _after_write("category_update")
    return await db.categories.find_one({"id": category_id}, {"_id": 0})


async def delete_category(category_id):
    active_bookings = await db.bookings.count_documents(
        {"category_id": category_id, "status": {"$nin": ["completed", "paid", "cancelled"]}})
    if active_bookings:
        raise HTTPException(status_code=400, detail=f"{active_bookings} active booking(s) depend on this category. Deactivate instead.")
    await db.categories.delete_one({"id": category_id})
    await db.subcategories.delete_many({"category_id": category_id})
    await db.services.delete_many({"category_id": category_id})
    await _after_write("category_delete")
    return {"deleted": True}


# ---------- SUBCATEGORY CRUD ----------
async def create_subcategory(data: dict):
    cat = await db.categories.find_one({"id": data["category_id"]}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Parent category not found")
    if not data.get("slug"):
        data["slug"] = slugify(data.get("name", ""))
    sub = {"id": new_id(), "category_name": cat["name"], "created_at": now_iso(), **data}
    await db.subcategories.insert_one(dict(sub))
    sub.pop("_id", None)
    await _after_write("subcategory_create")
    return sub


async def update_subcategory(sub_id, data: dict):
    upd = {k: v for k, v in data.items() if v is not None and k not in ("id", "created_at")}
    await db.subcategories.update_one({"id": sub_id}, {"$set": upd})
    await _after_write("subcategory_update")
    return await db.subcategories.find_one({"id": sub_id}, {"_id": 0})


async def delete_subcategory(sub_id):
    await db.subcategories.delete_one({"id": sub_id})
    await db.services.update_many({"subcategory_id": sub_id}, {"$set": {"subcategory_id": ""}})
    await _after_write("subcategory_delete")
    return {"deleted": True}


# ---------- SERVICE CRUD ----------
async def create_service(data: dict):
    cat = await db.categories.find_one({"id": data["category_id"]}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    sub_name = ""
    if data.get("subcategory_id"):
        sub = await db.subcategories.find_one({"id": data["subcategory_id"]}, {"_id": 0})
        sub_name = sub["name"] if sub else ""
    if not data.get("slug"):
        data["slug"] = slugify(data.get("name", ""))
    dp = data.get("discounted_price") or 0
    if dp and dp > data.get("base_price", 0):
        raise HTTPException(status_code=400, detail="Discounted price cannot exceed original price")
    svc = {"id": new_id(), "category_name": cat["name"], "subcategory_name": sub_name,
           "created_at": now_iso(), **data}
    await db.services.insert_one(dict(svc))
    svc.pop("_id", None)
    await _after_write("service_create")
    return svc


async def update_service(service_id, data: dict):
    old = await db.services.find_one({"id": service_id}, {"_id": 0}) or {}
    upd = {k: v for k, v in data.items() if v is not None and k not in ("id", "created_at")}
    if "category_id" in upd:
        cat = await db.categories.find_one({"id": upd["category_id"]}, {"_id": 0})
        if cat:
            upd["category_name"] = cat["name"]
    if "subcategory_id" in upd:
        sub = await db.subcategories.find_one({"id": upd["subcategory_id"]}, {"_id": 0}) if upd["subcategory_id"] else None
        upd["subcategory_name"] = sub["name"] if sub else ""
    if upd.get("discounted_price") and upd.get("base_price") and upd["discounted_price"] > upd["base_price"]:
        raise HTTPException(status_code=400, detail="Discounted price cannot exceed original price")
    await db.services.update_one({"id": service_id}, {"$set": upd})
    await _after_write("service_update")
    new = await db.services.find_one({"id": service_id}, {"_id": 0})
    # When a service that came from a Custom Job Request goes LIVE (active),
    # tell the customer who requested it that they can now book it.
    if (new and new.get("custom_job_id") and old.get("status") != "active"
            and new.get("status") == "active"):
        try:
            from services import custom_job_service as _cjs
            await _cjs.on_service_activated(new)
        except Exception:  # noqa: BLE001 — notification must never block the save
            pass
    return new


async def delete_service(service_id):
    active_bookings = await db.bookings.count_documents(
        {"service_id": service_id, "status": {"$nin": ["completed", "paid", "cancelled"]}})
    if active_bookings:
        raise HTTPException(status_code=400, detail=f"{active_bookings} active booking(s) depend on this service. Deactivate instead.")
    await db.services.delete_one({"id": service_id})
    await _after_write("service_delete")
    return {"deleted": True}


async def duplicate_service(service_id):
    """Clone an existing service so admins can reuse it for near-identical
    services (minor changes only). New copy is created inactive (draft)."""
    src = await db.services.find_one({"id": service_id}, {"_id": 0})
    if not src:
        raise HTTPException(status_code=404, detail="Service not found")
    clone = dict(src)
    clone.pop("_id", None)
    clone.pop("jsonld", None)
    clone["id"] = new_id()
    clone["name"] = f"{src.get('name', 'Service')} (Copy)"
    clone["slug"] = slugify(clone["name"]) + "-" + clone["id"][:6]
    clone["status"] = "inactive"          # draft — admin reviews before publishing
    clone["show_on_home"] = False
    clone["is_featured"] = False
    clone["is_trending"] = False
    clone["created_at"] = now_iso()
    await db.services.insert_one(dict(clone))
    clone.pop("_id", None)
    await _after_write("service_duplicate")
    return clone


# ---------- ADD-ON LIBRARY (category-wise reusable add-ons) ----------
async def list_addons(category_id=None, q=None, admin=False):
    """Reusable add-on library. Admin sees all; public/booking side sees active only."""
    query = {}
    if category_id:
        query["category_id"] = category_id
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    if not admin:
        query["status"] = "active"
    return await db.catalog_addons.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)


async def create_addon(data: dict):
    cat = await db.categories.find_one({"id": data.get("category_id")}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    addon = {
        "id": new_id(),
        "name": (data.get("name") or "").strip(),
        "price": float(data.get("price") or 0),
        "category_id": data["category_id"],
        "category_name": cat["name"],
        "description": data.get("description") or "",
        "status": data.get("status") or "active",
        "created_at": now_iso(),
    }
    if not addon["name"]:
        raise HTTPException(status_code=400, detail="Add-on name is required")
    await db.catalog_addons.insert_one(dict(addon))
    addon.pop("_id", None)
    await _after_write("addon_create")
    return addon


async def update_addon(addon_id, data: dict):
    upd = {k: v for k, v in data.items() if v is not None and k not in ("id", "created_at")}
    if "price" in upd:
        upd["price"] = float(upd["price"] or 0)
    if upd.get("category_id"):
        cat = await db.categories.find_one({"id": upd["category_id"]}, {"_id": 0})
        if cat:
            upd["category_name"] = cat["name"]
    await db.catalog_addons.update_one({"id": addon_id}, {"$set": upd})
    await _after_write("addon_update")
    return await db.catalog_addons.find_one({"id": addon_id}, {"_id": 0})


async def delete_addon(addon_id):
    await db.catalog_addons.delete_one({"id": addon_id})
    await _after_write("addon_delete")
    return {"deleted": True}
