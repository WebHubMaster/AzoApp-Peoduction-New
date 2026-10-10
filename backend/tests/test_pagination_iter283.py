"""
Iteration 283 — Opt-in pagination for mobile infinite-scroll.
Verifies:
  * Legacy response shape preserved when page_size is absent/0.
  * Opt-in paginated response structure (items/total/page/page_size/has_more)
    for list endpoints and dict-with-list endpoints (page_key).
  * Page 2 returns next distinct items; has_more flips to False at end.
  * page_size cap at 100.
"""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL",
                     "https://payment-gateway-fix-47.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

CUSTOMER_PHONE = "+919000000004"
PARTNER_PHONE = "+919000000003"
MERCHANT_PHONE = "+919000000002"
OTP = "123456"


def _login(phone):
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=20)
    assert r.status_code == 200, (phone, r.status_code, r.text)
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=20)
    assert r.status_code == 200, (phone, r.status_code, r.text)
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, r.text
    return tok


@pytest.fixture(scope="module")
def customer_hdr():
    return {"Authorization": f"Bearer {_login(CUSTOMER_PHONE)}"}


@pytest.fixture(scope="module")
def partner_hdr():
    return {"Authorization": f"Bearer {_login(PARTNER_PHONE)}"}


@pytest.fixture(scope="module")
def merchant_hdr():
    return {"Authorization": f"Bearer {_login(MERCHANT_PHONE)}"}


# ------------- Helpers -------------

def _assert_page_shape(d, expected_page, expected_size):
    assert isinstance(d, dict), d
    for k in ("items", "total", "page", "page_size", "has_more"):
        assert k in d, f"missing {k} in {d.keys()}"
    assert isinstance(d["items"], list)
    assert d["page"] == expected_page
    assert d["page_size"] == expected_size
    assert isinstance(d["total"], int)
    assert isinstance(d["has_more"], bool)
    assert len(d["items"]) <= expected_size


def _ids(items):
    out = []
    for it in items:
        if isinstance(it, dict):
            out.append(it.get("id") or it.get("_id") or it.get("uid") or str(it)[:40])
        else:
            out.append(str(it)[:40])
    return out


def _check_pagination(url, hdr, legacy_key_in_dict=None):
    """Full-flow test for a list endpoint. If legacy_key_in_dict is set,
    the legacy response is a dict with the list under that key (page_key)."""
    # Legacy response (no page_size)
    r = requests.get(url, headers=hdr, timeout=30)
    assert r.status_code == 200, (url, r.status_code, r.text[:300])
    legacy = r.json()
    if legacy_key_in_dict:
        assert isinstance(legacy, dict), (url, type(legacy))
        assert legacy_key_in_dict in legacy, (url, list(legacy.keys()))
        assert isinstance(legacy[legacy_key_in_dict], list)
    else:
        assert isinstance(legacy, list), (url, type(legacy))

    # Opt-in page 1
    r1 = requests.get(f"{url}{'&' if '?' in url else '?'}page=1&page_size=10", headers=hdr, timeout=30)
    assert r1.status_code == 200, (url, r1.text[:300])
    p1 = r1.json()
    _assert_page_shape(p1, 1, 10)
    if legacy_key_in_dict:
        # page_key keeps the legacy key = the paged slice (same as items)
        assert isinstance(p1.get(legacy_key_in_dict), list)
        assert p1[legacy_key_in_dict] == p1["items"]
    total = p1["total"]
    # total consistency with legacy length
    legacy_len = len(legacy[legacy_key_in_dict]) if legacy_key_in_dict else len(legacy)
    assert total == legacy_len, (url, total, legacy_len)

    # has_more sanity
    assert p1["has_more"] == (total > 10)

    # page 2 distinctness (only if enough items)
    if total > 10:
        r2 = requests.get(f"{url}{'&' if '?' in url else '?'}page=2&page_size=10", headers=hdr, timeout=30)
        assert r2.status_code == 200
        p2 = r2.json()
        _assert_page_shape(p2, 2, 10)
        ids1, ids2 = _ids(p1["items"]), _ids(p2["items"])
        assert set(ids1).isdisjoint(set(ids2)), (url, ids1, ids2)
        # has_more at end
        import math
        last_page = max(1, math.ceil(total / 10))
        rl = requests.get(f"{url}{'&' if '?' in url else '?'}page={last_page}&page_size=10",
                          headers=hdr, timeout=30)
        pl = rl.json()
        assert pl["has_more"] is False, (url, pl)

    # Cap at 100
    rc = requests.get(f"{url}{'&' if '?' in url else '?'}page=1&page_size=500", headers=hdr, timeout=30)
    assert rc.status_code == 200
    pc = rc.json()
    assert pc["page_size"] == 100, (url, pc.get("page_size"))

    return legacy, p1


