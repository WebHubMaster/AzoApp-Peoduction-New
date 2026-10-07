"""2-page GST booking invoice (UC style):
  Page 1 — TAX INVOICE   : Customer ↔ Platform (Commission + Platform Fee, CGST/SGST)
  Page 2 — PARTNER RECEIPT: Customer ↔ Partner  (Service Charge = partner share, no tax)"""
import base64
import io
from services import money

STATE_CODES = {
    "jammu and kashmir": "01", "himachal pradesh": "02", "punjab": "03", "chandigarh": "04",
    "uttarakhand": "05", "haryana": "06", "delhi": "07", "rajasthan": "08", "uttar pradesh": "09",
    "bihar": "10", "sikkim": "11", "arunachal pradesh": "12", "nagaland": "13", "manipur": "14",
    "mizoram": "15", "tripura": "16", "meghalaya": "17", "assam": "18", "west bengal": "19",
    "jharkhand": "20", "odisha": "21", "chhattisgarh": "22", "madhya pradesh": "23",
    "gujarat": "24", "dadra and nagar haveli and daman and diu": "26", "maharashtra": "27",
    "karnataka": "29", "goa": "30", "lakshadweep": "31", "kerala": "32", "tamil nadu": "33",
    "puducherry": "34", "andaman and nicobar islands": "35", "telangana": "36",
    "andhra pradesh": "37", "ladakh": "38",
}


def state_with_code(state) -> str:
    st = (state or "").strip()
    if not st:
        return ""
    code = STATE_CODES.get(st.lower())
    return f"{st} {code}" if code else st


def _addr(a) -> str:
    if isinstance(a, str):
        return a
    if not isinstance(a, dict):
        return ""
    parts = [a.get("line") or a.get("address"), a.get("landmark"), a.get("city"),
             a.get("state"), a.get("pincode") or a.get("zip")]
    return ", ".join(str(p) for p in parts if p)


def build_block(booking: dict, settings: dict, partner: dict, invoice_number: str,
                partner_share: float = None, kind: str = "booking") -> dict:
    """Authoritative GST split from stored pricing. Page1 + Page2 == customer total."""
    pr = booking.get("pricing") or {}
    icfg = settings.get("invoice_config") or {}
    total = money.money(pr.get("total") or 0)
    gst = money.money(pr.get("gst") or pr.get("tax") or 0)
    if pr.get("partner_share") is not None:
        partner_share = money.money(pr.get("partner_share"))
    partner_share = money.money(partner_share or 0)
    taxable = money.money(max(0.0, money.add(total, -gst, -partner_share)))
    gst_pct = float(pr.get("gst_pct") or settings.get("gst_pct") or 18)
    cgst = money.money(pr.get("cgst")) if pr.get("cgst") is not None else money.money(gst / 2)
    sgst = money.add(gst, -cgst)
    category = booking.get("category_name") or booking.get("service_name") or "Services"
    addr = booking.get("address") or {}
    cust_state = state_with_code(addr.get("state") if isinstance(addr, dict) else "")
    p_addr = (partner or {}).get("address")
    p_state = (p_addr.get("state") if isinstance(p_addr, dict) else "") or (partner or {}).get("state") or ""
    canc = kind == "cancellation"
    return {
        "kind": kind,
        "category": category,
        "place_of_supply": cust_state,
        "customer_state": cust_state,
        "platform": {
            "number": invoice_number,
            "desc": (f"Cancellation Fee Commission - {category}" if canc
                     else f"Commission & Platform Fee - {category}"),
            "sac": icfg.get("sac_platform") or "999799",
            "gross": taxable, "discount": 0.0, "taxable": taxable,
            "commission": money.money(pr.get("platform_commission") or max(0.0, money.add(
                taxable, -money.money(pr.get("platform_fee") or 0), -money.money(pr.get("convenience_fee") or 0)))),
            "platform_fee": money.add(money.money(pr.get("platform_fee") or 0),
                                      money.money(pr.get("convenience_fee") or 0)),
            "gst_pct": gst_pct, "cgst_pct": round(gst_pct / 2, 2), "sgst_pct": round(gst_pct / 2, 2),
            "cgst": cgst, "sgst": sgst, "total_tax": gst,
            "subtotal": money.add(taxable, gst),
        },
        "partner": {
            "number": f"{invoice_number}-P",
            "desc": f"Cancellation Charge - {category}" if canc else f"Service Charge - {category}",
            "sac": icfg.get("sac_service") or "999729",
            "gross": partner_share, "discount": 0.0, "subtotal": partner_share,
            "name": (partner or {}).get("name") or booking.get("partner_name") or "Service Partner",
            "address": _addr(p_addr) or ", ".join(
                [x for x in [(partner or {}).get("city"), p_state, (partner or {}).get("pincode")] if x]),
            "state": state_with_code(p_state),
        },
        "grand_total": total,
    }


