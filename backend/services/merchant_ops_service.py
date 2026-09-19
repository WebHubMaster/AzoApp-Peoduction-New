"""Advanced merchant operations — dashboard KPIs, customers, service history,
reminders, complaints and performance analytics (Module 2.2 + 2.3)."""
from fastapi import HTTPException
from datetime import datetime, timezone, timedelta
from config.database import db, now_iso
from models.user import new_id
from services import merchant_wallet_service as mws

_DONE = ("completed", "paid")
_PENDING = ("pending", "searching", "assigned", "accepted", "in_progress", "on_the_way", "arrived")


async def _merchant_bookings(mid):
    return await db.bookings.find({"merchant_id": mid}, {"_id": 0}).sort("created_at", -1).to_list(3000)


async def _commission_rows(mid):
    return await db.commission_ledger.find(
        {"$or": [{"referral_merchant_id": mid}, {"customer_merchant_id": mid}]},
        {"_id": 0}).sort("created_at", -1).to_list(3000)


def _earn(l, mid):
    v = 0.0
    if l.get("referral_merchant_id") == mid:
        v += float(l.get("merchant_referral", 0))
    if l.get("customer_merchant_id") == mid:
        v += float(l.get("merchant_customer", l.get("merchant_booking", 0)))
    return v


async def dashboard(merchant):
    """Merchant home = pure Referral & Commission dashboard.

    Every number here is REAL and privacy-safe:
      • commission buckets come straight from the merchant referral ledger
        (actual earned only — merchant's own cut, never the full base)
      • customer/partner counts are the merchant's referred network
      • recent activity is privacy-safe commission history (no contact data)
    No bookings, no reminders, no repeat-customer guesswork.
    """
    from services import merchant_referral_service as mrs
    mid = merchant["id"]

    report = await mrs.commission_report(mid)
    cust_list = await mrs.list_customers(mid, {"page": 1, "page_size": 1})
    part_list = await mrs.list_partners(mid, {"page": 1, "page_size": 1})
    history = await mrs.commission_history(mid, {"page": 1, "page_size": 8})
    wallet = await mws.wallet_summary(merchant)

    recent = [{
        "id": h.get("id"),
        "name": h.get("name"),
        "referral_type": h.get("referral_type"),
        "service_name": h.get("service_name"),
        "booking_code": h.get("booking_code"),
        "earned": h.get("earned"),
        "created_at": h.get("date"),
    } for h in (history.get("items") or [])]

    return {
        "commission": {
            "total": report["total"], "today": report["today"], "yesterday": report["yesterday"],
            "this_week": report["this_week"], "this_month": report["this_month"],
            "last_month": report["last_month"],
            "customer": report["customer_commission"], "partner": report["partner_commission"],
            # legacy aliases (kept so older callers don't break)
            "lifetime": report["total"], "week": report["this_week"], "month": report["this_month"],
        },
        "counts": {
            "customers": cust_list.get("total", 0),
            "partners": part_list.get("total", 0),
            "active_partners": (part_list.get("report") or {}).get("active_partners", 0),
            "transactions": report["transactions"],
        },
        "wallet": {"available": wallet["available_balance"], "pending": wallet["pending_balance"],
                   "withdrawable": wallet["withdrawable_balance"]},
        "recent_activity": recent,
    }


