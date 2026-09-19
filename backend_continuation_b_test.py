#!/usr/bin/env python3
"""
Backend Testing Script for CONTINUATION-B Tasks
Tests partner cancellation invoice and customer booking cancellation data
"""
import requests
import json
import sys
from typing import Dict, Optional

# Configuration
BASE_URL = "https://azoapp-otp-preview.preview.emergentagent.com/api"
PARTNER_PHONE = "+919000000003"  # Raj Kumar
CUSTOMER_PHONE = "+919000000004"  # Priya Verma
OTP = "123456"
DEMO_INVOICE_ID = "4f208c7b-5e7a-4704-bf64-cecf70d74383"  # INV-2026-000001
DEMO_BOOKING_CODE = "AZODEMOCX1"

# Test results
results = {
    "total": 0,
    "passed": 0,
    "failed": 0,
    "tests": []
}

def log_test(name: str, passed: bool, details: str = ""):
    """Log test result"""
    results["total"] += 1
    if passed:
        results["passed"] += 1
        print(f"✅ PASS: {name}")
    else:
        results["failed"] += 1
        print(f"❌ FAIL: {name}")
    
    if details:
        print(f"   {details}")
    
    results["tests"].append({
        "name": name,
        "passed": passed,
        "details": details
    })

def auth_flow(phone: str) -> Optional[str]:
    """Authenticate and return token"""
    try:
        # Send OTP
        resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone}, timeout=10)
        if resp.status_code != 200:
            print(f"❌ Failed to send OTP for {phone}: {resp.status_code}")
            return None
        
        # Verify OTP
        resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=10)
        if resp.status_code != 200:
            print(f"❌ Failed to verify OTP for {phone}: {resp.status_code}")
            return None
        
        data = resp.json()
        token = data.get("token")
        if not token:
            print(f"❌ No token in response for {phone}")
            return None
        
        print(f"✅ Authenticated {phone}")
        return token
    except Exception as e:
        print(f"❌ Auth error for {phone}: {e}")
        return None

def test_partner_invoice_json(token: str):
    """TASK 1.1: Partner GET /api/invoices/{id} - JSON response with role_earning"""
    print("\n=== TASK 1.1: Partner Invoice JSON (role_earning) ===")
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/invoices/{DEMO_INVOICE_ID}", headers=headers, timeout=10)
        
        if resp.status_code != 200:
            log_test("1.1 - GET /api/invoices/{id} returns 200", False, f"Status: {resp.status_code}")
            return
        
        log_test("1.1 - GET /api/invoices/{id} returns 200", True)
        
        data = resp.json()
        
        # Check role_earning exists
        role_earning = data.get("role_earning")
        if not role_earning:
            log_test("1.1 - response.role_earning exists", False, "role_earning field missing")
            return
        
        log_test("1.1 - response.role_earning exists", True)
        
        # Check role_earning.role = "partner"
        if role_earning.get("role") != "partner":
            log_test("1.1 - role_earning.role = 'partner'", False, f"Got: {role_earning.get('role')}")
        else:
            log_test("1.1 - role_earning.role = 'partner'", True)
        
        # Check is_cancellation = true
        if not role_earning.get("is_cancellation"):
            log_test("1.1 - role_earning.is_cancellation = true", False, f"Got: {role_earning.get('is_cancellation')}")
        else:
            log_test("1.1 - role_earning.is_cancellation = true", True)
        
        # Check base ≈ 79.80
        base = role_earning.get("base", 0)
        if abs(base - 79.80) > 0.5:
            log_test("1.1 - role_earning.base ≈ 79.80", False, f"Got: {base}")
        else:
            log_test("1.1 - role_earning.base ≈ 79.80", True, f"Actual: {base}")
        
        # Check rate = 80
        rate = role_earning.get("rate", 0)
        if abs(rate - 80) > 1:
            log_test("1.1 - role_earning.rate = 80", False, f"Got: {rate}")
        else:
            log_test("1.1 - role_earning.rate = 80", True, f"Actual: {rate}")
        
        # Check net ≈ 63.84
        net = role_earning.get("net", 0)
        if abs(net - 63.84) > 0.5:
            log_test("1.1 - role_earning.net ≈ 63.84", False, f"Got: {net}")
        else:
            log_test("1.1 - role_earning.net ≈ 63.84", True, f"Actual: {net}")
        
        # Check platform ≈ 15.96
        platform = role_earning.get("platform", 0)
        if abs(platform - 15.96) > 0.5:
            log_test("1.1 - role_earning.platform ≈ 15.96", False, f"Got: {platform}")
        else:
            log_test("1.1 - role_earning.platform ≈ 15.96", True, f"Actual: {platform}")
        
        print(f"\n📊 role_earning data: {json.dumps(role_earning, indent=2)}")
        
    except Exception as e:
        log_test("1.1 - GET /api/invoices/{id}", False, f"Exception: {e}")

