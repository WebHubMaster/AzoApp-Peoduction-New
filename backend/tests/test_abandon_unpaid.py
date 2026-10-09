"""Tests for POST /api/bookings/abandon-unpaid + payment_controller._revive_failed.

Covers:
  • Only caller's pending/unpaid bookings in the group get voided -> cancelled, failed.
  • Paid booking in the same group is untouched.
  • Another customer's booking in the same group is untouched.
  • Empty body (no group_id, no booking_ids) -> 400.
  • booking_ids path matches ids and only those.
  • payment_controller._revive_failed restores a payment_failed booking to pending_payment.
"""
import os
import sys
import asyncio
import uuid
import pytest
import requests

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv  # noqa: E402
load_dotenv("/app/backend/.env")

from middleware.auth import issue_token  # noqa: E402
from config.database import db  # noqa: E402
from controllers import payment_controller  # noqa: E402

BASE_URL = "http://localhost:8001"


def _mk_user(role="customer"):
    uid = "TEST_" + uuid.uuid4().hex[:10]
    return {
        "id": uid, "role": role, "name": f"Test {role}",
        "phone": "9" + uuid.uuid4().hex[:9], "email": f"{uid}@test.local",
        "wallet_balance": 0, "created_at": "2025-01-01T00:00:00Z",
    }


def _mk_booking(customer_id, group_id, status="pending_payment", payment_status="pending"):
    bid = "TEST_B_" + uuid.uuid4().hex[:10]
    return {
        "id": bid, "code": "AZO" + uuid.uuid4().hex[:6].upper(),
        "customer_id": customer_id, "customer_name": "Test",
        "order_group_id": group_id,
        "service_id": "svc1", "service_name": "Test Svc",
        "status": status, "payment_status": payment_status,
        "pricing": {"total": 100.0},
        "timeline": [{"status": status, "at": "2025-01-01T00:00:00Z"}],
        "created_at": "2025-01-01T00:00:00Z",
        "updated_at": "2025-01-01T00:00:00Z",
    }


@pytest.fixture(scope="module")
def loop():
    l = asyncio.new_event_loop()
    yield l
    l.close()


@pytest.fixture(scope="module")
def seeded(loop):
    """Seed: 2 customers; group with 3 bookings for cust1 (one PAID) + 1 booking for cust2 same group."""
    cust1 = _mk_user()
    cust2 = _mk_user()
    group_id = "TEST_G_" + uuid.uuid4().hex[:10]

    b1 = _mk_booking(cust1["id"], group_id)          # pending_payment -> should void
    b2 = _mk_booking(cust1["id"], group_id)          # pending_payment -> should void
    b3 = _mk_booking(cust1["id"], group_id,
                     status="assigned", payment_status="paid")  # paid -> untouched
    b4 = _mk_booking(cust2["id"], group_id)          # other customer's -> untouched

    async def _setup():
        await db.users.insert_many([cust1, cust2])
        await db.bookings.insert_many([b1, b2, b3, b4])
        token1 = await issue_token(cust1["id"], "customer")
        token2 = await issue_token(cust2["id"], "customer")
        return token1, token2

    token1, token2 = loop.run_until_complete(_setup())

    data = {
        "cust1": cust1, "cust2": cust2, "group_id": group_id,
        "b1": b1, "b2": b2, "b3": b3, "b4": b4,
        "token1": token1, "token2": token2,
    }
    yield data

    async def _cleanup():
        await db.users.delete_many({"id": {"$in": [cust1["id"], cust2["id"]]}})
        await db.bookings.delete_many(
            {"id": {"$in": [b1["id"], b2["id"], b3["id"], b4["id"]]}})
    loop.run_until_complete(_cleanup())


def _get(bid):
    async def _f():
        return await db.bookings.find_one({"id": bid}, {"_id": 0})
    return asyncio.get_event_loop().run_until_complete(_f()) if False else \
        asyncio.new_event_loop().run_until_complete(_f())


