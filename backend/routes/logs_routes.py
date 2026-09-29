"""Admin Live Logs & Monitoring API + mobile crash ingestion."""
import asyncio
import csv
import io
import json
import shutil
import subprocess
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import StreamingResponse

from config.database import db
from middleware.auth import require_role, get_current_user_optional, user_from_token
from services import logbus
from services import realtime as rt

router = APIRouter(tags=["logs"])
ADMIN = require_role("admin")

_RANGE_SECONDS = {"5m": 300, "15m": 900, "1h": 3600, "24h": 86400, "7d": 604800}


def _since(rng: str):
    secs = _RANGE_SECONDS.get(rng or "1h", 3600)
    return datetime.now(timezone.utc) - timedelta(seconds=secs)


def _mask(uid: str) -> str:
    if not uid:
        return ""
    return ("****" + uid[-4:]) if len(uid) > 4 else "****"


def _clean(doc: dict) -> dict:
    ts = doc.get("ts")
    doc["ts"] = ts.isoformat() if isinstance(ts, datetime) else ts
    doc["user_id"] = _mask(doc.get("user_id") or "")
    doc.pop("_id", None)
    return doc


def _query(app, level, service, status, q, rng):
    f = {}
    if rng and rng != "live":
        f["ts"] = {"$gte": _since(rng)}
    if app and app != "all":
        f["app"] = app
    if level and level != "all":
        f["level"] = level.upper()
    if service and service != "all":
        f["service"] = service
    if status == "error":
        f["level"] = {"$in": ["ERROR", "CRITICAL"]}
    elif status == "success":
        f["status"] = {"$lt": 400}
    elif status == "slow":
        f["duration_ms"] = {"$gte": logbus.SLOW_MS}
    if q:
        rx = {"$regex": q, "$options": "i"}
        f["$or"] = [{"message": rx}, {"endpoint": rx}, {"file": rx}, {"request_id": rx},
                    {"process": rx}, {"service": rx}]
    return f


# --------------------------------------------------- mobile crash/error ingest
@router.post("/logs/client")
async def ingest_client(payload: dict, user=Depends(get_current_user_optional)):
    return logbus.log_client(payload, user_id=(user or {}).get("id", ""))


# --------------------------------------------------- admin: list / search
@router.get("/admin/logs")
async def list_logs(user=Depends(ADMIN), app: str = "all", level: str = "all",
                    service: str = "all", status: str = "all", q: str = "",
                    rng: str = "1h", limit: int = 200, before: str = ""):
    f = _query(app, level, service, status, q, rng)
    if before:
        try:
            f.setdefault("ts", {})["$lt"] = datetime.fromisoformat(before)
        except ValueError:
            pass
    limit = max(1, min(int(limit or 200), 500))
    rows = await db.app_logs.find(f).sort("ts", -1).limit(limit).to_list(limit)
    return {"logs": [_clean(r) for r in rows], "count": len(rows)}


@router.get("/admin/logs/summary")
async def summary(user=Depends(ADMIN), rng: str = "24h"):
    since = _since(rng)
    base = {"ts": {"$gte": since}}
    total = await db.app_logs.count_documents(base)
    by_level = {}
    async for r in db.app_logs.aggregate([{"$match": base}, {"$group": {"_id": "$level", "n": {"$sum": 1}}}]):
        by_level[r["_id"]] = r["n"]
    err_match = {**base, "level": {"$in": ["ERROR", "CRITICAL"]}}
    by_app = {}
    async for r in db.app_logs.aggregate([{"$match": err_match}, {"$group": {"_id": "$app", "n": {"$sum": 1}}}]):
        by_app[r["_id"] or "backend"] = r["n"]
    return {
        "range": rng, "total": total,
        "levels": {lv: by_level.get(lv, 0) for lv in logbus.LEVELS},
        "errors_by_app": by_app,
    }


# --------------------------------------------------- admin: server + process health
@router.get("/admin/logs/health")
async def health(user=Depends(ADMIN)):
    cpu = ram = disk = None
    try:
        import psutil
        cpu = psutil.cpu_percent(interval=0.2)
        ram = psutil.virtual_memory().percent
        disk = psutil.disk_usage("/").percent
    except Exception:
        pass
    processes = _supervisor_processes()
    db_ok = True
    try:
        await db.command("ping")
    except Exception:
        db_ok = False
    return {
        "cpu": cpu, "ram": ram, "disk": disk,
        "services": {"database": db_ok, "api": True,
                     "queue": any(p["name"] == "webhook-crond" and p["status"] == "RUNNING" for p in processes)},
        "processes": processes,
    }


