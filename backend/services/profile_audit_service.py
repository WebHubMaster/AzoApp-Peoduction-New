"""Profile change audit — persistent, reviewable record of every self-service
profile edit made by a customer / partner / merchant.

Collection `profile_changes`:
  id, user_id, role, user_name, user_phone, user_code, changes[{field,label,old,new,masked}],
  summary, changed_at, updated_from, reviewed(bool), reviewed_by, reviewed_at

Side-effects on `users`: profile_updated_at, profile_update_unreviewed (bool),
profile_update_summary — used by admin lists for the red-dot / priority sort.
"""
from datetime import datetime, timezone, timedelta
from config.database import db, now_iso
from models.user import new_id

# Fields whose values must never be echoed back to the admin verbatim.
SENSITIVE = {
    "photo", "owner_photo", "shop_photos", "shop_photo", "passbook_url", "aadhaar", "aadhaar_number",
    "pan", "pan_number", "owner_pan", "business_pan", "account_number", "kyc", "bank", "documents",
    "upi", "upi_id", "license", "aadhaar_front", "aadhaar_back", "pan_photo", "selfie", "signature",
    "password", "otp",
}

LABELS = {
    "name": "Name", "full_name": "Full name", "phone": "Mobile number", "alternate_mobile": "Alternate mobile",
    "email": "Email", "gender": "Gender", "dob": "Date of birth", "language": "Language",
    "communication_pref": "Communication preference", "photo": "Profile photo", "owner_photo": "Owner photo",
    "company_name": "Company name", "gst_number": "GST number", "gstin": "GSTIN", "addresses": "Addresses",
    "address": "Address", "permanent_address": "Permanent address", "shop_name": "Shop name",
    "shop_type": "Shop type", "shop_address": "Shop address", "shop_photos": "Shop photos", "shop": "Shop details",
    "skills": "Skills", "secondary_skills": "Secondary skills", "categories": "Categories",
    "experience_years": "Experience", "service_area": "Service area", "kyc": "KYC documents", "bank": "Bank details",
    "upi": "UPI", "documents": "Documents", "basic": "Basic details", "work": "Work details",
    "bank_account": "Bank account", "pan": "PAN", "license": "License", "certifications": "Certifications",
    "city": "City", "state": "State", "pincode": "Pincode", "landmark": "Landmark",
}


def label(field: str) -> str:
    return LABELS.get(field) or field.replace("_", " ").capitalize()


IMG_EXT = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".bmp")


def _docmeta(v):
    """If a string value is an uploaded document/image, return {url, kind}."""
    if not isinstance(v, str):
        return None
    s = v.strip()
    if not s:
        return None
    low = s.lower()
    if low.startswith("data:"):
        return {"url": s, "kind": "pdf" if "application/pdf" in low else "image"}
    base = low.split("?")[0]
    is_upload = "/uploads" in low
    is_pdf = base.endswith(".pdf")
    is_img = any(base.endswith(e) for e in IMG_EXT)
    if is_upload or is_pdf or is_img or len(s) > 200:
        return {"url": s, "kind": "pdf" if is_pdf else "image"}
    return None


def _value(v, base_label=""):
    """Return (text, docs) for a value. docs is a list of {label, url, kind}.
    No masking — full values are surfaced for the admin review screen."""
    docs = []
    if v is None or v == "":
        return None, docs
    if isinstance(v, (list, tuple)):
        texts = []
        for i, x in enumerate(v[:12]):
            dm = _docmeta(x) if isinstance(x, str) else None
            if dm:
                docs.append({"label": f"{base_label} {i + 1}".strip(), **dm})
            elif isinstance(x, dict):
                t, d = _value(x, base_label)
                if t:
                    texts.append(t)
                docs += d
            else:
                texts.append(str(x))
        return (", ".join(texts) if texts else None), docs
    if isinstance(v, dict):
        parts = []
        for k, val in v.items():
            lbl = label(k)
            dm = _docmeta(val) if isinstance(val, str) else None
            if dm:
                docs.append({"label": lbl, **dm})
                continue
            if isinstance(val, (dict, list)):
                if val not in (None, "", [], {}):
                    t, d = _value(val, lbl)
                    if t:
                        parts.append(f"{lbl}: {t}")
                    docs += d
                continue
            if val in (None, ""):
                continue
            parts.append(f"{lbl}: {val}")
        return ("; ".join(parts[:12]) or None), docs
    dm = _docmeta(v)
    if dm:
        docs.append({"label": base_label or "Document", **dm})
        return None, docs
    s = str(v)
    return (s if len(s) <= 200 else s[:197] + "…"), docs


