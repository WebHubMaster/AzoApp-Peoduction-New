"""Partner Registration & KYC engine.

Owns the mandatory profile-completion flow (Basic -> Work -> Documents -> Address
-> Review/Submit), Aadhaar validation (Verhoeff + OCR match), admin KYC review
(pending/approved/rejected + rejection reason & resubmit) and admin-managed master
data (education & experience options). Service categories reuse the catalog.
"""
import re
from fastapi import HTTPException
from config.database import db, now_iso
from models.user import new_id
from services import profile_audit_service as pa
from services.ocr_service import extract_aadhaar_number, normalize_aadhaar

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


async def validate_registration_email(email: str, user_id: str) -> str:
    """Mandatory email validation shared by registration flows (server-side, so a
    direct/API request can never bypass it). Returns the normalized email.
    Rules: required + valid format + not already used by ANOTHER account."""
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

# ---------------------------------------------------------------- Verhoeff
_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]


def verhoeff_valid(number: str) -> bool:
    num = normalize_aadhaar(number)
    if len(num) != 12 or num[0] in "01":  # Aadhaar never starts with 0 or 1
        return False
    c = 0
    for i, item in enumerate(reversed(num)):
        c = _D[c][_P[i % 8][int(item)]]
    return c == 0


# ---------------------------------------------------------------- helpers
def _blank_profile(user: dict) -> dict:
    # A freshly-onboarded user may already carry an admin decision on their user
    # record (e.g. approved/rejected directly from the admin 360 profile) before a
    # registration profile ever existed — inherit it so the partner app shows the
    # correct status + rejection reason instead of a blank wizard.
    uk = (user.get("kyc_status") or "").strip()
    status = uk if uk in ("rejected", "under_review", "approved") else "incomplete"
    return {
        "id": new_id(), "user_id": user["id"], "phone": user.get("phone", ""),
        "status": status, "completion_score": 0,
        "rejection_reason": user.get("rejection_reason", "") if status == "rejected" else "",
        "version": 0, "submitted_at": None, "reviewed_at": None, "reviewed_by": None,
        "basic": {"full_name": "", "dob": "", "mobile": user.get("phone", ""),
                  "email": "", "gender": "", "education_id": "", "education_name": "",
                  "merchant_code": "", "merchant_id": "", "merchant_name": "",
                  "live_photo_url": "",
                  "state": "", "district": "", "city": "", "village": "", "pincode": ""},
        "work": {"categories": []},   # [{category_id, category_name, experience_id, experience_label}]
        "documents": {"aadhaar_number": "", "aadhaar_front_url": "", "aadhaar_back_url": "",
                      "aadhaar_ocr": {}, "education_certificate_url": ""},
        "address": {"manual_address": "", "lat": None, "lng": None, "location_address": ""},
        "created_at": now_iso(), "updated_at": now_iso(),
    }


async def get_or_create_profile(user: dict) -> dict:
    p = await db.partner_profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    if not p:
        p = _blank_profile(user)
        await db.partner_profiles.insert_one(dict(p))
        p.pop("_id", None)
    # Backfill any missing sections/keys so legacy or shell profiles never break
    # the wizard (e.g. a profile created before these sections existed).
    tpl = _blank_profile(user)
    for sec in ("basic", "work", "documents", "address"):
        if not isinstance(p.get(sec), dict):
            p[sec] = tpl[sec]
        else:
            for k, v in tpl[sec].items():
                p[sec].setdefault(k, v)
    for k in ("status", "completion_score", "rejection_reason", "version"):
        p.setdefault(k, tpl[k])
    # keep mobile locked to the login number
    if p["basic"].get("mobile") != user.get("phone"):
        p["basic"]["mobile"] = user.get("phone", "")
    # For shell/admin-created partners the registration profile may be empty even
    # though the user record already carries these details — surface them so the
    # admin edit wizard is pre-filled instead of blank (in-memory only).
    b = p["basic"]
    _umap = {"full_name": "name", "email": "email", "gender": "gender", "dob": "dob",
             "state": "state", "district": "district", "city": "city", "pincode": "pincode"}
    for bk, uk2 in _umap.items():
        if not str(b.get(bk) or "").strip() and str(user.get(uk2) or "").strip():
            b[bk] = user[uk2]
    return p


