"""Backend tests for COS admin report endpoint: GET /api/admin/bookings-cos-report"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://finance-console-3.preview.emergentagent.com").rstrip("/")
ADMIN_PHONE = "+919000000000"
OTP = "123456"


@pytest.fixture(scope="module")
def admin_token():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": ADMIN_PHONE, "role": "admin"})
    assert r.status_code in (200, 201), r.text
    r = s.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": ADMIN_PHONE, "otp": OTP, "role": "admin"})
    assert r.status_code == 200, r.text
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in response: {data}"
    return tok


def test_cos_report_shape(admin_token):
    r = requests.get(f"{BASE_URL}/api/admin/bookings-cos-report",
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert "bookings" in j and isinstance(j["bookings"], list)
    assert "count" in j and isinstance(j["count"], int)
    assert "totals" in j and isinstance(j["totals"], dict)
    for k in ("token_paid", "cash_to_collect", "cash_collected", "cash_pending"):
        assert k in j["totals"], f"missing totals.{k}"
        assert isinstance(j["totals"][k], (int, float))
    print(f"COS report: count={j['count']}, totals={j['totals']}")


def test_cos_report_requires_admin():
    r = requests.get(f"{BASE_URL}/api/admin/bookings-cos-report")
    assert r.status_code in (401, 403), f"Expected auth error, got {r.status_code}"


def test_cos_report_has_at_least_one(admin_token):
    r = requests.get(f"{BASE_URL}/api/admin/bookings-cos-report",
                     headers={"Authorization": f"Bearer {admin_token}"})
    j = r.json()
    assert j["count"] >= 1, f"Expected ≥1 COS booking per request context, got {j['count']}"
    b = j["bookings"][0]
    for k in ("id", "code", "status", "token_amount", "cash_to_collect"):
        assert k in b
