"""Role-based invoice endpoints. Authorization enforced at the API layer —
customers see only their own invoices, merchants/partners only their related
documents, admins see everything."""
from fastapi import APIRouter, Depends, HTTPException, Query, Body, Request
from fastapi.responses import Response, HTMLResponse
from html import escape as _esc
from datetime import datetime
import io, csv, zipfile, hmac, hashlib
from middleware.auth import get_current_user, require_role, SECRET
from config.database import get_settings, now_iso
import services.invoice_service as inv_svc

router = APIRouter(prefix="/invoices", tags=["invoices"])

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _share_sig(invoice_id: str) -> str:
    """Unguessable HMAC signature that authorises the public invoice link."""
    return hmac.new(SECRET.encode(), f"invoice-share:{invoice_id}".encode(), hashlib.sha256).hexdigest()[:32]


@router.get("")
async def list_invoices(
    user: dict = Depends(get_current_user),
    page: int = 1,
    page_size: int = 15,
    invoice_type: str = "all",
    status: str = "all",
    payment_status: str = "all",
    range: str = "all",
    date_from: str = None,
    date_to: str = None,
    min_amount: str = None,
    max_amount: str = None,
    booking_id: str = None,
    transaction_id: str = None,
    customer_id: str = None,
    merchant_id: str = None,
    partner_id: str = None,
    search: str = None,
    customer: str = None,
    sort: str = "newest",
):
    params = {
        "page": page, "page_size": page_size, "invoice_type": invoice_type,
        "status": status, "payment_status": payment_status, "range": range,
        "date_from": date_from, "date_to": date_to, "min_amount": min_amount,
        "max_amount": max_amount, "booking_id": booking_id, "transaction_id": transaction_id,
        "customer_id": customer_id, "merchant_id": merchant_id, "partner_id": partner_id,
        "search": search, "customer": customer, "sort": sort,
    }
    return await inv_svc.list_invoices(user, params)


@router.post("/sync")
async def sync_invoices(admin: dict = Depends(require_role("admin"))):
    await inv_svc.sync_invoices()
    return {"ok": True, "synced_at": now_iso()}


@router.get("/preview/sample")
async def preview_sample(admin: dict = Depends(require_role("admin"))):
    """Build a fully-rendered SAMPLE invoice from the current business config
    (no DB write) so admins can preview branding/config changes live."""
    settings = await get_settings()
    biz = inv_svc.business_snapshot(settings)
    tax_pct = float(settings.get("gst_pct") or 18)
    subtotal = 1499.0
    discount = 150.0
    taxable = subtotal - discount
    tax = round(taxable * tax_pct / 100, 2)
    total = round(taxable + tax, 2)
    return {
        "id": "sample",
        "invoice_number": f"{(settings.get('invoice_config') or {}).get('prefix', 'INV')}-{2026}-{str((settings.get('invoice_config') or {}).get('start_number', 1)).zfill(int((settings.get('invoice_config') or {}).get('pad', 6)))}",
        "invoice_type": "booking",
        "booking_code": "AZO-SAMPLE",
        "booking_date": now_iso(),
        "booking_status": "completed",
        "transaction_id": "TXN-SAMPLE-0001",
        "status": "issued",
        "payment_status": "paid",
        "payment_method": "Online (UPI)",
        "currency": biz["currency"],
        "line_items": [
            {"desc": "AC Deep Clean (Split)", "detail": "AC Repair & Service", "qty": 1, "amount": 999.0},
            {"desc": "Gas Refill Add-on", "detail": "Add-on", "qty": 1, "amount": 500.0},
        ],
        "subtotal": subtotal, "discount": discount, "tax": tax,
        "tax_label": biz["tax_label"], "fees": 0, "commission": 0, "refund": 0,
        "total_amount": total,
        "service_name": "AC Deep Clean (Split)",
        "customer_snapshot": {"name": "Priya Verma", "email": "priya@example.com",
                              "phone": "+91 90000 00004", "address": "12 Kankarbagh Main Road, Patna, Bihar 800020"},
        "merchant_snapshot": {"name": "Sharma Electricals", "business": "Sharma Electricals",
                              "email": "sharma@example.com", "phone": "+91 90000 00002"},
        "partner_snapshot": {"name": "Raj Kumar", "email": "", "phone": "+91 90000 00003"},
        "business_snapshot": biz,
        "notes": "Thank you for your business.",
        "issue_date": now_iso(),
    }


