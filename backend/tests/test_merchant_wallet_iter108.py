"""Iter108: Merchant Wallet backend tests - overview, transactions, withdrawals, withdraw."""
import pytest
import time
from conftest import API, login, client


@pytest.fixture(scope="module")
def m():
    return client(login("+919000000002"))


# ─── Panel access ─────────────────────────────────────────────
def test_panel_access_approved(m):
    r = m.get(f"{API}/merchant/panel/access", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("approved") is True, data


# ─── Wallet overview ──────────────────────────────────────────
def test_wallet_overview_shape(m):
    r = m.get(f"{API}/merchant/panel/wallet/overview", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "summary" in d and "config" in d and "finance" in d
    s = d["summary"]
    for k in ("available_balance", "withdrawable_balance", "pending_balance",
              "total_withdrawn", "total_earned"):
        assert k in s, f"missing summary.{k}"
    assert isinstance(s.get("ledger", []), list)
    cfg = d["config"]
    assert cfg.get("min_withdrawal") == 100
    assert cfg.get("max_withdrawal") == 50000
    fin = d["finance"]
    assert fin.get("eligible") is True, fin
    banks = fin.get("banks", [])
    assert banks and any(b.get("status") == "approved" for b in banks), banks
    # ensure a primary_bank exists on finance
    assert fin.get("primary_bank"), fin


# ─── Transactions ─────────────────────────────────────────────
def test_transactions_pagination_and_filters(m):
    r = m.get(f"{API}/merchant/panel/wallet/transactions?page=1&page_size=10", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("items", "total", "page", "pages"):
        assert k in d, f"missing {k}"
    assert d["page"] == 1
    assert len(d["items"]) <= 10

    # credit only
    rc = m.get(f"{API}/merchant/panel/wallet/transactions?direction=credit&page_size=50", timeout=30).json()
    for it in rc["items"]:
        assert (it.get("direction") or "").lower() == "credit", it

    # debit only
    rd = m.get(f"{API}/merchant/panel/wallet/transactions?direction=debit&page_size=50", timeout=30).json()
    for it in rd["items"]:
        assert (it.get("direction") or "").lower() == "debit", it

    # page_size change
    r25 = m.get(f"{API}/merchant/panel/wallet/transactions?page_size=25", timeout=30).json()
    assert len(r25["items"]) <= 25


def test_transactions_search_q(m):
    r = m.get(f"{API}/merchant/panel/wallet/transactions?q=Adjustment&page_size=50", timeout=30)
    assert r.status_code == 200
    d = r.json()
    # if any items matched, all should contain 'adjustment' somewhere textual
    for it in d["items"]:
        blob = (str(it.get("note", "")) + " " + str(it.get("type", "")) + " "
                + str(it.get("description", ""))).lower()
        assert "adjustment" in blob or d["total"] == 0, it


# ─── Withdrawals list ─────────────────────────────────────────
def test_withdrawals_list(m):
    r = m.get(f"{API}/merchant/panel/wallet/withdrawals", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    # response could be list or dict wrapper
    items = d if isinstance(d, list) else d.get("items", [])
    assert isinstance(items, list)


# ─── Withdraw create + persistence ─────────────────────────────
def test_withdraw_create_and_reflects_in_overview(m):
    ov1 = m.get(f"{API}/merchant/panel/wallet/overview", timeout=30).json()
    s1 = ov1["summary"]
    fin = ov1["finance"]
    bank = fin.get("primary_bank") or fin["banks"][0]
    pending_before = float(s1["pending_balance"])
    withdrawable_before = float(s1["withdrawable_balance"])

    payload = {"amount": 500, "method": "bank", "bank": bank}
    r = m.post(f"{API}/merchant/panel/withdraw", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    wd = r.json()
    assert wd.get("id"), wd
    assert float(wd.get("amount", 0)) == 500.0
    assert (wd.get("status") or "").lower() == "pending", wd
    wd_id = wd["id"]

    # overview reflects change
    ov2 = m.get(f"{API}/merchant/panel/wallet/overview", timeout=30).json()
    s2 = ov2["summary"]
    assert float(s2["pending_balance"]) >= pending_before + 499.99, (pending_before, s2["pending_balance"])
    assert float(s2["withdrawable_balance"]) <= withdrawable_before - 499.99, (withdrawable_before, s2["withdrawable_balance"])

    # list contains it
    wl = m.get(f"{API}/merchant/panel/wallet/withdrawals", timeout=30).json()
    items = wl if isinstance(wl, list) else wl.get("items", [])
    assert any(it.get("id") == wd_id for it in items), f"withdrawal {wd_id} not in list"


def test_withdraw_below_min_rejected(m):
    ov = m.get(f"{API}/merchant/panel/wallet/overview", timeout=30).json()
    bank = ov["finance"].get("primary_bank") or ov["finance"]["banks"][0]
    r = m.post(f"{API}/merchant/panel/withdraw", json={"amount": 50, "method": "bank", "bank": bank}, timeout=30)
    assert r.status_code >= 400, f"expected error, got {r.status_code}: {r.text}"


def test_withdraw_above_withdrawable_rejected(m):
    ov = m.get(f"{API}/merchant/panel/wallet/overview", timeout=30).json()
    bank = ov["finance"].get("primary_bank") or ov["finance"]["banks"][0]
    huge = float(ov["summary"]["withdrawable_balance"]) + 100000
    r = m.post(f"{API}/merchant/panel/withdraw", json={"amount": huge, "method": "bank", "bank": bank}, timeout=30)
    assert r.status_code >= 400, f"expected error, got {r.status_code}: {r.text}"