async def my_customers(merchant, q=""):
    mid = merchant["id"]
    bookings = await _merchant_bookings(mid)
    tag_map = {t["customer_key"]: t.get("tags", []) for t in
               await db.merchant_customer_tags.find({"merchant_id": mid}, {"_id": 0}).to_list(3000)}
    agg = {}
    for b in bookings:
        key = b.get("customer_phone") or b.get("customer_id")
        if not key:
            continue
        c = agg.setdefault(key, {"customer_key": key, "customer_phone": b.get("customer_phone"),
                                 "customer_id": b.get("customer_id"), "name": b.get("customer_name") or "Customer",
                                 "bookings": 0, "completed": 0, "total_spent": 0.0,
                                 "last_service": None, "last_date": None})
        c["bookings"] += 1
        if b.get("status") in _DONE:
            c["completed"] += 1
            c["total_spent"] += float((b.get("pricing") or {}).get("total", 0))
        if not c["last_date"]:
            c["last_service"] = (b.get("service") or {}).get("name") or b.get("service_name")
            c["last_date"] = b.get("created_at")
    items = list(agg.values())
    threshold = 0.0
    try:
        threshold = float(merchant.get("vip_threshold") or 0)
    except (TypeError, ValueError):
        threshold = 0.0
    for c in items:
        c["total_spent"] = round(c["total_spent"], 2)
        c["repeat"] = c["bookings"] > 1
        tags = list(tag_map.get(c["customer_key"], []))
        # Auto-VIP: tag customers whose spend crosses the merchant's threshold
        if threshold > 0 and c["total_spent"] >= threshold and "vip" not in tags:
            tags.append("vip")
            await db.merchant_customer_tags.update_one(
                {"merchant_id": mid, "customer_key": c["customer_key"]},
                {"$set": {"merchant_id": mid, "customer_key": c["customer_key"],
                          "tags": tags, "updated_at": now_iso()}}, upsert=True)
            c["auto_vip"] = True
        c["tags"] = tags
    if q:
        ql = q.lower()
        items = [c for c in items if ql in (c["name"] or "").lower() or ql in (c["customer_phone"] or "")]
    items.sort(key=lambda x: x["last_date"] or "", reverse=True)
    return {"count": len(items), "items": items}


async def get_settings(merchant):
    u = await db.users.find_one({"id": merchant["id"]}, {"_id": 0, "vip_threshold": 1, "poster_logo_url": 1})
    return {"vip_threshold": (u or {}).get("vip_threshold", 0),
            "poster_logo_url": (u or {}).get("poster_logo_url", "")}


async def set_settings(merchant, data):
    upd = {}
    if "vip_threshold" in data:
        try:
            upd["vip_threshold"] = max(0, float(data.get("vip_threshold") or 0))
        except (TypeError, ValueError):
            upd["vip_threshold"] = 0
    if upd:
        await db.users.update_one({"id": merchant["id"]}, {"$set": upd})
    return await get_settings({"id": merchant["id"]})


VALID_TAGS = ["vip", "amc", "regular", "lead"]


async def set_customer_tags(merchant, customer_key, tags):
    tags = [t.lower() for t in (tags or []) if t.lower() in VALID_TAGS]
    await db.merchant_customer_tags.update_one(
        {"merchant_id": merchant["id"], "customer_key": customer_key},
        {"$set": {"merchant_id": merchant["id"], "customer_key": customer_key,
                  "tags": tags, "updated_at": now_iso()}}, upsert=True)
    return {"ok": True, "customer_key": customer_key, "tags": tags}


async def customer_history(merchant, customer_key):
    mid = merchant["id"]
    bookings = await db.bookings.find(
        {"merchant_id": mid, "$or": [{"customer_phone": customer_key}, {"customer_id": customer_key}]},
        {"_id": 0}).sort("created_at", -1).to_list(500)
    items = [{
        "booking_code": b.get("booking_code") or b.get("code"), "id": b.get("id"),
        "service": (b.get("service") or {}).get("name") or b.get("service_name"),
        "status": b.get("status"), "amount": (b.get("pricing") or {}).get("total", 0),
        "created_at": b.get("created_at"), "partner_name": b.get("partner_name"),
    } for b in bookings]
    name = bookings[0].get("customer_name") if bookings else "Customer"
    return {"customer_name": name, "customer_key": customer_key, "count": len(items), "items": items}


# ---------------------------------------------------------------- reminders
async def list_reminders(merchant, status=""):
    q = {"merchant_id": merchant["id"]}
    if status:
        q["status"] = status
    return await db.merchant_reminders.find(q, {"_id": 0}).sort("due_date", 1).to_list(500)


async def create_reminder(merchant, data: dict):
    if not (data.get("title") or "").strip():
        raise HTTPException(400, "Reminder title is required")
    try:
        rec = int(data.get("recurrence_months") or 0)
    except (TypeError, ValueError):
        rec = 0
    doc = {"id": new_id(), "merchant_id": merchant["id"],
           "title": data["title"].strip(), "type": data.get("type", "follow_up"),
           "customer_name": data.get("customer_name", ""), "customer_phone": data.get("customer_phone", ""),
           "due_date": data.get("due_date", ""), "note": data.get("note", ""),
           "recurrence_months": rec if rec in (0, 3, 6, 12) else 0,
           "status": "pending", "created_at": now_iso()}
    await db.merchant_reminders.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


