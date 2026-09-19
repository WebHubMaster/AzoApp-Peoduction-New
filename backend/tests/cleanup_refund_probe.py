"""Revert wallet impact of the refund-validation probe (over-refund + negative refund)."""
import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


async def main():
    total = 0.0
    async for r in db.refunds.find({"reason": {"$in": ["overrefund", "negative", "TEST_refund"]}}):
        total += float(r["amount"])
        cust = r["customer_id"]
        await db.users.update_one({"id": cust}, {"$inc": {"wallet_balance": -float(r["amount"])}})
        await db.transactions.delete_many({"kind": "refund", "amount": float(r["amount"]), "user_id": cust})
        await db.refunds.delete_one({"id": r["id"]})
    print("reverted refund total:", total)
    # remove the probe payout with bogus status
    res = await db.payouts.delete_many({"status": "bogus_status"})
    print("bogus payouts removed:", res.deleted_count)


asyncio.run(main())
