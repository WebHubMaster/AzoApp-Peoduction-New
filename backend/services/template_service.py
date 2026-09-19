"""Unified notification Template Manager — SMS / Email / Push templates that are
event-driven: when an action fires (e.g. partner_kyc_approved), the ACTIVE template
for that event+channel is rendered (variable substitution) and delivered. Inactive
templates are skipped. Falls back to inline text when no active template exists.
"""
import re
from config.database import db, now_iso
from models.user import new_id

CHANNELS = ("sms", "email", "push")

# Known events surfaced in the admin dropdown (admin may also type a custom event key)
EVENTS = [
    {"key": "login_otp", "label": "Login / Register OTP", "vars": ["otp"]},
    {"key": "partner_registered", "label": "New Partner Registered", "vars": ["name", "phone"]},
    {"key": "partner_kyc_submitted", "label": "Partner KYC Submitted", "vars": ["name"]},
    {"key": "partner_kyc_approved", "label": "Partner KYC Approved", "vars": ["name"]},
    {"key": "partner_kyc_rejected", "label": "Partner KYC Rejected", "vars": ["name", "reason"]},
    {"key": "customer_registered", "label": "New Customer Registered", "vars": ["name", "phone"]},
    {"key": "merchant_registered", "label": "New Merchant Registered", "vars": ["name", "phone"]},
    {"key": "booking_confirmed", "label": "Booking Confirmed", "vars": ["name", "booking_id"]},
    {"key": "booking_assigned", "label": "Partner Assigned", "vars": ["name", "partner_name", "booking_id"]},
    {"key": "booking_started", "label": "Service Started", "vars": ["name", "booking_id"]},
    {"key": "booking_completed", "label": "Booking Completed", "vars": ["name", "booking_id", "amount"]},
    {"key": "booking_cancelled", "label": "Booking Cancelled", "vars": ["name", "booking_id"]},
    {"key": "payment_success", "label": "Payment Successful", "vars": ["name", "booking_id", "amount"]},
    {"key": "payment_failed", "label": "Payment Failed", "vars": ["name", "booking_id", "amount"]},
    {"key": "refund_processed", "label": "Refund Processed", "vars": ["name", "booking_id", "amount"]},
    {"key": "withdrawal_approved", "label": "Withdrawal Approved", "vars": ["name", "amount"]},
    {"key": "withdrawal_requested", "label": "Withdrawal Requested", "vars": ["name", "amount"]},
    {"key": "withdrawal_rejected", "label": "Withdrawal Rejected", "vars": ["name", "amount", "reason"]},
    {"key": "job_request", "label": "New Job Request (Partner)", "vars": ["booking_id", "amount"]},
    {"key": "job_accepted", "label": "Job Accepted", "vars": ["name", "partner_name", "booking_id"]},
    {"key": "chat_message", "label": "New Chat Message", "vars": ["name", "booking_id"]},
    {"key": "spare_part_approval", "label": "Spare Part Approval Needed", "vars": ["booking_id"]},
    {"key": "additional_work", "label": "Additional Work Added", "vars": ["booking_id", "amount"]},
    {"key": "incentive_awarded", "label": "Incentive / Bonus Awarded", "vars": ["name", "amount"]},
    {"key": "general", "label": "General / Manual", "vars": ["name"]},
]

# Built-in event keys (cannot be deleted, but can be extended by admin custom events)
_BUILTIN_KEYS = {e["key"] for e in EVENTS}


def _default_meta(key: str):
    """Default (icon, color) for a built-in event key so the Template Manager list is scannable."""
    k = key or ""
    if k == "login_otp":
        return ("Phone", "#0ea5e9")
    if "kyc" in k:
        return ("CheckCircle2", "#16a34a")
    if k.endswith("registered"):
        return ("UserPlus", "#6366f1")
    if k.startswith("booking"):
        return ("Calendar", "#2563eb")
    if k.startswith("payment"):
        return ("CreditCard", "#0d9488")
    if k.startswith("refund"):
        return ("CreditCard", "#f59e0b")
    if k.startswith("withdrawal"):
        return ("Wallet", "#7c3aed")
    if k.startswith("job"):
        return ("Wrench", "#ea580c")
    if k == "chat_message":
        return ("MessageSquare", "#db2777")
    if k == "incentive_awarded":
        return ("Gift", "#e11d48")
    if k in ("spare_part_approval", "additional_work"):
        return ("AlertTriangle", "#d97706")
    return ("Bell", "#64748b")


