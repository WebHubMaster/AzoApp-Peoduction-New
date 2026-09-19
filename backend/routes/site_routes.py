from fastapi import HTTPException, APIRouter, Depends
from fastapi.responses import Response
from controllers import site_controller as sc
from controllers import content_controller as cc
from middleware.auth import require_role
import os

router = APIRouter(tags=["site"])
ADMIN = require_role("admin")


# ---------- public ----------
@router.get("/site/config")
async def site_config():
    return await sc.public_site_config()


@router.get("/site/og-image")
async def site_og_image():
    from services import og_image_service
    png = await og_image_service.og_image_png()
    return Response(content=png, media_type="image/png",
                    headers={"Cache-Control": "public, max-age=600", "Content-Disposition": "inline; filename=og-image.png"})


@router.get("/site/cities")
async def site_cities():
    from services import city_service
    return await city_service.list_cities()


@router.get("/site/city/{slug}")
async def site_city(slug: str):
    from services import city_service
    data = await city_service.city_page(slug)
    if not data:
        raise HTTPException(status_code=404, detail="City not found")
    return data


@router.get("/site/homepage")
async def homepage(city: str = ""):
    return await sc.homepage(city)


@router.get("/site/promotions")
async def promotions():
    return await sc.promotions()


@router.get("/content/about")
async def about():
    doc = await cc.list_docs("pages", {"key": "about"})
    return doc[0] if doc else {"key": "about", "title": "About Us", "body": "", "sections": []}


@router.get("/content/contact")
async def contact():
    doc = await cc.list_docs("pages", {"key": "contact"})
    return doc[0] if doc else {"key": "contact"}


@router.get("/content/{key}")
async def content_page(key: str):
    """Generic public page content (privacy, terms, refund, or any custom key)."""
    doc = await cc.list_docs("pages", {"key": key})
    if doc:
        return doc[0]
    titles = {
        "privacy": "Privacy Policy", "terms": "Terms & Conditions",
        "refund": "Refund Policy", "about": "About Us", "contact": "Contact Us",
    }
    return {"key": key, "title": titles.get(key, key.replace("-", " ").title()), "body": ""}


@router.get("/serviceability")
async def serviceability(pincode: str = "", city: str = "", lat: float = None, lng: float = None):
    """Public: is a given address inside a serviced area? Also returns the live
    surge % that a service in that area would incur right now (peak-aware)."""
    from services.engines import ServiceAreaEngine, PricingEngine
    addr = {"pincode": pincode, "city": city, "lat": lat, "lng": lng}
    cov = await ServiceAreaEngine.check(addr)
    surge_amt, surge_rule = await PricingEngine._surge({"category_name": ""}, addr, 100.0)
    cov["live_surge_pct_on_100"] = surge_amt   # e.g. 20.0 => +20% on a ₹100 service now
    cov["live_surge_rule"] = surge_rule
    return cov


@router.post("/waitlist")
async def join_waitlist(data: dict):
    """Public: an out-of-area customer leaves their pincode so we can prioritise
    launching there next."""
    from config.database import db, now_iso
    from models.user import new_id
    pin = str(data.get("pincode", "")).strip()
    if not pin:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Please enter your pincode")
    await db.waitlist.insert_one({
        "id": new_id(), "pincode": pin, "city": (data.get("city") or "").strip(),
        "customer_phone": (data.get("phone") or "").strip(),
        "email": (data.get("email") or "").strip(),
        "note": (data.get("note") or "").strip(), "source": "manual",
        "created_at": now_iso(),
    })
    return {"ok": True, "message": "Thanks! We'll notify you the moment we launch in your area."}


# ---------- admin: homepage sections ----------
@router.get("/admin/homepage-sections")
async def list_sections(admin=Depends(ADMIN)):
    from config.database import db
    return await db.homepage_sections.find({}, {"_id": 0}).sort("order", 1).to_list(200)


@router.post("/admin/homepage-sections")
async def create_section(data: dict, admin=Depends(ADMIN)):
    return await cc.create_doc("homepage_sections", data)


@router.put("/admin/homepage-sections/{sec_id}")
async def update_section(sec_id: str, data: dict, admin=Depends(ADMIN)):
    return await cc.update_doc("homepage_sections", sec_id, data)


@router.delete("/admin/homepage-sections/{sec_id}")
async def delete_section(sec_id: str, admin=Depends(ADMIN)):
    return await cc.delete_doc("homepage_sections", sec_id)


