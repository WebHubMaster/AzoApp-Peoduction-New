"""Test profile photo upload/serving and admin partner photo visibility (iter 266)."""
import os
import base64
import pytest
import requests

BASE_URL = "http://localhost:8001"
OTP = "123456"
PARTNER_PHONE = "+919000000003"
ADMIN_PHONE = "+919000000000"
CUSTOMER_PHONE = "+919000000004"

# 1x1 transparent PNG
PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
PNG_DATA_URL = f"data:image/png;base64,{PNG_B64}"


def _login(phone, role):
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
        "phone": phone, "otp": OTP, "create_if_new": True, "role": role,
    }, timeout=15)
    assert r.status_code == 200, f"login {phone}/{role}: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and data["token"], f"no token in {data}"
    return data["token"], data.get("user", {})


@pytest.fixture(scope="module")
def partner_auth():
    return _login(PARTNER_PHONE, "partner")


@pytest.fixture(scope="module")
def admin_auth():
    return _login(ADMIN_PHONE, "admin")


@pytest.fixture(scope="module")
def customer_auth():
    return _login(CUSTOMER_PHONE, "customer")


# ---- Auth ----
def test_partner_login(partner_auth):
    token, user = partner_auth
    assert isinstance(token, str) and len(token) > 10


def test_admin_login(admin_auth):
    token, user = admin_auth
    assert isinstance(token, str) and len(token) > 10


# ---- Profile photo upload ----
def test_profile_photo_upload_returns_relative_url(partner_auth):
    token, _ = partner_auth
    r = requests.put(
        f"{BASE_URL}/api/auth/profile",
        headers={"Authorization": f"Bearer {token}"},
        json={"photo": PNG_DATA_URL},
        timeout=30,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    # Response may wrap user in different keys
    user = data.get("user") or data
    photo = user.get("photo") or data.get("photo")
    assert isinstance(photo, str) and photo, f"photo field missing/empty: {data}"
    assert not photo.startswith("data:"), "photo should not be data URL after storage"
    assert "/api/media/file/" in photo, f"expected relative /api/media/file/... path, got {photo}"
    # Share for next tests
    pytest.stored_photo_url = photo


def test_media_file_serves_image():
    photo = getattr(pytest, "stored_photo_url", None)
    assert photo, "no stored photo url from prior test"
    url = photo if photo.startswith("http") else f"{BASE_URL}{photo}"
    r = requests.get(url, timeout=15)
    assert r.status_code == 200, f"{r.status_code} fetching {url}"
    ctype = r.headers.get("Content-Type", "")
    assert ctype.startswith("image/"), f"unexpected content-type {ctype}"
    assert len(r.content) > 0


# ---- Admin partner list / detail ----
def test_admin_partner_list_has_photo(admin_auth, partner_auth):
    token, _ = admin_auth
    _, puser = partner_auth
    r = requests.get(
        f"{BASE_URL}/api/admin/partners",
        headers={"Authorization": f"Bearer {token}"},
        params={"tab": "all", "q": "9000000003"},
        timeout=15,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    if isinstance(data, list):
        items = data
    else:
        items = data.get("partners") or data.get("items") or []
    assert items, f"no partners in response: {data}"
    # find partner matching phone
    stored = getattr(pytest, "stored_photo_url", None)
    match = None
    for it in items:
        if PARTNER_PHONE in (it.get("phone") or "") or "9000000003" in (it.get("phone") or ""):
            match = it
            break
    assert match, f"partner not found in list: {items[:2]}"
    assert match.get("photo"), f"photo field missing on partner: {match}"
    if stored:
        assert match["photo"] == stored, f"photo mismatch: {match['photo']} vs {stored}"
    pytest.partner_id = match.get("id") or match.get("_id") or match.get("user_id")


def test_admin_partner_detail_has_photo(admin_auth):
    token, _ = admin_auth
    pid = getattr(pytest, "partner_id", None)
    assert pid, "no partner id captured"
    r = requests.get(
        f"{BASE_URL}/api/admin/users/{pid}/detail",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    user = data.get("user") or data
    photo = user.get("photo")
    assert photo, f"no photo in detail: {data}"
    stored = getattr(pytest, "stored_photo_url", None)
    if stored:
        assert photo == stored


# ---- Regression: bug categories ----
def test_bug_report_category_payment(customer_auth):
    token, _ = customer_auth
    r = requests.post(
        f"{BASE_URL}/api/bugs",
        headers={"Authorization": f"Bearer {token}"},
        json={"title": "TEST_photo_regression", "description": "regression check", "category": "payment"},
        timeout=15,
    )
    assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
    data = r.json()
    bug = data.get("bug") or data
    assert bug.get("category") == "payment", f"category not payment: {bug}"


def test_admin_bugs_has_category_counts(admin_auth):
    token, _ = admin_auth
    r = requests.get(
        f"{BASE_URL}/api/admin/bugs",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    assert "category_counts" in data, f"no category_counts: {list(data.keys())}"
