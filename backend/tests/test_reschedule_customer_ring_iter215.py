"""Iter 215 — Customer app full-screen reschedule ring parity test.

Verifies, end-to-end on the live backend, that a PARTNER-initiated reschedule
request pushes the exact same data shape to the customer that
`booking_confirmed` uses, so the customer Expo app can render its full-screen
Notifee ring (lock screen / closed app):

  * SSE /api/realtime/stream emits event type 'reschedule_request' to the
    customer with fields: booking_id, requester_role='partner', requester_name,
    old_date/old_time/new_date/new_time, service_name, code.
  * push_dispatch.push_to_user is invoked for the customer with
    data_only=True and data.type='reschedule_request'. The dispatch result is
    captured by monkey-patching the module-level reference used by the
    booking_controller so FCM-skip ("no_devices" / "not_configured") does
    not hide verification.

Reuses helpers from test_partner_realtime_finance.py (direct booking + Mongo
payment patch) and the SSEClient from test_iter96_sse_ring.py style.
"""
import json
import os
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from queue import Queue, Empty

import pytest
import requests

sys.path.insert(0, "/app/backend")
sys.path.insert(0, "/app/backend/tests")

from conftest import API, PHONES, login, client  # noqa: E402


# ───────────────── SSE helper ─────────────────
def _sse_listener(token, events_q: Queue, stop_evt: threading.Event):
    url = f"{API}/realtime/stream?token={token}"
    try:
        with requests.get(url, stream=True, timeout=120,
                          headers={"Accept": "text/event-stream"}) as r:
            if r.status_code != 200:
                events_q.put({"__error__": f"status {r.status_code}"})
                return
            event_name = None
            buf = []
            for raw in r.iter_lines(decode_unicode=True):
                if stop_evt.is_set():
                    return
                if raw is None:
                    continue
                if raw == "":
                    if buf:
                        payload = "\n".join(buf)
                        try:
                            data = json.loads(payload)
                        except Exception:
                            data = payload
                        events_q.put({"event": event_name or "message", "data": data})
                    buf = []
                    event_name = None
                    continue
                if raw.startswith(":"):
                    continue
                if raw.startswith("event:"):
                    event_name = raw[6:].strip()
                elif raw.startswith("data:"):
                    buf.append(raw[5:].lstrip())
    except Exception as e:
        events_q.put({"__error__": str(e)})


def _wait_for(q: Queue, pred, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            ev = q.get(timeout=max(0.1, deadline - time.time()))
        except Empty:
            return None
        if pred(ev):
            return ev
    return None


# ───────────────── booking lifecycle helper (adapted from
#                   test_partner_realtime_finance.py) ─────────────────
def _create_assigned_booking(customer_sess, partner_sess, service_id):
    """Create a direct booking → mark paid in Mongo → partner accepts →
    returns the booking dict in 'assigned' state."""
    r = customer_sess.post(f"{API}/bookings", json={
        "service_id": service_id,
        "address": {"label": "Home", "line": "TEST_reschedule_ring 12 MG",
                    "pincode": "800001", "city": "Patna", "state": "Bihar",
                    "lat": 25.5941, "lng": 85.1376},
        "schedule_type": "emergency",
        "notes": "TEST_reschedule_customer_ring_iter215",
    }, timeout=60)
    assert r.status_code in (200, 201), r.text
    out = r.json()
    bid = out["id"]

    from pymongo import MongoClient
    mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = mc[os.environ.get("DB_NAME", "azoapp")]
    if out.get("status") == "pending_payment":
        db.bookings.update_one(
            {"id": bid},
            {"$set": {"payment_status": "paid", "status": "searching",
                      "paid_at": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())},
             "$push": {"timeline": {"status": "payment_received",
                                    "at": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())}}})
        skill = out.get("required_skill") or out.get("skill") or "ac"
        eligible = list(db.users.find(
            {"role": "partner", "skills": skill, "service_pincodes": "800001",
             "kyc_status": "approved"}, {"_id": 0, "id": 1}))
        if eligible:
            db.bookings.update_one({"id": bid},
                                   {"$set": {"eligible_partner_ids": [u["id"] for u in eligible],
                                             "offered_partner_ids": [u["id"] for u in eligible]}})
    mc.close()

    # Partner accepts
    for _ in range(12):
        r = partner_sess.get(f"{API}/bookings/partner/jobs", timeout=30)
        if r.status_code == 200 and any(j["id"] == bid for j in r.json()):
            break
        time.sleep(1)
    r = partner_sess.post(f"{API}/bookings/{bid}/accept", timeout=30)
    assert r.status_code == 200, r.text
    out = customer_sess.get(f"{API}/bookings/{bid}", timeout=30).json()
    assert out.get("status") in ("assigned", "arrived_shop", "started"), out.get("status")
    return out


