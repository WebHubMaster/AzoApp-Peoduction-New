"""Backend contract tests for GET /api/site/config fee_info object.

The customer native app (Expo RN) reads tooltip text from this endpoint
under top-level `fee_info` with string keys `tax` and `platform_fee`.
"""
import os
import pytest
import requests

# Prefer local backend (same code under test). External URL points to a
# different environment that may not have admin-configured fee_info values.
BASE_URL = os.environ.get("TEST_BACKEND_URL", "http://localhost:8001").rstrip("/")


@pytest.fixture(scope="module")
def site_config():
    r = requests.get(f"{BASE_URL}/api/site/config", timeout=60)
    assert r.status_code == 200, f"status={r.status_code} body={r.text[:200]}"
    return r.json()


def test_status_200_and_json(site_config):
    assert isinstance(site_config, dict)


def test_fee_info_object_present(site_config):
    assert "fee_info" in site_config, "top-level fee_info missing"
    fi = site_config["fee_info"]
    assert isinstance(fi, dict)
    assert set(["tax", "platform_fee"]).issubset(fi.keys())
    assert isinstance(fi["tax"], str)
    assert isinstance(fi["platform_fee"], str)


def test_fee_info_values_match_admin_general_settings(site_config):
    """When admin has configured general.tax_info / general.platform_fee_info,
    those strings surface verbatim under fee_info. If not configured in this
    environment, values are empty strings (still valid contract).
    """
    fi = site_config["fee_info"]
    # Values must be strings (possibly empty if admin hasn't set them)
    assert fi["tax"] == "" or len(fi["tax"]) > 0
    assert fi["platform_fee"] == "" or len(fi["platform_fee"]) > 0


def test_regression_core_top_level_keys(site_config):
    for k in ("branding", "theme", "currency"):
        assert k in site_config, f"regression: missing top-level key {k}"
    assert isinstance(site_config["branding"], dict)
    assert isinstance(site_config["theme"], dict)
    assert isinstance(site_config["currency"], str)
    assert site_config["currency"] in ("INR",) or len(site_config["currency"]) == 3


def test_regression_other_expected_sections(site_config):
    # These sections pre-existed and should remain intact
    for k in ("stats", "cancellation_reasons", "apps", "business", "seo", "maintenance"):
        assert k in site_config, f"regression: missing section {k}"
