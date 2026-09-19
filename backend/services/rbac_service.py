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
    """Attach `permissions` + `is_super_admin` to an admin/staff user doc."""
    if user and user.get("role") in ("admin", "staff"):
        perms, sup = await effective_permissions(user)
        user = {**user, "permissions": perms, "is_super_admin": sup,
                "rbac_modules": MODULES, "rbac_actions": ACTIONS}
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
