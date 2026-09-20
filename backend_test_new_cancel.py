"""
Backend test for NEW cancellation/refund/invoice flow additions.
Tests the cancellation-preview endpoint and the new Refund Receipt document type.
"""
import requests
import json
import time
import random
from concurrent.futures import ThreadPoolExecutor, as_completed

# Base URL from frontend/.env
BASE_URL = "https://multi-app-preview-2.preview.emergentagent.com/api"

# Test credentials
CUSTOMER_PHONE = "+919000000004"
ADMIN_PHONE = "+919000000000"
PARTNER_PHONE = "+919000000003"
OTP = "123456"

# Test data
SERVICEABLE_PINCODE = "800001"

class TestResults:
    def __init__(self):
        self.total = 0
        self.passed = 0
        self.failed = 0
        self.tests = []
    
    def add(self, name, passed, details=""):
        self.total += 1
        if passed:
            self.passed += 1
            status = "✅ PASS"
        else:
            self.failed += 1
            status = "❌ FAIL"
        self.tests.append({"name": name, "status": status, "details": details})
        print(f"{status} - {name}")
        if details:
            print(f"  {details}")
    
    def summary(self):
        print(f"\n{'='*80}")
        print(f"TEST SUMMARY: {self.passed}/{self.total} tests passed ({self.passed*100//self.total if self.total else 0}%)")
        print(f"{'='*80}")
        if self.failed > 0:
            print(f"\n❌ FAILED TESTS ({self.failed}):")
            for t in self.tests:
                if "❌" in t["status"]:
                    print(f"  - {t['name']}")
                    if t["details"]:
                        print(f"    {t['details']}")

results = TestResults()

def auth_user(phone):
    """Authenticate a user and return token"""
    # Send OTP
    r = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if r.status_code != 200:
        raise Exception(f"Failed to send OTP: {r.status_code} {r.text}")
    
    # Verify OTP
    r = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    if r.status_code != 200:
        raise Exception(f"Failed to verify OTP: {r.status_code} {r.text}")
    
    data = r.json()
    return data.get("token")

def create_and_pay_booking(customer_token):
    """Helper: Create and pay a booking, return booking object"""
    # Get a service
    r = requests.get(f"{BASE_URL}/catalog/services")
    if r.status_code != 200:
        raise Exception(f"Failed to get services: {r.status_code}")
    data = r.json()
    # Handle both list and dict responses
    if isinstance(data, list):
        services = data
    else:
        services = data.get("services", [])
    if not services:
        raise Exception("No services available")
    
    service = services[0]
    service_id = service["id"]
    
    # Create booking
    booking_data = {
        "items": [{
            "service_id": service_id,
            "addons": [],
            "qty": 1
        }],
        "address": {
            "line": "12 MG Road",
            "pincode": SERVICEABLE_PINCODE,
            "city": "Patna",
            "state": "Bihar",
            "lat": 25.6,
            "lng": 85.1
        },
        "schedule_type": "schedule",
        "scheduled_at": "2026-12-01T10:00:00+00:00",
        "order_group_id": f"G-{random.randint(10000, 99999)}",
        "idempotency_key": f"idem-{random.randint(10000, 99999)}",
        "apply_visiting": True,
        "apply_emergency": False
    }
    
    headers = {"Authorization": f"Bearer {customer_token}"}
    r = requests.post(f"{BASE_URL}/bookings/grouped", json=booking_data, headers=headers)
    if r.status_code != 200:
        raise Exception(f"Failed to create booking: {r.status_code} {r.text}")
    
    booking = r.json()
    booking_id = booking["id"]
    
    # Create payment order
    r = requests.post(f"{BASE_URL}/payments/order", 
                     json={"purpose": "booking", "booking_id": booking_id},
                     headers=headers)
    if r.status_code != 200:
        raise Exception(f"Failed to create payment order: {r.status_code} {r.text}")
    
    # Mock payment
    r = requests.post(f"{BASE_URL}/payments/mock",
                     json={"purpose": "booking", "booking_id": booking_id},
                     headers=headers)
    if r.status_code != 200:
        raise Exception(f"Failed to mock payment: {r.status_code} {r.text}")
    
    # Get updated booking
    r = requests.get(f"{BASE_URL}/bookings/{booking_id}", headers=headers)
    if r.status_code != 200:
        raise Exception(f"Failed to get booking: {r.status_code}")
    
    return r.json()

