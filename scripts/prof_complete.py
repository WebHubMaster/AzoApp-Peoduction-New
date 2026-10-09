import asyncio, time, sys
sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv; load_dotenv("/app/backend/.env")
from config.database import db
import controllers.booking_controller as bc

def timed(mod, name):
    f = getattr(mod, name)
    async def w(*a, **k):
        t = time.perf_counter(); r = await f(*a, **k); print(f"  {name}: {(time.perf_counter()-t)*1000:.0f}ms"); return r
    setattr(mod, name, w)

async def main():
    partner = await db.users.find_one({"role": "partner"}, {"_id": 0})
    b = await db.bookings.find_one({"partner_id": partner["id"]}, {"_id": 0}) or await db.bookings.find_one({}, {"_id": 0})
    await db.bookings.update_one({"id": b["id"]}, {"$set": {"status": "started", "partner_id": partner["id"], "evidence.after": ["x.jpg"], "otps.completion": "1234", "additional": None}})
    from services.engines import CommissionEngine as CE
    for n in ["_partner_owns", "get_settings", "_notify", "_advance_accept_streak", "_get_booking"]:
        if hasattr(bc, n): timed(bc, n)
    orig = CE.settle
    async def s(*a, **k):
        t = time.perf_counter(); r = await orig(*a, **k); print(f"  settle: {(time.perf_counter()-t)*1000:.0f}ms"); return r
    CE.settle = s
    from services import partner_service as ps; timed(ps, "record_earning")
    t = time.perf_counter()
    await bc.complete_job(partner, b["id"], "1234")
    print(f"TOTAL complete_job: {(time.perf_counter()-t)*1000:.0f}ms")
    await asyncio.sleep(3)
asyncio.run(main())
