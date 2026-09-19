"""AzoApp backend regression suite: auth, catalog, bookings, referral, wallet, admin, AI, role guards."""
import time
import pytest
from conftest import API, PHONES, login, client


# ---------------- Health / root ----------------
class TestHealth:
    def test_root(self, anon):
        r = anon.get(f"{API}/", timeout=30)
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


# ---------------- Auth ----------------
class TestAuth:
    @pytest.mark.parametrize("role", ["admin", "merchant", "partner", "customer"])
    def test_send_and_verify_otp_all_roles(self, anon, role):
        phone = PHONES[role]
        r = anon.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "dev_otp" in body and len(str(body["dev_otp"])) >= 4
        v = anon.post(f"{API}/auth/verify-otp",
                      json={"phone": phone, "otp": body["dev_otp"]}, timeout=30)
        assert v.status_code == 200, v.text
        d = v.json()
        assert isinstance(d.get("token"), str) and d["token"]
        assert d["user"]["phone"] == phone
        assert d["user"]["role"] == role
        assert "_id" not in d["user"]

    def test_verify_wrong_otp_rejected(self, anon):
        anon.post(f"{API}/auth/send-otp", json={"phone": PHONES["customer"]}, timeout=30)
        v = anon.post(f"{API}/auth/verify-otp",
                      json={"phone": PHONES["customer"], "otp": "000000"}, timeout=30)
        assert v.status_code in (400, 401), f"wrong OTP accepted: {v.status_code} {v.text[:200]}"

    def test_me(self, customer):
        r = customer.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 200
        assert r.json()["role"] == "customer"
        assert "_id" not in r.json()

    def test_me_without_token(self, anon):
        r = anon.get(f"{API}/auth/me", timeout=30)
        assert r.status_code in (401, 403), r.status_code

    def test_me_bad_token(self):
        c = client("garbage.token.value")
        r = c.get(f"{API}/auth/me", timeout=30)
        assert r.status_code in (401, 403), r.status_code

    def test_role_from_db_not_client(self, anon):
        """Single login: client-supplied role must be ignored; DB role wins."""
        r = anon.post(f"{API}/auth/send-otp", json={"phone": PHONES["admin"], "role": "customer"}, timeout=30)
        assert r.status_code == 200, r.text
        v = anon.post(f"{API}/auth/verify-otp", json={
            "phone": PHONES["admin"], "otp": r.json()["dev_otp"], "role": "customer"}, timeout=30)
        assert v.status_code == 200, v.text
        assert v.json()["user"]["role"] == "admin", "seeded admin phone did not resolve to admin"


# ---------------- Catalog ----------------
class TestCatalog:
    def test_categories_seeded(self, anon):
        r = anon.get(f"{API}/catalog/categories", timeout=30)
        assert r.status_code == 200
        cats = r.json()
        assert isinstance(cats, list) and len(cats) >= 6, f"expected >=6 categories, got {len(cats)}"
        assert all("_id" not in c for c in cats)
        assert all(c.get("name") for c in cats)

    def test_services(self, anon):
        r = anon.get(f"{API}/catalog/services", timeout=30)
        assert r.status_code == 200
        svcs = r.json()
        assert len(svcs) > 0
        assert all("_id" not in s for s in svcs)
        assert all(isinstance(s.get("base_price"), (int, float)) for s in svcs)

    def test_services_filter_by_category(self, anon):
        cat = anon.get(f"{API}/catalog/categories", timeout=30).json()[0]
        r = anon.get(f"{API}/catalog/services", params={"category_id": cat["id"]}, timeout=30)
        assert r.status_code == 200
        for s in r.json():
            assert s["category_id"] == cat["id"]

    def test_service_detail(self, anon, service_id):
        r = anon.get(f"{API}/catalog/services/{service_id}", timeout=30)
        assert r.status_code == 200
        assert r.json()["id"] == service_id

    def test_service_detail_404(self, anon):
        r = anon.get(f"{API}/catalog/services/does-not-exist", timeout=30)
        assert r.status_code == 404, f"expected 404, got {r.status_code}"

    def test_create_category_requires_admin(self, customer):
        r = customer.post(f"{API}/catalog/categories", json={"name": "TEST_cat"}, timeout=30)
        assert r.status_code == 403, r.status_code


