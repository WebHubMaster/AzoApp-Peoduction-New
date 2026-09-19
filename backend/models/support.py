"""Advanced Support / Helpdesk ticket models."""
from pydantic import BaseModel, Field
from typing import List, Optional


CATEGORIES = ["booking", "payment", "refund", "account", "technical", "other"]
PRIORITIES = ["low", "medium", "high", "urgent"]
STATUSES = ["open", "in_progress", "resolved", "closed"]


class Attachment(BaseModel):
    url: str
    name: str = ""
    type: str = ""       # mime type
    kind: str = "image"  # image | pdf
    size: int = 0


class TicketCreate(BaseModel):
    subject: str
    category: str = "other"
    priority: str = "medium"
    message: str = ""
    attachments: List[Attachment] = []
    booking_code: str = ""


class MessageCreate(BaseModel):
    text: str = ""
    attachments: List[Attachment] = []
    internal: bool = False   # admin-only internal note (never shown to the user)


class StatusUpdate(BaseModel):
    status: str


class PriorityUpdate(BaseModel):
    priority: str


class AssignUpdate(BaseModel):
    admin_id: Optional[str] = None
    admin_name: Optional[str] = None
