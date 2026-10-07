"""Core engine for recurring subscription bookings (Maid & future recurring
categories: Cook, Nanny, Babysitter, Caretaker, Driver, Housekeeping...).

Financial model — IDENTICAL to a normal service booking (services.engines.PricingEngine):
  gross              = plan price (the service amount, commissionable in full)
  commission_amount  = gross × commission_pct          (platform commission)
  partner_allocation = gross − commission_amount        (MAX maid earning; NEVER taxed)
  platform_fee       = fixed platform fee, charged to the customer ON TOP
  tax_amount (GST)   = (commission_amount + platform_fee) × gst_pct   (collected from
                       the customer on top; remitted to govt, NOT platform income)
  total_payable      = gross + platform_fee + GST       (what the customer pays upfront)
  per_day_earning    = partner_allocation / working_days

Commission %, GST, allocation, platform fee, working_days and per-day earning are
SNAPSHOTTED on the subscription at booking time — later admin changes never affect it.

Daily accrual on the generated schedule:
  completed (original)      -> +per_day to the assigned maid
  replacement_completed     -> +per_day to the replacement maid (original earns nothing)
  maid_absent               -> +per_day to platform (absent adjustment)
  weekly_off                -> nothing (agreed off; NOT an absence)
  customer_cancel           -> nothing to maid; per_day retained by platform (refund policy)
"""
import random
import string
from datetime import date, datetime, timedelta, timezone

from config.database import db, now_iso, get_settings
from models.user import new_id
from models.subscription import PLAN_DEFAULT_DURATION, DAY_STATUSES
from services import money

_CODE_ALPHABET = string.ascii_uppercase + string.digits


async def _unique_code(prefix="SUB", length=6):
    for _ in range(1000):
        code = prefix + "".join(random.choices(_CODE_ALPHABET, k=length))
        if not await db.subscriptions.find_one({"code": code}, {"_id": 1}):
            return code
    return prefix + "".join(random.choices(_CODE_ALPHABET, k=length + 3))


def _parse_date(d):
    if isinstance(d, date):
        return d
    s = str(d or "")[:10]
    return datetime.strptime(s, "%Y-%m-%d").date()


def haversine_m(a, b) -> float:
    """Great-circle distance in METERS between (lat,lng) tuples."""
    from math import radians, sin, cos, asin, sqrt
    lat1, lon1 = radians(a[0]), radians(a[1])
    lat2, lon2 = radians(b[0]), radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * 6371000.0 * asin(sqrt(h))


# Max distance (metres) between the maid's GPS and the customer's home for a valid
# location-based attendance.
ATTENDANCE_RADIUS_M = 200


def commission_pct_for(settings: dict) -> float:
    """Resolve the platform commission % applied to subscriptions — IDENTICAL to a
    normal service booking (services.engines.PricingEngine.commission_pct):
      • an explicit admin override (commission.subscription_commission_pct) wins, else
      • 100 − partner share %  (the SAME category-wise rule a normal booking uses).
    We deliberately do NOT fall back to platform_pct, which can diverge from partner_pct
    and would make the subscription total differ from the normal-booking quote."""
    cm = settings.get("commission", {}) or {}
    val = cm.get("subscription_commission_pct")
    if val not in (None, ""):
        return float(val or 0)
    partner_pct = cm.get("partner_pct")
    if partner_pct not in (None, ""):
        return round(max(0.0, 100.0 - float(partner_pct)), 4)
    return float(cm.get("platform_pct", settings.get("platform_commission_pct", 20)) or 0)


def resolve_plan(service: dict, plan_type: str) -> dict:
    """Find the admin-configured plan for a plan_type on a service, else synthesize a
    default from the service base price + default duration so plans still work."""
    plans = service.get("subscription_plans") or []
    for p in plans:
        if str(p.get("plan_type")).lower() == plan_type.lower():
            return dict(p)
    # Fallback: derive from base price so a service marked subscription without an
    # explicit plan row still yields a usable plan.
    base = float(service.get("discounted_price") or service.get("base_price") or 0)
    return {"plan_type": plan_type, "label": plan_type.title(), "price": base,
            "duration_days": PLAN_DEFAULT_DURATION.get(plan_type, 30), "weekly_offs": [6]}


