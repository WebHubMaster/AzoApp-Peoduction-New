"""Scheduled-booking time math + lock / visibility state — SERVER AUTHORITATIVE.

`scheduled_at` is stored as a local wall-clock string (e.g. "2026-09-15T14:00").
AzoApp operates in India, so a naive value is interpreted in IST (Asia/Kolkata).
Everything downstream — the 30-minute reminder, communication (call/chat/nav)
unlock and the customer's Work-Start OTP visibility — is derived from ONE lead
time so the whole app stays perfectly consistent, and the frontend countdown is
purely visual: the real permission is decided here against the server clock.
"""
from datetime import datetime, timezone, timedelta

try:
    from zoneinfo import ZoneInfo
    APP_TZ = ZoneInfo("Asia/Kolkata")
except Exception:  # pragma: no cover - fallback if tzdata missing
    APP_TZ = timezone(timedelta(hours=5, minutes=30))

# Call / Chat / Navigation unlock, partner reminder and customer OTP visibility all
# happen exactly this many minutes before the scheduled start. This is the DEFAULT;
# admins can override it (30 / 45 / 60) — the sweep refreshes the live value below.
LEAD_MINUTES = 30
_ALLOWED_LEADS = (15, 30, 45, 60)
_LEAD_OVERRIDE = None  # set from admin settings via set_lead_minutes()


def lead_minutes() -> int:
    """Live lead time (admin override if set, else the 30-min default)."""
    return _LEAD_OVERRIDE or LEAD_MINUTES


def set_lead_minutes(value) -> int:
    """Apply an admin-configured lead time. Ignores anything outside the allowed set."""
    global _LEAD_OVERRIDE
    try:
        n = int(value)
    except (TypeError, ValueError):
        n = 0
    _LEAD_OVERRIDE = n if n in _ALLOWED_LEADS else None
    return lead_minutes()

# Statuses where the schedule lock no longer applies (work has begun / ended).
_UNLOCKED_STATUSES = {"started", "completed", "paid", "cancelled"}


def _now_utc():
    return datetime.now(timezone.utc)


def today_ist():
    """Current calendar date in IST as 'YYYY-MM-DD' (used for daily online reset)."""
    return datetime.now(APP_TZ).strftime("%Y-%m-%d")


# ---------------------------------------------------------------- booking slot grid
# The scheduled-booking START-time grid. Working hours + interval come from admin
# settings (settings["scheduling"]); nothing is hardcoded except a safe fallback.
# This is ONLY the slot granularity — NOT the service duration and NOT the 30-minute
# pre-work unlock (LEAD_MINUTES) above.
def _slot_cfg(settings=None):
    sc = ((settings or {}).get("scheduling") or {})
    start = str(sc.get("slot_start") or "08:00")
    end = str(sc.get("slot_end") or "20:00")
    try:
        step = int(sc.get("slot_interval_min") or 30)
    except (TypeError, ValueError):
        step = 30
    if step not in (15, 30, 60):
        step = 30
    return start, end, step


def _hm_to_min(s):
    try:
        parts = str(s).split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except (ValueError, IndexError, TypeError):
        return None


def _min_to_hm(x):
    return f"{x // 60:02d}:{x % 60:02d}"


def generate_slots(settings=None):
    """Ordered list of bookable START times ('HH:MM') from the configured working
    hours at the configured interval (default 30 min)."""
    start, end, step = _slot_cfg(settings)
    s, e = _hm_to_min(start), _hm_to_min(end)
    if s is None or e is None or e <= s:
        s, e = 8 * 60, 20 * 60
    return [_min_to_hm(t) for t in range(s, e, step)]


def slot_of(hhmm, settings=None):
    """Round a 'HH:MM' DOWN to its slot bucket (for per-slot capacity counting)."""
    _, _, step = _slot_cfg(settings)
    m = _hm_to_min(hhmm)
    if m is None:
        return hhmm
    return _min_to_hm(m - (m % step))


def is_valid_slot(hhmm, settings=None):
    """True when a chosen 'HH:MM' aligns to the configured slot grid (e.g. :00/:30)
    and is within working hours."""
    return hhmm in set(generate_slots(settings))


