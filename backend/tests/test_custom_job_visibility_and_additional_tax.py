"""
Backend tests for:
  Feature 1: Custom-Job service visibility (all vs requester_only)
  Feature 2: Additional-work tax recompute (parts no GST/no commission;
             labour -> commission; GST only on commission)
Requires backend running at REACT_APP_BACKEND_URL / EXPO_PUBLIC_BACKEND_URL.
"""
import os
import sys
import asyncio
import pytest
import requests

BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "https://partner-app-upgrade.preview.emergentagent.com"
).rstrip("/")

API = f"{BASE_URL}/api"
OTP = "123456"

ADMIN_PHONE = "+919000000000"
REQ_PHONE = "+919000000777"
OTHER_PHONE = "+919000000888"


# ------------------------------- helpers --------------------------------- #
def _login(phone: str, role: str, name: str) -> str:
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=20)
    assert r.status_code == 200, f"send-otp failed {r.status_code} {r.text}"
    otp = r.json().get("dev_otp") or OTP
    r = requests.post(
        f"{API}/auth/verify-otp",
        json={"phone": phone, "otp": otp, "create_if_new": True, "role": role, "name": name},
        timeout=20,
    )
    assert r.status_code == 200, f"verify-otp failed {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token") or (data.get("user") or {}).get("token")
    assert tok, f"no token in verify response: {data}"
    return tok


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tokens():
    return {
        "admin": _login(ADMIN_PHONE, "admin", "Admin"),
        "req": _login(REQ_PHONE, "customer", "Requester"),
        "other": _login(OTHER_PHONE, "customer", "Other"),
    }


@pytest.fixture(scope="module")
def active_category():
    r = requests.get(f"{API}/catalog/categories", timeout=20)
    assert r.status_code == 200
    cats = r.json()
    assert isinstance(cats, list) and cats, "no active categories available"
    return cats[0]


@pytest.fixture(scope="module")
def custom_job(tokens, active_category):
    """Create + convert + activate a custom-job service. Returns job_id, service_id, category_id."""
    cat_id = active_category["id"]
    payload = {
        "full_name": "Test Requester",
        "category_id": cat_id,
        "work_name": "TEST CJR Work",
        "description": "Need help with this test custom job request",
        "expected_budget": 1500,
        "pincode": "800001",
        "city": "Patna",
        "state": "Bihar",
    }
    r = requests.post(f"{API}/custom-jobs", json=payload, headers=_hdr(tokens["req"]), timeout=20)
    assert r.status_code == 200, f"submit CJR failed: {r.status_code} {r.text}"
    job = r.json()
    job_id = job["id"]

    # convert as admin
    r = requests.post(f"{API}/custom-jobs/{job_id}/convert", headers=_hdr(tokens["admin"]), timeout=20)
    assert r.status_code == 200, f"convert failed: {r.status_code} {r.text}"
    conv = r.json()
    service_id = conv["service_id"]

    # activate service
    r = requests.put(
        f"{API}/catalog/services/{service_id}",
        json={"status": "active", "base_price": 999},
        headers=_hdr(tokens["admin"]),
        timeout=20,
    )
    assert r.status_code == 200, f"activate failed: {r.status_code} {r.text}"
    return {"job_id": job_id, "service_id": service_id, "category_id": cat_id}


# ------------------------------- Feature 1a: requester_only --------------- #
def _set_visibility(tokens, job_id, visibility, expect=200):
    r = requests.patch(
        f"{API}/custom-jobs/{job_id}/visibility",
        json={"visibility": visibility},
        headers=_hdr(tokens["admin"]),
        timeout=20,
    )
    assert r.status_code == expect, f"visibility {visibility} => {r.status_code} {r.text}"
    return r


class TestVisibilityRequesterOnly:
    def test_set_requester_only(self, tokens, custom_job):
        _set_visibility(tokens, custom_job["job_id"], "requester_only")

    def test_list_hidden_from_guest(self, custom_job):
        r = requests.get(f"{API}/catalog/services", params={"category_id": custom_job["category_id"]}, timeout=20)
        assert r.status_code == 200
        ids = [s["id"] for s in r.json()]
        assert custom_job["service_id"] not in ids, "requester_only service should NOT be visible to guest"

    def test_list_hidden_from_other_customer(self, tokens, custom_job):
        r = requests.get(
            f"{API}/catalog/services",
            params={"category_id": custom_job["category_id"]},
            headers=_hdr(tokens["other"]), timeout=20,
        )
        assert r.status_code == 200
        ids = [s["id"] for s in r.json()]
        assert custom_job["service_id"] not in ids, "requester_only service should NOT show to other customer"

    def test_list_visible_to_requester(self, tokens, custom_job):
        r = requests.get(
            f"{API}/catalog/services",
            params={"category_id": custom_job["category_id"]},
            headers=_hdr(tokens["req"]), timeout=20,
        )
        assert r.status_code == 200
        ids = [s["id"] for s in r.json()]
        assert custom_job["service_id"] in ids, "requester_only service should be visible to requester"

    def test_detail_guest_404(self, custom_job):
        r = requests.get(f"{API}/catalog/services/{custom_job['service_id']}", timeout=20)
        assert r.status_code == 404

    def test_detail_other_404(self, tokens, custom_job):
        r = requests.get(
            f"{API}/catalog/services/{custom_job['service_id']}",
            headers=_hdr(tokens["other"]), timeout=20,
        )
        assert r.status_code == 404

    def test_detail_requester_200(self, tokens, custom_job):
        r = requests.get(
            f"{API}/catalog/services/{custom_job['service_id']}",
            headers=_hdr(tokens["req"]), timeout=20,
        )
        assert r.status_code == 200
        assert r.json()["id"] == custom_job["service_id"]


