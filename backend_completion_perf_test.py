#!/usr/bin/env python3
"""
PERFORMANCE BUG FIX VERIFICATION — Job completion OTP submit latency test.

REPORTED BUG: POST /api/bookings/{id}/complete took a LONG time because invoice 
emails were sent synchronously (2 blocking SMTP sends).

FIX: Invoice email dispatch and customer completion notification are now 
fire-and-forget background tasks; invoice is still generated synchronously.

WHAT TO TEST:
1) MEASURE completion latency (primary): Time the POST /api/bookings/{id}/complete call.
   PASS CRITERION: Returns in well under ~2 seconds (ideally sub-second), NOT multi-second delay.

2) REGRESSION — completion correctness (must still work):
   - Response status 200 and booking status becomes 'completed', payment_status 'paid'
   - Invoice IS generated with BOTH customer_snapshot and partner_snapshot
   - Partner wallet/commission settled (commission object present on booking)
   - No 500 errors anywhere in the flow

3) Confirm no error is thrown by the background tasks (check response body is the completed booking with otps cleared)
"""

import requests
import json
import time
import sys
from datetime import datetime, timedelta

# Base URL from frontend/.env
BASE_URL = "https://azoapp-staging.preview.emergentagent.com/api"

# Test credentials
ADMIN_PHONE = "+919000000000"
CUSTOMER_PHONE = "+919000000004"
PARTNER_PHONE = "+919000000003"  # Raj Kumar
MERCHANT_PHONE = "+919000000002"
OTP = "123456"

# Test data
SERVICEABLE_PINCODE = "800001"
SERVICEABLE_CITY = "Patna"

# Results tracking
results = {
    "test_name": "PERFORMANCE BUG FIX VERIFICATION — Job Completion Latency",
    "timestamp": datetime.utcnow().isoformat(),
    "base_url": BASE_URL,
    "tests": [],
    "summary": {
        "total": 0,
        "passed": 0,
        "failed": 0
    }
}

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")
    sys.stdout.flush()

def test(name, condition, details=""):
    results["tests"].append({
        "name": name,
        "passed": condition,
        "details": details
    })
    results["summary"]["total"] += 1
    if condition:
        results["summary"]["passed"] += 1
        log(f"✅ {name}")
    else:
        results["summary"]["failed"] += 1
        log(f"❌ {name}")
        if details:
            log(f"   Details: {details}")
    return condition

def login(phone):
    """Login and return token"""
    log(f"Logging in as {phone}...")
    # Send OTP
    r = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if r.status_code != 200:
        log(f"❌ Failed to send OTP: {r.status_code} {r.text}")
        return None
    
    # Verify OTP
    r = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    if r.status_code != 200:
        log(f"❌ Failed to verify OTP: {r.status_code} {r.text}")
        return None
    
    data = r.json()
    token = data.get("token")
    log(f"✅ Logged in as {phone}")
    return token

def get_service_id():
    """Get a service ID for booking (AC service in Patna)"""
    log("Fetching services...")
    r = requests.get(f"{BASE_URL}/catalog/services")
    if r.status_code != 200:
        log(f"❌ Failed to fetch services: {r.status_code}")
        return None
    
    services = r.json()
    # Look for AC service or any service
    for svc in services:
        if "AC" in svc.get("name", "").upper() or "Air Conditioner" in svc.get("name", ""):
            log(f"✅ Found service: {svc.get('name')} (ID: {svc.get('id')})")
            return svc.get("id")
    
    # Fallback to first service
    if services:
        svc = services[0]
        log(f"✅ Using service: {svc.get('name')} (ID: {svc.get('id')})")
        return svc.get("id")
    
    log("❌ No services found")
    return None

