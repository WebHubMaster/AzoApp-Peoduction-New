"""
Invoice engine — generates & serves professional financial documents for
bookings, transactions and withdrawals. Idempotent (no duplicate invoices),
sequential invoice numbers, and immutable business/customer/merchant snapshots
so historical invoices never change appearance when config later changes.
"""
from datetime import datetime, timezone
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from config.database import db, get_settings, now_iso
from services.invoice_html_service import resolve_theme, DEFAULT_THEME
from services.engines import PricingEngine
from services.money import TAX_LABEL
import uuid
import re


def _uid():
    return str(uuid.uuid4())


# ---------------------------------------------------------------- number gen
async def next_invoice_number(settings: dict) -> str:
    icfg = settings.get("invoice_config") or {}
    prefix = (icfg.get("prefix") or "INV").strip() or "INV"
    pad = int(icfg.get("pad") or 6)
    start = int(icfg.get("start_number") or 1)
    year = datetime.now(timezone.utc).year
    key = f"{prefix}-{year}"
    res = await db.invoice_counters.find_one_and_update(
        {"_id": key},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    n = start - 1 + int(res["seq"])
    return f"{prefix}-{year}-{str(n).zfill(pad)}"


# ---------------------------------------------------------------- snapshots
def business_snapshot(settings: dict) -> dict:
    b = settings.get("branding") or {}
    icfg = settings.get("invoice_config") or {}
    gen = settings.get("general") or {}
    return {
        "name": icfg.get("business_name") or b.get("site_name") or "AzoApp",
        "legal_name": icfg.get("legal_name") or "",
        "logo": b.get("email_logo") or b.get("logo_light") or b.get("logo_dark") or "",
        "tagline": b.get("tagline") or "",
        "email": icfg.get("email") or b.get("email") or gen.get("support_email") or "",
        "phone": icfg.get("phone") or b.get("phone") or gen.get("support_phone") or "",
        "website": icfg.get("website") or "",
        "address": icfg.get("address") or b.get("address") or gen.get("company_address") or "",
        "city": icfg.get("city") or "",
        "state": icfg.get("state") or "",
        "country": icfg.get("country") or "India",
        "zip": icfg.get("zip") or "",
        "gst": icfg.get("gst_number") or "",
        "tax_id": icfg.get("tax_id") or "",
        "pan": icfg.get("pan") or "",
        "cin": icfg.get("cin") or "",
        "footer": icfg.get("footer_text") or "",
        "terms": icfg.get("terms") or "",
        "refund_policy": icfg.get("refund_policy") or "",
        "support": icfg.get("support_contact") or gen.get("support_email") or "",
        "payment_terms": icfg.get("payment_terms") or "Due on receipt",
        "tax_label": TAX_LABEL,
        "currency": settings.get("currency") or "INR",
        # premium invoice theme (accent colour + letterhead style)
        "theme_key": icfg.get("invoice_theme") or DEFAULT_THEME,
        "accent": resolve_theme(icfg.get("invoice_theme")).get("accent"),
        "accent_dark": resolve_theme(icfg.get("invoice_theme")).get("accent_dark"),
        "letterhead": icfg.get("letterhead") or "classic",
    }


def _addr_str(a: dict) -> str:
    if not a:
        return ""
    parts = [a.get("line"), a.get("city"), a.get("state"), a.get("pincode") or a.get("zip")]
    return ", ".join([p for p in parts if p])


async def _user(uid):
    if not uid:
        return {}
    return await db.users.find_one({"id": uid}, {"_id": 0}) or {}


# ---------------------------------------------------------------- booking invoice
async def ensure_booking_invoice(booking: dict, settings: dict = None):
    """Idempotent. Creates a booking/cancellation invoice for a terminal booking."""
    settings = settings or await get_settings()
    status = booking.get("status")
    if status in ("completed", "paid"):
        itype = "booking"
        pay_status = "paid"
    elif status == "cancelled":
        itype = "cancellation"
        # Cancellation / Adjustment is a CREDIT-NOTE for the cancelled service — the
        # actual money returned is recorded on the separate Refund Receipt, so this
        # document is marked 'cancelled' (NOT 'refunded') to avoid double-counting.
        pay_status = "cancelled"
    else:
        return None  # in-progress bookings get no invoice yet

    existing = await db.invoices.find_one(
        {"booking_id": booking["id"], "invoice_type": itype}, {"_id": 0}
    )
    if existing:
        return existing

    pr = booking.get("pricing") or {}
    cust = await _user(booking.get("customer_id"))
    merch = await _user(booking.get("merchant_id")) if booking.get("merchant_id") else {}
    partner = await _user(booking.get("partner_id")) if booking.get("partner_id") else {}

    # Invoice subtotal = the pure service portion (service + emergency + surge); the
    # visiting charge is shown once under fees (it is untaxed), so the breakdown
    # subtotal + fees + tax - discount reconciles exactly with the stored total.
    subtotal = float(pr.get("subtotal") or pr.get("base") or 0) - float(pr.get("visiting_charge") or 0)
    tax = float(pr.get("gst") or 0)
    discount = float(pr.get("total_discount") if pr.get("total_discount") is not None else pr.get("discount") or 0)
    fees = float(pr.get("convenience_fee") or 0) + float(pr.get("platform_fee") or 0) + float(pr.get("visiting_charge") or 0)
    total = float(pr.get("total") or (subtotal + tax + fees - discount))
    # Taxable Amount (spec #3 — shown on the document): the portion GST is charged on =
    # service + emergency + surge + convenience + platform fee, EXCLUDING the untaxed
    # visiting charge. Prefer the stored value; fall back for legacy invoices.
    taxable_amt = pr.get("taxable")
    if taxable_amt is None:
        taxable_amt = round(subtotal + float(pr.get("convenience_fee") or 0) + float(pr.get("platform_fee") or 0), 2)
    else:
        taxable_amt = round(float(taxable_amt), 2)

    comm = settings.get("commission") or {}
    base_c = float(pr.get("commissionable_base") or subtotal)
    platform_commission = round(base_c * float(comm.get("platform_pct") or 0) / 100, 2)

    # line items — itemise every service + its add-ons (Tax-EXCLUDED) for a clear,
    # category-wise bill. Grouped multi-service bookings carry booking["items"];
    # single-service bookings fall back to the pricing base + top-level add-ons.
    # Every line item carries BOTH a per-unit `rate` and the extended `amount`
    # (= rate x qty) so the document renders "Qty x Rate = Amount" correctly with
    # NO double counting. Backend is the single source of truth for these numbers.
    items = []
    b_items = booking.get("items") or []
    if b_items:
        for it in b_items:
            iqty = max(1, int(it.get("qty", 1) or 1))
            it_addons = it.get("addons") or []
            base_unit = it.get("base_price")
            if base_unit is None:
                base_unit = float(it.get("unit_service_value") or 0) - sum(
                    float(a.get("price") or 0) * int(a.get("qty", 1) or 1) for a in it_addons)
            unit_rate = round(float(base_unit or 0), 2)
            items.append({"desc": it.get("service_name") or it.get("name") or "Service",
                          "detail": booking.get("category_name") or "", "qty": iqty,
                          "rate": unit_rate, "amount": round(unit_rate * iqty, 2)})
            for a in it_addons:
                # Add-on quantity is INDEPENDENT — priced at add-on qty, NOT main qty.
                a_qty = max(1, int(a.get("qty", 1) or 1))
                a_rate = round(float(a.get("price") or 0), 2)
                items.append({"desc": "+ " + (a.get("name") or "Add-on"), "detail": "Add-on",
                              "qty": a_qty, "rate": a_rate, "amount": round(a_rate * a_qty, 2)})
    else:
        if pr.get("base"):
            _b = round(float(pr.get("base") or 0), 2)
            items.append({"desc": booking.get("service_name") or "Service",
                          "detail": booking.get("category_name") or "", "qty": 1,
                          "rate": _b, "amount": _b})
        for ad in (booking.get("addons") or []):
            _ar = round(float(ad.get("price") or ad.get("amount") or 0), 2)
            items.append({"desc": "+ " + (ad.get("name") or "Add-on"), "detail": "Add-on", "qty": 1,
                          "rate": _ar, "amount": _ar})
    if pr.get("emergency_fee"):
        _e = round(float(pr.get("emergency_fee")), 2)
        items.append({"desc": "Emergency / Urgent service", "detail": "", "qty": 1,
                      "rate": _e, "amount": _e})
    if pr.get("surge"):
        _s = round(float(pr.get("surge")), 2)
        items.append({"desc": "Surge charge", "detail": pr.get("surge_rule") or "", "qty": 1,
                      "rate": _s, "amount": _s})
    if not items:
        _st = round(subtotal, 2)
        items.append({"desc": booking.get("service_name") or "Service", "detail": "", "qty": 1,
                      "rate": _st, "amount": _st})

    canc = booking.get("cancellation") or {}
    refund_amt = 0.0
    total_amount = round(total, 2)
    canc_fields = {}
    if itype == "cancellation":
        # Use the AUTHORITATIVE amounts computed at cancellation time so the document
        # always matches the actual refund (no recompute drift).
        refund_pct = float(canc.get("refund_pct") if canc.get("refund_pct") is not None
                           else (comm.get("customer_refund_pct") or 0))
        refund_amt = round(float(canc.get("refund") if canc.get("refund") is not None
                                 else total * refund_pct / 100), 2)
        cancel_charge = round(float(canc.get("cancel_charge") or 0), 2)
        original_amount = round(float(canc.get("original_amount") or total), 2)
        # This credit-note's headline = the ORIGINAL booking value being cancelled;
        # the refund amount is shown as a line + carried on the Refund Receipt.
        total_amount = original_amount
        canc_fields = {
            "document_label": "Cancellation / Adjustment",
            "original_amount": original_amount,
            "refund_amount": refund_amt,
            "cancellation_pct": round(refund_pct, 2),
            "partner_cancellation_pct": round(float(canc.get("partner_cancellation_pct") or 0), 2),
            "partner_cancellation_amount": cancel_charge,
            "service_refund": round(float(canc.get("service_refund") or 0), 2),
            "gst_refund": round(float(canc.get("gst_refund") or 0), 2),
            "retained_amount": round(original_amount - refund_amt, 2),
            "partner_was_assigned": bool(canc.get("partner_was_assigned")),
            "item_refunds": canc.get("item_refunds") or [],
        }

    txn = await db.transactions.find_one(
        {"kind": "booking_payment", "note": {"$regex": booking.get("code", "")}}, {"_id": 0}
    ) if booking.get("code") else None

    inv = {
        "id": _uid(),
        "invoice_number": await next_invoice_number(settings),
        "invoice_type": itype,
        "booking_id": booking["id"],
        "booking_code": booking.get("code") or "",
        "booking_date": booking.get("created_at") or "",
        "booking_status": status,
        "transaction_id": (txn or {}).get("id") or "",
        "withdrawal_id": "",
        "customer_id": booking.get("customer_id") or "",
        "merchant_id": booking.get("merchant_id") or "",
        "partner_id": booking.get("partner_id") or "",
        "status": "issued" if itype == "booking" else "cancelled",
        "payment_status": pay_status,
        "payment_method": "Online" if status in ("paid", "completed") else "—",
        "currency": settings.get("currency") or "INR",
        "line_items": items,
        # Canonical breakdown (single source of truth) — the PDF/HTML render the
        # Service Amount / additional charges / tax from THIS so nothing is folded
        # or double-counted (Service Amount never includes emergency/surge/visiting).
        "breakdown": PricingEngine.build_breakdown(booking, settings),
        "subtotal": round(subtotal, 2),
        "taxable": taxable_amt,
        "discount": round(discount, 2),
        "tax": round(tax, 2),
        "tax_label": TAX_LABEL,
        "fees": round(fees, 2),
        "visiting_charge": round(float(pr.get("visiting_charge") or 0), 2),
        "commission": platform_commission,
        "commission_pct": round(float(comm.get("platform_pct") or 0), 2),
        "commission_base": round(base_c, 2),
        "refund": refund_amt,
        "total_amount": total_amount,
        "document_label": "Tax Invoice" if itype == "booking" else "Cancellation / Adjustment",
        "dedupe_key": f"booking:{booking['id']}:{itype}",
        "service_name": booking.get("service_name") or "",
        "customer_snapshot": {
            "name": booking.get("customer_name") or cust.get("name") or "Customer",
            "email": cust.get("email") or "",
            "phone": booking.get("customer_phone") or cust.get("phone") or "",
            "address": _addr_str(booking.get("address") or cust.get("address")),
        },
        "merchant_snapshot": {
            "name": (merch.get("shop_name") or merch.get("name") or booking.get("merchant_name") or "") if merch else "",
            "business": merch.get("shop_name") or "" if merch else "",
            "email": merch.get("email") or "" if merch else "",
            "phone": merch.get("phone") or "" if merch else "",
        },
        "partner_snapshot": {
            "name": (partner.get("name") or booking.get("partner_name") or "") if partner else "",
            "email": partner.get("email") or "" if partner else "",
            "phone": partner.get("phone") or "" if partner else "",
        },
        "business_snapshot": business_snapshot(settings),
        "notes": booking.get("notes") or "",
        "issue_date": booking.get("updated_at") or booking.get("created_at") or now_iso(),
        "sort_rank": _SORT_RANK.get(itype, 1),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    inv.update(canc_fields)
    try:
        await db.invoices.insert_one(dict(inv))
    except DuplicateKeyError:
        # A concurrent request / retry already created it — return the existing one
        # (idempotent; no duplicate invoice is ever produced).
        return await db.invoices.find_one(
            {"booking_id": booking["id"], "invoice_type": itype}, {"_id": 0})
    inv.pop("_id", None)
    # Auto-email invoices the moment a booking invoice is generated:
    #   • CUSTOMER  → the customer-facing invoice (all customer-visible charges)
    #   • PARTNER   → a partner-facing invoice with the 100%-platform Convenience &
    #                 Platform fees REMOVED (partners/merchants must never see them)
    # Idempotent per-party (emailed_at / partner_emailed_at) so no duplicate emails.
    if itype == "booking":
        # Emailing sends a PDF over SMTP to up to two parties — a slow external
        # round-trip. Fire it in the BACKGROUND so invoice generation (and any
        # caller like job-completion) returns instantly instead of blocking on SMTP.
        import asyncio as _aio

        async def _email_bg(_inv):
            try:
                await email_invoice_parties(_inv)
            except Exception as _e:  # noqa: BLE001
                import logging
                logging.getLogger("azoapp.email").error(
                    "Auto-email of invoice %s failed: %r", _inv.get("invoice_number"), _e, exc_info=True)
        try:
            _aio.create_task(_email_bg(inv))
        except RuntimeError:
            # No running loop (e.g. sync script) — fall back to inline send.
            try:
                await email_invoice_parties(inv)
            except Exception as _e:  # noqa: BLE001
                import logging
                logging.getLogger("azoapp.email").error(
                    "Inline auto-email of invoice %s failed: %r", inv.get("invoice_number"), _e, exc_info=True)
    return inv


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _valid_email(e) -> bool:
    """Basic RFC-ish validation so we never attempt an unsafe send to a blank/garbage address."""
    return bool(e and _EMAIL_RE.match(str(e).strip()))


def _partner_facing_invoice(inv: dict) -> dict:
    """Return a COPY of the invoice with the 100%-platform Convenience/Platform fees
    stripped from the canonical breakdown so a partner/merchant NEVER sees them."""
    doc = dict(inv)
    bd = inv.get("breakdown") or {}
    if bd:
        stripped = PricingEngine.strip_platform_fees_breakdown(bd)
        doc["breakdown"] = stripped
        if stripped.get("total") is not None:
            doc["total_amount"] = stripped.get("total")
    return doc


async def email_invoice(inv: dict, to_email: str = None, audience: str = "customer") -> dict:
    """Send the invoice as a PDF attachment to ONE recipient.

    audience='customer'          → customer-facing invoice (unchanged breakdown)
    audience='partner'/'merchant'→ provider-facing invoice with platform-only fees stripped

    The recipient is resolved from the matching snapshot so the WRONG template is never
    sent to the WRONG party. Returns the email_service result dict. Never throws."""
    from services.email_service import send_email
    from services.invoice_pdf_service import build_invoice_pdf
    snap = (inv.get("partner_snapshot") if audience == "partner"
            else inv.get("merchant_snapshot") if audience == "merchant"
            else inv.get("customer_snapshot")) or {}
    to = to_email or snap.get("email")
    if not _valid_email(to):
        return {"ok": False, "skipped": "no_email"}
    biz = inv.get("business_snapshot") or {}
    who = snap.get("name") or audience.title()
    doc = _partner_facing_invoice(inv) if audience in ("partner", "merchant") else inv
    # BILL TO on the emailed PDF must match the recipient (partner/merchant/customer).
    doc = await _attach_bill_to(doc, audience)
    pdf = build_invoice_pdf(doc)
    intro = ("Aapki service ka invoice is email ke saath PDF me attach kiya gaya hai."
             if audience == "customer"
             else "Aapke service ka invoice (partner copy) is email ke saath PDF me attach kiya gaya hai.")
    subject = f"Invoice {inv.get('invoice_number')} — {biz.get('name', 'AzoApp')}"
    html = (
        f"<h2>Invoice {inv.get('invoice_number')}</h2>"
        f"<p>Namaste {who},</p>"
        f"<p>{intro}</p>"
        f"<p><b>Amount: {doc.get('currency', 'INR')} {doc.get('total_amount')}</b><br/>"
        f"Status: {doc.get('payment_status', '')}</p>"
        f"<p>Dhanyavaad,<br/>{biz.get('name', 'AzoApp')}</p>"
    )
    return await send_email(to, subject, html, attachments=[(f"{inv.get('invoice_number')}.pdf", pdf, "pdf")])


async def email_invoice_parties(inv: dict) -> dict:
    """Email the invoice to BOTH parties — each their OWN template — only when a valid
    email exists for that party, and NEVER twice (per-party emailed_at guards).
    Missing/invalid email simply skips that party; it never blocks invoice creation."""
    results = {}
    cust_email = (inv.get("customer_snapshot") or {}).get("email")
    if _valid_email(cust_email) and not inv.get("emailed_at"):
        r = await email_invoice(inv, audience="customer")
        results["customer"] = r
        if r.get("ok"):
            inv["emailed_at"] = now_iso()
            await db.invoices.update_one({"id": inv["id"]}, {"$set": {"emailed_at": inv["emailed_at"]}})
    partner_email = (inv.get("partner_snapshot") or {}).get("email")
    if _valid_email(partner_email) and not inv.get("partner_emailed_at"):
        r = await email_invoice(inv, audience="partner")
        results["partner"] = r
        if r.get("ok"):
            inv["partner_emailed_at"] = now_iso()
            await db.invoices.update_one({"id": inv["id"]}, {"$set": {"partner_emailed_at": inv["partner_emailed_at"]}})
    return results
_TXN_KIND_LABEL = {
    "booking_payment": ("Payment", "paid"),
    "refund": ("Refund", "refunded"),
    "booking_refund": ("Refund", "refunded"),
    "commission": ("Commission", "settled"),
    "withdrawal": ("Withdrawal", "processing"),
    "settlement": ("Settlement", "settled"),
    "fee": ("Fee", "charged"),
    "adjustment": ("Adjustment", "settled"),
    "cancellation": ("Cancellation", "charged"),
    "earning": ("Earnings", "credited"),
}

# Booking-linked & internal ledger movements that must NOT spawn a standalone
# "Transaction" invoice (they are already covered by the booking Service Invoice /
# Cancellation-Adjustment document + the refund record). This is what previously
# produced the confusing duplicate documents on a cancellation.
_TXN_SKIP_KINDS = {
    "booking_payment", "refund", "booking_refund", "commission", "earning",
    "settlement", "cancellation", "cancellation_comp", "adjustment", "fee",
    "incentive", "bonus", "cashback", "streak_bonus", "payout", "withdrawal",
}

_INDEXES_READY = False

# Stable display precedence used as a deterministic tiebreaker in list_invoices so
# that, for the SAME event/instant, documents always appear in this order:
#   Booking → Cancellation → Refund → Transaction → Withdrawal
# In particular the Refund Receipt NEVER sorts above its Cancellation note.
_SORT_RANK = {"booking": 1, "cancellation": 2, "refund": 3, "transaction": 4, "withdrawal": 5}


async def ensure_indexes():
    """Create the unique indexes that make invoice generation IDEMPOTENT at the
    database level — the ultimate guard against duplicates from webhook retries,
    double-clicks, page reloads, cron re-runs or concurrent requests."""
    global _INDEXES_READY
    if _INDEXES_READY:
        return
    try:
        # One booking → at most one document per type (booking / cancellation).
        await db.invoices.create_index(
            [("booking_id", 1), ("invoice_type", 1)], unique=True, name="uniq_booking_type",
            partialFilterExpression={"booking_id": {"$gt": ""}})
        # One transaction → at most one transaction invoice.
        await db.invoices.create_index(
            [("transaction_id", 1)], unique=True, name="uniq_txn",
            partialFilterExpression={"transaction_id": {"$gt": ""}, "invoice_type": "transaction"})
        # One withdrawal → at most one withdrawal statement.
        await db.invoices.create_index(
            [("withdrawal_id", 1)], unique=True, name="uniq_wd",
            partialFilterExpression={"withdrawal_id": {"$gt": ""}})
        # One refund record → at most one Refund Receipt.
        await db.invoices.create_index(
            [("refund_id", 1)], unique=True, name="uniq_refund",
            partialFilterExpression={"refund_id": {"$gt": ""}, "invoice_type": "refund"})
        # Sequential invoice numbers are globally unique.
        await db.invoices.create_index([("invoice_number", 1)], unique=True, name="uniq_invnum")
        # Backfill the display-rank on any pre-existing documents so ordering is
        # deterministic for historical invoices too (idempotent, one-shot).
        for _t, _r in _SORT_RANK.items():
            await db.invoices.update_many(
                {"invoice_type": _t, "sort_rank": {"$exists": False}},
                {"$set": {"sort_rank": _r}})
        _INDEXES_READY = True
    except Exception:
        # Indexes may already exist (possibly non-unique from older data). Duplicate
        # data must be cleaned first (see scripts/dedupe_invoices.py); we still proceed
        # — the fast-path find_one checks keep things correct in the meantime.
        _INDEXES_READY = True



async def ensure_transaction_invoice(txn: dict, role_hint: str = None, settings: dict = None):
    settings = settings or await get_settings()
    # Booking-linked and internal ledger movements are ALREADY represented by the
    # booking Service Invoice / Cancellation-Adjustment document (and the refund record).
    # Generating a separate generic "Transaction" invoice for them created the confusing
    # duplicate documents (e.g. a "Cancellation" doc AND a "Transaction" refund doc for the
    # same event). We skip them here so every booking has exactly ONE primary document.
    if (txn.get("kind") or "") in _TXN_SKIP_KINDS:
        return None
    existing = await db.invoices.find_one(
        {"transaction_id": txn["id"], "invoice_type": "transaction"}, {"_id": 0}
    )
    if existing:
        return existing
    user = await _user(txn.get("user_id") or txn.get("partner_id") or txn.get("merchant_id"))
    role = user.get("role") or role_hint or "customer"
    label, pay = _TXN_KIND_LABEL.get(txn.get("kind"), (txn.get("kind", "Transaction").title(), "settled"))
    amount = round(float(txn.get("amount") or 0), 2)
    inv = {
        "id": _uid(),
        "invoice_number": await next_invoice_number(settings),
        "invoice_type": "transaction",
        "txn_kind": txn.get("kind") or "",
        "txn_label": label,
        "booking_id": "",
        "booking_code": "",
        "transaction_id": txn["id"],
        "dedupe_key": f"txn:{txn['id']}",
        "withdrawal_id": "",
        "customer_id": user["id"] if role == "customer" else "",
        "merchant_id": user["id"] if role == "merchant" else "",
        "partner_id": user["id"] if role == "partner" else "",
        "status": "issued",
        "payment_status": pay,
        "payment_method": txn.get("method") or "Wallet",
        "currency": settings.get("currency") or "INR",
        "line_items": [{"desc": txn.get("note") or label, "detail": label, "qty": 1, "amount": amount}],
        "subtotal": amount,
        "discount": 0,
        "tax": 0,
        "fees": 0,
        "commission": 0,
        "refund": amount if pay == "refunded" else 0,
        "total_amount": amount,
        "customer_snapshot": {
            "name": user.get("name") or "User", "email": user.get("email") or "",
            "phone": user.get("phone") or "", "address": "",
        } if role == "customer" else {},
        "merchant_snapshot": {"name": user.get("shop_name") or user.get("name") or "", "email": user.get("email") or "", "phone": user.get("phone") or ""} if role == "merchant" else {},
        "partner_snapshot": {"name": user.get("name") or "", "email": user.get("email") or "", "phone": user.get("phone") or ""} if role == "partner" else {},
        "business_snapshot": business_snapshot(settings),
        "notes": txn.get("note") or "",
        "issue_date": txn.get("created_at") or now_iso(),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    try:
        await db.invoices.insert_one(dict(inv))
    except DuplicateKeyError:
        return await db.invoices.find_one(
            {"transaction_id": txn["id"], "invoice_type": "transaction"}, {"_id": 0})
    inv.pop("_id", None)
    return inv


# ---------------------------------------------------------------- refund receipt
_REFUND_PAY_STATUS = {
    "processed": "refunded", "processing": "processing", "pending": "processing",
    "initiated": "processing", "failed": "failed",
}


async def ensure_refund_invoice(refund: dict, settings: dict = None):
    """Idempotent 'Refund Receipt' document sourced from the refunds collection — the
    customer-facing proof that money was returned. Distinct from the Cancellation /
    Adjustment credit-note (which records the cancelled service value)."""
    settings = settings or await get_settings()
    rid = refund.get("id")
    if not rid:
        return None
    existing = await db.invoices.find_one(
        {"refund_id": rid, "invoice_type": "refund"}, {"_id": 0})
    if existing:
        return existing
    amount = round(float(refund.get("refund_amount") or refund.get("amount") or 0), 2)
    if amount <= 0:
        return None
    cust = await _user(refund.get("customer_id"))
    method = (refund.get("method") or "").lower()
    if method in ("wallet",):
        method_label = "Wallet"
    elif method in ("source", "razorpay", "cashfree", "bank"):
        method_label = "Original payment method"
    else:
        method_label = "Refund"
    pay_status = _REFUND_PAY_STATUS.get((refund.get("status") or "").lower(), "processing")
    code = refund.get("booking_code") or ""
    # Anchor the Refund Receipt to the SAME issue instant as its Cancellation note
    # (generated a moment earlier in the same cancel flow) so the deterministic
    # sort_rank tiebreaker keeps Cancellation ABOVE Refund — never the reverse.
    sibling_date = None
    _bid = refund.get("booking_id") or ""
    if _bid:
        _sib = await db.invoices.find_one(
            {"booking_id": _bid, "invoice_type": "cancellation"}, {"_id": 0, "issue_date": 1})
        if _sib:
            sibling_date = _sib.get("issue_date")
    inv = {
        "id": _uid(),
        "invoice_number": await next_invoice_number(settings),
        "invoice_type": "refund",
        "document_label": "Refund Receipt",
        "refund_id": rid,
        "dedupe_key": f"refund:{rid}",
        "booking_id": refund.get("booking_id") or "",
        "booking_code": code,
        "transaction_id": "",
        "withdrawal_id": "",
        "customer_id": refund.get("customer_id") or "",
        "merchant_id": "",
        "partner_id": "",
        "status": "issued",
        "payment_status": pay_status,
        "payment_method": method_label,
        "currency": settings.get("currency") or "INR",
        "line_items": [{"desc": f"Refund for booking {code}".strip(),
                        "detail": refund.get("service_name") or "", "qty": 1, "amount": amount}],
        "subtotal": amount,
        "discount": 0,
        "tax": 0,
        "fees": 0,
        "commission": 0,
        "refund": amount,
        "refund_amount": amount,
        "refund_pct": refund.get("refund_pct"),
        "total_amount": amount,
        "service_name": refund.get("service_name") or "",
        "customer_snapshot": {
            "name": refund.get("customer_name") or cust.get("name") or "Customer",
            "email": cust.get("email") or "",
            "phone": refund.get("customer_phone") or cust.get("phone") or "",
            "address": "",
        },
        "merchant_snapshot": {},
        "partner_snapshot": {},
        "business_snapshot": business_snapshot(settings),
        "notes": refund.get("cancellation_reason") or "",
        "issue_date": sibling_date or refund.get("initiated_at") or refund.get("created_at") or now_iso(),
        "sort_rank": _SORT_RANK["refund"],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    try:
        await db.invoices.insert_one(dict(inv))
    except DuplicateKeyError:
        return await db.invoices.find_one(
            {"refund_id": rid, "invoice_type": "refund"}, {"_id": 0})
    inv.pop("_id", None)
    return inv



# ---------------------------------------------------------------- withdrawal statement
async def ensure_withdrawal_invoice(wd: dict, role: str, settings: dict = None):
    settings = settings or await get_settings()
    existing = await db.invoices.find_one(
        {"withdrawal_id": wd["id"], "invoice_type": "withdrawal"}, {"_id": 0}
    )
    if existing:
        return existing
    owner_id = wd.get("merchant_id") if role == "merchant" else wd.get("partner_id")
    user = await _user(owner_id)
    gross = round(float(wd.get("amount") or 0), 2)
    fee = round(float(wd.get("fee") or 0), 2)
    net = round(float(wd.get("net_amount") or (gross - fee)), 2)
    bank = wd.get("bank") or {}
    acct = bank.get("account_number") or ""
    masked = ("•••• " + acct[-4:]) if len(acct) >= 4 else (wd.get("upi_id") or "")
    status = wd.get("status") or "pending"
    inv = {
        "id": _uid(),
        "invoice_number": await next_invoice_number(settings),
        "invoice_type": "withdrawal",
        "booking_id": "",
        "booking_code": "",
        "transaction_id": "",
        "withdrawal_id": wd["id"],
        "dedupe_key": f"wd:{wd['id']}",
        "customer_id": "",
        "merchant_id": wd.get("merchant_id") or "" if role == "merchant" else "",
        "partner_id": wd.get("partner_id") or "" if role == "partner" else "",
        "status": status,
        "payment_status": "paid" if status == "completed" else status,
        "payment_method": (wd.get("method") or "bank").upper(),
        "currency": settings.get("currency") or "INR",
        "line_items": [{"desc": "Withdrawal / Settlement", "detail": (wd.get("method") or "").upper(), "qty": 1, "amount": gross}],
        "subtotal": gross,
        "discount": 0,
        "tax": 0,
        "fees": fee,
        "commission": 0,
        "refund": 0,
        "total_amount": net,
        "bank_masked": masked,
        "requested_at": wd.get("requested_at") or "",
        "processed_at": wd.get("processed_at") or "",
        "merchant_snapshot": {"name": user.get("shop_name") or user.get("name") or wd.get("merchant_name") or "", "business": user.get("shop_name") or "", "email": user.get("email") or "", "phone": user.get("phone") or ""} if role == "merchant" else {},
        "partner_snapshot": {"name": user.get("name") or wd.get("partner_name") or "", "email": user.get("email") or "", "phone": user.get("phone") or ""} if role == "partner" else {},
        "customer_snapshot": {},
        "business_snapshot": business_snapshot(settings),
        "notes": wd.get("reason") or "",
        "issue_date": wd.get("requested_at") or now_iso(),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    try:
        await db.invoices.insert_one(dict(inv))
    except DuplicateKeyError:
        return await db.invoices.find_one(
            {"withdrawal_id": wd["id"], "invoice_type": "withdrawal"}, {"_id": 0})
    inv.pop("_id", None)
    return inv


# ---------------------------------------------------------------- backfill / sync
async def sync_invoices(settings: dict = None):
    """Idempotently ensure invoices exist for all terminal financial events.
    Safe to call repeatedly; only missing invoices are created."""
    settings = settings or await get_settings()
    await ensure_indexes()
    # bookings (terminal states)
    bookings = await db.bookings.find(
        {"status": {"$in": ["completed", "paid", "cancelled"]}}, {"_id": 0}
    ).to_list(5000)
    for b in bookings:
        try:
            await ensure_booking_invoice(b, settings)
        except Exception:
            pass
    # transactions (booking-linked & internal kinds are skipped inside ensure_)
    txns = await db.transactions.find({}, {"_id": 0}).to_list(5000)
    for t in txns:
        try:
            await ensure_transaction_invoice(t, settings=settings)
        except Exception:
            pass
    # refund receipts (from the refunds collection)
    for r in await db.refunds.find({}, {"_id": 0}).to_list(5000):
        try:
            await ensure_refund_invoice(r, settings)
        except Exception:
            pass
    # merchant withdrawals
    for wd in await db.merchant_withdrawals.find({}, {"_id": 0}).to_list(5000):
        try:
            await ensure_withdrawal_invoice(wd, "merchant", settings)
        except Exception:
            pass
    # partner withdrawals
    for wd in await db.partner_withdrawals.find({}, {"_id": 0}).to_list(5000):
        try:
            await ensure_withdrawal_invoice(wd, "partner", settings)
        except Exception:
            pass


async def sync_invoices_for_user(user: dict, settings: dict = None):
    """Lightweight, idempotent backfill scoped to ONE user's own documents — used on
    the invoice LIST request so we never scan the whole DB (and never race) per page
    load. Admins fall back to the full sync."""
    settings = settings or await get_settings()
    await ensure_indexes()
    role = user.get("role")
    if role == "admin":
        return await sync_invoices(settings)
    uid = user["id"]
    if role == "customer":
        q = {"customer_id": uid, "status": {"$in": ["completed", "paid", "cancelled"]}}
    elif role == "partner":
        q = {"partner_id": uid, "status": {"$in": ["completed", "paid", "cancelled"]}}
    elif role == "merchant":
        q = {"merchant_id": uid, "status": {"$in": ["completed", "paid", "cancelled"]}}
    else:
        return
    for b in await db.bookings.find(q, {"_id": 0}).to_list(2000):
        try:
            await ensure_booking_invoice(b, settings)
        except Exception:
            pass
    # customer refund receipts
    if role == "customer":
        for r in await db.refunds.find({"customer_id": uid}, {"_id": 0}).to_list(2000):
            try:
                await ensure_refund_invoice(r, settings)
            except Exception:
                pass
    # partner/merchant withdrawal statements
    if role == "partner":
        for wd in await db.partner_withdrawals.find({"partner_id": uid}, {"_id": 0}).to_list(1000):
            try:
                await ensure_withdrawal_invoice(wd, "partner", settings)
            except Exception:
                pass
    elif role == "merchant":
        for wd in await db.merchant_withdrawals.find({"merchant_id": uid}, {"_id": 0}).to_list(1000):
            try:
                await ensure_withdrawal_invoice(wd, "merchant", settings)
            except Exception:
                pass


# ---------------------------------------------------------------- date helpers
def _range_bounds(range_key: str, date_from: str = None, date_to: str = None):
    """Return ISO (since, until) strings, or (None, None) for all."""
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    if range_key == "custom" and (date_from or date_to):
        since = (date_from + "T00:00:00+00:00") if date_from else None
        until = (date_to + "T23:59:59+00:00") if date_to else None
        return since, until
    if range_key == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat(), None
    if range_key == "yesterday":
        y = now - timedelta(days=1)
        s = y.replace(hour=0, minute=0, second=0, microsecond=0)
        e = y.replace(hour=23, minute=59, second=59, microsecond=0)
        return s.isoformat(), e.isoformat()
    days = {"7d": 7, "30d": 30, "this_month": now.day, "365d": 365, "this_year": now.timetuple().tm_yday}.get(range_key)
    if range_key == "last_month":
        first_this = now.replace(day=1)
        last_prev = first_this - timedelta(days=1)
        s = last_prev.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        e = last_prev.replace(hour=23, minute=59, second=59, microsecond=0)
        return s.isoformat(), e.isoformat()
    if days:
        return (now - timedelta(days=days)).isoformat(), None
    return None, None


# ---------------------------------------------------------------- list / query
def _build_query(user: dict, params: dict) -> dict:
    q = {}
    role = user["role"]
    if role == "customer":
        q["customer_id"] = user["id"]
    elif role == "merchant":
        q["merchant_id"] = user["id"]
    elif role == "partner":
        q["partner_id"] = user["id"]
    # admin: unscoped

    def _multi(v):
        # supports single value or comma-separated multi-select ("paid,pending")
        vals = [x.strip() for x in str(v).split(",") if x.strip() and x.strip() != "all"]
        if not vals:
            return None
        return vals[0] if len(vals) == 1 else {"$in": vals}

    if params.get("invoice_type") and params["invoice_type"] != "all":
        mv = _multi(params["invoice_type"])
        if mv is not None:
            q["invoice_type"] = mv
    if params.get("status") and params["status"] != "all":
        mv = _multi(params["status"])
        if mv is not None:
            q["status"] = mv
    if params.get("payment_status") and params["payment_status"] != "all":
        mv = _multi(params["payment_status"])
        if mv is not None:
            q["payment_status"] = mv
    if params.get("customer"):
        c = params["customer"]
        q["$and"] = q.get("$and", []) + [{"$or": [
            {"customer_snapshot.name": {"$regex": c, "$options": "i"}},
            {"customer_snapshot.phone": {"$regex": c, "$options": "i"}},
            {"customer_snapshot.mobile": {"$regex": c, "$options": "i"}},
        ]}]
    if params.get("booking_id"):
        q["$or"] = [{"booking_id": params["booking_id"]}, {"booking_code": {"$regex": params["booking_id"], "$options": "i"}}]
    if params.get("transaction_id"):
        q["transaction_id"] = params["transaction_id"]

    for k in ("customer_id", "merchant_id", "partner_id"):
        if role == "admin" and params.get(k):
            q[k] = params[k]

    since, until = _range_bounds(params.get("range") or "all", params.get("date_from"), params.get("date_to"))
    if since or until:
        d = {}
        if since:
            d["$gte"] = since
        if until:
            d["$lte"] = until
        q["issue_date"] = d

    amt = {}
    if params.get("min_amount") not in (None, ""):
        amt["$gte"] = float(params["min_amount"])
    if params.get("max_amount") not in (None, ""):
        amt["$lte"] = float(params["max_amount"])
    if amt:
        q["total_amount"] = amt

    if params.get("search"):
        s = params["search"]
        q["$or"] = q.get("$or", []) + [
            {"invoice_number": {"$regex": s, "$options": "i"}},
            {"booking_code": {"$regex": s, "$options": "i"}},
            {"reference_id": {"$regex": s, "$options": "i"}},
            {"transaction_id": {"$regex": s, "$options": "i"}},
            {"customer_snapshot.name": {"$regex": s, "$options": "i"}},
            {"customer_snapshot.mobile": {"$regex": s, "$options": "i"}},
            {"customer_snapshot.phone": {"$regex": s, "$options": "i"}},
            {"service_name": {"$regex": s, "$options": "i"}},
        ]
    return q


async def list_invoices(user: dict, params: dict):
    settings = await get_settings()
    await sync_invoices_for_user(user, settings)
    q = _build_query(user, params)

    page = max(1, int(params.get("page") or 1))
    size = min(100, max(1, int(params.get("page_size") or 15)))
    total = await db.invoices.count_documents(q)
    SORTS = {
        "newest": ("issue_date", -1), "oldest": ("issue_date", 1),
        "amount_high": ("total_amount", -1), "amount_low": ("total_amount", 1),
        "number": ("invoice_number", -1), "number_asc": ("invoice_number", 1),
        "customer": ("customer_snapshot.name", 1), "customer_desc": ("customer_snapshot.name", -1),
        "status": ("payment_status", 1), "status_desc": ("payment_status", -1),
    }
    sort_field, sort_dir = SORTS.get(params.get("sort") or "newest", ("issue_date", -1))
    # `sort_rank` is the deterministic secondary key: for documents sharing the same
    # issue instant (e.g. a Cancellation note + its Refund Receipt) it guarantees
    # Cancellation (rank 2) sorts before Refund (rank 3) in every sort mode.
    items = await db.invoices.find(q, {"_id": 0}).sort(
        [(sort_field, sort_dir), ("sort_rank", 1), ("issue_date", -1)]
    ).skip((page - 1) * size).limit(size).to_list(size)

    # #7/#14 — for Partner/Merchant, the LIST amount must be the amount ACTUALLY
    # credited to them (net of tax/platform fee/deductions), not the customer's gross
    # booking total. The detail/invoice breakdown stays exactly the same.
    role = user.get("role")
    for i in items:
        i["display_amount"] = i.get("total_amount")
        # A cancellation document's headline is the ORIGINAL order value (total order
        # amount) — the refund is already carried on the separate Refund Receipt, so we
        # do NOT repeat the refunded figure here.
        if i.get("invoice_type") == "cancellation":
            i["display_amount"] = round(float(i.get("original_amount") if i.get("original_amount") is not None
                                              else i.get("total_amount") or 0), 2)
    if role in ("partner", "merchant"):
        bids = [i.get("booking_id") for i in items if i.get("invoice_type") == "booking" and i.get("booking_id")]
        ledgers = {}
        if bids:
            async for l in db.commission_ledger.find({"booking_id": {"$in": bids}}, {"_id": 0}):
                ledgers[l["booking_id"]] = l
            # Legacy bookings with no ledger row → compute the split on the fly so the
            # partner/merchant list NEVER shows the customer's gross as their net.
            missing = [b for b in bids if b not in ledgers]
            if missing:
                from services.engines import CommissionEngine
                bkgs = {}
                async for b in db.bookings.find({"id": {"$in": missing}}, {"_id": 0}):
                    bkgs[b["id"]] = b
                pids = list({b.get("partner_id") for b in bkgs.values() if b.get("partner_id")})
                partners = {}
                if pids:
                    async for p in db.users.find({"id": {"$in": pids}},
                                                 {"_id": 0, "id": 1, "referred_by_merchant": 1}):
                        partners[p["id"]] = p
                for bid in missing:
                    b = bkgs.get(bid)
                    if b and (b.get("pricing") or {}).get("commissionable_base"):
                        ledgers[bid] = CommissionEngine.compute_split(b, settings, partners.get(b.get("partner_id")) or {})
        for i in items:
            if i.get("invoice_type") == "booking" and i.get("booking_id") in ledgers:
                l = ledgers[i["booking_id"]]
                if role == "partner":
                    i["display_amount"] = round(l.get("partner_total") if l.get("partner_total") is not None
                                                 else (float(l.get("partner_earning") or 0) + float(l.get("visiting_charge") or 0)), 2)
                else:
                    i["display_amount"] = round(float(l.get("merchant_referral") or 0) + float(l.get("merchant_customer") or 0), 2)

    # summary stats for the scoped query (ignoring pagination)
    all_scoped = await db.invoices.find(q, {"_id": 0, "total_amount": 1, "payment_status": 1, "invoice_type": 1, "commission": 1}).to_list(10000)
    type_counts, status_counts = {}, {}
    for i in all_scoped:
        type_counts[i.get("invoice_type") or "other"] = type_counts.get(i.get("invoice_type") or "other", 0) + 1
        status_counts[i.get("payment_status") or "unknown"] = status_counts.get(i.get("payment_status") or "unknown", 0) + 1
    summary = {
        "total_count": total,
        "total_amount": round(sum(i.get("total_amount", 0) for i in all_scoped), 2),
        "paid_amount": round(sum(i.get("total_amount", 0) for i in all_scoped if i.get("payment_status") == "paid"), 2),
        "paid_count": sum(1 for i in all_scoped if i.get("payment_status") == "paid"),
        "pending_amount": round(sum(i.get("total_amount", 0) for i in all_scoped if i.get("payment_status") in ("pending", "processing", "charged", "partially_paid")), 2),
        "pending_count": sum(1 for i in all_scoped if i.get("payment_status") in ("pending", "processing", "charged", "partially_paid")),
        "refunded_amount": round(sum(i.get("total_amount", 0) for i in all_scoped if i.get("payment_status") == "refunded"), 2),
        "refunded_count": sum(1 for i in all_scoped if i.get("payment_status") == "refunded"),
        "commission_amount": round(sum(i.get("commission", 0) or 0 for i in all_scoped), 2),
        "type_counts": type_counts,
        "status_counts": status_counts,
    }
    # Role-based field stripping on the LIST too (customer/partner/merchant each keep
    # only their own financial fields; admin keeps everything).
    items = [strip_for_role(_mask_customer_pii(i, role), role) for i in items]
    if role in ("customer", "partner", "merchant"):
        summary.pop("commission_amount", None)  # platform commission is platform/admin-only
    return {"items": items, "total": total, "page": page, "page_size": size,
            "pages": (total + size - 1) // size, "summary": summary}


async def fill_live_branding(inv: dict, force_theme: bool = True):
    """Prepare an invoice for rendering (preview / print / PDF):
      * backfill any missing business fields + logo from CURRENT settings
        (so an uploaded logo appears even on older invoices),
      * apply the LIVE invoice theme (accent colour + letterhead) so admins can
        switch the branded look per business and it reflects everywhere,
      * embed the logo as a self-contained data-URI (identical in preview & PDF).
    Amounts and parties are never touched.

    When ``force_theme`` is False (sample render endpoints), an accent/letterhead
    already supplied on the snapshot is respected so unsaved admin selections can
    be previewed live.
    """
    if not inv:
        return inv
    snap = dict(inv.get("business_snapshot") or {})
    live = business_snapshot(await get_settings())

    # Always use the CURRENT admin Branding logo on invoices (branding is a live
    # visual, not a historical figure) — so a newly-uploaded logo shows everywhere.
    if live.get("logo"):
        snap["logo"] = live.get("logo")
    elif not snap.get("logo"):
        snap["logo"] = live.get("logo")
    for k in ("name", "legal_name", "tagline", "email", "phone", "website",
              "address", "city", "state", "zip", "country", "gst", "pan",
              "footer", "terms", "refund_policy", "support"):
        if not snap.get(k):
            snap[k] = live.get(k)

    # theme: live settings win for real invoices; respect provided values for samples
    if force_theme or not snap.get("accent"):
        snap["theme_key"] = live.get("theme_key")
        snap["accent"] = live.get("accent")
        snap["accent_dark"] = live.get("accent_dark")
    if force_theme or not snap.get("letterhead"):
        snap["letterhead"] = live.get("letterhead")

    inv["business_snapshot"] = snap
    return inv


def _mask_customer_pii(inv: dict, role: str) -> dict:
    """Privacy (spec): once a booking is PAID / COMPLETED — or has been CANCELLED — the
    partner must NOT see the customer's personal contact details (mobile / email /
    address). Name is kept so the partner can still identify the job. Partner role only."""
    if role != "partner" or not inv:
        return inv
    paid = (inv.get("payment_status") or "").lower() == "paid" or \
        (inv.get("booking_status") or "").lower() in ("completed", "paid")
    cancelled = (inv.get("invoice_type") == "cancellation") or \
        (inv.get("booking_status") or "").lower() in ("cancelled", "canceled")
    if not (paid or cancelled):
        return inv
    snap = dict(inv.get("customer_snapshot") or {})
    for k in ("phone", "mobile", "email", "address"):
        if snap.get(k):
            snap[k] = "*****"
    inv = dict(inv)
    inv["customer_snapshot"] = snap
    inv["customer_pii_masked"] = True
    return inv


def strip_for_role(inv: dict, role: str) -> dict:
    """Role-based financial visibility (spec #13/#25/#26): each role's API returns ONLY
    that role's own financial fields — internal distribution is never leaked.
    CUSTOMER → no commission/net at all; MERCHANT → own commission/net only (no partner
    or full-platform-margin fields); PARTNER → own earning + total platform commission
    (no separate MERCHANT fields, spec #10); ADMIN → full breakdown."""
    if not inv or role in ("admin", None):
        return inv
    customer_forbidden = ("commission", "commission_rate", "commission_pct", "commission_base", "net_amount",
                          "platform_commission", "platform_earning", "partner_commission",
                          "merchant_commission", "partner_earning", "merchant_earning",
                          "platform_share", "partner_snapshot", "merchant_snapshot",
                          "provider_snapshot", "commission_breakdown", "partner_total",
                          "merchant_referral", "merchant_customer", "merchant_booking", "rates", "base",
                          "partner_cancellation_amount", "partner_cancellation_pct",
                          "admin_cut", "partner_cut")
    merchant_forbidden = ("partner_commission", "partner_earning", "partner_total",
                          "partner_snapshot", "platform_share", "platform_earning",
                          "merchant_referral", "merchant_customer",
                          "partner_cancellation_amount", "partner_cancellation_pct",
                          "admin_cut", "partner_cut",
                          "commission", "commission_pct", "commission_base", "commission_rate")
    partner_forbidden = ("merchant_commission", "merchant_earning", "merchant_snapshot",
                         "merchant_referral", "merchant_customer", "merchant_booking",
                         "commission", "commission_pct", "commission_base", "commission_rate")
    forbidden = {"customer": customer_forbidden, "merchant": merchant_forbidden,
                 "partner": partner_forbidden}.get(role, ())
    return {k: v for k, v in inv.items() if k not in forbidden}


async def _resolve_ledger(inv: dict, settings: dict):
    """Commission split for an invoice's booking — from the authoritative commission_ledger,
    else computed on the fly (legacy completed bookings that never got a ledger row)."""
    bid = inv.get("booking_id")
    if not bid:
        return None
    l = await db.commission_ledger.find_one({"booking_id": bid}, {"_id": 0})
    if l:
        return l
    booking = await db.bookings.find_one({"id": bid}, {"_id": 0})
    if not booking or not (booking.get("pricing") or {}).get("commissionable_base"):
        return None
    from services.engines import CommissionEngine
    partner = None
    if booking.get("partner_id"):
        partner = await db.users.find_one({"id": booking["partner_id"]},
                                          {"_id": 0, "referred_by_merchant": 1})
    return CommissionEngine.compute_split(booking, settings, partner or {})


async def _attach_bill_to(inv: dict, role: str) -> dict:
    """Choose the BILL TO party for the rendered invoice:
      • partner-facing invoice  → the PARTNER's details
      • merchant-facing invoice → the MERCHANT's details
      • otherwise (customer/admin) → the CUSTOMER's details
    Partner/merchant snapshots are enriched with name/phone/email/address from their
    user doc when the stored snapshot is missing them (covers legacy invoices)."""
    re = inv.get("role_earning") or {}
    party_role = re.get("role") or (role if role in ("partner", "merchant") else "customer")

    async def _enrich(snap_key, uid_key):
        snap = dict(inv.get(snap_key) or {})
        needs = not snap.get("address") or not snap.get("name")
        if needs and inv.get(uid_key):
            u = await db.users.find_one(
                {"id": inv[uid_key]},
                {"_id": 0, "name": 1, "phone": 1, "email": 1, "address": 1,
                 "city": 1, "state": 1, "pincode": 1, "shop_name": 1,
                 "gstin": 1, "gst_number": 1}) or {}
            if not snap.get("name"):
                snap["name"] = u.get("shop_name") or u.get("name") or ""
            snap.setdefault("phone", u.get("phone") or "")
            snap.setdefault("email", u.get("email") or "")
            if not snap.get("address"):
                addr = u.get("address")
                if isinstance(addr, dict):
                    snap["address"] = _addr_str(addr)
                elif isinstance(addr, str) and addr.strip():
                    snap["address"] = addr.strip()
                if not snap.get("address"):
                    snap["address"] = ", ".join(
                        [x for x in [u.get("city"), u.get("state"), u.get("pincode")] if x])
            if not snap.get("gstin"):
                snap["gstin"] = u.get("gstin") or u.get("gst_number") or ""
        return snap

    if party_role == "partner":
        inv["bill_to"] = await _enrich("partner_snapshot", "partner_id")
    elif party_role == "merchant":
        inv["bill_to"] = await _enrich("merchant_snapshot", "merchant_id")
    else:
        inv["bill_to"] = dict(inv.get("customer_snapshot") or {})
    return inv



async def _attach_role_earning(inv: dict, role: str) -> dict:
    """For partner/merchant, attach THEIR own commission/earning (from the authoritative
    commission_ledger) so the invoice detail shows what THEY actually get — not the
    customer's gross total minus platform commission. Spec: Partner invoice → Partner
    Commission %; Merchant invoice → only their applicable Merchant Referral Commission."""
    if role not in ("partner", "merchant"):
        return inv
    itype = inv.get("invoice_type")
    if itype not in ("booking", "cancellation"):
        return inv
    is_cancel = itype == "cancellation"
    if is_cancel:
        # A cancelled booking carries its own 'cancellation' ledger row (partner's share
        # of the retained cancellation charge + the platform's share). Never fall back to
        # a computed COMPLETION split here — that would show the wrong earning.
        l = await db.commission_ledger.find_one(
            {"booking_id": inv.get("booking_id"), "kind": "cancellation"}, {"_id": 0})
        if not l:
            # Fallback: derive the split from the booking's stored cancellation snapshot
            # (so the earning shows even if the ledger row is missing / legacy data).
            bk = await db.bookings.find_one(
                {"id": inv.get("booking_id")}, {"_id": 0, "cancellation": 1}) or {}
            canc = bk.get("cancellation") or {}
            if canc.get("partner_cut") is not None or canc.get("cancel_charge"):
                l = {
                    "base": canc.get("commission_charge") or canc.get("cancel_charge") or 0,
                    "partner_earning": canc.get("partner_cut") or 0,
                    "platform_earning": canc.get("admin_cut") or 0,
                    "merchant_referral": canc.get("merchant_partner_comm") or 0,
                    "merchant_customer": canc.get("merchant_customer_comm") or 0,
                    "rates": {"partner_pct": canc.get("partner_split_pct"),
                              "merchant_partner_referral_pct": canc.get("merchant_partner_pct"),
                              "merchant_customer_pct": canc.get("merchant_customer_pct")},
                }
    else:
        l = await _resolve_ledger(inv, await get_settings())
    if not l:
        return inv
    rates = l.get("rates") or {}
    if role == "partner":
        pe = float(l.get("partner_earning") or 0)
        if is_cancel:
            # Partner's cancellation earning = their % of the cancellation charge retained
            # from the customer; the remainder is the platform's share (spec: show BOTH).
            charge = round(float(l.get("base") or 0), 2)
            platform = round(float(l.get("platform_earning") or 0), 2)
            _rate = (rates or {}).get("partner_pct")
            if _rate is None:
                _bk = await db.bookings.find_one(
                    {"id": inv.get("booking_id")}, {"_id": 0, "cancellation": 1}) or {}
                _rate = (_bk.get("cancellation") or {}).get("partner_split_pct")
            # Surface the coupon transparently (same as a completed booking): the split
            # base already ADDS BACK the coupon, so the partner's cancellation earning is
            # never reduced by it — AzoApp funds the coupon.
            _bkc = await db.bookings.find_one(
                {"id": inv.get("booking_id")}, {"_id": 0, "coupon_code": 1, "pricing": 1}) or {}
            _cc = _bkc.get("coupon_code")
            _cd = round(float((_bkc.get("pricing") or {}).get("discount") or 0), 2) if _cc else 0.0
            inv["role_earning"] = {
                "role": "partner",
                "is_cancellation": True,
                "rate": _rate,
                "base": charge,
                "service_cost": charge,
                "service_label": "Cancellation Charge",
                "platform_label": "Platform Share",
                "platform": platform,
                "coupon_code": _cc or None,
                "coupon_discount": _cd,
                "coupon_bearer": "AzoApp Platform" if _cc else None,
                "coupon_note": ("Coupon discount is funded by AzoApp and does not affect Partner earnings."
                                if _cc else None),
                "net_label": "Your Earning",
                "net": round(pe, 2),
            }
            return inv
        vc = float(l.get("visiting_charge") or 0)
        net = float(l.get("partner_total") if l.get("partner_total") is not None else pe + vc)
        base = round(float(l.get("base") or 0), 2)
        # Itemise the Visiting Charge that is folded INTO the commission base so the
        # partner can SEE it (spec: any extra charge like Visiting Charge must be visible
        # on the partner invoice too). Service Cost + Visiting Charge == base (no double
        # count); the net earning is unchanged.
        bk = await db.bookings.find_one({"id": inv.get("booking_id")}, {"_id": 0, "pricing": 1, "coupon_code": 1}) or {}
        vc_in_base = round(float((bk.get("pricing") or {}).get("visiting_charge") or 0), 2)
        vc_show = round(vc if vc > 0 else vc_in_base, 2)
        service_cost = round(base - (vc_in_base if vc <= 0 else 0), 2)
        # Coupon discount is funded by AzoApp Platform and does NOT reduce the partner's
        # earning — the commission base already ADDS BACK the coupon. We surface the
        # coupon transparently on the partner invoice so it is clearly platform-borne.
        _coupon_code = bk.get("coupon_code")
        _coupon_disc = round(float((bk.get("pricing") or {}).get("discount") or 0), 2) if _coupon_code else 0.0
        inv["role_earning"] = {
            "role": "partner",
            "rate": rates.get("partner_pct"),
            "base": base,
            "service_cost": service_cost,
            "commission_label": "Partner Commission",
            "commission": round(pe, 2),
            "visiting_charge": vc_show,
            "coupon_code": _coupon_code or None,
            "coupon_discount": _coupon_disc,
            "coupon_bearer": "AzoApp Platform" if _coupon_code else None,
            "coupon_note": ("Coupon discount is funded by AzoApp and does not affect Partner earnings."
                            if _coupon_code else None),
            "net_label": "Net Earning",
            "net": round(net, 2),
        }
    else:  # merchant — show BOTH commission rows (₹0 when not applicable) with their %
        mr = float(l.get("merchant_referral") or 0)
        mc = float(l.get("merchant_customer") or 0)
        ref_pct = float(rates.get("merchant_partner_referral_pct") or 0)
        cust_pct = float(rates.get("merchant_customer_pct") or 0)
        inv["role_earning"] = {
            "role": "merchant",
            "is_cancellation": is_cancel,
            "rate": round(ref_pct + cust_pct, 2),
            "base": round(float(l.get("base") or 0), 2),
            "service_label": "Cancellation Charge" if is_cancel else "Total Service Amount",
            "commission_label": "Total Commission",
            "referral": round(mr, 2),
            "referral_pct": round(ref_pct, 2),
            "customer": round(mc, 2),
            "customer_pct": round(cust_pct, 2),
            "commission": round(mr + mc, 2),
            "net_label": "Net Commission",
            "net": round(mr + mc, 2),
        }
    return inv


def _strip_platform_fees_invoice(inv: dict, role: str) -> dict:
    """Provider (partner/merchant) documents must NEVER expose the platform-only
    Convenience Fee / Platform Fee (spec: 100% platform revenue). Remove those lines
    from the stored (customer) breakdown and re-derive the provider-facing document
    totals on the service side so the invoice reconciles. Applied at READ time only —
    the stored snapshot keeps the full customer figures for customer/admin/PDF."""
    if role not in ("partner", "merchant") or not inv:
        return inv
    bd = inv.get("breakdown") or {}
    add = bd.get("additional_charges") or []
    removed = round(sum(float(c.get("amount") or 0) for c in add
                        if c.get("key") in ("convenience_fee", "platform_fee")), 2)
    inv = dict(inv)
    if bd:
        inv["breakdown"] = PricingEngine.strip_platform_fees_breakdown(bd)
    # Drop the raw fee values so no serializer can leak them to a provider.
    inv.pop("convenience_fee", None)
    inv.pop("platform_fee", None)
    if removed > 0:
        nb = inv.get("breakdown") or {}
        inv["taxable"] = round(max(0.0, float(inv.get("taxable") or 0) - removed), 2)
        inv["fees"] = round(max(0.0, float(inv.get("fees") or 0) - removed), 2)
        # tax + headline align with the re-derived provider breakdown
        if nb.get("tax") is not None:
            inv["tax"] = nb.get("tax")
        if inv.get("invoice_type") == "booking" and nb.get("total") is not None:
            inv["total_amount"] = nb.get("total")
    return inv


async def get_invoice(user: dict, invoice_id: str):
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        return None
    role = user["role"]
    if role == "customer" and inv.get("customer_id") != user["id"]:
        return "forbidden"
    if role == "merchant" and inv.get("merchant_id") != user["id"]:
        return "forbidden"
    if role == "partner" and inv.get("partner_id") != user["id"]:
        return "forbidden"
    inv = await fill_live_branding(inv)
    inv = await _attach_role_earning(inv, role)
    inv = await _attach_bill_to(inv, role)
    inv = _mask_customer_pii(inv, role)
    inv = _strip_platform_fees_invoice(inv, role)
    return strip_for_role(inv, role)


async def query_all(user: dict, params: dict, limit: int = 2000):
    """All matching invoices (no pagination) — for bulk ZIP / reports."""
    await sync_invoices()
    q = _build_query(user, params)
    return await db.invoices.find(q, {"_id": 0}).sort("issue_date", -1).to_list(limit)


async def gst_report(user: dict, year: int):
    """Monthly tax/GST summary across invoices for a given year (admin)."""
    await sync_invoices()
    q = _build_query(user, {"range": "all"})
    q["invoice_type"] = {"$in": ["booking", "cancellation", "transaction"]}
    invs = await db.invoices.find(q, {"_id": 0}).to_list(20000)
    months = {m: {"month": m, "invoices": 0, "subtotal": 0.0, "discount": 0.0, "tax": 0.0, "total": 0.0} for m in range(1, 13)}
    for inv in invs:
        d = str(inv.get("issue_date") or "")
        if len(d) < 7 or not d.startswith(str(year)):
            continue
        try:
            m = int(d[5:7])
        except Exception:
            continue
        row = months[m]
        row["invoices"] += 1
        row["subtotal"] += float(inv.get("subtotal") or 0)
        row["discount"] += float(inv.get("discount") or 0)
        row["tax"] += float(inv.get("tax") or 0)
        row["total"] += float(inv.get("total_amount") or 0)
    rows = [months[m] for m in range(1, 13)]
    totals = {
        "invoices": sum(r["invoices"] for r in rows),
        "subtotal": round(sum(r["subtotal"] for r in rows), 2),
        "discount": round(sum(r["discount"] for r in rows), 2),
        "tax": round(sum(r["tax"] for r in rows), 2),
        "total": round(sum(r["total"] for r in rows), 2),
    }
    for r in rows:
        for k in ("subtotal", "discount", "tax", "total"):
            r[k] = round(r[k], 2)
    return {"year": year, "rows": rows, "totals": totals}
