"""Tests for Admin App Management: config GET, APK chunk+finish rejection path,
local storage put + media download. Context: review_request iteration (post pod-reset).
"""
import os
import io
import uuid
import hashlib
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://cb98f685-8ce1-4c45-84be-16713566ee7f.preview.emergentagent.com").rstrip("/")
ADMIN_PHONE = "+919000000000"
OTP = "123456"
APK_PATH = "/tmp/tiny.apk"


@pytest.fixture(scope="session")
def admin_token():
    s = requests.Session()
    # try common auth endpoints
    r = s.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": ADMIN_PHONE})
    assert r.status_code in (200, 201), f"send-otp failed: {r.status_code} {r.text[:200]}"
    r = s.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": ADMIN_PHONE, "otp": OTP})
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    tok = data.get("token") or data.get("access_token") or (data.get("data") or {}).get("token")
    assert tok, f"no token in response: {data}"
    return tok


@pytest.fixture(scope="session")
def admin_client(admin_token):
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {admin_token}"
    return s


# ---- Public config GET -------------------------------------------------
class TestPublicConfig:
    def test_customer_public_config(self):
        r = requests.get(f"{BASE_URL}/api/app-mgmt/config/customer", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("platform", "version_code", "latest_version", "apk_url", "apk_package"):
            assert k in d
        assert d["platform"] == "customer"

    def test_partner_public_config(self):
        r = requests.get(f"{BASE_URL}/api/app-mgmt/config/partner", timeout=15)
        assert r.status_code == 200
        assert r.json()["platform"] == "partner"


# ---- Admin config GET (what the admin UI calls on load) ----------------
class TestAdminConfig:
    def test_admin_config_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/app-mgmt/admin/config", timeout=15)
        assert r.status_code in (401, 403)

    def test_admin_config_authorized(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/app-mgmt/admin/config", timeout=15)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        # The admin UI expects both platforms' config
        assert isinstance(d, (dict, list))


# ---- APK chunk + finish rejection path ---------------------------------
class TestApkFinishRejection:
    def test_fdroid_apk_rejected_for_customer(self, admin_client):
        assert os.path.exists(APK_PATH), "sample APK missing"
        with open(APK_PATH, "rb") as f:
            raw = f.read()
        upload_id = f"TEST_{uuid.uuid4().hex[:12]}"
        # chunked upload (single chunk)
        headers = {"X-Upload-Id": upload_id, "X-Chunk-Index": "0",
                   "Content-Type": "application/octet-stream"}
        r = admin_client.post(
            f"{BASE_URL}/api/app-mgmt/admin/apk/customer/chunk",
            data=raw, headers=headers, timeout=60,
        )
        assert r.status_code == 200, f"chunk failed: {r.status_code} {r.text[:200]}"
        assert r.json().get("received") == len(raw)

        # finish → expect 400 package-mismatch
        r = admin_client.post(
            f"{BASE_URL}/api/app-mgmt/admin/apk/customer/finish",
            json={"upload_id": upload_id}, timeout=60,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:300]}"
        detail = (r.json().get("detail") or "").lower()
        assert "does not belong to the customer app" in detail, detail


# ---- Local storage put + media download byte-identity ------------------
class TestLocalStorageDownload:
    """Directly use storage_service._put to write a tiny APK locally, then GET it
    via /api/media/file/<name> to confirm end-to-end local fallback works."""

    def test_local_put_and_download(self):
        import sys, asyncio
        sys.path.insert(0, "/app/backend")
        from services import storage_service

        payload = os.urandom(2048)
        name = f"app-mgmt/customer/TEST-{uuid.uuid4().hex[:8]}.apk"
        url = asyncio.get_event_loop().run_until_complete(
            storage_service._put(name, payload, "application/vnd.android.package-archive")
        )
        assert url, "empty url returned"
        # If S3 is NOT configured, URL should route through /api/media/file/
        if "/api/media/file/" in url:
            r = requests.get(url, timeout=30)
            assert r.status_code == 200, f"download failed: {r.status_code}"
            assert r.headers.get("content-type", "").startswith("application/vnd.android.package-archive")
            assert hashlib.sha256(r.content).hexdigest() == hashlib.sha256(payload).hexdigest()
        else:
            pytest.skip(f"non-local URL returned (S3?): {url}")
