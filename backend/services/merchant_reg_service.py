"""Merchant / Shopkeeper Registration & KYC engine.

Profile completion wizard (Owner + Shop + Address only). Bank & KYC documents
are NOT part of the profile anymore — they are collected the first time a
merchant withdraws money (see merchant_wallet_service).

Central verification state (mirrors partner flow):
    incomplete -> under_review -> approved / rejected

Owner Details require a LIVE camera photo (no gallery). Shop Details require a
GPS-camera Shop Verification Photo (lat/lng captured with the shot); the shop
address GPS is captured via "Use Current Location". GST is optional.
"""
import re
import math
from fastapi import HTTPException
from config.database import db, now_iso
from models.user import new_id
from services import profile_audit_service as pa

PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
GST_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


async def _validate_reg_email(email: str, user_id: str) -> str:
    """Mandatory email validation for merchant registration (server-side so a direct
    API request cannot bypass it). Required + valid format + unique across accounts."""
    email = (email or "").strip()
    if not email:
        raise HTTPException(400, "Email is required")
    if not _EMAIL_RE.match(email):
        raise HTTPException(400, "Enter a valid email address")
    dup = await db.users.find_one(
        {"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"},
         "id": {"$ne": user_id}},
        {"_id": 0, "id": 1})
    if dup:
        raise HTTPException(400, "This email is already registered with another account")
    return email

# Admin-configurable acceptable radius (metres) between the shop address GPS and
# the GPS embedded in the shop verification photo.
DEFAULT_SHOP_PHOTO_RADIUS_M = 150


def pan_valid(pan: str) -> bool:
    return bool(PAN_RE.match((pan or "").strip().upper()))


def _haversine_m(lat1, lng1, lat2, lng2):
    try:
        lat1, lng1, lat2, lng2 = float(lat1), float(lng1), float(lat2), float(lng2)
    except (TypeError, ValueError):
        return None
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)), 1)


# ---------------------------------------------------------------- helpers
def _blank_profile(user: dict) -> dict:
    uk = (user.get("kyc_status") or "").strip()
    status = uk if uk in ("rejected", "under_review", "approved") else "incomplete"
    return {
        "id": new_id(), "user_id": user["id"], "phone": user.get("phone", ""),
        "status": status, "completion_score": 0,
        "rejection_reason": user.get("rejection_reason", "") if status == "rejected" else "",
        "version": 0, "submitted_at": None, "reviewed_at": None, "reviewed_by": None,
        "basic": {"full_name": user.get("name", ""), "dob": "",
                  "mobile": user.get("phone", ""), "email": user.get("email", ""),
                  "gender": "", "owner_photo": ""},
        "shop": {"shop_name": user.get("shop_name", ""), "shop_type_id": "",
                 "shop_type_name": user.get("shop_type", ""), "categories": [],
                 "gst_number": "", "gst_url": "",
                 "shop_verification_photo": "", "shop_photo_lat": None,
                 "shop_photo_lng": None, "shop_photo_captured_at": "",
                 "shop_photo_distance_m": None, "shop_photo_verified": False,
                 "shop_photo_gps_ok": False,
                 "photo_exterior": "", "photo_interior": "",
                 "license_number": "", "license_url": ""},
        "address": {"manual_address": "", "lat": None, "lng": None, "location_address": "",
                    "state": "", "district": "", "city": "", "village": "", "pincode": ""},
        # Payout (bank + KYC) — filled only at first withdrawal
        "bank": {"account_holder": "", "bank_name": "", "account_number": "",
                 "ifsc": "", "account_type": "savings", "upi_id": ""},
        "documents": {"pan_number": "", "pan_url": "", "gst_number": "", "gst_url": "",
                      "aadhaar_number": "", "aadhaar_front_url": "", "aadhaar_back_url": ""},
        "payout_status": "none", "payout_rejection_reason": "",
        "payout_submitted_at": None, "payout_reviewed_at": None,
        "created_at": now_iso(), "updated_at": now_iso(),
    }


