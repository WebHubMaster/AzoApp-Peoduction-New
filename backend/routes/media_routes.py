"""Media upload + management (admin) and local file serving (public)."""
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, Response

from middleware.auth import require_role
from services import storage_service
from config.database import db

router = APIRouter(prefix="/media", tags=["media"])
ADMIN = require_role("admin")
UPLOAD_DIR = Path(__file__).parent.parent / "uploads"


@router.post("/upload")
async def upload(file: UploadFile = File(...), folder: str = Form("media"),
                 max_side: int = Form(1600), admin=Depends(ADMIN)):
    raw = await file.read()
    try:
        res = await storage_service.save_image(raw, file.content_type or "", folder=folder, max_side=int(max_side), filename=file.filename or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await storage_service.record_media({
        "url": res["url"], "thumb_url": res.get("thumb_url"), "name": res["name"],
        "folder": folder, "size": res["size"], "original": file.filename})
    return res


AUDIO_TYPES = {"audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav",
               "audio/ogg": "ogg", "audio/webm": "webm", "audio/aac": "aac", "audio/mp4": "m4a", "audio/x-m4a": "m4a"}


@router.post("/upload-audio")
async def upload_audio(file: UploadFile = File(...), folder: str = Form("alerts"), admin=Depends(ADMIN)):
    raw = await file.read()
    ct = (file.content_type or "").lower()
    ext = AUDIO_TYPES.get(ct) or (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in set(AUDIO_TYPES.values()):
        raise HTTPException(status_code=400, detail="Unsupported audio. Use MP3, WAV, OGG, AAC or M4A.")
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio too large (max 5MB).")
    import uuid
    name = f"{folder}/{uuid.uuid4().hex}.{ext}"
    url = await storage_service._put(name, raw, ct or f"audio/{ext}")
    await storage_service.record_media({"url": url, "thumb_url": None, "name": name, "folder": folder,
                                        "size": len(raw), "original": file.filename, "kind": "audio"})
    return {"url": url, "name": name, "size": len(raw), "original": file.filename}


@router.get("")
async def list_media(folder: str = None, admin=Depends(ADMIN)):
    q = {"folder": folder} if folder else {}
    return await db.media.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.delete("/{media_id}")
async def delete_media(media_id: str, admin=Depends(ADMIN)):
    m = await db.media.find_one({"id": media_id}, {"_id": 0})
    if m and m.get("name"):
        try:
            (UPLOAD_DIR / m["name"]).unlink(missing_ok=True)
        except Exception:
            pass
    await db.media.delete_one({"id": media_id})
    return {"deleted": True}


@router.get("/file/{folder}/{name}")
async def serve_file(folder: str, name: str):
    path = UPLOAD_DIR / folder / name
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    media_type = "image/svg+xml" if name.lower().endswith(".svg") else None
    # Uploaded files are content-addressed (uuid names) → safe to cache hard.
    # This stops repeat downloads of logos/images on every page view (big win
    # on slow networks). 30 days + immutable.
    return FileResponse(str(path), media_type=media_type,
                        headers={"Cache-Control": "public, max-age=2592000, immutable"})


@router.get("/s3/{key:path}")
async def serve_s3(key: str):
    """Stream a private-bucket S3 object through the backend so it displays on the site."""
    got = await storage_service.fetch_s3_object(key)
    if got is None:
        raise HTTPException(status_code=404, detail="File not found")
    body, content_type = got
    return Response(content=body, media_type=content_type,
                    headers={"Cache-Control": "public, max-age=2592000, immutable"})
