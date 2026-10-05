"""Backend sanity tests for Live Tracking feature."""
import os
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else "https://multi-panel-ui.preview.emergentagent.com"
BOOKING_ID = "ba936117-834f-40a2-a19c-65d3d4628050"


def _token(phone):
    requests.post(f"{BASE}/api/auth/send-otp", json={"phone": phone}, timeout=15)
    r = requests.post(f"{BASE}/api/auth/verify-otp", json={"phone": phone, "otp": "123456"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def test_customer_track_endpoint():
    t = _token("+919000000004")
    r = requests.get(f"{BASE}/api/bookings/{BOOKING_ID}/track", headers={"Authorization": f"Bearer {t}"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    print("TRACK:", data)
    assert data.get("trackable") is True
    assert "eta_text" in data
    # partner_location & customer_location keys exist (may be None depending on state)
    assert "partner_location" in data
    assert "customer_location" in data


def test_partner_post_location():
    t = _token("+919000000003")
    r = requests.post(
        f"{BASE}/api/bookings/{BOOKING_ID}/location",
        json={"lat": 25.61, "lng": 85.13},
        headers={"Authorization": f"Bearer {t}"},
        timeout=15,
    )
    print("POST LOC:", r.status_code, r.text[:200])
    assert r.status_code == 200, r.text


def test_track_after_update():
    t = _token("+919000000004")
    r = requests.get(f"{BASE}/api/bookings/{BOOKING_ID}/track", headers={"Authorization": f"Bearer {t}"}, timeout=15)
    assert r.status_code == 200
    print("TRACK AFTER:", r.json())
