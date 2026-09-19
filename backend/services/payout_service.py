"""RazorpayX Payouts — pay an approved withdrawal to the beneficiary's bank/UPI.

Runs in SAFE SIMULATED mode until the admin enters all RazorpayX credentials
(account_number + key_id + key_secret) and flips razorpayx_enabled ON in the
Integration Center. In simulated mode no network call is made and a local
`pout_sim_*` record with status "processed" is returned so the whole withdrawal
flow is testable end-to-end. With real keys it does Contact → Fund Account →
Payout (IMPS/NEFT for bank, UPI for VPA) and the payout webhook finalises status.
"""
import hmac
import hashlib
import uuid
import httpx
from config.database import db, now_iso, get_settings
from services import payout_gateways as pg
from services import gateway_resolver as gr

BASE_URL = "https://api.razorpay.com"


async def _integrations() -> dict:
    s = await get_settings()
    return s.get("integrations", {}) or {}


async def active_payout_gateway() -> str:
    g = await _integrations()
    return gr.active_gateway(g, "payout")


async def payout_state() -> dict:
    """Resolved state of the ACTIVE payout gateway (gateway, mode, env, configured...)."""
    g = await _integrations()
    return gr.resolve_payout(g)


def _cfg_from(res: dict) -> dict:
    """RazorpayX credential bundle from a resolved (synthesized) payout config."""
    sg = res["g"]
    return {
        "account_number": sg.get("razorpayx_account_number") or "",
        "key_id": sg.get("razorpayx_key_id") or "",
        "key_secret": sg.get("razorpayx_key_secret") or "",
        "webhook_secret": sg.get("razorpayx_webhook_secret") or "",
        "enabled": bool(res["enabled"]),
    }


async def is_live() -> bool:
    """Whether the ACTIVE payout gateway is fully configured for its ACTIVE mode
    (else simulated)."""
    return (await payout_state())["configured"]


def _mode_for(w: dict) -> str:
    return "UPI" if (w.get("method") == "upi") else "IMPS"


async def _req(c, method, path, **kw):
    async with httpx.AsyncClient(base_url=BASE_URL, auth=(c["key_id"], c["key_secret"]), timeout=20.0) as client:
        r = await client.request(method, path, **kw)
    if r.status_code >= 400:
        raise RuntimeError(f"RazorpayX {r.status_code}: {r.text[:200]}")
    return r.json()


async def _contact_and_fund(c, w: dict):
    ref = f"wd:{w['id']}"[:40]
    contacts = await _req(c, "GET", "/v1/contacts", params={"reference_id": ref})
    contact = next(iter(contacts.get("items", [])), None)
    if not contact:
        contact = await _req(c, "POST", "/v1/contacts", json={
            "name": w.get("partner_name") or w.get("name") or "Beneficiary",
            "type": "customer", "reference_id": ref})
    dtype = "vpa" if w.get("method") == "upi" else "bank_account"
    fas = await _req(c, "GET", "/v1/fund_accounts", params={"contact_id": contact["id"], "account_type": dtype})
    fund = next(iter(fas.get("items", [])), None)
    if fund:
        return fund
    if dtype == "vpa":
        body = {"contact_id": contact["id"], "account_type": "vpa", "vpa": {"address": w.get("upi_id")}}
    else:
        bank = w.get("bank") or {}
        body = {"contact_id": contact["id"], "account_type": "bank_account", "bank_account": {
            "name": bank.get("account_name") or w.get("partner_name") or "Beneficiary",
            "ifsc": bank.get("ifsc"), "account_number": bank.get("account_number")}}
    return await _req(c, "POST", "/v1/fund_accounts", json=body)


async def create_payout(w: dict) -> dict:
    """Create a payout for a withdrawal doc on the ACTIVE payout gateway in its
    ACTIVE mode. Returns a payout record dict
    {payout_id, status, mode, simulated, gateway, gateway_mode, env, ...}. Never raises.

    * gateway DISABLED           → SAFE SIMULATED payout (dev/testable).
    * gateway ENABLED+INCOMPLETE → FAILED with a clear config error (NO fallback,
                                   NO wrong-mode execution, NO simulate).
    * gateway CONFIGURED         → real payout in that exact mode.
    """
    g = await _integrations()
    res = gr.resolve_payout(g)
    gwn, gmode, env = res["gateway"], res["mode"], res["env"]
    mode = _mode_for(w)
    net = float(w.get("net_amount", w.get("amount", 0)))
    snap = {"gateway": gwn, "gateway_mode": gmode, "env": env}

    # Enabled but active mode not fully configured → do NOT execute, do NOT fall back.
    if res["incomplete"]:
        return {"payout_id": None, "status": "failed", "mode": mode, "simulated": False,
                "amount": net, "error": res["error"], **snap}

    # Gateway disabled → safe simulated (dev flow, fully testable).
    if not res["configured"]:
        return {"payout_id": f"pout_sim_{uuid.uuid4().hex}", "status": "processed",
                "mode": mode, "simulated": True, "amount": net, **snap}

    sg = res["g"]

    # Non-Razorpay gateways
    if gwn != "razorpay":
        try:
            out = await pg.dispatch_payout(gwn, sg, w)
            out.setdefault("amount", net)
            out.update(snap)
            return out
        except Exception as e:  # noqa: BLE001
            return {"payout_id": None, "status": "failed", "mode": mode,
                    "simulated": False, "error": str(e)[:200], **snap}

    # Razorpay (RazorpayX)
    c = _cfg_from(res)
    try:
        fund = await _contact_and_fund(c, w)
        ref = f"wd:{w['id']}"[:40]
        body = {"account_number": c["account_number"], "fund_account_id": fund["id"],
                "amount": int(round(net * 100)), "currency": "INR", "mode": mode,
                "purpose": "payout", "queue_if_low_balance": True,
                "reference_id": ref, "narration": f"Withdrawal {w['id']}"[:30]}
        idem = hashlib.sha256(ref.encode()).hexdigest()
        r = await _req(c, "POST", "/v1/payouts", json=body, headers={"X-Payout-Idempotency": idem})
        return {"payout_id": r.get("id"), "status": r.get("status", "queued"),
                "mode": mode, "simulated": False, "utr": r.get("utr"), "raw": r, **snap}
    except Exception as e:  # noqa: BLE001
        return {"payout_id": None, "status": "failed", "mode": mode,
                "simulated": False, "error": str(e)[:200], **snap}


def verify_webhook(raw: bytes, signature: str, secret: str) -> bool:
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


async def handle_webhook(event: dict) -> dict:
    """Finalise a withdrawal from a payout.* webhook (monotonic; never double-processes)."""
    entity = (event.get("payload", {}) or {}).get("payout", {}).get("entity", {}) or {}
    payout_id = entity.get("id")
    status = entity.get("status")
    if not payout_id:
        return {"ok": False}
    w = await db.partner_withdrawals.find_one({"payout.payout_id": payout_id}, {"_id": 0})
    if not w:
        return {"ok": False, "reason": "unknown payout"}
    if w.get("status") in ("completed", "rejected") and status != "reversed":
        return {"ok": True, "skipped": "terminal"}
    map_status = {"processed": "completed", "reversed": "reversed", "failed": "failed"}.get(status, "processing")
    await db.partner_withdrawals.update_one({"id": w["id"]}, {"$set": {
        "status": map_status if map_status in ("completed", "reversed", "failed") else w.get("status"),
        "payout.status": status, "payout.utr": entity.get("utr"), "updated_at": now_iso()}})
    return {"ok": True}
