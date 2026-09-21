"""Standard VAPID Web Push (RFC 8030 / 8291).

Unlike Firebase Cloud Messaging (which needs the Firebase Installations API to be
un-blocked in Google Cloud), standard Web Push works with SELF-GENERATED VAPID keys
and delivers straight to the browser's own push service (Chrome→FCM endpoint,
Firefox→autopush, Safari→APNs). No external account / API key is required.

Keys are generated ONCE and persisted in `db.app_secrets` so they stay stable across
restarts. Browser PushSubscriptions are stored in `db.webpush_subs`, keyed by a stable
per-browser `device_id`, so a re-subscribe updates the SAME record (no orphans).

The service-worker (`/firebase-messaging-sw.js`) already understands the FCM-style
payload `{notification, data, fcmOptions}`, so we send exactly that shape here — the
same notification renders whether it arrived via FCM or via standard Web Push.
"""
import os
import json
import asyncio
import base64
from pathlib import Path
from dotenv import load_dotenv
from config.database import db, now_iso, get_settings
from models.user import new_id

load_dotenv(Path(__file__).parent.parent / '.env')

_vapid_cache = None


async def _get_vapid() -> dict:
    """Load (or one-time generate) the VAPID keypair.
    Returns {private_pem, public_key(applicationServerKey b64url), sub}."""
    global _vapid_cache
    if _vapid_cache:
        return _vapid_cache
    row = await db.app_secrets.find_one({"_id": "webpush_vapid"})
    if not row or not row.get("private_pem") or not row.get("public_key"):
        from py_vapid import Vapid01
        from cryptography.hazmat.primitives import serialization
        v = Vapid01()
        v.generate_keys()
        priv_pem = v.private_pem().decode()
        raw = v.public_key.public_bytes(
            serialization.Encoding.X962,
            serialization.PublicFormat.UncompressedPoint)
        public_key = base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
        doc = {"_id": "webpush_vapid", "private_pem": priv_pem,
               "public_key": public_key, "created_at": now_iso()}
        try:
            await db.app_secrets.update_one(
                {"_id": "webpush_vapid"}, {"$setOnInsert": doc}, upsert=True)
        except Exception:  # noqa: BLE001
            pass
        row = await db.app_secrets.find_one({"_id": "webpush_vapid"}) or doc
    _vapid_cache = row
    return row


def _sub_claim() -> str:
    base = (os.environ.get("REACT_APP_BACKEND_URL") or "").strip()
    if base.startswith("https://") or base.startswith("http://"):
        # A valid https origin is an acceptable `aud`/`sub` for VAPID.
        return base.rstrip("/")
    return "mailto:admin@azoapp.com"


async def public_key() -> str:
    v = await _get_vapid()
    return v.get("public_key", "")


async def subscribe(user_id: str, sub: dict, *, device_id: str = "",
                    user_agent: str = "", platform: str = "", browser: str = "") -> dict:
    """Store the browser PushSubscription for this user + device."""
    sub = sub or {}
    endpoint = (sub.get("endpoint") or "").strip()
    keys = sub.get("keys") or {}
    p256dh = (keys.get("p256dh") or "").strip()
    auth = (keys.get("auth") or "").strip()
    if not endpoint or not p256dh or not auth:
        return {"ok": False, "error": "invalid_subscription"}
    did = (device_id or "").strip() or endpoint
    ts = now_iso()
    # This physical device now belongs to THIS user — detach from any other account.
    await db.webpush_subs.delete_many({"device_id": did, "user_id": {"$ne": user_id}})
    # Same endpoint may only belong to one (user, device) record.
    await db.webpush_subs.delete_many(
        {"endpoint": endpoint, "$or": [{"user_id": {"$ne": user_id}}, {"device_id": {"$ne": did}}]})
    await db.webpush_subs.update_one(
        {"user_id": user_id, "device_id": did},
        {"$set": {"user_id": user_id, "device_id": did, "endpoint": endpoint,
                  "p256dh": p256dh, "auth": auth, "user_agent": user_agent[:300],
                  "platform": (platform or "")[:40], "browser": (browser or "")[:60],
                  "is_active": True, "last_seen_at": ts, "updated_at": ts},
         "$setOnInsert": {"id": new_id(), "created_at": ts}},
        upsert=True)
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"push_state": {"ok": True, "reason": "registered", "error": "",
                                 "permission": "granted", "channel": "webpush",
                                 "user_agent": user_agent[:200], "at": ts}}})
    return {"ok": True}


