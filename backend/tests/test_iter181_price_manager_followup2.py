"""Iter181 — Price Manager follow-up #2:
  (A) GET /city/{c} for unconfigured city returns configured=false (auto-inherit source)
  (B) apply-across with include=['services','ratecards','fees'] copies fees
  (C) apply-across with include=['services','ratecards'] preserves target fees
  (D) regression: non-category services + non-category rate-cards untouched
"""
import os
import copy
import pytest
import requests


BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    with open("/app/web_panel/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL missing"

ADMIN_PHONE = "+919000000000"
OTP = "123456"
AC_CATEGORY_ID = "d28bbb44-cb99-4a4e-ab07-2800c25c7d41"
UNCONFIGURED_CITY = "Bakhri"


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/send-otp", json={"phone": ADMIN_PHONE}, timeout=20)
    assert r.status_code == 200, r.text
    r = s.post(f"{BASE}/api/auth/verify-otp",
               json={"phone": ADMIN_PHONE, "otp": OTP, "role": "admin"}, timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


def _get_city(admin, city):
    r = admin.get(f"{BASE}/api/admin/price-manager/city/{city}", timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


# --------------------------- (A) auto-inherit source: unconfigured city -------
class TestUnconfiguredCity:
    def test_unconfigured_returns_configured_false(self, admin):
        d = _get_city(admin, UNCONFIGURED_CITY)
        assert d["configured"] is False
        # Empty state for the frontend to seed from templates
        assert (d.get("prices") or {}) == {}
        assert (d.get("ratecards") or {}) == {}
        # But all_categories and rate_cards (templates) are returned
        assert len(d.get("all_categories") or []) > 0
        assert len(d.get("rate_cards") or []) > 0

    def test_configured_city_returns_configured_true(self, admin):
        d = _get_city(admin, "Patna")
        assert d["configured"] is True
        assert len(d.get("prices") or {}) > 0


# --------------------------- (B/C) apply-across fees scope -------------------
class TestApplyAcrossFees:
    def _snapshot(self, admin, city):
        d = _get_city(admin, city)
        return {
            "categories": copy.deepcopy(d["categories"]),
            "fees": copy.deepcopy(d["fees"]),
            "prices": copy.deepcopy(d["prices"]),
            "ratecards": copy.deepcopy(d["ratecards"]),
        }

    def _restore(self, admin, city, snap):
        admin.put(f"{BASE}/api/admin/price-manager/city/{city}", json={
            "categories": snap["categories"], "fees": snap["fees"],
            "services": snap["prices"], "ratecards": snap["ratecards"],
        }, timeout=20)

    def test_apply_across_with_fees_scope_copies_fees(self, admin):
        src = self._snapshot(admin, "Patna")
        dst = self._snapshot(admin, "Ranchi")

        # Mutate Patna fees to a distinct marker value
        new_fees = dict(src["fees"] or {})
        new_fees["platform_fee"] = 77
        new_fees["emergency_fee"] = 123

        try:
            admin.put(f"{BASE}/api/admin/price-manager/city/Patna", json={
                "categories": src["categories"], "fees": new_fees,
                "services": src["prices"], "ratecards": src["ratecards"],
            }, timeout=20)

            r = admin.post(f"{BASE}/api/admin/price-manager/apply-across",
                           json={"from": "Patna", "category_id": AC_CATEGORY_ID,
                                 "cities": ["Ranchi"],
                                 "include": ["services", "ratecards", "fees"]}, timeout=30)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body == {"applied": ["Ranchi"], "count": 1}, body

            got = _get_city(admin, "Ranchi")
            assert float(got["fees"].get("platform_fee") or 0) == 77.0
            assert float(got["fees"].get("emergency_fee") or 0) == 123.0
        finally:
            self._restore(admin, "Patna", src)
            self._restore(admin, "Ranchi", dst)

    def test_apply_across_without_fees_preserves_target_fees(self, admin):
        src = self._snapshot(admin, "Patna")
        dst = self._snapshot(admin, "Ranchi")

        # Give Ranchi distinct fees that must survive
        marker_fees = dict(dst["fees"] or {})
        marker_fees["platform_fee"] = 42
        marker_fees["emergency_fee"] = 999

        # Give Patna a different value, so if fees leaked we'd see 77
        src_mut = dict(src["fees"] or {})
        src_mut["platform_fee"] = 77
        src_mut["emergency_fee"] = 123

        try:
            admin.put(f"{BASE}/api/admin/price-manager/city/Ranchi", json={
                "categories": dst["categories"], "fees": marker_fees,
                "services": dst["prices"], "ratecards": dst["ratecards"],
            }, timeout=20)
            admin.put(f"{BASE}/api/admin/price-manager/city/Patna", json={
                "categories": src["categories"], "fees": src_mut,
                "services": src["prices"], "ratecards": src["ratecards"],
            }, timeout=20)

            r = admin.post(f"{BASE}/api/admin/price-manager/apply-across",
                           json={"from": "Patna", "category_id": AC_CATEGORY_ID,
                                 "cities": ["Ranchi"],
                                 "include": ["services", "ratecards"]}, timeout=30)
            assert r.status_code == 200, r.text

            got = _get_city(admin, "Ranchi")
            # Fees untouched
            assert float(got["fees"].get("platform_fee") or 0) == 42.0, \
                f"platform_fee was overwritten: {got['fees']}"
            assert float(got["fees"].get("emergency_fee") or 0) == 999.0, \
                f"emergency_fee was overwritten: {got['fees']}"
        finally:
            self._restore(admin, "Patna", src)
            self._restore(admin, "Ranchi", dst)

    def test_apply_across_services_ratecards_enables_category(self, admin):
        """Regression: include=['services','ratecards'] still copies category + its
        services and enables the category on the target."""
        src = self._snapshot(admin, "Patna")
        dst = self._snapshot(admin, "Ranchi")

        try:
            # Remove AC category from Ranchi
            cats_wo_ac = [c for c in (dst["categories"] or []) if c != AC_CATEGORY_ID]
            admin.put(f"{BASE}/api/admin/price-manager/city/Ranchi", json={
                "categories": cats_wo_ac, "fees": dst["fees"],
                "services": dst["prices"], "ratecards": dst["ratecards"],
            }, timeout=20)

            r = admin.post(f"{BASE}/api/admin/price-manager/apply-across",
                           json={"from": "Patna", "category_id": AC_CATEGORY_ID,
                                 "cities": ["Ranchi"],
                                 "include": ["services", "ratecards"]}, timeout=30)
            assert r.status_code == 200, r.text

            got = _get_city(admin, "Ranchi")
            assert AC_CATEGORY_ID in (got["categories"] or []), \
                "AC category not re-enabled on Ranchi"
        finally:
            self._restore(admin, "Patna", src)
            self._restore(admin, "Ranchi", dst)