def create_booking(customer_token, service_id):
    """Create a scheduled booking"""
    log("Creating scheduled booking...")
    
    # Schedule for 2 hours in future (within unlock window for testing)
    # Round to nearest 30-minute slot
    future_time = datetime.utcnow() + timedelta(hours=2)
    # Round minutes to 00 or 30
    if future_time.minute < 30:
        future_time = future_time.replace(minute=0, second=0, microsecond=0)
    else:
        future_time = future_time.replace(minute=30, second=0, microsecond=0)
    
    scheduled_at = future_time.strftime("%Y-%m-%dT%H:%M:%S")
    
    payload = {
        "service_id": service_id,
        "address": {
            "line": "12 MG Road",
            "pincode": SERVICEABLE_PINCODE,
            "city": SERVICEABLE_CITY,
            "state": "Bihar",
            "lat": 25.6,
            "lng": 85.1
        },
        "schedule_type": "schedule",
        "scheduled_at": scheduled_at,
        "notes": "Performance test booking"
    }
    
    headers = {"Authorization": f"Bearer {customer_token}"}
    r = requests.post(f"{BASE_URL}/bookings", json=payload, headers=headers)
    
    if r.status_code != 200:
        log(f"❌ Failed to create booking: {r.status_code} {r.text}")
        return None
    
    booking = r.json()
    booking_id = booking.get("id")
    booking_code = booking.get("code")
    log(f"✅ Created booking: {booking_code} (ID: {booking_id})")
    return booking

def pay_booking(customer_token, booking_id):
    """Pay booking via mock payment"""
    log(f"Paying booking {booking_id}...")
    
    headers = {"Authorization": f"Bearer {customer_token}"}
    r = requests.post(f"{BASE_URL}/payments/mock", 
                     json={"purpose": "booking", "booking_id": booking_id},
                     headers=headers)
    
    if r.status_code != 200:
        log(f"❌ Failed to pay booking: {r.status_code} {r.text}")
        return False
    
    log(f"✅ Paid booking {booking_id}")
    return True

def assign_partner(admin_token, booking_id, partner_id):
    """Admin assigns partner to booking"""
    log(f"Assigning partner to booking {booking_id}...")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    r = requests.post(f"{BASE_URL}/admin/bookings/{booking_id}/assign",
                     json={"partner_id": partner_id},
                     headers=headers)
    
    if r.status_code != 200:
        log(f"❌ Failed to assign partner: {r.status_code} {r.text}")
        return False
    
    log(f"✅ Assigned partner to booking {booking_id}")
    return True

def get_partner_id(admin_token):
    """Get partner ID for Raj (+919000000003)"""
    log("Fetching partner ID...")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    r = requests.get(f"{BASE_URL}/admin/partners", headers=headers)
    
    if r.status_code != 200:
        log(f"❌ Failed to fetch partners: {r.status_code}")
        return None
    
    data = r.json()
    partners = data.get("partners", [])
    
    for p in partners:
        if p.get("phone") == PARTNER_PHONE:
            partner_id = p.get("id")
            log(f"✅ Found partner: {p.get('name')} (ID: {partner_id})")
            return partner_id
    
    log(f"❌ Partner {PARTNER_PHONE} not found")
    return None

def partner_accept(partner_token, booking_id):
    """Partner accepts the job"""
    log(f"Partner accepting job {booking_id}...")
    
    headers = {"Authorization": f"Bearer {partner_token}"}
    r = requests.post(f"{BASE_URL}/bookings/{booking_id}/accept", headers=headers)
    
    if r.status_code != 200:
        log(f"❌ Failed to accept job: {r.status_code} {r.text}")
        return False
    
    log(f"✅ Partner accepted job {booking_id}")
    return True

def get_booking(token, booking_id):
    """Get booking details"""
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE_URL}/bookings/{booking_id}", headers=headers)
    
    if r.status_code != 200:
        log(f"❌ Failed to get booking: {r.status_code}")
        return None
    
    return r.json()

