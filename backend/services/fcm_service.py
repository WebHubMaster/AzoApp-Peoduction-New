"""Firebase Cloud Messaging (web push). Service-account JSON is stored encrypted
in the `fcm_config` collection and configured by admin at runtime. Fully functional
once a valid service-account JSON is saved.
"""
import os
import json
import hashlib
import asyncio
import threading
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
from fastapi import HTTPException
from config.database import db, now_iso, get_settings
from models.user import new_id

load_dotenv(Path(__file__).parent.parent / '.env')

_fernet = None


async def _resolve_encryption_key() -> str:
    """Resolve the Fernet key used to encrypt the FCM service-account at rest.

    Priority:
    1. FCM_CONFIG_ENCRYPTION_KEY env var — explicit override (backward compatible).
    2. Otherwise a key is auto-generated ONCE and persisted in `db.app_secrets`, so
       it stays stable across restarts/redeploys and EVERY fresh server works out of
       the box (no manual env setup needed before uploading Firebase credentials).
    """
    from cryptography.fernet import Fernet
    env_key = os.environ.get("FCM_CONFIG_ENCRYPTION_KEY", "")
    if env_key:
        return env_key
    row = await db.app_secrets.find_one({"_id": "fcm_config_encryption_key"})
    if row and row.get("key"):
        return row["key"]
    # Generate & persist atomically ($setOnInsert => concurrent workers can't clobber).
    new_key = Fernet.generate_key().decode()
    try:
        await db.app_secrets.update_one(
            {"_id": "fcm_config_encryption_key"},
            {"$setOnInsert": {"_id": "fcm_config_encryption_key", "key": new_key,
                              "created_at": now_iso()}},
            upsert=True,
        )
    except Exception:  # noqa: BLE001
        pass
    row = await db.app_secrets.find_one({"_id": "fcm_config_encryption_key"})
    return (row or {}).get("key", new_key)


async def _get_fernet():
    global _fernet
    if _fernet is None:
        from cryptography.fernet import Fernet
        key = await _resolve_encryption_key()
        try:
            _fernet = Fernet(key.encode())
        except Exception:
            raise HTTPException(503, "FCM encryption key is invalid. FCM_CONFIG_ENCRYPTION_KEY must be a valid 32-byte url-safe base64 Fernet key.")
    return _fernet


async def save_service_account(service_account_json: str) -> dict:
    try:
        # Some browsers / editors ship the JSON with a UTF-8 BOM or surrounding
        # whitespace which makes `json.loads` fail with a cryptic "Expecting
        # value: line 1 column 1 (char 0)". Strip both before parsing.
        raw = (service_account_json or "").strip().lstrip("\ufeff")
        if not raw:
            raise ValueError("Empty file")
        sa = json.loads(raw)
        required = {"type", "project_id", "private_key", "client_email"}
        missing = required - set(sa.keys())
        if sa.get("type") != "service_account":
            raise ValueError("Not a Firebase service-account JSON (\"type\" must be \"service_account\")")
        if missing:
            raise ValueError(f"Missing required fields: {', '.join(sorted(missing))}")
        # Some copy-paste flows escape newlines inside private_key as literal
        # "\\n"; firebase-admin needs real newlines. Normalise both variants.
        pk = sa.get("private_key", "")
        if "\\n" in pk and "\n" not in pk:
            sa["private_key"] = pk.replace("\\n", "\n")
        _init_app(sa)  # validates the private key / project
    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"Invalid FCM service-account JSON: not valid JSON ({e.msg} at line {e.lineno})")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Invalid FCM service-account JSON: {e}")

    enc = (await _get_fernet()).encrypt(json.dumps(sa).encode()).decode()
    await db.fcm_config.replace_one(
        {"_id": "default"},
        {"_id": "default", "project_id": sa["project_id"],
         "encrypted": enc, "updated_at": datetime.now(timezone.utc).isoformat()},
        upsert=True)
    return {"ok": True, "project_id": sa["project_id"]}


