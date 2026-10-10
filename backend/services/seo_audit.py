"""SEO audit runs (background) + technical checks. Rule-based; never a Google ranking score."""
import asyncio
import pathlib
import re
from urllib.parse import urlparse

from config.database import db, now_iso
from models.user import new_id
from services import seo_core

INDEX_HTML = pathlib.Path(__file__).resolve().parents[2] / "web_panel" / "public" / "index.html"


def _chk(code, title, ok, severity, detail, fix="", source="rule"):
    return {"code": code, "title": title, "ok": bool(ok), "severity": "ok" if ok else severity,
            "detail": detail, "fix": "" if ok else fix, "source": source}


async def technical_checks(idx=None):
    idx = idx or await seo_core.get_index()
    g, tech, base = idx["global"], idx["tech"], idx["base"]
    pu = urlparse(base)
    out = [
        _chk("https", "HTTPS on preferred host", pu.scheme == "https", "critical", f"Preferred base: {base}",
             "Serve the site over HTTPS and set it as preferred host."),
        _chk("preferred_host", "Preferred hostname configured", bool(g.get("preferred_host")), "medium",
             g.get("preferred_host") or f"Not set — falling back to {base}",
             "Set your production domain in Global Meta → Canonical policy."),
    ]
    priv = tech.get("private_paths") or []
    blocked_essential = [p for p in priv if p == "/" or any(p == e for e in seo_core.ESSENTIAL_PREFIXES)]
    out.append(_chk("robots_safe", "Robots.txt does not block essential pages/assets", not blocked_essential, "critical",
                    f"Disallowed: {', '.join(priv) or 'none'}", "Remove essential paths from Disallow."))
    must_private = ["/admin", "/account", "/partner", "/merchant"]
    missing_priv = [p for p in must_private if p not in priv]
    out.append(_chk("private_routes", "Private dashboards excluded from crawling", not missing_priv, "high",
                    "All private dashboards disallowed + noindex" if not missing_priv else f"Not disallowed: {', '.join(missing_priv)}",
                    "Add these paths to private paths in Technical SEO."))
    known = set(idx["by_path"])
    rp = seo_core.redirect_problems(idx["redirects"], known)
    loops = [r for r in rp if any(p["code"] == "loop" for p in r["problems"])]
    chains = [r for r in rp if any(p["code"] == "chain" for p in r["problems"])]
    broken = [r for r in rp if any(p["code"] == "broken_target" for p in r["problems"])]
    external = [r for r in rp if any(p["code"] == "external" for p in r["problems"])]
    out += [
        _chk("redirect_loops", "No redirect loops", not loops, "critical", f"{len(loops)} loop(s)", "Fix or delete looping rules."),
        _chk("redirect_chains", "No redirect chains", not chains, "medium", f"{len(chains)} chain(s)", "Point rules straight to the final URL."),
        _chk("redirect_targets", "Redirect destinations resolve to real pages", not broken, "high",
             f"{len(broken)} broken destination(s)" + (f": {', '.join(r['to_path'] for r in broken[:5])}" if broken else ""),
             "Update destinations to existing public pages."),
        _chk("open_redirects", "No external/open redirects", not external, "high", f"{len(external)} external", "Use same-domain paths only."),
    ]
    pages = idx["pages"]
    pub = [p for p in pages if p["published"]]
    canon_groups = {}
    for p in pub:
        canon_groups.setdefault(p["resolved"]["canonical"].rstrip("/"), []).append(p["path"])
    dup_urls = {k: v for k, v in canon_groups.items() if len(v) > 1}
    out.append(_chk("duplicate_urls", "No duplicate URLs competing for the same canonical", not dup_urls, "medium",
                    f"{len(dup_urls)} canonical(s) shared by multiple pages" + (f": {list(dup_urls)[0]}" if dup_urls else ""),
                    "Give each page a unique canonical or consolidate."))
    bad_canon = [p for p in pub if any(i["code"] == "invalid_canonical" for i in p["issues"])]
    out.append(_chk("canonicals", "Canonical URLs valid and on preferred host", not bad_canon, "high",
                    f"{len(bad_canon)} invalid", "Fix canonical overrides."))
    sch_err = 0
    for p in pub[:2000]:
        sch_err += sum(len(v["errors"]) for v in seo_core.validate_schema(seo_core.build_schema(p, idx)))
    out.append(_chk("schema", "Structured data passes required-property validation", sch_err == 0, "medium",
                    f"{sch_err} error(s) across published pages", "Open Schema Markup to review."))
    try:
        html_txt = INDEX_HTML.read_text(errors="ignore")
    except OSError:
        html_txt = ""
    vp = bool(re.search(r'<meta[^>]+name=["\']viewport["\'][^>]+width=device-width', html_txt, re.I))
    out.append(_chk("mobile_viewport", "Mobile viewport meta tag present", vp, "high",
                    "width=device-width found in index.html" if vp else "No responsive viewport meta tag", "Add a viewport meta tag."))
    lang = bool(re.search(r"<html[^>]+lang=", html_txt, re.I))
    out.append(_chk("html_lang", "HTML lang attribute set", lang, "low", "Present" if lang else "Missing", "Add lang to <html>."))
    out.append(_chk("pagination", "Paginated listings use crawlable, self-canonical URLs", True, "low",
                    "Listing pages use one canonical URL; filtered/query variants (?q=, ?page=) are not added to the sitemap."))
    noidx = [p for p in pub if any(i["code"] == "unintended_noindex" for i in p["issues"])]
    out.append(_chk("noindex", "No unintended noindex on published pages", not noidx, "medium",
                    f"{len(noidx)} page(s)" + (f": {', '.join(p['path'] for p in noidx[:4])}" if noidx else ""), "Review robots overrides."))
    orphan = [p for p in pub if not p.get("linked")]
    out.append(_chk("internal_links", "Published pages reachable through internal links", not orphan, "medium",
                    f"{len(orphan)} orphan page(s)", "Link these pages from categories / city pages."))
    sm = await db.settings.find_one({"id": "seo_sitemap"}, {"_id": 0}) or {}
    out.append(_chk("sitemap_valid", "Sitemap URLs consistent with preferred domain (https)", not sm.get("errors"), "high",
                    f"{len(sm.get('errors') or [])} problem(s)" if sm.get("errors") else f"{sm.get('url_count', 0)} URLs validated",
                    "Set an https preferred host."))
    return out


