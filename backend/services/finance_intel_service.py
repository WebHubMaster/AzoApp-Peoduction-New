"""Finance intelligence — aggregates everything an admin needs to INVESTIGATE a
withdrawal BEFORE approving it: owner profile, ledger-derived wallet overview,
immutable wallet ledger, payout destination, rule-based risk assessment + reasons,
verification checklist, withdrawal history, recent transactions, unified timeline
and the audit trail. Read-only; never mutates financial state."""
from datetime import datetime, timezone
from fastapi import HTTPException
from config.database import db


def _days_since(iso: str) -> int:
    try:
        dt = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return max(0, (datetime.now(timezone.utc) - dt).days)
    except Exception:  # noqa: BLE001
        return 0


def _hours_since(iso: str) -> float:
    try:
        dt = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).total_seconds() / 3600.0
    except Exception:  # noqa: BLE001
        return 1e9


def mask_acct(num: str) -> str:
    num = (num or "").strip()
    return ("•••• " + num[-4:]) if len(num) >= 4 else (num or "—")


def mask_upi(vpa: str) -> str:
    vpa = (vpa or "").strip()
    if "@" not in vpa:
        return vpa or "—"
    name, _, host = vpa.partition("@")
    head = name[:2] if len(name) > 2 else name
    return f"{head}{'•' * max(2, len(name) - 2)}@{host}"


def _level(score: int) -> str:
    if score <= 30:
        return "LOW"
    if score <= 60:
        return "MEDIUM"
    if score <= 80:
        return "HIGH"
    return "CRITICAL"


async def _risk_assess(owner, w, history, wallet):
    """Rule-based risk engine on REAL data. Returns sub-scores, reasons, overall."""
    pid = owner.get("id")
    amount = float(w.get("amount") or 0)
    reasons = []
    identity = financial = transaction = withdrawal_r = account = device = 0

    # Identity / account age
    age = _days_since(owner.get("created_at") or owner.get("joined_at") or "")
    if age <= 7:
        identity += 40; account += 30
        reasons.append({"severity": "high", "text": f"Very new account — joined {age} day(s) ago"})
    elif age <= 30:
        identity += 15; account += 10
        reasons.append({"severity": "medium", "text": f"Recent account — {age} days old"})
    if (owner.get("kyc_status") or "") not in ("verified", "approved"):
        identity += 35
        reasons.append({"severity": "high", "text": "KYC not verified"})

    # Financial — amount vs available, negative-balance attempts
    withdrawable = float(wallet.get("withdrawable_balance") or 0)
    if amount > withdrawable + 0.01:
        financial += 60
        reasons.append({"severity": "high", "text": f"Requested ₹{amount:.0f} exceeds withdrawable ₹{withdrawable:.0f}"})
    paid = [h for h in history if h.get("status") == "completed"]
    avg = (sum(float(h.get("amount") or 0) for h in paid) / len(paid)) if paid else 0
    if avg and amount > avg * 3:
        financial += 25; withdrawal_r += 20
        reasons.append({"severity": "medium", "text": f"Withdrawal ₹{amount:.0f} is {amount/avg:.1f}× the average (₹{avg:.0f})"})

    # Withdrawal velocity — requests in last 24h
    recent24 = [h for h in history if _hours_since(h.get("requested_at") or h.get("created_at") or "") <= 24]
    if len(recent24) >= 3:
        withdrawal_r += 35; transaction += 20
        reasons.append({"severity": "high", "text": f"{len(recent24)} withdrawals in the last 24 hours"})
    elif len(recent24) >= 2:
        withdrawal_r += 15
        reasons.append({"severity": "medium", "text": f"{len(recent24)} withdrawals in the last 24 hours"})

    # Failed payouts history
    failed = [h for h in history if h.get("status") == "failed"]
    if len(failed) >= 2:
        withdrawal_r += 20
        reasons.append({"severity": "medium", "text": f"{len(failed)} previous payout failure(s)"})

    # Manual wallet adjustments
    adj = [e for e in (wallet.get("ledger") or []) if (e.get("kind") or "") in ("adjustment", "manual", "manual_credit", "manual_debit")]
    if adj:
        financial += 15; transaction += 15
        reasons.append({"severity": "medium", "text": f"{len(adj)} manual wallet adjustment(s) on record"})

    # Same bank account / UPI linked to other accounts
    acct = (w.get("bank") or {}).get("account_number") or ""
    upi = w.get("upi_id") or ""
    dup_accounts = 0
    if acct:
        dup_accounts = await db.partner_withdrawals.distinct("partner_id", {"bank.account_number": acct})
        dup_accounts = len([p for p in dup_accounts if p and p != pid])
    if not dup_accounts and upi:
        du = await db.partner_withdrawals.distinct("partner_id", {"upi_id": upi})
        dup_accounts = len([p for p in du if p and p != pid])
    if dup_accounts:
        device += 50; account += 30
        reasons.append({"severity": "high", "text": f"Payout destination linked to {dup_accounts} other account(s)"})

    def cap(x):
        return int(min(100, max(0, round(x))))

    identity, financial, transaction, withdrawal_r, account, device = map(
        cap, (identity, financial, transaction, withdrawal_r, account, device))
    overall = cap(0.15 * identity + 0.30 * financial + 0.15 * transaction
                  + 0.25 * withdrawal_r + 0.10 * account + 0.05 * device)
    if not reasons:
        reasons.append({"severity": "low", "text": "No elevated risk signals detected"})
    return {
        "score": overall, "level": _level(overall),
        "sub_scores": [
            {"key": "identity", "label": "Identity Risk", "score": identity, "level": _level(identity)},
            {"key": "financial", "label": "Financial Risk", "score": financial, "level": _level(financial)},
            {"key": "transaction", "label": "Transaction Risk", "score": transaction, "level": _level(transaction)},
            {"key": "withdrawal", "label": "Withdrawal Risk", "score": withdrawal_r, "level": _level(withdrawal_r)},
            {"key": "account", "label": "Account Risk", "score": account, "level": _level(account)},
            {"key": "device", "label": "Device / Linkage Risk", "score": device, "level": _level(device)},
        ],
        "reasons": reasons,
        "linked_accounts": dup_accounts,
    }


