"""Iter 270 — Instant success screen + offline retry safety + live customer sync.

Backend verifications:
1. POST /api/bookings/{id}/complete returns completion_summary {earning, today_earning, today_jobs}
2. GET /api/bookings/partner/today-summary returns {today_earning, today_jobs}
3. Idempotent /complete (same booking, same partner) → 200 + same summary, no duplicate ledger rows / wallet credits
4. Concurrency: 5 parallel /complete → exactly one settlement, all 200 or at most 409, none 500
5. Lock safety: 'completing' field unset after success; stale (>60s) reclaimable
6. Error paths: wrong OTP 400; not started 400 'Job not started yet'; another partner 403
7. Live sync: rt.emit_user(customer_id,'booking_update',...) emitted synchronously BEFORE response.
   Customer's /api/bookings/my/pending-reviews lists the booking with auto_prompt=True.
"""
import asyncio
import os
import sys
import time
import uuid
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

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


def _mint(uid, role, sid):
    return _jwt.encode({"uid": uid, "role": role, "sid": sid}, JWT_SECRET, algorithm="HS256")


def _seed(after_photos=True, status="started"):
    pid = f"TEST_partner_{_oid()[:8]}"
    cid = f"TEST_customer_{_oid()[:8]}"
    phone_p = "9" + str(int(time.time() * 1000) % 10**9).zfill(9)
    phone_c = "8" + str((int(time.time() * 1000) + 1) % 10**9).zfill(9)
    sid_p = _oid(); sid_c = _oid()
    sdb.users.insert_one({
        "id": pid, "name": "TEST Partner", "phone": phone_p, "role": "partner",
        "wallet_balance": 0.0, "jobs_completed": 0, "created_at": _now_iso(),
        "current_sid": sid_p,
    })
    sdb.users.insert_one({
        "id": cid, "name": "TEST Customer", "phone": phone_c, "role": "customer",
        "created_at": _now_iso(), "current_sid": sid_c,
    })
    bid = f"TEST_bk_{_oid()[:10]}"
    code = f"TB{int(time.time() * 1000) % 100000}"
    sdb.bookings.insert_one({
        "id": bid, "code": code, "customer_id": cid, "partner_id": pid,
        "service_id": "svc_test", "service_name": "Test Service",
        "status": status, "payment_status": "pending", "payment_method": "prepaid",
        "pricing": {"total": 500, "subtotal": 500, "tax": 0, "discount": 0},
        "evidence": {"before": [], "after": (["/u/x.jpg"] if after_photos else [])},
        "otps": {"start": "1111", "completion": "2222"},
        "timeline": [{"status": "started", "at": _now_iso()}],
        "additional": {}, "spare_parts": [],
        "created_at": _now_iso(), "updated_at": _now_iso(),
    })
    return pid, cid, bid, code, _mint(pid, "partner", sid_p), _mint(cid, "customer", sid_c)


def _cleanup(pid, cid, bid):
    sdb.users.delete_many({"id": {"$in": [pid, cid]}})
    sdb.bookings.delete_one({"id": bid})
    sdb.commission_ledger.delete_many({"booking_id": bid})
    sdb.partner_ledger.delete_many({"ref_id": bid})
    sdb.notifications.delete_many({"user_id": {"$in": [pid, cid]}})
    sdb.transactions.delete_many({"user_id": pid})
    sdb.invoices.delete_many({"booking_id": bid})


# -------- 1. completion_summary in response --------

def test_complete_returns_completion_summary():
    pid, cid, bid, _code, ptoken, _ctoken = _seed()
    try:
        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/complete",
                          json={"otp": "2222"},
                          headers={"Authorization": f"Bearer {ptoken}"}, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "completion_summary" in body, body
        cs = body["completion_summary"]
        for k in ("earning", "today_earning", "today_jobs"):
            assert k in cs, f"missing {k} in completion_summary: {cs}"
        assert cs["today_jobs"] >= 1
        assert float(cs["earning"]) > 0
        assert float(cs["today_earning"]) >= float(cs["earning"])
    finally:
        _cleanup(pid, cid, bid)


# -------- 2. GET /partner/today-summary --------

def test_partner_today_summary_endpoint():
    pid, cid, bid, _code, ptoken, _ctoken = _seed()
    try:
        # before completion
        r = requests.get(f"{BASE_URL}/api/bookings/partner/today-summary",
                         headers={"Authorization": f"Bearer {ptoken}"}, timeout=5)
        assert r.status_code == 200, r.text
        before = r.json()
        assert set(before.keys()) >= {"today_earning", "today_jobs"}

        # complete the job
        rc = requests.post(f"{BASE_URL}/api/bookings/{bid}/complete",
                           json={"otp": "2222"},
                           headers={"Authorization": f"Bearer {ptoken}"}, timeout=10)
        assert rc.status_code == 200, rc.text

        r2 = requests.get(f"{BASE_URL}/api/bookings/partner/today-summary",
                          headers={"Authorization": f"Bearer {ptoken}"}, timeout=5)
        assert r2.status_code == 200, r2.text
        after = r2.json()
        assert after["today_jobs"] >= before["today_jobs"] + 1
        assert float(after["today_earning"]) > float(before["today_earning"])
    finally:
        _cleanup(pid, cid, bid)


