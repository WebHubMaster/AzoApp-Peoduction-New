"""Field-agent earnings, bank KYC and withdrawals for the Physical QR feature.

An agent earns a fixed commission (Admin → Integration Center → Agent Payouts)
each time they SUCCESSFULLY map a fresh QR sticker to a merchant. Earnings accrue
to an agent wallet (computed from `agent_earnings` minus withdrawals). Withdrawals
mirror the partner flow: verify bank first, then request → admin approve/reject.
"""
import re
from fastapi import HTTPException

from config.database import db, now_iso, get_settings
from models.user import new_id
from services import money

_EARN = "agent_earnings"
_WD = "agent_withdrawals"
_IFSC_RE = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")


async def get_agent_config() -> dict:
    s = await get_settings()
    cfg = dict((s or {}).get("agent_config") or {})
    cfg.setdefault("enabled", True)
    cfg.setdefault("commission_per_mapping", 20)
    cfg.setdefault("min_withdrawal", 100)
    cfg.setdefault("max_withdrawal", 25000)
    cfg.setdefault("pay_once_per_qr", True)
    return cfg


# ── commission crediting (called from physical_qr_service.assign) ──────────────
async def credit_mapping_commission(agent: dict, qr: dict, prev_status: str):
    """Credit the agent a fixed commission for a fresh, successful mapping.
    Only agents earn; only on a first activation (prev_status != 'active');
    at most once per QR token when pay_once_per_qr is on. Best-effort."""
    try:
        if not agent or agent.get("role") != "agent":
            return None
        if prev_status == "active":
            return None  # re-map of an already-active sticker never pays again
        cfg = await get_agent_config()
        if not cfg.get("enabled"):
            return None
        amount = money.money(cfg.get("commission_per_mapping", 0) or 0)
        if amount <= 0:
            return None
        token = qr.get("token")
        if cfg.get("pay_once_per_qr", True):
            if await db[_EARN].find_one({"token": token}, {"_id": 0, "id": 1}):
                return None
        else:
            if await db[_EARN].find_one({"token": token, "agent_id": agent["id"]}, {"_id": 0, "id": 1}):
                return None
        doc = {
            "id": new_id(),
            "agent_id": agent["id"],
            "agent_name": agent.get("name"),
            "token": token,
            "batch_id": qr.get("batch_id"),
            "merchant_id": qr.get("merchant_id"),
            "merchant_name": qr.get("merchant_name"),
            "merchant_code": qr.get("merchant_code"),
            "amount": amount,
            "at": now_iso(),
        }
        await db[_EARN].insert_one(dict(doc))
        # analytics txn (non-authoritative; wallet is computed from collections)
        await db.transactions.insert_one({
            "id": new_id(), "user_id": agent["id"], "kind": "agent_mapping_commission",
            "direction": "credit", "amount": amount,
            "note": f"QR mapping · {qr.get('merchant_name') or ''} ({token})",
            "created_at": now_iso(),
        })
        doc.pop("_id", None)
        return doc
    except Exception:  # noqa: BLE001
        return None


# ── wallet summary ─────────────────────────────────────────────────────────────
async def wallet_summary(agent_id: str) -> dict:
    earns = await db[_EARN].find({"agent_id": agent_id}, {"_id": 0}).to_list(5000)
    total_earned = money.add(*[e.get("amount", 0) for e in earns]) if earns else 0.0
    wds = await db[_WD].find({"agent_id": agent_id}, {"_id": 0}).to_list(2000)
    pending = money.add(*[w["amount"] for w in wds if w.get("status") == "pending"]) if wds else 0.0
    withdrawn = money.add(*[w["amount"] for w in wds if w.get("status") == "approved"]) if wds else 0.0
    available = money.money(total_earned - pending - withdrawn)
    return {
        "total_earned": money.money(total_earned),
        "pending": money.money(pending),
        "withdrawn": money.money(withdrawn),
        "available": max(0.0, available),
        "mappings": len(earns),
    }


async def agent_me(user: dict) -> dict:
    cfg = await get_agent_config()
    summary = await wallet_summary(user["id"])
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0}) or user
    return {
        "id": user["id"],
        "name": user.get("name"),
        "phone": user.get("phone"),
        "assigned_batch_ids": list(fresh.get("assigned_batch_ids") or []),
        "bank": fresh.get("agent_bank") or None,
        "wallet": summary,
        "config": {
            "commission_per_mapping": cfg.get("commission_per_mapping"),
            "min_withdrawal": cfg.get("min_withdrawal"),
            "max_withdrawal": cfg.get("max_withdrawal"),
            "enabled": cfg.get("enabled"),
        },
    }


async def list_earnings(agent_id: str, limit: int = 300):
    rows = await db[_EARN].find({"agent_id": agent_id}, {"_id": 0}).sort("at", -1).to_list(limit)
    return {"earnings": rows}


# ── bank KYC ─────────────────────────────────────────────────────────────────
async def submit_bank(user: dict, data: dict):
    account_name = (data.get("account_name") or "").strip()
    account_number = (data.get("account_number") or "").strip()
    ifsc = (data.get("ifsc") or "").strip().upper()
    bank_name = (data.get("bank_name") or "").strip()
    upi = (data.get("upi") or "").strip()
    if not account_name or not account_number:
        raise HTTPException(status_code=400, detail="Account holder name and number are required")
    if not _IFSC_RE.match(ifsc):
        raise HTTPException(status_code=400, detail="Enter a valid IFSC code")
    bank = {
        "account_name": account_name,
        "account_number": account_number,
        "ifsc": ifsc,
        "bank_name": bank_name,
        "upi": upi,
        "verified": False,
        "submitted_at": now_iso(),
        "verified_at": None,
    }
    await db.users.update_one({"id": user["id"]}, {"$set": {"agent_bank": bank}})
    return {"ok": True, "bank": bank}


