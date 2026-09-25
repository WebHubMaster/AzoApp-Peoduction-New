"""Backend sanity tests for Customer App flows (auth + customer data endpoints)."""
import os
import pytest
import requests

BASE_URL = "http://localhost:8001"  # local backend, same instance
CUSTOMER_PHONE = "+919000000004"
PARTNER_PHONE = "+919000000003"
MERCHANT_PHONE = "+919000000002"
ADMIN_PHONE = "+919000000000"
OTP = "123456"


@pytest.fixture(scope="module")
def customer_token():
    r = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": CUSTOMER_PHONE})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("sent") is True
    assert data.get("dev_otp") == OTP
    r2 = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": CUSTOMER_PHONE, "otp": OTP})
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert "token" in d2
    assert d2["user"]["role"] == "customer"
    return d2["token"]


@pytest.fixture(scope="module")
def auth_headers(customer_token):
    return {"Authorization": f"Bearer {customer_token}"}


# --- Auth endpoints ---
def test_send_otp_customer():
    r = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": CUSTOMER_PHONE})
    assert r.status_code == 200
    data = r.json()
    assert data.get("sent") is True
    assert data.get("dev_otp") == OTP


def test_verify_otp_returns_customer(customer_token):
    assert isinstance(customer_token, str) and len(customer_token) > 0


def test_me_returns_customer(auth_headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
    assert r.status_code == 200
    u = r.json()
    assert u["role"] == "customer"
    assert "Priya" in (u.get("name") or "")


def test_partner_verify_returns_partner_role():
    """Partner phone must still verify at backend, but role should be partner (client blocks it)."""
    requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": PARTNER_PHONE})
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": PARTNER_PHONE, "otp": OTP})
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "partner"


def test_demo_status():
    r = requests.get(f"{BASE_URL}/api/auth/demo-status")
    assert r.status_code == 200


def test_auth_config():
    r = requests.get(f"{BASE_URL}/api/auth/config")
    assert r.status_code == 200


# --- Customer data endpoints ---
def test_bookings(auth_headers):
    r = requests.get(f"{BASE_URL}/api/bookings", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_wallet(auth_headers):
    r = requests.get(f"{BASE_URL}/api/wallet", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "balance" in data


def test_refunds(auth_headers):
    r = requests.get(f"{BASE_URL}/api/payments/refunds", headers=auth_headers)
    assert r.status_code == 200


def test_catalog_categories():
    r = requests.get(f"{BASE_URL}/api/catalog/categories")
    assert r.status_code == 200
    cats = r.json()
    assert isinstance(cats, list)
    assert len(cats) >= 1


def test_catalog_services():
    r = requests.get(f"{BASE_URL}/api/catalog/services")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_referral_summary(auth_headers):
    r = requests.get(f"{BASE_URL}/api/referral/summary", headers=auth_headers)
    assert r.status_code == 200


def test_notifications(auth_headers):
    r = requests.get(f"{BASE_URL}/api/notifications", headers=auth_headers)
    assert r.status_code == 200


def test_site_config():
    r = requests.get(f"{BASE_URL}/api/site/config")
    assert r.status_code == 200
