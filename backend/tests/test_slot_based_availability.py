"""Slot-based partner availability / job-ring dispatch tests.

Verifies the bug-fix where a partner who accepted a FUTURE booking was wrongly
blocked from ALL new job alerts. After the fix, an accepted booking must block
ONLY that specific overlapping time slot, not the partner's whole day.

Covers:
  * MatchingEngine.slot_window / partner_free_for / available_targets unit checks
  * GET /api/bookings/partner/jobs slot-filter behaviour
  * GET /api/bookings/partner/ring-pending slot-filter behaviour
  * POST /api/bookings/{id}/accept 409 on overlapping slot, 200 on free slot
  * Instant/now conflict does NOT block a future-scheduled booking

Approach: bookings are seeded directly against MongoDB using the same
MONGO_URL / DB_NAME the backend uses, then the partner-facing routes are
exercised over HTTP against the public REACT_APP_BACKEND_URL so we test the
real running service. Test rows are prefixed TEST_SLOT_ and cleaned up.
"""
import os
import sys
import asyncio
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

# Make the backend package importable so we can call MatchingEngine directly.
sys.path.insert(0, "/app/backend")

from pymongo import MongoClient  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL",
                          "https://dispatch-excellence.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "azoapp_database")
OTP = "123456"
PARTNER_PHONE = "+919000000003"
CUSTOMER_PHONE = "+919000000004"
TAG = "TEST_SLOT_"


# ---------- helpers ----------