# ---------------- Pricing / quote ----------------
class TestQuote:
    def test_quote_basic(self, anon, service_id):
        r = anon.get(f"{API}/bookings/quote",
                     params={"service_id": service_id, "schedule_type": "now"}, timeout=30)
        assert r.status_code == 200, r.text
        q = r.json()["pricing"]
        assert q["total"] > 0 and q["base"] > 0
        assert q["commissionable_base"] > 0

    def test_quote_coupon_azo50_capped(self, anon, service_id):
        plain = anon.get(f"{API}/bookings/quote", params={"service_id": service_id}, timeout=30).json()["pricing"]
        r = anon.get(f"{API}/bookings/quote",
                     params={"service_id": service_id, "coupon_code": "AZO50"}, timeout=30)
        assert r.status_code == 200, r.text
        q = r.json()["pricing"]
        disc = q.get("discount", 0)
        assert disc > 0, f"AZO50 gave no discount: {q}"
        assert disc <= 150.0001, f"discount not capped at 150: {disc}"
        assert q["total"] < plain["total"]

    def test_quote_emergency_surcharge(self, anon, service_id):
        now = anon.get(f"{API}/bookings/quote", params={"service_id": service_id, "schedule_type": "now"}, timeout=30).json()["pricing"]
        em = anon.get(f"{API}/bookings/quote", params={"service_id": service_id, "schedule_type": "emergency"}, timeout=30).json()["pricing"]
        assert em["total"] >= now["total"], f"emergency not >= now: {em['total']} vs {now['total']}"

    def test_quote_invalid_service(self, anon):
        r = anon.get(f"{API}/bookings/quote", params={"service_id": "bogus"}, timeout=30)
        assert r.status_code in (400, 404), r.status_code

    def test_quote_invalid_coupon(self, anon, service_id):
        r = anon.get(f"{API}/bookings/quote",
                     params={"service_id": service_id, "coupon_code": "NOPE_INVALID"}, timeout=30)
        assert r.status_code in (200, 400)
        if r.status_code == 200:
            assert r.json()["pricing"]["discount"] == 0
            assert r.json()["coupon_applied"] is False


