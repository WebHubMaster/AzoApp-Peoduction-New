"""API-level verification: Partner challenges/incentives count ONLY completed jobs.

Covers:
- /api/partner/challenges  (jobs_done, remaining_jobs, progress_pct)
- /api/partner/incentives  (regression)
Direct DB delta approach: insert mixed ledger rows for the seeded partner and
assert that only kind in {completion, completion_cos} increment jobs_done.
"""
import os
import asyncio
import requests
import pytest
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

BASE_URL = os.environ.get("TEST_BACKEND_URL", "http://localhost:8001")
PARTNER_PHONE = "+919000000003"
TAG = "TESTAGENT"

# Import DB lazily so pytest discovery works even if backend isn't configured
from config.database import db, now_iso  # noqa: E402
from models.user import new_id  # noqa: E402


@pytest.fixture(scope="module")
def partner_token():
    r = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": PARTNER_PHONE}, timeout=10)
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp",
                      json={"phone": PARTNER_PHONE, "otp": "123456"}, timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"No token in response: {data}"
    return token


@pytest.fixture(scope="module")
def auth_headers(partner_token):
    return {"Authorization": f"Bearer {partner_token}"}


@pytest.fixture(scope="module")
def partner_id():
    async def _get():
        p = await db.users.find_one({"phone": PARTNER_PHONE}, {"_id": 0, "id": 1})
        return p["id"] if p else None
    pid = asyncio.get_event_loop().run_until_complete(_get())
    assert pid, "seeded partner not found"
    return pid


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _cleanup(pid):
    _run(db.commission_ledger.delete_many(
        {"partner_id": pid, "booking_code": {"$regex": f"^{TAG}"}}))


def _get_challenges(headers):
    r = requests.get(f"{BASE_URL}/api/partner/challenges", headers=headers, timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    if isinstance(data, dict):
        return data.get("challenges", []) or data.get("items", [])
    return data


def _get_incentives(headers):
    r = requests.get(f"{BASE_URL}/api/partner/incentives", headers=headers, timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    if isinstance(data, dict):
        return data.get("incentives", []) or data.get("items", [])
    return data


def _sum_jobs(items):
    """Sum jobs_done across all challenges/incentives for delta comparison."""
    return sum(int(i.get("jobs_done", 0)) for i in items)


def _sum_revenue(items):
    return round(sum(float(i.get("revenue", 0)) for i in items), 2)


class TestChallengeJobCount:
    def test_endpoints_reachable(self, auth_headers):
        ch = _get_challenges(auth_headers)
        inc = _get_incentives(auth_headers)
        assert isinstance(ch, list)
        assert isinstance(inc, list)
        assert len(ch) > 0, "no challenges seeded for partner"

    def test_cancellation_rows_do_not_count(self, auth_headers, partner_id):
        _cleanup(partner_id)
        base_ch = _get_challenges(auth_headers)
        base_inc = _get_incentives(auth_headers)
        base_jobs_ch = _sum_jobs(base_ch)
        base_jobs_inc = _sum_jobs(base_inc)
        base_rev_inc = _sum_revenue(base_inc)

        def row(kind, earn, code):
            return {"id": new_id(), "partner_id": partner_id, "booking_id": new_id(),
                    "booking_code": code, "partner_earning": earn, "kind": kind,
                    "created_at": now_iso()}

        rows = (
            [row("completion", 200, f"{TAG}-C{i}") for i in range(4)]        # +4 jobs, +800
            + [row("completion_cos", 150, f"{TAG}-COS1")]                     # +1 job, +150
            + [row("cancellation", 50, f"{TAG}-X{i}") for i in range(3)]      # must NOT count
            + [row("cancellation_cos", 25, f"{TAG}-XC1")]                     # must NOT count
            + [row("additional_work", 80, f"{TAG}-AW1")]                      # must NOT count
        )
        _run(db.commission_ledger.insert_many(rows))

        try:
            after_ch = _get_challenges(auth_headers)
            after_inc = _get_incentives(auth_headers)

            d_ch = _sum_jobs(after_ch) - base_jobs_ch
            d_inc = _sum_jobs(after_inc) - base_jobs_inc
            d_rev = round(_sum_revenue(after_inc) - base_rev_inc, 2)

            # Each challenge/incentive sees the same +5 delta.
            n_ch = max(len(after_ch), 1)
            n_inc = max(len(after_inc), 1)
            assert d_ch == 5 * n_ch, (
                f"Challenges jobs_done delta={d_ch} across {n_ch} challenges; "
                f"expected {5 * n_ch} (5 per challenge). Cancellation leaked.")
            assert d_inc == 5 * n_inc, (
                f"Incentives jobs_done delta={d_inc} across {n_inc}; expected {5 * n_inc}.")
            # Revenue sum across incentives: 950 per incentive
            assert d_rev == 950.0 * n_inc, (
                f"Incentives revenue delta={d_rev}; expected {950.0 * n_inc}.")

            # Also sanity: remaining_jobs decreased correctly for at least one challenge
            # that is active (has a job_target).
            for c in after_ch:
                if c.get("job_target"):
                    assert c["remaining_jobs"] == max(c["job_target"] - c["jobs_done"], 0)
                    assert 0 <= c["progress_pct"] <= 100
        finally:
            _cleanup(partner_id)

    def test_only_cancellation_rows_zero_delta(self, auth_headers, partner_id):
        """Inserting ONLY cancellation rows must not change jobs_done at all."""
        _cleanup(partner_id)
        base = _sum_jobs(_get_challenges(auth_headers))
        rows = [{"id": new_id(), "partner_id": partner_id, "booking_id": new_id(),
                 "booking_code": f"{TAG}-ONLYX{i}", "partner_earning": 99,
                 "kind": "cancellation", "created_at": now_iso()} for i in range(5)]
        _run(db.commission_ledger.insert_many(rows))
        try:
            after = _sum_jobs(_get_challenges(auth_headers))
            assert after == base, f"Cancellation-only rows leaked: base={base} after={after}"
        finally:
            _cleanup(partner_id)
