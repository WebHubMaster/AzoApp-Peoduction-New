from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from services import starter_kit_service as sk
from services.gateway_resolver import GatewayConfigError
from middleware.auth import require_role

router = APIRouter(prefix="/starter-kit", tags=["starter-kit"])
PARTNER = require_role("partner")
ADMIN = require_role("admin")


class VerifyReq(BaseModel):
    order_id: str
    payment_id: str
    signature: str


class ConfirmReq(BaseModel):
    order_id: str
    gw: Optional[str] = None


# ---------------- PARTNER ----------------
@router.get("/me")
async def my_status(user=Depends(PARTNER)):
    return await sk.partner_status(user)


@router.post("/order")
async def order(user=Depends(PARTNER)):
    try:
        return await sk.purchase_order(user)
    except GatewayConfigError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/verify")
async def verify(req: VerifyReq, user=Depends(PARTNER)):
    return await sk.purchase_verify(user, req.order_id, req.payment_id, req.signature)


@router.post("/confirm")
async def confirm(req: ConfirmReq, user=Depends(PARTNER)):
    """Hosted-checkout (Cashfree/Juspay/Easebuzz) confirm for the Starter Kit."""
    return await sk.purchase_confirm(user, req.order_id, req.gw)


# ---------------- ADMIN ----------------
@router.get("/admin/config")
async def admin_config(admin=Depends(ADMIN)):
    return await sk.get_config()


@router.put("/admin/config")
async def admin_update(data: dict, admin=Depends(ADMIN)):
    return await sk.update_config(data)


@router.get("/admin/purchases")
async def admin_purchases(
    q: str = "",
    status: str = "all",
    method: str = "all",
    date_from: str = "",
    date_to: str = "",
    page: int = 1,
    page_size: int = 10,
    sort: str = "newest",
    admin=Depends(ADMIN),
):
    return await sk.admin_purchases(
        q=q, status=status, method=method,
        date_from=date_from, date_to=date_to,
        page=page, page_size=page_size, sort=sort,
    )


class TrackReq(BaseModel):
    status: str


@router.post("/admin/purchases/{purchase_id}/tracking")
async def admin_tracking(purchase_id: str, req: TrackReq, admin=Depends(ADMIN)):
    return await sk.update_tracking(purchase_id, req.status)