# ---------------- Direct booking full lifecycle + commission ----------------
class TestDirectBookingFlow:
    state = {}

    def test_01_create_booking(self, customer, service_id):
        r = customer.post(f"{API}/bookings", json={
            "service_id": service_id,
            "address": {"label": "Home", "line": "TEST_ 12 MG Road", "pincode": "110001", "city": "Delhi"},
            "schedule_type": "now",
            "notes": "TEST_direct flow",
        }, timeout=60)
        assert r.status_code in (200, 201), r.text
        b = r.json()
        assert b["status"] == "searching", b["status"]
        assert "_id" not in b
        TestDirectBookingFlow.state["id"] = b["id"]
        TestDirectBookingFlow.state["total"] = b.get("pricing", {}).get("total") or b.get("total")

    def test_02_partner_sees_job(self, partner):
        r = partner.get(f"{API}/bookings/partner/jobs", timeout=30)
        assert r.status_code == 200, f"partner/jobs failed {r.status_code}: {r.text[:300]}"
        jobs = r.json()
        assert isinstance(jobs, list), f"expected list, got {type(jobs)}: {str(jobs)[:200]}"
        ids = [j["id"] for j in jobs]
        assert TestDirectBookingFlow.state["id"] in ids, "new searching booking not broadcast to eligible partner"

    def test_03_accept(self, partner):
        bid = TestDirectBookingFlow.state["id"]
        r = partner.post(f"{API}/bookings/{bid}/accept", timeout=30)
        assert r.status_code == 200, r.text
        g = partner.get(f"{API}/bookings/{bid}", timeout=30)
        assert g.status_code == 200
        assert g.json()["status"] == "assigned"

    def test_04_otps_hidden_from_partner_visible_to_customer(self, partner, customer):
        bid = TestDirectBookingFlow.state["id"]
        p = partner.get(f"{API}/bookings/{bid}", timeout=30).json()
        assert not p.get("otps"), f"SECURITY: partner can see OTPs: {p.get('otps')}"
        c = customer.get(f"{API}/bookings/{bid}", timeout=30).json()
        assert c.get("otps", {}).get("start"), "customer cannot see start OTP"
        TestDirectBookingFlow.state["otps"] = c["otps"]

    def test_05_wrong_start_otp_rejected(self, partner):
        bid = TestDirectBookingFlow.state["id"]
        r = partner.post(f"{API}/bookings/{bid}/start-otp", json={"otp": "999999"}, timeout=30)
        assert r.status_code in (400, 401, 403), f"wrong OTP accepted: {r.status_code}"

    def test_06_start_and_evidence(self, partner):
        bid = TestDirectBookingFlow.state["id"]
        otps = TestDirectBookingFlow.state["otps"]
        r = partner.post(f"{API}/bookings/{bid}/start-otp", json={"otp": otps["start"]}, timeout=30)
        assert r.status_code == 200, r.text
        e = partner.post(f"{API}/bookings/{bid}/evidence",
                         json={"stage": "before", "images": ["data:image/png;base64,iVBORw0KGgo="], "notes": "TEST_before"},
                         timeout=30)
        assert e.status_code == 200, e.text

    def test_07_complete_and_commission_split(self, partner, customer, admin):
        bid = TestDirectBookingFlow.state["id"]
        otps = TestDirectBookingFlow.state["otps"]
        r = partner.post(f"{API}/bookings/{bid}/complete", json={"otp": otps["completion"]}, timeout=30)
        assert r.status_code == 200, r.text
        b = customer.get(f"{API}/bookings/{bid}", timeout=30).json()
        assert b["status"] == "completed", b["status"]
        # commission ledger
        led = admin.get(f"{API}/admin/ledger", timeout=30)
        assert led.status_code == 200, led.text
        entries = [e for e in led.json() if e.get("booking_id") == bid]
        assert len(entries) == 1, f"expected 1 ledger row, got {len(entries)}"
        led_row = entries[0]
        assert led_row["partner_earning"] > 0, f"no partner earning: {led_row}"
        assert led_row["platform_earning"] > 0, f"no platform earning: {led_row}"
        assert led_row["merchant_referral"] > 0, \
            f"merchant lifetime referral not credited for referred partner: {led_row}"
        assert led_row.get("merchant_booking", 0) == 0, "direct booking must not pay merchant_booking"
        assert "_id" not in led_row
        TestDirectBookingFlow.state["ledger"] = led_row

    def test_08_commission_math(self, admin, customer):
        led_row = TestDirectBookingFlow.state.get("ledger")
        s = admin.get(f"{API}/admin/settings", timeout=30).json()
        b = customer.get(f"{API}/bookings/{TestDirectBookingFlow.state['id']}", timeout=30).json()
        base = b["pricing"]["commissionable_base"]
        assert led_row["partner_earning"] == pytest.approx(
            round(base * s["partner_commission_pct"] / 100, 2)), \
            f"partner earning wrong: {led_row['partner_earning']} on base {base}"
        assert led_row["platform_earning"] == pytest.approx(
            round(base * s["platform_commission_pct"] / 100, 2))
        ref_base = {"partner_earning": led_row["partner_earning"],
                    "gross_booking": led_row["gross"],
                    "platform_commission": led_row["platform_earning"]}[s.get("referral_base", "partner_earning")]
        assert led_row["merchant_referral"] == pytest.approx(
            round(ref_base * s["merchant_referral_pct"] / 100, 2))

    def test_08b_partner_wallet_credited(self, partner):
        led_row = TestDirectBookingFlow.state.get("ledger")
        txns = partner.get(f"{API}/wallet", timeout=30).json()["transactions"]
        assert any(t.get("amount") == pytest.approx(led_row["partner_earning"]) and t.get("kind") == "earning"
                   for t in txns), "partner wallet not credited with earning txn"

    def test_09_pay(self, customer):
        bid = TestDirectBookingFlow.state["id"]
        r = customer.post(f"{API}/payments/mock", json={"purpose": "booking", "booking_id": bid}, timeout=30)
        assert r.status_code == 200, r.text
        assert customer.get(f"{API}/bookings/{bid}", timeout=30).json()["status"] == "paid"

    def test_10_review(self, customer):
        bid = TestDirectBookingFlow.state["id"]
        r = customer.post(f"{API}/bookings/{bid}/review", json={"rating": 5, "comment": "TEST_great"}, timeout=30)
        assert r.status_code == 200, r.text

    def test_11_list_bookings(self, customer):
        r = customer.get(f"{API}/bookings", timeout=30)
        assert r.status_code == 200
        assert TestDirectBookingFlow.state["id"] in [b["id"] for b in r.json()]

    def test_12_other_customer_cannot_read_booking(self):
        tok = login("+919111100022", "customer")
        c = client(tok)
        r = c.get(f"{API}/bookings/{TestDirectBookingFlow.state['id']}", timeout=30)
        assert r.status_code in (403, 404), f"SECURITY: foreign customer read booking ({r.status_code})"


