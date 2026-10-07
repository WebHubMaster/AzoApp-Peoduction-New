"""
Tests for POST /api/invoices/{invoice_id}/email — the one-tap "Email Invoice"
button backing the new Subscription UX. The endpoint must:
  * 400 (clean, not 500) when the owner has no email on file and no `to` given
  * 400 when the explicit `to` is not a valid email
  * 400 when SMTP is not configured in this env (even with a valid `to`)
  * 403 when another user tries to email someone else's invoice
  * Regression: owner can still download the PDF (iteration_221 fix intact)
"""
import os
import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or
            frontend_env.get("REACT_APP_BACKEND_URL") or
            "http://localhost:8001").rstrip("/")

OWNER_PHONE = "+919000000004"       # Priya Verma (customer, owner, NO email on file)
PARTNER_PHONE = "+919000000003"     # Raj Kumar (partner, different user)
OTP = "123456"
SERVICE_ID = "svc-maid-fulltime"


def _login(phone):
    r = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=30)
    assert r.status_code == 200, f"send-otp {phone}: {r.status_code} {r.text}"
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp",
                      json={"phone": phone, "otp": OTP}, timeout=30)
    assert r.status_code == 200, f"verify-otp {phone}: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token: {r.json()}"
    return tok


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def owner_token():
    return _login(OWNER_PHONE)


@pytest.fixture(scope="module")
def partner_token():
    return _login(PARTNER_PHONE)


@pytest.fixture(scope="module")
def owner_me(owner_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_auth(owner_token), timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def owner_no_email(owner_me):
    """Ensure Priya has NO email on file for the 'no_email' 400 test — scrub it directly
    in Mongo if present (restored by seed next run; required by test contract)."""
    me = owner_me.get("user") or owner_me
    email = me.get("email")
    if email:
        # scrub via admin? simplest: direct Mongo
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
        if mongo_url and db_name:
            async def _scrub():
                c = AsyncIOMotorClient(mongo_url)
                await c[db_name].users.update_one(
                    {"phone": OWNER_PHONE}, {"$unset": {"email": ""}})
                c.close()
            asyncio.get_event_loop().run_until_complete(_scrub())
    return True


@pytest.fixture(scope="module")
def invoice_id(owner_token, owner_me, owner_no_email):
    """Create maid-fulltime weekly subscription, activate via mock pay, resolve invoice_id."""
    me = owner_me.get("user") or owner_me
    addrs = me.get("addresses") or owner_me.get("addresses") or []
    if not addrs:
        r = requests.get(f"{BASE_URL}/api/addresses", headers=_auth(owner_token), timeout=30)
        if r.status_code == 200:
            j = r.json()
            addrs = j if isinstance(j, list) else j.get("addresses", [])
    assert addrs, f"owner has no addresses; me={owner_me}"
    addr_id = addrs[0].get("id") or addrs[0].get("_id") or addrs[0].get("address_id")

    sub_payload = {
        "service_id": SERVICE_ID,
        "plan_type": "weekly",
        "address_id": addr_id,
        "start_date": "2026-03-01",
        "preferred_time": "09:00",
    }
    r = requests.post(f"{BASE_URL}/api/subscriptions", json=sub_payload,
                      headers=_auth(owner_token), timeout=30)
    assert r.status_code in (200, 201), f"create sub: {r.status_code} {r.text}"
    sub = r.json()
    sub_id = sub.get("id") or sub.get("subscription_id")
    assert sub_id, f"no sub id: {sub}"

    r = requests.post(f"{BASE_URL}/api/subscriptions/{sub_id}/pay/mock",
                      headers=_auth(owner_token), timeout=30)
    assert r.status_code in (200, 201), f"mock pay: {r.status_code} {r.text}"

    r = requests.get(f"{BASE_URL}/api/subscriptions/{sub_id}/invoice",
                     headers=_auth(owner_token), timeout=30)
    assert r.status_code == 200, f"get invoice: {r.status_code} {r.text}"
    inv_id = r.json().get("invoice_id")
    assert inv_id, f"no invoice_id: {r.json()}"
    return inv_id


class TestInvoiceEmailEndpoint:

    def test_email_no_to_no_email_on_file_returns_400(self, owner_token, invoice_id):
        """No 'to' in body + customer has no email on file → clean 400, not 500."""
        r = requests.post(f"{BASE_URL}/api/invoices/{invoice_id}/email",
                          json={}, headers=_auth(owner_token), timeout=30)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:300]}"
        detail = (r.json().get("detail") or "").lower()
        # Hinglish detail: "Koi email address nahi mila" — look for 'email' keyword
        assert "email" in detail, f"detail should mention email, got: {detail}"

    def test_email_invalid_to_returns_400(self, owner_token, invoice_id):
        r = requests.post(f"{BASE_URL}/api/invoices/{invoice_id}/email",
                          json={"to": "notanemail"},
                          headers=_auth(owner_token), timeout=30)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:300]}"
        detail = (r.json().get("detail") or "").lower()
        assert "valid email" in detail, f"expected 'valid email' hint, got: {detail}"

    def test_email_valid_to_smtp_not_configured_returns_400(self, owner_token, invoice_id):
        """SMTP not configured in this env → clean 400 (never 500/unhandled)."""
        r = requests.post(f"{BASE_URL}/api/invoices/{invoice_id}/email",
                          json={"to": "test@example.com"},
                          headers=_auth(owner_token), timeout=30)
        # Must be 400 (never 500). Hinglish message mentions configured/Integrations/SendGrid/SMTP.
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:300]}"
        detail = (r.json().get("detail") or "").lower()
        assert any(k in detail for k in ("configured", "sendgrid", "smtp", "integrations")), \
            f"expected 'email not configured' hint, got: {detail}"
        # And definitely not a 500 crash
        assert r.status_code != 500

    def test_email_ownership_partner_forbidden(self, partner_token, invoice_id):
        """A different user (partner) emailing a customer's invoice → 403 Not allowed."""
        r = requests.post(f"{BASE_URL}/api/invoices/{invoice_id}/email",
                          json={"to": "test@example.com"},
                          headers=_auth(partner_token), timeout=30)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text[:300]}"

    def test_pdf_download_regression_owner_still_works(self, owner_token, invoice_id):
        """Regression: iteration_221 PDF download must still work."""
        r = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}/pdf",
                         headers=_auth(owner_token), timeout=30)
        assert r.status_code == 200, f"PDF status {r.status_code}: {r.text[:200]}"
        assert "application/pdf" in r.headers.get("Content-Type", "").lower()
        assert r.content[:4] == b"%PDF", f"magic bytes: {r.content[:8]!r}"
        assert len(r.content) > 500
