"""Admin proxy for the Merchant Registration wizard.

Lets an admin drive the EXACT same multi-step merchant registration/KYC wizard
on behalf of a merchant — mirroring `partner_reg_proxy_routes` for partners.
Each route resolves a target merchant by user_id and calls the same
`merchant_reg_service` functions the merchant uses, with admin_override so an
already-approved profile can still be corrected by an admin.
"""
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from middleware.auth import require_role
from services import merchant_reg_service as mrs
from services import storage_service

ADMIN = require_role("admin")


async def _target(uid: str):
    u = await db_find_merchant(uid)
    if not u:
        raise HTTPException(404, "Merchant not found")
    return u


async def db_find_merchant(uid: str):
    from config.database import db
    return await db.users.find_one({"id": uid, "role": "merchant"}, {"_id": 0})


router = APIRouter(prefix="/admin", tags=["admin-merchant-registration"])


@router.get("/merchants/{uid}/reg/profile")
async def get_profile(uid: str, actor=Depends(ADMIN)):
    user = await _target(uid)
    p = await mrs.get_or_create_profile(user)
    return {"profile": p, "score": mrs.compute_score(p), "kyc_status": p["status"],
            "rejection_reason": p.get("rejection_reason", "")}


@router.get("/merchants/{uid}/reg/meta")
async def meta(uid: str, actor=Depends(ADMIN)):
    return await mrs.get_registration_meta()


@router.put("/merchants/{uid}/reg/basic")
async def basic(uid: str, data: dict, actor=Depends(ADMIN)):
    return await mrs.save_basic(await _target(uid), data, admin_override=True)


@router.put("/merchants/{uid}/reg/shop")
async def shop(uid: str, data: dict, actor=Depends(ADMIN)):
    return await mrs.save_shop(await _target(uid), data, admin_override=True)


@router.put("/merchants/{uid}/reg/address")
async def address(uid: str, data: dict, actor=Depends(ADMIN)):
    return await mrs.save_address(await _target(uid), data, admin_override=True)


@router.put("/merchants/{uid}/reg/shop-photo")
async def shop_photo(uid: str, data: dict, actor=Depends(ADMIN)):
    return await mrs.save_shop_photo(await _target(uid), data, admin_override=True)


@router.post("/merchants/{uid}/reg/submit")
async def submit(uid: str, actor=Depends(ADMIN)):
    return await mrs.submit_profile(await _target(uid))


@router.post("/merchants/{uid}/reg/upload")
async def upload(uid: str, file: UploadFile = File(...), doc_type: str = Form("document"),
                 actor=Depends(ADMIN)):
    m = await _target(uid)
    raw = await file.read()
    try:
        res = await storage_service.save_document(
            raw, file.content_type or "", file.filename or "",
            folder=storage_service.entity_folder("merchants", m, "kyc"))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"url": res["url"], "name": res.get("name"), "doc_type": doc_type}
