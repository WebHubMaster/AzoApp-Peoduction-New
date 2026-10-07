"""Iter 237: App Management APK resume + storage badge features.
Tests GET /app-mgmt/admin/storage and GET /app-mgmt/admin/apk/{platform}/received/{upload_id}.
Also validates resume semantics (partial chunks → finish fails, then re-upload missing → done).
"""
import os
import sys
import uuid
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
CHUNK = 768 * 1024


def _mint_admin_token():
    sys.path.insert(0, "/app/backend")
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    from pymongo import MongoClient
    from middleware.auth import create_token
    db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    u = db.users.find_one({"role": "admin"})
    if not u:
        pytest.skip("No admin user")
    return create_token(u["id"], "admin")


@pytest.fixture(scope="session")
def admin_client():
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {_mint_admin_token()}"
    return s


def _mk_apk(path, pkg="app.azoapp.homeservice", vcode=16, vname="1.6.0", pad_mb=1):
    sys.path.insert(0, "/app/backend")
    from tests.make_test_apk import build
    build(path, pkg=pkg, vcode=vcode, vname=vname, pad_mb=pad_mb)
    return path


# ---------- Storage status ----------
class TestStorageStatus:
    def test_requires_auth(self):
        r = requests.get(f"{API}/app-mgmt/admin/storage", timeout=15)
        assert r.status_code in (401, 403), r.status_code

    def test_returns_mode(self, admin_client):
        r = admin_client.get(f"{API}/app-mgmt/admin/storage", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["mode"] in ("s3", "local")
        for k in ("bucket", "region", "folder"):
            assert k in d
        if d["mode"] == "local":
            assert d["bucket"] == ""
            assert d["region"] == ""


# ---------- Received chunks ----------
class TestReceivedChunks:
    def test_requires_auth(self):
        r = requests.get(f"{API}/app-mgmt/admin/apk/customer/received/TEST-nope", timeout=15)
        assert r.status_code in (401, 403)

    def test_empty_upload_returns_empty_list(self, admin_client):
        uid = f"TEST-{uuid.uuid4().hex[:12]}"
        r = admin_client.get(f"{API}/app-mgmt/admin/apk/customer/received/{uid}", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["upload_id"] == uid
        assert d["received"] == []

    def test_returns_sorted_received_indexes(self, admin_client):
        """Send chunks 0,1,2 out of order; GET should return [0,1,2] sorted."""
        uid = f"TEST-{uuid.uuid4().hex[:12]}"
        # send in order 2, 0, 1
        for i in (2, 0, 1):
            r = admin_client.post(
                f"{API}/app-mgmt/admin/apk/customer/chunk",
                data=b"x" * 4096,
                headers={"X-Upload-Id": uid, "X-Chunk-Index": str(i),
                         "Content-Type": "application/octet-stream"}, timeout=30)
            assert r.status_code == 200
        r = admin_client.get(f"{API}/app-mgmt/admin/apk/customer/received/{uid}", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["received"] == [0, 1, 2]
        # Cleanup leftover chunks (never finished)
        sys.path.insert(0, "/app/backend")
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")
        from pymongo import MongoClient
        db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
        db.apk_upload_chunks.delete_many({"upload_id": uid})

    def test_resume_flow(self, admin_client):
        """Upload half the chunks → GET received → upload missing → finish done."""
        apk = _mk_apk("/tmp/resume_test.apk", pad_mb=2)
        with open(apk, "rb") as f:
            data = f.read()
        total = (len(data) + CHUNK - 1) // CHUNK
        assert total >= 3, f"need multi-chunk, got {total}"
        uid = f"TEST-{uuid.uuid4().hex[:12]}"
        # Send only even-indexed chunks first (simulating interruption)
        sent_first = [i for i in range(total) if i % 2 == 0]
        for i in sent_first:
            blob = data[i * CHUNK:(i + 1) * CHUNK]
            r = admin_client.post(
                f"{API}/app-mgmt/admin/apk/customer/chunk",
                data=blob,
                headers={"X-Upload-Id": uid, "X-Chunk-Index": str(i),
                         "Content-Type": "application/octet-stream"}, timeout=60)
            assert r.status_code == 200
        # Check received
        r = admin_client.get(f"{API}/app-mgmt/admin/apk/customer/received/{uid}", timeout=15)
        assert r.status_code == 200
        assert r.json()["received"] == sorted(sent_first)
        # Finish now should fail — upload incomplete
        r = admin_client.post(
            f"{API}/app-mgmt/admin/apk/customer/finish",
            json={"upload_id": uid, "total_chunks": total, "size": len(data)}, timeout=30)
        assert r.status_code == 400
        assert "upload incomplete" in r.json()["detail"].lower()
        # Send missing chunks
        for i in range(total):
            if i in sent_first:
                continue
            blob = data[i * CHUNK:(i + 1) * CHUNK]
            r = admin_client.post(
                f"{API}/app-mgmt/admin/apk/customer/chunk",
                data=blob,
                headers={"X-Upload-Id": uid, "X-Chunk-Index": str(i),
                         "Content-Type": "application/octet-stream"}, timeout=60)
            assert r.status_code == 200
        # Received should list all indexes sorted now
        r = admin_client.get(f"{API}/app-mgmt/admin/apk/customer/received/{uid}", timeout=15)
        assert r.json()["received"] == list(range(total))
        # Finish and poll until done
        r = admin_client.post(
            f"{API}/app-mgmt/admin/apk/customer/finish",
            json={"upload_id": uid, "total_chunks": total, "size": len(data)}, timeout=30)
        assert r.status_code == 200
        job_id = r.json()["job_id"]
        end = time.time() + 90
        last = None
        while time.time() < end:
            r = admin_client.get(f"{API}/app-mgmt/admin/apk/customer/status/{job_id}", timeout=15)
            assert r.status_code == 200
            last = r.json()
            if last["status"] in ("done", "error"):
                break
            time.sleep(1)
        assert last and last["status"] == "done", f"job failed: {last}"
        assert last["result"]["package"] == "app.azoapp.homeservice"

    def test_invalid_upload_id_rejected(self, admin_client):
        r = admin_client.get(f"{API}/app-mgmt/admin/apk/customer/received/!!bad!!", timeout=15)
        assert r.status_code == 400

    def test_invalid_platform_rejected(self, admin_client):
        r = admin_client.get(f"{API}/app-mgmt/admin/apk/bogus/received/TEST-x", timeout=15)
        assert r.status_code == 400
