"""AzoApp Service Packages / Combo Bundles.

Packages live in the `service_packages` collection. Pricing is ALWAYS derived on the
server: the "original value" is recomputed from the live prices of the included
services, while the selling price is what the admin set. When a customer books a
package we snapshot everything onto the booking so historical orders never drift.
"""
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException

from config.database import db, now_iso, get_settings


def new_id():
    return str(uuid4())


def _slugify(s: str) -> str:
    return "".join(c if c.isalnum() else "-" for c in (s or "").lower()).strip("-").replace("--", "-") or new_id()[:8]


def _parse(dt):
    if not dt:
        return None
    try:
        return datetime.fromisoformat(str(dt).replace("Z", "+00:00"))
    except Exception:
        return None


def _now():
    return datetime.now(timezone.utc)


async def _gst_pct() -> float:
    try:
        return float((await get_settings() or {}).get("gst_pct") or 0)
    except Exception:
        return 0.0


async def _resolve_items(items: list) -> list:
    """Hydrate item service names + live base prices."""
    out = []
    for it in items or []:
        sid = it.get("service_id")
        if not sid:
            continue
        svc = await db.services.find_one({"id": sid}, {"_id": 0, "id": 1, "name": 1, "base_price": 1,
                                                        "category_id": 1, "category_name": 1, "image": 1})
        if not svc:
            continue
        out.append({
            "service_id": sid,
            "service_name": svc.get("name"),
            "base_price": round(float(svc.get("base_price") or 0), 2),
            "qty": int(it.get("qty") or 1),
            "category_name": svc.get("category_name"),
            "image": svc.get("image"),
        })
    return out


async def compute_pricing(pkg: dict, gst_pct: float | None = None) -> dict:
    if gst_pct is None:
        gst_pct = await _gst_pct()
    items = pkg.get("items") or []
    original = round(sum(float(i.get("base_price") or 0) * int(i.get("qty") or 1) for i in items), 2)
    price = round(float(pkg.get("price") or 0), 2)
    discount = round(max(original - price, 0), 2)
    discount_pct = round((discount / original * 100), 1) if original > 0 else 0
    if pkg.get("tax_inclusive"):
        tax = 0.0
        total = price
    else:
        tax = round(price * gst_pct / 100, 2)
        total = round(price + tax, 2)
    return {"original": original, "price": price, "discount": discount,
            "discount_pct": discount_pct, "gst_pct": gst_pct, "tax": tax,
            "total": total, "savings": discount, "service_count": len(items)}


async def _decorate(pkg: dict, gst_pct: float | None = None) -> dict:
    pkg.pop("_id", None)
    pkg["items"] = await _resolve_items(pkg.get("items") or [])
    pkg["pricing"] = await compute_pricing(pkg, gst_pct)
    return pkg


# ------------------------------------------------------------------ customer facing
async def list_active(customer: dict | None = None, city: str = "") -> list:
    cfg = (await get_settings() or {}).get("packages") or {}
    if not cfg.get("enabled", True):
        return []
    now = _now()
    docs = await db.service_packages.find({"active": True}, {"_id": 0}).to_list(200)
    gst = await _gst_pct()
    out = []
    for p in docs:
        if not p.get("always_active", True):
            s, e = _parse(p.get("start_date")), _parse(p.get("end_date"))
            if s and now < s:
                continue
            if e and now > e:
                continue
        cities = p.get("cities") or []
        if cities and city and city not in cities:
            continue
        tq = int(p.get("total_quantity") or 0)
        if tq > 0 and int(p.get("sold_count") or 0) >= tq:
            continue
        out.append(await _decorate(p, gst))
    out.sort(key=lambda x: (0 if x.get("featured") else 1, int(x.get("display_order") or 999)))
    return out


