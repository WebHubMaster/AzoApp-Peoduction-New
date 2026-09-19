from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Request
from controllers import referral_controller as c
from models.finance import PartnerOnboardRequest
from middleware.auth import require_role

router = APIRouter(prefix="/merchant", tags=["merchant"])


@router.post("/qr-scan")
async def qr_scan(data: dict, request: Request):
    """Public: log a real QR/referral-link open for scan analytics."""
    from services import merchant_qr_service as mqs
    xff = request.headers.get("x-forwarded-for", "")
    ip = (xff.split(",")[0].strip() if xff else "") or (request.client.host if request.client else "")
    return await mqs.log_scan(data.get("code"), ip, data.get("source", "qr"))


@router.get("/dashboard")
async def dashboard(user=Depends(require_role("merchant"))):
    return await c.merchant_dashboard(user)


@router.post("/onboard-partner")
async def onboard_partner(req: PartnerOnboardRequest, user=Depends(require_role("merchant"))):
    return await c.onboard_partner(user, req)


@router.get("/referrals")
async def referrals(user=Depends(require_role("merchant"))):
    return await c.my_referrals(user)


@router.get("/earnings")
async def earnings(user=Depends(require_role("merchant"))):
    return await c.merchant_earnings(user)


@router.get("/my-code")
async def my_code(user=Depends(require_role("merchant"))):
    from services import merchant_code_service
    code = await merchant_code_service.ensure_merchant_code(user)
    return {"merchant_code": code}


@router.get("/validate-code")
async def validate_code(code: str = ""):
    """Public: given a merchant referral code (from a QR link like `/?ref=CODE`),
    return a minimal, non-sensitive merchant profile so the customer UI can
    show 'You are booking through <Shop Name>'. Returns 404 for invalid codes.
    """
    from fastapi import HTTPException
    from services import merchant_code_service
    m = await merchant_code_service.validate_code((code or "").strip())
    if not m:
        raise HTTPException(status_code=404, detail="Invalid or expired merchant code")
    return {
        "id": m["id"],
        "name": m.get("name") or "",
        "shop_name": m.get("shop_name") or "",
        "merchant_code": m.get("merchant_code") or "",
    }


@router.post("/partners/create")
async def merchant_create_partner(data: dict, user=Depends(require_role("merchant"))):
    from services import partner_reg_service as prs
    return await prs.admin_create_partner(user, data, merchant_id=user["id"])


@router.get("/partners/wizard-meta")
async def merchant_wizard_meta(user=Depends(require_role("merchant"))):
    from services import partner_reg_service as prs
    return await prs.get_registration_meta()


# ─────────────────────────── Wallet & Withdrawals ───────────────────────────
M = require_role("merchant")


@router.get("/wallet")
async def wallet(user=Depends(M)):
    from services import merchant_wallet_service as mws
    return {"summary": await mws.wallet_summary(user), "config": await mws.get_wallet_config()}


@router.post("/wallet/withdraw")
async def wallet_withdraw(data: dict, user=Depends(M)):
    from services import merchant_wallet_service as mws
    return await mws.request_withdrawal(user, data.get("amount"), data.get("method"),
                                        data.get("upi_id", ""), data.get("bank"), data.get("cheque"))


@router.get("/wallet/withdrawals")
async def wallet_withdrawals(user=Depends(M)):
    from services import merchant_wallet_service as mws
    return await mws.list_withdrawals(user["id"])


# ─────────────────────────── Advanced ops (2.2 + 2.3) ───────────────────────
@router.get("/overview")
async def overview(user=Depends(M)):
    from services import merchant_ops_service as ops
    return await ops.dashboard(user)


@router.get("/analytics")
async def analytics(date_from: str = "", date_to: str = "", user=Depends(M)):
    from services import merchant_ops_service as ops
    return await ops.analytics(user, date_from, date_to)


@router.get("/customers")
async def customers(q: str = "", user=Depends(M)):
    from services import merchant_ops_service as ops
    return await ops.my_customers(user, q)


@router.get("/customers/{customer_key}/history")
async def customer_history(customer_key: str, user=Depends(M)):
    from services import merchant_ops_service as ops
    return await ops.customer_history(user, customer_key)


@router.get("/reminders")
async def reminders(status: str = "", user=Depends(M)):
    from services import merchant_ops_service as ops
    return await ops.list_reminders(user, status)


@router.post("/reminders")
async def create_reminder(data: dict, user=Depends(M)):
    from services import merchant_ops_service as ops
    return await ops.create_reminder(user, data)


@router.post("/reminders/bulk")
async def bulk_reminders(data: dict, user=Depends(M)):
    from services import merchant_ops_service as ops
    return await ops.bulk_reminders(user, data)


@router.get("/top-customers")
async def top_customers(period: str = "month", user=Depends(M)):
    from services import merchant_ops_service as ops
    return await ops.top_customers(user, period)


@router.put("/customers/{customer_key}/tags")
async def set_customer_tags(customer_key: str, data: dict, user=Depends(M)):
    from services import merchant_ops_service as ops
    return await ops.set_customer_tags(user, customer_key, data.get("tags", []))


@router.get("/tag-insights")
async def tag_insights(user=Depends(M)):
    from services import merchant_ops_service as ops
    return await ops.tag_insights(user)


@router.get("/settings")
async def get_settings(user=Depends(M)):
    from services import merchant_ops_service as ops
    return await ops.get_settings(user)


@router.put("/settings")
async def set_settings(data: dict, user=Depends(M)):
    from services import merchant_ops_service as ops
    return await ops.set_settings(user, data)


@router.get("/poster-logo")
async def get_poster_logo(user=Depends(M)):
    from services import merchant_ops_service as ops
    return await ops.get_poster_logo(user)


@router.post("/poster-logo")
async def upload_poster_logo(file: UploadFile = File(...), user=Depends(M)):
    from services import merchant_ops_service as ops
    from services import storage_service
    raw = await file.read()
    try:
        res = await storage_service.save_document(raw, file.content_type or "",
                                                  file.filename or "", folder="merchant")
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:  # noqa: BLE001
        raise HTTPException(400, "Please upload a valid image file (JPG/PNG)")
    return await ops.set_poster_logo(user, res["url"])


@router.delete("/poster-logo")
async def delete_poster_logo(user=Depends(M)):
    from services import merchant_ops_service as ops
    return await ops.set_poster_logo(user, "")


@router.put("/reminders/{rid}")
async def update_reminder(rid: str, data: dict, user=Depends(M)):
    from services import merchant_ops_service as ops
    return await ops.update_reminder(user, rid, data.get("status", "done"))


@router.post("/repeat-service")
async def repeat_service(data: dict, user=Depends(M)):
    from services import merchant_ops_service as ops
    return await ops.repeat_service(user, data)


@router.get("/complaints")
async def complaints(user=Depends(M)):
    from services import merchant_ops_service as ops
    return await ops.list_complaints(user)


@router.post("/complaints")
async def create_complaint(data: dict, user=Depends(M)):
    from services import merchant_ops_service as ops
    return await ops.create_complaint(user, data)


@router.get("/performance")
async def performance(period: str = "monthly", user=Depends(M)):
    from services import merchant_ops_service as ops
    return await ops.performance(user, period)

