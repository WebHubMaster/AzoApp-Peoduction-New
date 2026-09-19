"""Admin → People (Customers / Partners / Merchants) — enterprise list, KPIs,
facets, 360° overview and paginated profile sections. Every number is computed
from the live collections the customer/partner/merchant panels already read
(bookings, transactions, partner_ledger, merchant_ledger, refunds, invoices …)
so there is a single source of truth.
"""
import re
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException
from config.database import db

ROLES = ("customer", "partner", "merchant")
DONE = ("completed", "paid")
ACTIVE = ("searching", "assigned", "arrived_shop", "arrived_customer", "started", "pending", "on_hold", "pending_payment")
CANCELLED = ("cancelled", "rejected", "expired")
CODE_FIELD = {"customer": "id", "partner": "partner_code", "merchant": "merchant_code"}


# ----------------------------------------------------------------- helpers
def _rx(q):
    return {"$regex": re.escape((q or "").strip()), "$options": "i"}


def _pg(page, page_size):
    page = max(1, int(page or 1))
    page_size = min(100, max(1, int(page_size or 25)))
    return page, page_size


def _end(d):
    return d + ("T23:59:59.999999+00:00" if d and len(d) == 10 else "")


def _range(field, frm, to):
    if not frm and not to:
        return {}
    r = {}
    if frm:
        r["$gte"] = frm
    if to:
        r["$lte"] = _end(to)
    return {field: r}


def _mask(v, keep=4, ch="•"):
    s = str(v or "")
    if not s:
        return ""
    return ch * max(0, len(s) - keep) + s[-keep:]


def _mask_pan(v):
    s = str(v or "")
    return (s[:2] + "•••••" + s[-3:]) if len(s) >= 6 else ("•" * len(s))


def _doc_kind(url: str) -> str:
    """Classify a document URL/data-uri as image or pdf for admin preview."""
    s = (url or "").lower()
    if s.startswith("data:application/pdf") or ".pdf" in s.split("?")[0]:
        return "pdf"
    if s.startswith("data:image") or any(e in s.split("?")[0] for e in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".heic")):
        return "image"
    # local uploads without an obvious extension are almost always images
    return "image"


def _is_file_value(v) -> bool:
    if not isinstance(v, str) or not v:
        return False
    return v.startswith("data:") or v.startswith("http://") or v.startswith("https://") \
        or v.startswith("/api/") or v.startswith("/uploads") or v.startswith("/media")


_DOC_LABELS = {
    "live_photo_url": "Live Selfie", "aadhaar_front_url": "Aadhaar — Front", "aadhaar_back_url": "Aadhaar — Back",
    "education_certificate_url": "Education Certificate", "pan_url": "PAN Card", "gst_url": "GST Certificate",
    "gstin_url": "GST Certificate", "license_url": "Trade License", "license": "Trade License",
    "shop_photo": "Shop Photo", "shop_photo_url": "Shop Photo", "passbook_url": "Bank Passbook",
    "cancelled_cheque": "Cancelled Cheque", "cheque_url": "Cancelled Cheque",
}


def _collect_viewable_docs(*sources) -> list:
    """Walk one or more dicts and pull out every uploaded file (image/pdf) so the
    admin can actually SEE the document the partner/merchant uploaded."""
    out, seen = [], set()

    def add(key, val, label=None):
        if isinstance(val, list):
            for i, x in enumerate(val):
                add(f"{key}_{i + 1}", x, (label or key.replace('_', ' ').title()) + f" {i + 1}")
            return
        if not _is_file_value(val) or val in seen:
            return
        seen.add(val)
        pretty = label or _DOC_LABELS.get(key) or key.replace("_url", "").replace("_", " ").title()
        out.append({"type": key, "label": pretty, "url": val, "kind": _doc_kind(val)})

    for src in sources:
        if not isinstance(src, dict):
            continue
        for k, v in src.items():
            if isinstance(v, dict):
                for kk, vv in v.items():
                    add(kk, vv)
            else:
                add(k, v)
    return out


def _mask_bank(b):
    b = dict(b or {})
    for k in ("account_number", "account_no"):
        if k in b:
            b[k] = _mask(b[k])
    if b.get("upi_id"):
        u = str(b["upi_id"])
        b["upi_id"] = (u[:2] + "•••" + u[u.find("@"):]) if "@" in u else _mask(u)
    for k in ("passbook_url", "cancelled_cheque"):
        if b.get(k):
            b[k] = "[document on file]"
    return b


def _loyalty(spent):
    # Loyalty (points & tiers) removed — no tier data surfaced to any panel.
    return {}


def _tier_bounds(key):
    from controllers.admin_controller import LOYALTY_TIERS
    for i, t in enumerate(LOYALTY_TIERS):
        if t["key"] == key:
            hi = LOYALTY_TIERS[i - 1]["min"] if i > 0 else None
            return t["min"], hi
    return None, None


def _completion(u, prof):
    """Profile completion %. Uses the registration profile score when present,
    else the share of core user fields actually filled (a real computation)."""
    if prof and prof.get("completion_score") is not None:
        return int(prof["completion_score"])
    core = ["name", "email", "photo", "dob", "gender", "language", "city", "addresses"]
    if u.get("role") == "partner":
        core += ["skills", "partner_code"]
    if u.get("role") == "merchant":
        core += ["shop_name", "shop_type", "merchant_code"]
    filled = sum(1 for k in core if u.get(k) not in (None, "", [], {}))
    return int(round(filled / len(core) * 100))


def _enrich_user_from_partner_profile(u: dict, prof: dict):
    """Fill blank admin-display fields on the user from the registration profile
    (partner registration stores name/dob/email/education/city/state in
    partner_profiles.basic, not on the user doc). Display-only, non-destructive."""
    if not isinstance(u, dict) or not isinstance(prof, dict):
        return
    b = prof.get("basic") or {}
    wk = prof.get("work") or {}
    ad = prof.get("address") or {}

    def fill(key, val):
        if val and not u.get(key):
            u[key] = val

    fill("name", b.get("full_name"))
    fill("email", b.get("email"))
    fill("dob", b.get("dob"))
    fill("gender", b.get("gender"))
    fill("city", b.get("city"))
    fill("state", b.get("state"))
    fill("district", b.get("district"))
    fill("pincode", b.get("pincode"))
    fill("education", b.get("education_name"))
    fill("photo", b.get("live_photo_url"))
    fill("merchant_name", b.get("merchant_name"))
    cats = [c.get("category_name") for c in (wk.get("categories") or []) if c.get("category_name")]
    if cats and not u.get("categories"):
        u["categories"] = cats
    exps = [c.get("experience_label") for c in (wk.get("categories") or []) if c.get("experience_label")]
    if exps and not u.get("experience_display"):
        u["experience_display"] = ", ".join(dict.fromkeys(exps))
    addr = ad.get("manual_address") or ad.get("location_address")
    fill("address_text", addr)


def _enrich_user_from_merchant_profile(u: dict, prof: dict):
    """Fill blank admin-display fields on the user from the merchant registration
    profile (owner/shop/address). Display-only, non-destructive."""
    if not isinstance(u, dict) or not isinstance(prof, dict):
        return
    owner = prof.get("owner") or prof.get("basic") or {}
    shop = prof.get("shop") or {}
    ad = prof.get("address") or {}

    def fill(key, val):
        if val and not u.get(key):
            u[key] = val

    fill("name", owner.get("full_name") or owner.get("name"))
    fill("email", owner.get("email"))
    fill("dob", owner.get("dob"))
    fill("gender", owner.get("gender"))
    fill("shop_name", shop.get("shop_name") or shop.get("name"))
    fill("shop_type", shop.get("shop_type") or shop.get("type"))
    fill("city", ad.get("city") or shop.get("city"))
    fill("state", ad.get("state") or shop.get("state"))
    addr = ad.get("manual_address") or ad.get("location_address") or shop.get("address")
    fill("shop_address", addr)


def _sanitize(u: dict) -> dict:
    """User doc safe for admin display — sensitive raw KYC/bank blobs masked."""
    u = dict(u or {})
    u.pop("_id", None)
    for k in ("password_hash", "password", "fcm_tokens"):
        u.pop(k, None)
    if isinstance(u.get("bank"), dict):
        u["bank"] = _mask_bank(u["bank"])
    if u.get("upi"):
        u["upi"] = _mask(u["upi"])
    if isinstance(u.get("kyc"), dict):
        k = dict(u["kyc"])
        for f in ("aadhaar", "aadhaar_number"):
            if k.get(f):
                k[f] = _mask(k[f])
        for f in ("pan", "pan_number"):
            if k.get(f):
                k[f] = _mask_pan(k[f])
        for f in list(k.keys()):
            if isinstance(k[f], str) and (k[f].startswith("data:") or len(k[f]) > 300):
                k[f] = "[document on file]"
        u["kyc"] = k
    for f in ("owner_pan", "business_pan"):
        if u.get(f):
            u[f] = _mask_pan(u[f])
    return u


LIST_PROJECT = {"_id": 0, "photo": 0, "kyc": 0, "bank": 0, "upi": 0, "password_hash": 0, "fcm_tokens": 0,
                "live_location": 0, "shop_photos": 0, "license": 0, "certifications": 0}


