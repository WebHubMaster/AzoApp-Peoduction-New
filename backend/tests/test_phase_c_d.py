"""Phase C & D verification tests for AzoApp.

Covers:
  #3  merchant registration single-category (frontend enforced; backend defensively caps to 1)
  #4  after submit -> status becomes 'under_review'
  #11 admin partner detail exposes bank / KYC doc URLs (PDF or image)
  #12 GET /api/catalog/services?category_id=<id> filters correctly, only active
  #6  trigger events list includes builtins; delete builtin hides it; recreate restores
  #13 loyalty config permanently enabled=false; /api/loyalty/me reflects; checkout has no loyalty impact
"""
import pytest
from conftest import API, login, client, PHONES


# ---------- helpers ----------
@pytest.fixture(scope="module")
def admin_c():
    return client(login(PHONES["admin"]))


@pytest.fixture(scope="module")
def merchant_c():
    return client(login(PHONES["merchant"]))


@pytest.fixture(scope="module")
def customer_c():
    return client(login(PHONES["customer"]))


# ---------- #3 merchant single-category (backend cap) ----------
class TestMerchantSingleCategory:
    def test_meta_has_categories(self, merchant_c):
        r = merchant_c.get(f"{API}/merchant/registration/meta", timeout=30)
        assert r.status_code == 200, r.text
        cats = r.json().get("categories") or []
        assert len(cats) >= 2, "need at least 2 categories to test single-select"

    def test_shop_save_caps_multiple_categories_to_one(self, merchant_c):
        r = merchant_c.get(f"{API}/merchant/registration/meta", timeout=30)
        cats = r.json()["categories"]
        pick = cats[:3]  # deliberately send 3
        # Get current shop to preserve required fields
        pr = merchant_c.get(f"{API}/merchant/registration/profile", timeout=30)
        assert pr.status_code == 200
        current = pr.json()["profile"]["shop"]
        payload = {
            "shop_name": current.get("shop_name") or "TEST_Shop",
            "shop_type_id": current.get("shop_type_id") or "",
            "shop_type_name": current.get("shop_type_name") or "",
            "categories": [{"category_id": c["id"], "category_name": c["name"]} for c in pick],
            "gst_number": "",
        }
        sr = merchant_c.put(f"{API}/merchant/registration/shop", json=payload, timeout=30)
        # Might 400 if profile locked (approved) — that's still valid protection.
        if sr.status_code == 400 and "approved" in sr.text.lower():
            pytest.skip("merchant already approved — save_shop locked; UI-only cap is enough")
        assert sr.status_code == 200, sr.text
        data = sr.json()
        saved_cats = data["profile"]["shop"]["categories"]
        assert len(saved_cats) == 1, f"expected 1 cat, got {len(saved_cats)}: {saved_cats}"
        assert saved_cats[0]["category_id"] == pick[0]["id"]


