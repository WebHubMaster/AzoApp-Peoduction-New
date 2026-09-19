"""Seed ONE completed booking that used a coupon, settled through the REAL engines, so the
admin Coupon Absorption Report and the merchant Network member breakdown have live data.
Run: cd /app/backend && python3 scripts/seed_coupon_demo.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from config.database import db, now_iso, get_settings  # noqa: E402
from models.user import new_id  # noqa: E402
from services.engines import PricingEngine, CommissionEngine  # noqa: E402


async def main():
    settings = await get_settings()
    customer = await db.users.find_one({"phone": "+919000000004"}, {"_id": 0})
    partner = await db.users.find_one({"referred_by_merchant": {"$nin": [None, ""]}, "role": "partner"}, {"_id": 0}) \
        or await db.users.find_one({"phone": "+919000000003"}, {"_id": 0})
    service = await db.services.find_one({"status": "active", "base_price": {"$gt": 0}}, {"_id": 0})
    coupon = await db.coupons.find_one({"status": "active", "discount_type": "percentage"}, {"_id": 0}) \
        or await db.coupons.find_one({"status": "active"}, {"_id": 0})
    if not (customer and partner and service and coupon):
        print("missing seed prerequisites", bool(customer), bool(partner), bool(service), bool(coupon))
        return
    address = {"line": "Demo Lane 1", "city": "Patna", "pincode": "800001", "lat": 25.6, "lng": 85.1}
    pricing = await PricingEngine.compute(service, settings, "schedule", [], coupon, address)
    code = "AZO" + new_id()[:6].upper()
    booking = {
        "id": new_id(), "code": code, "customer_id": customer["id"], "customer_name": customer.get("name"),
        "customer_phone": customer.get("phone"), "partner_id": partner["id"], "partner_name": partner.get("name"),
        "service_id": service["id"], "service_name": service["name"], "category_id": service.get("category_id"),
        "category_name": service.get("category_name"), "address": address, "schedule_type": "schedule",
        "pricing": pricing, "coupon_code": coupon["code"], "status": "completed", "payment_status": "paid",
        "created_at": now_iso(), "updated_at": now_iso(), "completed_at": now_iso(), "items": [],
        "commission_config": settings.get("commission") and {"commission": settings["commission"]} or None,
    }
    await db.bookings.insert_one(dict(booking))
    ledger = await CommissionEngine.settle(booking, settings, partner)
    print("BOOKING", code, "coupon", coupon["code"], "partner", partner.get("name"), "referred_by", partner.get("referred_by_merchant"))
    print("PRICING gross", pricing["gross_charges"], "coupon_discount", pricing["discount"], "taxable", pricing["taxable"],
          "gst", pricing["gst"], "total", pricing["total"])
    print("LEDGER base", ledger["base"], "partner_earning", ledger["partner_earning"], "platform", ledger["platform_earning"],
          "merchant_referral", ledger["merchant_referral"], "rates", ledger["rates"])
    print("CHECK base == taxable + coupon:", round(pricing["taxable"] + pricing["discount"], 2) == ledger["base"])


if __name__ == "__main__":
    asyncio.run(main())
