"""Platform Earning — admin financial intelligence API (read-only, server-side aggregation)."""
import asyncio
import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from config.database import db
from middleware.auth import require_role
from services import platform_earning_service as pe

router = APIRouter(prefix="/admin/platform-earning", tags=["platform-earning"])
ADMIN = require_role("admin")
FILTER_KEYS = ["date_from", "date_to", "method", "service", "category", "partner", "merchant", "customer", "city",
               "booking_status", "payment_status", "refund_status", "txn_status", "source", "min_amount",
               "max_amount", "q"]


def _filters(request: Request) -> dict:
    return {k: request.query_params.get(k, "") for k in FILTER_KEYS}


def _key(name, request: Request):
    qp = sorted((k, v) for k, v in request.query_params.items() if k != "nocache")
    return name + json.dumps(qp)


async def _cached(name, request, fn):
    await pe.ensure_indexes()
    key = _key(name, request)
    if request.query_params.get("nocache") != "1":
        hit = pe.cached(key)
        if hit is not None:
            return hit
    return pe.put(key, await fn())


# ───────────────────────── meta ─────────────────────────
@router.get("/meta")
async def meta(request: Request, admin=Depends(ADMIN)):
    async def fn():
        services, categories, cities, methods = await asyncio.gather(
            db.bookings.distinct("service_name"), db.bookings.distinct("category_name"),
            db.bookings.distinct("address.city"), db.payment_transactions.distinct("method"))
        partners = await db.users.find({"role": "partner"}, {"_id": 0, "id": 1, "name": 1}).sort("name", 1).to_list(1000)
        merchants = await db.users.find({"role": "merchant"}, {"_id": 0, "id": 1, "name": 1, "shop_name": 1}).sort("name", 1).to_list(1000)
        customers = await db.users.find({"role": "customer"}, {"_id": 0, "id": 1, "name": 1, "phone": 1}).sort("name", 1).to_list(1000)
        gw = await db.payment_transactions.count_documents({"gateway_fee": {"$type": "number"}}, limit=1)
        exp = await db.platform_expenses.count_documents(pe.EXPENSE_LIVE, limit=1)
        clean = lambda xs: sorted(x for x in xs if x)  # noqa: E731
        return {
            "services": clean(services), "categories": clean(categories), "cities": clean(cities),
            "methods": clean(methods),
            "partners": partners, "merchants": [{"id": m["id"], "name": m.get("shop_name") or m.get("name")} for m in merchants],
            "customers": [{"id": c["id"], "name": f"{c.get('name') or 'Customer'} · {c.get('phone') or ''}"} for c in customers],
            "booking_statuses": clean(await db.bookings.distinct("status")),
            "payment_statuses": clean(await db.bookings.distinct("payment_status")),
            "refund_statuses": clean(await db.refunds.distinct("status")),
            "txn_statuses": clean(await db.payment_transactions.distinct("status")),
            "sources": [{"key": k, "label": v} for k, v in pe.SOURCE_LABEL.items()],
            "gateway_fee_configured": bool(gw), "expense_configured": bool(exp),
        }
    return await _cached("meta", request, fn)


# ───────────────────────── summary (KPIs, P&L, breakdown, reconciliation, health) ─────────────────────────
def _count_if(field):
    return {"$sum": {"$cond": [{"$gt": [f"${field}", 0]}, 1, 0]}}


async def _totals(f, lo, hi):
    group = pe._sum_group()
    group.update({"commission_n": _count_if("commission"), "conv_n": _count_if("conv_fee"),
                  "plat_n": _count_if("plat_fee"), "pfee_n": _count_if("platform_fee"),
                  "cancel_n": _count_if("cancellation_fee")})
    res = await pe.run(pe.fact_pipeline(f, lo, hi, [{"$facet": {
        "t": [{"$group": group}],
        "src": [{"$group": {"_id": "$source", "n": {"$sum": 1}, "income": {"$sum": "$other_income"},
                            "rev": {"$sum": "$platform_revenue"}}}],
    }}]))
    r = res[0] if res else {}
    return (r.get("t") or [{}])[0], {s["_id"]: s for s in r.get("src") or []}


async def _txn_success(f, lo, hi):
    m = {"created_at": {"$gte": lo, "$lte": hi}, "purpose": {"$ne": "partner_registration_fee"}}
    if f.get("method"):
        m["method"] = {"$in": f["method"].split(",")}
    rows = await db.payment_transactions.aggregate([{"$match": m}, {"$group": {"_id": "$status", "n": {"$sum": 1}}}]).to_list(20)
    c = {r["_id"]: r["n"] for r in rows}
    ok, bad = c.get("success", 0) + c.get("refunded", 0), c.get("failed", 0)
    return {"success": ok, "failed": bad, "pending": c.get("pending", 0), "rate": pe._pct(ok, ok + bad)}


