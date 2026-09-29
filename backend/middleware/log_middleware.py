"""Raw-ASGI request logger. Assigns a Request-ID, times every /api request, and
records a structured log (INFO / WARNING slow|4xx / ERROR 5xx|exception) via the
async logbus. Raw ASGI so it never buffers streaming/file responses."""
import time

import jwt

from middleware.auth import SECRET, ALGO
from services import logbus

_SKIP_PREFIXES = ("/api/admin/logs", "/api/logs/stream")
_SKIP_EXACT = ("/api/health", "/api/", "/api/realtime/stream")


def _hget(headers, name: bytes):
    for k, v in headers:
        if k == name:
            return v.decode(errors="ignore")
    return ""


def _uid(headers) -> str:
    auth = _hget(headers, b"authorization")
    if not auth:
        return ""
    try:
        data = jwt.decode(auth.replace("Bearer ", "").strip(), SECRET, algorithms=[ALGO])
        return data.get("uid") or ""
    except Exception:
        return ""


class LogMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        path = scope.get("path", "")
        if not path.startswith("/api/") or path in _SKIP_EXACT or any(path.startswith(p) for p in _SKIP_PREFIXES):
            await self.app(scope, receive, send)
            return

        headers = scope.get("headers") or []
        rid = _hget(headers, b"x-request-id") or logbus.new_request_id()
        client_app = _hget(headers, b"x-client-app")
        user_id = _uid(headers)
        rid_b = rid.encode()

        scope = dict(scope)
        scope["headers"] = list(headers) + [(b"x-request-id", rid_b)]

        start = time.perf_counter()
        status = {"code": 200}

        async def send_wrapper(message):
            if message.get("type") == "http.response.start":
                status["code"] = message.get("status", 200)
                message = dict(message)
                message["headers"] = list(message.get("headers") or []) + [(b"x-request-id", rid_b)]
            await send(message)

        exc = None
        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as e:  # noqa: BLE001
            exc = e
            raise
        finally:
            try:
                dur = (time.perf_counter() - start) * 1000.0
                logbus.log_request(scope.get("method", "GET"), path, status["code"], round(dur, 1),
                                   request_id=rid, user_id=user_id, client_app=client_app, exc=exc)
            except Exception:  # noqa: BLE001
                pass
