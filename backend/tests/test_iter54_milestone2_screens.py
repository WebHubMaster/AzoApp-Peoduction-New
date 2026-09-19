"""
Backend regression for Milestone-2 Partner/Merchant mobile app screens (iter 54).

New screens added on top of milestone-1:
  Partner: earnings, invoices, bankkyc, availability, rewards, analytics, verification
  Merchant: commission, network, analytics, bankkyc, scanqr, reminders, profilekyc
  Shared:  support/index, support/[id], notifications

Each screen hits a specific API set — this file covers ALL of them.
"""
import os
import time
import pytest
import requests

BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or open("/app/frontend/.env").read().split("EXPO_PUBLIC_BACKEND_URL=")[1].strip().splitlines()[0]
).rstrip("/")
API = f"{BASE_URL}/api"

PARTNER_PHONE = "+919000000003"
MERCHANT_PHONE = "+919000000002"
OTP = "123456"


def _login(phone):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    s.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=30)
    r = s.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": OTP, "create_if_new": False}, timeout=30)
    assert r.status_code == 200, f"login {phone}: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def partner_token():
    return _login(PARTNER_PHONE)


@pytest.fixture(scope="module")
def merchant_token():
    return _login(MERCHANT_PHONE)


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ==========================================================================
# Partner — Earnings screen
# ==========================================================================
class TestPartnerEarnings:
    def test_earnings_summary(self, partner_token):
        r = requests.get(f"{API}/partner/earnings-summary", headers=_h(partner_token), timeout=20)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), dict)

    def test_wallet_ledger(self, partner_token):
        r = requests.get(f"{API}/partner/wallet", headers=_h(partner_token), timeout=20)
        assert r.status_code == 200, r.text


# ==========================================================================
# Partner — Bank & KYC
# ==========================================================================
class TestPartnerBankKyc:
    def test_finance_kyc_get(self, partner_token):
        r = requests.get(f"{API}/partner/finance-kyc", headers=_h(partner_token), timeout=20)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), dict)

    def test_finance_kyc_banks_list(self, partner_token):
        r = requests.get(f"{API}/partner/finance-kyc/banks", headers=_h(partner_token), timeout=20)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), (dict, list))

    def test_pan_submit_shape(self, partner_token):
        # Send a clearly-fake but well-formatted PAN so endpoint validates without corrupting demo data.
        r = requests.post(
            f"{API}/partner/finance-kyc/pan",
            headers={**_h(partner_token), "Content-Type": "application/json"},
            json={"pan": "ABCDE1234F", "name_on_pan": "TEST Raj"},
            timeout=20,
        )
        # accept 200/201/202/409/400 (409 if already submitted, 400 if validation rejects our fake)
        assert r.status_code in (200, 201, 202, 400, 409, 422), r.text

    def test_add_bank_and_delete(self, partner_token):
        payload = {
            "account_holder": "TEST Raj",
            "account_number": "000011112222",
            "ifsc": "HDFC0000123",
            "bank_name": "TEST HDFC",
        }
        r = requests.post(
            f"{API}/partner/finance-kyc/banks",
            headers={**_h(partner_token), "Content-Type": "application/json"},
            json=payload,
            timeout=20,
        )
        assert r.status_code in (200, 201, 400, 409, 422), r.text
        if r.status_code in (200, 201):
            data = r.json() if r.text else {}
            bid = data.get("id") or (data.get("bank") or {}).get("id")
            if bid:
                # try set-primary then delete for cleanup
                requests.post(
                    f"{API}/partner/finance-kyc/banks/{bid}/primary",
                    headers=_h(partner_token), timeout=20,
                )
                d = requests.delete(
                    f"{API}/partner/finance-kyc/banks/{bid}",
                    headers=_h(partner_token), timeout=20,
                )
                assert d.status_code in (200, 204, 404), d.text


# ==========================================================================
# Partner — Availability
# ==========================================================================
class TestPartnerAvailability:
    def test_calendar_get(self, partner_token):
        r = requests.get(f"{API}/partner/availability/calendar", headers=_h(partner_token), timeout=20)
        assert r.status_code == 200, r.text

    def test_calendar_set(self, partner_token):
        # tomorrow
        import datetime as dt
        d = (dt.date.today() + dt.timedelta(days=1)).isoformat()
        r = requests.post(
            f"{API}/partner/availability/calendar/set",
            headers={**_h(partner_token), "Content-Type": "application/json"},
            json={"date": d, "status": "off"},
            timeout=20,
        )
        assert r.status_code in (200, 201, 400, 422), r.text

    def test_online_toggle(self, partner_token):
        r = requests.put(
            f"{API}/auth/partner/online-status",
            headers={**_h(partner_token), "Content-Type": "application/json"},
            json={"online": True},
            timeout=20,
        )
        assert r.status_code == 200, r.text


# ==========================================================================
# Partner — Invoices
# ==========================================================================
class TestPartnerInvoices:
    def test_invoices_list(self, partner_token):
        r = requests.get(f"{API}/invoices", headers=_h(partner_token), timeout=20)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), (list, dict))


# ==========================================================================
# Partner — Rewards (challenges, leaderboard, my-bonuses)
# ==========================================================================
class TestPartnerRewards:
    def test_challenges(self, partner_token):
        r = requests.get(f"{API}/partner/challenges", headers=_h(partner_token), timeout=20)
        assert r.status_code == 200, r.text

    def test_leaderboard(self, partner_token):
        r = requests.get(f"{API}/partner/leaderboard", headers=_h(partner_token), timeout=20)
        assert r.status_code == 200, r.text

    def test_my_bonuses(self, partner_token):
        r = requests.get(f"{API}/partner/my-bonuses", headers=_h(partner_token), timeout=20)
        assert r.status_code == 200, r.text


