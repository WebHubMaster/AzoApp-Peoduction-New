from fastapi import HTTPException
from config.database import db, now_iso
from services import payment_service
from services.gateway_resolver import GatewayConfigError
from models.user import new_id


async def _booking_for_pay(user, booking_id):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    if b["customer_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your booking")
    if b.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Already paid")
    # Point 13: payment is collected UPFRONT, right after booking is created.
    if b["status"] not in ("pending_payment", "completed"):
        raise HTTPException(status_code=400, detail="This booking is not awaiting payment")
    return b


async def _group_for_pay(user, group_id):
    """All bookings created together in one checkout (order group). Returns
    (all_rows, unpaid_rows). Raises only when the group doesn't exist."""
    if not group_id:
        raise HTTPException(status_code=400, detail="Missing order group id")
    rows = await db.bookings.find(
        {"customer_id": user["id"], "order_group_id": group_id}, {"_id": 0}).to_list(50)
    if not rows:
        raise HTTPException(status_code=404, detail="No bookings found for this order")
    unpaid = [b for b in rows if b.get("payment_status") != "paid"]
    return rows, unpaid


async def create_order(user, purpose, booking_id=None, amount=None, group_id=None):
    group_unpaid = []
    if purpose == "booking_group":
        # ONE combined payment for every (same-checkout) booking — any category mix.
        rows, group_unpaid = await _group_for_pay(user, group_id)
        if not group_unpaid:
            raise HTTPException(status_code=400, detail="This order is already paid")
        for b in group_unpaid:
            if b["status"] not in ("pending_payment", "completed"):
                raise HTTPException(status_code=400, detail="This order is not awaiting payment")
        amt = round(sum(float((b.get("pricing") or {}).get("total") or 0) for b in group_unpaid), 2)
        receipt = ("GRP-" + (rows[0].get("code") or str(group_id)))[:40]
    elif purpose == "booking":
        b = await _booking_for_pay(user, booking_id)
        amt, receipt = float(b["pricing"]["total"]), b["code"]
    else:
        amt = float(amount or 0)
        if amt <= 0:
            raise HTTPException(status_code=400, detail="Invalid amount")
        receipt = "WALLET-" + user["id"][:8]
    try:
        order = await payment_service.create_order(amt, receipt, customer={
            "id": user.get("id"), "name": user.get("name"),
            "email": user.get("email"), "phone": user.get("phone")})
    except GatewayConfigError as e:
        # Active gateway is enabled but its active mode is not fully configured.
        # NO fallback, NO mock — surface a clear config error.
        raise HTTPException(status_code=409, detail=str(e))
    if not order:
        return {"mock": True, "amount": amt, "purpose": purpose}
    # Immutable transaction snapshot: which gateway + mode processed this payment.
    snap = {"pay_order_id": order.get("order_id"), "pay_gateway": order.get("gateway"),
            "pay_mode": order.get("mode"), "pay_env": order.get("env")}
    # Link this gateway order to the booking so a hosted-checkout RETURN can find &
    # confirm it (redirect gateways like Cashfree/Juspay come back via /payment/return).
    if purpose == "booking" and order.get("order_id"):
        await db.bookings.update_one({"id": booking_id}, {"$set": snap})
    if purpose == "booking_group" and order.get("order_id"):
        ids = [b["id"] for b in group_unpaid]
        await db.bookings.update_many({"id": {"$in": ids}}, {"$set": snap})
        return {"mock": False, "purpose": purpose, "booking_ids": ids, "count": len(ids), **order}
    return {"mock": False, "purpose": purpose, **order}


