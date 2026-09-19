"""Module 3 — Partner-facing routes (verification, skills, wallet, incentives)."""
from fastapi import APIRouter, Depends, Body
from services import partner_service as ps
from models.partner import (StageSubmitRequest, PartnerSkillAdd, CertificateAdd,
                            AssessmentSubmit, WithdrawalRequest, TrainingProgress,
                            AvailabilityUpdate, LeaveRequest)
from middleware.auth import require_role

router = APIRouter(prefix="/partner", tags=["partner-module3"])
PARTNER = require_role("partner")


# ---- verification ----
@router.get("/verification")
async def my_verification(user=Depends(PARTNER)):
    return await ps.partner_verification_view(user)


# ---- finance KYC: PAN + bank accounts (Point 7) ----
@router.get("/finance-kyc")
async def finance_kyc(user=Depends(PARTNER)):
    from services import partner_bank_service as pbs
    return await pbs.withdrawal_eligibility(user["id"])


@router.post("/finance-kyc/pan")
async def submit_pan(data: dict, user=Depends(PARTNER)):
    from services import partner_bank_service as pbs
    return await pbs.submit_pan(user, data.get("pan_number"), data.get("pan_url"))


@router.get("/finance-kyc/banks")
async def list_banks(user=Depends(PARTNER)):
    from services import partner_bank_service as pbs
    return await pbs.list_banks(user["id"])


@router.post("/finance-kyc/banks")
async def add_bank(data: dict, user=Depends(PARTNER)):
    from services import partner_bank_service as pbs
    return await pbs.add_bank(user, data)


@router.put("/finance-kyc/banks/{bank_id}")
async def update_bank(bank_id: str, data: dict, user=Depends(PARTNER)):
    from services import partner_bank_service as pbs
    return await pbs.update_bank(user, bank_id, data)


@router.delete("/finance-kyc/banks/{bank_id}")
async def delete_bank(bank_id: str, user=Depends(PARTNER)):
    from services import partner_bank_service as pbs
    return await pbs.delete_bank(user, bank_id)


@router.post("/finance-kyc/banks/{bank_id}/primary")
async def set_primary_bank(bank_id: str, user=Depends(PARTNER)):
    from services import partner_bank_service as pbs
    return await pbs.set_primary_bank(user, bank_id)


@router.post("/verification/{stage_key}/submit")
async def submit_stage(stage_key: str, req: StageSubmitRequest, user=Depends(PARTNER)):
    return await ps.submit_stage(user, stage_key, req.documents, req.data)


# ---- skills / assessment / certificates ----
@router.get("/skills/catalog")
async def skills_catalog(user=Depends(PARTNER)):
    return await ps.skills_catalog(active_only=True)


@router.get("/skills")
async def my_skills(user=Depends(PARTNER)):
    return await ps.partner_skills(user["id"])


@router.post("/skills")
async def add_skill(req: PartnerSkillAdd, user=Depends(PARTNER)):
    return await ps.add_partner_skill(user, req.skill_id, req.experience_years, req.level, req.is_primary)


@router.delete("/skills/{record_id}")
async def del_skill(record_id: str, user=Depends(PARTNER)):
    return await ps.remove_partner_skill(user, record_id)


@router.get("/assessment/{skill_id}")
async def get_assessment(skill_id: str, user=Depends(PARTNER)):
    return await ps.get_assessment(user, skill_id)


@router.post("/assessment/{skill_id}/submit")
async def submit_assessment(skill_id: str, req: AssessmentSubmit, user=Depends(PARTNER)):
    return await ps.submit_assessment(user, skill_id, req.answers)


@router.get("/certificates")
async def my_certificates(user=Depends(PARTNER)):
    return await ps.list_certificates(partner_id=user["id"])


@router.post("/certificates")
async def add_certificate(req: CertificateAdd, user=Depends(PARTNER)):
    return await ps.add_certificate(user, req.skill_id, req.skill_name, req.name, req.url)


@router.get("/eligibility")
async def eligibility(user=Depends(PARTNER)):
    return await ps.partner_eligibility(user)


