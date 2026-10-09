"""Backend smoke tests for the dark-mode iteration.

Verifies:
- /api/site/config is up (after .env recreation)
- Send OTP demo mode returns 123456
- Verify OTP returns partner token + user
"""
import os
import requests

BASE = os.environ.get("BACKEND_URL", "https://bug-cat-triage.preview.emergentagent.com").rstrip("/")
PHONE = "+919000000003"


def test_site_config_200():
    r = requests.get(f"{BASE}/api/site/config", timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)
    # branding/theme should be present in some form
    keys = ",".join(data.keys()).lower()
    assert any(k in keys for k in ("brand", "theme", "site", "default_mode", "logo", "name"))


def test_send_otp_demo():
    r = requests.post(f"{BASE}/api/auth/send-otp", json={"phone": PHONE}, timeout=20)
    assert r.status_code == 200
    j = r.json()
    assert j.get("sent") is True
    assert j.get("dev_otp") == "123456"


def test_verify_otp_partner():
    r = requests.post(
        f"{BASE}/api/auth/verify-otp",
        json={"phone": PHONE, "otp": "123456", "create_if_new": False},
        timeout=20,
    )
    assert r.status_code == 200
    j = r.json()
    assert isinstance(j.get("token"), str) and len(j["token"]) > 20
    user = j.get("user") or {}
    assert user.get("role") == "partner"
    assert user.get("phone") == PHONE
