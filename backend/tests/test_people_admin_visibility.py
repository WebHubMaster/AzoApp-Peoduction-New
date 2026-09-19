"""Tests for #5 admin Person360 visibility of partner registration data + docs,
   and #6 partner self-view via /partner/registration/profile.
   Also regression: customer + merchant Person360 loads."""
import os
import pytest
import requests

def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    assert url, "REACT_APP_BACKEND_URL not found"
    return url.rstrip("/")


BASE_URL = _load_backend_url()

ADMIN_PHONE = "+919000000000"
PARTNER_PHONE = "+919000000003"  # Raj Kumar
CUSTOMER_PHONE = "+919000000004"
MERCHANT_PHONE = "+919000000002"
OTP = "123456"


def _login(phone):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    # send-otp (demo mode auto-issues)
    s.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone})
    r = s.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": phone, "otp": OTP})
    assert r.status_code == 200, f"login failed for {phone}: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"no token in login response for {phone}: {data}"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s, data.get("user") or {}


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN_PHONE)


@pytest.fixture(scope="module")
def partner():
    return _login(PARTNER_PHONE)


def _find_partner_uid(admin_session, phone_last10):
    r = admin_session.get(f"{BASE_URL}/api/admin/people/partner", params={"q": phone_last10, "page": 1, "page_size": 25})
    assert r.status_code == 200, r.text
    items = r.json().get("items", [])
    hit = next((i for i in items if (i.get("phone") or "").endswith(phone_last10)), None)
    assert hit, f"partner {phone_last10} not found in list; got {len(items)} items"
    return hit["id"]


# -------- #5 ADMIN visibility of partner registration data --------
class TestAdminPartnerProfileVisibility:
    def test_admin_login(self, admin):
        s, u = admin
        assert u.get("role") == "admin"

    def test_partner_overview_enriched_fields(self, admin):
        s, _ = admin
        uid = _find_partner_uid(s, "9000000003")
        r = s.get(f"{BASE_URL}/api/admin/people/partner/{uid}/overview")
        assert r.status_code == 200, r.text
        data = r.json()
        u = data.get("user") or {}
        # These come from partner_profiles.basic/work/address via _enrich_user_from_partner_profile
        assert u.get("name"), f"name blank; user={u}"
        assert u.get("email"), "email should be enriched from basic.email"
        assert u.get("dob"), "dob should be enriched"
        assert u.get("gender"), "gender should be enriched"
        assert u.get("city"), "city should be enriched"
        assert u.get("state"), "state should be enriched"
        assert u.get("education"), "education should be enriched"
        assert u.get("categories"), "categories list should be enriched"
        assert u.get("experience_display"), "experience_display should be enriched"
        assert u.get("address_text"), "address_text should be enriched"

    def test_partner_kyc_section_viewable_documents(self, admin):
        s, _ = admin
        uid = _find_partner_uid(s, "9000000003")
        r = s.get(f"{BASE_URL}/api/admin/people/partner/{uid}/sections/kyc")
        assert r.status_code == 200, r.text
        data = r.json()
        docs = data.get("viewable_documents") or []
        assert len(docs) >= 4, f"expected >=4 viewable documents, got {len(docs)}: {[d.get('label') for d in docs]}"
        labels = " ".join((d.get("label") or "").lower() for d in docs)
        assert "aadhaar" in labels and "front" in labels, f"missing Aadhaar Front: {labels}"
        assert "back" in labels, f"missing Aadhaar Back: {labels}"
        assert "education" in labels, f"missing Education Cert: {labels}"
        assert ("selfie" in labels or "photo" in labels or "live" in labels), f"missing Live Selfie: {labels}"
        for d in docs:
            assert d.get("url"), f"doc has no url: {d}"
            assert d.get("kind") in ("image", "pdf"), f"bad kind: {d}"


# -------- #6 PROVIDER self-view --------
class TestPartnerSelfView:
    def test_partner_login(self, partner):
        s, u = partner
        assert u.get("role") == "partner"

    def test_partner_registration_profile(self, partner):
        s, _ = partner
        r = s.get(f"{BASE_URL}/api/partner/registration/profile")
        assert r.status_code == 200, r.text
        data = r.json()
        p = data.get("profile") or {}
        b = p.get("basic") or {}
        w = p.get("work") or {}
        d = p.get("documents") or {}
        a = p.get("address") or {}
        assert b.get("full_name"), f"basic.full_name missing: {b}"
        assert b.get("dob"), "basic.dob missing"
        assert b.get("gender"), "basic.gender missing"
        assert b.get("education_name"), "basic.education_name missing"
        assert b.get("city") and b.get("state"), "basic city/state missing"
        assert (w.get("categories") or []), "work.categories missing"
        assert d.get("aadhaar_front_url"), "aadhaar_front_url missing in documents"
        assert d.get("aadhaar_back_url"), "aadhaar_back_url missing"
        assert d.get("education_certificate_url"), "education_certificate_url missing"
        assert (a.get("manual_address") or a.get("location_address")), "address text missing"


# -------- Regression: customer + merchant Person360 --------
class TestRegressionPerson360:
    def test_customer_overview(self, admin):
        s, _ = admin
        r = s.get(f"{BASE_URL}/api/admin/people/customer", params={"q": "9000000004", "page": 1, "page_size": 10})
        assert r.status_code == 200
        items = r.json().get("items", [])
        hit = next((i for i in items if (i.get("phone") or "").endswith("9000000004")), None)
        assert hit, "customer not found"
        r2 = s.get(f"{BASE_URL}/api/admin/people/customer/{hit['id']}/overview")
        assert r2.status_code == 200, r2.text

    def test_merchant_overview(self, admin):
        s, _ = admin
        r = s.get(f"{BASE_URL}/api/admin/people/merchant", params={"q": "9000000002", "page": 1, "page_size": 10})
        assert r.status_code == 200
        items = r.json().get("items", [])
        hit = next((i for i in items if (i.get("phone") or "").endswith("9000000002")), None)
        assert hit, "merchant not found"
        r2 = s.get(f"{BASE_URL}/api/admin/people/merchant/{hit['id']}/overview")
        assert r2.status_code == 200, r2.text
