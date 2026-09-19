"""Regression test for admin People bulk-delete of demo partner accounts.

Bug: Bulk-delete returned "0 deleted, 10 skipped" because seeded demo accounts
were blocked. Fix: demo accounts (except the 4 protected login accounts) are
deletable. This test verifies:
  - admin login via OTP
  - list partners with phones in 011..018 range
  - bulk-delete → count > 0 and equal to # selected
  - deleted partners appear in the Deleted (recycle bin) tab
  - bulk-restore returns them to All
  - core demo login accounts (+919000000000/2/3/4) remain untouched and
    partner +919000000003 can still login.
"""
import os
import pytest
import requests
from pathlib import Path

def _load_frontend_env():
    p = Path("/app/frontend/.env")
    if p.exists():
        for line in p.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env()).rstrip("/") + "/api"
OTP = "123456"
ADMIN_PHONE = "+919000000000"
CORE_PARTNER_PHONE = "+919000000003"
PROTECTED = {"+919000000000", "+919000000002", "+919000000003", "+919000000004"}


def _login(phone: str) -> str:
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": phone}, timeout=30)
    assert r.status_code == 200, f"send-otp failed for {phone}: {r.status_code} {r.text}"
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=30)
    assert r.status_code == 200, f"verify-otp failed for {phone}: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN_PHONE)}"}


@pytest.fixture(scope="module")
def target_partners(admin_headers):
    """Find 3 seeded demo partners in the 011..018 phone range (never protected)."""
    picked = []
    for suffix in ("018", "017", "016", "015", "014", "013", "012", "011"):
        phone_q = "9000000" + suffix
        r = requests.get(f"{BASE}/admin/people/partner",
                         params={"q": phone_q, "page_size": 5},
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        for item in r.json().get("items", []):
            if item.get("phone") in PROTECTED:
                continue
            picked.append({"id": item["id"], "phone": item.get("phone"), "name": item.get("name")})
            if len(picked) >= 3:
                break
        if len(picked) >= 3:
            break
    assert len(picked) >= 2, f"Not enough non-protected demo partners in 011-018 range: {picked}"
    return picked


def test_admin_login_works(admin_headers):
    r = requests.get(f"{BASE}/auth/me", headers=admin_headers, timeout=30)
    assert r.status_code == 200
    assert r.json().get("role") == "admin"


def test_bulk_delete_demo_partners_succeeds(admin_headers, target_partners):
    """The reported bug: bulk-delete should NOT skip all demo accounts."""
    uids = [p["id"] for p in target_partners]
    r = requests.post(f"{BASE}/admin/people/partner/bulk-delete",
                      json={"uids": uids, "reason": "regression test"},
                      headers=admin_headers, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("count") == len(uids), \
        f"Expected {len(uids)} deleted, got count={data.get('count')}, skipped={data.get('skipped')}"
    assert set(data.get("deleted") or []) == set(uids)
    assert not data.get("skipped"), f"Unexpected skips: {data.get('skipped')}"


def test_deleted_partners_appear_in_recycle_bin(admin_headers, target_partners):
    r = requests.get(f"{BASE}/admin/people/partner",
                     params={"deleted": "1", "page_size": 100},
                     headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    bin_ids = {i["id"] for i in r.json().get("items", [])}
    for p in target_partners:
        assert p["id"] in bin_ids, f"Deleted partner {p['phone']} not in recycle bin"


def test_deleted_partners_hidden_from_all_tab(admin_headers, target_partners):
    r = requests.get(f"{BASE}/admin/people/partner",
                     params={"page_size": 200},
                     headers=admin_headers, timeout=30)
    assert r.status_code == 200
    all_ids = {i["id"] for i in r.json().get("items", [])}
    for p in target_partners:
        assert p["id"] not in all_ids, f"Deleted partner {p['phone']} still visible in All"


def test_soft_deleted_account_cannot_login(target_partners):
    """Soft-deleted accounts should be blocked from logging in."""
    phone = target_partners[0]["phone"]
    requests.post(f"{BASE}/auth/send-otp", json={"phone": phone}, timeout=30)
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=30)
    assert r.status_code in (401, 403), f"Deleted account allowed login: {r.status_code} {r.text}"


def test_bulk_restore_returns_partners_to_all(admin_headers, target_partners):
    """CRITICAL cleanup — restore all deleted partners so the demo dataset is intact."""
    uids = [p["id"] for p in target_partners]
    r = requests.post(f"{BASE}/admin/people/partner/bulk-restore",
                      json={"uids": uids},
                      headers=admin_headers, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("count") == len(uids)
    assert set(data.get("restored") or []) == set(uids)

    # Verify they are back in "All"
    r = requests.get(f"{BASE}/admin/people/partner",
                     params={"page_size": 200},
                     headers=admin_headers, timeout=30)
    all_ids = {i["id"] for i in r.json().get("items", [])}
    for p in target_partners:
        assert p["id"] in all_ids, f"Restored partner {p['phone']} not back in All tab"


def test_self_delete_guard(admin_headers):
    """Admin cannot delete their own account (admin isn't targetable by partner
    endpoint, but if we resolve the admin uid and try, we should get 400)."""
    r = requests.get(f"{BASE}/auth/me", headers=admin_headers, timeout=30)
    admin_id = r.json().get("id")
    assert admin_id
    # Admin isn't listed under any of the customer/partner/merchant collections,
    # so single-delete via those role endpoints will 404. Also ensure it stays
    # not-targetable through the partner list.
    r = requests.get(f"{BASE}/admin/people/partner",
                     params={"q": ADMIN_PHONE}, headers=admin_headers, timeout=30)
    assert r.status_code == 200
    ids = [i["id"] for i in r.json().get("items", [])]
    assert admin_id not in ids, "Admin account leaking into partner list — self-delete would be possible"


def test_core_partner_can_still_login():
    """Ensure the automated-test / demo core partner is untouched."""
    tok = _login(CORE_PARTNER_PHONE)
    r = requests.get(f"{BASE}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert body.get("role") == "partner"
    assert body.get("phone") == CORE_PARTNER_PHONE
    assert not body.get("deleted")