# ── withdrawals (agent) ────────────────────────────────────────────────────────
async def request_withdraw(user: dict, amount: float, method: str = "bank"):
    cfg = await get_agent_config()
    if not cfg.get("enabled"):
        raise HTTPException(status_code=400, detail="Agent payouts are disabled")
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0}) or user
    bank = fresh.get("agent_bank") or {}
    if not bank.get("verified"):
        raise HTTPException(status_code=400, detail="Verify your bank details before withdrawing")
    try:
        amount = money.money(amount)
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid amount")
    if amount < money.money(cfg.get("min_withdrawal", 0) or 0):
        raise HTTPException(status_code=400, detail=f"Minimum withdrawal is Rs.{cfg.get('min_withdrawal')}")
    if cfg.get("max_withdrawal") and amount > money.money(cfg["max_withdrawal"]):
        raise HTTPException(status_code=400, detail=f"Maximum withdrawal is Rs.{cfg.get('max_withdrawal')}")
    dup = await db[_WD].find_one({"agent_id": user["id"], "status": "pending"})
    if dup:
        raise HTTPException(status_code=400, detail="You already have a pending withdrawal request")
    summary = await wallet_summary(user["id"])
    if amount > summary["available"]:
        raise HTTPException(status_code=400, detail="Insufficient withdrawable balance")
    wid = new_id()
    doc = {
        "id": wid, "agent_id": user["id"], "agent_name": fresh.get("name"),
        "amount": amount, "method": "bank", "bank": bank,
        "status": "pending", "reason": "", "requested_at": now_iso(),
        "processed_at": None, "processed_by": None,
    }
    await db[_WD].insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


async def list_withdrawals(agent_id: str):
    rows = await db[_WD].find({"agent_id": agent_id}, {"_id": 0}).sort("requested_at", -1).to_list(500)
    return {"withdrawals": rows}


# ── admin management ───────────────────────────────────────────────────────────
async def admin_list_withdrawals(status: str = ""):
    q = {}
    if status in ("pending", "approved", "rejected"):
        q["status"] = status
    rows = await db[_WD].find(q, {"_id": 0}).sort("requested_at", -1).to_list(1000)
    stats = {
        "pending": await db[_WD].count_documents({"status": "pending"}),
        "approved": await db[_WD].count_documents({"status": "approved"}),
        "rejected": await db[_WD].count_documents({"status": "rejected"}),
    }
    return {"withdrawals": rows, "stats": stats}


async def admin_process_withdrawal(admin: dict, wid: str, action: str, reason: str = ""):
    wd = await db[_WD].find_one({"id": wid}, {"_id": 0})
    if not wd:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if wd.get("status") != "pending":
        raise HTTPException(status_code=400, detail="This request is already processed")
    if action == "approve":
        await db[_WD].update_one({"id": wid}, {"$set": {
            "status": "approved", "processed_at": now_iso(), "processed_by": admin.get("id")}})
    elif action == "reject":
        await db[_WD].update_one({"id": wid}, {"$set": {
            "status": "rejected", "reason": reason or "Rejected by admin",
            "processed_at": now_iso(), "processed_by": admin.get("id")}})
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
    return await db[_WD].find_one({"id": wid}, {"_id": 0})


async def admin_verify_bank(admin: dict, agent_id: str, verified: bool = True):
    agent = await db.users.find_one({"id": agent_id, "role": "agent"}, {"_id": 0})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    bank = agent.get("agent_bank")
    if not bank:
        raise HTTPException(status_code=400, detail="Agent has not submitted bank details yet")
    bank["verified"] = bool(verified)
    bank["verified_at"] = now_iso() if verified else None
    await db.users.update_one({"id": agent_id}, {"$set": {"agent_bank": bank}})
    return {"ok": True, "bank": bank}


async def admin_agent_detail(agent_id: str):
    agent = await db.users.find_one({"id": agent_id, "role": "agent"}, {"_id": 0})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    summary = await wallet_summary(agent_id)
    earns = await db[_EARN].find({"agent_id": agent_id}, {"_id": 0}).sort("at", -1).to_list(500)
    wds = await db[_WD].find({"agent_id": agent_id}, {"_id": 0}).sort("requested_at", -1).to_list(500)
    # shops mapped (unique)
    shops = {}
    for e in earns:
        mid = e.get("merchant_id")
        if mid and mid not in shops:
            shops[mid] = {"merchant_id": mid, "merchant_name": e.get("merchant_name"),
                          "merchant_code": e.get("merchant_code"), "count": 0}
        if mid:
            shops[mid]["count"] += 1
    return {
        "agent": {"id": agent["id"], "name": agent.get("name"), "phone": agent.get("phone"),
                  "agent_active": bool(agent.get("agent_active", True)),
                  "assigned_batch_ids": list(agent.get("assigned_batch_ids") or []),
                  "bank": agent.get("agent_bank")},
        "wallet": summary,
        "earnings": earns,
        "withdrawals": wds,
        "shops": list(shops.values()),
    }