def partner_start(partner_token, booking_id, start_otp):
    """Partner starts the job"""
    log(f"Partner starting job {booking_id}...")
    
    headers = {"Authorization": f"Bearer {partner_token}"}
    r = requests.post(f"{BASE_URL}/bookings/{booking_id}/start-otp",
                     json={"otp": start_otp},
                     headers=headers)
    
    if r.status_code != 200:
        log(f"❌ Failed to start job: {r.status_code} {r.text}")
        return False
    
    log(f"✅ Partner started job {booking_id}")
    return True

def upload_before_photo(partner_token, booking_id):
    """Upload before work photo (required before starting)"""
    log(f"Uploading before photo for booking {booking_id}...")
    
    headers = {"Authorization": f"Bearer {partner_token}"}
    r = requests.post(f"{BASE_URL}/bookings/{booking_id}/evidence",
                     json={"stage": "before", "images": ["https://example.com/before.jpg"]},
                     headers=headers)
    
    if r.status_code != 200:
        log(f"❌ Failed to upload before photo: {r.status_code} {r.text}")
        return False
    
    log(f"✅ Uploaded before photo for booking {booking_id}")
    return True

def upload_after_photo(partner_token, booking_id):
    """Upload after work photo (required before completion)"""
    log(f"Uploading after photo for booking {booking_id}...")
    
    headers = {"Authorization": f"Bearer {partner_token}"}
    r = requests.post(f"{BASE_URL}/bookings/{booking_id}/evidence",
                     json={"stage": "after", "images": ["https://example.com/after.jpg"]},
                     headers=headers)
    
    if r.status_code != 200:
        log(f"❌ Failed to upload after photo: {r.status_code} {r.text}")
        return False
    
    log(f"✅ Uploaded after photo for booking {booking_id}")
    return True

def partner_complete(partner_token, booking_id, completion_otp):
    """Partner completes the job - MEASURE LATENCY"""
    log(f"Partner completing job {booking_id}...")
    log("⏱️  MEASURING COMPLETION LATENCY...")
    
    headers = {"Authorization": f"Bearer {partner_token}"}
    
    # Measure elapsed time
    start_time = time.time()
    r = requests.post(f"{BASE_URL}/bookings/{booking_id}/complete",
                     json={"otp": completion_otp},
                     headers=headers)
    elapsed_time = time.time() - start_time
    
    log(f"⏱️  COMPLETION LATENCY: {elapsed_time:.3f} seconds")
    
    if r.status_code != 200:
        log(f"❌ Failed to complete job: {r.status_code} {r.text}")
        return None, elapsed_time
    
    booking = r.json()
    log(f"✅ Partner completed job {booking_id}")
    return booking, elapsed_time

def get_invoice(admin_token, booking_id):
    """Get invoice for booking"""
    log(f"Fetching invoice for booking {booking_id}...")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    r = requests.get(f"{BASE_URL}/invoices?booking_id={booking_id}", headers=headers)
    
    if r.status_code != 200:
        log(f"❌ Failed to fetch invoices: {r.status_code}")
        return None
    
    data = r.json()
    items = data.get("items", [])
    
    for inv in items:
        if inv.get("booking_id") == booking_id and inv.get("invoice_type") == "booking":
            log(f"✅ Found invoice: {inv.get('invoice_number')}")
            return inv
    
    log(f"❌ Invoice not found for booking {booking_id}")
    return None

