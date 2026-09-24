"""Merchant / Shopkeeper Registration & KYC — merchant-facing routes."""
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Request
from middleware.auth import require_role
from services import merchant_reg_service as mrs
from services import storage_service
from services import geo_data_service as geo

router = APIRouter(prefix="/merchant/registration", tags=["merchant-registration"])
MERCHANT = require_role("merchant")


@router.get("/profile")
async def get_profile(user=Depends(MERCHANT)):
    p = await mrs.get_or_create_profile(user)
    sc = mrs.compute_score(p)
    status = p["status"]
    reason = p.get("rejection_reason", "")
    if user.get("kyc_status") == "rejected" and status != "rejected":
        status = "rejected"
        reason = reason or user.get("kyc_rejection_reason", "")
    return {"profile": p, "score": sc, "kyc_status": status, "rejection_reason": reason}


@router.get("/meta")
async def meta(user=Depends(MERCHANT)):
    return await mrs.get_registration_meta()


@router.put("/basic")
async def save_basic(data: dict, user=Depends(MERCHANT)):
    return await mrs.save_basic(user, data)


@router.put("/shop")
async def save_shop(data: dict, user=Depends(MERCHANT)):
    return await mrs.save_shop(user, data)


@router.put("/address")
async def save_address(data: dict, user=Depends(MERCHANT)):
    return await mrs.save_address(user, data)


@router.put("/shop-photo")
async def save_shop_photo(data: dict, user=Depends(MERCHANT)):
    """GPS shop verification photo — validates GPS metadata + matches shop location."""
    return await mrs.save_shop_photo(user, data)


@router.get("/access-state")
async def access_state(user=Depends(MERCHANT)):
    return await mrs.access_state(user)


@router.post("/submit")
async def submit(user=Depends(MERCHANT)):
    return await mrs.submit_profile(user)


@router.post("/upload")
async def upload_doc(request: Request,
                     file: UploadFile = File(...),
                     doc_type: str = Form("document"),
                     user=Depends(MERCHANT)):
    raw = await file.read()
    try:
        res = await storage_service.save_document(
            raw, file.content_type or "", file.filename or "",
            folder=storage_service.entity_folder("merchants", user, "kyc"),
            base_hint=storage_service.request_base(request))
    except (ValueError, OSError) as e:
        raise HTTPException(400, str(e) or "Unsupported or corrupt file. Use a JPG, PNG or PDF.")
    return {"url": res["url"], "name": res.get("name"), "doc_type": doc_type}


# ---- location cascade (available to merchants during registration) ----
@router.get("/geo/states")
async def states(q: str = "", user=Depends(MERCHANT)):
    return await geo.list_states(q)


@router.get("/geo/districts")
async def districts(state: str, q: str = "", user=Depends(MERCHANT)):
    return await geo.list_districts(state, q)


@router.get("/geo/cities")
async def cities(state: str, district: str, q: str = "", user=Depends(MERCHANT)):
    return await geo.list_cities(state, district, q)


@router.get("/geo/villages")
async def villages(state: str, district: str, city: str, q: str = "", user=Depends(MERCHANT)):
    return await geo.list_villages(state, district, city, q)
