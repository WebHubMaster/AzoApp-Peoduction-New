"""Shared seed data for rate cards + add-on backfill.

Imported by services/seed_service.py (startup auto-seed) and by
scripts/seed_rate_cards.py (manual run). Keep it pure data + tiny helpers.
"""


def _g(name, note, rows):
    return {"name": name, "note": note, "rows": rows}


def _r(desc, service, warranty, labour="", original="", note="", disc=0):
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
RATE_CARDS = {
    "ac-repair-service": {
        "accent_color": "#0288D1",
        "subtitle": "Transparent AC service & repair pricing",
        "intro": "Upfront prices for split & window ACs. Final quote confirmed after inspection.",
        "footer_note": "Gas top-up & spare parts billed separately at MRP. Prices inclusive of visit charge.",
        "groups": [
            _g("Service & Cleaning", "Deep-clean by trained technicians", [
                _r("Split AC jet service", 549, "15 days", original=699, disc=20),
                _r("Window AC service", 449, "15 days", original=549),
                _r("Foam-jet deep clean (per unit)", 799, "30 days", note="Removes stubborn dust & odour"),
            ]),
            _g("Repairs", "Diagnosis included in visit charge", [
                _r("Gas refill / top-up (split)", 2200, "3 months", labour=300, note="R32/R410 as applicable"),
                _r("PCB repair", 1499, "3 months", labour=400),
                _r("Cooling coil replacement", 3500, "6 months", labour=600),
            ]),
        ],
    },
    "electrician": {
        "accent_color": "#F9A825",
        "subtitle": "Standard electrician charges",
        "intro": "Fixed prices for common electrical jobs. Materials extra unless stated.",
        "footer_note": "Wiring, MCBs and fittings charged at actuals. 30-day workmanship warranty.",
        "groups": [
            _g("Switch & Socket", "", [
                _r("Switch / socket replacement", 149, "30 days", original=199, disc=25),
                _r("New switchboard install", 399, "30 days", labour=150),
                _r("Fan regulator replacement", 129, "30 days"),
            ]),
            _g("Fixtures & Wiring", "", [
                _r("Ceiling fan install", 299, "30 days", labour=100),
                _r("Tube-light / LED panel fitting", 179, "30 days"),
                _r("MCB / fuse replacement", 249, "30 days", note="MCB billed extra"),
            ]),
        ],
    },
    "home-cleaning": {
        "accent_color": "#2E7D32",
        "subtitle": "Home & bathroom cleaning packages",
        "intro": "Eco-friendly chemicals and professional equipment included.",
        "footer_note": "Prices for standard-sized homes. Add-ons priced per unit.",
        "groups": [
            _g("Bathroom & Kitchen", "", [
                _r("Bathroom deep clean (per unit)", 449, "48 hours", original=549, disc=18),
                _r("Kitchen deep clean", 899, "48 hours"),
                _r("Chimney cleaning", 599, "48 hours"),
            ]),
            _g("Full Home", "", [
                _r("1 BHK full home cleaning", 1999, "48 hours", original=2499),
                _r("2 BHK full home cleaning", 2799, "48 hours"),
                _r("Sofa shampoo (per seat)", 149, "48 hours"),
            ]),
        ],
    },
    "plumbing": {
        "accent_color": "#0277BD",
        "subtitle": "Standard plumbing charges",
        "intro": "Leak fixes, installations and blockages by verified plumbers.",
        "footer_note": "Spare parts (taps, pipes, seals) charged at MRP. 30-day warranty on labour.",
        "groups": [
            _g("Taps & Leaks", "", [
                _r("Tap repair / replacement", 149, "30 days", original=199, disc=25),
                _r("Mixer / diverter install", 349, "30 days", labour=120),
                _r("Pipe leakage fix", 299, "30 days"),
            ]),
            _g("Fittings & Blockage", "", [
                _r("Washbasin install", 499, "30 days", labour=200),
                _r("Western toilet install", 899, "30 days"),
                _r("Drain / blockage clearing", 399, "15 days", note="Machine cleaning extra"),
            ]),
        ],
    },
    "appliance-repair": {
        "accent_color": "#6A1B9A",
        "subtitle": "Appliance repair rate card",
        "intro": "Washing machine, fridge, microwave & more. Inspection included in visit charge.",
        "footer_note": "Spare parts billed separately after approval. 3-month warranty on repairs.",
        "groups": [
            _g("Washing Machine", "", [
                _r("General service", 499, "1 month", original=599, disc=16),
                _r("Drain motor replacement", 1299, "3 months", labour=400),
                _r("PCB repair", 1499, "3 months"),
            ]),
            _g("Refrigerator & Microwave", "", [
                _r("Fridge gas charging", 1899, "3 months", labour=300),
                _r("Microwave magnetron replace", 1699, "3 months"),
                _r("Thermostat replacement", 799, "3 months"),
            ]),
        ],
    },
    "carpentry": {
        "accent_color": "#8D6E63",
        "subtitle": "Standard carpentry charges",
        "intro": "Furniture repair, fittings and installations by skilled carpenters.",
        "footer_note": "Hardware & material (hinges, channels, board) charged at actuals.",
        "groups": [
            _g("Repairs & Fittings", "", [
                _r("Door hinge / lock repair", 199, "30 days", original=249, disc=20),
                _r("Drawer channel replacement", 249, "30 days", labour=100),
                _r("Furniture minor repair", 299, "30 days"),
            ]),
            _g("Installations", "", [
                _r("Curtain rod install", 179, "30 days"),
                _r("Wall shelf / bracket fitting", 249, "30 days"),
                _r("Door installation", 899, "30 days", labour=350),
            ]),
        ],
    },
}


