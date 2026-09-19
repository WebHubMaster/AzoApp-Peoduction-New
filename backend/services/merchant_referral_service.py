"""Merchant Referral & Commission engine (privacy-safe, ledger-sourced).

Single source of truth = `commission_ledger`. A merchant ONLY sees:
  • Customers referred through the merchant (booking.merchant_id == mid)  -> customer_merchant_id
  • Partners registered with the merchant code (user.referred_by_merchant == mid) -> referral_merchant_id
and ONLY the commission that was ACTUALLY earned by the merchant on those.

IMPORTANT (privacy/security): NO customer/partner phone, email, address or any
direct contact field is ever returned by these functions. Configured referral
percentages are read dynamically from the ledger rows (never hardcoded); the
customer-referral % and partner-referral % are kept strictly separate.
"""
from datetime import datetime, timezone, timedelta
from config.database import db


# ─────────────────────────── time helpers ───────────────────────────
def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _dt(s):
    if not s:
        return None
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return d.replace(tzinfo=None) if d.tzinfo else d
    except Exception:  # noqa: BLE001
        return None


def _iso(dt):
    """Convert datetime to ISO string, or return as-is if already string/None"""
    if dt is None:
        return ""
    if isinstance(dt, str):
        return dt
    if isinstance(dt, datetime):
        return dt.isoformat() + "Z" if dt.tzinfo is None else dt.isoformat()
    return str(dt)


def _windows(now=None):
    now = now or _now()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yest = today - timedelta(days=1)
    week = today - timedelta(days=now.weekday())
    month = today.replace(day=1)
    last_month_end = month
    last_month = (month - timedelta(days=1)).replace(day=1)
    return {"today": today, "yesterday_start": yest, "week": week, "month": month,
            "last_month_start": last_month, "last_month_end": last_month_end}


def _buckets(rows, amount_fn):
    w = _windows()
    res = {k: 0.0 for k in ("total", "today", "yesterday", "this_week", "this_month", "last_month")}
    for r in rows:
        a = float(amount_fn(r) or 0)
        if a <= 0:
            continue
        d = _dt(r.get("created_at"))
        res["total"] += a
        if d is None:
            continue
        if d >= w["today"]:
            res["today"] += a
        if w["yesterday_start"] <= d < w["today"]:
            res["yesterday"] += a
        if d >= w["week"]:
            res["this_week"] += a
        if d >= w["month"]:
            res["this_month"] += a
        if w["last_month_start"] <= d < w["last_month_end"]:
            res["last_month"] += a
    return {k: round(v, 2) for k, v in res.items()}


# ─────────────────────────── ledger fetch ───────────────────────────
def _cust_amt(r):
    return float(r.get("merchant_customer", r.get("merchant_booking", 0)) or 0)


def _part_amt(r):
    return float(r.get("merchant_referral", 0) or 0)


def _cust_pct(r):
    return round(float((r.get("rates") or {}).get("merchant_customer_pct") or 0), 2)


def _part_pct(r):
    return round(float((r.get("rates") or {}).get("merchant_partner_referral_pct") or 0), 2)


async def _customer_rows(mid):
    return await db.commission_ledger.find(
        {"customer_merchant_id": mid}, {"_id": 0}).sort("created_at", -1).to_list(20000)


async def _partner_rows(mid):
    return await db.commission_ledger.find(
        {"referral_merchant_id": mid}, {"_id": 0}).sort("created_at", -1).to_list(20000)


async def _booking_map(booking_ids):
    ids = [b for b in set(booking_ids) if b]
    if not ids:
        return {}
    rows = await db.bookings.find(
        {"id": {"$in": ids}},
        {"_id": 0, "id": 1, "service_name": 1, "category_name": 1, "status": 1,
         "scheduled_at": 1, "created_at": 1, "customer_name": 1, "partner_name": 1,
         "customer_id": 1, "coupon_code": 1}).to_list(len(ids))
    return {b["id"]: b for b in rows}


