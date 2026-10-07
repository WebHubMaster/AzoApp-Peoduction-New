"""Tests for city-level category disable gating (Iter 232).

Verifies that when a category is disabled in a city via db.city_pricing.categories,
all catalog/ratecard/addon endpoints hide that category for that city, while another
city with the category enabled still returns full data.
"""
import os
import subprocess
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
# For in-pod backend tests use localhost to avoid ingress edge caching
BASE_URL = "http://localhost:8001"

CARPENTRY_ID = "eab6dbbb-8af1-457e-a9d9-ce0bf5abc36d"
CARPENTRY_SLUG = "carpentry"
CARPENTRY_SERVICE_ID = "121b87c7-7820-4af1-807c-58b04ae44fd3"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


def _mongo():
    return MongoClient(MONGO_URL)[DB_NAME]


def _restart_backend():
    subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=False,
                   capture_output=True)
    # Wait for backend
    for _ in range(30):
        try:
            r = requests.get(f"{BASE_URL}/api/", timeout=2)
            if r.status_code < 500:
                time.sleep(1)
                return
        except Exception:
            pass
        time.sleep(1)


@pytest.fixture(scope="module")
def disable_carpentry_in_patna():
    """Remove Carpentry from Patna's categories, restart backend; restore after."""
    db = _mongo()
    before = db.city_pricing.find_one({"city_key": "patna"})
    assert before and CARPENTRY_ID in before.get("categories", []), (
        "Precondition failed: Patna should have Carpentry enabled before test"
    )
    db.city_pricing.update_one(
        {"city_key": "patna"},
        {"$pull": {"categories": CARPENTRY_ID}},
    )
    _restart_backend()
    yield
    # Restore
    db.city_pricing.update_one(
        {"city_key": "patna"},
        {"$addToSet": {"categories": CARPENTRY_ID}},
    )
    _restart_backend()
    after = db.city_pricing.find_one({"city_key": "patna"})
    assert CARPENTRY_ID in after.get("categories", []), "Failed to restore Carpentry"


# ---------- Baseline (both cities enabled) ----------

class TestBaselineBothEnabled:
    def test_patna_category_available(self):
        r = requests.get(f"{BASE_URL}/api/catalog/category/{CARPENTRY_SLUG}",
                         headers={"X-City": "Patna"})
        assert r.status_code == 200
        data = r.json()
        assert data.get("city_available") is True
        assert data.get("id") == CARPENTRY_ID

    def test_ranchi_category_available(self):
        r = requests.get(f"{BASE_URL}/api/catalog/category/{CARPENTRY_SLUG}",
                         headers={"X-City": "Ranchi"})
        assert r.status_code == 200
        assert r.json().get("city_available") is True


# ---------- Disabled in Patna, Enabled in Ranchi ----------

