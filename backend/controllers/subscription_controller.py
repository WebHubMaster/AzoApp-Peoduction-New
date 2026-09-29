"""Subscription booking controller — customer create/pay, partner daily marking,
admin assign/override/settlement. Reuses the existing payment_service + partner
wallet so nothing new is duplicated."""
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException
import hmac, hashlib

from config.database import db, now_iso, get_settings
from middleware.auth import SECRET
from models.user import new_id
from models.subscription import PLAN_DEFAULT_DURATION, DAY_STATUSES
from services import money, payment_service, storage_service
from services import subscription_service as svc
from services import invoice_service as inv_svc
from services.gateway_resolver import GatewayConfigError


async def _service_or_404(service_id):
    s = await db.services.find_one({"id": service_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Service not found")
    return s


# ---------------- CUSTOMER ----------------
async def get_plans(service_id):
    service = await _service_or_404(service_id)
    if not service.get("is_subscription"):
        raise HTTPException(status_code=400, detail="This service is not a subscription service")
    settings = await get_settings()
    plans = await svc.plan_preview(service, settings)
    return {"service_id": service_id, "service_name": service.get("name"),
            "category_name": service.get("category_name"), "plans": plans}


async def create_subscription(user, req):
    service = await _service_or_404(req.service_id)
    if not service.get("is_subscription"):
        raise HTTPException(status_code=400, detail="This service is not a subscription service")
    plan_type = (req.plan_type or "monthly").lower()
    if plan_type not in ("daily", "weekly", "monthly", "yearly"):
        raise HTTPException(status_code=400, detail="Invalid plan type")
    plan = svc.resolve_plan(service, plan_type)
    price = float(plan.get("price") or 0)
    if price <= 0:
        raise HTTPException(status_code=400, detail="This plan is not available for booking")

    # resolve address
    address = req.address
    if not address and req.address_id:
        u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "addresses": 1})
        for a in (u or {}).get("addresses", []) or []:
            if a.get("id") == req.address_id:
                address = a
                break
    if not address:
        raise HTTPException(status_code=400, detail="Please provide a service address")

    if not req.start_date:
        raise HTTPException(status_code=400, detail="Please pick a start date")
    start = svc._parse_date(req.start_date)
    duration = int(plan.get("duration_days") or PLAN_DEFAULT_DURATION.get(plan_type, 30))
    offs = svc._plan_offs(plan, req.weekly_offs)
    schedule = svc.build_schedule(start, duration, offs)
    working_days = plan.get("working_days") or sum(1 for d in schedule if d["status"] != "weekly_off")
    working_days = max(1, int(working_days))
    end = start + timedelta(days=duration - 1)

    settings = await get_settings()
    commission_pct = svc.commission_pct_for(settings)
    tax_pct = float(service.get("tax_pct") or 0)
    fin = svc.compute_financials(price, commission_pct, tax_pct, working_days)

    sub = {
        "id": new_id(),
        "code": await svc._unique_code(),
        "customer_id": user["id"],
        "customer_name": user.get("name"),
        "customer_phone": user.get("phone"),
        "service_id": service["id"],
        "service_name": service.get("name"),
        "category_id": service.get("category_id"),
        "category_name": service.get("category_name"),
        "required_skill": service.get("required_skill") or "",
        "plan_type": plan_type,
        "plan_label": plan.get("label") or plan_type.title(),
        "price": fin["gross"],
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "duration_days": duration,
        "weekly_offs": offs,
        "preferred_time": req.preferred_time or "",
        "address": address,
        "notes": req.notes or "",
        # ---- SNAPSHOT (immutable): future admin rate changes never affect this sub ----
        "commission_pct": fin["commission_pct"],
        "commission_amount": fin["commission_amount"],
        "tax_pct": fin["tax_pct"],
        "tax_amount": fin["tax_amount"],
        "partner_allocation": fin["partner_allocation"],
        "working_days": fin["working_days"],
        "per_day_earning": fin["per_day_earning"],
        # ---- state ----
        "status": "pending_payment",
        "payment_status": "pending",
        "partner_id": None,
        "partner_name": None,
        "schedule": schedule,
        "completed_days": 0,
        "absent_days": 0,
        "customer_cancel_days": 0,
        "weekly_off_days": sum(1 for d in schedule if d["status"] == "weekly_off"),
        "accrued_earning": 0.0,
        "absent_adjustment": 0.0,
        "customer_cancel_retained": 0.0,
        "replacement_earnings": {},
        "platform_total": fin["commission_amount"],
        "settlement_amount": 0.0,
        "settlement": {"status": "none"},
        "timeline": [{"status": "pending_payment", "at": now_iso()}],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.subscriptions.insert_one(dict(sub))
    sub.pop("_id", None)
    return sub


async def _sub_for_customer(user, subscription_id):
    sub = await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if sub["customer_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not your subscription")
    return sub


async def list_mine(user):
    rows = await db.subscriptions.find(
        {"customer_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [await svc.ensure_day_otps(r) for r in rows]


async def get_one(user, subscription_id):
    sub = await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    role = user.get("role")
    if role == "admin":
        return sub
    if role == "customer" and sub.get("customer_id") == user["id"]:
        return await svc.ensure_day_otps(sub)
    if role == "partner" and sub.get("partner_id") == user["id"]:
        return svc.strip_otps_for_partner(sub)
    raise HTTPException(status_code=403, detail="Not allowed")


# ---------------- PAYMENT (upfront, full amount) ----------------
async def pay_order(user, subscription_id):
    sub = await _sub_for_customer(user, subscription_id)
    if sub.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Already paid")
    amt = float(sub["price"])
    try:
        order = await payment_service.create_order(amt, sub["code"], customer={
            "id": user.get("id"), "name": user.get("name"),
            "email": user.get("email"), "phone": user.get("phone")})
    except GatewayConfigError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not order:
        raise HTTPException(status_code=409, detail="Payment gateway is not configured.")
    await db.subscriptions.update_one(
        {"id": subscription_id},
        {"$set": {"pay_order_id": order.get("order_id"), "pay_gateway": order.get("gateway"),
                  "pay_mode": order.get("mode"), "pay_env": order.get("env")}})
    return {**order}


def _invoice_share_sig(invoice_id: str) -> str:
    return hmac.new(SECRET.encode(), f"invoice-share:{invoice_id}".encode(), hashlib.sha256).hexdigest()[:32]


async def _ensure_payment_invoice(sub):
    """Record the upfront subscription payment in the shared transactions ledger and
    generate its invoice via the existing invoice pipeline (idempotent per txn)."""
    txn = await db.transactions.find_one({"kind": "subscription_payment", "ref_id": sub["id"]}, {"_id": 0})
    if not txn:
        txn = {
            "id": new_id(), "user_id": sub["customer_id"], "type": "debit",
            "kind": "subscription_payment", "amount": money.money(sub.get("price") or 0),
            "method": "Online" if sub.get("pay_gateway") else "Mock",
            "note": f"{sub.get('service_name')} · {sub.get('plan_label')} Subscription ({sub.get('code')})",
            "ref_id": sub["id"], "created_at": sub.get("paid_at") or now_iso(),
        }
        await db.transactions.insert_one(dict(txn))
        txn.pop("_id", None)
    inv = await inv_svc.ensure_transaction_invoice(txn)
    if inv:
        await db.subscriptions.update_one({"id": sub["id"]}, {"$set": {"invoice_id": inv["id"]}})
    return inv


async def _activate(sub):
    """Mark paid + activate. Schedule already generated at create time."""
    await db.subscriptions.update_one(
        {"id": sub["id"]},
        {"$set": {"payment_status": "paid", "status": "active", "paid_at": now_iso(),
                  "updated_at": now_iso()},
         "$push": {"timeline": {"status": "active", "at": now_iso()}}})
    sub = await db.subscriptions.find_one({"id": sub["id"]}, {"_id": 0})
    try:
        await _ensure_payment_invoice(sub)
    except Exception as e:
        print(f"[subscriptions] invoice generation failed for {sub.get('code')}: {e}")  # lazy retry via invoice endpoint
    return sub


async def pay_verify(user, subscription_id, data):
    sub = await _sub_for_customer(user, subscription_id)
    if sub.get("payment_status") == "paid":
        return await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    ok = await payment_service.verify_signature(data.order_id, data.payment_id, data.signature)
    if not ok:
        raise HTTPException(status_code=400, detail="Payment verification failed")
    await db.subscriptions.update_one(
        {"id": subscription_id},
        {"$set": {"razorpay_order_id": data.order_id, "razorpay_payment_id": data.payment_id}})
    return await _activate(sub)


async def pay_confirm(user, subscription_id, order_id, gw=None):
    """Hosted-checkout (Cashfree/Juspay/Easebuzz) confirm: verify the gateway order
    status on the transaction's stored gateway+mode snapshot and activate on success."""
    sub = await _sub_for_customer(user, subscription_id)
    if sub.get("payment_status") == "paid":
        return await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    paid = await payment_service.check_order_paid(
        order_id or sub.get("pay_order_id"),
        sub.get("pay_gateway") or gw, sub.get("pay_mode"))
    if not paid:
        raise HTTPException(status_code=400, detail="Payment not completed. If money was debited it will reflect shortly.")
    return await _activate(sub)


async def get_invoice(user, subscription_id):
    """Shareable public invoice link for the upfront subscription payment (lazy-generates
    for subscriptions paid before invoice support existed)."""
    sub = await _sub_for_customer(user, subscription_id)
    if sub.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail="Subscription is not paid yet")
    inv_id = sub.get("invoice_id")
    if not inv_id:
        inv = await _ensure_payment_invoice(sub)
        inv_id = (inv or {}).get("id")
    if not inv_id:
        raise HTTPException(status_code=404, detail="Invoice not available")
    return {"invoice_id": inv_id, "path": f"/invoices/pub/{inv_id}?s={_invoice_share_sig(inv_id)}"}


# ---------------- PARTNER (maid) ----------------
async def partner_list(user):
    rows = await db.subscriptions.find(
        {"partner_id": user["id"], "status": {"$in": ["active", "completed"]}},
        {"_id": 0}).sort("created_at", -1).to_list(200)
    return [svc.strip_otps_for_partner(r) for r in rows]


async def partner_start_day(user, subscription_id, day_date, otp):
    """Start Service — customer shares the day's OTP with the maid on arrival.
    Moves the day scheduled → in_progress (no earning until completed)."""
    sub = await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if sub.get("partner_id") != user["id"]:
        raise HTTPException(status_code=403, detail="This subscription is not assigned to you")
    if sub.get("status") != "active":
        raise HTTPException(status_code=400, detail="Subscription is not active")
    if day_date > datetime.now(timezone.utc).date().isoformat():
        raise HTTPException(status_code=400, detail="This service day has not arrived yet")
    day = next((d for d in (sub.get("schedule") or []) if d.get("date") == day_date), None)
    if not day:
        raise HTTPException(status_code=404, detail="No scheduled day for that date")
    if day.get("status") != "scheduled":
        raise HTTPException(status_code=400, detail=f"Day already marked as {day.get('status')}")
    if not otp or not day.get("otp") or not hmac.compare_digest(str(day.get("otp")), str(otp).strip()):
        raise HTTPException(status_code=400, detail="Invalid customer start OTP")
    await _set_day(subscription_id, day_date, "in_progress", marked_by=user["id"], allowed_from=("scheduled",))
    sub = await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    for d in sub["schedule"]:
        if d["date"] == day_date:
            d["started_at"] = now_iso()
    await db.subscriptions.update_one({"id": subscription_id}, {"$set": {"schedule": sub["schedule"], "updated_at": now_iso()}})
    return svc.strip_otps_for_partner(sub)


async def partner_mark_completed(user, subscription_id, day_date, note="", photo=None):
    """Complete Service — today's day must be started first (customer OTP verified);
    past days can be marked directly (backdated). Optional photo proof goes to storage."""
    sub = await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if sub.get("partner_id") != user["id"]:
        raise HTTPException(status_code=403, detail="This subscription is not assigned to you")
    if sub.get("status") != "active":
        raise HTTPException(status_code=400, detail="Subscription is not active")
    today = datetime.now(timezone.utc).date().isoformat()
    if day_date > today:
        raise HTTPException(status_code=400, detail="Cannot complete a future service day")
    photo_url = None
    if photo:
        if len(photo) > 8_000_000:  # ~6 MB image as base64
            raise HTTPException(status_code=400, detail="Photo is too large")
        try:
            photo_url = await storage_service.materialize_data_url(photo.strip(), f"subscriptions/{subscription_id}", max_side=1280)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    allowed = ("in_progress",) if day_date == today else ("scheduled", "in_progress")
    await _set_day(subscription_id, day_date, "completed",
                   served_by=user["id"], marked_by=user["id"], note=note,
                   allowed_from=allowed)
    sub = await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    for d in sub["schedule"]:
        if d["date"] == day_date:
            d["completed_at"] = now_iso()
            if photo_url:
                d["proof_photo"] = photo_url
    await db.subscriptions.update_one({"id": subscription_id}, {"$set": {"schedule": sub["schedule"], "updated_at": now_iso()}})
    return svc.strip_otps_for_partner(sub)


async def _set_day(subscription_id, day_date, status, served_by=None,
                   replacement_partner_id=None, marked_by=None, note="", allowed_from=None):
    if status not in DAY_STATUSES or status == "scheduled":
        raise HTTPException(status_code=400, detail="Invalid day status")
    sub = await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    schedule = sub.get("schedule") or []
    idx = next((i for i, d in enumerate(schedule) if d.get("date") == day_date), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="No scheduled day for that date")
    day = schedule[idx]
    if day.get("status") == "weekly_off" and status != "weekly_off":
        raise HTTPException(status_code=400, detail="This day is an agreed weekly off")
    if allowed_from and day.get("status") not in allowed_from:
        raise HTTPException(status_code=400, detail=f"Day already marked as {day.get('status')}")
    day["status"] = status
    day["note"] = note or day.get("note") or ""
    day["marked_by"] = marked_by
    day["marked_at"] = now_iso()
    if status == "completed":
        day["served_by"] = served_by or sub.get("partner_id")
    elif status == "replacement_completed":
        if not replacement_partner_id:
            raise HTTPException(status_code=400, detail="replacement_partner_id is required")
        day["replacement_partner_id"] = replacement_partner_id
        day["served_by"] = replacement_partner_id
    else:
        day["served_by"] = None
    schedule[idx] = day
    await db.subscriptions.update_one(
        {"id": subscription_id}, {"$set": {"schedule": schedule, "updated_at": now_iso()}})
    await svc.apply_accrual(subscription_id)
    return await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})


