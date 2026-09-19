"""AzoApp Growth engine — Wallet Cashback + Scratch Cards + Referral card data.

Design goals (per product spec):
  * Reward is decided SERVER-SIDE at *issue* time and persisted, so refreshing the
    page, opening multiple tabs, or replaying the API can never change or duplicate it.
  * Claiming credits the real customer wallet (users.wallet_balance) AND writes a
    proper ledger row in `transactions` — exactly like the rest of the platform.
  * Everything (enable, eligibility, amounts, probabilities, limits, expiry) is read
    from admin configuration (`settings`) + the `scratch_rewards` pool collection.
"""
import random
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from config.database import db, now_iso, get_settings


def new_id():
    return str(uuid4())


def _parse(dt):
    if not dt:
        return None
    try:
        return datetime.fromisoformat(str(dt).replace("Z", "+00:00"))
    except Exception:
        return None


def _now():
    return datetime.now(timezone.utc)


def _today_key():
    return _now().strftime("%Y-%m-%d")


# --------------------------------------------------------------------------- config
async def growth_config() -> dict:
    s = await get_settings() or {}
    return {
        "referral": s.get("referral") or {},
        "cashback": s.get("cashback") or {},
        "packages": s.get("packages") or {},
        "pwa": s.get("pwa") or {},
    }


def _campaign_live(cfg: dict) -> bool:
    start, end = _parse(cfg.get("campaign_start")), _parse(cfg.get("campaign_end"))
    now = _now()
    if start and now < start:
        return False
    if end and now > end:
        return False
    return True


# --------------------------------------------------------------------------- wallet
async def wallet_credit(user_id: str, amount: float, kind: str, note: str, ref: dict | None = None) -> None:
    """Idempotent-ish wallet credit: bumps balance + writes a ledger row."""
    amount = round(float(amount or 0), 2)
    if not user_id or amount <= 0:
        return
    await db.users.update_one({"id": user_id}, {"$inc": {"wallet_balance": amount}})
    doc = {"id": new_id(), "user_id": user_id, "amount": amount, "type": "credit",
           "kind": kind, "note": note, "created_at": now_iso()}
    if ref:
        doc.update(ref)
    await db.transactions.insert_one(doc)


async def wallet_debit(user_id: str, amount: float, kind: str, note: str, ref: dict | None = None) -> None:
    amount = round(float(amount or 0), 2)
    if not user_id or amount <= 0:
        return
    await db.users.update_one({"id": user_id}, {"$inc": {"wallet_balance": -amount}})
    doc = {"id": new_id(), "user_id": user_id, "amount": amount, "type": "debit",
           "kind": kind, "note": note, "created_at": now_iso()}
    if ref:
        doc.update(ref)
    await db.transactions.insert_one(doc)


# --------------------------------------------------------------------------- eligibility
async def _cashback_eligible(cfg: dict, customer_id: str, booking: dict) -> bool:
    if not cfg.get("enabled") or not cfg.get("scratch_enabled"):
        return False
    if not _campaign_live(cfg):
        return False
    total = float((booking.get("pricing") or {}).get("total") or booking.get("amount") or 0)
    if total < float(cfg.get("min_booking_amount") or 0):
        return False
    cats = cfg.get("eligible_categories") or []
    if cats and (booking.get("category_id") not in cats and booking.get("category_name") not in cats):
        return False
    cities = cfg.get("eligible_cities") or []
    if cities:
        city = ((booking.get("address") or {}).get("city") or "").strip()
        if city and city not in cities:
            return False
    # audience: all | new | repeat  (this booking is being completed now)
    audience = (cfg.get("audience") or "all").lower()
    if audience in ("new", "repeat"):
        done = await db.bookings.count_documents(
            {"customer_id": customer_id, "status": {"$in": ["completed", "paid"]}})
        if audience == "new" and done > 1:
            return False
        if audience == "repeat" and done <= 1:
            return False
    # per-customer cap
    cap = int(cfg.get("max_per_customer") or 0)
    if cap > 0:
        issued = await db.scratch_cards.count_documents({"user_id": customer_id})
        if issued >= cap:
            return False
    return True


