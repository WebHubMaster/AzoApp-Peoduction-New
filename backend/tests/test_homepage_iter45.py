"""Backend tests for premium homepage redesign (iter45).
Covers /api/site/homepage (with/without ?city=), /api/site/config stats,
/api/site/promotions shape.
"""
import os
import requests
import pytest

def _load_frontend_env():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for line in open(p):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.strip().split("=", 1)[1]
    return os.environ.get("REACT_APP_BACKEND_URL", "")

BASE = _load_frontend_env().rstrip("/")


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    ses.headers.update({"Content-Type": "application/json"})
    return ses


def _get(s, path, **params):
    r = s.get(f"{BASE}/api{path}", params=params or None, timeout=30)
    return r


class TestSiteConfig:
    def test_config_stats_keys(self, s):
        r = _get(s, "/site/config")
        assert r.status_code == 200
        stats = (r.json() or {}).get("stats", {})
        for k in ["jobs_done", "partners", "verified_partners", "merchants",
                  "customers", "reviews", "rating", "cities"]:
            assert k in stats, f"missing {k}"


class TestHomepage:
    def test_homepage_no_city(self, s):
        r = _get(s, "/site/homepage")
        assert r.status_code == 200
        secs = r.json()
        assert isinstance(secs, list) and len(secs) > 0
        types = [x.get("type") for x in secs]
        # popular_categories with service_count int
        cat_sec = next((x for x in secs if x.get("type") in ("popular_categories", "featured_categories", "category_slider")), None)
        assert cat_sec is not None, f"no categories section, types={types}"
        for it in (cat_sec.get("data") or []):
            assert "service_count" in it and isinstance(it["service_count"], int)
        # trending_services config booleans
        tr = next((x for x in secs if x.get("type") == "trending_services"), None)
        if tr:
            cfg = tr.get("config") or {}
            assert isinstance(cfg.get("demand_based"), bool)
            assert isinstance(cfg.get("city_based"), bool)
            for it in (tr.get("data") or []):
                assert "booking_count" in it
        # hero_banner date-filtered items are all active
        hb = next((x for x in secs if x.get("type") == "hero_banner"), None)
        if hb:
            assert isinstance(hb.get("data"), list)

    def test_homepage_with_city_patna(self, s):
        r = _get(s, "/site/homepage", city="Patna")
        assert r.status_code == 200
        secs = r.json()
        tr = next((x for x in secs if x.get("type") == "trending_services"), None)
        if tr and (tr.get("data") or []):
            for it in tr["data"]:
                assert "local_booking_count" in it, "trending items should include local_booking_count when city passed"
            if tr.get("config", {}).get("city_based"):
                counts = [it.get("local_booking_count", 0) for it in tr["data"]]
                assert counts == sorted(counts, reverse=True), "should be sorted desc by local_booking_count"


class TestPromotions:
    def test_promotions_shape(self, s):
        r = _get(s, "/site/promotions")
        assert r.status_code == 200
        d = r.json() or {}
        assert "coupons" in d
        assert "offers" in d
        assert "membership" in d
