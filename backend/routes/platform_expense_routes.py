"""Operating-expense ledger for Platform Earning (enables Net Profit)."""
import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from config.database import db, now_iso
from models.user import new_id
from middleware.auth import require_role
from services import platform_earning_service as pe

router = APIRouter(prefix="/admin/platform-earning/expenses", tags=["platform-earning"])
ADMIN = require_role("admin")

CATEGORIES = ["Salaries & Staff", "Marketing & Advertising", "Rent & Office", "Technology & Hosting",
              "SMS & Notifications", "Banking & Payment Charges", "Legal & Compliance", "Travel & Conveyance",
              "Utilities", "Partner Training & Kits", "Customer Support", "Miscellaneous"]
MODES = ["bank_transfer", "upi", "card", "cash", "cheque", "other"]


class ExpenseIn(BaseModel):
    date: str
    category: str = Field(min_length=2, max_length=60)
    amount: float = Field(gt=0, le=100000000)
    description: str = Field(default="", max_length=300)
    vendor: str = Field(default="", max_length=120)
    payment_mode: str = "bank_transfer"
    reference: str = Field(default="", max_length=80)

    @field_validator("date")
    @classmethod
    def _date(cls, v):
        try:
            datetime.strptime(v[:10], "%Y-%m-%d")
        except ValueError as e:
            raise ValueError("date must be YYYY-MM-DD") from e
        return v[:10]

    @field_validator("payment_mode")
    @classmethod
    def _mode(cls, v):
        if v not in MODES:
            raise ValueError("invalid payment mode")
        return v


def _who(admin):
    return {"id": admin.get("id"), "name": admin.get("name") or "Admin"}


def _bust():
    pe._CACHE.clear()


@router.get("/meta")
async def meta(admin=Depends(ADMIN)):
    used = await db.platform_expenses.distinct("category", pe.EXPENSE_LIVE)
    return {"categories": CATEGORIES + sorted(c for c in used if c and c not in CATEGORIES), "payment_modes": MODES}


@router.get("")
async def list_expenses(date_from: str = "", date_to: str = "", category: str = "", q: str = "",
                        sort: str = "date", order: str = "desc", page: int = 1, page_size: int = 10,
                        admin=Depends(ADMIN)):
    lo, hi = pe.bounds(date_from, date_to)
    m = {**pe.EXPENSE_LIVE, "date": {"$gte": lo, "$lte": hi}}
    if category:
        m["category"] = {"$in": category.split(",")}
    if q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        m["$or"] = [{"description": rx}, {"vendor": rx}, {"reference": rx}, {"category": rx}]
    sort = sort if sort in ("date", "amount", "category", "created_at") else "date"
    page, page_size = max(1, page), min(max(1, page_size), 100)
    res = await db.platform_expenses.aggregate([{"$match": m}, {"$facet": {
        "total": [{"$count": "n"}],
        "sum": [{"$group": {"_id": None, "amount": {"$sum": "$amount"}}}],
        "cat": [{"$group": {"_id": "$category", "amount": {"$sum": "$amount"}, "count": {"$sum": 1}}}, {"$sort": {"amount": -1}}],
        "rows": [{"$sort": {sort: 1 if order == "asc" else -1, "created_at": -1}}, {"$skip": (page - 1) * page_size},
                 {"$limit": page_size}, {"$project": {"_id": 0}}],
    }}]).to_list(1)
    r = res[0] if res else {}
    total_amt = ((r.get("sum") or [{}])[0]).get("amount") or 0
    return {"rows": r.get("rows", []), "total": ((r.get("total") or [{}])[0]).get("n", 0), "page": page,
            "page_size": page_size, "amount": round(total_amt, 2),
            "by_category": [{"category": c["_id"], "amount": round(c["amount"], 2), "count": c["count"],
                             "pct": pe._pct(c["amount"], total_amt) or 0} for c in r.get("cat", [])]}


@router.post("")
async def create_expense(body: ExpenseIn, admin=Depends(ADMIN)):
    now = now_iso()
    doc = {"id": new_id(), **body.model_dump(), "amount": round(body.amount, 2), "created_by": _who(admin),
           "created_at": now, "updated_at": now, "deleted": False,
           "history": [{"at": now, "by": _who(admin), "action": "created", "amount": round(body.amount, 2)}]}
    await db.platform_expenses.insert_one(dict(doc))
    _bust()
    doc.pop("_id", None)
    return doc


@router.put("/{eid}")
async def update_expense(eid: str, body: ExpenseIn, admin=Depends(ADMIN)):
    cur = await db.platform_expenses.find_one({"id": eid, **pe.EXPENSE_LIVE}, {"_id": 0})
    if not cur:
        raise HTTPException(404, "Expense not found")
    now = now_iso()
    vals = {**body.model_dump(), "amount": round(body.amount, 2)}
    changed = [k for k, v in vals.items() if cur.get(k) != v]
    await db.platform_expenses.update_one({"id": eid}, {
        "$set": {**vals, "updated_at": now, "updated_by": _who(admin)},
        "$push": {"history": {"at": now, "by": _who(admin), "action": "updated", "fields": changed,
                              "amount_before": cur.get("amount"), "amount": vals["amount"]}}})
    _bust()
    return await db.platform_expenses.find_one({"id": eid}, {"_id": 0})


@router.delete("/{eid}")
async def delete_expense(eid: str, admin=Depends(ADMIN)):
    now = now_iso()
    r = await db.platform_expenses.update_one({"id": eid, **pe.EXPENSE_LIVE}, {
        "$set": {"deleted": True, "deleted_at": now, "deleted_by": _who(admin)},
        "$push": {"history": {"at": now, "by": _who(admin), "action": "deleted"}}})
    if not r.matched_count:
        raise HTTPException(404, "Expense not found")
    _bust()
    return {"ok": True}


@router.get("/{eid}")
async def get_expense(eid: str, admin=Depends(ADMIN)):
    doc = await db.platform_expenses.find_one({"id": eid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Expense not found")
    return doc
