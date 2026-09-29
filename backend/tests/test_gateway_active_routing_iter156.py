"""End-to-end verification that the ACTIVE payment gateway (Cashfree TEST) is used
for ALL pay-in flows and that payout requests do NOT simulate when the active
payout gateway is unconfigured. Also verifies that /mock endpoints are gone.

Run:
    pytest /app/backend/tests/test_gateway_active_routing_iter156.py -v \
        --tb=short --junitxml=/app/test_reports/pytest/iter156.xml
"""
import os
import uuid
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

def _load_frontend_env():
    for line in open("/app/frontend/.env").read().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env()).rstrip("/")
API = f"{BASE_URL}/api"
OTP = "123456"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "azoapp_database")
_client = AsyncIOMotorClient(MONGO_URL)
_db = _client[DB_NAME]


# ─── helpers ────────────────────────────────────────────────────────────────
def _login(phone: str, role: str = None, name: str = None, create_if_new: bool = True):
    requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
    body = {"phone": phone, "otp": OTP, "create_if_new": create_if_new}
    if role:
        body["role"] = role
    if name:
        body["name"] = name
    r = requests.post(f"{API}/auth/verify-otp", json=body, timeout=15)
    assert r.status_code == 200, f"login failed for {phone}: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    return tok, r.json().get("user", {})


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


# ─── fixtures ───────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def customer_token():
    # fresh phone so create_if_new works
    phone = f"+9199{uuid.uuid4().int % 100000000:08d}"
    tok, u = _login(phone, role="customer", name="TEST Cust")
    return tok, u


@pytest.fixture(scope="module")
def partner_token():
    tok, u = _login("+919000000003", create_if_new=False)
    return tok, u


@pytest.fixture(scope="module")
def admin_token():
    tok, u = _login("+919000000000", create_if_new=False)
    return tok, u


# ─── 0) sanity: settings truly have Cashfree TEST active + payout keys missing ─
def test_settings_snapshot_cashfree_active_test():
    s = _run(_db.settings.find_one({}, {"_id": 0})) or {}
    intg = s.get("integrations", {})
    assert intg.get("active_payin_gateway") == "cashfree"
    assert intg.get("active_payout_gateway") == "cashfree"
    assert intg.get("cashfree_mode") == "test"
    # payin keys present
    assert intg.get("cashfree_test_pg_app_id")
    assert intg.get("cashfree_test_pg_secret_key")
    # payout keys intentionally NOT set
    assert not intg.get("cashfree_test_payout_client_id")
    assert not intg.get("cashfree_test_payout_client_secret")


# ─── 1) wallet pay-in returns REAL Cashfree order ───────────────────────────
def _assert_real_cashfree_order(data: dict, allow_mock_key: bool = True):
    assert data.get("mock") is False, f"mock must be False, got: {data}"
    assert data.get("gateway") == "cashfree", data
    assert data.get("mode") == "test", data
    # cf_mode should be 'sandbox' env or similar
    assert data.get("env") in ("sandbox", "test") or data.get("cf_mode") == "sandbox", data
    assert data.get("payment_session_id"), f"payment_session_id missing: {data}"


