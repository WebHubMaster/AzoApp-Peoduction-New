"""7-day retention cleanup.

1. Notification history — admin broadcast campaigns, per-user in-app
   notifications and delivery logs older than 7 days are auto-deleted so the
   Notifications → History list (and the DB) stays lean.
2. Refresh tokens — if the app ever persists refresh tokens/sessions, any token
   that expired more than 7 days ago (i.e. unused since expiry) is removed.
   (Auth is currently stateless JWT, so this is a safe no-op until such a
   collection exists.)

Timestamps are stored as ISO-8601 UTC strings (config.now_iso), which sort
lexicographically, so we compare against a 7-day-old ISO cutoff. For token
stores that may use native BSON dates we also match a datetime cutoff.
"""
from datetime import datetime, timezone, timedelta

from config.database import db

RETENTION_DAYS = 7

# Notification "history" collections cleaned on the created_at timestamp.
NOTIFICATION_COLLECTIONS = ("notification_campaigns", "notifications", "notification_delivery_logs")

# Possible refresh-token / session stores cleaned once they are 7 days past expiry.
TOKEN_COLLECTIONS = ("refresh_tokens", "auth_refresh_tokens", "sessions")
TOKEN_EXPIRY_FIELDS = ("expires_at", "expiresAt", "expiry", "expire_at")


async def cleanup() -> dict:
    """Delete notification history + long-expired refresh tokens older than 7 days.
    Best-effort; returns a map of collection -> deleted_count for anything removed."""
    now = datetime.now(timezone.utc)
    cutoff_iso = (now - timedelta(days=RETENTION_DAYS)).isoformat()
    cutoff_dt = now - timedelta(days=RETENTION_DAYS)
    out = {}

    # 1) Notification history older than 7 days (created_at ISO string)
    for coll in NOTIFICATION_COLLECTIONS:
        try:
            r = await db[coll].delete_many({"created_at": {"$lt": cutoff_iso}})
            if r.deleted_count:
                out[coll] = r.deleted_count
        except Exception:  # noqa: BLE001
            pass

    # 2) Refresh tokens expired more than 7 days ago (only if such a store exists)
    try:
        existing = set(await db.list_collection_names())
    except Exception:  # noqa: BLE001
        existing = set()
    for coll in TOKEN_COLLECTIONS:
        if coll not in existing:
            continue
        ors = []
        for f in TOKEN_EXPIRY_FIELDS:
            ors.append({f: {"$lt": cutoff_iso}})  # ISO-string expiry
            ors.append({f: {"$lt": cutoff_dt}})   # BSON-date expiry
        try:
            r = await db[coll].delete_many({"$or": ors})
            if r.deleted_count:
                out[coll] = r.deleted_count
        except Exception:  # noqa: BLE001
            pass
    return out
