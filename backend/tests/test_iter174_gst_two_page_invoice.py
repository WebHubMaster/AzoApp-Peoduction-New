"""iter 174 — GST 2-page invoice + new tax model.

New model (tested here):
  tax_base = platform_commission + platform_fee  (NEVER on service_net or total)
  gst     = tax_base * gst_pct
  total   = service_net + platform_fee + gst
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

SERVICE_ID = "0fc1d006-b3ca-4bf0-8cda-2b9a35f882e5"  # Electrician — base 299
EXISTING_INV_ID = "4bc7ebb5-2a9f-4d78-a19e-9a296a7c1f25"
ADMIN_PHONE = "+919000000000"
CUSTOMER_PHONE = "+919000000004"
PARTNER_PHONE = "+919000000003"
OTP = "123456"


def _login(phone):
    s = requests.Session()
    r = s.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, r.text
    r = s.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN_PHONE)


@pytest.fixture(scope="module")
def customer():
    return _login(CUSTOMER_PHONE)


@pytest.fixture(scope="module")
def partner():
    return _login(PARTNER_PHONE)


@pytest.fixture(scope="module", autouse=True)
def configure_fees(admin):
    """Ensure platform_fee=25, visiting=99, emergency=99, Electrician partner_pct=80."""
    r = admin.get(f"{API}/admin/settings", timeout=15)
    assert r.status_code == 200
    s = r.json()
    biz = s.get("business_config") or {}
    biz["platform_fee"] = 25
    biz["global_visiting_charge"] = 99
    biz["min_service_amount_for_visiting"] = 0
    s["business_config"] = biz
    s["emergency_fee"] = 99
    s["gst_pct"] = 18
    admin.put(f"{API}/admin/settings", json=s, timeout=15)
    # Electrician commission: partner_pct=80 (commission 20%)
    r = admin.get(f"{API}/admin/categories", timeout=15)
    if r.status_code == 200:
        cats = r.json() if isinstance(r.json(), list) else r.json().get("categories", [])
        elec = next((c for c in cats if "electric" in (c.get("name") or "").lower()), None)
        if elec:
            cat_id = elec["id"]
            # Try the category-commission endpoint
            for path, payload in [
                (f"{API}/admin/category-commissions", {"category_id": cat_id, "partner_pct": 80}),
                (f"{API}/admin/categories/{cat_id}", {"partner_pct": 80}),
                (f"{API}/admin/categories/{cat_id}/commission", {"partner_pct": 80}),
            ]:
                try:
                    admin.post(path, json=payload, timeout=10)
                    admin.put(path, json=payload, timeout=10)
                except Exception:
                    pass


# ---------- cart-quote: schedule ----------
def test_cart_quote_schedule_tax_only_on_commission_plus_platform_fee(customer):
    r = customer.post(f"{API}/bookings/cart-quote", json={
        "items": [{"service_id": SERVICE_ID, "qty": 1}],
        "schedule_type": "schedule",
    }, timeout=20)
    assert r.status_code == 200, r.text
    q = r.json()
    pr = q.get("pricing") or q
    # service_net = 299 + 99 (visiting) = 398
    assert abs(pr["service_net"] - 398.0) < 0.05, pr
    assert abs(pr["platform_commission"] - 79.60) < 0.05, pr
    assert abs(pr["partner_share"] - 318.40) < 0.05, pr
    # tax_base = 79.60 + 25
    assert abs(pr["tax_base"] - 104.60) < 0.05, pr
    assert abs(pr["gst"] - round(pr["tax_base"] * 0.18, 2)) < 0.02, pr
    assert abs(pr["cgst"] + pr["sgst"] - pr["gst"]) < 0.02, pr
    # total = service_net + platform_fee + gst
    expected_total = round(pr["service_net"] + pr["platform_fee"] + pr["gst"], 2)
    assert abs(pr["total"] - expected_total) < 0.05, pr
    # GST must NOT equal tax on full total
    assert pr["gst"] < pr["total"] * 0.18 * 0.5, "GST appears computed on full total"


# ---------- cart-quote: emergency ----------
def test_cart_quote_emergency_adds_99_to_service_side(customer):
    r = customer.post(f"{API}/bookings/cart-quote", json={
        "items": [{"service_id": SERVICE_ID, "qty": 1}],
        "schedule_type": "emergency",
    }, timeout=20)
    assert r.status_code == 200, r.text
    pr = (r.json().get("pricing") or r.json())
    # 299 + 99 (visit) + 99 (emergency) = 497
    assert abs(pr["service_net"] - 497.0) < 0.05, pr
    assert abs(pr["platform_commission"] - 99.40) < 0.05, pr
    assert abs(pr["tax_base"] - 124.40) < 0.05, pr
    assert abs(pr["gst"] - round(124.40 * 0.18, 2)) < 0.02, pr


# ---------- coupon discount reduces service side only ----------
def test_coupon_discount_reduces_service_side_only(customer, admin):
    # Create a one-off 10% coupon via admin
    import random, string
    code = "TESTGST" + "".join(random.choices(string.ascii_uppercase, k=4))
    r = admin.post(f"{API}/admin/coupons", json={
        "code": code, "discount_type": "percentage", "discount_value": 10,
        "status": "active", "max_discount": 100,
    }, timeout=15)
    if r.status_code not in (200, 201):
        pytest.skip(f"Could not create coupon: {r.status_code} {r.text}")
    try:
        r = customer.post(f"{API}/bookings/cart-quote", json={
            "items": [{"service_id": SERVICE_ID, "qty": 1}],
            "schedule_type": "schedule", "coupon_code": code,
        }, timeout=20)
        assert r.status_code == 200, r.text
        pr = r.json().get("pricing") or r.json()
        # service_charges=398; discount should be 10% => 39.80 (<=max 100)
        assert pr["platform_fee"] == 25, pr  # untouched
        assert abs(pr["discount"] - 39.80) < 0.05, pr
        # service_net = 398 - 39.80 = 358.20
        assert abs(pr["service_net"] - 358.20) < 0.05, pr
        # commission after discount
        assert abs(pr["platform_commission"] - round(358.20 * 0.20, 2)) < 0.05, pr
    finally:
        admin.delete(f"{API}/admin/coupons/{code}", timeout=10)


# ---------- admin invoice preview sample has gst_invoice block ----------
def test_invoice_preview_sample_has_gst_block(admin):
    r = admin.get(f"{API}/invoices/preview/sample", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "gst_invoice" in data
    g = data["gst_invoice"]
    assert "platform" in g and "partner" in g
    p1, p2 = g["platform"], g["partner"]
    # p1 has CGST+SGST and SAC
    assert p1.get("sac")
    assert p1.get("cgst") is not None and p1.get("sgst") is not None
    assert abs(p1["cgst"] + p1["sgst"] - p1["total_tax"]) < 0.05
    # p1 subtotal + p2 subtotal == grand_total
    assert abs(p1["subtotal"] + p2["subtotal"] - g["grand_total"]) < 0.1


# ---------- render pdf 2 pages ----------
def test_render_pdf_returns_two_page_pdf(admin):
    r = admin.get(f"{API}/invoices/preview/sample", timeout=15)
    payload = r.json()
    r = admin.post(f"{API}/invoices/render/pdf", json=payload, timeout=30)
    assert r.status_code == 200, r.text[:300]
    assert r.headers.get("content-type", "").startswith("application/pdf")
    body = r.content
    assert body.startswith(b"%PDF"), "Not a PDF"
    actual_pages = _pdf_page_count(body)
    assert actual_pages >= 2, f"Expected 2+ pages, got {actual_pages}"


def _pdf_page_count(body: bytes) -> int:
    try:
        from pypdf import PdfReader
        import io as _io
        return len(PdfReader(_io.BytesIO(body)).pages)
    except Exception:
        try:
            from PyPDF2 import PdfReader
            import io as _io
            return len(PdfReader(_io.BytesIO(body)).pages)
        except Exception:
            pages = body.count(b"/Type /Page") + body.count(b"/Type/Page")
            pages_root = body.count(b"/Type /Pages") + body.count(b"/Type/Pages")
            return pages - pages_root


# ---------- existing completed booking: customer view has gst 2-page template ----------
def test_existing_booking_customer_view_has_gst_two_page(customer):
    r = customer.get(f"{API}/invoices/{EXISTING_INV_ID}/view", timeout=20)
    assert r.status_code == 200, r.text[:300]
    html = r.text
    assert 'data-testid="gst-invoice-page-platform"' in html, "page1 testid missing"
    assert 'data-testid="gst-invoice-page-partner"' in html, "page2 testid missing"
    assert "CGST @9" in html and "SGST @9" in html, "CGST/SGST @9% missing"


def test_existing_booking_customer_pdf_two_pages(customer):
    r = customer.get(f"{API}/invoices/{EXISTING_INV_ID}/pdf", timeout=30)
    assert r.status_code == 200
    body = r.content
    assert body.startswith(b"%PDF")
    actual_pages = _pdf_page_count(body)
    assert actual_pages >= 2, f"Expected 2+ pages, got {actual_pages}"


# ---------- partner must NOT get gst 2-page template ----------
def test_partner_view_no_gst_two_page_template(partner):
    r = partner.get(f"{API}/invoices/{EXISTING_INV_ID}/view", timeout=20)
    # partner may be allowed or forbidden depending on whether this partner was on job
    if r.status_code == 403:
        return
    assert r.status_code == 200, r.text[:300]
    assert 'data-testid="gst-invoice-page-platform"' not in r.text, (
        "Partner should see earnings template, not GST 2-page invoice")


# ---------- commission ledger partner earning == pricing.partner_share ----------
def test_commission_ledger_matches_partner_share(admin):
    r = admin.get(f"{API}/invoices/{EXISTING_INV_ID}", timeout=15)
    assert r.status_code == 200, r.text
    inv = r.json()
    booking_id = inv.get("booking_id")
    if not booking_id:
        pytest.skip("Invoice has no linked booking_id")
    # fetch booking pricing
    rb = admin.get(f"{API}/admin/bookings/{booking_id}", timeout=15)
    if rb.status_code != 200:
        rb = admin.get(f"{API}/bookings/{booking_id}", timeout=15)
    assert rb.status_code == 200, rb.text
    pr = (rb.json().get("pricing") or {})
    partner_share = pr.get("partner_share")
    if partner_share is None:
        pytest.skip("Legacy booking without partner_share stored")
    # ledger
    rl = admin.get(f"{API}/admin/commission-ledger", params={"booking_id": booking_id}, timeout=15)
    if rl.status_code != 200:
        pytest.skip(f"ledger endpoint not available: {rl.status_code}")
    rows = rl.json() if isinstance(rl.json(), list) else rl.json().get("rows") or rl.json().get("items") or []
    completion = next((x for x in rows if (x.get("kind") == "completion")), None)
    if not completion:
        pytest.skip("No completion ledger entry")
    assert abs(completion.get("partner_earning", 0) - partner_share) < 0.1, (
        f"Ledger partner_earning={completion.get('partner_earning')} vs pricing.partner_share={partner_share}")
