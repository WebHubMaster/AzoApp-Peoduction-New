"""Admin → People (Customers / Partners / Merchants): enterprise lists, 360° profiles,
profile-update audit review. All routes admin-only."""
from fastapi import APIRouter, Depends, Request
from middleware.auth import require_role
from services import people_admin_service as ps
from services import profile_audit_service as pa

router = APIRouter(prefix="/admin/people", tags=["admin-people"])
ADMIN = require_role("admin")


def _params(request: Request) -> dict:
    return {k: v for k, v in request.query_params.items() if v not in (None, "")}


@router.get("/unread-counts")
async def unread_counts(admin=Depends(ADMIN)):
    return await pa.unread_counts()


@router.get("/pending-counts")
async def pending_counts(admin=Depends(ADMIN)):
    return await ps.pending_counts()


@router.get("/profile-updates")
async def all_profile_updates(request: Request, admin=Depends(ADMIN)):
    p = _params(request)
    return await pa.list_changes(role=p.get("role"), status=p.get("status", "all"), q=p.get("q", ""),
                                 date_from=p.get("date_from", ""), date_to=p.get("date_to", ""),
                                 page=int(p.get("page", 1)), page_size=int(p.get("page_size", 25)))


@router.post("/profile-updates/{change_id}/review")
async def review_change(change_id: str, admin=Depends(ADMIN)):
    return await pa.review(change_id, admin)


@router.post("/profile-updates/review-all")
async def review_all_changes(data: dict = None, admin=Depends(ADMIN)):
    data = data or {}
    return await pa.review_all(admin, role=data.get("role"), user_id=data.get("user_id"))


@router.get("/{role}/kpis")
async def role_kpis(role: str, request: Request, admin=Depends(ADMIN)):
    p = _params(request)
    return await ps.kpis(role, pro=bool(p.get("pro")))


@router.get("/{role}/facets")
async def role_facets(role: str, admin=Depends(ADMIN)):
    return await ps.facets(role)


@router.get("/{role}/profile-updates")
async def role_profile_updates(role: str, request: Request, admin=Depends(ADMIN)):
    p = _params(request)
    return await pa.list_changes(role=role, status=p.get("status", "all"), q=p.get("q", ""),
                                 date_from=p.get("date_from", ""), date_to=p.get("date_to", ""),
                                 page=int(p.get("page", 1)), page_size=int(p.get("page_size", 25)))


@router.post("/{role}/profile-updates/review-all")
async def role_review_all(role: str, admin=Depends(ADMIN)):
    return await pa.review_all(admin, role=role)


@router.get("/{role}")
async def role_list(role: str, request: Request, admin=Depends(ADMIN)):
    return await ps.list_people(role, _params(request))


@router.get("/{role}/{uid}/overview")
async def person_overview(role: str, uid: str, admin=Depends(ADMIN)):
    return await ps.overview(role, uid)


@router.post("/{role}/{uid}/profile-updates/review-all")
async def person_review_all(role: str, uid: str, admin=Depends(ADMIN)):
    return await pa.review_all(admin, role=role, user_id=uid)


@router.get("/{role}/{uid}/bookings/{bid}")
async def person_booking(role: str, uid: str, bid: str, admin=Depends(ADMIN)):
    return await ps.booking_detail(role, uid, bid)


@router.post("/{role}/{uid}/review")
async def person_review(role: str, uid: str, data: dict, admin=Depends(ADMIN)):
    """Approve or reject a partner/merchant from their 360 profile.
    Body: {decision: 'approve'|'reject', reason?: str}."""
    return await ps.review_person(admin, role, uid, (data or {}).get("decision", ""),
                                  (data or {}).get("reason", ""))


@router.post("/{role}/{uid}/suspend")
async def person_suspend(role: str, uid: str, data: dict, admin=Depends(ADMIN)):
    """Suspend or reinstate a person. Body: {suspend: bool, reason?: str, days?: int}."""
    d = data or {}
    return await ps.set_suspended(admin, role, uid, bool(d.get("suspend", True)),
                                  d.get("reason", ""), d.get("days", 0))


@router.post("/{role}/{uid}/delete")
async def person_delete(role: str, uid: str, data: dict = None, admin=Depends(ADMIN)):
    """Soft-delete a customer/partner/merchant (recoverable 30 days). Body: {reason?}."""
    return await ps.delete_person(admin, role, uid, (data or {}).get("reason", ""))


@router.post("/{role}/{uid}/restore")
async def person_restore(role: str, uid: str, admin=Depends(ADMIN)):
    """Restore a soft-deleted account."""
    return await ps.restore_person(admin, role, uid)


@router.post("/{role}/{uid}/purge")
async def person_purge(role: str, uid: str, admin=Depends(ADMIN)):
    """Permanently delete an account NOW (bypasses the 30-day recycle bin)."""
    return await ps.hard_delete_person(admin, role, uid)


@router.post("/{role}/bulk-purge")
async def people_bulk_purge(role: str, data: dict, admin=Depends(ADMIN)):
    """Permanently delete many. Body: {uids: [...]}."""
    return await ps.bulk_hard_delete(admin, role, (data or {}).get("uids") or [])


@router.post("/{role}/bulk-delete")
async def people_bulk_delete(role: str, data: dict, admin=Depends(ADMIN)):
    """Soft-delete many. Body: {uids: [...], reason?}."""
    d = data or {}
    return await ps.bulk_delete(admin, role, d.get("uids") or [], d.get("reason", ""))


@router.post("/{role}/bulk-restore")
async def people_bulk_restore(role: str, data: dict, admin=Depends(ADMIN)):
    """Restore many. Body: {uids: [...]}."""
    return await ps.bulk_restore(admin, role, (data or {}).get("uids") or [])


@router.post("/{role}/{uid}/message")
async def person_message(role: str, uid: str, data: dict, admin=Depends(ADMIN)):
    """Send an SMS / Email / Push message. Body: {channel, subject?, body}."""
    return await ps.message_person(admin, role, uid, data or {})


@router.post("/{role}/{uid}/edit")
async def person_edit(role: str, uid: str, data: dict, admin=Depends(ADMIN)):
    """Edit safe profile fields. Body: {name?, email?, city?, …}."""
    return await ps.edit_person(admin, role, uid, data or {})





@router.get("/{role}/{uid}/sections/{name}")
async def person_section(role: str, uid: str, name: str, request: Request, admin=Depends(ADMIN)):
    return await ps.section(role, uid, name, _params(request))
