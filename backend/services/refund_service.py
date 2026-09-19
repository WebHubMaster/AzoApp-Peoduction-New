"""Cancellation refund tracking.

A single `refunds` collection stores rich, auditable records for both the Admin and
Customer panels. When the booking was paid via a real Razorpay payment AND the gateway
is active, the refund is issued through the Razorpay Refunds API and its status is later
finalised by the refund webhook. Otherwise (dev/mock money path) the customer wallet is
credited immediately and the record is marked successful.

Status machine (internal):  initiated → pending → processing → processed | failed
"""
from config.database import db, now_iso
from models.user import new_id
from services import payment_service


# Razorpay status/event → internal status
_STATUS_MAP = {
    "created": "initiated",
    "pending": "pending",
    "processing": "processing",
    "processed": "processed",
    "failed": "failed",
}


def map_refund_status(status: str) -> str:
    return _STATUS_MAP.get((status or "").lower(), "processing")


async def _set_status(refund_id: str, status: str, note: str = "", extra: dict = None):
    """Monotonic-ish status update with a timeline entry. Never downgrades a terminal state."""
    doc = await db.refunds.find_one({"id": refund_id}, {"_id": 0})
    if not doc:
        return None
    if doc.get("status") in ("processed", "failed") and status not in ("processed", "failed"):
        return doc  # don't regress a finalised refund
    upd = {"status": status, "updated_at": now_iso()}
    if status in ("processed", "failed") and not doc.get("completed_at"):
        upd["completed_at"] = now_iso()
    if extra:
        upd.update(extra)
    await db.refunds.update_one(
        {"id": refund_id},
        {"$set": upd,
         "$push": {"status_history": {"status": status, "at": now_iso(), "note": note}}})
    # Notify the customer as the refund progresses (Processing & Successful) — in-app + SMS + push + email.
    if status in ("processing", "processed") and doc.get("customer_id") and doc.get("status") != status:
        try:
            from services import notification_service
            amt = doc.get("refund_amount", doc.get("amount", 0))
            code = doc.get("booking_code")
            if status == "processing":
                title, body = "Refund is processing", f"Your ₹{amt} refund for {code} is being processed."
            else:
                title, body = "Refund successful", f"₹{amt} for {code} has been refunded successfully."
            await notification_service.notify(doc["customer_id"], title, body,
                                              link="/account", data={"refund_id": refund_id, "status": status})
        except Exception:  # noqa: BLE001
            pass
    return await db.refunds.find_one({"id": refund_id}, {"_id": 0})


