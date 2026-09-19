"""Idempotent demo seed for the Partner Alerts / Ring features:
   - alert_prefs (account-synced ringtone + quiet-hours)
   - accept_streak / best_streak (Streak Rewards)
   - partner_response_events (accepted / missed) for weekly Missed Insights

Run: python seed_partner_alerts_demo.py
"""
import asyncio
import random
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
from config.database import db, now_iso  # noqa: E402


def _new_id():
    import uuid
    return str(uuid.uuid4())


# phone -> demo profile for the ring features
DEMO = {
    "+919000000003": {  # Raj Kumar — top responder
        "alert_prefs": {"tone": "chime", "volume": 0.85,
                        "dndEnabled": True, "dndStart": "22:00", "dndEnd": "07:00"},
        "accept_streak": 6, "best_streak": 12,
        "accepted": 11, "missed": 2,
    },
    "+919000000005": {  # Amit Singh — mid responder
        "alert_prefs": {"tone": "urgent", "volume": 0.7,
                        "dndEnabled": False, "dndStart": "23:00", "dndEnd": "06:30"},
        "accept_streak": 3, "best_streak": 8,
        "accepted": 7, "missed": 4,
    },
    "+919000000011": {  # Suresh Yadav — needs improvement
        "alert_prefs": {"tone": "pulse", "volume": 0.6,
                        "dndEnabled": True, "dndStart": "21:30", "dndEnd": "08:00"},
        "accept_streak": 0, "best_streak": 5,
        "accepted": 4, "missed": 6,
    },
    "+919000000012": {  # Vikash Kumar
        "alert_prefs": {"tone": "classic", "volume": 0.75,
                        "dndEnabled": False, "dndStart": "22:00", "dndEnd": "07:00"},
        "accept_streak": 9, "best_streak": 14,
        "accepted": 13, "missed": 1,
    },
}


def _spread_times(n, days=7):
    """n timestamps randomly across the last `days` days (ISO strings)."""
    now = datetime.now(timezone.utc)
    out = []
    for _ in range(n):
        secs = random.randint(0, days * 24 * 3600 - 1)
        out.append((now - timedelta(seconds=secs)).isoformat())
    return sorted(out)


async def main():
    total_events = 0
    for phone, cfg in DEMO.items():
        u = await db.users.find_one({"phone": phone}, {"_id": 0, "id": 1, "name": 1})
        if not u:
            print(f"skip {phone} (no such partner)")
            continue
        uid = u["id"]

        # 1) account-synced alert prefs + streak fields
        await db.users.update_one(
            {"id": uid},
            {"$set": {
                "alert_prefs": cfg["alert_prefs"],
                "accept_streak": cfg["accept_streak"],
                "best_streak": cfg["best_streak"],
            }})

        # 2) rebuild this week's response events (idempotent: wipe last-7-days demo rows)
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        await db.partner_response_events.delete_many(
            {"user_id": uid, "at": {"$gte": week_ago}})

        # 2b) Reward Payouts: back-fill accept-streak milestone bonuses (₹50 every
        #     5-in-a-row) based on the partner's best streak. Idempotent.
        THRESHOLD, BONUS = 5, 50.0
        old = await db.partner_ledger.find(
            {"partner_id": uid, "kind": "accept_streak_bonus"},
            {"_id": 0, "amount": 1}).to_list(1000)
        if old:
            removed = sum(float(o.get("amount", 0) or 0) for o in old)
            await db.partner_ledger.delete_many({"partner_id": uid, "kind": "accept_streak_bonus"})
            await db.users.update_one({"id": uid}, {"$inc": {"wallet_balance": -removed}})
        milestones = cfg["best_streak"] // THRESHOLD
        earned = 0.0
        for m in range(1, milestones + 1):
            streak_val = m * THRESHOLD
            await db.partner_ledger.insert_one({
                "id": _new_id(), "partner_id": uid, "kind": "accept_streak_bonus",
                "direction": "credit", "amount": BONUS, "ref_type": "accept_streak",
                "ref_id": f"accept-streak-{streak_val}",
                "note": f"Accept-streak bonus \u00b7 {streak_val} requests accepted in a row",
                "status": "completed",
                "created_at": (datetime.now(timezone.utc) - timedelta(days=milestones - m + 1)).isoformat()})
            earned += BONUS
        await db.users.update_one(
            {"id": uid},
            {"$set": {"accept_streak_bonus_total": earned}, "$inc": {"wallet_balance": earned}})

        docs = []
        for at in _spread_times(cfg["accepted"]):
            docs.append({"id": _new_id(), "user_id": uid, "type": "accepted", "at": at})
        for at in _spread_times(cfg["missed"]):
            docs.append({"id": _new_id(), "user_id": uid, "type": "missed", "at": at})
        if docs:
            await db.partner_response_events.insert_many(docs)
            total_events += len(docs)

        print(f"{u.get('name'):16} accepted={cfg['accepted']} missed={cfg['missed']} "
              f"streak={cfg['accept_streak']} best={cfg['best_streak']} tone={cfg['alert_prefs']['tone']}")

    grand = await db.partner_response_events.count_documents({})
    print(f"\nSeeded {total_events} response events. Total in DB now: {grand}")


if __name__ == "__main__":
    asyncio.run(main())