async def get_detail(pkg_id: str) -> dict:
    p = await db.service_packages.find_one({"id": pkg_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Package not found")
    return await _decorate(p)


async def book_package(user: dict, pkg_id: str, address: dict, schedule_type: str = "asap",
                       scheduled_at: str = None, notes: str = "") -> dict:
    p = await db.service_packages.find_one({"id": pkg_id}, {"_id": 0})
    if not p or not p.get("active"):
        raise HTTPException(status_code=404, detail="Package not available")
    tq = int(p.get("total_quantity") or 0)
    if tq > 0 and int(p.get("sold_count") or 0) >= tq:
        raise HTTPException(status_code=400, detail="This package is sold out")
    pcl = int(p.get("per_customer_limit") or 0)
    if pcl > 0:
        mine = await db.bookings.count_documents({"customer_id": user["id"], "package_id": pkg_id})
        if mine >= pcl:
            raise HTTPException(status_code=400, detail="You've reached the purchase limit for this package")
    items = await _resolve_items(p.get("items") or [])
    p["items"] = items
    pricing = await compute_pricing(p)
    from controllers.booking_controller import _unique_code
    code = await _unique_code()
    booking = {
        "id": new_id(), "code": code,
        "customer_id": user["id"], "customer_name": user.get("name"), "customer_phone": user.get("phone"),
        "booking_type": "package", "is_package": True,
        "package_id": pkg_id, "package_name": p.get("name"),
        "package_snapshot": {"name": p.get("name"), "image": p.get("image"), "items": items,
                             "price": pricing["price"], "original": pricing["original"]},
        "service_id": None, "service_name": p.get("name"),
        "category_id": p.get("category_id"), "category_name": p.get("category_name") or "Combo Package",
        "items": items,
        "address": address or {}, "schedule_type": schedule_type, "scheduled_at": scheduled_at,
        "notes": notes,
        "pricing": {"subtotal": pricing["price"], "discount": pricing["discount"],
                    "gst": pricing["tax"], "total": pricing["total"],
                    "original_value": pricing["original"]},
        "status": "searching", "payment_status": "pending",
        "timeline": [{"status": "placed", "at": now_iso()}],
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.bookings.insert_one(booking)
    await db.service_packages.update_one({"id": pkg_id}, {"$inc": {"sold_count": 1}})
    booking.pop("_id", None)
    try:
        from services.notification_service import notify
        await notify(user["id"], "Package booked 🎉",
                     f"{p.get('name')} — ₹{pricing['total']:g}. We're arranging your services.",
                     link="/account")
    except Exception:
        pass
    return {"ok": True, "booking": booking}


# ------------------------------------------------------------------ admin facing
async def admin_list() -> list:
    docs = await db.service_packages.find({}, {"_id": 0}).sort("display_order", 1).to_list(500)
    gst = await _gst_pct()
    return [await _decorate(p, gst) for p in docs]


async def admin_save(admin: dict, data: dict, pkg_id: str = None) -> dict:
    items_in = data.get("items") or []
    items = await _resolve_items(items_in)
    if not items:
        raise HTTPException(status_code=400, detail="Add at least one service to the package")
    now = now_iso()
    doc = {
        "name": data.get("name") or "Untitled Package",
        "slug": data.get("slug") or _slugify(data.get("name") or ""),
        "short_desc": data.get("short_desc") or "",
        "description": data.get("description") or "",
        "image": data.get("image") or (items[0].get("image") if items else ""),
        "banner": data.get("banner") or "",
        "icon": data.get("icon") or "",
        "category_id": data.get("category_id") or (items[0].get("service_id") and None),
        "category_name": data.get("category_name") or "Combo Package",
        "tags": data.get("tags") or [],
        "items": [{"service_id": i["service_id"], "qty": i["qty"]} for i in items],
        "price": round(float(data.get("price") or 0), 2),
        "tax_inclusive": bool(data.get("tax_inclusive")),
        "active": bool(data.get("active", True)),
        "featured": bool(data.get("featured", False)),
        "display_order": int(data.get("display_order") or 0),
        "cities": data.get("cities") or [],
        "always_active": bool(data.get("always_active", True)),
        "start_date": data.get("start_date") or "",
        "end_date": data.get("end_date") or "",
        "total_quantity": int(data.get("total_quantity") or 0),
        "daily_limit": int(data.get("daily_limit") or 0),
        "per_customer_limit": int(data.get("per_customer_limit") or 0),
        "updated_at": now,
    }
    if pkg_id:
        existing = await db.service_packages.find_one({"id": pkg_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Package not found")
        await db.service_packages.update_one({"id": pkg_id}, {"$set": doc})
        await _audit(admin, "package_update", pkg_id, existing, doc)
        out = await db.service_packages.find_one({"id": pkg_id}, {"_id": 0})
    else:
        doc.update({"id": new_id(), "sold_count": 0, "created_at": now,
                    "created_by": (admin or {}).get("id")})
        await db.service_packages.insert_one(doc)
        doc.pop("_id", None)
        await _audit(admin, "package_create", doc["id"], None, doc)
        out = await db.service_packages.find_one({"id": doc["id"]}, {"_id": 0})
    return await _decorate(out)


async def admin_duplicate(admin: dict, pkg_id: str) -> dict:
    p = await db.service_packages.find_one({"id": pkg_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Package not found")
    p.pop("id", None)
    p["name"] = f"{p.get('name','Package')} (Copy)"
    p["active"] = False
    p["items"] = [{"service_id": i["service_id"], "qty": i.get("qty", 1)} for i in (p.get("items") or [])]
    return await admin_save(admin, p)


async def admin_delete(admin: dict, pkg_id: str) -> dict:
    existing = await db.service_packages.find_one({"id": pkg_id}, {"_id": 0})
    await db.service_packages.delete_one({"id": pkg_id})
    if existing:
        await _audit(admin, "package_delete", pkg_id, existing, None)
    return {"ok": True}


async def admin_toggle(admin: dict, pkg_id: str, active: bool) -> dict:
    await db.service_packages.update_one({"id": pkg_id}, {"$set": {"active": bool(active), "updated_at": now_iso()}})
    await _audit(admin, "package_toggle", pkg_id, None, {"active": active})
    out = await db.service_packages.find_one({"id": pkg_id}, {"_id": 0})
    return await _decorate(out)


async def admin_analytics() -> dict:
    now = _now()
    pkgs = await db.service_packages.find({}, {"_id": 0}).to_list(500)
    active = sum(1 for p in pkgs if p.get("active"))
    expired = 0
    for p in pkgs:
        e = _parse(p.get("end_date"))
        if not p.get("always_active", True) and e and now > e:
            expired += 1
    bookings = await db.bookings.find({"is_package": True}, {"_id": 0}).to_list(5000)
    total_bookings = len(bookings)
    revenue = round(sum(float((b.get("pricing") or {}).get("total") or 0) for b in bookings), 2)
    discount = round(sum(float((b.get("pricing") or {}).get("discount") or 0) for b in bookings), 2)
    aov = round(revenue / total_bookings, 2) if total_bookings else 0
    by_pkg = {}
    for b in bookings:
        k = b.get("package_id")
        if not k:
            continue
        e = by_pkg.setdefault(k, {"package_id": k, "name": b.get("package_name"), "bookings": 0, "revenue": 0.0})
        e["bookings"] += 1
        e["revenue"] = round(e["revenue"] + float((b.get("pricing") or {}).get("total") or 0), 2)
    popular = sorted(by_pkg.values(), key=lambda x: x["bookings"], reverse=True)[:10]
    return {"total_packages": len(pkgs), "active": active, "expired": expired,
            "total_bookings": total_bookings, "revenue": revenue, "discount": discount,
            "aov": aov, "popular": popular}


async def _audit(admin: dict, action: str, entity_id: str, old, new) -> None:
    try:
        await db.growth_audit.insert_one({
            "id": new_id(), "actor_id": (admin or {}).get("id"),
            "actor_name": (admin or {}).get("name") or "Admin",
            "action": action, "entity": "package", "entity_id": entity_id,
            "old": old, "new": new, "created_at": now_iso(),
        })
    except Exception:
        pass
