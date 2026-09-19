"""Multi-gateway PAYOUT implementations (Cashfree, PayU, Easebuzz, Juspay).

Driven by admin `settings.integrations`. A gateway is *live* only when enabled and
its payout credentials are present; otherwise the dispatcher (payout_service.py)
returns a SAFE SIMULATED payout so the withdrawal flow is testable end-to-end.

Input `w` is a partner_withdrawals doc:
  { id, partner_name|name, method: 'upi'|'bank', upi_id, bank:{account_name,ifsc,account_number},
    net_amount|amount }
Each function returns {payout_id, status, mode, simulated:False, ...} or raises.
"""
import uuid
import hashlib
import hmac
import base64

import httpx


def _amount(w: dict) -> float:
    return round(float(w.get("net_amount", w.get("amount", 0)) or 0), 2)


def _bene_name(w: dict) -> str:
    return w.get("partner_name") or w.get("name") or (w.get("bank") or {}).get("account_name") or "Beneficiary"


# ════════════════════════════════════════════════════════════ CASHFREE
def cashfree_payout_live(g: dict) -> bool:
    return bool(g.get("cashfree_enabled") and g.get("cashfree_payout_client_id") and g.get("cashfree_payout_client_secret"))


def _cf_po_base(g: dict) -> str:
    return "https://api.cashfree.com/payout" if g.get("cashfree_mode") == "live" else "https://sandbox.cashfree.com/payout"


async def cashfree_payout(g: dict, w: dict) -> dict:
    transfer_id = ("wd" + w["id"].replace("-", ""))[:40]
    amount = _amount(w)
    is_upi = w.get("method") == "upi"
    details = {"vpa": w.get("upi_id")} if is_upi else {
        "bank_account_number": (w.get("bank") or {}).get("account_number"),
        "bank_ifsc": (w.get("bank") or {}).get("ifsc")}
    body = {"transfer_id": transfer_id, "transfer_amount": amount, "transfer_currency": "INR",
            "transfer_mode": "upi" if is_upi else "imps",
            "beneficiary_details": {"beneficiary_id": transfer_id, "beneficiary_name": _bene_name(w),
                                    "beneficiary_instrument_details": details}}
    headers = {"accept": "application/json", "content-type": "application/json", "x-api-version": "2024-01-01",
               "x-client-id": g.get("cashfree_payout_client_id", ""),
               "x-client-secret": g.get("cashfree_payout_client_secret", ""),
               "x-request-id": str(uuid.uuid4())}
    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.post(f"{_cf_po_base(g)}/transfers", headers=headers, json=body)
    r.raise_for_status()
    res = r.json()
    return {"payout_id": res.get("cf_transfer_id") or transfer_id, "status": res.get("status", "RECEIVED"),
            "mode": "UPI" if is_upi else "IMPS", "simulated": False, "utr": res.get("transfer_utr"), "raw": res}


def cashfree_payout_verify_webhook(g: dict, raw: bytes, timestamp: str, signature: str) -> bool:
    secret = g.get("cashfree_payout_client_secret", "")
    if not (secret and signature and timestamp):
        return False
    expected = base64.b64encode(hmac.new(secret.encode(), timestamp.encode() + raw, hashlib.sha256).digest()).decode()
    return hmac.compare_digest(expected, signature)


# ════════════════════════════════════════════════════════════ PAYU
def payu_payout_live(g: dict) -> bool:
    return bool(g.get("payu_enabled") and g.get("payu_payout_merchant_id")
                and g.get("payu_payout_client_id") and g.get("payu_payout_client_secret"))


def _payu_payout_urls(g: dict):
    if g.get("payu_mode") == "live":
        return "https://accounts.payu.in/oauth/token", "https://payout.payumoney.com/payout"
    return "https://uat-accounts.payu.in/oauth/token", "https://uatoneapi.payu.in/payout"


async def payu_payout(g: dict, w: dict) -> dict:
    token_url, base = _payu_payout_urls(g)
    amount = _amount(w)
    is_upi = w.get("method") == "upi"
    ref = ("wd" + w["id"].replace("-", ""))[:40]
    async with httpx.AsyncClient(timeout=25) as client:
        tr = await client.post(token_url, data={"grant_type": "client_credentials",
             "client_id": g.get("payu_payout_client_id", ""), "client_secret": g.get("payu_payout_client_secret", ""),
             "scope": "create_payout_transactions"})
        tr.raise_for_status()
        token = tr.json()["access_token"]
        transfer = {"beneficiaryName": _bene_name(w), "purpose": "Partner payout", "amount": amount,
                    "batchId": ref, "merchantRefId": ref, "paymentType": "UPI" if is_upi else "IMPS", "retry": False}
        if is_upi:
            transfer["vpa"] = w.get("upi_id")
        else:
            b = w.get("bank") or {}
            transfer.update(beneficiaryAccountNumber=b.get("account_number"), beneficiaryIfscCode=b.get("ifsc"))
        headers = {"Authorization": f"Bearer {token}", "pid": g.get("payu_payout_merchant_id", ""),
                   "Content-Type": "application/json"}
        r = await client.post(f"{base}/v2/payment", headers=headers, json=[transfer])
    r.raise_for_status()
    res = r.json()
    return {"payout_id": ref, "status": "RECEIVED", "mode": "UPI" if is_upi else "IMPS",
            "simulated": False, "raw": res}


