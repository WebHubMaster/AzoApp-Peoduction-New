from fastapi import HTTPException
import hashlib as _hashlib, os as _os, random as _random, time as _time
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from config.database import db, get_settings, now_iso
from services import auth_service
from middleware.auth import create_token
from models.user import AddressModel, new_id, build_user
from services import profile_audit_service as pa


async def get_config():
    s = await get_settings()
    integ = s.get("integrations", {})
    # expose only non-secret enable flags + social client IDs publicly
    pub = {"sms_enabled": integ.get("sms_enabled"), "whatsapp_enabled": integ.get("whatsapp_enabled"),
           "google_client_id": integ.get("google_client_id"), "facebook_app_id": integ.get("facebook_app_id"),
           "razorpay_enabled": integ.get("razorpay_enabled"),
           "google_maps_api_key": integ.get("google_maps_api_key"),
           "fcm_enabled": integ.get("fcm_enabled"), "fcm_vapid_public_key": integ.get("fcm_vapid_public_key"),
           "fcm_web_api_key": integ.get("fcm_web_api_key"), "fcm_sender_id": integ.get("fcm_sender_id"),
           "fcm_project_id": integ.get("fcm_project_id"), "fcm_app_id": integ.get("fcm_app_id")}
    acfg = s.get("address_config", {})
    pub_addr = {k: acfg.get(k) for k in ("gps", "multiple_addresses", "property_type", "floor_flat",
                "landmark_instructions", "pet_info", "parking_lift",
                "mandatory_landmark", "property_types")}
    biz = s.get("business_config", {}) or {}
    pub_biz = {"min_labour_charge": float(biz.get("min_labour_charge", 0) or 0), "job_auto_expiry_minutes": int(s.get("job_auto_expiry_minutes", 5) or 5)}
    return {"auth_config": s.get("auth_config", {}), "profile_fields": s.get("profile_fields", {}),
            "address_config": pub_addr, "integrations": pub, "business": pub_biz}


def _hash_pw(pw, salt=None):
    salt = salt or _os.urandom(16).hex()
    h = _hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 100000).hex()
    return f"{salt}${h}"


def _verify_pw(pw, stored):
    try:
        salt, _ = stored.split("$")
        return _hash_pw(pw, salt) == stored
    except Exception:
        return False


async def email_login(email, password, name):
    s = await get_settings()
    if not s.get("auth_config", {}).get("email_login"):
        raise HTTPException(status_code=403, detail="Email login is disabled by admin")
    email = email.strip().lower()
    if len(password) < 4:
        raise HTTPException(status_code=400, detail="Password too short")
    u = await db.users.find_one({"email": email}, {"_id": 0})
    created = False
    if u:
        if not _verify_pw(password, u.get("password_hash", "")):
            raise HTTPException(status_code=400, detail="Invalid email or password")
    else:
        u = build_user("email:" + email, "customer", name or email.split("@")[0], email=email)
        u["password_hash"] = _hash_pw(password)
        await db.users.insert_one(dict(u))
        u.pop("_id", None)
        created = True
    token = create_token(u["id"], u["role"])
    u.pop("password_hash", None)
    return {"token": token, "user": u, "created": created}


