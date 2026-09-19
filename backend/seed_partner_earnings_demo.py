"""Seed demo partner earnings / incentives / penalties / wallet ledger so the
admin Person360 Earnings, Wallet and Rewards & Penalties tabs have real,
internally-consistent data to display. Idempotent — safe to run repeatedly.

For every completed/paid booking assigned to a partner it writes one
partner_ledger 'earning' row (gross → 20% platform commission → 80% partner
earning). It also adds a couple of incentives and penalties for variety, then
recomputes each partner's wallet running balance (balance_after) and stores the
final wallet_balance on the user.
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone

import dotenv
from motor.motor_asyncio import AsyncIOMotorClient

dotenv.load_dotenv()

DONE = ["completed", "paid"]
COMMISSION_RATE = 0.20
SEED_TAG = "earnings_demo"


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def main():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]

    partners = await db.users.find({"role": "partner"}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
    # clear previously-seeded demo rows (keep organically-created ledger rows)
    await db.partner_ledger.delete_many({"seed": SEED_TAG})
    await db.partner_incentive_awards.delete_many({"seed": SEED_TAG})
    await db.partner_penalties.delete_many({"seed": SEED_TAG})

    total_earn_rows = 0
    inc_count = pen_count = 0

    for idx, p in enumerate(partners):
        pid = p["id"]
        bookings = await db.bookings.find(
            {"partner_id": pid, "status": {"$in": DONE}},
            {"_id": 0, "id": 1, "booking_code": 1, "service_name": 1, "customer_name": 1,
             "pricing": 1, "created_at": 1, "updated_at": 1},
        ).to_list(500)

        for b in bookings:
            gross = float((b.get("pricing") or {}).get("total") or 0)
            if gross <= 0:
                continue
            commission = round(gross * COMMISSION_RATE, 2)
            earning = round(gross - commission, 2)
            when = b.get("updated_at") or b.get("created_at") or now_iso()
            # idempotent per (partner, booking) earning row
            await db.partner_ledger.update_one(
                {"partner_id": pid, "kind": "earning", "ref_id": b["id"]},
                {"$set": {
                    "kind": "earning", "direction": "credit", "amount": earning,
                    "ref_type": "booking", "ref_id": b["id"],
                    "note": f"Earning \u00b7 {b.get('booking_code') or ''}".strip(),
                    "gross": gross, "commission": commission, "commission_rate": COMMISSION_RATE,
                    "service_name": b.get("service_name"), "customer_name": b.get("customer_name"),
                    "status": "completed", "created_at": when, "seed": SEED_TAG,
                }, "$setOnInsert": {"id": str(uuid.uuid4())}},
                upsert=True,
            )
            total_earn_rows += 1

        # incentives for ~ every partner, penalties for a few
        incentives = [
            {"name": "5-star streak bonus", "amount": 250.0, "reason": "10 consecutive 5-star jobs"},
            {"name": "Festive peak incentive", "amount": 500.0, "reason": "Completed 15+ jobs during festive week"},
        ][: (2 if idx % 2 == 0 else 1)]
        for i, inc in enumerate(incentives):
            await db.partner_incentive_awards.insert_one({
                "id": str(uuid.uuid4()), "partner_id": pid, "name": inc["name"],
                "amount": inc["amount"], "reason": inc["reason"], "status": "credited",
                "created_at": now_iso(), "seed": SEED_TAG,
            })
            await db.partner_ledger.insert_one({
                "id": str(uuid.uuid4()), "partner_id": pid, "kind": "incentive", "direction": "credit",
                "amount": inc["amount"], "ref_type": "incentive", "note": inc["name"],
                "status": "completed", "created_at": now_iso(), "seed": SEED_TAG,
            })
            inc_count += 1

        if idx % 3 == 0:
            pen = {"amount": 150.0, "reason": "Late arrival beyond promised slot"}
            await db.partner_penalties.insert_one({
                "id": str(uuid.uuid4()), "partner_id": pid, "amount": pen["amount"],
                "reason": pen["reason"], "status": "applied", "created_at": now_iso(), "seed": SEED_TAG,
            })
            await db.partner_ledger.insert_one({
                "id": str(uuid.uuid4()), "partner_id": pid, "kind": "penalty", "direction": "debit",
                "amount": pen["amount"], "ref_type": "penalty", "note": pen["reason"],
                "status": "completed", "created_at": now_iso(), "seed": SEED_TAG,
            })
            pen_count += 1

        # withdrawal debits mirrored into the wallet ledger (paid/approved ones)
        wds = await db.partner_withdrawals.find(
            {"partner_id": pid, "status": {"$in": ["paid", "completed", "approved", "processed"]}},
            {"_id": 0, "id": 1, "amount": 1, "created_at": 1},
        ).to_list(200)
        for w in wds:
            await db.partner_ledger.update_one(
                {"partner_id": pid, "kind": "withdrawal", "ref_id": w["id"]},
                {"$set": {
                    "kind": "withdrawal", "direction": "debit", "amount": float(w.get("amount") or 0),
                    "ref_type": "withdrawal", "ref_id": w["id"], "note": "Withdrawal to bank/UPI",
                    "status": "completed", "created_at": w.get("created_at") or now_iso(), "seed": SEED_TAG,
                }, "$setOnInsert": {"id": str(uuid.uuid4())}},
                upsert=True,
            )

        # recompute running balance + final wallet balance from the full ledger
        ledger = await db.partner_ledger.find({"partner_id": pid}, {"_id": 0}).sort("created_at", 1).to_list(5000)
        bal = 0.0
        for row in ledger:
            amt = float(row.get("amount") or 0)
            bal += amt if row.get("direction") == "credit" else -amt
            bal = round(bal, 2)
            await db.partner_ledger.update_one({"id": row["id"]}, {"$set": {"wallet_balance": bal, "balance_after": bal}})
        await db.users.update_one({"id": pid}, {"$set": {"wallet_balance": max(bal, 0.0)}})

    print(f"Seeded earnings rows: {total_earn_rows} | incentives: {inc_count} | penalties: {pen_count} | partners: {len(partners)}")


if __name__ == "__main__":
    asyncio.run(main())
