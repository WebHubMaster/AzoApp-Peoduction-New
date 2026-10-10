"""Backend tests for the new subscription invoice endpoint (iteration 140).

Covers:
- GET /api/subscriptions/{id}/invoice returns invoice_id + signed public path
- Idempotency (same invoice_id on repeat call)
- Public PDF fetch via /api{path} returns 200 application/pdf
- Customer /api/invoices lists a 'Subscription Payment' entry for paid subs
- Authorization: partner cannot fetch another customer's subscription invoice
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://azo-seo-console.preview.emergentagent.com").rstrip("/")


def _login(phone: str) -> str:
    requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=15)
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp",
                      json={"phone": phone, "otp": "123456"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def customer_token():
    return _login("+919000000004")


@pytest.fixture(scope="module")
def partner_token():
    return _login("+919000000020")


@pytest.fixture(scope="module")
def paid_subs(customer_token):
    r = requests.get(f"{BASE_URL}/api/subscriptions/mine",
                     headers={"Authorization": f"Bearer {customer_token}"}, timeout=15)
    assert r.status_code == 200, r.text
    rows = r.json()
    paid = [s for s in rows if s.get("payment_status") == "paid"]
    assert paid, "No paid subscriptions found for customer 9000000004"
    return paid


def test_get_invoice_returns_signed_path(customer_token, paid_subs):
    sub = paid_subs[0]
    r = requests.get(f"{BASE_URL}/api/subscriptions/{sub['id']}/invoice",
                     headers={"Authorization": f"Bearer {customer_token}"}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "invoice_id" in data and data["invoice_id"]
    assert "path" in data
    assert re.match(r"^/invoices/pub/[^?]+\?s=[0-9a-f]{32}$", data["path"]), data["path"]


def test_get_invoice_idempotent(customer_token, paid_subs):
    sub = paid_subs[0]
    h = {"Authorization": f"Bearer {customer_token}"}
    a = requests.get(f"{BASE_URL}/api/subscriptions/{sub['id']}/invoice", headers=h, timeout=20).json()
    b = requests.get(f"{BASE_URL}/api/subscriptions/{sub['id']}/invoice", headers=h, timeout=20).json()
    assert a["invoice_id"] == b["invoice_id"], (a, b)


def test_public_pdf_fetch(customer_token, paid_subs):
    sub = paid_subs[0]
    inv = requests.get(f"{BASE_URL}/api/subscriptions/{sub['id']}/invoice",
                       headers={"Authorization": f"Bearer {customer_token}"}, timeout=20).json()
    r = requests.get(f"{BASE_URL}/api{inv['path']}", timeout=20)
    assert r.status_code == 200, r.status_code
    ctype = r.headers.get("content-type", "")
    assert "application/pdf" in ctype.lower(), ctype
    assert r.content[:4] == b"%PDF", "PDF magic bytes missing"


def test_invoices_list_includes_subscription_payment(customer_token, paid_subs):
    r = requests.get(f"{BASE_URL}/api/invoices",
                     headers={"Authorization": f"Bearer {customer_token}"}, timeout=20)
    assert r.status_code == 200, r.text
    rows = r.json()
    # accept either a list or {invoices:[...]} shape
    if isinstance(rows, dict):
        rows = rows.get("items") or rows.get("invoices") or []
    labels = [str(x.get("txn_label") or x.get("kind_label") or x.get("label") or "") for x in rows]
    joined = " | ".join(labels).lower()
    assert "subscription payment" in joined, f"No Subscription Payment invoice in list: {labels[:10]}"


def test_partner_cannot_fetch_other_customer_subscription_invoice(partner_token, paid_subs):
    sub = paid_subs[0]
    r = requests.get(f"{BASE_URL}/api/subscriptions/{sub['id']}/invoice",
                     headers={"Authorization": f"Bearer {partner_token}"}, timeout=20)
    # controller path uses _sub_for_customer -> partner should be denied (403) or role guard (403).
    assert r.status_code in (400, 403), r.status_code


def test_older_paid_sub_lazy_generation(customer_token, paid_subs):
    # If there are multiple paid subs, test the "lazy" generation path on a different one
    if len(paid_subs) < 2:
        pytest.skip("Only one paid subscription — cannot test second lazy path")
    sub = paid_subs[-1]
    r = requests.get(f"{BASE_URL}/api/subscriptions/{sub['id']}/invoice",
                     headers={"Authorization": f"Bearer {customer_token}"}, timeout=20)
    assert r.status_code == 200, r.text
    inv = r.json()
    pdf = requests.get(f"{BASE_URL}/api{inv['path']}", timeout=20)
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
