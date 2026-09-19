"""Merchant wallet + withdrawal engine — mirrors partner_service wallet logic.

Withdrawal methods: UPI / Bank / Cheque. Admin approves or rejects (amount is
locked as a pending ledger debit on request and finalised on approval, released
on rejection).
"""
from fastapi import HTTPException
from datetime import datetime, timezone, timedelta
from config.database import db, now_iso
from models.user import new_id
from services.notification_service import notify
from services import money

DEFAULT_WALLET_CONFIG = {
    "id": "config", "min_withdrawal": 100, "max_withdrawal": 50000,
    "processing_fee_pct": 0, "processing_fee_flat": 0,
    "upi_enabled": True, "bank_enabled": True, "cheque_enabled": True,
}


async def get_wallet_config():
    cfg = await db.merchant_wallet_config.find_one({"id": "config"}, {"_id": 0})
    if not cfg:
        cfg = dict(DEFAULT_WALLET_CONFIG)
        await db.merchant_wallet_config.insert_one(dict(cfg))
        cfg.pop("_id", None)
    return cfg


async def update_wallet_config(admin, data: dict):
    data = {k: v for k, v in data.items() if v is not None and k != "id"}
    await db.merchant_wallet_config.update_one({"id": "config"}, {"$set": data}, upsert=True)
    return await get_wallet_config()


async def _earn_totals(mid: str):
    rows = await db.commission_ledger.find(
        {"$or": [{"referral_merchant_id": mid}, {"customer_merchant_id": mid}]},
        {"_id": 0}).to_list(3000)
    tot_ref = tot_cust = 0.0
    for l in rows:
        if l.get("referral_merchant_id") == mid:
            tot_ref = money.add(tot_ref, l.get("merchant_referral", 0))
        if l.get("customer_merchant_id") == mid:
            tot_cust = money.add(tot_cust, l.get("merchant_customer", l.get("merchant_booking", 0)))
    return money.money(tot_ref), money.money(tot_cust)


