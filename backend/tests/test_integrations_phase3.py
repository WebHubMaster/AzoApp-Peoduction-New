"""Phase-3 tests: Fast2SMS OTP fallback, admin integrations config + secret leakage,
Razorpay dev-mock payments + authorization, Google login gating, profile editor."""
import time
import pytest
import requests
from conftest import API, PHONES, client, login

TEST_PHONE = "+919876500123"  # non-demo, auto-created customer


# ---------------- Fast2SMS OTP fallback ----------------
class TestOtpFallback:
    def test_send_otp_non_demo_returns_dev_otp(self, anon):
        r = anon.post(f"{API}/auth/send-otp", json={"phone": TEST_PHONE}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("sent") is True
        assert "dev_otp" in d, f"expected dev fallback OTP, got {d}"
        assert len(d["dev_otp"]) == 6 and d["dev_otp"].isdigit()
        assert d.get("otp_delivery") != "sms"

    def test_verify_otp_creates_customer(self, anon):
        r = anon.post(f"{API}/auth/send-otp", json={"phone": TEST_PHONE}, timeout=30)
        otp = r.json()["dev_otp"]
        v = anon.post(f"{API}/auth/verify-otp", json={"phone": TEST_PHONE, "otp": otp, "name": "TEST_QA User"}, timeout=30)
        assert v.status_code == 200, v.text
        d = v.json()
        assert d.get("token")
        assert d["user"]["role"] == "customer"
        assert d["user"]["phone"] == TEST_PHONE

    def test_wrong_otp_rejected(self, anon):
        anon.post(f"{API}/auth/send-otp", json={"phone": TEST_PHONE}, timeout=30)
        v = anon.post(f"{API}/auth/verify-otp", json={"phone": TEST_PHONE, "otp": "000000"}, timeout=30)
        assert v.status_code in (400, 401), v.text

    def test_demo_account_fixed_otp(self, anon):
        r = anon.post(f"{API}/auth/send-otp", json={"phone": PHONES["admin"]}, timeout=30)
        assert r.status_code == 200
        assert r.json().get("dev_otp") == "123456"
        v = anon.post(f"{API}/auth/verify-otp", json={"phone": PHONES["admin"], "otp": "123456"}, timeout=30)
        assert v.status_code == 200, v.text
        assert v.json()["user"]["role"] == "admin"


# ---------------- Admin integrations settings + secret leakage ----------------
class TestAdminIntegrations:
    def test_public_config_has_no_secrets(self, anon):
        r = anon.get(f"{API}/auth/config", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "auth_config" in d and "integrations" in d and "profile_fields" in d
        integ = d["integrations"]
        assert "sms_enabled" in integ
        blob = str(d).lower()
        for bad in ["fast2sms_api_key", "secret", "key_secret", "razorpay_test_key_id",
                    "razorpay_live_key_id", "google_client_secret", "demo_otp"]:
            assert bad not in blob, f"public /auth/config leaks '{bad}': {d}"

    def test_admin_can_save_and_read_fast2sms_config(self, admin, anon):
        # read current so we can restore
        cur = admin.get(f"{API}/admin/settings", timeout=30)
        assert cur.status_code == 200, cur.text
        original = cur.json().get("integrations", {})

        payload = {"integrations": {**original, "sms_enabled": True,
                                   "fast2sms_api_key": "TEST_KEY_ABC123",
                                   "fast2sms_sender_id": "AZOAPP",
                                   "fast2sms_route": "otp"}}
        up = admin.put(f"{API}/admin/settings", json=payload, timeout=30)
        assert up.status_code == 200, up.text

        got = admin.get(f"{API}/admin/settings", timeout=30).json().get("integrations", {})
        assert got.get("sms_enabled") is True
        assert got.get("fast2sms_api_key") == "TEST_KEY_ABC123"
        assert got.get("fast2sms_sender_id") == "AZOAPP"

        # public endpoint reflects flag but not the key
        pub = anon.get(f"{API}/auth/config", timeout=30).json()
        assert pub["integrations"].get("sms_enabled") is True
        assert "TEST_KEY_ABC123" not in str(pub)

        # with a bogus key configured, SMS send fails -> dev fallback still returned
        r = anon.post(f"{API}/auth/send-otp", json={"phone": TEST_PHONE}, timeout=40)
        assert r.status_code == 200, r.text
        assert "dev_otp" in r.json(), f"no dev fallback when Fast2SMS key is invalid: {r.json()}"

        # restore
        rest = admin.put(f"{API}/admin/settings", json={"integrations": original}, timeout=30)
        assert rest.status_code == 200
        restored = admin.get(f"{API}/admin/settings", timeout=30).json()["integrations"]
        assert restored.get("fast2sms_api_key") == original.get("fast2sms_api_key", "")
        assert restored.get("sms_enabled") == original.get("sms_enabled")

    def test_settings_write_requires_admin(self, customer):
        r = customer.put(f"{API}/admin/settings", json={"integrations": {"sms_enabled": True}}, timeout=30)
        assert r.status_code == 403, r.text

    def test_settings_read_requires_auth(self, anon):
        r = anon.get(f"{API}/admin/settings", timeout=30)
        assert r.status_code in (401, 403), r.text


# ---------------- Google login gating ----------------
class TestGoogleGating:
    def test_google_disabled_returns_403(self, anon):
        cfg = anon.get(f"{API}/auth/config", timeout=30).json()
        social = cfg["auth_config"].get("social_login")
        r = anon.post(f"{API}/auth/google", json={"credential": "bogus.credential.value"}, timeout=30)
        if not social:
            assert r.status_code == 403, r.text
            assert "disabled" in r.json().get("detail", "").lower()
        else:
            assert r.status_code == 400, r.text

    def test_google_enabled_no_client_id_returns_400(self, admin, anon):
        cur = admin.get(f"{API}/admin/settings", timeout=30).json()
        orig_auth = cur.get("auth_config", {})
        try:
            admin.put(f"{API}/admin/settings", json={"auth_config": {**orig_auth, "social_login": True}}, timeout=30)
            r = anon.post(f"{API}/auth/google", json={"credential": "bogus.credential.value"}, timeout=30)
            assert r.status_code == 400, r.text
            assert "not configured" in r.json().get("detail", "").lower()
            assert "token" not in r.text
        finally:
            admin.put(f"{API}/admin/settings", json={"auth_config": orig_auth}, timeout=30)

    def test_google_bogus_credential_no_session(self, admin, anon):
        cur = admin.get(f"{API}/admin/settings", timeout=30).json()
        orig_auth, orig_int = cur.get("auth_config", {}), cur.get("integrations", {})
        try:
            admin.put(f"{API}/admin/settings", json={
                "auth_config": {**orig_auth, "social_login": True},
                "integrations": {**orig_int, "google_client_id": "123456-test.apps.googleusercontent.com"},
            }, timeout=30)
            r = anon.post(f"{API}/auth/google", json={"credential": "bogus.credential.value"}, timeout=40)
            assert r.status_code == 400, r.text
            assert "invalid google credential" in r.json().get("detail", "").lower()
            assert "token" not in r.text
        finally:
            admin.put(f"{API}/admin/settings", json={"auth_config": orig_auth, "integrations": orig_int}, timeout=30)


# ---------------- Payments (Razorpay disabled -> dev mock) ----------------
class TestPayments:
    def test_wallet_order_returns_mock(self, customer):
        r = customer.post(f"{API}/payments/order", json={"purpose": "wallet", "amount": 500}, timeout=40)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("mock") is True, f"expected dev mock order, got {d}"
        assert d.get("amount") == 500
        assert d.get("purpose") == "wallet"

    def test_wallet_mock_pay_credits_wallet(self, customer):
        w0 = customer.get(f"{API}/wallet", timeout=30)
        assert w0.status_code == 200, w0.text
        before = w0.json().get("balance", 0)
        r = customer.post(f"{API}/payments/mock", json={"purpose": "wallet", "amount": 250}, timeout=40)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True and r.json().get("amount") == 250
        w1 = customer.get(f"{API}/wallet", timeout=30).json()
        assert w1.get("balance") == before + 250, f"wallet {before} -> {w1.get('balance')}"
        items = w1.get("transactions", [])
        assert any(t.get("kind") == "topup" and t.get("amount") == 250 for t in items), items[:3]

    def test_invalid_amount_rejected(self, customer):
        for amt in (0, -100):
            r = customer.post(f"{API}/payments/order", json={"purpose": "wallet", "amount": amt}, timeout=30)
            assert r.status_code == 400, f"amount={amt} -> {r.status_code} {r.text}"
        r = customer.post(f"{API}/payments/mock", json={"purpose": "wallet", "amount": 0}, timeout=30)
        assert r.status_code == 400, r.text

    def test_unknown_booking_404(self, customer):
        r = customer.post(f"{API}/payments/order", json={"purpose": "booking", "booking_id": "does-not-exist"}, timeout=30)
        assert r.status_code == 404, r.text

    def test_non_customer_roles_forbidden(self, admin, merchant, partner, anon):
        for name, c in (("admin", admin), ("merchant", merchant), ("partner", partner)):
            r = c.post(f"{API}/payments/order", json={"purpose": "wallet", "amount": 100}, timeout=30)
            assert r.status_code == 403, f"{name} allowed payments: {r.status_code} {r.text}"
            r2 = c.post(f"{API}/payments/mock", json={"purpose": "wallet", "amount": 100}, timeout=30)
            assert r2.status_code == 403, f"{name} allowed mock pay: {r2.status_code}"
        r3 = anon.post(f"{API}/payments/order", json={"purpose": "wallet", "amount": 100}, timeout=30)
        assert r3.status_code == 401, r3.text

    def test_other_customers_booking_403(self, customer, anon):
        # create a booking owned by a different customer
        tok = login(TEST_PHONE)
        other = client(tok)
        svc = anon.get(f"{API}/catalog/services", timeout=30).json()[0]
        payload = {"service_id": svc["id"],
                   "address": {"label": "Home", "line1": "TEST_1 Street", "city": "Delhi",
                               "pincode": "110001", "lat": 28.6, "lng": 77.2},
                   "schedule_type": "now", "notes": "TEST_qa"}
        cr = other.post(f"{API}/bookings", json=payload, timeout=40)
        assert cr.status_code in (200, 201), f"booking create failed: {cr.status_code} {cr.text[:300]}"
        body = cr.json()
        bid = body.get("id") or body.get("booking", {}).get("id")
        assert bid, body
        r = customer.post(f"{API}/payments/order", json={"purpose": "booking", "booking_id": bid}, timeout=30)
        assert r.status_code == 403, f"cross-customer payment allowed: {r.status_code} {r.text}"
        # own booking but not completed -> 400
        r2 = other.post(f"{API}/payments/order", json={"purpose": "booking", "booking_id": bid}, timeout=30)
        assert r2.status_code == 400, f"payment allowed on non-completed booking: {r2.status_code} {r2.text}"
        assert "completion" in r2.json().get("detail", "").lower()
        r3 = other.post(f"{API}/payments/mock", json={"purpose": "booking", "booking_id": bid}, timeout=30)
        assert r3.status_code == 400, r3.text

    def test_verify_fails_without_gateway(self, customer):
        r = customer.post(f"{API}/payments/verify", json={
            "order_id": "order_fake", "payment_id": "pay_fake", "signature": "sig_fake",
            "purpose": "wallet", "amount": 100}, timeout=30)
        assert r.status_code == 400, r.text
        assert "verification failed" in r.json().get("detail", "").lower()


# ---------------- Profile editor ----------------
class TestProfile:
    def test_update_profile_persists(self, customer):
        payload = {
            "name": "TEST_Priya Verma", "gender": "female", "dob": "1994-05-12",
            "alternate_mobile": "+919812345678", "language": "hi",
            "communication_pref": "whatsapp", "gst_number": "22AAAAA0000A1Z5",
            "company_name": "TEST_Verma Traders",
            "photo": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
        }
        r = customer.put(f"{API}/auth/profile", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k, v in payload.items():
            assert d.get(k) == v, f"{k}: expected {v!r}, got {d.get(k)!r}"
        me = customer.get(f"{API}/auth/me", timeout=30).json()
        for k, v in payload.items():
            assert me.get(k) == v, f"persistence failed for {k}"

    def test_profile_response_has_no_password_hash_or_objectid(self, customer):
        for url in (f"{API}/auth/me", ):
            d = customer.get(url, timeout=30).json()
            assert "_id" not in d
            assert "password_hash" not in d, "password_hash leaked in /auth/me"
        d = customer.put(f"{API}/auth/profile", json={"name": "TEST_Priya Verma"}, timeout=30).json()
        assert "_id" not in d
        assert "password_hash" not in d, "password_hash leaked in PUT /auth/profile"

    def test_profile_requires_auth(self, anon):
        r = anon.put(f"{API}/auth/profile", json={"name": "hack"}, timeout=30)
        assert r.status_code == 401, r.text

    def test_profile_fields_flags_exposed(self, anon):
        pf = anon.get(f"{API}/auth/config", timeout=30).json().get("profile_fields", {})
        for k in ["gender", "dob", "alternate_mobile", "language", "communication_pref", "gst", "company"]:
            assert k in pf, f"missing profile field flag {k}"


# ---------------- Booking payment via dev-mock gateway (full lifecycle) ----------------
class TestBookingPaymentLifecycle:
    state = {}

    def test_01_create_and_complete_booking(self, customer, partner, service_id):
        r = customer.post(f"{API}/bookings", json={
            "service_id": service_id,
            "address": {"label": "Home", "line": "TEST_ 9 Ring Road", "pincode": "110001", "city": "Delhi"},
            "schedule_type": "now", "notes": "TEST_pay flow"}, timeout=60)
        assert r.status_code in (200, 201), r.text
        bid = r.json()["id"]
        TestBookingPaymentLifecycle.state["id"] = bid
        TestBookingPaymentLifecycle.state["total"] = r.json()["pricing"]["total"]

        assert partner.post(f"{API}/bookings/{bid}/accept", timeout=30).status_code == 200
        otps = customer.get(f"{API}/bookings/{bid}", timeout=30).json()["otps"]
        assert partner.post(f"{API}/bookings/{bid}/start-otp", json={"otp": otps["start"]}, timeout=30).status_code == 200
        assert partner.post(f"{API}/bookings/{bid}/complete", json={"otp": otps["completion"]}, timeout=30).status_code == 200
        assert customer.get(f"{API}/bookings/{bid}", timeout=30).json()["status"] == "completed"

    def test_02_order_is_mock_with_booking_total(self, customer):
        bid = TestBookingPaymentLifecycle.state["id"]
        r = customer.post(f"{API}/payments/order", json={"purpose": "booking", "booking_id": bid}, timeout=40)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("mock") is True, d
        assert d.get("amount") == pytest.approx(TestBookingPaymentLifecycle.state["total"])

    def test_03_mock_pay_marks_paid(self, customer):
        bid = TestBookingPaymentLifecycle.state["id"]
        r = customer.post(f"{API}/payments/mock", json={"purpose": "booking", "booking_id": bid}, timeout=40)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        b = customer.get(f"{API}/bookings/{bid}", timeout=30).json()
        assert b["status"] == "paid"
        assert b.get("payment_status") == "paid"
        txns = customer.get(f"{API}/wallet", timeout=30).json()["transactions"]
        assert any(t.get("kind") == "payment" and t.get("type") == "debit" and t.get("amount") == pytest.approx(
            TestBookingPaymentLifecycle.state["total"]) for t in txns), "payment txn missing"

    def test_04_already_paid_rejected(self, customer):
        bid = TestBookingPaymentLifecycle.state["id"]
        for path in ("order", "mock"):
            r = customer.post(f"{API}/payments/{path}", json={"purpose": "booking", "booking_id": bid}, timeout=30)
            assert r.status_code == 400, f"{path}: {r.status_code} {r.text}"
            detail = r.json().get("detail", "").lower()
            # NOTE (reported): status flips to "paid" so the completed-check fires first and the
            # message says "only after service completion" instead of "Already paid" (misleading UX).
            assert "already paid" in detail or "after service completion" in detail, detail
