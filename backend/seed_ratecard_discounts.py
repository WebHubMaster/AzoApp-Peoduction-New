"""Seed limited-time discount demo values on the AC rate-card rows so the
DiscountCountdown UI has real data to render. Idempotent."""
import asyncio
from datetime import datetime, timezone, timedelta
from config.database import db

# description -> (discount_pct, discount_until 'YYYY-MM-DD' or '')
def _soon(days):
    return (datetime.now(timezone.utc) + timedelta(days=days)).strftime("%Y-%m-%d")

TARGETS = {
    "Power jet service (Split)": (20, ""),                 # no expiry
    "Gas refill (Split AC up to 1.5T)": (15, "2026-12-31"),  # long window
    "Gas leak detection & repair": (25, _soon(3)),          # short -> countdown pops
    "Anti-rust deep clean (foam-jet)": (30, _soon(6)),      # short -> countdown pops
}


async def run():
    card = await db.rate_cards.find_one({"category_id": {"$exists": True}, "title": {"$exists": True}}, {"_id": 0}) if False else None
    # find AC card by category slug -> resolve via category
    cat = await db.categories.find_one({"slug": "ac-repair-service"}, {"_id": 0})
    if not cat:
        print("AC category not found; skipping"); return
    card = await db.rate_cards.find_one({"category_id": cat["id"]}, {"_id": 0})
    if not card:
        print("AC rate card not found; skipping"); return
    changed = 0
    for g in card.get("groups", []):
        for r in g.get("rows", []):
            t = TARGETS.get((r.get("description") or "").strip())
            if t:
                r["discount_pct"], r["discount_until"] = t[0], t[1]
                changed += 1
    await db.rate_cards.update_one({"id": card["id"]}, {"$set": {"groups": card["groups"]}})
    print(f"Applied discounts to {changed} rows on AC card {card['id']}")


if __name__ == "__main__":
    asyncio.run(run())
