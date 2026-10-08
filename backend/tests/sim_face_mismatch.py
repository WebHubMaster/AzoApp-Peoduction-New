import asyncio, os, sys
sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv; load_dotenv("/app/backend/.env")
from config.database import db
from services import face_match_service as fm
async def main():
    b = await db.bookings.find_one({"checkin.selfie_url": {"$exists": True}}, {"_id": 0})
    await db.bookings.update_one({"id": b["id"]}, {"$set": {"checkin.face_match.status": "unverified"}})
    async def fake(k, s): return {"status": "mismatch", "confidence": 91, "reason": "SIMULATED mismatch", "provider": "sim"}
    fm.compare_faces = fake
    p = await db.users.find_one({"id": b["partner_id"]}, {"_id": 0})
    r = await fm.run_checkin_face_match(b["id"], p, b["checkin"]["selfie_url"])
    print("first", r.get("alerted"))
    r = await fm.run_checkin_face_match(b["id"], p, b["checkin"]["selfie_url"])
    print("second (dedupe)", r.get("alerted"))
    print(await db.notifications.count_documents({"data.event": "face_mismatch", "data.booking_id": b["id"]}))
asyncio.run(main())
