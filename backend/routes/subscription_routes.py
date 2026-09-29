from fastapi import APIRouter, Depends
from controllers import subscription_controller as c
from models.subscription import (SubscriptionCreate, SubscriptionPayVerify,
                                  AssignPartnerRequest, DayMarkRequest,
                                  SettlementActionRequest, StartDayRequest, CompleteDayRequest)
from middleware.auth import require_role

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])
CUSTOMER = require_role("customer")
PARTNER = require_role("partner")
ADMIN = require_role("admin")
ANY = require_role("customer", "partner", "admin")


# ---------------- CUSTOMER ----------------
@router.get("/plans/{service_id}")
async def get_plans(service_id: str, user=Depends(CUSTOMER)):
    return await c.get_plans(service_id)


@router.post("")
async def create_subscription(req: SubscriptionCreate, user=Depends(CUSTOMER)):
    return await c.create_subscription(user, req)


@router.get("/mine")
async def list_mine(user=Depends(CUSTOMER)):
    return await c.list_mine(user)


@router.post("/{subscription_id}/pay/order")
async def pay_order(subscription_id: str, user=Depends(CUSTOMER)):
    return await c.pay_order(user, subscription_id)


@router.post("/{subscription_id}/pay/verify")
async def pay_verify(subscription_id: str, data: SubscriptionPayVerify, user=Depends(CUSTOMER)):
    return await c.pay_verify(user, subscription_id, data)


@router.post("/{subscription_id}/pay/confirm")
async def pay_confirm(subscription_id: str, data: dict = None, user=Depends(CUSTOMER)):
    data = data or {}
    return await c.pay_confirm(user, subscription_id, data.get("order_id"), data.get("gw"))


@router.get("/{subscription_id}/invoice")
async def get_invoice(subscription_id: str, user=Depends(ANY)):
    return await c.get_invoice(user, subscription_id)


# ---------------- PARTNER (maid) ----------------
@router.get("/partner/mine")
async def partner_list(user=Depends(PARTNER)):
    return await c.partner_list(user)


@router.post("/{subscription_id}/days/{day_date}/start")
async def partner_start_day(subscription_id: str, day_date: str, req: StartDayRequest, user=Depends(PARTNER)):
    return await c.partner_start_day(user, subscription_id, day_date, req.otp)


@router.post("/{subscription_id}/days/{day_date}/complete")
async def partner_complete_day(subscription_id: str, day_date: str, req: CompleteDayRequest = None, user=Depends(PARTNER)):
    return await c.partner_mark_completed(user, subscription_id, day_date,
                                          note=(req.note if req else ""), photo=(req.photo if req else None))


# ---------------- ADMIN ----------------
@router.get("/admin/stats")
async def admin_stats(user=Depends(ADMIN)):
    return await c.admin_stats()


@router.get("/admin/all")
async def admin_list(status: str = None, q: str = None, user=Depends(ADMIN)):
    return await c.admin_list(status, q)


@router.get("/admin/{subscription_id}/partners")
async def admin_eligible_partners(subscription_id: str, user=Depends(ADMIN)):
    return await c.admin_eligible_partners(subscription_id)


@router.post("/admin/{subscription_id}/assign")
async def admin_assign(subscription_id: str, req: AssignPartnerRequest, user=Depends(ADMIN)):
    return await c.admin_assign_partner(subscription_id, req.partner_id)


@router.post("/admin/{subscription_id}/days/{day_date}")
async def admin_mark_day(subscription_id: str, day_date: str, req: DayMarkRequest, user=Depends(ADMIN)):
    return await c.admin_mark_day(subscription_id, day_date, req)


@router.post("/admin/{subscription_id}/finalize")
async def admin_finalize(subscription_id: str, user=Depends(ADMIN)):
    return await c.admin_finalize(subscription_id)


@router.post("/admin/{subscription_id}/settlement")
async def admin_settlement(subscription_id: str, req: SettlementActionRequest, user=Depends(ADMIN)):
    return await c.admin_settlement_action(subscription_id, req)


# ---------------- SHARED (any authorised party) ----------------
@router.get("/{subscription_id}")
async def get_one(subscription_id: str, user=Depends(ANY)):
    return await c.get_one(user, subscription_id)
