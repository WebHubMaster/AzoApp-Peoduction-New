from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from controllers import ai_controller as c
from middleware.auth import get_current_user

router = APIRouter(prefix="/ai", tags=["ai"])


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


@router.post("/chat")
async def chat(req: ChatRequest, user=Depends(get_current_user)):
    return await c.chat(user, req.message, req.session_id)