def _revenue_sources(t, src):
    out = []
    add = lambda k, label, amt, n: out.append({"key": k, "label": label, "amount": pe._r(amt), "count": int(n or 0)})  # noqa: E731
    if t.get("commission_n"):
        add("commission", "Service Commission", t.get("commission"), t.get("commission_n"))
    if t.get("conv_n"):
        add("convenience_fee", "Convenience Fee", t.get("conv_fee"), t.get("conv_n"))
    if t.get("plat_n"):
        add("platform_fee", "Platform Fee", t.get("plat_fee"), t.get("plat_n"))
    other_fee = pe._r((t.get("platform_fee") or 0) - (t.get("conv_fee") or 0) - (t.get("plat_fee") or 0))
    if other_fee > 0.01:
        add("other_fee", "Other Booking Fees", other_fee, t.get("pfee_n"))
    if t.get("cancel_n"):
        add("cancellation_fee", "Cancellation Fees", t.get("cancellation_fee"), t.get("cancel_n"))
    for k in ("registration_fee", "starter_kit", "membership", "withdrawal_fee"):
        s = src.get(k)
        if s and s["n"]:
            add(k, {"registration_fee": "Partner Registration Fee", "starter_kit": "Starter Kit Sales",
                    "membership": "Customer Membership", "withdrawal_fee": "Withdrawal Processing Fees"}[k], s["income"], s["n"])
    total = sum(x["amount"] for x in out)
    for x in out:
        x["pct"] = pe._pct(x["amount"], total) or 0
    return sorted(out, key=lambda x: -x["amount"])


@router.get("/summary")
async def summary(request: Request, admin=Depends(ADMIN)):
    f = _filters(request)

    async def fn():
        lo, hi = pe.bounds(f["date_from"], f["date_to"])
        (t, src), exp, txn = await asyncio.gather(_totals(f, lo, hi), pe.operating_expenses(lo, hi), _txn_success(f, lo, hi))
        pnl = pe.derive(t, exp)
        prev = None
        pb = pe.prev_bounds(f["date_from"], f["date_to"])
        if pb:
            plo, phi = pe.bounds(*pb)
            (pt, _ps), pexp = await asyncio.gather(_totals(f, plo, phi), pe.operating_expenses(plo, phi))
            if pt.get("rows"):
                prev = {**pe.derive(pt, pexp), "settled_revenue": pe.settled_revenue(pt), "rows": pt.get("rows"), "orders": pt.get("orders"),
                        "commission": pe._r(pt.get("commission")), "platform_fee": pe._r(pt.get("platform_fee")),
                        "range": {"date_from": pb[0], "date_to": pb[1]}}
        orders = t.get("orders") or 0
        health = {
            "revenue_growth": pe._pct(pnl["platform_revenue"] - prev["platform_revenue"], prev["platform_revenue"]) if prev and prev["platform_revenue"] else None,
            "profit_margin": pnl["gross_margin"],
            "refund_rate": pe._pct(t.get("refund_count") or 0, orders),
            "refund_value_rate": pe._pct(pnl["refunds"] + pnl["refund_pending"], pnl["gross_collection"]),
            "payout_ratio": pe._pct(pnl["partner_payout"] + pnl["merchant_payout"], pnl["revenue"]),
            "txn_success_rate": txn["rate"],
            "avg_order_value": pe._r(t["booking_gross"] / t["booking_orders"]) if t.get("booking_orders") else None,
        }
        return {
            "range": {"date_from": f["date_from"], "date_to": f["date_to"]},
            "has_data": bool(t.get("rows")),
            "counts": {"rows": t.get("rows") or 0, "orders": orders, "bookings_settled": t.get("booking_orders") or 0,
                       "cancellations": t.get("refund_count") or 0, "gateway_rows": t.get("gateway_rows") or 0},
            "pnl": pnl, "settled_revenue": pe.settled_revenue(t),
            "commission": pe._r(t.get("commission")), "platform_fee": pe._r(t.get("platform_fee")),
            "cancellation_fee": pe._r(t.get("cancellation_fee")), "other_income": pe._r(t.get("other_income")),
            "merchant_referral": pe._r(t.get("merchant_referral")), "merchant_customer": pe._r(t.get("merchant_customer")),
            "revenue_sources": _revenue_sources(t, src),
            "previous": prev, "health": health, "txn": txn,
            "gateway_configured": bool(t.get("gateway_rows")),
            "gateway_coverage": pe._pct(t.get("gateway_rows") or 0, t.get("rows") or 0),
            "expense_configured": exp is not None,
            "reconciliation": {
                "gross_collection": pnl["gross_collection"], "tax": pnl["tax"], "refunds": pnl["refunds"],
                "refund_pending": pnl["refund_pending"],
                "payouts": pe._r(pnl["partner_payout"] + pnl["merchant_payout"]),
                "calculated": pnl["net_platform_revenue_calc"], "recorded": pnl["platform_revenue"],
                "difference": pnl["reconciliation_diff"],
                "matched": abs(pnl["reconciliation_diff"]) < 1,
                "fees_charges": pnl["gateway_fee"], "net_earning": pe._r(pnl["platform_revenue"] - pnl["gateway_fee"]),
            },
            "generated_at": pe.now_utc().isoformat(),
        }
    return await _cached("summary", request, fn)


# ───────────────────────── trend ─────────────────────────
def _bucket_of(lo, hi, bucket):
    if bucket in ("day", "week", "month"):
        return bucket
    try:
        span = (datetime.fromisoformat(hi[:10]) - datetime.fromisoformat(lo[:10])).days
    except ValueError:
        span = 9999
    return "day" if span <= 45 else "week" if span <= 200 else "month"


