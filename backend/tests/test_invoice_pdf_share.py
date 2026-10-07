"""Backend tests to verify PDF endpoint used by customer app's shareInvoicePdf()."""
import os
import pytest
import requests

BASE_URL = "http://localhost:8001/api"
CUSTOMER_PHONE = "+919000000004"
OTP = "123456"
OWNED_INVOICE_ID = "21f39c67-54ea-44d2-a3e9-9cb130755709"


@pytest.fixture(scope="module")
def customer_token():
    r = requests.post(f"{BASE_URL}/auth/verify-otp",
                      json={"phone": CUSTOMER_PHONE, "otp": OTP}, timeout=15)
    assert r.status_code == 200, f"OTP verify failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token") or (data.get("data") or {}).get("token")
    assert token, f"No token in response: {data}"
    return token


@pytest.fixture(scope="module")
def auth_headers(customer_token):
    return {"Authorization": f"Bearer {customer_token}"}


def test_login_otp_returns_token(customer_token):
    assert isinstance(customer_token, str) and len(customer_token) > 10


def test_list_invoices_contains_owned(auth_headers):
    r = requests.get(f"{BASE_URL}/invoices", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    # Try common shapes
    items = data if isinstance(data, list) else data.get("invoices") or data.get("data") or data.get("items") or []
    ids = [inv.get("id") for inv in items if isinstance(inv, dict)]
    print(f"Customer invoices count={len(ids)} sample={ids[:5]}")
    assert OWNED_INVOICE_ID in ids, f"Owned invoice not found in list. ids={ids[:10]}"


def test_get_owned_invoice_pdf(auth_headers):
    r = requests.get(f"{BASE_URL}/invoices/{OWNED_INVOICE_ID}/pdf",
                     headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:300]}"
    ctype = r.headers.get("Content-Type", "")
    assert "application/pdf" in ctype, f"Unexpected content-type: {ctype}"
    body = r.content
    assert len(body) > 0, "Empty PDF body"
    assert body[:4] == b"%PDF", f"Missing %PDF magic bytes, got {body[:8]!r}"
    print(f"PDF ok: size={len(body)} ctype={ctype}")


def test_get_not_owned_invoice_pdf_forbidden(auth_headers):
    # Find a non-owned invoice id. Try partner login first; else fabricate via listing all.
    # Attempt: try a known-wrong id by using a different customer. Fall back to querying DB via another phone if possible.
    # Simplest: try phone +919000000003 OTP 123456 (common seed) to list their invoices.
    other_token = None
    for ph in ["+919000000003", "+919000000001", "+919000000002", "+919000000005"]:
        rr = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": ph, "otp": OTP}, timeout=15)
        if rr.status_code == 200:
            tok = rr.json().get("token") or rr.json().get("access_token")
            if tok:
                lr = requests.get(f"{BASE_URL}/invoices", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
                if lr.status_code == 200:
                    d = lr.json()
                    items = d if isinstance(d, list) else d.get("invoices") or d.get("data") or d.get("items") or []
                    for inv in items:
                        iid = inv.get("id") if isinstance(inv, dict) else None
                        if iid and iid != OWNED_INVOICE_ID:
                            other_token = tok
                            foreign_id = iid
                            break
                if other_token:
                    break
    if not other_token:
        pytest.skip("Could not find another customer's invoice to test 403")

    r = requests.get(f"{BASE_URL}/invoices/{foreign_id}/pdf",
                     headers=auth_headers, timeout=30)
    print(f"Foreign invoice {foreign_id} status={r.status_code}")
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text[:300]}"
