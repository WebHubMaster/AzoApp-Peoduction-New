from fastapi import APIRouter, Depends, UploadFile, File, Form, Body
from controllers import booking_controller as c
from models.booking import (DirectBookingRequest, MerchantBookingRequest, OTPActionRequest,
                            EvidenceRequest, ReviewRequest, LocationUpdate, GuestBookingRequest,
                            SparePartRequest, SparePartAction,
                            AdditionalWorkRequest, AdditionalPayRequest)
from middleware.auth import get_current_user, get_current_user_optional, require_role

router = APIRouter(prefix="/bookings", tags=["bookings"])


@router.get("/quote")
async def quote(service_id: str, schedule_type: str = "now", addons: str = "", coupon_code: str = None, tier_index: int = None):
    addon_list = [a for a in addons.split(",") if a]
    return await c.quote(service_id, schedule_type, addon_list, coupon_code, tier_index)


@router.get("/slot-availability")
async def slot_availability(date: str):
    return await c.slot_availability(date)


@router.post("/validate-coupon")
async def validate_coupon(data: dict, user=Depends(get_current_user)):
    if data.get("items"):
        return await c.validate_cart_coupon(user, data.get("code"), data.get("items"),
                                            data.get("schedule_type", "schedule"), data.get("address"))
    addons = data.get("addons") or []
    if isinstance(addons, str):
        addons = [a for a in addons.split(",") if a]
    return await c.validate_coupon(user, data.get("code"), data.get("service_id"),
                                   data.get("schedule_type", "schedule"), addons,
                                   data.get("tier_index"))


@router.post("/cart-quote")
async def cart_quote(data: dict, user=Depends(get_current_user_optional)):
    """Combined multi-service cart quote — visiting charge on cart total, applied once.
    Optional auth: works for guests (no membership/loyalty) so the storefront can show
    a price before login; when logged-in, member discounts / points are applied."""
    return await c.cart_quote(user, data.get("items") or [],
                              data.get("schedule_type", "schedule"),
                              data.get("coupon_code"), data.get("address"),
                              data.get("redeem_points") or 0)


# static partner route MUST be declared before dynamic /{booking_id}
@router.get("/partner/jobs")
async def partner_jobs(user=Depends(require_role("partner"))):
    return await c.partner_jobs(user)


@router.get("/partner/ring-pending")
async def partner_ring_pending(user=Depends(require_role("partner"))):
    """Offers that should be RINGING on this partner's device right now (polling
    fallback for the full-screen incoming-job alert when SSE/push are unavailable)."""
    return await c.partner_ring_pending(user)


@router.get("/partner/missed")
async def partner_missed(user=Depends(require_role("partner"))):
    """Still-open jobs this partner missed (offline / no answer) — one-tap re-grab via accept."""
    return await c.partner_missed_jobs(user)


@router.get("/{booking_id}/dispatch-status")
async def customer_dispatch_status(booking_id: str, user=Depends(get_current_user)):
    """Cab-app style live search status for the customer (counts only, no partner identities)."""
    return await c.customer_dispatch_status(user, booking_id)


@router.get("/partner/active")
async def partner_active_jobs(user=Depends(require_role("partner"))):
    return await c.partner_active_jobs(user)


@router.get("/partner/history")
async def partner_history(status: str = "all", user=Depends(require_role("partner"))):
    return await c.partner_history(user, status)


@router.get("/partner/dashboard")
async def partner_dashboard(range: str = "30d", date_from: str = "", date_to: str = "",
                            user=Depends(require_role("partner"))):
    return await c.partner_dashboard(user, range, date_from, date_to)


@router.get("/partner/job/{booking_id}")
async def partner_job_detail(booking_id: str, user=Depends(require_role("partner"))):
    return await c.partner_job_detail(user, booking_id)


@router.post("")
async def create_direct(req: DirectBookingRequest, user=Depends(require_role("customer"))):
    return await c.create_direct(user, req)


@router.post("/grouped")
async def create_grouped(req: dict, user=Depends(require_role("customer"))):
    """One order per category: multiple same-category services in a single booking."""
    return await c.create_grouped_booking(user, req)


@router.post("/pay-wallet-group")
async def pay_wallet_group(req: dict, user=Depends(require_role("customer"))):
    """Combined wallet payment for every booking created in one checkout (order group)."""
    return await c.pay_group_from_wallet(user, (req or {}).get("group_id"))


@router.post("/merchant")
async def create_merchant(req: MerchantBookingRequest, user=Depends(require_role("merchant"))):
    return await c.create_merchant(user, req)


@router.post("/guest")
async def create_guest(req: GuestBookingRequest):
    return await c.create_guest(req)


@router.get("")
async def list_bookings(user=Depends(get_current_user)):
    return await c.list_bookings(user)


@router.get("/{booking_id}")
async def get_booking(booking_id: str, user=Depends(get_current_user)):
    return await c.get_booking(user, booking_id)


@router.post("/{booking_id}/review")
async def review(booking_id: str, req: ReviewRequest, user=Depends(require_role("customer"))):
    return await c.add_review(user, booking_id, req)


@router.post("/{booking_id}/cancel")
async def cancel_booking(booking_id: str, data: dict = None, user=Depends(require_role("customer"))):
    return await c.cancel_booking(user, booking_id, (data or {}).get("reason", ""))


@router.get("/{booking_id}/cancellation-preview")
async def cancellation_preview(booking_id: str, user=Depends(require_role("customer"))):
    return await c.cancellation_preview(user, booking_id)


@router.post("/{booking_id}/accept")
async def accept(booking_id: str, user=Depends(require_role("partner"))):
    return await c.accept_job(user, booking_id)


