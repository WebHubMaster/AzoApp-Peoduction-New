"""App Management: Admin APK upload (chunk→finish→poll) + validation + delete.
Covers new async job contract (iter 236): /finish returns job_id, /status/{job_id} polling.
"""
import os
import io
import sys
import uuid
import time
import hashlib
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://data-reconcile-30.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CHUNK_SIZE = 768 * 1024  # match frontend


# --- helpers ---------------------------------------------------------------
def _mint_admin_token():
    """Mint an admin token directly from DB — avoids OTP/SMS dependency."""
    sys.path.insert(0, "/app/backend")
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    from pymongo import MongoClient
    from middleware.auth import create_token
    db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    u = db.users.find_one({"role": "admin"})
    if not u:
        pytest.skip("No admin user in DB")
    return create_token(u["id"], "admin")


def _mk_apk(path, pkg="app.azoapp.homeservice", vcode=16, vname="1.6.0", pad_mb=1):
    sys.path.insert(0, "/app/backend")
    from tests.make_test_apk import build
    build(path, pkg=pkg, vcode=vcode, vname=vname, pad_mb=pad_mb)
    return path


def _upload_chunks(client, platform, upload_id, data):
    total = (len(data) + CHUNK_SIZE - 1) // CHUNK_SIZE
    for i in range(total):
        blob = data[i * CHUNK_SIZE:(i + 1) * CHUNK_SIZE]
        r = client.post(
            f"{API}/app-mgmt/admin/apk/{platform}/chunk",
            data=blob,
            headers={
                "X-Upload-Id": upload_id, "X-Chunk-Index": str(i),
                "Content-Type": "application/octet-stream",
            }, timeout=60)
        assert r.status_code == 200, f"chunk {i} failed: {r.status_code} {r.text[:200]}"
    return total


def _finish(client, platform, upload_id, size, total):
    return client.post(
        f"{API}/app-mgmt/admin/apk/{platform}/finish",
        json={"upload_id": upload_id, "total_chunks": total, "size": size}, timeout=60)


def _poll(client, platform, job_id, timeout=60):
    end = time.time() + timeout
    while time.time() < end:
        r = client.get(f"{API}/app-mgmt/admin/apk/{platform}/status/{job_id}", timeout=15)
        assert r.status_code == 200
        st = r.json()
        if st["status"] in ("done", "error"):
            return st
        time.sleep(1)
    pytest.fail("polling timed out")


# --- fixtures --------------------------------------------------------------
@pytest.fixture(scope="session")
def admin_client():
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {_mint_admin_token()}"
    return s


