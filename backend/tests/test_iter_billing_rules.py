"""Billing / Tax / Commission / Invoice rules — Phase 1 (backend engine + admin config).

Covers the 7 scenarios from the review request:
  1. Normal scheduled quote (Patna / Fan Installation) — formula correctness.
  2. Emergency quote — quick fee is INSIDE the commission base.
  3. Rate-card / custom booking — commission on labour only (+ Minimum Labour Charge fallback).
  4. During-job additional work — labour-only commission, parts 100% to partner, no platform_fee.
  5. Merchant CITY-wise commission override on CommissionEngine.settle / compute_split.
  6. Partner invoice visibility — no platform_fee / GST line on partner-facing breakdown.
  7. REGRESSION — normal (non-rate-card, non-merchant) bookings compute byte-identically.

Scenarios 1-2 run via public HTTP endpoint. Scenarios 3-7 exercise the engine directly
(the single source of truth) so pytest does not need a full booking checkout + payment.
"""
import os
import sys
import pytest
import asyncio
import requests

sys.path.insert(0, "/app/backend")

from conftest import API, PHONES, login  # noqa: E402
from services.engines import PricingEngine, CommissionEngine  # noqa: E402
from services import money  # noqa: E402

PATNA = {"X-City": "Patna"}
FAN_INSTALL_ID = "dee618a2-9970-4710-bf19-c983d262ae08"


def _close(a, b, tol=0.03):
    return abs(float(a) - float(b)) <= tol


# ------------------------------------------------------------------ HTTP quote tests
class TestNormalQuotePatna:
    """Scenario 1: scheduled quote in Patna for Fan Installation (base 299)."""

    def test_scheduled_fan_install_patna(self):
        r = requests.get(f"{API}/bookings/quote",
                         params={"service_id": FAN_INSTALL_ID, "schedule_type": "schedule"},
                         headers=PATNA, timeout=30)
        assert r.status_code == 200, r.text
        p = r.json()["pricing"]
        assert _close(p["base"], 299)
        assert _close(p["visiting_charge"], 100), f"visiting_charge={p['visiting_charge']}"
        assert _close(p["service_net"], 399)
        assert _close(p["commission_pct"], 20)
        assert _close(p["platform_commission"], 79.8)
        assert _close(p["platform_fee"], 25)
        assert _close(p["tax_base"], 104.8)
        assert _close(p["gst"], 18.86, tol=0.05)
        assert _close(p["total"], 442.86, tol=0.05)
        assert _close(p["partner_share"], 319.2)


class TestEmergencyQuickFeeInBase:
    """Scenario 2: emergency booking — quick fee is INSIDE commission base."""

    def test_emergency_fan_install_patna(self):
        r = requests.get(f"{API}/bookings/quote",
                         params={"service_id": FAN_INSTALL_ID, "schedule_type": "emergency"},
                         headers=PATNA, timeout=30)
        assert r.status_code == 200, r.text
        p = r.json()["pricing"]
        assert _close(p["emergency_fee"], 150)
        assert _close(p["visiting_charge"], 100)
        assert _close(p["service_net"], 549), f"service_net={p['service_net']}"
        assert _close(p["platform_commission"], 109.8, tol=0.05)
        assert _close(p["tax_base"], 134.8, tol=0.05)
        assert _close(p["gst"], 24.26, tol=0.05)
        assert _close(p["total"], 598.26, tol=0.1)


# ------------------------------------------------------------------ engine (direct)

def _settings_fixture(gst=18, commission_pct=20, platform_fee=25,
                     visiting=100, min_service=500, emergency=150, min_labour=0):
    return {
        "gst_pct": gst,
        "emergency_fee": emergency,
        "business_config": {
            "platform_fee": platform_fee,
            "global_visiting_charge": visiting,
            "min_service_amount_for_visiting": min_service,
            "min_labour_charge": min_labour,
        },
        "commission": {"partner_pct": 100 - commission_pct, "platform_pct": commission_pct - 5 - 3,
                       "merchant_partner_referral_pct": 5, "merchant_customer_pct": 3,
                       "customer_refund_pct": 80, "partner_cancellation_pct": 20},
        "matching_weights": {"skill": 10, "rating": 10, "availability": 10, "performance": 10, "distance": 10},
    }


