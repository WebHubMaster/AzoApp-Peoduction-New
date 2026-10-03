"""Iter180 — apply-across + full rate_cards fields + copy include regression."""
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


class TestRateCardsFull:
    def test_rate_cards_full_fields(self, admin):
        d = _get_city(admin, "Patna")
        rcs = d.get("rate_cards") or []
        assert len(rcs) > 0, "no rate_cards returned"
        for rc in rcs:
            # top-level required fields
            for f in ("id", "title", "subtitle", "brand_label", "accent_color",
                      "intro", "footer_note", "status", "category_id",
                      "category_name", "groups"):
                assert f in rc, f"rate_card missing {f}: keys={list(rc.keys())}"
            assert isinstance(rc["groups"], list)
            for g in rc["groups"]:
                for gf in ("id", "name", "note", "rows"):
                    assert gf in g, f"group missing {gf}"
                for row in g["rows"]:
                    for rf in ("id", "description", "service_charge", "labour_charge",
                               "original_charge", "warranty", "note", "discount_pct"):
                        assert rf in row, f"row missing {rf}: {row}"

    def test_ac_category_rate_card_present(self, admin):
        d = _get_city(admin, "Patna")
        cats = {rc["category_id"] for rc in d["rate_cards"]}
        assert AC_CATEGORY_ID in cats, f"AC category rate card missing. have={cats}"


class TestApplyAcross:
    def _get(self, admin, city):
        return _get_city(admin, city)

    def _snapshot(self, admin, city):
        d = self._get(admin, city)
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

    def _ac_service_ids(self, admin):
        """Service ids belonging to AC category (via Patna all_services)."""
        d = _get_city(admin, "Patna")
        return [s["id"] for s in d["all_services"] if s.get("category_id") == AC_CATEGORY_ID]

    def _ac_row_ids(self, admin):
        d = _get_city(admin, "Patna")
        for rc in d["rate_cards"]:
            if rc["category_id"] == AC_CATEGORY_ID:
                return [r["id"] for g in rc["groups"] for r in g["rows"] if r.get("id")]
        return []

    def test_apply_across_empty_cities(self, admin):
        r = admin.post(f"{BASE}/api/admin/price-manager/apply-across",
                       json={"from": "Patna", "category_id": AC_CATEGORY_ID,
                             "cities": [], "include": ["services", "ratecards"]}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body == {"applied": [], "count": 0}

    def test_apply_across_skips_source_city(self, admin):
        r = admin.post(f"{BASE}/api/admin/price-manager/apply-across",
                       json={"from": "Patna", "category_id": AC_CATEGORY_ID,
                             "cities": ["Patna"], "include": ["services", "ratecards"]}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["count"] == 0 and body["applied"] == []

    def test_apply_across_copies_ac_only(self, admin):
        src_snap = self._snapshot(admin, "Patna")
        dst_snap = self._snapshot(admin, "Ranchi")
        ac_svc_ids = self._ac_service_ids(admin)
        ac_row_ids = self._ac_row_ids(admin)
        assert ac_svc_ids, "no AC services found"

        # Modify Patna AC prices (and one AC rate-card row) so we can detect propagation
        new_prices = copy.deepcopy(src_snap["prices"])
        tweak_sid = None
        for sid in ac_svc_ids:
            if sid in new_prices and (new_prices[sid].get("price") or 0):
                tweak_sid = sid
                new_prices[sid]["price"] = round(float(new_prices[sid]["price"]) + 7.0, 2)
                break
        assert tweak_sid, "no priced AC service in Patna"
        new_rc = copy.deepcopy(src_snap["ratecards"])
        tweak_rid = None
        for rid in ac_row_ids:
            prev = new_rc.get(rid) or {}
            tweak_rid = rid
            new_rc[rid] = {"service_charge": "999", "labour_charge": prev.get("labour_charge") or "100",
                           "original_charge": prev.get("original_charge") or "1200"}
            break

        # Pick a NON-AC service in Ranchi; ensure its price differs so we can assert it's untouched
        non_ac_sid = None
        for sid, sp in dst_snap["prices"].items():
            if sid not in ac_svc_ids and (sp or {}).get("price"):
                non_ac_sid = sid
                break
        assert non_ac_sid, "no non-AC priced service in Ranchi"
        non_ac_before = float(dst_snap["prices"][non_ac_sid]["price"])

        try:
            # Push modified Patna
            admin.put(f"{BASE}/api/admin/price-manager/city/Patna", json={
                "categories": src_snap["categories"], "fees": src_snap["fees"],
                "services": new_prices, "ratecards": new_rc,
            }, timeout=20)

            r = admin.post(f"{BASE}/api/admin/price-manager/apply-across",
                           json={"from": "Patna", "category_id": AC_CATEGORY_ID,
                                 "cities": ["Ranchi"], "include": ["services", "ratecards"]}, timeout=30)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body == {"applied": ["Ranchi"], "count": 1}, body

            got = _get_city(admin, "Ranchi")
            # AC service was updated to Patna's new price
            assert abs(float(got["prices"][tweak_sid]["price"]) - float(new_prices[tweak_sid]["price"])) < 0.01
            # AC rate-card row updated
            if tweak_rid:
                assert str(got["ratecards"].get(tweak_rid, {}).get("service_charge")) == "999"
            # Non-AC service untouched
            assert abs(float(got["prices"][non_ac_sid]["price"]) - non_ac_before) < 0.01, \
                "non-AC service price got touched"
        finally:
            self._restore(admin, "Patna", src_snap)
            self._restore(admin, "Ranchi", dst_snap)
