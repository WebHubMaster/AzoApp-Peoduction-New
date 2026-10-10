"""Backend tests for Platform Earning module (/api/admin/platform-earning/*).

Covers: auth, meta, summary pnl correctness, trend buckets, breakdown
pagination/sort, top, commission, fees, payouts, gateway, anomalies,
records pagination/sort/search, record detail, CSV export, and
consistency with existing finance endpoints.
"""
import os
import csv
import io
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://local-city-hub.preview.emergentagent.com").rstrip("/")
PE = f"{BASE}/api/admin/platform-earning"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{BASE}/api/auth/verify-otp",
                      json={"phone": "+919000000000", "otp": "123456"}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def H(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------- Auth guard ----------------
@pytest.mark.parametrize("path", [
    "/meta", "/summary", "/trend", "/breakdown?dim=service",
    "/top", "/commission", "/fees", "/payouts", "/gateway",
    "/anomalies", "/records", "/export?report=records",
])
def test_requires_auth(path):
    r = requests.get(f"{PE}{path}", timeout=60)
    assert r.status_code in (401, 403), f"{path} -> {r.status_code}"


# ---------------- Meta ----------------
def test_meta_structure(H):
    r = requests.get(f"{PE}/meta?nocache=1", headers=H, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    for k in ("methods", "services", "categories", "cities", "partners", "merchants"):
        assert k in j, f"meta missing {k}"


# ---------------- Summary (all-time) ----------------
@pytest.fixture(scope="session")
def summary_all(H):
    r = requests.get(f"{PE}/summary?nocache=1", headers=H, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


def test_summary_has_core_keys(summary_all):
    for k in ("pnl", "reconciliation", "counts", "txn",
              "commission", "platform_fee", "expense_configured"):
        assert k in summary_all, f"missing {k}"


def test_pnl_identities(summary_all):
    pnl = summary_all["pnl"]
    # revenue == gross_collection - tax
    rev_calc = round((pnl.get("gross_collection") or 0) - (pnl.get("tax") or 0), 2)
    assert abs(rev_calc - (pnl.get("revenue") or 0)) < 1, pnl
    # net_profit None + expense not configured
    assert pnl.get("net_profit") is None
    assert summary_all.get("expense_configured") is False
    # gross_profit = platform_revenue - gateway_fee
    gp_calc = round((pnl.get("platform_revenue") or 0) - (pnl.get("gateway_fee") or 0), 2)
    assert abs(gp_calc - (pnl.get("gross_profit") or 0)) < 1, pnl


def test_reconciliation_tight(summary_all):
    diff = abs(summary_all["reconciliation"].get("difference") or 0)
    assert diff < 1, summary_all["reconciliation"]


def test_summary_commission_matches_ledger(summary_all):
    """summary.commission (all-time) ≈ sum(platform_earning) from commission_ledger."""
    from pymongo import MongoClient
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    agg = list(db.commission_ledger.aggregate([
        {"$group": {"_id": None, "s": {"$sum": "$platform_earning"}}}
    ]))
    ledger_sum = round((agg[0]["s"] if agg else 0) or 0, 2)
    reported = round(summary_all.get("commission") or 0, 2)
    assert abs(ledger_sum - reported) < 1, f"ledger={ledger_sum} reported={reported}"


# ---------------- Date range filter effect ----------------
def test_date_filter_changes_results(H, summary_all):
    r = requests.get(f"{PE}/summary?date_from=2020-01-01&date_to=2020-12-31&nocache=1",
                     headers=H, timeout=60)
    assert r.status_code == 200
    j = r.json()
    # 2020 range should have far less (likely 0) data than all-time
    assert (j["counts"].get("orders") or 0) <= (summary_all["counts"].get("orders") or 0)


# ---------------- Trend ----------------
@pytest.mark.parametrize("bucket", ["day", "week", "month", "auto"])
def test_trend_buckets(H, bucket):
    r = requests.get(f"{PE}/trend?bucket={bucket}&nocache=1", headers=H, timeout=60)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "series" in j or "rows" in j or "points" in j or isinstance(j, dict)


# ---------------- Breakdown ----------------
@pytest.mark.parametrize("dim", ["service", "category", "city", "partner", "merchant", "method", "source"])
def test_breakdown_dims(H, dim):
    r = requests.get(f"{PE}/breakdown?dim={dim}&page=1&page_size=10&sort=revenue&order=desc&nocache=1",
                     headers=H, timeout=60)
    assert r.status_code == 200, f"{dim}: {r.text[:200]}"
    j = r.json()
    assert j.get("dim") == dim
    assert "rows" in j and "total" in j


def test_breakdown_sort_order(H):
    r1 = requests.get(f"{PE}/breakdown?dim=service&sort=revenue&order=desc&page_size=20&nocache=1",
                      headers=H, timeout=60).json()
    rows = r1.get("rows", [])
    revs = [x.get("revenue") or 0 for x in rows]
    assert revs == sorted(revs, reverse=True), revs


def test_breakdown_page_size_cap(H):
    r = requests.get(f"{PE}/breakdown?dim=service&page=1&page_size=500&nocache=1",
                     headers=H, timeout=60).json()
    assert len(r.get("rows", [])) <= 100


# ---------------- Other analytics ----------------
@pytest.mark.parametrize("ep", ["/top", "/commission", "/fees", "/payouts", "/gateway", "/anomalies"])
def test_analytics_endpoints(H, ep):
    r = requests.get(f"{PE}{ep}?nocache=1", headers=H, timeout=60)
    assert r.status_code == 200, f"{ep}: {r.text[:200]}"
    assert isinstance(r.json(), (dict, list))


# ---------------- Records pagination/sort/search ----------------
def test_records_pagination_stable(H):
    r1 = requests.get(f"{PE}/records?page=1&page_size=10&nocache=1", headers=H, timeout=60).json()
    r2 = requests.get(f"{PE}/records?page=2&page_size=10&nocache=1", headers=H, timeout=60).json()
    assert r1.get("total") == r2.get("total")
    assert r1.get("page_size") == 10
    ids1 = {x.get("uid") or x.get("id") for x in r1.get("rows", [])}
    ids2 = {x.get("uid") or x.get("id") for x in r2.get("rows", [])}
    # Different pages should not share rows (unless total <=10)
    if (r1.get("total") or 0) > 10:
        assert not (ids1 & ids2)


def test_records_page_size_cap(H):
    r = requests.get(f"{PE}/records?page=1&page_size=500&nocache=1", headers=H, timeout=60).json()
    assert len(r.get("rows", [])) <= 100


def test_records_sort(H):
    r = requests.get(f"{PE}/records?sort=amount&order=desc&page_size=20&nocache=1",
                     headers=H, timeout=60).json()
    amts = [abs(x.get("amount") or 0) for x in r.get("rows", [])]
    assert amts == sorted(amts, reverse=True)


def test_record_detail(H):
    r = requests.get(f"{PE}/records?page=1&page_size=1&nocache=1", headers=H, timeout=60).json()
    rows = r.get("rows", [])
    if not rows:
        pytest.skip("no records")
    uid = rows[0].get("uid") or rows[0].get("id")
    assert uid
    d = requests.get(f"{PE}/records/{uid}?nocache=1", headers=H, timeout=60)
    assert d.status_code == 200, d.text
    j = d.json()
    assert isinstance(j, dict)


# ---------------- Export CSV ----------------
@pytest.mark.parametrize("report", ["records", "service", "category", "city", "partner", "merchant", "source"])
def test_export_csv(H, report):
    r = requests.get(f"{PE}/export?report={report}&nocache=1", headers=H, timeout=90)
    assert r.status_code == 200, f"{report}: {r.text[:200]}"
    text = r.text
    reader = csv.reader(io.StringIO(text))
    header = next(reader, None)
    assert header and len(header) >= 2, f"{report} bad csv"


# ---------------- Existing endpoints still work ----------------
@pytest.mark.parametrize("ep", [
    "/api/admin/finance/report",
    "/api/admin/finance/ledger?page=1&page_size=5",
    "/api/admin/reports/overview",
    "/api/admin/finance/withdrawals?page=1&page_size=5",
])
def test_existing_endpoints(H, ep):
    r = requests.get(f"{BASE}{ep}", headers=H, timeout=60)
    assert r.status_code == 200, f"{ep}: {r.status_code} {r.text[:200]}"
