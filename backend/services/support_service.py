"""Advanced Support / Helpdesk service.

A single collection `support_tickets` powers an industry-grade helpdesk shared by
customer / partner / merchant panels and resolved from the admin inbox.

Ticket doc shape:
{
  id, code, user_id, user_name, user_role, user_phone,
  subject, category, priority, status, booking_code,
  assigned_to, assigned_name,
  messages: [ {id, sender_id, sender_role, sender_name, text,
               attachments:[{url,name,type,kind,size}], at, system} ],
  unread_admin, unread_user,
  created_at, updated_at, last_message_at, first_response_at,
  resolved_at, closed_at, rating
}
"""
from fastapi import HTTPException
from config.database import db, now_iso
from models.user import new_id
from models.support import CATEGORIES, PRIORITIES, STATUSES

# 5MB per file, images + pdf, up to 5 files per message
MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_FILES_PER_MSG = 5
ALLOWED_MIME = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "application/pdf"}


def meta():
    return {
        "categories": CATEGORIES,
        "priorities": PRIORITIES,
        "statuses": STATUSES,
        "max_file_mb": MAX_FILE_BYTES // (1024 * 1024),
        "max_files": MAX_FILES_PER_MSG,
        "allowed": ["JPG", "PNG", "WebP", "GIF", "PDF"],
    }


async def _gen_code():
    n = await db.support_tickets.count_documents({})
    return f"TKT-{100000 + n + 1}"


def _clean_attachments(atts):
    out = []
    for a in (atts or [])[:MAX_FILES_PER_MSG]:
        if not a.get("url"):
            continue
        out.append({
            "url": a["url"], "name": a.get("name", ""), "type": a.get("type", ""),
            "kind": a.get("kind", "image"), "size": int(a.get("size", 0) or 0),
        })
    return out


def _msg(user, text, attachments, system=False, internal=False):
    return {
        "id": new_id(),
        "sender_id": user["id"] if user else "system",
        "sender_role": user["role"] if user else "system",
        "sender_name": (user.get("name") if user else "System") or "User",
        "text": (text or "").strip(),
        "attachments": _clean_attachments(attachments),
        "at": now_iso(),
        "system": system,
        "internal": internal,
    }


# ---------------- user side ----------------
async def create_ticket(user, data: dict):
    subject = (data.get("subject") or "").strip()
    if not subject:
        raise HTTPException(status_code=400, detail="Please enter a subject")
    category = data.get("category") if data.get("category") in CATEGORIES else "other"
    priority = data.get("priority") if data.get("priority") in PRIORITIES else "medium"
    text = (data.get("message") or "").strip()
    atts = _clean_attachments(data.get("attachments"))
    if not text and not atts:
        raise HTTPException(status_code=400, detail="Please describe your issue")

    ts = now_iso()
    first = _msg(user, text, atts)
    doc = {
        "id": new_id(), "code": await _gen_code(),
        "user_id": user["id"], "user_name": user.get("name") or "User",
        "user_role": user["role"], "user_phone": user.get("phone", ""),
        "subject": subject, "category": category, "priority": priority,
        "status": "open", "booking_code": (data.get("booking_code") or "").strip(),
        "assigned_to": None, "assigned_name": None,
        "messages": [first],
        "unread_admin": 1, "unread_user": 0,
        "created_at": ts, "updated_at": ts, "last_message_at": ts,
        "first_response_at": None, "resolved_at": None, "closed_at": None,
        "rating": None,
    }
    await db.support_tickets.insert_one(dict(doc))
    doc.pop("_id", None)
    await _notify_admins(doc, f"New support ticket {doc['code']}: {subject}")
    return doc


async def list_my_tickets(user):
    rows = await db.support_tickets.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("last_message_at", -1).to_list(500)
    return [_summary(r) for r in rows]


def _typing_active(at):
    """True if a typing ping happened within the last 6 seconds."""
    if not at:
        return False
    try:
        from datetime import datetime, timezone
        t = datetime.fromisoformat(at)
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - t).total_seconds() <= 6
    except Exception:
        return False


async def set_typing(tid, actor):
    """Record a typing ping. actor = 'user' or 'agent'."""
    field = "typing_user_at" if actor == "user" else "typing_agent_at"
    await db.support_tickets.update_one({"id": tid}, {"$set": {field: now_iso()}})
    return {"ok": True}


async def set_typing_user(user, tid):
    """User typing ping — only for a ticket the user owns."""
    owns = await db.support_tickets.find_one({"id": tid, "user_id": user["id"]}, {"_id": 1})
    if not owns:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return await set_typing(tid, "user")


