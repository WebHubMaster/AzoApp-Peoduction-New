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
EXPECTED_PACKAGE = {"customer": "app.azoapp.customer", "partner": "app.azoapp.partner"}
_CHUNK_DIR = os.path.join(tempfile.gettempdir(), "azo_apk_uploads")
os.makedirs(_CHUNK_DIR, exist_ok=True)

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
            "apk_url": "", "apk_size": 0, "apk_package": "", "apk_version_name": "",
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


@router.post("/admin/apk/{platform}/chunk")
async def upload_chunk(platform: str, request: Request, user=Depends(ADMIN)):
    """Append one raw binary chunk. Headers: X-Upload-Id, X-Chunk-Index (0-based)."""
    _valid_platform(platform)
    upload_id = request.headers.get("x-upload-id", "")
    if not upload_id or any(c in upload_id for c in "/\\.."):
        raise HTTPException(status_code=400, detail="Missing/invalid X-Upload-Id")
    idx = request.headers.get("x-chunk-index", "0")
    path = os.path.join(_CHUNK_DIR, f"{platform}__{upload_id}.part")
    body = await request.body()
    with open(path, "ab") as fh:
        fh.write(body)
    return {"ok": True, "index": idx, "received": os.path.getsize(path)}


@router.post("/admin/apk/{platform}/finish")
async def finish_upload(platform: str, body: dict, user=Depends(ADMIN)):
    """Assemble the uploaded chunks, validate it's the RIGHT app's APK, store in S3."""
    _valid_platform(platform)
    upload_id = (body or {}).get("upload_id", "")
    path = os.path.join(_CHUNK_DIR, f"{platform}__{upload_id}.part")
    if not upload_id or not os.path.exists(path):
        raise HTTPException(status_code=400, detail="No uploaded file found — please re-upload.")
    try:
        raw = open(path, "rb").read()
        if len(raw) < 1024:
            raise HTTPException(status_code=400, detail="File is empty or too small to be an APK.")
        pkg, vcode, vname = _parse_apk(raw)
        expected = EXPECTED_PACKAGE[platform]
        if pkg != expected:
            raise HTTPException(
                status_code=400,
                detail=f"This APK does not belong to the {platform.title()} App "
                       f"(found package '{pkg}', expected '{expected}').")
        url = await storage_service._put(f"app-mgmt/{platform}/{expected}-{vcode}.apk",
                                         raw, "application/vnd.android.package-archive")
        upd = {"apk_url": url, "apk_size": len(raw), "apk_package": pkg,
               "apk_version_name": vname, "updated_at": now_iso()}
        # auto-fill the version fields from the APK if the admin left them blank
        cur = await _get(platform)
        if not cur.get("version_code"):
            upd["version_code"] = vcode
        if not cur.get("latest_version"):
            upd["latest_version"] = vname
        await db.app_config.update_one({"platform": platform}, {"$set": upd}, upsert=True)
        return {"ok": True, "package": pkg, "version_code": vcode, "version_name": vname,
                "size": len(raw), "apk_url": url, **(await _get(platform))}
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


def _parse_apk(raw: bytes):
    """Return (package, version_code, version_name). Rejects anything that isn't a
    real Android APK (must be a ZIP with a parseable AndroidManifest)."""
    import io
    import zipfile
    if not zipfile.is_zipfile(io.BytesIO(raw)):
        raise HTTPException(status_code=400, detail="Invalid file — not a valid APK (must be a signed .apk).")
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        names = set(zf.namelist())
    if "AndroidManifest.xml" not in names:
        raise HTTPException(status_code=400, detail="Invalid APK — AndroidManifest.xml missing.")
    try:
        from pyaxmlparser import APK as _APK
        apk = _APK(raw, raw=True)
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
@router.get("/config/{platform}")
async def public_config(platform: str):
    """The mobile app calls this on launch to gate maintenance + mandatory update.
    Maintenance takes priority over update (handled client-side per spec §18)."""
    _valid_platform(platform)
    c = await _get(platform)
    return {
        "platform": platform,
        "version_code": int(c.get("version_code") or 0),
        "latest_version": c.get("latest_version") or "",
        "apk_url": c.get("apk_url") or "",
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
