"""Public city landing-page data. Everything is derived from live collections
(service_areas, services, bookings, users) — no curated/static city content."""
import re
from datetime import datetime, timedelta, timezone

from config.database import db
from services import cache_service

DONE = ("completed", "paid")


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")


def _city_regex(city: str):
    return {"$regex": f"^{re.escape(city)}$", "$options": "i"}


async def _cities():
    """Serviced cities = active service areas, enriched with real counts."""
    areas = await db.service_areas.find({"status": {"$ne": "inactive"}}, {"_id": 0}).to_list(500)
    by_city = {}
    for a in areas:
        c = (a.get("city") or "").strip()
        if not c:
            continue
        e = by_city.setdefault(c, {"city": c, "slug": slugify(c), "areas": [], "pincodes": set(), "lat": a.get("center_lat"), "lng": a.get("center_lng")})
        e["areas"].append(a.get("name") or c)
        for p in a.get("pincodes") or []:
            e["pincodes"].add(str(p))
    out = []
    for e in by_city.values():
        rx = _city_regex(e["city"])
        e["pincodes"] = sorted(e["pincodes"])
        e["partners"] = await db.users.count_documents({"role": "partner", "city": rx})
        e["merchants"] = await db.users.count_documents({"role": "merchant", "city": rx})
        e["bookings"] = await db.bookings.count_documents({"address.city": rx, "status": {"$in": list(DONE)}})
        out.append(e)
    out.sort(key=lambda x: (-x["bookings"], -x["partners"], x["city"]))
    return out


async def list_cities():
    return await cache_service.cached("site:cities", 120, _cities)


async def city_page(slug: str):
    slug = slugify(slug)
    return await cache_service.cached(f"site:city:{slug}", 60, lambda: _city_page(slug))


async def _city_page(slug: str):
    cities = await _cities()
    me = next((c for c in cities if c["slug"] == slug), None)
    if not me:
        return None
    city = me["city"]
    rx = _city_regex(city)
    from controllers.site_controller import _active_sets, _visible
    ac, asub = await _active_sets()
    services = [s for s in await db.services.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000) if _visible(s, ac, asub)]

    since = (datetime.now(timezone.utc) - timedelta(days=180)).isoformat()
    bookings = await db.bookings.find({"address.city": rx}, {"_id": 0, "service_id": 1, "category_id": 1, "status": 1, "review": 1,
                                                             "customer_name": 1, "service_name": 1, "partner_name": 1, "partner_id": 1,
                                                             "created_at": 1, "code": 1, "pricing.total": 1}).to_list(20000)
    demand = {}
    for b in bookings:
        if b.get("status") != "cancelled" and (b.get("created_at") or "") >= since:
            demand[b.get("service_id")] = demand.get(b.get("service_id"), 0) + 1
    for s in services:
        s["local_bookings"] = demand.get(s["id"], 0)
    popular = sorted([s for s in services if s["local_bookings"] > 0], key=lambda x: -x["local_bookings"])
    rest = [s for s in services if s["local_bookings"] == 0]
    featured = [s for s in rest if s.get("is_featured")]
    ordered = popular + featured + [s for s in rest if not s.get("is_featured")]

    cats = await db.categories.find({"status": "active"}, {"_id": 0}).sort("order", 1).to_list(500)
    per_cat = {}
    for s in services:
        per_cat[s.get("category_id")] = per_cat.get(s.get("category_id"), 0) + 1
    for c in cats:
        c["service_count"] = per_cat.get(c["id"], 0)
    cats = [c for c in cats if c["service_count"] > 0]

    done = [b for b in bookings if b.get("status") in DONE]
    rated = [b for b in bookings if (b.get("review") or {}).get("rating")]
    avg = round(sum(float(b["review"]["rating"]) for b in rated) / len(rated), 1) if rated else 0
    reviews = sorted(rated, key=lambda b: b.get("created_at") or "", reverse=True)[:12]
    reviews = [{"id": b.get("code"), "customer_name": b.get("customer_name"), "service_name": b.get("service_name"),
                "partner_name": b.get("partner_name"), "rating": b["review"].get("rating"),
                "comment": b["review"].get("comment") or b["review"].get("text") or "", "created_at": b.get("created_at")} for b in reviews]

    partners = await db.users.find({"role": "partner", "city": rx}, {"_id": 0, "id": 1, "name": 1, "photo": 1, "rating": 1,
                                                                    "kyc_status": 1, "skills": 1, "category_ids": 1, "jobs_done": 1,
                                                                    "starter_kit.purchased": 1, "partner_status": 1}).to_list(500)
    pjobs = {}
    for b in done:
        if b.get("partner_id"):
            pjobs[b["partner_id"]] = pjobs.get(b["partner_id"], 0) + 1
    cat_name = {c["id"]: c["name"] for c in await db.categories.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)}
    plist = []
    for p in partners:
        skills = p.get("skills") or [cat_name.get(cid) for cid in (p.get("category_ids") or [])]
        plist.append({"id": p["id"], "name": p.get("name") or "Partner", "photo": p.get("photo") or "", "rating": p.get("rating") or 0,
                      "verified": p.get("kyc_status") == "approved", "pro": bool((p.get("starter_kit") or {}).get("purchased")),
                      "jobs": pjobs.get(p["id"], p.get("jobs_done") or 0), "skills": [s for s in skills if s][:3],
                      "online": p.get("partner_status") == "online"})
    plist.sort(key=lambda x: (-x["verified"], -x["jobs"], -float(x["rating"] or 0)))

    return {
        "city": city, "slug": slug, "areas": me["areas"], "pincodes": me["pincodes"], "lat": me["lat"], "lng": me["lng"],
        "stats": {"services": len(services), "partners": len(partners), "verified_partners": len([p for p in plist if p["verified"]]),
                  "merchants": me["merchants"], "jobs_done": len(done), "reviews": len(rated), "rating": avg,
                  "online_partners": len([p for p in plist if p["online"]])},
        "categories": cats,
        "services": ordered[:24],
        "popular_service_ids": [s["id"] for s in popular[:12]],
        "partners": plist[:12],
        "reviews": reviews,
        "other_cities": [{"city": c["city"], "slug": c["slug"], "partners": c["partners"]} for c in cities if c["slug"] != slug][:12],
    }