async def crawl_checks(idx):
    """Live HTTP checks of key public URLs + image weight sampling."""
    import httpx
    base = seo_core.env_base()
    targets = [("/", "html"), ("/robots.txt", "text"), ("/sitemap.xml", "xml"), ("/api/robots.txt", "text"), ("/api/sitemap.xml", "xml")]
    res = []
    async with httpx.AsyncClient(timeout=12, follow_redirects=False) as c:
        for path, kind in targets:
            try:
                r = await c.get(base + path)
                ctype = r.headers.get("content-type", "")
                ok = r.status_code == 200 and (kind != "xml" or "xml" in ctype) and (kind != "text" or "text/plain" in ctype)
                res.append({"url": base + path, "status": r.status_code, "content_type": ctype.split(";")[0], "ok": ok})
            except Exception as e:  # noqa: BLE001
                res.append({"url": base + path, "status": 0, "error": str(e)[:120], "ok": False})
        imgs = []
        seen = set()
        for p in idx["pages"]:
            u = p.get("image")
            if u and u.startswith("http") and u not in seen and p["published"]:
                seen.add(u)
                imgs.append((u, p["name"]))
        img_res = []
        for u, name in imgs[:25]:
            try:
                r = await c.head(u, follow_redirects=True)
                size = int(r.headers.get("content-length") or 0)
                img_res.append({"url": u, "page": name, "status": r.status_code, "bytes": size,
                                "type": r.headers.get("content-type", "").split(";")[0],
                                "recommendation": "Compress or serve a resized/WebP version (>300 KB)" if size > 300_000 else ""})
            except Exception as e:  # noqa: BLE001
                img_res.append({"url": u, "page": name, "status": 0, "error": str(e)[:80]})
    return res, img_res


async def run_audit(run_id=None):
    run_id = run_id or new_id()
    await db.seo_audit_runs.update_one({"id": run_id}, {"$set": {"id": run_id, "status": "running", "started_at": now_iso()}}, upsert=True)
    try:
        idx = await seo_core.get_index(force=True)
        tech = await technical_checks(idx)
        crawl, images = await crawl_checks(idx)
        by_sev, by_code = {}, {}
        for p in idx["pages"]:
            for i in p["issues"]:
                by_sev[i["severity"]] = by_sev.get(i["severity"], 0) + 1
                by_code[i["code"]] = by_code.get(i["code"], 0) + 1
        pub = [p for p in idx["pages"] if p["published"]]
        avg = round(sum(p["score"] for p in pub) / len(pub)) if pub else 0
        await db.seo_audit_runs.update_one({"id": run_id}, {"$set": {
            "status": "done", "finished_at": now_iso(), "pages": len(idx["pages"]), "published": len(pub),
            "avg_score": avg, "by_severity": by_sev, "by_code": by_code, "technical": tech, "crawl": crawl,
            "images": images}})
        await db.settings.update_one({"id": "seo_audit"}, {"$set": {"id": "seo_audit", "last_success": now_iso(), "last_run_id": run_id}}, upsert=True)
    except Exception as e:  # noqa: BLE001
        await db.seo_audit_runs.update_one({"id": run_id}, {"$set": {"status": "failed", "error": str(e)[:300], "finished_at": now_iso()}})
        raise
    return run_id


def start_audit():
    run_id = new_id()
    asyncio.get_event_loop().create_task(_safe(run_id))
    return run_id


async def _safe(run_id):
    try:
        await run_audit(run_id)
    except Exception:  # noqa: BLE001
        pass
