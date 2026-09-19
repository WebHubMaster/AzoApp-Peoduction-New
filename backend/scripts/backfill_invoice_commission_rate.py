"""One-off: backfill commission_pct + commission_base on existing invoices.
Rate = configured platform commission % (of service cost, GST excluded).
Recovers base exactly from commission / (pct/100)."""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


async def main():
    db = AsyncIOMotorClient(MONGO_URL)[DB_NAME]
    settings = await db.settings.find_one({}, {"_id": 0}) or {}
    pct = float(((settings.get("commission") or {}).get("platform_pct")) or 0)
    updated = 0
    async for inv in db.invoices.find({"commission_pct": {"$exists": False}},
                                      {"_id": 0, "id": 1, "commission": 1, "subtotal": 1}):
        comm = float(inv.get("commission") or 0)
        if comm <= 0 or pct <= 0:
            base = round(float(inv.get("subtotal") or 0), 2)
            eff_pct = round((comm / base * 100), 2) if base else 0.0
        else:
            base = round(comm / (pct / 100), 2)
            eff_pct = pct
        await db.invoices.update_one(
            {"id": inv["id"]},
            {"$set": {"commission_pct": eff_pct, "commission_base": base}},
        )
        updated += 1
    print(f"platform_pct={pct}  invoices_updated={updated}")


if __name__ == "__main__":
    asyncio.run(main())
