"""Server-side premium Booking Detail PDF (reportlab).

Produces a clean A4 document with the full booking info, accepted partner,
merchant involvement and the commission split — for admin downloads.
Reuses the shared styling + rupee-font helpers from invoice_pdf_service.
"""
import io
from services.money import TAX_LABEL
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable,
)
from reportlab.lib.styles import ParagraphStyle

from services.invoice_pdf_service import (
    NAVY, SLATE, MUTED, LIGHT, _rs, _MONEY_FONT, _MONEY_BOLD,
)

COMM_ROLE_LABEL = {
    "partner": "Partner", "merchant_referral": "Referral Merchant",
    "merchant_customer": "Booking Merchant", "platform": "Platform",
    "customer": "Customer",
}


def _p(text, size=9, bold=False, color=SLATE, leading=None):
    st = ParagraphStyle(
        "c", fontName=_MONEY_BOLD if bold else _MONEY_FONT, fontSize=size,
        leading=leading or size + 3, textColor=color)
    return Paragraph(str(text if text is not None else "—"), st)


def _label(text):
    return _p(str(text).upper(), size=7, bold=True, color=MUTED)


def _kv_table(pairs):
    """Two-column label/value grid."""
    rows = []
    for label, value in pairs:
        rows.append([_label(label), _p(value, size=9, bold=True)])
    t = Table(rows, colWidths=[45 * mm, None])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    return t


def _section(title):
    return [Spacer(1, 8), _p(title, size=11, bold=True, color=NAVY),
            HRFlowable(width="100%", thickness=0.6, color=LIGHT, spaceBefore=3, spaceAfter=5)]


def build_booking_detail_pdf(detail: dict, brand: str = "AzoApp") -> bytes:
    b = detail.get("booking") or {}
    partner = detail.get("partner")
    cust_m = detail.get("customer_merchant")
    ref_m = detail.get("referral_merchant")
    comm = detail.get("commission") or {}
    pricing = b.get("pricing") or {}

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=16 * mm, bottomMargin=16 * mm,
                            leftMargin=16 * mm, rightMargin=16 * mm, title=f"Booking {b.get('code','')}")
    E = []

    # Header
    head = Table([[
        _p(f"{brand}", size=16, bold=True, color=NAVY),
        _p("BOOKING DETAIL", size=16, bold=True, color=NAVY),
    ]], colWidths=[None, None])
    head.setStyle(TableStyle([("ALIGN", (1, 0), (1, 0), "RIGHT"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    E.append(head)
    E.append(_p(f"#{b.get('code','')}  ·  Status: {str(b.get('status','')).replace('_',' ').title()}  ·  {str(b.get('booking_type','')).title()}",
                size=9, color=MUTED))
    E.append(HRFlowable(width="100%", thickness=1.2, color=NAVY, spaceBefore=6, spaceAfter=2))

    # Overview + Customer
    E += _section("Overview")
    E.append(_kv_table([
        ("Service", b.get("service_name")),
        ("Category", b.get("category_name")),
        ("Type", b.get("booking_type")),
        ("Schedule", b.get("schedule_type")),
        ("Scheduled For", str(b.get("scheduled_at") or "")[:16] or "—"),
        ("Payment", b.get("payment_status")),
        ("Created", str(b.get("created_at") or "")[:16]),
    ]))
    addr = b.get("address") or {}
    E += _section("Customer")
    E.append(_kv_table([
        ("Name", b.get("customer_name")),
        ("Phone", b.get("customer_phone")),
        ("Address", ", ".join([x for x in [addr.get("line"), addr.get("city"), addr.get("pincode")] if x]) or "—"),
    ]))

    # Partner
    E += _section("Service Professional")
    if partner:
        E.append(_kv_table([
            ("Name", partner.get("name")),
            ("Phone", partner.get("phone")),
            ("Rating", f"{partner.get('rating', '—')}  |  {partner.get('jobs_completed', partner.get('total_jobs', 0))} jobs"),
            ("KYC", partner.get("kyc_status")),
            ("Skills", ", ".join([str(s).replace('_', ' ').title() for s in (partner.get("skills") or [])]) or "—"),
            ("Location", ", ".join([x for x in [partner.get("city"), partner.get("state")] if x]) or "—"),
        ]))
    else:
        E.append(_p("No partner assigned yet.", color=MUTED))

    # Merchant involvement
    if cust_m or ref_m:
        E += _section("Merchant Involvement")
        if cust_m:
            E.append(_kv_table([("Booking Merchant", cust_m.get("shop_name") or cust_m.get("name")),
                                ("Phone", cust_m.get("phone"))]))
        if ref_m:
            E.append(_kv_table([("Referral Merchant", ref_m.get("shop_name") or ref_m.get("name")),
                                ("Phone", ref_m.get("phone"))]))

    # Commission breakdown
    E += _section("Commission Breakdown  (" + ("Settled" if comm.get("settled") else "Projected") + ")")
    header = [_label("Recipient"), _label("Role"), _label("%"), _label("Amount")]
    rows = [header]
    for r in comm.get("rows", []):
        rows.append([
            _p(r.get("name"), size=9, bold=True),
            _p(COMM_ROLE_LABEL.get(r.get("role"), r.get("role")), size=8, color=MUTED),
            _p(f"{r.get('pct', 0)}%", size=9),
            _p(_rs(r.get("amount")), size=9, bold=True, color=(SLATE if r.get("eligible") else MUTED)),
        ])
    ct = Table(rows, colWidths=[None, 38 * mm, 18 * mm, 30 * mm])
    ct.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LIGHT),
    ]))
    E.append(ct)
    E.append(Spacer(1, 4))
    E.append(_p(f"Commissionable base: {_rs(comm.get('base'))}   ·   Booking total: {_rs(pricing.get('total'))}",
                size=8, color=MUTED))

    # Payment summary
    E += _section("Payment Summary")
    pay = [["Service", _rs(pricing.get("base"))]]
    if pricing.get("addons_total"):
        pay.append(["Add-ons", _rs(pricing.get("addons_total"))])
    if pricing.get("gst"):
        pay.append([TAX_LABEL, _rs(pricing.get("gst"))])
    if pricing.get("discount"):
        pay.append(["Discount", "-" + _rs(pricing.get("discount"))])
    pay.append(["TOTAL", _rs(pricing.get("total"))])
    prows = [[_p(k, size=9, bold=(k == "TOTAL")), _p(v, size=9, bold=(k == "TOTAL"),
              color=(NAVY if k == "TOTAL" else SLATE))] for k, v in pay]
    pt = Table(prows, colWidths=[None, 34 * mm])
    pt.setStyle(TableStyle([("ALIGN", (1, 0), (1, -1), "RIGHT"),
                            ("LINEABOVE", (0, -1), (-1, -1), 0.6, SLATE),
                            ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    E.append(pt)

    # Timeline
    tl = b.get("timeline") or []
    if tl:
        E += _section("Progress Timeline")
        for t in tl:
            E.append(_p(f"• {str(t.get('status','')).replace('_',' ').title()}  —  {str(t.get('at') or '')[:16]}",
                        size=9, color=SLATE))

    doc.build(E)
    return buf.getvalue()
