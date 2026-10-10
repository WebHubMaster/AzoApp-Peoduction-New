"""Backend tests for Booking Filters Sync (/api/bookings/my/paged) and notifications feed."""
import os, pytest, requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://azo-seo-console.preview.emergentagent.com").rstrip("/")
PHONE = "+919000000004"
OTP = "123456"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def h(token):
    return {"Authorization": f"Bearer {token}"}


# ----- /bookings/my/paged ----------------------------------------------------
class TestBookingsPaged:
    def test_default_page(self, h):
        r = requests.get(f"{BASE_URL}/api/bookings/my/paged", headers=h, timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ("items", "total", "page", "page_size", "counts"):
            assert k in d, f"missing {k}"
        assert isinstance(d["items"], list)
        assert isinstance(d["counts"], dict)
        assert "all" in d["counts"]

    def test_page_size_respected(self, h):
        r = requests.get(f"{BASE_URL}/api/bookings/my/paged?page=1&page_size=2", headers=h, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["page_size"] == 2
        assert len(d["items"]) <= 2

    def test_pagination_second_page(self, h):
        d1 = requests.get(f"{BASE_URL}/api/bookings/my/paged?page=1&page_size=2", headers=h, timeout=30).json()
        d2 = requests.get(f"{BASE_URL}/api/bookings/my/paged?page=2&page_size=2", headers=h, timeout=30).json()
        ids1 = {b["id"] for b in d1["items"]}
        ids2 = {b["id"] for b in d2["items"]}
        # pages must not overlap when total > 2
        if d1["total"] > 2:
            assert ids1.isdisjoint(ids2), "pages overlap"

    def test_tab_active(self, h):
        r = requests.get(f"{BASE_URL}/api/bookings/my/paged?tab=active", headers=h, timeout=30)
        assert r.status_code == 200
        d = r.json()
        active_states = {"searching", "assigned", "accepted", "started", "arrived_shop", "arrived_customer", "ongoing", "paid"}
        for b in d["items"]:
            assert b["status"] in active_states or b["status"] in {"searching"}, b["status"]

    def test_tab_cancelled(self, h):
        r = requests.get(f"{BASE_URL}/api/bookings/my/paged?tab=cancelled", headers=h, timeout=30)
        assert r.status_code == 200
        for b in r.json()["items"]:
            assert b["status"] == "cancelled"

    def test_tab_completed(self, h):
        r = requests.get(f"{BASE_URL}/api/bookings/my/paged?tab=completed", headers=h, timeout=30)
        assert r.status_code == 200
        for b in r.json()["items"]:
            assert b["status"] in {"completed", "paid"}

    def test_search_by_code(self, h):
        # grab a code first
        all_d = requests.get(f"{BASE_URL}/api/bookings/my/paged?page=1&page_size=1", headers=h, timeout=30).json()
        if not all_d["items"]:
            pytest.skip("no bookings")
        code = all_d["items"][0]["code"]
        r = requests.get(f"{BASE_URL}/api/bookings/my/paged?search={code}", headers=h, timeout=30)
        assert r.status_code == 200
        codes = [b["code"] for b in r.json()["items"]]
        assert code in codes

    def test_search_no_match(self, h):
        r = requests.get(f"{BASE_URL}/api/bookings/my/paged?search=ZZZZNOMATCH999", headers=h, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["total"] == 0
        assert d["items"] == []
        # counts.all should still reflect user's total bookings (not filtered)
        assert d["counts"]["all"] >= 0

    def test_sort_old(self, h):
        r = requests.get(f"{BASE_URL}/api/bookings/my/paged?sort=old&page_size=50", headers=h, timeout=30)
        assert r.status_code == 200
        d = r.json()
        times = [b.get("created_at") or "" for b in d["items"] if b.get("created_at")]
        if len(times) >= 2:
            assert times == sorted(times), "sort=old should be ascending"

    def test_sort_new_default(self, h):
        r = requests.get(f"{BASE_URL}/api/bookings/my/paged?sort=new&page_size=50", headers=h, timeout=30)
        assert r.status_code == 200
        d = r.json()
        times = [b.get("created_at") or "" for b in d["items"] if b.get("created_at")]
        if len(times) >= 2:
            assert times == sorted(times, reverse=True), "sort=new should be descending"

    def test_payment_filter(self, h):
        r = requests.get(f"{BASE_URL}/api/bookings/my/paged?payment=paid", headers=h, timeout=30)
        assert r.status_code == 200

    def test_date_range_future_empty(self, h):
        r = requests.get(f"{BASE_URL}/api/bookings/my/paged?date_from=2099-01-01&date_to=2099-12-31", headers=h, timeout=30)
        assert r.status_code == 200
        assert r.json()["total"] == 0

    def test_unauthorized(self):
        r = requests.get(f"{BASE_URL}/api/bookings/my/paged", timeout=30)
        assert r.status_code in (401, 403)


# ----- /notifications feed ---------------------------------------------------
class TestNotifications:
    def test_list(self, h):
        r = requests.get(f"{BASE_URL}/api/notifications", headers=h, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        titles = [n.get("title", "") for n in data]
        # at least the seeded TEST_ notifs should appear
        assert any(t.startswith("TEST_") for t in titles), f"no TEST_ notifs found: {titles[:5]}"

    def test_seeded_has_required_fields(self, h):
        data = requests.get(f"{BASE_URL}/api/notifications", headers=h, timeout=30).json()
        test_notifs = [n for n in data if n.get("title", "").startswith("TEST_")]
        for n in test_notifs:
            assert "id" in n and "title" in n
            # data field drives deep links in notifTarget()
            assert ("data" in n) or ("link" in n)
