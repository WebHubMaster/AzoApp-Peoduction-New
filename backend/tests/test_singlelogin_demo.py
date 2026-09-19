"""Iteration-2 tests: single login (role from DB), demo mode gating, AI payload, security regressions."""
import time
import pytest
from conftest import API, PHONES, login, client


# ---------------- Single login: role auto-detected from phone ----------------
class TestSingleLogin:
    @pytest.mark.parametrize("role,phone", [
        ("admin", PHONES["admin"]),
        ("merchant", PHONES["merchant"]),
        ("partner", PHONES["partner"]),
        ("customer", PHONES["customer"]),
    ])
    def test_seeded_phone_maps_to_role(self, anon, role, phone):
        r = anon.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=30)
        assert r.status_code == 200, r.text
        otp = r.json()["dev_otp"]
        v = anon.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": otp}, timeout=30)
        assert v.status_code == 200, v.text
        d = v.json()
        assert d["user"]["role"] == role, f"{phone} resolved to {d['user']['role']} not {role}"
        assert d["user"]["phone"] == phone
        assert isinstance(d.get("token"), str) and d["token"]
        assert "_id" not in d["user"]

    def test_new_phone_becomes_customer_only(self, anon):
        phone = "+9198111" + str(int(time.time()))[-5:]
        o = anon.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=30)
        assert o.status_code == 200, o.text
        v = anon.post(f"{API}/auth/verify-otp",
                      json={"phone": phone, "otp": o.json()["dev_otp"], "name": "TEST_New"}, timeout=30)
        assert v.status_code == 200, v.text
        assert v.json()["user"]["role"] == "customer", v.json()["user"]

    def test_client_supplied_role_is_ignored(self, anon):
        """Privilege escalation regression: 'role':'admin' in payload must not grant admin."""
        phone = "+9198222" + str(int(time.time()))[-5:]
        o = anon.post(f"{API}/auth/send-otp", json={"phone": phone, "role": "admin"}, timeout=30)
        assert o.status_code == 200, o.text
        v = anon.post(f"{API}/auth/verify-otp",
                      json={"phone": phone, "otp": o.json()["dev_otp"], "role": "admin"}, timeout=30)
        assert v.status_code == 200, v.text
        assert v.json()["user"]["role"] == "customer", "CRITICAL: role field honoured"
        c = client(v.json()["token"])
        assert c.get(f"{API}/admin/dashboard", timeout=30).status_code == 403
        assert c.put(f"{API}/admin/settings", json={"platform_commission_pct": 99}, timeout=30).status_code == 403


# ---------------- Demo mode ON/OFF gating ----------------
class TestDemoMode:
    def test_01_demo_status_on(self, anon):
        r = anon.get(f"{API}/auth/demo-status", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["demo_mode"] is True, d
        accounts = d["accounts"]
        assert len(accounts) == 4, f"expected 4 demo accounts, got {len(accounts)}: {accounts}"
        assert {a["role"] for a in accounts} == {"customer", "partner", "merchant", "admin"}
        assert all(a["otp"] == "123456" for a in accounts), accounts

    def test_02_demo_fixed_otp_login_works(self, anon):
        for phone in (PHONES["admin"], PHONES["customer"]):
            anon.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=30)
            v = anon.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": "123456"}, timeout=30)
            assert v.status_code == 200, f"{phone}: {v.status_code} {v.text[:200]}"

    def test_03_toggle_off_blocks_demo_login_then_restore(self, admin, anon):
        try:
            u = admin.put(f"{API}/admin/settings", json={"demo_mode": False}, timeout=30)
            assert u.status_code == 200, u.text
            st = anon.get(f"{API}/auth/demo-status", timeout=30).json()
            assert st["demo_mode"] is False, st
            assert st["accounts"] == [], st
            v = anon.post(f"{API}/auth/verify-otp",
                          json={"phone": PHONES["customer"], "otp": "123456"}, timeout=30)
            assert v.status_code == 403, f"demo login still worked with demo_mode OFF: {v.status_code} {v.text[:200]}"
            assert "demo" in v.text.lower()
        finally:
            back = admin.put(f"{API}/admin/settings", json={"demo_mode": True}, timeout=30)
            assert back.status_code == 200, back.text
            assert anon.get(f"{API}/auth/demo-status", timeout=30).json()["demo_mode"] is True

    def test_04_demo_login_restored(self, anon):
        v = anon.post(f"{API}/auth/verify-otp",
                      json={"phone": PHONES["partner"], "otp": "123456"}, timeout=30)
        assert v.status_code == 200, v.text
        assert v.json()["user"]["role"] == "partner"


