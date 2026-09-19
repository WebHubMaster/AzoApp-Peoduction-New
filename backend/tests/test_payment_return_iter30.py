"""Iteration 30 — Cashfree /payment/return regression suite.

Verifies:
  * Booking creation returns pending_payment.
  * POST /api/payments/order (purpose=booking) uses Cashfree in sandbox and links
    pay_order_id + pay_gateway on the booking.
  * POST /api/payments/confirm-return with unknown order_id -> 404.
  * POST /api/payments/confirm-return with the real order_id -> paid:false, and
    the booking STAYS pending_payment (sandbox never completed the hosted flow).
  * Active gateway is Cashfree (not the dev mock).
"""
import time
import pytest
from conftest import API


# ---------- helpers -------------------------------------------------------

def _pick_service(anon):
    r = anon.get(f"{API}/catalog/services", timeout=30)
    assert r.status_code == 200, r.text
    for s in r.json():
        if s.get("status", "active") == "active":
            return s
    pytest.skip("no active service seeded")


def _ensure_address(customer):
    r = customer.get(f"{API}/auth/addresses", timeout=30)
    assert r.status_code == 200, r.text
    addrs = r.json() or []
    if addrs:
        return addrs[0]["id"]
    add = customer.post(f"{API}/auth/address", json={
        "label": "Home", "line1": "12 Test Rd", "city": "Patna",
        "state": "Bihar", "pincode": "800001", "lat": 25.6, "lng": 85.1,
    }, timeout=30)
    assert add.status_code == 200, add.text
    return add.json()["id"]


def _create_booking(customer, service_id, address_id):
    body = {"service_id": service_id, "address_id": address_id,
            "schedule_type": "schedule",
            "scheduled_at": "2030-01-01T10:00:00Z", "addons": [], "notes": ""}
    r = customer.post(f"{API}/bookings", json=body, timeout=60)
    assert r.status_code == 200, f"booking create failed: {r.status_code} {r.text}"
    return r.json()


# ---------- Active gateway is Cashfree ------------------------------------

class TestActiveGatewayCashfree:
    def test_admin_reports_cashfree_active(self, admin):
        r = admin.get(f"{API}/admin/settings", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json() or {}
        g = d.get("integrations") or {}
        assert (g.get("active_payin_gateway") or "").lower() == "cashfree", g
        assert g.get("cashfree_enabled") is True
        assert g.get("cashfree_mode") != "live"


# ---------- Order creation links pay_order_id on booking ------------------

class TestOrderLinksToBooking:
    def test_create_order_stores_pay_order_id(self, customer, anon, admin):
        svc = _pick_service(anon)
        addr = _ensure_address(customer)
        booking = _create_booking(customer, svc["id"], addr)
        bid = booking["id"]
        assert booking.get("payment_status") != "paid"

        r = customer.post(f"{API}/payments/order",
                          json={"purpose": "booking", "booking_id": bid}, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        # NOT a mock — Cashfree is live-configured in sandbox
        assert body.get("mock") is False, body
        assert body.get("gateway") == "cashfree", body
        assert body.get("method") == "cashfree_sdk", body
        order_id = body.get("order_id")
        payment_session_id = body.get("payment_session_id")
        assert order_id and payment_session_id, body

        # verify booking now carries pay_order_id
        gr = customer.get(f"{API}/bookings/{bid}", timeout=30)
        assert gr.status_code == 200, gr.text
        b = gr.json()
        assert b.get("pay_order_id") == order_id, b
        assert (b.get("pay_gateway") or "").lower() == "cashfree", b
        assert b.get("payment_status") != "paid"

        # stash for chained test
        pytest.iter30_order_id = order_id  # type: ignore[attr-defined]
        pytest.iter30_booking_id = bid  # type: ignore[attr-defined]


# ---------- confirm-return endpoint ---------------------------------------

class TestConfirmReturn:
    def test_confirm_return_unknown_order_id_404(self, customer):
        r = customer.post(f"{API}/payments/confirm-return",
                          json={"gw": "cashfree",
                                "order_id": "AZOAPP-NO-SUCH-ORDER-9999"}, timeout=30)
        assert r.status_code == 404, r.text

    def test_confirm_return_missing_order_id_400(self, customer):
        r = customer.post(f"{API}/payments/confirm-return",
                          json={"gw": "cashfree", "order_id": ""}, timeout=30)
        # empty string -> controller raises 400
        assert r.status_code in (400, 422), r.text

    def test_confirm_return_real_order_stays_pending(self, customer):
        order_id = getattr(pytest, "iter30_order_id", None)
        bid = getattr(pytest, "iter30_booking_id", None)
        if not order_id or not bid:
            pytest.skip("previous test did not produce an order")

        r = customer.post(f"{API}/payments/confirm-return",
                          json={"gw": "cashfree", "order_id": order_id}, timeout=45)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        # sandbox hosted-payment was NOT completed in automation → must NOT be paid
        assert body.get("paid") is False, body
        assert body.get("booking_id") == bid, body
        assert body.get("code"), body

        # booking is untouched — still pending_payment
        gr = customer.get(f"{API}/bookings/{bid}", timeout=30)
        assert gr.status_code == 200, gr.text
        b = gr.json()
        assert b.get("payment_status") != "paid", b
        assert b.get("status") == "pending_payment", b


# ---------- E2E sanity: bookings list still shows the pending booking -----

class TestBookingsListSanity:
    def test_pending_booking_visible(self, customer):
        bid = getattr(pytest, "iter30_booking_id", None)
        if not bid:
            pytest.skip("no booking created")
        r = customer.get(f"{API}/bookings", timeout=30)
        assert r.status_code == 200, r.text
        ids = {b.get("id"): b for b in r.json() or []}
        assert bid in ids, f"booking {bid} not in listing"
        assert ids[bid].get("status") == "pending_payment"


# ---------- Cleanup: cancel the test booking so it doesn't linger ---------

@pytest.fixture(scope="module", autouse=True)
def _cleanup(customer):
    yield
    bid = getattr(pytest, "iter30_booking_id", None)
    if bid:
        try:
            customer.post(f"{API}/bookings/{bid}/cancel",
                          json={"reason": "TEST_iter30 cleanup"}, timeout=30)
        except Exception:
            pass
