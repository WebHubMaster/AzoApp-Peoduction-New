"""Decimal-safe money migration regression tests.

Verifies that PricingEngine + partner/merchant wallet + withdrawal flows
never raise 500 (Decimal-vs-float TypeErrors) and that every money value
in API responses is 2-decimal accurate and reconciles arithmetically.

Endpoints under test:
  GET  /api/bookings/quote
  POST /api/bookings/cart-quote
  GET  /api/partner/wallet
  GET  /api/partner/earnings-summary
  POST /api/partner/withdrawals            (UPI reject-400)
  GET  /api/merchant/wallet                (nested under "summary")
  POST /api/merchant/wallet/withdraw       (UPI reject-400)
"""
import os
import math
from decimal import Decimal, ROUND_HALF_UP

import pytest
import requests

def _load_base():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except FileNotFoundError:
            pass
    assert url, "REACT_APP_BACKEND_URL missing"
    return url.rstrip("/")


BASE = _load_base()

TWO = Decimal("0.01")


def _q2(x):
    return float(Decimal(str(x)).quantize(TWO, rounding=ROUND_HALF_UP))


def _is_2dp(x):
    """A float is 2dp when it equals its own quantize(0.01)."""
    return math.isclose(float(x), _q2(x), abs_tol=1e-9)


# ------------------------------------------------------------------ auth
def _login(sess, phone):
    r = sess.post(f"{BASE}/api/auth/send-otp", json={"phone": phone}, timeout=60)
    assert r.status_code == 200, f"send-otp {phone}: {r.status_code} {r.text[:200]}"
    r = sess.post(f"{BASE}/api/auth/verify-otp",
                  json={"phone": phone, "otp": "123456"}, timeout=60)
    assert r.status_code == 200, f"verify-otp {phone}: {r.status_code} {r.text[:200]}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token: {r.text[:200]}"
    return tok


@pytest.fixture(scope="module")
def s():
    ss = requests.Session()
    ss.headers.update({"Content-Type": "application/json"})
    return ss


@pytest.fixture(scope="module")
def customer_tok(s):  return _login(s, "+919000000004")


@pytest.fixture(scope="module")
def partner_tok(s):   return _login(s, "+919000000003")


