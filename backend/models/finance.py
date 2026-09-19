from typing import Optional
from pydantic import BaseModel, Field


class SettingsUpdate(BaseModel):
    platform_commission_pct: Optional[float] = None
    partner_commission_pct: Optional[float] = None
    merchant_referral_pct: Optional[float] = None
    merchant_booking_pct: Optional[float] = None
    commission: Optional[dict] = None
    gst_pct: Optional[float] = None
    platform_fee: Optional[float] = None
    convenience_fee_pct: Optional[float] = None
    emergency_fee: Optional[float] = None
    visiting_charge: Optional[float] = None
    fees_config: Optional[dict] = None
    referral_base: Optional[str] = None
    demo_mode: Optional[bool] = None
    auth_config: Optional[dict] = None
    profile_fields: Optional[dict] = None
    languages: Optional[list] = None
    address_config: Optional[dict] = None
    integrations: Optional[dict] = None
    alert_config: Optional[dict] = None
    job_auto_expiry_minutes: Optional[int] = None
    cancellation_reasons: Optional[list] = None
    branding: Optional[dict] = None
    theme: Optional[dict] = None
    business_config: Optional[dict] = None
    invoice_config: Optional[dict] = None
    seo: Optional[dict] = None
    referral: Optional[dict] = None
    general: Optional[dict] = None
    home_stats: Optional[dict] = None
    cashback: Optional[dict] = None
    packages: Optional[dict] = None
    pwa: Optional[dict] = None
    storage: Optional[dict] = None
    agent_config: Optional[dict] = None


class CouponCreate(BaseModel):
    code: str
    title: str = ""
    discount_type: str = "percentage"   # percentage | fixed | free_visiting
    discount_value: float = 10
    min_order: float = 0
    max_discount: float = 0
    usage_limit: int = 1000
    per_user_limit: int = 0              # 0 = unlimited per user
    first_order_only: bool = False
    valid_from: str = ""                 # ISO date (optional)
    valid_till: str = ""                 # ISO date (optional)
    description: str = ""
    target_audience: str = "all"         # all | new | repeat
    applicable_services: list = []
    applicable_categories: list = []
    status: str = "active"


class PartnerOnboardRequest(BaseModel):
    phone: str
    name: str
    skills: list = []
    service_pincodes: list = []


class WalletTopupRequest(BaseModel):
    amount: float = Field(gt=0, le=100000)
