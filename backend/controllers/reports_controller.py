"""Advanced Reports & Analytics controller.

Provides a business-wide analytics OVERVIEW (KPIs + trends + breakdowns) and a
server-side EXPORT engine that returns clean, flattened {columns, rows} datasets
with date-range filtering so the frontend can reliably download CSVs.
"""
from datetime import datetime, timedelta, timezone
from collections import OrderedDict
from config.database import db


# ───────────────────────── helpers ─────────────────────────
def _today():
    return datetime.now(timezone.utc)


def _range_bounds(date_from: str = "", date_to: str = ""):
    """Return (from_iso, to_iso, from_label, to_label). Defaults to last 30 days."""
    now = _today()
    if not date_to:
        to_d = now
    else:
        try:
            to_d = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc)
        except Exception:
            to_d = now
    if not date_from:
        from_d = to_d - timedelta(days=30)
    else:
        try:
            from_d = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
        except Exception:
            from_d = to_d - timedelta(days=30)
    from_iso = from_d.strftime("%Y-%m-%dT00:00:00")
    to_iso = to_d.strftime("%Y-%m-%dT23:59:59")
    return from_iso, to_iso, from_iso[:10], to_iso[:10]


def _in_range(iso: str, lo: str, hi: str) -> bool:
    if not iso:
        return False
    s = str(iso)
    return lo <= s <= hi + "Z"  # tolerate trailing Z / offsets


def _num(v):
    try:
        return float(v or 0)
    except Exception:
        return 0.0


def _day_series(lo: str, hi: str):
    """Ordered dict keyed by YYYY-MM-DD covering the inclusive range (capped at 120 days)."""
    out = OrderedDict()
    try:
        d0 = datetime.fromisoformat(lo[:10])
        d1 = datetime.fromisoformat(hi[:10])
    except Exception:
        return out
    days = (d1 - d0).days
    if days < 0:
        days = 0
    if days > 120:
        d0 = d1 - timedelta(days=120)
        days = 120
    for i in range(days + 1):
        out[(d0 + timedelta(days=i)).strftime("%Y-%m-%d")] = 0
    return out


def _forecast(revenue_trend):
    """Project the next 7 days of revenue using a trend-aware moving average.

    Uses the mean of the last up-to-14 days plus a gentle slope (difference
    between the last-7 and prior-7 day means) so the line reflects momentum.
    Returns [{date, projected}] continuing the day after the range end.
    """
    pts = [float(p.get("revenue") or 0) for p in (revenue_trend or [])]
    if not pts:
        return []
    tail = pts[-14:]
    base = sum(tail) / len(tail)
    if len(pts) >= 14:
        last7 = sum(pts[-7:]) / 7.0
        prev7 = sum(pts[-14:-7]) / 7.0
        slope = (last7 - prev7) / 7.0
    else:
        slope = 0.0
    try:
        last_date = datetime.fromisoformat((revenue_trend[-1]["date"])[:10])
    except Exception:
        last_date = _today()
    out = []
    for i in range(1, 8):
        val = base + slope * i
        if val < 0:
            val = 0.0
        d = (last_date + timedelta(days=i)).strftime("%Y-%m-%d")
        out.append({"date": d, "projected": round(val, 2)})
    return out


