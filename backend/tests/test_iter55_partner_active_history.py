"""Iteration 55 backend tests — Partner Active Job + Job History features.

Covers:
- POST /api/auth/send-otp + /api/auth/verify-otp for demo partner (+919000000003)
- GET /api/bookings/partner/active includes demo_otps {start, completion} for demo partner
- GET /api/bookings/partner/history?status=all|completed|cancelled returns partner's
  completed + cancelled jobs correctly filtered
- Existing partner action endpoints still reachable (permission wall) — a smoke
  probe on /start-otp, /evidence, /spare-parts, /complete
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    # Fallback to frontend .env public URL
    try:
        with open("/app/frontend/.env") as f:
            for ln in f:
                if ln.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    BASE_URL = ln.split("=", 1)[1].strip()
                    break
    except Exception:
        BASE_URL = None
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not configured"
BASE_URL = BASE_URL.rstrip("/")

DEMO_PARTNER_PHONE = "+919000000003"
DEMO_OTP = "123456"


@pytest.fixture(scope="module")
def partner_token():
    s = requests.Session()
    s.headers["Content-Type"] = "application/json"
    r = s.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": DEMO_PARTNER_PHONE}, timeout=15)
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    r = s.post(f"{BASE_URL}/api/auth/verify-otp", json={
        "phone": DEMO_PARTNER_PHONE, "otp": DEMO_OTP, "create_if_new": False,
    }, timeout=15)
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    assert data["user"].get("role") == "partner"
    return data["token"]


@pytest.fixture
def api(partner_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {partner_token}", "Content-Type": "application/json"})
    return s


class TestPartnerActive:
    """/api/bookings/partner/active must include demo_otps for the demo partner."""

    def test_active_endpoint_ok(self, api):
        r = api.get(f"{BASE_URL}/api/bookings/partner/active", timeout=15)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)

    def test_active_rows_have_demo_otps_for_demo_partner(self, api):
        r = api.get(f"{BASE_URL}/api/bookings/partner/active", timeout=15)
        assert r.status_code == 200
        rows = r.json()
        if not rows:
            pytest.skip("Demo partner has no active jobs right now")
        for b in rows:
            assert "demo_otps" in b, f"demo_otps missing on active row {b.get('code')}"
            # otps field itself must NOT leak
            assert "otps" not in b, "raw otps field leaked to partner active response"
            do = b.get("demo_otps") or {}
            # Demo partner should have both start & completion
            assert "start" in do and "completion" in do, f"demo_otps incomplete: {do}"


class TestPartnerHistory:
    """/api/bookings/partner/history must return completed+cancelled with status filter."""

    def test_history_all(self, api):
        r = api.get(f"{BASE_URL}/api/bookings/partner/history", params={"status": "all"}, timeout=15)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        for b in rows:
            assert b.get("status") in ("completed", "paid", "cancelled"), \
                f"unexpected status in history: {b.get('status')}"
            # otps must not leak
            assert "otps" not in b

    def test_history_completed_only(self, api):
        r = api.get(f"{BASE_URL}/api/bookings/partner/history", params={"status": "completed"}, timeout=15)
        assert r.status_code == 200
        for b in r.json():
            assert b.get("status") in ("completed", "paid"), b.get("status")

    def test_history_cancelled_only(self, api):
        r = api.get(f"{BASE_URL}/api/bookings/partner/history", params={"status": "cancelled"}, timeout=15)
        assert r.status_code == 200
        for b in r.json():
            assert b.get("status") == "cancelled"

    def test_history_sorted_desc(self, api):
        r = api.get(f"{BASE_URL}/api/bookings/partner/history", timeout=15)
        assert r.status_code == 200
        rows = r.json()
        if len(rows) < 2:
            pytest.skip("not enough rows to test sorting")
        ts = [b.get("updated_at") for b in rows if b.get("updated_at")]
        assert ts == sorted(ts, reverse=True), "history not sorted DESC by updated_at"


class TestExistingPartnerEndpoints:
    """Existing partner action endpoints still exist and enforce validation."""

    def test_start_otp_requires_valid_booking(self, api):
        r = api.post(f"{BASE_URL}/api/bookings/does-not-exist/start-otp",
                     json={"otp": "1234"}, timeout=15)
        # 404 (not found) or 400/403 are acceptable — endpoint must be reachable
        assert r.status_code in (400, 403, 404), r.status_code

    def test_evidence_requires_valid_booking(self, api):
        r = api.post(f"{BASE_URL}/api/bookings/does-not-exist/evidence",
                     json={"stage": "before", "url": "http://x/y.jpg"}, timeout=15)
        assert r.status_code in (400, 403, 404), r.status_code

    def test_complete_requires_valid_booking(self, api):
        r = api.post(f"{BASE_URL}/api/bookings/does-not-exist/complete",
                     json={"otp": "1234"}, timeout=15)
        assert r.status_code in (400, 403, 404), r.status_code

    def test_spare_parts_requires_valid_booking(self, api):
        r = api.post(f"{BASE_URL}/api/bookings/does-not-exist/spare-parts",
                     json={"name": "wire", "price": 10}, timeout=15)
        assert r.status_code in (400, 403, 404, 422), r.status_code


class TestPartnerDemoFlow:
    """If demo partner has an active job, run start-OTP → complete-OTP with 1234."""

    def test_full_active_job_flow_with_demo_otp(self, api):
        r = api.get(f"{BASE_URL}/api/bookings/partner/active", timeout=15)
        assert r.status_code == 200
        rows = r.json()
        if not rows:
            pytest.skip("no active job to run OTP flow against")
        target = None
        for b in rows:
            if b.get("status") in ("assigned", "arrived_customer"):
                target = b
                break
        if not target:
            pytest.skip("no assigned/arrived_customer job available for start-OTP flow")
        bid = target["id"]
        demo = target.get("demo_otps") or {}
        start_otp = demo.get("start") or "1234"
        # Try to submit start-OTP; must return 4xx (needs before-evidence) or 200
        r2 = api.post(f"{BASE_URL}/api/bookings/{bid}/start-otp", json={"otp": start_otp}, timeout=15)
        # Accept 200 (started) or 400 (evidence required) — both prove endpoint works
        assert r2.status_code in (200, 400), f"start-otp unexpected {r2.status_code}: {r2.text}"