class TestAbandonUnpaid:
    def test_empty_body_returns_400(self, seeded):
        r = requests.post(f"{BASE_URL}/api/bookings/abandon-unpaid",
                          headers={"Authorization": f"Bearer {seeded['token1']}"}, json={})
        assert r.status_code == 400, r.text

    def test_abandon_by_group_voids_only_callers_unpaid(self, seeded, loop):
        r = requests.post(f"{BASE_URL}/api/bookings/abandon-unpaid",
                          headers={"Authorization": f"Bearer {seeded['token1']}"},
                          json={"group_id": seeded["group_id"],
                                "booking_ids": [seeded["b1"]["id"], seeded["b2"]["id"]]})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        # Only b1 + b2 modified (b3 is paid, b4 belongs to cust2)
        assert body.get("count") == 2, body

        async def _check():
            b1 = await db.bookings.find_one({"id": seeded["b1"]["id"]}, {"_id": 0})
            b2 = await db.bookings.find_one({"id": seeded["b2"]["id"]}, {"_id": 0})
            b3 = await db.bookings.find_one({"id": seeded["b3"]["id"]}, {"_id": 0})
            b4 = await db.bookings.find_one({"id": seeded["b4"]["id"]}, {"_id": 0})
            return b1, b2, b3, b4

        b1, b2, b3, b4 = loop.run_until_complete(_check())
        for b in (b1, b2):
            assert b["status"] == "cancelled"
            assert b["payment_status"] == "failed"
            assert b.get("cancellation", {}).get("by") == "payment_failed"
            assert any(t.get("status") == "payment_failed" for t in (b.get("timeline") or []))
        # paid booking untouched
        assert b3["status"] == "assigned"
        assert b3["payment_status"] == "paid"
        # other customer's booking untouched
        assert b4["status"] == "pending_payment"
        assert b4["payment_status"] == "pending"

    def test_other_customer_cannot_void_this_group(self, seeded, loop):
        """cust2 calling with group_id should ONLY affect cust2's own bookings (b4)."""
        r = requests.post(f"{BASE_URL}/api/bookings/abandon-unpaid",
                          headers={"Authorization": f"Bearer {seeded['token2']}"},
                          json={"group_id": seeded["group_id"]})
        assert r.status_code == 200, r.text
        assert r.json().get("count") == 1

        async def _check():
            return await db.bookings.find_one({"id": seeded["b4"]["id"]}, {"_id": 0})
        b4 = loop.run_until_complete(_check())
        assert b4["status"] == "cancelled"
        assert b4["payment_status"] == "failed"

    def test_revive_failed_restores_payment_failed_booking(self, seeded, loop):
        """payment_controller._revive_failed must restore a voided booking so a late
        gateway success can run mark_paid_and_search."""
        # b1 is currently cancelled/payment_failed from the earlier test.
        async def _run():
            await payment_controller._revive_failed(
                {"customer_id": seeded["cust1"]["id"], "id": seeded["b1"]["id"]})
            return await db.bookings.find_one({"id": seeded["b1"]["id"]}, {"_id": 0})
        b1 = loop.run_until_complete(_run())
        assert b1["status"] == "pending_payment"
        assert b1["payment_status"] == "pending"
        assert "cancellation" not in b1

    def test_revive_group_scoped(self, seeded, loop):
        """Group-scoped revive restores all voided bookings in that group for the caller."""
        # b2 still cancelled from the first test.
        async def _run():
            await payment_controller._revive_failed(
                {"customer_id": seeded["cust1"]["id"], "order_group_id": seeded["group_id"]})
            return await db.bookings.find_one({"id": seeded["b2"]["id"]}, {"_id": 0})
        b2 = loop.run_until_complete(_run())
        assert b2["status"] == "pending_payment"
        assert b2["payment_status"] == "pending"

    def test_unauthenticated_rejected(self):
        r = requests.post(f"{BASE_URL}/api/bookings/abandon-unpaid", json={"group_id": "x"})
        assert r.status_code == 401

    def test_non_customer_role_forbidden(self, loop):
        """A partner's token must not be accepted for a customer-only endpoint."""
        partner = _mk_user(role="partner")

        async def _setup():
            await db.users.insert_one(partner)
            return await issue_token(partner["id"], "partner")

        token = loop.run_until_complete(_setup())
        try:
            r = requests.post(f"{BASE_URL}/api/bookings/abandon-unpaid",
                              headers={"Authorization": f"Bearer {token}"},
                              json={"group_id": "x"})
            assert r.status_code == 403
        finally:
            loop.run_until_complete(db.users.delete_one({"id": partner["id"]}))
