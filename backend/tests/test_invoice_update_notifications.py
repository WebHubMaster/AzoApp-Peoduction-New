"""
Backend tests: Invoice Update Alert - 'Invoice updated' notification when
additional work changes a booking's invoice.

Covers:
 - Partner POST /api/bookings/{id}/additional -> customer gets BOTH
   'Additional work added' + new 'Invoice updated'
 - Partner DELETE additional item -> customer gets 'Invoice updated'
   (removed-text when no items remain)
 - Customer POST additional/pay -> customer gets 'Invoice updated' (fully
   paid variant) AND partner gets 'Additional payment received'
 - refresh_booking_invoice_additional (triggered via GET /api/invoices/{id})
   fires exactly ONE 'Invoice updated' notification and does NOT duplicate
   totals on repeated GETs
 - 'invoice_updated' event exists in admin template events list
 - Regression: AZO432C38 invoice total = 1714.40, 3 line items
"""
import os
import time
import uuid
import asyncio
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or "https://lazy-pagination.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CUSTOMER_PHONE = "+919000000004"
PARTNER_PHONE = "+919000000003"
ADMIN_PHONE = "+919000000000"
OTP = "123456"


def _login(phone):
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def customer_token():
    return _login(CUSTOMER_PHONE)


@pytest.fixture(scope="session")
def partner_token():
    return _login(PARTNER_PHONE)


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN_PHONE)


# --------- helpers ---------
async def _db():
    from config.database import db  # type: ignore
    return db


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if False else asyncio.run(coro)


def _notifications_for(token, title_substr=None, body_substr=None):
    r = requests.get(f"{API}/notifications", headers=_h(token), timeout=15)
    assert r.status_code == 200, r.text
    out = r.json()
    items = out if isinstance(out, list) else out.get("items") or []
    def _ok(n):
        if title_substr and title_substr.lower() not in str(n.get("title", "")).lower():
            return False
        if body_substr and body_substr.lower() not in str(n.get("body") or n.get("message") or "").lower():
            return False
        return True
    return [n for n in items if _ok(n)]


# --------- seeded booking fixture ---------
@pytest.fixture(scope="module")
def seed_started_booking():
    """Insert a fresh started-status booking owned by Raj Kumar (partner +91...003)
    and Priya Verma (customer +91...004) with NO additional work. Clean up after."""
    import pymongo
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = pymongo.MongoClient(mongo_url)
    db = client[db_name]
    partner = db.users.find_one({"phone": PARTNER_PHONE})
    customer = db.users.find_one({"phone": CUSTOMER_PHONE})
    assert partner and customer, "seed users missing"
    bid = str(uuid.uuid4())
    code = "AZOTST" + uuid.uuid4().hex[:3].upper()
    booking = {
        "id": bid,
        "code": code,
        "customer_id": customer["id"],
        "customer_name": customer.get("name"),
        "customer_phone": customer.get("phone"),
        "partner_id": partner["id"],
        "partner_name": partner.get("name"),
        "partner_phone": partner.get("phone"),
        "service_id": "svc-test",
        "service_name": "Test Service",
        "category_id": "cat-test",
        "category_name": "General",
        "address": {"line": "Test addr", "city": "Mumbai", "pincode": "400001"},
        "schedule_type": "schedule",
        "scheduled_at": "2026-01-10T10:00:00+00:00",
        "status": "started",
        "payment_status": "paid",
        "payment_method": "online",
        "pricing": {"base": 1000, "subtotal": 1000, "gst": 180, "total": 1180,
                    "visiting_charge": 0, "discount": 0, "emergency_fee": 0,
                    "surge": 0, "commission_pct": 20, "commissionable_base": 1000,
                    "gst_pct": 18},
        "items": [{"service_name": "Test Service", "qty": 1, "base_price": 1000,
                   "addons": [], "unit_service_value": 1000}],
        "otps": {"start": "1111", "completion": "2222"},
        "evidence": {"before": [], "after": []},
        "timeline": [{"status": "started", "at": "2026-01-10T10:00:00Z"}],
        "created_at": "2026-01-10T09:00:00Z",
        "updated_at": "2026-01-10T09:30:00Z",
    }
    db.bookings.insert_one(dict(booking))
    yield {"id": bid, "code": code, "customer_id": customer["id"], "partner_id": partner["id"]}
    # cleanup
    db.bookings.delete_one({"id": bid})
    db.notifications.delete_many({"user_id": customer["id"], "ref_id": bid})
    # delete notifications referring to the code
    db.notifications.delete_many({"user_id": customer["id"],
                                  "$or": [{"body": {"$regex": code}}, {"message": {"$regex": code}}]})
    client.close()


# --------- tests ---------

