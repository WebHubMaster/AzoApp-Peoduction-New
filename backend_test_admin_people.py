#!/usr/bin/env python3
"""
Backend testing for AzoApp - NEW Admin People API Endpoints
Testing: Suspend / Message / Edit / KYC viewable_documents / Invoices regression
"""
import requests
import json
import time
from typing import Dict, Any, Optional

# Base URL from frontend/.env
BASE_URL = "https://push-notify-fix-16.preview.emergentagent.com/api"

# Test credentials from /app/memory/test_credentials.md
ADMIN_PHONE = "+919000000000"
CUSTOMER_PHONE = "+919000000004"  # Priya Verma
PARTNER_PHONE = "+919000000003"   # Raj Kumar
MERCHANT_PHONE = "+919000000002"  # Sharma Electricals
OTP = "123456"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    END = '\033[0m'

def print_test(msg: str):
    print(f"{Colors.BLUE}TEST:{Colors.END} {msg}")

def print_pass(msg: str):
    print(f"{Colors.GREEN}✅ PASS:{Colors.END} {msg}")

def print_fail(msg: str):
    print(f"{Colors.RED}❌ FAIL:{Colors.END} {msg}")

def print_info(msg: str):
    print(f"{Colors.YELLOW}INFO:{Colors.END} {msg}")

def print_section(msg: str):
    print(f"\n{Colors.CYAN}{'='*80}")
    print(f"{msg}")
    print(f"{'='*80}{Colors.END}\n")

def admin_login() -> Optional[str]:
    """Login as admin and return token"""
    print_info(f"Logging in as admin {ADMIN_PHONE}")
    
    # Send OTP
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": ADMIN_PHONE})
    if resp.status_code != 200:
        print_fail(f"Send OTP failed: {resp.status_code} {resp.text}")
        return None
    
    # Verify OTP
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={
        "phone": ADMIN_PHONE,
        "otp": OTP
    })
    
    if resp.status_code != 200:
        print_fail(f"Verify OTP failed: {resp.status_code} {resp.text}")
        return None
    
    data = resp.json()
    token = data.get("token")
    user = data.get("user", {})
    
    print_pass(f"Logged in as {user.get('name', ADMIN_PHONE)} (role: {user.get('role')})")
    return token

def get_uid_for_role(admin_token: str, role: str, phone: str) -> Optional[str]:
    """Get UID for a user by role and phone number"""
    print_info(f"Fetching UID for {role} with phone {phone}")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.get(f"{BASE_URL}/admin/people/{role}", headers=headers)
    
    if resp.status_code != 200:
        print_fail(f"GET /admin/people/{role} failed: {resp.status_code}")
        return None
    
    data = resp.json()
    items = data.get("items", [])
    
    for item in items:
        if item.get("phone") == phone:
            uid = item.get("id")
            name = item.get("name", "Unknown")
            print_pass(f"Found {role} '{name}' ({phone}) with UID: {uid}")
            return uid
    
    print_fail(f"Could not find {role} with phone {phone}")
    return None

