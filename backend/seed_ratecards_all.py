"""Idempotent seed: creates rich demo rate cards for all main service categories.

Run: python -m seed_ratecards_all   (from /app/backend)
Safe to re-run — updates the card if one already exists for the category.
"""
import asyncio
import uuid
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
from config.database import db, now_iso  # noqa: E402


def _id():
    return str(uuid.uuid4())


def row(desc, sc, labour="", warranty="", note="", original=""):
    return {"description": desc, "service_charge": str(sc), "labour_charge": str(labour),
            "original_charge": str(original), "warranty": warranty, "note": note}


# category slug -> card definition
CARDS = {
    "ac-repair-service": {
        "title": "AC Repair & Service rate card",
        "subtitle": "Transparent, fixed prices \u2014 no surprises",
        "intro": "Visiting charge waived on repair. Spare-part prices are indicative and confirmed after inspection.",
        "footer_note": "Prices may vary by AC tonnage, brand & city. Final quote shared before work begins.",
        "groups": [
            ("General Service & Cleaning", "Deep cleaning by trained pros", [
                row("Power jet service (Split)", 599, original=699),
                row("Power jet service (Window)", 499, original=599),
                row("Basic wet service", 449),
                row("Anti-rust deep clean (foam-jet)", 799, note="Recommended pre-summer"),
            ]),
            ("Gas Charging & Leakage", "Refrigerant top-up & leak repair", [
                row("Gas refill (Split up to 1.5T)", 1999, warranty="30 days"),
                row("Gas leak detection & repair", 999, labour=500),
                row("Cooling coil replace", 3500, labour=800, warranty="1 year"),
            ]),
            ("Installation & Uninstallation", "", [
                row("Split AC installation", 1499, note="Excludes material > 3 ft"),
                row("Split AC uninstallation", 599),
                row("Window AC installation", 699),
            ]),
        ],
    },
    "electrician": {
        "title": "Electrician rate card",
        "subtitle": "Certified electricians \u2014 upfront pricing",
        "intro": "Visiting charge adjusted against work done. Material charged at actuals with your approval.",
        "footer_note": "Prices exclude cost of major materials (wires, MCB, fittings) unless stated.",
        "groups": [
            ("Switches & Sockets", "Repairs & replacements", [
                row("Switch / socket replace", 99, note="Per point, excl. material"),
                row("Switchboard repair", 199),
                row("MCB replacement", 249, labour=99, warranty="6 months"),
                row("Fan regulator install", 149),
            ]),
            ("Fans & Lights", "Fixtures & fittings", [
                row("Ceiling fan install", 299),
                row("Ceiling fan repair", 249),
                row("Tube light / LED install", 129),
                row("Decorative light install", 199, note="Per fixture"),
            ]),
            ("Wiring & Appliances", "Wiring, inverter & geyser", [
                row("New wiring point", 349, warranty="1 year"),
                row("Inverter install & setup", 799),
                row("Geyser install", 499),
                row("Doorbell install", 149),
            ]),
        ],
    },
    "home-cleaning": {
        "title": "Home Cleaning rate card",
        "subtitle": "Trained cleaners, eco-friendly supplies",
        "intro": "All materials & machines included. Prices are per unit / room unless stated.",
        "footer_note": "Final price may vary with area (sq. ft) and level of soiling.",
        "groups": [
            ("Full Home Cleaning", "Deep cleaning packages", [
                row("1 BHK deep clean", 1799, original=2199),
                row("2 BHK deep clean", 2499, original=2999),
                row("3 BHK deep clean", 3299, original=3899),
            ]),
            ("Bathroom & Kitchen", "Intensive scrubbing", [
                row("Bathroom deep clean", 499, note="Per bathroom"),
                row("Kitchen deep clean", 899),
                row("Chimney cleaning", 699, warranty="15 days"),
            ]),
            ("Sofa & Carpet", "Shampoo & vacuum", [
                row("Sofa shampoo (per seat)", 199),
                row("Carpet cleaning (per sq.ft)", 15),
                row("Mattress cleaning (double)", 599),
            ]),
        ],
    },
    "plumbing": {
        "title": "Plumbing rate card",
        "subtitle": "Verified plumbers \u2014 no hidden charges",
        "intro": "Visiting charge adjusted against work. Spare parts charged at actuals after approval.",
        "footer_note": "Prices exclude major materials (pipes, motors, tanks) unless mentioned.",
        "groups": [
            ("Taps & Leakage", "Fittings & leak fixes", [
                row("Tap install / replace", 149, note="Per tap"),
                row("Tap leakage fix", 99),
                row("Pipe leakage repair", 299, labour=99),
                row("Mixer / diverter install", 349),
            ]),
            ("Toilet & Drain", "Blockage & sanitary", [
                row("Toilet blockage clear", 499),
                row("Washbasin blockage clear", 349),
                row("Flush tank repair", 299, warranty="30 days"),
                row("Health faucet install", 199),
            ]),
            ("Motor & Tank", "Water systems", [
                row("Water motor install", 599),
                row("Motor repair", 449, warranty="3 months"),
                row("Overhead tank cleaning", 799),
            ]),
        ],
    },
    "appliance-repair": {
        "title": "Appliance Repair rate card",
        "subtitle": "Expert technicians for all brands",
        "intro": "Inspection charge waived on repair. Genuine spares with service warranty.",
        "footer_note": "Spare-part prices confirmed after diagnosis. Brand-specific parts may vary.",
        "groups": [
            ("Washing Machine", "Front & top load", [
                row("General service", 499),
                row("Drain / inlet repair", 399, labour=199),
                row("PCB / motor repair", 1299, warranty="90 days"),
            ]),
            ("Refrigerator", "Single & double door", [
                row("General service", 499),
                row("Gas refill", 1799, warranty="30 days"),
                row("Compressor replace", 2999, labour=800, warranty="1 year"),
            ]),
            ("Microwave & Others", "Kitchen appliances", [
                row("Microwave repair", 449),
                row("Geyser repair", 399),
                row("Water purifier service", 349, warranty="30 days"),
            ]),
        ],
    },
    "carpentry": {
        "title": "Carpentry rate card",
        "subtitle": "Skilled carpenters \u2014 fixed labour rates",
        "intro": "Labour-only pricing. Material (wood, hinges, locks) charged at actuals with approval.",
        "footer_note": "Custom furniture quoted separately after site measurement.",
        "groups": [
            ("Doors & Locks", "Repairs & installs", [
                row("Door hinge repair", 199),
                row("Door lock install", 249, note="Excl. lock cost"),
                row("Door alignment / plane", 299),
            ]),
            ("Furniture Repair", "Fix & restore", [
                row("Drawer / channel repair", 199),
                row("Bed repair", 399),
                row("Chair / table repair", 249),
                row("Cupboard hinge replace", 149, note="Per hinge"),
            ]),
            ("Fittings & Mounting", "Wall & fixtures", [
                row("Wall shelf mounting", 199),
                row("Curtain rod install", 149),
                row("TV unit / bracket mount", 349),
            ]),
        ],
    },
}


