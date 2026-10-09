"""Backend tests for Milestone Celebration (challenge_unlocked event).

Covers:
  1. auto_award_incentives credits wallet AND emits realtime `challenge_unlocked` event.
  2. Idempotency: second call does NOT credit again and does NOT emit duplicate event.
  3. Regression: _incentive_progress counts COMPLETED jobs only (excludes cancellation
     and cancellation_cos rows and additional_work).
  4. Regression: GET /api/partner/challenges and /api/partner/incentives return correct
     progress for a seeded partner (API-level smoke).
"""
import os
import sys
import asyncio
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

BACKEND_DIR = Path("/app/backend")
sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env")

# Create a single loop and bind the motor client to it BEFORE importing db.
_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)

from config.database import db, now_iso  # noqa: E402
from models.user import new_id  # noqa: E402
from services import partner_service as ps  # noqa: E402
from services import realtime as rt  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
PARTNER_PHONE = "+919000000003"
TAG = "UNLOCKTEST"


# ---------- helpers ----------

@pytest.fixture(scope="module")
def event_loop():
    yield _LOOP
    _LOOP.close()


@pytest.fixture(scope="module")
def partner(event_loop):
    p = event_loop.run_until_complete(
        db.users.find_one({"role": "partner"}, {"_id": 0}))
    assert p, "need a seeded partner"
    return p


@pytest.fixture(autouse=True)
def _cleanup(event_loop, partner):
    yield
    pid = partner["id"]
    event_loop.run_until_complete(db.partner_incentives.delete_many({"name": {"$regex": f"^{TAG}"}}))
    event_loop.run_until_complete(db.partner_incentive_awards.delete_many({"partner_id": pid, "amount": {"$in": [250, 300]}}))
    event_loop.run_until_complete(db.commission_ledger.delete_many({"booking_code": {"$regex": f"^{TAG}"}}))
    event_loop.run_until_complete(db.partner_ledger.delete_many({"note": {"$regex": f"{TAG}"}}))


# ---------- 1 & 2: emit + idempotency ----------

async def _make_eligible_incentive(pid, name, bonus=250):
    inc_id = new_id()
    await db.partner_incentives.insert_one({
        "id": inc_id, "name": name, "description": "test", "bonus_amount": bonus,
        "job_target": 1, "revenue_target": 0, "rating_min": 0,
        "status": "active", "created_at": now_iso()})
    await db.commission_ledger.insert_one({
        "id": new_id(), "partner_id": pid, "booking_id": new_id(),
        "booking_code": f"{TAG}-ELIG-{inc_id[:6]}", "partner_earning": 300,
        "kind": "completion", "created_at": now_iso()})
    await db.partner_incentive_awards.delete_many({"incentive_id": inc_id, "partner_id": pid})
    return inc_id


def test_auto_award_emits_challenge_unlocked_and_credits(event_loop, partner):
    pid = partner["id"]
    name = f"{TAG} Milestone A"
    captured = []
    orig = rt.emit_user
    rt.emit_user = lambda uid, typ, data=None: captured.append((uid, typ, data))
    try:
        inc_id = event_loop.run_until_complete(_make_eligible_incentive(pid, name, 250))
        wallet_before = (event_loop.run_until_complete(
            db.users.find_one({"id": pid}, {"_id": 0, "wallet_balance": 1})) or {}).get("wallet_balance", 0)

        credited = event_loop.run_until_complete(ps.auto_award_incentives(pid))

        # credit event list contains our incentive
        assert any(c["incentive_id"] == inc_id and c["amount"] == 250 for c in credited), credited

        # realtime event emitted
        events = [c for c in captured if c[1] == "challenge_unlocked" and c[2].get("name") == name]
        assert len(events) == 1, f"expected 1 challenge_unlocked, got {events}"
        payload = events[0][2]
        assert payload["amount"] == 250
        assert payload["bonus_amount"] == 250
        assert payload["auto"] is True
        assert events[0][0] == pid  # targeted at this partner

        # award marked paid
        award = event_loop.run_until_complete(db.partner_incentive_awards.find_one(
            {"incentive_id": inc_id, "partner_id": pid}, {"_id": 0}))
        assert award and award["status"] == "paid"
        assert award["auto"] is True

        # wallet credited
        wallet_after = (event_loop.run_until_complete(
            db.users.find_one({"id": pid}, {"_id": 0, "wallet_balance": 1})) or {}).get("wallet_balance", 0)
        assert round(wallet_after - wallet_before, 2) == 250.0
    finally:
        rt.emit_user = orig