# --------------------------------------------------------------------------- reward pick
async def _pick_reward(cfg: dict) -> dict:
    """Choose a reward server-side. Prefers the admin weighted pool; falls back to
    percent/fixed config; else 'Better luck next time'."""
    max_cb = float(cfg.get("max_cashback") or 0)
    pool = await db.scratch_rewards.find({"active": True}, {"_id": 0}).to_list(200)
    avail = []
    today = _today_key()
    for r in pool:
        mq = int(r.get("max_quantity") or 0)
        if mq > 0 and int(r.get("issued_count") or 0) >= mq:
            continue
        dl = int(r.get("daily_limit") or 0)
        if dl > 0 and int((r.get("issued_by_day") or {}).get(today) or 0) >= dl:
            continue
        w = float(r.get("weight") or 0)
        if w <= 0:
            continue
        avail.append(r)
    if avail:
        total_w = sum(float(r.get("weight") or 0) for r in avail)
        pick = random.uniform(0, total_w)
        acc = 0.0
        chosen = avail[-1]
        for r in avail:
            acc += float(r.get("weight") or 0)
            if pick <= acc:
                chosen = r
                break
        amt = round(float(chosen.get("amount") or 0), 2)
        if max_cb > 0:
            amt = min(amt, max_cb)
        await db.scratch_rewards.update_one(
            {"id": chosen["id"]},
            {"$inc": {"issued_count": 1, f"issued_by_day.{today}": 1}})
        return {"amount": amt, "reward_id": chosen["id"],
                "label": chosen.get("label") or (f"₹{amt:g} Cashback" if amt > 0 else "Better luck next time!"),
                "is_win": amt > 0}
    # fallback — percent / fixed
    typ = (cfg.get("type") or "pool").lower()
    amt = 0.0
    if typ == "percent":
        amt = round(float(cfg.get("percent") or 0), 2)  # caller may scale; kept simple
    elif typ == "fixed":
        amt = round(float(cfg.get("fixed") or 0), 2)
    if max_cb > 0 and amt > 0:
        amt = min(amt, max_cb)
    return {"amount": amt, "reward_id": None,
            "label": (f"₹{amt:g} Cashback" if amt > 0 else "Better luck next time!"),
            "is_win": amt > 0}


# --------------------------------------------------------------------------- scratch lifecycle
async def issue_for_booking(booking: dict) -> dict | None:
    """Called when a booking is completed. Creates one scratch card (idempotent by booking)."""
    customer_id = booking.get("customer_id")
    if not customer_id:
        return None
    cfg = (await growth_config())["cashback"]
    if not await _cashback_eligible(cfg, customer_id, booking):
        return None
    existing = await db.scratch_cards.find_one({"booking_id": booking.get("id")}, {"_id": 0})
    if existing:
        return existing
    reward = await _pick_reward(cfg)
    exp_days = int(cfg.get("expiry_days") or 0)
    expires_at = (_now() + timedelta(days=exp_days)).isoformat() if exp_days > 0 else None
    card = {
        "id": new_id(), "user_id": customer_id,
        "booking_id": booking.get("id"), "booking_code": booking.get("code"),
        "status": "available",              # available | scratched | claimed | expired | cancelled
        "reward_amount": reward["amount"], "reward_id": reward["reward_id"],
        "reward_label": reward["label"], "is_win": reward["is_win"],
        "issued_at": now_iso(), "scratched_at": None, "claimed_at": None,
        "expires_at": expires_at,
    }
    await db.scratch_cards.insert_one(card)
    try:
        from services.notification_service import notify
        await notify(customer_id, "You've unlocked a Scratch Card 🎁",
                     f"Scratch to reveal your reward on booking {booking.get('code','')}.",
                     link="/account?tab=wallet")
    except Exception:
        pass
    card.pop("_id", None)
    return card


def _expired(card: dict) -> bool:
    exp = _parse(card.get("expires_at"))
    return bool(exp and _now() > exp and card.get("status") in ("available", "scratched"))


# Scratched cards are kept for 30 days after they are scratched, then auto-deleted
# (product requirement #11). Claimed rewards remain in the wallet ledger; only the
# scratch-card record itself is removed so the customer's card wall stays fresh.
SCRATCHED_RETENTION_DAYS = 30


async def purge_old_scratched_cards(days: int = SCRATCHED_RETENTION_DAYS, user_id: str = None) -> int:
    """Delete scratched/claimed cards whose scratched_at is older than `days`.
    Runs on a startup sweep (all users) and lazily on each list_cards (per user)."""
    cutoff = (_now() - timedelta(days=days)).isoformat()
    q = {"status": {"$in": ["scratched", "claimed"]}, "scratched_at": {"$ne": None, "$lt": cutoff}}
    if user_id:
        q["user_id"] = user_id
    try:
        res = await db.scratch_cards.delete_many(q)
        return int(res.deleted_count or 0)
    except Exception:
        return 0


