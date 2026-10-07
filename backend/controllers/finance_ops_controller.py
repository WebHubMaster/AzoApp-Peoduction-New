"""Unified Finance Operations — read/aggregation layer that powers the premium
admin Finance console. It UNIFIES partner + merchant withdrawals behind one shape,
and merges every real financial record (customer payments, withdrawals, refunds,
wallet ledger credits/debits, commissions, adjustments) into ONE chronological
ledger. Mutations are delegated to the existing, battle-tested services so the
money/gateway/idempotency rules stay exactly as they were."""
import re
from datetime import datetime, timezone
from fastapi import HTTPException
from config.database import db
from services.finance_intel_service import mask_acct, mask_upi, _days_since


# ----------------------------------------------------------------- withdrawals
def _norm_withdrawal(w: dict, account_type: str) -> dict:
    """Project a partner/merchant withdrawal doc into one unified shape."""
    method = (w.get("method") or "").lower()
    bank = w.get("bank") or {}
    acct = bank.get("account_number") or ""
    if method == "upi":
        destination = mask_upi(w.get("upi_id"))
    elif method == "cheque":
        destination = (w.get("cheque") or {}).get("payee") or "Cheque"
    else:
        destination = f"{bank.get('bank_name') or 'Bank'} · {mask_acct(acct)}"
    payout = w.get("payout") or {}
    return {
        "id": w.get("id"),
        "account_type": account_type,
        "code": w.get("code") or f"WD-{str(w.get('id') or '')[:8].upper()}",
        "user_id": w.get("partner_id") or w.get("merchant_id"),
        "name": w.get("partner_name") or w.get("merchant_name") or "—",
        "amount": w.get("amount"),
        "fee": w.get("fee"),
        "net_amount": w.get("net_amount"),
        "method": method,
        "destination": destination,
        "upi_masked": mask_upi(w.get("upi_id")) if w.get("upi_id") else "",
        "bank": ({"bank_name": bank.get("bank_name"), "account_masked": mask_acct(acct),
                  "ifsc": bank.get("ifsc")} if acct else {}),
        "status": w.get("status"),
        "reason": w.get("reason") or "",
        "requested_at": w.get("requested_at") or w.get("created_at"),
        "processed_at": w.get("processed_at"),
        "payout": {"payout_id": payout.get("payout_id"), "utr": payout.get("utr"),
                   "gateway": payout.get("gateway"), "status": payout.get("status"),
                   "failure_reason": payout.get("failure_reason") or payout.get("error"),
                   "simulated": payout.get("simulated")},
    }


async def list_withdrawals(account_type="", status="", method="", q="",
                           date_from="", date_to="", page=1, page_size=25):
    items = []
    if account_type in ("", "partner", "all"):
        for w in await db.partner_withdrawals.find({}, {"_id": 0}).sort("requested_at", -1).to_list(2000):
            items.append(_norm_withdrawal(w, "partner"))
    if account_type in ("", "merchant", "all"):
        for w in await db.merchant_withdrawals.find({}, {"_id": 0}).sort("requested_at", -1).to_list(2000):
            items.append(_norm_withdrawal(w, "merchant"))

    # ---- KPIs computed on the FULL (unfiltered-by-status) set, after date/search
    def _within(x):
        d = str(x.get("requested_at") or "")[:10]
        if date_from and d and d < date_from:
            return False
        if date_to and d and d > date_to:
            return False
        return True

    items = [x for x in items if _within(x)]
    if method:
        items = [x for x in items if x["method"] == method.lower()]
    if q:
        ql = q.strip().lower()
        items = [x for x in items if any(ql in str(v or "").lower() for v in (
            x["name"], x["code"], x["destination"], x["upi_masked"],
            (x["bank"] or {}).get("account_masked"), x["amount"],
            x["payout"].get("utr"), x["payout"].get("payout_id")))]

    items.sort(key=lambda x: str(x.get("requested_at") or ""), reverse=True)

    def _sum(pred):
        return round(sum(float(x.get("amount") or 0) for x in items if pred(x)), 2)

    paid = [x for x in items if x["status"] == "completed"]
    counts = {
        "all": len(items),
        "pending": sum(1 for x in items if x["status"] == "pending"),
        "completed": len(paid),
        "failed": sum(1 for x in items if x["status"] == "failed"),
        "rejected": sum(1 for x in items if x["status"] == "rejected"),
    }
    kpis = {
        "total_requested": round(sum(float(x.get("amount") or 0) for x in items), 2),
        "count_requested": len(items),
        "pending_amount": _sum(lambda x: x["status"] == "pending"),
        "count_pending": counts["pending"],
        "paid_amount": round(sum(float(x.get("net_amount") or 0) for x in paid), 2),
        "count_paid": counts["completed"],
        "failed_amount": _sum(lambda x: x["status"] == "failed"),
        "count_failed": counts["failed"],
        "rejected_amount": _sum(lambda x: x["status"] == "rejected"),
        "count_rejected": counts["rejected"],
        "total_fees": round(sum(float(x.get("fee") or 0) for x in paid), 2),
        "total_net_paid": round(sum(float(x.get("net_amount") or 0) for x in paid), 2),
    }

    if status and status != "all":
        items = [x for x in items if x["status"] == status]

    total = len(items)
    page = max(1, int(page)); page_size = min(100, max(1, int(page_size)))
    start = (page - 1) * page_size
    return {"items": items[start:start + page_size], "total": total,
            "page": page, "page_size": page_size,
            "counts": counts, "kpis": kpis}


