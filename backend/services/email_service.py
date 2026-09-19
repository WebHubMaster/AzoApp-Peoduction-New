"""Transactional email via SMTP (admin-configurable). Works with any SMTP provider
(Gmail, SendGrid SMTP, SES SMTP, Zoho, etc.) once creds are entered in Admin.
"""
import asyncio
import datetime as _dt
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from config.database import get_settings

logger = logging.getLogger("azoapp.email")


def _send_sendgrid_sync(cfg: dict, to_email: str, subject: str, html: str, text: str, attachments=None):
    """Send via SendGrid Web API v3 (official sendgrid library)."""
    import base64
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import (Mail, Attachment, FileContent, FileName,
                                        FileType, Disposition)
    from_email = cfg.get("sendgrid_sender_email") or cfg.get("smtp_from_email")
    from_name = cfg.get("sendgrid_sender_name") or cfg.get("smtp_from_name") or "AzoApp"
    message = Mail(from_email=(from_email, from_name), to_emails=to_email,
                   subject=subject, html_content=html or text or "")
    if text:
        message.plain_text_content = text
    for att in (attachments or []):
        try:
            fname, data, mime = att
            encoded = base64.b64encode(data).decode()
            message.attachment = Attachment(
                FileContent(encoded), FileName(fname),
                FileType(f"application/{mime or 'pdf'}"), Disposition("attachment"))
        except Exception:
            pass
    sg = SendGridAPIClient(cfg.get("sendgrid_api_key"))
    resp = sg.send(message)
    if resp.status_code not in (200, 201, 202):
        raise RuntimeError(f"SendGrid returned {resp.status_code}")


def _send_sync(cfg: dict, to_email: str, subject: str, html: str, text: str, attachments=None):
    msg = MIMEMultipart("mixed")
    alt = MIMEMultipart("alternative")
    from_name = cfg.get("smtp_from_name") or "AzoApp"
    from_email = cfg.get("smtp_from_email") or cfg.get("smtp_user")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = to_email
    alt.attach(MIMEText(text or "", "plain"))
    alt.attach(MIMEText(html or text or "", "html"))
    msg.attach(alt)
    for att in (attachments or []):
        try:
            fname, data, mime = att
            from email.mime.application import MIMEApplication
            part = MIMEApplication(data, _subtype=(mime or "pdf"))
            part.add_header("Content-Disposition", "attachment", filename=fname)
            msg.attach(part)
        except Exception:
            pass

    host = cfg.get("smtp_host")
    port = int(cfg.get("smtp_port") or 587)
    if int(port) == 465:
        server = smtplib.SMTP_SSL(host, port, timeout=20)
    else:
        server = smtplib.SMTP(host, port, timeout=20)
        if cfg.get("smtp_use_tls", True):
            server.starttls()
    try:
        if cfg.get("smtp_user"):
            server.login(cfg.get("smtp_user"), cfg.get("smtp_password") or "")
        server.sendmail(from_email, [to_email], msg.as_string())
    finally:
        server.quit()


async def send_email(to_email: str, subject: str, html: str, text: str = "", attachments=None) -> dict:
    if not to_email:
        return {"ok": False, "skipped": "no_email"}
    s = await get_settings()
    integ = s.get("integrations", {}) or {}
    if not integ.get("email_enabled"):
        return {"ok": False, "skipped": "email_not_configured"}
    provider = (integ.get("email_provider") or "smtp").lower()
    if provider == "sendgrid":
        if not integ.get("sendgrid_api_key") or not integ.get("sendgrid_sender_email"):
            return {"ok": False, "skipped": "email_not_configured"}
        sender = _send_sendgrid_sync
    else:
        if not integ.get("smtp_host"):
            return {"ok": False, "skipped": "email_not_configured"}
        sender = _send_sync
    try:
        full_html = build_email_html(html, subject, s)
        await asyncio.to_thread(sender, integ, to_email, subject, full_html, text, attachments)
        logger.info("Email sent OK via %s to %s (subject=%s)", provider, to_email, subject)
        return {"ok": True, "provider": provider}
    except Exception as e:  # noqa: BLE001
        # Surface the real reason in the backend logs so mis-configured SMTP/SendGrid
        # (bad password, App-Password required, wrong port/TLS, blocked sender, etc.)
        # is diagnosable instead of failing silently.
        logger.error("Email send FAILED via %s to %s: %s", provider, to_email,
                     repr(e), exc_info=True)
        return {"ok": False, "error": f"{type(e).__name__}: {str(e)[:240]}"}