# ---------------- Merchant-assisted booking ----------------
class TestMerchantBooking:
    state = {}

    def test_01_create(self, merchant, service_id):
        r = merchant.post(f"{API}/bookings/merchant", json={
            "customer_phone": PHONES["customer"],
            "customer_name": "Priya Verma",
            "service_id": service_id,
            "address": {"label": "Home", "line": "TEST_ 44 Shop Lane", "pincode": "110001", "city": "Delhi"},
            "schedule_type": "now",
            "problem": "TEST_ AC not cooling",
        }, timeout=60)
        assert r.status_code in (200, 201), r.text
        b = r.json()
        TestMerchantBooking.state["id"] = b["id"]
        assert b.get("source") in ("merchant", "merchant_assisted", None)
        assert b.get("otps", {}).get("shop"), f"no shop OTP on merchant booking: {b.get('otps')}"
        TestMerchantBooking.state["otps"] = b["otps"]

    def test_02_partner_accept(self, partner):
        bid = TestMerchantBooking.state["id"]
        jobs = partner.get(f"{API}/bookings/partner/jobs", timeout=30).json()
        assert bid in [j["id"] for j in jobs], "merchant booking not visible to partner"
        r = partner.post(f"{API}/bookings/{bid}/accept", timeout=30)
        assert r.status_code == 200, r.text

    def test_03_shop_otp(self, partner, merchant):
        bid = TestMerchantBooking.state["id"]
        otps = merchant.get(f"{API}/bookings/{bid}", timeout=30).json()["otps"]
        bad = partner.post(f"{API}/bookings/{bid}/shop-otp", json={"otp": "111111"}, timeout=30)
        assert bad.status_code in (400, 401, 403), "wrong shop OTP accepted"
        r = partner.post(f"{API}/bookings/{bid}/shop-otp", json={"otp": otps["shop"]}, timeout=30)
        assert r.status_code == 200, r.text
        assert merchant.get(f"{API}/bookings/{bid}", timeout=30).json()["status"] == "arrived_shop"
        TestMerchantBooking.state["otps"] = otps

    def test_04_start_and_complete(self, partner, merchant, customer):
        bid = TestMerchantBooking.state["id"]
        # start/completion OTPs are only visible to the customer (merchant sees shop only)
        cust_otps = customer.get(f"{API}/bookings/{bid}", timeout=30).json()["otps"]
        assert cust_otps.get("start") and cust_otps.get("completion"), cust_otps
        r = partner.post(f"{API}/bookings/{bid}/start-otp", json={"otp": cust_otps["start"]}, timeout=30)
        assert r.status_code == 200, r.text
        r = partner.post(f"{API}/bookings/{bid}/complete", json={"otp": cust_otps["completion"]}, timeout=30)
        assert r.status_code == 200, r.text
        assert merchant.get(f"{API}/bookings/{bid}", timeout=30).json()["status"] == "completed"

    def test_05_merchant_booking_commission_credited(self, admin):
        bid = TestMerchantBooking.state["id"]
        entries = [e for e in admin.get(f"{API}/admin/ledger", timeout=30).json()
                   if e.get("booking_id") == bid]
        assert len(entries) == 1, f"expected 1 ledger row, got {len(entries)}"
        row = entries[0]
        assert row.get("merchant_booking", 0) > 0, f"merchant_booking commission not credited: {row}"
        assert row.get("merchant_id"), "merchant_id not stamped on ledger"
        assert row["partner_earning"] > 0 and row["platform_earning"] > 0
        assert row["merchant_referral"] > 0, "lifetime referral missing on merchant-assisted job"


