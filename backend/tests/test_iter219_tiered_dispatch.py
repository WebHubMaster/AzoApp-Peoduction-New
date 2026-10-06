"""Backend tests for iter219 — Tiered (Pro/Free) delayed dispatch, rating risk banner,
auto-suspension on low rating, and admin Suspended Partners list.

Notes on strategy:
  * HTTP-layer tests use REACT_APP_BACKEND_URL exactly like the real client.
  * The dispatch logic (_broadcast_new_job, _apply_rating_actions) is driven via
    direct python calls because the environment has no /payments/mock endpoint,
    which is the published way to flip a booking to paid+searching. Dispatch state
    is then inspected directly on the booking document (per the review-request
    guidance).
  * All async controller calls run inside ONE asyncio.run per test to avoid motor's
    "attached to a different loop" errors.
"""
import os
import sys
import asyncio
import time
import uuid
import requests
import pytest

sys.path.insert(0, "/app/backend")

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
if not BASE:
    with open("/app/web_panel/.env") as f:
        for ln in f:
            if ln.startswith("REACT_APP_BACKEND_URL="):
                BASE = ln.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE}/api"
OTP = "123456"
ADMIN_PHONE = "+919000000000"


def _login(phone):
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=30)
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/auth/verify-otp",
                      json={"phone": phone, "otp": OTP}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def admin_tok():
    return _login(ADMIN_PHONE)


# -------- 1. admin settings persist delay + suspension days --------
class TestAdminSettings:
    def test_put_and_get(self, admin_tok):
        payload = {"business_config": {
            "free_partner_alert_delay_sec": 20,
            "rating_suspension_days": 3,
        }}
        r = requests.put(f"{API}/admin/settings", json=payload,
                         headers=H(admin_tok), timeout=30)
        assert r.status_code in (200, 204), r.text
        r = requests.get(f"{API}/admin/settings",
                         headers=H(admin_tok), timeout=30)
        assert r.status_code == 200, r.text
        bc = (r.json() or {}).get("business_config", {}) or {}
        assert int(bc.get("free_partner_alert_delay_sec", 0)) == 20, bc
        assert int(bc.get("rating_suspension_days", 0)) == 3, bc


# -------- 2. /auth/me rating_at_risk threshold --------
class TestRatingAtRiskFlag:
    def test_at_risk_true_for_46(self):
        tok = _login("+919000000011")  # Suresh, rating 4.6
        r = requests.get(f"{API}/auth/me", headers=H(tok), timeout=30)
        assert r.status_code == 200, r.text
        me = r.json()
        assert me.get("role") == "partner"
        assert me.get("rating_at_risk") is True, me

    def test_at_risk_false_for_47(self):
        tok = _login("+919000000013")  # Manoj, 4.7
        r = requests.get(f"{API}/auth/me", headers=H(tok), timeout=30)
        assert r.status_code == 200, r.text
        me = r.json()
        assert me.get("rating_at_risk") is False, me


