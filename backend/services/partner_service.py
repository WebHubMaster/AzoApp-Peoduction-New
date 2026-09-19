"""Module 3 — Partner engine: verification workflow, skills/assessment eligibility,
wallet ledger, withdrawals, incentives & penalties. All financial + status logic server-side."""
from datetime import datetime, timezone
from fastapi import HTTPException
from config.database import db, now_iso
from models.user import new_id
from services import realtime as rt
from services import money

# ---------------------------------------------------------------- defaults
DEFAULT_STAGES = [
    {"key": "applied", "name": "Application Submitted", "mandatory": True,
     "requires_approval": False, "auto_approve": True, "documents": [], "order": 1},
    {"key": "documents", "name": "Documents Submitted", "mandatory": True,
     "requires_approval": True, "auto_approve": False,
     "documents": ["profile_photo", "address_proof"], "order": 2},
    {"key": "kyc", "name": "KYC Verification", "mandatory": True,
     "requires_approval": True, "auto_approve": False,
     "documents": ["aadhaar", "pan"], "order": 3},
    {"key": "background", "name": "Background Check", "mandatory": False,
     "requires_approval": True, "auto_approve": False,
     "documents": ["police_verification"], "order": 4},
    {"key": "skill_assessment", "name": "Skill Assessment / Interview", "mandatory": False,
     "requires_approval": True, "auto_approve": False, "documents": [], "order": 5},
    {"key": "training", "name": "Training", "mandatory": False,
     "requires_approval": True, "auto_approve": False, "documents": [], "order": 6},
    {"key": "assessment", "name": "Final Assessment / Test", "mandatory": False,
     "requires_approval": True, "auto_approve": False, "documents": [], "order": 7},
    {"key": "final_approval", "name": "Admin Approval", "mandatory": True,
     "requires_approval": True, "auto_approve": False, "documents": [], "order": 8},
]

DEFAULT_WALLET_CONFIG = {
    "id": "config", "min_withdrawal": 100, "max_withdrawal": 50000,
    "processing_fee_pct": 0, "processing_fee_flat": 0,
    "upi_enabled": True, "bank_enabled": True, "frequency_days": 0,
    # --- Auto Payout: credit incentive bonus to wallet the moment it unlocks,
    #     without any admin approval. ---
    "auto_payout_enabled": True,
    # --- Streak Bonuses: consecutive 5-star jobs earn an auto-increasing bonus. ---
    "streak_enabled": True,
    "streak_threshold": 5,        # every N consecutive 5-star jobs = 1 milestone
    "streak_base_bonus": 100,     # bonus paid at the 1st milestone
    "streak_increment": 50,       # extra bonus added at each further milestone
    "streak_reminder_enabled": True,   # daily evening nudge to keep the streak alive
    # --- Streak Freeze: protect the streak from ONE off-day per week. ---
    "streak_freeze_enabled": True,
    "streak_freeze_per_week": 1,       # freezes a partner gets each week
    # --- Weekly Leaderboard Rewards: auto-bonus the previous week's top 3. ---
    "leaderboard_rewards_enabled": True,
    "leaderboard_reward_top3": [500, 300, 200],   # ₹ for rank 1 / 2 / 3
    # --- Accept-Streak Rewards: accepting N job requests in a row (without a
    #     missed/timed-out request) credits a small cashable wallet bonus. ---
    "accept_streak_enabled": True,
    "accept_streak_threshold": 5,   # every N accepts-in-a-row = 1 milestone
    "accept_streak_bonus": 50,      # flat ₹ credited at each milestone
}


# ---------------------------------------------------------------- helpers
async def notify(user_id, title, body, event_type=None, ctx=None):
    """Unified dynamic notification for partner flows: in-app + real-time SSE + push
    ALWAYS; SMS/email only when an ACTIVE template exists for the event. This ensures
    partner events (withdrawals, incentives, streaks, penalties) reach the device."""
    ctx = ctx or {}
    try:
        from services.template_service import fire_event
        await fire_event(user_id, event_type or "general", ctx=ctx,
                         fallback_title=title, fallback_body=body, link="/partner")
    except Exception:
        pass


async def audit(actor, action, target_id, meta=None):
    await db.audit_logs.insert_one({
        "id": new_id(), "action": action, "actor_id": (actor or {}).get("id"),
        "actor_name": (actor or {}).get("name"), "target_id": target_id,
        "meta": meta or {}, "created_at": now_iso()})