async def bulk_reminders(merchant, data: dict):
    """Create an AMC / follow-up reminder for many past customers in one action."""
    if not (data.get("title") or "").strip():
        raise HTTPException(400, "Reminder title is required")
    cust_map = {c["customer_key"]: c for c in (await my_customers(merchant))["items"]}
    target = data.get("target") or ""
    if target == "all_repeat":
        keys = [k for k, c in cust_map.items() if c.get("repeat")]
    elif target == "all":
        keys = list(cust_map.keys())
    elif target == "tag":
        tag = (data.get("tag") or "").lower()
        keys = [k for k, c in cust_map.items() if tag in (c.get("tags") or [])]
    else:
        keys = data.get("customer_keys") or []
    if not keys:
        raise HTTPException(400, "No customers selected")
    created = 0
    for k in keys:
        c = cust_map.get(k, {})
        await create_reminder(merchant, {
            "title": data["title"].strip(), "type": data.get("type", "amc"),
            "customer_name": c.get("name", ""), "customer_phone": c.get("customer_phone", ""),
            "due_date": data.get("due_date", ""), "note": data.get("note", ""),
            "recurrence_months": data.get("recurrence_months", 0)})
        created += 1
    return {"ok": True, "created": created}


async def update_reminder(merchant, rid, status):
    r = await db.merchant_reminders.find_one({"id": rid, "merchant_id": merchant["id"]})
    if not r:
        raise HTTPException(404, "Reminder not found")
    await db.merchant_reminders.update_one({"id": rid}, {"$set": {"status": status}})
    return {"ok": True, "status": status}


def _add_months(dstr, months):
    import calendar
    try:
        y, mo, d = (int(x) for x in dstr[:10].split("-"))
    except (ValueError, AttributeError):
        y, mo, d = datetime.now(timezone.utc).year, datetime.now(timezone.utc).month, 1
    idx = mo - 1 + months
    y2 = y + idx // 12
    mo2 = idx % 12 + 1
    d2 = min(d, calendar.monthrange(y2, mo2)[1])
    return f"{y2:04d}-{mo2:02d}-{d2:02d}"


async def process_due_reminders():
    """Daily sweep: notify merchant (in-app + SMS) and customer (SMS) for
    reminders due today or overdue. Recurring reminders auto-spawn the next
    occurrence. Idempotent via alert_sent flag."""
    from services.notification_service import notify
    from services import sms_service
    today = datetime.now(timezone.utc).date().isoformat()
    due = await db.merchant_reminders.find(
        {"status": "pending", "alert_sent": {"$ne": True},
         "due_date": {"$lte": today, "$ne": ""}}, {"_id": 0}).to_list(500)
    sent = 0
    for r in due:
        cust = r.get("customer_name") or "your customer"
        label = (r.get("type") or "follow_up").upper().replace("_", " ")
        await notify(r["merchant_id"], f"{label} reminder due today",
                     f"{r['title']} — {cust} {r.get('customer_phone', '')}".strip(),
                     link="/merchant",
                     sms_text=f"AzoApp: Reminder due today — {r['title']} for {cust}. Open your merchant app to follow up.")
        if r.get("customer_phone"):
            try:
                await sms_service.send_text_sms(
                    r["customer_phone"],
                    f"Hi {cust}, this is a friendly reminder for your {label.title()} service. "
                    "Reply or call your service shop to schedule. - AzoApp")
            except Exception:  # noqa: BLE001
                pass
        rec = int(r.get("recurrence_months") or 0)
        if rec > 0:
            # close this cycle & auto-create the next occurrence
            nxt = dict(r)
            nxt.update({"id": new_id(), "due_date": _add_months(r["due_date"], rec),
                        "status": "pending", "alert_sent": False, "created_at": now_iso()})
            nxt.pop("alert_sent_at", None)
            await db.merchant_reminders.insert_one(nxt)
            await db.merchant_reminders.update_one(
                {"id": r["id"]}, {"$set": {"status": "done", "alert_sent": True, "alert_sent_at": now_iso()}})
        else:
            await db.merchant_reminders.update_one(
                {"id": r["id"]}, {"$set": {"alert_sent": True, "alert_sent_at": now_iso()}})
        sent += 1
    return sent