# ════════════════════════════════════════════════════════════ EASEBUZZ (Wire)
def easebuzz_payout_live(g: dict) -> bool:
    return bool(g.get("easebuzz_enabled") and g.get("easebuzz_wire_key") and g.get("easebuzz_wire_salt"))


async def easebuzz_payout(g: dict, w: dict) -> dict:
    base = (g.get("easebuzz_wire_base") or "https://wire.easebuzz.in").rstrip("/")
    key, salt = g.get("easebuzz_wire_key", ""), g.get("easebuzz_wire_salt", "")
    ref = ("wd" + w["id"].replace("-", ""))[:40]
    amount = f"{_amount(w):.2f}"
    is_upi = w.get("method") == "upi"
    payload = {"key": key, "reference_id": ref, "amount": amount, "beneficiary_name": _bene_name(w),
               "mode": "upi" if is_upi else "banktransfer", "narrative": "Partner payout"}
    if is_upi:
        payload["vpa"] = w.get("upi_id")
    else:
        b = w.get("bank") or {}
        payload["account"] = b.get("account_number")
        payload["ifsc"] = b.get("ifsc")
    payload["hash"] = hashlib.sha512(f"{key}|{ref}|{amount}|{salt}".encode()).hexdigest()
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(f"{base}/api/v1/beneficiary/transfer", json=payload)
    r.raise_for_status()
    res = r.json()
    return {"payout_id": ref, "status": "RECEIVED", "mode": "UPI" if is_upi else "IMPS",
            "simulated": False, "raw": res}


# ════════════════════════════════════════════════════════════ JUSPAY
def juspay_payout_live(g: dict) -> bool:
    return bool(g.get("juspay_enabled") and g.get("juspay_api_key") and g.get("juspay_merchant_id"))


def _js_base(g: dict) -> str:
    return "https://api.juspay.in" if g.get("juspay_mode") == "live" else "https://sandbox.juspay.in"


async def juspay_payout(g: dict, w: dict) -> dict:
    order_id = ("wd" + w["id"].replace("-", ""))[:64]
    amount = _amount(w)
    is_upi = w.get("method") == "upi"
    routing = w.get("partner_id") or order_id
    details = {"name": _bene_name(w)}
    if is_upi:
        details["vpa"] = w.get("upi_id")
        bene_type = "UPI_ID"
    else:
        b = w.get("bank") or {}
        details["account"] = b.get("account_number")
        details["ifsc"] = b.get("ifsc")
        bene_type = "ACCOUNT_IFSC"
    body = {"orderId": order_id, "customerId": routing, "amount": amount, "type": "FULFILL_ONLY",
            "fulfillments": [{"amount": amount, "beneficiaryDetails": {"type": bene_type, "details": details},
                              "additionalInfo": {"remark": "Partner payout"}}]}
    headers = {"x-merchantid": g.get("juspay_merchant_id", ""), "x-routing-id": routing, "Accept": "application/json"}
    async with httpx.AsyncClient(base_url=_js_base(g), auth=(g.get("juspay_api_key", ""), ""), timeout=25) as client:
        r = await client.post("/payout/merchant/v1/orders", headers=headers, json=body)
    r.raise_for_status()
    res = r.json()
    return {"payout_id": order_id, "status": res.get("status", "READY_FOR_FULFILLMENT"),
            "mode": "UPI" if is_upi else "IMPS", "simulated": False, "raw": res}


# ════════════════════════════════════════════════════════════ registry
def payout_live(gateway: str, g: dict) -> bool:
    return {
        "cashfree": cashfree_payout_live, "payu": payu_payout_live,
        "easebuzz": easebuzz_payout_live, "juspay": juspay_payout_live,
    }.get(gateway, lambda _g: False)(g)


async def dispatch_payout(gateway: str, g: dict, w: dict) -> dict:
    if gateway == "cashfree":
        return await cashfree_payout(g, w)
    if gateway == "payu":
        return await payu_payout(g, w)
    if gateway == "easebuzz":
        return await easebuzz_payout(g, w)
    if gateway == "juspay":
        return await juspay_payout(g, w)
    raise RuntimeError(f"Unknown payout gateway {gateway}")
