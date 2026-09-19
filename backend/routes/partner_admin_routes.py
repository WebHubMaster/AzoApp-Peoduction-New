"""Module 3 — Admin-facing partner management routes."""
from fastapi import APIRouter, Depends
from services import partner_service as ps
from models.partner import (VerificationConfigUpdate, StageActionRequest, SkillCatalogUpsert,
                            SkillVerifyRequest, CertificateReview, WalletConfigUpdate,
                            WithdrawalAction, IncentiveUpsert, PenaltyCreate,
                            TrainingUpsert, LeaveAction)
from middleware.auth import require_role

router = APIRouter(prefix="/admin/partner", tags=["admin-partner-module3"])
ADMIN = require_role("admin")


# ---- verification config + review ----
@router.get("/verification-config")
async def get_config(admin=Depends(ADMIN)):
    return await ps.get_verification_config()


# ---- finance KYC review: PAN + bank accounts (Point 7) ----
@router.get("/finance-requests")
async def finance_requests(partner_id: str = None, admin=Depends(ADMIN)):
    from services import partner_bank_service as pbs
    return await pbs.admin_pending_requests(partner_id)


@router.get("/finance/pending-kyc")
async def pending_kyc(admin=Depends(ADMIN)):
    from services import partner_bank_service as pbs
    return await pbs.admin_pending_kyc()


@router.post("/finance/bulk-review")
async def bulk_review(data: dict, admin=Depends(ADMIN)):
    from services import partner_bank_service as pbs
    return await pbs.bulk_review(admin, data.get("pan_partner_ids"), data.get("bank_ids"),
                                 data.get("action", "approve"), data.get("reason", ""))


@router.post("/{partner_id}/finance/pan/action")
async def review_pan(partner_id: str, data: dict, admin=Depends(ADMIN)):
    from services import partner_bank_service as pbs
    return await pbs.admin_review_pan(admin, partner_id, data.get("action"), data.get("reason", ""))


@router.post("/finance/banks/{bank_id}/action")
async def review_bank(bank_id: str, data: dict, admin=Depends(ADMIN)):
    from services import partner_bank_service as pbs
    return await pbs.admin_review_bank(admin, bank_id, data.get("action"), data.get("reason", ""))


@router.put("/verification-config")
async def update_config(req: VerificationConfigUpdate, admin=Depends(ADMIN)):
    return await ps.update_verification_config(admin, req.stages)


@router.get("/{partner_id}/verification")
async def partner_verification(partner_id: str, admin=Depends(ADMIN)):
    p = await ps._partner_or_404(partner_id)
    return await ps.partner_verification_view(p)


@router.post("/{partner_id}/verification/{stage_key}/action")
async def stage_action(partner_id: str, stage_key: str, req: StageActionRequest, admin=Depends(ADMIN)):
    return await ps.admin_stage_action(admin, partner_id, stage_key, req.action, req.reason)


# ---- 360 detail ----
@router.get("/{partner_id}/detail")
async def partner_detail(partner_id: str, admin=Depends(ADMIN)):
    return await ps.admin_partner_360(partner_id)


# ---- skills catalog ----
@router.get("/skills")
async def skills(admin=Depends(ADMIN)):
    return await ps.skills_catalog(active_only=False)


@router.post("/skills")
async def create_skill(req: SkillCatalogUpsert, admin=Depends(ADMIN)):
    return await ps.create_skill(admin, req.dict())


@router.put("/skills/{skill_id}")
async def update_skill(skill_id: str, req: SkillCatalogUpsert, admin=Depends(ADMIN)):
    return await ps.update_skill(admin, skill_id, req.dict())


@router.delete("/skills/{skill_id}")
async def delete_skill(skill_id: str, admin=Depends(ADMIN)):
    return await ps.delete_skill(admin, skill_id)


@router.get("/{partner_id}/skills")
async def partner_skill_list(partner_id: str, admin=Depends(ADMIN)):
    return await ps.partner_skills(partner_id)


@router.post("/skills/{record_id}/verify")
async def verify_skill(record_id: str, req: SkillVerifyRequest, admin=Depends(ADMIN)):
    return await ps.verify_partner_skill(admin, record_id, req.action, req.verified_level, req.reason)


# ---- certificates ----
@router.get("/certificates")
async def certificates(status: str = None, admin=Depends(ADMIN)):
    return await ps.list_certificates(status=status)


@router.post("/certificates/{cert_id}/review")
async def review_certificate(cert_id: str, req: CertificateReview, admin=Depends(ADMIN)):
    return await ps.review_certificate(admin, cert_id, req.action, req.reason)


# ---- wallet config + withdrawals ----
@router.get("/wallet-config")
async def wallet_config(admin=Depends(ADMIN)):
    return await ps.get_wallet_config()


