"""Google Search Console integration (service account). Credentials stay on the server only."""
import asyncio
import hashlib
import json
import os
import pathlib
import tempfile
from datetime import date, timedelta

from fastapi import HTTPException

from config.database import db, now_iso

SCOPE = "https://www.googleapis.com/auth/webmasters"
_svc = {"client": None}


def _path():
    p = os.environ.get("GSC_CREDENTIALS_PATH")
    if not p:
        raise HTTPException(500, "GSC_CREDENTIALS_PATH is not configured")
    return pathlib.Path(p)


def _client():
    if _svc["client"] is not None:
        return _svc["client"]
    path = _path()
    if not path.is_file():
        return None
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    creds = service_account.Credentials.from_service_account_file(str(path), scopes=[SCOPE])
    _svc["client"] = build("searchconsole", "v1", credentials=creds, cache_discovery=False)
    return _svc["client"]


async def _cfg():
    return await db.settings.find_one({"id": "gsc"}, {"_id": 0}) or {"id": "gsc"}


async def _set(**kw):
    await db.settings.update_one({"id": "gsc"}, {"$set": {"id": "gsc", **kw}}, upsert=True)


def _err(e):
    status = getattr(getattr(e, "resp", None), "status", None)
    msg = {401: "Google rejected the credentials (401)", 403: "Service account lacks access to this property (403)",
           404: "Property or resource not found (404)", 429: "Google rate limit reached (429) — retry later"}
    return msg.get(int(status) if status else 0, f"Google request failed{f' ({status})' if status else ''}")


async def _call(fn):
    cli = _client()
    if cli is None:
        raise HTTPException(503, "Not connected")
    try:
        return await asyncio.to_thread(lambda: fn(cli).execute())
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        m = _err(e)
        await _set(last_error=m, last_error_at=now_iso())
        raise HTTPException(502, m)


async def status():
    cfg = await _cfg()
    present = _path().is_file()
    out = {"connected": False, "status": "Not connected", "credentials_present": present,
           "property": cfg.get("property") or "", "service_account": cfg.get("service_account") or "",
           "last_sync": cfg.get("last_sync"), "last_error": cfg.get("last_error"), "last_error_at": cfg.get("last_error_at"),
           "last_sitemap_submit": cfg.get("last_sitemap_submit"), "connected_at": cfg.get("connected_at")}
    if present:
        try:
            sites = await _call(lambda c: c.sites().list())
            out.update(connected=True, status="Connected", sites=[s.get("siteUrl") for s in sites.get("siteEntry", [])],
                       site_permissions={s.get("siteUrl"): s.get("permissionLevel") for s in sites.get("siteEntry", [])})
        except HTTPException as e:
            out.update(status="Credentials present but unavailable", error=e.detail)
    return out


async def upload(raw: bytes, admin):
    if len(raw) > 1024 * 1024:
        raise HTTPException(400, "Credential file is too large")
    try:
        obj = json.loads(raw)
        if obj.get("type") != "service_account" or not obj.get("client_email") or not obj.get("private_key"):
            raise ValueError()
        from google.oauth2 import service_account
        service_account.Credentials.from_service_account_info(obj, scopes=[SCOPE])
    except Exception:  # noqa: BLE001
        raise HTTPException(400, "Invalid service-account JSON")
    path = _path()
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".gsc-", text=True)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(raw.decode())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    _svc["client"] = None
    await _set(service_account=obj["client_email"], connected_at=now_iso(), last_error=None,
               key_fingerprint=hashlib.sha256(raw).hexdigest()[:16], uploaded_by=(admin or {}).get("name") or "")
    return await status()


async def disconnect():
    p = _path()
    if p.is_file():
        p.unlink()
    _svc["client"] = None
    await _set(service_account="", connected_at=None, property="")
    return await status()


async def set_property(prop: str):
    prop = (prop or "").strip()
    if not (prop.startswith("sc-domain:") or prop.startswith("https://") or prop.startswith("http://")):
        raise HTTPException(400, "Property must be a URL-prefix (https://example.com/) or sc-domain:example.com")
    await _set(property=prop)
    return await status()


async def _prop():
    p = (await _cfg()).get("property")
    if not p:
        raise HTTPException(400, "Select a Search Console property first")
    return p


async def submit_sitemap(sitemap_url: str):
    prop = await _prop()
    await _call(lambda c: c.sitemaps().submit(siteUrl=prop, feedpath=sitemap_url))
    await _set(last_sitemap_submit=now_iso(), last_error=None)
    return {"submitted": True, "sitemap_url": sitemap_url, "property": prop,
            "note": "Google accepted the sitemap submission. This does not confirm crawling or indexing."}


async def list_sitemaps():
    prop = await _prop()
    r = await _call(lambda c: c.sitemaps().list(siteUrl=prop))
    return r.get("sitemap", [])


async def sync_performance(days: int = 28):
    prop = await _prop()
    end = date.today() - timedelta(days=2)
    start = end - timedelta(days=max(1, min(days, 480)))
    out = {}
    for dim in ("query", "page", "date"):
        body = {"startDate": start.isoformat(), "endDate": end.isoformat(), "dimensions": [dim], "rowLimit": 250}
        r = await _call(lambda c, b=body: c.searchanalytics().query(siteUrl=prop, body=b))
        out[dim] = r.get("rows", [])
    tot = {"clicks": sum(x.get("clicks", 0) for x in out["date"]),
           "impressions": sum(x.get("impressions", 0) for x in out["date"])}
    tot["ctr"] = (tot["clicks"] / tot["impressions"]) if tot["impressions"] else 0
    w = sum(x.get("impressions", 0) * x.get("position", 0) for x in out["date"])
    tot["position"] = (w / tot["impressions"]) if tot["impressions"] else 0
    snap = {"id": "gsc_performance", "property": prop, "start": start.isoformat(), "end": end.isoformat(),
            "totals": tot, "queries": out["query"], "pages": out["page"], "daily": out["date"], "synced_at": now_iso()}
    await db.settings.update_one({"id": "gsc_performance"}, {"$set": snap}, upsert=True)
    await _set(last_sync=now_iso(), last_error=None)
    return snap


async def performance():
    return await db.settings.find_one({"id": "gsc_performance"}, {"_id": 0})


async def inspect(url: str):
    prop = await _prop()
    body = {"inspectionUrl": url, "siteUrl": prop, "languageCode": "en-US"}
    r = await _call(lambda c: c.urlInspection().index().inspect(body=body))
    ir = (r.get("inspectionResult") or {}).get("indexStatusResult") or {}
    return {"url": url, "verdict": ir.get("verdict"), "coverage_state": ir.get("coverageState"),
            "indexing_state": ir.get("indexingState"), "last_crawl": ir.get("lastCrawlTime"),
            "google_canonical": ir.get("googleCanonical"), "user_canonical": ir.get("userCanonical"),
            "robots_txt_state": ir.get("robotsTxtState"), "page_fetch_state": ir.get("pageFetchState"),
            "inspected_at": now_iso(), "link": (r.get("inspectionResult") or {}).get("inspectionResultLink")}


def connected():
    try:
        return _path().is_file()
    except HTTPException:
        return False