async def get_or_create_profile(user: dict) -> dict:
    p = await db.merchant_profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    if not p:
        p = _blank_profile(user)
        await db.merchant_profiles.insert_one(dict(p))
        p.pop("_id", None)
    else:
        # backfill new fields on older docs
        blank = _blank_profile(user)
        for sec in ("basic", "shop", "address", "bank", "documents"):
            for k, v in blank[sec].items():
                p.setdefault(sec, {}).setdefault(k, v)
        for k in ("payout_status", "payout_rejection_reason", "payout_submitted_at",
                  "payout_reviewed_at"):
            p.setdefault(k, blank[k])
    if p["basic"].get("mobile") != user.get("phone"):
        p["basic"]["mobile"] = user.get("phone", "")
    return p


# ---------------------------------------------------------------- scoring
_FIELD_LABELS = {
    "full_name": "Owner Full Name", "dob": "Date of Birth", "gender": "Gender",
    "owner_photo": "Owner Live Photo",
    "shop_name": "Shop Name", "shop_type": "Shop Type",
    "categories": "Categories Served",
    "shop_verification_photo": "Shop Verification Photo (GPS)",
    "manual_address": "Shop Address", "state": "State", "district": "District",
    "city": "City", "pincode": "Pincode", "gps": "GPS Location",
}


def compute_score(p: dict) -> dict:
    b, s, a = p["basic"], p["shop"], p["address"]
    missing = []

    # Owner / Basic (weight 30) — incl. live photo
    b_map = {
        "full_name": bool(str(b.get("full_name", "")).strip()),
        "dob": bool(str(b.get("dob", "")).strip()),
        "gender": bool(str(b.get("gender", "")).strip()),
        "owner_photo": bool(str(b.get("owner_photo", "")).strip()),
    }
    basic = sum(1 for v in b_map.values() if v) / len(b_map)

    # Shop (weight 40) — incl. mandatory GPS verification photo (GST optional)
    s_map = {
        "shop_name": bool(str(s.get("shop_name", "")).strip()),
        "shop_type": bool(s.get("shop_type_id") or str(s.get("shop_type_name", "")).strip()),
        "categories": bool(s.get("categories")),
        "shop_verification_photo": bool(str(s.get("shop_verification_photo", "")).strip()),
    }
    shop = sum(1 for v in s_map.values() if v) / len(s_map)

    # Address (weight 30) — incl. GPS coordinates
    a_map = {
        "manual_address": bool(str(a.get("manual_address", "")).strip()),
        "state": bool(str(a.get("state", "")).strip()),
        "district": bool(str(a.get("district", "")).strip()),
        "city": bool(str(a.get("city", "")).strip()),
        "pincode": bool(str(a.get("pincode", "")).strip()),
        "gps": a.get("lat") is not None and a.get("lng") is not None,
    }
    addr = sum(1 for v in a_map.values() if v) / len(a_map)

    for key, ok in {**b_map, **s_map, **a_map}.items():
        if not ok:
            missing.append(_FIELD_LABELS.get(key, key))

    score = round(basic * 30 + shop * 40 + addr * 30)
    return {
        "score": score,
        "sections": {
            "basic": round(basic * 100), "shop": round(shop * 100),
            "address": round(addr * 100),
        },
        "missing": missing,
    }


async def _persist(user: dict, section: str, payload: dict, admin_override: bool = False) -> dict:
    p = await get_or_create_profile(user)
    if p["status"] == "approved" and not admin_override:
        raise HTTPException(400, "Your profile is approved and locked")
    _before = dict(p.get(section) or {})
    p[section].update(payload)
    await pa.record_diff(user, _before, p[section], keys=payload.keys(), section=section)
    p["basic"]["mobile"] = user.get("phone", "")
    sc = compute_score(p)
    p["completion_score"] = sc["score"]
    p["updated_at"] = now_iso()
    await db.merchant_profiles.update_one(
        {"user_id": user["id"]},
        {"$set": {section: p[section], "completion_score": sc["score"],
                  "updated_at": p["updated_at"]}})
    return {"profile": p, "score": sc}