def compute_score(p: dict) -> dict:
    b, w, d, a = p["basic"], p["work"], p["documents"], p["address"]
    # Basic (weight 30)
    b_fields = ["full_name", "dob", "gender", "education_id", "state", "district", "city", "pincode"]
    b_done = sum(1 for f in b_fields if str(b.get(f, "")).strip())
    basic = b_done / len(b_fields)
    # Work (weight 25) — >=1 category, each with experience
    cats = w.get("categories", [])
    if cats:
        work = sum(1 for c in cats if c.get("experience_id")) / len(cats)
    else:
        work = 0.0
    # Documents (weight 30)
    doc_reqs = [bool(d.get("aadhaar_number")), bool(d.get("aadhaar_front_url")),
                bool(d.get("aadhaar_back_url"))]
    if b.get("education_id"):
        doc_reqs.append(bool(d.get("education_certificate_url")))
    docs = sum(1 for x in doc_reqs if x) / len(doc_reqs)
    # Address (weight 15)
    addr = 1.0 if str(a.get("manual_address", "")).strip() else 0.0

    score = round(basic * 30 + work * 25 + docs * 30 + addr * 15)
    return {
        "score": score,
        "sections": {
            "basic": round(basic * 100), "work": round(work * 100),
            "documents": round(docs * 100), "address": round(addr * 100),
        },
    }


async def _persist(user: dict, section: str, payload: dict, admin_override: bool = False) -> dict:
    p = await get_or_create_profile(user)
    if p["status"] == "approved" and not admin_override:
        raise HTTPException(400, "Your profile is approved and locked")
    _before = dict(p.get(section) or {})
    p[section].update(payload)
    await pa.record_diff(user, _before, p[section], keys=payload.keys(), section=section)
    p["basic"]["mobile"] = user.get("phone", "")  # always locked
    sc = compute_score(p)
    p["completion_score"] = sc["score"]
    p["updated_at"] = now_iso()
    await db.partner_profiles.update_one(
        {"user_id": user["id"]},
        {"$set": {section: p[section], "completion_score": sc["score"],
                  "updated_at": p["updated_at"]}})
    # keep user.name in sync when full name is set
    if section == "basic" and payload.get("full_name"):
        await db.users.update_one({"id": user["id"]},
                                  {"$set": {"name": payload["full_name"]}})
    return {"profile": p, "score": sc}


# ---------------------------------------------------------------- section saves
async def save_basic(user, data: dict, admin_override: bool = False):
    edu_name = ""
    if data.get("education_id"):
        edu = await db.partner_educations.find_one({"id": data["education_id"]}, {"_id": 0})
        edu_name = edu["name"] if edu else data.get("education_name", "")
    # Merchant referral code (optional) — validate & resolve to a merchant
    mcode = (data.get("merchant_code") or "").strip().upper()
    m_id, m_name = "", ""
    if mcode:
        from services import merchant_code_service
        m = await merchant_code_service.validate_code(mcode)
        if not m:
            raise HTTPException(400, "Invalid merchant code")
        m_id = m["id"]
        m_name = m.get("shop_name") or m.get("name") or ""
    gender = (data.get("gender") or "").strip().lower()
    if gender and gender not in ("male", "female", "other"):
        raise HTTPException(400, "Invalid gender")
    email = await validate_registration_email(data.get("email"), user["id"])
    payload = {
        "full_name": (data.get("full_name") or "").strip(),
        "dob": data.get("dob", ""),
        "gender": gender,
        "email": email,
        "live_photo_url": (data.get("live_photo_url") or "").strip(),
        "merchant_code": mcode, "merchant_id": m_id, "merchant_name": m_name,
        "education_id": data.get("education_id", ""), "education_name": edu_name,
        "state": data.get("state", ""), "district": data.get("district", ""),
        "city": data.get("city", ""), "village": data.get("village", ""),
        "pincode": normalize_aadhaar(data.get("pincode", ""))[:6],
    }
    res = await _persist(user, "basic", payload, admin_override=admin_override)
    # persist gender + merchant link on the user doc as well
    uupd = {"gender": gender, "email": email}
    if m_id:
        uupd["referred_by_merchant"] = m_id
    await db.users.update_one({"id": user["id"]}, {"$set": uupd})
    await _refresh_matching(user["id"])
    return res


