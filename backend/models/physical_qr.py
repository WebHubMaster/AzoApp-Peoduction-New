"""Request models for the Physical QR Provisioning feature (PhonePe-style).

Physical QR stickers are pre-printed with a stable, dumb `token` encoded as
`<APP_URL>/?pqr=<TOKEN>`. The token -> merchant mapping lives in the backend so a
sticker can be re-assigned to a different merchant without reprinting. Once a QR
is mapped (active), scanning it funnels the customer into the EXISTING merchant
referral pipeline (via merchant_code) — no parallel money logic.
"""
from typing import Optional, List
from pydantic import BaseModel


class BatchCreateReq(BaseModel):
    count: int
    batch_name: Optional[str] = ""
    prefix: Optional[str] = "PQR"


class AssignReq(BaseModel):
    merchant_id: Optional[str] = None
    merchant_code: Optional[str] = None


class AgentCreateReq(BaseModel):
    name: str
    phone: str


class AssignBatchesReq(BaseModel):
    batch_ids: List[str] = []
