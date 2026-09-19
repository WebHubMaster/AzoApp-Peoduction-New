"""Rate Card (customer-facing, category-level, Urban-Company-style but richer).

One rate card per category. Shows grouped price tables (group -> rows).
Each row: description, service charge, optional labour charge, warranty, note.
Public reads only active cards; admin sees all.
"""
from fastapi import HTTPException
from config.database import db, now_iso
from models.ratecard import new_id


def _to_pct(v) -> float:
    """Clamp a discount percentage to 0..95."""
    try:
        n = float(v)
    except (TypeError, ValueError):
        return 0.0
    if n < 0:
        return 0.0
    if n > 95:
        return 95.0
    return round(n, 2)


def _norm_row(r: dict, i: int) -> dict:
    return {
        "id": r.get("id") or new_id(),
        "description": (r.get("description") or "").strip(),
        "service_charge": str(r.get("service_charge") or "").strip(),
        "labour_charge": str(r.get("labour_charge") or "").strip(),
        "original_charge": str(r.get("original_charge") or "").strip(),
        "warranty": (r.get("warranty") or "").strip(),
        "note": (r.get("note") or "").strip(),
        "discount_pct": _to_pct(r.get("discount_pct")),
        "discount_until": (r.get("discount_until") or "").strip(),
        "order": r.get("order") if r.get("order") is not None else i,
    }


def _norm_group(g: dict, i: int) -> dict:
    rows = g.get("rows") or []
    return {
        "id": g.get("id") or new_id(),
        "name": (g.get("name") or "").strip(),
        "note": (g.get("note") or "").strip(),
        "order": g.get("order") if g.get("order") is not None else i,
        "rows": [_norm_row(r, j) for j, r in enumerate(rows)],
    }


def _norm_groups(groups) -> list:
    groups = groups or []
    out = [_norm_group(g, i) for i, g in enumerate(groups)]
    out.sort(key=lambda x: x.get("order", 0))
    for g in out:
        g["rows"].sort(key=lambda x: x.get("order", 0))
    return out


async def _attach_category(card: dict) -> dict:
    cat = await db.categories.find_one({"id": card.get("category_id")}, {"_id": 0, "name": 1, "slug": 1})
    card["category_name"] = cat.get("name") if cat else card.get("category_name", "")
    card["category_slug"] = cat.get("slug") if cat else ""
    return card


# ---------------- PUBLIC ----------------
async def public_by_category(slug_or_id: str):
    cat = await db.categories.find_one({"$or": [{"id": slug_or_id}, {"slug": slug_or_id}]}, {"_id": 0, "id": 1})
    cat_id = cat["id"] if cat else slug_or_id
    card = await db.rate_cards.find_one({"category_id": cat_id, "status": "active"}, {"_id": 0})
    if not card:
        return None
    return await _attach_category(card)


async def public_by_service(service_id: str):
    svc = await db.services.find_one({"$or": [{"id": service_id}, {"slug": service_id}]}, {"_id": 0, "category_id": 1})
    if not svc:
        return None
    return await public_by_category(svc.get("category_id", ""))


async def search_rows(q: str, limit: int = 20):
    """Search rate-card ROWS across all active cards so customers can find a
    specific repair/part in the global search and book it directly."""
    q = (q or "").strip().lower()
    if len(q) < 2:
        return []
    cards = await db.rate_cards.find({"status": "active"}, {"_id": 0}).to_list(500)
    out = []
    for c in cards:
        await _attach_category(c)
        for g in (c.get("groups") or []):
            for r in (g.get("rows") or []):
                hay = " ".join([
                    r.get("description", ""), r.get("note", ""),
                    r.get("warranty", ""), g.get("name", ""),
                    c.get("category_name", ""),
                ]).lower()
                if q in hay:
                    out.append({
                        "card_id": c.get("id"),
                        "row_id": r.get("id"),
                        "category_id": c.get("category_id"),
                        "category_name": c.get("category_name", ""),
                        "category_slug": c.get("category_slug", ""),
                        "accent_color": c.get("accent_color") or "#0D47A1",
                        "brand_label": c.get("brand_label") or "AzoCover",
                        "group_name": g.get("name", ""),
                        "description": r.get("description", ""),
                        "service_charge": r.get("service_charge", ""),
                        "labour_charge": r.get("labour_charge", ""),
                        "original_charge": r.get("original_charge", ""),
                        "warranty": r.get("warranty", ""),
                        "note": r.get("note", ""),
                        "discount_pct": r.get("discount_pct", 0),
                        "discount_until": r.get("discount_until", ""),
                    })
                    if len(out) >= limit:
                        return out
    return out