# ---- wallet / withdrawals ----
@router.get("/wallet")
async def wallet(user=Depends(PARTNER)):
    return await ps.wallet_summary(user)


@router.get("/earnings-summary")
async def earnings_summary(user=Depends(PARTNER)):
    return await ps.earnings_summary(user)


@router.get("/analytics")
async def analytics(date_from: str = "", date_to: str = "", user=Depends(PARTNER)):
    return await ps.analytics(user, date_from, date_to)


@router.post("/location")
async def update_location(body: dict, user=Depends(PARTNER)):
    """Partner app pings its live GPS while online (for the admin live map)."""
    return await ps.update_location(user, body.get("lat"), body.get("lng"))


@router.get("/wallet/config")
async def wallet_config(user=Depends(PARTNER)):
    return await ps.get_wallet_config()


@router.get("/withdrawals")
async def my_withdrawals(user=Depends(PARTNER)):
    return await ps.list_withdrawals(partner_id=user["id"])


@router.post("/withdrawals")
async def request_withdrawal(req: WithdrawalRequest, user=Depends(PARTNER)):
    return await ps.request_withdrawal(user, req.amount, req.method, req.upi_id, req.bank)


# ---- incentives / penalties ----
@router.get("/incentives")
async def incentives(user=Depends(PARTNER)):
    return await ps.partner_incentives(user)


@router.get("/challenges")
async def challenges(user=Depends(PARTNER)):
    return await ps.partner_challenges(user)


@router.get("/leaderboard")
async def leaderboard(period: str = "all", city: str = "", skill: str = "", user=Depends(PARTNER)):
    return await ps.leaderboard(user, period=period, city=city, skill=skill)


@router.get("/my-bonuses")
async def my_bonuses(user=Depends(PARTNER)):
    return await ps.partner_bonus_history(user)


@router.get("/penalties")
async def penalties(user=Depends(PARTNER)):
    return await ps.list_penalties(partner_id=user["id"])


# ---- training ----
@router.get("/training")
async def training(user=Depends(PARTNER)):
    return await ps.partner_training(user)


@router.post("/training/{tid}/progress")
async def training_progress(tid: str, req: TrainingProgress, user=Depends(PARTNER)):
    return await ps.track_training(user, tid, req.percent, req.completed)


# ---- availability & leave ----
@router.put("/availability")
async def availability(req: AvailabilityUpdate, user=Depends(PARTNER)):
    return await ps.set_availability(user, req.mode)


@router.get("/availability/calendar")
async def availability_calendar(user=Depends(PARTNER)):
    """Daily online state + upcoming availability dates (today onward)."""
    return await ps.get_availability(user)


@router.post("/availability/calendar")
async def add_availability_calendar(payload: dict = Body(...), user=Depends(PARTNER)):
    """Add future available dates. Body: {dates:["YYYY-MM-DD", ...]}."""
    return await ps.add_availability(user, (payload or {}).get("dates") or [])


@router.post("/availability/calendar/set")
async def set_availability_date(payload: dict = Body(...), user=Depends(PARTNER)):
    """Set one date's status. Body: {date:"YYYY-MM-DD", status:"available"|"unavailable"}."""
    return await ps.set_date_status(user, (payload or {}).get("date"), (payload or {}).get("status"))


@router.delete("/availability/calendar")
async def remove_availability_calendar(payload: dict = Body(...), user=Depends(PARTNER)):
    """Remove future available dates. Body: {dates:["YYYY-MM-DD", ...]}."""
    return await ps.remove_availability(user, (payload or {}).get("dates") or [])


@router.get("/leave")
async def my_leaves(user=Depends(PARTNER)):
    return await ps.list_leaves(partner_id=user["id"])


@router.post("/leave")
async def request_leave(req: LeaveRequest, user=Depends(PARTNER)):
    return await ps.request_leave(user, req.start_date, req.end_date, req.reason)



# ---- alert preferences (account-synced) + response stats ----
from config.database import db, now_iso  # noqa: E402
from datetime import datetime, timezone, timedelta  # noqa: E402

