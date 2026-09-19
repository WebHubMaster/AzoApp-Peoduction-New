"""Idempotent backfill:
1. Mark partners with a PAID starter-kit purchase as `premium_partner` (AzoApp Pro)
   and attach their kit summary + pro_since / pro_expires_at.
2. Generate invoices for all terminal bookings / transactions / withdrawals
   (invoices collection was empty, so no invoice tab showed data anywhere).
"""
import asyncio
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
from config.database import db, now_iso, get_settings  # noqa: E402
from services import invoice_service  # noqa: E402


async def mark_pro():
    n = 0
    partners = await db.users.find({"role": "partner"}, {"_id": 0, "id": 1}).to_list(1000)
    for p in partners:
        pur = await db.starter_kit_purchases.find_one(
            {"user_id": p["id"], "status": "paid"}, {"_id": 0}, sort=[("created_at", -1)])
        if not pur:
            continue
        await db.users.update_one({"id": p["id"]}, {"$set": {
            "premium_partner": True,
            "pro_since": pur.get("created_at") or now_iso(),
            "pro_expires_at": pur.get("expires_at"),
            "starter_kit": {"status": pur.get("status"), "tracking_status": pur.get("tracking_status"),
                            "amount": pur.get("amount"), "purchased_at": pur.get("created_at"),
                            "expires_at": pur.get("expires_at")},
        }})
        n += 1
    return n


async def main():
    settings = await get_settings()
    pro = await mark_pro()
    before = await db.invoices.count_documents({})
    await invoice_service.sync_invoices(settings)
    after = await db.invoices.count_documents({})
    by_role = {
        "customer": await db.invoices.count_documents({"customer_id": {"$ne": None}}),
        "partner": await db.invoices.count_documents({"partner_id": {"$ne": None}}),
        "merchant": await db.invoices.count_documents({"merchant_id": {"$ne": None}}),
    }
    print(f"Pro partners marked: {pro}")
    print(f"Invoices: {before} -> {after}  (by fk: {by_role})")


if __name__ == "__main__":
    asyncio.run(main())
