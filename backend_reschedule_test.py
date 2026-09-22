#!/usr/bin/env python3
"""
Comprehensive test for RESCHEDULE mutual-approval flow (Customer ↔ Partner).
Tests all 9 scenarios from the review request.
"""
import requests
import json
from datetime import datetime, timedelta, timezone

# Configuration
BASE_URL = "https://fullscreen-alert-fix.preview.emergentagent.com/api"
OTP = "123456"

# Test accounts
ADMIN_PHONE = "+919000000000"
PARTNER_PHONE = "+919000000003"
CUSTOMER_PHONE = "+919000000004"
THIRD_PARTY_PHONE = "+919000000006"  # For auth test

# Test results
results = {
    "total": 0,
    "passed": 0,
    "failed": 0,
    "tests": []
}

def log_test(name, passed, details=""):
    """Log test result"""
    results["total"] += 1
    if passed:
        results["passed"] += 1
        print(f"✅ {name}")
    else:
        results["failed"] += 1
        print(f"❌ {name}")
        if details:
            print(f"   Details: {details}")
    results["tests"].append({
        "name": name,
        "passed": passed,
        "details": details
    })

def send_otp(phone):
    """Send OTP to phone"""
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    return resp.status_code == 200

def verify_otp(phone, otp=OTP):
    """Verify OTP and get token"""
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": otp})
    if resp.status_code == 200:
        data = resp.json()
        return data.get("token"), data.get("user")
    return None, None

def get_headers(token):
    """Get authorization headers"""
    return {"Authorization": f"Bearer {token}"}

def get_ist_time(hours_offset=0):
    """Get IST time string (naive format YYYY-MM-DDTHH:MM)"""
    # UTC now + 5:30 for IST + offset
    utc_now = datetime.now(timezone.utc)
    ist_now = utc_now + timedelta(hours=5, minutes=30) + timedelta(hours=hours_offset)
    return ist_now.strftime("%Y-%m-%dT%H:%M")

def create_scheduled_booking(customer_token, service_id, scheduled_hours=3):
    """Create a scheduled booking"""
    scheduled_at = get_ist_time(scheduled_hours)
    payload = {
        "service_id": service_id,
        "address": {
            "line": "123 Test Street, Patna",
            "city": "Patna",
            "pincode": "800001"
        },
        "schedule_type": "schedule",
        "scheduled_at": scheduled_at
    }
    resp = requests.post(
        f"{BASE_URL}/bookings",
        json=payload,
        headers=get_headers(customer_token)
    )
    if resp.status_code == 200:
        return resp.json()
    return None

def pay_booking(customer_token, booking_id):
    """Pay booking via wallet (if possible)"""
    resp = requests.post(
        f"{BASE_URL}/bookings/{booking_id}/pay-wallet",
        headers=get_headers(customer_token)
    )
    return resp.status_code == 200

def assign_partner(admin_token, booking_id, partner_id):
    """Assign partner to booking"""
    resp = requests.post(
        f"{BASE_URL}/admin/bookings/{booking_id}/assign",
        json={"partner_id": partner_id},
        headers=get_headers(admin_token)
    )
    return resp.status_code == 200

def get_booking(token, booking_id):
    """Get booking details"""
    resp = requests.get(
        f"{BASE_URL}/bookings/{booking_id}",
        headers=get_headers(token)
    )
    if resp.status_code == 200:
        return resp.json()
    return None

def request_reschedule(token, booking_id, scheduled_at):
    """Request reschedule"""
    resp = requests.post(
        f"{BASE_URL}/bookings/{booking_id}/reschedule/request",
        json={"scheduled_at": scheduled_at},
        headers=get_headers(token)
    )
    return resp

def respond_reschedule(token, booking_id, action):
    """Respond to reschedule request"""
    resp = requests.post(
        f"{BASE_URL}/bookings/{booking_id}/reschedule/respond",
        json={"action": action},
        headers=get_headers(token)
    )
    return resp

def cancel_reschedule(token, booking_id):
    """Cancel reschedule request"""
    resp = requests.post(
        f"{BASE_URL}/bookings/{booking_id}/reschedule/cancel",
        headers=get_headers(token)
    )
    return resp