# ---------------------------------------------------------------- section saves
async def save_basic(user, data: dict, admin_override: bool = False):
    gender = (data.get("gender") or "").strip().lower()
    if gender and gender not in ("male", "female", "other"):
        raise HTTPException(400, "Invalid gender")
    email = await _validate_reg_email(data.get("email"), user["id"])
    payload = {
        "full_name": (data.get("full_name") or "").strip(),
        "dob": data.get("dob", ""),
        "gender": gender,
        "email": email,
        "owner_photo": data.get("owner_photo", ""),
    }
    res = await _persist(user, "basic", payload, admin_override=admin_override)
    uupd = {"email": email}
    if payload["full_name"]:
        uupd["name"] = payload["full_name"]
    if payload["email"]:
        uupd["email"] = payload["email"]
    if gender:
        uupd["gender"] = gender
    if payload["owner_photo"]:
        uupd["photo"] = payload["owner_photo"]
    if uupd:
        await db.users.update_one({"id": user["id"]}, {"$set": uupd})
    return res


async def _shop_photo_verify(p: dict, s_payload: dict):
    """Compute GPS distance between shop address and photo GPS + verification flag."""
    plat, plng = s_payload.get("shop_photo_lat"), s_payload.get("shop_photo_lng")
    gps_ok = plat is not None and plng is not None
    s_payload["shop_photo_gps_ok"] = gps_ok
    dist = None
    verified = False
    a = p.get("address", {})
    if gps_ok and a.get("lat") is not None and a.get("lng") is not None:
        dist = _haversine_m(a["lat"], a["lng"], plat, plng)
        radius = await _shop_photo_radius()
        verified = dist is not None and dist <= radius
    s_payload["shop_photo_distance_m"] = dist
    s_payload["shop_photo_verified"] = bool(verified)
    return s_payload


async def _shop_photo_radius() -> float:
    try:
        cfg = await db.settings.find_one({"key": "business_config"}, {"_id": 0})
        val = (cfg or {}).get("value", {}).get("shop_photo_radius_m")
        return float(val) if val else DEFAULT_SHOP_PHOTO_RADIUS_M
    except Exception:  # noqa: BLE001
        return DEFAULT_SHOP_PHOTO_RADIUS_M


async def save_shop(user, data: dict, admin_override: bool = False):
    p = await get_or_create_profile(user)
    shop_type_id = data.get("shop_type_id", "")
    shop_type_name = (data.get("shop_type_name") or "").strip()
    if shop_type_id:
        cat = await db.categories.find_one({"id": shop_type_id}, {"_id": 0, "name": 1})
        if cat:
            shop_type_name = cat["name"]
    raw = data.get("categories", [])
    cats = []
    for c in raw:
        cid = c.get("category_id") if isinstance(c, dict) else c
        if not cid:
            continue
        cat = await db.categories.find_one({"id": cid}, {"_id": 0, "name": 1})
        cats.append({"category_id": cid,
                     "category_name": cat["name"] if cat else (c.get("category_name", "") if isinstance(c, dict) else "")})
    gst = (data.get("gst_number") or "").strip().upper()
    cats = cats[:1]  # Merchant serves exactly ONE category (enforced server-side too)
    payload = {
        "shop_name": (data.get("shop_name") or "").strip(),
        "shop_type_id": shop_type_id, "shop_type_name": shop_type_name,
        "categories": cats,
        "gst_number": gst, "gst_url": data.get("gst_url", ""),
        "license_number": (data.get("license_number") or "").strip(),
        "license_url": data.get("license_url", ""),
    }
    # shop verification photo (with GPS) — optional on partial save, required on submit
    if "shop_verification_photo" in data:
        sp = {
            "shop_verification_photo": data.get("shop_verification_photo", ""),
            "shop_photo_lat": data.get("shop_photo_lat"),
            "shop_photo_lng": data.get("shop_photo_lng"),
            "shop_photo_captured_at": data.get("shop_photo_captured_at", now_iso()),
        }
        sp = await _shop_photo_verify(p, sp)
        payload.update(sp)
    if gst and not GST_RE.match(gst):
        raise HTTPException(400, "Please enter a valid GST number or leave it blank")
    res = await _persist(user, "shop", payload, admin_override=admin_override)
    await db.users.update_one({"id": user["id"]}, {"$set": {
        "shop_name": payload["shop_name"], "shop_type": shop_type_name,
        "merchant_categories": [c["category_name"] for c in cats if c.get("category_name")],
    }})
    return res


