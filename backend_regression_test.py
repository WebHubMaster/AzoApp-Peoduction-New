#!/usr/bin/env python3
"""
COMPREHENSIVE REGRESSION SMOKE TEST for AzoApp Home Services Backend
After .env recreation and fresh database seed
"""
import requests
import json
import sys
import os
import time

# Base URL from environment or frontend/.env
REACT_APP_BACKEND_URL = "https://azoapp-staging.preview.emergentagent.com"
BASE_URL = REACT_APP_BACKEND_URL + "/api"
print(f"Testing against: {BASE_URL}\n")

# Test credentials (all OTP = 123456)
ADMIN_PHONE = "+919000000000"
MERCHANT_PHONE = "+919000000002"
PARTNER_RAJ_PHONE = "+919000000003"
PARTNER_AMIT_PHONE = "+919000000005"
CUSTOMER_PHONE = "+919000000004"
OTP = "123456"

# Test results tracking
test_results = {
    "passed": 0,
    "failed": 0,
    "errors": []
}

def log(msg):
    print(f"✓ {msg}")

def error(msg):
    print(f"✗ {msg}")
    test_results["errors"].append(msg)

def test_section(name):
    print(f"\n{'='*80}")
    print(f"  {name}")
    print(f"{'='*80}\n")

def assert_status(resp, expected, test_name):
    """Assert response status code"""
    if resp.status_code == expected:
        log(f"{test_name}: {resp.status_code} ✓")
        test_results["passed"] += 1
        return True
    else:
        error(f"{test_name}: Expected {expected}, got {resp.status_code}")
        error(f"  Response: {resp.text[:200]}")
        test_results["failed"] += 1
        return False

def assert_key_exists(data, key, test_name):
    """Assert key exists in response data"""
    if key in data:
        log(f"{test_name}: '{key}' exists ✓")
        test_results["passed"] += 1
        return True
    else:
        error(f"{test_name}: Missing key '{key}'")
        test_results["failed"] += 1
        return False

def login(phone, role_name):
    """Login and return token"""
    # Send OTP
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if resp.status_code != 200:
        error(f"{role_name} send-otp failed: {resp.status_code}")
        return None
    
    # Verify OTP
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    if resp.status_code != 200:
        error(f"{role_name} verify-otp failed: {resp.status_code}")
        return None
    
    data = resp.json()
    token = data.get("token")
    if token:
        log(f"{role_name} login successful")
        test_results["passed"] += 1
    else:
        error(f"{role_name} login failed: no token")
        test_results["failed"] += 1
    return token

# ============================================================================
# TEST 1: AUTH FLOWS
# ============================================================================
def test_auth():
    test_section("TEST 1: AUTH FLOWS")
    
    # 1.1 Admin login
    admin_token = login(ADMIN_PHONE, "Admin")
    if not admin_token:
        return None, None, None, None
    
    # 1.2 Merchant login
    merchant_token = login(MERCHANT_PHONE, "Merchant")
    
    # 1.3 Partner login (Raj Kumar)
    partner_raj_token = login(PARTNER_RAJ_PHONE, "Partner (Raj)")
    
    # 1.4 Partner login (Amit Singh)
    partner_amit_token = login(PARTNER_AMIT_PHONE, "Partner (Amit)")
    
    # 1.5 Customer login
    customer_token = login(CUSTOMER_PHONE, "Customer")
    
    # 1.6 Invalid OTP should be rejected
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": CUSTOMER_PHONE, "otp": "999999"})
    if resp.status_code in [400, 401]:
        log("Invalid OTP correctly rejected ✓")
        test_results["passed"] += 1
    else:
        error(f"Invalid OTP not rejected: {resp.status_code}")
        test_results["failed"] += 1
    
    # 1.7 Profile GET (using /auth/me endpoint)
    if customer_token:
        headers = {"Authorization": f"Bearer {customer_token}"}
        resp = requests.get(f"{BASE_URL}/auth/me", headers=headers)
        assert_status(resp, 200, "GET /auth/me")
        if resp.status_code == 200:
            data = resp.json()
            assert_key_exists(data, "phone", "Profile has phone")
    
    # 1.8 Profile PUT
    if customer_token:
        headers = {"Authorization": f"Bearer {customer_token}"}
        resp = requests.put(f"{BASE_URL}/auth/profile", 
                           json={"full_name": "Priya Verma Test"}, 
                           headers=headers)
        assert_status(resp, 200, "PUT /auth/profile")
    
    return admin_token, merchant_token, partner_raj_token, customer_token

