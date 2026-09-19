"""OTP auth (dev mode) with role auto-detected from phone + admin-controlled demo mode."""
import math
import random
from datetime import datetime, timezone
from config.database import db, now_iso, get_settings
from models.user import build_user


def gen_otp() -> str:
    return f"{random.randint(100000, 999999)}"


def _parse_iso(v):
    if not v:
        return None
    try:
        dt = datetime.fromisoformat(v)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:  # noqa: BLE001
        return None


def _otp_limits(settings: dict) -> dict:
    """Admin-tunable OTP abuse limits (Integration Center). Sensible defaults."""
    g = settings.get("integrations", {}) or {}
    return {
        "cooldown": int(g.get("otp_resend_cooldown_sec", 30) or 30),      # min gap between sends
        "max_sends": int(g.get("otp_max_sends_per_window", 5) or 5),      # sends per window
        "window": int(g.get("otp_send_window_sec", 3600) or 3600),        # rolling window
        "max_attempts": int(g.get("otp_max_verify_attempts", 5) or 5),    # wrong tries per OTP
        "expiry": int(g.get("otp_expiry_sec", 600) or 600),               # OTP validity
    }


async def send_otp(phone: str) -> dict:
    from services.sms_service import send_otp_sms, sms_configured
    settings = await get_settings()
    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    is_demo = bool(user and user.get("is_demo") and settings.get("demo_mode", True))
    configured = await sms_configured()
    fixed_otp = settings.get("demo_otp", "123456")
    lim = _otp_limits(settings)
    now = datetime.now(timezone.utc)
    rec = await db.otps.find_one({"phone": phone}, {"_id": 0})
    # Rate limiting protects the LIVE SMS gateway from abuse — enforced ONLY on the
    # real-send path (demo / dev-mode numbers never hit the gateway).
    enforce = configured and not is_demo
    if enforce and rec:
        last = _parse_iso(rec.get("sent_at"))
        if last:
            wait = lim["cooldown"] - (now - last).total_seconds()
            if wait > 0:
                w = int(math.ceil(wait))
                return {"sent": False, "error": "cooldown", "retry_after": w,
                        "message": f"Please wait {w}s before requesting another OTP."}
        win_start = _parse_iso(rec.get("window_start")) or now
        if (now - win_start).total_seconds() <= lim["window"] and int(rec.get("send_count", 0)) >= lim["max_sends"]:
            w = max(int(math.ceil(lim["window"] - (now - win_start).total_seconds())), 1)
            return {"sent": False, "error": "rate_limited", "retry_after": w,
                    "message": "Too many OTP requests from this number. Please try again later."}

    otp = fixed_otp if (is_demo or not configured) else gen_otp()
    base = {"phone": phone, "otp": otp, "created_at": now.isoformat(), "attempts": 0}

    # Real SMS via Fast2SMS when configured (non-demo numbers only) and the OTP
    # template is active (admin can disable OTP SMS from SMS Templates).
    if configured and not is_demo:
        from services.sms_templates_service import is_event_active
        sent_ok = await is_event_active("send_otp") and await send_otp_sms(phone, otp)
        if not sent_ok:
            # Delivery FAILED — store the OTP for verify but DO NOT start the resend
            # cooldown or count it against the window, so the user can retry at once.
            await db.otps.update_one({"phone": phone}, {"$set": base}, upsert=True)
            return {"sent": False, "error": "sms_failed",
                    "message": "Could not send the OTP right now. Please try again."}
        # SUCCESS → now start the resend cooldown + rolling-window accounting.
        win_start = _parse_iso(rec.get("window_start")) if rec else None
        count = int(rec.get("send_count", 0)) if rec else 0
        if not win_start or (now - win_start).total_seconds() > lim["window"]:
            win_start, count = now, 0
        base.update({"sent_at": now.isoformat(), "window_start": win_start.isoformat(), "send_count": count + 1})
        await db.otps.update_one({"phone": phone}, {"$set": base}, upsert=True)
        return {"sent": True, "otp_delivery": "sms", "message": "OTP sent to your mobile via SMS"}

    # DEV / fallback mode: no live SMS gateway configured (or a demo account) — the
    # OTP is returned in the response so the app stays fully usable without a gateway.
    base["sent_at"] = now.isoformat()
    await db.otps.update_one({"phone": phone}, {"$set": base}, upsert=True)
    return {"sent": True, "dev_otp": otp, "message": "OTP sent (dev mode · use 123456 until SMS is configured)"}