async def google_login(credential):
    s = await get_settings()
    if not s.get("auth_config", {}).get("social_login"):
        raise HTTPException(status_code=403, detail="Social login is disabled by admin")
    client_id = s.get("integrations", {}).get("google_client_id")
    if not client_id:
        raise HTTPException(status_code=400, detail="Google login not configured. Admin must add the Google Client ID.")
    try:
        info = google_id_token.verify_oauth2_token(credential, google_requests.Request(), client_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Google credential")
    email = (info.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")
    name = info.get("name") or email.split("@")[0]
    u = await db.users.find_one({"email": email}, {"_id": 0})
    if not u:
        u = build_user("google:" + email, "customer", name, email=email)
        u["photo"] = info.get("picture", "")
        await db.users.insert_one(dict(u))
        u.pop("_id", None)
    token = create_token(u["id"], u["role"])
    u.pop("password_hash", None)
    return {"token": token, "user": u, "created": False}


async def register_provider(phone, name, role):
    if role not in ("partner", "merchant"):
        raise HTTPException(status_code=400, detail="Invalid role")
    existing = await db.users.find_one({"phone": phone}, {"_id": 0})
    if existing and existing["role"] != role:
        raise HTTPException(status_code=400, detail=f"This number is already registered as {existing['role']}")
    if not existing:
        u = build_user(phone, role, name)
        await db.users.insert_one(dict(u))
    return await auth_service.send_otp(phone)


async def send_otp(phone):
    return await auth_service.send_otp(phone)


async def verify_otp(phone, otp, name=None, create_if_new=True, role=None):
    res = await auth_service.verify_otp(phone, otp, name, create_if_new, role)
    if not res["ok"]:
        if res.get("reason") == "role_mismatch":
            raise HTTPException(status_code=400, detail=f"This number is already registered as {res.get('existing_role')}. Please login instead.")
        if res.get("reason") == "demo_disabled":
            raise HTTPException(status_code=403, detail="Demo login is disabled by admin")
        if res.get("reason") == "suspended":
            until = res.get("suspend_until") or ""
            when = ""
            try:
                from datetime import datetime
                when = datetime.fromisoformat(until).strftime("%d %b %Y, %I:%M %p") if until else ""
            except Exception:  # noqa: BLE001
                when = until
            reason = res.get("suspend_reason") or "policy violation"
            msg = f"Your account is suspended. Reason: {reason}."
            if when:
                msg += f" It will be re-activated automatically on {when}."
            raise HTTPException(status_code=403, detail=msg)
        if res.get("reason") == "otp_expired":
            raise HTTPException(status_code=400, detail="This OTP has expired. Please request a new one.")
        if res.get("reason") == "too_many_attempts":
            raise HTTPException(status_code=429, detail="Too many incorrect attempts. Please request a new OTP.")
        if res.get("reason") == "deleted":
            raise HTTPException(status_code=403, detail="This account has been removed. Please contact support.")
        raise HTTPException(status_code=400, detail="Invalid OTP")
    # New number, verified but not yet created — frontend will collect the name
    # then re-verify with create_if_new=True to run the existing signup flow.
    if res.get("new_user"):
        return {"new_user": True}
    user = res["user"]
    token = create_token(user["id"], user["role"])
    if user.get("role") in ("admin", "staff"):
        from services.rbac_service import enrich_user
        user = await enrich_user(user)
    return {"token": token, "user": user, "created": res["created"]}


async def demo_status():
    return await auth_service.demo_status()


def _data_url_bytes(s: str) -> int:
    """Approximate the binary byte size of a data-URL / base64 string."""
    try:
        b64 = s.split(",", 1)[1] if "," in s else s
        return int(len(b64) * 3 / 4)
    except Exception:
        return len(s or "")


# Max upload size for images/documents across the app: 2 MB (binary). Clients
# auto-compress images below this; the backend enforces it as a hard guard. Base64
# inflates ~33%, so we compute the real decoded size before comparing.
MAX_UPLOAD_BYTES = 2 * 1024 * 1024


async def update_profile(user, data: dict):
    # Once a Partner OR Merchant is approved/verified, their profile is LOCKED —
    # they may still change ONLY their profile picture (photo); all other fields
    # require an admin change. Customers are never locked (can edit full profile).
    role = user.get("role")
    approved = (user.get("kyc_status") == "approved"
                or user.get("verified_partner") or user.get("verified_merchant"))
    is_locked = role in ("partner", "merchant") and approved
    if is_locked:
        # Silently drop every field except the photo so an approved user can
        # update their picture but nothing else.
        photo = data.get("photo")
        if not photo:
            raise HTTPException(
                status_code=403,
                detail="Your profile is approved and locked. Only your profile picture can be changed.")
        data = {"photo": photo}
    if data.get("photo") and _data_url_bytes(data["photo"]) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 2 MB). Please use a smaller photo.")
    upd = {k: v for k, v in data.items() if v is not None}
    if upd:
        old = await db.users.find_one({"id": user["id"]}, {"_id": 0}) or {}
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
        await pa.record_diff(user, old, upd, keys=upd.keys(), section="profile")
    return await db.users.find_one({"id": user["id"]}, {"_id": 0})


async def set_onboarding_tour(user, status: str):
    """Persist the per-user onboarding tour state (pending | completed | skipped).
    Stored on the user account so the first-time tour never re-appears across
    logins, refreshes or devices once completed/skipped."""
    valid = {"pending", "completed", "skipped"}
    status = (status or "").strip().lower()
    if status not in valid:
        raise HTTPException(status_code=400, detail="Invalid tour status")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"onboarding_tour_status": status, "onboarding_tour_updated_at": now_iso()}},
    )
    return {"ok": True, "onboarding_tour_status": status}



