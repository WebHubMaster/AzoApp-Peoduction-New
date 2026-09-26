"""Iteration 110 — image PREVIEW / absolute URL tests.

Verifies:
  1. Merchant KYC upload returns ABSOLUTE https URL & GETs 200 image
  2. Merchant poster-logo upload returns absolute URL & serves 200
  3. Partner KYC upload returns absolute URL & serves 200
  4. Support upload returns absolute url + thumb_url and serves 200
  5. Merchant profile update preserves data: photo URL exactly
"""
import io
import os
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://customer-auto-deploy.preview.emergentagent.com").rstrip("/")


def _tiny_png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (32, 32), (200, 50, 50)).save(buf, format="PNG")
    return buf.getvalue()


def _tiny_png_data_url() -> str:
    import base64
    return "data:image/png;base64," + base64.b64encode(_tiny_png_bytes()).decode()


def _login(phone: str, role: str) -> str:
    """Send-OTP + Verify-OTP with fixed dev OTP 123456."""
    r = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=30)
    assert r.status_code == 200, f"send-otp {r.status_code}: {r.text}"
    r = requests.post(
        f"{BASE_URL}/api/auth/verify-otp",
        json={"phone": phone, "otp": "123456", "role": role, "create_if_new": True},
        timeout=30,
    )
    assert r.status_code == 200, f"verify-otp {r.status_code}: {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token") or (data.get("user") or {}).get("token")
    assert tok, f"no token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def merchant_token():
    return _login("+919000000002", "merchant")


@pytest.fixture(scope="module")
def partner_token():
    return _login("+919000555001", "partner")


def _assert_url_absolute_and_serves(url: str):
    assert isinstance(url, str) and url, f"url missing: {url!r}"
    assert url.startswith("https://"), f"URL not absolute https: {url}"
    r = requests.get(url, timeout=30)
    assert r.status_code == 200, f"GET {url} → {r.status_code}"
    ct = r.headers.get("content-type", "")
    assert ct.startswith("image/"), f"content-type not image: {ct} @ {url}"
    assert len(r.content) > 50, f"empty image body from {url}"


class TestMerchantKycUpload:
    def test_merchant_kyc_upload_absolute_and_serves(self, merchant_token):
        files = {"file": ("gst.png", _tiny_png_bytes(), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/merchant/registration/upload",
            headers={"Authorization": f"Bearer {merchant_token}"},
            files=files, data={"doc_type": "gst"}, timeout=60,
        )
        assert r.status_code == 200, f"upload failed {r.status_code}: {r.text}"
        body = r.json()
        assert "url" in body, body
        _assert_url_absolute_and_serves(body["url"])


class TestMerchantPosterLogo:
    def test_merchant_poster_logo_absolute_and_serves(self, merchant_token):
        files = {"file": ("logo.png", _tiny_png_bytes(), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/merchant/poster-logo",
            headers={"Authorization": f"Bearer {merchant_token}"},
            files=files, timeout=60,
        )
        assert r.status_code == 200, f"poster-logo upload failed {r.status_code}: {r.text}"
        body = r.json()
        # Response may return {url:...} or {poster_logo_url:...} or similar
        url = body.get("url") or body.get("poster_logo_url") or body.get("logo_url")
        # If URL not in response, fetch it via GET
        if not url:
            g = requests.get(
                f"{BASE_URL}/api/merchant/poster-logo",
                headers={"Authorization": f"Bearer {merchant_token}"}, timeout=30,
            )
            assert g.status_code == 200
            gb = g.json()
            url = gb.get("url") or gb.get("poster_logo_url") or gb.get("logo_url")
        _assert_url_absolute_and_serves(url)


class TestPartnerKycUpload:
    def test_partner_kyc_upload_absolute_and_serves(self, partner_token):
        files = {"file": ("aadhaar.png", _tiny_png_bytes(), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/partner/registration/upload",
            headers={"Authorization": f"Bearer {partner_token}"},
            files=files, data={"doc_type": "aadhaar_front"}, timeout=60,
        )
        assert r.status_code == 200, f"partner upload failed {r.status_code}: {r.text}"
        body = r.json()
        assert "url" in body
        _assert_url_absolute_and_serves(body["url"])


class TestSupportUpload:
    def test_support_upload_absolute_and_serves(self, merchant_token):
        files = {"file": ("ticket.png", _tiny_png_bytes(), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/support/upload",
            headers={"Authorization": f"Bearer {merchant_token}"},
            files=files, timeout=60,
        )
        assert r.status_code == 200, f"support upload failed {r.status_code}: {r.text}"
        body = r.json()
        _assert_url_absolute_and_serves(body["url"])
        assert "thumb_url" in body
        _assert_url_absolute_and_serves(body["thumb_url"])


class TestProfilePhotoDataUrl:
    def test_profile_photo_preserves_data_url(self, merchant_token):
        data_url = _tiny_png_data_url()
        r = requests.put(
            f"{BASE_URL}/api/auth/profile",
            headers={"Authorization": f"Bearer {merchant_token}"},
            json={"photo": data_url}, timeout=30,
        )
        assert r.status_code == 200, f"profile update failed: {r.status_code}: {r.text}"

        me = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {merchant_token}"}, timeout=30,
        )
        assert me.status_code == 200
        body = me.json()
        user = body.get("user") or body
        photo = user.get("photo")
        assert photo == data_url, f"photo was mangled.\n stored: {photo[:80]!r}\n expected: {data_url[:80]!r}"