async def initiate_refund(booking: dict, refund_amount: float, reason: str, breakdown: dict) -> dict:
    """Create a refund record for a cancelled booking and start processing it.

    breakdown = {refund_pct, partner_cancellation_pct, partner_cancellation_amount,
                 platform_commission, service_cost, tax_amount}
    """
    pricing = booking.get("pricing", {}) or {}
    now = now_iso()
    # Reverse any claimed cashback tied to this booking (business-rule reversal).
    try:
        from services import growth_service as _growth
        await _growth.on_booking_reversed(booking)
    except Exception:
        pass
    rec = {
        "id": new_id(),
        "booking_id": booking["id"], "booking_code": booking.get("code"),
        "customer_id": booking.get("customer_id"), "customer_name": booking.get("customer_name"),
        "customer_phone": booking.get("customer_phone"),
        "partner_id": booking.get("partner_id"), "partner_name": booking.get("partner_name"),
        "service_name": booking.get("service_name"),
        "original_amount": round(float(pricing.get("total", 0)), 2),
        "service_cost": round(float(breakdown.get("service_cost", pricing.get("commissionable_base", 0))), 2),
        "tax_amount": round(float(breakdown.get("tax_amount", pricing.get("gst", 0))), 2),
        "cancellation_reason": reason or "",
        "cancelled_at": now,
        "refund_pct": breakdown.get("refund_pct"),
        "amount": round(float(refund_amount), 2),            # refund amount (kept as 'amount' for legacy admin view)
        "refund_amount": round(float(refund_amount), 2),
        "partner_cancellation_pct": breakdown.get("partner_cancellation_pct"),
        "partner_cancellation_amount": round(float(breakdown.get("partner_cancellation_amount", 0)), 2),
        "platform_commission": round(float(breakdown.get("platform_commission", 0)), 2),
        "razorpay_payment_id": booking.get("razorpay_payment_id"),
        "razorpay_order_id": booking.get("razorpay_order_id"),
        "razorpay_refund_id": None,
        # Immutable gateway+mode snapshot copied from the ORIGINAL transaction so the
        # refund is always issued in the SAME environment the payment was made in.
        "pay_gateway": booking.get("pay_gateway"),
        "pay_mode": booking.get("pay_mode"),
        "pay_env": booking.get("pay_env"),
        "method": "wallet",
        "status": "initiated",
        "status_history": [{"status": "initiated", "at": now, "note": "Refund created on cancellation"}],
        "webhook_response": None,
        "initiated_at": now, "completed_at": None,
        "created_at": now, "updated_at": now,
    }
    await db.refunds.insert_one(dict(rec))
    rec.pop("_id", None)

    # Decide path based on HOW the customer paid — refund goes back to the SAME method.
    # CRITICAL: a gateway refund is issued in the ORIGINAL transaction's gateway+mode
    # (from the immutable snapshot), never the currently-active selection.
    pay_id = booking.get("razorpay_payment_id") or booking.get("pay_order_id")
    pay_method = (booking.get("payment_method") or "").lower()
    paid_by_wallet = pay_method == "wallet"
    orig_gw = booking.get("pay_gateway")
    orig_mode = booking.get("pay_mode") or "test"
    gateway_on = False
    if orig_gw and not booking.get("pay_mock"):
        try:
            from services import gateway_resolver as gr
            from config.database import get_settings
            integ = (await get_settings()).get("integrations", {}) or {}
            gateway_on = gr.mode_configured(integ, "payin", orig_gw, orig_mode)
        except Exception:  # noqa: BLE001
            gateway_on = False

    if refund_amount <= 0:
        await _set_status(rec["id"], "processed", "Zero refund amount")
        return await db.refunds.find_one({"id": rec["id"]}, {"_id": 0})

    if paid_by_wallet:
        # Paid from wallet → refund straight back to wallet.
        await _mock_refund(rec["id"], booking)
    elif gateway_on and pay_id:
        # Paid online → real refund back to the source, in the ORIGINAL gateway+mode.
        try:
            rp = await payment_service.create_refund(
                pay_id, refund_amount, receipt=booking.get("code"),
                gateway=orig_gw, mode=orig_mode)
            if rp:
                await _set_status(
                    rec["id"], map_refund_status(rp.get("status")),
                    f"{str(orig_gw).capitalize()} {str(orig_mode).upper()} refund {rp.get('id')} created — back to original payment method",
                    extra={"method": orig_gw, "razorpay_refund_id": rp.get("id"),
                           "razorpay_status": rp.get("status")})
            else:
                await _source_refund(rec["id"], booking)
        except Exception as e:  # noqa: BLE001
            await _set_status(rec["id"], "failed", f"{str(orig_gw).capitalize()} refund error: {e}")
    else:
        # Paid online but no live gateway (dev/mock): record refund to source method
        # (do NOT credit wallet — refund must return to the original method).
        await _source_refund(rec["id"], booking)

    return await db.refunds.find_one({"id": rec["id"]}, {"_id": 0})


async def _source_refund(refund_id: str, booking: dict):
    """Online-paid refund that goes back to the original source (UPI/card/bank) rather
    than the wallet. Records the refund transaction without touching wallet_balance."""
    rec = await db.refunds.find_one({"id": refund_id}, {"_id": 0})
    amt = float(rec.get("refund_amount", 0))
    src = "bank/UPI"
    await _set_status(refund_id, "processing", f"Refunding to original payment method ({src})",
                      extra={"method": "source"})
    if amt > 0 and booking.get("customer_id"):
        await db.transactions.insert_one({
            "id": new_id(), "user_id": booking["customer_id"], "amount": amt, "type": "credit",
            "kind": "refund", "note": f"Refund for {booking.get('code')} → original payment method",
            "created_at": now_iso()})
    await _set_status(refund_id, "processed",
                      "Refund sent to original payment method — reflects in 5–7 business days")