# ============================================================================
# TEST 2: PUBLIC SITE ENDPOINTS
# ============================================================================
def test_public_site():
    test_section("TEST 2: PUBLIC SITE ENDPOINTS")
    
    # 2.1 Site config
    resp = requests.get(f"{BASE_URL}/site/config")
    assert_status(resp, 200, "GET /site/config")
    if resp.status_code == 200:
        data = resp.json()
        assert_key_exists(data, "branding", "Config has branding")
    
    # 2.2 Homepage data
    resp = requests.get(f"{BASE_URL}/site/homepage")
    assert_status(resp, 200, "GET /site/homepage")
    if resp.status_code == 200:
        data = resp.json()
        if isinstance(data, list) and len(data) > 0:
            log(f"Homepage sections: {len(data)} found ✓")
            test_results["passed"] += 1
        else:
            error("No homepage sections found")
            test_results["failed"] += 1
    
    # 2.3 Categories
    resp = requests.get(f"{BASE_URL}/catalog/categories")
    assert_status(resp, 200, "GET /catalog/categories")
    if resp.status_code == 200:
        data = resp.json()
        if isinstance(data, list) and len(data) > 0:
            log(f"Categories: {len(data)} found ✓")
            test_results["passed"] += 1
        else:
            error("No categories found")
            test_results["failed"] += 1
    
    # 2.4 Services listing
    resp = requests.get(f"{BASE_URL}/catalog/services")
    assert_status(resp, 200, "GET /catalog/services")
    if resp.status_code == 200:
        data = resp.json()
        if isinstance(data, list) and len(data) > 0:
            log(f"Services: {len(data)} found ✓")
            test_results["passed"] += 1
            return data[0].get("id")  # Return first service ID for booking test
        else:
            error("No services found")
            test_results["failed"] += 1
    
    # 2.5 Serviceability check (Patna)
    resp = requests.get(f"{BASE_URL}/serviceability?city=Patna")
    assert_status(resp, 200, "GET /serviceability?city=Patna")
    if resp.status_code == 200:
        data = resp.json()
        assert_key_exists(data, "serviceable", "Serviceability has serviceable")
        if data.get("serviceable"):
            log("Patna is serviceable ✓")
            test_results["passed"] += 1
    
    # 2.6 Global search
    resp = requests.get(f"{BASE_URL}/catalog/search?q=AC")
    assert_status(resp, 200, "GET /catalog/search?q=AC")
    
    # 2.7 Waitlist POST
    resp = requests.post(f"{BASE_URL}/waitlist", json={
        "pincode": "110001",
        "city": "Delhi",
        "phone": "+919999999999",
        "source": "test"
    })
    assert_status(resp, 200, "POST /waitlist")
    
    return None

