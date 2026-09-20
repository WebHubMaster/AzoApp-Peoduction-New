"""Advanced admin notification broadcasts.

Send targeted push + in-app notifications to All users / a Specific user /
all Providers / all Customers, with a notification type (General / Category /
URL) that becomes a deep-link, plus an optional image. Push is best-effort
(fires when FCM is configured); in-app is always stored. SMS/email are
intentionally NOT sent for broadcasts to avoid spamming.
"""
import asyncio

from fastapi import HTTPException

from config.database import db, now_iso
from models.user import new_id

RECIPIENT_ROLES = ["customer", "partner", "merchant"]


def _audience_query(send_to: str):
    if send_to == "provider":
        return {"role": "partner"}
    if send_to == "customer":
        return {"role": "customer"}
    return {"role": {"$in": RECIPIENT_ROLES}}


async def audience(send_to: str = "all", q: str = ""):
    """Users for the Specific-user / Provider pickers (searchable)."""
    query = _audience_query("provider" if send_to == "provider" else send_to)
    if send_to in ("specific", "all"):
        query = {"role": {"$in": RECIPIENT_ROLES}}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
        ]
    rows = await db.users.find(
        query, {"_id": 0, "id": 1, "name": 1, "phone": 1, "role": 1}
    ).sort("name", 1).limit(50).to_list(50)
    return rows


async def send_campaign(admin, data: dict):
    send_to = (data.get("send_to") or "all").strip()
    ntype = (data.get("type") or "general").strip()
    title = (data.get("title") or "").strip()
    message = (data.get("message") or "").strip()
    image = (data.get("image") or "").strip()

    if not title or not message:
        raise HTTPException(status_code=400, detail="Title and message are required")

    # deep-link + metadata based on type
    link = "/"
    meta = {"type": ntype}
    if ntype == "category":
        cat = await db.categories.find_one({"id": data.get("category_id")}, {"_id": 0, "slug": 1, "name": 1})
        if not cat:
            raise HTTPException(status_code=400, detail="Please select a valid category")
        link = f"/category/{cat.get('slug') or data.get('category_id')}"
        meta.update({"category_id": data.get("category_id"), "category_name": cat.get("name")})
    elif ntype == "url":
        url = (data.get("url") or "").strip()
        if not url:
            raise HTTPException(status_code=400, detail="URL is required")
        link = url
        meta["url"] = url

    # resolve recipients
    if send_to == "specific":
        uid = data.get("user_id")
        if not uid:
            raise HTTPException(status_code=400, detail="Please select a user")
        query = {"id": uid}
    else:
        query = _audience_query(send_to)
    users = await db.users.find(query, {"_id": 0, "id": 1}).to_list(100000)
    ids = [u["id"] for u in users]
    if not ids:
        raise HTTPException(status_code=400, detail="No recipients found for this audience")

    now = now_iso()
    docs = [{
        "id": new_id(), "user_id": uid, "audience": "user",
        "title": title, "body": message, "link": link, "image": image,
        "data": meta, "read": False, "created_at": now,
    } for uid in ids]
    for i in range(0, len(docs), 1000):
        await db.notifications.insert_many(docs[i:i + 1000])

    # push (best-effort, batched)
    push_ok = 0
    no_device = 0
    try:
        from services.push_dispatch import push_to_user as send_to_user

        async def _one(uid):
            nonlocal push_ok, no_device
            try:
                r = await send_to_user(uid, title, message, link, {**meta, "image": image})
                if r and (r.get("sent") or r.get("success")):
                    push_ok += 1
                elif r and r.get("skipped") == "no_devices":
                    no_device += 1
            except Exception:
                pass

        for i in range(0, len(ids), 200):
            await asyncio.gather(*[_one(x) for x in ids[i:i + 200]])
    except Exception:
        pass

    camp = {
        "id": new_id(), "send_to": send_to, "type": ntype, "title": title,
        "message": message, "image": image, "link": link, "meta": meta,
        "recipients": len(ids), "push_delivered": push_ok, "no_device": no_device,
        "by": (admin or {}).get("id"), "created_at": now,
    }
    await db.notification_campaigns.insert_one(dict(camp))
    camp.pop("_id", None)
    return camp


