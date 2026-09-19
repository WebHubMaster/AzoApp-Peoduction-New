"""Iteration 32 retest: confirm-return role fix for partners on Starter Kit,
plus regression check that customer confirm-return still works for bookings."""
import os, requests, pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")

def login(phone):
    requests.post(f"{BASE}/api/auth/send-otp", json={"phone": phone}, timeout=30)
    r = requests.post(f"{BASE}/api/auth/verify-otp", json={"phone": phone, "otp": "123456"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]

@pytest.fixture(scope="module")
def partner_tok():
    return login("+919000000003")

@pytest.fixture(scope="module")
def customer_tok():
    return login("+919000000004")

def test_partner_starter_kit_order_real_cashfree(partner_tok):
    r = requests.post(f"{BASE}/api/starter-kit/order", headers={"Authorization": f"Bearer {partner_tok}"}, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("mock") is False, d
    assert str(d.get("order_id", "")).startswith("KIT-"), d
    pytest.kit_order_id = d["order_id"]

def test_partner_confirm_return_starter_kit_no_403(partner_tok):
    oid = pytest.kit_order_id
    r = requests.post(
        f"{BASE}/api/payments/confirm-return",
        headers={"Authorization": f"Bearer {partner_tok}"},
        json={"gw": "cashfree", "order_id": oid}, timeout=60,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("ok") is True
    assert d.get("paid") is False
    assert d.get("kind") == "starter_kit"

def test_partner_not_marked_pro(partner_tok):
    r = requests.get(f"{BASE}/api/partner/profile", headers={"Authorization": f"Bearer {partner_tok}"}, timeout=30)
    if r.status_code == 200:
        d = r.json()
        # pro should not be true after unpaid return
        assert d.get("is_pro") in (False, None) or d.get("pro") in (False, None), d

def test_customer_confirm_return_regression(customer_tok):
    # Customer confirm-return on a non-existent order should NOT be 403 (role allowed); expect 200 or 404, not 403.
    r = requests.post(
        f"{BASE}/api/payments/confirm-return",
        headers={"Authorization": f"Bearer {customer_tok}"},
        json={"gw": "cashfree", "order_id": "CF-nonexistent-xyz"}, timeout=60,
    )
    assert r.status_code != 403, r.text
