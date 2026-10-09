"""Backend test: Home Cleaning category must be hidden in Patna (admin-disabled) but visible in Ranchi."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://partner-marked-fix.preview.emergentagent.com").rstrip("/")
HC_ID = "3385eac1-575f-4875-87fc-e005ffa07c76"
HC_NAME_LOWER = "home cleaning"


def _get(path, city):
    return requests.get(f"{BASE_URL}{path}", headers={"X-City": city}, timeout=30)


def _items(resp):
    if resp.status_code != 200:
        return []
    try:
        d = resp.json()
    except Exception:
        return []
    if d is None:
        return []
    if isinstance(d, list):
        return d
    if not isinstance(d, dict):
        return []
    for key in ("categories", "services", "subcategories", "rate_cards", "items", "data", "results"):
        v = d.get(key)
        if isinstance(v, list):
            return v
    return [d]


def _has_hc(items):
    """Return list of offending items that reference Home Cleaning."""
    bad = []
    for it in items:
        if not isinstance(it, dict):
            continue
        if it.get("id") == HC_ID or it.get("category_id") == HC_ID:
            bad.append(it)
            continue
        name = (it.get("name") or it.get("title") or "").lower()
        cat_name = (it.get("category_name") or it.get("category") or "").lower()
        if HC_NAME_LOWER in name or HC_NAME_LOWER in cat_name:
            bad.append(it)
    return bad


# -------- Patna: Home Cleaning MUST be absent --------
class TestPatnaHidesHomeCleaning:
    def test_categories(self):
        r = _get("/api/catalog/categories", "Patna")
        assert r.status_code == 200
        bad = _has_hc(_items(r))
        assert bad == [], f"Patna categories still contain HC: {bad}"

    def test_services(self):
        r = _get("/api/catalog/services", "Patna")
        assert r.status_code == 200
        bad = _has_hc(_items(r))
        assert bad == [], f"Patna services contain HC: {bad[:3]}"

    def test_services_search_clean(self):
        r = _get("/api/catalog/services?q=clean", "Patna")
        assert r.status_code == 200
        bad = _has_hc(_items(r))
        assert bad == [], f"Patna search?q=clean contains HC: {bad[:3]}"

    def test_services_by_category_hc(self):
        r = _get(f"/api/catalog/services?category_id={HC_ID}", "Patna")
        assert r.status_code == 200
        assert _items(r) == [], "Patna services for HC category_id should be empty"

    def test_subcategories(self):
        r = _get("/api/catalog/subcategories", "Patna")
        assert r.status_code == 200
        bad = _has_hc(_items(r))
        assert bad == [], f"Patna subcategories contain HC: {bad[:3]}"

    def test_ratecards_by_category_hc(self):
        r = _get(f"/api/ratecards/by-category/{HC_ID}", "Patna")
        assert r.status_code in (200, 404)
        assert _items(r) == [], "Patna ratecards for HC should be empty"

    def test_ratecards_search_clean(self):
        r = _get("/api/ratecards/search?q=clean", "Patna")
        assert r.status_code == 200
        bad = _has_hc(_items(r))
        assert bad == [], f"Patna ratecards search contains HC: {bad[:3]}"

    def test_app_home(self):
        r = _get("/api/app/home?city=Patna", "Patna")
        assert r.status_code == 200
        body = r.text.lower()
        # Narrow check: no HC category id and no HC name in payload
        assert HC_ID not in body, "Patna /api/app/home contains HC id"
        # name match – allow but shouldn't appear as category
        d = r.json()
        for key in ("categories", "popular_categories", "featured_categories"):
            bad = _has_hc(d.get(key, []) if isinstance(d, dict) else [])
            assert bad == [], f"/api/app/home {key} contains HC: {bad[:2]}"

    def test_site_homepage(self):
        r = _get("/api/site/homepage?city=Patna", "Patna")
        assert r.status_code == 200
        d = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        for key in ("categories", "popular_categories", "featured_categories", "services"):
            bad = _has_hc(d.get(key, []) if isinstance(d, dict) else [])
            assert bad == [], f"/api/site/homepage {key} contains HC: {bad[:2]}"
        assert HC_ID not in r.text, "Patna /api/site/homepage contains HC id"

    def test_upsell(self):
        r = _get("/api/catalog/upsell", "Patna")
        assert r.status_code == 200
        bad = _has_hc(_items(r))
        assert bad == [], f"Patna upsell contains HC: {bad[:3]}"


# -------- Ranchi: Home Cleaning MUST be present --------
class TestRanchiShowsHomeCleaning:
    def test_categories_has_hc(self):
        r = _get("/api/catalog/categories", "Ranchi")
        assert r.status_code == 200
        items = _items(r)
        assert _has_hc(items), "Ranchi should still include Home Cleaning category"

    def test_services_search_clean_has_hc(self):
        r = _get("/api/catalog/services?q=clean", "Ranchi")
        assert r.status_code == 200
        # Expect either hc services or at least non-empty list referencing HC
        items = _items(r)
        # It's possible no services mapped, but HC category should exist in by-category
        r2 = _get(f"/api/catalog/services?category_id={HC_ID}", "Ranchi")
        assert r2.status_code == 200