async def _partner_or_404(partner_id):
    p = await db.users.find_one({"id": partner_id, "role": "partner"}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Partner not found")
    return p


# ---------------------------------------------------------------- verification config
async def get_verification_config():
    cfg = await db.partner_verification_config.find_one({"id": "config"}, {"_id": 0})
    if not cfg:
        cfg = {"id": "config", "stages": DEFAULT_STAGES, "updated_at": now_iso()}
        await db.partner_verification_config.insert_one(dict(cfg))
    cfg["stages"] = sorted(cfg.get("stages", []), key=lambda s: s.get("order", 0))
    return cfg


async def update_verification_config(admin, stages):
    for i, s in enumerate(stages):
        s.setdefault("key", (s.get("name", "stage").lower().replace(" ", "_"))[:40] or f"stage_{i}")
        s["order"] = i + 1
        s.setdefault("mandatory", False)
        s.setdefault("requires_approval", True)
        s.setdefault("auto_approve", False)
        s.setdefault("documents", [])
    await db.partner_verification_config.update_one(
        {"id": "config"}, {"$set": {"stages": stages, "updated_at": now_iso()}}, upsert=True)
    await audit(admin, "partner.verification_config.update", "config", {"count": len(stages)})
    return await get_verification_config()


async def _ensure_verification_doc(partner):
    doc = await db.partner_verifications.find_one({"id": partner["id"]}, {"_id": 0})
    cfg = await get_verification_config()
    if not doc:
        stages = {}
        for s in cfg["stages"]:
            status = "approved" if (s.get("auto_approve") and not s.get("requires_approval")) else "pending"
            stages[s["key"]] = {"status": status, "documents": [], "data": {},
                                "reason": "", "submitted_at": None, "reviewed_at": None}
        doc = {"id": partner["id"], "partner_id": partner["id"],
               "overall": "in_progress", "stages": stages, "created_at": now_iso(),
               "updated_at": now_iso()}
        await db.partner_verifications.insert_one(dict(doc))
        doc.pop("_id", None)
    else:
        # backfill any newly-added stages
        changed = False
        for s in cfg["stages"]:
            if s["key"] not in doc["stages"]:
                doc["stages"][s["key"]] = {"status": "pending", "documents": [], "data": {},
                                           "reason": "", "submitted_at": None, "reviewed_at": None}
                changed = True
        if changed:
            await db.partner_verifications.update_one({"id": partner["id"]},
                                                      {"$set": {"stages": doc["stages"]}})
    return doc, cfg


async def partner_verification_view(partner):
    doc, cfg = await _ensure_verification_doc(partner)
    stages = []
    for s in cfg["stages"]:
        st = doc["stages"].get(s["key"], {})
        stages.append({**s, **st, "key": s["key"], "name": s["name"]})
    # current = first non-approved mandatory-or-any stage
    current = next((s["key"] for s in stages if s["status"] not in ("approved",)), None)
    return {"overall": doc["overall"], "current_stage": current, "stages": stages,
            "verified_partner": (doc["overall"] == "approved")}


async def submit_stage(partner, stage_key, documents, data):
    doc, cfg = await _ensure_verification_doc(partner)
    stage_def = next((s for s in cfg["stages"] if s["key"] == stage_key), None)
    if not stage_def:
        raise HTTPException(status_code=404, detail="Unknown verification stage")
    await _training_gate(partner, stage_key)
    st = doc["stages"][stage_key]
    st["documents"] = documents or st.get("documents", [])
    st["data"] = {**st.get("data", {}), **(data or {})}
    st["reason"] = ""
    st["submitted_at"] = now_iso()
    if stage_def.get("auto_approve"):
        st["status"] = "approved"
        st["reviewed_at"] = now_iso()
    else:
        st["status"] = "under_review" if stage_def.get("requires_approval") else "approved"
    doc["stages"][stage_key] = st
    await db.partner_verifications.update_one(
        {"id": partner["id"]}, {"$set": {f"stages.{stage_key}": st, "updated_at": now_iso()}})
    await _recompute_overall(partner["id"])
    return await partner_verification_view(partner)


async def admin_stage_action(admin, partner_id, stage_key, action, reason):
    partner = await _partner_or_404(partner_id)
    doc, cfg = await _ensure_verification_doc(partner)
    if stage_key not in doc["stages"]:
        raise HTTPException(status_code=404, detail="Unknown stage")
    st = doc["stages"][stage_key]
    if action == "approve":
        st["status"] = "approved"
        st["reason"] = ""
    elif action == "reject":
        st["status"] = "rejected"
        st["reason"] = reason or "Rejected by admin"
    else:
        raise HTTPException(status_code=400, detail="action must be approve|reject")
    st["reviewed_at"] = now_iso()
    doc["stages"][stage_key] = st
    await db.partner_verifications.update_one(
        {"id": partner_id}, {"$set": {f"stages.{stage_key}": st, "updated_at": now_iso()}})
    await audit(admin, f"partner.verification.{action}", partner_id,
                {"stage": stage_key, "reason": reason})
    stage_name = next((s["name"] for s in cfg["stages"] if s["key"] == stage_key), stage_key)
    if action == "reject":
        await notify(partner_id, f"Verification: {stage_name} rejected",
                     f"{reason or 'Please review and resubmit.'}")
    else:
        await notify(partner_id, f"Verification: {stage_name} approved", "You may proceed to the next step.")
    await _recompute_overall(partner_id)
    return await partner_verification_view(partner)


async def _recompute_overall(partner_id):
    doc = await db.partner_verifications.find_one({"id": partner_id}, {"_id": 0})
    cfg = await get_verification_config()
    mandatory = [s for s in cfg["stages"] if s.get("mandatory")]
    all_mand_ok = all(doc["stages"].get(s["key"], {}).get("status") == "approved" for s in mandatory)
    any_rejected = any(v.get("status") == "rejected" for v in doc["stages"].values())
    overall = "approved" if all_mand_ok else ("action_required" if any_rejected else "in_progress")
    upd = {"overall": overall, "updated_at": now_iso()}
    await db.partner_verifications.update_one({"id": partner_id}, {"$set": upd})
    # sync user record
    if overall == "approved":
        await db.users.update_one({"id": partner_id},
                                  {"$set": {"kyc_status": "approved", "verified_partner": True}})
        u = await db.users.find_one({"id": partner_id}, {"_id": 0, "name": 1})
        await notify(partner_id, "You are a Verified Partner!",
                     "Verification complete. Go online to start receiving jobs.",
                     event_type="partner_verified", ctx={"partner_name": (u or {}).get("name", "")})
    else:
        await db.users.update_one({"id": partner_id}, {"$set": {"verified_partner": False}})
    return overall


# ---------------------------------------------------------------- skills / assessment
def _strip_answers(skill):
    q = []
    for i, item in enumerate(skill.get("questions", [])):
        q.append({"id": item.get("id") or str(i), "q": item.get("q"),
                  "options": item.get("options", [])})
    return q


async def skills_catalog(active_only=True):
    q = {"status": "active"} if active_only else {}
    return await db.partner_skills_catalog.find(q, {"_id": 0}).sort("name", 1).to_list(500)


async def create_skill(admin, data: dict):
    for i, item in enumerate(data.get("questions", [])):
        item.setdefault("id", new_id()[:8])
    doc = {"id": new_id(), **data, "created_at": now_iso()}
    await db.partner_skills_catalog.insert_one(dict(doc))
    await audit(admin, "partner.skill.create", doc["id"], {"name": data.get("name")})
    doc.pop("_id", None)
    return doc


async def update_skill(admin, skill_id, data: dict):
    for item in data.get("questions", []):
        item.setdefault("id", new_id()[:8])
    data.pop("id", None)
    r = await db.partner_skills_catalog.update_one({"id": skill_id}, {"$set": data})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Skill not found")
    await audit(admin, "partner.skill.update", skill_id, {})
    return await db.partner_skills_catalog.find_one({"id": skill_id}, {"_id": 0})


async def delete_skill(admin, skill_id):
    await db.partner_skills_catalog.delete_one({"id": skill_id})
    await audit(admin, "partner.skill.delete", skill_id, {})
    return {"ok": True}


async def partner_skills(partner_id):
    return await db.partner_skills.find({"partner_id": partner_id}, {"_id": 0}).to_list(100)


async def add_partner_skill(partner, skill_id, experience_years, level, is_primary):
    skill = await db.partner_skills_catalog.find_one({"id": skill_id}, {"_id": 0})
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    existing = await db.partner_skills.find_one(
        {"partner_id": partner["id"], "skill_id": skill_id}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Skill already added")
    assess = "pending" if skill.get("requires_assessment") else "not_required"
    doc = {"id": new_id(), "partner_id": partner["id"], "skill_id": skill_id,
           "skill_name": skill["name"], "experience_years": float(experience_years),
           "declared_level": level, "level": level, "verified_level": None,
           "is_primary": bool(is_primary), "verified": False, "status": "self_declared",
           "assessment_status": assess, "requires_certificate": skill.get("requires_certificate", False),
           "requires_assessment": skill.get("requires_assessment", False),
           "min_experience": skill.get("min_experience", 0),
           "rating": 5.0, "jobs_completed": 0, "created_at": now_iso()}
    await db.partner_skills.insert_one(dict(doc))
    # keep user.skills array in sync for MatchingEngine
    await db.users.update_one({"id": partner["id"]}, {"$addToSet": {"skills": skill["name"]}})
    doc.pop("_id", None)
    return doc


async def remove_partner_skill(partner, record_id):
    rec = await db.partner_skills.find_one({"id": record_id, "partner_id": partner["id"]}, {"_id": 0})
    if rec:
        await db.partner_skills.delete_one({"id": record_id})
        await db.users.update_one({"id": partner["id"]}, {"$pull": {"skills": rec.get("skill_name")}})
    return {"ok": True}


async def verify_partner_skill(admin, record_id, action, verified_level, reason):
    rec = await db.partner_skills.find_one({"id": record_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Skill record not found")
    if action == "approve":
        upd = {"verified": True, "status": "verified",
               "verified_level": verified_level or rec.get("level"),
               "level": verified_level or rec.get("level")}
    else:
        upd = {"verified": False, "status": "rejected", "reason": reason or ""}
    await db.partner_skills.update_one({"id": record_id}, {"$set": upd})
    await audit(admin, f"partner.skill.{action}", rec["partner_id"],
                {"skill": rec.get("skill_name")})
    await notify(rec["partner_id"], f"Skill {rec.get('skill_name')} {action}d",
                 reason or f"Your skill was {action}d by admin.")
    return await db.partner_skills.find_one({"id": record_id}, {"_id": 0})


async def get_assessment(partner, skill_id):
    skill = await db.partner_skills_catalog.find_one({"id": skill_id}, {"_id": 0})
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    if not skill.get("requires_assessment"):
        raise HTTPException(status_code=400, detail="No assessment for this skill")
    attempts = await db.partner_assessment_attempts.count_documents(
        {"partner_id": partner["id"], "skill_id": skill_id})
    return {"skill_id": skill_id, "skill_name": skill["name"],
            "passing_score": skill.get("passing_score", 70),
            "time_limit_min": skill.get("time_limit_min", 15),
            "max_attempts": skill.get("max_attempts", 3), "attempts_used": attempts,
            "questions": _strip_answers(skill)}


async def submit_assessment(partner, skill_id, answers):
    skill = await db.partner_skills_catalog.find_one({"id": skill_id}, {"_id": 0})
    if not skill or not skill.get("requires_assessment"):
        raise HTTPException(status_code=400, detail="No assessment for this skill")
    attempts = await db.partner_assessment_attempts.count_documents(
        {"partner_id": partner["id"], "skill_id": skill_id})
    if attempts >= skill.get("max_attempts", 3):
        raise HTTPException(status_code=400, detail="Maximum attempts reached")
    questions = skill.get("questions", [])
    if not questions:
        raise HTTPException(status_code=400, detail="Assessment has no questions configured")
    correct = 0
    for i, item in enumerate(questions):
        qid = item.get("id") or str(i)
        if str(answers.get(qid, answers.get(str(i), -1))) == str(item.get("answer_index")):
            correct += 1
    score = round(correct / len(questions) * 100, 1)
    passed = score >= skill.get("passing_score", 70)
    attempt = {"id": new_id(), "partner_id": partner["id"], "skill_id": skill_id,
               "skill_name": skill["name"], "score": score, "passed": passed,
               "attempt_no": attempts + 1, "created_at": now_iso()}
    await db.partner_assessment_attempts.insert_one(dict(attempt))
    await db.partner_skills.update_one(
        {"partner_id": partner["id"], "skill_id": skill_id},
        {"$set": {"assessment_status": "passed" if passed else "failed",
                  "assessment_score": score}})
    attempt.pop("_id", None)
    return {"score": score, "passed": passed, "passing_score": skill.get("passing_score", 70),
            "attempt_no": attempts + 1,
            "attempts_left": max(skill.get("max_attempts", 3) - attempts - 1, 0)}


# certificates
async def add_certificate(partner, skill_id, skill_name, name, url):
    doc = {"id": new_id(), "partner_id": partner["id"], "skill_id": skill_id or "",
           "skill_name": skill_name or "", "name": name, "url": url,
           "status": "pending", "reason": "", "created_at": now_iso()}
    await db.partner_certificates.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


async def list_certificates(partner_id=None, status=None):
    q = {}
    if partner_id:
        q["partner_id"] = partner_id
    if status:
        q["status"] = status
    return await db.partner_certificates.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


async def review_certificate(admin, cert_id, action, reason):
    status = "verified" if action == "verify" else "rejected"
    r = await db.partner_certificates.find_one_and_update(
        {"id": cert_id}, {"$set": {"status": status, "reason": reason or "",
                                   "reviewed_at": now_iso()}})
    if not r:
        raise HTTPException(status_code=404, detail="Certificate not found")
    await audit(admin, f"partner.certificate.{status}", r["partner_id"], {"cert": cert_id})
    await notify(r["partner_id"], f"Certificate {status}", reason or f"Certificate {status}.")
    return await db.partner_certificates.find_one({"id": cert_id}, {"_id": 0})


# eligibility
async def partner_eligibility(partner):
    skills = await partner_skills(partner["id"])
    verif = await db.partner_verifications.find_one({"id": partner["id"]}, {"_id": 0})
    kyc_ok = partner.get("kyc_status") == "approved"
    out = []
    for s in skills:
        reasons = []
        if not kyc_ok:
            reasons.append("KYC not approved")
        if s.get("requires_certificate"):
            cert = await db.partner_certificates.find_one(
                {"partner_id": partner["id"], "skill_id": s["skill_id"], "status": "verified"})
            if not cert:
                reasons.append("Certificate not verified")
        if s.get("requires_assessment") and s.get("assessment_status") != "passed":
            reasons.append("Assessment not passed")
        if float(s.get("experience_years", 0)) < float(s.get("min_experience", 0)):
            reasons.append(f"Need {s.get('min_experience')}y experience")
        out.append({"skill_id": s["skill_id"], "skill_name": s["skill_name"],
                    "eligible": len(reasons) == 0, "blockers": reasons,
                    "assessment_status": s.get("assessment_status"),
                    "level": s.get("level"), "verified": s.get("verified")})
    return {"kyc_status": partner.get("kyc_status"),
            "verified_partner": bool(partner.get("verified_partner")), "skills": out}


# ---------------------------------------------------------------- wallet / ledger
async def get_wallet_config():
    cfg = await db.partner_wallet_config.find_one({"id": "config"}, {"_id": 0})
    if not cfg:
        cfg = dict(DEFAULT_WALLET_CONFIG)
        await db.partner_wallet_config.insert_one(dict(cfg))
        cfg.pop("_id", None)
    else:
        # Merge with defaults to ensure new fields are present
        merged = dict(DEFAULT_WALLET_CONFIG)
        merged.update(cfg)
        cfg = merged
    return cfg


async def update_wallet_config(admin, data: dict):
    data = {k: v for k, v in data.items() if v is not None}
    await db.partner_wallet_config.update_one({"id": "config"}, {"$set": data}, upsert=True)
    await audit(admin, "partner.wallet_config.update", "config", data)
    return await get_wallet_config()


async def record_earning(partner_id, amount, booking_code, booking_id):
    """Called on job completion — mirrors commission into partner_ledger (wallet_balance already inc)."""
    await db.partner_ledger.insert_one({
        "id": new_id(), "partner_id": partner_id, "kind": "earning", "direction": "credit",
        "amount": money.money(amount), "ref_type": "booking", "ref_id": booking_id,
        "note": f"Job earning · {booking_code}", "status": "completed", "created_at": now_iso()})


async def _ledger_entries(partner_id):
    return await db.partner_ledger.find({"partner_id": partner_id}, {"_id": 0}) \
        .sort("created_at", -1).to_list(1000)


async def wallet_summary(partner):
    entries = await _ledger_entries(partner["id"])
    balance = float(partner.get("wallet_balance", 0))
    locked = money.add(*[e["amount"] for e in entries
                         if e["kind"] == "withdrawal" and e["status"] == "pending"])
    total_earned = money.add(*[e["amount"] for e in entries if e["kind"] in ("earning", "visiting_charge")])
    total_incentive = money.add(*[e["amount"] for e in entries if e["kind"] == "incentive"])
    total_penalty = money.add(*[e["amount"] for e in entries if e["kind"] == "penalty"])
    total_withdrawn = money.add(*[e["amount"] for e in entries
                                  if e["kind"] == "withdrawal" and e["status"] == "completed"])
    return {
        "available_balance": money.money(balance),
        "withdrawable_balance": max(money.add(balance, -locked), 0.0),
        "pending_balance": money.money(locked),
        "total_earned": money.money(total_earned),
        "total_incentive": money.money(total_incentive),
        "total_penalty": money.money(total_penalty),
        "total_withdrawn": money.money(total_withdrawn),
        "ledger": entries,
    }


async def request_withdrawal(partner, amount, method, upi_id, bank):
    # Point 7: partner must have a VERIFIED PAN + at least one VERIFIED bank account.
    from services import partner_bank_service
    elig = await partner_bank_service.withdrawal_eligibility(partner["id"])
    if not elig["eligible"]:
        raise HTTPException(status_code=400,
                            detail="Complete KYC first: " + ", ".join(elig["blockers"]))
    cfg = await get_wallet_config()
    # UPI payouts are permanently removed — bank account is the ONLY payout destination.
    if method != "bank":
        raise HTTPException(status_code=400, detail="Payouts are sent to your verified bank account only. UPI payout is not supported.")
    if not cfg.get("bank_enabled"):
        raise HTTPException(status_code=400, detail="Bank withdrawal is disabled")
    if amount < cfg.get("min_withdrawal", 0):
        raise HTTPException(status_code=400, detail=f"Minimum withdrawal is ₹{cfg.get('min_withdrawal')}")
    if cfg.get("max_withdrawal") and amount > cfg["max_withdrawal"]:
        raise HTTPException(status_code=400, detail=f"Maximum withdrawal is ₹{cfg.get('max_withdrawal')}")
    if method == "upi" and not (upi_id or "").strip():
        raise HTTPException(status_code=400, detail="UPI ID required")
    if method == "bank" and not (bank and bank.get("account_number")):
        raise HTTPException(status_code=400, detail="Bank details required")
    # prevent duplicate pending
    dup = await db.partner_withdrawals.find_one(
        {"partner_id": partner["id"], "status": "pending"})
    if dup:
        raise HTTPException(status_code=400, detail="You already have a pending withdrawal request")
    summary = await wallet_summary(partner)
    if amount > summary["withdrawable_balance"]:
        raise HTTPException(status_code=400, detail="Insufficient withdrawable balance")
    fee = money.add(money.pct(amount, cfg.get("processing_fee_pct", 0) or 0), cfg.get("processing_fee_flat", 0) or 0)
    wid = new_id()
    doc = {"id": wid, "partner_id": partner["id"], "partner_name": partner.get("name"),
           "amount": money.money(amount), "fee": fee, "net_amount": money.add(amount, -fee),
           "method": method, "upi_id": upi_id or "", "bank": bank or {},
           "status": "pending", "reason": "", "requested_at": now_iso(),
           "processed_at": None, "processed_by": None}
    await db.partner_withdrawals.insert_one(dict(doc))
    # lock via ledger (pending debit)
    await db.partner_ledger.insert_one({
        "id": new_id(), "partner_id": partner["id"], "kind": "withdrawal", "direction": "debit",
        "amount": money.money(amount), "ref_type": "withdrawal", "ref_id": wid,
        "note": f"Withdrawal request ({method.upper()})", "status": "pending", "created_at": now_iso()})
    doc.pop("_id", None)
    return doc


async def list_withdrawals(partner_id=None, status=None):
    q = {}
    if partner_id:
        q["partner_id"] = partner_id
    if status:
        q["status"] = status
    return await db.partner_withdrawals.find(q, {"_id": 0}).sort("requested_at", -1).to_list(500)


async def update_location(partner, lat, lng):
    """Store the partner's latest GPS + timestamp for the admin live map."""
    if lat is None or lng is None:
        return {"ok": False}
    await db.users.update_one({"id": partner["id"]}, {"$set": {
        "live_location": {"lat": float(lat), "lng": float(lng)},
        "live_location_at": now_iso()}})
    # Push to the admin Live Partner Map in real time (no refresh needed).
    rt.emit_admin("partner_location", {
        "id": partner["id"], "name": partner.get("name"), "phone": partner.get("phone"),
        "lat": float(lat), "lng": float(lng), "at": now_iso(),
    })
    return {"ok": True}


async def earnings_summary(partner):
    """Partner earnings with today/week/month totals, a 14-day daily series, and
    payout (withdrawal) history — Point 11."""
    from datetime import timedelta
    pid = partner["id"]
    ledger = await db.commission_ledger.find(
        {"partner_id": pid, "partner_earning": {"$gt": 0}}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    wk = (now - timedelta(days=now.weekday())).date().isoformat()
    mo = now.date().replace(day=1).isoformat()
    t_today = t_week = t_month = t_all = 0.0
    daily = {}
    for l in ledger:
        amt = float(l.get("partner_earning", 0))
        d = str(l.get("created_at", ""))[:10]
        t_all += amt
        if d >= today:
            t_today += amt
        if d >= wk:
            t_week += amt
        if d >= mo:
            t_month += amt
        daily[d] = money.add(daily.get(d, 0), amt)
    series = [{"date": (now - timedelta(days=i)).date().isoformat(),
               "amount": daily.get((now - timedelta(days=i)).date().isoformat(), 0)}
              for i in range(13, -1, -1)]
    payouts = await db.partner_withdrawals.find({"partner_id": pid}, {"_id": 0}).sort("requested_at", -1).to_list(200)
    # Enrich the displayed rows with a transparent, math-consistent breakdown:
    #   Gross − Tax − Total Platform Commission = Net Earning
    # The partner sees ONE "Total Platform Commission" that already includes any
    # merchant distribution internally (spec #10/#11/#14/#20). Merchant commission is
    # NEVER shown to the partner as a separate line. Tax uses the SAME booking value
    # as the customer invoice (spec #15). Old ledgers (no tax field) fall back to the
    # booking's stored pricing.tax so historical rows stay correct.
    recent = ledger[:20]
    bids = [l.get("booking_id") for l in recent if l.get("booking_id")]
    bmap = {}
    if bids:
        async for b in db.bookings.find({"id": {"$in": bids}}, {"_id": 0, "id": 1, "pricing": 1}):
            bmap[b["id"]] = (b.get("pricing") or {})
    for l in recent:
        pr = bmap.get(l.get("booking_id"), {})
        gross = money.money(l.get("gross", pr.get("total", 0)) or 0)
        tax = money.money(l.get("tax", pr.get("tax", 0)) or 0)
        net = money.money(l.get("partner_total", l.get("partner_earning", 0)) or 0)
        l["gross"] = gross
        l["tax"] = tax
        l["net_earning"] = net
        l["platform_commission"] = money.add(gross, -tax, -net)  # total, merchant-inclusive
    return {
        "today": money.money(t_today), "this_week": money.money(t_week),
        "this_month": money.money(t_month), "lifetime": money.money(t_all),
        "jobs_paid": len(ledger), "daily": series,
        "recent": recent, "payouts": payouts,
    }



async def process_withdrawal(admin, wid, action, reason):
    w = await db.partner_withdrawals.find_one({"id": wid}, {"_id": 0})
    if not w:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if w["status"] != "pending":
        raise HTTPException(status_code=400, detail="Already processed")
    if action == "approve":
        # finalise: debit wallet_balance, mark ledger completed
        await db.users.update_one({"id": w["partner_id"]},
                                  {"$inc": {"wallet_balance": -w["amount"]}})
        # Initiate the actual payout (RazorpayX when configured, else safe simulation).
        from services import payout_service
        payout = await payout_service.create_payout(w)
        payout_ok = payout.get("status") in ("processed", "queued", "processing")
        wd_status = "completed" if payout_ok else "failed"
        await db.partner_ledger.update_one(
            {"ref_id": wid, "kind": "withdrawal"},
            {"$set": {"status": "completed" if payout_ok else "processing",
                      "note": f"Withdrawal {'paid' if payout_ok else 'payout failed'} ({w['method'].upper()})"}})
        await db.partner_withdrawals.update_one(
            {"id": wid}, {"$set": {"status": wd_status, "processed_at": now_iso(),
                                   "processed_by": admin.get("id"), "payout": payout}})
        await db.transactions.insert_one({
            "id": new_id(), "user_id": w["partner_id"], "amount": w["amount"], "type": "debit",
            "kind": "withdrawal", "note": f"Withdrawal {w['method'].upper()}", "created_at": now_iso()})
        _pm = "UPI" if w["method"] == "upi" else "bank account"
        if payout_ok:
            await notify(w["partner_id"], "Withdrawal approved",
                         f"₹{w['net_amount']} is on its way to your {_pm}"
                         + (f" (ref {payout.get('payout_id')})." if payout.get("payout_id") else "."),
                         event_type="withdrawal_approved",
                         ctx={"amount": w.get("net_amount")})
        else:
            await notify(w["partner_id"], "Withdrawal payout failed",
                         "We hit an issue sending your payout. Our team will retry shortly.")
        status = wd_status
    elif action == "reject":
        await db.partner_ledger.update_one({"ref_id": wid, "kind": "withdrawal"},
                                           {"$set": {"status": "cancelled"}})
        await db.partner_withdrawals.update_one(
            {"id": wid}, {"$set": {"status": "rejected", "reason": reason or "",
                                   "processed_at": now_iso(), "processed_by": admin.get("id")}})
        await notify(w["partner_id"], "Withdrawal rejected",
                     reason or "Your withdrawal was rejected; amount released back to wallet.",
                     event_type="withdrawal_rejected",
                     ctx={"amount": w.get("amount"), "reason": reason or ""})
        status = "rejected"
    else:
        raise HTTPException(status_code=400, detail="action must be approve|reject")
    await audit(admin, f"partner.withdrawal.{status}", w["partner_id"], {"amount": w["amount"]})
    return await db.partner_withdrawals.find_one({"id": wid}, {"_id": 0})


async def retry_withdrawal_payout(admin, wid):
    """Re-attempt a payout that previously failed. Wallet was already debited on
    approval, so we only re-fire the payout via RazorpayX (or simulation)."""
    w = await db.partner_withdrawals.find_one({"id": wid}, {"_id": 0})
    if not w:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    prev = w.get("payout") or {}
    if w.get("status") not in ("failed",) and prev.get("status") not in ("failed", "reversed"):
        raise HTTPException(status_code=400, detail="Only failed payouts can be retried")
    from services import payout_service
    payout = await payout_service.create_payout(w)
    payout_ok = payout.get("status") in ("processed", "queued", "processing")
    new_status = "completed" if payout_ok else "failed"
    await db.partner_withdrawals.update_one({"id": wid}, {"$set": {
        "status": new_status, "payout": payout, "retried_at": now_iso(),
        "processed_by": admin.get("id")}})
    await db.partner_ledger.update_one(
        {"ref_id": wid, "kind": "withdrawal"},
        {"$set": {"status": "completed" if payout_ok else "processing",
                  "note": f"Withdrawal {'paid on retry' if payout_ok else 'retry failed'} ({w['method'].upper()})"}})
    if payout_ok:
        _pm = "UPI" if w["method"] == "upi" else "bank account"
        await notify(w["partner_id"], "Withdrawal paid",
                     f"₹{w['net_amount']} has been sent to your {_pm}"
                     + (f" (ref {payout.get('payout_id')})." if payout.get("payout_id") else "."))
    await audit(admin, f"partner.withdrawal.retry.{new_status}", w["partner_id"], {"amount": w["amount"]})
    return await db.partner_withdrawals.find_one({"id": wid}, {"_id": 0})


# ---------------------------------------------------------------- incentives
async def list_incentives(active_only=False):
    q = {"status": "active"} if active_only else {}
    return await db.partner_incentives.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)


async def upsert_incentive(admin, data: dict, incentive_id=None):
    if incentive_id:
        data.pop("id", None)
        await db.partner_incentives.update_one({"id": incentive_id}, {"$set": data})
        await audit(admin, "partner.incentive.update", incentive_id, {})
        return await db.partner_incentives.find_one({"id": incentive_id}, {"_id": 0})
    doc = {"id": new_id(), **data, "created_at": now_iso()}
    await db.partner_incentives.insert_one(dict(doc))
    await audit(admin, "partner.incentive.create", doc["id"], {"name": data.get("name")})
    doc.pop("_id", None)
    return doc


async def delete_incentive(admin, incentive_id):
    await db.partner_incentives.delete_one({"id": incentive_id})
    await audit(admin, "partner.incentive.delete", incentive_id, {})
    return {"ok": True}


async def _incentive_progress(partner, inc):
    q = {"partner_id": partner["id"]}
    lg = await db.commission_ledger.find(q, {"_id": 0}).to_list(2000)
    def in_window(created):
        if inc.get("start_date") and created < inc["start_date"]:
            return False
        if inc.get("end_date") and created > inc["end_date"] + "T23:59:59":
            return False
        return True
    jobs = [l for l in lg if in_window(l.get("created_at", ""))]
    job_count = len(jobs)
    revenue = money.add(*[l.get("partner_earning", 0) for l in jobs])
    rating = float(partner.get("rating", 5))
    job_ok = job_count >= inc.get("job_target", 0)
    rev_ok = revenue >= inc.get("revenue_target", 0)
    rating_ok = rating >= inc.get("rating_min", 0)
    eligible = job_ok and rev_ok and rating_ok
    target = inc.get("job_target", 0) or 1
    pct = min(round(job_count / target * 100), 100) if inc.get("job_target") else (100 if eligible else 0)
    award = await db.partner_incentive_awards.find_one(
        {"incentive_id": inc["id"], "partner_id": partner["id"]}, {"_id": 0})
    return {"id": inc["id"], "name": inc["name"], "description": inc.get("description"),
            "bonus_amount": inc.get("bonus_amount", 0), "job_target": inc.get("job_target", 0),
            "revenue_target": inc.get("revenue_target", 0), "rating_min": inc.get("rating_min", 0),
            "start_date": inc.get("start_date"), "end_date": inc.get("end_date"),
            "jobs_done": job_count, "revenue": revenue, "rating": rating,
            "progress_pct": pct, "eligible": eligible,
            "remaining_jobs": max(inc.get("job_target", 0) - job_count, 0),
            "claim_status": (award or {}).get("status", "none")}


async def partner_incentives(partner):
    incs = await list_incentives(active_only=True)
    return [await _incentive_progress(partner, inc) for inc in incs]


async def _credit_incentive_award(inc, partner_id, actor, auto=False):
    """Core credit path shared by manual admin award + Auto Payout.
    Marks the award paid, credits the wallet and writes ledger/transaction rows.
    Returns the amount credited (idempotent — returns 0 if already paid)."""
    existing = await db.partner_incentive_awards.find_one(
        {"incentive_id": inc["id"], "partner_id": partner_id, "status": "paid"})
    if existing:
        return 0
    amount = inc.get("bonus_amount", 0)
    await db.partner_incentive_awards.update_one(
        {"incentive_id": inc["id"], "partner_id": partner_id},
        {"$set": {"id": new_id(), "incentive_id": inc["id"], "partner_id": partner_id,
                  "amount": amount, "status": "paid", "auto": bool(auto),
                  "created_at": now_iso()}}, upsert=True)
    await db.users.update_one({"id": partner_id}, {"$inc": {"wallet_balance": amount}})
    await db.partner_ledger.insert_one({
        "id": new_id(), "partner_id": partner_id, "kind": "incentive", "direction": "credit",
        "amount": amount, "ref_type": "incentive", "ref_id": inc["id"],
        "note": f"{'Auto ' if auto else ''}Incentive · {inc['name']}",
        "status": "completed", "created_at": now_iso()})
    await db.transactions.insert_one({
        "id": new_id(), "user_id": partner_id, "amount": amount, "type": "credit",
        "kind": "incentive", "note": f"Incentive {inc['name']}", "created_at": now_iso()})
    await audit(actor, "partner.incentive.auto_award" if auto else "partner.incentive.award",
                partner_id, {"incentive": inc["id"], "amount": amount, "auto": bool(auto)})
    await notify(partner_id, "Incentive credited!",
                 f"₹{amount} bonus for {inc['name']} added to your wallet"
                 + (" automatically." if auto else "."),
                 event_type="incentive_awarded", ctx={"amount": amount})
    return amount


async def award_incentive(admin, incentive_id, partner_id):
    inc = await db.partner_incentives.find_one({"id": incentive_id}, {"_id": 0})
    partner = await _partner_or_404(partner_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Incentive not found")
    prog = await _incentive_progress(partner, inc)
    if not prog["eligible"]:
        raise HTTPException(status_code=400, detail="Partner not eligible for this incentive")
    existing = await db.partner_incentive_awards.find_one(
        {"incentive_id": incentive_id, "partner_id": partner_id, "status": "paid"})
    if existing:
        raise HTTPException(status_code=400, detail="Already awarded")
    amount = await _credit_incentive_award(inc, partner_id, admin, auto=False)
    return {"ok": True, "amount": amount}


async def auto_award_incentives(partner_id):
    """Auto Payout: the instant a partner becomes eligible for an active incentive,
    credit the bonus straight to their wallet — no admin approval needed.
    Safe to call after any event that changes eligibility (job complete, review).
    No-op when Auto Payout is disabled in wallet config. Fully idempotent."""
    try:
        cfg = await get_wallet_config()
        if not cfg.get("auto_payout_enabled", True):
            return []
        partner = await db.users.find_one({"id": partner_id}, {"_id": 0})
        if not partner:
            return []
        system = {"id": "system", "name": "Auto Payout"}
        credited = []
        for inc in await list_incentives(active_only=True):
            prog = await _incentive_progress(partner, inc)
            if not prog["eligible"] or prog["claim_status"] == "paid":
                continue
            amount = await _credit_incentive_award(inc, partner_id, system, auto=True)
            if amount:
                credited.append({"incentive_id": inc["id"], "name": inc.get("name"), "amount": amount})
        return credited
    except Exception:
        # Never let a payout hiccup break the booking/review flow.
        return []


# ---------------------------------------------------------------- streak bonuses
async def process_streak(partner_id, rating):
    """Streak Bonuses: maintain a running count of consecutive 5-star jobs.
    Every `streak_threshold` in a row unlocks an auto-increasing bonus that is
    credited straight to the wallet (no admin approval). A rating below 5 resets
    the streak. Returns the current streak state. Never raises."""
    try:
        partner = await db.users.find_one({"id": partner_id}, {"_id": 0})
        if not partner:
            return None
        cfg = await get_wallet_config()
        current = int(partner.get("five_star_streak", 0) or 0)
        best = int(partner.get("streak_best", 0) or 0)
        try:
            rating = float(rating)
        except (TypeError, ValueError):
            rating = 0
        if rating >= 5:
            current += 1
        else:
            # Rating below 5 would break the streak — try a Streak Freeze first.
            if current and cfg.get("streak_freeze_enabled", True):
                per_week = int(cfg.get("streak_freeze_per_week", 1) or 0)
                _, _, wk = _week_bounds()
                used = int(partner.get("streak_freeze_used", 0) or 0)
                if partner.get("streak_freeze_week") != wk:
                    used = 0  # new week → freezes replenished
                if per_week > 0 and used < per_week:
                    await db.users.update_one(
                        {"id": partner_id},
                        {"$set": {"streak_freeze_used": used + 1, "streak_freeze_week": wk}})
                    await notify(partner_id, "🧊 Streak saved!",
                                 f"A low rating came in, but a Streak Freeze protected your "
                                 f"{current}-job 5★ streak. {max(per_week - used - 1, 0)} freeze(s) left this week.")
                    return {"streak": current, "best": best, "frozen": True,
                            "freezes_left": max(per_week - used - 1, 0)}
            # No freeze available → streak broken.
            if current:
                await db.users.update_one({"id": partner_id}, {"$set": {"five_star_streak": 0}})
            return {"streak": 0, "best": best, "broke": bool(current)}
        best = max(best, current)
        await db.users.update_one(
            {"id": partner_id},
            {"$set": {"five_star_streak": current, "streak_best": best}})

        bonus_paid = 0
        threshold = int(cfg.get("streak_threshold", 5) or 5)
        if cfg.get("streak_enabled", True) and threshold > 0 and current % threshold == 0:
            milestone = current // threshold  # 1st, 2nd, 3rd milestone …
            base = float(cfg.get("streak_base_bonus", 100) or 0)
            inc = float(cfg.get("streak_increment", 50) or 0)
            bonus_paid = money.add(base, (milestone - 1) * inc)
            if bonus_paid > 0:
                await db.users.update_one({"id": partner_id},
                                          {"$inc": {"wallet_balance": bonus_paid,
                                                    "streak_milestones_paid": 1}})
                await db.partner_ledger.insert_one({
                    "id": new_id(), "partner_id": partner_id, "kind": "streak_bonus",
                    "direction": "credit", "amount": bonus_paid, "ref_type": "streak",
                    "ref_id": f"streak-{current}",
                    "note": f"Streak bonus · {current} consecutive 5★ jobs",
                    "status": "completed", "created_at": now_iso()})
                await db.transactions.insert_one({
                    "id": new_id(), "user_id": partner_id, "amount": bonus_paid, "type": "credit",
                    "kind": "streak_bonus",
                    "note": f"Streak bonus ({current} × 5★)", "created_at": now_iso()})
                await audit({"id": "system", "name": "Streak Bonus"},
                            "partner.streak.bonus", partner_id,
                            {"streak": current, "amount": bonus_paid})
                await notify(partner_id, "🔥 Streak bonus!",
                             f"{current} five-star jobs in a row — ₹{bonus_paid} added to your wallet!")
        return {"streak": current, "best": best, "bonus_paid": bonus_paid, "threshold": threshold}
    except Exception:
        return None


async def award_accept_streak_bonus(partner_id, streak):
    """Accept-Streak Rewards. Called after a partner ACCEPTS a job request and
    their consecutive-accept streak has just increased to `streak`. Every
    `accept_streak_threshold` accepts-in-a-row credits a flat cashable bonus to
    the wallet (withdrawable via the normal payout flow). Never raises."""
    try:
        cfg = await get_wallet_config()
        if not cfg.get("accept_streak_enabled", True):
            return 0
        threshold = int(cfg.get("accept_streak_threshold", 5) or 0)
        amount = float(cfg.get("accept_streak_bonus", 50) or 0)
        streak = int(streak or 0)
        if threshold <= 0 or amount <= 0 or streak <= 0 or streak % threshold != 0:
            return 0
        # Idempotency: never pay the same milestone twice.
        ref_id = f"accept-streak-{streak}"
        exists = await db.partner_ledger.find_one(
            {"partner_id": partner_id, "ref_id": ref_id, "kind": "accept_streak_bonus"})
        if exists:
            return 0
        await db.users.update_one(
            {"id": partner_id},
            {"$inc": {"wallet_balance": amount, "accept_streak_bonus_total": amount}})
        await db.partner_ledger.insert_one({
            "id": new_id(), "partner_id": partner_id, "kind": "accept_streak_bonus",
            "direction": "credit", "amount": amount, "ref_type": "accept_streak",
            "ref_id": ref_id,
            "note": f"Accept-streak bonus \u00b7 {streak} requests accepted in a row",
            "status": "completed", "created_at": now_iso()})
        await db.transactions.insert_one({
            "id": new_id(), "user_id": partner_id, "amount": amount, "type": "credit",
            "kind": "accept_streak_bonus",
            "note": f"Accept-streak bonus ({streak} in a row)", "created_at": now_iso()})
        await notify(partner_id, "\u26a1 Accept-streak bonus!",
                     f"{streak} job requests accepted in a row \u2014 \u20b9{int(amount)} added to your wallet!")
        return amount
    except Exception:
        return 0



def _streak_stats(partner, cfg):
    """Build the streak summary shown to the partner (progress to next bonus)."""
    threshold = int(cfg.get("streak_threshold", 5) or 5)
    current = int(partner.get("five_star_streak", 0) or 0)
    best = int(partner.get("streak_best", 0) or 0)
    base = float(cfg.get("streak_base_bonus", 100) or 0)
    inc = float(cfg.get("streak_increment", 50) or 0)
    # Bonus that the NEXT completed milestone will pay.
    next_milestone = current // threshold + 1 if threshold else 1
    next_bonus = money.add(base, (next_milestone - 1) * inc)
    into = current % threshold if threshold else 0
    per_week = int(cfg.get("streak_freeze_per_week", 1) or 0)
    _, _, wk = _week_bounds()
    used = int(partner.get("streak_freeze_used", 0) or 0)
    if partner.get("streak_freeze_week") != wk:
        used = 0
    return {
        "enabled": bool(cfg.get("streak_enabled", True)),
        "current": current, "best": best, "threshold": threshold,
        "into_milestone": into,
        "remaining": (threshold - into) if threshold else 0,
        "progress_pct": round(into / threshold * 100) if threshold else 0,
        "next_bonus": next_bonus,
        "milestones_paid": int(partner.get("streak_milestones_paid", 0) or 0),
        "freeze_enabled": bool(cfg.get("streak_freeze_enabled", True)),
        "freezes_total": per_week,
        "freezes_left": max(per_week - used, 0),
    }


# ---------------------------------------------------------------- leaderboard
from datetime import timedelta  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))


def _ist_now():
    return datetime.now(IST)


def _week_bounds(ref=None):
    """Return (start_iso, end_iso, week_key) for the ISO week (Mon 00:00 IST →
    next Mon) that contains `ref` (IST). Stored ISO strings are UTC-comparable
    because created_at is written as UTC isoformat."""
    ref = ref or _ist_now()
    monday = (ref - timedelta(days=ref.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    nxt = monday + timedelta(days=7)
    # Compare in UTC (created_at rows are UTC isoformat).
    start = monday.astimezone(timezone.utc).isoformat()
    end = nxt.astimezone(timezone.utc).isoformat()
    iso = ref.isocalendar()
    week_key = f"{iso[0]}-W{iso[1]:02d}"
    return start, end, week_key


async def _weekly_job_counts(start_iso, end_iso):
    """Completed-job count per partner in [start,end) — one partner_ledger
    'earning' row is written per completed job."""
    rows = await db.partner_ledger.find(
        {"kind": "earning", "created_at": {"$gte": start_iso, "$lt": end_iso}},
        {"_id": 0, "partner_id": 1}).to_list(50000)
    counts = {}
    for r in rows:
        counts[r["partner_id"]] = counts.get(r["partner_id"], 0) + 1
    return counts


def _mask_name(name):
    parts = (name or "Partner").strip().split()
    if not parts:
        return "Partner"
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0]}."


async def leaderboard(partner, period="all", city="", skill="", limit=10):
    """Fleet ranking to spark healthy competition.
    period="all"  → ranked by lifetime jobs_completed, then rating.
    period="week" → ranked by jobs completed in the current week (levels the field
                    so new partners can also climb), then rating.
    Optional city / skill filters narrow the board to local / same-trade rivals."""
    all_partners = await db.users.find(
        {"role": "partner"},
        {"_id": 0, "id": 1, "name": 1, "rating": 1, "jobs_completed": 1,
         "five_star_streak": 1, "city": 1, "skills": 1}).to_list(5000)

    # Build filter option lists from the whole fleet (before narrowing).
    cities = sorted({(p.get("city") or "").strip() for p in all_partners if (p.get("city") or "").strip()})
    skills_set = set()
    for p in all_partners:
        for s in (p.get("skills") or []):
            if s:
                skills_set.add(str(s))
    skills = sorted(skills_set)

    # Apply filters.
    def _match(p):
        if city and (p.get("city") or "").strip().lower() != city.strip().lower():
            return False
        if skill and skill not in [str(s) for s in (p.get("skills") or [])]:
            return False
        return True

    partners = [p for p in all_partners if _match(p)]

    week_counts = {}
    if period == "week":
        start, end, _ = _week_bounds()
        week_counts = await _weekly_job_counts(start, end)

    def _jobs(p):
        return week_counts.get(p["id"], 0) if period == "week" else int(p.get("jobs_completed", 0) or 0)

    def _score(p):
        return (_jobs(p), float(p.get("rating", 0) or 0))

    ranked = sorted(partners, key=_score, reverse=True)

    def _row(p, idx):
        return {
            "rank": idx + 1,
            "id": p["id"],
            "name": _mask_name(p.get("name")),
            "rating": round(float(p.get("rating", 0) or 0), 1),
            "jobs_completed": _jobs(p),
            "lifetime_jobs": int(p.get("jobs_completed", 0) or 0),
            "streak": int(p.get("five_star_streak", 0) or 0),
            "city": p.get("city") or "",
            "is_me": p["id"] == partner["id"],
        }

    top = [_row(p, i) for i, p in enumerate(ranked[:limit])]
    my_idx = next((i for i, p in enumerate(ranked) if p["id"] == partner["id"]), None)
    me = _row(ranked[my_idx], my_idx) if my_idx is not None else None
    cfg = await get_wallet_config()
    return {"top": top, "me": me, "my_rank": (my_idx + 1) if my_idx is not None else None,
            "total": len(ranked), "period": period,
            "city": city, "skill": skill,
            "filters": {"cities": cities, "skills": skills},
            "reward_top3": cfg.get("leaderboard_reward_top3", [500, 300, 200]),
            "rewards_enabled": bool(cfg.get("leaderboard_rewards_enabled", True))}


async def partner_bonus_history(partner, limit=100):
    """The partner's own bonus history — auto incentives, streak bonuses and
    weekly leaderboard rewards — with per-kind totals for the 'My Bonuses' card."""
    kinds = ["incentive", "streak_bonus", "leaderboard_reward", "accept_streak_bonus"]
    rows = await db.partner_ledger.find(
        {"partner_id": partner["id"], "direction": "credit", "kind": {"$in": kinds}},
        {"_id": 0}).sort("created_at", -1).to_list(limit)
    totals = {k: 0.0 for k in kinds}
    for r in rows:
        totals[r["kind"]] = money.add(totals.get(r["kind"], 0), r.get("amount", 0) or 0)
    return {"rows": rows, "totals": totals,
            "grand_total": money.add(*totals.values()), "count": len(rows)}


# ------------------------------------------- weekly leaderboard rewards (auto)
async def process_leaderboard_rewards():
    """At the start of each new week, auto-bonus the PREVIOUS week's top-3
    partners (by that week's completed jobs). Idempotent per week via a run doc.
    Returns the list of awards made (empty if already done / disabled)."""
    try:
        cfg = await get_wallet_config()
        if not cfg.get("leaderboard_rewards_enabled", True):
            return []
        # Previous completed week.
        prev_ref = _ist_now() - timedelta(days=7)
        start, end, week_key = _week_bounds(prev_ref)
        if await db.leaderboard_reward_runs.find_one({"week_key": week_key}):
            return []
        amounts = cfg.get("leaderboard_reward_top3", [500, 300, 200]) or []
        counts = await _weekly_job_counts(start, end)
        ranked = sorted([(pid, c) for pid, c in counts.items() if c > 0],
                        key=lambda x: x[1], reverse=True)[:len(amounts)]
        awards = []
        for i, (pid, jobs) in enumerate(ranked):
            amount = float(amounts[i] or 0)
            if amount <= 0:
                continue
            partner = await db.users.find_one({"id": pid}, {"_id": 0, "name": 1})
            if not partner:
                continue
            rank = i + 1
            await db.users.update_one({"id": pid}, {"$inc": {"wallet_balance": amount}})
            await db.partner_ledger.insert_one({
                "id": new_id(), "partner_id": pid, "kind": "leaderboard_reward",
                "direction": "credit", "amount": amount, "ref_type": "leaderboard",
                "ref_id": week_key,
                "note": f"Weekly leaderboard reward · Rank #{rank} ({week_key})",
                "status": "completed", "created_at": now_iso()})
            await db.transactions.insert_one({
                "id": new_id(), "user_id": pid, "amount": amount, "type": "credit",
                "kind": "leaderboard_reward",
                "note": f"Leaderboard Rank #{rank} ({week_key})", "created_at": now_iso()})
            await notify(pid, "🏆 Leaderboard reward!",
                         f"You finished Rank #{rank} last week — ₹{amount} added to your wallet!")
            awards.append({"partner_id": pid, "rank": rank, "amount": amount, "jobs": jobs})
        await db.leaderboard_reward_runs.insert_one({
            "id": new_id(), "week_key": week_key, "awards": awards,
            "created_at": now_iso()})
        return awards
    except Exception:
        return []


# ------------------------------------------------ daily streak reminder (auto)
async def send_streak_reminders():
    """Evening (IST) nudge for partners on a live 5★ streak: remind them how
    much bonus they'd forfeit by breaking it, so they stay active. Fires once
    per day (17:00–21:00 IST window), idempotent via users.streak_reminder_date."""
    try:
        cfg = await get_wallet_config()
        if not (cfg.get("streak_reminder_enabled", True) and cfg.get("streak_enabled", True)):
            return 0
        now = _ist_now()
        if not (17 <= now.hour <= 21):
            return 0
        today = now.date().isoformat()
        partners = await db.users.find(
            {"role": "partner", "five_star_streak": {"$gt": 0}},
            {"_id": 0, "id": 1, "five_star_streak": 1, "streak_reminder_date": 1}).to_list(5000)
        sent = 0
        for p in partners:
            if p.get("streak_reminder_date") == today:
                continue
            stats = _streak_stats({**p, "streak_milestones_paid": 0}, cfg)
            current = stats["current"]
            remaining = stats["remaining"]
            next_bonus = stats["next_bonus"]
            body = (f"आप {current} लगातार 5★ jobs की streak पर हैं! बस {remaining} और job — "
                    f"फिर ₹{next_bonus} का bonus. आज active रहें, streak न टूटने दें 🔥")
            await notify(p["id"], "🔥 Keep your streak alive!", body)
            await db.users.update_one({"id": p["id"]},
                                      {"$set": {"streak_reminder_date": today}})
            sent += 1
        return sent
    except Exception:
        return 0


# ------------------------------------------------- admin payout log (auto/bonus)
async def admin_payout_log(kind="", date_from="", date_to="", page=1, page_size=50):
    """All automatic wallet credits (auto-payout incentives, streak bonuses,
    weekly leaderboard rewards) with partner names — a live audit for admins."""
    kinds = ["incentive", "streak_bonus", "leaderboard_reward"]
    q = {"kind": {"$in": [kind] if kind in kinds else kinds}, "direction": "credit"}
    if date_from or date_to:
        rng = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to + "T23:59:59"
        q["created_at"] = rng
    total = await db.partner_ledger.count_documents(q)
    skip = max(0, (page - 1) * page_size)
    rows = await db.partner_ledger.find(q, {"_id": 0}) \
        .sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)
    # Attach partner names.
    pids = list({r["partner_id"] for r in rows})
    names = {}
    if pids:
        for u in await db.users.find({"id": {"$in": pids}}, {"_id": 0, "id": 1, "name": 1}).to_list(5000):
            names[u["id"]] = u.get("name")
    for r in rows:
        r["partner_name"] = names.get(r["partner_id"], "—")
    # Summary totals across the whole filtered set (not just this page).
    agg = await db.partner_ledger.aggregate([
        {"$match": q},
        {"$group": {"_id": "$kind", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]).to_list(20)
    summary = {a["_id"]: {"total": money.money(a["total"]), "count": a["count"]} for a in agg}
    grand = money.add(*[v["total"] for v in summary.values()])
    return {"rows": rows, "total": total, "page": page, "page_size": page_size,
            "summary": summary, "grand_total": grand}


# ---------------------------------------------------------------- penalties
async def list_penalties(partner_id=None):
    q = {"partner_id": partner_id} if partner_id else {}
    return await db.partner_penalties.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


async def create_penalty(admin, partner_id, reason, ptype, amount, booking_id, note):
    partner = await _partner_or_404(partner_id)
    amt = float(amount or 0)
    if ptype == "percentage":
        amt = money.pct(partner.get("wallet_balance", 0), amt)
    doc = {"id": new_id(), "partner_id": partner_id, "partner_name": partner.get("name"),
           "reason": reason, "type": ptype, "amount": amt, "booking_id": booking_id or "",
           "note": note or "", "applied_by": admin.get("id"), "applied_by_name": admin.get("name"),
           "status": "active", "created_at": now_iso()}
    await db.partner_penalties.insert_one(dict(doc))
    if ptype != "score" and amt > 0:
        await db.users.update_one({"id": partner_id}, {"$inc": {"wallet_balance": -amt}})
        await db.partner_ledger.insert_one({
            "id": new_id(), "partner_id": partner_id, "kind": "penalty", "direction": "debit",
            "amount": amt, "ref_type": "penalty", "ref_id": doc["id"],
            "note": f"Penalty · {reason}", "status": "completed", "created_at": now_iso()})
        await db.transactions.insert_one({
            "id": new_id(), "user_id": partner_id, "amount": amt, "type": "debit",
            "kind": "penalty", "note": f"Penalty {reason}", "created_at": now_iso()})
    await audit(admin, "partner.penalty.create", partner_id, {"amount": amt, "reason": reason})
    await notify(partner_id, "Penalty applied", f"{reason} — ₹{amt}." if amt else reason)
    doc.pop("_id", None)
    return doc


async def reverse_penalty(admin, penalty_id):
    p = await db.partner_penalties.find_one({"id": penalty_id}, {"_id": 0})
    if not p or p["status"] != "active":
        raise HTTPException(status_code=404, detail="Penalty not found or already reversed")
    if p["type"] != "score" and p["amount"] > 0:
        await db.users.update_one({"id": p["partner_id"]}, {"$inc": {"wallet_balance": p["amount"]}})
        await db.partner_ledger.insert_one({
            "id": new_id(), "partner_id": p["partner_id"], "kind": "penalty_reversal",
            "direction": "credit", "amount": p["amount"], "ref_type": "penalty", "ref_id": penalty_id,
            "note": f"Penalty reversed · {p['reason']}", "status": "completed", "created_at": now_iso()})
    await db.partner_penalties.update_one({"id": penalty_id}, {"$set": {"status": "reversed"}})
    await audit(admin, "partner.penalty.reverse", p["partner_id"], {"penalty": penalty_id})
    await notify(p["partner_id"], "Penalty reversed", f"₹{p['amount']} credited back.")
    return {"ok": True}


# ---------------------------------------------------------------- admin 360 view
async def admin_partner_360(partner_id):
    partner = await _partner_or_404(partner_id)
    verif = await partner_verification_view(partner)
    return {
        "partner": {k: partner.get(k) for k in
                    ("id", "name", "phone", "email", "rating", "jobs_completed",
                     "kyc_status", "partner_status", "status", "verified_partner",
                     "wallet_balance", "skills", "premium_partner", "partner_badge", "starter_kit")},
        "verification": verif,
        "skills": await partner_skills(partner_id),
        "certificates": await list_certificates(partner_id),
        "wallet": await wallet_summary(partner),
        "withdrawals": await list_withdrawals(partner_id),
        "penalties": await list_penalties(partner_id),
        "incentives": await partner_incentives(partner),
    }


# ---------------------------------------------------------------- training videos
async def list_training(active_only=False):
    q = {"status": "active"} if active_only else {}
    return await db.partner_training.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)


async def create_training(admin, data: dict):
    doc = {"id": new_id(), **data, "created_at": now_iso()}
    await db.partner_training.insert_one(dict(doc))
    await audit(admin, "partner.training.create", doc["id"], {"title": data.get("title")})
    doc.pop("_id", None)
    return doc


async def update_training(admin, tid, data: dict):
    data.pop("id", None)
    r = await db.partner_training.update_one({"id": tid}, {"$set": data})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Training not found")
    await audit(admin, "partner.training.update", tid, {})
    return await db.partner_training.find_one({"id": tid}, {"_id": 0})


async def delete_training(admin, tid):
    await db.partner_training.delete_one({"id": tid})
    await audit(admin, "partner.training.delete", tid, {})
    return {"ok": True}


async def _training_for_partner(partner):
    """Trainings assigned to this partner (all / matching skill / stage-based always shown)."""
    trainings = await list_training(active_only=True)
    skill_ids = {s["skill_id"] for s in await partner_skills(partner["id"])}
    skill_names = {(s.get("skill_name") or "").lower() for s in await partner_skills(partner["id"])}
    out = []
    for t in trainings:
        at, av = t.get("assign_type", "all"), (t.get("assign_value") or "")
        if at == "all" or at == "stage":
            out.append(t)
        elif at == "skill" and (av in skill_ids or av.lower() in skill_names):
            out.append(t)
        elif at == "category":
            out.append(t)  # category association kept broad for MVP
    return out


async def partner_training(partner):
    trainings = await _training_for_partner(partner)
    prog = {p["training_id"]: p for p in await db.partner_training_progress.find(
        {"partner_id": partner["id"]}, {"_id": 0}).to_list(500)}
    out = []
    for t in trainings:
        p = prog.get(t["id"], {})
        out.append({**t, "progress_percent": p.get("percent", 0),
                    "completed": bool(p.get("completed")),
                    "started": bool(p)})
    return out


async def track_training(partner, tid, percent, completed):
    t = await db.partner_training.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Training not found")
    completed = bool(completed or percent >= 100)
    await db.partner_training_progress.update_one(
        {"partner_id": partner["id"], "training_id": tid},
        {"$set": {"partner_id": partner["id"], "training_id": tid, "title": t.get("title"),
                  "percent": round(float(percent), 1), "completed": completed,
                  "updated_at": now_iso()}}, upsert=True)
    return {"ok": True, "completed": completed, "percent": percent}


async def _training_gate(partner, stage_key):
    """Block a verification stage submit if mandatory trainings for that stage are incomplete."""
    reqd = await db.partner_training.find(
        {"status": "active", "assign_type": "stage", "assign_value": stage_key, "mandatory": True},
        {"_id": 0}).to_list(100)
    if not reqd:
        return
    done = {p["training_id"] for p in await db.partner_training_progress.find(
        {"partner_id": partner["id"], "completed": True}, {"_id": 0, "training_id": 1}).to_list(500)}
    pending = [t["title"] for t in reqd if t["id"] not in done]
    if pending:
        raise HTTPException(status_code=400,
                            detail=f"Complete mandatory training first: {', '.join(pending)}")


# ---------------------------------------------------------------- availability & leave
VALID_MODES = ("online", "offline", "break", "emergency")


async def set_availability(partner, mode):
    if mode not in VALID_MODES:
        raise HTTPException(status_code=400, detail="Invalid availability mode")
    from services.schedule_service import today_ist
    today = today_ist()
    partner_status = "online" if mode == "online" else "offline"
    upd = {"availability": mode, "partner_status": partner_status}
    if mode == "online":
        # Daily online is valid for TODAY only (spec 1/2). Record which IST day the
        # partner went online so the daily reset can flip it offline on the next day.
        upd["online_date"] = today
        upd["last_online_at"] = now_iso()
        upd["auto_online"] = False           # manual GO ONLINE
        upd["online_pause_date"] = None
    else:
        # Manual OFF for today — remember it so the calendar auto-online sweep does
        # NOT immediately turn them back on for the rest of today.
        upd["online_pause_date"] = today
    await db.users.update_one({"id": partner["id"]}, {"$set": upd})
    # SYNC (spec 4): Live online/offline status ↔ TODAY's calendar availability are a
    # single source of truth. Manual GO ONLINE ⇒ today's calendar = Available; manual
    # OFFLINE/break/emergency ⇒ today's calendar = Unavailable. This removes the old
    # bug where backend was 'online' but the calendar/UI showed the partner as off.
    _cal_status = "available" if mode == "online" else "unavailable"
    await db.partner_availability.update_one(
        {"partner_id": partner["id"], "date": today},
        {"$setOnInsert": {"id": new_id(), "partner_id": partner["id"], "date": today,
                          "created_at": now_iso()},
         "$set": {"status": _cal_status, "updated_at": now_iso()}},
        upsert=True)
    # Live-update admin Live Operations KPIs + Live Partner Map without refresh.
    rt.emit_admin("partner_status", {
        "id": partner["id"], "name": partner.get("name"),
        "partner_status": partner_status, "availability": mode,
    })
    if mode == "emergency":
        await audit(partner, "partner.emergency_unavailable", partner["id"], {})
    # Coming online → immediately deliver any pending jobs waiting for supply.
    if mode == "online":
        try:
            from controllers.booking_controller import dispatch_pending_to_partner
            await dispatch_pending_to_partner(partner)
        except Exception:  # noqa: BLE001 — dispatch is best-effort, never blocks toggle
            pass
    return {"availability": mode, "partner_status": partner_status,
            "online_date": upd.get("online_date"),
            "message": {"emergency": "Emergency mode ON — new job matching paused.",
                        "online": "You are online and receiving jobs today.",
                        "offline": "You are offline.",
                        "break": "On break — new jobs paused."}[mode]}


# ---------------------------------------------------------------- future availability calendar
# Two SEPARATE concepts (spec 5):
#   • Daily Online status  → partner_status/online_date, manual, valid for TODAY only.
#   • Future Availability   → partner_availability collection of chosen dates; on those
#     dates the partner is auto-considered online (no manual GO ONLINE needed).
def _is_valid_date(s):
    try:
        datetime.strptime(str(s), "%Y-%m-%d")
        return True
    except (ValueError, TypeError):
        return False


MAX_AVAILABLE_DATES = 7  # spec 3: max 7 future dates can be marked Available


async def get_availability(partner):
    """Daily online state + upcoming date-wise availability (today onward).

    Returns `calendar` (list of {date,status}) for the premium calendar, `dates`
    (available date strings only — used by matching/auto-online), plus counts."""
    from services.schedule_service import today_ist
    today = today_ist()
    u = await db.users.find_one({"id": partner["id"]},
                                {"_id": 0, "partner_status": 1, "online_date": 1, "last_online_at": 1}) or {}
    online_today = u.get("partner_status") == "online" and u.get("online_date") == today
    rows = await db.partner_availability.find(
        {"partner_id": partner["id"], "date": {"$gte": today}}, {"_id": 0, "date": 1, "status": 1}
    ).sort("date", 1).to_list(400)
    calendar = [{"date": r["date"], "status": r.get("status") or "available"} for r in rows]
    available = sorted({r["date"] for r in rows if (r.get("status") or "available") == "available"})
    return {"online_today": online_today, "online_date": u.get("online_date"),
            "last_online_at": u.get("last_online_at"), "today": today,
            "calendar": calendar, "dates": available,
            "available_count": len(available), "max_available": MAX_AVAILABLE_DATES}


async def set_date_status(partner, date, status):
    """Set a single future date's availability to 'available' or 'unavailable'
    (spec 2/3). Enforces the max-7 Available cap server-side. Toggling an existing
    Available date to Unavailable frees a slot."""
    from services.schedule_service import today_ist
    today = today_ist()
    status = (status or "").lower()
    if status not in ("available", "unavailable"):
        raise HTTPException(status_code=400, detail="Invalid status")
    if not _is_valid_date(date) or str(date) < today:
        raise HTTPException(status_code=400, detail="Pick today or a future date")
    if status == "available":
        # Count currently-available future dates, excluding this one.
        cur = await db.partner_availability.count_documents(
            {"partner_id": partner["id"], "date": {"$gte": today, "$ne": date}, "status": "available"})
        if cur >= MAX_AVAILABLE_DATES:
            raise HTTPException(status_code=400,
                                detail=f"You can select a maximum of {MAX_AVAILABLE_DATES} available dates.")
    await db.partner_availability.update_one(
        {"partner_id": partner["id"], "date": date},
        {"$setOnInsert": {"id": new_id(), "partner_id": partner["id"], "date": date, "created_at": now_iso()},
         "$set": {"status": status, "updated_at": now_iso()}},
        upsert=True)
    # SYNC (spec 4): setting TODAY's calendar status also flips the LIVE online status
    # so the toggle, backend status, calendar and job-eligibility never disagree.
    if str(date) == today:
        if status == "unavailable":
            # Not Available today ⇒ partner goes OFFLINE now + auto-online paused for today.
            await db.users.update_one({"id": partner["id"]}, {"$set": {
                "partner_status": "offline", "availability": "offline", "online_pause_date": today}})
            rt.emit_admin("partner_status", {
                "id": partner["id"], "name": partner.get("name"),
                "partner_status": "offline", "availability": "offline"})
        else:
            # Available today ⇒ partner comes ONLINE now (clears the manual-off pause).
            await db.users.update_one({"id": partner["id"]}, {"$set": {
                "partner_status": "online", "availability": "online", "online_date": today,
                "auto_online": True, "online_pause_date": None, "last_online_at": now_iso()}})
            rt.emit_admin("partner_status", {
                "id": partner["id"], "name": partner.get("name"),
                "partner_status": "online", "availability": "online"})
            try:
                from controllers.booking_controller import dispatch_pending_to_partner
                fresh = await db.users.find_one({"id": partner["id"]}, {"_id": 0})
                if fresh:
                    await dispatch_pending_to_partner(fresh)
            except Exception:  # noqa: BLE001 — dispatch is best-effort
                pass
    return await get_availability(partner)


async def add_availability(partner, dates):
    """Add one or more future available dates (idempotent upsert). Past dates ignored.
    Enforces the max-7 Available cap. (Kept for back-compat / bulk shortcuts.)"""
    from services.schedule_service import today_ist
    today = today_ist()
    dates = [d for d in (dates or []) if _is_valid_date(d) and str(d) >= today]
    if not dates:
        raise HTTPException(status_code=400, detail="Pick one or more valid future dates")
    for d in sorted(set(dates)):
        cur = await db.partner_availability.count_documents(
            {"partner_id": partner["id"], "date": {"$gte": today, "$ne": d}, "status": "available"})
        if cur >= MAX_AVAILABLE_DATES:
            raise HTTPException(status_code=400,
                                detail=f"You can select a maximum of {MAX_AVAILABLE_DATES} available dates.")
        await db.partner_availability.update_one(
            {"partner_id": partner["id"], "date": d},
            {"$setOnInsert": {"id": new_id(), "partner_id": partner["id"], "date": d, "created_at": now_iso()},
             "$set": {"status": "available", "updated_at": now_iso()}},
            upsert=True)
    return await get_availability(partner)


async def remove_availability(partner, dates):
    """Remove availability for the given date(s). New jobs on those dates stop matching."""
    dates = [d for d in (dates or []) if _is_valid_date(d)]
    if dates:
        await db.partner_availability.delete_many(
            {"partner_id": partner["id"], "date": {"$in": sorted(set(dates))}})
    return await get_availability(partner)


async def partner_daily_reset_tick():
    """Server-side daily reset + calendar auto-online (spec 2/4/11). Runs periodically.
      • Any partner whose manual online is from a PAST day (online_date != today) and who
        is NOT calendar-available today → flip OFFLINE.
      • Any approved+active partner who HAS today in their availability calendar, is not
        paused for today, and is not already online → auto GO ONLINE for today.
    Returns {reset, auto_online} counts. Never raises."""
    from services.schedule_service import today_ist
    today = today_ist()
    reset = 0
    auto_on = 0
    try:
        # 1) Stale daily online → offline (unless calendar-available today).
        avail_today = set()
        async for r in db.partner_availability.find(
                {"date": today, "status": "available"}, {"_id": 0, "partner_id": 1}):
            avail_today.add(r["partner_id"])
        stale = await db.users.find(
            {"role": "partner", "partner_status": "online",
             "online_date": {"$ne": today}}, {"_id": 0, "id": 1}).to_list(2000)
        for p in stale:
            if p["id"] in avail_today:
                # keep online but roll the day forward so it stays valid today
                await db.users.update_one({"id": p["id"]},
                                          {"$set": {"online_date": today, "auto_online": True}})
                continue
            await db.users.update_one({"id": p["id"]},
                                      {"$set": {"partner_status": "offline", "availability": "offline"}})
            reset += 1
        # 2) Calendar-available today but currently offline → auto online.
        if avail_today:
            candidates = await db.users.find(
                {"role": "partner", "id": {"$in": list(avail_today)},
                 "kyc_status": "approved", "status": "active", "suspended": {"$ne": True},
                 "partner_status": {"$ne": "online"}},
                {"_id": 0, "id": 1, "name": 1, "online_pause_date": 1, "skills": 1,
                 "service_pincodes": 1, "live_location": 1, "location": 1, "address": 1,
                 "city": 1, "pincode": 1}).to_list(2000)
            for p in candidates:
                if p.get("online_pause_date") == today:
                    continue  # partner manually paused today — respect it
                await db.users.update_one({"id": p["id"]},
                                          {"$set": {"partner_status": "online", "availability": "online",
                                                    "online_date": today, "auto_online": True}})
                auto_on += 1
                try:
                    from controllers.booking_controller import dispatch_pending_to_partner
                    await dispatch_pending_to_partner({**p, "partner_status": "online"})
                except Exception:  # noqa: BLE001
                    pass
    except Exception:  # noqa: BLE001
        pass
    return {"reset": reset, "auto_online": auto_on}


async def request_leave(partner, start_date, end_date, reason):
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="End date must be after start date")
    doc = {"id": new_id(), "partner_id": partner["id"], "partner_name": partner.get("name"),
           "start_date": start_date, "end_date": end_date, "reason": reason or "",
           "status": "pending", "created_at": now_iso(), "reviewed_at": None}
    await db.partner_leaves.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


async def list_leaves(partner_id=None, status=None):
    q = {}
    if partner_id:
        q["partner_id"] = partner_id
    if status:
        q["status"] = status
    return await db.partner_leaves.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


async def action_leave(admin, leave_id, action, reason):
    lv = await db.partner_leaves.find_one({"id": leave_id}, {"_id": 0})
    if not lv:
        raise HTTPException(status_code=404, detail="Leave not found")
    status = "approved" if action == "approve" else "rejected"
    await db.partner_leaves.update_one(
        {"id": leave_id}, {"$set": {"status": status, "reason": reason or lv.get("reason", ""),
                                    "reviewed_at": now_iso(), "reviewed_by": admin.get("id")}})
    await audit(admin, f"partner.leave.{status}", lv["partner_id"], {"leave": leave_id})
    await notify(lv["partner_id"], f"Leave {status}",
                 f"Your leave {lv['start_date']} → {lv['end_date']} was {status}.")
    return await db.partner_leaves.find_one({"id": leave_id}, {"_id": 0})

# ---------------------------------------------------------------- analytics (premium)
def _pa_daterange(dfrom, dto, cap=120):
    from datetime import date, timedelta, datetime as _dt, timezone as _tz
    try:
        a = date.fromisoformat(dfrom); b = date.fromisoformat(dto)
    except (ValueError, TypeError):
        b = _dt.now(_tz.utc).date(); a = b - timedelta(days=29)
    if b < a:
        a, b = b, a
    if (b - a).days > cap:
        a = b - timedelta(days=cap)
    out, cur = [], a
    while cur <= b:
        out.append(cur.isoformat()); cur += timedelta(days=1)
    return out


async def analytics(partner, dfrom="", dto=""):
    pid = partner["id"]
    days = _pa_daterange(dfrom, dto)
    lo, hi = days[0], days[-1]
    bookings = await db.bookings.find({"partner_id": pid}, {"_id": 0}).to_list(3000)
    ledger = await db.partner_ledger.find({"partner_id": pid, "kind": "earning"}, {"_id": 0}).to_list(3000)

    def inr(dstr):
        d = str(dstr or "")[:10]
        return lo <= d <= hi

    fb = [b for b in bookings if inr(b.get("created_at"))]
    series = {d: {"date": d, "earning": 0.0, "jobs": 0} for d in days}
    for b in fb:
        d = str(b.get("created_at"))[:10]
        if d in series:
            series[d]["jobs"] += 1
    for l in ledger:
        d = str(l.get("created_at"))[:10]
        if d in series:
            series[d]["earning"] = money.add(series[d]["earning"], l.get("amount", 0))
    series_list = [dict(v, earning=money.money(v["earning"])) for v in series.values()]

    done = ("completed", "paid")
    pend = ("pending", "searching", "assigned", "accepted", "in_progress", "on_the_way", "arrived")
    completed = [b for b in fb if b.get("status") in done]
    pending = [b for b in fb if b.get("status") in pend]
    earning_total = money.add(*[s["earning"] for s in series_list])
    status_counts = {}
    for b in fb:
        st = (b.get("status") or "other").replace("_", " ")
        status_counts[st] = status_counts.get(st, 0) + 1

    # ── ratings & reviews (lifetime, from this partner's reviewed bookings) ──
    reviewed = [b for b in bookings if (b.get("review") or {}).get("rating")]
    dist = {5: 0, 4: 0, 3: 0, 2: 0, 1: 0}
    rsum = 0
    recent = []
    for b in sorted(reviewed, key=lambda x: x.get("updated_at") or x.get("created_at") or "", reverse=True):
        rv = b.get("review") or {}
        try:
            star = int(round(float(rv.get("rating") or 0)))
        except Exception:
            star = 0
        if star < 1 or star > 5:
            continue
        dist[star] += 1
        rsum += star
        if len(recent) < 8:
            recent.append({
                "rating": star,
                "comment": rv.get("comment") or rv.get("text") or "",
                "service": b.get("service_name") or "",
                "customer": b.get("customer_name") or "Customer",
                "date": str(b.get("updated_at") or b.get("created_at") or "")[:10],
            })
    rcount = sum(dist.values())
    ratings = {
        "avg": round(rsum / rcount, 2) if rcount else round(float(partner.get("rating") or 0), 2),
        "count": rcount,
        "distribution": [{"star": s, "count": dist[s]} for s in (5, 4, 3, 2, 1)],
        "recent": recent,
    }
    return {
        "range": {"from": lo, "to": hi, "days": len(days)},
        "kpis": {"jobs": len(fb), "completed": len(completed), "pending": len(pending),
                 "earning": earning_total,
                 "completion_rate": round(len(completed) / max(len(fb), 1) * 100),
                 "avg_per_day": money.money(earning_total / max(len(days), 1)),
                 "rating": ratings["avg"], "reviews": rcount},
        "series": series_list,
        "status_breakdown": [{"name": k, "value": v} for k, v in status_counts.items()],
        "ratings": ratings,
    }



# ═══════════════════════════════════════════════════════════════════════════
# ADVANCED PARTNER GROWTH — Performance analytics, Incentives overview,
# Penalties board (all with filters + pagination) + gamified partner challenges.
# ═══════════════════════════════════════════════════════════════════════════

def _paginate(items, page, page_size):
    page = max(1, int(page or 1))
    page_size = min(100, max(1, int(page_size or 10)))
    total = len(items)
    pages = max(1, (total + page_size - 1) // page_size)
    start = (page - 1) * page_size
    return items[start:start + page_size], total, pages, page, page_size


async def admin_performance(q="", status="", kyc="", min_rating=0.0,
                            sort="jobs_done", order="desc", page=1, page_size=10):
    """Rich provider-performance analytics: per-partner jobs, rating, earnings,
    acceptance & completion rates, incentives earned and penalties — with search,
    filters, sorting and pagination, plus a fleet-wide summary."""
    partners = await db.users.find(
        {"role": "partner"},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "rating": 1, "jobs_completed": 1,
         "partner_status": 1, "kyc_status": 1, "wallet_balance": 1, "skills": 1,
         "verified_partner": 1, "live_location_at": 1, "updated_at": 1, "created_at": 1}
    ).to_list(5000)

    bookings = await db.bookings.find(
        {}, {"_id": 0, "partner_id": 1, "eligible_partner_ids": 1, "status": 1}
    ).to_list(50000)

    # Aggregate booking-derived metrics per partner.
    from collections import defaultdict
    assigned = defaultdict(int)      # jobs this partner took (partner_id == pid)
    completed = defaultdict(int)
    cancelled = defaultdict(int)
    offered = defaultdict(int)       # jobs where partner was eligible OR took it
    for b in bookings:
        pid = b.get("partner_id")
        st = b.get("status")
        if pid:
            assigned[pid] += 1
            if st in ("completed", "paid"):
                completed[pid] += 1
            elif st == "cancelled":
                cancelled[pid] += 1
        seen = set(b.get("eligible_partner_ids") or [])
        if pid:
            seen.add(pid)
        for e in seen:
            offered[e] += 1

    # Earnings + incentives from the ledger.
    earn = defaultdict(float)
    incentive_earned = defaultdict(float)
    ledger = await db.partner_ledger.find(
        {"direction": "credit", "status": "completed"},
        {"_id": 0, "partner_id": 1, "kind": 1, "amount": 1}).to_list(100000)
    for l in ledger:
        pid = l.get("partner_id")
        amt = float(l.get("amount", 0) or 0)
        if l.get("kind") == "incentive":
            incentive_earned[pid] += amt
        elif l.get("kind") in ("earning", "spare_parts"):
            earn[pid] += amt

    # Active penalties total.
    pen_total = defaultdict(float)
    pens = await db.partner_penalties.find(
        {"status": "active"}, {"_id": 0, "partner_id": 1, "amount": 1}).to_list(20000)
    for p in pens:
        pen_total[p.get("partner_id")] += float(p.get("amount", 0) or 0)

    rows = []
    for p in partners:
        pid = p["id"]
        jobs_done = completed.get(pid, 0) or int(p.get("jobs_completed", 0) or 0)
        took = assigned.get(pid, 0)
        off = offered.get(pid, 0)
        acc = round(took / off * 100) if off else 0
        comp = round(completed.get(pid, 0) / took * 100) if took else 0
        rows.append({
            "id": pid, "name": p.get("name"), "phone": p.get("phone"),
            "rating": round(float(p.get("rating", 0) or 0), 1),
            "jobs_done": jobs_done,
            "earnings": round(earn.get(pid, 0), 2),
            "acceptance_rate": acc,
            "completion_rate": comp,
            "cancellations": cancelled.get(pid, 0),
            "incentives_earned": round(incentive_earned.get(pid, 0), 2),
            "penalties": round(pen_total.get(pid, 0), 2),
            "status": p.get("partner_status", "offline"),
            "kyc_status": p.get("kyc_status", "pending"),
            "wallet_balance": round(float(p.get("wallet_balance", 0) or 0), 2),
            "last_active": p.get("live_location_at") or p.get("updated_at"),
        })

    # Fleet-wide summary (before filtering/pagination).
    total_partners = len(rows)
    active_partners = sum(1 for r in rows if r["status"] == "online")
    rated = [r["rating"] for r in rows if r["rating"] > 0]
    summary = {
        "total_partners": total_partners,
        "active_partners": active_partners,
        "avg_rating": round(sum(rated) / len(rated), 2) if rated else 0,
        "total_jobs": sum(r["jobs_done"] for r in rows),
        "total_earnings": round(sum(r["earnings"] for r in rows), 2),
        "total_incentives": round(sum(r["incentives_earned"] for r in rows), 2),
        "total_penalties": round(sum(r["penalties"] for r in rows), 2),
        "avg_acceptance": round(sum(r["acceptance_rate"] for r in rows) / total_partners) if total_partners else 0,
    }

    # Filters.
    ql = (q or "").strip().lower()
    if ql:
        rows = [r for r in rows if ql in (r["name"] or "").lower() or ql in (r["phone"] or "")]
    if status:
        rows = [r for r in rows if r["status"] == status]
    if kyc:
        rows = [r for r in rows if r["kyc_status"] == kyc]
    if min_rating:
        rows = [r for r in rows if r["rating"] >= float(min_rating)]

    # Sort.
    sortable = {"jobs_done", "rating", "earnings", "acceptance_rate", "completion_rate",
                "cancellations", "incentives_earned", "penalties", "wallet_balance", "name"}
    skey = sort if sort in sortable else "jobs_done"
    rows.sort(key=lambda r: (r[skey] if r[skey] is not None else 0),
              reverse=(order != "asc"))
    # Assign fleet rank by jobs_done (stable, pre-pagination on the filtered set).
    ranked = sorted(rows, key=lambda r: r["jobs_done"], reverse=True)
    rank_map = {r["id"]: i + 1 for i, r in enumerate(ranked)}
    for r in rows:
        r["rank"] = rank_map.get(r["id"])

    items, total, pages, page, page_size = _paginate(rows, page, page_size)
    return {"summary": summary, "items": items, "total": total,
            "page": page, "page_size": page_size, "pages": pages,
            "filtered": bool(ql or status or kyc or min_rating)}


async def incentives_overview():
    """All incentives enriched with live eligibility + payout stats for the admin."""
    incs = await list_incentives(active_only=False)
    partners = await db.users.find({"role": "partner"}, {"_id": 0}).to_list(5000)
    out = []
    for inc in incs:
        eligible = 0
        for p in partners:
            try:
                prog = await _incentive_progress(p, inc)
                if prog["eligible"]:
                    eligible += 1
            except Exception:
                pass
        awards = await db.partner_incentive_awards.find(
            {"incentive_id": inc["id"], "status": "paid"}, {"_id": 0, "amount": 1}).to_list(5000)
        out.append({
            **inc,
            "eligible_count": eligible,
            "awarded_count": len(awards),
            "total_paid": round(sum(float(a.get("amount", 0) or 0) for a in awards), 2),
        })
    active = sum(1 for i in out if i.get("status") == "active")
    stats = {
        "total": len(out), "active": active,
        "total_budget": round(sum(float(i.get("bonus_amount", 0) or 0) for i in out if i.get("status") == "active"), 2),
        "total_paid": round(sum(i["total_paid"] for i in out), 2),
        "total_awards": sum(i["awarded_count"] for i in out),
    }
    return {"items": out, "stats": stats}


async def incentive_eligible_partners(incentive_id):
    """Leaderboard of partners for one incentive — progress + eligibility, best first."""
    inc = await db.partner_incentives.find_one({"id": incentive_id}, {"_id": 0})
    if not inc:
        raise HTTPException(status_code=404, detail="Incentive not found")
    partners = await db.users.find(
        {"role": "partner"},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "rating": 1, "jobs_completed": 1}).to_list(5000)
    rows = []
    for p in partners:
        prog = await _incentive_progress(p, inc)
        rows.append({
            "id": p["id"], "name": p.get("name"), "phone": p.get("phone"),
            "rating": round(float(p.get("rating", 0) or 0), 1),
            "jobs_done": prog["jobs_done"], "revenue": prog["revenue"],
            "progress_pct": prog["progress_pct"], "eligible": prog["eligible"],
            "claim_status": prog["claim_status"],
        })
    rows.sort(key=lambda r: (r["eligible"], r["progress_pct"], r["jobs_done"]), reverse=True)
    return {"incentive": inc, "partners": rows}


async def penalties_board(q="", ptype="", status="", page=1, page_size=10):
    """Penalties with search/type/status filters, pagination and summary stats."""
    all_pens = await db.partner_penalties.find({}, {"_id": 0}).sort("created_at", -1).to_list(20000)
    stats = {
        "total": len(all_pens),
        "active": sum(1 for p in all_pens if p.get("status") == "active"),
        "reversed": sum(1 for p in all_pens if p.get("status") == "reversed"),
        "total_deducted": round(sum(float(p.get("amount", 0) or 0)
                                    for p in all_pens if p.get("status") == "active"
                                    and p.get("type") != "score"), 2),
    }
    rows = all_pens
    ql = (q or "").strip().lower()
    if ql:
        rows = [p for p in rows if ql in (p.get("partner_name") or "").lower()
                or ql in (p.get("reason") or "").lower()]
    if ptype:
        rows = [p for p in rows if p.get("type") == ptype]
    if status:
        rows = [p for p in rows if p.get("status") == status]
    items, total, pages, page, page_size = _paginate(rows, page, page_size)
    return {"stats": stats, "items": items, "total": total,
            "page": page, "page_size": page_size, "pages": pages}


async def partner_challenges(partner):
    """Gamified challenges payload for a partner: active incentives with progress,
    lifetime rewards, fleet rank and penalties — designed to motivate."""
    incs = await partner_incentives(partner)  # active incentives w/ progress
    # Lifetime incentive earnings for this partner.
    awards = await db.partner_incentive_awards.find(
        {"partner_id": partner["id"], "status": "paid"}, {"_id": 0, "amount": 1}).to_list(5000)
    total_earned = round(sum(float(a.get("amount", 0) or 0) for a in awards), 2)

    # Fleet rank by jobs_completed.
    partners = await db.users.find(
        {"role": "partner"}, {"_id": 0, "id": 1, "jobs_completed": 1}).to_list(5000)
    ranked = sorted(partners, key=lambda p: int(p.get("jobs_completed", 0) or 0), reverse=True)
    rank = next((i + 1 for i, p in enumerate(ranked) if p["id"] == partner["id"]), None)

    # Closest reward (highest progress, not yet eligible) for a "so close!" nudge.
    pending = [c for c in incs if not c["eligible"]]
    next_reward = max(pending, key=lambda c: c["progress_pct"], default=None)

    pens = await list_penalties(partner_id=partner["id"])
    active_pen = [p for p in pens if p.get("status") == "active"]

    cfg = await get_wallet_config()
    fresh = await db.users.find_one({"id": partner["id"]}, {"_id": 0}) or partner

    return {
        "challenges": incs,
        "stats": {
            "total_earned": total_earned,
            "active_count": len(incs),
            "eligible_count": sum(1 for c in incs if c["eligible"]),
            "rank": rank,
            "total_partners": len(partners),
            "next_reward": next_reward,
            "penalty_count": len(active_pen),
            "penalty_total": round(sum(float(p.get("amount", 0) or 0) for p in active_pen), 2),
            "auto_payout": bool(cfg.get("auto_payout_enabled", True)),
            "streak": _streak_stats(fresh, cfg),
        },
        "penalties": pens,
    }
