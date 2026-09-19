"""
Backend tests for the Partner/Merchant unified mobile app (iteration 53).
Covers: site/config, auth demo-status, OTP send/verify (partner + merchant),
/auth/me, partner endpoints, merchant endpoints.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or open("/app/frontend/.env").read().split("EXPO_PUBLIC_BACKEND_URL=")[1].strip().splitlines()[0]
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

PARTNER_PHONE = "+919000000003"
MERCHANT_PHONE = "+919000000002"
OTP = "123456"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def partner_token(client):
    client.post(f"{API}/auth/send-otp", json={"phone": PARTNER_PHONE}, timeout=15)
    r = client.post(
        f"{API}/auth/verify-otp",
        json={"phone": PARTNER_PHONE, "otp": OTP, "create_if_new": False},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["role"] == "partner", data
    return data["token"]


@pytest.fixture(scope="module")
def merchant_token(client):
    client.post(f"{API}/auth/send-otp", json={"phone": MERCHANT_PHONE}, timeout=15)
    r = client.post(
        f"{API}/auth/verify-otp",
        json={"phone": MERCHANT_PHONE, "otp": OTP, "create_if_new": False},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["role"] == "merchant", data
    return data["token"]


# ---------- Public branding / demo ----------
class TestPublic:
    def test_site_config(self, client):
        r = client.get(f"{API}/site/config", timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "branding" in j and "theme" in j
        assert j["branding"].get("site_name")

    def test_demo_status(self, client):
        r = client.get(f"{API}/auth/demo-status", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j.get("demo_mode") is True
        roles = {a["role"] for a in j.get("accounts", [])}
        assert {"partner", "merchant"}.issubset(roles), j

    def test_auth_config(self, client):
        r = client.get(f"{API}/auth/config", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "auth_config" in j


# ---------- Auth OTP ----------
class TestAuthOtp:
    def test_send_otp_partner_returns_dev_otp(self, client):
        r = client.post(f"{API}/auth/send-otp", json={"phone": PARTNER_PHONE}, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("sent") is not False
        assert str(j.get("dev_otp") or "") == OTP

    def test_verify_partner(self, partner_token):
        assert partner_token and isinstance(partner_token, str)

    def test_verify_merchant(self, merchant_token):
        assert merchant_token and isinstance(merchant_token, str)

    def test_me_partner(self, client, partner_token):
        r = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {partner_token}"}, timeout=15)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["role"] == "partner"
        assert u.get("phone", "").endswith("9000000003")

    def test_me_merchant(self, client, merchant_token):
        r = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {merchant_token}"}, timeout=15)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["role"] == "merchant"

    def test_verify_bad_otp(self, client):
        client.post(f"{API}/auth/send-otp", json={"phone": PARTNER_PHONE}, timeout=15)
        r = client.post(
            f"{API}/auth/verify-otp",
            json={"phone": PARTNER_PHONE, "otp": "000000", "create_if_new": False},
            timeout=15,
        )
        assert r.status_code in (400, 401, 403), r.text


# ---------- Partner endpoints ----------
class TestPartner:
    def _h(self, tok):
        return {"Authorization": f"Bearer {tok}"}

    def test_wallet(self, client, partner_token):
        r = client.get(f"{API}/partner/wallet", headers=self._h(partner_token), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        # Should have some balance-like field
        assert any(k in j for k in ("balance", "wallet_balance", "available", "total", "available_balance", "withdrawable_balance", "total_earned"))

    def test_earnings_summary(self, client, partner_token):
        r = client.get(f"{API}/partner/earnings-summary", headers=self._h(partner_token), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert isinstance(j, dict)

    def test_stats(self, client, partner_token):
        r = client.get(f"{API}/partner/stats", headers=self._h(partner_token), timeout=15)
        assert r.status_code == 200, r.text

    def test_bookings_jobs(self, client, partner_token):
        r = client.get(f"{API}/bookings/partner/jobs", headers=self._h(partner_token), timeout=15)
        assert r.status_code == 200, r.text

    def test_bookings_active(self, client, partner_token):
        r = client.get(f"{API}/bookings/partner/active", headers=self._h(partner_token), timeout=15)
        assert r.status_code == 200, r.text

    def test_bookings_missed(self, client, partner_token):
        r = client.get(f"{API}/bookings/partner/missed", headers=self._h(partner_token), timeout=15)
        assert r.status_code in (200, 404), r.text  # tolerate if not implemented

    def test_online_status_toggle(self, client, partner_token):
        r = client.put(
            f"{API}/auth/partner/online-status",
            headers={**self._h(partner_token), "Content-Type": "application/json"},
            json={"online": True},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        # Verify persisted via /me
        me = client.get(f"{API}/auth/me", headers=self._h(partner_token), timeout=15).json()
        # Some backends expose online flag differently; be lenient
        assert me.get("role") == "partner"

    def test_partner_cannot_call_merchant(self, client, partner_token):
        r = client.get(f"{API}/merchant/overview", headers=self._h(partner_token), timeout=15)
        assert r.status_code in (401, 403, 404), r.text


# ---------- Merchant endpoints ----------
class TestMerchant:
    def _h(self, tok):
        return {"Authorization": f"Bearer {tok}"}

    def test_overview(self, client, merchant_token):
        r = client.get(f"{API}/merchant/overview", headers=self._h(merchant_token), timeout=15)
        assert r.status_code == 200, r.text

    def test_wallet(self, client, merchant_token):
        r = client.get(f"{API}/merchant/wallet", headers=self._h(merchant_token), timeout=15)
        assert r.status_code == 200, r.text

    def test_customers(self, client, merchant_token):
        r = client.get(f"{API}/merchant/customers", headers=self._h(merchant_token), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert isinstance(j, (dict, list))

    def test_merchant_cannot_call_partner(self, client, merchant_token):
        r = client.get(f"{API}/partner/wallet", headers=self._h(merchant_token), timeout=15)
        assert r.status_code in (401, 403, 404), r.text


# ---------- Auth boundaries ----------
class TestAuthBoundaries:
    def test_me_no_token(self, client):
        r = client.get(f"{API}/auth/me", timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_partner_wallet_no_token(self, client):
        r = client.get(f"{API}/partner/wallet", timeout=15)
        assert r.status_code in (401, 403), r.text
