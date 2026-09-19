from fastapi import APIRouter, Depends, Body
from typing import Literal
from controllers import admin_controller as c
from controllers import reports_controller as rc
from services import scheduled_reports_service as srs
from models.finance import SettingsUpdate, CouponCreate
from middleware.auth import require_role

router = APIRouter(prefix="/admin", tags=["admin"])
ADMIN = require_role("admin")


@router.get("/dashboard")
async def dashboard(range: str = "30d", date_from: str = "", date_to: str = "",
                    city: str = "", service: str = "", status: str = "",
                    booking_type: str = "", payment_status: str = "",
                    partner: str = "", customer: str = "", category: str = "",
                    merchant: str = "", bucket: str = "auto", admin=Depends(ADMIN)):
    return await c.dashboard(range, date_from, date_to, city, service, status,
                             booking_type, payment_status, partner, customer, category, merchant, bucket)


@router.get("/reviews")
async def reviews_overview(service_id: str = "", rating: int = 0, q: str = "",
                           page: int = 1, page_size: int = 20, admin=Depends(ADMIN)):
    """Service-wise ratings & reviews (Point #12): per-service average + star
    distribution, plus a filterable/paginated flat list of every customer review."""
    return await c.reviews_overview(service_id, rating, q, page, page_size)



@router.get("/partners/live")
async def partners_live(admin=Depends(ADMIN)):
    return await c.partners_live()


@router.get("/waitlist/demand")
async def waitlist_demand(admin=Depends(ADMIN)):
    return await c.waitlist_demand()


@router.post("/pincodes-in-radius")
async def pincodes_in_radius(data: dict, admin=Depends(ADMIN)):
    """Discover the pincodes that fall inside a lat/lng + radius by sampling a
    grid of points and reverse-geocoding them (OSM). Real data, best-effort."""
    return await c.pincodes_in_radius(
        float(data.get("lat")), float(data.get("lng")), float(data.get("radius_km", 5)))


@router.get("/coverage-map")
async def coverage_map(admin=Depends(ADMIN)):
    """All active service areas (circles + polygons) plus top launch-demand
    pincodes geocoded to pins — one payload for the coverage heatmap."""
    return await c.coverage_map()


@router.get("/settings")
async def get_settings(admin=Depends(ADMIN)):
    return await c.get_settings_ctrl()


@router.put("/settings")
async def update_settings(data: SettingsUpdate, admin=Depends(ADMIN)):
    return await c.update_settings(data.model_dump(), admin)


@router.get("/settings-audit")
async def settings_audit(limit: int = 50, admin=Depends(ADMIN)):
    return await c.settings_audit(limit)


@router.get("/payments/status")
async def payments_status(admin=Depends(ADMIN)):
    return await c.payments_status_ctrl()


@router.post("/integrations/s3-test")
async def s3_test(data: dict = Body(default={}), admin=Depends(ADMIN)):
    """Diagnose the AWS S3 configuration. Tests saved settings, with optional
    overrides posted in the body (so a form can be tested before saving)."""
    return await c.s3_test_connection(data or {})


@router.post("/integrations/sms-test")
async def sms_test(data: dict = Body(default={}), admin=Depends(ADMIN)):
    """Send a real test OTP via the configured Fast2SMS gateway and return the raw
    provider response so the admin can debug why OTP delivery is failing."""
    from services import sms_service
    return await sms_service.send_test((data or {}).get("phone", ""), (data or {}).get("otp", "123456"))


@router.post("/integrations/email-test")
async def email_test(data: dict = Body(default={}), admin=Depends(ADMIN)):
    """Send a REAL test email via the configured SMTP/SendGrid provider and return
    the exact result (with an actionable hint on failure) so the admin can verify
    email delivery the moment they save the Integration Center config."""
    from services.email_service import send_test_email
    to = (data or {}).get("to_email") or (data or {}).get("email") or admin.get("email")
    override = (data or {}).get("config") if isinstance((data or {}).get("config"), dict) else None
    return await send_test_email(to, override)


@router.post("/integrations/s3-migrate")
async def s3_migrate(admin=Depends(ADMIN)):
    """One-click migrate all locally-stored uploads to S3 and re-point references."""
    return await c.s3_migrate()


@router.get("/users")
async def users(role: str = None, admin=Depends(ADMIN)):
    return await c.list_users(role)


