"""Activity / audit log with automatic 30-day expiry (MongoDB TTL index).

Every important admin action on a partner, and key partner events, are logged
here. A TTL index on the BSON `ts` datetime auto-deletes docs older than 30 days.
"""
from datetime import datetime, timezone
from config.database import db, now_iso
from models.user import new_id

RETENTION_DAYS = 30
_indexed = False


async def ensure_indexes():
    global _indexed
    if _indexed:
        return
    try:
        await db.activity_logs.create_index("ts", expireAfterSeconds=RETENTION_DAYS * 24 * 3600)
        await db.activity_logs.create_index("target_id")
        await db.activity_logs.create_index("actor_id")
        _indexed = True
    except Exception:  # noqa: BLE001
        pass


async def log(actor_role: str, actor_id: str, actor_name: str, action: str,
              detail: str = "", target_id: str = None, target_role: str = None,
              meta: dict = None):
    """Write one activity log entry. Best-effort — never breaks the caller."""
    try:
        await db.activity_logs.insert_one({
            "id": new_id(),
            "actor_role": actor_role,
            "actor_id": actor_id,
            "actor_name": actor_name or actor_role,
            "action": action,
            "detail": detail or "",
            "target_id": target_id,
            "target_role": target_role,
            "meta": meta or {},
            "created_at": now_iso(),
            "ts": datetime.now(timezone.utc),
        })
    except Exception:  # noqa: BLE001
        pass


async def list_logs(target_id: str = None, actor_id: str = None, limit: int = 500):
    q = {}
    if target_id and actor_id:
        q = {"$or": [{"target_id": target_id}, {"actor_id": actor_id}]}
    elif target_id:
        q = {"target_id": target_id}
    elif actor_id:
        q = {"actor_id": actor_id}
    rows = await db.activity_logs.find(q, {"_id": 0}).sort("ts", -1).to_list(limit)
    return rows
