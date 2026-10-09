"""Backend tests for Bug Categories (iter 265).

Covers:
- Auth: verify-otp returns 'token' for customer/partner/admin with dev OTP
- Create bug with each valid category saves correctly
- Create bug with invalid category defaults to 'other'
- Create bug with no category defaults to 'other' (backward compat)
- Partner create saves category
- GET /bugs/my includes 'category'
- Admin list returns 'category' and 'category_counts' with all expected keys
- Admin filter by category=payment / login
- Invalid admin filter category returns all
- Existing status/role/q/pagination still work
- Admin resolve + reopen preserve category
"""
import os
import pytest
import requests

pytestmark = pytest.mark.xdist_group("bug_categories_serial")

BASE_URL = "http://localhost:8001"
API = f"{BASE_URL}/api"

ADMIN_PHONE = "+919000000000"
PARTNER_PHONE = "+919000000003"
CUSTOMER_PHONE = "+919000000004"

VALID_CATEGORIES = ("payment", "booking", "login", "account", "other")


def _login(phone: str) -> str:
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=10)
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/auth/verify-otp",
                      json={"phone": phone, "otp": "123456"}, timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    tok = data.get("token")
    assert tok, f"'token' missing from verify-otp response: {data}"
    return tok


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def tokens():
    return {
        "admin": _login(ADMIN_PHONE),
        "partner": _login(PARTNER_PHONE),
        "customer": _login(CUSTOMER_PHONE),
    }


@pytest.fixture(scope="module")
def created_ids():
    ids = []
    yield ids
    try:
        from pymongo import MongoClient
        mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        db = mc[os.environ.get("DB_NAME", "test_database")]
        if ids:
            db.bug_reports.delete_many({"id": {"$in": ids}})
    except Exception as e:  # noqa: BLE001
        print("cleanup failed", e)


class TestAuthToken:
    def test_customer_token_field(self):
        r = requests.post(f"{API}/auth/send-otp", json={"phone": CUSTOMER_PHONE})
        assert r.status_code == 200
        r = requests.post(f"{API}/auth/verify-otp",
                          json={"phone": CUSTOMER_PHONE, "otp": "123456"})
        assert r.status_code == 200
        assert "token" in r.json(), r.json()

    def test_partner_token_field(self):
        requests.post(f"{API}/auth/send-otp", json={"phone": PARTNER_PHONE})
        r = requests.post(f"{API}/auth/verify-otp",
                          json={"phone": PARTNER_PHONE, "otp": "123456"})
        assert r.status_code == 200
        assert "token" in r.json(), r.json()

    def test_admin_token_field(self):
        requests.post(f"{API}/auth/send-otp", json={"phone": ADMIN_PHONE})
        r = requests.post(f"{API}/auth/verify-otp",
                          json={"phone": ADMIN_PHONE, "otp": "123456"})
        assert r.status_code == 200
        assert "token" in r.json(), r.json()


class TestCreateWithCategory:
    @pytest.mark.parametrize("cat", list(VALID_CATEGORIES))
    def test_create_each_valid_category(self, tokens, created_ids, cat):
        r = requests.post(f"{API}/bugs",
                          json={"title": f"TEST_cat_{cat}",
                                "description": f"desc {cat}",
                                "category": cat},
                          headers=_hdr(tokens["customer"]))
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["category"] == cat, b
        assert b["status"] == "open"
        created_ids.append(b["id"])

    def test_create_invalid_category_defaults_other(self, tokens, created_ids):
        r = requests.post(f"{API}/bugs",
                          json={"title": "TEST_cat_invalid",
                                "description": "d",
                                "category": "zzz"},
                          headers=_hdr(tokens["customer"]))
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["category"] == "other"
        created_ids.append(b["id"])

    def test_create_missing_category_defaults_other(self, tokens, created_ids):
        r = requests.post(f"{API}/bugs",
                          json={"title": "TEST_cat_missing", "description": "d"},
                          headers=_hdr(tokens["customer"]))
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["category"] == "other", b
        created_ids.append(b["id"])

    def test_create_null_category_defaults_other(self, tokens, created_ids):
        r = requests.post(f"{API}/bugs",
                          json={"title": "TEST_cat_null", "description": "d",
                                "category": None},
                          headers=_hdr(tokens["customer"]))
        assert r.status_code == 200, r.text
        assert r.json()["category"] == "other"
        created_ids.append(r.json()["id"])

    def test_create_uppercase_category_normalized(self, tokens, created_ids):
        r = requests.post(f"{API}/bugs",
                          json={"title": "TEST_cat_upper", "description": "d",
                                "category": "PAYMENT"},
                          headers=_hdr(tokens["customer"]))
        assert r.status_code == 200
        assert r.json()["category"] == "payment"
        created_ids.append(r.json()["id"])

    def test_partner_create_saves_category(self, tokens, created_ids):
        r = requests.post(f"{API}/bugs",
                          json={"title": "TEST_cat_partner",
                                "description": "d",
                                "category": "booking"},
                          headers=_hdr(tokens["partner"]))
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["category"] == "booking"
        assert b["reporter_role"] == "partner"
        created_ids.append(b["id"])


class TestMyBugsCategory:
    def test_my_bugs_includes_category(self, tokens, created_ids):
        # Ensure at least one exists
        r = requests.post(f"{API}/bugs",
                          json={"title": "TEST_cat_my", "description": "d",
                                "category": "login"},
                          headers=_hdr(tokens["customer"]))
        bid = r.json()["id"]
        created_ids.append(bid)

        r = requests.get(f"{API}/bugs/my", headers=_hdr(tokens["customer"]))
        assert r.status_code == 200
        rows = r.json()
        assert rows, "my_bugs should not be empty"
        for row in rows:
            assert "category" in row
            assert row["category"] in VALID_CATEGORIES
        this = [b for b in rows if b["id"] == bid]
        assert this and this[0]["category"] == "login"


