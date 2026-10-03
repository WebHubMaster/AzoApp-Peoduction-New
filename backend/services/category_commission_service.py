"""Category-wise commission & cancellation-refund rates (admin: Commission & Refund menu)."""
from fastapi import HTTPException
from config.database import db, now_iso

COMM_KEYS = ("partner_pct", "platform_pct", "merchant_partner_referral_pct", "merchant_customer_pct")
CANC_KEYS = ("customer_refund_pct", "partner_cancellation_pct")
ALL_KEYS = COMM_KEYS + CANC_KEYS


async def get_for_category(category_id):
    if not category_id:
        return None
    return await db.category_commissions.find_one({"category_id": category_id}, {"_id": 0})


async def resolve(settings: dict, category_id) -> dict:
    """Commission block for a category; falls back to the global block if not configured."""
    base = dict((settings or {}).get("commission") or {})
    cc = await get_for_category(category_id)
    if cc:
        base.update({k: float(cc[k]) for k in ALL_KEYS if k in cc})
        base["category_id"] = category_id
        base["source"] = "category"
    else:
        base["source"] = "global"
    return base


async def settings_for_category(settings: dict, category_id) -> dict:
    out = dict(settings or {})
    out["commission"] = await resolve(settings, category_id)
    return out


async def list_all():
    cats = await db.categories.find({}, {"_id": 0, "id": 1, "name": 1, "icon": 1, "image": 1, "status": 1, "order": 1}) \
        .sort("order", 1).to_list(1000)
    rates = {r["category_id"]: r for r in await db.category_commissions.find({}, {"_id": 0}).to_list(1000)}
    out = []
    for c in cats:
        c["service_count"] = await db.services.count_documents({"category_id": c["id"]})
        r = rates.get(c["id"])
        c["commission"] = {k: r.get(k) for k in ALL_KEYS} if r else None
        c["commission_updated_at"] = (r or {}).get("updated_at")
        c["configured"] = bool(r)
        out.append(c)
    return {"categories": out, "total": len(out), "configured": sum(1 for c in out if c["configured"])}


def _validate(data: dict) -> dict:
    vals = {}
    for k in ALL_KEYS:
        if data.get(k) in (None, ""):
            raise HTTPException(status_code=400, detail=f"{k} is required")
        try:
            v = round(float(data[k]), 2)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"{k} must be a number")
        if v < 0 or v > 100:
            raise HTTPException(status_code=400, detail=f"{k} must be between 0 and 100")
        vals[k] = v
    csum = round(sum(vals[k] for k in COMM_KEYS), 2)
    if abs(csum - 100) > 0.01:
        raise HTTPException(status_code=400, detail=f"Commission %s must total 100. Currently {csum:g}.")
    rsum = round(sum(vals[k] for k in CANC_KEYS), 2)
    if abs(rsum - 100) > 0.01:
        raise HTTPException(status_code=400, detail=f"Cancellation split must total 100. Currently {rsum:g}.")
    return vals


async def upsert(category_id: str, data: dict, admin: dict = None):
    cat = await db.categories.find_one({"id": category_id}, {"_id": 0, "id": 1, "name": 1})
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    vals = _validate(data)
    doc = {**vals, "category_id": category_id, "category_name": cat.get("name"),
           "updated_at": now_iso(), "updated_by": (admin or {}).get("id")}
    await db.category_commissions.update_one({"category_id": category_id}, {"$set": doc}, upsert=True)
    return doc


async def bulk_apply(category_ids: list, data: dict, admin: dict = None):
    vals = _validate(data)
    done = []
    for cid in category_ids or []:
        done.append(await upsert(cid, vals, admin))
    return {"updated": len(done)}


async def delete_for_category(category_id: str):
    await db.category_commissions.delete_one({"category_id": category_id})
