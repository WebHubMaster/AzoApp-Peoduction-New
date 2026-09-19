"""Seed a dummy (but realistic) rate card for EVERY category.

Idempotent: skips a category that already has a rate card.
Run:  cd /app/backend && python ../scripts/seed_rate_cards.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from config.database import db  # noqa: E402
from controllers import ratecard_controller as rc  # noqa: E402


def g(name, note, rows):
    return {"name": name, "note": note, "rows": rows}


def r(desc, service, warranty, labour="", original="", note="", disc=0):
    return {
        "description": desc,
        "service_charge": str(service),
        "labour_charge": str(labour),
        "original_charge": str(original),
        "warranty": warranty,
        "note": note,
        "discount_pct": disc,
    }


# category slug -> rate card content
CARDS = {
    "ac-repair-service": {
        "accent_color": "#0288D1",
        "subtitle": "Transparent AC service & repair pricing",
        "intro": "Upfront prices for split & window ACs. Final quote confirmed after inspection.",
        "footer_note": "Gas top-up & spare parts billed separately at MRP. Prices inclusive of visit charge.",
        "groups": [
            g("Service & Cleaning", "Deep-clean by trained technicians", [
                r("Split AC jet service", 549, "15 days", original=699, disc=20),
                r("Window AC service", 449, "15 days", original=549),
                r("Foam-jet deep clean (per unit)", 799, "30 days", note="Removes stubborn dust & odour"),
            ]),
            g("Repairs", "Diagnosis included in visit charge", [
                r("Gas refill / top-up (split)", 2200, "3 months", labour=300, note="R32/R410 as applicable"),
                r("PCB repair", 1499, "3 months", labour=400),
                r("Cooling coil replacement", 3500, "6 months", labour=600),
            ]),
        ],
    },
    "electrician": {
        "accent_color": "#F9A825",
        "subtitle": "Standard electrician charges",
        "intro": "Fixed prices for common electrical jobs. Materials extra unless stated.",
        "footer_note": "Wiring, MCBs and fittings charged at actuals. 30-day workmanship warranty.",
        "groups": [
            g("Switch & Socket", "", [
                r("Switch / socket replacement", 149, "30 days", original=199, disc=25),
                r("New switchboard install", 399, "30 days", labour=150),
                r("Fan regulator replacement", 129, "30 days"),
            ]),
            g("Fixtures & Wiring", "", [
                r("Ceiling fan install", 299, "30 days", labour=100),
                r("Tube-light / LED panel fitting", 179, "30 days"),
                r("MCB / fuse replacement", 249, "30 days", note="MCB billed extra"),
            ]),
        ],
    },
    "home-cleaning": {
        "accent_color": "#2E7D32",
        "subtitle": "Home & bathroom cleaning packages",
        "intro": "Eco-friendly chemicals and professional equipment included.",
        "footer_note": "Prices for standard-sized homes. Add-ons priced per unit.",
        "groups": [
            g("Bathroom & Kitchen", "", [
                r("Bathroom deep clean (per unit)", 449, "48 hours", original=549, disc=18),
                r("Kitchen deep clean", 899, "48 hours"),
                r("Chimney cleaning", 599, "48 hours"),
            ]),
            g("Full Home", "", [
                r("1 BHK full home cleaning", 1999, "48 hours", original=2499),
                r("2 BHK full home cleaning", 2799, "48 hours"),
                r("Sofa shampoo (per seat)", 149, "48 hours"),
            ]),
        ],
    },
    "plumbing": {
        "accent_color": "#0277BD",
        "subtitle": "Standard plumbing charges",
        "intro": "Leak fixes, installations and blockages by verified plumbers.",
        "footer_note": "Spare parts (taps, pipes, seals) charged at MRP. 30-day warranty on labour.",
        "groups": [
            g("Taps & Leaks", "", [
                r("Tap repair / replacement", 149, "30 days", original=199, disc=25),
                r("Mixer / diverter install", 349, "30 days", labour=120),
                r("Pipe leakage fix", 299, "30 days"),
            ]),
            g("Fittings & Blockage", "", [
                r("Washbasin install", 499, "30 days", labour=200),
                r("Western toilet install", 899, "30 days"),
                r("Drain / blockage clearing", 399, "15 days", note="Machine cleaning extra"),
            ]),
        ],
    },
    "appliance-repair": {
        "accent_color": "#6A1B9A",
        "subtitle": "Appliance repair rate card",
        "intro": "Washing machine, fridge, microwave & more. Inspection included in visit charge.",
        "footer_note": "Spare parts billed separately after approval. 3-month warranty on repairs.",
        "groups": [
            g("Washing Machine", "", [
                r("General service", 499, "1 month", original=599, disc=16),
                r("Drain motor replacement", 1299, "3 months", labour=400),
                r("PCB repair", 1499, "3 months"),
            ]),
            g("Refrigerator & Microwave", "", [
                r("Fridge gas charging", 1899, "3 months", labour=300),
                r("Microwave magnetron replace", 1699, "3 months"),
                r("Thermostat replacement", 799, "3 months"),
            ]),
        ],
    },
    "carpentry": {
        "accent_color": "#8D6E63",
        "subtitle": "Standard carpentry charges",
        "intro": "Furniture repair, fittings and installations by skilled carpenters.",
        "footer_note": "Hardware & material (hinges, channels, board) charged at actuals.",
        "groups": [
            g("Repairs & Fittings", "", [
                r("Door hinge / lock repair", 199, "30 days", original=249, disc=20),
                r("Drawer channel replacement", 249, "30 days", labour=100),
                r("Furniture minor repair", 299, "30 days"),
            ]),
            g("Installations", "", [
                r("Curtain rod install", 179, "30 days"),
                r("Wall shelf / bracket fitting", 249, "30 days"),
                r("Door installation", 899, "30 days", labour=350),
            ]),
        ],
    },
}


async def main():
    cats = await db.categories.find({}, {"_id": 0, "id": 1, "name": 1, "slug": 1}).to_list(1000)
    created, skipped, missing = 0, 0, []
    for cat in cats:
        slug = cat.get("slug")
        spec = CARDS.get(slug)
        if not spec:
            missing.append(cat.get("name"))
            continue
        existing = await db.rate_cards.find_one({"category_id": cat["id"]}, {"_id": 0, "id": 1})
        if existing:
            print(f"SKIP  {cat['name']} (already has a rate card)")
            skipped += 1
            continue
        payload = {
            "category_id": cat["id"],
            "title": "Standard rate card",
            "subtitle": spec["subtitle"],
            "brand_label": "AzoCover",
            "intro": spec["intro"],
            "footer_note": spec["footer_note"],
            "accent_color": spec["accent_color"],
            "status": "active",
            "groups": spec["groups"],
        }
        card = await rc.create(payload)
        rows = sum(len(gr.get("rows", [])) for gr in card.get("groups", []))
        print(f"CREATE {cat['name']}: {len(card['groups'])} groups, {rows} rows")
        created += 1
    print(f"\nDONE. created={created} skipped={skipped}")
    if missing:
        print("No template for (skipped):", ", ".join(missing))


if __name__ == "__main__":
    asyncio.run(main())
