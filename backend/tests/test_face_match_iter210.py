"""Iter210: Selfie Face Match tests - API + privacy + unit."""
import io
import os
import time
import asyncio
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://full-width-booking.preview.emergentagent.com").rstrip("/")
if "preview.emergentagent.com" not in BASE_URL:
    BASE_URL = "https://full-width-booking.preview.emergentagent.com"

ADMIN_PH = "+919000000000"
PARTNER_PH = "+919000000003"
CUSTOMER_PH = "+919000000004"
OTP = "123456"


def login(phone):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, r.text
    r = s.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s, r.json()


@pytest.fixture(scope="module")
def admin():
    return login(ADMIN_PH)


@pytest.fixture(scope="module")
def partner():
    return login(PARTNER_PH)


@pytest.fixture(scope="module")
def customer():
    return login(CUSTOMER_PH)


def _find_checkinnable_booking(partner_sess, admin_sess):
    """Find an assigned/arrived booking for the partner. Prefer AZOB98D25 if still assigned."""
    r = partner_sess.get(f"{BASE_URL}/api/bookings/partner/jobs", timeout=15)
    if r.status_code == 200:
        jobs = r.json() if isinstance(r.json(), list) else r.json().get("jobs") or r.json().get("items") or []
        for j in jobs:
            if j.get("status") in ("assigned", "arrived_shop", "arrived_customer"):
                return j
    # Fallback: admin bookings filtered by status
    for st in ("assigned", "arrived_shop", "arrived_customer"):
        r = admin_sess.get(f"{BASE_URL}/api/admin/bookings?status={st}", timeout=15)
        if r.status_code == 200:
            rows = r.json() if isinstance(r.json(), list) else r.json().get("items") or []
            if rows:
                return rows[0]
    return None


def _tiny_jpeg_bytes():
    # minimal valid JPEG (1x1 white)
    import base64
    data = base64.b64decode(
        "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q=="
    )
    return data


def test_01_admin_face_match_endpoint_requires_checkin(admin, partner):
    admin_sess, _ = admin
    partner_sess, _ = partner
    # Find a booking without check-in: pick any booking id without checkin
    r = admin_sess.get(f"{BASE_URL}/api/admin/bookings", timeout=15)
    assert r.status_code == 200
    rows = r.json() if isinstance(r.json(), list) else r.json().get("items") or []
    target = None
    for b in rows:
        if not (b.get("checkin") or {}).get("selfie_url"):
            target = b
            break
    if not target:
        pytest.skip("No booking without checkin")
    r = admin_sess.post(f"{BASE_URL}/api/admin/bookings/{target['id']}/face-match", timeout=15)
    assert r.status_code == 400, r.text


def test_02_admin_face_match_non_admin_forbidden(customer, admin):
    customer_sess, _ = customer
    admin_sess, _ = admin
    r = admin_sess.get(f"{BASE_URL}/api/admin/bookings", timeout=15)
    rows = r.json() if isinstance(r.json(), list) else r.json().get("items") or []
    if not rows:
        pytest.skip("no bookings")
    bid = rows[0]["id"]
    r = customer_sess.post(f"{BASE_URL}/api/admin/bookings/{bid}/face-match", timeout=15)
    assert r.status_code in (401, 403), r.status_code


