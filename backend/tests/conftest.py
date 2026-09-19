import os
import requests
import pytest
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

PHONES = {
    "admin": "+919000000000",
    "merchant": "+919000000002",
    "partner": "+919000000003",
    "partner2": "+919000000005",
    "customer": "+919000000004",
}


def login(phone: str, role: str = None) -> str:
    """Single-login: role is NEVER sent; server resolves role from DB. `role` arg kept for readability only."""
    s = requests.Session()
    r = s.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"send-otp failed {r.status_code}: {r.text[:300]}")
    otp = r.json().get("dev_otp")
    if not otp:
        pytest.fail(f"no dev_otp in send-otp response: {r.text[:300]}")
    v = s.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": otp}, timeout=30)
    if v.status_code != 200:
        pytest.fail(f"verify-otp failed {v.status_code}: {v.text[:300]}")
    tok = v.json().get("token")
    if not tok:
        pytest.fail(f"no token: {v.text[:300]}")
    return tok


def client(token=None):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="session")
def anon():
    return client()


@pytest.fixture(scope="session")
def admin():
    return client(login(PHONES["admin"]))


@pytest.fixture(scope="session")
def merchant():
    return client(login(PHONES["merchant"]))


@pytest.fixture(scope="session")
def partner():
    return client(login(PHONES["partner"]))


@pytest.fixture(scope="session")
def customer():
    return client(login(PHONES["customer"]))


@pytest.fixture(scope="session")
def service_id(anon):
    r = anon.get(f"{API}/catalog/services", timeout=30)
    assert r.status_code == 200, r.text
    services = r.json()
    assert services, "no seeded services"
    for s in services:
        if s.get("required_skill") == "ac":
            return s["id"]
    return services[0]["id"]
