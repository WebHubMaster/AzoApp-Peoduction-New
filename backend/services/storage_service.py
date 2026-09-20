"""Unified media storage: AWS S3 (admin-configurable via Integration Center) with local disk fallback.
Images are validated + compressed + a thumbnail is generated (Pillow).
When S3 is enabled + configured, files go to S3 and public S3 URLs are returned; otherwise files are
stored under /app/backend/uploads and served via GET /api/media/file/{name}.
"""
import io
import os
import uuid
from pathlib import Path
from typing import Optional

from PIL import Image

from config.database import db, get_settings

UPLOAD_DIR = Path(__file__).parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED = {"image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/svg+xml"}
MAX_BYTES = 12 * 1024 * 1024  # 12MB raw upload cap

_EXT_CT = {"svg": "image/svg+xml", "jpg": "image/jpeg", "jpeg": "image/jpeg",
           "png": "image/png", "gif": "image/gif", "webp": "image/webp"}


def _sniff_ct(raw: bytes) -> Optional[str]:
    """Detect image type from magic bytes / SVG markup when the client MIME is missing."""
    if not raw:
        return None
    head = raw[:512].lstrip()
    if head[:4] == b"\x89PNG":
        return "image/png"
    if head[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if head[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image/webp"
    low = raw[:1024].lower()
    if b"<svg" in low:
        return "image/svg+xml"
    return None


def _resolve_ct(content_type: str, filename: str, raw: bytes) -> str:
    """Return a supported MIME for an upload, using the browser MIME first, then the
    filename extension, then content sniffing. Fixes uploads (e.g. SVG on Windows)
    that arrive as application/octet-stream or an empty type."""
    ct = (content_type or "").lower().split(";")[0].strip()
    if ct in ALLOWED:
        return ct
    ext = (filename or "").rsplit(".", 1)[-1].lower() if "." in (filename or "") else ""
    if _EXT_CT.get(ext):
        return _EXT_CT[ext]
    return _sniff_ct(raw or b"") or ct


def _conf_from_integ(integ: dict) -> Optional[dict]:
    if not (integ.get("aws_access_key_id") and integ.get("aws_secret_access_key") and integ.get("aws_bucket")):
        return None
    return {
        "key": str(integ["aws_access_key_id"]).strip(),
        "secret": str(integ["aws_secret_access_key"]).strip(),
        "bucket": str(integ["aws_bucket"]).strip(),
        "region": (integ.get("aws_region") or "ap-south-1").strip(),
        "public_base": (integ.get("aws_public_base") or "").rstrip("/"),
        "folder": (integ.get("aws_folder") or "").strip().strip("/"),
    }


async def _s3_conf() -> Optional[dict]:
    s = await get_settings()
    integ = s.get("integrations", {}) or {}
    if not integ.get("aws_s3_enabled"):
        return None
    return _conf_from_integ(integ)


def _s3_key(conf: dict, name: str) -> str:
    """Prefix the object key with the configured base folder (if any)."""
    folder = conf.get("folder") or ""
    return f"{folder}/{name}" if folder else name


def _public_url(conf: dict, key: str) -> str:
    """Return the URL used to display an object.
    - If a Public Base URL (CDN/CloudFront) is set → use it directly.
    - Otherwise → route through our authenticated backend proxy so images display
      on the site even when the bucket is private (blocks public access)."""
    if conf.get("public_base"):
        return f"{conf['public_base']}/{key}"
    backend = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
    return f"{backend}/api/media/s3/{key}"


def _compress(raw: bytes, content_type: str, max_side: int, quality: int = 82):
    """Return (bytes, ext, mime). GIFs pass through untouched (animation preserved)."""
    if content_type in ("image/gif",):
        return raw, "gif", "image/gif"
    img = Image.open(io.BytesIO(raw))
    fmt_ext = "webp"
    if img.mode in ("P", "RGBA") and content_type == "image/png":
        img = img.convert("RGBA")
    else:
        img = img.convert("RGB")
    w, h = img.size
    if max(w, h) > max_side:
        if w >= h:
            img = img.resize((max_side, int(h * max_side / w)))
        else:
            img = img.resize((int(w * max_side / h), max_side))
    out = io.BytesIO()
    # method=4 encodes ~3-4x faster than method=6 with near-identical size — this
    # is the single biggest win for upload responsiveness on the server side.
    img.save(out, format="WEBP", quality=quality, method=4)
    return out.getvalue(), fmt_ext, "image/webp"


async def _put(name: str, data: bytes, mime: str) -> str:
    conf = await _s3_conf()
    if conf:
        import boto3
        from botocore.exceptions import ClientError, BotoCoreError
        key = _s3_key(conf, name)
        try:
            client = boto3.client(
                "s3", region_name=conf["region"],
                aws_access_key_id=conf["key"], aws_secret_access_key=conf["secret"])
            client.put_object(Bucket=conf["bucket"], Key=key, Body=data, ContentType=mime)
        except (ClientError, BotoCoreError) as e:
            raise ValueError(f"AWS S3 upload failed: {_s3_error_msg(e)}. Open Integration Center → AWS S3 → Test Connection to diagnose.")
        return _public_url(conf, key)
    # local fallback
    dest = UPLOAD_DIR / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    backend_url = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
    base = f"{backend_url}/api/media/file" if backend_url else "/api/media/file"
    return f"{base}/{name}"


async def save_image(raw: bytes, content_type: str, folder: str = "media",
                     max_side: int = 1600, thumb: bool = True, filename: str = "") -> dict:
    content_type = _resolve_ct(content_type, filename, raw)
    if content_type not in ALLOWED:
        raise ValueError("Unsupported file type. Use JPG, PNG, GIF, WebP or SVG.")
    if len(raw) > MAX_BYTES:
        raise ValueError("File too large (max 12MB).")
    # SVG is a vector format: store as-is (no raster compression / thumbnail).
    if content_type == "image/svg+xml":
        uid = uuid.uuid4().hex
        name = f"{folder}/{uid}.svg"
        url = await _put(name, raw, "image/svg+xml")
        return {"url": url, "size": len(raw), "name": name, "thumb_url": url}
    data, ext, mime = _compress(raw, content_type, max_side)
    uid = uuid.uuid4().hex
    name = f"{folder}/{uid}.{ext}"
    url = await _put(name, data, mime)
    result = {"url": url, "size": len(data), "name": name}
    if thumb and content_type != "image/gif":
        tdata, text, tmime = _compress(raw, content_type, 400, quality=70)
        tname = f"{folder}/thumb_{uid}.{text}"
        result["thumb_url"] = await _put(tname, tdata, tmime)
        result["thumb_name"] = tname
    else:
        result["thumb_url"] = url
    return result


async def save_document(raw: bytes, content_type: str, filename: str = "",
                        folder: str = "kyc") -> dict:
    """Save a KYC document. Images are compressed to WebP; PDFs stored as-is."""
    if len(raw) > MAX_BYTES:
        raise ValueError("File too large (max 12MB).")
    ct = _resolve_ct(content_type, filename, raw)
    if ct in ALLOWED:
        return await save_image(raw, ct, folder=folder, max_side=1800, filename=filename)
    if ct == "application/pdf" or (filename or "").lower().endswith(".pdf"):
        uid = uuid.uuid4().hex
        name = f"{folder}/{uid}.pdf"
        url = await _put(name, raw, "application/pdf")
        return {"url": url, "name": name, "size": len(raw), "thumb_url": url,
                "kind": "pdf"}
    raise ValueError("Unsupported file. Use JPG, PNG, WebP or PDF.")


async def record_media(doc: dict):
    from config.database import now_iso
    doc = {"id": uuid.uuid4().hex, "created_at": now_iso(), **doc}
    await db.media.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


def _s3_error_msg(e) -> str:
    """Map a botocore error to a short, human-friendly reason."""
    try:
        code = e.response["Error"]["Code"]  # type: ignore[attr-defined]
    except Exception:
        code = type(e).__name__
    mapping = {
        "InvalidAccessKeyId": "Access Key ID is invalid.",
        "SignatureDoesNotMatch": "Secret Access Key is incorrect.",
        "AccessDenied": "Access denied — the IAM user lacks permission on this bucket (needs s3:PutObject/GetObject/ListBucket).",
        "NoSuchBucket": "Bucket does not exist.",
        "404": "Bucket not found.",
        "403": "Access denied — check IAM permissions.",
        "301": "Wrong region — the bucket lives in a different AWS region.",
        "PermanentRedirect": "Wrong region — the bucket lives in a different AWS region.",
        "IllegalLocationConstraintException": "Wrong region — the bucket lives in a different AWS region.",
        "AuthorizationHeaderMalformed": "Wrong region — the bucket lives in a different AWS region.",
        "InvalidBucketName": "Bucket name is invalid.",
    }
    return mapping.get(str(code), str(code))


def _sync_test_connection(conf: dict) -> dict:
    """Blocking S3 round-trip: HeadBucket → PutObject → GetObject (read-back) → DeleteObject.
    Fast + authenticated (no slow public-HTTP probe). Read-back proves images will
    display on the site via the backend proxy."""
    import boto3
    from botocore.exceptions import ClientError, BotoCoreError
    from botocore.config import Config as BotoConfig

    steps = []
    result = {"ok": False, "public": False, "steps": steps,
              "bucket": conf["bucket"], "region": conf["region"]}
    try:
        client = boto3.client(
            "s3", region_name=conf["region"],
            aws_access_key_id=conf["key"], aws_secret_access_key=conf["secret"],
            config=BotoConfig(connect_timeout=4, read_timeout=6, retries={"max_attempts": 1}))
    except Exception as e:  # noqa: BLE001
        steps.append({"label": "Create S3 client", "ok": False, "detail": str(e)})
        result["error"] = str(e)
        return result

    # 1) HeadBucket — bucket exists + creds valid + region correct
    try:
        client.head_bucket(Bucket=conf["bucket"])
        steps.append({"label": "Connect to bucket", "ok": True, "detail": "Bucket reachable with these credentials."})
    except (ClientError, BotoCoreError) as e:
        msg = _s3_error_msg(e)
        steps.append({"label": "Connect to bucket", "ok": False, "detail": msg})
        result["error"] = msg
        return result

    # 2) PutObject — write permission
    test_key = _s3_key(conf, f"_healthcheck/azoapp-{uuid.uuid4().hex}.txt")
    try:
        client.put_object(Bucket=conf["bucket"], Key=test_key,
                          Body=b"AzoApp S3 connection test", ContentType="text/plain")
        steps.append({"label": "Upload test file", "ok": True, "detail": f"Wrote {test_key}"})
    except (ClientError, BotoCoreError) as e:
        msg = _s3_error_msg(e)
        steps.append({"label": "Upload test file", "ok": False, "detail": msg})
        result["error"] = msg
        return result

    # 3) GetObject read-back — proves the app can serve this file (via proxy)
    result["public_url"] = _public_url(conf, test_key)
    try:
        obj = client.get_object(Bucket=conf["bucket"], Key=test_key)
        obj["Body"].read()
        result["public"] = True
        steps.append({"label": "Read file back", "ok": True,
                      "detail": "Images will display on your website via a secure proxy — even if the bucket blocks public access."})
    except (ClientError, BotoCoreError) as e:
        steps.append({"label": "Read file back", "ok": False, "detail": _s3_error_msg(e)})

    # 4) Cleanup
    try:
        client.delete_object(Bucket=conf["bucket"], Key=test_key)
        steps.append({"label": "Cleanup test file", "ok": True, "detail": "Removed."})
    except Exception:  # noqa: BLE001
        steps.append({"label": "Cleanup test file", "ok": False, "detail": "Could not delete test file (needs s3:DeleteObject). Not critical."})

    result["ok"] = True  # write path works
    return result


async def test_connection(integ: dict) -> dict:
    """Diagnose an S3 configuration (from Integration Center). Read-only round-trip."""
    conf = _conf_from_integ(integ or {})
    if not conf:
        return {"ok": False, "public": False, "steps": [],
                "error": "Missing required fields — Access Key ID, Secret Key and Bucket are all required."}
    import anyio
    return await anyio.to_thread.run_sync(_sync_test_connection, conf)


def _walk_replace(obj, mapping):
    """Recursively replace URL strings in a nested doc, preserving non-string types."""
    changed = False
    if isinstance(obj, dict):
        for k, v in list(obj.items()):
            nv, c = _walk_replace(v, mapping)
            if c:
                obj[k] = nv
                changed = True
        return obj, changed
    if isinstance(obj, list):
        for i, v in enumerate(obj):
            nv, c = _walk_replace(v, mapping)
            if c:
                obj[i] = nv
                changed = True
        return obj, changed
    if isinstance(obj, str):
        s = obj
        c = False
        for old, newu in mapping.items():
            if old and old in s:
                s = s.replace(old, newu)
                c = True
        return s, c
    return obj, changed


async def _replace_urls_across_db(mapping: dict) -> int:
    """Swap old local media URLs for new S3 URLs everywhere they're referenced."""
    if not mapping:
        return 0
    count = 0
    for coll in await db.list_collection_names():
        cursor = db[coll].find({})
        async for doc in cursor:
            _id = doc.get("_id")
            ndoc, changed = _walk_replace(doc, mapping)
            if changed:
                ndoc.pop("_id", None)
                await db[coll].update_one({"_id": _id}, {"$set": ndoc})
                count += 1
    return count


def _sync_migrate(conf: dict) -> dict:
    """Upload every local file under UPLOAD_DIR to S3, return per-file mapping + errors."""
    import boto3
    import mimetypes
    from botocore.exceptions import ClientError, BotoCoreError
    from botocore.config import Config as BotoConfig

    client = boto3.client(
        "s3", region_name=conf["region"],
        aws_access_key_id=conf["key"], aws_secret_access_key=conf["secret"],
        config=BotoConfig(connect_timeout=10, read_timeout=30, retries={"max_attempts": 2}))
    backend_url = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
    files = [p for p in UPLOAD_DIR.rglob("*") if p.is_file()]
    migrated = 0
    errors = []
    mapping = {}
    ok_paths = []
    for p in files:
        rel = p.relative_to(UPLOAD_DIR).as_posix()
        key = _s3_key(conf, rel)
        try:
            data = p.read_bytes()
            mime = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
            client.put_object(Bucket=conf["bucket"], Key=key, Body=data, ContentType=mime)
            new_url = _public_url(conf, key)
            if backend_url:
                mapping[f"{backend_url}/api/media/file/{rel}"] = new_url
            mapping[f"/api/media/file/{rel}"] = new_url
            migrated += 1
            ok_paths.append(str(p))
        except FileNotFoundError:
            continue  # file vanished between listing and read — skip
        except (ClientError, BotoCoreError) as e:
            errors.append(f"{rel}: {_s3_error_msg(e)}")
        except Exception as e:  # noqa: BLE001 — one bad file must not abort the batch
            errors.append(f"{rel}: {e}")
    return {"migrated": migrated, "total": len(files), "mapping": mapping,
            "errors": errors[:20], "ok_paths": ok_paths}


async def migrate_local_to_s3() -> dict:
    """One-click: move all locally-stored uploads to S3 and re-point every reference.
    Safe: migrated files are served via the authenticated backend proxy, so images
    display on the site regardless of whether the bucket allows public access."""
    conf = await _s3_conf()
    if not conf:
        return {"ok": False, "error": "Enable and save AWS S3 (and pass Test Connection) before migrating."}
    import anyio
    health = await anyio.to_thread.run_sync(_sync_test_connection, conf)
    if not health.get("ok"):
        return {"ok": False, "error": health.get("error") or "S3 connection failed — run Test Connection first."}
    res = await anyio.to_thread.run_sync(_sync_migrate, conf)
    updated_refs = await _replace_urls_across_db(res["mapping"])
    updated_refs += await repair_s3_urls()
    removed = 0
    if res["migrated"] and not res["errors"]:
        for pth in res["ok_paths"]:
            try:
                Path(pth).unlink(missing_ok=True)
                removed += 1
            except Exception:  # noqa: BLE001
                pass
    return {"ok": len(res["errors"]) == 0, "migrated": res["migrated"], "total": res["total"],
            "updated_refs": updated_refs, "removed_local": removed, "errors": res["errors"]}


def _sync_fetch(conf: dict, key: str):
    """Authenticated GetObject → (bytes, content_type) or None."""
    import boto3
    from botocore.exceptions import ClientError, BotoCoreError
    from botocore.config import Config as BotoConfig
    client = boto3.client(
        "s3", region_name=conf["region"],
        aws_access_key_id=conf["key"], aws_secret_access_key=conf["secret"],
        config=BotoConfig(connect_timeout=4, read_timeout=15, retries={"max_attempts": 1}))
    try:
        obj = client.get_object(Bucket=conf["bucket"], Key=key)
        return obj["Body"].read(), (obj.get("ContentType") or "application/octet-stream")
    except (ClientError, BotoCoreError):
        return None


async def fetch_s3_object(key: str):
    """Serve an S3 object through the backend (used by GET /api/media/s3/{key})."""
    s = await get_settings()
    conf = _conf_from_integ(s.get("integrations", {}) or {})
    if not conf:
        return None
    import anyio
    return await anyio.to_thread.run_sync(_sync_fetch, conf, key)


async def repair_s3_urls() -> int:
    """Rewrite any raw public-S3 URLs already stored in the DB to the backend proxy
    form, so previously-uploaded images display even when the bucket is private."""
    conf = await _s3_conf()
    if not conf:
        return 0
    backend = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
    if conf.get("public_base"):
        return 0
    proxy = f"{backend}/api/media/s3/"
    prefixes = [
        f"https://{conf['bucket']}.s3.{conf['region']}.amazonaws.com/",
        f"https://{conf['bucket']}.s3.amazonaws.com/",
        f"https://s3.{conf['region']}.amazonaws.com/{conf['bucket']}/",
    ]
    return await _replace_urls_across_db({p: proxy for p in prefixes})
