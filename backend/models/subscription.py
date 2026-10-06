"""Recurring subscription booking models (Maid & other recurring service categories).

Customer pays the FULL plan amount upfront. Commission + tax are SNAPSHOTTED on the
subscription at booking time so later admin rate changes never alter an active/past
subscription. The partner is settled from ACTUAL completed working days only; absent
days' allocated earning is retained by the platform.
"""
from typing import Optional, List
from pydantic import BaseModel, Field

# Weekday numbers follow Python's date.weekday(): Mon=0 ... Sun=6.
PLAN_TYPES = ["weekly", "monthly", "quarterly", "yearly"]

# Sensible default calendar length per plan (admin can override per plan).
PLAN_DEFAULT_DURATION = {"daily": 1, "weekly": 7, "monthly": 30, "quarterly": 90, "yearly": 365}

DAY_STATUSES = [
    "scheduled",            # upcoming working day (not yet served)
    "in_progress",          # maid started the service (customer OTP verified) — not yet completed
    "completed",            # maid completed the service that day  -> maid earns per-day
    "maid_absent",          # maid absent            -> per-day goes to platform (absent adjustment)
    "customer_cancel",      # customer cancelled / no-show that day -> neutral (existing refund policy)
    "weekly_off",           # agreed weekly off      -> no earning, no deduction
    "replacement_completed",  # a replacement maid served -> replacement earns, original does not
]

SETTLEMENT_STATUSES = ["none", "pending", "review", "approved", "paid"]


class SubscriptionCreate(BaseModel):
    service_id: str
    plan_type: str = "monthly"           # daily | weekly | monthly | yearly
    start_date: str                      # ISO yyyy-mm-dd
    preferred_time: str = ""             # e.g. "09:00"
    address_id: Optional[str] = None
    address: Optional[dict] = None
    notes: str = ""
    # Optional customer override of weekly-off weekdays (else uses plan default).
    weekly_offs: Optional[List[int]] = None
    idempotency_key: Optional[str] = None


class SubscriptionPayVerify(BaseModel):
    order_id: str
    payment_id: str
    signature: str


class AssignPartnerRequest(BaseModel):
    partner_id: str


class DayMarkRequest(BaseModel):
    status: str                          # any of DAY_STATUSES (except scheduled)
    replacement_partner_id: Optional[str] = None
    note: str = ""


class StartDayRequest(BaseModel):
    otp: str                             # customer shares this with the maid on arrival


class ArriveRequest(BaseModel):
    """Location-based attendance — the maid taps "I Have Arrived"; the app sends her
    current GPS. Attendance succeeds only when she is within 200m of the customer's
    home. No OTP, no extra confirmation."""
    lat: float
    lng: float


class CompleteDayRequest(BaseModel):
    note: str = ""
    photo: Optional[str] = None          # base64 data URL — materialized to storage, never stored raw


class SettlementActionRequest(BaseModel):
    action: str                          # review | approve | pay | reject
    note: str = ""
