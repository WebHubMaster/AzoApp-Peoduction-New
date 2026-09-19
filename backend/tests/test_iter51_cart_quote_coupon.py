"""Iteration 51 - API sanity: cart-quote coupon min_order gate."""
import os
import requests
import pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def customer_token():
    r = requests.post(f"{BASE}/api/auth/send-otp", json={"phone": "+919000000004"}, timeout=15)
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE}/api/auth/verify-otp", json={"phone": "+919000000004", "otp": "123456"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _find_service(headers, query):
    r = requests.get(f"{BASE}/api/catalog/services", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    rows = r.json()
    rows = rows if isinstance(rows, list) else rows.get("items") or rows.get("services") or []
    for s in rows:
        name = (s.get("name") or "").lower()
        if query.lower() in name:
            return s
    return None


def test_coupon_below_min_order_not_applied(customer_token):
    headers = {"Authorization": f"Bearer {customer_token}"}
    svc = _find_service(headers, "tap")
    assert svc, "Tap & Mixer service not seeded"
    body = {
        "items": [{
            "service_id": svc["id"],
            "quantity": 1,
            "addons": [],
        }],
        "address": {"city": "Patna", "pincode": "800001"},
        "coupon_code": "SAVE100",
    }
    r = requests.post(f"{BASE}/api/bookings/cart-quote", headers=headers, json=body, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    print("SAVE100 quote:", data.get("pricing"), "coupon_applied:", data.get("coupon_applied"))
    assert data.get("coupon_applied") is False, f"Expected coupon_applied=False for subtotal<499, got {data}"
    pricing = data.get("pricing") or {}
    assert float(pricing.get("discount", 0)) == 0, f"Expected discount=0, got {pricing}"


def test_monsoon20_applied_with_cap(customer_token):
    headers = {"Authorization": f"Bearer {customer_token}"}
    svc = _find_service(headers, "bathroom cleaning")
    assert svc, "Bathroom Cleaning service not seeded"
    body = {
        "items": [{
            "service_id": svc["id"],
            "quantity": 1,
            "addons": [],
        }],
        "address": {"city": "Patna", "pincode": "800001"},
        "coupon_code": "MONSOON20",
    }
    r = requests.post(f"{BASE}/api/bookings/cart-quote", headers=headers, json=body, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    print("MONSOON20 quote:", data.get("pricing"), "coupon_applied:", data.get("coupon_applied"))
    assert data.get("coupon_applied") is True
    pricing = data.get("pricing") or {}
    disc = float(pricing.get("discount", 0))
    # 20% of 399 = 79.8, cap 200. Expect ~79.8
    assert 70 < disc <= 200, f"Discount out of expected range: {disc}"
