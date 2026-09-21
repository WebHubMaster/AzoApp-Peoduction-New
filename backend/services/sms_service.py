"""Fast2SMS (India) SMS gateway. Credentials read from admin settings at runtime.

If SMS is disabled or no API key configured, send_* return False so callers fall
back to dev mode (OTP returned in API response). No SMS provider secret is ever
exposed to the frontend.
"""
import os
import httpx
from config.database import get_settings

BASE = "https://www.fast2sms.com/dev/bulkV2"
CUSTOM_ROUTES = ("q", "quick", "custom", "otp_custom")


async def _cfg():
    s = await get_settings()
    return s.get("integrations", {})


def _custom_otp_message(g: dict, otp: str) -> str:
    """Branded OTP body for the Fast2SMS custom-message ('q') route, formatted for
    Android SMS Retriever / autofill: a leading `<#>` and the app's 11-char hash on
    the last line make the OTP auto-fill on the device. Brand name & app hash come
    from admin SMS settings (or the SMS_APP_HASH env fallback)."""
    brand = g.get("sms_brand_name") or "AzoApp"
    app_hash = (g.get("sms_app_hash") or os.environ.get("SMS_APP_HASH") or "").strip()
    msg = f"<#> Your {brand} OTP is {otp}. Valid for 10 minutes. Do not share it with anyone."
    if app_hash:
        msg += f"\n{app_hash}"
    return msg


def _custom_params(key: str, g: dict, otp: str, number: str) -> dict:
    params = {"authorization": key, "route": "q", "message": _custom_otp_message(g, otp),
              "language": "english", "flash": 0, "numbers": number}
    if g.get("fast2sms_sender_id"):
        params["sender_id"] = g["fast2sms_sender_id"]
    return params


async def sms_configured() -> bool:
    """True only when a live SMS gateway is enabled AND an API key is present.
    Until this is True, the whole app falls back to the fixed demo OTP (123456)."""
    g = await _cfg()
    return bool(g.get("sms_enabled") and g.get("fast2sms_api_key"))


def _digits(phone: str) -> str:
    p = "".join(ch for ch in str(phone) if ch.isdigit())
    return p[-10:]


async def send_otp_sms(phone: str, otp: str) -> bool:
    g = await _cfg()
    if not g.get("sms_enabled") or not g.get("fast2sms_api_key"):
        return False
    key = g["fast2sms_api_key"]
    number = _digits(phone)
    if len(number) != 10:
        return False
    route = (g.get("fast2sms_route") or "otp").lower()
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            if route in CUSTOM_ROUTES:
                params = _custom_params(key, g, otp, number)
            elif route == "dlt" and g.get("fast2sms_sender_id") and (g.get("fast2sms_otp_template_id") or g.get("fast2sms_message_id")):
                params = {"authorization": key, "route": "dlt",
                          "sender_id": g["fast2sms_sender_id"], "message": (g.get("fast2sms_otp_template_id") or g.get("fast2sms_message_id")),
                          "variables_values": str(otp), "numbers": number}
            else:
                params = {"authorization": key, "route": "otp",
                          "variables_values": str(otp), "numbers": number}
            r = await client.get(BASE, params=params)
            return bool(r.json().get("return"))
    except Exception:
        return False


async def send_test(phone: str, otp: str = "123456") -> dict:
    """Admin diagnostic: send a real test OTP via the configured gateway and return
    the RAW Fast2SMS response so the admin can see exactly why delivery fails."""
    g = await _cfg()
    if not g.get("sms_enabled"):
        return {"ok": False, "error": "SMS is disabled — enable it in the SMS card first."}
    if not g.get("fast2sms_api_key"):
        return {"ok": False, "error": "No Fast2SMS API key configured."}
    number = _digits(phone)
    if len(number) != 10:
        return {"ok": False, "error": "Enter a valid 10-digit mobile number."}
    key = g["fast2sms_api_key"]
    route = (g.get("fast2sms_route") or "otp").lower()
    use_custom = route in CUSTOM_ROUTES
    use_dlt = route == "dlt" and g.get("fast2sms_sender_id") and (g.get("fast2sms_otp_template_id") or g.get("fast2sms_message_id"))
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            if use_custom:
                params = _custom_params(key, g, otp, number)
            elif use_dlt:
                params = {"authorization": key, "route": "dlt", "sender_id": g["fast2sms_sender_id"],
                          "message": (g.get("fast2sms_otp_template_id") or g.get("fast2sms_message_id")), "variables_values": str(otp), "numbers": number}
            else:
                params = {"authorization": key, "route": "otp", "variables_values": str(otp), "numbers": number}
            r = await client.get(BASE, params=params)
            try:
                data = r.json()
            except Exception:  # noqa: BLE001
                data = {"raw": r.text[:500]}
            ok = bool(data.get("return"))
            msg = ("Test OTP sent — check the phone." if ok
                   else (", ".join(data.get("message", [])) if isinstance(data.get("message"), list)
                         else str(data.get("message") or "Gateway rejected the request.")))
            return {"ok": ok, "status_code": r.status_code, "route": "q" if use_custom else "dlt" if use_dlt else "otp",
                    "message": msg, "response": data, "to": number}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"Network/gateway error: {str(e)[:250]}"}


async def send_text_sms(phone: str, message: str) -> bool:
    g = await _cfg()
    if not g.get("sms_enabled") or not g.get("fast2sms_api_key"):
        return False
    key = g["fast2sms_api_key"]
    number = _digits(phone)
    if len(number) != 10:
        return False
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            if g.get("fast2sms_sender_id") and (g.get("fast2sms_otp_template_id") or g.get("fast2sms_message_id")):
                params = {"authorization": key, "route": "dlt",
                          "sender_id": g["fast2sms_sender_id"], "message": (g.get("fast2sms_otp_template_id") or g.get("fast2sms_message_id")),
                          "variables_values": message, "numbers": number}
            else:
                params = {"authorization": key, "route": "q",
                          "message": message, "language": "english", "numbers": number}
            r = await client.get(BASE, params=params)
            return bool(r.json().get("return"))
    except Exception:
        return False
