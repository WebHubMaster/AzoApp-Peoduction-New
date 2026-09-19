#!/usr/bin/env python3
"""
Invoice Financial Calculations Verification Test - Final Version
Uses booking codes instead of invoice numbers to find the correct invoices.
"""
import requests
import json
import sys

BASE_URL = "https://azoapp-otp-preview.preview.emergentagent.com/api"
OTP = "123456"

CHANDAN = "+919128403769"
PRIYA = "+919000000004"
RAJ = "+919000000003"

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
    r = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    r = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    if r.status_code != 200:
        return None
    data = r.json()
    return data.get("token")

def get_invoice(token: str, invoice_id: str):
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE_URL}/invoices/{invoice_id}", headers=headers)
    if r.status_code != 200:
        return None
    return r.json()

def get_invoice_html(token: str, invoice_id: str):
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE_URL}/invoices/{invoice_id}/view", headers=headers)
    if r.status_code != 200:
        return None
    return r.text

def list_invoices(token: str):
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE_URL}/invoices", headers=headers)
    if r.status_code != 200:
        return []
    return r.json().get("items", [])

def find_invoice_by_booking(token: str, booking_code: str, invoice_type: str):
    """Find invoice by booking code and type."""
    invoices = list_invoices(token)
    for inv in invoices:
        if inv.get("booking_code") == booking_code and inv.get("invoice_type") == invoice_type:
            return inv
    return None