def _merge_docs(old_docs, new_docs):
    """Pair old & new documents by label so the UI shows View old / View new."""
    order = []
    seen = set()
    for d in list(old_docs) + list(new_docs):
        if d["label"] not in seen:
            seen.add(d["label"])
            order.append(d["label"])
    omap = {d["label"]: d for d in old_docs}
    nmap = {d["label"]: d for d in new_docs}
    out = []
    for l in order:
        o = omap.get(l)
        n = nmap.get(l)
        out.append({"label": l,
                    "old_url": o["url"] if o else None, "old_kind": o["kind"] if o else None,
                    "new_url": n["url"] if n else None, "new_kind": n["kind"] if n else None})
    return out


_DOC_HINTS = ("photo", "aadhaar", "pan", "passbook", "cheque", "license", "selfie",
              "signature", "certificate", "document", "gst", "kyc", "shop_photo")


def _is_doc_field(k: str) -> bool:
    kl = str(k or "").lower()
    return any(h in kl for h in _DOC_HINTS)


def _is_urlish(s) -> bool:
    return isinstance(s, str) and (
        s.startswith("http://") or s.startswith("https://") or s.startswith("data:")
        or s.startswith("/uploads") or s.startswith("/api/") or s.startswith("/media"))


def diff(old: dict, new: dict, keys=None) -> list:
    """Compare two dicts (only `keys` if given) → change records (unmasked, with docs)."""
    old = old or {}
    new = new or {}
    keys = keys if keys is not None else set(new.keys())
    out = []
    for k in keys:
        ov, nv = old.get(k), new.get(k)
        if ov == nv or (ov in (None, "", [], {}) and nv in (None, "", [], {})):
            continue
        lbl = label(k)
        ot, od = _value(ov, lbl)
        nt, nd = _value(nv, lbl)
        # known document fields: treat url-ish values as viewable docs even when
        # the URL has no file extension (e.g. extension-less storage/CDN links).
        if _is_doc_field(k):
            if _is_urlish(ov) and not od:
                od = [{"label": lbl, "url": ov, "kind": "pdf" if ".pdf" in ov.lower() else "image"}]
                ot = None
            if _is_urlish(nv) and not nd:
                nd = [{"label": lbl, "url": nv, "kind": "pdf" if ".pdf" in nv.lower() else "image"}]
                nt = None
        out.append({
            "field": k, "label": lbl, "masked": False,
            "old": ot, "new": nt, "docs": _merge_docs(od, nd),
        })
    return out


def _summary(changes: list) -> str:
    labels = [c["label"] for c in changes]
    if len(labels) == 1 and labels[0].split(" ")[-1].rstrip(")").lower() in ("added", "updated", "removed", "changed") or \
            (len(labels) == 1 and "(" in labels[0]):
        return labels[0]
    if len(labels) <= 3:
        return ", ".join(labels) + " updated"
    return ", ".join(labels[:3]) + f" +{len(labels) - 3} more updated"


async def record(user: dict, changes: list, updated_from: str = "self", section: str = None):
    """Persist a profile-change record. Best-effort — never raises to the caller."""
    if not changes or not user or user.get("role") not in ("customer", "partner", "merchant"):
        return None
    try:
        fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "name": 1, "phone": 1, "photo": 1,
                                                                "partner_code": 1, "merchant_code": 1, "shop_name": 1}) or {}
        ts = now_iso()
        doc = {
            "id": new_id(), "user_id": user["id"], "role": user["role"],
            "user_name": fresh.get("name") or user.get("name") or "",
            "user_phone": fresh.get("phone") or user.get("phone") or "",
            "user_code": fresh.get("partner_code") or fresh.get("merchant_code") or "",
            "user_photo": fresh.get("photo") or "",
            "shop_name": fresh.get("shop_name") or "",
            "section": section or "profile",
            "changes": changes, "summary": _summary(changes),
            "changed_at": ts, "updated_from": updated_from,
            "reviewed": False, "reviewed_by": None, "reviewed_by_name": None, "reviewed_at": None,
        }
        await db.profile_changes.insert_one(dict(doc))
        await db.users.update_one({"id": user["id"]}, {"$set": {
            "profile_updated_at": ts, "profile_update_unreviewed": True,
            "profile_update_summary": doc["summary"]}})
        try:
            from services import activity_service
            await activity_service.log(user["role"], user["id"], doc["user_name"], "profile_updated",
                                       doc["summary"], target_id=user["id"], target_role=user["role"],
                                       meta={"fields": [c["field"] for c in changes], "change_id": doc["id"]})
        except Exception:  # noqa: BLE001
            pass
        doc.pop("_id", None)
        return doc
    except Exception:  # noqa: BLE001
        return None


