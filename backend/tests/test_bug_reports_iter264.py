"""Backend tests for Report-a-Bug feature (iter 264).

Covers:
- create (customer/partner), validation (empty title/desc)
- GET /bugs/my (owner-only, newest first, app_label)
- DELETE blocked while open, succeeds after solved, 403 cross-user, 404 missing
- Admin list filters/pagination/counts
- Admin resolve: note (and default note), reporter sees status=solved + note, notification created
- Admin reopen flips back to open
- Auth guards (401 no token, 403 wrong role)
"""
import os
import time
import pytest
import requests

# Force serial execution — the project uses single-device session auth; parallel
# xdist workers each re-login and invalidate prior tokens. Pin to one worker.
pytestmark = pytest.mark.xdist_group("bug_reports_serial")

BASE_URL = "http://localhost:8001"
API = f"{BASE_URL}/api"

ADMIN_PHONE = "+919000000000"
PARTNER_PHONE = "+919000000003"
CUSTOMER_PHONE = "+919000000004"


def _login(phone: str) -> str:
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=10)
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": "123456"}, timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, data
    return tok


def _hdr(tok): return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def tokens():
    return {
        "admin": _login(ADMIN_PHONE),
        "partner": _login(PARTNER_PHONE),
        "customer": _login(CUSTOMER_PHONE),
    }


@pytest.fixture(scope="module")
def created_ids():
    ids = []
    yield ids
    # cleanup: admin tries to delete anything we created
    try:
        from pymongo import MongoClient
        mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        db = mc[os.environ.get("DB_NAME", "test_database")]
        if ids:
            db.bug_reports.delete_many({"id": {"$in": ids}})
    except Exception as e:  # noqa: BLE001
        print("cleanup failed", e)


# --------- auth guards ---------
class TestAuthGuards:
    def test_create_requires_auth(self):
        r = requests.post(f"{API}/bugs", json={"title": "t", "description": "d"})
        assert r.status_code in (401, 403), r.text

    def test_my_requires_auth(self):
        r = requests.get(f"{API}/bugs/my")
        assert r.status_code in (401, 403)

    def test_admin_list_requires_admin(self, tokens):
        r = requests.get(f"{API}/admin/bugs", headers=_hdr(tokens["customer"]))
        assert r.status_code in (401, 403), r.text

    def test_admin_resolve_requires_admin(self, tokens):
        r = requests.post(f"{API}/admin/bugs/nope/resolve", json={"note": "x"},
                          headers=_hdr(tokens["partner"]))
        assert r.status_code in (401, 403)


# --------- create + validation ---------
class TestCreate:
    def test_customer_create(self, tokens, created_ids):
        r = requests.post(f"{API}/bugs",
                          json={"title": "TEST_c Bug 1", "description": "desc c1"},
                          headers=_hdr(tokens["customer"]))
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["status"] == "open"
        assert b["title"] == "TEST_c Bug 1"
        assert b["reporter_role"] == "customer"
        assert b["app_label"] == "Customer App"
        assert "id" in b
        assert "_id" not in b
        created_ids.append(b["id"])

    def test_partner_create_with_screenshot(self, tokens, created_ids):
        r = requests.post(f"{API}/bugs",
                          json={"title": "TEST_p Bug 1", "description": "desc p1",
                                "screenshot_url": "https://example.com/s.png"},
                          headers=_hdr(tokens["partner"]))
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["reporter_role"] == "partner"
        assert b["app_label"] == "Partner App"
        assert b["screenshot_url"] == "https://example.com/s.png"
        created_ids.append(b["id"])

    def test_empty_title_rejected(self, tokens):
        r = requests.post(f"{API}/bugs", json={"title": "   ", "description": "x"},
                          headers=_hdr(tokens["customer"]))
        assert r.status_code == 400, r.text

    def test_empty_description_rejected(self, tokens):
        r = requests.post(f"{API}/bugs", json={"title": "t", "description": "  "},
                          headers=_hdr(tokens["customer"]))
        assert r.status_code == 400, r.text

    def test_missing_fields_rejected(self, tokens):
        r = requests.post(f"{API}/bugs", json={"title": "t"},
                          headers=_hdr(tokens["customer"]))
        # pydantic validation error
        assert r.status_code in (400, 422)


