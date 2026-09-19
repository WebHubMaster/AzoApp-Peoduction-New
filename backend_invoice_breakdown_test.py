#!/usr/bin/env python3
"""
Backend test for Invoice/PDF/HTML breakdown alignment + partner cancellation earning.

Review request: TEST BACKEND ONLY — AzoApp invoice/PDF/HTML alignment to the canonical
financial breakdown + partner cancellation earning.

BASE URL = REACT_APP_BACKEND_URL from /app/frontend/.env + /api
Auth = phone + OTP 123456
Users: customer +919000000004 (Priya), partner +919000000003 (Raj), 
       merchant +919000000002, admin +919000000000

SEEDED TEST DATA: cancelled+refunded booking code AZODEMOCX1
Invoices: cancellation INV-2026-000004, refund INV-2026-000005
Expected numbers: Fan Installation ₹299 (pure service) + Visiting Charge ₹100 (separate)
→ subtotal ₹399, GST 18% = ₹71.82, total ₹470.82
customer refund 80% = ₹376.66, retained ₹94.16
partner cancellation earning base ₹79.80 → partner 80% = ₹63.84, platform 20% = ₹15.96
"""

import requests
import json
import sys
from typing import Dict, Any, Optional

# Read BASE_URL from frontend/.env
BASE_URL = None
try:
    with open('/app/frontend/.env', 'r') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip() + '/api'
                break
except Exception as e:
    print(f"❌ Failed to read BASE_URL from /app/frontend/.env: {e}")
    sys.exit(1)

if not BASE_URL:
    print("❌ REACT_APP_BACKEND_URL not found in /app/frontend/.env")
    sys.exit(1)

print(f"BASE_URL: {BASE_URL}")

# Test credentials
CUSTOMER_PHONE = "+919000000004"  # Priya
PARTNER_PHONE = "+919000000003"   # Raj
MERCHANT_PHONE = "+919000000002"
ADMIN_PHONE = "+919000000000"
OTP = "123456"

# Expected test data
BOOKING_CODE = "AZODEMOCX1"
CANCELLATION_INVOICE_NUM = "INV-2026-000004"
REFUND_INVOICE_NUM = "INV-2026-000005"

# Expected financial numbers (with tolerance for rounding)
EXPECTED = {
    "service_amount": 299.0,  # Pure service, no visiting folded
    "visiting_charge": 100.0,  # Separate line
    "subtotal": 399.0,
    "gst_pct": 18.0,
    "tax": 71.82,
    "total": 470.82,
    "refund_pct": 80.0,
    "customer_refund": 376.66,
    "retained": 94.16,
    "partner_cancel_base": 79.80,
    "partner_cancel_rate": 80.0,
    "partner_earning": 63.84,
    "platform_earning": 15.96,
}

TOLERANCE = 0.02  # ±2 paisa tolerance for rounding

# Test results
results = {
    "total": 0,
    "passed": 0,
    "failed": 0,
    "tests": []
}

def log_test(name: str, passed: bool, details: str = ""):
    """Log a test result."""
    results["total"] += 1
    if passed:
        results["passed"] += 1
        print(f"✅ {name}")
    else:
        results["failed"] += 1
        print(f"❌ {name}")
        if details:
            print(f"   {details}")
    results["tests"].append({
        "name": name,
        "passed": passed,
        "details": details
    })

def login(phone: str) -> Optional[str]:
    """Login and return auth token."""
    try:
        # Request OTP
        r = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone}, timeout=10)
        if r.status_code != 200:
            print(f"❌ OTP request failed for {phone}: {r.status_code} - {r.text[:200]}")
            return None
        
        # Verify OTP
        r = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=10)
        if r.status_code != 200:
            print(f"❌ OTP verify failed for {phone}: {r.status_code}")
            return None
        
        data = r.json()
        token = data.get("token")
        if not token:
            print(f"❌ No token in response for {phone}")
            return None
        
        return token
    except Exception as e:
        print(f"❌ Login exception for {phone}: {e}")
        return None

def approx_equal(a: float, b: float, tolerance: float = TOLERANCE) -> bool:
    """Check if two floats are approximately equal within tolerance."""
    return abs(float(a) - float(b)) <= tolerance