@router.get("/partners")
async def partners_directory(tab: str = "all", q: str = "", date_from: str = "",
                             date_to: str = "", category: str = "", partner_status: str = "",
                             kyc: str = "", sort_by: str = "created_at", premium: bool = False,
                             admin=Depends(ADMIN)):
    return await c.list_partners(tab, q, date_from, date_to, category, partner_status, kyc, sort_by, premium)


@router.get("/customers")
async def customers_directory(tab: str = "all", q: str = "", date_from: str = "",
                              date_to: str = "", city: str = "", sort_by: str = "created_at",
                              admin=Depends(ADMIN)):
    return await c.list_customers(tab, q, date_from, date_to, city, sort_by)


@router.post("/customers/bulk-notify")
async def customers_bulk_notify(data: dict, admin=Depends(ADMIN)):
    return await c.bulk_notify_customers(admin, data)


@router.get("/customers/winback/preview")
async def customers_winback_preview(days: int = 60, admin=Depends(ADMIN)):
    return await c.winback_preview(days)


@router.post("/customers/winback")
async def customers_winback_send(data: dict, admin=Depends(ADMIN)):
    return await c.winback_send(admin, data)


@router.get("/customers/{uid}/timeline")
async def customer_timeline(uid: str, admin=Depends(ADMIN)):
    return await c.customer_timeline(uid)


@router.post("/customers/{uid}/block")
async def block_customer(uid: str, data: dict, admin=Depends(ADMIN)):
    return await c.block_customer(admin, uid, bool(data.get("block", True)), data.get("reason", ""))


@router.post("/customers/{uid}/wallet")
async def customer_wallet_adjust(uid: str, data: dict, admin=Depends(ADMIN)):
    return await c.adjust_customer_wallet(admin, uid, data.get("amount"),
                                          data.get("direction", "credit"), data.get("note", ""))


@router.post("/customers/{uid}/notify")
async def customer_notify(uid: str, data: dict, admin=Depends(ADMIN)):
    return await c.notify_customer(admin, uid, data)


@router.delete("/customers/{uid}")
async def customer_delete(uid: str, admin=Depends(ADMIN)):
    return await c.admin_delete_customer(admin, uid, "")


@router.get("/customers/{uid}/logs")
async def customer_logs(uid: str, admin=Depends(ADMIN)):
    return await c.customer_logs(uid)



@router.post("/partners/{user_id}/kyc-action")
async def partner_kyc_action(user_id: str, data: dict, admin=Depends(ADMIN)):
    return await c.partner_kyc_action(admin, user_id, data.get("action"), data.get("reason", ""))


@router.post("/partners/create")
async def admin_create_partner(data: dict, admin=Depends(ADMIN)):
    from services import partner_reg_service as prs
    return await prs.admin_create_partner(admin, data)


@router.get("/partners/wizard-meta")
async def admin_wizard_meta(admin=Depends(ADMIN)):
    from services import partner_reg_service as prs
    return await prs.get_registration_meta()


@router.get("/area-partners")
async def area_partners(city: str = "", category: str = "", admin=Depends(ADMIN)):
    return await c.area_partners(city, category)


@router.get("/merchants")
async def merchants_directory(tab: str = "all", q: str = "", date_from: str = "",
                              date_to: str = "", category: str = "",
                              sort_by: str = "created_at", admin=Depends(ADMIN)):
    return await c.list_merchants(tab, q, date_from, date_to, category, sort_by)


@router.post("/merchants/{user_id}/kyc-action")
async def merchant_kyc_action(user_id: str, data: dict, admin=Depends(ADMIN)):
    return await c.merchant_kyc_action(admin, user_id, data.get("action"), data.get("reason", ""))


@router.get("/merchants/{user_id}/detail")
async def merchant_detail(user_id: str, admin=Depends(ADMIN)):
    from services import merchant_reg_service as mrs
    return await mrs.admin_kyc_detail(user_id)


@router.get("/merchant/withdrawals")
async def merchant_withdrawals(status: str = "", admin=Depends(ADMIN)):
    from services import merchant_wallet_service as mws
    return {"withdrawals": await mws.list_withdrawals(status=status or None),
            "stats": await mws.admin_withdrawal_stats()}