def _bucket_expr(bucket):
    if bucket == "day":
        return {"$substrBytes": ["$date", 0, 10]}
    if bucket == "month":
        return {"$substrBytes": ["$date", 0, 7]}
    return {"$dateToString": {"format": "%Y-%m-%d", "date": {"$dateTrunc": {
        "date": {"$dateFromString": {"dateString": {"$substrBytes": ["$date", 0, 10]}}}, "unit": "week", "startOfWeek": "monday"}}}}


def _fill(keys, lo, hi, bucket):
    if not keys and not lo:
        return []
    start = (lo or min(keys))[:10]
    start = start + "-01" if len(start) == 7 else start
    end = hi[:10] if hi != "9999" else pe.now_utc().strftime("%Y-%m-%d")
    d0, d1 = datetime.fromisoformat(start), datetime.fromisoformat(end)
    cur = d0 - timedelta(days=d0.weekday()) if bucket == "week" else d0.replace(day=1) if bucket == "month" else d0
    out = []
    while cur <= d1 and len(out) < 800:
        out.append(cur.strftime("%Y-%m" if bucket == "month" else "%Y-%m-%d"))
        cur = cur + timedelta(days=1 if bucket == "day" else 7) if bucket != "month" else (cur.replace(day=28) + timedelta(days=4)).replace(day=1)
    return out


@router.get("/trend")
async def trend(request: Request, bucket: str = "auto", admin=Depends(ADMIN)):
    f = _filters(request)

    async def fn():
        lo, hi = pe.bounds(f["date_from"], f["date_to"])
        if not f["date_from"]:
            first = await pe.run(pe.fact_pipeline(f, lo, hi, [{"$sort": {"date": 1}}, {"$limit": 1}, {"$project": {"date": 1}}]))
            lo_eff = first[0]["date"][:10] if first else ""
        else:
            lo_eff = lo
        b = _bucket_of(lo_eff or lo, hi if hi != "9999" else pe.now_utc().strftime("%Y-%m-%d"), bucket)
        rows = await pe.run(pe.fact_pipeline(f, lo, hi, [{"$group": pe._sum_group(_bucket_expr(b))}]))
        exp_on = (await pe.operating_expenses(lo, hi)) is not None
        exp_map = {}
        if exp_on:
            ex = await db.platform_expenses.aggregate([
                {"$match": {**pe.EXPENSE_LIVE, "date": {"$gte": lo, "$lte": hi}}},
                {"$group": {"_id": _bucket_expr(b), "t": {"$sum": pe._num("$amount")}}}]).to_list(None)
            exp_map = {e["_id"]: e["t"] for e in ex}
        by = {r["_id"]: r for r in rows}
        keys = _fill(list(by.keys()), lo_eff, hi, b) or sorted(by.keys())
        series = []
        for k in keys:
            d = pe.derive(by.get(k, {}), exp_map.get(k, 0.0) if exp_on else None)
            series.append({"bucket": k, "revenue": d["revenue"], "platform_revenue": d["platform_revenue"],
                           "expenses": d["costs"], "gross_profit": d["gross_profit"], "net_profit": d["net_profit"],
                           "margin": d["gross_margin"], "net_margin": d["net_margin"], "refunds": d["refunds"],
                           "gateway_fee": d["gateway_fee"], "orders": (by.get(k) or {}).get("orders", 0)})
        return {"bucket": b, "series": series, "expense_configured": exp_on}
    return await _cached("trend", request, fn)


# ───────────────────────── profitability breakdown ─────────────────────────
def _dim_group(dim):
    field = pe.DIMS[dim]
    g = pe._sum_group(f"${field}")
    if dim in ("partner", "merchant"):
        g["_id"] = f"${dim}_id"
        g["name"] = {"$first": f"${field}"}
    return g


_DERIVED = {
    "revenue": {"$round": [{"$subtract": ["$gross", "$tax"]}, 2]},
    "refunds": {"$round": [{"$add": ["$refund", "$refund_pending"]}, 2]},
    "payout": {"$round": [{"$add": ["$partner_payout", "$merchant_payout"]}, 2]},
    "profit": {"$round": [{"$subtract": ["$platform_revenue", "$gateway_fee"]}, 2]},
}


