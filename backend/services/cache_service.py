"""Multi-provider Redis cache with graceful in-memory fallback.

Supports Upstash (REST) and any standard ``redis://`` / ``rediss://`` provider
(Redis Cloud, Aiven, Railway, DigitalOcean, AWS ElastiCache, Generic/Custom).
Runtime credentials are entered from the admin Performance page and stored
**encrypted** (Fernet) in MongoDB (``system_config`` collection, _id="cache").

If Redis is disabled or unreachable, every operation transparently falls back to
a per-process in-memory dict so the app never errors. A ping returns the real
round-trip latency in ms for the Connection Latency diagnostics.
"""
import os
import time
import json
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit

from cryptography.fernet import Fernet

from config.database import db

_CONFIG_ID = "cache"

# Live cache-activity counters (process-local, surfaced in the Performance monitor).
_STATS = {"hits": 0, "misses": 0, "sets": 0, "errors": 0}


def _bump(k, n=1):
    _STATS[k] = _STATS.get(k, 0) + n

# provider key -> display metadata. mode: "rest" (Upstash REST) | "tcp" (redis://)
PROVIDERS = {
    "upstash":         {"label": "Upstash (REST)",  "conn": "Upstash REST API",  "mode": "rest"},
    "redis_cloud":     {"label": "Redis Cloud",     "conn": "Redis (TCP/TLS)",   "mode": "tcp"},
    "aiven":           {"label": "Aiven",           "conn": "Redis (TCP/TLS)",   "mode": "tcp"},
    "railway":         {"label": "Railway",         "conn": "Redis (TCP)",       "mode": "tcp"},
    "digitalocean":    {"label": "DigitalOcean",    "conn": "Redis (TCP/TLS)",   "mode": "tcp"},
    "aws_elasticache": {"label": "AWS ElastiCache", "conn": "Redis (TCP/TLS)",   "mode": "tcp"},
    "generic":         {"label": "Generic / Custom", "conn": "Redis (TCP)",      "mode": "tcp"},
}


# ---- Fernet helpers (credentials at rest) ------------------------------------
def _fernet():
    key = os.environ.get("CACHE_ENCRYPTION_KEY")
    if not key:
        return None
    try:
        return Fernet(key.encode())
    except Exception:  # noqa: BLE001
        return None


def _enc(value):
    f = _fernet()
    if not f or not value:
        return value
    return f.encrypt(value.encode()).decode()


def _dec(value):
    f = _fernet()
    if not f or not value:
        return value
    try:
        return f.decrypt(value.encode()).decode()
    except Exception:  # noqa: BLE001
        return None


def _mask_url(url, mode):
    """Upstash REST endpoints are safe to show; redis:// URLs hide credentials."""
    if not url:
        return ""
    if mode == "rest":
        return url
    try:
        p = urlsplit(url)
        host = p.hostname or ""
        port = f":{p.port}" if p.port else ""
        netloc = (f"***@{host}{port}" if (p.username or p.password) else f"{host}{port}")
        return urlunsplit((p.scheme, netloc, p.path, "", ""))
    except Exception:  # noqa: BLE001
        return "\u2022\u2022\u2022"


class CacheManager:
    """Holds the live Redis client (if any) + the in-memory fallback store."""

    def __init__(self):
        self.client = None
        self.mode = None       # 'rest' | 'tcp' | None
        self.provider = None
        self.local = {}        # key -> (expiry_epoch|None, value)

    async def close(self):
        try:
            if self.client and self.mode == "tcp":
                await self.client.aclose()
        except Exception:  # noqa: BLE001
            pass
        self.client = None
        self.mode = None
        self.provider = None

    async def configure(self, provider, url, token):
        await self.close()
        meta = PROVIDERS.get(provider)
        if not meta:
            raise ValueError("Unknown provider")
        if meta["mode"] == "rest":
            if not url or not token:
                raise ValueError("Upstash REST URL and token are required")
            from upstash_redis.asyncio import Redis as UpstashRedis
            self.client = UpstashRedis(url=url, token=token)
            self.mode = "rest"
        else:
            if not url or not url.startswith(("redis://", "rediss://")):
                raise ValueError("A redis:// or rediss:// connection URL is required")
            import redis.asyncio as aredis
            self.client = aredis.from_url(
                url, decode_responses=True,
                socket_connect_timeout=5, socket_timeout=5)
            self.mode = "tcp"
        self.provider = provider

    async def ping(self):
        if not self.client:
            return {"ok": False, "backend": "memory", "latency_ms": None}
        started = time.perf_counter()
        try:
            await self.client.ping()
            return {"ok": True, "backend": self.provider or self.mode,
                    "latency_ms": round((time.perf_counter() - started) * 1000, 2)}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "backend": "memory",
                    "latency_ms": round((time.perf_counter() - started) * 1000, 2),
                    "error": type(e).__name__}

    def is_live(self):
        return self.client is not None

    # ---- key/value operations (Redis when live, else in-memory) --------------
    def _local_get(self, key):
        item = self.local.get(key)
        if not item:
            return None
        exp, val = item
        if exp and exp < time.time():
            self.local.pop(key, None)
            return None
        return val

    def _local_set(self, key, value, ttl):
        self.local[key] = ((time.time() + ttl) if ttl else None, value)

    async def get(self, key):
        if self.client:
            try:
                return await self.client.get(key)
            except Exception:  # noqa: BLE001
                _bump("errors")
        return self._local_get(key)

    async def set(self, key, value, ttl=None):
        if self.client:
            try:
                if ttl:
                    await self.client.set(key, value, ex=int(ttl))
                else:
                    await self.client.set(key, value)
                return True
            except Exception:  # noqa: BLE001
                _bump("errors")
        self._local_set(key, value, ttl)
        return True

    async def delete(self, *keys):
        for key in keys:
            if self.client:
                try:
                    await self.client.delete(key)
                except Exception:  # noqa: BLE001
                    _bump("errors")
            self.local.pop(key, None)


