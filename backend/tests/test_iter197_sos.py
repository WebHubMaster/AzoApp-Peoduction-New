"""Iteration 197 — SOS alert endpoint tests.
Verifies POST /api/support/sos behavior:
- customer of booking → urgent ticket with SOS message containing job + maps link
- partner of booking → updates/creates ticket
- random user (merchant, non-owner) → 404
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
BOOKING_CODE = "AZO557577"


def _login(phone: str) -> str:
    s = requests.Session()
    last = None
    for _ in range(3):
        try:
            r = s.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=90)
            last = r
            if r.status_code in (200, 201):
                break
        except requests.exceptions.ReadTimeout as e:
            last = e
            continue
    assert last is not None and hasattr(last, "status_code") and last.status_code in (200, 201), f"send-otp failed: {last}"
    otp = last.json().get("dev_otp") or "123456"
    r = s.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": phone, "otp": otp}, timeout=60)
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token: {r.text}"
    return tok


@pytest.fixture(scope="module")
def customer_tok():
    return _login("+919000000004")


@pytest.fixture(scope="module")
def partner_tok():
    return _login("+919000000003")


@pytest.fixture(scope="module")
def merchant_tok():
    return _login("+919000000002")


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def test_sos_customer_success(customer_tok):
    r = requests.post(f"{BASE_URL}/api/support/sos",
                      headers=_h(customer_tok),
                      json={"booking_code": BOOKING_CODE, "lat": 12.9716, "lng": 77.5946})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("priority") == "urgent"
    assert data.get("sos") is True
    assert data.get("booking_code") == BOOKING_CODE
    msgs = data.get("messages") or []
    assert msgs, "no messages"
    sos_msgs = [m for m in msgs if "SOS ALERT" in (m.get("text") or "")]
    assert sos_msgs, f"no SOS ALERT message in ticket; latest={msgs[-1].get('text')!r}"
    txt = sos_msgs[-1]["text"]
    assert BOOKING_CODE in txt
    assert "Customer" in txt
    assert re.search(r"https://maps\.google\.com/\?q=12\.9716,77\.5946", txt), f"maps link missing/wrong: {txt!r}"


def test_sos_non_owner_merchant_404(merchant_tok):
    r = requests.post(f"{BASE_URL}/api/support/sos",
                      headers=_h(merchant_tok),
                      json={"booking_code": BOOKING_CODE})
    assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"


def test_sos_partner_success(partner_tok):
    # Partner of booking AZO557577 is +919000000003
    r = requests.post(f"{BASE_URL}/api/support/sos",
                      headers=_h(partner_tok),
                      json={"booking_code": BOOKING_CODE})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("priority") == "urgent"
    assert data.get("sos") is True
    msgs = data.get("messages") or []
    sos_msgs = [m for m in msgs if "SOS ALERT by Partner" in (m.get("text") or "")]
    assert sos_msgs, f"no partner SOS message; latest={(msgs[-1].get('text') if msgs else None)!r}"


def test_sos_bad_booking_404(customer_tok):
    r = requests.post(f"{BASE_URL}/api/support/sos",
                      headers=_h(customer_tok),
                      json={"booking_code": "ZZZZZZZZZ"})
    assert r.status_code == 404


def test_support_upload_image(customer_tok):
    # Chat photo sharing — upload endpoint accepts image and returns url/kind=image
    import io
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (20, 20), color=(200, 50, 50)).save(buf, format="PNG")
    buf.seek(0)
    files = {"file": ("tiny.png", buf, "image/png")}
    r = requests.post(f"{BASE_URL}/api/support/upload",
                      headers={"Authorization": f"Bearer {customer_tok}"},
                      files=files)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("url"), "no url returned"
    assert data.get("kind") == "image"
