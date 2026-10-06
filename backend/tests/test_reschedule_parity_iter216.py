"""Iter 216 — Reschedule parity & regression tests.

Covers (backend-only, Expo app cannot run here):

  1. Permissions: requester (partner) gets 403 on
     POST /api/bookings/{id}/reschedule/respond; opposite party (customer)
     accepting returns 200 and updates scheduled_at.
  2. booking_confirmed push parity (regression): partner accept writes a
     notification_delivery_logs row for the customer titled "Booking confirmed".
  3. Customer-initiated reschedule still rings the PARTNER (regression) — a
     notification_delivery_logs row titled "Reschedule request" appears for the
     partner_id.
  4. Push shape parity (static source assertions): both reschedule_request and
     booking_confirmed data payloads include title/body, android_channel
     "azo-ring-silent-v1", and tag families resched-/booking-.
"""
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests

sys.path.insert(0, "/app/backend")
sys.path.insert(0, "/app/backend/tests")

from conftest import API, PHONES, login, client  # noqa: E402


# ───────────────── helpers ─────────────────
def _future_slot(days_ahead=2, hour=11, minute=30):
    dt = (datetime.now(timezone.utc) + timedelta(days=days_ahead)).replace(
        hour=hour, minute=minute, second=0, microsecond=0)
    return dt.strftime("%Y-%m-%dT%H:%M")


