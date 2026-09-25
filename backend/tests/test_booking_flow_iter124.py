"""iter124 backend tests: booking flow, custom sections, cart-quote, wallet pay, hero.

Covers:
- Auth via OTP (customer 9000000004, admin 9000000000)
- GET /api/site/promotions coupons contains AZO50
- POST /api/bookings/cart-quote total for Door Repair qty1
- POST /api/bookings/validate-coupon AZO50
- GET /api/bookings/slot-availability
- Full booking placement via /bookings/grouped + /payments/order + /payments/mock
- Wallet balance for customer 9000000004
- Custom sections: admin PUT /api/admin/app-home to add/remove cs-qa (category) & cs-ban (banner)
- Hero slider config in app-home
"""
import os
import time
import datetime as dt
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8001').rstrip('/')
API = f"{BASE_URL}/api"


def _login(phone: str) -> str:
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone})
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": "123456", "create_if_new": False})
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def customer_token():
    return _login("+919000000004")


@pytest.fixture(scope="module")
def admin_token():
    return _login("+919000000000")


# -------- Home & Custom Sections --------

def test_home_contains_cs_demo():
    r = requests.get(f"{API}/app/home")
    assert r.status_code == 200
    keys = [s.get("key") for s in r.json().get("sections", [])]
    assert "custom:cs-demo" in keys, f"missing custom:cs-demo; got {keys}"


def test_hero_slider_config_present():
    r = requests.get(f"{API}/app/home")
    j = r.json()
    hero = j.get("hero") or j.get("hero_slider") or j.get("branding", {}).get("hero")
    # Look through top-level keys
    assert any(("hero" in k) for k in j.keys()), f"no hero-related key in app-home; keys={list(j.keys())}"


def test_promotions_has_azo50():
    r = requests.get(f"{API}/site/promotions")
    assert r.status_code == 200
    coupons = r.json().get("coupons", [])
    codes = [c.get("code") for c in coupons]
    assert "AZO50" in codes


# -------- Cart quote --------

def _find_service(name: str):
    r = requests.get(f"{API}/catalog/services")
    assert r.status_code == 200
    services = r.json() if isinstance(r.json(), list) else r.json().get("data", [])
    for s in services:
        if s.get("name") == name:
            return s
    return None


def test_cart_quote_door_repair():
    svc = _find_service("Door Repair")
    assert svc, "Door Repair not found"
    payload = {"items": [{"service_id": svc["id"], "qty": 1, "tier_key": None, "addons": []}]}
    r = requests.post(f"{API}/bookings/cart-quote", json=payload)
    assert r.status_code == 200, r.text
    j = r.json()
    total = (j.get("pricing") or {}).get("total") or j.get("total") or j.get("grand_total")
    # Spec says ₹470.82 for Door Repair qty1
    assert total is not None
    print(f"Door Repair qty1 total = {total} | full quote: {j}")
    # allow small floating tolerance
    assert abs(float(total) - 470.82) < 0.5, f"expected ~470.82, got {total}"


def test_validate_coupon_azo50(customer_token):
    svc = _find_service("Door Repair")
    payload = {
        "code": "AZO50",
        "items": [{"service_id": svc["id"], "qty": 1, "tier_key": None, "addons": []}],
    }
    r = requests.post(f"{API}/bookings/validate-coupon", json=payload,
                      headers={"Authorization": f"Bearer {customer_token}"})
    assert r.status_code == 200, r.text
    j = r.json()
    print(f"AZO50 validate: {j}")
    assert j.get("valid") is True or j.get("ok") is True or j.get("discount") is not None


def test_validate_coupon_invalid(customer_token):
    svc = _find_service("Door Repair")
    payload = {
        "code": "NOTACODE999",
        "items": [{"service_id": svc["id"], "qty": 1, "tier_key": None, "addons": []}],
    }
    r = requests.post(f"{API}/bookings/validate-coupon", json=payload,
                      headers={"Authorization": f"Bearer {customer_token}"})
    # Either 200 with valid:false OR 4xx
    j = {}
    try:
        j = r.json()
    except Exception:
        pass
    print(f"invalid coupon: status={r.status_code} body={j}")
    if r.status_code == 200:
        assert j.get("valid") is not True, "invalid code should not be valid"


# -------- Slot availability --------

def test_slot_availability_tomorrow():
    tmr = (dt.datetime.utcnow() + dt.timedelta(days=1)).strftime("%Y-%m-%d")
    r = requests.get(f"{API}/bookings/slot-availability", params={"date": tmr})
    assert r.status_code == 200, r.text
    j = r.json()
    slots = j.get("slots") or j
    assert slots, f"no slots for {tmr}: {j}"


# -------- Wallet --------

def test_wallet_balance_customer(customer_token):
    r = requests.get(f"{API}/wallet", headers={"Authorization": f"Bearer {customer_token}"})
    assert r.status_code == 200, r.text
    j = r.json()
    bal = j.get("balance")
    print(f"Customer wallet balance: {bal}")
    assert bal is not None


# -------- Custom sections admin round-trip --------

