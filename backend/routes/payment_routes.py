from typing import Optional
from fastapi import APIRouter, Depends, Request, Header, HTTPException
from pydantic import BaseModel
from controllers import payment_controller as c
from services import payment_service, refund_service
from middleware.auth import require_role

router = APIRouter(prefix="/payments", tags=["payments"])
CUSTOMER = require_role("customer")
# confirm-return is used by customers (bookings) AND partners (Starter Kit) — allow both.
PAYER = require_role("customer", "partner", "merchant")


class OrderRequest(BaseModel):
    purpose: str  # booking | booking_group | wallet
    booking_id: Optional[str] = None
    amount: Optional[float] = None
    group_id: Optional[str] = None


class VerifyRequest(BaseModel):
    order_id: str
    payment_id: str
    signature: str
    purpose: str
    booking_id: Optional[str] = None
    amount: Optional[float] = None
    group_id: Optional[str] = None


class ReturnRequest(BaseModel):
    gw: Optional[str] = None
    order_id: str


@router.post("/order")
async def create_order(req: OrderRequest, user=Depends(CUSTOMER)):
    return await c.create_order(user, req.purpose, req.booking_id, req.amount, req.group_id)


@router.post("/verify")
async def verify(req: VerifyRequest, user=Depends(CUSTOMER)):
    return await c.verify(user, req)


@router.post("/confirm-return")
async def confirm_return(req: ReturnRequest, user=Depends(PAYER)):
    """Confirm a hosted-checkout payment when the gateway redirects the customer back
    to /payment/return (Cashfree/Juspay/Easebuzz). Verifies status + confirms booking."""
    return await c.confirm_return(user, req.gw, req.order_id)


@router.api_route("/webhooks/payu-callback", methods=["GET", "POST"])
@router.api_route("/webhooks/easebuzz-callback", methods=["GET", "POST"])
async def hosted_callback(request: Request, ret: str = "", rb: str = ""):
    """PayU / Easebuzz post the customer back here (surl/furl). The payment is verified
    server-side by /payments/confirm-return on the return page, so we only redirect."""
    from fastapi.responses import RedirectResponse
    from services.payment_gateways import return_page
    gw_name = "payu" if "payu" in request.url.path else "easebuzz"
    data = dict(request.query_params)
    if request.method == "POST":
        try:
            data.update(dict(await request.form()))
        except Exception:  # noqa: BLE001
            pass
    txnid = str(data.get("txnid") or data.get("udf1") or "")
    return RedirectResponse(return_page(gw_name, txnid, ret if ret in ("panel", "customer") else "", base=rb or None, req_host=request.headers.get("x-forwarded-host") or request.headers.get("host") or ""), status_code=303)


@router.get("/refunds")
async def my_refunds(user=Depends(CUSTOMER)):
    """Customer's cancellation/refund history (latest first)."""
    return await refund_service.list_for_customer(user["id"])


@router.post("/webhooks/razorpay-refund")
async def razorpay_refund_webhook(request: Request,
                                  x_razorpay_signature: Optional[str] = Header(default=None)):
    """Public webhook for Razorpay refund status events. Verifies the signature against the
    RAW request body using the per-mode webhook secret, then updates the refund record.
    Configure this URL in Razorpay Dashboard → Webhooks (subscribe to refund.* events)."""
    import json
    raw = await request.body()
    if not await payment_service.verify_webhook_signature(raw, x_razorpay_signature or ""):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    try:
        event = json.loads(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not str(event.get("event", "")).startswith("refund."):
        return {"received": True, "ignored": True}
    return await refund_service.handle_webhook(event)


@router.post("/webhooks/razorpayx-payout")
async def razorpayx_payout_webhook(request: Request,
                                   x_razorpay_signature: Optional[str] = Header(default=None)):
    """Public webhook for RazorpayX payout status (payout.processed/reversed/failed).
    Register at Integration Center-shown URL; verifies X-Razorpay-Signature vs the
    RazorpayX webhook secret against the RAW body, then finalises the withdrawal."""
    import json
    from services import payout_service
    from services import gateway_resolver as gr
    from config.database import get_settings
    raw = await request.body()
    s = await get_settings()
    g = s.get("integrations", {}) or {}
    # Verify against the ACTIVE payout mode's webhook secret (per-mode, no mixing).
    secret = gr.resolve_payout(g)["g"].get("razorpayx_webhook_secret") or ""
    if not payout_service.verify_webhook(raw, x_razorpay_signature or "", secret):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    try:
        event = json.loads(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not str(event.get("event", "")).startswith("payout."):
        return {"received": True, "ignored": True}
    return await payout_service.handle_webhook(event)