async def upsert_card(slug, spec):
    cat = await db.categories.find_one({"slug": slug}, {"_id": 0, "id": 1, "name": 1})
    if not cat:
        print(f"  category '{slug}' not found; skipping")
        return
    groups = []
    for gi, (gname, gnote, rows) in enumerate(spec["groups"]):
        built = []
        for ri, r in enumerate(rows):
            r = dict(r)
            r["id"] = _id()
            r["order"] = ri
            built.append(r)
        groups.append({"id": _id(), "name": gname, "note": gnote, "order": gi, "rows": built})
    doc = {
        "category_id": cat["id"], "category_name": cat["name"],
        "title": spec["title"], "subtitle": spec["subtitle"],
        "brand_label": "AzoCover", "accent_color": "#0D47A1",
        "intro": spec["intro"], "footer_note": spec["footer_note"],
        "status": "active", "groups": groups, "updated_at": now_iso(),
    }
    existing = await db.rate_cards.find_one({"category_id": cat["id"]}, {"_id": 0, "id": 1})
    if existing:
        await db.rate_cards.update_one({"id": existing["id"]}, {"$set": doc})
        print(f"  updated rate card for {cat['name']}")
    else:
        doc["id"] = _id()
        doc["created_at"] = now_iso()
        await db.rate_cards.insert_one(doc)
        print(f"  created rate card for {cat['name']} (id={doc['id']})")


async def main():
    print("Seeding rate cards…")
    for slug, spec in CARDS.items():
        await upsert_card(slug, spec)
    total = await db.rate_cards.count_documents({})
    print(f"Done. Total rate cards: {total}")


if __name__ == "__main__":
    asyncio.run(main())
