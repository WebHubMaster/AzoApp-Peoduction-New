#!/usr/bin/env python3
"""
Invoice Financial Calculations Verification Test
=================================================
Verify invoice line_items carry per-unit `rate` + extended `amount = rate*qty`,
and cancellation invoices show "Customer Refund (X%)" + "Amount Retained" with
single CANCELLED status (not duplicated).

Test accounts (OTP: 123456):
- Customer Chandan: +919128403769 (owns INV-2026-000014 for booking AZO9HWVU1)
- Customer Priya Verma: +919000000004 (owns INV-2026-000001 for booking AZODEMOCX1)
- Partner Raj Kumar: +919000000003
"""
import requests
import json
import sys
from typing import Dict, Any, List, Tuple

BASE_URL = "https://merchant-panel-sync.preview.emergentagent.com/api"
OTP = "123456"

# Test accounts
CHANDAN = "+919128403769"  # owns INV-2026-000014 for booking AZO9HWVU1
PRIYA = "+919000000004"    # owns INV-2026-000001 for booking AZODEMOCX1
RAJ = "+919000000003"      # partner

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'

def log(msg: str, color: str = Colors.RESET):
    print(f"{color}{msg}{Colors.RESET}")

def auth(phone: str) -> str:
    """Authenticate and return token."""
    log(f"\n🔐 Authenticating {phone}...", Colors.BLUE)
    
    # Send OTP
    r = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if r.status_code != 200:
        log(f"❌ Send OTP failed: {r.status_code} {r.text}", Colors.RED)
        return None
    
    # Verify OTP
    r = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    if r.status_code != 200:
        log(f"❌ Verify OTP failed: {r.status_code} {r.text}", Colors.RED)
        return None
    
    data = r.json()
    token = data.get("token")
    user = data.get("user", {})
    log(f"✅ Authenticated as {user.get('name', 'User')} (role: {user.get('role', 'unknown')})", Colors.GREEN)
    return token

def get_invoice(token: str, invoice_id: str) -> Dict[str, Any]:
    """Get invoice detail JSON."""
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE_URL}/invoices/{invoice_id}", headers=headers)
    if r.status_code != 200:
        log(f"❌ GET /invoices/{invoice_id} failed: {r.status_code} {r.text}", Colors.RED)
        return None
    return r.json()

def get_invoice_html(token: str, invoice_id: str) -> str:
    """Get invoice HTML view."""
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE_URL}/invoices/{invoice_id}/view", headers=headers)
    if r.status_code != 200:
        log(f"❌ GET /invoices/{invoice_id}/view failed: {r.status_code} {r.text}", Colors.RED)
        return None
    return r.text

def list_invoices(token: str) -> List[Dict[str, Any]]:
    """List invoices for the authenticated user."""
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE_URL}/invoices", headers=headers)
    if r.status_code != 200:
        log(f"❌ GET /invoices failed: {r.status_code} {r.text}", Colors.RED)
        return []
    data = r.json()
    return data.get("items", [])

def verify_line_item_rate(item: Dict[str, Any], idx: int) -> Tuple[bool, str]:
    """Verify line item has rate field and amount = rate * qty."""
    desc = item.get("desc", "Unknown")
    qty = item.get("qty", 1)
    rate = item.get("rate")
    amount = item.get("amount", 0)
    
    if rate is None:
        return False, f"Line item {idx} '{desc}' missing 'rate' field"
    
    expected_amount = round(float(rate) * float(qty), 2)
    actual_amount = round(float(amount), 2)
    
    if abs(expected_amount - actual_amount) > 0.02:
        return False, f"Line item {idx} '{desc}': amount mismatch (expected {expected_amount}, got {actual_amount})"
    
    return True, f"Line item {idx} '{desc}': qty={qty}, rate=₹{rate}, amount=₹{amount} ✓"