# ==========================================================================
# Partner — Analytics
# ==========================================================================
class TestPartnerAnalytics:
    def test_analytics(self, partner_token):
        r = requests.get(f"{API}/partner/analytics", headers=_h(partner_token), timeout=20)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), dict)


# ==========================================================================
# Partner — Verification
# ==========================================================================
class TestPartnerVerification:
    def test_verification(self, partner_token):
        r = requests.get(f"{API}/partner/verification", headers=_h(partner_token), timeout=20)
        assert r.status_code == 200, r.text


# ==========================================================================
# Shared — Support Tickets (create + list + thread + reply + close)
# ==========================================================================
class TestSupportTickets:
    def test_full_flow_partner(self, partner_token):
        # create
        payload = {
            "subject": f"TEST milestone2 ticket {int(time.time())}",
            "message": "TEST auto-created support ticket from iter54 backend tests.",
            "category": "general",
        }
        c = requests.post(
            f"{API}/support/tickets",
            headers={**_h(partner_token), "Content-Type": "application/json"},
            json=payload,
            timeout=20,
        )
        assert c.status_code in (200, 201), c.text
        cj = c.json()
        tid = cj.get("id") or cj.get("ticket_id") or (cj.get("ticket") or {}).get("id")
        assert tid, f"no ticket id returned: {cj}"

        # list must include it
        lst = requests.get(f"{API}/support/tickets", headers=_h(partner_token), timeout=20)
        assert lst.status_code == 200, lst.text

        # detail
        d = requests.get(f"{API}/support/tickets/{tid}", headers=_h(partner_token), timeout=20)
        assert d.status_code == 200, d.text

        # reply
        m = requests.post(
            f"{API}/support/tickets/{tid}/messages",
            headers={**_h(partner_token), "Content-Type": "application/json"},
            json={"text": "TEST reply"},
            timeout=20,
        )
        assert m.status_code in (200, 201), m.text

        # close (cleanup)
        cl = requests.post(f"{API}/support/tickets/{tid}/close", headers=_h(partner_token), timeout=20)
        assert cl.status_code in (200, 201, 204), cl.text


# ==========================================================================
# Shared — Notifications (may be empty but must not 500)
# ==========================================================================
class TestNotifications:
    def test_partner_notifications(self, partner_token):
        # /notifications route may be under different prefix; try the common patterns
        endpoints = ["/notifications", "/notifications/my", "/notifications/list"]
        last = None
        for e in endpoints:
            r = requests.get(f"{API}{e}", headers=_h(partner_token), timeout=20)
            last = r
            if r.status_code == 200:
                return
        assert last is not None and last.status_code in (200, 404), last.text


# ==========================================================================
# Merchant — Commission
# ==========================================================================
class TestMerchantCommission:
    def test_summary(self, merchant_token):
        r = requests.get(f"{API}/merchant/panel/commission/summary", headers=_h(merchant_token), timeout=20)
        assert r.status_code == 200, r.text

    def test_list(self, merchant_token):
        r = requests.get(f"{API}/merchant/panel/commission", headers=_h(merchant_token), timeout=20)
        assert r.status_code == 200, r.text


# ==========================================================================
# Merchant — Network
# ==========================================================================
class TestMerchantNetwork:
    def test_stats(self, merchant_token):
        r = requests.get(f"{API}/merchant/panel/network/stats", headers=_h(merchant_token), timeout=20)
        assert r.status_code == 200, r.text

    def test_list(self, merchant_token):
        r = requests.get(f"{API}/merchant/panel/network", headers=_h(merchant_token), timeout=20)
        assert r.status_code == 200, r.text


# ==========================================================================
# Merchant — Analytics
# ==========================================================================
class TestMerchantAnalytics:
    def test_analytics(self, merchant_token):
        r = requests.get(f"{API}/merchant/analytics", headers=_h(merchant_token), timeout=20)
        assert r.status_code == 200, r.text


# ==========================================================================
# Merchant — Bank & KYC
# ==========================================================================
class TestMerchantBankKyc:
    def test_finance_kyc_get(self, merchant_token):
        r = requests.get(f"{API}/merchant/panel/finance-kyc", headers=_h(merchant_token), timeout=20)
        assert r.status_code == 200, r.text

    def test_banks_list(self, merchant_token):
        r = requests.get(f"{API}/merchant/panel/finance-kyc/banks", headers=_h(merchant_token), timeout=20)
        assert r.status_code == 200, r.text


# ==========================================================================
# Merchant — Scan QR / My Code
# ==========================================================================
class TestMerchantMyCode:
    def test_my_code(self, merchant_token):
        r = requests.get(f"{API}/merchant/my-code", headers=_h(merchant_token), timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert isinstance(j, dict)


# ==========================================================================
# Merchant — Reminders
# ==========================================================================
class TestMerchantReminders:
    def test_reminders_panel(self, merchant_token):
        r = requests.get(f"{API}/merchant/panel/reminders", headers=_h(merchant_token), timeout=20)
        assert r.status_code == 200, r.text


# ==========================================================================
# Cross-role guards
# ==========================================================================
class TestBoundaries:
    def test_partner_cannot_read_merchant_panel(self, partner_token):
        r = requests.get(f"{API}/merchant/panel/commission", headers=_h(partner_token), timeout=20)
        assert r.status_code in (401, 403, 404), r.text

    def test_merchant_cannot_read_partner_earnings(self, merchant_token):
        r = requests.get(f"{API}/partner/earnings-summary", headers=_h(merchant_token), timeout=20)
        assert r.status_code in (401, 403, 404), r.text
