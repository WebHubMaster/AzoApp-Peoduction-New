"""Iter 102: Server-rendered QR poster endpoint + QR attribution flow.

Backend regression for GET /api/merchant/panel/qr/poster and the qr-scan +
booking-with-merchant_ref_code attribution flow.
"""
import io
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://mobile-customer-nav.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

MERCHANT_PHONE = "+919000000002"
CUSTOMER_PHONE = "+919000000004"
OTP = "123456"


def _login(phone):
    requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return d.get("token") or d.get("access_token"), d.get("user", {})


@pytest.fixture(scope="module")
def merchant_ctx():
    tok, user = _login(MERCHANT_PHONE)
    r = requests.get(f"{API}/merchant/my-code", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
    assert r.status_code == 200, r.text
    code = r.json().get("merchant_code")
    assert code
    return {"token": tok, "user": user, "code": code}


@pytest.fixture(scope="module")
def customer_ctx():
    tok, user = _login(CUSTOMER_PHONE)
    return {"token": tok, "user": user}


# ═══════════════════ Poster endpoint content-type / size / auth ═════════════
class TestPosterEndpoint:
    def _url(self, fmt):
        return f"{API}/merchant/panel/qr/poster?fmt={fmt}"

    def test_png(self, merchant_ctx):
        r = requests.get(self._url("png"), headers={"Authorization": f"Bearer {merchant_ctx['token']}"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("image/png")
        assert len(r.content) > 10_000, f"png too small: {len(r.content)}"
        cd = r.headers.get("content-disposition", "")
        assert f"azoapp-poster-{merchant_ctx['code']}.png" in cd, cd
        # Verify dimensions
        from PIL import Image
        im = Image.open(io.BytesIO(r.content))
        assert im.size == (1080, 1350), f"expected 1080x1350 got {im.size}"

    def test_jpg(self, merchant_ctx):
        r = requests.get(self._url("jpg"), headers={"Authorization": f"Bearer {merchant_ctx['token']}"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("image/jpeg")
        assert len(r.content) > 10_000
        assert f"azoapp-poster-{merchant_ctx['code']}.jpg" in r.headers.get("content-disposition", "")

    def test_pdf(self, merchant_ctx):
        r = requests.get(self._url("pdf"), headers={"Authorization": f"Bearer {merchant_ctx['token']}"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 10_000
        assert r.content[:4] == b"%PDF"
        assert f"azoapp-poster-{merchant_ctx['code']}.pdf" in r.headers.get("content-disposition", "")

    def test_unauthenticated(self):
        r = requests.get(self._url("png"), timeout=15)
        assert r.status_code == 401, r.status_code

    def test_non_merchant_forbidden(self, customer_ctx):
        r = requests.get(self._url("png"), headers={"Authorization": f"Bearer {customer_ctx['token']}"}, timeout=15)
        assert r.status_code == 403, f"customer should be forbidden, got {r.status_code}: {r.text[:200]}"

    def test_foreign_link_rebuilt(self, merchant_ctx):
        # Foreign link (does not contain own code) should still 200 - server rebuilds
        r = requests.get(f"{API}/merchant/panel/qr/poster?fmt=png&link=https://evil.example.com/?ref=XXXXXXX",
                         headers={"Authorization": f"Bearer {merchant_ctx['token']}"}, timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/png")

    def test_weird_fmt_falls_back_png(self, merchant_ctx):
        r = requests.get(f"{API}/merchant/panel/qr/poster?fmt=bogus",
                         headers={"Authorization": f"Bearer {merchant_ctx['token']}"}, timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/png")


# ═══════════════════ QR attribution flow: qr-scan + booking ═════════════════
class TestQRAttribution:
    def test_qr_scan_public_and_analytics(self, merchant_ctx):
        # Public scan
        r = requests.post(f"{API}/merchant/qr-scan", json={"code": merchant_ctx["code"], "source": "qr"}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True, body
        # Analytics (merchant token)
        r2 = requests.get(f"{API}/merchant/panel/qr/analytics?range=30d",
                          headers={"Authorization": f"Bearer {merchant_ctx['token']}"}, timeout=15)
        assert r2.status_code == 200, r2.text
        # scans should be >= 1 (some field name; be flexible)
        data = r2.json()
        # try common keys
        scans = data.get("scans")
        if isinstance(scans, list):
            total = len(scans)
        elif isinstance(scans, (int, float)):
            total = scans
        else:
            total = data.get("total_scans") or data.get("scan_count") or 0
        assert total >= 1, f"expected scans >= 1, data={data}"

    def test_booking_with_merchant_ref(self, merchant_ctx, customer_ctx):
        from datetime import datetime, timedelta
        # Pick a service
        r = requests.get(f"{API}/catalog/services",
                         headers={"Authorization": f"Bearer {customer_ctx['token']}"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        services = data if isinstance(data, list) else data.get("services", [])
        if not services:
            pytest.skip("No services available")
        service_id = services[0].get("id")
        tomorrow = (datetime.utcnow() + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
        scheduled_at = tomorrow.strftime("%Y-%m-%dT%H:%M:00Z")
        payload = {
            "items": [{"service_id": service_id, "qty": 1}],
            "address": {"line1": "Test", "line2": "T", "city": "Patna", "state": "Bihar",
                        "pincode": "800001", "landmark": "L"},
            "schedule_type": "schedule",
            "scheduled_at": scheduled_at,
            "merchant_ref_code": merchant_ctx["code"],
        }
        r = requests.post(f"{API}/bookings/grouped",
                          headers={"Authorization": f"Bearer {customer_ctx['token']}"}, json=payload, timeout=30)
        assert r.status_code == 200, f"booking failed: {r.status_code} {r.text[:300]}"
        b = r.json()
        booking = b.get("booking", b)
        assert booking.get("merchant_id") == merchant_ctx["user"].get("id"), \
            f"merchant_id mismatch: booking.merchant_id={booking.get('merchant_id')} vs merchant.id={merchant_ctx['user'].get('id')}"