@pytest.mark.usefixtures("disable_carpentry_in_patna")
class TestCategoryDisabledInPatna:

    # Patna - gated

    def test_patna_categories_list_excludes_carpentry(self):
        r = requests.get(f"{BASE_URL}/api/catalog/categories",
                         headers={"X-City": "Patna"})
        assert r.status_code == 200
        ids = [c.get("id") for c in r.json()]
        assert CARPENTRY_ID not in ids

    def test_patna_services_by_category_empty(self):
        r = requests.get(f"{BASE_URL}/api/catalog/services",
                         params={"category_id": CARPENTRY_ID},
                         headers={"X-City": "Patna"})
        assert r.status_code == 200
        assert r.json() == []

    def test_patna_ratecard_by_category_null(self):
        r = requests.get(f"{BASE_URL}/api/ratecards/by-category/{CARPENTRY_ID}",
                         headers={"X-City": "Patna"})
        assert r.status_code == 200
        assert r.json() is None

    def test_patna_ratecard_by_service_null(self):
        r = requests.get(f"{BASE_URL}/api/ratecards/by-service/{CARPENTRY_SERVICE_ID}",
                         headers={"X-City": "Patna"})
        assert r.status_code == 200
        assert r.json() is None

    def test_patna_ratecard_search_excludes_carpentry(self):
        r = requests.get(f"{BASE_URL}/api/ratecards/search",
                         params={"q": "carpentry"},
                         headers={"X-City": "Patna"})
        assert r.status_code == 200
        rows = r.json()
        for row in rows:
            assert row.get("category_id") != CARPENTRY_ID, (
                f"Carpentry row leaked in Patna search: {row}"
            )

    def test_patna_addons_by_category_empty(self):
        r = requests.get(f"{BASE_URL}/api/catalog/addons",
                         params={"category_id": CARPENTRY_ID},
                         headers={"X-City": "Patna"})
        assert r.status_code == 200
        assert r.json() == []

    def test_patna_category_slug_city_unavailable(self):
        r = requests.get(f"{BASE_URL}/api/catalog/category/{CARPENTRY_SLUG}",
                         headers={"X-City": "Patna"})
        assert r.status_code == 200
        data = r.json()
        assert data.get("city_available") is False
        assert data.get("city")  # city name present
        assert str(data.get("city")).lower() == "patna"

    def test_patna_service_detail_404(self):
        r = requests.get(f"{BASE_URL}/api/catalog/services/{CARPENTRY_SERVICE_ID}",
                         headers={"X-City": "Patna"})
        assert r.status_code == 404

    # Ranchi - still enabled

    def test_ranchi_categories_list_includes_carpentry(self):
        r = requests.get(f"{BASE_URL}/api/catalog/categories",
                         headers={"X-City": "Ranchi"})
        assert r.status_code == 200
        ids = [c.get("id") for c in r.json()]
        assert CARPENTRY_ID in ids

    def test_ranchi_services_by_category_nonempty(self):
        r = requests.get(f"{BASE_URL}/api/catalog/services",
                         params={"category_id": CARPENTRY_ID},
                         headers={"X-City": "Ranchi"})
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0

    def test_ranchi_ratecard_by_category_present(self):
        r = requests.get(f"{BASE_URL}/api/ratecards/by-category/{CARPENTRY_ID}",
                         headers={"X-City": "Ranchi"})
        assert r.status_code == 200
        data = r.json()
        assert data is not None
        assert data.get("category_id") == CARPENTRY_ID

    def test_ranchi_ratecard_by_service_present(self):
        r = requests.get(f"{BASE_URL}/api/ratecards/by-service/{CARPENTRY_SERVICE_ID}",
                         headers={"X-City": "Ranchi"})
        assert r.status_code == 200
        assert r.json() is not None

    def test_ranchi_ratecard_search_includes_carpentry(self):
        r = requests.get(f"{BASE_URL}/api/ratecards/search",
                         params={"q": "carpentry"},
                         headers={"X-City": "Ranchi"})
        assert r.status_code == 200
        rows = r.json()
        assert any(row.get("category_id") == CARPENTRY_ID for row in rows)

    def test_ranchi_addons_nonempty(self):
        r = requests.get(f"{BASE_URL}/api/catalog/addons",
                         params={"category_id": CARPENTRY_ID},
                         headers={"X-City": "Ranchi"})
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_ranchi_category_available(self):
        r = requests.get(f"{BASE_URL}/api/catalog/category/{CARPENTRY_SLUG}",
                         headers={"X-City": "Ranchi"})
        assert r.status_code == 200
        assert r.json().get("city_available") is True

    def test_ranchi_service_detail_200(self):
        r = requests.get(f"{BASE_URL}/api/catalog/services/{CARPENTRY_SERVICE_ID}",
                         headers={"X-City": "Ranchi"})
        assert r.status_code == 200

    # No-city (legacy) - nothing hidden

    def test_nocity_category_city_available_true(self):
        r = requests.get(f"{BASE_URL}/api/catalog/category/{CARPENTRY_SLUG}")
        assert r.status_code == 200
        assert r.json().get("city_available") is True

    def test_nocity_services_nonempty(self):
        r = requests.get(f"{BASE_URL}/api/catalog/services",
                         params={"category_id": CARPENTRY_ID})
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_nocity_ratecard_present(self):
        r = requests.get(f"{BASE_URL}/api/ratecards/by-category/{CARPENTRY_ID}")
        assert r.status_code == 200
        assert r.json() is not None

    def test_nocity_addons_nonempty(self):
        r = requests.get(f"{BASE_URL}/api/catalog/addons",
                         params={"category_id": CARPENTRY_ID})
        assert r.status_code == 200
        assert len(r.json()) > 0
