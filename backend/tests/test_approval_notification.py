"""Tests for merchant & partner admin approval notification flow.

Verifies POST /api/admin/people/{role}/{uid}/review creates an in-app notification
with the correct title/body/data payload (type=account_approved) so SSE/push can
trigger auto-login/redirect on the client.
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
OTP = "123456"

ADMIN_PHONE = "+919000000000"
PENDING_MERCHANTS = ["+919555000198", "+919555056561", "+919555056572"]


def _login(phone, role_hint=None):
    s = requests.Session()
    s.headers["Content-Type"] = "application/json"
    r = s.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, f"send-otp {phone} -> {r.status_code} {r.text}"
    payload = {"phone": phone, "otp": OTP, "create_if_new": True}
    if role_hint:
        payload["role"] = role_hint
    r = s.post(f"{API}/auth/verify-otp", json=payload, timeout=15)
    assert r.status_code == 200, f"verify-otp {phone} -> {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"no token in verify-otp response: {data}"
    s.headers["Authorization"] = f"Bearer {token}"
    return s, data.get("user") or {}


@pytest.fixture(scope="module")
def admin_session():
    s, u = _login(ADMIN_PHONE)
    assert (u.get("role") or "").lower() == "admin", f"user {u} is not admin"
    return s


def _find_pending_merchant(admin):
    for phone in PENDING_MERCHANTS:
        r = admin.get(f"{API}/admin/people/merchant", params={"q": phone}, timeout=15)
        if r.status_code != 200:
            continue
        rows = r.json() if isinstance(r.json(), list) else r.json().get("items") or r.json().get("data") or []
        for row in rows:
            if row.get("phone") == phone and (row.get("kyc_status") in (None, "", "pending", "under_review", "incomplete")):
                return row
    return None


def test_merchant_approval_creates_account_approved_notification(admin_session):
    merchant_row = _find_pending_merchant(admin_session)
    if not merchant_row:
        pytest.skip("No pending merchant found")
    uid = merchant_row.get("id") or merchant_row.get("user_id")
    assert uid

    # login as merchant to fetch notifications (and to reset kyc baseline count)
    m_sess, m_user = _login(merchant_row["phone"], role_hint="merchant")
    r_pre = m_sess.get(f"{API}/notifications", timeout=15)
    assert r_pre.status_code == 200, r_pre.text
    pre_items = r_pre.json() if isinstance(r_pre.json(), list) else r_pre.json().get("items", [])
    pre_ids = {n.get("id") for n in pre_items}

    # Approve via admin API
    r = admin_session.post(
        f"{API}/admin/people/merchant/{uid}/review",
        json={"decision": "approve"}, timeout=20)
    assert r.status_code == 200, f"approve -> {r.status_code} {r.text}"
    body = r.json()
    assert body.get("ok") is True or body.get("status") == "approved"

    # Allow async notify to settle
    time.sleep(1.5)

    r2 = m_sess.get(f"{API}/notifications", timeout=15)
    assert r2.status_code == 200
    items = r2.json() if isinstance(r2.json(), list) else r2.json().get("items", [])
    new_notes = [n for n in items if n.get("id") not in pre_ids]
    assert new_notes, f"No new notifications after approval. items={items[:3]}"

    approved = next((n for n in new_notes
                     if "Approved" in (n.get("title") or "")
                     or (n.get("data") or {}).get("type") == "account_approved"), None)
    assert approved, f"account_approved notification missing. new={new_notes}"
    assert "Approved" in approved["title"], f"title={approved['title']}"
    assert "log in" in (approved.get("body") or "").lower(), f"body={approved.get('body')}"
    d = approved.get("data") or {}
    assert d.get("type") == "account_approved", f"data={d}"
    assert d.get("role") == "merchant", f"role={d.get('role')}"


def _find_pending_partner(admin):
    r = admin.get(f"{API}/admin/people/partner", timeout=15)
    assert r.status_code == 200, r.text
    rows = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    for row in rows:
        if (row.get("kyc_status") or "").lower() in ("", "pending", "under_review", "incomplete"):
            return row
    return None


def test_partner_approval_creates_account_approved_notification(admin_session):
    partner_row = _find_pending_partner(admin_session)
    if not partner_row:
        pytest.skip("No pending partner found")
    uid = partner_row.get("id") or partner_row.get("user_id")
    phone = partner_row.get("phone")
    if not uid or not phone:
        pytest.skip("partner row missing id/phone")

    p_sess, _ = _login(phone, role_hint="partner")
    r_pre = p_sess.get(f"{API}/notifications", timeout=15)
    pre_items = r_pre.json() if isinstance(r_pre.json(), list) else r_pre.json().get("items", [])
    pre_ids = {n.get("id") for n in pre_items}

    r = admin_session.post(
        f"{API}/admin/people/partner/{uid}/review",
        json={"decision": "approve"}, timeout=20)
    assert r.status_code == 200, f"approve partner -> {r.status_code} {r.text}"

    time.sleep(1.5)
    r2 = p_sess.get(f"{API}/notifications", timeout=15)
    items = r2.json() if isinstance(r2.json(), list) else r2.json().get("items", [])
    new_notes = [n for n in items if n.get("id") not in pre_ids]
    assert new_notes, f"No new notifications after partner approval. {items[:3]}"
    approved = next((n for n in new_notes
                     if (n.get("data") or {}).get("type") == "account_approved"
                     or "Approved" in (n.get("title") or "")), None)
    assert approved, f"account_approved notif missing: {new_notes}"
    d = approved.get("data") or {}
    assert d.get("type") == "account_approved", f"data={d}"
    assert d.get("role") == "partner", f"role={d.get('role')}"


def test_merchant_rejection_sends_action_needed(admin_session):
    """Regression: rejection path still sends the existing 'Action Needed' notification."""
    merchant_row = _find_pending_merchant(admin_session)
    if not merchant_row:
        pytest.skip("No pending merchant for rejection test")
    uid = merchant_row.get("id") or merchant_row.get("user_id")

    m_sess, _ = _login(merchant_row["phone"], role_hint="merchant")
    r_pre = m_sess.get(f"{API}/notifications", timeout=15)
    pre_items = r_pre.json() if isinstance(r_pre.json(), list) else r_pre.json().get("items", [])
    pre_ids = {n.get("id") for n in pre_items}

    r = admin_session.post(
        f"{API}/admin/people/merchant/{uid}/review",
        json={"decision": "reject", "reason": "TEST_rejection_please_resubmit"},
        timeout=20)
    assert r.status_code == 200, f"reject -> {r.status_code} {r.text}"

    time.sleep(1.5)
    r2 = m_sess.get(f"{API}/notifications", timeout=15)
    items = r2.json() if isinstance(r2.json(), list) else r2.json().get("items", [])
    new_notes = [n for n in items if n.get("id") not in pre_ids]
    assert any("Action Needed" in (n.get("title") or "") for n in new_notes), \
        f"Action Needed title not found. new={new_notes}"