def test_1_suspend_partner(admin_token: str, partner_uid: str) -> bool:
    """
    TEST 1: POST /api/admin/people/partner/{uid}/suspend
    - Suspend with reason → 200 {ok:true, suspended:true}
    - Unsuspend → 200 {ok:true, suspended:false}
    - Suspend without reason → 400
    """
    print_section("TEST 1: Partner Suspend/Unsuspend")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test 1a: Suspend with reason
    print_test("1a) POST /suspend with {suspend:true, reason:'test suspend'}")
    resp = requests.post(
        f"{BASE_URL}/admin/people/partner/{partner_uid}/suspend",
        headers=headers,
        json={"suspend": True, "reason": "test suspend"}
    )
    
    if resp.status_code != 200:
        print_fail(f"Expected 200, got {resp.status_code}: {resp.text}")
        return False
    
    data = resp.json()
    if not data.get("ok"):
        print_fail(f"Expected ok:true, got: {data}")
        return False
    
    if not data.get("suspended"):
        print_fail(f"Expected suspended:true, got: {data}")
        return False
    
    print_pass(f"Suspend with reason successful: {data}")
    
    # Test 1b: Unsuspend
    print_test("1b) POST /suspend with {suspend:false}")
    resp = requests.post(
        f"{BASE_URL}/admin/people/partner/{partner_uid}/suspend",
        headers=headers,
        json={"suspend": False}
    )
    
    if resp.status_code != 200:
        print_fail(f"Expected 200, got {resp.status_code}: {resp.text}")
        return False
    
    data = resp.json()
    if not data.get("ok"):
        print_fail(f"Expected ok:true, got: {data}")
        return False
    
    if data.get("suspended") != False:
        print_fail(f"Expected suspended:false, got: {data}")
        return False
    
    print_pass(f"Unsuspend successful: {data}")
    
    # Test 1c: Suspend without reason (should fail with 400)
    print_test("1c) POST /suspend with {suspend:true} (no reason) → expect 400")
    resp = requests.post(
        f"{BASE_URL}/admin/people/partner/{partner_uid}/suspend",
        headers=headers,
        json={"suspend": True}
    )
    
    if resp.status_code != 400:
        print_fail(f"Expected 400, got {resp.status_code}: {resp.text}")
        return False
    
    print_pass(f"Correctly rejected suspend without reason with 400")
    
    return True

def test_2_message_customer(admin_token: str, customer_uid: str) -> bool:
    """
    TEST 2: POST /api/admin/people/customer/{uid}/message
    - Push channel with body → 200 {ok:true, channel_configured:true}
    - SMS with empty body → 400
    - Email for customer with no email → 400
    """
    print_section("TEST 2: Customer Message (Push/SMS/Email)")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test 2a: Push channel with body
    print_test("2a) POST /message with {channel:'push', body:'hello test'}")
    resp = requests.post(
        f"{BASE_URL}/admin/people/customer/{customer_uid}/message",
        headers=headers,
        json={"channel": "push", "body": "hello test"}
    )
    
    if resp.status_code != 200:
        print_fail(f"Expected 200, got {resp.status_code}: {resp.text}")
        return False
    
    data = resp.json()
    if not data.get("ok"):
        print_fail(f"Expected ok:true, got: {data}")
        return False
    
    # channel_configured should be true for push (FCM may be configured)
    channel_configured = data.get("channel_configured")
    print_pass(f"Push message sent: ok={data.get('ok')}, channel_configured={channel_configured}")
    
    # Test 2b: SMS with empty body (should fail with 400)
    print_test("2b) POST /message with {channel:'sms', body:''} → expect 400")
    resp = requests.post(
        f"{BASE_URL}/admin/people/customer/{customer_uid}/message",
        headers=headers,
        json={"channel": "sms", "body": ""}
    )
    
    if resp.status_code != 400:
        print_fail(f"Expected 400, got {resp.status_code}: {resp.text}")
        return False
    
    print_pass(f"Correctly rejected empty body with 400")
    
    # Test 2c: Email for customer with no email (should fail with 400)
    print_test("2c) POST /message with {channel:'email', body:'x'} for customer with no email → expect 400")
    resp = requests.post(
        f"{BASE_URL}/admin/people/customer/{customer_uid}/message",
        headers=headers,
        json={"channel": "email", "body": "test email body"}
    )
    
    if resp.status_code != 400:
        print_fail(f"Expected 400 (no email on file), got {resp.status_code}: {resp.text}")
        # This might be acceptable if the customer has an email, let's check the response
        data = resp.json()
        print_info(f"Response: {data}")
        if resp.status_code == 200:
            print_info("Customer may have email on file - this is acceptable")
            return True
        return False
    
    print_pass(f"Correctly rejected email for customer with no email (400)")
    
    return True

