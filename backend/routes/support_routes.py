"""Advanced Support / Helpdesk routes — shared user endpoints + admin inbox."""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from models.support import TicketCreate, MessageCreate, StatusUpdate, AssignUpdate, PriorityUpdate
from middleware.auth import require_role, get_current_user
from services import support_service as svc
from services import storage_service

router = APIRouter(tags=["support"])
ADMIN = require_role("admin")
ANY_USER = require_role("customer", "partner", "merchant")


# ---------- meta ----------
@router.get("/support/meta")
async def support_meta():
    return svc.meta()


# ---------- shared file upload (any authenticated user, incl. admin) ----------
@router.post("/support/upload")
async def support_upload(file: UploadFile = File(...), user=Depends(get_current_user)):
    ct = (file.content_type or "").lower()
    if ct not in svc.ALLOWED_MIME:
        raise HTTPException(status_code=400, detail="Only images (JPG/PNG/WebP/GIF) or PDF are allowed")
    raw = await file.read()
    if len(raw) > svc.MAX_FILE_BYTES:
        raise HTTPException(status_code=400, detail=f"File too large (max {svc.MAX_FILE_BYTES // (1024*1024)}MB)")
    try:
        res = await storage_service.save_document(raw, ct, filename=file.filename or "", folder=storage_service.entity_folder("support", user))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    kind = "pdf" if (ct == "application/pdf" or res.get("kind") == "pdf") else "image"
    return {
        "url": res["url"], "name": file.filename or res.get("name", ""),
        "type": ct, "kind": kind, "size": res.get("size", len(raw)),
        "thumb_url": res.get("thumb_url", res["url"]),
    }


# ---------- user endpoints ----------
@router.post("/support/tickets")
async def create_ticket(data: TicketCreate, user=Depends(ANY_USER)):
    return await svc.create_ticket(user, data.model_dump())


@router.get("/support/tickets")
async def my_tickets(user=Depends(ANY_USER)):
    return await svc.list_my_tickets(user)


@router.get("/support/tickets/{tid}")
async def get_ticket(tid: str, user=Depends(ANY_USER)):
    return await svc.get_ticket(user, tid)


@router.post("/support/tickets/{tid}/messages")
async def add_message(tid: str, data: MessageCreate, user=Depends(ANY_USER)):
    return await svc.add_user_message(user, tid, data.model_dump())


@router.post("/support/tickets/{tid}/close")
async def close_ticket(tid: str, user=Depends(ANY_USER)):
    return await svc.close_by_user(user, tid)


@router.post("/support/tickets/{tid}/typing")
async def user_typing(tid: str, user=Depends(ANY_USER)):
    return await svc.set_typing_user(user, tid)


# ---------- admin inbox ----------
@router.get("/admin/support/stats")
async def admin_stats(admin=Depends(ADMIN)):
    return await svc.admin_stats()


@router.get("/admin/support/tickets")
async def admin_list(status: str = None, role: str = None, priority: str = None,
                     q: str = None, assigned: str = None, admin=Depends(ADMIN)):
    return await svc.admin_list(status, role, priority, q, assigned)


@router.get("/admin/support/tickets/{tid}")
async def admin_get(tid: str, admin=Depends(ADMIN)):
    return await svc.admin_get(tid)


@router.post("/admin/support/tickets/{tid}/messages")
async def admin_reply(tid: str, data: MessageCreate, admin=Depends(ADMIN)):
    return await svc.admin_reply(admin, tid, data.model_dump())


@router.put("/admin/support/tickets/{tid}/status")
async def admin_status(tid: str, data: StatusUpdate, admin=Depends(ADMIN)):
    return await svc.admin_set_status(admin, tid, data.status)


@router.put("/admin/support/tickets/{tid}/priority")
async def admin_priority(tid: str, data: PriorityUpdate, admin=Depends(ADMIN)):
    return await svc.admin_set_priority(tid, data.priority)


@router.post("/admin/support/tickets/{tid}/assign")
async def admin_assign(tid: str, data: AssignUpdate, admin=Depends(ADMIN)):
    name = data.admin_name or admin.get("name")
    aid = data.admin_id or admin.get("id")
    return await svc.admin_assign(tid, aid, name)


@router.post("/admin/support/tickets/{tid}/typing")
async def admin_typing(tid: str, admin=Depends(ADMIN)):
    return await svc.set_typing(tid, "agent")
