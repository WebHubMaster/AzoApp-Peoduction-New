"""iter123 — Customer App: memberships, categories, category services,
geo serviceability, admin app-home branding.logo rule.
"""
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


# ---------- Memberships ----------
class TestMemberships:
    def test_plans_public(self):
        r = requests.get(f"{BASE}/memberships/plans", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, list) and len(d) == 3
        slugs = sorted([p["slug"] for p in d])
        assert slugs == ["gold-plus", "platinum-elite", "silver-saver"]
        for p in d:
            for k in ("name", "price", "duration_days", "discount_pct", "benefits"):
                assert k in p

    def test_me_requires_auth(self):
        r = requests.get(f"{BASE}/memberships/me", timeout=10)
        assert r.status_code in (401, 403)

    def test_me_customer_shape(self, customer_token):
        r = requests.get(
            f"{BASE}/memberships/me",
            headers={"Authorization": f"Bearer {customer_token}"},
            timeout=10,
        )
        assert r.status_code == 200
        d = r.json()
        assert "active" in d and "plans" in d
        assert len(d["plans"]) == 3

    def test_buy_flow_mock(self, customer_token):
        """POST /memberships/order → POST /memberships/mock → me shows active"""
        h = {"Authorization": f"Bearer {customer_token}"}
        # pick silver-saver
        plans = requests.get(f"{BASE}/memberships/plans", timeout=10).json()
        silver = next(p for p in plans if p["slug"] == "silver-saver")

        order_r = requests.post(
            f"{BASE}/memberships/order",
            headers=h,
            json={"plan_id": silver["id"]},
            timeout=15,
        )
        assert order_r.status_code == 200, order_r.text
        order = order_r.json()
        # Expect mock=true because no razorpay keys configured in this env
        assert order.get("mock") is True or order.get("order_id"), order

        # mock activation
        mock_r = requests.post(
            f"{BASE}/memberships/mock",
            headers=h,
            json={"plan_id": silver["id"]},
            timeout=15,
        )
        assert mock_r.status_code == 200, mock_r.text

        me = requests.get(f"{BASE}/memberships/me", headers=h, timeout=10).json()
        assert me.get("active") is True
        assert (me.get("membership") or {}).get("plan_id") == silver["id"]


# ---------- Categories & services ----------
class TestCatalog:
    def test_categories_list(self):
        r = requests.get(f"{BASE}/catalog/categories", timeout=10)
        assert r.status_code == 200
        cats = r.json()
        assert isinstance(cats, list) and len(cats) >= 6
        for c in cats:
            assert "id" in c and "name" in c

    def test_services_by_category(self):
        cats = requests.get(f"{BASE}/catalog/categories", timeout=10).json()
        # every category should return a list (possibly empty)
        for c in cats:
            r = requests.get(
                f"{BASE}/catalog/services", params={"category_id": c["id"]}, timeout=10
            )
            assert r.status_code == 200
            svcs = r.json()
            svcs = svcs if isinstance(svcs, list) else svcs.get("items", [])
            # AC Repair etc should have ≥1
            if c["name"] == "AC Repair & Service":
                assert len(svcs) >= 1
                s = svcs[0]
                for f in ("id", "name", "base_price"):
                    assert f in s


# ---------- Geo serviceability ----------
class TestGeo:
    def test_serviceability_800001(self):
        r = requests.get(
            f"{BASE}/geo/serviceability", params={"pincode": "800001"}, timeout=10
        )
        assert r.status_code == 200
        d = r.json()
        assert d.get("serviceable") is True
        assert d.get("area")


# ---------- Admin app-home branding.logo rule ----------
class TestAdminBrandingLogo:
    def test_logo_set_and_restore(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        original = requests.get(f"{BASE}/admin/app-home", headers=h, timeout=10).json()
        orig_logo = (original.get("branding") or {}).get("logo", "")

        # SET logo
        modified = copy.deepcopy(original)
        modified.setdefault("branding", {})["logo"] = (
            "https://images.pexels.com/photos/6471913/pexels-photo-6471913.jpeg"
        )
        r = requests.put(f"{BASE}/admin/app-home", headers=h, json=modified, timeout=15)
        assert r.status_code == 200, r.text

        pub = requests.get(f"{BASE}/app/home", timeout=15).json()
        assert (pub.get("branding") or {}).get("logo", "").startswith("https://images.pexels.com")

        # RESTORE
        restore = copy.deepcopy(original)
        restore.setdefault("branding", {})["logo"] = orig_logo
        r = requests.put(f"{BASE}/admin/app-home", headers=h, json=restore, timeout=15)
        assert r.status_code == 200
        pub2 = requests.get(f"{BASE}/app/home", timeout=15).json()
        assert (pub2.get("branding") or {}).get("logo", "") == orig_logo
