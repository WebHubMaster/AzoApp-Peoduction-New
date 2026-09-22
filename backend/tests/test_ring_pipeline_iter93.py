"""
Backend regression tests for the call-style ring dispatch pipeline + invoice regression.
Iteration 93 - see /app/test_reports/iteration_93.json
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("BACKEND_BASE_URL", "http://localhost:8001").rstrip("/")
PARTNER_PHONE = "+919000000003"
ADMIN_EMAIL = "nodewaptechnology@gmail.com"


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def partner_token(api):
    r = api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": PARTNER_PHONE})
    assert r.status_code == 200, r.text
    r = api.post(
        f"{BASE_URL}/api/auth/verify-otp",
        json={"phone": PARTNER_PHONE, "otp": "123456", "role": "partner"},
    )
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, r.json()
    return tok


@pytest.fixture(scope="session")
def partner_headers(partner_token):
    return {"Authorization": f"Bearer {partner_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def admin_token(api):
    # Try email-login first
    r = api.post(f"{BASE_URL}/api/auth/email-login", json={"email": ADMIN_EMAIL})
    if r.status_code == 200:
        j = r.json()
        return j.get("token") or j.get("access_token")
    # Fallback: send-otp with admin's phone
    r = api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": "+919000000000"})
    if r.status_code == 200:
        r = api.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"phone": "+919000000000", "otp": "123456", "role": "admin"},
        )
        if r.status_code == 200:
            j = r.json()
            return j.get("token") or j.get("access_token")
    return None


# ---------------- Health / config ----------------

def test_push_config_public(api):
    r = api.get(f"{BASE_URL}/api/notifications/push-config")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)
    assert "enabled" in data


# ---------------- Auth ----------------

def test_partner_login_returns_token(partner_token):
    assert isinstance(partner_token, str) and len(partner_token) > 10


# ---------------- Device registration / status ----------------

def test_register_device(api, partner_headers):
    r = api.post(
        f"{BASE_URL}/api/notifications/devices",
        json={"token": "test-fcm-token-123", "device_id": "qa-device-1", "platform": "android"},
        headers=partner_headers,
    )
    assert r.status_code < 300, f"{r.status_code} {r.text}"


def test_push_status(api, partner_headers):
    r = api.post(
        f"{BASE_URL}/api/notifications/push-status",
        json={"ok": True, "reason": "registered:test"},
        headers=partner_headers,
    )
    assert r.status_code < 300, f"{r.status_code} {r.text}"


def test_ring_status(api, partner_headers):
    r = api.post(
        f"{BASE_URL}/api/notifications/ring-status",
        json={"ok": True, "mode": "fgs", "ctx": "bg", "booking_id": "qa-1"},
        headers=partner_headers,
    )
    assert r.status_code < 300, f"{r.status_code} {r.text}"


# ---------------- Ring fallback endpoints ----------------

def test_ring_pending(api, partner_headers):
    r = api.get(f"{BASE_URL}/api/bookings/partner/ring-pending", headers=partner_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, (list, dict))


def test_reminder_pending(api, partner_headers):
    r = api.get(f"{BASE_URL}/api/bookings/partner/reminder-pending", headers=partner_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, (list, dict))


# ---------------- Dispatch pipeline (should NOT 500) ----------------

def test_test_ring_dispatch_no_500(api, partner_headers, admin_token):
    tried = []
    # Try admin variant first if available
    urls = []
    if admin_token:
        urls.append(
            (
                f"{BASE_URL}/api/admin/notifications/test-ring",
                {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            )
        )
    urls.append((f"{BASE_URL}/api/partner/test-ring", partner_headers))
    last = None
    for u, h in urls:
        r = api.post(u, json={}, headers=h)
        tried.append((u, r.status_code))
        last = r
        if r.status_code != 404:
            break
    assert last is not None
    # 500 = bug. Anything else (200 skipped/not_configured, 400, 401, 403, 404) = pass for this check.
    assert last.status_code != 500, f"Dispatch endpoint 500'd. Attempts: {tried} body={last.text[:400]}"


# ---------------- Invoice regression ----------------

@pytest.fixture(scope="session")
def sample_invoice_id(api, partner_headers):
    r = api.get(f"{BASE_URL}/api/invoices?page=1&page_size=1", headers=partner_headers)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data.get("items") if isinstance(data, dict) else data
    if not items:
        pytest.skip("No invoices seeded for partner")
    inv = items[0]
    return inv.get("id") or inv.get("_id") or inv.get("invoice_id")


def test_invoice_pdf(api, partner_headers, sample_invoice_id):
    r = api.get(f"{BASE_URL}/api/invoices/{sample_invoice_id}/pdf", headers=partner_headers)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    ct = r.headers.get("content-type", "")
    assert "application/pdf" in ct.lower(), ct
    assert r.content[:4] == b"%PDF", r.content[:20]


def test_invoice_email_not_500(api, partner_headers, sample_invoice_id):
    r = api.post(
        f"{BASE_URL}/api/invoices/{sample_invoice_id}/email",
        json={},
        headers=partner_headers,
    )
    assert r.status_code != 500, f"Email endpoint 500'd: {r.text[:400]}"
    assert r.status_code in (200, 400, 404, 422), f"Unexpected {r.status_code}: {r.text[:300]}"