@router.get("/report/gst")
async def gst_report_csv(year: int = None, admin: dict = Depends(require_role("admin"))):
    y = year or datetime.utcnow().year
    rep = await inv_svc.gst_report(admin, y)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([f"GST / Tax Summary Report — {y}"])
    w.writerow(["Month", "Invoices", "Subtotal", "Discount", "Tax/GST", "Total"])
    for r in rep["rows"]:
        w.writerow([_MONTHS[r["month"] - 1], r["invoices"], r["subtotal"], r["discount"], r["tax"], r["total"]])
    t = rep["totals"]
    w.writerow(["TOTAL", t["invoices"], t["subtotal"], t["discount"], t["tax"], t["total"]])
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f"attachment; filename=GST-Report-{y}.csv"})


@router.get("/bulk/zip")
async def bulk_zip(
    admin: dict = Depends(require_role("admin")),
    invoice_type: str = "all", status: str = "all", payment_status: str = "all",
    range: str = "all", date_from: str = None, date_to: str = None,
    min_amount: str = None, max_amount: str = None, search: str = None,
):
    from services.invoice_pdf_service import build_invoice_pdf
    params = {"invoice_type": invoice_type, "status": status, "payment_status": payment_status,
              "range": range, "date_from": date_from, "date_to": date_to,
              "min_amount": min_amount, "max_amount": max_amount, "search": search}
    invs = await inv_svc.query_all(admin, params)
    mem = io.BytesIO()
    with zipfile.ZipFile(mem, "w", zipfile.ZIP_DEFLATED) as zf:
        for inv in invs:
            try:
                zf.writestr(f"{inv.get('invoice_number', 'invoice')}.pdf", build_invoice_pdf(inv))
            except Exception:
                pass
    mem.seek(0)
    return Response(content=mem.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": "attachment; filename=invoices.zip"})


@router.post("/{invoice_id}/email")
async def email_invoice_ep(invoice_id: str, body: dict = Body(default=None), user: dict = Depends(get_current_user)):
    inv = await inv_svc.get_invoice(user, invoice_id)
    if inv is None:
        raise HTTPException(404, "Invoice not found")
    if inv == "forbidden":
        raise HTTPException(403, "Not allowed")
    to = ((body or {}).get("to") or "").strip() or None
    if to and "@" not in to:
        raise HTTPException(400, "Please enter a valid email address.")
    r = await inv_svc.email_invoice(inv, to_email=to)
    if not r.get("ok"):
        if r.get("skipped") == "email_not_configured":
            raise HTTPException(400, "Email abhi configured nahi hai — Admin → Integrations me SendGrid/SMTP add karein.")
        if r.get("skipped") == "no_email":
            raise HTTPException(400, "Koi email address nahi mila — apna email daal kar bhejein.")
        raise HTTPException(400, r.get("error") or "Email bhejne me dikkat aayi.")
    return {"ok": True, "sent_to": to or (inv.get("customer_snapshot") or {}).get("email")}


@router.get("/{invoice_id}/share-link")
async def invoice_share_link(invoice_id: str, user: dict = Depends(get_current_user)):
    """Return a signed token for a PUBLIC, no-login invoice link. The caller (owner)
    builds the full URL as {API_BASE}/invoices/pub/{id}?s={sig}."""
    inv = await inv_svc.get_invoice(user, invoice_id)
    if inv is None:
        raise HTTPException(404, "Invoice not found")
    if inv == "forbidden":
        raise HTTPException(403, "Not allowed")
    sig = _share_sig(invoice_id)
    return {"id": invoice_id, "sig": sig, "path": f"/invoices/pub/{invoice_id}?s={sig}"}


@router.get("/pub/{invoice_id}")
async def invoice_public_pdf(invoice_id: str, s: str = Query(default=""), download: int = 0):
    """PUBLIC invoice PDF — no auth, gated by the HMAC signature `s`. Anyone with the
    link can open/download the invoice. Served inline so browsers render + allow save."""
    if not s or not hmac.compare_digest(s, _share_sig(invoice_id)):
        raise HTTPException(404, "Invoice not found")
    inv = await inv_svc.get_invoice_public(invoice_id)
    if inv is None:
        raise HTTPException(404, "Invoice not found")
    from services.invoice_pdf_service import build_invoice_pdf
    pdf = build_invoice_pdf(inv)
    disp = "attachment" if download else "inline"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'{disp}; filename="{inv.get("invoice_number", "invoice")}.pdf"'})


