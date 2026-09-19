"""Direct engine unit tests — NEW money rules (tax on ALL charges after discount;
commission on the tax-excluded paid amount; cancellation refund + split)."""
import sys, asyncio, pytest
sys.path.insert(0, "/app/backend")

CM = {"platform_pct": 32, "partner_pct": 60, "merchant_partner_referral_pct": 5,
      "merchant_customer_pct": 3, "customer_refund_pct": 80, "partner_cancellation_pct": 20}
SETTINGS = {
    "gst_pct": 18, "emergency_fee": 150, "currency": "INR",
    "business_config": {"global_visiting_charge": 100, "min_service_amount_for_visiting": 0,
                        "apply_convenience_fee": False, "apply_platform_fee": False},
    "commission": CM,
}


@pytest.fixture
def engine(monkeypatch):
    from services.engines import PricingEngine
    async def _no_surge(*a, **k): return (0.0, None)
    monkeypatch.setattr(PricingEngine, "_surge", _no_surge)
    return PricingEngine


def test_tax_applies_to_visiting_charge_and_emergency(engine):
    svc = {"base_price": 1000.0, "addons": [], "category_name": "T"}
    r = asyncio.run(engine.compute(svc, SETTINGS, "emergency", [], None, None))
    assert r["visiting_charge"] == 100 and r["emergency_fee"] == 150
    assert r["gross_charges"] == 1250.0
    assert r["taxable"] == 1250.0
    assert r["gst"] == 225.0
    assert r["total"] == 1475.0
    assert r["commissionable_base"] == 1250.0


def test_coupon_discount_before_tax(engine):
    svc = {"base_price": 1000.0, "addons": [], "category_name": "T"}
    coupon = {"discount_type": "percentage", "discount_value": 10}
    r = asyncio.run(engine.compute(svc, SETTINGS, "emergency", [], coupon, None))
    assert r["discount"] == 125.0           # 10% of 1250 (all charges)
    assert r["taxable"] == 1125.0
    assert r["gst"] == 202.5                # 18% of 1125, NOT of 1250
    assert r["total"] == 1327.5
    assert r["commissionable_base"] == 1125.0


def test_discount_capped_at_charges(engine):
    svc = {"base_price": 100.0, "addons": [], "category_name": "T"}
    coupon = {"discount_type": "fixed", "discount_value": 5000}
    r = asyncio.run(engine.compute(svc, SETTINGS, "schedule", [], coupon, None))
    assert r["discount"] == 200.0 and r["taxable"] == 0 and r["gst"] == 0 and r["total"] == 0


def test_finalize_membership_and_loyalty_pre_tax(engine):
    p = {"base": 1000.0, "addons_total": 0, "emergency_fee": 0, "surge": 0, "visiting_charge": 100.0,
         "convenience_fee": 0, "platform_fee": 0, "discount": 100.0, "membership_discount": 50.0,
         "loyalty_discount": 50.0}
    engine.finalize(p, 18)
    assert p["total_discount"] == 200.0 and p["taxable"] == 900.0
    assert p["gst"] == 162.0 and p["total"] == 1062.0 and p["commissionable_base"] == 900.0


def test_split_partner_first_then_platform_then_merchants():
    from services.engines import CommissionEngine
    s = CommissionEngine.split(1125.0, CM, "M1", "M2")
    assert s["partner_earning"] == 675.0
    assert s["platform_gross"] == 450.0
    assert s["merchant_referral"] == 56.25 and s["merchant_customer"] == 33.75
    assert s["platform_earning"] == 360.0
    assert s["distributed"] == 1125.0


def test_split_no_merchants_platform_keeps_all():
    from services.engines import CommissionEngine
    s = CommissionEngine.split(1000.0, CM, None, None)
    assert s["partner_earning"] == 600.0 and s["platform_earning"] == 400.0
    assert s["merchant_referral"] == 0 and s["merchant_customer"] == 0
    # only customer via merchant
    s2 = CommissionEngine.split(1000.0, CM, None, "M2")
    assert s2["merchant_customer"] == 30.0 and s2["merchant_referral"] == 0 and s2["platform_earning"] == 370.0


def _booking(total, gst, base, partner=True, merchant=None):
    return {"pricing": {"total": total, "gst": gst, "tax": gst, "commissionable_base": base, "taxable": base,
                        "discount": 125.0, "total_discount": 125.0},
            "payment_status": "paid", "partner_id": "P" if partner else None, "merchant_id": merchant,
            "commission_config": {"commission": CM}}


def test_cancellation_split_with_partner():
    from controllers.booking_controller import _compute_cancellation
    c = _compute_cancellation(_booking(1327.5, 202.5, 1125.0, True, "M2"), SETTINGS, {"referred_by_merchant": "M1"})
    assert c["service_amount"] == 1125.0 and c["tax"] == 202.5
    assert c["service_refund"] == 900.0 and c["gst_refund"] == 162.0 and c["refund"] == 1062.0
    assert c["cancel_charge"] == 225.0 and c["gst_retained"] == 40.5
    assert c["partner_cut"] == 135.0 and c["platform_gross"] == 90.0
    assert c["merchant_partner_comm"] == 11.25 and c["merchant_customer_comm"] == 6.75 and c["admin_cut"] == 72.0
    assert round(c["refund"] + c["cancel_charge"] + c["gst_retained"], 2) == 1327.5
    assert c["discount"] == 125.0  # discount is NOT refunded (refund based on paid amount)


def test_cancellation_no_partner_full_refund():
    from controllers.booking_controller import _compute_cancellation
    c = _compute_cancellation(_booking(1327.5, 202.5, 1125.0, False), SETTINGS, None)
    assert c["refund_pct"] == 100.0 and c["refund"] == 1327.5
    assert c["cancel_charge"] == 0 and c["partner_cut"] == 0 and c["admin_cut"] == 0


def test_cancellation_unpaid_nothing_moves():
    from controllers.booking_controller import _compute_cancellation
    b = _booking(1327.5, 202.5, 1125.0, True)
    b["payment_status"] = "pending"
    c = _compute_cancellation(b, SETTINGS, {"referred_by_merchant": "M1"})
    assert c["refund"] == 0 and c["cancel_charge"] == 0 and c["partner_cut"] == 0