def _timeline(w):
    tl = [{"at": w.get("requested_at") or w.get("created_at"), "label": "Withdrawal requested", "kind": "ok"}]
    po = w.get("payout") or {}
    st = w.get("status")
    if st in ("completed", "failed") and w.get("processed_at"):
        tl.append({"at": w["processed_at"], "label": "Admin verification & approval", "kind": "ok"})
        tl.append({"at": w["processed_at"], "label": "Wallet amount locked", "kind": "ok"})
        tl.append({"at": w["processed_at"], "label": f"Payout created ({po.get('gateway') or 'gateway'})", "kind": "ok"})
    if po.get("status") in ("processed", "queued", "processing"):
        tl.append({"at": w.get("retried_at") or w.get("processed_at"), "label": f"Gateway processing — {po.get('payout_id') or ''}", "kind": "ok"})
    if st == "completed":
        tl.append({"at": w.get("retried_at") or w.get("processed_at"), "label": f"Paid — UTR {po.get('utr') or '—'}", "kind": "done"})
    if st == "failed":
        tl.append({"at": w.get("processed_at"), "label": f"Payout failed — {po.get('error') or po.get('failure_reason') or 'gateway error'}", "kind": "fail"})
        tl.append({"at": w.get("processed_at"), "label": "Wallet lock released", "kind": "ok"})
    if st == "rejected":
        tl.append({"at": w.get("processed_at"), "label": f"Rejected — {w.get('reason') or 'no reason'}", "kind": "fail"})
    return [t for t in tl if t.get("at")]


