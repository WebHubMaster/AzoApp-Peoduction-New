"""Verify a challenge unlock emits the `challenge_unlocked` realtime event + credits wallet."""
import asyncio
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from config.database import db, now_iso  # noqa: E402
from models.user import new_id  # noqa: E402
from services import partner_service as ps  # noqa: E402
from services import realtime as rt  # noqa: E402


async def main():
    partner = await db.users.find_one({"role": "partner"}, {"_id": 0, "id": 1})
    assert partner, "need a partner"
    pid = partner["id"]

    # Capture realtime emits.
    captured = []
    orig = rt.emit_user
    rt.emit_user = lambda uid, typ, data=None: captured.append((uid, typ, data))

    # Create a clearly-eligible incentive (partner already has completed jobs).
    inc_id = new_id()
    inc = {"id": inc_id, "name": "Perf Test Milestone", "description": "Any 1 job",
           "bonus_amount": 250, "job_target": 1, "revenue_target": 0, "rating_min": 0,
           "status": "active", "created_at": now_iso()}
    await db.partner_incentives.insert_one(dict(inc))
    # Make sure a completion row exists so progress is eligible.
    await db.commission_ledger.insert_one({
        "id": new_id(), "partner_id": pid, "booking_id": new_id(),
        "booking_code": "UNLOCKTEST-1", "partner_earning": 300, "kind": "completion",
        "created_at": now_iso()})
    # Clear any prior award for a clean run.
    await db.partner_incentive_awards.delete_many({"incentive_id": inc_id, "partner_id": pid})

    try:
        credited = await ps.auto_award_incentives(pid)
        print("credited:", credited)
        events = [c for c in captured if c[1] == "challenge_unlocked"]
        print("challenge_unlocked events:", events)
        assert any(e[2].get("name") == "Perf Test Milestone" and e[2].get("amount") == 250 for e in events), \
            "challenge_unlocked event not emitted with correct name/amount"
        award = await db.partner_incentive_awards.find_one({"incentive_id": inc_id, "partner_id": pid}, {"_id": 0})
        assert award and award.get("status") == "paid", "award not marked paid"
        print("\nCHALLENGE UNLOCK CELEBRATION EVENT VERIFIED ✅")
    finally:
        rt.emit_user = orig
        await db.partner_incentives.delete_many({"id": inc_id})
        await db.partner_incentive_awards.delete_many({"incentive_id": inc_id, "partner_id": pid})
        await db.commission_ledger.delete_many({"booking_code": "UNLOCKTEST-1"})


if __name__ == "__main__":
    asyncio.run(main())
