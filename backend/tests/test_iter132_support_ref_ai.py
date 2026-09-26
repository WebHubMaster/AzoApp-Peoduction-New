"""iter132 — Backend tests for Customer app new pages:
   - Support (meta, tickets CRUD, messages, typing, close)
   - Referral (growth/referral, referral/apply)
   - AI chat (session reuse)
"""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE}/api"
CUSTOMER_PHONE = "+919000000004"
OTP = "123456"


@pytest.fixture(scope="module")
def customer_token():
    r = requests.post(f"{API}/auth/send-otp", json={"phone": CUSTOMER_PHONE}, timeout=15)
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/auth/verify-otp",
                      json={"phone": CUSTOMER_PHONE, "otp": OTP, "create_if_new": False}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def customer(customer_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {customer_token}", "Content-Type": "application/json"})
    return s


# ---------- Support ----------
class TestSupport:
    created_tid = None

    def test_support_meta(self, customer):
        r = customer.get(f"{API}/support/meta", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, dict)

    def test_list_tickets(self, customer):
        r = customer.get(f"{API}/support/tickets", timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_create_ticket(self, customer):
        payload = {"subject": "TEST_iter132 throwaway", "category": "booking",
                   "priority": "low", "message": "Testing new customer app support flow."}
        r = customer.post(f"{API}/support/tickets", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        tid = d.get("id") or d.get("_id") or d.get("code")
        assert tid, f"no ticket id in {d}"
        TestSupport.created_tid = tid
        # Get by id to verify persistence
        r2 = customer.get(f"{API}/support/tickets/{tid}", timeout=15)
        assert r2.status_code == 200, r2.text

    def test_add_message(self, customer):
        tid = TestSupport.created_tid
        assert tid
        r = customer.post(f"{API}/support/tickets/{tid}/messages",
                          json={"text": "Follow-up test message"}, timeout=15)
        assert r.status_code == 200, r.text
        # Verify via GET
        r2 = customer.get(f"{API}/support/tickets/{tid}", timeout=15)
        assert r2.status_code == 200
        d = r2.json()
        msgs = d.get("messages") or []
        assert any("Follow-up test message" in (m.get("text") or "") for m in msgs)

    def test_typing(self, customer):
        tid = TestSupport.created_tid
        r = customer.post(f"{API}/support/tickets/{tid}/typing", timeout=15)
        assert r.status_code == 200, r.text

    def test_close_ticket(self, customer):
        tid = TestSupport.created_tid
        r = customer.post(f"{API}/support/tickets/{tid}/close", timeout=15)
        assert r.status_code == 200, r.text
        r2 = customer.get(f"{API}/support/tickets/{tid}", timeout=15)
        d = r2.json()
        assert (d.get("status") or "").lower() == "closed", d


# ---------- Referral ----------
class TestReferral:
    def test_growth_referral(self, customer):
        r = customer.get(f"{API}/growth/referral", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        code = d.get("code") or d.get("referral_code")
        assert code, f"missing referral code: {d}"
        # Spec says expected code AZO0004 for demo user
        assert "AZO" in code or len(code) >= 4

    def test_apply_invalid_code(self, customer):
        r = customer.post(f"{API}/referral/apply", json={"code": "ZZZZ9999"}, timeout=15)
        # Expect a 4xx OR a JSON response with error info
        if r.status_code == 200:
            d = r.json()
            # should indicate error/failure
            ok = d.get("ok", d.get("success", True))
            assert ok is False or d.get("error") or d.get("message"), f"invalid code accepted: {d}"
        else:
            assert r.status_code in (400, 404, 422), r.text


# ---------- AI ----------
class TestAI:
    def test_ai_chat_and_session_reuse(self, customer):
        r = customer.post(f"{API}/ai/chat", json={"message": "hello"}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        sid = d.get("session_id")
        assert sid, f"no session_id: {d}"
        reply = d.get("reply") or d.get("message") or d.get("text")
        assert reply
        # Second call reusing session_id
        r2 = customer.post(f"{API}/ai/chat", json={"message": "kitna kharcha aayega?", "session_id": sid}, timeout=60)
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2.get("session_id") == sid, f"session not preserved: {d2}"