def _plan_offs(plan: dict, override):
    if override is not None:
        return sorted({int(x) for x in override})
    offs = plan.get("weekly_offs")
    if offs is None:
        offs = [6]  # Sunday default
    return sorted({int(x) for x in offs})


def build_schedule(start: date, duration_days: int, weekly_offs: list) -> list:
    """Generate one entry per calendar day; a day whose weekday is in weekly_offs is
    an agreed off (no earning), everything else is a working day. Each working day
    carries a 4-digit start OTP that the customer shares with the maid on arrival
    (service-session flow: start → in_progress → complete)."""
    offs = set(weekly_offs or [])
    schedule = []
    for i in range(int(duration_days or 1)):
        d = start + timedelta(days=i)
        wd = d.weekday()
        off = wd in offs
        schedule.append({
            "date": d.isoformat(),
            "weekday": wd,
            "status": "weekly_off" if off else "scheduled",
            "earning": 0.0,
            "served_by": None,           # partner id credited for this day
            "replacement_partner_id": None,
            "note": "",
            "marked_by": None,
            "marked_at": None,
            "otp": None if off else f"{random.randint(1000, 9999)}",
            "started_at": None,
            "completed_at": None,
            "proof_photo": None,
        })
    return schedule


async def ensure_day_otps(sub: dict) -> dict:
    """Backfill start OTPs on subscriptions created before the service-session flow."""
    schedule = sub.get("schedule") or []
    changed = False
    for d in schedule:
        if d.get("status") in ("scheduled", "in_progress") and not d.get("otp"):
            d["otp"] = f"{random.randint(1000, 9999)}"
            changed = True
    if changed:
        await db.subscriptions.update_one({"id": sub["id"]}, {"$set": {"schedule": schedule}})
    return sub


def strip_otps_for_partner(sub: dict) -> dict:
    """Start OTPs belong to the customer — never expose them to the partner app."""
    s = dict(sub)
    s["schedule"] = [{k: v for k, v in d.items() if k != "otp"} for d in (sub.get("schedule") or [])]
    return s


def compute_financials(gross: float, commission_pct: float, gst_pct: float,
                       working_days: int, platform_fee: float = 0.0) -> dict:
    """Price a subscription plan EXACTLY like a normal service booking
    (services.engines.PricingEngine.finalize):
      • platform commission is levied on the FULL plan amount (service_net),
      • the maid earns  gross − commission  (tax is NEVER deducted from her share),
      • GST is levied ONLY on (commission + platform fee), collected from the customer
        ON TOP of the plan price — just like a normal booking,
      • total the customer pays = plan price + platform fee + GST.
    The returned `pricing` is a full normal-booking pricing object so the invoice and
    cancellation engines get every key they expect."""
    from services.engines import PricingEngine
    gross = money.money(gross)
    platform_fee = money.money(platform_fee or 0)
    pricing = PricingEngine.finalize({
        "base": gross, "addons_total": 0.0, "emergency_fee": 0.0, "surge": 0.0,
        "visiting_charge": 0.0, "convenience_fee": 0.0, "platform_fee": platform_fee,
        "discount": 0.0, "subtotal": gross,
        "commission_pct": float(commission_pct or 0),
    }, gst_pct)
    wd = max(1, int(working_days or 1))
    partner_allocation = money.money(pricing.get("partner_share") or 0)
    if partner_allocation < 0:
        partner_allocation = 0.0
    per_day = money.money(partner_allocation / wd)
    return {
        "gross": gross,
        "commission_pct": float(pricing.get("commission_pct") or 0),
        "commission_amount": money.money(pricing.get("platform_commission") or 0),
        "platform_fee": money.money(pricing.get("platform_fee") or 0),
        "tax_pct": float(pricing.get("gst_pct") or 0),
        "tax_amount": money.money(pricing.get("gst") or 0),
        "partner_allocation": partner_allocation,
        "working_days": wd,
        "per_day_earning": per_day,
        "total_payable": money.money(pricing.get("total") or 0),
        "pricing": pricing,
    }