async def tag_insights(merchant):
    """Small dashboard: how many customers per tag for this shop."""
    data = await my_customers(merchant)
    items = data["items"]
    counts = {"vip": 0, "amc": 0, "regular": 0, "lead": 0}
    tagged = 0
    for c in items:
        tags = c.get("tags") or []
        if tags:
            tagged += 1
        for t in tags:
            if t in counts:
                counts[t] += 1
    return {"total": len(items), "tagged": tagged, "untagged": len(items) - tagged, "counts": counts}


async def get_poster_logo(merchant):
    u = await db.users.find_one({"id": merchant["id"]}, {"_id": 0, "poster_logo_url": 1})
    return {"logo_url": (u or {}).get("poster_logo_url", "")}


async def set_poster_logo(merchant, url):
    await db.users.update_one({"id": merchant["id"]}, {"$set": {"poster_logo_url": url or ""}})
    return {"ok": True, "logo_url": url or ""}


async def repeat_service(merchant, data: dict):
    """Create an AMC / follow-up reminder to re-offer a service to a past customer."""
    return await create_reminder(merchant, {
        "title": f"Repeat service · {data.get('customer_name', 'Customer')}",
        "type": "repeat", "customer_name": data.get("customer_name", ""),
        "customer_phone": data.get("customer_phone", ""),
        "due_date": data.get("due_date", ""),
        "note": data.get("note") or f"Offer {data.get('service', 'a service')} again to this customer.",
    })