def test_auto_award_is_idempotent_no_duplicate_emit_or_credit(event_loop, partner):
    pid = partner["id"]
    name = f"{TAG} Milestone B"
    captured = []
    orig = rt.emit_user
    rt.emit_user = lambda uid, typ, data=None: captured.append((uid, typ, data))
    try:
        inc_id = event_loop.run_until_complete(_make_eligible_incentive(pid, name, 250))

        # first run - credits + emits
        first = event_loop.run_until_complete(ps.auto_award_incentives(pid))
        assert any(c["incentive_id"] == inc_id for c in first)
        wallet_mid = (event_loop.run_until_complete(
            db.users.find_one({"id": pid}, {"_id": 0, "wallet_balance": 1})) or {}).get("wallet_balance", 0)
        first_events = [c for c in captured if c[1] == "challenge_unlocked" and c[2].get("name") == name]
        assert len(first_events) == 1

        # second run - must be a no-op
        second = event_loop.run_until_complete(ps.auto_award_incentives(pid))
        assert not any(c["incentive_id"] == inc_id for c in second), \
            f"idempotency BROKEN: {second}"
        wallet_after = (event_loop.run_until_complete(
            db.users.find_one({"id": pid}, {"_id": 0, "wallet_balance": 1})) or {}).get("wallet_balance", 0)
        assert wallet_mid == wallet_after, "wallet credited again!"

        later_events = [c for c in captured if c[1] == "challenge_unlocked" and c[2].get("name") == name]
        assert len(later_events) == 1, f"duplicate emit: {later_events}"
    finally:
        rt.emit_user = orig


# ---------- 3: regression - count only completed jobs ----------

def test_incentive_progress_counts_completed_jobs_only(event_loop, partner):
    pid = partner["id"]
    event_loop.run_until_complete(
        db.commission_ledger.delete_many({"booking_code": {"$regex": f"^{TAG}-COUNT"}}))

    inc = {"id": new_id(), "name": f"{TAG} CountCheck", "job_target": 5,
           "revenue_target": 0, "rating_min": 0, "bonus_amount": 100}

    base = event_loop.run_until_complete(ps._incentive_progress(partner, inc))
    base_jobs = base["jobs_done"]
    base_rev = base["revenue"]

    def row(kind, earn, i):
        return {"id": new_id(), "partner_id": pid, "booking_id": new_id(),
                "booking_code": f"{TAG}-COUNT-{kind}-{i}", "partner_earning": earn,
                "kind": kind, "created_at": now_iso()}

    rows = ([row("completion", 200, i) for i in range(4)]
            + [row("completion_cos", 150, 0)]
            + [row("cancellation", 50, i) for i in range(3)]
            + [row("cancellation_cos", 40, 0)]
            + [row("additional_work", 80, 0)])
    event_loop.run_until_complete(db.commission_ledger.insert_many(rows))

    try:
        after = event_loop.run_until_complete(ps._incentive_progress(partner, inc))
        d_jobs = after["jobs_done"] - base_jobs
        d_rev = round(after["revenue"] - base_rev, 2)
        assert d_jobs == 5, f"expected 5 completed jobs counted, got {d_jobs}"
        assert d_rev == 950.0, f"expected revenue delta 950 (4*200+150), got {d_rev}"
    finally:
        event_loop.run_until_complete(
            db.commission_ledger.delete_many({"booking_code": {"$regex": f"^{TAG}-COUNT"}}))


# ---------- 4: API regression ----------

@pytest.fixture(scope="module")
def partner_token():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": PARTNER_PHONE})
    if r.status_code != 200:
        pytest.skip(f"send-otp failed: {r.status_code} {r.text}")
    r = s.post(f"{BASE_URL}/api/auth/verify-otp",
               json={"phone": PARTNER_PHONE, "otp": "123456"})
    if r.status_code != 200:
        pytest.skip(f"verify-otp failed: {r.status_code} {r.text}")
    data = r.json()
    tok = data.get("token") or data.get("access_token") or (data.get("session") or {}).get("token")
    if not tok:
        pytest.skip(f"no token in response: {data}")
    return tok


def test_api_partner_challenges_returns_200(partner_token):
    r = requests.get(f"{BASE_URL}/api/partner/challenges",
                     headers={"Authorization": f"Bearer {partner_token}"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, (list, dict))
    items = body if isinstance(body, list) else body.get("items", body.get("challenges", []))
    assert isinstance(items, list)
    for it in items:
        for k in ("id", "name", "jobs_done", "progress_pct", "eligible"):
            assert k in it, f"missing {k} in challenge item: {it}"


def test_api_partner_incentives_returns_200(partner_token):
    r = requests.get(f"{BASE_URL}/api/partner/incentives",
                     headers={"Authorization": f"Bearer {partner_token}"})
    assert r.status_code == 200, r.text
    body = r.json()
    items = body if isinstance(body, list) else body.get("items", body.get("incentives", []))
    assert isinstance(items, list)
