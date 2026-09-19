"""Aadhaar OCR — extract the 12-digit number from an uploaded image/PDF using a
vision LLM via LiteLLM. Provider + model + that provider's own API key are
admin-configurable (settings.integrations.ocr_provider / ocr_model / ocr_api_key).
No platform/Emergent key is used — fully self-hosted friendly.
"""
import re
import base64
import litellm
from config.database import get_settings

litellm.drop_params = True

_EXT_MIME = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "webp": "image/webp", "pdf": "application/pdf", "heic": "image/heic",
}

_PROMPT = (
    "You are an OCR engine for Indian Aadhaar cards. Read the document image and "
    "extract ONLY the 12-digit Aadhaar number (it is usually printed as 4-4-4 digits). "
    "Respond with the 12 digits only, no spaces or text. If no Aadhaar number is "
    "clearly visible, respond with the single word NONE."
)

# Map an admin-chosen provider label to the LiteLLM provider prefix + a sane default model.
_PREFIX = {"gemini": "gemini", "google": "gemini",
           "openai": "openai", "gpt": "openai",
           "anthropic": "anthropic", "claude": "anthropic"}
_DEFAULT_MODEL = {"gemini": "gemini-2.5-flash", "openai": "gpt-4o",
                  "anthropic": "claude-3-5-sonnet-20241022"}


def normalize_aadhaar(s: str) -> str:
    return re.sub(r"\D", "", s or "")


async def _ocr_config() -> dict:
    s = await get_settings()
    integ = s.get("integrations", {}) or {}
    provider = (integ.get("ocr_provider") or "gemini").lower()
    prefix = _PREFIX.get(provider, "gemini")
    model = integ.get("ocr_model") or _DEFAULT_MODEL.get(prefix, "gemini-2.5-flash")
    return {
        "enabled": integ.get("ocr_enabled", True),
        "provider": provider,
        # LiteLLM model string, e.g. "gemini/gemini-2.5-flash".
        "model": f"{prefix}/{model}",
        "api_key": (integ.get("ocr_api_key") or "").strip(),
    }


async def extract_aadhaar_number(raw: bytes, ext: str) -> dict:
    """Returns {ok, extracted, provider, error}."""
    cfg = await _ocr_config()
    if not cfg["enabled"]:
        return {"ok": False, "extracted": "", "error": "ocr_disabled"}
    if not cfg["api_key"]:
        return {"ok": False, "extracted": "", "error": "ocr_not_configured"}

    ext = (ext or "").lower().lstrip(".")
    mime = _EXT_MIME.get(ext, "image/jpeg")

    try:
        b64 = base64.b64encode(raw).decode()
        data_uri = f"data:{mime};base64,{b64}"
        # OpenAI-style multimodal message; LiteLLM translates it for Gemini/Anthropic.
        messages = [{
            "role": "user",
            "content": [
                {"type": "text", "text": _PROMPT},
                {"type": "image_url", "image_url": {"url": data_uri}},
            ],
        }]
        resp = await litellm.acompletion(
            model=cfg["model"], messages=messages, api_key=cfg["api_key"])
        text = ""
        try:
            text = resp.choices[0].message.content or ""
        except Exception:  # noqa: BLE001
            text = str(resp)

        digits = normalize_aadhaar(text)
        # pick the first 12-digit run if the model returned extra characters
        m = re.search(r"\d{12}", digits)
        extracted = m.group(0) if m else (digits if len(digits) == 12 else "")
        return {"ok": bool(extracted), "extracted": extracted,
                "provider": cfg["provider"], "raw": (text or "")[:200]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "extracted": "", "error": str(e)[:200]}
