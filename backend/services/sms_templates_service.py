"""Event-based SMS templates.

Each template is tied to an `event_type`. A template can be toggled active/inactive
by admin. When an app event (task) fires, we look up the ACTIVE template for that
event type, render its placeholders ([[key]]) from the provided context, and send it
via the configured SMS gateway. If no active template exists for an event, no SMS is
sent for that event.
"""
import re
from config.database import db, now_iso
from models.user import new_id

_PLACEHOLDER = re.compile(r"\[\[\s*([a-zA-Z0-9_]+)\s*\]\]")

# Default templates seeded on startup. `params` documents the available placeholders.
DEFAULT_TEMPLATES = [
    {"type": "send_otp", "title": "OTP Code",
     "template": "Your AzoApp verification code is [[otp]]. Valid for 10 minutes. Do not share it.",
     "params": ["otp"]},
    {"type": "booking_confirmed", "title": "Booking Confirmed",
     "template": "Dear [[customer_name]], your AzoApp booking [[booking_id]] has been confirmed. We are finding a provider for you.",
     "params": ["customer_name", "booking_id"]},
    {"type": "new_job_available", "title": "New Job Available (Provider)",
     "template": "AzoApp: A new job [[booking_id]] is available near you. Open the app to accept it.",
     "params": ["booking_id"]},
    {"type": "partner_assigned", "title": "Provider Assigned",
     "template": "Dear [[customer_name]], [[partner_name]] has been assigned to booking [[booking_id]] and is on the way.",
     "params": ["customer_name", "partner_name", "booking_id"]},
    {"type": "booking_started", "title": "Service Started",
     "template": "AzoApp: Service for your booking [[booking_id]] has started.",
     "params": ["booking_id"]},
    {"type": "booking_completed", "title": "Booking Completed",
     "template": "Dear [[customer_name]], your service [[booking_id]] is completed. Thank you for choosing AzoApp!",
     "params": ["customer_name", "booking_id"]},
    {"type": "booking_cancelled", "title": "Booking Cancelled",
     "template": "AzoApp: Your booking [[booking_id]] has been cancelled.",
     "params": ["booking_id"]},
    {"type": "spare_part_approval", "title": "Spare Part Approval Needed",
     "template": "AzoApp: Spare part approval is needed for your booking [[booking_id]]. Please review in the app.",
     "params": ["booking_id"]},
    {"type": "partner_verified", "title": "Provider Verified",
     "template": "Congratulations [[partner_name]]! Your AzoApp provider profile is verified and now active. You will start receiving job requests.",
     "params": ["partner_name"]},
    {"type": "withdrawal_approved", "title": "Withdrawal Approved",
     "template": "AzoApp: Your withdrawal request of Rs.[[amount]] has been approved.",
     "params": ["amount"]},
]

_TYPE_META = {t["type"]: t for t in DEFAULT_TEMPLATES}


async def seed_sms_templates():
    """Insert any missing default templates (idempotent). Existing ones untouched."""
    for i, t in enumerate(DEFAULT_TEMPLATES):
        existing = await db.sms_templates.find_one({"type": t["type"]})
        if not existing:
            await db.sms_templates.insert_one({
                "id": new_id(), "type": t["type"], "title": t["title"],
                "template": t["template"], "params": t["params"],
                "active": True, "order": i, "created_at": now_iso(),
                "updated_at": now_iso()})


async def list_templates():
    docs = await db.sms_templates.find({}, {"_id": 0}).to_list(500)
    docs.sort(key=lambda d: d.get("order", 999))
    return docs


async def update_template(tid: str, data: dict):
    allowed = {}
    if data.get("title") is not None:
        allowed["title"] = data["title"]
    if data.get("template") is not None:
        allowed["template"] = data["template"]
    if data.get("active") is not None:
        allowed["active"] = bool(data["active"])
    if data.get("params") is not None:
        allowed["params"] = data["params"]
    if allowed:
        allowed["updated_at"] = now_iso()
        await db.sms_templates.update_one({"id": tid}, {"$set": allowed})
    return await db.sms_templates.find_one({"id": tid}, {"_id": 0})


async def is_event_active(event_type: str) -> bool:
    t = await db.sms_templates.find_one({"type": event_type}, {"_id": 0})
    # If no template configured yet, treat as active (backward compatible).
    return True if t is None else bool(t.get("active"))


def _render(template: str, ctx: dict) -> str:
    def repl(m):
        return str(ctx.get(m.group(1), "")).strip()
    return _PLACEHOLDER.sub(repl, template or "").strip()


async def event_sms(event_type: str, phone: str, ctx: dict = None) -> bool:
    """Render + send the ACTIVE template for `event_type`. Returns True if a send was
    attempted (template active), False if skipped (no template / inactive)."""
    t = await db.sms_templates.find_one({"type": event_type, "active": True}, {"_id": 0})
    if not t:
        return False
    message = _render(t.get("template", ""), ctx or {})
    if not message:
        return False
    from services.sms_service import send_text_sms
    await send_text_sms(phone, message)
    return True