@router.post("/merchant/withdrawals/{wid}/action")
async def merchant_withdrawal_action(wid: str, data: dict, admin=Depends(ADMIN)):
    from services import merchant_wallet_service as mws
    return await mws.process_withdrawal(admin, wid, data.get("action"), data.get("reason", ""))


# ---- Merchant Bank & KYC review (partner-style) ----
@router.get("/merchant/finance-requests")
async def merchant_finance_requests(merchant_id: str = None, admin=Depends(ADMIN)):
    from services import merchant_bank_service as mbs
    return await mbs.admin_pending_requests(merchant_id)


@router.post("/merchant/{merchant_id}/finance/pan/action")
async def merchant_finance_pan_action(merchant_id: str, data: dict, admin=Depends(ADMIN)):
    from services import merchant_bank_service as mbs
    return await mbs.admin_review_pan(admin, merchant_id, data.get("action"), data.get("reason", ""))


@router.post("/merchant/finance/banks/{bank_id}/action")
async def merchant_finance_bank_action(bank_id: str, data: dict, admin=Depends(ADMIN)):
    from services import merchant_bank_service as mbs
    return await mbs.admin_review_bank(admin, bank_id, data.get("action"), data.get("reason", ""))


@router.get("/merchant/wallet-config")
async def merchant_wallet_config_get(admin=Depends(ADMIN)):
    from services import merchant_wallet_service as mws
    return await mws.get_wallet_config()


@router.get("/merchant/payout-verifications")
async def merchant_payout_pending(admin=Depends(ADMIN)):
    from services import merchant_wallet_service as mws
    return {"pending": await mws.admin_pending_payouts()}


@router.post("/merchant/{user_id}/payout-action")
async def merchant_payout_action(user_id: str, data: dict, admin=Depends(ADMIN)):
    from services import merchant_wallet_service as mws
    return await mws.admin_process_payout(admin, user_id, data.get("action"), data.get("reason", ""))


@router.put("/merchant/wallet-config")
async def merchant_wallet_config_put(data: dict, admin=Depends(ADMIN)):
    from services import merchant_wallet_service as mws
    return await mws.update_wallet_config(admin, data)




@router.get("/users/{user_id}/detail")
async def user_detail(user_id: str, admin=Depends(ADMIN)):
    return await c.user_detail(user_id)


@router.post("/kyc/{user_id}")
async def kyc(user_id: str, status: str = "approved", reason: str = "", admin=Depends(ADMIN)):
    return await c.approve_kyc(user_id, status, reason, admin)


@router.get("/bookings")
async def bookings(status: str = None, admin=Depends(ADMIN)):
    return await c.all_bookings(status)


@router.get("/bookings/{booking_id}/detail")
async def booking_detail(booking_id: str, admin=Depends(ADMIN)):
    return await c.booking_detail(booking_id)


@router.get("/bookings/{booking_id}/detail/pdf")
async def booking_detail_pdf(booking_id: str, admin=Depends(ADMIN)):
    from fastapi.responses import Response
    from services.booking_pdf_service import build_booking_detail_pdf
    detail = await c.booking_detail(booking_id)
    settings = await c.get_settings()
    pdf = build_booking_detail_pdf(detail, brand=settings.get("brand", "AzoApp"))
    code = (detail.get("booking") or {}).get("code", "booking")
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=Booking-{code}.pdf"})


@router.post("/bookings/{booking_id}/status")
async def update_booking_status(booking_id: str, status: str, admin=Depends(ADMIN)):
    return await c.update_booking_status(booking_id, status)


@router.post("/bookings/{booking_id}/reschedule")
async def reschedule_booking(booking_id: str, scheduled_at: str, admin=Depends(ADMIN)):
    return await c.reschedule_booking(booking_id, scheduled_at)


# ---- Job Requests console ----
@router.get("/job-requests")
async def job_requests(status: str = None, admin=Depends(ADMIN)):
    return await c.job_requests(status)


@router.get("/seo/dashboard")
async def seo_dashboard(admin=Depends(ADMIN)):
    return await c.seo_dashboard()


@router.get("/job-requests/{booking_id}")
async def job_request_detail(booking_id: str, admin=Depends(ADMIN)):
    return await c.job_request_detail(booking_id)


