"""Iter 142 — Partner Job Wizard backend flow.

Covers:
 - Partner OTP login
 - active listing has the target booking
 - start-otp gated by before-photos AND checkin
 - checkin/upload (multipart) + partner_active/job returns checkin
 - chunked video upload (JSON base64) 3 parts, incl. invalid params
 - 5-file cap on before evidence + /evidence/remove
 - start-otp wrong / correct + complete
 - non-owner partner checkin 403
 - checkin after started -> 400
Fixture resets the booking to 'assigned' before each destructive step via dev_reset_job.
"""
import base64
import io
import os
import subprocess
import struct
import zlib

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
BOOKING_ID = "ba936117-834f-40a2-a19c-65d3d4628050"
BOOKING_CODE = "AZOAF1BBB"
PARTNER_PHONE = "+919000000003"
NON_OWNER_PHONE = "+919000000020"
DEMO_OTP_AUTH = "123456"
DEMO_START_OTP = "1234"
DEMO_COMPLETE_OTP = "1234"


def _reset():
    subprocess.run(
        ["python3", "dev_reset_job.py", BOOKING_ID],
        cwd="/app/backend", capture_output=True, timeout=30,
    )


def _login(phone):
    requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=15)
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp",
                      json={"phone": phone, "otp": DEMO_OTP_AUTH}, timeout=15)
    r.raise_for_status()
    return r.json()["token"]


@pytest.fixture(scope="module")
def partner_token():
    return _login(PARTNER_PHONE)


@pytest.fixture(scope="module")
def non_owner_token():
    return _login(NON_OWNER_PHONE)


@pytest.fixture
def hdr(partner_token):
    return {"Authorization": f"Bearer {partner_token}"}


def _tiny_jpeg():
    # Minimal valid JPEG (SOI + APP0 + SOF0 1x1 + SOS + EOI)
    return bytes.fromhex(
        "ffd8ffe000104a46494600010100000100010000"
        "ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c303134343420273a3d3832"
        "3c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffda0008010100003f00d2cf20ffd9"
    )


def _tiny_png():
    # Fallback tiny png for robustness (not used but handy)
    return bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
        "0000000d49444154789c626001000000050001a5f645400000000049454e44ae426082"
    )