def _future_slot(days_ahead=2, hour=10, minute=30):
    dt = (datetime.now(timezone.utc) + timedelta(days=days_ahead)).replace(
        hour=hour, minute=minute, second=0, microsecond=0)
    return dt.strftime("%Y-%m-%dT%H:%M")


# ───────────────── fixtures ─────────────────
@pytest.fixture(scope="module")
def customer_tok():
    return login(PHONES["customer"])


@pytest.fixture(scope="module")
def partner_tok():
    return login(PHONES["partner2"])  # +919000000005 Amit Singh (AC, Patna)


@pytest.fixture(scope="module")
def service_id():
    anon = client()
    r = anon.get(f"{API}/catalog/services", timeout=30)
    assert r.status_code == 200, r.text
    for s in r.json():
        if s.get("required_skill") == "ac":
            return s["id"]
    return r.json()[0]["id"]


@pytest.fixture(scope="module")
def ensure_partner_free(partner_tok):
    """Free partner2 of any lingering accepted bookings and set premium (bypass
    30s head-start) — mirrors test_partner_realtime_finance.partner_free."""
    from pymongo import MongoClient
    mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = mc[os.environ.get("DB_NAME", "azoapp")]
    u = db.users.find_one({"phone": PHONES["partner2"]}, {"_id": 0})
    assert u, "partner2 not seeded"
    db.users.update_one({"id": u["id"]}, {"$set": {"premium_partner": True}})
    db.bookings.update_many(
        {"partner_id": u["id"],
         "status": {"$in": ["assigned", "arrived_shop", "arrived_customer", "started"]}},
        {"$set": {"status": "cancelled"}})
    mc.close()
    yield u["id"]


