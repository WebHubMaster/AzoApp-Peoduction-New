"""
Iter165: Verify backend still healthy after removal of emergentintegrations==0.2.1
from backend/requirements.txt (it is now installed only via Dockerfile extra-index).

Covers:
  - Backend boots / basic ping.
  - emergentintegrations still importable (installed via extra index in Dockerfile).
  - AI/LLM route /api/ai/chat responds (no ImportError 500).
  - App Management public + admin endpoints.
  - Live Logs ingest + admin endpoints.
  - Core regression: OTP admin login + dashboard/bookings.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://partner-work-queue.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_PHONE = "+919000000000"
OTP = "123456"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(client):
    client.post(f"{API}/auth/send-otp", json={"phone": ADMIN_PHONE}, timeout=15)
    r = client.post(f"{API}/auth/verify-otp", json={"phone": ADMIN_PHONE, "otp": OTP}, timeout=15)
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("token")
    assert tok, "No token in verify-otp response"
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------------- Boot / import ----------------
def test_emergentintegrations_still_importable():
    import emergentintegrations  # noqa: F401


def test_backend_reachable(client):
    # Try a couple of well-known endpoints; at least one must respond <500
    codes = []
    for path in ["/health", "/config/public", "/geo/states", "/auth/send-otp"]:
        try:
            r = client.get(f"{API}{path}", timeout=10)
            codes.append((path, r.status_code))
        except Exception as e:
            codes.append((path, str(e)))
    # At least one should be < 500
    ok = [c for c in codes if isinstance(c[1], int) and c[1] < 500]
    assert ok, f"No reachable endpoint: {codes}"


# ---------------- AI / LLM ----------------
def test_ai_chat_no_import_error(client, admin_headers):
    r = client.post(f"{API}/ai/chat",
                    json={"message": "Say hello in 3 words."},
                    headers=admin_headers, timeout=60)
    # We only need to prove the dependency is available (no 500 due to missing dep).
    # LLM may still legitimately return 200 or a controlled error (400/402/503/etc.)
    assert r.status_code != 500, f"AI chat 500 (possible missing dep): {r.text[:400]}"


# ---------------- App Management ----------------
def test_app_mgmt_public_customer(client):
    r = client.get(f"{API}/app-mgmt/config/customer", timeout=15)
    assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"
    data = r.json()
    assert isinstance(data, dict)


def test_app_mgmt_public_partner(client):
    r = client.get(f"{API}/app-mgmt/config/partner", timeout=15)
    assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"
    assert isinstance(r.json(), dict)


def test_app_mgmt_public_invalid_platform(client):
    r = client.get(f"{API}/app-mgmt/config/not-a-platform", timeout=15)
    assert r.status_code in (400, 404, 422)


def test_app_mgmt_admin_config_requires_auth(client):
    r = client.get(f"{API}/app-mgmt/admin/config", timeout=15)
    assert r.status_code in (401, 403)


def test_app_mgmt_admin_config_with_auth(client, admin_headers):
    r = client.get(f"{API}/app-mgmt/admin/config", headers=admin_headers, timeout=15)
    assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"
    data = r.json()
    assert isinstance(data, (dict, list))


# ---------------- Logs ----------------
def test_logs_client_ingest_public(client):
    payload = {
        "level": "info",
        "message": "TEST_iter165 client log",
        "source": "test",
        "meta": {"scope": "iter165"},
    }
    r = client.post(f"{API}/logs/client", json=payload, timeout=15)
    assert r.status_code in (200, 201, 202, 204), f"{r.status_code}: {r.text[:200]}"


def test_admin_logs_requires_auth(client):
    r = client.get(f"{API}/admin/logs", timeout=15)
    assert r.status_code in (401, 403)


def test_admin_logs_list(client, admin_headers):
    # Allow log worker a moment to flush
    time.sleep(1.0)
    r = client.get(f"{API}/admin/logs?limit=10", headers=admin_headers, timeout=20)
    assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"
    data = r.json()
    assert isinstance(data, (dict, list))


def test_admin_logs_summary(client, admin_headers):
    r = client.get(f"{API}/admin/logs/summary", headers=admin_headers, timeout=20)
    assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"
    assert isinstance(r.json(), (dict, list))


def test_admin_logs_health(client, admin_headers):
    r = client.get(f"{API}/admin/logs/health", headers=admin_headers, timeout=20)
    assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"
    assert isinstance(r.json(), dict)


# ---------------- Core regression ----------------
def test_admin_dashboard_or_bookings(client, admin_headers):
    # Try a couple of common admin endpoints; require at least one <500 with 200.
    tried = []
    for path in ["/admin/dashboard", "/admin/bookings", "/admin/stats", "/bookings"]:
        r = client.get(f"{API}{path}", headers=admin_headers, timeout=20)
        tried.append((path, r.status_code))
        if r.status_code == 200:
            return
    pytest.fail(f"No core admin endpoint returned 200: {tried}")
