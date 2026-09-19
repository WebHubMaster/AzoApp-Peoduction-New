import uuid
from typing import Optional, List
from pydantic import BaseModel, Field
from config.database import now_iso

ROLES = ["customer", "partner", "merchant", "admin"]


def new_id() -> str:
    return str(uuid.uuid4())


class SendOTPRequest(BaseModel):
    phone: str


class VerifyOTPRequest(BaseModel):
    phone: str
    otp: str
    name: Optional[str] = None
    create_if_new: bool = True
    role: Optional[str] = None


class RegisterProviderRequest(BaseModel):
    phone: str
    name: str
    role: str  # partner | merchant


class EmailAuthRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class AddressModel(BaseModel):
    id: str = Field(default_factory=new_id)
    label: str = "Home"
    line: str = ""
    pincode: str = ""
    city: str = ""
    state: str = ""
    property_type: str = "Apartment"
    wing: str = ""
    floor: str = ""
    flat_no: str = ""
    landmark: str = ""
    instructions: str = ""
    contact_name: str = ""
    contact_phone: str = ""
    has_pets: bool = False
    pet_type: str = ""
    pet_count: int = 0
    pet_instructions: str = ""
    parking_available: bool = True
    lift_available: bool = True
    lat: Optional[float] = None
    lng: Optional[float] = None
    is_default: bool = False


class GoogleAuthRequest(BaseModel):
    credential: str


class ForgotPasswordRequest(BaseModel):
    identifier: str  # email or phone


class ResetPasswordRequest(BaseModel):
    identifier: str
    otp: str
    new_password: str


class DeleteAccountRequest(BaseModel):
    reason: Optional[str] = ""


class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    gender: Optional[str] = None
    photo: Optional[str] = None
    language: Optional[str] = None
    dob: Optional[str] = None
    alternate_mobile: Optional[str] = None
    communication_pref: Optional[str] = None
    gst_number: Optional[str] = None
    company_name: Optional[str] = None


def build_user(phone: str, role: str, name: str = "", is_demo: bool = False, **extra) -> dict:
    doc = {
        "id": new_id(),
        "phone": phone,
        "role": role,
        "name": name or "New User",
        "email": extra.get("email", ""),
        "photo": "",
        "gender": "",
        "language": "en",
        "status": "active",
        "is_demo": is_demo,
        "addresses": [],
        "wallet_balance": 0.0,
        "loyalty_points": 0,
        "skills": extra.get("skills", []),
        "service_pincodes": extra.get("service_pincodes", []),
        "kyc_status": "pending" if role in ("partner", "merchant") else "na",
        "partner_status": "offline" if role == "partner" else None,
        "rating": 5.0,
        "jobs_completed": 0,
        "referred_by_merchant": extra.get("referred_by_merchant"),
        "shop_name": extra.get("shop_name", ""),
        "shop_type": extra.get("shop_type", ""),
        "dob": extra.get("dob", ""),
        "alternate_mobile": extra.get("alternate_mobile", ""),
        "communication_pref": extra.get("communication_pref", ""),
        "gst_number": extra.get("gst_number", ""),
        "company_name": extra.get("company_name", ""),
        "created_at": now_iso(),
        "onboarding_tour_status": "pending",
    }
    return doc
