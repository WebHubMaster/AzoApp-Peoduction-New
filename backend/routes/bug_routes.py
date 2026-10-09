"""Report-a-Bug routes: reporter (customer/partner/merchant) + admin inbox."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from middleware.auth import require_role
from controllers import bug_controller as c

router = APIRouter(tags=["bugs"])
ANY_USER = require_role("customer", "partner", "merchant")
ADMIN = require_role("admin")


class BugCreate(BaseModel):
    title: str
    description: str
    category: str | None = None
    screenshot_url: str | None = None


class BugResolve(BaseModel):
    note: str = ""


# ---------- reporter (customer / partner) ----------
@router.post("/bugs")
async def create_bug(data: BugCreate, user=Depends(ANY_USER)):
    return await c.create_bug(user, data.model_dump())


@router.get("/bugs/my")
async def my_bugs(user=Depends(ANY_USER)):
    return await c.my_bugs(user)


@router.delete("/bugs/{bug_id}")
async def delete_bug(bug_id: str, user=Depends(ANY_USER)):
    return await c.delete_bug(user, bug_id)


# ---------- admin inbox ----------
@router.get("/admin/bugs")
async def admin_list(status: str = "", role: str = "", q: str = "", category: str = "",
                     page: int = 1, page_size: int = 20, admin=Depends(ADMIN)):
    return await c.admin_list(status, role, q, category, page, page_size)


@router.post("/admin/bugs/{bug_id}/resolve")
async def admin_resolve(bug_id: str, data: BugResolve, admin=Depends(ADMIN)):
    return await c.admin_resolve(admin, bug_id, data.note)


@router.post("/admin/bugs/{bug_id}/reopen")
async def admin_reopen(bug_id: str, admin=Depends(ADMIN)):
    return await c.admin_reopen(admin, bug_id)
