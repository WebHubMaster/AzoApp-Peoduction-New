"""Phase-5: password reset OTP, guest checkout, account deletion, advanced address book,
serviceability + admin address config. Uses public REACT_APP_BACKEND_URL."""
import time
import uuid

import pytest
import requests

from conftest import API, PHONES, client, login

EMAIL = f"test_p5_{uuid.uuid4().hex[:8]}@example.test"
PW1 = "pass1234"
PW2 = "newpass9876"
GUEST_PHONE = "+9198" + str(int(time.time()))[-8:]


# ---------- auth/config exposure ----------
class TestAuthConfig:
    def test_config_has_address_block_and_no_secrets(self, anon):
        r = anon.get(f"{API}/auth/config", timeout=30)
        assert r.status_code == 200
        d = r.json()
        acfg = d["address_config"]
        for k in ("gps", "multiple_addresses", "property_type", "floor_flat", "landmark_instructions",
                  "serviceability_check", "pet_info", "parking_lift", "mandatory_landmark", "property_types"):
            assert k in acfg, f"missing address_config key {k}"
        assert isinstance(acfg["property_types"], list) and acfg["property_types"]
        assert "serviceable_pincodes" not in acfg
        blob = str(d).lower()
        for secret in ("fast2sms_api_key", "razorpay_test_key_secret", "google_client_secret"):
            assert secret not in blob
        assert d["auth_config"]["guest_checkout"] is True
        assert d["auth_config"]["email_login"] is True


