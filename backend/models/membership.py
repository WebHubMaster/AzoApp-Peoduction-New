"""Membership plan + purchase models."""
from typing import Optional, List
from pydantic import BaseModel


class MembershipPlanCreate(BaseModel):
    name: str
    tagline: Optional[str] = ""
    description: Optional[str] = ""
    price: float = 0
    original_price: Optional[float] = 0          # for strike-through display
    duration_days: int = 365
    discount_pct: float = 0                       # % off service value on every booking
    max_discount_per_booking: Optional[float] = 0 # 0 = no cap
    free_visits: Optional[int] = 0                # waive visiting charge N times (display)
    priority_support: Optional[bool] = False
    benefits: Optional[List[str]] = None          # bullet points for display
    badge: Optional[str] = ""                      # e.g. "Most Popular"
    color: Optional[str] = "#4f46e5"
    icon: Optional[str] = "crown"
    sort_order: Optional[int] = 0
    status: Optional[str] = "active"              # active | inactive


class MembershipPlanUpdate(BaseModel):
    name: Optional[str] = None
    tagline: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    original_price: Optional[float] = None
    duration_days: Optional[int] = None
    discount_pct: Optional[float] = None
    max_discount_per_booking: Optional[float] = None
    free_visits: Optional[int] = None
    priority_support: Optional[bool] = None
    benefits: Optional[List[str]] = None
    badge: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    sort_order: Optional[int] = None
    status: Optional[str] = None


class MembershipOrderRequest(BaseModel):
    plan_id: str


class MembershipVerifyRequest(BaseModel):
    plan_id: str
    order_id: str
    payment_id: str
    signature: str


class MembershipMockRequest(BaseModel):
    plan_id: str