# ----------------------------------------------------------- investigation 360
def _level(score):
    return "LOW" if score <= 30 else "MEDIUM" if score <= 60 else "HIGH" if score <= 80 else "CRITICAL"


async def withdrawal_investigation(account_type: str, wid: str) -> dict:
    if account_type == "partner":
        from services import finance_intel_service as fis
        data = await fis.withdrawal_investigation(wid)
        data["account_type"] = "partner"
        return data
    if account_type == "merchant":
        return await _merchant_investigation(wid)
    raise HTTPException(status_code=400, detail="Invalid account type")


async def _merchant_investigation(wid: str) -> dict:
    from services import merchant_wallet_service as mws
    w = await db.merchant_withdrawals.find_one({"id": wid}, {"_id": 0})
    if not w:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    mid = w["merchant_id"]
    owner = await db.users.find_one({"id": mid}, {"_id": 0}) or {}
    wallet = await mws.wallet_summary({"id": mid, "wallet_balance": owner.get("wallet_balance", 0)})
    ledger = wallet.pop("ledger", [])

    history = await db.merchant_withdrawals.find({"merchant_id": mid}, {"_id": 0}).sort("requested_at", -1).to_list(500)
    paid = [h for h in history if h.get("status") == "completed"]
    failed = [h for h in history if h.get("status") == "failed"]
    rejected = [h for h in history if h.get("status") == "rejected"]
    amts = [float(h.get("amount") or 0) for h in paid]
    hist_summary = {
        "total": len(history),
        "total_paid": round(sum(float(h.get("net_amount") or 0) for h in paid), 2),
        "count_paid": len(paid), "count_failed": len(failed), "count_rejected": len(rejected),
        "avg": round(sum(amts) / len(amts), 2) if amts else 0,
        "largest": round(max(amts), 2) if amts else 0,
    }
    txns = await db.transactions.find({"user_id": mid}, {"_id": 0}).sort("created_at", -1).to_list(25)
    audit = await db.audit_logs.find({"target_id": mid}, {"_id": 0}).sort("created_at", -1).to_list(50)

    # lightweight, rule-based risk (same contract as partner)
    reasons = []
    score = 0
    withdrawable = float(wallet.get("withdrawable_balance") or 0)
    amount = float(w.get("amount") or 0)
    kyc_ok = (owner.get("kyc_status") or "") in ("verified", "approved")
    if amount > withdrawable + 0.01:
        score += 55
        reasons.append({"severity": "high", "text": f"Requested ₹{amount:.0f} exceeds withdrawable ₹{withdrawable:.0f}"})
    if not kyc_ok:
        score += 30
        reasons.append({"severity": "high", "text": "KYC not verified"})
    if len(failed) >= 2:
        score += 15
        reasons.append({"severity": "medium", "text": f"{len(failed)} previous payout failure(s)"})
    if not reasons:
        reasons.append({"severity": "low", "text": "No elevated risk signals detected"})
    score = min(100, score)
    risk = {"score": score, "level": _level(score),
            "sub_scores": [{"key": "financial", "label": "Financial Risk", "score": score, "level": _level(score)}],
            "reasons": reasons, "linked_accounts": 0}

    bank = dict(w.get("bank") or {})
    acct = bank.get("account_number") or ""
    if acct:
        bank["account_masked"] = mask_acct(acct); bank.pop("account_number", None)
    dup_pending = len([h for h in history if h.get("status") == "pending" and h.get("id") != wid])
    checklist = [
        {"label": "Wallet balance sufficient", "ok": amount <= withdrawable + 0.01},
        {"label": "No duplicate pending withdrawal", "ok": dup_pending == 0},
        {"label": "No negative balance", "ok": float(wallet.get("available_balance") or 0) >= 0},
        {"label": "KYC verified", "ok": kyc_ok},
    ]
    payout = w.get("payout") or {}
    tl = [{"at": w.get("requested_at") or w.get("created_at"), "label": "Withdrawal requested", "kind": "ok"}]
    if w.get("status") == "completed":
        tl.append({"at": w.get("processed_at"), "label": "Admin approved & payout initiated", "kind": "ok"})
        tl.append({"at": w.get("processed_at"), "label": f"Paid — UTR {payout.get('utr') or '—'}", "kind": "done"})
    if w.get("status") == "failed":
        tl.append({"at": w.get("processed_at"), "label": f"Payout failed — {payout.get('error') or payout.get('failure_reason') or 'gateway error'}", "kind": "fail"})
    if w.get("status") == "rejected":
        tl.append({"at": w.get("processed_at"), "label": f"Rejected — {w.get('reason') or 'no reason'}", "kind": "fail"})

    return {
        "account_type": "merchant",
        "withdrawal": {
            "id": w["id"], "code": w.get("code") or f"WD-{w['id'][:8].upper()}",
            "amount": w.get("amount"), "fee": w.get("fee"), "net_amount": w.get("net_amount"),
            "method": w.get("method"), "status": w.get("status"),
            "requested_at": w.get("requested_at") or w.get("created_at"),
            "processed_at": w.get("processed_at"), "retried_at": None,
            "reason": w.get("reason"), "payout": payout, "upi_masked": mask_upi(w.get("upi_id")),
        },
        "owner": {
            "id": mid, "code": f"MRC-{mid[:8].upper()}", "name": w.get("merchant_name") or owner.get("name"),
            "phone": owner.get("phone"), "email": owner.get("email"),
            "joined": owner.get("created_at"), "account_age_days": _days_since(owner.get("created_at") or ""),
            "account_status": owner.get("status") or "active",
            "kyc_status": owner.get("kyc_status") or "pending", "kyc_ok": kyc_ok,
            "shop_name": owner.get("shop_name"),
        },
        "wallet": wallet, "wallet_ledger": ledger[:30],
        "destination": {"method": w.get("method"), "bank": bank, "upi_masked": mask_upi(w.get("upi_id")),
                        "verified": kyc_ok, "successful_payouts": len(paid)},
        "risk": risk, "checklist": checklist,
        "history": history[:50], "history_summary": hist_summary,
        "transactions": txns, "audit": audit, "timeline": [t for t in tl if t.get("at")],
    }


