from fastapi import APIRouter, Depends, HTTPException
from typing import Literal
from controllers import content_controller as c
from models.content import (BannerCreate, FaqCreate, BlogCreate, PlanCreate,
                            NotificationCreate, TicketCreate, TicketReply, PayoutRequest, RefundCreate,
                            TestimonialCreate, FaqCategoryCreate)
from middleware.auth import require_role, get_current_user
from services.rbac_service import require_permission
from config.database import db

router = APIRouter(tags=["content"])
ADMIN = require_role("admin")
AC_CREATE = require_permission("access_control", "create")
AC_EDIT = require_permission("access_control", "edit")
AC_DELETE = require_permission("access_control", "delete")

# ---------- public content ----------
@router.get("/content/banners")
async def banners():
    return await c.list_docs("banners", {"status": "active"})


@router.get("/content/faqs")
async def faqs():
    return await c.list_docs("faqs", {"status": "active"}, sort=1)


@router.get("/content/faqs/grouped")
async def faqs_grouped():
    return await c.faqs_grouped()


@router.get("/content/faq-categories")
async def public_faq_categories():
    return await c.list_docs("faq_categories", {"status": {"$ne": "inactive"}}, sort=1)


@router.get("/content/blogs")
async def blogs():
    return await c.public_blogs()


@router.get("/content/blog/{slug}")
async def blog_detail(slug: str):
    b = await c.public_blog_by_slug(slug)
    if not b:
        raise HTTPException(status_code=404, detail="Blog not found")
    # related: same category (fallback latest), exclude self
    rel = await c.public_blogs(limit=50)
    related = [x for x in rel if x.get("id") != b.get("id")
               and (not b.get("category") or x.get("category") == b.get("category"))][:3]
    if len(related) < 3:
        more = [x for x in rel if x.get("id") != b.get("id") and x not in related]
        related = (related + more)[:3]
    return {"blog": b, "related": related}


@router.get("/content/plans")
async def plans():
    return await c.list_docs("plans", {"status": "active"}, sort=1)


@router.get("/content/testimonials")
async def testimonials():
    rows = await c.list_docs("testimonials", {"status": "active"})
    rows.sort(key=lambda x: x.get("order", 0))
    return rows


# ---------- admin CMS CRUD ----------
def _crud(path, coll, model):
    @router.get(f"/admin/{path}")
    async def _list(admin=Depends(ADMIN)):
        return await c.list_docs(coll)

    @router.post(f"/admin/{path}")
    async def _create(data: model, admin=Depends(ADMIN)):
        return await c.create_doc(coll, data.model_dump())

    @router.put(f"/admin/{path}/{{doc_id}}")
    async def _update(doc_id: str, data: dict, admin=Depends(ADMIN)):
        return await c.update_doc(coll, doc_id, data)

    @router.delete(f"/admin/{path}/{{doc_id}}")
    async def _delete(doc_id: str, admin=Depends(ADMIN)):
        return await c.delete_doc(coll, doc_id)


_crud("banners", "banners", BannerCreate)
_crud("faqs", "faqs", FaqCreate)
_crud("blogs", "blogs", BlogCreate)
_crud("plans", "plans", PlanCreate)
_crud("testimonials", "testimonials", TestimonialCreate)


# ---------- admin: FAQ categories ----------
@router.get("/admin/faq-categories")
async def list_faq_categories(admin=Depends(ADMIN)):
    return await c.list_docs("faq_categories", sort=1)


@router.post("/admin/faq-categories")
async def create_faq_category(data: FaqCategoryCreate, admin=Depends(ADMIN)):
    payload = data.model_dump()
    if not payload.get("slug"):
        import re
        payload["slug"] = re.sub(r"[^a-z0-9]+", "-", (payload.get("name") or "").lower()).strip("-")
    existing = await db.faq_categories.find_one({"name": payload["name"]}, {"_id": 0})
    if existing:
        return existing
    return await c.create_doc("faq_categories", payload)


@router.put("/admin/faq-categories/{doc_id}")
async def update_faq_category(doc_id: str, data: dict, admin=Depends(ADMIN)):
    return await c.update_doc("faq_categories", doc_id, data)


@router.delete("/admin/faq-categories/{doc_id}")
async def delete_faq_category(doc_id: str, admin=Depends(ADMIN)):
    return await c.delete_doc("faq_categories", doc_id)


# ---------- notifications ----------
@router.post("/admin/notifications")
async def send_notification(data: NotificationCreate, admin=Depends(ADMIN)):
    return await c.send_notification(data.model_dump())


@router.get("/admin/notifications")
async def all_notifications(admin=Depends(ADMIN)):
    return await c.list_docs("notifications")


@router.get("/notifications")
async def my_notifications(user=Depends(get_current_user)):
    return await c.user_notifications(user)