async def save_work(user, data: dict, admin_override: bool = False):
    raw = data.get("categories", [])
    cats = []
    for c in raw:
        cid = c.get("category_id")
        if not cid:
            continue
        cat = await db.categories.find_one({"id": cid}, {"_id": 0, "name": 1})
        exp = None
        if c.get("experience_id"):
            exp = await db.partner_experiences.find_one(
                {"id": c["experience_id"]}, {"_id": 0, "label": 1})
        cats.append({
            "category_id": cid,
            "category_name": cat["name"] if cat else c.get("category_name", ""),
            "experience_id": c.get("experience_id", ""),
            "experience_label": exp["label"] if exp else c.get("experience_label", ""),
        })
    # sync chosen categories into the partner's skill list (point 3)
    skill_names = [c["category_name"] for c in cats if c.get("category_name")]
    await db.users.update_one({"id": user["id"]}, {"$set": {"skills": skill_names}})
    res = await _persist(user, "work", {"categories": cats}, admin_override=admin_override)
    await _refresh_matching(user["id"])  # re-index for job matching immediately
    return res


async def _refresh_matching(user_id: str):
    """Re-run partner ↔ area/skill sync so edited skills/location reflect in job
    matching right away. Best-effort — never blocks the save."""
    try:
        from services.partner_sync import sync_partner
        await sync_partner(user_id)
    except Exception:  # noqa: BLE001
        pass


async def save_address(user, data: dict, admin_override: bool = False):
    payload = {
        "manual_address": (data.get("manual_address") or "").strip(),
        "lat": data.get("lat"), "lng": data.get("lng"),
        "location_address": data.get("location_address", ""),
    }
    res = await _persist(user, "address", payload, admin_override=admin_override)
    await _refresh_matching(user["id"])
    return res


async def save_documents(user, data: dict, admin_override: bool = False):
    num = normalize_aadhaar(data.get("aadhaar_number", ""))
    payload = {
        "aadhaar_number": num,
        "aadhaar_front_url": data.get("aadhaar_front_url", ""),
        "aadhaar_back_url": data.get("aadhaar_back_url", ""),
        "education_certificate_url": data.get("education_certificate_url", ""),
    }
    if "aadhaar_ocr" in data:
        payload["aadhaar_ocr"] = data["aadhaar_ocr"]
    return await _persist(user, "documents", payload, admin_override=admin_override)


# ---------------------------------------------------------------- OCR
async def aadhaar_ocr(user, raw: bytes, ext: str, aadhaar_number: str) -> dict:
    entered = normalize_aadhaar(aadhaar_number)
    res = await extract_aadhaar_number(raw, ext)
    extracted = res.get("extracted", "")
    matched = bool(extracted) and bool(entered) and extracted == entered
    out = {
        "ocr_ran": res.get("ok", False),
        "extracted": extracted,
        "matched": matched,
        "error": res.get("error"),
        "checked_at": now_iso(),
    }
    # store the latest OCR result on the profile
    p = await get_or_create_profile(user)
    ocr_state = p["documents"].get("aadhaar_ocr", {}) or {}
    ocr_state.update(out)
    await db.partner_profiles.update_one(
        {"user_id": user["id"]},
        {"$set": {"documents.aadhaar_ocr": ocr_state, "updated_at": now_iso()}})
    return out


