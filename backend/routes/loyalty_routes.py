"""Loyalty points — customer balance + admin config/overview."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from services import loyalty_service as l
from middleware.auth import require_role

router = APIRouter(prefix="/loyalty", tags=["loyalty"])
admin_router = APIRouter(prefix="/admin/loyalty", tags=["admin-loyalty"])
CUSTOMER = require_role("customer")
ADMIN = require_role("admin")


class LoyaltyConfig(BaseModel):
    enabled: Optional[bool] = None
    earn_rate: Optional[float] = None
    redeem_value: Optional[float] = None
    min_redeem_points: Optional[int] = None
    max_redeem_pct: Optional[float] = None
    welcome_bonus: Optional[int] = None


@router.get("/me")
async def my_loyalty(user=Depends(CUSTOMER)):
    return await l.me(user)


@router.get("/config")
async def public_config():
    cfg = await l.get_config()
    # expose only what the checkout UI needs
    return {"enabled": cfg["enabled"], "redeem_value": cfg["redeem_value"],
            "min_redeem_points": cfg["min_redeem_points"], "max_redeem_pct": cfg["max_redeem_pct"],
            "earn_rate": cfg["earn_rate"]}


@admin_router.get("/overview")
async def overview(admin=Depends(ADMIN)):
    return await l.admin_overview()


@admin_router.get("/transactions")
async def loyalty_transactions(q: str = "", type: str = "", date_from: str = "",
                               date_to: str = "", page: int = 1, page_size: int = 25,
                               admin=Depends(ADMIN)):
    return await l.admin_transactions(q=q, type=type, date_from=date_from,
                                      date_to=date_to, page=page, page_size=page_size)


@admin_router.get("/members")
async def loyalty_members(q: str = "", page: int = 1, page_size: int = 25, admin=Depends(ADMIN)):
    return await l.admin_members(q=q, page=page, page_size=page_size)


@admin_router.put("/config")
async def set_config(data: LoyaltyConfig, admin=Depends(ADMIN)):
    return await l.update_config(data.model_dump(exclude_unset=True))
