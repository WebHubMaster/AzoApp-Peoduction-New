"""Backend regression for Iter246:
- Merchant registration DOB future rejection + past accepted
- Merchant referral customer detail returns cancellation_commission (customer 9811111111)
- Access-state after fresh registration = status incomplete / not approved (gating)
- Approved demo merchant +919000000002 is approved and can see referral customers
"""
import os
from datetime import date, timedelta
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://earnings-hub-209.preview.emergentagent.com").rstrip("/")


def _login(phone: str, create: bool = False, role: str = "merchant", name: str = "T"):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    s.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=15)
    body = {"phone": phone, "otp": "123456"}
    if create:
        body.update({"create_if_new": True, "role": role, "name": name})
    r = s.post(f"{BASE_URL}/api/auth/verify-otp", json=body, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("token")
    assert tok
    s.headers["Authorization"] = f"Bearer {tok}"
    return s, r.json().get("user", {})


# --- Approved merchant: referral customer detail ---
class TestApprovedMerchantReferral:
    @classmethod
    def setup_class(cls):
        cls.s, cls.user = _login("+919000000002")

    def test_role_merchant(self):
        assert self.user.get("role") == "merchant"

    def test_customer_detail_has_cancellation_commission(self):
        r = self.s.get(f"{BASE_URL}/api/merchant/referral/customers/9811111111", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "Ravi Kumar"
        rep = data["report"]
        assert rep["cancellation_commission"] == 6.0
        assert rep["cancellation_count"] == 1
        # services array must contain a cancelled booking with commission_type=cancellation
        cancelled = [s for s in data["services"] if s.get("commission_type") == "cancellation"]
        assert len(cancelled) == 1
        assert cancelled[0]["status"] == "cancelled"
        assert cancelled[0]["earned"] == 6.0


# --- New merchant: DOB validation + gating ---
class TestNewMerchantRegistration:
    @classmethod
    def setup_class(cls):
        # unique phone per test session day
        import time
        suffix = str(int(time.time()) % 100000).zfill(5)
        cls.phone = f"+9195550{suffix}"
        cls.s, _ = _login(cls.phone, create=True, role="merchant", name="PytestMerch")

    def test_reject_future_dob(self):
        future = (date.today() + timedelta(days=10)).isoformat()
        r = self.s.put(
            f"{BASE_URL}/api/merchant/registration/basic",
            json={"owner_name": "X", "email": "x@test.com", "dob": future},
            timeout=15,
        )
        assert r.status_code == 400, r.text
        assert "future" in r.text.lower()

    def test_accept_past_dob(self):
        r = self.s.put(
            f"{BASE_URL}/api/merchant/registration/basic",
            json={"owner_name": "X", "email": f"iter246_{self.phone[-5:]}@test.com", "dob": "1990-05-20"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["profile"]["basic"]["dob"] == "1990-05-20"

    def test_access_state_not_approved(self):
        r = self.s.get(f"{BASE_URL}/api/merchant/registration/access-state", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("approved") is False
        assert d.get("status") in ("incomplete", "submitted", "under_review", "rejected")


# --- Regression: partner login role ---
class TestPartnerRegression:
    def test_partner_login_role(self):
        _, user = _login("+919000000003")
        assert user.get("role") == "partner"
