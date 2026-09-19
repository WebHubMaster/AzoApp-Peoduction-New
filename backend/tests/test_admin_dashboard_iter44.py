"""Iter44 — Admin Analytics Dashboard: GET /api/admin/dashboard tests.
All checks operate against live DB. No seeding. KPIs are FLAT (top-level)."""
import os
import pytest
import requests
from dotenv import dotenv_values

_env = dotenv_values("/app/frontend/.env")
BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
ADMIN_PHONE = "+919000000000"
OTP = "123456"

KPI_FIELDS = ["gmv", "platform_revenue", "partner_earnings", "merchant_commission",
              "total_bookings", "completed_bookings", "pending_bookings", "cancelled_bookings",
              "active_customers", "active_partners", "active_merchants", "avg_order_value"]


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/api/auth/send-otp", json={"phone": ADMIN_PHONE}, timeout=30)
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE}/api/auth/verify-otp", json={"phone": ADMIN_PHONE, "otp": OTP}, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("token") or j.get("access_token")


@pytest.fixture(scope="module")
def hdrs(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _get(params, hdrs):
    return requests.get(f"{BASE}/api/admin/dashboard", params=params, headers=hdrs, timeout=90)


def test_auth_required():
    r = requests.get(f"{BASE}/api/admin/dashboard", timeout=60)
    assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"


def test_range_30d_shape(hdrs):
    r = _get({"range": "30d"}, hdrs)
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ["generated_at", "compare", "earnings", "combined_series", "status_breakdown",
              "operations", "needs_attention", "top_partners", "top_services", "top_categories",
              "city_performance", "customer_analytics", "merchant_analytics", "qr_analytics",
              "filters_available", "recent_bookings"]:
        assert k in d, f"missing {k}"
    for k in KPI_FIELDS:
        assert k in d, f"missing KPI {k}"
    assert d["generated_at"], "generated_at empty"


def test_status_breakdown_sums_to_total(hdrs):
    d = _get({"range": "30d"}, hdrs).json()
    total = d["total_bookings"]
    sb = d["status_breakdown"]
    assert isinstance(sb, list)
    sb_sum = sum(x.get("count", 0) for x in sb)
    assert sb_sum == total, f"status_breakdown sum {sb_sum} != total {total}"


def test_completed_equals_completed_plus_paid(hdrs):
    d = _get({"range": "all"}, hdrs).json()
    sb = {x["status"]: x["count"] for x in d["status_breakdown"]}
    expected = sb.get("completed", 0) + sb.get("paid", 0)
    assert d["completed_bookings"] == expected, f"completed_bookings {d['completed_bookings']} != completed+paid {expected}"


def test_combined_series_bookings_sum(hdrs):
    d = _get({"range": "30d"}, hdrs).json()
    cs_sum = sum(pt.get("bookings", 0) for pt in d["combined_series"])
    total = d["total_bookings"]
    # combined_series is per bucket in date window; sum should equal total in same window
    assert cs_sum == total, f"combined_series bookings sum {cs_sum} != total {total}"


def test_range_all_has_baseline_false(hdrs):
    d = _get({"range": "all"}, hdrs).json()
    cmp_ = d.get("compare") or {}
    assert cmp_.get("has_baseline") is False, f"expected has_baseline=False for range=all, got {cmp_}"


def test_bucket_echo(hdrs):
    for b in ("day", "week", "month", "year"):
        d = _get({"range": "365d", "bucket": b}, hdrs).json()
        assert d.get("series_bucket") == b or d.get("bucket") == b, f"bucket not echoed for {b}: {d.get('series_bucket')}/{d.get('bucket')}"
        assert isinstance(d["combined_series"], list)


def test_custom_date_range(hdrs):
    r = _get({"date_from": "2025-01-01", "date_to": "2025-12-31"}, hdrs)
    assert r.status_code == 200
    d = r.json()
    assert "total_bookings" in d


def test_filter_narrows_results(hdrs):
    base = _get({"range": "all"}, hdrs).json()
    total_all = base["total_bookings"]
    filt = _get({"range": "all", "status": "completed"}, hdrs).json()
    assert filt["total_bookings"] <= total_all


def test_earnings_arithmetic(hdrs):
    d = _get({"range": "all"}, hdrs).json()
    e = d["earnings"]
    expected = round(e["platform_revenue"] - e["merchant_commission"] - e["refunds"], 2)
    assert abs(e["net_revenue"] - expected) < 0.5, f"net_revenue {e['net_revenue']} != platform-merchant-refunds {expected}"


def test_recent_bookings_no_object_id(hdrs):
    d = _get({"range": "all"}, hdrs).json()
    rb = d["recent_bookings"]
    assert isinstance(rb, list)
    if rb:
        assert "_id" not in rb[0], "recent_bookings should not include mongo _id"


def test_filters_available_keys(hdrs):
    d = _get({"range": "all"}, hdrs).json()
    fa = d["filters_available"]
    for k in ["cities", "categories", "services", "statuses", "booking_types",
              "payment_statuses", "payment_methods", "partners", "customers", "merchants"]:
        assert k in fa, f"filters_available missing {k}"
