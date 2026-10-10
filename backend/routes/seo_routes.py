import csv
import io
import json
import re

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import Response

from config.database import db, now_iso
from middleware.auth import require_role
from models.user import new_id
from services import seo_core as core, seo_workflow as wf, seo_audit, gsc_service as gsc

router = APIRouter(tags=["seo"])
ADMIN = require_role("admin", "staff")

ENTITY_COLL = {"service": "services", "category": "categories", "subcategory": "subcategories"}
SEO_TEXT = {"title": 200, "description": 400, "og_title": 200, "og_description": 400, "image_alt": 200,
            "keywords": 500, "breadcrumb_label": 80}


# ================================================================ public
@router.get("/seo/resolve")
async def resolve(path: str = "/"):
    idx = await core.get_index()
    path = (path or "/").split("?")[0].split("#")[0] or "/"
    if len(path) > 1:
        path = path.rstrip("/")
    g, tech = idx["global"], idx["tech"]
    p = idx["by_path"].get(path)
    base = {"locale": g.get("locale"), "language": g.get("language"), "site_name": g.get("org_name") or g["_site_name"],
            "twitter": g.get("twitter"), "twitter_card": g.get("twitter_card")}
    if core.is_private_path(path, tech):
        return {**base, "found": False, "private": True, "robots": "noindex,nofollow"}
    if not p:
        return {**base, "found": False, "robots": g.get("robots_default") or "index,follow",
                "canonical": core.abs_url(idx["base"], path)}
    r = p["resolved"]
    robots = r["robots"] if p["indexable"] or "noindex" in r["robots"] else "noindex,follow"
    if not p["published"]:
        robots = "noindex,follow"
    return {**base, "found": True, "type": p["type"], "title": r["full_title"], "description": r["description"],
            "keywords": r["keywords"], "canonical": r["canonical"], "robots": robots, "og_title": r["og_title"],
            "og_description": r["og_description"], "og_image": core.abs_url(idx["base"], r["og_image"]) if r["og_image"] else "",
            "image_alt": r["image_alt"] or p["name"], "jsonld": core.build_schema(p, idx)}


@router.get("/seo/render")
async def render_head(path: str = "/"):
    from services import seo_render
    return await seo_render.render(path)


@router.get("/seo/redirects")
async def public_redirects():
    rows = await db.redirects.find({}, {"_id": 0, "from_path": 1, "to_path": 1, "type": 1}).to_list(5000)
    return [r for r in rows if str(r.get("from_path", "")).startswith("/") and str(r.get("to_path", "")).startswith("/")]


@router.post("/seo/redirects/hit")
async def redirect_hit(data: dict):
    fp = str(data.get("from_path") or "")[:500]
    if fp.startswith("/"):
        await db.redirects.update_one({"from_path": fp}, {"$inc": {"hits": 1}, "$set": {"last_hit": now_iso()}})
    return {"ok": True}


@router.get("/seo/city-extras/{slug}")
async def city_extras(slug: str):
    idx = await core.get_index()
    p = idx["by_key"].get(f"city:{core.slugify(slug)}")
    if not p:
        return {"intro": "", "faqs": [], "coverage": "", "service_pages": []}
    ov = p.get("override") or {}
    pages = [{"name": x["name"], "path": x["path"]} for x in idx["pages"]
             if x["type"] == "city_service" and x.get("city_slug") == p["entity_id"] and x["indexable"]]
    return {"intro": ov.get("intro") or "", "faqs": ov.get("faqs") or [], "coverage": ov.get("coverage") or "",
            "state": ov.get("state") or "", "service_pages": pages}


@router.get("/seo/city-service/{city_slug}/{service_slug}")
async def city_service_page(city_slug: str, service_slug: str):
    path = f"/city/{core.slugify(city_slug)}/{core.slugify(service_slug)}"
    idx = await core.get_index()
    p = idx["by_path"].get(path)
    if not p or p["type"] != "city_service" or not p["published"]:
        raise HTTPException(404, "Page not found")
    from services.city_pricing_service import apply_service, get_doc
    svc = await db.services.find_one({"id": p["service_id"]}, {"_id": 0})
    city = next((c for c in idx["cities"] if c["slug"] == p["city_slug"]), None)
    priced = apply_service(svc, await get_doc(city["city"])) if svc and city else None
    if not priced:
        raise HTTPException(404, "This service is not currently available in this city")
    rx = {"$regex": f"^{re.escape(city['city'])}$", "$options": "i"}
    reviews = await db.bookings.find({"service_id": svc["id"], "address.city": rx, "review.rating": {"$gt": 0}},
                                     {"_id": 0, "customer_name": 1, "review": 1, "created_at": 1}).sort("created_at", -1).to_list(6)
    ov = p["override"]
    others = [{"name": x["name"], "path": x["path"]} for x in idx["pages"]
              if x["type"] == "city_service" and x.get("city_slug") == p["city_slug"] and x["indexable"] and x["key"] != p["key"]][:8]
    return {"title": p["resolved"]["title"], "city": city["city"], "city_slug": city["slug"], "areas": city.get("areas") or [],
            "service": {k: priced.get(k) for k in ("id", "name", "slug", "image", "base_price", "discounted_price",
                                                   "short_description", "description", "duration_min", "category_name", "highlights")},
            "intro": ov.get("intro") or "", "faqs": ov.get("faqs") or [], "coverage": ov.get("coverage") or "",
            "reviews": [{"name": (r.get("customer_name") or "Customer").split(" ")[0], "rating": r["review"].get("rating"),
                         "comment": r["review"].get("comment") or r["review"].get("text") or "", "date": r.get("created_at")} for r in reviews],
            "other_pages": others, "indexable": p["indexable"]}


