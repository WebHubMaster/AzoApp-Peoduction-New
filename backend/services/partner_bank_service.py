"""Partner finance KYC — PAN card + bank accounts verification (Point 7).

A partner must have a VERIFIED PAN and at least one VERIFIED bank account before
they can withdraw. Partners can add multiple bank accounts and mark one primary
(used at withdrawal time). Admin reviews & approves/rejects each with a reason.
"""
from fastapi import HTTPException
from config.database import db, now_iso
from models.user import new_id
from services import profile_audit_service as pa
from services import storage_service


# ---------------------------------------------------------------- PAN
async def get_pan(partner_id):
    return await db.partner_pan.find_one({"partner_id": partner_id}, {"_id": 0})


async def submit_pan(partner, pan_number, pan_url):
    pan_number = (pan_number or "").strip().upper()
    import re
    if not re.match(r"^[A-Z]{5}[0-9]{4}[A-Z]$", pan_number):
        raise HTTPException(400, "Enter a valid 10-character PAN number")
    if not pan_url:
        raise HTTPException(400, "Please upload your PAN card image")
    existing = await db.partner_pan.find_one({"partner_id": partner["id"]}, {"_id": 0})
    doc = {"partner_id": partner["id"], "partner_name": partner.get("name"),
           "pan_number": pan_number, "pan_url": pan_url, "status": "pending",
           "reason": "", "submitted_at": now_iso(), "reviewed_at": None}
    if existing:
        if existing.get("status") == "approved":
            raise HTTPException(400, "Your PAN is already verified and locked")
        if existing.get("status") == "pending":
            raise HTTPException(400, "Your PAN is already submitted and under review. You can resubmit only if it is rejected.")
        await db.partner_pan.update_one({"partner_id": partner["id"]}, {"$set": doc})
    else:
        doc["id"] = new_id()
        await db.partner_pan.insert_one(dict(doc))
    await _notify_admins(partner, "PAN verification request",
                         f"{partner.get('name')} submitted a PAN card for verification.")
    try:
        await pa.record(partner, [{"field": "pan", "label": "PAN submitted", "masked": True,
                                   "old": None, "new": ("••••" + pan_number[-4:]) if pan_number else None}],
                        section="bank")
    except Exception:
        pass
    doc.pop("_id", None)
    return doc


# ---------------------------------------------------------------- bank accounts
async def list_banks(partner_id):
    return await db.partner_bank_accounts.find(
        {"partner_id": partner_id}, {"_id": 0}).sort("created_at", 1).to_list(50)


async def add_bank(partner, data: dict):
    holder = (data.get("account_holder") or "").strip()
    bank_name = (data.get("bank_name") or "").strip()
    acc = (data.get("account_number") or "").strip()
    ifsc = (data.get("ifsc") or "").strip().upper()
    upi = (data.get("upi_id") or "").strip()
    passbook = data.get("passbook_url") or ""
    if not (holder and bank_name and acc and ifsc):
        raise HTTPException(400, "Account holder, bank name, account number and IFSC are required")
    if not passbook:
        raise HTTPException(400, "Please upload your bank passbook / cheque image")
    try:
        passbook = await storage_service.materialize_data_url(passbook, storage_service.entity_folder("partners", partner, "kyc"), max_side=1800)
    except ValueError as e:
        raise HTTPException(400, str(e))
    count = await db.partner_bank_accounts.count_documents({"partner_id": partner["id"]})
    doc = {"id": new_id(), "partner_id": partner["id"], "partner_name": partner.get("name"),
           "account_holder": holder, "bank_name": bank_name, "account_number": acc,
           "ifsc": ifsc, "upi_id": upi, "passbook_url": passbook,
           "is_primary": count == 0, "status": "pending", "reason": "",
           "submitted_at": now_iso(), "reviewed_at": None, "created_at": now_iso()}
    await db.partner_bank_accounts.insert_one(dict(doc))
    await pa.record(partner, [{"field": "bank_account", "label": "Bank account added", "masked": True, "old": None, "new": None}], section="bank")
    await _notify_admins(partner, "Bank verification request",
                         f"{partner.get('name')} added a bank account for verification.")
    doc.pop("_id", None)
    return doc


async def update_bank(partner, bank_id, data: dict):
    b = await db.partner_bank_accounts.find_one({"id": bank_id, "partner_id": partner["id"]}, {"_id": 0})
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
            upd["passbook_url"] = await storage_service.materialize_data_url(upd["passbook_url"], storage_service.entity_folder("partners", partner, "kyc"), max_side=1800)
        except ValueError as e:
            raise HTTPException(400, str(e))
    # editing sensitive fields resets verification
    if any(k in upd for k in ("account_number", "ifsc", "account_holder", "bank_name", "passbook_url")):
        upd["status"] = "pending"
        upd["reason"] = ""
    upd["updated_at"] = now_iso()
    await db.partner_bank_accounts.update_one({"id": bank_id}, {"$set": upd})
    await pa.record(partner, [{"field": "bank_account", "label": "Bank account updated", "masked": True, "old": None, "new": None}], section="bank")
    return await db.partner_bank_accounts.find_one({"id": bank_id}, {"_id": 0})


