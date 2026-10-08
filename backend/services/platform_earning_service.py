"""Platform Earning — read-only financial intelligence layer.

Every number is aggregated server-side from the existing sources of truth:
  • commission_ledger      → completed-booking splits (written by CommissionEngine.settle)
  • refunds                → cancellation refunds / partner compensation / platform retention
  • payment_transactions   → payment method, gateway fee, registration fees
  • starter_kit_purchases, membership_purchases → other platform income
  • partner_withdrawals, merchant_withdrawals   → payouts + withdrawal fees
Nothing here writes to or recalculates those collections."""
import csv
import io
import re
import time
from datetime import datetime, timedelta, timezone

from config.database import db

_CACHE: dict = {}
EXPENSE_LIVE = {"deleted": {"$ne": True}}
# Excludes seeded / demo rows everywhere money is reported (real data only).
REAL = {"_seed": {"$exists": False}, "seed_source": {"$exists": False}, "demo": {"$ne": True}, "is_demo": {"$ne": True}}
_REAL_BOOKING = {"_b.id": {"$exists": True}, "_b._seed": {"$exists": False}, "_b.seed_source": {"$exists": False}}
_TTL = 45
_INDEXED = False

SOURCE_LABEL = {
    "booking": "Booking Settlement", "cancellation": "Cancellation", "registration_fee": "Registration Fee",
    "starter_kit": "Starter Kit Sale", "membership": "Membership", "withdrawal_fee": "Withdrawal Fee",
}
MONEY = ["gross", "tax", "commission", "conv_fee", "plat_fee", "platform_fee", "cancellation_fee", "other_income",
         "refund", "refund_pending", "partner_payout", "merchant_payout", "gateway_fee", "platform_revenue",
         "net_earning", "variance"]
DIMS = {"service": "service", "category": "category", "city": "city", "partner": "partner_name",
        "merchant": "merchant_name", "method": "method", "source": "source"}
SORTS = {"revenue": "revenue", "profit": "profit", "orders": "orders", "margin": "margin",
         "refunds": "refunds", "commission": "commission", "platform_revenue": "platform_revenue",
         "payout": "payout", "name": "_id"}


async def ensure_indexes():
    global _INDEXED
    if _INDEXED:
        return
    specs = {"bookings": ["code"], "commission_ledger": ["created_at", "booking_code"],
             "payment_transactions": ["booking_code", "created_at", "purpose", "txn_ref"],
             "refunds": ["created_at", "booking_code"], "partner_withdrawals": ["created_at"],
             "merchant_withdrawals": ["requested_at"], "starter_kit_purchases": ["created_at"],
             "membership_purchases": ["created_at"]}
    for coll, keys in specs.items():
        for k in keys:
            try:
                await db[coll].create_index(k)
            except Exception:
                pass
    _INDEXED = True


def cached(key, ttl=_TTL):
    hit = _CACHE.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    return None


def put(key, val):
    if len(_CACHE) > 400:
        _CACHE.clear()
    _CACHE[key] = (time.time(), val)
    return val


# ───────────────────────── filters ─────────────────────────
def bounds(date_from: str, date_to: str):
    lo = (date_from or "")[:10]
    hi = ((date_to or "")[:10] + "T23:59:59.999999Z") if date_to else "9999"
    return lo, hi


def prev_bounds(date_from: str, date_to: str):
    if not (date_from and date_to):
        return None
    try:
        d0 = datetime.fromisoformat(date_from[:10])
        d1 = datetime.fromisoformat(date_to[:10])
    except ValueError:
        return None
    span = (d1 - d0).days + 1
    p1 = d0 - timedelta(days=1)
    p0 = p1 - timedelta(days=span - 1)
    return p0.strftime("%Y-%m-%d"), p1.strftime("%Y-%m-%d")


def _lit(proj: dict) -> dict:
    return {k: ({"$literal": v} if k != "_id" and (v is None or isinstance(v, (bool, int, float))) else v) for k, v in proj.items()}


def _num(path):
    return {"$convert": {"input": path, "to": "double", "onError": 0, "onNull": 0}}