# ---------------- AI chat payload contract ----------------
class TestAIChatV2:
    def test_first_turn_no_session_id(self, customer):
        r = customer.post(f"{API}/ai/chat", json={"message": "mere AC me cooling nahi hai"}, timeout=180)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        d = r.json()
        reply = d.get("reply") or ""
        assert len(reply.strip()) > 5, f"empty reply: {d}"
        TestAIChatV2.sid = d.get("session_id")

    def test_second_turn_with_session_id(self, customer):
        sid = getattr(TestAIChatV2, "sid", None) or "test-session-1"
        r = customer.post(f"{API}/ai/chat", json={"message": "kitna kharcha aayega?", "session_id": sid}, timeout=180)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        assert (r.json().get("reply") or "").strip()

    def test_admin_chat(self, admin):
        r = admin.post(f"{API}/ai/chat", json={"message": "give me business insights"}, timeout=180)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        assert (r.json().get("reply") or "").strip()


# ---------------- Booking ownership / money-flow security regressions ----------------
class TestSecurityRegressionV2:
    st = {}

    def test_00_setup_assigned_booking(self, customer, partner, service_id):
        r = customer.post(f"{API}/bookings", json={
            "service_id": service_id,
            "address": {"label": "Home", "line": "TEST_ sec v2", "pincode": "110001", "city": "Delhi"},
            "schedule_type": "now", "notes": "TEST_secv2"}, timeout=60)
        assert r.status_code in (200, 201), r.text
        b = r.json()
        TestSecurityRegressionV2.st["id"] = b["id"]
        TestSecurityRegressionV2.st["otps"] = customer.get(
            f"{API}/bookings/{b['id']}", timeout=30).json().get("otps", {})
        assert TestSecurityRegressionV2.st["otps"].get("start")
        acc = partner.post(f"{API}/bookings/{b['id']}/accept", timeout=30)
        assert acc.status_code == 200, acc.text

    def test_01_foreign_user_403_on_get(self):
        bid = TestSecurityRegressionV2.st["id"]
        c = client(login("+919111100077"))
        r = c.get(f"{API}/bookings/{bid}", timeout=30)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text[:200]}"

    def test_02_otp_whitelist_by_role(self, customer, partner, merchant):
        bid = TestSecurityRegressionV2.st["id"]
        p = partner.get(f"{API}/bookings/{bid}", timeout=30).json()
        assert not p.get("otps"), f"partner sees OTPs: {p.get('otps')}"
        c = customer.get(f"{API}/bookings/{bid}", timeout=30).json()
        assert c["otps"].get("start") and c["otps"].get("completion")
        assert not c["otps"].get("shop"), "direct booking exposes shop OTP to customer"
        # unrelated merchant must not read this direct booking at all
        m = merchant.get(f"{API}/bookings/{bid}", timeout=30)
        assert m.status_code == 403, f"unrelated merchant read booking ({m.status_code})"

    def test_03_foreign_partner_403_on_money_endpoints(self):
        bid = TestSecurityRegressionV2.st["id"]
        otps = TestSecurityRegressionV2.st["otps"]
        p2 = client(login(PHONES["partner2"]))
        for path, payload in [("start-otp", {"otp": otps["start"]}),
                              ("shop-otp", {"otp": otps.get("shop", "123456")}),
                              ("evidence", {"stage": "before", "images": ["x"], "notes": "TEST"}),
                              ("complete", {"otp": otps["completion"]})]:
            r = p2.post(f"{API}/bookings/{bid}/{path}", json=payload, timeout=30)
            assert r.status_code == 403, f"/{path} allowed for foreign partner ({r.status_code})"

    def test_04_pay_requires_completed_status(self, customer):
        bid = TestSecurityRegressionV2.st["id"]
        r = customer.post(f"{API}/payments/mock", json={"purpose": "booking", "booking_id": bid}, timeout=30)
        assert r.status_code == 400, f"pay allowed on assigned booking ({r.status_code})"

    def test_05_review_requires_completed(self, customer):
        bid = TestSecurityRegressionV2.st["id"]
        r = customer.post(f"{API}/bookings/{bid}/review", json={"rating": 5}, timeout=30)
        assert r.status_code in (400, 403), f"review allowed pre-completion ({r.status_code})"

    def test_06_complete_flow_then_pay_idempotent_and_review_once(self, customer, partner):
        bid = TestSecurityRegressionV2.st["id"]
        otps = TestSecurityRegressionV2.st["otps"]
        assert partner.post(f"{API}/bookings/{bid}/start-otp", json={"otp": otps["start"]}, timeout=30).status_code == 200
        r = partner.post(f"{API}/bookings/{bid}/complete", json={"otp": otps["completion"]}, timeout=30)
        assert r.status_code == 200, r.text
        # foreign customer cannot pay
        fc = client(login("+919111100088"))
        assert fc.post(f"{API}/payments/mock", json={"purpose": "booking", "booking_id": bid}, timeout=30).status_code in (403, 404)
        p1 = customer.post(f"{API}/payments/mock", json={"purpose": "booking", "booking_id": bid}, timeout=30)
        assert p1.status_code == 200, p1.text
        p2 = customer.post(f"{API}/payments/mock", json={"purpose": "booking", "booking_id": bid}, timeout=30)
        assert p2.status_code == 400, f"double pay allowed ({p2.status_code})"
        # rating bounds
        for bad in (99, 0, -3):
            rb = customer.post(f"{API}/bookings/{bid}/review", json={"rating": bad}, timeout=30)
            assert rb.status_code == 422, f"rating={bad} accepted ({rb.status_code})"
        ok = customer.post(f"{API}/bookings/{bid}/review", json={"rating": 4, "comment": "TEST_ok"}, timeout=30)
        assert ok.status_code == 200, ok.text
        dup = customer.post(f"{API}/bookings/{bid}/review", json={"rating": 1}, timeout=30)
        assert dup.status_code == 400, f"duplicate review allowed ({dup.status_code})"

    def test_07_partner_rating_bounded(self, admin):
        partners = admin.get(f"{API}/admin/users", params={"role": "partner"}, timeout=30).json()
        for p in partners:
            assert 0 <= p.get("rating", 5) <= 5, f"{p.get('name')} rating {p.get('rating')}"

    def test_08_atomic_accept(self, customer, service_id):
        b = customer.post(f"{API}/bookings", json={
            "service_id": service_id,
            "address": {"line": "TEST_ atomic", "pincode": "110001", "city": "Delhi"},
            "schedule_type": "now"}, timeout=60)
        assert b.status_code in (200, 201), b.text
        bid = b.json()["id"]
        p1 = client(login(PHONES["partner"]))
        p2 = client(login(PHONES["partner2"]))
        r1 = p1.post(f"{API}/bookings/{bid}/accept", timeout=30)
        r2 = p2.post(f"{API}/bookings/{bid}/accept", timeout=30)
        assert r1.status_code == 200, r1.text
        # second claim must be rejected: 400 (already claimed) or 403 (ineligible partner)
        assert r2.status_code in (400, 403), f"non-atomic accept: second partner got {r2.status_code}"
        # same partner re-accepting hits the atomic guard -> 400
        r3 = p1.post(f"{API}/bookings/{bid}/accept", timeout=30)
        assert r3.status_code == 400, f"re-accept allowed ({r3.status_code})"

    def test_09_wallet_topup_bounds(self, customer):
        for bad in (0, -50):
            r = customer.post(f"{API}/payments/mock", json={"purpose": "wallet", "amount": bad}, timeout=30)
            assert r.status_code in (400, 422), f"topup {bad} -> {r.status_code}"

    def test_10_role_guards(self, partner, customer, service_id):
        for path in ("/admin/dashboard", "/admin/settings", "/admin/ledger"):
            assert partner.get(f"{API}{path}", timeout=30).status_code == 403, path
        r = customer.post(f"{API}/bookings/merchant", json={
            "customer_phone": PHONES["customer"], "service_id": service_id,
            "address": {"line": "x", "pincode": "110001"}}, timeout=30)
        assert r.status_code == 403, r.status_code