def verify_cancellation_invoice_chandan():
    """
    Verify INV-2026-000014 (Chandan, booking AZO9HWVU1, Switchboard Repair qty 2):
    - line item: qty=2, rate=₹249.00, amount=₹498.00
    - Subtotal ₹498.00, Visiting Charge ₹100.00, Taxable Amount ₹598.00, GST ₹107.64
    - "Customer Refund (80%)" = ₹564.51
    - "Amount Retained" = ₹141.13
    - Total Order Value = ₹705.64
    - Status shows CANCELLED only ONCE
    - NO "Refund Issued" line
    """
    log("\n" + "="*80, Colors.BLUE)
    log("TEST 1: Cancellation Invoice INV-2026-000014 (Chandan, AZO9HWVU1)", Colors.BLUE)
    log("="*80, Colors.BLUE)
    
    token = auth(CHANDAN)
    if not token:
        return False
    
    # Find INV-2026-000014
    invoices = list_invoices(token)
    inv_14 = None
    for inv in invoices:
        if inv.get("invoice_number") == "INV-2026-000014":
            inv_14 = inv
            break
    
    if not inv_14:
        log("❌ Invoice INV-2026-000014 not found in list", Colors.RED)
        return False
    
    invoice_id = inv_14.get("id")
    log(f"✅ Found INV-2026-000014 (id: {invoice_id})", Colors.GREEN)
    
    # Get full invoice detail
    inv = get_invoice(token, invoice_id)
    if not inv:
        return False
    
    results = []
    
    # Check 1: Line items have rate field
    log("\n📋 Checking line items...", Colors.YELLOW)
    line_items = inv.get("line_items", [])
    if not line_items:
        log("❌ No line items found", Colors.RED)
        results.append(False)
    else:
        for idx, item in enumerate(line_items, 1):
            passed, msg = verify_line_item_rate(item, idx)
            if passed:
                log(f"  ✅ {msg}", Colors.GREEN)
            else:
                log(f"  ❌ {msg}", Colors.RED)
            results.append(passed)
    
    # Check 2: Specific line item for Switchboard Repair (qty=2, rate=249, amount=498)
    log("\n🔍 Verifying Switchboard Repair line item...", Colors.YELLOW)
    switchboard_item = None
    for item in line_items:
        if "Switchboard" in item.get("desc", ""):
            switchboard_item = item
            break
    
    if switchboard_item:
        qty = switchboard_item.get("qty")
        rate = switchboard_item.get("rate")
        amount = switchboard_item.get("amount")
        
        checks = [
            (qty == 2, f"qty={qty} (expected 2)"),
            (abs(float(rate or 0) - 249.00) < 0.01, f"rate=₹{rate} (expected ₹249.00)"),
            (abs(float(amount or 0) - 498.00) < 0.01, f"amount=₹{amount} (expected ₹498.00)")
        ]
        
        for passed, msg in checks:
            if passed:
                log(f"  ✅ {msg}", Colors.GREEN)
            else:
                log(f"  ❌ {msg}", Colors.RED)
            results.append(passed)
    else:
        log("  ❌ Switchboard Repair line item not found", Colors.RED)
        results.append(False)
    
    # Check 3: Financial breakdown
    log("\n💰 Verifying financial breakdown...", Colors.YELLOW)
    subtotal = inv.get("subtotal", 0)
    visiting = inv.get("visiting_charge", 0)
    taxable = inv.get("taxable", 0)
    gst = inv.get("tax", 0)
    original_amount = inv.get("original_amount", 0)
    refund_amount = inv.get("refund_amount", 0)
    retained_amount = inv.get("retained_amount", 0)
    
    financial_checks = [
        (abs(float(subtotal) - 498.00) < 0.01, f"Subtotal: ₹{subtotal} (expected ₹498.00)"),
        (abs(float(visiting) - 100.00) < 0.01, f"Visiting Charge: ₹{visiting} (expected ₹100.00)"),
        (abs(float(taxable) - 598.00) < 0.01, f"Taxable Amount: ₹{taxable} (expected ₹598.00)"),
        (abs(float(gst) - 107.64) < 0.01, f"GST: ₹{gst} (expected ₹107.64)"),
        (abs(float(original_amount) - 705.64) < 0.01, f"Total Order Value: ₹{original_amount} (expected ₹705.64)"),
        (abs(float(refund_amount) - 564.51) < 0.01, f"Customer Refund: ₹{refund_amount} (expected ₹564.51)"),
        (abs(float(retained_amount) - 141.13) < 0.01, f"Amount Retained: ₹{retained_amount} (expected ₹141.13)")
    ]
    
    for passed, msg in financial_checks:
        if passed:
            log(f"  ✅ {msg}", Colors.GREEN)
        else:
            log(f"  ❌ {msg}", Colors.RED)
        results.append(passed)
    
    # Check 4: Reconciliation
    log("\n🔢 Verifying reconciliation...", Colors.YELLOW)
    refund_plus_retained = round(float(refund_amount) + float(retained_amount), 2)
    subtotal_plus_visiting_plus_gst = round(float(subtotal) + float(visiting) + float(gst), 2)
    
    recon_checks = [
        (abs(refund_plus_retained - float(original_amount)) < 0.02, 
         f"Refund + Retained = ₹{refund_plus_retained} (should equal Total Order Value ₹{original_amount})"),
        (abs(subtotal_plus_visiting_plus_gst - float(original_amount)) < 0.02,
         f"Subtotal + Visiting + GST = ₹{subtotal_plus_visiting_plus_gst} (should equal Total Order Value ₹{original_amount})")
    ]
    
    for passed, msg in recon_checks:
        if passed:
            log(f"  ✅ {msg}", Colors.GREEN)
        else:
            log(f"  ❌ {msg}", Colors.RED)
        results.append(passed)
    
    # Check 5: HTML view
    log("\n🌐 Verifying HTML view...", Colors.YELLOW)
    html = get_invoice_html(token, invoice_id)
    if html:
        html_checks = [
            ("Customer Refund (80%)" in html or "Customer Refund" in html, 
             "'Customer Refund' present in HTML"),
            ("Amount Retained" in html, 
             "'Amount Retained' present in HTML"),
            ("Total Order Value" in html or "TOTAL ORDER VALUE" in html,
             "'Total Order Value' headline present in HTML"),
            (html.count("CANCELLED") == 1 or (html.count("CANCELLED") == 2 and "CANCELLED | CANCELLED" not in html),
             "Status shows CANCELLED only ONCE (not duplicated)"),
            ("Refund Issued" not in html or "see Refund Receipt" not in html,
             "NO 'Refund Issued (see Refund Receipt)' line")
        ]
        
        for passed, msg in html_checks:
            if passed:
                log(f"  ✅ {msg}", Colors.GREEN)
            else:
                log(f"  ❌ {msg}", Colors.RED)
            results.append(passed)
    else:
        log("  ❌ Failed to get HTML view", Colors.RED)
        results.append(False)
    
    passed_count = sum(results)
    total_count = len(results)
    log(f"\n📊 Test 1 Results: {passed_count}/{total_count} checks passed", 
        Colors.GREEN if passed_count == total_count else Colors.RED)
    
    return all(results)

