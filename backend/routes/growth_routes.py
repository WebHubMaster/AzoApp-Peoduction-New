"""Customer-facing Growth endpoints: referral card, scratch cards, packages."""
from fastapi import APIRouter, Depends, Body

from middleware.auth import get_current_user, get_current_user_optional, require_role
from config.database import get_settings
from services import growth_service as g
from services import package_service as pkgs
from services import referral_service as ref

router = APIRouter(prefix="/growth", tags=["growth"])


@router.get("/config")
async def public_config():
    """Public growth config used by the customer web app (card text, pwa prompt, flags)."""
    s = await get_settings() or {}
    r = s.get("referral") or {}
    cb = s.get("cashback") or {}
    return {
        "referral": {"enabled": r.get("enabled", True), "reward_amount": r.get("reward_amount"),
                     "referee_discount": r.get("referee_discount"), "card": r.get("card") or {},
                     "terms": r.get("terms")},
        "cashback": {"enabled": cb.get("enabled", True), "scratch_enabled": cb.get("scratch_enabled", True)},
        "packages": s.get("packages") or {},
        "pwa": s.get("pwa") or {},
        "brand": s.get("brand") or "AzoApp",
        "currency": s.get("currency") or "INR",
    }


# ---------------- referral ----------------
@router.get("/referral")
async def referral_card(user=Depends(require_role("customer"))):
    summary = await ref.get_summary(user)
    s = await get_settings() or {}
    r = s.get("referral") or {}
    summary["card"] = r.get("card") or {}
    summary["terms"] = r.get("terms")
    summary["min_booking_amount"] = r.get("min_booking_amount") or 0
    return summary


@router.post("/referral/apply")
async def referral_apply(payload: dict = Body(...), user=Depends(require_role("customer"))):
    return await ref.apply_code(user, (payload or {}).get("code", ""))


# ---------------- scratch cards ----------------
@router.get("/scratch-cards")
async def scratch_cards(user=Depends(require_role("customer"))):
    return await g.list_cards(user)


@router.post("/scratch-cards/{card_id}/scratch")
async def scratch(card_id: str, user=Depends(require_role("customer"))):
    return await g.scratch_card(user, card_id)


@router.post("/scratch-cards/{card_id}/claim")
async def claim(card_id: str, user=Depends(require_role("customer"))):
    return await g.claim_card(user, card_id)


# ---------------- packages ----------------
@router.get("/packages")
async def packages_list(city: str = "", user=Depends(get_current_user_optional)):
    return await pkgs.list_active(user, city)


@router.get("/packages/{pkg_id}")
async def package_detail(pkg_id: str):
    return await pkgs.get_detail(pkg_id)


@router.post("/packages/{pkg_id}/book")
async def package_book(pkg_id: str, payload: dict = Body(...), user=Depends(require_role("customer"))):
    return await pkgs.book_package(
        user, pkg_id,
        address=(payload or {}).get("address") or {},
        schedule_type=(payload or {}).get("schedule_type") or "asap",
        scheduled_at=(payload or {}).get("scheduled_at"),
        notes=(payload or {}).get("notes") or "",
    )
