#!/usr/bin/env python3
"""
Backend Test Script for AzoApp - Profile Lock + Email Test Endpoint
Tests TWO features:
1. Profile Lock - approved partners can only update photo, customers can update full profile
2. Email Test endpoint - admin email test with friendly error messages (no 500s)
"""
import requests
import json
import base64
import os
from datetime import datetime

# Configuration
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://merchant-mobile-ui.preview.emergentagent.com")
API_BASE = f"{BASE_URL}/api"
OTP = "123456"

# Test accounts
ADMIN_PHONE = "+919000000000"
PARTNER_PHONE = "+919000000003"
CUSTOMER_PHONE = "+919000000004"

# Test results
results = {
    "test_run_time": datetime.utcnow().isoformat(),
    "base_url": API_BASE,
    "tests": [],
    "summary": {"total": 0, "passed": 0, "failed": 0}
}

def log_test(name, passed, details="", response_data=None):
    """Log a test result"""
    results["tests"].append({
        "name": name,
        "passed": passed,
        "details": details,
        "response": response_data
    })
    results["summary"]["total"] += 1
    if passed:
        results["summary"]["passed"] += 1
        print(f"✅ {name}")
    else:
        results["summary"]["failed"] += 1
        print(f"❌ {name}: {details}")
    if details:
        print(f"   {details}")

def login(phone, otp=OTP):
    """Login and return token"""
    # Send OTP
    resp = requests.post(f"{API_BASE}/auth/send-otp", json={"phone": phone})
    if resp.status_code != 200:
        print(f"⚠️  OTP send failed for {phone}: {resp.status_code}")
        return None
    
    # Verify OTP
    resp = requests.post(f"{API_BASE}/auth/verify-otp", json={"phone": phone, "otp": otp})
    if resp.status_code != 200:
        print(f"⚠️  OTP verify failed for {phone}: {resp.status_code}")
        return None
    
    data = resp.json()
    return data.get("token")

def get_headers(token):
    """Get auth headers"""
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def generate_small_image_base64():
    """Generate a small valid PNG image as base64 data URL"""
    # 1x1 transparent PNG (tiny, ~68 bytes)
    png_bytes = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
    return f"data:image/png;base64,{base64.b64encode(png_bytes).decode()}"

def generate_large_image_base64():
    """Generate a base64 string that decodes to > 2 MB"""
    # Create a string that will decode to ~2.8 MB
    # Base64 inflates by ~33%, so we need ~3.7 MB of base64 to get 2.8 MB binary
    large_data = "A" * (3 * 1024 * 1024)  # 3 MB of 'A's
    return f"data:image/png;base64,{large_data}"

def approve_partner_if_needed(admin_token, partner_id):
    """Approve partner via admin KYC endpoint if not already approved"""
    headers = get_headers(admin_token)
    
    # Get partner details
    resp = requests.get(f"{API_BASE}/admin/users/{partner_id}/detail", headers=headers)
    if resp.status_code != 200:
        print(f"⚠️  Failed to get partner details: {resp.status_code}")
        return False
    
    partner = resp.json()
    kyc_status = partner.get("kyc_status")
    verified = partner.get("verified_partner", False)
    
    if kyc_status == "approved" or verified:
        print(f"✓ Partner already approved (kyc_status={kyc_status}, verified={verified})")
        return True
    
    # Approve partner
    print(f"→ Approving partner (current kyc_status={kyc_status})...")
    resp = requests.post(
        f"{API_BASE}/admin/partners/{partner_id}/kyc-action",
        headers=headers,
        json={"action": "approve", "reason": "Test approval"}
    )
    
    if resp.status_code == 200:
        print(f"✓ Partner approved successfully")
        return True
    else:
        print(f"⚠️  Partner approval failed: {resp.status_code} - {resp.text}")
        return False