class TestAdminCategory:
    def test_admin_list_includes_category_and_counts(self, tokens, created_ids):
        # Make sure at least one of each category exists for a non-trivial check
        for cat in VALID_CATEGORIES:
            r = requests.post(f"{API}/bugs",
                              json={"title": f"TEST_adm_{cat}",
                                    "description": "d",
                                    "category": cat},
                              headers=_hdr(tokens["customer"]))
            created_ids.append(r.json()["id"])

        r = requests.get(f"{API}/admin/bugs", headers=_hdr(tokens["admin"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert "category_counts" in body, body.keys()
        cc = body["category_counts"]
        expected = {"all", "payment", "booking", "login", "account", "other"}
        assert expected.issubset(set(cc.keys())), cc
        # Each count should be >= 1 since we just seeded them (and all>=each)
        for cat in VALID_CATEGORIES:
            assert cc[cat] >= 1, cc
        assert cc["all"] >= sum(cc[c] for c in VALID_CATEGORIES) - cc["other"]
        # rows have category
        for row in body["data"]:
            assert "category" in row
            assert row["category"] in VALID_CATEGORIES

    def test_admin_filter_payment(self, tokens):
        r = requests.get(f"{API}/admin/bugs?category=payment",
                         headers=_hdr(tokens["admin"]))
        assert r.status_code == 200
        for row in r.json()["data"]:
            assert row["category"] == "payment", row

    def test_admin_filter_login(self, tokens):
        r = requests.get(f"{API}/admin/bugs?category=login",
                         headers=_hdr(tokens["admin"]))
        assert r.status_code == 200
        for row in r.json()["data"]:
            assert row["category"] == "login", row

    def test_admin_filter_invalid_returns_all(self, tokens):
        r_all = requests.get(f"{API}/admin/bugs", headers=_hdr(tokens["admin"]))
        r_bad = requests.get(f"{API}/admin/bugs?category=zzz",
                             headers=_hdr(tokens["admin"]))
        assert r_all.status_code == 200 and r_bad.status_code == 200
        assert r_bad.json()["total"] == r_all.json()["total"]

    def test_admin_filter_empty_returns_all(self, tokens):
        r_all = requests.get(f"{API}/admin/bugs", headers=_hdr(tokens["admin"]))
        r_empty = requests.get(f"{API}/admin/bugs?category=",
                               headers=_hdr(tokens["admin"]))
        assert r_empty.json()["total"] == r_all.json()["total"]

    def test_existing_status_filter_still_works(self, tokens):
        r = requests.get(f"{API}/admin/bugs?status=open",
                         headers=_hdr(tokens["admin"]))
        assert r.status_code == 200
        for row in r.json()["data"]:
            assert row["status"] == "open"
            assert "category" in row

    def test_existing_role_filter_still_works(self, tokens):
        r = requests.get(f"{API}/admin/bugs?role=partner",
                         headers=_hdr(tokens["admin"]))
        assert r.status_code == 200
        for row in r.json()["data"]:
            assert row["reporter_role"] == "partner"

    def test_existing_q_search_still_works(self, tokens):
        r = requests.get(f"{API}/admin/bugs?q=TEST_adm",
                         headers=_hdr(tokens["admin"]))
        assert r.status_code == 200
        for row in r.json()["data"]:
            assert "TEST_adm" in row["title"] or "TEST_adm" in row.get("description", "")

    def test_pagination_still_works(self, tokens):
        r = requests.get(f"{API}/admin/bugs?page=1&page_size=2",
                         headers=_hdr(tokens["admin"]))
        assert r.status_code == 200
        body = r.json()
        assert body["page_size"] == 2
        assert len(body["data"]) <= 2

    def test_combined_status_and_category(self, tokens):
        r = requests.get(f"{API}/admin/bugs?status=open&category=payment",
                         headers=_hdr(tokens["admin"]))
        assert r.status_code == 200
        for row in r.json()["data"]:
            assert row["status"] == "open"
            assert row["category"] == "payment"

    def test_resolve_preserves_category(self, tokens, created_ids):
        r = requests.post(f"{API}/bugs",
                          json={"title": "TEST_resolve_cat", "description": "d",
                                "category": "account"},
                          headers=_hdr(tokens["customer"]))
        bid = r.json()["id"]
        created_ids.append(bid)
        r2 = requests.post(f"{API}/admin/bugs/{bid}/resolve", json={"note": "fx"},
                           headers=_hdr(tokens["admin"]))
        assert r2.status_code == 200, r2.text
        assert r2.json()["category"] == "account"
        assert r2.json()["status"] == "solved"

    def test_reopen_preserves_category(self, tokens, created_ids):
        r = requests.post(f"{API}/bugs",
                          json={"title": "TEST_reopen_cat", "description": "d",
                                "category": "booking"},
                          headers=_hdr(tokens["customer"]))
        bid = r.json()["id"]
        created_ids.append(bid)
        requests.post(f"{API}/admin/bugs/{bid}/resolve", json={"note": "fx"},
                      headers=_hdr(tokens["admin"]))
        r2 = requests.post(f"{API}/admin/bugs/{bid}/reopen",
                           headers=_hdr(tokens["admin"]))
        assert r2.status_code == 200
        assert r2.json()["category"] == "booking"
        assert r2.json()["status"] == "open"
