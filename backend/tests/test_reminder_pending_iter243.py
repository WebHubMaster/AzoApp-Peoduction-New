"""
Backend test — iteration 243.
Verify GET /api/bookings/partner/reminder-pending returns a 'scheduled_reminder'
entry for a booking assigned to partner +919000000003 whose scheduled_at is
inside the 30-min pre-start window.
"""
import os
import sys
import asyncio
from datetime import datetime, timedelta, timezone
try:
    from zoneinfo import ZoneInfo
    IST = ZoneInfo("Asia/Kolkata")
except Exception:
    IST = timezone(timedelta(hours=5, minutes=30))

import pytest
import requests

sys.path.insert(0, "/app/backend")
from config.database import db  # noqa: E402
from models.user import new_id  # noqa: E402

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

PARTNER_PHONE = "+919000000003"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def partner_headers(api):
    r = api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": PARTNER_PHONE}, timeout=15)
    assert r.status_code == 200, r.text
    r = api.post(f"{BASE_URL}/api/auth/verify-otp",
                 json={"phone": PARTNER_PHONE, "otp": "123456", "role": "partner"}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture(scope="module")
def partner_id(partner_headers, api):
    r = api.get(f"{BASE_URL}/api/auth/me", headers=partner_headers, timeout=15)
    assert r.status_code == 200, r.text
    uid = (r.json().get("user") or r.json()).get("id") or r.json().get("id")
    assert uid
    return uid


@pytest.fixture()
def seeded_booking(partner_id):
    """Seed a booking in the 20-min-from-now window and clean up after."""
    bid = "TEST_REM_" + new_id()
    scheduled_dt = datetime.now(timezone.utc) + timedelta(minutes=20)
    scheduled_at = scheduled_dt.astimezone(IST).strftime("%Y-%m-%dT%H:%M:00")
    doc = {
        "id": bid, "code": "TESTR" + bid[-5:].upper(),
        "customer_id": "test-cust", "customer_name": "QA Customer",
        "customer_phone": "+919999999999",
        "service_id": "test-svc", "service_name": "QA Scheduled Service",
        "category_id": "", "category_name": "QA",
        "partner_id": partner_id, "partner_name": "QA Partner",
        "booking_type": "direct", "schedule_type": "schedule",
        "scheduled_at": scheduled_at,
        "status": "assigned", "payment_status": "paid",
        "pricing": {"total": 100.0, "subtotal": 100.0, "base": 100.0,
                    "addons_total": 0, "emergency_fee": 0, "surge": 0,
                    "visiting_charge": 0, "platform_fee": 0, "tax": 0,
                    "discount": 0, "convenience_fee": 0, "commission_pct": 20},
        "address": {"line": "QA addr", "city": "QA", "pincode": "000000",
                    "lat": 0, "lng": 0},
        "otps": {"start": "1234", "completion": "5678"},
        "timeline": [{"status": "assigned", "at": datetime.now(timezone.utc).isoformat()}],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    _run(db.bookings.insert_one(dict(doc)))
    yield {"id": bid, "scheduled_at": scheduled_at}
    _run(db.bookings.delete_one({"id": bid}))


def test_reminder_pending_includes_seeded_booking(api, partner_headers, seeded_booking):
    r = api.get(f"{BASE_URL}/api/bookings/partner/reminder-pending",
                headers=partner_headers, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, list), f"Expected list, got {type(body)}: {body}"
    match = [x for x in body if x.get("booking_id") == seeded_booking["id"]]
    assert match, f"Seeded booking {seeded_booking['id']} not in reminder-pending list: {body}"
    item = match[0]
    assert item.get("type") == "scheduled_reminder", item
    assert item.get("booking_id") == seeded_booking["id"]
    # Shape fields the client renders
    assert "service_name" in item
    assert "scheduled_date" in item
    assert "scheduled_time" in item


def test_reminder_pending_excludes_out_of_window(api, partner_headers, partner_id):
    """A booking scheduled >1h out must NOT appear in reminder-pending (<=30min window)."""
    bid = "TEST_REM_OUT_" + new_id()
    scheduled_dt = datetime.now(timezone.utc) + timedelta(hours=3)
    doc = {
        "id": bid, "code": "TESTRO" + bid[-4:].upper(),
        "customer_id": "test-cust", "customer_name": "QA",
        "service_id": "test-svc", "service_name": "Far QA",
        "partner_id": partner_id, "partner_name": "QA",
        "booking_type": "direct", "schedule_type": "schedule",
        "scheduled_at": scheduled_dt.astimezone(IST).strftime("%Y-%m-%dT%H:%M:00"),
        "status": "assigned", "payment_status": "paid",
        "pricing": {"total": 100, "subtotal": 100, "base": 100, "commission_pct": 20},
        "address": {"line": "x", "city": "x", "pincode": "0"},
        "otps": {"start": "1", "completion": "2"},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    _run(db.bookings.insert_one(dict(doc)))
    try:
        r = api.get(f"{BASE_URL}/api/bookings/partner/reminder-pending",
                    headers=partner_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert not any(x.get("booking_id") == bid for x in body), \
            f"Out-of-window booking leaked into reminder-pending: {body}"
    finally:
        _run(db.bookings.delete_one({"id": bid}))