def test_cancellation_preview_no_partner():
    """TEST 1a: Cancellation preview endpoint - no partner assigned"""
    print("\n" + "="*80)
    print("TEST 1a: Cancellation preview endpoint (no partner assigned)")
    print("="*80)
    
    try:
        customer_token = auth_user(CUSTOMER_PHONE)
        results.add("TEST 1a.1", True, "Customer authentication successful")
        
        # Create and pay booking
        booking = create_and_pay_booking(customer_token)
        booking_id = booking["id"]
        booking_code = booking.get("code")
        total = booking.get("pricing", {}).get("total", 0)
        
        results.add("TEST 1a.2", True, f"Created and paid booking {booking_code}, total ₹{total}")
        
        # Get cancellation preview
        headers = {"Authorization": f"Bearer {customer_token}"}
        r = requests.get(f"{BASE_URL}/bookings/{booking_id}/cancellation-preview", headers=headers)
        
        results.add("TEST 1a.3", r.status_code == 200, 
                   f"Preview endpoint returned {r.status_code}")
        
        if r.status_code == 200:
            preview = r.json()
            
            # Check required fields
            required_fields = ["cancellable", "partner_was_assigned", "original_amount", 
                             "refund", "refund_pct", "retained_from_you", "item_refunds", "reason"]
            missing = [f for f in required_fields if f not in preview]
            results.add("TEST 1a.4", len(missing) == 0,
                       f"All required fields present" if not missing else f"Missing fields: {missing}")
            
            # Check values for no-partner case
            results.add("TEST 1a.5", preview.get("cancellable") == True,
                       f"cancellable={preview.get('cancellable')}")
            
            results.add("TEST 1a.6", preview.get("partner_was_assigned") == False,
                       f"partner_was_assigned={preview.get('partner_was_assigned')}")
            
            results.add("TEST 1a.7", preview.get("refund_pct") == 100,
                       f"refund_pct={preview.get('refund_pct')} (expected 100)")
            
            # Check refund equals total (within 0.01)
            refund = preview.get("refund", 0)
            diff = abs(refund - total)
            results.add("TEST 1a.8", diff <= 0.01,
                       f"refund=₹{refund}, total=₹{total}, diff=₹{diff:.2f} (expected ≤0.01)")
            
            # Check retained is 0
            retained = preview.get("retained_from_you", 0)
            results.add("TEST 1a.9", retained == 0,
                       f"retained_from_you=₹{retained} (expected 0)")
            
            # Check no internal fields leaked
            forbidden = ["partner_cut", "admin_cut", "cancel_charge", "platform_commission"]
            leaked = [f for f in forbidden if f in preview]
            results.add("TEST 1a.10", len(leaked) == 0,
                       f"No internal fields leaked" if not leaked else f"Leaked fields: {leaked}")
            
            # Verify booking NOT changed
            r2 = requests.get(f"{BASE_URL}/bookings/{booking_id}", headers=headers)
            if r2.status_code == 200:
                b2 = r2.json()
                status = b2.get("status")
                results.add("TEST 1a.11", status != "cancelled",
                           f"Booking status still '{status}' (preview did NOT cancel)")
            
            return booking_id, customer_token
        else:
            return None, None
            
    except Exception as e:
        results.add("TEST 1a.ERROR", False, f"Exception: {str(e)}")
        return None, None

