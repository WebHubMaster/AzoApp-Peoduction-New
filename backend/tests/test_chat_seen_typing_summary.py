"""Backend tests for AzoApp chat: seen receipts, typing indicator, chats summary,
SSE realtime frames, and chat notification payload / push suppression.

Booking under test: 78f7a5f4-9784-4680-a7fe-17d5f94e9496 (code AZO4A0D87)
between partner +919000000003 and customer +919000000004.
"""
import os
import json
import time
import queue
import threading
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

PARTNER_PHONE = "+919000000003"
CUSTOMER_PHONE = "+919000000004"
BOOKING_ID = "78f7a5f4-9784-4680-a7fe-17d5f94e9496"
BOOKING_CODE = "AZO4A0D87"


def _login(phone: str) -> str:
    requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=30)
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": "123456"}, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def partner_token():
    return _login(PARTNER_PHONE)


@pytest.fixture(scope="module")
def customer_token():
    return _login(CUSTOMER_PHONE)


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ── /api/bookings/chats/summary ──────────────────────────────────────────────
class TestChatsSummary:
    def test_partner_summary_contains_booking(self, partner_token):
        r = requests.get(f"{API}/bookings/chats/summary", headers=_h(partner_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "chats" in d and "total_unread" in d, d
        row = next((c for c in d["chats"] if c.get("booking_id") == BOOKING_ID), None)
        assert row, f"booking not in partner summary. sample={d['chats'][:2]}"
        for k in ("code", "service_name", "unread", "counterpart_name", "enabled"):
            assert k in row, f"missing {k}: {row}"
        assert row["code"] == BOOKING_CODE

    def test_customer_summary_contains_booking(self, customer_token):
        r = requests.get(f"{API}/bookings/chats/summary", headers=_h(customer_token), timeout=15)
        assert r.status_code == 200, r.text
        row = next((c for c in r.json()["chats"] if c.get("booking_id") == BOOKING_ID), None)
        assert row, "booking not in customer summary"
        assert row["code"] == BOOKING_CODE


# ── unread increments, then seen resets ─────────────────────────────────────
class TestSeenFlow:
    def test_customer_send_then_partner_seen_flow(self, partner_token, customer_token):
        # Baseline: partner marks as seen so unread is 0
        requests.post(f"{API}/bookings/{BOOKING_ID}/messages/seen",
                      headers=_h(partner_token), timeout=15)

        # Customer sends message
        text = "TEST_seen_flow_" + os.urandom(3).hex()
        r = requests.post(f"{API}/bookings/{BOOKING_ID}/messages",
                          json={"text": text}, headers=_h(customer_token), timeout=15)
        assert r.status_code in (200, 201), r.text
        msg = r.json()
        assert msg.get("status") == "sent", f"expected status=sent, got: {msg}"
        assert msg.get("seen_at") in (None, ""), f"seen_at should be null: {msg}"
        msg_id = msg["id"]

        time.sleep(0.7)

        # Partner summary shows unread >= 1
        s = requests.get(f"{API}/bookings/chats/summary", headers=_h(partner_token), timeout=15).json()
        row = next(c for c in s["chats"] if c.get("booking_id") == BOOKING_ID)
        assert row["unread"] >= 1, f"expected unread>=1, got {row}"

        # Partner marks seen
        rs = requests.post(f"{API}/bookings/{BOOKING_ID}/messages/seen",
                           headers=_h(partner_token), timeout=15)
        assert rs.status_code == 200, rs.text
        j = rs.json()
        assert j.get("ok") is True
        assert "seen" in j and isinstance(j["seen"], int)

        # Customer GET messages – our message now has status=seen with seen_at set
        g = requests.get(f"{API}/bookings/{BOOKING_ID}/messages",
                         headers=_h(customer_token), timeout=15)
        assert g.status_code == 200
        gd = g.json()
        for k in ("unread", "counterpart_online", "service_name", "code"):
            assert k in gd, f"list response missing {k}: keys={list(gd.keys())}"
        assert gd["code"] == BOOKING_CODE
        mine = next((m for m in gd["messages"] if m["id"] == msg_id), None)
        assert mine, "sent message missing from list"
        assert mine.get("status") == "seen", f"expected seen: {mine}"
        assert mine.get("seen_at"), f"seen_at missing: {mine}"

        # Partner summary unread now 0
        s2 = requests.get(f"{API}/bookings/chats/summary", headers=_h(partner_token), timeout=15).json()
        row2 = next(c for c in s2["chats"] if c.get("booking_id") == BOOKING_ID)
        assert row2["unread"] == 0, f"expected unread=0 after seen, got {row2}"


# ── typing endpoint ─────────────────────────────────────────────────────────
class TestTyping:
    def test_typing_endpoint(self, customer_token):
        r = requests.post(f"{API}/bookings/{BOOKING_ID}/typing",
                          json={"typing": True}, headers=_h(customer_token), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True


# ── SSE realtime frames ─────────────────────────────────────────────────────
class TestSSEFrames:
    def _sse_listen(self, token, out_q, stop_evt, timeout=12):
        try:
            with requests.get(f"{API}/realtime/stream",
                              params={"token": token},
                              stream=True, timeout=timeout) as resp:
                if resp.status_code != 200:
                    out_q.put(("__http__", resp.status_code, resp.text[:300]))
                    return
                for raw in resp.iter_lines(decode_unicode=True):
                    if stop_evt.is_set():
                        return
                    if not raw:
                        continue
                    if raw.startswith("data:"):
                        payload = raw[5:].strip()
                        try:
                            obj = json.loads(payload)
                        except Exception:
                            continue
                        out_q.put(obj)
        except Exception as e:
            out_q.put(("__err__", str(e)))

    def test_typing_message_seen_frames(self, partner_token, customer_token):
        # Partner listens; customer performs typing→send→and then partner marks seen for booking_seen
        out_q: "queue.Queue" = queue.Queue()
        stop_evt = threading.Event()
        t = threading.Thread(target=self._sse_listen,
                             args=(partner_token, out_q, stop_evt, 15),
                             daemon=True)
        t.start()
        time.sleep(1.2)  # let stream connect

        # 1. typing
        requests.post(f"{API}/bookings/{BOOKING_ID}/typing",
                      json={"typing": True}, headers=_h(customer_token), timeout=10)
        # 2. send message
        text = "TEST_sse_" + os.urandom(3).hex()
        requests.post(f"{API}/bookings/{BOOKING_ID}/messages",
                      json={"text": text}, headers=_h(customer_token), timeout=10)
        # 3. partner marks seen (should broadcast booking_seen to customer;
        #    for partner's own listener seen may not fire — we mainly need typing+message).
        time.sleep(0.4)
        requests.post(f"{API}/bookings/{BOOKING_ID}/messages/seen",
                      headers=_h(partner_token), timeout=10)

        # Collect for a few seconds
        got = []
        deadline = time.time() + 8
        while time.time() < deadline:
            try:
                item = out_q.get(timeout=1)
                got.append(item)
            except queue.Empty:
                pass
        stop_evt.set()

        types = [g.get("type") if isinstance(g, dict) else g for g in got]
        print("SSE frames received (partner):", types[:20])

        assert any(isinstance(g, dict) and g.get("type") == "booking_typing" for g in got), \
            f"missing booking_typing. got={types}"

        msg_frame = next((g for g in got if isinstance(g, dict) and g.get("type") == "booking_message"), None)
        assert msg_frame, f"missing booking_message. got={types}"
        # payload usually nested under 'message' or flat
        payload = msg_frame.get("message") or msg_frame
        blob = json.dumps(msg_frame)
        assert "service_name" in blob and "code" in blob and "status" in blob, \
            f"booking_message missing fields: {msg_frame}"

    def test_customer_receives_booking_seen(self, partner_token, customer_token):
        out_q: "queue.Queue" = queue.Queue()
        stop_evt = threading.Event()
        t = threading.Thread(target=self._sse_listen,
                             args=(customer_token, out_q, stop_evt, 12),
                             daemon=True)
        t.start()
        time.sleep(1.2)

        # customer sends, partner seens
        requests.post(f"{API}/bookings/{BOOKING_ID}/messages",
                      json={"text": "TEST_sse_seen_" + os.urandom(3).hex()},
                      headers=_h(customer_token), timeout=10)
        time.sleep(0.5)
        requests.post(f"{API}/bookings/{BOOKING_ID}/messages/seen",
                      headers=_h(partner_token), timeout=10)

        got = []
        deadline = time.time() + 7
        while time.time() < deadline:
            try:
                got.append(out_q.get(timeout=1))
            except queue.Empty:
                pass
        stop_evt.set()
        types = [g.get("type") if isinstance(g, dict) else g for g in got]
        print("SSE frames received (customer):", types[:20])
        assert any(isinstance(g, dict) and g.get("type") == "booking_seen" for g in got), \
            f"missing booking_seen. got={types}"


# ── notification payload + push suppression ─────────────────────────────────
class TestChatNotificationPayload:
    def _fetch_notifs(self, tok):
        r = requests.get(f"{API}/notifications", headers=_h(tok), timeout=15)
        assert r.status_code == 200
        data = r.json()
        if isinstance(data, dict):
            data = data.get("items") or data.get("notifications") or data.get("data") or []
        return data

    def test_partner_notification_payload_shape(self, partner_token, customer_token):
        # Ensure partner is not "recently present" - wait > 25s window? Instead, we skip seen call
        # and simply wait long enough since previous seen call, or use a fresh window by
        # calling seen NOW so partner is present, then waiting >30s. That's slow; instead
        # rely on 'present within 25s' logic: we haven't touched seen for this test.
        time.sleep(1)
        unique = "TEST_notif_payload_" + os.urandom(3).hex()
        r = requests.post(f"{API}/bookings/{BOOKING_ID}/messages",
                          json={"text": unique}, headers=_h(customer_token), timeout=15)
        assert r.status_code in (200, 201), r.text
        time.sleep(1.5)
        notifs = self._fetch_notifs(partner_token)
        # find our notification
        target = None
        for n in notifs[:40]:
            blob = json.dumps(n)
            if unique in blob:
                target = n
                break
        # if push was suppressed we won't find it - that's a separate test.
        assert target, f"no chat notification found containing {unique}. sample={notifs[:2]}"
        data = target.get("data") or {}
        title = target.get("title") or data.get("title") or ""
        body = target.get("body") or data.get("body") or ""
        link = target.get("link") or data.get("link") or ""
        ntype = data.get("type") or target.get("type") or target.get("event")
        assert title, f"missing title: {target}"
        assert "AC Gas Refill" in body and BOOKING_CODE in body, f"body missing fields: {body!r}"
        assert unique in body, f"body missing message text: {body!r}"
        assert f"chat={BOOKING_ID}" in link and "/partner" in link, f"link wrong: {link!r}"
        assert ntype == "chat_message", f"type wrong: {ntype!r} full={target}"

    def test_push_suppressed_when_recipient_present(self, partner_token, customer_token):
        # Partner marks seen → marks them as "present" for suppression window
        requests.post(f"{API}/bookings/{BOOKING_ID}/messages/seen",
                      headers=_h(partner_token), timeout=10)
        time.sleep(0.5)

        # Capture current partner notification count
        before = self._fetch_notifs(partner_token)
        before_ids = {n.get("id") for n in before[:60] if n.get("id")}

        # Also start SSE listener for partner to verify booking_message still comes through
        sse_frames = []
        stop_evt = threading.Event()
        def _listen():
            try:
                with requests.get(f"{API}/realtime/stream",
                                  params={"token": partner_token},
                                  stream=True, timeout=12) as resp:
                    for raw in resp.iter_lines(decode_unicode=True):
                        if stop_evt.is_set():
                            return
                        if raw and raw.startswith("data:"):
                            try:
                                sse_frames.append(json.loads(raw[5:].strip()))
                            except Exception:
                                pass
            except Exception:
                pass
        t = threading.Thread(target=_listen, daemon=True)
        t.start()
        time.sleep(1.2)

        unique = "TEST_suppress_" + os.urandom(3).hex()
        requests.post(f"{API}/bookings/{BOOKING_ID}/messages",
                      json={"text": unique}, headers=_h(customer_token), timeout=15)

        time.sleep(2.0)
        stop_evt.set()

        # SSE booking_message should still arrive
        assert any(
            isinstance(f, dict) and f.get("type") == "booking_message"
            and unique in json.dumps(f)
            for f in sse_frames
        ), f"SSE booking_message missing while push suppressed. frames={[x.get('type') for x in sse_frames if isinstance(x, dict)]}"

        # No new notification record containing our unique text
        after = self._fetch_notifs(partner_token)
        matches = [n for n in after[:60] if unique in json.dumps(n)]
        assert not matches, f"expected NO new notification (push suppressed), got: {matches[:2]}"