def test_partner_invoice_html(token: str):
    """TASK 1.2: Partner GET /api/invoices/{id}/view - HTML with required strings"""
    print("\n=== TASK 1.2: Partner Invoice HTML View ===")
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/invoices/{DEMO_INVOICE_ID}/view", headers=headers, timeout=10)
        
        if resp.status_code != 200:
            log_test("1.2 - GET /api/invoices/{id}/view returns 200", False, f"Status: {resp.status_code}")
            return
        
        log_test("1.2 - GET /api/invoices/{id}/view returns 200", True)
        
        html = resp.text
        
        # Check required strings
        required_strings = [
            "Payment Summary",
            "Total Booking Amount",
            "Amount Retained",
            "Your Earning",
            "Earning Breakdown",
            "Net Earning"
        ]
        
        for req_str in required_strings:
            if req_str in html:
                log_test(f"1.2 - HTML contains '{req_str}'", True)
            else:
                log_test(f"1.2 - HTML contains '{req_str}'", False, "String not found in HTML")
        
        # Check Amount Retained = 94.16 (470.82 - 376.66)
        if "94.16" in html or "₹94.16" in html or "94.2" in html:
            log_test("1.2 - HTML contains Amount Retained ≈ ₹94.16", True)
        else:
            log_test("1.2 - HTML contains Amount Retained ≈ ₹94.16", False, "Amount 94.16 not found")
        
        # Save HTML for inspection
        with open("/app/partner_invoice.html", "w") as f:
            f.write(html)
        print("   💾 Saved HTML to /app/partner_invoice.html")
        
    except Exception as e:
        log_test("1.2 - GET /api/invoices/{id}/view", False, f"Exception: {e}")

def test_partner_invoice_pdf(token: str):
    """TASK 1.3: Partner GET /api/invoices/{id}/pdf - PDF download"""
    print("\n=== TASK 1.3: Partner Invoice PDF Download ===")
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/invoices/{DEMO_INVOICE_ID}/pdf", headers=headers, timeout=15)
        
        if resp.status_code != 200:
            log_test("1.3 - GET /api/invoices/{id}/pdf returns 200", False, f"Status: {resp.status_code}")
            return
        
        log_test("1.3 - GET /api/invoices/{id}/pdf returns 200", True)
        
        # Check content-type
        content_type = resp.headers.get("content-type", "")
        if "application/pdf" in content_type:
            log_test("1.3 - Content-Type is application/pdf", True, f"Content-Type: {content_type}")
        else:
            log_test("1.3 - Content-Type is application/pdf", False, f"Got: {content_type}")
        
        # Check PDF magic bytes
        content = resp.content
        if content and content[:4] == b'%PDF':
            log_test("1.3 - PDF magic bytes present (%PDF)", True, f"Size: {len(content)} bytes")
        else:
            log_test("1.3 - PDF magic bytes present (%PDF)", False, f"First bytes: {content[:10]}")
        
        # Check non-empty
        if len(content) > 1000:
            log_test("1.3 - PDF body is non-empty (>1KB)", True, f"Size: {len(content)} bytes")
        else:
            log_test("1.3 - PDF body is non-empty (>1KB)", False, f"Size: {len(content)} bytes")
        
        # Save PDF for inspection
        with open("/app/partner_invoice.pdf", "wb") as f:
            f.write(content)
        print("   💾 Saved PDF to /app/partner_invoice.pdf")
        
    except Exception as e:
        log_test("1.3 - GET /api/invoices/{id}/pdf", False, f"Exception: {e}")