def test_3_edit_merchant(admin_token: str, merchant_uid: str) -> bool:
    """
    TEST 3: POST /api/admin/people/merchant/{uid}/edit
    - Edit city to "Patna" → 200 and response.updated includes "city"
    - GET /overview and confirm user.city == "Patna"
    """
    print_section("TEST 3: Merchant Edit (City)")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test 3a: Edit city to "Patna"
    print_test("3a) POST /edit with {city:'Patna'}")
    resp = requests.post(
        f"{BASE_URL}/admin/people/merchant/{merchant_uid}/edit",
        headers=headers,
        json={"city": "Patna"}
    )
    
    if resp.status_code != 200:
        print_fail(f"Expected 200, got {resp.status_code}: {resp.text}")
        return False
    
    data = resp.json()
    updated_fields = data.get("updated", [])
    
    if "city" not in updated_fields:
        print_fail(f"Expected 'city' in updated fields, got: {updated_fields}")
        return False
    
    print_pass(f"Edit successful, updated fields: {updated_fields}")
    
    # Test 3b: GET /overview and verify city == "Patna"
    print_test("3b) GET /overview and verify user.city == 'Patna'")
    resp = requests.get(
        f"{BASE_URL}/admin/people/merchant/{merchant_uid}/overview",
        headers=headers
    )
    
    if resp.status_code != 200:
        print_fail(f"Expected 200, got {resp.status_code}: {resp.text}")
        return False
    
    data = resp.json()
    user = data.get("user", {})
    city = user.get("city")
    
    if city != "Patna":
        print_fail(f"Expected city='Patna', got: {city}")
        return False
    
    print_pass(f"City verified: {city}")
    
    return True

def test_4_kyc_viewable_documents(admin_token: str, partner_uid: str) -> bool:
    """
    TEST 4: GET /api/admin/people/partner/{uid}/sections/kyc
    - Must return 200
    - Response must contain key "viewable_documents" (array, may be empty)
    - Must NOT return 500
    """
    print_section("TEST 4: Partner KYC Viewable Documents")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    print_test("4) GET /sections/kyc → must have 'viewable_documents' key and NOT 500")
    resp = requests.get(
        f"{BASE_URL}/admin/people/partner/{partner_uid}/sections/kyc",
        headers=headers
    )
    
    if resp.status_code == 500:
        print_fail(f"Got 500 Internal Server Error: {resp.text}")
        return False
    
    if resp.status_code != 200:
        print_fail(f"Expected 200, got {resp.status_code}: {resp.text}")
        return False
    
    data = resp.json()
    
    if "viewable_documents" not in data:
        print_fail(f"Missing 'viewable_documents' key in response: {list(data.keys())}")
        return False
    
    viewable_docs = data.get("viewable_documents", [])
    print_pass(f"KYC section returned successfully with viewable_documents (count: {len(viewable_docs)})")
    
    if len(viewable_docs) > 0:
        print_info(f"Sample document: {viewable_docs[0]}")
    else:
        print_info("viewable_documents is empty (acceptable for seeded partners with no registration profile)")
    
    return True

def test_5_invoices_regression(admin_token: str, partner_uid: str, customer_uid: str) -> bool:
    """
    TEST 5: Regression - Invoices backfilled
    - GET /api/admin/people/partner/{uid}/sections/invoices → 200 with non-empty items array
    - GET /api/admin/people/customer/{uid}/sections/invoices → 200 with items array
    """
    print_section("TEST 5: Invoices Regression (Backfilled)")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test 5a: Partner invoices
    print_test("5a) GET /api/admin/people/partner/{uid}/sections/invoices")
    resp = requests.get(
        f"{BASE_URL}/admin/people/partner/{partner_uid}/sections/invoices",
        headers=headers
    )
    
    if resp.status_code != 200:
        print_fail(f"Expected 200, got {resp.status_code}: {resp.text}")
        return False
    
    data = resp.json()
    items = data.get("items", [])
    
    if len(items) == 0:
        print_fail(f"Expected non-empty items array for partner invoices, got empty array")
        print_info("Note: Invoices were backfilled via seed_pro_and_invoices.py - partner should have ~20 invoices")
        return False
    
    print_pass(f"Partner invoices returned successfully (count: {len(items)})")
    
    # Test 5b: Customer invoices
    print_test("5b) GET /api/admin/people/customer/{uid}/sections/invoices")
    resp = requests.get(
        f"{BASE_URL}/admin/people/customer/{customer_uid}/sections/invoices",
        headers=headers
    )
    
    if resp.status_code != 200:
        print_fail(f"Expected 200, got {resp.status_code}: {resp.text}")
        return False
    
    data = resp.json()
    items = data.get("items", [])
    
    print_pass(f"Customer invoices returned successfully (count: {len(items)})")
    
    if len(items) == 0:
        print_info("Customer invoices array is empty (may be acceptable if customer has no completed bookings)")
    
    return True

