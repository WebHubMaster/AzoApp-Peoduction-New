"""Iter 271: Customer tip flow — /api/bookings/{id}/tip (wallet + online).
   Also validates /api/payments/order purpose='tip', payment_controller._apply('tip'),
   confirm_return('tip'), and /api/bookings/my/pending-reviews partner_photo+tip_amount.
   Mints JWT via middleware.auth (same JWT_SECRET)."""
import os
import sys
import uuid
import threading
import pytest
import requests
from pathlib import Path
from pymongo import MongoClient
from dotenv import dotenv_values

sys.path.insert(0, "/app/backend")
from middleware import auth as mw_auth  # noqa: E402

env = dotenv_values("/app/backend/.env")
MONGO_URL = env.get("MONGO_URL") or os.environ.get("MONGO_URL")
DB_NAME = env.get("DB_NAME") or os.environ.get("DB_NAME")
fe_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or fe_env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert MONGO_URL and DB_NAME and BASE_URL, "env missing"
API = f"{BASE_URL}/api"

mdb = MongoClient(MONGO_URL)[DB_NAME]


def _mk_token(uid, role):
    sid = uuid.uuid4().hex
    mdb.users.update_one({"id": uid}, {"$set": {"current_sid": sid}})
    return mw_auth.create_token(uid, role, sid=sid)


def _now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


@pytest.fixture
def ctx():
    """Seed partner, customer, completed booking."""
    tag = f"TEST_{uuid.uuid4().hex[:8]}"
    pid = f"TEST_partner_{tag}"
    cid = f"TEST_customer_{tag}"
    bid = f"TEST_booking_{tag}"
    mdb.users.insert_one({"id": pid, "role": "partner", "name": "TEST Partner",
                          "phone": f"+91999{tag[-7:]}", "photo": "/u/partner.jpg",
                          "wallet_balance": 0.0, "current_sid": None})
    mdb.users.insert_one({"id": cid, "role": "customer", "name": "TEST Customer",
                          "phone": f"+91888{tag[-7:]}", "wallet_balance": 1000.0, "current_sid": None})
    mdb.bookings.insert_one({
        "id": bid, "code": f"T-{tag[-6:]}", "customer_id": cid, "customer_name": "TEST Customer",
        "partner_id": pid, "partner_name": "TEST Partner", "service_name": "Cleaning",
        "status": "completed", "payment_status": "paid",
        "pricing": {"total": 500}, "timeline": [{"status": "completed", "at": _now()}],
        "created_at": _now(), "updated_at": _now()})
    c_tok = _mk_token(cid, "customer")
    p_tok = _mk_token(pid, "partner")
    data = {"pid": pid, "cid": cid, "bid": bid, "tag": tag, "c_tok": c_tok, "p_tok": p_tok}
    yield data
    # Cleanup
    mdb.users.delete_many({"id": {"$in": [pid, cid]}})
    mdb.bookings.delete_many({"id": bid})
    mdb.transactions.delete_many({"user_id": {"$in": [pid, cid]}})
    mdb.partner_ledger.delete_many({"partner_id": pid})
    mdb.notifications.delete_many({"user_id": {"$in": [pid, cid]}})


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- wallet tip ----------
def test_wallet_tip_success(ctx):
    r = requests.post(f"{API}/bookings/{ctx['bid']}/tip",
                      headers=_h(ctx["c_tok"]), json={"amount": 50, "method": "wallet"})
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True
    assert r.json()["tip"]["amount"] == 50

    # customer debited
    c = mdb.users.find_one({"id": ctx["cid"]})
    assert c["wallet_balance"] == 950.0
    # partner credited
    p = mdb.users.find_one({"id": ctx["pid"]})
    assert p["wallet_balance"] == 50.0
    # transactions
    debit = mdb.transactions.find_one({"user_id": ctx["cid"], "kind": "tip", "type": "debit"})
    credit = mdb.transactions.find_one({"user_id": ctx["pid"], "kind": "tip", "type": "credit"})
    assert debit and debit["amount"] == 50
    assert credit and credit["amount"] == 50
    # partner ledger
    pl = mdb.partner_ledger.find_one({"partner_id": ctx["pid"], "kind": "tip"})
    assert pl and pl["direction"] == "credit" and pl["amount"] == 50
    # booking.tip persisted
    b = mdb.bookings.find_one({"id": ctx["bid"]})
    assert (b.get("tip") or {}).get("amount") == 50


