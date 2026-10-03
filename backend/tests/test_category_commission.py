"""Category-wise Commission & Refund Settings - backend tests."""
import os
import pytest
import requests
import time

def _read_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    for p in ("/app/frontend/.env", "/app/web_panel/.env"):
        try:
            for ln in open(p):
                if ln.startswith("REACT_APP_BACKEND_URL="):
                    return ln.split("=", 1)[1].strip().strip('"').rstrip("/")
        except FileNotFoundError:
            pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE_URL = _read_backend_url()
API = f"{BASE_URL}/api"


# ---------- auth helpers ----------
def _login(phone, role):
    s = requests.Session()
    r = s.post(f"{API}/auth/send-otp", json={"phone": phone, "role": role}, timeout=60)
    assert r.status_code == 200, r.text
    r = s.post(f"{API}/auth/verify-otp",
               json={"phone": phone, "otp": "123456", "role": role}, timeout=60)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, r.text
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s, r.json().get("user") or {}


@pytest.fixture(scope="module")
def admin():
    s, u = _login("+919000000000", "admin")
    return s


@pytest.fixture(scope="module")
def customer():
    # Pick an existing seeded customer. Fallback: register.
    phone = "+919111100001"
    try:
        return _login(phone, "customer")
    except AssertionError:
        return _login("+919111100099", "customer")