# ---------------------------------------------------------------- submit
async def submit_profile(user) -> dict:
    p = await get_or_create_profile(user)
    if p["status"] == "approved":
        raise HTTPException(400, "Profile already approved")

    sc = compute_score(p)
    missing = [k for k, v in sc["sections"].items() if v < 100]
    if missing:
        raise HTTPException(400, f"Please complete: {', '.join(missing)}")

    # Service-area gate: block registration from pincodes outside the admin-managed
    # Service Areas. When no areas are configured the platform is treated as open.
    from services.geo_service import check_serviceable, registration_block_message
    reg_pin = str((p.get("basic") or {}).get("pincode") or "").strip()
    chk = await check_serviceable(pincode=reg_pin)
    if not chk.get("serviceable"):
        raise HTTPException(400, registration_block_message(reg_pin, chk.get("serviced_cities")))

    d = p["documents"]
    if not verhoeff_valid(d.get("aadhaar_number", "")):
        raise HTTPException(400, "Please enter a valid Aadhaar number")

    if not (p["basic"].get("live_photo_url") or "").strip():
        raise HTTPException(400, "Please capture your live photo to continue")

    # If OCR ran and explicitly mismatched, block.
    ocr = d.get("aadhaar_ocr", {}) or {}
    if ocr.get("ocr_ran") and not ocr.get("matched"):
        raise HTTPException(
            400, "Please enter a valid Aadhaar number or upload the correct ID.")

    version = p.get("version", 0) + 1
    await db.partner_profiles.update_one(
        {"user_id": user["id"]},
        {"$set": {"status": "under_review", "rejection_reason": "",
                  "submitted_at": now_iso(), "version": version,
                  "completion_score": sc["score"], "updated_at": now_iso()}})
    await db.users.update_one({"id": user["id"]}, {"$set": {"kyc_status": "under_review"}})

    full_name = p["basic"].get("full_name") or p.get("phone") or "Partner"
    # notify the partner across active channels (SMS / Email / Push) — only fires
    # for channels whose template for this event is Active.
    from services.template_service import fire_event
    await fire_event(
        user["id"], "partner_registered",
        ctx={"name": full_name, "phone": p.get("phone", "")},
        fallback_title="Application received",
        fallback_body=f"Hi {full_name}, your partner application has been received and is under review.",
        link="/partner")

    # notify admins (in-app)
    admins = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(50)
    for adm in admins:
        await db.notifications.insert_one({
            "id": new_id(), "user_id": adm["id"], "audience": "user",
            "title": "New partner KYC application",
            "body": f"{full_name} submitted KYC for review.",
            "link": "/admin", "read": False, "created_at": now_iso()})
    return {"ok": True, "status": "under_review", "version": version}


# ---------------------------------------------------------------- admin KYC
_STATUS_MAP = {"pending": "under_review", "approved": "approved", "rejected": "rejected"}


async def admin_create_partner(actor, data: dict, merchant_id: str = None):
    """Create a partner from the admin/merchant wizard payload.

    data = {phone, basic{...}, work{categories:[...]}, documents{...}, address{...},
            auto_approve?: bool}
    """
    from models.user import new_id as _nid
    phone = (data.get("phone") or data.get("basic", {}).get("mobile") or "").strip()
    if not phone:
        raise HTTPException(400, "Phone is required")
    if not phone.startswith("+"):
        phone = "+91" + phone.lstrip("0")
    existing = await db.users.find_one({"phone": phone}, {"_id": 0})
    if existing and existing.get("role") not in (None, "customer", "partner"):
        raise HTTPException(400, "Phone already used by another role")
    b = data.get("basic", {}) or {}
    name = (b.get("full_name") or data.get("name") or "Partner").strip()
    if existing:
        user = existing
        await db.users.update_one({"id": user["id"]},
                                  {"$set": {"role": "partner", "name": name}})
        user["role"] = "partner"
    else:
        user = {
            "id": _nid(), "phone": phone, "role": "partner", "name": name,
            "email": b.get("email", ""), "kyc_status": "pending", "partner_status": "offline",
            "rating": 0, "jobs_completed": 0, "wallet_balance": 0, "skills": [],
            "created_at": now_iso(), "created_by_role": actor.get("role"),
        }
        if merchant_id:
            user["referred_by_merchant"] = merchant_id
        await db.users.insert_one(dict(user))
    if merchant_id and not user.get("referred_by_merchant"):
        await db.users.update_one({"id": user["id"]}, {"$set": {"referred_by_merchant": merchant_id}})
    # build/refresh the registration profile
    await get_or_create_profile(user)
    if b:
        await save_basic(user, b)
    if data.get("work"):
        await save_work(user, data["work"])
    if data.get("documents"):
        await save_documents(user, data["documents"])
    if data.get("address"):
        await save_address(user, data["address"])
    # merchant/admin created partners go straight to review (or auto-approve)
    prof = await db.partner_profiles.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1})
    if data.get("auto_approve") and actor.get("role") == "admin":
        await admin_approve_kyc(actor, prof["id"])
        status = "approved"
    else:
        await db.partner_profiles.update_one(
            {"user_id": user["id"]},
            {"$set": {"status": "under_review", "submitted_at": now_iso()}})
        await db.users.update_one({"id": user["id"]}, {"$set": {"kyc_status": "under_review"}})
        status = "under_review"
    return {"ok": True, "user_id": user["id"], "phone": phone, "status": status,
            "profile_id": prof["id"] if prof else None}


