"""Admin executive analytics — every figure is derived from live collections
(bookings, commission_ledger, refunds, payment_transactions, users, withdrawals,
physical QR). Nothing here is seeded or hard-coded; empty data => zeros."""
from collections import OrderedDict
from datetime import datetime, timedelta, timezone

from config.database import db

_DAYS = {"today": 1, "yesterday": 1, "7d": 7, "15d": 15, "30d": 30,
         "90d": 90, "180d": 180, "365d": 365, "all": 100000}
DONE = ("completed", "paid")
STATUS_ORDER = ["searching", "assigned", "arrived_shop", "arrived_customer",
                "started", "completed", "paid", "on_hold", "cancelled", "pending"]


def pct_change(cur, prev):
    try:
        cur = float(cur or 0); prev = float(prev or 0)
    except (TypeError, ValueError):
        return None
    if prev == 0:
        return 100.0 if cur > 0 else 0.0
    return round((cur - prev) / abs(prev) * 100.0, 1)


def _total(b):
    return float((b.get("pricing") or {}).get("total", 0) or 0)


def _r(x):
    return round(float(x or 0), 2)


def _window(range_, date_from, date_to):
    now = datetime.now(timezone.utc)
    custom = bool(date_from and date_to)
    if custom:
        lo = date_from + "T00:00:00"; hi = date_to + "T23:59:59.999999"
        try:
            span = (datetime.fromisoformat(date_to) - datetime.fromisoformat(date_from)).days + 1
        except ValueError:
            span = 30
        d0 = datetime.fromisoformat(date_from)
        prev_hi = (d0 - timedelta(seconds=1)).isoformat()
        prev_lo = (d0 - timedelta(days=span)).isoformat()
        is_all = False
    else:
        days = _DAYS.get(range_, 30); is_all = range_ == "all"
        span = 3650 if is_all else days
        lo = (now - timedelta(days=days)).isoformat(); hi = now.isoformat()
        prev_hi = (now - timedelta(days=days, seconds=1)).isoformat()
        prev_lo = (now - timedelta(days=2 * days)).isoformat()
    return dict(lo=lo, hi=hi, prev_lo=prev_lo, prev_hi=prev_hi, span=span, is_all=is_all, custom=custom, now=now)


def _bucket_key(iso, bucket):
    d = (iso or "")[:10]
    if not d or bucket == "day":
        return d
    try:
        dt = datetime.fromisoformat(d)
    except ValueError:
        return d
    if bucket == "week":
        return (dt - timedelta(days=dt.weekday())).strftime("%Y-%m-%d")
    if bucket == "year":
        return dt.strftime("%Y-01-01")
    return dt.strftime("%Y-%m-01")