def test_03_partner_checkin_fast_and_face_match_unverified(partner, admin):
    partner_sess, _ = partner
    admin_sess, _ = admin
    booking = _find_checkinnable_booking(partner_sess, admin_sess)
    if not booking:
        pytest.skip("No assigned booking for partner to check in")
    bid = booking["id"]
    jpg = _tiny_jpeg_bytes()
    files = {"file": ("selfie.jpg", io.BytesIO(jpg), "image/jpeg")}
    data = {"lat": "12.97", "lng": "77.59"}
    t0 = time.time()
    r = partner_sess.post(f"{BASE_URL}/api/bookings/{bid}/checkin/upload", files=files, data=data, timeout=30)
    elapsed = time.time() - t0
    assert r.status_code == 200, r.text
    assert elapsed < 15, f"checkin too slow: {elapsed}s"
    # Wait briefly for background task
    time.sleep(4)
    r = admin_sess.get(f"{BASE_URL}/api/admin/bookings/{bid}/detail", timeout=15)
    assert r.status_code == 200
    detail = r.json()
    b = detail.get("booking") or detail
    checkin = b.get("checkin") or {}
    assert "selfie_url" in checkin, f"no selfie in checkin: {checkin}"
    fm = checkin.get("face_match")
    # With no OCR api key configured, status must be unverified with reason mentioning Integration Center
    assert fm is not None, "face_match block missing after background run"
    assert fm.get("status") == "unverified", fm
    assert "Integration Center" in (fm.get("reason") or ""), fm
    # store for later tests
    pytest.booking_id = bid


def test_04_privacy_customer_bookings_no_face_match(customer):
    cust_sess, _ = customer
    r = cust_sess.get(f"{BASE_URL}/api/bookings", timeout=15)
    assert r.status_code == 200
    rows = r.json() if isinstance(r.json(), list) else r.json().get("items") or []
    for b in rows:
        assert "face_mismatch" not in b, b
        assert "face_match" not in (b.get("checkin") or {}), b
    if rows:
        bid = rows[0]["id"]
        r = cust_sess.get(f"{BASE_URL}/api/bookings/{bid}", timeout=15)
        assert r.status_code == 200
        b = r.json()
        assert "face_mismatch" not in b
        assert "face_match" not in (b.get("checkin") or {})


def test_05_privacy_partner_jobs_no_face_match(partner):
    partner_sess, _ = partner
    r = partner_sess.get(f"{BASE_URL}/api/bookings/partner/jobs", timeout=15)
    if r.status_code != 200:
        pytest.skip("partner jobs not reachable")
    rows = r.json() if isinstance(r.json(), list) else r.json().get("items") or r.json().get("jobs") or []
    for b in rows:
        assert "face_mismatch" not in b, b
        assert "face_match" not in (b.get("checkin") or {}), b


def test_06_admin_detail_includes_face_match(admin):
    admin_sess, _ = admin
    bid = getattr(pytest, "booking_id", None)
    if not bid:
        pytest.skip("no checked-in booking from test_03")
    r = admin_sess.get(f"{BASE_URL}/api/admin/bookings/{bid}/detail", timeout=15)
    assert r.status_code == 200
    detail = r.json()
    b = detail.get("booking") or detail
    assert "face_mismatch" in b
    assert "face_match" in (b.get("checkin") or {})