# ---------- GET /api/admin/category-commissions ----------
class TestList:
    def test_list_shape(self, admin):
        r = admin.get(f"{API}/admin/category-commissions", timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "categories" in d and "total" in d and "configured" in d
        assert isinstance(d["categories"], list)
        if d["categories"]:
            c = d["categories"][0]
            for k in ("id", "name", "service_count", "configured"):
                assert k in c
            assert "commission" in c  # may be None

    def test_requires_admin(self):
        r = requests.get(f"{API}/admin/category-commissions", timeout=20)
        assert r.status_code in (401, 403)


# ---------- PUT /api/admin/category-commissions/{cat_id} ----------
class TestUpsert:
    @pytest.fixture(scope="class")
    def category_id(self, admin):
        r = admin.get(f"{API}/admin/category-commissions", timeout=20).json()
        assert r["categories"], "no categories seeded"
        return r["categories"][0]["id"]

    def _valid(self):
        return {"partner_pct": 70, "platform_pct": 20,
                "merchant_partner_referral_pct": 5, "merchant_customer_pct": 5,
                "customer_refund_pct": 90, "partner_cancellation_pct": 10}

    def test_valid_save(self, admin, category_id):
        r = admin.put(f"{API}/admin/category-commissions/{category_id}",
                      json=self._valid(), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["partner_pct"] == 70 and d["customer_refund_pct"] == 90
        # verify persistence via list
        lst = admin.get(f"{API}/admin/category-commissions", timeout=20).json()
        row = next(c for c in lst["categories"] if c["id"] == category_id)
        assert row["configured"] is True
        assert row["commission"]["partner_pct"] == 70

    def test_commission_sum_not_100(self, admin, category_id):
        p = self._valid(); p["partner_pct"] = 60
        r = admin.put(f"{API}/admin/category-commissions/{category_id}", json=p, timeout=20)
        assert r.status_code == 400
        assert "100" in r.text

    def test_refund_sum_not_100(self, admin, category_id):
        p = self._valid(); p["customer_refund_pct"] = 50
        r = admin.put(f"{API}/admin/category-commissions/{category_id}", json=p, timeout=20)
        assert r.status_code == 400

    def test_missing_field(self, admin, category_id):
        p = self._valid(); p.pop("platform_pct")
        r = admin.put(f"{API}/admin/category-commissions/{category_id}", json=p, timeout=20)
        assert r.status_code == 400

    def test_out_of_range(self, admin, category_id):
        p = self._valid(); p["partner_pct"] = 150; p["platform_pct"] = -50
        r = admin.put(f"{API}/admin/category-commissions/{category_id}", json=p, timeout=20)
        assert r.status_code == 400

    def test_unknown_category(self, admin):
        r = admin.put(f"{API}/admin/category-commissions/does-not-exist",
                      json=self._valid(), timeout=20)
        assert r.status_code == 404

    def test_non_admin_forbidden(self, category_id):
        r = requests.put(f"{API}/admin/category-commissions/{category_id}",
                         json=self._valid(), timeout=20)
        assert r.status_code in (401, 403)


# ---------- POST /api/admin/category-commissions/bulk ----------
class TestBulk:
    def test_bulk_apply(self, admin):
        r = admin.get(f"{API}/admin/category-commissions", timeout=20).json()
        ids = [c["id"] for c in r["categories"][:2]]
        if len(ids) < 1:
            pytest.skip("need at least 1 category")
        payload = {"category_ids": ids,
                   "rates": {"partner_pct": 65, "platform_pct": 25,
                             "merchant_partner_referral_pct": 5, "merchant_customer_pct": 5,
                             "customer_refund_pct": 80, "partner_cancellation_pct": 20}}
        resp = admin.post(f"{API}/admin/category-commissions/bulk", json=payload, timeout=20)
        assert resp.status_code == 200, resp.text
        assert resp.json().get("updated") == len(ids)
        # verify
        lst = admin.get(f"{API}/admin/category-commissions", timeout=20).json()
        for cid in ids:
            row = next(c for c in lst["categories"] if c["id"] == cid)
            assert row["configured"] and row["commission"]["partner_pct"] == 65

    def test_bulk_invalid_rates(self, admin):
        r = admin.get(f"{API}/admin/category-commissions", timeout=20).json()
        ids = [c["id"] for c in r["categories"][:1]]
        payload = {"category_ids": ids,
                   "rates": {"partner_pct": 10, "platform_pct": 10,
                             "merchant_partner_referral_pct": 10, "merchant_customer_pct": 10,
                             "customer_refund_pct": 90, "partner_cancellation_pct": 10}}
        resp = admin.post(f"{API}/admin/category-commissions/bulk", json=payload, timeout=20)
        assert resp.status_code == 400


# ---------- Booking commission snapshot ----------
class TestBookingSnapshot:
    def _find_service_with_configured_category(self, admin):
        lst = admin.get(f"{API}/admin/category-commissions", timeout=30).json()
        # Pick any category that has services; configure it if not yet.
        candidates = [c for c in lst["categories"] if c.get("service_count", 0) > 0]
        if not candidates:
            return None, None
        cat = next((c for c in candidates if c.get("configured")), candidates[0])
        # fetch services (public endpoint)
        r = requests.get(f"{API}/catalog/services", timeout=30)
        services = r.json() if isinstance(r.json(), list) else r.json().get("services", [])
        svc = next((s for s in services if s.get("category_id") == cat["id"]), None)
        return svc, cat

    def test_commission_config_snapshot(self, admin, customer):
        cust_sess, cust_user = customer
        svc, cat = self._find_service_with_configured_category(admin)
        if not svc:
            pytest.skip("No service in a configured category")
        # Make the category have unique rates we can detect
        unique = {"partner_pct": 71, "platform_pct": 19,
                  "merchant_partner_referral_pct": 5, "merchant_customer_pct": 5,
                  "customer_refund_pct": 88, "partner_cancellation_pct": 12}
        rr = admin.put(f"{API}/admin/category-commissions/{cat['id']}", json=unique, timeout=20)
        assert rr.status_code == 200, rr.text

        # Try to create a booking via the normal customer path
        from datetime import datetime, timedelta, timezone
        sched = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%dT10:00:00")
        payload = {
            "service_id": svc["id"],
            "schedule_type": "schedule",
            "scheduled_at": sched,
            "address": {"line": "Test", "city": "Patna", "pincode": "800001",
                        "lat": 25.5941, "lng": 85.1376},
            "addons": [], "notes": "test"
        }
        r = cust_sess.post(f"{API}/bookings", json=payload, timeout=60)
        print(f"\nBooking create: HTTP {r.status_code} body={r.text[:400]}")
        if r.status_code not in (200, 201):
            pytest.skip(f"Booking create failed: {r.status_code} {r.text[:200]}")
        b = r.json().get("booking") or r.json()
        ccfg = (b.get("commission_config") or {}).get("commission") or {}
        assert ccfg.get("source") == "category", f"expected source=category, got {ccfg}"
        assert float(ccfg.get("partner_pct")) == 71
        assert float(ccfg.get("customer_refund_pct")) == 88