async def plan_preview(service: dict, settings: dict) -> list:
    """For a subscription service, return each plan with a full financial preview so
    the customer app can show the SAME charge structure a normal booking uses
    (plan price + platform fee + GST on commission)."""
    out = []
    commission_pct = commission_pct_for(settings)
    gst_pct = float(settings.get("gst_pct") or 0)
    from services.engines import PricingEngine
    platform_fee = PricingEngine.platform_fee_amount(settings.get("business_config", {}) or {})
    for plan_type in ["daily", "weekly", "monthly", "quarterly", "yearly"]:
        # only expose plans the admin actually configured (or all if none configured)
        configured = service.get("subscription_plans") or []
        if configured and not any(str(p.get("plan_type")).lower() == plan_type for p in configured):
            continue
        plan = resolve_plan(service, plan_type)
        offs = _plan_offs(plan, None)
        duration = int(plan.get("duration_days") or PLAN_DEFAULT_DURATION.get(plan_type, 30))
        # working days = calendar days minus weekly-offs (or explicit override)
        wd_override = plan.get("working_days")
        if wd_override:
            working_days = int(wd_override)
        else:
            working_days = sum(1 for i in range(duration) if ((_parse_ref() + timedelta(days=i)).weekday() not in offs))
            working_days = max(1, working_days)
        fin = compute_financials(float(plan.get("price") or 0), commission_pct, gst_pct,
                                 working_days, platform_fee)
        out.append({
            "plan_type": plan_type,
            "label": plan.get("label") or plan_type.title(),
            "price": money.money(plan.get("price") or 0),
            "duration_days": duration,
            "weekly_offs": offs,
            "gst": fin["tax_amount"],
            "gst_pct": fin["tax_pct"],
            "platform_fee": fin["platform_fee"],
            "total_payable": fin["total_payable"],
            **{k: v for k, v in fin.items() if k != "pricing"},
        })
    return out


def _parse_ref():
    # Reference start for preview working-day counting = today.
    return datetime.now(timezone.utc).date()


