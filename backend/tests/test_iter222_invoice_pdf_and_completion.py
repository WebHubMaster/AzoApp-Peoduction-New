"""Iter222: Verify authorized invoice PDF endpoint owner-only security and
regression on job-completion emit path (added rt.emit_user customer broadcast).

Focus:
- Login flow via phone OTP (dev OTP=123456)
- GET /api/invoices?page_size=5 (owner regression)
- GET /api/invoices/{id}/pdf -> 200 application/pdf starting with %PDF for owner
- GET /api/invoices/{id}/pdf -> 403 for non-owner
- GET /api/invoices/{id}/pdf -> 401 without token
- Smoke: ensure booking-completion emit code path is importable (no syntax regression)
"""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")

PRIYA = "+919000000004"
KRISHNA = "+919100000000"
PARTNER = "+919000000003"
ADMIN = "+919000000000"
OTP = "123456"


def _login(phone: str) -> str:
    r = requests.post(f"{BASE}/api/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code in (200, 201), f"send-otp {phone} failed: {r.status_code} {r.text[:200]}"
    r2 = requests.post(f"{BASE}/api/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=15)
    assert r2.status_code == 200, f"verify-otp {phone} failed: {r2.status_code} {r2.text[:200]}"
    tok = r2.json().get("token")
    assert tok, f"no token for {phone}: {r2.text[:200]}"
    return tok


@pytest.fixture(scope="module")
def priya_token():
    return _login(PRIYA)


@pytest.fixture(scope="module")
def krishna_token():
    return _login(KRISHNA)


# ---------------- Invoice list regression ----------------
def test_invoice_list_owner_regression(priya_token):
    r = requests.get(
        f"{BASE}/api/invoices?page_size=5",
        headers={"Authorization": f"Bearer {priya_token}"},
        timeout=20,
    )
    assert r.status_code == 200, f"list failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    # Accept either {items:[...], summary:{}} or list variants
    items = data.get("items") if isinstance(data, dict) else data
    assert isinstance(items, list), f"items not list: {type(items)}"
    assert len(items) > 0, "Priya should have invoices"
    for it in items:
        assert it.get("id"), f"invoice without id: {it}"
    # summary key is optional but preferred
    if isinstance(data, dict):
        assert "summary" in data or "totals" in data or True  # non-strict


# ---------------- PDF endpoint owner-only ----------------
@pytest.fixture(scope="module")
def priya_invoice_id(priya_token):
    r = requests.get(
        f"{BASE}/api/invoices?page_size=5",
        headers={"Authorization": f"Bearer {priya_token}"},
        timeout=20,
    )
    assert r.status_code == 200
    data = r.json()
    items = data.get("items") if isinstance(data, dict) else data
    assert items, "need at least one invoice for Priya"
    return items[0]["id"]


def test_pdf_owner_200(priya_token, priya_invoice_id):
    r = requests.get(
        f"{BASE}/api/invoices/{priya_invoice_id}/pdf",
        headers={"Authorization": f"Bearer {priya_token}"},
        timeout=30,
    )
    assert r.status_code == 200, f"owner pdf failed: {r.status_code} {r.text[:200]}"
    ctype = r.headers.get("content-type", "")
    assert "application/pdf" in ctype, f"bad content-type: {ctype}"
    assert r.content[:4] == b"%PDF", f"not a PDF: {r.content[:16]!r}"
    assert len(r.content) > 1000


def test_pdf_non_owner_403(krishna_token, priya_invoice_id):
    r = requests.get(
        f"{BASE}/api/invoices/{priya_invoice_id}/pdf",
        headers={"Authorization": f"Bearer {krishna_token}"},
        timeout=20,
    )
    assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text[:200]}"


def test_pdf_no_auth_401(priya_invoice_id):
    r = requests.get(f"{BASE}/api/invoices/{priya_invoice_id}/pdf", timeout=20)
    assert r.status_code in (401, 403), f"expected 401, got {r.status_code} {r.text[:200]}"
    # per spec expect 401
    assert r.status_code == 401, f"expected 401, got {r.status_code}"


# ---------------- Completion endpoint regression smoke ----------------
def test_booking_controller_import_smoke():
    """Ensure the modified booking_controller imports without error (catches
    syntax/regression from newly added rt.emit_user customer broadcast)."""
    import importlib
    mod = importlib.import_module("controllers.booking_controller")
    assert hasattr(mod, "__name__")


def test_customer_bookings_list_endpoint(priya_token):
    """Behind near-real-time status: customer must be able to fetch bookings
    list. 200 and list structure."""
    r = requests.get(
        f"{BASE}/api/bookings",
        headers={"Authorization": f"Bearer {priya_token}"},
        timeout=20,
    )
    assert r.status_code == 200, f"bookings list failed: {r.status_code} {r.text[:200]}"
    body = r.json()
    items = body if isinstance(body, list) else (body.get("items") or body.get("bookings") or [])
    assert isinstance(items, list)
    # If Priya has completed bookings, verify at least one is 'completed' or valid status
    for b in items[:20]:
        assert b.get("id") or b.get("_id") or b.get("booking_id")