# ----------------------------------------------------------------- stat lookups
def _stat_stages(role):
    """$lookup stages that attach real aggregates from the transactional collections."""
    fk = {"customer": "customer_id", "partner": "partner_id", "merchant": "merchant_id"}[role]
    stages = [{
        "$lookup": {
            "from": "bookings", "let": {"uid": "$id"},
            "pipeline": [
                {"$match": {"$expr": {"$eq": [f"${fk}", "$$uid"]}}},
                {"$group": {"_id": None, "n": {"$sum": 1},
                            "done": {"$sum": {"$cond": [{"$in": ["$status", list(DONE)]}, 1, 0]}},
                            "active": {"$sum": {"$cond": [{"$in": ["$status", list(ACTIVE)]}, 1, 0]}},
                            "cancelled": {"$sum": {"$cond": [{"$in": ["$status", list(CANCELLED)]}, 1, 0]}},
                            "spent": {"$sum": {"$cond": [{"$in": ["$status", list(DONE)]}, {"$ifNull": ["$pricing.total", 0]}, 0]}},
                            "gross": {"$sum": {"$ifNull": ["$pricing.total", 0]}},
                            "last": {"$max": "$created_at"}}}],
            "as": "_bs"}},
        {"$addFields": {"_b": {"$ifNull": [{"$arrayElemAt": ["$_bs", 0]}, {}]}}},
        {"$addFields": {"bookings_count": {"$ifNull": ["$_b.n", 0]}, "completed_count": {"$ifNull": ["$_b.done", 0]},
                        "active_count": {"$ifNull": ["$_b.active", 0]}, "cancelled_count": {"$ifNull": ["$_b.cancelled", 0]},
                        "total_spent": {"$round": [{"$ifNull": ["$_b.spent", 0]}, 2]},
                        "gross_value": {"$round": [{"$ifNull": ["$_b.gross", 0]}, 2]},
                        "last_booking_at": "$_b.last"}},
        {"$project": {"_bs": 0, "_b": 0}},
    ]
    if role == "partner":
        stages += [
            {"$lookup": {"from": "partner_ledger", "let": {"uid": "$id"},
                         "pipeline": [{"$match": {"$expr": {"$eq": ["$partner_id", "$$uid"]}}},
                                      {"$group": {"_id": None,
                                                  "earned": {"$sum": {"$cond": [{"$eq": ["$direction", "credit"]}, "$amount", 0]}},
                                                  "debited": {"$sum": {"$cond": [{"$eq": ["$direction", "debit"]}, "$amount", 0]}}}}],
                         "as": "_pl"}},
            {"$addFields": {"_p": {"$ifNull": [{"$arrayElemAt": ["$_pl", 0]}, {}]}}},
            {"$addFields": {"total_earned": {"$round": [{"$ifNull": ["$_p.earned", 0]}, 2]},
                            "total_debited": {"$round": [{"$ifNull": ["$_p.debited", 0]}, 2]}}},
            {"$lookup": {"from": "partner_profiles", "let": {"uid": "$id"},
                         "pipeline": [{"$match": {"$expr": {"$eq": ["$user_id", "$$uid"]}}},
                                      {"$project": {"_id": 0, "completion_score": 1, "status": 1}}], "as": "_pp"}},
            {"$addFields": {"_prof": {"$arrayElemAt": ["$_pp", 0]}}},
            {"$project": {"_pl": 0, "_p": 0, "_pp": 0}},
        ]
    if role == "merchant":
        stages += [
            {"$lookup": {"from": "merchant_ledger", "let": {"uid": "$id"},
                         "pipeline": [{"$match": {"$expr": {"$eq": ["$merchant_id", "$$uid"]}}},
                                      {"$group": {"_id": None,
                                                  "earned": {"$sum": {"$cond": [{"$eq": ["$direction", "credit"]}, "$amount", 0]}},
                                                  "debited": {"$sum": {"$cond": [{"$eq": ["$direction", "debit"]}, "$amount", 0]}}}}],
                         "as": "_ml"}},
            {"$addFields": {"_m": {"$ifNull": [{"$arrayElemAt": ["$_ml", 0]}, {}]}}},
            {"$addFields": {"total_earned": {"$round": [{"$ifNull": ["$_m.earned", 0]}, 2]},
                            "total_debited": {"$round": [{"$ifNull": ["$_m.debited", 0]}, 2]}}},
            {"$lookup": {"from": "users", "let": {"uid": "$id"},
                         "pipeline": [{"$match": {"$expr": {"$and": [{"$eq": ["$referred_by_merchant", "$$uid"]}, {"$eq": ["$role", "partner"]}]}}},
                                      {"$count": "n"}], "as": "_np"}},
            {"$addFields": {"network_partners": {"$ifNull": [{"$arrayElemAt": ["$_np.n", 0]}, 0]}}},
            {"$lookup": {"from": "merchant_profiles", "let": {"uid": "$id"},
                         "pipeline": [{"$match": {"$expr": {"$eq": ["$user_id", "$$uid"]}}},
                                      {"$project": {"_id": 0, "completion_score": 1, "status": 1}}], "as": "_mp"}},
            {"$addFields": {"_prof": {"$arrayElemAt": ["$_mp", 0]}}},
            {"$project": {"_ml": 0, "_m": 0, "_np": 0, "_mp": 0}},
        ]
    stages.append({"$addFields": {"last_activity_at": {"$max": ["$created_at", "$last_login_at", "$profile_updated_at",
                                                                  "$last_booking_at", "$last_status_change_at"]}}})
    return stages


def _post_row(role, r):
    r.pop("_id", None)
    prof = r.pop("_prof", None)
    r["profile_completion"] = _completion(r, prof)
    if role == "customer":
        r.update(_loyalty(r.get("total_spent", 0)))
        addrs = r.get("addresses") or []
        d = next((a for a in addrs if a.get("is_default")), addrs[0] if addrs else {})
        r["city"] = r.get("city") or d.get("city") or ""
        r["address_count"] = len(addrs)
    r.pop("addresses", None)
    r["is_online"] = (r.get("partner_status") == "online") if role == "partner" else None
    r["blocked"] = bool(r.get("blocked"))
    if r.get("blocked"):
        r["status_label"] = "blocked"
    elif r.get("suspended"):
        r["status_label"] = "suspended"
    else:
        r["status_label"] = r.get("status") or "active"
    return r


