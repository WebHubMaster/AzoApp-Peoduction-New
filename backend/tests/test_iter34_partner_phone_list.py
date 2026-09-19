"""Iteration 34 retest: #5 partner_phone appears on customer's GET /api/bookings for ASSIGNED bookings.

Fix under test: booking_controller.list_bookings backfills partner_phone from db.users
for assigned bookings whose doc lacks it.
"""
import pytest
import time
from conftest import API, client, login, PHONES


@pytest.fixture(scope="module")
def customer_c():
    return client(login(PHONES["customer"]))


@pytest.fixture(scope="module")
def partner_c():
    return client(login(PHONES["partner"]))


@pytest.fixture(scope="module")
def admin_c():
    return client(login(PHONES["admin"]))


class TestPartnerPhoneOnList:
    def test_list_has_partner_phone_key_always_present(self, customer_c):
        """Regression: every row in customer GET /api/bookings should carry partner_phone key
        (null for unassigned, actual phone for assigned)."""
        r = customer_c.get(f"{API}/bookings", timeout=30)
        assert r.status_code == 200, r.text
        rows = r.json()
        if not rows:
            pytest.skip("no bookings for customer")
        missing = [b.get("id") for b in rows if "partner_phone" not in b]
        assert not missing, f"partner_phone key missing on rows: {missing}"

    def test_list_regression_returns_otps_for_customer(self, customer_c):
        """Regression: backfill must not break otps or general list shape."""
        r = customer_c.get(f"{API}/bookings", timeout=30)
        assert r.status_code == 200
        for b in r.json():
            assert "otps" in b, f"otps missing on {b.get('id')}"

    def test_partner_list_still_ok(self, partner_c):
        """Regression: partner GET /api/bookings unaffected."""
        r = partner_c.get(f"{API}/bookings", timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_existing_assigned_booking_has_partner_phone(self, customer_c, admin_c):
        """If any existing booking is in assigned+ state, its partner_phone must be a non-empty string
        that matches the partner user's phone."""
        r = customer_c.get(f"{API}/bookings", timeout=30)
        assert r.status_code == 200
        assigned_states = {"assigned", "arrived_shop", "arrived_customer", "started", "completed", "paid"}
        assigned = [b for b in r.json() if b.get("partner_id") and (b.get("status") in assigned_states)]
        if not assigned:
            pytest.skip("no assigned booking present to verify")
        b = assigned[0]
        assert b.get("partner_phone"), f"partner_phone empty on assigned booking {b['id']} (partner_id={b['partner_id']})"
        assert isinstance(b["partner_phone"], str)
        assert b["partner_phone"].startswith("+"), f"unexpected phone format: {b['partner_phone']}"
        # Cross-check: phone matches the partner user's phone.
        # Ask admin for the partner user record.
        u = admin_c.get(f"{API}/admin/users/{b['partner_id']}", timeout=30)
        if u.status_code == 200:
            assert u.json().get("phone") == b["partner_phone"], \
                f"partner_phone {b['partner_phone']} does not match users.phone {u.json().get('phone')}"


class TestDriveAssignedBooking:
    """End-to-end: create a booking, pay via wallet, have partner +919000000003 accept it,
    then verify customer's list shows partner_phone."""

    booking_id = None
    partner_phone_expected = PHONES["partner"]

    def _get_service_id_for_partner_skill(self, customer_c, admin_c):
        """Pick a service whose required_skill matches partner +919000000003's skills."""
        # Find partner's skills
        pu = admin_c.get(f"{API}/admin/users?role=partner", timeout=30)
        skill = "ac"
        if pu.status_code == 200:
            for u in pu.json() if isinstance(pu.json(), list) else pu.json().get("items", []):
                if u.get("phone") == PHONES["partner"]:
                    sk = u.get("skills") or []
                    if sk:
                        skill = str(sk[0]).lower()
                    break
        # Find a matching service
        r = customer_c.get(f"{API}/catalog/services", timeout=30)
        if r.status_code != 200:
            return None
        for s in r.json():
            if str(s.get("required_skill", "")).lower() == skill:
                return s["id"]
        return (r.json() or [{}])[0].get("id")

    def test_drive_and_verify(self, customer_c, partner_c, admin_c):
        """Create booking → admin manually assigns partner +919000000003 (admin assign path
        does NOT set partner_phone on the doc, so we exercise the users-collection backfill)
        → verify customer's GET /api/bookings shows partner_phone matching users.phone."""
        svc_id = self._get_service_id_for_partner_skill(customer_c, admin_c)
        if not svc_id:
            pytest.skip("no service available")

        # Address in Patna to match partner service area
        addr = {"line": "Kankarbagh", "city": "Patna", "pincode": "800020", "lat": 25.6, "lng": 85.15}

        payload = {
            "service_id": svc_id, "address": addr, "schedule_type": "schedule",
            "scheduled_at": time.strftime("%Y-%m-%dT%H:00", time.localtime(time.time() + 7200)),
            "addons": [], "notes": "iter34 partner_phone retest",
        }
        r = customer_c.post(f"{API}/bookings", json=payload, timeout=30)
        if r.status_code != 200:
            pytest.skip(f"could not create booking: {r.status_code} {r.text[:200]}")
        bid = r.json()["id"]
        TestDriveAssignedBooking.booking_id = bid

        # Look up partner user id for +919000000003
        pid = None
        u = admin_c.get(f"{API}/admin/users?role=partner", timeout=30)
        data = u.json() if u.status_code == 200 else []
        if isinstance(data, dict):
            data = data.get("items") or data.get("users") or []
        for x in data:
            if x.get("phone") == PHONES["partner"]:
                pid = x["id"]
                break
        if not pid:
            pytest.skip("could not resolve partner id")

        # Admin manually assigns — this path does NOT stamp partner_phone on the doc,
        # so it exercises the backfill from the users collection.
        a = admin_c.post(f"{API}/admin/bookings/{bid}/assign",
                         json={"partner_id": pid}, timeout=30)
        assert a.status_code == 200, f"assign failed: {a.status_code} {a.text[:200]}"

        time.sleep(1)

        # Now customer's list should show partner_phone
        time.sleep(1)
        r2 = customer_c.get(f"{API}/bookings", timeout=30)
        assert r2.status_code == 200
        rows = {b["id"]: b for b in r2.json()}
        assert bid in rows, "just-created booking missing from customer list"
        row = rows[bid]
        assert row.get("partner_id"), f"booking should be assigned: {row.get('status')}"
        assert row.get("partner_phone") == TestDriveAssignedBooking.partner_phone_expected, \
            f"expected partner_phone {TestDriveAssignedBooking.partner_phone_expected}, got {row.get('partner_phone')} (status={row.get('status')})"
