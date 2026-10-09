"""Backend tests for Partner Notifications API used by the Partner App
notifications screen (GET /api/notifications, DELETE /api/notifications/{id},
DELETE /api/notifications)."""
import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
            or "https://api.webhubmaster.shop").rstrip("/")
API = f"{BASE_URL}/api"

PARTNER_PHONE = "+919000000003"
OTP = "123456"


@pytest.fixture(scope="module")
def partner_token():
    r = requests.post(f"{API}/auth/send-otp", json={"phone": PARTNER_PHONE}, timeout=15)
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    r = requests.post(
        f"{API}/auth/verify-otp",
        json={"phone": PARTNER_PHONE, "otp": OTP, "create_if_new": False},
        timeout=15,
    )
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    if not token:
        pytest.skip(f"No token in verify-otp response: {data}")
    return token


@pytest.fixture
def auth_headers(partner_token):
    return {"Authorization": f"Bearer {partner_token}", "Content-Type": "application/json"}


# ---------- GET /notifications ----------
def test_get_notifications_returns_list(auth_headers):
    r = requests.get(f"{API}/notifications", headers=auth_headers, timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", [])
    assert isinstance(items, list), f"expected list, got {type(data)}"


def test_get_notifications_requires_auth():
    r = requests.get(f"{API}/notifications", timeout=15)
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


# ---------- DELETE /notifications/{id} ----------
def test_delete_single_notification_safe(auth_headers):
    """Even a non-existent id should return a well-formed response (hide semantics)."""
    r = requests.delete(f"{API}/notifications/nonexistent-id-xyz", headers=auth_headers, timeout=15)
    # hide_notification is idempotent - expect 2xx
    assert r.status_code in (200, 204), f"{r.status_code} {r.text}"


# ---------- DELETE /notifications (clear all) ----------
def test_clear_all_notifications(auth_headers):
    r = requests.delete(f"{API}/notifications", headers=auth_headers, timeout=15)
    assert r.status_code in (200, 204), f"{r.status_code} {r.text}"
    # After clear-all, GET must still succeed and return a list (possibly empty).
    g = requests.get(f"{API}/notifications", headers=auth_headers, timeout=15)
    assert g.status_code == 200
    items = g.json() if isinstance(g.json(), list) else g.json().get("items", [])
    assert isinstance(items, list)