# ================================================================ helpers
def _row(p):
    r = p["resolved"]
    return {"key": p["key"], "type": p["type"], "name": p["name"], "path": p["path"], "category_name": p.get("category_name") or "",
            "category_id": p.get("category_id") or "", "city": p.get("city") or "", "title": r["full_title"], "description": r["description"],
            "canonical": r["canonical"], "robots": r["robots"], "published": p["published"], "indexable": p["indexable"],
            "meta_status": p["meta_status"], "duplicate": p["duplicate"], "score": p["score"], "updated_at": p.get("updated_at") or "",
            "issues": [{"code": i["code"], "severity": i["severity"]} for i in p["issues"]],
            "schema_types": [], "eligible": p.get("eligible", True), "sources": p.get("sources", {})}


def _filter(pages, type="", category_id="", city="", status="", meta="", issue="", indexable="", q="", date_from="", date_to="", severity=""):
    out = []
    ql = (q or "").lower().strip()
    types = [t for t in (type or "").split(",") if t]
    for p in pages:
        if types and p["type"] not in types:
            continue
        if category_id and p.get("category_id") != category_id:
            continue
        if city and (p.get("city") or "").lower() != city.lower():
            continue
        if status == "published" and not p["published"]:
            continue
        if status == "unpublished" and p["published"]:
            continue
        if meta == "duplicate":
            if not p["duplicate"]:
                continue
        elif meta and p["meta_status"] != meta:
            continue
        if issue and not any(i["code"] == issue for i in p["issues"]):
            continue
        if severity and not any(i["severity"] == severity for i in p["issues"]):
            continue
        if indexable == "yes" and not p["indexable"]:
            continue
        if indexable == "no" and p["indexable"]:
            continue
        if date_from and (p.get("updated_at") or "") < date_from:
            continue
        if date_to and (p.get("updated_at") or "")[:10] > date_to:
            continue
        if ql and ql not in (p["name"] + " " + p["path"] + " " + p["resolved"]["full_title"]).lower():
            continue
        out.append(p)
    return out


def _clean_faqs(faqs):
    out = []
    for f in (faqs or [])[:20]:
        q, a = core.clean_text(f.get("q"), 300), core.clean_text(f.get("a"), 1500)
        if q and a:
            out.append({"q": q, "a": a})
    return out


def _clean_seo(data):
    out = {}
    for k, mx in SEO_TEXT.items():
        if k in data:
            out[k] = core.clean_text(data[k], mx)
    if "canonical" in data:
        out["canonical"] = core.safe_url(data["canonical"], allow_relative=False) if str(data["canonical"] or "").strip() else ""
    if "og_image" in data:
        out["og_image"] = core.safe_url(data["og_image"]) if str(data["og_image"] or "").strip() else ""
    if "robots" in data:
        out["robots"] = core.clean_robots(data["robots"]) if data["robots"] else ""
    if "schema_jsonld" in data:
        raw = (data["schema_jsonld"] or "").strip()
        if raw:
            try:
                obj = json.loads(raw)
            except ValueError:
                raise HTTPException(400, "Custom JSON-LD is not valid JSON")
            if not isinstance(obj, dict) or not obj.get("@type"):
                raise HTTPException(400, "Custom JSON-LD must be one object with an @type")
            blob = json.dumps(obj).lower()
            if "aggregaterating" in blob or '"review"' in blob:
                raise HTTPException(400, "Rating/review markup is generated only from verified booking reviews and cannot be added manually")
            raw = json.dumps(obj, ensure_ascii=False)
        out["schema_jsonld"] = raw
    return out


async def _check_version(doc, expected):
    if expected and (doc.get("seo_updated_at") or "") and doc.get("seo_updated_at") != expected:
        raise HTTPException(409, "This page's SEO was updated by someone else. Reload to see the latest version.")


def _merge(old, new):
    m = dict(old or {})
    for k, v in new.items():
        if v in ("", None):
            m.pop(k, None)
        else:
            m[k] = v
    return m


async def _detail(key):
    idx = await core.get_index(force=True)
    p = idx["by_key"].get(key)
    if not p:
        raise HTTPException(404, "Page not found")
    blocks = core.build_schema(p, idx)
    recs = _link_recs(p, idx)
    comp = _completeness(p)
    ps = await db.seo_page_status.find_one({"key": key}, {"_id": 0}) or {}
    version = None
    if p["type"] in ENTITY_COLL:
        version = ((await db[ENTITY_COLL[p["type"]]].find_one({"id": p["entity_id"]}, {"_id": 0, "seo_updated_at": 1})) or {}).get("seo_updated_at")
    elif p["type"] == "city":
        version = ((await db.seo_cities.find_one({"slug": p["entity_id"]}, {"_id": 0, "updated_at": 1})) or {}).get("updated_at")
    elif p["type"] == "city_service":
        version = ((await db.seo_city_pages.find_one({"id": p["entity_id"]}, {"_id": 0, "updated_at": 1})) or {}).get("updated_at")
    return {"version": version,"page": {k: v for k, v in p.items() if k not in ("gallery",)}, "schema": blocks,
            "schema_validation": core.validate_schema(blocks), "link_recommendations": recs, "completeness": comp,
            "status": ps, "global": {k: idx["global"].get(k) for k in ("title_template", "robots_default", "og_image")},
            "base": idx["base"], "gallery": p.get("gallery") or []}


def _completeness(p):
    ov, r = p.get("override") or {}, p["resolved"]
    items = [("Custom SEO title", bool(ov.get("title"))), ("Custom meta description", bool(ov.get("description"))),
             ("Readable URL slug", bool(p.get("slug")) or p["type"] not in ENTITY_COLL), ("Social image", bool(r.get("og_image"))),
             ("Image alt text", bool(r.get("image_alt")) or not p.get("image")),
             ("Content length ≥ 120 chars", p.get("content_len", 0) >= 120), ("No critical/high issues",
                                                                               not any(i["severity"] in ("critical", "high") for i in p["issues"]))]
    return {"items": [{"label": a, "ok": b} for a, b in items], "pct": round(100 * sum(1 for _, b in items if b) / len(items))}