@router.get("/breakdown")
async def breakdown(request: Request, dim: str = "service", sort: str = "revenue", order: str = "desc",
                    page: int = 1, page_size: int = 10, dim_q: str = "", admin=Depends(ADMIN)):
    if dim not in pe.DIMS:
        raise HTTPException(400, "Unsupported dimension")
    f = _filters(request)
    page, page_size = max(1, page), min(max(1, page_size), 100)

    async def fn():
        lo, hi = pe.bounds(f["date_from"], f["date_to"])
        post = [{"$match": {"_id": {"$ne": None}}}, {"$set": _DERIVED},
                {"$set": {"margin": {"$cond": [{"$gt": ["$revenue", 0]}, {"$round": [{"$multiply": [{"$divide": ["$profit", "$revenue"]}, 100]}, 2]}, None]},
                          "name": {"$ifNull": ["$name", "$_id"]}}}]
        if dim_q:
            import re
            post.append({"$match": {"name": {"$regex": re.escape(dim_q), "$options": "i"}}})
        sk = pe.SORTS.get(sort, "revenue")
        if sk == "_id":
            sk = "name"
        res = await pe.run(pe.fact_pipeline(f, lo, hi, [{"$group": _dim_group(dim)}, *post, {"$facet": {
            "total": [{"$count": "n"}],
            "rows": [{"$sort": {sk: 1 if order == "asc" else -1, "name": 1}}, {"$skip": (page - 1) * page_size}, {"$limit": page_size}],
            "sum": [{"$group": {"_id": None, "revenue": {"$sum": "$revenue"}, "profit": {"$sum": "$profit"}}}],
        }}]))
        r = res[0] if res else {}
        rows = [{k: (pe._r(v) if isinstance(v, float) else v) for k, v in x.items()} for x in r.get("rows", [])]
        s = (r.get("sum") or [{}])[0]
        for x in rows:
            x["key"] = x.pop("_id")
            x["share"] = pe._pct(x.get("revenue") or 0, s.get("revenue") or 0)
        return {"dim": dim, "rows": rows, "total": ((r.get("total") or [{}])[0]).get("n", 0), "page": page,
                "page_size": page_size, "sort": sort, "order": order,
                "totals": {"revenue": pe._r(s.get("revenue")), "profit": pe._r(s.get("profit"))}}
    return await _cached("breakdown", request, fn)


# ───────────────────────── top performers ─────────────────────────
@router.get("/top")
async def top(request: Request, admin=Depends(ADMIN)):
    f = _filters(request)

    async def fn():
        lo, hi = pe.bounds(f["date_from"], f["date_to"])

        def facet(dim, by):
            return [{"$group": _dim_group(dim)}, {"$match": {"_id": {"$ne": None}}}, {"$set": _DERIVED},
                    {"$sort": {by: -1}}, {"$limit": 1},
                    {"$project": {"_id": 0, "key": "$_id", "name": {"$ifNull": ["$name", "$_id"]}, "revenue": 1,
                                  "profit": 1, "platform_revenue": 1, "orders": 1, "commission": 1}}]
        spec = {"service_revenue": ("service", "revenue"), "service_profit": ("service", "profit"),
                "category_revenue": ("category", "revenue"), "category_profit": ("category", "profit"),
                "city_revenue": ("city", "revenue"), "partner": ("partner", "platform_revenue"),
                "merchant": ("merchant", "revenue")}
        res = await pe.run(pe.fact_pipeline(f, lo, hi, [{"$facet": {k: facet(*v) for k, v in spec.items()}}]))
        r = res[0] if res else {}
        out = {}
        for k in spec:
            v = (r.get(k) or [None])[0]
            if v and (v.get(spec[k][1]) or 0) > 0:
                out[k] = {kk: (pe._r(vv) if isinstance(vv, float) else vv) for kk, vv in v.items()}
            else:
                out[k] = None
        return out
    return await _cached("top", request, fn)


# ───────────────────────── commission & fees ─────────────────────────
@router.get("/commission")
async def commission(request: Request, admin=Depends(ADMIN)):
    f = _filters(request)

    async def fn():
        lo, hi = pe.bounds(f["date_from"], f["date_to"])

        def by(field):
            return [{"$match": {"source": "booking", field: {"$ne": None}}},
                    {"$group": {"_id": f"${field}", "amount": {"$sum": "$commission"}, "count": {"$sum": 1}}},
                    {"$sort": {"amount": -1}}, {"$limit": 8}]
        res = await pe.run(pe.fact_pipeline(f, lo, hi, [{"$facet": {
            "t": [{"$match": {"source": "booking"}}, {"$group": {
                "_id": None, "commission": {"$sum": "$commission"}, "count": {"$sum": 1},
                "partner": {"$sum": "$partner_payout"}, "mref": {"$sum": "$merchant_referral"},
                "mcust": {"$sum": "$merchant_customer"}, "base": {"$sum": {"$subtract": [{"$subtract": ["$gross", "$tax"]}, "$platform_fee"]}},
                "mref_n": {"$sum": {"$cond": [{"$gt": ["$merchant_referral", 0]}, 1, 0]}},
                "mcust_n": {"$sum": {"$cond": [{"$gt": ["$merchant_customer", 0]}, 1, 0]}}}}],
            "category": by("category"), "service": by("service"), "city": by("city"),
        }}]))
        r = res[0] if res else {}
        t = (r.get("t") or [{}])[0]
        total = t.get("commission") or 0

        def rows(xs):
            return [{"name": x["_id"], "amount": pe._r(x["amount"]), "count": x["count"],
                     "pct": pe._pct(x["amount"], total) or 0, "avg": pe._r(x["amount"] / x["count"]) if x["count"] else 0} for x in xs]
        return {
            "total": pe._r(total), "count": t.get("count") or 0,
            "avg": pe._r(total / t["count"]) if t.get("count") else None,
            "effective_rate": pe._pct(total, t.get("base") or 0),
            "partner_share": pe._r(t.get("partner")),
            "merchant_referral": {"amount": pe._r(t.get("mref")), "count": t.get("mref_n") or 0},
            "merchant_customer": {"amount": pe._r(t.get("mcust")), "count": t.get("mcust_n") or 0},
            "by_category": rows(r.get("category") or []), "by_service": rows(r.get("service") or []),
            "by_city": rows(r.get("city") or []),
        }
    return await _cached("commission", request, fn)


