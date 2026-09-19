import uuid
from typing import List
from pydantic import BaseModel, Field


def new_id() -> str:
    return str(uuid.uuid4())


class RateRow(BaseModel):
    id: str = ""
    description: str = ""
    service_charge: str = ""          # e.g. "1500" or "900" (display as ₹)
    labour_charge: str = ""           # optional 2nd line, e.g. "349" shown as ₹349 (Labour)
    original_charge: str = ""         # optional strike-through price
    warranty: str = ""                # e.g. "30 days", "1 year"
    note: str = ""                    # small helper text
    order: int = 0


class RateGroup(BaseModel):
    id: str = ""
    name: str = ""
    note: str = ""
    order: int = 0
    rows: List[RateRow] = []


class RateCardCreate(BaseModel):
    category_id: str
    title: str = "Standard rate card"
    subtitle: str = ""
    brand_label: str = "AzoCover"     # shown like the "uccover" chip
    intro: str = ""                   # optional paragraph shown at top
    footer_note: str = ""             # terms / disclaimer at bottom
    accent_color: str = "#0D47A1"
    status: str = "active"            # active | inactive
    groups: List[RateGroup] = Field(default_factory=list)
