"""Verify Fast2SMS DLT route uses the correct settings key (fast2sms_otp_template_id).

Regression test for the bug: sms_service was reading `fast2sms_message_id` while the
admin UI writes `fast2sms_otp_template_id`, so the DLT branch never triggered and the
outbound call fell back to the (blocked) `otp` route.

ALL Fast2SMS HTTP calls are mocked; no real network requests are made.
"""
import sys
import os
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services import sms_service  # noqa: E402


class _FakeResponse:
    def __init__(self, payload=None, status_code=200):
        self._payload = payload or {"return": True, "message": ["ok"]}
        self.status_code = status_code
        self.text = "ok"

    def json(self):
        return self._payload


class _FakeAsyncClient:
    """Mimics httpx.AsyncClient async context manager and records the last GET call."""
    last_params = None
    last_url = None

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, url, params=None):
        _FakeAsyncClient.last_url = url
        _FakeAsyncClient.last_params = params
        return _FakeResponse({"return": True, "message": ["Sent"]})


@pytest.fixture(autouse=True)
def reset_fake_client():
    _FakeAsyncClient.last_params = None
    _FakeAsyncClient.last_url = None
    yield


def _dlt_cfg():
    return {
        "sms_enabled": True,
        "fast2sms_api_key": "x",
        "fast2sms_route": "dlt",
        "fast2sms_sender_id": "AZOHOM",
        "fast2sms_otp_template_id": "220032",
        # deliberately absent: fast2sms_message_id
    }


def _otp_cfg():
    return {
        "sms_enabled": True,
        "fast2sms_api_key": "x",
        "fast2sms_route": "otp",
    }


# ---------------------------------------------------------------------------
# send_test — DLT branch
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_send_test_uses_dlt_with_template_id():
    with patch.object(sms_service, "_cfg", AsyncMock(return_value=_dlt_cfg())), \
         patch.object(sms_service.httpx, "AsyncClient", _FakeAsyncClient):
        result = await sms_service.send_test("9876543210")

    assert _FakeAsyncClient.last_params is not None, "HTTP call not made"
    p = _FakeAsyncClient.last_params
    assert p["route"] == "dlt", f"expected dlt route, got {p['route']}"
    assert p["sender_id"] == "AZOHOM"
    assert p["message"] == "220032", (
        f"DLT message should resolve from fast2sms_otp_template_id, got {p['message']!r}"
    )
    assert p["numbers"] == "9876543210"
    assert result["route"] == "dlt"
    assert result["ok"] is True


# ---------------------------------------------------------------------------
# send_otp_sms — DLT branch
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_send_otp_sms_uses_dlt_with_template_id():
    with patch.object(sms_service, "_cfg", AsyncMock(return_value=_dlt_cfg())), \
         patch.object(sms_service.httpx, "AsyncClient", _FakeAsyncClient):
        ok = await sms_service.send_otp_sms("+919876543210", "123456")

    p = _FakeAsyncClient.last_params
    assert p is not None
    assert p["route"] == "dlt"
    assert p["sender_id"] == "AZOHOM"
    assert p["message"] == "220032"
    assert p["variables_values"] == "123456"
    assert p["numbers"] == "9876543210"
    assert ok is True


# ---------------------------------------------------------------------------
# Negative: no template id + route=otp → fallback to otp route
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_send_test_fallback_otp_route():
    with patch.object(sms_service, "_cfg", AsyncMock(return_value=_otp_cfg())), \
         patch.object(sms_service.httpx, "AsyncClient", _FakeAsyncClient):
        result = await sms_service.send_test("9876543210")

    p = _FakeAsyncClient.last_params
    assert p["route"] == "otp"
    assert "sender_id" not in p
    assert "message" not in p  # otp route uses variables_values only
    assert p["variables_values"] == "123456"
    assert result["route"] == "otp"


# ---------------------------------------------------------------------------
# Key-mismatch bug regression: ONLY fast2sms_otp_template_id set (message_id absent)
# The DLT branch must still trigger and message must be 220032.
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_dlt_reads_otp_template_id_key_only():
    cfg = {
        "sms_enabled": True,
        "fast2sms_api_key": "x",
        "fast2sms_route": "dlt",
        "fast2sms_sender_id": "AZOHOM",
        "fast2sms_otp_template_id": "220032",
    }
    assert "fast2sms_message_id" not in cfg  # sanity

    with patch.object(sms_service, "_cfg", AsyncMock(return_value=cfg)), \
         patch.object(sms_service.httpx, "AsyncClient", _FakeAsyncClient):
        result = await sms_service.send_test("9876543210")

    p = _FakeAsyncClient.last_params
    assert p["route"] == "dlt", "bug regression: DLT branch not triggered from fast2sms_otp_template_id"
    assert p["message"] == "220032"
    assert result["route"] == "dlt"


# ---------------------------------------------------------------------------
# Backward-compat: legacy key fast2sms_message_id should still work
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_dlt_backward_compat_legacy_key():
    cfg = {
        "sms_enabled": True,
        "fast2sms_api_key": "x",
        "fast2sms_route": "dlt",
        "fast2sms_sender_id": "AZOHOM",
        "fast2sms_message_id": "999111",  # legacy key only
    }
    with patch.object(sms_service, "_cfg", AsyncMock(return_value=cfg)), \
         patch.object(sms_service.httpx, "AsyncClient", _FakeAsyncClient):
        result = await sms_service.send_test("9876543210")

    p = _FakeAsyncClient.last_params
    assert p["route"] == "dlt"
    assert p["message"] == "999111"
    assert result["route"] == "dlt"