async def list_cards(user: dict) -> dict:
    # Auto-delete this user's scratched cards older than 30 days first.
    await purge_old_scratched_cards(user_id=user["id"])
    cards = await db.scratch_cards.find({"user_id": user["id"]}, {"_id": 0}).sort("issued_at", -1).to_list(200)
    out = []
    for c in cards:
        if _expired(c):
            await db.scratch_cards.update_one({"id": c["id"]}, {"$set": {"status": "expired"}})
            c["status"] = "expired"
        out.append(c)
    summary = {
        "total": len(out),
        "available": sum(1 for c in out if c["status"] == "available"),
        "unclaimed": sum(1 for c in out if c["status"] in ("available", "scratched")),
        "earned": round(sum(float(c.get("reward_amount") or 0) for c in out if c["status"] == "claimed"), 2),
    }
    return {"cards": out, "summary": summary}


async def scratch_card(user: dict, card_id: str) -> dict:
    c = await db.scratch_cards.find_one({"id": card_id, "user_id": user["id"]}, {"_id": 0})
    if not c:
        return {"ok": False, "detail": "Scratch card not found"}
    if _expired(c):
        await db.scratch_cards.update_one({"id": card_id}, {"$set": {"status": "expired"}})
        return {"ok": False, "detail": "This scratch card has expired"}
    if c["status"] == "available":
        await db.scratch_cards.update_one({"id": card_id},
                                          {"$set": {"status": "scratched", "scratched_at": now_iso()}})
        c["status"] = "scratched"
        c["scratched_at"] = now_iso()
    return {"ok": True, "card": c}


async def claim_card(user: dict, card_id: str) -> dict:
    c = await db.scratch_cards.find_one({"id": card_id, "user_id": user["id"]}, {"_id": 0})
    if not c:
        return {"ok": False, "detail": "Scratch card not found"}
    if c["status"] == "claimed":
        return {"ok": True, "detail": "Already claimed", "card": c}
    if c["status"] in ("expired", "cancelled") or _expired(c):
        await db.scratch_cards.update_one({"id": card_id}, {"$set": {"status": "expired"}})
        return {"ok": False, "detail": "This scratch card has expired"}
    amount = round(float(c.get("reward_amount") or 0), 2)
    # Atomically flip to claimed only if not already claimed (guards replay/concurrent tabs).
    res = await db.scratch_cards.update_one(
        {"id": card_id, "status": {"$ne": "claimed"}},
        {"$set": {"status": "claimed", "claimed_at": now_iso()}})
    if res.modified_count != 1:
        fresh = await db.scratch_cards.find_one({"id": card_id}, {"_id": 0})
        return {"ok": True, "detail": "Already claimed", "card": fresh}
    if amount > 0:
        await wallet_credit(user["id"], amount, "cashback",
                            f"Scratch card cashback — booking {c.get('booking_code','')}",
                            ref={"scratch_card_id": card_id, "booking_id": c.get("booking_id")})
        try:
            from services.notification_service import notify
            await notify(user["id"], "Cashback credited 🎉",
                         f"₹{amount:g} added to your AzoApp wallet.",
                         link="/account?tab=wallet")
        except Exception:
            pass
    c["status"] = "claimed"
    c["claimed_at"] = now_iso()
    new_balance = (await db.users.find_one({"id": user["id"]}, {"wallet_balance": 1})).get("wallet_balance", 0)
    return {"ok": True, "card": c, "credited": amount, "wallet_balance": round(float(new_balance or 0), 2)}


async def on_booking_reversed(booking: dict) -> None:
    """Reverse claimed cashback if the underlying booking is cancelled/refunded."""
    bid = booking.get("id")
    if not bid:
        return
    card = await db.scratch_cards.find_one({"booking_id": bid}, {"_id": 0})
    if not card:
        return
    if card.get("status") == "claimed" and float(card.get("reward_amount") or 0) > 0:
        await wallet_debit(card["user_id"], float(card["reward_amount"]), "cashback_reversal",
                           f"Cashback reversed — booking {card.get('booking_code','')} was cancelled/refunded",
                           ref={"scratch_card_id": card["id"], "booking_id": bid})
    await db.scratch_cards.update_one({"id": card["id"]}, {"$set": {"status": "cancelled"}})


