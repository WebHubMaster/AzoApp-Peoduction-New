from fastapi import APIRouter, Depends
from models.user import (SendOTPRequest, VerifyOTPRequest, UserProfileUpdate, AddressModel,
                         RegisterProviderRequest, EmailAuthRequest, GoogleAuthRequest,
                         ForgotPasswordRequest, ResetPasswordRequest, DeleteAccountRequest)
from controllers import auth_controller as c
from middleware.auth import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/send-otp")
async def send_otp(req: SendOTPRequest):
    return await c.send_otp(req.phone)


@router.post("/google")
async def google_login(req: GoogleAuthRequest):
    return await c.google_login(req.credential)


@router.post("/register-provider")
async def register_provider(req: RegisterProviderRequest):
    return await c.register_provider(req.phone, req.name, req.role)


@router.post("/verify-otp")
async def verify_otp(req: VerifyOTPRequest):
    return await c.verify_otp(req.phone, req.otp, req.name, req.create_if_new, req.role)


@router.get("/demo-status")
async def demo_status():
    return await c.demo_status()


@router.get("/config")
async def auth_config():
    return await c.get_config()


@router.post("/email")
async def email_login(req: EmailAuthRequest):
    return await c.email_login(req.email, req.password, req.name, req.create_if_new)


@router.get("/me")
async def me(user=Depends(get_current_user)):
    from services.rbac_service import enrich_user
    return await enrich_user(user)


@router.put("/profile")
async def update_profile(data: UserProfileUpdate, user=Depends(get_current_user)):
    return await c.update_profile(user, data.model_dump())


@router.post("/onboarding-tour")
async def set_onboarding_tour(data: dict, user=Depends(get_current_user)):
    """Save the authenticated user's first-time onboarding tour status."""
    return await c.set_onboarding_tour(user, (data or {}).get("status", ""))


@router.put("/partner/online-status")
async def partner_online_status(data: dict, user=Depends(get_current_user)):
    """Toggle a partner's online/offline availability.

    Kept separate from `/auth/profile` because approved partners' profile is
    locked — but they must still be able to toggle their own availability.
    """
    return await c.partner_toggle_online(user, bool(data.get("online")))


@router.put("/partner/onboarding")
async def partner_onboarding(data: dict, user=Depends(get_current_user)):
    return await c.partner_onboarding(user, data)


@router.put("/merchant/onboarding")
async def merchant_onboarding(data: dict, user=Depends(get_current_user)):
    return await c.merchant_onboarding(user, data)


@router.post("/address")
async def add_address(addr: AddressModel, user=Depends(get_current_user)):
    return await c.add_address(user, addr)


@router.get("/addresses")
async def list_addresses(user=Depends(get_current_user)):
    return await c.list_addresses(user)


@router.put("/address/{addr_id}")
async def update_address(addr_id: str, addr: AddressModel, user=Depends(get_current_user)):
    return await c.update_address(user, addr_id, addr)


@router.delete("/address/{addr_id}")
async def delete_address(addr_id: str, user=Depends(get_current_user)):
    return await c.delete_address(user, addr_id)


@router.post("/address/{addr_id}/default")
async def set_default_address(addr_id: str, user=Depends(get_current_user)):
    return await c.set_default_address(user, addr_id)


@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    return await c.forgot_password(req.identifier)


@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest):
    return await c.reset_password(req.identifier, req.otp, req.new_password)


@router.post("/delete-account")
async def delete_account(req: DeleteAccountRequest, user=Depends(get_current_user)):
    return await c.request_account_deletion(user, req.reason)