async def config_status() -> dict:
    # Server-side encryption readiness (spec: Firebase config health check). Never
    # exposes the key itself — only whether it is present & valid. The key is now
    # auto-provisioned (env override OR persisted auto-generated key), so this is
    # ready out of the box on every fresh server.
    enc_ready = False
    try:
        await _get_fernet()
        enc_ready = True
    except Exception:  # noqa: BLE001
        enc_ready = False
    row = await db.fcm_config.find_one({"_id": "default"})
    if not row:
        return {"configured": False, "encryption_ready": enc_ready}
    return {"configured": True, "project_id": row.get("project_id"),
            "updated_at": row.get("updated_at"),
            "has_service_account": bool(row.get("encrypted")),
            "encryption_ready": enc_ready,
            "filename": f"{row.get('project_id', 'firebase')}-service-account.json"}


async def get_service_account_json() -> str:
    """Return the stored service-account JSON string (decrypted) for admin download."""
    sa = await _load_service_account()
    if not sa:
        return None
    return json.dumps(sa, indent=2)


async def _load_service_account() -> dict:
    row = await db.fcm_config.find_one({"_id": "default"})
    if not row:
        return None
    try:
        return json.loads((await _get_fernet()).decrypt(row["encrypted"].encode()))
    except Exception:  # noqa: BLE001
        return None


_lock = threading.Lock()
_app = None
_fingerprint = None


def _init_app(service_account: dict):
    global _app, _fingerprint
    import firebase_admin
    from firebase_admin import credentials
    fp = hashlib.sha256(json.dumps(service_account, sort_keys=True).encode()).hexdigest()
    with _lock:
        if _app and _fingerprint == fp:
            return _app
        try:
            old = firebase_admin.get_app("azo-fcm")
            firebase_admin.delete_app(old)
        except ValueError:
            pass
        _app = firebase_admin.initialize_app(
            credentials.Certificate(service_account),
            {"projectId": service_account["project_id"]}, name="azo-fcm")
        _fingerprint = fp
        return _app


async def check_web_api_key(web_config: dict) -> dict:
    """Server-side probe of the browser-side token chain: the Web API key must be
    allowed to call Firebase Installations + FCM Registrations. Google Cloud
    'API restrictions' on the key are the #1 reason getToken() fails on partners'
    phones (error: installations/request-failed). Returns {ok, checks:[...]}."""
    import base64
    import secrets
    import urllib.request
    import urllib.error
    wc = web_config or {}
    api_key, project_id, app_id = wc.get("apiKey"), wc.get("projectId"), wc.get("appId")
    if not (api_key and project_id and app_id):
        return {"ok": False, "checks": [], "reason": "web_config_incomplete"}

    def _probe(name, url, body):
        req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": "application/json", "x-goog-api-key": api_key})
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return {"api": name, "ok": True, "status": r.status, "detail": ""}
        except urllib.error.HTTPError as e:
            raw = e.read().decode(errors="ignore")
            try:
                err = json.loads(raw).get("error", {})
                reason = next((d.get("reason") for d in err.get("details", []) if isinstance(d, dict) and d.get("reason")), "")
                msg = err.get("message", "")
            except Exception:  # noqa: BLE001
                reason, msg = "", raw[:300]
            blocked = e.code == 403 and (reason in ("API_KEY_SERVICE_BLOCKED", "SERVICE_DISABLED", "API_KEY_INVALID", "API_KEY_HTTP_REFERRER_BLOCKED") or "blocked" in msg.lower() or "disabled" in msg.lower())
            # a 400/401/404 means the key was ACCEPTED by the API (our probe body is intentionally minimal)
            return {"api": name, "ok": not blocked, "status": e.code, "reason": reason, "detail": msg[:300]}
        except Exception as e:  # noqa: BLE001
            return {"api": name, "ok": False, "status": 0, "reason": "network", "detail": str(e)[:200]}

    fid = base64.urlsafe_b64encode(secrets.token_bytes(17)).decode().rstrip("=")[:22]
    checks = await asyncio.gather(
        asyncio.to_thread(_probe, "Firebase Installations API",
                          f"https://firebaseinstallations.googleapis.com/v1/projects/{project_id}/installations",
                          {"fid": fid, "appId": app_id, "authVersion": "FIS_v2", "sdkVersion": "w:0.6.4"}),
        asyncio.to_thread(_probe, "FCM Registration API",
                          f"https://fcmregistrations.googleapis.com/v1/projects/{project_id}/registrations",
                          {"web": {"endpoint": "https://example.invalid", "p256dh": "x", "auth": "y"}}),
    )
    checks = list(checks)
    return {"ok": all(c["ok"] for c in checks), "checks": checks}


