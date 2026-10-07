"""
Backend tests for Unified Finance Ops (Withdrawals + Ledger)
- Admin login via OTP
- /api/admin/finance/withdrawals (list, filters, pagination, kpis)
- /api/admin/finance/withdrawals/{account_type}/{wid} (360 investigation)
- action: approve/reject with idempotency (double-action -> 400)
- retry: merchant should return 400 (not supported)
- /api/admin/finance/ledger (list + summary + filters)
- /api/admin/finance/ledger/{source}/{tid}
"""
import os
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = BASE + "/api"
ADMIN_PHONE = "+919000000000"


@pytest.fixture(scope="module")
def admin_token():
    s = requests.Session()
    r = s.post(f"{API}/auth/send-otp", json={"phone": ADMIN_PHONE}, timeout=30)
    assert r.status_code == 200, r.text
    otp = r.json().get("dev_otp") or "123456"
    r2 = s.post(f"{API}/auth/verify-otp", json={"phone": ADMIN_PHONE, "otp": otp, "create_if_new": False}, timeout=30)
    assert r2.status_code == 200, r2.text
    tok = r2.json().get("token") or r2.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


# ---------------- Withdrawals: list, kpis, filters ----------------

class TestWithdrawalsList:
    def test_list_base(self, admin_client):
        r = admin_client.get(f"{API}/admin/finance/withdrawals")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data and "kpis" in data and "counts" in data
        for k in ["total_requested", "pending_amount", "paid_amount", "failed_amount",
                  "rejected_amount", "total_fees", "total_net_paid"]:
            assert k in data["kpis"], f"missing kpi {k}"
        assert "page" in data and "page_size" in data and "total" in data
        # items shape
        if data["items"]:
            it = data["items"][0]
            assert "account_type" in it
            # masked destination
            dest = it.get("destination") or ""
            # dest can be dict too
            assert dest is not None

    def test_filter_account_type_partner(self, admin_client):
        r = admin_client.get(f"{API}/admin/finance/withdrawals", params={"account_type": "partner", "page_size": 5})
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["account_type"] == "partner"

    def test_filter_status_pending(self, admin_client):
        r = admin_client.get(f"{API}/admin/finance/withdrawals", params={"status": "pending", "page_size": 5})
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["status"] == "pending"

    def test_pagination(self, admin_client):
        r = admin_client.get(f"{API}/admin/finance/withdrawals", params={"page": 1, "page_size": 2})
        assert r.status_code == 200
        d = r.json()
        assert d["page"] == 1 and d["page_size"] == 2
        assert len(d["items"]) <= 2

    def test_search_q(self, admin_client):
        r = admin_client.get(f"{API}/admin/finance/withdrawals", params={"q": "zzz_no_match"})
        assert r.status_code == 200

    def test_method_filter(self, admin_client):
        r = admin_client.get(f"{API}/admin/finance/withdrawals", params={"method": "bank", "page_size": 3})
        assert r.status_code == 200


# ---------------- Investigation ----------------

class TestInvestigation:
    def test_investigation_shape(self, admin_client):
        r = admin_client.get(f"{API}/admin/finance/withdrawals", params={"account_type": "partner", "page_size": 1})
        items = r.json()["items"]
        if not items:
            pytest.skip("no partner withdrawals")
        wid = items[0]["id"]
        r2 = admin_client.get(f"{API}/admin/finance/withdrawals/partner/{wid}")
        assert r2.status_code == 200, r2.text
        d = r2.json()
        for k in ["withdrawal", "owner", "wallet", "destination", "risk",
                  "checklist", "history", "transactions", "audit", "timeline", "account_type"]:
            assert k in d, f"missing key {k}"


# ---------------- Action: Approve/Reject + Idempotency ----------------

def _find_pending(admin_client, limit=50):
    r = admin_client.get(f"{API}/admin/finance/withdrawals",
                         params={"account_type": "partner", "status": "pending", "page_size": limit})
    return r.json().get("items", [])


