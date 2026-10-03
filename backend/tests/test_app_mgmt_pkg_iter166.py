"""
Iter166 regression: after Customer Android package rename to
'app.azoapp.homeservice' (matches Firebase google-services.json), verify:
  - Public /api/app-mgmt/config/customer returns apk_package == 'app.azoapp.homeservice'
  - Public /api/app-mgmt/config/partner  returns apk_package == 'app.azoapp.partner'
  - Admin GET /api/app-mgmt/admin/config returns both platforms
  - Admin PUT /api/app-mgmt/admin/config/customer saves + GET reflects; reset flags after
  - Live Logs ingest + admin logs/summary/health still work
  - Admin OTP login + dashboard/bookings regression
"""
import os
import time
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://services-marketplace-15.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_PHONE = "+919000000000"
OTP = "123456"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_headers(client):
    client.post(f"{API}/auth/send-otp", json={"phone": ADMIN_PHONE}, timeout=15)
    r = client.post(f"{API}/auth/verify-otp",
                    json={"phone": ADMIN_PHONE, "otp": OTP}, timeout=15)
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("token")
    assert tok, "no token"
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------------- App Management: public config ----------------
def test_public_customer_pkg_is_homeservice(client):
    r = client.get(f"{API}/app-mgmt/config/customer", timeout=15)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert data.get("apk_package") == "app.azoapp.homeservice", \
        f"Expected apk_package=app.azoapp.homeservice, got {data.get('apk_package')!r}"


def test_public_partner_pkg_is_partner(client):
    r = client.get(f"{API}/app-mgmt/config/partner", timeout=15)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert data.get("apk_package") == "app.azoapp.partner", \
        f"Expected apk_package=app.azoapp.partner, got {data.get('apk_package')!r}"


# ---------------- App Management: admin GET ----------------
def test_admin_config_requires_auth(client):
    r = client.get(f"{API}/app-mgmt/admin/config", timeout=15)
    assert r.status_code in (401, 403)


def test_admin_get_all_returns_both_platforms(client, admin_headers):
    r = client.get(f"{API}/app-mgmt/admin/config", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert isinstance(data, dict), f"Expected dict, got {type(data)}"
    assert "customer" in data and "partner" in data, f"keys: {list(data.keys())}"
    assert isinstance(data["customer"], dict) and isinstance(data["partner"], dict)


# ---------------- App Management: admin PUT then GET ----------------
def test_admin_put_customer_and_verify_then_reset(client, admin_headers):
    # snapshot current config so we can restore
    snap_r = client.get(f"{API}/app-mgmt/admin/config",
                        headers=admin_headers, timeout=15)
    assert snap_r.status_code == 200
    original = snap_r.json().get("customer", {})

    payload = {
        "latest_version": "1.6.0",
        "version_code": 16,
        "update_enabled": True,
        "force_update": False,
        "maintenance_enabled": False,
    }
    r = client.put(f"{API}/app-mgmt/admin/config/customer",
                   headers=admin_headers, json=payload, timeout=20)
    assert r.status_code == 200, r.text[:300]
    saved = r.json()
    assert saved.get("latest_version") == "1.6.0"
    assert int(saved.get("version_code")) == 16
    assert saved.get("update_enabled") is True

    # GET public config should reflect
    pub = client.get(f"{API}/app-mgmt/config/customer", timeout=15).json()
    assert pub.get("latest_version") == "1.6.0"
    assert int(pub.get("version_code")) == 16
    assert pub.get("update_enabled") is True
    # package must still be homeservice
    assert pub.get("apk_package") == "app.azoapp.homeservice"

    # RESET: disable update/force/maintenance so preview app not blocked.
    reset_payload = {
        "update_enabled": False,
        "force_update": False,
        "maintenance_enabled": False,
    }
    # also restore original latest_version/version_code if they were set
    if original.get("latest_version"):
        reset_payload["latest_version"] = original.get("latest_version")
    if original.get("version_code") is not None:
        reset_payload["version_code"] = int(original.get("version_code") or 0)
    rr = client.put(f"{API}/app-mgmt/admin/config/customer",
                    headers=admin_headers, json=reset_payload, timeout=20)
    assert rr.status_code == 200, rr.text[:300]
    after = rr.json()
    assert after.get("update_enabled") is False
    assert after.get("force_update") is False
    assert after.get("maintenance_enabled") is False


# ---------------- Live Logs ----------------
def test_logs_client_ingest_public(client):
    payload = {
        "level": "info",
        "message": "TEST_iter166 client log",
        "source": "test",
        "meta": {"scope": "iter166"},
    }
    r = client.post(f"{API}/logs/client", json=payload, timeout=15)
    assert r.status_code in (200, 201, 202, 204), r.text[:200]


def test_admin_logs_list(client, admin_headers):
    time.sleep(1.0)
    r = client.get(f"{API}/admin/logs?limit=10", headers=admin_headers, timeout=20)
    assert r.status_code == 200, r.text[:300]
    assert isinstance(r.json(), (dict, list))


def test_admin_logs_summary(client, admin_headers):
    r = client.get(f"{API}/admin/logs/summary", headers=admin_headers, timeout=20)
    assert r.status_code == 200, r.text[:300]


def test_admin_logs_health(client, admin_headers):
    r = client.get(f"{API}/admin/logs/health", headers=admin_headers, timeout=20)
    assert r.status_code == 200, r.text[:300]
    assert isinstance(r.json(), dict)


# ---------------- Core admin regression ----------------
def test_admin_dashboard_or_bookings(client, admin_headers):
    tried = []
    for path in ["/admin/dashboard", "/admin/bookings", "/admin/stats", "/bookings"]:
        r = client.get(f"{API}{path}", headers=admin_headers, timeout=20)
        tried.append((path, r.status_code))
        if r.status_code == 200:
            return
    pytest.fail(f"No core admin endpoint returned 200: {tried}")