async def partner_toggle_online(user, online: bool):
    """Flip a partner's `partner_status` between online/offline. Works even
    for approved partners (whose profile is otherwise locked).

    Side-effect: when a partner comes ONLINE, immediately re-dispatch any
    still-SEARCHING bookings they're eligible for (they may have missed the
    original broadcast while offline). Best-effort — never blocks the toggle.
    """
    if user.get("role") != "partner":
        raise HTTPException(status_code=403, detail="Only partners can toggle status")
    # Delegate to the availability engine so this quick ONLINE/OFFLINE toggle stays a
    # SINGLE source of truth with "My Availability": going ONLINE marks TODAY's calendar
    # date Available (+ sets online_date/last_online_at) and OFFLINE marks it Unavailable.
    # set_availability also re-dispatches pending jobs on ONLINE. (Fixes the bug where the
    # partner was 'online' but the calendar/My Availability still showed 'not available'.)
    from services import partner_service as ps
    await ps.set_availability(user, "online" if online else "offline")
    await db.users.update_one(
        {"id": user["id"]}, {"$set": {"last_status_change_at": now_iso()}})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return fresh


# Allowed top-level keys a partner can submit during onboarding.
_ONBOARD_KEYS = {
    "account_type", "name", "photo", "email", "dob", "gender",
    "company_name", "business_type", "contact_person", "gstin", "business_pan",
    "address", "permanent_address", "kyc", "bank", "upi",
    "skills", "secondary_skills", "experience_years", "skill_experience",
    "certifications", "categories", "service_area", "license",
}


async def partner_onboarding(user, data: dict):
    if user.get("role") != "partner":
        raise HTTPException(status_code=403, detail="Only partners can submit onboarding")
    # Approved partners cannot re-submit / edit onboarding from partner side.
    if user.get("kyc_status") == "approved" or user.get("verified_partner"):
        raise HTTPException(
            status_code=403,
            detail="Your profile is approved and locked. Please contact admin to make changes.")
    upd = {k: v for k, v in data.items() if k in _ONBOARD_KEYS and v is not None}
    if data.get("submit"):
        # mark documents submitted and move into verification queue
        upd["kyc_status"] = "submitted"
        upd["verification_stage"] = "documents_submitted"
        upd["onboarding_submitted"] = True
        upd["onboarding_submitted_at"] = now_iso()
    if upd:
        old = await db.users.find_one({"id": user["id"]}, {"_id": 0}) or {}
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
        await pa.record_diff(user, old, upd, keys=[k for k in upd if k in _ONBOARD_KEYS], section="onboarding")
        if data.get("submit"):
            # notify all admins for review
            admins = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(50)
            for a in admins:
                await db.notifications.insert_one({
                    "id": new_id(), "user_id": a["id"], "audience": "admin",
                    "title": "New partner application",
                    "body": f"{upd.get('name', user.get('name', 'A partner'))} submitted onboarding for verification.",
                    "created_at": now_iso(),
                })
    return await db.users.find_one({"id": user["id"]}, {"_id": 0})


_MERCHANT_ONBOARD_KEYS = {
    "name", "photo", "email", "dob", "gender",
    "shop_name", "shop_type", "shop_address", "gstin", "shop_photos",
    "license", "owner_pan", "address", "kyc", "bank", "upi",
    "categories", "service_area",
}