# ───────────────────────── OVERVIEW ─────────────────────────
async def reports_overview(date_from: str = "", date_to: str = ""):
    lo, hi, lo_lbl, hi_lbl = _range_bounds(date_from, date_to)

    all_bookings = await db.bookings.find({}, {"_id": 0}).to_list(20000)
    bookings = [b for b in all_bookings if _in_range(b.get("created_at"), lo, hi)]
    completed = [b for b in bookings if b.get("status") in ("completed", "paid")]
    cancelled = [b for b in bookings if b.get("status") == "cancelled"]
    active = [b for b in bookings if b.get("status") in
              ("searching", "assigned", "arrived_customer", "started", "pending_payment")]

    gross = sum(_num((b.get("pricing") or {}).get("total")) for b in completed)
    aov = round(gross / len(completed), 2) if completed else 0.0

    # commission ledger (platform / partner / merchant revenue split)
    ledger = await db.commission_ledger.find({}, {"_id": 0}).to_list(20000)
    ledger_r = [l for l in ledger if _in_range(l.get("created_at"), lo, hi)]
    platform_rev = round(sum(_num(l.get("platform_earning")) for l in ledger_r), 2)
    partner_earn = round(sum(_num(l.get("partner_earning")) for l in ledger_r), 2)
    merchant_ref = round(sum(_num(l.get("merchant_referral")) for l in ledger_r), 2)

    # refunds
    refunds = await db.refunds.find({}, {"_id": 0}).to_list(20000)
    refunds_r = [r for r in refunds if _in_range(r.get("created_at") or r.get("cancelled_at"), lo, hi)]
    refund_total = round(sum(_num(r.get("refund_amount") or r.get("amount")) for r in refunds_r), 2)

    # users
    total_customers = await db.users.count_documents({"role": "customer"})
    total_partners = await db.users.count_documents({"role": "partner"})
    total_merchants = await db.users.count_documents({"role": "merchant"})
    active_partners = await db.users.count_documents({"role": "partner", "partner_status": "online"})
    new_customers = await db.users.count_documents(
        {"role": "customer", "created_at": {"$gte": lo, "$lte": hi + "Z"}})

    # support tickets (new helpdesk)
    open_tickets = await db.support_tickets.count_documents({"status": {"$in": ["open", "in_progress"]}})

    # memberships + loyalty
    active_memberships = await db.users.count_documents({"membership.active": True})
    mp = await db.membership_purchases.find({}, {"_id": 0}).to_list(20000)
    membership_revenue = round(sum(_num(p.get("amount") or p.get("price")) for p in mp
                                   if _in_range(p.get("created_at"), lo, hi)), 2)
    loyalty_users = await db.users.find({"loyalty_points": {"$gt": 0}}, {"_id": 0, "loyalty_points": 1}).to_list(20000)
    loyalty_outstanding = int(sum(int(u.get("loyalty_points") or 0) for u in loyalty_users))

    pending_payouts = await db.partner_withdrawals.count_documents({"status": {"$in": ["pending", "requested"]}})

    total_b = len(bookings)
    kpis = {
        "gross_revenue": round(gross, 2),
        "platform_revenue": platform_rev,
        "partner_earnings": partner_earn,
        "merchant_referral": merchant_ref,
        "net_revenue": platform_rev,
        "refunds": refund_total,
        "refund_count": len(refunds_r),
        "total_bookings": total_b,
        "completed_bookings": len(completed),
        "cancelled_bookings": len(cancelled),
        "active_bookings": len(active),
        "avg_order_value": aov,
        "success_rate": round(len(completed) / total_b * 100, 1) if total_b else 0.0,
        "cancellation_rate": round(len(cancelled) / total_b * 100, 1) if total_b else 0.0,
        "new_customers": new_customers,
        "total_customers": total_customers,
        "total_partners": total_partners,
        "active_partners": active_partners,
        "total_merchants": total_merchants,
        "open_tickets": open_tickets,
        "active_memberships": active_memberships,
        "membership_revenue": membership_revenue,
        "loyalty_outstanding": loyalty_outstanding,
        "pending_payouts": pending_payouts,
    }

    # revenue trend (per day, completed booking totals + order count)
    rev_by_day = _day_series(lo, hi)
    ord_by_day = OrderedDict((k, 0) for k in rev_by_day)
    for b in completed:
        day = (b.get("created_at") or "")[:10]
        if day in rev_by_day:
            rev_by_day[day] += _num((b.get("pricing") or {}).get("total"))
            ord_by_day[day] += 1
    revenue_trend = [{"date": k, "revenue": round(rev_by_day[k], 2), "orders": ord_by_day[k]}
                     for k in rev_by_day]

    # customer growth (new signups per day)
    cust = await db.users.find({"role": "customer"}, {"_id": 0, "created_at": 1}).to_list(20000)
    grow = _day_series(lo, hi)
    for u in cust:
        day = (u.get("created_at") or "")[:10]
        if day in grow:
            grow[day] += 1
    customer_growth = [{"date": k, "new_customers": v} for k, v in grow.items()]

    # bookings by status
    status_order = ["searching", "assigned", "arrived_customer", "started",
                    "completed", "paid", "cancelled", "pending_payment"]
    bookings_by_status = [{"status": s, "count": len([b for b in bookings if b.get("status") == s])}
                          for s in status_order]
    bookings_by_status = [x for x in bookings_by_status if x["count"] > 0]

    # top services + by category (orders + revenue)
    svc = {}
    cat = {}
    for b in bookings:
        total = _num((b.get("pricing") or {}).get("total"))
        sname = b.get("service_name") or "Unknown"
        s = svc.setdefault(sname, {"name": sname, "orders": 0, "revenue": 0.0})
        s["orders"] += 1
        s["revenue"] += total
        cname = b.get("category_name") or "Uncategorized"
        cc = cat.setdefault(cname, {"name": cname, "orders": 0, "revenue": 0.0})
        cc["orders"] += 1
        cc["revenue"] += total
    top_services = sorted(svc.values(), key=lambda x: x["revenue"], reverse=True)[:8]
    for s in top_services:
        s["revenue"] = round(s["revenue"], 2)
    by_category = sorted(cat.values(), key=lambda x: x["revenue"], reverse=True)[:8]
    for c in by_category:
        c["revenue"] = round(c["revenue"], 2)

    # top partners by earnings in range (from ledger via booking join) — fall back to lifetime jobs
    earn_by_partner = {}
    code_to_partner = {}
    for b in bookings:
        if b.get("code") and b.get("partner_name"):
            code_to_partner[b["code"]] = b["partner_name"]
    for l in ledger_r:
        pn = code_to_partner.get(l.get("booking_code"))
        if pn:
            earn_by_partner[pn] = earn_by_partner.get(pn, 0) + _num(l.get("partner_earning"))
    if earn_by_partner:
        top_partners = sorted(
            [{"name": k, "earnings": round(v, 2)} for k, v in earn_by_partner.items()],
            key=lambda x: x["earnings"], reverse=True)[:6]
    else:
        tp = await db.users.find({"role": "partner"},
                                 {"_id": 0, "name": 1, "rating": 1, "jobs_completed": 1}).sort(
            "jobs_completed", -1).to_list(6)
        top_partners = [{"name": p.get("name") or "Partner", "jobs": p.get("jobs_completed", 0),
                         "rating": p.get("rating", 0)} for p in tp]

    return {
        "range": {"date_from": lo_lbl, "date_to": hi_lbl},
        "kpis": kpis,
        "revenue_trend": revenue_trend,
        "forecast": _forecast(revenue_trend),
        "customer_growth": customer_growth,
        "bookings_by_status": bookings_by_status,
        "top_services": top_services,
        "by_category": by_category,
        "top_partners": top_partners,
        "generated_at": _today().isoformat(),
    }


