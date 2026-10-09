"""Iter 269 — Partner complete_job latency fix verification.

Verifies that POST /api/bookings/{id}/complete returns within 1s even when a
notification gateway is slow. Uses sync pymongo for seeding/cleanup to avoid
pytest-asyncio event-loop lifecycle issues with Motor.
"""
import asyncio
import os
import sys
import time
import uuid

import pytest
import requests

sys.path.insert(0, "/app/backend")

from dotenv import load_dotenv  # noqa: E402
load_dotenv("/app/backend/.env")

from pymongo import MongoClient  # noqa: E402
import jwt as _jwt  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret")

_mc = MongoClient(MONGO_URL)
sdb = _mc[DB_NAME]


def _oid():
    return uuid.uuid4().hex


def _now_iso():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def _seed(after_photos=True):
    pid = f"TEST_partner_{_oid()[:8]}"
    cid = f"TEST_customer_{_oid()[:8]}"
    phone_p = "9" + str(int(time.time()*1000) % 10**9).zfill(9)
    phone_c = "8" + str((int(time.time()*1000)+1) % 10**9).zfill(9)
    sid = _oid()
    sdb.users.insert_one({
        "id": pid, "name": "TEST Partner", "phone": phone_p, "role": "partner",
        "wallet_balance": 0.0, "jobs_completed": 0, "created_at": _now_iso(),
        "current_sid": sid,
    })
    sdb.users.insert_one({
        "id": cid, "name": "TEST Customer", "phone": phone_c, "role": "customer",
        "created_at": _now_iso(),
    })
    bid = f"TEST_bk_{_oid()[:10]}"
    code = f"TB{int(time.time()*1000) % 100000}"
    sdb.bookings.insert_one({
        "id": bid, "code": code, "customer_id": cid, "partner_id": pid,
        "service_id": "svc_test", "service_name": "Test Service",
        "status": "started", "payment_status": "pending", "payment_method": "prepaid",
        "pricing": {"total": 500, "subtotal": 500, "tax": 0, "discount": 0},
        "evidence": {"before": [], "after": (["/u/x.jpg"] if after_photos else [])},
        "otps": {"start": "1111", "completion": "2222"},
        "timeline": [{"status": "started", "at": _now_iso()}],
        "additional": {}, "spare_parts": [],
        "created_at": _now_iso(), "updated_at": _now_iso(),
    })
    token = _jwt.encode({"uid": pid, "role": "partner", "sid": sid}, JWT_SECRET, algorithm="HS256")
    return pid, cid, bid, code, token


def _cleanup(pid, cid, bid):
    sdb.users.delete_many({"id": {"$in": [pid, cid]}})
    sdb.bookings.delete_one({"id": bid})
    sdb.commission_ledger.delete_many({"booking_id": bid})
    sdb.partner_ledger.delete_many({"ref_id": bid})
    sdb.notifications.delete_many({"user_id": cid})
    sdb.transactions.delete_many({"user_id": pid})
    sdb.invoices.delete_many({"booking_id": bid})


# ---------------- 1. baseline fast path (HTTP) ----------------

def test_complete_job_http_fast_path():
    pid, cid, bid, code, token = _seed()
    try:
        headers = {"Authorization": f"Bearer {token}"}
        t0 = time.perf_counter()
        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/complete",
                          json={"otp": "2222"}, headers=headers, timeout=10)
        elapsed = time.perf_counter() - t0
        print(f"[baseline] HTTP complete took {elapsed*1000:.0f}ms status={r.status_code}")
        assert r.status_code == 200, r.text
        assert elapsed < 1.0, f"complete_job took {elapsed:.2f}s (>1s baseline)"

        b = sdb.bookings.find_one({"id": bid})
        assert b["status"] == "completed"
        assert b["payment_status"] == "paid"

        cl = sdb.commission_ledger.find_one({"booking_id": bid})
        assert cl is not None, "commission_ledger row missing"
        assert cl["partner_id"] == pid

        # partner_ledger earning credit (background)
        pl = None
        for _ in range(20):
            pl = sdb.partner_ledger.find_one({"partner_id": pid})
            if pl:
                break
            time.sleep(0.1)
        assert pl is not None, "partner_ledger entry missing"

        # customer in-app notification (background)
        notif = None
        for _ in range(30):
            notif = sdb.notifications.find_one({"user_id": cid})
            if notif:
                break
            time.sleep(0.1)
        assert notif is not None, "customer in-app notification missing"
    finally:
        _cleanup(pid, cid, bid)


