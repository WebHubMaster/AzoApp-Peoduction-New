"""Merchant Referral & Commission routes (privacy-safe, ledger-sourced).

The merchant panel's "My Customers", "My Partners" and "Commission" screens use
these endpoints. They return ONLY referral + commission data and NEVER expose
customer/partner personal contact information.
"""
from fastapi import APIRouter, Depends
from middleware.auth import require_role
from services import merchant_reg_service as mrs
from services import merchant_referral_service as mrf

router = APIRouter(prefix="/merchant/referral", tags=["merchant-referral"])


async def _approved(user=Depends(require_role("merchant"))):
    await mrs.assert_merchant_approved(user)
    return user


APPROVED = Depends(_approved)


def _f(page, page_size, **kw):
    return {"page": page, "page_size": page_size, **kw}


# ── Commission report cards + history ──
@router.get("/report")
async def report(user=APPROVED):
    return await mrf.commission_report(user["id"])


@router.get("/commission")
async def commission(page: int = 1, page_size: int = 10, q: str = "", type: str = "",
                     status: str = "", range: str = "", date_from: str = "", date_to: str = "",
                     user=APPROVED):
    return await mrf.commission_history(user["id"], _f(
        page, page_size, q=q, type=type, status=status, range=range,
        date_from=date_from, date_to=date_to))


# ── My Customers ──
@router.get("/customers")
async def customers(page: int = 1, page_size: int = 10, q: str = "", user=APPROVED):
    return await mrf.list_customers(user["id"], _f(page, page_size, q=q))


@router.get("/customers/{cid}")
async def customer_detail(cid: str, user=APPROVED):
    return await mrf.customer_detail(user["id"], cid)


# ── My Partners ──
@router.get("/partners")
async def partners(page: int = 1, page_size: int = 10, q: str = "", status: str = "",
                   category: str = "", user=APPROVED):
    return await mrf.list_partners(user["id"], _f(page, page_size, q=q, status=status, category=category))


@router.get("/partners/{pid}")
async def partner_detail(pid: str, user=APPROVED):
    return await mrf.partner_detail(user["id"], pid)
