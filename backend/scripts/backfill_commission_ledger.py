"""One-off idempotent backfill: write a commission_ledger row for every completed/paid
booking that lacks one. Uses CommissionEngine.compute_split (same math as settle) so the
ledger is authoritative everywhere. Does NOT re-credit wallets (money already moved when
the job originally settled) — it only records the split."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.database import db, now_iso  # noqa: E402
from models.user import new_id  # noqa: E402
from services.engines import CommissionEngine  # noqa: E402


async def main():
    settings = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    existing = set()
    async for l in db.commission_ledger.find({}, {"_id": 0, "booking_id": 1}):
        if l.get("booking_id"):
            existing.add(l["booking_id"])

    q = {"status": {"$in": ["completed", "paid"]}}
    created = skipped = no_base = 0
    async for b in db.bookings.find(q, {"_id": 0}):
        if b["id"] in existing:
            skipped += 1
            continue
        if not (b.get("pricing") or {}).get("commissionable_base"):
            no_base += 1
            continue
        partner = None
        if b.get("partner_id"):
            partner = await db.users.find_one({"id": b["partner_id"]},
                                              {"_id": 0, "referred_by_merchant": 1})
        s = CommissionEngine.compute_split(b, settings, partner or {})
        ledger = {
            "id": new_id(), "booking_id": b["id"], "booking_code": b.get("code") or "",
            "partner_id": b.get("partner_id") or "",
            "partner_earning": s["partner_earning"], "visiting_charge": s["visiting_charge"],
            "partner_total": s["partner_total"], "platform_earning": s["platform_earning"],
            "merchant_referral": s["merchant_referral"], "referral_merchant_id": s["referral_merchant_id"],
            "merchant_customer": s["merchant_customer"], "customer_merchant_id": s["customer_merchant_id"],
            "merchant_booking": s["merchant_customer"], "merchant_id": s["customer_merchant_id"],
            "base": s["base"], "gross": float((b.get("pricing") or {}).get("total") or 0),
            "tax": s["tax"], "rates": s["rates"],
            "kind": "completion", "backfilled": True, "created_at": b.get("updated_at") or now_iso(),
        }
        await db.commission_ledger.insert_one(ledger)
        created += 1

    print(f"created={created} skipped_existing={skipped} skipped_no_base={no_base}")


if __name__ == "__main__":
    asyncio.run(main())