# -------- 3. Idempotency --------

def test_complete_idempotent_no_double_credit():
    pid, cid, bid, _code, ptoken, _ctoken = _seed()
    try:
        headers = {"Authorization": f"Bearer {ptoken}"}
        r1 = requests.post(f"{BASE_URL}/api/bookings/{bid}/complete",
                           json={"otp": "2222"}, headers=headers, timeout=10)
        assert r1.status_code == 200, r1.text
        summary1 = r1.json()["completion_summary"]

        # second call — same OTP
        r2 = requests.post(f"{BASE_URL}/api/bookings/{bid}/complete",
                           json={"otp": "2222"}, headers=headers, timeout=10)
        assert r2.status_code == 200, f"idempotent retry should be 200 not 400: {r2.status_code} {r2.text}"
        assert "completion_summary" in r2.json()

        # third call — any OTP (idempotent returns 200 regardless of otp per code line 3506)
        r3 = requests.post(f"{BASE_URL}/api/bookings/{bid}/complete",
                           json={"otp": "9999"}, headers=headers, timeout=10)
        assert r3.status_code == 200, r3.text

        # ledger rows: exactly one earning row for this booking
        earning_rows = list(sdb.commission_ledger.find({"booking_id": bid, "partner_earning": {"$gt": 0}}))
        assert len(earning_rows) == 1, f"duplicate commission_ledger: {len(earning_rows)}"

        # partner_ledger: exactly one 'earning' kind credit row
        pl_rows = list(sdb.partner_ledger.find({"ref_id": bid, "kind": "earning", "direction": "credit"}))
        assert len(pl_rows) == 1, f"duplicate partner_ledger earnings: {len(pl_rows)}"

        # user wallet / jobs_completed incremented ONCE
        u = sdb.users.find_one({"id": pid})
        assert u.get("jobs_completed") == 1, f"jobs_completed should be 1, got {u.get('jobs_completed')}"

        # today_jobs still 1
        assert summary1["today_jobs"] == 1
    finally:
        _cleanup(pid, cid, bid)


# -------- 4. Concurrency: 5 parallel /complete --------

def test_complete_concurrent_single_settlement():
    pid, cid, bid, _code, ptoken, _ctoken = _seed()
    try:
        headers = {"Authorization": f"Bearer {ptoken}"}

        def _hit():
            try:
                r = requests.post(f"{BASE_URL}/api/bookings/{bid}/complete",
                                  json={"otp": "2222"}, headers=headers, timeout=20)
                return r.status_code, r.text
            except Exception as e:
                return 0, str(e)

        with ThreadPoolExecutor(max_workers=5) as ex:
            results = [f.result() for f in [ex.submit(_hit) for _ in range(5)]]

        codes = [c for c, _ in results]
        print(f"[concurrent] status codes: {codes}")
        # none should be 500
        assert all(c != 500 for c in codes), f"500 under concurrency: {results}"
        # all 200 or 409
        assert all(c in (200, 409) for c in codes), f"unexpected statuses: {results}"
        assert 200 in codes, "no request succeeded"

        # exactly ONE commission_ledger earning row
        earning_rows = list(sdb.commission_ledger.find({"booking_id": bid, "partner_earning": {"$gt": 0}}))
        assert len(earning_rows) == 1, f"concurrency produced {len(earning_rows)} ledger rows"

        # exactly one partner_ledger earning row
        pl_rows = list(sdb.partner_ledger.find({"ref_id": bid, "kind": "earning", "direction": "credit"}))
        assert len(pl_rows) == 1, f"duplicate partner_ledger earnings: {len(pl_rows)}"

        # jobs_completed incremented exactly once
        u = sdb.users.find_one({"id": pid})
        assert u.get("jobs_completed") == 1, f"jobs_completed concurrency: {u.get('jobs_completed')}"
    finally:
        _cleanup(pid, cid, bid)


# -------- 5. Lock safety --------

def test_completing_lock_unset_after_success():
    pid, cid, bid, _code, ptoken, _ctoken = _seed()
    try:
        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/complete",
                          json={"otp": "2222"},
                          headers={"Authorization": f"Bearer {ptoken}"}, timeout=10)
        assert r.status_code == 200
        b = sdb.bookings.find_one({"id": bid})
        assert "completing" not in b or b.get("completing") in (None, ""), \
            f"'completing' not unset: {b.get('completing')}"
    finally:
        _cleanup(pid, cid, bid)


