"""
Backend tests for:
  - admin phone normalisation (_admin_phone) + create_system_user validation
  - startup fix_admin_phones() repair
  - admin_rbac_guard server-side enforcement on /api/admin/*

Runs against a scratch uvicorn started on 127.0.0.1:8011 with
MONGO_URL=mongodb://localhost:27017 DB_NAME=rbac_test_tmp JWT_SECRET=test.
"""
import os
import sys
import uuid
import random
import asyncio
import pytest
import requests

BASE_URL = os.environ.get("TEST_BASE_URL", "http://127.0.0.1:8011")
# Random 2-digit suffix so re-runs don't collide on previously-created phones.
_SFX = f"{random.randint(10, 99)}"

# Make backend importable so we can mint tokens with the same JWT_SECRET
sys.path.insert(0, "/app/backend")
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "rbac_test_tmp")
os.environ.setdefault("JWT_SECRET", "test")

from middleware.auth import create_token  # noqa: E402
from pymongo import MongoClient  # noqa: E402

MONGO = MongoClient(os.environ["MONGO_URL"])
DB = MONGO[os.environ["DB_NAME"]]

# Persistent event loop so motor (in config.database) stays bound to it across tests.
_LOOP = asyncio.new_event_loop()


def _run_async(coro):
    return _LOOP.run_until_complete(coro)


def _seed_user(phone, role="admin", name="T", **extra):
    uid = uuid.uuid4().hex
    sid = uuid.uuid4().hex
    doc = {"id": uid, "phone": phone, "role": role, "name": name,
           "current_sid": sid, "status": "active", **extra}
    DB.users.update_one({"id": uid}, {"$set": doc}, upsert=True)
    return uid, create_token(uid, role, sid=sid)


def _seed_role(name, perms):
    rid = uuid.uuid4().hex
    DB.roles.insert_one({"id": rid, "name": name, "permissions": perms})
    return rid


@pytest.fixture(scope="module")
def super_token():
    _, tok = _seed_user("+919000000000", role="admin", name="Super")
    return tok


@pytest.fixture(scope="module")
def restricted_bookings_view():
    rid = _seed_role("BookingsViewer", {"bookings": {"view": True}})
    _, tok = _seed_user("+919111111111", role="admin",
                        name="BV", system_role_id=rid, system_role="BookingsViewer")
    return tok, rid, _


