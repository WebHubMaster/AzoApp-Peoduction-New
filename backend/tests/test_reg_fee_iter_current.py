"""Backend tests for Partner Registration Fee admin endpoints + admin payments health."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/send-otp", json={"phone": "+919000000000"})
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/auth/verify-otp",
                      json={"phone": "+919000000000", "otp": "123456"})
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def test_registration_fees_endpoint_shape(h):
    r = requests.get(f"{API}/admin/partner-reg/registration-fees", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    for key in ("fee_config", "summary", "transactions", "unpaid", "status"):
        assert key in data, f"missing key: {key} in {list(data.keys())}"
    assert isinstance(data["transactions"], list)
    assert isinstance(data["unpaid"], list)
    assert isinstance(data["summary"], dict)


@pytest.mark.parametrize("status", ["all", "paid", "unpaid"])
def test_registration_fees_status_filter(h, status):
    r = requests.get(f"{API}/admin/partner-reg/registration-fees",
                     params={"status": status}, headers=h)
    assert r.status_code == 200
    assert r.json().get("status") == status


def test_registration_fees_query_filters_no_error(h):
    r = requests.get(f"{API}/admin/partner-reg/registration-fees",
                     params={"status": "all", "q": "test", "date_from": "2024-01-01",
                             "date_to": "2030-01-01", "gateway": "razorpay", "mode": "online"},
                     headers=h)
    assert r.status_code == 200


def test_admin_payments_still_works(h):
    r = requests.get(f"{API}/admin/payments", headers=h)
    assert r.status_code == 200, r.text
    # should be a list or object with a list; just ensure no crash
    j = r.json()
    assert isinstance(j, (list, dict))


def test_partner_overview_includes_reg_fee_if_partner_exists(h):
    # Find any partner
    r = requests.get(f"{API}/admin/people/partner", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    people = body if isinstance(body, list) else (body.get("items") or body.get("people") or body.get("results") or [])
    if not people:
        pytest.skip("no partners in DB")
    uid = people[0].get("id") or people[0].get("uid") or people[0].get("user_id")
    assert uid, f"no uid in partner obj: {people[0]}"
    r = requests.get(f"{API}/admin/people/partner/{uid}/overview", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "reg_fee" in data, f"reg_fee missing; keys={list(data.keys())}"
    rf = data["reg_fee"]
    for k in ("enabled", "current_fee", "paid"):
        assert k in rf, f"reg_fee missing key {k}: {rf}"


def test_no_auth_forbidden():
    r = requests.get(f"{API}/admin/partner-reg/registration-fees")
    assert r.status_code in (401, 403)