def reconcile_breakdown(bd: Dict[str, Any]) -> Dict[str, Any]:
    """Verify breakdown reconciliation and return results."""
    errors = []
    
    # Extract values
    services_subtotal = float(bd.get("services_subtotal", 0))
    charges_total = float(bd.get("charges_total", 0))
    subtotal = float(bd.get("subtotal", 0))
    discount = float(bd.get("discount", 0))
    taxable = float(bd.get("taxable", 0))
    gst_pct = float(bd.get("gst_pct", 0))
    tax = float(bd.get("tax", 0))
    total = float(bd.get("total", 0))
    
    # Reconciliation checks
    # 1. services_subtotal + charges_total == subtotal
    calc_subtotal = services_subtotal + charges_total
    if not approx_equal(calc_subtotal, subtotal):
        errors.append(f"services_subtotal ({services_subtotal}) + charges_total ({charges_total}) = {calc_subtotal} != subtotal ({subtotal})")
    
    # 2. taxable == subtotal - discount
    calc_taxable = subtotal - discount
    if not approx_equal(calc_taxable, taxable):
        errors.append(f"subtotal ({subtotal}) - discount ({discount}) = {calc_taxable} != taxable ({taxable})")
    
    # 3. tax == round(taxable * gst_pct / 100, 2)
    calc_tax = round(taxable * gst_pct / 100, 2)
    if not approx_equal(calc_tax, tax):
        errors.append(f"round(taxable ({taxable}) * gst_pct ({gst_pct}) / 100, 2) = {calc_tax} != tax ({tax})")
    
    # 4. total == taxable + tax
    calc_total = taxable + tax
    if not approx_equal(calc_total, total):
        errors.append(f"taxable ({taxable}) + tax ({tax}) = {calc_total} != total ({total})")
    
    return {
        "reconciled": len(errors) == 0,
        "errors": errors,
        "values": {
            "services_subtotal": services_subtotal,
            "charges_total": charges_total,
            "subtotal": subtotal,
            "discount": discount,
            "taxable": taxable,
            "gst_pct": gst_pct,
            "tax": tax,
            "total": total,
        }
    }

