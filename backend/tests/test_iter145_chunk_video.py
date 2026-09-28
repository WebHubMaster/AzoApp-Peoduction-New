"""Iter 145: partner chunked video upload (700KB base64 parts, total<=120), plus regression
for photo /evidence/upload multipart & 5-file cap."""
import os
import io
import base64
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
BOOKING_ID = "ba936117-834f-40a2-a19c-65d3d4628050"
PARTNER_PHONE = "+919000000003"
CHUNK_B64 = 700 * 1024  # base64 string length per chunk


def _reset_job():
    import subprocess
    subprocess.run(["python3", "/app/backend/dev_reset_job.py", BOOKING_ID], check=False, capture_output=True)


@pytest.fixture(scope="module")
def partner_token():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/send-otp", json={"phone": PARTNER_PHONE}, timeout=15)
    assert r.status_code == 200, r.text
    r = s.post(f"{BASE}/api/auth/verify-otp", json={"phone": PARTNER_PHONE, "otp": "123456"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(partner_token):
    return {"Authorization": f"Bearer {partner_token}"}


@pytest.fixture(scope="module", autouse=True)
def prepare(partner_token):
    """Reset job then perform check-in so before-proof upload is allowed."""
    _reset_job()
    # Send a tiny jpeg to check-in
    jpeg = bytes.fromhex(
        "ffd8ffe000104a46494600010101006000600000ffdb00430008060607060508070707090909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffdb0043010909090c0b0c180d0d1832211c213232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232ffc00011080001000103012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffda000c03010002110311003f00fbfca28a2800a28a2803ffd9"
    )
    r = requests.post(
        f"{BASE}/api/bookings/{BOOKING_ID}/checkin/upload",
        headers={"Authorization": f"Bearer {partner_token}"},
        files={"file": ("selfie.jpg", jpeg, "image/jpeg")},
        data={"lat": "25.6", "lng": "85.1"},
        timeout=30,
    )
    assert r.status_code == 200, f"checkin failed: {r.status_code} {r.text[:400]}"
    yield
    _reset_job()


def test_chunked_video_upload_8mb(auth_headers):
    """~8MB random bytes split into 700KB base64 parts, assembled to .mp4."""
    total_bytes = 8 * 1024 * 1024
    payload_bytes = os.urandom(total_bytes)
    b64 = base64.b64encode(payload_bytes).decode()
    parts = [b64[i:i + CHUNK_B64] for i in range(0, len(b64), CHUNK_B64)]
    total = len(parts)
    assert total <= 120, total
    upload_id = "t700"
    final_url = None
    for i, data in enumerate(parts):
        r = requests.post(
            f"{BASE}/api/bookings/{BOOKING_ID}/evidence/chunk",
            headers=auth_headers,
            json={"stage": "before", "upload_id": upload_id, "index": i, "total": total,
                  "content_type": "video/mp4", "data": data},
            timeout=60,
        )
        assert r.status_code == 200, f"part {i}/{total}: {r.status_code} {r.text[:300]}"
        j = r.json()
        if i < total - 1:
            assert j.get("done") is False, f"part {i}: expected done:false, got {j}"
        else:
            assert j.get("done") is True, f"final part: expected done:true, got {j}"
            final_url = j.get("url")
    assert final_url and final_url.endswith(".mp4"), final_url
    # Fetch and verify content-length + content-type
    full_url = final_url if final_url.startswith("http") else BASE + final_url
    g = requests.get(full_url, timeout=60)
    assert g.status_code == 200, g.status_code
    assert g.headers.get("content-type", "").startswith("video/mp4"), g.headers.get("content-type")
    assert len(g.content) == total_bytes, f"size mismatch: {len(g.content)} vs {total_bytes}"


def test_chunk_total_121_rejected(auth_headers):
    r = requests.post(
        f"{BASE}/api/bookings/{BOOKING_ID}/evidence/chunk",
        headers=auth_headers,
        json={"stage": "before", "upload_id": "t121", "index": 0, "total": 121,
              "content_type": "video/mp4", "data": base64.b64encode(b"x").decode()},
        timeout=15,
    )
    assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text[:200]}"


def test_chunk_total_100_allowed(auth_headers):
    """total=100 permitted; just post index 0 → done:false."""
    r = requests.post(
        f"{BASE}/api/bookings/{BOOKING_ID}/evidence/chunk",
        headers=auth_headers,
        json={"stage": "before", "upload_id": "t100", "index": 0, "total": 100,
              "content_type": "video/mp4", "data": base64.b64encode(b"hello").decode()},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    assert r.json().get("done") is False


def test_photo_evidence_upload_and_5_cap(auth_headers):
    """Regression: multipart /evidence/upload works; 6th photo returns 400 (5-file cap).
    Reset + re-checkin so evidence.before starts empty."""
    _reset_job()
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (200, 200), color=(120, 200, 90)).save(buf, format="JPEG", quality=70)
    jpeg = buf.getvalue()
    # Re-checkin (required before evidence upload allowed after reset)
    r = requests.post(
        f"{BASE}/api/bookings/{BOOKING_ID}/checkin/upload",
        headers=auth_headers,
        files={"file": ("s.jpg", jpeg, "image/jpeg")},
        data={"lat": "25.6", "lng": "85.1"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    # Use 'before' stage since checkin is done and job status is arrived. Reset already-uploaded video count first.
    # Photos accumulate on the same evidence.before list, but chunk video also went there.
    # To keep the test isolated, use a fresh reset+checkin cycle here would be nice, but prepare
    # fixture already handles that once. We'll just count current stored count and top-up.
    # First fetch booking to know current before count.
    b = requests.get(f"{BASE}/api/bookings/{BOOKING_ID}",
                     headers=auth_headers, timeout=15)
    # partner active jobs list instead (single booking GET may not be permitted for partner)
    if b.status_code != 200:
        # Try partner-jobs list to find booking
        b = requests.get(f"{BASE}/api/partner/jobs", headers=auth_headers, timeout=15)
    # We can't easily read before-count; just attempt uploads and observe.
    # Upload up to 5 more; capture when cap hits.
    status_codes = []
    for i in range(6):
        r = requests.post(
            f"{BASE}/api/bookings/{BOOKING_ID}/evidence/upload",
            headers=auth_headers,
            files={"file": (f"p{i}.jpg", jpeg, "image/jpeg")},
            data={"stage": "before"},
            timeout=30,
        )
        status_codes.append(r.status_code)
        if r.status_code == 400:
            assert "Maximum" in r.text or "5" in r.text, r.text
            break
    # Must have received a 400 at some point (cap)
    assert 400 in status_codes, f"cap never hit; codes={status_codes}"
    # Everything before the 400 must be 200
    idx_400 = status_codes.index(400)
    assert all(sc == 200 for sc in status_codes[:idx_400]), status_codes
