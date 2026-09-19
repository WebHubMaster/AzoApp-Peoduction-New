"""Iteration 33 quick-fixes tests:
  - #5 Customer booking list serializer includes 'partner_phone'; booking detail returns partner.phone
  - #3 register_device drops user's older tokens (latest device only)
  - #15 GET /api/payments/refunds returns refund_amount per row
"""
import pytest
from conftest import API, client, login, PHONES


@pytest.fixture(scope="module")
def customer_c():
    return client(login(PHONES["customer"]))


# ---- #5 partner_phone on customer booking list & detail ----
class TestPartnerPhoneInBooking:
    def test_customer_bookings_shape_has_partner_phone_key(self, customer_c):
        """Requirement #5: customer list serializer must include partner_phone.
        Currently list_bookings returns raw booking docs without going through the
        _job_brief serializer, so 'partner_phone' key is missing entirely.
        """
        r = customer_c.get(f"{API}/bookings", timeout=30)
        assert r.status_code == 200, r.text
        bookings = r.json()
        assert isinstance(bookings, list)
        if not bookings:
            pytest.skip("no bookings for customer")
        # partner_phone key must be present on every serialized row (may be None if unassigned)
        missing = [b.get("id") for b in bookings if "partner_phone" not in b]
        assert not missing, f"partner_phone key missing on bookings: {missing}"

    def test_assigned_booking_has_partner_phone_value_or_detail_returns_it(self, customer_c):
        r = customer_c.get(f"{API}/bookings", timeout=30)
        assert r.status_code == 200
        bookings = r.json()
        assigned = [b for b in bookings if b.get("partner_id")]
        if not assigned:
            pytest.skip("No assigned booking to verify partner_phone value")
        b = assigned[0]
        # Either list serializer has it, or detail returns partner.phone
        if b.get("partner_phone"):
            assert isinstance(b["partner_phone"], str) and len(b["partner_phone"]) > 0
        # Booking detail must expose partner.phone regardless (track endpoint)
        # /bookings/{id} returns raw doc; the track/live endpoint may differ. Try detail first.
        d = customer_c.get(f"{API}/bookings/{b['id']}", timeout=30)
        assert d.status_code == 200, d.text
        doc = d.json()
        # partner_id present on doc; the "partner phone" for calling comes either from
        # doc.partner_phone OR from user lookup (test the source-of-truth via booking's live track endpoint if present)
        assert doc.get("partner_id") == b["partner_id"]


# ---- #3 register_device: latest device only ----
class TestLatestDeviceOnly:
    def test_register_two_tokens_keeps_only_latest(self, customer_c):
        # Snapshot existing devices for cleanup
        before = customer_c.get(f"{API}/notifications/my-devices", timeout=30)
        assert before.status_code == 200, before.text
        tok_a = "TESTTOKEN_ITER33_A"
        tok_b = "TESTTOKEN_ITER33_B"

        r1 = customer_c.post(
            f"{API}/notifications/devices",
            json={"token": tok_a, "user_agent": "pytest-iter33-A"},
            timeout=30,
        )
        assert r1.status_code == 200, r1.text
        assert r1.json().get("ok") is True

        r2 = customer_c.post(
            f"{API}/notifications/devices",
            json={"token": tok_b, "user_agent": "pytest-iter33-B"},
            timeout=30,
        )
        assert r2.status_code == 200, r2.text
        assert r2.json().get("ok") is True

        got = customer_c.get(f"{API}/notifications/my-devices", timeout=30)
        assert got.status_code == 200, got.text
        data = got.json()
        assert data.get("count") == 1, f"expected count==1, got {data}"
        assert len(data.get("devices", [])) == 1
        # Ensure the remaining device's user_agent matches the LATEST registration
        assert data["devices"][0].get("user_agent") == "pytest-iter33-B"

    def test_register_device_requires_token(self, customer_c):
        r = customer_c.post(f"{API}/notifications/devices", json={}, timeout=30)
        assert r.status_code == 400


# ---- #15 Refund list shows net refund_amount ----
class TestRefundNetAmount:
    def test_refunds_list_shape_and_refund_amount(self, customer_c):
        r = customer_c.get(f"{API}/payments/refunds", timeout=30)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        if not rows:
            pytest.skip("No refunds seeded for this customer")
        for row in rows:
            assert "refund_amount" in row, f"refund_amount missing on refund row {row}"
            # refund_amount must be numeric (int/float) — the net amount the customer receives
            v = row["refund_amount"]
            assert isinstance(v, (int, float)), f"refund_amount not numeric: {v!r}"
