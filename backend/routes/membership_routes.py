"""Membership plans (public + customer purchase) and admin management."""
from fastapi import APIRouter, Depends, HTTPException
from services import membership_service as m
from services.gateway_resolver import GatewayConfigError
from models.membership import (
    MembershipPlanCreate, MembershipPlanUpdate,
    MembershipOrderRequest, MembershipVerifyRequest, MembershipConfirmRequest,
)
from middleware.auth import require_role, get_current_user

router = APIRouter(prefix="/memberships", tags=["memberships"])
admin_router = APIRouter(prefix="/admin/memberships", tags=["admin-memberships"])
CUSTOMER = require_role("customer")
ADMIN = require_role("admin")


# ---------------- Public / customer ----------------
@router.get("/plans")
async def public_plans():
    return await m.list_plans(active_only=True)


@router.get("/plans/{slug}")
async def public_plan(slug: str):
    return await m.get_plan_by_slug(slug)


@router.get("/me")
async def my_membership(user=Depends(CUSTOMER)):
    return await m.my_membership(user)


@router.post("/order")
async def create_order(req: MembershipOrderRequest, user=Depends(CUSTOMER)):
    try:
        return await m.purchase_order(user, req.plan_id)
    except GatewayConfigError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/verify")
async def verify(req: MembershipVerifyRequest, user=Depends(CUSTOMER)):
    return await m.purchase_verify(user, req.plan_id, req.order_id, req.payment_id, req.signature)


@router.post("/confirm")
async def confirm(req: MembershipConfirmRequest, user=Depends(CUSTOMER)):
    """Hosted-checkout (Cashfree/Juspay/Easebuzz) confirm — verify order status + activate."""
    return await m.purchase_confirm(user, req.plan_id, req.order_id, req.gw)


# ---------------- Admin ----------------
@admin_router.get("/plans")
async def admin_plans(admin=Depends(ADMIN)):
    return await m.list_plans(active_only=False)


@admin_router.post("/plans")
async def admin_create(data: MembershipPlanCreate, admin=Depends(ADMIN)):
    return await m.create_plan(data.model_dump())


@admin_router.put("/plans/{plan_id}")
async def admin_update(plan_id: str, data: MembershipPlanUpdate, admin=Depends(ADMIN)):
    return await m.update_plan(plan_id, data.model_dump(exclude_unset=True))


@admin_router.delete("/plans/{plan_id}")
async def admin_delete(plan_id: str, admin=Depends(ADMIN)):
    return await m.delete_plan(plan_id)


@admin_router.get("/subscribers")
async def admin_subscribers(admin=Depends(ADMIN)):
    return await m.admin_subscribers()


@admin_router.get("/analytics")
async def admin_analytics(admin=Depends(ADMIN)):
    return await m.admin_analytics()