# -------- 3+4. Suspended list + manual unsuspend --------
class TestSuspendedListAndUnsuspend:
    def test_list_shape_and_manual_flow(self, admin_tok):
        r = requests.get(f"{API}/admin/partners/suspended",
                         headers=H(admin_tok), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "partners" in d and isinstance(d["partners"], list), d

        tok = _login("+919000000011")
        me = requests.get(f"{API}/auth/me", headers=H(tok), timeout=30).json()
        pid = me["id"]
        rs = requests.post(f"{API}/admin/partners/{pid}/suspend",
                           json={"days": 2, "reason": "TEST manual"},
                           headers=H(admin_tok), timeout=30)
        assert rs.status_code == 200, rs.text
        r = requests.get(f"{API}/admin/partners/suspended",
                         headers=H(admin_tok), timeout=30)
        rows = r.json()["partners"]
        row = next((x for x in rows if x["id"] == pid), None)
        assert row is not None, f"{pid} not in suspended list"
        for k in ("id", "name", "partner_id", "rating", "reason", "days",
                  "suspended_at", "suspend_until", "auto"):
            assert k in row, f"missing {k} in {row}"
        assert row["auto"] is False, row  # manual => auto False

        ur = requests.post(f"{API}/admin/partners/{pid}/unsuspend",
                           headers=H(admin_tok), timeout=30)
        assert ur.status_code == 200, ur.text
        r = requests.get(f"{API}/admin/partners/suspended",
                         headers=H(admin_tok), timeout=30)
        assert pid not in [x["id"] for x in r.json()["partners"]]


# -------- 5. Auto-suspension via _apply_rating_actions --------
class TestAutoSuspension:
    def test_auto_suspend_at_43(self, admin_tok):
        tok = _login("+919000000012")  # Vikash (4.4)
        me = requests.get(f"{API}/auth/me", headers=H(tok), timeout=30).json()
        pid = me["id"]
        requests.post(f"{API}/admin/partners/{pid}/unsuspend",
                      headers=H(admin_tok), timeout=30)

        from motor.motor_asyncio import AsyncIOMotorClient
        from controllers import booking_controller as bc

        async def run():
            cli = AsyncIOMotorClient("mongodb://localhost:27017")
            db = cli["test_database"]
            await bc._apply_rating_actions(pid, 4.3)
            u = await db.users.find_one({"id": pid}, {"_id": 0})
            return u

        u = asyncio.run(run())
        assert u.get("suspended") is True, u
        assert u.get("rating_suspended") is True, u
        assert u.get("suspend_until"), u

        r = requests.get(f"{API}/admin/partners/suspended",
                         headers=H(admin_tok), timeout=30)
        row = next((x for x in r.json()["partners"] if x["id"] == pid), None)
        assert row is not None, "auto-suspended partner missing from list"
        assert row["auto"] is True, row

        ur = requests.post(f"{API}/admin/partners/{pid}/unsuspend",
                           headers=H(admin_tok), timeout=30)
        assert ur.status_code == 200, ur.text

        async def check():
            cli = AsyncIOMotorClient("mongodb://localhost:27017")
            return await cli["test_database"].users.find_one({"id": pid}, {"_id": 0})

        u2 = asyncio.run(check())
        assert u2.get("suspended") is False, u2
        assert not u2.get("rating_suspended"), f"rating_suspended should be unset: {u2}"


# -------- 6. Pro/Free delayed dispatch + rating order --------
import json as _json
import subprocess


class TestTieredDispatch:
    def test_pro_vs_free_and_no_pro_fallback(self, admin_tok):
        """One asyncio.run that exercises BOTH scenarios back to back:
          A) Pro + Free eligible → Pro offered immediately, Free held.
          B) Only Free eligible → Free offered immediately (no hold).
        """
        requests.put(f"{API}/admin/settings",
                     json={"business_config": {
                         "free_partner_alert_delay_sec": 30,
                         "rating_suspension_days": 3,
                     }}, headers=H(admin_tok), timeout=30)

        # Run the actual dispatch exercise in a fresh python process to avoid
        # motor's event-loop binding leaking between pytest tests.
        proc = subprocess.run(
            [sys.executable, "/app/backend/tests/_iter219_dispatch_sidecar.py"],
            capture_output=True, text=True, timeout=60, cwd="/app/backend")
        assert proc.returncode == 0, f"sidecar failed: {proc.stderr}\n{proc.stdout}"
        data = _json.loads(proc.stdout.strip().splitlines()[-1])
        ids = data["ids"]
        A = data["A"]
        print("A:", A)
        pros = [p for p in (ids["raj"], ids["manoj"]) if p in A["offered"]]
        assert len(pros) >= 1, f"No Pro partner offered: {A['offered']}"
        assert ids["amit"] not in A["offered"], \
            f"Free Amit should be held, but was offered: {A['offered']}"
        assert ids["amit"] in A["pending"], \
            f"Free Amit missing from pending: {A['pending']}"
        assert A["release_at"], "free_alert_release_at missing"
        if ids["raj"] in A["offered"] and ids["manoj"] in A["offered"]:
            assert A["offered"].index(ids["raj"]) < A["offered"].index(ids["manoj"]), \
                f"Pro rating-desc order broken: {A['offered']}"
        B = data.get("B")
        if not B:
            pytest.skip("no plumbing service seeded")
        print("B:", B)
        assert ids["amit"] in B["offered"], f"Amit not offered when no Pro: {B['offered']}"
        assert not B["pending"], f"No Pro → nothing should be held: {B['pending']}"
        if ids["vikash"] in B["offered"]:
            assert B["offered"].index(ids["amit"]) < B["offered"].index(ids["vikash"]), \
                f"Free rating-desc order broken: {B['offered']}"
        return

        # (legacy inline impl kept below for reference — unreachable)
        from motor.motor_asyncio import AsyncIOMotorClient
        from controllers import booking_controller as bc
        from config.database import now_iso

        async def go():
            cli = AsyncIOMotorClient("mongodb://localhost:27017")
            db = cli["test_database"]
            raj = await db.users.find_one({"phone": "+919000000003"}, {"_id": 0, "id": 1})
            manoj = await db.users.find_one({"phone": "+919000000013"}, {"_id": 0, "id": 1})
            amit = await db.users.find_one({"phone": "+919000000005"}, {"_id": 0, "id": 1})
            vikash = await db.users.find_one({"phone": "+919000000012"}, {"_id": 0, "id": 1})
            for pid in (raj["id"], manoj["id"], amit["id"], vikash["id"]):
                await db.users.update_one({"id": pid}, {
                    "$set": {"partner_status": "online", "suspended": False,
                             "status": "active", "kyc_status": "approved"},
                    "$unset": {"suspend_until": "", "rating_suspended": ""}})
            # Free these partners from any accepted bookings that would make them busy.
            # (temp: cancel the already-accepted overlap entries so dispatch sees them free)
            for pid in (raj["id"], manoj["id"], amit["id"], vikash["id"]):
                await db.bookings.update_many(
                    {"partner_id": pid, "status": {"$in": [
                        "assigned", "arrived_shop", "arrived_customer", "started"]}},
                    {"$set": {"status": "cancelled",
                              "cancelled_reason": "TEST iter219 unblock"}})

            # --- Scenario A: AC booking (Pro: Raj, Manoj; Free: Amit) ---
            svc_ac = await db.services.find_one(
                {"required_skill": "ac", "status": "active"}, {"_id": 0})
            bid_a = str(uuid.uuid4())
            booking_a = {
                "id": bid_a, "code": f"AZOTST{int(time.time()) % 10000:04d}A",
                "customer_id": "test-cust-iter219",
                "customer_name": "T", "customer_phone": "+911234567890",
                "service_id": svc_ac["id"], "service_name": svc_ac["name"],
                "category_id": svc_ac.get("category_id"),
                "category_name": svc_ac.get("category_name"),
                "address": {"line": "T", "city": "Patna", "pincode": "800001",
                            "lat": 25.5941, "lng": 85.1376},
                "schedule_type": "schedule", "scheduled_at": None, "notes": "",
                "addons": [], "pricing": {"base": 499, "subtotal": 499,
                                          "total": 499, "tax": 0},
                "status": "pending_payment",
                "otps": {"start": "1234", "completion": "5678"},
                "evidence": {"before": [], "after": []},
                "eligible_partner_ids": [raj["id"], manoj["id"], amit["id"]],
                "eligible_detail": {}, "timeline": [],
                "payment_status": "paid",
                "created_at": now_iso(), "updated_at": now_iso(),
            }
            await db.bookings.insert_one(dict(booking_a))
            await bc._broadcast_new_job(booking_a)
            ba = await db.bookings.find_one({"id": bid_a}, {"_id": 0})

            # --- Scenario B: plumbing booking (NO pro, Free: Amit, Vikash) ---
            svc_pl = await db.services.find_one(
                {"required_skill": "plumbing", "status": "active"}, {"_id": 0})
            if not svc_pl:
                return (raj, manoj, amit, vikash, ba, None, None)
            bid_b = str(uuid.uuid4())
            booking_b = {**booking_a,
                         "id": bid_b,
                         "code": f"AZOTST{int(time.time()) % 10000:04d}B",
                         "service_id": svc_pl["id"], "service_name": svc_pl["name"],
                         "category_id": svc_pl.get("category_id"),
                         "category_name": svc_pl.get("category_name"),
                         "eligible_partner_ids": [amit["id"], vikash["id"]]}
            await db.bookings.insert_one(dict(booking_b))
            await bc._broadcast_new_job(booking_b)
            bb = await db.bookings.find_one({"id": bid_b}, {"_id": 0})
            return (raj, manoj, amit, vikash, ba, bid_b, bb)

        raj, manoj, amit, vikash, ba, bid_b, bb = asyncio.run(go())
        offered_a = ba.get("offered_partner_ids") or []
        pending_a = ba.get("free_alert_pending_ids") or []
        print("A offered:", offered_a, "pending:", pending_a,
              "release_at:", ba.get("free_alert_release_at"))

        # Scenario A assertions
        pros = [p for p in (raj["id"], manoj["id"]) if p in offered_a]
        assert len(pros) >= 1, f"No Pro partner offered: {offered_a}"
        assert amit["id"] not in offered_a, \
            f"Free Amit should be held, but was offered: {offered_a}"
        assert amit["id"] in pending_a, \
            f"Free Amit missing from pending: {pending_a}"
        assert ba.get("free_alert_release_at"), ba
        # Rating order within Pro group — Raj(4.8) before Manoj(4.7) if both offered
        if raj["id"] in offered_a and manoj["id"] in offered_a:
            assert offered_a.index(raj["id"]) < offered_a.index(manoj["id"]), \
                f"Pro rating-desc order broken: {offered_a}"

        # Scenario B assertions
        if bb is None:
            pytest.skip("no plumbing service seeded; skipped no-Pro scenario")
        offered_b = bb.get("offered_partner_ids") or []
        pending_b = bb.get("free_alert_pending_ids") or []
        print("B offered:", offered_b, "pending:", pending_b)
        # Both free partners should be offered immediately (no hold)
        assert amit["id"] in offered_b, f"Amit missing in no-Pro offer: {offered_b}"
        assert not pending_b, f"No Pro → nothing should be held: {pending_b}"
        # Rating-desc among Free: Amit (5.0) before Vikash (4.4) when both offered
        if vikash["id"] in offered_b:
            assert offered_b.index(amit["id"]) < offered_b.index(vikash["id"]), \
                f"Free rating-desc order broken: {offered_b}"