# ---------------------------------------------------------------------------
#  google-services.json (Android client config) — uploaded from Admin so the
#  admin can keep the mobile Firebase client config on record AND auto-fill the
#  browser web-push config (apiKey/projectId/appId/senderId/etc.) from it.
# ---------------------------------------------------------------------------
_FCM_FIELD_MAP = {
    "apiKey": "fcm_api_key", "authDomain": "fcm_auth_domain",
    "projectId": "fcm_project_id", "storageBucket": "fcm_storage_bucket",
    "messagingSenderId": "fcm_messaging_sender_id", "appId": "fcm_app_id",
}


def _derive_web_config(gs: dict, package_name: str = None) -> dict:
    """Build the Firebase JS web-config from a google-services.json. Picks the
    client matching `package_name` (falls back to the first Android client)."""
    pinfo = gs.get("project_info", {}) or {}
    clients = gs.get("client", []) or []
    chosen = None
    if package_name:
        for c in clients:
            if (c.get("client_info", {}).get("android_client_info", {}) or {}).get("package_name") == package_name:
                chosen = c
                break
    if not chosen and clients:
        chosen = clients[0]
    api_key, app_id = "", ""
    if chosen:
        keys = chosen.get("api_key", []) or []
        api_key = (keys[0].get("current_key") if keys else "") or ""
        app_id = (chosen.get("client_info", {}) or {}).get("mobilesdk_app_id", "") or ""
    project_id = pinfo.get("project_id", "") or ""
    return {
        "apiKey": api_key,
        "authDomain": f"{project_id}.firebaseapp.com" if project_id else "",
        "projectId": project_id,
        "storageBucket": pinfo.get("storage_bucket", "") or "",
        "messagingSenderId": pinfo.get("project_number", "") or "",
        "appId": app_id,
    }


async def save_google_services(raw: str, package_name: str = None) -> dict:
    """Validate + store google-services.json and auto-configure the web-push
    config (integrations.fcm_web_config + individual fcm_* fields) from it."""
    txt = (raw or "").strip().lstrip("\ufeff")
    if not txt:
        raise HTTPException(400, "Empty google-services.json")
    try:
        gs = json.loads(txt)
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"Invalid google-services.json: not valid JSON ({e.msg} at line {e.lineno})")
    if not isinstance(gs, dict) or "project_info" not in gs or "client" not in gs:
        raise HTTPException(400, 'Not a valid google-services.json ("project_info"/"client" missing)')
    packages = [(c.get("client_info", {}).get("android_client_info", {}) or {}).get("package_name", "")
                for c in gs.get("client", [])]
    packages = [p for p in packages if p]
    web_config = _derive_web_config(gs, package_name)
    ts = now_iso()
    await db.fcm_config.update_one(
        {"_id": "google_services"},
        {"$set": {"_id": "google_services", "raw": txt, "project_id": web_config["projectId"],
                  "packages": packages, "web_config": web_config, "updated_at": ts}},
        upsert=True)
    # Persist into settings so browser web-push auto-configures out of the box.
    try:
        upd = {"integrations.fcm_web_config": web_config, "integrations.fcm_enabled": True}
        for js_key, val in web_config.items():
            flat = _FCM_FIELD_MAP.get(js_key)
            if flat:
                upd[f"integrations.{flat}"] = val
        await db.settings.update_one({"id": "global"}, {"$set": upd}, upsert=True)
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "project_id": web_config["projectId"], "packages": packages, "web_config": web_config}


async def google_services_status() -> dict:
    row = await db.fcm_config.find_one({"_id": "google_services"})
    if not row:
        return {"configured": False}
    return {"configured": True, "project_id": row.get("project_id"),
            "packages": row.get("packages", []), "updated_at": row.get("updated_at"),
            "web_config": row.get("web_config", {})}