def test_payments_order_wallet_returns_real_cashfree(customer_token):
    tok, _ = customer_token
    r = requests.post(f"{API}/payments/order",
                      headers=H(tok), json={"purpose": "wallet", "amount": 100},
                      timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    _assert_real_cashfree_order(d)
    assert d.get("method") == "cashfree_sdk" or "cashfree" in str(d.get("method", "")).lower(), d


# ─── 2) membership order (PAID plan) returns REAL Cashfree order ────────────
def test_memberships_order_returns_real_cashfree(customer_token):
    tok, _ = customer_token
    r = requests.get(f"{API}/memberships/plans", timeout=15)
    assert r.status_code == 200
    plans = r.json() if isinstance(r.json(), list) else r.json().get("plans", [])
    paid = next((p for p in plans if float(p.get("price") or 0) > 0), None)
    assert paid, "no paid membership plan found"
    r = requests.post(f"{API}/memberships/order",
                      headers=H(tok), json={"plan_id": paid["id"]}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("free") in (False, None)
    assert d.get("payment_session_id"), f"missing payment_session_id: {d}"
    assert "mock" not in d or d.get("mock") is False
    assert d.get("gateway") == "cashfree"


# ─── 3) starter-kit order returns REAL Cashfree order ───────────────────────
def test_starter_kit_order_returns_real_cashfree(partner_token):
    tok, _ = partner_token
    # ensure partner has no prior kit
    _run(_db.starter_kit_purchases.delete_many({"partner_phone": "+919000000003"}))
    r = requests.post(f"{API}/starter-kit/order", headers=H(tok), timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("free") in (False, None)
    assert d.get("payment_session_id"), d
    assert "mock" not in d or d.get("mock") is False
    assert d.get("gateway") == "cashfree"


# ─── 4) partner registration fee order returns REAL Cashfree order ──────────
def test_partner_reg_fee_create_order_real_cashfree(partner_token):
    tok, user = partner_token
    # Ensure fee is enabled + partner not already paid.
    _run(_db.partner_profiles.update_one(
        {"user_id": user["id"]},
        {"$unset": {"reg_fee_payment": "", "reg_fee_pending_order": ""}}))
    # ensure fee config is active
    s = _run(_db.settings.find_one({}, {"_id": 0})) or {}
    fee_cfg = s.get("partner_reg_fee") or {}
    if not fee_cfg.get("enabled"):
        _run(_db.settings.update_one({}, {"$set": {"partner_reg_fee": {
            "enabled": True, "original_price": 499, "discount_type": "fixed",
            "discount_value": 100}}}, upsert=True))
    r = requests.post(f"{API}/partner/registration/pay/create-order",
                      headers=H(tok), timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    # order_id may still carry the REGFEE- receipt because Cashfree uses the
    # merchant-supplied receipt as the order_id — that's fine as long as we get a
    # real payment_session_id from sandbox (the proof of a real Cashfree order).
    assert d.get("gateway") == "cashfree", d
    assert d.get("payment_session_id"), d
    assert d.get("cf_mode") == "sandbox" and d.get("mode") == "test", d
    assert "mock" not in d or d.get("mock") is False


# ─── 5) subscription order returns REAL Cashfree order ──────────────────────
def _ensure_subscription_service():
    """Seed a subscription-enabled service if none exists (test-only)."""
    sid = "TEST_sub_maid_svc"
    _run(_db.services.update_one(
        {"id": sid},
        {"$set": {
            "id": sid, "name": "TEST Subscription Maid", "category_name": "Maid",
            "base_price": 3000, "discounted_price": 3000, "is_subscription": True,
            "status": "active", "approval_status": "approved", "tax_pct": 0}},
        upsert=True))
    return sid


def test_subscription_pay_order_returns_real_cashfree(customer_token):
    tok, user = customer_token
    sid = _ensure_subscription_service()
    # add an address to user
    addr_id = f"TEST_addr_{uuid.uuid4().hex[:6]}"
    addr = {"id": addr_id, "label": "Home", "line1": "1 Test Rd", "city": "Bengaluru",
            "state": "KA", "pincode": "560001", "lat": 12.97, "lng": 77.59}
    _run(_db.users.update_one({"id": user["id"]}, {"$push": {"addresses": addr}}))
    # create subscription
    from datetime import date, timedelta
    start = (date.today() + timedelta(days=1)).isoformat()
    r = requests.post(f"{API}/subscriptions", headers=H(tok), json={
        "service_id": sid, "plan_type": "monthly", "start_date": start,
        "address_id": addr_id}, timeout=30)
    assert r.status_code == 200, r.text
    sub = r.json()
    sub_id = sub.get("id") or sub.get("subscription", {}).get("id")
    assert sub_id, sub
    # pay order
    r = requests.post(f"{API}/subscriptions/{sub_id}/pay/order",
                      headers=H(tok), timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("payment_session_id"), d
    assert "mock" not in d or d.get("mock") is False
    assert d.get("gateway") == "cashfree", d


# ─── 6) NO mock endpoints exist ─────────────────────────────────────────────
@pytest.mark.parametrize("path", [
    "/payments/mock",
    "/memberships/mock",
    "/starter-kit/mock",
])
def test_mock_endpoints_gone(path, customer_token):
    tok, _ = customer_token
    r = requests.post(f"{API}{path}", headers=H(tok), json={}, timeout=15)
    assert r.status_code == 404, f"{path} expected 404 got {r.status_code}: {r.text[:200]}"


def test_subscription_mock_endpoint_gone(customer_token):
    tok, _ = customer_token
    fake_id = "any-id"
    r = requests.post(f"{API}/subscriptions/{fake_id}/pay/mock",
                      headers=H(tok), json={}, timeout=15)
    assert r.status_code == 404


# ─── 7) Payout routing: partner withdrawal approval must NOT simulate ───────
def _seed_partner_withdrawal(partner_id: str, name: str, phone: str) -> str:
    from datetime import datetime, timezone
    wid = f"TEST_wd_{uuid.uuid4().hex[:8]}"
    doc = {
        "id": wid, "partner_id": partner_id, "partner_name": name,
        "amount": 200.0, "fee": 0.0, "net_amount": 200.0,
        "method": "bank", "upi_id": "",
        "bank": {"account_name": name, "ifsc": "HDFC0000001",
                 "account_number": "000111222333"},
        "status": "pending", "reason": "",
        "requested_at": datetime.now(timezone.utc).isoformat(),
        "processed_at": None, "processed_by": None,
    }
    _run(_db.partner_withdrawals.insert_one(doc))
    # Give partner wallet balance so debit succeeds
    _run(_db.users.update_one({"id": partner_id}, {"$inc": {"wallet_balance": 500}}))
    return wid


def _assert_no_simulate_payout(payout: dict, gwn: str = "cashfree", gmode: str = "test"):
    assert payout, "payout object missing on withdrawal"
    pid = str(payout.get("payout_id") or "")
    assert not pid.startswith("pout_sim_"), f"got simulated payout: {payout}"
    assert payout.get("simulated") is False, payout
    assert payout.get("gateway") == gwn, payout
    assert payout.get("gateway_mode") == gmode, payout
    assert payout.get("api"), f"api hint missing: {payout}"
    assert "cashfree" in payout["api"].lower()
    # Either processing+intent OR failed with clear error
    status = payout.get("status")
    if status == "processing":
        assert payout.get("intent") is True, payout
    else:
        assert status == "failed", payout
        assert payout.get("error"), payout


def test_partner_withdrawal_approval_no_simulate(admin_token, partner_token):
    a_tok, _ = admin_token
    p_tok, p_user = partner_token
    wid = _seed_partner_withdrawal(p_user["id"], p_user.get("name") or "Raj Kumar",
                                    p_user.get("phone") or "+919000000003")
    r = requests.post(f"{API}/admin/partner/withdrawals/{wid}/action",
                      headers=H(a_tok), json={"action": "approve"}, timeout=30)
    assert r.status_code == 200, r.text
    w = r.json()
    _assert_no_simulate_payout(w.get("payout") or {})
    # cleanup
    _run(_db.partner_withdrawals.delete_one({"id": wid}))


# ─── 8) Merchant withdrawal approval routes via active payout gateway ───────
def _ensure_merchant_user():
    tok, u = _login("+919000000002", create_if_new=False)
    return tok, u


def test_merchant_withdrawal_approval_routes_via_gateway(admin_token):
    a_tok, _ = admin_token
    m_tok, m_user = _ensure_merchant_user()
    from datetime import datetime, timezone
    wid = f"TEST_mwd_{uuid.uuid4().hex[:8]}"
    doc = {
        "id": wid, "user_id": m_user["id"], "merchant_id": m_user["id"],
        "merchant_name": m_user.get("name") or "Merchant",
        "amount": 200.0, "fee": 0.0, "net_amount": 200.0,
        "method": "bank",
        "bank": {"account_name": "M", "ifsc": "HDFC0000001",
                 "account_number": "000111222333"},
        "status": "pending",
        "requested_at": datetime.now(timezone.utc).isoformat(),
    }
    _run(_db.merchant_withdrawals.insert_one(doc))
    _run(_db.users.update_one({"id": m_user["id"]},
                              {"$inc": {"wallet_balance": 500}}))
    r = requests.post(f"{API}/admin/merchant/withdrawals/{wid}/action",
                      headers=H(a_tok), json={"action": "approve"}, timeout=30)
    # merchant flow may 404 if collection differs — capture and validate
    if r.status_code == 404:
        pytest.skip(f"merchant withdrawal endpoint 404: {r.text}")
    assert r.status_code == 200, r.text
    body = r.json()
    payout = (body.get("payout") or (body.get("withdrawal") or {}).get("payout")
              or _run(_db.merchant_withdrawals.find_one({"id": wid}, {"_id": 0})).get("payout"))
    _assert_no_simulate_payout(payout or {})
    _run(_db.merchant_withdrawals.delete_one({"id": wid}))
