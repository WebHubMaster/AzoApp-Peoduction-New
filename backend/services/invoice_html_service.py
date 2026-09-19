"""Single source-of-truth invoice renderer.

ONE HTML/CSS template drives the browser preview, the print view and the
downloaded PDF (rendered by WeasyPrint). Because the exact same HTML string is
used everywhere — and the fonts are embedded (base64) so both the browser and
WeasyPrint use identical glyph metrics — the preview, print and PDF are visually
identical.

Layout is deliberately PDF-safe:
  * fixed A4 @page with explicit mm margins
  * table-based structure (no flexbox / grid for major content)
  * explicit column widths, padding and right-aligned currency
  * <thead> repeats automatically on page breaks; rows never split
"""
import base64
import io
from services.money import TAX_LABEL
import os
import re
from datetime import datetime
from pathlib import Path

# ---- fonts (embedded so browser preview == WeasyPrint PDF) ------------------
_FONT_FILES = {
    "regular": "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    "bold": "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
}
_FONT_CACHE = {}


def _font_b64(kind: str) -> str:
    if kind in _FONT_CACHE:
        return _FONT_CACHE[kind]
    path = _FONT_FILES.get(kind)
    data = ""
    try:
        with open(path, "rb") as fh:
            data = base64.b64encode(fh.read()).decode("ascii")
    except Exception:  # noqa: BLE001
        data = ""
    _FONT_CACHE[kind] = data
    return data


# ---- logo resolution --------------------------------------------------------
# A logo may be stored as a local media path (/api/media/file/...), an absolute
# URL (S3) or an existing data-URI. We resolve it to a COMPACT data-URI so it
# renders identically in the browser preview iframe, the print view and the
# WeasyPrint PDF — and stays small (SVGs / large rasters are downscaled).
_UPLOAD_DIR = Path(__file__).parent.parent / "uploads"
_LOGO_MIME = {"svg": "image/svg+xml", "png": "image/png", "jpg": "image/jpeg",
              "jpeg": "image/jpeg", "webp": "image/webp", "gif": "image/gif"}
_LOGO_CACHE: dict = {}
_LOGO_MAX_H = 240  # px — retina-crisp for the ~46px header display height


