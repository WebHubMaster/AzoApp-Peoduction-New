"""Backend tests for Customer profile + addresses endpoints (iter131)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
PHONE = "+919000000004"
OTP = "123456"


@pytest.fixture(scope="module")
def token():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": PHONE})
    assert r.status_code == 200, r.text
    r = s.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": PHONE, "otp": OTP, "create_if_new": False})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


# ---- Auth config ----
def test_auth_config(client):
    r = client.get(f"{BASE_URL}/api/auth/config")
    assert r.status_code == 200
    data = r.json()
    assert "profile_fields" in data
    assert "address_config" in data


# ---- Profile ----
def test_get_me(client):
    r = client.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code == 200
    assert r.json().get("phone") in (PHONE, PHONE.replace("+", ""))


def test_update_profile_and_persist(client):
    payload = {
        "name": "Priya Verma",
        "email": "priya.test@example.com",
        "gender": "female",
        "dob": "1992-05-14",
        "alternate_mobile": "9876543210",
        "language": "en",
        "communication_pref": "all",
        "gst_number": "",
        "company_name": "",
    }
    r = client.put(f"{BASE_URL}/api/auth/profile", json=payload)
    assert r.status_code == 200, r.text
    me = client.get(f"{BASE_URL}/api/auth/me").json()
    assert me.get("name") == "Priya Verma"
    assert me.get("email") == "priya.test@example.com"
    assert me.get("gender") == "female"


# ---- Addresses ----
def test_list_addresses(client):
    r = client.get(f"{BASE_URL}/api/auth/addresses")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


@pytest.fixture(scope="module")
def created_addr_id(client):
    payload = {
        "label": "TEST_home",
        "line": "TEST 123 Test Street",
        "city": "Bengaluru",
        "pincode": "560001",
        "landmark": "Near park",
        "instructions": "Ring bell",
        "property_type": "apartment",
        "is_default": False,
    }
    r = client.post(f"{BASE_URL}/api/auth/address", json=payload)
    assert r.status_code == 200, r.text
    # Response is the full user object; find our address in addresses[]
    addr_id = None
    lst = client.get(f"{BASE_URL}/api/auth/addresses").json()
    for a in lst:
        if a.get("line", "").startswith("TEST"):
            addr_id = a["id"]
    assert addr_id, f"created address not found in {lst}"
    yield addr_id
    # cleanup
    client.delete(f"{BASE_URL}/api/auth/address/{addr_id}")


def test_address_persisted(client, created_addr_id):
    lst = client.get(f"{BASE_URL}/api/auth/addresses").json()
    ids = [a["id"] for a in lst]
    assert created_addr_id in ids


def test_update_address(client, created_addr_id):
    r = client.put(
        f"{BASE_URL}/api/auth/address/{created_addr_id}",
        json={
            "label": "TEST_home",
            "line": "TEST 456 Updated Street",
            "city": "Bengaluru",
            "pincode": "560002",
            "property_type": "apartment",
        },
    )
    assert r.status_code == 200, r.text
    lst = client.get(f"{BASE_URL}/api/auth/addresses").json()
    upd = next((a for a in lst if a["id"] == created_addr_id), None)
    assert upd and upd["line"] == "TEST 456 Updated Street"
    assert upd["pincode"] == "560002"


def test_set_default(client, created_addr_id):
    r = client.post(f"{BASE_URL}/api/auth/address/{created_addr_id}/default")
    assert r.status_code == 200, r.text
    lst = client.get(f"{BASE_URL}/api/auth/addresses").json()
    d = next((a for a in lst if a["id"] == created_addr_id), None)
    assert d and d.get("is_default") is True


# ---- Serviceability ----
def test_serviceability(client):
    r = client.get(f"{BASE_URL}/api/geo/serviceability?pincode=560001")
    assert r.status_code == 200
    assert "serviceable" in r.json() or "status" in r.json()