# ----------------------------------------------------------------- list
async def list_people(role: str, p: dict):
    if role not in ROLES:
        raise HTTPException(404, "Unknown role")
    m = {"role": role}
    # Hide soft-deleted accounts by default; ?deleted=1 shows the 30-day recycle bin.
    if str(p.get("deleted") or "").lower() in ("1", "true", "yes"):
        m["deleted"] = True
    else:
        m["deleted"] = {"$ne": True}
    q = (p.get("q") or "").strip()
    if q:
        ors = [{"name": _rx(q)}, {"phone": _rx(q)}, {"email": _rx(q)}, {"id": _rx(q)},
               {"partner_code": _rx(q)}, {"merchant_code": _rx(q)}, {"shop_name": _rx(q)}]
        if role == "customer":
            bk = await db.bookings.find({"$or": [{"booking_code": _rx(q)}, {"code": _rx(q)}]},
                                        {"_id": 0, "customer_id": 1}).limit(50).to_list(50)
            ids = list({b["customer_id"] for b in bk if b.get("customer_id")})
            if ids:
                ors.append({"id": {"$in": ids}})
        m["$or"] = ors
    st = p.get("status")
    if st == "blocked":
        m["blocked"] = True
    elif st == "suspended":
        m["suspended"] = True
    elif st:
        m["status"] = st
        m["blocked"] = {"$ne": True}
    if p.get("kyc"):
        m["kyc_status"] = p["kyc"]
    if p.get("approval") == "pending":
        m["kyc_status"] = {"$in": ["pending", "submitted", "under_review"]}
    elif p.get("approval") in ("approved", "rejected"):
        m["kyc_status"] = p["approval"]
    if p.get("verified") in ("yes", "no") and role == "merchant":
        m["verified_merchant"] = p["verified"] == "yes"
    if p.get("city"):
        m["$and"] = m.get("$and", []) + [{"$or": [{"city": _rx(p["city"])}, {"addresses.city": _rx(p["city"])}]}]
    if p.get("online") in ("online", "offline") and role == "partner":
        m["partner_status"] = p["online"] if p["online"] == "online" else {"$ne": "online"}
    if p.get("pro") and role == "partner":
        # AzoApp Pro directory — only premium (Starter-Kit) partners
        m["premium_partner"] = True
    if p.get("skill"):
        m["skills"] = p["skill"]
    if p.get("category"):
        m["$and"] = m.get("$and", []) + [{"$or": [{"skills": p["category"]}, {"categories": p["category"]}, {"shop_type": _rx(p["category"])}]}]
    if p.get("shop_type"):
        m["shop_type"] = _rx(p["shop_type"])
    if p.get("profile_update") == "unread":
        m["profile_update_unreviewed"] = True
    elif p.get("profile_update") == "any":
        m["profile_updated_at"] = {"$exists": True}
    elif p.get("profile_update") == "none":
        m["profile_updated_at"] = {"$exists": False}
    m.update(_range("created_at", p.get("joined_from"), p.get("joined_to")))
    if p.get("min_rating"):
        m["rating"] = {"$gte": float(p["min_rating"])}
    if p.get("min_wallet") or p.get("max_wallet"):
        r = {}
        if p.get("min_wallet"):
            r["$gte"] = float(p["min_wallet"])
        if p.get("max_wallet"):
            r["$lte"] = float(p["max_wallet"])
        m["wallet_balance"] = r

    pipeline = [{"$match": m}, {"$project": LIST_PROJECT}] + _stat_stages(role)

    post = {}
    if p.get("min_bookings"):
        post.setdefault("bookings_count", {})["$gte"] = int(p["min_bookings"])
    if p.get("max_bookings"):
        post.setdefault("bookings_count", {})["$lte"] = int(p["max_bookings"])
    if p.get("min_spent"):
        post.setdefault("total_spent", {})["$gte"] = float(p["min_spent"])
    if p.get("max_spent"):
        post.setdefault("total_spent", {})["$lte"] = float(p["max_spent"])
    if p.get("tier") and role == "customer":
        lo, hi = _tier_bounds(p["tier"])
        if lo is not None:
            post.setdefault("total_spent", {})["$gte"] = lo
            if hi is not None:
                post.setdefault("total_spent", {})["$lt"] = hi
    post.update(_range("last_activity_at", p.get("active_from"), p.get("active_to")))
    if p.get("min_completion"):
        # completion needs python; approximate by requiring a registration profile score when present
        pass
    if post:
        pipeline.append({"$match": post})

    sort = p.get("sort") or "priority"
    order = -1 if (p.get("order") or "desc") == "desc" else 1
    SORTS = {"created_at": "created_at", "name": "name", "bookings": "bookings_count", "spent": "total_spent",
             "wallet": "wallet_balance", "rating": "rating", "last_active": "last_activity_at",
             "earned": "total_earned", "completed": "completed_count", "kyc": "kyc_status", "city": "city",
             "updated": "profile_updated_at"}
    if sort == "priority":
        pipeline.append({"$addFields": {"_prio": {"$cond": [{"$eq": ["$profile_update_unreviewed", True]}, 1, 0]}}})
        pipeline.append({"$sort": {"_prio": -1, "profile_updated_at": -1, "created_at": -1}})
    else:
        pipeline.append({"$sort": {SORTS.get(sort, "created_at"): order, "created_at": -1}})

    page, page_size = _pg(p.get("page"), p.get("page_size"))
    pipeline.append({"$facet": {"meta": [{"$count": "total"}],
                                "items": [{"$skip": (page - 1) * page_size}, {"$limit": page_size}]}})
    res = await db.users.aggregate(pipeline).to_list(1)
    res = res[0] if res else {"meta": [], "items": []}
    total = res["meta"][0]["total"] if res["meta"] else 0
    items = [_post_row(role, r) for r in res["items"]]
    for r in items:
        r.pop("_prio", None)
    return {"items": items, "total": total, "page": page, "page_size": page_size,
            "pages": max(1, -(-total // page_size))}


# ----------------------------------------------------------------- kpis / facets
async def kpis(role: str, pro: bool = False):
    if role not in ROLES:
        raise HTTPException(404, "Unknown role")
    now = datetime.now(timezone.utc)
    d30 = (now - timedelta(days=30)).isoformat()
    base = {"role": role, "deleted": {"$ne": True}}
    if pro and role == "partner":
        base["premium_partner"] = True
    out = {"total": await db.users.count_documents(base),
           "new_30d": await db.users.count_documents({**base, "created_at": {"$gte": d30}}),
           "blocked": await db.users.count_documents({**base, "$or": [{"blocked": True}, {"suspended": True}, {"status": {"$in": ["blocked", "suspended"]}}]}),
           "unread_updates": await db.profile_changes.count_documents({"role": role, "reviewed": False})}
    wallet = await db.users.aggregate([{"$match": base}, {"$group": {"_id": None, "w": {"$sum": {"$ifNull": ["$wallet_balance", 0]}}}}]).to_list(1)
    out["wallet_total"] = round((wallet[0]["w"] if wallet else 0) or 0, 2)
    fk = {"customer": "customer_id", "partner": "partner_id", "merchant": "merchant_id"}[role]
    ids = [u["id"] async for u in db.users.find(base, {"_id": 0, "id": 1})]
    bk = await db.bookings.aggregate([
        {"$match": {fk: {"$in": ids}}},
        {"$group": {"_id": None, "n": {"$sum": 1},
                    "done": {"$sum": {"$cond": [{"$in": ["$status", list(DONE)]}, 1, 0]}},
                    "active": {"$sum": {"$cond": [{"$in": ["$status", list(ACTIVE)]}, 1, 0]}},
                    "gmv": {"$sum": {"$cond": [{"$in": ["$status", list(DONE)]}, {"$ifNull": ["$pricing.total", 0]}, 0]}}}}]).to_list(1)
    b = bk[0] if bk else {}
    out.update({"bookings": b.get("n", 0), "completed": b.get("done", 0), "active_bookings": b.get("active", 0),
                "gmv": round(b.get("gmv", 0) or 0, 2)})
    if role == "customer":
        out["with_bookings"] = len(await db.bookings.distinct("customer_id", {"customer_id": {"$in": ids}}))
        out["avg_order_value"] = round(out["gmv"] / out["completed"], 2) if out["completed"] else 0
    if role == "partner":
        out["online"] = await db.users.count_documents({**base, "partner_status": "online"})
        out["kyc_approved"] = await db.users.count_documents({**base, "kyc_status": "approved"})
        out["kyc_pending"] = await db.users.count_documents({**base, "kyc_status": {"$in": ["pending", "submitted", "under_review"]}})
        rt = await db.users.aggregate([{"$match": {**base, "rating": {"$gt": 0}}}, {"$group": {"_id": None, "r": {"$avg": "$rating"}}}]).to_list(1)
        out["avg_rating"] = round((rt[0]["r"] if rt else 0) or 0, 2)
        pl = await db.partner_ledger.aggregate([{"$match": {"direction": "credit"}}, {"$group": {"_id": None, "s": {"$sum": "$amount"}}}]).to_list(1)
        out["total_earned"] = round((pl[0]["s"] if pl else 0) or 0, 2)
    if role == "merchant":
        out["kyc_approved"] = await db.users.count_documents({**base, "kyc_status": "approved"})
        out["verified"] = await db.users.count_documents({**base, "verified_merchant": True})
        out["network_partners"] = await db.users.count_documents({"role": "partner", "referred_by_merchant": {"$in": ids}})
        ml = await db.merchant_ledger.aggregate([{"$match": {"direction": "credit"}}, {"$group": {"_id": None, "s": {"$sum": "$amount"}}}]).to_list(1)
        out["total_earned"] = round((ml[0]["s"] if ml else 0) or 0, 2)
    return out


async def pending_counts() -> dict:
    """Live count of partners / merchants awaiting admin approval (KYC not yet
    approved). Powers the 'Pending approval' menu badges."""
    pend = {"$in": ["pending", "submitted", "under_review"]}
    partner = await db.users.count_documents({"role": "partner", "kyc_status": pend, "deleted": {"$ne": True}})
    merchant = await db.users.count_documents({"role": "merchant", "kyc_status": pend, "deleted": {"$ne": True}})
    return {"partner": partner, "merchant": merchant, "total": partner + merchant}



async def facets(role: str):
    base = {"role": role, "deleted": {"$ne": True}}
    cities = set(c for c in await db.users.distinct("city", base) if c)
    if role == "customer":
        cities |= set(c for c in await db.users.distinct("addresses.city", base) if c)
    out = {"cities": sorted(cities),
           "statuses": sorted(s for s in await db.users.distinct("status", base) if s),
           "kyc_statuses": sorted(s for s in await db.users.distinct("kyc_status", base) if s and s != "na")}
    if role == "partner":
        out["skills"] = sorted(s for s in await db.users.distinct("skills", base) if s)
    if role == "merchant":
        out["shop_types"] = sorted(s for s in await db.users.distinct("shop_type", base) if s)
        out["categories"] = sorted(s for s in await db.users.distinct("categories", base) if s)
    if role == "customer":
        from controllers.admin_controller import LOYALTY_TIERS
        out["tiers"] = [{"key": t["key"], "label": t["label"]} for t in LOYALTY_TIERS]
    cats = await db.categories.find({}, {"_id": 0, "slug": 1, "name": 1}).to_list(100)
    out["service_categories"] = cats
    return out


# ----------------------------------------------------------------- overview
async def _user(role, uid):
    u = await db.users.find_one({"id": uid, "role": role}, {"_id": 0})
    if not u:
        raise HTTPException(404, "User not found")
    return u


async def overview(role: str, uid: str):
    u = await _user(role, uid)
    rows = await db.users.aggregate([{"$match": {"id": uid}}, {"$project": LIST_PROJECT}] + _stat_stages(role)).to_list(1)
    st = _post_row(role, rows[0]) if rows else {}
    stats = {k: st.get(k) for k in ("bookings_count", "completed_count", "active_count", "cancelled_count", "total_spent",
                                    "gross_value", "last_booking_at", "total_earned", "total_debited", "network_partners",
                                    "profile_completion", "last_activity_at", "tier", "tier_label", "tier_color",
                                    "tier_perks", "next_tier", "amount_to_next_tier") if k in st}
    stats["wallet"] = u.get("wallet_balance", 0)
    stats["avg_order_value"] = round(stats.get("total_spent", 0) / stats["completed_count"], 2) if stats.get("completed_count") else 0
    out = {"user": _sanitize(u), "stats": stats,
           "unread_updates": await db.profile_changes.count_documents({"user_id": uid, "reviewed": False}),
           "last_update": await db.profile_changes.find_one({"user_id": uid}, {"_id": 0}, sort=[("changed_at", -1)])}
    out["user"]["status_label"] = st.get("status_label", u.get("status", "active"))
    if role == "customer":
        refunds = await db.refunds.aggregate([{"$match": {"$or": [{"customer_id": uid}, {"customer_phone": u.get("phone", "__")}]}},
                                              {"$group": {"_id": None, "n": {"$sum": 1}, "s": {"$sum": {"$ifNull": ["$refund_amount", "$amount"]}}}}]).to_list(1)
        stats["refunds_count"] = refunds[0]["n"] if refunds else 0
        stats["total_refunded"] = round((refunds[0]["s"] if refunds else 0) or 0, 2)
        tx = await db.transactions.aggregate([{"$match": {"user_id": uid}}, {"$group": {"_id": "$type", "s": {"$sum": "$amount"}, "n": {"$sum": 1}}}]).to_list(5)
        stats["wallet_credits"] = round(sum(t["s"] for t in tx if t["_id"] == "credit"), 2)
        stats["wallet_debits"] = round(sum(t["s"] for t in tx if t["_id"] == "debit"), 2)
        stats["total_paid"] = stats.get("total_spent", 0)
        stats["invoices_count"] = await db.invoices.count_documents({"customer_id": uid})
        stats["addresses"] = len(u.get("addresses") or [])
        stats["loyalty_points"] = u.get("loyalty_points", 0)
        stats["referral_code"] = u.get("referral_code")
        stats["referrals_count"] = await db.users.count_documents({"referred_by_customer": uid})
        stats["referral_rewards"] = round(sum(t["s"] for t in await db.transactions.aggregate(
            [{"$match": {"user_id": uid, "type": "credit", "kind": {"$regex": "referral", "$options": "i"}}},
             {"$group": {"_id": None, "s": {"$sum": "$amount"}}}]).to_list(1)), 2)
        mem = await db.membership_purchases.find_one({"user_id": uid, "status": {"$in": ["active", "paid"]}}, {"_id": 0}, sort=[("created_at", -1)])
        out["membership"] = mem
    if role == "partner":
        prof_full = await db.partner_profiles.find_one({"user_id": uid}, {"_id": 0})
        out["profile"] = {k: v for k, v in (prof_full or {}).items() if k != "documents"}
        _enrich_user_from_partner_profile(out["user"], prof_full)
        out["skills"] = await db.partner_skills.find({"partner_id": uid}, {"_id": 0}).to_list(50)
        out["bank_count"] = await db.partner_bank_accounts.count_documents({"partner_id": uid})
        pan = await db.partner_pan.find_one({"partner_id": uid}, {"_id": 0})
        out["pan_status"] = (pan or {}).get("status")
        stats["withdrawn"] = round(sum(w.get("amount", 0) for w in await db.partner_withdrawals.find(
            {"partner_id": uid, "status": {"$in": ["paid", "completed", "approved", "processed"]}}, {"_id": 0, "amount": 1}).to_list(1000)), 2)
        stats["pending_withdrawals"] = await db.partner_withdrawals.count_documents({"partner_id": uid, "status": {"$in": ["pending", "requested", "processing"]}})
        now = datetime.now(timezone.utc)
        for key, days in (("today", 0), ("week", 7), ("month", 30)):
            since = (now - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat() if days == 0 else (now - timedelta(days=days)).isoformat()
            agg = await db.partner_ledger.aggregate([{"$match": {"partner_id": uid, "direction": "credit", "kind": "earning", "created_at": {"$gte": since}}},
                                                     {"$group": {"_id": None, "s": {"$sum": "$amount"}}}]).to_list(1)
            stats[f"earned_{key}"] = round((agg[0]["s"] if agg else 0) or 0, 2)
        stats["penalties"] = await db.partner_penalties.count_documents({"partner_id": uid})
        stats["incentives"] = await db.partner_incentive_awards.count_documents({"partner_id": uid})
        stats["starter_kit"] = u.get("starter_kit")
    if role == "merchant":
        out["profile"] = await db.merchant_profiles.find_one({"user_id": uid}, {"_id": 0})
        _enrich_user_from_merchant_profile(out["user"], out["profile"])
        if out["profile"] and isinstance(out["profile"].get("shop"), dict):
            for k in ("gstin", "license", "shop_photo", "shop_photos"):
                if out["profile"]["shop"].get(k) and k != "gstin":
                    out["profile"]["shop"][k] = "[on file]"
        out["bank_count"] = await db.merchant_bank_accounts.count_documents({"merchant_id": uid})
        pan = await db.merchant_pan.find_one({"merchant_id": uid}, {"_id": 0})
        out["pan_status"] = (pan or {}).get("status")
        stats["customers"] = len(await db.bookings.distinct("customer_id", {"merchant_id": uid})) or await db.merchant_customers.count_documents({"merchant_id": uid, "deleted": {"$ne": True}})
        stats["withdrawn"] = round(sum(w.get("amount", 0) for w in await db.merchant_withdrawals.find(
            {"merchant_id": uid, "status": {"$in": ["paid", "completed", "approved", "processed"]}}, {"_id": 0, "amount": 1}).to_list(1000)), 2)
        stats["referral_earning"] = round(sum(r.get("commission_total", r.get("total_commission", 0)) or 0 for r in await db.merchant_partner_referrals.find({"merchant_id": uid}, {"_id": 0}).to_list(500)), 2)
        refunds = await db.refunds.aggregate([{"$lookup": {"from": "bookings", "localField": "booking_id", "foreignField": "id", "as": "b"}},
                                              {"$match": {"b.merchant_id": uid}}, {"$count": "n"}]).to_list(1)
        stats["refunds_count"] = refunds[0]["n"] if refunds else 0
    return out


# ----------------------------------------------------------------- approval workflow
PENDING_KYC = ("pending", "under_review", "submitted", "incomplete", "", None)


async def review_person(admin: dict, role: str, uid: str, decision: str, reason: str = ""):
    """Approve or reject a partner / merchant directly from their admin 360 profile.

    Reuses the existing registration services (so notifications + audit fire) and,
    for seeded/onboarded accounts that have no registration profile, updates the
    user record directly. Review metadata (who/when/why) is always persisted on the
    user doc so the admin profile is the single source of truth.
    """
    from config.database import now_iso
    if role not in ("partner", "merchant"):
        raise HTTPException(400, "Only partners and merchants can be approved or rejected")
    u = await _user(role, uid)
    decision = (decision or "").lower().strip()
    if decision not in ("approve", "reject"):
        raise HTTPException(400, "decision must be 'approve' or 'reject'")
    reason = (reason or "").strip()
    if decision == "reject" and not reason:
        raise HTTPException(400, "Rejection reason is required")

    when = now_iso()
    admin_id = admin.get("id")
    admin_name = admin.get("name") or "Admin"

    if role == "merchant":
        from services import merchant_reg_service as mrs
        if decision == "approve":
            await mrs.admin_approve_kyc(admin, uid)
        else:
            await mrs.admin_reject_kyc(admin, uid, reason)
    else:  # partner
        from services import partner_reg_service as prs
        prof = await db.partner_profiles.find_one({"user_id": uid}, {"_id": 0, "id": 1})
        if prof and prof.get("id"):
            if decision == "approve":
                await prs.admin_approve_kyc(admin, prof["id"])
            else:
                await prs.admin_reject_kyc(admin, prof["id"], reason)
        else:
            new_kyc = "approved" if decision == "approve" else "rejected"
            uset = {"kyc_status": new_kyc}
            if decision == "approve":
                uset["verified_partner"] = True
            await db.users.update_one({"id": uid}, {"$set": uset})
            try:
                from services.notification_service import notify
                if decision == "approve":
                    await notify(uid, "Profile Approved 🎉",
                                 "Congratulations! Your partner account has been approved. "
                                 "You can now receive job requests.", link="/partner")
                else:
                    await notify(uid, "KYC Update — Action Needed",
                                 f"Your KYC needs corrections: {reason} Please update the details "
                                 "and resubmit.", link="/partner")
            except Exception:
                pass

    # Unified review metadata on the user doc (single source of truth for admin UI).
    await db.users.update_one({"id": uid}, {"$set": {
        "kyc_reviewed_at": when,
        "kyc_reviewed_by": admin_id,
        "kyc_reviewed_by_name": admin_name,
        "rejection_reason": reason if decision == "reject" else "",
    }})

    try:
        from services import activity_service
        verb = "approved" if decision == "approve" else "rejected"
        await activity_service.log(
            "admin", admin_id, admin_name, f"{role}.kyc.{verb}",
            f"{role.title()} {u.get('name') or ''} {verb}" + (f": {reason}" if decision == "reject" else ""),
            target_id=uid, target_role=role,
            meta={"reason": reason} if decision == "reject" else {})
    except Exception:
        pass

    return {"ok": True, "status": "approved" if decision == "approve" else "rejected",
            "reviewed_at": when, "reviewed_by": admin_name,
            "rejection_reason": reason if decision == "reject" else ""}


# ----------------------------------------------------------------- admin actions (suspend / message / edit)
async def delete_person(admin: dict, role: str, uid: str, reason: str = ""):
    """SOFT-delete a customer / partner / merchant: the account is flagged deleted
    and hidden everywhere, but fully recoverable for 30 days (see restore_person /
    purge_expired_deletions). No data is destroyed here. Guarded: admins, the acting
    admin's own account, and demo accounts cannot be deleted."""
    from config.database import now_iso
    if role not in ("customer", "partner", "merchant"):
        raise HTTPException(400, "Only customers, partners and merchants can be deleted")
    u = await _user(role, uid)
    if u.get("role") in ("admin", "staff"):
        raise HTTPException(400, "Admin/staff accounts cannot be deleted here")
    if u.get("id") == admin.get("id"):
        raise HTTPException(400, "You cannot delete your own account")
    if u.get("deleted"):
        return {"ok": True, "deleted": True, "id": uid, "already": True}
    upd = {"deleted": True, "deleted_at": now_iso(), "deleted_by": admin.get("name") or "Admin",
           "deleted_reason": (reason or "").strip()}
    if role == "partner":
        upd["partner_status"] = "offline"
    await db.users.update_one({"id": uid}, {"$set": upd})
    # Stop any pushes to a removed account (tokens are re-registered on restore+login).
    try:
        await db.fcm_devices.delete_many({"user_id": uid})
    except Exception:  # noqa: BLE001
        pass
    try:
        from services import activity_service
        await activity_service.log("admin", admin.get("id"), admin.get("name") or "Admin",
                                   f"{role}.deleted",
                                   f"{u.get('name') or ''} ({u.get('phone')}) deleted" + (f": {reason}" if reason else ""),
                                   target_id=uid, target_role=role)
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "deleted": True, "id": uid, "soft": True}


async def restore_person(admin: dict, role: str, uid: str):
    """Undo a soft-delete — restore a customer / partner / merchant account."""
    u = await _user(role, uid)
    if not u.get("deleted"):
        return {"ok": True, "restored": True, "id": uid, "already": True}
    await db.users.update_one({"id": uid}, {"$unset": {
        "deleted": "", "deleted_at": "", "deleted_by": "", "deleted_reason": ""}})
    try:
        from services import activity_service
        await activity_service.log("admin", admin.get("id"), admin.get("name") or "Admin",
                                   f"{role}.restored", f"{u.get('name') or ''} ({u.get('phone')}) restored",
                                   target_id=uid, target_role=role)
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "restored": True, "id": uid}


async def bulk_delete(admin: dict, role: str, uids: list, reason: str = ""):
    done, skipped = [], []
    for uid in (uids or [])[:500]:
        try:
            await delete_person(admin, role, uid, reason)
            done.append(uid)
        except HTTPException as e:
            skipped.append({"id": uid, "reason": e.detail})
    return {"ok": True, "deleted": done, "skipped": skipped, "count": len(done)}


async def bulk_restore(admin: dict, role: str, uids: list):
    done = []
    for uid in (uids or [])[:500]:
        try:
            await restore_person(admin, role, uid)
            done.append(uid)
        except HTTPException:
            pass
    return {"ok": True, "restored": done, "count": len(done)}


async def hard_delete_person(admin: dict, role: str, uid: str):
    """PERMANENTLY delete an account now (bypasses the 30-day recycle bin). Removes
    the account + role profile + personal auxiliary data; financial/booking history
    is retained for audit. Same guards as soft-delete."""
    u = await _user(role, uid)
    if u.get("role") in ("admin", "staff"):
        raise HTTPException(400, "Admin/staff accounts cannot be deleted here")
    if u.get("id") == admin.get("id"):
        raise HTTPException(400, "You cannot delete your own account")
    phone = u.get("phone")
    await db.users.delete_one({"id": uid})
    for coll, key in (("partner_profiles", "user_id"), ("merchant_profiles", "user_id"),
                      ("partner_skills", "partner_id"), ("fcm_devices", "user_id"),
                      ("notifications", "user_id"), ("profile_changes", "user_id"),
                      ("push_registration_logs", "user_id")):
        try:
            await db[coll].delete_many({key: uid})
        except Exception:  # noqa: BLE001
            pass
    if phone:
        try:
            await db.otps.delete_many({"phone": phone})
        except Exception:  # noqa: BLE001
            pass
    try:
        from services import activity_service
        await activity_service.log("admin", admin.get("id"), admin.get("name") or "Admin",
                                   f"{role}.purged", f"{u.get('name') or ''} ({phone}) permanently deleted",
                                   target_id=uid, target_role=role)
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "purged": True, "id": uid}


async def bulk_hard_delete(admin: dict, role: str, uids: list, reason: str = ""):
    done, skipped = [], []
    for uid in (uids or [])[:500]:
        try:
            await hard_delete_person(admin, role, uid)
            done.append(uid)
        except HTTPException as e:
            skipped.append({"id": uid, "reason": e.detail})
    return {"ok": True, "purged": done, "skipped": skipped, "count": len(done)}


async def purge_expired_deletions(days: int = 30) -> int:
    """Permanently remove accounts soft-deleted more than `days` ago (+ their profile
    and personal auxiliary data). Financial/booking history is retained for audit."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    stale = await db.users.find({"deleted": True, "deleted_at": {"$lt": cutoff}},
                                {"_id": 0, "id": 1, "phone": 1}).to_list(1000)
    for u in stale:
        uid, phone = u["id"], u.get("phone")
        await db.users.delete_one({"id": uid})
        for coll, key in (("partner_profiles", "user_id"), ("merchant_profiles", "user_id"),
                          ("partner_skills", "partner_id"), ("fcm_devices", "user_id"),
                          ("notifications", "user_id"), ("profile_changes", "user_id"),
                          ("push_registration_logs", "user_id")):
            try:
                await db[coll].delete_many({key: uid})
            except Exception:  # noqa: BLE001
                pass
        if phone:
            try:
                await db.otps.delete_many({"phone": phone})
            except Exception:  # noqa: BLE001
                pass
    return len(stale)


async def set_suspended(admin: dict, role: str, uid: str, suspend: bool, reason: str = "", days: int = 0):
    """Suspend / reinstate any customer, partner or merchant from their 360 profile."""
    from config.database import now_iso
    u = await _user(role, uid)
    aid = admin.get("id"); aname = admin.get("name") or "Admin"
    if suspend:
        reason = (reason or "").strip()
        if not reason:
            raise HTTPException(400, "Suspension reason is required")
        upd = {"suspended": True, "suspend_reason": reason, "suspended_at": now_iso(), "suspended_by": aname}
        try:
            days = int(days or 0)
        except (TypeError, ValueError):
            days = 0
        if days > 0:
            until = datetime.now(timezone.utc) + timedelta(days=days)
            upd["suspend_until"] = until.isoformat(); upd["suspend_days"] = days
        if role == "partner":
            upd["partner_status"] = "offline"
        await db.users.update_one({"id": uid}, {"$set": upd})
        verb = "suspended"
    else:
        await db.users.update_one({"id": uid}, {"$set": {"suspended": False},
                                                "$unset": {"suspend_reason": "", "suspend_until": "", "suspend_days": "",
                                                           "suspended_at": "", "suspended_by": ""}})
        verb = "unsuspended"
    try:
        from services import activity_service
        await activity_service.log("admin", aid, aname, f"{role}.{verb}",
                                   f"{u.get('name') or ''} {verb}" + (f": {reason}" if suspend else ""),
                                   target_id=uid, target_role=role)
    except Exception:
        pass
    try:
        from services.notification_service import notify
        if suspend:
            await notify(uid, "Account suspended", f"Your account has been suspended. {reason}".strip(), link="/")
        else:
            await notify(uid, "Account reinstated", "Good news — your account has been reinstated.", link="/")
    except Exception:
        pass
    return {"ok": True, "suspended": suspend}


async def message_person(admin: dict, role: str, uid: str, data: dict):
    """Send an Email / Push message to a person — either free-text or from a
    Template Manager template (with dynamic variables filled in)."""
    from config.database import get_settings
    from services.template_service import render
    u = await _user(role, uid)
    channel = (data.get("channel") or "push").lower()
    template_id = data.get("template_id")
    variables = data.get("variables") or {}
    subject = (data.get("subject") or "AzoApp").strip() or "AzoApp"
    body = (data.get("body") or data.get("message") or "").strip()

    if template_id:
        tmpl = await db.notification_templates.find_one({"id": template_id}, {"_id": 0})
        if not tmpl:
            raise HTTPException(404, "Template not found")
        channel = (tmpl.get("channel") or channel).lower()
        ctx = {"name": u.get("name") or u.get("shop_name") or "there", "business": "AzoApp",
               "partner_code": u.get("partner_code", ""), "merchant_code": u.get("merchant_code", "")}
        ctx.update({k: str(v) for k, v in variables.items() if v is not None})
        subject = render(tmpl.get("subject") or tmpl.get("title") or tmpl.get("name") or "AzoApp", ctx)
        body = render(tmpl.get("body") or "", ctx)

    if channel not in ("email", "push"):
        raise HTTPException(400, "Only Email and Push messages are supported")
    if not body:
        raise HTTPException(400, "Message body is required")
    link = {"customer": "/customer", "partner": "/partner", "merchant": "/merchant"}.get(role, "/")
    kwargs = {"link": link}
    if channel == "email":
        if not u.get("email"):
            raise HTTPException(400, "This user has no email on file")
        kwargs["email_subject"] = subject; kwargs["email_html"] = body
    from services.notification_service import notify
    res = await notify(uid, subject, body, **kwargs)
    settings = await get_settings()
    integ = settings.get("integrations", {}) or {}
    configured = {"email": bool(integ.get("email_enabled") and integ.get("smtp_host")),
                  "push": True}  # standard Web Push (VAPID) is always available
    try:
        from services import activity_service
        await activity_service.log("admin", admin.get("id"), admin.get("name") or "Admin",
                                   f"{role}.message.{channel}", f"Sent {channel.upper()} to {u.get('name')}: {subject}",
                                   target_id=uid, target_role=role)
    except Exception:
        pass
    note = None
    if not configured.get(channel):
        note = f"{channel.upper()} gateway not configured — delivered as an in-app notification."
    elif channel == "push":
        pr = (res or {}).get("push") or {}
        wp = (res or {}).get("webpush") or {}
        total_success = int(pr.get("success", 0) or 0) + int(wp.get("success", 0) or 0)
        err = pr.get("error") or wp.get("error")
        if total_success == 0 and not err:
            note = ("This user has no device registered for push yet, so an in-app "
                    "notification was sent instead. Live push starts automatically once "
                    "they open the app and allow notifications.")
        elif total_success == 0 and err:
            note = f"Push could not be delivered: {err}"
    elif channel == "email":
        er = (res or {}).get("email") or {}
        if er.get("skipped") or er.get("error"):
            note = ("Email could not be delivered — check SMTP/SendGrid setup in "
                    "Admin → Integrations and the user's email address. An in-app "
                    "notification was sent instead.")
    return {"ok": True, "channel": channel, "channel_configured": configured.get(channel, channel == "push"),
            "note": note, "result": res}


EDITABLE_FIELDS = {"name", "email", "alternate_mobile", "gender", "dob", "language",
                   "communication_pref", "city", "state", "pincode", "landmark",
                   "company_name", "gst_number", "gstin", "shop_name", "shop_type",
                   "skills", "service_pincodes"}
# Explicitly locked (login identity / verified KYC) — never editable from admin edit.
LOCKED_FIELDS = {"phone", "aadhaar_number", "aadhaar_front_url", "aadhaar_back_url",
                 "pan_url", "photo", "live_photo_url", "education_certificate_url", "education"}


async def edit_person(admin: dict, role: str, uid: str, data: dict):
    """Admin-edit the safe/editable profile fields on any person. Login phone,
    Aadhaar, education and KYC documents are locked and cannot be changed here.
    The change is also recorded in the Profile Changes audit trail."""
    from config.database import now_iso
    u = await _user(role, uid)
    upd = {k: v for k, v in (data or {}).items() if k in EDITABLE_FIELDS}
    if not upd:
        raise HTTPException(400, "No editable fields provided")
    old = {k: u.get(k) for k in upd}
    upd["profile_updated_at"] = now_iso()
    await db.users.update_one({"id": uid}, {"$set": upd})
    # surface the edit in the Profile Changes tab (unmasked, with old → new)
    try:
        from services import profile_audit_service as pa
        new_vals = {k: v for k, v in upd.items() if k != "profile_updated_at"}
        await pa.record_diff({**u, "id": uid, "role": role}, old, new_vals,
                             updated_from="admin panel", section="profile")
    except Exception:  # noqa: BLE001
        pass
    try:
        from services import activity_service
        await activity_service.log("admin", admin.get("id"), admin.get("name") or "Admin",
                                   f"{role}.edited", f"Admin edited {', '.join(k for k in upd if k != 'profile_updated_at')} for {u.get('name') or ''}",
                                   target_id=uid, target_role=role)
    except Exception:
        pass
    return {"ok": True, "updated": [k for k in upd if k != "profile_updated_at"], "user": await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})}




# ----------------------------------------------------------------- generic paged sections
async def _paged(coll, match, p, sort_field="created_at", search_fields=(), date_field="created_at",
                 status_field="status", type_field=None, project=None, post=None):
    match = dict(match)
    q = (p.get("q") or "").strip()
    if q and search_fields:
        match["$or"] = [{f: _rx(q)} for f in search_fields]
    if p.get("status") and status_field:
        match[status_field] = p["status"]
    if p.get("type") and type_field:
        match[type_field] = p["type"]
    match.update(_range(date_field, p.get("date_from"), p.get("date_to")))
    page, page_size = _pg(p.get("page"), p.get("page_size"))
    order = -1 if (p.get("order") or "desc") == "desc" else 1
    sf = p.get("sort") or sort_field
    total = await db[coll].count_documents(match)
    items = await db[coll].find(match, project or {"_id": 0}).sort([(sf, order), ("_id", -1)]) \
        .skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    if post:
        items = [post(i) for i in items]
    return {"items": items, "total": total, "page": page, "page_size": page_size, "pages": max(1, -(-total // page_size))}


def _paginate_list(rows, p):
    page, page_size = _pg(p.get("page"), p.get("page_size"))
    total = len(rows)
    return {"items": rows[(page - 1) * page_size:page * page_size], "total": total, "page": page,
            "page_size": page_size, "pages": max(1, -(-total // page_size))}


def _booking_row(b):
    b.pop("_id", None)
    b.pop("otps", None)
    b.pop("otp", None)
    pr = b.get("pricing") or {}
    b["amount"] = pr.get("total", 0)
    return b


async def _bookings_for(role, uid, p, extra=None):
    fk = {"customer": "customer_id", "partner": "partner_id", "merchant": "merchant_id"}[role]
    m = {fk: uid}
    if extra:
        m.update(extra)
    return await _paged("bookings", m, p, search_fields=("booking_code", "code", "service_name", "customer_name", "partner_name", "merchant_name", "id"),
                        post=_booking_row)


async def _ledger_summary(coll, key, uid):
    rows = await db[coll].aggregate([{"$match": {key: uid}},
                                     {"$group": {"_id": {"d": "$direction", "k": "$kind"}, "s": {"$sum": "$amount"}, "n": {"$sum": 1}}}]).to_list(50)
    out = {"credits": 0, "debits": 0, "by_kind": {}}
    for r in rows:
        d, k = r["_id"].get("d"), r["_id"].get("k") or "other"
        if d == "credit":
            out["credits"] += r["s"]
        else:
            out["debits"] += r["s"]
        out["by_kind"][k] = round(out["by_kind"].get(k, 0) + (r["s"] if d == "credit" else -r["s"]), 2)
    out["credits"] = round(out["credits"], 2)
    out["debits"] = round(out["debits"], 2)
    return out


async def section(role: str, uid: str, name: str, p: dict):
    u = await _user(role, uid)
    if name == "bookings" or name == "jobs":
        return await _bookings_for(role, uid, p)
    if name == "invoices":
        fk = {"customer": "customer_id", "partner": "partner_id", "merchant": "merchant_id"}[role]
        return await _paged("invoices", {fk: uid}, p, search_fields=("invoice_number", "booking_code", "service_name"), type_field="invoice_type",
                            project={"_id": 0, "line_items": 0})
    if name == "refunds":
        if role == "merchant":
            ids = await db.bookings.distinct("id", {"merchant_id": uid})
            m = {"booking_id": {"$in": ids}}
        elif role == "partner":
            ids = await db.bookings.distinct("id", {"partner_id": uid})
            m = {"booking_id": {"$in": ids}}
        else:
            m = {"$or": [{"customer_id": uid}, {"customer_phone": u.get("phone", "__")}]}
        return await _paged("refunds", m, p, search_fields=("booking_code", "service_name", "id", "cancellation_reason"),
                            project={"_id": 0, "webhook_response": 0})
    if name == "wallet":
        if role == "customer":
            res = await _paged("transactions", {"user_id": uid}, p, search_fields=("note", "id", "kind", "booking_code"), type_field="kind")
            res["summary"] = {"balance": u.get("wallet_balance", 0), **await _ledger_summary("transactions", "user_id", uid)}
            # transactions use type credit/debit — recompute credits/debits on `type`
            agg = await db.transactions.aggregate([{"$match": {"user_id": uid}}, {"$group": {"_id": "$type", "s": {"$sum": "$amount"}}}]).to_list(5)
            res["summary"]["credits"] = round(sum(a["s"] for a in agg if a["_id"] == "credit"), 2)
            res["summary"]["debits"] = round(sum(a["s"] for a in agg if a["_id"] == "debit"), 2)
            return res
        coll, key = ("partner_ledger", "partner_id") if role == "partner" else ("merchant_ledger", "merchant_id")
        res = await _paged(coll, {key: uid}, p, search_fields=("note", "id", "kind", "ref_id"), type_field="kind")
        res["summary"] = {"balance": u.get("wallet_balance", 0), **await _ledger_summary(coll, key, uid)}
        return res
    if name == "transactions":
        if role == "merchant":
            return await _paged("merchant_ledger", {"merchant_id": uid}, p, search_fields=("note", "id", "kind", "ref_id"), type_field="kind")
        if role == "partner":
            return await _paged("partner_ledger", {"partner_id": uid}, p, search_fields=("note", "id", "kind", "ref_id"), type_field="kind")
        return await _paged("transactions", {"user_id": uid}, p, search_fields=("note", "id", "kind"), type_field="kind")
    if name == "payments":
        if role == "customer":
            return await _paged("payment_transactions", {"$or": [{"customer_id": uid}, {"customer_phone": u.get("phone", "__")}]}, p,
                                search_fields=("booking_code", "txn_ref", "gateway_payment_id", "service_name"), project={"_id": 0, "invoice": 0})
        ids = await db.bookings.distinct("booking_code", {("merchant_id" if role == "merchant" else "partner_id"): uid})
        return await _paged("payment_transactions", {"booking_code": {"$in": ids}}, p,
                            search_fields=("booking_code", "txn_ref", "gateway_payment_id", "service_name"), project={"_id": 0, "invoice": 0})
    if name == "earnings" and role == "partner":
        res = await _paged("partner_ledger", {"partner_id": uid, "direction": "credit", "kind": "earning"}, p, search_fields=("note", "ref_id"))
        ids = [r.get("ref_id") for r in res["items"] if r.get("ref_id")]
        bks = {b["id"]: b for b in await db.bookings.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "booking_code": 1, "service_name": 1,
                                                                                   "customer_name": 1, "pricing": 1, "commission": 1, "status": 1}).to_list(len(ids) or 1)}
        for r in res["items"]:
            b = bks.get(r.get("ref_id")) or {}
            r["booking_code"] = b.get("booking_code")
            r["service_name"] = b.get("service_name")
            r["customer_name"] = b.get("customer_name")
            r["gross"] = (b.get("pricing") or {}).get("total")
            r["commission"] = round((r["gross"] or 0) - (r.get("amount") or 0), 2) if r.get("gross") is not None else None
        return res
    if name == "withdrawals":
        coll, key = ("partner_withdrawals", "partner_id") if role == "partner" else ("merchant_withdrawals", "merchant_id")
        return await _paged(coll, {key: uid}, p, search_fields=("id", "method", "upi_id", "payout.utr", "payout.payout_id"),
                            post=lambda w: {**w, "upi_id": _mask(w.get("upi_id")) if w.get("upi_id") else w.get("upi_id"),
                                            "bank": _mask_bank(w.get("bank")) if isinstance(w.get("bank"), dict) else w.get("bank")})
    if name == "bank":
        coll, key, pan_coll = ("partner_bank_accounts", "partner_id", "partner_pan") if role == "partner" else ("merchant_bank_accounts", "merchant_id", "merchant_pan")
        # NOTE: NO masking on the Bank & KYC tab — admin needs to see full details.
        banks = await db[coll].find({key: uid}, {"_id": 0}).to_list(50)
        bank_docs = []
        for b in banks:
            for f in ("passbook_url", "cancelled_cheque", "cheque_url"):
                if _is_file_value(b.get(f)):
                    bank_docs.append({"type": f"{f}_{b.get('id', '')}", "label": f"{b.get('bank_name') or 'Bank'} — {_DOC_LABELS.get(f, 'Document')}",
                                      "url": b[f], "kind": _doc_kind(b[f])})
        pan = await db[pan_coll].find_one({key: uid}, {"_id": 0})
        pan_docs = []
        if pan:
            for f in ("pan_url", "pan_image", "document_url", "image_url"):
                if _is_file_value(pan.get(f)):
                    pan_docs.append({"type": f, "label": "PAN Card", "url": pan[f], "kind": _doc_kind(pan[f])})
        upi = u.get("upi")
        return {"banks": banks, "pan": pan, "upi": upi,
                "bank_documents": bank_docs, "pan_documents": pan_docs,
                "kyc_status": u.get("kyc_status"), "kyc": u.get("kyc"), "total": len(banks)}
    if name == "kyc":
        prof_coll = "partner_profiles" if role == "partner" else "merchant_profiles"
        prof = await db[prof_coll].find_one({"user_id": uid}, {"_id": 0})
        docs = []
        if prof:
            d = prof.get("documents") or {}
            for k, v in (d.items() if isinstance(d, dict) else []):
                if v in (None, "", [], {}):
                    continue
                docs.append({"type": k, "label": k.replace("_", " ").title(),
                             "value": v if isinstance(v, str) and not (v.startswith("data:") or v.startswith("/uploads") or len(v) > 300) else "[document on file]"})
            # NOTE: keep the raw documents dict around for viewable-doc extraction
            raw_docs = d
        else:
            raw_docs = {}
        vers = await db.partner_verifications.find({"$or": [{"user_id": uid}, {"partner_id": uid}]}, {"_id": 0}).sort("created_at", -1).to_list(50) if role == "partner" else []
        # Actual uploaded files (image/pdf) so admin can view the submitted documents.
        viewable = _collect_viewable_docs(raw_docs, (prof or {}).get("basic"), (prof or {}).get("address"))
        if role == "merchant":
            viewable += _collect_viewable_docs({k: u.get(k) for k in ("gstin_url", "gst_url", "license", "license_url", "shop_photo", "shop_photo_url", "shop_photos", "pan_url")})
        else:
            viewable += _collect_viewable_docs({k: u.get(k) for k in ("live_photo_url", "photo", "aadhaar_front_url", "aadhaar_back_url", "pan_url")})
        if prof:
            prof.pop("documents", None)
        return {"kyc_status": u.get("kyc_status"), "verification_stage": u.get("verification_stage"),
                "rejection_reason": u.get("kyc_rejection_reason") or (prof or {}).get("rejection_reason"),
                "reviewed_at": (prof or {}).get("reviewed_at"), "submitted_at": (prof or {}).get("submitted_at") or u.get("onboarding_submitted_at"),
                "profile": prof, "documents": docs, "viewable_documents": viewable, "kyc": u.get("kyc"), "verifications": vers,
                "verified": bool(u.get("verified_partner") or u.get("verified_merchant"))}
    if name == "addresses":
        rows = list(u.get("addresses") or [])
        if role == "merchant":
            prof = await db.merchant_profiles.find_one({"user_id": uid}, {"_id": 0, "address": 1})
            if prof and prof.get("address"):
                rows.append({"label": "Shop address", **prof["address"], "source": "registration"})
        if role == "partner":
            prof = await db.partner_profiles.find_one({"user_id": uid}, {"_id": 0, "address": 1})
            if prof and prof.get("address"):
                rows.append({"label": "Registered address", **prof["address"], "source": "registration"})
            if isinstance(u.get("address"), dict):
                rows.append({"label": "Onboarding address", **u["address"], "source": "onboarding"})
        return {"items": rows, "total": len(rows)}
    if name == "referrals":
        if role == "merchant":
            rows = await db.merchant_partner_referrals.find({"merchant_id": uid}, {"_id": 0}).sort("created_at", -1).to_list(500)
            return _paginate_list(rows, p)
        rows = await db.users.find({"referred_by_customer": uid}, {"_id": 0, "id": 1, "name": 1, "phone": 1, "created_at": 1}).sort("created_at", -1).to_list(500)
        refs = {r["referee_id"]: r for r in await db.referrals.find({"referee_id": {"$in": [r["id"] for r in rows]}}, {"_id": 0}).to_list(500)}
        for r in rows:
            r["phone"] = _mask(r.get("phone"), 4)
            rf = refs.get(r["id"]) or {}
            r.update({"reward_amount": rf.get("reward_amount"), "reward_status": "credited" if rf.get("referrer_credited") or rf.get("credited_at") else ("pending" if rf else None),
                      "credited_at": rf.get("credited_at"), "first_booking_id": rf.get("first_booking_id")})
        return {**_paginate_list(rows, p), "code": u.get("referral_code")}
    if name == "loyalty":
        res = await _paged("loyalty_ledger", {"user_id": uid}, p, search_fields=("note", "ref_code"), type_field="direction")
        res["summary"] = {"points": u.get("loyalty_points", 0), **_loyalty(0)}
        spent = await db.bookings.aggregate([{"$match": {"customer_id": uid, "status": {"$in": list(DONE)}}}, {"$group": {"_id": None, "s": {"$sum": "$pricing.total"}}}]).to_list(1)
        res["summary"].update(_loyalty((spent[0]["s"] if spent else 0) or 0))
        res["summary"]["lifetime_spend"] = round((spent[0]["s"] if spent else 0) or 0, 2)
        return res
    if name == "rewards" and role == "partner":
        inc = await db.partner_incentive_awards.find({"partner_id": uid}, {"_id": 0}).to_list(500)
        pen = await db.partner_penalties.find({"partner_id": uid}, {"_id": 0}).to_list(500)
        bonus = await db.partner_ledger.find({"partner_id": uid, "kind": {"$in": ["accept_streak_bonus", "incentive", "bonus", "reward"]}}, {"_id": 0}).to_list(500)
        rows = [{"kind": "incentive", **r} for r in inc] + [{"kind": "penalty", **r} for r in pen] + [{"kind": r.get("kind"), **r} for r in bonus]
        rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
        q = (p.get("q") or "").lower()
        if q:
            rows = [r for r in rows if q in str(r).lower()]
        if p.get("type"):
            rows = [r for r in rows if r.get("kind") == p["type"]]
        return _paginate_list(rows, p)
    if name == "starter-kit":
        rows = await db.starter_kit_purchases.find({"user_id": uid}, {"_id": 0}).sort("created_at", -1).to_list(200)
        return {**_paginate_list(rows, p), "starter_kit": u.get("starter_kit")}
    if name == "skills" and role == "partner":
        sk = await db.partner_skills.find({"partner_id": uid}, {"_id": 0}).to_list(100)
        certs = await db.partner_certificates.find({"partner_id": uid}, {"_id": 0}).to_list(100)
        for c in certs:
            for f in ("file", "file_url", "url", "image"):
                if c.get(f):
                    c[f] = "[document on file]"
        return {"skills": sk, "user_skills": u.get("skills") or [], "certificates": certs, "total": len(sk)}
    if name == "customers" and role == "merchant":
        rows = await db.bookings.aggregate([{"$match": {"merchant_id": uid}},
                                            {"$group": {"_id": "$customer_id", "name": {"$last": "$customer_name"}, "phone": {"$last": "$customer_phone"},
                                                        "bookings": {"$sum": 1}, "spent": {"$sum": {"$cond": [{"$in": ["$status", list(DONE)]}, {"$ifNull": ["$pricing.total", 0]}, 0]}},
                                                        "last_at": {"$max": "$created_at"}, "first_at": {"$min": "$created_at"}}},
                                            {"$sort": {"last_at": -1}}]).to_list(2000)
        for r in rows:
            r["customer_id"] = r.pop("_id")
            r["spent"] = round(r["spent"] or 0, 2)
        crm = await db.merchant_customers.find({"merchant_id": uid, "deleted": {"$ne": True}}, {"_id": 0}).to_list(2000)
        seen = {r.get("phone") for r in rows}
        for c in crm:
            if c.get("phone") not in seen:
                rows.append({"customer_id": c.get("customer_user_id"), "name": c.get("name"), "phone": c.get("phone"), "bookings": 0, "spent": 0,
                             "last_at": c.get("updated_at"), "first_at": c.get("created_at"), "source": c.get("source") or "crm", "city": c.get("city")})
        q = (p.get("q") or "").lower()
        if q:
            rows = [r for r in rows if q in (str(r.get("name") or "") + str(r.get("phone") or "")).lower()]
        return _paginate_list(rows, p)
    if name == "network" and role == "merchant":
        rows = await db.users.find({"role": "partner", "referred_by_merchant": uid},
                                   {"_id": 0, "id": 1, "name": 1, "phone": 1, "kyc_status": 1, "jobs_completed": 1, "rating": 1,
                                    "partner_status": 1, "partner_code": 1, "created_at": 1, "city": 1}).sort("created_at", -1).to_list(1000)
        return _paginate_list(rows, p)
    if name == "profile-changes":
        from services import profile_audit_service as pa
        return await pa.list_changes(role=role, status=p.get("status") or "all", q=p.get("q") or "", user_id=uid,
                                     date_from=p.get("date_from") or "", date_to=p.get("date_to") or "",
                                     page=int(p.get("page") or 1), page_size=int(p.get("page_size") or 25))
    if name == "notifications":
        return await _paged("notifications", {"user_id": uid}, p, search_fields=("title", "body"), type_field="kind", status_field=None)
    if name == "logs":
        rows = await db.activity_logs.find({"$or": [{"target_id": uid}, {"actor_id": uid}]}, {"_id": 0, "ts": 0}).sort("created_at", -1).to_list(2000)
        rows += [{"id": a.get("id"), "action": a.get("action"), "detail": a.get("detail") or a.get("reason") or "", "actor_role": a.get("role") or "admin",
                  "actor_name": a.get("actor_name") or a.get("by") or a.get("actor") or "Admin", "created_at": a.get("created_at") or a.get("at"), "meta": a.get("meta") or {}}
                 for a in await db.audit_logs.find({"$or": [{"target_id": uid}, {"partner_id": uid}, {"user_id": uid}]}, {"_id": 0}).to_list(2000)]
        rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
        q = (p.get("q") or "").lower()
        if q:
            rows = [r for r in rows if q in str(r).lower()]
        if p.get("type"):
            rows = [r for r in rows if r.get("actor_role") == p["type"]]
        if p.get("date_from"):
            rows = [r for r in rows if (r.get("created_at") or "") >= p["date_from"]]
        if p.get("date_to"):
            rows = [r for r in rows if (r.get("created_at") or "") <= _end(p["date_to"])]
        return _paginate_list(rows, p)
    if name == "activity":
        return await activity(role, u, p)
    raise HTTPException(404, f"Unknown section '{name}' for {role}")


# ----------------------------------------------------------------- universal activity timeline
STATUS_TITLES = {"searching": "Searching for partner", "assigned": "Partner assigned", "arrived_shop": "Partner at shop",
                 "arrived_customer": "Partner arrived", "started": "Service started", "completed": "Service completed",
                 "paid": "Payment received", "payment_received": "Payment received", "cancelled": "Booking cancelled",
                 "rejected": "Booking rejected", "pending_payment": "Awaiting payment", "pending": "Booking pending",
                 "on_hold": "Booking on hold", "expired": "Booking expired"}


async def activity(role: str, u: dict, p: dict):
    uid = u["id"]
    ev = []

    def add(at, typ, title, detail="", group="user", status=None, ref=None, amount=None):
        if not at:
            return
        ev.append({"id": f"{typ}:{ref or ''}:{at}", "at": at, "type": typ, "title": title, "detail": detail or "",
                   "group": group, "status": status, "ref": ref, "amount": amount})

    add(u.get("created_at"), "account_created", "Account created", f"Joined as {role}", "system")
    if u.get("onboarding_submitted_at"):
        add(u["onboarding_submitted_at"], "kyc_submitted", "KYC / onboarding submitted", "", "user")
    if u.get("kyc_reviewed_at") or u.get("kyc_approved_at"):
        add(u.get("kyc_approved_at") or u.get("kyc_reviewed_at"), "kyc_reviewed", f"KYC {u.get('kyc_status', '')}", "", "admin", status=u.get("kyc_status"))
    if u.get("last_login_at"):
        add(u["last_login_at"], "login", "Last login", "", "user")

    fk = {"customer": "customer_id", "partner": "partner_id", "merchant": "merchant_id"}[role]
    async for b in db.bookings.find({fk: uid}, {"_id": 0, "id": 1, "booking_code": 1, "code": 1, "service_name": 1, "status": 1, "created_at": 1,
                                                 "timeline": 1, "pricing": 1, "partner_name": 1, "customer_name": 1, "started_at": 1,
                                                 "completed_at": 1, "paid_at": 1, "cancelled_at": 1}).limit(2000):
        code = b.get("booking_code") or b.get("code") or b["id"][:8]
        amt = (b.get("pricing") or {}).get("total")
        add(b.get("created_at"), "booking_created", f"Booking {code} created", b.get("service_name") or "", "user", b.get("status"), b["id"], amt)
        seen = set()
        for t in (b.get("timeline") or []):
            s = t.get("status")
            if s in seen or not t.get("at"):
                continue
            seen.add(s)
            add(t["at"], f"booking_{s}", f"{STATUS_TITLES.get(s, s.replace('_', ' ').title())} · {code}",
                (b.get("partner_name") and s == "assigned" and f"Partner: {b['partner_name']}") or t.get("reason") or "", "system", s, b["id"])
        for f, s in (("started_at", "started"), ("completed_at", "completed"), ("paid_at", "paid"), ("cancelled_at", "cancelled")):
            if b.get(f) and s not in seen:
                add(b[f], f"booking_{s}", f"{STATUS_TITLES[s]} · {code}", "", "system", s, b["id"])
    if role == "customer":
        async for t in db.transactions.find({"user_id": uid}, {"_id": 0}).limit(2000):
            add(t.get("created_at"), f"wallet_{t.get('type', 'txn')}", f"Wallet {t.get('type', '')} · ₹{t.get('amount', 0)}", t.get("note") or t.get("kind") or "",
                "system", t.get("status") or "completed", t.get("id"), t.get("amount"))
        async for r in db.refunds.find({"$or": [{"customer_id": uid}, {"customer_phone": u.get("phone", "__")}]}, {"_id": 0}).limit(1000):
            add(r.get("created_at") or r.get("initiated_at"), "refund", f"Refund ₹{r.get('refund_amount', r.get('amount', 0))} · {r.get('booking_code', '')}",
                r.get("cancellation_reason") or "", "system", r.get("status"), r.get("id"), r.get("refund_amount", r.get("amount")))
        async for i in db.invoices.find({"customer_id": uid}, {"_id": 0, "invoice_number": 1, "created_at": 1, "total_amount": 1, "id": 1, "status": 1}).limit(1000):
            add(i.get("created_at"), "invoice", f"Invoice {i.get('invoice_number', '')}", "", "system", i.get("status"), i.get("id"), i.get("total_amount"))
        for a in (u.get("addresses") or []):
            if a.get("created_at"):
                add(a["created_at"], "address_added", f"Address added · {a.get('label') or ''}", a.get("line") or "", "user", None, a.get("id"))
    if role in ("partner", "merchant"):
        coll, key = ("partner_ledger", "partner_id") if role == "partner" else ("merchant_ledger", "merchant_id")
        async for t in db[coll].find({key: uid}, {"_id": 0}).limit(3000):
            kind = t.get("kind") or "ledger"
            add(t.get("created_at"), f"wallet_{kind}", f"{kind.replace('_', ' ').title()} · {'+' if t.get('direction') == 'credit' else '-'}₹{t.get('amount', 0)}",
                t.get("note") or "", "system", t.get("status"), t.get("id"), t.get("amount"))
        wcoll = "partner_withdrawals" if role == "partner" else "merchant_withdrawals"
        async for w in db[wcoll].find({key: uid}, {"_id": 0}).limit(1000):
            add(w.get("requested_at") or w.get("created_at"), "withdrawal", f"Withdrawal ₹{w.get('amount', 0)} requested", w.get("method") or "", "user", w.get("status"), w.get("id"), w.get("amount"))
            if w.get("processed_at"):
                add(w["processed_at"], "withdrawal_processed", f"Withdrawal ₹{w.get('amount', 0)} {w.get('status', 'processed')}", "", "admin", w.get("status"), w.get("id"), w.get("amount"))
    if role == "partner":
        async for s in db.starter_kit_purchases.find({"user_id": uid}, {"_id": 0}).limit(100):
            add(s.get("created_at"), "starter_kit", f"Starter kit purchased · ₹{s.get('amount', 0)}", s.get("tracking_status") or "", "user", s.get("status"), s.get("id"), s.get("amount"))
        async for pn in db.partner_penalties.find({"partner_id": uid}, {"_id": 0}).limit(500):
            add(pn.get("created_at"), "penalty", f"Penalty ₹{pn.get('amount', 0)}", pn.get("reason") or "", "admin", pn.get("status"), pn.get("id"), pn.get("amount"))
        async for iw in db.partner_incentive_awards.find({"partner_id": uid}, {"_id": 0}).limit(500):
            add(iw.get("created_at"), "reward", f"Incentive ₹{iw.get('amount', 0)}", iw.get("name") or iw.get("title") or "", "system", iw.get("status"), iw.get("id"), iw.get("amount"))
    if role == "merchant":
        async for r in db.merchant_partner_referrals.find({"merchant_id": uid}, {"_id": 0}).limit(1000):
            add(r.get("created_at"), "referral", f"Partner referred · {r.get('partner_name', '')}", "", "user", r.get("status"), r.get("id"))
    async for c in db.profile_changes.find({"user_id": uid}, {"_id": 0}).limit(2000):
        add(c.get("changed_at"), "profile_updated", "Profile updated", c.get("summary") or "", "user", "reviewed" if c.get("reviewed") else "unreviewed", c.get("id"))
    async for a in db.activity_logs.find({"$or": [{"target_id": uid}, {"actor_id": uid}], "action": {"$ne": "profile_updated"}}, {"_id": 0, "ts": 0}).limit(2000):
        grp = "admin" if a.get("actor_role") == "admin" else ("user" if a.get("actor_id") == uid else "system")
        add(a.get("created_at"), a.get("action") or "activity", (a.get("action") or "Activity").replace("_", " ").title(),
            a.get("detail") or "", grp, None, a.get("id"))
    async for a in db.audit_logs.find({"$or": [{"target_id": uid}, {"partner_id": uid}, {"user_id": uid}]}, {"_id": 0}).limit(2000):
        add(a.get("created_at") or a.get("at"), a.get("action") or "admin_action", (a.get("action") or "Admin action").replace("_", " ").title(),
            a.get("detail") or a.get("reason") or "", "admin", a.get("status"), a.get("id"))

    # filters
    q = (p.get("q") or "").lower()
    if q:
        ev = [e for e in ev if q in (e["title"] + " " + e["detail"] + " " + e["type"]).lower()]
    if p.get("type"):
        types = p["type"].split(",")
        ev = [e for e in ev if any(e["type"] == t or e["type"].startswith(t) for t in types)]
    if p.get("group"):
        ev = [e for e in ev if e["group"] == p["group"]]
    if p.get("status"):
        ev = [e for e in ev if (e.get("status") or "") == p["status"]]
    if p.get("date_from"):
        ev = [e for e in ev if e["at"] >= p["date_from"]]
    if p.get("date_to"):
        ev = [e for e in ev if e["at"] <= _end(p["date_to"])]
    order = (p.get("order") or "desc") == "desc"
    ev.sort(key=lambda e: e["at"], reverse=order)
    res = _paginate_list(ev, p)
    res["types"] = sorted({e["type"].split("_")[0] for e in ev})
    return res


async def booking_detail(role: str, uid: str, bid: str):
    fk = {"customer": "customer_id", "partner": "partner_id", "merchant": "merchant_id"}[role]
    b = await db.bookings.find_one({"id": bid, fk: uid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found for this user")
    b = _booking_row(b)
    tl = list(b.get("timeline") or [])
    seen = {t.get("status") for t in tl}
    for f, s in (("created_at", "created"), ("started_at", "started"), ("completed_at", "completed"), ("paid_at", "paid"), ("cancelled_at", "cancelled")):
        if b.get(f) and s not in seen:
            tl.append({"status": s, "at": b[f]})
    tl.sort(key=lambda t: t.get("at") or "")
    b["timeline_full"] = [{**t, "label": STATUS_TITLES.get(t.get("status"), (t.get("status") or "").replace("_", " ").title())} for t in tl]
    b["invoices"] = await db.invoices.find({"booking_id": bid}, {"_id": 0, "line_items": 0}).to_list(10)
    b["refunds"] = await db.refunds.find({"booking_id": bid}, {"_id": 0, "webhook_response": 0}).to_list(10)
    b["payments"] = await db.payment_transactions.find({"booking_code": b.get("booking_code") or "__"}, {"_id": 0, "invoice": 0}).to_list(10)
    b["commission_ledger"] = await db.commission_ledger.find_one({"booking_code": b.get("booking_code") or "__"}, {"_id": 0})
    return b
