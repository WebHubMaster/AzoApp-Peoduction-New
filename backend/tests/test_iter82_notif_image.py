"""Iter82 — Verify admin push notification carries image through pipeline.
Tests:
- /api/admin/notifications/test-push accepts image, stores in-app notif with image, returns dual-dispatch channels.
- /api/admin/notifications/send-campaign persists image on campaign and recipient's in-app notification.
- Both endpoints still work without image.
"""
import os
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-invoice-tools.preview.emergentagent.com").rstrip("/")
IMG = "https://images.unsplash.com/photo-1519681393784-d120267933ba"

ADMIN_PHONE = "+919000000000"
PARTNER_PHONE = "+919000000003"


def _login(phone):
    r = requests.post(f"{BASE}/api/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE}/api/auth/verify-otp", json={"phone": phone, "otp": "123456"}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    token = d.get("token") or d.get("access_token") or (d.get("data") or {}).get("token")
    user = d.get("user") or (d.get("data") or {}).get("user") or {}
    uid = user.get("id") or user.get("_id") or d.get("user_id")
    assert token and uid, f"login missing token/uid: {d}"
    return token, uid


@pytest.fixture(scope="module")
def admin():
    tok, uid = _login(ADMIN_PHONE)
    return {"token": tok, "id": uid, "headers": {"Authorization": f"Bearer {tok}"}}


@pytest.fixture(scope="module")
def partner():
    tok, uid = _login(PARTNER_PHONE)
    return {"token": tok, "id": uid, "headers": {"Authorization": f"Bearer {tok}"}}


# ---- test-push endpoint ----
def test_test_push_with_image(admin, partner):
    body = {"user_id": partner["id"], "title": "IMG Test", "body": "hello", "image": IMG}
    r = requests.post(f"{BASE}/api/admin/notifications/test-push", json=body, headers=admin["headers"], timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("ok") is True, data
    push = data.get("push") or {}
    channels = push.get("channels") or {}
    assert "webpush" in channels and "fcm" in channels, f"missing dual channels: {push}"

    # Verify in-app notification stored with image for partner
    rn = requests.get(f"{BASE}/api/notifications", headers=partner["headers"], timeout=15)
    assert rn.status_code == 200, rn.text
    items = rn.json()
    if isinstance(items, dict):
        items = items.get("items") or items.get("notifications") or items.get("data") or []
    assert items, "no notifications for partner"
    latest = items[0]
    assert latest.get("image") == IMG, f"image not persisted: {latest}"


def test_test_push_without_image(admin, partner):
    body = {"user_id": partner["id"], "title": "NoImg", "body": "hi"}
    r = requests.post(f"{BASE}/api/admin/notifications/test-push", json=body, headers=admin["headers"], timeout=20)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True


# ---- send-campaign endpoint ----
def test_send_campaign_with_image(admin, partner):
    body = {
        "title": "Campaign IMG",
        "message": "hello campaign",
        "image": IMG,
        "send_to": "specific",
        "user_id": partner["id"],
    }
    r = requests.post(f"{BASE}/api/admin/notifications/send", json=body, headers=admin["headers"], timeout=25)
    assert r.status_code == 200, r.text
    data = r.json()
    camp = data.get("campaign") or data
    assert camp.get("image") == IMG, f"campaign image mismatch: {camp}"
    recips = camp.get("recipients")
    if recips is None:
        recips = data.get("recipients")
    assert (recips or 0) >= 1, f"recipients < 1: {data}"

    # Verify partner in-app notification has image
    rn = requests.get(f"{BASE}/api/notifications", headers=partner["headers"], timeout=15)
    assert rn.status_code == 200
    items = rn.json()
    if isinstance(items, dict):
        items = items.get("items") or items.get("notifications") or items.get("data") or []
    assert items and any((it.get("image") == IMG) for it in items[:5]), "campaign image not in in-app notifs"


def test_send_campaign_without_image(admin, partner):
    body = {
        "title": "Campaign NoImg",
        "message": "hello",
        "send_to": "specific",
        "user_id": partner["id"],
    }
    r = requests.post(f"{BASE}/api/admin/notifications/send", json=body, headers=admin["headers"], timeout=25)
    assert r.status_code == 200, r.text