# ---------------- ADMIN ----------------
async def admin_list(status=None, q=None):
    query = {}
    if status:
        query["status"] = status
    if q:
        query["$or"] = [{"code": {"$regex": q, "$options": "i"}},
                        {"customer_name": {"$regex": q, "$options": "i"}},
                        {"service_name": {"$regex": q, "$options": "i"}}]
    return await db.subscriptions.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)


async def admin_eligible_partners(subscription_id):
    sub = await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    rows = await db.users.find(
        {"role": "partner", "status": "active"},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "skills": 1, "city": 1,
         "rating": 1, "kyc_status": 1}).to_list(500)
    return rows


async def admin_assign_partner(subscription_id, partner_id):
    sub = await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    p = await db.users.find_one({"id": partner_id, "role": "partner"}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Partner not found")
    await db.subscriptions.update_one(
        {"id": subscription_id},
        {"$set": {"partner_id": partner_id, "partner_name": p.get("name"),
                  "partner_phone": p.get("phone"), "updated_at": now_iso()},
         "$push": {"timeline": {"status": "partner_assigned", "at": now_iso(), "partner_id": partner_id}}})
    await svc.apply_accrual(subscription_id)
    return await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})


async def admin_mark_day(subscription_id, day_date, req):
    return await _set_day(subscription_id, day_date, req.status,
                          replacement_partner_id=req.replacement_partner_id,
                          marked_by="admin", note=req.note,
                          served_by=None)