_CUR_SYM = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£", "AED": "AED "}


@router.get("/pub/{invoice_id}/page", response_class=HTMLResponse)
async def invoice_public_page(invoice_id: str, request: Request, s: str = Query(default="")):
    """PUBLIC, no-login landing page for a shared invoice link. Anyone who opens the
    link sees the invoice summary, an inline preview, and a prominent Download button
    (the PDF also auto-downloads). Gated by the same unguessable HMAC signature."""
    if not s or not hmac.compare_digest(s, _share_sig(invoice_id)):
        raise HTTPException(404, "Invoice not found")
    inv = await inv_svc.get_invoice_public(invoice_id)
    if inv is None:
        raise HTTPException(404, "Invoice not found")
    # Relative links resolve against .../pub/{id}/page → .../pub/{id}
    pdf_inline = f"../{invoice_id}?s={s}"
    pdf_download = f"../{invoice_id}?s={s}&download=1"
    biz = inv.get("business_snapshot") or {}
    biz_name = _esc(str(biz.get("name") or biz.get("business") or "AzoApp"))
    number = _esc(str(inv.get("invoice_number") or "Invoice"))
    cur = str(inv.get("currency") or "INR")
    sym = _CUR_SYM.get(cur, cur + " ")
    try:
        total = f"{sym}{float(inv.get('total_amount') or 0):,.2f}"
    except Exception:
        total = f"{sym}{inv.get('total_amount') or 0}"
    pstatus = _esc(str(inv.get("payment_status") or "").replace("_", " ").title())
    html = f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
