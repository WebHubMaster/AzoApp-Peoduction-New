"""Iteration 245 - Payment hosted-callback routing, city-aware banners/offers,
coming-soon category + 404 handling.

Run:
  pytest /app/backend/tests/test_payments_banners_iter245.py -v \
     --junitxml=/app/test_reports/pytest/iter245.xml
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

HC_ID = "3385eac1-575f-4875-87fc-e005ffa07c76"
HC_SLUG = "home-cleaning"


# --- helper: OTP login customer -----------------------------------------
@pytest.fixture(scope="module")
def customer_token():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": "+919000000004"}, timeout=15)
    assert r.status_code == 200, r.text
    r = s.post(f"{BASE_URL}/api/auth/verify-otp",
               json={"phone": "+919000000004", "otp": "123456"}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, r.text
    return tok


# =====================================================================
# 1. Payment hosted-callback redirects (PayU / Easebuzz)
# =====================================================================
class TestHostedCallbackRouting:
    def _post(self, gw: str, ret: str = ""):
        url = f"{BASE_URL}/api/payments/webhooks/{gw}-callback"
        if ret:
            url += f"?ret={ret}"
        return requests.post(url, data={"txnid": "ABC123"}, allow_redirects=False, timeout=15)

    def test_payu_ret_panel(self):
        r = self._post("payu", "panel")
        assert r.status_code == 303, r.text
        loc = r.headers.get("location", "")
        assert "/api/panel/payment/return" in loc, loc
        assert "gw=payu" in loc and "order_id=ABC123" in loc

    def test_easebuzz_ret_customer(self):
        r = self._post("easebuzz", "customer")
        assert r.status_code == 303
        loc = r.headers.get("location", "")
        assert "/api/customer/payment/return" in loc, loc
        assert "gw=easebuzz" in loc and "order_id=ABC123" in loc

    def test_payu_no_ret_defaults(self):
        r = self._post("payu", "")
        assert r.status_code == 303
        loc = r.headers.get("location", "")
        # Should NOT contain /api/panel or /api/customer
        assert "/api/panel/payment/return" not in loc
        assert "/api/customer/payment/return" not in loc
        assert "/payment/return" in loc
        assert "gw=payu" in loc

    def test_get_method_also_supported(self):
        r = requests.get(f"{BASE_URL}/api/payments/webhooks/payu-callback",
                         params={"txnid": "GET1", "ret": "panel"},
                         allow_redirects=False, timeout=15)
        assert r.status_code == 303
        assert "order_id=GET1" in r.headers.get("location", "")


# =====================================================================
# 2. /api/payments/order with X-Pay-Return - no gateway keys => 409 (not 500)
# =====================================================================
class TestOrderCleanError:
    def test_order_panel_returns_409_not_500(self, customer_token):
        r = requests.post(
            f"{BASE_URL}/api/payments/order",
            headers={"Authorization": f"Bearer {customer_token}",
                     "X-Pay-Return": "panel"},
            json={"purpose": "wallet", "amount": 100},
            timeout=15,
        )
        # Must NOT be 500. Expect 4xx (409 preferred per spec).
        assert r.status_code < 500, f"got {r.status_code}: {r.text}"
        # Should be a client error about gateway not configured
        assert r.status_code in (400, 402, 403, 409, 422), r.text


# =====================================================================
# 3. City-aware banners: Sparkling Homes hidden in Patna, shown in Ranchi
# =====================================================================
class TestCityAwareBanners:
    def _titles(self, items):
        return [str((i or {}).get("title") or "").lower() for i in (items or [])]

    def test_banners_patna_hides_sparkling_homes(self):
        r = requests.get(f"{BASE_URL}/api/content/banners",
                         headers={"X-City": "Patna"}, timeout=15)
        assert r.status_code == 200, r.text
        assert "sparkling homes" not in " ".join(self._titles(r.json()))

    def test_banners_ranchi_shows_sparkling_homes(self):
        r = requests.get(f"{BASE_URL}/api/content/banners",
                         headers={"X-City": "Ranchi"}, timeout=15)
        assert r.status_code == 200
        assert "sparkling homes" in " ".join(self._titles(r.json()))

    def test_homepage_patna_hides_hc_banner(self):
        r = requests.get(f"{BASE_URL}/api/site/homepage?city=Patna", timeout=15)
        assert r.status_code == 200
        # Homepage returns a list of modules; just ensure the banner title is nowhere
        assert "sparkling homes" not in r.text.lower()

    def test_homepage_ranchi_shows_hc_banner(self):
        r = requests.get(f"{BASE_URL}/api/site/homepage?city=Ranchi", timeout=15)
        assert r.status_code == 200
        assert "sparkling homes" in r.text.lower()

    def test_app_home_filters_city_in_patna(self):
        r = requests.get(f"{BASE_URL}/api/app/home",
                         headers={"X-City": "Patna"}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        hero = body.get("hero_slides") or []
        offers = body.get("offers") or []
        combined = " ".join(self._titles(hero) + self._titles(offers))
        assert "sparkling homes" not in combined

    def test_site_promotions_offers_filtered_patna(self):
        r = requests.get(f"{BASE_URL}/api/site/promotions",
                         headers={"X-City": "Patna"}, timeout=15)
        assert r.status_code == 200
        offers = r.json().get("offers") or []
        combined = " ".join(self._titles(offers))
        assert "sparkling homes" not in combined


# =====================================================================
# 4. Category 404 (previously 500) + city-availability flag
# =====================================================================
class TestCategoryEdge:
    def test_unknown_category_returns_404(self):
        r = requests.get(f"{BASE_URL}/api/catalog/category/doesnotexist", timeout=15)
        assert r.status_code == 404, r.text

    def test_hc_patna_marked_unavailable(self):
        r = requests.get(f"{BASE_URL}/api/catalog/category/{HC_SLUG}",
                         headers={"X-City": "Patna"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("city_available") is False, data

    def test_hc_ranchi_available(self):
        r = requests.get(f"{BASE_URL}/api/catalog/category/{HC_SLUG}",
                         headers={"X-City": "Ranchi"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("city_available") is True, data

    def test_hc_by_id_patna_unavailable(self):
        r = requests.get(f"{BASE_URL}/api/catalog/category/{HC_ID}",
                         headers={"X-City": "Patna"}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("city_available") is False
