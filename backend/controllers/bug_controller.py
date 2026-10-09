"""Report-a-Bug: customers & partners report an app bug (title + description + optional
screenshot); admin reviews them, marks them Solved with a resolution note (which the
reporter sees in-app); the reporter can delete their own report once it's solved/closed.

Collection: `bug_reports`
Status machine:  open → solved   (closed == solved for the reporter)
"""
from fastapi import HTTPException
from config.database import db, now_iso
from models.user import new_id
from services import realtime as rt

_APP_LABEL = {"customer": "Customer App", "partner": "Partner App", "merchant": "Merchant App"}


def _public(b: dict) -> dict:
    """Shape a bug_report row for API responses (never leak Mongo _id)."""
    b.pop("_id", None)
    b["app_label"] = _APP_LABEL.get(b.get("reporter_role"), "App")
    return b


async def create_bug(user, data: dict) -> dict:
    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Please add a short title for the bug")
    if not description:
        raise HTTPException(status_code=400, detail="Please describe the bug")
    doc = {
        "id": new_id(),
        "reporter_id": user["id"],
        "reporter_role": user.get("role") or "customer",
        "reporter_name": user.get("name") or "",
        "reporter_phone": user.get("phone") or "",
        "title": title[:160],
        "description": description[:4000],
        "screenshot_url": (data.get("screenshot_url") or "").strip() or None,
        "status": "open",
        "resolution_note": None,
        "resolved_at": None,
        "resolved_by": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.bug_reports.insert_one(dict(doc))
    try:
        rt.emit_admin("bug_report", {"id": doc["id"], "title": doc["title"],
                                     "reporter_role": doc["reporter_role"], "status": "open"})
    except Exception:  # noqa: BLE001
        pass
    return _public(doc)


async def my_bugs(user) -> list:
    rows = await db.bug_reports.find({"reporter_id": user["id"]}, {"_id": 0}) \
        .sort("created_at", -1).to_list(500)
    return [_public(r) for r in rows]


async def delete_bug(user, bug_id: str) -> dict:
    b = await db.bug_reports.find_one({"id": bug_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Bug report not found")
    if b.get("reporter_id") != user["id"]:
        raise HTTPException(status_code=403, detail="This bug report isn't yours")
    if b.get("status") not in ("solved", "closed"):
        raise HTTPException(status_code=400,
                            detail="You can delete a report only after it's marked Solved")
    await db.bug_reports.delete_one({"id": bug_id})
    return {"ok": True, "deleted": bug_id}


# ---------------- admin ----------------
async def admin_list(status: str = "", role: str = "", q: str = "",
                     page: int = 1, page_size: int = 20) -> dict:
    query: dict = {}
    if status in ("open", "solved", "closed"):
        query["status"] = status
    if role in ("customer", "partner", "merchant"):
        query["reporter_role"] = role
    if q:
        rx = {"$regex": q.strip(), "$options": "i"}
        query["$or"] = [{"title": rx}, {"description": rx},
                        {"reporter_name": rx}, {"reporter_phone": rx}]
    total = await db.bug_reports.count_documents(query)
    skip = max(0, (int(page) - 1) * int(page_size))
    rows = await db.bug_reports.find(query, {"_id": 0}) \
        .sort("created_at", -1).skip(skip).limit(int(page_size)).to_list(int(page_size))
    counts = {
        "all": await db.bug_reports.count_documents({}),
        "open": await db.bug_reports.count_documents({"status": "open"}),
        "solved": await db.bug_reports.count_documents({"status": {"$in": ["solved", "closed"]}}),
    }
    return {"data": [_public(r) for r in rows], "total": total,
            "page": int(page), "page_size": int(page_size), "counts": counts}


async def admin_resolve(admin, bug_id: str, note: str = "") -> dict:
    b = await db.bug_reports.find_one({"id": bug_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Bug report not found")
    note = (note or "").strip()
    await db.bug_reports.update_one({"id": bug_id}, {"$set": {
        "status": "solved", "resolution_note": note or "Fixed. Thanks for reporting!",
        "resolved_at": now_iso(), "resolved_by": (admin or {}).get("name") or "Admin",
        "updated_at": now_iso()}})
    fresh = await db.bug_reports.find_one({"id": bug_id}, {"_id": 0})
    # Notify the reporter in-app + push + SSE so the status flips live in their app.
    try:
        from services import notification_service
        await notification_service.notify(
            b["reporter_id"], "Your reported bug is solved ✅",
            f"\"{b.get('title')}\" has been fixed." + (f" {fresh.get('resolution_note')}" if fresh.get("resolution_note") else ""),
            link="/", data={"type": "bug_update", "bug_id": bug_id, "status": "solved"})
    except Exception:  # noqa: BLE001
        pass
    try:
        rt.emit_user(b["reporter_id"], "bug_update", {"bug_id": bug_id, "status": "solved"})
    except Exception:  # noqa: BLE001
        pass
    return _public(fresh)


async def admin_reopen(admin, bug_id: str) -> dict:
    b = await db.bug_reports.find_one({"id": bug_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Bug report not found")
    await db.bug_reports.update_one({"id": bug_id}, {"$set": {
        "status": "open", "resolved_at": None, "resolved_by": None, "updated_at": now_iso()}})
    return _public(await db.bug_reports.find_one({"id": bug_id}, {"_id": 0}))