<title>{number} · {biz_name}</title>
<style>
  :root {{ --brand:#0D47A1; --ink:#0F172A; --muted:#64748B; --line:#E2E8F0; --bg:#F1F5F9; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:var(--ink); }}
  .wrap {{ max-width:820px; margin:0 auto; padding:16px; }}
  .card {{ background:#fff; border:1px solid var(--line); border-radius:16px; overflow:hidden; box-shadow:0 8px 30px rgba(2,32,71,.08); }}
  .head {{ padding:20px; display:flex; align-items:center; justify-content:space-between; gap:12px; border-bottom:1px solid var(--line); flex-wrap:wrap; }}
  .biz {{ font-size:12px; letter-spacing:1px; text-transform:uppercase; color:var(--muted); font-weight:800; }}
  .num {{ font-size:20px; font-weight:800; margin-top:2px; }}
  .amt {{ text-align:right; }}
  .amt .lbl {{ font-size:11px; letter-spacing:.8px; text-transform:uppercase; color:var(--muted); font-weight:800; }}
  .amt .val {{ font-size:26px; font-weight:800; }}
  .badge {{ display:inline-block; margin-top:4px; font-size:12px; font-weight:700; color:var(--brand); background:rgba(13,71,161,.08); padding:2px 10px; border-radius:999px; }}
  .actions {{ padding:16px 20px; display:flex; gap:10px; flex-wrap:wrap; }}
  .btn {{ flex:1; min-width:160px; text-align:center; text-decoration:none; font-weight:700; font-size:15px; padding:14px 18px; border-radius:12px; border:1px solid var(--line); color:var(--ink); background:#fff; }}
  .btn.primary {{ background:var(--brand); color:#fff; border-color:var(--brand); }}
  .preview {{ border-top:1px solid var(--line); background:#fff; }}
  .preview iframe {{ width:100%; height:78vh; border:0; display:block; }}
  .foot {{ text-align:center; color:var(--muted); font-size:12px; padding:16px; }}
</style>
</head><body>
  <div class="wrap">
    <div class="card">
      <div class="head">
        <div>
          <div class="biz">{biz_name}</div>
          <div class="num">{number}</div>
          {f'<span class="badge">{pstatus}</span>' if pstatus else ''}
        </div>
        <div class="amt">
          <div class="lbl">Invoice Total</div>
          <div class="val">{total}</div>
        </div>
      </div>
      <div class="actions">
        <a class="btn primary" id="dl" href="{pdf_download}">⬇ Download PDF</a>
        <a class="btn" href="{pdf_inline}" target="_blank" rel="noopener">Open / Print</a>
      </div>
      <div class="preview">
        <iframe title="invoice" src="{pdf_inline}"></iframe>
      </div>
    </div>
    <div class="foot">This is a computer-generated invoice · {number}</div>
  </div>
  <iframe id="auto" style="display:none" src="{pdf_download}"></iframe>
</body></html>"""
    return HTMLResponse(content=html)


@router.post("/render/pdf")
async def render_pdf(payload: dict, admin: dict = Depends(require_role("admin"))):
    from services.invoice_pdf_service import build_invoice_pdf
    payload = await inv_svc.fill_live_branding(payload or {}, force_theme=False)
    pdf = build_invoice_pdf(payload)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="sample-invoice.pdf"'})


@router.post("/render/html")
async def render_html(payload: dict, admin: dict = Depends(require_role("admin"))):
    """Render a SAMPLE invoice payload to the unified HTML (same template the PDF
    uses) so the admin Business/Theme config screen can preview branding + theme
    changes live before saving."""
    from services.invoice_html_service import build_invoice_html
    payload = await inv_svc.fill_live_branding(payload or {}, force_theme=False)
    return HTMLResponse(content=build_invoice_html(payload))


@router.get("/{invoice_id}/pdf")
async def invoice_pdf(invoice_id: str, user: dict = Depends(get_current_user)):
    inv = await inv_svc.get_invoice(user, invoice_id)
    if inv is None:
        raise HTTPException(404, "Invoice not found")
    if inv == "forbidden":
        raise HTTPException(403, "Not allowed")
    from services.invoice_pdf_service import build_invoice_pdf
    pdf = build_invoice_pdf(inv)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{inv.get("invoice_number", "invoice")}.pdf"'})


@router.get("/{invoice_id}/view")
async def invoice_view(invoice_id: str, user: dict = Depends(get_current_user)):
    """Return the unified invoice HTML (same template the PDF is rendered from).
    The frontend loads this into an A4 iframe for preview + print, guaranteeing
    preview == print == downloaded PDF."""
    inv = await inv_svc.get_invoice(user, invoice_id)
    if inv is None:
        raise HTTPException(404, "Invoice not found")
    if inv == "forbidden":
        raise HTTPException(403, "Not allowed")
    from services.invoice_html_service import build_invoice_html
    return HTMLResponse(content=build_invoice_html(inv))


@router.get("/{invoice_id}")
async def get_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    res = await inv_svc.get_invoice(user, invoice_id)
    if res is None:
        raise HTTPException(404, "Invoice not found")
    if res == "forbidden":
        raise HTTPException(403, "You are not allowed to view this invoice")
    return res
