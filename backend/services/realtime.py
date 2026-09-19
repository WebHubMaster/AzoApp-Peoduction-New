"""In-process real-time event broker (Server-Sent Events backbone).

Single uvicorn worker => a plain asyncio pub/sub is fully reliable. Each SSE
connection subscribes to one or more topics (per-user + optional 'admin').
Publishers call the fire-and-forget emit_* helpers; they never raise.
"""
import asyncio
import logging

from config.database import db, now_iso

logger = logging.getLogger("azoapp.realtime")


class _Broker:
    def __init__(self):
        self._subs: dict[str, set[asyncio.Queue]] = {}

    def subscribe(self, topics):
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        for t in topics:
            self._subs.setdefault(t, set()).add(q)
        return q

    def unsubscribe(self, topics, q):
        for t in topics:
            s = self._subs.get(t)
            if s:
                s.discard(q)
                if not s:
                    self._subs.pop(t, None)

    def publish(self, topic, event):
        for q in list(self._subs.get(topic, ())):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    def stats(self):
        return {t: len(s) for t, s in self._subs.items()}


broker = _Broker()


def emit(topic, type_, data=None):
    try:
        broker.publish(topic, {"type": type_, "data": data or {}, "ts": now_iso()})
    except Exception as e:  # noqa: BLE001
        logger.warning("realtime emit failed: %s", e)


def emit_user(uid, type_, data=None):
    if uid:
        emit(f"user:{uid}", type_, data)


def emit_admin(type_, data=None):
    emit("admin", type_, data)


# ---- configuration (Integration Center) ----
DEFAULT_CONFIG = {
    "enabled": True,
    "sound": True,
    "browser_notifications": True,
    "broadcast": "all_eligible",  # all_eligible | first_only (reserved)
}


async def get_config():
    doc = await db.app_config.find_one({"id": "realtime"}, {"_id": 0})
    if not doc:
        return dict(DEFAULT_CONFIG)
    return {**DEFAULT_CONFIG, **{k: doc.get(k) for k in DEFAULT_CONFIG if k in doc}}


async def set_config(patch: dict):
    cur = await get_config()
    for k, v in (patch or {}).items():
        if k in DEFAULT_CONFIG:
            cur[k] = v
    await db.app_config.update_one(
        {"id": "realtime"},
        {"$set": {**cur, "id": "realtime", "updated_at": now_iso()}},
        upsert=True)
    return cur