async def build(range: str = "30d", date_from: str = "", date_to: str = "", city: str = "",
                service: str = "", status: str = "", booking_type: str = "", payment_status: str = "",
                partner: str = "", customer: str = "", category: str = "", merchant: str = "",
                bucket: str = "auto") -> dict:
    w = _window(range, date_from, date_to)
    lo, hi, prev_lo, prev_hi, is_all = w["lo"], w["hi"], w["prev_lo"], w["prev_hi"], w["is_all"]

    def in_cur(c):
        c = c or ""
        return True if is_all else (bool(c) and lo <= c <= hi)

    def in_prev(c):
        c = c or ""
        return False if is_all else (bool(c) and prev_lo <= c <= prev_hi)

    def match(b):
        if city and ((b.get("address") or {}).get("city") or "") != city: return False
        if service and (b.get("service_name") or "") != service: return False
        if category and (b.get("category_name") or "") != category: return False
        if status and (b.get("status") or "") != status: return False
        if booking_type and (b.get("booking_type") or "") != booking_type: return False
        if payment_status and (b.get("payment_status") or "") != payment_status: return False
        if partner and (b.get("partner_name") or "") != partner: return False
        if customer and (b.get("customer_name") or "") != customer: return False
        if merchant and (b.get("merchant_name") or "") != merchant: return False
        return True

    all_bookings = await db.bookings.find({}, {"_id": 0, "otps": 0, "eligible_detail": 0, "eligible_partner_ids": 0,
                                               "offered_partner_ids": 0, "evidence": 0, "timeline": 0}).to_list(20000)
    ledger_by_code = {}
    async for l in db.commission_ledger.find({}, {"_id": 0}):
        ledger_by_code.setdefault(l.get("booking_code"), []).append(l)

    matched = [b for b in all_bookings if match(b)]
    bookings = [b for b in matched if in_cur(b.get("created_at"))]
    prev_bookings = [b for b in matched if in_prev(b.get("created_at"))]
    codes = {b.get("code") for b in bookings}

    def ledger_sum(bk, field):
        return sum(float(l.get(field, 0) or 0) for b in bk for l in ledger_by_code.get(b.get("code"), []))

    def agg(bk):
        done = [b for b in bk if b.get("status") in DONE]
        gmv = sum(_total(b) for b in done)
        return {
            "gmv": _r(gmv), "platform_revenue": _r(ledger_sum(bk, "platform_earning")),
            "partner_earnings": _r(ledger_sum(bk, "partner_earning")),
            "merchant_commission": _r(ledger_sum(bk, "merchant_referral")),
            "total_bookings": len(bk), "completed_bookings": len(done),
            "pending_bookings": len([b for b in bk if b.get("status") in ("pending", "on_hold", "searching")]),
            "cancelled_bookings": len([b for b in bk if b.get("status") == "cancelled"]),
            "avg_order_value": _r(gmv / len(done)) if done else 0,
            "active_customers": len({b.get("customer_id") for b in bk if b.get("customer_id")}),
            "active_partners": len({b.get("partner_id") for b in bk if b.get("partner_id")}),
            "active_merchants": len({b.get("merchant_id") for b in bk if b.get("merchant_id")}),
        }
    cur, prev = agg(bookings), agg(prev_bookings)

    # ---- refunds / tax (joined to bookings in window) ----
    refunds_docs = await db.refunds.find({}, {"_id": 0, "timeline": 0}).to_list(10000)
    ref_in = [r for r in refunds_docs if in_cur(r.get("initiated_at") or r.get("cancelled_at") or r.get("created_at"))
              and (not codes or r.get("booking_code") in codes or not (city or service or category or status or booking_type or payment_status or partner or customer or merchant))]
    refund_total = sum(float(r.get("amount") or r.get("refund_amount") or 0) for r in ref_in)
    pending_refunds = len([r for r in refunds_docs if (r.get("status") or "") in ("pending", "initiated", "processing")])
    tax_total = 0.0
    if codes:
        async for t in db.payment_transactions.find({"booking_code": {"$in": list(codes)}, "status": "success"}, {"_id": 0, "invoice.tax": 1}):
            tax_total += float(((t.get("invoice") or {}).get("tax")) or 0)

    # ---- people ----
    customers = await db.users.count_documents({"role": "customer"})
    partners_n = await db.users.count_documents({"role": "partner"})
    merchants = await db.users.count_documents({"role": "merchant"})
    online = await db.users.count_documents({"role": "partner", "partner_status": "online"})
    created_in = {} if is_all else {"created_at": {"$gte": lo, "$lte": hi}}
    new_customers = await db.users.count_documents({"role": "customer", **created_in})
    new_partners = await db.users.count_documents({"role": "partner", **created_in})
    new_merchants = await db.users.count_documents({"role": "merchant", **created_in})
    prev_customers = customers if is_all else await db.users.count_documents({"role": "customer", "created_at": {"$lte": prev_hi}})
    prev_partners = partners_n if is_all else await db.users.count_documents({"role": "partner", "created_at": {"$lte": prev_hi}})
    prev_merchants = merchants if is_all else await db.users.count_documents({"role": "merchant", "created_at": {"$lte": prev_hi}})

    # ---- status breakdown ----
    present = [s for s in STATUS_ORDER if any(b.get("status") == s for b in bookings)]
    extra = sorted({b.get("status") for b in bookings if b.get("status") and b.get("status") not in STATUS_ORDER})
    status_breakdown = [{"status": s, "count": len([b for b in bookings if b.get("status") == s])} for s in present + extra]

    # ---- partners ----
    users_p = {u.get("id"): u async for u in db.users.find({"role": "partner"}, {"_id": 0, "id": 1, "name": 1, "rating": 1, "photo": 1, "city": 1})}
    pstat = {}
    for b in bookings:
        pid = b.get("partner_id")
        if not pid and not b.get("partner_name"):
            continue
        key = pid or b.get("partner_name")
        s = pstat.setdefault(key, {"id": pid, "name": b.get("partner_name") or (users_p.get(pid) or {}).get("name") or "Partner",
                                   "jobs": 0, "bookings": 0, "cancelled": 0, "revenue": 0.0, "gmv": 0.0, "ratings": []})
        s["bookings"] += 1
        if b.get("status") in DONE:
            s["jobs"] += 1; s["gmv"] += _total(b)
        if b.get("status") == "cancelled":
            s["cancelled"] += 1
        if (b.get("review") or {}).get("rating"):
            s["ratings"].append(float(b["review"]["rating"]))
        for l in ledger_by_code.get(b.get("code"), []):
            s["revenue"] += float(l.get("partner_earning", 0) or 0)
    for s in pstat.values():
        u = users_p.get(s["id"]) or {}
        s["rating"] = round(sum(s["ratings"]) / len(s["ratings"]), 1) if s["ratings"] else (u.get("rating") or 0)
        s["photo"] = u.get("photo", ""); s["city"] = u.get("city", "")
        s["revenue"] = _r(s["revenue"]); s["gmv"] = _r(s["gmv"])
        s["completion_rate"] = round(s["jobs"] / s["bookings"] * 100, 1) if s["bookings"] else 0
        s["jobs_completed"] = s["jobs"]; s.pop("ratings", None)
    top_partners = sorted(pstat.values(), key=lambda x: (x["jobs"], x["revenue"]), reverse=True)[:10]

    # ---- services + categories ----
    def perf(keyfn, label):
        st = {}
        for b in bookings:
            nm = keyfn(b) or f"Unknown {label}"
            s = st.setdefault(nm, {"name": nm, "bookings": 0, "completed": 0, "cancelled": 0, "revenue": 0.0, "platform_revenue": 0.0, "ratings": [], "category": b.get("category_name") or ""})
            s["bookings"] += 1
            if b.get("status") in DONE:
                s["completed"] += 1; s["revenue"] += _total(b)
            if b.get("status") == "cancelled":
                s["cancelled"] += 1
            if (b.get("review") or {}).get("rating"):
                s["ratings"].append(float(b["review"]["rating"]))
            for l in ledger_by_code.get(b.get("code"), []):
                s["platform_revenue"] += float(l.get("platform_earning", 0) or 0)
        out = []
        for s in st.values():
            s["revenue"] = _r(s["revenue"]); s["platform_revenue"] = _r(s["platform_revenue"])
            s["completion_rate"] = round(s["completed"] / s["bookings"] * 100, 1) if s["bookings"] else 0
            s["cancellation_rate"] = round(s["cancelled"] / s["bookings"] * 100, 1) if s["bookings"] else 0
            s["avg_rating"] = round(sum(s["ratings"]) / len(s["ratings"]), 1) if s["ratings"] else None
            s["rated"] = len(s["ratings"]); s.pop("ratings", None)
            out.append(s)
        return sorted(out, key=lambda x: (x["bookings"], x["revenue"]), reverse=True)
    top_services = perf(lambda b: b.get("service_name"), "Service")[:12]
    top_categories = perf(lambda b: b.get("category_name"), "Category")[:12]

    # ---- cities ----
    cstat = {}
    for b in bookings:
        cty = (b.get("address") or {}).get("city") or ""
        if not cty:
            continue
        s = cstat.setdefault(cty, {"city": cty, "bookings": 0, "completed": 0, "gmv": 0.0, "revenue": 0.0, "c": set(), "p": set(), "m": set()})
        s["bookings"] += 1
        if b.get("status") in DONE:
            s["completed"] += 1; s["gmv"] += _total(b)
        for l in ledger_by_code.get(b.get("code"), []):
            s["revenue"] += float(l.get("platform_earning", 0) or 0)
        if b.get("customer_id"): s["c"].add(b["customer_id"])
        if b.get("partner_id"): s["p"].add(b["partner_id"])
        if b.get("merchant_id"): s["m"].add(b["merchant_id"])
    city_performance = []
    for s in cstat.values():
        city_performance.append({"city": s["city"], "bookings": s["bookings"], "completed": s["completed"], "gmv": _r(s["gmv"]),
                                 "revenue": _r(s["revenue"]), "customers": len(s["c"]), "partners": len(s["p"]), "merchants": len(s["m"])})
    city_performance.sort(key=lambda x: (x["bookings"], x["gmv"]), reverse=True)

    # ---- time series ----
    span_days = w["span"]
    if bucket not in ("day", "week", "month", "year"):
        bucket = "day" if span_days <= 45 else ("week" if span_days <= 210 else "month")
    ser = OrderedDict()
    def row(k):
        return ser.setdefault(k, {"date": k, "gmv": 0.0, "platform_revenue": 0.0, "partner_earnings": 0.0,
                                  "merchant_commission": 0.0, "refunds": 0.0, "bookings": 0, "completed": 0, "cancelled": 0})
    for b in sorted(bookings, key=lambda x: x.get("created_at") or ""):
        k = _bucket_key(b.get("created_at"), bucket)
        if not k:
            continue
        r = row(k); r["bookings"] += 1
        st = b.get("status") or "unknown"
        r[f"s_{st}"] = r.get(f"s_{st}", 0) + 1
        if st in DONE:
            r["gmv"] += _total(b); r["completed"] += 1
        if st == "cancelled":
            r["cancelled"] += 1
        for l in ledger_by_code.get(b.get("code"), []):
            r["platform_revenue"] += float(l.get("platform_earning", 0) or 0)
            r["partner_earnings"] += float(l.get("partner_earning", 0) or 0)
            r["merchant_commission"] += float(l.get("merchant_referral", 0) or 0)
    for rf in ref_in:
        k = _bucket_key(rf.get("initiated_at") or rf.get("cancelled_at") or rf.get("created_at"), bucket)
        if k:
            row(k)["refunds"] += float(rf.get("amount") or rf.get("refund_amount") or 0)
    combined_series = []
    for r in sorted(ser.values(), key=lambda x: x["date"]):
        for f in ("gmv", "platform_revenue", "partner_earnings", "merchant_commission", "refunds"):
            r[f] = _r(r[f])
        combined_series.append(r)

    # ---- operations / attention ----
    def n(pred):
        return len([b for b in matched if pred(b)])
    searching = n(lambda b: b.get("status") == "searching")
    assigned_n = n(lambda b: b.get("status") == "assigned")
    ongoing = n(lambda b: b.get("status") in ("arrived_shop", "arrived_customer", "started"))
    unassigned = n(lambda b: b.get("status") == "searching" and not b.get("partner_id"))
    pending_bk = n(lambda b: b.get("status") in ("pending", "on_hold"))
    failed_payments = n(lambda b: (b.get("payment_status") or "") in ("failed", "declined"))
    awaiting_payment = n(lambda b: b.get("status") == "pending_payment" or ((b.get("payment_status") or "") == "pending" and b.get("status") not in ("cancelled", "completed", "paid")))
    pending_payouts = await db.payouts.count_documents({"status": "pending"})
    pending_withdrawals = await db.partner_withdrawals.count_documents({"status": "pending"})
    try:
        pending_withdrawals += await db.merchant_withdrawals.count_documents({"status": "pending"})
    except Exception:  # noqa: BLE001
        pass
    kyc_pending = await db.users.count_documents({"role": {"$in": ["partner", "merchant"]}, "kyc_status": "pending"})
    open_tickets = await db.tickets.count_documents({"status": {"$in": ["open", "answered", "pending"]}})
    try:
        open_tickets += await db.support_tickets.count_documents({"status": {"$in": ["open", "answered", "pending"]}})
    except Exception:  # noqa: BLE001
        pass
    soon = (w["now"] + timedelta(days=30)).isoformat()
    expiring_kits = await db.users.count_documents({"role": "partner", "starter_kit.purchased": True,
                                                    "starter_kit.expires_at": {"$ne": None, "$lte": soon}})

    # ---- merchants ----
    users_m = {u.get("id"): u async for u in db.users.find({"role": "merchant"}, {"_id": 0, "id": 1, "name": 1, "shop_name": 1, "city": 1, "kyc_status": 1})}
    mstat = {}
    for b in bookings:
        mid = b.get("merchant_id")
        if not mid:
            continue
        s = mstat.setdefault(mid, {"id": mid, "name": b.get("merchant_name") or (users_m.get(mid) or {}).get("shop_name") or (users_m.get(mid) or {}).get("name") or "Merchant",
                                   "bookings": 0, "completed": 0, "gmv": 0.0, "commission": 0.0})
        s["bookings"] += 1
        if b.get("status") in DONE:
            s["completed"] += 1; s["gmv"] += _total(b)
        for l in ledger_by_code.get(b.get("code"), []):
            s["commission"] += float(l.get("merchant_referral", 0) or 0)
    for s in mstat.values():
        s["gmv"] = _r(s["gmv"]); s["commission"] = _r(s["commission"])
    top_merchants = sorted(mstat.values(), key=lambda x: (x["bookings"], x["gmv"]), reverse=True)[:8]
    merchant_bookings = [b for b in bookings if b.get("booking_type") == "merchant" or b.get("merchant_id")]
    verified_merchants = await db.users.count_documents({"role": "merchant", "kyc_status": "approved"})

    # ---- QR ----
    qr_total = await db.physical_qrs.count_documents({})
    qr_active = await db.physical_qrs.count_documents({"status": "active"})
    qr_disabled = await db.physical_qrs.count_documents({"status": "disabled"})
    qr_assigned = await db.physical_qrs.count_documents({"merchant_id": {"$nin": [None, ""]}})
    qr_scans_total = 0
    async for r in db.physical_qrs.aggregate([{"$group": {"_id": None, "s": {"$sum": "$scans"}}}]):
        qr_scans_total = int(r.get("s") or 0)
    scan_q = {"action": "scanned"}
    if not is_all:
        scan_q["at"] = {"$gte": lo, "$lte": hi}
    qr_scans_window = await db.physical_qr_events.count_documents(scan_q)
    qr_merchants_with_scans = len(await db.physical_qrs.distinct("merchant_id", {"scans": {"$gt": 0}, "merchant_id": {"$nin": [None, ""]}}))

    # ---- customers ----
    cust_counts = {}
    for b in bookings:
        if b.get("customer_id"):
            cust_counts[b["customer_id"]] = cust_counts.get(b["customer_id"], 0) + 1
    returning = len([c for c, k in cust_counts.items() if k >= 2])
    first_seen = {}
    for b in all_bookings:
        cid = b.get("customer_id")
        if cid and (cid not in first_seen or (b.get("created_at") or "") < first_seen[cid]):
            first_seen[cid] = b.get("created_at") or ""
    first_time = len([c for c in cust_counts if in_cur(first_seen.get(c))]) if not is_all else len(cust_counts)

    # ---- filters ----
    area_cities = sorted({(a.get("city") or "").strip() async for a in db.service_areas.find({}, {"_id": 0, "city": 1}) if a.get("city")})
    cat_names = sorted({(c.get("name") or "").strip() async for c in db.categories.find({}, {"_id": 0, "name": 1}) if c.get("name")})
    svc_names = sorted({(s.get("name") or "").strip() async for s in db.services.find({}, {"_id": 0, "name": 1}) if s.get("name")})
    def distinct(get):
        return sorted({v for v in (get(b) for b in all_bookings) if v})
    booking_cities = distinct(lambda b: (b.get("address") or {}).get("city"))
    filters_avail = {
        "cities": sorted(set(area_cities) | set(booking_cities)),
        "categories": cat_names, "services": svc_names,
        "statuses": distinct(lambda b: b.get("status")),
        "booking_types": distinct(lambda b: b.get("booking_type")),
        "payment_statuses": distinct(lambda b: b.get("payment_status")),
        "payment_methods": sorted([m for m in await db.payment_transactions.distinct("method") if m]),
        "partners": distinct(lambda b: b.get("partner_name"))[:200],
        "customers": distinct(lambda b: b.get("customer_name"))[:300],
        "merchants": distinct(lambda b: b.get("merchant_name"))[:200],
    }
    recent = sorted(bookings, key=lambda x: x.get("created_at") or "", reverse=True)[:150]
    for b in recent:
        b.pop("commission_config", None); b.pop("addons", None); b.pop("spare_parts", None); b.pop("notes", None)

    net_revenue = _r(cur["platform_revenue"] - cur["merchant_commission"] - refund_total)
    cancelled = cur["cancelled_bookings"]
    return {
        "generated_at": w["now"].isoformat(),
        "range": "custom" if w["custom"] else range,
        "bucket": bucket, "series_bucket": bucket,
        "window": {"from": lo[:10], "to": hi[:10], "prev_from": ("" if is_all else prev_lo[:10]), "prev_to": ("" if is_all else prev_hi[:10])},
        **{k: cur[k] for k in ("gmv", "platform_revenue", "partner_earnings", "merchant_commission", "total_bookings",
                                "completed_bookings", "pending_bookings", "cancelled_bookings", "avg_order_value",
                                "active_customers", "active_partners", "active_merchants")},
        "cancellation_rate": round((cancelled / cur["total_bookings"] * 100) if cur["total_bookings"] else 0, 1),
        "customers": customers, "partners": partners_n, "merchants": merchants, "online_partners": online,
        "new_customers": new_customers, "new_partners": new_partners, "new_merchants": new_merchants,
        "pending_payouts": pending_payouts, "open_tickets": open_tickets,
        "compare": {
            **{k: pct_change(cur[k], prev[k]) for k in ("gmv", "platform_revenue", "partner_earnings", "total_bookings",
                                                        "completed_bookings", "pending_bookings", "cancelled_bookings",
                                                        "avg_order_value", "active_customers", "active_partners", "active_merchants")},
            "customers": pct_change(customers, prev_customers), "partners": pct_change(partners_n, prev_partners),
            "merchants": pct_change(merchants, prev_merchants), "has_baseline": not is_all,
        },
        "previous": prev,
        "earnings": {
            "gmv": cur["gmv"], "platform_revenue": cur["platform_revenue"], "partner_earnings": cur["partner_earnings"],
            "merchant_commission": cur["merchant_commission"], "tax": _r(tax_total), "refunds": _r(refund_total),
            "net_revenue": net_revenue, "refund_count": len(ref_in),
            "gmv_change": pct_change(cur["gmv"], prev["gmv"]),
            "platform_revenue_change": pct_change(cur["platform_revenue"], prev["platform_revenue"]),
            "partner_earnings_change": pct_change(cur["partner_earnings"], prev["partner_earnings"]),
        },
        "top_partners": top_partners, "top_services": top_services, "top_categories": top_categories,
        "city_performance": city_performance,
        "combined_series": combined_series,
        "revenue_series": [{"date": r["date"], "value": r["platform_revenue"]} for r in combined_series],
        "booking_series": [{"date": r["date"], "value": r["bookings"]} for r in combined_series],
        "status_breakdown": status_breakdown,
        "operations": {"searching": searching, "assigned": assigned_n, "ongoing": ongoing, "unassigned": unassigned,
                       "pending": pending_bk, "active_total": searching + assigned_n + ongoing,
                       "awaiting_payment": awaiting_payment, "failed_payments": failed_payments,
                       "pending_refunds": pending_refunds, "pending_withdrawals": pending_withdrawals, "kyc_pending": kyc_pending},
        "needs_attention": {"pending_payouts": pending_payouts, "failed_payments": failed_payments, "unassigned_bookings": unassigned,
                            "pending_refunds": pending_refunds, "open_tickets": open_tickets, "kyc_pending": kyc_pending,
                            "pending_withdrawals": pending_withdrawals, "expiring_starter_kits": expiring_kits},
        "customer_analytics": {"total": customers, "new": new_customers, "active": cur["active_customers"], "returning": returning,
                               "first_time": first_time, "revenue": cur["gmv"], "avg_booking_value": cur["avg_order_value"],
                               "booking_frequency": round(len(bookings) / cur["active_customers"], 2) if cur["active_customers"] else 0},
        "merchant_analytics": {"total": merchants, "verified": verified_merchants, "new": new_merchants,
                               "generating_bookings": cur["active_merchants"], "bookings": len(merchant_bookings),
                               "gmv": _r(sum(_total(b) for b in merchant_bookings if b.get("status") in DONE)),
                               "commission": cur["merchant_commission"], "qr_scans": qr_scans_total,
                               "top": top_merchants},
        "qr_analytics": {"total": qr_total, "active": qr_active, "disabled": qr_disabled, "assigned": qr_assigned,
                         "unassigned": max(qr_total - qr_assigned, 0), "scans_total": qr_scans_total,
                         "scans_in_window": qr_scans_window, "merchants_with_scans": qr_merchants_with_scans,
                         "activation_rate": round(qr_active / qr_total * 100, 1) if qr_total else 0},
        "filters_available": filters_avail,
        "recent_bookings": recent,
    }
