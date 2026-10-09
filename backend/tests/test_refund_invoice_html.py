"""Tests for the new customer refund invoice layout (REFUND RECEIPT) and routing.

Covers:
- build_invoice_html(inv) with invoice_type='refund' returns the new refund HTML
  (data-testid=refund-invoice, REFUND RECEIPT title, customer To block, Refund No./
  Date/Booking ID/Status, From business block, items table with Refund Mode + Amount,
  Total Refund (data-testid=refund-invoice-total) equal to refund_amount, amount in words).
- render_invoice_pdf for refund produces a valid %PDF stream.
- Regression: booking + gst_invoice uses build_html (TAX INVOICE), partner uses
  build_partner_html (PARTNER INVOICE), withdrawal still uses the generic template.
"""
import os
import sys
import re

sys.path.insert(0, "/app/backend")

from services.invoice_html_service import build_invoice_html, render_invoice_pdf  # noqa: E402


def _num_to_words_contains(amt_html: str, amount: float) -> bool:
    # Just check that an "Amount in words:" block exists and is non-empty.
    m = re.search(r"Amount in words:</b>\s*([^<]+)", amt_html)
    return bool(m and m.group(1).strip())


def _refund_payload(amount=236.0):
    return {
        "invoice_number": "RFD-2026-0007",
        "invoice_type": "refund",
        "currency": "INR",
        "issue_date": "2026-01-15T10:20:30",
        "refund_amount": amount,
        "refund_pct": 50,
        "payment_method": "UPI",
        "payment_status": "processing",
        "service_name": "AC Deep Clean",
        "booking_code": "BK-78910",
        "notes": "Customer requested cancellation",
        "bill_to": {
            "name": "Ramesh Kumar",
            "address": "12, MG Road, Bengaluru",
            "phone": "+91-9000000000",
            "email": "ramesh@example.com",
        },
        "business_snapshot": {
            "name": "AzoApp Services",
            "legal_name": "AzoApp Services Pvt Ltd",
            "address": "4th Floor, Prestige Tower, Indiranagar",
            "city": "Bengaluru", "state": "Karnataka", "zip": "560038",
            "gst": "29ABCDE1234F2Z5",
            "signatory_name": "Operations Head",
        },
        "line_items": [{"desc": "Refund - AC Deep Clean", "amount": amount}],
    }


# ---------- refund HTML -----------------------------------------------------

class TestRefundHtml:
    def test_refund_html_routes_to_new_layout(self):
        inv = _refund_payload(236.0)
        html = build_invoice_html(inv)
        assert isinstance(html, str) and len(html) > 100
        # body uses the new refund testid (NOT the generic one)
        assert 'data-testid="refund-invoice"' in html
        assert 'data-testid="refund-invoice-page"' in html
        assert "REFUND RECEIPT" in html
        # must NOT fall back to generic/booking title
        assert "TAX INVOICE" not in html
        assert "PARTNER INVOICE" not in html

    def test_refund_html_customer_and_business_blocks(self):
        inv = _refund_payload()
        html = build_invoice_html(inv)
        # To (customer)
        assert "Ramesh Kumar" in html
        assert "12, MG Road, Bengaluru" in html
        assert "ramesh@example.com" in html
        # Right-hand meta
        assert "Refund No." in html and "RFD-2026-0007" in html
        assert "Booking ID" in html and "BK-78910" in html
        assert "Status" in html and "Processing" in html
        # From (business)
        assert "AzoApp Services Pvt Ltd" in html
        assert "29ABCDE1234F2Z5" in html

    def test_refund_html_items_table_and_total(self):
        inv = _refund_payload(236.0)
        html = build_invoice_html(inv)
        # Items table shows Refund Mode + Amount header and the payment method
        assert "Refund Mode" in html
        assert "UPI" in html
        # Total Refund with new testid, equal to refund_amount (formatted)
        assert 'data-testid="refund-invoice-total"' in html
        assert "Total Refund" in html
        # Rupee + 236.00 appears in the total block (allow &#8377; or ₹ or Rs.)
        assert ("236.00" in html) or ("236" in html)
        # Amount in words block non-empty
        assert _num_to_words_contains(html, 236.0)

    def test_refund_html_uses_refund_amount_not_total_amount(self):
        inv = _refund_payload(500.0)
        inv["total_amount"] = 9999.0  # should be ignored for refund
        html = build_invoice_html(inv)
        assert "500.00" in html
        assert "9,999.00" not in html and "9999.00" not in html

    def test_refund_pdf_is_valid(self):
        inv = _refund_payload(123.45)
        pdf = render_invoice_pdf(inv)
        assert isinstance(pdf, (bytes, bytearray)) and len(pdf) > 500
        assert bytes(pdf[:4]) == b"%PDF"


