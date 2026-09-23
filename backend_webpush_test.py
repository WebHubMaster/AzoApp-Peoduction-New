#!/usr/bin/env python3
"""
Backend testing for Standard VAPID Web Push feature and Admin notify message rewording.

Tests:
1. GET /api/notifications/webpush/public-key (no auth) → {public_key, enabled}
2. Web push subscribe + device count (Partner +919000000003)
3. Admin notify messages professional English (Admin +919000000000)
4. Regression: notification pipeline must not error
"""
import os
import sys
import json
import requests
from datetime import datetime

# Base URL from frontend/.env
BASE_URL = "https://expo-troubleshoot-5.preview.emergentagent.com/api"

# Test credentials
ADMIN_PHONE = "+919000000000"
PARTNER_PHONE = "+919000000003"
CUSTOMER_PHONE = "+919000000004"
OTP = "123456"

# Test results
results = {
    "timestamp": datetime.utcnow().isoformat(),
    "base_url": BASE_URL,
    "tests": [],
    "summary": {"total": 0, "passed": 0, "failed": 0}
}

def log_test(name, passed, details=""):
    """Log a test result."""
    result = {
        "name": name,
        "passed": passed,
        "details": details
    }
    results["tests"].append(result)
    results["summary"]["total"] += 1
    if passed:
        results["summary"]["passed"] += 1
        print(f"✅ {name}")
    else:
        results["summary"]["failed"] += 1
        print(f"❌ {name}")
    if details:
        print(f"   {details}")

def login(phone):
    """Login and return token."""
    # Send OTP
    r = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if r.status_code != 200:
        raise Exception(f"send-otp failed: {r.status_code} {r.text}")
    
    # Verify OTP
    r = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    if r.status_code != 200:
        raise Exception(f"verify-otp failed: {r.status_code} {r.text}")
    
    data = r.json()
    return data.get("token")

def test_public_key():
    """TEST 1: GET /api/notifications/webpush/public-key (no auth)"""
    print("\n=== TEST 1: Public Key Endpoint ===")
    
    try:
        r = requests.get(f"{BASE_URL}/notifications/webpush/public-key")
        log_test("Public key endpoint returns 200", r.status_code == 200, f"Status: {r.status_code}")
        
        if r.status_code == 200:
            data = r.json()
            
            # Check structure
            has_public_key = "public_key" in data
            log_test("Response has 'public_key' field", has_public_key, f"Keys: {list(data.keys())}")
            
            has_enabled = "enabled" in data
            log_test("Response has 'enabled' field", has_enabled, f"Keys: {list(data.keys())}")
            
            # Check public_key format
            public_key = data.get("public_key", "")
            is_valid_length = len(public_key) >= 85 and len(public_key) <= 90
            log_test("Public key is ~87 chars", is_valid_length, f"Length: {len(public_key)}")
            
            starts_with_b = public_key.startswith("B")
            log_test("Public key starts with 'B'", starts_with_b, f"First char: {public_key[:1] if public_key else 'empty'}")
            
            # Check enabled is true
            enabled = data.get("enabled")
            log_test("enabled is true", enabled is True, f"enabled: {enabled}")
            
            return public_key
        else:
            return None
            
    except Exception as e:
        log_test("Public key endpoint exception", False, str(e))
        return None

