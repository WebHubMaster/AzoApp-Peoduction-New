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
from services import push_dispatch
from services import realtime as rt
from services.gateway_resolver import GatewayConfigError

# How long (hours) the customer is told their maid assignment is under admin review.
ASSIGNMENT_SLA_HOURS = 2


async def _service_or_404(service_id):
    s = await db.services.find_one({"id": service_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Service not found")
    from services.city_pricing_service import price_one
    p = await price_one(s)
    if not p:
        raise HTTPException(status_code=400, detail="This service is not available in your city")
    return p


# ---------------- CUSTOMER ----------------
async def get_plans(service_id):
    service = await _service_or_404(service_id)
    if not service.get("is_subscription"):
        raise HTTPException(status_code=400, detail="This service is not a subscription service")
    from services import category_commission_service as _ccs
    settings = await _ccs.settings_for_category(await get_settings(), service.get("category_id"))
    plans = await svc.plan_preview(service, settings)
    return {"service_id": service_id, "service_name": service.get("name"),
            "category_name": service.get("category_name"), "plans": plans}


async def create_subscription(user, req):
    service = await _service_or_404(req.service_id)
    if not service.get("is_subscription"):
        raise HTTPException(status_code=400, detail="This service is not a subscription service")
    plan_type = (req.plan_type or "monthly").lower()
    if plan_type not in ("daily", "weekly", "monthly", "quarterly", "yearly"):
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

    from services import category_commission_service as _ccs
    settings = await _ccs.settings_for_category(await get_settings(), service.get("category_id"))
    commission_pct = svc.commission_pct_for(settings)
    tax_pct = float(service.get("tax_pct") or 0)
    fin = svc.compute_financials(price, commission_pct, tax_pct, working_days)
    # Customer-facing price — computed through the EXACT SAME engine a normal booking
    # uses (GST, service charge, any platform/visiting charges), by quoting the plan as
    # a custom line. This does NOT change the maid's earning (allocation stays on the
    # plan gross); GST etc. are collected on top, just like a normal booking.
    from controllers import booking_controller as _bc
    try:
        _quote = await _bc.cart_quote(user, [{
            "custom": True,
            "custom_name": f"{service.get('name')} — {plan.get('label') or plan_type.title()} plan",
            "custom_price": fin["gross"], "category_id": service.get("category_id"),
            "category_name": service.get("category_name"), "qty": 1,
        }], schedule_type="schedule", address=address, apply_emergency=False)
        _p = _quote.get("pricing") or {}
    except Exception:  # noqa: BLE001 — never block booking on a quote hiccup
        _p = {}
    gst_pct = float(settings.get("gst_pct") or 0)
    gst_amount = money.money(_p.get("gst") if _p.get("gst") is not None else money.pct(fin["gross"], gst_pct))
    total_payable = money.money(_p.get("total") if _p.get("total") is not None else money.add(fin["gross"], gst_amount))
    # Guarantee a full pricing object so the invoice/cancellation engines always have
    # the same keys a normal booking carries (Service Amount, fees, GST, commission base).
    if not _p:
        _p = {
            "base": fin["gross"], "subtotal": fin["gross"], "gross_charges": fin["gross"],
            "addons_total": 0.0, "convenience_fee": 0.0, "platform_fee": 0.0,
            "visiting_charge": 0.0, "emergency_fee": 0.0, "surge": 0.0, "discount": 0.0,
            "gst_pct": gst_pct, "gst": gst_amount, "tax_base": fin["gross"],
            "commissionable_base": fin["gross"], "commission_pct": commission_pct,
            "total": total_payable,
        }

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
        "gst_pct": gst_pct,
        "gst_amount": gst_amount,
        "total_payable": total_payable,
        "customer_pricing": _p,
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
        # Commission/cancellation config snapshot (category-wise %) — drives the invoice
        # commission line AND the normal-booking cancellation money-math.
        "commission_config": {"commission": settings.get("commission") or {}, "gst_pct": gst_pct},
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
    out = []
    for r in rows:
        r = await svc.ensure_day_otps(r)
        out.append(svc.customer_view(r))
    return out


async def get_one(user, subscription_id):
    sub = await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    role = user.get("role")
    if role == "admin":
        return sub
    if role == "customer" and sub.get("customer_id") == user["id"]:
        sub = await svc.ensure_day_otps(sub)
        return svc.customer_view(sub)
    if role == "partner" and sub.get("partner_id") == user["id"]:
        return svc.strip_otps_for_partner(sub)
    raise HTTPException(status_code=403, detail="Not allowed")


# ---------------- PAYMENT (upfront, full amount) ----------------
async def pay_order(user, subscription_id):
    sub = await _sub_for_customer(user, subscription_id)
    if sub.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Already paid")
    amt = float(sub.get("total_payable") or sub["price"])
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


async def pay_mock(user, subscription_id):
    """Dev-only mock payment — activates the subscription WITHOUT a live gateway.
    Only allowed when no pay-in gateway is configured (the Customer app falls back
    here after /pay/order returns 409, and seed/demo scripts use it). When a real
    gateway IS configured this refuses so live payments can never be bypassed."""
    sub = await _sub_for_customer(user, subscription_id)
    if sub.get("payment_status") == "paid":
        return await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    if await payment_service.is_configured():
        raise HTTPException(status_code=409, detail="A live payment gateway is configured — complete payment on the gateway.")
    return await _activate(sub)


def _invoice_share_sig(invoice_id: str) -> str:
    return hmac.new(SECRET.encode(), f"invoice-share:{invoice_id}".encode(), hashlib.sha256).hexdigest()[:32]


def _sub_booking_shape(sub, status="paid"):
    """A booking-shaped dict derived from a subscription so it can flow through the
    SAME invoice + cancellation engines a normal service booking uses (full breakdown,
    GST block, commission split, cancellation credit-note)."""
    pr = dict(sub.get("customer_pricing") or {})
    if not pr:
        gross = money.money(sub.get("price") or 0)
        gst_amt = money.money(sub.get("gst_amount") or 0)
        pr = {
            "base": gross, "subtotal": gross, "gross_charges": gross, "addons_total": 0.0,
            "convenience_fee": 0.0, "platform_fee": 0.0, "visiting_charge": 0.0,
            "emergency_fee": 0.0, "surge": 0.0, "discount": 0.0,
            "gst_pct": float(sub.get("gst_pct") or 0), "gst": gst_amt,
            "tax_base": gross, "commissionable_base": money.money(sub.get("price") or 0),
            "commission_pct": float(sub.get("commission_pct") or 0),
            "total": money.money(sub.get("total_payable") or gross),
        }
    return {
        "id": sub["id"],
        "code": sub.get("code") or "",
        "customer_id": sub.get("customer_id"),
        "customer_name": sub.get("customer_name"),
        "customer_phone": sub.get("customer_phone"),
        "partner_id": sub.get("partner_id"),
        "partner_name": sub.get("partner_name"),
        "address": sub.get("address") or {},
        "service_name": f"{sub.get('service_name')} · {sub.get('plan_label')} Subscription",
        "category_id": sub.get("category_id") or "",
        "category_name": sub.get("category_name") or "",
        "pricing": pr,
        "commission_config": sub.get("commission_config") or {},
        "payment_status": "paid" if sub.get("payment_status") == "paid" else "pending",
        "payment_method": "Online" if sub.get("pay_gateway") else "Wallet",
        "status": status,
        "notes": sub.get("notes") or "",
        "razorpay_order_id": sub.get("razorpay_order_id"),
        "razorpay_payment_id": sub.get("razorpay_payment_id"),
        "pay_gateway": sub.get("pay_gateway"),
        "pay_mode": sub.get("pay_mode"),
        "pay_env": sub.get("pay_env"),
        "created_at": sub.get("paid_at") or sub.get("created_at") or now_iso(),
        "updated_at": now_iso(),
    }


async def _ensure_payment_invoice(sub):
    """Record the upfront subscription payment in the shared transactions ledger and
    generate a FULL booking-style Tax Invoice (same breakdown a normal service booking
    gets: Service Amount, fees, GST block, commission, line items)."""
    txn = await db.transactions.find_one({"kind": "subscription_payment", "ref_id": sub["id"]}, {"_id": 0})
    if not txn:
        txn = {
            "id": new_id(), "user_id": sub["customer_id"], "type": "debit",
            "kind": "subscription_payment", "amount": money.money(sub.get("total_payable") or sub.get("price") or 0),
            "method": "Online" if sub.get("pay_gateway") else "Mock",
            "note": f"{sub.get('service_name')} · {sub.get('plan_label')} Subscription ({sub.get('code')})",
            "ref_id": sub["id"], "created_at": sub.get("paid_at") or now_iso(),
        }
        await db.transactions.insert_one(dict(txn))
        txn.pop("_id", None)
    # Full breakdown invoice (normal-booking pipeline) instead of a flat transaction doc.
    inv = await inv_svc.ensure_booking_invoice(_sub_booking_shape(sub, status="paid"))
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
    # RECURRING SUBSCRIPTION ORDERS ARE ADMIN-ASSIGNED (no partner ring).
    # Unlike a normal booking, a paid subscription order does NOT fire a full-screen
    # job alert to any partner. It lands in the admin panel as an order awaiting manual
    # partner assignment (admin_assign_partner). Normal one-off bookings keep their
    # existing partner full-screen dispatch untouched.
    if not sub.get("partner_id"):
        try:
            await _queue_subscription_for_admin(sub)
        except Exception as e:  # noqa: BLE001
            print(f"[subscriptions] admin queue failed for {sub.get('code')}: {e}")
    return sub


async def _queue_subscription_for_admin(sub):
    """Mark a paid subscription as awaiting admin assignment and notify admins.
    Deliberately does NOT ring any partner (no full-screen job alert)."""
    eta = (datetime.now(timezone.utc) + timedelta(hours=ASSIGNMENT_SLA_HOURS)).isoformat()
    await db.subscriptions.update_one(
        {"id": sub["id"]},
        {"$set": {"dispatch_status": "awaiting_assignment", "offered_partner_ids": [],
                  "assignment_status": "under_review", "assignment_eta": eta,
                  "assignment_sla_hours": ASSIGNMENT_SLA_HOURS, "updated_at": now_iso()}})
    brief = await _sub_brief(sub)
    try:
        rt.emit_admin("subscription_new", brief)
    except Exception:  # noqa: BLE001
        pass
    try:
        await db.notifications.insert_one({
            "id": new_id(), "audience": "admin", "user_id": None,
            "title": "New subscription order — assign a partner",
            "body": f"{sub.get('code')} ({sub.get('service_name')} · "
                    f"{sub.get('plan_label')}) in "
                    f"{(sub.get('address') or {}).get('city') or 'the area'} is paid and "
                    f"awaiting manual partner assignment.",
            "subscription_id": sub["id"], "kind": "subscription_awaiting_assignment",
            "created_at": now_iso()})
    except Exception:  # noqa: BLE001
        pass
    # Tell the customer their maid assignment is under review (with the ETA).
    try:
        from datetime import datetime as _dt
        _eta = _dt.fromisoformat(eta).strftime("%I:%M %p").lstrip("0")
    except Exception:  # noqa: BLE001
        _eta = ""
    try:
        rt.emit_user(sub["customer_id"], "subscription_update", {"id": sub["id"]})
        await push_dispatch.push_to_user(
            sub["customer_id"], "Maid assignment under review",
            f"Payment received for {sub.get('service_name')} ({sub.get('code')}). "
            f"We're assigning the best-fit maid"
            + (f" — expected to be confirmed by {_eta}." if _eta else " shortly."),
            link="/account?tab=subscriptions",
            data={"type": "subscription_update", "subscription_id": sub["id"]})
    except Exception:  # noqa: BLE001
        pass


async def _sub_brief(sub):
    """Ring payload shaped like a booking job-request so the Partner app's existing
    JobRingOverlay renders it unchanged (kind='subscription' routes Accept to the
    subscription accept endpoint)."""
    addr = sub.get("address") or {}
    svcdoc = await db.services.find_one({"id": sub.get("service_id")}, {"_id": 0, "image": 1}) or {}
    return {
        "id": sub["id"], "kind": "subscription", "subscription_id": sub["id"],
        "code": sub.get("code", ""),
        "service_name": sub.get("service_name", ""),
        "category_name": sub.get("category_name", ""),
        "service_image": svcdoc.get("image", ""),
        "city": addr.get("city", ""),
        "address_line": addr.get("line") or addr.get("address_line") or "",
        "total": str(sub.get("price") or ""),
        "services_total": str(sub.get("price") or ""),
        "partner_amount": str(sub.get("partner_allocation") or ""),
        "is_scheduled": True,
        "schedule_type": "schedule",
        "scheduled_date": sub.get("start_date", ""),
        "scheduled_time": sub.get("preferred_time", ""),
        "plan_label": sub.get("plan_label", ""),
    }


async def _sub_eligible_ids(sub):
    """All active, non-suspended maids whose skill matches the service (or all active
    partners if the service has no required_skill), excluding anyone already busy in
    this slot."""
    rows = await db.users.find(
        {"role": "partner", "status": "active", "suspended": {"$ne": True}},
        {"_id": 0, "id": 1, "skills": 1}).to_list(1000)
    busy = await svc.busy_partner_ids_for(sub)
    skill = (sub.get("required_skill") or "").lower()
    if not skill:
        return [p["id"] for p in rows if p["id"] not in busy]
    try:
        from services.partner_sync import skill_alias_map, skill_matches
        amap = await skill_alias_map()
        return [p["id"] for p in rows if p["id"] not in busy and skill_matches(p.get("skills"), skill, amap)]
    except Exception:  # noqa: BLE001
        return [p["id"] for p in rows if p["id"] not in busy]


async def _broadcast_subscription(sub):
    """Ring every eligible maid (SSE job_request + data-only FCM full-screen ring +
    in-app link). Marks the subscription 'searching' and records who was offered."""
    import json as _json  # noqa: F401
    pids = await _sub_eligible_ids(sub)
    brief = await _sub_brief(sub)
    await db.subscriptions.update_one(
        {"id": sub["id"]},
        {"$set": {"dispatch_status": "searching", "offered_partner_ids": pids,
                  "dispatch_started_at": now_iso(), "updated_at": now_iso()}})
    for pid in pids:
        rt.emit_user(pid, "job_request", brief)
        try:
            await push_dispatch.push_to_user(
                pid, "New subscription job",
                f"{brief['service_name']} · {brief['plan_label']} · {brief['city'] or 'nearby'}",
                link=f"/partner/subscriptions?job={sub['id']}",
                data={"type": "job_request", "kind": "subscription", "subscription_id": sub["id"],
                      "booking_id": sub["id"], "code": brief["code"],
                      "service_name": brief["service_name"], "category_name": brief["category_name"],
                      "city": brief["city"], "address_line": brief["address_line"],
                      "total": brief["total"], "services_total": brief["services_total"],
                      "partner_amount": brief["partner_amount"], "schedule_type": "schedule",
                      "scheduled_date": brief["scheduled_date"], "scheduled_time": brief["scheduled_time"],
                      "android_channel": "azo-job-ring-v3", "tag": f"sub-{sub['id']}",
                      "image": brief["service_image"]},
                image=brief["service_image"] or None, data_only=True)
        except Exception:  # noqa: BLE001
            pass
    try:
        rt.emit_admin("job_new", brief)
    except Exception:  # noqa: BLE001
        pass
    return pids


async def partner_ring_pending(user):
    """Open subscription jobs this maid was offered and that are still unassigned —
    powers the Partner app ring-recovery poll so the ring keeps showing until someone
    accepts (or admin assigns)."""
    rows = await db.subscriptions.find(
        {"payment_status": "paid", "partner_id": None, "dispatch_status": "searching",
         "offered_partner_ids": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return [await _sub_brief(r) for r in rows]


async def accept_subscription(user, subscription_id):
    """Recurring subscription orders are ADMIN-ASSIGNED only — partners no longer
    self-accept them (no full-screen job ring is sent for subscriptions)."""
    raise HTTPException(
        status_code=403,
        detail="Subscription orders are assigned by the admin team, not self-accepted.")


async def _legacy_accept_subscription(user, subscription_id):
    """First-accept-wins: the first eligible maid to accept gets the whole subscription."""
    sub = await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if sub.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail="This subscription is not available")
    p = await db.users.find_one({"id": user["id"], "role": "partner"}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Partner not found")
    res = await db.subscriptions.update_one(
        {"id": subscription_id, "partner_id": None},
        {"$set": {"partner_id": user["id"], "partner_name": p.get("name"),
                  "partner_phone": p.get("phone"), "dispatch_status": "assigned", "updated_at": now_iso()},
         "$push": {"timeline": {"status": "partner_assigned", "at": now_iso(), "partner_id": user["id"]}}})
    if res.modified_count == 0:
        raise HTTPException(status_code=409, detail="This subscription was already taken by another maid")
    await svc.apply_accrual(subscription_id)
    # Tell everyone else the job is gone so their ring stops.
    for pid in (sub.get("offered_partner_ids") or []):
        if pid == user["id"]:
            continue
        try:
            rt.emit_user(pid, "job_taken", {"id": subscription_id})
            await push_dispatch.push_to_user(
                pid, "Subscription taken", "Another maid accepted this subscription.",
                data={"type": "job_taken", "booking_id": subscription_id, "subscription_id": subscription_id},
                data_only=True)
        except Exception:  # noqa: BLE001
            pass
    # Notify the customer their maid is assigned.
    try:
        rt.emit_user(sub["customer_id"], "subscription_update", {"id": subscription_id})
        await push_dispatch.push_to_user(
            sub["customer_id"], "Maid assigned",
            f"{p.get('name')} has been assigned to your {sub.get('service_name')} subscription {sub.get('code')}.",
            link="/account?tab=subscriptions",
            data={"type": "subscription_update", "subscription_id": subscription_id})
    except Exception:  # noqa: BLE001
        pass
    try:
        rt.emit_admin("subscription_update", {"id": subscription_id})
    except Exception:  # noqa: BLE001
        pass
    return await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})


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


async def partner_mark_arrival(user, subscription_id, day_date, lat, lng):
    """I Have Arrived — location-based attendance (no OTP). Verifies the maid is within
    200m of the customer's home, marks the day's attendance, and INSTANTLY credits that
    day's earning to her wallet + the daily leaderboard (silent; customer sees nothing
    about money). 'Complete' stays a separate step."""
    sub = await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if sub.get("partner_id") != user["id"]:
        raise HTTPException(status_code=403, detail="This subscription is not assigned to you")
    if sub.get("status") != "active":
        raise HTTPException(status_code=400, detail="Subscription is not active")
    today = datetime.now(timezone.utc).date().isoformat()
    if day_date != today:
        raise HTTPException(status_code=400, detail="You can only mark arrival for today")
    day = next((d for d in (sub.get("schedule") or []) if d.get("date") == day_date), None)
    if not day:
        raise HTTPException(status_code=404, detail="No scheduled day for today")
    if day.get("status") == "weekly_off":
        raise HTTPException(status_code=400, detail="Today is an agreed weekly off")
    if day.get("arrival_at") or day.get("status") in ("in_progress", "completed"):
        raise HTTPException(status_code=400, detail="Attendance already marked for today")
    # 5b: block arrival until GPS is available on BOTH sides.
    try:
        maid = (float(lat), float(lng))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Turn on location to mark your arrival")
    home = svc.address_latlng(sub.get("address"))
    if not home:
        raise HTTPException(status_code=400,
                            detail="Customer's home location isn't set yet, so arrival can't be verified.")
    dist = svc.haversine_m(maid, home)
    if dist > svc.ATTENDANCE_RADIUS_M:
        raise HTTPException(
            status_code=400,
            detail=f"You look about {int(dist)}m from the customer's home. Please reach within {svc.ATTENDANCE_RADIUS_M}m to mark arrival.")
    # Mark attendance (arrival) on the day; keep 'completed' as a separate action.
    schedule = sub.get("schedule") or []
    for d in schedule:
        if d.get("date") == day_date:
            d["status"] = "in_progress"
            d["arrival_at"] = now_iso()
            d["arrival_lat"] = maid[0]
            d["arrival_lng"] = maid[1]
            d["arrival_distance_m"] = round(dist, 1)
            d["marked_by"] = user["id"]
            d["marked_at"] = now_iso()
            d["earning"] = money.money(sub.get("per_day_earning") or 0)
            d["earning_credited"] = True
            break
    await db.subscriptions.update_one(
        {"id": subscription_id},
        {"$set": {"schedule": schedule, "updated_at": now_iso()},
         "$push": {"timeline": {"status": "arrival_marked", "at": now_iso(), "date": day_date}}})
    # Silent, instant, final earning credit + daily leaderboard.
    await svc.credit_daily_earning(sub, day_date, user["id"], sub.get("per_day_earning") or 0)
    await svc.apply_accrual(subscription_id)
    sub = await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
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
    if day.get("status") in ("paused", "cancelled"):
        raise HTTPException(status_code=400, detail=f"This day is {day.get('status')}")
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
         "service_pincodes": 1, "rating": 1, "kyc_status": 1}).to_list(500)
    # Maid notifications rule: a maid already booked in this time slot must NOT get a
    # new job alert / assignment for the same slot — hide her from the eligible list.
    busy = await svc.busy_partner_ids_for(sub)
    rows = [r for r in rows if r.get("id") not in busy]
    # SMART SUGGESTIONS: rank by best-fit = skill match + area (pincode/city) + rating,
    # so the admin sees the most suitable maids highlighted at the top.
    return await _rank_partners_for_sub(sub, rows)


