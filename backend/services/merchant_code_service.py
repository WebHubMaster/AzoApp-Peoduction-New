"""Merchant referral code — 7-char UNIQUE mixed (letters + digits), e.g. 'A3K9F2Q'.

A merchant gets one permanent code on account creation. A partner may enter this
code during registration to be permanently linked to that merchant (shows up in
the merchant's dashboard, view-only). Distinct from partner_code (AZP+7 digits).
"""
import random
import re
from config.database import db

# 7 chars, at least one letter and one digit, uppercase alnum (no confusing 0/O/1/I)
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"
DIGITS = "23456789"
CODE_RE = re.compile(r"^[A-Z0-9]{7}$")


def _gen():
    # ensure mix: 4 letters + 3 digits then shuffle
    chars = random.choices(ALPHABET, k=4) + random.choices(DIGITS, k=3)
    random.shuffle(chars)
    return "".join(chars)


async def _unique_code():
    for _ in range(40):
        c = _gen()
        if not await db.users.find_one({"merchant_code": c}, {"_id": 0, "id": 1}):
            return c
    return _gen()


async def ensure_merchant_code(user: dict):
    """Assign a permanent merchant_code to a merchant if missing. Returns the code."""
    if not user or user.get("role") != "merchant":
        return user.get("merchant_code") if user else None
    code = user.get("merchant_code")
    if code and CODE_RE.match(str(code)):
        return code
    code = await _unique_code()
    await db.users.update_one({"id": user["id"]}, {"$set": {"merchant_code": code}})
    user["merchant_code"] = code
    return code


async def validate_code(code: str):
    """Return the merchant user dict for a valid code, else None."""
    if not code:
        return None
    code = str(code).strip().upper()
    if not CODE_RE.match(code):
        return None
    return await db.users.find_one(
        {"merchant_code": code, "role": "merchant"},
        {"_id": 0, "id": 1, "name": 1, "shop_name": 1, "merchant_code": 1, "phone": 1})


async def backfill():
    """Give every merchant without a valid code one."""
    try:
        cur = db.users.find({"role": "merchant"}, {"_id": 0, "id": 1, "merchant_code": 1})
        async for u in cur:
            if not (u.get("merchant_code") and CODE_RE.match(str(u.get("merchant_code")))):
                await db.users.update_one(
                    {"id": u["id"]}, {"$set": {"merchant_code": await _unique_code()}})
    except Exception:  # noqa: BLE001
        pass
