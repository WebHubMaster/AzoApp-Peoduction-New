"""Central MongoDB index creation for hot query paths.

Every index below backs an actual query used by the app (login by phone,
lists filtered by owner/status, dashboards sorted by date, etc.). All calls
are idempotent — Mongo skips indexes that already exist — so this is safe to
run on every startup. Failures are swallowed per-index so a single bad spec
never blocks boot.
"""
import logging
from config.database import db

logger = logging.getLogger("azoapp.indexes")

# collection -> list of index key specs (str = single asc field, list = compound)
INDEXES = {
    "users": [
        "phone",            # login / registration lookup (hottest auth query)
        "email",
        "id",
        "role",
        "referred_by_merchant",
        "partner_code",
        "merchant_code",
        [("role", 1), ("created_at", -1)],
    ],
    "bookings": [
        "id",
        [("customer_id", 1), ("created_at", -1)],
        [("partner_id", 1), ("created_at", -1)],
        [("merchant_id", 1), ("created_at", -1)],
        [("status", 1), ("created_at", -1)],
        "service_id",
        "scheduled_at",
        "created_at",
        "order_group_id",
        "pay_order_id",
    ],
    "transactions": [
        "id",
        [("user_id", 1), ("created_at", -1)],
        [("kind", 1), ("created_at", -1)],
        "created_at",
    ],
    "invoices": [
        "id",
        "number",
        [("customer_id", 1), ("created_at", -1)],
        [("merchant_id", 1), ("created_at", -1)],
        [("partner_id", 1), ("created_at", -1)],
        [("status", 1), ("created_at", -1)],
        [("invoice_type", 1), ("created_at", -1)],
        "created_at",
    ],
    "partner_ledger": [
        [("partner_id", 1), ("created_at", -1)],
        [("partner_id", 1), ("kind", 1), ("created_at", -1)],
        "kind",
    ],
    "notifications": [
        [("user_id", 1), ("created_at", -1)],
        "created_at",
    ],
    "media": [
        [("folder", 1), ("created_at", -1)],
        "id",
    ],
    "scratch_cards": [
        [("customer_id", 1), ("status", 1)],
        "status",
    ],
    "categories": ["id", "slug", [("status", 1), ("order", 1)]],
    "services": [
        "id", "slug",
        [("category", 1), ("status", 1)],
        [("status", 1), ("show_on_home", 1)],
    ],
    "service_areas": ["id", [("status", 1)]],
    "support_tickets": [[("user_id", 1), ("created_at", -1)], [("status", 1), ("created_at", -1)]],
    "reminders": [[("merchant_id", 1), ("due_date", 1)], "due_date"],
    "merchant_customer_tags": [[("merchant_id", 1), ("customer_key", 1)]],
    "refresh_tokens": ["user_id", "expires_at"],
    "otps": ["phone", "identifier"],
}


async def ensure_indexes():
    created = 0
    for coll, specs in INDEXES.items():
        for spec in specs:
            try:
                await db[coll].create_index(spec)
                created += 1
            except Exception as e:  # noqa: BLE001
                logger.warning("index skip %s %s: %s", coll, spec, e)
    logger.info("ensure_indexes done (%d ensured across %d collections)", created, len(INDEXES))
    return created
