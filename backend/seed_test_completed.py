"""One-off idempotent seed: a few COMPLETED bookings (no review) for the demo
customer so the rating/invoice UI can be exercised. Safe to re-run."""
import asyncio
import copy
import uuid
from datetime import datetime, timezone, timedelta

from config.database import db, now_iso

CUST_PHONE = "+919000000004"
PART_PHONE = "+919000000003"
LOGO_SAMPLE = "https://images.pexels.com/photos/1094767/pexels-photo-1094767.jpeg"


async def main():
    cust = await db.users.find_one({"phone": CUST_PHONE}, {"_id": 0})
    part = await db.users.find_one({"phone": PART_PHONE}, {"_id": 0})
    if not cust:
        print("customer not found"); return
    template = await db.bookings.find_one(
        {"customer_id": cust["id"], "items": {"$exists": True}}, {"_id": 0})
    if not template:
        print("no template booking"); return

    variants = [
        {"svc": "Door Repair", "base": 299.0},
        {"svc": "Ceiling Fan Installation", "base": 499.0},
        {"svc": "Switchboard Repair", "base": 349.0},
    ]
    created = []
    for idx, v in enumerate(variants):
        code = f"AZOCMP{idx+1}"
        # Idempotent: skip if this seed code already exists.
        if await db.bookings.find_one({"code": code}):
            print("exists, skip", code); continue
        b = copy.deepcopy(template)
        base = v["base"]
        surge = round(base * 0.15, 2)
        visiting = 100.0
        taxable = base + surge  # visiting charge is NOT taxed (business rule)
        gst = round(taxable * 0.18, 2)
        total = round(taxable + visiting + gst, 2)
        bid = str(uuid.uuid4())
        when = (datetime.now(timezone.utc) - timedelta(days=idx + 1)).isoformat()
        b.update({
            "id": bid,
            "code": code,
            "booking_code": code,
            "idempotency_key": f"seed-completed-{code}-{uuid.uuid4().hex[:8]}",
            "customer_id": cust["id"],
            "customer_name": cust.get("name", "Priya Verma"),
            "customer_phone": CUST_PHONE,
            "service_name": v["svc"],
            "is_multi": False,
            "items": [{
                "service_id": template["items"][0].get("service_id"),
                "service_name": v["svc"], "name": v["svc"], "qty": 1,
                "price": base, "tier_label": None,
                "image": template["items"][0].get("image", LOGO_SAMPLE),
            }],
            "partner_id": part["id"] if part else None,
            "partner_name": part.get("name", "Raj Kumar") if part else "Raj Kumar",
            "status": "completed",
            "payment_status": "paid",
            "payment_method": "upi",
            "pricing": {
                "base": base, "addons_total": 0.0, "emergency_fee": 0.0,
                "surge": surge, "visiting_charge": visiting, "convenience_fee": 0.0,
                "platform_fee": 0.0, "subtotal": round(base + surge + visiting, 2),
                "gst": gst, "discount": 0.0, "total": total,
                "commissionable_base": base,
            },
            "review": None,               # <-- no review so the Rate button appears
            "evidence": {                 # work-proof photos for lightbox testing
                "before": [{"url": LOGO_SAMPLE, "at": when}],
                "after": [{"url": template["items"][0].get("image", LOGO_SAMPLE), "at": when}],
            },
            "order_group_id": None,
            "created_at": when,
            "updated_at": now_iso(),
            "paid_at": when,
            "timeline": [
                {"status": "created", "at": when},
                {"status": "paid", "at": when},
                {"status": "completed", "at": when},
            ],
        })
        await db.bookings.insert_one(b)
        created.append(code)
        print("created", code, "total", total)

    print("DONE. created:", created)


if __name__ == "__main__":
    asyncio.run(main())
