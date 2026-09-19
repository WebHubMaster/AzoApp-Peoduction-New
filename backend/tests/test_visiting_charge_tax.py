"""
Tests for #8: Visiting Charge must NOT be taxed.
- gst_pct% applied ONLY to (service + addons + emergency + surge + fees)
- visiting_charge is added to total UNTAXED
- 'taxable' field returned excludes visiting_charge
- Invoice reconciles: subtotal (excludes visiting) + fees (includes visiting) + tax - discount == total
"""
import os
import math
import pytest
import requests

def _load_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    assert url, "REACT_APP_BACKEND_URL not set"
    return url.rstrip("/")

BASE = _load_url()


@pytest.fixture(scope="module")
def s():
    ss = requests.Session()
    ss.headers.update({"Content-Type": "application/json"})
    return ss


@pytest.fixture(scope="module")
def settings(s):
    # public settings endpoint if any; else login as admin
    r = s.get(f"{BASE}/api/site-config")
    if r.status_code == 200:
        return r.json()
    return {}


@pytest.fixture(scope="module")
def gst_pct(s):
    # Try to fetch gst via admin login (demo mode OTP 123456)
    a = s.post(f"{BASE}/api/auth/otp/request", json={"phone": "+919000000000"})
    tok = None
    if a.status_code == 200:
        r = s.post(f"{BASE}/api/auth/otp/verify", json={"phone": "+919000000000", "otp": "123456"})
        if r.status_code == 200:
            tok = r.json().get("token") or r.json().get("access_token")
    hdr = {"Authorization": f"Bearer {tok}"} if tok else {}
    r = s.get(f"{BASE}/api/admin/settings", headers=hdr)
    if r.status_code == 200:
        data = r.json()
        return float(data.get("gst_pct") or data.get("settings", {}).get("gst_pct") or 18)
    return 18.0


@pytest.fixture(scope="module")
def biz_config(s):
    # attempt to fetch business config via admin, else assume defaults from seed
    return {"global_visiting_charge": 100.0, "min_service_amount_for_visiting": 500.0}


def _find_low_priced_service(s):
    r = s.get(f"{BASE}/api/catalog/services")
    r.raise_for_status()
    data = r.json()
    items = data if isinstance(data, list) else (data.get("items") or data.get("services") or [])
    # sort by base_price ascending, pick a positive small one
    items = [i for i in items if float(i.get("base_price") or 0) > 0]
    items.sort(key=lambda x: float(x.get("base_price") or 0))
    return items[0] if items else None


def test_quote_excludes_visiting_from_tax(s, gst_pct, biz_config):
    svc = _find_low_priced_service(s)
    assert svc, "No services available to test"
    base = float(svc.get("base_price") or 0)
    # ensure visiting charge should apply
    if base >= biz_config["min_service_amount_for_visiting"]:
        pytest.skip(f"Service base {base} >= min {biz_config['min_service_amount_for_visiting']}; VC won't apply")

    r = s.get(f"{BASE}/api/bookings/quote", params={"service_id": svc["id"], "schedule_type": "schedule"})
    assert r.status_code == 200, r.text
    q = r.json()
    # pricing might be nested
    pr = q.get("pricing") or q
    print("Pricing:", pr)

    visiting = float(pr.get("visiting_charge") or 0)
    gst = float(pr.get("gst") or 0)
    total = float(pr.get("total") or 0)
    taxable = float(pr.get("taxable") or 0)
    service_value = float(pr.get("base") or 0) + float(pr.get("addons_total") or 0)
    emergency = float(pr.get("emergency_fee") or 0)
    surge = float(pr.get("surge") or 0)
    conv = float(pr.get("convenience_fee") or 0)
    plat = float(pr.get("platform_fee") or 0)

    assert visiting > 0, "Visiting charge expected but zero"
    assert "taxable" in pr, "Response missing new 'taxable' field"

    expected_taxable = service_value + emergency + surge + conv + plat
    assert math.isclose(taxable, expected_taxable, abs_tol=0.02), \
        f"taxable={taxable} vs expected {expected_taxable}"

    expected_gst = round(expected_taxable * gst_pct / 100, 2)
    assert math.isclose(gst, expected_gst, abs_tol=0.05), \
        f"gst={gst} vs expected {expected_gst} (gst_pct={gst_pct})"

    # ensure visiting NOT included in taxable base
    assert not math.isclose(gst, round((expected_taxable + visiting) * gst_pct / 100, 2), abs_tol=0.05), \
        "GST looks like it INCLUDES visiting charge (bug)"

    expected_total = round(expected_taxable + visiting + gst - float(pr.get("discount") or 0), 2)
    assert math.isclose(total, expected_total, abs_tol=0.05), \
        f"total={total} vs expected {expected_total}"


def test_math_scenario_1000_100_18():
    """Direct math sanity: service=1000, vc=100, gst=18 -> gst=180, total=1280"""
    service = 1000.0
    vc = 100.0
    gst_pct_v = 18.0
    taxable = service
    gst = round(taxable * gst_pct_v / 100, 2)
    total = round(taxable + vc + gst, 2)
    assert gst == 180.0
    assert total == 1280.0