# ---------------- Merchant referral ----------------
class TestMerchantReferral:
    def test_dashboard_lifetime_earning(self, merchant):
        r = merchant.get(f"{API}/merchant/dashboard", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "lifetime_referral_earning" in d, f"keys: {list(d.keys())}"
        assert d["lifetime_referral_earning"] > 0, "lifetime referral not credited after referred partner job"

    def test_referrals_list(self, merchant):
        r = merchant.get(f"{API}/merchant/referrals", timeout=30)
        assert r.status_code == 200
        refs = r.json()
        assert isinstance(refs, list) and len(refs) >= 1
        assert PHONES["partner"] in [x.get("partner_phone") for x in refs]
        assert all("_id" not in x for x in refs)

    def test_onboard_partner(self, merchant):
        phone = "+9199888" + str(int(time.time()))[-5:]
        r = merchant.post(f"{API}/merchant/onboard-partner", json={
            "phone": phone, "name": "TEST_ Onboarded Partner",
            "skills": ["ac"], "service_pincodes": ["110001"]}, timeout=30)
        assert r.status_code in (200, 201), r.text
        p = r.json()
        pid = p.get("id") or p.get("partner", {}).get("id")
        assert pid
        # verify linkage via referrals list
        refs = merchant.get(f"{API}/merchant/referrals", timeout=30).json()
        assert phone in [x.get("partner_phone") for x in refs], "onboarded partner not linked to merchant"
        TestMerchantReferral.new_partner_phone = phone

    def test_already_referred_partner_rejected(self, merchant):
        """An already-referred partner cannot be onboarded again."""
        m2 = merchant
        r = m2.post(f"{API}/merchant/onboard-partner", json={
            "phone": PHONES["partner"], "name": "Raj Kumar", "skills": ["ac"]}, timeout=30)
        assert r.status_code == 400, f"expected 400 for re-referral, got {r.status_code}: {r.text[:200]}"

    def test_customer_cannot_access_merchant_dashboard(self, customer):
        assert customer.get(f"{API}/merchant/dashboard", timeout=30).status_code == 403

    def test_customer_cannot_create_merchant_booking(self, customer, service_id):
        r = customer.post(f"{API}/bookings/merchant", json={
            "customer_phone": PHONES["customer"], "service_id": service_id,
            "address": {"line": "x", "pincode": "110001"}}, timeout=30)
        assert r.status_code == 403, r.status_code


# ---------------- Wallet ----------------
class TestWallet:
    def test_get_wallet(self, customer):
        r = customer.get(f"{API}/wallet", timeout=30)
        assert r.status_code == 200, r.text
        w = r.json()
        assert "balance" in w and isinstance(w["balance"], (int, float))
        assert isinstance(w.get("transactions"), list)

    def test_topup_increases_balance(self, customer):
        before = customer.get(f"{API}/wallet", timeout=30).json()["balance"]
        r = customer.post(f"{API}/payments/mock", json={"purpose": "wallet", "amount": 500}, timeout=30)
        assert r.status_code == 200, r.text
        after = customer.get(f"{API}/wallet", timeout=30).json()["balance"]
        assert after == pytest.approx(before + 500), f"{before} -> {after}"
        txns = customer.get(f"{API}/wallet", timeout=30).json()["transactions"]
        assert any(t.get("amount") == 500 for t in txns), "topup txn not recorded"

    def test_topup_negative_amount_rejected(self, customer):
        r = customer.post(f"{API}/payments/mock", json={"purpose": "wallet", "amount": -1000}, timeout=30)
        assert r.status_code in (400, 422), f"negative topup accepted: {r.status_code}"

    def test_partner_earnings(self, partner):
        r = partner.get(f"{API}/wallet/partner/earnings", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d, dict) and len(d) > 0

    def test_partner_earnings_role_guard(self, customer):
        assert customer.get(f"{API}/wallet/partner/earnings", timeout=30).status_code == 403


# ---------------- Admin ----------------
class TestAdmin:
    def test_dashboard(self, admin):
        r = admin.get(f"{API}/admin/dashboard", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("gmv", "platform_revenue"):
            assert k in d, f"missing KPI {k}: {list(d.keys())}"
        assert d["gmv"] > 0

    def test_bookings(self, admin):
        r = admin.get(f"{API}/admin/bookings", timeout=30)
        assert r.status_code == 200
        assert len(r.json()) > 0
        assert all("_id" not in b for b in r.json())

    def test_bookings_status_filter(self, admin):
        r = admin.get(f"{API}/admin/bookings", params={"status": "completed"}, timeout=30)
        assert r.status_code == 200
        assert all(b["status"] == "completed" for b in r.json())

    def test_users_by_role(self, admin):
        r = admin.get(f"{API}/admin/users", params={"role": "partner"}, timeout=30)
        assert r.status_code == 200
        users = r.json()
        assert users and all(u["role"] == "partner" for u in users)
        assert all("_id" not in u for u in users)

    def test_kyc_approve(self, admin):
        users = admin.get(f"{API}/admin/users", params={"role": "partner"}, timeout=30).json()
        target = next((u for u in users if u.get("kyc_status") != "approved"), users[0])
        r = admin.post(f"{API}/admin/kyc/{target['id']}", params={"status": "approved"}, timeout=30)
        assert r.status_code == 200, r.text
        after = admin.get(f"{API}/admin/users", params={"role": "partner"}, timeout=30).json()
        assert next(u for u in after if u["id"] == target["id"])["kyc_status"] == "approved"

    def test_settings_update_persists(self, admin):
        orig = admin.get(f"{API}/admin/settings", timeout=30)
        assert orig.status_code == 200, orig.text
        o = orig.json()
        assert "platform_commission_pct" in o
        try:
            u = admin.put(f"{API}/admin/settings", json={"platform_commission_pct": 30.0}, timeout=30)
            assert u.status_code == 200, u.text
            got = admin.get(f"{API}/admin/settings", timeout=30).json()
            assert got["platform_commission_pct"] == 30.0
            # other fields untouched
            assert got["gst_pct"] == o["gst_pct"]
        finally:
            admin.put(f"{API}/admin/settings",
                      json={"platform_commission_pct": o["platform_commission_pct"]}, timeout=30)
            back = admin.get(f"{API}/admin/settings", timeout=30).json()
            assert back["platform_commission_pct"] == o["platform_commission_pct"]

    def test_coupons_crud(self, admin):
        code = "TEST_C" + str(int(time.time()))[-5:]
        r = admin.post(f"{API}/admin/coupons", json={
            "code": code, "discount_type": "percentage", "discount_value": 20,
            "min_order": 100, "max_discount": 50}, timeout=30)
        assert r.status_code in (200, 201), r.text
        lst = admin.get(f"{API}/admin/coupons", timeout=30)
        assert lst.status_code == 200
        assert code in [c["code"] for c in lst.json()]

    def test_ledger(self, admin):
        r = admin.get(f"{API}/admin/ledger", timeout=30)
        assert r.status_code == 200
        assert len(r.json()) > 0
        assert all("_id" not in e for e in r.json())

    @pytest.mark.parametrize("path", ["/admin/dashboard", "/admin/settings", "/admin/users",
                                      "/admin/bookings", "/admin/coupons", "/admin/ledger"])
    def test_admin_routes_reject_partner(self, partner, path):
        assert partner.get(f"{API}{path}", timeout=30).status_code == 403

    def test_admin_routes_reject_anon(self, anon):
        r = anon.get(f"{API}/admin/dashboard", timeout=30)
        assert r.status_code in (401, 403)


# ---------------- AI ----------------
class TestAI:
    def test_customer_chat(self, customer):
        r = customer.post(f"{API}/ai/chat", json={"message": "mere AC me cooling nahi hai"}, timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        reply = d.get("reply") or d.get("message") or ""
        assert isinstance(reply, str) and len(reply.strip()) > 10, f"empty AI reply: {d}"

    def test_admin_chat_insights(self, admin):
        r = admin.post(f"{API}/ai/chat", json={"message": "give me business insights"}, timeout=120)
        assert r.status_code == 200, r.text
        reply = r.json().get("reply") or ""
        assert len(reply.strip()) > 10, f"empty admin AI reply: {r.json()}"

    def test_chat_requires_auth(self, anon):
        r = anon.post(f"{API}/ai/chat", json={"message": "hi"}, timeout=60)
        assert r.status_code in (401, 403)


# ---------------- Authorization / ownership on booking resources ----------------
class TestBookingOwnership:
    """A booking must only be readable/mutable by its own customer/partner/merchant/admin."""
    st = {}

    def test_00_setup(self, customer, service_id, partner):
        r = customer.post(f"{API}/bookings", json={
            "service_id": service_id,
            "address": {"label": "Home", "line": "TEST_ own 9", "pincode": "110001", "city": "Delhi"},
            "schedule_type": "now", "notes": "TEST_ownership"}, timeout=60)
        assert r.status_code in (200, 201), r.text
        TestBookingOwnership.st["id"] = r.json()["id"]
        TestBookingOwnership.st["otps"] = r.json()["otps"]
        acc = partner.post(f"{API}/bookings/{r.json()['id']}/accept", timeout=30)
        assert acc.status_code == 200, acc.text

    def test_01_foreign_customer_cannot_read_otps(self):
        c = client(login("+919111100033", "customer"))
        r = c.get(f"{API}/bookings/{TestBookingOwnership.st['id']}", timeout=30)
        assert r.status_code in (403, 404), \
            f"SECURITY: foreign customer read booking + OTPs {r.json().get('otps')}"

    def test_02_foreign_partner_cannot_start_job(self):
        p2 = client(login("+919000000005", "partner"))
        r = p2.post(f"{API}/bookings/{TestBookingOwnership.st['id']}/start-otp",
                    json={"otp": TestBookingOwnership.st["otps"]["start"]}, timeout=30)
        assert r.status_code in (403, 404), \
            f"SECURITY: partner not assigned to booking could start it ({r.status_code})"

    def test_03_foreign_partner_cannot_complete_and_take_money(self):
        p2 = client(login("+919000000005", "partner"))
        r = p2.post(f"{API}/bookings/{TestBookingOwnership.st['id']}/complete",
                    json={"otp": TestBookingOwnership.st["otps"]["completion"]}, timeout=30)
        assert r.status_code in (403, 404), \
            f"SECURITY/MONEY: unassigned partner completed booking and got paid ({r.status_code})"

    def test_04_foreign_customer_cannot_pay(self):
        c = client(login("+919111100044", "customer"))
        r = c.post(f"{API}/payments/mock", json={"purpose": "booking", "booking_id": TestBookingOwnership.st['id']}, timeout=30)
        assert r.status_code in (400, 403, 404), \
            f"SECURITY: foreign customer marked someone else's booking paid ({r.status_code})"

    def test_05_foreign_customer_cannot_review(self):
        c = client(login("+919111100055", "customer"))
        r = c.post(f"{API}/bookings/{TestBookingOwnership.st['id']}/review",
                   json={"rating": 1, "comment": "TEST_fake review"}, timeout=30)
        assert r.status_code in (400, 403, 404), \
            f"SECURITY: foreign customer posted review on others' booking ({r.status_code})"

    def test_06_shop_otp_not_allowed_on_direct_booking(self, partner):
        r = partner.post(f"{API}/bookings/{TestBookingOwnership.st['id']}/shop-otp",
                         json={"otp": "123456"}, timeout=30)
        assert r.status_code == 400, r.status_code

    def test_07_double_accept_rejected(self, partner):
        r = partner.post(f"{API}/bookings/{TestBookingOwnership.st['id']}/accept", timeout=30)
        assert r.status_code == 400, f"already-assigned booking accepted again ({r.status_code})"

    def test_08_pay_before_completion_rejected(self, customer):
        """Booking is only 'assigned' - paying should not be allowed."""
        r = customer.post(f"{API}/payments/mock", json={"purpose": "booking", "booking_id": TestBookingOwnership.st['id']}, timeout=30)
        assert r.status_code in (400, 409), \
            f"BUSINESS: booking marked paid while still 'assigned' ({r.status_code})"

    def test_09_ineligible_partner_cannot_accept_out_of_skill_job(self, customer, anon):
        """Create a booking for a skill the partner does not have, verify feed + accept guard."""
        svcs = anon.get(f"{API}/catalog/services", timeout=30).json()
        skills_of_partner = {"ac", "electrical", "appliance"}
        target = next((s for s in svcs if s.get("required_skill")
                       and s["required_skill"].lower() not in skills_of_partner), None)
        if not target:
            pytest.skip("no service outside partner skills")
        b = customer.post(f"{API}/bookings", json={
            "service_id": target["id"],
            "address": {"line": "TEST_ skill", "pincode": "110001", "city": "Delhi"},
            "schedule_type": "now"}, timeout=60).json()
        p = client(login("+919000000003", "partner"))
        jobs = p.get(f"{API}/bookings/partner/jobs", timeout=30).json()
        assert b["id"] not in [j["id"] for j in jobs], "job broadcast to partner lacking the skill"
        r = p.post(f"{API}/bookings/{b['id']}/accept", timeout=30)
        assert r.status_code in (400, 403), \
            f"MATCHING: partner without required skill accepted job ({r.status_code})"


# ---------------- Review rating aggregation ----------------
class TestReviewAggregation:
    def test_partner_rating_within_bounds(self, admin):
        partners = admin.get(f"{API}/admin/users", params={"role": "partner"}, timeout=30).json()
        for p in partners:
            assert 0 <= p.get("rating", 5) <= 5, f"partner {p['name']} rating out of range: {p.get('rating')}"


# ---------------- AI chat payload contract (frontend sends session_id: null) ----------------
class TestAIPayloadContract:
    def test_explicit_null_session_id(self, customer):
        """Frontend AiChat.jsx posts {message, session_id: null} on the first turn."""
        r = customer.post(f"{API}/ai/chat", json={"message": "hello", "session_id": None}, timeout=120)
        assert r.status_code == 200, \
            f"422/error on session_id=null (ChatRequest.session_id must be Optional[str]): {r.status_code} {r.text[:300]}"
        assert (r.json().get("reply") or "").strip()


# ---------------- Privilege escalation on self-signup ----------------
class TestSelfSignupPrivilege:
    def test_random_phone_cannot_self_register_as_admin(self):
        phone = "+9198765" + str(int(time.time()))[-5:]
        c = client()
        o = c.post(f"{API}/auth/send-otp", json={"phone": phone, "role": "admin"}, timeout=30)
        assert o.status_code == 200, o.text
        v = c.post(f"{API}/auth/verify-otp",
                   json={"phone": phone, "otp": o.json()["dev_otp"], "role": "admin"}, timeout=30)
        assert v.status_code == 200, v.text
        assert v.json()["user"]["role"] == "customer", \
            "CRITICAL: any phone can self-register with role=admin"
        tok = v.json()["token"]
        r = client(tok).get(f"{API}/admin/dashboard", timeout=30)
        assert r.status_code == 403, \
            f"CRITICAL: self-registered admin has full admin access ({r.status_code})"

    def test_random_phone_cannot_self_register_as_approved_partner(self):
        phone = "+9197654" + str(int(time.time()))[-5:]
        tok = login(phone)
        me = client(tok).get(f"{API}/auth/me", timeout=30).json()
        assert me["role"] == "customer", f"new phone got role {me['role']}"
        assert me.get("kyc_status") != "approved", "self-signup auto-KYC-approved"

    def test_otp_cannot_be_reused(self, anon):
        """Non-demo phone: single-use OTP."""
        phone = "+9196543" + str(int(time.time()))[-5:]
        o = anon.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=30).json()
        a = anon.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": o["dev_otp"]}, timeout=30)
        assert a.status_code == 200, a.text
        b = anon.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": o["dev_otp"]}, timeout=30)
        assert b.status_code in (400, 401), f"OTP replay accepted ({b.status_code})"
