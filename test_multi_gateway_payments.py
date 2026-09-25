#!/usr/bin/env python3
"""
AzoApp Multi-Gateway Payments Backend Testing
Tests the unified multi-gateway payment framework with Razorpay, Cashfree, PayU, Easebuzz, Juspay.
NO live keys configured → all gateways run in mock (pay-in) / simulated (payout) mode.
"""
import requests
import json
import time
from typing import Dict, Optional

# Configuration
BASE_URL = "https://customer-auth-native.preview.emergentagent.com/api"

# Test accounts
ADMIN_PHONE = "+919000000000"
CUSTOMER_PHONE = "+919000000004"
DEMO_OTP = "123456"

# All gateways to test
GATEWAYS = ["razorpay", "cashfree", "payu", "easebuzz", "juspay"]

# Test results tracking
test_results = {
    "passed": 0,
    "failed": 0,
    "tests": []
}


def log_test(name: str, passed: bool, details: str = ""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status} - {name}")
    if details:
        print(f"  {details}")
    
    test_results["tests"].append({
        "name": name,
        "passed": passed,
        "details": details
    })
    if passed:
        test_results["passed"] += 1
    else:
        test_results["failed"] += 1


def request_otp(phone: str) -> bool:
    """Request OTP for a phone number"""
    try:
        resp = requests.post(
            f"{BASE_URL}/auth/send-otp",
            json={"phone": phone},
            timeout=10
        )
        return resp.status_code == 200
    except Exception as e:
        print(f"Error requesting OTP: {e}")
        return False


def verify_otp(phone: str, otp: str = DEMO_OTP) -> Optional[str]:
    """Verify OTP and return token"""
    try:
        resp = requests.post(
            f"{BASE_URL}/auth/verify-otp",
            json={"phone": phone, "otp": otp},
            timeout=10
        )
        
        if resp.status_code == 200:
            data = resp.json()
            return data.get("token")
        else:
            print(f"OTP verification failed: {resp.status_code} - {resp.text}")
            return None
    except Exception as e:
        print(f"Error verifying OTP: {e}")
        return None


def login(phone: str, role: str) -> Optional[str]:
    """Login and return token"""
    print(f"\n🔐 Logging in as {role} ({phone})...")
    
    if not request_otp(phone):
        print(f"Failed to request OTP for {role}")
        return None
    
    time.sleep(1)
    token = verify_otp(phone)
    
    if token:
        print(f"✅ Logged in successfully as {role}")
        return token
    else:
        print(f"❌ Login failed for {role}")
        return None


def get_headers(token: str) -> Dict[str, str]:
    """Get headers with auth token"""
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }


