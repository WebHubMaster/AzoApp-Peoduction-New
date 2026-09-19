"""One-off idempotent seed: creates a rich demo rate card for the AC category."""
import asyncio
import os
import uuid
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
from config.database import db, now_iso  # noqa: E402


def _id():
    return str(uuid.uuid4())


def row(desc, sc, labour="", warranty="", note="", original=""):
    return {"id": _id(), "description": desc, "service_charge": str(sc),
            "labour_charge": str(labour), "original_charge": str(original),
            "warranty": warranty, "note": note, "order": 0}


GROUPS = [
    {"name": "Electrical Parts", "note": "Genuine spares with service warranty", "rows": [
        row("Non-Inverter PCB repaired", 1500, warranty="30 days"),
        row("Inverter PCB repaired", 4500, warranty="90 days"),
        row("LVT (Transformer)", 900, labour=349),
        row("Replace sensor", 350, labour=499),
        row("Contactor replaced", 500, labour=499),
        row("Contactor Daikin / O-General", 1500, labour=449),
        row("Convert PCB with remote", 1500),
        row("Fan Capacitor - 2.5 to 10 mfd", 250, labour=449),
        row("Comp Capacitor - 25 to 60 mfd", 400, labour=449),
    ]},
    {"name": "Gas Charging & Leakage", "note": "Refrigerant top-up & leak repair", "rows": [
        row("Gas refill (Split AC up to 1.5T)", 1999, warranty="30 days"),
        row("Gas refill (Window AC)", 1799, warranty="30 days"),
        row("Gas leak detection & repair", 999, labour=500),
        row("Cooling coil / condenser replace", 3500, labour=800, warranty="1 year"),
    ]},
    {"name": "General Service & Cleaning", "note": "Deep cleaning by trained pros", "rows": [
        row("Power jet service (Split)", 599, original=699),
        row("Power jet service (Window)", 499, original=599),
        row("Basic wet service", 449),
        row("Anti-rust deep clean (foam-jet)", 799, note="Recommended pre-summer"),
    ]},
    {"name": "Installation & Uninstallation", "rows": [
        row("Split AC installation", 1499, note="Excludes material > 3 ft"),
        row("Split AC uninstallation", 599),
        row("Window AC installation", 699),
        row("Window AC uninstallation", 399),
    ]},
]


async def main():
    cat = await db.categories.find_one(
        {"$or": [{"slug": "ac-repair-service"}, {"name": {"$regex": "AC Repair", "$options": "i"}}]},
        {"_id": 0, "id": 1, "name": 1})
    if not cat:
        print("AC category not found; skipping")
        return
    existing = await db.rate_cards.find_one({"category_id": cat["id"]})
    groups = []
    for gi, g in enumerate(GROUPS):
        rows = []
        for ri, r in enumerate(g["rows"]):
            r = dict(r)
            r["order"] = ri
            rows.append(r)
        groups.append({"id": _id(), "name": g["name"], "note": g.get("note", ""),
                       "order": gi, "rows": rows})
    doc = {
        "category_id": cat["id"], "category_name": cat["name"],
        "title": "Standard rate card",
        "subtitle": "Transparent, fixed prices \u2014 no surprises",
        "brand_label": "AzoCover", "accent_color": "#0D47A1",
        "intro": "All prices are inclusive of visiting charge waiver on repair. Spare-part prices are indicative and confirmed by the professional after inspection.",
        "footer_note": "Prices may vary by AC tonnage, brand & city. Final quote shared before work begins.",
        "status": "active", "groups": groups, "updated_at": now_iso(),
    }
    if existing:
        await db.rate_cards.update_one({"id": existing["id"]}, {"$set": doc})
        print("Updated existing rate card for", cat["name"])
    else:
        doc["id"] = _id()
        doc["created_at"] = now_iso()
        await db.rate_cards.insert_one(doc)
        print("Created rate card for", cat["name"], "id=", doc["id"])


if __name__ == "__main__":
    asyncio.run(main())
