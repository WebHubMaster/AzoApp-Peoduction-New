"""Partner Registration & KYC — partner-facing routes."""
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from middleware.auth import require_role
from services import partner_reg_service as prs
from services import storage_service
from services import geo_data_service as geo

router = APIRouter(prefix="/partner/registration", tags=["partner-registration"])
PARTNER = require_role("partner")


@router.get("/profile")
async def get_profile(user=Depends(PARTNER)):
    p = await prs.get_or_create_profile(user)
    sc = prs.compute_score(p)
    status = p["status"]
    reason = p.get("rejection_reason", "")
    # Fall back to the user record so a KYC rejection done by admin directly on the
    # partner (outside the multi-step registration flow) still surfaces to the partner.
    if user.get("kyc_status") == "rejected" and status != "rejected":
        status = "rejected"
        reason = reason or user.get("kyc_rejection_reason", "")
    return {"profile": p, "score": sc, "kyc_status": status, "rejection_reason": reason}


@router.get("/meta")
async def meta(user=Depends(PARTNER)):
    return await prs.get_registration_meta()


@router.get("/validate-merchant-code")
async def validate_merchant_code(code: str, user=Depends(PARTNER)):
    from services import merchant_code_service
    m = await merchant_code_service.validate_code(code)
    if not m:
        raise HTTPException(400, "Invalid merchant code")
    return {"valid": True, "merchant_name": m.get("shop_name") or m.get("name") or "Merchant"}


@router.put("/basic")
async def save_basic(data: dict, user=Depends(PARTNER)):
    return await prs.save_basic(user, data)


@router.put("/work")
async def save_work(data: dict, user=Depends(PARTNER)):
    return await prs.save_work(user, data)


@router.put("/documents")
async def save_documents(data: dict, user=Depends(PARTNER)):
    return await prs.save_documents(user, data)


@router.put("/address")
async def save_address(data: dict, user=Depends(PARTNER)):
    return await prs.save_address(user, data)


@router.post("/submit")
async def submit(user=Depends(PARTNER)):
    return await prs.submit_profile(user)


@router.post("/upload")
async def upload_doc(file: UploadFile = File(...),
                     doc_type: str = Form("document"),
                     aadhaar_number: str = Form(""),
                     user=Depends(PARTNER)):
    raw = await file.read()
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    try:
        res = await storage_service.save_document(
            raw, file.content_type or "", file.filename or "",
            folder=storage_service.entity_folder("partners", user, "kyc"))
    except (ValueError, OSError) as e:
        raise HTTPException(400, str(e) or "Unsupported or corrupt file. Use a JPG, PNG or PDF.")

    out = {"url": res["url"], "name": res.get("name"), "doc_type": doc_type}
    # Run OCR when an Aadhaar image/pdf is uploaded and a number was entered
    if doc_type in ("aadhaar_front", "aadhaar_back") and aadhaar_number:
        ocr = await prs.aadhaar_ocr(user, raw, ext, aadhaar_number)
        out["ocr"] = ocr
    return out


@router.post("/aadhaar-ocr")
async def aadhaar_ocr(file: UploadFile = File(...),
                      aadhaar_number: str = Form(""),
                      user=Depends(PARTNER)):
    raw = await file.read()
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    return await prs.aadhaar_ocr(user, raw, ext, aadhaar_number)


# ---- location cascade (available to partners during registration) ----
@router.get("/geo/states")
async def states(q: str = "", user=Depends(PARTNER)):
    return await geo.list_states(q)


@router.get("/geo/districts")
async def districts(state: str, q: str = "", user=Depends(PARTNER)):
    return await geo.list_districts(state, q)


@router.get("/geo/cities")
async def cities(state: str, district: str, q: str = "", user=Depends(PARTNER)):
    return await geo.list_cities(state, district, q)


@router.get("/geo/villages")
async def villages(state: str, district: str, city: str, q: str = "", user=Depends(PARTNER)):
    return await geo.list_villages(state, district, city, q)