@router.get("/bookings/{booking_id}/eligible-partners")
async def booking_eligible_partners(booking_id: str, include_offline: bool = False, admin=Depends(ADMIN)):
    return await c.booking_eligible_partners(booking_id, include_offline=include_offline)


@router.get("/bookings/{booking_id}/dispatch-trace")
async def booking_dispatch_trace(booking_id: str, admin=Depends(ADMIN)):
    """Diagnostic: for a booking, show every partner and — with plain-english
    reasons — whether they would be considered eligible and whether they would
    get a push notification right now. Helps debug 'no partner got the alert'.
    """
    return await c.booking_dispatch_trace(booking_id)


@router.get("/bookings/{booking_id}/dispatch-timeline")
async def booking_dispatch_timeline(booking_id: str, admin=Depends(ADMIN)):
    return await c.booking_dispatch_timeline(booking_id)


@router.post("/partners/{partner_id}/test-ring")
async def admin_test_ring(partner_id: str, admin=Depends(ADMIN)):
    return await c.send_test_ring(partner_id, requested_by=f"admin:{admin.get('id', '')}")


@router.post("/bookings/{booking_id}/ring-partner/{partner_id}")
async def admin_ring_partner(booking_id: str, partner_id: str, admin=Depends(ADMIN)):
    """Ring one partner again with the REAL job (Live Dispatch Feed → Ring again)."""
    from controllers.booking_controller import admin_ring_partner as _ring
    return await _ring(booking_id, partner_id, admin)


@router.post("/bookings/{booking_id}/redispatch")
async def booking_redispatch(booking_id: str, admin=Depends(ADMIN)):
    return await c.booking_redispatch(booking_id)


@router.get("/dispatch-feed")
async def dispatch_feed(status: str = "", partner_id: str = "", booking_id: str = "",
                        limit: int = 100, admin=Depends(ADMIN)):
    """Live feed of partner-alert dispatch attempts. Filters: status
    (pending|accepted|rejected), partner_id, booking_id."""
    return await c.dispatch_feed(status, partner_id, booking_id, limit)


@router.get("/dispatch-attention")
async def dispatch_attention(admin=Depends(ADMIN)):
    """Searching bookings with NO reachable partner right now — for the admin
    'No partner available' alert + one-tap manual assign."""
    return await c.dispatch_attention()



@router.post("/bookings/{booking_id}/assign")
async def assign_booking(booking_id: str, data: dict, admin=Depends(ADMIN)):
    return await c.assign_booking(booking_id, data.get("partner_id"), admin)


@router.get("/coupons")
async def coupons(admin=Depends(ADMIN)):
    return await c.list_coupons()


@router.get("/coupons/stats")
async def coupon_stats(admin=Depends(ADMIN)):
    return await c.coupon_stats()


@router.get("/coupons/absorption-report")
async def coupon_absorption_report(date_from: str = None, date_to: str = None, admin=Depends(ADMIN)):
    return await c.coupon_absorption_report(date_from, date_to)


@router.get("/coupons/{coupon_id}/usage")
async def coupon_usage(coupon_id: str, admin=Depends(ADMIN)):
    return await c.coupon_usage(coupon_id)


@router.post("/coupons")
async def create_coupon(data: CouponCreate, admin=Depends(ADMIN)):
    return await c.create_coupon(data.model_dump())


@router.put("/coupons/{coupon_id}")
async def update_coupon(coupon_id: str, data: dict = Body(...), admin=Depends(ADMIN)):
    return await c.update_coupon(coupon_id, data)


@router.delete("/coupons/{coupon_id}")
async def delete_coupon(coupon_id: str, admin=Depends(ADMIN)):
    return await c.delete_coupon(coupon_id)


@router.get("/ledger")
async def ledger(admin=Depends(ADMIN)):
    return await c.commission_ledger()


@router.get("/payments")
async def payments(tab: str = "all", q: str = "", date_from: str = "", date_to: str = "",
                   method: str = "", admin=Depends(ADMIN)):
    return await c.list_payments(tab, q, date_from, date_to, method)


@router.get("/payments/{pid}")
async def payment_detail(pid: str, admin=Depends(ADMIN)):
    return await c.payment_detail(pid)


@router.get("/finance/report")
async def finance_report(date_from: str = "", date_to: str = "", admin=Depends(ADMIN)):
    return await c.finance_report(date_from, date_to)