# ───────────────────────── EXPORT ─────────────────────────
EXPORT_DATASETS = {
    "bookings": {"label": "Bookings", "collection": "bookings", "date_field": "created_at"},
    "customers": {"label": "Customers", "collection": "users", "date_field": "created_at",
                  "filter": {"role": "customer"}},
    "partners": {"label": "Providers", "collection": "users", "date_field": "created_at",
                 "filter": {"role": "partner"}},
    "merchants": {"label": "Merchants", "collection": "users", "date_field": "created_at",
                  "filter": {"role": "merchant"}},
    "transactions": {"label": "Transactions", "collection": "transactions", "date_field": "created_at"},
    "refunds": {"label": "Refunds", "collection": "refunds", "date_field": "created_at"},
    "memberships": {"label": "Membership Purchases", "collection": "membership_purchases",
                    "date_field": "created_at"},
    "support_tickets": {"label": "Support Tickets", "collection": "support_tickets",
                        "date_field": "created_at"},
    "coupons": {"label": "Promo Codes", "collection": "coupons", "date_field": "created_at"},
    "loyalty": {"label": "Loyalty Ledger", "collection": "loyalty_ledger", "date_field": "created_at"},
}

# Column projections per dataset (clean, flattened, ordered).
_COLUMNS = {
    "bookings": ["code", "created_at", "status", "payment_status", "customer_name", "customer_phone",
                 "service_name", "category_name", "partner_name", "merchant_name", "schedule_type",
                 "total", "base", "gst", "discount"],
    "customers": ["name", "phone", "email", "status", "wallet_balance", "loyalty_points", "created_at"],
    "partners": ["name", "phone", "email", "status", "partner_status", "rating", "jobs_completed",
                 "kyc_status", "wallet_balance", "created_at"],
    "merchants": ["name", "phone", "email", "status", "kyc_status", "wallet_balance", "created_at"],
    "transactions": ["created_at", "kind", "amount", "user_id", "booking_code", "note", "status"],
    "refunds": ["created_at", "booking_code", "customer_name", "service_name", "original_amount",
                "refund_amount", "refund_pct", "platform_commission", "method", "status"],
    "memberships": ["created_at", "user_id", "plan_name", "amount", "status", "expires_at"],
    "support_tickets": ["code", "created_at", "subject", "category", "priority", "status",
                        "user_name", "user_role", "assigned_name", "unread_admin"],
    "coupons": ["code", "label", "discount_type", "discount_value", "min_order", "max_discount",
                "usage_limit", "used", "active", "created_at"],
    "loyalty": ["created_at", "user_id", "type", "points", "note", "booking_code"],
}