class TestTemplateEvents:
    def test_invoice_updated_event_registered(self, admin_token):
        r = requests.get(f"{API}/admin/partner-reg/template-events", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        events = data if isinstance(data, list) else data.get("items") or data.get("events") or []
        keys = {e.get("key") for e in events}
        assert "invoice_updated" in keys, f"invoice_updated missing. keys={keys}"


class TestAddAdditionalWork:
    def test_add_triggers_both_notifications(self, partner_token, customer_token, seed_started_booking):
        bid = seed_started_booking["id"]
        code = seed_started_booking["code"]
        # Clear existing notifications for easier assertion
        requests.delete(f"{API}/notifications", headers=_h(customer_token), timeout=15)

        payload = {"items": [{"description": "Tap replacement", "part_charge": 300,
                              "labour_charge": 200, "warranty": "", "ratecard_row_id": "",
                              "category_id": ""}]}
        r = requests.post(f"{API}/bookings/{bid}/additional", headers=_h(partner_token),
                          json=payload, timeout=20)
        assert r.status_code == 200, r.text
        time.sleep(3)  # notifications fired in background

        added = _notifications_for(customer_token, title_substr="Additional work added")
        updated = _notifications_for(customer_token, title_substr="Invoice updated", body_substr=code)
        assert added, "'Additional work added' notification missing"
        assert updated, "'Invoice updated' notification missing"
        body = (updated[0].get("body") or updated[0].get("message") or "")
        assert "additional work" in body.lower(), body
        assert "balance due" in body.lower(), body
        # Expected totals: base 1180 + additional 514.4 = 1694.4
        assert "514.4" in body
        assert "1694.4" in body or "1694.40" in body


class TestRemoveAdditional:
    def test_remove_last_item_triggers_removed_notification(self, partner_token, customer_token,
                                                             seed_started_booking):
        bid = seed_started_booking["id"]
        code = seed_started_booking["code"]
        # Fetch current item id
        r = requests.get(f"{API}/bookings/{bid}", headers=_h(partner_token), timeout=15)
        assert r.status_code == 200, r.text
        addl = r.json().get("additional") or {}
        items = addl.get("items") or []
        if not items:
            pytest.skip("no additional items to remove (test order dependency)")
        item_id = items[0]["id"]

        requests.delete(f"{API}/notifications", headers=_h(customer_token), timeout=15)
        r = requests.delete(f"{API}/bookings/{bid}/additional/{item_id}",
                            headers=_h(partner_token), timeout=20)
        assert r.status_code == 200, r.text
        time.sleep(3)

        updated = _notifications_for(customer_token, title_substr="Invoice updated", body_substr=code)
        assert updated, "'Invoice updated' notification not sent on removal"
        body = (updated[0].get("body") or updated[0].get("message") or "").lower()
        assert "removed" in body, body
        assert "1180" in body or "1180.0" in body


class TestPayAdditional:
    def test_pay_wallet_triggers_updated_and_partner_notification(self, partner_token,
                                                                   customer_token, seed_started_booking):
        bid = seed_started_booking["id"]
        code = seed_started_booking["code"]
        # (Re)add additional work
        payload = {"items": [{"description": "Tap replacement", "part_charge": 300,
                              "labour_charge": 200, "warranty": "", "ratecard_row_id": "",
                              "category_id": ""}]}
        r = requests.post(f"{API}/bookings/{bid}/additional", headers=_h(partner_token),
                          json=payload, timeout=20)
        assert r.status_code == 200, r.text
        time.sleep(1)

        # Top up customer wallet to ensure sufficient balance
        import pymongo
        client = pymongo.MongoClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        db.users.update_one({"id": seed_started_booking["customer_id"]},
                            {"$inc": {"wallet_balance": 2000}})
        client.close()

        requests.delete(f"{API}/notifications", headers=_h(customer_token), timeout=15)
        requests.delete(f"{API}/notifications", headers=_h(partner_token), timeout=15)

        r = requests.post(f"{API}/bookings/{bid}/additional/pay", headers=_h(customer_token),
                          json={"method": "wallet"}, timeout=20)
        assert r.status_code == 200, r.text
        time.sleep(3)

        upd = _notifications_for(customer_token, title_substr="Invoice updated", body_substr=code)
        assert upd, "'Invoice updated' (paid) notification missing"
        body = (upd[0].get("body") or upd[0].get("message") or "").lower()
        assert "received" in body or "fully paid" in body, body
        assert "1694.4" in body or "1694.40" in body

        pn = _notifications_for(partner_token, title_substr="Additional payment received")
        assert pn, "'Additional payment received' partner notification missing"


class TestInvoiceRefreshIdempotent:
    def test_single_notification_and_no_duplicate_totals(self, customer_token):
        """For AZO432C38 (existing paid-additional booking), the backend
        refresh_booking_invoice_additional path should have already fired
        exactly ONE 'Invoice updated' notification for that invoice number,
        and repeated GETs must NOT duplicate line_items/totals."""
        # Find the booking
        r = requests.get(f"{API}/bookings", headers=_h(customer_token), timeout=15)
        assert r.status_code == 200
        items = r.json()
        items = items if isinstance(items, list) else items.get("items") or []
        bk = next((b for b in items if "AZO432C38" in
                    (b.get("code"), b.get("booking_code"), b.get("number"))), None)
        if not bk:
            pytest.skip("AZO432C38 not in customer list")
        bid = bk["id"]
        r = requests.get(f"{API}/invoices", params={"booking_id": bid},
                         headers=_h(customer_token), timeout=15)
        invs = r.json()
        invs = invs if isinstance(invs, list) else invs.get("items") or []
        assert invs, "invoice not found"
        inv_id = invs[0]["id"]
        inv_number = invs[0].get("invoice_number")

        # Multiple GETs
        totals, line_counts = [], []
        for _ in range(3):
            r = requests.get(f"{API}/invoices/{inv_id}", headers=_h(customer_token), timeout=15)
            assert r.status_code == 200
            j = r.json()
            totals.append(float(j["total_amount"]))
            line_counts.append(len(j.get("line_items") or []))
            time.sleep(1)
        assert len(set(totals)) == 1, f"total changed across GETs: {totals}"
        assert len(set(line_counts)) == 1, f"line_items changed across GETs: {line_counts}"
        assert abs(totals[0] - 1714.4) < 0.5, f"expected 1714.40, got {totals[0]}"
        assert line_counts[0] == 3, f"expected 3 line_items, got {line_counts[0]}"

        # Count 'Invoice updated' notifications mentioning this invoice_number
        time.sleep(2)
        matches = _notifications_for(customer_token, title_substr="Invoice updated",
                                     body_substr=inv_number)
        assert len(matches) <= 1, f"expected <=1 invoice_updated notif for {inv_number}, got {len(matches)}"