async def record_diff(user: dict, old: dict, new: dict, keys=None, updated_from="self", section=None):
    return await record(user, diff(old, new, keys), updated_from=updated_from, section=section)


async def _resync_user_flag(user_id: str):
    remaining = await db.profile_changes.count_documents({"user_id": user_id, "reviewed": False})
    await db.users.update_one({"id": user_id}, {"$set": {"profile_update_unreviewed": remaining > 0}})


async def review(change_id: str, admin: dict):
    ch = await db.profile_changes.find_one({"id": change_id}, {"_id": 0})
    if not ch:
        return {"ok": False, "detail": "Change record not found"}
    if not ch.get("reviewed"):
        await db.profile_changes.update_one({"id": change_id}, {"$set": {
            "reviewed": True, "reviewed_by": admin.get("id"), "reviewed_by_name": admin.get("name"),
            "reviewed_at": now_iso()}})
        await _resync_user_flag(ch["user_id"])
    return {"ok": True, "id": change_id}


async def review_all(admin: dict, role: str = None, user_id: str = None):
    q = {"reviewed": False}
    if role:
        q["role"] = role
    if user_id:
        q["user_id"] = user_id
    ids = await db.profile_changes.distinct("user_id", q)
    res = await db.profile_changes.update_many(q, {"$set": {
        "reviewed": True, "reviewed_by": admin.get("id"), "reviewed_by_name": admin.get("name"),
        "reviewed_at": now_iso()}})
    for uid in ids:
        await _resync_user_flag(uid)
    return {"ok": True, "reviewed": res.modified_count}


async def unread_counts() -> dict:
    out = {"customer": 0, "partner": 0, "merchant": 0}
    async for row in db.profile_changes.aggregate([{"$match": {"reviewed": False}},
                                                    {"$group": {"_id": "$role", "n": {"$sum": 1}}}]):
        if row["_id"] in out:
            out[row["_id"]] = row["n"]
    out["total"] = sum(out.values())
    return out


async def list_changes(role: str = None, status: str = "all", q: str = "", user_id: str = None,
                       date_from: str = "", date_to: str = "", page: int = 1, page_size: int = 25):
    m = {}
    if role:
        m["role"] = role
    if user_id:
        m["user_id"] = user_id
    if status == "unread":
        m["reviewed"] = False
    elif status == "reviewed":
        m["reviewed"] = True
    if q:
        rx = {"$regex": q.strip(), "$options": "i"}
        m["$or"] = [{"user_name": rx}, {"user_phone": rx}, {"user_code": rx}, {"summary": rx},
                    {"shop_name": rx}, {"changes.label": rx}]
    if date_from or date_to:
        rng = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to + ("T23:59:59.999999+00:00" if len(date_to) == 10 else "")
        m["changed_at"] = rng
    total = await db.profile_changes.count_documents(m)
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    items = await db.profile_changes.find(m, {"_id": 0}).sort("changed_at", -1) \
        .skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    # summary strip
    now = datetime.now(timezone.utc)
    base = {"role": role} if role else {}
    today = (now.replace(hour=0, minute=0, second=0, microsecond=0)).isoformat()
    week = (now - timedelta(days=7)).isoformat()
    summary = {
        "unread": await db.profile_changes.count_documents({**base, "reviewed": False}),
        "reviewed": await db.profile_changes.count_documents({**base, "reviewed": True}),
        "today": await db.profile_changes.count_documents({**base, "changed_at": {"$gte": today}}),
        "week": await db.profile_changes.count_documents({**base, "changed_at": {"$gte": week}}),
        "all": await db.profile_changes.count_documents(base),
    }
    return {"items": items, "total": total, "page": page, "page_size": page_size,
            "pages": max(1, -(-total // page_size)), "summary": summary}