async def confirm_return(user, gw_name, order_id):
    """Called by the frontend /payment/return page after a hosted-checkout redirect
    (Cashfree/Juspay/Easebuzz). Verifies the gateway order status and, if paid,
    confirms the booking (marks paid + starts searching for a partner)."""
    if not order_id:
        raise HTTPException(status_code=400, detail="Missing order id")
    # Starter Kit purchases use a "KIT-..." receipt — confirm & activate Pro instead.
    if str(order_id).startswith("KIT-"):
        from services import starter_kit_service as sk
        return await sk.purchase_confirm_return(user, order_id, gw_name)
    b = await db.bookings.find_one({"pay_order_id": order_id, "customer_id": user["id"]}, {"_id": 0})
    if not b:
        # Fallback: Cashfree order_id is "<CODE>-<hex8>" — match by booking code.
        code = order_id.rsplit("-", 1)[0]
        b = await db.bookings.find_one({"code": code, "customer_id": user["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found for this payment")
    # Combined (multi-category) order — confirm EVERY booking of the group at once.
    if b.get("order_group_id"):
        rows, unpaid = await _group_for_pay(user, b["order_group_id"])
        if not unpaid:
            return {"ok": True, "paid": True, "kind": "booking_group",
                    "count": len(rows), "already": True}
        paid = await payment_service.check_order_paid(
            order_id, b.get("pay_gateway") or gw_name, b.get("pay_mode"))
        if paid:
            await _apply(user, "booking_group", None, None, order_id=order_id,
                         group_id=b["order_group_id"])
            return {"ok": True, "paid": True, "kind": "booking_group", "count": len(rows)}
        return {"ok": True, "paid": False, "kind": "booking_group", "count": len(rows)}
    if b.get("payment_status") == "paid":
        return {"ok": True, "paid": True, "booking_id": b["id"], "code": b["code"], "already": True}
    paid = await payment_service.check_order_paid(
        order_id, b.get("pay_gateway") or gw_name, b.get("pay_mode"))
    if paid:
        await _apply(user, "booking", b["id"], None, order_id=order_id)
        return {"ok": True, "paid": True, "booking_id": b["id"], "code": b["code"]}
    return {"ok": True, "paid": False, "booking_id": b["id"], "code": b["code"]}


async def _apply(user, purpose, booking_id, amount, payment_id=None, order_id=None, group_id=None):
    if purpose == "booking_group":
        rows, unpaid = await _group_for_pay(user, group_id)
        if not unpaid:
            return {"ok": True, "already": True, "count": len(rows)}
        from controllers import booking_controller
        pay_set = {}
        if payment_id:
            pay_set["razorpay_payment_id"] = payment_id
        if order_id:
            pay_set["razorpay_order_id"] = order_id
        paid_ids = []
        for b in unpaid:
            if pay_set:
                await db.bookings.update_one({"id": b["id"]}, {"$set": pay_set})
            if b["status"] == "pending_payment":
                # upfront payment → confirm booking & start searching each category's partners
                await booking_controller.mark_paid_and_search(b["id"])
            else:
                await db.bookings.update_one(
                    {"id": b["id"]},
                    {"$set": {"status": "paid", "payment_status": "paid", "updated_at": now_iso()},
                     "$push": {"timeline": {"status": "paid", "at": now_iso()}}})
            paid_ids.append(b["id"])
        return {"ok": True, "booking_ids": paid_ids, "count": len(paid_ids)}
    if purpose == "booking":
        b = await _booking_for_pay(user, booking_id)
        from controllers import booking_controller
        # capture the real Razorpay payment identifiers so refunds can target them
        pay_set = {}
        if payment_id:
            pay_set["razorpay_payment_id"] = payment_id
        if order_id:
            pay_set["razorpay_order_id"] = order_id
        if pay_set:
            await db.bookings.update_one({"id": booking_id}, {"$set": pay_set})
        if b["status"] == "pending_payment":
            # upfront payment → confirm booking and start searching for a partner
            await booking_controller.mark_paid_and_search(booking_id)
        else:
            # legacy post-completion settlement path
            await db.bookings.update_one(
                {"id": booking_id},
                {"$set": {"status": "paid", "payment_status": "paid", "updated_at": now_iso()},
                 "$push": {"timeline": {"status": "paid", "at": now_iso()}}})
        return {"ok": True, "booking_id": booking_id}
    amt = float(amount or 0)
    if amt <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")
    await db.users.update_one({"id": user["id"]}, {"$inc": {"wallet_balance": amt}})
    await db.transactions.insert_one({
        "id": new_id(), "user_id": user["id"], "amount": amt, "type": "credit",
        "kind": "topup", "note": "Wallet top-up", "created_at": now_iso()})
    return {"ok": True, "amount": amt}


async def verify(user, data):
    ok = await payment_service.verify_signature(data.order_id, data.payment_id, data.signature)
    if not ok:
        raise HTTPException(status_code=400, detail="Payment verification failed")
    return await _apply(user, data.purpose, data.booking_id, data.amount,
                        payment_id=data.payment_id, order_id=data.order_id,
                        group_id=data.group_id)


async def mock_pay(user, purpose, booking_id=None, amount=None, group_id=None):
    # Allowed only when the active gateway is not configured (dev fallback). No
    # side-effecting probe.
    if await payment_service.is_configured():
        raise HTTPException(status_code=400, detail="Live payments enabled — use the payment gateway")
    # Snapshot the (disabled) active gateway + mode so mock transactions carry the
    # same immutable gateway/mode metadata as real ones.
    st = await payment_service.payin_state()
    snap = {"pay_gateway": st.get("gateway"), "pay_mode": st.get("mode"),
            "pay_env": st.get("env"), "pay_mock": True}
    if purpose == "booking" and booking_id:
        await db.bookings.update_one({"id": booking_id}, {"$set": snap})
    elif purpose == "booking_group" and group_id:
        await db.bookings.update_many(
            {"customer_id": user["id"], "order_group_id": group_id}, {"$set": snap})
    return await _apply(user, purpose, booking_id, amount, group_id=group_id)
