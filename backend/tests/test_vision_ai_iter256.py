"""Iter 256 — Vision AI (OCR & Face Match) Integration Center + face-match reason tests.

Covers:
- POST /api/admin/integrations/vision-test (empty key / invalid key failure paths)
- POST /api/admin/bookings/{id}/face-match returns the new 'Vision AI not configured'
  reason + setup_required=True when no ocr_api_key is saved.
- Settings get/put so ocr_api_key stays empty (we never persist invalid keys).
"""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

from conftest import API  # type: ignore


_be_env = dotenv_values("/app/backend/.env")
MONGO_URL = os.environ.get("MONGO_URL") or _be_env.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or _be_env.get("DB_NAME")


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module", autouse=True)
def ensure_ocr_key_empty(admin, mongo):
    """Ensure ocr_api_key is empty before and after this module (we test failure paths)."""
    # Snapshot current
    doc = mongo.settings.find_one({}) or {}
    orig_key = doc.get("ocr_api_key", "")
    orig_enabled = doc.get("ocr_enabled")
    if orig_key:
        # Clear via API so we test real failure path. Preserve original at teardown.
        admin.put(f"{API}/admin/settings", json={"ocr_api_key": ""})
    yield
    if orig_key:
        admin.put(f"{API}/admin/settings", json={"ocr_api_key": orig_key})
    if orig_enabled is not None:
        admin.put(f"{API}/admin/settings", json={"ocr_enabled": orig_enabled})


# ---------- Vision AI /integrations/vision-test ----------
class TestVisionTest:
    def test_vision_test_no_key(self, admin):
        r = admin.post(f"{API}/admin/integrations/vision-test", json={})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is False
        assert "no api key" in (d.get("error") or "").lower()
        assert "model" in d

    def test_vision_test_bad_key(self, admin):
        r = admin.post(
            f"{API}/admin/integrations/vision-test",
            json={"ocr_provider": "gemini", "ocr_api_key": "bad-key-xyz"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is False
        assert d.get("error"), "expected provider error for invalid key"
        # make sure we did NOT persist the invalid key
        s = admin.get(f"{API}/admin/settings").json()
        assert (s.get("ocr_api_key") or "") == ""


# ---------- face-match endpoint ----------
class TestFaceMatchSetupRequired:
    @pytest.fixture(scope="class")
    def seeded_booking(self, mongo):
        """Seed a minimal booking with checkin.selfie_url for face-match test."""
        bid = f"TESTFM{uuid.uuid4().hex[:6].upper()}"
        pid = f"TEST_partner_{uuid.uuid4().hex[:6]}"
        mongo.users.insert_one({"id": pid, "name": "TEST partner", "role": "partner"})
        mongo.bookings.insert_one({
            "id": bid,
            "partner_id": pid,
            "checkin": {"selfie_url": "https://example.com/selfie.jpg"},
            "_seed_iter": "256",
        })
        yield bid
        mongo.bookings.delete_one({"id": bid})
        mongo.users.delete_one({"id": pid})

    def test_face_match_setup_required(self, admin, seeded_booking):
        r = admin.post(f"{API}/admin/bookings/{seeded_booking}/face-match")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("status") == "unverified"
        reason = (d.get("reason") or "").lower()
        assert ("not configured" in reason) or ("turned off" in reason), f"got: {d}"
        assert d.get("setup_required") is True

    def test_face_match_400_when_no_selfie(self, admin, mongo):
        bid = f"TESTNS{uuid.uuid4().hex[:6].upper()}"
        mongo.bookings.insert_one({"id": bid, "partner_id": "x", "_seed_iter": "256"})
        try:
            r = admin.post(f"{API}/admin/bookings/{bid}/face-match")
            assert r.status_code == 400
        finally:
            mongo.bookings.delete_one({"id": bid})


# ---------- Regression: other integrations endpoints still work ----------
class TestIntegrationsRegression:
    def test_integration_center_data_loads(self, admin):
        r = admin.get(f"{API}/admin/partner-reg/integration-center")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "integrations" in d

    def test_s3_test_endpoint_responds(self, admin):
        r = admin.post(f"{API}/admin/integrations/s3-test", json={})
        assert r.status_code == 200, r.text
        # don't care about ok True/False — just that it responds structurally
        assert isinstance(r.json(), dict)
