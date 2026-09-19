"""Scheduled Reports — auto-generate a periodic analytics summary (PDF + CSV),
store it for download, and email it to recipients (via the admin-configured
SMTP/SendGrid). Falls back gracefully to a downloadable Report History when
email is not configured.
"""
import io
import uuid
from datetime import datetime, timedelta, timezone

from config.database import db, get_settings
from controllers import reports_controller as rc
from services import storage_service, email_service


FREQ_DAYS = {"daily": 1, "weekly": 7, "monthly": 30}


def _now():
    return datetime.now(timezone.utc)


def _iso(d):
    return d.strftime("%Y-%m-%d")


def _period_for(freq: str):
    days = FREQ_DAYS.get(freq, 7)
    to_d = _now()
    from_d = to_d - timedelta(days=days)
    return _iso(from_d), _iso(to_d)


def _next_run(freq: str, frm=None):
    base = frm or _now()
    return (base + timedelta(days=FREQ_DAYS.get(freq, 7))).isoformat()


# ───────────────────────── document generation ─────────────────────────
def _build_csv(overview: dict) -> bytes:
    k = overview.get("kpis", {})
    lines = ["Metric,Value"]
    labels = [
        ("Gross Revenue", "gross_revenue"), ("Platform Revenue", "platform_revenue"),
        ("Partner Payouts", "partner_earnings"), ("Merchant Referral", "merchant_referral"),
        ("Refunds", "refunds"), ("Total Bookings", "total_bookings"),
        ("Completed", "completed_bookings"), ("Cancelled", "cancelled_bookings"),
        ("Avg Order Value", "avg_order_value"), ("Success Rate %", "success_rate"),
        ("Cancellation Rate %", "cancellation_rate"), ("New Customers", "new_customers"),
        ("Total Customers", "total_customers"), ("Active Providers", "active_partners"),
        ("Open Tickets", "open_tickets"), ("Active Memberships", "active_memberships"),
    ]
    for lbl, key in labels:
        lines.append(f'"{lbl}","{k.get(key, 0)}"')
    lines.append("")
    lines.append("Date,Revenue,Orders")
    for r in overview.get("revenue_trend", []):
        lines.append(f'"{r.get("date")}","{r.get("revenue",0)}","{r.get("orders",0)}"')
    return ("\ufeff" + "\n".join(lines)).encode("utf-8")


def _build_pdf(overview: dict, title: str, brand: str) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                    TableStyle)
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=18 * mm, bottomMargin=16 * mm,
                            leftMargin=16 * mm, rightMargin=16 * mm)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Title"], fontSize=20, textColor=colors.HexColor("#0D47A1"))
    sub = ParagraphStyle("sub", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#64748b"))
    sec = ParagraphStyle("sec", parent=styles["Heading2"], fontSize=13, textColor=colors.HexColor("#1e293b"), spaceBefore=10)
    el = []
    rng = overview.get("range", {})
    el.append(Paragraph(f"{brand} — {title}", h1))
    el.append(Paragraph(f"Period: {rng.get('date_from','')} to {rng.get('date_to','')} · Generated {_iso(_now())}", sub))
    el.append(Spacer(1, 8))

    k = overview.get("kpis", {})
    def money(v):
        return f"Rs {v:,.2f}" if isinstance(v, (int, float)) else str(v)
    kpi_rows = [
        ["Gross Revenue", money(k.get("gross_revenue", 0)), "Platform Revenue", money(k.get("platform_revenue", 0))],
        ["Total Bookings", str(k.get("total_bookings", 0)), "Completed", str(k.get("completed_bookings", 0))],
        ["Avg Order Value", money(k.get("avg_order_value", 0)), "Success Rate", f"{k.get('success_rate',0)}%"],
        ["Refunds", money(k.get("refunds", 0)), "Cancellations", f"{k.get('cancellation_rate',0)}%"],
        ["New Customers", str(k.get("new_customers", 0)), "Active Providers", str(k.get("active_partners", 0))],
        ["Open Tickets", str(k.get("open_tickets", 0)), "Active Memberships", str(k.get("active_memberships", 0))],
    ]
    el.append(Paragraph("Key Metrics", sec))
    t = Table(kpi_rows, colWidths=[42 * mm, 42 * mm, 42 * mm, 42 * mm])
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#64748b")),
        ("TEXTCOLOR", (2, 0), (2, -1), colors.HexColor("#64748b")),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ("FONTNAME", (3, 0), (3, -1), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.HexColor("#f8fafc"), colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    el.append(t)

    top = overview.get("top_services", [])[:6]
    if top:
        el.append(Paragraph("Top Services", sec))
        rows = [["Service", "Orders", "Revenue"]] + [[s.get("name", ""), str(s.get("orders", 0)), money(s.get("revenue", 0))] for s in top]
        t2 = Table(rows, colWidths=[90 * mm, 30 * mm, 48 * mm])
        t2.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0D47A1")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f8fafc"), colors.white]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("PADDING", (0, 0), (-1, -1), 5),
        ]))
        el.append(t2)

    el.append(Spacer(1, 14))
    el.append(Paragraph("This is an auto-generated analytics summary. Figures reflect activity within the stated period.", sub))
    doc.build(el)
    return buf.getvalue()