@router.get("/fees")
async def fees(request: Request, admin=Depends(ADMIN)):
    f = _filters(request)

    async def fn():
        lo, hi = pe.bounds(f["date_from"], f["date_to"])
        (t, src) = await _totals(f, lo, hi)
        items = []
        def add(k, label, amt, n):  # noqa: E306
            if n:
                items.append({"key": k, "label": label, "collected": pe._r(amt), "count": int(n), "refunded": None,
                              "net": pe._r(amt)})
        add("convenience_fee", "Convenience Fees", t.get("conv_fee"), t.get("conv_n"))
        add("platform_fee", "Booking Platform Fees", t.get("plat_fee"), t.get("plat_n"))
        other = pe._r((t.get("platform_fee") or 0) - (t.get("conv_fee") or 0) - (t.get("plat_fee") or 0))
        if other > 0.01:
            add("other_fee", "Other Booking Charges", other, t.get("pfee_n"))
        add("cancellation_fee", "Cancellation Fees (retained)", t.get("cancellation_fee"), t.get("cancel_n"))
        for k, label in (("withdrawal_fee", "Withdrawal Processing Fees"), ("registration_fee", "Partner Registration Fees")):
            s = src.get(k)
            if s:
                add(k, label, s["income"], s["n"])
        total = sum(i["collected"] for i in items)
        return {"items": items, "total_collected": pe._r(total), "total_net": pe._r(total),
                "refund_tracking": False,
                "note": "Refund records do not itemise fees, so fee-level refunds are not tracked. Net = collected."}
    return await _cached("fees", request, fn)


# ───────────────────────── payouts ─────────────────────────
@router.get("/payouts")
async def payouts(request: Request, admin=Depends(ADMIN)):
    f = _filters(request)

    async def fn():
        lo, hi = pe.bounds(f["date_from"], f["date_to"])
        pm = {"created_at": {"$gte": lo, "$lte": hi}}
        mm = {"requested_at": {"$gte": lo, "$lte": hi}}
        if f.get("partner"):
            pm["partner_id"] = {"$in": f["partner"].split(",")}
        if f.get("merchant"):
            mm["merchant_id"] = {"$in": f["merchant"].split(",")}
        grp = [{"$group": {"_id": "$status", "amount": {"$sum": pe._num("$amount")}, "count": {"$sum": 1},
                           "fee": {"$sum": pe._num("$fee")}}}]
        prow, mrow = await asyncio.gather(
            db.partner_withdrawals.aggregate([{"$match": pm}, *grp]).to_list(20),
            db.merchant_withdrawals.aggregate([{"$match": mm}, *grp]).to_list(20))
        (t, _src) = await _totals(f, lo, hi)

        def shape(rows):
            by = {r["_id"] or "unknown": r for r in rows}
            total = sum(r["amount"] for r in rows)
            st = {}
            for s in sorted(by):
                st[s] = {"amount": pe._r(by[s]["amount"]), "count": by[s]["count"], "pct": pe._pct(by[s]["amount"], total) or 0}
            return {"total_requested": pe._r(total), "count": sum(r["count"] for r in rows), "by_status": st}
        p, m = shape(prow), shape(mrow)
        agg = {}
        for s in set(p["by_status"]) | set(m["by_status"]):
            a = p["by_status"].get(s, {"amount": 0, "count": 0})
            b = m["by_status"].get(s, {"amount": 0, "count": 0})
            agg[s] = {"amount": pe._r(a["amount"] + b["amount"]), "count": a["count"] + b["count"]}
        grand = sum(v["amount"] for v in agg.values())
        for v in agg.values():
            v["pct"] = pe._pct(v["amount"], grand) or 0
        return {"partner": p, "merchant": m, "by_status": agg, "total": pe._r(grand),
                "accrued": {"partner": pe._r(t.get("partner_payout")), "merchant": pe._r(t.get("merchant_payout"))}}
    return await _cached("payouts", request, fn)


# ───────────────────────── gateway ─────────────────────────
@router.get("/gateway")
async def gateway(request: Request, admin=Depends(ADMIN)):
    f = _filters(request)

    async def fn():
        lo, hi = pe.bounds(f["date_from"], f["date_to"])
        rows = await pe.run(pe.fact_pipeline(f, lo, hi, [
            {"$match": {"method": {"$ne": None}}},
            {"$group": {"_id": "$method", "gross": {"$sum": "$gross"}, "fee": {"$sum": "$gateway_fee"},
                        "count": {"$sum": 1}, "with_fee": {"$sum": {"$cond": ["$has_gateway", 1, 0]}}}},
            {"$sort": {"gross": -1}}]))
        tot_g = sum(r["gross"] for r in rows)
        tot_f = sum(r["fee"] for r in rows)
        with_fee = sum(r["with_fee"] for r in rows)
        label = {"upi": "UPI", "card": "Card", "netbanking": "Net Banking", "wallet": "Wallet", "cod": "Cash on Service", "bank": "Bank"}
        return {
            "configured": with_fee > 0, "coverage": pe._pct(with_fee, sum(r["count"] for r in rows)),
            "total_gross": pe._r(tot_g), "total_fee": pe._r(tot_f), "fee_pct": pe._pct(tot_f, tot_g),
            "net_after_fee": pe._r(tot_g - tot_f),
            "by_method": [{"method": r["_id"], "label": label.get(r["_id"], (r["_id"] or "Other").title()),
                           "gross": pe._r(r["gross"]), "fee": pe._r(r["fee"]), "count": r["count"],
                           "with_fee": r["with_fee"], "fee_pct": pe._pct(r["fee"], r["gross"]),
                           "net": pe._r(r["gross"] - r["fee"])} for r in rows],
        }
    return await _cached("gateway", request, fn)