def test_completing_stale_lock_reclaimable():
    """Simulate stale 'completing' timestamp older than 60s → next /complete should succeed."""
    pid, cid, bid, _code, ptoken, _ctoken = _seed()
    try:
        from datetime import datetime, timezone, timedelta
        stale = (datetime.now(timezone.utc) - timedelta(seconds=120)).isoformat()
        sdb.bookings.update_one({"id": bid}, {"$set": {"completing": stale}})

        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/complete",
                          json={"otp": "2222"},
                          headers={"Authorization": f"Bearer {ptoken}"}, timeout=10)
        assert r.status_code == 200, f"stale lock should be reclaimable: {r.status_code} {r.text}"
        b = sdb.bookings.find_one({"id": bid})
        assert b["status"] == "completed"
    finally:
        _cleanup(pid, cid, bid)


# -------- 6. Error paths --------

def test_complete_wrong_otp_still_400():
    pid, cid, bid, _code, ptoken, _ctoken = _seed()
    try:
        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/complete",
                          json={"otp": "0000"},
                          headers={"Authorization": f"Bearer {ptoken}"}, timeout=5)
        assert r.status_code == 400
        assert "Invalid completion OTP" in r.text
    finally:
        _cleanup(pid, cid, bid)


def test_complete_not_started_400():
    pid, cid, bid, _code, ptoken, _ctoken = _seed(status="assigned")
    try:
        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/complete",
                          json={"otp": "2222"},
                          headers={"Authorization": f"Bearer {ptoken}"}, timeout=5)
        assert r.status_code == 400, r.text
        assert "not started" in r.text.lower()
    finally:
        _cleanup(pid, cid, bid)


def test_complete_other_partner_403():
    pid, cid, bid, _code, _ptoken, _ctoken = _seed()
    # another partner
    pid2 = f"TEST_partner_{_oid()[:8]}"
    sid2 = _oid()
    sdb.users.insert_one({
        "id": pid2, "name": "TEST Other", "phone": "9" + str(int(time.time()*1000)+2)[-9:],
        "role": "partner", "wallet_balance": 0, "jobs_completed": 0,
        "created_at": _now_iso(), "current_sid": sid2,
    })
    other_token = _mint(pid2, "partner", sid2)
    try:
        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/complete",
                          json={"otp": "2222"},
                          headers={"Authorization": f"Bearer {other_token}"}, timeout=5)
        assert r.status_code == 403, f"other partner must get 403, got {r.status_code}: {r.text}"
    finally:
        sdb.users.delete_one({"id": pid2})
        _cleanup(pid, cid, bid)


# -------- 7. Live sync + pending reviews auto_prompt --------

def test_live_sync_emit_user_called_sync_before_response():
    """Verify rt.emit_user(customer_id,'booking_update',...) is called synchronously
    with the completed brief before complete_job returns (fires in-process, not awaited)."""
    pid, cid, bid, _code, _ptoken, _ctoken = _seed()

    async def _run():
        from services import realtime as rt
        from controllers import booking_controller as bc
        from config.database import db as adb

        captured = []
        orig = rt.emit_user

        def _spy(uid, type_, data=None):
            captured.append({"uid": uid, "type": type_, "data": data})
            return orig(uid, type_, data)

        rt.emit_user = _spy
        bc.rt.emit_user = _spy  # the controller imported it as `rt`
        try:
            partner = await adb.users.find_one({"id": pid}, {"_id": 0})
            out = await bc.complete_job(partner, bid, "2222")
            # emit_user must have been called with customer_id + 'booking_update' type
            # BEFORE control returned (we captured in-process, synchronously).
            matches = [e for e in captured
                       if e["uid"] == cid and e["type"] == "booking_update"]
            assert matches, f"booking_update to customer not emitted. captured={[(e['uid']==cid, e['type']) for e in captured]}"
            m = matches[0]
            assert (m["data"] or {}).get("status") == "completed", f"brief status not completed: {m['data']}"
            # response has completion_summary
            assert "completion_summary" in out
        finally:
            rt.emit_user = orig
            bc.rt.emit_user = orig

    try:
        asyncio.run(_run())
    finally:
        _cleanup(pid, cid, bid)


def test_pending_reviews_lists_completed_with_auto_prompt():
    pid, cid, bid, _code, ptoken, ctoken = _seed()
    try:
        # complete the job
        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/complete",
                          json={"otp": "2222"},
                          headers={"Authorization": f"Bearer {ptoken}"}, timeout=10)
        assert r.status_code == 200, r.text

        # immediately fetch pending reviews for the customer
        rr = requests.get(f"{BASE_URL}/api/bookings/my/pending-reviews",
                          headers={"Authorization": f"Bearer {ctoken}"}, timeout=5)
        assert rr.status_code == 200, rr.text
        body = rr.json()
        ids = [it["id"] for it in body.get("items", [])]
        assert bid in ids, f"completed booking missing from pending-reviews: {ids}"
        item = next(it for it in body["items"] if it["id"] == bid)
        assert item["auto_prompt"] is True, f"auto_prompt should be True right after completion: {item}"
    finally:
        _cleanup(pid, cid, bid)