def test_subscribe_and_devices(partner_token):
    """TEST 2: Web push subscribe + device count"""
    print("\n=== TEST 2: Subscribe + Device Count ===")
    
    headers = {"Authorization": f"Bearer {partner_token}"}
    
    try:
        # Get initial device count
        r = requests.get(f"{BASE_URL}/notifications/my-devices", headers=headers)
        log_test("GET my-devices returns 200", r.status_code == 200, f"Status: {r.status_code}")
        
        initial_count = 0
        initial_webpush_count = 0
        if r.status_code == 200:
            data = r.json()
            initial_count = data.get("count", 0)
            initial_webpush_count = data.get("webpush_count", 0)
            log_test("Initial device count retrieved", True, f"count: {initial_count}, webpush_count: {initial_webpush_count}")
        
        # Subscribe with valid subscription
        device_id = "pytest-device-1"
        subscription = {
            "subscription": {
                "endpoint": "https://fcm.googleapis.com/fcm/send/test-abc-123",
                "keys": {
                    "p256dh": "BObJExampleKeyNotRealBObJExampleKeyNotRealBObJExampleKeyNotReal1234567890AB",
                    "auth": "c2VjcmV0MTIzNDU2Nzg"
                }
            },
            "device_id": device_id,
            "user_agent": "pytest",
            "platform": "web",
            "browser": "Chrome"
        }
        
        r = requests.post(f"{BASE_URL}/notifications/webpush/subscribe", json=subscription, headers=headers)
        log_test("POST webpush/subscribe returns 200", r.status_code == 200, f"Status: {r.status_code}")
        
        if r.status_code == 200:
            data = r.json()
            log_test("Subscribe response has ok:true", data.get("ok") is True, f"Response: {data}")
        
        # Get device count after subscribe
        r = requests.get(f"{BASE_URL}/notifications/my-devices", headers=headers)
        if r.status_code == 200:
            data = r.json()
            new_count = data.get("count", 0)
            new_webpush_count = data.get("webpush_count", 0)
            webpush_array = data.get("webpush", [])
            
            count_increased = new_count >= initial_count + 1
            log_test("Device count increased", count_increased, 
                    f"Before: {initial_count}, After: {new_count}, webpush_count: {new_webpush_count}")
            
            has_webpush_array = isinstance(webpush_array, list)
            log_test("Response has 'webpush' array", has_webpush_array, f"webpush length: {len(webpush_array)}")
        
        # Test idempotency - subscribe again with same device_id
        r = requests.post(f"{BASE_URL}/notifications/webpush/subscribe", json=subscription, headers=headers)
        log_test("Idempotent subscribe returns 200", r.status_code == 200, f"Status: {r.status_code}")
        
        # Check count didn't double
        r = requests.get(f"{BASE_URL}/notifications/my-devices", headers=headers)
        if r.status_code == 200:
            data = r.json()
            final_count = data.get("count", 0)
            not_doubled = final_count == new_count
            log_test("Count did NOT double (idempotent)", not_doubled, 
                    f"After first: {new_count}, After second: {final_count}")
        
        # Test missing/invalid subscription
        invalid_sub = {"subscription": {}}
        r = requests.post(f"{BASE_URL}/notifications/webpush/subscribe", json=invalid_sub, headers=headers)
        log_test("Invalid subscription returns 400", r.status_code == 400, f"Status: {r.status_code}")
        
    except Exception as e:
        log_test("Subscribe test exception", False, str(e))

def test_admin_notify_messages(admin_token):
    """TEST 3: Admin notify messages professional English"""
    print("\n=== TEST 3: Admin Notify Messages ===")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    try:
        # Find customer ID
        r = requests.get(f"{BASE_URL}/admin/people/customer?page_size=50", headers=headers)
        log_test("GET admin customers returns 200", r.status_code == 200, f"Status: {r.status_code}")
        
        customer_id = None
        if r.status_code == 200:
            data = r.json()
            items = data.get("items", [])
            for item in items:
                if item.get("phone") == CUSTOMER_PHONE:
                    customer_id = item.get("id")
                    break
            
            log_test("Found customer ID", customer_id is not None, f"Customer ID: {customer_id}")
        
        if customer_id:
            # Send push notification to customer
            notify_data = {
                "channel": "push",
                "title": "Test",
                "body": "Hello"
            }
            
            r = requests.post(f"{BASE_URL}/admin/people/customer/{customer_id}/message", 
                            json=notify_data, headers=headers)
            log_test("POST customer notify returns 200", r.status_code == 200, f"Status: {r.status_code}")
            
            if r.status_code == 200:
                data = r.json()
                
                # Check channel_configured for push is true
                channel_configured = data.get("channel_configured")
                log_test("channel_configured for push is true", channel_configured is True, 
                        f"channel_configured: {channel_configured}")
                
                # Check note is professional English (no Hinglish)
                note = data.get("note", "")
                hinglish_words = ["nahi", "kiya", "bhej", "milega", "karega", "kholkar"]
                has_hinglish = any(word in note.lower() for word in hinglish_words)
                log_test("Note is professional English (no Hinglish)", not has_hinglish, 
                        f"Note: {note[:100] if note else 'None'}")
                
                # Check note mentions expected phrases
                if note:
                    has_expected_phrase = any(phrase in note.lower() for phrase in [
                        "no device registered",
                        "in-app notification",
                        "live push starts automatically",
                        "once they open the app"
                    ])
                    log_test("Note has expected professional phrases", has_expected_phrase, 
                            f"Note: {note[:100]}")
        
        # Find partner ID
        r = requests.get(f"{BASE_URL}/admin/people/partner?page_size=50", headers=headers)
        log_test("GET admin partners returns 200", r.status_code == 200, f"Status: {r.status_code}")
        
        partner_id = None
        if r.status_code == 200:
            data = r.json()
            items = data.get("items", [])
            for item in items:
                if item.get("phone") == PARTNER_PHONE:
                    partner_id = item.get("id")
                    break
            
            log_test("Found partner ID", partner_id is not None, f"Partner ID: {partner_id}")
        
        if partner_id:
            # Send push notification to partner
            notify_data = {
                "channel": "push",
                "title": "Test",
                "body": "Hello Partner"
            }
            
            r = requests.post(f"{BASE_URL}/admin/people/partner/{partner_id}/message", 
                            json=notify_data, headers=headers)
            log_test("POST partner notify returns 200", r.status_code == 200, f"Status: {r.status_code}")
            
            if r.status_code == 200:
                data = r.json()
                
                # Check channel_configured for push is true
                channel_configured = data.get("channel_configured")
                log_test("Partner channel_configured for push is true", channel_configured is True, 
                        f"channel_configured: {channel_configured}")
                
                # Check note is professional English
                note = data.get("note", "")
                hinglish_words = ["nahi", "kiya", "bhej", "milega", "karega", "kholkar"]
                has_hinglish = any(word in note.lower() for word in hinglish_words)
                log_test("Partner note is professional English (no Hinglish)", not has_hinglish, 
                        f"Note: {note[:100] if note else 'None'}")
        
    except Exception as e:
        log_test("Admin notify test exception", False, str(e))

