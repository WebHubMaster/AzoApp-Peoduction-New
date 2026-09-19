"""Permanent unique provider code — format: AZP + 7 digits (e.g. AZP8467986).
Generated once, never changes, never editable. 10 characters total.
"""
import random
import re
from config.database import db

CODE_RE = re.compile(r"^AZP\d{7}$")


def _gen():
    return "AZP" + "".join(random.choices("0123456789", k=7))


async def _unique_code():
    for _ in range(30):
        c = _gen()
        if not await db.users.find_one({"partner_code": c}, {"_id": 0, "id": 1}):
            return c
    # extremely unlikely fallback
    return "AZP" + str(random.randint(1000000, 9999999))


async def ensure_code(user: dict):
    """Assign a permanent code to a partner if missing / malformed. Returns the code."""
    if not user or user.get("role") != "partner":
        return user.get("partner_code") if user else None
    code = user.get("partner_code")
    if code and CODE_RE.match(str(code)):
        return code
    code = await _unique_code()
    await db.users.update_one({"id": user["id"]}, {"$set": {"partner_code": code}})
    user["partner_code"] = code
    return code


async def backfill():
    """Give every partner without a valid permanent code one."""
    try:
        cur = db.users.find({"role": "partner"}, {"_id": 0, "id": 1, "partner_code": 1})
        async for u in cur:
            if not (u.get("partner_code") and CODE_RE.match(str(u.get("partner_code")))):
                await db.users.update_one({"id": u["id"]}, {"$set": {"partner_code": await _unique_code()}})
    except Exception:  # noqa: BLE001
        pass
