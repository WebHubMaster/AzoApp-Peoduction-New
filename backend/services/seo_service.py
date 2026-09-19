"""SEO helpers: sitemap ping / auto-ping to search engines.

The sitemap itself (routes/site_routes.py) already auto-includes every ACTIVE
category, sub-category and service using each doc's canonical SEO URL. This
module lets any write path (catalog create/update/delete) notify search
engines so new/changed pages get indexed faster — best-effort & throttled so
we never hammer the endpoints during bulk edits.
"""
import os
import asyncio
from datetime import datetime, timezone

from config.database import db, now_iso

# Minimum seconds between two real pings (bulk edits collapse into one).
PING_THROTTLE_SECONDS = 60


def site_base():
    return (os.environ.get("REACT_APP_BACKEND_URL", "")).rstrip("/")


def sitemap_url():
    return f"{site_base()}/api/sitemap.xml"


async def do_ping(source: str = "manual", throttle: bool = False):
    """Ping search engines with the sitemap URL. Returns a result dict.

    When throttle=True, skips the network call if we pinged very recently
    (used by the automatic trigger). Always best-effort — never raises.
    """
    import httpx

    smap = sitemap_url()
    if throttle:
        doc = await db.settings.find_one({"id": "seo_ping"}, {"_id": 0}) or {}
        last_ts = doc.get("last_ping_ts")
        if last_ts:
            try:
                if (datetime.now(timezone.utc).timestamp() - float(last_ts)) < PING_THROTTLE_SECONDS:
                    return {"pinged": False, "throttled": True, "sitemap_url": smap, "source": source}
            except (TypeError, ValueError):
                pass

    targets = {
        "Google": f"https://www.google.com/ping?sitemap={smap}",
        "Bing": f"https://www.bing.com/ping?sitemap={smap}",
    }
    results = []
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            for name, url in targets.items():
                try:
                    r = await client.get(url)
                    results.append({"engine": name, "status": r.status_code, "ok": r.status_code < 400})
                except Exception as e:  # noqa: BLE001
                    results.append({"engine": name, "status": 0, "ok": False, "error": str(e)[:120]})
    except Exception as e:  # noqa: BLE001
        results.append({"engine": "all", "status": 0, "ok": False, "error": str(e)[:120]})

    await db.settings.update_one(
        {"id": "seo_ping"},
        {"$set": {
            "id": "seo_ping",
            "last_ping": now_iso(),
            "last_ping_ts": datetime.now(timezone.utc).timestamp(),
            "last_source": source,
            "last_results": results,
        }},
        upsert=True,
    )
    return {"pinged": True, "sitemap_url": smap, "results": results, "source": source}


def auto_ping(source: str = "catalog"):
    """Fire-and-forget throttled ping. Safe to call from any async write path;
    never blocks the request and never raises."""
    try:
        loop = asyncio.get_event_loop()
        loop.create_task(do_ping(source=source, throttle=True))
    except RuntimeError:
        # No running loop (e.g. called from sync context) — ignore silently.
        pass