# ───────────────────────── anomalies ─────────────────────────
@router.get("/anomalies")
async def anomalies(request: Request, admin=Depends(ADMIN)):
    f = _filters(request)

    async def fn():
        lo, hi = pe.bounds(f["date_from"], f["date_to"])
        rng = {"$gte": lo, "$lte": hi}
        out = []
        dup = await db.payment_transactions.aggregate([
            {"$match": {"created_at": rng, "txn_ref": {"$nin": [None, ""]}}},
            {"$group": {"_id": "$txn_ref", "n": {"$sum": 1}, "amount": {"$sum": pe._num("$amount")}}},
            {"$match": {"n": {"$gt": 1}}}, {"$limit": 50}]).to_list(50)
        if dup:
            out.append({"code": "duplicate_txn_ref", "severity": "high", "title": "Duplicate transaction reference",
                        "detail": f"{len(dup)} transaction reference(s) appear more than once in payment records.",
                        "count": len(dup), "refs": [d["_id"] for d in dup[:5]]})
        facts = await pe.run(pe.fact_pipeline(f, lo, hi, [{"$facet": {
            "neg": [{"$match": {"$or": [{"platform_revenue": {"$lt": 0}}, {"net_earning": {"$lt": 0}}]}},
                    {"$project": {"_id": 0, "uid": 1, "ref": {"$ifNull": ["$booking_code", "$txn_ref"]}, "net_earning": 1}}, {"$limit": 20}],
            "var": [{"$match": {"$or": [{"variance": {"$gt": 1}}, {"variance": {"$lt": -1}}]}},
                    {"$project": {"_id": 0, "uid": 1, "ref": {"$ifNull": ["$booking_code", "$txn_ref"]}, "variance": 1}}, {"$limit": 20}],
            "fee": [{"$match": {"has_gateway": True, "gross": {"$gt": 0}}},
                    {"$match": {"$expr": {"$gt": ["$gateway_fee", {"$multiply": ["$gross", 0.035]}]}}},
                    {"$project": {"_id": 0, "uid": 1, "ref": {"$ifNull": ["$booking_code", "$txn_ref"]}}}, {"$limit": 20}],
            "fail_ref": [{"$match": {"refund_status": "failed"}}, {"$group": {"_id": None, "n": {"$sum": 1}, "amt": {"$sum": "$refund_pending"}}}],
            "rr": [{"$group": {"_id": None, "orders": {"$sum": {"$cond": [{"$in": ["$source", ["booking", "cancellation"]]}, 1, 0]}},
                               "canc": {"$sum": {"$cond": [{"$eq": ["$source", "cancellation"]}, 1, 0]}},
                               "gross": {"$sum": "$gross"}, "ref": {"$sum": {"$add": ["$refund", "$refund_pending"]}}}}],
        }}]))
        r = facts[0] if facts else {}
        if r.get("neg"):
            out.append({"code": "negative_earning", "severity": "high", "title": "Negative platform earning",
                        "detail": f"{len(r['neg'])} record(s) show platform earning below zero after gateway fees.",
                        "count": len(r["neg"]), "refs": [x["ref"] for x in r["neg"][:5]], "uids": [x["uid"] for x in r["neg"][:5]]})
        if r.get("var"):
            out.append({"code": "reconciliation_variance", "severity": "medium", "title": "Split does not reconcile",
                        "detail": f"{len(r['var'])} record(s) where collected ≠ tax + refunds + payouts + platform share (±₹1).",
                        "count": len(r["var"]), "refs": [x["ref"] for x in r["var"][:5]], "uids": [x["uid"] for x in r["var"][:5]]})
        if r.get("fee"):
            out.append({"code": "unusual_gateway_fee", "severity": "low", "title": "Unusual gateway fee",
                        "detail": f"{len(r['fee'])} payment(s) were charged a gateway fee above 3.5% of the amount.",
                        "count": len(r["fee"]), "refs": [x["ref"] for x in r["fee"][:5]], "uids": [x["uid"] for x in r["fee"][:5]]})
        fr = (r.get("fail_ref") or [{}])[0]
        if fr.get("n"):
            out.append({"code": "failed_refund", "severity": "medium", "title": "Failed refunds pending",
                        "detail": f"{fr['n']} refund(s) failed at the gateway — ₹{pe._r(fr['amt']):,.2f} still owed to customers.",
                        "count": fr["n"], "link": "refunds"})
        rr = (r.get("rr") or [{}])[0]
        if rr.get("orders", 0) >= 20 and rr.get("gross"):
            rate = rr["ref"] / rr["gross"] * 100
            if rate > 15:
                out.append({"code": "high_refund", "severity": "medium", "title": "Unusually high refund ratio",
                            "detail": f"Refunds are {rate:.1f}% of gross collection in this period (rule: > 15%).", "count": rr["canc"], "link": "refunds"})
        fp = await db.partner_withdrawals.count_documents({"status": "failed", "created_at": rng})
        fm = await db.merchant_withdrawals.count_documents({"status": "failed", "requested_at": rng})
        if fp + fm:
            out.append({"code": "failed_payout", "severity": "medium", "title": "Failed payouts",
                        "detail": f"{fp} partner and {fm} merchant withdrawal(s) failed and may need a retry.",
                        "count": fp + fm, "link": "pm_withdrawals"})
        miss = await db.bookings.aggregate([
            {"$match": {"status": {"$in": ["paid", "completed"]}, "created_at": rng}},
            {"$lookup": {"from": "commission_ledger", "localField": "code", "foreignField": "booking_code", "as": "l",
                         "pipeline": [{"$project": {"_id": 1}}, {"$limit": 1}]}},
            {"$match": {"l": {"$size": 0}}}, {"$project": {"_id": 0, "code": 1}}, {"$limit": 200}]).to_list(200)
        if miss:
            out.append({"code": "missing_settlement", "severity": "medium", "title": "Missing settlement",
                        "detail": f"{len(miss)}{'+' if len(miss) == 200 else ''} completed booking(s) have no commission-ledger settlement, so they are not counted in earnings.",
                        "count": len(miss), "refs": [m["code"] for m in miss[:5]], "link": "bookings"})
        return {"items": out, "rules": ["duplicate_txn_ref", "negative_earning", "reconciliation_variance",
                                        "unusual_gateway_fee", "failed_refund", "high_refund", "failed_payout", "missing_settlement"]}
    return await _cached("anomalies", request, fn)