cache = CacheManager()


# ---- read-through helpers ----------------------------------------------------
async def cached(key: str, ttl: int, loader):
    """Return cached JSON for `key`, else call async `loader()`, cache & return it.
    Records hit/miss/set counters for the live monitor. Never raises — on any
    cache error it just runs the loader (correctness over speed)."""
    try:
        raw = await cache.get(key)
    except Exception:  # noqa: BLE001
        raw = None
    if raw is not None:
        _bump("hits")
        try:
            return json.loads(raw)
        except Exception:  # noqa: BLE001
            return raw
    _bump("misses")
    val = await loader()
    try:
        await cache.set(key, json.dumps(val, default=str), ttl)
        _bump("sets")
    except Exception:  # noqa: BLE001
        _bump("errors")
    return val


async def bust(*keys):
    """Invalidate one or more cache keys (safe no-op on error)."""
    try:
        await cache.delete(*keys)
    except Exception:  # noqa: BLE001
        _bump("errors")


async def bust_prefix(prefix: str):
    """Invalidate every key starting with `prefix` (local dict + Redis scan)."""
    try:
        for k in [k for k in cache.local if k.startswith(prefix)]:
            cache.local.pop(k, None)
        if cache.client:
            async for k in cache.client.scan_iter(match=f"{prefix}*"):
                await cache.client.delete(k)
    except Exception:  # noqa: BLE001
        _bump("errors")


def stats():
    h, m = _STATS["hits"], _STATS["misses"]
    total = h + m
    return {
        **_STATS,
        "reads": total,
        "hit_rate": round(100.0 * h / total, 1) if total else 0.0,
        "local_keys": len(cache.local),
        "live": cache.is_live(),
        "backend": cache.provider or ("memory" if not cache.is_live() else cache.mode),
    }


def reset_stats():
    for k in _STATS:
        _STATS[k] = 0


# ---- config persistence ------------------------------------------------------
async def load_config():
    return await db.system_config.find_one({"_id": _CONFIG_ID})


async def apply_saved_config():
    """Boot-time (and post-save): bring the live cache manager in line with the
    saved config. Falls back to memory silently on any failure."""
    doc = await load_config()
    if not doc or not doc.get("enabled") or not doc.get("provider"):
        await cache.close()
        return
    url = _dec(doc.get("url"))
    token = _dec(doc.get("token"))
    try:
        await cache.configure(doc["provider"], url, token)
        r = await cache.ping()
        if not r.get("ok"):
            await cache.close()
    except Exception:  # noqa: BLE001
        await cache.close()


async def save_config(provider, url, token, enabled):
    doc = await load_config() or {}
    now = datetime.now(timezone.utc).isoformat()
    new = {"_id": _CONFIG_ID, "provider": provider, "enabled": bool(enabled),
           "updated_at": now}
    # Blank url/token means "keep the existing saved secret".
    new["url"] = _enc(url) if url else doc.get("url")
    new["token"] = _enc(token) if token else doc.get("token")
    await db.system_config.replace_one({"_id": _CONFIG_ID}, new, upsert=True)
    return new


async def test_connection(provider, url, token):
    """Test provider creds WITHOUT disturbing the live cache manager. Blank
    url/token fall back to the saved (decrypted) values."""
    doc = await load_config() or {}
    if not url:
        url = _dec(doc.get("url"))
    if not token:
        token = _dec(doc.get("token"))
    if not provider:
        provider = doc.get("provider") or "upstash"
    tmp = CacheManager()
    try:
        await tmp.configure(provider, url, token)
        return await tmp.ping()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "backend": "memory", "latency_ms": None,
                "error": str(e)[:140]}
    finally:
        await tmp.close()


async def diagnostics():
    """Round-trip latency for backend->MongoDB and backend->Redis."""
    out = {}
    t = time.perf_counter()
    try:
        await db.command("ping")
        out["mongo"] = {"ok": True,
                        "latency_ms": round((time.perf_counter() - t) * 1000, 2)}
    except Exception as e:  # noqa: BLE001
        out["mongo"] = {"ok": False, "latency_ms": None, "error": type(e).__name__}
    out["redis"] = await cache.ping()
    out["cache_stats"] = stats()
    return out


async def public_config():
    """Config shaped for the admin UI — secrets masked, provider list included."""
    doc = await load_config() or {}
    provider = doc.get("provider") or "upstash"
    meta = PROVIDERS.get(provider, PROVIDERS["upstash"])
    url = _dec(doc.get("url"))
    token = _dec(doc.get("token"))
    live = cache.is_live()
    live_meta = PROVIDERS.get(cache.provider, {})
    status = (f"Live \u00b7 {live_meta.get('label', cache.provider)}"
              if live else "In-memory fallback")
    return {
        "enabled": bool(doc.get("enabled")),
        "provider": provider,
        "connection_type": meta["conn"],
        "mode": meta["mode"],
        "url": _mask_url(url, meta["mode"]) if url else "",
        "token_set": bool(token),
        "token_hint": (token[-4:] if token else ""),
        "live": live,
        "status": status,
        "stats": stats(),
        "updated_at": doc.get("updated_at"),
        "providers": [
            {"value": k, "label": v["label"], "conn": v["conn"], "mode": v["mode"]}
            for k, v in PROVIDERS.items()
        ],
    }
