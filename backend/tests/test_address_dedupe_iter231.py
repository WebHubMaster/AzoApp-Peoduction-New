"""Backend-only tests for Customer address de-dupe (iter 231).

Covers:
- Customer OTP login (+919000000004 / 123456) returns JWT.
- POST /api/auth/address with a brand new address increases count by 1.
- Re-POSTing identical payload (line+city+pincode+lat+lng) multiple times
  does NOT create duplicates.
- A genuinely different address does get added (count +1).
- Near-identical coords (<1e-4 delta) with a different label are treated as
  duplicates (no new row).
- GET /api/auth/addresses returns the final list.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

CUSTOMER_PHONE = "+919000000004"
CUSTOMER_OTP = "123456"


@pytest.fixture(scope="module")
def token():
    # Send OTP first (dev gateway) then verify
    requests.post(f"{API}/auth/send-otp", json={"phone": CUSTOMER_PHONE}, timeout=15)
    r = requests.post(
        f"{API}/auth/verify-otp",
        json={"phone": CUSTOMER_PHONE, "otp": CUSTOMER_OTP, "create_if_new": True},
        timeout=15,
    )
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and isinstance(data["token"], str) and data["token"]
    return data["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _list(headers):
    r = requests.get(f"{API}/auth/addresses", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    return data


def _post(headers, payload):
    r = requests.post(f"{API}/auth/address", headers=headers, json=payload, timeout=15)
    assert r.status_code == 200, f"POST /address failed: {r.status_code} {r.text}"
    return r.json()


def test_01_login_returns_token(token):
    assert token


def test_02_list_addresses_works(headers):
    addrs = _list(headers)
    # pre-existing addresses allowed; just verify structure
    for a in addrs:
        assert "id" in a


def test_03_new_address_adds_exactly_one(headers):
    before = len(_list(headers))
    # Unique coordinates/line to avoid collision with any pre-seeded data
    uniq = uuid.uuid4().hex[:8]
    payload = {
        "label": f"TEST_New_{uniq}",
        "line": f"TEST unique line {uniq}, Sector 42",
        "city": "Testville",
        "pincode": "560001",
        "lat": 12.5 + (int(uniq[:4], 16) % 1000) / 1e6,
        "lng": 77.5 + (int(uniq[4:], 16) % 1000) / 1e6,
    }
    _post(headers, payload)
    after = len(_list(headers))
    assert after == before + 1, f"Expected +1, got before={before} after={after}"
    # stash for next tests
    pytest._iter231_payload = payload


def test_04_identical_posts_are_idempotent(headers):
    payload = pytest._iter231_payload
    count_after_first = len(_list(headers))
    # Post same payload 3 more times
    for _ in range(3):
        _post(headers, payload)
        time.sleep(0.1)
    final = _list(headers)
    assert len(final) == count_after_first, (
        f"Duplicates created: expected {count_after_first}, got {len(final)}"
    )
    # verify our address is still present
    assert any(a.get("line") == payload["line"] for a in final)


def test_05_near_identical_coords_different_label_is_dupe(headers):
    base = pytest._iter231_payload
    before = len(_list(headers))
    near = {
        "label": "TEST_Home_alias",  # different label
        "line": "Completely different label line text",  # different line text
        "city": "OtherCity",
        "pincode": "999999",
        # coords within 1e-4 of original -> should match on _close()
        "lat": base["lat"] + 0.00005,
        "lng": base["lng"] - 0.00005,
    }
    _post(headers, near)
    after = len(_list(headers))
    assert after == before, (
        f"Near-identical coords should de-dupe. before={before} after={after}"
    )


def test_06_genuinely_different_address_is_added(headers):
    before = len(_list(headers))
    uniq = uuid.uuid4().hex[:8]
    payload = {
        "label": f"TEST_Diff_{uniq}",
        "line": f"Completely different TEST line {uniq}",
        "city": "DifferentCity",
        "pincode": "110001",
        "lat": 28.6 + (int(uniq[:4], 16) % 1000) / 1e6,
        "lng": 77.2 + (int(uniq[4:], 16) % 1000) / 1e6,
    }
    _post(headers, payload)
    after = len(_list(headers))
    assert after == before + 1, (
        f"Different address not added. before={before} after={after}"
    )


def test_07_same_text_different_coords_is_dupe(headers):
    """normalized line+city+pincode equality should also de-dupe even if coords differ."""
    base = pytest._iter231_payload
    before = len(_list(headers))
    same_text = {
        "label": "DifferentLabelSameText",
        "line": base["line"].upper(),  # case/whitespace-insensitive match expected
        "city": base["city"],
        "pincode": base["pincode"],
        "lat": base["lat"] + 10.0,  # far-away coords
        "lng": base["lng"] + 10.0,
    }
    _post(headers, same_text)
    after = len(_list(headers))
    assert after == before, (
        f"Same-text address should de-dupe. before={before} after={after}"
    )