# ───────────────────────── records (financial table) ─────────────────────────
REC_SORT = {"date", "gross", "platform_revenue", "net_earning", "refund", "partner_payout", "commission", "gateway_fee"}
REC_COLS = [("date", "Date"), ("source_label", "Type"), ("booking_code", "Booking"), ("txn_ref", "Transaction"),
            ("customer_name", "Customer"), ("partner_name", "Partner"), ("merchant_name", "Merchant"),
            ("service", "Service"), ("category", "Category"), ("city", "City"), ("method", "Method"),
            ("gross", "Gross"), ("tax", "GST"), ("commission", "Commission"), ("platform_fee", "Platform Fees"),
            ("cancellation_fee", "Cancellation Fee"), ("other_income", "Other Income"), ("refund", "Refund"),
            ("refund_pending", "Refund Pending"), ("partner_payout", "Partner Payout"),
            ("merchant_payout", "Merchant Payout"), ("gateway_fee", "Gateway Fee"),
            ("platform_revenue", "Platform Revenue"), ("net_earning", "Net Earning"), ("variance", "Variance")]
_LABEL_EXPR = {"$switch": {"branches": [{"case": {"$eq": ["$source", k]}, "then": v} for k, v in pe.SOURCE_LABEL.items()], "default": "$source"}}


@router.get("/records")
async def records(request: Request, sort: str = "date", order: str = "desc", page: int = 1, page_size: int = 10,
                  admin=Depends(ADMIN)):
    f = _filters(request)
    sort = sort if sort in REC_SORT else "date"
    page, page_size = max(1, page), min(max(1, page_size), 100)

    async def fn():
        lo, hi = pe.bounds(f["date_from"], f["date_to"])
        res = await pe.run(pe.fact_pipeline(f, lo, hi, [{"$facet": {
            "total": [{"$count": "n"}],
            "rows": [{"$sort": {sort: 1 if order == "asc" else -1, "uid": 1}}, {"$skip": (page - 1) * page_size},
                     {"$limit": page_size}, {"$set": {"source_label": _LABEL_EXPR}}],
        }}]))
        r = res[0] if res else {}
        rows = [{k: (pe._r(v) if isinstance(v, float) else v) for k, v in x.items()} for x in r.get("rows", [])]
        return {"rows": rows, "total": ((r.get("total") or [{}])[0]).get("n", 0), "page": page, "page_size": page_size,
                "sort": sort, "order": order}
    return await _cached("records", request, fn)


_SRC_COLL = {"booking": "commission_ledger", "cancellation": "refunds", "registration_fee": "payment_transactions",
             "starter_kit": "starter_kit_purchases", "membership": "membership_purchases"}