def _svc_name(bk):
    bk = bk or {}
    return bk.get("service_name") or bk.get("category_name") or "Service"


# ─────────────────────────── COMMISSION REPORT ───────────────────────────
async def commission_report(mid):
    cust = await _customer_rows(mid)
    part = await _partner_rows(mid)
    cb = _buckets(cust, _cust_amt)
    pb = _buckets(part, _part_amt)
    combined = {k: round(cb[k] + pb[k], 2) for k in cb}
    return {
        "total": combined["total"],
        "today": combined["today"],
        "yesterday": combined["yesterday"],
        "this_week": combined["this_week"],
        "this_month": combined["this_month"],
        "last_month": combined["last_month"],
        "customer_commission": cb["total"],
        "partner_commission": pb["total"],
        "customer_count": len({r.get("customer_id") for r in cust if _cust_amt(r) > 0}),
        "partner_count": len({r.get("partner_id") for r in part if _part_amt(r) > 0}),
        "transactions": sum(1 for r in cust if _cust_amt(r) > 0) + sum(1 for r in part if _part_amt(r) > 0),
    }


# ─────────────────────────── COMMISSION HISTORY ───────────────────────────
def _apply_date_filter(rows, f):
    rng = (f.get("range") or "").strip()
    if not rng:
        return rows
    w = _windows()
    if rng == "today":
        lo, hi = w["today"], None
    elif rng == "yesterday":
        lo, hi = w["yesterday_start"], w["today"]
    elif rng == "this_week":
        lo, hi = w["week"], None
    elif rng == "this_month":
        lo, hi = w["month"], None
    elif rng == "last_month":
        lo, hi = w["last_month_start"], w["last_month_end"]
    elif rng == "custom":
        lo = _dt((f.get("date_from") or "") + "T00:00:00") if f.get("date_from") else None
        hi = _dt((f.get("date_to") or "") + "T23:59:59") if f.get("date_to") else None
    else:
        return rows
    out = []
    for r in rows:
        d = _dt(r.get("created_at"))
        if d is None:
            continue
        if lo and d < lo:
            continue
        if hi and d >= hi:
            continue
        out.append(r)
    return out


