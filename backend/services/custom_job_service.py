"""Custom Job Request — customer requirement collection + admin review/convert.

This is ONLY a requirement-collection & review system. It reuses:
  - OTP auth (verify happens before submit; caller is authenticated)
  - GET /api/catalog/categories (active categories) for the category picker
  - geo_service.check_serviceable for pincode / service-area validation
  - catalog_controller.create_service for "Switch to New Service" (NO duplicate
    service-creation system is built)

The customer's budget is preserved as "expected budget" and is NEVER treated as
the final service price — the admin configures the real price in the existing
Service Create/Edit system.
"""
import re
import string
import random
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException

from config.database import db, now_iso
from models.custom_job import new_id, MIN_BUDGET, MAX_BUDGET

_CODE_ALPHABET = string.ascii_uppercase + string.digits

# Statuses that can be reached via the admin status endpoint (convert/activate are
# handled by their own dedicated flows).
_ADMIN_SETTABLE = {"pending", "under_review", "rejected", "closed"}

_NAME_RE = re.compile(r"^[A-Za-z][A-Za-z\s.'\-]{1,59}$")
_PIN_RE = re.compile(r"^\d{6}$")


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
async def _unique_request_id() -> str:
    for attempt in range(1, 1001):
        rid = "CJR-" + "".join(random.choices(_CODE_ALPHABET, k=8))
        if not await db.custom_jobs.find_one({"request_id": rid}, {"_id": 1}):
            return rid
        if attempt % 25 == 0:
            pass
    return "CJR-" + "".join(random.choices(_CODE_ALPHABET, k=10))


def _audit(action: str, *, by: str = "", by_name: str = "", note: str = "") -> dict:
    return {"action": action, "by": by, "by_name": by_name, "note": note, "at": now_iso()}


async def _serviceable(pincode: str, address: dict = None) -> dict:
    from services import geo_service
    try:
        return await geo_service.check_serviceable(pincode=pincode, address=address)
    except Exception:  # noqa: BLE001 — never let geo errors 500 the submit
        return {"serviceable": False, "reason": "check_failed"}


async def _service_view(converted_service_id: str) -> dict:
    """Light snapshot of the linked service (id/name/status) for status display."""
    if not converted_service_id:
        return {}
    svc = await db.services.find_one(
        {"id": converted_service_id},
        {"_id": 0, "id": 1, "name": 1, "status": 1, "slug": 1})
    return svc or {}


def _display_status(job: dict, svc: dict) -> str:
    """Derive a customer-friendly status. Once the linked service is active the
    request is effectively 'live' regardless of the stored status."""
    if job.get("converted_service_id") and (svc or {}).get("status") == "active":
        return "service_active"
    return job.get("status", "pending")


async def _decorate(job: dict) -> dict:
    job.pop("_id", None)
    svc = await _service_view(job.get("converted_service_id"))
    job["service"] = svc
    job["display_status"] = _display_status(job, svc)
    return job


# --------------------------------------------------------------------------- #
# validation
# --------------------------------------------------------------------------- #
async def _validate_and_normalise(data: dict) -> dict:
    full_name = (data.get("full_name") or "").strip()
    if not _NAME_RE.match(full_name):
        raise HTTPException(status_code=400,
                            detail="Please enter a valid full name (2–60 letters).")

    work_name = (data.get("work_name") or "").strip()
    if not (3 <= len(work_name) <= 100):
        raise HTTPException(status_code=400,
                            detail="Work name must be 3–100 characters.")

    description = (data.get("description") or "").strip()
    if not (10 <= len(description) <= 1000):
        raise HTTPException(status_code=400,
                            detail="Please describe the work in 10–1000 characters.")

    try:
        budget = round(float(data.get("expected_budget")), 2)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Please enter a valid budget amount.")
    if budget < MIN_BUDGET:
        raise HTTPException(status_code=400,
                            detail=f"Minimum expected budget is ₹{MIN_BUDGET}.")
    if budget > MAX_BUDGET:
        raise HTTPException(status_code=400,
                            detail=f"Budget looks too high. Maximum is ₹{MAX_BUDGET:,}.")

    pincode = (data.get("pincode") or "").strip()
    if not _PIN_RE.match(pincode):
        raise HTTPException(status_code=400, detail="Please enter a valid 6-digit pincode.")

    category_id = (data.get("category_id") or "").strip()
    cat = await db.categories.find_one({"id": category_id}, {"_id": 0})
    if not cat or cat.get("status") != "active":
        raise HTTPException(status_code=400, detail="Please select a valid service category.")

    # server-side service-area validation (frontend disable is NOT enough)
    cov = await _serviceable(pincode, {"pincode": pincode, "city": data.get("city", ""),
                                       "state": data.get("state", "")})
    if not cov.get("serviceable"):
        raise HTTPException(
            status_code=400,
            detail="Sorry, AzoApp currently does not provide services in this area.")

    return {
        "full_name": full_name,
        "work_name": work_name,
        "description": description,
        "expected_budget": budget,
        "pincode": pincode,
        "category_id": category_id,
        "category_name": cat.get("name", ""),
    }