@router.get("/records/{uid}")
async def record_detail(uid: str, admin=Depends(ADMIN)):
    source, _, sid = uid.partition(":")
    if source == "withdrawal_fee":
        doc = await db.partner_withdrawals.find_one({"id": sid}, {"_id": 0}) or await db.merchant_withdrawals.find_one({"id": sid}, {"_id": 0})
    elif source in _SRC_COLL:
        doc = await db[_SRC_COLL[source]].find_one({"id": sid}, {"_id": 0})
    else:
        doc = None
    if not doc:
        raise HTTPException(404, "Financial record not found")
    date = doc.get("created_at") or doc.get("requested_at")
    rows = await pe.run(pe.fact_pipeline({}, date, date, [{"$match": {"uid": uid}}, {"$limit": 1},
                                                           {"$set": {"source_label": _LABEL_EXPR}}]))
    fact = {k: (pe._r(v) if isinstance(v, float) else v) for k, v in (rows[0] if rows else {}).items()}
    code = doc.get("booking_code")
    booking = await db.bookings.find_one({"code": code}, {"_id": 0, "otps": 0, "evidence": 0, "eligible_partner_ids": 0}) if code else None
    pays = await db.payment_transactions.find({"booking_code": code}, {"_id": 0}).to_list(10) if code else []
    ledger = await db.commission_ledger.find_one({"booking_code": code}, {"_id": 0}) if code else None
    refunds = await db.refunds.find({"booking_code": code}, {"_id": 0}).to_list(10) if code else []
    invoices = await db.invoices.find({"booking_id": booking["id"]}, {"_id": 0, "id": 1, "number": 1, "invoice_type": 1, "total": 1, "status": 1, "created_at": 1}).to_list(10) if booking else []
    audit = []
    ev = lambda at, label, kind: at and audit.append({"at": at, "label": label, "kind": kind})  # noqa: E731
    if booking:
        ev(booking.get("created_at"), "Booking created", "created")
        for t in booking.get("timeline") or []:
            ev(t.get("at"), f"Booking {str(t.get('status', '')).replace('_', ' ')}", "booking")
        ev(booking.get("updated_at"), "Booking last updated", "updated")
    for p in pays:
        for t in p.get("timeline") or []:
            ev(t.get("at"), t.get("label"), "payment")
    if ledger:
        ev(ledger.get("created_at"), "Settlement recorded — commission split written to ledger", "paid")
    for r in refunds:
        for t in r.get("timeline") or []:
            ev(t.get("at"), t.get("label"), "refunded")
        ev(r.get("completed_at"), "Refund completed", "refunded")
    for i in invoices:
        ev(i.get("created_at"), f"Invoice {i.get('number') or ''} generated", "created")
    if source in ("withdrawal_fee",):
        ev(doc.get("requested_at"), "Withdrawal requested", "created")
        ev(doc.get("processed_at"), f"Withdrawal {doc.get('status')}", "paid")
    if source in ("registration_fee", "starter_kit", "membership"):
        ev(doc.get("created_at"), f"{pe.SOURCE_LABEL[source]} paid", "paid")
    audit.sort(key=lambda x: x["at"])
    for p in pays:
        for k in ("upi_id", "bank", "account_number", "ifsc"):
            p.pop(k, None)
    doc.pop("bank", None)
    return {"uid": uid, "source": source, "fact": fact, "record": doc, "booking": booking, "payments": pays,
            "ledger": ledger, "refunds": refunds, "invoices": invoices, "audit": audit}


# ───────────────────────── export ─────────────────────────
@router.get("/export")
async def export(request: Request, report: str = "records", sort: str = "date", order: str = "desc", admin=Depends(ADMIN)):
    f = _filters(request)
    await pe.ensure_indexes()
    lo, hi = pe.bounds(f["date_from"], f["date_to"])
    direction = 1 if order == "asc" else -1
    if report == "records":
        sort = sort if sort in REC_SORT else "date"
        pipe = pe.fact_pipeline(f, lo, hi, [{"$sort": {sort: direction, "uid": 1}}, {"$set": {"source_label": _LABEL_EXPR}}])
        cols = REC_COLS
    elif report in pe.DIMS:
        sk = pe.SORTS.get(sort, "revenue")
        sk = "name" if sk == "_id" else sk
        pipe = pe.fact_pipeline(f, lo, hi, [{"$group": _dim_group(report)}, {"$match": {"_id": {"$ne": None}}}, {"$set": _DERIVED},
                                            {"$set": {"name": {"$ifNull": ["$name", "$_id"]},
                                                      "margin": {"$cond": [{"$gt": ["$revenue", 0]}, {"$round": [{"$multiply": [{"$divide": ["$profit", "$revenue"]}, 100]}, 2]}, None]}}},
                                            {"$sort": {sk: direction}}])
        cols = [("name", report.title()), ("orders", "Orders"), ("revenue", "Revenue (excl. GST)"), ("refunds", "Refunds"),
                ("commission", "Commission"), ("platform_fee", "Platform Fees"), ("platform_revenue", "Platform Revenue"),
                ("partner_payout", "Partner Payout"), ("merchant_payout", "Merchant Payout"), ("gateway_fee", "Gateway Fee"),
                ("profit", "Profit"), ("margin", "Margin %")]
    else:
        raise HTTPException(400, "Unsupported report")

    async def rows():
        async for d in db.commission_ledger.aggregate(pipe, allowDiskUse=True):
            yield {k: (round(v, 2) if isinstance(v, float) else v) for k, v in d.items()}
    name = f"platform_earning_{report}_{f['date_from'] or 'all'}_{f['date_to'] or 'time'}.csv"
    return StreamingResponse(pe.csv_stream(cols, rows()), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})
