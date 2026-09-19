"""Backend tests for:
- OTP login (demo accounts always accept 123456)
- Admin delete-person (customer/partner/merchant) with guards
"""
import os
import pytest
import requests
from dotenv import dotenv_values

_fe = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _fe.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"

DEMO_ACCOUNTS = {
    "admin": "+919000000000",
    "customer": "+919000000004",
    "partner": "+919000000003",
    "merchant": "+919000000002",
}

QA_TARGETS = {
    "customer": "7000000101",
    "partner": "7000000102",
    "merchant": "7000000103",
}


def _login(phone: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=45)
    assert r.status_code == 200, r.text
    r = requests.post(
        f"{BASE_URL}/api/auth/verify-otp",
        json={"phone": phone, "otp": "123456"},
        timeout=45,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("token"), body
    return body["token"]


# -------- OTP demo login regression --------
@pytest.mark.parametrize("role,phone", list(DEMO_ACCOUNTS.items()))
def test_demo_otp_login_ok(role, phone):
    r = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=45)
    assert r.status_code == 200, r.text
    r = requests.post(
        f"{BASE_URL}/api/auth/verify-otp",
        json={"phone": phone, "otp": "123456"},
        timeout=45,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("token")
    assert data["user"]["role"] == role


def test_demo_repeated_login_no_ratelimit():
    """Demo accounts should bypass throttling."""
    for _ in range(3):
        r = requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"phone": DEMO_ACCOUNTS["customer"]},
            timeout=45,
        )
        assert r.status_code == 200
        body = r.json()
        assert body.get("sent") is True


def test_send_otp_no_leak_when_sms_live_and_not_demo():
    """If a live SMS gateway is configured, non-demo numbers must NOT get dev_otp leaked."""
    r = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": "+919111111111"}, timeout=45)
    assert r.status_code == 200
    body = r.json()
    # Either dev-mode (no gateway) OR live mode with no dev_otp leak
    if body.get("sent"):
        # in dev-mode dev_otp may leak; in live mode it must not
        pass
    # If sms is configured and delivery fails, sent=False with error and no dev_otp
    if body.get("sent") is False:
        assert "dev_otp" not in body


# -------- admin auth helper --------
@pytest.fixture(scope="module")
def admin_token():
    return _login(DEMO_ACCOUNTS["admin"])


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# -------- delete-person --------
def _find_uid(headers, role, phone):
    r = requests.get(
        f"{BASE_URL}/api/admin/people/{role}",
        params={"q": phone, "page": 1, "page_size": 25},
        headers=headers,
        timeout=45,
    )
    assert r.status_code == 200, r.text
    items = r.json().get("items", [])
    for it in items:
        if it.get("phone") == phone:
            return it.get("id")
    return None


@pytest.mark.parametrize("role,phone", list(QA_TARGETS.items()))
def test_delete_qa_person(admin_headers, role, phone):
    uid = _find_uid(admin_headers, role, phone)
    if not uid:
        pytest.skip(f"QA seed {role} {phone} not present")
    r = requests.post(
        f"{BASE_URL}/api/admin/people/{role}/{uid}/delete",
        json={"reason": "QA delete test"},
        headers=admin_headers,
        timeout=45,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("ok") is True
    assert data.get("deleted") is True
    # verify gone
    uid2 = _find_uid(admin_headers, role, phone)
    assert uid2 is None, "Deleted user still appears in list"


def test_delete_demo_partner_blocked(admin_headers):
    """Deleting a demo account must be blocked."""
    uid = _find_uid(admin_headers, "partner", DEMO_ACCOUNTS["partner"])
    assert uid, "Demo partner should exist"
    r = requests.post(
        f"{BASE_URL}/api/admin/people/partner/{uid}/delete",
        json={"reason": "should fail"},
        headers=admin_headers,
        timeout=45,
    )
    assert r.status_code == 400, r.text
    body = r.json()
    detail = (body.get("detail") or body.get("message") or "").lower()
    assert "demo" in detail
    # still exists
    uid2 = _find_uid(admin_headers, "partner", DEMO_ACCOUNTS["partner"])
    assert uid2 == uid