async def delete_bank(partner, bank_id):
    b = await db.partner_bank_accounts.find_one({"id": bank_id, "partner_id": partner["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Bank account not found")
    await db.partner_bank_accounts.delete_one({"id": bank_id})
    await pa.record(partner, [{"field": "bank_account", "label": "Bank account removed", "masked": True, "old": None, "new": None}], section="bank")
    # if we removed the primary, promote another
    if b.get("is_primary"):
        nxt = await db.partner_bank_accounts.find_one({"partner_id": partner["id"]}, {"_id": 0})
        if nxt:
            await db.partner_bank_accounts.update_one({"id": nxt["id"]}, {"$set": {"is_primary": True}})
    return {"ok": True}


async def set_primary_bank(partner, bank_id):
    b = await db.partner_bank_accounts.find_one({"id": bank_id, "partner_id": partner["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Bank account not found")
    if b.get("status") != "approved":
        raise HTTPException(400, "Only a verified bank account can be set as primary")
    await db.partner_bank_accounts.update_many({"partner_id": partner["id"]}, {"$set": {"is_primary": False}})
    await db.partner_bank_accounts.update_one({"id": bank_id}, {"$set": {"is_primary": True}})
    return {"ok": True}


# ---------------------------------------------------------------- admin review
async def admin_pending_requests(partner_id=None):
    """All finance verification requests (PAN + banks). Optionally scoped to a partner."""
    q = {} if not partner_id else {"partner_id": partner_id}
    banks = await db.partner_bank_accounts.find(q, {"_id": 0}).sort("submitted_at", -1).to_list(1000)
    pans = await db.partner_pan.find(q, {"_id": 0}).sort("submitted_at", -1).to_list(1000)
    return {"banks": banks, "pans": pans}


async def admin_pending_kyc():
    """Only PENDING PAN + bank requests across ALL partners, enriched with the
    partner's name/phone — powers the admin Bulk Verify screen."""
    pans = await db.partner_pan.find({"status": "pending"}, {"_id": 0}).sort("submitted_at", 1).to_list(1000)
    banks = await db.partner_bank_accounts.find({"status": "pending"}, {"_id": 0}).sort("submitted_at", 1).to_list(1000)
    pids = list({*(p["partner_id"] for p in pans), *(b["partner_id"] for b in banks)})
    users = await db.users.find({"id": {"$in": pids}}, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(1000)
    umap = {u["id"]: u for u in users}

    def _enrich(row):
        u = umap.get(row["partner_id"], {})
        return {**row, "partner_name": u.get("name", ""), "partner_phone": u.get("phone", "")}

    return {"pans": [_enrich(p) for p in pans], "banks": [_enrich(b) for b in banks],
            "counts": {"pans": len(pans), "banks": len(banks), "total": len(pans) + len(banks)}}


async def bulk_review(admin, pan_partner_ids=None, bank_ids=None, action="approve", reason=""):
    """Approve/reject many pending PAN + bank requests in one shot."""
    pan_partner_ids = pan_partner_ids or []
    bank_ids = bank_ids or []
    if action == "reject" and not (reason or "").strip():
        raise HTTPException(400, "Rejection reason is required")
    done = {"pans": 0, "banks": 0, "errors": []}
    for pid in pan_partner_ids:
        try:
            await admin_review_pan(admin, pid, action, reason)
            done["pans"] += 1
        except Exception as e:  # noqa: BLE001
            done["errors"].append({"type": "pan", "partner_id": pid, "error": str(getattr(e, "detail", e))})
    for bid in bank_ids:
        try:
            await admin_review_bank(admin, bid, action, reason)
            done["banks"] += 1
        except Exception as e:  # noqa: BLE001
            done["errors"].append({"type": "bank", "bank_id": bid, "error": str(getattr(e, "detail", e))})
    return {"ok": True, **done}


async def admin_review_pan(admin, partner_id, action, reason=""):
    p = await db.partner_pan.find_one({"partner_id": partner_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "PAN request not found")
    if action == "reject" and not (reason or "").strip():
        raise HTTPException(400, "Rejection reason is required")
    status = "approved" if action == "approve" else "rejected"
    await db.partner_pan.update_one({"partner_id": partner_id},
                                    {"$set": {"status": status, "reason": reason.strip(),
                                              "reviewed_at": now_iso(), "reviewed_by": admin.get("id")}})
    await _notify_partner(partner_id, f"PAN {status}",
                          "Your PAN card has been verified." if status == "approved"
                          else f"Your PAN was rejected: {reason.strip()}")
    return {"ok": True, "status": status}


async def admin_review_bank(admin, bank_id, action, reason=""):
    b = await db.partner_bank_accounts.find_one({"id": bank_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Bank account not found")
    if action == "reject" and not (reason or "").strip():
        raise HTTPException(400, "Rejection reason is required")
    status = "approved" if action == "approve" else "rejected"
    await db.partner_bank_accounts.update_one({"id": bank_id},
                                              {"$set": {"status": status, "reason": reason.strip(),
                                                        "reviewed_at": now_iso(), "reviewed_by": admin.get("id")}})
    await _notify_partner(b["partner_id"], f"Bank account {status}",
                          "Your bank account has been verified." if status == "approved"
                          else f"Your bank account was rejected: {reason.strip()}")
    return {"ok": True, "status": status}


# ---------------------------------------------------------------- eligibility
async def withdrawal_eligibility(partner_id):
    pan = await db.partner_pan.find_one({"partner_id": partner_id}, {"_id": 0})
    banks = await db.partner_bank_accounts.find({"partner_id": partner_id}, {"_id": 0}).to_list(50)
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


# ---------------------------------------------------------------- helpers
async def _notify_admins(partner, title, body):
    admins = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(50)
    for adm in admins:
        await db.notifications.insert_one({
            "id": new_id(), "user_id": adm["id"], "audience": "user",
            "title": title, "body": body, "link": "/admin", "read": False,
            "created_at": now_iso()})


async def _notify_partner(partner_id, title, body):
    from services.notification_service import notify
    try:
        await notify(partner_id, title, body, link="/partner")
    except Exception:  # noqa: BLE001
        await db.notifications.insert_one({
            "id": new_id(), "user_id": partner_id, "audience": "user",
            "title": title, "body": body, "link": "/partner", "read": False,
            "created_at": now_iso()})