# ───────────────────────── schedule CRUD ─────────────────────────
async def list_schedules():
    rows = await db.report_schedules.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"schedules": rows}


async def create_schedule(data: dict):
    name = (data.get("name") or "").strip()
    if not name:
        return {"error": "Name required"}, 400
    freq = data.get("frequency") if data.get("frequency") in FREQ_DAYS else "weekly"
    recipients = [e.strip() for e in (data.get("recipients") or []) if e and "@" in e]
    fmt = data.get("format") if data.get("format") in ("pdf", "csv", "both") else "both"
    sch = {
        "id": str(uuid.uuid4()),
        "name": name,
        "frequency": freq,
        "recipients": recipients,
        "format": fmt,
        "enabled": bool(data.get("enabled", True)),
        "last_run_at": None,
        "next_run_at": _next_run(freq),
        "created_at": _now().isoformat(),
    }
    await db.report_schedules.insert_one(dict(sch))
    return sch


async def update_schedule(sch_id: str, data: dict):
    upd = {}
    if "name" in data and data["name"].strip():
        upd["name"] = data["name"].strip()
    if data.get("frequency") in FREQ_DAYS:
        upd["frequency"] = data["frequency"]
        upd["next_run_at"] = _next_run(data["frequency"])
    if "recipients" in data:
        upd["recipients"] = [e.strip() for e in (data.get("recipients") or []) if e and "@" in e]
    if data.get("format") in ("pdf", "csv", "both"):
        upd["format"] = data["format"]
    if "enabled" in data:
        upd["enabled"] = bool(data["enabled"])
    if not upd:
        return {"error": "Nothing to update"}, 400
    await db.report_schedules.update_one({"id": sch_id}, {"$set": upd})
    return await db.report_schedules.find_one({"id": sch_id}, {"_id": 0})


async def delete_schedule(sch_id: str):
    await db.report_schedules.delete_one({"id": sch_id})
    return {"ok": True}


async def list_runs(limit: int = 50):
    rows = await db.report_runs.find({}, {"_id": 0}).sort("generated_at", -1).to_list(int(limit or 50))
    return {"runs": rows}


