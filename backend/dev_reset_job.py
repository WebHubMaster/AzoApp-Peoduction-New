"""Dev helper: reset a booking to 'assigned' (clears check-in + work proof) to replay the job wizard."""
import asyncio
import os
import sys
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))


async def main(bid: str):
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    b = await db.bookings.find_one({"id": bid}, {"_id": 0, "timeline": 1})
    if not b:
        print("not found"); return
    tl = [t for t in b.get("timeline", []) if t["status"] not in ("arrived_shop", "arrived_customer", "started", "completed")]
    r = await db.bookings.update_one({"id": bid}, {"$set": {"status": "assigned", "timeline": tl, "evidence": {"before": [], "after": []}},
                                                   "$unset": {"checkin": ""}})
    print("reset", r.modified_count)


asyncio.run(main(sys.argv[1]))