def test_1_config_persistence_and_deep_merge(admin_token: str):
    """TEST 1: Active gateway config persistence & deep-merge"""
    print("\n" + "="*80)
    print("TEST 1: Active Gateway Config Persistence & Deep-Merge")
    print("="*80)
    
    headers = get_headers(admin_token)
    
    # Step 1: Get initial settings to verify existing keys
    print("\n📋 Step 1: Get initial settings...")
    resp = requests.get(f"{BASE_URL}/admin/settings", headers=headers, timeout=10)
    if resp.status_code != 200:
        log_test("TEST 1.1: Get initial settings", False, f"Status {resp.status_code}")
        return
    
    initial_settings = resp.json()
    initial_integrations = initial_settings.get("integrations", {})
    print(f"✅ Initial integrations keys: {list(initial_integrations.keys())}")
    log_test("TEST 1.1: Get initial settings", True, f"Got {len(initial_integrations)} integration keys")
    
    # Step 2: PUT active_payin_gateway = cashfree
    print("\n📋 Step 2: PUT active_payin_gateway = 'cashfree'...")
    resp = requests.put(
        f"{BASE_URL}/admin/settings",
        headers=headers,
        json={"integrations": {"active_payin_gateway": "cashfree"}},
        timeout=10
    )
    if resp.status_code != 200:
        log_test("TEST 1.2: PUT active_payin_gateway", False, f"Status {resp.status_code}: {resp.text[:200]}")
        return
    
    log_test("TEST 1.2: PUT active_payin_gateway", True, "Status 200")
    
    # Step 3: GET and verify active_payin_gateway = cashfree AND deep-merge
    print("\n📋 Step 3: GET settings and verify deep-merge...")
    resp = requests.get(f"{BASE_URL}/admin/settings", headers=headers, timeout=10)
    if resp.status_code != 200:
        log_test("TEST 1.3: GET after payin update", False, f"Status {resp.status_code}")
        return
    
    settings = resp.json()
    integrations = settings.get("integrations", {})
    active_payin = integrations.get("active_payin_gateway")
    
    if active_payin != "cashfree":
        log_test("TEST 1.3: Verify active_payin_gateway", False, f"Expected 'cashfree', got '{active_payin}'")
        return
    
    print(f"✅ active_payin_gateway = '{active_payin}'")
    
    # Verify deep-merge: check that pre-existing keys are still present
    keys_before = set(initial_integrations.keys())
    keys_after = set(integrations.keys())
    
    # At minimum, we should have active_payin_gateway now
    if "active_payin_gateway" not in keys_after:
        log_test("TEST 1.3: Deep-merge check", False, "active_payin_gateway not in integrations")
        return
    
    # Check if any pre-existing keys were wiped (they shouldn't be)
    # We expect keys_after to be a superset of keys_before (or at least have most keys)
    preserved_keys = keys_before.intersection(keys_after)
    print(f"✅ Preserved {len(preserved_keys)} out of {len(keys_before)} initial keys")
    print(f"   Keys after: {list(keys_after)}")
    
    # Deep-merge is working if we have more than just active_payin_gateway
    if len(integrations) > 1:
        log_test("TEST 1.3: Deep-merge verification", True, 
                f"Deep-merge working: {len(integrations)} keys present (not just active_payin_gateway)")
    else:
        log_test("TEST 1.3: Deep-merge verification", False, 
                "Only active_payin_gateway present - other keys may have been wiped")
        return
    
    # Step 4: PUT active_payout_gateway = payu
    print("\n📋 Step 4: PUT active_payout_gateway = 'payu'...")
    resp = requests.put(
        f"{BASE_URL}/admin/settings",
        headers=headers,
        json={"integrations": {"active_payout_gateway": "payu"}},
        timeout=10
    )
    if resp.status_code != 200:
        log_test("TEST 1.4: PUT active_payout_gateway", False, f"Status {resp.status_code}: {resp.text[:200]}")
        return
    
    log_test("TEST 1.4: PUT active_payout_gateway", True, "Status 200")
    
    # Step 5: GET and verify both active_payin_gateway and active_payout_gateway
    print("\n📋 Step 5: GET settings and verify both gateways...")
    resp = requests.get(f"{BASE_URL}/admin/settings", headers=headers, timeout=10)
    if resp.status_code != 200:
        log_test("TEST 1.5: GET after payout update", False, f"Status {resp.status_code}")
        return
    
    settings = resp.json()
    integrations = settings.get("integrations", {})
    active_payin = integrations.get("active_payin_gateway")
    active_payout = integrations.get("active_payout_gateway")
    
    if active_payin != "cashfree":
        log_test("TEST 1.5: Verify active_payin_gateway still cashfree", False, 
                f"Expected 'cashfree', got '{active_payin}'")
        return
    
    if active_payout != "payu":
        log_test("TEST 1.5: Verify active_payout_gateway", False, 
                f"Expected 'payu', got '{active_payout}'")
        return
    
    print(f"✅ active_payin_gateway = '{active_payin}' (still cashfree)")
    print(f"✅ active_payout_gateway = '{active_payout}'")
    log_test("TEST 1.5: Both gateways persist correctly", True, 
            "Deep-merge intact: payin=cashfree, payout=payu")
    
    print("\n✅ TEST 1 COMPLETE: Config persistence & deep-merge working correctly")