def test_customer_booking_cancellation(token: str):
    """TASK 2: Customer GET /api/bookings - cancellation data"""
    print("\n=== TASK 2: Customer Booking Cancellation Data ===")
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/bookings", headers=headers, timeout=10)
        
        if resp.status_code != 200:
            log_test("2 - GET /api/bookings returns 200", False, f"Status: {resp.status_code}")
            return
        
        log_test("2 - GET /api/bookings returns 200", True)
        
        bookings = resp.json()
        
        # Find AZODEMOCX1
        demo_booking = None
        for b in bookings:
            if b.get("code") == DEMO_BOOKING_CODE:
                demo_booking = b
                break
        
        if not demo_booking:
            log_test("2 - Booking AZODEMOCX1 found", False, f"Found {len(bookings)} bookings, but not AZODEMOCX1")
            return
        
        log_test("2 - Booking AZODEMOCX1 found", True)
        
        # Check status = "cancelled"
        status = demo_booking.get("status")
        if status == "cancelled":
            log_test("2 - booking.status = 'cancelled'", True)
        else:
            log_test("2 - booking.status = 'cancelled'", False, f"Got: {status}")
        
        # Check payment_status = "refunded"
        payment_status = demo_booking.get("payment_status")
        if payment_status == "refunded":
            log_test("2 - booking.payment_status = 'refunded'", True)
        else:
            log_test("2 - booking.payment_status = 'refunded'", False, f"Got: {payment_status}")
        
        # Check cancellation object
        cancellation = demo_booking.get("cancellation")
        if not cancellation:
            log_test("2 - booking.cancellation exists", False, "cancellation field missing")
            return
        
        log_test("2 - booking.cancellation exists", True)
        
        # Check refund ≈ 376.66
        refund = cancellation.get("refund", 0)
        if abs(refund - 376.66) > 0.5:
            log_test("2 - cancellation.refund ≈ 376.66", False, f"Got: {refund}")
        else:
            log_test("2 - cancellation.refund ≈ 376.66", True, f"Actual: {refund}")
        
        # Check refund_pct = 80
        refund_pct = cancellation.get("refund_pct", 0)
        if abs(refund_pct - 80) > 1:
            log_test("2 - cancellation.refund_pct = 80", False, f"Got: {refund_pct}")
        else:
            log_test("2 - cancellation.refund_pct = 80", True, f"Actual: {refund_pct}")
        
        # Check cancel_charge ≈ 79.80
        cancel_charge = cancellation.get("cancel_charge", 0)
        if abs(cancel_charge - 79.80) > 0.5:
            log_test("2 - cancellation.cancel_charge ≈ 79.80", False, f"Got: {cancel_charge}")
        else:
            log_test("2 - cancellation.cancel_charge ≈ 79.80", True, f"Actual: {cancel_charge}")
        
        # Check original_amount ≈ 470.82
        original_amount = cancellation.get("original_amount", 0)
        if abs(original_amount - 470.82) > 0.5:
            log_test("2 - cancellation.original_amount ≈ 470.82", False, f"Got: {original_amount}")
        else:
            log_test("2 - cancellation.original_amount ≈ 470.82", True, f"Actual: {original_amount}")
        
        print(f"\n📊 cancellation data: {json.dumps(cancellation, indent=2)}")
        
    except Exception as e:
        log_test("2 - GET /api/bookings", False, f"Exception: {e}")

def test_regression_partner_paid_invoice(token: str):
    """REGRESSION: Partner paid booking invoice still works"""
    print("\n=== REGRESSION: Partner Paid Booking Invoice ===")
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        
        # List invoices
        resp = requests.get(f"{BASE_URL}/invoices", headers=headers, timeout=10)
        
        if resp.status_code != 200:
            log_test("REG - GET /api/invoices returns 200", False, f"Status: {resp.status_code}")
            return
        
        log_test("REG - GET /api/invoices returns 200", True)
        
        data = resp.json()
        
        # Handle both list and dict responses
        if isinstance(data, dict):
            invoices = data.get("invoices", [])
        elif isinstance(data, list):
            invoices = data
        else:
            log_test("REG - Parse invoices list", False, f"Unexpected response type: {type(data)}")
            return
        
        # Find a non-cancellation invoice (paid booking)
        paid_invoice = None
        for inv in invoices:
            if isinstance(inv, dict) and inv.get("invoice_type") != "cancellation" and inv.get("payment_status") == "paid":
                paid_invoice = inv
                break
        
        if not paid_invoice:
            print("   ⚠️  No paid booking invoices found - skipping regression test")
            return
        
        log_test("REG - Found non-cancellation paid invoice", True, f"Invoice: {paid_invoice.get('invoice_number')}")
        
        invoice_id = paid_invoice.get("id")
        
        # Test GET /api/invoices/{id}
        resp = requests.get(f"{BASE_URL}/invoices/{invoice_id}", headers=headers, timeout=10)
        if resp.status_code == 200:
            log_test("REG - GET /api/invoices/{id} for paid booking returns 200", True)
            inv_data = resp.json()
            if inv_data.get("role_earning"):
                log_test("REG - Paid invoice has role_earning", True)
            else:
                log_test("REG - Paid invoice has role_earning", False, "role_earning missing")
        else:
            log_test("REG - GET /api/invoices/{id} for paid booking returns 200", False, f"Status: {resp.status_code}")
        
        # Test GET /api/invoices/{id}/view
        resp = requests.get(f"{BASE_URL}/invoices/{invoice_id}/view", headers=headers, timeout=10)
        if resp.status_code == 200:
            log_test("REG - GET /api/invoices/{id}/view for paid booking returns 200", True)
        else:
            log_test("REG - GET /api/invoices/{id}/view for paid booking returns 200", False, f"Status: {resp.status_code}")
        
    except Exception as e:
        log_test("REG - Partner paid invoice regression", False, f"Exception: {e}")