# ---------- password reset via OTP ----------
class TestPasswordReset:
    def test_01_create_email_account(self, anon):
        r = anon.post(f"{API}/auth/email", json={"email": EMAIL, "password": PW1, "name": "TEST P5"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["token"] and d["user"]["email"] == EMAIL
        assert "password_hash" not in d["user"]

    def test_02_forgot_password_unknown_identifier_does_not_reveal(self, anon):
        r = anon.post(f"{API}/auth/forgot-password", json={"identifier": "no_such_user_xyz@example.test"}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["sent"] is True
        assert "dev_otp" not in d, "leaks that account does not exist"

    def test_03_forgot_then_reset_and_login_with_new_password(self, anon):
        r = anon.post(f"{API}/auth/forgot-password", json={"identifier": EMAIL}, timeout=30)
        assert r.status_code == 200
        otp = r.json().get("dev_otp")
        assert otp and len(otp) == 6, f"no dev otp: {r.text[:200]}"

        bad = anon.post(f"{API}/auth/reset-password",
                        json={"identifier": EMAIL, "otp": "000000", "new_password": PW2}, timeout=30)
        assert bad.status_code == 400

        short = anon.post(f"{API}/auth/reset-password",
                          json={"identifier": EMAIL, "otp": otp, "new_password": "a"}, timeout=30)
        assert short.status_code == 400

        ok = anon.post(f"{API}/auth/reset-password",
                       json={"identifier": EMAIL, "otp": otp, "new_password": PW2}, timeout=30)
        assert ok.status_code == 200, ok.text[:300]
        assert ok.json()["ok"] is True

        # old password rejected, new one works
        old = anon.post(f"{API}/auth/email", json={"email": EMAIL, "password": PW1, "name": ""}, timeout=30)
        assert old.status_code == 400, f"old password still valid: {old.status_code}"
        new = anon.post(f"{API}/auth/email", json={"email": EMAIL, "password": PW2, "name": ""}, timeout=30)
        assert new.status_code == 200 and new.json()["user"]["email"] == EMAIL

    def test_04_otp_single_use(self, anon):
        r = anon.post(f"{API}/auth/forgot-password", json={"identifier": EMAIL}, timeout=30)
        otp = r.json()["dev_otp"]
        assert anon.post(f"{API}/auth/reset-password",
                         json={"identifier": EMAIL, "otp": otp, "new_password": PW2}, timeout=30).status_code == 200
        again = anon.post(f"{API}/auth/reset-password",
                          json={"identifier": EMAIL, "otp": otp, "new_password": "zzz9999"}, timeout=30)
        assert again.status_code == 400, "used OTP accepted twice"


# ---------- serviceability ----------
class TestServiceability:
    def test_serviceability_default_serve_all(self, anon):
        r = anon.get(f"{API}/geo/serviceability?pincode=800001", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert set(["serviceable", "reason"]).issubset(d.keys())
        assert d["serviceable"] is True

    def test_serviceability_requires_pincode(self, anon):
        r = anon.get(f"{API}/geo/serviceability", timeout=30)
        assert r.status_code == 422

    def test_admin_pincode_gating_and_restore(self, admin, anon):
        get_cfg = admin.get(f"{API}/admin/settings", timeout=30)
        assert get_cfg.status_code == 200
        orig = get_cfg.json().get("address_config", {})
        try:
            upd = admin.put(f"{API}/admin/settings",
                            json={"address_config": {**orig, "serviceable_pincodes": ["800001"]}}, timeout=30)
            assert upd.status_code == 200, upd.text[:300]
            time.sleep(0.5)
            ok = anon.get(f"{API}/geo/serviceability?pincode=800001", timeout=30).json()
            bad = anon.get(f"{API}/geo/serviceability?pincode=999999", timeout=30).json()
            assert ok["serviceable"] is True and ok["reason"] == "in_list"
            assert bad["serviceable"] is False and bad["reason"] == "not_serviceable"
        finally:
            restore = admin.put(f"{API}/admin/settings",
                                json={"address_config": {**orig, "serviceable_pincodes": []}}, timeout=30)
            assert restore.status_code == 200
            time.sleep(0.5)
            assert anon.get(f"{API}/geo/serviceability?pincode=999999", timeout=30).json()["serviceable"] is True

    def test_reverse_geocode_graceful(self, anon):
        r = anon.get(f"{API}/geo/reverse?lat=25.5941&lng=85.1376", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["lat"] == 25.5941 and d["lng"] == 85.1376
        for k in ("line", "city", "state", "pincode"):
            assert k in d


# ---------- guest checkout ----------
class TestGuestCheckout:
    def test_guest_booking_and_visibility(self, anon):
        svcs = anon.get(f"{API}/catalog/services", timeout=30).json()
        assert svcs, "no services in catalog"
        sid = svcs[0]["id"]
        payload = {"service_id": sid, "customer_phone": GUEST_PHONE, "customer_name": "TEST Guest",
                   "address": {"line": "TEST guest lane", "pincode": "800001", "city": "Patna"},
                   "schedule_type": "now", "notes": "TEST guest booking"}
        r = anon.post(f"{API}/bookings/guest", json=payload, timeout=60)
        assert r.status_code == 200, r.text[:400]
        b = r.json()
        assert b.get("code") and b["service_id"] == sid
        assert "_id" not in b
        assert b.get("source") in ("guest", None)

        # guest can log in with the same phone via OTP and see the booking
        tok = login(GUEST_PHONE)
        gc = client(tok)
        my = gc.get(f"{API}/bookings", timeout=30)
        assert my.status_code == 200, my.text[:300]
        assert any(x["code"] == b["code"] for x in my.json()), "guest booking not visible after OTP login"

    def test_guest_booking_requires_address(self, anon):
        svcs = anon.get(f"{API}/catalog/services", timeout=30).json()
        r = anon.post(f"{API}/bookings/guest",
                      json={"service_id": svcs[0]["id"], "customer_phone": GUEST_PHONE, "address": {}}, timeout=30)
        assert r.status_code == 400

    def test_guest_booking_invalid_service(self, anon):
        r = anon.post(f"{API}/bookings/guest",
                      json={"service_id": "does-not-exist", "customer_phone": GUEST_PHONE,
                            "address": {"line": "x", "pincode": "800001"}}, timeout=30)
        assert r.status_code == 404


# ---------- advanced address book ----------
class TestAddressBook:
    @pytest.fixture(scope="class")
    def cust(self):
        return client(login(PHONES["customer"]))

    def test_address_crud_full_payload(self, cust):
        payload = {"label": "Office", "line": "TEST 12 Boring Road", "pincode": "800001", "city": "Patna",
                   "state": "Bihar", "property_type": "Apartment", "wing": "B", "floor": "3", "flat_no": "302",
                   "landmark": "TEST near park", "instructions": "Call before entering", "has_pets": True,
                   "pet_type": "Dog", "pet_count": 2, "pet_instructions": "Friendly",
                   "parking_available": True, "lift_available": False, "is_default": False}
        r = cust.post(f"{API}/auth/address", json=payload, timeout=30)
        assert r.status_code == 200, r.text[:400]
        addrs = r.json()["addresses"]
        new = [a for a in addrs if a["line"] == payload["line"]]
        assert new, "address not persisted"
        a = new[-1]
        aid = a["id"]
        for k in ("label", "pincode", "city", "property_type", "wing", "floor", "flat_no",
                  "landmark", "instructions", "has_pets", "pet_type", "pet_count", "lift_available"):
            assert a[k] == payload[k], f"field {k} mismatch: {a[k]} != {payload[k]}"

        # GET list persistence
        lst = cust.get(f"{API}/auth/addresses", timeout=30)
        assert lst.status_code == 200
        assert any(x["id"] == aid for x in lst.json())

        # UPDATE
        upd_payload = {**payload, "landmark": "TEST updated landmark", "has_pets": False, "flat_no": "404"}
        u = cust.put(f"{API}/auth/address/{aid}", json=upd_payload, timeout=30)
        assert u.status_code == 200, u.text[:300]
        got = [x for x in cust.get(f"{API}/auth/addresses", timeout=30).json() if x["id"] == aid][0]
        assert got["landmark"] == "TEST updated landmark" and got["flat_no"] == "404" and got["has_pets"] is False

        # SET DEFAULT (exactly one default)
        d = cust.post(f"{API}/auth/address/{aid}/default", timeout=30)
        assert d.status_code == 200
        after = cust.get(f"{API}/auth/addresses", timeout=30).json()
        assert [x["id"] for x in after if x.get("is_default")] == [aid]

        # DELETE + verify removal and default reassignment
        dl = cust.delete(f"{API}/auth/address/{aid}", timeout=30)
        assert dl.status_code == 200
        rem = cust.get(f"{API}/auth/addresses", timeout=30).json()
        assert not any(x["id"] == aid for x in rem)
        if rem:
            assert sum(1 for x in rem if x.get("is_default")) == 1, "default not reassigned after delete"

    def test_update_unknown_address_404(self, cust):
        r = cust.put(f"{API}/auth/address/nope-123", json={"line": "x", "pincode": "800001"}, timeout=30)
        assert r.status_code == 404

    def test_default_unknown_address_404(self, cust):
        r = cust.post(f"{API}/auth/address/nope-123/default", timeout=30)
        assert r.status_code == 404

    def test_addresses_require_auth(self, anon):
        r = anon.get(f"{API}/auth/addresses", timeout=30)
        assert r.status_code in (401, 403)

    def test_booking_with_saved_address_id(self, cust):
        addrs = cust.get(f"{API}/auth/addresses", timeout=30).json()
        if not addrs:
            cust.post(f"{API}/auth/address", json={"label": "Home", "line": "TEST default addr",
                                                   "pincode": "800001", "city": "Patna"}, timeout=30)
            addrs = cust.get(f"{API}/auth/addresses", timeout=30).json()
        sid = cust.get(f"{API}/catalog/services", timeout=30).json()[0]["id"]
        r = cust.post(f"{API}/bookings", json={"service_id": sid, "address_id": addrs[0]["id"],
                                               "schedule_type": "now", "notes": "TEST saved addr booking"}, timeout=60)
        assert r.status_code == 200, r.text[:400]
        assert r.json().get("code")


# ---------- account deletion (approval gated) ----------
class TestAccountDeletion:
    def test_deletion_request_then_admin_reject_restores(self, admin):
        cust = client(login(PHONES["customer"]))
        r = cust.post(f"{API}/auth/delete-account", json={"reason": "TEST deletion flow"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["status"] == "pending"

        # idempotent: second request stays pending, no duplicate
        r2 = cust.post(f"{API}/auth/delete-account", json={"reason": "TEST again"}, timeout=30)
        assert r2.status_code == 200 and r2.json()["status"] == "pending"

        lst = admin.get(f"{API}/admin/deletion-requests", timeout=30)
        assert lst.status_code == 200
        pend = [x for x in lst.json() if x["status"] == "pending" and x["phone"] == PHONES["customer"]]
        assert len(pend) == 1, f"expected exactly 1 pending request, got {len(pend)}"
        rid = pend[0]["id"]

        rej = admin.post(f"{API}/admin/deletion-requests/{rid}?action=reject", timeout=30)
        assert rej.status_code == 200, rej.text[:300]
        assert rej.json()["status"] == "rejected"

        # account restored and usable
        me = client(login(PHONES["customer"])).get(f"{API}/auth/me", timeout=30)
        assert me.status_code == 200
        assert me.json().get("status") != "deletion_requested", "user status not restored after reject"

    def test_deletion_requests_admin_only(self, anon, customer):
        assert anon.get(f"{API}/admin/deletion-requests", timeout=30).status_code in (401, 403)
        assert customer.get(f"{API}/admin/deletion-requests", timeout=30).status_code in (401, 403)

    def test_delete_account_requires_auth(self, anon):
        assert anon.post(f"{API}/auth/delete-account", json={"reason": "x"}, timeout=30).status_code in (401, 403)

    def test_process_unknown_deletion_request_404(self, admin):
        assert admin.post(f"{API}/admin/deletion-requests/nope-123?action=reject", timeout=30).status_code == 404


# ---------- admin address config ----------
class TestAdminAddressConfig:
    def test_toggle_feature_flags_and_property_types(self, admin, anon):
        orig = admin.get(f"{API}/admin/settings", timeout=30).json().get("address_config", {})
        try:
            new_types = orig.get("property_types", []) + ["TEST Studio"]
            r = admin.put(f"{API}/admin/settings",
                          json={"address_config": {**orig, "pet_info": False, "property_types": new_types}}, timeout=30)
            assert r.status_code == 200
            time.sleep(0.5)
            cfg = anon.get(f"{API}/auth/config", timeout=30).json()["address_config"]
            assert cfg["pet_info"] is False
            assert "TEST Studio" in cfg["property_types"]
        finally:
            admin.put(f"{API}/admin/settings", json={"address_config": orig}, timeout=30)
            time.sleep(0.5)
            cfg = anon.get(f"{API}/auth/config", timeout=30).json()["address_config"]
            assert cfg["pet_info"] is True and "TEST Studio" not in cfg["property_types"]