async def admin_list_kyc(status_key: str):
    st = _STATUS_MAP.get(status_key, status_key)
    rows = await db.partner_profiles.find({"status": st}, {"_id": 0}) \
        .sort("submitted_at", -1).to_list(1000)
    out = []
    seen_users = set()
    for p in rows:
        seen_users.add(p.get("user_id"))
        out.append({
            "id": p["id"], "user_id": p["user_id"], "phone": p["phone"],
            "full_name": p["basic"].get("full_name", ""),
            "city": p["basic"].get("city", ""), "state": p["basic"].get("state", ""),
            "completion_score": p.get("completion_score", 0),
            "status": p["status"], "version": p.get("version", 0),
            "submitted_at": p.get("submitted_at"),
            "categories": [c.get("category_name") for c in p["work"].get("categories", [])],
            "source": "profile",
        })
    # Also include partner USERS whose kyc_status matches (covers partners onboarded
    # without going through the multi-step registration flow, e.g. seeded/admin-created).
    user_status = {"pending": "pending", "approved": "approved", "rejected": "rejected"}.get(status_key, status_key)
    users = await db.users.find(
        {"role": "partner", "kyc_status": user_status},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "city": 1, "state": 1,
         "skills": 1, "created_at": 1, "jobs_completed": 1, "rating": 1}
    ).sort("created_at", -1).to_list(2000)
    for u in users:
        if u["id"] in seen_users:
            continue
        out.append({
            "id": u["id"], "user_id": u["id"], "phone": u.get("phone", ""),
            "full_name": u.get("name", ""),
            "city": u.get("city", ""), "state": u.get("state", ""),
            "completion_score": 100 if user_status == "approved" else 0,
            "status": st, "version": 0, "submitted_at": u.get("created_at"),
            "categories": u.get("skills", []) or [],
            "source": "user",
        })
    return out