# ───────────────────────── run a schedule ─────────────────────────
async def run_schedule(sch: dict, manual: bool = False):
    settings = await get_settings()
    brand = (settings.get("branding") or {}).get("site_name") or settings.get("brand") or "AzoApp"
    frm, to = _period_for(sch.get("frequency", "weekly"))
    overview = await rc.reports_overview(frm, to)
    title = f"{sch.get('frequency','weekly').title()} Analytics Report"

    run = {
        "id": str(uuid.uuid4()),
        "schedule_id": sch.get("id"),
        "name": sch.get("name"),
        "frequency": sch.get("frequency"),
        "period": {"date_from": frm, "date_to": to},
        "generated_at": _now().isoformat(),
        "manual": bool(manual),
        "pdf_url": None,
        "csv_url": None,
        "emailed_to": [],
        "email_status": "skipped",
        "status": "generated",
    }

    attachments = []
    fmt = sch.get("format", "both")
    try:
        if fmt in ("pdf", "both"):
            pdf = _build_pdf(overview, title, brand)
            saved = await storage_service.save_document(pdf, "application/pdf",
                                                        filename=f"report-{to}.pdf", folder="reports")
            run["pdf_url"] = saved.get("url")
            attachments.append((f"{sch.get('name','report')}-{to}.pdf", pdf, "pdf"))
        if fmt in ("csv", "both"):
            csv = _build_csv(overview)
            saved = await storage_service.save_document(csv, "text/csv",
                                                        filename=f"report-{to}.csv", folder="reports")
            # save_document may reject csv mime -> store raw fallback
            run["csv_url"] = saved.get("url") if isinstance(saved, dict) else None
            attachments.append((f"{sch.get('name','report')}-{to}.csv", csv, "csv"))
    except Exception as e:
        # CSV via save_document can raise on unsupported mime — still email it
        if fmt in ("csv", "both") and not any(a[0].endswith(".csv") for a in attachments):
            try:
                attachments.append((f"{sch.get('name','report')}-{to}.csv", _build_csv(overview), "csv"))
            except Exception:
                pass
        run["note"] = f"storage: {e}"

    # email
    recipients = sch.get("recipients") or []
    if recipients:
        k = overview.get("kpis", {})
        html = email_service.build_email_html(
            f"<h2>{title}</h2><p>Period <b>{frm}</b> to <b>{to}</b></p>"
            f"<ul><li>Gross Revenue: <b>Rs {k.get('gross_revenue',0):,.2f}</b></li>"
            f"<li>Total Bookings: <b>{k.get('total_bookings',0)}</b> ({k.get('completed_bookings',0)} completed)</li>"
            f"<li>New Customers: <b>{k.get('new_customers',0)}</b></li>"
            f"<li>Success Rate: <b>{k.get('success_rate',0)}%</b></li></ul>"
            f"<p>Full report attached.</p>", subject=title, settings=settings)
        sent_any = False
        for to_email in recipients:
            try:
                res = await email_service.send_email(to_email, f"{brand} · {title}", html,
                                                     text=title, attachments=attachments)
                if isinstance(res, dict) and (res.get("ok") or res.get("sent")):
                    run["emailed_to"].append(to_email)
                    sent_any = True
            except Exception:
                pass
        run["email_status"] = "sent" if sent_any else "failed"
    run["status"] = "completed"

    await db.report_runs.insert_one(dict(run))
    await db.report_schedules.update_one(
        {"id": sch.get("id")},
        {"$set": {"last_run_at": run["generated_at"], "next_run_at": _next_run(sch.get("frequency", "weekly"))}})
    run.pop("_id", None)
    return run


async def run_now(sch_id: str):
    sch = await db.report_schedules.find_one({"id": sch_id}, {"_id": 0})
    if not sch:
        return {"error": "Schedule not found"}, 404
    return await run_schedule(sch, manual=True)


async def due_sweep():
    """Background: run every enabled schedule whose next_run_at has passed."""
    now_iso = _now().isoformat()
    due = await db.report_schedules.find(
        {"enabled": True, "next_run_at": {"$lte": now_iso}}, {"_id": 0}).to_list(100)
    ran = 0
    for sch in due:
        try:
            await run_schedule(sch)
            ran += 1
        except Exception:
            pass
    return ran
