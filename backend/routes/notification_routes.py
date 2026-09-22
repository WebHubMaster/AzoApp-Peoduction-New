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


@router.post("/ring-status")
async def ring_status(body: dict, user=Depends(get_current_user)):
    """The APP reports whether the call-style Job Ring actually rendered on THIS
    device (foreground vs background) and the exact failure reason if not — so we
    can see on the SERVER why a locked/closed-phone ring did or didn't fire (FGS
    rejected, full-screen-intent not granted, etc.) instead of guessing. Also stamps
    the reporting device with last_ring_at for the admin per-device ring log."""
    return await fcm_service.record_ring_status(user["id"], body or {})


@router.get("/my-devices")
async def my_devices(user=Depends(get_current_user)):
    from config.database import db
    rows = await fcm_service.list_devices(user["id"])
    subs = await webpush_service.list_subs(user["id"])
    me = await db.users.find_one({"id": user["id"]}, {"ring_state": 1, "_id": 0})
    # Count BOTH channels so a browser registered via standard Web Push (VAPID)
    # is treated as a registered device (no false "device not registered" warning).
    return {"count": len(rows) + len(subs), "devices": rows,
            "webpush": subs, "webpush_count": len(subs),
            "ring_state": (me or {}).get("ring_state")}


@router.post("/test-self")
async def test_self(body: dict, user=Depends(get_current_user)):
    """Send a REAL push to the caller's own devices so a partner can verify on the
    phone that (a) FCM is configured on the backend, (b) this device's token is
    registered, and (c) the ring / notification actually fires in the current app
    state. kind='ring' triggers the call-style Job Ring; anything else a normal push.
    Optional `delay` (seconds, 0-20): schedules the push after a short delay so the
    partner can LOCK the phone / switch apps and self-verify the true lock-screen ring."""
    import time as _t
    import asyncio
    from services import push_dispatch, realtime as rt
    b = body or {}
    kind = b.get("kind", "ring")
    try:
        delay = int(b.get("delay") or 0)
    except (TypeError, ValueError):
        delay = 0
    delay = max(0, min(delay, 20))

    async def _send():
        stamp = int(_t.time())
        if kind == "ring":
            data = {"type": "job_request", "booking_id": f"test-{stamp}",
                    "service_name": "Test Service", "city": "Your City",
                    "address_line": "Test address", "total": "499", "partner_amount": "399",
                    "android_channel": "azo-job-ring-v3", "tag": f"test-{stamp}"}
            # PRIMARY, FCM-independent path: a live SSE event → the background job
            # listener (locked/closed app) or the in-app overlay renders the
            # full-screen ring even when the device has NO registered push token.
            rt.emit_user(user["id"], "job_request", data)
            # SECONDARY: also fire a real push (delivers too if a token IS registered).
            res = await push_dispatch.push_to_user(
                user["id"], "New job request", "Test job ring — tap to open",
                link="/(partner)", data=data, data_only=True)
            return {**res, "sse": True}
        rt.emit_user(user["id"], "notification", {"type": "test", "title": "AzoApp test notification"})
        return await push_dispatch.push_to_user(
            user["id"], "AzoApp test notification", "Push notifications are working correctly.",
            link="/notifications", data={"type": "test"})

    if delay > 0:
        async def _delayed():
            try:
                await asyncio.sleep(delay)
                await _send()
            except Exception:  # noqa: BLE001
                pass
        asyncio.create_task(_delayed())
        return {"ok": True, "scheduled": True, "delay": delay,
                "message": f"Lock your phone or switch apps now — the test ring will fire in {delay}s."}

    res = await _send()
    # For the ring test the live SSE event always reaches a backgrounded/open app,
    # so success is not gated on a registered FCM token anymore.
    ok = True if kind == "ring" else bool(res.get("success"))
    return {"ok": ok, "result": res,
            "message": ("Sent — check your phone." if ok else
                        f"No device received it ({res.get('skipped') or 'failed'}). Make sure you opened the app on this phone after logging in and allowed notifications.")}


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