def _paginate(items, page, page_size):
    page = max(1, int(page or 1))
    size = min(100, max(1, int(page_size or 10)))
    tot = len(items)
    return {"items": items[(page - 1) * size: page * size], "total": tot, "page": page,
            "page_size": size, "pages": max(1, (tot + size - 1) // size)}


async def commission_history(mid, f=None):
    f = f or {}
    cust = await _customer_rows(mid)
    part = await _partner_rows(mid)
    entries = []
    for r in cust:
        if _cust_amt(r) > 0:
            entries.append(("customer", r))
    for r in part:
        if _part_amt(r) > 0:
            entries.append(("partner", r))
    bmap = await _booking_map([r.get("booking_id") for _, r in entries])
    # resolve privacy-safe names
    cust_ids = {r.get("customer_id") for t, r in entries if t == "customer" and r.get("customer_id")}
    part_ids = {r.get("partner_id") for t, r in entries if t == "partner" and r.get("partner_id")}
    umap = {}
    if cust_ids or part_ids:
        for u in await db.users.find({"id": {"$in": list(cust_ids | part_ids)}}, {"_id": 0, "id": 1, "name": 1}).to_list(20000):
            umap[u["id"]] = u.get("name")
    out = []
    for t, r in entries:
        bk = bmap.get(r.get("booking_id")) or {}
        if t == "customer":
            name = umap.get(r.get("customer_id")) or bk.get("customer_name") or "Customer"
            earned, pct = round(_cust_amt(r), 2), _cust_pct(r)
        else:
            name = umap.get(r.get("partner_id")) or bk.get("partner_name") or "Partner"
            earned, pct = round(_part_amt(r), 2), _part_pct(r)
        out.append({
            "id": r.get("id"),
            "date": r.get("created_at"),
            "booking_id": r.get("booking_id"),
            "booking_code": r.get("booking_code"),
            "name": name,
            "referral_type": t,
            "service_name": _svc_name(bk),
            "eligible_amount": round(float(r.get("base") or 0), 2),
            "commission_pct": pct,
            "earned": earned,
            "status": bk.get("status") or r.get("kind") or "completed",
            "coupon_code": bk.get("coupon_code") or None,
        })
    # filters
    typ = (f.get("type") or "").strip()
    if typ in ("customer", "partner"):
        out = [e for e in out if e["referral_type"] == typ]
    q = (f.get("q") or "").strip().lower()
    if q:
        out = [e for e in out if q in (e["name"] or "").lower()
               or q in (e["service_name"] or "").lower()
               or q in (e["booking_code"] or "").lower()]
    status = (f.get("status") or "").strip()
    if status:
        out = [e for e in out if (e["status"] or "") == status]
    out = _apply_date_filter([{**e, "created_at": e["date"]} for e in out], f)
    out.sort(key=lambda e: e.get("date") or "", reverse=True)
    res = _paginate(out, f.get("page"), f.get("page_size"))
    res["summary"] = await commission_report(mid)
    return res


# ─────────────────────────── MY CUSTOMERS ───────────────────────────
async def list_customers(mid, f=None):
    f = f or {}
    cust = await _customer_rows(mid)
    # group by customer
    grp = {}
    for r in cust:
        amt = _cust_amt(r)
        cid = r.get("customer_id")
        if not cid:
            continue
        g = grp.setdefault(cid, {"customer_id": cid, "total_commission": 0.0, "services": 0,
                                 "last_at": None, "name": None})
        if amt > 0:
            g["total_commission"] += amt
            g["services"] += 1
        ca = r.get("created_at")
        if ca and (g["last_at"] is None or ca > g["last_at"]):
            g["last_at"] = ca
    # names + completed-service counts from bookings under this merchant. Customers who
    # booked THROUGH the merchant's QR/code (booking.merchant_id == mid) belong in the
    # list even if no commission has been earned yet.
    bk_rows = await db.bookings.find(
        {"merchant_id": mid}, {"_id": 0, "customer_id": 1, "customer_name": 1, "status": 1,
                               "created_at": 1}).to_list(20000)
    name_map, total_srv, completed_srv = {}, {}, {}
    _DONE = {"completed", "closed", "paid"}
    for b in bk_rows:
        cid = b.get("customer_id")
        if not cid:
            continue
        name_map.setdefault(cid, b.get("customer_name"))
        total_srv[cid] = total_srv.get(cid, 0) + 1
        if b.get("status") in _DONE:
            completed_srv[cid] = completed_srv.get(cid, 0) + 1
        g = grp.setdefault(cid, {"customer_id": cid, "total_commission": 0.0, "services": 0,
                                 "last_at": None, "name": b.get("customer_name")})
        ca = b.get("created_at")
        if ca and (g["last_at"] is None or ca > g["last_at"]):
            g["last_at"] = ca
    # also include referred customers who signed up with the merchant code (no bookings yet)
    for u in await db.users.find({"referred_by_merchant": mid, "role": "customer"},
                                 {"_id": 0, "id": 1, "name": 1}).to_list(20000):
        grp.setdefault(u["id"], {"customer_id": u["id"], "total_commission": 0.0, "services": 0,
                                 "last_at": None, "name": u.get("name")})
        name_map.setdefault(u["id"], u.get("name"))
    items = []
    for cid, g in grp.items():
        items.append({
            "id": cid,
            "name": g.get("name") or name_map.get(cid) or "Customer",
            "total_commission": round(g["total_commission"], 2),
            "commission_services": g["services"],
            "total_services": total_srv.get(cid, 0),
            "completed_services": completed_srv.get(cid, 0),
            "last_activity_at": _iso(g["last_at"]),
            "status": "active",
        })
    # filters
    q = (f.get("q") or "").strip().lower()
    if q:
        items = [c for c in items if q in (c["name"] or "").lower()]
    items.sort(key=lambda c: (c["total_commission"], c["last_activity_at"] or ""), reverse=True)
    res = _paginate(items, f.get("page"), f.get("page_size"))
    # report cards (customer commission)
    cb = _buckets(cust, _cust_amt)
    res["report"] = {
        "total_commission": cb["total"], "today": cb["today"], "yesterday": cb["yesterday"],
        "this_month": cb["this_month"], "last_month": cb["last_month"],
        "total_customers": len(items),
        "total_services": sum(total_srv.values()),
        "total_completed_services": sum(completed_srv.values()),
    }
    return res


async def customer_detail(mid, cid):
    from fastapi import HTTPException
    cust = [r for r in await _customer_rows(mid) if r.get("customer_id") == cid]
    u = await db.users.find_one({"id": cid}, {"_id": 0, "name": 1, "created_at": 1})
    bk_rows = await db.bookings.find(
        {"merchant_id": mid, "customer_id": cid},
        {"_id": 0, "customer_name": 1, "status": 1}).to_list(20000)
    if not cust and not bk_rows and not u:
        raise HTTPException(404, "Customer not found")
    _DONE = {"completed", "closed", "paid"}
    name = (u or {}).get("name") or (bk_rows[0].get("customer_name") if bk_rows else None) or "Customer"
    bmap = await _booking_map([r.get("booking_id") for r in cust])
    services = []
    for r in cust:
        if _cust_amt(r) <= 0:
            continue
        bk = bmap.get(r.get("booking_id")) or {}
        services.append({
            "service_name": _svc_name(bk), "date": r.get("created_at"),
            "booking_code": r.get("booking_code"),
            "eligible_amount": round(float(r.get("base") or 0), 2),
            "commission_pct": _cust_pct(r), "earned": round(_cust_amt(r), 2),
            "status": bk.get("status") or "completed",
        })
    cb = _buckets(cust, _cust_amt)
    return {
        "id": cid, "name": name, "customer_code": "CUS-" + (cid or "")[:6].upper(),
        "member_since": (u or {}).get("created_at"),
        "total_services": len(bk_rows),
        "completed_services": sum(1 for b in bk_rows if b.get("status") in _DONE),
        "services": services,
        "report": {
            "total_commission": cb["total"], "today": cb["today"], "yesterday": cb["yesterday"],
            "this_month": cb["this_month"], "last_month": cb["last_month"],
            "commission_services": len(services),
        },
        "total_commission": cb["total"],
    }


# ─────────────────────────── MY PARTNERS ───────────────────────────
def _partner_status(u):
    if not u:
        return "inactive"
    if u.get("suspended") or u.get("status") == "suspended":
        return "suspended"
    if u.get("kyc_status") == "approved":
        return "active"
    return "pending"


async def list_partners(mid, f=None):
    f = f or {}
    part = await _partner_rows(mid)
    grp = {}
    for r in part:
        pid = r.get("partner_id")
        if not pid:
            continue
        g = grp.setdefault(pid, {"partner_id": pid, "total_commission": 0.0, "completed_services": 0,
                                 "last_at": None})
        amt = _part_amt(r)
        if amt > 0:
            g["total_commission"] += amt
            g["completed_services"] += 1
        ca = r.get("created_at")
        if ca and (g["last_at"] is None or ca > g["last_at"]):
            g["last_at"] = ca
    # all partners registered with the merchant code (include zero-commission ones)
    users = await db.users.find(
        {"referred_by_merchant": mid, "role": "partner"},
        {"_id": 0, "id": 1, "name": 1, "kyc_status": 1, "status": 1, "suspended": 1,
         "created_at": 1, "service_categories": 1, "category": 1, "primary_category": 1}).to_list(20000)
    umap = {u["id"]: u for u in users}
    for u in users:
        grp.setdefault(u["id"], {"partner_id": u["id"], "total_commission": 0.0,
                                 "completed_services": 0, "last_at": None})
    # also fetch names/details for partners that earned but aren't in referred list (edge)
    missing = [pid for pid in grp if pid not in umap]
    if missing:
        for u in await db.users.find({"id": {"$in": missing}, "role": "partner"},
                                     {"_id": 0, "id": 1, "name": 1, "kyc_status": 1, "status": 1,
                                      "suspended": 1, "created_at": 1, "service_categories": 1,
                                      "category": 1, "primary_category": 1}).to_list(20000):
            umap[u["id"]] = u
    items = []
    for pid, g in grp.items():
        u = umap.get(pid) or {}
        cats = u.get("service_categories") or []
        category = (cats[0] if cats else None) or u.get("category") or u.get("primary_category") or "—"
        items.append({
            "id": pid,
            "name": u.get("name") or "Partner",
            "partner_code": "PTR-" + (pid or "")[:6].upper(),
            "category": category,
            "registered_at": u.get("created_at"),
            "status": _partner_status(u),
            "completed_services": g["completed_services"],
            "total_commission": round(g["total_commission"], 2),
            "last_activity_at": _iso(g["last_at"]),
        })
    q = (f.get("q") or "").strip().lower()
    if q:
        items = [p for p in items if q in (p["name"] or "").lower() or q in (p["partner_code"] or "").lower()]
    status = (f.get("status") or "").strip()
    if status:
        items = [p for p in items if p["status"] == status]
    cat = (f.get("category") or "").strip().lower()
    if cat:
        items = [p for p in items if cat in (p["category"] or "").lower()]
    items.sort(key=lambda p: (p["total_commission"], p["last_activity_at"]), reverse=True)
    res = _paginate(items, f.get("page"), f.get("page_size"))
    pb = _buckets(part, _part_amt)
    res["report"] = {
        "total_commission": pb["total"], "today": pb["today"], "yesterday": pb["yesterday"],
        "this_month": pb["this_month"], "last_month": pb["last_month"],
        "total_partners": len(items),
        "active_partners": sum(1 for p in items if p["status"] == "active"),
        "total_completed_services": sum(p["completed_services"] for p in items),
    }
    return res


async def partner_detail(mid, pid):
    from fastapi import HTTPException
    part = [r for r in await _partner_rows(mid) if r.get("partner_id") == pid]
    u = await db.users.find_one(
        {"id": pid}, {"_id": 0, "name": 1, "kyc_status": 1, "status": 1, "suspended": 1,
                      "created_at": 1, "service_categories": 1, "category": 1, "primary_category": 1})
    if not part and not u:
        raise HTTPException(404, "Partner not found")
    cats = (u or {}).get("service_categories") or []
    category = (cats[0] if cats else None) or (u or {}).get("category") or (u or {}).get("primary_category") or "—"
    bmap = await _booking_map([r.get("booking_id") for r in part])
    services = []
    for r in part:
        if _part_amt(r) <= 0:
            continue
        bk = bmap.get(r.get("booking_id")) or {}
        services.append({
            "service_name": _svc_name(bk), "date": r.get("created_at"),
            "booking_code": r.get("booking_code"),
            "eligible_amount": round(float(r.get("base") or 0), 2),
            "commission_pct": _part_pct(r), "earned": round(_part_amt(r), 2),
            "status": bk.get("status") or "completed",
        })
    pb = _buckets(part, _part_amt)
    return {
        "id": pid, "name": (u or {}).get("name") or "Partner",
        "partner_code": "PTR-" + (pid or "")[:6].upper(),
        "category": category,
        "registered_at": (u or {}).get("created_at"),
        "status": _partner_status(u),
        "completed_services": len(services),
        "services": services,
        "report": {
            "total_commission": pb["total"], "today": pb["today"], "yesterday": pb["yesterday"],
            "this_month": pb["this_month"], "last_month": pb["last_month"],
            "commission_services": len(services),
        },
        "total_commission": pb["total"],
    }