async def verify_otp(phone: str, otp: str, name: str = None, create_if_new: bool = True, role: str = None) -> dict:
    settings = await get_settings()
    user = await db.users.find_one({"phone": phone}, {"_id": 0})

    # Demo accounts blocked when admin disables demo mode
    if user and user.get("is_demo") and not settings.get("demo_mode", True):
        return {"ok": False, "reason": "demo_disabled"}
    if user and user.get("deleted"):
        return {"ok": False, "reason": "deleted"}

    lim = _otp_limits(settings)
    is_demo_ok = bool(user and user.get("is_demo") and settings.get("demo_mode", True)
                      and otp == settings.get("demo_otp", "123456"))
    rec = await db.otps.find_one({"phone": phone}, {"_id": 0})
    # OTP expiry (skip for the demo fixed OTP which is always valid while demo mode is on).
    if rec and not is_demo_ok:
        created = _parse_iso(rec.get("created_at"))
        if created and (datetime.now(timezone.utc) - created).total_seconds() > lim["expiry"]:
            await db.otps.delete_one({"phone": phone})
            return {"ok": False, "reason": "otp_expired"}
    # Brute-force throttle: too many wrong tries on the same OTP → force a resend.
    if rec and not is_demo_ok and int(rec.get("attempts", 0)) >= lim["max_attempts"]:
        return {"ok": False, "reason": "too_many_attempts"}
    valid = bool(rec and rec.get("otp") == otp) or is_demo_ok
    if not valid:
        if rec:
            await db.otps.update_one({"phone": phone}, {"$inc": {"attempts": 1}})
        return {"ok": False, "reason": "invalid_otp"}

    # Suspended partners cannot log in until suspend_until passes (auto-reactivate on expiry).
    if user and user.get("suspended"):
        until = user.get("suspend_until")
        expired = False
        if until:
            try:
                expired = datetime.fromisoformat(until) <= datetime.now(timezone.utc)
            except Exception:  # noqa: BLE001
                expired = False
        if expired:
            await db.users.update_one({"id": user["id"]}, {"$set": {"suspended": False}, "$unset": {
                "suspend_reason": "", "suspend_until": "", "suspend_days": "",
                "suspended_at": "", "suspended_by": ""}})
            user["suspended"] = False
        else:
            return {"ok": False, "reason": "suspended",
                    "suspend_reason": user.get("suspend_reason"),
                    "suspend_until": until}

    created = False
    if not user:
        # New number. When the caller only wants to CHECK (create_if_new=False),
        # do NOT create the account and do NOT consume the OTP — the frontend will
        # collect the name and re-verify with create_if_new=True. This keeps
        # "create only after OTP verify + name" and avoids duplicate accounts.
        if not create_if_new:
            return {"ok": True, "user": None, "created": False, "new_user": True}
        # role is client-supplied ONLY for explicit partner/merchant registration;
        # unknown phones otherwise default to customer.
        new_role = role if role in ("partner", "merchant") else "customer"
        user = build_user(phone, new_role, name or "")
        await db.users.insert_one(dict(user))
        user.pop("_id", None)
        created = True
    else:
        # A registration attempt whose role conflicts with the existing account.
        if role in ("partner", "merchant") and user.get("role") != role:
            return {"ok": False, "reason": "role_mismatch", "existing_role": user.get("role")}
        if user.get("is_guest"):
            # A guest-created account is now a real, verified customer.
            await db.users.update_one({"id": user["id"]}, {"$set": {"is_guest": False}})
            user["is_guest"] = False
    await db.otps.delete_one({"phone": phone})
    try:
        await db.users.update_one({"id": user["id"]}, {"$set": {"last_login_at": now_iso()}})
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "user": user, "created": created, "new_user": False}


async def demo_status() -> dict:
    settings = await get_settings()
    if not settings.get("demo_mode", True):
        return {"demo_mode": False, "accounts": []}
    demos = await db.users.find({"is_demo": True}, {"_id": 0, "role": 1, "phone": 1, "name": 1}).to_list(20)
    order = {"customer": 0, "partner": 1, "merchant": 2, "admin": 3}
    demos.sort(key=lambda d: order.get(d["role"], 9))
    for d in demos:
        d["otp"] = settings.get("demo_otp", "123456")
    return {"demo_mode": True, "accounts": demos}