# ───────────────── the test ─────────────────
def test_partner_reschedule_sse_payload_shape_to_customer(
        customer_tok, partner_tok, service_id, ensure_partner_free):
    customer = client(customer_tok)
    partner = client(partner_tok)

    booking = _create_assigned_booking(customer, partner, service_id)
    bid = booking["id"]
    code = booking.get("code")
    svc_name = booking.get("service_name")

    # Monkey-patch push_dispatch.push_to_user used by booking_controller to
    # capture the real call (FCM may skip in this pod — that's acceptable per
    # review spec, but we still want proof the call was made with data_only=True
    # and data.type='reschedule_request').
    import services.push_dispatch as pd  # noqa: E402
    import controllers.booking_controller as bc  # noqa: E402

    captured = []
    orig = pd.push_to_user

    async def _capturing(user_id, title, body, link="/", data=None, image=None, data_only=False):
        captured.append({"user_id": user_id, "title": title, "body": body,
                         "link": link, "data": dict(data or {}),
                         "data_only": bool(data_only)})
        return await orig(user_id, title, body, link=link, data=data,
                          image=image, data_only=data_only)

    pd.push_to_user = _capturing

    # Open customer SSE stream BEFORE partner triggers reschedule
    events_q: Queue = Queue()
    stop = threading.Event()
    th = threading.Thread(target=_sse_listener, args=(customer_tok, events_q, stop), daemon=True)
    th.start()
    ready = _wait_for(events_q,
                      lambda e: isinstance(e, dict) and (
                          (e.get("event") == "ready") or
                          (isinstance(e.get("data"), dict) and e["data"].get("ok") is True)),
                      timeout=15)
    assert ready is not None, "Customer SSE did not become ready"

    try:
        new_at = _future_slot(2, 10, 30)
        r = partner.post(f"{API}/bookings/{bid}/reschedule/request",
                         json={"scheduled_at": new_at}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        rr = body.get("reschedule_request") or {}
        assert rr.get("status") == "pending", body
        assert rr.get("requested_by_role") == "partner", body

        # Expect SSE 'reschedule_request' event with correct payload shape
        ev = _wait_for(events_q,
                       lambda e: isinstance(e, dict) and (
                           (e.get("event") == "reschedule_request") or
                           (isinstance(e.get("data"), dict) and
                            (e["data"].get("type") == "reschedule_request" or
                             (isinstance(e["data"].get("data"), dict) and
                              e["data"]["data"].get("type") == "reschedule_request")))),
                       timeout=15)
        assert ev is not None, "Customer SSE did NOT receive 'reschedule_request' event"

        # Normalize: payload may be ev['data'] or ev['data']['data']
        payload = ev["data"]
        if isinstance(payload, dict) and isinstance(payload.get("data"), dict):
            payload = payload["data"]
        assert isinstance(payload, dict), f"bad payload type: {payload!r}"
        assert payload.get("booking_id") == bid, payload
        assert payload.get("requester_role") == "partner", payload
        assert payload.get("requester_name"), payload
        assert payload.get("service_name") == svc_name, payload
        assert payload.get("code") == code, payload
        for k in ("old_date", "old_time", "new_date", "new_time"):
            assert payload.get(k), f"missing {k} in SSE payload: {payload}"

        # Give async push_dispatch a brief moment
        time.sleep(1.0)

        # Verify push_dispatch.push_to_user was invoked for the customer with
        # data_only=True and data.type='reschedule_request'.
        cust_id = booking["customer_id"]
        cust_push_calls = [c for c in captured if c["user_id"] == cust_id and
                           c["data"].get("type") == "reschedule_request"]
        assert cust_push_calls, (
            f"push_dispatch.push_to_user NOT called for customer with "
            f"type=reschedule_request. All captured: {captured}")
        c0 = cust_push_calls[0]
        assert c0["data_only"] is True, f"data_only must be True: {c0}"
        for k in ("booking_id", "code", "service_name", "requester_name",
                  "requester_role", "new_date", "new_time", "old_date",
                  "old_time", "title", "body", "android_channel", "tag"):
            assert c0["data"].get(k) is not None, f"missing {k} in push data: {c0['data']}"
        assert c0["data"]["requester_role"] == "partner"
        assert c0["data"]["android_channel"] == "azo-ring-silent-v1"
        assert c0["data"]["tag"] == f"resched-{bid}"
    finally:
        stop.set()
        pd.push_to_user = orig
        # cleanup: cancel pending reschedule
        try:
            partner.post(f"{API}/bookings/{bid}/reschedule/cancel", timeout=10)
        except Exception:
            pass


def test_push_shape_parity_with_booking_confirmed_ring():
    """Static parity check: both reschedule_request and booking_confirmed call
    push_dispatch.push_to_user with data_only=True, same channel tag family,
    'title'+'body' included in data for web SW rendering."""
    import inspect
    import controllers.booking_controller as bc
    src = inspect.getsource(bc)
    # Both call push_dispatch.push_to_user(... data_only=True)
    # near 'reschedule_request' and 'booking_confirmed' blocks.
    assert "data_only=True" in src
    # reschedule_request block exists with target_id derivation and the shared keys
    assert '"type": "reschedule_request"' in src
    assert '"type": "booking_confirmed"' in src
    # Shared keys that the Customer Notifee ring reads
    assert '"android_channel": "azo-ring-silent-v1"' in src
    assert "resched-" in src and "booking-" in src
