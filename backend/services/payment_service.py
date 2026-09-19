"""Pay-in gateway dispatcher — 100% mode (test/live) deterministic.

The ACTIVE pay-in gateway, resolved through `gateway_resolver`, runs in exactly its
ACTIVE mode with that mode's own credentials + endpoint. No test/live mixing, no
silent fallback. When the active gateway is DISABLED the caller uses the dev mock
flow; when it is ENABLED but its active mode is INCOMPLETE a `GatewayConfigError`
is raised (payment must NOT execute — no fallback).

Refunds / status checks resolve the ORIGINAL gateway+mode snapshot stored on the
booking, never the currently-active selection.
"""
import razorpay
from config.database import get_settings
from services import payment_gateways as gw
from services import gateway_resolver as gr
from services.gateway_resolver import GatewayConfigError  # re-export

__all__ = ["GatewayConfigError", "active_payin_gateway", "is_configured", "payin_state",
           "create_order", "check_order_paid", "verify_signature", "create_refund",
           "verify_webhook_signature"]


async def _integrations() -> dict:
    s = await get_settings()
    return s.get("integrations", {}) or {}


async def active_payin_gateway() -> str:
    g = await _integrations()
    return gr.active_gateway(g, "payin")


async def payin_state() -> dict:
    """Resolved state of the ACTIVE pay-in gateway (gateway, mode, env, configured...)."""
    g = await _integrations()
    return gr.resolve_payin(g)


async def is_configured() -> bool:
    """True only when the ACTIVE pay-in gateway is fully configured for its ACTIVE
    mode (else callers use the dev mock flow)."""
    return (await payin_state())["configured"]


def _rzp_client(res: dict):
    kid = res["g"].get("razorpay_key_id")
    ksec = res["g"].get("razorpay_key_secret")
    if not kid or not ksec:
        return None, None
    return razorpay.Client(auth=(kid, ksec)), kid


async def create_order(amount_inr: float, receipt: str, customer: dict | None = None):
    """Create a pay-in order on the ACTIVE gateway in its ACTIVE mode.

    Returns a normalised payload (adds `gateway`, `mode`, `env`) OR None when the
    active gateway is DISABLED (caller uses dev mock). Raises GatewayConfigError
    when the active gateway is ENABLED but its active mode is INCOMPLETE."""
    g = await _integrations()
    res = gr.resolve_payin(g)
    if res["incomplete"]:
        raise GatewayConfigError(res["error"])
    if not res["configured"]:
        return None  # gateway disabled → dev mock flow
    gwn, mode, sg = res["gateway"], res["mode"], res["g"]
    order = None
    try:
        if gwn == "razorpay":
            client, kid = _rzp_client(res)
            if not client:
                return None
            rp = client.order.create({
                "amount": int(round(amount_inr * 100)), "currency": "INR",
                "receipt": (receipt or "azo")[:40], "payment_capture": 1,
            })
            order = {"gateway": "razorpay", "method": "razorpay_sdk", "order_id": rp["id"],
                     "amount": rp["amount"], "currency": rp["currency"], "key_id": kid}
        elif gwn == "cashfree":
            order = await gw.cashfree_create_order(sg, amount_inr, receipt, customer)
        elif gwn == "payu":
            order = await gw.payu_create_order(sg, amount_inr, receipt, customer)
        elif gwn == "easebuzz":
            order = await gw.easebuzz_create_order(sg, amount_inr, receipt, customer)
        elif gwn == "juspay":
            order = await gw.juspay_create_order(sg, amount_inr, receipt, customer)
    except Exception as e:  # noqa: BLE001
        # A configured gateway rejected the request (bad keys, provider outage, etc.).
        # Surface a CLEAN error — never crash (500) and never silently fall back to mock
        # or the other mode.
        raise GatewayConfigError(
            f"Could not start the payment on {gwn.capitalize()} {mode.upper()} MODE. "
            f"Please verify the {mode} credentials in the Integration Center and try again."
        ) from e
    if not order:
        return None
    order["mode"] = mode
    order["env"] = res["env"]
    order.setdefault("gateway", gwn)
    return order


async def check_order_paid(order_id: str, gateway: str = None, mode: str = None) -> bool:
    """For hosted/redirect gateways: check the order status using the transaction's
    OWN gateway+mode snapshot (falls back to the active selection when omitted)."""
    if not order_id:
        return False
    g = await _integrations()
    res = gr.resolve_payin(g, gateway=gateway, mode=mode)
    gwn, sg = res["gateway"], res["g"]
    try:
        if gwn == "cashfree":
            return str(await gw.cashfree_order_status(sg, order_id)).upper() == "PAID"
        if gwn == "juspay":
            return str(await gw.juspay_order_status(sg, order_id, order_id)).upper() in ("CHARGED", "SUCCEEDED")
        if gwn == "easebuzz":
            r = await gw.easebuzz_status(sg, order_id)
            return str((r or {}).get("status", "")).lower() in ("success", "successful")
    except Exception:  # noqa: BLE001
        return False
    return False


async def verify_signature(order_id: str, payment_id: str, signature: str) -> bool:
    g = await _integrations()
    res = gr.resolve_payin(g)
    client, _ = _rzp_client(res)
    if not client:
        return False
    try:
        client.utility.verify_payment_signature({
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
        })
        return True
    except Exception:  # noqa: BLE001
        return False


async def create_refund(payment_id: str, amount_inr: float = None, receipt: str = None,
                        gateway: str = None, mode: str = None) -> dict:
    """Initiate a refund using the ORIGINAL transaction's gateway+mode snapshot
    (passed in from the booking). Returns the refund entity dict, or None when that
    snapshot's gateway+mode is not currently configured (caller records a source
    refund instead). NEVER uses a different mode/gateway than the original."""
    if not payment_id:
        return None
    g = await _integrations()
    res = gr.resolve_payin(g, gateway=gateway, mode=mode)
    gwn, sg = res["gateway"], res["g"]
    # The snapshot's mode must be configured; do not fall back to another mode.
    if not gr.mode_configured(g, "payin", gwn, res["mode"]):
        return None
    if gwn == "razorpay":
        client, _ = _rzp_client(res)
        if not client:
            return None
        payload = {"speed": "optimum"}
        if receipt:
            payload["receipt"] = str(receipt)[:40]
        if amount_inr is not None:
            payload["amount"] = int(round(float(amount_inr) * 100))  # paise
        return dict(client.payment.refund(payment_id, payload))
    try:
        if gwn == "cashfree":
            return await gw.cashfree_refund(sg, payment_id, amount_inr, receipt)
        if gwn == "payu":
            return await gw.payu_refund(sg, payment_id, amount_inr, receipt)
        if gwn == "easebuzz":
            return await gw.easebuzz_refund(sg, payment_id, amount_inr or 0, receipt)
        if gwn == "juspay":
            return await gw.juspay_refund(sg, payment_id, amount_inr, payment_id)
    except Exception:  # noqa: BLE001
        return None
    return None


async def verify_webhook_signature(body: bytes, signature: str) -> bool:
    """Verify a Razorpay webhook using the ACTIVE mode's webhook secret against the
    RAW body."""
    g = await _integrations()
    res = gr.resolve_payin(g)
    client, _ = _rzp_client(res)
    secret = res["g"].get("razorpay_webhook_secret") or ""
    if not client or not secret or not signature:
        return False
    try:
        client.utility.verify_webhook_signature(
            body.decode("utf-8") if isinstance(body, (bytes, bytearray)) else body,
            signature, secret)
        return True
    except Exception:  # noqa: BLE001
        return False
