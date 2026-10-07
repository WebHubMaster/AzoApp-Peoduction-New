"""App Update & Maintenance Mode — per-platform (customer/partner) config the mobile
apps read on launch to gate maintenance + mandatory in-app-APK updates. APKs are
stored in object storage (S3); Play Store link is reference-only, never the download
source. Admin uploads via a resumable chunk flow (large APKs bypass proxy body limits)."""
import os
import tempfile
from fastapi import APIRouter, Depends, HTTPException, Request
from config.database import db, now_iso
from middleware.auth import require_role
from services import storage_service

router = APIRouter(prefix="/app-mgmt", tags=["app-management"])
ADMIN = require_role("admin")

PLATFORMS = ("customer", "partner")
EXPECTED_PACKAGE = {"customer": "app.azoapp.homeservice", "partner": "app.azoapp.partner"}

# editable text/flag fields the admin controls per platform
_CONFIG_FIELDS = {
    "latest_version", "version_code", "playstore_url", "update_enabled", "force_update",
    "release_notes", "maintenance_enabled", "maintenance_title", "maintenance_description",
}


def _valid_platform(p: str):
    if p not in PLATFORMS:
        raise HTTPException(status_code=400, detail="platform must be 'customer' or 'partner'")


async def _get(platform: str) -> dict:
    doc = await db.app_config.find_one({"platform": platform}, {"_id": 0})
    if not doc:
        doc = {
            "platform": platform, "latest_version": "", "version_code": 0,
            "apk_url": "", "apk_size": 0, "apk_package": "", "apk_version_name": "", "apk_version_code": 0, "apk_key": "",
            "playstore_url": "", "update_enabled": False, "force_update": False,
            "release_notes": "", "maintenance_enabled": False, "maintenance_title": "",
            "maintenance_image": "", "maintenance_icon": "", "maintenance_description": "",
            "updated_at": now_iso(),
        }
    return doc


# ---------------------------------------------------------------- ADMIN
@router.get("/admin/config")
async def admin_get_all(user=Depends(ADMIN)):
    return {p: await _get(p) for p in PLATFORMS}


@router.put("/admin/config/{platform}")
async def admin_save(platform: str, body: dict, user=Depends(ADMIN)):
    _valid_platform(platform)
    body = body or {}
    upd = {}
    for k in _CONFIG_FIELDS:
        if k in body:
            upd[k] = body[k]
    if "version_code" in upd:
        try:
            upd["version_code"] = int(upd["version_code"] or 0)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Version Code must be a whole number")
    for flag in ("update_enabled", "force_update", "maintenance_enabled"):
        if flag in upd:
            upd[flag] = bool(upd[flag])
    # maintenance image / icon can arrive as inline data URLs → store in S3, keep URL only
    for key in ("maintenance_image", "maintenance_icon"):
        if key in body:
            val = body[key]
            if isinstance(val, str) and val.startswith("data:"):
                val = await storage_service.materialize_data_url(val, folder=f"app-mgmt/{platform}")
            upd[key] = val or ""
    upd["updated_at"] = now_iso()
    await db.app_config.update_one({"platform": platform}, {"$set": upd}, upsert=True)
    return await _get(platform)


_MAX_CHUNK = 8 * 1024 * 1024
_TASKS: set = set()
_IDX_READY = False


async def _ensure_indexes():
    global _IDX_READY
    if not _IDX_READY:
        await db.apk_upload_chunks.create_index([("upload_id", 1), ("index", 1)], unique=True)
        await db.apk_upload_chunks.create_index("created_at_dt", expireAfterSeconds=6 * 3600)
        _IDX_READY = True


def _check_upload_id(upload_id: str):
    if not upload_id or len(upload_id) > 80 or not all(c.isalnum() or c in "-_" for c in upload_id):
        raise HTTPException(status_code=400, detail="Missing/invalid upload id")


@router.post("/admin/apk/{platform}/chunk")
async def upload_chunk(platform: str, request: Request, user=Depends(ADMIN)):
    """Store one small binary chunk in MongoDB (idempotent per index → retry-safe and
    works across multiple containers/workers). Headers: X-Upload-Id, X-Chunk-Index."""
    from datetime import datetime, timezone
    from bson import Binary
    _valid_platform(platform)
    upload_id = request.headers.get("x-upload-id", "")
    _check_upload_id(upload_id)
    try:
        idx = int(request.headers.get("x-chunk-index", ""))
    except ValueError:
        raise HTTPException(status_code=400, detail="Missing/invalid X-Chunk-Index")
    body = await request.body()
    if not body or len(body) > _MAX_CHUNK:
        raise HTTPException(status_code=400, detail="Empty or oversized chunk")
    await _ensure_indexes()
    await db.apk_upload_chunks.update_one(
        {"upload_id": upload_id, "index": idx},
        {"$set": {"platform": platform, "data": Binary(body), "size": len(body),
                  "created_at_dt": datetime.now(timezone.utc)}},
        upsert=True)
    return {"ok": True, "index": idx, "size": len(body)}


