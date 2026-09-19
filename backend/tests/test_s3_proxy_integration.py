"""Tests for AWS S3 proxy integration (iter15): proxy serving + auto-repair + fast test-connection."""
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


# ---------- Auth: admin OTP login returns token ----------
def test_admin_login_returns_token():
    r = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": ADMIN_PHONE}, timeout=15)
    assert r.status_code == 200
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp",
                      json={"phone": ADMIN_PHONE, "otp": ADMIN_OTP}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "token" in d and isinstance(d["token"], str)


# ---------- Auth guards: s3-test / s3-migrate without token ----------
def test_s3_test_requires_auth():
    r = requests.post(f"{BASE_URL}/api/admin/integrations/s3-test", json={}, timeout=20)
    assert r.status_code in (401, 403), f"unauth expected, got {r.status_code}: {r.text}"


def test_s3_migrate_requires_auth():
    r = requests.post(f"{BASE_URL}/api/admin/integrations/s3-migrate", json={}, timeout=20)
    assert r.status_code in (401, 403), f"unauth expected, got {r.status_code}: {r.text}"


# ---------- s3-test with SAVED creds: 4 steps, public=true, repaired_refs, fast ----------
def test_s3_test_saved_creds_4_steps_public_true(auth_headers):
    import time
    t0 = time.time()
    r = requests.post(f"{BASE_URL}/api/admin/integrations/s3-test",
                      json={}, headers=auth_headers, timeout=60)
    elapsed = time.time() - t0
    assert r.status_code == 200, f"unexpected: {r.status_code} {r.text}"
    d = r.json()
    for k in ("ok", "public", "steps", "bucket", "region", "repaired_refs"):
        assert k in d, f"missing key '{k}' in response: {d}"
    assert d["ok"] is True, f"expected ok=true, got: {d}"
    assert d["public"] is True, f"expected public=true (proxy mode), got public={d.get('public')}"
    assert isinstance(d["repaired_refs"], int) and d["repaired_refs"] >= 0
    # Expect exactly 4 named steps, all ok=true
    labels = [s.get("label") for s in d["steps"]]
    expected = ["Connect to bucket", "Upload test file", "Read file back", "Cleanup test file"]
    for exp in expected:
        assert exp in labels, f"missing step '{exp}' in steps: {labels}"
    for s in d["steps"]:
        assert s.get("ok") is True, f"step failed: {s}"
    # Latency: should be a few seconds, not 10s+. Allow generous 12s for network jitter.
    assert elapsed < 15, f"s3-test too slow: {elapsed:.2f}s"


# ---------- After s3-test success, branding logos are proxy URLs ----------
def test_branding_logos_are_proxy_urls(auth_headers):
    # Ensure repair has run at least once in this session
    requests.post(f"{BASE_URL}/api/admin/integrations/s3-test",
                  json={}, headers=auth_headers, timeout=60)
    r = requests.get(f"{BASE_URL}/api/admin/settings", headers=auth_headers, timeout=20)
    assert r.status_code == 200
    branding = (r.json().get("branding") or {})
    for field in ("logo_light", "logo_dark"):
        v = branding.get(field)
        if not v:
            continue
        assert "s3.ap-south-1.amazonaws.com" not in v, f"{field} still contains raw s3 host: {v}"
        assert v.startswith("/api/media/s3/") or v.startswith("http"), (
            f"{field} not a proxy or absolute URL: {v}"
        )


# ---------- Proxy GET /api/media/s3/{key} works ----------
def test_media_proxy_serves_object(auth_headers):
    r = requests.get(f"{BASE_URL}/api/admin/settings", headers=auth_headers, timeout=20)
    branding = (r.json().get("branding") or {})
    # find a proxy-based key
    proxy_url = None
    for field in ("logo_light", "logo_dark"):
        v = branding.get(field) or ""
        if isinstance(v, str) and "/api/media/s3/" in v:
            proxy_url = v
            break
    if not proxy_url:
        pytest.skip("No proxy-based branding logo present to test proxy fetch")
    # Extract just the /api/... path
    idx = proxy_url.find("/api/media/s3/")
    path = proxy_url[idx:]
    full = f"{BASE_URL}{path}"
    r2 = requests.get(full, timeout=30)
    assert r2.status_code == 200, f"proxy fetch failed: {r2.status_code} {r2.text[:200]}"
    ct = r2.headers.get("content-type", "")
    assert ct.startswith("image/") or "svg" in ct or ct.startswith("application/octet-stream"), (
        f"unexpected content-type: {ct}"
    )
    assert len(r2.content) > 0


def test_media_proxy_returns_404_for_missing_key():
    r = requests.get(f"{BASE_URL}/api/media/s3/nonexistent-key-xyz-abcdef-0987654321.bin", timeout=30)
    assert r.status_code == 404, f"expected 404 for missing key, got {r.status_code}: {r.text[:200]}"


# ---------- s3-test with invalid overrides ----------
def test_s3_test_invalid_overrides(auth_headers):
    payload = {
        "aws_access_key_id": "AKIAFAKE",
        "aws_secret_access_key": "wrong",
        "aws_bucket": "nonexistent-bkt-xyz",
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


# ---------- s3-migrate: no needs_public, returns migrated/total/updated_refs/removed_local ----------
def test_s3_migrate_admin(auth_headers):
    r = requests.post(f"{BASE_URL}/api/admin/integrations/s3-migrate",
                      json={}, headers=auth_headers, timeout=120)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    d = r.json()
    assert d.get("ok") is True, f"migrate not ok: {d}"
    for k in ("migrated", "total", "updated_refs", "removed_local"):
        assert k in d, f"missing '{k}' in migrate response: {d}"
    assert "needs_public" not in d, f"needs_public should be removed: {d}"


# ---------- Regression: media upload ----------
def _tiny_png_bytes() -> bytes:
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (2, 2), (200, 30, 30)).save(buf, format="PNG")
    return buf.getvalue()


def test_media_upload_returns_url(auth_headers):
    files = {"file": ("test_iter15.png", _tiny_png_bytes(), "image/png")}
    r = requests.post(f"{BASE_URL}/api/media/upload",
                      headers=auth_headers, files=files, timeout=60)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    d = r.json()
    assert "url" in d and isinstance(d["url"], str) and len(d["url"]) > 0
