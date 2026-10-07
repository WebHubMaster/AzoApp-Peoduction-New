"""Tests for in-app APK update flow (iter 242):
 - public config shape for customer/partner
 - NEW GET /api/app-mgmt/download/{platform} redirect & 404 & 400
 - GET /api/media/file/.../*.apk → 200 full, Range → 206 + Content-Range (resume)
Seeds a fake partner app_config + dummy APK on disk, then cleans up after.
"""
import os
import pytest
import requests
import pymongo
from pathlib import Path

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
PARTNER_APK = UPLOAD_DIR / "app-mgmt/partner/test.apk"
APK_SIZE = 1024 * 300  # 300KB dummy


@pytest.fixture(scope="module")
def mongo_db():
    client = pymongo.MongoClient(MONGO_URL)
    db = client[DB_NAME]
    yield db
    client.close()


@pytest.fixture(scope="module")
def seed_partner_apk(mongo_db):
    """Create dummy APK file + seed app_config partner doc. Save original then restore."""
    PARTNER_APK.parent.mkdir(parents=True, exist_ok=True)
    # deterministic content for Range verification
    PARTNER_APK.write_bytes(bytes([i % 256 for i in range(APK_SIZE)]))

    original = mongo_db.app_config.find_one({"platform": "partner"})
    mongo_db.app_config.update_one(
        {"platform": "partner"},
        {"$set": {
            "platform": "partner",
            "apk_url": "/api/media/file/app-mgmt/partner/test.apk",
            "apk_size": APK_SIZE,
            "apk_version_code": 5,
            "apk_version_name": "1.0.5",
            "apk_package": "app.azoapp.partner",
            "version_code": 5,
            "latest_version": "1.0.5",
            "update_enabled": True,
            "force_update": False,
        }},
        upsert=True,
    )

    yield

    # cleanup — reset partner apk fields + remove file
    reset = {
        "apk_url": "", "apk_size": 0, "apk_package": "",
        "apk_version_name": "", "apk_version_code": 0, "apk_key": "",
        "update_enabled": False,
    }
    if original:
        for k in reset:
            reset[k] = original.get(k, reset[k])
        reset["update_enabled"] = bool(original.get("update_enabled", False))
    mongo_db.app_config.update_one({"platform": "partner"}, {"$set": reset})
    try:
        PARTNER_APK.unlink(missing_ok=True)
    except Exception:
        pass


# ── Public config shape ─────────────────────────────────────────────
@pytest.mark.parametrize("platform", ["customer", "partner"])
def test_public_config_shape(platform, seed_partner_apk):
    r = requests.get(f"{API}/app-mgmt/config/{platform}", timeout=45)
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("platform", "version_code", "latest_version", "apk_url", "apk_size",
              "update_enabled", "force_update"):
        assert k in d, f"missing {k}"
    assert d["platform"] == platform
    # apk_url must be absolute when non-empty
    if d["apk_url"]:
        assert d["apk_url"].startswith("http"), d["apk_url"]


def test_public_config_partner_has_seeded_values(seed_partner_apk):
    r = requests.get(f"{API}/app-mgmt/config/partner", timeout=15)
    d = r.json()
    assert d["version_code"] == 5
    assert d["latest_version"] == "1.0.5"
    assert d["apk_size"] == APK_SIZE
    assert d["update_enabled"] is True
    assert d["apk_url"].endswith("/api/media/file/app-mgmt/partner/test.apk")


def test_public_config_invalid_platform():
    r = requests.get(f"{API}/app-mgmt/config/foobar", timeout=15)
    assert r.status_code == 400


# ── NEW GET /api/app-mgmt/download/{platform} ───────────────────────
def test_download_partner_redirects(seed_partner_apk):
    r = requests.get(f"{API}/app-mgmt/download/partner", allow_redirects=False, timeout=15)
    assert r.status_code == 302, r.text
    loc = r.headers.get("location", "")
    assert loc.endswith("/api/media/file/app-mgmt/partner/test.apk"), loc
    assert loc.startswith("http"), loc


def test_download_customer_404_when_no_apk(mongo_db):
    original = mongo_db.app_config.find_one({"platform": "customer"})
    try:
        mongo_db.app_config.update_one(
            {"platform": "customer"},
            {"$set": {"apk_url": "", "apk_key": "", "apk_size": 0, "update_enabled": False}},
            upsert=True,
        )
        r = requests.get(f"{API}/app-mgmt/download/customer", allow_redirects=False, timeout=15)
        assert r.status_code == 404, r.text
    finally:
        if original:
            # restore relevant fields
            mongo_db.app_config.update_one(
                {"platform": "customer"},
                {"$set": {k: original.get(k, "") for k in ("apk_url", "apk_key", "apk_size", "update_enabled")}},
            )


def test_download_invalid_platform():
    r = requests.get(f"{API}/app-mgmt/download/windows", allow_redirects=False, timeout=15)
    assert r.status_code == 400


# ── Media file serving + Range resume ───────────────────────────────
def test_media_apk_full_200(seed_partner_apk):
    r = requests.get(f"{API}/media/file/app-mgmt/partner/test.apk", timeout=20)
    assert r.status_code == 200
    assert len(r.content) == APK_SIZE


def test_media_apk_range_206(seed_partner_apk):
    start, end = 100, 199
    r = requests.get(
        f"{API}/media/file/app-mgmt/partner/test.apk",
        headers={"Range": f"bytes={start}-{end}"},
        timeout=20,
    )
    assert r.status_code == 206, r.text
    cr = r.headers.get("Content-Range", "")
    assert cr == f"bytes {start}-{end}/{APK_SIZE}", cr
    assert r.headers.get("Accept-Ranges") == "bytes"
    assert len(r.content) == end - start + 1
    # content integrity check (first few bytes match deterministic pattern)
    assert r.content[0] == start % 256
    assert r.content[-1] == end % 256


def test_media_apk_range_resume_tail(seed_partner_apk):
    """Resume: start-byte only (no end) → serves from start to EOF."""
    start = APK_SIZE - 1024
    r = requests.get(
        f"{API}/media/file/app-mgmt/partner/test.apk",
        headers={"Range": f"bytes={start}-"},
        timeout=20,
    )
    assert r.status_code == 206
    assert len(r.content) == 1024
    assert r.headers["Content-Range"] == f"bytes {start}-{APK_SIZE - 1}/{APK_SIZE}"