@pytest.fixture(scope="module")
def merchant_tok(s):  return _login(s, "+919000000002")


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------------------------------------------------------------- catalog
@pytest.fixture(scope="module")
def services(s):
    r = s.get(f"{BASE}/api/catalog/services", timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data if isinstance(data, list) else (data.get("items") or data.get("services") or [])
    items = [i for i in items if float(i.get("base_price") or 0) > 0 and i.get("id")]
    assert items, "no active services with base_price > 0"
    items.sort(key=lambda x: float(x.get("base_price") or 0))
    return items


# =================================================================
# 1) Single-service quote (emergency) — Decimal-safe totals
# =================================================================
def test_quote_single_service_emergency_reconciles(s, customer_tok, services):
    svc = services[0]
    r = s.get(f"{BASE}/api/bookings/quote",
              params={"service_id": svc["id"], "schedule_type": "emergency"},
              headers=_hdr(customer_tok), timeout=60)
    assert r.status_code == 200, r.text
    pr = r.json().get("pricing") or r.json()

    for k in ("base", "emergency_fee", "surge", "visiting_charge",
              "taxable", "gst", "total", "discount"):
        v = float(pr.get(k, 0) or 0)
        assert _is_2dp(v), f"quote.{k}={pr.get(k)} not 2-decimal"

    taxable = float(pr["taxable"])
    gst = float(pr["gst"])
    vc = float(pr.get("visiting_charge") or 0)
    discount = float(pr.get("discount") or 0)
    total = float(pr["total"])

    # gst == 18% of taxable (HALF_UP), 2dp
    expected_gst = _q2(taxable * 18 / 100)
    assert math.isclose(gst, expected_gst, abs_tol=0.01), \
        f"gst {gst} != 18% of taxable {taxable} ({expected_gst})"
    # NEW RULE: tax on everything after discount → total == taxable + gst
    expected_total = _q2(taxable + gst)
    assert math.isclose(total, expected_total, abs_tol=0.01), \
        f"total {total} != {expected_total} (taxable+gst)"
    assert math.isclose(taxable, _q2(float(pr["gross_charges"]) - float(pr.get("total_discount") or 0)), abs_tol=0.01)


# =================================================================
# 2) Multi-item cart quote — qty>1 + multi-service reconciles exactly
# =================================================================
def test_cart_quote_multi_service_reconciles_exactly(s, customer_tok, services):
    # Pick two different services (or the same one twice, qty=2)
    svc_a = services[0]
    svc_b = services[1] if len(services) > 1 else services[0]
    body = {
        "items": [
            {"service_id": svc_a["id"], "qty": 2},
            {"service_id": svc_b["id"], "qty": 1},
        ],
        "schedule_type": "emergency",
    }
    r = s.post(f"{BASE}/api/bookings/cart-quote",
               json=body, headers=_hdr(customer_tok), timeout=60)
    assert r.status_code == 200, r.text
    q = r.json()
    pr = q.get("pricing") or {}

    for k in ("emergency_fee", "surge", "visiting_charge",
              "subtotal", "gst", "total", "discount"):
        v = float(pr.get(k, 0) or 0)
        assert _is_2dp(v), f"cart.pricing.{k}={pr.get(k)} not 2-decimal"

    # cart-quote returns 'subtotal' (service+emergency+surge+vc). In cart_quote
    # the tax base = subtotal + convenience + platform (unlike single-quote
    # engine.compute where VC is excluded — see NOTE in report).
    subtotal = float(pr.get("subtotal") or 0)
    conv = float(pr.get("convenience_fee") or 0)
    plat = float(pr.get("platform_fee") or 0)
    taxable = _q2(subtotal + conv + plat)
    gst = float(pr.get("gst") or 0)
    discount = float(pr.get("discount") or 0)
    total = float(pr.get("total") or 0)
    exp_gst = _q2(taxable * 18 / 100)
    assert math.isclose(gst, exp_gst, abs_tol=0.01), \
        f"gst {gst} vs {exp_gst} (taxable={taxable})"
    exp_total = _q2(taxable + gst - discount)
    assert math.isclose(total, exp_total, abs_tol=0.01), \
        f"total {total} vs {exp_total}"


# =================================================================
# 3) Partner wallet endpoint — 2dp fields, no 500
# =================================================================
def test_partner_wallet_fields_2dp(s, partner_tok):
    r = s.get(f"{BASE}/api/partner/wallet", headers=_hdr(partner_tok), timeout=60)
    assert r.status_code == 200, r.text
    w = r.json()
    for k in ("available_balance", "withdrawable_balance", "pending_balance",
              "total_earned", "total_incentive", "total_penalty", "total_withdrawn"):
        assert k in w, f"missing key {k}"
        assert _is_2dp(w[k]), f"{k}={w[k]} not 2-decimal"
    # withdrawable = available - pending (>=0)
    assert w["withdrawable_balance"] >= 0
    assert math.isclose(
        w["withdrawable_balance"],
        max(_q2(w["available_balance"] - w["pending_balance"]), 0.0),
        abs_tol=0.01,
    )


# =================================================================
# 4) Partner earnings-summary — reconcile gross - tax - net == platform
# =================================================================
def test_partner_earnings_summary_math(s, partner_tok):
    r = s.get(f"{BASE}/api/partner/earnings-summary",
              headers=_hdr(partner_tok), timeout=60)
    assert r.status_code == 200, r.text
    es = r.json()
    for k in ("today", "this_week", "this_month", "lifetime"):
        assert k in es and _is_2dp(es[k]), f"{k}={es.get(k)} not 2-decimal"
    # For each recent row check consistency
    for row in es.get("recent", [])[:20]:
        gross = float(row.get("gross") or 0)
        tax = float(row.get("tax") or 0)
        net = float(row.get("net_earning") or 0)
        pc = float(row.get("platform_commission") or 0)
        for v, name in [(gross, "gross"), (tax, "tax"),
                        (net, "net_earning"), (pc, "platform_commission")]:
            assert _is_2dp(v), f"recent.{name}={v} not 2-decimal"
        assert math.isclose(_q2(gross - tax - net), pc, abs_tol=0.01), \
            f"gross({gross}) - tax({tax}) - net({net}) != platform({pc})"


# =================================================================
# 5) Partner withdrawal — UPI must be rejected 400
# =================================================================
def test_partner_withdrawal_upi_rejected(s, partner_tok):
    r = s.post(f"{BASE}/api/partner/withdrawals",
               json={"amount": 100, "method": "upi",
                     "upi_id": "test@upi", "bank": {}},
               headers=_hdr(partner_tok), timeout=60)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"
    body = r.text.lower()
    assert "upi" in body or "bank" in body, f"unexpected reason: {r.text[:200]}"


# =================================================================
# 6) Merchant wallet — nested under 'summary', all fields 2dp
# =================================================================
def test_merchant_wallet_summary_2dp(s, merchant_tok):
    r = s.get(f"{BASE}/api/merchant/wallet", headers=_hdr(merchant_tok), timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "summary" in body, f"'summary' missing: keys={list(body.keys())}"
    w = body["summary"]
    for k in ("available_balance", "withdrawable_balance", "pending_balance",
              "total_earned", "total_referral", "total_customer", "total_withdrawn"):
        assert k in w, f"missing {k}"
        assert _is_2dp(w[k]), f"{k}={w[k]} not 2-decimal"
    # total_earned == total_referral + total_customer (2dp)
    exp = _q2(float(w["total_referral"]) + float(w["total_customer"]))
    assert math.isclose(float(w["total_earned"]), exp, abs_tol=0.01), \
        f"total_earned {w['total_earned']} != {exp}"


# =================================================================
# 7) Merchant withdrawal — UPI must be rejected 400
# =================================================================
def test_merchant_withdrawal_upi_rejected(s, merchant_tok):
    r = s.post(f"{BASE}/api/merchant/wallet/withdraw",
               json={"amount": 100, "method": "upi", "upi_id": "test@upi"},
               headers=_hdr(merchant_tok), timeout=60)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"


# =================================================================
# 8) Cart-quote guest (no auth) — must not 500 (Decimal path safe for guests too)
# =================================================================
def test_cart_quote_guest_no_500(s, services):
    svc = services[0]
    r = s.post(f"{BASE}/api/bookings/cart-quote",
               json={"items": [{"service_id": svc["id"], "qty": 3}],
                     "schedule_type": "schedule"},
               timeout=60)
    # 200 (guest allowed) or 401 acceptable, but NEVER 500
    assert r.status_code != 500, f"guest cart-quote 500: {r.text[:400]}"
    if r.status_code == 200:
        pr = r.json().get("pricing") or {}
        for k in ("subtotal", "gst", "total"):
            if k in pr:
                assert _is_2dp(pr[k]), f"{k}={pr[k]} not 2dp"