# ---------------- ADMIN ----------------
async def admin_list():
    cards = await db.rate_cards.find({}, {"_id": 0}).to_list(1000)
    for c in cards:
        await _attach_category(c)
        c["group_count"] = len(c.get("groups") or [])
        c["row_count"] = sum(len(g.get("rows") or []) for g in (c.get("groups") or []))
    cards.sort(key=lambda x: x.get("category_name", ""))
    return cards


async def admin_get(card_id: str):
    card = await db.rate_cards.find_one({"id": card_id}, {"_id": 0})
    if not card:
        raise HTTPException(status_code=404, detail="Rate card not found")
    return await _attach_category(card)


async def create(data: dict):
    cat = await db.categories.find_one({"id": data.get("category_id")}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    existing = await db.rate_cards.find_one({"category_id": data["category_id"]}, {"_id": 0, "id": 1})
    if existing:
        raise HTTPException(status_code=400, detail="A rate card already exists for this category. Edit it instead.")
    card = {
        "id": new_id(),
        "category_id": data["category_id"],
        "category_name": cat.get("name", ""),
        "title": (data.get("title") or "Standard rate card").strip(),
        "subtitle": (data.get("subtitle") or "").strip(),
        "brand_label": (data.get("brand_label") or "AzoCover").strip(),
        "intro": (data.get("intro") or "").strip(),
        "footer_note": (data.get("footer_note") or "").strip(),
        "accent_color": data.get("accent_color") or "#0D47A1",
        "status": data.get("status") or "active",
        "groups": _norm_groups(data.get("groups")),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.rate_cards.insert_one(dict(card))
    card.pop("_id", None)
    return card


async def update(card_id: str, data: dict):
    card = await db.rate_cards.find_one({"id": card_id}, {"_id": 0})
    if not card:
        raise HTTPException(status_code=404, detail="Rate card not found")
    upd = {}
    for k in ("title", "subtitle", "brand_label", "intro", "footer_note", "accent_color", "status"):
        if k in data and data[k] is not None:
            upd[k] = data[k]
    if "category_id" in data and data["category_id"] and data["category_id"] != card["category_id"]:
        cat = await db.categories.find_one({"id": data["category_id"]}, {"_id": 0})
        if not cat:
            raise HTTPException(status_code=404, detail="Category not found")
        clash = await db.rate_cards.find_one({"category_id": data["category_id"], "id": {"$ne": card_id}}, {"_id": 0, "id": 1})
        if clash:
            raise HTTPException(status_code=400, detail="Another rate card already uses this category.")
        upd["category_id"] = data["category_id"]
        upd["category_name"] = cat.get("name", "")
    if "groups" in data and data["groups"] is not None:
        upd["groups"] = _norm_groups(data["groups"])
    upd["updated_at"] = now_iso()
    await db.rate_cards.update_one({"id": card_id}, {"$set": upd})
    return await admin_get(card_id)


async def delete(card_id: str):
    res = await db.rate_cards.delete_one({"id": card_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Rate card not found")
    return {"deleted": True}


async def duplicate(card_id: str):
    src = await db.rate_cards.find_one({"id": card_id}, {"_id": 0})
    if not src:
        raise HTTPException(status_code=404, detail="Rate card not found")
    # duplicate needs a category without an existing card; leave category empty-ish is not allowed,
    # so create as inactive draft on same category only if none active conflict — otherwise block.
    raise HTTPException(status_code=400, detail="Duplicate not supported (one card per category).")
