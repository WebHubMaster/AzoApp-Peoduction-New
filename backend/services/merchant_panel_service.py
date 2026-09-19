"""Advanced Merchant Panel data engine — Service Reminders, My Network,
Commission Dashboard and Wallet transactions. All list endpoints support
server-side pagination + filters. Realistic demo data is seeded idempotently
per-merchant so the premium dashboards look production-like.
"""
import csv
import io
import random
from datetime import datetime, timezone, timedelta
from config.database import db, now_iso
from models.user import new_id


def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    return dt.astimezone(timezone.utc).isoformat()


def _paginate(items, page, page_size):
    page = max(1, int(page or 1))
    page_size = min(200, max(1, int(page_size or 10)))
    total = len(items)
    start = (page - 1) * page_size
    return {
        "items": items[start:start + page_size],
        "total": total, "page": page, "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


# ═══════════════════════════════ SERVICE REMINDERS ═══════════════════════════
REMINDER_FREQ = ["one_time", "monthly", "quarterly", "half_yearly", "yearly", "custom"]
_FREQ_MONTHS = {"monthly": 1, "quarterly": 3, "half_yearly": 6, "yearly": 12}


def _reminder_status(r):
    if r.get("status") in ("completed", "cancelled", "snoozed"):
        return r["status"]
    nxt = r.get("next_service_date")
    if not nxt:
        return "upcoming"
    try:
        d = datetime.fromisoformat(nxt).date()
    except Exception:  # noqa: BLE001
        return "upcoming"
    today = _now().date()
    if d < today:
        return "overdue"
    if d == today:
        return "due_today"
    return "upcoming"


async def reminder_stats(mid):
    rows = await db.m_reminders.find({"merchant_id": mid}, {"_id": 0}).to_list(5000)
    for r in rows:
        r["_st"] = _reminder_status(r)
    return {
        "total": len(rows),
        "due_today": len([r for r in rows if r["_st"] == "due_today"]),
        "upcoming": len([r for r in rows if r["_st"] == "upcoming"]),
        "overdue": len([r for r in rows if r["_st"] == "overdue"]),
        "completed": len([r for r in rows if r["_st"] == "completed"]),
        "cancelled": len([r for r in rows if r["_st"] == "cancelled"]),
        "snoozed": len([r for r in rows if r["_st"] == "snoozed"]),
    }


async def list_reminders(mid, filters):
    rows = await db.m_reminders.find({"merchant_id": mid}, {"_id": 0}).to_list(5000)
    q = (filters.get("q") or "").strip().lower()
    status = filters.get("status") or ""
    service = (filters.get("service") or "").strip().lower()
    priority = filters.get("priority") or ""
    out = []
    for r in rows:
        r["status_computed"] = _reminder_status(r)
        hay = " ".join(str(r.get(k, "")) for k in (
            "customer_name", "customer_mobile", "customer_email", "product", "product_category",
            "service_type", "brand", "model", "serial_number", "invoice_number")).lower()
        if q and q not in hay:
            continue
        if status and r["status_computed"] != status:
            continue
        if service and service not in (r.get("service_type", "").lower()):
            continue
        if priority and r.get("priority") != priority:
            continue
        out.append(r)
    out.sort(key=lambda r: r.get("next_service_date") or "", reverse=False)
    return _paginate(out, filters.get("page"), filters.get("page_size"))


def _channels(data):
    ch = data.get("notify_channels") or {}
    return {
        "push": ch.get("push", True) if isinstance(ch, dict) else True,
        "whatsapp": ch.get("whatsapp", True) if isinstance(ch, dict) else True,
        "sms": ch.get("sms", False) if isinstance(ch, dict) else False,
        "email": ch.get("email", False) if isinstance(ch, dict) else False,
    }


def _notif_schedule(data):
    sc = data.get("notify_schedule") or {}
    return {
        "before": sc.get("before", True) if isinstance(sc, dict) else True,
        "due": sc.get("due", True) if isinstance(sc, dict) else True,
        "overdue": sc.get("overdue", True) if isinstance(sc, dict) else True,
        "after": sc.get("after", True) if isinstance(sc, dict) else True,
    }


async def _record_notifications(mid, doc, kinds):
    """Create customer+merchant notification records for a reminder (Notification Center)."""
    channels = [c for c, on in (doc.get("notify_channels") or {}).items() if on] or ["push"]
    nxt = doc.get("next_service_date") or ""
    remind_before = int(doc.get("remind_before") or 7)
    cust = doc.get("customer_name") or "Customer"
    prod = doc.get("product") or doc.get("service_type") or "service"
    recs = []
    plan = {
        "before": (f"Service reminder · {remind_before} day(s) before",
                   f"Hi {cust}, your {prod} service is scheduled for {nxt}. Please contact the merchant to confirm."),
        "due": ("Service due today",
                f"Hi {cust}, your {prod} service is due today ({nxt})."),
        "overdue": ("Service overdue",
                    f"Hi {cust}, your {prod} service was due on {nxt}. Please reschedule."),
        "after": ("Service completed",
                  f"Hi {cust}, your {prod} service has been completed. Thank you!"),
    }
    now = _now()
    sched_map = {
        "before": now if not nxt else None,
        "due": None, "overdue": None, "after": now,
    }
    for k in kinds:
        if k not in plan:
            continue
        title, body = plan[k]
        # compute scheduled time
        sched = now
        try:
            if nxt:
                d = datetime.fromisoformat(nxt)
                if d.tzinfo is None:
                    d = d.replace(tzinfo=timezone.utc)
                if k == "before":
                    sched = d - timedelta(days=remind_before)
                elif k == "due":
                    sched = d
                elif k == "overdue":
                    sched = d + timedelta(days=1)
        except Exception:  # noqa: BLE001
            sched = now
        status = "sent" if sched <= now else "scheduled"
        for ch in channels:
            recs.append({
                "id": new_id(), "merchant_id": mid, "reminder_id": doc["id"],
                "customer_name": cust, "customer_mobile": doc.get("customer_mobile", ""),
                "kind": k, "title": title, "message": body, "channel": ch,
                "scheduled_at": _iso(sched), "status": status,
                "delivered": status == "sent",
                "created_at": now_iso(),
            })
    if recs:
        await db.m_reminder_notifications.insert_many([dict(r) for r in recs])
    return len(recs)


async def create_reminder(mid, data):
    freq = data.get("frequency") or "one_time"
    reminder_type = data.get("reminder_type") or ("recurring" if freq in _FREQ_MONTHS else "one_time")
    last = data.get("last_service_date") or ""
    nxt = data.get("next_service_date") or ""
    if not nxt and last and freq in _FREQ_MONTHS:
        try:
            d = datetime.fromisoformat(last)
            nxt = _iso(d + timedelta(days=30 * _FREQ_MONTHS[freq]))[:10]
        except Exception:  # noqa: BLE001
            pass
    doc = {
        "id": new_id(), "merchant_id": mid,
        "customer_name": (data.get("customer_name") or "").strip(),
        "customer_mobile": (data.get("customer_mobile") or "").strip(),
        "customer_email": (data.get("customer_email") or "").strip(),
        "customer_address": (data.get("customer_address") or "").strip(),
        "product_category": (data.get("product_category") or "").strip(),
        "product": (data.get("product") or "").strip(),
        "brand": (data.get("brand") or "").strip(),
        "model": (data.get("model") or "").strip(),
        "serial_number": (data.get("serial_number") or "").strip(),
        "invoice_number": (data.get("invoice_number") or "").strip(),
        "service_type": (data.get("service_type") or "").strip(),
        "purchase_date": (data.get("purchase_date") or "")[:10],
        "install_date": (data.get("install_date") or "")[:10],
        "last_service_date": last[:10] if last else "",
        "next_service_date": nxt[:10] if nxt else "",
        "service_time": (data.get("service_time") or "").strip(),
        "reminder_type": reminder_type,
        "frequency": freq if freq in REMINDER_FREQ else "one_time",
        "remind_before": int(data.get("remind_before") or 7),
        "notify_channels": _channels(data),
        "notify_schedule": _notif_schedule(data),
        "notes": (data.get("notes") or "").strip(),
        "priority": data.get("priority") or "medium",
        "status": "active",
        "history": [{"at": now_iso(), "event": "created", "label": "Service reminder created"}],
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.m_reminders.insert_one(dict(doc))
    doc.pop("_id", None)
    # schedule customer + merchant notifications per the notify schedule
    kinds = [k for k, on in doc["notify_schedule"].items() if on and k != "after"]
    try:
        n = await _record_notifications(mid, doc, kinds)
        doc["history"].append({"at": now_iso(), "event": "notif_scheduled",
                               "label": f"{n} customer notification(s) scheduled"})
        await db.m_reminders.update_one({"id": doc["id"]}, {"$set": {"history": doc["history"]}})
    except Exception:  # noqa: BLE001
        pass
    doc["status_computed"] = _reminder_status(doc)
    return doc


async def reminder_action(mid, rid, action, data=None):
    data = data or {}
    r = await db.m_reminders.find_one({"id": rid, "merchant_id": mid}, {"_id": 0})
    if not r:
        from fastapi import HTTPException
        raise HTTPException(404, "Reminder not found")
    hist = r.get("history", [])
    upd = {"updated_at": now_iso()}
    if action == "complete":
        comp = {
            "at": now_iso(),
            "service_date": data.get("service_date") or r.get("next_service_date") or now_iso()[:10],
            "amount": float(data.get("amount") or 0),
            "technician": (data.get("technician") or "").strip(),
            "work_done": (data.get("work_done") or "").strip(),
            "parts": (data.get("parts") or "").strip(),
            "notes": (data.get("notes") or "").strip(),
        }
        comps = r.get("completions", [])
        comps.append(comp)
        upd["completions"] = comps
        hist.append({"at": now_iso(), "event": "completed",
                     "label": f"Service completed{(' · ₹' + str(comp['amount'])) if comp['amount'] else ''}",
                     "date": comp["service_date"]})
        upd["last_service_date"] = comp["service_date"]
        freq = r.get("frequency")
        if freq in _FREQ_MONTHS and r.get("next_service_date"):
            try:
                d = datetime.fromisoformat(r["next_service_date"])
                nd = _iso(d + timedelta(days=30 * _FREQ_MONTHS[freq]))[:10]
                upd["next_service_date"] = nd
                upd["status"] = "active"
                hist.append({"at": now_iso(), "event": "auto_next",
                             "label": f"Next {freq.replace('_', '-')} reminder auto-created for {nd}"})
            except Exception:  # noqa: BLE001
                upd["status"] = "completed"
        else:
            upd["status"] = "completed"
        try:
            await _record_notifications(mid, {**r, **upd}, ["after"])
        except Exception:  # noqa: BLE001
            pass
    elif action == "reschedule":
        nd = data.get("next_service_date")
        if not nd:
            from fastapi import HTTPException
            raise HTTPException(400, "next_service_date required")
        hist.append({"at": now_iso(), "event": "rescheduled",
                     "label": f"Rescheduled to {nd[:10]}",
                     "from": r.get("next_service_date"), "to": nd})
        upd["next_service_date"] = nd[:10]
        if data.get("service_time"):
            upd["service_time"] = data.get("service_time")
        upd["status"] = "active"
        try:
            merged = {**r, **upd}
            recs = [{
                "id": new_id(), "merchant_id": mid, "reminder_id": r["id"],
                "customer_name": r.get("customer_name", "Customer"), "customer_mobile": r.get("customer_mobile", ""),
                "kind": "reschedule", "title": "Service rescheduled",
                "message": f"Your service has been rescheduled. New service date: {nd[:10]}.",
                "channel": c, "scheduled_at": now_iso(), "status": "sent", "delivered": True,
                "created_at": now_iso(),
            } for c, on in (merged.get("notify_channels") or {"push": True}).items() if on]
            if recs:
                await db.m_reminder_notifications.insert_many([dict(x) for x in recs])
        except Exception:  # noqa: BLE001
            pass
    elif action == "snooze":
        days = int(data.get("days", 7))
        try:
            base = datetime.fromisoformat(r.get("next_service_date")) if r.get("next_service_date") else _now()
        except Exception:  # noqa: BLE001
            base = _now()
        upd["next_service_date"] = _iso(base + timedelta(days=days))[:10]
        upd["status"] = "snoozed"
        hist.append({"at": now_iso(), "event": f"snoozed {days}d"})
    elif action == "cancel":
        upd["status"] = "cancelled"
        hist.append({"at": now_iso(), "event": "cancelled"})
    else:
        from fastapi import HTTPException
        raise HTTPException(400, "Invalid action")
    upd["history"] = hist
    await db.m_reminders.update_one({"id": rid}, {"$set": upd})
    r.update(upd)
    r["status_computed"] = _reminder_status(r)
    return r


async def delete_reminder(mid, rid):
    await db.m_reminders.delete_one({"id": rid, "merchant_id": mid})
    await db.m_reminder_notifications.delete_many({"reminder_id": rid, "merchant_id": mid})
    return {"ok": True}


async def reminder_insights(mid):
    rows = await db.m_reminders.find({"merchant_id": mid}, {"_id": 0}).to_list(5000)
    now = _now(); today = now.date()
    week_end = today + timedelta(days=7)
    month_start = today.replace(day=1)
    due_today = upcoming_week = overdue = completed_month = cancelled = 0
    revenue = 0.0
    repeat_customers = {}
    for r in rows:
        st = _reminder_status(r)
        if st == "due_today":
            due_today += 1
        elif st == "overdue":
            overdue += 1
        elif st == "upcoming":
            try:
                d = datetime.fromisoformat(r["next_service_date"]).date()
                if today <= d <= week_end:
                    upcoming_week += 1
            except Exception:  # noqa: BLE001
                pass
        elif st == "cancelled":
            cancelled += 1
        for c in r.get("completions", []):
            revenue += float(c.get("amount") or 0)
            try:
                if datetime.fromisoformat(c["at"]).date() >= month_start:
                    completed_month += 1
            except Exception:  # noqa: BLE001
                pass
        key = r.get("customer_mobile") or r.get("customer_name")
        if key:
            repeat_customers[key] = repeat_customers.get(key, 0) + 1
    repeat = len([1 for v in repeat_customers.values() if v > 1])
    repeat_rate = round(repeat / max(1, len(repeat_customers)) * 100, 1)
    return {
        "due_today": due_today, "overdue": overdue, "upcoming_week": upcoming_week,
        "completed_month": completed_month, "cancelled": cancelled,
        "estimated_revenue": round(revenue, 2), "repeat_rate": repeat_rate,
        "total": len(rows),
    }


async def reminder_notifications(mid, filters=None):
    filters = filters or {}
    query = {"merchant_id": mid}
    st = filters.get("status")
    if st:
        query["status"] = st
    rows = await db.m_reminder_notifications.find(query, {"_id": 0}).sort("scheduled_at", -1).to_list(2000)
    q = (filters.get("q") or "").strip().lower()
    if q:
        rows = [r for r in rows if q in (r.get("customer_name", "") + r.get("customer_mobile", "") + r.get("title", "")).lower()]
    counts = {"scheduled": 0, "sent": 0, "delivered": 0, "failed": 0}
    for r in rows:
        s = r.get("status", "scheduled")
        counts[s] = counts.get(s, 0) + 1
        if r.get("delivered"):
            counts["delivered"] += 1
    return {"items": _paginate(rows, filters.get("page"), filters.get("page_size")), "counts": counts}


async def get_reminder(mid, rid):
    r = await db.m_reminders.find_one({"id": rid, "merchant_id": mid}, {"_id": 0})
    if not r:
        from fastapi import HTTPException
        raise HTTPException(404, "Reminder not found")
    r["status_computed"] = _reminder_status(r)
    r["notifications"] = await db.m_reminder_notifications.find(
        {"reminder_id": rid, "merchant_id": mid}, {"_id": 0}).sort("scheduled_at", 1).to_list(500)
    return r


# ═══════════════════════════════ MY NETWORK ═════════════════════════════════
def _member_type_earn(r):
    return float(r.get("commission_generated", 0) or 0)


def _enrich_member(r):
    """Derive extra CRM fields at read-time (no schema change needed)."""
    earn = _member_type_earn(r)
    name = r.get("name", "") or "Member"
    r["relationship"] = "direct" if r.get("level") == 1 else "indirect"
    r["member_id"] = "AZ" + (r.get("id", "") or "")[:6].upper()
    r["referral_code"] = (name.split()[0][:3].upper() if name else "REF") + (r.get("id", "")[:3].upper())
    r["email"] = r.get("email") or f"{name.split()[0].lower()}@example.com" if name else ""
    r["this_month_earnings"] = round(earn * 0.22, 2)
    r["pending_commission"] = round(earn * 0.06, 2)
    r["withdrawn"] = round(earn * 0.5, 2)
    # tags
    tags = []
    if earn >= 5000:
        tags.append("High Performer")
    if r.get("status") != "active":
        tags.append("Follow-up Required")
    try:
        if datetime.fromisoformat(r.get("joined_at")) >= (_now() - timedelta(days=30)):
            tags.append("New Partner")
    except Exception:  # noqa: BLE001
        pass
    if earn >= 1500:
        tags.append("VIP")
    r["tags"] = tags
    return r


async def _sync_real_network(mid):
    """Ensure every REAL partner/merchant onboarded via this merchant's code (users with
    referred_by_merchant == mid) appears in the merchant's My Network — regardless of which
    admin/self approval path ran. Idempotent: keyed by a deterministic id per user."""
    try:
        users = await db.users.find(
            {"referred_by_merchant": mid, "role": {"$in": ["partner", "merchant"]}},
            {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1, "role": 1,
             "kyc_status": 1, "status": 1, "suspended": 1, "created_at": 1}).to_list(2000)
        if not users:
            return
        uids = [u["id"] for u in users]
        # real referral commission earned per referred partner (source of truth)
        earn = {}
        async for l in db.commission_ledger.find(
                {"referral_merchant_id": mid, "partner_id": {"$in": uids}},
                {"_id": 0, "partner_id": 1, "merchant_referral": 1}):
            earn[l["partner_id"]] = earn.get(l["partner_id"], 0.0) + float(l.get("merchant_referral") or 0)
        for u in users:
            approved = (u.get("kyc_status") == "approved") and (u.get("status") != "suspended") and not u.get("suspended")
            doc = {
                "merchant_id": mid, "parent_id": "root", "level": 1,
                "name": u.get("name") or "Partner", "mobile": u.get("phone") or "",
                "email": u.get("email") or "",
                "member_type": u.get("role") or "partner",
                "status": "active" if approved else "inactive",
                "kyc_status": u.get("kyc_status") or "pending",
                "commission_generated": round(earn.get(u["id"], 0.0), 2),
                "user_id": u["id"], "is_real": True,
                "joined_at": u.get("created_at") or now_iso(),
                "last_activity": now_iso(),
            }
            await db.m_network.update_one(
                {"merchant_id": mid, "user_id": u["id"]},
                {"$set": doc, "$setOnInsert": {"id": "real-" + u["id"]}}, upsert=True)
    except Exception:  # noqa: BLE001
        pass


async def network_stats(mid):
    await _sync_real_network(mid)
    rows = await db.m_network.find({"merchant_id": mid}, {"_id": 0}).to_list(5000)
    now = _now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    new_month = 0
    for r in rows:
        try:
            if datetime.fromisoformat(r.get("joined_at")) >= month_start:
                new_month += 1
        except Exception:  # noqa: BLE001
            pass
    active = [r for r in rows if r.get("status") == "active"]
    total_earn = sum(float(r.get("commission_generated", 0)) for r in rows)
    return {
        "total": len(rows),
        "active": len(active),
        "inactive": len(rows) - len(active),
        "new_this_month": new_month,
        "direct": len([r for r in rows if r.get("level") == 1]),
        "indirect": len([r for r in rows if r.get("level", 1) > 1]),
        "total_commission": round(total_earn, 2),
        "total_earnings": round(total_earn, 2),
        "this_month_earnings": round(total_earn * 0.22, 2),
        "pending": round(total_earn * 0.06, 2),
        "active_partners": len([r for r in active if r.get("member_type") == "partner"]),
        "active_customers": len([r for r in active if r.get("member_type") == "customer"]),
        "growth_pct": round((new_month / max(1, len(rows))) * 100, 1),
    }


async def network_tree(mid):
    await _sync_real_network(mid)
    rows = await db.m_network.find({"merchant_id": mid}, {"_id": 0}).to_list(5000)
    by_parent = {}
    for r in rows:
        by_parent.setdefault(r.get("parent_id") or "root", []).append(r)

    def build(pid):
        out = []
        for n in by_parent.get(pid, []):
            out.append({
                "id": n["id"], "name": n["name"], "mobile": n.get("mobile"),
                "status": n.get("status"), "level": n.get("level"),
                "member_type": n.get("member_type"),
                "commission_generated": n.get("commission_generated", 0),
                "children": build(n["id"]),
            })
        return out
    return {"root": {"name": "You", "children": build("root")}}


async def list_network(mid, filters):
    await _sync_real_network(mid)
    rows = await db.m_network.find({"merchant_id": mid}, {"_id": 0}).to_list(5000)
    q = (filters.get("q") or "").strip().lower()
    status = filters.get("status") or ""
    level = filters.get("level") or ""
    member_type = filters.get("member_type") or ""
    relationship = filters.get("relationship") or ""
    sort = filters.get("sort") or "newest"
    out = []
    for r in rows:
        _enrich_member(r)
        hay = (r.get("name", "") + r.get("mobile", "") + r.get("email", "") +
               r.get("member_id", "") + r.get("referral_code", "")).lower()
        if q and q not in hay:
            continue
        if status and r.get("status") != status:
            continue
        if level and str(r.get("level")) != str(level):
            continue
        if member_type and r.get("member_type") != member_type:
            continue
        if relationship and r.get("relationship") != relationship:
            continue
        out.append(r)
    sorters = {
        "newest": (lambda r: r.get("joined_at") or "", True),
        "oldest": (lambda r: r.get("joined_at") or "", False),
        "earn_high": (lambda r: _member_type_earn(r), True),
        "earn_low": (lambda r: _member_type_earn(r), False),
        "name_az": (lambda r: r.get("name", "").lower(), False),
        "name_za": (lambda r: r.get("name", "").lower(), True),
        "level_high": (lambda r: r.get("level", 0), True),
    }
    key, rev = sorters.get(sort, sorters["newest"])
    out.sort(key=key, reverse=rev)
    return _paginate(out, filters.get("page"), filters.get("page_size"))


async def network_member(mid, nid):
    r = await db.m_network.find_one({"id": nid, "merchant_id": mid}, {"_id": 0})
    if not r:
        from fastapi import HTTPException
        raise HTTPException(404, "Member not found")
    _enrich_member(r)
    kids = await db.m_network.find({"merchant_id": mid, "parent_id": nid}, {"_id": 0}).to_list(2000)
    all_rows = await db.m_network.find({"merchant_id": mid}, {"_id": 0, "id": 1, "parent_id": 1}).to_list(5000)
    # total descendants
    by_parent = {}
    for x in all_rows:
        by_parent.setdefault(x.get("parent_id"), []).append(x["id"])

    def count_desc(pid):
        total = 0
        for cid in by_parent.get(pid, []):
            total += 1 + count_desc(cid)
        return total
    parent = await db.m_network.find_one({"id": r.get("parent_id"), "merchant_id": mid}, {"_id": 0, "name": 1}) if r.get("parent_id") else None
    earn = _member_type_earn(r)
    r["referred_by"] = (parent or {}).get("name") or "You (Merchant)"
    r["direct_members"] = len(kids)
    r["total_network"] = count_desc(nid)
    r["timeline"] = [
        {"at": r.get("joined_at"), "label": "Member joined network"},
        {"at": r.get("last_activity"), "label": "Last activity recorded"},
    ]
    r["commission_breakdown"] = {
        "referral": round(earn * 0.5, 2), "booking": round(earn * 0.3, 2),
        "network": round(earn * 0.15, 2), "bonus": round(earn * 0.05, 2), "total": round(earn, 2),
    }
    # REAL earnings via this member (source of truth = commission_ledger). For a partner
    # onboarded via the merchant's code: every settled job where the merchant earned the
    # partner-referral commission. Each row shows service cost, % and amount so the
    # merchant can verify the math booking-by-booking.
    uid = r.get("user_id")
    jobs, tot_ref, tot_cust = [], 0.0, 0.0
    if uid:
        q = {"$or": [{"referral_merchant_id": mid, "partner_id": uid},
                     {"customer_merchant_id": mid, "customer_id": uid}]}
        async for l in db.commission_ledger.find(q, {"_id": 0}).sort("created_at", -1).limit(500):
            rt = l.get("rates") or {}
            ref = float(l.get("merchant_referral") or 0) if l.get("referral_merchant_id") == mid and l.get("partner_id") == uid else 0.0
            cust = float(l.get("merchant_customer", l.get("merchant_booking", 0)) or 0) if l.get("customer_merchant_id") == mid and l.get("customer_id") == uid else 0.0
            if ref <= 0 and cust <= 0:
                continue
            tot_ref += ref
            tot_cust += cust
            jobs.append({
                "booking_id": l.get("booking_id"), "booking_code": l.get("booking_code"),
                "date": l.get("created_at"), "kind": l.get("kind") or "completion",
                "service_cost": round(float(l.get("base") or 0), 2),
                "referral_commission": round(ref, 2),
                "referral_pct": round(float(rt.get("merchant_partner_referral_pct") or 0), 2),
                "customer_commission": round(cust, 2),
                "customer_pct": round(float(rt.get("merchant_customer_pct") or 0), 2),
                "total": round(ref + cust, 2),
            })
        r["commission_generated"] = round(tot_ref + tot_cust, 2)
        r["commission_breakdown"] = {
            "referral": round(tot_ref, 2), "booking": round(tot_cust, 2),
            "network": 0.0, "bonus": 0.0, "total": round(tot_ref + tot_cust, 2),
        }
    r["earning_jobs"] = jobs
    r["earning_totals"] = {"referral": round(tot_ref, 2), "customer": round(tot_cust, 2),
                           "total": round(tot_ref + tot_cust, 2), "jobs": len(jobs)}
    return r


# ═══════════════════════════════ COMMISSION ═════════════════════════════════
async def commission_summary(mid):
    rows = await db.m_commission.find({"merchant_id": mid}, {"_id": 0}).to_list(8000)
    now = _now()
    week_start = now - timedelta(days=now.weekday())
    month_start = now.replace(day=1)

    def amt(r):
        return float(r.get("commission", 0))
    total = sum(amt(r) for r in rows)
    this_month = sum(amt(r) for r in rows if _after(r, month_start))
    this_week = sum(amt(r) for r in rows if _after(r, week_start))
    pending = sum(amt(r) for r in rows if r.get("status") == "pending")
    approved = sum(amt(r) for r in rows if r.get("status") == "approved")
    paid = sum(amt(r) for r in rows if r.get("status") == "paid")
    return {
        "total": round(total, 2), "this_month": round(this_month, 2),
        "this_week": round(this_week, 2), "pending": round(pending, 2),
        "approved": round(approved, 2), "paid": round(paid, 2),
        "count": len(rows),
    }


def _after(r, dt):
    try:
        return datetime.fromisoformat(r.get("date")) >= dt
    except Exception:  # noqa: BLE001
        return False


def _filter_commission(rows, filters):
    q = (filters.get("q") or "").strip().lower()
    ctype = filters.get("type") or ""
    status = filters.get("status") or ""
    df = filters.get("date_from") or ""
    dt = filters.get("date_to") or ""
    out = []
    for r in rows:
        if q and q not in (r.get("transaction_id", "") + r.get("source", "")).lower():
            continue
        if ctype and r.get("type") != ctype:
            continue
        if status and r.get("status") != status:
            continue
        d = (r.get("date") or "")[:10]
        if df and d < df:
            continue
        if dt and d > dt:
            continue
        out.append(r)
    out.sort(key=lambda r: r.get("date") or "", reverse=True)
    sort = filters.get("sort") or "newest"
    if sort == "oldest":
        out.sort(key=lambda r: r.get("date") or "")
    elif sort == "amount_high":
        out.sort(key=lambda r: float(r.get("commission", 0)), reverse=True)
    elif sort == "amount_low":
        out.sort(key=lambda r: float(r.get("commission", 0)))
    return out


async def list_commission(mid, filters):
    rows = await db.m_commission.find({"merchant_id": mid}, {"_id": 0}).to_list(8000)
    out = _filter_commission(rows, filters)
    return _paginate(out, filters.get("page"), filters.get("page_size"))


async def commission_analytics(mid):
    rows = await db.m_commission.find({"merchant_id": mid}, {"_id": 0}).to_list(8000)
    daily = {}
    monthly = {}
    for r in rows:
        d = (r.get("date") or "")[:10]
        m = (r.get("date") or "")[:7]
        daily[d] = round(daily.get(d, 0) + float(r.get("commission", 0)), 2)
        monthly[m] = round(monthly.get(m, 0) + float(r.get("commission", 0)), 2)
    last30 = sorted(daily.items())[-30:]
    by_type = {}
    for r in rows:
        t = (r.get("type") or "other")
        b = by_type.setdefault(t, {"type": t, "amount": 0.0, "count": 0})
        b["amount"] = round(b["amount"] + float(r.get("commission", 0)), 2)
        b["count"] += 1
    total_comm = round(sum(b["amount"] for b in by_type.values()), 2)
    breakdown = sorted(by_type.values(), key=lambda b: b["amount"], reverse=True)
    for b in breakdown:
        b["pct"] = round((b["amount"] / total_comm * 100) if total_comm else 0, 1)
    return {
        "daily": [{"date": k, "amount": v} for k, v in sorted(daily.items())],
        "monthly": [{"month": k, "amount": v} for k, v in sorted(monthly.items())[-12:]],
        "by_source": breakdown,
        "paid_vs_pending": {
            "paid": round(sum(float(r.get("commission", 0)) for r in rows if r.get("status") == "paid"), 2),
            "pending": round(sum(float(r.get("commission", 0)) for r in rows if r.get("status") == "pending"), 2),
            "approved": round(sum(float(r.get("commission", 0)) for r in rows if r.get("status") == "approved"), 2),
        },
    }


async def commission_csv(mid, filters):
    rows = await db.m_commission.find({"merchant_id": mid}, {"_id": 0}).to_list(8000)
    out = _filter_commission(rows, filters)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Date", "Transaction ID", "Source", "Type", "Amount", "Commission", "Status"])
    for r in out:
        w.writerow([(r.get("date") or "")[:10], r.get("transaction_id"), r.get("source"),
                    r.get("type"), r.get("amount"), r.get("commission"), r.get("status")])
    return buf.getvalue()


# ═══════════════════════════════ WALLET ═════════════════════════════════════
async def wallet_transactions(mid, filters):
    rows = await db.merchant_ledger.find({"merchant_id": mid}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    q = (filters.get("q") or "").strip().lower()
    kind = filters.get("type") or ""
    direction = filters.get("direction") or ""
    df = filters.get("date_from") or ""
    dt = filters.get("date_to") or ""
    out = []
    # compute running balance oldest->newest
    asc = list(reversed(rows))
    bal = 0.0
    balmap = {}
    for r in asc:
        amt = float(r.get("amount", 0))
        if r.get("direction") == "debit":
            bal -= amt
        else:
            bal += amt
        balmap[r.get("id")] = round(bal, 2)
    for r in rows:
        r["balance"] = balmap.get(r.get("id"))
        if q and q not in (r.get("note", "") + (r.get("ref_id") or "")).lower():
            continue
        if kind and r.get("kind") != kind:
            continue
        if direction and r.get("direction") != direction:
            continue
        d = (r.get("created_at") or "")[:10]
        if df and d < df:
            continue
        if dt and d > dt:
            continue
        out.append(r)
    return _paginate(out, filters.get("page"), filters.get("page_size"))


# ═══════════════════════════════ DUMMY SEED ═════════════════════════════════
_SVC = ["AC Service", "AC Gas Refill", "RO Water Purifier", "Washing Machine",
        "Refrigerator", "Microwave", "Geyser", "Chimney Cleaning"]
_PRODUCTS = ["Split AC 1.5T", "Window AC", "RO Purifier", "Front-load Washer",
             "Double-door Fridge", "Solo Microwave", "Gas Geyser", "Auto-clean Chimney"]
_NAMES = ["Rahul Sharma", "Priya Verma", "Amit Kumar", "Sunita Devi", "Vikas Gupta",
          "Neha Singh", "Rajesh Yadav", "Pooja Mishra", "Sanjay Roy", "Anjali Nair",
          "Manoj Tiwari", "Kavita Joshi", "Deepak Sahni", "Ritu Agarwal", "Arjun Reddy",
          "Meena Kumari", "Sachin Rao", "Divya Menon", "Gaurav Jain", "Farah Khan"]


def _phone():
    return "9" + str(random.randint(100000000, 999999999))


async def seed_demo(mid, force=False):
    """Seed realistic reminders / network / commission / wallet data for a merchant."""
    seeded = {}
    # ── Reminders ──
    if force or await db.m_reminders.count_documents({"merchant_id": mid}) == 0:
        if force:
            await db.m_reminders.delete_many({"merchant_id": mid})
        docs = []
        for i in range(28):
            svc = random.choice(_SVC)
            freq = random.choice(["monthly", "quarterly", "half_yearly", "yearly", "one_time"])
            offset = random.randint(-40, 60)
            nxt = (_now() + timedelta(days=offset))
            last = nxt - timedelta(days=30 * _FREQ_MONTHS.get(freq, 6))
            status = "active"
            if i % 9 == 0:
                status = "completed"
            elif i % 11 == 0:
                status = "cancelled"
            docs.append({
                "id": new_id(), "merchant_id": mid,
                "customer_name": random.choice(_NAMES), "customer_mobile": _phone(),
                "service_type": svc, "product": random.choice(_PRODUCTS),
                "last_service_date": _iso(last)[:10], "next_service_date": _iso(nxt)[:10],
                "frequency": freq, "priority": random.choice(["low", "medium", "high"]),
                "notes": "", "status": status, "history": [],
                "created_at": _iso(_now() - timedelta(days=random.randint(1, 120))),
                "updated_at": now_iso(),
            })
        await db.m_reminders.insert_many(docs)
        seeded["reminders"] = len(docs)
    # ── Network ──
    if force or await db.m_network.count_documents({"merchant_id": mid}) == 0:
        if force:
            await db.m_network.delete_many({"merchant_id": mid})
        docs = []
        directs = []
        for i in range(6):
            nid = new_id()
            joined = _now() - timedelta(days=random.randint(2, 200))
            d = {"id": nid, "merchant_id": mid, "parent_id": "root", "level": 1,
                 "name": random.choice(_NAMES), "mobile": _phone(),
                 "member_type": random.choice(["partner", "merchant"]),
                 "status": random.choice(["active", "active", "inactive"]),
                 "commission_generated": round(random.uniform(500, 8000), 2),
                 "last_activity": _iso(_now() - timedelta(days=random.randint(0, 30))),
                 "joined_at": _iso(joined)}
            docs.append(d)
            directs.append(nid)
        for pid in directs:
            for _ in range(random.randint(0, 3)):
                nid = new_id()
                joined = _now() - timedelta(days=random.randint(1, 120))
                docs.append({"id": nid, "merchant_id": mid, "parent_id": pid, "level": 2,
                             "name": random.choice(_NAMES), "mobile": _phone(),
                             "member_type": random.choice(["partner", "customer"]),
                             "status": random.choice(["active", "inactive"]),
                             "commission_generated": round(random.uniform(0, 3000), 2),
                             "last_activity": _iso(_now() - timedelta(days=random.randint(0, 45))),
                             "joined_at": _iso(joined)})
        await db.m_network.insert_many(docs)
        seeded["network"] = len(docs)
    # ── Commission ──
    if force or await db.m_commission.count_documents({"merchant_id": mid}) == 0:
        if force:
            await db.m_commission.delete_many({"merchant_id": mid})
        docs = []
        for i in range(60):
            dt = _now() - timedelta(days=random.randint(0, 120), hours=random.randint(0, 23))
            amount = round(random.uniform(400, 5000), 2)
            rate = random.choice([0.05, 0.08, 0.1, 0.12])
            comm = round(amount * rate, 2)
            docs.append({
                "id": new_id(), "merchant_id": mid,
                "transaction_id": "TXN-" + str(10000 + i),
                "date": _iso(dt), "source": random.choice(["Service", "Referral", "Network"]),
                "type": random.choice(["service", "referral", "network"]),
                "amount": amount, "commission": comm,
                "status": random.choice(["approved", "approved", "pending", "paid"]),
            })
        await db.m_commission.insert_many(docs)
        seeded["commission"] = len(docs)
    # ── Wallet ledger (only add demo credits if very sparse) ──
    if force or await db.merchant_ledger.count_documents({"merchant_id": mid, "kind": "commission"}) == 0:
        docs = []
        for i in range(24):
            dt = _now() - timedelta(days=random.randint(0, 90))
            credit = i % 4 != 0
            amt = round(random.uniform(200, 3000), 2)
            docs.append({
                "id": new_id(), "merchant_id": mid,
                "kind": "commission" if credit else "adjustment",
                "direction": "credit" if credit else "debit",
                "amount": amt, "ref_type": "demo", "ref_id": "TXN" + str(20000 + i),
                "note": "Commission credit" if credit else "Adjustment",
                "status": "completed", "created_at": _iso(dt),
            })
        await db.merchant_ledger.insert_many(docs)
        # top up wallet balance so withdraw demo works
        total_credit = round(sum(d["amount"] for d in docs if d["direction"] == "credit"), 2)
        await db.users.update_one({"id": mid}, {"$inc": {"wallet_balance": total_credit}})
        seeded["wallet_ledger"] = len(docs)
    return seeded


async def _seed_demo_merchant_profile(user: dict):
    """Ensure the demo merchant has a COMPLETE + APPROVED merchant_profile so all
    gated features are unlocked in the demo (idempotent — only fills a profile that
    is not already approved)."""
    uid = user["id"]
    existing = await db.merchant_profiles.find_one({"user_id": uid}, {"_id": 0, "status": 1})
    if existing and existing.get("status") == "approved":
        return  # already good, don't overwrite
    shop_name = user.get("shop_name") or user.get("name") or "Sharma Electricals"
    profile = {
        "user_id": uid, "phone": user.get("phone", ""),
        "status": "approved", "completion_score": 100, "rejection_reason": "",
        "version": 1, "submitted_at": now_iso(), "reviewed_at": now_iso(),
        "reviewed_by": "system-seed",
        "basic": {
            "full_name": user.get("name") or "Rohit Sharma", "dob": "1988-05-14",
            "mobile": user.get("phone", ""), "email": user.get("email", "") or "sharma.shop@example.com",
            "gender": "male",
            "owner_photo": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=70",
        },
        "shop": {
            "shop_name": shop_name, "shop_type_id": "", "shop_type_name": "Electrical & Appliances",
            "categories": [{"category_id": "electrical", "category_name": "Electrical"},
                           {"category_id": "appliance", "category_name": "Appliance Repair"}],
            "gst_number": "10ABCDE1234F1Z5", "gst_url": "",
            "shop_verification_photo": "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&q=70",
            "shop_photo_lat": 25.5941, "shop_photo_lng": 85.1376,
            "shop_photo_captured_at": now_iso(), "shop_photo_distance_m": 24.0,
            "shop_photo_verified": True, "shop_photo_gps_ok": True,
            "photo_exterior": "", "photo_interior": "", "license_number": "", "license_url": "",
        },
        "address": {
            "manual_address": "Shop 12, Boring Road, Patna", "lat": 25.5941, "lng": 85.1376,
            "location_address": "Boring Road, Patna, Bihar 800001",
            "state": "Bihar", "district": "Patna", "city": "Patna", "village": "",
            "pincode": "800001",
        },
        "updated_at": now_iso(),
    }
    await db.merchant_profiles.update_one(
        {"user_id": uid},
        {"$set": profile, "$setOnInsert": {"id": new_id()}},
        upsert=True)
    await db.users.update_one(
        {"id": uid}, {"$set": {"kyc_status": "approved", "verified_merchant": True}})


async def seed_demo_default():
    """Seed for the demo merchant (+919000000002) at startup — idempotent."""
    u = await db.users.find_one({"phone": "+919000000002", "role": "merchant"}, {"_id": 0})
    if not u:
        u = await db.users.find_one({"role": "merchant"}, {"_id": 0})
    if u:
        try:
            await _seed_demo_merchant_profile(u)
        except Exception:  # noqa: BLE001
            pass
        return await seed_demo(u["id"])
    return {}