async def list_campaigns():
    return await db.notification_campaigns.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


# ---------------------------------------------------------------------------
# Diagnostics & test-push (helps admins verify the full push chain end-to-end)
# ---------------------------------------------------------------------------

async def notification_health():
    """Return a comprehensive snapshot of the notification stack so an admin can
    tell — at a glance — WHY a partner may not be receiving push. Everything
    is read-only; safe to call any time."""
    from config.database import get_settings
    from services import fcm_service

    s = await get_settings()
    integ = s.get("integrations", {}) or {}
    wc = integ.get("fcm_web_config", {}) or {}
    vapid = integ.get("fcm_vapid_key", "") or ""
    sa_row = await fcm_service.config_status()  # {configured, project_id, filename, updated_at}

    web_config_fields = ["apiKey", "authDomain", "projectId", "storageBucket",
                         "messagingSenderId", "appId"]
    missing = [f for f in web_config_fields if not wc.get(f)]

    devices_total = await db.fcm_devices.count_documents({})
    # per-role device breakdown
    breakdown = {}
    for role in ("partner", "customer", "merchant", "admin"):
        ids = [u["id"] async for u in db.users.find({"role": role}, {"_id": 0, "id": 1})]
        if ids:
            breakdown[role] = await db.fcm_devices.count_documents({"user_id": {"$in": ids}})
        else:
            breakdown[role] = 0

    online_partners = await db.users.count_documents(
        {"role": "partner", "partner_status": "online",
         "kyc_status": "approved", "status": "active"})

    recent_logs = await db.notification_delivery_logs.find(
        {}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)

    # Browser-side registration attempts (why a device did/didn't register)
    reg_rows = await db.push_registration_logs.find(
        {}, {"_id": 0}).sort("at", -1).limit(30).to_list(30)
    # Online partners with NO registered device + their last known browser state
    dev_user_ids = set(await db.fcm_devices.distinct("user_id"))
    partners_no_device = []
    async for p in db.users.find(
            {"role": "partner", "partner_status": "online", "kyc_status": "approved", "status": "active"},
            {"_id": 0, "id": 1, "name": 1, "phone": 1, "push_state": 1}):
        if p["id"] not in dev_user_ids:
            partners_no_device.append({"id": p["id"], "name": p.get("name"), "phone": p.get("phone"),
                                       "push_state": p.get("push_state") or None})
    ids = list({r.get("user_id") for r in reg_rows if r.get("user_id")})
    umap = {}
    if ids:
        async for u in db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "role": 1, "phone": 1}):
            umap[u["id"]] = u
    for r in reg_rows:
        r["user"] = umap.get(r.get("user_id"))

    reasons = {}
    if not sa_row.get("configured"):
        reasons["service_account"] = "Firebase service-account JSON not uploaded"
    if missing:
        reasons["web_config"] = f"Missing web_config field(s): {', '.join(missing)}"
    if not vapid:
        reasons["vapid"] = "VAPID key (fcm_vapid_key) not set"
    if not integ.get("fcm_enabled"):
        reasons["enabled"] = "FCM integration toggle is off (integrations.fcm_enabled=false)"

    ready_for_push = (bool(integ.get("fcm_enabled")) and sa_row.get("configured", False)
                      and not missing and bool(vapid))

    # Probe the browser-side token chain with the SAME web API key partners' phones use.
    api_key_check = {"ok": None, "checks": []}
    if not missing:
        try:
            api_key_check = await fcm_service.check_web_api_key(wc)
        except Exception as e:  # noqa: BLE001
            api_key_check = {"ok": None, "checks": [], "reason": str(e)[:200]}
        if api_key_check.get("ok") is False:
            blocked = [c["api"] for c in api_key_check.get("checks", []) if not c.get("ok")]
            reasons["web_api_key"] = ("Web API key is BLOCKED for: " + ", ".join(blocked)
                                      + ". Google Cloud Console → APIs & Services → Credentials → this Browser key → "
                                        "API restrictions → allow 'Firebase Installations API' + 'Firebase Cloud Messaging API' + "
                                        "'FCM Registration API' (or choose 'Don't restrict key'). Partners' phones can't get a push token until then.")
            ready_for_push = False
            await db.settings.update_one({"id": "global"}, {"$set": {"push_key_blocked": True}})
        elif api_key_check.get("ok") is True and s.get("push_key_blocked"):
            # TOKEN AUTO-HEAL: the key just became usable → tell every connected app
            # to silently re-register its push token right now.
            await db.settings.update_one({"id": "global"}, {"$set": {"push_key_blocked": False, "push_key_fixed_at": now_iso()}})
            try:
                from services import realtime as rt
                for uid in await db.users.distinct("id", {"role": {"$in": ["partner", "admin", "merchant"]}}):
                    rt.emit_user(uid, "push_reregister", {"reason": "api_key_fixed"})
            except Exception:  # noqa: BLE001
                pass

    return {
        "ready_for_push": ready_for_push,
        "reasons": reasons,
        "service_account": {
            "configured": sa_row.get("configured", False),
            "project_id": sa_row.get("project_id", ""),
            "updated_at": sa_row.get("updated_at", ""),
        },
        "web_config": {
            "configured": not missing,
            "missing_fields": missing,
            "project_id": wc.get("projectId", ""),
        },
        "vapid_key_configured": bool(vapid),
        "web_api_key": api_key_check,
        "fcm_enabled": bool(integ.get("fcm_enabled")),
        "devices": {"total": devices_total, "by_role": breakdown},
        "online_partners": online_partners,
        "recent_delivery_logs": recent_logs,
        "registration_attempts": reg_rows,
        "partners_without_device": partners_no_device,
    }