# ------------------------------------------------------------------ rendering
_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
         "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
         "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _words(n: int) -> str:
    if n < 20:
        return _ONES[n]
    if n < 100:
        return (_TENS[n // 10] + " " + _ONES[n % 10]).strip()
    if n < 1000:
        return (_ONES[n // 100] + " Hundred " + _words(n % 100)).strip()
    for div, name in ((10000000, "Crore"), (100000, "Lakh"), (1000, "Thousand")):
        if n >= div:
            return (_words(n // div) + f" {name} " + _words(n % div)).strip()
    return ""


def amount_in_words(v) -> str:
    v = round(float(v or 0), 2)
    rupees, paise = int(v), int(round((v - int(v)) * 100))
    out = "Rupees " + (_words(rupees) or "Zero")
    if paise:
        out += " and " + _words(paise) + " Paise"
    return out + " Only"


def _qr_data_uri(text: str) -> str:
    try:
        import qrcode
        img = qrcode.make(text, box_size=6, border=1)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception:  # noqa: BLE001
        return ""


def build_html(inv: dict) -> str:
    from services.invoice_html_service import (_esc, _money, _fmt_date, logo_to_data_uri,
                                               resolve_theme)
    g = inv.get("gst_invoice") or {}
    biz = inv.get("business_snapshot") or {}
    cust = inv.get("customer_snapshot") or {}
    cur = inv.get("currency") or "INR"
    ac = biz.get("accent") or resolve_theme(biz.get("theme_key"))["accent"]
    logo = logo_to_data_uri(biz.get("logo") or "")
    date = _fmt_date(inv.get("issue_date"))
    m = lambda v: _money(v, cur)  # noqa: E731
    p1, p2 = g.get("platform") or {}, g.get("partner") or {}
    _ba = biz.get("address") or ""
    biz_addr = ", ".join([x for x in [_ba] + [biz.get(k) for k in ("city", "zip")] if x and (x == _ba or str(x) not in _ba)])
    biz_state = state_with_code(biz.get("state"))
    sign = logo_to_data_uri(biz.get("signature") or "")
    qr = _qr_data_uri(inv.get("verify_url") or
                      f"Invoice No: {p1.get('number')} | Amount: INR {p1.get('subtotal', 0):.2f}")
    brand = _brand_html(biz, logo, _esc)

    def to_block(no_label, no_val):
        return f"""
        <table class="parties"><tr>
          <td class="pl"><div class="lbl">To</div>
            <div class="nm">{_esc(cust.get("name") or "Customer")}</div>
            <div class="row"><b>Delivery Address:</b> {_esc(cust.get("address") or "—")}</div>
            <div class="row"><b>State Name &amp; Code:</b> {_esc(g.get("customer_state") or "—")}</div>
            <div class="row"><b>Place of Supply:</b> {_esc(g.get("place_of_supply") or "—")}</div>
          </td>
          <td class="pr">
            <div class="row"><b>{no_label}:</b> {_esc(no_val)}</div>
            <div class="row"><b>Date:</b> {_esc(date)}</div>
            <div class="row"><b>Booking ID:</b> {_esc(inv.get("booking_code") or "")}</div>
          </td>
        </tr></table>"""

    def items_table(p, tax_rows):
        return f"""
        <table class="items">
          <thead><tr><th class="l">Items</th><th>Gross Amount</th><th>Amount</th></tr></thead>
          <tbody><tr><td class="l">{_esc(p.get("desc"))}<div class="sac">SAC: {_esc(p.get("sac"))}</div></td>
            <td>{m(p.get("gross"))}</td><td>{m(p.get("gross"))}</td></tr></tbody>
        </table>
        <table class="tot">
          <tr><td>Discount</td><td>{m(p.get("discount"))}</td></tr>
          {tax_rows}
          <tr class="grand"><td>Subtotal</td><td>{m(p.get("subtotal"))}</td></tr>
        </table>
        <div class="words"><b>Amount in words:</b> {_esc(amount_in_words(p.get("subtotal")))}</div>"""

    tax_rows = f"""
          <tr><td>CGST @{p1.get("cgst_pct", 9):g}%</td><td>{m(p1.get("cgst"))}</td></tr>
          <tr><td>SGST @{p1.get("sgst_pct", 9):g}%</td><td>{m(p1.get("sgst"))}</td></tr>
          <tr><td>Total Tax</td><td>{m(p1.get("total_tax"))}</td></tr>"""

    gstin_row = f'<div class="row"><b>Business GST:</b> {_esc(biz.get("gst"))}</div>' if biz.get("gst") else ""
    legal = biz.get("legal_name") or biz.get("name") or ""
    signatory = biz.get("signatory_name") or ""
    page1 = f"""
    <div class="page" data-testid="gst-invoice-page-platform">
      <table class="hd"><tr><td>{brand}</td><td class="ttl">{"TAX INVOICE (CANCELLATION FEE)" if g.get("kind") == "cancellation" else "TAX INVOICE"}</td></tr></table>
      {to_block("Invoice No.", p1.get("number"))}
      <div class="from"><div class="lbl">From</div>
        <div class="nm">{_esc(legal)}</div>{gstin_row}
        <div class="row"><b>Address:</b> {_esc(biz_addr or "—")}</div>
        <div class="row"><b>State Name &amp; Code:</b> {_esc(biz_state or "—")}</div>
      </div>
      {items_table(p1, tax_rows)}
      <table class="foot"><tr>
        <td class="qr">{f'<img src="{qr}"/>' if qr else ''}<div>Scan to verify</div></td>
        <td class="sg">{f'<img src="{sign}"/>' if sign else '<div class="sgspace"></div>'}
          {f'<div class="sgn">{_esc(signatory)}</div>' if signatory else ''}
          <div>Signature of supplier/authorized representative</div></td>
      </tr></table>
      <div class="note">*Reverse Charge mechanism not applicable</div>
      <div class="paid" data-testid="gst-invoice-grand-total">Total amount paid by customer: <b>{m(g.get("grand_total"))}</b>
        &nbsp;(Tax Invoice {m(p1.get("subtotal"))} + Partner Receipt {m(p2.get("subtotal"))})</div>
    </div>"""

    page2 = f"""
    <div class="page brk" data-testid="gst-invoice-page-partner">
      <table class="hd"><tr><td>{brand}</td><td class="ttl">RECEIPT (PARTNER RECEIPT)</td></tr></table>
      {to_block("Receipt No.", p2.get("number"))}
      <div class="from"><div class="lbl">From</div>
        <div class="nm">{_esc(p2.get("name"))}</div>
        <div class="row"><b>Address:</b> {_esc(p2.get("address") or "—")}</div>
        <div class="row"><b>State Name &amp; Code:</b> {_esc(p2.get("state") or "—")}</div>
      </div>
      {items_table(p2, "")}
      <div class="note">Service provided by the independent service partner. Collected by {_esc(biz.get("name") or "the platform")} on behalf of the partner.</div>
    </div>"""

    return f"""<!doctype html><html><head><meta charset="utf-8"/><title>{_esc(p1.get("number"))}</title>
<style>{_css(ac)}</style></head><body data-testid="gst-invoice">{page1}{page2}</body></html>"""


def _brand_html(biz: dict, logo: str, esc) -> str:
    """Admin Branding logo when available; the text wordmark ONLY as a fallback."""
    if logo:
        return f'<img class="logo" src="{logo}" alt="{esc(biz.get("name") or "logo")}"/>'
    return f'<span class="bname">{esc(biz.get("name") or "AzoApp")}</span>'


def _css(ac: str) -> str:
    from services.invoice_html_service import _font_b64
    fr, fb = _font_b64("regular"), _font_b64("bold")
    fonts = (f"@font-face{{font-family:'Inv';src:url(data:font/ttf;base64,{fr});}}"
             f"@font-face{{font-family:'Inv';font-weight:bold;src:url(data:font/ttf;base64,{fb});}}") if fr else ""
    return fonts + f"""
@page {{ size: A4; margin: 14mm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: 'Inv', Helvetica, Arial, sans-serif; color:#111827; font-size:11px; margin:0; background:#fff; }}
.page {{ width:100%; max-width:182mm; margin:0 auto; padding:4mm 0; }}
.brk {{ page-break-before: always; break-before: page; border-top:1px dashed #cbd5e1; margin-top:8mm; padding-top:8mm; }}
@media print {{ .brk {{ border-top:none; margin-top:0; padding-top:4mm; }} }}
table {{ width:100%; border-collapse:collapse; }}
.hd td {{ vertical-align:middle; padding-bottom:10px; border-bottom:3px solid {ac}; }}
.logo {{ height:40px; max-width:200px; object-fit:contain; vertical-align:middle; }}
.bname {{ font-size:18px; font-weight:bold; vertical-align:middle; }}
.ttl {{ text-align:right; font-size:15px; font-weight:bold; letter-spacing:.5px; color:{ac}; }}
.parties td {{ vertical-align:top; padding:12px 0 8px; }}
.pl {{ width:62%; padding-right:14px !important; }}
.pr {{ text-align:right; }}
.lbl {{ font-size:10px; text-transform:uppercase; color:#6b7280; letter-spacing:1px; margin-bottom:3px; }}
.nm {{ font-size:13px; font-weight:bold; margin-bottom:3px; }}
.row {{ margin:2px 0; line-height:1.45; }}
.from {{ border-top:1px solid #e5e7eb; padding:10px 0 12px; }}
.items th {{ background:#f3f4f6; text-align:right; padding:8px; font-size:10.5px; border-top:1px solid #d1d5db; border-bottom:1px solid #d1d5db; }}
.items td {{ text-align:right; padding:10px 8px; border-bottom:1px solid #e5e7eb; vertical-align:top; }}
.items .l {{ text-align:left; }}
.sac {{ color:#6b7280; font-size:10px; margin-top:2px; }}
.tot {{ width:55%; margin-left:45%; margin-top:6px; }}
.tot td {{ padding:5px 8px; text-align:right; }}
.tot td:first-child {{ text-align:left; color:#374151; }}
.tot .grand td {{ font-weight:bold; font-size:13px; border-top:2px solid #111827; padding-top:8px; }}
.words {{ margin-top:10px; font-size:10.5px; color:#374151; }}
.foot {{ margin-top:22px; }}
.foot td {{ vertical-align:bottom; }}
.qr {{ width:40%; font-size:10px; color:#374151; }}
.qr img {{ width:92px; height:92px; display:block; margin-bottom:3px; }}
.sg {{ text-align:right; font-size:10px; color:#374151; }}
.sg img {{ max-height:56px; max-width:170px; display:inline-block; margin-bottom:3px; }}
.sgspace {{ height:46px; }}
.sgn {{ font-weight:bold; font-size:11px; color:#111827; }}
.paid {{ margin-top:10px; padding:8px 10px; background:#f8fafc; border:1px solid #e5e7eb; font-size:10.5px; }}
.note {{ margin-top:12px; font-size:10px; color:#6b7280; }}
"""


def build_partner_html(inv: dict) -> str:
    """Partner copy in the SAME layout as the customer invoice. Amount = only what
    the partner actually earned (role_earning.net) — no customer total / platform fees."""
    from services.invoice_html_service import _esc, _money, _fmt_date, logo_to_data_uri, resolve_theme
    biz = inv.get("business_snapshot") or {}
    re_ = inv.get("role_earning") or {}
    party = inv.get("bill_to") or inv.get("partner_snapshot") or {}
    meta = inv.get("partner_meta") or {}
    cur = inv.get("currency") or "INR"
    ac = biz.get("accent") or resolve_theme(biz.get("theme_key"))["accent"]
    logo = logo_to_data_uri(biz.get("logo") or "")
    m = lambda v: _money(v, cur)  # noqa: E731
    canc = bool(re_.get("is_cancellation")) or inv.get("invoice_type") == "cancellation"
    net = round(float(re_.get("net") or 0), 2)
    category = meta.get("category") or inv.get("category_name") or inv.get("service_name") or \
        ((inv.get("line_items") or [{}])[0].get("desc") or "Services")
    desc = f"{'Cancellation Earning' if canc else 'Service Earning'} - {category}"
    _ba = biz.get("address") or ""
    biz_addr = ", ".join([x for x in [_ba] + [biz.get(k) for k in ("city", "zip")] if x and (x == _ba or str(x) not in _ba)])
    legal = biz.get("legal_name") or biz.get("name") or ""
    gstin_row = f'<div class="row"><b>Business GST:</b> {_esc(biz.get("gst"))}</div>' if biz.get("gst") else ""
    sign = logo_to_data_uri(biz.get("signature") or "")
    signatory = biz.get("signatory_name") or ""
    p_state = meta.get("state") or state_with_code(party.get("state"))
    title = "PARTNER INVOICE (CANCELLATION)" if canc else "PARTNER INVOICE"
    coupon = (f'<div class="note">{_esc(re_.get("coupon_note"))}</div>' if re_.get("coupon_note") else "")
    page = f"""
    <div class="page" data-testid="partner-invoice-page">
      <table class="hd"><tr><td>{_brand_html(biz, logo, _esc)}</td><td class="ttl">{title}</td></tr></table>
      <table class="parties"><tr>
        <td class="pl"><div class="lbl">To</div>
          <div class="nm">{_esc(party.get("name") or "Service Partner")}</div>
          <div class="row"><b>Address:</b> {_esc(party.get("address") or "—")}</div>
          <div class="row"><b>State Name &amp; Code:</b> {_esc(p_state or "—")}</div>
          {f'<div class="row"><b>Phone:</b> {_esc(party.get("phone"))}</div>' if party.get("phone") else ""}
        </td>
        <td class="pr">
          <div class="row"><b>Invoice No.:</b> {_esc(inv.get("invoice_number") or "")}</div>
          <div class="row"><b>Date:</b> {_esc(_fmt_date(inv.get("issue_date") or inv.get("created_at")))}</div>
          <div class="row"><b>Booking ID:</b> {_esc(inv.get("booking_code") or "")}</div>
        </td>
      </tr></table>
      <div class="from"><div class="lbl">From</div>
        <div class="nm">{_esc(legal)}</div>{gstin_row}
        <div class="row"><b>Address:</b> {_esc(biz_addr or "—")}</div>
        <div class="row"><b>State Name &amp; Code:</b> {_esc(state_with_code(biz.get("state")) or "—")}</div>
      </div>
      <table class="items">
        <thead><tr><th class="l">Items</th><th>Gross Amount</th><th>Amount</th></tr></thead>
        <tbody><tr><td class="l">{_esc(desc)}</td><td>{m(net)}</td><td>{m(net)}</td></tr></tbody>
      </table>
      <table class="tot">
        <tr><td>Discount</td><td>{m(0)}</td></tr>
        <tr class="grand" data-testid="partner-invoice-total"><td>Total Earning</td><td>{m(net)}</td></tr>
      </table>
      <div class="words"><b>Amount in words:</b> {_esc(amount_in_words(net))}</div>
      <table class="foot"><tr>
        <td class="qr"></td>
        <td class="sg">{f'<img src="{sign}"/>' if sign else '<div class="sgspace"></div>'}
          {f'<div class="sgn">{_esc(signatory)}</div>' if signatory else ''}
          <div>Signature of authorized representative</div></td>
      </tr></table>
      {coupon}
      <div class="note">This is the amount earned by you (the service partner) for this booking.</div>
    </div>"""
    return f"""<!doctype html><html><head><meta charset="utf-8"/><title>{_esc(inv.get("invoice_number") or "Invoice")}</title>
<style>{_css(ac)}</style></head><body data-testid="partner-invoice">{page}</body></html>"""
