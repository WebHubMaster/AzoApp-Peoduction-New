"""Verify booking-related notifications include data.booking_id (REAL id) and
data.code so tapping the notification opens the correct screen.
Also static sanity check on fcm_service: no click_action='OPEN_CHAT'."""
import asyncio
import os
import sys
import time

import pytest
from pymongo import MongoClient

sys.path.insert(0, "/app/backend")
os.environ.setdefault("DOTENV_PATH", "/app/backend/.env")
from dotenv import load_dotenv  # noqa: E402

load_dotenv("/app/backend/.env")


MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
sync = MongoClient(MONGO_URL)[DB_NAME]


_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)


def _run(coro):
    """Run a coroutine on the single module-wide event loop (motor is loop-bound)."""
    return _LOOP.run_until_complete(coro)


def _notify_wrap(user_id, title, body, event_type, ctx):
    # Freshly import inside the loop so Motor uses this loop
    async def _inner():
        from controllers.booking_controller import _notify
        return await _notify(user_id, title, body, event_type=event_type, ctx=ctx)
    return _run(_inner())


def _rand_id():
    return f"TEST_{int(time.time() * 1000)}_{os.urandom(3).hex()}"


def test_notify_resolves_booking_id_from_id():
    user_id = _rand_id()
    bid = _rand_id()
    code = "AZOTST1"
    sync.bookings.insert_one({"id": bid, "code": code, "customer_id": user_id,
                              "status": "assigned", "created_at": "2026-01-01T00:00:00Z"})
    try:
        _notify_wrap(user_id, "Partner assigned", "Partner on the way",
                     "booking_update", {"booking_id": bid, "type": "booking_update"})
        n = sync.notifications.find_one({"user_id": user_id}, {"_id": 0}, sort=[("created_at", -1)])
        assert n is not None, "No notification stored"
        data = n.get("data") or {}
        assert data.get("booking_id") == bid, f"expected real id {bid}, got {data.get('booking_id')}"
        assert data.get("code") == code, f"expected code {code}, got {data.get('code')}"
        assert data.get("type") == "booking_update"
    finally:
        sync.bookings.delete_one({"id": bid})
        sync.notifications.delete_many({"user_id": user_id})


def test_notify_resolves_booking_id_from_code():
    """ctx['booking_id'] may be a CODE — _notify should resolve to the real id."""
    user_id = _rand_id()
    bid = _rand_id()
    code = "AZOTST2"
    sync.bookings.insert_one({"id": bid, "code": code, "customer_id": user_id,
                              "status": "assigned", "created_at": "2026-01-01T00:00:00Z"})
    try:
        _notify_wrap(user_id, "Partner arrived", "Arrived",
                     "partner_arrived", {"booking_id": code, "type": "partner_arrived"})
        n = sync.notifications.find_one({"user_id": user_id}, {"_id": 0}, sort=[("created_at", -1)])
        assert n is not None
        data = n.get("data") or {}
        assert data.get("booking_id") == bid, "code input must be resolved to real id"
        assert data.get("code") == code
        assert data.get("type") == "partner_arrived"
    finally:
        sync.bookings.delete_one({"id": bid})
        sync.notifications.delete_many({"user_id": user_id})


def test_notify_no_booking_ctx_no_data_booking_id():
    """When ctx has no booking_id → data.booking_id not injected by _notify."""
    user_id = _rand_id()
    try:
        _notify_wrap(user_id, "Hello", "World", "general", {})
        n = sync.notifications.find_one({"user_id": user_id}, {"_id": 0}, sort=[("created_at", -1)])
        assert n is not None
        data = n.get("data") or {}
        assert not data.get("booking_id")
    finally:
        sync.notifications.delete_many({"user_id": user_id})


def test_fcm_service_has_no_open_chat_click_action():
    with open("/app/backend/services/fcm_service.py", encoding="utf-8") as f:
        src = f.read()
    assert "OPEN_CHAT" not in src, "click_action='OPEN_CHAT' must be removed"
    # The whole AndroidNotification.click_action should not be set anywhere now
    assert "click_action=" not in src, "AndroidNotification click_action should not be set"


def test_notifications_list_endpoint_works():
    import requests
    base = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/")
    s = requests.Session()
    r = s.post(f"{base}/api/auth/send-otp", json={"phone": "+919000000004"}, timeout=20)
    assert r.status_code == 200, r.text
    otp = r.json().get("dev_otp") or "123456"
    r = s.post(f"{base}/api/auth/verify-otp", json={"phone": "+919000000004", "otp": otp}, timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    r2 = s.get(f"{base}/api/notifications", headers={"Authorization": f"Bearer {tok}"}, timeout=20)
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert isinstance(body, (list, dict))