def recompute_accrual(sub: dict) -> dict:
    """Recompute (idempotent) accrued earning, absent adjustment, day counts and the
    per-partner settlement map from the schedule. Returns the fields to persist."""
    per_day = money.money(sub.get("per_day_earning") or 0)
    schedule = sub.get("schedule") or []
    assigned = sub.get("partner_id")

    completed = absent = customer_cancel = weekly_off = 0
    accrued = 0.0                      # original assigned maid's earning
    absent_adjustment = 0.0            # platform gets absent days
    customer_cancel_retained = 0.0     # platform retains customer-cancel days
    replacement_earnings = {}          # replacement_partner_id -> amount

    new_schedule = []
    for d in schedule:
        d = dict(d)
        st = d.get("status")
        if st == "completed":
            completed += 1
            served = d.get("served_by") or assigned
            d["served_by"] = served
            d["earning"] = per_day
            # Earning already credited to the maid's wallet at ARRIVAL (attendance)
            # — don't re-accrue it into the end-of-period settlement (no double pay).
            if d.get("earning_credited"):
                pass
            elif served and served != assigned:
                replacement_earnings[served] = money.add(replacement_earnings.get(served, 0), per_day)
            else:
                accrued = money.add(accrued, per_day)
        elif st == "replacement_completed":
            completed += 1
            served = d.get("served_by") or d.get("replacement_partner_id")
            d["served_by"] = served
            d["earning"] = per_day
            if served and not d.get("earning_credited"):
                replacement_earnings[served] = money.add(replacement_earnings.get(served, 0), per_day)
        elif st == "maid_absent":
            absent += 1
            d["earning"] = 0.0
            d["served_by"] = None
            absent_adjustment = money.add(absent_adjustment, per_day)
        elif st == "customer_cancel":
            customer_cancel += 1
            d["earning"] = 0.0
            d["served_by"] = None
            customer_cancel_retained = money.add(customer_cancel_retained, per_day)
        elif st == "weekly_off":
            weekly_off += 1
            d["earning"] = 0.0
        else:  # scheduled / pending
            d["earning"] = 0.0
        new_schedule.append(d)

    working_days = int(sub.get("working_days") or 1)
    settled_days = completed  # completed (incl. replacement) count
    # Platform revenue = base commission + platform fee (GST is collected for the govt,
    # NOT platform income) + any absent / customer-cancel days it retains.
    platform_total = money.add(sub.get("commission_amount") or 0, sub.get("platform_fee") or 0,
                               absent_adjustment, customer_cancel_retained)
    return {
        "schedule": new_schedule,
        "completed_days": completed,
        "absent_days": absent,
        "customer_cancel_days": customer_cancel,
        "weekly_off_days": weekly_off,
        "accrued_earning": money.money(accrued),
        "absent_adjustment": money.money(absent_adjustment),
        "customer_cancel_retained": money.money(customer_cancel_retained),
        "replacement_earnings": {k: money.money(v) for k, v in replacement_earnings.items()},
        "platform_total": money.money(platform_total),
        "settlement_amount": money.money(accrued),  # original maid settlement
    }


async def apply_accrual(subscription_id: str):
    sub = await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    if not sub:
        return None
    upd = recompute_accrual(sub)
    upd["updated_at"] = now_iso()
    await db.subscriptions.update_one({"id": subscription_id}, {"$set": upd})
    return await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})


async def maybe_finalize(subscription_id: str):
    """If an active subscription's period has ended and there are no more pending
    (scheduled) working days, mark it completed and open a PENDING settlement for
    the assigned maid so the admin can review/approve/pay."""
    sub = await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    if not sub or sub.get("status") != "active":
        return sub
    today = datetime.now(timezone.utc).date().isoformat()
    schedule = sub.get("schedule") or []
    pending = [d for d in schedule if d.get("status") == "scheduled" and d.get("date") <= today]
    still_upcoming = [d for d in schedule if d.get("status") == "scheduled" and d.get("date") > today]
    end_date = sub.get("end_date")
    period_over = end_date and today > end_date
    if pending and not period_over:
        return sub  # days still to be actioned today or earlier
    if still_upcoming and not period_over:
        return sub  # future working days remain
    if not period_over and (pending or still_upcoming):
        return sub
    # finalize
    sub = await apply_accrual(subscription_id)
    settlement = {
        "status": "pending",
        "amount": money.money(sub.get("settlement_amount") or 0),
        "generated_at": now_iso(),
        "reviewed_at": None,
        "approved_at": None,
        "paid_at": None,
        "note": "",
    }
    await db.subscriptions.update_one(
        {"id": subscription_id},
        {"$set": {"status": "completed", "settlement": settlement, "updated_at": now_iso()},
         "$push": {"timeline": {"status": "completed", "at": now_iso()}}})
    return await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})


async def finalize_due_subscriptions():
    """Background sweep: finalize every active subscription whose period has ended."""
    today = datetime.now(timezone.utc).date().isoformat()
    rows = await db.subscriptions.find(
        {"status": "active", "end_date": {"$lt": today}}, {"_id": 0, "id": 1}).to_list(1000)
    n = 0
    for r in rows:
        await maybe_finalize(r["id"])
        n += 1
    return n