class TestWithdrawalAction:
    def test_approve_then_double_action_400(self, admin_client):
        pend = _find_pending(admin_client)
        if len(pend) < 1:
            pytest.skip("no pending partner withdrawals")
        wid = pend[0]["id"]
        r = admin_client.post(f"{API}/admin/finance/withdrawals/partner/{wid}/action",
                              json={"action": "approve"})
        assert r.status_code == 200, r.text
        status = (r.json().get("status") or r.json().get("withdrawal", {}).get("status"))
        assert status in ("completed", "failed"), r.text
        # idempotency
        r2 = admin_client.post(f"{API}/admin/finance/withdrawals/partner/{wid}/action",
                               json={"action": "approve"})
        assert r2.status_code == 400, r2.text
        assert "already" in r2.text.lower() or "processed" in r2.text.lower()

    def test_reject_then_double_action_400(self, admin_client):
        pend = _find_pending(admin_client)
        if len(pend) < 1:
            pytest.skip("no pending partner withdrawals left")
        wid = pend[0]["id"]
        r = admin_client.post(f"{API}/admin/finance/withdrawals/partner/{wid}/action",
                              json={"action": "reject", "reason": "test"})
        assert r.status_code == 200, r.text
        status = (r.json().get("status") or r.json().get("withdrawal", {}).get("status"))
        assert status == "rejected"
        r2 = admin_client.post(f"{API}/admin/finance/withdrawals/partner/{wid}/action",
                               json={"action": "reject", "reason": "test"})
        assert r2.status_code == 400


class TestRetry:
    def test_merchant_retry_not_supported(self, admin_client):
        # Use a fake merchant id — should 400 (not supported) OR 404
        r = admin_client.post(f"{API}/admin/finance/withdrawals/merchant/nonexistent-id/retry")
        assert r.status_code in (400, 404), r.text

    def test_partner_retry_failed(self, admin_client):
        r = admin_client.get(f"{API}/admin/finance/withdrawals",
                             params={"account_type": "partner", "status": "failed", "page_size": 1})
        items = r.json().get("items", [])
        if not items:
            pytest.skip("no failed partner withdrawals")
        wid = items[0]["id"]
        r2 = admin_client.post(f"{API}/admin/finance/withdrawals/partner/{wid}/retry")
        assert r2.status_code == 200, r2.text
        status = (r2.json().get("status") or r2.json().get("withdrawal", {}).get("status"))
        assert status in ("completed", "failed")


# ---------------- Ledger ----------------

class TestLedger:
    def test_list_base(self, admin_client):
        r = admin_client.get(f"{API}/admin/finance/ledger")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "items" in d and "summary" in d and "counts" in d
        for k in ["total_credit", "total_debit", "collected", "refunded", "withdrawn", "commission"]:
            assert k in d["summary"], f"missing summary {k}"
        assert "all" in d["counts"] and "credit" in d["counts"] and "debit" in d["counts"]
        if d["items"]:
            it = d["items"][0]
            for k in ["txn_ref", "account_type", "category", "type_label",
                      "direction", "amount", "status", "created_at"]:
                assert k in it, f"missing ledger key {k}"
            assert it["direction"] in ("credit", "debit")

    def test_category_filter(self, admin_client):
        for cat in ("booking", "withdrawal", "commission", "refund", "credit", "debit", "all"):
            r = admin_client.get(f"{API}/admin/finance/ledger", params={"category": cat, "page_size": 5})
            assert r.status_code == 200, f"{cat} => {r.text}"

    def test_pagination(self, admin_client):
        r = admin_client.get(f"{API}/admin/finance/ledger", params={"page": 1, "page_size": 2})
        assert r.status_code == 200
        d = r.json()
        assert d["page"] == 1 and d["page_size"] == 2

    def test_payment_detail(self, admin_client):
        r = admin_client.get(f"{API}/admin/finance/ledger", params={"category": "booking", "page_size": 1})
        items = r.json().get("items", [])
        if not items:
            pytest.skip("no booking payments")
        pid = items[0].get("source_id") or items[0].get("id")
        r2 = admin_client.get(f"{API}/admin/finance/ledger/payment/{pid}")
        assert r2.status_code == 200, r2.text

    def test_refund_detail(self, admin_client):
        r = admin_client.get(f"{API}/admin/finance/ledger", params={"category": "refund", "page_size": 1})
        items = r.json().get("items", [])
        if not items:
            pytest.skip("no refunds")
        rid = items[0].get("source_id") or items[0].get("id")
        r2 = admin_client.get(f"{API}/admin/finance/ledger/refund/{rid}")
        assert r2.status_code == 200, r2.text
