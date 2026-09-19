"""Super-admin Performance & Cache/Redis endpoints.

- GET  /api/superadmin/perf              live latency table (slowest first)
- POST /api/superadmin/perf/reset        clear the collected stats
- POST /api/superadmin/perf/diagnostics  backend->Mongo + backend->Redis ping
- GET  /api/superadmin/redis             current cache config (secrets masked)
- POST /api/superadmin/redis/test        test provider credentials
- POST /api/superadmin/redis             save & enable / disable
"""
from fastapi import APIRouter, Depends, Body, HTTPException

from middleware.auth import require_role
from services import perf_service
from services import cache_service as cs

router = APIRouter(prefix="/superadmin", tags=["superadmin"])
ADMIN = require_role("admin")


@router.get("/perf")
async def perf(admin=Depends(ADMIN)):
    return perf_service.snapshot()


@router.post("/perf/reset")
async def perf_reset(admin=Depends(ADMIN)):
    perf_service.reset()
    return {"ok": True}


@router.post("/perf/diagnostics")
async def perf_diagnostics(admin=Depends(ADMIN)):
    return await cs.diagnostics()


@router.get("/redis")
async def redis_config(admin=Depends(ADMIN)):
    return await cs.public_config()


@router.post("/redis/test")
async def redis_test(body: dict = Body(default={}), admin=Depends(ADMIN)):
    return await cs.test_connection(
        body.get("provider"), body.get("url"), body.get("token"))


@router.post("/redis")
async def redis_save(body: dict = Body(...), admin=Depends(ADMIN)):
    provider = body.get("provider") or "upstash"
    url = body.get("url") or ""
    token = body.get("token") or ""
    enabled = bool(body.get("enabled"))
    ping = {"ok": True}
    if enabled:
        ping = await cs.test_connection(provider, url, token)
        if not ping.get("ok"):
            raise HTTPException(
                status_code=400,
                detail=f"Connection failed: {ping.get('error', 'unreachable')}")
    await cs.save_config(provider, url, token, enabled)
    await cs.apply_saved_config()
    cfg = await cs.public_config()
    return {"ok": True, "ping": ping, "config": cfg}
