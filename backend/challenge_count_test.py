"""Verify Challenges count COMPLETED jobs only (not cancelled/rejected).
Uses a delta approach so pre-existing seeded rows don't skew the assertion."""
import asyncio
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from config.database import db, now_iso  # noqa: E402
from models.user import new_id  # noqa: E402
from services import partner_service as ps  # noqa: E402

TAG = "CHALTEST"


async def _clean(pid):
    await db.commission_ledger.delete_many({"partner_id": pid, "booking_code": {"$regex": f"^{TAG}"}})


async def main():
    partner = await db.users.find_one({"role": "partner"}, {"_id": 0})
    assert partner, "need a partner"
    pid = partner["id"]
    await _clean(pid)  # remove any leftovers from a prior run

    inc = {"id": new_id(), "name": "Test Challenge", "job_target": 5,
           "revenue_target": 0, "rating_min": 0, "bonus_amount": 100}

    base = await ps._incentive_progress(partner, inc)
    base_jobs, base_rev = base["jobs_done"], base["revenue"]
    print(f"baseline jobs_done={base_jobs} revenue={base_rev}")

    def row(kind, earn, code):
        return {"id": new_id(), "partner_id": pid, "booking_id": new_id(),
                "booking_code": code, "partner_earning": earn, "kind": kind,
                "created_at": now_iso()}

    rows = ([row("completion", 200, f"{TAG}-C{i}") for i in range(4)]       # +4 jobs, +800
            + [row("cancellation", 50, f"{TAG}-X{i}") for i in range(3)]    # must NOT count
            + [row("completion_cos", 150, f"{TAG}-COS1")]                   # +1 job, +150
            + [row("additional_work", 80, f"{TAG}-AW1")])                   # must NOT count
    await db.commission_ledger.insert_many(rows)

    after = await ps._incentive_progress(partner, inc)
    d_jobs = after["jobs_done"] - base_jobs
    d_rev = round(after["revenue"] - base_rev, 2)
    print(f"after jobs_done={after['jobs_done']} revenue={after['revenue']} | delta jobs={d_jobs} rev={d_rev}")

    await _clean(pid)

    assert d_jobs == 5, f"BUG: counted {d_jobs} new jobs; expected 5 completed (cancelled/extra leaked)"
    assert d_rev == 950.0, f"revenue delta should be 4*200+150=950, got {d_rev}"
    print("\nCHALLENGE COUNT FIX VERIFIED ✅ (completed-only; cancelled & additional_work excluded)")


if __name__ == "__main__":
    asyncio.run(main())