async def pay_settlement(sub: dict):
    """Credit the assigned maid's wallet with the settlement amount + record a ledger
    entry and a transaction (reuses the existing partner wallet). Idempotent."""
    settlement = sub.get("settlement") or {}
    if settlement.get("status") == "paid":
        return sub
    partner_id = sub.get("partner_id")
    amount = money.money(settlement.get("amount") or sub.get("settlement_amount") or 0)
    if partner_id and amount > 0:
        await db.users.update_one({"id": partner_id}, {"$inc": {"wallet_balance": amount}})
        await db.transactions.insert_one({
            "id": new_id(), "user_id": partner_id, "amount": amount, "type": "credit",
            "kind": "subscription_settlement",
            "note": f"Subscription settlement · {sub.get('code')}",
            "created_at": now_iso()})
    # Pay any replacement maids their earned amount too.
    for rid, ramt in (sub.get("replacement_earnings") or {}).items():
        ramt = money.money(ramt)
        if rid and rid != partner_id and ramt > 0:
            await db.users.update_one({"id": rid}, {"$inc": {"wallet_balance": ramt}})
            await db.transactions.insert_one({
                "id": new_id(), "user_id": rid, "amount": ramt, "type": "credit",
                "kind": "subscription_settlement",
                "note": f"Replacement settlement · {sub.get('code')}",
                "created_at": now_iso()})
    await db.subscription_settlements.insert_one({
        "id": new_id(), "subscription_id": sub["id"], "subscription_code": sub.get("code"),
        "partner_id": partner_id, "amount": amount,
        "commission_amount": sub.get("commission_amount"),
        "tax_amount": sub.get("tax_amount"),
        "absent_adjustment": sub.get("absent_adjustment"),
        "platform_total": sub.get("platform_total"),
        "created_at": now_iso()})
    settlement = {**settlement, "status": "paid", "paid_at": now_iso()}
    await db.subscriptions.update_one(
        {"id": sub["id"]},
        {"$set": {"settlement": settlement, "updated_at": now_iso()},
         "$push": {"timeline": {"status": "settlement_paid", "at": now_iso()}}})
    return await db.subscriptions.find_one({"id": sub["id"]}, {"_id": 0})


def address_latlng(address: dict):
    """Best-effort (lat, lng) from a stored address dict; None if not available."""
    a = address or {}
    lat = a.get("lat", a.get("latitude"))
    lng = a.get("lng", a.get("longitude", a.get("lon")))
    try:
        if lat in (None, "") or lng in (None, ""):
            return None
        return (float(lat), float(lng))
    except (TypeError, ValueError):
        return None


async def credit_daily_earning(sub: dict, day_date: str, partner_id: str, amount: float):
    """Instantly & finally credit one working day's earning to the maid's in-app
    wallet the moment attendance (arrival) is marked, and roll it into the daily
    earnings leaderboard. Runs silently — nothing about money is shown to the customer.
    Idempotent per (subscription, day)."""
    amount = money.money(amount or 0)
    if not partner_id or amount <= 0:
        return
    today = datetime.now(timezone.utc).date().isoformat()
    # Wallet + ledger (reuses the shared partner wallet).
    await db.users.update_one({"id": partner_id}, {"$inc": {"wallet_balance": amount}})
    await db.transactions.insert_one({
        "id": new_id(), "user_id": partner_id, "amount": amount, "type": "credit",
        "kind": "subscription_daily_earning",
        "note": f"Attendance earning · {sub.get('code')} · {day_date}",
        "ref_id": sub.get("id"), "day_date": day_date, "created_at": now_iso()})
    # Daily leaderboard bucket (one doc per partner per calendar day).
    await db.daily_earnings.update_one(
        {"partner_id": partner_id, "date": today},
        {"$inc": {"amount": amount, "days": 1},
         "$setOnInsert": {"id": new_id(), "partner_id": partner_id, "date": today,
                          "created_at": now_iso()},
         "$set": {"partner_name": sub.get("partner_name"), "updated_at": now_iso()}},
        upsert=True)


