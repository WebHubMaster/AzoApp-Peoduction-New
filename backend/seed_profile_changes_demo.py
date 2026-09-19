"""Seed a few demo profile-change records (including a document/photo change and
formerly-'sensitive' fields) so the admin Person360 → Profile Changes tab can be
demonstrated with the new unmasked, beautiful UI + View old/new document buttons.
Idempotent — clears its own demo rows first.
"""
import asyncio
import os

import dotenv
from motor.motor_asyncio import AsyncIOMotorClient

dotenv.load_dotenv()

DEMO_FROM = "partner app"


async def main():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    # late import so config.database picks up env
    from services import profile_audit_service as pa

    partners = await db.users.find({"role": "partner"}, {"_id": 0}).sort("created_at", 1).to_list(4)
    if not partners:
        print("no partners found")
        return

    # remove previously-seeded demo change rows for these users
    ids = [p["id"] for p in partners]
    await db.profile_changes.delete_many({"user_id": {"$in": ids}, "updated_from": DEMO_FROM})

    made = 0
    for i, p in enumerate(partners[:3]):
        # change set 1 — contact + photo document change
        old1 = {
            "email": f"old.{p.get('phone','x')[-4:]}@example.com",
            "alternate_mobile": "9800000000",
            "photo": "https://picsum.photos/seed/oldphoto{}/500/500".format(i),
        }
        new1 = {
            "email": (p.get("name", "partner").split(" ")[0].lower()) + "@azoapp.in",
            "alternate_mobile": "9811122233",
            "photo": "https://picsum.photos/seed/newphoto{}/500/500".format(i),
        }
        r1 = await pa.record_diff(p, old1, new1, updated_from=DEMO_FROM, section="profile")
        if r1:
            made += 1

        # change set 2 — address (dict) + skills (list) + formerly-sensitive aadhaar
        old2 = {
            "address": {"line": "Old House, Ward 4", "city": "Patna", "pincode": "800001"},
            "skills": ["ac"],
            "aadhaar_number": "1234 5678 90{:02d}".format(10 + i),
        }
        new2 = {
            "address": {"line": "New Colony, Sector 7", "city": "Patna", "pincode": "800020"},
            "skills": ["ac", "electrical"],
            "aadhaar_number": "1234 5678 90{:02d}".format(50 + i),
        }
        r2 = await pa.record_diff(p, old2, new2, updated_from=DEMO_FROM, section="profile")
        if r2:
            made += 1

    print(f"Seeded {made} demo profile-change records across {min(3, len(partners))} partners")


if __name__ == "__main__":
    asyncio.run(main())