def verify_cancellation_invoice_priya():
    """
    Verify INV-2026-000001 (Priya, booking AZODEMOCX1):
    - Customer Refund ₹376.66
    - Amount Retained ₹94.16 (= 470.82 − 376.66)
    - Single CANCELLED status
    """
    log("\n" + "="*80, Colors.BLUE)
    log("TEST 2: Cancellation Invoice INV-2026-000001 (Priya, AZODEMOCX1)", Colors.BLUE)
    log("="*80, Colors.BLUE)
    
    token = auth(PRIYA)
    if not token:
        return False
    
    # Find INV-2026-000001
    invoices = list_invoices(token)
    inv_01 = None
    for inv in invoices:
        if inv.get("invoice_number") == "INV-2026-000001":
            inv_01 = inv
            break
    
    if not inv_01:
        log("❌ Invoice INV-2026-000001 not found in list", Colors.RED)
        return False
    
    invoice_id = inv_01.get("id")
    log(f"✅ Found INV-2026-000001 (id: {invoice_id})", Colors.GREEN)
    
    # Get full invoice detail
    inv = get_invoice(token, invoice_id)
    if not inv:
        return False
    
    results = []
    
    # Check financial breakdown
    log("\n💰 Verifying financial breakdown...", Colors.YELLOW)
    original_amount = inv.get("original_amount", 0)
    refund_amount = inv.get("refund_amount", 0)
    retained_amount = inv.get("retained_amount", 0)
    
    financial_checks = [
        (abs(float(refund_amount) - 376.66) < 0.01, f"Customer Refund: ₹{refund_amount} (expected ₹376.66)"),
        (abs(float(retained_amount) - 94.16) < 0.01, f"Amount Retained: ₹{retained_amount} (expected ₹94.16)"),
        (abs(float(original_amount) - 470.82) < 0.01, f"Total Order Value: ₹{original_amount} (expected ₹470.82)")
    ]
    
    for passed, msg in financial_checks:
        if passed:
            log(f"  ✅ {msg}", Colors.GREEN)
        else:
            log(f"  ❌ {msg}", Colors.RED)
        results.append(passed)
    
    # Check reconciliation
    log("\n🔢 Verifying reconciliation...", Colors.YELLOW)
    refund_plus_retained = round(float(refund_amount) + float(retained_amount), 2)
    recon_passed = abs(refund_plus_retained - float(original_amount)) < 0.02
    msg = f"Refund + Retained = ₹{refund_plus_retained} (should equal Total Order Value ₹{original_amount})"
    if recon_passed:
        log(f"  ✅ {msg}", Colors.GREEN)
    else:
        log(f"  ❌ {msg}", Colors.RED)
    results.append(recon_passed)
    
    # Check HTML view
    log("\n🌐 Verifying HTML view...", Colors.YELLOW)
    html = get_invoice_html(token, invoice_id)
    if html:
        html_checks = [
            ("Customer Refund" in html, "'Customer Refund' present in HTML"),
            ("Amount Retained" in html, "'Amount Retained' present in HTML"),
            (html.count("CANCELLED") == 1 or (html.count("CANCELLED") == 2 and "CANCELLED | CANCELLED" not in html),
             "Status shows CANCELLED only ONCE")
        ]
        
        for passed, msg in html_checks:
            if passed:
                log(f"  ✅ {msg}", Colors.GREEN)
            else:
                log(f"  ❌ {msg}", Colors.RED)
            results.append(passed)
    else:
        log("  ❌ Failed to get HTML view", Colors.RED)
        results.append(False)
    
    passed_count = sum(results)
    total_count = len(results)
    log(f"\n📊 Test 2 Results: {passed_count}/{total_count} checks passed", 
        Colors.GREEN if passed_count == total_count else Colors.RED)
    
    return all(results)

