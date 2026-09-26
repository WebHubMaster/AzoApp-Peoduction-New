"""Backend OTP auth flow tests for Partner/Merchant Expo app."""
import os
import random
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-customer-nav.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

PARTNER_PHONE = "+919000000003"
MERCHANT_PHONE = "+919000000002"
CUSTOMER_PHONE = "+919000000004"
DEMO_OTP = "123456"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def test_site_config(session):
    r = session.get(f"{API}/site/config", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    # Should have some branding config
    assert isinstance(data, dict)


def test_send_otp_partner(session):
    r = session.post(f"{API}/auth/send-otp", json={"phone": PARTNER_PHONE}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("success") or d.get("ok") or "otp" in d or "dev_otp" in d or "message" in d


def test_verify_otp_partner_login(session):
    session.post(f"{API}/auth/send-otp", json={"phone": PARTNER_PHONE}, timeout=15)
    r = session.post(
        f"{API}/auth/verify-otp",
        json={"phone": PARTNER_PHONE, "otp": DEMO_OTP, "create_if_new": False},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert "token" in d or "access_token" in d, d
    user = d.get("user") or {}
    assert user.get("role") == "partner", f"expected role partner, got {user}"


def test_verify_otp_merchant_login(session):
    session.post(f"{API}/auth/send-otp", json={"phone": MERCHANT_PHONE}, timeout=15)
    r = session.post(
        f"{API}/auth/verify-otp",
        json={"phone": MERCHANT_PHONE, "otp": DEMO_OTP, "create_if_new": False},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    user = r.json().get("user") or {}
    assert user.get("role") == "merchant"


def test_verify_otp_customer_is_still_returned_but_role_customer(session):
    """Backend may still return customer; frontend LOGIN_ROLES should block it.
    Verify backend behavior: returns role=customer so FE can filter."""
    session.post(f"{API}/auth/send-otp", json={"phone": CUSTOMER_PHONE}, timeout=15)
    r = session.post(
        f"{API}/auth/verify-otp",
        json={"phone": CUSTOMER_PHONE, "otp": DEMO_OTP, "create_if_new": False},
        timeout=15,
    )
    # Either backend blocks (403) or returns user role customer for FE to filter
    if r.status_code == 200:
        user = r.json().get("user") or {}
        assert user.get("role") == "customer", f"customer number returned role: {user.get('role')}"
    else:
        assert r.status_code in (401, 403)


def test_verify_otp_unregistered_new_user_flag(session):
    # generate random unregistered number
    phone = f"+9198{random.randint(10000000, 99999999)}"
    session.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
    r = session.post(
        f"{API}/auth/verify-otp",
        json={"phone": phone, "otp": DEMO_OTP, "create_if_new": False},
        timeout=15,
    )
    # Expect success with new_user flag or 404-like signal
    assert r.status_code in (200, 404), r.text
    if r.status_code == 200:
        d = r.json()
        assert d.get("new_user") is True or d.get("user") is None, f"expected new_user true: {d}"


def test_verify_otp_create_merchant(session):
    phone = f"+9198{random.randint(10000000, 99999999)}"
    session.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
    r = session.post(
        f"{API}/auth/verify-otp",
        json={
            "phone": phone,
            "otp": DEMO_OTP,
            "create_if_new": True,
            "role": "merchant",
            "name": "TEST_QA_Merchant",
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert "token" in d or "access_token" in d
    user = d.get("user") or {}
    assert user.get("role") == "merchant"
    assert user.get("name") == "TEST_QA_Merchant" or "TEST_QA" in (user.get("name") or "")


def test_wrong_otp_rejected(session):
    session.post(f"{API}/auth/send-otp", json={"phone": PARTNER_PHONE}, timeout=15)
    r = session.post(
        f"{API}/auth/verify-otp",
        json={"phone": PARTNER_PHONE, "otp": "000000", "create_if_new": False},
        timeout=15,
    )
    assert r.status_code in (400, 401, 403), r.text
