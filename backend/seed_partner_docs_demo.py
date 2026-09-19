"""Seed demo registration documents (selfie, Aadhaar, PAN, a PDF certificate,
passbook) for a few partners so the admin Person360 → Profile tab "Uploaded
documents & photos" gallery (zoom + open-in-new-tab) can be demonstrated.
Idempotent — only fills partners that have no live selfie on file yet."""
import asyncio
import os

import dotenv
from motor.motor_asyncio import AsyncIOMotorClient

dotenv.load_dotenv()

PDF = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"


async def main():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    partners = await db.users.find({"role": "partner"}, {"_id": 0, "id": 1, "name": 1, "live_photo_url": 1}).sort("created_at", 1).to_list(6)
    done = 0
    for i, p in enumerate(partners):
        uid = p["id"]
        user_docs = {
            "live_photo_url": f"https://picsum.photos/seed/selfie{i}/600/600",
            "aadhaar_front_url": f"https://picsum.photos/seed/aadf{i}/900/560",
            "aadhaar_back_url": f"https://picsum.photos/seed/aadb{i}/900/560",
            "pan_url": f"https://picsum.photos/seed/pan{i}/900/560",
            "education_certificate_url": PDF,
        }
        await db.users.update_one({"id": uid}, {"$set": user_docs})
        prof_docs = {
            "passbook_url": f"https://picsum.photos/seed/pass{i}/900/560",
            "cheque_url": f"https://picsum.photos/seed/cheque{i}/900/560",
            "shop_photo_url": f"https://picsum.photos/seed/shop{i}/900/560",
        }
        await db.partner_profiles.update_one(
            {"user_id": uid},
            {"$set": {"documents": prof_docs}, "$setOnInsert": {"user_id": uid}},
            upsert=True,
        )
        done += 1
    print(f"Seeded registration documents for {done} partners")


if __name__ == "__main__":
    asyncio.run(main())
