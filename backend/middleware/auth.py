import os
import jwt
from pathlib import Path
from dotenv import load_dotenv
from fastapi import Header, HTTPException, Depends
from config.database import db

load_dotenv(Path(__file__).parent.parent / '.env')
SECRET = os.environ.get("JWT_SECRET", "dev-secret")
ALGO = "HS256"


def create_token(uid: str, role: str) -> str:
    return jwt.encode({"uid": uid, "role": role}, SECRET, algorithm=ALGO)


async def user_from_token(token: str):
    """Decode a JWT and return the user doc, or None. Used by SSE (query-param auth)."""
    if not token:
        return None
    try:
        data = jwt.decode(token, SECRET, algorithms=[ALGO])
    except Exception:
        return None
    return await db.users.find_one({"id": data.get("uid")}, {"_id": 0})


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
    return await db.users.find_one({"id": data.get("uid")}, {"_id": 0})


def require_role(*roles):
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Forbidden for this role")
        return user
    return dep