# ============================================================================
# TEST 3: CUSTOMER BOOKING LIFECYCLE (MOST IMPORTANT)
# ============================================================================
def test_booking_lifecycle(customer_token, partner_raj_token, service_id):
    test_section("TEST 3: CUSTOMER BOOKING LIFECYCLE")
    
    if not customer_token or not service_id:
        error("Cannot test booking lifecycle: missing customer token or service ID")
        return None
    
    headers_customer = {"Authorization": f"Bearer {customer_token}"}
    headers_partner = {"Authorization": f"Bearer {partner_raj_token}"}
    
    # 3.1 Create booking
    booking_data = {
        "service_id": service_id,
        "schedule_type": "emergency",  # Use emergency for immediate booking
        "address": {
            "line": "123 Test Street",
            "city": "Patna",
            "state": "Bihar",
            "pincode": "800001",
            "lat": 25.5941,
            "lng": 85.1376
        },
        "notes": "Test booking"
    }
    
    resp = requests.post(f"{BASE_URL}/bookings", json=booking_data, headers=headers_customer)
    assert_status(resp, 200, "POST /bookings (create)")
    
    if resp.status_code != 200:
        error("Cannot continue booking lifecycle: booking creation failed")
        return None
    
    booking = resp.json()
    booking_id = booking.get("id")
    booking_code = booking.get("code")
    log(f"Booking created: {booking_code} (ID: {booking_id})")
    test_results["passed"] += 1
    
    # 3.2 Mock payment
    resp = requests.post(f"{BASE_URL}/payments/mock", json={
        "purpose": "booking",
        "booking_id": booking_id,
        "amount": booking.get("pricing", {}).get("total", 500)
    }, headers=headers_customer)
    assert_status(resp, 200, "POST /payments/mock (booking payment)")
    
    # Wait a moment for status update
    time.sleep(1)
    
    # 3.3 Check booking status moved to searching
    resp = requests.get(f"{BASE_URL}/bookings/customer", headers=headers_customer)
    if resp.status_code == 200:
        bookings = resp.json()
        current_booking = next((b for b in bookings if b.get("id") == booking_id), None)
        if current_booking:
            status = current_booking.get("status")
            if status == "searching":
                log(f"Booking status: {status} ✓")
                test_results["passed"] += 1
            else:
                error(f"Booking status: {status} (expected 'searching')")
                test_results["failed"] += 1
    
    # 3.4 Partner accepts booking
    if partner_raj_token:
        # Get partner jobs
        resp = requests.get(f"{BASE_URL}/bookings/partner/jobs", headers=headers_partner)
        if resp.status_code == 200:
            jobs = resp.json()
            job = next((j for j in jobs if j.get("id") == booking_id), None)
            if job:
                log(f"Partner sees job {booking_code} ✓")
                test_results["passed"] += 1
                
                # Accept job
                resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/accept", headers=headers_partner)
                assert_status(resp, 200, "POST /bookings/{id}/accept")
                
                if resp.status_code == 200:
                    time.sleep(1)
                    
                    # 3.5 Check status moved to assigned
                    resp = requests.get(f"{BASE_URL}/bookings/customer", headers=headers_customer)
                    if resp.status_code == 200:
                        bookings = resp.json()
                        current_booking = next((b for b in bookings if b.get("id") == booking_id), None)
                        if current_booking:
                            status = current_booking.get("status")
                            if status == "assigned":
                                log(f"Booking status after accept: {status} ✓")
                                test_results["passed"] += 1
                            else:
                                error(f"Booking status: {status} (expected 'assigned')")
                                test_results["failed"] += 1
                    
                    # 3.6 Upload before evidence
                    resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/evidence", json={
                        "stage": "before",
                        "photos": ["https://example.com/before.jpg"]
                    }, headers=headers_partner)
                    assert_status(resp, 200, "POST /bookings/{id}/evidence (before)")
                    
                    # 3.7 Start job with OTP
                    start_otp = booking.get("otps", {}).get("start")
                    if start_otp:
                        resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/start-otp", json={
                            "otp": start_otp
                        }, headers=headers_partner)
                        assert_status(resp, 200, "POST /bookings/{id}/start-otp")
                    
                    # 3.8 Complete job with OTP
                    completion_otp = booking.get("otps", {}).get("completion")
                    if completion_otp:
                        # Upload after evidence first
                        resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/evidence", json={
                            "stage": "after",
                            "photos": ["https://example.com/after.jpg"]
                        }, headers=headers_partner)
                        
                        resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/complete-otp", json={
                            "otp": completion_otp
                        }, headers=headers_partner)
                        assert_status(resp, 200, "POST /bookings/{id}/complete-otp")
                        
                        # 3.9 Verify wallet credit
                        time.sleep(1)
                        resp = requests.get(f"{BASE_URL}/partner/wallet", headers=headers_partner)
                        if resp.status_code == 200:
                            wallet = resp.json()
                            log(f"Partner wallet balance: ₹{wallet.get('available_balance', 0)} ✓")
                            test_results["passed"] += 1
    
    # 3.10 Test wallet topup
    resp = requests.post(f"{BASE_URL}/payments/mock", json={
        "purpose": "wallet",
        "amount": 1000
    }, headers=headers_customer)
    assert_status(resp, 200, "POST /payments/mock (wallet topup)")
    
    return booking_id