async def list_events():
    """Return built-in events merged with admin-created custom Trigger Events.
    Custom events live in `notification_events`; unlimited events supported.
    Every event carries an `icon` (lucide name) + `color` (hex) for the admin UI.
    Built-ins that the admin has "deleted" are stored with hidden=True and excluded."""
    custom = await db.notification_events.find({}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    hidden = {c.get("key") for c in custom if c.get("hidden")}
    out = []
    for e in EVENTS:
        if e["key"] in hidden:
            continue
        dic, dcol = _default_meta(e["key"])
        out.append(dict(e, builtin=True, icon=e.get("icon", dic), color=e.get("color", dcol)))
    seen = {e["key"] for e in out}
    for c in custom:
        if c.get("hidden"):
            continue
        dic, dcol = _default_meta(c.get("key"))
        row = {"key": c.get("key"), "label": c.get("label") or c.get("key"),
               "vars": c.get("vars") or [], "description": c.get("description", ""),
               "icon": c.get("icon") or dic, "color": c.get("color") or dcol,
               "builtin": False}
        if row["key"] in seen:
            # custom definition overrides label/vars/icon/color of a same-key builtin
            for o in out:
                if o["key"] == row["key"]:
                    o.update({"label": row["label"], "vars": row["vars"] or o.get("vars", []),
                              "description": row["description"], "icon": row["icon"], "color": row["color"]})
        else:
            out.append(row)
            seen.add(row["key"])
    return out


def _slug_key(s: str) -> str:
    import re as _re
    k = _re.sub(r"[^a-z0-9_]+", "_", (s or "").strip().lower()).strip("_")
    return k[:60]


async def create_event(data: dict):
    key = _slug_key(data.get("key") or data.get("label") or "")
    if not key:
        return {"ok": False, "error": "A key or label is required"}
    label = (data.get("label") or key).strip()
    varlist = data.get("vars")
    if isinstance(varlist, str):
        varlist = [v.strip() for v in varlist.split(",") if v.strip()]
    varlist = [v for v in (varlist or []) if v]
    existing = await db.notification_events.find_one({"key": key}, {"_id": 0})
    fields = {"key": key, "label": label, "vars": varlist,
              "description": (data.get("description") or "").strip(), "hidden": False}
    icon = (data.get("icon") or "").strip()
    color = (data.get("color") or "").strip()
    if icon:
        fields["icon"] = icon
    if color:
        fields["color"] = color
    if existing:
        await db.notification_events.update_one({"key": key}, {"$set": fields})
    else:
        await db.notification_events.insert_one({"id": new_id(), **fields, "created_at": now_iso()})
    return {"ok": True, "key": key, "builtin": key in _BUILTIN_KEYS}


async def delete_event(key: str):
    if key in _BUILTIN_KEYS:
        # Built-ins can't be removed from code, so "delete" = hide it: it disappears
        # from the manager and its trigger stops firing. Re-create to restore.
        await db.notification_events.update_one(
            {"key": key},
            {"$set": {"key": key, "hidden": True},
             "$setOnInsert": {"id": new_id(), "label": key, "created_at": now_iso()}},
            upsert=True)
        return {"ok": True, "hidden": True}
    await db.notification_events.delete_one({"key": key})
    return {"ok": True}


async def _is_hidden(key: str) -> bool:
    doc = await db.notification_events.find_one({"key": key, "hidden": True}, {"_id": 1})
    return bool(doc)



def render(text: str, ctx: dict) -> str:
    if not text:
        return ""
    out = text
    for k, v in (ctx or {}).items():
        out = out.replace("{{" + k + "}}", str(v))
        out = out.replace("{" + k + "}", str(v))
        out = out.replace("[[" + k + "]]", str(v))  # PDF/DLT style [[var]]
    # Fast2SMS DLT style {#VAR#} — fill sequentially from ctx values
    vals = [str(v) for v in (ctx or {}).values()]
    i = 0
    def _sub(_):
        nonlocal i
        val = vals[i] if i < len(vals) else ""
        i += 1
        return val
    out = re.sub(r"\{#VAR#\}", _sub, out)
    return out


async def list_templates(channel: str = None):
    q = {"channel": channel} if channel else {}
    return await db.notification_templates.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


async def upsert_template(data: dict, tid: str = None):
    fields = {
        "channel": data.get("channel", "sms"),
        "name": data.get("name", ""),
        "event": data.get("event", "general"),
        "category": data.get("category", "general"),
        "subject": data.get("subject", ""),        # email
        "title": data.get("title", ""),            # push
        "body": data.get("body", ""),
        "sender_id": data.get("sender_id", ""),    # sms
        "dlt_template_id": data.get("dlt_template_id", ""),  # sms
        "active": bool(data.get("active", True)),
    }
    if tid:
        await db.notification_templates.update_one({"id": tid}, {"$set": fields})
        return await db.notification_templates.find_one({"id": tid}, {"_id": 0})
    doc = {"id": new_id(), **fields, "created_at": now_iso()}
    await db.notification_templates.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def delete_template(tid: str):
    await db.notification_templates.delete_one({"id": tid})
    return {"ok": True}


async def toggle_template(tid: str):
    t = await db.notification_templates.find_one({"id": tid}, {"_id": 0})
    if not t:
        return {"ok": False}
    await db.notification_templates.update_one({"id": tid}, {"$set": {"active": not t.get("active", True)}})
    return {"ok": True, "active": not t.get("active", True)}


async def _active_template(event: str, channel: str):
    return await db.notification_templates.find_one(
        {"event": event, "channel": channel, "active": True}, {"_id": 0})


async def fire_event(user_id: str, event: str, ctx: dict = None,
                     fallback_title: str = "", fallback_body: str = "", link: str = "/"):
    """Render active templates per channel for the event and deliver via notify().
    Falls back to provided title/body when no active template exists for a channel.
    """
    ctx = ctx or {}
    # A "deleted" (hidden) trigger event is disabled — skip all delivery for it.
    if await _is_hidden(event):
        return {"skipped": "event_disabled"}
    sms_t = await _active_template(event, "sms")
    email_t = await _active_template(event, "email")
    push_t = await _active_template(event, "push")

    # Push ALWAYS fires (fallback to caller text). SMS/Email are dynamic — only when
    # an ACTIVE template exists for that event+channel (keeps SMS/email spend controlled).
    push_title = render(push_t["title"], ctx) if (push_t and push_t.get("title")) else fallback_title
    push_body = render(push_t["body"], ctx) if push_t else fallback_body
    sms_text = render(sms_t["body"], ctx) if sms_t else False
    email_subject = render(email_t["subject"], ctx) if email_t else None
    email_html = render(email_t["body"], ctx) if email_t else None

    from services.notification_service import notify
    return await notify(
        user_id,
        push_title or fallback_title,
        push_body or fallback_body,
        link=link,
        sms_text=sms_text,
        email_subject=email_subject,
        email_html=email_html,
        data={**(ctx.get("_data") or {}), "event": event},
        event=event,
    )


async def send_test(tid: str, user_id: str):
    t = await db.notification_templates.find_one({"id": tid}, {"_id": 0})
    if not t:
        return {"ok": False, "error": "not_found"}
    demo_ctx = {"name": "Test User", "otp": "123456", "reason": "Sample reason",
                "booking_id": "AZO12345", "business": "AzoApp"}
    from services.notification_service import notify
    if t["channel"] == "email":
        res = await notify(user_id, render(t.get("subject", "Test"), demo_ctx),
                           render(t["body"], demo_ctx), sms_text=False,
                           email_subject=render(t.get("subject", "Test"), demo_ctx),
                           email_html=render(t["body"], demo_ctx))
    elif t["channel"] == "push":
        res = await notify(user_id, render(t.get("title", "Test"), demo_ctx),
                           render(t["body"], demo_ctx), sms_text=False)
    else:
        res = await notify(user_id, t.get("name", "SMS"), render(t["body"], demo_ctx),
                           sms_text=render(t["body"], demo_ctx))
    return {"ok": True, "delivery": res}


async def seed_templates():
    if await db.notification_templates.count_documents({}) > 0:
        return
    defaults = [
        {"channel": "sms", "name": "Login OTP", "event": "login_otp", "category": "otp",
         "dlt_template_id": "", "body": "Your AzoApp verification code is {#VAR#}. Valid for 10 minutes. Do not share it with anyone."},
        {"channel": "sms", "name": "KYC Approved", "event": "partner_kyc_approved", "category": "partner",
         "body": "AzoApp: Congratulations {{name}}! Your partner KYC is APPROVED. You can now start accepting jobs."},
        {"channel": "sms", "name": "KYC Rejected", "event": "partner_kyc_rejected", "category": "partner",
         "body": "AzoApp: Your partner KYC needs changes: {{reason}}. Please update your details and resubmit."},
        {"channel": "email", "name": "KYC Approved", "event": "partner_kyc_approved", "category": "partner",
         "subject": "Your AzoApp Partner account is approved 🎉",
         "body": "<h2>Welcome aboard, {{name}}!</h2><p>Your partner KYC has been <b>approved</b>. You can now log in and start receiving jobs.</p><p>— Team AzoApp</p>"},
        {"channel": "email", "name": "KYC Rejected", "event": "partner_kyc_rejected", "category": "partner",
         "subject": "Action needed on your AzoApp Partner application",
         "body": "<h3>Hi {{name}},</h3><p>Your KYC application needs some corrections:</p><blockquote>{{reason}}</blockquote><p>Please log in, update the details and submit again.</p><p>— Team AzoApp</p>"},
        {"channel": "push", "name": "KYC Approved", "event": "partner_kyc_approved", "category": "partner",
         "title": "KYC Approved 🎉", "body": "Your partner account is approved. Start accepting jobs now!"},
        {"channel": "push", "name": "KYC Rejected", "event": "partner_kyc_rejected", "category": "partner",
         "title": "KYC needs attention", "body": "Your application needs changes. Tap to view and resubmit."},
    ]
    for d in defaults:
        await upsert_template({**d, "active": True})
