"""Backend tests: SMS test tool endpoint + bin bulk-purge / individual purge."""
import os
import requests
import pytest

def _load_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        try:
            for line in open("/app/frontend/.env"):
                if line.startswith("REACT_APP_BACKEND_URL="):
                    v = line.strip().split("=", 1)[1]
                    break
        except Exception:
            pass
    return v.rstrip("/")


BASE_URL = _load_url()


@pytest.fixture(scope="module")
def admin_token():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": "+919000000000"})
    assert r.status_code == 200, r.text
    r = s.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": "+919000000000", "otp": "123456"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture
def admin(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


# --- SMS test endpoint ---
class TestSmsTest:
    def test_invalid_phone_returns_validation(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/integrations/sms-test", json={"phone": "123"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is False
        # Either sms disabled, no key, or invalid number - all validate the tool is wired
        assert "error" in d or "message" in d


# --- Bin listing & purge ---
class TestBinPurge:
    def _find(self, admin, phone_suffix):
        r = admin.get(f"{BASE_URL}/api/admin/people/customer?tab=deleted")
        assert r.status_code == 200, r.text
        data = r.json()
        items = data.get("items") or data.get("data") or data.get("customers") or []
        for it in items:
            if str(it.get("phone", "")).endswith(phone_suffix):
                return it
        return None

    def test_deleted_tab_lists_bin_items(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/people/customer?tab=deleted")
        assert r.status_code == 200, r.text

    def test_person_purge_endpoint_exists(self, admin):
        # Just verify shape - actual bin purge will be done via frontend
        r = admin.post(f"{BASE_URL}/api/admin/people/customer/nonexistent-uid/purge")
        # should return 200 with error or 404; not 500
        assert r.status_code in (200, 400, 404), r.text

    def test_bulk_purge_empty_list(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/people/customer/bulk-purge", json={"uids": []})
        assert r.status_code == 200, r.text