def parse_scheduled(raw):
    """Parse a scheduled_at value → aware UTC datetime, or None.

    Naive values (no tz) are treated as IST wall-clock; tz-aware values are
    converted to UTC as-is."""
    if not raw:
        return None
    s = str(raw).strip()
    dt = None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        try:
            dt = datetime.fromisoformat(s[:16])
        except Exception:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=APP_TZ)
    return dt.astimezone(timezone.utc)


def _fmt_date(dt_local):
    # "15 Sep 2026" (no leading zero on the day)
    return f"{dt_local.day} {dt_local.strftime('%b %Y')}"


def _fmt_time(dt_local):
    # "02:00 PM"
    return dt_local.strftime("%I:%M %p")


def format_scheduled(raw):
    """Format a scheduled_at value → {date, time, label} in IST, or None."""
    dt = parse_scheduled(raw)
    if not dt:
        return None
    local = dt.astimezone(APP_TZ)
    return {"date": _fmt_date(local), "time": _fmt_time(local),
            "label": f"{_fmt_date(local)} at {_fmt_time(local)}"}


def schedule_state(booking):
    """Return the scheduling / lock state for a booking (server-authoritative).

    Keys the frontend relies on:
      is_scheduled     — a future-dated 'schedule' booking (emergency/now → False)
      scheduled_date   — "15 Sep 2026"
      scheduled_time   — "02:00 PM"
      scheduled_label  — "15 Sep 2026 at 02:00 PM"
      unlock_at / reminder_at / otp_visible_at — ISO UTC (scheduled - 30 min)
      seconds_to_start / seconds_to_unlock     — for the visual countdown
      comm_locked      — Call / Chat / Navigation / Start-Work still locked
      otp_hidden       — customer Work-Start OTP must stay hidden
      phase            — normal | scheduled | window_open | due | active | ...
    """
    schedule_type = (booking.get("schedule_type") or "").lower()
    raw = booking.get("scheduled_at")
    status = booking.get("status") or ""
    sched_utc = parse_scheduled(raw)
    is_scheduled = schedule_type == "schedule" and sched_utc is not None

    state = {
        "is_scheduled": is_scheduled,
        "schedule_type": schedule_type,
        "scheduled_at": raw,
        "scheduled_at_utc": sched_utc.isoformat() if sched_utc else None,
        "scheduled_date": None,
        "scheduled_time": None,
        "scheduled_label": None,
        "lead_minutes": LEAD_MINUTES,
        "reminder_at": None,
        "unlock_at": None,
        "otp_visible_at": None,
        "server_now": _now_utc().isoformat(),
        "seconds_to_start": None,
        "seconds_to_unlock": None,
        "comm_locked": False,
        "otp_hidden": False,
        "phase": "normal",
    }
    if not is_scheduled:
        return state

    local = sched_utc.astimezone(APP_TZ)
    lm = lead_minutes()
    state["lead_minutes"] = lm
    unlock = sched_utc - timedelta(minutes=lm)
    now = _now_utc()
    state["scheduled_date"] = _fmt_date(local)
    state["scheduled_time"] = _fmt_time(local)
    state["scheduled_label"] = f"{_fmt_date(local)} at {_fmt_time(local)}"
    state["reminder_at"] = unlock.isoformat()
    state["unlock_at"] = unlock.isoformat()
    state["otp_visible_at"] = unlock.isoformat()
    state["seconds_to_start"] = int((sched_utc - now).total_seconds())
    state["seconds_to_unlock"] = int((unlock - now).total_seconds())

    if status in _UNLOCKED_STATUSES:
        # Work already started / finished / cancelled → nothing is locked anymore.
        state["phase"] = "active" if status == "started" else status
        return state

    within_lock_window = now < unlock
    state["comm_locked"] = within_lock_window
    state["otp_hidden"] = within_lock_window
    if within_lock_window:
        state["phase"] = "scheduled"           # >30 min away → locked
    elif now < sched_utc:
        state["phase"] = "window_open"         # inside 30-min window → unlocked
    else:
        state["phase"] = "due"                 # scheduled time reached
    return state
