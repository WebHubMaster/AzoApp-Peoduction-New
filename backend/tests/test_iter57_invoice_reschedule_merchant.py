"""
Iteration 57 backend tests
- Partner Invoices list/detail + view (HTML)
- Partner Booking Reschedule (request + respond)
- Merchant Payouts: /merchant/panel/finance-kyc (eligibility) + banks CRUD
- Merchant wallet + withdraw eligibility routing
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("REACT_APP_BACKEND_URL")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"
BASE_URL = BASE_URL.rstrip("/") + "/api"


def _login(phone: str):
    r = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    assert r.status_code == 200, r.text
    r = requests.post(
        f"{BASE_URL}/auth/verify-otp",
        json={"phone": phone, "otp": "123456", "create_if_new": False},
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def partner_token():
    return _login("+919000000003")


@pytest.fixture(scope="module")
def merchant_token():
    return _login("+919000000002")


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ─── Partner Invoices ────────────────────────────────────────────────
class TestPartnerInvoices:
    def test_invoices_list_default(self, partner_token):
        r = requests.get(f"{BASE_URL}/invoices?page_size=100", headers=_h(partner_token))
        assert r.status_code == 200, r.text
        d = r.json()
        assert "items" in d
        assert isinstance(d["items"], list)
        # Expected structure for a native list card
        if d["items"]:
            it = d["items"][0]
            for k in ("id", "invoice_number", "invoice_type", "payment_status", "total_amount"):
                assert k in it, f"missing {k} in invoice list item"

    @pytest.mark.parametrize("rng", ["all", "today", "yesterday", "7d", "30d", "this_month"])
    def test_invoices_time_range_chips(self, partner_token, rng):
        r = requests.get(f"{BASE_URL}/invoices?range={rng}&sort=newest&page_size=50", headers=_h(partner_token))
        assert r.status_code == 200, f"{rng}: {r.text}"
        d = r.json()
        assert "items" in d

    def test_invoices_sort_variants(self, partner_token):
        for s in ("newest", "oldest", "amount_high", "amount_low"):
            r = requests.get(f"{BASE_URL}/invoices?sort={s}&page_size=20", headers=_h(partner_token))
            assert r.status_code == 200, f"sort {s}: {r.text}"

    def test_invoice_detail_and_view(self, partner_token):
        r = requests.get(f"{BASE_URL}/invoices?page_size=10", headers=_h(partner_token))
        items = r.json().get("items", [])
        if not items:
            pytest.skip("no invoices to test detail")
        inv = items[0]
        inv_id = inv["id"]
        # detail
        r = requests.get(f"{BASE_URL}/invoices/{inv_id}", headers=_h(partner_token))
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("invoice_number", "total_amount", "payment_status"):
            assert k in d
        # role_earning present for partner invoices
        if inv.get("invoice_type") == "booking":
            assert "role_earning" in d, "role_earning missing on booking invoice"
        # print/view HTML endpoint
        r2 = requests.get(f"{BASE_URL}/invoices/{inv_id}/view", headers=_h(partner_token))
        assert r2.status_code == 200, r2.text
        body = r2.text
        assert "<html" in body.lower() or "<!doctype" in body.lower(), "view endpoint did not return HTML"


# ─── Booking Reschedule (Partner) ────────────────────────────────────
class TestBookingReschedule:
    def _pick_active(self, tok):
        r = requests.get(f"{BASE_URL}/bookings/partner/active", headers=_h(tok))
        assert r.status_code == 200, r.text
        return r.json() or []

    def test_reschedule_endpoints_exist(self, partner_token):
        """Sanity: endpoints must return 400/404 not 405 even without a schedulable job."""
        jobs = self._pick_active(partner_token)
        if not jobs:
            pytest.skip("no active jobs")
        b = jobs[0]
        # respond without pending → should error 400 (bad state), not 405/500
        r = requests.post(f"{BASE_URL}/bookings/{b['id']}/reschedule/respond", headers=_h(partner_token), json={"action": "accept"})
        assert r.status_code in (400, 404, 409, 422), r.text

    def test_reschedule_request_flow(self, partner_token):
        jobs = self._pick_active(partner_token)
        if not jobs:
            pytest.skip("no active jobs")
        # find scheduled job if any
        scheduled = [j for j in jobs if (j.get("schedule") or {}).get("is_scheduled")]
        if not scheduled:
            # non-scheduled: assert endpoint does not crash
            b = jobs[0]
            r = requests.post(f"{BASE_URL}/bookings/{b['id']}/reschedule/request", headers=_h(partner_token), json={"scheduled_at": "2030-01-01T10:00:00Z"})
            assert r.status_code in (200, 400, 409, 422), f"unexpected {r.status_code}: {r.text}"
            return
        b = scheduled[0]
        # cancel any existing pending first
        try:
            requests.post(f"{BASE_URL}/bookings/{b['id']}/reschedule/cancel", headers=_h(partner_token))
        except Exception:
            pass
        new_iso = "2030-06-15T14:30:00Z"
        r = requests.post(f"{BASE_URL}/bookings/{b['id']}/reschedule/request", headers=_h(partner_token), json={"scheduled_at": new_iso})
        assert r.status_code == 200, r.text
        # cleanup
        requests.post(f"{BASE_URL}/bookings/{b['id']}/reschedule/cancel", headers=_h(partner_token))


# ─── Merchant Payouts & Banks ────────────────────────────────────────
class TestMerchantPayouts:
    def test_finance_kyc_shape(self, merchant_token):
        r = requests.get(f"{BASE_URL}/merchant/panel/finance-kyc", headers=_h(merchant_token))
        assert r.status_code == 200, r.text
        d = r.json()
        assert "eligible" in d
        assert isinstance(d.get("blockers", []), list)

    def test_banks_list(self, merchant_token):
        r = requests.get(f"{BASE_URL}/merchant/panel/finance-kyc/banks", headers=_h(merchant_token))
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_bank_crud(self, merchant_token):
        payload = {
            "account_holder": "TEST_Sharma Electricals",
            "bank_name": "TEST_Bank",
            "account_number": "1234567890",
            "ifsc": "HDFC0000001",
            "upi_id": "test@upi",
            "passbook_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        }
        r = requests.post(f"{BASE_URL}/merchant/panel/finance-kyc/banks", headers=_h(merchant_token), json=payload)
        assert r.status_code in (200, 201), r.text
        added = r.json()
        bid = added.get("id") or (added.get("bank") or {}).get("id")
        if not bid:
            # some APIs return {"ok": True, "banks":[...]} — fetch and pick TEST_ one
            lst = requests.get(f"{BASE_URL}/merchant/panel/finance-kyc/banks", headers=_h(merchant_token)).json()
            tst = [b for b in lst if b.get("bank_name") == "TEST_Bank"]
            assert tst, "created bank not visible in list"
            bid = tst[0]["id"]
        # verify GET
        lst = requests.get(f"{BASE_URL}/merchant/panel/finance-kyc/banks", headers=_h(merchant_token)).json()
        assert any(b["id"] == bid for b in lst)
        # set primary — requires verified status; assert endpoint reachable with valid gate
        r2 = requests.post(f"{BASE_URL}/merchant/panel/finance-kyc/banks/{bid}/primary", headers=_h(merchant_token))
        assert r2.status_code in (200, 400), r2.text
        if r2.status_code == 400:
            assert "verified" in r2.text.lower()
        # delete
        r3 = requests.delete(f"{BASE_URL}/merchant/panel/finance-kyc/banks/{bid}", headers=_h(merchant_token))
        assert r3.status_code in (200, 204), r3.text

    def test_merchant_wallet(self, merchant_token):
        r = requests.get(f"{BASE_URL}/merchant/wallet", headers=_h(merchant_token))
        assert r.status_code == 200, r.text
        d = r.json()
        s = d.get("summary") or d
        assert any(k in s for k in ("available_balance", "balance", "withdrawable_balance")), f"wallet keys: {list(d.keys())}"


# ─── Regression: Partner Active/History/Payouts ─────────────────────
class TestPartnerRegression:
    def test_active(self, partner_token):
        r = requests.get(f"{BASE_URL}/bookings/partner/active", headers=_h(partner_token))
        assert r.status_code == 200

    def test_history(self, partner_token):
        for st in ("all", "completed", "cancelled"):
            r = requests.get(f"{BASE_URL}/bookings/partner/history?status={st}", headers=_h(partner_token))
            assert r.status_code == 200, f"history {st}: {r.text}"

    def test_partner_finance_kyc(self, partner_token):
        r = requests.get(f"{BASE_URL}/partner/finance-kyc", headers=_h(partner_token))
        assert r.status_code == 200

    def test_partner_wallet(self, partner_token):
        r = requests.get(f"{BASE_URL}/partner/wallet", headers=_h(partner_token))
        assert r.status_code == 200