# ============================================================================
# TEST 4: PARTNER ENDPOINTS
# ============================================================================
def test_partner(partner_raj_token):
    test_section("TEST 4: PARTNER ENDPOINTS")
    
    if not partner_raj_token:
        error("Cannot test partner endpoints: missing token")
        return
    
    headers = {"Authorization": f"Bearer {partner_raj_token}"}
    
    # 4.1 Partner jobs list
    resp = requests.get(f"{BASE_URL}/bookings/partner/jobs", headers=headers)
    assert_status(resp, 200, "GET /bookings/partner/jobs")
    
    # 4.2 Partner wallet
    resp = requests.get(f"{BASE_URL}/partner/wallet", headers=headers)
    assert_status(resp, 200, "GET /partner/wallet")
    if resp.status_code == 200:
        wallet = resp.json()
        assert_key_exists(wallet, "available_balance", "Wallet has available_balance")
    
    # 4.3 Verification status
    resp = requests.get(f"{BASE_URL}/partner/verification", headers=headers)
    assert_status(resp, 200, "GET /partner/verification")
    
    # 4.4 Skills/eligibility
    resp = requests.get(f"{BASE_URL}/partner/eligibility", headers=headers)
    assert_status(resp, 200, "GET /partner/eligibility")
    
    # 4.5 Availability mode change
    resp = requests.put(f"{BASE_URL}/partner/availability", json={
        "mode": "online"
    }, headers=headers)
    assert_status(resp, 200, "PUT /partner/availability")

# ============================================================================
# TEST 5: MERCHANT ENDPOINTS
# ============================================================================
def test_merchant(merchant_token):
    test_section("TEST 5: MERCHANT ENDPOINTS")
    
    if not merchant_token:
        error("Cannot test merchant endpoints: missing token")
        return
    
    headers = {"Authorization": f"Bearer {merchant_token}"}
    
    # 5.1 Merchant registration profile
    resp = requests.get(f"{BASE_URL}/merchant/registration/profile", headers=headers)
    assert_status(resp, 200, "GET /merchant/registration/profile")
    
    # 5.2 Merchant overview
    resp = requests.get(f"{BASE_URL}/merchant/overview", headers=headers)
    assert_status(resp, 200, "GET /merchant/overview")
    if resp.status_code == 200:
        overview = resp.json()
        assert_key_exists(overview, "wallet", "Overview has wallet")
    
    # 5.3 Merchant wallet
    resp = requests.get(f"{BASE_URL}/merchant/wallet", headers=headers)
    assert_status(resp, 200, "GET /merchant/wallet")
    
    # 5.4 Withdrawal create (should fail with validation)
    resp = requests.post(f"{BASE_URL}/merchant/wallet/withdraw", json={
        "amount": 50,  # Below minimum
        "method": "upi",
        "upi_id": "test@upi"
    }, headers=headers)
    if resp.status_code == 400:
        log("Withdrawal validation working (below minimum rejected) ✓")
        test_results["passed"] += 1
    else:
        error(f"Withdrawal validation failed: {resp.status_code}")
        test_results["failed"] += 1

