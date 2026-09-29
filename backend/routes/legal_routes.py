"""PUBLIC, no-login legal pages (Terms & Conditions / Privacy Policy).

Rendered as standalone, mobile-friendly HTML so they open cleanly inside an
in-app WebView from the Customer, Partner and Merchant account-create screens.
Exposed under /api/legal/{doc} (doc = terms | privacy).
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from html import escape as _escape
import re

from config.database import db

router = APIRouter()

_BRAND = "AzoApp"

_STYLE = """
  :root { --brand:#0D47A1; --ink:#0F172A; --muted:#475569; --line:#E2E8F0; --bg:#F8FAFC; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:var(--ink); line-height:1.6; }
  .wrap { max-width:820px; margin:0 auto; padding:20px 18px 48px; }
  .brand { font-size:12px; letter-spacing:1.4px; text-transform:uppercase; color:var(--brand); font-weight:800; }
  h1 { font-size:24px; font-weight:800; margin:6px 0 2px; letter-spacing:-0.4px; }
  .upd { color:var(--muted); font-size:12.5px; margin-bottom:20px; }
  h2 { font-size:16px; font-weight:800; margin:26px 0 8px; }
  p, li { font-size:14px; color:#1E293B; }
  ul { padding-left:20px; margin:8px 0; }
  a { color:var(--brand); }
  .foot { margin-top:32px; padding-top:16px; border-top:1px solid var(--line); color:var(--muted); font-size:12px; }
"""

_TERMS = f"""
<div class="brand">{_BRAND}</div>
<h1>Terms &amp; Conditions</h1>
<div class="upd">Last updated: June 2026</div>
<p>Welcome to {_BRAND}. By creating an account or using our platform, mobile
applications and services (collectively, the &ldquo;Services&rdquo;) you agree to
be bound by these Terms &amp; Conditions. Please read them carefully.</p>

<h2>1. Accounts &amp; Eligibility</h2>
<p>You must provide accurate information and keep your account secure. You are
responsible for all activity that occurs under your account. Customer, Partner
and Merchant accounts are subject to verification.</p>

<h2>2. Bookings &amp; Services</h2>
<ul>
  <li>{_BRAND} connects customers with independent service professionals and merchants.</li>
  <li>Prices, taxes, visiting charges and applicable fees are shown before you confirm a booking.</li>
  <li>Service availability depends on your location and professional availability.</li>
</ul>

<h2>3. Payments</h2>
<p>Payments may be made online or via your {_BRAND} wallet. All charges are billed
in the currency shown at checkout. Invoices are generated for every completed
transaction.</p>

<h2>4. Cancellations &amp; Refunds</h2>
<p>Cancellations are governed by our cancellation policy shown at booking time.
Eligible refunds are credited to your original payment method or wallet.</p>

<h2>5. Partner &amp; Merchant Obligations</h2>
<p>Partners and Merchants agree to deliver services professionally, comply with
applicable laws, and maintain the quality standards required by {_BRAND}.</p>

<h2>6. Acceptable Use</h2>
<p>You agree not to misuse the Services, attempt to disrupt the platform, or use
it for any unlawful purpose.</p>

<h2>7. Limitation of Liability</h2>
<p>The Services are provided on an &ldquo;as is&rdquo; basis. To the maximum extent
permitted by law, {_BRAND} is not liable for indirect or consequential damages.</p>

<h2>8. Changes to these Terms</h2>
<p>We may update these Terms from time to time. Continued use of the Services
after changes constitutes acceptance of the updated Terms.</p>

<h2>9. Contact</h2>
<p>For questions about these Terms, contact us through the in-app Support section.</p>

<div class="foot">© 2026 {_BRAND}. All rights reserved.</div>
"""

_PRIVACY = f"""
<div class="brand">{_BRAND}</div>
<h1>Privacy Policy</h1>
<div class="upd">Last updated: June 2026</div>
<p>This Privacy Policy explains how {_BRAND} collects, uses and protects your
information when you use our platform, mobile applications and services.</p>

<h2>1. Information We Collect</h2>
<ul>
  <li><b>Account data:</b> name, mobile number, email and profile photo.</li>
  <li><b>Location data:</b> your city, pincode or precise location (with permission) to show serviceable areas.</li>
  <li><b>Booking data:</b> services booked, addresses, payments and invoices.</li>
  <li><b>Device data:</b> app version, device type and notification tokens.</li>
</ul>

<h2>2. How We Use Your Information</h2>
<ul>
  <li>To provide, personalise and improve the Services.</li>
  <li>To match you with the right professionals and process bookings &amp; payments.</li>
  <li>To send booking updates, OTPs and important notifications.</li>
  <li>To prevent fraud and keep the platform secure.</li>
</ul>

<h2>3. Sharing of Information</h2>
<p>We share limited information with service professionals/merchants to fulfil
your bookings, and with payment and communication providers as needed. We do not
sell your personal data.</p>

<h2>4. Data Security</h2>
<p>We use industry-standard measures to protect your data. However, no method of
transmission or storage is completely secure.</p>

<h2>5. Your Choices</h2>
<p>You can update your profile, manage notification permissions, and request
account deletion from within the app.</p>

<h2>6. Data Retention</h2>
<p>We retain your information for as long as your account is active or as needed
to provide the Services and comply with legal obligations.</p>

<h2>7. Changes to this Policy</h2>
<p>We may update this Policy periodically. We will notify you of material changes
through the app.</p>

<h2>8. Contact</h2>
<p>For privacy questions, contact us through the in-app Support section.</p>

<div class="foot">© 2026 {_BRAND}. All rights reserved.</div>
"""

_DOCS = {
    "terms": ("Terms & Conditions", _TERMS),
    "privacy": ("Privacy Policy", _PRIVACY),
}

_HTML_RE = re.compile(r"<[a-z][\s\S]*>", re.I)


def _render_body(body: str) -> str:
    """Admin CMS body may be rich HTML (from the panel editor) or plain text."""
    body = (body or "").strip()
    if _HTML_RE.search(body):
        return body
    return f'<p style="white-space:pre-wrap">{_escape(body)}</p>'


async def _cms_page(key: str):
    """Fetch admin-managed page content (Website / CMS → pages collection)."""
    try:
        return await db.pages.find_one({"key": key}, {"_id": 0})
    except Exception:
        return None


@router.get("/legal/{doc}", response_class=HTMLResponse)
async def legal_page(doc: str):
    key = doc.lower()
    entry = _DOCS.get(key)
    if not entry:
        raise HTTPException(404, "Not found")
    default_title, default_body = entry

    # Prefer the exact content the admin saved in Website / CMS. If nothing is
    # saved yet, fall back to the built-in default so the page is never blank.
    title = default_title
    body = default_body
    page = await _cms_page(key)
    if page and (page.get("body") or "").strip():
        title = (page.get("title") or default_title).strip()
        upd = str(page.get("updated_at") or "")[:10]
        updated_line = f'<div class="upd">Last updated: {upd}</div>' if upd else ""
        body = (
            f'<div class="brand">{_BRAND}</div>'
            f'<h1>{_escape(title)}</h1>'
            f'{updated_line}'
            f'{_render_body(page.get("body"))}'
            f'<div class="foot">© 2026 {_BRAND}. All rights reserved.</div>'
        )

    html = f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
<title>{_escape(title)} · {_BRAND}</title>
<style>{_STYLE}</style>
</head><body><div class="wrap">{body}</div></body></html>"""
    return HTMLResponse(content=html)
