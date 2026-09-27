"""Backend tests for the new Subscription (recurring booking) module.

Covers:
  - admin creates subscription service (catalog) with is_subscription + plans
  - customer plan preview financials
  - customer create subscription (schedule + snapshot fields)
  - commission snapshot immutability after admin settings change
  - mock upfront payment activates the subscription
  - admin list eligible partners + assign
  - partner completes days / weekly-off rejection / non-assigned partner 403
  - admin marks day maid_absent, weekly_off (neutral), customer_cancel (neutral),
    replacement_completed (replacement earns)
  - full 10000 / 26 wd / 20% reconciliation example
  - finalize + settlement lifecycle (review -> approve -> pay) with wallet credit
  - pay rejected before approve
  - GET /mine (customer), /partner/mine (partner), admin/all + admin/stats
  - existing one-time (non-subscription) catalog create still works
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_PHONE = "+919000000000"
CUSTOMER_PHONE = "+919000000004"
PARTNER_PHONE = "+919000000003"
OTP = "123456"


# ---------------- helpers ----------------
def _login(phone):
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=30)
    assert r.status_code == 200, f"send-otp failed for {phone}: {r.status_code} {r.text}"
    r = requests.post(f"{API}/auth/verify-otp",
                      json={"phone": phone, "otp": OTP}, timeout=30)
    assert r.status_code == 200, f"verify-otp failed for {phone}: {r.status_code} {r.text}"
    return r.json()["token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN_PHONE)


@pytest.fixture(scope="session")
def customer_token():
    return _login(CUSTOMER_PHONE)


@pytest.fixture(scope="session")
def partner_token():
    return _login(PARTNER_PHONE)


@pytest.fixture(scope="session")
def customer_me(customer_token):
    r = requests.get(f"{API}/auth/me", headers=_hdr(customer_token), timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def partner_me(partner_token):
    r = requests.get(f"{API}/auth/me", headers=_hdr(partner_token), timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _ensure_customer_address(customer_token, customer_me):
    """Ensure customer has at least one saved address; return its id + dict."""
    addrs = customer_me.get("addresses") or []
    if addrs:
        return addrs[0]
    # Try common address add endpoints
    payload = {"label": "Home", "line1": "Test Line 1", "city": "TestCity",
               "state": "TS", "pincode": "560001", "lat": 12.9, "lng": 77.6}
    for url in [f"{API}/profile/addresses", f"{API}/addresses", f"{API}/auth/me/address"]:
        r = requests.post(url, headers=_hdr(customer_token), json=payload, timeout=15)
        if r.status_code in (200, 201):
            break
    return payload


@pytest.fixture(scope="session")
def category_id(admin_token):
    """Reuse any existing category, else create one."""
    r = requests.get(f"{API}/catalog/admin/categories", headers=_hdr(admin_token), timeout=15)
    if r.status_code == 200 and r.json():
        return r.json()[0]["id"]
    r = requests.post(f"{API}/catalog/categories", headers=_hdr(admin_token),
                      json={"name": f"TEST_Cat_{uuid.uuid4().hex[:6]}"}, timeout=15)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _create_sub_service(admin_token, category_id, price=10000, working_days=26,
                       weekly_offs=None, duration_days=30):
    if weekly_offs is None:
        weekly_offs = [6]
    body = {
        "category_id": category_id,
        "name": f"TEST_SubService_{uuid.uuid4().hex[:6]}",
        "short_description": "Recurring maid",
        "base_price": price,
        "discounted_price": price,
        "tax_pct": 0,
        "is_subscription": True,
        "subscription_plans": [{
            "plan_type": "monthly", "label": "Monthly",
            "price": price, "duration_days": duration_days,
            "working_days": working_days, "weekly_offs": weekly_offs,
        }],
    }
    r = requests.post(f"{API}/catalog/services",
                      headers=_hdr(admin_token), json=body, timeout=20)
    assert r.status_code in (200, 201), f"create service failed: {r.status_code} {r.text}"
    return r.json()


def _set_commission(admin_token, pct):
    r = requests.put(f"{API}/admin/settings", headers=_hdr(admin_token),
                     json={"commission": {"platform_pct": pct,
                                          "subscription_commission_pct": pct}}, timeout=15)
    assert r.status_code == 200, f"set commission failed: {r.status_code} {r.text}"
    return r.json()


# ---------------- TESTS ----------------

# --- 1. Admin creates a subscription-enabled service ---
def test_admin_create_subscription_service_persists_fields(admin_token, category_id):
    svc = _create_sub_service(admin_token, category_id)
    assert svc.get("is_subscription") is True
    plans = svc.get("subscription_plans") or []
    assert len(plans) == 1
    p = plans[0]
    assert p["plan_type"] == "monthly"
    assert float(p["price"]) == 10000
    assert int(p["working_days"]) == 26
    assert p["weekly_offs"] == [6]

    # GET back and re-verify persistence
    r = requests.get(f"{API}/catalog/admin/services/{svc['id']}",
                     headers=_hdr(admin_token), timeout=15)
    assert r.status_code == 200
    got = r.json()
    assert got["is_subscription"] is True
    assert (got.get("subscription_plans") or [])[0]["working_days"] == 26


# --- 2. Plan preview financials ---
def test_plan_preview_financials(admin_token, customer_token, category_id):
    _set_commission(admin_token, 20)
    svc = _create_sub_service(admin_token, category_id)
    r = requests.get(f"{API}/subscriptions/plans/{svc['id']}",
                     headers=_hdr(customer_token), timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    plans = data.get("plans") or []
    monthly = next(p for p in plans if p["plan_type"] == "monthly")
    price = float(monthly["price"])
    commission_amount = float(monthly["commission_amount"])
    tax_amount = float(monthly["tax_amount"])
    partner_alloc = float(monthly["partner_allocation"])
    per_day = float(monthly["per_day_earning"])
    wd = int(monthly["working_days"])

    assert wd == 26
    assert abs(commission_amount - 2000) < 0.01
    assert abs(tax_amount - 0) < 0.01
    assert abs(partner_alloc - (price - commission_amount - tax_amount)) < 0.01
    assert abs(partner_alloc - 8000) < 0.01
    assert abs(per_day - (partner_alloc / wd)) < 0.02


# --- 3. Customer creates subscription with snapshot ---
@pytest.fixture(scope="session")
def created_subscription(admin_token, customer_token, customer_me, category_id):
    _set_commission(admin_token, 20)
    svc = _create_sub_service(admin_token, category_id)
    address = _ensure_customer_address(customer_token, customer_me)
    # start yesterday so we can mark today's days as completed
    from datetime import date, timedelta
    start = (date.today() - timedelta(days=1)).isoformat()
    body = {
        "service_id": svc["id"], "plan_type": "monthly",
        "start_date": start, "preferred_time": "09:00",
        "address": address, "notes": "TEST subscription",
    }
    r = requests.post(f"{API}/subscriptions", headers=_hdr(customer_token),
                      json=body, timeout=20)
    assert r.status_code == 200, f"create sub failed: {r.status_code} {r.text}"
    sub = r.json()
    return {"service": svc, "sub": sub}


def test_create_subscription_schedule_and_snapshot(created_subscription):
    sub = created_subscription["sub"]
    assert sub["status"] == "pending_payment"
    assert sub["payment_status"] == "pending"
    assert sub["working_days"] == 26
    assert abs(float(sub["commission_amount"]) - 2000) < 0.01
    assert abs(float(sub["partner_allocation"]) - 8000) < 0.01
    assert abs(float(sub["per_day_earning"]) - (8000 / 26)) < 0.02
    sched = sub.get("schedule") or []
    assert len(sched) == 30
    off_days = [d for d in sched if d["status"] == "weekly_off"]
    # 30 days starting anywhere -> 4 or 5 Sundays
    assert len(off_days) in (4, 5)


# --- 4. Snapshot immutability ---
def test_snapshot_immutability_after_commission_change(admin_token, created_subscription):
    sub_id = created_subscription["sub"]["id"]
    original_pct = created_subscription["sub"]["commission_pct"]
    original_amount = created_subscription["sub"]["commission_amount"]
    # bump commission
    _set_commission(admin_token, 50)
    r = requests.get(f"{API}/subscriptions/{sub_id}",
                     headers=_hdr(admin_token), timeout=15)
    assert r.status_code == 200
    got = r.json()
    assert got["commission_pct"] == original_pct
    assert got["commission_amount"] == original_amount
    # restore
    _set_commission(admin_token, 20)


# --- 5. Upfront mock payment activates ---
def test_pay_mock_activates(customer_token, created_subscription):
    sub_id = created_subscription["sub"]["id"]
    r = requests.post(f"{API}/subscriptions/{sub_id}/pay/mock",
                      headers=_hdr(customer_token), timeout=20)
    assert r.status_code == 200, r.text
    sub = r.json()
    assert sub["status"] == "active"
    assert sub["payment_status"] == "paid"


# --- 6. Admin lists partners + assign ---
def test_admin_list_partners_and_assign(admin_token, partner_me, created_subscription):
    sub_id = created_subscription["sub"]["id"]
    r = requests.get(f"{API}/subscriptions/admin/{sub_id}/partners",
                     headers=_hdr(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    partners = r.json()
    assert isinstance(partners, list)
    partner_id = partner_me["id"]
    # ensure partner is active so appears
    r2 = requests.post(f"{API}/subscriptions/admin/{sub_id}/assign",
                       headers=_hdr(admin_token),
                       json={"partner_id": partner_id}, timeout=15)
    assert r2.status_code == 200, r2.text
    sub = r2.json()
    assert sub["partner_id"] == partner_id


# --- 7. Partner completes a working day; weekly-off rejected; non-assigned 403 ---
def test_partner_complete_day_and_rules(admin_token, customer_token, partner_token,
                                        customer_me, category_id, created_subscription,
                                        partner_me):
    sub_id = created_subscription["sub"]["id"]
    # find a scheduled (non weekly_off) day
    r = requests.get(f"{API}/subscriptions/{sub_id}",
                     headers=_hdr(admin_token), timeout=15)
    assert r.status_code == 200
    sched = r.json()["schedule"]
    scheduled = next(d for d in sched if d["status"] == "scheduled")
    off = next((d for d in sched if d["status"] == "weekly_off"), None)

    r = requests.post(
        f"{API}/subscriptions/{sub_id}/days/{scheduled['date']}/complete",
        headers=_hdr(partner_token), timeout=15)
    assert r.status_code == 200, r.text
    sub = r.json()
    assert sub["completed_days"] >= 1
    assert float(sub["accrued_earning"]) > 0

    # weekly_off should reject
    if off:
        r = requests.post(
            f"{API}/subscriptions/{sub_id}/days/{off['date']}/complete",
            headers=_hdr(partner_token), timeout=15)
        assert r.status_code == 400, f"expected 400 for weekly_off, got {r.status_code} {r.text}"

    # Non-assigned partner => 403. Create an unrelated sub not assigned to this partner.
    _set_commission(admin_token, 20)
    svc2 = _create_sub_service(admin_token, category_id, price=1000,
                               working_days=5, duration_days=5, weekly_offs=[])
    address = _ensure_customer_address(customer_token, customer_me)
    from datetime import date
    body = {"service_id": svc2["id"], "plan_type": "monthly",
            "start_date": date.today().isoformat(),
            "address": address}
    r = requests.post(f"{API}/subscriptions", headers=_hdr(customer_token),
                      json=body, timeout=15)
    assert r.status_code == 200
    sub2_id = r.json()["id"]
    r = requests.post(f"{API}/subscriptions/{sub2_id}/pay/mock",
                      headers=_hdr(customer_token), timeout=15)
    assert r.status_code == 200
    # partner tries to complete without being assigned
    r = requests.post(
        f"{API}/subscriptions/{sub2_id}/days/{date.today().isoformat()}/complete",
        headers=_hdr(partner_token), timeout=15)
    assert r.status_code == 403, f"expected 403 non-assigned partner, got {r.status_code} {r.text}"


# --- 8-11. Admin marks maid_absent / customer_cancel / weekly_off neutrality / replacement ---
def test_admin_day_markings(admin_token, created_subscription):
    sub_id = created_subscription["sub"]["id"]
    r = requests.get(f"{API}/subscriptions/{sub_id}",
                     headers=_hdr(admin_token), timeout=15)
    sched = r.json()["schedule"]
    per_day = float(r.json()["per_day_earning"])

    scheduled = [d for d in sched if d["status"] == "scheduled"]
    assert len(scheduled) >= 4

    # maid_absent
    d_abs = scheduled[0]["date"]
    r = requests.post(f"{API}/subscriptions/admin/{sub_id}/days/{d_abs}",
                      headers=_hdr(admin_token),
                      json={"status": "maid_absent"}, timeout=15)
    assert r.status_code == 200, r.text
    sub = r.json()
    assert sub["absent_days"] >= 1
    assert abs(float(sub["absent_adjustment"]) - per_day) < 0.05

    # customer_cancel neutral
    accrued_before = float(sub["accrued_earning"])
    absent_before = float(sub["absent_adjustment"])
    d_cc = scheduled[1]["date"]
    r = requests.post(f"{API}/subscriptions/admin/{sub_id}/days/{d_cc}",
                      headers=_hdr(admin_token),
                      json={"status": "customer_cancel"}, timeout=15)
    assert r.status_code == 200, r.text
    sub = r.json()
    # neutral: accrued unchanged and absent_adjustment unchanged
    assert abs(float(sub["accrued_earning"]) - accrued_before) < 0.01
    assert abs(float(sub["absent_adjustment"]) - absent_before) < 0.01
    assert sub["customer_cancel_days"] >= 1

    # Try marking a weekly_off day; controller should reject changing weekly_off to something else
    off = next((d for d in sched if d["status"] == "weekly_off"), None)
    if off:
        r = requests.post(f"{API}/subscriptions/admin/{sub_id}/days/{off['date']}",
                          headers=_hdr(admin_token),
                          json={"status": "maid_absent"}, timeout=15)
        assert r.status_code == 400
        # confirm no absent_adjustment added
        r2 = requests.get(f"{API}/subscriptions/{sub_id}",
                          headers=_hdr(admin_token), timeout=15)
        assert abs(float(r2.json()["absent_adjustment"]) - float(sub["absent_adjustment"])) < 0.01

    # replacement_completed
    r = requests.get(f"{API}/subscriptions/admin/{sub_id}/partners",
                     headers=_hdr(admin_token), timeout=15)
    partners = r.json()
    assigned = None
    r_sub = requests.get(f"{API}/subscriptions/{sub_id}",
                        headers=_hdr(admin_token), timeout=15).json()
    assigned = r_sub["partner_id"]
    replacement = next((p for p in partners if p["id"] != assigned), None)
    if replacement:
        d_rep = scheduled[2]["date"]
        r = requests.post(f"{API}/subscriptions/admin/{sub_id}/days/{d_rep}",
                          headers=_hdr(admin_token),
                          json={"status": "replacement_completed",
                                "replacement_partner_id": replacement["id"]}, timeout=15)
        assert r.status_code == 200, r.text
        sub = r.json()
        rep_earn = (sub.get("replacement_earnings") or {}).get(replacement["id"])
        assert rep_earn is not None
        assert abs(float(rep_earn) - per_day) < 0.05
        # original assigned's accrued unchanged for this day
        # (i.e. accrued did not double-count the replacement day)


# --- 12. E2E 10000/26/20% reconciliation ---
def test_money_reconciliation_10000_26_20pct(admin_token, customer_token,
                                             partner_token, customer_me,
                                             partner_me, category_id):
    _set_commission(admin_token, 20)
    svc = _create_sub_service(admin_token, category_id, price=10000,
                              working_days=26, weekly_offs=[6], duration_days=30)
    address = _ensure_customer_address(customer_token, customer_me)
    from datetime import date, timedelta
    # start far in the past so all days are past
    start = (date.today() - timedelta(days=40)).isoformat()
    body = {"service_id": svc["id"], "plan_type": "monthly",
            "start_date": start, "address": address}
    r = requests.post(f"{API}/subscriptions", headers=_hdr(customer_token),
                      json=body, timeout=20)
    assert r.status_code == 200, r.text
    sub = r.json()
    sub_id = sub["id"]
    assert abs(float(sub["commission_amount"]) - 2000) < 0.01
    assert abs(float(sub["partner_allocation"]) - 8000) < 0.01
    per_day = float(sub["per_day_earning"])
    assert abs(per_day - 8000 / 26) < 0.02

    # pay + assign
    r = requests.post(f"{API}/subscriptions/{sub_id}/pay/mock",
                      headers=_hdr(customer_token), timeout=15)
    assert r.status_code == 200
    r = requests.post(f"{API}/subscriptions/admin/{sub_id}/assign",
                     headers=_hdr(admin_token),
                     json={"partner_id": partner_me["id"]}, timeout=15)
    assert r.status_code == 200

    r = requests.get(f"{API}/subscriptions/{sub_id}",
                     headers=_hdr(admin_token), timeout=15)
    sched = r.json()["schedule"]
    working = [d for d in sched if d["status"] == "scheduled"]
    assert len(working) >= 26
    # complete first 24 working days
    for d in working[:24]:
        r = requests.post(
            f"{API}/subscriptions/{sub_id}/days/{d['date']}/complete",
            headers=_hdr(partner_token), timeout=15)
        assert r.status_code == 200, f"complete {d['date']}: {r.text}"
    # mark 2 more as maid_absent
    for d in working[24:26]:
        r = requests.post(f"{API}/subscriptions/admin/{sub_id}/days/{d['date']}",
                          headers=_hdr(admin_token),
                          json={"status": "maid_absent"}, timeout=15)
        assert r.status_code == 200, r.text

    r = requests.get(f"{API}/subscriptions/{sub_id}",
                     headers=_hdr(admin_token), timeout=15)
    sub = r.json()
    accrued = float(sub["accrued_earning"])
    absent_adj = float(sub["absent_adjustment"])
    assert abs(accrued - 24 * per_day) < 0.1
    assert abs(absent_adj - 2 * per_day) < 0.1
    # combined ~ partner_allocation
    assert abs((accrued + absent_adj) - 8000) < 0.1

    return sub_id  # used by next test if needed


# --- 13. Finalize + settlement workflow with wallet credit ---
def test_finalize_and_settlement_pay_credits_wallet(admin_token, customer_token,
                                                   partner_token, customer_me,
                                                   partner_me, category_id):
    _set_commission(admin_token, 20)
    svc = _create_sub_service(admin_token, category_id, price=2600,
                              working_days=2, weekly_offs=[], duration_days=2)
    address = _ensure_customer_address(customer_token, customer_me)
    from datetime import date, timedelta
    start = (date.today() - timedelta(days=3)).isoformat()
    r = requests.post(f"{API}/subscriptions", headers=_hdr(customer_token),
                      json={"service_id": svc["id"], "plan_type": "monthly",
                            "start_date": start, "address": address}, timeout=15)
    assert r.status_code == 200
    sub_id = r.json()["id"]
    r = requests.post(f"{API}/subscriptions/{sub_id}/pay/mock",
                      headers=_hdr(customer_token), timeout=15)
    assert r.status_code == 200
    r = requests.post(f"{API}/subscriptions/admin/{sub_id}/assign",
                     headers=_hdr(admin_token),
                     json={"partner_id": partner_me["id"]}, timeout=15)
    assert r.status_code == 200

    # complete both days
    r = requests.get(f"{API}/subscriptions/{sub_id}", headers=_hdr(admin_token), timeout=15)
    sched = r.json()["schedule"]
    for d in [x for x in sched if x["status"] == "scheduled"]:
        r = requests.post(
            f"{API}/subscriptions/{sub_id}/days/{d['date']}/complete",
            headers=_hdr(partner_token), timeout=15)
        assert r.status_code == 200

    # partner wallet before
    r = requests.get(f"{API}/auth/me", headers=_hdr(partner_token), timeout=15)
    wallet_before = float(r.json().get("wallet_balance") or 0)

    # finalize
    r = requests.post(f"{API}/subscriptions/admin/{sub_id}/finalize",
                      headers=_hdr(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    sub = r.json()
    assert sub["status"] == "completed"
    assert (sub.get("settlement") or {}).get("status") == "pending"
    settlement_amount = float(sub["settlement"]["amount"])

    # pay before approve should reject
    r = requests.post(f"{API}/subscriptions/admin/{sub_id}/settlement",
                      headers=_hdr(admin_token), json={"action": "pay"}, timeout=15)
    assert r.status_code == 400, f"pay-before-approve should fail: {r.status_code} {r.text}"

    # review -> approve -> pay
    for action in ["review", "approve"]:
        r = requests.post(f"{API}/subscriptions/admin/{sub_id}/settlement",
                          headers=_hdr(admin_token), json={"action": action}, timeout=15)
        assert r.status_code == 200, r.text
    r = requests.post(f"{API}/subscriptions/admin/{sub_id}/settlement",
                      headers=_hdr(admin_token), json={"action": "pay"}, timeout=15)
    assert r.status_code == 200, r.text
    sub = r.json()
    assert sub["settlement"]["status"] == "paid"

    # wallet after
    r = requests.get(f"{API}/auth/me", headers=_hdr(partner_token), timeout=15)
    wallet_after = float(r.json().get("wallet_balance") or 0)
    assert abs((wallet_after - wallet_before) - settlement_amount) < 0.05, \
        f"wallet delta {wallet_after - wallet_before} vs settlement {settlement_amount}"


# --- 14. Listing endpoints ---
def test_listing_endpoints(admin_token, customer_token, partner_token,
                           created_subscription):
    r = requests.get(f"{API}/subscriptions/mine",
                     headers=_hdr(customer_token), timeout=15)
    assert r.status_code == 200
    assert any(s["id"] == created_subscription["sub"]["id"] for s in r.json())

    r = requests.get(f"{API}/subscriptions/partner/mine",
                     headers=_hdr(partner_token), timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    r = requests.get(f"{API}/subscriptions/admin/all",
                     headers=_hdr(admin_token), timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    r = requests.get(f"{API}/subscriptions/admin/stats",
                     headers=_hdr(admin_token), timeout=15)
    assert r.status_code == 200
    stats = r.json()
    for k in ["active", "completed", "settlement_pending",
              "settlement_review", "settlement_approved"]:
        assert k in stats


# --- 15. Regression: non-subscription catalog service create still works ---
def test_regression_non_subscription_service_create(admin_token, category_id):
    body = {
        "category_id": category_id,
        "name": f"TEST_OneTime_{uuid.uuid4().hex[:6]}",
        "base_price": 500, "discounted_price": 500,
    }
    r = requests.post(f"{API}/catalog/services",
                      headers=_hdr(admin_token), json=body, timeout=15)
    assert r.status_code in (200, 201), r.text
    svc = r.json()
    assert svc.get("is_subscription") is False
    assert (svc.get("subscription_plans") or []) == []
