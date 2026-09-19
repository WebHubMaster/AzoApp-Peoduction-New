"""Iteration 6: Dispatch Timeline Map, Test Ring (partner + admin), SSE test-ring delivery, regressions."""
import json
import threading
import time

import pytest
import requests

from conftest import API, PHONES, login  # noqa: F401

RAJ_ID = "be15604b-efdb-4610-8b8c-4b38354494f7"


# ---------------------------- helpers ----------------------------
@pytest.fixture(scope="module")
def booking_with_dispatch(admin):
    r = admin.get(f"{API}/admin/dispatch-feed?limit=1", timeout=30)
    assert r.status_code == 200, r.text
    rows = r.json().get("rows") or []
    if not rows:
        pytest.skip("no dispatch rows in feed")
    return rows[0].get("booking_id")


# ---------------------------- GET /api/admin/bookings/{id}/dispatch-timeline ----------------------------
class TestDispatchTimeline:
    def test_timeline_shape(self, admin, booking_with_dispatch):
        r = admin.get(f"{API}/admin/bookings/{booking_with_dispatch}/dispatch-timeline", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("booking", "summary", "lanes", "waiting", "events"):
            assert k in d, f"missing {k}"
        b = d["booking"]
        assert b["id"] == booking_with_dispatch
        for k in ("code", "status", "service_name", "partner_id", "partner_name"):
            assert k in b
        s = d["summary"]
        for k in ("eligible", "rung", "seen", "accepted", "rejected", "timeout", "pending",
                  "waves", "exhausted", "nearby_expanded"):
            assert k in s, f"summary missing {k}"
        assert isinstance(d["lanes"], list) and len(d["lanes"]) >= 1, "expected >=1 lane"
        lane = d["lanes"][0]
        for k in ("dispatch_id", "partner_id", "partner_name", "source", "rung_at", "seen_at",
                  "response", "response_at", "response_ms", "push", "stage", "eta_min",
                  "distance_km", "nearby"):
            assert k in lane, f"lane missing {k}"
        assert s["rung"] == len(d["lanes"])
        assert isinstance(d["events"], list) and d["events"]
        ats = [e["at"] for e in d["events"]]
        assert ats == sorted(ats), "events not sorted ascending"
        for e in d["events"]:
            assert "type" in e
        assert '"_id"' not in json.dumps(d)

    def test_timeline_bogus_id_404(self, admin):
        r = admin.get(f"{API}/admin/bookings/does-not-exist-xyz/dispatch-timeline", timeout=30)
        assert r.status_code == 404, f"{r.status_code} {r.text[:300]}"

    def test_timeline_requires_admin(self, partner, anon, booking_with_dispatch):
        r = partner.get(f"{API}/admin/bookings/{booking_with_dispatch}/dispatch-timeline", timeout=30)
        assert r.status_code in (401, 403), f"partner got {r.status_code}"
        r2 = anon.get(f"{API}/admin/bookings/{booking_with_dispatch}/dispatch-timeline", timeout=30)
        assert r2.status_code in (401, 403), f"anon got {r2.status_code}"


def _assert_ring_shape(d, expect_partner_id=None):
    assert d.get("ok") is True, d
    assert isinstance(d.get("test_id"), str) and d["test_id"].startswith("test-"), d.get("test_id")
    p = d.get("partner") or {}
    for k in ("id", "name", "partner_status"):
        assert k in p, f"partner missing {k}"
    if expect_partner_id:
        assert p["id"] == expect_partner_id
    assert d.get("sse") is True
    assert isinstance(d.get("push"), dict), d.get("push")


# ---------------------------- POST /api/partner/test-ring ----------------------------
class TestPartnerTestRing:
    def test_partner_test_ring(self, partner):
        r = partner.post(f"{API}/partner/test-ring", json={}, timeout=40)
        assert r.status_code == 200, r.text
        d = r.json()
        _assert_ring_shape(d, RAJ_ID)
        push = d["push"]
        assert push.get("skipped") == "no_devices" or push.get("success", 0) >= 0, push

    def test_customer_forbidden(self, customer):
        r = customer.post(f"{API}/partner/test-ring", json={}, timeout=30)
        assert r.status_code == 403, f"{r.status_code} {r.text[:300]}"


# ---------------------------- POST /api/admin/partners/{pid}/test-ring ----------------------------
class TestAdminTestRing:
    def test_admin_test_ring(self, admin):
        r = admin.post(f"{API}/admin/partners/{RAJ_ID}/test-ring", json={}, timeout=40)
        assert r.status_code == 200, r.text
        d = r.json()
        _assert_ring_shape(d, RAJ_ID)
        assert d["partner"]["name"]

    def test_unknown_partner_404(self, admin):
        r = admin.post(f"{API}/admin/partners/nope-123/test-ring", json={}, timeout=30)
        assert r.status_code == 404, f"{r.status_code} {r.text[:300]}"

    def test_partner_token_forbidden(self, partner):
        r = partner.post(f"{API}/admin/partners/{RAJ_ID}/test-ring", json={}, timeout=30)
        assert r.status_code in (401, 403), f"{r.status_code} {r.text[:300]}"


# ---------------------------- SSE delivery ----------------------------
class TestSSEDelivery:
    def test_test_ring_arrives_on_stream(self, partner):
        token = partner.headers["Authorization"].split(" ", 1)[1]
        received = []

        def reader():
            try:
                with requests.get(f"{API}/realtime/stream?token={token}", stream=True, timeout=20) as resp:
                    assert resp.status_code == 200
                    assert "text/event-stream" in resp.headers.get("content-type", "")
                    cur = {}
                    for raw in resp.iter_lines(decode_unicode=True):
                        if raw is None:
                            continue
                        line = raw.strip()
                        if line.startswith("event:"):
                            cur["event"] = line.split(":", 1)[1].strip()
                        elif line.startswith("data:"):
                            cur["data"] = line.split(":", 1)[1].strip()
                        elif line == "":
                            if cur.get("data"):
                                received.append(dict(cur))
                            cur = {}
                            if len(received) > 30:
                                return
                        if any(r for r in received if '"is_test"' in (r.get("data") or "")):
                            return
            except Exception as e:  # noqa: BLE001
                received.append({"error": str(e)})

        t = threading.Thread(target=reader, daemon=True)
        t.start()
        time.sleep(3)  # let stream connect
        r = partner.post(f"{API}/partner/test-ring", json={}, timeout=40)
        assert r.status_code == 200, r.text
        test_id = r.json()["test_id"]
        deadline = time.time() + 8
        found = None
        while time.time() < deadline and not found:
            for msg in list(received):
                raw = msg.get("data") or ""
                try:
                    payload = json.loads(raw)
                except Exception:  # noqa: BLE001
                    continue
                typ = payload.get("type") or msg.get("event")
                data = payload.get("data", payload)
                if typ == "job_request" and isinstance(data, dict) and data.get("id") == test_id:
                    found = data
                    break
            if not found:
                time.sleep(0.5)
        assert found, f"no job_request for {test_id}; got {received[:5]}"
        assert found.get("is_test") is True, found
        assert found.get("service_name") == "Test job ring", found


# ---------------------------- regressions ----------------------------
class TestRegressions:
    def test_notifications_health(self, admin):
        r = admin.get(f"{API}/admin/notifications/health", timeout=40)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "web_api_key" in d, d

    def test_dispatch_feed(self, admin):
        r = admin.get(f"{API}/admin/dispatch-feed", timeout=30)
        assert r.status_code == 200, r.text
        assert "rows" in r.json()

    def test_partner_alert_prefs(self, partner):
        r = partner.get(f"{API}/partner/alert-prefs", timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), dict)

    def test_booking_without_dispatch(self, admin):
        """A timeline for a booking with no dispatch rows must still be 200 with empty lanes."""
        r = admin.get(f"{API}/admin/bookings?limit=50", timeout=30)
        if r.status_code != 200:
            pytest.skip("cannot list bookings")
        body = r.json()
        items = body if isinstance(body, list) else (
            body.get("bookings") or body.get("rows") or body.get("items") or [])
        for b in items:
            t = admin.get(f"{API}/admin/bookings/{b['id']}/dispatch-timeline", timeout=30)
            assert t.status_code == 200, t.text
            if not t.json()["lanes"]:
                assert t.json()["summary"]["rung"] == 0
                return
        pytest.skip("all sampled bookings have dispatch rows")