@router.post("/{booking_id}/reject")
async def reject(booking_id: str, data: dict = None, user=Depends(require_role("partner"))):
    return await c.reject_job(user, booking_id, (data or {}).get("reason", ""))


@router.post("/{booking_id}/seen")
async def seen(booking_id: str, user=Depends(require_role("partner"))):
    return await c.mark_job_seen(user, booking_id)


@router.post("/{booking_id}/start-otp")
async def start_otp(booking_id: str, req: OTPActionRequest, user=Depends(require_role("partner"))):
    return await c.verify_start_otp(user, booking_id, req.otp)


@router.post("/{booking_id}/evidence")
async def evidence(booking_id: str, req: EvidenceRequest, user=Depends(require_role("partner"))):
    return await c.upload_evidence(user, booking_id, req)


@router.post("/{booking_id}/evidence/upload")
async def evidence_upload(booking_id: str, stage: str = Form(...),
                          file: UploadFile = File(...),
                          user=Depends(require_role("partner"))):
    raw = await file.read()
    return await c.upload_evidence_file(user, booking_id, stage, raw, file.content_type)


@router.post("/{booking_id}/evidence/remove")
async def evidence_remove(booking_id: str, payload: dict = Body(...),
                          user=Depends(require_role("partner"))):
    """Remove a single before/after work-proof photo (enables re-upload)."""
    return await c.remove_evidence(user, booking_id, (payload or {}).get("stage", ""),
                                   (payload or {}).get("url", ""))


@router.post("/{booking_id}/complete")
async def complete(booking_id: str, req: OTPActionRequest, user=Depends(require_role("partner"))):
    return await c.complete_job(user, booking_id, req.otp)


@router.post("/{booking_id}/spare-parts")
async def add_spare_part(booking_id: str, req: SparePartRequest, user=Depends(require_role("partner"))):
    return await c.add_spare_part(user, booking_id, req)


@router.post("/{booking_id}/spare-parts/{part_id}/action")
async def act_spare_part(booking_id: str, part_id: str, req: SparePartAction, user=Depends(require_role("customer"))):
    return await c.act_spare_part(user, booking_id, part_id, req.action)


@router.post("/{booking_id}/additional")
async def add_additional(booking_id: str, req: AdditionalWorkRequest, user=Depends(require_role("partner"))):
    return await c.add_additional_work(user, booking_id, req)


@router.delete("/{booking_id}/additional/{item_id}")
async def remove_additional(booking_id: str, item_id: str, user=Depends(require_role("partner"))):
    return await c.remove_additional_item(user, booking_id, item_id)


@router.post("/{booking_id}/additional/pay")
async def pay_additional(booking_id: str, req: AdditionalPayRequest, user=Depends(require_role("customer"))):
    return await c.pay_additional(user, booking_id, req.method)


@router.post("/{booking_id}/location")
async def location(booking_id: str, req: LocationUpdate, user=Depends(require_role("partner"))):
    return await c.update_location(user, booking_id, req.lat, req.lng)


@router.post("/{booking_id}/pay-wallet")
async def pay_wallet(booking_id: str, user=Depends(require_role("customer"))):
    return await c.pay_from_wallet(user, booking_id)


@router.get("/{booking_id}/repeat-preview")
async def repeat_preview(booking_id: str, user=Depends(require_role("customer"))):
    return await c.repeat_preview(user, booking_id)


@router.get("/{booking_id}/track")
async def track(booking_id: str, user=Depends(get_current_user)):
    """Live tracking payload for a booking — partner location, ETA, and status
    timeline. Accessible to the booking's customer, its assigned partner, or admin."""
    return await c.track_booking(user, booking_id)


@router.get("/{booking_id}/messages")
async def list_messages(booking_id: str, after: str = "", user=Depends(get_current_user)):
    """Chat thread for a booking (customer ↔ assigned partner). Enabled after payment."""
    return await c.list_messages(user, booking_id, after)


@router.post("/{booking_id}/messages")
async def send_message(booking_id: str, payload: dict = Body(...), user=Depends(get_current_user)):
    return await c.send_message(user, booking_id, (payload or {}).get("text", ""))



@router.post("/{booking_id}/tip")
async def tip_booking(booking_id: str, payload: dict = Body(...), user=Depends(require_role("customer"))):
    return await c.add_tip(user, booking_id, (payload or {}).get("amount", 0), (payload or {}).get("method", "wallet"))


@router.post("/{booking_id}/reschedule")
async def reschedule(booking_id: str, payload: dict = Body(...), user=Depends(get_current_user)):
    """Back-compat: create a mutual reschedule REQUEST (customer or assigned partner)."""
    return await c.request_reschedule(user, booking_id, (payload or {}).get("scheduled_at"))


@router.post("/{booking_id}/reschedule/request")
async def reschedule_request(booking_id: str, payload: dict = Body(...), user=Depends(get_current_user)):
    """Either party proposes a new date/time — goes to the opposite party for approval."""
    return await c.request_reschedule(user, booking_id, (payload or {}).get("scheduled_at"))


@router.post("/{booking_id}/reschedule/respond")
async def reschedule_respond(booking_id: str, payload: dict = Body(...), user=Depends(get_current_user)):
    """Opposite party accepts or rejects the pending reschedule request."""
    return await c.respond_reschedule(user, booking_id, (payload or {}).get("action"))


@router.post("/{booking_id}/reschedule/cancel")
async def reschedule_cancel(booking_id: str, user=Depends(get_current_user)):
    """Requester withdraws their own pending reschedule request."""
    return await c.cancel_reschedule(user, booking_id)
