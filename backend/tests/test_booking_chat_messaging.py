"""Backend chat messaging + notification flow for AzoApp bookings.

Verifies GET/POST /api/bookings/{id}/messages for partner+customer,
chat gating on unpaid bookings, notification creation for the recipient,
and 403 authorization for outsiders.
"""
import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

PARTNER_PHONE = "+919000000003"
CUSTOMER_PHONE = "+919000000004"
OUTSIDER_PHONE = "+919000000009"  # arbitrary other user

PAID_BOOKING_ID = "147ad06b-6a72-4c32-8b92-8f374019e3a4"
PENDING_BOOKING_ID = "62768d2c-64fd-4916-a298-f4267663f93e"


def _login(phone: str) -> str:
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=60)
    assert r.status_code == 200, f"send-otp failed for {phone}: {r.status_code} {r.text}"
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": "123456"}, timeout=60)
    assert r.status_code == 200, f"verify-otp failed for {phone}: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok, f"no token in verify-otp response for {phone}: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def partner_token():
    return _login(PARTNER_PHONE)


@pytest.fixture(scope="module")
def customer_token():
    return _login(CUSTOMER_PHONE)


@pytest.fixture(scope="module")
def outsider_token():
    return _login(OUTSIDER_PHONE)


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ── GET messages on paid+active booking ───────────────────────────────────────
class TestListMessagesEnabled:
    def test_partner_get_messages_enabled(self, partner_token):
        r = requests.get(f"{API}/bookings/{PAID_BOOKING_ID}/messages", headers=_h(partner_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("enabled") is True, f"chat should be enabled: {d}"
        assert d.get("me"), "missing 'me' id"
        assert isinstance(d.get("messages"), list), "messages should be a list"
        assert d.get("customer") is not None, "customer counterpart missing"

    def test_customer_get_messages_enabled(self, customer_token):
        r = requests.get(f"{API}/bookings/{PAID_BOOKING_ID}/messages", headers=_h(customer_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("enabled") is True
        assert d.get("me")
        assert d.get("partner") is not None
        assert isinstance(d.get("messages"), list)


# ── POST messages both ways + chronological listing ──────────────────────────
class TestSendMessageBothParties:
    def test_partner_and_customer_send_and_thread_chronological(self, partner_token, customer_token):
        # Partner sends
        p_text = "TEST_partner_hello_from_pytest"
        r1 = requests.post(f"{API}/bookings/{PAID_BOOKING_ID}/messages",
                           json={"text": p_text}, headers=_h(partner_token), timeout=15)
        assert r1.status_code in (200, 201), r1.text
        m1 = r1.json()
        assert m1.get("id"), "partner message missing id"
        assert m1.get("sender_role") == "partner", f"sender_role wrong: {m1}"

        # Customer sends
        c_text = "TEST_customer_hi_back_from_pytest"
        r2 = requests.post(f"{API}/bookings/{PAID_BOOKING_ID}/messages",
                           json={"text": c_text}, headers=_h(customer_token), timeout=15)
        assert r2.status_code in (200, 201), r2.text
        m2 = r2.json()
        assert m2.get("id")
        assert m2.get("sender_role") == "customer"

        # Both parties see both messages in order
        for tok in (partner_token, customer_token):
            g = requests.get(f"{API}/bookings/{PAID_BOOKING_ID}/messages", headers=_h(tok), timeout=15).json()
            msgs = g["messages"]
            ids = [m["id"] for m in msgs]
            assert m1["id"] in ids and m2["id"] in ids
            i1, i2 = ids.index(m1["id"]), ids.index(m2["id"])
            assert i1 < i2, "messages not chronological"
            # created_at monotonic
            ts = [m["created_at"] for m in msgs]
            assert ts == sorted(ts), "created_at not sorted ascending"


# ── Gating on unpaid booking ─────────────────────────────────────────────────
class TestChatGatingPending:
    def test_get_pending_returns_enabled_false(self, partner_token):
        r = requests.get(f"{API}/bookings/{PENDING_BOOKING_ID}/messages", headers=_h(partner_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("enabled") is False, f"expected disabled chat on pending booking: {d}"

    def test_post_pending_rejected_400(self, partner_token):
        r = requests.post(f"{API}/bookings/{PENDING_BOOKING_ID}/messages",
                          json={"text": "TEST_should_be_rejected"},
                          headers=_h(partner_token), timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
        detail = (r.json().get("detail") or "").lower()
        assert "payment" in detail or "chat" in detail, f"unexpected error detail: {detail}"


# ── Notification created for the OTHER party ────────────────────────────────
class TestChatNotifications:
    def _fetch_notifs(self, tok):
        r = requests.get(f"{API}/notifications", headers=_h(tok), timeout=15)
        assert r.status_code == 200, f"GET /api/notifications failed: {r.status_code} {r.text}"
        data = r.json()
        # Endpoint may return list or {items: [...]}
        if isinstance(data, dict):
            data = data.get("items") or data.get("notifications") or data.get("data") or []
        assert isinstance(data, list), f"unexpected notifications shape: {type(data)}"
        return data

    def test_partner_send_creates_customer_notification(self, partner_token, customer_token):
        unique = "TEST_notify_from_partner_" + os.urandom(3).hex()
        r = requests.post(f"{API}/bookings/{PAID_BOOKING_ID}/messages",
                          json={"text": unique}, headers=_h(partner_token), timeout=15)
        assert r.status_code in (200, 201), r.text
        import time
        time.sleep(1.2)
        notifs = self._fetch_notifs(customer_token)
        # look for chat_message event or a title/body containing our unique text or "New message"
        def _match(n):
            blob = " ".join(str(v) for v in n.values() if isinstance(v, (str, int)))
            data = n.get("data") or {}
            return (
                n.get("event") == "chat_message"
                or (isinstance(data, dict) and data.get("type") == "chat_message")
                or "new message" in blob.lower()
                or unique in blob
            )
        assert any(_match(n) for n in notifs[:30]), f"no chat notification for customer. Sample: {notifs[:3]}"

    def test_customer_send_creates_partner_notification(self, partner_token, customer_token):
        unique = "TEST_notify_from_customer_" + os.urandom(3).hex()
        r = requests.post(f"{API}/bookings/{PAID_BOOKING_ID}/messages",
                          json={"text": unique}, headers=_h(customer_token), timeout=15)
        assert r.status_code in (200, 201), r.text
        import time
        time.sleep(1.2)
        notifs = self._fetch_notifs(partner_token)
        def _match(n):
            blob = " ".join(str(v) for v in n.values() if isinstance(v, (str, int)))
            data = n.get("data") or {}
            return (
                n.get("event") == "chat_message"
                or (isinstance(data, dict) and data.get("type") == "chat_message")
                or "new message" in blob.lower()
                or unique in blob
            )
        assert any(_match(n) for n in notifs[:30]), f"no chat notification for partner. Sample: {notifs[:3]}"


# ── Authorization: outsider gets 403 ────────────────────────────────────────
class TestChatAuthorization:
    def test_outsider_get_403(self, outsider_token):
        r = requests.get(f"{API}/bookings/{PAID_BOOKING_ID}/messages", headers=_h(outsider_token), timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_outsider_post_403(self, outsider_token):
        r = requests.post(f"{API}/bookings/{PAID_BOOKING_ID}/messages",
                          json={"text": "TEST_outsider_should_fail"},
                          headers=_h(outsider_token), timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"
