from fastapi import APIRouter, Depends
from controllers import finance_controller as c
from middleware.auth import get_current_user, require_role

router = APIRouter(prefix="/wallet", tags=["wallet"])


@router.get("")
async def wallet(user=Depends(get_current_user)):
    return await c.wallet(user)


@router.get("/partner/earnings")
async def partner_earnings(user=Depends(require_role("partner"))):
    return await c.partner_earnings(user)
