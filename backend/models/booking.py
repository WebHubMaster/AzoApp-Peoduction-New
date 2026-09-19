from typing import Optional, List
from pydantic import BaseModel, Field

BOOKING_STATUSES = [
    "searching",        # broadcast to eligible partners
    "assigned",         # a partner accepted
    "arrived_shop",     # merchant-assisted: partner at shop (shop OTP done)
    "arrived_customer", # partner at customer
    "started",          # customer start OTP done
    "completed",        # completion OTP done + evidence
    "paid",
    "cancelled",
]


class DirectBookingRequest(BaseModel):
    service_id: str = ""
    address_id: Optional[str] = None
    address: Optional[dict] = None
    schedule_type: str = "now"     # now | scheduled | emergency
    scheduled_at: Optional[str] = None
    addons: List[str] = []
    tier_index: Optional[int] = None
    notes: str = ""
    coupon_code: Optional[str] = None
    redeem_points: Optional[int] = 0
    # multi-service cart context: visiting charge is decided by the whole cart's
    # service total and applied once (apply_visiting=True only on the first booking).
    cart_service_total: Optional[float] = None
    apply_visiting: bool = True
    # Instant/Emergency fee is also once-per-order → only the first booking of a
    # multi-item cart should carry it (apply_emergency=False on the rest).
    apply_emergency: bool = True
    # "Book from rate card" — an ad-hoc line item (not a catalog service) priced at a
    # fixed amount and tied to a real category (so pricing + partner matching still work).
    custom: bool = False
    custom_name: Optional[str] = ""
    custom_price: Optional[float] = 0
    labour_charge: Optional[float] = 0
    category_id: Optional[str] = ""
    category_name: Optional[str] = ""
    # Client-generated key that makes booking creation safe to retry on flaky/slow
    # networks: a repeat request with the same key returns the SAME booking instead
    # of creating a duplicate.
    idempotency_key: Optional[str] = None
    # QR / referral: when a customer taps the merchant's QR link (`/?ref=CODE`)
    # the frontend forwards that code here so the booking is tagged to the
    # merchant. Once a customer uses a code, we also persist the link on their
    # user record so future bookings auto-tag (no code re-required).
    merchant_ref_code: Optional[str] = None


class MerchantBookingRequest(BaseModel):
    customer_phone: str
    customer_name: str = ""
    service_id: str
    address: dict
    schedule_type: str = "now"
    scheduled_at: Optional[str] = None
    problem: str = ""


class GuestBookingRequest(BaseModel):
    service_id: str
    customer_phone: str
    customer_name: str = ""
    address: dict
    schedule_type: str = "now"
    scheduled_at: Optional[str] = None
    addons: List[str] = []
    notes: str = ""
    coupon_code: Optional[str] = None
    tier_index: Optional[int] = None
    merchant_ref_code: Optional[str] = None


class OTPActionRequest(BaseModel):
    otp: str


class EvidenceRequest(BaseModel):
    stage: str = "before"   # before | after
    images: List[str] = []
    notes: str = ""


class ReviewRequest(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = ""


class LocationUpdate(BaseModel):
    lat: float
    lng: float



class SparePartRequest(BaseModel):
    name: str
    quantity: int = Field(default=1, ge=1)
    price: float = Field(ge=0)
    notes: str = ""


class SparePartAction(BaseModel):
    action: str  # approve | reject


class AdditionalItem(BaseModel):
    description: str
    part_charge: float = Field(default=0, ge=0)     # part/material cost — NO commission
    labour_charge: float = Field(default=0, ge=0)   # labour — platform commission applies
    warranty: str = ""
    ratecard_row_id: Optional[str] = ""
    category_id: Optional[str] = ""


class AdditionalWorkRequest(BaseModel):
    items: List[AdditionalItem] = []


class AdditionalPayRequest(BaseModel):
    method: str = "online"   # online (mock) | wallet