# ---------------- 2. slow-gateway proof (direct controller) ----------------

def test_complete_job_slow_gateway_direct():
    """Patch fcm/webpush/expo/template.fire_event to sleep 5s each. complete_job
    must still return in well under 1s because they're fire-and-forget."""
    pid, cid, bid, code, _ = _seed()

    async def _run():
        from services import fcm_service, webpush_service, expo_push_service, template_service
        from controllers import booking_controller as bc
        from config.database import db as adb

        async def slow(*a, **kw):
            await asyncio.sleep(5)
            return {"slow": True}

        # Patch all 4 slow paths referenced by notify() / _notify_now()
        orig = {
            "fcm": fcm_service.send_to_user,
            "wp": webpush_service.send_to_user,
            "ex": expo_push_service.send_to_user,
            "tpl": template_service.fire_event,
        }
        fcm_service.send_to_user = slow
        webpush_service.send_to_user = slow
        expo_push_service.send_to_user = slow
        template_service.fire_event = slow
        try:
            partner = await adb.users.find_one({"id": pid}, {"_id": 0})
            t0 = time.perf_counter()
            out = await bc.complete_job(partner, bid, "2222")
            elapsed = time.perf_counter() - t0
            print(f"[slow-gateway] complete_job took {elapsed*1000:.0f}ms")
            assert elapsed < 1.0, f"complete_job blocked by slow gateway: {elapsed:.2f}s"
            assert out is not None
            b = await adb.bookings.find_one({"id": bid}, {"_id": 0})
            assert b["status"] == "completed"
        finally:
            fcm_service.send_to_user = orig["fcm"]
            webpush_service.send_to_user = orig["wp"]
            expo_push_service.send_to_user = orig["ex"]
            template_service.fire_event = orig["tpl"]

    try:
        asyncio.run(_run())
    finally:
        _cleanup(pid, cid, bid)


# ---------------- 3. error paths ----------------

def test_complete_wrong_otp_rejected():
    pid, cid, bid, _c, token = _seed()
    try:
        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/complete",
                          json={"otp": "9999"},
                          headers={"Authorization": f"Bearer {token}"}, timeout=5)
        assert r.status_code == 400
        assert "Invalid completion OTP" in r.text
    finally:
        _cleanup(pid, cid, bid)


def test_complete_missing_after_photos_rejected():
    pid, cid, bid, _c, token = _seed(after_photos=False)
    try:
        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/complete",
                          json={"otp": "2222"},
                          headers={"Authorization": f"Bearer {token}"}, timeout=5)
        assert r.status_code == 400
        assert "after" in r.text.lower()
    finally:
        _cleanup(pid, cid, bid)


# ---------------- 4. startup indexes ----------------

def test_startup_indexes_present():
    bk_idx = sdb.bookings.index_information()
    assert any("code" in k for k in bk_idx.keys()), f"bookings.code index missing: {list(bk_idx)}"
    cl_idx = sdb.commission_ledger.index_information()
    assert any("booking_id" in k for k in cl_idx.keys()), f"commission_ledger.booking_id missing: {list(cl_idx)}"
    rf_idx = sdb.refunds.index_information()
    assert any("booking_id" in k for k in rf_idx.keys()), f"refunds.booking_id missing: {list(rf_idx)}"


# ---------------- 5. regression: start-otp + cancel notifications ----------------

def test_start_otp_wrong_rejected():
    """Regression: start-otp still 400s with wrong OTP (uses notify_bg path)."""
    pid, cid, bid, _c, token = _seed()
    # reset to assigned so start-otp is valid state
    sdb.bookings.update_one({"id": bid}, {"$set": {"status": "assigned"}})
    try:
        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/start-otp",
                          json={"otp": "0000"},
                          headers={"Authorization": f"Bearer {token}"}, timeout=5)
        assert r.status_code in (400, 403), r.text
    finally:
        _cleanup(pid, cid, bid)