def test_cancellation_preview_with_partner():
    """TEST 1b: Cancellation preview endpoint - with partner assigned"""
    print("\n" + "="*80)
    print("TEST 1b: Cancellation preview endpoint (with partner assigned)")
    print("="*80)
    
    try:
        customer_token = auth_user(CUSTOMER_PHONE)
        admin_token = auth_user(ADMIN_PHONE)
        
        # Create and pay booking
        booking = create_and_pay_booking(customer_token)
        booking_id = booking["id"]
        booking_code = booking.get("code")
        pricing = booking.get("pricing", {})
        base = pricing.get("commissionable_base", 0)
        gst = pricing.get("gst", 0)
        
        results.add("TEST 1b.1", True, f"Created and paid booking {booking_code}")
        
        # Get partner ID
        headers_admin = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{BASE_URL}/admin/partners", headers=headers_admin)
        if r.status_code != 200:
            raise Exception(f"Failed to get partners: {r.status_code}")
        
        partners = r.json().get("partners", [])
        if not partners:
            raise Exception("No partners available")
        
        partner_id = partners[0]["id"]
        
        # Assign partner
        r = requests.post(f"{BASE_URL}/admin/bookings/{booking_id}/assign",
                         json={"partner_id": partner_id},
                         headers=headers_admin)
        
        results.add("TEST 1b.2", r.status_code == 200,
                   f"Partner assigned: {r.status_code}")
        
        # Get cancellation preview
        headers_customer = {"Authorization": f"Bearer {customer_token}"}
        r = requests.get(f"{BASE_URL}/bookings/{booking_id}/cancellation-preview", 
                        headers=headers_customer)
        
        results.add("TEST 1b.3", r.status_code == 200,
                   f"Preview endpoint returned {r.status_code}")
        
        if r.status_code == 200:
            preview = r.json()
            
            # Check partner was assigned
            results.add("TEST 1b.4", preview.get("partner_was_assigned") == True,
                       f"partner_was_assigned={preview.get('partner_was_assigned')}")
            
            # Check refund_pct is 80
            refund_pct = preview.get("refund_pct", 0)
            results.add("TEST 1b.5", refund_pct == 80,
                       f"refund_pct={refund_pct} (expected 80)")
            
            # Check refund equals (base+gst)*0.8
            expected_refund = round((base + gst) * 0.8, 2)
            actual_refund = preview.get("refund", 0)
            diff = abs(actual_refund - expected_refund)
            results.add("TEST 1b.6", diff <= 0.02,
                       f"refund=₹{actual_refund}, expected=₹{expected_refund}, diff=₹{diff:.2f}")
            
            # Check retained > 0
            retained = preview.get("retained_from_you", 0)
            results.add("TEST 1b.7", retained > 0,
                       f"retained_from_you=₹{retained} (expected > 0)")
            
            return booking_id, customer_token
        else:
            return None, None
            
    except Exception as e:
        results.add("TEST 1b.ERROR", False, f"Exception: {str(e)}")
        return None, None