async def wallet_summary(merchant):
    mid = merchant["id"]
    balance = float(merchant.get("wallet_balance", 0))
    wds = await db.merchant_withdrawals.find({"merchant_id": mid}, {"_id": 0}).to_list(500)
    locked = money.add(*[w["amount"] for w in wds if w["status"] == "pending"])
    total_withdrawn = money.add(*[w["net_amount"] for w in wds if w["status"] == "completed"])
    tot_ref, tot_cust = await _earn_totals(mid)
    ledger = await db.merchant_ledger.find({"merchant_id": mid}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {
        "available_balance": money.money(balance),
        "withdrawable_balance": max(money.add(balance, -locked), 0.0),
        "pending_balance": money.money(locked),
        "total_earned": money.add(tot_ref, tot_cust),
        "total_referral": tot_ref, "total_customer": tot_cust,
        "total_withdrawn": money.money(total_withdrawn),
        "ledger": ledger,
    }


async def request_withdrawal(merchant, amount, method, upi_id="", bank=None, cheque=None):
    # Gate 1: merchant profile must be admin-approved
    from services import merchant_reg_service as mrs
    await mrs.assert_merchant_approved(merchant)
    # Gate 2: Bank & KYC (verified PAN + at least one verified bank) — partner-style
    from services import merchant_bank_service as mbs
    elig = await mbs.finance_state(merchant["id"])
    if not elig["eligible"]:
        raise HTTPException(400, "Complete Bank & KYC verification and get it approved before withdrawing: "
                            + ", ".join(elig["blockers"]))
    cfg = await get_wallet_config()
    method = (method or "").lower()
    # UPI payouts permanently removed — bank account only (cheque kept for legacy admin flows).
    if method not in ("bank", "cheque"):
        raise HTTPException(400, "Payouts are sent to your verified bank account only. UPI payout is not supported.")
    if not cfg.get(f"{method}_enabled", True):
        raise HTTPException(400, f"{method.upper()} withdrawal is disabled")
    try:
        amount = money.money(amount)
    except (TypeError, ValueError):
        raise HTTPException(400, "Invalid amount")
    if amount < cfg.get("min_withdrawal", 0):
        raise HTTPException(400, f"Minimum withdrawal is ₹{cfg.get('min_withdrawal')}")
    if cfg.get("max_withdrawal") and amount > cfg["max_withdrawal"]:
        raise HTTPException(400, f"Maximum withdrawal is ₹{cfg.get('max_withdrawal')}")
    if method == "upi" and not (upi_id or "").strip():
        raise HTTPException(400, "UPI ID required")
    if method == "bank" and not (bank and bank.get("account_number")):
        raise HTTPException(400, "Bank details required")
    dup = await db.merchant_withdrawals.find_one({"merchant_id": merchant["id"], "status": "pending"})
    if dup:
        raise HTTPException(400, "You already have a pending withdrawal request")
    summary = await wallet_summary(merchant)
    if amount > summary["withdrawable_balance"]:
        raise HTTPException(400, "Insufficient withdrawable balance")
    fee = money.add(money.pct(amount, cfg.get("processing_fee_pct", 0) or 0), cfg.get("processing_fee_flat", 0) or 0)
    wid = new_id()
    doc = {"id": wid, "merchant_id": merchant["id"], "merchant_name": merchant.get("shop_name") or merchant.get("name"),
           "amount": amount, "fee": fee, "net_amount": money.add(amount, -fee),
           "method": method, "upi_id": upi_id or "", "bank": bank or {}, "cheque": cheque or {},
           "status": "pending", "reason": "", "requested_at": now_iso(),
           "processed_at": None, "processed_by": None}
    await db.merchant_withdrawals.insert_one(dict(doc))
    await db.merchant_ledger.insert_one({
        "id": new_id(), "merchant_id": merchant["id"], "kind": "withdrawal", "direction": "debit",
        "amount": amount, "ref_type": "withdrawal", "ref_id": wid,
        "note": f"Withdrawal request ({method.upper()})", "status": "pending", "created_at": now_iso()})
    doc.pop("_id", None)
    await notify(merchant["id"], "Withdrawal request received",
                 f"Your withdrawal request of ₹{amount} ({method.upper()}) is pending admin approval.",
                 link="/merchant",
                 sms_text=f"AzoApp: We received your withdrawal request of Rs.{amount} via {method.upper()}. You'll be notified once it's processed.")
    return doc


async def list_withdrawals(merchant_id=None, status=None):
    q = {}
    if merchant_id:
        q["merchant_id"] = merchant_id
    if status:
        q["status"] = status
    return await db.merchant_withdrawals.find(q, {"_id": 0}).sort("requested_at", -1).to_list(500)


async def process_withdrawal(admin, wid, action, reason=""):
    w = await db.merchant_withdrawals.find_one({"id": wid}, {"_id": 0})
    if not w:
        raise HTTPException(404, "Withdrawal not found")
    if w["status"] != "pending":
        raise HTTPException(400, "Already processed")
    if action == "approve":
        await db.users.update_one({"id": w["merchant_id"]}, {"$inc": {"wallet_balance": -w["amount"]}})
        await db.merchant_ledger.update_one(
            {"ref_id": wid, "kind": "withdrawal"},
            {"$set": {"status": "completed", "note": f"Withdrawal paid ({w['method'].upper()})"}})
        await db.merchant_withdrawals.update_one(
            {"id": wid}, {"$set": {"status": "completed", "processed_at": now_iso(),
                                   "processed_by": admin.get("id")}})
        await db.transactions.insert_one({
            "id": new_id(), "user_id": w["merchant_id"], "amount": w["amount"], "type": "debit",
            "kind": "withdrawal", "note": f"Withdrawal {w['method'].upper()}", "created_at": now_iso()})
        _pm = {"upi": "UPI", "bank": "bank account", "cheque": "cheque"}.get(w["method"], w["method"])
        await notify(w["merchant_id"], "Withdrawal approved ✅",
                     f"₹{w['net_amount']} is on its way via {_pm}.", link="/merchant",
                     sms_text=f"AzoApp: Your withdrawal of Rs.{w['net_amount']} has been APPROVED and is being paid via {_pm}. Check your merchant wallet for details.")
        status = "completed"
    elif action == "reject":
        if not (reason or "").strip():
            raise HTTPException(400, "Rejection reason is required")
        await db.merchant_ledger.update_one({"ref_id": wid, "kind": "withdrawal"},
                                            {"$set": {"status": "cancelled"}})
        await db.merchant_withdrawals.update_one(
            {"id": wid}, {"$set": {"status": "rejected", "reason": reason,
                                   "processed_at": now_iso(), "processed_by": admin.get("id")}})
        await notify(w["merchant_id"], "Withdrawal rejected ❌",
                     reason or "Your withdrawal was rejected; the amount is available in your wallet.",
                     link="/merchant",
                     sms_text=f"AzoApp: Your withdrawal of Rs.{w['amount']} was REJECTED. Reason: {reason}. The amount is back in your wallet.")
        status = "rejected"
    else:
        raise HTTPException(400, "action must be approve|reject")
    await db.audit_logs.insert_one({
        "id": new_id(), "action": f"merchant.withdrawal.{status}", "actor_id": admin.get("id"),
        "actor_name": admin.get("name"), "target_id": w["merchant_id"],
        "meta": {"amount": w["amount"]}, "created_at": now_iso()})
    return await db.merchant_withdrawals.find_one({"id": wid}, {"_id": 0})


GST_RE = None
IFSC_RE = None


def _mask_acct(num: str) -> str:
    num = (num or "").strip()
    if len(num) < 4:
        return num
    return "XXXX XXXX " + num[-4:]


async def payout_state(merchant):
    """Return bank + KYC verification state for the first-withdrawal flow."""
    from services import merchant_reg_service as mrs
    p = await mrs.get_or_create_profile(merchant)
    bank = dict(p.get("bank") or {})
    if bank.get("account_number"):
        bank["account_masked"] = _mask_acct(bank["account_number"])
    docs = p.get("documents") or {}
    return {
        "payout_status": p.get("payout_status", "none"),
        "payout_rejection_reason": p.get("payout_rejection_reason", ""),
        "bank": bank,
        "documents": docs,
        "has_bank": bool(bank.get("account_number") and bank.get("ifsc")),
        "has_kyc": bool(docs.get("pan_number") and docs.get("pan_url")),
    }


async def save_payout(merchant, data: dict):
    """Save bank details + KYC docs and submit for admin verification."""
    from services import merchant_reg_service as mrs
    import re as _re
    p = await mrs.get_or_create_profile(merchant)
    bank_in = data.get("bank") or {}
    acct = (bank_in.get("account_number") or "").strip()
    cacct = (bank_in.get("confirm_account_number") or acct).strip()
    if acct and acct != cacct:
        raise HTTPException(400, "Account number and confirmation do not match")
    ifsc = (bank_in.get("ifsc") or "").strip().upper()
    if ifsc and not _re.match(r"^[A-Z]{4}0[A-Z0-9]{6}$", ifsc):
        raise HTTPException(400, "Please enter a valid IFSC code")
    bank = {
        "account_holder": (bank_in.get("account_holder") or "").strip(),
        "bank_name": (bank_in.get("bank_name") or "").strip(),
        "account_number": acct, "ifsc": ifsc,
        "account_type": (bank_in.get("account_type") or "savings").strip().lower(),
        "upi_id": (bank_in.get("upi_id") or "").strip(),
    }
    docs_in = data.get("documents") or {}
    pan = (docs_in.get("pan_number") or "").strip().upper()
    if pan and not mrs.pan_valid(pan):
        raise HTTPException(400, "Please enter a valid PAN number (e.g. ABCDE1234F)")
    documents = {
        "pan_number": pan, "pan_url": docs_in.get("pan_url", ""),
        "aadhaar_number": _re.sub(r"\D", "", str(docs_in.get("aadhaar_number", ""))),
        "aadhaar_front_url": docs_in.get("aadhaar_front_url", ""),
        "aadhaar_back_url": docs_in.get("aadhaar_back_url", ""),
    }
    submit = bool(data.get("submit"))
    upd = {"bank": bank, "documents": {**(p.get("documents") or {}), **documents},
           "updated_at": now_iso()}
    if submit:
        if not (bank["account_holder"] and bank["account_number"] and bank["ifsc"] and bank["bank_name"]):
            raise HTTPException(400, "Please complete all bank details")
        if not (pan and documents["pan_url"]):
            raise HTTPException(400, "Please provide PAN number and PAN document")
        upd["payout_status"] = "pending"
        upd["payout_rejection_reason"] = ""
        upd["payout_submitted_at"] = now_iso()
    await db.merchant_profiles.update_one({"user_id": merchant["id"]}, {"$set": upd})
    if submit:
        for adm in await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(50):
            await db.notifications.insert_one({
                "id": new_id(), "user_id": adm["id"], "audience": "user",
                "title": "Merchant Bank & KYC submitted",
                "body": f"{merchant.get('shop_name') or merchant.get('name')} submitted payout verification.",
                "link": "/admin", "read": False, "created_at": now_iso()})
    return await payout_state(merchant)


async def admin_process_payout(admin, merchant_id, action, reason=""):
    p = await db.merchant_profiles.find_one({"user_id": merchant_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Merchant profile not found")
    if action == "approve":
        await db.merchant_profiles.update_one(
            {"user_id": merchant_id},
            {"$set": {"payout_status": "approved", "payout_rejection_reason": "",
                      "payout_reviewed_at": now_iso()}})
        await notify(merchant_id, "Bank & KYC Approved ✅",
                     "Your payout verification is approved. You can now withdraw money.",
                     link="/merchant")
        st = "approved"
    elif action == "reject":
        if not (reason or "").strip():
            raise HTTPException(400, "Rejection reason is required")
        await db.merchant_profiles.update_one(
            {"user_id": merchant_id},
            {"$set": {"payout_status": "rejected", "payout_rejection_reason": reason.strip(),
                      "payout_reviewed_at": now_iso()}})
        await notify(merchant_id, "Bank & KYC — Action Needed",
                     f"Your payout verification needs correction: {reason.strip()}",
                     link="/merchant")
        st = "rejected"
    else:
        raise HTTPException(400, "action must be approve|reject")
    await db.audit_logs.insert_one({
        "id": new_id(), "action": f"merchant.payout.{st}", "actor_id": admin.get("id"),
        "actor_name": admin.get("name"), "target_id": merchant_id, "created_at": now_iso()})
    return {"ok": True, "payout_status": st}


async def admin_pending_payouts():
    rows = await db.merchant_profiles.find(
        {"payout_status": "pending"}, {"_id": 0}).to_list(500)
    out = []
    for p in rows:
        u = await db.users.find_one({"id": p["user_id"]},
                                    {"_id": 0, "name": 1, "phone": 1, "shop_name": 1})
        out.append({"user_id": p["user_id"], "user": u or {},
                    "bank": p.get("bank", {}), "documents": p.get("documents", {}),
                    "payout_submitted_at": p.get("payout_submitted_at")})
    return out


async def admin_withdrawal_stats():
    wds = await db.merchant_withdrawals.find({}, {"_id": 0}).to_list(2000)
    return {
        "pending": len([w for w in wds if w["status"] == "pending"]),
        "pending_amount": money.add(*[w["amount"] for w in wds if w["status"] == "pending"]),
        "completed": len([w for w in wds if w["status"] == "completed"]),
        "total_paid": money.add(*[w["net_amount"] for w in wds if w["status"] == "completed"]),
    }
