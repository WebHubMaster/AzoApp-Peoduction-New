"""Backend tests for Partner web panel features:
- Notifications list / delete-one / delete-all
- Bugs create / list-my / delete
- notifications/test-self + push-config + my-devices
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lazy-pagination.preview.emergentagent.com").rstrip("/")
PARTNER_PHONE = "+919000000003"
OTP = "123456"


@pytest.fixture(scope="module")
def partner_token():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": PARTNER_PHONE})
    assert r.status_code in (200, 201), f"send-otp failed: {r.status_code} {r.text}"
    r = s.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": PARTNER_PHONE, "otp": OTP})
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"No token in: {r.json()}"
    return tok


@pytest.fixture
def auth(partner_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {partner_token}"})
    return s


# ---------- Notifications ----------
class TestNotifications:
    def test_list_notifications(self, auth):
        r = auth.get(f"{BASE_URL}/api/notifications")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) or isinstance(data, dict)

    def test_test_self_push(self, auth):
        r = auth.post(f"{BASE_URL}/api/notifications/test-self", json={"kind": "push"})
        assert r.status_code == 200
        assert "ok" in r.json() or "message" in r.json()

    def test_push_config(self, auth):
        r = auth.get(f"{BASE_URL}/api/notifications/push-config")
        assert r.status_code == 200
        assert "enabled" in r.json()

    def test_my_devices(self, auth):
        r = auth.get(f"{BASE_URL}/api/notifications/my-devices")
        assert r.status_code == 200

    def test_delete_single_and_clear_all(self, auth):
        # Seed a notification via test-self push (creates DB notification)
        auth.post(f"{BASE_URL}/api/notifications/test-self", json={"kind": "push"})
        time.sleep(0.5)
        r = auth.get(f"{BASE_URL}/api/notifications")
        items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        if items:
            nid = items[0].get("id")
            if nid:
                dr = auth.delete(f"{BASE_URL}/api/notifications/{nid}")
                assert dr.status_code in (200, 204)
        # Clear all
        cr = auth.delete(f"{BASE_URL}/api/notifications")
        assert cr.status_code in (200, 204)
        r2 = auth.get(f"{BASE_URL}/api/notifications")
        items2 = r2.json() if isinstance(r2.json(), list) else r2.json().get("items", [])
        assert len(items2) == 0


# ---------- Bugs ----------
class TestBugs:
    def test_create_list_delete(self, auth):
        payload = {"title": "TEST_bug_from_pytest", "description": "automated test bug", "category": "other", "screenshot_url": None}
        c = auth.post(f"{BASE_URL}/api/bugs", json=payload)
        assert c.status_code in (200, 201), f"{c.status_code} {c.text}"
        created = c.json()
        bug_id = created.get("id") or created.get("bug", {}).get("id")
        assert bug_id, f"No id in: {created}"

        lst = auth.get(f"{BASE_URL}/api/bugs/my")
        assert lst.status_code == 200
        rows = lst.json()
        assert any((r.get("id") == bug_id) for r in rows), "Created bug not in /bugs/my"

        # Delete only allowed when solved; try delete and accept 400/403 for open bug
        dr = auth.delete(f"{BASE_URL}/api/bugs/{bug_id}")
        assert dr.status_code in (200, 204, 400, 403, 409)


# ---------- Support upload ----------
class TestSupportUpload:
    def test_upload_image(self, auth):
        from PIL import Image
        import io
        buf = io.BytesIO()
        Image.new("RGB", (10, 10), (255, 0, 0)).save(buf, format="PNG")
        png = buf.getvalue()
        files = {"file": ("t.png", png, "image/png")}
        data = {"doc_type": "bug"}
        # Strip JSON content-type set earlier
        s = requests.Session()
        s.headers.update({"Authorization": auth.headers["Authorization"]})
        r = s.post(f"{BASE_URL}/api/support/upload", files=files, data=data)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        j = r.json()
        assert "url" in j