def _login(phone: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp",
                      json={"phone": phone, "otp": OTP}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _mk_booking(mongo, *, code, status, partner_id=None, schedule_type="schedule",
                scheduled_at=None, eligible=None, offered=None, service_id="test-svc",
                category_id="test-cat", created_at=None):
    """Insert a minimal booking row that satisfies the dispatch filters."""
    doc = {
        "id": str(uuid.uuid4()),
        "code": code,
        "status": status,
        "customer_id": "TEST_SLOT_CUSTOMER",
        "customer_name": "Slot Test Customer",
        "service_id": service_id,
        "service_name": "Slot Test Service",
        "category_id": category_id,
        "category_name": "Slot Test Category",
        "schedule_type": schedule_type,
        "scheduled_at": scheduled_at,
        "eligible_partner_ids": list(eligible or []),
        "offered_partner_ids": list(offered or []),
        "rejected_partner_ids": [],
        "pricing": {"total": 100.0, "subtotal": 100.0},
        "address": {"city": "Patna", "pincode": "800001",
                    "line1": "Test", "lat": 25.6, "lng": 85.1},
        "created_at": created_at or _now_iso(),
        "updated_at": _now_iso(),
        "timeline": [{"status": status, "at": _now_iso()}],
        "payment_status": "paid",
    }
    if partner_id:
        doc["partner_id"] = partner_id
        doc["partner_name"] = "Test Partner"
    mongo.bookings.insert_one(doc)
    return doc


def _cleanup(mongo):
    mongo.bookings.delete_many({"code": {"$regex": f"^{TAG}"}})


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    _cleanup(db)
    yield db
    _cleanup(db)
    client.close()


@pytest.fixture(scope="module")
def partner_token():
    return _login(PARTNER_PHONE)


@pytest.fixture(scope="module")
def partner_info(partner_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(partner_token), timeout=15)
    assert r.status_code == 200, r.text
    me = r.json()
    # ensure partner is ONLINE so ring-pending returns rows
    requests.put(f"{BASE_URL}/api/auth/partner/online-status",
                 headers=_h(partner_token), json={"online": True}, timeout=15)
    return me


@pytest.fixture(scope="module")
def customer_token():
    return _login(CUSTOMER_PHONE)


@pytest.fixture(scope="module")
def slots():
    """Pick slots 3 days out — safely past any 'now'/seed bookings."""
    base = datetime.now(timezone.utc) + timedelta(days=3)
    base = base.replace(hour=8, minute=0, second=0, microsecond=0)
    return {
        "accepted_slot": base,                    # accepted booking A
        "overlap_slot": base,                     # C (same slot → overlaps A)
        "free_slot":    base + timedelta(hours=2),  # B (different slot → free)
        "far_slot":     base + timedelta(hours=5),  # for accept success
    }


@pytest.fixture(scope="module")
def seeded(mongo, partner_info, slots):
    """Seed bookings A (accepted), B (free-slot searching), C (overlap searching)."""
    pid = partner_info["id"]
    # bookings must be older than PRO_HEADSTART_SECONDS for non-premium partner_jobs
    older = _iso(datetime.now(timezone.utc) - timedelta(minutes=10))
    a = _mk_booking(mongo, code=f"{TAG}A", status="assigned", partner_id=pid,
                    schedule_type="schedule", scheduled_at=_iso(slots["accepted_slot"]))
    b = _mk_booking(mongo, code=f"{TAG}B", status="searching",
                    schedule_type="schedule", scheduled_at=_iso(slots["free_slot"]),
                    eligible=[pid], offered=[pid], created_at=older)
    c = _mk_booking(mongo, code=f"{TAG}C", status="searching",
                    schedule_type="schedule", scheduled_at=_iso(slots["overlap_slot"]),
                    eligible=[pid], offered=[pid], created_at=older)
    d = _mk_booking(mongo, code=f"{TAG}D", status="searching",
                    schedule_type="schedule", scheduled_at=_iso(slots["far_slot"]),
                    eligible=[pid], offered=[pid], created_at=older)
    return {"A": a, "B": b, "C": c, "D": d, "pid": pid}


# ---------- 1) MatchingEngine unit checks ----------

# Motor caches its io_loop on first use; reuse ONE loop across the module so
# subsequent async calls don't hit "Event loop is closed".
_LOOP = asyncio.new_event_loop()


def _run(coro):
    return _LOOP.run_until_complete(coro)


class TestMatchingEngineUnit:
    def test_slot_window_scheduled(self, slots):
        from services.engines import MatchingEngine
        s, e = MatchingEngine.slot_window(
            {"schedule_type": "schedule", "scheduled_at": _iso(slots["accepted_slot"])},
            step_min=30,
        )
        assert (e - s) == timedelta(minutes=30)
        assert s == slots["accepted_slot"]

    def test_slot_window_now_uses_current(self):
        from services.engines import MatchingEngine
        fixed = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
        s, e = MatchingEngine.slot_window({"schedule_type": "now"},
                                          now=fixed, step_min=30)
        assert s == fixed and e == fixed + timedelta(minutes=30)

    def test_partner_free_for_non_overlap(self, seeded, slots):
        from services.engines import MatchingEngine
        # partner has A at accepted_slot; ask about free_slot → should be FREE
        b_free = {"schedule_type": "schedule",
                  "scheduled_at": _iso(slots["free_slot"])}
        ok = _run(MatchingEngine.partner_free_for(seeded["pid"], b_free))
        assert ok is True, "partner must be free for a non-overlapping future slot"

    def test_partner_free_for_overlap(self, seeded, slots):
        from services.engines import MatchingEngine
        b_over = {"schedule_type": "schedule",
                  "scheduled_at": _iso(slots["overlap_slot"])}
        ok = _run(MatchingEngine.partner_free_for(seeded["pid"], b_over))
        assert ok is False, "partner must NOT be free for overlapping slot"

    def test_available_targets_slot_filter(self, seeded, slots):
        from services.engines import MatchingEngine
        b_free = {"schedule_type": "schedule",
                  "scheduled_at": _iso(slots["free_slot"])}
        b_over = {"schedule_type": "schedule",
                  "scheduled_at": _iso(slots["overlap_slot"])}
        free_ids = _run(MatchingEngine.available_targets([seeded["pid"]], b_free))
        over_ids = _run(MatchingEngine.available_targets([seeded["pid"]], b_over))
        assert seeded["pid"] in free_ids, "must be alerted for non-overlap slot"
        assert seeded["pid"] not in over_ids, "must NOT be alerted for overlap slot"


# ---------- 2) HTTP endpoint slot filters ----------

class TestPartnerEndpointsSlotFilter:
    def test_partner_jobs_shows_free_hides_overlap(self, partner_token, seeded):
        r = requests.get(f"{BASE_URL}/api/bookings/partner/jobs",
                         headers=_h(partner_token), timeout=15)
        assert r.status_code == 200, r.text
        codes = {row.get("code") for row in r.json()}
        assert f"{TAG}B" in codes, f"non-overlap booking must appear in jobs feed. got={codes}"
        assert f"{TAG}C" not in codes, f"overlapping booking must NOT appear. got={codes}"

    def test_ring_pending_shows_free_hides_overlap(self, partner_token, seeded):
        r = requests.get(f"{BASE_URL}/api/bookings/partner/ring-pending",
                         headers=_h(partner_token), timeout=15)
        assert r.status_code == 200, r.text
        codes = {row.get("code") for row in r.json()}
        assert f"{TAG}B" in codes, f"non-overlap must ring. got={codes}"
        assert f"{TAG}C" not in codes, f"overlap must NOT ring. got={codes}"


# ---------- 3) accept_job slot-conflict guard ----------

class TestAcceptJobSlotConflict:
    def test_accept_overlapping_returns_409(self, partner_token, seeded):
        r = requests.post(
            f"{BASE_URL}/api/bookings/{seeded['C']['id']}/accept",
            headers=_h(partner_token), timeout=15)
        assert r.status_code == 409, f"expected 409 on overlapping slot, got {r.status_code}: {r.text}"
        assert "time slot" in r.text.lower() or "job in this" in r.text.lower()

    def test_accept_non_overlapping_succeeds(self, partner_token, seeded):
        r = requests.post(
            f"{BASE_URL}/api/bookings/{seeded['B']['id']}/accept",
            headers=_h(partner_token), timeout=15)
        assert r.status_code == 200, f"expected 200 on non-overlap, got {r.status_code}: {r.text}"
        body = r.json()
        assert body.get("status") == "assigned"
        assert body.get("partner_id") == seeded["pid"]

    def test_accept_second_non_overlap_still_ok(self, partner_token, seeded):
        # Partner already holds A (accepted_slot) and just accepted B (free_slot).
        # D is far_slot — still non-overlap with both → should also accept.
        r = requests.post(
            f"{BASE_URL}/api/bookings/{seeded['D']['id']}/accept",
            headers=_h(partner_token), timeout=15)
        assert r.status_code == 200, f"multiple non-overlap accepts must succeed, got {r.status_code}: {r.text}"


# ---------- 4) Instant/now: overlaps only current slot, not future scheduled ----------

class TestInstantVsScheduled:
    def test_instant_accepted_does_not_block_future_scheduled(self, mongo, partner_info, slots):
        pid = partner_info["id"]
        from services.engines import MatchingEngine
        # Create an in-progress instant booking (started, now-slot)
        _mk_booking(mongo, code=f"{TAG}INSTANT",
                    status="started", partner_id=pid,
                    schedule_type="now", scheduled_at=None)
        try:
            # Use a slot far from any previously accepted booking in this run.
            far_future = slots["accepted_slot"] + timedelta(days=2)
            future_b = {"schedule_type": "schedule",
                        "scheduled_at": _iso(far_future)}
            ok = _run(MatchingEngine.partner_free_for(pid, future_b))
            assert ok is True, ("partner busy on a 'now' job must still be free "
                                "for a scheduled booking days away")
            # And a new instant/now request must NOT be offered to this partner
            now_req = {"schedule_type": "now"}
            targets = _run(MatchingEngine.available_targets([pid], now_req))
            assert pid not in targets, "partner busy on instant job must not be offered another now-job"
        finally:
            mongo.bookings.delete_many({"code": f"{TAG}INSTANT"})