async def _rank_partners_for_sub(sub, rows):
    """Smart suggestions: a maid is 'recommended' ONLY when she is registered for the
    subscription's category (skill) AND serves the customer's location city (same city
    or same pincode). Everyone else stays available as a fallback (via the dropdown)."""
    addr = sub.get("address") or {}
    sub_pin = str(addr.get("pincode") or "").strip()
    sub_city = (addr.get("city") or "").strip().lower()
    skill = (sub.get("required_skill") or "").lower()
    try:
        from services.partner_sync import skill_alias_map, skill_matches
        amap = await skill_alias_map()
    except Exception:  # noqa: BLE001
        amap, skill_matches = {}, None
    ranked = []
    for r in rows:
        score = 0.0
        reasons = []
        # Category / skill match
        has_skill = True
        if skill and skill_matches:
            has_skill = skill_matches(r.get("skills"), skill, amap)
        skill_ok = (not skill) or has_skill
        if has_skill and skill:
            score += 50
            reasons.append("Skill match")
        # Location city / pincode match
        pins = [str(p).strip() for p in (r.get("service_pincodes") or [])]
        pin_match = bool(sub_pin and sub_pin in pins)
        city_match = bool(sub_city and (r.get("city") or "").strip().lower() == sub_city)
        if pin_match:
            score += 30
            reasons.append("Same pincode")
        elif city_match:
            score += 15
            reasons.append("Same city")
        area_ok = (not sub_city and not sub_pin) or pin_match or city_match
        try:
            rating = float(r.get("rating") or 0)
        except (TypeError, ValueError):
            rating = 0.0
        score += min(rating, 5.0) / 5.0 * 20
        if rating:
            reasons.append(f"{rating:g}\u2605")
        r["fit_score"] = round(score, 1)
        r["fit_reasons"] = reasons
        r["skill_match"] = bool(has_skill and skill)
        r["skill_ok"] = bool(skill_ok)
        r["nearby"] = False
        # Suggested only when BOTH the category and the customer's city match.
        r["recommended"] = bool(skill_ok and area_ok)
        ranked.append(r)
    # NEARBY FALLBACK: if NO maid of this category serves the customer's exact city,
    # suggest same-category maids from nearby cities (same district > same state) and
    # tag them "Nearby" so the admin still gets relevant suggestions.
    if sub_city and not any(r["recommended"] for r in ranked):
        await _apply_nearby_fallback(ranked, addr)
    ranked.sort(key=lambda x: (x["recommended"], not x.get("nearby", False), x["fit_score"],
                               float(x.get("rating") or 0)), reverse=True)
    return ranked