# --------------------------------------------------------------------------- #
# customer: submit + my list
# --------------------------------------------------------------------------- #
async def submit(user: dict, data: dict) -> dict:
    clean = await _validate_and_normalise(data)

    customer_id = user["id"]
    mobile = (data.get("mobile") or "").strip() or user.get("phone", "")
    idem = (data.get("idempotency_key") or "").strip()

    # Duplicate-submit protection ----------------------------------------------
    # 1) exact idempotency key (same wizard session / network retry / double-tap)
    if idem:
        dupe = await db.custom_jobs.find_one(
            {"customer_id": customer_id, "idempotency_key": idem}, {"_id": 0})
        if dupe:
            return await _decorate(dupe)
    # 2) same customer + same work + pincode within 60s (refresh / re-submit)
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
    recent = await db.custom_jobs.find_one({
        "customer_id": customer_id,
        "work_name": clean["work_name"],
        "pincode": clean["pincode"],
        "created_at": {"$gte": cutoff},
    }, {"_id": 0})
    if recent:
        return await _decorate(recent)

    rid = await _unique_request_id()
    now = now_iso()
    doc = {
        "id": new_id(),
        "request_id": rid,
        "customer_id": customer_id,
        # snapshots so historical data never changes if the profile is edited later
        "customer_name_snapshot": clean["full_name"],
        "customer_mobile_snapshot": mobile,
        "category_id": clean["category_id"],
        "category_name": clean["category_name"],
        "work_name": clean["work_name"],
        "description": clean["description"],
        "expected_budget": clean["expected_budget"],
        "pincode": clean["pincode"],
        # future-ready location architecture
        "address": (data.get("address") or "").strip(),
        "city": (data.get("city") or "").strip(),
        "state": (data.get("state") or "").strip(),
        "lat": data.get("lat"),
        "lng": data.get("lng"),
        "service_area_status": "available",
        "status": "pending",
        "converted_service_id": None,
        "source": "custom_job_request",
        "idempotency_key": idem,
        "audit": [_audit("submitted", by=customer_id, by_name=clean["full_name"])],
        "created_at": now,
        "updated_at": now,
    }
    await db.custom_jobs.insert_one(dict(doc))
    doc.pop("_id", None)

    await _notify_submit(doc)
    return await _decorate(doc)


