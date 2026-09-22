"""Iter96: FCM-independent job ring via SSE realtime broker.

Verifies the backend data chain for the locked/closed-phone ring fix:
- Partner OTP auth
- SSE /realtime/stream connects with ?token=, emits 'event: ready', keepalives
- POST /notifications/test-self kind=ring emits a job_request SSE event (immediate + delayed)
- Device register + ring-status stamp + admin diagnostics/health
"""
import json
import os
import time
import threading
import queue
import uuid

import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    # fall back to /app/frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

PARTNER_PHONE = "+919000000003"
ADMIN_PHONE = "+919000000000"
OTP = "123456"


def _auth(phone):
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, f"send-otp {phone}: {r.status_code} {r.text}"
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=15)
    assert r.status_code == 200, f"verify-otp {phone}: {r.status_code} {r.text}"
    j = r.json()
    tok = j.get("token") or j.get("access_token") or (j.get("data") or {}).get("token")
    assert tok, f"no token in response: {j}"
    return tok, j


@pytest.fixture(scope="module")
def partner_token():
    tok, _ = _auth(PARTNER_PHONE)
    return tok


@pytest.fixture(scope="module")
def admin_token():
    tok, _ = _auth(ADMIN_PHONE)
    return tok


class SSEClient:
    """Minimal SSE consumer running in a background thread."""

    def __init__(self, url):
        self.url = url
        self.q = queue.Queue()
        self.raw_lines = []
        self._stop = False
        self._resp = None
        self._t = threading.Thread(target=self._run, daemon=True)

    def start(self):
        self._t.start()
        # Wait for first frame (ready) up to 10s
        deadline = time.time() + 10
        while time.time() < deadline:
            if self.raw_lines:
                return
            time.sleep(0.1)

    def _run(self):
        try:
            self._resp = requests.get(self.url, stream=True, timeout=60,
                                       headers={"Accept": "text/event-stream"})
            event = None
            data_buf = []
            for raw in self._resp.iter_lines(decode_unicode=True):
                if self._stop:
                    break
                if raw is None:
                    continue
                self.raw_lines.append(raw)
                if raw == "":
                    if data_buf:
                        payload = "\n".join(data_buf)
                        try:
                            parsed = json.loads(payload)
                        except Exception:
                            parsed = payload
                        self.q.put({"event": event or "message", "data": parsed})
                    event = None
                    data_buf = []
                    continue
                if raw.startswith(":"):
                    # comment (keepalive)
                    self.q.put({"event": "comment", "data": raw})
                    continue
                if raw.startswith("event:"):
                    event = raw[6:].strip()
                elif raw.startswith("data:"):
                    data_buf.append(raw[5:].lstrip())
        except Exception as e:
            self.q.put({"event": "error", "data": str(e)})

    def wait_for(self, predicate, timeout=8):
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                ev = self.q.get(timeout=deadline - time.time())
            except queue.Empty:
                return None
            if predicate(ev):
                return ev
        return None

    def stop(self):
        self._stop = True
        try:
            if self._resp:
                self._resp.close()
        except Exception:
            pass


# ---------- Auth ----------
def test_partner_auth_returns_token(partner_token):
    assert isinstance(partner_token, str) and len(partner_token) > 10


# ---------- SSE stream basics ----------
def test_sse_stream_ready_and_keepalive(partner_token):
    url = f"{API}/realtime/stream?token={partner_token}"
    c = SSEClient(url)
    c.start()
    try:
        # First event should be 'ready'
        ev = c.wait_for(lambda e: e["event"] == "ready", timeout=10)
        assert ev is not None, f"no ready event; raw={c.raw_lines[:10]}"
        assert isinstance(ev["data"], dict) and ev["data"].get("ok") is True
        assert any(t.startswith("user:") for t in ev["data"].get("topics", []))
    finally:
        c.stop()