# ---------- regression ------------------------------------------------------

class TestRoutingRegression:
    def _booking_gst_payload(self):
        return {
            "invoice_number": "INV-2026-0001",
            "invoice_type": "booking",
            "currency": "INR",
            "issue_date": "2026-01-15",
            "booking_code": "BK-11111",
            "bill_to": {"name": "Customer A", "state": "Karnataka"},
            "business_snapshot": {
                "name": "AzoApp", "legal_name": "AzoApp Pvt Ltd",
                "address": "Addr", "state": "Karnataka", "gst": "29ABCDE1234F2Z5",
            },
            "gst_invoice": {
                "platform": {"number": "INV-2026-0001", "name": "AzoApp Pvt Ltd",
                             "address": "Addr", "state": "Karnataka",
                             "subtotal": 100, "cgst": 9, "sgst": 9, "igst": 0,
                             "items": [{"desc": "Service", "qty": 1, "rate": 100,
                                        "amount": 100, "sac": "9987"}]},
                "partner": {"number": "RCPT-2026-0001", "name": "Partner",
                            "address": "Addr", "state": "Karnataka",
                            "subtotal": 50,
                            "items": [{"desc": "Partner Earning", "qty": 1,
                                       "rate": 50, "amount": 50}]},
                "grand_total": 168,
            },
            "line_items": [{"desc": "Service", "amount": 100}],
        }

    def test_booking_gst_routes_to_build_html(self):
        html = build_invoice_html(self._booking_gst_payload())
        assert 'data-testid="gst-invoice"' in html
        assert "TAX INVOICE" in html
        assert "REFUND RECEIPT" not in html

    def test_partner_invoice_routes_to_partner_html(self):
        inv = {
            "invoice_number": "PINV-2026-0002",
            "invoice_type": "booking",
            "currency": "INR",
            "issue_date": "2026-01-15",
            "booking_code": "BK-22222",
            "role_earning": {"role": "partner", "net": 350.0},
            "bill_to": {"name": "Partner X", "state": "Karnataka",
                        "address": "Addr", "phone": "+91-9"},
            "partner_snapshot": {"name": "Partner X"},
            "business_snapshot": {"name": "AzoApp", "legal_name": "AzoApp Pvt Ltd",
                                   "state": "Karnataka", "address": "Addr"},
            "line_items": [{"desc": "Earning", "amount": 350.0}],
            "service_name": "AC Deep Clean",
        }
        html = build_invoice_html(inv)
        assert 'data-testid="partner-invoice"' in html
        assert "PARTNER INVOICE" in html
        assert "REFUND RECEIPT" not in html

    def test_withdrawal_uses_generic_template(self):
        inv = {
            "invoice_number": "WD-2026-0001",
            "invoice_type": "withdrawal",
            "currency": "INR",
            "issue_date": "2026-01-15",
            "bill_to": {"name": "Partner Y"},
            "business_snapshot": {"name": "AzoApp"},
            "line_items": [{"desc": "Withdrawal", "amount": 1000.0}],
            "total_amount": 1000.0,
        }
        html = build_invoice_html(inv)
        # Must NOT be routed into refund/partner/gst layouts.
        assert 'data-testid="refund-invoice"' not in html
        assert 'data-testid="partner-invoice"' not in html
        assert 'data-testid="gst-invoice"' not in html
        assert "REFUND RECEIPT" not in html
        assert "TAX INVOICE" not in html