async def _mock_refund(refund_id: str, booking: dict):
    """Dev/mock path — credit the customer wallet immediately and mark successful."""
    rec = await db.refunds.find_one({"id": refund_id}, {"_id": 0})
    amt = float(rec.get("refund_amount", 0))
    await _set_status(refund_id, "processing", "Processing wallet refund", extra={"method": "wallet"})
    if amt > 0 and booking.get("customer_id"):
        await db.users.update_one({"id": booking["customer_id"]}, {"$inc": {"wallet_balance": amt}})
        await db.wallet_transactions.insert_one({
            "id": new_id(), "user_id": booking["customer_id"], "type": "credit", "amount": amt,
            "reason": f"Refund for cancelled booking {booking.get('code')}",
            "ref_id": booking["id"], "created_at": now_iso()})
        await db.transactions.insert_one({
            "id": new_id(), "user_id": booking["customer_id"], "amount": amt, "type": "credit",
            "kind": "refund", "note": f"Refund for {booking.get('code')}", "created_at": now_iso()})
    await _set_status(refund_id, "processed", "Refund credited to wallet")


async def handle_webhook(event: dict) -> dict:
    """Apply a verified Razorpay refund webhook to our refund record."""
    entity = (event.get("payload", {}) or {}).get("refund", {}).get("entity", {}) or {}
    refund_id = entity.get("id")
    if not refund_id:
        return {"ok": False, "reason": "no refund id"}
    status = entity.get("status") or (event.get("event", "").split(".")[-1])
    rec = await db.refunds.find_one({"razorpay_refund_id": refund_id}, {"_id": 0})
    if not rec:
        return {"ok": False, "reason": "unknown refund"}
    await _set_status(rec["id"], map_refund_status(status),
                      f"Webhook {event.get('event')}",
                      extra={"razorpay_status": status, "webhook_response": event})
    return {"ok": True}


async def list_for_customer(customer_id: str) -> list:
    rows = await db.refunds.find({"customer_id": customer_id}, {"_id": 0}) \
        .sort("created_at", -1).to_list(500)
    # Customer refund view = refund amount/status only (spec #28). Internal
    # commission/partner-reversal fields are NEVER exposed to the customer.
    hide = ("platform_commission", "partner_cancellation_pct", "partner_cancellation_amount",
            "partner_id", "partner_name", "service_cost", "commissionable_base",
            "partner_snapshot", "merchant_snapshot", "pay_gateway", "pay_mode", "pay_env",
            "razorpay_refund_id", "razorpay_payment_id", "razorpay_order_id")
    return [{k: v for k, v in r.items() if k not in hide} for r in rows]


async def list_all() -> list:
    rows = await db.refunds.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return rows


_TIMELINE_LABELS = {
    "initiated": "Refund initiated",
    "pending": "Refund pending at gateway",
    "processing": "Refund processing",
    "processed": "Refund completed",
    "failed": "Refund failed",
}


def _normalize_timeline(rec: dict) -> list:
    """Prefer an explicit `timeline` (seed data), else derive a rich timeline from
    the internal `status_history` so the advanced detail view always has a journey."""
    tl = rec.get("timeline")
    if tl:
        return tl
    out = []
    for h in (rec.get("status_history") or []):
        st = (h.get("status") or "").lower()
        out.append({
            "at": h.get("at"),
            "label": h.get("note") or _TIMELINE_LABELS.get(st, st.replace("_", " ").title()),
            "fail": st == "failed",
        })
    return out


async def get_detail(refund_id: str) -> dict | None:
    """Rich, 360° refund record for the advanced admin detail view — mirrors the
    Transactions detail (normalized journey timeline + attached live booking)."""
    r = await db.refunds.find_one({"id": refund_id}, {"_id": 0})
    if not r:
        return None
    r["timeline"] = _normalize_timeline(r)
    b = None
    if r.get("booking_id"):
        b = await db.bookings.find_one({"id": r["booking_id"]}, {"_id": 0})
    if not b and r.get("booking_code"):
        b = await db.bookings.find_one({"code": r["booking_code"]}, {"_id": 0})
    if b:
        r["booking"] = {
            "id": b.get("id"), "code": b.get("code"), "status": b.get("status"),
            "scheduled_at": b.get("scheduled_at"), "address": b.get("address"),
            "category": b.get("category"), "service_name": b.get("service_name"),
        }
        if not r.get("category"):
            r["category"] = b.get("category")
    return r
