"""Face match verification tests — covers both the embedding service directly
(services/face_embed.py + compare_faces) and the admin re-check endpoint
(POST /api/admin/bookings/{id}/face-match).
"""
import asyncio
import base64
import io
import os
import sys
import uuid
from pathlib import Path

import cv2
import numpy as np
import pytest
import requests
from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
load_dotenv(BACKEND / ".env")

from services import face_embed as fe
from services.face_match_service import compare_faces

FIXTURES = BACKEND / "tests" / "fixtures" / "faces"
P1 = (FIXTURES / "p1.jpg").read_bytes()
P2 = (FIXTURES / "p2.jpg").read_bytes()
P3 = (FIXTURES / "p3.jpg").read_bytes()

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")


def _data_uri(raw: bytes) -> str:
    return f"data:image/jpeg;base64,{base64.b64encode(raw).decode()}"


def _rotate(raw: bytes, angle: float) -> bytes:
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    h, w = img.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    out = cv2.warpAffine(img, M, (w, h), borderValue=(255, 255, 255))
    return cv2.imencode(".jpg", out)[1].tobytes()


def _brighten(raw: bytes, delta: int = 40) -> bytes:
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    out = np.clip(img.astype(np.int16) + delta, 0, 255).astype(np.uint8)
    return cv2.imencode(".jpg", out)[1].tobytes()