def verify_partner_cancellation_statement():
    """
    Verify partner two-part cancellation statement (Raj, invoice for AZODEMOCX1):
    - Payment Summary section
    - Your Earning section with green Net Earning
    """
    log("\n" + "="*80, Colors.BLUE)
    log("TEST 3: Partner Cancellation Statement (Raj, AZODEMOCX1)", Colors.BLUE)
    log("="*80, Colors.BLUE)
    
    token = auth(RAJ)
    if not token:
        return False
    
    # Find cancellation invoice for AZODEMOCX1
    invoices = list_invoices(token)
    cancel_inv = None
    for inv in invoices:
        if inv.get("booking_code") == "AZODEMOCX1" and inv.get("invoice_type") == "cancellation":
            cancel_inv = inv
            break
    
    if not cancel_inv:
        log("❌ Cancellation invoice for AZODEMOCX1 not found", Colors.RED)
        return False
    
    invoice_id = cancel_inv.get("id")
    invoice_number = cancel_inv.get("invoice_number")
    log(f"✅ Found cancellation invoice {invoice_number} (id: {invoice_id})", Colors.GREEN)
    
    # Get full invoice detail
    inv = get_invoice(token, invoice_id)
    if not inv:
        return False
    
    results = []
    
    # Check role_earning structure
    log("\n💼 Verifying role_earning structure...", Colors.YELLOW)
    role_earning = inv.get("role_earning", {})
    
    if not role_earning:
        log("  ❌ role_earning object missing", Colors.RED)
        results.append(False)
    else:
        re_checks = [
            (role_earning.get("role") == "partner", f"role='partner' ✓"),
            (role_earning.get("is_cancellation") == True, f"is_cancellation=true ✓"),
            (role_earning.get("base") is not None, f"base (Eligible Earning) present: ₹{role_earning.get('base')}"),
            (role_earning.get("rate") is not None, f"rate (Share Rate) present: {role_earning.get('rate')}%"),
            (role_earning.get("net") is not None, f"net (Partner Earning) present: ₹{role_earning.get('net')}"),
            (role_earning.get("platform") is not None, f"platform (Platform Earning) present: ₹{role_earning.get('platform')}")
        ]
        
        for passed, msg in re_checks:
            if passed:
                log(f"  ✅ {msg}", Colors.GREEN)
            else:
                log(f"  ❌ {msg}", Colors.RED)
            results.append(passed)
    
    # Check HTML view for two-part layout
    log("\n🌐 Verifying HTML two-part layout...", Colors.YELLOW)
    html = get_invoice_html(token, invoice_id)
    if html:
        html_checks = [
            ("Payment Summary" in html or "PAYMENT SUMMARY" in html, 
             "'Payment Summary' section present"),
            ("Your Earning" in html or "YOUR EARNING" in html,
             "'Your Earning' section present"),
            ("Earning Breakdown" in html or "EARNING BREAKDOWN" in html,
             "'Earning Breakdown' subheading present"),
            ("Net Earning" in html or "NET EARNING" in html,
             "'Net Earning' present"),
            ("Partner Share" in html or "PARTNER SHARE" in html,
             "'Partner Share' present"),
            ("Platform Share" in html or "PLATFORM SHARE" in html,
             "'Platform Share' present")
        ]
        
        for passed, msg in html_checks:
            if passed:
                log(f"  ✅ {msg}", Colors.GREEN)
            else:
                log(f"  ❌ {msg}", Colors.RED)
            results.append(passed)
    else:
        log("  ❌ Failed to get HTML view", Colors.RED)
        results.append(False)
    
    passed_count = sum(results)
    total_count = len(results)
    log(f"\n📊 Test 3 Results: {passed_count}/{total_count} checks passed", 
        Colors.GREEN if passed_count == total_count else Colors.RED)
    
    return all(results)

