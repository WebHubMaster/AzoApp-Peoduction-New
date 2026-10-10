"""SEO publishing/discovery workflow: reconcile page changes, validate, update sitemap,
queue authorised Search Console actions with retries + backoff. Never fakes indexing."""
import asyncio
import hashlib
import logging
from datetime import datetime, timedelta, timezone

from config.database import db, now_iso
from models.user import new_id
from services import seo_core, gsc_service

log = logging.getLogger("azoapp.seo")
BACKOFF = [60, 300, 900, 3600]
MAX_ATTEMPTS = 4
SUBMIT_MIN_GAP = 600
_task = {"t": None}


def _now():
    return datetime.now(timezone.utc)


def _fp(p):
    r = p["resolved"]
    raw = "|".join(str(x) for x in (p["path"], r["full_title"], r["description"], r["robots"], r["canonical"],
                                     p["published"], p["indexable"], p.get("updated_at")))
    return hashlib.sha1(raw.encode()).hexdigest()


async def event(kind, message, key="", status="ok", detail=None):
    await db.seo_events.insert_one({"id": new_id(), "kind": kind, "key": key, "status": status, "message": message,
                                    "detail": detail or {}, "created_at": now_iso()})


async def enqueue(kind, key="", delay=0, payload=None):
    if await db.seo_jobs.find_one({"kind": kind, "key": key, "status": "queued"}):
        return
    await db.seo_jobs.insert_one({"id": new_id(), "kind": kind, "key": key, "payload": payload or {}, "status": "queued",
                                  "attempts": 0, "next_run_at": (_now() + timedelta(seconds=delay)).isoformat(),
                                  "created_at": now_iso()})


def on_change(reason="catalog"):
    """Fire-and-forget from any write path."""
    try:
        loop = asyncio.get_event_loop()
        loop.create_task(_on_change(reason))
    except RuntimeError:
        pass


async def _on_change(reason):
    await seo_core.invalidate(reason)
    await enqueue("reconcile", delay=5)


async def on_slug_change(kind, old_doc, new_doc):
    """Create a 301 from the previously published URL when a slug changes."""
    old_slug, new_slug = (old_doc or {}).get("slug"), (new_doc or {}).get("slug")
    if not old_slug or not new_slug or old_slug == new_slug:
        return None
    if (old_doc or {}).get("status") != "active":
        return None
    tech = await seo_core.get_tech()
    if not tech.get("auto_slug_redirects", True):
        return None
    prefix = "/service/" if kind == "service" else "/category/"
    try:
        r = await seo_core.add_redirect(prefix + old_slug, prefix + new_slug, "301", source=f"{kind}_slug_change")
        await event("redirect", f"Slug changed: {prefix}{old_slug} → {prefix}{new_slug} (301 created)", key=f"{kind}:{new_doc.get('id')}")
        return r
    except Exception as e:  # noqa: BLE001
        await event("redirect", f"Could not create redirect for slug change: {e}", status="error")
        return None


def _steps(p, in_sitemap):
    r = p["resolved"]
    crit = [i for i in p["issues"] if i["severity"] == "critical"]
    return [
        {"step": "Metadata & canonical valid", "ok": not crit, "detail": "; ".join(i["message"] for i in crit) or "OK"},
        {"step": "Intended to be indexable", "ok": "noindex" not in r["robots"] and p.get("eligible", True),
         "detail": r["robots"] if "noindex" in r["robots"] else ("; ".join(p.get("eligibility_reasons") or []) or "OK")},
        {"step": "Publicly accessible", "ok": bool(p["published"]) and not p.get("redirected"),
         "detail": "Redirected" if p.get("redirected") else ("Published" if p["published"] else "Not published")},
        {"step": "Included in sitemap", "ok": in_sitemap, "detail": "Yes" if in_sitemap else "Excluded"},
        {"step": "Discoverable via internal links", "ok": bool(p.get("linked")), "detail": "Linked" if p.get("linked") else "No internal link"},
    ]


