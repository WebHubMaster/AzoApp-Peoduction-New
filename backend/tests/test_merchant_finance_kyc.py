"""Merchant Bank & KYC (finance-kyc) end-to-end backend tests."""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # Fallback to frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for ln in f:
                if ln.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    BASE_URL = ln.split("=", 1)[1].strip()
                    break
    except Exception:
        pass
BASE_URL = (BASE_URL or "").rstrip("/")

MERCHANT_PHONE = "+919000000002"
ADMIN_PHONE = "+919000000000"
OTP = "123456"


def _login(phone):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, r.text
    r = s.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    tok = d["token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s, d["user"]


@pytest.fixture(scope="module")
def merchant():
    s, u = _login(MERCHANT_PHONE)
    return s, u


@pytest.fixture(scope="module")
def admin():
    s, u = _login(ADMIN_PHONE)
    return s, u


# ── FINANCE STATE ────────────────────────────────────────────────
def test_get_finance_kyc(merchant):
    s, u = merchant
    r = s.get(f"{BASE_URL}/api/merchant/panel/finance-kyc", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "eligible" in d
    assert "blockers" in d
    assert "banks" in d


# ── UPLOAD (multipart) ───────────────────────────────────────────
def _upload(sess, doc_type):
    # 1x1 PNG
    png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
           b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xdc\xccY\xe7\x00\x00\x00\x00IEND\xaeB`\x82")
    r = sess.post(
        f"{BASE_URL}/api/merchant/registration/upload",
        files={"file": ("test.png", io.BytesIO(png), "image/png")},
        data={"doc_type": doc_type},
        timeout=20,
    )
    return r


def test_upload_endpoint(merchant):
    s, _ = merchant
    r = _upload(s, "pan_url")
    assert r.status_code == 200, r.text
    d = r.json()
    assert "url" in d and d["url"]


# ── PAN FLOW ─────────────────────────────────────────────────────
def test_submit_pan_invalid(merchant):
    s, _ = merchant
    r = s.post(f"{BASE_URL}/api/merchant/panel/finance-kyc/pan",
               json={"pan_number": "BAD", "pan_url": "/x.png"}, timeout=15)
    assert r.status_code == 400


def test_submit_pan_and_admin_approve(merchant, admin):
    s, mu = merchant
    ad, _ = admin
    # Skip if already approved (leave as-is)
    st = s.get(f"{BASE_URL}/api/merchant/panel/finance-kyc").json()
    if not (st.get("pan") and st["pan"].get("status") == "approved"):
        up = _upload(s, "pan_url").json()
        r = s.post(f"{BASE_URL}/api/merchant/panel/finance-kyc/pan",
                   json={"pan_number": "ABCDE1234F", "pan_url": up["url"]}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["status"] in ("pending", "approved")
        # Admin approve
        r2 = ad.post(f"{BASE_URL}/api/admin/merchant/{mu['id']}/finance/pan/action",
                     json={"action": "approve"}, timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.json()["status"] == "approved"
    # Verify
    st2 = s.get(f"{BASE_URL}/api/merchant/panel/finance-kyc").json()
    assert st2["pan"]["status"] == "approved"


# ── BANK FLOW ────────────────────────────────────────────────────
def test_add_bank_missing_passbook(merchant):
    s, _ = merchant
    r = s.post(f"{BASE_URL}/api/merchant/panel/finance-kyc/banks",
               json={"account_holder": "Test", "bank_name": "HDFC",
                     "account_number": "123456781234", "ifsc": "HDFC0001234"},
               timeout=15)
    assert r.status_code == 400
    assert "passbook" in r.text.lower() or "cheque" in r.text.lower()


def test_add_bank_invalid_ifsc(merchant):
    s, _ = merchant
    up = _upload(s, "passbook_url").json()
    r = s.post(f"{BASE_URL}/api/merchant/panel/finance-kyc/banks",
               json={"account_holder": "Test", "bank_name": "HDFC",
                     "account_number": "123456781234", "ifsc": "BADIFSC",
                     "passbook_url": up["url"]}, timeout=15)
    assert r.status_code == 400


def test_add_bank_approve_and_primary(merchant, admin):
    s, mu = merchant
    ad, _ = admin
    up = _upload(s, "passbook_url").json()
    r = s.post(f"{BASE_URL}/api/merchant/panel/finance-kyc/banks",
               json={"account_holder": "TEST Sharma", "bank_name": "HDFC Bank",
                     "account_number": "123456781234", "ifsc": "HDFC0001234",
                     "account_type": "savings", "passbook_url": up["url"]},
               timeout=15)
    assert r.status_code == 200, r.text
    bank = r.json()
    bid = bank["id"]
    assert bank["status"] == "pending"

    # Admin approve
    r2 = ad.post(f"{BASE_URL}/api/admin/merchant/finance/banks/{bid}/action",
                 json={"action": "approve"}, timeout=15)
    assert r2.status_code == 200, r2.text
    assert r2.json()["status"] == "approved"

    # Verify
    st = s.get(f"{BASE_URL}/api/merchant/panel/finance-kyc").json()
    banks = st["banks"]
    approved = [b for b in banks if b["id"] == bid][0]
    assert approved["status"] == "approved"

    # Set primary (should only work on approved)
    r3 = s.post(f"{BASE_URL}/api/merchant/panel/finance-kyc/banks/{bid}/primary", timeout=15)
    assert r3.status_code == 200, r3.text

    # Verify eligible
    st2 = s.get(f"{BASE_URL}/api/merchant/panel/finance-kyc").json()
    assert st2["eligible"] is True


def test_delete_pending_bank(merchant):
    """Add a second bank & delete it — leaves the primary approved bank intact."""
    s, _ = merchant
    up = _upload(s, "passbook_url").json()
    r = s.post(f"{BASE_URL}/api/merchant/panel/finance-kyc/banks",
               json={"account_holder": "TEST Sharma 2", "bank_name": "ICICI Bank",
                     "account_number": "999988887777", "ifsc": "ICIC0001234",
                     "account_type": "current", "passbook_url": up["url"]},
               timeout=15)
    assert r.status_code == 200
    bid = r.json()["id"]
    r2 = s.delete(f"{BASE_URL}/api/merchant/panel/finance-kyc/banks/{bid}", timeout=15)
    assert r2.status_code == 200
    st = s.get(f"{BASE_URL}/api/merchant/panel/finance-kyc").json()
    assert not any(b["id"] == bid for b in st["banks"])
