"""Tests for push diagnostics (web API key probe, registration attempts,
partners-without-device), device registration, admin alert_config -> partner
alert-prefs, and audio upload. Iteration 5."""
import io
import os
import struct

import pytest
import requests
from conftest import API, PHONES, client, login

TEST_TOKEN = "test-token-xyz"


@pytest.fixture(scope="module")
def partner_kundan():
    return client(login("+918252754050"))


def _wav_bytes(seconds=0.05, rate=8000):
    n = int(rate * seconds)
    data = b"\x00\x00" * n
    hdr = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack(
        "<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16) + b"data" + struct.pack("<I", len(data))
    return hdr + data


# ---------------- notification health ----------------
class TestNotificationHealth:
    def test_health_shape(self, admin):
        r = admin.get(f"{API}/admin/notifications/health", timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "web_api_key" in d, d.keys()
        wak = d["web_api_key"]
        assert isinstance(wak, dict)
        assert "ok" in wak and isinstance(wak.get("checks"), list)
        apis = {c.get("api"): c for c in wak["checks"]}
        assert "Firebase Installations API" in apis, apis
        assert "FCM Registration API" in apis, apis
        assert isinstance(d.get("registration_attempts"), list)
        assert isinstance(d.get("partners_without_device"), list)
        assert "ready_for_push" in d
        assert isinstance(d.get("reasons"), dict)
        print("web_api_key:", wak)
        print("ready_for_push:", d.get("ready_for_push"), "reasons:", d.get("reasons"))

    def test_health_expected_blocked_state(self, admin):
        """Current EXPECTED state per request: installations blocked, fcm reg allowed."""
        d = admin.get(f"{API}/admin/notifications/health", timeout=90).json()
        wak = d["web_api_key"]
        apis = {c.get("api"): c for c in wak["checks"]}
        inst = apis["Firebase Installations API"]
        fcmreg = apis["FCM Registration API"]
        assert inst.get("ok") is False, inst
        assert inst.get("status") == 403, inst
        assert inst.get("reason") == "API_KEY_SERVICE_BLOCKED", inst
        assert fcmreg.get("ok") is True, fcmreg
        assert wak.get("ok") is False
        assert d.get("ready_for_push") is False
        assert "web_api_key" in d["reasons"], d["reasons"]
        assert isinstance(d["reasons"]["web_api_key"], str)

    def test_partners_without_device_shape(self, admin):
        d = admin.get(f"{API}/admin/notifications/health", timeout=90).json()
        for p in d["partners_without_device"]:
            assert set(["id", "name", "phone", "push_state"]).issubset(p.keys()), p

    def test_health_requires_admin(self, partner_kundan):
        r = partner_kundan.get(f"{API}/admin/notifications/health", timeout=60)
        assert r.status_code in (401, 403), r.status_code


# ---------------- push-status reporting ----------------
class TestPushStatus:
    def test_report_status_and_appears_in_health(self, partner_kundan, admin):
        me = partner_kundan.get(f"{API}/auth/me", timeout=30)
        assert me.status_code == 200, me.text
        uid = me.json().get("id") or me.json().get("user", {}).get("id")
        assert uid

        r = partner_kundan.post(f"{API}/notifications/push-status", json={
            "ok": False, "reason": "token_failed",
            "error": "installations/request-failed",
            "permission": "granted", "user_agent": "QA-UA"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}, r.json()

        d = admin.get(f"{API}/admin/notifications/health", timeout=90).json()
        rows = [x for x in d["registration_attempts"] if x.get("user_id") == uid]
        assert rows, "no registration attempt row for partner"
        row = rows[0]
        assert row["reason"] == "token_failed", row
        assert row["error"] == "installations/request-failed", row
        assert row["permission"] == "granted"
        assert row.get("user") and row["user"].get("id") == uid, row.get("user")

        pw = [p for p in d["partners_without_device"] if p["id"] == uid]
        if pw:
            assert (pw[0]["push_state"] or {}).get("reason") == "token_failed", pw[0]

    def test_my_devices_empty(self, partner_kundan):
        r = partner_kundan.get(f"{API}/notifications/my-devices", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["count"] == 0 and d["devices"] == [], d

    def test_push_status_requires_auth(self, anon):
        r = anon.post(f"{API}/notifications/push-status", json={"ok": False}, timeout=30)
        assert r.status_code in (401, 403), r.status_code


# ---------------- device registration ----------------
class TestDeviceRegistration:
    def test_register_and_cleanup(self, partner_kundan, admin):
        before = admin.get(f"{API}/admin/notifications/health", timeout=90).json()["devices"]["total"]
        r = partner_kundan.post(f"{API}/notifications/devices",
                                json={"token": TEST_TOKEN, "user_agent": "QA-UA"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        md = partner_kundan.get(f"{API}/notifications/my-devices", timeout=30).json()
        assert md["count"] == 1, md
        assert all("token" not in dev for dev in md["devices"]), "token leaked in my-devices"

        after = admin.get(f"{API}/admin/notifications/health", timeout=90).json()["devices"]["total"]
        assert after == before + 1, (before, after)

        # cleanup happens in module teardown fixture

    def test_no_token_rejected(self, partner_kundan):
        r = partner_kundan.post(f"{API}/notifications/devices", json={"token": ""}, timeout=30)
        assert r.status_code == 200
        assert r.json() == {"ok": False, "error": "no_token"}


@pytest.fixture(scope="module", autouse=True)
def cleanup_devices():
    yield
    import asyncio
    import sys
    sys.path.insert(0, "/app/backend")
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import dotenv_values
    env = dotenv_values("/app/backend/.env")
    mongo = os.environ.get("MONGO_URL") or env.get("MONGO_URL")
    dbname = os.environ.get("DB_NAME") or env.get("DB_NAME")

    async def _clean():
        c = AsyncIOMotorClient(mongo)
        await c[dbname].fcm_devices.delete_many({"token": TEST_TOKEN})
        c.close()
    asyncio.run(_clean())


# ---------------- test-push ----------------
class TestAdminTestPush:
    def test_test_push_no_devices(self, admin):
        d = admin.get(f"{API}/admin/notifications/health", timeout=90).json()
        pw = d["partners_without_device"]
        if not pw:
            pytest.skip("no online partner without device")
        uid = pw[0]["id"]
        r = admin.post(f"{API}/admin/notifications/test-push", json={"user_id": uid}, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("push", {}).get("skipped") == "no_devices", body
        assert "push_state" in body, body


# ---------------- alert config ----------------
class TestAlertConfig:
    def test_admin_alert_config_flows_to_partner(self, admin, partner_kundan):
        payload = {"alert_config": {"tone": "chime", "volume": 0.8, "dnd_enabled": True,
                                    "dnd_start": "23:00", "dnd_end": "06:00",
                                    "custom_sound_url": "", "custom_sound_name": ""}}
        r = admin.put(f"{API}/admin/settings", json=payload, timeout=60)
        assert r.status_code == 200, r.text
        ac = r.json().get("alert_config")
        assert ac, r.json().keys()
        assert ac["tone"] == "chime" and float(ac["volume"]) == 0.8
        assert ac["dnd_enabled"] is True and ac["dnd_start"] == "23:00" and ac["dnd_end"] == "06:00"

        ic = admin.get(f"{API}/admin/partner-reg/integration-center", timeout=60)
        assert ic.status_code == 200, ic.text
        assert ic.json().get("alert_config", {}).get("tone") == "chime", ic.json().get("alert_config")

        pr = partner_kundan.get(f"{API}/partner/alert-prefs", timeout=30)
        assert pr.status_code == 200, pr.text
        p = pr.json()
        assert p["tone"] == "chime", p
        assert float(p["volume"]) == 0.8, p
        assert p["dndEnabled"] is True and p["dndStart"] == "23:00" and p["dndEnd"] == "06:00", p
        assert p["customSoundUrl"] == "", p
        assert isinstance(p["snoozeUntil"], (int, float)), p

    def test_partner_cannot_override_tone(self, partner_kundan):
        r = partner_kundan.put(f"{API}/partner/alert-prefs",
                               json={"tone": "beep", "snoozeUntil": 1}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["tone"] == "chime", d
        assert d["snoozeUntil"] == 1, d
        # verify persistence
        g = partner_kundan.get(f"{API}/partner/alert-prefs", timeout=30).json()
        assert g["snoozeUntil"] == 1 and g["tone"] == "chime", g

    def test_restore_defaults(self, admin, partner_kundan):
        partner_kundan.put(f"{API}/partner/alert-prefs", json={"snoozeUntil": 0}, timeout=30)
        r = admin.put(f"{API}/admin/settings", json={"alert_config": {
            "tone": "classic", "volume": 0.7, "dnd_enabled": False}}, timeout=60)
        assert r.status_code == 200, r.text
        ac = r.json()["alert_config"]
        assert ac["tone"] == "classic" and ac["dnd_enabled"] is False
        # nested merge must keep dnd_start/dnd_end keys from before
        assert "dnd_start" in ac, ac
        p = partner_kundan.get(f"{API}/partner/alert-prefs", timeout=30).json()
        assert p["tone"] == "classic" and p["snoozeUntil"] == 0, p


# ---------------- audio upload ----------------
class TestAudioUpload:
    uploaded = []

    def test_upload_wav(self, admin):
        files = {"file": ("qa_test.wav", _wav_bytes(), "audio/wav")}
        r = requests.post(f"{API}/media/upload-audio", files=files, data={"folder": "alerts"},
                          headers={"Authorization": admin.headers["Authorization"]}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["url"].startswith("/api/media/file/alerts/"), d
        assert d["name"].startswith("alerts/") and d["size"] > 0 and d["original"] == "qa_test.wav"
        base = API[:-4]
        g = requests.get(f"{base.rstrip('/')}{d['url']}", timeout=60)
        assert g.status_code == 200, g.status_code
        TestAudioUpload.uploaded.append(d["name"])

    def test_reject_non_audio(self, admin):
        png = b"\x89PNG\r\n\x1a\n" + b"0" * 50
        files = {"file": ("x.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{API}/media/upload-audio", files=files, data={"folder": "alerts"},
                          headers={"Authorization": admin.headers["Authorization"]}, timeout=60)
        assert r.status_code == 400, r.status_code
        assert "Unsupported audio" in r.text, r.text

    def test_requires_admin(self, partner_kundan):
        files = {"file": ("qa_test.wav", _wav_bytes(), "audio/wav")}
        r = requests.post(f"{API}/media/upload-audio", files=files, data={"folder": "alerts"},
                          headers={"Authorization": partner_kundan.headers["Authorization"]}, timeout=60)
        assert r.status_code in (401, 403), r.status_code


@pytest.fixture(scope="module", autouse=True)
def cleanup_audio(request):
    yield
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import dotenv_values
    from pathlib import Path
    env = dotenv_values("/app/backend/.env")
    mongo = os.environ.get("MONGO_URL") or env.get("MONGO_URL")
    dbname = os.environ.get("DB_NAME") or env.get("DB_NAME")

    async def _clean():
        c = AsyncIOMotorClient(mongo)
        for name in TestAudioUpload.uploaded:
            await c[dbname].media.delete_many({"name": name})
            try:
                (Path("/app/backend/uploads") / name).unlink(missing_ok=True)
            except Exception:
                pass
        c.close()
    asyncio.run(_clean())


# ---------------- regressions ----------------
class TestRegressions:
    def test_push_config_public(self, anon):
        r = anon.get(f"{API}/notifications/push-config", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "enabled" in d and "web_config" in d and "vapid_key" in d, d
        assert isinstance(d["web_config"], dict)

    def test_realtime_config(self, partner_kundan):
        r = partner_kundan.get(f"{API}/realtime/config", timeout=30)
        assert r.status_code == 200, r.text

    def test_ring_pending(self, partner_kundan):
        r = partner_kundan.get(f"{API}/bookings/partner/ring-pending", timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list), r.text[:200]

    def test_dispatch_feed(self, admin):
        r = admin.get(f"{API}/admin/dispatch-feed", timeout=60)
        assert r.status_code == 200, r.text
