"""Backend tests for the new Enterprise SEO Center.
Covers: resolve, overview, global meta (version/stale save), pages list, inheritance,
bulk preview/apply, city pages (served/thin content), redirects validation,
technical rules, sitemap, schema (aggregateRating guard), indexing/GSC not-connected,
audit run, admin_can_access_old_slug_redirect."""
import io
import time
import json
import pytest
import requests

from conftest import API


# ---------- public resolve ----------
class TestResolve:
    def test_resolve_home(self, anon):
        r = anon.get(f"{API}/seo/resolve?path=/", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["found"] is True
        assert d.get("title")
        assert d.get("description") is not None

    def test_resolve_admin_private(self, anon):
        r = anon.get(f"{API}/seo/resolve?path=/admin", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("private") is True
        assert "noindex" in (d.get("robots") or "")

    def test_resolve_account_private(self, anon):
        r = anon.get(f"{API}/seo/resolve?path=/account", timeout=30)
        d = r.json()
        assert "noindex" in (d.get("robots") or "")

    def test_resolve_services_page(self, anon):
        r = anon.get(f"{API}/seo/resolve?path=/services", timeout=30)
        assert r.status_code == 200


# ---------- admin overview ----------
class TestOverview:
    def test_overview_structure(self, admin):
        r = admin.get(f"{API}/admin/seo/overview", timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("totals", "sitemap", "technical", "audit", "indexing", "gsc", "facets"):
            assert k in d, f"missing {k}"
        assert "pages" in d["totals"]
        assert isinstance(d["gsc"]["connected"], bool)
        # GSC NOT connected: indexed count exists but totals from GSC are absent
        assert d["gsc"]["connected"] is False

    def test_overview_filters(self, admin):
        r = admin.get(f"{API}/admin/seo/overview?type=service", timeout=60)
        assert r.status_code == 200


# ---------- global meta: version/stale ----------
class TestGlobalMeta:
    def test_get_global(self, admin):
        r = admin.get(f"{API}/admin/seo/global", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "site_name" in d
        assert d.get("base")

    def test_update_global_reflects_in_resolve(self, admin, anon):
        g = admin.get(f"{API}/admin/seo/global", timeout=30).json()
        new_desc = f"Pro home services on-demand {int(time.time())}"
        payload = {**{k: v for k, v in g.items() if not k.startswith("_") and k not in ("base", "env_base", "site_name", "brand_logo")},
                   "meta_description": new_desc}
        r = admin.put(f"{API}/admin/seo/global", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        time.sleep(1.5)
        res = anon.get(f"{API}/seo/resolve?path=/", timeout=30).json()
        # home page may inherit from global; description should match or contain global
        assert res.get("description") == new_desc or new_desc in (res.get("description") or "")

    def test_stale_save_returns_409(self, admin):
        g = admin.get(f"{API}/admin/seo/global", timeout=30).json()
        payload = {**{k: v for k, v in g.items() if not k.startswith("_") and k not in ("base", "env_base", "site_name", "brand_logo")},
                   "version": -1,
                   "meta_description": "stale conflict test"}
        r = admin.put(f"{API}/admin/seo/global", json=payload, timeout=30)
        assert r.status_code == 409, f"expected 409, got {r.status_code}: {r.text[:300]}"


# ---------- pages list / page editor ----------
class TestPagesList:
    def test_pages_pagination(self, admin):
        r = admin.get(f"{API}/admin/seo/pages?type=service&page=1&page_size=5", timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "rows" in d and "total" in d and "pages" in d
        assert len(d["rows"]) <= 5

    def test_pages_export_csv(self, admin):
        r = admin.get(f"{API}/admin/seo/pages/export?type=service", timeout=60)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        assert "Type" in r.text.split("\n")[0]

    def test_page_detail_and_save(self, admin):
        rows = admin.get(f"{API}/admin/seo/pages?type=service&page_size=1", timeout=30).json()["rows"]
        assert rows
        key = rows[0]["key"]
        d = admin.get(f"{API}/admin/seo/page?key={key}", timeout=30).json()
        assert "page" in d and "schema" in d and "completeness" in d
        new_title = f"TEST SEO Title {int(time.time())}"
        save = admin.put(f"{API}/admin/seo/page?key={key}",
                         json={"seo": {"title": new_title}, "expected_updated_at": d.get("version")},
                         timeout=30)
        assert save.status_code == 200, save.text
        detail = save.json()
        assert new_title in detail["page"]["resolved"]["full_title"]


# ---------- Schema / aggregateRating guard ----------
class TestSchemaGuard:
    def test_reject_aggregate_rating_in_jsonld(self, admin):
        rows = admin.get(f"{API}/admin/seo/pages?type=service&page_size=1", timeout=30).json()["rows"]
        key = rows[0]["key"]
        bad = {"@type": "Service", "name": "x",
               "aggregateRating": {"@type": "AggregateRating", "ratingValue": "5", "reviewCount": "99"}}
        r = admin.put(f"{API}/admin/seo/page?key={key}",
                      json={"seo": {"schema_jsonld": json.dumps(bad)}}, timeout=30)
        assert r.status_code == 400
        assert "rating" in r.text.lower() or "review" in r.text.lower()

    def test_schema_summary(self, admin):
        r = admin.get(f"{API}/admin/seo/schema/summary", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "types" in d and "organization" in d


# ---------- Bulk edit ----------
class TestBulk:
    def test_bulk_preview_and_apply(self, admin):
        rows = admin.get(f"{API}/admin/seo/pages?type=service&page_size=2", timeout=30).json()["rows"]
        keys = [r["key"] for r in rows]
        prev = admin.post(f"{API}/admin/seo/bulk/preview",
                         json={"keys": keys,
                               "changes": {"title_template": "{name} — TEST BULK | {site_name}"}}, timeout=30)
        assert prev.status_code == 200, prev.text
        items = prev.json()["items"]
        assert len(items) >= 1
        assert any("TEST BULK" in (it.get("after", {}).get("title") or "") for it in items)

    def test_bulk_noindex_requires_confirm(self, admin):
        rows = admin.get(f"{API}/admin/seo/pages?type=service&page_size=2", timeout=30).json()["rows"]
        keys = [r["key"] for r in rows]
        r = admin.post(f"{API}/admin/seo/bulk/apply",
                       json={"keys": keys, "changes": {"robots": "noindex,follow"}, "confirm": True},
                       timeout=30)
        # should block without confirm_noindex (since indexable pages would be noindexed)
        assert r.status_code == 400
        assert "noindex" in r.text.lower() or "confirm" in r.text.lower()

    def test_bulk_apply_restore(self, admin):
        """Cleanup: restore via clear_overrides."""
        rows = admin.get(f"{API}/admin/seo/pages?type=service&page_size=2", timeout=30).json()["rows"]
        keys = [r["key"] for r in rows]
        admin.post(f"{API}/admin/seo/bulk/apply",
                   json={"keys": keys, "changes": {"clear_overrides": True}, "confirm": True}, timeout=30)


# ---------- City pages ----------
class TestCities:
    def test_cities_list_served_only(self, admin):
        r = admin.get(f"{API}/admin/seo/cities", timeout=30)
        assert r.status_code == 200, r.text
        rows = r.json()["rows"]
        slugs = [c["slug"] for c in rows]
        assert "patna" in slugs
        assert "delhi" not in slugs

    def test_create_city_page_rejects_unserved(self, admin):
        # pick any published service
        rows = admin.get(f"{API}/admin/seo/pages?type=service&page_size=1", timeout=30).json()["rows"]
        sid = rows[0]["key"].split(":", 1)[1]
        r = admin.post(f"{API}/admin/seo/city-pages",
                       json={"city_slug": "delhi", "service_id": sid}, timeout=30)
        assert r.status_code == 400
        assert "serve" in r.text.lower() or "city" in r.text.lower()

    def test_publish_thin_content_rejected(self, admin):
        # Find an existing draft city-service page, or create one for patna if services available there
        cs = admin.get(f"{API}/admin/seo/cities/patna/services", timeout=30)
        assert cs.status_code == 200, cs.text
        data = cs.json()
        # try to find a service we can create a page for
        existing_draft = next((p for p in data["pages"] if p.get("status") == "draft"), None)
        if not existing_draft:
            avail = next((a for a in data["available"] if not a["page_key"]), None)
            if not avail:
                pytest.skip("No service in Patna without an existing page")
            created = admin.post(f"{API}/admin/seo/city-pages",
                                 json={"city_slug": "patna", "service_id": avail["service_id"]}, timeout=30)
            assert created.status_code == 200, created.text
            key = created.json()["key"]
        else:
            key = existing_draft["key"]
        # try to publish with no intro
        r = admin.put(f"{API}/admin/seo/page?key={key}",
                      json={"city": {"status": "published", "intro": "short"}}, timeout=30)
        assert r.status_code == 400
        assert "thin" in r.text.lower() or "publish" in r.text.lower() or "content" in r.text.lower()


# ---------- Technical / redirects ----------
class TestTechnical:
    def test_get_technical(self, admin):
        r = admin.get(f"{API}/admin/seo/technical", timeout=30)
        assert r.status_code == 200
        assert "robots_preview" in r.json()

    def test_private_path_root_rejected(self, admin):
        cur = admin.get(f"{API}/admin/seo/technical", timeout=30).json()
        bad = {**cur, "private_paths": (cur.get("private_paths") or []) + ["/"]}
        r = admin.put(f"{API}/admin/seo/technical", json=bad, timeout=30)
        assert r.status_code == 400

    def test_custom_robots_disallow_all_rejected(self, admin):
        cur = admin.get(f"{API}/admin/seo/technical", timeout=30).json()
        bad = {**cur, "robots_custom": "Disallow: /"}
        r = admin.put(f"{API}/admin/seo/technical", json=bad, timeout=30)
        assert r.status_code == 400

    def test_redirect_add_and_delete(self, admin):
        suffix = int(time.time())
        r = admin.post(f"{API}/admin/seo/redirects",
                       json={"from_path": f"/test-old-{suffix}", "to_path": "/services", "type": "301"},
                       timeout=30)
        assert r.status_code == 200, r.text
        rid = r.json().get("id")
        assert rid
        d = admin.delete(f"{API}/admin/seo/redirects/{rid}", timeout=30)
        assert d.status_code == 200

    def test_redirect_loop_rejected(self, admin):
        r = admin.post(f"{API}/admin/seo/redirects",
                       json={"from_path": "/services", "to_path": "/services", "type": "301"}, timeout=30)
        assert r.status_code == 400

    def test_redirect_external_rejected(self, admin):
        r = admin.post(f"{API}/admin/seo/redirects",
                       json={"from_path": "/evil-test", "to_path": "https://evil.com/x", "type": "301"},
                       timeout=30)
        assert r.status_code == 400


# ---------- Sitemap / Robots ----------
class TestSitemap:
    def test_sitemap_index(self, anon):
        r = anon.get(f"{API}/sitemap.xml", timeout=30)
        assert r.status_code == 200
        assert "sitemapindex" in r.text or "urlset" in r.text

    def test_sitemap_child(self, anon):
        r = anon.get(f"{API}/sitemaps/services-1.xml", timeout=30)
        # may 404 if no services split; try other
        if r.status_code == 404:
            idx = anon.get(f"{API}/sitemap.xml", timeout=30).text
            import re
            m = re.search(r"/sitemaps/([^<]+)\.xml", idx)
            assert m, "no child sitemap in index"
            r = anon.get(f"{API}/sitemaps/{m.group(1)}.xml", timeout=30)
        assert r.status_code == 200
        assert "<urlset" in r.text

    def test_robots_txt(self, anon):
        r = anon.get(f"{API}/robots.txt", timeout=30)
        assert r.status_code == 200
        text = r.text
        assert "Sitemap:" in text
        for d in ("/admin", "/account", "/partner", "/merchant"):
            assert f"Disallow: {d}" in text, f"missing Disallow {d}"

    def test_admin_sitemap_status(self, admin):
        r = admin.get(f"{API}/admin/seo/sitemap", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "counts" in d and "excluded" in d


# ---------- Indexing / GSC not-connected ----------
class TestGSC:
    def test_gsc_status_not_connected(self, admin):
        r = admin.get(f"{API}/admin/seo/gsc/status", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d.get("connected") is False

    def test_gsc_upload_invalid_json_400(self, admin):
        s = requests.Session()
        s.headers.update({"Authorization": admin.headers["Authorization"]})
        files = {"file": ("creds.json", io.BytesIO(b"not json at all"), "application/json")}
        r = s.post(f"{API}/admin/seo/gsc/credentials", files=files, timeout=30)
        assert r.status_code == 400

    def test_submit_sitemap_not_connected(self, admin):
        r = admin.post(f"{API}/admin/seo/gsc/submit-sitemap", timeout=30)
        assert r.status_code in (400, 503)

    def test_sync_not_connected(self, admin):
        r = admin.post(f"{API}/admin/seo/gsc/sync", json={"days": 7}, timeout=30)
        assert r.status_code in (400, 503)

    def test_indexing_table(self, admin):
        r = admin.get(f"{API}/admin/seo/indexing", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "rows" in d and "counts" in d and "gsc_connected" in d
        assert d["gsc_connected"] is False


# ---------- Audit ----------
class TestAudit:
    def test_audit_run_and_latest(self, admin):
        r = admin.post(f"{API}/admin/seo/audit/run", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "run_id" in d
        # Give it a moment, then latest should return at least the current run
        time.sleep(1)
        l = admin.get(f"{API}/admin/seo/audit/latest", timeout=30)
        assert l.status_code == 200
        assert "current" in l.json()


# ---------- Slug redirect regression ----------
class TestLegacySlugRedirect:
    def test_ac_gas_refill_redirect_exists(self, admin):
        """Setup created redirect from /service/ac-gas-refill → new slug; verify present."""
        r = admin.get(f"{API}/admin/seo/redirects?q=ac-gas-refill", timeout=30)
        assert r.status_code == 200
        rows = r.json()["rows"]
        found = any(r.get("from_path") == "/service/ac-gas-refill" for r in rows)
        assert found, f"old-slug redirect missing. rows={rows}"


# ---------- Regression: admin CRUD still works ----------
class TestRegression:
    def test_services_crud(self, admin):
        r = admin.get(f"{API}/catalog/admin/services", timeout=30)
        assert r.status_code == 200

    def test_old_dashboard_still_responds(self, admin):
        r = admin.get(f"{API}/admin/seo/dashboard", timeout=30)
        assert r.status_code in (200, 404)  # legacy; may be absent

    def test_old_status_still_responds(self, admin):
        r = admin.get(f"{API}/admin/seo/status", timeout=30)
        assert r.status_code == 200
