"""Centralized Payment/Payout Gateway Resolver — the single source of truth for
which gateway + which MODE (test/live) a transaction runs in.

GOLDEN RULE
-----------
The ACTIVE gateway, in its ACTIVE mode, using that mode's OWN credentials and that
mode's OWN API endpoint, is EXACTLY what processes a transaction. There is:
  * NO mixing of TEST and LIVE credentials,
  * NO silent fallback to the other mode,
  * NO fallback to a different gateway,
  * NO fallback to default/env credentials for LIVE.

Backward-compatible storage
---------------------------
Credentials are stored per-gateway, per-mode in `settings.integrations` using
`{gateway}_{mode}_{suffix}` field names (e.g. `cashfree_test_pg_app_id`,
`cashfree_live_pg_app_id`). Legacy single-field names (e.g. `cashfree_pg_app_id`)
are honoured ONLY as a TEST-mode fallback so existing configs keep working — LIVE
mode ALWAYS requires explicit live credentials (never legacy/env).

The resolver returns a *synthesized* integrations dict (`g`) in which the legacy
field names the low-level gateway functions already read are filled with the
resolved mode's values and `{gateway}_mode` is pinned. This lets the existing
provider implementations in payment_gateways.py / payout_gateways.py run unchanged
while being 100% mode-deterministic.
"""
import os

GATEWAYS = ["razorpay", "cashfree", "payu", "easebuzz", "juspay"]
MODES = ("test", "live")


class GatewayConfigError(Exception):
    """Raised when the ACTIVE gateway is enabled but its ACTIVE mode is not fully
    configured. Callers MUST surface this as a clear error and MUST NOT fall back."""


# ── Per-gateway credential maps ─────────────────────────────────────────────
# legacy_field (what the provider fn reads) -> base suffix (new fields are
# `{gateway}_{mode}_{suffix}`). For most gateways legacy == `{gateway}_{suffix}`.
_PAYIN_MAP = {
    "razorpay": {
        "razorpay_key_id": "key_id",
        "razorpay_key_secret": "key_secret",
        "razorpay_webhook_secret": "webhook_secret",
    },
    "cashfree": {
        "cashfree_pg_app_id": "pg_app_id",
        "cashfree_pg_secret_key": "pg_secret_key",
    },
    "payu": {
        "payu_merchant_key": "merchant_key",
        "payu_salt": "salt",
    },
    "easebuzz": {
        "easebuzz_key": "key",
        "easebuzz_salt": "salt",
    },
    "juspay": {
        "juspay_api_key": "api_key",
        "juspay_merchant_id": "merchant_id",
        "juspay_payment_page_client_id": "payment_page_client_id",
        "juspay_webhook_username": "webhook_username",
        "juspay_webhook_password": "webhook_password",
    },
}

_PAYOUT_MAP = {
    "razorpay": {  # RazorpayX
        "razorpayx_account_number": "account_number",
        "razorpayx_key_id": "key_id",
        "razorpayx_key_secret": "key_secret",
        "razorpayx_webhook_secret": "webhook_secret",
    },
    "cashfree": {
        "cashfree_payout_client_id": "payout_client_id",
        "cashfree_payout_client_secret": "payout_client_secret",
    },
    "payu": {
        "payu_payout_merchant_id": "payout_merchant_id",
        "payu_payout_client_id": "payout_client_id",
        "payu_payout_client_secret": "payout_client_secret",
    },
    "easebuzz": {
        "easebuzz_wire_key": "wire_key",
        "easebuzz_wire_salt": "wire_salt",
        "easebuzz_wire_base": "wire_base",
    },
    "juspay": {
        "juspay_api_key": "api_key",
        "juspay_merchant_id": "merchant_id",
    },
}

# Which legacy fields MUST be present for a mode to count as "configured".
_PAYIN_REQUIRED = {
    "razorpay": ["razorpay_key_id", "razorpay_key_secret"],
    "cashfree": ["cashfree_pg_app_id", "cashfree_pg_secret_key"],
    "payu": ["payu_merchant_key", "payu_salt"],
    "easebuzz": ["easebuzz_key", "easebuzz_salt"],
    "juspay": ["juspay_api_key", "juspay_merchant_id", "juspay_payment_page_client_id"],
}
_PAYOUT_REQUIRED = {
    "razorpay": ["razorpayx_account_number", "razorpayx_key_id", "razorpayx_key_secret"],
    "cashfree": ["cashfree_payout_client_id", "cashfree_payout_client_secret"],
    "payu": ["payu_payout_merchant_id", "payu_payout_client_id", "payu_payout_client_secret"],
    "easebuzz": ["easebuzz_wire_key", "easebuzz_wire_salt"],
    "juspay": ["juspay_api_key", "juspay_merchant_id"],
}

# Env-var fallbacks allowed for TEST mode ONLY (never live).
_TEST_ENV_FALLBACK = {
    "razorpay_key_id": "RAZORPAY_KEY_ID",
    "razorpay_key_secret": "RAZORPAY_KEY_SECRET",
}


def _new_field(gateway: str, mode: str, suffix: str) -> str:
    return f"{gateway}_{mode}_{suffix}"


def normalize_mode(mode) -> str:
    m = str(mode or "test").lower()
    return m if m in MODES else "test"