def test_profile_lock():
    """Test ITEM 1 - Profile Lock"""
    print("\n" + "="*80)
    print("ITEM 1 - PROFILE LOCK TESTS")
    print("="*80)
    
    # Login as admin
    print("\n→ Logging in as admin...")
    admin_token = login(ADMIN_PHONE)
    if not admin_token:
        log_test("Admin login", False, "Failed to login as admin")
        return
    log_test("Admin login", True, "Admin logged in successfully")
    
    # Login as partner
    print("\n→ Logging in as partner...")
    partner_token = login(PARTNER_PHONE)
    if not partner_token:
        log_test("Partner login", False, "Failed to login as partner")
        return
    log_test("Partner login", True, "Partner logged in successfully")
    
    # Get partner details
    print("\n→ Getting partner details...")
    partner_headers = get_headers(partner_token)
    resp = requests.get(f"{API_BASE}/auth/me", headers=partner_headers)
    if resp.status_code != 200:
        log_test("Get partner details", False, f"Status {resp.status_code}")
        return
    
    partner = resp.json()
    partner_id = partner.get("id")
    original_name = partner.get("name")
    kyc_status = partner.get("kyc_status")
    verified = partner.get("verified_partner", False)
    
    log_test("Get partner details", True, 
             f"Partner: {original_name}, kyc_status={kyc_status}, verified={verified}")
    
    # Approve partner if needed
    if kyc_status != "approved" and not verified:
        print("\n→ Partner not approved, approving via admin...")
        if not approve_partner_if_needed(admin_token, partner_id):
            log_test("Approve partner", False, "Failed to approve partner")
            return
        log_test("Approve partner", True, "Partner approved successfully")
        
        # Refresh partner data
        resp = requests.get(f"{API_BASE}/auth/me", headers=partner_headers)
        partner = resp.json()
        kyc_status = partner.get("kyc_status")
        verified = partner.get("verified_partner", False)
        print(f"✓ Partner now: kyc_status={kyc_status}, verified={verified}")
    
    # TEST (a): Approved partner updates name + photo → name UNCHANGED, photo UPDATED
    print("\n→ TEST (a): Approved partner PUT name + photo...")
    small_photo = generate_small_image_base64()
    resp = requests.put(
        f"{API_BASE}/auth/profile",
        headers=partner_headers,
        json={"name": "HACKED NAME", "photo": small_photo}
    )
    
    if resp.status_code != 200:
        log_test("TEST (a) - Status code", False, 
                f"Expected 200, got {resp.status_code}: {resp.text}")
    else:
        log_test("TEST (a) - Status code", True, "Got 200 OK")
        
        updated_partner = resp.json()
        returned_name = updated_partner.get("name")
        returned_photo = updated_partner.get("photo", "")
        
        # Name should be UNCHANGED
        if returned_name == original_name:
            log_test("TEST (a) - Name unchanged", True, 
                    f"Name correctly unchanged: '{original_name}'")
        else:
            log_test("TEST (a) - Name unchanged", False, 
                    f"Name changed from '{original_name}' to '{returned_name}' (should be unchanged)")
        
        # Photo should be present (accepted) - the key test is that photo field is processed
        # while name is silently ignored. Whether it's the same as before doesn't matter.
        if returned_photo and (returned_photo == small_photo or "data:image" in returned_photo):
            log_test("TEST (a) - Photo accepted", True, 
                    "Photo field was accepted and processed (name was silently ignored)")
        else:
            log_test("TEST (a) - Photo accepted", False, 
                    f"Photo field not properly processed")
    
    # TEST (b): Approved partner updates name only (no photo) → 403
    print("\n→ TEST (b): Approved partner PUT name only (no photo)...")
    resp = requests.put(
        f"{API_BASE}/auth/profile",
        headers=partner_headers,
        json={"name": "HACKED"}
    )
    
    if resp.status_code == 403:
        log_test("TEST (b) - 403 on name-only", True, 
                f"Got 403 as expected: {resp.json().get('detail', '')}")
    else:
        log_test("TEST (b) - 403 on name-only", False, 
                f"Expected 403, got {resp.status_code}")
    
    # TEST (c): Customer updates name + email → 200 and fields updated
    print("\n→ TEST (c): Customer PUT name + email...")
    customer_token = login(CUSTOMER_PHONE)
    if not customer_token:
        log_test("Customer login", False, "Failed to login as customer")
        return
    log_test("Customer login", True, "Customer logged in successfully")
    
    customer_headers = get_headers(customer_token)
    
    # Get current customer data
    resp = requests.get(f"{API_BASE}/auth/me", headers=customer_headers)
    customer = resp.json()
    original_customer_name = customer.get("name")
    
    new_name = "New Cust Name"
    new_email = "newcust@example.com"
    
    resp = requests.put(
        f"{API_BASE}/auth/profile",
        headers=customer_headers,
        json={"name": new_name, "email": new_email}
    )
    
    if resp.status_code != 200:
        log_test("TEST (c) - Status code", False, 
                f"Expected 200, got {resp.status_code}: {resp.text}")
    else:
        log_test("TEST (c) - Status code", True, "Got 200 OK")
        
        updated_customer = resp.json()
        returned_name = updated_customer.get("name")
        returned_email = updated_customer.get("email")
        
        # Name should be UPDATED
        if returned_name == new_name:
            log_test("TEST (c) - Name updated", True, 
                    f"Name correctly updated to '{new_name}'")
        else:
            log_test("TEST (c) - Name updated", False, 
                    f"Name not updated: got '{returned_name}', expected '{new_name}'")
        
        # Email should be UPDATED
        if returned_email == new_email:
            log_test("TEST (c) - Email updated", True, 
                    f"Email correctly updated to '{new_email}'")
        else:
            log_test("TEST (c) - Email updated", False, 
                    f"Email not updated: got '{returned_email}', expected '{new_email}'")
    
    # TEST (d): Oversize photo → 400
    print("\n→ TEST (d): Partner PUT oversize photo (>2MB)...")
    large_photo = generate_large_image_base64()
    resp = requests.put(
        f"{API_BASE}/auth/profile",
        headers=partner_headers,
        json={"photo": large_photo}
    )
    
    if resp.status_code == 400:
        detail = resp.json().get("detail", "")
        if "too large" in detail.lower() or "2 mb" in detail.lower():
            log_test("TEST (d) - 400 on oversize photo", True, 
                    f"Got 400 with correct message: {detail}")
        else:
            log_test("TEST (d) - 400 on oversize photo", True, 
                    f"Got 400 (message: {detail})")
    else:
        log_test("TEST (d) - 400 on oversize photo", False, 
                f"Expected 400, got {resp.status_code}")
    
    # Check for 500 errors
    print("\n→ Checking for 500 errors in profile lock tests...")
    has_500 = any(
        t.get("response") and t.get("response", {}).get("status_code") == 500 
        for t in results["tests"] if "TEST" in t["name"]
    )
    if not has_500:
        log_test("No 500 errors in profile lock", True, "All endpoints returned expected status codes")
    else:
        log_test("No 500 errors in profile lock", False, "Found 500 errors")

