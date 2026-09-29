"""Structured, async, low-overhead application log bus.

Design goals (production-safe):
- The request path NEVER blocks on logging: record() just enqueues in-memory.
- A single background task batches inserts (~1 insert_many/sec, up to 200 docs) so we
  never do a DB write per request.
- Live SSE fan-out to connected admins via the existing realtime broker ("logs" topic).
- TTL index auto-rotates old logs (default 7 days) → bounded storage, zero cron.
- Sensitive keys (password/otp/token/card/...) are redacted before storage.
"""
import asyncio
import re
import traceback
import uuid
from datetime import datetime, timezone

from config.database import db
from services import realtime as rt

RETENTION_DAYS = 7
SLOW_MS = 2000
LEVELS = ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")
_SENSITIVE = re.compile(r"(password|passwd|otp|pin|cvv|card|token|secret|authorization|api[_-]?key)", re.I)

_buffer: "asyncio.Queue" = asyncio.Queue(maxsize=8000)
_started = False

_SERVICE_MAP = {
    "auth": "auth", "bookings": "booking", "booking": "booking", "subscriptions": "subscription",
    "payments": "payment", "payment": "payment", "notifications": "notification",
    "uploads": "file_upload", "media": "file_upload", "app-mgmt": "app_mgmt",
    "custom-jobs": "booking", "partners": "api", "admin": "api", "logs": "logs",
}


def new_request_id() -> str:
    return "REQ-" + uuid.uuid4().hex[:8].upper()


def _redact(obj):
    if isinstance(obj, dict):
        return {k: ("***" if _SENSITIVE.search(str(k)) else _redact(v)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_redact(x) for x in obj[:50]]
    if isinstance(obj, str) and len(obj) > 2000:
        return obj[:2000] + "…"
    return obj


def service_from_path(path: str) -> str:
    parts = [p for p in (path or "").split("/") if p]
    if len(parts) >= 2 and parts[0] == "api":
        return _SERVICE_MAP.get(parts[1], "api")
    return "api"


def record(**ev):
    """Non-blocking. Normalise → live SSE → enqueue for batched DB write."""
    now = datetime.now(timezone.utc)
    doc = {
        "id": ev.get("id") or uuid.uuid4().hex,
        "ts": now,
        "level": (ev.get("level") or "INFO").upper(),
        "app": ev.get("app") or "backend",
        "environment": ev.get("environment") or "production",
        "service": ev.get("service") or "api",
        "endpoint": ev.get("endpoint") or "",
        "method": ev.get("method") or "",
        "status": ev.get("status"),
        "duration_ms": ev.get("duration_ms"),
        "request_id": ev.get("request_id") or "",
        "user_id": ev.get("user_id") or "",
        "message": (ev.get("message") or "")[:4000],
        "file": ev.get("file") or "",
        "line": ev.get("line"),
        "process": ev.get("process") or "backend",
        "stack": (ev.get("stack") or "")[:8000],
        "meta": _redact(ev.get("meta") or {}),
    }
    if doc["level"] not in LEVELS:
        doc["level"] = "INFO"
    try:
        live = {**doc, "ts": now.isoformat()}
        rt.broker.publish("logs", {"type": "log", "data": live})
    except Exception:
        pass
    try:
        _buffer.put_nowait(doc)
    except asyncio.QueueFull:
        pass  # extreme load → drop rather than block the request


def log_request(method, path, status, duration_ms, request_id="", user_id="", client_app="", exc=None):
    status = int(status or 0)
    level = "INFO"
    message = f"{method} {path} → {status}"
    file_ = ""
    line = None
    stack = ""
    if exc is not None:
        level = "ERROR"
        tb = traceback.extract_tb(exc.__traceback__)
        if tb:
            last = tb[-1]
            file_, line = last.filename, last.lineno
        stack = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        message = f"{type(exc).__name__}: {exc}"
    elif status >= 500:
        level = "ERROR"
        message = f"{method} {path} failed → {status}"
    elif status >= 400:
        level = "WARNING"
    elif duration_ms and duration_ms >= SLOW_MS:
        level = "WARNING"
        message = f"Slow request {method} {path} ({int(duration_ms)}ms)"
    record(level=level, app=(client_app or "backend"), service=service_from_path(path),
           endpoint=path, method=method, status=status, duration_ms=duration_ms,
           request_id=request_id, user_id=user_id, message=message, file=file_, line=line, stack=stack)


def log_client(payload: dict, user_id: str = "") -> dict:
    """Ingest a crash/error reported by the Customer/Partner mobile app."""
    p = payload or {}
    app = str(p.get("app") or "customer").lower()
    app = app if app in ("customer", "partner") else "customer"
    meta = {
        "app_version": p.get("app_version"), "version_code": p.get("version_code"),
        "device": p.get("device"), "os_version": p.get("os_version"), "screen": p.get("screen"),
        "error_type": p.get("error_type"), "extra": p.get("meta"),
    }
    record(level=(p.get("level") or "ERROR").upper(), app=app, service="mobile",
           endpoint=p.get("endpoint") or "", method=p.get("method") or "",
           status=p.get("status"), request_id=p.get("request_id") or "",
           user_id=user_id or p.get("user_id") or "", message=p.get("message") or "App error",
           file=p.get("screen") or "", stack=p.get("stack") or "", process=f"{app}-app", meta=meta)
    return {"ok": True}


async def _ensure_indexes():
    try:
        await db.app_logs.create_index("ts", expireAfterSeconds=RETENTION_DAYS * 86400)
        await db.app_logs.create_index([("ts", -1)])
        await db.app_logs.create_index([("level", 1), ("app", 1), ("ts", -1)])
    except Exception:
        pass


async def _flusher():
    await _ensure_indexes()
    while True:
        batch = [await _buffer.get()]
        for _ in range(200):
            try:
                batch.append(_buffer.get_nowait())
            except asyncio.QueueEmpty:
                break
        try:
            await db.app_logs.insert_many(batch, ordered=False)
        except Exception:
            pass
        await asyncio.sleep(1)  # batching window: at most ~1 bulk insert / second


def start():
    global _started
    if _started:
        return
    _started = True
    try:
        asyncio.create_task(_flusher())
    except RuntimeError:
        _started = False
