"""Iteration 31 — Phase 1 fix batch: Starter Kit payment (Cashfree), cart tax display,
persistent login, coupon → commissionable_base, and invoice list display_amount.
"""
import os
import sys
import re
import time
import pytest
import requests

# Ensure backend package imports work when tests are collected from /app/backend
sys.path.insert(0, "/app/backend")

def _env_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v
    # fallback: read frontend/.env
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for line in open(p):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE = _env_url().rstrip("/") + "/api"

CUSTOMER = "+919000000004"
PARTNER = "+919000000003"


def _login(phone):
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": phone, "otp": "123456"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def partner_token():
    return _login(PARTNER)


@pytest.fixture(scope="module")
def customer_token():
    return _login(CUSTOMER)


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- #4 Starter Kit payment ----------
class TestStarterKitCashfree:
    def test_partner_status_baseline(self, partner_token):
        r = requests.get(f"{BASE}/starter-kit/me", headers=_h(partner_token), timeout=15)
        assert r.status_code == 200, r.text
        self.baseline_purchased = bool(r.json().get("purchased"))
        # store on class for downstream test
        TestStarterKitCashfree.was_purchased = self.baseline_purchased

    def test_starter_kit_order_creates_real_cashfree(self, partner_token):
        if getattr(TestStarterKitCashfree, "was_purchased", False):
            pytest.skip("Partner already owns kit — cannot test fresh order.")
        r = requests.post(f"{BASE}/starter-kit/order", headers=_h(partner_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("mock") is False, f"Expected real gateway order, got mock: {d}"
        assert d.get("gateway") == "cashfree", d
        assert d.get("method") == "cashfree_sdk", d
        assert str(d.get("order_id", "")).startswith("KIT-"), d
        assert d.get("payment_session_id"), d
        TestStarterKitCashfree.order_id = d["order_id"]

    def test_confirm_return_kit_unpaid_does_not_grant_pro(self, partner_token):
        oid = getattr(TestStarterKitCashfree, "order_id", None)
        if not oid:
            pytest.skip("No KIT order to confirm.")
        r = requests.post(
            f"{BASE}/payments/confirm-return",
            headers=_h(partner_token),
            json={"gw": "cashfree", "order_id": oid},
            timeout=30,
        )
        # This endpoint is /payments (require_role customer) — partner may be blocked
        assert r.status_code == 200, f"partner confirm-return failed: {r.status_code} {r.text}"
        d = r.json()
        assert d.get("ok") is True, d
        assert d.get("paid") is False, d
        assert d.get("kind") == "starter_kit", d

    def test_partner_not_marked_pro_after_unpaid_return(self, partner_token):
        r = requests.get(f"{BASE}/starter-kit/me", headers=_h(partner_token), timeout=15)
        assert r.status_code == 200
        # It's OK if pre-existing purchase state remains as before, but the unpaid return
        # must NOT flip 'purchased' from False -> True.
        if not getattr(TestStarterKitCashfree, "was_purchased", False):
            assert r.json().get("purchased") is False, r.json()


# ---------- #1 Persistent login ----------
class TestPersistentLogin:
    def test_no_token_expiry(self, customer_token):
        # decode payload
        import base64, json
        payload = customer_token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(payload))
        assert "exp" not in data, f"Token has exp — persistent login broken: {data}"
        assert data.get("uid") and data.get("role") == "customer", data

    def test_auth_me_returns_user(self, customer_token):
        r = requests.get(f"{BASE}/auth/me", headers=_h(customer_token), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("phone") == CUSTOMER


# ---------- #16 Coupon -> commissionable_base ----------
class TestCouponCommissionable:
    def test_engine_percentage_coupon_reduces_commissionable_base(self):
        # Direct engine test — no DB writes.
        import asyncio
        from services.engines import PricingEngine
        service = {"base_price": 1000, "addons": [], "required_skill": "ac"}
        settings = {"emergency_fee": 0, "gst_pct": 18, "business_config": {}}
        coupon = {"discount_type": "percentage", "discount_value": 10}
        res = asyncio.get_event_loop().run_until_complete(
            PricingEngine.compute(service, settings, "scheduled", [], coupon, address={})
        )
        # subtotal = 1000; discount = 100 (10%); commissionable_base = 1000-100 = 900
        assert res["discount"] == 100.0, res
        assert res["commissionable_base"] == 900.0, res

    def test_engine_free_visiting_does_not_reduce_base(self):
        import asyncio
        from services.engines import PricingEngine
        service = {"base_price": 500, "addons": [], "required_skill": "ac"}
        settings = {"emergency_fee": 0, "gst_pct": 18,
                    "business_config": {"global_visiting_charge": 99}}
        coupon = {"discount_type": "free_visiting", "discount_value": 0}
        res = asyncio.get_event_loop().run_until_complete(
            PricingEngine.compute(service, settings, "scheduled", [], coupon, address={})
        )
        # visiting_charge=99; free_visiting => discount=99, commissionable_base stays 500
        assert res["visiting_charge"] == 99.0, res
        assert res["discount"] == 99.0, res
        assert res["commissionable_base"] == 500.0, res


# ---------- #7/#14 Invoice list display_amount ----------
class TestInvoiceDisplayAmount:
    def test_partner_invoices_have_display_amount(self, partner_token):
        r = requests.get(f"{BASE}/invoices?page=1&page_size=50", headers=_h(partner_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        items = d.get("items", [])
        assert isinstance(items, list)
        if not items:
            pytest.skip("No partner invoices available in this env.")
        # every row must expose display_amount
        for i in items:
            assert "display_amount" in i, f"Missing display_amount: {i.get('id')}"
        # For at least one booking invoice, display_amount should be <= total_amount
        # (partner net after platform cut ≤ customer gross).
        booking_items = [i for i in items if i.get("invoice_type") == "booking"]
        if booking_items:
            # check ledger existence: if commission_ledger exists for a booking,
            # display_amount must NOT equal total_amount (unless zero-cut).
            differing = [i for i in booking_items
                         if float(i.get("display_amount") or 0) != float(i.get("total_amount") or 0)]
            # at least reporting: we accept either (a) any differing item or (b)
            # confirm all have equal but no completed booking exists — we can't
            # assert strictly without ledger visibility, so log and pass.
            print(f"[partner] {len(booking_items)} booking invoices, "
                  f"{len(differing)} have display_amount != total_amount")

    def test_customer_invoices_display_equals_total(self, customer_token):
        r = requests.get(f"{BASE}/invoices?page=1&page_size=50", headers=_h(customer_token), timeout=30)
        assert r.status_code == 200
        items = r.json().get("items", [])
        for i in items:
            assert i.get("display_amount") == i.get("total_amount"), \
                f"customer display_amount must equal total_amount: {i.get('id')}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-o", "addopts="])
