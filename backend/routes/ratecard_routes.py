from fastapi import APIRouter, Depends
from controllers import ratecard_controller as rc
from models.ratecard import RateCardCreate
from middleware.auth import require_role

router = APIRouter(prefix="/ratecards", tags=["ratecards"])
ADMIN = require_role("admin")


# ---------- PUBLIC ----------
@router.get("/by-category/{slug_or_id}")
async def by_category(slug_or_id: str):
    return await rc.public_by_category(slug_or_id)


@router.get("/by-service/{service_id}")
async def by_service(service_id: str):
    return await rc.public_by_service(service_id)


@router.get("/search")
async def search(q: str = ""):
    return await rc.search_rows(q)


# ---------- ADMIN ----------
@router.get("/admin")
async def admin_list(admin=Depends(ADMIN)):
    return await rc.admin_list()


@router.get("/admin/{card_id}")
async def admin_get(card_id: str, admin=Depends(ADMIN)):
    return await rc.admin_get(card_id)


@router.post("")
async def create(data: RateCardCreate, admin=Depends(ADMIN)):
    return await rc.create(data.model_dump())


@router.put("/{card_id}")
async def update(card_id: str, data: dict, admin=Depends(ADMIN)):
    return await rc.update(card_id, data)


@router.delete("/{card_id}")
async def delete(card_id: str, admin=Depends(ADMIN)):
    return await rc.delete(card_id)