async def send_test_email(to_email: str, cfg_override: dict = None) -> dict:
    """Send a diagnostic test email using the SAVED integration settings (or the
    provided override, so a form can be tested before saving). Unlike send_email
    this IGNORES the `email_enabled` gate — it always attempts a real send and
    returns the exact provider error so admins can verify config in one click."""
    if not to_email or "@" not in str(to_email):
        return {"ok": False, "error": "Please provide a valid recipient email address."}
    s = await get_settings()
    integ = dict(s.get("integrations", {}) or {})
    if isinstance(cfg_override, dict):
        integ.update({k: v for k, v in cfg_override.items() if v not in (None, "")})
    provider = (integ.get("email_provider") or "smtp").lower()
    if provider == "sendgrid":
        if not integ.get("sendgrid_api_key") or not integ.get("sendgrid_sender_email"):
            return {"ok": False, "error": "SendGrid API key and sender email are required."}
        sender = _send_sendgrid_sync
    else:
        if not integ.get("smtp_host"):
            return {"ok": False, "error": "SMTP Host is required."}
        sender = _send_sync
    brand = (s.get("branding") or {}).get("site_name") or "AzoApp"
    subject = f"{brand} · Test email"
    inner = ("<h2>Test email</h2><p>Yeh ek test email hai. Agar aapko yeh mili hai, "
             "toh aapka email configuration <b>sahi kaam kar raha hai</b>. ✅</p>"
             f"<p>Provider: <b>{provider}</b></p>")
    try:
        full_html = build_email_html(inner, subject, s)
        await asyncio.to_thread(sender, integ, to_email, subject, full_html,
                                "This is a test email from your app. If you received it, email is working.")
        logger.info("TEST email sent OK via %s to %s", provider, to_email)
        return {"ok": True, "provider": provider,
                "message": f"Test email sent to {to_email} via {provider}."}
    except Exception as e:  # noqa: BLE001
        logger.error("TEST email FAILED via %s to %s: %s", provider, to_email,
                     repr(e), exc_info=True)
        hint = _smtp_error_hint(str(e))
        return {"ok": False, "provider": provider,
                "error": f"{type(e).__name__}: {str(e)[:240]}", "hint": hint}


def _smtp_error_hint(err: str) -> str:
    """Human-friendly next-step for the most common SMTP failures."""
    e = (err or "").lower()
    if "authentication" in e or "5.7.8" in e or "username and password" in e or "auth" in e:
        return ("Login failed. Gmail/Google Workspace me normal password kaam nahi karta — "
                "2-Step Verification on karke ek 'App Password' banayein aur wahi password field me daalein.")
    if "certificate" in e or "ssl" in e or "wrong version" in e:
        return "TLS/SSL mismatch. Port 587 ke liye STARTTLS, port 465 ke liye SSL use hota hai — port sahi rakhein."
    if "connection" in e or "timed out" in e or "getaddrinfo" in e or "name or service" in e:
        return "SMTP host/port tak connect nahi ho paya. Host aur Port dobara check karein."
    if "sender" in e or "from" in e or "not allowed" in e or "spf" in e:
        return "Sender address reject hua. 'From Email' wahi hona chahiye jise provider allow karta hai."
    return "Details backend logs me hain. Host/Port/Username/Password/From-Email verify karein."


def build_email_html(inner_html: str, subject: str = "", settings: dict = None) -> str:
    """Wrap admin-designed HTML in a responsive, cross-client email skeleton so the
    exact design authored in the editor renders consistently on every device.
    If the body is already a full HTML document, it is returned untouched.
    """
    body = (inner_html or "").strip()
    if body[:15].lower().startswith("<!doctype") or body[:6].lower().startswith("<html"):
        return inner_html
    settings = settings or {}
    branding = (settings.get("branding") or {})
    theme = (settings.get("theme") or {})
    brand_name = branding.get("site_name") or branding.get("name") or "AzoApp"
    # Prefer the raster (PNG/JPG) email logo — Gmail & most clients block SVG.
    logo = branding.get("email_logo") or branding.get("logo_url") or branding.get("logo") or branding.get("logo_light") or branding.get("logo_dark") or ""
    # Email clients cannot load app-relative URLs (e.g. /api/media/...) — they need
    # an absolute HTTPS URL. Prefix the public app origin when the logo is relative.
    if logo and not logo.startswith("http"):
        import os as _os
        base = (_os.environ.get("PUBLIC_APP_URL") or _os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
        if base.startswith("https://"):
            logo = base + ("" if logo.startswith("/") else "/") + logo
        else:
            logo = ""  # no absolute base → fall back to the brand-name header
    primary = theme.get("primary") or "#0D47A1"
    year = _dt.datetime.utcnow().year
    header = (
        f'<img src="{logo}" alt="{brand_name}" height="34" style="height:34px;display:block;border:0;" />'
        if logo else
        f'<span style="color:{primary};font-size:20px;font-weight:800;letter-spacing:.3px;">{brand_name}</span>'
    )
    return f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<title>{subject or brand_name}</title>
<style>
  body {{ margin:0; padding:0; background:#f1f5f9; -webkit-text-size-adjust:100%; }}
  img {{ max-width:100%; height:auto; }}
  .az-content {{ font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#0f172a; font-size:15px; line-height:1.6; }}
  .az-content p {{ margin:0 0 14px; }}
  .az-content h1,.az-content h2,.az-content h3 {{ color:#0f172a; margin:0 0 12px; line-height:1.25; }}
  .az-content a {{ color:{primary}; }}
  .az-content img {{ border-radius:8px; }}
  @media only screen and (max-width:600px) {{
    .az-wrap {{ width:100% !important; }}
    .az-pad {{ padding:20px !important; }}
  }}
</style>
</head>
<body>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" class="az-wrap" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(2,6,23,.08);">
      <tr><td style="background:#eaf1fb;padding:22px 28px;border-bottom:1px solid #dbe7f8;" align="left">{header}</td></tr>
      <tr><td class="az-pad az-content" style="padding:32px 34px;">{body}</td></tr>
      <tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#94a3b8;font-size:12px;line-height:1.5;" align="center">
        &copy; {year} {brand_name}. All rights reserved.<br/>This is an automated message, please do not reply.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""