async def save_shop_photo(user, data: dict, admin_override: bool = False):
    """Dedicated endpoint for the GPS shop verification photo. Validates that GPS
    metadata is present (captured via device geolocation)."""
    url = data.get("shop_verification_photo") or data.get("url")
    if not url:
        raise HTTPException(400, "Photo is required")
    lat, lng = data.get("lat", data.get("shop_photo_lat")), data.get("lng", data.get("shop_photo_lng"))
    if lat is None or lng is None:
        raise HTTPException(
            400,
            "This photo does not contain valid GPS location data. Please capture a "
            "new photo using the GPS Camera and try again.")
    p = await get_or_create_profile(user)
    sp = {
        "shop_verification_photo": url,
        "shop_photo_lat": lat, "shop_photo_lng": lng,
        "shop_photo_captured_at": data.get("captured_at", now_iso()),
    }
    sp = await _shop_photo_verify(p, sp)
    res = await _persist(user, "shop", sp, admin_override=admin_override)
    res["photo"] = sp
    return res


async def save_address(user, data: dict, admin_override: bool = False):
    payload = {
        "manual_address": (data.get("manual_address") or "").strip(),
        "lat": data.get("lat"), "lng": data.get("lng"),
        "location_address": data.get("location_address", ""),
        "state": (data.get("state") or "").strip(),
        "district": (data.get("district") or "").strip(),
        "city": (data.get("city") or "").strip(),
        "village": (data.get("village") or "").strip(),
        "pincode": re.sub(r"\D", "", str(data.get("pincode", "")))[:6],
    }
    res = await _persist(user, "address", payload, admin_override=admin_override)
    uupd = {}
    if payload["city"]:
        uupd["city"] = payload["city"]
    if payload["state"]:
        uupd["state"] = payload["state"]
    if uupd:
        await db.users.update_one({"id": user["id"]}, {"$set": uupd})
    return res


# ---------------------------------------------------------------- submit
async def submit_profile(user) -> dict:
    p = await get_or_create_profile(user)
    if p["status"] == "approved":
        raise HTTPException(400, "Profile already approved")

    sc = compute_score(p)
    if sc["missing"]:
        raise HTTPException(400, f"Please complete: {', '.join(sc['missing'])}")

    # Service-area gate: block registration from pincodes outside the admin-managed
    # Service Areas. When no areas are configured the platform is treated as open.
    from services.geo_service import check_serviceable, registration_block_message
    reg_pin = str((p.get("address") or {}).get("pincode") or "").strip()
    chk = await check_serviceable(pincode=reg_pin)
    if not chk.get("serviceable"):
        raise HTTPException(400, registration_block_message(reg_pin, chk.get("serviced_cities")))

    version = p.get("version", 0) + 1
    await db.merchant_profiles.update_one(
        {"user_id": user["id"]},
        {"$set": {"status": "under_review", "rejection_reason": "",
                  "submitted_at": now_iso(), "version": version,
                  "completion_score": sc["score"], "updated_at": now_iso()}})
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"kyc_status": "under_review", "onboarding_submitted": True,
                  "onboarding_submitted_at": now_iso()}})

    shop = p["shop"].get("shop_name") or p["basic"].get("full_name") or "Merchant"
    from services.notification_service import notify
    await notify(user["id"], "Application received",
                 f"Your shop '{shop}' has been submitted for verification. "
                 "You'll be notified once it is reviewed.",
                 link="/merchant")
    admins = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(50)
    for adm in admins:
        await db.notifications.insert_one({
            "id": new_id(), "user_id": adm["id"], "audience": "user",
            "title": "New merchant verification",
            "body": f"{shop} submitted profile for review.",
            "link": "/admin", "read": False, "created_at": now_iso()})
    return {"ok": True, "status": "under_review", "version": version}


