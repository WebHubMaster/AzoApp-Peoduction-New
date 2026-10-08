"""Backend tests for Partner Registration Fee feature (iter 155)."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or \
    "https://auth-booking-nav.preview.emergentagent.com"

ADMIN_PHONE = "+919000000000"
PARTNER_PHONE = "+919000000003"
OTP = "123456"
PAID_PROFILE_ID = "f79db2be-e104-4980-9fd7-756a5609063e"


def _login(phone):
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp",
                      json={"phone": phone, "otp": OTP}, timeout=20)
    assert r.status_code == 200, f"login {phone} failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token") or (data.get("data") or {}).get("token")
    assert tok, f"no token in {data}"
    return tok, data


@pytest.fixture(scope="module")
def admin_token():
    tok, _ = _login(ADMIN_PHONE)
    return tok


@pytest.fixture(scope="module")
def partner_token():
    tok, _ = _login(PARTNER_PHONE)
    return tok


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---- Admin: update settings.partner_reg_fee ----
def _set_fee(admin_token, enabled, original=499, dtype="percentage", dvalue=20):
    payload = {"partner_reg_fee": {
        "enabled": enabled,
        "original_price": original,
        "discount_type": dtype,
        "discount_value": dvalue,
    }}
    r = requests.post(f"{BASE_URL}/api/admin/settings",
                      headers=_hdr(admin_token), json=payload, timeout=20)
    # Some codebases use PUT; try that as fallback
    if r.status_code >= 400:
        r = requests.put(f"{BASE_URL}/api/admin/settings",
                         headers=_hdr(admin_token), json=payload, timeout=20)
    assert r.status_code < 400, f"settings update failed: {r.status_code} {r.text}"
    return r.json()


def test_admin_can_activate_and_configure_fee(admin_token, partner_token):
    _set_fee(admin_token, True, 499, "percentage", 20)
    r = requests.get(f"{BASE_URL}/api/partner/registration/fee",
                     headers=_hdr(partner_token), timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("enabled") is True
    # 499 - 20% = 399.2
    final_amt = body.get("final_amount") or body.get("amount")
    assert final_amt is not None
    assert abs(float(final_amt) - 399.2) < 0.5, f"expected ~399.2 got {final_amt}"


def test_admin_can_set_fixed_discount(admin_token, partner_token):
    _set_fee(admin_token, True, 499, "fixed", 100)
    r = requests.get(f"{BASE_URL}/api/partner/registration/fee",
                     headers=_hdr(partner_token), timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert body.get("enabled") is True
    final_amt = body.get("final_amount") or body.get("amount")
    assert abs(float(final_amt) - 399.0) < 0.5, f"expected 399 got {final_amt}"


def test_mock_pay_flow(admin_token, partner_token):
    # Ensure active
    _set_fee(admin_token, True, 499, "percentage", 20)
    # create-order
    r = requests.post(f"{BASE_URL}/api/partner/registration/pay/create-order",
                      headers=_hdr(partner_token), json={}, timeout=20)
    if r.status_code == 400 and "already paid" in r.text.lower():
        # Already paid — verify /fee reflects that
        r3 = requests.get(f"{BASE_URL}/api/partner/registration/fee",
                          headers=_hdr(partner_token), timeout=20)
        assert r3.status_code == 200
        fdata = r3.json()
        assert fdata.get("already_paid") is True, fdata
        pay = fdata.get("payment") or {}
        for k in ("amount", "order_id"):
            assert k in pay, f"missing {k} in payment {pay}"
        return
    assert r.status_code == 200, r.text
    data = r.json()
    if data.get("already_paid"):
        pytest.skip("Partner already paid; skipping create-order/confirm assertion")
    order_id = data.get("order_id") or (data.get("order") or {}).get("id")
    assert order_id, f"no order_id in {data}"
    # confirm
    r2 = requests.post(f"{BASE_URL}/api/partner/registration/pay/confirm",
                       headers=_hdr(partner_token),
                       json={"order_id": order_id, "gateway": "mock"}, timeout=20)
    assert r2.status_code == 200, r2.text
    cdata = r2.json()
    assert cdata.get("status") == "paid" or cdata.get("paid") is True, cdata
    # fee endpoint reflects paid
    r3 = requests.get(f"{BASE_URL}/api/partner/registration/fee",
                      headers=_hdr(partner_token), timeout=20)
    assert r3.status_code == 200
    fdata = r3.json()
    assert fdata.get("already_paid") is True
    pay = fdata.get("payment") or {}
    for k in ("amount", "order_id"):
        assert k in pay, f"missing {k} in payment {pay}"


def test_inactive_fee_flow(admin_token, partner_token):
    _set_fee(admin_token, False, 499, "percentage", 20)
    r = requests.get(f"{BASE_URL}/api/partner/registration/fee",
                     headers=_hdr(partner_token), timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert body.get("enabled") is False
    # Restore active for UI tests afterwards
    _set_fee(admin_token, True, 499, "percentage", 20)


def test_admin_kyc_detail_shows_paid_for_target(admin_token):
    # Try common endpoints for a partner/kyc profile detail
    candidates = [
        f"/api/admin/partner-reg/kyc/{PAID_PROFILE_ID}",
        f"/api/admin/partner-registration/{PAID_PROFILE_ID}",
        f"/api/admin/kyc/{PAID_PROFILE_ID}",
    ]
    hit = None
    for p in candidates:
        r = requests.get(f"{BASE_URL}{p}", headers=_hdr(admin_token), timeout=20)
        if r.status_code == 200:
            hit = (p, r.json())
            break
    assert hit, f"none of endpoints returned 200 for {PAID_PROFILE_ID}: {candidates}"
    path, data = hit
    # Look for reg_fee_payment / registration_fee info
    payload_str = str(data).lower()
    assert "paid" in payload_str, f"'paid' not found in profile response from {path}"
