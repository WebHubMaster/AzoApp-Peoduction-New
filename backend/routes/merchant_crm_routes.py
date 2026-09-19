"""Merchant CRM routes — /api/merchant/crm/*  (merchant-scoped customer records)."""
from fastapi import APIRouter, Depends, UploadFile, File, Body
from fastapi.responses import Response
from middleware.auth import require_role
from services import merchant_crm_service as crm

router = APIRouter(prefix="/merchant/crm", tags=["merchant-crm"])
M = require_role("merchant")


def _params(q="", status="", type="", category="", activity="", last_service="", date_from="", date_to="",
            spent="", since_from="", since_to="", location="", preferred_service="", payment_status="",
            sort="newest", page: int = 1, page_size: int = 20):
    return {"q": q, "status": status, "type": type, "category": category, "activity": activity,
            "last_service": last_service, "date_from": date_from, "date_to": date_to, "spent": spent,
            "since_from": since_from, "since_to": since_to, "location": location, "preferred_service": preferred_service,
            "payment_status": payment_status, "sort": sort, "page": page, "page_size": page_size}


@router.get("/customers")
async def list_customers(p: dict = Depends(_params), user=Depends(M)):
    return await crm.list_customers(user, p)


@router.get("/customers/export")
async def export_customers(p: dict = Depends(_params), user=Depends(M)):
    csv_text = await crm.export_csv(user, p)
    return Response(content=csv_text, media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=customers.csv"})


@router.post("/customers")
async def create_customer(data: dict = Body(...), user=Depends(M)):
    return await crm.create_customer(user, data)


@router.post("/customers/bulk")
async def bulk(data: dict = Body(...), user=Depends(M)):
    return await crm.bulk_action(user, data.get("ids") or [], data.get("action") or "", data.get("payload") or {})


@router.post("/customers/import/preview")
async def import_preview(file: UploadFile = File(...), user=Depends(M)):
    return await crm.import_preview(user, await file.read())


@router.post("/customers/import")
async def import_commit(file: UploadFile = File(...), user=Depends(M)):
    return await crm.import_commit(user, await file.read())


@router.get("/customers/{cid}")
async def get_customer(cid: str, user=Depends(M)):
    return await crm.get_profile(user, cid)


@router.put("/customers/{cid}")
async def update_customer(cid: str, data: dict = Body(...), user=Depends(M)):
    return await crm.update_customer(user, cid, data)


@router.post("/customers/{cid}/status")
async def set_status(cid: str, data: dict = Body(...), user=Depends(M)):
    return await crm.set_status(user, cid, data.get("status") or "")


@router.delete("/customers/{cid}")
async def delete_customer(cid: str, user=Depends(M)):
    return await crm.delete_customer(user, cid)


@router.post("/customers/{cid}/notes")
async def add_note(cid: str, data: dict = Body(...), user=Depends(M)):
    return await crm.add_note(user, cid, data.get("text") or "")


@router.put("/customers/{cid}/notes/{nid}")
async def update_note(cid: str, nid: str, data: dict = Body(...), user=Depends(M)):
    return await crm.update_note(user, cid, nid, data.get("text") or "")


@router.delete("/customers/{cid}/notes/{nid}")
async def delete_note(cid: str, nid: str, user=Depends(M)):
    return await crm.delete_note(user, cid, nid)


@router.post("/customers/{cid}/message")
async def send_message(cid: str, data: dict = Body(...), user=Depends(M)):
    return await crm.send_message(user, cid, data.get("text") or "")
