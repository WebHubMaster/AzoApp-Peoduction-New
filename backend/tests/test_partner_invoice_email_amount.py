"""Bug regression: partner invoice email body must show role_earning.net
(matching the PARTNER PDF 'Total Earning'), not the customer total_amount.
"""
import os
import sys
import asyncio
import uuid

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ["DB_NAME"] = f"test_partner_email_{uuid.uuid4().hex[:8]}"

sys.path.insert(0, "/app/backend")

import importlib  # noqa: E402

invoice_service = importlib.import_module("services.invoice_service")
email_service = importlib.import_module("services.email_service")
gst_invoice_service = importlib.import_module("services.gst_invoice_service")
invoice_pdf_service = importlib.import_module("services.invoice_pdf_service")


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _make_doc():
    return {
        "id": "inv_test_1",
        "invoice_number": "INV-TEST-001",
        "currency": "INR",
        "total_amount": 599.0,
        "payment_status": "paid",
        "booking_code": "BK-TEST-001",
        "issue_date": "2026-01-15",
        "created_at": "2026-01-15T00:00:00Z",
        "service_name": "Deep Cleaning",
        "category_name": "Cleaning",
        "line_items": [{"desc": "Deep Cleaning", "amount": 599.0}],
        "customer_snapshot": {"name": "Alice", "email": "c@x.com"},
        "partner_snapshot": {"name": "Bob Partner", "email": "p@x.com",
                              "address": "123 Main", "state": "KA", "phone": "9999999999"},
        "business_snapshot": {"name": "AzoApp", "legal_name": "AzoApp Pvt Ltd",
                               "address": "HQ", "state": "KA"},
        "partner_id": "partner_1",
        "role_earning": {"net": 479.20, "gross": 479.20, "is_cancellation": False},
        "partner_meta": {"category": "Cleaning", "state": "Karnataka"},
    }


def test_partner_email_shows_role_earning_not_customer_total(monkeypatch):
    captured = {}

    async def fake_send_email(to, subject, html, attachments=None):
        captured["to"] = to
        captured["subject"] = subject
        captured["html"] = html
        return {"ok": True}

    async def fake_prepare_for_role(inv, role):
        return inv  # already prepared

    monkeypatch.setattr(invoice_service, "send_email", fake_send_email, raising=False)
    monkeypatch.setattr(email_service, "send_email", fake_send_email, raising=False)
    monkeypatch.setattr(invoice_service, "prepare_for_role", fake_prepare_for_role)
    monkeypatch.setattr(invoice_pdf_service, "build_invoice_pdf", lambda d: b"")

    # patch db.invoices.find_one to return None (fallback to passed inv)
    async def fake_find_one(*a, **kw):
        return None
    monkeypatch.setattr(invoice_service.db.invoices, "find_one", fake_find_one)

    doc = _make_doc()

    # Partner audience
    res = _run(invoice_service.email_invoice(doc, to_email="p@x.com", audience="partner"))
    assert res.get("ok"), f"email_invoice failed: {res}"
    html = captured["html"]
    print("PARTNER HTML:", html)
    assert "Your Earning" in html, "partner email missing 'Your Earning' label"
    assert "479.20" in html, "partner email missing 479.20 amount"
    assert "599" not in html, f"partner email leaks customer total 599: {html}"

    # Customer audience — should show total_amount 599.00
    captured.clear()
    doc2 = _make_doc()
    res2 = _run(invoice_service.email_invoice(doc2, to_email="c@x.com", audience="customer"))
    assert res2.get("ok")
    html2 = captured["html"]
    print("CUSTOMER HTML:", html2)
    assert "Amount" in html2
    assert "599.00" in html2, f"customer email missing 599.00: {html2}"


def test_partner_pdf_total_matches_email_amount():
    import re
    doc = _make_doc()
    pdf_html = gst_invoice_service.build_partner_html(doc)
    assert "Total Earning" in pdf_html
    # Extract the partner-invoice-total row and verify its amount
    m = re.search(r'data-testid="partner-invoice-total"[^<]*<td>Total Earning</td><td>([^<]+)</td>', pdf_html)
    assert m, "could not find partner-invoice-total row"
    total_cell = m.group(1)
    assert "479.20" in total_cell, f"partner PDF total should be 479.20 but got: {total_cell!r}"
    assert "599" not in total_cell, f"partner PDF total must not show customer total: {total_cell!r}"
    # Ensure the customer total 599 is NOT shown anywhere as a visible money string
    assert "599.00" not in pdf_html, "partner PDF leaks customer total 599.00"
    assert "\u20b9599" not in pdf_html, "partner PDF leaks customer total ₹599"


def teardown_module(module):
    try:
        from pymongo import MongoClient
        MongoClient(os.environ["MONGO_URL"]).drop_database(os.environ["DB_NAME"])
    except Exception as e:
        print("teardown skip:", e)
