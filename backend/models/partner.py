"""Module 3 — Service Partner side request models (verification, skills, wallet, incentives)."""
from typing import Optional, List
from pydantic import BaseModel, Field


# ---- Verification ----
class StageSubmitRequest(BaseModel):
    documents: List[dict] = []          # [{type, url, name}]
    data: dict = {}


class StageActionRequest(BaseModel):
    action: str                          # approve | reject
    reason: Optional[str] = ""
    note: Optional[str] = ""


class VerificationConfigUpdate(BaseModel):
    stages: List[dict]                   # ordered stage definitions


# ---- Skills / Assessment / Certificates ----
class SkillCatalogUpsert(BaseModel):
    name: str
    category: Optional[str] = ""
    description: Optional[str] = ""
    levels: List[str] = ["Beginner", "Intermediate", "Advanced", "Expert", "Master"]
    min_experience: float = 0
    requires_certificate: bool = False
    requires_assessment: bool = False
    passing_score: int = 70
    max_attempts: int = 3
    time_limit_min: int = 15
    questions: List[dict] = []           # [{id?, q, options:[], answer_index}]
    eligible_services: List[str] = []
    status: str = "active"


class PartnerSkillAdd(BaseModel):
    skill_id: str
    experience_years: float = 0
    level: str = "Beginner"
    is_primary: bool = True


class SkillVerifyRequest(BaseModel):
    action: str                          # approve | reject
    verified_level: Optional[str] = None
    reason: Optional[str] = ""


class CertificateAdd(BaseModel):
    skill_id: Optional[str] = ""
    skill_name: Optional[str] = ""
    name: str
    url: str


class CertificateReview(BaseModel):
    action: str                          # verify | reject
    reason: Optional[str] = ""


class AssessmentSubmit(BaseModel):
    answers: dict = {}                   # {question_id: selected_index}


# ---- Wallet / Withdrawals ----
class WalletConfigUpdate(BaseModel):
    min_withdrawal: Optional[float] = None
    max_withdrawal: Optional[float] = None
    processing_fee_pct: Optional[float] = None
    processing_fee_flat: Optional[float] = None
    upi_enabled: Optional[bool] = None
    bank_enabled: Optional[bool] = None
    frequency_days: Optional[int] = None
    # Auto Payout + Streak Bonus controls
    auto_payout_enabled: Optional[bool] = None
    streak_enabled: Optional[bool] = None
    streak_threshold: Optional[int] = None
    streak_base_bonus: Optional[float] = None
    streak_increment: Optional[float] = None
    streak_reminder_enabled: Optional[bool] = None
    streak_freeze_enabled: Optional[bool] = None
    streak_freeze_per_week: Optional[int] = None
    leaderboard_rewards_enabled: Optional[bool] = None
    leaderboard_reward_top3: Optional[list] = None


class WithdrawalRequest(BaseModel):
    amount: float = Field(gt=0)
    method: str = "upi"                  # upi | bank
    upi_id: Optional[str] = ""
    bank: Optional[dict] = None          # {account_holder, bank_name, account_number, ifsc, branch}


class WithdrawalAction(BaseModel):
    action: str                          # approve | reject
    reason: Optional[str] = ""


# ---- Incentives / Penalties ----
class IncentiveUpsert(BaseModel):
    name: str
    description: Optional[str] = ""
    job_target: int = 0
    revenue_target: float = 0
    rating_min: float = 0
    bonus_amount: float = 0
    category: Optional[str] = ""
    start_date: Optional[str] = ""
    end_date: Optional[str] = ""
    auto_approve: bool = False
    status: str = "active"


class PenaltyCreate(BaseModel):
    partner_id: str
    reason: str
    type: str = "fixed"                  # fixed | percentage | score
    amount: float = 0
    booking_id: Optional[str] = ""
    note: Optional[str] = ""


# ---- Training ----
class TrainingUpsert(BaseModel):
    title: str
    description: Optional[str] = ""
    video_url: str
    duration_min: int = 0
    assign_type: str = "all"             # all | stage | skill | category
    assign_value: Optional[str] = ""     # stage key / skill id / category id
    mandatory: bool = False
    status: str = "active"


class TrainingProgress(BaseModel):
    percent: float = Field(ge=0, le=100)
    completed: bool = False


# ---- Availability / Leave ----
class AvailabilityUpdate(BaseModel):
    mode: str                            # online | offline | break | emergency


class LeaveRequest(BaseModel):
    start_date: str
    end_date: str
    reason: Optional[str] = ""


class LeaveAction(BaseModel):
    action: str                          # approve | reject
    reason: Optional[str] = ""