def _post_match(f: dict) -> dict:
    m = {}
    eq = {"method": "method", "service": "service", "category": "category", "city": "city",
          "partner": "partner_id", "merchant": "merchant_id", "customer": "customer_id",
          "booking_status": "booking_status", "payment_status": "payment_status",
          "refund_status": "refund_status", "txn_status": "txn_status", "source": "source"}
    for k, field in eq.items():
        v = (f.get(k) or "").strip()
        if v:
            vals = [x for x in v.split(",") if x]
            m[field] = vals[0] if len(vals) == 1 else {"$in": vals}
    amt = {}
    if f.get("min_amount") not in (None, ""):
        amt["$gte"] = float(f["min_amount"])
    if f.get("max_amount") not in (None, ""):
        amt["$lte"] = float(f["max_amount"])
    if amt:
        m["gross"] = amt
    q = (f.get("q") or "").strip()
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        m["$or"] = [{k: rx} for k in ("booking_code", "txn_ref", "customer_name", "partner_name",
                                       "merchant_name", "service", "category", "city")]
    return m


# ───────────────────────── fact pipeline ─────────────────────────
_BOOKING_PROJ = {"_id": 0, "id": 1, "service_name": 1, "category_name": 1, "address.city": 1, "partner_id": 1,
                 "partner_name": 1, "merchant_id": 1, "merchant_name": 1, "customer_id": 1, "customer_name": 1,
                 "status": 1, "payment_status": 1, "booking_type": 1, "pricing.convenience_fee": 1, "pricing.platform_fee": 1,
                 "_seed": 1, "seed_source": 1}
_PAY_PROJ = {"_id": 0, "id": 1, "txn_ref": 1, "method": 1, "status": 1, "gateway_fee": 1}


def _lookups():
    return [
        {"$lookup": {"from": "bookings", "localField": "booking_code", "foreignField": "code", "as": "_b",
                     "pipeline": [{"$project": _BOOKING_PROJ}, {"$limit": 1}]}},
        {"$lookup": {"from": "payment_transactions", "localField": "booking_code", "foreignField": "booking_code",
                     "as": "_p", "pipeline": [{"$project": _PAY_PROJ}, {"$limit": 1}]}},
        {"$set": {"_b": {"$ifNull": [{"$first": "$_b"}, {}]}, "_p": {"$ifNull": [{"$first": "$_p"}, {}]}}},
    ]


def _common(extra: dict) -> dict:
    base = {
        "_id": 0, "booking_code": {"$ifNull": ["$booking_code", None]}, "booking_id": "$_b.id",
        "txn_ref": {"$ifNull": ["$_p.txn_ref", None]}, "service": "$_b.service_name", "category": "$_b.category_name",
        "city": "$_b.address.city", "partner_id": "$_b.partner_id", "partner_name": "$_b.partner_name",
        "merchant_id": "$_b.merchant_id", "merchant_name": "$_b.merchant_name", "customer_id": "$_b.customer_id",
        "customer_name": "$_b.customer_name", "method": {"$ifNull": ["$_p.method", None]},
        "booking_status": "$_b.status", "payment_status": "$_b.payment_status", "txn_status": "$_p.status",
        "booking_type": "$_b.booking_type", "refund_status": None, "tax": 0.0, "commission": 0.0, "conv_fee": 0.0, "plat_fee": 0.0,
        "platform_fee": 0.0, "cancellation_fee": 0.0, "other_income": 0.0, "refund": 0.0, "refund_pending": 0.0,
        "partner_payout": 0.0, "merchant_payout": 0.0,
        "has_gateway": {"$isNumber": "$_p.gateway_fee"}, "gateway_fee": _num("$_p.gateway_fee"),
    }
    base.update(extra)
    return _lit(base)


def _ledger_branch(lo, hi):
    return [
        {"$match": {"created_at": {"$gte": lo, "$lte": hi}, **REAL}},
        *_lookups(),
        {"$match": _REAL_BOOKING},
        {"$project": _common({
            "source": "booking", "source_id": "$id", "date": "$created_at",
            "gross": _num("$gross"), "tax": _num("$tax"), "commission": _num("$platform_earning"),
            "platform_fee": _num("$platform_fees"),
            "conv_fee": _num("$_b.pricing.convenience_fee"), "plat_fee": _num("$_b.pricing.platform_fee"),
            "partner_payout": _num("$partner_earning"),
            "merchant_payout": {"$add": [_num("$merchant_referral"), _num({"$ifNull": ["$merchant_customer", "$merchant_booking"]})]},
            "merchant_referral": _num("$merchant_referral"),
            "merchant_customer": _num({"$ifNull": ["$merchant_customer", "$merchant_booking"]}),
        })},
    ]


