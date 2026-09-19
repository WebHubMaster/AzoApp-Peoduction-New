"""Physical QR Provisioning service (PhonePe-style field mapping).

Two collections:
  * physical_qrs        — the stickers + their current token->merchant mapping
  * physical_qr_events  — immutable audit log of every mapping change / scan

Agents are ordinary users with role='agent' + is_qr_agent=True (demo-OTP capable),
each optionally owning a set of QR batches (assigned_batch_ids). Mapping funnels
into the EXISTING merchant referral pipeline: assigning a QR resolves a real
merchant_code (via merchant_code_service) and stores it on the sticker; the public
resolve endpoint hands that merchant_code back to the frontend, which stores it in
the SAME merchantRef mechanism as `?ref=`, so booking attribution is identical.
"""
import os
import random
import re
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException

from config.database import db, now_iso
from models.user import build_user
from services import merchant_code_service

# URL-safe, human-unambiguous alphabet (no 0/O/1/I/L)
_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ"
_DIGITS = "23456789"
_TOKEN_BODY = _ALPHABET + _DIGITS
_PREFIX_RE = re.compile(r"^[A-Z0-9]{2,6}$")
_MAX_BATCH = 500

_QR = "physical_qrs"
_EV = "physical_qr_events"


def _app_url() -> str:
    return (os.environ.get("APP_URL") or os.environ.get("PUBLIC_APP_URL")
            or os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")


def _public_url(token: str) -> str:
    base = _app_url()
    return f"{base}/?pqr={token}" if base else f"/?pqr={token}"


def _gen_token(prefix: str) -> str:
    body = "".join(random.choices(_TOKEN_BODY, k=6))
    return f"{prefix}{body}"


async def _unique_token(prefix: str) -> str:
    for _ in range(60):
        t = _gen_token(prefix)
        if not await db[_QR].find_one({"token": t}, {"_id": 0, "id": 1}):
            return t
    return _gen_token(prefix + random.choice(_DIGITS))


async def _event(token, action, by_user=None, from_merchant_id=None,
                 to_merchant_id=None, meta=None):
    doc = {
        "id": str(uuid.uuid4()),
        "token": token,
        "action": action,
        "from_merchant_id": from_merchant_id,
        "to_merchant_id": to_merchant_id,
        "by_user_id": (by_user or {}).get("id") if isinstance(by_user, dict) else by_user,
        "by_role": (by_user or {}).get("role") if isinstance(by_user, dict) else None,
        "at": now_iso(),
        "meta": meta or {},
    }
    try:
        await db[_EV].insert_one(doc)
    except Exception:  # noqa: BLE001
        pass
    return doc


def _clean(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    doc["url"] = _public_url(doc.get("token", ""))
    return doc


# ── agent scoping ───────────────────────────────────────────────────────────
def _is_agent(user: dict) -> bool:
    return bool(user and user.get("role") == "agent")


def _agent_batch_ids(user: dict):
    """Return the list of batch_ids an agent may touch, or None for full access."""
    if _is_agent(user):
        return list(user.get("assigned_batch_ids") or [])
    return None  # admin/staff -> unrestricted


def _scope_query(user: dict, base: dict) -> dict:
    ids = _agent_batch_ids(user)
    if ids is None:
        return base
    q = dict(base)
    q["batch_id"] = {"$in": ids or ["__none__"]}
    return q


async def _require_qr(user: dict, token: str) -> dict:
    qr = await db[_QR].find_one({"token": token}, {"_id": 0})
    if not qr:
        raise HTTPException(status_code=404, detail="QR not found")
    ids = _agent_batch_ids(user)
    if ids is not None and qr.get("batch_id") not in ids:
        raise HTTPException(status_code=403, detail="This QR is not in your assigned batches")
    return qr


# ── batches ──────────────────────────────────────────────────────────────────
async def create_batch(user: dict, count: int, batch_name: str = "", prefix: str = "PQR"):
    if _is_agent(user):
        raise HTTPException(status_code=403, detail="Only admins can generate new QR batches")
    try:
        count = int(count)
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid count")
    if count < 1 or count > _MAX_BATCH:
        raise HTTPException(status_code=400, detail=f"Count must be between 1 and {_MAX_BATCH}")
    prefix = (prefix or "PQR").strip().upper() or "PQR"
    if not _PREFIX_RE.match(prefix):
        raise HTTPException(status_code=400, detail="Prefix must be 2-6 letters/digits")
    batch_id = str(uuid.uuid4())
    batch_name = (batch_name or "").strip() or f"Batch {datetime.now(timezone.utc).strftime('%d %b %Y %H:%M')}"
    ts = now_iso()
    docs = []
    for _ in range(count):
        token = await _unique_token(prefix)
        docs.append({
            "id": str(uuid.uuid4()),
            "token": token,
            "batch_id": batch_id,
            "batch_name": batch_name,
            "status": "unassigned",
            "merchant_id": None,
            "merchant_code": None,
            "merchant_name": None,
            "mapped_by": None,
            "mapped_by_role": None,
            "mapped_at": None,
            "agent_id": None,
            "scans": 0,
            "last_scan_at": None,
            "created_at": ts,
            "updated_at": ts,
        })
    if docs:
        await db[_QR].insert_many([dict(d) for d in docs])
        for d in docs:
            await _event(d["token"], "generated", by_user=user,
                         meta={"batch_id": batch_id, "batch_name": batch_name})
    return {
        "batch_id": batch_id,
        "batch_name": batch_name,
        "count": len(docs),
        "qrs": [_clean(dict(d)) for d in docs],
    }


async def seed_demo_batches():
    """Idempotent demo seed: create a few sample QR sticker batches so the admin
    QR Batches page + poster preview have data out of the box. Runs only when
    there are NO physical QR stickers yet (fresh DB)."""
    existing = await db[_QR].estimated_document_count()
    if existing:
        return {"skipped": True, "existing": existing}
    demo = [
        ("Demo Sample Stickers", "PQR", 8),
        ("Ranchi Field Kit — Sep", "RNC", 12),
        ("Patna Field Kit — Sep", "PAT", 24),
    ]
    ts = now_iso()
    total = 0
    for name, prefix, count in demo:
        batch_id = str(uuid.uuid4())
        docs = []
        for _ in range(count):
            token = await _unique_token(prefix)
            docs.append({
                "id": str(uuid.uuid4()),
                "token": token,
                "batch_id": batch_id,
                "batch_name": name,
                "status": "unassigned",
                "merchant_id": None,
                "merchant_code": None,
                "merchant_name": None,
                "mapped_by": None,
                "mapped_by_role": None,
                "mapped_at": None,
                "agent_id": None,
                "scans": 0,
                "last_scan_at": None,
                "created_at": ts,
                "updated_at": ts,
            })
        if docs:
            await db[_QR].insert_many([dict(d) for d in docs])
            total += len(docs)
    return {"seeded": total, "batches": len(demo)}




async def list_batches(user: dict):
    ids = _agent_batch_ids(user)
    match = {}
    if ids is not None:
        match = {"batch_id": {"$in": ids or ["__none__"]}}
    pipeline = [
        {"$match": match},
        {"$group": {
            "_id": "$batch_id",
            "batch_name": {"$first": "$batch_name"},
            "created_at": {"$min": "$created_at"},
            "total": {"$sum": 1},
            "active": {"$sum": {"$cond": [{"$eq": ["$status", "active"]}, 1, 0]}},
            "unassigned": {"$sum": {"$cond": [{"$eq": ["$status", "unassigned"]}, 1, 0]}},
            "disabled": {"$sum": {"$cond": [{"$eq": ["$status", "disabled"]}, 1, 0]}},
            "scans": {"$sum": "$scans"},
            "agent_id": {"$first": "$agent_id"},
        }},
        {"$sort": {"created_at": -1}},
    ]
    rows = await db[_QR].aggregate(pipeline).to_list(1000)
    agent_ids = [r.get("agent_id") for r in rows if r.get("agent_id")]
    agents = {}
    if agent_ids:
        async for a in db.users.find({"id": {"$in": agent_ids}}, {"_id": 0, "id": 1, "name": 1}):
            agents[a["id"]] = a.get("name")
    out = []
    for r in rows:
        out.append({
            "batch_id": r["_id"],
            "batch_name": r.get("batch_name"),
            "created_at": r.get("created_at"),
            "total": r.get("total", 0),
            "active": r.get("active", 0),
            "unassigned": r.get("unassigned", 0),
            "disabled": r.get("disabled", 0),
            "scans": r.get("scans", 0),
            "agent_id": r.get("agent_id"),
            "agent_name": agents.get(r.get("agent_id")),
        })
    return {"batches": out}


async def batch_print(user: dict, batch_id: str):
    ids = _agent_batch_ids(user)
    if ids is not None and batch_id not in ids:
        raise HTTPException(status_code=403, detail="Batch not in your assigned batches")
    rows = await db[_QR].find({"batch_id": batch_id}, {"_id": 0}).sort("token", 1).to_list(_MAX_BATCH)
    if not rows:
        raise HTTPException(status_code=404, detail="Batch not found")
    return {
        "batch_id": batch_id,
        "batch_name": rows[0].get("batch_name"),
        "app_url": _app_url(),
        "qrs": [{"token": r["token"], "url": _public_url(r["token"]),
                 "status": r.get("status"), "merchant_name": r.get("merchant_name")} for r in rows],
    }


# ── registry list / detail ────────────────────────────────────────────────────
async def list_qrs(user: dict, status: str = "", batch_id: str = "", q: str = "",
                   page: int = 1, page_size: int = 25):
    base = {}
    if status in ("unassigned", "active", "disabled"):
        base["status"] = status
    if batch_id:
        base["batch_id"] = batch_id
    if q:
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        base["$or"] = [{"token": rx}, {"merchant_name": rx}, {"merchant_code": rx}]
    query = _scope_query(user, base)

    # status counts (respecting agent scope + batch filter, ignoring status itself)
    count_base = {k: v for k, v in query.items() if k != "status"}
    counts = {"all": 0, "unassigned": 0, "active": 0, "disabled": 0}
    counts["all"] = await db[_QR].count_documents(count_base)
    for st in ("unassigned", "active", "disabled"):
        counts[st] = await db[_QR].count_documents({**count_base, "status": st})

    page = max(1, int(page or 1))
    page_size = min(100, max(1, int(page_size or 25)))
    total = await db[_QR].count_documents(query)
    rows = await (db[_QR].find(query, {"_id": 0})
                  .sort("updated_at", -1)
                  .skip((page - 1) * page_size).limit(page_size).to_list(page_size))
    return {
        "items": [_clean(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "counts": counts,
    }


async def get_qr(user: dict, token: str):
    qr = await _require_qr(user, token)
    events = await db[_EV].find({"token": token}, {"_id": 0}).sort("at", -1).to_list(200)
    return {"qr": _clean(qr), "events": events}


# ── merchant resolution + assignment ──────────────────────────────────────────
async def _resolve_merchant(merchant_id: str = None, merchant_code: str = None):
    if merchant_code:
        m = await merchant_code_service.validate_code(merchant_code)
        if m:
            return m
    if merchant_id:
        m = await db.users.find_one(
            {"id": merchant_id, "role": "merchant"},
            {"_id": 0, "id": 1, "name": 1, "shop_name": 1, "merchant_code": 1, "phone": 1})
        if m:
            # ensure the merchant has a permanent code (older seeds may lack one)
            if not m.get("merchant_code"):
                full = await db.users.find_one({"id": merchant_id}, {"_id": 0})
                if full:
                    m["merchant_code"] = await merchant_code_service.ensure_merchant_code(full)
            return m
    return None


async def assign(user: dict, token: str, merchant_id: str = None, merchant_code: str = None):
    qr = await _require_qr(user, token)
    if qr.get("status") == "disabled":
        raise HTTPException(status_code=400, detail="This QR is disabled. Enable it before mapping.")
    # Mapping lock: once a QR is mapped (active) to a merchant, a field agent cannot
    # re-map it — they only see it as already mapped. Admins may still reassign.
    if qr.get("status") == "active" and qr.get("merchant_id") and _is_agent(user):
        raise HTTPException(
            status_code=409,
            detail=f"This QR is already mapped to {qr.get('merchant_name') or 'a merchant'}"
                   f"{' (' + qr.get('merchant_code') + ')' if qr.get('merchant_code') else ''}. "
                   f"It cannot be mapped again.",
        )
    m = await _resolve_merchant(merchant_id, (merchant_code or "").strip() or None)
    if not m:
        raise HTTPException(status_code=404, detail="Merchant not found for the given code/id")
    prev_merchant = qr.get("merchant_id")
    reassign = bool(prev_merchant and prev_merchant != m["id"] and qr.get("status") == "active")
    shop = m.get("shop_name") or m.get("name") or ""
    ts = now_iso()
    await db[_QR].update_one({"token": token}, {"$set": {
        "status": "active",
        "merchant_id": m["id"],
        "merchant_code": m.get("merchant_code"),
        "merchant_name": shop,
        "mapped_by": user.get("id"),
        "mapped_by_role": user.get("role"),
        "mapped_at": ts,
        "updated_at": ts,
    }})
    await _event(token, "reassigned" if reassign else "assigned", by_user=user,
                 from_merchant_id=prev_merchant, to_merchant_id=m["id"],
                 meta={"merchant_code": m.get("merchant_code"), "merchant_name": shop})
    # Agent earns a fixed commission for a fresh successful mapping (best-effort).
    earning = None
    try:
        from services import agent_service
        earning = await agent_service.credit_mapping_commission(
            user, {"token": token, "batch_id": qr.get("batch_id"),
                   "merchant_id": m["id"], "merchant_name": shop,
                   "merchant_code": m.get("merchant_code")},
            prev_status=(qr.get("status") or "unassigned"))
    except Exception:  # noqa: BLE001
        earning = None
    fresh = await db[_QR].find_one({"token": token}, {"_id": 0})
    return {"ok": True, "reassigned": reassign, "qr": _clean(fresh),
            "agent_earning": earning.get("amount") if earning else None}


async def set_status(user: dict, token: str, enable: bool):
    qr = await _require_qr(user, token)
    if not enable:
        new_status = "disabled"
    else:
        new_status = "active" if qr.get("merchant_id") else "unassigned"
    ts = now_iso()
    await db[_QR].update_one({"token": token}, {"$set": {"status": new_status, "updated_at": ts}})
    await _event(token, "disabled" if not enable else "enabled", by_user=user,
                 meta={"status": new_status})
    fresh = await db[_QR].find_one({"token": token}, {"_id": 0})
    return {"ok": True, "qr": _clean(fresh)}


# ── public resolve (customer scan) ─────────────────────────────────────────────
async def resolve_public(token: str):
    """Public: never leaks internals. Returns attribution merchant_code only when
    the sticker is ACTIVE. Best-effort increments scans + writes a scanned event."""
    token = (token or "").strip()
    if not token:
        return {"valid": False}
    qr = await db[_QR].find_one({"token": token}, {"_id": 0})
    if not qr:
        return {"valid": False}
    # best-effort scan analytics (non-blocking on failure)
    try:
        await db[_QR].update_one(
            {"token": token},
            {"$inc": {"scans": 1}, "$set": {"last_scan_at": now_iso()}})
        await _event(token, "scanned", meta={"status": qr.get("status")})
    except Exception:  # noqa: BLE001
        pass
    if qr.get("status") != "active" or not qr.get("merchant_code"):
        return {"valid": True, "status": qr.get("status"), "active": False}
    return {
        "valid": True,
        "active": True,
        "status": "active",
        "merchant_code": qr.get("merchant_code"),
        "shop_name": qr.get("merchant_name") or "",
    }


# ── merchant search (for the Map/Assign picker) ────────────────────────────────
async def merchant_search(q: str = "", limit: int = 20):
    query = {"role": "merchant"}
    q = (q or "").strip()
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"name": rx}, {"shop_name": rx}, {"merchant_code": rx}, {"phone": rx}]
    rows = await db.users.find(
        query, {"_id": 0, "id": 1, "name": 1, "shop_name": 1, "merchant_code": 1, "phone": 1}
    ).limit(min(50, max(1, int(limit or 20)))).to_list(50)
    return {"merchants": rows}


# ── agent management (admin only) ──────────────────────────────────────────────
def _admin_only(user: dict):
    if user.get("role") not in ("admin", "superadmin", "staff"):
        raise HTTPException(status_code=403, detail="Admins only")


async def create_agent(user: dict, name: str, phone: str):
    _admin_only(user)
    phone = (phone or "").strip()
    name = (name or "").strip()
    if not phone or not name:
        raise HTTPException(status_code=400, detail="Name and phone are required")
    existing = await db.users.find_one({"phone": phone}, {"_id": 0})
    if existing:
        if existing.get("role") == "agent":
            # idempotent: re-activate + return existing agent
            await db.users.update_one({"id": existing["id"]}, {"$set": {
                "is_qr_agent": True, "agent_active": True, "name": name}})
            existing.update({"is_qr_agent": True, "agent_active": True, "name": name})
            return _agent_public(existing)
        raise HTTPException(status_code=400,
                            detail=f"This number is already registered as {existing.get('role')}")
    doc = build_user(phone, "agent", name, is_demo=True)
    doc["is_qr_agent"] = True
    doc["agent_active"] = True
    doc["assigned_batch_ids"] = []
    await db.users.insert_one(dict(doc))
    doc.pop("_id", None)
    return _agent_public(doc)


def _agent_public(u: dict) -> dict:
    return {
        "id": u.get("id"),
        "name": u.get("name"),
        "phone": u.get("phone"),
        "agent_active": bool(u.get("agent_active", True)),
        "assigned_batch_ids": list(u.get("assigned_batch_ids") or []),
    }


async def list_agents(user: dict):
    _admin_only(user)
    rows = await db.users.find({"role": "agent", "is_qr_agent": True}, {"_id": 0}).to_list(500)
    agents = [_agent_public(r) for r in rows]
    # attach batch counts + earnings
    from services import agent_service
    for a in agents:
        bids = a["assigned_batch_ids"]
        a["batch_count"] = len(bids)
        a["qr_count"] = await db[_QR].count_documents({"batch_id": {"$in": bids or ["__none__"]}}) if bids else 0
        summ = await agent_service.wallet_summary(a["id"])
        a["total_earned"] = summ["total_earned"]
        a["mappings"] = summ["mappings"]
        a["available"] = summ["available"]
    return {"agents": agents}


async def assign_batches_to_agent(user: dict, agent_id: str, batch_ids):
    _admin_only(user)
    agent = await db.users.find_one({"id": agent_id, "role": "agent"}, {"_id": 0})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    batch_ids = list(batch_ids or [])
    await db.users.update_one({"id": agent_id}, {"$set": {"assigned_batch_ids": batch_ids}})
    # stamp agent_id on the QRs of the assigned batches; clear from de-assigned ones
    await db[_QR].update_many({"agent_id": agent_id}, {"$set": {"agent_id": None}})
    if batch_ids:
        await db[_QR].update_many({"batch_id": {"$in": batch_ids}}, {"$set": {"agent_id": agent_id}})
    agent["assigned_batch_ids"] = batch_ids
    return _agent_public(agent)


async def toggle_agent(user: dict, agent_id: str, active: bool):
    _admin_only(user)
    agent = await db.users.find_one({"id": agent_id, "role": "agent"}, {"_id": 0})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    await db.users.update_one({"id": agent_id}, {"$set": {"agent_active": bool(active)}})
    agent["agent_active"] = bool(active)
    return _agent_public(agent)