async def _city_geo(name):
    """(state_lower, district_lower) for a place name. Tries geo_cities first, then
    geo_districts (partner/customer 'city' is often actually a district name)."""
    if not name:
        return ("", "")
    key = name.strip().lower()
    doc = await db.geo_cities.find_one({"name_lower": key}, {"_id": 0, "state": 1, "district": 1})
    if doc:
        return ((doc.get("state") or "").strip().lower(), (doc.get("district") or "").strip().lower())
    dist = await db.geo_districts.find_one({"name_lower": key}, {"_id": 0, "state": 1, "name": 1})
    if dist:
        return ((dist.get("state") or "").strip().lower(), (dist.get("name") or "").strip().lower())
    return ("", "")


async def _apply_nearby_fallback(ranked, addr):
    cust_state, cust_district = await _city_geo(addr.get("city"))
    if not cust_state:
        return
    # Resolve each category-eligible maid's city → state/district (cached per city).
    geo_cache = {}
    for r in ranked:
        if not r.get("skill_ok"):
            continue
        city = (r.get("city") or "").strip().lower()
        if not city:
            continue
        if city not in geo_cache:
            geo_cache[city] = await _city_geo(city)
        p_state, p_district = geo_cache[city]
        if cust_district and p_district == cust_district:
            r["nearby"] = True
            r["recommended"] = True
            r["fit_score"] = round(r["fit_score"] + 20, 1)
            r["fit_reasons"] = [f"Nearby · {r.get('city')}"] + r["fit_reasons"]
        elif p_state and p_state == cust_state:
            r["nearby"] = True
            r["recommended"] = True
            r["fit_score"] = round(r["fit_score"] + 10, 1)
            r["fit_reasons"] = [f"Nearby · {r.get('city')}"] + r["fit_reasons"]



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
                  "partner_phone": p.get("phone"), "dispatch_status": "assigned",
                  "assignment_status": "assigned", "assignment_confirmed_at": now_iso(),
                  "updated_at": now_iso()},
         "$push": {"timeline": {"status": "partner_assigned", "at": now_iso(), "partner_id": partner_id}}})
    await svc.apply_accrual(subscription_id)
    # Notify the assigned maid (in-app + push — NOT a full-screen job ring).
    try:
        rt.emit_user(partner_id, "subscription_update", {"id": subscription_id})
        await push_dispatch.push_to_user(
            partner_id, "New subscription assigned",
            f"You have been assigned {sub.get('service_name')} · "
            f"{sub.get('plan_label')} subscription {sub.get('code')}.",
            link=f"/partner/subscriptions?job={subscription_id}",
            data={"type": "subscription_update", "subscription_id": subscription_id})
    except Exception:  # noqa: BLE001
        pass
    # Notify the customer their maid is assigned.
    try:
        rt.emit_user(sub["customer_id"], "subscription_update", {"id": subscription_id})
        await push_dispatch.push_to_user(
            sub["customer_id"], "Maid assigned",
            f"{p.get('name')} has been assigned to your {sub.get('service_name')} subscription {sub.get('code')}.",
            link="/account?tab=subscriptions",
            data={"type": "subscription_update", "subscription_id": subscription_id})
    except Exception:  # noqa: BLE001
        pass
    try:
        rt.emit_admin("subscription_update", {"id": subscription_id})
    except Exception:  # noqa: BLE001
        pass
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
