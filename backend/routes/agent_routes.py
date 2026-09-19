"""Field-agent self-service routes (Physical QR): profile/wallet, earnings history,
bank KYC and withdrawals. All gated to the 'agent' role."""
from fastapi import APIRouter, Depends, HTTPException

from middleware.auth import get_current_user
from services import agent_service as svc

router = APIRouter(prefix="/agent", tags=["agent"])


async def require_agent(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "agent" or not user.get("is_qr_agent"):
        raise HTTPException(status_code=403, detail="Agents only")
    if not user.get("agent_active", True):
        raise HTTPException(status_code=403, detail="Your agent account is disabled")
    return user


@router.get("/me")
async def me(user=Depends(require_agent)):
    return await svc.agent_me(user)


@router.get("/earnings")
async def earnings(user=Depends(require_agent)):
    return await svc.list_earnings(user["id"])


@router.post("/bank")
async def submit_bank(data: dict, user=Depends(require_agent)):
    return await svc.submit_bank(user, data)


@router.get("/withdrawals")
async def withdrawals(user=Depends(require_agent)):
    return await svc.list_withdrawals(user["id"])


@router.post("/withdraw")
async def withdraw(data: dict, user=Depends(require_agent)):
    return await svc.request_withdraw(user, data.get("amount"), data.get("method", "bank"))