# service name -> add-ons [{name, price}] used to backfill services that have none.
ADDON_BACKFILL = {
    "AC Service (Split)": [("Gas Check", 99), ("Deep Cleaning", 199), ("Anti-Rust Coating", 149)],
    "AC Installation": [("Extra Piping", 350), ("Stabilizer Setup", 249), ("Wall Drilling", 199)],
    "AC Gas Refill": [("Leak Sealing", 399), ("Filter Replacement", 199)],
    "Fan Installation": [("Extra Wiring", 149), ("Regulator Replace", 129)],
    "Switchboard Repair": [("Socket Add-on", 99), ("MCB Replace", 199)],
    "Wiring & Fitting": [("MCB Replace", 199), ("Concealed Wiring (per point)", 249)],
    "Full Home Deep Clean": [("Sofa Cleaning", 499), ("Fridge Cleaning", 199), ("Balcony Cleaning", 249)],
    "Bathroom Cleaning": [("Grout Whitening", 199), ("Exhaust Fan Clean", 99)],
    "Kitchen Cleaning": [("Chimney Cleaning", 299), ("Fridge Cleaning", 199)],
    "Tap & Mixer Repair": [("Washer Replacement", 79), ("New Tap Install", 149)],
    "Blockage Removal": [("Machine Cleaning", 299), ("Drain Pipe Flush", 199)],
    "Washing Machine Repair": [("Drain Cleaning", 199), ("Inlet Valve Replace", 299)],
    "Refrigerator Repair": [("Gas Charging", 1899), ("Thermostat Replace", 349)],
    "Furniture Repair": [("Hinge Replacement", 99), ("Polish Touch-up", 199)],
    "Door Repair": [("Lock Replacement", 249), ("Handle Fitting", 129)],
}

# Generic per-category add-ons: used to backfill ANY service whose name is not
# in ADDON_BACKFILL, keyed by category slug, so every category always has add-ons.
GENERIC_ADDONS_BY_CATEGORY = {
    "ac-repair-service": [("Deep Cleaning", 199), ("Gas Check", 99)],
    "electrician": [("Extra Wiring", 149), ("Socket Add-on", 99)],
    "home-cleaning": [("Sofa Cleaning", 499), ("Fridge Cleaning", 199)],
    "plumbing": [("Washer Replacement", 79), ("Machine Cleaning", 299)],
    "appliance-repair": [("Inspection & Diagnosis", 149), ("Part Cleaning", 199)],
    "carpentry": [("Hinge Replacement", 99), ("Polish Touch-up", 199)],
}


# Reusable Add-on LIBRARY (db.catalog_addons) shown on admin "Add-on Services" page
# and offered to customers as "Frequently Added / Add-ons". This is the SOURCE OF
# TRUTH — a per-service add-on is only shown if it exists here (same category, active).
# keyed by category slug -> list of (name, price, description)
CATALOG_ADDONS = {
    "ac-repair-service": [
        ("Gas Check", 99, "Pressure & refrigerant level check"),
        ("Deep Cleaning", 199, "Foam-jet deep clean of coils & filters"),
        ("Anti-Rust Coating", 149, "Protective coating on condenser fins"),
        ("Extra Piping", 350, "Additional copper piping per metre"),
        ("Stabilizer Setup", 249, "Mount & wire a voltage stabilizer"),
        ("Wall Drilling", 199, "Core drilling for outdoor unit piping"),
        ("Leak Sealing", 399, "Detect & seal refrigerant leak"),
        ("Filter Replacement", 199, "Replace washable/HEPA filter"),
    ],
    "electrician": [
        ("Extra Wiring", 149, "Additional wiring per point"),
        ("Regulator Replace", 129, "Replace fan/dimmer regulator"),
        ("Socket Add-on", 99, "Add a new power socket"),
        ("MCB Replace", 199, "Replace a faulty MCB"),
        ("Concealed Wiring (per point)", 249, "Concealed wiring per point"),
    ],
    "home-cleaning": [
        ("Sofa Cleaning", 499, "Shampoo & vacuum sofa"),
        ("Fridge Cleaning", 199, "Interior + exterior fridge clean"),
        ("Balcony Cleaning", 249, "Scrub & wash balcony floor"),
        ("Grout Whitening", 199, "Whiten tile grout lines"),
        ("Exhaust Fan Clean", 99, "Degrease bathroom/kitchen exhaust"),
        ("Chimney Cleaning", 299, "Degrease chimney filters & body"),
    ],
    "plumbing": [
        ("Washer Replacement", 79, "Replace tap washer/seal"),
        ("New Tap Install", 149, "Install a new tap/faucet"),
        ("Machine Cleaning", 299, "Motorised drain cleaning"),
        ("Drain Pipe Flush", 199, "High-pressure drain flush"),
    ],
    "appliance-repair": [
        ("Drain Cleaning", 199, "Clean washing-machine drain path"),
        ("Inlet Valve Replace", 299, "Replace water inlet valve"),
        ("Gas Charging", 1899, "Refrigerant gas charging"),
        ("Thermostat Replace", 349, "Replace faulty thermostat"),
        ("Inspection & Diagnosis", 149, "On-site fault diagnosis"),
        ("Part Cleaning", 199, "Clean internal parts & assembly"),
    ],
    "carpentry": [
        ("Hinge Replacement", 99, "Replace door/cabinet hinge"),
        ("Polish Touch-up", 199, "Touch-up polish on woodwork"),
        ("Lock Replacement", 249, "Replace door lock/latch"),
        ("Handle Fitting", 129, "Fit new handle/knob"),
    ],
}
