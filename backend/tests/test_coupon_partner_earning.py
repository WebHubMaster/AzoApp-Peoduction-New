"""Partner earning on coupon bookings – AzoApp-funded coupons must NOT reduce
partner earning / provider-facing totals.

Covers (per review_request):
  U1  PricingEngine.commission_base_excl_tax ADDS BACK pricing['discount'] (coupon)
  U2  CommissionEngine.compute_split on coupon booking → partner earns on PRE-coupon base
  U3  No-coupon regression — identical to before
  U4  Rate-card commission_base override + coupon (labour-only commission + pass-through)
  U5  strip_platform_fees_breakdown adds coupon back for provider breakdown
  U6  Membership/loyalty/referral discounts STAY deducted (only coupon is added back)
  I1  /api/bookings/partner/jobs partner_amount = pre-coupon pre-tax amount
  I2  /api/bookings/partner/active and /partner/job/{id} partner-view breakdown adds coupon back
  I3  Customer-side breakdown remains UNCHANGED — customer still sees discount, pays discounted total
"""
import os
import sys
import time
import uuid
import pytest
import requests

sys.path.insert(0, "/app/backend")

from conftest import API, PHONES, login, client  # noqa: E402
from services.engines import PricingEngine, CommissionEngine  # noqa: E402


# =========================================================================
# Unit tests (pure, no network)
# =========================================================================

class TestCommissionBaseAddsBackCoupon:
    """U1 — commission_base_excl_tax must add pricing['discount'] back."""

    def test_commission_base_adds_back_coupon(self):
        # Screenshot example: service 249 + visiting 100 = 349, coupon 150, pf 10
        pricing = {"base": 249, "visiting_charge": 100, "platform_fee": 10,
                   "discount": 150, "commission_pct": 20}
        PricingEngine.finalize(pricing, gst_pct=18)
        base = PricingEngine.commission_base_excl_tax(pricing)
        # commissionable_base_excl_tax = service + visiting (coupon added back,
        # platform fee excluded) = 349
        assert round(base, 2) == 349.0, pricing

    def test_commission_base_no_coupon_regression(self):
        # same booking without a coupon → base = 349 (identical to coupon case)
        pricing = {"base": 249, "visiting_charge": 100, "platform_fee": 10,
                   "discount": 0, "commission_pct": 20}
        PricingEngine.finalize(pricing, gst_pct=18)
        base = PricingEngine.commission_base_excl_tax(pricing)
        assert round(base, 2) == 349.0

    def test_membership_discount_stays_deducted(self):
        # U6: Only `discount` (coupon) is added back. membership_discount must stay
        # deducted so partner earns on the actually-paid amount for member perks.
        pricing = {"base": 249, "visiting_charge": 100, "platform_fee": 10,
                   "discount": 0, "membership_discount": 50, "commission_pct": 20}
        PricingEngine.finalize(pricing, gst_pct=18)
        base = PricingEngine.commission_base_excl_tax(pricing)
        # 249+100-50 = 299 (NOT 349)
        assert round(base, 2) == 299.0, pricing


class TestCommissionSplitAddsBackCoupon:
    """U2 — partner_earning computed on pre-coupon base."""

    def test_partner_earning_on_full_amount(self):
        pricing = {"base": 249, "visiting_charge": 100, "platform_fee": 10,
                   "discount": 150, "commission_pct": 20}
        PricingEngine.finalize(pricing, gst_pct=18)
        booking = {"pricing": pricing}
        # 80/20 split (partner_pct=80, platform_pct=20)
        cm = {"partner_pct": 80, "platform_pct": 20,
              "merchant_partner_referral_pct": 0, "merchant_customer_pct": 0}
        booking["commission_config"] = {"commission": cm}
        s = CommissionEngine.compute_split(booking, {"commission": cm})
        assert round(s["base"], 2) == 349.0
        assert round(s["partner_earning"], 2) == 279.20, s

    def test_customer_total_unchanged_with_coupon(self):
        # Customer still pays the discounted total (coupon applied).
        pricing = {"base": 249, "visiting_charge": 100, "platform_fee": 10,
                   "discount": 150, "commission_pct": 20}
        PricingEngine.finalize(pricing, gst_pct=18)
        # service_net = 349-150 = 199 ; platform_commission = 199*20% = 39.80
        # taxable = 199 + 10 (pf) = 209 ; tax_base = 39.80 + 10 = 49.80
        # gst = 49.80 * 18% = 8.964 → 8.96; total = 209 + 8.96 = 217.96
        assert round(pricing["service_net"], 2) == 199.0
        assert round(pricing["taxable"], 2) == 209.0
        assert round(pricing["total"], 2) == 217.96, pricing


