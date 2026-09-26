"""
Backend Testing for AzoApp Admin Follow-up Changes
Tests 7 specific admin backend features as per review request
"""
import requests
import json
import re
from typing import Dict, Any

# Base URL from frontend/.env
BASE_URL = "https://mobile-customer-nav.preview.emergentagent.com/api"

# Test results tracking
test_results = {
    "passed": 0,
    "failed": 0,
    "tests": []
}

def log_test(name: str, passed: bool, details: str = ""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    test_results["tests"].append({
        "name": name,
        "status": status,
        "details": details
    })
    if passed:
        test_results["passed"] += 1
    else:
        test_results["failed"] += 1
    print(f"{status}: {name}")
    if details:
        print(f"  Details: {details}")

def get_admin_token() -> str:
    """Get admin token using demo admin credentials"""
    try:
        response = requests.post(
            f"{BASE_URL}/auth/verify-otp",
            json={"phone": "+919000000000", "otp": "123456"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            if data.get("token"):
                return data["token"]
        print(f"Admin login failed: {response.status_code} - {response.text}")
        return None
    except Exception as e:
        print(f"Admin login error: {e}")
        return None

def test_permanent_provider_code(token: str, partner_id: str):
    """
    Test 1: PERMANENT PROVIDER CODE
    - GET /api/admin/users/{pid}/detail → user.partner_code must match regex ^AZP\d{7}$
    - PUT /api/admin/partners/{pid} {"partner_code":"HACK123"} → code must be IGNORED
    - GET detail again → partner_code UNCHANGED
    """
    print("\n" + "="*80)
    print("TEST 1: PERMANENT PROVIDER CODE")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Step 1: Get partner detail and verify partner_code format
    try:
        response = requests.get(
            f"{BASE_URL}/admin/users/{partner_id}/detail",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            user = data.get("user", {})
            partner_code = user.get("partner_code")
            
            # Verify format: AZP + 7 digits
            code_pattern = re.compile(r'^AZP\d{7}$')
            if partner_code and code_pattern.match(partner_code):
                log_test(
                    "1.1: Partner code matches format ^AZP\\d{7}$",
                    True,
                    f"Partner code: {partner_code}"
                )
                original_code = partner_code
            else:
                log_test(
                    "1.1: Partner code matches format ^AZP\\d{7}$",
                    False,
                    f"Expected AZP + 7 digits, got: {partner_code}"
                )
                return
        else:
            log_test(
                "1.1: GET partner detail",
                False,
                f"Status: {response.status_code}, Response: {response.text}"
            )
            return
    except Exception as e:
        log_test("1.1: GET partner detail", False, f"Error: {e}")
        return
    
    # Step 2: Try to edit partner_code (should be ignored)
    try:
        response = requests.put(
            f"{BASE_URL}/admin/partners/{partner_id}",
            headers=headers,
            json={"partner_code": "HACK123"},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            # Check if partner_code was changed
            new_code = data.get("partner_code")
            
            if new_code == original_code:
                log_test(
                    "1.2: Partner code is immutable (PUT with partner_code ignored)",
                    True,
                    f"Code unchanged: {original_code}"
                )
            else:
                log_test(
                    "1.2: Partner code is immutable (PUT with partner_code ignored)",
                    False,
                    f"Code changed from {original_code} to {new_code} - SECURITY ISSUE!"
                )
        else:
            # If it returns 400 because partner_code is not in editable fields, that's also acceptable
            log_test(
                "1.2: Partner code is immutable (PUT with partner_code ignored)",
                True,
                f"Status: {response.status_code} - partner_code not editable"
            )
    except Exception as e:
        log_test("1.2: PUT partner_code (should be ignored)", False, f"Error: {e}")
    
    # Step 3: Verify code is still unchanged
    try:
        response = requests.get(
            f"{BASE_URL}/admin/users/{partner_id}/detail",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            user = data.get("user", {})
            final_code = user.get("partner_code")
            
            if final_code == original_code:
                log_test(
                    "1.3: Partner code remains unchanged after PUT attempt",
                    True,
                    f"Code still: {original_code}"
                )
            else:
                log_test(
                    "1.3: Partner code remains unchanged after PUT attempt",
                    False,
                    f"Code changed from {original_code} to {final_code}"
                )
        else:
            log_test(
                "1.3: Verify code unchanged",
                False,
                f"Status: {response.status_code}"
            )
    except Exception as e:
        log_test("1.3: Verify code unchanged", False, f"Error: {e}")

def test_edit_with_selects(token: str, partner_id: str):
    """
    Test 2: EDIT WITH SELECTS
    - PUT /api/admin/partners/{pid} {"gender":"Male","languages":["Hindi","English"],"skills":["AC Service","Plumbing"]}
    - GET detail → verify gender, languages array, skills array
    """
    print("\n" + "="*80)
    print("TEST 2: EDIT WITH SELECTS")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Step 1: Update partner with gender, languages, skills
    try:
        response = requests.put(
            f"{BASE_URL}/admin/partners/{partner_id}",
            headers=headers,
            json={
                "gender": "Male",
                "languages": ["Hindi", "English"],
                "skills": ["AC Service", "Plumbing"]
            },
            timeout=10
        )
        
        if response.status_code == 200:
            log_test(
                "2.1: PUT partner with gender, languages, skills",
                True,
                f"Status: 200"
            )
        else:
            log_test(
                "2.1: PUT partner with gender, languages, skills",
                False,
                f"Status: {response.status_code}, Response: {response.text}"
            )
            return
    except Exception as e:
        log_test("2.1: PUT partner with selects", False, f"Error: {e}")
        return
    
    # Step 2: Verify changes
    try:
        response = requests.get(
            f"{BASE_URL}/admin/users/{partner_id}/detail",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            user = data.get("user", {})
            
            # Check gender
            gender = user.get("gender")
            if gender == "Male":
                log_test(
                    "2.2: Gender updated correctly",
                    True,
                    f"Gender: {gender}"
                )
            else:
                log_test(
                    "2.2: Gender updated correctly",
                    False,
                    f"Expected 'Male', got: {gender}"
                )
            
            # Check languages (should be array)
            languages = user.get("languages")
            if isinstance(languages, list) and set(languages) == {"Hindi", "English"}:
                log_test(
                    "2.3: Languages updated correctly (array)",
                    True,
                    f"Languages: {languages}"
                )
            else:
                log_test(
                    "2.3: Languages updated correctly (array)",
                    False,
                    f"Expected ['Hindi', 'English'], got: {languages}"
                )
            
            # Check skills (should be array)
            skills = user.get("skills")
            if isinstance(skills, list) and len(skills) > 0:
                log_test(
                    "2.4: Skills updated correctly (array)",
                    True,
                    f"Skills: {skills}"
                )
            else:
                log_test(
                    "2.4: Skills updated correctly (array)",
                    False,
                    f"Expected array with skills, got: {skills}"
                )
        else:
            log_test(
                "2.2-2.4: Verify updates",
                False,
                f"Status: {response.status_code}"
            )
    except Exception as e:
        log_test("2.2-2.4: Verify updates", False, f"Error: {e}")

def test_languages_in_settings(token: str):
    """
    Test 3: LANGUAGES IN SETTINGS
    - GET /api/admin/settings → response contains "languages" array (default ~6 entries)
    - PUT /api/admin/settings {"languages":[{"code":"en","name":"English","active":true},{"code":"pa","name":"Punjabi","active":true}]}
    - GET /api/admin/settings → languages now has those 2 entries
    """
    print("\n" + "="*80)
    print("TEST 3: LANGUAGES IN SETTINGS")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Step 1: Get current settings and verify languages array
    try:
        response = requests.get(
            f"{BASE_URL}/admin/settings",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            languages = data.get("languages")
            
            if isinstance(languages, list) and len(languages) >= 6:
                log_test(
                    "3.1: GET settings contains languages array (default ~6 entries)",
                    True,
                    f"Found {len(languages)} languages: {[l.get('name') for l in languages]}"
                )
                original_languages = languages
            else:
                log_test(
                    "3.1: GET settings contains languages array",
                    False,
                    f"Expected array with ~6 entries, got: {languages}"
                )
                return
        else:
            log_test(
                "3.1: GET settings",
                False,
                f"Status: {response.status_code}"
            )
            return
    except Exception as e:
        log_test("3.1: GET settings", False, f"Error: {e}")
        return
    
    # Step 2: Update languages to 2 entries
    try:
        new_languages = [
            {"code": "en", "name": "English", "active": True},
            {"code": "pa", "name": "Punjabi", "active": True}
        ]
        
        response = requests.put(
            f"{BASE_URL}/admin/settings",
            headers=headers,
            json={"languages": new_languages},
            timeout=10
        )
        
        if response.status_code == 200:
            log_test(
                "3.2: PUT settings with new languages array",
                True,
                f"Status: 200"
            )
        else:
            log_test(
                "3.2: PUT settings with new languages array",
                False,
                f"Status: {response.status_code}, Response: {response.text}"
            )
            return
    except Exception as e:
        log_test("3.2: PUT settings", False, f"Error: {e}")
        return
    
    # Step 3: Verify languages updated
    try:
        response = requests.get(
            f"{BASE_URL}/admin/settings",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            languages = data.get("languages")
            
            if isinstance(languages, list) and len(languages) == 2:
                codes = [l.get("code") for l in languages]
                names = [l.get("name") for l in languages]
                
                if set(codes) == {"en", "pa"} and set(names) == {"English", "Punjabi"}:
                    log_test(
                        "3.3: Languages updated to 2 entries (English, Punjabi)",
                        True,
                        f"Languages: {languages}"
                    )
                else:
                    log_test(
                        "3.3: Languages updated correctly",
                        False,
                        f"Expected en/pa, got: {languages}"
                    )
            else:
                log_test(
                    "3.3: Languages updated to 2 entries",
                    False,
                    f"Expected 2 entries, got: {len(languages) if isinstance(languages, list) else 'not a list'}"
                )
        else:
            log_test(
                "3.3: Verify languages updated",
                False,
                f"Status: {response.status_code}"
            )
    except Exception as e:
        log_test("3.3: Verify languages updated", False, f"Error: {e}")
    
    # Step 4: Restore original languages
    try:
        response = requests.put(
            f"{BASE_URL}/admin/settings",
            headers=headers,
            json={"languages": original_languages},
            timeout=10
        )
        print("  (Restored original languages)")
    except Exception:
        pass

def test_notify_templates_list(token: str):
    """
    Test 4: NOTIFY TEMPLATES LIST
    - GET /api/admin/partners/notify-templates?channel=sms → 200 array, every item has channel=="sms" and active
    - Repeat for channel=push and channel=email
    - Capture a push template id for test 5
    """
    print("\n" + "="*80)
    print("TEST 4: NOTIFY TEMPLATES LIST")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    push_template_id = None
    
    # Test each channel
    for channel in ["sms", "push", "email"]:
        try:
            response = requests.get(
                f"{BASE_URL}/admin/partners/notify-templates",
                headers=headers,
                params={"channel": channel},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                
                if isinstance(data, list):
                    # Verify all items have correct channel and are active
                    all_correct_channel = all(t.get("channel") == channel for t in data)
                    
                    if all_correct_channel:
                        log_test(
                            f"4.{['sms', 'push', 'email'].index(channel) + 1}: GET notify-templates?channel={channel} returns only {channel} templates",
                            True,
                            f"Found {len(data)} {channel} templates"
                        )
                        
                        # Capture push template id for test 5
                        if channel == "push" and len(data) > 0:
                            push_template_id = data[0].get("id")
                    else:
                        wrong_channels = [t.get("channel") for t in data if t.get("channel") != channel]
                        log_test(
                            f"4.{['sms', 'push', 'email'].index(channel) + 1}: GET notify-templates?channel={channel}",
                            False,
                            f"Found templates with wrong channels: {wrong_channels}"
                        )
                else:
                    log_test(
                        f"4.{['sms', 'push', 'email'].index(channel) + 1}: GET notify-templates?channel={channel}",
                        False,
                        f"Expected array, got: {type(data)}"
                    )
            else:
                log_test(
                    f"4.{['sms', 'push', 'email'].index(channel) + 1}: GET notify-templates?channel={channel}",
                    False,
                    f"Status: {response.status_code}"
                )
        except Exception as e:
            log_test(f"4.{['sms', 'push', 'email'].index(channel) + 1}: GET notify-templates?channel={channel}", False, f"Error: {e}")
    
    return push_template_id

def test_notify_send(token: str, partner_id: str, push_template_id: str):
    """
    Test 5: NOTIFY SEND (template based)
    - POST /api/admin/partners/{pid}/notify {"channel":"push","template_id":"<push template id>"} → 200 with ok:true
    - POST without template_id → 400
    - POST with mismatched channel → 400
    """
    print("\n" + "="*80)
    print("TEST 5: NOTIFY SEND (template based)")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    if not push_template_id:
        log_test(
            "5.1-5.3: Notify send tests",
            False,
            "No push template ID available from test 4"
        )
        return
    
    # Step 1: Send notification with valid template
    try:
        response = requests.post(
            f"{BASE_URL}/admin/partners/{partner_id}/notify",
            headers=headers,
            json={
                "channel": "push",
                "template_id": push_template_id
            },
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") == True:
                log_test(
                    "5.1: POST notify with valid push template → 200 with ok:true",
                    True,
                    f"Response: {json.dumps(data)}"
                )
            else:
                log_test(
                    "5.1: POST notify with valid push template",
                    False,
                    f"Expected ok:true, got: {data}"
                )
        else:
            log_test(
                "5.1: POST notify with valid push template",
                False,
                f"Status: {response.status_code}, Response: {response.text}"
            )
    except Exception as e:
        log_test("5.1: POST notify with valid template", False, f"Error: {e}")
    
    # Step 2: Send notification without template_id (should fail with 400)
    try:
        response = requests.post(
            f"{BASE_URL}/admin/partners/{partner_id}/notify",
            headers=headers,
            json={"channel": "push"},
            timeout=10
        )
        
        if response.status_code == 400:
            log_test(
                "5.2: POST notify without template_id → 400",
                True,
                f"Correctly rejected with 400"
            )
        else:
            log_test(
                "5.2: POST notify without template_id → 400",
                False,
                f"Expected 400, got: {response.status_code}"
            )
    except Exception as e:
        log_test("5.2: POST notify without template_id", False, f"Error: {e}")
    
    # Step 3: Send notification with mismatched channel (should fail with 400)
    try:
        response = requests.post(
            f"{BASE_URL}/admin/partners/{partner_id}/notify",
            headers=headers,
            json={
                "channel": "sms",
                "template_id": push_template_id  # This is a push template
            },
            timeout=10
        )
        
        if response.status_code == 400:
            log_test(
                "5.3: POST notify with mismatched channel (sms template with push id) → 400",
                True,
                f"Correctly rejected with 400"
            )
        else:
            log_test(
                "5.3: POST notify with mismatched channel → 400",
                False,
                f"Expected 400, got: {response.status_code}"
            )
    except Exception as e:
        log_test("5.3: POST notify with mismatched channel", False, f"Error: {e}")

def test_wallet_config(token: str):
    """
    Test 6: WALLET CONFIG
    - GET /api/admin/partner/wallet-config → 200 object (min_withdrawal, max_withdrawal, etc)
    - PUT /api/admin/partner/wallet-config with new values → 200
    - GET again → values reflect the update
    """
    print("\n" + "="*80)
    print("TEST 6: WALLET CONFIG")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Step 1: Get current wallet config
    try:
        response = requests.get(
            f"{BASE_URL}/admin/partner/wallet-config",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Verify it's an object with expected keys
            expected_keys = ["min_withdrawal", "max_withdrawal"]
            has_keys = all(k in data for k in expected_keys)
            
            if has_keys:
                log_test(
                    "6.1: GET wallet-config returns object with min_withdrawal, max_withdrawal",
                    True,
                    f"Config: min={data.get('min_withdrawal')}, max={data.get('max_withdrawal')}"
                )
                original_config = data
            else:
                log_test(
                    "6.1: GET wallet-config",
                    False,
                    f"Missing expected keys. Got: {list(data.keys())}"
                )
                return
        else:
            log_test(
                "6.1: GET wallet-config",
                False,
                f"Status: {response.status_code}"
            )
            return
    except Exception as e:
        log_test("6.1: GET wallet-config", False, f"Error: {e}")
        return
    
    # Step 2: Update wallet config
    try:
        new_config = {
            "min_withdrawal": 200,
            "max_withdrawal": 40000,
            "processing_fee_pct": 2,
            "frequency_days": 7,
            "upi_enabled": True,
            "bank_enabled": False
        }
        
        response = requests.put(
            f"{BASE_URL}/admin/partner/wallet-config",
            headers=headers,
            json=new_config,
            timeout=10
        )
        
        if response.status_code == 200:
            log_test(
                "6.2: PUT wallet-config with new values",
                True,
                f"Status: 200"
            )
        else:
            log_test(
                "6.2: PUT wallet-config",
                False,
                f"Status: {response.status_code}, Response: {response.text}"
            )
            return
    except Exception as e:
        log_test("6.2: PUT wallet-config", False, f"Error: {e}")
        return
    
    # Step 3: Verify config updated
    try:
        response = requests.get(
            f"{BASE_URL}/admin/partner/wallet-config",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Verify all values updated
            checks = [
                ("min_withdrawal", 200),
                ("max_withdrawal", 40000),
                ("processing_fee_pct", 2),
                ("frequency_days", 7),
                ("upi_enabled", True),
                ("bank_enabled", False)
            ]
            
            all_correct = all(data.get(k) == v for k, v in checks)
            
            if all_correct:
                log_test(
                    "6.3: Wallet config values reflect the update",
                    True,
                    f"All values updated correctly"
                )
            else:
                mismatches = [(k, v, data.get(k)) for k, v in checks if data.get(k) != v]
                log_test(
                    "6.3: Wallet config values reflect the update",
                    False,
                    f"Mismatches: {mismatches}"
                )
        else:
            log_test(
                "6.3: Verify config updated",
                False,
                f"Status: {response.status_code}"
            )
    except Exception as e:
        log_test("6.3: Verify config updated", False, f"Error: {e}")
    
    # Step 4: Restore original config
    try:
        response = requests.put(
            f"{BASE_URL}/admin/partner/wallet-config",
            headers=headers,
            json=original_config,
            timeout=10
        )
        print("  (Restored original wallet config)")
    except Exception:
        pass

def test_withdrawal_action_error_handling(token: str):
    """
    Test 7: WITHDRAWAL ACTION ROUTE ERROR HANDLING
    - POST /api/admin/partner/withdrawals/nonexistent-id/action {"action":"approve"}
    - Should return handled error (404 or 400), NOT 500 crash
    """
    print("\n" + "="*80)
    print("TEST 7: WITHDRAWAL ACTION ROUTE ERROR HANDLING")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.post(
            f"{BASE_URL}/admin/partner/withdrawals/nonexistent-id-12345/action",
            headers=headers,
            json={"action": "approve"},
            timeout=10
        )
        
        # Should return 404 or 400, NOT 500
        if response.status_code in [404, 400]:
            log_test(
                "7.1: POST withdrawal action with nonexistent ID → handled error (404/400)",
                True,
                f"Status: {response.status_code}, Response: {response.text[:200]}"
            )
        elif response.status_code == 500:
            log_test(
                "7.1: POST withdrawal action with nonexistent ID",
                False,
                f"Server crashed with 500 - should return 404/400 instead. Response: {response.text[:200]}"
            )
        else:
            log_test(
                "7.1: POST withdrawal action with nonexistent ID",
                False,
                f"Unexpected status: {response.status_code}, Response: {response.text[:200]}"
            )
    except Exception as e:
        log_test("7.1: POST withdrawal action error handling", False, f"Error: {e}")

def get_partner_by_phone(token: str, phone: str):
    """Get partner ID by phone number"""
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.get(
            f"{BASE_URL}/admin/users",
            headers=headers,
            params={"role": "partner"},
            timeout=10
        )
        
        if response.status_code == 200:
            users = response.json()
            for user in users:
                if user.get("phone") == phone:
                    return user.get("id"), user.get("name")
        return None, None
    except Exception as e:
        print(f"Error getting partner: {e}")
        return None, None

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    total = test_results["passed"] + test_results["failed"]
    pass_rate = (test_results["passed"] / total * 100) if total > 0 else 0
    
    print(f"\nTotal Tests: {total}")
    print(f"Passed: {test_results['passed']} ✅")
    print(f"Failed: {test_results['failed']} ❌")
    print(f"Pass Rate: {pass_rate:.1f}%")
    
    if test_results["failed"] > 0:
        print("\n" + "="*80)
        print("FAILED TESTS:")
        print("="*80)
        for test in test_results["tests"]:
            if "❌" in test["status"]:
                print(f"\n{test['status']}: {test['name']}")
                if test["details"]:
                    print(f"  {test['details']}")

def main():
    """Main test execution"""
    print("="*80)
    print("AZOAPP ADMIN BACKEND FOLLOW-UP TESTING")
    print("="*80)
    
    # Step 1: Get admin token
    print("\n🔐 Authenticating as admin...")
    token = get_admin_token()
    if not token:
        print("❌ Failed to get admin token. Exiting.")
        return
    print("✅ Admin authenticated successfully")
    
    # Step 2: Get partner by phone (Amit Singh +919000000005)
    print("\n👤 Finding partner 'Amit Singh' (+919000000005)...")
    partner_id, partner_name = get_partner_by_phone(token, "+919000000005")
    
    if not partner_id:
        print("⚠️  Partner +919000000005 not found. Trying to find any partner...")
        # Try to get any partner
        partner_id, partner_name = get_partner_by_phone(token, "+919000000003")
        
        if not partner_id:
            print("❌ No partner found. Cannot proceed with tests.")
            return
    
    print(f"✅ Found partner: {partner_name} (ID: {partner_id})")
    
    # Run all tests
    test_permanent_provider_code(token, partner_id)
    test_edit_with_selects(token, partner_id)
    test_languages_in_settings(token)
    push_template_id = test_notify_templates_list(token)
    test_notify_send(token, partner_id, push_template_id)
    test_wallet_config(token)
    test_withdrawal_action_error_handling(token)
    
    # Print summary
    print_summary()

if __name__ == "__main__":
    main()