def main():
    log("=" * 80)
    log("PERFORMANCE BUG FIX VERIFICATION — Job Completion Latency Test")
    log("=" * 80)
    
    # Login all users
    log("\n--- SETUP: Login ---")
    admin_token = login(ADMIN_PHONE)
    customer_token = login(CUSTOMER_PHONE)
    partner_token = login(PARTNER_PHONE)
    
    if not all([admin_token, customer_token, partner_token]):
        log("❌ Failed to login all users")
        return
    
    # Get service ID
    service_id = get_service_id()
    if not service_id:
        log("❌ Failed to get service ID")
        return
    
    # Get partner ID
    partner_id = get_partner_id(admin_token)
    if not partner_id:
        log("❌ Failed to get partner ID")
        return
    
    # Create booking
    log("\n--- STEP 1: Create Booking ---")
    booking = create_booking(customer_token, service_id)
    if not booking:
        log("❌ Failed to create booking")
        return
    
    booking_id = booking.get("id")
    booking_code = booking.get("code")
    
    # Pay booking
    log("\n--- STEP 2: Pay Booking ---")
    if not pay_booking(customer_token, booking_id):
        log("❌ Failed to pay booking")
        return
    
    # Assign partner
    log("\n--- STEP 3: Assign Partner ---")
    if not assign_partner(admin_token, booking_id, partner_id):
        log("❌ Failed to assign partner")
        return
    
    # Partner accepts (or check if already assigned)
    log("\n--- STEP 4: Partner Accepts ---")
    # First check if booking is already assigned
    booking = get_booking(partner_token, booking_id)
    if booking and booking.get("status") == "assigned":
        log(f"✅ Booking already assigned to partner")
    else:
        if not partner_accept(partner_token, booking_id):
            log("❌ Failed partner accept")
            # Try to continue anyway - might be auto-assigned
            booking = get_booking(partner_token, booking_id)
            if not booking or booking.get("status") != "assigned":
                return
    
    # Get booking to read start OTP
    log("\n--- STEP 5: Get Start OTP ---")
    # Get booking as customer (OTPs visible to customer)
    booking = get_booking(customer_token, booking_id)
    if not booking:
        log("❌ Failed to get booking")
        return
    
    start_otp = booking.get("otps", {}).get("start")
    completion_otp = booking.get("otps", {}).get("completion")
    
    if not start_otp or not completion_otp:
        log(f"❌ Failed to get OTPs: start={start_otp}, completion={completion_otp}")
        return
    
    log(f"✅ Got OTPs: start={start_otp}, completion={completion_otp}")
    
    # Upload before photo (required before starting)
    log("\n--- STEP 6: Upload Before Photo ---")
    if not upload_before_photo(partner_token, booking_id):
        log("❌ Failed to upload before photo")
        return
    
    # Partner starts
    log("\n--- STEP 7: Partner Starts Job ---")
    if not partner_start(partner_token, booking_id, start_otp):
        log("❌ Failed partner start")
        return
    
    # Upload after photo
    log("\n--- STEP 8: Upload After Photo ---")
    if not upload_after_photo(partner_token, booking_id):
        log("❌ Failed to upload after photo")
        return
    
    # Partner completes - MEASURE LATENCY
    log("\n--- STEP 9: Partner Completes Job (MEASURE LATENCY) ---")
    completed_booking, elapsed_time = partner_complete(partner_token, booking_id, completion_otp)
    
    if not completed_booking:
        log("❌ Failed partner complete")
        return
    
    # TEST 1: Measure completion latency
    log("\n" + "=" * 80)
    log("TEST 1 — COMPLETION LATENCY (PRIMARY)")
    log("=" * 80)
    
    test(
        "Completion latency < 2 seconds",
        elapsed_time < 2.0,
        f"Elapsed time: {elapsed_time:.3f}s (PASS CRITERION: < 2s, ideally < 1s)"
    )
    
    test(
        "Completion latency < 1 second (ideal)",
        elapsed_time < 1.0,
        f"Elapsed time: {elapsed_time:.3f}s (IDEAL: < 1s)"
    )
    
    # Store the measured latency
    results["completion_latency_seconds"] = round(elapsed_time, 3)
    
    # TEST 2: Regression - completion correctness
    log("\n" + "=" * 80)
    log("TEST 2 — REGRESSION: Completion Correctness")
    log("=" * 80)
    
    # Check response status and booking status
    test(
        "Booking status is 'completed'",
        completed_booking.get("status") == "completed",
        f"Status: {completed_booking.get('status')}"
    )
    
    test(
        "Payment status is 'paid'",
        completed_booking.get("payment_status") == "paid",
        f"Payment status: {completed_booking.get('payment_status')}"
    )
    
    # Check commission is settled
    commission = completed_booking.get("commission")
    test(
        "Commission object present",
        commission is not None,
        f"Commission: {commission}"
    )
    
    if commission:
        test(
            "Partner earning > 0",
            float(commission.get("partner_earning", 0)) > 0,
            f"Partner earning: {commission.get('partner_earning')}"
        )
    
    # Check OTPs are cleared in response
    test(
        "OTPs cleared in response",
        completed_booking.get("otps") == {},
        f"OTPs: {completed_booking.get('otps')}"
    )
    
    # Get invoice
    log("\n--- Fetching Invoice ---")
    time.sleep(1)  # Give invoice generation a moment
    invoice = get_invoice(admin_token, booking_id)
    
    test(
        "Invoice exists",
        invoice is not None,
        f"Invoice: {invoice.get('invoice_number') if invoice else 'NOT FOUND'}"
    )
    
    if invoice:
        # Check customer_snapshot
        customer_snapshot = invoice.get("customer_snapshot")
        test(
            "Invoice has customer_snapshot",
            customer_snapshot is not None and customer_snapshot != {},
            f"Customer snapshot: {customer_snapshot}"
        )
        
        # Check partner_snapshot
        partner_snapshot = invoice.get("partner_snapshot")
        test(
            "Invoice has partner_snapshot",
            partner_snapshot is not None and partner_snapshot != {},
            f"Partner snapshot: {partner_snapshot}"
        )
        
        # Check both snapshots have required fields
        if customer_snapshot:
            test(
                "Customer snapshot has name",
                customer_snapshot.get("name") is not None,
                f"Customer name: {customer_snapshot.get('name')}"
            )
        
        if partner_snapshot:
            test(
                "Partner snapshot has name",
                partner_snapshot.get("name") is not None,
                f"Partner name: {partner_snapshot.get('name')}"
            )
            
            test(
                "Partner snapshot has phone",
                partner_snapshot.get("phone") is not None,
                f"Partner phone: {partner_snapshot.get('phone')}"
            )
    
    # TEST 3: No errors in background tasks
    log("\n" + "=" * 80)
    log("TEST 3 — Background Tasks (No Errors)")
    log("=" * 80)
    
    test(
        "Response body is valid booking object",
        completed_booking.get("id") == booking_id,
        f"Booking ID matches: {completed_booking.get('id')}"
    )
    
    test(
        "No error fields in response",
        "error" not in completed_booking and "detail" not in completed_booking,
        "Response is clean booking object, no error fields"
    )
    
    # Final summary
    log("\n" + "=" * 80)
    log("TEST SUMMARY")
    log("=" * 80)
    log(f"Total tests: {results['summary']['total']}")
    log(f"Passed: {results['summary']['passed']}")
    log(f"Failed: {results['summary']['failed']}")
    log(f"Pass rate: {results['summary']['passed'] / results['summary']['total'] * 100:.1f}%")
    log(f"\n⏱️  COMPLETION LATENCY: {elapsed_time:.3f} seconds")
    
    if elapsed_time < 2.0:
        log("✅ PERFORMANCE FIX VERIFIED: Completion returns FAST (< 2s)")
    else:
        log("❌ PERFORMANCE ISSUE: Completion took > 2s")
    
    if results['summary']['failed'] == 0:
        log("✅ ALL REGRESSION TESTS PASSED")
    else:
        log(f"❌ {results['summary']['failed']} REGRESSION TEST(S) FAILED")
    
    # Save results
    with open("/app/test_results_completion_perf.json", "w") as f:
        json.dump(results, f, indent=2)
    
    log("\n✅ Results saved to /app/test_results_completion_perf.json")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"❌ Test failed with exception: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