async def reconcile():
    idx = await seo_core.get_index(force=True)
    _, groups = await seo_core.sitemap_entries()
    locs = {u["loc"] for v in groups.values() for u in v}
    existing = {d["key"]: d async for d in db.seo_page_status.find({}, {"_id": 0})}
    changed = 0
    for p in idx["pages"]:
        fp = _fp(p)
        cur = existing.get(p["key"]) or {}
        if cur.get("fingerprint") == fp:
            continue
        in_sm = p["resolved"]["canonical"] in locs
        doc = {"key": p["key"], "path": p["path"], "type": p["type"], "name": p["name"], "fingerprint": fp,
               "published": bool(p["published"]), "eligible": bool(p["indexable"]), "in_sitemap": in_sm,
               "steps": _steps(p, in_sm), "checked_at": now_iso(),
               "pending_submission": in_sm and gsc_service.connected(),
               "issue": next((i["message"] for i in p["issues"] if i["severity"] in ("critical", "high")), None)}
        await db.seo_page_status.update_one({"key": p["key"]}, {"$set": doc, "$setOnInsert": {"first_seen": now_iso()}}, upsert=True)
        if cur:
            changed += 1
            await event("page_check", f"{p['name']}: {'eligible' if p['indexable'] else 'not eligible'} for indexing", key=p["key"],
                        status="ok" if p["indexable"] or not p["published"] else "warn")
    live = set(idx["by_key"])
    stale = [k for k in existing if k not in live]
    if stale:
        await db.seo_page_status.delete_many({"key": {"$in": stale}})
    await seo_core.sitemap_index_xml()
    if (changed or not existing) and gsc_service.connected() and (await gsc_service._cfg()).get("property"):
        await enqueue("sitemap_submit", delay=60)
    return {"pages": len(idx["pages"]), "changed": changed, "removed": len(stale)}


async def _submit(job):
    cfg = await gsc_service._cfg()
    last = cfg.get("last_sitemap_submit")
    if last and (_now() - datetime.fromisoformat(last)).total_seconds() < SUBMIT_MIN_GAP:
        return "deferred"
    idx = await seo_core.get_index()
    res = await gsc_service.submit_sitemap(f"{idx['base']}/sitemap.xml")
    await db.seo_page_status.update_many({"pending_submission": True},
                                         {"$set": {"pending_submission": False, "submitted_at": now_iso()}})
    await event("sitemap_submit", f"Sitemap submitted to Search Console ({res['property']})")
    return "done"


async def _inspect(job):
    url = job["payload"]["url"]
    res = await gsc_service.inspect(url)
    await db.seo_page_status.update_one({"key": job["key"]}, {"$set": {"inspection": res,
                                        "indexed": res.get("verdict") == "PASS"}})
    await event("inspect", f"URL inspected: {res.get('coverage_state') or res.get('verdict')}", key=job["key"])
    return "done"


async def _run(job):
    kind = job["kind"]
    if kind == "reconcile":
        await reconcile()
        return "done"
    if kind == "sitemap_submit":
        return await _submit(job)
    if kind == "inspect":
        return await _inspect(job)
    if kind == "audit":
        from services import seo_audit
        await seo_audit.run_audit(job.get("payload", {}).get("run_id"))
        return "done"
    return "done"


async def process_due():
    now = _now().isoformat()
    jobs = await db.seo_jobs.find({"status": "queued", "next_run_at": {"$lte": now}}, {"_id": 0}).to_list(20)
    for job in jobs:
        claimed = await db.seo_jobs.update_one({"id": job["id"], "status": "queued"}, {"$set": {"status": "running", "started_at": now_iso()}})
        if not claimed.modified_count:
            continue
        try:
            res = await _run(job)
            if res == "deferred":
                await db.seo_jobs.update_one({"id": job["id"]}, {"$set": {"status": "queued",
                                             "next_run_at": (_now() + timedelta(seconds=SUBMIT_MIN_GAP)).isoformat()}})
            else:
                await db.seo_jobs.update_one({"id": job["id"]}, {"$set": {"status": "done", "finished_at": now_iso(), "error": None}})
        except Exception as e:  # noqa: BLE001
            msg = getattr(e, "detail", None) or str(e)[:200]
            att = job.get("attempts", 0) + 1
            final = att >= MAX_ATTEMPTS or msg == "Not connected"
            await db.seo_jobs.update_one({"id": job["id"]}, {"$set": {
                "status": "failed" if final else "queued", "attempts": att, "error": msg, "failed_at": now_iso(),
                "next_run_at": (_now() + timedelta(seconds=BACKOFF[min(att - 1, len(BACKOFF) - 1)])).isoformat()}})
            await event(job["kind"], f"{job['kind']} failed (attempt {att}/{MAX_ATTEMPTS}): {msg}", key=job.get("key", ""), status="error")


async def _loop():
    await asyncio.sleep(8)
    try:
        await seo_core.ensure_indexes()
        await seo_core.ensure_slugs()
        await enqueue("reconcile")
    except Exception as e:  # noqa: BLE001
        log.warning("seo init: %s", e)
    while True:
        try:
            await process_due()
        except Exception as e:  # noqa: BLE001
            log.warning("seo worker: %s", e)
        await asyncio.sleep(15)


def start():
    if _task["t"] is None:
        _task["t"] = asyncio.get_event_loop().create_task(_loop())
