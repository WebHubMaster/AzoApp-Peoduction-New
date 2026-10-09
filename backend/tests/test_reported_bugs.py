"""Backend tests for Reported Bugs flow (customer/partner report → admin list/resolve)."""
import os
import pytest
import requests

def _load_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        return None
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_env()).rstrip("/")


def _login(phone: str) -> str:
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=20)
    assert r.status_code == 200, r.text
    r = s.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": phone, "otp": "123456"}, timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, r.json()
    return tok


@pytest.fixture(scope="module")
def admin_token():
    return _login("+919000000000")


@pytest.fixture(scope="module")
def customer_token():
    return _login("+919000000004")


@pytest.fixture(scope="module")
def partner_token():
    return _login("+919000000003")


def _h(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


# ---------- Reporter: create bug ----------
def test_customer_create_bug(customer_token):
    payload = {"title": "TEST_payment_fail", "description": "UPI failed with error", "category": "payment"}
    r = requests.post(f"{BASE_URL}/api/bugs", headers=_h(customer_token), json=payload, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["title"] == payload["title"]
    assert data["category"] == "payment"
    assert data["status"] == "open"
    assert data["reporter_role"] == "customer"
    assert "id" in data
    pytest.customer_bug_id = data["id"]


def test_partner_create_bug(partner_token):
    r = requests.post(f"{BASE_URL}/api/bugs",
                      headers=_h(partner_token),
                      json={"title": "TEST_partner_login_issue", "description": "Cannot login", "category": "login"},
                      timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["reporter_role"] == "partner"
    assert data["category"] == "login"


# ---------- Admin: list with filters ----------
def test_admin_list_bugs(admin_token):
    r = requests.get(f"{BASE_URL}/api/admin/bugs", headers=_h(admin_token), timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "data" in data and "counts" in data and "category_counts" in data
    assert data["counts"]["open"] >= 2
    titles = [b["title"] for b in data["data"]]
    assert any("TEST_payment_fail" in t for t in titles)


def test_admin_filter_status_open(admin_token):
    r = requests.get(f"{BASE_URL}/api/admin/bugs", headers=_h(admin_token),
                     params={"status": "open", "page_size": 1}, timeout=20)
    assert r.status_code == 200
    assert r.json()["counts"]["open"] >= 2


def test_admin_filter_role_customer(admin_token):
    r = requests.get(f"{BASE_URL}/api/admin/bugs", headers=_h(admin_token),
                     params={"role": "customer"}, timeout=20)
    assert r.status_code == 200
    for b in r.json()["data"]:
        assert b["reporter_role"] == "customer"


def test_admin_filter_category_payment(admin_token):
    r = requests.get(f"{BASE_URL}/api/admin/bugs", headers=_h(admin_token),
                     params={"category": "payment"}, timeout=20)
    assert r.status_code == 200
    for b in r.json()["data"]:
        assert b["category"] == "payment"


# ---------- Admin: resolve ----------
def test_admin_resolve_bug(admin_token):
    bug_id = getattr(pytest, "customer_bug_id", None)
    assert bug_id
    r = requests.post(f"{BASE_URL}/api/admin/bugs/{bug_id}/resolve",
                      headers=_h(admin_token),
                      json={"note": "Fixed in build 1.2.3"}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "solved"
    assert "Fixed" in (data.get("resolution_note") or "")

    # Verify via admin list
    r2 = requests.get(f"{BASE_URL}/api/admin/bugs", headers=_h(admin_token),
                      params={"status": "solved"}, timeout=20)
    assert any(b["id"] == bug_id and b["status"] == "solved" for b in r2.json()["data"])


# ---------- Auth / permissions ----------
def test_admin_endpoint_requires_admin(customer_token):
    r = requests.get(f"{BASE_URL}/api/admin/bugs", headers=_h(customer_token), timeout=20)
    assert r.status_code in (401, 403)
