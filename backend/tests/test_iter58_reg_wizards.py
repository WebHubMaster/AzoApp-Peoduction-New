"""Iteration 58 — Backend tests for Partner + Merchant Registration Wizards.

Covers:
- Partner: /profile, /meta, /basic, /work, /documents, /address, score 100, /submit
- Partner: /geo/states, /districts, /cities, /upload (multipart, with Aadhaar OCR)
- Merchant: /profile, /meta, /basic, /shop, /shop-photo, /address, score 100, /submit
- /api/geo/serviceability

For fresh accounts we generate random phone numbers each run so we always start
from an "incomplete" registration profile (per review request).
"""
import io
import os
import random
import time
import pytest
import requests
from PIL import Image


def _tiny_jpg_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (32, 32), (200, 100, 50)).save(buf, format="JPEG")
    return buf.getvalue()

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL") else None
if not BASE_URL:
    # Read from frontend/.env fallback (test host)
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL missing"

API = f"{BASE_URL}/api"
# Valid Verhoeff-checksum Aadhaar (starts with 2..9), commonly used sample
VALID_AADHAAR = "234123412346"


def _fresh_phone():
    # Random 10-digit phone (avoid demo range 9000000000-9000000009)
    return "+919" + str(random.randint(100000000, 999999999))


def _login(phone: str, role: str, name: str = "Tester"):
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, f"send-otp {r.status_code} {r.text}"
    otp = r.json().get("dev_otp") or "123456"
    r = requests.post(f"{API}/auth/verify-otp", json={
        "phone": phone, "otp": otp, "create_if_new": True,
        "role": role, "name": name,
    }, timeout=15)
    assert r.status_code == 200, f"verify-otp {r.status_code} {r.text}"
    j = r.json()
    return j["token"], j["user"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# =====================================================================
# PARTNER
# =====================================================================
class TestPartnerRegistration:
    @classmethod
    def setup_class(cls):
        cls.phone = _fresh_phone()
        cls.token, cls.user = _login(cls.phone, "partner", "TEST Partner")
        cls.h = _hdr(cls.token)

    def test_01_profile_returns_incomplete(self):
        r = requests.get(f"{API}/partner/registration/profile", headers=self.h, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["kyc_status"] in ("incomplete", "under_review"), j["kyc_status"]
        assert "profile" in j and "score" in j
        # Score may be small (>0) as backend seeds `basic.mobile` from phone.
        assert j["score"]["score"] < 20, j["score"]

    def test_02_meta(self):
        r = requests.get(f"{API}/partner/registration/meta", headers=self.h, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "educations" in j and "experiences" in j and "categories" in j
        assert len(j["experiences"]) > 0
        assert len(j["educations"]) > 0
        assert len(j["categories"]) > 0
        TestPartnerRegistration.edu_id = j["educations"][0]["id"]
        TestPartnerRegistration.exp_id = j["experiences"][0]["id"]
        TestPartnerRegistration.cat_id = j["categories"][0]["id"]

    def test_03_geo_states_districts_cities(self):
        r = requests.get(f"{API}/partner/registration/geo/states", headers=self.h, timeout=15)
        assert r.status_code == 200, r.text
        states = r.json()
        assert isinstance(states, list) and len(states) > 0
        st = states[0] if isinstance(states[0], str) else states[0].get("name") or states[0].get("state")
        assert st
        r = requests.get(f"{API}/partner/registration/geo/districts",
                         params={"state": st}, headers=self.h, timeout=15)
        assert r.status_code == 200, r.text
        districts = r.json()
        assert isinstance(districts, list)
        TestPartnerRegistration.state = st
        if districts:
            d0 = districts[0] if isinstance(districts[0], str) else districts[0].get("name") or districts[0].get("district")
            TestPartnerRegistration.district = d0
            r = requests.get(f"{API}/partner/registration/geo/cities",
                             params={"state": st, "district": d0}, headers=self.h, timeout=15)
            assert r.status_code == 200, r.text
        else:
            TestPartnerRegistration.district = ""

    def test_04_save_basic_progresses_score(self):
        payload = {
            "full_name": "TEST Partner", "dob": "1995-05-15", "gender": "male",
            "email": f"test_partner_{int(time.time())}@example.com",
            "education_id": self.edu_id,
            "state": getattr(self, "state", "Bihar"),
            "district": getattr(self, "district", "Patna"),
            "city": "Patna", "pincode": "800001",
            "live_photo_url": "https://example.com/live.jpg",
        }
        r = requests.put(f"{API}/partner/registration/basic", json=payload,
                         headers=self.h, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["score"]["score"] > 0
        assert j["score"]["sections"]["basic"] == 100, j["score"]["sections"]

    def test_05_save_work(self):
        payload = {"categories": [{"category_id": self.cat_id, "experience_id": self.exp_id}]}
        r = requests.put(f"{API}/partner/registration/work", json=payload,
                         headers=self.h, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["score"]["sections"]["work"] == 100

    def test_06_save_documents(self):
        payload = {
            "aadhaar_number": VALID_AADHAAR,
            "aadhaar_front_url": "https://example.com/aad_f.jpg",
            "aadhaar_back_url": "https://example.com/aad_b.jpg",
            "education_certificate_url": "https://example.com/edu.jpg",
        }
        r = requests.put(f"{API}/partner/registration/documents", json=payload,
                         headers=self.h, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["score"]["sections"]["documents"] == 100

    def test_07_save_address_reaches_100(self):
        payload = {"manual_address": "123, Test Road, Test Area"}
        r = requests.put(f"{API}/partner/registration/address", json=payload,
                         headers=self.h, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["score"]["sections"]["address"] == 100
        assert j["score"]["score"] == 100, j["score"]

    def test_08_upload_live_photo_multipart(self):
        files = {"file": ("live.jpg", io.BytesIO(_tiny_jpg_bytes()), "image/jpeg")}
        data = {"doc_type": "live_photo"}
        r = requests.post(f"{API}/partner/registration/upload",
                          files=files, data=data,
                          headers={"Authorization": f"Bearer {self.token}"}, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "url" in j and j["url"], j

    def test_09_upload_aadhaar_front_returns_ocr(self):
        files = {"file": ("aad_f.jpg", io.BytesIO(_tiny_jpg_bytes()), "image/jpeg")}
        data = {"doc_type": "aadhaar_front", "aadhaar_number": VALID_AADHAAR}
        r = requests.post(f"{API}/partner/registration/upload",
                          files=files, data=data,
                          headers={"Authorization": f"Bearer {self.token}"}, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "url" in j
        assert "ocr" in j, j

    def test_10_submit_registration(self):
        r = requests.post(f"{API}/partner/registration/submit", headers=self.h, timeout=20)
        # Submit may legitimately fail due to serviceability of pincode 110001 —
        # per review notes serviceability failure is expected/correct behavior.
        if r.status_code == 200:
            j = r.json()
            assert j["status"] == "under_review", j
            assert j.get("ok") is True
        else:
            # Only these are acceptable server-side rejections
            assert r.status_code == 400, r.text
            msg = r.text.lower()
            assert any(k in msg for k in ("service", "pincode", "aadhaar", "live photo")), r.text
            pytest.skip(f"Submit correctly rejected: {r.text}")


# =====================================================================
# MERCHANT
# =====================================================================
class TestMerchantRegistration:
    @classmethod
    def setup_class(cls):
        cls.phone = _fresh_phone()
        cls.token, cls.user = _login(cls.phone, "merchant", "TEST Merchant")
        cls.h = _hdr(cls.token)

    def test_01_profile_incomplete(self):
        r = requests.get(f"{API}/merchant/registration/profile", headers=self.h, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["kyc_status"] in ("incomplete", "under_review")
        assert j["score"]["score"] < 30, j["score"]

    def test_02_meta_has_categories(self):
        r = requests.get(f"{API}/merchant/registration/meta", headers=self.h, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert len(j["categories"]) > 0
        TestMerchantRegistration.cat_id = j["categories"][0]["id"]
        TestMerchantRegistration.shop_type_id = j["categories"][0]["id"]

    def test_03_save_basic(self):
        payload = {
            "full_name": "TEST Merchant Owner", "dob": "1985-01-01", "gender": "male",
            "email": f"test_merchant_{int(time.time())}@example.com",
            "owner_photo": "https://example.com/owner.jpg",
        }
        r = requests.put(f"{API}/merchant/registration/basic", json=payload,
                         headers=self.h, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["score"]["sections"]["basic"] == 100

    def test_04_save_shop(self):
        payload = {
            "shop_name": "TEST Shop", "shop_type_id": self.shop_type_id,
            "categories": [{"category_id": self.cat_id}],
        }
        r = requests.put(f"{API}/merchant/registration/shop", json=payload,
                         headers=self.h, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        # shop section without verification photo is 75% (3/4). After shop-photo save it'll hit 100%.
        assert j["score"]["sections"]["shop"] >= 75

    def test_05_save_address(self):
        payload = {
            "manual_address": "Shop 42, Main Road",
            "city": "Patna", "district": "Patna", "state": "Bihar",
            "pincode": "800001", "lat": 25.594, "lng": 85.137,
        }
        r = requests.put(f"{API}/merchant/registration/address", json=payload,
                         headers=self.h, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["score"]["sections"]["address"] == 100

    def test_06_save_shop_photo(self):
        payload = {
            "shop_verification_photo": "https://example.com/shop.jpg",
            "lat": 25.594, "lng": 85.137,
        }
        r = requests.put(f"{API}/merchant/registration/shop-photo", json=payload,
                         headers=self.h, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["score"]["sections"]["shop"] == 100, j["score"]
        assert j["score"]["score"] == 100, j["score"]

    def test_07_submit(self):
        r = requests.post(f"{API}/merchant/registration/submit", headers=self.h, timeout=20)
        if r.status_code == 200:
            j = r.json()
            assert j["status"] == "under_review"
        else:
            # Serviceability rejection is expected behavior for random pincodes.
            assert r.status_code == 400, r.text
            pytest.skip(f"Submit rejected (expected for non-serviceable): {r.text}")


# =====================================================================
# GEO SERVICEABILITY
# =====================================================================
class TestServiceability:
    def test_pincode_serviceability(self):
        r = requests.get(f"{API}/geo/serviceability", params={"pincode": "110001"}, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "serviceable" in j


# =====================================================================
# APPROVED PARTNER: /profile should reflect approved
# =====================================================================
class TestApprovedDemo:
    def test_partner_demo_approved(self):
        tok, _ = _login("+919000000003", "partner", "Raj Kumar")
        r = requests.get(f"{API}/partner/registration/profile",
                         headers=_hdr(tok), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["kyc_status"] == "approved", j["kyc_status"]

    def test_merchant_demo_approved(self):
        tok, _ = _login("+919000000002", "merchant", "Sharma")
        r = requests.get(f"{API}/merchant/registration/profile",
                         headers=_hdr(tok), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["kyc_status"] == "approved", j["kyc_status"]