async def merchant_onboarding(user, data: dict):
    """Merchant self-onboarding — mirrors partner onboarding with shop/business fields.
    KYC (PAN + bank) is captured here and enforced again at withdrawal time."""
    if user.get("role") != "merchant":
        raise HTTPException(status_code=403, detail="Only merchants can submit onboarding")
    if user.get("kyc_status") == "approved" or user.get("verified_merchant"):
        raise HTTPException(status_code=403,
                            detail="Your profile is approved and locked. Please contact admin to make changes.")
    upd = {k: v for k, v in data.items() if k in _MERCHANT_ONBOARD_KEYS and v is not None}
    if data.get("submit"):
        upd["kyc_status"] = "submitted"
        upd["verification_stage"] = "documents_submitted"
        upd["onboarding_submitted"] = True
        upd["onboarding_submitted_at"] = now_iso()
    if upd:
        old = await db.users.find_one({"id": user["id"]}, {"_id": 0}) or {}
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
        await pa.record_diff(user, old, upd, keys=[k for k in upd if k in _MERCHANT_ONBOARD_KEYS], section="onboarding")
        if data.get("submit"):
            admins = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(50)
            for a in admins:
                await db.notifications.insert_one({
                    "id": new_id(), "user_id": a["id"], "audience": "admin",
                    "title": "New merchant application",
                    "body": f"{upd.get('shop_name', user.get('name', 'A merchant'))} submitted onboarding for verification.",
                    "created_at": now_iso()})
    return await db.users.find_one({"id": user["id"]}, {"_id": 0})



async def add_address(user, addr: AddressModel):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    addresses = (u or {}).get("addresses", [])
    doc = addr.model_dump()
    doc["id"] = new_id()
    if doc.get("is_default") or not any(a.get("is_default") for a in addresses):
        doc["is_default"] = True
        for a in addresses:
            a["is_default"] = False
    addresses.append(doc)
    await db.users.update_one({"id": user["id"]}, {"$set": {"addresses": addresses}})
    await pa.record(user, [{"field": "addresses", "label": "Address added", "masked": False, "old": None,
                            "new": f"{doc.get('label') or 'Address'} · {doc.get('line', '')} {doc.get('city', '')} {doc.get('pincode', '')}".strip()}],
                    section="addresses")
    return await db.users.find_one({"id": user["id"]}, {"_id": 0})


async def list_addresses(user):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "addresses": 1})
    return (u or {}).get("addresses", [])


async def update_address(user, addr_id, addr: AddressModel):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    addresses = (u or {}).get("addresses", [])
    doc = addr.model_dump()
    doc["id"] = addr_id
    found = False
    for i, a in enumerate(addresses):
        if a["id"] == addr_id:
            addresses[i] = doc
            found = True
    if not found:
        raise HTTPException(status_code=404, detail="Address not found")
    if doc.get("is_default"):
        for a in addresses:
            if a["id"] != addr_id:
                a["is_default"] = False
    if not any(a.get("is_default") for a in addresses):
        addresses[0]["is_default"] = True
    await db.users.update_one({"id": user["id"]}, {"$set": {"addresses": addresses}})
    old_a = next((a for a in (u or {}).get("addresses", []) if a.get("id") == addr_id), {})
    ch = pa.diff(old_a, doc, keys=[k for k in doc if k not in ("id", "lat", "lng", "pets", "contact")])
    if ch:
        await pa.record(user, [{"field": "addresses", "label": f"Address updated ({doc.get('label') or 'Address'})", "masked": False,
                                "old": "; ".join(f"{c['label']}: {c['old']}" for c in ch if c["old"]) or None,
                                "new": "; ".join(f"{c['label']}: {c['new']}" for c in ch if c["new"]) or None}],
                        section="addresses")
    return await db.users.find_one({"id": user["id"]}, {"_id": 0})


async def delete_address(user, addr_id):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    removed = next((a for a in (u or {}).get("addresses", []) if a["id"] == addr_id), None)
    addresses = [a for a in (u or {}).get("addresses", []) if a["id"] != addr_id]
    if addresses and not any(a.get("is_default") for a in addresses):
        addresses[0]["is_default"] = True
    await db.users.update_one({"id": user["id"]}, {"$set": {"addresses": addresses}})
    if removed:
        await pa.record(user, [{"field": "addresses", "label": "Address removed", "masked": False,
                                "old": f"{removed.get('label') or 'Address'} · {removed.get('line', '')} {removed.get('city', '')}".strip(), "new": None}],
                        section="addresses")
    return await db.users.find_one({"id": user["id"]}, {"_id": 0})


