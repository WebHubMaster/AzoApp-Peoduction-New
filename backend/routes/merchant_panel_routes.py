"""Advanced Merchant Panel routes — Reminders, Network, Commission, Wallet
transactions, and the first-withdrawal Bank & KYC flow. Every feature is gated
at the DATABASE/BACKEND level: the merchant profile must be admin-approved.
"""
from fastapi import APIRouter, Depends, Response
from middleware.auth import require_role
from services import merchant_reg_service as mrs
from services import merchant_panel_service as mps
from services import merchant_wallet_service as mws
from services import merchant_bank_service as mbs

router = APIRouter(prefix="/merchant/panel", tags=["merchant-panel"])


async def _approved(user=Depends(require_role("merchant"))):
    await mrs.assert_merchant_approved(user)
    return user


APPROVED = Depends(_approved)
MERCHANT = Depends(require_role("merchant"))


def _filters(page, page_size, **kw):
    return {"page": page, "page_size": page_size, **kw}


# ── access state (open to any merchant — drives the profile-gate UI) ──
@router.get("/access")
async def access(user=MERCHANT):
    return await mrs.access_state(user)


# ═══════════════════════════════ REMINDERS ══════════════════════════════════
@router.get("/reminders/stats")
async def reminders_stats(user=APPROVED):
    return await mps.reminder_stats(user["id"])


@router.get("/reminders")
async def reminders(page: int = 1, page_size: int = 10, q: str = "", status: str = "",
                    service: str = "", priority: str = "", user=APPROVED):
    return await mps.list_reminders(user["id"], _filters(page, page_size, q=q, status=status,
                                                         service=service, priority=priority))


@router.get("/reminders/insights")
async def reminders_insights(user=APPROVED):
    return await mps.reminder_insights(user["id"])


@router.get("/reminders/notifications")
async def reminders_notifications(page: int = 1, page_size: int = 50, status: str = "", q: str = "", user=APPROVED):
    return await mps.reminder_notifications(user["id"], _filters(page, page_size, status=status, q=q))


@router.get("/reminders/{rid}")
async def get_reminder(rid: str, user=APPROVED):
    return await mps.get_reminder(user["id"], rid)


@router.post("/reminders")
async def create_reminder(data: dict, user=APPROVED):
    return await mps.create_reminder(user["id"], data)


@router.post("/reminders/{rid}/action")
async def reminder_action(rid: str, data: dict, user=APPROVED):
    return await mps.reminder_action(user["id"], rid, data.get("action"), data)


@router.delete("/reminders/{rid}")
async def delete_reminder(rid: str, user=APPROVED):
    return await mps.delete_reminder(user["id"], rid)


# ═══════════════════════════════ NETWORK ════════════════════════════════════
@router.get("/network/stats")
async def network_stats(user=APPROVED):
    return await mps.network_stats(user["id"])


@router.get("/network/tree")
async def network_tree(user=APPROVED):
    return await mps.network_tree(user["id"])


@router.get("/network")
async def network(page: int = 1, page_size: int = 10, q: str = "", status: str = "",
                  level: str = "", member_type: str = "", relationship: str = "", sort: str = "newest",
                  user=APPROVED):
    return await mps.list_network(user["id"], _filters(page, page_size, q=q, status=status, level=level,
                                                       member_type=member_type, relationship=relationship, sort=sort))


@router.get("/network/member/{nid}")
async def network_member(nid: str, user=APPROVED):
    return await mps.network_member(user["id"], nid)


# ═══════════════════════════════ COMMISSION ═════════════════════════════════
@router.get("/commission/summary")
async def commission_summary(user=APPROVED):
    return await mps.commission_summary(user["id"])


@router.get("/commission")
async def commission(page: int = 1, page_size: int = 10, q: str = "", type: str = "",
                     status: str = "", date_from: str = "", date_to: str = "", sort: str = "newest", user=APPROVED):
    return await mps.list_commission(user["id"], _filters(page, page_size, q=q, type=type,
                                                          status=status, date_from=date_from, date_to=date_to, sort=sort))