def test_regression(admin_token):
    """TEST 4: Regression - notification pipeline must not error"""
    print("\n=== TEST 4: Regression Test ===")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    try:
        # Find a customer with no webpush subscription
        r = requests.get(f"{BASE_URL}/admin/people/customer?page_size=50", headers=headers)
        
        customer_id = None
        if r.status_code == 200:
            data = r.json()
            items = data.get("items", [])
            # Use the customer phone we know
            for item in items:
                if item.get("phone") == CUSTOMER_PHONE:
                    customer_id = item.get("id")
                    break
        
        if customer_id:
            # Send notification to user with no webpush subscription
            notify_data = {
                "channel": "push",
                "title": "Regression Test",
                "body": "Testing notification pipeline"
            }
            
            r = requests.post(f"{BASE_URL}/admin/people/customer/{customer_id}/message", 
                            json=notify_data, headers=headers)
            
            # Should return 200 even if push delivery fails
            log_test("Notification to user with no subscription returns 200", r.status_code == 200, 
                    f"Status: {r.status_code}")
            
            if r.status_code == 200:
                data = r.json()
                # Should have in_app delivered
                log_test("Response indicates in-app notification sent", "ok" in data and data.get("ok"), 
                        f"Response: {json.dumps(data, indent=2)[:200]}")
        else:
            log_test("Could not find customer for regression test", False, "No customer found")
        
    except Exception as e:
        log_test("Regression test exception", False, str(e))

def main():
    print("=" * 80)
    print("BACKEND TESTING: Standard VAPID Web Push + Admin Notify Messages")
    print("=" * 80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_PHONE}")
    print(f"Partner: {PARTNER_PHONE}")
    print(f"Customer: {CUSTOMER_PHONE}")
    print(f"OTP: {OTP}")
    print("=" * 80)
    
    try:
        # TEST 1: Public key (no auth)
        public_key = test_public_key()
        
        # Login as partner
        print("\n=== Logging in as Partner ===")
        partner_token = login(PARTNER_PHONE)
        print(f"✅ Partner logged in successfully")
        
        # TEST 2: Subscribe + device count
        test_subscribe_and_devices(partner_token)
        
        # Login as admin
        print("\n=== Logging in as Admin ===")
        admin_token = login(ADMIN_PHONE)
        print(f"✅ Admin logged in successfully")
        
        # TEST 3: Admin notify messages
        test_admin_notify_messages(admin_token)
        
        # TEST 4: Regression
        test_regression(admin_token)
        
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
    
    # Print summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Total tests: {results['summary']['total']}")
    print(f"Passed: {results['summary']['passed']}")
    print(f"Failed: {results['summary']['failed']}")
    print(f"Success rate: {results['summary']['passed'] / results['summary']['total'] * 100:.1f}%")
    print("=" * 80)
    
    # Save results
    with open("/app/test_results_webpush.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nDetailed results saved to: /app/test_results_webpush.json")
    
    # Exit with appropriate code
    sys.exit(0 if results['summary']['failed'] == 0 else 1)

if __name__ == "__main__":
    main()