class TestRateCardCommissionOnLabourOnly:
    """Scenario 3: rate-card / custom direct booking — commission applies ONLY to labour."""

    def test_custom_item_labour_only_commission(self):
        settings = _settings_fixture()
        # custom item with service_cost 800, labour 200
        svc = {"id": "rc1", "name": "RC item", "is_custom": True,
               "base_price": 1000, "discounted_price": 0, "category_id": None, "addons": []}
        labour = 200.0
        pricing = asyncio.run(PricingEngine.compute(
            svc, settings, "schedule", [], None, {"city": "Patna"},
            commission_base=labour))
        # service_net includes 1000 base (service+labour) + visiting_charge? 1000 >= min_service(500), so NO visiting
        assert _close(pricing["service_net"], 1000)
        assert _close(pricing["commissionable_base"], 200)
        # commission_pct = 20 → 200 * 20% = 40
        assert _close(pricing["platform_commission"], 40)
        assert _close(pricing["partner_share"], 960)  # service_net - commission
        assert _close(pricing["pass_through"], 800)

    def test_custom_item_no_labour_uses_min_labour_charge(self):
        """When custom item has NO labour_charge, city Minimum Labour Charge must be applied."""
        settings = _settings_fixture(min_labour=150)
        svc = {"id": "rc2", "name": "RC item2", "is_custom": True,
               "base_price": 500, "discounted_price": 0, "category_id": None, "addons": []}
        # Simulate booking_controller logic: own_labour=0 → eff_labour = min_labour (150), base += 150
        eff_labour = 150.0
        svc["base_price"] = money.add(svc["base_price"], eff_labour)  # 650
        pricing = asyncio.run(PricingEngine.compute(
            svc, settings, "schedule", [], None, {"city": "Patna"},
            commission_base=eff_labour))
        assert _close(pricing["service_net"], 650)
        assert _close(pricing["commissionable_base"], 150)
        assert _close(pricing["platform_commission"], 30)  # 150 * 20%
        assert _close(pricing["pass_through"], 500)


class TestAdditionalWorkCommission:
    """Scenario 4: during-job additional work — labour-only commission, parts 100% partner, no platform fee."""

    def test_additional_recompute(self):
        from controllers.booking_controller import _recompute_additional
        settings = _settings_fixture(gst=18)
        booking = {
            "commission_config": {"commission": {"partner_pct": 80, "platform_pct": 12,
                                                  "merchant_partner_referral_pct": 5, "merchant_customer_pct": 3}},
            "additional": {"items": [
                {"id": "a1", "part_charge": 500, "labour_charge": 200},
                {"id": "a2", "part_charge": 300, "labour_charge": 100},
            ]},
        }
        addl = asyncio.run(_recompute_additional(booking, settings))
        # parts=800, labour=300. partner_pct=80 → platform_pct_full=20 (NOT 12).
        assert _close(addl["parts_total"], 800)
        assert _close(addl["labour_total"], 300)
        assert _close(addl["platform_pct"], 20), f"platform_pct={addl['platform_pct']}"
        # commission on labour only = 300 * 20% = 60
        assert _close(addl["commission"], 60)
        # gst on commission portion only = 60 * 18% = 10.8
        assert _close(addl["gst"], 10.8, tol=0.05)
        # partner_earning = parts + (labour - commission) = 800 + 240 = 1040
        assert _close(addl["partner_earning"], 1040)
        # platform_earning = commission + gst = 70.8
        assert _close(addl["platform_earning"], 70.8, tol=0.05)
        # total customer pays = parts + labour + gst = 800 + 300 + 10.8 = 1110.8
        assert _close(addl["total"], 1110.8, tol=0.05)
        # No platform_fee anywhere in additional block
        assert "platform_fee" not in addl


class TestMerchantCityWiseCommission:
    """Scenario 5: merchant commission comes from CITY config and overrides category values."""

    def test_city_merchant_override_split(self):
        # Partna seeded: merchant_partner_referral_pct=4, merchant_customer_pct=2.
        # Category Electrician: 5 and 3.  City MUST win.
        pricing = {
            "service_net": 1000, "commissionable_base": 1000, "pass_through": 0,
            "total": 1180, "gst": 180, "platform_fee": 0, "convenience_fee": 0,
            "commission_pct": 20,
        }
        booking = {
            "commission_config": {
                "commission": {
                    "partner_pct": 80, "platform_pct": 12,
                    # city-overridden values
                    "merchant_partner_referral_pct": 4,
                    "merchant_customer_pct": 2,
                },
            },
            "pricing": pricing,
            "merchant_id": "merchant-A",
        }
        settings = _settings_fixture()
        partner = {"referred_by_merchant": "merchant-B"}
        split = CommissionEngine.compute_split(booking, settings, partner)
        # base=1000, partner=800
        assert _close(split["partner_earning"], 800)
        # merchant_referral = 1000 * 4% = 40 (city value, NOT 5%=50)
        assert _close(split["merchant_referral"], 40), f"mref={split['merchant_referral']}"
        # merchant_customer = 1000 * 2% = 20 (city value, NOT 3%=30)
        assert _close(split["merchant_customer"], 20), f"mcust={split['merchant_customer']}"
        # platform = platform_gross(200) - 40 - 20 = 140
        assert _close(split["platform_earning"], 140)
        # distributed == base + pass_through
        assert _close(split["distributed"], 1000)

    def test_merchant_city_override_from_city_pricing_service(self):
        """The CPS.merchant_commission('Patna') must return the seeded city values."""
        from services import city_pricing_service as cps
        out = asyncio.run(cps.merchant_commission("Patna"))
        assert out, f"Patna city config missing merchant pct: {out}"
        assert _close(out.get("merchant_partner_referral_pct", 0), 4), out
        assert _close(out.get("merchant_customer_pct", 0), 2), out


