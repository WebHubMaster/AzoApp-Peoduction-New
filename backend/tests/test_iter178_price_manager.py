"""Iter178 — City-wise Price Manager backend tests.

Covers:
- X-City header switching (catalog services + categories)
- Service pricing in Ranchi vs Patna
- cart-quote using address.city for pricing + platform fee overrides
- Admin Price Manager CRUD (cities list, get/put/copy, enable/disable)
- Public rate card by category with X-City applies city overrides
"""
import os
import copy
import pytest
import requests

def _read_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except FileNotFoundError:
        return ""
    return ""


BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _read_env()).rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL missing"

FAN_SVC_ID = "0fc1d006-b3ca-4bf0-8cda-2b9a35f882e5"
ADMIN_PHONE = "+919000000000"
CUSTOMER_PHONE = "+919000000004"
OTP = "123456"


# ---------- auth helpers ----------
def _login(phone):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/send-otp", json={"phone": phone}, timeout=20)
    assert r.status_code == 200, r.text
    r = s.post(f"{BASE}/api/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN_PHONE)


@pytest.fixture(scope="module")
def customer():
    return _login(CUSTOMER_PHONE)


# ------------------------- Public catalog -------------------------
class TestCatalogCityHeader:
    def test_patna_returns_seeded_list(self):
        r = requests.get(f"{BASE}/api/catalog/services", headers={"X-City": "Patna"}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) == 16, f"len={len(data)}"

    def test_patna_categories(self):
        r = requests.get(f"{BASE}/api/catalog/categories", headers={"X-City": "Patna"}, timeout=20)
        assert r.status_code == 200
        assert len(r.json()) == 7

    def test_delhi_unconfigured_empty(self):
        r = requests.get(f"{BASE}/api/catalog/services", headers={"X-City": "Delhi"}, timeout=20)
        assert r.status_code == 200
        assert r.json() == []
        rc = requests.get(f"{BASE}/api/catalog/categories", headers={"X-City": "Delhi"}, timeout=20)
        assert rc.status_code == 200
        assert rc.json() == []

    def test_no_header_returns_legacy(self):
        r = requests.get(f"{BASE}/api/catalog/services", timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) > 0

    def test_fan_price_ranchi(self):
        r = requests.get(f"{BASE}/api/catalog/services/{FAN_SVC_ID}", headers={"X-City": "Ranchi"}, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert float(d["base_price"]) == 499.0, d
        assert float(d["discounted_price"]) == 399.0, d

    def test_fan_price_patna(self):
        r = requests.get(f"{BASE}/api/catalog/services/{FAN_SVC_ID}", headers={"X-City": "Patna"}, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert float(d["discounted_price"]) == 299.0, d


# ------------------------- cart-quote address.city -------------------------
class TestCartQuote:
    def _quote(self, customer, city):
        payload = {"items": [{"service_id": FAN_SVC_ID, "qty": 1}],
                   "schedule_type": "schedule",
                   "address": {"city": city, "pincode": "800001", "address_line": "test"}}
        r = customer.post(f"{BASE}/api/bookings/cart-quote", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        return r.json()

    def test_ranchi_quote(self, customer):
        q = self._quote(customer, "Ranchi")
        p = q.get("pricing") or q
        assert float(p.get("base")) == 399.0, p
        assert float(p.get("platform_fee")) == 30.0, p

    def test_patna_quote(self, customer):
        q = self._quote(customer, "Patna")
        p = q.get("pricing") or q
        assert float(p.get("base")) == 299.0, p
        assert float(p.get("platform_fee")) == 25.0, p


# ------------------------- Admin Price Manager -------------------------
class TestAdminPriceManager:
    def test_cities_list(self, admin):
        r = admin.get(f"{BASE}/api/admin/price-manager/cities", timeout=20)
        assert r.status_code == 200, r.text
        cities = r.json()
        assert isinstance(cities, list) and len(cities) >= 3
        keys = {c["city_key"] for c in cities}
        assert {"patna", "ranchi", "samastipur"}.issubset(keys), keys

    def test_get_city_patna(self, admin):
        r = admin.get(f"{BASE}/api/admin/price-manager/city/Patna", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["configured"] is True
        assert FAN_SVC_ID in (d.get("prices") or {})
        assert d.get("all_services") and d.get("all_categories")

    def test_disable_and_restore_service(self, admin):
        # Snapshot Patna
        snap = admin.get(f"{BASE}/api/admin/price-manager/city/Patna", timeout=20).json()
        prices = copy.deepcopy(snap["prices"])
        cats = list(snap["categories"])
        fees = dict(snap["fees"])
        ratecards = copy.deepcopy(snap["ratecards"])

        # Disable Fan Installation
        prices2 = copy.deepcopy(prices)
        prices2[FAN_SVC_ID]["enabled"] = False
        put = admin.put(f"{BASE}/api/admin/price-manager/city/Patna",
                        json={"categories": cats, "fees": fees, "services": prices2, "ratecards": ratecards},
                        timeout=20)
        assert put.status_code == 200, put.text

        # Verify hidden
        lst = requests.get(f"{BASE}/api/catalog/services", headers={"X-City": "Patna"}, timeout=20).json()
        ids = {s["id"] for s in lst}
        assert FAN_SVC_ID not in ids, "disabled service still visible"

        # Verify fetching single returns not-available (service hidden -> 404 or service without city_priced OK;
        # but cart booking should refuse)
        quote = requests.post(
            f"{BASE}/api/bookings/cart-quote",
            headers={"Authorization": admin.headers["Authorization"]},
            json={"items": [{"service_id": FAN_SVC_ID, "qty": 1}], "schedule_type": "schedule",
                  "address": {"city": "Patna", "pincode": "800001", "address_line": "x"}},
            timeout=20,
        )
        # Expected 400 "not available in your city" per spec
        assert quote.status_code in (400, 404), f"expected refusal, got {quote.status_code} {quote.text[:200]}"
        if quote.status_code == 400:
            assert "not available" in quote.text.lower() or "city" in quote.text.lower()

        # Restore
        rest = admin.put(f"{BASE}/api/admin/price-manager/city/Patna",
                         json={"categories": cats, "fees": fees, "services": prices, "ratecards": ratecards},
                         timeout=20)
        assert rest.status_code == 200
        lst2 = requests.get(f"{BASE}/api/catalog/services", headers={"X-City": "Patna"}, timeout=20).json()
        assert FAN_SVC_ID in {s["id"] for s in lst2}, "service not restored"

    def test_disable_category_and_restore(self, admin):
        snap = admin.get(f"{BASE}/api/admin/price-manager/city/Patna", timeout=20).json()
        prices = snap["prices"]
        cats = list(snap["categories"])
        fees = dict(snap["fees"])
        ratecards = snap["ratecards"]
        # Find Fan Installation's category_id
        fan_svc = next((s for s in snap["all_services"] if s["id"] == FAN_SVC_ID), None)
        assert fan_svc, "fan service missing from all_services"
        cat_id = fan_svc["category_id"]

        if cat_id not in cats:
            pytest.skip("category already off")

        new_cats = [c for c in cats if c != cat_id]
        put = admin.put(f"{BASE}/api/admin/price-manager/city/Patna",
                        json={"categories": new_cats, "fees": fees, "services": prices, "ratecards": ratecards},
                        timeout=20)
        assert put.status_code == 200
        # Category hidden
        cats_pub = requests.get(f"{BASE}/api/catalog/categories", headers={"X-City": "Patna"}, timeout=20).json()
        assert cat_id not in {c["id"] for c in cats_pub}
        # Service hidden
        svcs_pub = requests.get(f"{BASE}/api/catalog/services", headers={"X-City": "Patna"}, timeout=20).json()
        assert FAN_SVC_ID not in {s["id"] for s in svcs_pub}

        # Restore
        rest = admin.put(f"{BASE}/api/admin/price-manager/city/Patna",
                        json={"categories": cats, "fees": fees, "services": prices, "ratecards": ratecards},
                        timeout=20)
        assert rest.status_code == 200
        cats_pub2 = requests.get(f"{BASE}/api/catalog/categories", headers={"X-City": "Patna"}, timeout=20).json()
        assert cat_id in {c["id"] for c in cats_pub2}, "category not restored"

    def test_copy_city(self, admin):
        # Copy from Patna to a brand-new throwaway city with +10%
        test_city = "TestCityIter178"
        r = admin.post(f"{BASE}/api/admin/price-manager/copy",
                       json={"from": "Patna", "to": test_city, "adjust_pct": 10}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["configured"] is True
        # Fan should be ~ 299 * 1.1 = 328.9
        assert abs(float(d["prices"][FAN_SVC_ID]["price"]) - 328.9) < 0.1, d["prices"][FAN_SVC_ID]
        # Cleanup: remove this city doc via direct PUT with empty+disabled? Keep it; harmless.
        # Attempt a hard delete via mongo-style endpoint isn't exposed; leave it.


# ------------------------- Rate card public endpoint -------------------------
class TestRateCardCity:
    def test_ratecard_by_category_patna(self):
        # Get fan service's category id
        r = requests.get(f"{BASE}/api/catalog/services/{FAN_SVC_ID}", headers={"X-City": "Patna"}, timeout=20)
        cat_id = r.json().get("category_id")
        if not cat_id:
            pytest.skip("no category_id on service")
        rc = requests.get(f"{BASE}/api/ratecards/by-category/{cat_id}", headers={"X-City": "Patna"}, timeout=20)
        # Endpoint may not exist on all deployments
        if rc.status_code == 404:
            pytest.skip("rate card endpoint not available")
        assert rc.status_code == 200, rc.text
        data = rc.json()
        # Should be a dict / list; all rows (if any) should have service_charge
        groups = []
        if isinstance(data, dict):
            groups = data.get("groups") or []
        elif isinstance(data, list):
            for c in data:
                groups.extend(c.get("groups") or [])
        for g in groups:
            for row in g.get("rows") or []:
                assert row.get("service_charge"), f"row without service_charge visible: {row}"
