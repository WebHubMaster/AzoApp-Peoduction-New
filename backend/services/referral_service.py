"""Refer-a-friend engine.

Each customer has a stable referral code (AZO + last 4 of phone). A referred
friend links themselves via POST /referral/apply. When that friend completes
their FIRST booking, the referrer's wallet is credited (idempotent).
"""
from uuid import uuid4
from config.database import db, now_iso, get_settings


def new_id():
    return str(uuid4())


async def _reward_amount() -> float:
    try:
        s = await get_settings()
        return float(((s or {}).get("referral") or {}).get("reward_amount") or 100)
    except Exception:
        return 100.0


async def _referral_cfg() -> dict:
    try:
        r = (await get_settings() or {}).get("referral") or {}
    except Exception:
        r = {}
    return {
        "enabled": r.get("enabled", True),
        "reward_amount": float(r.get("reward_amount") or 100),
        "referee_discount": float(r.get("referee_discount") or r.get("reward_amount") or 100),
    }


def code_for(user: dict) -> str:
    phone = (user or {}).get("phone") or ""
    return "AZO" + (phone[-4:] or "0000")


async def _ensure_code(user: dict) -> str:
    code = user.get("referral_code") or code_for(user)
    if user.get("referral_code") != code:
        await db.users.update_one({"id": user["id"]}, {"$set": {"referral_code": code}})
    return code


async def get_summary(user: dict) -> dict:
    code = await _ensure_code(user)
    cfg = await _referral_cfg()
    reward = cfg["reward_amount"]
    refs = await db.referrals.find({"referrer_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    joined = len(refs)
    first_booking = sum(1 for r in refs if r.get("referrer_credited"))
    earned = round(sum(float(r.get("reward_amount") or 0) for r in refs if r.get("referrer_credited")), 2)
    pending = round(sum(float(r.get("reward_amount") or 0) for r in refs if not r.get("referrer_credited")), 2)
    history = [{
        "id": r.get("id"),
        "name": r.get("referee_name") or "Friend",
        "date": r.get("created_at"),
        "status": "first_booking" if r.get("referrer_credited") else "joined",
        "reward": float(r.get("reward_amount") or 0),
        "payment_status": "paid" if r.get("referrer_credited") else "pending",
    } for r in refs]
    return {
        "code": code,
        "link": f"?fref={code}",
        "reward_amount": reward,
        "referee_discount": cfg["referee_discount"],
        "enabled": cfg["enabled"],
        "stats": {"invited": joined, "joined": joined, "first_booking": first_booking, "earned": earned, "pending": pending},
        "history": history,
    }


async def apply_code(user: dict, code: str) -> dict:
    code = (code or "").strip().upper()
    if not code:
        return {"ok": False, "detail": "Enter a referral code"}
    if code == code_for(user):
        return {"ok": False, "detail": "You can't use your own code"}
    referrer = await db.users.find_one({"referral_code": code, "role": "customer"}, {"_id": 0})
    if not referrer:
        # fall back to deterministic match on phone suffix
        last4 = code[3:]
        referrer = await db.users.find_one({"role": "customer", "phone": {"$regex": last4 + "$"}}, {"_id": 0})
        if referrer:
            await db.users.update_one({"id": referrer["id"]}, {"$set": {"referral_code": code}})
    if not referrer or referrer["id"] == user["id"]:
        return {"ok": False, "detail": "Invalid referral code"}
    existing = await db.referrals.find_one({"referee_id": user["id"]})
    if existing:
        return {"ok": False, "detail": "You have already used a referral code"}
    # If the referee already has completed bookings, they aren't a new user.
    booked = await db.bookings.count_documents({"customer_id": user["id"], "status": {"$in": ["completed", "paid"]}})
    reward = await _reward_amount()
    doc = {
        "id": new_id(), "referrer_id": referrer["id"], "referrer_name": referrer.get("name"),
        "referrer_code": code, "referee_id": user["id"], "referee_name": user.get("name"),
        "reward_amount": reward, "status": "joined", "referrer_credited": False,
        "eligible": booked == 0, "created_at": now_iso(),
    }
    await db.referrals.insert_one(doc)
    await db.users.update_one({"id": user["id"]}, {"$set": {"referred_by_customer": referrer["id"]}})
    return {"ok": True, "detail": f"Referral code applied! You & {referrer.get('name', 'your friend')} both earn on your first booking.", "reward_amount": reward}


async def reserve_referee_discount(user: dict, pricing: dict) -> dict | None:
    """If this customer was referred and this is their FIRST booking, reduce the
    charged total by the configured friend discount. Returns reservation info
    (caller marks it used after the booking is persisted) or None."""
    cfg = await _referral_cfg()
    if not cfg.get("enabled") or float(cfg.get("referee_discount") or 0) <= 0:
        return None
    ref = await db.referrals.find_one({
        "referee_id": user["id"],
        "referrer_credited": {"$ne": True},
        "referee_discount_used": {"$ne": True},
    })
    if not ref:
        return None
    # First booking only — no prior bookings for this customer.
    prior = await db.bookings.count_documents({"customer_id": user["id"]})
    if prior > 0:
        return None
    net = float(pricing.get("taxable") if pricing.get("taxable") is not None else pricing.get("total") or 0)
    if net <= 1:
        return None
    disc = round(min(float(cfg["referee_discount"]), net - 1), 2)
    if disc <= 0:
        return None
    from services.engines import PricingEngine
    from config.database import get_settings
    settings = await get_settings()
    pricing["referral_discount"] = disc
    PricingEngine.finalize(pricing, settings.get("gst_pct", 0))
    return {"referral_id": ref["id"], "amount": disc}


async def mark_referee_discount_used(referral_id: str, booking_id: str, amount: float) -> None:
    await db.referrals.update_one({"id": referral_id}, {"$set": {
        "referee_discount_used": True, "referee_discount_amount": round(float(amount or 0), 2),
        "referee_discount_booking": booking_id, "referee_discount_at": now_iso(),
    }})


async def on_booking_completed(customer_id: str, booking: dict) -> None:
    if not customer_id:
        return
    ref = await db.referrals.find_one({"referee_id": customer_id, "referrer_credited": {"$ne": True}})
    if not ref:
        return
    amount = round(float(ref.get("reward_amount") or 0), 2)
    if amount <= 0:
        return
    referrer_id = ref["referrer_id"]
    note = f"Referral reward — {ref.get('referee_name') or 'your friend'}'s first booking ({booking.get('code', '')})"
    await db.users.update_one({"id": referrer_id}, {"$inc": {"wallet_balance": amount}})
    await db.transactions.insert_one({
        "id": new_id(), "user_id": referrer_id, "amount": amount, "type": "credit",
        "kind": "referral_bonus", "note": note, "created_at": now_iso(),
    })
    await db.referrals.update_one({"id": ref["id"]}, {"$set": {
        "referrer_credited": True, "status": "first_booking",
        "credited_at": now_iso(), "booking_code": booking.get("code"),
    }})
    try:
        from services.notification_service import notify
        await notify(referrer_id, "Referral reward credited 🎉",
                     f"₹{amount} added to your wallet — {ref.get('referee_name') or 'your friend'} completed their first booking!",
                     link="/account", sms_text=False)
    except Exception:
        pass
