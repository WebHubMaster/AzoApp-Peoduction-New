"""Role-Based Access Control (RBAC) for the admin panel.

A role stores a permission matrix: {module_key: {view, create, edit, delete}}.
Admin users reference a role via `system_role_id`. The primary admin (or any user
flagged is_super_admin) bypasses all checks. Effective permissions are attached to
the user on /auth/me so the frontend can render a permission-aware layout, and
`require_permission()` enforces sensitive admin endpoints server-side.
"""
from fastapi import Depends, HTTPException
from config.database import db
from middleware.auth import get_current_user

PRIMARY_ADMIN_PHONE = "+919000000000"

ACTIONS = ["view", "create", "edit", "delete"]

# Canonical permission modules — these map 1:1 to the admin sidebar groups.
MODULES = [
    {"key": "dashboard", "label": "Dashboard & Overview"},
    {"key": "bookings", "label": "Bookings"},
    {"key": "live_operations", "label": "Live Operations"},
    {"key": "live_partner_map", "label": "Live Partner Map"},
    {"key": "services", "label": "Services & Catalog"},
    {"key": "partners", "label": "Partners"},
    {"key": "notifications", "label": "Notifications"},
    {"key": "partner_growth", "label": "Partner Growth"},
    {"key": "customers", "label": "Customers"},
    {"key": "merchants", "label": "Merchants"},
    {"key": "finance", "label": "Finance"},
    {"key": "marketing", "label": "Marketing"},
    {"key": "website_cms", "label": "Website / CMS"},
    {"key": "seo", "label": "SEO"},
    {"key": "communication", "label": "Support & Templates"},
    {"key": "reports_analytics", "label": "Reports & Analytics"},
    {"key": "access_control", "label": "Access Control"},
    {"key": "system", "label": "System"},
]
MODULE_KEYS = {m["key"] for m in MODULES}


def _full_perms():
    return {m["key"]: {a: True for a in ACTIONS} for m in MODULES}


def is_super(user: dict) -> bool:
    if not user:
        return False
    if user.get("is_super_admin"):
        return True
    if user.get("phone") == PRIMARY_ADMIN_PHONE:
        return True
    # An admin with NO assigned system role is treated as full admin (back-compat).
    if user.get("role") == "admin" and not user.get("system_role_id"):
        return True
    return False


def _normalize(perms: dict) -> dict:
    out = {}
    perms = perms or {}
    for m in MODULES:
        row = perms.get(m["key"], {}) or {}
        out[m["key"]] = {a: bool(row.get(a, False)) for a in ACTIONS}
    return out


async def effective_permissions(user: dict):
    """Return (permissions_map, is_super_admin) for an admin/staff user."""
    if user.get("role") not in ("admin", "staff"):
        return {}, False
    if is_super(user):
        return _full_perms(), True
    role = None
    if user.get("system_role_id"):
        role = await db.roles.find_one({"id": user["system_role_id"]}, {"_id": 0})
    if not role and user.get("system_role"):
        role = await db.roles.find_one({"name": user["system_role"]}, {"_id": 0})
    perms = (role or {}).get("permissions", {}) if isinstance((role or {}).get("permissions"), dict) else {}
    return _normalize(perms), False


async def enrich_user(user: dict) -> dict:
    """Attach `permissions` + `is_super_admin` to an admin/staff user doc; attach
    `rating_at_risk` (avg rating <= 4.6) for partners so the Web Panel & Partner App
    can show the persistent 'Your ID is at risk' warning banner."""
    if user and user.get("role") in ("admin", "staff"):
        perms, sup = await effective_permissions(user)
        user = {**user, "permissions": perms, "is_super_admin": sup,
                "rbac_modules": MODULES, "rbac_actions": ACTIONS}
    if user and user.get("role") == "partner":
        try:
            r = float(user.get("rating", 5) or 0)
        except (TypeError, ValueError):
            r = 5.0
        user = {**user, "rating_at_risk": r <= 4.6}
    return user


def require_permission(module: str, action: str = "view"):
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in ("admin", "staff"):
            raise HTTPException(status_code=403, detail="Admin access required")
        if is_super(user):
            return user
        perms, _ = await effective_permissions(user)
        if not perms.get(module, {}).get(action):
            raise HTTPException(status_code=403, detail=f"You don't have permission to {action} {module}")
        return user
    return dep


# ---- Server-side guard for every /api/admin/* call (restricted admins only) ----
_SEG_MODULE = {
    "bookings": "bookings", "bookings-cos-report": "bookings", "job-requests": "bookings",
    "dispatch-attention": "live_operations", "dispatch-feed": "live_operations",
    "partners": "partners", "partner": "partners", "partner-reg": "partners", "kyc": "partners",
    "area-partners": "partners", "coverage-map": "partners",
    "customers": "customers", "people": "customers", "users": "customers",
    "deletion-requests": "customers", "waitlist": "customers",
    "merchant": "merchants", "merchants": "merchants", "physical-qr": "merchants",
    "finance": "finance", "payouts": "finance", "refunds": "finance", "ledger": "finance",
    "payments": "finance", "platform-earning": "finance", "category-commissions": "finance", "renewals": "finance", "purchases": "finance",
    "coupons": "marketing", "offers": "marketing", "growth": "marketing", "loyalty": "marketing",
    "memberships": "marketing",
    "services": "services", "categories": "services", "subcategories": "services", "addons": "services",
    "price-manager": "services", "reviews": "services",
    "seo": "seo",
    "homepage-sections": "website_cms", "faq-categories": "website_cms", "pages": "website_cms",
    "app-home": "website_cms",
    "notifications": "notifications", "sms-templates": "notifications",
    "support": "communication", "tickets": "communication",
    "bugs": "communication",
    "reports": "reports_analytics", "report-runs": "reports_analytics",
    "report-schedules": "reports_analytics", "report-views": "reports_analytics",
    "system-users": "access_control", "rbac": "access_control",
    "settings": "system", "settings-audit": "system", "integrations": "system",
    "storage": "system", "logs": "system", "apk": "system", "config": "system", "collection": "system",
}
# Shared lookups (categories, settings…) are read by many sections → GET is only
# enforced for modules whose data is private to that section.
_VIEW_GUARDED = {"bookings", "partners", "customers", "merchants", "finance",
                 "reports_analytics", "access_control", "communication"}
_METHOD_ACTION = {"GET": "view", "HEAD": "view", "POST": "create", "PUT": "edit",
                  "PATCH": "edit", "DELETE": "delete"}


async def admin_rbac_guard(request) -> None:
    path = request.url.path
    if "/api/admin/" not in path:
        return
    auth = request.headers.get("authorization") or ""
    if not auth:
        return
    from middleware.auth import user_from_token
    user = await user_from_token(auth.replace("Bearer ", "").strip())
    if not user or user.get("role") not in ("admin", "staff") or is_super(user):
        return
    if (user.get("status") or "active") != "active":
        raise HTTPException(status_code=403, detail="Your admin account is suspended")
    parts = path.split("/api/admin/", 1)[1].split("/")
    seg = parts[0]
    module = _SEG_MODULE.get(seg)
    if seg == "collection" and len(parts) > 1 and parts[1] == "roles":
        module = "access_control"
    if not module:
        return
    action = _METHOD_ACTION.get(request.method.upper(), "view")
    if action == "view" and module not in _VIEW_GUARDED:
        return
    perms, _ = await effective_permissions(user)
    if not perms.get(module, {}).get(action):
        raise HTTPException(status_code=403, detail=f"You don't have permission to {action} {module.replace('_', ' ')}")