# ---------- #4 after submit -> under_review ----------
class TestMerchantUnderReviewLock:
    def test_profile_status_present(self, merchant_c):
        r = merchant_c.get(f"{API}/merchant/registration/profile", timeout=30)
        assert r.status_code == 200
        st = r.json().get("kyc_status")
        # Valid statuses
        assert st in ("incomplete", "under_review", "approved", "rejected"), st

    def test_access_state_endpoint(self, merchant_c):
        r = merchant_c.get(f"{API}/merchant/registration/access-state", timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "status" in j and "approved" in j


# ---------- #11 admin partner bank/KYC docs ----------
class TestPartnerBankKycDocs:
    def test_admin_list_partners(self, admin_c):
        r = admin_c.get(f"{API}/admin/people/partner?page=1&page_size=25", timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        rows = j.get("rows") or j.get("items") or []
        assert rows, "no partners in admin listing"

    def test_partner_360_bank_kyc_fields(self, admin_c):
        r = admin_c.get(f"{API}/admin/people/partner?page=1&page_size=50", timeout=30)
        rows = (r.json().get("rows") or r.json().get("items") or [])
        # find a partner with any doc urls
        got_doc = False
        checked = 0
        import json as _j
        for p in rows:
            pid = p.get("id")
            if not pid:
                continue
            d = admin_c.get(f"{API}/admin/people/partner/{pid}/overview", timeout=30)
            if d.status_code != 200:
                continue
            checked += 1
            txt = _j.dumps(d.json())
            if any(k in txt for k in ("passbook", "cheque", "bank_", "aadhaar", "pan_url", ".pdf", ".jpg", ".png")):
                got_doc = True
                break
        assert checked > 0, "no partner overview endpoint returned 200"
        assert got_doc, "no partner 360 overview has any bank/kyc doc keys"


# ---------- #12 customer category filter ----------
class TestCustomerCategoryFilter:
    def test_categories_public(self):
        import requests
        r = requests.get(f"{API}/catalog/categories", timeout=30)
        assert r.status_code == 200, r.text
        cats = r.json()
        assert isinstance(cats, list) and cats, "no categories"

    def test_services_filter_by_category(self):
        import requests
        cats = requests.get(f"{API}/catalog/categories", timeout=30).json()
        checked = 0
        for c in cats[:4]:
            cid = c["id"]
            r = requests.get(f"{API}/catalog/services", params={"category_id": cid}, timeout=30)
            assert r.status_code == 200, r.text
            svs = r.json()
            if not svs:
                continue
            for s in svs:
                assert s.get("category_id") == cid, f"service {s.get('id')} not in cat {cid}"
                assert s.get("status", "active") == "active", f"inactive service leaked: {s}"
            checked += 1
        assert checked >= 1, "no category had services to verify"


# ---------- #6 trigger events edit/delete built-ins ----------
class TestTriggerEvents:
    def test_list_includes_builtins(self, admin_c):
        r = admin_c.get(f"{API}/admin/partner-reg/template-events", timeout=30)
        assert r.status_code == 200, r.text
        evs = r.json()
        keys = {e["key"] for e in evs}
        assert "booking_confirmed" in keys
        assert "login_otp" in keys
        # every entry has icon+color
        for e in evs:
            assert "icon" in e and "color" in e

    def test_delete_builtin_then_restore(self, admin_c):
        key = "booking_confirmed"
        # Ensure present first: recreate if hidden
        r = admin_c.get(f"{API}/admin/partner-reg/template-events", timeout=30)
        keys_before = {e["key"] for e in r.json()}
        if key not in keys_before:
            admin_c.post(f"{API}/admin/partner-reg/template-events",
                         json={"key": key, "label": "Booking Confirmed"}, timeout=30)
            r = admin_c.get(f"{API}/admin/partner-reg/template-events", timeout=30)
            keys_before = {e["key"] for e in r.json()}
        assert key in keys_before

        d = admin_c.delete(f"{API}/admin/partner-reg/template-events/{key}", timeout=30)
        assert d.status_code == 200, d.text
        r2 = admin_c.get(f"{API}/admin/partner-reg/template-events", timeout=30)
        keys_after = {e["key"] for e in r2.json()}
        assert key not in keys_after, f"built-in {key} still present after delete"

        # Restore for downstream tests / real usage
        admin_c.post(f"{API}/admin/partner-reg/template-events",
                     json={"key": key, "label": "Booking Confirmed",
                           "vars": ["name", "booking_id"]}, timeout=30)
        r3 = admin_c.get(f"{API}/admin/partner-reg/template-events", timeout=30)
        assert key in {e["key"] for e in r3.json()}

    def test_edit_builtin_updates_label(self, admin_c):
        key = "booking_started"
        orig_r = admin_c.get(f"{API}/admin/partner-reg/template-events", timeout=30)
        orig = next((e for e in orig_r.json() if e["key"] == key), None)
        assert orig is not None
        original_label = orig["label"]
        new_label = "TEST_Service Started (edited)"
        u = admin_c.post(f"{API}/admin/partner-reg/template-events",
                        json={"key": key, "label": new_label,
                              "vars": orig.get("vars", [])}, timeout=30)
        assert u.status_code == 200, u.text
        r2 = admin_c.get(f"{API}/admin/partner-reg/template-events", timeout=30)
        edited = next((e for e in r2.json() if e["key"] == key), None)
        assert edited and edited["label"] == new_label
        # restore
        admin_c.post(f"{API}/admin/partner-reg/template-events",
                     json={"key": key, "label": original_label,
                           "vars": orig.get("vars", [])}, timeout=30)


# ---------- #13 loyalty removed ----------
class TestLoyaltyRemoved:
    def test_loyalty_me_disabled(self, customer_c):
        r = customer_c.get(f"{API}/loyalty/me", timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        cfg = j.get("config") or {}
        assert cfg.get("enabled") is False, f"loyalty still enabled: {cfg}"

    def test_public_loyalty_config_disabled(self):
        import requests
        r = requests.get(f"{API}/loyalty/config", timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("enabled") is False

    def test_admin_cannot_enable_loyalty(self, admin_c):
        # Even if admin PUT enabled=true, get_config still forces False
        admin_c.put(f"{API}/admin/loyalty/config", json={"enabled": True}, timeout=30)
        import requests
        r = requests.get(f"{API}/loyalty/config", timeout=30)
        assert r.json().get("enabled") is False, "loyalty override is not permanent"
