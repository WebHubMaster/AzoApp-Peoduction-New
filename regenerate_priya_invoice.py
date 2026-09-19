import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import sys
sys.path.insert(0, '/app/backend')

from config.database import db
from services.invoice_service import ensure_booking_invoice
from config.database import get_settings

async def regenerate():
    # Find booking AZODEMOCX1
    booking = await db.bookings.find_one({"code": "AZODEMOCX1"}, {"_id": 0})
    if not booking:
        print("Booking not found")
        return
    
    print(f"Found booking: {booking['code']}, status: {booking['status']}")
    
    # Delete existing cancellation invoice
    result = await db.invoices.delete_many({
        "booking_id": booking["id"],
        "invoice_type": "cancellation"
    })
    print(f"Deleted {result.deleted_count} existing cancellation invoices")
    
    # Regenerate
    settings = await get_settings()
    inv = await ensure_booking_invoice(booking, settings)
    
    if inv:
        print(f"\nRegenerated invoice: {inv['invoice_number']}")
        print(f"Line items:")
        for item in inv.get("line_items", []):
            print(f"  - {item.get('desc')}: qty={item.get('qty')}, rate={item.get('rate')}, amount={item.get('amount')}")
        print(f"\nFinancial fields:")
        print(f"  original_amount: {inv.get('original_amount')}")
        print(f"  refund_amount: {inv.get('refund_amount')}")
        print(f"  retained_amount: {inv.get('retained_amount')}")
    else:
        print("Failed to regenerate invoice")

asyncio.run(regenerate())