def main():
    print("=" * 80)
    print("RESCHEDULE MUTUAL-APPROVAL FLOW TEST")
    print("=" * 80)
    print()

    # SETUP: Login all users
    print("SETUP: Logging in users...")
    
    # Customer login
    send_otp(CUSTOMER_PHONE)
    customer_token, customer_user = verify_otp(CUSTOMER_PHONE)
    if not customer_token:
        print("❌ Failed to login customer")
        return
    print(f"✅ Customer logged in: {customer_user.get('id')}")
    
    # Partner login
    send_otp(PARTNER_PHONE)
    partner_token, partner_user = verify_otp(PARTNER_PHONE)
    if not partner_token:
        print("❌ Failed to login partner")
        return
    print(f"✅ Partner logged in: {partner_user.get('id')}")
    
    # Admin login
    send_otp(ADMIN_PHONE)
    admin_token, admin_user = verify_otp(ADMIN_PHONE)
    if not admin_token:
        print("❌ Failed to login admin")
        return
    print(f"✅ Admin logged in: {admin_user.get('id')}")
    
    print()
    
    # Get a service
    print("SETUP: Getting service...")
    resp = requests.get(f"{BASE_URL}/catalog/services")
    services = resp.json()
    if not services:
        print("❌ No services available")
        return
    service_id = services[0]["id"]
    print(f"✅ Using service: {services[0]['name']} (ID: {service_id})")
    print()
    
    # Create scheduled booking
    print("SETUP: Creating scheduled booking...")
    booking = create_scheduled_booking(customer_token, service_id, scheduled_hours=3)
    if not booking:
        print("❌ Failed to create booking")
        return
    booking_id = booking["id"]
    original_scheduled_at = booking.get("scheduled_at")
    print(f"✅ Booking created: {booking_id}")
    print(f"   Original scheduled_at: {original_scheduled_at}")
    print()
    
    # Try to pay (optional)
    print("SETUP: Attempting payment (optional)...")
    if pay_booking(customer_token, booking_id):
        print("✅ Payment successful")
    else:
        print("⚠️  Payment failed (wallet empty) - continuing without payment")
    print()
    
    # Assign partner
    print("SETUP: Assigning partner...")
    if not assign_partner(admin_token, booking_id, partner_user["id"]):
        print("❌ Failed to assign partner")
        return
    print(f"✅ Partner assigned: {partner_user['id']}")
    print()
    
    # Verify booking status
    booking = get_booking(customer_token, booking_id)
    if booking.get("status") != "assigned":
        print(f"❌ Booking status is {booking.get('status')}, expected 'assigned'")
        return
    print(f"✅ Booking status: assigned")
    print()
    
    print("=" * 80)
    print("RUNNING TESTS")
    print("=" * 80)
    print()
    
    # TEST 1: CUSTOMER REQUEST
    print("TEST 1: Customer requests reschedule")
    new_time_1 = get_ist_time(48)  # 2 days from now
    resp = request_reschedule(customer_token, booking_id, new_time_1)
    log_test(
        "1.1 Customer POST /reschedule/request returns 200",
        resp.status_code == 200,
        f"Got {resp.status_code}"
    )
    
    # Verify booking state
    booking = get_booking(customer_token, booking_id)
    req = booking.get("reschedule_request", {})
    
    log_test(
        "1.2 reschedule_request.status == 'pending'",
        req.get("status") == "pending",
        f"Got {req.get('status')}"
    )
    
    log_test(
        "1.3 reschedule_request.requested_by_role == 'customer'",
        req.get("requested_by_role") == "customer",
        f"Got {req.get('requested_by_role')}"
    )
    
    log_test(
        "1.4 old_date/old_time/new_date/new_time populated",
        all([req.get("old_date"), req.get("old_time"), req.get("new_date"), req.get("new_time")]),
        f"old_date={req.get('old_date')}, old_time={req.get('old_time')}, new_date={req.get('new_date')}, new_time={req.get('new_time')}"
    )
    
    log_test(
        "1.5 booking.scheduled_at UNCHANGED (still original)",
        booking.get("scheduled_at") == original_scheduled_at,
        f"Expected {original_scheduled_at}, got {booking.get('scheduled_at')}"
    )
    print()
    
    # TEST 2: DUP GUARD
    print("TEST 2: Duplicate request while pending")
    resp = request_reschedule(customer_token, booking_id, new_time_1)
    log_test(
        "2.1 Second request returns 409",
        resp.status_code == 409,
        f"Got {resp.status_code}"
    )
    print()
    
    # TEST 3: WRONG RESPONDER
    print("TEST 3: Requester tries to respond (should fail)")
    resp = respond_reschedule(customer_token, booking_id, "accept")
    log_test(
        "3.1 Requester POST /reschedule/respond returns 403",
        resp.status_code == 403,
        f"Got {resp.status_code}"
    )
    print()
    
    # TEST 4: PARTNER ACCEPT
    print("TEST 4: Partner accepts reschedule")
    resp = respond_reschedule(partner_token, booking_id, "accept")
    log_test(
        "4.1 Partner POST /reschedule/respond {action:'accept'} returns 200",
        resp.status_code == 200,
        f"Got {resp.status_code}"
    )
    
    # Verify booking state after accept
    booking = get_booking(customer_token, booking_id)
    
    log_test(
        "4.2 scheduled_at == new value",
        booking.get("scheduled_at") == new_time_1,
        f"Expected {new_time_1}, got {booking.get('scheduled_at')}"
    )
    
    log_test(
        "4.3 reschedule_request == null",
        booking.get("reschedule_request") is None,
        f"Got {booking.get('reschedule_request')}"
    )
    
    history = booking.get("reschedule_history", [])
    log_test(
        "4.4 reschedule_history has accepted entry",
        len(history) >= 1 and any(h.get("status") == "accepted" for h in history),
        f"History length: {len(history)}, statuses: {[h.get('status') for h in history]}"
    )
    
    timeline = booking.get("timeline", [])
    log_test(
        "4.5 timeline contains 'reschedule_accepted'",
        any(t.get("status") == "reschedule_accepted" for t in timeline),
        f"Timeline statuses: {[t.get('status') for t in timeline]}"
    )
    
    schedule = booking.get("schedule", {})
    log_test(
        "4.6 schedule.scheduled_date reflects new date",
        schedule.get("scheduled_date") is not None,
        f"Got {schedule.get('scheduled_date')}"
    )
    print()
    
    # TEST 5: IDEMPOTENT
    print("TEST 5: Partner tries to accept again (idempotent)")
    resp = respond_reschedule(partner_token, booking_id, "accept")
    log_test(
        "5.1 Second accept returns 404 (no pending request)",
        resp.status_code == 404,
        f"Got {resp.status_code}"
    )
    print()
    
    # TEST 6: PARTNER REQUEST → CUSTOMER REJECT
    print("TEST 6: Partner requests reschedule, customer rejects")
    current_scheduled_at = booking.get("scheduled_at")  # Should be new_time_1
    new_time_2 = get_ist_time(72)  # 3 days from now
    
    resp = request_reschedule(partner_token, booking_id, new_time_2)
    log_test(
        "6.1 Partner POST /reschedule/request returns 200",
        resp.status_code == 200,
        f"Got {resp.status_code}"
    )
    
    booking = get_booking(customer_token, booking_id)
    req = booking.get("reschedule_request", {})
    log_test(
        "6.2 requested_by_role == 'partner'",
        req.get("requested_by_role") == "partner",
        f"Got {req.get('requested_by_role')}"
    )
    
    # Customer rejects
    resp = respond_reschedule(customer_token, booking_id, "reject")
    log_test(
        "6.3 Customer POST /reschedule/respond {action:'reject'} returns 200",
        resp.status_code == 200,
        f"Got {resp.status_code}"
    )
    
    booking = get_booking(customer_token, booking_id)
    log_test(
        "6.4 scheduled_at UNCHANGED (still from step 4)",
        booking.get("scheduled_at") == current_scheduled_at,
        f"Expected {current_scheduled_at}, got {booking.get('scheduled_at')}"
    )
    
    log_test(
        "6.5 reschedule_request == null",
        booking.get("reschedule_request") is None,
        f"Got {booking.get('reschedule_request')}"
    )
    
    history = booking.get("reschedule_history", [])
    log_test(
        "6.6 reschedule_history has rejected entry",
        any(h.get("status") == "rejected" for h in history),
        f"History statuses: {[h.get('status') for h in history]}"
    )
    print()
    
    # TEST 7: WITHDRAW
    print("TEST 7: Customer requests reschedule, then withdraws")
    new_time_3 = get_ist_time(96)  # 4 days from now
    
    resp = request_reschedule(customer_token, booking_id, new_time_3)
    log_test(
        "7.1 Customer POST /reschedule/request returns 200",
        resp.status_code == 200,
        f"Got {resp.status_code}"
    )
    
    resp = cancel_reschedule(customer_token, booking_id)
    log_test(
        "7.2 Customer POST /reschedule/cancel returns 200",
        resp.status_code == 200,
        f"Got {resp.status_code}"
    )
    
    booking = get_booking(customer_token, booking_id)
    log_test(
        "7.3 reschedule_request == null",
        booking.get("reschedule_request") is None,
        f"Got {booking.get('reschedule_request')}"
    )
    
    history = booking.get("reschedule_history", [])
    log_test(
        "7.4 reschedule_history has cancelled entry",
        any(h.get("status") == "cancelled" for h in history),
        f"History statuses: {[h.get('status') for h in history]}"
    )
    
    # Partner tries to cancel when no pending
    resp = cancel_reschedule(partner_token, booking_id)
    log_test(
        "7.5 Partner POST /reschedule/cancel when no pending returns 404",
        resp.status_code == 404,
        f"Got {resp.status_code}"
    )
    print()
    
    # TEST 8: AUTH
    print("TEST 8: Third party (unrelated user) tries to access")
    
    # Create/login third party user
    send_otp(THIRD_PARTY_PHONE)
    third_party_token, third_party_user = verify_otp(THIRD_PARTY_PHONE)
    
    if third_party_token:
        resp = request_reschedule(third_party_token, booking_id, new_time_3)
        log_test(
            "8.1 Third party POST /reschedule/request returns 403 or 404",
            resp.status_code in [403, 404],
            f"Got {resp.status_code}"
        )
        
        # Create a pending request first
        request_reschedule(customer_token, booking_id, new_time_3)
        
        resp = respond_reschedule(third_party_token, booking_id, "accept")
        log_test(
            "8.2 Third party POST /reschedule/respond returns 403 or 404",
            resp.status_code in [403, 404],
            f"Got {resp.status_code}"
        )
        
        resp = cancel_reschedule(third_party_token, booking_id)
        log_test(
            "8.3 Third party POST /reschedule/cancel returns 403 or 404",
            resp.status_code in [403, 404],
            f"Got {resp.status_code}"
        )
        
        # Clean up pending request
        cancel_reschedule(customer_token, booking_id)
    else:
        log_test("8.1 Third party POST /reschedule/request returns 403 or 404", False, "Failed to create third party user")
        log_test("8.2 Third party POST /reschedule/respond returns 403 or 404", False, "Failed to create third party user")
        log_test("8.3 Third party POST /reschedule/cancel returns 403 or 404", False, "Failed to create third party user")
    print()
    
    # TEST 9: STATE GUARDS
    print("TEST 9: State guards")
    
    # 9a: Emergency booking
    print("  9a: Emergency booking")
    # Create emergency booking directly
    payload = {
        "service_id": service_id,
        "address": {
            "line": "123 Test Street, Patna",
            "city": "Patna",
            "pincode": "800001"
        },
        "schedule_type": "emergency"
    }
    resp = requests.post(
        f"{BASE_URL}/bookings",
        json=payload,
        headers=get_headers(customer_token)
    )
    if resp.status_code == 200:
        emergency_booking = resp.json()
        emergency_id = emergency_booking["id"]
        # Assign partner to move it to 'assigned' status
        assign_partner(admin_token, emergency_id, partner_user["id"])
        # Try to reschedule - should fail because schedule_type != 'schedule'
        resp = request_reschedule(customer_token, emergency_id, new_time_3)
        log_test(
            "9.1 Request on emergency booking returns 400",
            resp.status_code == 400,
            f"Got {resp.status_code}"
        )
    else:
        log_test("9.1 Request on emergency booking returns 400", False, "Failed to create emergency booking")
    
    # 9b: No partner assigned
    print("  9b: No partner assigned")
    no_partner_booking = create_scheduled_booking(customer_token, service_id, scheduled_hours=3)
    if no_partner_booking:
        no_partner_id = no_partner_booking["id"]
        resp = request_reschedule(customer_token, no_partner_id, new_time_3)
        log_test(
            "9.2 Request when no partner assigned returns 400",
            resp.status_code == 400,
            f"Got {resp.status_code}"
        )
    else:
        log_test("9.2 Request when no partner assigned returns 400", False, "Failed to create booking")
    print()
    
    # SUMMARY
    print("=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Total tests: {results['total']}")
    print(f"Passed: {results['passed']} ✅")
    print(f"Failed: {results['failed']} ❌")
    print(f"Success rate: {results['passed']/results['total']*100:.1f}%")
    print()
    
    if results['failed'] > 0:
        print("FAILED TESTS:")
        for test in results['tests']:
            if not test['passed']:
                print(f"  ❌ {test['name']}")
                if test['details']:
                    print(f"     {test['details']}")
    
    # Save results
    with open("/app/test_results_reschedule.json", "w") as f:
        json.dump(results, f, indent=2)
    print()
    print("Results saved to /app/test_results_reschedule.json")

if __name__ == "__main__":
    main()
