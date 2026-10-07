import os
import jwt
from pathlib import Path
from dotenv import load_dotenv
from fastapi import Header, HTTPException, Depends
from config.database import db

load_dotenv(Path(__file__).parent.parent / '.env')
SECRET = os.environ.get("JWT_SECRET", "dev-secret")
ALGO = "HS256"


def create_token(uid: str, role: str, did: str = None, sid: str = None) -> str:
    payload = {"uid": uid, "role": role}
    if did:
        payload["did"] = did
    if sid:
        payload["sid"] = sid
    return jwt.encode(payload, SECRET, algorithm=ALGO)


async def issue_token(uid: str, role: str, did: str = None) -> str:
    """Login on any device/web starts a NEW session and revokes every other one."""
    import uuid
    sid = uuid.uuid4().hex
    await db.users.update_one({"id": uid}, {"$set": {"current_sid": sid}})
    return create_token(uid, role, did=did, sid=sid)


def _session_ok(user: dict, data: dict) -> bool:
    cur = user.get("current_sid")
    return not cur or data.get("sid") == cur


REVOKED = {"code": "device_revoked",
           "message": "You've been logged out because this account was logged in on another device."}


async def user_from_token(token: str):
    """Decode a JWT and return the user doc, or None. Used by SSE (query-param auth)."""
    if not token:
        return None
    try:
        data = jwt.decode(token, SECRET, algorithms=[ALGO])
    except Exception:
        return None
    user = await db.users.find_one({"id": data.get("uid")}, {"_id": 0})
    return user if user and _session_ok(user, data) else None


async def get_current_user(authorization: str = Header(None)) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.replace("Bearer ", "").strip()
    try:
        data = jwt.decode(token, SECRET, algorithms=[ALGO])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": data.get("uid")}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    # Single active session (all roles): a newer login anywhere revokes this token.
    if not _session_ok(user, data):
        raise HTTPException(status_code=401, detail=REVOKED)
    # Legacy partner device lock for tokens issued before session ids existed.
    if not data.get("sid") and user.get("role") == "partner" and user.get("registered_device_id"):
        if data.get("did") != user.get("registered_device_id"):
            raise HTTPException(status_code=401, detail=REVOKED)
    return user


async def get_current_user_optional(authorization: str = Header(None)):
    """Like get_current_user but returns None (never 401) when there is no / an
    invalid token. Used by endpoints that work for guests too (e.g. cart pricing
    preview) so the storefront can quote a price before the customer logs in."""
    if not authorization:
        return None
    token = authorization.replace("Bearer ", "").strip()
    try:
        data = jwt.decode(token, SECRET, algorithms=[ALGO])
    except Exception:
        return None
    user = await db.users.find_one({"id": data.get("uid")}, {"_id": 0})
    return user if user and _session_ok(user, data) else None


def require_role(*roles):
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Forbidden for this role")
        return user
    return dep
