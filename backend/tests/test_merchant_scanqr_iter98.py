"""Backend tests for Merchant Scan QR panel APIs (iter 98)."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://mobile-customer-nav.preview.emergentagent.com").rstrip("/")
PHONE = "+919000000002"
OTP = "123456"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": PHONE}, timeout=15)
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    r2 = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=15)
    assert r2.status_code == 200, f"verify-otp failed: {r2.status_code} {r2.text}"
    data = r2.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_my_code(headers):
    r = requests.get(f"{BASE_URL}/api/merchant/my-code", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    code = data.get("merchant_code") or data.get("code")
    assert code, f"merchant_code missing: {data}"
    assert isinstance(code, str) and len(code) >= 4


def test_qr_config_get(headers):
    r = requests.get(f"{BASE_URL}/api/merchant/panel/qr/config", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, dict)


def test_qr_config_put_persist(headers):
    payload = {
        "template": "royal_purple",
        "primary": "#4C1D95",
        "preset": "template",
        "show": {"logo": True, "tagline": True},
        "businessName": "Sharma Electricals",
    }
    r = requests.put(f"{BASE_URL}/api/merchant/panel/qr/config", headers=headers, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    time.sleep(0.5)
    g = requests.get(f"{BASE_URL}/api/merchant/panel/qr/config", headers=headers, timeout=15).json()
    assert g.get("template") == "royal_purple", f"template not persisted: {g}"
    assert (g.get("primary") or "").lower() == "#4c1d95", f"primary not persisted: {g}"
    show = g.get("show") or {}
    assert show.get("tagline") is True


@pytest.mark.parametrize("rng", ["7d", "30d", "90d", "year"])
def test_qr_analytics(headers, rng):
    r = requests.get(f"{BASE_URL}/api/merchant/panel/qr/analytics", params={"range": rng}, headers=headers, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    for k in ("total_scans", "unique_visitors", "bookings", "conversion", "month_scans", "month_bookings", "series", "recent"):
        assert k in data, f"missing key {k} in analytics ({rng}): {list(data.keys())}"
    assert isinstance(data["series"], list)
    assert isinstance(data["recent"], list)


def test_restore_config_classic_blue(headers):
    payload = {
        "template": "classic_blue",
        "primary": "#0D47A1",
        "preset": "template",
        "show": {"logo": True, "tagline": True},
        "businessName": "Sharma Electricals",
    }
    r = requests.put(f"{BASE_URL}/api/merchant/panel/qr/config", headers=headers, json=payload, timeout=15)
    assert r.status_code == 200
    time.sleep(0.3)
    g = requests.get(f"{BASE_URL}/api/merchant/panel/qr/config", headers=headers, timeout=15).json()
    assert g.get("template") == "classic_blue"
    assert (g.get("primary") or "").lower() == "#0d47a1"