# ------------- Notifications (any user) -------------

def test_notifications_pagination(customer_hdr):
    _check_pagination(f"{API}/notifications", customer_hdr)


# ------------- Custom jobs (customer) -------------

def test_custom_jobs_mine_pagination(customer_hdr):
    _check_pagination(f"{API}/custom-jobs/mine", customer_hdr)


# ------------- Growth scratch cards (customer, dict legacy) -------------

def test_scratch_cards_pagination(customer_hdr):
    _check_pagination(f"{API}/growth/scratch-cards", customer_hdr, legacy_key_in_dict="cards")


# ------------- Bugs my -------------

def test_bugs_my_pagination(customer_hdr):
    _check_pagination(f"{API}/bugs/my", customer_hdr)


# ------------- Partner withdrawals -------------

def test_partner_withdrawals_pagination(partner_hdr):
    _check_pagination(f"{API}/partner/withdrawals", partner_hdr)


# ------------- Partner bonuses (dict with rows) -------------

def test_partner_bonuses_pagination(partner_hdr):
    _check_pagination(f"{API}/partner/my-bonuses", partner_hdr, legacy_key_in_dict="rows")


# ------------- Partner reviews (DB skip/limit, items/total only) -------------

def test_partner_reviews_pagination(partner_hdr):
    url = f"{API}/partner/reviews"
    r1 = requests.get(f"{url}?page=1&page_size=10", headers=partner_hdr, timeout=30)
    assert r1.status_code == 200, r1.text[:300]
    d = r1.json()
    for k in ("items", "total", "page", "page_size"):
        assert k in d, d.keys()
    assert d["page"] == 1 and d["page_size"] == 10
    assert isinstance(d["items"], list) and len(d["items"]) <= 10
    # cap
    rc = requests.get(f"{url}?page=1&page_size=500", headers=partner_hdr, timeout=30)
    assert rc.status_code == 200
    assert rc.json()["page_size"] == 100


# ------------- Merchant referral: customer / partner detail (page_key on services) -------------

def test_merchant_referral_customer_detail_pagination(merchant_hdr):
    r = requests.get(f"{API}/merchant/referral/customers?page=1&page_size=10", headers=merchant_hdr, timeout=30)
    assert r.status_code == 200, r.text[:300]
    rows = (r.json() or {}).get("rows") or (r.json() or {}).get("items") or []
    if not rows:
        pytest.skip("Merchant has no referral customers; cannot test detail pagination")
    cid = rows[0].get("id") or rows[0].get("_id") or rows[0].get("uid")
    if not cid:
        pytest.skip("No id on referral customer row")
    url = f"{API}/merchant/referral/customers/{cid}"
    # legacy
    rl = requests.get(url, headers=merchant_hdr, timeout=30)
    assert rl.status_code == 200
    legacy = rl.json()
    assert isinstance(legacy, dict) and "services" in legacy
    # paged
    rp = requests.get(f"{url}?page=1&page_size=10", headers=merchant_hdr, timeout=30)
    assert rp.status_code == 200
    p = rp.json()
    _assert_page_shape(p, 1, 10)
    assert p[legacy_key := "services"] == p["items"]
    assert p["total"] == len(legacy["services"])


def test_merchant_referral_partner_detail_pagination(merchant_hdr):
    r = requests.get(f"{API}/merchant/referral/partners?page=1&page_size=10", headers=merchant_hdr, timeout=30)
    assert r.status_code == 200, r.text[:300]
    rows = (r.json() or {}).get("rows") or (r.json() or {}).get("items") or []
    if not rows:
        pytest.skip("Merchant has no referral partners; cannot test detail pagination")
    pid = rows[0].get("id") or rows[0].get("_id") or rows[0].get("uid")
    if not pid:
        pytest.skip("No id on referral partner row")
    url = f"{API}/merchant/referral/partners/{pid}"
    rl = requests.get(url, headers=merchant_hdr, timeout=30)
    assert rl.status_code == 200
    legacy = rl.json()
    assert isinstance(legacy, dict) and "services" in legacy
    rp = requests.get(f"{url}?page=1&page_size=10", headers=merchant_hdr, timeout=30)
    assert rp.status_code == 200
    p = rp.json()
    _assert_page_shape(p, 1, 10)
    assert p["services"] == p["items"]
    assert p["total"] == len(legacy["services"])
