"""Iteration 2: ERP admin modules — payouts, refunds, tickets, notifications, CMS, catalog admin,
system users, dashboard extras + review rating validation."""
import pytest
from conftest import API, PHONES, login, client


# ---------------- admin dashboard extras ----------------
class TestAdminDashboardExtras:
    def test_dashboard_new_fields(self, admin):
        r = admin.get(f"{API}/admin/dashboard", timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("top_partners", "top_services", "revenue_series", "pending_payouts",
                  "open_tickets", "recent_bookings"):
            assert k in d, f"missing {k}"
        assert isinstance(d["top_partners"], list)
        assert isinstance(d["top_services"], list)
        assert isinstance(d["revenue_series"], list)
        assert isinstance(d["pending_payouts"], int)
        assert isinstance(d["open_tickets"], int)

    def test_dashboard_rejects_customer(self, customer):
        assert customer.get(f"{API}/admin/dashboard", timeout=30).status_code == 403


# ---------------- payouts ----------------
class TestPayouts:
    state = {}

    def test_01_partner_wallet_and_request(self, partner):
        w = partner.get(f"{API}/wallet", timeout=30)
        assert w.status_code == 200, w.text
        bal = float(w.json().get("balance", w.json().get("wallet_balance", 0)))
        TestPayouts.state["bal"] = bal
        assert bal > 0, f"partner wallet empty ({bal}); run full money flow first"
        amt = round(min(50.0, bal), 2)
        TestPayouts.state["amt"] = amt
        r = partner.post(f"{API}/payouts", json={"amount": amt, "method": "bank"}, timeout=30)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["status"] == "pending"
        assert p["amount"] == amt
        assert "id" in p and "_id" not in p
        TestPayouts.state["id"] = p["id"]

    def test_02_payout_exceeding_wallet_rejected(self, partner):
        r = partner.post(f"{API}/payouts",
                         json={"amount": TestPayouts.state["bal"] + 100000, "method": "bank"}, timeout=30)
        assert r.status_code == 400, r.text

    def test_03_payout_non_positive_rejected(self, partner):
        assert partner.post(f"{API}/payouts", json={"amount": 0}, timeout=30).status_code == 422

    def test_04_my_payouts_lists_it(self, partner):
        r = partner.get(f"{API}/payouts", timeout=30)
        assert r.status_code == 200
        assert any(x["id"] == TestPayouts.state["id"] for x in r.json())

    def test_05_admin_sees_payout(self, admin):
        r = admin.get(f"{API}/admin/payouts", timeout=30)
        assert r.status_code == 200
        assert any(x["id"] == TestPayouts.state["id"] for x in r.json())

    def test_06_admin_payouts_rejects_partner(self, partner):
        assert partner.get(f"{API}/admin/payouts", timeout=30).status_code == 403

    def test_07_approve_deducts_wallet_and_creates_txn(self, admin, partner):
        pid = TestPayouts.state["id"]
        r = admin.post(f"{API}/admin/payouts/{pid}?status=approved", timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "approved"
        w = partner.get(f"{API}/wallet", timeout=30).json()
        new_bal = float(w.get("balance", w.get("wallet_balance", 0)))
        expected = round(TestPayouts.state["bal"] - TestPayouts.state["amt"], 2)
        assert abs(new_bal - expected) < 0.05, f"wallet {new_bal} != expected {expected}"
        txns = w.get("transactions", [])
        assert any(t.get("kind") == "payout" for t in txns), "no payout debit transaction"

    def test_08_approve_again_rejected(self, admin):
        r = admin.post(f"{API}/admin/payouts/{TestPayouts.state['id']}?status=approved", timeout=30)
        assert r.status_code == 400, r.text

    def test_09_unknown_payout_404(self, admin):
        assert admin.post(f"{API}/admin/payouts/nope?status=approved", timeout=30).status_code == 404


# ---------------- refunds ----------------
class TestRefunds:
    state = {}

    def test_01_create_refund_credits_customer(self, admin, customer):
        b = customer.get(f"{API}/bookings", timeout=30)
        assert b.status_code == 200
        rows = b.json()
        assert rows, "customer has no bookings"
        paid = [x for x in rows if x.get("payment_status") == "paid" or x.get("status") == "paid"]
        if not paid:
            pytest.skip("no paid booking available for refund test")
        booking = paid[0]
        TestRefunds.state["booking_id"] = booking["id"]
        before = float(customer.get(f"{API}/wallet", timeout=30).json().get("balance", 0))
        r = admin.post(f"{API}/admin/refunds", json={"booking_id": booking["id"], "amount": 25, "reason": "TEST_refund"}, timeout=30)
        assert r.status_code == 200, r.text
        ref = r.json()
        assert ref["amount"] == 25
        assert ref["status"] == "processed"
        assert ref["booking_code"] == booking["code"]
        TestRefunds.state["id"] = ref["id"]
        after = float(customer.get(f"{API}/wallet", timeout=30).json().get("balance", 0))
        assert abs(after - (before + 25)) < 0.05, f"wallet {after} vs {before}+25"

    def test_02_refund_listed(self, admin):
        if "id" not in TestRefunds.state:
            pytest.skip("no refund created")
        r = admin.get(f"{API}/admin/refunds", timeout=30)
        assert r.status_code == 200
        assert any(x["id"] == TestRefunds.state["id"] for x in r.json())

    def test_03_refund_unknown_booking_404(self, admin):
        r = admin.post(f"{API}/admin/refunds", json={"booking_id": "nope", "amount": 10, "reason": "x"}, timeout=30)
        assert r.status_code == 404, r.text

    def test_04_refund_rejects_non_admin(self, customer):
        r = customer.post(f"{API}/admin/refunds", json={"booking_id": TestRefunds.state.get("booking_id", "x"), "amount": 10}, timeout=30)
        assert r.status_code == 403


# ---------------- tickets ----------------
class TestTickets:
    state = {}

    def test_01_customer_creates_ticket(self, customer):
        r = customer.post(f"{API}/tickets", json={"subject": "TEST_subject", "message": "TEST_msg"}, timeout=30)
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["status"] == "open" and t["replies"] == []
        assert t["role"] == "customer"
        TestTickets.state["id"] = t["id"]

    def test_02_my_tickets_only_mine(self, customer, partner):
        mine = customer.get(f"{API}/tickets", timeout=30)
        assert mine.status_code == 200
        assert any(x["id"] == TestTickets.state["id"] for x in mine.json())
        other = partner.get(f"{API}/tickets", timeout=30)
        assert other.status_code == 200
        assert all(x["id"] != TestTickets.state["id"] for x in other.json()), \
            "partner can see customer's ticket"

    def test_03_admin_lists_and_replies(self, admin, customer):
        allt = admin.get(f"{API}/admin/tickets", timeout=30)
        assert allt.status_code == 200
        assert any(x["id"] == TestTickets.state["id"] for x in allt.json())
        r = admin.post(f"{API}/admin/tickets/{TestTickets.state['id']}/reply",
                       json={"text": "TEST_reply"}, timeout=30)
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["status"] == "answered"
        assert t["replies"][-1]["text"] == "TEST_reply"

    def test_04_admin_closes(self, admin):
        r = admin.post(f"{API}/admin/tickets/{TestTickets.state['id']}/close", timeout=30)
        assert r.status_code == 200
        assert r.json()["status"] == "closed"

    def test_05_admin_ticket_routes_reject_customer(self, customer):
        assert customer.get(f"{API}/admin/tickets", timeout=30).status_code == 403


# ---------------- notifications ----------------
class TestNotifications:
    state = {}

    def test_01_admin_sends_partner_audience(self, admin):
        r = admin.post(f"{API}/admin/notifications",
                       json={"title": "TEST_partner_only", "body": "hello", "audience": "partner"}, timeout=30)
        assert r.status_code == 200, r.text
        TestNotifications.state["partner_id"] = r.json()["id"]

    def test_02_admin_sends_all_audience(self, admin):
        r = admin.post(f"{API}/admin/notifications",
                       json={"title": "TEST_all", "body": "hello all", "audience": "all"}, timeout=30)
        assert r.status_code == 200
        TestNotifications.state["all_id"] = r.json()["id"]

    def test_03_partner_sees_both(self, partner):
        ids = [x["id"] for x in partner.get(f"{API}/notifications", timeout=30).json()]
        assert TestNotifications.state["partner_id"] in ids
        assert TestNotifications.state["all_id"] in ids

    def test_04_customer_sees_only_all(self, customer):
        ids = [x["id"] for x in customer.get(f"{API}/notifications", timeout=30).json()]
        assert TestNotifications.state["all_id"] in ids
        assert TestNotifications.state["partner_id"] not in ids, "audience filter leaking"

    def test_05_send_rejects_non_admin(self, partner):
        r = partner.post(f"{API}/admin/notifications", json={"title": "x", "body": "y"}, timeout=30)
        assert r.status_code == 403


# ---------------- CMS CRUD ----------------
CMS = [
    ("banners", {"title": "TEST_banner", "subtitle": "s", "status": "active"}, "banners"),
    ("faqs", {"question": "TEST_q", "answer": "a", "status": "active"}, "faqs"),
    ("blogs", {"title": "TEST_blog", "excerpt": "e", "body": "b", "status": "published"}, "blogs"),
    ("plans", {"name": "TEST_plan", "price": 99, "features": ["f1"], "status": "active"}, "plans"),
]


class TestCMS:
    @pytest.mark.parametrize("path,payload,public", CMS)
    def test_crud_and_public_visibility(self, admin, anon, path, payload, public):
        # CREATE
        c = admin.post(f"{API}/admin/{path}", json=payload, timeout=30)
        assert c.status_code == 200, c.text
        doc = c.json()
        assert "_id" not in doc and doc.get("id")
        did = doc["id"]
        # LIST (admin)
        lst = admin.get(f"{API}/admin/{path}", timeout=30)
        assert lst.status_code == 200
        assert any(x["id"] == did for x in lst.json())
        # PUBLIC
        pub = anon.get(f"{API}/content/{public}", timeout=30)
        assert pub.status_code == 200, pub.text
        assert any(x["id"] == did for x in pub.json()), f"created {path} not visible publicly"
        # UPDATE
        field = "title" if "title" in payload else ("question" if "question" in payload else "name")
        u = admin.put(f"{API}/admin/{path}/{did}", json={field: "TEST_updated"}, timeout=30)
        assert u.status_code == 200, u.text
        assert u.json()[field] == "TEST_updated"
        # GET verify persistence
        again = admin.get(f"{API}/admin/{path}", timeout=30).json()
        assert [x for x in again if x["id"] == did][0][field] == "TEST_updated"
        # DELETE
        d = admin.delete(f"{API}/admin/{path}/{did}", timeout=30)
        assert d.status_code == 200 and d.json().get("deleted") is True
        after = admin.get(f"{API}/admin/{path}", timeout=30).json()
        assert all(x["id"] != did for x in after), "doc still present after delete"

    @pytest.mark.parametrize("path", ["banners", "faqs", "blogs", "plans"])
    def test_cms_admin_only(self, customer, path):
        assert customer.get(f"{API}/admin/{path}", timeout=30).status_code == 403
        assert customer.post(f"{API}/admin/{path}", json={"title": "x", "question": "x",
                                                          "answer": "y", "name": "x", "price": 1},
                             timeout=30).status_code == 403


# ---------------- catalog admin ----------------
class TestCatalogAdmin:
    state = {}

    def test_01_create_category(self, admin):
        r = admin.post(f"{API}/catalog/categories",
                       json={"name": "TEST_Category", "icon": "wrench", "description": "d"}, timeout=30)
        assert r.status_code == 200, r.text
        cat = r.json()
        assert cat["name"] == "TEST_Category" and "_id" not in cat
        TestCatalogAdmin.state["cat"] = cat["id"]

    def test_02_create_service(self, admin, anon):
        r = admin.post(f"{API}/catalog/services", json={
            "category_id": TestCatalogAdmin.state["cat"], "name": "TEST_Service",
            "base_price": 499, "required_skill": "ac", "duration_mins": 60}, timeout=30)
        assert r.status_code == 200, r.text
        svc = r.json()
        TestCatalogAdmin.state["svc"] = svc["id"]
        got = anon.get(f"{API}/catalog/services/{svc['id']}", timeout=30)
        assert got.status_code == 200
        assert got.json()["name"] == "TEST_Service"
        assert got.json()["base_price"] == 499

    def test_03_delete_service(self, admin, anon):
        d = admin.delete(f"{API}/catalog/services/{TestCatalogAdmin.state['svc']}", timeout=30)
        assert d.status_code == 200, d.text
        assert anon.get(f"{API}/catalog/services/{TestCatalogAdmin.state['svc']}",
                        timeout=30).status_code == 404

    def test_04_create_service_rejects_non_admin(self, partner):
        r = partner.post(f"{API}/catalog/services",
                         json={"category_id": "x", "name": "y", "base_price": 1}, timeout=30)
        assert r.status_code == 403


# ---------------- system users ----------------
class TestSystemUsers:
    def test_only_admin_staff(self, admin):
        r = admin.get(f"{API}/admin/system-users", timeout=30)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert rows, "no system users"
        assert all(u["role"] in ("admin", "staff") for u in rows), \
            f"non-staff leaked: {[u['role'] for u in rows]}"
        assert all("_id" not in u for u in rows)

    def test_rejects_merchant(self, merchant):
        assert merchant.get(f"{API}/admin/system-users", timeout=30).status_code == 403


# ---------------- review rating validation ----------------
class TestReviewValidation:
    def _completed_booking(self, customer, partner, service_id):
        b = customer.post(f"{API}/bookings", json={
            "service_id": service_id,
            "address": {"label": "Home", "line": "TEST st", "pincode": "560001", "city": "Bengaluru"},
            "schedule_type": "now"}, timeout=30)
        assert b.status_code == 200, b.text
        bid = b.json()["id"]
        assert partner.post(f"{API}/bookings/{bid}/accept", timeout=30).status_code == 200
        otps = customer.get(f"{API}/bookings/{bid}", timeout=30).json()["otps"]
        assert partner.post(f"{API}/bookings/{bid}/start-otp",
                            json={"otp": otps["start"]}, timeout=30).status_code == 200
        assert partner.post(f"{API}/bookings/{bid}/complete",
                            json={"otp": otps["completion"]}, timeout=30).status_code == 200
        return bid

    def test_rating_bounds_and_once(self, customer, partner, service_id):
        bid = self._completed_booking(customer, partner, service_id)
        assert customer.post(f"{API}/bookings/{bid}/review", json={"rating": 0}, timeout=30).status_code == 422
        assert customer.post(f"{API}/bookings/{bid}/review", json={"rating": 6}, timeout=30).status_code == 422
        ok = customer.post(f"{API}/bookings/{bid}/review", json={"rating": 5, "comment": "TEST"}, timeout=30)
        assert ok.status_code == 200, ok.text
        assert ok.json()["review"]["rating"] == 5
        dup = customer.post(f"{API}/bookings/{bid}/review", json={"rating": 4}, timeout=30)
        assert dup.status_code == 400, dup.text

    def test_partner_avg_rating_not_doubled(self, admin):
        rows = admin.get(f"{API}/admin/users?role=partner", timeout=30).json()
        for p in rows:
            assert 0 <= float(p.get("rating", 5)) <= 5, f"{p['name']} rating {p.get('rating')}"