# ---------------------------------------------------------------- access state / gate
async def access_state(user: dict) -> dict:
    p = await get_or_create_profile(user)
    sc = compute_score(p)
    status = p["status"]
    if user.get("kyc_status") == "approved":
        status = "approved"
    elif user.get("kyc_status") == "rejected" and status != "rejected":
        status = "rejected"
    return {
        "status": status,
        "approved": status == "approved",
        "completion": sc["score"],
        "sections": sc["sections"],
        "missing": sc["missing"],
        "rejection_reason": p.get("rejection_reason", ""),
    }


async def assert_merchant_approved(user: dict):
    """Backend-level gate. Raises 403 unless the merchant is APPROVED."""
    st = await access_state(user)
    if not st["approved"]:
        raise HTTPException(
            status_code=403,
            detail="Merchant not approved. Complete your profile and get admin "
                   "approval to access this feature.")
    return True


# ---------------------------------------------------------------- admin KYC
async def admin_kyc_detail(user_id: str):
    p = await db.merchant_profiles.find_one({"user_id": user_id}, {"_id": 0})
    u = await db.users.find_one({"id": user_id},
                                {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1,
                                 "shop_name": 1, "shop_type": 1, "merchant_code": 1,
                                 "wallet_balance": 1, "rating": 1, "created_at": 1,
                                 "kyc_status": 1, "verified_merchant": 1, "photo": 1})
    if not u:
        raise HTTPException(404, "Merchant not found")
    if not p:
        p = _blank_profile(u)
    p["user"] = u
    p["score"] = compute_score(p)
    return p


async def admin_approve_kyc(admin, user_id: str):
    p = await db.merchant_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if p:
        await db.merchant_profiles.update_one(
            {"user_id": user_id},
            {"$set": {"status": "approved", "rejection_reason": "",
                      "reviewed_at": now_iso(), "reviewed_by": admin.get("id"),
                      "updated_at": now_iso()}})
    await db.users.update_one({"id": user_id},
                              {"$set": {"kyc_status": "approved", "verified_merchant": True}})
    await db.audit_logs.insert_one({
        "id": new_id(), "action": "merchant_kyc_approved", "actor_id": admin.get("id"),
        "actor_name": admin.get("name"), "target_id": user_id,
        "created_at": now_iso()})
    from services.notification_service import notify
    await notify(user_id, "Profile Approved 🎉",
                 "Congratulations! Your merchant account has been approved. "
                 "All shop features are now unlocked.", link="/merchant")
    return {"ok": True, "status": "approved"}


async def admin_reject_kyc(admin, user_id: str, reason: str):
    if not (reason or "").strip():
        raise HTTPException(400, "Rejection reason is required")
    p = await db.merchant_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if p:
        await db.merchant_profiles.update_one(
            {"user_id": user_id},
            {"$set": {"status": "rejected", "rejection_reason": reason.strip(),
                      "reviewed_at": now_iso(), "reviewed_by": admin.get("id"),
                      "updated_at": now_iso()}})
    await db.users.update_one({"id": user_id}, {"$set": {"kyc_status": "rejected"}})
    await db.audit_logs.insert_one({
        "id": new_id(), "action": "merchant_kyc_rejected", "actor_id": admin.get("id"),
        "actor_name": admin.get("name"), "target_id": user_id,
        "meta": {"reason": reason}, "created_at": now_iso()})
    from services.notification_service import notify
    await notify(user_id, "Profile Update — Action Needed",
                 f"Your profile needs corrections: {reason.strip()} Please update & resubmit.",
                 link="/merchant")
    return {"ok": True, "status": "rejected"}


# ---------------------------------------------------------------- meta
async def get_registration_meta():
    categories = await db.categories.find(
        {"status": "active"}, {"_id": 0, "id": 1, "name": 1, "icon": 1}).sort("order", 1).to_list(500)
    return {"categories": categories, "shop_types": categories}
