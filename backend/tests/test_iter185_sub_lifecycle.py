"""Iteration 185 — Admin Subscriptions Lifecycle: renewals, nudge, pause, resume,
cancel with pro-rata refund, template events, mark-day guard."""
import os
import time
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
ADMIN_PHONE = "+919000000000"
CUST_PHONE = "+919000000004"
OTP = "123456"


def _login(phone):
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_PHONE)


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def active_subs(admin_h):
    """Return list of active subs for Priya Verma."""
    r = requests.get(f"{BASE}/subscriptions/admin/all", headers=admin_h, timeout=15,
                     params={"status": "active"})
    assert r.status_code == 200, r.text
    subs = r.json()
    assert isinstance(subs, list)
    return subs


# -------- Renewals --------
class TestRenewals:
    def test_renewals_list(self, admin_h):
        r = requests.get(f"{BASE}/subscriptions/admin/renewals", headers=admin_h,
                         params={"days": 3}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        # Each row should be active with end_date in next 3 days
        import datetime as dt
        today = dt.date.today()
        hi = today + dt.timedelta(days=3)
        for s in data:
            assert s.get("status") == "active"
            ed = dt.date.fromisoformat(s["end_date"])
            assert today <= ed <= hi, f"{s.get('code')} end {ed}"

    def test_nudge_single(self, admin_h, active_subs):
        # pick an active sub
        if not active_subs:
            pytest.skip("No active sub")
        sid = active_subs[0]["id"]
        r = requests.post(f"{BASE}/subscriptions/admin/{sid}/nudge", headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert "last_renewal_nudge" in d
        assert "at" in d["last_renewal_nudge"]

    def test_nudge_bulk(self, admin_h, active_subs):
        if len(active_subs) < 1:
            pytest.skip("No active sub")
        ids = [s["id"] for s in active_subs[:2]]
        r = requests.post(f"{BASE}/subscriptions/admin/renewals/nudge",
                          headers=admin_h, json={"ids": ids}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "sent" in d
        assert d["sent"] >= 1

    def test_nudge_non_active_400(self, admin_h):
        # Find a cancelled or completed sub
        r = requests.get(f"{BASE}/subscriptions/admin/all", headers=admin_h, timeout=15)
        subs = r.json()
        non_active = [s for s in subs if s.get("status") not in ("active",)]
        if not non_active:
            pytest.skip("No non-active sub")
        sid = non_active[0]["id"]
        r = requests.post(f"{BASE}/subscriptions/admin/{sid}/nudge", headers=admin_h, timeout=15)
        assert r.status_code == 400, r.text


# -------- Pause / Resume --------
class TestPauseResume:
    def _find_unpaused_active(self, admin_h):
        r = requests.get(f"{BASE}/subscriptions/admin/all", headers=admin_h,
                         params={"status": "active"}, timeout=15)
        for s in r.json():
            if not (s.get("pause") or {}).get("active"):
                return s
        return None

    def test_pause_past_date_400(self, admin_h):
        sub = self._find_unpaused_active(admin_h)
        if not sub:
            pytest.skip("No unpaused active sub")
        r = requests.post(f"{BASE}/subscriptions/admin/{sub['id']}/pause",
                          headers=admin_h,
                          json={"from_date": "2020-01-01", "days": 2, "reason": "test"}, timeout=15)
        assert r.status_code == 400

    def test_pause_days_out_of_range(self, admin_h):
        sub = self._find_unpaused_active(admin_h)
        if not sub:
            pytest.skip("No unpaused active sub")
        r = requests.post(f"{BASE}/subscriptions/admin/{sub['id']}/pause",
                          headers=admin_h,
                          json={"from_date": "", "days": 0, "reason": "test"}, timeout=15)
        assert r.status_code == 400

    def test_pause_then_resume_roundtrip(self, admin_h):
        """Full pause→resume cycle on an active unpaused sub."""
        sub = self._find_unpaused_active(admin_h)
        if not sub:
            pytest.skip("No unpaused active sub")
        sid = sub["id"]
        old_end = sub["end_date"]
        # Pause for 2 days starting today
        import datetime as dt
        today = dt.date.today().isoformat()
        r = requests.post(f"{BASE}/subscriptions/admin/{sid}/pause",
                          headers=admin_h,
                          json={"from_date": today, "days": 3, "reason": "iter185 test"},
                          timeout=15)
        if r.status_code == 400 and "No upcoming working days" in r.text:
            pytest.skip("No working days in range for this sub")
        assert r.status_code == 200, r.text
        paused_sub = r.json()
        assert paused_sub["pause"]["active"] is True
        assert paused_sub["end_date"] >= old_end
        # Some schedule days should be status=paused
        n_paused = sum(1 for d in paused_sub["schedule"] if d["status"] == "paused")
        assert n_paused >= 1

        # Double-pause → 400
        r2 = requests.post(f"{BASE}/subscriptions/admin/{sid}/pause", headers=admin_h,
                           json={"from_date": today, "days": 2}, timeout=15)
        assert r2.status_code == 400

        # Admin mark day on paused day → 400
        paused_day = next((d["date"] for d in paused_sub["schedule"] if d["status"] == "paused"), None)
        if paused_day:
            r3 = requests.post(f"{BASE}/subscriptions/admin/{sid}/days/{paused_day}",
                               headers=admin_h, json={"status": "completed"}, timeout=15)
            assert r3.status_code == 400, r3.text

        # Resume
        r4 = requests.post(f"{BASE}/subscriptions/admin/{sid}/resume", headers=admin_h, timeout=15)
        assert r4.status_code == 200, r4.text
        resumed = r4.json()
        assert resumed["pause"]["active"] is False
        assert resumed["end_date"] == old_end  # restored


# -------- Cancel Quote + Cancel --------
class TestCancel:
    def test_cancel_quote_shape(self, admin_h):
        r = requests.get(f"{BASE}/subscriptions/admin/all", headers=admin_h,
                         params={"status": "active"}, timeout=15)
        subs = r.json()
        if not subs:
            pytest.skip("No active sub for quote")
        sid = subs[0]["id"]
        r = requests.get(f"{BASE}/subscriptions/admin/{sid}/cancel-quote",
                         headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text
        q = r.json()
        for k in ("paid", "working_days", "remaining_days", "used_days",
                  "refund_amount", "maid_earned"):
            assert k in q, f"missing {k}"
        assert q["used_days"] + q["remaining_days"] == q["working_days"]
        if q["paid"] > 0 and q["working_days"]:
            expected = round(q["paid"] * q["remaining_days"] / q["working_days"], 2)
            # tolerate rounding
            assert abs(q["refund_amount"] - expected) <= 1.0

    def test_cancel_already_cancelled_400(self, admin_h):
        r = requests.get(f"{BASE}/subscriptions/admin/all", headers=admin_h, timeout=15)
        subs = r.json()
        cancelled = [s for s in subs if s.get("status") == "cancelled"]
        if not cancelled:
            pytest.skip("No cancelled sub")
        sid = cancelled[0]["id"]
        r = requests.post(f"{BASE}/subscriptions/admin/{sid}/cancel",
                          headers=admin_h, json={"reason": "retest"}, timeout=15)
        assert r.status_code == 400

    def test_cancel_active_creates_refund(self, admin_h):
        """Cancel one active sub; verify refund + settlement."""
        r = requests.get(f"{BASE}/subscriptions/admin/all", headers=admin_h,
                         params={"status": "active"}, timeout=15)
        subs = r.json()
        # Prefer one that is NOT currently paused and not the PAUSED fixture (SUB7LPQH9) — task says prefer last
        candidate = next(
            (s for s in subs
             if not (s.get("pause") or {}).get("active")
             and s.get("code") != "SUB7LPQH9"
             and s.get("payment_status") == "paid"),
            None
        )
        if not candidate:
            pytest.skip("No clean paid active sub to cancel")
        sid = candidate["id"]
        code = candidate["code"]

        quote = requests.get(f"{BASE}/subscriptions/admin/{sid}/cancel-quote",
                             headers=admin_h, timeout=15).json()

        r = requests.post(f"{BASE}/subscriptions/admin/{sid}/cancel", headers=admin_h,
                          json={"reason": "iter185 test cancel"}, timeout=15)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["status"] == "cancelled"
        if quote["refund_amount"] > 0:
            assert c.get("payment_status") in ("refunded", "partially_refunded")
            # refund record present in admin refunds
            rf = requests.get(f"{BASE}/admin/refunds", headers=admin_h, timeout=15)
            if rf.status_code == 200:
                rows = rf.json() if isinstance(rf.json(), list) else rf.json().get("items", [])
                codes = [r.get("booking_code") for r in rows]
                assert code in codes, f"{code} not in refund list"
        # future days cancelled
        import datetime as dt
        today = dt.date.today().isoformat()
        # Only 'scheduled' or 'paused' future days should have been cancelled.
        # Completed/weekly_off/already-cancelled days are left alone.
        leftover = [d for d in c["schedule"] if d["date"] >= today
                    and d["status"] in ("scheduled", "paused")]
        assert leftover == [], f"Found non-cancelled future scheduled days: {leftover[:3]}"


# -------- Templates --------
class TestTemplates:
    def test_subscription_templates_seeded(self, admin_h):
        r = requests.get(f"{BASE}/admin/partner-reg/templates", headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text
        rows = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        events = {row.get("event") for row in rows}
        for ev in ("subscription_renewal_reminder", "subscription_paused", "subscription_cancelled"):
            assert ev in events, f"template event {ev} not seeded. have: {sorted(events)[:20]}"

    def test_template_events_registry(self, admin_h):
        r = requests.get(f"{BASE}/admin/partner-reg/template-events", headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text
        out = r.json()
        text = str(out)
        for ev in ("subscription_renewal_reminder", "subscription_paused",
                   "subscription_resumed", "subscription_cancelled"):
            assert ev in text, f"{ev} not in events registry"