def _create_assigned_booking(customer_sess, partner_sess, service_id, tag):
    r = customer_sess.post(f"{API}/bookings", json={
        "service_id": service_id,
        "address": {"label": "Home", "line": f"TEST_{tag} 12 MG",
                    "pincode": "800001", "city": "Patna", "state": "Bihar",
                    "lat": 25.5941, "lng": 85.1376},
        "schedule_type": "emergency",
        "notes": f"TEST_{tag}",
    }, timeout=60)
    assert r.status_code in (200, 201), r.text
    out = r.json()
    bid = out["id"]

    from pymongo import MongoClient
    mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = mc[os.environ.get("DB_NAME", "azoapp")]
    # Free partner2 from any lingering accepted bookings so slot-conflict rules
    # don't block the next create.
    p = db.users.find_one({"phone": PHONES["partner2"]}, {"_id": 0, "id": 1})
    if p:
        db.bookings.update_many(
            {"partner_id": p["id"],
             "status": {"$in": ["assigned", "arrived_shop", "arrived_customer", "started"]}},
            {"$set": {"status": "cancelled"}})
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

    for _ in range(12):
        r = partner_sess.get(f"{API}/bookings/partner/jobs", timeout=30)
        if r.status_code == 200 and any(j["id"] == bid for j in r.json()):
            break
        time.sleep(1)
    # Record pre-count for booking_confirmed log (customer side)
    from pymongo import MongoClient as _MC
    _mc = _MC(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    _db = _mc[os.environ.get("DB_NAME", "azoapp")]
    cust_id = out["customer_id"]
    pre_bc = _db.notification_delivery_logs.count_documents(
        {"user_id": cust_id, "title": "Booking confirmed"})
    _mc.close()

    r = partner_sess.post(f"{API}/bookings/{bid}/accept", timeout=30)
    assert r.status_code == 200, r.text
    booking = customer_sess.get(f"{API}/bookings/{bid}", timeout=30).json()
    assert booking.get("status") in ("assigned", "arrived_shop", "started"), booking.get("status")
    return booking, pre_bc


@pytest.fixture(scope="module")
def partner2_free():
    """Free partner2 of lingering accepted bookings; set premium (bypass headstart)."""
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


@pytest.fixture(scope="module")
def tokens():
    return {
        "customer": login(PHONES["customer"]),
        "partner": login(PHONES["partner2"]),
    }


@pytest.fixture(scope="module")
def svc_id():
    anon = client()
    r = anon.get(f"{API}/catalog/services", timeout=30)
    assert r.status_code == 200, r.text
    for s in r.json():
        if s.get("required_skill") == "ac":
            return s["id"]
    return r.json()[0]["id"]


# ───────────────── 1. Permissions + accept path ─────────────────
def test_partner_reschedule_requester_cannot_respond_customer_can_accept(
        tokens, svc_id, partner2_free):
    customer = client(tokens["customer"])
    partner = client(tokens["partner"])
    booking, _ = _create_assigned_booking(customer, partner, svc_id, "resched_perms_216")
    bid = booking["id"]

    new_at = _future_slot(2, 12, 30)
    r = partner.post(f"{API}/bookings/{bid}/reschedule/request",
                     json={"scheduled_at": new_at}, timeout=20)
    assert r.status_code == 200, r.text

    # Requester (partner) must NOT be allowed to respond
    r403 = partner.post(f"{API}/bookings/{bid}/reschedule/respond",
                        json={"action": "accept"}, timeout=20)
    assert r403.status_code == 403, f"expected 403, got {r403.status_code} {r403.text}"

    # Opposite party (customer) can accept → 200, scheduled_at updated
    r_ok = customer.post(f"{API}/bookings/{bid}/reschedule/respond",
                         json={"action": "accept"}, timeout=20)
    assert r_ok.status_code == 200, r_ok.text
    body = r_ok.json()
    assert body.get("scheduled_at") == new_at, (
        f"scheduled_at not updated: expected {new_at}, got {body.get('scheduled_at')}")
    assert body.get("reschedule_request") in (None, {}), body.get("reschedule_request")


# ───────────────── 2. booking_confirmed push regression ─────────────────
def test_booking_confirmed_push_logged_for_customer(tokens, svc_id, partner2_free):
    """Partner acceptance must push 'Booking confirmed' to the customer. Verified
    via a new notification_delivery_logs row (title='Booking confirmed') for the
    customer_id — same observable side-effect used for the reschedule test."""
    customer = client(tokens["customer"])
    partner = client(tokens["partner"])
    booking, pre_bc = _create_assigned_booking(customer, partner, svc_id, "bconf_216")
    cust_id = booking["customer_id"]

    # push is dispatched async in accept_job; wait briefly
    time.sleep(1.5)

    from pymongo import MongoClient
    mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = mc[os.environ.get("DB_NAME", "azoapp")]
    post_bc = db.notification_delivery_logs.count_documents(
        {"user_id": cust_id, "title": "Booking confirmed"})
    mc.close()
    assert post_bc > pre_bc, (
        f"booking_confirmed push NOT invoked for customer "
        f"(before={pre_bc}, after={post_bc})")


# ───────────────── 3. Customer→partner reschedule still rings partner ─────────────────
def test_customer_reschedule_rings_partner(tokens, svc_id, partner2_free):
    customer = client(tokens["customer"])
    partner = client(tokens["partner"])
    booking, _ = _create_assigned_booking(customer, partner, svc_id, "cust_reschedule_216")
    bid = booking["id"]
    partner_id = booking.get("partner_id")
    assert partner_id, "partner_id missing on assigned booking"

    from pymongo import MongoClient
    mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = mc[os.environ.get("DB_NAME", "azoapp")]
    pre = db.notification_delivery_logs.count_documents(
        {"user_id": partner_id, "title": "Reschedule request"})

    new_at = _future_slot(3, 10, 30)
    r = customer.post(f"{API}/bookings/{bid}/reschedule/request",
                      json={"scheduled_at": new_at}, timeout=20)
    assert r.status_code == 200, r.text

    time.sleep(1.5)
    post = db.notification_delivery_logs.count_documents(
        {"user_id": partner_id, "title": "Reschedule request"})
    mc.close()
    assert post > pre, (
        f"Reschedule request push NOT invoked for partner on customer-initiated "
        f"reschedule (before={pre}, after={post})")


# ───────────────── 4. Static source parity for push shape ─────────────────
def test_source_parity_push_shape():
    """Belt-and-braces: both branches use data_only=True, same channel, same tag
    family, and include title/body/android_channel in data for the web SW path."""
    import inspect
    import controllers.booking_controller as bc
    src = inspect.getsource(bc)

    # reschedule block — skip past the SSE "ring" dict to the push_to_user call
    r_start = src.index('push_dispatch.push_to_user',
                        src.index('"type": "reschedule_request"'))
    r_block = src[r_start:r_start + 2500]
    assert "data_only=True" in r_block, "reschedule push missing data_only=True"
    assert '"android_channel": "azo-ring-silent-v1"' in r_block
    assert '"tag": f"resched-' in r_block
    assert '"title": "Reschedule request"' in r_block
    assert '"body":' in r_block

    # booking_confirmed block (accept_job) — skip to push_to_user
    b_start = src.index('push_dispatch.push_to_user',
                        src.index('"type": "booking_confirmed"'))
    b_block = src[b_start:b_start + 2500]
    assert "data_only=True" in b_block, "booking_confirmed push missing data_only=True"
    assert '"android_channel": "azo-ring-silent-v1"' in b_block
    assert '"tag": f"booking-' in b_block
    assert '"title": "Booking confirmed"' in b_block
    assert '"body":' in b_block