class TestActiveList:
    def test_partner_active_list_has_booking(self, hdr):
        _reset()
        r = requests.get(f"{BASE_URL}/api/bookings/partner/active", headers=hdr, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        jobs = data.get("jobs", data) if isinstance(data, dict) else data
        ids = [j.get("id") for j in jobs] if isinstance(jobs, list) else []
        assert BOOKING_ID in ids, f"Booking {BOOKING_ID} not in active list"


class TestStartOtpGating:
    def test_start_otp_before_any_uploads_400(self, hdr):
        _reset()
        r = requests.post(f"{BASE_URL}/api/bookings/{BOOKING_ID}/start-otp",
                          json={"otp": DEMO_START_OTP}, headers=hdr, timeout=15)
        assert r.status_code == 400
        detail = (r.json().get("detail") or "").lower()
        assert "before" in detail or "selfie" in detail or "check-in" in detail

    def test_start_otp_after_photo_but_no_checkin_400_selfie(self, hdr):
        _reset()
        # upload one 'before' photo
        files = {"file": ("b.jpg", _tiny_jpeg(), "image/jpeg")}
        r = requests.post(f"{BASE_URL}/api/bookings/{BOOKING_ID}/evidence/upload",
                          data={"stage": "before"}, files=files, headers=hdr, timeout=20)
        assert r.status_code == 200, r.text
        r = requests.post(f"{BASE_URL}/api/bookings/{BOOKING_ID}/start-otp",
                          json={"otp": DEMO_START_OTP}, headers=hdr, timeout=15)
        assert r.status_code == 400, r.text
        assert "selfie check-in" in (r.json().get("detail") or "").lower()


class TestCheckin:
    def test_checkin_upload_ok(self, hdr):
        _reset()
        files = {"file": ("selfie.jpg", _tiny_jpeg(), "image/jpeg")}
        r = requests.post(f"{BASE_URL}/api/bookings/{BOOKING_ID}/checkin/upload",
                          data={"lat": 25.60, "lng": 85.12}, files=files,
                          headers=hdr, timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("status") == "arrived_customer"
        ck = j.get("checkin") or {}
        assert ck.get("selfie_url", "").startswith("http"), ck
        assert isinstance(ck.get("distance_km"), (int, float))
        assert isinstance(ck.get("far"), bool)
        assert ck.get("at")
        assert float(ck.get("lat")) == 25.60
        assert float(ck.get("lng")) == 85.12

    def test_partner_job_detail_returns_checkin(self, hdr):
        r = requests.get(f"{BASE_URL}/api/bookings/partner/job/{BOOKING_ID}",
                         headers=hdr, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("checkin", {}).get("selfie_url")

    def test_non_owner_checkin_403(self, hdr, non_owner_token):
        _reset()
        files = {"file": ("s.jpg", _tiny_jpeg(), "image/jpeg")}
        r = requests.post(f"{BASE_URL}/api/bookings/{BOOKING_ID}/checkin/upload",
                          data={"lat": 25.6, "lng": 85.12}, files=files,
                          headers={"Authorization": f"Bearer {non_owner_token}"}, timeout=15)
        assert r.status_code == 403


class TestChunkedVideo:
    def test_chunked_upload_3_parts(self, hdr):
        _reset()
        # Do a check-in first (needed to allow reaching later steps; but chunk works pre-start)
        # Build a fake ~3MB video payload split into 3 parts
        blob = os.urandom(600 * 1024) * 3  # ~1.8MB total
        third = len(blob) // 3
        parts = [blob[:third], blob[third:2 * third], blob[2 * third:]]
        upload_id = "iter142_t1"
        last_json = None
        for i, part in enumerate(parts):
            payload = {
                "stage": "before", "upload_id": upload_id, "index": i, "total": 3,
                "content_type": "video/mp4",
                "data": base64.b64encode(part).decode("ascii"),
            }
            r = requests.post(f"{BASE_URL}/api/bookings/{BOOKING_ID}/evidence/chunk",
                              json=payload, headers=hdr, timeout=30)
            assert r.status_code == 200, r.text
            j = r.json()
            if i < 2:
                assert j.get("done") is False
                assert j.get("received") == i + 1
            else:
                assert j.get("done") is True
                assert j.get("kind") == "video"
                assert (j.get("url") or "").endswith(".mp4"), j
                last_json = j
        assert last_json
        # GET the video url
        vr = requests.get(last_json["url"], timeout=30)
        assert vr.status_code == 200
        assert "video/mp4" in (vr.headers.get("content-type") or "")

    def test_chunk_invalid_params(self, hdr):
        payload = {"stage": "before", "upload_id": "bad", "index": 5, "total": 3,
                   "content_type": "video/mp4", "data": "AAAA"}
        r = requests.post(f"{BASE_URL}/api/bookings/{BOOKING_ID}/evidence/chunk",
                          json=payload, headers=hdr, timeout=15)
        assert r.status_code == 400


class TestFileCapAndRemove:
    def test_five_cap_and_remove(self, hdr):
        _reset()
        # Push 5 before photos
        for i in range(5):
            files = {"file": (f"p{i}.jpg", _tiny_jpeg(), "image/jpeg")}
            r = requests.post(f"{BASE_URL}/api/bookings/{BOOKING_ID}/evidence/upload",
                              data={"stage": "before"}, files=files, headers=hdr, timeout=20)
            assert r.status_code == 200, f"upload {i} failed: {r.text}"
        # 6th photo blocked
        files = {"file": ("p6.jpg", _tiny_jpeg(), "image/jpeg")}
        r = requests.post(f"{BASE_URL}/api/bookings/{BOOKING_ID}/evidence/upload",
                          data={"stage": "before"}, files=files, headers=hdr, timeout=20)
        assert r.status_code == 400
        assert "maximum 5" in (r.json().get("detail") or "").lower()

        # 6th chunk blocked too
        payload = {"stage": "before", "upload_id": "capvid", "index": 0, "total": 1,
                   "content_type": "video/mp4",
                   "data": base64.b64encode(os.urandom(200 * 1024)).decode("ascii")}
        r = requests.post(f"{BASE_URL}/api/bookings/{BOOKING_ID}/evidence/chunk",
                          json=payload, headers=hdr, timeout=20)
        assert r.status_code == 400
        assert "maximum 5" in (r.json().get("detail") or "").lower()

        # Get one existing url to remove
        det = requests.get(f"{BASE_URL}/api/bookings/partner/job/{BOOKING_ID}",
                           headers=hdr, timeout=15).json()
        urls = (det.get("evidence") or {}).get("before") or []
        assert len(urls) == 5
        target = urls[0]
        rr = requests.post(f"{BASE_URL}/api/bookings/{BOOKING_ID}/evidence/remove",
                           json={"stage": "before", "url": target}, headers=hdr, timeout=15)
        assert rr.status_code == 200
        det2 = requests.get(f"{BASE_URL}/api/bookings/partner/job/{BOOKING_ID}",
                            headers=hdr, timeout=15).json()
        assert len((det2.get("evidence") or {}).get("before") or []) == 4


class TestStartAndComplete:
    def test_start_wrong_otp_then_correct_then_complete(self, hdr):
        _reset()
        # upload before photo
        files = {"file": ("b.jpg", _tiny_jpeg(), "image/jpeg")}
        assert requests.post(f"{BASE_URL}/api/bookings/{BOOKING_ID}/evidence/upload",
                             data={"stage": "before"}, files=files, headers=hdr, timeout=20).status_code == 200
        # check in
        files = {"file": ("s.jpg", _tiny_jpeg(), "image/jpeg")}
        assert requests.post(f"{BASE_URL}/api/bookings/{BOOKING_ID}/checkin/upload",
                             data={"lat": 25.6, "lng": 85.12}, files=files,
                             headers=hdr, timeout=20).status_code == 200
        # wrong otp
        r = requests.post(f"{BASE_URL}/api/bookings/{BOOKING_ID}/start-otp",
                          json={"otp": "0000"}, headers=hdr, timeout=15)
        assert r.status_code == 400
        assert "invalid customer start otp" in (r.json().get("detail") or "").lower()
        # correct otp -> started
        r = requests.post(f"{BASE_URL}/api/bookings/{BOOKING_ID}/start-otp",
                          json={"otp": DEMO_START_OTP}, headers=hdr, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "started"
        # complete without after evidence -> 400
        r = requests.post(f"{BASE_URL}/api/bookings/{BOOKING_ID}/complete",
                          json={"otp": DEMO_COMPLETE_OTP}, headers=hdr, timeout=15)
        assert r.status_code == 400
        # upload after photo
        files = {"file": ("a.jpg", _tiny_jpeg(), "image/jpeg")}
        assert requests.post(f"{BASE_URL}/api/bookings/{BOOKING_ID}/evidence/upload",
                             data={"stage": "after"}, files=files, headers=hdr, timeout=20).status_code == 200
        # now complete
        r = requests.post(f"{BASE_URL}/api/bookings/{BOOKING_ID}/complete",
                          json={"otp": DEMO_COMPLETE_OTP}, headers=hdr, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "completed"

    def test_checkin_after_started_400(self, hdr):
        # booking is now completed. Reset -> assigned. Simulate started state by going through flow.
        _reset()
        files = {"file": ("b.jpg", _tiny_jpeg(), "image/jpeg")}
        requests.post(f"{BASE_URL}/api/bookings/{BOOKING_ID}/evidence/upload",
                      data={"stage": "before"}, files=files, headers=hdr, timeout=20)
        files = {"file": ("s.jpg", _tiny_jpeg(), "image/jpeg")}
        requests.post(f"{BASE_URL}/api/bookings/{BOOKING_ID}/checkin/upload",
                      data={"lat": 25.6, "lng": 85.12}, files=files, headers=hdr, timeout=20)
        r = requests.post(f"{BASE_URL}/api/bookings/{BOOKING_ID}/start-otp",
                         json={"otp": DEMO_START_OTP}, headers=hdr, timeout=15)
        assert r.status_code == 200
        # now try to check-in after job started
        files = {"file": ("s2.jpg", _tiny_jpeg(), "image/jpeg")}
        r = requests.post(f"{BASE_URL}/api/bookings/{BOOKING_ID}/checkin/upload",
                          data={"lat": 25.6, "lng": 85.12}, files=files, headers=hdr, timeout=20)
        assert r.status_code == 400
        assert "only allowed before" in (r.json().get("detail") or "").lower()


def teardown_module(module):
    """Leave booking in 'assigned' state for demo."""
    _reset()
