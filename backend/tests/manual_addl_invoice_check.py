import asyncio, sys
sys.path.insert(0,'/app/backend')
from dotenv import load_dotenv; load_dotenv('/app/backend/.env')
from config.database import db, get_settings
from services import invoice_service as inv_svc
from controllers import booking_controller as bc
async def m():
    b = await db.bookings.find_one({"status":{"$in":["completed","paid"]},"customer_id":{"$exists":True,"$ne":""},"pricing.total":{"$gt":0}},{"_id":0})
    if not b: print("no completed booking"); return
    s = await get_settings()
    await inv_svc.ensure_booking_invoice(b, s)
    before = await db.invoices.find_one({"booking_id":b["id"],"invoice_type":"booking"},{"_id":0})
    print("BEFORE total", before["total_amount"], "gst grand", (before.get("gst_invoice") or {}).get("grand_total"))
    addl={"items":[{"id":"x1","description":"Tap replacement","part_charge":300,"labour_charge":200}],"status":"paid","paid_at":"now"}
    addl = await bc._recompute_additional({**b,"additional":addl}, s)
    await db.bookings.update_one({"id":b["id"]},{"$set":{"additional":addl}})
    print("ADDL", {k:addl[k] for k in ("total","gst","commission","partner_earning")})
    cust = {"id": b["customer_id"], "role": "customer"}
    out = await inv_svc.get_invoice(cust, before["id"])
    print("AFTER same id", out["id"]==before["id"], out["invoice_number"]==before["invoice_number"], "total", out["total_amount"], "bd.total", out["breakdown"]["total"], "gst grand", (out.get("gst_invoice") or {}).get("grand_total"))
    print([l["desc"] for l in out["line_items"]])
    g=out.get("gst_invoice") or {}
    if g: print("p1+p2", g["platform"]["subtotal"]+g["partner"]["subtotal"])
    again = await inv_svc.get_invoice(cust, before["id"]); print("idempotent", again["total_amount"])
    bk = await bc.get_booking(cust, b["id"]); bd=bk["breakdown"]
    print("BOOKING bd total", bd["total"], "balance_due", bd.get("balance_due"), [i["name"] for i in bd["service_items"]])
    await db.bookings.update_one({"id":b["id"]},{"$set":{"additional.status":"pending_payment"}})
    bk = await bc.get_booking(cust, b["id"]); print("PENDING balance_due", bk["breakdown"].get("balance_due"))
    from services.invoice_html_service import build_invoice_html
asyncio.run(m())
