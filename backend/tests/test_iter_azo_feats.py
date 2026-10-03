"""Backend tests for AzoApp iteration: surge removal, fee_info, partner-card, track ETA, support realtime."""
import os
import time
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    # fallback for pytest run outside web_panel env
    with open("/app/web_panel/.env") as f:
        for ln in f:
            if ln.startswith("REACT_APP_BACKEND_URL="):
                BASE = ln.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE}/api"

ADMIN_PHONE = "+919000000000"
CUSTOMER_PHONE = "+919000000004"
PARTNER_PHONE = "+919000000003"
OTP = "123456"

BOOKING_ID = "3af4d793-e12e-4145-8720-cbeb97b20cce"  # has partner assigned + partner_location + address lat/lng
PARTNER_ID = "8053788e-7470-4427-b38b-92192d0d209a"
SERVICE_ID = "b83ce001-3a6f-44a2-976e-f4d4332f5389"


def _login(phone):
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, r.text
    return tok


@pytest.fixture(scope="module")
def admin_tok():
    return _login(ADMIN_PHONE)


@pytest.fixture(scope="module")
def customer_tok():
    return _login(CUSTOMER_PHONE)


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ========== P1: SURGE REMOVED ==========
class TestSurgeRemoved:
    def test_quote_emergency_no_surge(self, customer_tok):
        r = requests.get(
            f"{API}/bookings/quote",
            params={"service_id": SERVICE_ID, "schedule_type": "emergency"},
            headers=H(customer_tok), timeout=15,
        )
        assert r.status_code == 200, r.text
        p = r.json().get("pricing", {})
        assert p.get("surge", 0) == 0, f"surge={p.get('surge')}"
        assert p.get("surge_rule") in (None, ""), f"surge_rule={p.get('surge_rule')}"

    def test_cart_quote_no_surge(self, customer_tok):
        payload = {
            "items": [{"service_id": SERVICE_ID, "qty": 1}],
            "schedule_type": "emergency",
            "address": {"lat": 25.5941, "lng": 85.1376, "city": "Patna"},
        }
        r = requests.post(f"{API}/bookings/cart-quote", json=payload, headers=H(customer_tok), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        pricing = data.get("pricing", {})
        assert pricing.get("surge", 0) == 0
        extras = (data.get("breakdown", {}) or {}).get("additional_charges", []) or []
        labels = [str(e.get("label", "")).lower() for e in extras]
        assert not any("surge" in l for l in labels), f"Surge in breakdown: {labels}"


# ========== P4: FEE INFO ==========
class TestFeeInfo:
    def test_site_config_fee_info_present(self):
        r = requests.get(f"{API}/site/config", timeout=15)
        assert r.status_code == 200, r.text
        fi = r.json().get("fee_info")
        assert isinstance(fi, dict), f"fee_info missing: {r.json().keys()}"
        assert "tax" in fi and "platform_fee" in fi
        assert isinstance(fi["tax"], str) and isinstance(fi["platform_fee"], str)

    def test_admin_update_and_reflect(self, admin_tok):
        marker = f"TEST_tax_{int(time.time())}"
        marker2 = f"TEST_pf_{int(time.time())}"
        r = requests.put(
            f"{API}/admin/settings",
            json={"general": {"tax_info": marker, "platform_fee_info": marker2}},
            headers=H(admin_tok), timeout=15,
        )
        assert r.status_code in (200, 204), r.text
        time.sleep(0.5)
        r2 = requests.get(f"{API}/site/config", timeout=15)
        fi = r2.json().get("fee_info", {})
        assert fi.get("tax") == marker, fi
        assert fi.get("platform_fee") == marker2, fi


# ========== P5: PARTNER CARD ==========
class TestPartnerCard:
    def test_partner_card_admin(self, admin_tok):
        r = requests.get(f"{API}/bookings/{BOOKING_ID}/partner-card", headers=H(admin_tok), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["name", "photo", "rating", "jobs_completed", "reviews_count", "skills", "member_since", "rating_distribution", "reviews"]:
            assert k in d, f"missing key: {k}; got {list(d.keys())}"
        assert isinstance(d["reviews"], list)
        # No confidential fields
        text = str(d).lower()
        for forbidden in ["phone", "email", "bank", "ifsc", "aadhaar", "pan", "document", "earning", "wallet"]:
            assert forbidden not in d, f"forbidden key {forbidden} present"
        # looser check: forbidden strings shouldn't appear as keys at top-level
        assert all(k not in d for k in ["phone", "email", "bank_account", "documents", "earnings", "wallet_balance"])

    def test_partner_card_404_when_no_partner(self, admin_tok):
        # find a booking without partner
        import pymongo
        with open("/app/backend/.env") as f:
            for ln in f:
                if ln.startswith("MONGO_URL="):
                    mongo = ln.split("=", 1)[1].strip()
                    break
        cli = pymongo.MongoClient(mongo)
        b = cli["azoapp"]["bookings"].find_one({"$or": [{"partner_id": None}, {"partner_id": {"$exists": False}}]}, {"id": 1})
        if not b:
            pytest.skip("No booking without partner found")
        r = requests.get(f"{API}/bookings/{b['id']}/partner-card", headers=H(admin_tok), timeout=15)
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text}"


# ========== P7: TRACK ETA ==========
class TestTrackETA:
    def test_track_booking_admin(self, admin_tok):
        r = requests.get(f"{API}/bookings/{BOOKING_ID}/track", headers=H(admin_tok), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "distance_km" in d and isinstance(d["distance_km"], (int, float)), d
        assert "eta_minutes" in d and isinstance(d["eta_minutes"], (int, float)), d
        assert d.get("eta_source") in ("google", "estimate"), d.get("eta_source")
        partner = d.get("partner") or {}
        assert "photo" in partner, partner
        assert "rating" in partner, partner


# ========== P6: SUPPORT REALTIME ==========
class TestSupport:
    def test_full_flow(self, admin_tok, customer_tok):
        # create ticket as customer
        r = requests.post(
            f"{API}/support/tickets",
            json={"category": "booking", "booking_code": "AZO88CC2B", "subject": "TEST_help", "message": "test SOS"},
            headers=H(customer_tok), timeout=15,
        )
        assert r.status_code in (200, 201), r.text
        tid = (r.json() or {}).get("id") or (r.json() or {}).get("ticket_id") or (r.json().get("ticket") or {}).get("id")
        assert tid, r.json()

        # GET ticket
        r = requests.get(f"{API}/support/tickets/{tid}", headers=H(customer_tok), timeout=15)
        assert r.status_code == 200, r.text

        # customer posts message
        r = requests.post(f"{API}/support/tickets/{tid}/messages", json={"text": "customer msg"}, headers=H(customer_tok), timeout=15)
        assert r.status_code in (200, 201), r.text

        # admin posts reply
        r = requests.post(f"{API}/admin/support/tickets/{tid}/messages", json={"text": "admin reply"}, headers=H(admin_tok), timeout=15)
        assert r.status_code in (200, 201), r.text

        # customer should see admin reply
        r = requests.get(f"{API}/support/tickets/{tid}", headers=H(customer_tok), timeout=15)
        assert r.status_code == 200
        msgs = (r.json() or {}).get("messages", []) or []
        texts = " ".join(str(m.get("text", "")) + " " + str(m.get("message", "")) for m in msgs)
        assert "admin reply" in texts, f"admin reply not visible: {texts}"

        # typing endpoints should not 500
        r = requests.post(f"{API}/support/tickets/{tid}/typing", json={"typing": True}, headers=H(customer_tok), timeout=10)
        assert r.status_code in (200, 201, 204), r.text
        r = requests.post(f"{API}/admin/support/tickets/{tid}/typing", json={"typing": True}, headers=H(admin_tok), timeout=10)
        assert r.status_code in (200, 201, 204), r.text