def test_07_admin_rerun_face_match(admin):
    admin_sess, _ = admin
    bid = getattr(pytest, "booking_id", None)
    if not bid:
        pytest.skip("no checked-in booking")
    r = admin_sess.post(f"{BASE_URL}/api/admin/bookings/{bid}/face-match", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("status") in ("match", "mismatch", "unverified")
    assert data.get("status") == "unverified"  # no key configured


# --------- Unit tests for face_match_service ---------
def test_08_unit_parse_and_compare():
    import sys
    sys.path.insert(0, "/app/backend")
    from services import face_match_service as fms

    # _parse
    assert fms._parse('garbage {"same_person": true, "confidence": 90} tail').get("same_person") is True
    assert fms._parse("no json here") == {}

    async def go():
        # Monkeypatch _ocr_config -> enabled with fake key
        async def fake_cfg():
            return {"enabled": True, "api_key": "sk-test", "model": "gpt-4o-mini", "provider": "openai"}
        fms._ocr_config = fake_cfg  # type: ignore

        # Monkeypatch _load_bytes
        async def fake_bytes(url):
            return (b"\xff\xd8\xff\xd9", "image/jpeg")
        fms._load_bytes = fake_bytes  # type: ignore

        class _M:
            def __init__(self, content):
                self.choices = [type("c", (), {"message": type("m", (), {"content": content})})]

        async def resp_match(**kw):
            return _M('{"same_person": true, "confidence": 92, "face_found": true, "reason": "ok"}')

        async def resp_mismatch(**kw):
            return _M('{"same_person": false, "confidence": 88, "face_found": true, "reason": "diff"}')

        async def resp_low(**kw):
            return _M('{"same_person": false, "confidence": 10, "face_found": true, "reason": "unclear"}')

        async def resp_noface(**kw):
            return _M('{"same_person": false, "confidence": 0, "face_found": false, "reason": "no face"}')

        import litellm
        litellm.acompletion = resp_match
        r = await fms.compare_faces("http://k", "http://s")
        assert r["status"] == "match", r

        litellm.acompletion = resp_mismatch
        r = await fms.compare_faces("http://k", "http://s")
        assert r["status"] == "mismatch" and r["confidence"] == 88, r

        litellm.acompletion = resp_low
        r = await fms.compare_faces("http://k", "http://s")
        assert r["status"] == "unverified", r

        litellm.acompletion = resp_noface
        r = await fms.compare_faces("http://k", "http://s")
        assert r["status"] == "mismatch", r

    asyncio.run(go())


def test_09_run_checkin_mismatch_notifies_admins(admin, partner):
    """Monkeypatch compare_faces -> mismatch, run run_checkin_face_match, verify side effects."""
    import sys
    sys.path.insert(0, "/app/backend")
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    bid = getattr(pytest, "booking_id", None)
    if not bid:
        pytest.skip("no checked-in booking")

    async def go():
        from services import face_match_service as fms
        from config.database import db

        async def fake_cmp(kyc, selfie):
            return {"status": "mismatch", "confidence": 88, "reason": "Different person", "provider": "openai"}
        fms.compare_faces = fake_cmp  # type: ignore

        b = await db.bookings.find_one({"id": bid}, {"_id": 0})
        selfie = (b.get("checkin") or {}).get("selfie_url")
        partner_doc = await db.users.find_one({"id": b["partner_id"]}, {"_id": 0, "id": 1, "name": 1})
        before_count = (await db.users.find_one({"id": partner_doc["id"]}, {"_id": 0, "face_mismatch_count": 1}) or {}).get("face_mismatch_count", 0) or 0
        before_notif = await db.notifications.count_documents({"data.type": "face_mismatch", "data.booking_id": bid})

        res = await fms.run_checkin_face_match(bid, partner_doc, selfie)
        assert res["status"] == "mismatch", res

        b2 = await db.bookings.find_one({"id": bid}, {"_id": 0})
        assert b2.get("face_mismatch") is True
        after_count = (await db.users.find_one({"id": partner_doc["id"]}, {"_id": 0, "face_mismatch_count": 1}) or {}).get("face_mismatch_count", 0) or 0
        assert after_count == before_count + 1

        after_notif = await db.notifications.count_documents({"data.type": "face_mismatch", "data.booking_id": bid})
        admin_count = await db.users.count_documents({"role": "admin"})
        assert after_notif >= before_notif + max(1, admin_count), f"notif before={before_notif} after={after_notif} admins={admin_count}"

        # Verify notification doc shape
        n = await db.notifications.find_one({"data.type": "face_mismatch", "data.booking_id": bid}, {"_id": 0}, sort=[("created_at", -1)])
        assert n is not None
        assert "Face mismatch" in (n.get("title") or "")
        assert f"booking={bid}" in (n.get("link") or "")

        # Now test match path (resets face_mismatch)
        async def fake_match(kyc, selfie):
            return {"status": "match", "confidence": 95, "reason": "same", "provider": "openai"}
        fms.compare_faces = fake_match
        r2 = await fms.run_checkin_face_match(bid, partner_doc, selfie)
        assert r2["status"] == "match"
        b3 = await db.bookings.find_one({"id": bid}, {"_id": 0})
        assert b3.get("face_mismatch") is False

    asyncio.run(go())