class TestRateCardCouponPassThrough:
    """U4 — rate-card: labour-only commission + 100% pass-through for product,
    coupon still added back onto the FULL base."""

    def test_rate_card_commission_base_override_with_coupon(self):
        # base=300, commission_base=200 (labour only, rest pass-through),
        # discount=150 → partner_amount should include coupon-adjusted full share.
        pricing = {"base": 300, "commission_base": 200,
                   "discount": 150, "commission_pct": 20}
        PricingEngine.finalize(pricing, gst_pct=18)
        booking = {"pricing": pricing}
        cm = {"partner_pct": 80, "platform_pct": 20,
              "merchant_partner_referral_pct": 0, "merchant_customer_pct": 0}
        booking["commission_config"] = {"commission": cm}
        # commission_base_excl_tax adds coupon back → 300 (service_net 150 + coupon 150)
        base = PricingEngine.commission_base_excl_tax(pricing)
        assert round(base, 2) == 300.0, pricing
        # commissionable 200 (labour), pass_through = 100 (product, 100% partner)
        cb, pt = CommissionEngine._commissionable_and_passthrough(pricing)
        assert round(cb, 2) == 200.0 and round(pt, 2) == 100.0
        s = CommissionEngine.split(cb, cm, pass_through=pt)
        # partner = 200*80% + 100 pass_through = 160 + 100 = 260
        assert round(s["partner_earning"], 2) == 260.0


class TestStripPlatformFeesBreakdown:
    """U5 — provider breakdown must add coupon back on taxable/total."""

    def test_strip_adds_coupon_back(self):
        bd = {
            "subtotal": 359, "discount": 150, "coupon_discount": 150,
            "taxable": 199, "tax": 8.96, "total": 217.96,
            "additional_charges": [
                {"key": "visiting_charge", "label": "Visiting Charge", "amount": 100},
                {"key": "platform_fee", "label": "Platform Fee", "amount": 10},
            ],
        }
        out = PricingEngine.strip_platform_fees_breakdown(bd)
        # Platform fee stripped, coupon added back on taxable/total
        assert out.get("coupon_platform_funded") is True
        assert round(out["discount"], 2) == 0.0  # coupon deducted from discount
        # taxable: 199 + 150 (coupon added back) − 10 (pf removed) = 339
        assert round(out["taxable"], 2) == 339.0, out
        # provider total = taxable + 0 tax (gst excluded for provider) = 339
        assert round(out["total"], 2) == 339.0, out
        # Platform fee row removed
        keys = [c.get("key") for c in out.get("additional_charges") or []]
        assert "platform_fee" not in keys and "visiting_charge" in keys


# =========================================================================
# Integration tests – create a direct booking, patch pricing with a coupon,
# and hit the partner-facing API endpoints to confirm partner_amount is pre-coupon.
# =========================================================================

def _patched_booking_with_coupon():
    """Create a direct booking as customer, then patch pricing to simulate a
    coupon-applied booking identical to the screenshot scenario (service 249
    + visiting 100, coupon ₹150). Returns (bid, partner_id, otps_start)."""
    from pymongo import MongoClient
    mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    _db = mc[os.environ.get("DB_NAME", "azoapp")]

    cust_tok = login(PHONES["customer"])
    cust = client(cust_tok)

    svcs = cust.get(f"{API}/catalog/services", timeout=30).json()
    svc = next((s for s in svcs if s.get("required_skill") == "ac"), svcs[0])

    r = cust.post(f"{API}/bookings", json={
        "service_id": svc["id"],
        "address": {"label": "Home", "line": "TEST_COUPON 12 MG Road",
                    "pincode": "800001", "city": "Patna", "state": "Bihar",
                    "lat": 25.5941, "lng": 85.1376},
        "schedule_type": "emergency",
        "notes": "TEST_coupon_partner_earning",
    }, timeout=60)
    assert r.status_code in (200, 201), r.text
    b = r.json()
    bid = b["id"]

    # Patch pricing in-place: service 249 + visiting 100, platform fee 10,
    # coupon ₹150, 80/20 split (partner 80, platform 20) — same as RC screenshot
    pricing = {"base": 249, "addons_total": 0, "emergency_fee": 0, "surge": 0,
               "visiting_charge": 100, "platform_fee": 10, "convenience_fee": 0,
               "discount": 150, "commission_pct": 20}
    PricingEngine.finalize(pricing, gst_pct=18)

    # Also give it a usable eligible_partner for feed visibility and mark paid.
    eligible = list(_db.users.find(
        {"role": "partner", "skills": "ac", "service_pincodes": "800001",
         "kyc_status": "approved"}, {"_id": 0, "id": 1}))
    eligible_ids = [u["id"] for u in eligible]
    _db.bookings.update_one({"id": bid}, {"$set": {
        "pricing": pricing,
        "coupon_code": "AZO50",
        "coupon_id": "test-coupon-azo50",
        "commission_config": {"commission": {
            "partner_pct": 80, "platform_pct": 20,
            "merchant_partner_referral_pct": 0, "merchant_customer_pct": 0,
            "customer_refund_pct": 80, "partner_cancellation_pct": 20}},
        "payment_status": "paid", "status": "searching",
        "paid_at": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime()),
        "eligible_partner_ids": eligible_ids,
        "offered_partner_ids": eligible_ids,
    }, "$push": {"timeline": {"status": "payment_received",
                               "at": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())}}})
    mc.close()
    return bid, eligible_ids