async def list_subs(user_id: str):
    rows = await db.webpush_subs.find(
        {"user_id": user_id, "is_active": {"$ne": False}},
        {"_id": 0, "endpoint": 0, "p256dh": 0, "auth": 0}).to_list(50)
    return rows


async def count_subs(user_id: str) -> int:
    return await db.webpush_subs.count_documents(
        {"user_id": user_id, "is_active": {"$ne": False}})


def _send_one(sub_info: dict, payload: str, priv_pem: str, claims: dict):
    """Blocking single web-push send. Returns (ok, status, error)."""
    from pywebpush import webpush, WebPushException
    try:
        webpush(subscription_info=sub_info, data=payload,
                vapid_private_key=priv_pem, vapid_claims=dict(claims),
                ttl=600)
        return (True, 201, "")
    except WebPushException as e:  # noqa: BLE001
        status = None
        try:
            status = e.response.status_code if e.response is not None else None
        except Exception:  # noqa: BLE001
            status = None
        return (False, status, str(e)[:200])
    except Exception as e:  # noqa: BLE001
        return (False, None, str(e)[:200])


async def send_to_user(user_id: str, title: str, body: str, link: str = "/",
                       data: dict = None, image: str = None, data_only: bool = False):
    """Best-effort standard Web Push to every registered browser of the user.
    Never raises. Returns {success, failure, ...}."""
    rows = await db.webpush_subs.find(
        {"user_id": user_id, "is_active": {"$ne": False}}).to_list(500)
    if not rows:
        return {"success": 0, "failure": 0, "skipped": "no_subs"}
    v = await _get_vapid()
    priv_pem = v.get("private_pem", "")
    claims = {"sub": _sub_claim()}

    from services.fcm_service import _abs_link, _notif_icon  # reuse helpers
    icon = await _notif_icon()
    web_link = _abs_link(link) or link
    if image and image.startswith("http://"):
        image = "https://" + image[len("http://"):]
    data_payload = {"link": link, "icon": icon, **({"image": image} if image else {}),
                    **{k: str(val) for k, val in (data or {}).items()}}
    if data_only:
        payload = {"data": data_payload, "fcmOptions": {"link": web_link}}
    else:
        payload = {
            "notification": {"title": title, "body": body, "icon": icon,
                             "badge": icon, **({"image": image} if image else {})},
            "data": data_payload,
            "fcmOptions": {"link": web_link},
        }
    payload_str = json.dumps(payload)

    tasks = [asyncio.to_thread(
        _send_one,
        {"endpoint": r["endpoint"], "keys": {"p256dh": r["p256dh"], "auth": r["auth"]}},
        payload_str, priv_pem, claims) for r in rows]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    success = 0
    dead_endpoints = []
    for r, res in zip(rows, results):
        if isinstance(res, tuple):
            ok, status, _err = res
            if ok:
                success += 1
            elif status in (404, 410):
                dead_endpoints.append(r["endpoint"])
    if dead_endpoints:
        # 404/410 = subscription permanently gone → deactivate so it stops
        # counting as "registered" and receiving pushes.
        await db.webpush_subs.update_many(
            {"endpoint": {"$in": dead_endpoints}},
            {"$set": {"is_active": False, "updated_at": now_iso()}})
    return {"success": success, "failure": len(rows) - success,
            "channel": "webpush", "removed": len(dead_endpoints)}