# ------------------------------- Feature 1b: all ------------------------- #
class TestVisibilityAll:
    def test_set_all(self, tokens, custom_job):
        _set_visibility(tokens, custom_job["job_id"], "all")

    def test_list_visible_to_guest(self, custom_job):
        r = requests.get(f"{API}/catalog/services", params={"category_id": custom_job["category_id"]}, timeout=20)
        assert r.status_code == 200
        assert custom_job["service_id"] in [s["id"] for s in r.json()]

    def test_list_visible_to_other(self, tokens, custom_job):
        r = requests.get(
            f"{API}/catalog/services",
            params={"category_id": custom_job["category_id"]},
            headers=_hdr(tokens["other"]), timeout=20,
        )
        assert r.status_code == 200
        assert custom_job["service_id"] in [s["id"] for s in r.json()]

    def test_detail_guest_200(self, custom_job):
        r = requests.get(f"{API}/catalog/services/{custom_job['service_id']}", timeout=20)
        assert r.status_code == 200

    def test_detail_other_200(self, tokens, custom_job):
        r = requests.get(
            f"{API}/catalog/services/{custom_job['service_id']}",
            headers=_hdr(tokens["other"]), timeout=20,
        )
        assert r.status_code == 200


# ------------------------------- Feature 1c: validation / auth ------------ #
class TestVisibilityValidation:
    def test_invalid_value_400(self, tokens, custom_job):
        r = requests.patch(
            f"{API}/custom-jobs/{custom_job['job_id']}/visibility",
            json={"visibility": "foo"},
            headers=_hdr(tokens["admin"]), timeout=20,
        )
        assert r.status_code == 400, f"expected 400 for invalid value, got {r.status_code} {r.text}"

    def test_non_admin_visibility_403(self, tokens, custom_job):
        r = requests.patch(
            f"{API}/custom-jobs/{custom_job['job_id']}/visibility",
            json={"visibility": "all"},
            headers=_hdr(tokens["req"]), timeout=20,
        )
        assert r.status_code == 403

    def test_non_admin_convert_403(self, tokens, custom_job):
        r = requests.post(
            f"{API}/custom-jobs/{custom_job['job_id']}/convert",
            headers=_hdr(tokens["req"]), timeout=20,
        )
        assert r.status_code == 403


# ------------------------------- Feature 2: additional-work tax ----------- #
# This directly imports the async function and runs it with crafted bookings.

sys.path.insert(0, "/app/backend")


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if False else asyncio.new_event_loop().run_until_complete(coro)


class TestAdditionalTax:
    def _call(self, items):
        from controllers.booking_controller import _recompute_additional
        booking = {"additional": {"items": items}, "commission_config": {}}
        # settings dict used; CommissionEngine._cm will fall back to defaults
        settings = {"gst_pct": 18, "platform_commission_pct": 32,
                    "partner_commission_pct": 68, "merchant_referral_pct": 0,
                    "merchant_booking_pct": 0, "referral_base": "platform"}
        return asyncio.new_event_loop().run_until_complete(_recompute_additional(booking, settings))

    def test_parts_and_labour(self):
        """parts=500, labour=1000 → commission 320, gst 57.6, total 1557.6,
        partner_earning 1180, platform_earning 377.6."""
        addl = self._call([{"part_charge": 500, "labour_charge": 1000}])
        assert addl["parts_total"] == 500
        assert addl["labour_total"] == 1000
        assert addl["commission"] == 320
        assert addl["gst"] == 57.6
        assert addl["total"] == 1557.6
        assert addl["partner_earning"] == 1180
        assert addl["platform_earning"] == 377.6

    def test_product_only(self):
        """part=800, labour=0 → gst 0, commission 0, partner_earning 800, total 800."""
        addl = self._call([{"part_charge": 800, "labour_charge": 0}])
        assert addl["parts_total"] == 800
        assert addl["labour_total"] == 0
        assert addl["commission"] == 0
        assert addl["gst"] == 0
        assert addl["total"] == 800
        assert addl["partner_earning"] == 800
        assert addl["platform_earning"] == 0

    def test_labour_only(self):
        """part=0, labour=500 → commission 160, gst 28.8, total 528.8, partner 340."""
        addl = self._call([{"part_charge": 0, "labour_charge": 500}])
        assert addl["parts_total"] == 0
        assert addl["labour_total"] == 500
        assert addl["commission"] == 160
        assert addl["gst"] == 28.8
        assert addl["total"] == 528.8
        assert addl["partner_earning"] == 340  # 0 + (500-160)
        assert addl["platform_earning"] == 188.8  # 160+28.8

    def test_multi_items_sum(self):
        """Two items — totals aggregate correctly."""
        addl = self._call([
            {"part_charge": 500, "labour_charge": 1000},
            {"part_charge": 800, "labour_charge": 0},
        ])
        assert addl["parts_total"] == 1300
        assert addl["labour_total"] == 1000
        assert addl["commission"] == 320
        assert addl["gst"] == 57.6
        assert addl["total"] == 2357.6  # 1300+1000+57.6
        assert addl["partner_earning"] == 1980  # 1300 + (1000-320)
        assert addl["platform_earning"] == 377.6
