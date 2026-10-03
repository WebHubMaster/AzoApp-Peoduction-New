"""Admin subscription lifecycle: pause (shift days forward), resume, cancel with
pro-rata refund, and renewal reminders (nudges)."""
import random
from datetime import datetime, timezone, timedelta, date
from fastapi import HTTPException
from config.database import db, now_iso
from services import money
from services import subscription_service as svc

OPEN = ("scheduled",)


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _new_day(d: date, offs: set) -> dict:
    off = d.weekday() in offs
    return {"date": d.isoformat(), "weekday": d.weekday(), "status": "weekly_off" if off else "scheduled",
            "earning": 0.0, "served_by": None, "replacement_partner_id": None, "note": "",
            "marked_by": None, "marked_at": None, "otp": None if off else f"{random.randint(1000, 9999)}",
            "started_at": None, "completed_at": None, "proof_photo": None, "added_by_pause": True}


async def _get(sid: str) -> dict:
    sub = await db.subscriptions.find_one({"id": sid}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return sub


async def _notify(user_id, event, title, body, ctx):
    if not user_id:
        return
    try:
        from services import template_service
        await template_service.fire_event(user_id, event, ctx, fallback_title=title, fallback_body=body, link="/account")
    except Exception:  # noqa: BLE001
        pass


async def pause(sid: str, from_date: str, days: int, reason: str = "") -> dict:
    sub = await _get(sid)
    if sub.get("status") != "active":
        raise HTTPException(status_code=400, detail="Only active subscriptions can be paused")
    if sub.get("pause") and sub["pause"].get("active"):
        raise HTTPException(status_code=400, detail="Subscription is already paused. Resume it first.")
    days = int(days or 0)
    if days < 1 or days > 60:
        raise HTTPException(status_code=400, detail="Pause length must be 1–60 days")
    start = svc._parse_date(from_date or _today())
    if start.isoformat() < _today():
        raise HTTPException(status_code=400, detail="Pause cannot start in the past")
    end = start + timedelta(days=days - 1)
    schedule = [dict(d) for d in (sub.get("schedule") or [])]
    paused = 0
    for d in schedule:
        if start.isoformat() <= d["date"] <= end.isoformat() and d.get("status") in OPEN:
            d["status"] = "paused"
            d["otp"] = None
            paused += 1
    if paused == 0:
        raise HTTPException(status_code=400, detail="No upcoming working days in that range to pause")
    offs = set(sub.get("weekly_offs") or [])
    cur = svc._parse_date(sub["end_date"])
    added = 0
    while added < paused:
        cur += timedelta(days=1)
        nd = _new_day(cur, offs)
        schedule.append(nd)
        if nd["status"] == "scheduled":
            added += 1
    info = {"active": True, "from": start.isoformat(), "to": end.isoformat(), "days": days,
            "paused_working_days": paused, "reason": reason or "", "at": now_iso(),
            "old_end_date": sub["end_date"], "new_end_date": cur.isoformat()}
    await db.subscriptions.update_one({"id": sid}, {
        "$set": {"schedule": schedule, "end_date": cur.isoformat(), "duration_days": len(schedule),
                 "pause": info, "updated_at": now_iso()},
        "$push": {"timeline": {"status": "paused", "at": now_iso(), "from": info["from"], "to": info["to"]},
                  "pause_history": info}})
    await _notify(sub.get("customer_id"), "subscription_paused", "Subscription paused",
                  f"Your {sub.get('plan_label')} plan {sub.get('code')} is paused {fmt(start)}–{fmt(end)}. "
                  f"It now ends on {fmt(cur)}.", {"name": sub.get("customer_name"), "booking_id": sub.get("code"),
                                                  "from": fmt(start), "to": fmt(end), "end_date": fmt(cur)})
    if sub.get("partner_id"):
        await _notify(sub["partner_id"], "subscription_paused", "Subscription paused",
                      f"{sub.get('code')} is paused {fmt(start)}–{fmt(end)}. No visits on those days.",
                      {"booking_id": sub.get("code")})
    return await _get(sid)


async def resume(sid: str) -> dict:
    sub = await _get(sid)
    p = sub.get("pause") or {}
    if not p.get("active"):
        raise HTTPException(status_code=400, detail="Subscription is not paused")
    today = _today()
    schedule = [dict(d) for d in (sub.get("schedule") or [])]
    restored = 0
    for d in schedule:
        if d.get("status") == "paused" and d["date"] >= today:
            d["status"] = "scheduled"
            d["otp"] = f"{random.randint(1000, 9999)}"
            restored += 1
    # Drop the same number of trailing pause-added working days (still untouched).
    removed = 0
    while restored > removed and schedule:
        last = schedule[-1]
        if not last.get("added_by_pause") or last.get("status") not in ("scheduled", "weekly_off"):
            break
        schedule.pop()
        if last["status"] == "scheduled":
            removed += 1
    while schedule and schedule[-1].get("added_by_pause") and schedule[-1].get("status") == "weekly_off":
        schedule.pop()
    new_end = schedule[-1]["date"]
    await db.subscriptions.update_one({"id": sid}, {
        "$set": {"schedule": schedule, "end_date": new_end, "duration_days": len(schedule),
                 "pause": {**p, "active": False, "resumed_at": now_iso()}, "updated_at": now_iso()},
        "$push": {"timeline": {"status": "resumed", "at": now_iso()}}})
    await _notify(sub.get("customer_id"), "subscription_resumed", "Subscription resumed",
                  f"Your plan {sub.get('code')} is active again. It now ends on {fmt(svc._parse_date(new_end))}.",
                  {"name": sub.get("customer_name"), "booking_id": sub.get("code")})
    return await _get(sid)


def refund_quote(sub: dict) -> dict:
    today = _today()
    working = [d for d in (sub.get("schedule") or []) if d.get("status") != "weekly_off"]
    total_wd = int(sub.get("working_days") or len(working) or 1)
    # paused days are already re-added at the end as scheduled days — count only those
    remaining = [d for d in working if d.get("status") == "scheduled" and d["date"] >= today]
    paid = money.money(sub.get("total_payable") or sub.get("price") or 0)
    is_paid = sub.get("payment_status") == "paid"
    amount = money.money(paid * len(remaining) / total_wd) if is_paid else 0.0
    return {"paid": paid if is_paid else 0.0, "working_days": total_wd, "remaining_days": len(remaining),
            "used_days": total_wd - len(remaining), "refund_amount": min(amount, paid),
            "maid_earned": money.money(sub.get("accrued_earning") or 0)}


async def cancel(sid: str, reason: str = "") -> dict:
    sub = await _get(sid)
    if sub.get("status") not in ("active", "pending_payment"):
        raise HTTPException(status_code=400, detail=f"A {sub.get('status')} subscription cannot be cancelled")
    q = refund_quote(sub)
    today = _today()
    schedule = [dict(d) for d in (sub.get("schedule") or [])]
    for d in schedule:
        if d.get("status") in ("scheduled", "paused") and d["date"] >= today:
            d["status"] = "cancelled"
            d["otp"] = None
    await db.subscriptions.update_one({"id": sid}, {"$set": {"schedule": schedule}})
    await svc.apply_accrual(sid)
    sub = await _get(sid)
    refund = None
    if q["refund_amount"] > 0:
        from services import refund_service
        pseudo = {**sub, "pricing": {"total": q["paid"], "gst": sub.get("gst_amount") or 0,
                                     "commissionable_base": sub.get("price") or 0},
                  "service_name": f"{sub.get('service_name')} · {sub.get('plan_label')} subscription"}
        refund = await refund_service.initiate_refund(pseudo, q["refund_amount"], reason or "Subscription cancelled by admin", {
            "refund_pct": round(q["refund_amount"] * 100 / q["paid"], 2) if q["paid"] else 0,
            "service_cost": sub.get("price") or 0, "tax_amount": sub.get("gst_amount") or 0})
    upd = {"status": "cancelled", "cancelled_at": now_iso(), "updated_at": now_iso(),
           "pause": {**(sub.get("pause") or {}), "active": False} if sub.get("pause") else None,
           "cancellation": {"at": now_iso(), "by": "admin", "reason": reason or "", **q,
                            "refund_id": (refund or {}).get("id"), "refund_status": (refund or {}).get("status")}}
    if q["refund_amount"] > 0:
        upd["payment_status"] = "refunded" if q["refund_amount"] >= q["paid"] else "partially_refunded"
    if (sub.get("accrued_earning") or 0) > 0 and (sub.get("settlement") or {}).get("status") in (None, "none"):
        upd["settlement"] = {"status": "pending", "amount": money.money(sub.get("settlement_amount") or 0),
                             "generated_at": now_iso(), "reviewed_at": None, "approved_at": None, "paid_at": None,
                             "note": "Auto-generated on cancellation"}
    await db.subscriptions.update_one({"id": sid}, {"$set": upd, "$push": {"timeline": {"status": "cancelled", "at": now_iso()}}})
    msg = f" ₹{q['refund_amount']} will be refunded for {q['remaining_days']} unused day(s)." if q["refund_amount"] > 0 else ""
    await _notify(sub.get("customer_id"), "subscription_cancelled", "Subscription cancelled",
                  f"Your plan {sub.get('code')} has been cancelled.{msg}",
                  {"name": sub.get("customer_name"), "booking_id": sub.get("code"), "amount": q["refund_amount"]})
    if sub.get("partner_id"):
        await _notify(sub["partner_id"], "subscription_cancelled", "Subscription cancelled",
                      f"{sub.get('code')} has been cancelled. No further visits.", {"booking_id": sub.get("code")})
    return await _get(sid)


async def renewals(days: int = 3) -> list:
    today = datetime.now(timezone.utc).date()
    hi = (today + timedelta(days=max(0, int(days)))).isoformat()
    return await db.subscriptions.find(
        {"status": "active", "end_date": {"$gte": today.isoformat(), "$lte": hi}},
        {"_id": 0, "schedule": 0}).sort("end_date", 1).to_list(500)


async def nudge(sid: str) -> dict:
    sub = await _get(sid)
    if sub.get("status") != "active":
        raise HTTPException(status_code=400, detail="Only active subscriptions can be nudged")
    end = svc._parse_date(sub["end_date"])
    left = (end - datetime.now(timezone.utc).date()).days
    when = "today" if left <= 0 else ("tomorrow" if left == 1 else f"in {left} days")
    res = None
    from services import template_service
    res = await template_service.fire_event(
        sub["customer_id"], "subscription_renewal_reminder",
        {"name": sub.get("customer_name"), "booking_id": sub.get("code"), "plan": sub.get("plan_label"),
         "end_date": fmt(end), "_data": {"subscription_id": sid}},
        fallback_title="Your plan is ending soon",
        fallback_body=f"Your {sub.get('plan_label')} {sub.get('service_name')} plan ends {when} ({fmt(end)}). Renew now to keep your maid visits uninterrupted.",
        link="/account")
    entry = {"at": now_iso(), "by": "admin", "sms": bool((res or {}).get("sms"))}
    await db.subscriptions.update_one({"id": sid}, {"$set": {"last_renewal_nudge": entry}, "$push": {"renewal_nudges": entry}})
    return {"ok": True, "id": sid, "code": sub.get("code"), "last_renewal_nudge": entry}


def fmt(d: date) -> str:
    return d.strftime("%d %b %Y")


async def seed_templates():
    from services import template_service
    defaults = [
        ("sms", "Subscription Renewal Reminder", "subscription_renewal_reminder",
         "AzoApp: Hi {{name}}, your {{plan}} plan {{booking_id}} ends on {{end_date}}. Renew in the app to keep your maid visits uninterrupted."),
        ("sms", "Subscription Paused", "subscription_paused",
         "AzoApp: Your plan {{booking_id}} is paused from {{from}} to {{to}}. New end date: {{end_date}}."),
        ("sms", "Subscription Cancelled", "subscription_cancelled",
         "AzoApp: Your plan {{booking_id}} has been cancelled. Refund of Rs.{{amount}} (if any) will be processed shortly."),
    ]
    for ch, name, ev, body in defaults:
        if not await db.notification_templates.find_one({"event": ev, "channel": ch}):
            await template_service.upsert_template({"channel": ch, "name": name, "event": ev, "category": "subscription",
                                                    "body": body, "active": True})