def test_regression_customer_invoice(token: str):
    """REGRESSION: Customer invoice still works"""
    print("\n=== REGRESSION: Customer Invoice ===")
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        
        # List invoices
        resp = requests.get(f"{BASE_URL}/invoices", headers=headers, timeout=10)
        
        if resp.status_code != 200:
            log_test("REG - Customer GET /api/invoices returns 200", False, f"Status: {resp.status_code}")
            return
        
        log_test("REG - Customer GET /api/invoices returns 200", True)
        
        data = resp.json()
        
        # Handle both list and dict responses
        if isinstance(data, dict):
            invoices = data.get("invoices", [])
        elif isinstance(data, list):
            invoices = data
        else:
            log_test("REG - Parse invoices list", False, f"Unexpected response type: {type(data)}")
            return
        
        if not invoices or len(invoices) == 0:
            print("   ⚠️  No invoices found - skipping regression test")
            return
        
        log_test("REG - Customer has invoices", True, f"Found {len(invoices)} invoices")
        
        # Test first invoice
        first_invoice = invoices[0]
        if not isinstance(first_invoice, dict):
            log_test("REG - First invoice is valid", False, f"Invoice is not a dict: {type(first_invoice)}")
            return
        
        invoice_id = first_invoice.get("id")
        if not invoice_id:
            log_test("REG - First invoice has id", False, "Invoice id missing")
            return
        
        # Test GET /api/invoices/{id}/view
        resp = requests.get(f"{BASE_URL}/invoices/{invoice_id}/view", headers=headers, timeout=10)
        if resp.status_code == 200:
            log_test("REG - Customer GET /api/invoices/{id}/view returns 200", True)
        else:
            log_test("REG - Customer GET /api/invoices/{id}/view returns 200", False, f"Status: {resp.status_code}")
        
    except Exception as e:
        log_test("REG - Customer invoice regression", False, f"Exception: {e}")

def print_summary():
    """Print test summary"""
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    print(f"Total Tests: {results['total']}")
    print(f"Passed: {results['passed']} ✅")
    print(f"Failed: {results['failed']} ❌")
    print(f"Success Rate: {(results['passed']/results['total']*100):.1f}%")
    print("="*70)
    
    if results['failed'] > 0:
        print("\n❌ FAILED TESTS:")
        for test in results['tests']:
            if not test['passed']:
                print(f"  - {test['name']}")
                if test['details']:
                    print(f"    {test['details']}")
    
    # Save results to file
    with open("/app/test_results_continuation_b.json", "w") as f:
        json.dump(results, f, indent=2)
    print("\n💾 Full results saved to /app/test_results_continuation_b.json")

def main():
    print("="*70)
    print("BACKEND TESTING - CONTINUATION-B TASKS")
    print("="*70)
    print(f"Base URL: {BASE_URL}")
    print(f"Partner: {PARTNER_PHONE}")
    print(f"Customer: {CUSTOMER_PHONE}")
    print(f"Demo Invoice: {DEMO_INVOICE_ID}")
    print(f"Demo Booking: {DEMO_BOOKING_CODE}")
    print("="*70)
    
    # Authenticate partner
    print("\n🔐 Authenticating Partner...")
    partner_token = auth_flow(PARTNER_PHONE)
    if not partner_token:
        print("❌ Failed to authenticate partner. Aborting.")
        sys.exit(1)
    
    # Authenticate customer
    print("\n🔐 Authenticating Customer...")
    customer_token = auth_flow(CUSTOMER_PHONE)
    if not customer_token:
        print("❌ Failed to authenticate customer. Aborting.")
        sys.exit(1)
    
    # Run tests
    print("\n" + "="*70)
    print("RUNNING TESTS")
    print("="*70)
    
    # TASK 1: Partner cancellation invoice
    test_partner_invoice_json(partner_token)
    test_partner_invoice_html(partner_token)
    test_partner_invoice_pdf(partner_token)
    
    # TASK 2: Customer booking cancellation data
    test_customer_booking_cancellation(customer_token)
    
    # REGRESSION: Ensure other invoices still work
    test_regression_partner_paid_invoice(partner_token)
    test_regression_customer_invoice(customer_token)
    
    # Print summary
    print_summary()
    
    # Exit with appropriate code
    sys.exit(0 if results['failed'] == 0 else 1)

if __name__ == "__main__":
    main()
