"""Iter 70 - Mobile Partner+Merchant Auth port. Tests that customer/admin excluded,
create_if_new:false gates, forgot-reset, /auth/me, etc."""
import os
import random
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # Fallback: read frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip()
BASE_URL = BASE_URL.rstrip("/")


def _rand_phone():
    return "+91" + "9" + "".join(str(random.randint(0, 9)) for _ in range(9))


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# --- Email login (create_if_new gate) ---
def test_email_unknown_no_autocreate(s):
    unknown = f"nobody_{random.randint(10000, 99999)}@azoapp.test"
    r = s.post(f"{BASE_URL}/api/auth/email", json={"email": unknown, "password": "abcd1234", "create_if_new": False})
    assert r.status_code == 404, r.text
    body = r.json()
    detail = str(body.get("detail") or body.get("message") or body)
    assert "No account found" in detail or "no account" in detail.lower()

    # Verify NOT persisted: same call again = still 404
    r2 = s.post(f"{BASE_URL}/api/auth/email", json={"email": unknown, "password": "abcd1234", "create_if_new": False})
    assert r2.status_code == 404


def test_email_partner_login_ok(s):
    r = s.post(f"{BASE_URL}/api/auth/email", json={"email": "partner.demo@azoapp.test", "password": "Partner@123"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("token")
    assert data["user"]["role"] == "partner"


# --- OTP verify create_if_new gate ---
def test_verify_otp_unknown_new_user_flag(s):
    ph = _rand_phone()
    # Send otp first (dev mode)
    s.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": ph})
    r = s.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": ph, "otp": "123456", "create_if_new": False})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("new_user") is True
    assert not data.get("token")

    # Confirm no user was created — try login without create -> still new_user:true
    r2 = s.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": ph, "otp": "123456", "create_if_new": False})
    assert r2.json().get("new_user") is True


@pytest.fixture(scope="module")
def new_partner_phone(s):
    ph = _rand_phone()
    s.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": ph})
    r = s.post(f"{BASE_URL}/api/auth/verify-otp", json={
        "phone": ph, "otp": "123456", "create_if_new": True, "name": "Test Partner", "role": "partner"
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("token")
    assert data["user"]["role"] == "partner"
    return ph, data["token"]


def test_verify_otp_create_partner(new_partner_phone):
    assert new_partner_phone[1]


def test_reregister_as_merchant_rejected(s, new_partner_phone):
    ph, _ = new_partner_phone
    s.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": ph})
    r = s.post(f"{BASE_URL}/api/auth/verify-otp", json={
        "phone": ph, "otp": "123456", "create_if_new": True, "name": "X", "role": "merchant"
    })
    assert r.status_code == 400, r.text
    detail = str(r.json().get("detail", ""))
    assert "already registered as partner" in detail.lower() or "already registered" in detail.lower()


def test_customer_role_mismatch(s):
    ph = "+919000000004"
    s.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": ph})
    r = s.post(f"{BASE_URL}/api/auth/verify-otp", json={
        "phone": ph, "otp": "123456", "create_if_new": True, "name": "X", "role": "partner"
    })
    assert r.status_code == 400, r.text


# --- Forgot / reset password ---
def test_forgot_reset_flow(s):
    ident = "partner.demo@azoapp.test"
    r = s.post(f"{BASE_URL}/api/auth/forgot-password", json={"identifier": ident})
    assert r.status_code == 200, r.text
    dev_otp = r.json().get("dev_otp")
    assert dev_otp

    # Wrong OTP
    bad = s.post(f"{BASE_URL}/api/auth/reset-password", json={"identifier": ident, "otp": "000000", "new_password": "Partner@123"})
    assert bad.status_code == 400

    # Correct OTP - change to Partner@123 (same value keeps other tests working)
    ok = s.post(f"{BASE_URL}/api/auth/reset-password", json={"identifier": ident, "otp": dev_otp, "new_password": "Partner@123"})
    assert ok.status_code == 200, ok.text

    # verify login still works
    login = s.post(f"{BASE_URL}/api/auth/email", json={"email": ident, "password": "Partner@123"})
    assert login.status_code == 200


# --- /auth/me ---
def test_auth_me_valid_and_invalid(s, new_partner_phone):
    _, tok = new_partner_phone
    r = s.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    assert r.json().get("role") == "partner"

    bad = s.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": "Bearer garbage.token.here"})
    assert bad.status_code == 401