@router.delete("/notifications/{nid}")
async def delete_my_notification(nid: str, user=Depends(get_current_user)):
    return await c.hide_notification(user, nid)


@router.delete("/notifications")
async def clear_my_notifications(user=Depends(get_current_user)):
    return await c.clear_notifications(user)


# ---------- support tickets ----------
@router.post("/tickets")
async def create_ticket(data: TicketCreate, user=Depends(get_current_user)):
    return await c.create_ticket(user, data.model_dump())


@router.get("/tickets")
async def my_tickets(user=Depends(get_current_user)):
    return await c.list_tickets(user)


@router.get("/admin/tickets")
async def admin_tickets(admin=Depends(ADMIN)):
    return await c.list_tickets()


@router.post("/admin/tickets/{ticket_id}/reply")
async def reply_ticket(ticket_id: str, data: TicketReply, admin=Depends(ADMIN)):
    return await c.reply_ticket(ticket_id, "AzoApp Support", data.text)


@router.post("/admin/tickets/{ticket_id}/close")
async def close_ticket(ticket_id: str, admin=Depends(ADMIN)):
    return await c.close_ticket(ticket_id)


# ---------- payouts / payment requests ----------
@router.post("/payouts")
async def request_payout(data: PayoutRequest, user=Depends(get_current_user)):
    return await c.request_payout(user, data.amount, data.method)


@router.get("/payouts")
async def my_payouts(user=Depends(get_current_user)):
    return await c.list_payouts(user)


@router.get("/admin/payouts")
async def admin_payouts(admin=Depends(ADMIN)):
    return await c.list_payouts()


@router.post("/admin/payouts/{payout_id}")
async def process_payout(payout_id: str, status: Literal["approved", "rejected"] = "approved", admin=Depends(ADMIN)):
    return await c.approve_payout(payout_id, status)


# ---------- refunds ----------
@router.get("/admin/refunds")
async def refunds(admin=Depends(ADMIN)):
    return await c.list_refunds()


@router.get("/admin/refunds/{rid}")
async def refund_detail(rid: str, admin=Depends(ADMIN)):
    return await c.refund_detail(rid)


@router.post("/admin/refunds")
async def create_refund(data: RefundCreate, admin=Depends(ADMIN)):
    return await c.create_refund(data.booking_id, data.amount, data.reason)


# ---------- system users (staff) ----------
@router.get("/admin/rbac/modules")
async def rbac_modules(admin=Depends(ADMIN)):
    from services.rbac_service import MODULES, ACTIONS
    return {"modules": MODULES, "actions": ACTIONS}


@router.get("/admin/system-users")
async def system_users(admin=Depends(ADMIN)):
    from config.database import db
    users = await db.users.find({"role": {"$in": ["admin", "staff"]}}, {"_id": 0}).to_list(100)
    roles = await db.roles.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
    rmap = {r["id"]: r["name"] for r in roles}
    for u in users:
        if u.get("system_role_id") and rmap.get(u["system_role_id"]):
            u["system_role"] = rmap[u["system_role_id"]]
        u["is_super_admin"] = bool(u.get("is_super_admin") or u.get("phone") == "+919000000000")
    return users


@router.post("/admin/system-users")
async def create_system_user(data: dict, admin=Depends(AC_CREATE)):
    from config.database import db, now_iso
    from models.user import build_user
    phone = (data.get("phone") or "").strip()
    name = (data.get("name") or "").strip()
    if not phone or not name:
        raise HTTPException(status_code=400, detail="Name and phone are required")
    if not phone.startswith("+"):
        phone = "+" + phone.lstrip("+")
    if await db.users.find_one({"phone": phone}):
        raise HTTPException(status_code=400, detail="A user with this phone already exists")
    user = build_user(phone, "admin", name, email=(data.get("email") or ""))
    # system_role = named permission role assigned from Roles & Permissions
    user["system_role"] = data.get("system_role") or ""
    user["system_role_id"] = data.get("system_role_id") or ""
    user["status"] = data.get("status") or "active"
    user["created_at"] = now_iso()
    await db.users.insert_one(dict(user))
    user.pop("_id", None)
    return user


@router.put("/admin/system-users/{user_id}")
async def update_system_user(user_id: str, data: dict, admin=Depends(AC_EDIT)):
    from config.database import db
    upd = {}
    for k in ("name", "email", "system_role", "system_role_id", "status"):
        if data.get(k) is not None:
            upd[k] = data[k]
    if upd:
        await db.users.update_one({"id": user_id, "role": {"$in": ["admin", "staff"]}}, {"$set": upd})
    return await db.users.find_one({"id": user_id}, {"_id": 0})