@router.get("/commission/analytics")
async def commission_analytics(user=APPROVED):
    return await mps.commission_analytics(user["id"])


@router.get("/commission/export")
async def commission_export(q: str = "", type: str = "", status: str = "",
                            date_from: str = "", date_to: str = "", user=APPROVED):
    csv_data = await mps.commission_csv(user["id"], {"q": q, "type": type, "status": status,
                                                     "date_from": date_from, "date_to": date_to})
    return Response(content=csv_data, media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=commission.csv"})


# ═══════════════════════════════ WALLET ═════════════════════════════════════
@router.get("/wallet/overview")
async def wallet_overview(user=APPROVED):
    summary = await mws.wallet_summary(user)
    return {"summary": summary, "config": await mws.get_wallet_config(),
            "payout": await mws.payout_state(user),
            "finance": await mbs.finance_state(user["id"])}


@router.get("/wallet/transactions")
async def wallet_transactions(page: int = 1, page_size: int = 10, q: str = "", type: str = "",
                              direction: str = "", date_from: str = "", date_to: str = "", user=APPROVED):
    return await mps.wallet_transactions(user["id"], _filters(page, page_size, q=q, type=type,
                                         direction=direction, date_from=date_from, date_to=date_to))


@router.get("/wallet/withdrawals")
async def withdrawals(user=APPROVED):
    return await mws.list_withdrawals(user["id"])


# ═══════════════════════ FIRST-WITHDRAWAL BANK & KYC ═════════════════════════
@router.get("/payout/state")
async def payout_state(user=APPROVED):
    return await mws.payout_state(user)


@router.put("/payout")
async def save_payout(data: dict, user=APPROVED):
    return await mws.save_payout(user, data)


@router.post("/withdraw")
async def withdraw(data: dict, user=APPROVED):
    return await mws.request_withdrawal(user, data.get("amount"), data.get("method", "bank"),
                                        data.get("upi_id", ""), data.get("bank"), data.get("cheque"))


# ═══════════════════════ BANK & KYC (partner-style) ═════════════════════════
@router.get("/finance-kyc")
async def finance_kyc(user=APPROVED):
    return await mbs.finance_state(user["id"])


@router.post("/finance-kyc/pan")
async def finance_kyc_pan(data: dict, user=APPROVED):
    return await mbs.submit_pan(user, data.get("pan_number"), data.get("pan_url"))


@router.get("/finance-kyc/banks")
async def finance_kyc_banks(user=APPROVED):
    return await mbs.list_banks(user["id"])


@router.post("/finance-kyc/banks")
async def finance_kyc_add_bank(data: dict, user=APPROVED):
    return await mbs.add_bank(user, data)


@router.put("/finance-kyc/banks/{bank_id}")
async def finance_kyc_update_bank(bank_id: str, data: dict, user=APPROVED):
    return await mbs.update_bank(user, bank_id, data)


@router.delete("/finance-kyc/banks/{bank_id}")
async def finance_kyc_delete_bank(bank_id: str, user=APPROVED):
    return await mbs.delete_bank(user, bank_id)


@router.post("/finance-kyc/banks/{bank_id}/primary")
async def finance_kyc_primary_bank(bank_id: str, user=APPROVED):
    return await mbs.set_primary_bank(user, bank_id)


# ═══════════════════════════════ QR (scan analytics + poster config) ════════
@router.get("/qr/analytics")
async def qr_analytics(range: str = "30d", user=APPROVED):
    from services import merchant_qr_service as mqs
    return await mqs.analytics(user["id"], range)


@router.get("/qr/config")
async def qr_config(user=APPROVED):
    from services import merchant_qr_service as mqs
    return await mqs.get_config(user["id"])


@router.put("/qr/config")
async def qr_save_config(data: dict, user=APPROVED):
    from services import merchant_qr_service as mqs
    return await mqs.save_config(user["id"], data)
