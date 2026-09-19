"""Partner Registration & KYC — admin routes (masters + KYC review + FCM config)."""
from fastapi import APIRouter, Depends
from middleware.auth import require_role
from services import partner_reg_service as prs
from services import fcm_service

router = APIRouter(prefix="/admin/partner-reg", tags=["admin-partner-registration"])
ADMIN = require_role("admin")


# ---------------- KYC review ----------------
@router.get("/kyc")
async def list_kyc(status: str = "pending", admin=Depends(ADMIN)):
    return await prs.admin_list_kyc(status)


@router.get("/kyc/{profile_id}")
async def kyc_detail(profile_id: str, admin=Depends(ADMIN)):
    return await prs.admin_kyc_detail(profile_id)


@router.post("/kyc/{profile_id}/approve")
async def approve(profile_id: str, admin=Depends(ADMIN)):
    return await prs.admin_approve_kyc(admin, profile_id)


@router.post("/kyc/{profile_id}/reject")
async def reject(profile_id: str, body: dict, admin=Depends(ADMIN)):
    return await prs.admin_reject_kyc(admin, profile_id, body.get("reason", ""))


# ---------------- Education master ----------------
@router.get("/educations")
async def educations(admin=Depends(ADMIN)):
    return await prs._crud_list("partner_educations")


@router.post("/educations")
async def create_education(body: dict, admin=Depends(ADMIN)):
    return await prs.edu_upsert(body)


@router.put("/educations/{edu_id}")
async def update_education(edu_id: str, body: dict, admin=Depends(ADMIN)):
    return await prs.edu_upsert(body, edu_id)


@router.delete("/educations/{edu_id}")
async def delete_education(edu_id: str, admin=Depends(ADMIN)):
    from config.database import db
    await db.partner_educations.delete_one({"id": edu_id})
    return {"ok": True}


# ---------------- Experience master ----------------
@router.get("/experiences")
async def experiences(admin=Depends(ADMIN)):
    return await prs._crud_list("partner_experiences")


@router.post("/experiences")
async def create_experience(body: dict, admin=Depends(ADMIN)):
    return await prs.exp_upsert(body)


@router.put("/experiences/{exp_id}")
async def update_experience(exp_id: str, body: dict, admin=Depends(ADMIN)):
    return await prs.exp_upsert(body, exp_id)


@router.delete("/experiences/{exp_id}")
async def delete_experience(exp_id: str, admin=Depends(ADMIN)):
    from config.database import db
    await db.partner_experiences.delete_one({"id": exp_id})
    return {"ok": True}


# ---------------- FCM service-account config ----------------
@router.get("/fcm-config")
async def fcm_status(admin=Depends(ADMIN)):
    return await fcm_service.config_status()


@router.put("/fcm-config")
async def fcm_save(body: dict, admin=Depends(ADMIN)):
    return await fcm_service.save_service_account(body.get("service_account_json", ""))


@router.get("/fcm-config/download")
async def fcm_download(admin=Depends(ADMIN)):
    from fastapi import Response, HTTPException
    js = await fcm_service.get_service_account_json()
    if not js:
        raise HTTPException(404, "No service account uploaded")
    status = await fcm_service.config_status()
    fname = status.get("filename") or "firebase-service-account.json"
    return Response(content=js, media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="{fname}"'})


# ---------------- Template Manager (SMS / Email / Push) ----------------
from services import template_service as tpl  # noqa: E402


@router.get("/templates")
async def list_templates(channel: str = None, admin=Depends(ADMIN)):
    return await tpl.list_templates(channel)


@router.get("/template-events")
async def template_events(admin=Depends(ADMIN)):
    return await tpl.list_events()


@router.post("/template-events")
async def create_template_event(body: dict, admin=Depends(ADMIN)):
    return await tpl.create_event(body)


@router.delete("/template-events/{key}")
async def delete_template_event(key: str, admin=Depends(ADMIN)):
    return await tpl.delete_event(key)


@router.post("/templates")
async def create_template(body: dict, admin=Depends(ADMIN)):
    return await tpl.upsert_template(body)


@router.put("/templates/{tid}")
async def update_template(tid: str, body: dict, admin=Depends(ADMIN)):
    return await tpl.upsert_template(body, tid)


@router.post("/templates/{tid}/toggle")
async def toggle_template(tid: str, admin=Depends(ADMIN)):
    return await tpl.toggle_template(tid)


@router.post("/templates/{tid}/test")
async def test_template(tid: str, admin=Depends(ADMIN)):
    return await tpl.send_test(tid, admin["id"])


@router.delete("/templates/{tid}")
async def delete_template(tid: str, admin=Depends(ADMIN)):
    return await tpl.delete_template(tid)


# ---------------- Integration Center status snapshot ----------------
@router.get("/integration-center")
async def integration_center(admin=Depends(ADMIN)):
    from config.database import db, get_settings
    s = await get_settings()
    integ = s.get("integrations", {}) or {}
    fcm = await fcm_service.config_status()
    edu = await db.partner_educations.count_documents({})
    exp = await db.partner_experiences.count_documents({})
    return {
        "integrations": integ,
        "fcm_configured": fcm.get("configured", False),
        "fcm_project_id": fcm.get("project_id"),
        "commission": {
            "platform_commission_pct": s.get("platform_commission_pct"),
            "partner_commission_pct": s.get("partner_commission_pct"),
            "merchant_referral_pct": s.get("merchant_referral_pct"),
            "merchant_booking_pct": s.get("merchant_booking_pct"),
            "gst_pct": s.get("gst_pct"),
            # canonical, admin-configurable commission + cancellation model
            **(s.get("commission", {}) or {}),
        },
        "business_config": s.get("business_config", {}) or {},
        "alert_config": s.get("alert_config", {}) or {},
        "emergency_fee": s.get("emergency_fee"),
        "counts": {"educations": edu, "experiences": exp},
    }