def test_chandan_cancellation():
    """Test cancellation invoice for booking AZO9HWVU1 (Switchboard Repair qty 2)."""
    log("\n" + "="*80, Colors.BLUE)
    log("TEST 1: Cancellation Invoice for AZO9HWVU1 (Chandan, Switchboard Repair qty 2)", Colors.BLUE)
    log("="*80, Colors.BLUE)
    
    token = auth(CHANDAN)
    if not token:
        log("❌ Authentication failed", Colors.RED)
        return False
    
    log("✅ Authenticated as Chandan", Colors.GREEN)
    
    # Find cancellation invoice for AZO9HWVU1
    inv_summary = find_invoice_by_booking(token, "AZO9HWVU1", "cancellation")
    if not inv_summary:
        log("❌ Cancellation invoice for AZO9HWVU1 not found", Colors.RED)
        return False
    
    invoice_id = inv_summary["id"]
    invoice_number = inv_summary["invoice_number"]
    log(f"✅ Found cancellation invoice {invoice_number} (id: {invoice_id})", Colors.GREEN)
    
    # Get full invoice
    inv = get_invoice(token, invoice_id)
    if not inv:
        log("❌ Failed to get invoice detail", Colors.RED)
        return False
    
    results = []
    
    # Check line items
    log("\n📋 Checking line items...", Colors.YELLOW)
    line_items = inv.get("line_items", [])
    
    # Find Switchboard Repair item
    switchboard_item = None
    for item in line_items:
        if "Switchboard" in item.get("desc", ""):
            switchboard_item = item
            break
    
    if not switchboard_item:
        log("  ❌ Switchboard Repair line item not found", Colors.RED)
        results.append(False)
    else:
        qty = switchboard_item.get("qty")
        rate = switchboard_item.get("rate")
        amount = switchboard_item.get("amount")
        
        checks = [
            (qty == 2, f"qty={qty} (expected 2)"),
            (rate is not None and abs(float(rate) - 249.00) < 0.01, f"rate=₹{rate} (expected ₹249.00)"),
            (abs(float(amount or 0) - 498.00) < 0.01, f"amount=₹{amount} (expected ₹498.00)"),
            (rate is not None and abs(float(rate) * qty - float(amount)) < 0.01, 
             f"rate × qty = amount (₹{rate} × {qty} = ₹{amount})")
        ]
        
        for passed, msg in checks:
            if passed:
                log(f"  ✅ {msg}", Colors.GREEN)
            else:
                log(f"  ❌ {msg}", Colors.RED)
            results.append(passed)
    
    # Check financial breakdown
    log("\n💰 Verifying financial breakdown...", Colors.YELLOW)
    checks = [
        (abs(float(inv.get("subtotal", 0)) - 498.00) < 0.01, 
         f"Subtotal: ₹{inv.get('subtotal')} (expected ₹498.00)"),
        (abs(float(inv.get("visiting_charge", 0)) - 100.00) < 0.01,
         f"Visiting Charge: ₹{inv.get('visiting_charge')} (expected ₹100.00)"),
        (abs(float(inv.get("taxable", 0)) - 598.00) < 0.01,
         f"Taxable Amount: ₹{inv.get('taxable')} (expected ₹598.00)"),
        (abs(float(inv.get("tax", 0)) - 107.64) < 0.01,
         f"GST: ₹{inv.get('tax')} (expected ₹107.64)"),
        (abs(float(inv.get("original_amount", 0)) - 705.64) < 0.01,
         f"Total Order Value: ₹{inv.get('original_amount')} (expected ₹705.64)"),
        (abs(float(inv.get("refund_amount", 0)) - 564.51) < 0.01,
         f"Customer Refund: ₹{inv.get('refund_amount')} (expected ₹564.51)"),
        (abs(float(inv.get("retained_amount", 0)) - 141.13) < 0.01,
         f"Amount Retained: ₹{inv.get('retained_amount')} (expected ₹141.13)")
    ]
    
    for passed, msg in checks:
        if passed:
            log(f"  ✅ {msg}", Colors.GREEN)
        else:
            log(f"  ❌ {msg}", Colors.RED)
        results.append(passed)
    
    # Check reconciliation
    log("\n🔢 Verifying reconciliation...", Colors.YELLOW)
    refund = float(inv.get("refund_amount", 0))
    retained = float(inv.get("retained_amount", 0))
    original = float(inv.get("original_amount", 0))
    subtotal = float(inv.get("subtotal", 0))
    visiting = float(inv.get("visiting_charge", 0))
    gst = float(inv.get("tax", 0))
    
    recon_checks = [
        (abs((refund + retained) - original) < 0.02,
         f"Refund + Retained = ₹{refund + retained:.2f} (should equal Total Order Value ₹{original})"),
        (abs((subtotal + visiting + gst) - original) < 0.02,
         f"Subtotal + Visiting + GST = ₹{subtotal + visiting + gst:.2f} (should equal Total Order Value ₹{original})")
    ]
    
    for passed, msg in recon_checks:
        if passed:
            log(f"  ✅ {msg}", Colors.GREEN)
        else:
            log(f"  ❌ {msg}", Colors.RED)
        results.append(passed)
    
    # Check HTML
    log("\n🌐 Verifying HTML view...", Colors.YELLOW)
    html = get_invoice_html(token, invoice_id)
    if html:
        html_checks = [
            ("Customer Refund" in html, "'Customer Refund' present"),
            ("Amount Retained" in html, "'Amount Retained' present"),
            ("Total Order Value" in html or "TOTAL ORDER VALUE" in html, "'Total Order Value' headline present"),
            (html.count("CANCELLED") <= 2 and "CANCELLED | CANCELLED" not in html, "Status shows CANCELLED only ONCE"),
            ("Refund Issued" not in html or "see Refund Receipt" not in html, "NO 'Refund Issued (see Refund Receipt)' line")
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
    
    passed = sum(results)
    total = len(results)
    log(f"\n📊 Test 1: {passed}/{total} checks passed", 
        Colors.GREEN if passed == total else Colors.RED)
    
    return all(results)

def test_priya_cancellation():
    """Test cancellation invoice for booking AZODEMOCX1."""
    log("\n" + "="*80, Colors.BLUE)
    log("TEST 2: Cancellation Invoice for AZODEMOCX1 (Priya)", Colors.BLUE)
    log("="*80, Colors.BLUE)
    
    token = auth(PRIYA)
    if not token:
        log("❌ Authentication failed", Colors.RED)
        return False
    
    log("✅ Authenticated as Priya", Colors.GREEN)
    
    # Find cancellation invoice
    inv_summary = find_invoice_by_booking(token, "AZODEMOCX1", "cancellation")
    if not inv_summary:
        log("❌ Cancellation invoice for AZODEMOCX1 not found", Colors.RED)
        return False
    
    invoice_id = inv_summary["id"]
    invoice_number = inv_summary["invoice_number"]
    log(f"✅ Found cancellation invoice {invoice_number} (id: {invoice_id})", Colors.GREEN)
    
    # Get full invoice
    inv = get_invoice(token, invoice_id)
    if not inv:
        log("❌ Failed to get invoice detail", Colors.RED)
        return False
    
    results = []
    
    # Check financial breakdown
    log("\n💰 Verifying financial breakdown...", Colors.YELLOW)
    checks = [
        (abs(float(inv.get("refund_amount", 0)) - 376.66) < 0.01,
         f"Customer Refund: ₹{inv.get('refund_amount')} (expected ₹376.66)"),
        (abs(float(inv.get("retained_amount", 0)) - 94.16) < 0.01,
         f"Amount Retained: ₹{inv.get('retained_amount')} (expected ₹94.16)"),
        (abs(float(inv.get("original_amount", 0)) - 470.82) < 0.01,
         f"Total Order Value: ₹{inv.get('original_amount')} (expected ₹470.82)")
    ]
    
    for passed, msg in checks:
        if passed:
            log(f"  ✅ {msg}", Colors.GREEN)
        else:
            log(f"  ❌ {msg}", Colors.RED)
        results.append(passed)
    
    # Check reconciliation
    log("\n🔢 Verifying reconciliation...", Colors.YELLOW)
    refund = float(inv.get("refund_amount", 0))
    retained = float(inv.get("retained_amount", 0))
    original = float(inv.get("original_amount", 0))
    
    recon_passed = abs((refund + retained) - original) < 0.02
    msg = f"Refund + Retained = ₹{refund + retained:.2f} (should equal Total Order Value ₹{original})"
    if recon_passed:
        log(f"  ✅ {msg}", Colors.GREEN)
    else:
        log(f"  ❌ {msg}", Colors.RED)
    results.append(recon_passed)
    
    # Check HTML
    log("\n🌐 Verifying HTML view...", Colors.YELLOW)
    html = get_invoice_html(token, invoice_id)
    if html:
        html_checks = [
            ("Customer Refund" in html, "'Customer Refund' present"),
            ("Amount Retained" in html, "'Amount Retained' present"),
            (html.count("CANCELLED") <= 2 and "CANCELLED | CANCELLED" not in html, "Status shows CANCELLED only ONCE")
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
    
    passed = sum(results)
    total = len(results)
    log(f"\n📊 Test 2: {passed}/{total} checks passed",
        Colors.GREEN if passed == total else Colors.RED)
    
    return all(results)

def test_partner_statement():
    """Test partner two-part cancellation statement."""
    log("\n" + "="*80, Colors.BLUE)
    log("TEST 3: Partner Cancellation Statement (Raj, AZODEMOCX1)", Colors.BLUE)
    log("="*80, Colors.BLUE)
    
    token = auth(RAJ)
    if not token:
        log("❌ Authentication failed", Colors.RED)
        return False
    
    log("✅ Authenticated as Raj", Colors.GREEN)
    
    # Find cancellation invoice
    inv_summary = find_invoice_by_booking(token, "AZODEMOCX1", "cancellation")
    if not inv_summary:
        log("❌ Cancellation invoice for AZODEMOCX1 not found", Colors.RED)
        return False
    
    invoice_id = inv_summary["id"]
    invoice_number = inv_summary["invoice_number"]
    log(f"✅ Found cancellation invoice {invoice_number} (id: {invoice_id})", Colors.GREEN)
    
    # Get full invoice
    inv = get_invoice(token, invoice_id)
    if not inv:
        log("❌ Failed to get invoice detail", Colors.RED)
        return False
    
    results = []
    
    # Check role_earning
    log("\n💼 Verifying role_earning structure...", Colors.YELLOW)
    re = inv.get("role_earning", {})
    
    if not re:
        log("  ❌ role_earning missing", Colors.RED)
        results.append(False)
    else:
        checks = [
            (re.get("role") == "partner", "role='partner'"),
            (re.get("is_cancellation") == True, "is_cancellation=true"),
            (re.get("base") is not None, f"base (Eligible Earning): ₹{re.get('base')}"),
            (re.get("rate") is not None, f"rate (Share Rate): {re.get('rate')}%"),
            (re.get("net") is not None, f"net (Partner Earning): ₹{re.get('net')}"),
            (re.get("platform") is not None, f"platform (Platform Earning): ₹{re.get('platform')}")
        ]
        
        for passed, msg in checks:
            if passed:
                log(f"  ✅ {msg}", Colors.GREEN)
            else:
                log(f"  ❌ {msg}", Colors.RED)
            results.append(passed)
    
    # Check HTML
    log("\n🌐 Verifying HTML two-part layout...", Colors.YELLOW)
    html = get_invoice_html(token, invoice_id)
    if html:
        html_checks = [
            ("Payment Summary" in html or "PAYMENT SUMMARY" in html, "'Payment Summary' section"),
            ("Your Earning" in html or "YOUR EARNING" in html, "'Your Earning' section"),
            ("Earning Breakdown" in html or "EARNING BREAKDOWN" in html, "'Earning Breakdown' subheading"),
            ("Net Earning" in html or "NET EARNING" in html, "'Net Earning' present"),
            ("Partner Share" in html or "PARTNER SHARE" in html, "'Partner Share' present"),
            ("Platform Share" in html or "PLATFORM SHARE" in html, "'Platform Share' present")
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
    
    passed = sum(results)
    total = len(results)
    log(f"\n📊 Test 3: {passed}/{total} checks passed",
        Colors.GREEN if passed == total else Colors.RED)
    
    return all(results)

def main():
    log("\n" + "="*80, Colors.BLUE)
    log("INVOICE FINANCIAL CALCULATIONS VERIFICATION - FINAL", Colors.BLUE)
    log("="*80, Colors.BLUE)
    log(f"BASE_URL: {BASE_URL}", Colors.BLUE)
    
    all_results = []
    
    try:
        result = test_chandan_cancellation()
        all_results.append(("Test 1: Chandan Cancellation (AZO9HWVU1)", result))
    except Exception as e:
        log(f"\n❌ Test 1 failed with exception: {e}", Colors.RED)
        all_results.append(("Test 1: Chandan Cancellation (AZO9HWVU1)", False))
    
    try:
        result = test_priya_cancellation()
        all_results.append(("Test 2: Priya Cancellation (AZODEMOCX1)", result))
    except Exception as e:
        log(f"\n❌ Test 2 failed with exception: {e}", Colors.RED)
        all_results.append(("Test 2: Priya Cancellation (AZODEMOCX1)", False))
    
    try:
        result = test_partner_statement()
        all_results.append(("Test 3: Partner Statement (AZODEMOCX1)", result))
    except Exception as e:
        log(f"\n❌ Test 3 failed with exception: {e}", Colors.RED)
        all_results.append(("Test 3: Partner Statement (AZODEMOCX1)", False))
    
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
    
    log(f"\n📊 Overall: {passed_tests}/{total_tests} tests passed ({passed_tests/total_tests*100:.1f}%)",
        Colors.GREEN if passed_tests == total_tests else Colors.RED)
    
    # Save results
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
    
    with open("/app/test_results_invoice_calculations_final.json", "w") as f:
        json.dump(results_data, f, indent=2)
    
    log(f"\n💾 Results saved to /app/test_results_invoice_calculations_final.json", Colors.BLUE)
    
    return 0 if passed_tests == total_tests else 1

if __name__ == "__main__":
    sys.exit(main())
