"""Multi-gateway PAY-IN implementations (Cashfree, PayU, Easebuzz, Juspay).

Each function is driven purely by the admin's `settings.integrations` config.
A gateway is considered *live* only when it is enabled AND its essential keys are
present. Until then callers fall back to the dev mock flow (handled by the
dispatcher in payment_service.py). All implementations follow the official
provider docs and activate the moment real keys are saved in the Integration
Center — no code change required.

`create_order` returns a NORMALISED payload the frontend understands:
  { gateway, method, amount, ... provider-specific fields ... }
  method ∈ {razorpay_sdk, cashfree_sdk, redirect, form_post}
"""
import os
import uuid
import hashlib
import hmac
import base64
import time

import httpx


def _public_base() -> str:
    return (os.environ.get("PUBLIC_APP_URL") or os.environ.get("APP_URL")
            or os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")


def _cust(customer: dict | None) -> dict:
    c = customer or {}
    phone = str(c.get("phone") or "9999999999").replace("+91", "").strip() or "9999999999"
    return {
        "name": c.get("name") or "AzoApp Customer",
        "email": c.get("email") or "customer@azoapp.in",
        "phone": phone,
        "id": c.get("id") or ("cust_" + uuid.uuid4().hex[:12]),
    }


# ════════════════════════════════════════════════════════════ CASHFREE
def cashfree_live(g: dict) -> bool:
    return bool(g.get("cashfree_enabled") and g.get("cashfree_pg_app_id") and g.get("cashfree_pg_secret_key"))


def _cf_pg_base(g: dict) -> str:
    return "https://api.cashfree.com/pg" if g.get("cashfree_mode") == "live" else "https://sandbox.cashfree.com/pg"


def _cf_pg_headers(g: dict) -> dict:
    return {
        "accept": "application/json", "content-type": "application/json",
        "x-api-version": "2023-08-01",
        "x-client-id": g.get("cashfree_pg_app_id", ""),
        "x-client-secret": g.get("cashfree_pg_secret_key", ""),
        "x-request-id": str(uuid.uuid4()),
    }


async def cashfree_create_order(g: dict, amount_inr: float, receipt: str, customer: dict | None):
    c = _cust(customer)
    order_id = (receipt or "AZO") + "-" + uuid.uuid4().hex[:8]
    body = {
        "order_id": order_id, "order_amount": round(float(amount_inr), 2), "order_currency": "INR",
        "customer_details": {"customer_id": c["id"], "customer_name": c["name"],
                             "customer_email": c["email"], "customer_phone": c["phone"]},
        "order_meta": {"return_url": f"{_public_base()}/payment/return?gw=cashfree&order_id={order_id}"},
    }
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(f"{_cf_pg_base(g)}/orders", headers=_cf_pg_headers(g), json=body)
    r.raise_for_status()
    data = r.json()
    return {"gateway": "cashfree", "method": "cashfree_sdk", "amount": round(float(amount_inr), 2),
            "order_id": data["order_id"], "payment_session_id": data["payment_session_id"],
            "cf_mode": "production" if g.get("cashfree_mode") == "live" else "sandbox"}


async def cashfree_order_status(g: dict, order_id: str) -> str:
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(f"{_cf_pg_base(g)}/orders/{order_id}", headers=_cf_pg_headers(g))
    r.raise_for_status()
    return (r.json() or {}).get("order_status", "")


async def cashfree_refund(g: dict, order_id: str, amount_inr: float | None, receipt: str | None):
    body = {"refund_id": "rf-" + uuid.uuid4().hex[:12], "refund_speed": "STANDARD"}
    if amount_inr is not None:
        body["refund_amount"] = round(float(amount_inr), 2)
    if receipt:
        body["refund_note"] = str(receipt)[:60]
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(f"{_cf_pg_base(g)}/orders/{order_id}/refunds", headers=_cf_pg_headers(g), json=body)
    r.raise_for_status()
    return r.json()


def cashfree_verify_webhook(g: dict, raw: bytes, timestamp: str, signature: str) -> bool:
    secret = g.get("cashfree_pg_secret_key", "")
    if not secret or not signature or not timestamp:
        return False
    expected = base64.b64encode(hmac.new(secret.encode(), timestamp.encode() + raw, hashlib.sha256).digest()).decode()
    return hmac.compare_digest(expected, signature)


# ════════════════════════════════════════════════════════════ PAYU
def payu_live(g: dict) -> bool:
    return bool(g.get("payu_enabled") and g.get("payu_merchant_key") and g.get("payu_salt"))


def _payu_checkout_url(g: dict) -> str:
    return "https://secure.payu.in/_payment" if g.get("payu_mode") == "live" else "https://test.payu.in/_payment"


def _sha512(v: str) -> str:
    return hashlib.sha512(v.encode("utf-8")).hexdigest()


async def payu_create_order(g: dict, amount_inr: float, receipt: str, customer: dict | None):
    c = _cust(customer)
    key, salt = g.get("payu_merchant_key", ""), g.get("payu_salt", "")
    txnid = ((receipt or "AZO") + uuid.uuid4().hex)[:25]
    amount = f"{float(amount_inr):.2f}"
    productinfo = (receipt or "AzoApp Service")[:100]
    surl = f"{_public_base()}/api/payments/webhooks/payu-callback"
    p = {
        "key": key, "txnid": txnid, "amount": amount, "productinfo": productinfo,
        "firstname": c["name"], "email": c["email"], "phone": c["phone"],
        "surl": surl, "furl": surl,
        "udf1": "", "udf2": "", "udf3": "", "udf4": "", "udf5": "",
    }
    raw = "|".join([key, txnid, amount, productinfo, c["name"], c["email"],
                    "", "", "", "", "", "", "", "", "", "", "", salt])
    p["hash"] = _sha512(raw)
    return {"gateway": "payu", "method": "form_post", "amount": round(float(amount_inr), 2),
            "action": _payu_checkout_url(g), "fields": p, "order_id": txnid}


def _payu_postservice_url(g: dict) -> str:
    return ("https://info.payu.in/merchant/postservice.php?form=2" if g.get("payu_mode") == "live"
            else "https://test.payu.in/merchant/postservice.php?form=2")


async def payu_verify_payment(g: dict, txnid: str) -> dict:
    key, salt = g.get("payu_merchant_key", ""), g.get("payu_salt", "")
    command = "verify_payment"
    digest = _sha512(f"{key}|{command}|{txnid}|{salt}")
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(_payu_postservice_url(g),
                              data={"key": key, "command": command, "var1": txnid, "hash": digest})
    r.raise_for_status()
    return r.json() if "json" in r.headers.get("content-type", "") else {"raw": r.text}


async def payu_refund(g: dict, mihpayid: str, amount_inr: float | None, receipt: str | None):
    key, salt = g.get("payu_merchant_key", ""), g.get("payu_salt", "")
    command = "cancel_refund_transaction"
    token = ("rf" + uuid.uuid4().hex)[:23]
    var3 = f"{float(amount_inr):.2f}" if amount_inr is not None else ""
    digest = _sha512(f"{key}|{command}|{mihpayid}|{salt}")
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(_payu_postservice_url(g), data={
            "key": key, "command": command, "var1": mihpayid, "var2": token, "var3": var3, "hash": digest})
    r.raise_for_status()
    return r.json() if "json" in r.headers.get("content-type", "") else {"raw": r.text}


def payu_verify_response(g: dict, p: dict) -> bool:
    """Reverse-hash verification of a PayU checkout callback."""
    key, salt = g.get("payu_merchant_key", ""), g.get("payu_salt", "")
    raw = "|".join([salt, p.get("status", ""), "", "", "", "", "",
                    p.get("udf5", ""), p.get("udf4", ""), p.get("udf3", ""),
                    p.get("udf2", ""), p.get("udf1", ""), p.get("email", ""),
                    p.get("firstname", ""), p.get("productinfo", ""), p.get("amount", ""),
                    p.get("txnid", ""), key])
    received = p.get("hash", "")
    return bool(received) and hmac.compare_digest(_sha512(raw), received)


# ════════════════════════════════════════════════════════════ EASEBUZZ
def easebuzz_live(g: dict) -> bool:
    return bool(g.get("easebuzz_enabled") and g.get("easebuzz_key") and g.get("easebuzz_salt"))


def _eb_base(g: dict) -> str:
    return "https://pay.easebuzz.in" if g.get("easebuzz_mode") == "live" else "https://testpay.easebuzz.in"


async def easebuzz_create_order(g: dict, amount_inr: float, receipt: str, customer: dict | None):
    c = _cust(customer)
    key, salt = g.get("easebuzz_key", ""), g.get("easebuzz_salt", "")
    txnid = ((receipt or "AZO") + uuid.uuid4().hex)[:25]
    amount = f"{float(amount_inr):.2f}"
    productinfo = (receipt or "AzoApp Service")[:100]
    surl = f"{_public_base()}/api/payments/webhooks/easebuzz-callback"
    p = {"key": key, "txnid": txnid, "amount": amount, "productinfo": productinfo,
         "firstname": c["name"], "email": c["email"], "phone": c["phone"],
         "surl": surl, "furl": surl, "udf1": txnid}
    raw = "|".join([key, txnid, amount, productinfo, c["name"], c["email"],
                    txnid, "", "", "", "", "", "", "", "", "", salt])
    p["hash"] = _sha512(raw)
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(f"{_eb_base(g)}/payment/initiateLink", data=p)
    r.raise_for_status()
    data = r.json()
    access_key = data.get("data") if data.get("status") in (1, "1", True) else None
    if not access_key:
        raise RuntimeError(f"Easebuzz initiate failed: {str(data)[:200]}")
    return {"gateway": "easebuzz", "method": "redirect", "amount": round(float(amount_inr), 2),
            "payment_url": f"{_eb_base(g)}/pay/{access_key}", "order_id": txnid}


async def easebuzz_status(g: dict, txnid: str) -> dict:
    key, salt = g.get("easebuzz_key", ""), g.get("easebuzz_salt", "")
    p = {"key": key, "txnid": txnid, "hash": _sha512(f"{key}|{txnid}|{salt}")}
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(f"{_eb_base(g)}/transaction/v2/retrieve", data=p)
    r.raise_for_status()
    return r.json()


async def easebuzz_refund(g: dict, easebuzz_id: str, amount_inr: float, receipt: str | None):
    key, salt = g.get("easebuzz_key", ""), g.get("easebuzz_salt", "")
    merchant_refund_id = ("rf" + uuid.uuid4().hex)[:20]
    amount = f"{float(amount_inr):.2f}"
    p = {"key": key, "easebuzz_id": easebuzz_id, "refund_amount": amount,
         "merchant_refund_id": merchant_refund_id,
         "hash": _sha512(f"{key}|{merchant_refund_id}|{easebuzz_id}|{amount}|{salt}")}
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(f"{_eb_base(g)}/transaction/v2/refund", data=p)
    r.raise_for_status()
    return r.json()


def easebuzz_verify_response(g: dict, p: dict) -> bool:
    key, salt = g.get("easebuzz_key", ""), g.get("easebuzz_salt", "")
    raw = "|".join([salt, p.get("status", ""), p.get("udf10", ""), p.get("udf9", ""),
                    p.get("udf8", ""), p.get("udf7", ""), p.get("udf6", ""),
                    p.get("udf5", ""), p.get("udf4", ""), p.get("udf3", ""),
                    p.get("udf2", ""), p.get("udf1", ""), p.get("email", ""),
                    p.get("firstname", ""), p.get("productinfo", ""), p.get("amount", ""),
                    p.get("txnid", ""), key])
    received = str(p.get("hash", "")).lower()
    return bool(received) and hmac.compare_digest(received, _sha512(raw))


# ════════════════════════════════════════════════════════════ JUSPAY
def juspay_live(g: dict) -> bool:
    return bool(g.get("juspay_enabled") and g.get("juspay_api_key")
                and g.get("juspay_merchant_id") and g.get("juspay_payment_page_client_id"))


def _js_base(g: dict) -> str:
    return "https://api.juspay.in" if g.get("juspay_mode") == "live" else "https://sandbox.juspay.in"


def _js_headers(g: dict, routing_id: str) -> dict:
    return {"x-merchantid": g.get("juspay_merchant_id", ""), "x-routing-id": routing_id, "Accept": "application/json"}


async def juspay_create_order(g: dict, amount_inr: float, receipt: str, customer: dict | None):
    c = _cust(customer)
    order_id = (("A" + uuid.uuid4().hex))[:20]
    body = {
        "amount": f"{float(amount_inr):.2f}", "order_id": order_id, "currency": "INR",
        "customer_id": c["id"], "customer_phone": c["phone"], "customer_email": c["email"],
        "payment_page_client_id": g.get("juspay_payment_page_client_id", ""),
        "action": "paymentPage",
        "return_url": f"{_public_base()}/payment/return?gw=juspay&order_id={order_id}",
    }
    async with httpx.AsyncClient(base_url=_js_base(g), auth=(g.get("juspay_api_key", ""), ""), timeout=20) as client:
        r = await client.post("/session", headers=_js_headers(g, c["id"]), json=body)
    r.raise_for_status()
    data = r.json()
    link = (data.get("payment_links", {}) or {}).get("web") or data.get("payment_link")
    if not link:
        raise RuntimeError("Juspay returned no hosted payment link")
    return {"gateway": "juspay", "method": "redirect", "amount": round(float(amount_inr), 2),
            "payment_url": link, "order_id": order_id, "routing_id": c["id"]}


async def juspay_order_status(g: dict, order_id: str, routing_id: str) -> str:
    async with httpx.AsyncClient(base_url=_js_base(g), auth=(g.get("juspay_api_key", ""), ""), timeout=20) as client:
        r = await client.get(f"/orders/{order_id}", headers=_js_headers(g, routing_id))
    r.raise_for_status()
    return (r.json() or {}).get("status", "")


async def juspay_refund(g: dict, order_id: str, amount_inr: float | None, routing_id: str):
    form = {"unique_request_id": ("rf" + uuid.uuid4().hex)[:20]}
    if amount_inr is not None:
        form["amount"] = f"{float(amount_inr):.2f}"
    async with httpx.AsyncClient(base_url=_js_base(g), auth=(g.get("juspay_api_key", ""), ""), timeout=20) as client:
        r = await client.post(f"/orders/{order_id}/refunds", headers=_js_headers(g, routing_id), data=form)
    r.raise_for_status()
    return r.json()


def juspay_verify_webhook(g: dict, auth_header: str | None) -> bool:
    user_ok = g.get("juspay_webhook_username", "")
    pass_ok = g.get("juspay_webhook_password", "")
    if not auth_header or not auth_header.lower().startswith("basic ") or not user_ok:
        return False
    try:
        raw = base64.b64decode(auth_header.split(" ", 1)[1]).decode()
        user, pwd = raw.split(":", 1)
        return hmac.compare_digest(user, user_ok) and hmac.compare_digest(pwd, pass_ok)
    except Exception:
        return False


# ════════════════════════════════════════════════════════════ registry helpers
GATEWAYS = ["razorpay", "cashfree", "payu", "easebuzz", "juspay"]


def payin_live(gateway: str, g: dict) -> bool:
    return {
        "cashfree": cashfree_live, "payu": payu_live,
        "easebuzz": easebuzz_live, "juspay": juspay_live,
    }.get(gateway, lambda _g: False)(g)
