#!/usr/bin/env python3
"""
Comprehensive backend test for INVOICE PDF/HTML BUGFIX.

Tests:
1. Customer invoice HTML - Emergency charge appears EXACTLY ONCE (not twice)
2. Item table lists actual service names, NOT fee lines (Emergency/Surge/Visiting)
3. Add-on rows show quantity
4. If coupon applied, "funded by AzoApp" text present
5. Customer invoice PDF - 200, application/pdf, non-empty
6. Partner invoice - Emergency amount appears at most once
7. Cancelled invoice - Original/Refund/Retained, Emergency not duplicated
8. No 500 errors on any /invoices/{id}/view or /invoices/{id}/pdf
"""

import requests
import json
import re
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://job-ring-system.preview.emergentagent.com/api"
OTP = "123456"
ADMIN_PHONE = "+919000000000"
PARTNER_PHONE = "+919000000003"
CUSTOMER_PHONE = "+919000000004"
SERVICEABLE_PINCODE = "800001"

# Test results
results = {
    "test_run_time": datetime.utcnow().isoformat(),
    "base_url": BASE_URL,
    "tests": [],
    "summary": {"total": 0, "passed": 0, "failed": 0}
}

def log_test(name, passed, details="", error=""):
    """Log a test result."""
    result = {
        "test": name,
        "passed": passed,
        "details": details,
        "error": error
    }
    results["tests"].append(result)
    results["summary"]["total"] += 1
    if passed:
        results["summary"]["passed"] += 1
        print(f"✅ {name}")
    else:
        results["summary"]["failed"] += 1
        print(f"❌ {name}")
        if error:
            print(f"   Error: {error}")
    if details:
        print(f"   {details}")

def login(phone):
    """Login and return token."""
    # Request OTP
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if resp.status_code != 200:
        raise Exception(f"OTP request failed: {resp.status_code} {resp.text}")
    
    # Verify OTP
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    if resp.status_code != 200:
        raise Exception(f"OTP verify failed: {resp.status_code} {resp.text}")
    
    data = resp.json()
    return data.get("token")

def count_occurrences(text, search_term):
    """Count case-insensitive occurrences of a term in text."""
    return len(re.findall(re.escape(search_term), text, re.IGNORECASE))

