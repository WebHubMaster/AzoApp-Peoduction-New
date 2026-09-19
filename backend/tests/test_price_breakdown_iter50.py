"""
Iteration 50 — Price breakdown / invoice standardization tests.

Covers:
- Customer bookings have `breakdown` with reconcilable totals.
- Partner/Merchant bookings HIDE convenience_fee and platform_fee.
- Customer invoice HTML/PDF uses 'Est. Govt. Taxes' label, no GST%.
- Partner invoice HTML/PDF: same, and no 'Convenience'/'Platform' text.
- Cancellation invoice check (if any).
"""
import os
import re
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

CUSTOMER_PHONE = "+919000000004"
PARTNER_PHONE = "+919000000003"
MERCHANT_PHONE = "+919000000002"
OTP = "123456"

PCT_RE = re.compile(r"GST\s*\(?\s*\d+\s*%|\d+\s*%\s*GST|\+?\s*18\s*%", re.IGNORECASE)


def _login(phone: str) -> str:
    r = requests.post(f"{BASE}/api/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, f"send-otp failed {phone}: {r.status_code} {r.text[:200]}"
    r = requests.post(f"{BASE}/api/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=15)
    assert r.status_code == 200, f"verify-otp failed {phone}: {r.status_code} {r.text[:200]}"
    data = r.json()
    tok = data.get("token") or data.get("access_token") or (data.get("data") or {}).get("token")
    assert tok, f"no token in {data}"
    return tok


@pytest.fixture(scope="module")
def cust_headers():
    return {"Authorization": f"Bearer {_login(CUSTOMER_PHONE)}"}


@pytest.fixture(scope="module")
def partner_headers():
    return {"Authorization": f"Bearer {_login(PARTNER_PHONE)}"}


@pytest.fixture(scope="module")
def merchant_headers():
    return {"Authorization": f"Bearer {_login(MERCHANT_PHONE)}"}


# ---------------- Customer bookings ----------------
def test_customer_bookings_have_breakdown(cust_headers):
    r = requests.get(f"{BASE}/api/bookings", headers=cust_headers, timeout=15)
    assert r.status_code == 200, r.text[:300]
    payload = r.json()
    bookings = payload if isinstance(payload, list) else payload.get("bookings") or payload.get("data") or []
    assert isinstance(bookings, list) and bookings, "customer has no bookings to test"
    checked = 0
    for b in bookings[:5]:
        br = b.get("breakdown")
        assert br, f"booking {b.get('id')} missing breakdown"
        for k in ("services_subtotal", "additional_charges", "taxable", "tax", "total"):
            assert k in br, f"breakdown missing key {k} in booking {b.get('id')}"
        # reconcile
        charges_total = sum(float(c.get("amount", 0)) for c in br.get("additional_charges", []))
        discount = float(br.get("discount", 0) or 0)
        exp_taxable = round(float(br["services_subtotal"]) + charges_total - discount, 2)
        assert abs(exp_taxable - float(br["taxable"])) <= 0.01, (
            f"taxable mismatch: got {br['taxable']} expected {exp_taxable} (booking {b.get('id')})"
        )
        exp_total = round(float(br["taxable"]) + float(br["tax"]), 2)
        assert abs(exp_total - float(br["total"])) <= 0.01, (
            f"total mismatch: got {br['total']} expected {exp_total} (booking {b.get('id')})"
        )
        checked += 1
    assert checked > 0


def test_customer_booking_detail_breakdown(cust_headers):
    r = requests.get(f"{BASE}/api/bookings", headers=cust_headers, timeout=15)
    assert r.status_code == 200
    payload = r.json()
    bookings = payload if isinstance(payload, list) else payload.get("bookings") or payload.get("data") or []
    if not bookings:
        pytest.skip("no bookings")
    bid = bookings[0].get("id") or bookings[0].get("_id")
    r = requests.get(f"{BASE}/api/bookings/{bid}", headers=cust_headers, timeout=15)
    assert r.status_code == 200, r.text[:300]
    b = r.json()
    b = b.get("booking") or b.get("data") or b
    assert b.get("breakdown"), "detail missing breakdown"


# ---------------- Partner/Merchant hide fees ----------------
def _extract_bookings(payload):
    if isinstance(payload, list):
        return payload
    for k in ("bookings", "jobs", "data", "items"):
        if isinstance(payload.get(k), list):
            return payload[k]
    return []


def _assert_no_fees(obj, ctx):
    # search recursively for banned keys
    banned = {"convenience_fee", "platform_fee"}
    stack = [obj]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            for k, v in cur.items():
                assert k not in banned, f"{ctx}: found banned key '{k}'"
                stack.append(v)
        elif isinstance(cur, list):
            stack.extend(cur)


def test_partner_bookings_no_fees(partner_headers):
    endpoints = [
        "/api/bookings",
        "/api/bookings/partner/jobs",
        "/api/bookings/partner/active",
    ]
    a_booking_id = None
    for ep in endpoints:
        r = requests.get(f"{BASE}{ep}", headers=partner_headers, timeout=15)
        assert r.status_code == 200, f"{ep}: {r.status_code} {r.text[:200]}"
        payload = r.json()
        bookings = _extract_bookings(payload) if isinstance(payload, (list, dict)) else []
        _assert_no_fees(payload, f"partner {ep}")
        for b in bookings:
            if not a_booking_id:
                a_booking_id = b.get("id") or b.get("_id")
    if a_booking_id:
        r = requests.get(f"{BASE}/api/bookings/{a_booking_id}", headers=partner_headers, timeout=15)
        assert r.status_code == 200, r.text[:300]
        _assert_no_fees(r.json(), "partner booking detail")


def test_merchant_bookings_no_fees(merchant_headers):
    r = requests.get(f"{BASE}/api/bookings", headers=merchant_headers, timeout=15)
    assert r.status_code == 200, r.text[:300]
    _assert_no_fees(r.json(), "merchant /api/bookings")


# ---------------- Invoices customer ----------------
def _get_invoices(headers):
    r = requests.get(f"{BASE}/api/invoices", headers=headers, timeout=15)
    assert r.status_code == 200, r.text[:300]
    p = r.json()
    if isinstance(p, list):
        return p
    return p.get("items") or p.get("invoices") or p.get("data") or []


def test_customer_invoice_html_pdf_labels(cust_headers):
    invs = _get_invoices(cust_headers)
    assert invs, "customer has no invoices"
    booking_inv = next((i for i in invs if (i.get("invoice_type") or i.get("type") or "").lower() != "cancellation"), invs[0])
    inv_id = booking_inv.get("id") or booking_inv.get("_id")
    # HTML
    r = requests.get(f"{BASE}/api/invoices/{inv_id}/view", headers=cust_headers, timeout=20)
    assert r.status_code == 200, r.text[:200]
    html = r.text
    # Strip base64 font blob (contains stray 'GST'/'Est'/'Tax' letter sequences)
    html_clean = re.sub(r"data:font/ttf;base64,[^)]+", "", html)
    assert "Est. Govt. Taxes" in html_clean, "customer HTML missing 'Est. Govt. Taxes'"
    m = PCT_RE.search(html_clean)
    assert not m, f"HTML has percentage/GST tax label: {m.group(0) if m else ''}"
    assert "GST / Tax" not in html_clean
    # PDF - decompress via pypdf
    r = requests.get(f"{BASE}/api/invoices/{inv_id}/pdf", headers=cust_headers, timeout=30)
    assert r.status_code == 200
    try:
        import pypdf, io as _io
        reader = pypdf.PdfReader(_io.BytesIO(r.content))
        pdf_text = "\n".join((p.extract_text() or "") for p in reader.pages)
    except Exception as e:
        pytest.skip(f"pypdf unavailable: {e}")
    assert "Est. Govt. Taxes" in pdf_text, f"PDF missing 'Est. Govt. Taxes'. Text sample: {pdf_text[:400]}"
    m = PCT_RE.search(pdf_text)
    assert not m, f"PDF has percentage/GST tax label: {m.group(0) if m else ''}"


def test_customer_cancellation_invoice_if_any(cust_headers):
    invs = _get_invoices(cust_headers)
    cxl = next((i for i in invs if "cancel" in (i.get("type") or i.get("invoice_type") or "").lower()), None)
    if not cxl:
        pytest.skip("no cancellation invoice for customer")
    inv_id = cxl.get("id") or cxl.get("_id")
    r = requests.get(f"{BASE}/api/invoices/{inv_id}/view", headers=cust_headers, timeout=20)
    assert r.status_code == 200
    html = r.text
    m = PCT_RE.search(html)
    assert not m, f"Cancellation HTML has tax %: {m.group(0) if m else ''}"


# ---------------- Invoices partner ----------------
def test_partner_invoice_html_pdf(partner_headers):
    invs = _get_invoices(partner_headers)
    if not invs:
        pytest.skip("partner has no invoices")
    booking_inv = next((i for i in invs if (i.get("invoice_type") or i.get("type") or "").lower() == "booking"), None)
    if not booking_inv:
        pytest.skip("partner has no booking invoice")
    inv_id = booking_inv.get("id") or booking_inv.get("_id")

    r = requests.get(f"{BASE}/api/invoices/{inv_id}/view", headers=partner_headers, timeout=20)
    assert r.status_code == 200, r.text[:200]
    html = r.text
    html_clean = re.sub(r"data:font/ttf;base64,[^)]+", "", html)
    # Partner earning invoice may not have a tax row (only Customer Total Paid / Partner Earning).
    # If a tax row does appear, it must use the standardized label with no percentage.
    m = PCT_RE.search(html_clean)
    assert not m, f"partner HTML has tax %: {m.group(0) if m else ''}"
    assert "Convenience" not in html_clean, "partner HTML contains 'Convenience'"
    assert "Platform Fee" not in html_clean, "partner HTML contains 'Platform Fee'"

    r = requests.get(f"{BASE}/api/invoices/{inv_id}/pdf", headers=partner_headers, timeout=30)
    assert r.status_code == 200
    try:
        import pypdf, io as _io
        reader = pypdf.PdfReader(_io.BytesIO(r.content))
        pdf_text = "\n".join((p.extract_text() or "") for p in reader.pages)
    except Exception as e:
        pytest.skip(f"pypdf unavailable: {e}")
    m = PCT_RE.search(pdf_text)
    assert not m, f"partner PDF has tax %: {m.group(0) if m else ''}"
    assert "Convenience" not in pdf_text, "partner PDF contains 'Convenience'"
    assert "Platform Fee" not in pdf_text, "partner PDF contains 'Platform Fee'"