def test_two_document_types():
    """TEST 2: Two clearly-typed documents per cancellation"""
    print("\n" + "="*80)
    print("TEST 2: Two clearly-typed documents per cancellation (Refund Receipt is NEW)")
    print("="*80)
    
    try:
        customer_token = auth_user(CUSTOMER_PHONE)
        
        # Create, pay and cancel a booking
        booking = create_and_pay_booking(customer_token)
        booking_id = booking["id"]
        booking_code = booking.get("code")
        total = booking.get("pricing", {}).get("total", 0)
        
        results.add("TEST 2.1", True, f"Created and paid booking {booking_code}, total ₹{total}")
        
        # Cancel booking
        headers = {"Authorization": f"Bearer {customer_token}"}
        r = requests.post(f"{BASE_URL}/bookings/{booking_id}/cancel",
                         json={"reason": "Test cancellation"},
                         headers=headers)
        
        results.add("TEST 2.2", r.status_code == 200,
                   f"Booking cancelled: {r.status_code}")
        
        # Wait a moment for invoice generation
        time.sleep(1)
        
        # Get invoices
        r = requests.get(f"{BASE_URL}/invoices?page_size=100", headers=headers)
        
        results.add("TEST 2.3", r.status_code == 200,
                   f"Invoices endpoint returned {r.status_code}")
        
        if r.status_code == 200:
            data = r.json()
            invoices = data.get("items", [])
            
            # Filter invoices for this booking
            booking_invoices = [inv for inv in invoices if inv.get("booking_id") == booking_id]
            
            results.add("TEST 2.4", len(booking_invoices) > 0,
                       f"Found {len(booking_invoices)} invoices for booking {booking_code}")
            
            # Check for exactly one 'cancellation' type
            cancellation_invoices = [inv for inv in booking_invoices 
                                    if inv.get("invoice_type") == "cancellation"]
            results.add("TEST 2.5", len(cancellation_invoices) == 1,
                       f"Found {len(cancellation_invoices)} cancellation invoice(s) (expected 1)")
            
            # Check for exactly one 'refund' type
            refund_invoices = [inv for inv in booking_invoices 
                              if inv.get("invoice_type") == "refund"]
            results.add("TEST 2.6", len(refund_invoices) == 1,
                       f"Found {len(refund_invoices)} refund invoice(s) (expected 1)")
            
            # Check for zero 'transaction' type
            transaction_invoices = [inv for inv in booking_invoices 
                                   if inv.get("invoice_type") == "transaction"]
            results.add("TEST 2.7", len(transaction_invoices) == 0,
                       f"Found {len(transaction_invoices)} transaction invoice(s) (expected 0)")
            
            # Verify cancellation document
            if cancellation_invoices:
                canc = cancellation_invoices[0]
                results.add("TEST 2.8", canc.get("total_amount") == total,
                           f"Cancellation total_amount=₹{canc.get('total_amount')} (expected ₹{total})")
                
                results.add("TEST 2.9", canc.get("payment_status") == "cancelled",
                           f"Cancellation payment_status='{canc.get('payment_status')}' (expected 'cancelled')")
                
                label = canc.get("document_label", "")
                results.add("TEST 2.10", "Cancellation" in label or "Adjustment" in label,
                           f"Cancellation document_label='{label}'")
            
            # Verify refund document
            if refund_invoices:
                refund = refund_invoices[0]
                refund_amt = refund.get("total_amount", 0)
                
                # Refund amount should equal total (100% refund for no-partner case)
                diff = abs(refund_amt - total)
                results.add("TEST 2.11", diff <= 0.01,
                           f"Refund total_amount=₹{refund_amt} (expected ₹{total}, diff ₹{diff:.2f})")
                
                results.add("TEST 2.12", refund.get("payment_status") == "refunded",
                           f"Refund payment_status='{refund.get('payment_status')}' (expected 'refunded')")
                
                label = refund.get("document_label", "")
                results.add("TEST 2.13", "Refund Receipt" in label,
                           f"Refund document_label='{label}' (expected 'Refund Receipt')")
                
                # Check no partner/commission fields in customer refund receipt
                forbidden = ["partner_cancellation_amount", "partner_cut", "admin_cut", 
                           "platform_commission", "partner_id", "partner_name"]
                leaked = [f for f in forbidden if f in refund]
                results.add("TEST 2.14", len(leaked) == 0,
                           f"Refund receipt has no internal fields" if not leaked 
                           else f"Leaked fields: {leaked}")
            
            return booking_id
        else:
            return None
            
    except Exception as e:
        results.add("TEST 2.ERROR", False, f"Exception: {str(e)}")
        return None

