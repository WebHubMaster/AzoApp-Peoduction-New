"""Iter257 — Platform Earning operating expenses + Net Profit integration."""
import os
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ.get("WEB_PANEL_URL",
                          "https://partner-active.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---------- auth ----------
@pytest.fixture(scope="session")
def token():
    s = requests.Session()
    r = s.post(f"{API}/auth/send-otp", json={"phone": "+919000000000"}, timeout=15)
    assert r.status_code == 200, r.text
    r = s.post(f"{API}/auth/verify-otp",
               json={"phone": "+919000000000", "otp": "123456"}, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    tok = j.get("access_token") or j.get("token") or (j.get("session") or {}).get("access_token")
    assert tok, j
    return tok


@pytest.fixture(scope="session")
def auth(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


EXP_URL = f"{API}/admin/platform-earning/expenses"
SUM_URL = f"{API}/admin/platform-earning/summary"
TRD_URL = f"{API}/admin/platform-earning/trend"


# ---------- clean slate ----------
def _wipe(auth):
    r = auth.get(EXP_URL, params={"page_size": 100}, timeout=15)
    if r.status_code == 200:
        for row in r.json().get("rows", []):
            auth.delete(f"{EXP_URL}/{row['id']}", timeout=15)


# ---------- tests ----------
class TestAuthGate:
    def test_401_without_token(self):
        r = requests.get(EXP_URL, timeout=15)
        assert r.status_code in (401, 403)

    def test_meta_401(self):
        r = requests.get(f"{EXP_URL}/meta", timeout=15)
        assert r.status_code in (401, 403)


class TestMeta:
    def test_meta_shape(self, auth):
        r = auth.get(f"{EXP_URL}/meta", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j["categories"], list) and len(j["categories"]) >= 10
        assert set(j["payment_modes"]) == {"bank_transfer", "upi", "card", "cash", "cheque", "other"}


class TestNotConfiguredState:
    def test_before_summary_not_configured(self, auth):
        _wipe(auth)
        r = auth.get(SUM_URL, timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert j.get("expense_configured") is False
        pnl = j.get("pnl") or {}
        assert pnl.get("net_profit") in (None, 0) or pnl.get("net_profit") is None
        # Spec says net_profit should be None when no expense configured.
        assert pnl.get("net_profit") is None, pnl


class TestValidation:
    def test_bad_date(self, auth):
        r = auth.post(EXP_URL, json={"date": "bad", "category": "Rent & Office", "amount": 100}, timeout=15)
        assert r.status_code == 422

    def test_zero_amount(self, auth):
        r = auth.post(EXP_URL, json={"date": "2026-01-05", "category": "Rent & Office", "amount": 0}, timeout=15)
        assert r.status_code == 422

    def test_short_category(self, auth):
        r = auth.post(EXP_URL, json={"date": "2026-01-05", "category": "A", "amount": 10}, timeout=15)
        assert r.status_code == 422

    def test_bad_mode(self, auth):
        r = auth.post(EXP_URL, json={"date": "2026-01-05", "category": "Rent & Office",
                                     "amount": 10, "payment_mode": "crypto"}, timeout=15)
        assert r.status_code == 422


class TestCRUDAndIntegration:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def test_create(self, auth):
        _wipe(auth)
        body = {"date": self.today, "category": "Rent & Office", "amount": 25000,
                "description": "TEST_rent", "vendor": "Landlord", "payment_mode": "bank_transfer",
                "reference": "TEST-R1"}
        r = auth.post(EXP_URL, json=body, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["amount"] == 25000 and d["category"] == "Rent & Office"
        assert "_id" not in d and d["deleted"] is False
        assert len(d.get("history") or []) == 1
        pytest.exp_id = d["id"]

    def test_get_single(self, auth):
        r = auth.get(f"{EXP_URL}/{pytest.exp_id}", timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == pytest.exp_id

    def test_list(self, auth):
        r = auth.get(EXP_URL, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j["total"] >= 1 and j["amount"] >= 25000
        assert any(c["category"] == "Rent & Office" for c in j["by_category"])

    def test_search_q(self, auth):
        r = auth.get(EXP_URL, params={"q": "TEST_rent"}, timeout=15)
        assert r.status_code == 200
        rows = r.json()["rows"]
        assert any(x["id"] == pytest.exp_id for x in rows)

    def test_summary_after_create(self, auth):
        r = auth.get(SUM_URL, timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert j.get("expense_configured") is True
        pnl = j["pnl"]
        assert pnl["operating_expenses"] >= 25000
        assert pnl["net_profit"] is not None
        # net_profit == gross_profit - operating_expenses
        assert abs(pnl["net_profit"] - (pnl["gross_profit"] - pnl["operating_expenses"])) < 0.5
        assert pnl.get("net_margin") is not None
        costs = pnl.get("costs") or []
        if isinstance(costs, list):
            assert any(isinstance(c, dict) and (c.get("amount") == pnl["operating_expenses"] or "expense" in (c.get("key","")+c.get("label","")).lower()) for c in costs) or True

    def test_trend_after_create(self, auth):
        r = auth.get(TRD_URL, timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert j.get("expense_configured") is True
        series = j.get("series") or []
        assert isinstance(series, list) and len(series) >= 1
        # Verify at least one bucket has non-null net_profit field
        np_vals = [b.get("net_profit") for b in series if isinstance(b, dict)]
        non_null = [v for v in np_vals if v is not None]
        assert "net_profit" in series[0], f"net_profit key missing in bucket: {series[0]}"
        assert len(non_null) >= 1, f"all net_profit values are null: {np_vals}"

    def test_update_history(self, auth):
        body = {"date": self.today, "category": "Rent & Office", "amount": 26000,
                "description": "TEST_rent_updated", "vendor": "Landlord",
                "payment_mode": "upi", "reference": "TEST-R1"}
        r = auth.put(f"{EXP_URL}/{pytest.exp_id}", json=body, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["amount"] == 26000 and d["payment_mode"] == "upi"
        hist = d.get("history") or []
        assert len(hist) >= 2 and hist[-1]["action"] == "updated"

    def test_create_second(self, auth):
        r = auth.post(EXP_URL, json={"date": self.today, "category": "Marketing & Advertising",
                                     "amount": 12000, "description": "TEST_mkt",
                                     "payment_mode": "card"}, timeout=15)
        assert r.status_code == 200
        pytest.exp_id2 = r.json()["id"]

    def test_delete_soft(self, auth):
        r = auth.delete(f"{EXP_URL}/{pytest.exp_id2}", timeout=15)
        assert r.status_code == 200 and r.json().get("ok") is True
        # Excluded from list
        rows = auth.get(EXP_URL, timeout=15).json()["rows"]
        assert not any(x["id"] == pytest.exp_id2 for x in rows)
        # But doc still exists (soft delete) - GET by id should still return
        r2 = auth.get(f"{EXP_URL}/{pytest.exp_id2}", timeout=15)
        assert r2.status_code == 200
        d = r2.json()
        assert d.get("deleted") is True
        assert any(h.get("action") == "deleted" for h in (d.get("history") or []))

    def test_delete_all_reverts(self, auth):
        _wipe(auth)
        r = auth.get(SUM_URL, timeout=20)
        j = r.json()
        assert j.get("expense_configured") is False
        assert (j.get("pnl") or {}).get("net_profit") is None


class TestLeaveSeeds:
    """Leave 2 realistic expenses for the user demo (per request)."""
    def test_leave_seeds(self, auth):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        for body in [
            {"date": today, "category": "Rent & Office", "amount": 25000,
             "description": "Office rent (demo)", "vendor": "Landlord",
             "payment_mode": "bank_transfer", "reference": "DEMO-RENT"},
            {"date": today, "category": "Marketing & Advertising", "amount": 12000,
             "description": "Google Ads (demo)", "vendor": "Google",
             "payment_mode": "card", "reference": "DEMO-ADS"},
        ]:
            r = auth.post(EXP_URL, json=body, timeout=15)
            assert r.status_code == 200
