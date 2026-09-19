"""In-process API latency tracking.

A lightweight ASGI middleware records the duration of every ``/api`` request,
keyed by (HTTP method, route template). The Performance admin page reads a
snapshot sorted slowest-first so latency regressions float to the top.

Pure in-memory + thread-safe; zero external dependencies. Survives for the life
of the process and can be reset from the admin UI.
"""
import time
from collections import deque
from threading import Lock

# Requests at/above this take part in the "slow requests" counter (ms).
SLOW_THRESHOLD_MS = 700
# Rolling window of recent samples per route used to compute p95.
_MAX_SAMPLES = 300

_lock = Lock()
_stats = {}          # "METHOD /path" -> aggregate dict
_started_at = time.time()


def _key(method: str, path: str) -> str:
    return f"{method} {path}"


def record(method: str, path: str, dur_ms: float, status: int = 200) -> None:
    """Record one request. Only /api paths are tracked (skip static/frontend)."""
    if not path or not path.startswith("/api"):
        return
    k = _key(method, path)
    with _lock:
        s = _stats.get(k)
        if s is None:
            s = {
                "method": method, "path": path, "count": 0, "total": 0.0,
                "max": 0.0, "slow": 0, "errors": 0, "last_ms": 0.0,
                "last_ts": 0.0, "samples": deque(maxlen=_MAX_SAMPLES),
            }
            _stats[k] = s
        s["count"] += 1
        s["total"] += dur_ms
        s["last_ms"] = dur_ms
        s["last_ts"] = time.time()
        if dur_ms > s["max"]:
            s["max"] = dur_ms
        if dur_ms >= SLOW_THRESHOLD_MS:
            s["slow"] += 1
        if status >= 500:
            s["errors"] += 1
        s["samples"].append(dur_ms)


def _p95(samples) -> float:
    if not samples:
        return 0.0
    arr = sorted(samples)
    idx = int(round(0.95 * (len(arr) - 1)))
    return arr[idx]


def snapshot() -> dict:
    """Return a JSON-safe snapshot of all tracked routes, slowest avg first."""
    with _lock:
        rows = []
        total_slow = 0
        total_reqs = 0
        slowest_avg = 0.0
        for s in _stats.values():
            avg = (s["total"] / s["count"]) if s["count"] else 0.0
            total_slow += s["slow"]
            total_reqs += s["count"]
            if avg > slowest_avg:
                slowest_avg = avg
            rows.append({
                "method": s["method"], "path": s["path"], "count": s["count"],
                "avg_ms": round(avg, 2), "p95_ms": round(_p95(s["samples"]), 2),
                "max_ms": round(s["max"], 2), "last_ms": round(s["last_ms"], 2),
                "slow": s["slow"], "errors": s["errors"],
            })
        rows.sort(key=lambda r: r["avg_ms"], reverse=True)
        uptime = int(time.time() - _started_at)
    return {
        "slow_threshold_ms": SLOW_THRESHOLD_MS,
        "routes_tracked": len(rows),
        "total_requests": total_reqs,
        "slow_requests": total_slow,
        "slowest_avg_ms": round(slowest_avg, 2),
        "uptime_s": uptime,
        "routes": rows,
    }


def reset() -> None:
    with _lock:
        _stats.clear()