def _flatten_booking(b):
    p = b.get("pricing") or {}
    return {
        "code": b.get("code"), "created_at": b.get("created_at"), "status": b.get("status"),
        "payment_status": b.get("payment_status"), "customer_name": b.get("customer_name"),
        "customer_phone": b.get("customer_phone"), "service_name": b.get("service_name"),
        "category_name": b.get("category_name"), "partner_name": b.get("partner_name"),
        "merchant_name": b.get("merchant_name"), "schedule_type": b.get("schedule_type"),
        "total": p.get("total"), "base": p.get("base"), "gst": p.get("gst"),
        "discount": p.get("discount"),
    }


async def reports_export(dataset: str, date_from: str = "", date_to: str = "",
                         columns=None, filters=None):
    meta = EXPORT_DATASETS.get(dataset)
    if not meta:
        return {"dataset": dataset, "columns": [], "rows": [], "count": 0,
                "error": "Unknown dataset"}
    lo, hi, lo_lbl, hi_lbl = _range_bounds(date_from, date_to)
    query = dict(meta.get("filter") or {})
    docs = await db[meta["collection"]].find(query, {"_id": 0}).to_list(50000)

    # date filter (in-memory to tolerate mixed iso formats)
    df = meta["date_field"]
    if date_from or date_to:
        docs = [d for d in docs if _in_range(d.get(df) or d.get("cancelled_at"), lo, hi)]

    all_cols = _COLUMNS.get(dataset, [])
    # column subset (Custom Report Builder) — keep only valid, requested columns
    if columns:
        sel = [c for c in columns if (not all_cols or c in all_cols)]
        cols = sel or all_cols
    else:
        cols = all_cols

    rows = []
    for d in docs:
        flat = _flatten_booking(d) if dataset == "bookings" else d
        # equality/substring filters (case-insensitive) on flattened fields
        if filters:
            ok = True
            for fk, fv in filters.items():
                if fv in (None, "", []):
                    continue
                cell = flat.get(fk)
                if cell is None or str(fv).lower() not in str(cell).lower():
                    ok = False
                    break
            if not ok:
                continue
        row = {c: flat.get(c, "") for c in cols} if cols else \
            {k: v for k, v in flat.items() if not isinstance(v, (dict, list))}
        rows.append(row)

    # newest first
    rows.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
    out_cols = cols if cols else (list(rows[0].keys()) if rows else [])

    return {
        "dataset": dataset,
        "label": meta["label"],
        "columns": out_cols,
        "rows": rows,
        "count": len(rows),
        "range": {"date_from": lo_lbl, "date_to": hi_lbl},
    }


async def export_manifest():
    """List of available export datasets with live record counts."""
    out = []
    for key, meta in EXPORT_DATASETS.items():
        try:
            cnt = await db[meta["collection"]].count_documents(meta.get("filter") or {})
        except Exception:
            cnt = 0
        out.append({"key": key, "label": meta["label"], "count": cnt,
                    "columns": _COLUMNS.get(key, [])})
    return {"datasets": out}


# ───────────────────────── CUSTOM REPORT BUILDER (saved views) ─────────────────────────
import uuid as _uuid


async def list_report_views():
    views = await db.report_views.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"views": views}


async def save_report_view(data: dict):
    name = (data.get("name") or "").strip()
    dataset = data.get("dataset")
    if not name:
        return {"error": "Name required"}, 400
    if dataset not in EXPORT_DATASETS:
        return {"error": "Unknown dataset"}, 400
    all_cols = _COLUMNS.get(dataset, [])
    cols = [c for c in (data.get("columns") or []) if (not all_cols or c in all_cols)] or all_cols
    view = {
        "id": data.get("id") or str(_uuid.uuid4()),
        "name": name,
        "dataset": dataset,
        "columns": cols,
        "filters": {k: v for k, v in (data.get("filters") or {}).items() if v not in (None, "", [])},
        "date_from": data.get("date_from") or "",
        "date_to": data.get("date_to") or "",
        "created_at": _today().isoformat(),
    }
    await db.report_views.update_one({"id": view["id"]}, {"$set": view}, upsert=True)
    return view


async def delete_report_view(view_id: str):
    await db.report_views.delete_one({"id": view_id})
    return {"ok": True}


async def run_report_view(data: dict):
    """Run an ad-hoc or saved report definition and return {columns, rows, count}."""
    dataset = data.get("dataset")
    if dataset not in EXPORT_DATASETS:
        return {"error": "Unknown dataset", "columns": [], "rows": [], "count": 0}
    return await reports_export(
        dataset,
        date_from=data.get("date_from") or "",
        date_to=data.get("date_to") or "",
        columns=data.get("columns") or None,
        filters=data.get("filters") or None,
    )
