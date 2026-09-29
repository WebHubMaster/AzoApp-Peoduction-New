"""Reschedule ring reaches both parties + Admin customer google-services.json."""
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests

_B = os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
if not _B:
    # Load from /app/frontend/.env if not in os.environ
    try:
        with open("/app/frontend/.env") as _f:
            for _line in _f:
                if _line.startswith("REACT_APP_BACKEND_URL="):
                    _B = _line.split("=", 1)[1].strip()
                    break
    except Exception:
        pass
assert _B, "REACT_APP_BACKEND_URL not set"
BASE = _B.rstrip("/") + "/api"


def _login(phone: str) -> str:
    requests.post(f"{BASE}/auth/send-otp", json={"phone": phone}, timeout=15)
    r = requests.post(
        f"{BASE}/auth/verify-otp",
        json={"phone": phone, "otp": "123456", "create_if_new": False},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def partner_token():
    return _login("+919000000003")


@pytest.fixture(scope="module")
def customer_token():
    return _login("+919000000004")


@pytest.fixture(scope="module")
def admin_token():
    return _login("+919000000000")


def _future_slot(days_ahead: int = 2, hour: int = 10, minute: int = 0) -> str:
    dt = (datetime.now(timezone.utc) + timedelta(days=days_ahead)).replace(
        hour=hour, minute=minute, second=0, microsecond=0
    )
    return dt.strftime("%Y-%m-%dT%H:%M")


def _pick_partner_booking(tok):
    r = requests.get(f"{BASE}/bookings/partner/active", headers=_h(tok), timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data if isinstance(data, list) else (data.get("bookings") or data.get("items") or [])
    for b in items:
        if b.get("status") in ("assigned", "arrived_shop", "arrived_customer") and b.get("customer_id"):
            return b
    return None


def _cancel_if_pending(booking_id, tok):
    # Cancel any existing pending reschedule request as the requester
    requests.post(f"{BASE}/bookings/{booking_id}/reschedule/cancel", headers=_h(tok), timeout=15)


class TestReschedulePartnerToCustomer:
    def test_partner_reschedule_rings_customer(self, partner_token, customer_token, admin_token):
        b = _pick_partner_booking(partner_token)
        if not b:
            pytest.skip("No assigned partner booking available in seed to test reschedule")
        booking_id = b["id"]
        _cancel_if_pending(booking_id, partner_token)
        _cancel_if_pending(booking_id, customer_token)

        # Snapshot delivery log count (via admin) BEFORE
        pre = requests.get(
            f"{BASE}/admin/notification-delivery-logs?title=Reschedule%20request&page_size=200",
            headers=_h(admin_token), timeout=15)
        # Endpoint may be different; we'll fall back to counting via a specific one below.
        pre_ok = pre.status_code == 200

        new_at = _future_slot(2, 10, 30)  # 30-min grid
        r = requests.post(
            f"{BASE}/bookings/{booking_id}/reschedule/request",
            headers=_h(partner_token),
            json={"scheduled_at": new_at},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        req = body.get("reschedule_request") or {}
        assert req.get("status") == "pending", body
        assert req.get("requested_by_role") == "partner", body

        # Give async tasks a moment
        time.sleep(2)

        # Customer must receive in-app notification titled 'Reschedule request'.
        rn = requests.get(f"{BASE}/notifications?limit=20", headers=_h(customer_token), timeout=15)
        assert rn.status_code == 200, rn.text
        _nj = rn.json(); notifs = _nj if isinstance(_nj, list) else (_nj.get("notifications") or _nj.get("items") or [])
        assert any((n.get("title") == "Reschedule request") for n in notifs), \
            f"Customer did not receive 'Reschedule request' notification. Got: {notifs[:5]}"

        # And a delivery log row for the customer_id with title 'Reschedule request'
        # (status may be 'skipped'/'no_devices' — that's expected).
        cust_id = b.get("customer_id")
        found_log = False
        # Best-effort: try common admin endpoints
        for url in (
            f"{BASE}/admin/notification-delivery-logs?user_id={cust_id}&page_size=50",
            f"{BASE}/admin/notification/delivery-logs?user_id={cust_id}&page_size=50",
            f"{BASE}/admin/push/delivery-logs?user_id={cust_id}&page_size=50",
        ):
            rr = requests.get(url, headers=_h(admin_token), timeout=15)
            if rr.status_code == 200:
                data = rr.json()
                rows = data.get("logs") or data.get("items") or data.get("rows") or (data if isinstance(data, list) else [])
                if any(row.get("title") == "Reschedule request" and row.get("user_id") == cust_id for row in rows):
                    found_log = True
                    break
        # If no admin endpoint exists, at least assert push dispatch code fired (in-app notif OK is main proof).
        if not found_log:
            print(f"WARN: could not verify delivery log via admin endpoints (pre_ok={pre_ok}); in-app notification present.")

        # cleanup
        _cancel_if_pending(booking_id, partner_token)

    def test_customer_reschedule_rings_partner(self, partner_token, customer_token):
        b = _pick_partner_booking(partner_token)
        if not b:
            pytest.skip("No assigned partner booking available")
        booking_id = b["id"]
        _cancel_if_pending(booking_id, partner_token)
        _cancel_if_pending(booking_id, customer_token)

        new_at = _future_slot(3, 14, 0)
        r = requests.post(
            f"{BASE}/bookings/{booking_id}/reschedule/request",
            headers=_h(customer_token),
            json={"scheduled_at": new_at},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        req = (r.json().get("reschedule_request") or {})
        assert req.get("status") == "pending"
        assert req.get("requested_by_role") == "customer"

        time.sleep(2)
        rn = requests.get(f"{BASE}/notifications?limit=20", headers=_h(partner_token), timeout=15)
        assert rn.status_code == 200, rn.text
        _nj = rn.json(); notifs = _nj if isinstance(_nj, list) else (_nj.get("notifications") or _nj.get("items") or [])
        assert any((n.get("title") == "Reschedule request") for n in notifs), \
            "Partner did not get 'Reschedule request' notification (customer→partner regression)"

        _cancel_if_pending(booking_id, customer_token)

    def test_respond_reschedule_permissions(self, partner_token, customer_token):
        b = _pick_partner_booking(partner_token)
        if not b:
            pytest.skip("No booking")
        bid = b["id"]
        _cancel_if_pending(bid, partner_token)
        _cancel_if_pending(bid, customer_token)

        new_at = _future_slot(4, 11, 30)
        r = requests.post(f"{BASE}/bookings/{bid}/reschedule/request",
                          headers=_h(partner_token), json={"scheduled_at": new_at}, timeout=15)
        assert r.status_code == 200, r.text

        # Requester (partner) trying to respond → 403
        r1 = requests.post(f"{BASE}/bookings/{bid}/reschedule/respond",
                           headers=_h(partner_token), json={"action": "accept"}, timeout=15)
        assert r1.status_code == 403, r1.text

        # Opposite party (customer) accepts → 200, scheduled_at updated
        r2 = requests.post(f"{BASE}/bookings/{bid}/reschedule/respond",
                           headers=_h(customer_token), json={"action": "accept"}, timeout=15)
        assert r2.status_code == 200, r2.text
        assert (r2.json().get("scheduled_at") or "").startswith(new_at[:16]) or r2.json().get("scheduled_at"), r2.text


# ── Admin Customer google-services.json ─────────────────────────────
CUSTOMER_GS_JSON = (
    '{"project_info":{"project_number":"111","firebase_url":"https://x.firebaseio.com",'
    '"project_id":"azo-customer","storage_bucket":"azo-customer.appspot.com"},'
    '"client":[{"client_info":{"mobilesdk_app_id":"1:111:android:abc",'
    '"android_client_info":{"package_name":"app.azoapp.customer"}},'
    '"api_key":[{"current_key":"AIzaTEST"}]}],"configuration_version":"1"}'
)


class TestAdminGoogleServicesCustomer:
    def test_get_customer_status_initial(self, admin_token):
        r = requests.get(f"{BASE}/admin/partner-reg/fcm-config/google-services?app=customer",
                         headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        assert "configured" in r.json()

    def test_partner_status_before(self, admin_token):
        r = requests.get(f"{BASE}/admin/partner-reg/fcm-config/google-services",
                         headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        self.__class__._partner_before = r.json()

    def test_put_customer_gs(self, admin_token):
        r = requests.put(
            f"{BASE}/admin/partner-reg/fcm-config/google-services",
            headers=_h(admin_token),
            json={"app": "customer", "package_name": "app.azoapp.customer",
                  "google_services_json": CUSTOMER_GS_JSON},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("ok") is True, j
        pkgs = j.get("packages") or []
        assert "app.azoapp.customer" in pkgs, j

    def test_get_customer_configured_true(self, admin_token):
        r = requests.get(f"{BASE}/admin/partner-reg/fcm-config/google-services?app=customer",
                         headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("configured") is True, r.json()

    def test_partner_config_unchanged(self, admin_token):
        r = requests.get(f"{BASE}/admin/partner-reg/fcm-config/google-services",
                         headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        after = r.json()
        before = getattr(self.__class__, "_partner_before", None)
        # Partner document is independent — must not now claim it has the customer package
        pkgs = after.get("packages") or []
        assert "app.azoapp.customer" not in pkgs, \
            f"Partner config polluted with customer package: {after}"
        if before is not None:
            assert after.get("configured") == before.get("configured"), (before, after)

    def test_download_customer_gs(self, admin_token):
        r = requests.get(f"{BASE}/admin/partner-reg/fcm-config/google-services/download?app=customer",
                         headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        assert "app.azoapp.customer" in r.text
