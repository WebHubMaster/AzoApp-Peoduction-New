"""AI chat assistant via LiteLLM.

Provider + model + that provider's own API key are configured by the admin in
Integration Center (settings.integrations.ai_provider / ai_model / ai_api_key).
No platform/Emergent key is used — this is fully self-hosted friendly.
"""
import litellm
from config.database import db, now_iso, get_settings
from models.user import new_id

# Be forgiving: ignore params a given provider doesn't support instead of erroring.
litellm.drop_params = True

SYSTEM_PROMPTS = {
    "customer": ("You are AzoApp's home-service assistant for Indian customers. Speak in friendly Hinglish. "
                 "Help diagnose home appliance/electrical/plumbing/AC/cleaning issues, ask 1-2 short clarifying "
                 "questions, suggest the right service and an approximate price range in INR (₹), and encourage booking. Keep replies concise."),
    "partner": ("You are AzoApp's technician assistant. Given a fault, give a short diagnostic checklist, likely causes, "
                "tools and spare parts (with approx INR cost), and safety tips. Be practical and concise."),
    "admin": ("You are AzoApp's business-intelligence assistant. Answer the admin's questions about the home-service "
              "marketplace concisely using the data context provided. Give crisp, actionable insights."),
}

# Map an admin-chosen provider label to the LiteLLM provider prefix + a sane default model.
_PREFIX = {"anthropic": "anthropic", "claude": "anthropic",
           "openai": "openai", "gpt": "openai",
           "gemini": "gemini", "google": "gemini"}
_DEFAULT_MODEL = {"anthropic": "claude-3-5-sonnet-20241022",
                  "openai": "gpt-4o", "gemini": "gemini-2.5-flash"}


async def _ai_config() -> dict:
    s = await get_settings()
    integ = s.get("integrations", {}) or {}
    provider = (integ.get("ai_provider") or "anthropic").lower()
    prefix = _PREFIX.get(provider, "anthropic")
    model = integ.get("ai_model") or _DEFAULT_MODEL.get(prefix, "claude-3-5-sonnet-20241022")
    return {
        "enabled": integ.get("ai_enabled", True),
        "provider": provider,
        # LiteLLM model string, e.g. "anthropic/claude-3-5-sonnet-20241022",
        # "openai/gpt-4o", "gemini/gemini-2.5-flash".
        "model": f"{prefix}/{model}",
        "api_key": (integ.get("ai_api_key") or "").strip(),
    }


async def chat(user_id: str, role: str, message: str, session_id: str = None, context: str = "") -> dict:
    session_id = session_id or new_id()
    cfg = await _ai_config()
    sys = SYSTEM_PROMPTS.get(role, SYSTEM_PROMPTS["customer"])
    if context:
        sys += "\n\nDATA CONTEXT:\n" + context

    # load recent history for continuity
    history = await db.ai_messages.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1).to_list(20)
    prompt = message
    if history:
        convo = "\n".join([f"{m['role']}: {m['text']}" for m in history[-6:]])
        prompt = f"Recent conversation:\n{convo}\n\nUser: {message}"

    if not cfg["enabled"] or not cfg["api_key"]:
        reply = ("AI assistant abhi configure nahi hua hai. Admin \u2192 Integration Center me "
                 "AI Assistant provider aur us provider ki API key add karein.")
    else:
        try:
            resp = await litellm.acompletion(
                model=cfg["model"],
                messages=[{"role": "system", "content": sys},
                          {"role": "user", "content": prompt}],
                api_key=cfg["api_key"],
                stream=True,
            )
            reply = ""
            async for chunk in resp:
                try:
                    delta = chunk.choices[0].delta.content or ""
                except Exception:  # noqa: BLE001
                    delta = ""
                reply += delta
            reply = reply.strip() or "\u2026"
        except Exception as e:  # noqa: BLE001
            reply = f"AI service error: {str(e)[:200]}"

    await db.ai_messages.insert_one({"id": new_id(), "session_id": session_id, "user_id": user_id,
                                     "role": "user", "text": message, "created_at": now_iso()})
    await db.ai_messages.insert_one({"id": new_id(), "session_id": session_id, "user_id": user_id,
                                     "role": "assistant", "text": reply, "created_at": now_iso()})
    return {"session_id": session_id, "reply": reply}