async def test_push(admin, data: dict):
    """Send a synthetic push to a specific user so the admin can verify the whole
    chain: SA → web-config → registered device → FCM → device. Also stores an
    in-app notification for foreground/SSE parity."""
    from services.push_dispatch import push_to_user as send_to_user

    user_id = (data or {}).get("user_id", "").strip()
    title = ((data or {}).get("title") or "AzoApp test notification").strip()
    body = ((data or {}).get("body") or "This is a push-delivery test from Admin.").strip()
    link = ((data or {}).get("link") or "/").strip()
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "role": 1, "name": 1, "push_state": 1})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    push_state = u.pop("push_state", None)

    # In-app record (shows in bell dropdown too)
    await db.notifications.insert_one({
        "id": new_id(), "user_id": user_id, "audience": "user",
        "title": title, "body": body, "link": link,
        "data": {"type": "admin_test"}, "read": False, "created_at": now_iso(),
    })
    # Realtime SSE ping (foreground toast)
    try:
        from services import realtime as rt
        rt.emit_user(user_id, "notification",
                     {"title": title, "body": body, "link": link, "type": "admin_test"})
    except Exception:  # noqa: BLE001
        pass
    # Actual push
    result = await send_to_user(user_id, title, body, link, {"type": "admin_test"})
    return {"ok": True, "user": u, "push": result, "push_state": push_state}


async def delivery_logs(user_id: str = "", limit: int = 50):
    q = {}
    if user_id:
        q["user_id"] = user_id
    rows = await db.notification_delivery_logs.find(
        q, {"_id": 0}).sort("created_at", -1).limit(min(max(int(limit or 50), 1), 500)).to_list(500)
    # enrich with user name
    ids = list({r.get("user_id") for r in rows if r.get("user_id")})
    users = {}
    if ids:
        async for u in db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "role": 1}):
            users[u["id"]] = u
    for r in rows:
        r["user"] = users.get(r.get("user_id"))
    return rows
