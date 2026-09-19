"""Iter41 money rules pytest suite.

Verifies new pricing/commission/cancellation rules:
  * GST computed on post-discount taxable
  * Coupon MONSOON20 (20% off, capped ₹200)
  * Admin commission validation (must sum to 100)
  * Cancellation split (customer/partner/platform/merchant)
  * No-partner cancellation → 100% refund
  * Existing legacy pytest suites still pass (run externally)
"""
import os
import datetime as dt
import pytest
import requests

BASE_URL = [l.split("=", 1)[1].strip() for l in open("/app/frontend/.env")
            if l.startswith("REACT_APP_BACKEND_URL")][0].rstrip("/")
OTP = "123456"
ADMIN = "+919000000000"
CUSTOMER = "+919000000004"
PARTNER = "+919000000003"


def _login(phone):
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp",
                      json={"phone": phone, "otp": OTP}, timeout=60)
    r.raise_for_status()
    return r.json()["token"], r.json()["user"]


@pytest.fixture(scope="module")
def tokens():
    a, au = _login(ADMIN)
    c, cu = _login(CUSTOMER)
    p, pu = _login(PARTNER)
    return {"admin": a, "customer": c, "partner": p,
            "admin_u": au, "customer_u": cu, "partner_u": pu}


@pytest.fixture(scope="module")
def settings(tokens):
    r = requests.get(f"{BASE_URL}/api/admin/settings",
                     headers={"Authorization": f"Bearer {tokens['admin']}"}, timeout=30)
    r.raise_for_status()
    return r.json()


@pytest.fixture(scope="module")
def service(tokens):
    """Pick a service demo partner can accept."""
    par = tokens["partner_u"]
    skills = [s.lower() for s in (par.get("skills") or [])]
    r = requests.get(f"{BASE_URL}/api/catalog/services", timeout=30)
    r.raise_for_status()
    js = r.json()
    items = js if isinstance(js, list) else js.get("items", [])
    svc = next((s for s in items if str(s.get("required_skill", "")).lower() in skills
                or str(s.get("category_name", "")).lower() in skills), items[0])
    return svc


def _check_pricing_invariants(p, gst_pct):
    """Assert pricing dict satisfies the new money rules."""
    fees = ["base", "addons_total", "emergency_fee", "surge", "visiting_charge",
            "convenience_fee", "platform_fee"]
    expected_gross = round(sum(float(p.get(k, 0) or 0) for k in fees), 2)
    assert abs(p["gross_charges"] - expected_gross) < 0.02, \
        f"gross_charges {p['gross_charges']} != sum(fees) {expected_gross} (fields present: { {k:p.get(k) for k in fees} })"
    assert round(p["gross_charges"] - p["total_discount"], 2) == round(p["taxable"], 2), \
        f"taxable != gross-discount: {p}"
    assert round(p["taxable"] * gst_pct / 100.0, 2) == round(p["gst"], 2), \
        f"gst != taxable*{gst_pct}%: {p}"
    assert round(p["taxable"] + p["gst"], 2) == round(p["total"], 2), \
        f"total != taxable+gst: {p}"
    assert round(p["commissionable_base"], 2) == round(p["taxable"], 2), \
        f"commissionable_base != taxable: {p}"


# ---------- Pricing / Quote ----------