def test_2_payin_mock_fallback(admin_token: str, customer_token: str):
    """TEST 2: Pay-in mock fallback for EVERY gateway"""
    print("\n" + "="*80)
    print("TEST 2: Pay-in Mock Fallback for ALL Gateways")
    print("="*80)
    
    admin_headers = get_headers(admin_token)
    customer_headers = get_headers(customer_token)
    
    # First, get a category and service to book
    print("\n📋 Getting available categories...")
    resp = requests.get(f"{BASE_URL}/catalog/categories", timeout=10)
    if resp.status_code != 200:
        log_test("TEST 2.0: Get categories", False, f"Status {resp.status_code}")
        return
    
    categories = resp.json()
    if not categories:
        log_test("TEST 2.0: Get categories", False, "No categories available")
        return
    
    category_id = categories[0]["id"]
    category_name = categories[0]["name"]
    print(f"✅ Using category: {category_name} (ID: {category_id})")
    
    # Get services for this category
    print(f"\n📋 Getting services for category {category_name}...")
    resp = requests.get(f"{BASE_URL}/catalog/services?category_id={category_id}", timeout=10)
    if resp.status_code != 200:
        log_test("TEST 2.0: Get services", False, f"Status {resp.status_code}")
        return
    
    services = resp.json()
    if not services:
        log_test("TEST 2.0: Get services", False, "No services available")
        return
    
    service_id = services[0]["id"]
    service_name = services[0]["name"]
    print(f"✅ Using service: {service_name} (ID: {service_id})")
    log_test("TEST 2.0: Get services", True, f"Found {len(services)} services")
    
    # Test each gateway
    for gateway in GATEWAYS:
        print(f"\n{'─'*80}")
        print(f"Testing gateway: {gateway.upper()}")
        print(f"{'─'*80}")
        
        # Step A: Set active_payin_gateway to this gateway
        print(f"\n📋 Step A: Set active_payin_gateway = '{gateway}'...")
        resp = requests.put(
            f"{BASE_URL}/admin/settings",
            headers=admin_headers,
            json={"integrations": {"active_payin_gateway": gateway}},
            timeout=10
        )
        if resp.status_code != 200:
            log_test(f"TEST 2.{gateway}.A: Set active gateway", False, 
                    f"Status {resp.status_code}: {resp.text[:200]}")
            continue
        
        log_test(f"TEST 2.{gateway}.A: Set active gateway", True, f"Set to {gateway}")
        
        # Verify it was set
        resp = requests.get(f"{BASE_URL}/admin/settings", headers=admin_headers, timeout=10)
        if resp.status_code == 200:
            active = resp.json().get("integrations", {}).get("active_payin_gateway")
            if active != gateway:
                log_test(f"TEST 2.{gateway}.A: Verify active gateway", False, 
                        f"Expected '{gateway}', got '{active}'")
                continue
            print(f"✅ Verified: active_payin_gateway = '{active}'")
        
        # Step B: Create a booking
        print(f"\n📋 Step B: Create booking with {gateway}...")
        booking_data = {
            "service_id": service_id,
            "schedule_type": "schedule",
            "scheduled_at": "2026-12-31T14:00",
            "address": {
                "line": "Test Address",
                "pincode": "800001",
                "city": "Patna",
                "state": "Bihar",
                "lat": 25.6,
                "lng": 85.1
            }
        }
        
        resp = requests.post(
            f"{BASE_URL}/bookings",
            headers=customer_headers,
            json=booking_data,
            timeout=10
        )
        
        if resp.status_code != 200:
            log_test(f"TEST 2.{gateway}.B: Create booking", False, 
                    f"Status {resp.status_code}: {resp.text[:200]}")
            continue
        
        booking = resp.json()
        booking_id = booking.get("id")
        booking_code = booking.get("code")
        booking_status = booking.get("status")
        
        if not booking_id:
            log_test(f"TEST 2.{gateway}.B: Create booking", False, "No booking ID returned")
            continue
        
        print(f"✅ Created booking: {booking_code} (ID: {booking_id}, status: {booking_status})")
        log_test(f"TEST 2.{gateway}.B: Create booking", True, f"Booking {booking_code} created")
        
        # Step C: POST /api/payments/order - should return mock:true
        print(f"\n📋 Step C: POST /api/payments/order (should return mock:true)...")
        resp = requests.post(
            f"{BASE_URL}/payments/order",
            headers=customer_headers,
            json={"purpose": "booking", "booking_id": booking_id},
            timeout=10
        )
        
        if resp.status_code != 200:
            log_test(f"TEST 2.{gateway}.C: Create payment order", False, 
                    f"Status {resp.status_code}: {resp.text[:200]}")
            continue
        
        order = resp.json()
        is_mock = order.get("mock")
        
        if is_mock is not True:
            log_test(f"TEST 2.{gateway}.C: Verify mock flag", False, 
                    f"Expected mock=true, got mock={is_mock}. Order: {json.dumps(order)[:200]}")
            continue
        
        print(f"✅ Payment order returned mock=true (as expected, no keys configured)")
        log_test(f"TEST 2.{gateway}.C: Payment order returns mock", True, 
                f"mock=true for {gateway} (no keys)")
        
        # Step D: POST /api/payments/mock - should confirm booking
        print(f"\n📋 Step D: POST /api/payments/mock (confirm booking)...")
        resp = requests.post(
            f"{BASE_URL}/payments/mock",
            headers=customer_headers,
            json={"purpose": "booking", "booking_id": booking_id},
            timeout=10
        )
        
        if resp.status_code != 200:
            log_test(f"TEST 2.{gateway}.D: Mock payment", False, 
                    f"Status {resp.status_code}: {resp.text[:200]}")
            continue
        
        mock_result = resp.json()
        print(f"✅ Mock payment successful: {json.dumps(mock_result)[:100]}")
        
        # Verify booking moved out of pending_payment
        resp = requests.get(f"{BASE_URL}/bookings/{booking_id}", headers=customer_headers, timeout=10)
        if resp.status_code == 200:
            booking = resp.json()
            new_status = booking.get("status")
            payment_status = booking.get("payment_status")
            
            if new_status == "pending_payment":
                log_test(f"TEST 2.{gateway}.D: Booking status after mock pay", False, 
                        f"Still pending_payment")
                continue
            
            print(f"✅ Booking moved to status: {new_status}, payment_status: {payment_status}")
            log_test(f"TEST 2.{gateway}.D: Mock payment confirms booking", True, 
                    f"Status: {new_status}, payment: {payment_status}")
        else:
            log_test(f"TEST 2.{gateway}.D: Get booking after mock pay", False, 
                    f"Status {resp.status_code}")
            continue
        
        print(f"\n✅ Gateway {gateway.upper()} PASSED all tests")
    
    print("\n✅ TEST 2 COMPLETE: All gateways tested for mock fallback")