def _link_recs(p, idx):
    recs = []
    if p["type"] == "service":
        cat = idx["by_key"].get(f"category:{p.get('category_id')}")
        if cat:
            recs.append({"text": f"Linked from category page {cat['path']}", "path": cat["path"], "ok": cat["published"]})
        sib = [x for x in idx["pages"] if x["type"] == "service" and x.get("category_id") == p.get("category_id")
               and x["key"] != p["key"] and x["published"]][:4]
        for s in sib:
            recs.append({"text": f"Related service in same category: {s['name']}", "path": s["path"], "ok": True})
        for c in (p.get("served_cities") or [])[:4]:
            cp = idx["by_key"].get(f"city:{core.slugify(c)}")
            if cp:
                recs.append({"text": f"Available in {c} — city page lists this service", "path": cp["path"], "ok": cp["indexable"]})
    elif p["type"] in ("category", "subcategory"):
        n = len([x for x in idx["pages"] if x["type"] == "service" and x.get("category_id") == p.get("category_id") and x["published"]])
        recs.append({"text": f"{n} published service(s) link back to this category", "path": p["path"], "ok": n > 0})
        recs.append({"text": "Listed on /services and the homepage category grid", "path": "/services", "ok": p["published"]})
    elif p["type"] == "city":
        cs = [x for x in idx["pages"] if x["type"] == "city_service" and x.get("city_slug") == p["entity_id"]]
        recs.append({"text": f"{len([x for x in cs if x['indexable']])} indexable city-service page(s) linked from this page", "path": p["path"], "ok": True})
    elif p["type"] == "city_service":
        city = idx["by_key"].get(f"city:{p.get('city_slug')}")
        recs.append({"text": "Linked from the city landing page", "path": city["path"] if city else "", "ok": bool(city and city["indexable"])})
        sp = idx["by_key"].get(f"service:{p.get('service_id')}")
        if sp:
            recs.append({"text": "Links to the main service page", "path": sp["path"], "ok": sp["published"]})
    return recs


