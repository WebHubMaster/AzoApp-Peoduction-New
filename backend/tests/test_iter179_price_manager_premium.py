"""Iter179 — Premium Price Manager backend tests.

Covers newly required fields + copy-with-include-scopes.
"""
import os
import copy
import pytest
import requests


BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    try:
        with open("/app/web_panel/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE = line.split("=", 1)[1].strip().rstrip("/")
    except FileNotFoundError:
        pass
assert BASE, "REACT_APP_BACKEND_URL missing"

ADMIN_PHONE = "+919000000000"
OTP = "123456"


def _pick_svc_id(prices):
    """Pick a service id that has a non-zero price."""
    for sid, sp in (prices or {}).items():
        if (sp or {}).get("price"):
            return sid
    return next(iter((prices or {}).keys()), None)


def _admin_session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/send-otp", json={"phone": ADMIN_PHONE}, timeout=20)
    assert r.status_code == 200, r.text
    r = s.post(f"{BASE}/api/auth/verify-otp", json={"phone": ADMIN_PHONE, "otp": OTP, "role": "admin"}, timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _admin_session()


# ---------------------------- cities list ----------------------------
class TestCitiesList:
    def test_cities_fields(self, admin):
        r = admin.get(f"{BASE}/api/admin/price-manager/cities", timeout=20)
        assert r.status_code == 200, r.text
        cities = r.json()
        assert isinstance(cities, list) and len(cities) >= 1

        required = {"city", "city_key", "configured", "status", "priced_services",
                    "total_services", "categories", "updated_at"}
        for c in cities:
            missing = required - set(c.keys())
            assert not missing, f"missing fields {missing} in {c}"

        by_key = {c["city_key"]: c for c in cities}
        assert "patna" in by_key and "ranchi" in by_key, by_key.keys()
        p, r_ = by_key["patna"], by_key["ranchi"]
        assert p["status"] == "active" and p["configured"] is True
        assert r_["status"] == "active" and r_["configured"] is True
        assert isinstance(p["priced_services"], int) and p["priced_services"] >= 1
        assert isinstance(p["total_services"], int) and p["total_services"] >= 1

    def test_cities_derived_from_active_areas_only(self, admin):
        # should not contain cities that only exist in city_pricing but have no active area
        r = admin.get(f"{BASE}/api/admin/price-manager/cities", timeout=20)
        keys = {c["city_key"] for c in r.json()}
        # TestCityIter178 was a copy target with no active service area -> must not leak
        assert "testcityiter178" not in keys, "non-area city leaked into cities list"


# ---------------------------- city payload ----------------------------
class TestGetCity:
    def test_city_payload_fields(self, admin):
        r = admin.get(f"{BASE}/api/admin/price-manager/city/Patna", timeout=20)
        assert r.status_code == 200
        d = r.json()
        for f in ("updated_at", "updated_by", "categories", "fees", "fee_defaults",
                  "prices", "ratecards", "all_categories", "all_services", "rate_cards"):
            assert f in d, f"missing {f}"
        assert isinstance(d["all_services"], list) and len(d["all_services"]) > 0
        assert isinstance(d["all_categories"], list)
        assert isinstance(d["rate_cards"], list)
        for rc in d["rate_cards"]:
            assert "category_id" in rc, f"rate card missing category_id: {rc}"
            assert "id" in rc and "title" in rc


# ---------------------------- PUT round-trip ----------------------------
class TestPutRoundTrip:
    def test_price_change_persists(self, admin):
        snap = admin.get(f"{BASE}/api/admin/price-manager/city/Patna", timeout=20).json()
        orig_prices = copy.deepcopy(snap["prices"])
        new_prices = copy.deepcopy(orig_prices)
        svc_id = _pick_svc_id(orig_prices)
        assert svc_id, "no priceable service"
        orig_fan_price = float(new_prices[svc_id].get("price") or 0)
        new_fan = round(orig_fan_price + 1.0, 2)
        new_prices[svc_id]["price"] = new_fan

        try:
            r = admin.put(
                f"{BASE}/api/admin/price-manager/city/Patna",
                json={
                    "categories": snap["categories"],
                    "fees": snap["fees"],
                    "services": new_prices,
                    "ratecards": snap["ratecards"],
                },
                timeout=20,
            )
            assert r.status_code == 200, r.text

            got = admin.get(f"{BASE}/api/admin/price-manager/city/Patna", timeout=20).json()
            persisted = float(got["prices"][svc_id].get("price") or 0)
            assert abs(persisted - new_fan) < 0.001, (persisted, new_fan)
            # Other services untouched
            for sid, sp in orig_prices.items():
                if sid == svc_id:
                    continue
                assert got["prices"].get(sid, {}).get("price") == sp.get("price"), f"corrupted {sid}"
        finally:
            # Restore
            admin.put(
                f"{BASE}/api/admin/price-manager/city/Patna",
                json={
                    "categories": snap["categories"],
                    "fees": snap["fees"],
                    "services": orig_prices,
                    "ratecards": snap["ratecards"],
                },
                timeout=20,
            )


# ---------------------------- Copy with include scopes ----------------------------
class TestCopyWithInclude:
    DEST = "Ranchi"

    def _get(self, admin, city):
        return admin.get(f"{BASE}/api/admin/price-manager/city/{city}", timeout=20).json()

    def test_full_copy_default_still_works(self, admin):
        # Just ensures no include = full copy. Use a throwaway dest derived from existing area if possible.
        # If no spare area, copy ranchi -> ranchi (idempotent).
        snap_before = self._get(admin, self.DEST)
        try:
            r = admin.post(f"{BASE}/api/admin/price-manager/copy",
                           json={"from": "Patna", "to": self.DEST, "adjust_pct": 0}, timeout=30)
            assert r.status_code == 200, r.text
            got = self._get(admin, self.DEST)
            # Fees should now equal Patna's fees
            src = self._get(admin, "Patna")
            assert got["fees"] == src["fees"]
        finally:
            # Restore ranchi
            admin.put(f"{BASE}/api/admin/price-manager/city/{self.DEST}", json={
                "categories": snap_before["categories"], "fees": snap_before["fees"],
                "services": snap_before["prices"], "ratecards": snap_before["ratecards"],
            }, timeout=20)

    def test_copy_services_only_does_not_overwrite_fees_or_ratecards(self, admin):
        src_snap = self._get(admin, "Patna")
        dst_snap = self._get(admin, self.DEST)
        # Make sure Ranchi fees differ from Patna
        if dst_snap["fees"] == src_snap["fees"]:
            # Force a difference
            modified_fees = dict(src_snap["fees"] or {})
            modified_fees["platform_fee"] = (float(modified_fees.get("platform_fee") or 0) or 10) + 5
            admin.put(f"{BASE}/api/admin/price-manager/city/{self.DEST}", json={
                "categories": dst_snap["categories"], "fees": modified_fees,
                "services": dst_snap["prices"], "ratecards": dst_snap["ratecards"],
            }, timeout=20)
            dst_snap = self._get(admin, self.DEST)

        orig_dst_fees = copy.deepcopy(dst_snap["fees"])
        orig_dst_rc = copy.deepcopy(dst_snap["ratecards"])

        try:
            r = admin.post(f"{BASE}/api/admin/price-manager/copy",
                           json={"from": "Patna", "to": self.DEST, "adjust_pct": 10,
                                 "include": ["services"]}, timeout=30)
            assert r.status_code == 200, r.text
            got = self._get(admin, self.DEST)
            # Fees preserved
            assert got["fees"] == orig_dst_fees, f"fees overwritten: {got['fees']} vs {orig_dst_fees}"
            # Ratecards preserved
            assert got["ratecards"] == orig_dst_rc, "ratecards overwritten with services-only include"
            # Fan price adjusted by +10% from Patna
            svc_id = _pick_svc_id(src_snap["prices"])
            src_fan = float(src_snap["prices"][svc_id]["price"])
            got_fan = float(got["prices"][svc_id]["price"])
            assert abs(got_fan - round(src_fan * 1.1, 2)) < 0.1, (src_fan, got_fan)
        finally:
            admin.put(f"{BASE}/api/admin/price-manager/city/{self.DEST}", json={
                "categories": dst_snap["categories"], "fees": dst_snap["fees"],
                "services": dst_snap["prices"], "ratecards": dst_snap["ratecards"],
            }, timeout=20)

    def test_copy_full_include_spec(self, admin):
        dst_snap = self._get(admin, self.DEST)
        try:
            r = admin.post(f"{BASE}/api/admin/price-manager/copy",
                           json={"from": "Patna", "to": self.DEST, "adjust_pct": 10,
                                 "include": ["services", "mrp", "addons", "fees", "ratecards", "categories"]},
                           timeout=30)
            assert r.status_code == 200, r.text
            got = self._get(admin, self.DEST)
            src = self._get(admin, "Patna")
            # fees equal patna
            assert got["fees"] == src["fees"]
            # fan +10%
            svc_id = _pick_svc_id(src["prices"])
            src_fan = float(src["prices"][svc_id]["price"])
            got_fan = float(got["prices"][svc_id]["price"])
            assert abs(got_fan - round(src_fan * 1.1, 2)) < 0.1
        finally:
            admin.put(f"{BASE}/api/admin/price-manager/city/{self.DEST}", json={
                "categories": dst_snap["categories"], "fees": dst_snap["fees"],
                "services": dst_snap["prices"], "ratecards": dst_snap["ratecards"],
            }, timeout=20)
