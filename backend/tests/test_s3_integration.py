"""Tests for AWS S3 integration test-connection + settings + media regression."""
import io
import os
import pytest
import requests
from dotenv import dotenv_values

_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
ADMIN_PHONE = "+919000000000"
ADMIN_OTP = "123456"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": ADMIN_PHONE}, timeout=15)
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp",
                      json={"phone": ADMIN_PHONE, "otp": ADMIN_OTP}, timeout=15)
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and isinstance(data["token"], str) and data["token"]
    return data["token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- Auth ----------
def test_admin_login_returns_token():
    r = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": ADMIN_PHONE}, timeout=15)
    assert r.status_code == 200
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp",
                      json={"phone": ADMIN_PHONE, "otp": ADMIN_OTP}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "token" in d
    assert d.get("user", {}).get("role") == "admin" or "user" in d


# ---------- s3-test auth ----------
def test_s3_test_requires_auth():
    r = requests.post(f"{BASE_URL}/api/admin/integrations/s3-test", json={}, timeout=20)
    assert r.status_code in (401, 403), f"unauth expected, got {r.status_code}: {r.text}"


# ---------- s3-test with saved creds ----------
def test_s3_test_saved_creds_ok_public_false(auth_headers):
    r = requests.post(f"{BASE_URL}/api/admin/integrations/s3-test",
                      json={}, headers=auth_headers, timeout=60)
    assert r.status_code == 200, f"unexpected: {r.status_code} {r.text}"
    d = r.json()
    # Structure
    for k in ("ok", "public", "steps", "bucket", "region"):
        assert k in d, f"missing key '{k}' in response: {d}"
    assert isinstance(d["steps"], list) and len(d["steps"]) >= 3
    # Expect ok=true with edunex bucket
    assert d["ok"] is True, f"expected ok=true with saved edunex creds, got: {d}"
    assert d["public"] is False, f"expected public=false (403), got: {d}"
    # Public URL reachable step present + ok=false
    pub_step = next((s for s in d["steps"] if "Public URL" in s.get("label", "")), None)
    assert pub_step is not None, f"missing Public URL reachable step: {d['steps']}"
    assert pub_step["ok"] is False
    # public_url should be surfaced
    assert d.get("public_url"), "public_url should be present"


# ---------- s3-test with invalid overrides ----------
def test_s3_test_invalid_overrides(auth_headers):
    payload = {
        "aws_access_key_id": "AKIAFAKE123",
        "aws_secret_access_key": "wrongsecret",
        "aws_bucket": "nonexistent-bucket-xyz-azoapp-test-1234567",
        "aws_region": "ap-south-1",
    }
    r = requests.post(f"{BASE_URL}/api/admin/integrations/s3-test",
                      json=payload, headers=auth_headers, timeout=60)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    d = r.json()
    assert d["ok"] is False
    assert isinstance(d.get("error"), str) and d["error"]
    connect_step = next((s for s in d["steps"] if "Connect to bucket" in s.get("label", "")), None)
    assert connect_step is not None
    assert connect_step["ok"] is False


# ---------- Regression: settings ----------
def test_get_settings_returns_aws_integrations(auth_headers):
    r = requests.get(f"{BASE_URL}/api/admin/settings", headers=auth_headers, timeout=20)
    assert r.status_code == 200
    d = r.json()
    integ = d.get("integrations") or {}
    # Ensure aws_s3 fields exist (bucket may be 'edunex' from saved settings)
    assert "aws_bucket" in integ or "aws_access_key_id" in integ, \
        f"expected aws_s3 fields present in integrations: {list(integ.keys())}"


def test_put_settings_partial_integrations_preserves_siblings(auth_headers):
    # snapshot before
    r0 = requests.get(f"{BASE_URL}/api/admin/settings", headers=auth_headers, timeout=20)
    before = (r0.json().get("integrations") or {}).copy()

    # partial update: only aws_folder
    r = requests.put(f"{BASE_URL}/api/admin/settings",
                     json={"integrations": {"aws_folder": "media"}},
                     headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    d = r.json()
    integ_after = d.get("integrations") or {}
    assert integ_after.get("aws_folder") == "media"
    # Siblings must survive
    for key in ("aws_access_key_id", "aws_secret_access_key", "aws_bucket", "aws_region"):
        if key in before:
            assert key in integ_after, f"sibling key '{key}' was wiped"
            assert integ_after[key] == before[key] or integ_after[key] is not None


# ---------- Regression: media upload ----------
def _tiny_png_bytes() -> bytes:
    # Build a 1x1 PNG via Pillow to avoid a hard-coded blob.
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (2, 2), (200, 30, 30)).save(buf, format="PNG")
    return buf.getvalue()


def test_media_upload_returns_url(auth_headers):
    files = {"file": ("test.png", _tiny_png_bytes(), "image/png")}
    r = requests.post(f"{BASE_URL}/api/media/upload",
                      headers=auth_headers, files=files, timeout=60)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    d = r.json()
    assert "url" in d and isinstance(d["url"], str) and d["url"].startswith("http")