def _refund_branch(lo, hi):
    return [
        {"$match": {"created_at": {"$gte": lo, "$lte": hi}, **REAL}},
        *_lookups(),
        {"$match": _REAL_BOOKING},
        {"$project": _common({
            "source": "cancellation", "source_id": "$id", "date": "$created_at", "refund_status": "$status",
            "service": {"$ifNull": ["$_b.service_name", "$service_name"]},
            "partner_name": {"$ifNull": ["$_b.partner_name", "$partner_name"]},
            "customer_name": {"$ifNull": ["$_b.customer_name", "$customer_name"]},
            "gross": _num({"$ifNull": ["$original_amount", "$amount"]}),
            "refund": {"$cond": [{"$eq": ["$status", "processed"]}, _num({"$ifNull": ["$refund_amount", "$amount"]}), 0]},
            "refund_pending": {"$cond": [{"$ne": ["$status", "processed"]}, _num({"$ifNull": ["$refund_amount", "$amount"]}), 0]},
            "partner_payout": _num("$partner_cancellation_amount"),
            "cancellation_fee": _num("$platform_commission"),
            "merchant_referral": 0.0, "merchant_customer": 0.0,
        })},
    ]


def _income_branch(coll, match, source, amount, who_id, who_name, method, gw, date="$created_at", role="partner"):
    proj = {
        "_id": 0, "source": source, "source_id": "$id", "date": date, "booking_code": None, "booking_id": None,
        "txn_ref": {"$ifNull": ["$txn_ref", {"$ifNull": ["$payment_id", None]}]}, "service": None, "category": None,
        "city": None, "partner_id": who_id if role == "partner" else None,
        "partner_name": who_name if role == "partner" else None,
        "merchant_id": who_id if role == "merchant" else None, "merchant_name": who_name if role == "merchant" else None,
        "customer_id": who_id if role == "customer" else None, "customer_name": who_name if role == "customer" else None,
        "method": method, "booking_status": None, "payment_status": "$status", "txn_status": "$status",
        "refund_status": None, "gross": _num(amount), "tax": 0.0, "commission": 0.0, "conv_fee": 0.0, "plat_fee": 0.0,
        "platform_fee": 0.0, "cancellation_fee": 0.0, "other_income": _num(amount), "refund": 0.0,
        "refund_pending": 0.0, "partner_payout": 0.0, "merchant_payout": 0.0, "merchant_referral": 0.0,
        "merchant_customer": 0.0, "has_gateway": {"$isNumber": gw} if gw else False,
        "gateway_fee": _num(gw) if gw else 0.0,
    }
    return {"coll": coll, "pipeline": [{"$match": {**match, **REAL}}, {"$project": _lit(proj)}]}


def fact_pipeline(f: dict, lo: str, hi: str, extra=None):
    rng = {"$gte": lo, "$lte": hi}
    branches = [
        {"coll": "refunds", "pipeline": _refund_branch(lo, hi)},
        _income_branch("payment_transactions", {"purpose": "partner_registration_fee", "status": "success", "created_at": rng},
                       "registration_fee", "$amount", "$customer_id", "$customer_name", "$method", "$gateway_fee"),
        _income_branch("starter_kit_purchases", {"status": "paid", "created_at": rng}, "starter_kit", "$amount",
                       "$user_id", "$user_name", "$method", None),
        _income_branch("membership_purchases", {"status": {"$in": ["paid", "success", "active"]}, "created_at": rng},
                       "membership", {"$ifNull": ["$amount", "$price"]}, "$user_id", "$user_name", "$method", None,
                       role="customer"),
        _income_branch("partner_withdrawals", {"status": "completed", "fee": {"$gt": 0}, "created_at": rng,
                                               "payout.payout_id": {"$not": {"$regex": "^pout_DEMO"}}},
                       "withdrawal_fee", "$fee", "$partner_id", "$partner_name", "$method", None),
        _income_branch("merchant_withdrawals", {"status": "completed", "fee": {"$gt": 0}, "requested_at": rng},
                       "withdrawal_fee", "$fee", "$merchant_id", "$merchant_name", "$method", None,
                       date="$requested_at", role="merchant"),
    ]
    pipe = _ledger_branch(lo, hi)
    for b in branches:
        pipe.append({"$unionWith": {"coll": b["coll"], "pipeline": b["pipeline"]}})
    pipe.append({"$set": {
        "uid": {"$concat": ["$source", ":", {"$toString": "$source_id"}]},
        "platform_revenue": {"$add": ["$commission", "$platform_fee", "$cancellation_fee", "$other_income"]},
    }})
    pipe.append({"$set": {
        "net_earning": {"$subtract": ["$platform_revenue", "$gateway_fee"]},
        "variance": {"$round": [{"$subtract": ["$gross", {"$add": ["$tax", "$refund", "$refund_pending",
                                 "$partner_payout", "$merchant_payout", "$platform_revenue"]}]}, 2]},
    }})
    m = _post_match(f)
    if m:
        pipe.append({"$match": m})
    return pipe + (extra or [])