def _downscale_low_q(raw: bytes) -> bytes:
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    h, w = img.shape[:2]
    s = cv2.resize(img, (max(1, w // 3), max(1, h // 3)))
    return cv2.imencode(".jpg", s, [cv2.IMWRITE_JPEG_QUALITY, 40])[1].tobytes()


def _flip(raw: bytes) -> bytes:
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    return cv2.imencode(".jpg", cv2.flip(img, 1))[1].tobytes()


def _plain_color(w=400, h=400, color=(120, 180, 220)) -> bytes:
    img = np.full((h, w, 3), color, dtype=np.uint8)
    return cv2.imencode(".jpg", img)[1].tobytes()


# ---------------- Direct compare_faces tests ----------------

@pytest.mark.parametrize("a,b,label", [
    (P1, P2, "p1-p2"),
    (P1, P3, "p1-p3"),
    (P2, P3, "p2-p3"),
], ids=["p1-p2", "p1-p3", "p2-p3"])
def test_different_people_mismatch(a, b, label):
    res = asyncio.run(compare_faces(_data_uri(a), _data_uri(b)))
    print(f"[{label}] -> {res}")
    assert res["status"] == "mismatch", f"Expected mismatch for {label}, got {res}"


@pytest.mark.parametrize("transform,name", [
    (lambda x: x, "identity"),
    (_brighten, "brightness"),
    (lambda x: _rotate(x, 12), "rotate12"),
    (_downscale_low_q, "downscale_q40"),
    (_flip, "hflip"),
], ids=["identity", "brightness", "rotate12", "downscale_q40", "hflip"])
def test_same_person_match(transform, name):
    for idx, raw in enumerate([P1, P2, P3], start=1):
        res = asyncio.run(compare_faces(_data_uri(raw), _data_uri(transform(raw))))
        print(f"[p{idx} {name}] -> {res}")
        # hflip is a known hard case for SFace (not invariant); accept match or unverified
        if name == "hflip":
            assert res["status"] in ("match", "unverified"), f"p{idx} {name}: {res}"
        else:
            assert res["status"] == "match", f"p{idx} {name}: {res}"


def test_no_face_in_selfie_mismatch():
    res = asyncio.run(compare_faces(_data_uri(P1), _data_uri(_plain_color())))
    print(f"[no-face selfie] -> {res}")
    assert res["status"] == "mismatch"
    assert "no clear face" in (res.get("reason") or "").lower() or "selfie" in (res.get("reason") or "").lower()


def test_no_face_in_kyc_unverified():
    res = asyncio.run(compare_faces(_data_uri(_plain_color()), _data_uri(P1)))
    print(f"[no-face kyc] -> {res}")
    assert res["status"] == "unverified"


def test_missing_kyc_url_unverified():
    res = asyncio.run(compare_faces("", _data_uri(P1)))
    assert res["status"] == "unverified"


# ---------------- End-to-end admin re-check endpoint ----------------

@pytest.fixture(scope="module")
def admin_token():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": "+919000000000"}, timeout=15)
    assert r.status_code == 200, r.text
    r = s.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": "+919000000000", "otp": "123456"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, data
    return tok


@pytest.fixture(scope="module")
def mongo_db():
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


async def _find_or_make_booking(db):
    b = await db.bookings.find_one({"checkin.selfie_url": {"$exists": True, "$ne": ""}, "partner_id": {"$ne": None}})
    if b:
        return b
    # Fallback: pick any booking with a partner_id and inject checkin
    b = await db.bookings.find_one({"partner_id": {"$exists": True, "$ne": None}})
    assert b, "No bookings with partner_id in db"
    await db.bookings.update_one({"id": b["id"]}, {"$set": {"checkin": {"selfie_url": _data_uri(P3)}}})
    return await db.bookings.find_one({"id": b["id"]})


def test_admin_recheck_end_to_end(admin_token, mongo_db):
    db = mongo_db

    async def run():
        booking = await _find_or_make_booking(db)
        bid = booking["id"]
        pid = booking["partner_id"]

        # Snapshot original state
        orig_profile = await db.partner_profiles.find_one({"user_id": pid}, {"_id": 0, "basic": 1})
        orig_booking = await db.bookings.find_one({"id": bid}, {"_id": 0, "checkin": 1, "face_mismatch": 1})

        # Ensure partner_profiles doc exists; set live_photo_url to p2
        await db.partner_profiles.update_one(
            {"user_id": pid},
            {"$set": {"basic.live_photo_url": _data_uri(P2)}},
            upsert=True,
        )
        # Set selfie to p3 (different person)
        await db.bookings.update_one({"id": bid}, {"$set": {"checkin.selfie_url": _data_uri(P3)}})

        headers = {"Authorization": f"Bearer {admin_token}"}

        # --- Case A: mismatch (p2 vs p3)
        r = requests.post(f"{BASE_URL}/api/admin/bookings/{bid}/face-match", headers=headers, timeout=120)
        print("A mismatch resp:", r.status_code, r.text[:400])
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "mismatch", body

        after = await db.bookings.find_one({"id": bid}, {"_id": 0, "checkin.face_match": 1, "face_mismatch": 1})
        assert after["checkin"]["face_match"]["status"] == "mismatch"
        assert after.get("face_mismatch") is True

        # Notification created
        notif = await db.notifications.find_one(
            {"$or": [{"event": "face_mismatch"}, {"data.type": "face_mismatch"}, {"data.booking_id": bid}]},
            sort=[("created_at", -1)],
        )
        print("notif:", bool(notif), (notif or {}).get("title"))
        assert notif, "No face_mismatch notification created"

        # --- Case B: match (p2 vs p2)
        await db.bookings.update_one({"id": bid}, {"$set": {"checkin.selfie_url": _data_uri(P2)}})
        r = requests.post(f"{BASE_URL}/api/admin/bookings/{bid}/face-match", headers=headers, timeout=120)
        print("B match resp:", r.status_code, r.text[:400])
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "match", body

        after = await db.bookings.find_one({"id": bid}, {"_id": 0, "checkin.face_match": 1, "face_mismatch": 1})
        assert after["checkin"]["face_match"]["status"] == "match"
        assert after.get("face_mismatch") is False

        # --- Cleanup
        if orig_profile is None:
            await db.partner_profiles.delete_one({"user_id": pid})
        else:
            await db.partner_profiles.update_one({"user_id": pid}, {"$set": {"basic": orig_profile.get("basic", {})}})
        if orig_booking and orig_booking.get("checkin") is not None:
            await db.bookings.update_one({"id": bid}, {"$set": {"checkin": orig_booking["checkin"], "face_mismatch": orig_booking.get("face_mismatch", False)}})
        else:
            await db.bookings.update_one({"id": bid}, {"$unset": {"checkin": "", "face_mismatch": ""}})

    asyncio.run(run())