async def get_ticket(user, tid):
    t = await db.support_tickets.find_one({"id": tid, "user_id": user["id"]}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    # user opened it -> clear their unread
    if t.get("unread_user"):
        await db.support_tickets.update_one({"id": tid}, {"$set": {"unread_user": 0}})
        t["unread_user"] = 0
    # NEVER expose admin internal notes to the customer
    t["messages"] = [m for m in (t.get("messages") or []) if not m.get("internal")]
    t["agent_typing"] = _typing_active(t.get("typing_agent_at"))
    return t


async def add_user_message(user, tid, data: dict):
    t = await db.support_tickets.find_one({"id": tid, "user_id": user["id"]}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if t.get("status") == "closed":
        raise HTTPException(status_code=400, detail="This ticket is closed. Please raise a new ticket.")
    text = (data.get("text") or "").strip()
    atts = _clean_attachments(data.get("attachments"))
    if not text and not atts:
        raise HTTPException(status_code=400, detail="Message is empty")
    m = _msg(user, text, atts)
    ts = m["at"]
    upd = {"$push": {"messages": m},
           "$set": {"last_message_at": ts, "updated_at": ts, "unread_admin": (t.get("unread_admin", 0) or 0) + 1}}
    # a customer reply on a resolved ticket re-opens it
    if t.get("status") == "resolved":
        upd["$set"]["status"] = "in_progress"
    await db.support_tickets.update_one({"id": tid}, upd)
    await _notify_admins(t, f"New reply on {t['code']}")
    return await db.support_tickets.find_one({"id": tid}, {"_id": 0})


async def close_by_user(user, tid):
    t = await db.support_tickets.find_one({"id": tid, "user_id": user["id"]}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if t.get("status") == "closed":
        return t
    ts = now_iso()
    sysm = {"id": new_id(), "sender_id": "system", "sender_role": "system",
            "sender_name": "System", "text": f"Ticket closed by {user.get('name') or 'user'}.",
            "attachments": [], "at": ts, "system": True}
    await db.support_tickets.update_one({"id": tid}, {
        "$push": {"messages": sysm},
        "$set": {"status": "closed", "closed_at": ts, "updated_at": ts, "last_message_at": ts}})
    return await db.support_tickets.find_one({"id": tid}, {"_id": 0})


# ---------------- admin side ----------------
async def admin_list(status=None, role=None, priority=None, q=None, assigned=None):
    query = {}
    if status and status in STATUSES:
        query["status"] = status
    if role and role in ("customer", "partner", "merchant"):
        query["user_role"] = role
    if priority and priority in PRIORITIES:
        query["priority"] = priority
    if assigned:
        query["assigned_to"] = assigned
    if q:
        query["$or"] = [
            {"code": {"$regex": q, "$options": "i"}},
            {"subject": {"$regex": q, "$options": "i"}},
            {"user_name": {"$regex": q, "$options": "i"}},
            {"user_phone": {"$regex": q, "$options": "i"}},
        ]
    rows = await db.support_tickets.find(query, {"_id": 0}).sort("last_message_at", -1).to_list(1000)
    return [_summary(r) for r in rows]


async def admin_get(tid):
    t = await db.support_tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if t.get("unread_admin"):
        await db.support_tickets.update_one({"id": tid}, {"$set": {"unread_admin": 0}})
        t["unread_admin"] = 0
    t["user_typing"] = _typing_active(t.get("typing_user_at"))
    t["department"] = t.get("category")
    # Enrich with the requester's profile for the info side-panel.
    u = await db.users.find_one({"id": t.get("user_id")}, {"_id": 0}) or {}
    t["user_info"] = {
        "id": u.get("id") or t.get("user_id"),
        "name": u.get("name") or t.get("user_name") or "User",
        "email": u.get("email") or "",
        "phone": u.get("phone") or t.get("user_phone") or "",
        "company": u.get("company_name") or u.get("company") or "",
        "role": u.get("role") or t.get("user_role") or "",
        "registered_at": u.get("created_at") or "",
        "wallet_balance": u.get("wallet_balance", 0),
    }
    # Previous conversations by the same user (excluding this ticket).
    prev = await db.support_tickets.find(
        {"user_id": t.get("user_id"), "id": {"$ne": tid}}, {"_id": 0}
    ).sort("last_message_at", -1).to_list(20)
    t["previous_conversations"] = [
        {"id": p["id"], "code": p["code"], "subject": p["subject"],
         "status": p["status"], "created_at": p["created_at"]}
        for p in prev
    ]
    return t


async def admin_set_priority(tid, priority):
    if priority not in PRIORITIES:
        raise HTTPException(status_code=400, detail="Invalid priority")
    t = await db.support_tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    await db.support_tickets.update_one(
        {"id": tid}, {"$set": {"priority": priority, "updated_at": now_iso()}})
    return await db.support_tickets.find_one({"id": tid}, {"_id": 0})


async def admin_reply(admin, tid, data: dict):
    t = await db.support_tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if t.get("status") == "closed":
        raise HTTPException(status_code=400, detail="Ticket is closed. Reopen it to reply.")
    text = (data.get("text") or "").strip()
    atts = _clean_attachments(data.get("attachments"))
    if not text and not atts:
        raise HTTPException(status_code=400, detail="Message is empty")
    internal = bool(data.get("internal"))
    m = _msg(admin, text, atts, internal=internal)
    m["sender_role"] = "admin"
    ts = m["at"]
    sets = {"last_message_at": ts, "updated_at": ts}
    if internal:
        # Internal note: not shown to the user, no unread bump, no notification.
        await db.support_tickets.update_one({"id": tid}, {"$push": {"messages": m}, "$set": sets})
        return await db.support_tickets.find_one({"id": tid}, {"_id": 0})
    sets["unread_user"] = (t.get("unread_user", 0) or 0) + 1
    if not t.get("first_response_at"):
        sets["first_response_at"] = ts
    if t.get("status") == "open":
        sets["status"] = "in_progress"
    await db.support_tickets.update_one({"id": tid}, {"$push": {"messages": m}, "$set": sets})
    await _notify_user(t, f"Support replied on {t['code']}")
    return await db.support_tickets.find_one({"id": tid}, {"_id": 0})


async def admin_set_status(admin, tid, status):
    if status not in STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    t = await db.support_tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    ts = now_iso()
    sets = {"status": status, "updated_at": ts, "last_message_at": ts}
    if status == "resolved":
        sets["resolved_at"] = ts
    if status == "closed":
        sets["closed_at"] = ts
    label = {"open": "re-opened", "in_progress": "marked In Progress",
             "resolved": "marked Resolved", "closed": "closed"}[status]
    sysm = {"id": new_id(), "sender_id": "system", "sender_role": "system",
            "sender_name": "System", "text": f"Ticket {label} by support.",
            "attachments": [], "at": ts, "system": True}
    await db.support_tickets.update_one({"id": tid}, {
        "$push": {"messages": sysm},
        "$set": {**sets, "unread_user": (t.get("unread_user", 0) or 0) + 1}})
    await _notify_user(t, f"Your ticket {t['code']} was {label}")
    return await db.support_tickets.find_one({"id": tid}, {"_id": 0})


async def admin_assign(tid, admin_id, admin_name):
    t = await db.support_tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    await db.support_tickets.update_one({"id": tid}, {
        "$set": {"assigned_to": admin_id, "assigned_name": admin_name, "updated_at": now_iso()}})
    return await db.support_tickets.find_one({"id": tid}, {"_id": 0})


async def admin_stats():
    all_t = await db.support_tickets.find({}, {"_id": 0, "status": 1, "user_role": 1, "priority": 1}).to_list(5000)
    by_status = {s: 0 for s in STATUSES}
    by_role = {"customer": 0, "partner": 0, "merchant": 0}
    by_priority = {p: 0 for p in PRIORITIES}
    for t in all_t:
        by_status[t.get("status", "open")] = by_status.get(t.get("status", "open"), 0) + 1
        r = t.get("user_role")
        if r in by_role:
            by_role[r] += 1
        by_priority[t.get("priority", "medium")] = by_priority.get(t.get("priority", "medium"), 0) + 1
    unread = await db.support_tickets.count_documents({"unread_admin": {"$gt": 0}})
    return {
        "total": len(all_t), "by_status": by_status, "by_role": by_role,
        "by_priority": by_priority, "open_active": by_status["open"] + by_status["in_progress"],
        "unread": unread,
    }


# ---------------- helpers ----------------
def _summary(t):
    msgs = t.get("messages", []) or []
    last = msgs[-1] if msgs else None
    preview = ""
    if last:
        preview = last.get("text") or ("📎 Attachment" if last.get("attachments") else "")
    return {
        "id": t["id"], "code": t["code"], "subject": t["subject"],
        "category": t["category"], "priority": t["priority"], "status": t["status"],
        "user_name": t["user_name"], "user_role": t["user_role"], "user_phone": t.get("user_phone", ""),
        "assigned_name": t.get("assigned_name"),
        "unread_admin": t.get("unread_admin", 0), "unread_user": t.get("unread_user", 0),
        "message_count": len(msgs), "last_preview": preview[:80],
        "created_at": t["created_at"], "last_message_at": t.get("last_message_at"),
    }


async def _notify_admins(ticket, body):
    try:
        await db.notifications.insert_one({
            "id": new_id(), "created_at": now_iso(), "audience": "admin",
            "title": "Support", "body": body, "read_by": [],
            "link": "support", "ref_id": ticket["id"]})
    except Exception:
        pass


async def _notify_user(ticket, body):
    try:
        await db.notifications.insert_one({
            "id": new_id(), "created_at": now_iso(), "audience": ticket["user_role"],
            "user_id": ticket["user_id"], "title": "Support", "body": body,
            "read_by": [], "link": "support", "ref_id": ticket["id"]})
    except Exception:
        pass
