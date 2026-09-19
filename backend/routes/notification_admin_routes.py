"""Advanced admin notification broadcast routes."""
from fastapi import APIRouter, Depends

from middleware.auth import require_role
from controllers import notification_admin_controller as c

router = APIRouter(prefix="/admin/notifications", tags=["admin-notifications"])
ADMIN = require_role("admin")


@router.get("/audience")
async def audience(send_to: str = "all", q: str = "", admin=Depends(ADMIN)):
    return await c.audience(send_to, q)


@router.get("/campaigns")
async def campaigns(admin=Depends(ADMIN)):
    return await c.list_campaigns()


@router.post("/send")
async def send(data: dict, admin=Depends(ADMIN)):
    return await c.send_campaign(admin, data)


@router.get("/health")
async def health(admin=Depends(ADMIN)):
    return await c.notification_health()


@router.post("/test-push")
async def test_push(data: dict, admin=Depends(ADMIN)):
    return await c.test_push(admin, data)


@router.get("/delivery-logs")
async def delivery_logs(user_id: str = "", limit: int = 50, admin=Depends(ADMIN)):
    return await c.delivery_logs(user_id, limit)
