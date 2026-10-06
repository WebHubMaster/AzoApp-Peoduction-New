"""Sidecar: executes the full tiered-dispatch scenario in a fresh process so motor's
event-loop binding is clean. Called from the pytest test as subprocess.
Prints a JSON blob with results; non-zero exit code = failure."""
import asyncio
import json
import sys
import time
import uuid

sys.path.insert(0, "/app/backend")


async def run():
    from motor.motor_asyncio import AsyncIOMotorClient  # noqa: F401
    from controllers import booking_controller as bc
    from config.database import db, now_iso

    phones = {
        "raj": "+919000000003",
        "manoj": "+919000000013",
        "amit": "+919000000005",
        "vikash": "+919000000012",
    }
    users = {}
    for k, p in phones.items():
        users[k] = await db.users.find_one({"phone": p}, {"_id": 0, "id": 1})
        await db.users.update_one({"id": users[k]["id"]}, {
            "$set": {"partner_status": "online", "suspended": False,
                     "status": "active", "kyc_status": "approved"},
            "$unset": {"suspend_until": "", "rating_suspended": ""}})
        # clear any accepted bookings blocking them for this time slot
        await db.bookings.update_many(
            {"partner_id": users[k]["id"], "status": {
                "$in": ["assigned", "arrived_shop", "arrived_customer", "started"]}},
            {"$set": {"status": "cancelled",
                      "cancelled_reason": "TEST iter219 unblock"}})

    svc_ac = await db.services.find_one(
        {"required_skill": "ac", "status": "active"}, {"_id": 0})
    svc_pl = await db.services.find_one(
        {"required_skill": "plumbing", "status": "active"}, {"_id": 0})

    base_booking = {
        "customer_id": "test-cust-iter219",
        "customer_name": "T", "customer_phone": "+911234567890",
        "address": {"line": "T", "city": "Patna", "pincode": "800001",
                    "lat": 25.5941, "lng": 85.1376},
        "schedule_type": "schedule", "scheduled_at": None, "notes": "",
        "addons": [], "pricing": {"base": 499, "subtotal": 499, "total": 499, "tax": 0},
        "status": "pending_payment",
        "otps": {"start": "1234", "completion": "5678"},
        "evidence": {"before": [], "after": []},
        "eligible_detail": {}, "timeline": [], "payment_status": "paid",
    }

    bid_a = str(uuid.uuid4())
    booking_a = {**base_booking,
                 "id": bid_a, "code": f"AZOTST{int(time.time()) % 10000:04d}A",
                 "service_id": svc_ac["id"], "service_name": svc_ac["name"],
                 "category_id": svc_ac.get("category_id"),
                 "category_name": svc_ac.get("category_name"),
                 "eligible_partner_ids": [users["raj"]["id"], users["manoj"]["id"],
                                          users["amit"]["id"]],
                 "created_at": now_iso(), "updated_at": now_iso()}
    await db.bookings.insert_one(dict(booking_a))
    await bc._broadcast_new_job(booking_a)
    ba = await db.bookings.find_one({"id": bid_a}, {"_id": 0})

    out = {
        "A": {
            "offered": ba.get("offered_partner_ids") or [],
            "pending": ba.get("free_alert_pending_ids") or [],
            "release_at": ba.get("free_alert_release_at"),
        },
        "ids": {k: v["id"] for k, v in users.items()},
    }

    if svc_pl:
        bid_b = str(uuid.uuid4())
        booking_b = {**base_booking,
                     "id": bid_b, "code": f"AZOTST{int(time.time()) % 10000:04d}B",
                     "service_id": svc_pl["id"], "service_name": svc_pl["name"],
                     "category_id": svc_pl.get("category_id"),
                     "category_name": svc_pl.get("category_name"),
                     "pricing": {"base": 299, "subtotal": 299, "total": 299, "tax": 0},
                     "eligible_partner_ids": [users["amit"]["id"], users["vikash"]["id"]],
                     "created_at": now_iso(), "updated_at": now_iso()}
        await db.bookings.insert_one(dict(booking_b))
        await bc._broadcast_new_job(booking_b)
        bb = await db.bookings.find_one({"id": bid_b}, {"_id": 0})
        out["B"] = {
            "offered": bb.get("offered_partner_ids") or [],
            "pending": bb.get("free_alert_pending_ids") or [],
            "release_at": bb.get("free_alert_release_at"),
        }
    print(json.dumps(out))


if __name__ == "__main__":
    asyncio.run(run())
