import uuid
from typing import Optional
from pydantic import BaseModel, Field


def new_id() -> str:
    return str(uuid.uuid4())


# Business limits (budget floor confirmed with product: ₹299)
MIN_BUDGET = 299
MAX_BUDGET = 500000


class CustomJobCreate(BaseModel):
    """Payload a verified customer submits from the Custom Job Request wizard.

    OTP verification happens BEFORE this call (the caller must be authenticated
    via the token returned by /auth/verify-otp), so the mobile is server-side
    verified — we never trust a 'verified' flag from the client.
    """
    full_name: str
    mobile: str = ""                       # falls back to the authenticated user's phone
    category_id: str
    work_name: str
    description: str
    expected_budget: float
    pincode: str
    # optional / future-ready location fields (architecture stays scalable)
    address: str = ""
    city: str = ""
    state: str = ""
    lat: Optional[float] = None
    lng: Optional[float] = None
    # duplicate-submit protection (frontend generates one key per wizard session)
    idempotency_key: str = ""


class CustomJobStatusUpdate(BaseModel):
    status: str
    note: str = ""