class TestQuoteAndCart:
    def test_quote_emergency_no_coupon(self, tokens, service, settings):
        r = requests.get(f"{BASE_URL}/api/bookings/quote",
                         params={"service_id": service["id"], "schedule_type": "emergency"},
                         headers={"Authorization": f"Bearer {tokens['customer']}"}, timeout=30)
        assert r.status_code == 200, r.text
        p = r.json().get("pricing", r.json())
        _check_pricing_invariants(p, settings["gst_pct"])
        assert p.get("emergency_fee", 0) > 0, "emergency should have emergency_fee>0"
        assert p.get("total_discount", 0) == 0

    def test_quote_with_coupon_MONSOON20(self, tokens, service, settings):
        r = requests.get(f"{BASE_URL}/api/bookings/quote",
                         params={"service_id": service["id"], "schedule_type": "schedule",
                                 "coupon_code": "MONSOON20"},
                         headers={"Authorization": f"Bearer {tokens['customer']}"}, timeout=30)
        assert r.status_code == 200, r.text
        p = r.json().get("pricing", r.json())
        _check_pricing_invariants(p, settings["gst_pct"])
        expected_discount = round(min(p["gross_charges"] * 0.20, 200.0), 2)
        assert abs(p["discount"] - expected_discount) < 0.02, \
            f"coupon discount {p['discount']} != min(20% of {p['gross_charges']}, 200) = {expected_discount}"

    def test_cart_quote_with_coupon(self, tokens, service, settings):
        r = requests.post(f"{BASE_URL}/api/bookings/cart-quote",
                          json={"items": [{"service_id": service["id"], "qty": 1}],
                                "coupon_code": "MONSOON20"},
                          headers={"Authorization": f"Bearer {tokens['customer']}"}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        # Response can be either flat or nested; find pricing
        p = body.get("pricing") or body.get("total_pricing") or body
        # Some cart responses wrap per-category; try to find gross_charges
        if "gross_charges" not in p and "orders" in body:
            # aggregate orders
            orders = body["orders"]
            p = orders[0].get("pricing", orders[0]) if orders else p
        assert "gross_charges" in p, f"pricing missing gross_charges: {body}"
        _check_pricing_invariants(p, settings["gst_pct"])


# ---------- Admin settings validation ----------

class TestAdminSettings:
    @pytest.fixture(autouse=True)
    def _restore(self, tokens, settings):
        """Snapshot & restore commission block."""
        original = dict(settings.get("commission") or {})
        yield
        requests.put(f"{BASE_URL}/api/admin/settings",
                     json={"commission": original},
                     headers={"Authorization": f"Bearer {tokens['admin']}"}, timeout=30)

    def test_commission_sums_bad(self, tokens):
        # 30+60+5+3 = 98 → reject
        payload = {"commission": {
            "platform_pct": 30, "partner_pct": 60,
            "merchant_partner_referral_pct": 5, "merchant_customer_pct": 3,
            "customer_refund_pct": 80, "partner_cancellation_pct": 20}}
        r = requests.put(f"{BASE_URL}/api/admin/settings", json=payload,
                         headers={"Authorization": f"Bearer {tokens['admin']}"}, timeout=30)
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"

    def test_commission_sums_good(self, tokens):
        # 32+60+5+3 = 100
        payload = {"commission": {
            "platform_pct": 32, "partner_pct": 60,
            "merchant_partner_referral_pct": 5, "merchant_customer_pct": 3,
            "customer_refund_pct": 80, "partner_cancellation_pct": 20}}
        r = requests.put(f"{BASE_URL}/api/admin/settings", json=payload,
                         headers={"Authorization": f"Bearer {tokens['admin']}"}, timeout=30)
        assert r.status_code == 200, r.text
        # Read back
        rr = requests.get(f"{BASE_URL}/api/admin/settings",
                          headers={"Authorization": f"Bearer {tokens['admin']}"}, timeout=30)
        cm = rr.json()["commission"]
        assert cm["platform_pct"] == 32 and cm["partner_pct"] == 60

    def test_cancel_split_bad(self, tokens):
        payload = {"commission": {"customer_refund_pct": 70, "partner_cancellation_pct": 20}}
        r = requests.put(f"{BASE_URL}/api/admin/settings", json=payload,
                         headers={"Authorization": f"Bearer {tokens['admin']}"}, timeout=30)
        assert r.status_code == 400, r.text

    def test_cancel_split_good(self, tokens):
        payload = {"commission": {"customer_refund_pct": 80, "partner_cancellation_pct": 20}}
        r = requests.put(f"{BASE_URL}/api/admin/settings", json=payload,
                         headers={"Authorization": f"Bearer {tokens['admin']}"}, timeout=30)
        assert r.status_code == 200, r.text


# ---------- E2E Cancel with partner assigned ----------

def _create_and_pay(tokens, service, coupon=None, schedule_type="schedule"):
    addr = {"line": "12 MG Road", "city": "Patna", "state": "Bihar",
            "pincode": "800001", "lat": 25.61, "lng": 85.14}
    when = (dt.datetime.utcnow() + dt.timedelta(days=1)).strftime("%Y-%m-%dT10:00:00")
    body = {"service_id": service["id"], "address": addr,
            "schedule_type": schedule_type,
            "scheduled_at": (when if schedule_type == "schedule" else None)}
    if coupon:
        body["coupon_code"] = coupon
    r = requests.post(f"{BASE_URL}/api/bookings", json=body,
                      headers={"Authorization": f"Bearer {tokens['customer']}"}, timeout=60)
    assert r.status_code == 200, r.text
    b = r.json()
    r2 = requests.post(f"{BASE_URL}/api/payments/mock",
                       json={"purpose": "booking", "booking_id": b["id"],
                             "amount": b["pricing"]["total"]},
                       headers={"Authorization": f"Bearer {tokens['customer']}"}, timeout=30)
    assert r2.status_code == 200, r2.text
    return b


class TestCancelWithPartner:
    def test_cancel_flow(self, tokens, service, settings):
        b = _create_and_pay(tokens, service, coupon="MONSOON20")
        p = b["pricing"]
        gst_pct = settings["gst_pct"]
        _check_pricing_invariants(p, gst_pct)

        # partner accept (fallback: admin force-assign)
        acc = requests.post(f"{BASE_URL}/api/bookings/{b['id']}/accept",
                            headers={"Authorization": f"Bearer {tokens['partner']}"}, timeout=30)
        if acc.status_code != 200:
            fr = requests.post(f"{BASE_URL}/api/admin/bookings/{b['id']}/assign",
                               json={"partner_id": tokens["partner_u"]["id"], "force": True},
                               headers={"Authorization": f"Bearer {tokens['admin']}"}, timeout=30)
            assert fr.status_code == 200, f"force-assign failed: {fr.text}"

        # wallet before
        wb = requests.get(f"{BASE_URL}/api/wallet",
                          headers={"Authorization": f"Bearer {tokens['partner']}"}, timeout=30).json()
        par_before = float(wb.get("balance") or wb.get("wallet_balance") or 0)

        # preview
        prev = requests.get(f"{BASE_URL}/api/bookings/{b['id']}/cancellation-preview",
                            headers={"Authorization": f"Bearer {tokens['customer']}"}, timeout=30).json()
        cm = settings["commission"]
        exp_srv_refund = round((p["total"] - p["gst"]) * cm["customer_refund_pct"] / 100.0, 2)
        exp_gst_refund = round(p["gst"] * cm["customer_refund_pct"] / 100.0, 2)
        assert abs(prev["service_refund"] - exp_srv_refund) < 0.02
        assert abs(prev["gst_refund"] - exp_gst_refund) < 0.02
        assert abs(prev["refund"] - round(exp_srv_refund + exp_gst_refund, 2)) < 0.02

        # cancel
        rr = requests.post(f"{BASE_URL}/api/bookings/{b['id']}/cancel",
                           json={"reason": "iter41-probe"},
                           headers={"Authorization": f"Bearer {tokens['customer']}"}, timeout=30)
        assert rr.status_code == 200, rr.text
        c = rr.json().get("cancellation", rr.json())
        assert abs(c["service_amount"] - (p["total"] - p["gst"])) < 0.02
        assert abs(c["refund"] - prev["refund"]) < 0.02
        cancel_charge = round(c["service_amount"] - c["service_refund"], 2)
        assert abs(c["cancel_charge"] - cancel_charge) < 0.02
        gst_retained = round(p["gst"] - c["gst_refund"], 2)
        assert abs(c["gst_retained"] - gst_retained) < 0.02
        # The partner/platform/merchant split runs on the authoritative `commission_charge`
        # (NOT the raw cancel_charge): platform + convenience fees are excluded (100% platform
        # revenue, never partner/merchant) and the coupon is added back proportional to the
        # cancellation % (partner is never penalised for a platform-funded coupon). First
        # verify commission_charge is built exactly that way, then verify each split off it.
        refund_pct_val = cm["customer_refund_pct"]
        plat_only = round((p.get("platform_fee") or 0) + (p.get("convenience_fee") or 0), 2)
        base_service = round((p["total"] - p["gst"]) - plat_only, 2)
        cancel_charge_service = round(base_service - round(base_service * refund_pct_val / 100.0, 2), 2)
        coupon_disc = round(p.get("discount") or 0, 2)
        exp_commission_charge = round(cancel_charge_service + round(coupon_disc * cm["partner_cancellation_pct"] / 100.0, 2), 2)
        assert abs(c["commission_charge"] - exp_commission_charge) < 0.05, \
            f"commission_charge {c['commission_charge']} != {exp_commission_charge}"
        cbase = c["commission_charge"]
        exp_partner_cut = round(cbase * cm["partner_pct"] / 100.0, 2)
        assert abs(c["partner_cut"] - exp_partner_cut) < 0.05
        exp_platform_gross = round(cbase - exp_partner_cut, 2)
        assert abs(c["platform_gross"] - exp_platform_gross) < 0.05
        # demo partner IS referred by a merchant → merchant_partner_comm > 0
        exp_mref = round(cbase * cm["merchant_partner_referral_pct"] / 100.0, 2)
        assert abs(c["merchant_partner_comm"] - exp_mref) < 0.05
        assert c["merchant_partner_comm"] > 0, "expected merchant_partner_comm > 0 (demo partner has referrer)"
        assert c["merchant_customer_comm"] == 0
        exp_admin = round(exp_platform_gross - exp_mref, 2)
        assert abs(c["admin_cut"] - exp_admin) < 0.02
        # sum invariant
        total_sum = round(c["refund"] + c["cancel_charge"] + c["gst_retained"], 2)
        assert abs(total_sum - p["total"]) < 0.02, f"{total_sum} != {p['total']}"

        # partner wallet delta
        wa = requests.get(f"{BASE_URL}/api/wallet",
                          headers={"Authorization": f"Bearer {tokens['partner']}"}, timeout=30).json()
        par_after = float(wa.get("balance") or wa.get("wallet_balance") or 0)
        assert abs((par_after - par_before) - exp_partner_cut) < 0.02, \
            f"partner wallet delta {par_after-par_before} != partner_cut {exp_partner_cut}"

        # admin booking detail
        d = requests.get(f"{BASE_URL}/api/admin/bookings/{b['id']}/detail",
                         headers={"Authorization": f"Bearer {tokens['admin']}"}, timeout=30).json()
        com = d.get("commission")
        assert com and com.get("kind") == "cancellation", f"commission.kind expected 'cancellation': {com}"
        bill = com.get("bill") or {}
        for k in ("gross_charges", "total_discount", "taxable", "gst", "total"):
            assert k in bill, f"bill missing {k}: {bill}"
        rows = {r["role"]: r for r in com.get("rows", [])}
        for role in ("customer", "partner", "platform", "merchant_referral", "merchant_customer"):
            assert role in rows, f"missing row {role}: {list(rows)}"
        row_sum = round(rows["partner"]["amount"] + rows["platform"]["amount"]
                        + rows["merchant_referral"]["amount"] + rows["merchant_customer"]["amount"], 2)
        # rows split the authoritative commission_charge (fees excluded + coupon added back),
        # not the raw retained cancel_charge.
        assert abs(row_sum - c["commission_charge"]) < 0.05, \
            f"partner+platform+merchants ({row_sum}) != commission_charge ({c['commission_charge']})"


class TestCancelNoPartner:
    def test_no_partner_full_refund(self, tokens, service):
        b = _create_and_pay(tokens, service, coupon=None)
        p = b["pricing"]
        rr = requests.post(f"{BASE_URL}/api/bookings/{b['id']}/cancel",
                           json={"reason": "iter41-noassign"},
                           headers={"Authorization": f"Bearer {tokens['customer']}"}, timeout=30)
        assert rr.status_code == 200, rr.text
        c = rr.json().get("cancellation", rr.json())
        assert abs(c["refund"] - p["total"]) < 0.02, f"refund {c['refund']} != total {p['total']}"
        assert c.get("cancel_charge", 0) == 0
        assert c.get("partner_cut", 0) == 0
        assert c.get("admin_cut", 0) == 0
        assert c.get("refund_pct") == 100 or c.get("refund_pct") == 100.0


# ---------- E2E Completion flow ----------

class TestCompletion:
    def test_complete_flow(self, tokens, service, settings):
        b = _create_and_pay(tokens, service, coupon=None, schedule_type="emergency")
        p = b["pricing"]
        bid = b["id"]
        acc = requests.post(f"{BASE_URL}/api/bookings/{bid}/accept",
                            headers={"Authorization": f"Bearer {tokens['partner']}"}, timeout=30)
        if acc.status_code != 200:
            requests.post(f"{BASE_URL}/api/admin/bookings/{bid}/assign",
                          json={"partner_id": tokens["partner_u"]["id"], "force": True},
                          headers={"Authorization": f"Bearer {tokens['admin']}"}, timeout=30)
        # evidence before
        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/evidence",
                          json={"stage": "before", "images": ["https://ex/b.jpg"]},
                          headers={"Authorization": f"Bearer {tokens['partner']}"}, timeout=30)
        assert r.status_code == 200, r.text
        # get otps from customer view
        cb = requests.get(f"{BASE_URL}/api/bookings/{bid}",
                          headers={"Authorization": f"Bearer {tokens['customer']}"}, timeout=30).json()
        otps = cb.get("otps") or {}
        assert otps.get("start") and otps.get("completion"), f"missing OTPs: {otps}"
        # start-otp
        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/start-otp",
                          json={"otp": otps["start"]},
                          headers={"Authorization": f"Bearer {tokens['partner']}"}, timeout=30)
        assert r.status_code == 200, r.text
        # evidence after
        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/evidence",
                          json={"stage": "after", "images": ["https://ex/a.jpg"]},
                          headers={"Authorization": f"Bearer {tokens['partner']}"}, timeout=30)
        assert r.status_code == 200, r.text
        # wallet before & complete
        wb = requests.get(f"{BASE_URL}/api/wallet",
                          headers={"Authorization": f"Bearer {tokens['partner']}"}, timeout=30).json()
        par_before = float(wb.get("balance") or wb.get("wallet_balance") or 0)
        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/complete",
                          json={"otp": otps["completion"]},
                          headers={"Authorization": f"Bearer {tokens['partner']}"}, timeout=30)
        assert r.status_code == 200, r.text
        wa = requests.get(f"{BASE_URL}/api/wallet",
                          headers={"Authorization": f"Bearer {tokens['partner']}"}, timeout=30).json()
        par_after = float(wa.get("balance") or wa.get("wallet_balance") or 0)

        d = requests.get(f"{BASE_URL}/api/admin/bookings/{bid}/detail",
                         headers={"Authorization": f"Bearer {tokens['admin']}"}, timeout=30).json()
        com = d["commission"]
        cm = settings["commission"]
        base = round(p["total"] - p["gst"], 2)
        assert abs(com["base"] - base) < 0.02
        exp_partner = round(base * cm["partner_pct"] / 100.0, 2)
        exp_mref = round(base * cm["merchant_partner_referral_pct"] / 100.0, 2)
        exp_platform_gross = round(base - exp_partner, 2)
        exp_platform = round(exp_platform_gross - exp_mref, 2)
        assert abs(com["partner_earning"] - exp_partner) < 0.02
        assert abs(com["merchant_referral"] - exp_mref) < 0.02
        assert abs(com["platform_earning"] - exp_platform) < 0.02
        assert com["merchant_customer"] == 0
        # Partner wallet increases by EXACTLY partner_earning (no separate visiting-charge credit)
        assert abs((par_after - par_before) - exp_partner) < 0.02, \
            f"wallet delta {par_after-par_before} != partner_earning {exp_partner}"