async def get_google_services_json() -> str:
    row = await db.fcm_config.find_one({"_id": "google_services"})
    return row.get("raw") if row else None


async def register_device(user_id: str, token: str, user_agent: str = "",
                          device_id: str = "", platform: str = "", browser: str = "",
                          permission_status: str = "granted"):
    """Register / refresh THIS physical device's push token for the user.

    Multi-device (spec #13): a user may have many active devices — we NEVER delete
    the user's other devices here. Each device is keyed by a stable `device_id`
    (persisted client-side) so a token REFRESH (spec #11) updates the SAME record
    instead of creating duplicates or orphaning the old one. When another account
    logs in on the same physical device (spec #12) that device is detached from the
    previous user so the old account's channel is not reused.
    """
    did = (device_id or "").strip() or token  # stable identity; fall back to raw token
    ts = now_iso()
    # (#12) This physical device now belongs to THIS user — detach from any other account.
    await db.fcm_devices.delete_many({"device_id": did, "user_id": {"$ne": user_id}})
    # (#10/#11) One record per (user, device); token refresh updates it, device stays active.
    await db.fcm_devices.update_one(
        {"user_id": user_id, "device_id": did},
        {"$set": {"user_id": user_id, "device_id": did, "token": token,
                  "user_agent": user_agent[:300], "platform": (platform or "")[:40],
                  "browser": (browser or "")[:60], "permission_status": (permission_status or "")[:20],
                  "is_active": True, "last_seen_at": ts, "last_token_at": ts, "updated_at": ts},
         "$setOnInsert": {"id": new_id(), "created_at": ts}},
        upsert=True)
    # (#11) Token uniqueness — if this exact token lingered on a different device row
    # (token migrated), drop those stale duplicates (but never the row we just wrote).
    await db.fcm_devices.delete_many(
        {"token": token, "$or": [{"user_id": {"$ne": user_id}}, {"device_id": {"$ne": did}}]})
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"push_state": {"ok": True, "reason": "registered", "error": "",
                                 "permission": "granted", "user_agent": user_agent[:200],
                                 "at": ts}}})
    return {"ok": True}


async def list_devices(user_id: str):
    rows = await db.fcm_devices.find(
        {"user_id": user_id, "is_active": {"$ne": False}}, {"_id": 0, "token": 0}).to_list(50)
    return rows


async def record_push_status(user_id: str, body: dict):
    """Persist the browser-side registration outcome (ok / reason / error)."""
    state = {
        "ok": bool(body.get("ok")),
        "reason": str(body.get("reason") or "")[:60],
        "error": str(body.get("error") or "")[:300],
        "permission": str(body.get("permission") or "")[:20],
        "platform": str(body.get("platform") or "")[:20],
        "user_agent": str(body.get("user_agent") or "")[:200],
        "at": now_iso(),
    }
    await db.users.update_one({"id": user_id}, {"$set": {"push_state": state}})
    try:
        await db.push_registration_logs.insert_one({"id": new_id(), "user_id": user_id, **state})
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True}


async def record_ring_status(user_id: str, body: dict):
    """Persist whether the call-style Job Ring actually rendered on a device.
    Updates the user's ring_state (in-app 'Alert check' card), stamps the matching
    device row with last_ring_at (admin per-device visibility) and appends a compact
    log the admin Diagnostics 'Recent Job-Ring deliveries' table reads."""
    b = body or {}
    did = str(b.get("device_id") or "")[:80]
    state = {
        "ok": bool(b.get("ok")),
        "ctx": str(b.get("ctx", ""))[:16],       # "bg" (closed/locked) | "fg" (open)
        "mode": str(b.get("mode", ""))[:24],     # "fgs" | "no_fgs" | "failed"
        "error": str(b.get("error", ""))[:300],
        "fsi": b.get("fsi"),                      # full-screen-intent permission granted?
        "booking_id": str(b.get("booking_id", ""))[:64],
        "device_id": did,
        "at": now_iso(),
    }
    await db.users.update_one({"id": user_id}, {"$set": {"ring_state": state}})
    if did:
        await db.fcm_devices.update_one(
            {"user_id": user_id, "device_id": did},
            {"$set": {"last_ring_at": state["at"], "last_ring_ok": state["ok"],
                      "last_ring_ctx": state["ctx"], "last_ring_mode": state["mode"]}})
    try:
        await db.ring_status_logs.insert_one({"id": new_id(), "user_id": user_id, **state})
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "ring_state": state}