async def list_mine(user: dict) -> list:
    rows = await db.custom_jobs.find(
        {"customer_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [await _decorate(r) for r in rows]


# --------------------------------------------------------------------------- #
# admin: list / detail / status / convert
# --------------------------------------------------------------------------- #
async def admin_list(status: str = "", category_id: str = "", date_from: str = "",
                     date_to: str = "", pincode: str = "", q: str = "") -> list:
    query: dict = {}
    if status:
        query["status"] = status
    if category_id:
        query["category_id"] = category_id
    if pincode:
        query["pincode"] = {"$regex": re.escape(pincode.strip()), "$options": "i"}
    if date_from or date_to:
        rng: dict = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to + "T23:59:59"
        query["created_at"] = rng
    if q:
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [
            {"request_id": rx}, {"work_name": rx}, {"customer_name_snapshot": rx},
            {"customer_mobile_snapshot": rx}, {"description": rx}, {"city": rx},
        ]
    rows = await db.custom_jobs.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return [await _decorate(r) for r in rows]


async def admin_get(job_id: str, admin: dict = None) -> dict:
    job = await db.custom_jobs.find_one(
        {"$or": [{"id": job_id}, {"request_id": job_id}]}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Custom job request not found")
    # record a single 'viewed' audit entry (deduped)
    if admin and not any(a.get("action") == "viewed" for a in job.get("audit", [])):
        entry = _audit("viewed", by=admin.get("id", ""), by_name=admin.get("name", "Admin"))
        await db.custom_jobs.update_one({"id": job["id"]}, {"$push": {"audit": entry}})
        job.setdefault("audit", []).append(entry)
    return await _decorate(job)


async def admin_set_status(job_id: str, status: str, admin: dict, note: str = "") -> dict:
    status = (status or "").strip().lower()
    if status not in _ADMIN_SETTABLE:
        raise HTTPException(status_code=400, detail="Invalid status.")
    job = await db.custom_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Custom job request not found")
    if job.get("converted_service_id"):
        raise HTTPException(status_code=400,
                            detail="This request has been converted to a service and can no longer change status.")
    entry = _audit("status_changed", by=admin.get("id", ""),
                   by_name=admin.get("name", "Admin"), note=f"{job.get('status')} → {status}. {note}".strip())
    await db.custom_jobs.update_one(
        {"id": job["id"]},
        {"$set": {"status": status, "updated_at": now_iso()}, "$push": {"audit": entry}})
    job = await db.custom_jobs.find_one({"id": job["id"]}, {"_id": 0})
    await _notify_status(job, status)
    return await _decorate(job)


async def convert_to_service(job_id: str, admin: dict) -> dict:
    """Create a DRAFT service (inactive) prefilled from the request using the
    EXISTING service-creation system, then permanently link them. Idempotent:
    a request can only ever be converted once."""
    from controllers import catalog_controller as cc

    job = await db.custom_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Custom job request not found")

    # Duplicate-conversion protection -------------------------------------------
    if job.get("converted_service_id"):
        svc = await db.services.find_one({"id": job["converted_service_id"]}, {"_id": 0})
        return {"already_converted": True, "service_id": job["converted_service_id"],
                "service": svc, "job": await _decorate(job)}

    service_data = {
        "category_id": job["category_id"],
        "subcategory_id": "",
        "name": job["work_name"],
        "short_description": job["work_name"],
        "description": job["description"],
        # customer budget → SUGGESTED/initial price only (admin edits the real price)
        "base_price": float(job.get("expected_budget") or 0),
        "status": "inactive",          # draft — admin reviews/configures before activating
        "show_on_home": False,
        "approval_status": "approved",
        # permanent back-reference to the originating request
        "source": "custom_job",
        "custom_job_request_id": job["request_id"],
        "custom_job_id": job["id"],
    }
    svc = await cc.create_service(service_data)

    entry = _audit("converted_to_service", by=admin.get("id", ""),
                   by_name=admin.get("name", "Admin"),
                   note=f"Draft service created: {svc.get('name')} ({svc.get('id')})")
    await db.custom_jobs.update_one(
        {"id": job["id"]},
        {"$set": {"converted_service_id": svc["id"], "status": "converted_to_service",
                  "updated_at": now_iso()}, "$push": {"audit": entry}})
    job = await db.custom_jobs.find_one({"id": job["id"]}, {"_id": 0})

    await _notify_status(job, "converted_to_service")
    return {"already_converted": False, "service_id": svc["id"], "service": svc,
            "job": await _decorate(job)}


# --------------------------------------------------------------------------- #
# notifications (best-effort; never block the request)
# --------------------------------------------------------------------------- #
async def _notify_submit(job: dict):
    try:
        from services import notification_service as ns
        # customer
        await ns.notify(
            job["customer_id"], "Custom Job Request submitted",
            f"Your request {job['request_id']} ({job['work_name']}) has been submitted. "
            f"Our team will review it shortly.",
            link="/account", event="custom_job_submitted",
            data={"type": "custom_job", "request_id": job["request_id"]})
        # admins
        admins = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(50)
        for a in admins:
            await ns.notify(
                a["id"], "New Custom Job Request",
                f"{job['customer_name_snapshot']} requested '{job['work_name']}' "
                f"({job['category_name']}) · Budget ₹{job['expected_budget']:.0f} · {job['pincode']}.",
                link="/admin", event="custom_job_new",
                data={"type": "custom_job", "request_id": job["request_id"]})
    except Exception:  # noqa: BLE001
        pass


async def _notify_status(job: dict, status: str):
    try:
        from services import notification_service as ns
        msgs = {
            "under_review": "is now under review",
            "converted_to_service": "is being converted into a new service",
            "rejected": "could not be taken forward at this time",
            "closed": "has been closed",
        }
        if status not in msgs:
            return
        await ns.notify(
            job["customer_id"], "Custom Job Request update",
            f"Your request {job['request_id']} ({job['work_name']}) {msgs[status]}.",
            link="/account", event=f"custom_job_{status}",
            data={"type": "custom_job", "request_id": job["request_id"]})
    except Exception:  # noqa: BLE001
        pass


async def on_service_activated(service: dict):
    """Fired when a Custom-Job-derived service goes LIVE (status → active).
    Notifies the customer who requested it so they can book it via the normal
    booking flow. Idempotent — only ever notifies once."""
    sid = service.get("id")
    job = None
    if service.get("custom_job_id"):
        job = await db.custom_jobs.find_one({"id": service["custom_job_id"]}, {"_id": 0})
    if not job:
        job = await db.custom_jobs.find_one({"converted_service_id": sid}, {"_id": 0})
    if not job or job.get("service_activated_notified"):
        return

    entry = _audit("service_activated", by_name="System",
                   note=f"Service '{service.get('name')}' is now live and bookable.")
    await db.custom_jobs.update_one(
        {"id": job["id"]},
        {"$set": {"service_activated_notified": True, "updated_at": now_iso()},
         "$push": {"audit": entry}})

    try:
        from services import notification_service as ns
        await ns.notify(
            job["customer_id"], "Your requested service is now live! 🎉",
            f"Good news! '{service.get('name')}' is now available on AzoApp. "
            f"Tap to book it now.",
            link=f"/service/{sid}", event="custom_job_service_live",
            data={"type": "custom_job", "request_id": job["request_id"], "service_id": sid},
            sms_text=f"AzoApp: Your requested service '{service.get('name')}' is now live. Book now.")
    except Exception:  # noqa: BLE001
        pass