def test_wallet_tip_insufficient_balance(ctx):
    mdb.users.update_one({"id": ctx["cid"]}, {"$set": {"wallet_balance": 10}})
    r = requests.post(f"{API}/bookings/{ctx['bid']}/tip",
                      headers=_h(ctx["c_tok"]), json={"amount": 50, "method": "wallet"})
    assert r.status_code == 400
    assert "Insufficient wallet balance" in r.text
    # tip NOT recorded (rolled back)
    b = mdb.bookings.find_one({"id": ctx["bid"]})
    assert not (b.get("tip") or {}).get("amount")
    # no ledger / transactions
    assert mdb.transactions.count_documents({"user_id": ctx["pid"], "kind": "tip"}) == 0
    assert mdb.partner_ledger.count_documents({"partner_id": ctx["pid"], "kind": "tip"}) == 0


def test_tip_amount_bounds(ctx):
    r1 = requests.post(f"{API}/bookings/{ctx['bid']}/tip", headers=_h(ctx["c_tok"]),
                       json={"amount": 0, "method": "wallet"})
    assert r1.status_code == 400
    r2 = requests.post(f"{API}/bookings/{ctx['bid']}/tip", headers=_h(ctx["c_tok"]),
                       json={"amount": 5001, "method": "wallet"})
    assert r2.status_code == 400
    r3 = requests.post(f"{API}/bookings/{ctx['bid']}/tip", headers=_h(ctx["c_tok"]),
                       json={"amount": 5000, "method": "wallet"})
    # 5000 valid but wallet is 1000, should fail with insufficient
    assert r3.status_code == 400 and "Insufficient" in r3.text


def test_tip_only_after_completion(ctx):
    mdb.bookings.update_one({"id": ctx["bid"]}, {"$set": {"status": "started"}})
    r = requests.post(f"{API}/bookings/{ctx['bid']}/tip",
                      headers=_h(ctx["c_tok"]), json={"amount": 50, "method": "wallet"})
    assert r.status_code == 400
    assert "after the service is completed" in r.text


def test_double_tip_rejected(ctx):
    r1 = requests.post(f"{API}/bookings/{ctx['bid']}/tip",
                       headers=_h(ctx["c_tok"]), json={"amount": 20, "method": "wallet"})
    assert r1.status_code == 200
    r2 = requests.post(f"{API}/bookings/{ctx['bid']}/tip",
                       headers=_h(ctx["c_tok"]), json={"amount": 50, "method": "wallet"})
    assert r2.status_code == 400
    assert "already tipped" in r2.text


