"""Idempotent demo seeder for the Physical QR Kit:
 - a few extra merchants (mapping targets)
 - field agents
 - QR batches (unassigned + some mapped to merchants => 'active')
 - assigns batches to agents

Run: python seed_qr_demo.py
"""
import asyncio
from config.database import db
from models.user import build_user
from services import physical_qr_service as svc


async def get_admin():
    a = await db.users.find_one({"role": "admin"}, {"_id": 0})
    if not a:
        raise SystemExit("No admin user found")
    return a


async def ensure_merchant(name, phone, city):
    existing = await db.users.find_one({"phone": phone}, {"_id": 0})
    if existing:
        return existing
    doc = build_user(phone, "merchant", name, is_demo=True)
    doc["shop_name"] = name
    doc["city"] = city
    # merchant_code: short unique-ish code
    import random, string
    doc["merchant_code"] = "".join(random.choices(string.ascii_uppercase + string.digits, k=7))
    await db.users.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


async def main():
    admin = await get_admin()

    # 1) extra merchants across cities
    merchants = []
    merchants.append(await ensure_merchant("Verma Home Appliances", "+919000000101", "Patna"))
    merchants.append(await ensure_merchant("CoolAir AC Services", "+919000000102", "Ranchi"))
    merchants.append(await ensure_merchant("SecureView CCTV", "+919000000103", "Patna"))
    merchants.append(await ensure_merchant("BrightSpark Electricals", "+919000000104", "Gaya"))
    # include the pre-seeded merchant too
    pre = await db.users.find_one({"phone": "+919000000002"}, {"_id": 0})
    if pre:
        merchants.insert(0, pre)
    print(f"merchants ready: {len(merchants)}")

    # 2) field agents
    agent_ravi = await svc.create_agent(admin, "Field Agent Ravi", "+919000000201")
    agent_sita = await svc.create_agent(admin, "Field Agent Sita", "+919000000202")
    print(f"agents ready: {agent_ravi['name']}, {agent_sita['name']}")

    # 3) batches (skip if we already have >= 3 batches to stay idempotent-ish)
    existing_batches = await db.physical_qrs.distinct("batch_id")
    if len(existing_batches) >= 3:
        print(f"batches already exist ({len(existing_batches)}) — skipping batch creation")
    else:
        b1 = await svc.create_batch(admin, count=24, batch_name="Patna Field Kit — Sep", prefix="PAT")
        b2 = await svc.create_batch(admin, count=12, batch_name="Ranchi Field Kit — Sep", prefix="RAN")
        b3 = await svc.create_batch(admin, count=8, batch_name="Demo Sample Stickers", prefix="DEMO")
        print(f"batches created: {b1['count']}, {b2['count']}, {b3['count']}")

        # 4) map some QRs to merchants => 'active' (demonstrates already-mapped)
        b1_tokens = [q["token"] for q in b1["qrs"]]
        b2_tokens = [q["token"] for q in b2["qrs"]]
        maps = [
            (b1_tokens[0], merchants[0]["id"]),
            (b1_tokens[1], merchants[1]["id"]),
            (b1_tokens[2], merchants[2]["id"]),
            (b2_tokens[0], merchants[3]["id"] if len(merchants) > 3 else merchants[0]["id"]),
        ]
        for tok, mid in maps:
            try:
                await svc.assign(admin, tok, merchant_id=mid)
            except Exception as e:  # noqa: BLE001
                print("map skip", tok, e)
        print(f"mapped {len(maps)} QRs to merchants (now 'active')")

        # 5) assign batches to agents
        await svc.assign_batches_to_agent(admin, agent_ravi["id"], [b1["batch_id"]])
        await svc.assign_batches_to_agent(admin, agent_sita["id"], [b2["batch_id"]])
        print("assigned batches to agents")

    # summary
    total = await db.physical_qrs.count_documents({})
    active = await db.physical_qrs.count_documents({"status": "active"})
    unassigned = await db.physical_qrs.count_documents({"status": "unassigned"})
    print(f"DONE — physical_qrs total={total} active={active} unassigned={unassigned}")


if __name__ == "__main__":
    asyncio.run(main())
