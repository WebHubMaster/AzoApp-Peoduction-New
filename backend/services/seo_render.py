"""Server-rendered <head> + crawlable fallback body for public SPA routes, so search
engines and social scrapers get the final title/description/canonical/JSON-LD and
correct HTTP status without executing JavaScript. Same content users see (no cloaking)."""
import html

from services import seo_core as core

_KNOWN = {"/", "/services", "/membership", "/blog", "/about", "/contact", "/privacy", "/terms", "/refund", "/payment/return"}


def _e(v):
    return html.escape(str(v or ""), quote=True)


def _norm(path):
    path = (path or "/").split("?")[0].split("#")[0] or "/"
    return path.rstrip("/") if len(path) > 1 else path


def _links(p, idx):
    pages, t = idx["pages"], p["type"]
    pick = []
    if t == "static" and p["entity_id"] in ("home", "services"):
        pick = [x for x in pages if x["type"] in ("category", "city") and x["indexable"]]
    elif t in ("category", "subcategory"):
        pick = [x for x in pages if x["type"] == "service" and x.get("category_id") == p.get("category_id") and x["indexable"]]
    elif t == "service":
        pick = [x for x in pages if (x["type"] == "category" and x["entity_id"] == p.get("category_id")) or
                (x["type"] == "city" and x["name"] in (p.get("served_cities") or [])) or
                (x["type"] == "city_service" and x.get("service_id") == p["entity_id"])]
        pick = [x for x in pick if x["indexable"]]
    elif t == "city":
        pick = [x for x in pages if x["indexable"] and ((x["type"] == "city_service" and x.get("city_slug") == p["entity_id"]) or
                                                         (x["type"] == "service" and p["name"] in (x.get("served_cities") or [])))]
    elif t == "city_service":
        pick = [x for x in pages if x["indexable"] and (x["key"] in (f"city:{p.get('city_slug')}", f"service:{p.get('service_id')}"))]
    elif t == "static" and p["entity_id"] == "blog":
        pick = [x for x in pages if x["type"] == "blog" and x["indexable"]]
    return [(x["name"], x["path"]) for x in pick][:60]


async def render(path):
    idx = await core.get_index()
    path = _norm(path)
    g, tech, base = idx["global"], idx["tech"], idx["base"]
    site = g.get("org_name") or g["_site_name"]
    for r in idx["redirects"]:
        if r.get("from_path") == path and str(r.get("to_path", "")).startswith("/"):
            return {"status": int(r.get("type") or 301) if str(r.get("type")) in ("301", "302", "307", "308") else 301,
                    "location": r["to_path"]}
    p = idx["by_path"].get(path)
    private = core.is_private_path(path, tech) or path.startswith("/admin/")
    status, robots = 200, "noindex,nofollow" if private else (g.get("robots_default") or "index,follow")
    if p and p["published"]:
        r = p["resolved"]
        robots = r["robots"] if p["indexable"] or "noindex" in r["robots"] else "noindex,follow"
        title, desc, canon = r["full_title"], r["description"], r["canonical"]
        og_t, og_d = r["og_title"], r["og_description"]
        img = core.abs_url(base, r["og_image"]) if r["og_image"] else f"{base}/api/site/og-image"
        blocks = core.build_schema(p, idx)
        h1 = p["name"] if p["type"] != "static" or p["entity_id"] != "home" else title
        links = _links(p, idx)
    else:
        if not private and path not in _KNOWN:
            status, robots = 404, "noindex,follow"
        title = site if status == 200 else f"Page not found | {site}"
        desc, canon, og_t, og_d = g.get("meta_description") or "", core.abs_url(base, path), title, g.get("meta_description") or ""
        img, blocks, h1, links = f"{base}/api/site/og-image", [], title, []
    tw = g.get("twitter")
    tags = [
        f"<title>{_e(title)}</title>",
        f'<meta data-ssr-seo="true" name="description" content="{_e(desc)}" />' if desc else "",
        f'<meta data-ssr-seo="true" name="robots" content="{_e(robots)}" />',
        "" if private or status != 200 else f'<link data-ssr-seo="true" rel="canonical" href="{_e(canon)}" />',
        f'<meta data-ssr-seo="true" property="og:type" content="website" />',
        f'<meta data-ssr-seo="true" property="og:site_name" content="{_e(site)}" />',
        f'<meta data-ssr-seo="true" property="og:title" content="{_e(og_t)}" />',
        f'<meta data-ssr-seo="true" property="og:description" content="{_e(og_d)}" />' if og_d else "",
        f'<meta data-ssr-seo="true" property="og:url" content="{_e(canon)}" />',
        f'<meta data-ssr-seo="true" property="og:locale" content="{_e(g.get("locale") or "en_IN")}" />',
        f'<meta data-ssr-seo="true" property="og:image" content="{_e(img)}" />',
        f'<meta data-ssr-seo="true" name="twitter:card" content="{_e(g.get("twitter_card") or "summary_large_image")}" />',
        f'<meta data-ssr-seo="true" name="twitter:title" content="{_e(og_t)}" />',
        f'<meta data-ssr-seo="true" name="twitter:description" content="{_e(og_d)}" />' if og_d else "",
        f'<meta data-ssr-seo="true" name="twitter:image" content="{_e(img)}" />',
        f'<meta data-ssr-seo="true" name="twitter:site" content="{_e(tw)}" />' if tw else "",
    ] + [f'<script data-ssr-seo="true" type="application/ld+json">{core.jsonld_safe(b)}</script>' for b in blocks]
    body = ('<style>[data-seo-fallback]{font-family:system-ui,sans-serif;max-width:960px;margin:48px auto;padding:0 16px;color:#334155}'
            '[data-seo-fallback] a{color:#0D47A1}</style>'
            f'<main data-seo-fallback="true"><h1>{_e(h1)}</h1>' + (f"<p>{_e(desc)}</p>" if desc else "")
            + ("<nav><ul>" + "".join(f'<li><a href="{_e(u)}">{_e(n)}</a></li>' for n, u in links) + "</ul></nav>" if links else "")
            + f'<p><a href="/">{_e(site)}</a> · <a href="/services">All services</a></p></main>')
    return {"status": status, "head": "\n".join(t for t in tags if t), "body": body,
            "lang": g.get("language") or "en"}