@router.get("/admin/apk/{platform}/received/{upload_id}")
async def received_chunks(platform: str, upload_id: str, user=Depends(ADMIN)):
    """Chunk indexes already stored for an upload — lets the admin resume after a drop/reload."""
    _valid_platform(platform)
    _check_upload_id(upload_id)
    rows = await db.apk_upload_chunks.find(
        {"upload_id": upload_id, "platform": platform}, {"_id": 0, "index": 1}).to_list(None)
    return {"upload_id": upload_id, "received": sorted(r["index"] for r in rows)}


@router.get("/admin/storage")
async def storage_status(user=Depends(ADMIN)):
    conf = await storage_service._s3_conf()
    if conf:
        return {"mode": "s3", "bucket": conf["bucket"], "region": conf["region"], "folder": conf["folder"]}
    return {"mode": "local", "bucket": "", "region": "", "folder": ""}


@router.post("/admin/apk/{platform}/finish")
async def finish_upload(platform: str, body: dict, user=Depends(ADMIN)):
    """Kick off background assembly + validation + storage; returns a job id to poll.
    Never blocks the request (big APKs would otherwise hit proxy timeouts)."""
    import asyncio
    import uuid
    _valid_platform(platform)
    body = body or {}
    upload_id = body.get("upload_id", "")
    _check_upload_id(upload_id)
    total = int(body.get("total_chunks") or 0)
    size = int(body.get("size") or 0)
    got = await db.apk_upload_chunks.count_documents({"upload_id": upload_id, "platform": platform})
    if not got or (total and got != total):
        raise HTTPException(status_code=400, detail=f"Upload incomplete ({got}/{total} parts received) — please re-upload.")
    job_id = uuid.uuid4().hex
    await db.apk_upload_jobs.insert_one({"id": job_id, "platform": platform, "upload_id": upload_id,
                                         "status": "processing", "stage": "Assembling file",
                                         "error": "", "result": None, "created_at": now_iso()})
    t = asyncio.create_task(_process_upload(job_id, platform, upload_id, size))
    _TASKS.add(t)
    t.add_done_callback(_TASKS.discard)
    return {"ok": True, "job_id": job_id, "status": "processing"}