async def recent_ring_events(limit: int = 30):
    """Recent Job-Ring delivery reports with the reporting user attached (admin diag)."""
    rows = await db.ring_status_logs.find({}, {"_id": 0}).sort("at", -1).limit(limit).to_list(limit)
    ids = list({r.get("user_id") for r in rows if r.get("user_id")})
    umap = {}
    if ids:
        async for u in db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "role": 1, "phone": 1}):
            umap[u["id"]] = u
    for r in rows:
        r["user"] = umap.get(r.get("user_id"))
    return rows


async def deactivate_stale_devices(days: int = 45) -> int:
    """Auto-cleanup: mark devices not seen in `days` days as inactive so 'registered
    devices' counts + online-device lists stay accurate (an uninstalled/logged-out
    phone stops being counted). Never hard-deletes — history is kept."""
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    res = await db.fcm_devices.update_many(
        {"is_active": {"$ne": False}, "last_seen_at": {"$lt": cutoff}},
        {"$set": {"is_active": False, "permission_status": "stale", "updated_at": now_iso()}})
    return res.modified_count


async def _log_delivery(user_id, title, status, detail="", tokens=0, success=0, failure=0):
    """Persist a compact per-recipient push delivery record so admins can see who
    got a notification, how many devices, and the exact failure reason. (spec 15)"""
    try:
        await db.notification_delivery_logs.insert_one({
            "id": new_id(), "user_id": user_id, "title": title,
            "status": status, "detail": str(detail)[:300],
            "tokens": tokens, "success": success, "failure": failure,
            "created_at": now_iso()})
    except Exception:  # noqa: BLE001
        pass


def _abs_link(link: str):
    """firebase-admin's WebpushFCMOptions.link MUST be an absolute HTTPS URL.
    Callers pass app-relative paths like '/partner' — convert them using the
    public app origin. Returns None when no base URL is configured so we simply
    omit the click-through link instead of failing the whole push."""
    link = (link or "/").strip()
    if link.startswith("https://"):
        return link
    if link.startswith("http://"):
        return "https://" + link[len("http://"):]
    base = (os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("PUBLIC_APP_URL") or "").rstrip("/")
    if not base.startswith("https://"):
        return None
    if not link.startswith("/"):
        link = "/" + link
    return base + link


async def _notif_icon():
    """The small notification icon shown in push notifications. Uses the Favicon
    configured by admin in Branding/Theme so every push (customer/partner/merchant)
    carries the app's own icon. Falls back to the bundled logo when unset."""
    try:
        s = await get_settings()
        fav = ((s or {}).get("branding") or {}).get("favicon") or ""
        fav = (fav or "").strip()
        if not fav:
            return "/logo192.png"
        if fav.startswith("http://") or fav.startswith("https://") or fav.startswith("/"):
            # absolute URL or same-origin path → usable as-is by the service worker
            return _abs_link(fav) or fav
        return _abs_link("/" + fav) or "/logo192.png"
    except Exception:
        return "/logo192.png"


