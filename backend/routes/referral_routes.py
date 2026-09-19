from fastapi import APIRouter, Depends, Body
from middleware.auth import get_current_user
from services import referral_service as svc

router = APIRouter(prefix="/referral", tags=["referral"])


@router.get("/summary")
async def summary(user=Depends(get_current_user)):
    return await svc.get_summary(user)


@router.post("/apply")
async def apply(payload: dict = Body(...), user=Depends(get_current_user)):
    return await svc.apply_code(user, (payload or {}).get("code", ""))