async def set_default_address(user, addr_id):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    addresses = (u or {}).get("addresses", [])
    if not any(a["id"] == addr_id for a in addresses):
        raise HTTPException(status_code=404, detail="Address not found")
    for a in addresses:
        a["is_default"] = (a["id"] == addr_id)
    await db.users.update_one({"id": user["id"]}, {"$set": {"addresses": addresses}})
    return await db.users.find_one({"id": user["id"]}, {"_id": 0})


# ---- password reset via SMS OTP (Fast2SMS) ----
def _reset_query(identifier: str) -> dict:
    identifier = (identifier or "").strip()
    return {"email": identifier.lower()} if "@" in identifier else {"phone": identifier}


async def forgot_password(identifier):
    resp = {"sent": True, "message": "If an account exists, a reset OTP has been sent."}
    user = await db.users.find_one(_reset_query(identifier), {"_id": 0})
    if not user:
        return resp  # do not reveal whether the account exists
    otp = f"{_random.randint(100000, 999999)}"
    existing = await db.password_resets.find_one({"user_id": user["id"]}, {"_id": 0})
    if existing and not existing.get("used") and (_time.time() - existing.get("_ts", 0)) < 30:
        return resp  # throttle: an OTP was just sent, avoid spam
    await db.password_resets.update_one(
        {"user_id": user["id"]},
        {"$set": {"user_id": user["id"], "otp": otp, "expires_at": _time.time() + 600,
                  "used": False, "attempts": 0, "_ts": _time.time(), "created_at": now_iso()}},
        upsert=True)
    from services.sms_service import send_otp_sms
    phone = user.get("phone", "")
    delivered = await send_otp_sms(phone, otp) if str(phone).startswith("+") else False
    if delivered:
        resp["otp_delivery"] = "sms"
    else:
        resp["dev_otp"] = otp  # dev fallback when SMS gateway is not live
    return resp


async def reset_password(identifier, otp, new_password):
    if len(new_password or "") < 4:
        raise HTTPException(status_code=400, detail="Password too short (min 4 characters)")
    user = await db.users.find_one(_reset_query(identifier), {"_id": 0})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    rec = await db.password_resets.find_one({"user_id": user["id"]}, {"_id": 0})
    if not rec or rec.get("used") or float(rec.get("expires_at", 0)) < _time.time():
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    if rec.get("otp") != otp:
        attempts = int(rec.get("attempts", 0)) + 1
        if attempts >= 5:
            await db.password_resets.update_one({"user_id": user["id"]}, {"$set": {"used": True, "attempts": attempts}})
            raise HTTPException(status_code=429, detail="Too many attempts. Please request a new OTP.")
        await db.password_resets.update_one({"user_id": user["id"]}, {"$set": {"attempts": attempts}})
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": _hash_pw(new_password)}})
    await db.password_resets.update_one({"user_id": user["id"]}, {"$set": {"used": True}})
    return {"ok": True, "message": "Password reset successful. You can now log in."}


# ---- account deletion (admin-approval gated) ----
async def request_account_deletion(user, reason):
    s = await get_settings()
    needs_approval = s.get("auth_config", {}).get("account_deletion_approval", True)
    if needs_approval:
        existing = await db.deletion_requests.find_one(
            {"user_id": user["id"], "status": "pending"}, {"_id": 0})
        if existing:
            return {"status": "pending", "message": "Your deletion request is already awaiting admin approval."}
        await db.deletion_requests.insert_one({
            "id": new_id(), "user_id": user["id"], "name": user.get("name"),
            "phone": user.get("phone"), "email": user.get("email", ""), "role": user["role"],
            "reason": reason or "", "status": "pending", "created_at": now_iso()})
        await db.users.update_one({"id": user["id"]}, {"$set": {"status": "deletion_requested"}})
        return {"status": "pending", "message": "Deletion requested. An admin will review and confirm."}
    await db.users.delete_one({"id": user["id"]})
    return {"status": "deleted", "message": "Your account has been deleted."}
