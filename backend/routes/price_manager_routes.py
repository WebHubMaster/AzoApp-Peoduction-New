"""Admin: Price Manager — city-wise prices, categories, fees and rate cards."""
from fastapi import APIRouter, Body, Depends
from middleware.auth import require_role
from services import city_pricing_service as svc

router = APIRouter(prefix="/admin/price-manager", tags=["price-manager"])
ADMIN = require_role("admin")


@router.get("/cities")
async def cities(admin=Depends(ADMIN)):
    return await svc.list_cities()


@router.get("/city/{city}")
async def get_city(city: str, admin=Depends(ADMIN)):
    return await svc.admin_city(city)


@router.put("/city/{city}")
async def save_city(city: str, data: dict = Body(...), admin=Depends(ADMIN)):
    return await svc.save_city(city, data, admin)


@router.post("/copy")
async def copy_city(data: dict = Body(...), admin=Depends(ADMIN)):
    return await svc.copy_city(data.get("from"), data.get("to"), data.get("adjust_pct") or 0,
                               admin, data.get("include"))