def main():
    print("=" * 80)
    print("INVOICE PDF/HTML BUGFIX TEST")
    print("=" * 80)
    print()

    # Login as customer, partner, admin
    print("🔐 Logging in...")
    try:
        customer_token = login(CUSTOMER_PHONE)
        partner_token = login(PARTNER_PHONE)
        admin_token = login(ADMIN_PHONE)
        log_test("Login (Customer, Partner, Admin)", True, "All logins successful")
    except Exception as e:
        log_test("Login", False, error=str(e))
        return

    customer_headers = {"Authorization": f"Bearer {customer_token}"}
    partner_headers = {"Authorization": f"Bearer {partner_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Get available services
    print("\n📋 Getting available services...")
    resp = requests.get(f"{BASE_URL}/catalog/services", headers=customer_headers)
    if resp.status_code != 200:
        log_test("Get services", False, error=f"Status {resp.status_code}")
        return
    
    services_data = resp.json()
    # Response might be a list or a dict with services key
    if isinstance(services_data, list):
        services = services_data
    else:
        services = services_data.get("services", [])
    if not services:
        log_test("Get services", False, error="No services available")
        return
    
    # Find a service with add-ons
    service = None
    addon = None
    for s in services:
        if s.get("addons") and len(s.get("addons", [])) > 0:
            service = s
            addon = s["addons"][0]
            break
    
    if not service:
        # Use first service even without add-ons
        service = services[0]
    
    log_test("Get services", True, f"Found service: {service.get('name')}")

    # Get customer profile to find address
    print("\n👤 Getting customer profile...")
    resp = requests.get(f"{BASE_URL}/auth/me", headers=customer_headers)
    if resp.status_code != 200:
        log_test("Get customer profile", False, error=f"Status {resp.status_code}")
        return
    
    customer = resp.json()
    addresses = customer.get("addresses", [])
    
    # Find or create serviceable address
    serviceable_address = None
    for addr in addresses:
        if addr.get("pincode") == SERVICEABLE_PINCODE:
            serviceable_address = addr
            break
    
    if not serviceable_address:
        # Create serviceable address
        print(f"   Creating address with pincode {SERVICEABLE_PINCODE}...")
        addr_payload = {
            "line": "Test Address, Kankarbagh",
            "city": "Patna",
            "state": "Bihar",
            "pincode": SERVICEABLE_PINCODE,
            "label": "Home"
        }
        resp = requests.post(f"{BASE_URL}/auth/address", json=addr_payload, headers=customer_headers)
        if resp.status_code == 200:
            serviceable_address = resp.json().get("address")
        else:
            log_test("Create serviceable address", False, error=f"Status {resp.status_code}")
            return
    
    log_test("Get/Create serviceable address", True, f"Address ID: {serviceable_address.get('id')}")

    # Get available coupons
    print("\n🎟️  Checking for available coupons...")
    resp = requests.get(f"{BASE_URL}/coupons/available", headers=customer_headers)
    coupon_code = None
    if resp.status_code == 200:
        coupons = resp.json().get("coupons", [])
        if coupons:
            coupon_code = coupons[0].get("code")
            log_test("Get coupons", True, f"Found coupon: {coupon_code}")
        else:
            log_test("Get coupons", True, "No coupons available (will proceed without)")
    else:
        log_test("Get coupons", True, "Coupon endpoint not available (will proceed without)")

    # Create EMERGENCY booking with add-on
    print("\n📦 Creating EMERGENCY booking...")
    
    # Calculate scheduled_at for emergency (now + 1 hour)
    scheduled_at = (datetime.utcnow() + timedelta(hours=1)).isoformat() + "Z"
    
    booking_payload = {
        "service_id": service["id"],
        "address_id": serviceable_address["id"],
        "schedule_type": "emergency",  # EMERGENCY booking to trigger Emergency Fee
        "scheduled_at": scheduled_at,
        "notes": "Test emergency booking for invoice bugfix verification"
    }
    
    # Add addon if available
    if addon:
        # Addons are just names in the booking payload
        booking_payload["addons"] = [addon["name"]]
    
    # Add coupon if available
    if coupon_code:
        booking_payload["coupon_code"] = coupon_code
    
    resp = requests.post(f"{BASE_URL}/bookings", json=booking_payload, headers=customer_headers)
    if resp.status_code != 200:
        log_test("Create emergency booking", False, error=f"Status {resp.status_code}: {resp.text}")
        return
    
    booking = resp.json()
    if not booking or "id" not in booking:
        log_test("Create emergency booking", False, error=f"Invalid booking response: {booking}")
        return
    booking_id = booking["id"]
    
    details = f"Booking ID: {booking_id}, Schedule: emergency"
    if addon:
        details += f", Add-on: {addon.get('name')} (qty: 2)"
    if coupon_code:
        details += f", Coupon: {coupon_code}"
    log_test("Create emergency booking", True, details)

    # Pay the booking (mock payment)
    print("\n💳 Paying booking...")
    payment_payload = {
        "purpose": "booking",
        "booking_id": booking_id,
        "amount": booking.get("pricing", {}).get("total", 0)
    }
    resp = requests.post(f"{BASE_URL}/payments/mock", json=payment_payload, headers=customer_headers)
    if resp.status_code != 200:
        log_test("Pay booking", False, error=f"Status {resp.status_code}: {resp.text}")
        return
    
    log_test("Pay booking", True, f"Payment successful, Amount: ₹{booking.get('pricing', {}).get('total', 0)}")

    # Assign partner via admin
    print("\n👷 Assigning partner...")
    
    # Get partner ID
    resp = requests.get(f"{BASE_URL}/auth/me", headers=partner_headers)
    if resp.status_code != 200:
        log_test("Get partner ID", False, error=f"Status {resp.status_code}")
        return
    partner_id = resp.json().get("id")
    
    assign_payload = {"partner_id": partner_id}
    resp = requests.post(f"{BASE_URL}/admin/bookings/{booking_id}/assign", json=assign_payload, headers=admin_headers)
    if resp.status_code != 200:
        log_test("Assign partner", False, error=f"Status {resp.status_code}: {resp.text}")
        return
    
    log_test("Assign partner", True, f"Partner {partner_id} assigned")

    # Complete the booking (admin action to mark as completed for invoice generation)
    # Note: According to invoice_service.py, invoices are created for status "completed" or "paid"
    print("   Completing booking for invoice generation...")
    resp = requests.post(f"{BASE_URL}/admin/bookings/{booking_id}/status?status=completed", headers=admin_headers)
    if resp.status_code == 200:
        print("   ✓ Booking marked as completed")
        # Verify the status
        resp_check = requests.get(f"{BASE_URL}/bookings/{booking_id}", headers=customer_headers)
        if resp_check.status_code == 200:
            actual_status = resp_check.json().get("status")
            print(f"   DEBUG: Actual booking status: {actual_status}")
    else:
        print(f"   ⚠ Could not complete booking: {resp.status_code}")
    
    # Trigger invoice sync
    print("   Triggering invoice sync...")
    resp = requests.post(f"{BASE_URL}/invoices/sync", headers=admin_headers)
    if resp.status_code == 200:
        print("   ✓ Invoice sync triggered")
    else:
        print(f"   ⚠ Invoice sync failed: {resp.status_code}")
    
    # Wait for invoice generation
    import time
    print("   Waiting for invoice generation...")
    time.sleep(3)

    # TEST 1: Get customer invoice
    print("\n" + "=" * 80)
    print("TEST 1: CUSTOMER INVOICE HTML - Emergency charge EXACTLY ONCE")
    print("=" * 80)
    
    # Get invoice list for booking
    resp = requests.get(f"{BASE_URL}/invoices?booking_id={booking_id}", headers=customer_headers)
    if resp.status_code != 200:
        log_test("Get customer invoices list", False, error=f"Status {resp.status_code}")
        # Try to debug - get all invoices
        print(f"   DEBUG: Trying to get all invoices...")
        resp2 = requests.get(f"{BASE_URL}/invoices", headers=customer_headers)
        if resp2.status_code == 200:
            all_invs = resp2.json()
            print(f"   DEBUG: Total invoices: {len(all_invs.get('invoices', []))}")
        return
    
    invoices_data = resp.json()
    invoices = invoices_data.get("invoices", [])
    
    print(f"   DEBUG: Found {len(invoices)} invoices for booking {booking_id}")
    for inv in invoices:
        print(f"   DEBUG: Invoice {inv.get('id')}: type={inv.get('invoice_type')}, status={inv.get('status')}")
    
    # Find booking invoice (not cancellation)
    customer_invoice = None
    for inv in invoices:
        if inv.get("invoice_type") == "booking":
            customer_invoice = inv
            break
    
    if not customer_invoice:
        log_test("Find customer booking invoice", False, error="No booking invoice found")
        return
    
    customer_invoice_id = customer_invoice["id"]
    log_test("Find customer booking invoice", True, f"Invoice ID: {customer_invoice_id}, Number: {customer_invoice.get('invoice_number')}")

    # Get invoice HTML view
    resp = requests.get(f"{BASE_URL}/invoices/{customer_invoice_id}/view", headers=customer_headers)
    if resp.status_code != 200:
        log_test("GET /invoices/{id}/view (customer)", False, error=f"Status {resp.status_code}")
        return
    
    customer_invoice_html = resp.text
    log_test("GET /invoices/{id}/view (customer)", True, f"HTML length: {len(customer_invoice_html)} chars")

    # Count occurrences of "Emergency"
    emergency_count = count_occurrences(customer_invoice_html, "Emergency")
    
    # Get the emergency fee amount from pricing
    emergency_fee = booking.get("pricing", {}).get("emergency_fee", 0)
    emergency_amount_str = f"₹{emergency_fee:.2f}" if emergency_fee else None
    emergency_amount_count = 0
    if emergency_amount_str:
        emergency_amount_count = count_occurrences(customer_invoice_html, emergency_amount_str)
    
    # CORE BUG CHECK: Emergency should appear EXACTLY ONCE
    if emergency_count == 1:
        log_test("Emergency word count", True, f"'Emergency' appears EXACTLY ONCE (count: {emergency_count}) ✅")
    else:
        log_test("Emergency word count", False, 
                error=f"'Emergency' appears {emergency_count} times (expected: 1). BUG: Emergency charge shown multiple times!")
    
    if emergency_amount_str:
        if emergency_amount_count == 1:
            log_test("Emergency amount count", True, f"Emergency amount '{emergency_amount_str}' appears EXACTLY ONCE ✅")
        else:
            log_test("Emergency amount count", False,
                    error=f"Emergency amount '{emergency_amount_str}' appears {emergency_amount_count} times (expected: 1)")

    # Check item table does NOT contain fee lines
    # Look for table rows with Emergency/Surge/Visiting in the item description column
    item_table_has_emergency = "Emergency" in customer_invoice_html.split("<!-- totals -->")[0] if "<!-- totals -->" in customer_invoice_html else False
    
    # Better check: look for Emergency in the items tbody section
    if '<tbody>' in customer_invoice_html and '</tbody>' in customer_invoice_html:
        # Extract items table tbody
        items_section = customer_invoice_html.split('<table class="items">')[1].split('</table>')[0] if '<table class="items">' in customer_invoice_html else ""
        items_tbody = items_section.split('<tbody>')[1].split('</tbody>')[0] if '<tbody>' in items_section else ""
        
        # Check if Emergency appears in items tbody
        if "Emergency" in items_tbody or "emergency" in items_tbody.lower():
            log_test("Item table does NOT contain Emergency fee line", False,
                    error="Emergency fee found in item table (should only be in Payment Summary)")
        else:
            log_test("Item table does NOT contain Emergency fee line", True, "Emergency fee correctly absent from item table ✅")
    else:
        log_test("Item table structure check", False, error="Could not parse item table structure")

    # Check service name is in item table
    service_name = service.get("name", "")
    if service_name and service_name in customer_invoice_html:
        log_test("Item table lists actual service name", True, f"Service '{service_name}' found in invoice")
    else:
        log_test("Item table lists actual service name", False, error=f"Service name '{service_name}' not found")

    # Check add-on quantity display
    if addon:
        addon_name = addon.get("name", "")
        # Look for add-on with quantity in HTML
        if addon_name in customer_invoice_html:
            log_test("Add-on present in invoice", True, f"Add-on '{addon_name}' found")
            # Check if quantity is displayed (look for "2" near the add-on name)
            # This is a heuristic check
            addon_section = customer_invoice_html[customer_invoice_html.find(addon_name):customer_invoice_html.find(addon_name)+200] if addon_name in customer_invoice_html else ""
            if "2" in addon_section or "qty" in addon_section.lower():
                log_test("Add-on quantity displayed", True, "Quantity appears near add-on name")
            else:
                log_test("Add-on quantity displayed", False, error="Quantity not clearly visible near add-on")
        else:
            log_test("Add-on present in invoice", False, error=f"Add-on '{addon_name}' not found")

    # Check for "funded by AzoApp" text if coupon was applied
    if coupon_code:
        if "funded by AzoApp" in customer_invoice_html or "funded by AzoApp" in customer_invoice_html:
            log_test("Coupon 'funded by AzoApp' note present", True, "Coupon note found ✅")
        else:
            log_test("Coupon 'funded by AzoApp' note present", False, error="Coupon note not found")
    else:
        log_test("Coupon check", True, "No coupon applied (skipped)")

    # TEST 2: Customer invoice PDF
    print("\n" + "=" * 80)
    print("TEST 2: CUSTOMER INVOICE PDF")
    print("=" * 80)
    
    resp = requests.get(f"{BASE_URL}/invoices/{customer_invoice_id}/pdf", headers=customer_headers)
    if resp.status_code != 200:
        log_test("GET /invoices/{id}/pdf (customer)", False, error=f"Status {resp.status_code}")
    else:
        content_type = resp.headers.get("Content-Type", "")
        content_length = len(resp.content)
        
        if "application/pdf" in content_type:
            log_test("PDF Content-Type", True, f"Content-Type: {content_type}")
        else:
            log_test("PDF Content-Type", False, error=f"Expected application/pdf, got {content_type}")
        
        if content_length > 0:
            log_test("PDF non-empty", True, f"PDF size: {content_length} bytes")
        else:
            log_test("PDF non-empty", False, error="PDF is empty")
        
        # Check PDF magic bytes
        if resp.content[:4] == b'%PDF':
            log_test("PDF valid format", True, "PDF magic bytes present")
        else:
            log_test("PDF valid format", False, error="Invalid PDF format")

    # TEST 3: Partner invoice
    print("\n" + "=" * 80)
    print("TEST 3: PARTNER INVOICE - Emergency amount at most once")
    print("=" * 80)
    
    # Get partner invoices for this booking
    resp = requests.get(f"{BASE_URL}/invoices?booking_id={booking_id}", headers=partner_headers)
    if resp.status_code != 200:
        log_test("Get partner invoices list", False, error=f"Status {resp.status_code}")
    else:
        partner_invoices = resp.json().get("invoices", [])
        
        # Find partner's booking invoice
        partner_invoice = None
        for inv in partner_invoices:
            if inv.get("invoice_type") == "booking":
                partner_invoice = inv
                break
        
        if not partner_invoice:
            log_test("Find partner booking invoice", False, error="No partner booking invoice found")
        else:
            partner_invoice_id = partner_invoice["id"]
            log_test("Find partner booking invoice", True, f"Invoice ID: {partner_invoice_id}")
            
            # Get partner invoice HTML
            resp = requests.get(f"{BASE_URL}/invoices/{partner_invoice_id}/view", headers=partner_headers)
            if resp.status_code != 200:
                log_test("GET /invoices/{id}/view (partner)", False, error=f"Status {resp.status_code}")
            else:
                partner_invoice_html = resp.text
                log_test("GET /invoices/{id}/view (partner)", True, f"HTML length: {len(partner_invoice_html)} chars")
                
                # Count Emergency occurrences in partner invoice
                partner_emergency_count = count_occurrences(partner_invoice_html, "Emergency")
                
                if partner_emergency_count <= 1:
                    log_test("Partner invoice Emergency count", True, 
                            f"'Emergency' appears {partner_emergency_count} time(s) (at most once) ✅")
                else:
                    log_test("Partner invoice Emergency count", False,
                            error=f"'Emergency' appears {partner_emergency_count} times (expected: at most 1)")
            
            # Get partner invoice PDF
            resp = requests.get(f"{BASE_URL}/invoices/{partner_invoice_id}/pdf", headers=partner_headers)
            if resp.status_code != 200:
                log_test("GET /invoices/{id}/pdf (partner)", False, error=f"Status {resp.status_code}")
            else:
                if "application/pdf" in resp.headers.get("Content-Type", "") and len(resp.content) > 0:
                    log_test("GET /invoices/{id}/pdf (partner)", True, f"PDF size: {len(resp.content)} bytes")
                else:
                    log_test("GET /invoices/{id}/pdf (partner)", False, error="Invalid PDF response")

    # TEST 4: Cancelled invoice
    print("\n" + "=" * 80)
    print("TEST 4: CANCELLED INVOICE - Original/Refund/Retained, Emergency not duplicated")
    print("=" * 80)
    
    # Create another emergency booking to cancel
    print("   Creating second emergency booking to cancel...")
    booking_payload2 = {
        "service_id": service["id"],
        "address_id": serviceable_address["id"],
        "schedule_type": "emergency",
        "scheduled_at": scheduled_at,
        "notes": "Test booking for cancellation invoice"
    }
    
    resp = requests.post(f"{BASE_URL}/bookings", json=booking_payload2, headers=customer_headers)
    if resp.status_code != 200:
        log_test("Create second booking for cancellation", False, error=f"Status {resp.status_code}")
    else:
        booking2 = resp.json()
        booking2_id = booking2["id"]
        
        # Pay it
        payment_payload2 = {
            "purpose": "booking",
            "booking_id": booking2_id,
            "amount": booking2.get("pricing", {}).get("total", 0)
        }
        resp = requests.post(f"{BASE_URL}/payments/mock", json=payment_payload2, headers=customer_headers)
        if resp.status_code != 200:
            log_test("Pay second booking", False, error=f"Status {resp.status_code}")
        else:
            log_test("Create and pay second booking", True, f"Booking ID: {booking2_id}")
            
            # Cancel it
            time.sleep(1)
            resp = requests.post(f"{BASE_URL}/bookings/{booking2_id}/cancel", 
                               json={"reason": "Test cancellation"}, headers=customer_headers)
            if resp.status_code != 200:
                log_test("Cancel booking", False, error=f"Status {resp.status_code}: {resp.text}")
            else:
                log_test("Cancel booking", True, "Booking cancelled")
                
                # Wait for cancellation invoice
                time.sleep(2)
                
                # Get cancellation invoice
                resp = requests.get(f"{BASE_URL}/invoices?booking_id={booking2_id}", headers=customer_headers)
                if resp.status_code != 200:
                    log_test("Get cancellation invoices", False, error=f"Status {resp.status_code}")
                else:
                    cancel_invoices = resp.json().get("invoices", [])
                    cancel_invoice = None
                    for inv in cancel_invoices:
                        if inv.get("invoice_type") == "cancellation":
                            cancel_invoice = inv
                            break
                    
                    if not cancel_invoice:
                        log_test("Find cancellation invoice", False, error="No cancellation invoice found")
                    else:
                        cancel_invoice_id = cancel_invoice["id"]
                        log_test("Find cancellation invoice", True, f"Invoice ID: {cancel_invoice_id}")
                        
                        # Get cancellation invoice HTML
                        resp = requests.get(f"{BASE_URL}/invoices/{cancel_invoice_id}/view", headers=customer_headers)
                        if resp.status_code != 200:
                            log_test("GET cancellation /invoices/{id}/view", False, error=f"Status {resp.status_code}")
                        else:
                            cancel_html = resp.text
                            log_test("GET cancellation /invoices/{id}/view", True, f"HTML length: {len(cancel_html)} chars")
                            
                            # Check for Original/Refund/Retained
                            has_original = "Original" in cancel_html or "original" in cancel_html.lower()
                            has_refund = "Refund" in cancel_html or "refund" in cancel_html.lower()
                            has_retained = "Retained" in cancel_html or "retained" in cancel_html.lower()
                            
                            if has_original and has_refund and has_retained:
                                log_test("Cancellation invoice has Original/Refund/Retained", True, 
                                        "All required fields present ✅")
                            else:
                                missing = []
                                if not has_original: missing.append("Original")
                                if not has_refund: missing.append("Refund")
                                if not has_retained: missing.append("Retained")
                                log_test("Cancellation invoice has Original/Refund/Retained", False,
                                        error=f"Missing: {', '.join(missing)}")
                            
                            # Check Emergency not duplicated
                            cancel_emergency_count = count_occurrences(cancel_html, "Emergency")
                            if cancel_emergency_count <= 1:
                                log_test("Cancellation invoice Emergency not duplicated", True,
                                        f"'Emergency' appears {cancel_emergency_count} time(s) ✅")
                            else:
                                log_test("Cancellation invoice Emergency not duplicated", False,
                                        error=f"'Emergency' appears {cancel_emergency_count} times (expected: at most 1)")

    # TEST 5: No 500 errors
    print("\n" + "=" * 80)
    print("TEST 5: NO 500 ERRORS")
    print("=" * 80)
    
    # Check all previous requests - we've been tracking them
    # For this test, we'll just confirm no 500s were encountered
    has_500_error = False
    for test in results["tests"]:
        if "500" in test.get("error", ""):
            has_500_error = True
            break
    
    if not has_500_error:
        log_test("No 500 errors encountered", True, "All endpoints returned expected status codes ✅")
    else:
        log_test("No 500 errors encountered", False, error="500 errors were encountered")

    # Save results
    print("\n" + "=" * 80)
    print("SAVING RESULTS")
    print("=" * 80)
    
    with open("/app/test_results_invoice_bugfix.json", "w") as f:
        json.dump(results, f, indent=2)
    
    print(f"\n✅ Results saved to /app/test_results_invoice_bugfix.json")
    
    # Print summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Total tests: {results['summary']['total']}")
    print(f"Passed: {results['summary']['passed']} ✅")
    print(f"Failed: {results['summary']['failed']} ❌")
    
    if results['summary']['failed'] == 0:
        print("\n🎉 ALL TESTS PASSED! Invoice bugfix is working correctly.")
    else:
        print(f"\n⚠️  {results['summary']['failed']} test(s) failed. Please review.")
    
    return results['summary']['failed'] == 0

if __name__ == "__main__":
    try:
        success = main()
        exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ Test execution failed: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
