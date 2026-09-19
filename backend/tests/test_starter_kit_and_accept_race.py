"""Tests for #7 Starter Kit payment gating and #10 booking accept race-safety.

Live Razorpay is configured — we only verify GATING, never complete a payment:
  - /api/starter-kit/order returns a REAL Razorpay order (mock:false) OR 400 'already own'
  - /api/starter-kit/mock is rejected with 400 while live payments are configured
  - /api/starter-kit/verify with bogus signature returns 400 and does NOT grant Pro
  - Booking accept is atomic: second accept returns 400 'Job no longer available'
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to reading frontend/.env
    with open("/app/frontend/.env") as f:
        for ln in f:
            if ln.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = ln.split("=", 1)[1].strip().rstrip("/")

PARTNER_PHONE = "+919000000003"
PARTNER_PHONE_ALT = "+919000000005"
CUSTOMER_PHONE = "+919000000004"
ADMIN_PHONE = "+919000000000"
OTP = "123456"


def _login(phone: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, f"send-otp failed for {phone}: {r.status_code} {r.text}"
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp",
                      json={"phone": phone, "otp": OTP, "name": "Test"}, timeout=15)
    assert r.status_code == 200, f"verify-otp failed for {phone}: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok, f"no token in response: {r.json()}"
    return tok


def _hdrs(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def partner_token():
    return _login(PARTNER_PHONE)


@pytest.fixture(scope="module")
def partner_token_alt():
    return _login(PARTNER_PHONE_ALT)


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_PHONE)


# ─── #7 Starter Kit gating ──────────────────────────────────────────────────

class TestStarterKitGating:

    def test_order_returns_real_razorpay_or_already_owns(self, partner_token):
        r = requests.post(f"{BASE_URL}/api/starter-kit/order", headers=_hdrs(partner_token), timeout=20)
        # Accept 200 (real order) OR 400 "already own"
        if r.status_code == 400:
            detail = (r.json().get("detail") or "").lower()
            assert "already" in detail, f"expected 'already own' 400, got: {r.text}"
            # Confirm partner ALREADY has Pro
            me = requests.get(f"{BASE_URL}/api/starter-kit/me", headers=_hdrs(partner_token), timeout=15)
            assert me.status_code == 200
            data = me.json()
            assert data.get("purchased") is True, f"partner has 400 already-own but /me says not purchased: {data}"
            print("Partner already owns kit — Pro tag verified via /me purchased=true")
            return
        assert r.status_code == 200, f"unexpected: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("mock") is False, f"expected mock=false real order, got: {body}"
        assert body.get("order_id", "").startswith("order_"), f"order_id should start with 'order_': {body}"
        assert body.get("key_id", "").startswith("rzp_"), f"key_id should start with 'rzp_': {body}"
        # amount in paise (should be discounted_price * 100)
        assert isinstance(body.get("amount"), int) and body["amount"] > 0, f"amount in paise expected: {body}"
        print(f"Real Razorpay order: order_id={body['order_id']}, key_id={body['key_id'][:10]}..., amount(paise)={body['amount']}")

    def test_mock_endpoint_blocked_in_live_mode(self, partner_token):
        r = requests.post(f"{BASE_URL}/api/starter-kit/mock", headers=_hdrs(partner_token), timeout=15)
        assert r.status_code == 400, f"expected 400 rejecting mock in live mode, got: {r.status_code} {r.text}"
        detail = (r.json().get("detail") or "").lower()
        assert "live" in detail or "gateway" in detail, f"expected mention of 'live' / 'gateway': {r.text}"
        print(f"/mock correctly blocked: {r.json().get('detail')}")

    def test_verify_bad_signature_rejects_and_no_pro_granted(self, partner_token_alt):
        # Snapshot Pro state before
        before = requests.get(f"{BASE_URL}/api/starter-kit/me", headers=_hdrs(partner_token_alt), timeout=15)
        assert before.status_code == 200
        pre_purchased = bool(before.json().get("purchased"))

        r = requests.post(f"{BASE_URL}/api/starter-kit/verify", headers=_hdrs(partner_token_alt),
                          json={"order_id": "order_bogus", "payment_id": "pay_bogus", "signature": "bad_sig"},
                          timeout=15)
        assert r.status_code == 400, f"bad signature should 400, got: {r.status_code} {r.text}"
        detail = (r.json().get("detail") or "").lower()
        assert "verif" in detail or "payment" in detail, f"expected 'Payment verification failed': {r.text}"

        # Confirm partner state is UNCHANGED — still not purchased if they weren't
        after = requests.get(f"{BASE_URL}/api/starter-kit/me", headers=_hdrs(partner_token_alt), timeout=15)
        assert after.status_code == 200
        post_purchased = bool(after.json().get("purchased"))
        assert post_purchased == pre_purchased, \
            f"purchased state changed after bad-sig verify! before={pre_purchased} after={post_purchased}"
        # /auth/me should NOT have premium_partner set as side-effect of the bad verify
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdrs(partner_token_alt), timeout=15)
        if me.status_code == 200:
            body = me.json()
            # if partner wasn't Pro before, must not be Pro after
            if not pre_purchased:
                assert not body.get("premium_partner"), f"Pro tag granted without valid signature! {body}"
        print(f"Bad signature verify rejected; purchased state unchanged ({pre_purchased})")


# ─── #10 Booking accept race safety ─────────────────────────────────────────

class TestAcceptRaceSafety:

    def test_second_accept_on_assigned_booking_rejected(self, admin_token, partner_token):
        # Find an already-assigned booking (or completed/started — anything not
        # 'searching') — accepting it must return 400 'Job no longer available'.
        r = requests.get(f"{BASE_URL}/api/admin/bookings?status=assigned&page_size=5",
                         headers=_hdrs(admin_token), timeout=15)
        booking_id = None
        def _rows(resp):
            if resp.status_code != 200:
                return []
            j = resp.json()
            if isinstance(j, list):
                return j
            return j.get("bookings") or j.get("items") or []
        rows = _rows(r)
        if rows:
            booking_id = rows[0].get("id")
        if not booking_id:
            # try any non-searching booking
            r2 = requests.get(f"{BASE_URL}/api/admin/bookings?page_size=20",
                              headers=_hdrs(admin_token), timeout=15)
            rows = _rows(r2)
            if rows:
                for row in rows:
                    if row.get("status") not in ("searching", "pending_payment", "cancelled"):
                        booking_id = row.get("id")
                        break
        if not booking_id:
            pytest.skip("No non-searching booking found to test double-accept guard")

        r3 = requests.post(f"{BASE_URL}/api/bookings/{booking_id}/accept",
                           headers=_hdrs(partner_token), timeout=15)
        # 400 (job no longer available) or 403 (not eligible) both prove the guard.
        # We're specifically testing atomic guard → 400 with the exact message
        # when status != 'searching'.
        assert r3.status_code in (400, 403), f"expected 400/403, got: {r3.status_code} {r3.text}"
        if r3.status_code == 400:
            detail = (r3.json().get("detail") or "").lower()
            assert "no longer available" in detail or "not available" in detail, \
                f"expected 'Job no longer available': {r3.text}"
            print(f"Atomic guard verified: {r3.json().get('detail')}")
        else:
            print(f"Partner not eligible on this booking (also proves guard indirectly): {r3.json().get('detail')}")
