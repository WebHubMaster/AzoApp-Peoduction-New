"""Check-in selfie ↔ KYC live-photo face match using the admin-configured vision LLM
(Integration Center → OCR provider/model/key). Never blocks check-in: runs in the
background, stores the verdict on booking.checkin.face_match and alerts admins on mismatch."""
import base64
import json
import re
import logging
import httpx
import litellm
from config.database import db, now_iso
from services.ocr_service import _ocr_config
from services.storage_service import UPLOAD_DIR, fetch_s3_object

log = logging.getLogger("azoapp")

_PROMPT = (
    "You are a strict identity-verification assistant. Image 1 is a person's KYC registration "
    "photo. Image 2 is a live selfie taken today at a job site. Decide if both show the SAME person "
    "(ignore lighting, angle, beard/hair changes, glasses, cap, mirroring). If either image has no "
    "clear human face, say so. Respond ONLY with compact JSON: "
    '{"same_person": true|false, "confidence": 0-100, "face_found": true|false, "reason": "<max 15 words>"}'
)
MISMATCH_MIN_CONFIDENCE = 60


async def _load_bytes(url: str):
    url = (url or "").strip()
    if not url:
        return None
    if url.startswith("data:"):
        head, _, b64 = url.partition(",")
        return base64.b64decode(b64), (head[5:].split(";")[0] or "image/jpeg")
    clean = url.split("?")[0]
    if "/api/media/file/" in clean:
        p = UPLOAD_DIR / clean.split("/api/media/file/", 1)[1]
        if p.is_file():
            return p.read_bytes(), "image/jpeg"
    if "/api/media/s3/" in clean:
        got = await fetch_s3_object(clean.split("/api/media/s3/", 1)[1])
        if got:
            return got
    if clean.startswith("http"):
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as c:
            r = await c.get(url)
            if r.status_code == 200 and r.content:
                return r.content, (r.headers.get("content-type") or "image/jpeg").split(";")[0]
    return None


def _data_uri(raw: bytes, mime: str) -> str:
    if not mime.startswith("image/"):
        mime = "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(raw).decode()}"


def _parse(text: str) -> dict:
    m = re.search(r"\{.*\}", text or "", re.S)
    return json.loads(m.group(0)) if m else {}


async def compare_faces(kyc_url: str, selfie_url: str) -> dict:
    """Returns {status: match|mismatch|unverified, confidence, reason, provider}."""
    cfg = await _ocr_config()
    if not cfg["enabled"]:
        return {"status": "unverified", "reason": "Vision AI is turned off — enable it in Integration Center → Vision AI (OCR & Face Match)", "setup_required": True}
    if not cfg["api_key"]:
        return {"status": "unverified", "reason": "Vision AI not configured — add an API key in Integration Center → Vision AI (OCR & Face Match)", "setup_required": True}
    if not kyc_url:
        return {"status": "unverified", "reason": "No KYC live photo on file"}
    try:
        a, b = await _load_bytes(kyc_url), await _load_bytes(selfie_url)
        if not a or not b:
            return {"status": "unverified", "reason": "Could not load KYC photo or selfie"}
        messages = [{"role": "user", "content": [
            {"type": "text", "text": _PROMPT},
            {"type": "image_url", "image_url": {"url": _data_uri(*a)}},
            {"type": "image_url", "image_url": {"url": _data_uri(*b)}},
        ]}]
        resp = await litellm.acompletion(model=cfg["model"], messages=messages, api_key=cfg["api_key"], temperature=0)
        out = _parse(resp.choices[0].message.content or "")
        conf = int(float(out.get("confidence") or 0))
        if out.get("face_found") is False:
            return {"status": "mismatch", "confidence": conf, "reason": out.get("reason") or "No clear face found", "provider": cfg["provider"]}
        same = bool(out.get("same_person"))
        status = "match" if same else ("mismatch" if conf >= MISMATCH_MIN_CONFIDENCE else "unverified")
        return {"status": status, "confidence": conf, "reason": (out.get("reason") or "")[:160], "provider": cfg["provider"]}
    except Exception as e:  # noqa: BLE001
        log.warning("face match failed: %s", e)
        return {"status": "unverified", "reason": f"Face check error: {str(e)[:120]}"}


async def kyc_photo_for(partner_id: str) -> str:
    prof = await db.partner_profiles.find_one({"user_id": partner_id}, {"_id": 0, "basic.live_photo_url": 1}) or {}
    url = ((prof.get("basic") or {}).get("live_photo_url") or "").strip()
    if url:
        return url
    u = await db.users.find_one({"id": partner_id}, {"_id": 0, "live_photo_url": 1, "photo": 1}) or {}
    return (u.get("live_photo_url") or u.get("photo") or "").strip()


async def _alert_recipients() -> list:
    """Admins + staff whose role can view bookings (RBAC respected)."""
    from services.rbac_service import effective_permissions
    out = []
    for u in await db.users.find({"role": {"$in": ["admin", "staff"]}, "is_active": {"$ne": False}},
                                 {"_id": 0, "id": 1, "role": 1, "system_role_id": 1, "system_role": 1}).to_list(200):
        perms, sup = await effective_permissions(u)
        if sup or (perms.get("bookings") or {}).get("view"):
            out.append(u["id"])
    return out


async def run_checkin_face_match(booking_id: str, partner: dict, selfie_url: str) -> dict:
    prev = ((await db.bookings.find_one({"id": booking_id}, {"_id": 0, "checkin.face_match.status": 1}) or {})
            .get("checkin") or {}).get("face_match") or {}
    kyc = await kyc_photo_for(partner["id"])
    res = await compare_faces(kyc, selfie_url)
    res.update({"kyc_photo_url": kyc, "checked_at": now_iso()})
    upd = {"checkin.face_match": res, "face_mismatch": res["status"] == "mismatch"}
    await db.bookings.update_one({"id": booking_id, "checkin.selfie_url": selfie_url}, {"$set": upd})
    if res["status"] == "mismatch" and prev.get("status") != "mismatch":
        await db.users.update_one({"id": partner["id"]}, {"$inc": {"face_mismatch_count": 1}, "$set": {"last_face_mismatch_at": now_iso()}})
        b = await db.bookings.find_one({"id": booking_id}, {"_id": 0, "code": 1, "service_name": 1}) or {}
        from services.notification_service import notify
        title = "⚠ Face mismatch at check-in"
        body = f"{partner.get('name') or 'Partner'} · #{b.get('code', '')} {b.get('service_name', '')} — selfie doesn't match KYC photo ({res.get('confidence', 0)}% confidence)."
        link = f"/admin?tab=bookings&booking={booking_id}"
        sent = 0
        for uid in await _alert_recipients():
            try:
                await notify(uid, title, body, link=link, event="face_mismatch",
                             data={"type": "face_mismatch", "booking_id": booking_id, "booking_code": b.get("code"),
                                   "partner_id": partner["id"], "partner_name": partner.get("name"),
                                   "confidence": res.get("confidence"), "link": link}, image=selfie_url)
                sent += 1
            except Exception as e:  # noqa: BLE001
                log.warning("face mismatch notify failed: %s", e)
        res["alerted"] = sent
    return res