# --- tests -----------------------------------------------------------------
class TestPublicConfig:
    def test_customer_config(self):
        r = requests.get(f"{API}/app-mgmt/config/customer", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("platform", "version_code", "latest_version", "apk_url", "apk_package"):
            assert k in d
        assert d["platform"] == "customer"

    def test_partner_config(self):
        r = requests.get(f"{API}/app-mgmt/config/partner", timeout=15)
        assert r.status_code == 200
        assert r.json()["platform"] == "partner"


class TestAdminConfig:
    def test_requires_auth(self):
        r = requests.get(f"{API}/app-mgmt/admin/config", timeout=15)
        assert r.status_code in (401, 403)

    def test_authorized(self, admin_client):
        r = admin_client.get(f"{API}/app-mgmt/admin/config", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "customer" in d and "partner" in d


class TestApkUploadFlow:
    """End-to-end chunk → finish → poll → success for both platforms."""

    def test_customer_apk_success(self, admin_client):
        apk = _mk_apk("/tmp/customer_test.apk", pkg="app.azoapp.homeservice", vcode=16, vname="1.6.0", pad_mb=1)
        with open(apk, "rb") as f: data = f.read()
        upload_id = f"TEST-{uuid.uuid4().hex[:12]}"
        total = _upload_chunks(admin_client, "customer", upload_id, data)
        assert total > 1, "need multi-chunk test"
        r = _finish(admin_client, "customer", upload_id, len(data), total)
        assert r.status_code == 200, r.text[:300]
        job = r.json()
        assert job.get("job_id") and job.get("status") == "processing"
        st = _poll(admin_client, "customer", job["job_id"])
        assert st["status"] == "done", f"job errored: {st.get('error')}"
        res = st["result"]
        assert res["package"] == "app.azoapp.homeservice"
        assert res["version_code"] == 16
        assert res["version_name"] == "1.6.0"
        assert res["apk_url"]
        # Verify persisted on admin config
        c = admin_client.get(f"{API}/app-mgmt/admin/config", timeout=15).json()
        assert c["customer"]["apk_package"] == "app.azoapp.homeservice"
        assert c["customer"]["apk_version_name"] == "1.6.0"

    def test_partner_apk_success(self, admin_client):
        apk = _mk_apk("/tmp/partner_test.apk", pkg="app.azoapp.partner", vcode=12, vname="1.2.0", pad_mb=1)
        with open(apk, "rb") as f: data = f.read()
        upload_id = f"TEST-{uuid.uuid4().hex[:12]}"
        total = _upload_chunks(admin_client, "partner", upload_id, data)
        r = _finish(admin_client, "partner", upload_id, len(data), total)
        assert r.status_code == 200
        st = _poll(admin_client, "partner", r.json()["job_id"])
        assert st["status"] == "done"
        assert st["result"]["package"] == "app.azoapp.partner"


class TestApkValidation:
    def test_wrong_package_rejected(self, admin_client):
        """Uploading a partner APK to customer tab must error with clear message."""
        apk = _mk_apk("/tmp/wrong_pkg.apk", pkg="app.azoapp.partner", vcode=12, vname="1.2.0", pad_mb=1)
        with open(apk, "rb") as f: data = f.read()
        upload_id = f"TEST-{uuid.uuid4().hex[:12]}"
        total = _upload_chunks(admin_client, "customer", upload_id, data)
        r = _finish(admin_client, "customer", upload_id, len(data), total)
        assert r.status_code == 200
        st = _poll(admin_client, "customer", r.json()["job_id"])
        assert st["status"] == "error"
        assert "does not belong to the customer app" in st["error"].lower()

    def test_non_apk_zip_rejected(self, admin_client):
        """A random zip renamed .apk should be rejected on manifest check."""
        import zipfile
        p = "/tmp/garbage.apk"
        with zipfile.ZipFile(p, "w") as z:
            z.writestr("readme.txt", "not an apk")
            z.writestr("padding.bin", os.urandom(2048))
        with open(p, "rb") as f: data = f.read()
        upload_id = f"TEST-{uuid.uuid4().hex[:12]}"
        total = _upload_chunks(admin_client, "customer", upload_id, data)
        r = _finish(admin_client, "customer", upload_id, len(data), total)
        assert r.status_code == 200
        st = _poll(admin_client, "customer", r.json()["job_id"])
        assert st["status"] == "error"
        err = st["error"].lower()
        assert "androidmanifest" in err or "not a valid apk" in err or "could not read" in err, err

    def test_finish_missing_chunks_returns_400(self, admin_client):
        """/finish with no uploaded chunks → 400 'Upload incomplete'."""
        upload_id = f"TEST-{uuid.uuid4().hex[:12]}"  # never uploaded
        r = _finish(admin_client, "customer", upload_id, 1024, 1)
        assert r.status_code == 400
        assert "upload incomplete" in r.json()["detail"].lower()

    def test_finish_partial_chunks_returns_400(self, admin_client):
        """Upload one chunk, say total=5 at finish → 400."""
        upload_id = f"TEST-{uuid.uuid4().hex[:12]}"
        admin_client.post(f"{API}/app-mgmt/admin/apk/customer/chunk",
                          data=b"x" * 2048,
                          headers={"X-Upload-Id": upload_id, "X-Chunk-Index": "0",
                                   "Content-Type": "application/octet-stream"}, timeout=30)
        r = _finish(admin_client, "customer", upload_id, 999999, 5)
        assert r.status_code == 400
        assert "upload incomplete" in r.json()["detail"].lower()


class TestChunkIdempotency:
    """Re-sending the same chunk index must not corrupt the final file."""

    def test_resend_same_chunk_idempotent(self, admin_client):
        apk = _mk_apk("/tmp/idem_test.apk", vcode=16, vname="1.6.0", pad_mb=1)
        with open(apk, "rb") as f: data = f.read()
        upload_id = f"TEST-{uuid.uuid4().hex[:12]}"
        total = (len(data) + CHUNK_SIZE - 1) // CHUNK_SIZE
        for i in range(total):
            blob = data[i * CHUNK_SIZE:(i + 1) * CHUNK_SIZE]
            # send each chunk twice
            for _ in range(2):
                r = admin_client.post(
                    f"{API}/app-mgmt/admin/apk/customer/chunk",
                    data=blob,
                    headers={"X-Upload-Id": upload_id, "X-Chunk-Index": str(i),
                             "Content-Type": "application/octet-stream"}, timeout=60)
                assert r.status_code == 200
        r = _finish(admin_client, "customer", upload_id, len(data), total)
        assert r.status_code == 200
        st = _poll(admin_client, "customer", r.json()["job_id"])
        assert st["status"] == "done", st.get("error")


class TestChunksCleanup:
    """After /finish processes, apk_upload_chunks for that upload_id must be gone."""

    def test_chunks_deleted_after_process(self, admin_client):
        sys.path.insert(0, "/app/backend")
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")
        from pymongo import MongoClient
        db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

        apk = _mk_apk("/tmp/cleanup_test.apk", vcode=16, vname="1.6.0", pad_mb=1)
        with open(apk, "rb") as f: data = f.read()
        upload_id = f"TEST-{uuid.uuid4().hex[:12]}"
        total = _upload_chunks(admin_client, "customer", upload_id, data)
        assert db.apk_upload_chunks.count_documents({"upload_id": upload_id}) == total
        r = _finish(admin_client, "customer", upload_id, len(data), total)
        assert r.status_code == 200
        _poll(admin_client, "customer", r.json()["job_id"])
        # chunks must be cleaned regardless of done/error
        assert db.apk_upload_chunks.count_documents({"upload_id": upload_id}) == 0


class TestDelete:
    def test_delete_customer_apk(self, admin_client):
        # upload once to ensure something to delete
        apk = _mk_apk("/tmp/del_test.apk", vcode=16, vname="1.6.0", pad_mb=1)
        with open(apk, "rb") as f: data = f.read()
        upload_id = f"TEST-{uuid.uuid4().hex[:12]}"
        total = _upload_chunks(admin_client, "customer", upload_id, data)
        r = _finish(admin_client, "customer", upload_id, len(data), total)
        _poll(admin_client, "customer", r.json()["job_id"])

        r = admin_client.delete(f"{API}/app-mgmt/admin/apk/customer", timeout=20)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["ok"] is True
        assert d.get("apk_url") == ""
        assert d.get("apk_package") == ""
        assert d.get("update_enabled") is False