# ========== _admin_phone / create_system_user ==========
class TestAdminPhoneNormalisation:
    def test_server_up(self):
        r = requests.get(f"{BASE_URL}/api/")
        assert r.status_code == 200

    def test_create_requires_role(self, super_token):
        # 10 digit phone, no role
        payload = {"name": "Kundan", "phone": "8000000000"}
        r = requests.post(f"{BASE_URL}/api/admin/system-users",
                          json=payload, headers={"Authorization": f"Bearer {super_token}"})
        assert r.status_code == 400, r.text
        assert "role" in r.json()["detail"].lower()

    def test_create_rejects_invalid_phone(self, super_token):
        rid = _seed_role("TmpRole1", {"bookings": {"view": True}})
        for bad in ["12345", "+5000000000", "1234567890", "0000000000"]:
            r = requests.post(f"{BASE_URL}/api/admin/system-users",
                              json={"name": "X", "phone": bad, "system_role_id": rid},
                              headers={"Authorization": f"Bearer {super_token}"})
            assert r.status_code == 400, f"{bad} -> {r.status_code} {r.text}"
            assert "10-digit" in r.json()["detail"], r.text

    def test_create_rejects_unknown_role(self, super_token):
        r = requests.post(f"{BASE_URL}/api/admin/system-users",
                          json={"name": "X", "phone": "8000000001",
                                "system_role_id": "does-not-exist"},
                          headers={"Authorization": f"Bearer {super_token}"})
        assert r.status_code == 400
        assert "role" in r.json()["detail"].lower()

    @pytest.mark.parametrize("raw_tpl,expected_tpl", [
        ("800000{s}11", "+91800000{s}11"),
        ("+91800000{s}12", "+91800000{s}12"),
        ("91800000{s}13", "+91800000{s}13"),
        ("0800000{s}14", "+91800000{s}14"),
    ])
    def test_create_normalises_phone(self, super_token, raw_tpl, expected_tpl):
        raw = raw_tpl.format(s=_SFX)
        expected = expected_tpl.format(s=_SFX)
        rid = _seed_role(f"R-{raw}", {"bookings": {"view": True}})
        r = requests.post(f"{BASE_URL}/api/admin/system-users",
                          json={"name": f"User-{raw}", "phone": raw,
                                "system_role_id": rid, "system_role": "x"},
                          headers={"Authorization": f"Bearer {super_token}"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["phone"] == expected
        doc = DB.users.find_one({"phone": expected}, {"_id": 0})
        assert doc and doc["role"] == "admin"
        assert doc["system_role_id"] == rid


# ========== fix_admin_phones() startup repair ==========
class TestFixAdminPhones:
    def test_repairs_short_phone(self):
        legacy_id = uuid.uuid4().hex
        p1_before = f"+800000{_SFX}99"
        p1_after = f"+91800000{_SFX}99"
        p2_before = f"800000{_SFX}98"
        p2_after = f"+91800000{_SFX}98"
        DB.users.update_one({"id": legacy_id},
            {"$set": {"id": legacy_id, "phone": p1_before, "role": "admin",
                      "name": "Legacy", "status": "active"}}, upsert=True)
        legacy_id2 = uuid.uuid4().hex
        DB.users.update_one({"id": legacy_id2},
            {"$set": {"id": legacy_id2, "phone": p2_before, "role": "staff",
                      "name": "Legacy2", "status": "active"}}, upsert=True)

        async def _call():
            from routes.content_routes import fix_admin_phones
            return await fix_admin_phones()
        n = _run_async(_call())
        assert n >= 2, f"expected >= 2 repairs, got {n}"
        u = DB.users.find_one({"id": legacy_id})
        u2 = DB.users.find_one({"id": legacy_id2})
        assert u["phone"] == p1_after
        assert u2["phone"] == p2_after

    def test_skip_when_conflict(self):
        existing_id = uuid.uuid4().hex
        p_target = f"+91800000{_SFX}50"
        p_legacy = f"+800000{_SFX}50"
        DB.users.update_one({"id": existing_id},
            {"$set": {"id": existing_id, "phone": p_target, "role": "admin",
                      "name": "Already", "status": "active"}}, upsert=True)
        legacy_id = uuid.uuid4().hex
        DB.users.update_one({"id": legacy_id},
            {"$set": {"id": legacy_id, "phone": p_legacy, "role": "admin",
                      "name": "Legacy conflict", "status": "active"}}, upsert=True)

        async def _call():
            from routes.content_routes import fix_admin_phones
            await fix_admin_phones()
        _run_async(_call())
        u = DB.users.find_one({"id": legacy_id})
        assert u["phone"] == p_legacy


# ========== admin_rbac_guard enforcement ==========
class TestRBACGuard:
    def test_super_admin_bypass_bookings(self, super_token):
        r = requests.get(f"{BASE_URL}/api/admin/bookings",
                         headers={"Authorization": f"Bearer {super_token}"})
        assert r.status_code == 200, r.text

    def test_super_admin_bypass_system_users(self, super_token):
        r = requests.get(f"{BASE_URL}/api/admin/system-users",
                         headers={"Authorization": f"Bearer {super_token}"})
        assert r.status_code == 200, r.text

    def test_public_endpoint_still_works_without_auth(self):
        r = requests.get(f"{BASE_URL}/api/catalog/categories")
        assert r.status_code == 200, r.text

    def test_restricted_can_view_bookings(self, restricted_bookings_view):
        tok, _rid, _uid = restricted_bookings_view
        r = requests.get(f"{BASE_URL}/api/admin/bookings",
                         headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200, r.text

    def test_restricted_cannot_view_finance(self, restricted_bookings_view):
        tok, _, _ = restricted_bookings_view
        r = requests.get(f"{BASE_URL}/api/admin/finance/report",
                         headers={"Authorization": f"Bearer {tok}"})
        # Not 404 — must be 403 from the RBAC guard
        assert r.status_code == 403, r.text
        assert "permission" in r.json()["detail"].lower()

    def test_restricted_cannot_create_system_user(self, restricted_bookings_view):
        tok, _, _ = restricted_bookings_view
        r = requests.post(f"{BASE_URL}/api/admin/system-users",
                          json={"name": "nope", "phone": "8000000077"},
                          headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 403, r.text

    def test_restricted_can_still_get_shared_settings(self, restricted_bookings_view):
        tok, _, _ = restricted_bookings_view
        # settings is a shared/system lookup, GET not in _VIEW_GUARDED
        r = requests.get(f"{BASE_URL}/api/admin/settings",
                         headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200, r.text

    def test_suspended_restricted_admin_blocked(self):
        rid = _seed_role("Suspended", {"bookings": {"view": True}})
        _, tok = _seed_user("+919222222222", role="admin",
                            name="Susp", system_role_id=rid, status="suspended")
        r = requests.get(f"{BASE_URL}/api/admin/bookings",
                         headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 403, r.text
        assert "suspend" in r.json()["detail"].lower()

    def test_unauthenticated_request_untouched(self):
        # No Authorization header → guard returns None, endpoint auth will reject
        r = requests.get(f"{BASE_URL}/api/admin/bookings")
        assert r.status_code == 401, r.text


# ========== effective_permissions behaviour ==========
class TestEffectivePermissions:
    def test_restricted_me_has_only_bookings_view(self, restricted_bookings_view):
        tok, _, _ = restricted_bookings_view
        r = requests.get(f"{BASE_URL}/api/auth/me",
                         headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200, r.text
        me = r.json()
        assert me.get("is_super_admin") is False
        perms = me.get("permissions") or {}
        assert perms.get("bookings", {}).get("view") is True
        assert perms.get("finance", {}).get("view") is False
        assert perms.get("access_control", {}).get("create") is False