# ============================================================================
# TEST 6: ADMIN ENDPOINTS
# ============================================================================
def test_admin(admin_token):
    test_section("TEST 6: ADMIN ENDPOINTS")
    
    if not admin_token:
        error("Cannot test admin endpoints: missing token")
        return
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # 6.1 Dashboard/stats
    resp = requests.get(f"{BASE_URL}/admin/dashboard?range=30d", headers=headers)
    assert_status(resp, 200, "GET /admin/dashboard")
    if resp.status_code == 200:
        dashboard = resp.json()
        assert_key_exists(dashboard, "gmv", "Dashboard has gmv")
        assert_key_exists(dashboard, "total_bookings", "Dashboard has total_bookings")
    
    # 6.2 List bookings
    resp = requests.get(f"{BASE_URL}/admin/bookings", headers=headers)
    assert_status(resp, 200, "GET /admin/bookings")
    
    # 6.3 List partners
    resp = requests.get(f"{BASE_URL}/admin/partners", headers=headers)
    assert_status(resp, 200, "GET /admin/partners")
    
    # 6.4 Area partners
    resp = requests.get(f"{BASE_URL}/admin/area-partners", headers=headers)
    assert_status(resp, 200, "GET /admin/area-partners")
    if resp.status_code == 200:
        data = resp.json()
        assert_key_exists(data, "summary", "Area partners has summary")
        assert_key_exists(data, "matrix", "Area partners has matrix")
    
    # 6.5 List merchants
    resp = requests.get(f"{BASE_URL}/admin/merchants?tab=all", headers=headers)
    assert_status(resp, 200, "GET /admin/merchants")
    
    # 6.6 Settings GET
    resp = requests.get(f"{BASE_URL}/admin/settings", headers=headers)
    assert_status(resp, 200, "GET /admin/settings")
    
    # 6.7 Settings PUT (test with small change)
    if resp.status_code == 200:
        settings = resp.json()
        resp = requests.put(f"{BASE_URL}/admin/settings", json=settings, headers=headers)
        assert_status(resp, 200, "PUT /admin/settings")
    
    # 6.8 Surge rules collection
    resp = requests.get(f"{BASE_URL}/admin/collection/surge_rules", headers=headers)
    assert_status(resp, 200, "GET /admin/collection/surge_rules")
    
    # 6.9 Service areas collection
    resp = requests.get(f"{BASE_URL}/admin/collection/service_areas", headers=headers)
    assert_status(resp, 200, "GET /admin/collection/service_areas")
    
    # 6.10 Waitlist demand
    resp = requests.get(f"{BASE_URL}/admin/waitlist/demand", headers=headers)
    assert_status(resp, 200, "GET /admin/waitlist/demand")
    if resp.status_code == 200:
        data = resp.json()
        assert_key_exists(data, "demand", "Waitlist demand has demand")
        assert_key_exists(data, "total_requests", "Waitlist demand has total_requests")

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================
def main():
    print("="*80)
    print("  COMPREHENSIVE REGRESSION SMOKE TEST")
    print("  AzoApp Home Services Backend")
    print("="*80)
    print()
    
    try:
        # Test 1: Auth
        admin_token, merchant_token, partner_raj_token, customer_token = test_auth()
        
        # Test 2: Public site
        service_id = test_public_site()
        
        # Test 3: Booking lifecycle (most important)
        booking_id = test_booking_lifecycle(customer_token, partner_raj_token, service_id)
        
        # Test 4: Partner
        test_partner(partner_raj_token)
        
        # Test 5: Merchant
        test_merchant(merchant_token)
        
        # Test 6: Admin
        test_admin(admin_token)
        
        # Final summary
        print("\n" + "="*80)
        print("  TEST SUMMARY")
        print("="*80)
        print(f"\n✓ PASSED: {test_results['passed']}")
        print(f"✗ FAILED: {test_results['failed']}")
        
        if test_results['failed'] > 0:
            print(f"\n{'='*80}")
            print("  FAILED TESTS:")
            print(f"{'='*80}")
            for err in test_results['errors']:
                print(f"  • {err}")
        
        print("\n" + "="*80)
        
        if test_results['failed'] == 0:
            print("  ✅ ALL TESTS PASSED")
            print("="*80 + "\n")
            return 0
        else:
            print("  ❌ SOME TESTS FAILED")
            print("="*80 + "\n")
            return 1
            
    except Exception as e:
        print(f"\n✗ Test suite failed with exception: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