@router.put("/wallet-config")
async def update_wallet_config(req: WalletConfigUpdate, admin=Depends(ADMIN)):
    return await ps.update_wallet_config(admin, req.dict())


@router.get("/payout-log")
async def payout_log(kind: str = "", date_from: str = "", date_to: str = "",
                     page: int = 1, page_size: int = 50, admin=Depends(ADMIN)):
    """Live history of all automatic wallet credits: auto-payout incentives,
    streak bonuses and weekly leaderboard rewards."""
    return await ps.admin_payout_log(kind=kind, date_from=date_from, date_to=date_to,
                                     page=page, page_size=page_size)


@router.get("/withdrawals")
async def withdrawals(status: str = None, admin=Depends(ADMIN)):
    return await ps.list_withdrawals(status=status)


@router.post("/withdrawals/{wid}/action")
async def withdrawal_action(wid: str, req: WithdrawalAction, admin=Depends(ADMIN)):
    return await ps.process_withdrawal(admin, wid, req.action, req.reason)


@router.post("/withdrawals/{wid}/retry")
async def withdrawal_retry(wid: str, admin=Depends(ADMIN)):
    return await ps.retry_withdrawal_payout(admin, wid)


# ---- incentives ----
@router.get("/incentives")
async def incentives(admin=Depends(ADMIN)):
    return await ps.list_incentives(active_only=False)


@router.get("/incentives/overview")
async def incentives_overview(admin=Depends(ADMIN)):
    return await ps.incentives_overview()


@router.get("/incentives/{incentive_id}/eligible")
async def incentive_eligible(incentive_id: str, admin=Depends(ADMIN)):
    return await ps.incentive_eligible_partners(incentive_id)


@router.post("/incentives")
async def create_incentive(req: IncentiveUpsert, admin=Depends(ADMIN)):
    return await ps.upsert_incentive(admin, req.dict())


@router.put("/incentives/{incentive_id}")
async def update_incentive(incentive_id: str, req: IncentiveUpsert, admin=Depends(ADMIN)):
    return await ps.upsert_incentive(admin, req.dict(), incentive_id)


@router.delete("/incentives/{incentive_id}")
async def delete_incentive(incentive_id: str, admin=Depends(ADMIN)):
    return await ps.delete_incentive(admin, incentive_id)


@router.post("/incentives/{incentive_id}/award/{partner_id}")
async def award_incentive(incentive_id: str, partner_id: str, admin=Depends(ADMIN)):
    return await ps.award_incentive(admin, incentive_id, partner_id)


# ---- penalties ----
@router.get("/penalties")
async def penalties(partner_id: str = None, admin=Depends(ADMIN)):
    return await ps.list_penalties(partner_id=partner_id)


@router.get("/penalties/board")
async def penalties_board(q: str = "", type: str = "", status: str = "",
                          page: int = 1, page_size: int = 10, admin=Depends(ADMIN)):
    return await ps.penalties_board(q=q, ptype=type, status=status, page=page, page_size=page_size)


@router.get("/performance")
async def performance(q: str = "", status: str = "", kyc: str = "", min_rating: float = 0.0,
                      sort: str = "jobs_done", order: str = "desc",
                      page: int = 1, page_size: int = 10, admin=Depends(ADMIN)):
    return await ps.admin_performance(q=q, status=status, kyc=kyc, min_rating=min_rating,
                                      sort=sort, order=order, page=page, page_size=page_size)


@router.post("/penalties")
async def create_penalty(req: PenaltyCreate, admin=Depends(ADMIN)):
    return await ps.create_penalty(admin, req.partner_id, req.reason, req.type,
                                   req.amount, req.booking_id, req.note)


@router.post("/penalties/{penalty_id}/reverse")
async def reverse_penalty(penalty_id: str, admin=Depends(ADMIN)):
    return await ps.reverse_penalty(admin, penalty_id)


# ---- training ----
@router.get("/training")
async def training(admin=Depends(ADMIN)):
    return await ps.list_training(active_only=False)


@router.post("/training")
async def create_training(req: TrainingUpsert, admin=Depends(ADMIN)):
    return await ps.create_training(admin, req.dict())


@router.put("/training/{tid}")
async def update_training(tid: str, req: TrainingUpsert, admin=Depends(ADMIN)):
    return await ps.update_training(admin, tid, req.dict())


@router.delete("/training/{tid}")
async def delete_training(tid: str, admin=Depends(ADMIN)):
    return await ps.delete_training(admin, tid)


# ---- leaves ----
@router.get("/leaves")
async def leaves(status: str = None, admin=Depends(ADMIN)):
    return await ps.list_leaves(status=status)


@router.post("/leaves/{leave_id}/action")
async def leave_action(leave_id: str, req: LeaveAction, admin=Depends(ADMIN)):
    return await ps.action_leave(admin, leave_id, req.action, req.reason)