async def withdrawal_investigation(wid: str) -> dict:
    from services import partner_service as ps
    from services import partner_bank_service as pbs

    w = await db.partner_withdrawals.find_one({"id": wid}, {"_id": 0})
    if not w:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    pid = w["partner_id"]
    owner = await db.users.find_one({"id": pid}, {"_id": 0}) or {}

    wallet = await ps.wallet_summary(owner)
    ledger = wallet.pop("ledger", [])

    history = await db.partner_withdrawals.find({"partner_id": pid}, {"_id": 0}).sort("requested_at", -1).to_list(500)
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
        "last_at": paid[0]["processed_at"] if paid and paid[0].get("processed_at") else (history[0].get("requested_at") if history else None),
    }

    txns = await db.transactions.find({"user_id": pid}, {"_id": 0}).sort("created_at", -1).to_list(25)
    audit = await db.audit_logs.find(
        {"$or": [{"target_id": pid}, {"meta.wid": wid}]}, {"_id": 0}).sort("created_at", -1).to_list(50)

    elig = {"eligible": False, "blockers": [], "primary_bank": None}
    try:
        elig = await pbs.withdrawal_eligibility(pid)
    except Exception:  # noqa: BLE001
        pass

    risk = await _risk_assess(owner, w, history, {**wallet, "ledger": ledger})

    bank = dict(w.get("bank") or {})
    if bank.get("account_number"):
        bank["account_masked"] = mask_acct(bank["account_number"])
        bank.pop("account_number", None)
    dest_success = len([h for h in paid if (h.get("bank") or {}).get("account_number") == (w.get("bank") or {}).get("account_number")])

    kyc_ok = (owner.get("kyc_status") or "") in ("verified", "approved")
    bank_ok = bool(elig.get("eligible"))
    dup_pending = len([h for h in history if h.get("status") == "pending" and h.get("id") != wid])
    processing = any(h.get("status") in ("processing",) for h in history if h.get("id") != wid)
    checklist = [
        {"label": "Wallet balance sufficient", "ok": float(w.get("amount") or 0) <= float(wallet.get("withdrawable_balance") or 0) + 0.01},
        {"label": "No duplicate pending withdrawal", "ok": dup_pending == 0},
        {"label": "No negative balance", "ok": float(wallet.get("available_balance") or 0) >= 0},
        {"label": "KYC verified", "ok": kyc_ok},
        {"label": "Bank account verified", "ok": bank_ok},
        {"label": "No payout currently processing", "ok": not processing},
        {"label": "Destination not linked to other accounts", "ok": risk["linked_accounts"] == 0},
    ]

    return {
        "withdrawal": {
            "id": w["id"], "code": w.get("code") or f"WD-{w['id'][:8].upper()}",
            "amount": w.get("amount"), "fee": w.get("fee"), "net_amount": w.get("net_amount"),
            "method": w.get("method"), "status": w.get("status"),
            "requested_at": w.get("requested_at") or w.get("created_at"),
            "processed_at": w.get("processed_at"), "retried_at": w.get("retried_at"),
            "reason": w.get("reason"), "payout": w.get("payout") or {},
            "upi_masked": mask_upi(w.get("upi_id")),
        },
        "owner": {
            "id": pid, "code": f"PTN-{pid[:8].upper()}", "name": w.get("partner_name") or owner.get("name"),
            "phone": owner.get("phone"), "email": owner.get("email"),
            "joined": owner.get("created_at"), "account_age_days": _days_since(owner.get("created_at") or ""),
            "account_status": owner.get("partner_status") or ("active" if owner.get("is_active", True) else "inactive"),
            "kyc_status": owner.get("kyc_status") or "pending", "kyc_ok": kyc_ok,
        },
        "wallet": wallet,
        "wallet_ledger": ledger[:30],
        "destination": {"method": w.get("method"), "bank": bank, "upi_masked": mask_upi(w.get("upi_id")),
                        "verified": bank_ok, "successful_payouts": dest_success},
        "risk": risk,
        "checklist": checklist,
        "history": history[:50],
        "history_summary": hist_summary,
        "transactions": txns,
        "audit": audit,
        "timeline": _timeline(w),
    }