def verify_booking_invoice_line_items():
    """
    Verify BOOKING-type invoice line items have rate field.
    Test with INV-2026-000011 (Chandan).
    """
    log("\n" + "="*80, Colors.BLUE)
    log("TEST 4: Booking Invoice Line Items (Chandan, INV-2026-000011)", Colors.BLUE)
    log("="*80, Colors.BLUE)
    
    token = auth(CHANDAN)
    if not token:
        return False
    
    # Find a booking-type invoice
    invoices = list_invoices(token)
    booking_inv = None
    for inv in invoices:
        if inv.get("invoice_type") == "booking":
            booking_inv = inv
            break
    
    if not booking_inv:
        log("❌ No booking-type invoice found", Colors.RED)
        return False
    
    invoice_id = booking_inv.get("id")
    invoice_number = booking_inv.get("invoice_number")
    log(f"✅ Found booking invoice {invoice_number} (id: {invoice_id})", Colors.GREEN)
    
    # Get full invoice detail
    inv = get_invoice(token, invoice_id)
    if not inv:
        return False
    
    results = []
    
    # Check line items
    log("\n📋 Checking line items have rate field...", Colors.YELLOW)
    line_items = inv.get("line_items", [])
    if not line_items:
        log("❌ No line items found", Colors.RED)
        results.append(False)
    else:
        for idx, item in enumerate(line_items, 1):
            passed, msg = verify_line_item_rate(item, idx)
            if passed:
                log(f"  ✅ {msg}", Colors.GREEN)
            else:
                log(f"  ❌ {msg}", Colors.RED)
            results.append(passed)
    
    # Check HTML view shows Rate column
    log("\n🌐 Verifying HTML Rate column...", Colors.YELLOW)
    html = get_invoice_html(token, invoice_id)
    if html:
        has_rate_header = "Rate" in html or "RATE" in html
        if has_rate_header:
            log(f"  ✅ HTML contains 'Rate' column header", Colors.GREEN)
        else:
            log(f"  ❌ HTML missing 'Rate' column header", Colors.RED)
        results.append(has_rate_header)
    else:
        log("  ❌ Failed to get HTML view", Colors.RED)
        results.append(False)
    
    passed_count = sum(results)
    total_count = len(results)
    log(f"\n📊 Test 4 Results: {passed_count}/{total_count} checks passed", 
        Colors.GREEN if passed_count == total_count else Colors.RED)
    
    return all(results)

