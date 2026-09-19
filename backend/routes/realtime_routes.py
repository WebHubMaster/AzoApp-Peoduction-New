"""Server-Sent Events (SSE) stream + real-time config endpoints.

EventSource cannot send Authorization headers, so /stream authenticates via a
?token= query param (same JWT used everywhere else).
"""
import asyncio
import json

from fastapi import APIRouter, Request, Query, Depends
from fastapi.responses import StreamingResponse

from middleware.auth import user_from_token, get_current_user, require_role
from services import realtime as rt

router = APIRouter(prefix="/realtime", tags=["realtime"])


@router.get("/config")
async def get_rt_config(user=Depends(get_current_user)):
    return await rt.get_config()


@router.put("/config")
async def put_rt_config(data: dict, admin=Depends(require_role("admin"))):
    return await rt.set_config(data)


@router.get("/stream")
async def stream(request: Request, token: str = Query(...)):
    user = await user_from_token(token)
    if not user:
        return StreamingResponse(
            iter(["event: error\ndata: unauthorized\n\n"]),
            media_type="text/event-stream", status_code=401)

    topics = [f"user:{user['id']}"]
    if user.get("role") == "admin":
        topics.append("admin")
    q = rt.broker.subscribe(topics)

    async def gen():
        yield f"event: ready\ndata: {json.dumps({'ok': True, 'topics': topics})}\n\n"
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=25)
                    yield f"data: {json.dumps(ev)}\n\n"
                except asyncio.TimeoutError:
                    # comment line keeps the connection alive through proxies
                    yield ": keepalive\n\n"
        finally:
            rt.broker.unsubscribe(topics, q)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    })