# ------------------------------------------------------------------ admin: scratch pool
async def admin_rewards_list() -> list:
    rows = await db.scratch_rewards.find({}, {"_id": 0}).sort("amount", 1).to_list(200)
    cards = await db.scratch_cards.find({}, {"_id": 0}).to_list(10000)
    total_weight = sum(float(r.get("weight") or 0) for r in rows if r.get("active"))
    issued = {}
    redeemed = {}
    for c in cards:
        key = c.get("reward_id") or f"amt:{c.get('reward_amount')}"
        issued[key] = issued.get(key, 0) + 1
        if c.get("status") == "claimed":
            redeemed[key] = redeemed.get(key, 0) + 1
    for r in rows:
        i = issued.get(r.get("id"), 0) or issued.get(f"amt:{r.get('amount')}", 0)
        rd = redeemed.get(r.get("id"), 0) or redeemed.get(f"amt:{r.get('amount')}", 0)
        mq = int(r.get("max_quantity") or 0)
        r["issued"] = int(i)
        r["redeemed"] = int(rd)
        r["remaining"] = max(mq - int(i), 0) if mq else None
        r["probability"] = round((float(r.get("weight") or 0) / total_weight * 100), 1) if total_weight else 0.0
    return rows


async def admin_reward_save(admin: dict, data: dict, reward_id: str = None) -> dict:
    doc = {
        "amount": round(float(data.get("amount") or 0), 2),
        "label": data.get("label") or "",
        "weight": float(data.get("weight") or 1),
        "max_quantity": int(data.get("max_quantity") or 0),
        "daily_limit": int(data.get("daily_limit") or 0),
        "active": bool(data.get("active", True)),
        "updated_at": now_iso(),
    }
    if reward_id:
        await db.scratch_rewards.update_one({"id": reward_id}, {"$set": doc})
        await _audit(admin, "scratch_reward_update", reward_id, None, doc)
    else:
        doc.update({"id": new_id(), "issued_count": 0, "issued_by_day": {}, "created_at": now_iso()})
        await db.scratch_rewards.insert_one(doc)
        doc.pop("_id", None)
        await _audit(admin, "scratch_reward_create", doc["id"], None, doc)
    r = await db.scratch_rewards.find_one({"id": reward_id or doc["id"]}, {"_id": 0})
    return r


async def admin_reward_delete(admin: dict, reward_id: str) -> dict:
    await db.scratch_rewards.delete_one({"id": reward_id})
    await _audit(admin, "scratch_reward_delete", reward_id, None, None)
    return {"ok": True}


async def admin_cards(status: str = "", limit: int = 200) -> list:
    q = {"status": status} if status else {}
    return await db.scratch_cards.find(q, {"_id": 0}).sort("issued_at", -1).to_list(limit)


async def admin_scratch_stats() -> dict:
    cards = await db.scratch_cards.find({}, {"_id": 0}).to_list(10000)
    claimed = [c for c in cards if c.get("status") == "claimed"]
    return {
        "issued": len(cards),
        "claimed": len(claimed),
        "available": sum(1 for c in cards if c.get("status") == "available"),
        "expired": sum(1 for c in cards if c.get("status") == "expired"),
        "total_credited": round(sum(float(c.get("reward_amount") or 0) for c in claimed), 2),
    }


async def admin_referrals(limit: int = 500) -> dict:
    refs = await db.referrals.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    s = await get_settings() or {}
    referee_discount = float((s.get("referral") or {}).get("referee_discount") or 0)
    credited = [r for r in refs if r.get("referrer_credited")]
    _label = {"first_booking": "Successful", "joined": "Pending", "pending": "Pending",
              "cancelled": "Cancelled", "expired": "Expired", "reward_paid": "Reward Paid"}
    for r in refs:
        r["friend_discount"] = referee_discount
        r["reward_status"] = "paid" if r.get("referrer_credited") else "pending"
        st = r.get("status") or "joined"
        r["status_label"] = _label.get(st, st.replace("_", " ").title())
    total = len(refs)
    return {
        "referrals": refs,
        "summary": {
            "total": total,
            "successful": len(credited),
            "pending": total - len(credited),
            "cancelled": sum(1 for r in refs if r.get("status") == "cancelled"),
            "expired": sum(1 for r in refs if r.get("status") == "expired"),
            "rewards_paid": round(sum(float(r.get("reward_amount") or 0) for r in credited), 2),
            "conversion_rate": round(len(credited) / total * 100, 1) if total else 0.0,
        },
    }


