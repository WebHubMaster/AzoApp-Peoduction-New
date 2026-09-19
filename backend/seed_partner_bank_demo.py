"""Seed demo PAN + bank accounts (mix of pending / approved) for a few partners
so the admin Person360 → Bank & KYC tab can demonstrate the approve / reject /
lock workflow and multiple-accounts review. Idempotent."""
import asyncio
import os
import uuid

import dotenv
from motor.motor_asyncio import AsyncIOMotorClient

dotenv.load_dotenv()


def nid():
    return str(uuid.uuid4())


async def main():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    partners = await db.users.find({"role": "partner"}, {"_id": 0, "id": 1, "name": 1, "phone": 1}).sort("created_at", 1).to_list(6)
    made_banks = made_pan = 0
    for i, p in enumerate(partners[:4]):
        uid = p["id"]
        await db.partner_bank_accounts.delete_many({"partner_id": uid, "seed": "bank_demo"})
        await db.partner_pan.delete_many({"partner_id": uid, "seed": "bank_demo"})
        first = (p.get("name") or "Partner").split(" ")[0]
        # PAN — first partner approved (locked), others pending
        await db.partner_pan.insert_one({
            "id": nid(), "partner_id": uid, "pan": f"ABCDE{1000 + i}Z", "pan_number": f"ABCDE{1000 + i}Z",
            "name": p.get("name"), "pan_url": f"https://picsum.photos/seed/pancard{i}/900/560",
            "status": "approved" if i == 0 else "pending", "reason": "",
            "submitted_at": "2026-09-01T10:00:00+00:00", "seed": "bank_demo",
        })
        made_pan += 1
        # two bank accounts: one approved(primary), one pending
        banks = [
            {"bank_name": "HDFC Bank", "account_holder": p.get("name"), "account_number": f"5011{i}23456789",
             "ifsc": "HDFC0001234", "upi_id": f"{first.lower()}@okhdfc", "is_primary": True,
             "passbook_url": f"https://picsum.photos/seed/passbookhdfc{i}/900/560",
             "status": "approved" if i == 0 else "pending"},
            {"bank_name": "State Bank of India", "account_holder": p.get("name"), "account_number": f"3022{i}98765432",
             "ifsc": "SBIN0005678", "upi_id": f"{first.lower()}@oksbi", "is_primary": False,
             "passbook_url": f"https://picsum.photos/seed/passbooksbi{i}/900/560", "status": "pending"},
        ]
        for bk in banks:
            await db.partner_bank_accounts.insert_one({
                "id": nid(), "partner_id": uid, **bk, "reason": "",
                "submitted_at": "2026-09-01T10:05:00+00:00", "seed": "bank_demo",
            })
            made_banks += 1
    print(f"Seeded {made_pan} PAN records and {made_banks} bank accounts across {min(4, len(partners))} partners")


if __name__ == "__main__":
    asyncio.run(main())