# ---------- Immediate FCM-independent ring test ----------
def test_test_self_ring_immediate_emits_sse_job_request(partner_token):
    url = f"{API}/realtime/stream?token={partner_token}"
    c = SSEClient(url)
    c.start()
    try:
        # Ensure ready first so the subscription is registered before we POST
        ready = c.wait_for(lambda e: e["event"] == "ready", timeout=10)
        assert ready, "SSE not ready"
        # small pause to be safe
        time.sleep(0.3)

        r = requests.post(f"{API}/notifications/test-self",
                          headers={"Authorization": f"Bearer {partner_token}"},
                          json={"kind": "ring", "delay": 0}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True, body
        assert (body.get("result") or {}).get("sse") is True, body

        ev = c.wait_for(lambda e: isinstance(e.get("data"), dict)
                        and e["data"].get("type") == "job_request", timeout=8)
        assert ev is not None, "no job_request SSE event received"
        d = ev["data"].get("data") or ev["data"]
        for k in ["booking_id", "service_name", "city", "total", "partner_amount"]:
            assert k in d, f"missing key {k} in {d}"
    finally:
        c.stop()


# ---------- Delayed ring test ----------
def test_test_self_ring_delayed_emits_sse_after_delay(partner_token):
    url = f"{API}/realtime/stream?token={partner_token}"
    c = SSEClient(url)
    c.start()
    try:
        ready = c.wait_for(lambda e: e["event"] == "ready", timeout=10)
        assert ready
        time.sleep(0.3)

        t0 = time.time()
        r = requests.post(f"{API}/notifications/test-self",
                          headers={"Authorization": f"Bearer {partner_token}"},
                          json={"kind": "ring", "delay": 3}, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True and body.get("scheduled") is True
        assert body.get("delay") == 3
        # Immediate response, no waiting server-side
        assert (time.time() - t0) < 2.5, "delayed endpoint blocked"

        ev = c.wait_for(lambda e: isinstance(e.get("data"), dict)
                        and e["data"].get("type") == "job_request", timeout=8)
        assert ev is not None, "delayed job_request not received"
        elapsed = time.time() - t0
        assert 2.0 <= elapsed <= 7.0, f"delay ~3s expected, got {elapsed:.2f}s"
    finally:
        c.stop()


# ---------- Device register + ring-status + admin health ----------
def test_ring_status_stamps_device_and_admin_health(partner_token, admin_token):
    device_id = f"TEST-dev-{uuid.uuid4().hex[:8]}"
    fake_token = f"TEST-fcm-{uuid.uuid4().hex}"

    r = requests.post(f"{API}/notifications/devices",
                      headers={"Authorization": f"Bearer {partner_token}"},
                      json={"token": fake_token, "device_id": device_id,
                            "platform": "android", "browser": "expo"}, timeout=15)
    assert r.status_code == 200, r.text

    booking_id = f"test-x-{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{API}/notifications/ring-status",
                      headers={"Authorization": f"Bearer {partner_token}"},
                      json={"ok": True, "ctx": "bg", "mode": "fgs", "fsi": True,
                            "booking_id": booking_id, "device_id": device_id}, timeout=15)
    assert r.status_code == 200, r.text

    # admin diagnostics
    r = requests.get(f"{API}/admin/notifications/health",
                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200, r.text
    h = r.json()
    for k in ["recent_ring_events", "recent_delivery_logs", "devices"]:
        assert k in h, f"missing {k} in health: {list(h.keys())}"
    assert isinstance(h["recent_ring_events"], list)
    assert isinstance(h["recent_delivery_logs"], list)
    assert isinstance(h["devices"], dict)

    # Confirm our ring event appears
    found = [e for e in h["recent_ring_events"]
             if (e.get("booking_id") == booking_id or e.get("device_id") == device_id)]
    assert found, f"our ring event not found in recent_ring_events (last {len(h['recent_ring_events'])})"
    ev0 = found[0]
    # user attached (some field like user_id / user / phone / user_name)
    assert any(ev0.get(k) for k in ("user_id", "user", "phone", "user_name", "user_phone")), \
        f"user not attached to ring event: {ev0}"


def test_admin_health_returns_keys(admin_token):
    r = requests.get(f"{API}/admin/notifications/health",
                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200
    h = r.json()
    assert "recent_ring_events" in h and isinstance(h["recent_ring_events"], list)
    assert "recent_delivery_logs" in h and isinstance(h["recent_delivery_logs"], list)
    assert "devices" in h and isinstance(h["devices"], dict)