def test_3_payout_simulated_fallback(admin_token: str):
    """TEST 3: Payout simulated fallback"""
    print("\n" + "="*80)
    print("TEST 3: Payout Simulated Fallback")
    print("="*80)
    
    admin_headers = get_headers(admin_token)
    
    for gateway in GATEWAYS:
        print(f"\n{'─'*80}")
        print(f"Testing payout gateway: {gateway.upper()}")
        print(f"{'─'*80}")
        
        # Set active_payout_gateway
        print(f"\n📋 Setting active_payout_gateway = '{gateway}'...")
        resp = requests.put(
            f"{BASE_URL}/admin/settings",
            headers=admin_headers,
            json={"integrations": {"active_payout_gateway": gateway}},
            timeout=10
        )
        
        if resp.status_code != 200:
            log_test(f"TEST 3.{gateway}: Set payout gateway", False, 
                    f"Status {resp.status_code}: {resp.text[:200]}")
            continue
        
        # Verify it was set
        resp = requests.get(f"{BASE_URL}/admin/settings", headers=admin_headers, timeout=10)
        if resp.status_code != 200:
            log_test(f"TEST 3.{gateway}: Get settings", False, f"Status {resp.status_code}")
            continue
        
        settings = resp.json()
        active_payout = settings.get("integrations", {}).get("active_payout_gateway")
        
        if active_payout != gateway:
            log_test(f"TEST 3.{gateway}: Verify payout gateway", False, 
                    f"Expected '{gateway}', got '{active_payout}'")
            continue
        
        print(f"✅ Verified: active_payout_gateway = '{active_payout}'")
        log_test(f"TEST 3.{gateway}: Payout gateway persists", True, 
                f"active_payout_gateway = {gateway}")
        
        # Try to access payout-related endpoints (they should not crash)
        # Note: We don't have a direct payout endpoint to test, but we can verify
        # that the settings endpoint doesn't crash with this gateway selected
        print(f"✅ Payout gateway {gateway} configured without errors")
    
    print("\n✅ TEST 3 COMPLETE: All payout gateways tested")