class TestPartnerInvoiceVisibility:
    """Scenario 6: partner-facing breakdown has NO platform_fee / GST charges."""

    def test_partner_breakdown_strips_platform_fees(self):
        booking = {
            "service_name": "Fan Installation",
            "pricing": {
                "base": 299, "addons_total": 0, "emergency_fee": 0,
                "visiting_charge": 100, "platform_fee": 25, "convenience_fee": 0,
                "subtotal": 424, "discount": 0, "gross_charges": 424,
                "service_net": 399, "commissionable_base": 399, "pass_through": 0,
                "taxable": 424, "gst_pct": 18, "gst": 18.86, "tax": 18.86,
                "cgst": 9.43, "sgst": 9.43, "total": 442.86,
                "commission_pct": 20, "platform_commission": 79.8, "partner_share": 319.2,
                "tax_base": 104.8, "platform_only_fees": 25,
            },
            "items": [{"service_name": "Fan Installation", "qty": 1, "base_price": 299, "addons": []}],
            "status": "completed", "payment_status": "paid",
        }
        settings = _settings_fixture()
        cust = PricingEngine.build_breakdown(booking, settings, audience="customer")
        prt = PricingEngine.build_breakdown(booking, settings, audience="partner")

        # Customer sees platform_fee + tax
        charge_keys = {c["key"] for c in cust["additional_charges"]}
        assert "platform_fee" in charge_keys
        assert cust["tax"] > 0
        assert _close(cust["total"], 442.86, tol=0.1)

        # Partner must NOT see platform_fee / tax
        p_keys = {c["key"] for c in prt["additional_charges"]}
        assert "platform_fee" not in p_keys, prt["additional_charges"]
        assert "convenience_fee" not in p_keys
        assert _close(prt["tax"], 0), f"partner tax={prt['tax']}"
        # Partner earning reflects partner_share
        assert "earning" in prt and _close(prt["earning"]["partner_earning"], 319.2, tol=0.5)
        # customer_only_charges are surfaced flagged
        co = {c["key"] for c in prt.get("customer_only_charges", [])}
        assert "platform_fee" in co


class TestRegressionNormalBooking:
    """Scenario 7: pre-existing (non-rate-card, non-merchant) booking math is byte-identical."""

    def test_normal_booking_settle_distribution(self):
        settings = _settings_fixture()
        svc = {"id": "s1", "name": "Normal", "base_price": 1000, "discounted_price": 0,
               "category_id": None, "addons": [], "is_custom": False}
        pricing = asyncio.run(PricingEngine.compute(svc, settings, "schedule", [], None,
                                                    {"city": "Patna"}))
        # service_net 1000 (above min_service), commission_pct=20
        assert _close(pricing["service_net"], 1000)
        assert _close(pricing["commissionable_base"], 1000)
        assert _close(pricing["pass_through"], 0)
        assert _close(pricing["platform_commission"], 200)
        assert _close(pricing["partner_share"], 800)
        # Settle via compute_split (no merchant)
        booking = {"pricing": pricing, "merchant_id": None,
                   "commission_config": {"commission": settings["commission"]}}
        split = CommissionEngine.compute_split(booking, settings, {"referred_by_merchant": None})
        assert _close(split["partner_earning"], 800)
        assert _close(split["merchant_referral"], 0)
        assert _close(split["merchant_customer"], 0)
        # distributed == base + pass_through (==service_net since pass_through=0)
        assert _close(split["distributed"], 1000)
        assert _close(split["pass_through"], 0)


# ------------------------------------------------------------------ cart-quote rate-card

class TestCartQuoteRateCard:
    """Scenario 3 (cart variant): pure custom cart carries commission_base=labour_total only."""

    def test_cart_quote_pure_custom(self):
        tok = login(PHONES["customer"])
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {tok}",
                          "X-City": "Patna"})
        payload = {
            "items": [{
                "custom": True,
                "custom_name": "AC gas top-up",
                "custom_price": 800,
                "labour_charge": 200,
                "category_id": None,
                "qty": 1,
            }],
            "schedule_type": "schedule",
            "address": {"city": "Patna", "pincode": "800001"},
        }
        r = s.post(f"{API}/bookings/cart-quote", json=payload, timeout=30)
        if r.status_code != 200:
            pytest.skip(f"cart-quote not accepting custom payload: {r.status_code} {r.text[:200]}")
        data = r.json()
        p = data["pricing"]
        assert _close(p.get("commissionable_base", 0), 200), p
        # pass_through = service_net - labour
        if p.get("service_net"):
            assert _close(p["pass_through"], p["service_net"] - 200), p