async def run(pipe):
    return await db.commission_ledger.aggregate(pipe, allowDiskUse=True).to_list(None)


def _sum_group(key=None):
    g = {"_id": key, "rows": {"$sum": 1},
         "orders": {"$sum": {"$cond": [{"$in": ["$source", ["booking", "cancellation"]]}, 1, 0]}},
         "booking_orders": {"$sum": {"$cond": [{"$eq": ["$source", "booking"]}, 1, 0]}},
         "booking_gross": {"$sum": {"$cond": [{"$eq": ["$source", "booking"]}, "$gross", 0]}},
         "booking_tax": {"$sum": {"$cond": [{"$eq": ["$source", "booking"]}, "$tax", 0]}},
         "refund_count": {"$sum": {"$cond": [{"$eq": ["$source", "cancellation"]}, 1, 0]}},
         "gateway_rows": {"$sum": {"$cond": ["$has_gateway", 1, 0]}},
         "merchant_referral": {"$sum": "$merchant_referral"}, "merchant_customer": {"$sum": "$merchant_customer"}}
    for k in MONEY:
        g[k] = {"$sum": f"${k}"}
    return g


def _r(x):
    return round(float(x or 0), 2)


def _pct(a, b):
    return round(a / b * 100, 2) if b else None


def settled_revenue(t: dict):
    """Completed/settled booking revenue (excl. GST) — booking ledger rows only."""
    return _r((t.get("booking_gross") or 0) - (t.get("booking_tax") or 0))


def derive(t: dict, expenses: float | None):
    """P&L derived from summed facts — identical formula everywhere (KPIs, trend, tables)."""
    gross = _r(t.get("gross"))
    tax = _r(t.get("tax"))
    revenue = _r(gross - tax)
    refunds = _r(t.get("refund"))
    refund_pending = _r(t.get("refund_pending"))
    partner = _r(t.get("partner_payout"))
    merchant = _r(t.get("merchant_payout"))
    gateway = _r(t.get("gateway_fee"))
    platform_revenue = _r(t.get("platform_revenue"))
    net_rev = _r(revenue - refunds - refund_pending - partner - merchant)
    gross_profit = _r(platform_revenue - gateway)
    net_profit = _r(gross_profit - expenses) if expenses is not None else None
    return {
        "gross_collection": gross, "tax": tax, "revenue": revenue, "refunds": refunds, "refund_pending": refund_pending,
        "partner_payout": partner, "merchant_payout": merchant, "gateway_fee": gateway,
        "platform_revenue": platform_revenue, "net_platform_revenue_calc": net_rev,
        "reconciliation_diff": _r(net_rev - platform_revenue),
        "costs": _r(refunds + refund_pending + partner + merchant + gateway + (expenses or 0)),
        "gross_profit": gross_profit, "net_profit": net_profit, "operating_expenses": expenses,
        "gross_margin": _pct(gross_profit, revenue), "net_margin": _pct(net_profit, revenue) if net_profit is not None else None,
        "take_rate": _pct(platform_revenue, revenue),
    }


async def operating_expenses(lo, hi):
    """Only real stored expenses. Returns None when the platform has no expense data configured."""
    if not await db.platform_expenses.count_documents(EXPENSE_LIVE, limit=1):
        return None
    r = await db.platform_expenses.aggregate([
        {"$match": {**EXPENSE_LIVE, "date": {"$gte": lo, "$lte": hi}}},
        {"$group": {"_id": None, "t": {"$sum": _num("$amount")}}}]).to_list(1)
    return _r(r[0]["t"]) if r else 0.0


# ───────────────────────── exports ─────────────────────────
def csv_stream(columns, rows_iter):
    async def gen():
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow([c[1] for c in columns])
        yield buf.getvalue()
        async for row in rows_iter:
            buf.seek(0)
            buf.truncate(0)
            w.writerow([row.get(c[0]) if row.get(c[0]) is not None else "" for c in columns])
            yield buf.getvalue()
    return gen()


def now_utc():
    return datetime.now(timezone.utc)


async def finance(f: dict, lo: str, hi: str, extra=None):
    """Shared money totals (+ per-day raw sums) — used by Platform Earning AND the Admin Dashboard."""
    res = await run(fact_pipeline(f, lo, hi, (extra or []) + [{"$facet": {
        "t": [{"$group": _sum_group()}],
        "d": [{"$group": _sum_group({"$substrBytes": ["$date", 0, 10]})}],
    }}]))
    r = res[0] if res else {}
    return (r.get("t") or [{}])[0], r.get("d") or []