# ---------------------------------------------------------------- complaints
async def list_complaints(merchant):
    return await db.merchant_complaints.find(
        {"merchant_id": merchant["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)


async def create_complaint(merchant, data: dict):
    if not (data.get("subject") or "").strip():
        raise HTTPException(400, "Subject is required")
    doc = {"id": new_id(), "merchant_id": merchant["id"],
           "merchant_name": merchant.get("shop_name") or merchant.get("name"),
           "booking_id": data.get("booking_id", ""), "booking_code": data.get("booking_code", ""),
           "subject": data["subject"].strip(), "description": data.get("description", ""),
           "category": data.get("category", "service"), "status": "open",
           "created_at": now_iso()}
    await db.merchant_complaints.insert_one(dict(doc))
    # notify admins
    admins = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(50)
    for a in admins:
        await db.notifications.insert_one({
            "id": new_id(), "user_id": a["id"], "audience": "user",
            "title": "New merchant complaint",
            "body": f"{doc['merchant_name']}: {doc['subject']}", "link": "/admin",
            "read": False, "created_at": now_iso()})
    doc.pop("_id", None)
    return doc


# ---------------------------------------------------------------- analytics
async def performance(merchant, period="monthly"):
    mid = merchant["id"]
    rows = await _commission_rows(mid)
    bookings = await _merchant_bookings(mid)
    buckets = {}

    def key_for(dstr):
        d = dstr[:10]
        if not d:
            return None
        y, m = d[:4], d[5:7]
        if period == "yearly":
            return y
        if period == "quarterly":
            q = (int(m) - 1) // 3 + 1
            return f"{y}-Q{q}"
        return f"{y}-{m}"  # monthly

    for l in rows:
        k = key_for(str(l.get("created_at", "")))
        if not k:
            continue
        b = buckets.setdefault(k, {"period": k, "earning": 0.0, "bookings": 0})
        b["earning"] += _earn(l, mid)
    for bk in bookings:
        k = key_for(str(bk.get("created_at", "")))
        if not k:
            continue
        b = buckets.setdefault(k, {"period": k, "earning": 0.0, "bookings": 0})
        b["bookings"] += 1

    series = sorted(buckets.values(), key=lambda x: x["period"])
    for s in series:
        s["earning"] = round(s["earning"], 2)
    return {"period": period, "series": series[-12:]}


async def top_customers(merchant, period="month", limit=10):
    mid = merchant["id"]
    bookings = await _merchant_bookings(mid)
    since = ""
    if period == "month":
        since = datetime.now(timezone.utc).date().replace(day=1).isoformat()
    agg = {}
    for b in bookings:
        if since and str(b.get("created_at", ""))[:10] < since:
            continue
        key = b.get("customer_phone") or b.get("customer_id")
        if not key:
            continue
        c = agg.setdefault(key, {"customer_key": key, "customer_phone": b.get("customer_phone"),
                                 "name": b.get("customer_name") or "Customer",
                                 "bookings": 0, "completed": 0, "total_spent": 0.0,
                                 "last_service": None})
        c["bookings"] += 1
        if b.get("status") in _DONE:
            c["completed"] += 1
            c["total_spent"] += float((b.get("pricing") or {}).get("total", 0))
        if not c["last_service"]:
            c["last_service"] = (b.get("service") or {}).get("name") or b.get("service_name")
    items = list(agg.values())
    for c in items:
        c["total_spent"] = round(c["total_spent"], 2)
        c["repeat"] = c["bookings"] > 1
    items.sort(key=lambda x: (x["total_spent"], x["bookings"]), reverse=True)
    return {"period": period, "count": len(items), "items": items[:limit]}


# ---------------------------------------------------------------- analytics (premium)
def _daterange(dfrom, dto, cap=120):
    """Inclusive list of YYYY-MM-DD strings between dfrom and dto (capped)."""
    from datetime import date
    try:
        a = date.fromisoformat(dfrom); b = date.fromisoformat(dto)
    except (ValueError, TypeError):
        b = datetime.now(timezone.utc).date(); a = b - timedelta(days=29)
    if b < a:
        a, b = b, a
    if (b - a).days > cap:
        a = b - timedelta(days=cap)
    out, cur = [], a
    while cur <= b:
        out.append(cur.isoformat()); cur += timedelta(days=1)
    return out


async def analytics(merchant, dfrom="", dto=""):
    """Real, privacy-safe merchant analytics — commission earnings only.

    Series is the merchant's ACTUAL earned commission per day (customer +
    partner referral), split so the two streams can be compared. No bookings,
    no job counts, no service-status breakdown (merchant does not book).
    """
    from services import merchant_referral_service as mrs
    mid = merchant["id"]
    days = _daterange(dfrom, dto)
    lo, hi = days[0], days[-1]
    rows = await _commission_rows(mid)

    series = {d: {"date": d, "earning": 0.0, "customer": 0.0, "partner": 0.0} for d in days}
    cust_total = part_total = 0.0
    for l in rows:
        d = str(l.get("created_at"))[:10]
        if not (lo <= d <= hi) or d not in series:
            continue
        c = float(l.get("merchant_customer", l.get("merchant_booking", 0)) or 0) if l.get("customer_merchant_id") == mid else 0.0
        p = float(l.get("merchant_referral", 0) or 0) if l.get("referral_merchant_id") == mid else 0.0
        series[d]["customer"] += c
        series[d]["partner"] += p
        series[d]["earning"] += c + p
        cust_total += c
        part_total += p
    series_list = [{"date": k, "earning": round(v["earning"], 2),
                    "customer": round(v["customer"], 2), "partner": round(v["partner"], 2)}
                   for k, v in series.items()]
    earning_total = round(cust_total + part_total, 2)

    # referred network counts (real)
    cust_list = await mrs.list_customers(mid, {"page": 1, "page_size": 1})
    part_list = await mrs.list_partners(mid, {"page": 1, "page_size": 1})

    return {
        "range": {"from": lo, "to": hi, "days": len(days)},
        "kpis": {
            "earning": earning_total,
            "customer_commission": round(cust_total, 2),
            "partner_commission": round(part_total, 2),
            "customers": cust_list.get("total", 0),
            "partners": part_list.get("total", 0),
            "avg_per_day": round(earning_total / max(len(days), 1), 2),
        },
        "series": series_list,
        "breakdown": [
            {"name": "Customer Commission", "value": round(cust_total, 2)},
            {"name": "Partner Commission", "value": round(part_total, 2)},
        ],
    }
