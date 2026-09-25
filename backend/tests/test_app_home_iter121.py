"""iter121 — Customer App Home (CMS + public feed) backend tests
Endpoints: GET /api/app/home, GET/PUT /api/admin/app-home
"""
import os
import copy
import requests
import pytest

BASE = "http://localhost:8001/api"


def _login(phone: str) -> str:
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": phone}, timeout=10)
    assert r.status_code == 200, r.text
    r = requests.post(
        f"{BASE}/auth/verify-otp",
        json={"phone": phone, "otp": "123456", "create_if_new": False},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login("+919000000000")


@pytest.fixture(scope="module")
def customer_token():
    return _login("+919000000004")


# -------- public feed --------
class TestPublicAppHome:
    def test_public_home_200_shape(self):
        r = requests.get(f"{BASE}/app/home", timeout=15)
        assert r.status_code == 200
        d = r.json()
        # branding
        b = d.get("branding") or {}
        assert b.get("site_name")
        assert "logo" in b and "tagline" in b and "show_tagline" in b
        # hero
        hs = d.get("hero_slides") or []
        assert len(hs) >= 1
        s0 = hs[0]
        assert s0.get("title") == "Home Services"
        assert s0.get("highlight") == "Made Simple"
        assert len(s0.get("features") or []) == 3
        assert s0.get("cta_label")
        # sections in order
        keys = [s["key"] for s in d.get("sections") or []]
        # 'salon' may drop out if no salon categories exist -> allow absent
        expected_order = ["categories", "offer_banner", "quick_features", "most_booked",
                          "why_choose", "trending", "offers"]
        filtered = [k for k in keys if k in expected_order]
        assert filtered == expected_order, f"section order wrong: {keys}"
        # per-section
        by = {s["key"]: s for s in d["sections"]}
        assert by["categories"]["data"], "categories empty"
        assert len(by["quick_features"]["data"]) == 4
        assert len(by["most_booked"]["data"]) >= 1
        svc = by["most_booked"]["data"][0]
        for f in ("id", "name", "base_price", "rating"):
            assert f in svc
        wc = by["why_choose"]["data"]
        assert wc.get("title") == "Why Choose AzoApp?"
        assert len(wc.get("items") or []) == 5
        assert len(by["offers"]["data"]) == 7
        assert len(by["offers"].get("coupons") or []) == 3
        assert d.get("stats")

    def test_public_home_with_city(self):
        r = requests.get(f"{BASE}/app/home", params={"city": "patna"}, timeout=15)
        assert r.status_code == 200
        assert (r.json().get("sections") or [])


# -------- admin auth --------
class TestAdminAuth:
    def test_admin_get_requires_token(self):
        r = requests.get(f"{BASE}/admin/app-home", timeout=10)
        assert r.status_code == 401

    def test_admin_get_ok(self, admin_token):
        r = requests.get(
            f"{BASE}/admin/app-home",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        assert r.status_code == 200
        d = r.json()
        assert d.get("hero_slides") and d.get("sections")
        assert d.get("why_choose", {}).get("title") == "Why Choose AzoApp?"

    def test_customer_put_forbidden(self, customer_token):
        r = requests.put(
            f"{BASE}/admin/app-home",
            headers={"Authorization": f"Bearer {customer_token}"},
            json={"why_choose": {"title": "hacker"}},
            timeout=10,
        )
        assert r.status_code == 403


# -------- admin PUT modifies public feed then restore --------
class TestAdminMutationRoundtrip:
    def test_modify_then_restore(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        original = requests.get(f"{BASE}/admin/app-home", headers=h, timeout=10).json()
        assert original.get("hero_slides")
        assert original.get("sections")

        # ---- MODIFY ----
        modified = copy.deepcopy(original)
        modified["why_choose"]["title"] = "Why Choose AzoApp? QA"
        modified["hero_slides"][0]["title"] = "Home Services QA"
        for s in modified["sections"]:
            if s["key"] == "trending":
                s["enabled"] = False

        r = requests.put(f"{BASE}/admin/app-home", headers=h, json=modified, timeout=15)
        assert r.status_code == 200, r.text
        # cache is busted -> public GET should reflect
        pub = requests.get(f"{BASE}/app/home", timeout=15).json()
        wc = [s for s in pub["sections"] if s["key"] == "why_choose"]
        assert wc and wc[0]["data"]["title"] == "Why Choose AzoApp? QA"
        assert pub["hero_slides"][0]["title"] == "Home Services QA"
        keys = [s["key"] for s in pub["sections"]]
        assert "trending" not in keys, f"trending should be hidden, keys={keys}"

        # ---- RESTORE ----
        restore = copy.deepcopy(original)
        r = requests.put(f"{BASE}/admin/app-home", headers=h, json=restore, timeout=15)
        assert r.status_code == 200

        pub2 = requests.get(f"{BASE}/app/home", timeout=15).json()
        wc2 = [s for s in pub2["sections"] if s["key"] == "why_choose"][0]["data"]
        assert wc2["title"] == "Why Choose AzoApp?"
        assert pub2["hero_slides"][0]["title"] == "Home Services"
        keys2 = [s["key"] for s in pub2["sections"]]
        assert "trending" in keys2