def _enabled_flag(g: dict, gateway: str, direction: str) -> bool:
    if direction == "payout" and gateway == "razorpay":
        return bool(g.get("razorpayx_enabled"))
    return bool(g.get(f"{gateway}_enabled"))


def _mode_field(gateway: str, direction: str) -> str:
    # Each gateway carries a single active-environment toggle. Razorpay payout
    # (RazorpayX) has its own toggle so pay-in & payout can differ.
    if direction == "payout" and gateway == "razorpay":
        return "razorpayx_mode"
    return f"{gateway}_mode"


def active_gateway(g: dict, direction: str) -> str:
    key = "active_payin_gateway" if direction == "payin" else "active_payout_gateway"
    gwn = str(g.get(key) or "razorpay").lower()
    return gwn if gwn in GATEWAYS else "razorpay"


def active_mode(g: dict, gateway: str, direction: str) -> str:
    return normalize_mode(g.get(_mode_field(gateway, direction)))


def _resolve_value(g: dict, gateway: str, mode: str, legacy: str, suffix: str):
    """Resolve one credential value for a gateway+mode.
    LIVE  → new live field ONLY (no legacy/env fallback).
    TEST  → new test field, else legacy field, else env fallback.
    """
    new_v = g.get(_new_field(gateway, mode, suffix))
    if new_v not in (None, ""):
        return new_v
    if mode == "test":
        legacy_v = g.get(legacy)
        if legacy_v not in (None, ""):
            return legacy_v
        env_name = _TEST_ENV_FALLBACK.get(legacy)
        if env_name:
            return os.environ.get(env_name) or None
    return None


def _cred_map(direction: str, gateway: str) -> dict:
    return (_PAYIN_MAP if direction == "payin" else _PAYOUT_MAP).get(gateway, {})


def _required(direction: str, gateway: str) -> list:
    return (_PAYIN_REQUIRED if direction == "payin" else _PAYOUT_REQUIRED).get(gateway, [])


def _synthesize(g: dict, gateway: str, mode: str, direction: str) -> dict:
    """Return a copy of `g` with the legacy credential fields the low-level provider
    functions read filled from the resolved mode, and the mode toggle pinned."""
    synth = dict(g or {})
    for legacy, suffix in _cred_map(direction, gateway).items():
        synth[legacy] = _resolve_value(g, gateway, mode, legacy, suffix)
    # Pin the gateway's environment toggle so base-URL selection is deterministic.
    synth[f"{gateway}_mode"] = mode
    return synth


def _label(gateway: str, mode: str, direction: str) -> str:
    return f"{gateway.capitalize()} {mode.upper()} MODE ({'pay-in' if direction == 'payin' else 'payout'})"


def env_name(mode: str) -> str:
    return "production" if mode == "live" else "sandbox"


def resolve(g: dict, direction: str, gateway: str = None, mode: str = None) -> dict:
    """Resolve the effective gateway + mode + credentials for a direction.

    Pass `gateway`/`mode` to force a SPECIFIC configuration (e.g. refunding an old
    transaction from its stored snapshot). Omit them to use the ACTIVE selection.

    Returns:
      { gateway, mode, direction, env, enabled, configured, incomplete,
        error, g (synthesized integrations dict) }
    """
    g = g or {}
    gateway = (gateway or active_gateway(g, direction)).lower()
    if gateway not in GATEWAYS:
        gateway = "razorpay"
    mode = normalize_mode(mode) if mode else active_mode(g, gateway, direction)
    enabled = _enabled_flag(g, gateway, direction)
    synth = _synthesize(g, gateway, mode, direction)
    missing = [f for f in _required(direction, gateway) if synth.get(f) in (None, "")]
    configured = bool(enabled and not missing)
    incomplete = bool(enabled and missing)
    error = None
    if incomplete:
        error = f"{_label(gateway, mode, direction)} is not fully configured."
    return {
        "gateway": gateway, "mode": mode, "direction": direction,
        "env": env_name(mode), "enabled": enabled,
        "configured": configured, "incomplete": incomplete,
        "missing": missing, "error": error, "g": synth,
    }


def resolve_payin(g: dict, gateway: str = None, mode: str = None) -> dict:
    return resolve(g, "payin", gateway, mode)


def resolve_payout(g: dict, gateway: str = None, mode: str = None) -> dict:
    return resolve(g, "payout", gateway, mode)


def mode_configured(g: dict, direction: str, gateway: str, mode: str) -> bool:
    """Is a SPECIFIC gateway+mode fully configured (regardless of enabled/active)?"""
    synth = _synthesize(g or {}, gateway, normalize_mode(mode), direction)
    return all(synth.get(f) not in (None, "") for f in _required(direction, gateway))


def gateway_state(g: dict, direction: str, gateway: str) -> dict:
    """UI helper: full state of one gateway for a direction (both modes)."""
    enabled = _enabled_flag(g, gateway, direction)
    amode = active_mode(g, gateway, direction)
    return {
        "gateway": gateway,
        "enabled": enabled,
        "active_mode": amode,
        "test_configured": mode_configured(g, direction, gateway, "test"),
        "live_configured": mode_configured(g, direction, gateway, "live"),
    }
