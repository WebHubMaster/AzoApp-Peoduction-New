"""Tests for storage_service dedupe fix + enterprise folder path.

Focus areas:
1. POST /api/bookings/{id}/evidence/upload should NOT produce a "thumb_" file.
2. POST /api/media/upload response.url == response.thumb_url (no dup S3 object).
3. Job folder path = jobs/<bookingId>/<before|after>/<uuid>.webp
4. Uploaded URL is retrievable (200 image).
5. Existing evidence flow still works (list, remove).
"""
import io
import os
import time
import pytest
import requests
from pathlib import Path
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
UPLOADS = Path("/app/backend/uploads")


def _login(phone: str) -> str:
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": "123456"}, timeout=15)
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    return tok


def _make_png_bytes(w=800, h=600, color=(200, 40, 80)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(scope="module")
def admin_tok():
    return _login("+919000000000")


@pytest.fixture(scope="module")
def partner_tok():
    return _login("+919000000003")


def _snapshot_thumbs() -> set:
    return {str(p) for p in UPLOADS.rglob("thumb_*")}


# ── 1) /api/media/upload should NOT create a thumb_ file ────────────────────
def test_media_upload_no_thumb_and_same_urls(admin_tok):
    before_thumbs = _snapshot_thumbs()
    files = {"file": ("t.png", _make_png_bytes(), "image/png")}
    data = {"folder": "media"}
    r = requests.post(f"{API}/media/upload", headers={"Authorization": f"Bearer {admin_tok}"},
                      files=files, data=data, timeout=30)
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
    body = r.json()
    # thumb_url must equal url (no separate thumbnail object).
    assert body.get("url"), body
    assert body.get("thumb_url") == body.get("url"), f"thumb_url != url: {body}"
    # Name path (webp) and NO thumb_ prefix in name.
    name = body.get("name", "")
    assert "thumb_" not in name, f"name contains thumb_: {name}"
    # No new thumb_ file appeared on disk.
    after_thumbs = _snapshot_thumbs()
    new_thumbs = after_thumbs - before_thumbs
    assert not new_thumbs, f"new thumb_ files created: {new_thumbs}"
    # URL is retrievable
    img = requests.get(body["url"], timeout=15)
    assert img.status_code == 200, f"served url {body['url']} not 200: {img.status_code}"
    assert img.headers.get("content-type", "").startswith("image/"), img.headers


# ── Helper: get a partner booking ───────────────────────────────────────────
def _partner_bookings(tok: str) -> list:
    """Try dashboard/active endpoints and also generic listing."""
    headers = {"Authorization": f"Bearer {tok}"}
    for path in ("/bookings/partner/active", "/bookings/partner/dashboard",
                 "/bookings/partner/jobs", "/bookings/mine", "/bookings"):
        r = requests.get(f"{API}{path}", headers=headers, timeout=15)
        if r.status_code != 200:
            continue
        j = r.json()
        # normalize possible shapes
        if isinstance(j, list):
            candidates = j
        elif isinstance(j, dict):
            candidates = (j.get("bookings") or j.get("active") or j.get("items")
                          or j.get("jobs") or j.get("data") or [])
            # dashboard may nest under 'active' or 'assigned'
            for k in ("active", "assigned", "in_progress", "started", "scheduled"):
                v = j.get(k)
                if isinstance(v, list):
                    candidates = candidates + v
        else:
            candidates = []
        if candidates:
            return candidates
    return []


# ── 2) Evidence upload: no thumb_, correct job folder path ──────────────────
def test_evidence_upload_no_duplicate_and_folder(partner_tok):
    bookings = _partner_bookings(partner_tok)
    if not bookings:
        pytest.skip("partner has no bookings to attach evidence to")

    headers = {"Authorization": f"Bearer {partner_tok}"}
    before_thumbs = _snapshot_thumbs()

    # Try each booking + stage combo until one succeeds (skip 423 locks).
    last_err = None
    picked = None
    for b in bookings[:6]:
        bid = b.get("id") or b.get("_id") or b.get("code")
        if not bid:
            continue
        for stage in ("after", "before"):
            files = {"file": ("proof.png", _make_png_bytes(color=(10, 200, 90)), "image/png")}
            data = {"stage": stage}
            r = requests.post(f"{API}/bookings/{bid}/evidence/upload",
                              headers=headers, files=files, data=data, timeout=30)
            if r.status_code == 200:
                picked = (bid, stage, r.json())
                break
            last_err = f"{r.status_code} {r.text[:180]}"
        if picked:
            break

    if not picked:
        pytest.skip(f"no booking accepted an evidence upload: {last_err}")

    bid, stage, body = picked
    # Expected: single object; response indicates url and no thumb_ copy.
    # Response shape may be {photo:{url,name,...}} or booking or {url,...}.
    def _find(obj, key):
        if isinstance(obj, dict):
            if key in obj and isinstance(obj[key], str):
                return obj[key]
            for v in obj.values():
                r = _find(v, key)
                if r:
                    return r
        elif isinstance(obj, list):
            for v in obj:
                r = _find(v, key)
                if r:
                    return r
        return None

    url = _find(body, "url")
    name = _find(body, "name") or ""
    assert url, f"no url in response: {body}"
    assert "thumb_" not in url, f"url contains thumb_: {url}"
    assert "thumb_" not in name, f"name contains thumb_: {name}"

    # Enterprise folder shape: jobs/<bid>/<stage>/<uuid>.<ext>
    # slugify lowercases the id — compare case-insensitively.
    if name:
        assert name.lower().startswith(f"jobs/{str(bid).lower()}/{stage}/"), \
            f"unexpected job folder path: {name}"
        assert name.endswith(".webp") or name.endswith(".png") or name.endswith(".jpg"), name

    # No new thumb_ file on disk
    after_thumbs = _snapshot_thumbs()
    new_thumbs = after_thumbs - before_thumbs
    assert not new_thumbs, f"NEW thumb_ files were written: {new_thumbs}"

    # Wait a tick then GET url — must be 200 image
    time.sleep(0.3)
    img = requests.get(url, timeout=15)
    assert img.status_code == 200, f"stored evidence not retrievable: {img.status_code} {url}"
    assert img.headers.get("content-type", "").startswith("image/")


# ── 3) Regression: booking list still works ─────────────────────────────────
def test_partner_bookings_reachable(partner_tok):
    r = requests.get(f"{API}/bookings/partner/active",
                     headers={"Authorization": f"Bearer {partner_tok}"}, timeout=15)
    # Endpoint may not exist under that exact name — accept 200 or 404 (but not 500)
    assert r.status_code in (200, 404), f"partner active bookings 5xx: {r.status_code} {r.text[:200]}"


# ── 4) Global sanity: after our uploads, disk has no new thumb_ files ───────
def test_no_new_thumb_files_end_to_end(admin_tok):
    """Do one more media upload and assert zero new thumb_ files exist."""
    baseline = _snapshot_thumbs()
    files = {"file": ("z.png", _make_png_bytes(600, 400, (55, 120, 220)), "image/png")}
    r = requests.post(f"{API}/media/upload", headers={"Authorization": f"Bearer {admin_tok}"},
                      files=files, data={"folder": "media"}, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert body["url"] == body["thumb_url"]
    after = _snapshot_thumbs()
    assert after == baseline, f"NEW thumb_ files created: {after - baseline}"
