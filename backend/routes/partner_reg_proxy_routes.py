"""Admin/Merchant proxy for the Partner Registration wizard.

Lets an admin or a merchant drive the EXACT same multi-step registration wizard
on behalf of a partner they are creating. Each route resolves a target partner
by user_id and calls the same partner_reg_service functions the partner uses.
"""
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from middleware.auth import require_role
from services import partner_reg_service as prs
from services import storage_service
from config.database import db, now_iso
from models.user import new_id

ADMIN = require_role("admin")
MERCHANT = require_role("merchant")


async def _target(uid, actor=None, as_merchant=False):
    u = await db.users.find_one({"id": uid, "role": "partner"}, {"_id": 0})
    if not u:
        raise HTTPException(404, "Partner not found")
    if as_merchant and actor and u.get("referred_by_merchant") != actor["id"]:
        raise HTTPException(403, "Not your partner")
    return u


async def _create_shell(phone, actor, merchant_id=None):
    phone = (phone or "").strip()
    if not phone:
        raise HTTPException(400, "Phone is required")
    if not phone.startswith("+"):
        phone = "+91" + phone.lstrip("0")
    existing = await db.users.find_one({"phone": phone}, {"_id": 0})
    if existing:
        if existing.get("role") not in (None, "customer", "partner"):
            raise HTTPException(400, "Phone already used by another role")
        upd = {"role": "partner"}
        if merchant_id:
            upd["referred_by_merchant"] = merchant_id
        await db.users.update_one({"id": existing["id"]}, {"$set": upd})
        existing.update(upd)
        user = existing
    else:
        user = {"id": new_id(), "phone": phone, "role": "partner", "name": "",
                "kyc_status": "pending", "partner_status": "offline", "rating": 0,
                "jobs_completed": 0, "wallet_balance": 0, "skills": [],
                "created_at": now_iso(), "created_by_role": actor.get("role")}
        if merchant_id:
            user["referred_by_merchant"] = merchant_id
        await db.users.insert_one(dict(user))
    await prs.get_or_create_profile(user)
    return {"user_id": user["id"], "phone": phone}


async def _profile(user):
    p = await prs.get_or_create_profile(user)
    return {"profile": p, "score": prs.compute_score(p), "kyc_status": p["status"],
            "rejection_reason": p.get("rejection_reason", "")}


async def _upload(file: UploadFile, doc_type: str, aadhaar_number: str, user):
    raw = await file.read()
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    try:
        res = await storage_service.save_document(raw, file.content_type or "", file.filename or "", folder=storage_service.entity_folder("partners", user, "kyc"))
    except ValueError as e:
        raise HTTPException(400, str(e))
    out = {"url": res["url"], "name": res.get("name"), "doc_type": doc_type}
    if doc_type in ("aadhaar_front", "aadhaar_back") and aadhaar_number:
        try:
            out["ocr"] = await prs.aadhaar_ocr(user, raw, ext, aadhaar_number)
        except Exception:  # noqa: BLE001
            pass
    return out


def _build(prefix, dep, as_merchant):
    r = APIRouter(prefix=prefix, tags=[prefix])
    ovr = not as_merchant  # admin can edit approved partners; merchant only creates new ones

    @r.post("/partners/shell")
    async def shell(data: dict, actor=Depends(dep)):
        return await _create_shell(data.get("phone"), actor, merchant_id=actor["id"] if as_merchant else None)

    @r.get("/partners/{uid}/reg/profile")
    async def get_profile(uid: str, actor=Depends(dep)):
        return await _profile(await _target(uid, actor, as_merchant))

    @r.get("/partners/{uid}/reg/meta")
    async def meta(uid: str, actor=Depends(dep)):
        return await prs.get_registration_meta()

    @r.put("/partners/{uid}/reg/basic")
    async def basic(uid: str, data: dict, actor=Depends(dep)):
        return await prs.save_basic(await _target(uid, actor, as_merchant), data, admin_override=ovr)

    @r.put("/partners/{uid}/reg/work")
    async def work(uid: str, data: dict, actor=Depends(dep)):
        return await prs.save_work(await _target(uid, actor, as_merchant), data, admin_override=ovr)

    @r.put("/partners/{uid}/reg/documents")
    async def documents(uid: str, data: dict, actor=Depends(dep)):
        return await prs.save_documents(await _target(uid, actor, as_merchant), data, admin_override=ovr)

    @r.put("/partners/{uid}/reg/address")
    async def address(uid: str, data: dict, actor=Depends(dep)):
        return await prs.save_address(await _target(uid, actor, as_merchant), data, admin_override=ovr)

    @r.post("/partners/{uid}/reg/submit")
    async def submit(uid: str, actor=Depends(dep)):
        return await prs.submit_profile(await _target(uid, actor, as_merchant))

    @r.post("/partners/{uid}/reg/upload")
    async def upload(uid: str, file: UploadFile = File(...), doc_type: str = Form("document"),
                     aadhaar_number: str = Form(""), actor=Depends(dep)):
        return await _upload(file, doc_type, aadhaar_number, await _target(uid, actor, as_merchant))

    return r


admin_reg_router = _build("/admin", ADMIN, as_merchant=False)
merchant_reg_router = _build("/merchant", MERCHANT, as_merchant=True)
