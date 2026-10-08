"""Backend-only test for Custom Job → Service visibility fix.

Env is broken (no /app/backend/.env, MONGO_URL missing) so we export MONGO_URL
in-process and drive the service functions directly against a scratch DB.
Verifies:
  1) convert_to_service creates a service that is immediately visible in its
     category for everyone via catalog_controller.list_services / get_service.
  2) publish_converted_drafts() activates legacy inactive custom_job services
     and is idempotent (second call returns 0 due to app_meta flag).
  3) requester_only visibility stays private (not in public list, visible only
     to the requesting customer).
"""
import os
import sys
import asyncio
import uuid

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", f"cj_test_{uuid.uuid4().hex[:8]}")

sys.path.insert(0, "/app/backend")

import pytest


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
async def ctx(event_loop):
    from config.database import db, client, now_iso
    from models.user import new_id

    # seed category + customer
    cat_id = new_id()
    await db.categories.insert_one({
        "id": cat_id, "name": "Electrician", "slug": "electrician",
        "status": "active", "order": 1, "created_at": now_iso(),
    })
    cust_id = new_id()
    await db.users.insert_one({
        "id": cust_id, "role": "customer", "name": "Test Customer",
        "phone": "9999999999", "email": "", "created_at": now_iso(),
    })

    data = {"db": db, "client": client, "cat_id": cat_id, "cust_id": cust_id,
            "now_iso": now_iso, "new_id": new_id, "db_name": os.environ["DB_NAME"]}
    yield data

    # teardown
    await client.drop_database(os.environ["DB_NAME"])
    client.close()


async def _make_job(db, cat_id, cust_id, now_iso, new_id, visibility="all"):
    jid = new_id()
    rid = "CJR-" + uuid.uuid4().hex[:8].upper()
    doc = {
        "id": jid, "request_id": rid, "customer_id": cust_id,
        "customer_name_snapshot": "Test Customer", "customer_mobile_snapshot": "9999999999",
        "category_id": cat_id, "category_name": "Electrician",
        "work_name": f"Fan install {rid}", "description": "install ceiling fan",
        "expected_budget": 500.0, "pincode": "560001",
        "address": "", "city": "", "state": "", "lat": None, "lng": None,
        "service_area_status": "available", "status": "pending",
        "visibility": visibility, "converted_service_id": None,
        "source": "custom_job_request", "idempotency_key": "",
        "audit": [], "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.custom_jobs.insert_one(dict(doc))
    return jid, rid


@pytest.mark.asyncio
async def test_convert_creates_active_visible_service(ctx):
    """convert_to_service: resulting service must be active+approved AND show up
    in catalog list_services for the category (public, no user)."""
    from services import custom_job_service as cjs
    from controllers import catalog_controller as cc

    db = ctx["db"]
    jid, rid = await _make_job(db, ctx["cat_id"], ctx["cust_id"], ctx["now_iso"], ctx["new_id"], "all")

    admin = {"id": "admin-1", "name": "Admin"}
    res = await cjs.convert_to_service(jid, admin)
    assert res["already_converted"] is False
    svc = res["service"]
    assert svc["status"] == "active", f"service status should be active, got {svc.get('status')}"
    assert svc.get("approval_status") == "approved"
    assert svc.get("source") == "custom_job"
    assert svc.get("custom_job_visibility") == "all"
    assert svc["category_id"] == ctx["cat_id"]

    # Public catalog listing by category must include it
    rows = await cc.list_services(category_id=ctx["cat_id"])
    ids = [r["id"] for r in rows]
    assert svc["id"] in ids, f"converted service not visible in category listing: {ids}"

    # Public get_service must return it (no user, public=True)
    got = await cc.get_service(svc["id"], public=True)
    assert got["id"] == svc["id"]

    # Idempotent convert
    res2 = await cjs.convert_to_service(jid, admin)
    assert res2["already_converted"] is True
    assert res2["service_id"] == svc["id"]

    # job updated
    job = await db.custom_jobs.find_one({"id": jid}, {"_id": 0})
    assert job["status"] == "converted_to_service"
    assert job["converted_service_id"] == svc["id"]


@pytest.mark.asyncio
async def test_requester_only_hidden_from_public_visible_to_requester(ctx):
    from services import custom_job_service as cjs
    from controllers import catalog_controller as cc

    db = ctx["db"]
    jid, rid = await _make_job(db, ctx["cat_id"], ctx["cust_id"], ctx["now_iso"], ctx["new_id"], "requester_only")

    admin = {"id": "admin-1", "name": "Admin"}
    res = await cjs.convert_to_service(jid, admin)
    svc = res["service"]
    assert svc["custom_job_visibility"] == "requester_only"
    assert svc["status"] == "active"

    # Public listing (no user) must NOT include it
    rows_public = await cc.list_services(category_id=ctx["cat_id"])
    assert svc["id"] not in [r["id"] for r in rows_public], \
        "requester_only service leaked into public category listing"

    # Other customer must NOT see it
    other = {"id": "other-cust", "role": "customer"}
    rows_other = await cc.list_services(category_id=ctx["cat_id"], user=other)
    assert svc["id"] not in [r["id"] for r in rows_other]

    # Requester MUST see it
    me = {"id": ctx["cust_id"], "role": "customer"}
    rows_me = await cc.list_services(category_id=ctx["cat_id"], user=me)
    assert svc["id"] in [r["id"] for r in rows_me], \
        "requester cannot see their own requester_only custom-job service"

    # Public get_service should 404 for non-owner
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as ei:
        await cc.get_service(svc["id"], public=True)
    assert ei.value.status_code == 404
    # But owner can fetch it
    got = await cc.get_service(svc["id"], public=True, user=me)
    assert got["id"] == svc["id"]


@pytest.mark.asyncio
async def test_publish_converted_drafts_activates_and_is_idempotent(ctx):
    """Legacy inactive custom_job services should be flipped to active once;
    guarded by app_meta so a second run is a no-op."""
    from services import custom_job_service as cjs
    db = ctx["db"]

    # Ensure flag not already set in this test DB
    await db.app_meta.delete_many({"key": "custom_job_autolive_v1"})

    # Seed 2 inactive legacy custom_job services
    legacy_ids = []
    for i in range(2):
        sid = ctx["new_id"]()
        legacy_ids.append(sid)
        await db.services.insert_one({
            "id": sid, "category_id": ctx["cat_id"], "category_name": "Electrician",
            "subcategory_id": "", "name": f"Legacy CJ Service {i}",
            "short_description": "x", "description": "y",
            "base_price": 100.0, "status": "inactive",
            "approval_status": "pending", "source": "custom_job",
            "custom_job_visibility": "all",
            "created_at": ctx["now_iso"](),
        })

    n = await cjs.publish_converted_drafts()
    assert n >= 2, f"expected >=2 drafts published, got {n}"

    # verify activation
    for sid in legacy_ids:
        s = await db.services.find_one({"id": sid}, {"_id": 0})
        assert s["status"] == "active"
        assert s["approval_status"] == "approved"

    # Idempotency: second call returns 0 (flag set)
    n2 = await cjs.publish_converted_drafts()
    assert n2 == 0, f"publish_converted_drafts should be idempotent, got {n2}"

    # Flag doc exists
    meta = await db.app_meta.find_one({"key": "custom_job_autolive_v1"})
    assert meta is not None
