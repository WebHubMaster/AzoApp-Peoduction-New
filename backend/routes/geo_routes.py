from fastapi import APIRouter
from services import geo_service
from services import geo_data_service as geo

router = APIRouter(prefix="/geo", tags=["geo"])


@router.get("/reverse")
async def reverse(lat: float, lng: float):
    return await geo_service.reverse_geocode(lat, lng)


@router.get("/geocode")
async def geocode(q: str = ""):
    """Forward geocode a free-text location (city/pincode/area) → coordinates."""
    return await geo_service.forward_geocode(q)


@router.get("/serviceability")
async def serviceability(pincode: str):
    return await geo_service.check_serviceable(pincode)


# Location reference cascade (public — used by admin/merchant partner wizard)
@router.get("/states")
async def states(q: str = ""):
    return await geo.list_states(q)


@router.get("/districts")
async def districts(state: str, q: str = ""):
    return await geo.list_districts(state, q)


@router.get("/cities")
async def cities(state: str, district: str, q: str = ""):
    return await geo.list_cities(state, district, q)


@router.get("/villages")
async def villages(state: str, district: str, city: str, q: str = ""):
    return await geo.list_villages(state, district, city, q)