# ---------- admin: dynamic pages (about/contact) ----------
@router.put("/admin/pages/{key}")
async def upsert_page(key: str, data: dict, admin=Depends(ADMIN)):
    from config.database import db, now_iso
    from models.user import new_id
    from services import sanitize_service, cache_service
    data = sanitize_service.sanitize_doc("pages", data)
    data["key"] = key
    data["updated_at"] = now_iso()
    existing = await db.pages.find_one({"key": key}, {"_id": 0})
    if existing:
        await db.pages.update_one({"key": key}, {"$set": data})
    else:
        await db.pages.insert_one({"id": new_id(), "created_at": now_iso(), **data})
    await cache_service.bust_prefix("site:")
    return await db.pages.find_one({"key": key}, {"_id": 0})


# ---------- admin: global search ----------
@router.get("/admin/search")
async def search(q: str = "", admin=Depends(ADMIN)):
    return await sc.global_search(q)


# ---------- SEO ----------
def _site_base():
    return (os.environ.get("REACT_APP_BACKEND_URL", "")).rstrip("/")


async def _build_sitemap_urls():
    """Every active category, sub-category, service (+ core pages). Uses each
    doc's canonical SEO URL when the admin has set one, else builds it."""
    from config.database import db
    base = _site_base()
    now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).strftime("%Y-%m-%d")
    urls = [
        {"loc": f"{base}/", "priority": "1.0", "changefreq": "daily"},
        {"loc": f"{base}/services", "priority": "0.9", "changefreq": "daily"},
        {"loc": f"{base}/about", "priority": "0.4", "changefreq": "monthly"},
        {"loc": f"{base}/contact", "priority": "0.4", "changefreq": "monthly"},
    ]

    def _canon(doc, path):
        return ((doc.get("seo") or {}).get("canonical") or "").strip() or f"{base}/{path}"

    cats = await db.categories.find({"status": "active"}, {"_id": 0, "slug": 1, "id": 1, "seo": 1}).to_list(2000)
    for c in cats:
        urls.append({"loc": _canon(c, f"category/{c.get('slug') or c.get('id')}"), "priority": "0.8", "changefreq": "weekly"})
    subs = await db.subcategories.find({"status": "active"}, {"_id": 0, "slug": 1, "id": 1, "seo": 1}).to_list(3000)
    for s in subs:
        if s.get("slug") or s.get("id"):
            urls.append({"loc": _canon(s, f"category/{s.get('slug') or s.get('id')}"), "priority": "0.7", "changefreq": "weekly"})
    svcs = await db.services.find({"status": "active", "approval_status": {"$ne": "disapproved"}},
                                  {"_id": 0, "slug": 1, "id": 1, "seo": 1}).to_list(5000)
    for s in svcs:
        urls.append({"loc": _canon(s, f"service/{s.get('slug') or s.get('id')}"), "priority": "0.7", "changefreq": "weekly", "lastmod": now})
    from services.city_service import slugify as _slug
    for c in await db.service_areas.distinct("city", {"status": {"$ne": "inactive"}}):
        if c:
            urls.append({"loc": f"{base}/city/{_slug(c)}", "priority": "0.8", "changefreq": "weekly", "lastmod": now})
    # de-dupe by loc preserving order
    seen, out = set(), []
    for u in urls:
        if u["loc"] in seen:
            continue
        seen.add(u["loc"])
        u.setdefault("lastmod", now)
        out.append(u)
    return out


@router.get("/sitemap.xml")
async def sitemap():
    urls = await _build_sitemap_urls()
    items = "".join(
        f"<url><loc>{u['loc']}</loc><lastmod>{u['lastmod']}</lastmod>"
        f"<changefreq>{u['changefreq']}</changefreq><priority>{u['priority']}</priority></url>"
        for u in urls
    )
    xml = f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{items}</urlset>'
    return Response(content=xml, media_type="application/xml")


@router.get("/admin/seo/status")
async def seo_status(admin=Depends(ADMIN)):
    from config.database import db
    urls = await _build_sitemap_urls()
    doc = await db.settings.find_one({"id": "seo_ping"}, {"_id": 0}) or {}
    return {
        "sitemap_url": f"{_site_base()}/api/sitemap.xml",
        "robots_url": f"{_site_base()}/api/robots.txt",
        "total_urls": len(urls),
        "last_ping": doc.get("last_ping"),
        "last_results": doc.get("last_results", []),
    }


@router.post("/admin/seo/ping-sitemap")
async def ping_sitemap(admin=Depends(ADMIN)):
    """Notify search engines that the sitemap changed (best-effort, fast index)."""
    from services.seo_service import do_ping
    return await do_ping(source="manual")


@router.get("/robots.txt")
async def robots():
    base = _site_base()
    txt = f"User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/admin\nSitemap: {base}/api/sitemap.xml\n"
    return Response(content=txt, media_type="text/plain")
