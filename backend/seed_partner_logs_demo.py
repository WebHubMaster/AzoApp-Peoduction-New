"""Seed demo activity-logs for a few partners spread across recent days, including
partner actions, system events and a couple of ERROR logs (with real reasons in
meta) so the admin Person360 → Logs tab (date-grouped, expandable, click-detail,
error highlighting) can be demonstrated. Idempotent. Within 30-day TTL window."""
import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone

import dotenv
from motor.motor_asyncio import AsyncIOMotorClient

dotenv.load_dotenv()


def nid():
    return str(uuid.uuid4())


async def main():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    partners = await db.users.find({"role": "partner"}, {"_id": 0, "id": 1, "name": 1}).sort("created_at", 1).to_list(6)
    made = 0
    for p in partners[:3]:
        uid = p["id"]; nm = p.get("name") or "Partner"
        await db.activity_logs.delete_many({"target_id": uid, "seed": "logs_demo"})
        # (days_ago, hour, actor_role, actor_name, action, detail, meta)
        events = [
            (0, 9, p and "partner", nm, "login", "Signed in from Android app (v3.2.1)", {}),
            (0, 10, "partner", nm, "job_accepted", "Accepted booking AZOB12F4 · AC service", {}),
            (0, 13, "partner", nm, "withdrawal_requested", "Requested payout of ₹500 to HDFC ****6789", {"amount": 500}),
            (1, 11, "system", "System", "withdrawal_failed", "Payout could not be processed", {"error": "Bank gateway timeout (NPCI ref: TO-4821). Auto-retry scheduled.", "success": False, "amount": 500}),
            (1, 15, "partner", nm, "profile_updated", "Updated email and alternate mobile", {}),
            (2, 10, "partner", nm, "job_completed", "Completed booking AZOB0A91 · collected ₹1,180 cash", {"amount": 1180}),
            (2, 18, "system", "System", "otp_verification_failed", "Bank penny-drop verification failed", {"error": "Account holder name mismatch: 'RAJ K' vs PAN 'RAJ KUMAR'", "success": False}),
            (3, 12, "partner", nm, "bank_added", "Added new bank account · State Bank of India", {}),
            (4, 9, "partner", nm, "login", "Signed in from Android app (v3.2.0)", {}),
            (5, 16, "admin", "Super Admin", "kyc_reviewed", "KYC documents verified and approved", {}),
        ]
        for days, hour, role, actor, action, detail, meta in events:
            dtobj = (datetime.now(timezone.utc) - timedelta(days=days)).replace(hour=hour % 24, minute=(hour * 7) % 60, second=0, microsecond=0)
            await db.activity_logs.insert_one({
                "id": nid(), "actor_role": role or "partner", "actor_id": uid if role == "partner" else "system",
                "actor_name": actor, "action": action, "detail": detail,
                "target_id": uid, "target_role": "partner",
                "meta": meta, "level": "error" if meta.get("success") is False else "info",
                "created_at": dtobj.isoformat(), "ts": dtobj, "seed": "logs_demo",
            })
            made += 1
    print(f"Seeded {made} demo logs across {min(3, len(partners))} partners")


if __name__ == "__main__":
    asyncio.run(main())
