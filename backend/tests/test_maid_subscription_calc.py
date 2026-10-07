"""Test maid subscription calculation consistency with normal booking (Jan 2026 fix).

Validates:
- plan preview math
- create subscription stores correct financial snapshot
- subscription total equals cart-quote total for same plan
- pay/mock -> invoice reflects correct commission/gst
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("BACKEND_URL", "http://localhost:8001")
PHONE = "+919000000004"
SVC = "svc-maid-fulltime"


@pytest.fixture(scope="module")
def token():
    requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": PHONE}, timeout=10)
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp",
                      json={"phone": PHONE, "otp": "123456"}, timeout=10)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def me(headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=10)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def address_id(me):
    addrs = me.get("addresses") or []
    assert addrs, "customer must have at least one saved address"
    return addrs[0]["id"]


def _approx(a, b, tol=0.05):
    return abs(float(a) - float(b)) <= tol


class TestPlanPreview:
    def test_monthly_plan_math(self, headers):
        r = requests.get(f"{BASE_URL}/api/subscriptions/plans/{SVC}", headers=headers, timeout=10)
        assert r.status_code == 200, r.text
        plans = {p["plan_type"]: p for p in r.json()["plans"]}
        m = plans["monthly"]
        assert m["price"] == 8000.0
        assert m["commission_pct"] == 40.0
        assert m["commission_amount"] == 3200.0
        assert m["partner_allocation"] == 4800.0  # price - commission (NO tax deducted)
        assert m["platform_fee"] == 10.0
        assert _approx(m["gst"], 577.80), f"gst={m['gst']}"  # (3200+10)*0.18
        assert _approx(m["total_payable"], 8587.80), f"total={m['total_payable']}"
        # GST must NOT be 1440 (full-amount GST) and NOT ~1.80
        assert not _approx(m["gst"], 1440.0)
        assert not _approx(m["gst"], 1.80)

    def test_weekly_plan_math(self, headers):
        r = requests.get(f"{BASE_URL}/api/subscriptions/plans/{SVC}", headers=headers, timeout=10)
        plans = {p["plan_type"]: p for p in r.json()["plans"]}
        w = plans["weekly"]
        assert w["price"] == 2200.0
        assert w["commission_amount"] == 880.0
        assert w["partner_allocation"] == 1320.0
        assert _approx(w["gst"], (880 + 10) * 0.18)  # 160.20
        assert _approx(w["total_payable"], 2200 + 10 + 160.20)

    def test_daily_plan_math(self, headers):
        r = requests.get(f"{BASE_URL}/api/subscriptions/plans/{SVC}", headers=headers, timeout=10)
        plans = {p["plan_type"]: p for p in r.json()["plans"]}
        d = plans["daily"]
        assert d["price"] == 400.0
        assert d["commission_amount"] == 160.0
        assert d["partner_allocation"] == 240.0
        assert _approx(d["gst"], (160 + 10) * 0.18)  # 30.60
        assert _approx(d["total_payable"], 400 + 10 + 30.60)


class TestCartQuoteConsistency:
    def test_cart_quote_matches_plan_monthly(self, headers, address_id):
        # svc-maid-fulltime -> cat-maid / "Maid Services" (seeded)
        category_id = "cat-maid"
        category_name = "Maid Services"

        payload = {
            "items": [{
                "custom": True,
                "custom_name": "Full-time Maid — Monthly plan",
                "custom_price": 8000,
                "labour_charge": 8000,
                "category_id": category_id,
                "category_name": category_name,
                "qty": 1,
            }],
            "schedule_type": "schedule",
            "apply_emergency": False,
            "address_id": address_id,
        }
        r = requests.post(f"{BASE_URL}/api/bookings/cart-quote", headers=headers,
                          json=payload, timeout=15)
        assert r.status_code == 200, r.text
        p = r.json().get("pricing", r.json())
        # The cart-quote total must equal subscription monthly total 8587.80
        print("cart-quote pricing:", p)
        assert _approx(p.get("total", 0), 8587.80, tol=0.5), f"cart total={p.get('total')}"
        assert _approx(p.get("platform_commission", 0), 3200.0, tol=0.5)
        assert _approx(p.get("partner_share", 0), 4800.0, tol=0.5)
        assert _approx(p.get("gst", 0), 577.80, tol=0.5)


class TestSubscriptionCreateAndPay:
    def test_create_monthly_subscription_snapshot(self, headers, address_id):
        payload = {
            "service_id": SVC,
            "plan_type": "monthly",
            "address_id": address_id,
            "start_date": "2026-10-15",
            "preferred_time": "09:00",
        }
        r = requests.post(f"{BASE_URL}/api/subscriptions", headers=headers, json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        sub = r.json()
        print("subscription create response keys:", list(sub.keys()))
        # Pull snapshot - various possible keys
        snap = sub.get("financial_snapshot") or sub.get("snapshot") or sub
        pricing = sub.get("customer_pricing") or snap.get("customer_pricing") or {}

        assert float(snap.get("commission_pct", pricing.get("commission_pct", 0))) == 40.0
        assert _approx(snap.get("commission_amount", pricing.get("platform_commission", 0)), 3200.0)
        assert _approx(snap.get("partner_allocation", pricing.get("partner_share", 0)), 4800.0)
        assert _approx(snap.get("platform_fee", pricing.get("platform_fee", 0)), 10.0)
        gst_val = snap.get("gst_amount") or snap.get("tax_amount") or pricing.get("gst") or 0
        assert _approx(gst_val, 577.80), f"gst snapshot={gst_val}"
        total = snap.get("total_payable") or pricing.get("total") or 0
        assert _approx(total, 8587.80), f"total snapshot={total}"
        per_day = snap.get("per_day_earning")
        if per_day is not None:
            # 4800 / 26 working days ≈ 184.62
            assert _approx(per_day, 184.62, tol=0.1), f"per_day={per_day}"

        # stash id for pay test
        pytest.sub_id = sub.get("id") or sub.get("subscription_id") or sub.get("_id")
        assert pytest.sub_id, f"no id in {sub}"

    def test_pay_mock_and_invoice(self, headers):
        sub_id = getattr(pytest, "sub_id", None)
        if not sub_id:
            pytest.skip("no subscription id from prior test")
        r = requests.post(f"{BASE_URL}/api/subscriptions/{sub_id}/pay/mock",
                          headers=headers, timeout=15)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        print("pay/mock resp:", body)
        status = body.get("status") or body.get("subscription", {}).get("status")
        assert status == "active", f"status={status}"

        inv = requests.get(f"{BASE_URL}/api/subscriptions/{sub_id}/invoice",
                           headers=headers, timeout=15)
        assert inv.status_code == 200, inv.text
        iv_meta = inv.json()
        inv_id = iv_meta.get("invoice_id") or iv_meta.get("id")
        assert inv_id, f"no invoice_id in {iv_meta}"
        iv_resp = requests.get(f"{BASE_URL}/api/invoices/{inv_id}",
                               headers=headers, timeout=15)
        assert iv_resp.status_code == 200, iv_resp.text
        iv = iv_resp.json()
        bd = iv.get("breakdown") or {}
        comm = bd.get("platform_commission") or iv.get("platform_commission") or iv.get("commission_amount")
        gst = bd.get("tax") or bd.get("gst") or iv.get("tax") or iv.get("gst_amount")
        total = bd.get("total") or iv.get("total")
        tax_base = bd.get("tax_base")
        assert _approx(comm, 3200.0), f"invoice commission={comm}"
        assert _approx(gst, 577.80), f"invoice gst={gst}"
        assert _approx(total, 8587.80), f"invoice total={total}"
        # Confirm GST is on (commission + platform fee), not on full price
        if tax_base is not None:
            assert _approx(tax_base, 3210.0), f"tax_base={tax_base}"