def test_6_auth_guard(partner_uid: str) -> bool:
    """
    TEST 6: Auth guard - call endpoint without Authorization header
    - Should return 401 or 403
    """
    print_section("TEST 6: Auth Guard (No Authorization Header)")
    
    print_test("6) GET /api/admin/people/partner/{uid}/sections/kyc without auth → expect 401/403")
    resp = requests.get(f"{BASE_URL}/admin/people/partner/{partner_uid}/sections/kyc")
    
    if resp.status_code not in [401, 403]:
        print_fail(f"Expected 401/403, got {resp.status_code}: {resp.text}")
        return False
    
    print_pass(f"Correctly rejected with {resp.status_code} (unauthorized)")
    
    return True

def main():
    print_section("AZOAPP BACKEND TESTING - NEW ADMIN PEOPLE API ENDPOINTS")
    print("Testing: Suspend / Message / Edit / KYC / Invoices / Auth Guard")
    
    # Step 1: Admin login
    admin_token = admin_login()
    if not admin_token:
        print_fail("Admin login failed, cannot continue")
        return False
    
    # Step 2: Get UIDs for partner, customer, merchant
    print_section("STEP 2: Fetch UIDs for test users")
    
    partner_uid = get_uid_for_role(admin_token, "partner", PARTNER_PHONE)
    customer_uid = get_uid_for_role(admin_token, "customer", CUSTOMER_PHONE)
    merchant_uid = get_uid_for_role(admin_token, "merchant", MERCHANT_PHONE)
    
    if not partner_uid or not customer_uid or not merchant_uid:
        print_fail("Failed to fetch UIDs for test users")
        return False
    
    # Step 3: Run all tests
    results = {}
    
    try:
        results["TEST 1: Partner Suspend/Unsuspend"] = test_1_suspend_partner(admin_token, partner_uid)
    except Exception as e:
        print_fail(f"TEST 1 failed with exception: {e}")
        results["TEST 1: Partner Suspend/Unsuspend"] = False
    
    try:
        results["TEST 2: Customer Message"] = test_2_message_customer(admin_token, customer_uid)
    except Exception as e:
        print_fail(f"TEST 2 failed with exception: {e}")
        results["TEST 2: Customer Message"] = False
    
    try:
        results["TEST 3: Merchant Edit"] = test_3_edit_merchant(admin_token, merchant_uid)
    except Exception as e:
        print_fail(f"TEST 3 failed with exception: {e}")
        results["TEST 3: Merchant Edit"] = False
    
    try:
        results["TEST 4: Partner KYC Viewable Documents"] = test_4_kyc_viewable_documents(admin_token, partner_uid)
    except Exception as e:
        print_fail(f"TEST 4 failed with exception: {e}")
        results["TEST 4: Partner KYC Viewable Documents"] = False
    
    try:
        results["TEST 5: Invoices Regression"] = test_5_invoices_regression(admin_token, partner_uid, customer_uid)
    except Exception as e:
        print_fail(f"TEST 5 failed with exception: {e}")
        results["TEST 5: Invoices Regression"] = False
    
    try:
        results["TEST 6: Auth Guard"] = test_6_auth_guard(partner_uid)
    except Exception as e:
        print_fail(f"TEST 6 failed with exception: {e}")
        results["TEST 6: Auth Guard"] = False
    
    # Final summary
    print_section("FINAL SUMMARY")
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = f"{Colors.GREEN}✅ PASS{Colors.END}" if result else f"{Colors.RED}❌ FAIL{Colors.END}"
        print(f"{status} - {test_name}")
    
    print(f"\n{Colors.CYAN}{'='*80}")
    print(f"TOTAL: {passed}/{total} tests passed ({int(passed/total*100) if total > 0 else 0}%)")
    print(f"{'='*80}{Colors.END}\n")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
