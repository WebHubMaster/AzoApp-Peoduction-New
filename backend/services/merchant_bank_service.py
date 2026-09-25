"""Merchant finance KYC — PAN card + bank accounts verification.

Mirrors partner_bank_service. A merchant must have a VERIFIED PAN and at least
one VERIFIED bank account before they can withdraw. Merchants can add multiple
bank accounts and mark one primary. Admin reviews & approves/rejects each with a
reason from the merchant's admin profile (Bank & KYC tab).
"""
import re
from fastapi import HTTPException
from config.database import db, now_iso
from models.user import new_id
from services import profile_audit_service as pa
from services import storage_service


def _mname(merchant):
    return merchant.get("shop_name") or merchant.get("name")


# ---------------------------------------------------------------- PAN
async def get_pan(merchant_id):
    return await db.merchant_pan.find_one({"merchant_id": merchant_id}, {"_id": 0})


async def submit_pan(merchant, pan_number, pan_url):
    pan_number = (pan_number or "").strip().upper()
    if not re.match(r"^[A-Z]{5}[0-9]{4}[A-Z]$", pan_number):
        raise HTTPException(400, "Enter a valid 10-character PAN number")
    if not pan_url:
        raise HTTPException(400, "Please upload your PAN card image")
    existing = await db.merchant_pan.find_one({"merchant_id": merchant["id"]}, {"_id": 0})
    doc = {"merchant_id": merchant["id"], "merchant_name": _mname(merchant),
           "pan_number": pan_number, "pan_url": pan_url, "status": "pending",
           "reason": "", "submitted_at": now_iso(), "reviewed_at": None}
    if existing:
        if existing.get("status") == "approved":
            raise HTTPException(400, "Your PAN is already verified and locked")
        await db.merchant_pan.update_one({"merchant_id": merchant["id"]}, {"$set": doc})
    else:
        doc["id"] = new_id()
        await db.merchant_pan.insert_one(dict(doc))
    await _notify_admins(merchant, "Merchant PAN verification request",
                         f"{_mname(merchant)} submitted a PAN card for verification.")
    doc.pop("_id", None)
    return doc


# ---------------------------------------------------------------- bank accounts
async def list_banks(merchant_id):
    return await db.merchant_bank_accounts.find(
        {"merchant_id": merchant_id}, {"_id": 0}).sort("created_at", 1).to_list(50)


async def add_bank(merchant, data: dict):
    holder = (data.get("account_holder") or "").strip()
    bank_name = (data.get("bank_name") or "").strip()
    acc = (data.get("account_number") or "").strip()
    ifsc = (data.get("ifsc") or "").strip().upper()
    upi = (data.get("upi_id") or "").strip()
    passbook = data.get("passbook_url") or ""
    if not (holder and bank_name and acc and ifsc):
        raise HTTPException(400, "Account holder, bank name, account number and IFSC are required")
    if not re.match(r"^[A-Z]{4}0[A-Z0-9]{6}$", ifsc):
        raise HTTPException(400, "Please enter a valid IFSC code")
    if not passbook:
        raise HTTPException(400, "Please upload your bank passbook / cheque image")
    try:
        passbook = await storage_service.materialize_data_url(passbook, storage_service.entity_folder("merchants", merchant, "kyc"), max_side=1800)
    except ValueError as e:
        raise HTTPException(400, str(e))
    count = await db.merchant_bank_accounts.count_documents({"merchant_id": merchant["id"]})
    doc = {"id": new_id(), "merchant_id": merchant["id"], "merchant_name": _mname(merchant),
           "account_holder": holder, "bank_name": bank_name, "account_number": acc,
           "ifsc": ifsc, "upi_id": upi, "passbook_url": passbook,
           "is_primary": count == 0, "status": "pending", "reason": "",
           "submitted_at": now_iso(), "reviewed_at": None, "created_at": now_iso()}
    await db.merchant_bank_accounts.insert_one(dict(doc))
    await pa.record(merchant, [{"field": "bank_account", "label": "Bank account added", "masked": True, "old": None, "new": None}], section="bank")
    await _notify_admins(merchant, "Merchant bank verification request",
                         f"{_mname(merchant)} added a bank account for verification.")
    doc.pop("_id", None)
    return doc


