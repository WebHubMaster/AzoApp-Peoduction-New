"""Standalone async runner (no pytest) for Custom Job -> Service visibility fix.
See docstring in tests/test_custom_job_visibility.py for context."""
import os
import sys
import asyncio
import uuid

os.environ["MONGO_URL"] = "mongodb://localhost:27017"
os.environ["DB_NAME"] = f"cj_test_{uuid.uuid4().hex[:8]}"
os.environ.setdefault("REACT_APP_BACKEND_URL", "http://localhost:8001")

sys.path.insert(0, "/app/backend")


RESULTS = []


def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    RESULTS.append((status, name, detail))
    print(f"[{status}] {name} {('- ' + detail) if detail and not cond else ''}")
    if not cond:
        print(f"       DETAIL: {detail}")


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
    return jid


async def main():
    from config.database import db, client, now_iso
    from models.user import new_id
    from services import custom_job_service as cjs
    from controllers import catalog_controller as cc
    from fastapi import HTTPException

    try:
        # seed cat + customer
        cat_id = new_id()
        await db.categories.insert_one({
            "id": cat_id, "name": "Electrician", "slug": "electrician",
            "status": "active", "order": 1, "created_at": now_iso()})
        cust_id = new_id()
        await db.users.insert_one({
            "id": cust_id, "role": "customer", "name": "Test Customer",
            "phone": "9999999999", "created_at": now_iso()})

        # ---------- Test 1: convert -> active + visible publicly ----------
        jid = await _make_job(db, cat_id, cust_id, now_iso, new_id, "all")
        admin = {"id": "admin-1", "name": "Admin"}
        res = await cjs.convert_to_service(jid, admin)
        svc = res["service"]
        check("convert returns already_converted=False first time", res["already_converted"] is False)
        check("service status=active", svc.get("status") == "active", f"got {svc.get('status')}")
        check("service approval=approved", svc.get("approval_status") == "approved", f"got {svc.get('approval_status')}")
        check("service source=custom_job", svc.get("source") == "custom_job")
        check("custom_job_visibility=all (default)", svc.get("custom_job_visibility") == "all")

        # Bust cache first since _list_all_services is cached 45s and may have been primed earlier
        from services import cache_service as _cache
        await _cache.bust("catalog:services:all")

        rows = await cc.list_services(category_id=cat_id)
        ids = [r["id"] for r in rows]
        check("converted service visible in public category listing", svc["id"] in ids,
              f"ids={ids}")

        got = await cc.get_service(svc["id"], public=True)
        check("public get_service returns the converted service", got["id"] == svc["id"])

        # idempotency
        res2 = await cjs.convert_to_service(jid, admin)
        check("convert idempotent (already_converted=True on 2nd call)", res2["already_converted"] is True)
        check("same service_id on repeated convert", res2["service_id"] == svc["id"])

        job_doc = await db.custom_jobs.find_one({"id": jid}, {"_id": 0})
        check("job.status becomes converted_to_service", job_doc["status"] == "converted_to_service")
        check("job.converted_service_id set", job_doc["converted_service_id"] == svc["id"])

        # ---------- Test 2: requester_only visibility ----------
        jid2 = await _make_job(db, cat_id, cust_id, now_iso, new_id, "requester_only")
        res = await cjs.convert_to_service(jid2, admin)
        svc2 = res["service"]
        check("requester_only visibility propagated to service",
              svc2.get("custom_job_visibility") == "requester_only")
        check("requester_only service is active", svc2.get("status") == "active")

        await _cache.bust("catalog:services:all")
        rows_pub = await cc.list_services(category_id=cat_id)
        check("requester_only NOT in public category listing",
              svc2["id"] not in [r["id"] for r in rows_pub])

        other = {"id": "other-cust", "role": "customer"}
        rows_other = await cc.list_services(category_id=cat_id, user=other)
        check("requester_only hidden from OTHER customer",
              svc2["id"] not in [r["id"] for r in rows_other])

        me = {"id": cust_id, "role": "customer"}
        rows_me = await cc.list_services(category_id=cat_id, user=me)
        check("requester_only VISIBLE to requesting customer",
              svc2["id"] in [r["id"] for r in rows_me],
              f"ids={[r['id'] for r in rows_me]}")

        # public get for non-owner -> 404
        try:
            await cc.get_service(svc2["id"], public=True)
            check("public get_service for requester_only -> 404 (non-owner)", False, "no exception raised")
        except HTTPException as e:
            check("public get_service for requester_only -> 404 (non-owner)", e.status_code == 404,
                  f"got {e.status_code}")

        got_owner = await cc.get_service(svc2["id"], public=True, user=me)
        check("owner can get requester_only service", got_owner["id"] == svc2["id"])

        # ---------- Test 3: publish_converted_drafts legacy migration ----------
        await db.app_meta.delete_many({"key": "custom_job_autolive_v1"})
        legacy_ids = []
        for i in range(2):
            sid = new_id()
            legacy_ids.append(sid)
            await db.services.insert_one({
                "id": sid, "category_id": cat_id, "category_name": "Electrician",
                "subcategory_id": "", "name": f"Legacy CJ {i}",
                "short_description": "x", "description": "y",
                "base_price": 100.0, "status": "inactive",
                "approval_status": "pending", "source": "custom_job",
                "custom_job_visibility": "all",
                "created_at": now_iso()})

        n = await cjs.publish_converted_drafts()
        check("publish_converted_drafts activates >=2 legacy drafts", n >= 2, f"n={n}")

        for sid in legacy_ids:
            s = await db.services.find_one({"id": sid}, {"_id": 0})
            check(f"legacy {sid[:6]} activated", s["status"] == "active" and s["approval_status"] == "approved",
                  f"status={s['status']} approval={s['approval_status']}")

        n2 = await cjs.publish_converted_drafts()
        check("publish_converted_drafts idempotent (2nd call returns 0)", n2 == 0, f"n2={n2}")

        meta = await db.app_meta.find_one({"key": "custom_job_autolive_v1"})
        check("app_meta flag persisted", meta is not None)

        # legacy ones should now also show in public listing
        await _cache.bust("catalog:services:all")
        rows_leg = await cc.list_services(category_id=cat_id)
        rows_ids = {r["id"] for r in rows_leg}
        for sid in legacy_ids:
            check(f"legacy {sid[:6]} now visible publicly", sid in rows_ids)

    finally:
        try:
            await client.drop_database(os.environ["DB_NAME"])
        except Exception:
            pass
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
    passed = sum(1 for r in RESULTS if r[0] == "PASS")
    failed = sum(1 for r in RESULTS if r[0] == "FAIL")
    print("\n==============================")
    print(f"TOTAL: {len(RESULTS)}  PASS: {passed}  FAIL: {failed}")
    print("==============================")
    sys.exit(0 if failed == 0 else 1)
