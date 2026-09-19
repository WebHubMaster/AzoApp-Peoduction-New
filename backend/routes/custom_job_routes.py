from fastapi import APIRouter, Depends

from middleware.auth import get_current_user, require_role
from models.custom_job import CustomJobCreate, CustomJobStatusUpdate, MIN_BUDGET, MAX_BUDGET
from services import custom_job_service as svc

router = APIRouter(prefix="/custom-jobs", tags=["custom-jobs"])
ADMIN = require_role("admin")


# ---------------- customer ----------------
@router.get("/meta")
async def meta():
    """Public-ish limits for the wizard (min/max budget). Categories come from
    the existing /catalog/categories endpoint so they stay 100% dynamic."""
    return {"min_budget": MIN_BUDGET, "max_budget": MAX_BUDGET}


@router.post("")
async def submit(data: CustomJobCreate, user=Depends(get_current_user)):
    return await svc.submit(user, data.dict())


@router.get("/mine")
async def mine(user=Depends(get_current_user)):
    return await svc.list_mine(user)


# ---------------- admin ----------------
@router.get("")
async def admin_list(status: str = "", category_id: str = "", date_from: str = "",
                     date_to: str = "", pincode: str = "", q: str = "", admin=Depends(ADMIN)):
    return await svc.admin_list(status, category_id, date_from, date_to, pincode, q)


@router.get("/{job_id}")
async def admin_get(job_id: str, admin=Depends(ADMIN)):
    return await svc.admin_get(job_id, admin)


@router.patch("/{job_id}/status")
async def admin_set_status(job_id: str, data: CustomJobStatusUpdate, admin=Depends(ADMIN)):
    return await svc.admin_set_status(job_id, data.status, admin, data.note)


@router.post("/{job_id}/convert")
async def admin_convert(job_id: str, admin=Depends(ADMIN)):
    return await svc.convert_to_service(job_id, admin)