def _b64uri(data: bytes, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"


def _read_logo_bytes(logo: str):
    """Return (bytes, ext) for a media-path or absolute-URL logo, else (None, None)."""
    try:
        rel = None
        if "/api/media/file/" in logo:
            rel = logo.split("/api/media/file/", 1)[1]
        elif "/media/file/" in logo:
            rel = logo.split("/media/file/", 1)[1]
        if rel:
            rel = rel.split("?")[0]
            p = _UPLOAD_DIR / rel
            if p.exists():
                return p.read_bytes(), rel.rsplit(".", 1)[-1].lower()
        if logo.startswith("http"):
            import urllib.request
            req = urllib.request.Request(logo, headers={"User-Agent": "AzoApp"})
            with urllib.request.urlopen(req, timeout=6) as r:  # noqa: S310
                return r.read(), logo.rsplit(".", 1)[-1].lower().split("?")[0]
    except Exception:  # noqa: BLE001
        pass
    return None, None


def logo_to_data_uri(logo: str) -> str:
    if not logo or not isinstance(logo, str):
        return ""
    if logo.startswith("data:"):
        return logo
    if logo in _LOGO_CACHE:
        return _LOGO_CACHE[logo]
    data, ext = _read_logo_bytes(logo)
    result = ""
    try:
        if data and ext == "svg":
            import cairosvg
            png = cairosvg.svg2png(bytestring=data, output_height=_LOGO_MAX_H)
            result = _b64uri(png, "image/png")
        elif data:
            if len(data) > 150_000:
                from PIL import Image
                im = Image.open(io.BytesIO(data))
                if im.height > _LOGO_MAX_H:
                    ratio = _LOGO_MAX_H / float(im.height)
                    im = im.convert("RGBA").resize((max(1, int(im.width * ratio)), _LOGO_MAX_H))
                buf = io.BytesIO()
                im.save(buf, "PNG")
                result = _b64uri(buf.getvalue(), "image/png")
            else:
                result = _b64uri(data, _LOGO_MIME.get(ext, "image/png"))
    except Exception:  # noqa: BLE001
        result = ""
    if not result:
        # keep an absolute URL as-is (still fetchable); drop unresolved relatives
        result = logo if logo.startswith("http") else ""
    _LOGO_CACHE[logo] = result
    return result


# ---- helpers ----------------------------------------------------------------
TYPE_LABEL = {
    "booking": "Tax Invoice",
    "cancellation": "Cancellation Note",
    "transaction": "Transaction Statement",
    "withdrawal": "Withdrawal Statement",
    "settlement": "Settlement Statement",
    "commission": "Commission Statement",
    "refund": "Refund Document",
    "payment": "Payment Invoice",
}

_STATUS_TONE = {
    "paid": "#047857", "completed": "#047857", "issued": "#047857",
    "settled": "#047857", "credited": "#047857",
    "refunded": "#b91c1c", "cancelled": "#b91c1c", "rejected": "#b91c1c",
    "failed": "#b91c1c",
    "pending": "#b45309", "processing": "#b45309", "charged": "#b45309",
    "partially paid": "#b45309", "partially_paid": "#b45309",
}


def _tone(status: str) -> str:
    return _STATUS_TONE.get((status or "").lower(), "#334155")


# ---- premium invoice theme presets (admin-selectable per business) ----------
INVOICE_THEMES = {
    "azure":    {"label": "Azure",    "accent": "#0D47A1", "accent_dark": "#0B3C8A"},
    "emerald":  {"label": "Emerald",  "accent": "#047857", "accent_dark": "#065F46"},
    "graphite": {"label": "Graphite", "accent": "#1F2937", "accent_dark": "#111827"},
    "indigo":   {"label": "Indigo",   "accent": "#4338CA", "accent_dark": "#3730A3"},
    "maroon":   {"label": "Maroon",   "accent": "#9F1239", "accent_dark": "#881337"},
    "teal":     {"label": "Teal",     "accent": "#0F766E", "accent_dark": "#115E59"},
}
DEFAULT_THEME = "azure"
LETTERHEADS = {"classic": "Classic (accent underline)", "band": "Band (color header)"}


def resolve_theme(key) -> dict:
    return INVOICE_THEMES.get((key or "").lower()) or INVOICE_THEMES[DEFAULT_THEME]


def _esc(v) -> str:
    if v is None:
        return ""
    return (str(v).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def _indian_group(intp: str) -> str:
    if len(intp) <= 3:
        return intp
    last3 = intp[-3:]
    rest = intp[:-3]
    parts = []
    while len(rest) > 2:
        parts.insert(0, rest[-2:])
        rest = rest[:-2]
    if rest:
        parts.insert(0, rest)
    return ",".join(parts) + "," + last3


def _money(n, cur="INR") -> str:
    try:
        val = float(n or 0)
    except (TypeError, ValueError):
        val = 0.0
    sym = "\u20b9" if cur == "INR" else f"{cur} "
    neg = val < 0
    val = abs(val)
    intp, dec = f"{val:.2f}".split(".")
    out = f"{sym}{_indian_group(intp)}.{dec}"
    return f"-{out}" if neg else out


def _fmt_date(iso) -> str:
    if not iso:
        return "\u2014"
    try:
        s = str(iso).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        return dt.strftime("%d %b %Y")
    except Exception:  # noqa: BLE001
        return str(iso)[:10]


# ---- template ----------------------------------------------------------------
def build_invoice_html(inv: dict) -> str:
    """Return a complete, self-contained A4 invoice HTML document."""
    inv = inv or {}
    biz = inv.get("business_snapshot") or {}
    # BILL TO party: partner invoice → partner, merchant invoice → merchant,
    # else the customer. `bill_to` is set by the invoice service per viewer role;
    # falls back to the customer snapshot (e.g. admin live preview payloads).
    cust = inv.get("bill_to") or inv.get("customer_snapshot") or {}
    cur = inv.get("currency") or biz.get("currency") or "INR"
    items = inv.get("line_items") or []
    inv_type = inv.get("invoice_type") or "booking"
    title = TYPE_LABEL.get(inv_type, "Invoice").upper()

    # ITEM TABLE = canonical breakdown.service_items (pure services + add-ons, each with
    # its OWN quantity) for booking/cancellation invoices. This guarantees fee lines
    # (Emergency / Surge / Visiting) are shown ONLY ONCE — in the Payment Summary — and
    # are NEVER also repeated as an item row (fixes "Emergency charge shown twice"). The
    # PDF/HTML now mirrors the on-screen itemised preview line-for-line, with quantities.
    _svc_items = (inv.get("breakdown") or {}).get("service_items") if inv_type in ("booking", "cancellation") else None
    if _svc_items:
        _rebuilt = []
        for _si in _svc_items:
            _rebuilt.append({"desc": _si.get("name") or "Service", "qty": _si.get("qty", 1),
                             "rate": _si.get("rate"), "amount": _si.get("amount")})
            for _a in (_si.get("addons") or []):
                _rebuilt.append({"desc": "+ " + (_a.get("name") or "Add-on"), "qty": _a.get("qty", 1),
                                 "rate": _a.get("rate"), "amount": _a.get("amount"), "detail": "Add-on"})
        if _rebuilt:
            items = _rebuilt

    # --- theme (accent colour + letterhead style) — admin-selectable ----------
    theme = resolve_theme(biz.get("theme_key"))
    ac = biz.get("accent") or theme["accent"]
    acd = biz.get("accent_dark") or theme["accent_dark"]
    lh = (biz.get("letterhead") or "classic").lower()
    on_band = lh == "band"

    # --- FROM block lines
    biz_addr = [biz.get("address"),
                ", ".join([x for x in [biz.get("city"), biz.get("state"), biz.get("zip")] if x]),
                biz.get("country")]
    from_lines = [x for x in (biz_addr + [
        biz.get("phone"), biz.get("email"),
        f"GSTIN: {biz.get('gst')}" if biz.get("gst") else None,
        f"PAN: {biz.get('pan')}" if biz.get("pan") else None,
    ]) if x]

    # --- BILL TO lines
    bill_lines = [x for x in [
        cust.get("address"), cust.get("phone"), cust.get("email"),
        f"GSTIN: {cust.get('gstin')}" if cust.get("gstin") else None,
    ] if x]

    # --- invoice details rows
    detail_rows = [("Invoice Date", _fmt_date(inv.get("issue_date") or inv.get("created_at")))]
    if inv.get("booking_code"):
        detail_rows.append(("Booking ID", inv["booking_code"]))
    if inv.get("booking_date"):
        detail_rows.append(("Booking Date", _fmt_date(inv["booking_date"])))
    if inv.get("transaction_id"):
        detail_rows.append(("Txn ID", inv["transaction_id"]))
    if inv.get("withdrawal_id"):
        detail_rows.append(("Withdrawal ID", inv["withdrawal_id"]))
    if inv.get("payment_method"):
        detail_rows.append(("Payment", inv["payment_method"]))
    detail_rows.append(("Currency", cur))

    # --- financial summary rows (only what applies)
    _re = inv.get("role_earning")
    # A partner BOOKING statement gets a dedicated two-part layout (Booking Summary +
    # Partner Earning) built below; keep the generic sum_rows empty for that case.
    partner_statement = bool(_re and _re.get("role") == "partner" and not _re.get("is_cancellation"))
    # A partner CANCELLATION statement gets its own two-part layout: Payment Summary
    # (booking figures + retained) and Your Earning (earning breakdown + green net).
    partner_cancel_statement = bool(_re and _re.get("role") == "partner" and _re.get("is_cancellation"))
    booking_rows = earning_rows = None
    booking_total = earning_total = (None, None)
    # Containers for the partner-cancellation layout.
    pcs = None
    if partner_cancel_statement:
        _booking_total = float(inv.get("original_amount") if inv.get("original_amount") is not None else inv.get("total_amount") or 0)
        _refund = round(abs(float(inv.get("refund") or 0)), 2)
        _retained = round(_booking_total - _refund, 2)
        _rate = _re.get("rate")
        _rate_txt = f"{float(_rate):g}%" if isinstance(_rate, (int, float)) else None
        _plat_rate_txt = f"{100 - float(_rate):g}%" if isinstance(_rate, (int, float)) else None
        _pay_bd = inv.get("breakdown") or {}
        if _pay_bd.get("services_subtotal") is not None:
            _pay_rows = [("Service Amount", _pay_bd.get("services_subtotal"), False)]
            for _pc in (_pay_bd.get("additional_charges") or []):
                _pay_rows.append((_pc.get("label") or "Charge", _pc.get("amount"), False))
            if inv.get("tax"):
                _pay_rows.append((TAX_LABEL, inv.get("tax"), False))
        else:
            _pay_rows = [("Service Amount", inv.get("subtotal"), False)]
            if float(inv.get("visiting_charge") or 0) > 0:
                _pay_rows.append(("Visiting Charge", inv.get("visiting_charge"), False))
            if inv.get("tax"):
                _pay_rows.append((TAX_LABEL, inv.get("tax"), False))
        _settle_rows = [("Paid Amount", _booking_total, False), ("Customer Refund", _refund, False)]
        _earn_rows = [("Eligible Earning Amount", _re.get("base"), False)]
        if _rate_txt:
            _earn_rows.append(("Your Share Rate", _rate_txt, "text"))
        _brk_rows = []
        if _rate_txt:
            _brk_rows.append(("Partner Share", _rate_txt, "text"))
        _brk_rows.append(("Partner Earning", _re.get("net"), False))
        if _plat_rate_txt:
            _brk_rows.append(("Platform Share", _plat_rate_txt, "text"))
        if _re.get("platform") is not None:
            _brk_rows.append(("AzoApp Platform Earning", _re.get("platform"), False))
        pcs = {
            "pay_rows": _pay_rows,
            "booking_total": ("Total Booking Amount", _booking_total),
            "settle_rows": _settle_rows,
            "retained": ("Amount Retained", _retained),
            "earn_rows": _earn_rows,
            "brk_rows": _brk_rows,
            "net": ("Net Earning", _re.get("net")),
            "coupon_code": _re.get("coupon_code"),
            "coupon_discount": _re.get("coupon_discount"),
            "coupon_note": _re.get("coupon_note"),
        }
        sum_rows = []
        total_label = ""
        total_value = None
    if partner_statement:
        _base = _re.get("base")                                    # commissionable amount
        _service = _re.get("service_cost") if _re.get("service_cost") is not None else _base
        _vc = _re.get("visiting_charge") or 0
        # BOOKING SUMMARY — the customer-facing figures for this booking.
        booking_rows = [("Service Amount", _service, False)]
        if _vc:
            booking_rows.append(("Visiting Charge", _vc, False))
        booking_rows.append(("Commissionable Amount", _base, False))
        if inv.get("tax"):
            booking_rows.append((TAX_LABEL, inv["tax"], False))
        booking_total = ("Customer Total Paid", inv.get("total_amount"))
        # PARTNER EARNING — tax-excluded; commission computed on the commissionable amount.
        earning_rows = [("Commissionable Amount", _base, False)]
        if isinstance(_re.get("rate"), (int, float)):
            earning_rows.append(("Commission Rate", f'{_re.get("rate"):g}%', "text"))
        earning_rows.append((_re.get("commission_label") or "Partner Commission", _re.get("commission"), False))
        earning_total = ("Total Partner Earning", _re.get("net"))
        sum_rows = []
        total_label = ""
        total_value = None
    elif _re and not partner_cancel_statement:
        # Partner/Merchant earning statement — show THEIR commission + net.
        # Order (spec): all cost/charge lines FIRST, then tax (GST) LAST before the net.
        _re_cancel = bool(_re.get("is_cancellation"))
        sum_rows = [(_re.get("service_label") or "Service Cost",
                     _re.get("service_cost") if _re.get("service_cost") is not None else _re.get("base"), False)]
        if _re.get("role") == "partner" and _re.get("visiting_charge"):
            sum_rows.append(("Visiting Charge", _re.get("visiting_charge"), False))
        # Commission earned (skip for a cancellation partner statement — the net IS the
        # earning there, so we avoid a duplicate row).
        if _re.get("commission") is not None and not (_re_cancel and _re.get("role") == "partner"):
            _clabel = f'{_re.get("commission_label")} ({_re.get("rate"):g}%)' if isinstance(_re.get("rate"), (int, float)) else _re.get("commission_label")
            sum_rows.append((_clabel, _re.get("commission"), True))
        # Platform's share of the cancellation charge (spec: show both to the partner).
        if _re.get("platform") is not None:
            sum_rows.append((_re.get("platform_label") or "Platform Share", _re.get("platform"), False))
        # Tax applies only to a live earning statement, never to a cancellation charge.
        if inv.get("tax") and not _re_cancel:
            sum_rows.append((TAX_LABEL, inv["tax"], False))
        total_label = _re.get("net_label") or "Net"
        total_value = _re.get("net")
    elif not partner_cancel_statement:
        # Prefer the canonical breakdown (single source of truth) for booking &
        # cancellation invoices — Service Amount is PURE and every charge is its
        # own line (no fold / double count). Order: charges first, tax LAST.
        _bd = inv.get("breakdown") if inv_type in ("booking", "cancellation") else None
        if _bd:
            sum_rows = [("Service Amount", _bd.get("services_subtotal"), False)]
            for _c in (_bd.get("additional_charges") or []):
                sum_rows.append((_c.get("label") or "Charge", _c.get("amount"), False))
            if _bd.get("discount"):
                sum_rows.append(("Coupon Discount", -abs(float(_bd.get("discount"))), False))
            if _bd.get("tax"):
                sum_rows.append(("Taxable Amount", _bd.get("taxable"), True))
                sum_rows.append((TAX_LABEL, _bd.get("tax"), False))
            if inv_type == "cancellation":
                _orig = float(_bd.get("total") if _bd.get("total") is not None else inv.get("original_amount") or 0)
                _refund = round(abs(float(inv.get("refund") or 0)), 2)
                _retained = round(_orig - _refund, 2)
                _pct = inv.get("cancellation_pct")
                sum_rows.append(("Gross Total", _orig, False))
                sum_rows.append((f"Customer Refund ({float(_pct):g}%)" if _pct is not None else "Customer Refund", -_refund, False))
                sum_rows.append(("Amount Retained", _retained, False))
                total_label = "Total Customer Refund"
                total_value = _refund
            else:
                total_label = "Total"
                total_value = _bd.get("total")
        else:
            # Order (spec): every cost / charge line FIRST, then the tax (GST) LAST, right
            # before the total — the tax is computed on the taxable amount shown just above it.
            sum_rows = [("Subtotal", inv.get("subtotal"), False)]
            if inv.get("fees"):
                _vc = float(inv.get("visiting_charge") or 0)
                _other = round(float(inv.get("fees") or 0) - _vc, 2)
                if _vc > 0:
                    sum_rows.append(("Visiting Charge", _vc, False))
                if _other > 0.001:
                    sum_rows.append(("Platform / Service Fees", _other, False))
            if inv.get("discount"):
                sum_rows.append(("Discount", -abs(inv["discount"]), False))
            if inv.get("commission"):
                sum_rows.append(("Commission (platform)", inv["commission"], True))
            # Taxable Amount (audit spec #3): the GST base — service + charges EXCLUDING the
            # untaxed visiting charge. Informational (muted); the GST line follows it LAST.
            if inv.get("tax"):
                _tx = inv.get("taxable")
                if _tx is None:
                    _tx = round(float(inv.get("subtotal") or 0) + max(0.0, round(float(inv.get("fees") or 0) - float(inv.get("visiting_charge") or 0), 2)), 2)
                sum_rows.append(("Taxable Amount", _tx, True))
                sum_rows.append((TAX_LABEL, inv["tax"], False))
            # For a cancellation the headline is the ORIGINAL ORDER VALUE (the refund is on the
            # separate Refund Receipt). Show the % refunded + the refund issued as muted info.
            if inv_type == "cancellation":
                _orig = float(inv.get("original_amount") if inv.get("original_amount") is not None else inv.get("total_amount") or 0)
                _refund = round(abs(float(inv.get("refund") or 0)), 2)
                _retained = round(_orig - _refund, 2)
                _pct = inv.get("cancellation_pct")
                _refund_label = f"Customer Refund ({float(_pct):g}%)" if _pct is not None else "Customer Refund"
                sum_rows.append((_refund_label, _refund, False))
                sum_rows.append(("Amount Retained", _retained, False))
                total_label = "Total Order Value"
                total_value = _orig
            else:
                if inv.get("refund"):
                    sum_rows.append(("Refund", -abs(inv["refund"]), False))
                total_label = "Net Payable" if inv_type == "withdrawal" else "Total"
                total_value = inv.get("total_amount")

    # --- logo: embedded data-URI (preferred) or an absolute URL; otherwise a
    #     crisp text wordmark. The logo is resolved to a data-URI upstream so it
    #     renders identically in the browser preview, print and the WeasyPrint PDF.
    logo = logo_to_data_uri(biz.get("logo") or "")
    if isinstance(logo, str) and (logo.startswith("data:") or logo.startswith("http")):
        logo_html = f'<img src="{logo}" alt="logo" style="height:46px;max-width:210px;object-fit:contain" />'
    else:
        tag = _esc(biz.get("tagline") or "Service at Your Doorstep")
        logo_html = (
            f'<div class="wordmark">{_esc(biz.get("name") or "AzoApp")}</div>'
            f'<div class="tagline"><span></span>{tag}<span></span></div>'
        )

    # --- build rows html
    party_from = "".join(f'<div class="pl">{_esc(l)}</div>' for l in from_lines)
    party_bill = "".join(f'<div class="pl">{_esc(l)}</div>' for l in bill_lines)
    details_html = "".join(
        f'<tr><td class="dk">{_esc(k)}</td><td class="dv">{_esc(v)}</td></tr>'
        for k, v in detail_rows)

    items_html = ""
    for it in items:
        desc = _esc(it.get("desc") or it.get("description") or it.get("name") or "\u2014")
        detail = it.get("detail")
        qty = it.get("qty", 1)
        amount = it.get("amount", it.get("price", 0))
        # Per-unit rate: prefer the explicit stored rate; else derive amount / qty so
        # even legacy invoices show a correct "Rate x Qty = Amount" (no double count).
        rate = it.get("rate")
        if rate is None:
            rate = it.get("price")
        if rate is None:
            try:
                _qn = float(qty) or 1
            except (TypeError, ValueError):
                _qn = 1
            rate = round(float(amount or 0) / _qn, 2) if _qn else amount
        rate_cell = _money(rate, cur)
        is_addon = (it.get("desc") or "").startswith("+ ") or detail == "Add-on"
        if is_addon:
            nm = _esc((it.get("desc") or "")[2:] if (it.get("desc") or "").startswith("+ ") else (it.get("desc") or ""))
            try:
                _aq = int(float(qty))
            except (TypeError, ValueError):
                _aq = 1
            _aq_cell = _esc(_aq) if _aq > 1 else ""
            items_html += (
                "<tr>"
                f'<td class="i-desc"><div class="idesc-addon">&#8627; {nm} <span class="idesc-tag">add-on</span></div></td>'
                f'<td class="i-qty">{_aq_cell}</td>'
                f'<td class="i-rate">{rate_cell}</td>'
                f'<td class="i-amt">{_money(amount, cur)}</td>'
                "</tr>"
            )
            continue
        sub = f'<div class="idesc-sub">{_esc(detail)}</div>' if detail else ""
        items_html += (
            "<tr>"
            f'<td class="i-desc"><div class="idesc-main">{desc}</div>{sub}</td>'
            f'<td class="i-qty">{_esc(qty)}</td>'
            f'<td class="i-rate">{rate_cell}</td>'
            f'<td class="i-amt">{_money(amount, cur)}</td>'
            "</tr>"
        )

    def _render_sum_rows(rows):
        html = ""
        for label, val, muted in rows:
            if muted == "label":  # informational sub-heading row (no amount), e.g. refund %
                html += (
                    f'<tr class="sum-row muted"><td class="s-label" colspan="2"><b>{_esc(label)}</b></td></tr>'
                )
                continue
            if muted == "text":  # a non-currency value (e.g. "80%")
                html += (
                    f'<tr class="sum-row"><td class="s-label">{_esc(label)}</td>'
                    f'<td class="s-val">{_esc(val)}</td></tr>'
                )
                continue
            cls = "sum-row muted" if muted else "sum-row"
            html += (
                f'<tr class="{cls}"><td class="s-label">{_esc(label)}</td>'
                f'<td class="s-val">{_money(val, cur)}</td></tr>'
            )
        return html

    summary_html = _render_sum_rows(sum_rows)

    # Totals block: a partner booking statement shows TWO stacked sections
    # (Booking Summary + Partner Earning); everything else shows the single summary.
    if partner_cancel_statement and pcs:
        totals_inner_html = (
            f'<div class="sum-cap first">Payment Summary</div>'
            f'<table><tbody>{_render_sum_rows(pcs["pay_rows"])}</tbody></table>'
            f'<table class="subtotal-box"><tr><td class="tl">{_esc(pcs["booking_total"][0])}</td>'
            f'<td class="tv">{_money(pcs["booking_total"][1], cur)}</td></tr></table>'
            f'<table style="margin-top:8px"><tbody>{_render_sum_rows(pcs["settle_rows"])}</tbody></table>'
            f'<table class="subtotal-box"><tr><td class="tl">{_esc(pcs["retained"][0])}</td>'
            f'<td class="tv">{_money(pcs["retained"][1], cur)}</td></tr></table>'
            f'<div class="sum-cap">Your Earning</div>'
            f'<table><tbody>{_render_sum_rows(pcs["earn_rows"])}</tbody></table>'
            f'<div class="sum-cap">Earning Breakdown</div>'
            f'<table><tbody>{_render_sum_rows(pcs["brk_rows"])}</tbody></table>'
            f'<table class="total-box earn"><tr><td class="tl">{_esc(pcs["net"][0])}</td>'
            f'<td class="tv">{_money(pcs["net"][1], cur)}</td></tr></table>'
            + (
                (
                    f'<div style="margin-top:10px;padding:10px 12px;border:1px solid #a7f3d0;'
                    f'background:#ecfdf5;border-radius:10px;">'
                    f'<div style="display:flex;justify-content:space-between;font-size:11px;'
                    f'font-weight:700;color:#047857;text-transform:uppercase;letter-spacing:.04em;">'
                    f'<span>Coupon {_esc(pcs["coupon_code"])}</span>'
                    + (f'<span>{_money(pcs["coupon_discount"], cur)} off</span>'
                       if float(pcs.get("coupon_discount") or 0) > 0 else "")
                    + f'</div>'
                    f'<div style="font-size:10.5px;color:#059669;margin-top:4px;">'
                    f'{_esc(pcs["coupon_note"] or "Coupon discount is funded by AzoApp and does not affect Partner earnings.")}'
                    f'</div></div>'
                ) if pcs.get("coupon_code") else ""
            )
        )
    elif partner_statement:
        totals_inner_html = (
            f'<div class="sum-cap first">Booking Summary</div>'
            f'<table><tbody>{_render_sum_rows(booking_rows)}</tbody></table>'
            f'<table class="subtotal-box"><tr><td class="tl">{_esc(booking_total[0])}</td>'
            f'<td class="tv">{_money(booking_total[1], cur)}</td></tr></table>'
            f'<div class="sum-cap">Partner Earning</div>'
            f'<table><tbody>{_render_sum_rows(earning_rows)}</tbody></table>'
            f'<table class="total-box"><tr><td class="tl">{_esc(earning_total[0])}</td>'
            f'<td class="tv">{_money(earning_total[1], cur)}</td></tr></table>'
        )
    else:
        _cn_code = inv.get("coupon_code") or (inv.get("breakdown") or {}).get("coupon_code")
        _cn_disc = float((inv.get("breakdown") or {}).get("discount") or inv.get("discount") or 0)
        _coupon_note = ""
        if _cn_disc > 0:
            _coupon_note = (
                f'<div style="margin-top:10px;padding:10px 12px;border:1px solid #a7f3d0;'
                f'background:#ecfdf5;border-radius:10px;">'
                f'<div style="display:flex;justify-content:space-between;font-size:11px;'
                f'font-weight:700;color:#047857;text-transform:uppercase;letter-spacing:.04em;">'
                f'<span>Coupon{(" " + _esc(_cn_code)) if _cn_code else ""}</span>'
                f'<span>{_money(_cn_disc, cur)} off</span></div>'
                f'<div style="font-size:10.5px;color:#059669;margin-top:4px;">'
                f'This coupon discount is funded by AzoApp \u2014 your savings, on us.</div></div>'
            )
        totals_inner_html = (
            f'<table><tbody>{summary_html}</tbody></table>'
            f'<table class="total-box"><tr>'
            f'<td class="tl">{_esc(total_label)}</td>'
            f'<td class="tv">{_money(total_value, cur)}</td>'
            f'</tr></table>'
            + _coupon_note
        )

    # terms / footer
    terms = biz.get("terms")
    refund_policy = biz.get("refund_policy")
    footer_left = biz.get("footer") or "Thank you for your business."
    support = biz.get("support")
    website = biz.get("website")
    notes = inv.get("notes")

    terms_html = ""
    if terms:
        terms_html += f'<p class="term"><b>Terms &amp; Conditions:</b> {_esc(terms)}</p>'
    if refund_policy:
        terms_html += f'<p class="term"><b>Refund Policy:</b> {_esc(refund_policy)}</p>'

    notes_html = ""
    if notes:
        notes_html = (f'<div class="notes"><div class="sec-cap">Notes</div>'
                      f'<p class="note-body">{_esc(notes)}</p></div>')

    reg = _font_b64("regular")
    bold = _font_b64("bold")
    st = _tone(inv.get("status"))
    pst = _tone(inv.get("payment_status"))
    # Status line — avoid the confusing duplicate (e.g. "CANCELLED | CANCELLED"):
    # when the document status and the payment status are the same, show it ONCE.
    _s_status = (inv.get("status") or "").strip()
    _s_pay = (inv.get("payment_status") or "").strip()
    if _s_status and _s_pay and _s_status.lower() != _s_pay.lower():
        status_line_html = (
            f'<span style="color:{st}">{_esc(_s_status.upper())}</span>'
            f'<span class="status-sep">|</span>'
            f'<span style="color:{pst}">{_esc(_s_pay.upper())}</span>'
        )
    else:
        _one = _s_status or _s_pay
        _tone_one = st if _s_status else pst
        status_line_html = f'<span style="color:{_tone_one}">{_esc(_one.upper())}</span>'
    cust_name = _esc(cust.get("name") or "\u2014")
    biz_name = _esc(biz.get("name") or "AzoApp")

    # --- letterhead style CSS (overrides the neutral base header rules) -------
    if on_band:
        head_css = (
            f".head td {{ background:{ac}; padding:16px 18px; }}"
            f".head tr td:first-child {{ border-radius:8px 0 0 8px; }}"
            f".head tr td:last-child {{ border-radius:0 8px 8px 0; }}"
            f".wordmark {{ color:#ffffff; }} .doc-title {{ color:#ffffff; }}"
            f".doc-num {{ color:rgba(255,255,255,.92); }}"
            f".tagline {{ color:rgba(255,255,255,.85); }} .tagline span {{ background:rgba(255,255,255,.55); }}"
            f".status-line span {{ color:#ffffff !important; }} .status-sep {{ color:rgba(255,255,255,.5); }}"
        )
    else:
        head_css = (
            f".head td {{ border-bottom:2px solid {ac}; }}"
            f".wordmark {{ color:{ac}; }} .doc-title {{ color:{ac}; }}"
            f".tagline {{ color:{ac}; }} .tagline span {{ background:{ac}; }}"
        )

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<style>
@font-face {{ font-family:'AZSans'; font-weight:400; font-style:normal;
  src:url(data:font/ttf;base64,{reg}) format('truetype'); }}
@font-face {{ font-family:'AZSans'; font-weight:700; font-style:normal;
  src:url(data:font/ttf;base64,{bold}) format('truetype'); }}
@page {{ size:A4; margin:14mm 14mm 12mm 14mm; }}
* {{ box-sizing:border-box; margin:0; padding:0;
  -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
html,body {{ font-family:'AZSans','Helvetica Neue',Arial,sans-serif; color:#334155;
  font-size:12px; line-height:1.45; -webkit-font-smoothing:antialiased; background:#fff;
  -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
.sheet {{ width:182mm; margin:0 auto; }}
/* On-screen preview: render the body as a real A4 page (white sheet with the
   same 14mm/12mm print margins) so the browser preview matches the PDF exactly.
   WeasyPrint renders in the *print* media context and ignores @media screen,
   so the downloaded PDF is unaffected and continues to use @page margins. */
@media screen {{
  html {{ background:#eef1f5; }}
  body {{ width:210mm; min-height:297mm; margin:0 auto;
    padding:14mm 14mm 12mm 14mm; background:#fff; }}
  .sheet {{ width:100%; margin:0; }}
}}
table {{ border-collapse:collapse; width:100%; }}
td,th {{ vertical-align:top; }}

/* ---- header (colours supplied by {head_css} per letterhead style) ---- */
.head td {{ padding-bottom:14px; }}
.wordmark {{ font-weight:700; font-size:26px; letter-spacing:-0.5px; line-height:1; }}
.tagline {{ font-size:8.5px; letter-spacing:1px; margin-top:4px;
  text-transform:uppercase; display:flex; align-items:center; gap:6px; }}
.tagline span {{ display:inline-block; height:1px; width:16px; opacity:.5; }}
.h-right {{ text-align:right; }}
.doc-title {{ font-weight:700; font-size:22px; letter-spacing:-0.3px; }}
.doc-num {{ font-weight:700; font-size:13px; color:#334155; margin-top:2px; }}
.status-line {{ margin-top:8px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; }}
.status-sep {{ color:#cbd5e1; padding:0 6px; }}
{head_css}

/* ---- info columns ---- */
.info {{ margin-top:20px; }}
.info > td {{ width:33.33%; padding-right:16px; }}
.info > td:last-child {{ padding-right:0; }}
.sec-cap {{ font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px;
  color:#94a3b8; margin-bottom:6px; }}
.pname {{ font-size:13px; font-weight:700; color:#0f172a; margin-bottom:2px; }}
.pl {{ font-size:11.5px; color:#64748b; line-height:1.5; }}
.dtl {{ font-size:11.5px; }}
.dtl .dk {{ color:#64748b; padding:1.5px 0; }}
.dtl .dv {{ color:#1e293b; font-weight:700; text-align:right; padding:1.5px 0; word-break:break-word; }}

/* ---- items ---- */
.items {{ margin-top:22px; }}
.items thead th {{ background:{ac}; color:#fff; font-weight:700; font-size:11px;
  text-transform:uppercase; letter-spacing:.5px; padding:9px 10px; }}
.items thead th.i-desc {{ text-align:left; }}
.items thead th.i-qty {{ text-align:center; width:52px; }}
.items thead th.i-rate {{ text-align:right; width:110px; }}
.items thead th.i-amt {{ text-align:right; width:120px; }}
.items tbody td {{ padding:9px 10px; border-bottom:1px solid #eef2f7; font-size:12px; }}
.items tbody tr {{ page-break-inside:avoid; }}
.i-desc {{ text-align:left; }}
.idesc-main {{ font-weight:700; color:#1e293b; }}
.idesc-addon {{ padding-left:16px; color:#64748b; font-weight:500; font-style:italic; }}
.idesc-tag {{ font-size:9px; font-style:normal; color:#94a3b8; border:1px solid #e2e8f0; border-radius:6px; padding:0 5px; margin-left:4px; }}
.idesc-sub {{ font-size:10.5px; color:#94a3b8; margin-top:1px; }}
.i-qty {{ text-align:center; color:#475569; }}
.i-rate {{ text-align:right; color:#475569; }}
.i-amt {{ text-align:right; font-weight:700; color:#1e293b; }}

/* ---- totals ---- */
.totals {{ margin-top:16px; page-break-inside:avoid; }}
.totals > td.spacer {{ width:58%; }}
.totals > td.tbox {{ width:42%; }}
.sum-row td {{ padding:5px 2px; font-size:12px; }}
.sum-row .s-label {{ color:#475569; text-align:left; }}
.sum-row .s-val {{ color:#334155; font-weight:700; text-align:right; }}
.sum-row.muted td {{ color:#94a3b8; font-weight:400; }}
.sum-row.muted .s-val {{ color:#94a3b8; }}
.total-box {{ margin-top:8px; background:{ac}; border-radius:8px; }}
.total-box td {{ padding:12px 14px; color:#fff; }}
.total-box .tl {{ font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; }}
.total-box .tv {{ font-size:17px; font-weight:700; text-align:right; }}
/* partner NET EARNING box — green highlight */
.total-box.earn {{ background:#059669; }}
.total-box.earn td {{ color:#ffffff; }}
/* section caption + neutral subtotal box for the partner two-part earning layout */
.sum-cap {{ font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.7px;
  color:{ac}; margin:16px 0 5px; }}
.sum-cap.first {{ margin-top:0; }}
.subtotal-box {{ margin-top:8px; background:#f1f5f9; border-radius:8px; }}
.subtotal-box td {{ padding:10px 14px; color:#334155; }}
.subtotal-box .tl {{ font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; }}
.subtotal-box .tv {{ font-size:14px; font-weight:700; text-align:right; }}

/* ---- notes + footer ---- */
.notes {{ margin-top:22px; }}
.note-body {{ font-size:11.5px; color:#64748b; }}
.foot {{ margin-top:26px; padding-top:14px; border-top:1px solid #eef2f7; }}
.term {{ font-size:10px; color:#64748b; line-height:1.55; margin-bottom:3px; }}
.term b {{ color:#475569; }}
.foot-bottom {{ margin-top:12px; }}
.foot-bottom .fl {{ font-size:10.5px; color:#94a3b8; }}
.foot-bottom .fr {{ font-size:10.5px; color:#64748b; text-align:right; }}
</style></head>
<body>
<div class="sheet">
  <!-- header -->
  <table class="head"><tr>
    <td>{logo_html}</td>
    <td class="h-right">
      <div class="doc-title">{_esc(title)}</div>
      <div class="doc-num">{_esc(inv.get('invoice_number') or '')}</div>
      <div class="status-line">{status_line_html}</div>
    </td>
  </tr></table>

  <!-- info columns -->
  <table class="info"><tr>
    <td>
      <div class="sec-cap">From</div>
      <div class="pname">{biz_name}</div>
      {party_from}
    </td>
    <td>
      <div class="sec-cap">Bill To</div>
      <div class="pname">{cust_name}</div>
      {party_bill}
    </td>
    <td>
      <div class="sec-cap">Invoice Details</div>
      <table class="dtl"><tbody>{details_html}</tbody></table>
    </td>
  </tr></table>

  <!-- items -->
  <table class="items">
    <thead><tr>
      <th class="i-desc">Description</th>
      <th class="i-qty">Qty</th>
      <th class="i-rate">Rate</th>
      <th class="i-amt">Amount</th>
    </tr></thead>
    <tbody>{items_html}</tbody>
  </table>

  <!-- totals -->
  <table class="totals"><tr>
    <td class="spacer"></td>
    <td class="tbox">
      {totals_inner_html}
    </td>
  </tr></table>

  {notes_html}

  <!-- footer -->
  <div class="foot">
    {terms_html}
    <table class="foot-bottom"><tr>
      <td class="fl">{_esc(footer_left)}</td>
      <td class="fr">
        {('Support: ' + _esc(support) + '<br/>') if support else ''}
        {_esc(website) if website else ''}
      </td>
    </tr></table>
  </div>
</div>
</body></html>"""


def render_invoice_pdf(inv: dict) -> bytes:
    """Render the unified invoice HTML to a PDF via WeasyPrint."""
    from weasyprint import HTML
    html = build_invoice_html(inv)
    return HTML(string=html).write_pdf()