async def update_bank(merchant, bank_id, data: dict):
    b = await db.merchant_bank_accounts.find_one({"id": bank_id, "merchant_id": merchant["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Bank account not found")
    upd = {}
    for f in ("account_holder", "bank_name", "account_number", "upi_id", "passbook_url"):
        if f in data and data[f] is not None:
            upd[f] = str(data[f]).strip()
    if "ifsc" in data and data["ifsc"]:
        upd["ifsc"] = str(data["ifsc"]).strip().upper()
    if upd.get("passbook_url"):
        try:
            upd["passbook_url"] = await storage_service.materialize_data_url(upd["passbook_url"], storage_service.entity_folder("merchants", merchant, "kyc"), max_side=1800)
        except ValueError as e:
            raise HTTPException(400, str(e))
    if any(k in upd for k in ("account_number", "ifsc", "account_holder", "bank_name", "passbook_url")):
        upd["status"] = "pending"
        upd["reason"] = ""
    upd["updated_at"] = now_iso()
    await db.merchant_bank_accounts.update_one({"id": bank_id}, {"$set": upd})
    await pa.record(merchant, [{"field": "bank_account", "label": "Bank account updated", "masked": True, "old": None, "new": None}], section="bank")
    return await db.merchant_bank_accounts.find_one({"id": bank_id}, {"_id": 0})


async def delete_bank(merchant, bank_id):
    b = await db.merchant_bank_accounts.find_one({"id": bank_id, "merchant_id": merchant["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Bank account not found")
    await db.merchant_bank_accounts.delete_one({"id": bank_id})
    await pa.record(merchant, [{"field": "bank_account", "label": "Bank account removed", "masked": True, "old": None, "new": None}], section="bank")
    if b.get("is_primary"):
        nxt = await db.merchant_bank_accounts.find_one({"merchant_id": merchant["id"]}, {"_id": 0})
        if nxt:
            await db.merchant_bank_accounts.update_one({"id": nxt["id"]}, {"$set": {"is_primary": True}})
    return {"ok": True}


async def set_primary_bank(merchant, bank_id):
    b = await db.merchant_bank_accounts.find_one({"id": bank_id, "merchant_id": merchant["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Bank account not found")
    if b.get("status") != "approved":
        raise HTTPException(400, "Only a verified bank account can be set as primary")
    await db.merchant_bank_accounts.update_many({"merchant_id": merchant["id"]}, {"$set": {"is_primary": False}})
    await db.merchant_bank_accounts.update_one({"id": bank_id}, {"$set": {"is_primary": True}})
    return {"ok": True}


# ---------------------------------------------------------------- eligibility
async def finance_state(merchant_id):
    pan = await db.merchant_pan.find_one({"merchant_id": merchant_id}, {"_id": 0})
    banks = await db.merchant_bank_accounts.find({"merchant_id": merchant_id}, {"_id": 0}).sort("created_at", 1).to_list(50)
    pan_ok = bool(pan and pan.get("status") == "approved")
    verified_banks = [b for b in banks if b.get("status") == "approved"]
    blockers = []
    if not pan_ok:
        blockers.append("PAN card not verified")
    if not verified_banks:
        blockers.append("No verified bank account")
    return {"eligible": pan_ok and bool(verified_banks), "blockers": blockers,
            "pan": pan, "banks": banks,
            "primary_bank": next((b for b in verified_banks if b.get("is_primary")),
                                 verified_banks[0] if verified_banks else None)}


# ---------------------------------------------------------------- admin review
async def admin_pending_requests(merchant_id=None):
    q = {} if not merchant_id else {"merchant_id": merchant_id}
    banks = await db.merchant_bank_accounts.find(q, {"_id": 0}).sort("submitted_at", -1).to_list(1000)
    pans = await db.merchant_pan.find(q, {"_id": 0}).sort("submitted_at", -1).to_list(1000)
    return {"banks": banks, "pans": pans}


async def admin_review_pan(admin, merchant_id, action, reason=""):
    p = await db.merchant_pan.find_one({"merchant_id": merchant_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "PAN request not found")
    if action == "reject" and not (reason or "").strip():
        raise HTTPException(400, "Rejection reason is required")
    status = "approved" if action == "approve" else "rejected"
    await db.merchant_pan.update_one({"merchant_id": merchant_id},
                                     {"$set": {"status": status, "reason": reason.strip(),
                                               "reviewed_at": now_iso(), "reviewed_by": admin.get("id")}})
    await _notify_merchant(merchant_id, f"PAN {status}",
                           "Your PAN card has been verified." if status == "approved"
                           else f"Your PAN was rejected: {reason.strip()}")
    return {"ok": True, "status": status}


async def admin_review_bank(admin, bank_id, action, reason=""):
    b = await db.merchant_bank_accounts.find_one({"id": bank_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Bank account not found")
    if action == "reject" and not (reason or "").strip():
        raise HTTPException(400, "Rejection reason is required")
    status = "approved" if action == "approve" else "rejected"
    await db.merchant_bank_accounts.update_one({"id": bank_id},
                                               {"$set": {"status": status, "reason": reason.strip(),
                                                         "reviewed_at": now_iso(), "reviewed_by": admin.get("id")}})
    await _notify_merchant(b["merchant_id"], f"Bank account {status}",
                           "Your bank account has been verified." if status == "approved"
                           else f"Your bank account was rejected: {reason.strip()}")
    return {"ok": True, "status": status}


# ---------------------------------------------------------------- helpers
async def _notify_admins(merchant, title, body):
    admins = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(50)
    for adm in admins:
        await db.notifications.insert_one({
            "id": new_id(), "user_id": adm["id"], "audience": "user",
            "title": title, "body": body, "link": "/admin", "read": False,
            "created_at": now_iso()})


async def _notify_merchant(merchant_id, title, body):
    from services.notification_service import notify
    try:
        await notify(merchant_id, title, body, link="/merchant")
    except Exception:  # noqa: BLE001
        await db.notifications.insert_one({
            "id": new_id(), "user_id": merchant_id, "audience": "user",
            "title": title, "body": body, "link": "/merchant", "read": False,
            "created_at": now_iso()})