class TestPartnerJobFeedWithCoupon:

    def _free_partner_premium(self, phone):
        from pymongo import MongoClient
        mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        _db = mc[os.environ.get("DB_NAME", "azoapp")]
        u = _db.users.find_one({"phone": phone}, {"_id": 0})
        if not u:
            mc.close()
            pytest.skip(f"partner {phone} not seeded")
        _db.users.update_one({"id": u["id"]}, {"$set": {"premium_partner": True}})
        _db.bookings.update_many(
            {"partner_id": u["id"],
             "status": {"$in": ["assigned", "arrived_shop", "arrived_customer", "started"]}},
            {"$set": {"status": "cancelled"}})
        mc.close()
        return u

    def test_partner_jobs_feed_returns_full_pre_coupon_partner_amount(self):
        bid, eligible_ids = _patched_booking_with_coupon()
        if not eligible_ids:
            pytest.skip("no eligible AC partner for 800001")
        # Use partner2 (Amit Singh, AC)
        p_user = self._free_partner_premium(PHONES["partner2"])
        if p_user["id"] not in eligible_ids:
            pytest.skip("partner2 not in eligible list for this service area/skill")
        partner_tok = login(PHONES["partner2"])
        p = client(partner_tok)

        # /jobs — ring feed
        found = None
        deadline = time.time() + 10
        while time.time() < deadline:
            r = p.get(f"{API}/bookings/partner/jobs", timeout=30)
            assert r.status_code == 200, r.text
            jobs = r.json()
            found = next((j for j in jobs if j["id"] == bid), None)
            if found:
                break
            time.sleep(1)
        assert found, f"booking {bid} not in /partner/jobs feed"
        # Pre-coupon partner_amount == 349 (service 249 + visiting 100, coupon absorbed)
        assert round(float(found["partner_amount"]), 2) == 349.0, found
        assert found.get("coupon_code") == "AZO50"
        # Partner-audience breakdown exposes the coupon transparently (platform funded)
        bd0 = found.get("breakdown") or {}
        assert round(float(bd0.get("coupon_discount") or 0), 2) == 150.0, bd0
        assert bd0.get("coupon_platform_funded") is True
        # Ring brief (same shape used for incoming job overlay) also = 349
        from controllers.booking_controller import _job_brief
        from pymongo import MongoClient
        _mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        _raw = _mc[os.environ.get("DB_NAME", "azoapp")].bookings.find_one({"id": bid}, {"_id": 0})
        _mc.close()
        brief = _job_brief(_raw)
        assert round(float(brief["partner_amount"]), 2) == 349.0, brief
        assert brief.get("coupon_code") == "AZO50"
        assert round(float(brief.get("coupon_discount") or 0), 2) == 150.0, brief

        # Accept and verify /active + /job/{id} also show full partner_amount
        r = p.post(f"{API}/bookings/{bid}/accept", timeout=30)
        assert r.status_code == 200, r.text

        r = p.get(f"{API}/bookings/partner/active", timeout=15)
        assert r.status_code == 200, r.text
        act = r.json()
        row = next((j for j in act if j["id"] == bid), None)
        assert row, f"booking not in /partner/active ({len(act)} rows)"
        assert round(float(row["partner_amount"]), 2) == 349.0, row

        r = p.get(f"{API}/bookings/partner/job/{bid}", timeout=15)
        assert r.status_code == 200, r.text
        detail = r.json()
        assert round(float(detail["partner_amount"]), 2) == 349.0, detail
        # Partner-audience breakdown: coupon added back on taxable/total,
        # discount zeroed (because the only discount was the coupon)
        bd = detail.get("breakdown") or {}
        assert bd.get("coupon_platform_funded") is True, bd
        assert round(float(bd.get("discount") or 0), 2) == 0.0, bd
        # subtotal (service+visiting+platform_fee was stripped) == 349
        # provider total (no tax, no pf) == 349
        assert round(float(bd.get("total") or 0), 2) == 349.0, bd
        # earning.partner_earning on full amount
        earning = bd.get("earning") or {}
        assert round(float(earning.get("partner_earning") or 0), 2) == 279.20, earning
        # Platform fee + GST are hidden from pricing
        assert "platform_fee" not in (detail.get("pricing") or {}), detail.get("pricing")

    def test_customer_side_breakdown_unchanged(self):
        """Customer still sees the coupon discount and pays the discounted total."""
        bid, _ = _patched_booking_with_coupon()
        cust = client(login(PHONES["customer"]))
        r = cust.get(f"{API}/bookings/{bid}", timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        bd = b.get("breakdown") or {}
        # Customer total 217.96, discount 150 shown
        assert round(float(bd.get("total") or 0), 2) == 217.96, bd
        assert round(float(bd.get("discount") or 0), 2) == 150.0, bd
        assert round(float(bd.get("coupon_discount") or 0), 2) == 150.0, bd
        # And NO coupon_platform_funded flag on customer-audience breakdown
        assert not bd.get("coupon_platform_funded"), bd
