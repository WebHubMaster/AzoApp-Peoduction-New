from fastapi import APIRouter, Depends
from controllers import finance_controller as c
from middleware.auth import get_current_user, require_role

router = APIRouter(prefix="/wallet", tags=["wallet"])


@router.get("")
async def wallet(user=Depends(get_current_user)):
    return await c.wallet(user)


@router.get("/transactions")
async def wallet_transactions(type: str = "all", search: str = "", date_from: str = "", date_to: str = "",
                              page: int = 1, page_size: int = 10, user=Depends(get_current_user)):
    return await c.wallet_transactions_paged(user, type, search, date_from, date_to, page, page_size)


@router.get("/partner/earnings")
async def partner_earnings(page: int = 0, page_size: int = 0, user=Depends(require_role("partner"))):
    return await c.partner_earnings(user, page, page_size)