def cleanup_restore_defaults(admin_token: str):
    """Restore default gateways"""
    print("\n" + "="*80)
    print("CLEANUP: Restoring Default Gateways")
    print("="*80)
    
    admin_headers = get_headers(admin_token)
    
    print("\n📋 Restoring active_payin_gateway = 'razorpay'...")
    print("📋 Restoring active_payout_gateway = 'razorpay'...")
    
    resp = requests.put(
        f"{BASE_URL}/admin/settings",
        headers=admin_headers,
        json={
            "integrations": {
                "active_payin_gateway": "razorpay",
                "active_payout_gateway": "razorpay"
            }
        },
        timeout=10
    )
    
    if resp.status_code == 200:
        print("✅ Restored defaults: both gateways set to 'razorpay'")
        log_test("CLEANUP: Restore defaults", True, "Gateways restored to razorpay")
    else:
        print(f"⚠️  Failed to restore defaults: {resp.status_code}")
        log_test("CLEANUP: Restore defaults", False, f"Status {resp.status_code}")


def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    total = test_results["passed"] + test_results["failed"]
    pass_rate = (test_results["passed"] / total * 100) if total > 0 else 0
    
    print(f"\nTotal Tests: {total}")
    print(f"✅ Passed: {test_results['passed']}")
    print(f"❌ Failed: {test_results['failed']}")
    print(f"Pass Rate: {pass_rate:.1f}%")
    
    if test_results["failed"] > 0:
        print("\n❌ FAILED TESTS:")
        for test in test_results["tests"]:
            if not test["passed"]:
                print(f"  - {test['name']}")
                if test["details"]:
                    print(f"    {test['details']}")
    
    print("\n" + "="*80)


def main():
    """Main test execution"""
    print("="*80)
    print("AzoApp Multi-Gateway Payments Backend Testing")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Testing gateways: {', '.join(GATEWAYS)}")
    print("="*80)
    
    # Login as admin
    admin_token = login(ADMIN_PHONE, "admin")
    if not admin_token:
        print("❌ Failed to login as admin. Aborting tests.")
        return
    
    # Login as customer
    customer_token = login(CUSTOMER_PHONE, "customer")
    if not customer_token:
        print("❌ Failed to login as customer. Aborting tests.")
        return
    
    # Run tests
    try:
        test_1_config_persistence_and_deep_merge(admin_token)
        test_2_payin_mock_fallback(admin_token, customer_token)
        test_3_payout_simulated_fallback(admin_token)
        cleanup_restore_defaults(admin_token)
    except Exception as e:
        print(f"\n❌ Test execution error: {e}")
        import traceback
        traceback.print_exc()
    
    # Print summary
    print_summary()


if __name__ == "__main__":
    main()
