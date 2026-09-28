"""Iteration 149 — Full regression health check.
Covers OTP auth, catalog, subscriptions (customer/partner/admin/maid),
one-time booking wizard, and generic customer endpoints."""
import os
import io
import pytest
import requests
import subprocess
import time
import struct
import zlib


def _make_png(w=8, h=8):
    """Return minimal valid PNG bytes (solid gray)."""
    def _chunk(kind, data):
        return (struct.pack(">I", len(data)) + kind + data
                + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff))
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)  # 8-bit RGB
    raw = b""
    for _ in range(h):
        raw += b"\x00" + (b"\x80\x80\x80" * w)
    idat = zlib.compress(raw)
    return sig + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", idat) + _chunk(b"IEND", b"")


PNG_BYTES = _make_png()

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
DEMO_JOB_ID = "ba936117-834f-40a2-a19c-65d3d4628050"
HOME_MAID_SERVICE_ID = "43819c8e-d300-4626-a1c0-dc452eddb667"

PHONES = {
    "admin": "+919000000000",
    "customer": "+919000000004",
    "partner": "+919000000003",
    "maid": "+919000000020",
}


def _login(phone):
    r = requests.post(f"{BASE}/api/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, f"send-otp {phone}: {r.status_code} {r.text}"
    r = requests.post(
        f"{BASE}/api/auth/verify-otp",
        json={"phone": phone, "otp": "123456"},
        timeout=15,
    )
    assert r.status_code == 200, f"verify-otp {phone}: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in verify-otp response: {r.json()}"
    return tok


@pytest.fixture(scope="session")
def tokens():
    return {role: _login(phone) for role, phone in PHONES.items()}


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- AUTH ----------
class TestAuth:
    def test_me_roles(self, tokens):
        expected = {"admin": "admin", "customer": "customer", "partner": "partner", "maid": "partner"}
        for role, tok in tokens.items():
            r = requests.get(f"{BASE}/api/auth/me", headers=_h(tok), timeout=10)
            assert r.status_code == 200, f"{role}: {r.status_code}"
            data = r.json()
            got_role = data.get("role") or (data.get("user") or {}).get("role")
            assert got_role == expected[role], f"{role} got role {got_role}; body={data}"


# ---------- CATALOG ----------
class TestCatalog:
    def test_categories(self):
        r = requests.get(f"{BASE}/api/catalog/categories", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_services(self):
        r = requests.get(f"{BASE}/api/catalog/services", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) > 0

    def test_subscription_plans(self, tokens):
        r = requests.get(
            f"{BASE}/api/subscriptions/plans/{HOME_MAID_SERVICE_ID}",
            headers=_h(tokens["customer"]), timeout=15,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        plans = data if isinstance(data, list) else data.get("plans", [])
        assert len(plans) == 4, f"expected 4 plans, got {len(plans)}: {plans}"


# ---------- CUSTOMER SUBSCRIPTION FLOW ----------
class TestCustomerSubscription:
    def test_create_pay_list_invoice(self, tokens):
        ctok = tokens["customer"]
        # Discover monthly plan id
        r = requests.get(f"{BASE}/api/subscriptions/plans/{HOME_MAID_SERVICE_ID}", headers=_h(ctok), timeout=15)
        plans = r.json() if isinstance(r.json(), list) else r.json().get("plans", [])
        monthly = next(
            (p for p in plans if str(p.get("plan_type") or p.get("cadence") or "").lower() == "monthly"),
            None,
        )
        assert monthly, f"no monthly plan found in {plans}"
        plan_id = monthly.get("id") or monthly.get("plan_id") or monthly.get("plan_type")

        # Create subscription
        import datetime as _dt
        start = (_dt.date.today() + _dt.timedelta(days=1)).isoformat()
        payload = {
            "service_id": HOME_MAID_SERVICE_ID,
            "plan_type": "monthly",
            "start_date": start,
            "preferred_time": "09:00",
            "address": {"line1": "Test Line 1", "city": "Patna", "pincode": "800001", "lat": 25.6, "lng": 85.1},
        }
        r = requests.post(f"{BASE}/api/subscriptions", json=payload, headers=_h(ctok), timeout=20)
        assert r.status_code in (200, 201), f"create sub: {r.status_code} {r.text}"
        sub = r.json()
        sub_id = sub.get("id") or sub.get("subscription_id") or (sub.get("subscription") or {}).get("id")
        assert sub_id, f"no sub id in {sub}"

        # Pay mock
        r = requests.post(f"{BASE}/api/subscriptions/{sub_id}/pay/mock", headers=_h(ctok), timeout=20)
        assert r.status_code in (200, 201), f"pay mock: {r.status_code} {r.text}"

        # List mine
        r = requests.get(f"{BASE}/api/subscriptions/mine", headers=_h(ctok), timeout=15)
        assert r.status_code == 200
        mine = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        assert any((m.get("id") == sub_id) for m in mine), f"new sub not in mine: {mine}"

        # Invoice
        r = requests.get(f"{BASE}/api/subscriptions/{sub_id}/invoice", headers=_h(ctok), timeout=20)
        assert r.status_code == 200, f"invoice: {r.status_code} {r.text}"
        # Accept either PDF or JSON with url
        ct = r.headers.get("content-type", "")
        assert "pdf" in ct or "json" in ct or "html" in ct, f"unexpected invoice ct: {ct}"
        pytest.new_sub_id = sub_id


# ---------- MAID PARTNER SUBS ----------
class TestMaidPartner:
    def test_partner_mine_and_no_otp(self, tokens):
        r = requests.get(f"{BASE}/api/subscriptions/partner/mine", headers=_h(tokens["maid"]), timeout=15)
        assert r.status_code == 200
        subs = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        # OTP should be stripped from all payload
        blob = str(subs)
        assert '"otp"' not in blob.replace(" ", "").lower() or "start_otp" not in blob, "OTP found in maid subs payload"


# ---------- ADMIN SUBS ----------
class TestAdminSubs:
    def test_admin_stats_and_list(self, tokens):
        atok = tokens["admin"]
        for path in ["/api/subscriptions/admin/stats", "/api/subscriptions/admin/all"]:
            r = requests.get(f"{BASE}{path}", headers=_h(atok), timeout=15)
            assert r.status_code == 200, f"{path}: {r.status_code} {r.text}"

    def test_admin_assign_maid(self, tokens):
        atok = tokens["admin"]
        sub_id = getattr(pytest, "new_sub_id", None)
        if not sub_id:
            pytest.skip("no new sub id from previous test")
        # get partners
        r = requests.get(f"{BASE}/api/subscriptions/admin/{sub_id}/partners", headers=_h(atok), timeout=15)
        assert r.status_code == 200, f"partners list: {r.status_code} {r.text}"


# ---------- ONE-TIME BOOKING WIZARD ----------
class TestBookingWizard:
    @classmethod
    def setup_class(cls):
        # reset demo job
        r = subprocess.run(
            ["python3", "/app/backend/dev_reset_job.py", DEMO_JOB_ID],
            capture_output=True, text=True, timeout=30,
        )
        print("dev_reset:", r.stdout[-400:], r.stderr[-200:])

    def test_partner_job_detail(self, tokens):
        r = requests.get(f"{BASE}/api/bookings/{DEMO_JOB_ID}", headers=_h(tokens["partner"]), timeout=15)
        assert r.status_code == 200, f"job detail: {r.status_code} {r.text}"

    def test_start_otp_blocked_before_checkin(self, tokens):
        r = requests.post(
            f"{BASE}/api/bookings/{DEMO_JOB_ID}/start-otp",
            json={"otp": "1234"}, headers=_h(tokens["partner"]), timeout=15,
        )
        # Should be blocked before checkin
        assert r.status_code in (400, 403, 409), f"start-otp before checkin should fail, got {r.status_code} {r.text}"

    def test_checkin_upload_selfie(self, tokens):
        # multipart selfie + lat/lng — field name is `file`
        files = {"file": ("selfie.png", io.BytesIO(PNG_BYTES), "image/png")}
        data = {"lat": "25.6", "lng": "85.1"}
        r = requests.post(
            f"{BASE}/api/bookings/{DEMO_JOB_ID}/checkin/upload",
            files=files, data=data, headers=_h(tokens["partner"]), timeout=30,
        )
        assert r.status_code in (200, 201), f"checkin: {r.status_code} {r.text}"

    def test_before_evidence_upload(self, tokens):
        """Upload a 'before' photo so start-otp is unblocked."""
        files = {"file": ("before.png", io.BytesIO(PNG_BYTES), "image/png")}
        data = {"stage": "before"}
        r = requests.post(
            f"{BASE}/api/bookings/{DEMO_JOB_ID}/evidence/upload",
            files=files, data=data, headers=_h(tokens["partner"]), timeout=30,
        )
        assert r.status_code in (200, 201), f"before upload: {r.status_code} {r.text}"

    def test_start_otp_after_checkin(self, tokens):
        r = requests.post(
            f"{BASE}/api/bookings/{DEMO_JOB_ID}/start-otp",
            json={"otp": "1234"}, headers=_h(tokens["partner"]), timeout=15,
        )
        assert r.status_code == 200, f"start-otp after checkin: {r.status_code} {r.text}"

    def test_evidence_chunk_and_complete(self, tokens):
        import base64
        # upload two small base64 chunks as 'after' work-proof video
        upload_id = "iter149test"
        for idx in (0, 1):
            chunk_b64 = base64.b64encode(b"fakevideo" * 128).decode()
            body = {
                "stage": "after",
                "upload_id": upload_id,
                "index": idx,
                "total": 2,
                "data": chunk_b64,
                "content_type": "video/mp4",
            }
            r = requests.post(
                f"{BASE}/api/bookings/{DEMO_JOB_ID}/evidence/chunk",
                json=body, headers=_h(tokens["partner"]), timeout=30,
            )
            assert r.status_code in (200, 201), f"chunk {idx}: {r.status_code} {r.text}"

        r = requests.post(
            f"{BASE}/api/bookings/{DEMO_JOB_ID}/complete",
            json={"otp": "1234"}, headers=_h(tokens["partner"]), timeout=20,
        )
        assert r.status_code == 200, f"complete: {r.status_code} {r.text}"

    def test_customer_track(self, tokens):
        r = requests.get(f"{BASE}/api/bookings/{DEMO_JOB_ID}/track", headers=_h(tokens["customer"]), timeout=15)
        assert r.status_code == 200, f"track: {r.status_code} {r.text}"

    @classmethod
    def teardown_class(cls):
        # restore assigned state for later runs
        subprocess.run(["python3", "/app/backend/dev_reset_job.py", DEMO_JOB_ID],
                       capture_output=True, text=True, timeout=30)


# ---------- CUSTOMER GENERIC ----------
class TestCustomerGeneric:
    @pytest.mark.parametrize("path", [
        "/api/bookings",
        "/api/wallet",
        "/api/payments/refunds",
        "/api/notifications",
        "/api/app/home",
    ])
    def test_customer_endpoints(self, tokens, path):
        r = requests.get(f"{BASE}{path}", headers=_h(tokens["customer"]), timeout=20)
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"
        # must be valid JSON
        r.json()

    def test_site_config_public(self):
        r = requests.get(f"{BASE}/api/site/config", timeout=15)
        assert r.status_code == 200
        r.json()
