from fastapi import APIRouter, Depends
from middleware.auth import require_role
from services import category_commission_service as svc

router = APIRouter(prefix="/admin/category-commissions", tags=["category-commissions"])
ADMIN = require_role("admin")


@router.get("")
async def list_rates(admin=Depends(ADMIN)):
    return await svc.list_all()


@router.post("/bulk")
async def bulk(data: dict, admin=Depends(ADMIN)):
    return await svc.bulk_apply(data.get("category_ids") or [], data.get("rates") or {}, admin)


@router.put("/{category_id}")
async def upsert(category_id: str, data: dict, admin=Depends(ADMIN)):
    return await svc.upsert(category_id, data, admin)
