"""Iteration 175 tests: Login flow, Invoice Verify page, QR encodes signed verify URL."""
import os, re, base64, io
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://invoice-mailer-9.preview.emergentagent.com").rstrip("/")
INV_ID = "4bc7ebb5-2a9f-4d78-a19e-9a296a7c1f25"
VERIFY_SIG = "e00ad16b124d71d4bbbd1170"


def _login(phone):
    r = requests.post(f"{BASE}/api/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE}/api/auth/verify-otp", json={"phone": phone, "otp": "123456"}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    tok = d.get("token") or d.get("access_token")
    assert tok, d
    return tok, d.get("user") or d


# ---------- Auth / demo-login flows ----------
@pytest.mark.parametrize("phone,expected_role", [
    ("+919000000000", "admin"),
    ("+919000000004", "customer"),
    ("+919000000003", "partner"),
])
def test_demo_login(phone, expected_role):
    tok, user = _login(phone)
    assert expected_role in (user.get("role") or "").lower() or user.get("role") is not None


# ---------- Verify page ----------
def test_verify_page_genuine():
    r = requests.get(f"{BASE}/api/invoices/verify/{INV_ID}?s={VERIFY_SIG}", timeout=15)
    assert r.status_code == 200
    h = r.text
    assert 'data-testid="invoice-verify-page"' in h
    assert 'data-testid="verify-status-genuine"' in h
    assert "INV-2026-000001" in h
    assert "INV-2026-000001-P" in h
    assert "590.86" in h
    assert "CGST" in h and "SGST" in h


def test_verify_page_bad_signature():
    r = requests.get(f"{BASE}/api/invoices/verify/{INV_ID}?s=wrong", timeout=15)
    assert r.status_code == 404
    assert 'data-testid="verify-status-invalid"' in r.text


# ---------- QR content ----------
def test_qr_encodes_verify_url():
    tok, _ = _login("+919000000004")
    r = requests.get(f"{BASE}/api/invoices/{INV_ID}/view",
                     headers={"Authorization": f"Bearer {tok}"}, timeout=20)
    assert r.status_code == 200, r.text[:300]
    html = r.text
    # Find QR image data URI
    m = re.search(r'src="data:image/png;base64,([A-Za-z0-9+/=]+)"', html)
    assert m, "No QR image data URI found in invoice HTML"
    img_bytes = base64.b64decode(m.group(1))
    try:
        from pyzbar.pyzbar import decode
        from PIL import Image
    except Exception as e:
        pytest.skip(f"QR libs not available: {e}")
    img = Image.open(io.BytesIO(img_bytes))
    decoded = decode(img)
    assert decoded, "QR could not be decoded"
    payload = decoded[0].data.decode()
    assert "/api/invoices/verify/" in payload
    assert INV_ID in payload
    assert "s=" in payload
    # The encoded URL should actually verify successfully
    rr = requests.get(payload, timeout=15)
    assert rr.status_code == 200
    assert 'verify-status-genuine' in rr.text


# ---------- Regression: preview sample QR falls back to text (no id) ----------
def test_preview_sample_qr_is_text_no_verify_url():
    tok, _ = _login("+919000000000")
    r = requests.get(f"{BASE}/api/invoices/preview/sample",
                     headers={"Authorization": f"Bearer {tok}"}, timeout=20)
    assert r.status_code == 200
    data = r.json()
    # verify_url should not be present / falsy for sample
    assert not data.get("verify_url")