async def admin_finalize(subscription_id):
    sub = await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    await svc.apply_accrual(subscription_id)
    sub = await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    settlement = {
        "status": "pending",
        "amount": money.money(sub.get("settlement_amount") or 0),
        "generated_at": now_iso(),
        "reviewed_at": None, "approved_at": None, "paid_at": None, "note": "",
    }
    await db.subscriptions.update_one(
        {"id": subscription_id},
        {"$set": {"status": "completed", "settlement": settlement, "updated_at": now_iso()},
         "$push": {"timeline": {"status": "completed", "at": now_iso()}}})
    return await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})


async def admin_settlement_action(subscription_id, req):
    sub = await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    settlement = sub.get("settlement") or {}
    if settlement.get("status") in (None, "none"):
        raise HTTPException(status_code=400, detail="No settlement generated yet. Finalize first.")
    action = (req.action or "").lower()
    if action == "review":
        settlement = {**settlement, "status": "review", "reviewed_at": now_iso(), "note": req.note}
    elif action == "approve":
        settlement = {**settlement, "status": "approved", "approved_at": now_iso(), "note": req.note}
    elif action == "reject":
        settlement = {**settlement, "status": "pending", "note": req.note}
    elif action == "pay":
        if settlement.get("status") != "approved":
            raise HTTPException(status_code=400, detail="Approve the settlement before paying")
        return await svc.pay_settlement(sub)
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
    await db.subscriptions.update_one(
        {"id": subscription_id},
        {"$set": {"settlement": settlement, "updated_at": now_iso()},
         "$push": {"timeline": {"status": f"settlement_{action}", "at": now_iso()}}})
    return await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})


async def admin_stats():
    active = await db.subscriptions.count_documents({"status": "active"})
    completed = await db.subscriptions.count_documents({"status": "completed"})
    pending_settlement = await db.subscriptions.count_documents({"settlement.status": "pending"})
    review = await db.subscriptions.count_documents({"settlement.status": "review"})
    approved = await db.subscriptions.count_documents({"settlement.status": "approved"})
    return {"active": active, "completed": completed,
            "settlement_pending": pending_settlement,
            "settlement_review": review, "settlement_approved": approved}