async def send_to_user(user_id: str, title: str, body: str, link: str = "/", data: dict = None, image: str = None, data_only: bool = False):
    """Best-effort push (supports an optional image/banner). Returns counts; never raises.
    When data_only=True, no notification block is sent so the service worker's
    onBackgroundMessage fires (lets us render custom action buttons e.g. Accept/Reject)."""
    sa = await _load_service_account()
    if not sa:
        await _log_delivery(user_id, title, "skipped", "FCM service account not configured")
        return {"success": 0, "failure": 0, "skipped": "not_configured"}
    rows = await db.fcm_devices.find({"user_id": user_id, "is_active": {"$ne": False}}).to_list(500)
    if not rows:
        await _log_delivery(user_id, title, "skipped", "No registered device/token for user")
        return {"success": 0, "failure": 0, "skipped": "no_devices"}
    tokens = [r["token"] for r in rows]
    # FCM/webpush can only fetch a fully-qualified https image (Android 15+ also
    # blocks cleartext). Upgrade any http image so the banner actually renders.
    if image and image.startswith("http://"):
        image = "https://" + image[len("http://"):]
    try:
        from firebase_admin import messaging
        app = _init_app(sa)
        icon = await _notif_icon()
        data_payload = {"link": link, "icon": icon, **({"image": image} if image else {}),
                        **{k: str(v) for k, v in (data or {}).items()}}
        web_link = _abs_link(link)
        web_opts = messaging.WebpushFCMOptions(link=web_link) if web_link else None
        chan = (data or {}).get("android_channel")
        tag = (data or {}).get("tag")
        android = messaging.AndroidConfig(
            priority="high",
            collapse_key=str(tag) if tag else None,
            notification=None if data_only else messaging.AndroidNotification(
                channel_id=str(chan) if chan else None, tag=str(tag) if tag else None,
                image=image or None,
                sound="default", click_action="OPEN_CHAT" if (data or {}).get("type") == "chat_message" else None))
        if data_only:
            msg = messaging.MulticastMessage(
                tokens=tokens,
                data=data_payload,
                android=android,
                webpush=messaging.WebpushConfig(
                    headers={"Urgency": "high", "TTL": "600"},
                    fcm_options=web_opts))
        else:
            msg = messaging.MulticastMessage(
                tokens=tokens,
                notification=messaging.Notification(title=title, body=body, image=image or None),
                data=data_payload,
                android=android,
                apns=messaging.APNSConfig(payload=messaging.APNSPayload(
                    aps=messaging.Aps(sound="default", thread_id=str(tag) if tag else None))),
                webpush=messaging.WebpushConfig(
                    notification=messaging.WebpushNotification(
                        title=title, body=body,
                        icon=icon, badge=icon, image=image or None),
                    fcm_options=web_opts))
        resp = await asyncio.to_thread(
            messaging.send_each_for_multicast, msg, False, app)
        invalid = []
        mismatch = False
        for tok, r in zip(tokens, resp.responses):
            if not r.success:
                code = getattr(r.exception, "code", "") or ""
                emsg = str(getattr(r, "exception", "") or "").lower()
                if code in {"messaging/registration-token-not-registered",
                            "messaging/invalid-registration-token"}:
                    invalid.append(tok)
                elif (code in {"messaging/mismatched-credential",
                               "messaging/sender-id-mismatch",
                               "messaging/third-party-auth-error"}
                      or "senderid mismatch" in emsg or "sender id mismatch" in emsg
                      or "mismatched" in emsg):
                    # SenderId mismatch = the service-account project != the project
                    # that issued the device token. The token is VALID, so do NOT
                    # deactivate it — the fix is uploading the matching service-account.
                    mismatch = True
        if invalid:
            # (#11/#12) Deactivate dead tokens rather than hard-deleting — keeps the
            # device history and stops it counting as "registered" or receiving pushes.
            await db.fcm_devices.update_many(
                {"token": {"$in": invalid}},
                {"$set": {"is_active": False, "permission_status": "unregistered",
                          "updated_at": now_iso()}})
        if mismatch:
            detail = ("SenderId mismatch: the uploaded Firebase service-account is from a "
                      "DIFFERENT project than the device token. Upload the service-account for "
                      "project azo-project-9f857 (sender 960503871336) so delivery succeeds.")
        elif invalid:
            detail = f"{len(invalid)} invalid token(s) removed"
        else:
            detail = ""
        await _log_delivery(user_id, title,
                            "sent" if resp.success_count else "failed",
                            detail,
                            tokens=len(tokens), success=resp.success_count, failure=resp.failure_count)
        return {"success": resp.success_count, "failure": resp.failure_count}
    except Exception as e:  # noqa: BLE001
        await _log_delivery(user_id, title, "error", str(e), tokens=len(tokens), failure=len(tokens))
        return {"success": 0, "failure": len(tokens), "error": str(e)[:200]}
