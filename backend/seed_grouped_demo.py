"""One-off: create a realistic MULTI-service + add-ons grouped booking for the demo
customer (+919000000004) via the REAL API so ServiceBreakdown / 'Services in this
order' can be verified live in Customer, Partner and Admin panels.
Then assign it to demo partner (+919000000003) and mark it 'assigned' so the partner
dashboard shows the ServiceBreakdown too."""
import requests, asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
BASE = "http://localhost:8001/api"

CUST = "+919000000004"
PARTNER = "+919000000003"
AC_SPLIT = "75dea3e8-77d3-4205-9d52-1c96aaec400b"   # AC Service (Split) 499 +Gas Check/Deep Cleaning
AC_INSTALL = "5bdab8ea-1c74-409c-8406-72c19ec8d176"  # AC Installation 1299 +Extra Piping


def login(phone):
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": phone}, timeout=30)
    r.raise_for_status()
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": phone, "otp": "123456"}, timeout=30)
    r.raise_for_status()
    return r.json()["token"]


async def get_address():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    c = await db.users.find_one({"phone": CUST})
    addrs = c.get("addresses") or []
    a = dict(addrs[0]) if addrs else {"label": "Home", "line": "12 MG Road", "city": "Patna", "pincode": "800001"}
    a.setdefault("lat", 25.5941)
    a.setdefault("lng", 85.1376)
    a.setdefault("state", "Bihar")
    return a, c.get("id")


async def assign_partner(booking_id):
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    p = await db.users.find_one({"phone": PARTNER})
    await db.bookings.update_one({"id": booking_id}, {"$set": {
        "partner_id": p["id"], "partner_name": p.get("name"), "status": "assigned",
    }})
    print("assigned partner", p.get("name"), p["id"])


def main():
    addr, cust_id = asyncio.get_event_loop().run_until_complete(get_address())
    token = login(CUST)
    hdr = {"Authorization": f"Bearer {token}"}
    req = {
        "items": [
            {"service_id": AC_SPLIT, "qty": 1, "addons": ["Gas Check", "Deep Cleaning"]},
            {"service_id": AC_INSTALL, "qty": 2, "addons": ["Extra Piping"]},
        ],
        "address": addr,
        "schedule_type": "schedule",
        "scheduled_at": (__import__("datetime").datetime.utcnow() + __import__("datetime").timedelta(days=1)).replace(microsecond=0).isoformat() + "Z",
    }
    r = requests.post(f"{BASE}/bookings/grouped", json=req, headers=hdr, timeout=60)
    print("grouped status", r.status_code)
    if r.status_code >= 300:
        print(r.text[:800]); return
    b = r.json()
    print("booking id", b.get("id"), "code", b.get("code"), "service_name", b.get("service_name"))
    print("is_multi", b.get("is_multi"), "items#", len(b.get("items") or []))
    for it in (b.get("items") or []):
        print("  -", it.get("service_name"), "qty", it.get("qty"), "base", it.get("base_price"),
              "price", it.get("price"), "addons", [(a.get("name"), a.get("price")) for a in (it.get("addons") or [])])
    print("pricing:", b.get("pricing"))
    asyncio.get_event_loop().run_until_complete(assign_partner(b["id"]))


if __name__ == "__main__":
    main()
