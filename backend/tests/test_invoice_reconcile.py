"""Invoice reconciliation test: subtotal (excl visiting) + fees (incl visiting) + tax - discount == total."""
import sys, asyncio, pytest
sys.path.insert(0, "/app/backend")


def test_invoice_reconciles_with_visiting_charge():
    from services.invoice_service import ensure_booking_invoice
    from config.database import db

    async def run():
        # Build a synthetic completed booking with visiting charge scenario
        booking = {
            "id": "TEST_BK_VC_1",
            "code": "TEST_VC1",
            "status": "completed",
            "customer_id": "",
            "service_name": "Test Service",
            "category_name": "Test",
            "addons": [],
            "pricing": {
                "base": 1000.0,
                "addons_total": 0.0,
                "emergency_fee": 0.0,
                "surge": 0.0,
                "visiting_charge": 100.0,
                "subtotal": 1100.0,          # service_value + emergency + surge + VC (as engine returns)
                "convenience_fee": 0.0,
                "platform_fee": 0.0,
                "taxable": 1000.0,
                "gst": 180.0,
                "discount": 0.0,
                "total": 1280.0,
                "commissionable_base": 1000.0,
            },
            "created_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-01-01T00:00:00+00:00",
        }
        # Cleanup any prior test invoice
        await db.invoices.delete_many({"booking_id": booking["id"]})
        inv = await ensure_booking_invoice(booking, None)
        try:
            assert inv is not None
            print("Invoice:", {k: inv[k] for k in ("subtotal", "fees", "tax", "discount", "total_amount")})
            # subtotal = service+emergency+surge  (excludes VC)
            assert inv["subtotal"] == 1000.0, f"subtotal expected 1000 got {inv['subtotal']}"
            # fees includes VC (+ convenience + platform)
            assert inv["fees"] == 100.0, f"fees expected 100 (VC) got {inv['fees']}"
            assert inv["tax"] == 180.0
            recon = round(inv["subtotal"] + inv["fees"] + inv["tax"] - inv["discount"], 2)
            assert recon == inv["total_amount"] == 1280.0, f"recon={recon} total={inv['total_amount']}"
        finally:
            await db.invoices.delete_many({"booking_id": booking["id"]})

    asyncio.run(run())