DEFAULT_ALERT_PREFS = {"tone": "classic", "volume": 0.7,
                       "dndEnabled": False, "dndStart": "22:00", "dndEnd": "07:00",
                       "snoozeUntil": 0}


async def admin_alert_config() -> dict:
    """Ring tone / volume / quiet hours / custom sound are set ONCE by the admin
    (Integration Center → Alert Sound & Ring) and apply to every partner."""
    from config.database import get_settings
    s = await get_settings()
    ac = (s or {}).get("alert_config") or {}
    out = {
        "tone": ac.get("tone") if ac.get("tone") in ("classic", "chime", "pulse", "urgent", "beep") else "classic",
        "dndEnabled": bool(ac.get("dnd_enabled")),
        "dndStart": ac.get("dnd_start") or "22:00",
        "dndEnd": ac.get("dnd_end") or "07:00",
        "customSoundUrl": ac.get("custom_sound_url") or "",
        "customSoundName": ac.get("custom_sound_name") or "",
    }
    try:
        out["volume"] = max(0.05, min(1.0, float(ac.get("volume", 0.7))))
    except (TypeError, ValueError):
        out["volume"] = 0.7
    return out


@router.post("/test-ring")
async def partner_test_ring(user=Depends(PARTNER)):
    """Partner self-test: ring my own device(s) exactly like a real job."""
    from controllers.admin_controller import send_test_ring
    return await send_test_ring(user["id"], requested_by="partner")


@router.get("/alert-prefs")
async def get_alert_prefs(user=Depends(PARTNER)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "alert_prefs": 1})
    snooze = ((u or {}).get("alert_prefs") or {}).get("snoozeUntil", 0)
    return {**DEFAULT_ALERT_PREFS, **(await admin_alert_config()), "snoozeUntil": snooze or 0}


@router.put("/alert-prefs")
async def set_alert_prefs(prefs: dict, user=Depends(PARTNER)):
    # Only Smart Snooze is per-partner now; ring settings come from the admin config.
    try:
        snooze = max(0, int((prefs or {}).get("snoozeUntil", 0) or 0))
    except (TypeError, ValueError):
        snooze = 0
    await db.users.update_one({"id": user["id"]}, {"$set": {"alert_prefs.snoozeUntil": snooze}})
    return {**DEFAULT_ALERT_PREFS, **(await admin_alert_config()), "snoozeUntil": snooze}


@router.get("/stats")
async def partner_response_stats(user=Depends(PARTNER)):
    u = await db.users.find_one(
        {"id": user["id"]},
        {"_id": 0, "accept_streak": 1, "best_streak": 1, "accept_streak_bonus_total": 1}) or {}
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    accepted = await db.partner_response_events.count_documents(
        {"user_id": user["id"], "type": "accepted", "at": {"$gte": week_ago}})
    missed = await db.partner_response_events.count_documents(
        {"user_id": user["id"], "type": "missed", "at": {"$gte": week_ago}})
    # Accept-Streak Rewards: progress toward the next cashable wallet bonus.
    from services.partner_service import get_wallet_config
    cfg = await get_wallet_config()
    threshold = int(cfg.get("accept_streak_threshold", 5) or 5)
    bonus = float(cfg.get("accept_streak_bonus", 50) or 0)
    streak = int(u.get("accept_streak", 0) or 0)
    into = (streak % threshold) if threshold else 0
    return {"accept_streak": streak,
            "best_streak": int(u.get("best_streak", 0) or 0),
            "accepted_week": accepted, "missed_week": missed,
            "reward": {
                "enabled": bool(cfg.get("accept_streak_enabled", True)),
                "threshold": threshold,
                "bonus": bonus,
                "into_milestone": into,
                "remaining": (threshold - into) if threshold else 0,
                "progress_pct": round(into / threshold * 100) if threshold else 0,
                "total_earned": round(float(u.get("accept_streak_bonus_total", 0) or 0), 2),
            },
            "now_iso": now_iso()}