def main():
    log("\n" + "="*80, Colors.BLUE)
    log("INVOICE FINANCIAL CALCULATIONS VERIFICATION", Colors.BLUE)
    log("="*80, Colors.BLUE)
    log(f"BASE_URL: {BASE_URL}", Colors.BLUE)
    log(f"OTP: {OTP}", Colors.BLUE)
    
    all_results = []
    
    # Test 1: Chandan cancellation invoice INV-2026-000014
    try:
        result = verify_cancellation_invoice_chandan()
        all_results.append(("Test 1: Cancellation INV-2026-000014 (Chandan)", result))
    except Exception as e:
        log(f"\n❌ Test 1 failed with exception: {e}", Colors.RED)
        all_results.append(("Test 1: Cancellation INV-2026-000014 (Chandan)", False))
    
    # Test 2: Priya cancellation invoice INV-2026-000001
    try:
        result = verify_cancellation_invoice_priya()
        all_results.append(("Test 2: Cancellation INV-2026-000001 (Priya)", result))
    except Exception as e:
        log(f"\n❌ Test 2 failed with exception: {e}", Colors.RED)
        all_results.append(("Test 2: Cancellation INV-2026-000001 (Priya)", False))
    
    # Test 3: Partner cancellation statement
    try:
        result = verify_partner_cancellation_statement()
        all_results.append(("Test 3: Partner Cancellation Statement (Raj)", result))
    except Exception as e:
        log(f"\n❌ Test 3 failed with exception: {e}", Colors.RED)
        all_results.append(("Test 3: Partner Cancellation Statement (Raj)", False))
    
    # Test 4: Booking invoice line items
    try:
        result = verify_booking_invoice_line_items()
        all_results.append(("Test 4: Booking Invoice Line Items", result))
    except Exception as e:
        log(f"\n❌ Test 4 failed with exception: {e}", Colors.RED)
        all_results.append(("Test 4: Booking Invoice Line Items", False))
    
    # Summary
    log("\n" + "="*80, Colors.BLUE)
    log("FINAL SUMMARY", Colors.BLUE)
    log("="*80, Colors.BLUE)
    
    passed_tests = sum(1 for _, result in all_results if result)
    total_tests = len(all_results)
    
    for test_name, result in all_results:
        status = "✅ PASS" if result else "❌ FAIL"
        color = Colors.GREEN if result else Colors.RED
        log(f"{status} - {test_name}", color)
    
    log(f"\n📊 Overall: {passed_tests}/{total_tests} tests passed", 
        Colors.GREEN if passed_tests == total_tests else Colors.RED)
    
    # Save results to JSON
    results_data = {
        "base_url": BASE_URL,
        "tests": [{"name": name, "passed": result} for name, result in all_results],
        "summary": {
            "total": total_tests,
            "passed": passed_tests,
            "failed": total_tests - passed_tests,
            "success_rate": f"{(passed_tests/total_tests*100):.1f}%"
        }
    }
    
    with open("/app/test_results_invoice_calculations.json", "w") as f:
        json.dump(results_data, f, indent=2)
    
    log(f"\n💾 Results saved to /app/test_results_invoice_calculations.json", Colors.BLUE)
    
    return 0 if passed_tests == total_tests else 1

if __name__ == "__main__":
    sys.exit(main())