def _supervisor_processes():
    out = []
    exe = shutil.which("supervisorctl")
    if not exe:
        return out
    try:
        raw = subprocess.run([exe, "status"], capture_output=True, text=True, timeout=5).stdout
    except Exception:
        return out
    for line in raw.splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        name, st = parts[0], parts[1]
        info = {"name": name, "status": st, "pid": None, "uptime": "", "cpu": None, "memory": None}
        rest = " ".join(parts[2:])
        if "pid" in rest:
            try:
                info["pid"] = int(rest.split("pid")[1].split(",")[0].strip())
            except Exception:
                pass
        if "uptime" in rest:
            info["uptime"] = rest.split("uptime")[1].strip()
        _enrich_proc(info)
        out.append(info)
    return out


def _enrich_proc(info):
    if not info.get("pid"):
        return
    try:
        import psutil
        p = psutil.Process(info["pid"])
        info["cpu"] = round(p.cpu_percent(interval=0.0), 1)
        info["memory"] = round(p.memory_info().rss / 1024 / 1024, 1)
    except Exception:
        pass


# --------------------------------------------------- admin: export
@router.get("/admin/logs/export")
async def export(user=Depends(ADMIN), fmt: str = "json", app: str = "all", level: str = "all",
                 service: str = "all", status: str = "all", q: str = "", rng: str = "24h", limit: int = 5000):
    f = _query(app, level, service, status, q, rng)
    limit = max(1, min(int(limit or 5000), 20000))
    rows = [_clean(r) for r in await db.app_logs.find(f).sort("ts", -1).limit(limit).to_list(limit)]
    fmt = (fmt or "json").lower()
    fname = f"logs-{datetime.now().strftime('%Y%m%d-%H%M')}.{fmt}"
    hdr = {"Content-Disposition": f'attachment; filename="{fname}"'}
    if fmt == "json":
        return Response(json.dumps(rows, indent=2, default=str), media_type="application/json", headers=hdr)
    if fmt == "csv":
        buf = io.StringIO()
        cols = ["ts", "level", "app", "service", "method", "endpoint", "status", "duration_ms",
                "request_id", "user_id", "message", "file", "line", "process"]
        w = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)
        return Response(buf.getvalue(), media_type="text/csv", headers=hdr)
    lines = [f"{r.get('ts')} [{r.get('level')}] ({r.get('app')}/{r.get('service')}) "
             f"{r.get('method')} {r.get('endpoint')} {r.get('status') or ''} — {r.get('message')}"
             for r in rows]
    return Response("\n".join(lines), media_type="text/plain", headers=hdr)


# --------------------------------------------------- admin: clear stored logs
@router.delete("/admin/logs")
async def clear_logs(user=Depends(ADMIN)):
    r = await db.app_logs.delete_many({})
    logbus.record(level="WARNING", app="backend", service="logs",
                  message=f"Admin cleared {r.deleted_count} stored logs", user_id=user.get("id", ""))
    return {"ok": True, "deleted": r.deleted_count}


# --------------------------------------------------- admin: live SSE stream
@router.get("/admin/logs/stream")
async def stream(request: Request, token: str = Query(...), app: str = "all", level: str = "all"):
    u = await user_from_token(token)
    if not u or u.get("role") != "admin":
        return StreamingResponse(iter(["event: error\ndata: unauthorized\n\n"]),
                                 media_type="text/event-stream", status_code=401)
    q = rt.broker.subscribe(["logs"])

    async def gen():
        yield f"event: ready\ndata: {json.dumps({'ok': True})}\n\n"
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=25)
                    d = (ev or {}).get("data", {})
                    if app != "all" and d.get("app") != app:
                        continue
                    if level != "all" and d.get("level") != level.upper():
                        continue
                    d = {**d, "user_id": _mask(d.get("user_id") or "")}
                    yield f"data: {json.dumps(d, default=str)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            rt.broker.unsubscribe(["logs"], q)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"})


# --------------------------------------------------- admin: single log detail
@router.get("/admin/logs/{log_id}")
async def detail(log_id: str, user=Depends(ADMIN)):
    doc = await db.app_logs.find_one({"id": log_id})
    if not doc:
        return {"error": "not found"}
    return _clean(doc)