# ── Advanced Reports & Analytics ──
@router.get("/reports/overview")
async def reports_overview(date_from: str = "", date_to: str = "", admin=Depends(ADMIN)):
    return await rc.reports_overview(date_from, date_to)


@router.get("/reports/export/manifest")
async def reports_export_manifest(admin=Depends(ADMIN)):
    return await rc.export_manifest()


@router.get("/reports/export")
async def reports_export(dataset: str, date_from: str = "", date_to: str = "", admin=Depends(ADMIN)):
    return await rc.reports_export(dataset, date_from, date_to)


# ── Custom Report Builder (saved views) ──
@router.get("/report-views")
async def list_report_views(admin=Depends(ADMIN)):
    return await rc.list_report_views()


@router.post("/report-views")
async def save_report_view(data: dict, admin=Depends(ADMIN)):
    return await rc.save_report_view(data)


@router.delete("/report-views/{view_id}")
async def delete_report_view(view_id: str, admin=Depends(ADMIN)):
    return await rc.delete_report_view(view_id)


@router.post("/report-views/run")
async def run_report_view(data: dict, admin=Depends(ADMIN)):
    return await rc.run_report_view(data)


# ── Scheduled Reports ──
@router.get("/report-schedules")
async def list_report_schedules(admin=Depends(ADMIN)):
    return await srs.list_schedules()


@router.post("/report-schedules")
async def create_report_schedule(data: dict, admin=Depends(ADMIN)):
    return await srs.create_schedule(data)


@router.put("/report-schedules/{sch_id}")
async def update_report_schedule(sch_id: str, data: dict, admin=Depends(ADMIN)):
    return await srs.update_schedule(sch_id, data)


@router.delete("/report-schedules/{sch_id}")
async def delete_report_schedule(sch_id: str, admin=Depends(ADMIN)):
    return await srs.delete_schedule(sch_id)


@router.post("/report-schedules/{sch_id}/run-now")
async def run_report_schedule_now(sch_id: str, admin=Depends(ADMIN)):
    return await srs.run_now(sch_id)


@router.get("/report-runs")
async def list_report_runs(limit: int = 50, admin=Depends(ADMIN)):
    return await srs.list_runs(limit)


@router.get("/deletion-requests")
async def deletion_requests(admin=Depends(ADMIN)):
    return await c.list_deletion_requests()


@router.post("/deletion-requests/{req_id}")
async def process_deletion(req_id: str, action: Literal["approve", "reject"] = "approve", admin=Depends(ADMIN)):
    return await c.process_deletion(req_id, action)


# --- SMS Templates (event-based, active/inactive) ---
@router.get("/sms-templates")
async def sms_templates(admin=Depends(ADMIN)):
    from services import sms_templates_service as st
    return await st.list_templates()


@router.put("/sms-templates/{tid}")
async def update_sms_template(tid: str, data: dict, admin=Depends(ADMIN)):
    from services import sms_templates_service as st
    return await st.update_template(tid, data)


# --- Partner management (edit / suspend / notify / logs) ---
@router.put("/partners/{pid}")
async def edit_partner(pid: str, data: dict, admin=Depends(ADMIN)):
    return await c.update_partner(admin, pid, data)


@router.post("/partners/{pid}/suspend")
async def suspend_partner(pid: str, data: dict, admin=Depends(ADMIN)):
    return await c.suspend_partner(admin, pid, data)


@router.post("/partners/{pid}/unsuspend")
async def unsuspend_partner(pid: str, admin=Depends(ADMIN)):
    return await c.unsuspend_partner(admin, pid)


@router.get("/partners/notify-templates")
async def notify_templates(channel: str = "push", admin=Depends(ADMIN)):
    return await c.list_notify_templates(channel)


@router.post("/partners/notify-templates/preview")
async def notify_template_preview(data: dict, admin=Depends(ADMIN)):
    return await c.preview_notify_template(data.get("template_id"), data.get("variables") or {})


@router.post("/partners/{pid}/notify")
async def notify_partner(pid: str, data: dict, admin=Depends(ADMIN)):
    return await c.notify_partner(admin, pid, data)


@router.get("/partners/{pid}/logs")
async def partner_logs(pid: str, admin=Depends(ADMIN)):
    return await c.partner_logs(pid)