async def _apply(p, body, admin, bulk=False):
    """Persist an override for one page. Returns nothing; raises on invalid input."""
    t, eid = p["type"], p["entity_id"]
    seo_in = _clean_seo(body.get("seo") or {})
    if t in ENTITY_COLL:
        coll = db[ENTITY_COLL[t]]
        doc = await coll.find_one({"id": eid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Record not found")
        if not bulk:
            await _check_version(doc, body.get("expected_updated_at"))
        upd = {"seo": _merge(doc.get("seo"), seo_in), "seo_updated_at": now_iso(), "updated_at": now_iso()}
        if t != "service" and "seo_defaults" in body:
            sd = body["seo_defaults"] or {}
            clean = {"title_template": core.clean_text(sd.get("title_template"), 120),
                     "description": core.clean_text(sd.get("description"), 400),
                     "robots": core.clean_robots(sd.get("robots")) if sd.get("robots") else "",
                     "og_image": core.safe_url(sd.get("og_image")) if sd.get("og_image") else ""}
            if clean["title_template"] and "{name}" not in clean["title_template"]:
                raise HTTPException(400, "Child title template must include {name}")
            upd["seo_defaults"] = {k: v for k, v in clean.items() if v}
        new_slug = None
        if body.get("slug") is not None and not bulk:
            new_slug = core.slugify(body["slug"])
            if not new_slug:
                raise HTTPException(400, "Slug cannot be empty")
            if new_slug != doc.get("slug"):
                if await coll.find_one({"slug": new_slug, "id": {"$ne": eid}}):
                    raise HTTPException(400, f"Slug '{new_slug}' is already used")
                if t in ("category", "subcategory"):
                    other = db.subcategories if t == "category" else db.categories
                    if await other.find_one({"slug": new_slug}):
                        raise HTTPException(400, f"Slug '{new_slug}' is already used by another category URL")
                upd["slug"] = new_slug
        await coll.update_one({"id": eid}, {"$set": upd})
        if new_slug and new_slug != doc.get("slug"):
            await wf.on_slug_change(t, doc, {**doc, "slug": new_slug})
        return
    if t == "city":
        cur = await db.seo_cities.find_one({"slug": eid}, {"_id": 0}) or {}
        if not bulk:
            await _check_version({"seo_updated_at": cur.get("updated_at")}, body.get("expected_updated_at"))
        c = body.get("city") or {}
        upd = {k: v for k, v in seo_in.items()}
        for k, mx in (("state", 80), ("country", 60), ("coverage", 3000)):
            if k in c:
                upd[k] = core.clean_text(c[k], mx)
        if "intro" in c:
            upd["intro"] = core.clean_long(c["intro"], 8000)
        if "faqs" in c:
            upd["faqs"] = _clean_faqs(c["faqs"])
        if "indexable" in c:
            upd["indexable"] = bool(c["indexable"])
        merged = _merge(cur, upd)
        merged.update(slug=eid, city=p["name"], updated_at=now_iso())
        await db.seo_cities.update_one({"slug": eid}, {"$set": merged}, upsert=True)
        return
    if t == "city_service":
        cur = await db.seo_city_pages.find_one({"id": eid}, {"_id": 0})
        if not bulk:
            await _check_version({"seo_updated_at": cur.get("updated_at")}, body.get("expected_updated_at"))
        c = body.get("city") or {}
        upd = dict(seo_in)
        if "intro" in c:
            upd["intro"] = core.clean_long(c["intro"], 8000)
        if "coverage" in c:
            upd["coverage"] = core.clean_text(c["coverage"], 3000)
        if "faqs" in c:
            upd["faqs"] = _clean_faqs(c["faqs"])
        if "indexable" in c:
            upd["indexable"] = bool(c["indexable"])
        if "status" in c and not bulk:
            if c["status"] not in ("draft", "published"):
                raise HTTPException(400, "Invalid status")
            upd["status"] = c["status"]
        merged = _merge({k: v for k, v in cur.items() if k not in ("id", "path", "city_slug", "service_id", "created_at")}, upd)
        merged["updated_at"] = now_iso()
        await db.seo_city_pages.update_one({"id": eid}, {"$set": merged})
        if merged.get("status") == "published":
            await core.invalidate("city_page")
            idx = await core.get_index(force=True)
            np = idx["by_key"].get(p["key"])
            blocking = [r for r in (np or {}).get("eligibility_reasons", []) if r != "Admin disabled indexing"]
            if blocking:
                await db.seo_city_pages.update_one({"id": eid}, {"$set": {"status": "draft"}})
                raise HTTPException(400, "Cannot publish: " + "; ".join(blocking))
        return
    if t == "static" and eid != "home":
        doc = await db.pages.find_one({"key": eid}, {"_id": 0}) or {}
        s = dict(doc.get("seo") or {})
        mp = {"title": "seo_title", "description": "meta_description", "canonical": "canonical_url", "og_image": "og_image"}
        for a, b in mp.items():
            if a in seo_in:
                s[b] = seo_in[a]
        if "robots" in seo_in:
            s["robots_index"] = "noindex" not in seo_in["robots"]
        if doc:
            await db.pages.update_one({"key": eid}, {"$set": {"seo": s, "updated_at": now_iso()}})
        else:
            await db.pages.insert_one({"id": new_id(), "key": eid, "title": p["name"], "seo": s, "created_at": now_iso(), "updated_at": now_iso()})
        return
    if t == "blog":
        doc = await db.blogs.find_one({"id": eid}, {"_id": 0}) or {}
        s = dict(doc.get("seo") or {})
        for a, b in {"title": "seo_title", "description": "meta_description", "canonical": "canonical_url", "og_image": "og_image"}.items():
            if a in seo_in:
                s[b] = seo_in[a]
        await db.blogs.update_one({"id": eid}, {"$set": {"seo": s, "updated_at": now_iso()}})
        return
    raise HTTPException(400, "The homepage is edited from Global Meta Settings")


# ================================================================ admin: overview
@router.get("/admin/seo/overview")
async def overview(type: str = "", category_id: str = "", city: str = "", status: str = "", date_from: str = "", date_to: str = "",
                   admin=Depends(ADMIN)):
    idx = await core.get_index()
    pages = _filter(idx["pages"], type=type, category_id=category_id, city=city, status=status, date_from=date_from, date_to=date_to)
    pub = [p for p in pages if p["published"]]
    by_type, by_code = {}, {}
    for p in pages:
        bt = by_type.setdefault(p["type"], {"total": 0, "indexable": 0, "custom": 0, "missing": 0})
        bt["total"] += 1
        bt["indexable"] += int(p["indexable"])
        bt["custom"] += int(p["meta_status"] == "custom")
        bt["missing"] += int(p["meta_status"] == "missing")
        for i in p["issues"]:
            if i["severity"] != "info":
                by_code[i["code"]] = by_code.get(i["code"], 0) + 1
    sm = await db.settings.find_one({"id": "seo_sitemap"}, {"_id": 0}) or {}
    audit = await db.settings.find_one({"id": "seo_audit"}, {"_id": 0}) or {}
    last_run = await db.seo_audit_runs.find_one({"status": "done"}, {"_id": 0, "technical": 1, "finished_at": 1, "avg_score": 1},
                                                sort=[("finished_at", -1)])
    tech = await seo_audit.technical_checks(idx)
    st_counts = {"published": len(pub), "eligible": len([p for p in pages if p["indexable"]])}
    keys = [p["key"] for p in pages]
    st_counts["submitted"] = await db.seo_page_status.count_documents({"key": {"$in": keys}, "submitted_at": {"$exists": True}})
    st_counts["indexed"] = await db.seo_page_status.count_documents({"key": {"$in": keys}, "indexed": True})
    st_counts["issue"] = await db.seo_page_status.count_documents({"key": {"$in": keys}, "inspection.verdict": {"$in": ["FAIL", "PARTIAL"]}})
    st_counts["inspected"] = await db.seo_page_status.count_documents({"key": {"$in": keys}, "inspection": {"$exists": True}})
    perf = await gsc.performance()
    gst = await gsc._cfg()
    return {
        "totals": {"pages": len(pages), "published": len(pub), "eligible": st_counts["eligible"],
                   "custom": len([p for p in pages if p["meta_status"] == "custom"]),
                   "missing": len([p for p in pages if p["meta_status"] == "missing"]),
                   "duplicates": len([p for p in pub if p["duplicate"]]),
                   "avg_score": round(sum(p["score"] for p in pub) / len(pub)) if pub else 0},
        "by_type": by_type, "top_issues": sorted([{"code": k, "label": core.ISSUE_LABELS.get(k, k), "count": v} for k, v in by_code.items()],
                                                 key=lambda x: -x["count"])[:10],
        "sitemap": {"url_count": sm.get("url_count", 0), "generated_at": sm.get("generated_at"), "stale": sm.get("stale"),
                    "url": f"{idx['base']}/sitemap.xml"},
        "technical": {"failing": len([c for c in tech if not c["ok"]]), "total": len(tech),
                      "critical": len([c for c in tech if c["severity"] == "critical"])},
        "audit": {"last_success": audit.get("last_success"), "avg_score": (last_run or {}).get("avg_score")},
        "indexing": st_counts,
        "gsc": {"connected": gsc.connected(), "property": gst.get("property"), "last_sync": gst.get("last_sync"),
                "totals": (perf or {}).get("totals"), "range": [(perf or {}).get("start"), (perf or {}).get("end")] if perf else None},
        "built_at": idx["built_at"],
        "facets": {"categories": sorted([{"id": p["entity_id"], "name": p["name"]} for p in idx["pages"] if p["type"] == "category"], key=lambda x: x["name"]),
                   "cities": sorted({p["city"] for p in idx["pages"] if p.get("city")})},
    }


# ================================================================ admin: global
@router.get("/admin/seo/global")
async def get_global(admin=Depends(ADMIN)):
    g = await core.get_global()
    return {**{k: v for k, v in g.items() if not k.startswith("_")}, "site_name": g["_site_name"], "brand_logo": g["_brand_logo"],
            "base": core.site_base(g), "env_base": core.env_base()}


@router.put("/admin/seo/global")
async def put_global(data: dict, admin=Depends(ADMIN)):
    await core.save_global(data, admin)
    wf.on_change("global_seo")
    return await get_global(admin)


@router.post("/admin/seo/global/reset")
async def reset_global(admin=Depends(ADMIN)):
    await core.reset_global(admin)
    wf.on_change("global_reset")
    return await get_global(admin)


# ================================================================ admin: pages / audit table
@router.get("/admin/seo/pages")
async def list_pages(type: str = "", category_id: str = "", city: str = "", status: str = "", meta: str = "", issue: str = "",
                     indexable: str = "", severity: str = "", q: str = "", date_from: str = "", date_to: str = "",
                     sort: str = "score", page: int = 1, page_size: int = Query(25, le=200), admin=Depends(ADMIN)):
    idx = await core.get_index()
    rows = _filter(idx["pages"], type, category_id, city, status, meta, issue, indexable, q, date_from, date_to, severity)
    keyf = {"score": lambda p: (p["score"], p["name"]), "name": lambda p: p["name"].lower(),
            "updated": lambda p: p.get("updated_at") or "", "type": lambda p: (p["type"], p["name"])}.get(sort.lstrip("-"), lambda p: p["score"])
    rows.sort(key=keyf, reverse=sort.startswith("-"))
    total = len(rows)
    page = max(1, page)
    sl = rows[(page - 1) * page_size: page * page_size]
    issue_codes = {}
    for p in idx["pages"]:
        for i in p["issues"]:
            issue_codes[i["code"]] = core.ISSUE_LABELS.get(i["code"], i["code"])
    return {"rows": [_row(p) for p in sl], "total": total, "page": page, "page_size": page_size,
            "pages": max(1, -(-total // page_size)), "issue_codes": issue_codes}


@router.get("/admin/seo/pages/export")
async def export_pages(type: str = "", category_id: str = "", city: str = "", status: str = "", meta: str = "", issue: str = "",
                       indexable: str = "", q: str = "", admin=Depends(ADMIN)):
    idx = await core.get_index()
    rows = _filter(idx["pages"], type, category_id, city, status, meta, issue, indexable, q)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Type", "Name", "Path", "Category", "City", "Title", "Description", "Canonical", "Robots", "Published",
                "Indexable", "Metadata", "Score", "Issues", "Last updated"])
    for p in rows:
        r = p["resolved"]
        w.writerow([p["type"], p["name"], p["path"], p.get("category_name"), p.get("city"), r["full_title"], r["description"],
                    r["canonical"], r["robots"], p["published"], p["indexable"], p["meta_status"], p["score"],
                    "; ".join(f"[{i['severity']}] {i['message']}" for i in p["issues"]), p.get("updated_at")])
    return Response(buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=seo-audit.csv"})


@router.get("/admin/seo/page")
async def page_detail(key: str, admin=Depends(ADMIN)):
    return await _detail(key)


@router.put("/admin/seo/page")
async def page_save(key: str, body: dict, admin=Depends(ADMIN)):
    idx = await core.get_index()
    p = idx["by_key"].get(key)
    if not p:
        raise HTTPException(404, "Page not found")
    await _apply(p, body, admin)
    await core.invalidate("page_save")
    wf.on_change("page_save")
    return await _detail(key)


# ================================================================ admin: bulk
BULK_TYPES = {"service", "category", "subcategory", "city"}


def _bulk_build(p, ch, g):
    ctx = {"name": p["name"], "category": p.get("category_name"), "city": p.get("city") or p["name"], "site_name": g["_site_name"]}
    seo = {}
    if ch.get("title_template"):
        seo["title"] = core._tpl(core.clean_text(ch["title_template"], 160), ctx)
    if ch.get("description_template"):
        seo["description"] = core._tpl(core.clean_text(ch["description_template"], 400), ctx)
    for k in ("robots", "og_image", "keywords"):
        if ch.get(k) is not None and ch.get(k) != "":
            seo[k] = ch[k]
    if ch.get("clear_overrides"):
        seo = {"title": "", "description": ""}
    return seo


@router.post("/admin/seo/bulk/preview")
async def bulk_preview(body: dict, admin=Depends(ADMIN)):
    idx = await core.get_index()
    keys = (body.get("keys") or [])[:500]
    ch = body.get("changes") or {}
    if ch.get("robots"):
        core.clean_robots(ch["robots"])
    out, titles = [], {}
    for k in keys:
        p = idx["by_key"].get(k)
        if not p:
            continue
        if p["type"] not in BULK_TYPES:
            out.append({"key": k, "name": p["name"], "skipped": True, "reason": f"{p['type']} pages are edited individually"})
            continue
        seo = _bulk_build(p, ch, idx["global"])
        after_t = seo.get("title", p["resolved"]["title"]) if not ch.get("clear_overrides") else "(inherited default)"
        warn = []
        if seo.get("title") and len(seo["title"]) > 60:
            warn.append("Title over 60 chars")
        if seo.get("description") and len(seo["description"]) < 50:
            warn.append("Description under 50 chars")
        if "noindex" in (seo.get("robots") or "") and p["indexable"]:
            warn.append("Will REMOVE this indexable page from search")
        titles[after_t] = titles.get(after_t, 0) + 1
        out.append({"key": k, "name": p["name"], "type": p["type"], "before": {"title": p["resolved"]["title"], "description": p["resolved"]["description"], "robots": p["resolved"]["robots"]},
                    "after": {"title": after_t, "description": seo.get("description", p["resolved"]["description"]), "robots": seo.get("robots", p["resolved"]["robots"])},
                    "warnings": warn})
    for o in out:
        if not o.get("skipped") and titles.get(o["after"]["title"], 0) > 1 and o["after"]["title"] != "(inherited default)":
            o["warnings"].append("Duplicate title within this batch")
    return {"items": out, "count": len([o for o in out if not o.get("skipped")]),
            "removes_indexing": len([o for o in out if any("REMOVE" in w for w in o.get("warnings", []))])}


@router.post("/admin/seo/bulk/apply")
async def bulk_apply(body: dict, admin=Depends(ADMIN)):
    if not body.get("confirm"):
        raise HTTPException(400, "Confirmation required")
    prev = await bulk_preview(body, admin)
    if prev["removes_indexing"] and not body.get("confirm_noindex"):
        raise HTTPException(400, f"{prev['removes_indexing']} indexable page(s) would get noindex. Confirm explicitly to proceed.")
    idx = await core.get_index()
    ch = body.get("changes") or {}
    done, errors = 0, []
    for it in prev["items"]:
        if it.get("skipped"):
            continue
        p = idx["by_key"][it["key"]]
        try:
            await _apply(p, {"seo": _bulk_build(p, ch, idx["global"])}, admin, bulk=True)
            done += 1
        except HTTPException as e:
            errors.append({"key": it["key"], "error": e.detail})
    await core.invalidate("bulk")
    wf.on_change("bulk")
    await wf.event("bulk_edit", f"Bulk SEO update applied to {done} page(s)", status="ok" if not errors else "warn")
    return {"updated": done, "errors": errors}


# ================================================================ admin: cities
@router.get("/admin/seo/cities")
async def cities(admin=Depends(ADMIN)):
    idx = await core.get_index()
    rows = []
    for p in idx["pages"]:
        if p["type"] != "city":
            continue
        cs = [x for x in idx["pages"] if x["type"] == "city_service" and x.get("city_slug") == p["entity_id"]]
        rows.append({**_row(p), "slug": p["entity_id"], "served": p.get("served", False), "areas": p.get("areas", []),
                     "pincodes": len(p.get("pincodes") or []), "partners": p.get("partners", 0), "bookings": p.get("bookings", 0),
                     "available_services": p.get("available_services", 0), "eligibility_reasons": p.get("eligibility_reasons", []),
                     "content_len": p.get("content_len", 0), "state": p.get("state", ""),
                     "city_pages": len(cs), "city_pages_indexable": len([x for x in cs if x["indexable"]])})
    return {"rows": rows, "min_unique": idx["tech"].get("city_min_unique_chars"),
            "min_unique_cs": idx["tech"].get("city_service_min_unique_chars")}


@router.get("/admin/seo/cities/{slug}/services")
async def city_services(slug: str, admin=Depends(ADMIN)):
    idx = await core.get_index()
    city = next((c for c in idx["cities"] if c["slug"] == slug), None)
    if not city:
        raise HTTPException(404, "City is not served")
    existing = {x.get("service_id"): x for x in idx["pages"] if x["type"] == "city_service" and x.get("city_slug") == slug}
    out = []
    for p in idx["pages"]:
        if p["type"] == "service" and p["published"] and city["city"] in (p.get("served_cities") or []):
            ex = existing.get(p["entity_id"])
            out.append({"service_id": p["entity_id"], "name": p["name"], "category_name": p.get("category_name"),
                        "page_key": ex["key"] if ex else None, "page_status": (ex or {}).get("override", {}).get("status"),
                        "indexable": bool(ex and ex["indexable"])})
    rows = [{**_row(x), "service_id": x.get("service_id"), "status": x["override"].get("status"),
             "eligibility_reasons": x.get("eligibility_reasons", []), "content_len": x.get("content_len", 0)} for x in existing.values()]
    return {"city": city["city"], "available": out, "pages": rows}


@router.post("/admin/seo/city-pages")
async def create_city_page(body: dict, admin=Depends(ADMIN)):
    idx = await core.get_index()
    slug = core.slugify(body.get("city_slug"))
    city = next((c for c in idx["cities"] if c["slug"] == slug), None)
    if not city:
        raise HTTPException(400, "AzoApp does not serve this city — no landing page can be created")
    sp = idx["by_key"].get(f"service:{body.get('service_id')}")
    if not sp or not sp["published"]:
        raise HTTPException(400, "Service is not published")
    if city["city"] not in (sp.get("served_cities") or []):
        raise HTTPException(400, f"{sp['name']} is not available in {city['city']} (set it up in Price Manager first)")
    path = f"/city/{slug}/{sp.get('slug') or sp['entity_id']}"
    if await db.seo_city_pages.find_one({"path": path}):
        raise HTTPException(400, "A page for this city and service already exists")
    doc = {"id": new_id(), "city_slug": slug, "service_id": sp["entity_id"], "path": path, "status": "draft",
           "intro": "", "faqs": [], "coverage": "", "indexable": True, "created_at": now_iso(), "updated_at": now_iso(),
           "created_by": (admin or {}).get("name") or ""}
    await db.seo_city_pages.insert_one(dict(doc))
    await core.invalidate("city_page_create")
    wf.on_change("city_page_create")
    return {"key": f"city_service:{doc['id']}", "path": path}


@router.delete("/admin/seo/city-pages/{pid}")
async def delete_city_page(pid: str, admin=Depends(ADMIN)):
    doc = await db.seo_city_pages.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    await db.seo_city_pages.delete_one({"id": pid})
    if doc.get("status") == "published":
        city_path = f"/city/{doc['city_slug']}"
        try:
            await core.add_redirect(doc["path"], city_path, "301", source="city_page_removed", admin=admin)
        except HTTPException:
            pass
    await core.invalidate("city_page_delete")
    wf.on_change("city_page_delete")
    return {"deleted": True}


# ================================================================ admin: technical / redirects
@router.get("/admin/seo/technical")
async def get_technical(admin=Depends(ADMIN)):
    return {**(await core.get_tech()), "robots_preview": await core.robots_txt()}


@router.put("/admin/seo/technical")
async def put_technical(data: dict, admin=Depends(ADMIN)):
    await core.save_tech(data)
    wf.on_change("technical")
    return await get_technical(admin)


@router.get("/admin/seo/technical/checks")
async def tech_checks(admin=Depends(ADMIN)):
    return await seo_audit.technical_checks()


@router.get("/admin/seo/redirects")
async def list_redirects(q: str = "", problem: str = "", page: int = 1, page_size: int = 25, admin=Depends(ADMIN)):
    idx = await core.get_index()
    rows = core.redirect_problems(await db.redirects.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000), set(idx["by_path"]))
    if q:
        rows = [r for r in rows if q.lower() in (r.get("from_path", "") + r.get("to_path", "")).lower()]
    if problem == "any":
        rows = [r for r in rows if r["problems"]]
    total = len(rows)
    return {"rows": rows[(page - 1) * page_size: page * page_size], "total": total, "page": page,
            "pages": max(1, -(-total // page_size))}


@router.post("/admin/seo/redirects")
async def create_redirect(body: dict, admin=Depends(ADMIN)):
    r = await core.add_redirect(body.get("from_path") or "", body.get("to_path") or "", str(body.get("type") or "301"), "manual", admin)
    wf.on_change("redirect")
    return r


@router.delete("/admin/seo/redirects/{rid}")
async def delete_redirect(rid: str, admin=Depends(ADMIN)):
    res = await db.redirects.delete_one({"id": rid})
    if not res.deleted_count:
        raise HTTPException(404, "Not found")
    await core.invalidate("redirect_delete")
    wf.on_change("redirect_delete")
    return {"deleted": True}


# ================================================================ admin: sitemap / schema
@router.get("/admin/seo/sitemap")
async def sitemap_status(admin=Depends(ADMIN)):
    idx, groups = await core.sitemap_entries()
    sm = await db.settings.find_one({"id": "seo_sitemap"}, {"_id": 0}) or {}
    chunk = int(idx["tech"].get("sitemap_chunk_size") or 5000)
    files = []
    for t, urls in groups.items():
        for i in range(0, len(urls), chunk):
            files.append({"type": t, "url": f"{idx['base']}/sitemaps/{t}-{i // chunk + 1}.xml", "count": len(urls[i:i + chunk])})
    excluded = [{"path": p["path"], "name": p["name"], "type": p["type"],
                 "reason": ("Not published" if not p["published"] else "Redirected" if p.get("redirected") else
                            "noindex" if "noindex" in p["resolved"]["robots"] else
                            "; ".join(p.get("eligibility_reasons") or []) or "Canonical points elsewhere")}
                for p in idx["pages"] if not p["indexable"]]
    return {"index_url": f"{idx['base']}/sitemap.xml", "api_url": f"{core.env_base()}/api/sitemap.xml",
            "robots_url": f"{idx['base']}/robots.txt", "counts": {k: len(v) for k, v in groups.items()},
            "total": sum(len(v) for v in groups.values()), "files": files, "excluded": excluded[:300], "excluded_total": len(excluded),
            "generated_at": sm.get("generated_at"), "stale": sm.get("stale"), "errors": sm.get("errors") or [],
            "chunk_size": chunk, "sample": {k: v[:5] for k, v in groups.items()}}


@router.post("/admin/seo/sitemap/regenerate")
async def sitemap_regen(admin=Depends(ADMIN)):
    await core.get_index(force=True)
    await core.sitemap_index_xml()
    await wf.event("sitemap", "Sitemap regenerated manually")
    return await sitemap_status(admin)


@router.get("/admin/seo/schema")
async def schema_preview(key: str, admin=Depends(ADMIN)):
    idx = await core.get_index()
    p = idx["by_key"].get(key)
    if not p:
        raise HTTPException(404, "Page not found")
    blocks = core.build_schema(p, idx)
    return {"key": key, "name": p["name"], "path": p["path"], "blocks": blocks, "validation": core.validate_schema(blocks)}


@router.get("/admin/seo/schema/summary")
async def schema_summary(admin=Depends(ADMIN)):
    idx = await core.get_index()
    types, errs, warns, rows = {}, 0, 0, []
    for p in idx["pages"]:
        if not p["published"]:
            continue
        blocks = core.build_schema(p, idx)
        v = core.validate_schema(blocks)
        e = sum(len(x["errors"]) for x in v)
        w = sum(len(x["warnings"]) for x in v)
        errs += e
        warns += w
        for b in blocks:
            types[b.get("@type")] = types.get(b.get("@type"), 0) + 1
        if e or w:
            rows.append({"key": p["key"], "name": p["name"], "type": p["type"], "errors": e, "warnings": w,
                         "messages": [m for x in v for m in x["errors"] + x["warnings"]][:4]})
    g = idx["global"]
    return {"types": types, "errors": errs, "warnings": warns, "rows": sorted(rows, key=lambda r: -r["errors"])[:200],
            "organization": {"name": g.get("org_name") or g["_site_name"], "logo": g.get("org_logo") or g.get("_brand_logo"),
                             "same_as": g.get("org_same_as") or [], "business_locations": g.get("business_locations") or []}}


# ================================================================ admin: GSC / indexing
@router.get("/admin/seo/gsc/status")
async def gsc_status(admin=Depends(ADMIN)):
    return await gsc.status()


@router.post("/admin/seo/gsc/credentials")
async def gsc_upload(file: UploadFile = File(...), admin=Depends(ADMIN)):
    raw = await file.read(1024 * 1024 + 1)
    res = await gsc.upload(raw, admin)
    await wf.event("gsc", "Search Console credentials uploaded")
    return res


@router.delete("/admin/seo/gsc/credentials")
async def gsc_remove(admin=Depends(ADMIN)):
    await wf.event("gsc", "Search Console disconnected")
    return await gsc.disconnect()


@router.put("/admin/seo/gsc/property")
async def gsc_property(body: dict, admin=Depends(ADMIN)):
    return await gsc.set_property(body.get("property") or "")


@router.post("/admin/seo/gsc/submit-sitemap")
async def gsc_submit(admin=Depends(ADMIN)):
    idx = await core.get_index()
    try:
        res = await gsc.submit_sitemap(f"{idx['base']}/sitemap.xml")
    except HTTPException as e:
        await wf.event("sitemap_submit", f"Sitemap submission failed: {e.detail}", status="error")
        raise
    await db.seo_page_status.update_many({"pending_submission": True}, {"$set": {"pending_submission": False, "submitted_at": now_iso()}})
    await wf.event("sitemap_submit", f"Sitemap submitted to {res['property']}")
    return res


@router.get("/admin/seo/gsc/sitemaps")
async def gsc_sitemaps(admin=Depends(ADMIN)):
    return await gsc.list_sitemaps()


@router.post("/admin/seo/gsc/sync")
async def gsc_sync(body: dict = None, admin=Depends(ADMIN)):
    try:
        res = await gsc.sync_performance(int((body or {}).get("days") or 28))
    except HTTPException as e:
        await wf.event("gsc_sync", f"Performance sync failed: {e.detail}", status="error")
        raise
    await wf.event("gsc_sync", "Search performance synced from Google")
    return res


@router.get("/admin/seo/gsc/performance")
async def gsc_perf(admin=Depends(ADMIN)):
    return await gsc.performance() or {}


@router.post("/admin/seo/gsc/inspect")
async def gsc_inspect(body: dict, admin=Depends(ADMIN)):
    idx = await core.get_index()
    p = idx["by_key"].get(body.get("key") or "")
    if not p:
        raise HTTPException(404, "Page not found")
    try:
        res = await gsc.inspect(p["resolved"]["canonical"])
    except HTTPException as e:
        await wf.event("inspect", f"URL inspection failed: {e.detail}", key=p["key"], status="error")
        raise
    await db.seo_page_status.update_one({"key": p["key"]}, {"$set": {"inspection": res, "indexed": res.get("verdict") == "PASS"}}, upsert=True)
    await wf.event("inspect", f"{p['path']}: {res.get('coverage_state') or res.get('verdict')}", key=p["key"])
    return res


@router.get("/admin/seo/indexing")
async def indexing(state: str = "", q: str = "", page: int = 1, page_size: int = 25, admin=Depends(ADMIN)):
    idx = await core.get_index()
    st = {d["key"]: d async for d in db.seo_page_status.find({}, {"_id": 0, "steps": 1, "key": 1, "submitted_at": 1, "indexed": 1,
                                                                   "inspection": 1, "checked_at": 1, "pending_submission": 1})}
    rows = []
    for p in idx["pages"]:
        s = st.get(p["key"]) or {}
        insp = s.get("inspection") or {}
        states = {"published": p["published"], "eligible": p["indexable"], "submitted": bool(s.get("submitted_at")),
                  "indexed": bool(s.get("indexed")), "issue": insp.get("verdict") in ("FAIL", "PARTIAL"),
                  "inspected": bool(insp)}
        rows.append({"key": p["key"], "name": p["name"], "type": p["type"], "path": p["path"], "url": p["resolved"]["canonical"],
                     "states": states, "submitted_at": s.get("submitted_at"), "checked_at": s.get("checked_at"),
                     "inspection": insp, "steps": s.get("steps") or [], "pending": bool(s.get("pending_submission"))})
    counts = {k: len([r for r in rows if r["states"][k]]) for k in ("published", "eligible", "submitted", "indexed", "issue", "inspected")}
    if state:
        rows = [r for r in rows if r["states"].get(state)] if state != "not_eligible" else [r for r in rows if r["states"]["published"] and not r["states"]["eligible"]]
    if q:
        rows = [r for r in rows if q.lower() in (r["name"] + r["path"]).lower()]
    total = len(rows)
    return {"rows": rows[(page - 1) * page_size: page * page_size], "total": total, "page": page,
            "pages": max(1, -(-total // page_size)), "counts": counts, "gsc_connected": gsc.connected()}


@router.get("/admin/seo/events")
async def events(limit: int = 50, admin=Depends(ADMIN)):
    ev = await db.seo_events.find({}, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 200))
    jobs = await db.seo_jobs.find({"status": {"$in": ["queued", "running", "failed"]}}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"events": ev, "jobs": jobs}


@router.post("/admin/seo/jobs/{jid}/retry")
async def retry_job(jid: str, admin=Depends(ADMIN)):
    job = await db.seo_jobs.find_one({"id": jid}, {"_id": 0})
    if not job or job["status"] != "failed":
        raise HTTPException(400, "Only failed jobs can be retried")
    if job.get("manual_retries", 0) >= 5:
        raise HTTPException(429, "Retry limit reached for this job")
    await db.seo_jobs.update_one({"id": jid}, {"$set": {"status": "queued", "attempts": 0, "next_run_at": now_iso()},
                                               "$inc": {"manual_retries": 1}})
    return {"queued": True}


@router.post("/admin/seo/reconcile")
async def reconcile_now(admin=Depends(ADMIN)):
    return await wf.reconcile()


# ================================================================ admin: audit runs
@router.post("/admin/seo/audit/run")
async def audit_run(admin=Depends(ADMIN)):
    running = await db.seo_audit_runs.find_one({"status": "running"}, {"_id": 0})
    if running:
        return {"run_id": running["id"], "status": "running"}
    rid = seo_audit.start_audit()
    return {"run_id": rid, "status": "running"}


@router.get("/admin/seo/audit/latest")
async def audit_latest(admin=Depends(ADMIN)):
    last = await db.seo_audit_runs.find_one({}, {"_id": 0}, sort=[("started_at", -1)])
    ok = await db.seo_audit_runs.find_one({"status": "done"}, {"_id": 0}, sort=[("finished_at", -1)])
    runs = await db.seo_audit_runs.find({}, {"_id": 0, "id": 1, "status": 1, "started_at": 1, "finished_at": 1, "avg_score": 1,
                                             "by_severity": 1, "pages": 1}).sort("started_at", -1).to_list(10)
    return {"current": last, "last_success": ok, "runs": runs}
