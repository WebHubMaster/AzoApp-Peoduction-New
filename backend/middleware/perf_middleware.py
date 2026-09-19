"""Pure-ASGI latency middleware.

Measures wall-clock duration of every HTTP request and records it against the
matched route template (e.g. ``/api/portal/fees/{id}``). Implemented as raw ASGI
(not BaseHTTPMiddleware) so it never buffers response bodies \u2014 safe for file
downloads / streaming responses.
"""
import time

from services import perf_service


class PerfMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        start = time.perf_counter()
        status = {"code": 200}

        async def send_wrapper(message):
            if message.get("type") == "http.response.start":
                status["code"] = message.get("status", 200)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            try:
                dur_ms = (time.perf_counter() - start) * 1000.0
                route = scope.get("route")
                path = getattr(route, "path", None) or scope.get("path", "")
                method = scope.get("method", "GET")
                perf_service.record(method, path, dur_ms, status["code"])
            except Exception:  # noqa: BLE001
                pass