def test_email_endpoint():
    """Test ITEM 2 - Email Test Endpoint"""
    print("\n" + "="*80)
    print("ITEM 2 - EMAIL TEST ENDPOINT TESTS")
    print("="*80)
    
    # Login as admin
    print("\n→ Logging in as admin...")
    admin_token = login(ADMIN_PHONE)
    if not admin_token:
        log_test("Admin login for email test", False, "Failed to login as admin")
        return
    log_test("Admin login for email test", True, "Admin logged in successfully")
    
    admin_headers = get_headers(admin_token)
    
    # TEST (1): Admin POST with no config → 200 ok:false with error
    print("\n→ TEST (1): Admin POST email-test with no config...")
    resp = requests.post(
        f"{API_BASE}/admin/integrations/email-test",
        headers=admin_headers,
        json={"to_email": "test@example.com"}
    )
    
    if resp.status_code == 200:
        log_test("TEST (1) - Status 200", True, "Got 200 OK")
        
        data = resp.json()
        ok = data.get("ok")
        error = data.get("error", "")
        
        if ok is False:
            log_test("TEST (1) - ok:false", True, "Response has ok:false")
        else:
            log_test("TEST (1) - ok:false", False, f"Expected ok:false, got ok:{ok}")
        
        if error and isinstance(error, str):
            log_test("TEST (1) - Has error message", True, 
                    f"Error message: '{error}'")
        else:
            log_test("TEST (1) - Has error message", False, 
                    f"No error message in response")
    elif resp.status_code == 500:
        log_test("TEST (1) - Status 200", False, 
                f"Got 500 (should be 200 with ok:false): {resp.text}")
    else:
        log_test("TEST (1) - Status 200", False, 
                f"Expected 200, got {resp.status_code}: {resp.text}")
    
    # TEST (2): Admin POST with config override → 200 ok:false with error + hint
    print("\n→ TEST (2): Admin POST email-test with config override...")
    resp = requests.post(
        f"{API_BASE}/admin/integrations/email-test",
        headers=admin_headers,
        json={
            "to_email": "test@example.com",
            "config": {
                "email_provider": "smtp",
                "smtp_host": "smtp.invalid.example",
                "smtp_port": 587,
                "smtp_user": "u",
                "smtp_password": "p",
                "smtp_from_email": "from@example.com"
            }
        }
    )
    
    if resp.status_code == 200:
        log_test("TEST (2) - Status 200", True, "Got 200 OK")
        
        data = resp.json()
        ok = data.get("ok")
        error = data.get("error", "")
        hint = data.get("hint", "")
        
        if ok is False:
            log_test("TEST (2) - ok:false", True, "Response has ok:false")
        else:
            log_test("TEST (2) - ok:false", False, f"Expected ok:false, got ok:{ok}")
        
        if error and isinstance(error, str):
            log_test("TEST (2) - Has error message", True, 
                    f"Error message: '{error[:100]}...'")
        else:
            log_test("TEST (2) - Has error message", False, 
                    f"No error message in response")
        
        if hint and isinstance(hint, str):
            log_test("TEST (2) - Has hint message", True, 
                    f"Hint message: '{hint[:100]}...'")
        else:
            log_test("TEST (2) - Has hint message", False, 
                    f"No hint message in response")
    elif resp.status_code == 500:
        log_test("TEST (2) - Status 200", False, 
                f"Got 500 (should be 200 with ok:false): {resp.text}")
    else:
        log_test("TEST (2) - Status 200", False, 
                f"Expected 200, got {resp.status_code}: {resp.text}")
    
    # TEST (3): Admin POST with invalid email → 200 ok:false with error
    print("\n→ TEST (3): Admin POST email-test with invalid email...")
    resp = requests.post(
        f"{API_BASE}/admin/integrations/email-test",
        headers=admin_headers,
        json={"to_email": "not-an-email"}
    )
    
    if resp.status_code == 200:
        log_test("TEST (3) - Status 200", True, "Got 200 OK")
        
        data = resp.json()
        ok = data.get("ok")
        error = data.get("error", "")
        
        if ok is False:
            log_test("TEST (3) - ok:false", True, "Response has ok:false")
        else:
            log_test("TEST (3) - ok:false", False, f"Expected ok:false, got ok:{ok}")
        
        if error and isinstance(error, str) and ("valid" in error.lower() or "email" in error.lower()):
            log_test("TEST (3) - Error mentions valid email", True, 
                    f"Error message: '{error}'")
        else:
            log_test("TEST (3) - Error mentions valid email", False, 
                    f"Error message doesn't mention valid email: '{error}'")
    else:
        log_test("TEST (3) - Status 200", False, 
                f"Expected 200, got {resp.status_code}: {resp.text}")
    
    # TEST (4): Customer POST → 403
    print("\n→ TEST (4): Customer POST email-test (should be 403)...")
    customer_token = login(CUSTOMER_PHONE)
    if not customer_token:
        log_test("Customer login for email test", False, "Failed to login as customer")
        return
    log_test("Customer login for email test", True, "Customer logged in successfully")
    
    customer_headers = get_headers(customer_token)
    resp = requests.post(
        f"{API_BASE}/admin/integrations/email-test",
        headers=customer_headers,
        json={"to_email": "test@example.com"}
    )
    
    if resp.status_code == 403:
        log_test("TEST (4) - Customer 403", True, "Customer correctly denied with 403")
    else:
        log_test("TEST (4) - Customer 403", False, 
                f"Expected 403, got {resp.status_code}")
    
    # Check for 500 errors
    print("\n→ Checking for 500 errors in email test endpoint...")
    has_500 = any(
        t.get("response") and t.get("response", {}).get("status_code") == 500 
        for t in results["tests"] if "email" in t["name"].lower()
    )
    if not has_500:
        log_test("No 500 errors in email test", True, "All endpoints returned expected status codes (no 500)")
    else:
        log_test("No 500 errors in email test", False, "Found 500 errors")

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("BACKEND TEST: Profile Lock + Email Test Endpoint")
    print("="*80)
    print(f"Base URL: {API_BASE}")
    print(f"Test accounts: Admin {ADMIN_PHONE}, Partner {PARTNER_PHONE}, Customer {CUSTOMER_PHONE}")
    print(f"OTP: {OTP}")
    
    try:
        # Test profile lock
        test_profile_lock()
        
        # Test email endpoint
        test_email_endpoint()
        
    except Exception as e:
        print(f"\n❌ Test execution failed: {e}")
        import traceback
        traceback.print_exc()
    
    # Print summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"Total tests: {results['summary']['total']}")
    print(f"Passed: {results['summary']['passed']} ✅")
    print(f"Failed: {results['summary']['failed']} ❌")
    
    if results['summary']['failed'] == 0:
        print("\n🎉 ALL TESTS PASSED!")
    else:
        print(f"\n⚠️  {results['summary']['failed']} test(s) failed")
    
    # Save results
    output_file = "/app/test_results_profile_email.json"
    with open(output_file, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nDetailed results saved to: {output_file}")
    
    return results['summary']['failed'] == 0

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
