"""Partner Invoices API tests (list, detail, view HTML, PDF)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # Read from frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip()
                break
BASE_URL = BASE_URL.rstrip("/")

PARTNER_PHONE = "+919000000003"
OTP = "123456"


@pytest.fixture(scope="module")
def partner_token():
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": PARTNER_PHONE, "otp": OTP}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(partner_token):
    return {"Authorization": f"Bearer {partner_token}", "Content-Type": "application/json"}


# --- List endpoint ---
class TestInvoicesList:
    def test_list_default(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/invoices", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("items", "total", "page", "pages", "summary"):
            assert k in data, f"missing {k}"
        s = data["summary"]
        for k in ("total_count", "total_amount", "paid_amount", "paid_count",
                  "pending_amount", "pending_count", "refunded_amount", "refunded_count",
                  "type_counts", "status_counts"):
            assert k in s, f"summary missing {k}"
        # Raj Kumar expected: 9 invoices, total 16523.64, paid 11917.64
        assert data["total"] == 9, f"Expected 9 total, got {data['total']}"
        assert abs(float(s["total_amount"]) - 16523.64) < 0.05, s["total_amount"]
        assert abs(float(s["paid_amount"]) - 11917.64) < 0.05, s["paid_amount"]

    def test_unauthorized(self):
        r = requests.get(f"{BASE_URL}/api/invoices", timeout=30)
        assert r.status_code == 401, r.status_code

    def test_pagination(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/invoices?page=1&page_size=5", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert len(d["items"]) <= 5
        assert d["page"] == 1

    def test_range_today(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/invoices?range=today", headers=auth_headers, timeout=30)
        assert r.status_code == 200

    def test_range_custom(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/invoices?range=custom&date_from=2026-01-01&date_to=2026-12-31",
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200

    def test_sort_amount_high(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/invoices?sort=amount_high&page_size=100",
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200
        items = r.json()["items"]
        if len(items) >= 2:
            amounts = [float(i.get("total_amount", 0)) for i in items]
            assert amounts == sorted(amounts, reverse=True), amounts

    def test_search(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/invoices?search=INV-2026-000002", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 1, len(items)
        assert items[0]["invoice_number"] == "INV-2026-000002"

    def test_search_empty(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/invoices?search=ZZZZZZ", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["total"] == 0

    def test_filter_type_withdrawal(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/invoices?invoice_type=withdrawal", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 3, f"Expected 3 withdrawals, got {len(items)}: {[i.get('invoice_number') for i in items]}"
        for it in items:
            assert it.get("invoice_type") == "withdrawal"

    def test_filter_status_paid(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/invoices?payment_status=paid", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it.get("payment_status") == "paid"

    def test_amount_range(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/invoices?min_amount=1000&max_amount=5000",
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200
        for it in r.json()["items"]:
            amt = float(it.get("total_amount", 0))
            assert 1000 <= amt <= 5000, amt


@pytest.fixture(scope="module")
def invoice_id_map(auth_headers):
    r = requests.get(f"{BASE_URL}/api/invoices?page_size=100", headers=auth_headers, timeout=30)
    return {i["invoice_number"]: i["id"] for i in r.json()["items"]}


# --- Detail endpoint ---
class TestInvoiceDetail:
    def test_booking_detail_INV2(self, auth_headers, invoice_id_map):
        inv_id = invoice_id_map["INV-2026-000002"]
        r = requests.get(f"{BASE_URL}/api/invoices/{inv_id}", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("line_items", "breakdown", "customer_snapshot", "partner_snapshot", "business_snapshot"):
            assert k in d, f"missing {k}"
        assert "role_earning" in d, "role_earning missing for partner"
        re = d["role_earning"]
        # Expected: subtotal 899, tax 161.82, total 1060.82, earning 539.40
        assert abs(float(d.get("total_amount", 0)) - 1060.82) < 0.05, d.get("total_amount")
        assert abs(float(re.get("net", re.get("earning", 0))) - 539.40) < 0.05, re
        # Rate 60%
        rate = float(re.get("rate", 0))
        assert 0.59 <= rate <= 60.5, rate  # could be 0.6 or 60

    def test_withdrawal_detail_INV7(self, auth_headers, invoice_id_map):
        inv_id = invoice_id_map["INV-2026-000007"]
        r = requests.get(f"{BASE_URL}/api/invoices/{inv_id}", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d.get("invoice_type") == "withdrawal"
        # Reference WD-6DA1D2D0 is derived from withdrawal_id first 8 chars
        wid = d.get("withdrawal_id", "")
        assert "6da1d2d0" in wid.lower(), f"Expected withdrawal_id starting 6da1d2d0, got {wid}"

    def test_view_html(self, auth_headers, invoice_id_map):
        inv_id = invoice_id_map["INV-2026-000002"]
        r = requests.get(f"{BASE_URL}/api/invoices/{inv_id}/view", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "").lower()
        assert "INV-2026-000002" in r.text

    def test_pdf(self, auth_headers, invoice_id_map):
        inv_id = invoice_id_map["INV-2026-000002"]
        r = requests.get(f"{BASE_URL}/api/invoices/{inv_id}/pdf", headers=auth_headers, timeout=60)
        assert r.status_code == 200
        assert "application/pdf" in r.headers.get("content-type", "").lower()
        assert r.content[:4] == b"%PDF"

    def test_detail_unauthorized(self, invoice_id_map):
        inv_id = list(invoice_id_map.values())[0]
        r = requests.get(f"{BASE_URL}/api/invoices/{inv_id}", timeout=30)
        assert r.status_code == 401