async def admin_kyc_detail(profile_id: str):
    p = await db.partner_profiles.find_one({"id": profile_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Application not found")
    u = await db.users.find_one({"id": p["user_id"]},
                                {"_id": 0, "id": 1, "name": 1, "phone": 1,
                                 "email": 1, "rating": 1, "created_at": 1})
    p["user"] = u
    return p


async def _notify_partner(user_id, title, body, sms_text=None):
    from services.notification_service import notify
    await notify(user_id, title, body, link="/partner", sms_text=sms_text,
                 email_subject=title,
                 email_html=f"<h3>{title}</h3><p>{body}</p>"
                            f"<p>— Team AzoApp</p>")


async def admin_approve_kyc(admin, profile_id: str):
    p = await db.partner_profiles.find_one({"id": profile_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Application not found")
    await db.partner_profiles.update_one(
        {"id": profile_id},
        {"$set": {"status": "approved", "rejection_reason": "",
                  "reviewed_at": now_iso(), "reviewed_by": admin.get("id"),
                  "updated_at": now_iso()}})
    _uset = {"kyc_status": "approved", "verified_partner": True}
    # carry over merchant link + skills captured during registration
    if p["basic"].get("merchant_id"):
        _uset["referred_by_merchant"] = p["basic"]["merchant_id"]
    _skills = [c.get("category_name") for c in p["work"].get("categories", []) if c.get("category_name")]
    if _skills:
        _uset["skills"] = _skills
    if p["basic"].get("gender"):
        _uset["gender"] = p["basic"]["gender"]
    await db.users.update_one({"id": p["user_id"]}, {"$set": _uset})
    # Make the partner dispatchable: canonical skill keys + city/pincode/GPS +
    # serviceable pincodes (own + Service Area zone) copied from the registration.
    try:
        from services.partner_sync import sync_partner
        await sync_partner(p["user_id"])
    except Exception:  # noqa: BLE001
        pass
    await db.audit_logs.insert_one({
        "id": new_id(), "action": "partner_kyc_approved", "actor_id": admin.get("id"),
        "actor_name": admin.get("name"), "target_id": p["user_id"],
        "meta": {"profile_id": profile_id}, "created_at": now_iso()})
    from services.template_service import fire_event
    await fire_event(
        p["user_id"], "partner_kyc_approved",
        ctx={"name": p["basic"].get("full_name") or "Partner"},
        fallback_title="KYC Approved 🎉",
        fallback_body="Congratulations! Your AzoApp partner account has been approved. You can now start receiving jobs.",
        link="/partner")
    from services import activity_service
    await activity_service.log("admin", admin.get("id"), admin.get("name"), "partner.kyc.approved",
                               f"KYC approved for {p['basic'].get('full_name') or 'Partner'}",
                               target_id=p["user_id"], target_role="partner")
    return {"ok": True, "status": "approved"}


async def admin_reject_kyc(admin, profile_id: str, reason: str):
    if not (reason or "").strip():
        raise HTTPException(400, "Rejection reason is required")
    p = await db.partner_profiles.find_one({"id": profile_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Application not found")
    await db.partner_profiles.update_one(
        {"id": profile_id},
        {"$set": {"status": "rejected", "rejection_reason": reason.strip(),
                  "reviewed_at": now_iso(), "reviewed_by": admin.get("id"),
                  "updated_at": now_iso()}})
    await db.users.update_one({"id": p["user_id"]}, {"$set": {"kyc_status": "rejected"}})
    await db.audit_logs.insert_one({
        "id": new_id(), "action": "partner_kyc_rejected", "actor_id": admin.get("id"),
        "actor_name": admin.get("name"), "target_id": p["user_id"],
        "meta": {"profile_id": profile_id, "reason": reason}, "created_at": now_iso()})
    from services.template_service import fire_event
    await fire_event(
        p["user_id"], "partner_kyc_rejected",
        ctx={"name": p["basic"].get("full_name") or "Partner", "reason": reason.strip()},
        fallback_title="KYC Update — Action Needed",
        fallback_body=f"Your KYC needs corrections: {reason.strip()} Please update the details and resubmit.",
        link="/partner")
    from services import activity_service
    await activity_service.log("admin", admin.get("id"), admin.get("name"), "partner.kyc.rejected",
                               f"KYC rejected for {p['basic'].get('full_name') or 'Partner'}: {reason.strip()}",
                               target_id=p["user_id"], target_role="partner", meta={"reason": reason.strip()})
    return {"ok": True, "status": "rejected"}


# ---------------------------------------------------------------- master data
async def get_registration_meta():
    educations = await db.partner_educations.find(
        {"status": "active"}, {"_id": 0}).sort("order", 1).to_list(500)
    experiences = await db.partner_experiences.find(
        {"status": "active"}, {"_id": 0}).sort("order", 1).to_list(500)
    categories = await db.categories.find(
        {"status": "active"}, {"_id": 0, "id": 1, "name": 1, "icon": 1}).sort("order", 1).to_list(500)
    return {"educations": educations, "experiences": experiences, "categories": categories}


async def _crud_list(coll):
    return await db[coll].find({}, {"_id": 0}).sort("order", 1).to_list(1000)


async def edu_upsert(data: dict, edu_id: str = None):
    if edu_id:
        await db.partner_educations.update_one(
            {"id": edu_id}, {"$set": {"name": data.get("name", ""),
                                      "order": data.get("order", 0),
                                      "status": data.get("status", "active")}})
        return await db.partner_educations.find_one({"id": edu_id}, {"_id": 0})
    doc = {"id": new_id(), "name": data.get("name", ""),
           "order": data.get("order", 0), "status": data.get("status", "active"),
           "created_at": now_iso()}
    await db.partner_educations.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def exp_upsert(data: dict, exp_id: str = None):
    if exp_id:
        await db.partner_experiences.update_one(
            {"id": exp_id}, {"$set": {"label": data.get("label", ""),
                                      "order": data.get("order", 0),
                                      "status": data.get("status", "active")}})
        return await db.partner_experiences.find_one({"id": exp_id}, {"_id": 0})
    doc = {"id": new_id(), "label": data.get("label", ""),
           "order": data.get("order", 0), "status": data.get("status", "active"),
           "created_at": now_iso()}
    await db.partner_experiences.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def seed_masters():
    if await db.partner_experiences.count_documents({}) == 0:
        defaults = ["Less than 1 Year", "1 Year", "2 Years", "3 Years",
                    "4 Years", "5 Years", "6-10 Years", "10+ Years"]
        await db.partner_experiences.insert_many(
            [{"id": new_id(), "label": lbl, "order": i, "status": "active",
              "created_at": now_iso()} for i, lbl in enumerate(defaults)])
    if await db.partner_educations.count_documents({}) == 0:
        defaults = ["Below 10th", "10th Pass", "12th Pass", "ITI / Diploma",
                    "Graduate", "Post Graduate", "Other"]
        await db.partner_educations.insert_many(
            [{"id": new_id(), "name": nm, "order": i, "status": "active",
              "created_at": now_iso()} for i, nm in enumerate(defaults)])