# --------------------------------------------------------------- premium analytics
def _day_range(date_from, date_to):
    a = _parse(date_from) or (_now() - timedelta(days=30))
    b = _parse(date_to) or _now()
    if a.tzinfo is None:
        a = a.replace(tzinfo=timezone.utc)
    if b.tzinfo is None:
        b = b.replace(tzinfo=timezone.utc)
    # normalise to full-day boundaries so date-only inputs include the whole day
    a = a.replace(hour=0, minute=0, second=0, microsecond=0)
    b = b.replace(hour=23, minute=59, second=59, microsecond=999999)
    return a, b


def _in_range(dt, a, b) -> bool:
    d = _parse(dt)
    if not d:
        return False
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return a <= d <= b


def _bucket_days(a, b):
    days = []
    cur = a.date()
    end = b.date()
    while cur <= end:
        days.append(cur.isoformat())
        cur = cur + timedelta(days=1)
    # cap huge ranges to last 120 buckets
    return days[-120:]


async def cashback_transactions(limit: int = 2000) -> dict:
    cards = await db.scratch_cards.find({}, {"_id": 0}).sort("issued_at", -1).to_list(limit)
    uids = list({c.get("user_id") for c in cards if c.get("user_id")})
    users = await db.users.find({"id": {"$in": uids}}, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(len(uids)) if uids else []
    umap = {u["id"]: u for u in users}
    out = []
    for c in cards:
        u = umap.get(c.get("user_id")) or {}
        amt = float(c.get("reward_amount") or 0)
        out.append({
            "id": c.get("id"),
            "customer_id": c.get("user_id"),
            "customer_name": u.get("name") or "—",
            "customer_phone": u.get("phone") or "",
            "booking_id": c.get("booking_id"),
            "booking_code": c.get("booking_code") or "",
            "reward": c.get("reward_label") or (f"₹{int(amt)}" if amt else "Better luck"),
            "reward_amount": amt,
            "reward_type": "cashback" if amt > 0 else "none",
            "status": c.get("status"),
            "issued_at": c.get("issued_at"),
            "claimed_at": c.get("claimed_at"),
            "expires_at": c.get("expires_at"),
        })
    return {"transactions": out, "stats": await admin_scratch_stats()}


async def pwa_analytics(limit: int = 2000) -> dict:
    try:
        tokens = await db.device_tokens.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    except Exception:
        tokens = []
    uids = list({t.get("user_id") for t in tokens if t.get("user_id")})
    users = await db.users.find({"id": {"$in": uids}}, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(len(uids)) if uids else []
    umap = {u["id"]: u for u in users}
    devices = []
    for t in tokens:
        u = umap.get(t.get("user_id")) or {}
        devices.append({
            "id": t.get("id") or t.get("token", "")[:12],
            "customer_id": t.get("user_id"),
            "customer_name": u.get("name") or "—",
            "device": t.get("device") or t.get("device_name") or "—",
            "browser": t.get("browser") or "—",
            "os": t.get("os") or t.get("platform") or "—",
            "status": t.get("install_status") or ("installed" if t.get("installed") else "active"),
            "first_seen": t.get("created_at"),
            "installed_at": t.get("installed_at"),
            "last_active": t.get("last_seen") or t.get("updated_at"),
        })
    installed = sum(1 for d in devices if d["status"] == "installed")
    return {
        "devices": devices,
        "summary": {
            "installs": installed,
            "prompt_views": len(devices),
            "conversion_rate": round(installed / len(devices) * 100, 1) if devices else 0.0,
            "active_users": sum(1 for d in devices if d["status"] in ("installed", "active")),
        },
    }


async def growth_insights(date_from: str = "", date_to: str = "") -> dict:
    a, b = _day_range(date_from, date_to)
    refs = await db.referrals.find({}, {"_id": 0}).to_list(5000)
    cards = await db.scratch_cards.find({}, {"_id": 0}).to_list(20000)
    rewards = await db.scratch_rewards.find({}, {"_id": 0}).sort("amount", 1).to_list(200)

    refs_r = [r for r in refs if _in_range(r.get("created_at"), a, b)]
    cards_r = [c for c in cards if _in_range(c.get("issued_at"), a, b)]
    credited = [r for r in refs_r if r.get("referrer_credited")]
    claimed = [c for c in cards_r if c.get("status") == "claimed"]
    opened = [c for c in cards_r if c.get("scratched_at") or c.get("status") in ("claimed", "scratched")]
    expired = [c for c in cards_r if c.get("status") == "expired"]

    days = _bucket_days(a, b)
    day_idx = {d: i for i, d in enumerate(days)}

    def _dk(dt):
        d = _parse(dt)
        if not d:
            return None
        return d.date().isoformat()

    ref_perf = [{"date": d, "referrals": 0, "successful": 0, "pending": 0} for d in days]
    for r in refs_r:
        k = _dk(r.get("created_at"))
        if k in day_idx:
            row = ref_perf[day_idx[k]]
            row["referrals"] += 1
            if r.get("referrer_credited"):
                row["successful"] += 1
            else:
                row["pending"] += 1

    cb_perf = [{"date": d, "issued": 0, "redeemed": 0, "expired": 0} for d in days]
    for c in cards_r:
        k = _dk(c.get("issued_at"))
        if k in day_idx:
            row = cb_perf[day_idx[k]]
            row["issued"] += 1
            if c.get("status") == "claimed":
                row["redeemed"] += 1
            elif c.get("status") == "expired":
                row["expired"] += 1

    # reward distribution (issued count per reward tier within range)
    issued_by_key = {}
    for c in cards_r:
        key = c.get("reward_id") or f"amt:{c.get('reward_amount')}"
        issued_by_key[key] = issued_by_key.get(key, 0) + 1
    reward_dist = []
    for r in rewards:
        cnt = issued_by_key.get(r.get("id"), 0) or issued_by_key.get(f"amt:{r.get('amount')}", 0)
        reward_dist.append({"label": r.get("label") or (f"₹{int(r.get('amount') or 0)}"),
                            "amount": float(r.get("amount") or 0), "issued": int(cnt)})

    # pwa trend (device_tokens empty -> zeros)
    try:
        tokens = await db.device_tokens.find({}, {"_id": 0}).to_list(20000)
    except Exception:
        tokens = []
    pwa_trend = [{"date": d, "prompt_views": 0, "installs": 0} for d in days]
    for t in tokens:
        k = _dk(t.get("created_at"))
        if k in day_idx:
            row = pwa_trend[day_idx[k]]
            row["prompt_views"] += 1
            if t.get("installed") or t.get("install_status") == "installed":
                row["installs"] += 1

    funnel = [
        {"stage": "Referral Shared", "count": len(refs_r)},
        {"stage": "Referral Clicked", "count": sum(1 for r in refs_r if r.get("referee_id"))},
        {"stage": "Booking Created", "count": sum(1 for r in refs_r if r.get("booking_code") or r.get("booking_id"))},
        {"stage": "Booking Completed", "count": sum(1 for r in refs_r if r.get("status") == "first_booking")},
        {"stage": "Reward Credited", "count": len(credited)},
    ]

    kpis = {
        "total_referrals": len(refs_r),
        "referral_conversion": round(len(credited) / len(refs_r) * 100, 1) if refs_r else 0.0,
        "successful_referrals": len(credited),
        "rewards_paid": round(sum(float(r.get("reward_amount") or 0) for r in credited), 2),
        "cashback_issued": len(cards_r),
        "cashback_redeemed": round(sum(float(c.get("reward_amount") or 0) for c in claimed), 2),
        "scratch_opened": len(opened),
        "pwa_installs": sum(1 for t in tokens if t.get("installed") or t.get("install_status") == "installed"),
    }
    return {
        "range": {"from": a.date().isoformat(), "to": b.date().isoformat()},
        "kpis": kpis,
        "referral_performance": ref_perf,
        "reward_distribution": reward_dist,
        "cashback_performance": cb_perf,
        "pwa_trend": pwa_trend,
        "funnel": funnel,
    }


async def _audit(admin: dict, action: str, entity_id: str, old, new) -> None:
    try:
        await db.growth_audit.insert_one({
            "id": new_id(), "actor_id": (admin or {}).get("id"),
            "actor_name": (admin or {}).get("name") or "Admin",
            "action": action, "entity": "growth", "entity_id": entity_id,
            "old": old, "new": new, "created_at": now_iso(),
        })
    except Exception:
        pass


async def audit_trail(limit: int = 200) -> list:
    return await db.growth_audit.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