def test_concurrent_double_tip(ctx):
    results = []

    def hit():
        try:
            r = requests.post(f"{API}/bookings/{ctx['bid']}/tip",
                              headers=_h(ctx["c_tok"]),
                              json={"amount": 100, "method": "wallet"}, timeout=30)
            results.append(r.status_code)
        except Exception as e:
            results.append(("ERR", str(e)))

    threads = [threading.Thread(target=hit) for _ in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    oks = sum(1 for s in results if s == 200)
    assert oks == 1, f"expected 1 success, got {oks}, results={results}"
    # wallet debited exactly once
    c = mdb.users.find_one({"id": ctx["cid"]})
    assert c["wallet_balance"] == 900.0
    p = mdb.users.find_one({"id": ctx["pid"]})
    assert p["wallet_balance"] == 100.0
    # exactly one partner-ledger tip entry
    assert mdb.partner_ledger.count_documents({"partner_id": ctx["pid"], "kind": "tip"}) == 1


def test_tip_no_partner(ctx):
    mdb.bookings.update_one({"id": ctx["bid"]}, {"$unset": {"partner_id": ""}})
    r = requests.post(f"{API}/bookings/{ctx['bid']}/tip",
                      headers=_h(ctx["c_tok"]), json={"amount": 50, "method": "wallet"})
    assert r.status_code == 400
    assert "No partner to tip" in r.text


def test_tip_other_customer_forbidden(ctx):
    other = f"TEST_other_{uuid.uuid4().hex[:6]}"
    mdb.users.insert_one({"id": other, "role": "customer", "name": "Other", "phone": "+9100", "wallet_balance": 500})
    try:
        tok = _mk_token(other, "customer")
        r = requests.post(f"{API}/bookings/{ctx['bid']}/tip",
                          headers=_h(tok), json={"amount": 50, "method": "wallet"})
        assert r.status_code == 403
    finally:
        mdb.users.delete_one({"id": other})


# ---------- pending-reviews shape ----------
def test_pending_reviews_includes_partner_photo_and_tip(ctx):
    # Before tip
    r = requests.get(f"{API}/bookings/my/pending-reviews", headers=_h(ctx["c_tok"]))
    assert r.status_code == 200
    items = r.json()["items"]
    mine = [i for i in items if i["id"] == ctx["bid"]]
    assert mine, "booking should appear in pending reviews"
    it = mine[0]
    assert "partner_photo" in it and (it["partner_photo"].startswith("http") or it["partner_photo"] == "")
    # When backend has REACT_APP_BACKEND_URL configured, path is absolutised; else "" per spec.
    if it["partner_photo"]:
        assert "/u/partner.jpg" in it["partner_photo"]
        assert it["partner_photo"].startswith("https://")
    assert it["tip_amount"] == 0

    # After tip
    requests.post(f"{API}/bookings/{ctx['bid']}/tip",
                  headers=_h(ctx["c_tok"]), json={"amount": 50, "method": "wallet"})
    r2 = requests.get(f"{API}/bookings/my/pending-reviews", headers=_h(ctx["c_tok"]))
    it2 = [i for i in r2.json()["items"] if i["id"] == ctx["bid"]][0]
    assert it2["tip_amount"] == 50


# ---------- payment order 'tip' ----------
def test_payment_order_tip_precheck_invalid_amount(ctx):
    r = requests.post(f"{API}/payments/order", headers=_h(ctx["c_tok"]),
                      json={"purpose": "tip", "booking_id": ctx["bid"], "amount": 0})
    assert r.status_code == 400


def test_payment_order_tip_precheck_already_tipped(ctx):
    requests.post(f"{API}/bookings/{ctx['bid']}/tip",
                  headers=_h(ctx["c_tok"]), json={"amount": 20, "method": "wallet"})
    r = requests.post(f"{API}/payments/order", headers=_h(ctx["c_tok"]),
                      json={"purpose": "tip", "booking_id": ctx["bid"], "amount": 50})
    assert r.status_code == 400
    assert "already tipped" in r.text


def test_payment_order_tip_gateway_or_fields(ctx):
    """Gateway likely not configured locally → 409. If it is configured → verify fields persisted."""
    r = requests.post(f"{API}/payments/order", headers=_h(ctx["c_tok"]),
                      json={"purpose": "tip", "booking_id": ctx["bid"], "amount": 50})
    assert r.status_code in (200, 409), r.text
    if r.status_code == 200:
        b = mdb.bookings.find_one({"id": ctx["bid"]})
        assert b.get("pay_tip_order_id")
        assert b.get("pay_tip_amount") == 50


# ---------- controller-level _apply('tip') ----------
def test_apply_tip_uses_stored_amount_and_idempotent(ctx):
    import asyncio
    from controllers import payment_controller as pc
    # Manually set stored gateway fields (simulating create_order persistence)
    order_id = f"TEST_ORDER_{uuid.uuid4().hex[:8]}"
    mdb.bookings.update_one({"id": ctx["bid"]},
                            {"$set": {"pay_tip_order_id": order_id, "pay_tip_amount": 77}})
    user = mdb.users.find_one({"id": ctx["cid"]}, {"_id": 0})

    # Mismatched order_id → rejected
    try:
        asyncio.get_event_loop().run_until_complete(
            pc._apply(user, "tip", ctx["bid"], None, order_id="WRONG"))
        assert False, "should have raised"
    except Exception as e:
        assert "not found" in str(e).lower() or "400" in str(e)

    # Correct order_id → applies with stored amount (ignoring passed amount)
    res = asyncio.get_event_loop().run_until_complete(
        pc._apply(user, "tip", ctx["bid"], 9999, order_id=order_id))
    assert res["ok"] is True
    b = mdb.bookings.find_one({"id": ctx["bid"]})
    assert (b.get("tip") or {}).get("amount") == 77
    assert b["tip"]["method"] == "online"
    assert b["tip"].get("payment_ref") == order_id

    # Idempotent: re-apply returns already=True (no new ledger rows)
    before = mdb.partner_ledger.count_documents({"partner_id": ctx["pid"], "kind": "tip"})
    res2 = asyncio.get_event_loop().run_until_complete(
        pc._apply(user, "tip", ctx["bid"], None, order_id=order_id))
    assert res2.get("already") is True
    after = mdb.partner_ledger.count_documents({"partner_id": ctx["pid"], "kind": "tip"})
    assert before == after


def test_confirm_return_finds_booking_by_pay_tip_order_id(ctx):
    import asyncio
    from controllers import payment_controller as pc
    order_id = f"TEST_ORDER_{uuid.uuid4().hex[:8]}"
    # Simulate booking already tipped — confirm_return should short-circuit
    mdb.bookings.update_one({"id": ctx["bid"]},
                            {"$set": {"pay_tip_order_id": order_id, "pay_tip_amount": 60,
                                      "tip": {"amount": 60, "method": "online", "at": _now()}}})
    user = mdb.users.find_one({"id": ctx["cid"]}, {"_id": 0})
    res = asyncio.get_event_loop().run_until_complete(
        pc.confirm_return(user, "razorpay", order_id))
    assert res["kind"] == "tip"
    assert res["booking_id"] == ctx["bid"]
    assert res.get("already") is True