async def withdrawal_action(admin, account_type, wid, action, reason=""):
    if account_type == "partner":
        from services import partner_service as ps
        return await ps.process_withdrawal(admin, wid, action, reason)
    if account_type == "merchant":
        from services import merchant_wallet_service as mws
        return await mws.process_withdrawal(admin, wid, action, reason)
    raise HTTPException(status_code=400, detail="Invalid account type")


async def withdrawal_retry(admin, account_type, wid):
    if account_type == "partner":
        from services import partner_service as ps
        return await ps.retry_withdrawal_payout(admin, wid)
    raise HTTPException(status_code=400, detail="Retry is only supported for partner payouts")


# -------------------------------------------------------------- unified ledger
_PAY_STATUS = {"success": "success", "failed": "failed", "pending": "pending", "refunded": "refunded"}


def _entry(**k):
    k.setdefault("method", ""); k.setdefault("method_label", "")
    k.setdefault("reference", ""); k.setdefault("description", "")
    k.setdefault("net_amount", k.get("amount"))
    return k


async def _collect_ledger():
    """Build the normalized, chronological ledger from REAL sources."""
    out = []

    # 1) Customer payments for bookings
    for p in await db.payment_transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000):
        out.append(_entry(
            uid=p.get("id"), source="payment", id=p.get("id"),
            txn_ref=p.get("txn_ref") or f"PAY-{str(p.get('id') or '')[:6].upper()}",
            account_type="customer", user_name=p.get("customer_name"), user_phone=p.get("customer_phone"),
            category="booking", type_label="Booking Payment", direction="credit",
            amount=float(p.get("amount") or 0), method=p.get("method") or "",
            method_label=p.get("method_label") or "", status=_PAY_STATUS.get(p.get("status"), p.get("status")),
            created_at=p.get("created_at"), reference=p.get("booking_code") or "",
            description=p.get("service_name") or ""))

    # 2) Withdrawals (partner + merchant) — debit
    async def _wd(coll, atype, name_key):
        for w in await db[coll].find({}, {"_id": 0}).sort("requested_at", -1).to_list(3000):
            st = {"completed": "success", "failed": "failed", "pending": "pending", "rejected": "failed"}.get(w.get("status"), w.get("status"))
            out.append(_entry(
                uid=w.get("id"), source="withdrawal", id=f"{atype}:{w.get('id')}",
                txn_ref=w.get("code") or f"WD-{str(w.get('id') or '')[:6].upper()}",
                account_type=atype, user_name=w.get(name_key), user_phone="",
                category="withdrawal", type_label="Withdrawal", direction="debit",
                amount=float(w.get("amount") or 0), net_amount=float(w.get("net_amount") or w.get("amount") or 0),
                method=(w.get("method") or "").lower(), method_label=(w.get("method") or "").upper(),
                status=w.get("status"), created_at=w.get("requested_at") or w.get("created_at"),
                reference=(w.get("payout") or {}).get("utr") or "", description=f"{atype.title()} payout"))
    await _wd("partner_withdrawals", "partner", "partner_name")
    await _wd("merchant_withdrawals", "merchant", "merchant_name")

    # 3) Refunds — debit (money returned to customer)
    for r in await db.refunds.find({}, {"_id": 0}).sort("created_at", -1).to_list(3000):
        out.append(_entry(
            uid=r.get("id"), source="refund", id=r.get("id"),
            txn_ref=f"RFND-{str(r.get('id') or '')[:6].upper()}",
            account_type="customer", user_name=r.get("customer_name"), user_phone=r.get("customer_phone"),
            category="refund", type_label="Refund", direction="debit",
            amount=float(r.get("refund_amount") or r.get("amount") or 0),
            method=(r.get("method") or "").lower(), method_label=(r.get("method") or "").upper(),
            status=r.get("status"), created_at=r.get("created_at"),
            reference=r.get("booking_code") or r.get("razorpay_refund_id") or "",
            description=r.get("service_name") or "Booking refund"))

    # 4) Wallet ledger (partner + merchant) — earning / commission / adjustment / penalty / bonus
    _CAT = {"earning": "earning", "visiting_charge": "earning", "incentive": "bonus",
            "penalty": "penalty", "commission": "commission", "adjustment": "adjustment",
            "manual_credit": "adjustment", "manual_debit": "adjustment"}
    _LBL = {"earning": "Partner Earning", "visiting_charge": "Visiting Charge", "incentive": "Bonus / Incentive",
            "penalty": "Penalty", "commission": "Merchant Commission", "adjustment": "Wallet Adjustment"}

    async def _wl(coll, atype, id_key, name_cache):
        for e in await db[coll].find({}, {"_id": 0}).sort("created_at", -1).to_list(5000):
            kind = (e.get("kind") or "").lower()
            if kind == "withdrawal":  # already represented by the withdrawal record
                continue
            cat = _CAT.get(kind, "other")
            uid = e.get(id_key)
            out.append(_entry(
                uid=e.get("id"), source="wallet", id=e.get("id"),
                txn_ref=f"WL-{str(e.get('id') or '')[:6].upper()}",
                account_type=atype, user_name=name_cache.get(uid, ""), user_phone="",
                category=cat, type_label=_LBL.get(kind, kind.title() or "Wallet Entry"),
                direction=e.get("direction") or "credit", amount=float(e.get("amount") or 0),
                method="wallet", method_label="Wallet", status=e.get("status") or "success",
                created_at=e.get("created_at"), reference=e.get("ref_id") or "",
                description=e.get("note") or ""))

    # name caches (small datasets)
    pcache = {u["id"]: u.get("name") for u in await db.users.find({"role": "partner"}, {"_id": 0, "id": 1, "name": 1}).to_list(5000)}
    mcache = {u["id"]: (u.get("shop_name") or u.get("name")) for u in await db.users.find({"role": "merchant"}, {"_id": 0, "id": 1, "name": 1, "shop_name": 1}).to_list(5000)}
    await _wl("partner_ledger", "partner", "partner_id", pcache)
    await _wl("merchant_ledger", "merchant", "merchant_id", mcache)

    out.sort(key=lambda x: str(x.get("created_at") or ""), reverse=True)
    return out


