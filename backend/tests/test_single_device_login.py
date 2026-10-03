"""
Single Device Login backend tests (partner role only).
"""
import os
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://commission-manager-22.preview.emergentagent.com').rstrip('/')

ADMIN_PHONE = "+919000000000"
PARTNER_PHONE = "+919000000003"
PARTNER_UID = "42e57f91-11e9-4637-b5a9-f63de2ddc8f4"
CUSTOMER_PHONE = "+919000000004"
OTP = "123456"


def verify_otp(phone, device_id=None, create_if_new=False):
    payload = {"phone": phone, "otp": OTP, "create_if_new": create_if_new}
    if device_id is not None:
        payload["device_id"] = device_id
    return requests.post(f"{BASE_URL}/api/auth/verify-otp", json=payload, timeout=15)


def me(token):
    return requests.get(f"{BASE_URL}/api/auth/me",
                        headers={"Authorization": f"Bearer {token}"}, timeout=15)


@pytest.fixture(scope="module")
def admin_token():
    r = verify_otp(ADMIN_PHONE)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module", autouse=True)
def _reset_partner_at_start_and_end(admin_token):
    # Reset before starting to have clean state
    requests.post(f"{BASE_URL}/api/admin/people/partner/{PARTNER_UID}/reset-device",
                  headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    yield
    # Cleanup: reset device binding
    requests.post(f"{BASE_URL}/api/admin/people/partner/{PARTNER_UID}/reset-device",
                  headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)


class TestSingleDeviceLogin:
    state = {}

    def test_01_first_partner_login_binds_dev_a(self):
        r = verify_otp(PARTNER_PHONE, device_id="DEV-A")
        assert r.status_code == 200, f"got {r.status_code}: {r.text}"
        token = r.json()["token"]
        TestSingleDeviceLogin.state["dev_a_token"] = token
        mr = me(token)
        assert mr.status_code == 200, f"/me got {mr.status_code}: {mr.text}"

    def test_02_same_device_relogin_works(self):
        r = verify_otp(PARTNER_PHONE, device_id="DEV-A")
        assert r.status_code == 200
        token = r.json()["token"]
        TestSingleDeviceLogin.state["dev_a_token2"] = token
        assert me(token).status_code == 200

    def test_03_different_device_blocked_403(self):
        r = verify_otp(PARTNER_PHONE, device_id="DEV-B")
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
        body = r.json()
        detail = body.get("detail", {})
        assert isinstance(detail, dict), f"detail should be dict, got {type(detail)}: {detail}"
        assert detail.get("code") == "device_mismatch", f"detail: {detail}"
        assert detail.get("message"), f"missing message in detail: {detail}"
        # existing dev-a token still works
        assert me(TestSingleDeviceLogin.state["dev_a_token"]).status_code == 200

    def test_04_admin_reset_device(self, admin_token):
        r = requests.post(
            f"{BASE_URL}/api/admin/people/partner/{PARTNER_UID}/reset-device",
            headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        body = r.json()
        assert body.get("ok") is True
        assert body.get("reset") is True

    def test_05_after_reset_new_device_binds_and_old_revoked(self):
        r = verify_otp(PARTNER_PHONE, device_id="DEV-B")
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        new_token = r.json()["token"]
        assert me(new_token).status_code == 200

        # Old DEV-A token now should return 401 with device_revoked
        old = TestSingleDeviceLogin.state["dev_a_token"]
        old_r = me(old)
        assert old_r.status_code == 401, f"expected 401 got {old_r.status_code}: {old_r.text}"
        detail = old_r.json().get("detail", {})
        assert isinstance(detail, dict), f"detail should be dict: {detail}"
        assert detail.get("code") == "device_revoked", f"detail: {detail}"

    def test_06_customer_not_device_locked(self):
        r1 = verify_otp(CUSTOMER_PHONE, device_id="CDEV-1")
        assert r1.status_code == 200, f"{r1.status_code}: {r1.text}"
        t1 = r1.json()["token"]
        r2 = verify_otp(CUSTOMER_PHONE, device_id="CDEV-2")
        assert r2.status_code == 200, f"{r2.status_code}: {r2.text}"
        t2 = r2.json()["token"]
        assert me(t1).status_code == 200
        assert me(t2).status_code == 200

    def test_07_backward_compat_no_device_id_when_no_binding(self, admin_token):
        # Reset partner binding first
        rr = requests.post(
            f"{BASE_URL}/api/admin/people/partner/{PARTNER_UID}/reset-device",
            headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert rr.status_code == 200
        # verify-otp with NO device_id
        r = verify_otp(PARTNER_PHONE)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        token = r.json()["token"]
        assert me(token).status_code == 200
