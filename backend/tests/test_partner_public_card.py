"""Direct controller test for partner_public_card (GET /api/bookings/{id}/partner-card).

Backend is not running (no MONGO_URL/.env), so this test imports the controller
directly, seeds a disposable Mongo DB, calls the async function, asserts the
public payload (no PII), and drops the DB afterwards.
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone

import pytest

# Point the controller at a disposable DB BEFORE importing it.
_TEMP_DB = f"test_partner_card_{uuid.uuid4().hex[:8]}"
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ["DB_NAME"] = _TEMP_DB

import sys
sys.path.insert(0, "/app/backend")

from fastapi import HTTPException  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from controllers import booking_controller as bc  # noqa: E402


CUSTOMER_ID = "cust-TEST-1"
PARTNER_ID = "part-TEST-1"
OTHER_CUST_ID = "cust-TEST-2"
BOOKING_ID = "bk-TEST-1"


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module", autouse=True)
def seed_and_cleanup(event_loop):
    async def _seed():
        db = bc.db
        # Partner user
        await db.users.insert_one({
            "id": PARTNER_ID, "role": "partner", "name": "Ramesh Kumar Verma",
            "phone": "+919999999999", "email": "ramesh@example.com",
            "address": "Secret Addr 42", "bank": {"acc": "SECRET"},
            "photo": "https://example.com/ramesh.jpg",
            "rating": 4.4, "jobs_completed": 2, "reviews_count": 2,
            "skills": ["Plumbing", "Electrical"], "city": "Pune",
            "created_at": "2024-05-01T10:00:00+00:00",
            "verified": True, "kyc_status": "approved", "premium_partner": True,
            "wallet_balance": 500.0,
        })
        # Customers
        await db.users.insert_one({"id": CUSTOMER_ID, "role": "customer", "name": "Test Customer"})
        await db.users.insert_one({"id": OTHER_CUST_ID, "role": "customer", "name": "Other Customer"})
        # Partner profile with selfie + experience + languages
        await db.partner_profiles.insert_one({
            "user_id": PARTNER_ID,
            "experience_years": 7, "languages": ["Hindi", "English"],
            "documents": {
                "selfie": {"url": "https://example.com/selfie.jpg"},
                "aadhaar": {"url": "https://secret/aadhaar.jpg"},  # must NOT appear in response
            },
            "bank": {"ifsc": "SECRET"},  # confidential
        })
        # The booking (customer owns it, assigned to partner)
        await db.bookings.insert_one({
            "id": BOOKING_ID, "customer_id": CUSTOMER_ID, "partner_id": PARTNER_ID,
            "status": "assigned", "created_at": datetime.now(timezone.utc).isoformat(),
            "service_name": "AC Repair",
        })
        # 2 completed bookings for this partner, with reviews → feed rating_distribution/reviews
        await db.bookings.insert_many([
            {"id": "bk-done-1", "partner_id": PARTNER_ID, "customer_id": "cx1",
             "status": "completed",
             "review": {"rating": 5, "comment": "Great work",
                        "at": "2024-10-01T10:00:00+00:00",
                        "customer_name": "Rahul Kumar Singh",
                        "service_name": "AC Repair"}},
            {"id": "bk-done-2", "partner_id": PARTNER_ID, "customer_id": "cx2",
             "status": "paid",
             "review": {"rating": 4, "comment": "Good",
                        "at": "2024-10-10T10:00:00+00:00",
                        "customer_name": "Priya",
                        "service_name": "Fan"}},
            # A booking without review — should still be counted in jobs_completed
            {"id": "bk-done-3", "partner_id": PARTNER_ID, "customer_id": "cx3",
             "status": "completed"},
        ])

    async def _drop():
        try:
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            await client.drop_database(_TEMP_DB)
            client.close()
        except Exception as e:
            print(f"cleanup warn: {e}")

    event_loop.run_until_complete(_seed())
    yield
    event_loop.run_until_complete(_drop())


# ---------- payload shape & privacy ----------

def test_customer_can_fetch_partner_card(event_loop):
    user = {"id": CUSTOMER_ID, "role": "customer"}
    out = event_loop.run_until_complete(bc.partner_public_card(user, BOOKING_ID))

    # core public fields
    assert out["id"] == PARTNER_ID
    assert out["name"] == "Ramesh Kumar Verma"
    assert out["photo"] == "https://example.com/ramesh.jpg"
    assert out["rating"] == 4.5  # avg of (5,4)
    # 3 completed/paid bookings total (bk-done-1,2,3) — bk-TEST-1 is 'assigned' so excluded
    assert out["jobs_completed"] == 3
    assert out["reviews_count"] == 2
    assert out["experience"] == 7
    assert out["languages"] == ["Hindi", "English"]
    assert out["skills"] == ["Plumbing", "Electrical"]
    assert out["city"] == "Pune"
    assert out["verified"] is True
    assert out["premium"] is True
    assert out["member_since"] == "2024-05"
    assert out["rating_distribution"] == {"1": 0, "2": 0, "3": 0, "4": 1, "5": 1}

    # reviews list — reviewer names masked
    names = [r["customer_name"] for r in out["reviews"]]
    assert "Rahul S." in names         # 'Rahul Kumar Singh' → first + last initial
    assert "Priya" in names            # single-word → unchanged (first only)
    for r in out["reviews"]:
        assert "rating" in r and "comment" in r and "at" in r


def test_payload_contains_no_confidential_fields(event_loop):
    user = {"id": CUSTOMER_ID, "role": "customer"}
    out = event_loop.run_until_complete(bc.partner_public_card(user, BOOKING_ID))

    import json
    blob = json.dumps(out).lower()
    # phone number & email & secret address must be absent
    assert "9999999999" not in blob
    assert "ramesh@example.com" not in blob
    assert "secret addr" not in blob
    # no bank, documents other than selfie url, no earnings/wallet
    for forbidden in ("phone", "email", "bank", "aadhaar", "wallet_balance", "earnings"):
        assert forbidden not in out, f"confidential key leaked: {forbidden}"
    # selfie URL is NOT exposed when a photo is already set
    assert "selfie" not in blob


# ---------- authorization ----------

def test_other_customer_is_forbidden(event_loop):
    user = {"id": OTHER_CUST_ID, "role": "customer"}
    with pytest.raises(HTTPException) as exc:
        event_loop.run_until_complete(bc.partner_public_card(user, BOOKING_ID))
    assert exc.value.status_code == 403


def test_assigned_partner_can_fetch(event_loop):
    user = {"id": PARTNER_ID, "role": "partner"}
    out = event_loop.run_until_complete(bc.partner_public_card(user, BOOKING_ID))
    assert out["id"] == PARTNER_ID


def test_admin_can_fetch(event_loop):
    user = {"id": "admin-x", "role": "admin"}
    out = event_loop.run_until_complete(bc.partner_public_card(user, BOOKING_ID))
    assert out["id"] == PARTNER_ID


def test_unknown_booking_returns_404(event_loop):
    user = {"id": CUSTOMER_ID, "role": "customer"}
    with pytest.raises(HTTPException) as exc:
        event_loop.run_until_complete(bc.partner_public_card(user, "bk-does-not-exist"))
    assert exc.value.status_code == 404


def test_booking_without_partner_returns_404(event_loop):
    async def _mk():
        await bc.db.bookings.insert_one({
            "id": "bk-no-partner", "customer_id": CUSTOMER_ID,
            "status": "pending", "created_at": datetime.now(timezone.utc).isoformat()})
    event_loop.run_until_complete(_mk())
    user = {"id": CUSTOMER_ID, "role": "customer"}
    with pytest.raises(HTTPException) as exc:
        event_loop.run_until_complete(bc.partner_public_card(user, "bk-no-partner"))
    assert exc.value.status_code == 404


# ---------- helpers ----------

def test_mask_reviewer_variants():
    f = bc._mask_reviewer
    assert f("Rahul Kumar Singh") == "Rahul S."
    assert f("Priya") == "Priya"
    assert f("") == "Customer"
    assert f(None) == "Customer"


# ---------- customer bookings list carries partner_id ----------

def test_list_bookings_includes_partner_id_for_customer(event_loop):
    user = {"id": CUSTOMER_ID, "role": "customer"}
    rows = event_loop.run_until_complete(bc.list_bookings(user))
    assert any(b.get("id") == BOOKING_ID and b.get("partner_id") == PARTNER_ID for b in rows), \
        "customer booking list must carry partner_id for the UI chip to render"