async def daily_earnings_leaderboard(partner: dict, day: str = "", limit: int = 10) -> dict:
    """Today's (or a given day's) maid earnings ranking, built from the silent
    per-day attendance credits. Ranked by total earning for the day."""
    day = (day or datetime.now(timezone.utc).date().isoformat())[:10]
    rows = await db.daily_earnings.find({"date": day}, {"_id": 0}).to_list(5000)
    rows.sort(key=lambda r: money.money(r.get("amount") or 0), reverse=True)
    pid = (partner or {}).get("id")

    def _row(r, i):
        return {"rank": i + 1, "partner_id": r.get("partner_id"),
                "name": r.get("partner_name") or "Maid",
                "amount": money.money(r.get("amount") or 0),
                "days": int(r.get("days") or 0),
                "is_me": r.get("partner_id") == pid}
    top = [_row(r, i) for i, r in enumerate(rows[:limit])]
    my_idx = next((i for i, r in enumerate(rows) if r.get("partner_id") == pid), None)
    me = _row(rows[my_idx], my_idx) if my_idx is not None else None
    return {"day": day, "top": top, "me": me,
            "my_rank": (my_idx + 1) if my_idx is not None else None,
            "total": len(rows)}


def slot_overlaps(a_start, a_end, b_start, b_end) -> bool:
    """Do two [start,end] date ranges (ISO yyyy-mm-dd) overlap at all?"""
    if not (a_start and a_end and b_start and b_end):
        return False
    return a_start <= b_end and b_start <= a_end


async def busy_partner_ids_for(sub: dict) -> set:
    """Partners who are already committed to another ACTIVE subscription in the SAME
    time slot over an overlapping date range + shared working weekday — so they must
    NOT receive a new job alert / assignment for this slot (maid notifications rule)."""
    slot = (sub.get("preferred_time") or "").strip()
    if not slot:
        return set()
    others = await db.subscriptions.find(
        {"status": "active", "preferred_time": slot, "partner_id": {"$ne": None},
         "id": {"$ne": sub.get("id")}},
        {"_id": 0, "partner_id": 1, "start_date": 1, "end_date": 1, "weekly_offs": 1}).to_list(2000)
    my_offs = set(sub.get("weekly_offs") or [])
    my_days = {i for i in range(7) if i not in my_offs}
    busy = set()
    for o in others:
        if not slot_overlaps(sub.get("start_date"), sub.get("end_date"),
                             o.get("start_date"), o.get("end_date")):
            continue
        o_offs = set(o.get("weekly_offs") or [])
        o_days = {i for i in range(7) if i not in o_offs}
        if my_days & o_days:          # they share at least one working weekday
            busy.add(o.get("partner_id"))
    return busy


# ---- Customer-facing sanitisation: never expose maid rate / earnings ----
_EARNING_KEYS = ("per_day_earning", "partner_allocation", "accrued_earning",
                 "absent_adjustment", "customer_cancel_retained", "replacement_earnings",
                 "platform_total", "settlement_amount", "settlement",
                 "commission_pct", "commission_amount", "tax_pct", "tax_amount")


def customer_view(sub: dict) -> dict:
    """Strip every rate / earning figure and expose a clean attendance list
    (maid name · date · arrival time only) for the customer's booking history."""
    s = {k: v for k, v in dict(sub).items() if k not in _EARNING_KEYS}
    attendance = []
    for d in (sub.get("schedule") or []):
        if d.get("arrival_at"):
            attendance.append({
                "date": d.get("date"),
                "maid_name": sub.get("partner_name") or "",
                "arrival_time": d.get("arrival_at"),
                "status": d.get("status"),
            })
    s["attendance"] = attendance
    # Also scrub per-day earning fields inside the schedule the customer can see.
    s["schedule"] = [{k: v for k, v in d.items()
                      if k not in ("earning", "earning_credited", "otp")}
                     for d in (sub.get("schedule") or [])]
    return s
