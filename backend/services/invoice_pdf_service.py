"""Server-side premium invoice PDF (reportlab). Produces a clean, professional
A4 document — used for email attachments and bulk ZIP downloads. Mirrors the
on-screen InvoiceDocument layout."""
import io
import base64
from services.money import TAX_LABEL
import os
import urllib.request
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable, Image as RLImage,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

NAVY = colors.HexColor("#0D47A1")
SLATE = colors.HexColor("#334155")
MUTED = colors.HexColor("#64748b")
LIGHT = colors.HexColor("#eef2f7")

# Register a font that includes the Indian Rupee glyph (U+20B9) so PDFs can
# print the ₹ symbol. If no font on the system actually contains the glyph we
# fall back to "Rs." (better than a tofu box).
_MONEY_FONT = "Helvetica"
_MONEY_BOLD = "Helvetica-Bold"
_RS = "Rs. "


def _has_glyph(font_name, codepoint=0x20B9):
    try:
        face = pdfmetrics.getFont(font_name).face
        c2g = getattr(face, "charToGlyph", None) or {}
        return bool(c2g.get(codepoint))
    except Exception:
        return False


def _init_money_font():
    global _MONEY_FONT, _MONEY_BOLD, _RS
    _bundled = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "fonts")
    candidates = [
        # Bundled font shipped with the repo (deployment-safe, always present)
        ("RupeeF", "RupeeF-Bold",
         os.path.join(_bundled, "DejaVuSans.ttf"),
         os.path.join(_bundled, "DejaVuSans-Bold.ttf")),
        ("RupeeF", "RupeeF-Bold",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ("RupeeF", "RupeeF-Bold",
         "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
         "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"),
        ("RupeeF", "RupeeF-Bold",
         "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
         "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
    ]
    for reg, bold, rp, bp in candidates:
        try:
            if not os.path.exists(rp):
                continue
            pdfmetrics.registerFont(TTFont(reg, rp))
            if not _has_glyph(reg):
                continue  # font lacks ₹ → try next
            _MONEY_FONT = reg
            _RS = "\u20b9"
            if os.path.exists(bp):
                pdfmetrics.registerFont(TTFont(bold, bp))
                _MONEY_BOLD = bold
            else:
                _MONEY_BOLD = reg
            return
        except Exception:
            continue


_init_money_font()

TYPE_LABEL = {
    "booking": "TAX INVOICE", "cancellation": "CANCELLATION NOTE",
    "transaction": "TRANSACTION STATEMENT", "withdrawal": "WITHDRAWAL STATEMENT",
}


def _rs(n):
    try:
        return _RS + "{:,.2f}".format(float(n or 0))
    except Exception:
        return _RS + "0.00"


def _d(iso):
    return str(iso or "")[:10] or "-"


def _logo_bytes(url):
    """Resolve a logo (data-URI, local /media/file path, or absolute URL) to bytes."""
    if not url:
        return None
    try:
        if url.startswith("data:"):
            return base64.b64decode(url.split(",", 1)[1])
        if "/media/file/" in url:
            from pathlib import Path
            name = url.split("/media/file/", 1)[1].split("?")[0]
            fp = Path(__file__).parent.parent / "uploads" / name
            if fp.exists():
                return fp.read_bytes()
            return None
        if url.startswith("http://") or url.startswith("https://"):
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            return urllib.request.urlopen(req, timeout=6).read()  # noqa: S310
    except Exception:
        return None
    return None


def _logo_flowable(url):
    """Return a reportlab Image for the business logo, else None. Any input format
    (webp/png/jpg) is normalised to PNG via PIL for reliable rendering."""
    data = _logo_bytes(url)
    if not data:
        return None
    try:
        from PIL import Image as PILImage
        pim = PILImage.open(io.BytesIO(data))
        pim = pim.convert("RGBA") if pim.mode in ("P", "RGBA", "LA") else pim.convert("RGB")
        png = io.BytesIO()
        pim.save(png, format="PNG")
        png.seek(0)
        img = RLImage(png)
        target_h = 15 * mm
        w = img.imageWidth * (target_h / img.imageHeight)
        max_w = 60 * mm
        if w > max_w:
            target_h = img.imageHeight * (max_w / img.imageWidth)
            w = max_w
        img.drawWidth = w
        img.drawHeight = target_h
        img.hAlign = "LEFT"
        return img
    except Exception:
        return None


def _pill_color(s):
    k = (s or "").lower()
    if k in ("paid", "completed", "settled", "credited", "issued"):
        return colors.HexColor("#059669"), colors.HexColor("#ecfdf5")
    if k in ("cancelled", "refunded", "rejected", "failed"):
        return colors.HexColor("#dc2626"), colors.HexColor("#fef2f2")
    return colors.HexColor("#b45309"), colors.HexColor("#fffbeb")


def build_invoice_pdf(inv: dict) -> bytes:
    """Unified invoice PDF. Renders the SAME HTML template used by the on-screen
    preview + print (services.invoice_html_service) via WeasyPrint, so the
    browser preview, print output and downloaded/emailed PDF are visually
    identical. Falls back to the legacy reportlab builder only if WeasyPrint is
    unavailable, so existing callers (email, bulk ZIP, scheduled reports) never
    break."""
    try:
        from services.invoice_html_service import render_invoice_pdf
        return render_invoice_pdf(inv)
    except Exception:  # noqa: BLE001
        return _build_invoice_pdf_reportlab(inv)


def _build_invoice_pdf_reportlab(inv: dict) -> bytes:
    biz = inv.get("business_snapshot") or {}
    # BILL TO party: partner→partner, merchant→merchant, else customer (see invoice_service._attach_bill_to)
    cust = inv.get("bill_to") or inv.get("customer_snapshot") or {}
    merch = inv.get("merchant_snapshot") or {}
    partner = inv.get("partner_snapshot") or {}
    cur = inv.get("currency") or "INR"

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
                            topMargin=20 * mm, bottomMargin=18 * mm, title=inv.get("invoice_number", "Invoice"))
    ss = getSampleStyleSheet()
    h_biz = ParagraphStyle("hbiz", parent=ss["Normal"], fontName="Helvetica-Bold", fontSize=17, textColor=SLATE, leading=20)
    small = ParagraphStyle("small", parent=ss["Normal"], fontSize=8, textColor=MUTED, leading=11)
    label = ParagraphStyle("label", parent=ss["Normal"], fontName="Helvetica-Bold", fontSize=6.5, textColor=colors.HexColor("#94a3b8"), leading=10, spaceAfter=3)
    name = ParagraphStyle("name", parent=ss["Normal"], fontName="Helvetica-Bold", fontSize=9.5, textColor=SLATE, leading=13)
    line = ParagraphStyle("line", parent=ss["Normal"], fontSize=8.5, textColor=MUTED, leading=12)
    title = ParagraphStyle("title", parent=ss["Normal"], fontName="Helvetica-Bold", fontSize=14, textColor=NAVY, alignment=2, leading=17)
    right = ParagraphStyle("right", parent=ss["Normal"], fontSize=9, textColor=MUTED, alignment=2, leading=13)
    rightnum = ParagraphStyle("rightnum", parent=ss["Normal"], fontName="Helvetica-Bold", fontSize=10.5, textColor=SLATE, alignment=2, leading=14)

    CONTENT_W = 180 * mm

    def pill(text, s):
        fg, bg = _pill_color(s)
        p = ParagraphStyle("pill", parent=ss["Normal"], fontName="Helvetica-Bold", fontSize=7.5, textColor=fg, alignment=1, leading=9)
        t = Table([[Paragraph((text or "").upper(), p)]], hAlign="RIGHT")
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), bg),
            ("ROUNDEDCORNERS", [5, 5, 5, 5]),
            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ]))
        return t

    def card(flowables):
        t = Table([[flowables]], colWidths=[(CONTENT_W - 10 * mm) / 3])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#e8edf3")),
            ("ROUNDEDCORNERS", [7, 7, 7, 7]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ]))
        return t

    def party(lbl, nm, lines):
        cells = [Paragraph(lbl, label), Paragraph(nm or "-", name)]
        for ln in lines:
            if ln:
                cells.append(Paragraph(str(ln), line))
        return cells

    elems = []
    biz_addr = ", ".join([x for x in [biz.get("address"), ", ".join([y for y in [biz.get("city"), biz.get("state"), biz.get("zip")] if y]), biz.get("country")] if x])

    # ---- Header (logo OR business name) | invoice title + number + pills ----
    _logo = _logo_flowable(biz.get("logo"))
    if _logo is not None:
        left_cell = [_logo]
    else:
        left_cell = [
            Paragraph(biz.get("name") or "AzoApp", h_biz),
            Paragraph(biz.get("legal_name") or "", small),
            Paragraph(biz_addr, small),
            Paragraph(" | ".join([x for x in [biz.get("phone"), biz.get("email")] if x]), small),
            Paragraph((("GSTIN: " + biz["gst"]) if biz.get("gst") else "") + (("  PAN: " + biz["pan"]) if biz.get("pan") else ""), small),
        ]
    pills = Table([[pill(inv.get("status"), inv.get("status")), pill(inv.get("payment_status"), inv.get("payment_status"))]], hAlign="RIGHT")
    pills.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (0, 0), 5),
                               ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    right_cell = [
        Paragraph(TYPE_LABEL.get(inv.get("invoice_type"), "INVOICE"), title),
        Spacer(1, 2),
        Paragraph(inv.get("invoice_number", ""), rightnum),
        Paragraph("Issued " + _d(inv.get("issue_date")), right),
        Spacer(1, 5),
        pills,
    ]
    header = Table([[left_cell, right_cell]], colWidths=[100 * mm, 80 * mm])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (0, 0), "MIDDLE"), ("VALIGN", (1, 0), (1, 0), "TOP")]))
    elems.append(header)
    elems.append(Spacer(1, 10))
    elems.append(HRFlowable(width="100%", thickness=2, color=NAVY, spaceAfter=2))
    elems.append(HRFlowable(width="100%", thickness=0.6, color=colors.HexColor("#c7d2e5")))
    elems.append(Spacer(1, 12))

    # ---- FROM / BILL TO / DETAILS cards ----
    details = [Paragraph("INVOICE DETAILS", label)]

    def kv(k, v):
        return Table([[Paragraph(k, line), Paragraph(str(v), name)]], colWidths=[24 * mm, 26 * mm])
    det_rows = [("Invoice Date", _d(inv.get("issue_date")))]
    if inv.get("booking_code"):
        det_rows.append(("Booking ID", inv.get("booking_code")))
    if inv.get("booking_date"):
        det_rows.append(("Booking Date", _d(inv.get("booking_date"))))
    if inv.get("transaction_id"):
        det_rows.append(("Txn ID", (inv.get("transaction_id") or "")[:16]))
    det_rows.append(("Payment", inv.get("payment_method") or "-"))
    det_rows.append(("Currency", cur))
    det_inner = Table([[Paragraph(k, line), Paragraph(str(v), name)] for k, v in det_rows], colWidths=[22 * mm, 28 * mm])
    det_inner.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
                                   ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    details.append(det_inner)

    from_cell = party("FROM", biz.get("name"), [biz_addr, biz.get("phone"), biz.get("email"),
                      ("GSTIN: " + biz["gst"]) if biz.get("gst") else "", ("PAN: " + biz["pan"]) if biz.get("pan") else ""])
    bill_cell = party("BILL TO", cust.get("name"), [cust.get("address"), cust.get("phone"), cust.get("email")])

    gap = 5 * mm
    info = Table([[card(from_cell), "", card(bill_cell), "", card(details)]],
                 colWidths=[(CONTENT_W - 2 * gap) / 3, gap, (CONTENT_W - 2 * gap) / 3, gap, (CONTENT_W - 2 * gap) / 3])
    info.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                              ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    elems.append(info)
    elems.append(Spacer(1, 10))

    # ---- Provider band removed: merchant/partner + service professional details
    # are intentionally NOT shown on invoices (per business requirement) ----

    # ---- Line items (zebra) ----
    items = inv.get("line_items") or []
    dstyle = ParagraphStyle("d", parent=ss["Normal"], fontSize=9.5, leading=13, textColor=SLATE)
    body = [[Paragraph("<b>DESCRIPTION</b>", ParagraphStyle("th", parent=ss["Normal"], fontName="Helvetica-Bold", fontSize=8.5, textColor=colors.white)),
             Paragraph("<b>QTY</b>", ParagraphStyle("thc", parent=ss["Normal"], fontName="Helvetica-Bold", fontSize=8.5, textColor=colors.white, alignment=1)),
             Paragraph("<b>AMOUNT</b>", ParagraphStyle("thr", parent=ss["Normal"], fontName="Helvetica-Bold", fontSize=8.5, textColor=colors.white, alignment=2))]]
    addon_style = ParagraphStyle("da", parent=dstyle, leftIndent=14, fontSize=9,
                                 textColor=colors.HexColor("#64748b"))
    for it in items:
        desc = it.get("desc") or ""
        is_addon = str(desc).startswith("+ ") or (it.get("detail") == "Add-on")
        if is_addon:
            nm = desc[2:] if str(desc).startswith("+ ") else desc
            para = Paragraph(f"&#8627; <i>{nm}</i> <font size=7 color='#94a3b8'>(add-on)</font>", addon_style)
            body.append([para, "", _rs(it.get("amount"))])
        else:
            d2 = f"<b>{desc}</b>"
            if it.get("detail"):
                d2 = f"<b>{desc}</b><br/><font size=7.5 color='#94a3b8'>{it.get('detail')}</font>"
            body.append([Paragraph(d2, dstyle), str(it.get("qty", 1)), _rs(it.get("amount"))])
    tbl = Table(body, colWidths=[120 * mm, 20 * mm, 40 * mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROUNDEDCORNERS", [6, 6, 0, 0]),
        ("ALIGN", (1, 0), (1, -1), "CENTER"),
        ("ALIGN", (2, 0), (2, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTSIZE", (0, 1), (-1, -1), 9.5),
        ("TEXTCOLOR", (1, 1), (-1, -1), SLATE),
        ("FONTNAME", (2, 1), (2, -1), _MONEY_FONT),
        ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (0, -1), 12), ("RIGHTPADDING", (2, 0), (2, -1), 12),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, colors.HexColor("#eef2f7")),
        ("BOX", (0, 1), (-1, -1), 0.4, colors.HexColor("#eef2f7")),
    ]))
    elems.append(tbl)
    elems.append(Spacer(1, 12))

    # ---- Notes (left) + Totals (right) ----
    _re = inv.get("role_earning")
    partner_cancel = bool(_re and _re.get("role") == "partner" and _re.get("is_cancellation"))
    if partner_cancel:
        # Custom two-part layout (Payment Summary + Your Earning) built further below.
        rows = []
        total_label = ""
        total_value = None
    elif _re:
        # Partner/Merchant earning statement — show THEIR commission + net, not the
        # customer gross / platform fee. Order: cost lines first, tax last, then net.
        _re_cancel = bool(_re.get("is_cancellation"))
        rows = [(_re.get("service_label") or "Service Cost",
                 _rs(_re.get("service_cost") if _re.get("service_cost") is not None else _re.get("base")))]
        if _re.get("role") == "partner" and _re.get("visiting_charge"):
            rows.append(("Visiting Charge", "+ " + _rs(_re.get("visiting_charge"))))
        if _re.get("commission") is not None and not (_re_cancel and _re.get("role") == "partner"):
            _clabel = f'{_re.get("commission_label")} ({_re.get("rate"):g}%)' if isinstance(_re.get("rate"), (int, float)) else _re.get("commission_label")
            rows.append((_clabel, _rs(_re.get("commission"))))
        if _re.get("platform") is not None:
            rows.append((_re.get("platform_label") or "Platform Share", _rs(_re.get("platform"))))
        if inv.get("tax") and not _re_cancel:
            rows.append((TAX_LABEL, _rs(inv.get("tax"))))
        total_label = _re.get("net_label") or "NET"
        total_value = _re.get("net")
    else:
        # Prefer the canonical breakdown (single source of truth) for booking &
        # cancellation invoices so Service Amount is PURE and every charge is a
        # separate line — no fold, no double count.
        _bd = inv.get("breakdown") if inv.get("invoice_type") in ("booking", "cancellation") else None
        if _bd:
            rows = [("Service Amount", _rs(_bd.get("services_subtotal") or 0))]
            for _c in (_bd.get("additional_charges") or []):
                rows.append((_c.get("label") or "Charge", _rs(_c.get("amount"))))
            if _bd.get("discount"):
                rows.append(("Coupon Discount", "- " + _rs(_bd.get("discount"))))
            if _bd.get("tax"):
                rows.append(("Taxable Amount", _rs(_bd.get("taxable"))))
                rows.append((TAX_LABEL, _rs(_bd.get("tax"))))
            if inv.get("invoice_type") == "cancellation":
                _ref = round(abs(float(inv.get("refund") or 0)), 2)
                _gross = float(_bd.get("total") or inv.get("original_amount") or 0)
                rows.append(("Gross Total", _rs(_gross)))
                _rpct = inv.get("cancellation_pct")
                rows.append((f"Customer Refund ({float(_rpct):g}%)" if _rpct is not None else "Customer Refund",
                             "- " + _rs(_ref)))
                rows.append(("Amount Retained", _rs(round(_gross - _ref, 2))))
                total_label = "TOTAL CUSTOMER REFUND"
                total_value = _ref
            else:
                total_label = "TOTAL"
                total_value = _bd.get("total")
        else:
            rows = [("Subtotal", _rs(inv.get("subtotal")))]
            if inv.get("discount"):
                rows.append(("Discount", "- " + _rs(inv.get("discount"))))
            if inv.get("tax"):
                # Taxable Amount (audit spec #3): GST base excluding the untaxed visiting charge.
                _tx = inv.get("taxable")
                if _tx is None:
                    _tx = round(float(inv.get("subtotal") or 0) + max(0.0, round(float(inv.get("fees") or 0) - float(inv.get("visiting_charge") or 0), 2)), 2)
                rows.append(("Taxable Amount", _rs(_tx)))
                rows.append((TAX_LABEL, _rs(inv.get("tax"))))
            if inv.get("fees"):
                _vc = float(inv.get("visiting_charge") or 0)
                _other = round(float(inv.get("fees") or 0) - _vc, 2)
                if _vc > 0:
                    rows.append(("Visiting Charge", _rs(_vc)))
                if _other > 0.001:
                    rows.append(("Platform / Service Fees", _rs(_other)))
            if inv.get("commission"):
                rows.append(("Platform Fee", _rs(inv.get("commission"))))
            # Cancellation / refund breakdown (audit spec #3)
            if inv.get("invoice_type") == "cancellation":
                if inv.get("original_amount"):
                    rows.append(("Original Booking Amount", _rs(inv.get("original_amount"))))
                if inv.get("cancellation_pct") is not None:
                    rows.append((f"Customer Refund ({float(inv.get('cancellation_pct')):g}%)", ""))
                if inv.get("service_refund"):
                    rows.append(("Refundable Service Amount", _rs(inv.get("service_refund"))))
                if inv.get("gst_refund"):
                    rows.append((f"Refundable {TAX_LABEL}", _rs(inv.get("gst_refund"))))
            if inv.get("refund"):
                rows.append(("Total Customer Refund" if inv.get("invoice_type") == "cancellation" else "Refund", "- " + _rs(inv.get("refund"))))
            if inv.get("invoice_type") == "cancellation":
                total_label = "TOTAL CUSTOMER REFUND"
                total_value = abs(float(inv.get("refund") or 0))
            else:
                total_label = "NET PAYABLE" if inv.get("invoice_type") == "withdrawal" else "TOTAL"
                total_value = inv.get("total_amount")

    lsty = ParagraphStyle("ls", parent=ss["Normal"], fontSize=9, textColor=MUTED, leading=13)
    rsty = ParagraphStyle("rs", parent=ss["Normal"], fontName=_MONEY_FONT, fontSize=9, textColor=SLATE, leading=13, alignment=2)
    tl_style = ParagraphStyle("tl", parent=ss["Normal"], fontName=_MONEY_BOLD, fontSize=11, textColor=colors.white)
    tv_style = ParagraphStyle("tv", parent=ss["Normal"], fontName=_MONEY_BOLD, fontSize=13, textColor=colors.white, alignment=2)
    if partner_cancel:
        # ---- Partner cancellation: Payment Summary + Your Earning (green net) ----
        GREEN = colors.HexColor("#059669")
        GRAYBG = colors.HexColor("#f1f5f9")
        cap = ParagraphStyle("cap", parent=ss["Normal"], fontName=_MONEY_BOLD, fontSize=8,
                              textColor=NAVY, leading=12, spaceBefore=7, spaceAfter=3)
        blsty = ParagraphStyle("bls", parent=ss["Normal"], fontName=_MONEY_BOLD, fontSize=9.5,
                               textColor=SLATE, leading=13)
        bvsty = ParagraphStyle("bvs", parent=ss["Normal"], fontName=_MONEY_BOLD, fontSize=10.5,
                               textColor=SLATE, leading=13, alignment=2)
        nlsty = ParagraphStyle("nls", parent=ss["Normal"], fontName=_MONEY_BOLD, fontSize=10,
                               textColor=colors.white, leading=14)
        nvsty = ParagraphStyle("nvs", parent=ss["Normal"], fontName=_MONEY_BOLD, fontSize=13,
                               textColor=colors.white, leading=15, alignment=2)

        def _mini(rows_):
            body = [[Paragraph(k, lsty),
                     Paragraph(v if isinstance(v, str) else _rs(v), rsty)] for k, v in rows_]
            t = Table(body, colWidths=[44 * mm, 36 * mm])
            t.setStyle(TableStyle([
                ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("LINEBELOW", (0, 0), (-1, -1), 0.4, LIGHT),
            ]))
            return t

        def _box(lbl, val, bg, ls, vs):
            b = Table([[Paragraph(lbl, ls), Paragraph(_rs(val), vs)]], colWidths=[44 * mm, 36 * mm])
            b.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), bg), ("ROUNDEDCORNERS", [6, 6, 6, 6]),
                ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]))
            return b

        _bt = float(inv.get("original_amount") if inv.get("original_amount") is not None else inv.get("total_amount") or 0)
        _rf = round(abs(float(inv.get("refund") or 0)), 2)
        _rt = round(_bt - _rf, 2)
        _rate = _re.get("rate")
        _rate_txt = f"{float(_rate):g}%" if isinstance(_rate, (int, float)) else "—"
        _plat_txt = f"{100 - float(_rate):g}%" if isinstance(_rate, (int, float)) else "—"
        _pay_bd = inv.get("breakdown") or {}
        if _pay_bd.get("services_subtotal") is not None:
            _pay = [("Service Amount", _pay_bd.get("services_subtotal") or 0)]
            for _pc in (_pay_bd.get("additional_charges") or []):
                _pay.append((_pc.get("label") or "Charge", _pc.get("amount")))
            if inv.get("tax"):
                _pay.append((TAX_LABEL, inv.get("tax")))
        else:
            _pay = [("Service Amount", inv.get("subtotal") or 0)]
            if float(inv.get("visiting_charge") or 0) > 0:
                _pay.append(("Visiting Charge", inv.get("visiting_charge")))
            if inv.get("tax"):
                _pay.append((TAX_LABEL, inv.get("tax")))
        _settle = [("Paid Amount", _bt), ("Customer Refund", _rf)]
        _earn = [("Eligible Earning Amount", _re.get("base") or 0), ("Your Share Rate", _rate_txt)]
        _brk = [("Partner Share", _rate_txt), ("Partner Earning", _re.get("net") or 0),
                ("Platform Share", _plat_txt)]
        if _re.get("platform") is not None:
            _brk.append(("AzoApp Platform Earning", _re.get("platform")))
        inner = [
            Paragraph("PAYMENT SUMMARY", cap), _mini(_pay), Spacer(1, 4),
            _box("Total Booking Amount", _bt, GRAYBG, blsty, bvsty), Spacer(1, 5),
            _mini(_settle), Spacer(1, 4),
            _box("Amount Retained", _rt, GRAYBG, blsty, bvsty), Spacer(1, 6),
            Paragraph("YOUR EARNING", cap), _mini(_earn),
            Paragraph("EARNING BREAKDOWN", cap), _mini(_brk), Spacer(1, 5),
            _box("Net Earning", _re.get("net") or 0, GREEN, nlsty, nvsty),
        ]
        tot = Table([[inner]], colWidths=[80 * mm])
        tot.setStyle(TableStyle([
            ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
    else:
        tot_body = [[Paragraph(k, lsty), Paragraph(v, rsty)] for k, v in rows]
        tot_body.append([Paragraph(total_label, tl_style), Paragraph(_rs(total_value), tv_style)])
        tot = Table(tot_body, colWidths=[44 * mm, 36 * mm])
        tot.setStyle(TableStyle([
            ("TOPPADDING", (0, 0), (-1, -2), 4), ("BOTTOMPADDING", (0, 0), (-1, -2), 4),
            ("LINEBELOW", (0, 0), (-1, -2), 0.4, colors.HexColor("#eef2f7")),
            ("BACKGROUND", (0, -1), (-1, -1), NAVY),
            ("ROUNDEDCORNERS", [6, 6, 6, 6]),
            ("TOPPADDING", (0, -1), (-1, -1), 10), ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
            ("LEFTPADDING", (0, -1), (-1, -1), 10), ("RIGHTPADDING", (0, -1), (-1, -1), 10),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))

    note_flow = [Paragraph("PAYMENT / NOTES", label)]
    if inv.get("notes"):
        note_flow.append(Paragraph(inv.get("notes"), line))
    note_flow.append(Paragraph(f"Payment method: <b>{inv.get('payment_method') or '-'}</b>", line))
    if inv.get("transaction_id"):
        note_flow.append(Paragraph(f"Reference: {inv.get('transaction_id')[:24]}", line))
    note_card = Table([[note_flow]], colWidths=[92 * mm])
    note_card.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#e8edf3")),
        ("ROUNDEDCORNERS", [7, 7, 7, 7]), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    bottom = Table([[note_card, "", tot]], colWidths=[92 * mm, 8 * mm, 80 * mm])
    bottom.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                                ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    elems.append(bottom)
    elems.append(Spacer(1, 18))

    # ---- Footer ----
    if biz.get("terms"):
        elems.append(Paragraph("<b>Terms &amp; Conditions:</b> " + biz.get("terms"), small))
    if biz.get("refund_policy"):
        elems.append(Paragraph("<b>Refund Policy:</b> " + biz.get("refund_policy"), small))

    def _chrome(canvas, _doc):
        canvas.saveState()
        # top accent band
        canvas.setFillColor(NAVY)
        canvas.rect(0, A4[1] - 6 * mm, A4[0], 6 * mm, stroke=0, fill=1)
        # footer line + text
        canvas.setStrokeColor(colors.HexColor("#e8edf3"))
        canvas.setLineWidth(0.6)
        canvas.line(15 * mm, 14 * mm, A4[0] - 15 * mm, 14 * mm)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        foot = biz.get("footer") or "Thank you for your business."
        canvas.drawString(15 * mm, 9.5 * mm, foot[:70])
        contact = " ".join([x for x in [biz.get("support"), biz.get("website")] if x])
        canvas.drawRightString(A4[0] - 15 * mm, 9.5 * mm, (contact + "  •  " + (biz.get("name") or "AzoApp"))[:70])
        canvas.restoreState()

    doc.build(elems, onFirstPage=_chrome, onLaterPages=_chrome)
    return buf.getvalue()