async def list_ledger(category="all", account_type="", q="", date_from="", date_to="",
                      method="", page=1, page_size=25):
    rows = await _collect_ledger()

    def _within(x):
        d = str(x.get("created_at") or "")[:10]
        if date_from and d and d < date_from:
            return False
        if date_to and d and d > date_to:
            return False
        return True
    rows = [x for x in rows if _within(x)]
    if account_type:
        rows = [x for x in rows if x["account_type"] == account_type]
    if method:
        rows = [x for x in rows if x["method"] == method.lower()]
    if q:
        ql = q.strip().lower()
        rows = [x for x in rows if any(ql in str(v or "").lower() for v in (
            x["txn_ref"], x["user_name"], x["user_phone"], x["reference"],
            x["description"], x["type_label"], x["amount"]))]

    # KPIs + category counts on the search/date-filtered set (before category tab)
    succ = [x for x in rows if x["status"] in ("success", "completed")]
    credits = [x for x in rows if x["direction"] == "credit"]
    debits = [x for x in rows if x["direction"] == "debit"]
    summary = {
        "total": len(rows),
        "total_credit": round(sum(float(x["amount"]) for x in credits), 2),
        "total_debit": round(sum(float(x["amount"]) for x in debits), 2),
        "collected": round(sum(float(x["amount"]) for x in succ if x["category"] == "booking"), 2),
        "refunded": round(sum(float(x["amount"]) for x in rows if x["category"] == "refund" and x["status"] in ("processed", "success", "completed")), 2),
        "withdrawn": round(sum(float(x.get("net_amount") or x["amount"]) for x in rows if x["category"] == "withdrawal" and x["status"] == "completed"), 2),
        "commission": round(sum(float(x["amount"]) for x in rows if x["category"] == "commission"), 2),
    }
    cats = {}
    for x in rows:
        cats[x["category"]] = cats.get(x["category"], 0) + 1
    counts = {"all": len(rows), "credit": len(credits), "debit": len(debits), **cats}

    cat = (category or "all").lower()
    if cat == "credit":
        rows = credits
    elif cat == "debit":
        rows = debits
    elif cat != "all":
        rows = [x for x in rows if x["category"] == cat]

    total = len(rows)
    page = max(1, int(page)); page_size = min(100, max(1, int(page_size)))
    start = (page - 1) * page_size
    return {"items": rows[start:start + page_size], "total": total, "page": page,
            "page_size": page_size, "summary": summary, "counts": counts}


async def ledger_detail(source: str, tid: str):
    """Rich detail for a ledger row. Payments reuse the existing 360° payment
    detail; other sources return a normalized detail + related records."""
    if source == "payment":
        from controllers import admin_controller as ac
        d = await ac.payment_detail(tid)
        d["source"] = "payment"
        return d
    if source == "withdrawal":
        atype, _, real = tid.partition(":")
        return {"source": "withdrawal", "investigation": await withdrawal_investigation(atype or "partner", real or tid)}
    if source == "refund":
        r = await db.refunds.find_one({"id": tid}, {"_id": 0})
        if not r:
            raise HTTPException(status_code=404, detail="Refund not found")
        r["source"] = "refund"
        return r
    if source == "wallet":
        e = await db.partner_ledger.find_one({"id": tid}, {"_id": 0}) or await db.merchant_ledger.find_one({"id": tid}, {"_id": 0})
        if not e:
            raise HTTPException(status_code=404, detail="Entry not found")
        e["source"] = "wallet"
        return e
    raise HTTPException(status_code=400, detail="Unknown source")