@router.delete("/admin/system-users/{user_id}")
async def delete_system_user(user_id: str, admin=Depends(AC_DELETE)):
    from config.database import db
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "phone": 1})
    if u and u.get("phone") == "+919000000000":
        raise HTTPException(status_code=400, detail="Cannot delete the primary admin account")
    await db.users.delete_one({"id": user_id, "role": {"$in": ["admin", "staff"]}})
    return {"ok": True}


# ---------- generic admin collections (Phase 3-5 modules) ----------
ALLOWED_COLLECTIONS = {
    "complaints", "disputes", "warranties", "spare_parts", "vendors", "campaigns",
    "locations", "roles", "feature_flags", "memberships", "loyalty", "audit_logs", "pricing_rules", "surge_rules",
    # Phase 5 modules (previously "coming soon")
    "service_requests", "checklists", "service_areas", "merchant_services", "merchant_orders",
    "merchant_settlements", "taxes", "settlements", "offers", "pages", "category_seo",
    "service_seo", "redirects", "channels", "schema_markup", "login_activity",
}


@router.get("/admin/collection/{name}")
async def coll_list(name: str, admin=Depends(ADMIN)):
    if name not in ALLOWED_COLLECTIONS:
        raise HTTPException(status_code=404, detail="Unknown collection")
    return await c.list_docs(name)


@router.post("/admin/collection/{name}")
async def coll_create(name: str, data: dict, admin=Depends(ADMIN)):
    if name not in ALLOWED_COLLECTIONS:
        raise HTTPException(status_code=404, detail="Unknown collection")
    data.pop("id", None)
    return await c.create_doc(name, data)


@router.put("/admin/collection/{name}/{doc_id}")
async def coll_update(name: str, doc_id: str, data: dict, admin=Depends(ADMIN)):
    if name not in ALLOWED_COLLECTIONS:
        raise HTTPException(status_code=404, detail="Unknown collection")
    data.pop("id", None)
    return await c.update_doc(name, doc_id, data)


@router.delete("/admin/collection/{name}/{doc_id}")
async def coll_delete(name: str, doc_id: str, admin=Depends(ADMIN)):
    if name not in ALLOWED_COLLECTIONS:
        raise HTTPException(status_code=404, detail="Unknown collection")
    return await c.delete_doc(name, doc_id)



# ---------- Offers analytics (real click / claim / conversion tracking) ----------
from datetime import datetime, timezone  # noqa: E402


def _offer_status(o: dict) -> str:
    """Derive live status from explicit status + start/end dates."""
    st = (o.get("status") or "active").lower()
    if st in ("draft", "paused"):
        return st
    now = datetime.now(timezone.utc).isoformat()
    start = o.get("start_date") or o.get("start_at")
    end = o.get("end_date") or o.get("end_at")
    if start and now < start:
        return "scheduled"
    if end and now > end:
        return "expired"
    return "active"


@router.post("/offers/{offer_id}/track")
async def track_offer(offer_id: str, data: dict):
    """Public: record an offer interaction. event in view|click|claim|conversion."""
    from config.database import db
    event = (data or {}).get("event", "view")
    field_map = {"view": "views", "click": "clicks", "claim": "claims", "conversion": "conversions"}
    field = field_map.get(event)
    if not field:
        raise HTTPException(status_code=400, detail="Invalid event")
    inc = {field: 1}
    if event == "conversion":
        inc["revenue"] = float((data or {}).get("amount", 0) or 0)
    res = await db.offers.update_one({"id": offer_id}, {"$inc": inc})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Offer not found")
    return {"ok": True, "event": event}


@router.get("/admin/offers/stats")
async def offers_stats(admin=Depends(ADMIN)):
    """Live KPI aggregation across the offers collection."""
    from config.database import db
    offers = await db.offers.find({}, {"_id": 0}).to_list(5000)
    counts = {"active": 0, "scheduled": 0, "expired": 0, "draft": 0, "paused": 0}
    totals = {"views": 0, "clicks": 0, "claims": 0, "conversions": 0, "revenue": 0.0}
    for o in offers:
        counts[_offer_status(o)] = counts.get(_offer_status(o), 0) + 1
        for k in ("views", "clicks", "claims", "conversions"):
            totals[k] += int(o.get(k, 0) or 0)
        totals["revenue"] += float(o.get("revenue", 0) or 0)
    ctr = round((totals["clicks"] / totals["views"]) * 100, 1) if totals["views"] else 0.0
    conv_rate = round((totals["conversions"] / totals["claims"]) * 100, 1) if totals["claims"] else 0.0
    return {
        "total": len(offers),
        "active": counts["active"], "scheduled": counts["scheduled"], "expired": counts["expired"],
        "draft": counts["draft"], "paused": counts["paused"],
        "total_claims": totals["claims"], "total_clicks": totals["clicks"],
        "total_views": totals["views"], "conversions": totals["conversions"],
        "revenue": round(totals["revenue"], 2), "ctr": ctr, "conversion_rate": conv_rate,
    }
