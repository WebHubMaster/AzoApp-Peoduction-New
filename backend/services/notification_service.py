"""Unified multi-channel notification: in-app (always) + real-time SSE + Push (FCM)
+ SMS + Email.

Push + in-app + SSE fire for EVERY notification so users get an instant alert on
their device (even when the app/browser is closed). SMS and Email are dynamic /
template-driven — they only fire when the caller supplies explicit text (which the
Template Manager provides for a matching active template). This keeps SMS/email spend
under admin control while push stays universal.
"""
from config.database import db, now_iso
from models.user import new_id


async def notify(user_id: str, title: str, body: str, *, link: str = "/",
                 sms_text=None, email_subject: str = None,
                 email_html: str = None, data: dict = None, image: str = None,
                 event: str = None) -> dict:
    result = {"in_app": False, "sse": False, "sms": None, "push": None, "email": None}
    data = dict(data or {})
    if event:
        data.setdefault("event", event)

    # 1) in-app (always)
    await db.notifications.insert_one({
        "id": new_id(), "user_id": user_id, "audience": "user",
        "title": title, "body": body, "link": link, "image": image,
        "data": data, "read": False, "created_at": now_iso()})
    result["in_app"] = True

    # 2) real-time SSE ping (instant in-app toast / live UI update)
    try:
        from services import realtime as rt
        rt.emit_user(user_id, "notification", {
            "title": title, "body": body, "link": link,
            "event": event, "type": data.get("type") or event or "notification",
            **({"booking_id": data["booking_id"]} if data.get("booking_id") else {}),
        })
        result["sse"] = True
    except Exception:  # noqa: BLE001
        pass

    user = await db.users.find_one({"id": user_id}, {"_id": 0, "phone": 1, "email": 1})
    if not user:
        return result

    # 3) SMS — dynamic: only when the caller supplied real text (template-driven)
    try:
        if user.get("phone") and sms_text:
            from services.sms_service import send_text_sms
            result["sms"] = await send_text_sms(user["phone"], sms_text)
    except Exception as e:  # noqa: BLE001
        result["sms"] = {"error": str(e)[:120]}

    # 4) Push — ALWAYS best-effort (universal device alert). We fire BOTH channels:
    #    standard VAPID Web Push (works without Firebase/Google Cloud) and legacy FCM.
    #    A given browser registers with only ONE channel, so there are no duplicates.
    try:
        from services.webpush_service import send_to_user as webpush_send
        result["webpush"] = await webpush_send(user_id, title, body, link, data, image=image)
    except Exception as e:  # noqa: BLE001
        result["webpush"] = {"error": str(e)[:120]}
    try:
        from services.fcm_service import send_to_user
        result["push"] = await send_to_user(user_id, title, body, link, data, image=image)
    except Exception as e:  # noqa: BLE001
        result["push"] = {"error": str(e)[:120]}

    # 5) Email — dynamic: only when the caller supplied HTML (template-driven)
    try:
        if user.get("email") and email_html:
            from services.email_service import send_email
            result["email"] = await send_email(
                user["email"], email_subject or title, email_html, body)
    except Exception as e:  # noqa: BLE001
        result["email"] = {"error": str(e)[:120]}

    return result
