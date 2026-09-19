"""Backend tests for GET /api/starter-kit/admin/purchases (redesigned).

Verifies:
- Admin auth via OTP demo flow
- Response structure (methods, sort, status_counts, base_total, filtered_*, total_all)
- Filters: q, method, status, date_from/date_to
- Sort variants: newest, oldest, amount_high, amount_low, partner, partner_desc
- Tracking update round-trip and restoration to 'processing'
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_PHONE = "+919000000000"


@pytest.fixture(scope="module")
def admin_token():
    s = requests.Session()
    r = s.post(f"{API}/auth/send-otp", json={"phone": ADMIN_PHONE}, timeout=15)
    assert r.status_code == 200, r.text
    r2 = s.post(f"{API}/auth/verify-otp",
                json={"phone": ADMIN_PHONE, "otp": "123456"}, timeout=15)
    assert r2.status_code == 200, r2.text
    tok = r2.json().get("token") or r2.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _get(headers, **params):
    return requests.get(f"{API}/starter-kit/admin/purchases",
                        headers=headers, params=params, timeout=15)


class TestAdminPurchases:
    def test_default_shape(self, admin_headers):
        r = _get(admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        for key in ["purchases", "count", "total_revenue", "filtered_count",
                    "filtered_revenue", "total_all", "page", "page_size",
                    "total_pages", "status_counts", "base_total", "methods", "sort"]:
            assert key in d, f"missing key {key}"
        assert isinstance(d["methods"], list)
        assert d["sort"] == "newest"
        assert isinstance(d["status_counts"], dict)
        for s in ["processing", "shipped", "out_for_delivery", "delivered"]:
            assert s in d["status_counts"]
        assert d["total_all"] >= 1  # at least the seeded Raj Kumar purchase

    def test_methods_contains_mock(self, admin_headers):
        d = _get(admin_headers).json()
        # mock purchases stored with method='mock'
        assert "mock" in d["methods"], f"methods={d['methods']}"

    def test_search_matching(self, admin_headers):
        d = _get(admin_headers, q="Raj").json()
        assert d["filtered_count"] >= 1
        names = [p.get("user_name", "") for p in d["purchases"]]
        assert any("Raj" in n for n in names)

    def test_search_no_match(self, admin_headers):
        d = _get(admin_headers, q="zzzznomatch").json()
        assert d["filtered_count"] == 0
        assert d["purchases"] == []
        # all-time still reported
        assert d["total_all"] >= 1

    def test_filter_method_mock(self, admin_headers):
        d = _get(admin_headers, method="mock").json()
        for p in d["purchases"]:
            assert p["method"] == "mock"

    def test_filter_status_all_vs_specific(self, admin_headers):
        d_all = _get(admin_headers, status="all").json()
        d_proc = _get(admin_headers, status="processing").json()
        assert d_proc["filtered_count"] == d_all["status_counts"]["processing"]

    def test_date_range(self, admin_headers):
        # far past should yield 0
        d = _get(admin_headers, date_from="2000-01-01", date_to="2000-01-02").json()
        assert d["filtered_count"] == 0

    @pytest.mark.parametrize("sort", ["newest", "oldest", "amount_high",
                                       "amount_low", "partner", "partner_desc"])
    def test_sort_variants(self, admin_headers, sort):
        r = _get(admin_headers, sort=sort)
        assert r.status_code == 200
        d = r.json()
        assert d["sort"] == sort


class TestTrackingUpdate:
    def test_tracking_roundtrip(self, admin_headers):
        d = _get(admin_headers).json()
        assert d["purchases"], "need at least 1 purchase"
        pid = d["purchases"][0]["id"]
        # shipped
        r1 = requests.post(f"{API}/starter-kit/admin/purchases/{pid}/tracking",
                           json={"status": "shipped"}, headers=admin_headers, timeout=15)
        assert r1.status_code == 200, r1.text
        assert r1.json()["tracking_status"] == "shipped"
        # verify via listing
        d2 = _get(admin_headers).json()
        row = next(p for p in d2["purchases"] if p["id"] == pid)
        assert row["tracking_status"] == "shipped"
        # RESTORE to processing (per instructions)
        r2 = requests.post(f"{API}/starter-kit/admin/purchases/{pid}/tracking",
                           json={"status": "processing"}, headers=admin_headers, timeout=15)
        assert r2.status_code == 200
        d3 = _get(admin_headers).json()
        row2 = next(p for p in d3["purchases"] if p["id"] == pid)
        assert row2["tracking_status"] == "processing"

    def test_tracking_invalid_status(self, admin_headers):
        d = _get(admin_headers).json()
        pid = d["purchases"][0]["id"]
        r = requests.post(f"{API}/starter-kit/admin/purchases/{pid}/tracking",
                          json={"status": "bogus"}, headers=admin_headers, timeout=15)
        assert r.status_code == 400
