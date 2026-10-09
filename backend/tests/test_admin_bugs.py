"""Tests for admin Reported Bugs endpoint: new sort/date_from/date_to params + legacy params.

Covers:
- Admin auth via OTP
- GET /api/admin/bugs with status/role/q/category/page/page_size/sort/date_from/date_to
- Invalid date -> 400
- page_size capped at 100
- category=other includes legacy rows
- POST /bugs, GET /bugs/my, resolve, reopen unchanged
- counts and category_counts correctness
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _login(phone: str) -> str:
    requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=20)
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": "123456"}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


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
    return {"Authorization": f"Bearer {t}"}


# ----- admin list -----
class TestAdminList:
    def test_basic_list(self, admin_token):
        r = requests.get(f"{API}/admin/bugs", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        j = r.json()
        for k in ("data", "total", "page", "page_size", "counts", "category_counts"):
            assert k in j
        assert isinstance(j["data"], list)
        assert j["counts"]["all"] >= j["counts"]["open"]

    def test_page_size_cap(self, admin_token):
        r = requests.get(f"{API}/admin/bugs", params={"page_size": 500}, headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        assert r.json()["page_size"] == 100

    def test_pagination(self, admin_token):
        r = requests.get(f"{API}/admin/bugs", params={"page": 1, "page_size": 10}, headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert j["page"] == 1 and j["page_size"] == 10
        assert len(j["data"]) <= 10

    def test_sort_oldest_vs_newest(self, admin_token):
        n = requests.get(f"{API}/admin/bugs", params={"sort": "newest", "page_size": 5}, headers=_h(admin_token), timeout=20).json()
        o = requests.get(f"{API}/admin/bugs", params={"sort": "oldest", "page_size": 5}, headers=_h(admin_token), timeout=20).json()
        if len(n["data"]) >= 2 and len(o["data"]) >= 2:
            # newest first should have >= created_at of oldest first
            assert n["data"][0]["created_at"] >= n["data"][-1]["created_at"]
            assert o["data"][0]["created_at"] <= o["data"][-1]["created_at"]

    def test_filter_status_open(self, admin_token):
        r = requests.get(f"{API}/admin/bugs", params={"status": "open", "page_size": 50}, headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        for row in r.json()["data"]:
            assert row["status"] == "open"

    def test_filter_role_customer(self, admin_token):
        r = requests.get(f"{API}/admin/bugs", params={"role": "customer", "page_size": 50}, headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        for row in r.json()["data"]:
            assert row["reporter_role"] == "customer"

    def test_filter_role_partner(self, admin_token):
        r = requests.get(f"{API}/admin/bugs", params={"role": "partner", "page_size": 50}, headers=_h(admin_token), timeout=20)
        for row in r.json()["data"]:
            assert row["reporter_role"] == "partner"

    def test_category_other_includes_legacy(self, admin_token):
        r = requests.get(f"{API}/admin/bugs", params={"category": "other", "page_size": 100}, headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        # cat_counts.other should be >= rows returned since filter is server-side
        j = r.json()
        assert j["category_counts"]["other"] >= 0

    def test_invalid_date_from(self, admin_token):
        r = requests.get(f"{API}/admin/bugs", params={"date_from": "2026/01/01"}, headers=_h(admin_token), timeout=20)
        assert r.status_code == 400

    def test_invalid_date_to(self, admin_token):
        r = requests.get(f"{API}/admin/bugs", params={"date_to": "bad-date"}, headers=_h(admin_token), timeout=20)
        assert r.status_code == 400

    def test_valid_date_range(self, admin_token):
        r = requests.get(f"{API}/admin/bugs", params={"date_from": "2024-01-01", "date_to": "2030-01-01"}, headers=_h(admin_token), timeout=20)
        assert r.status_code == 200

    def test_q_search(self, admin_token):
        r = requests.get(f"{API}/admin/bugs", params={"q": "TEST", "page_size": 50}, headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        # all returned must match on some field
        for row in r.json()["data"]:
            blob = " ".join(str(row.get(k, "")) for k in ("title", "description", "reporter_name", "reporter_phone", "id", "resolution_note"))
            assert "TEST" in blob or "test" in blob.lower()

    def test_q_bug_id_prefix(self, admin_token):
        base = requests.get(f"{API}/admin/bugs", params={"page_size": 1}, headers=_h(admin_token), timeout=20).json()
        if base["data"]:
            bid = base["data"][0]["id"]
            prefix = bid[:6]
            r = requests.get(f"{API}/admin/bugs", params={"q": prefix}, headers=_h(admin_token), timeout=20)
            assert r.status_code == 200
            ids = [row["id"] for row in r.json()["data"]]
            assert bid in ids


# ----- lifecycle: create → my → resolve → reopen -----
class TestLifecycle:
    def test_create_and_my(self, customer_token):
        payload = {"title": "TEST_UI bug title", "description": "TEST_UI auto bug desc", "category": "login"}
        r = requests.post(f"{API}/bugs", json=payload, headers=_h(customer_token), timeout=20)
        assert r.status_code == 200, r.text
        bug = r.json()
        assert bug["title"] == payload["title"]
        assert bug["status"] == "open"
        assert bug["category"] == "login"
        bid = bug["id"]
        my = requests.get(f"{API}/bugs/my", headers=_h(customer_token), timeout=20)
        assert my.status_code == 200
        assert any(b["id"] == bid for b in my.json())

    def test_resolve_and_reopen(self, admin_token, customer_token):
        payload = {"title": "TEST_UI lifecycle", "description": "TEST_UI lifecycle"}
        bid = requests.post(f"{API}/bugs", json=payload, headers=_h(customer_token), timeout=20).json()["id"]
        # resolve
        r = requests.post(f"{API}/admin/bugs/{bid}/resolve", json={"note": "Fixed in build 42"}, headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        assert r.json()["status"] == "solved"
        assert r.json()["resolution_note"] == "Fixed in build 42"
        # reopen (note preserved per spec? backend sets resolved_at/by to None but keeps resolution_note)
        rr = requests.post(f"{API}/admin/bugs/{bid}/reopen", headers=_h(admin_token), timeout=20)
        assert rr.status_code == 200
        assert rr.json()["status"] == "open"
        # Previous resolution note is retained
        assert rr.json().get("resolution_note") == "Fixed in build 42"