@router.get("/admin/apk/{platform}/status/{job_id}")
async def upload_status(platform: str, job_id: str, user=Depends(ADMIN)):
    job = await db.apk_upload_jobs.find_one({"id": job_id, "platform": platform}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Upload job not found")
    return job


async def _job(job_id: str, **upd):
    await db.apk_upload_jobs.update_one({"id": job_id}, {"$set": upd})


async def _process_upload(job_id: str, platform: str, upload_id: str, size: int):
    import anyio
    fd, path = tempfile.mkstemp(suffix=".apk")
    os.close(fd)
    try:
        written = 0
        with open(path, "wb") as fh:
            cur = db.apk_upload_chunks.find({"upload_id": upload_id}, {"data": 1, "index": 1}).sort("index", 1)
            expected_idx = 0
            async for ch in cur:
                if ch["index"] != expected_idx:
                    raise HTTPException(status_code=400, detail="Upload has missing parts — please re-upload.")
                fh.write(bytes(ch["data"]))
                written += len(ch["data"])
                expected_idx += 1
        if size and written != size:
            raise HTTPException(status_code=400, detail=f"Upload size mismatch ({written} of {size} bytes) — please re-upload.")
        if written < 1024:
            raise HTTPException(status_code=400, detail="File is empty or too small to be an APK.")
        await _job(job_id, stage="Validating APK")
        pkg, vcode, vname = await anyio.to_thread.run_sync(_parse_apk, path)
        expected = EXPECTED_PACKAGE[platform]
        if pkg != expected:
            raise HTTPException(
                status_code=400,
                detail=f"This APK does not belong to the {platform.title()} App "
                       f"(found package '{pkg}', expected '{expected}').")
        await _job(job_id, stage="Saving to storage")
        old = await _get(platform)
        apk_name = f"app-mgmt/{platform}/{expected}-{vcode}-{upload_id[-8:]}.apk"
        url = await storage_service.put_file(apk_name, path, "application/vnd.android.package-archive")
        # The APK itself is the source of truth for the version the apps compare against —
        # a mismatched manual value would cause an endless "update available" loop.
        upd = {"apk_url": url, "apk_size": written, "apk_package": pkg,
               "apk_version_name": vname, "apk_version_code": vcode, "apk_key": apk_name,
               "version_code": vcode, "latest_version": vname, "updated_at": now_iso()}
        await db.app_config.update_one({"platform": platform}, {"$set": upd}, upsert=True)
        old_ref = old.get("apk_key") or ""
        if old_ref and old_ref != apk_name:
            try:
                await storage_service.delete_stored(old_ref)
            except Exception:  # noqa: BLE001
                pass
        result = {"package": pkg, "version_code": vcode, "version_name": vname,
                  "size": written, "apk_url": url, **(await _get(platform))}
        await _job(job_id, status="done", stage="Done", result=result)
    except HTTPException as e:
        await _job(job_id, status="error", error=str(e.detail))
    except Exception as e:  # noqa: BLE001
        await _job(job_id, status="error", error=f"Upload failed: {e}")
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
        await db.apk_upload_chunks.delete_many({"upload_id": upload_id})


@router.delete("/admin/apk/{platform}")
async def delete_apk(platform: str, user=Depends(ADMIN)):
    """Delete the uploaded APK for a platform: removes the stored file (S3 or local
    disk) AND clears the version/apk fields so no update is served. Also turns
    update_enabled OFF (there is nothing to update to)."""
    _valid_platform(platform)
    cur = await _get(platform)
    ref = cur.get("apk_key") or cur.get("apk_url") or ""
    deleted = False
    if ref:
        try:
            deleted = await storage_service.delete_stored(ref)
        except Exception:  # noqa: BLE001 — never let a storage hiccup block clearing the record
            deleted = False
    await db.app_config.update_one(
        {"platform": platform},
        {"$set": {"apk_url": "", "apk_size": 0, "apk_package": "", "apk_version_name": "", "apk_version_code": 0,
                  "apk_key": "", "update_enabled": False, "updated_at": now_iso()}},
        upsert=True)
    return {"ok": True, "file_deleted": deleted, **(await _get(platform))}


def _parse_apk(path: str):
    """Return (package, version_code, version_name) from an APK file on disk."""
    import zipfile
    if not zipfile.is_zipfile(path):
        raise HTTPException(status_code=400, detail="Invalid file — not a valid APK (must be a signed .apk).")
    with zipfile.ZipFile(path) as zf:
        names = set(zf.namelist())
    if "AndroidManifest.xml" not in names:
        raise HTTPException(status_code=400, detail="Invalid APK — AndroidManifest.xml missing.")
    try:
        from pyaxmlparser import APK as _APK
        apk = _APK(path)
        pkg = apk.package or ""
        vcode = int(apk.version_code or 0)
        vname = apk.version_name or ""
        if not pkg:
            raise ValueError("no package")
        return pkg, vcode, vname
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not read the APK manifest: {e}")


# ---------------------------------------------------------------- PUBLIC (app-facing)
@router.get("/download/{platform}")
async def download_latest(platform: str, request: Request):
    """Stable public link to the latest uploaded APK (one-time manual install for
    devices running an old build whose in-app updater cannot self-update)."""
    from fastapi.responses import RedirectResponse
    _valid_platform(platform)
    c = await _get(platform)
    url = c.get("apk_url") or ""
    if not url:
        raise HTTPException(status_code=404, detail="No APK uploaded yet")
    if url.startswith("/"):
        url = storage_service.request_base(request) + url
    return RedirectResponse(url, status_code=302, headers={"Cache-Control": "no-store"})


@router.get("/config/{platform}")
async def public_config(platform: str, request: Request):
    """The mobile app calls this on launch to gate maintenance + mandatory update.
    Maintenance takes priority over update (handled client-side per spec §18)."""
    _valid_platform(platform)
    c = await _get(platform)
    apk_url = c.get("apk_url") or ""
    if apk_url.startswith("/"):
        apk_url = storage_service.request_base(request) + apk_url
    vcode = int(c.get("apk_version_code") or 0) if apk_url else 0
    return {
        "platform": platform,
        "version_code": vcode or int(c.get("version_code") or 0),
        "latest_version": c.get("latest_version") or "",
        "apk_url": apk_url,
        "apk_size": c.get("apk_size") or 0,
        "apk_package": c.get("apk_package") or EXPECTED_PACKAGE[platform],
        "playstore_url": c.get("playstore_url") or "",
        "update_enabled": bool(c.get("update_enabled")),
        "force_update": bool(c.get("force_update")),
        "release_notes": c.get("release_notes") or "",
        "maintenance_enabled": bool(c.get("maintenance_enabled")),
        "maintenance_title": c.get("maintenance_title") or "",
        "maintenance_image": c.get("maintenance_image") or "",
        "maintenance_icon": c.get("maintenance_icon") or "",
        "maintenance_description": c.get("maintenance_description") or "",
    }