def main():
    print("\n" + "="*80)
    print("BACKEND TEST: Invoice/PDF/HTML Breakdown Alignment + Partner Cancellation Earning")
    print("="*80 + "\n")
    
    # ========================================================================
    # TEST 1: Login as customer, find AZODEMOCX1 booking, get invoices
    # ========================================================================
    print("\n--- TEST 1: Customer Login & Find Booking ---")
    customer_token = login(CUSTOMER_PHONE)
    if not customer_token:
        log_test("TEST 1.1: Customer login", False, "Login failed")
        print("\n❌ Cannot proceed without customer login")
        return
    log_test("TEST 1.1: Customer login", True)
    
    headers_customer = {"Authorization": f"Bearer {customer_token}"}
    
    # Find AZODEMOCX1 booking
    try:
        r = requests.get(f"{BASE_URL}/bookings", headers=headers_customer, timeout=10)
        if r.status_code != 200:
            log_test("TEST 1.2: GET /api/bookings", False, f"Status {r.status_code}")
            print("\n❌ Cannot proceed without bookings")
            return
        log_test("TEST 1.2: GET /api/bookings", True)
        
        data = r.json()
        # Handle both list and dict responses
        if isinstance(data, list):
            bookings = data
        else:
            bookings = data.get("bookings", [])
        booking = None
        for b in bookings:
            if b.get("code") == BOOKING_CODE:
                booking = b
                break
        
        if not booking:
            log_test("TEST 1.3: Find booking AZODEMOCX1", False, f"Booking not found in {len(bookings)} bookings")
            print("\n❌ Cannot proceed without test booking")
            return
        log_test("TEST 1.3: Find booking AZODEMOCX1", True, f"Found booking id: {booking.get('id')}")
        
        booking_id = booking["id"]
        
    except Exception as e:
        log_test("TEST 1.2: GET /api/bookings", False, str(e))
        print("\n❌ Cannot proceed")
        return
    
    # Get invoices for this booking
    try:
        r = requests.get(f"{BASE_URL}/invoices", params={"booking_id": booking_id}, 
                        headers=headers_customer, timeout=10)
        if r.status_code != 200:
            log_test("TEST 1.4: GET /api/invoices?booking_id=<id>", False, f"Status {r.status_code}")
            print("\n❌ Cannot proceed without invoices")
            return
        log_test("TEST 1.4: GET /api/invoices?booking_id=<id>", True)
        
        invoices_data = r.json()
        invoices = invoices_data.get("items", [])
        
        # Find cancellation invoice
        cancel_invoice = None
        refund_invoice = None
        for inv in invoices:
            if inv.get("invoice_type") == "cancellation":
                cancel_invoice = inv
            elif inv.get("invoice_type") == "refund":
                refund_invoice = inv
        
        if not cancel_invoice:
            log_test("TEST 1.5: Find cancellation invoice", False, f"Not found in {len(invoices)} invoices")
            print("\n❌ Cannot proceed without cancellation invoice")
            return
        log_test("TEST 1.5: Find cancellation invoice", True, 
                f"Found: {cancel_invoice.get('invoice_number')} (id: {cancel_invoice.get('id')})")
        
        cancel_invoice_id = cancel_invoice["id"]
        
        if refund_invoice:
            log_test("TEST 1.6: Find refund invoice", True, 
                    f"Found: {refund_invoice.get('invoice_number')} (id: {refund_invoice.get('id')})")
            refund_invoice_id = refund_invoice["id"]
        else:
            log_test("TEST 1.6: Find refund invoice", False, "Not found")
            refund_invoice_id = None
        
    except Exception as e:
        log_test("TEST 1.4: GET /api/invoices", False, str(e))
        print("\n❌ Cannot proceed")
        return
    
    # ========================================================================
    # TEST 2: Verify cancellation invoice breakdown structure
    # ========================================================================
    print("\n--- TEST 2: Cancellation Invoice Breakdown Structure ---")
    
    try:
        r = requests.get(f"{BASE_URL}/invoices/{cancel_invoice_id}", 
                        headers=headers_customer, timeout=10)
        if r.status_code != 200:
            log_test("TEST 2.1: GET /api/invoices/{id} detail", False, f"Status {r.status_code}")
            print("\n❌ Cannot proceed without invoice detail")
            return
        log_test("TEST 2.1: GET /api/invoices/{id} detail", True)
        
        invoice_detail = r.json()
        
        # Check if breakdown exists
        if "breakdown" not in invoice_detail:
            log_test("TEST 2.2: Invoice has 'breakdown' field", False, "Field missing")
            print("\n❌ Cannot proceed without breakdown")
            return
        log_test("TEST 2.2: Invoice has 'breakdown' field", True)
        
        bd = invoice_detail["breakdown"]
        
        # Verify breakdown structure
        required_fields = ["services_subtotal", "additional_charges", "charges_total", 
                          "subtotal", "taxable", "tax", "total"]
        missing = [f for f in required_fields if f not in bd]
        if missing:
            log_test("TEST 2.3: Breakdown has required fields", False, f"Missing: {missing}")
        else:
            log_test("TEST 2.3: Breakdown has required fields", True)
        
        # Verify services_subtotal is PURE (no visiting folded)
        services_subtotal = float(bd.get("services_subtotal", 0))
        if approx_equal(services_subtotal, EXPECTED["service_amount"]):
            log_test("TEST 2.4: services_subtotal == ₹299 (PURE service)", True, 
                    f"services_subtotal = ₹{services_subtotal}")
        else:
            log_test("TEST 2.4: services_subtotal == ₹299 (PURE service)", False, 
                    f"Expected ₹{EXPECTED['service_amount']}, got ₹{services_subtotal}")
        
        # Verify Visiting Charge is in additional_charges (separate)
        additional_charges = bd.get("additional_charges", [])
        visiting_charge_entry = None
        for charge in additional_charges:
            if "visiting" in charge.get("label", "").lower():
                visiting_charge_entry = charge
                break
        
        if visiting_charge_entry:
            vc_amount = float(visiting_charge_entry.get("amount", 0))
            if approx_equal(vc_amount, EXPECTED["visiting_charge"]):
                log_test("TEST 2.5: Visiting Charge in additional_charges (separate)", True, 
                        f"Found: {visiting_charge_entry.get('label')} = ₹{vc_amount}")
            else:
                log_test("TEST 2.5: Visiting Charge in additional_charges (separate)", False, 
                        f"Expected ₹{EXPECTED['visiting_charge']}, got ₹{vc_amount}")
        else:
            log_test("TEST 2.5: Visiting Charge in additional_charges (separate)", False, 
                    f"Not found in {len(additional_charges)} charges")
        
        # Reconcile breakdown
        recon = reconcile_breakdown(bd)
        if recon["reconciled"]:
            log_test("TEST 2.6: Breakdown reconciliation", True, 
                    f"All formulas correct: subtotal={recon['values']['subtotal']}, "
                    f"taxable={recon['values']['taxable']}, tax={recon['values']['tax']}, "
                    f"total={recon['values']['total']}")
        else:
            log_test("TEST 2.6: Breakdown reconciliation", False, 
                    f"Errors: {'; '.join(recon['errors'])}")
        
        # Verify expected numbers
        if approx_equal(bd.get("subtotal", 0), EXPECTED["subtotal"]):
            log_test("TEST 2.7: subtotal == ₹399", True, f"subtotal = ₹{bd.get('subtotal')}")
        else:
            log_test("TEST 2.7: subtotal == ₹399", False, 
                    f"Expected ₹{EXPECTED['subtotal']}, got ₹{bd.get('subtotal')}")
        
        if approx_equal(bd.get("tax", 0), EXPECTED["tax"]):
            log_test("TEST 2.8: tax == ₹71.82", True, f"tax = ₹{bd.get('tax')}")
        else:
            log_test("TEST 2.8: tax == ₹71.82", False, 
                    f"Expected ₹{EXPECTED['tax']}, got ₹{bd.get('tax')}")
        
        if approx_equal(bd.get("total", 0), EXPECTED["total"]):
            log_test("TEST 2.9: total == ₹470.82", True, f"total = ₹{bd.get('total')}")
        else:
            log_test("TEST 2.9: total == ₹470.82", False, 
                    f"Expected ₹{EXPECTED['total']}, got ₹{bd.get('total')}")
        
    except Exception as e:
        log_test("TEST 2: Cancellation invoice breakdown", False, str(e))
        print("\n❌ Cannot proceed")
        return
    
    # ========================================================================
    # TEST 3: Customer cancellation invoice PDF download
    # ========================================================================
    print("\n--- TEST 3: Customer Cancellation Invoice PDF ---")
    
    try:
        r = requests.get(f"{BASE_URL}/invoices/{cancel_invoice_id}/pdf", 
                        headers=headers_customer, timeout=15)
        if r.status_code != 200:
            log_test("TEST 3.1: GET /api/invoices/{id}/pdf as CUSTOMER", False, 
                    f"Status {r.status_code}")
        else:
            log_test("TEST 3.1: GET /api/invoices/{id}/pdf as CUSTOMER", True, 
                    f"Status 200")
        
        if r.headers.get("content-type") == "application/pdf":
            log_test("TEST 3.2: Content-Type: application/pdf", True)
        else:
            log_test("TEST 3.2: Content-Type: application/pdf", False, 
                    f"Got: {r.headers.get('content-type')}")
        
        pdf_size = len(r.content)
        if pdf_size > 1024:  # > 1KB
            log_test("TEST 3.3: PDF body non-empty (>1KB)", True, f"Size: {pdf_size} bytes")
        else:
            log_test("TEST 3.3: PDF body non-empty (>1KB)", False, f"Size: {pdf_size} bytes")
        
        # Check for PDF magic bytes
        if r.content[:4] == b'%PDF':
            log_test("TEST 3.4: PDF magic bytes present", True)
        else:
            log_test("TEST 3.4: PDF magic bytes present", False, 
                    f"First 4 bytes: {r.content[:4]}")
        
    except Exception as e:
        log_test("TEST 3: Customer PDF download", False, str(e))
    
    # ========================================================================
    # TEST 4: Partner cancellation invoice & role_earning
    # ========================================================================
    print("\n--- TEST 4: Partner Cancellation Invoice & Earning ---")
    
    partner_token = login(PARTNER_PHONE)
    if not partner_token:
        log_test("TEST 4.1: Partner login", False, "Login failed")
        print("\n⚠️  Skipping partner tests")
    else:
        log_test("TEST 4.1: Partner login", True)
        headers_partner = {"Authorization": f"Bearer {partner_token}"}
        
        try:
            r = requests.get(f"{BASE_URL}/invoices/{cancel_invoice_id}", 
                            headers=headers_partner, timeout=10)
            if r.status_code != 200:
                log_test("TEST 4.2: GET /api/invoices/{id} as PARTNER", False, 
                        f"Status {r.status_code}")
            else:
                log_test("TEST 4.2: GET /api/invoices/{id} as PARTNER", True)
                
                partner_invoice = r.json()
                
                # Check role_earning
                if "role_earning" not in partner_invoice:
                    log_test("TEST 4.3: Invoice has 'role_earning' field", False, "Field missing")
                else:
                    log_test("TEST 4.3: Invoice has 'role_earning' field", True)
                    
                    re = partner_invoice["role_earning"]
                    
                    # Verify role_earning structure
                    if re.get("role") == "partner":
                        log_test("TEST 4.4: role_earning.role == 'partner'", True)
                    else:
                        log_test("TEST 4.4: role_earning.role == 'partner'", False, 
                                f"Got: {re.get('role')}")
                    
                    if re.get("is_cancellation") == True:
                        log_test("TEST 4.5: role_earning.is_cancellation == true", True)
                    else:
                        log_test("TEST 4.5: role_earning.is_cancellation == true", False, 
                                f"Got: {re.get('is_cancellation')}")
                    
                    # Verify base (cancellation charge)
                    base = float(re.get("base", 0))
                    if approx_equal(base, EXPECTED["partner_cancel_base"]):
                        log_test("TEST 4.6: role_earning.base ≈ ₹79.80", True, f"base = ₹{base}")
                    else:
                        log_test("TEST 4.6: role_earning.base ≈ ₹79.80", False, 
                                f"Expected ₹{EXPECTED['partner_cancel_base']}, got ₹{base}")
                    
                    # Verify rate
                    rate = float(re.get("rate", 0))
                    if approx_equal(rate, EXPECTED["partner_cancel_rate"]):
                        log_test("TEST 4.7: role_earning.rate == 80", True, f"rate = {rate}%")
                    else:
                        log_test("TEST 4.7: role_earning.rate == 80", False, 
                                f"Expected {EXPECTED['partner_cancel_rate']}%, got {rate}%")
                    
                    # Verify net (partner earning)
                    net = float(re.get("net", 0))
                    if approx_equal(net, EXPECTED["partner_earning"]):
                        log_test("TEST 4.8: role_earning.net ≈ ₹63.84", True, f"net = ₹{net}")
                    else:
                        log_test("TEST 4.8: role_earning.net ≈ ₹63.84", False, 
                                f"Expected ₹{EXPECTED['partner_earning']}, got ₹{net}")
                    
                    # Verify platform
                    platform = float(re.get("platform", 0))
                    if approx_equal(platform, EXPECTED["platform_earning"]):
                        log_test("TEST 4.9: role_earning.platform ≈ ₹15.96", True, 
                                f"platform = ₹{platform}")
                    else:
                        log_test("TEST 4.9: role_earning.platform ≈ ₹15.96", False, 
                                f"Expected ₹{EXPECTED['platform_earning']}, got ₹{platform}")
            
            # Partner PDF download
            r = requests.get(f"{BASE_URL}/invoices/{cancel_invoice_id}/pdf", 
                            headers=headers_partner, timeout=15)
            if r.status_code != 200:
                log_test("TEST 4.10: GET /api/invoices/{id}/pdf as PARTNER", False, 
                        f"Status {r.status_code}")
            else:
                log_test("TEST 4.10: GET /api/invoices/{id}/pdf as PARTNER", True)
                
                pdf_size = len(r.content)
                if pdf_size > 1024:
                    log_test("TEST 4.11: Partner PDF non-empty", True, f"Size: {pdf_size} bytes")
                else:
                    log_test("TEST 4.11: Partner PDF non-empty", False, f"Size: {pdf_size} bytes")
        
        except Exception as e:
            log_test("TEST 4: Partner invoice", False, str(e))
    
    # ========================================================================
    # TEST 5: Refund receipt PDF
    # ========================================================================
    print("\n--- TEST 5: Refund Receipt PDF ---")
    
    if refund_invoice_id:
        try:
            r = requests.get(f"{BASE_URL}/invoices/{refund_invoice_id}/pdf", 
                            headers=headers_customer, timeout=15)
            if r.status_code != 200:
                log_test("TEST 5.1: GET refund receipt PDF as CUSTOMER", False, 
                        f"Status {r.status_code}")
            else:
                log_test("TEST 5.1: GET refund receipt PDF as CUSTOMER", True)
                
                pdf_size = len(r.content)
                if pdf_size > 1024:
                    log_test("TEST 5.2: Refund PDF non-empty", True, f"Size: {pdf_size} bytes")
                else:
                    log_test("TEST 5.2: Refund PDF non-empty", False, f"Size: {pdf_size} bytes")
        except Exception as e:
            log_test("TEST 5: Refund receipt PDF", False, str(e))
    else:
        log_test("TEST 5: Refund receipt PDF", False, "Refund invoice not found earlier")
    
    # ========================================================================
    # TEST 6: Regression - GET /api/bookings returns breakdown
    # ========================================================================
    print("\n--- TEST 6: Regression - Bookings Endpoint Returns Breakdown ---")
    
    try:
        r = requests.get(f"{BASE_URL}/bookings", headers=headers_customer, timeout=10)
        if r.status_code != 200:
            log_test("TEST 6.1: GET /api/bookings", False, f"Status {r.status_code}")
        else:
            log_test("TEST 6.1: GET /api/bookings", True)
            
            data = r.json()
            # Handle both list and dict responses
            if isinstance(data, list):
                bookings = data
            else:
                bookings = data.get("bookings", [])
            if len(bookings) == 0:
                log_test("TEST 6.2: Bookings list non-empty", False, "No bookings returned")
            else:
                log_test("TEST 6.2: Bookings list non-empty", True, f"Found {len(bookings)} bookings")
                
                # Check if all bookings have breakdown
                bookings_with_breakdown = [b for b in bookings if "breakdown" in b]
                if len(bookings_with_breakdown) == len(bookings):
                    log_test("TEST 6.3: All bookings have 'breakdown' field", True, 
                            f"{len(bookings_with_breakdown)}/{len(bookings)} bookings")
                else:
                    log_test("TEST 6.3: All bookings have 'breakdown' field", False, 
                            f"Only {len(bookings_with_breakdown)}/{len(bookings)} have breakdown")
                
                # Verify breakdown reconciliation for a few bookings
                sample_size = min(3, len(bookings_with_breakdown))
                recon_passed = 0
                for b in bookings_with_breakdown[:sample_size]:
                    bd = b.get("breakdown", {})
                    recon = reconcile_breakdown(bd)
                    if recon["reconciled"]:
                        recon_passed += 1
                
                if recon_passed == sample_size:
                    log_test("TEST 6.4: Sample bookings breakdown reconciles", True, 
                            f"{recon_passed}/{sample_size} reconciled")
                else:
                    log_test("TEST 6.4: Sample bookings breakdown reconciles", False, 
                            f"Only {recon_passed}/{sample_size} reconciled")
    
    except Exception as e:
        log_test("TEST 6: Regression bookings", False, str(e))
    
    # ========================================================================
    # TEST 7: No 5xx errors
    # ========================================================================
    print("\n--- TEST 7: No 5xx Errors ---")
    
    # We've already made many requests above. Check if any returned 5xx
    # For this test, we'll just verify the key endpoints don't return 5xx
    endpoints_to_check = [
        ("GET /api/bookings", f"{BASE_URL}/bookings", headers_customer),
        ("GET /api/invoices", f"{BASE_URL}/invoices", headers_customer),
    ]
    
    all_ok = True
    for name, url, headers in endpoints_to_check:
        try:
            r = requests.get(url, headers=headers, timeout=10)
            if 500 <= r.status_code < 600:
                log_test(f"TEST 7: {name} no 5xx", False, f"Got {r.status_code}")
                all_ok = False
            else:
                log_test(f"TEST 7: {name} no 5xx", True, f"Status {r.status_code}")
        except Exception as e:
            log_test(f"TEST 7: {name} no 5xx", False, str(e))
            all_ok = False
    
    # ========================================================================
    # Summary
    # ========================================================================
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"Total tests: {results['total']}")
    print(f"Passed: {results['passed']} ✅")
    print(f"Failed: {results['failed']} ❌")
    print(f"Success rate: {results['passed']/results['total']*100:.1f}%")
    print("="*80 + "\n")
    
    # Save results to JSON
    with open('/app/test_results_invoice_breakdown.json', 'w') as f:
        json.dump(results, f, indent=2)
    print("Results saved to: /app/test_results_invoice_breakdown.json\n")
    
    # Exit with appropriate code
    sys.exit(0 if results['failed'] == 0 else 1)

if __name__ == "__main__":
    main()