def _get_admin_app_home(admin_token):
    r = requests.get(f"{API}/admin/app-home", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text
    return r.json()


def test_custom_sections_add_category_and_banner(admin_token):
    orig = _get_admin_app_home(admin_token)
    orig_custom = list(orig.get("custom_sections", []) or [])

    # Get first category id
    cats = requests.get(f"{API}/catalog/categories").json()
    cats = cats if isinstance(cats, list) else cats.get("data", [])
    assert cats
    cat_id = cats[0]["id"]

    new_custom = orig_custom + [
        {"id": "cs-qa", "type": "category", "title": "QA Category Row",
         "category_id": cat_id, "limit": 4, "enabled": True},
        {"id": "cs-ban", "type": "banner", "title": "QA Banner",
         "image": "https://images.pexels.com/photos/6471913/pexels-photo-6471913.jpeg",
         "link": "/services", "enabled": True},
    ]
    payload = {**orig, "custom_sections": new_custom}
    r = requests.put(f"{API}/admin/app-home", json=payload,
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code in (200, 204), r.text

    # Verify public reflects it
    time.sleep(0.5)
    j = requests.get(f"{API}/app/home").json()
    keys = [s.get("key") for s in j.get("sections", [])]
    print(f"After add, sections keys: {keys}")
    assert "custom:cs-qa" in keys, keys
    assert "custom:cs-ban" in keys, keys

    # cs-qa should have services from that category
    qa = next(s for s in j["sections"] if s["key"] == "custom:cs-qa")
    assert isinstance(qa.get("data"), list) and len(qa["data"]) > 0

    # Restore (remove cs-qa/cs-ban)
    payload2 = {**orig, "custom_sections": orig_custom}
    r = requests.put(f"{API}/admin/app-home", json=payload2,
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code in (200, 204)
    time.sleep(0.3)
    j2 = requests.get(f"{API}/app/home").json()
    keys2 = [s.get("key") for s in j2.get("sections", [])]
    assert "custom:cs-qa" not in keys2
    assert "custom:cs-ban" not in keys2


# -------- End-to-end booking (mock online payment) --------

def test_full_booking_flow_online_pay(customer_token):
    svc = _find_service("Door Repair")
    assert svc
    # Get an address (create default if none)
    r = requests.get(f"{API}/auth/addresses", headers={"Authorization": f"Bearer {customer_token}"})
    if r.status_code != 200 or not (r.json() if isinstance(r.json(), list) else r.json().get("data", [])):
        r2 = requests.post(f"{API}/auth/address",
                           json={"label": "TEST_QA", "line": "TEST_addr QA line", "pincode": "800001",
                                 "city": "Patna", "lat": 25.6, "lng": 85.1, "is_default": True},
                           headers={"Authorization": f"Bearer {customer_token}"})
        print(f"created addr: {r2.status_code} {r2.text[:200]}")
    r = requests.get(f"{API}/auth/addresses", headers={"Authorization": f"Bearer {customer_token}"})
    addresses = r.json() if isinstance(r.json(), list) else r.json().get("data", [])
    if not addresses:
        pytest.skip("No addresses; cannot place booking")
    addr = addresses[0]
    addr_id = addr.get("id") or addr.get("_id")

    tmr = (dt.datetime.utcnow() + dt.timedelta(days=1))
    scheduled_at = tmr.replace(hour=8, minute=0, second=0, microsecond=0).isoformat() + "Z"

    grouped_payload = {
        "items": [{"service_id": svc["id"], "qty": 1, "tier_key": None, "addons": []}],
        "scheduled_at": scheduled_at,
        "schedule_type": "schedule",
        "address": {
            "line": addr.get("line") or "TEST_QA",
            "pincode": addr.get("pincode") or "800001",
            "city": addr.get("city") or "Patna",
            "lat": addr.get("lat") or 25.6,
            "lng": addr.get("lng") or 85.1,
        },
        "payment_mode": "online",
        "coupon": None,
        "notes": "TEST_iter124",
    }
    r = requests.post(f"{API}/bookings/grouped", json=grouped_payload,
                      headers={"Authorization": f"Bearer {customer_token}"})
    print(f"/bookings/grouped: {r.status_code} {r.text[:400]}")
    assert r.status_code in (200, 201), r.text
    j = r.json()
    booking_code = j.get("code") or (j.get("bookings") or [{}])[0].get("code")
    booking_ids = j.get("booking_ids") or [b.get("id") for b in (j.get("bookings") or [])]
    order_ref = j.get("order_ref") or j.get("group_id") or booking_code
    print(f"booking placed: code={booking_code} ids={booking_ids} order_ref={order_ref}")

    # Payment order + mock
    po = requests.post(f"{API}/payments/order",
                       json={"booking_ids": booking_ids, "amount": None},
                       headers={"Authorization": f"Bearer {customer_token}"})
    print(f"/payments/order: {po.status_code} {po.text[:300]}")
    if po.status_code == 200:
        oj = po.json()
        assert oj.get("mock") is True or "id" in oj or "order_id" in oj
        pm = requests.post(f"{API}/payments/mock",
                           json={"order_id": oj.get("id") or oj.get("order_id"),
                                 "booking_ids": booking_ids},
                           headers={"Authorization": f"Bearer {customer_token}"})
        print(f"/payments/mock: {pm.status_code} {pm.text[:300]}")

    # Verify booking exists
    r = requests.get(f"{API}/bookings", headers={"Authorization": f"Bearer {customer_token}"})
    assert r.status_code == 200
    bookings = r.json() if isinstance(r.json(), list) else r.json().get("data", [])
    codes = [b.get("code") for b in bookings]
    assert booking_code in codes or any(bid in [b.get("id") for b in bookings] for bid in booking_ids), \
        f"placed booking not in list; codes={codes[:5]}"