def test_idempotency():
    """TEST 3: Idempotency of the new refund receipt"""
    print("\n" + "="*80)
    print("TEST 3: Idempotency of the new refund receipt")
    print("="*80)
    
    try:
        customer_token = auth_user(CUSTOMER_PHONE)
        
        # Create, pay and cancel a booking
        booking = create_and_pay_booking(customer_token)
        booking_id = booking["id"]
        booking_code = booking.get("code")
        
        results.add("TEST 3.1", True, f"Created and paid booking {booking_code}")
        
        # Cancel booking
        headers = {"Authorization": f"Bearer {customer_token}"}
        r = requests.post(f"{BASE_URL}/bookings/{booking_id}/cancel",
                         json={"reason": "Test idempotency"},
                         headers=headers)
        
        results.add("TEST 3.2", r.status_code == 200,
                   f"Booking cancelled: {r.status_code}")
        
        # Wait for invoice generation
        time.sleep(1)
        
        # Make 12 concurrent GET /api/invoices calls
        def get_invoices():
            r = requests.get(f"{BASE_URL}/invoices?page_size=100", headers=headers)
            if r.status_code == 200:
                return r.json().get("items", [])
            return []
        
        with ThreadPoolExecutor(max_workers=12) as executor:
            futures = [executor.submit(get_invoices) for _ in range(12)]
            all_results = [f.result() for f in as_completed(futures)]
        
        results.add("TEST 3.3", len(all_results) == 12,
                   f"Made {len(all_results)} concurrent calls")
        
        # Check first result
        if all_results and all_results[0]:
            invoices = all_results[0]
            booking_invoices = [inv for inv in invoices if inv.get("booking_id") == booking_id]
            
            cancellation_count = len([inv for inv in booking_invoices 
                                     if inv.get("invoice_type") == "cancellation"])
            refund_count = len([inv for inv in booking_invoices 
                               if inv.get("invoice_type") == "refund"])
            
            results.add("TEST 3.4", cancellation_count == 1,
                       f"Still exactly 1 cancellation invoice (found {cancellation_count})")
            
            results.add("TEST 3.5", refund_count == 1,
                       f"Still exactly 1 refund invoice (found {refund_count})")
        
        # Make another 12 concurrent calls
        time.sleep(0.5)
        with ThreadPoolExecutor(max_workers=12) as executor:
            futures = [executor.submit(get_invoices) for _ in range(12)]
            all_results2 = [f.result() for f in as_completed(futures)]
        
        results.add("TEST 3.6", len(all_results2) == 12,
                   f"Made another {len(all_results2)} concurrent calls")
        
        # Check second batch
        if all_results2 and all_results2[0]:
            invoices = all_results2[0]
            booking_invoices = [inv for inv in invoices if inv.get("booking_id") == booking_id]
            
            cancellation_count = len([inv for inv in booking_invoices 
                                     if inv.get("invoice_type") == "cancellation"])
            refund_count = len([inv for inv in booking_invoices 
                               if inv.get("invoice_type") == "refund"])
            
            results.add("TEST 3.7", cancellation_count == 1,
                       f"STILL exactly 1 cancellation invoice after 2nd batch (found {cancellation_count})")
            
            results.add("TEST 3.8", refund_count == 1,
                       f"STILL exactly 1 refund invoice after 2nd batch (found {refund_count})")
            
    except Exception as e:
        results.add("TEST 3.ERROR", False, f"Exception: {str(e)}")

