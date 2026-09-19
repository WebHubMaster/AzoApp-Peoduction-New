"""Push-notification device registration + public web config."""
from fastapi import APIRouter, Depends, HTTPException
from middleware.auth import get_current_user
from services import fcm_service, webpush_service
from config.database import get_settings

router = APIRouter(prefix="/notifications", tags=["notifications-push"])


@router.get("/push-config")
async def push_config():
    s = await get_settings()
    integ = s.get("integrations", {}) or {}
    fcm_row = await fcm_service.config_status()
    return {
        "enabled": bool(integ.get("fcm_enabled")) and fcm_row.get("configured", False),
        "web_config": integ.get("fcm_web_config", {}),
        "vapid_key": integ.get("fcm_vapid_key", ""),
    }


@router.post("/devices")
async def register_device(body: dict, user=Depends(get_current_user)):
    b = body or {}
    token = b.get("token", "")
    if not token:
        raise HTTPException(status_code=400, detail="token is required")
    return await fcm_service.register_device(
        user["id"], token, b.get("user_agent", ""),
        device_id=b.get("device_id", ""), platform=b.get("platform", ""),
        browser=b.get("browser", ""), permission_status=b.get("permission", "granted"))


@router.post("/push-status")
async def push_status(body: dict, user=Depends(get_current_user)):
    """The browser reports the outcome of its push-registration attempt so the
    admin Diagnostics can show exactly WHY a partner's device is not registered."""
    return await fcm_service.record_push_status(user["id"], body or {})


@router.get("/my-devices")
async def my_devices(user=Depends(get_current_user)):
    rows = await fcm_service.list_devices(user["id"])
    subs = await webpush_service.list_subs(user["id"])
    # Count BOTH channels so a browser registered via standard Web Push (VAPID)
    # is treated as a registered device (no false "device not registered" warning).
    return {"count": len(rows) + len(subs), "devices": rows,
            "webpush": subs, "webpush_count": len(subs)}


# ---------- Standard VAPID Web Push (works without Firebase/Google Cloud) ----------
@router.get("/webpush/public-key")
async def webpush_public_key():
    key = await webpush_service.public_key()
    return {"public_key": key, "enabled": bool(key)}


@router.post("/webpush/subscribe")
async def webpush_subscribe(body: dict, user=Depends(get_current_user)):
    b = body or {}
    sub = b.get("subscription") or b.get("sub") or {}
    if not sub or not sub.get("endpoint"):
        raise HTTPException(status_code=400, detail="subscription is required")
    res = await webpush_service.subscribe(
        user["id"], sub, device_id=b.get("device_id", ""),
        user_agent=b.get("user_agent", ""), platform=b.get("platform", ""),
        browser=b.get("browser", ""))
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "invalid subscription"))
    return res
