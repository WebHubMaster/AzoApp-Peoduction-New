"""Iteration 7: Customer Live Dispatch Status + Partner Missed Ring Recovery."""
import os

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE = base_url.rstrip("/") + "/api"

CUSTOMER = "+919000000004"
OTHER_CUSTOMER = "+919000000002"  # merchant role, used only for token-mismatch check
ADMIN = "+919000000000"
PARTNERS = ["+919000000003", "+919000000005", "+919000000013"]
OTP = "123456"

STATE = {}


def _login(phone):
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=30)
    assert r.status_code == 200, f"login {phone} -> {r.status_code} {r.text[:300]}"
    d = r.json()
    assert d.get("token"), "no token in login response"
    return d["token"], d.get("user") or {}


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def cust():
    tok, u = _login(CUSTOMER)
    return tok, u


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN)[0]


# ── Customer dispatch-status
class TestDispatchStatus:
    def test_list_bookings(self, cust):
        tok, _ = cust
        r = requests.get(f"{BASE}/bookings", headers=_h(tok), timeout=30)
        assert r.status_code == 200, r.text[:300]
        arr = r.json()
        assert isinstance(arr, list) and arr, "customer has no bookings"
        STATE["searching"] = [b for b in arr if b.get("status") == "searching"]
        STATE["other"] = [b for b in arr if b.get("status") != "searching"]
        assert STATE["searching"], "no searching bookings in seed"

    def test_searching_booking_status_shape(self, cust):
        tok, _ = cust
        b = STATE["searching"][0]
        r = requests.get(f"{BASE}/bookings/{b['id']}/dispatch-status", headers=_h(tok), timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        for k in ["booking_id", "code", "status", "searching", "eligible", "rung", "seen",
                  "ringing_now", "declined", "wave", "max_waves", "nearby_expanded",
                  "exhausted", "elapsed_sec", "nearest_eta_min", "partner_name"]:
            assert k in d, f"missing key {k} in {sorted(d)}"
        assert d["booking_id"] == b["id"]
        assert d["code"] == b.get("code")
        assert d["searching"] is True
        assert d["status"] == "searching"
        assert d["partner_name"] is None
        for k in ["eligible", "rung", "seen", "ringing_now", "declined", "wave", "max_waves", "elapsed_sec"]:
            assert isinstance(d[k], int), f"{k} is {type(d[k])} = {d[k]!r}"
        assert d["elapsed_sec"] >= 0
        assert isinstance(d["nearby_expanded"], bool) and isinstance(d["exhausted"], bool)
        assert d["rung"] >= d["seen"]
        assert "_id" not in d

    def test_all_searching_bookings_ok(self, cust):
        tok, _ = cust
        for b in STATE["searching"]:
            r = requests.get(f"{BASE}/bookings/{b['id']}/dispatch-status", headers=_h(tok), timeout=30)
            assert r.status_code == 200, f"{b.get('code')} -> {r.status_code} {r.text[:200]}"
            assert r.json()["searching"] is True

    def test_non_searching_booking(self, cust):
        tok, _ = cust
        cand = [b for b in STATE["other"] if b.get("status") in ("assigned", "accepted", "in_progress", "completed", "on_the_way")]
        if not cand:
            pytest.skip("no non-searching booking with a partner for this customer")
        d = None
        for b in cand:
            r = requests.get(f"{BASE}/bookings/{b['id']}/dispatch-status", headers=_h(tok), timeout=30)
            assert r.status_code == 200, r.text[:300]
            d = r.json()
            assert d["searching"] is False
            if d.get("partner_name"):
                break
        assert d["partner_name"], f"partner_name empty for all assigned bookings ({[b.get('status') for b in cand]})"

    def test_admin_allowed(self, cust, admin):
        b = STATE["searching"][0]
        r = requests.get(f"{BASE}/bookings/{b['id']}/dispatch-status", headers=_h(admin), timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["booking_id"] == b["id"]

    def test_other_user_forbidden(self):
        tok, _ = _login(OTHER_CUSTOMER)
        b = STATE["searching"][0]
        r = requests.get(f"{BASE}/bookings/{b['id']}/dispatch-status", headers=_h(tok), timeout=30)
        assert r.status_code in (403, 404), f"expected 403/404 got {r.status_code} {r.text[:200]}"

    def test_unauthenticated(self):
        b = STATE["searching"][0]
        r = requests.get(f"{BASE}/bookings/{b['id']}/dispatch-status", timeout=30)
        assert r.status_code in (401, 403), f"expected 401 got {r.status_code}"

    def test_bad_booking_id(self, cust):
        tok, _ = cust
        r = requests.get(f"{BASE}/bookings/does-not-exist-xyz/dispatch-status", headers=_h(tok), timeout=30)
        assert r.status_code == 404, f"expected 404 got {r.status_code} {r.text[:200]}"


# ── Partner missed jobs
class TestPartnerMissed:
    def test_missed_shape(self):
        found = None
        for phone in PARTNERS:
            tok, u = _login(phone)
            r = requests.get(f"{BASE}/bookings/partner/missed", headers=_h(tok), timeout=30)
            assert r.status_code == 200, f"{phone} -> {r.status_code} {r.text[:300]}"
            arr = r.json()
            assert isinstance(arr, list)
            print(f"{phone} ({u.get('name')}) missed={len(arr)}")
            if arr and not found:
                found = (phone, tok, arr)
        assert found, "no partner has missed jobs — cannot validate shape"
        phone, tok, arr = found
        STATE["missed_partner"] = (phone, tok)
        for j in arr:
            for k in ["id", "code", "service_name", "total", "missed_reason", "eta_min", "created_at", "wave"]:
                assert k in j, f"missing {k} in {sorted(j)}"
            assert j["missed_reason"] in ("offline", "no_answer", "taken_back"), j["missed_reason"]
            assert j.get("city") or j.get("address_line"), f"no city/address_line: {sorted(j)}"
            assert isinstance(j["wave"], int)
            assert "_id" not in j and "otps" not in j
        STATE["missed_rows"] = arr

    def test_missed_only_searching_and_eligible(self, admin):
        phone, tok = STATE["missed_partner"]
        me = _login(phone)[1]
        pid = me["id"]
        for j in STATE["missed_rows"][:5]:
            r = requests.get(f"{BASE}/bookings/{j['id']}/dispatch-status", headers=_h(admin), timeout=30)
            assert r.status_code == 200
            d = r.json()
            assert d["searching"] is True, f"{j['code']} not searching"
            # ringing-now offers must be excluded from missed list
            tl = requests.get(f"{BASE}/admin/bookings/{j['id']}/dispatch-timeline", headers=_h(admin), timeout=30)
            assert tl.status_code == 200, tl.text[:200]
            rows = tl.json().get("rows") or tl.json().get("timeline") or []
            pend = [x for x in rows if x.get("partner_id") == pid and x.get("response") == "pending"]
            assert not pend, f"{j['code']} has a pending ring for {pid} but is listed as missed"

    def test_customer_forbidden(self, cust):
        tok, _ = cust
        r = requests.get(f"{BASE}/bookings/partner/missed", headers=_h(tok), timeout=30)
        assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text[:200]}"

    def test_unauthenticated(self):
        r = requests.get(f"{BASE}/bookings/partner/missed", timeout=30)
        assert r.status_code in (401, 403)


# ── Re-grab flow (mutates ONE booking)
class TestRegrab:
    def test_regrab_one(self, cust, admin):
        phone, tok = STATE["missed_partner"]
        me = _login(phone)[1]
        rows = requests.get(f"{BASE}/bookings/partner/missed", headers=_h(tok), timeout=30).json()
        assert rows, "no missed rows to grab"
        # prefer a booking owned by our test customer so we can verify partner_name
        ctok, cu = cust
        mine = requests.get(f"{BASE}/bookings", headers=_h(ctok), timeout=30).json()
        my_ids = {b["id"] for b in mine}
        target = next((j for j in rows if j["id"] in my_ids), rows[0])
        STATE["grabbed"] = target
        r = requests.post(f"{BASE}/bookings/{target['id']}/accept", headers=_h(tok), timeout=30)
        assert r.status_code == 200, f"accept -> {r.status_code} {r.text[:300]}"

        after = requests.get(f"{BASE}/bookings/partner/missed", headers=_h(tok), timeout=30)
        assert after.status_code == 200
        assert target["id"] not in [x["id"] for x in after.json()], "grabbed job still in missed list"

        who = ctok if target["id"] in my_ids else admin
        st = requests.get(f"{BASE}/bookings/{target['id']}/dispatch-status", headers=_h(who), timeout=30)
        assert st.status_code == 200, st.text[:300]
        d = st.json()
        assert d["searching"] is False, d
        assert d["partner_name"] == me.get("name"), f"partner_name={d['partner_name']!r} expected {me.get('name')!r}"

        # /partner/jobs is the OPEN feed (searching only) — assigned job must leave it
        jobs = requests.get(f"{BASE}/bookings/partner/jobs", headers=_h(tok), timeout=30)
        assert jobs.status_code == 200
        assert target["id"] not in [j["id"] for j in jobs.json()], "assigned job still in open feed"
        # it must now be an active job for this partner
        act = requests.get(f"{BASE}/bookings/partner/active", headers=_h(tok), timeout=30)
        assert act.status_code == 200, act.text[:200]
        assert target["id"] in [j["id"] for j in act.json()], "accepted job not in partner active jobs"


# ── Regression
class TestRegression:
    def test_ring_pending(self):
        tok, _ = _login(PARTNERS[0])
        r = requests.get(f"{BASE}/bookings/partner/ring-pending", headers=_h(tok), timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert isinstance(r.json(), list)

    def test_partner_jobs(self):
        tok, _ = _login(PARTNERS[0])
        r = requests.get(f"{BASE}/bookings/partner/jobs", headers=_h(tok), timeout=30)
        assert r.status_code == 200, r.text[:300]

    def test_partner_active_and_dashboard_route_order(self):
        tok, _ = _login(PARTNERS[0])
        for path in ["/bookings/partner/active", "/bookings/partner/dashboard"]:
            r = requests.get(f"{BASE}{path}", headers=_h(tok), timeout=30)
            assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"

    def test_dispatch_timeline(self, admin):
        ctok, _ = _login(CUSTOMER)
        arr = requests.get(f"{BASE}/bookings", headers=_h(ctok), timeout=30).json()
        b = next((x for x in arr if x.get("status") == "searching"), arr[0])
        r = requests.get(f"{BASE}/admin/bookings/{b['id']}/dispatch-timeline", headers=_h(admin), timeout=30)
        assert r.status_code == 200, r.text[:300]
