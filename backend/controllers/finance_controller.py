from config.database import db, now_iso
from models.user import new_id


async def wallet(user):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "wallet_balance": 1})
    txns = await db.transactions.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"balance": u.get("wallet_balance", 0), "transactions": txns}


async def wallet_transactions_paged(user, type_="all", search="", date_from="", date_to="", page=1, page_size=10):
    """Wallet transactions filtered + paginated server-side, with all-time totals."""
    import re
    base = {"user_id": user["id"]}
    q = dict(base)
    if type_ in ("credit", "debit"):
        q["type"] = type_
    if search.strip():
        rx = {"$regex": re.escape(search.strip()), "$options": "i"}
        q["$or"] = [{"note": rx}, {"kind": rx}]
    if date_from or date_to:
        q["created_at"] = {**({"$gte": date_from} if date_from else {}), **({"$lte": date_to} if date_to else {})}
    page = max(1, int(page)); page_size = min(50, max(1, int(page_size)))
    total = await db.transactions.count_documents(q)
    items = await db.transactions.find(q, {"_id": 0}).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    sums = {r["_id"]: r for r in await db.transactions.aggregate([{"$match": base}, {"$group": {"_id": "$type", "amt": {"$sum": "$amount"}, "n": {"$sum": 1}}}]).to_list(10)}
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "wallet_balance": 1}) or {}
    return {"items": items, "total": total, "page": page, "page_size": page_size, "balance": u.get("wallet_balance", 0),
            "credits": (sums.get("credit") or {}).get("amt", 0), "debits": (sums.get("debit") or {}).get("amt", 0),
            "count": sum(r["n"] for r in sums.values())}


async def topup(user, amount):
    # DEV/MOCK top-up (Razorpay not configured for real charge).
    await db.users.update_one({"id": user["id"]}, {"$inc": {"wallet_balance": amount}})
    await db.transactions.insert_one({
        "id": new_id(), "user_id": user["id"], "amount": amount, "type": "credit",
        "kind": "topup", "note": "Wallet top-up (mock)", "created_at": now_iso()})
    return await wallet(user)


async def partner_earnings(partner, page=0, page_size=0):
    ledger = await db.commission_ledger.find({"partner_id": partner["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    out = []
    total = 0.0
    for l in ledger:
        if l.get("kind") == "cancellation":
            # A cancellation row records the PLATFORM's view (partner_earning=0,
            # gross=original booking). For the PARTNER's ledger we must show ONLY the
            # cancellation compensation they actually received — never the customer's
            # gross booking amount. partner_cut = cancel_charge − platform − merchant
            # shares (same figures applied at cancel time). Gross for the partner here
            # is the cancellation charge their compensation is computed on.
            charge = float(l.get("base") or 0)
            plat = float(l.get("platform_earning") or 0)
            mref = float(l.get("merchant_referral") or 0)
            mcust = float(l.get("merchant_customer", l.get("merchant_booking", 0)) or 0)
            partner_cut = round(charge - plat - mref - mcust, 2)
            if partner_cut < 0:
                partner_cut = 0.0
            row = dict(l)
            row["gross"] = round(charge, 2)
            row["tax"] = 0.0
            row["partner_earning"] = partner_cut
            row["net_earning"] = partner_cut
            row["commission"] = round(charge - partner_cut, 2)
            row["label"] = "Cancellation adjustment"
            out.append(row)
            total += partner_cut
        else:
            # Completed job — unchanged behaviour: partner keeps partner_earning
            # (visiting reimbursement is credited separately). Only add a label +
            # explicit commission for the detail view.
            pe = float(l.get("partner_earning") or 0)
            base = float(l.get("base") or 0)
            row = dict(l)
            row["commission"] = round(base - pe, 2)
            row["label"] = "Job earning"
            out.append(row)
            total += pe
    res = {"wallet_balance": partner.get("wallet_balance", 0), "total_earned": round(total, 2), "jobs": len(out)}
    if page > 0:
        page_size = min(50, max(1, int(page_size or 10)))
        return {**res, "items": out[(page - 1) * page_size: page * page_size], "total": len(out), "page": page, "page_size": page_size}
    return {**res, "ledger": out}
