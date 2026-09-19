"""Admin Growth control center: referral / cashback / scratch / packages / pwa."""
from fastapi import APIRouter, Depends, Body

from middleware.auth import require_role
from config.database import get_settings
from controllers import admin_controller as ac
from services import growth_service as g
from services import package_service as pkgs

router = APIRouter(prefix="/admin/growth", tags=["admin-growth"])


# ---------------- unified config ----------------
@router.get("/config")
async def get_config(admin=Depends(require_role("admin"))):
    s = await get_settings() or {}
    return {
        "referral": s.get("referral") or {},
        "cashback": s.get("cashback") or {},
        "packages": s.get("packages") or {},
        "pwa": s.get("pwa") or {},
    }


@router.put("/config")
async def update_config(payload: dict = Body(...), admin=Depends(require_role("admin"))):
    # Reuse the platform settings updater — it deep-merges + writes an audit entry.
    allowed = {k: v for k, v in (payload or {}).items() if k in ("referral", "cashback", "packages", "pwa")}
    await ac.update_settings(allowed, admin)
    s = await get_settings() or {}
    return {"ok": True, "config": {k: s.get(k) for k in ("referral", "cashback", "packages", "pwa")}}


# ---------------- scratch reward pool ----------------
@router.get("/scratch-rewards")
async def rewards_list(admin=Depends(require_role("admin"))):
    return await g.admin_rewards_list()


@router.post("/scratch-rewards")
async def reward_create(payload: dict = Body(...), admin=Depends(require_role("admin"))):
    return await g.admin_reward_save(admin, payload)


@router.put("/scratch-rewards/{reward_id}")
async def reward_update(reward_id: str, payload: dict = Body(...), admin=Depends(require_role("admin"))):
    return await g.admin_reward_save(admin, payload, reward_id)


@router.delete("/scratch-rewards/{reward_id}")
async def reward_delete(reward_id: str, admin=Depends(require_role("admin"))):
    return await g.admin_reward_delete(admin, reward_id)


@router.get("/scratch-cards")
async def scratch_cards(status: str = "", admin=Depends(require_role("admin"))):
    return {"cards": await g.admin_cards(status), "stats": await g.admin_scratch_stats()}


# ---------------- referrals oversight ----------------
@router.get("/referrals")
async def referrals(admin=Depends(require_role("admin"))):
    return await g.admin_referrals()


# ---------------- premium analytics (read-only) ----------------
@router.get("/insights")
async def insights(date_from: str = "", date_to: str = "", admin=Depends(require_role("admin"))):
    return await g.growth_insights(date_from, date_to)


@router.get("/cashback-transactions")
async def cashback_transactions(admin=Depends(require_role("admin"))):
    return await g.cashback_transactions()


@router.get("/pwa-analytics")
async def pwa_analytics(admin=Depends(require_role("admin"))):
    return await g.pwa_analytics()


# ---------------- packages CRUD ----------------
@router.get("/packages")
async def packages_list(admin=Depends(require_role("admin"))):
    return await pkgs.admin_list()


@router.get("/packages/analytics")
async def packages_analytics(admin=Depends(require_role("admin"))):
    return await pkgs.admin_analytics()


@router.post("/packages")
async def package_create(payload: dict = Body(...), admin=Depends(require_role("admin"))):
    return await pkgs.admin_save(admin, payload)


@router.put("/packages/{pkg_id}")
async def package_update(pkg_id: str, payload: dict = Body(...), admin=Depends(require_role("admin"))):
    return await pkgs.admin_save(admin, payload, pkg_id)


@router.post("/packages/{pkg_id}/duplicate")
async def package_duplicate(pkg_id: str, admin=Depends(require_role("admin"))):
    return await pkgs.admin_duplicate(admin, pkg_id)


@router.post("/packages/{pkg_id}/toggle")
async def package_toggle(pkg_id: str, payload: dict = Body(...), admin=Depends(require_role("admin"))):
    return await pkgs.admin_toggle(admin, pkg_id, bool((payload or {}).get("active")))


@router.delete("/packages/{pkg_id}")
async def package_delete(pkg_id: str, admin=Depends(require_role("admin"))):
    return await pkgs.admin_delete(admin, pkg_id)


# ---------------- audit ----------------
@router.get("/audit")
async def audit(admin=Depends(require_role("admin"))):
    return await g.audit_trail()