# --------- my_bugs ---------
class TestMyBugs:
    def test_my_bugs_owner_only_and_sorted(self, tokens, created_ids):
        # Create a 2nd customer bug to confirm sort order
        r = requests.post(f"{API}/bugs", json={"title": "TEST_c Bug 2", "description": "d2"},
                          headers=_hdr(tokens["customer"]))
        assert r.status_code == 200
        created_ids.append(r.json()["id"])

        r = requests.get(f"{API}/bugs/my", headers=_hdr(tokens["customer"]))
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        # Only customer's items
        for row in rows:
            assert row["reporter_role"] == "customer"
            assert "app_label" in row
        # sorted newest first
        created_ats = [r["created_at"] for r in rows]
        assert created_ats == sorted(created_ats, reverse=True)

        # Partner shouldn't see customer's items
        r2 = requests.get(f"{API}/bugs/my", headers=_hdr(tokens["partner"]))
        assert r2.status_code == 200
        for row in r2.json():
            assert row["reporter_role"] == "partner"


# --------- delete rules ---------
class TestDelete:
    def test_delete_blocked_while_open(self, tokens, created_ids):
        r = requests.post(f"{API}/bugs", json={"title": "TEST_del open", "description": "x"},
                          headers=_hdr(tokens["customer"]))
        bid = r.json()["id"]
        created_ids.append(bid)
        r = requests.delete(f"{API}/bugs/{bid}", headers=_hdr(tokens["customer"]))
        assert r.status_code == 400, r.text

    def test_delete_cross_user_403(self, tokens, created_ids):
        r = requests.post(f"{API}/bugs", json={"title": "TEST_del xuser", "description": "x"},
                          headers=_hdr(tokens["customer"]))
        bid = r.json()["id"]
        created_ids.append(bid)
        r = requests.delete(f"{API}/bugs/{bid}", headers=_hdr(tokens["partner"]))
        assert r.status_code == 403, r.text

    def test_delete_not_found_404(self, tokens):
        r = requests.delete(f"{API}/bugs/nonexistent-xyz", headers=_hdr(tokens["customer"]))
        assert r.status_code == 404

    def test_delete_succeeds_after_solved(self, tokens, created_ids):
        # Create → admin resolves → owner deletes
        r = requests.post(f"{API}/bugs", json={"title": "TEST_del solved", "description": "x"},
                          headers=_hdr(tokens["customer"]))
        bid = r.json()["id"]
        created_ids.append(bid)
        r2 = requests.post(f"{API}/admin/bugs/{bid}/resolve", json={"note": "fixed"},
                           headers=_hdr(tokens["admin"]))
        assert r2.status_code == 200, r2.text
        r3 = requests.delete(f"{API}/bugs/{bid}", headers=_hdr(tokens["customer"]))
        assert r3.status_code == 200, r3.text
        assert r3.json().get("ok") is True


