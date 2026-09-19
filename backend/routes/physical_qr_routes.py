"""Physical QR Provisioning routes.

Admin/agent-guarded management endpoints under /api/admin/physical-qr and a single
PUBLIC resolve endpoint under /api/physical-qr/resolve that the customer frontend
calls to translate a scanned physical token into a merchant referral code.
"""
from fastapi import APIRouter, Depends, HTTPException

from middleware.auth import get_current_user
from models.physical_qr import BatchCreateReq, AssignReq, AgentCreateReq, AssignBatchesReq
from services import physical_qr_service as svc

router = APIRouter(tags=["physical_qr"])


async def require_qr_access(user: dict = Depends(get_current_user)) -> dict:
    """Allow admins/staff, OR active QR field agents (role='agent' + is_qr_agent)."""
    role = user.get("role")
    if role in ("admin", "superadmin", "staff"):
        return user
    if role == "agent" and user.get("is_qr_agent"):
        if not user.get("agent_active", True):
            raise HTTPException(status_code=403, detail="Your agent account is disabled")
        return user
    raise HTTPException(status_code=403, detail="Forbidden")


# ── PUBLIC ────────────────────────────────────────────────────────────────────
@router.get("/physical-qr/resolve")
async def resolve(token: str = ""):
    return await svc.resolve_public(token)


# ── batches ─────────────────────────────────────────────────────────────────
@router.post("/admin/physical-qr/batch")
async def create_batch(req: BatchCreateReq, user=Depends(require_qr_access)):
    return await svc.create_batch(user, req.count, req.batch_name, req.prefix)


@router.get("/admin/physical-qr/batches")
async def list_batches(user=Depends(require_qr_access)):
    return await svc.list_batches(user)


@router.get("/admin/physical-qr/batch/{batch_id}/print")
async def batch_print(batch_id: str, user=Depends(require_qr_access)):
    return await svc.batch_print(user, batch_id)


# ── registry ──────────────────────────────────────────────────────────────────
@router.get("/admin/physical-qr")
async def list_qrs(status: str = "", batch_id: str = "", q: str = "",
                   page: int = 1, page_size: int = 25, user=Depends(require_qr_access)):
    return await svc.list_qrs(user, status, batch_id, q, page, page_size)


@router.get("/admin/physical-qr/merchant-search")
async def merchant_search(q: str = "", limit: int = 20, user=Depends(require_qr_access)):
    return await svc.merchant_search(q, limit)


# ── agents (admin only — enforced in service) ──────────────────────────────────
@router.get("/admin/physical-qr/agents")
async def list_agents(user=Depends(require_qr_access)):
    return await svc.list_agents(user)


@router.post("/admin/physical-qr/agents")
async def create_agent(req: AgentCreateReq, user=Depends(require_qr_access)):
    return await svc.create_agent(user, req.name, req.phone)


@router.post("/admin/physical-qr/agents/{agent_id}/batches")
async def assign_batches(agent_id: str, req: AssignBatchesReq, user=Depends(require_qr_access)):
    return await svc.assign_batches_to_agent(user, agent_id, req.batch_ids)


@router.post("/admin/physical-qr/agents/{agent_id}/toggle")
async def toggle_agent(agent_id: str, active: bool = True, user=Depends(require_qr_access)):
    return await svc.toggle_agent(user, agent_id, active)


# ── agent payouts / earnings (admin only — enforced in service) ─────────────────
def _admin_only_dep(user: dict):
    if user.get("role") not in ("admin", "superadmin", "staff"):
        raise HTTPException(status_code=403, detail="Admins only")
    return user


@router.get("/admin/physical-qr/agent-withdrawals")
async def agent_withdrawals(status: str = "", user=Depends(require_qr_access)):
    _admin_only_dep(user)
    from services import agent_service
    return await agent_service.admin_list_withdrawals(status)


@router.post("/admin/physical-qr/agent-withdrawals/{wid}/approve")
async def approve_agent_withdrawal(wid: str, user=Depends(require_qr_access)):
    _admin_only_dep(user)
    from services import agent_service
    return await agent_service.admin_process_withdrawal(user, wid, "approve")


@router.post("/admin/physical-qr/agent-withdrawals/{wid}/reject")
async def reject_agent_withdrawal(wid: str, reason: str = "", user=Depends(require_qr_access)):
    _admin_only_dep(user)
    from services import agent_service
    return await agent_service.admin_process_withdrawal(user, wid, "reject", reason)


@router.get("/admin/physical-qr/agents/{agent_id}/detail")
async def agent_detail(agent_id: str, user=Depends(require_qr_access)):
    _admin_only_dep(user)
    from services import agent_service
    return await agent_service.admin_agent_detail(agent_id)


@router.post("/admin/physical-qr/agents/{agent_id}/verify-bank")
async def verify_agent_bank(agent_id: str, verified: bool = True, user=Depends(require_qr_access)):
    _admin_only_dep(user)
    from services import agent_service
    return await agent_service.admin_verify_bank(user, agent_id, verified)


# ── single-QR detail + actions (keep AFTER the more specific /admin routes) ─────
@router.get("/admin/physical-qr/{token}")
async def get_qr(token: str, user=Depends(require_qr_access)):
    return await svc.get_qr(user, token)


@router.post("/admin/physical-qr/{token}/assign")
async def assign(token: str, req: AssignReq, user=Depends(require_qr_access)):
    return await svc.assign(user, token, req.merchant_id, req.merchant_code)


@router.post("/admin/physical-qr/{token}/disable")
async def disable(token: str, user=Depends(require_qr_access)):
    return await svc.set_status(user, token, enable=False)


@router.post("/admin/physical-qr/{token}/enable")
async def enable(token: str, user=Depends(require_qr_access)):
    return await svc.set_status(user, token, enable=True)