def test_regression():
    """TEST 4: Regression - refund math and duplicate prevention"""
    print("\n" + "="*80)
    print("TEST 4: Regression testing")
    print("="*80)
    
    try:
        customer_token = auth_user(CUSTOMER_PHONE)
        admin_token = auth_user(ADMIN_PHONE)
        
        # CASE 1: No partner - 100% refund
        print("\n--- CASE 1: No partner (100% refund) ---")
        booking1 = create_and_pay_booking(customer_token)
        booking1_id = booking1["id"]
        booking1_code = booking1.get("code")
        total1 = booking1.get("pricing", {}).get("total", 0)
        
        results.add("TEST 4.1", True, f"Created booking {booking1_code}, total ₹{total1}")
        
        # Cancel
        headers = {"Authorization": f"Bearer {customer_token}"}
        r = requests.post(f"{BASE_URL}/bookings/{booking1_id}/cancel",
                         json={"reason": "Test regression case 1"},
                         headers=headers)
        
        results.add("TEST 4.2", r.status_code == 200,
                   f"Cancelled booking: {r.status_code}")
        
        if r.status_code == 200:
            cancelled = r.json()
            canc_data = cancelled.get("cancellation", {})
            
            # Check 100% refund
            refund_pct = canc_data.get("refund_pct", 0)
            results.add("TEST 4.3", refund_pct == 100,
                       f"refund_pct={refund_pct} (expected 100)")
            
            refund = canc_data.get("refund", 0)
            diff = abs(refund - total1)
            results.add("TEST 4.4", diff <= 0.01,
                       f"refund=₹{refund}, total=₹{total1}, diff=₹{diff:.2f}")
            
            partner_cut = canc_data.get("partner_cut", 0)
            results.add("TEST 4.5", partner_cut == 0,
                       f"partner_cut=₹{partner_cut} (expected 0)")
        
        # CASE 2: With partner - 80/20 split
        print("\n--- CASE 2: With partner (80/20 split) ---")
        booking2 = create_and_pay_booking(customer_token)
        booking2_id = booking2["id"]
        booking2_code = booking2.get("code")
        pricing2 = booking2.get("pricing", {})
        base2 = pricing2.get("commissionable_base", 0)
        
        results.add("TEST 4.6", True, f"Created booking {booking2_code}, base ₹{base2}")
        
        # Assign partner
        headers_admin = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{BASE_URL}/admin/partners", headers=headers_admin)
        partners = r.json().get("partners", [])
        partner_id = partners[0]["id"]
        
        r = requests.post(f"{BASE_URL}/admin/bookings/{booking2_id}/assign",
                         json={"partner_id": partner_id},
                         headers=headers_admin)
        
        results.add("TEST 4.7", r.status_code == 200,
                   f"Partner assigned: {r.status_code}")
        
        # Cancel
        r = requests.post(f"{BASE_URL}/bookings/{booking2_id}/cancel",
                         json={"reason": "Test regression case 2"},
                         headers=headers)
        
        results.add("TEST 4.8", r.status_code == 200,
                   f"Cancelled booking: {r.status_code}")
        
        if r.status_code == 200:
            cancelled = r.json()
            canc_data = cancelled.get("cancellation", {})
            
            # Check 80% refund
            refund_pct = canc_data.get("refund_pct", 0)
            results.add("TEST 4.9", refund_pct == 80,
                       f"refund_pct={refund_pct} (expected 80)")
            
            # Check partner_cut = base * 0.2 * (1 - 0.32)
            cancel_charge = canc_data.get("cancel_charge", 0)
            expected_cancel = round(base2 * 0.2, 2)
            diff = abs(cancel_charge - expected_cancel)
            results.add("TEST 4.10", diff <= 0.02,
                       f"cancel_charge=₹{cancel_charge}, expected=₹{expected_cancel}")
            
            partner_cut = canc_data.get("partner_cut", 0)
            expected_partner = round(cancel_charge * (1 - 0.32), 2)
            diff = abs(partner_cut - expected_partner)
            results.add("TEST 4.11", diff <= 0.02,
                       f"partner_cut=₹{partner_cut}, expected=₹{expected_partner}")
        
        # Try to cancel again (should fail)
        print("\n--- Duplicate cancellation prevention ---")
        r = requests.post(f"{BASE_URL}/bookings/{booking2_id}/cancel",
                         json={"reason": "Try to cancel again"},
                         headers=headers)
        
        results.add("TEST 4.12", r.status_code == 400,
                   f"Duplicate cancel returned {r.status_code} (expected 400)")
        
        # Check invoice count didn't increase
        time.sleep(1)
        r = requests.get(f"{BASE_URL}/invoices?page_size=100", headers=headers)
        if r.status_code == 200:
            invoices = r.json().get("items", [])
            booking2_invoices = [inv for inv in invoices if inv.get("booking_id") == booking2_id]
            
            refund_count = len([inv for inv in booking2_invoices 
                               if inv.get("invoice_type") == "refund"])
            
            results.add("TEST 4.13", refund_count == 1,
                       f"Still only 1 refund invoice (found {refund_count})")
            
    except Exception as e:
        results.add("TEST 4.ERROR", False, f"Exception: {str(e)}")

def test_no_500_errors():
    """TEST 5: No 500 errors anywhere"""
    print("\n" + "="*80)
    print("TEST 5: No 500 errors anywhere")
    print("="*80)
    
    # This is verified throughout all tests
    # Count any 500 errors from previous tests
    error_500_count = sum(1 for t in results.tests if "500" in t.get("details", ""))
    
    results.add("TEST 5.1", error_500_count == 0,
               f"No 500 errors found in any test" if error_500_count == 0 
               else f"Found {error_500_count} 500 errors")

def main():
    print("\n" + "="*80)
    print("BACKEND TEST: NEW Cancellation/Refund/Invoice Flow Additions")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Customer: {CUSTOMER_PHONE}, Admin: {ADMIN_PHONE}, Partner: {PARTNER_PHONE}")
    print(f"OTP: {OTP}")
    print(f"Serviceable pincode: {SERVICEABLE_PINCODE}")
    print("="*80)
    
    # Run all tests
    test_cancellation_preview_no_partner()
    test_cancellation_preview_with_partner()
    test_two_document_types()
    test_idempotency()
    test_regression()
    test_no_500_errors()
    
    # Print summary
    results.summary()
    
    # Report exact amounts
    print("\n" + "="*80)
    print("DETAILED REPORT")
    print("="*80)
    print("\nAll tests completed. Check individual test results above for exact amounts")
    print("and per-type invoice counts for each booking.")

if __name__ == "__main__":
    main()