# --------- admin ---------
class TestAdmin:
    def test_admin_list_counts_and_filters(self, tokens, created_ids):
        # ensure at least one open customer bug exists
        r = requests.post(f"{API}/bugs", json={"title": "TEST_adm filter", "description": "x"},
                          headers=_hdr(tokens["customer"]))
        created_ids.append(r.json()["id"])

        r = requests.get(f"{API}/admin/bugs", headers=_hdr(tokens["admin"]))
        assert r.status_code == 200
        body = r.json()
        assert "data" in body and "counts" in body and "total" in body
        assert set(body["counts"].keys()) >= {"all", "open", "solved"}
        assert body["counts"]["all"] >= body["counts"]["open"]
        assert body["page"] == 1

        # filter by status=open
        r2 = requests.get(f"{API}/admin/bugs?status=open",
                          headers=_hdr(tokens["admin"]))
        assert r2.status_code == 200
        for row in r2.json()["data"]:
            assert row["status"] == "open"

        # filter by role=customer
        r3 = requests.get(f"{API}/admin/bugs?role=customer",
                          headers=_hdr(tokens["admin"]))
        for row in r3.json()["data"]:
            assert row["reporter_role"] == "customer"

        # search q
        r4 = requests.get(f"{API}/admin/bugs?q=TEST_adm",
                          headers=_hdr(tokens["admin"]))
        assert r4.status_code == 200
        titles = [row["title"] for row in r4.json()["data"]]
        assert any("TEST_adm" in t for t in titles)

    def test_admin_list_pagination(self, tokens):
        r = requests.get(f"{API}/admin/bugs?page=1&page_size=2",
                         headers=_hdr(tokens["admin"]))
        assert r.status_code == 200
        body = r.json()
        assert body["page_size"] == 2
        assert len(body["data"]) <= 2

    def test_admin_resolve_with_note_and_reporter_visibility(self, tokens, created_ids):
        # customer creates
        r = requests.post(f"{API}/bugs", json={"title": "TEST_resolve note", "description": "x"},
                          headers=_hdr(tokens["customer"]))
        bid = r.json()["id"]
        created_ids.append(bid)

        # get customer id for notifications check
        me = requests.get(f"{API}/users/me", headers=_hdr(tokens["customer"]))
        reporter_id = me.json().get("id") if me.status_code == 200 else None

        note = "We shipped a fix in v1.2.3"
        r2 = requests.post(f"{API}/admin/bugs/{bid}/resolve", json={"note": note},
                           headers=_hdr(tokens["admin"]))
        assert r2.status_code == 200, r2.text
        resolved = r2.json()
        assert resolved["status"] == "solved"
        assert resolved["resolution_note"] == note
        assert resolved["resolved_at"]
        assert resolved["resolved_by"]

        # reporter sees it
        mine = requests.get(f"{API}/bugs/my", headers=_hdr(tokens["customer"])).json()
        match = [b for b in mine if b["id"] == bid]
        assert match and match[0]["status"] == "solved"
        assert match[0]["resolution_note"] == note

        # notification created in db.notifications
        if reporter_id:
            try:
                from pymongo import MongoClient
                mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
                db = mc[os.environ.get("DB_NAME", "test_database")]
                time.sleep(0.3)
                notif = db.notifications.find_one(
                    {"user_id": reporter_id, "data.bug_id": bid}
                )
                assert notif is not None, "no notification created for reporter"
            except AssertionError:
                raise
            except Exception as e:  # noqa: BLE001
                print("notif check skipped:", e)

    def test_admin_resolve_empty_note_defaults(self, tokens, created_ids):
        r = requests.post(f"{API}/bugs", json={"title": "TEST_default note", "description": "x"},
                          headers=_hdr(tokens["customer"]))
        bid = r.json()["id"]
        created_ids.append(bid)
        r2 = requests.post(f"{API}/admin/bugs/{bid}/resolve", json={"note": ""},
                           headers=_hdr(tokens["admin"]))
        assert r2.status_code == 200
        assert r2.json()["resolution_note"], "default note should be set when empty"

    def test_admin_resolve_404(self, tokens):
        r = requests.post(f"{API}/admin/bugs/missing-id/resolve", json={"note": ""},
                          headers=_hdr(tokens["admin"]))
        assert r.status_code == 404

    def test_admin_reopen(self, tokens, created_ids):
        r = requests.post(f"{API}/bugs", json={"title": "TEST_reopen", "description": "x"},
                          headers=_hdr(tokens["customer"]))
        bid = r.json()["id"]
        created_ids.append(bid)
        requests.post(f"{API}/admin/bugs/{bid}/resolve", json={"note": "f"},
                      headers=_hdr(tokens["admin"]))
        r2 = requests.post(f"{API}/admin/bugs/{bid}/reopen",
                           headers=_hdr(tokens["admin"]))
        assert r2.status_code == 200
        assert r2.json()["status"] == "open"
        # delete should now be blocked again
        r3 = requests.delete(f"{API}/bugs/{bid}", headers=_hdr(tokens["customer"]))
        assert r3.status_code == 400

    def test_admin_reopen_404(self, tokens):
        r = requests.post(f"{API}/admin/bugs/missing-xyz/reopen",
                          headers=_hdr(tokens["admin"]))
        assert r.status_code == 404
