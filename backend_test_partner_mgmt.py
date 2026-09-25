"""
Comprehensive Backend Testing for Partner Management Endpoints
Tests: Edit Partner, Suspend/Unsuspend, Notify, Logs, KYC Rejection Reason
"""
import requests
import json
from typing import Dict, Any

# Base URL from frontend/.env
BASE_URL = "https://customer-auth-native.preview.emergentagent.com/api"

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

def get_partner_token(phone: str) -> str:
    """Get partner token"""
    try:
        response = requests.post(
            f"{BASE_URL}/auth/verify-otp",
            json={"phone": phone, "otp": "123456"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            if data.get("token"):
                return data["token"]
        return None
    except Exception as e:
        print(f"Partner login error: {e}")
        return None

def test_partner_management(admin_token: str):
    """Test all partner management endpoints"""
    print("\n" + "="*80)
    print("PARTNER MANAGEMENT TESTING")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    partner_id = None
    partner_phone = None
    
    # Step 0: Get a partner from the system
    # Use demo partner +919000000003 (Raj Kumar) for login tests since it has OTP 123456
    print("\n--- Step 0: Get Partner ---")
    try:
        response = requests.get(
            f"{BASE_URL}/admin/users?role=partner",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            partners = response.json()
            if partners and len(partners) > 0:
                # Look for demo partner +919000000003 (has OTP 123456) for login tests
                target_partner = None
                for p in partners:
                    if p.get("phone") == "+919000000003":
                        target_partner = p
                        break
                
                # Fallback to "Amit Singh" or any partner
                if not target_partner:
                    for p in partners:
                        if p.get("name") == "Amit Singh" or p.get("phone") == "+919000000005":
                            target_partner = p
                            break
                
                if not target_partner and partners:
                    target_partner = partners[0]
                
                if target_partner:
                    partner_id = target_partner.get("id")
                    partner_phone = target_partner.get("phone")
                    log_test(
                        "Setup: Found partner for testing",
                        True,
                        f"Partner: {target_partner.get('name')} ({partner_phone}), ID: {partner_id}"
                    )
                else:
                    log_test("Setup: Find partner", False, "No partners found in system")
                    return
            else:
                log_test("Setup: Find partner", False, "No partners in system")
                return
        else:
            log_test("Setup: Find partner", False, f"Status: {response.status_code}")
            return
    except Exception as e:
        log_test("Setup: Find partner", False, f"Error: {e}")
        return
    
    # TEST 1: EDIT PARTNER
    print("\n--- Test 1: EDIT PARTNER ---")
    try:
        # Get current partner details
        response = requests.get(
            f"{BASE_URL}/admin/users/{partner_id}/detail",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            original_user = response.json().get("user", {})
            original_id = original_user.get("id")
            original_skills = original_user.get("skills", [])
            
            # Edit partner with new data
            edit_data = {
                "partner_code": "AZP-101",
                "email": "amit@test.com",
                "skills": "ac, plumbing",
                "language": "hi"
            }
            
            edit_response = requests.put(
                f"{BASE_URL}/admin/partners/{partner_id}",
                headers=headers,
                json=edit_data,
                timeout=10
            )
            
            if edit_response.status_code == 200:
                updated_user = edit_response.json()
                
                # Verify updates
                checks = []
                checks.append(("partner_code", updated_user.get("partner_code") == "AZP-101"))
                checks.append(("email", updated_user.get("email") == "amit@test.com"))
                checks.append(("skills is array", isinstance(updated_user.get("skills"), list)))
                checks.append(("skills contains ac", "ac" in updated_user.get("skills", [])))
                checks.append(("skills contains plumbing", "plumbing" in updated_user.get("skills", [])))
                checks.append(("language", updated_user.get("language") == "hi"))
                checks.append(("id unchanged", updated_user.get("id") == original_id))
                
                all_passed = all(check[1] for check in checks)
                failed_checks = [check[0] for check in checks if not check[1]]
                
                if all_passed:
                    log_test(
                        "1) EDIT PARTNER: PUT /api/admin/partners/{pid} updates partner correctly",
                        True,
                        f"Updated: partner_code=AZP-101, email=amit@test.com, skills=['ac','plumbing'], language=hi, ID unchanged"
                    )
                else:
                    log_test(
                        "1) EDIT PARTNER: PUT /api/admin/partners/{pid}",
                        False,
                        f"Failed checks: {', '.join(failed_checks)}. Response: {json.dumps(updated_user)}"
                    )
            else:
                log_test(
                    "1) EDIT PARTNER: PUT /api/admin/partners/{pid}",
                    False,
                    f"Status: {edit_response.status_code}, Response: {edit_response.text}"
                )
        else:
            log_test(
                "1) EDIT PARTNER: GET partner detail",
                False,
                f"Status: {response.status_code}"
            )
    except Exception as e:
        log_test("1) EDIT PARTNER", False, f"Error: {e}")
    
    # TEST 1b: EDIT PARTNER - Duplicate phone validation
    print("\n--- Test 1b: EDIT PARTNER - Duplicate Phone ---")
    try:
        # Try to update partner with admin's phone (should fail)
        duplicate_data = {
            "phone": "+919000000000"  # Admin's phone
        }
        
        response = requests.put(
            f"{BASE_URL}/admin/partners/{partner_id}",
            headers=headers,
            json=duplicate_data,
            timeout=10
        )
        
        if response.status_code == 400:
            error_detail = response.json().get("detail", "")
            if "phone" in error_detail.lower() or "use" in error_detail.lower():
                log_test(
                    "1b) EDIT PARTNER: Duplicate phone returns 400 error",
                    True,
                    f"Error: {error_detail}"
                )
            else:
                log_test(
                    "1b) EDIT PARTNER: Duplicate phone validation",
                    False,
                    f"Expected phone error, got: {error_detail}"
                )
        else:
            log_test(
                "1b) EDIT PARTNER: Duplicate phone validation",
                False,
                f"Expected 400, got: {response.status_code}, Response: {response.text}"
            )
    except Exception as e:
        log_test("1b) EDIT PARTNER: Duplicate phone", False, f"Error: {e}")
    
    # TEST 2: SUSPEND + LOGIN BLOCK
    print("\n--- Test 2: SUSPEND + LOGIN BLOCK ---")
    try:
        # Suspend partner
        suspend_data = {
            "days": 3,
            "reason": "testing suspension"
        }
        
        response = requests.post(
            f"{BASE_URL}/admin/partners/{partner_id}/suspend",
            headers=headers,
            json=suspend_data,
            timeout=10
        )
        
        if response.status_code == 200:
            suspended_user = response.json()
            
            # Verify suspension fields
            checks = []
            checks.append(("suspended=true", suspended_user.get("suspended") == True))
            checks.append(("suspend_until present", bool(suspended_user.get("suspend_until"))))
            checks.append(("partner_status=offline", suspended_user.get("partner_status") == "offline"))
            checks.append(("suspend_reason", suspended_user.get("suspend_reason") == "testing suspension"))
            
            all_passed = all(check[1] for check in checks)
            failed_checks = [check[0] for check in checks if not check[1]]
            
            if all_passed:
                log_test(
                    "2a) SUSPEND: POST /api/admin/partners/{pid}/suspend sets suspension correctly",
                    True,
                    f"suspended=true, suspend_until={suspended_user.get('suspend_until')}, partner_status=offline"
                )
                
                # Now try to login as suspended partner
                if partner_phone:
                    login_response = requests.post(
                        f"{BASE_URL}/auth/verify-otp",
                        json={"phone": partner_phone, "otp": "123456"},
                        timeout=10
                    )
                    
                    if login_response.status_code == 403:
                        error_detail = login_response.json().get("detail", "")
                        if "suspend" in error_detail.lower():
                            log_test(
                                "2b) SUSPEND: Suspended partner login returns 403 with suspension message",
                                True,
                                f"Error: {error_detail}"
                            )
                        else:
                            log_test(
                                "2b) SUSPEND: Login block message",
                                False,
                                f"Expected 'suspended' in error, got: {error_detail}"
                            )
                    else:
                        log_test(
                            "2b) SUSPEND: Login block",
                            False,
                            f"Expected 403, got: {login_response.status_code}, Response: {login_response.text}"
                        )
                else:
                    log_test("2b) SUSPEND: Login block", False, "No partner phone available")
            else:
                log_test(
                    "2a) SUSPEND: POST /api/admin/partners/{pid}/suspend",
                    False,
                    f"Failed checks: {', '.join(failed_checks)}. Response: {json.dumps(suspended_user)}"
                )
        else:
            log_test(
                "2) SUSPEND",
                False,
                f"Status: {response.status_code}, Response: {response.text}"
            )
    except Exception as e:
        log_test("2) SUSPEND", False, f"Error: {e}")
    
    # TEST 3: UNSUSPEND
    print("\n--- Test 3: UNSUSPEND ---")
    try:
        # Unsuspend partner
        response = requests.post(
            f"{BASE_URL}/admin/partners/{partner_id}/unsuspend",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            unsuspended_user = response.json()
            
            if unsuspended_user.get("suspended") == False:
                log_test(
                    "3a) UNSUSPEND: POST /api/admin/partners/{pid}/unsuspend clears suspension",
                    True,
                    f"suspended=false"
                )
                
                # Now try to login as unsuspended partner
                if partner_phone:
                    login_response = requests.post(
                        f"{BASE_URL}/auth/verify-otp",
                        json={"phone": partner_phone, "otp": "123456"},
                        timeout=10
                    )
                    
                    if login_response.status_code == 200:
                        login_data = login_response.json()
                        if login_data.get("token") and login_data.get("user"):
                            log_test(
                                "3b) UNSUSPEND: Partner can login after unsuspension",
                                True,
                                f"Login successful, token received"
                            )
                        else:
                            log_test(
                                "3b) UNSUSPEND: Partner login",
                                False,
                                f"Expected token and user, got: {json.dumps(login_data)}"
                            )
                    else:
                        log_test(
                            "3b) UNSUSPEND: Partner login",
                            False,
                            f"Status: {login_response.status_code}, Response: {login_response.text}"
                        )
                else:
                    log_test("3b) UNSUSPEND: Partner login", False, "No partner phone available")
            else:
                log_test(
                    "3a) UNSUSPEND",
                    False,
                    f"Expected suspended=false, got: {unsuspended_user.get('suspended')}"
                )
        else:
            log_test(
                "3) UNSUSPEND",
                False,
                f"Status: {response.status_code}, Response: {response.text}"
            )
    except Exception as e:
        log_test("3) UNSUSPEND", False, f"Error: {e}")
    
    # TEST 4: NOTIFY
    print("\n--- Test 4: NOTIFY ---")
    
    # Test 4a: Push notification
    try:
        notify_data = {
            "channel": "push",
            "subject": "Hi",
            "message": "Test push"
        }
        
        response = requests.post(
            f"{BASE_URL}/admin/partners/{partner_id}/notify",
            headers=headers,
            json=notify_data,
            timeout=10
        )
        
        if response.status_code == 200:
            notify_result = response.json()
            
            checks = []
            checks.append(("ok=true", notify_result.get("ok") == True))
            checks.append(("in_app=true", notify_result.get("in_app") == True))
            checks.append(("channel=push", notify_result.get("channel") == "push"))
            
            all_passed = all(check[1] for check in checks)
            failed_checks = [check[0] for check in checks if not check[1]]
            
            if all_passed:
                log_test(
                    "4a) NOTIFY: POST /api/admin/partners/{pid}/notify with channel=push succeeds",
                    True,
                    f"ok=true, in_app=true, channel=push"
                )
            else:
                log_test(
                    "4a) NOTIFY: Push notification",
                    False,
                    f"Failed checks: {', '.join(failed_checks)}. Response: {json.dumps(notify_result)}"
                )
        else:
            log_test(
                "4a) NOTIFY: Push notification",
                False,
                f"Status: {response.status_code}, Response: {response.text}"
            )
    except Exception as e:
        log_test("4a) NOTIFY: Push", False, f"Error: {e}")
    
    # Test 4b: SMS notification (should return note about gateway not configured)
    try:
        notify_data = {
            "channel": "sms",
            "message": "Test sms"
        }
        
        response = requests.post(
            f"{BASE_URL}/admin/partners/{partner_id}/notify",
            headers=headers,
            json=notify_data,
            timeout=10
        )
        
        if response.status_code == 200:
            notify_result = response.json()
            
            checks = []
            checks.append(("ok=true", notify_result.get("ok") == True))
            checks.append(("has note field", "note" in notify_result))
            
            all_passed = all(check[1] for check in checks)
            
            if all_passed:
                note = notify_result.get("note", "")
                if "sms" in note.lower() or "gateway" in note.lower() or "configured" in note.lower():
                    log_test(
                        "4b) NOTIFY: POST /api/admin/partners/{pid}/notify with channel=sms returns note about gateway",
                        True,
                        f"Note: {note}"
                    )
                else:
                    log_test(
                        "4b) NOTIFY: SMS notification note",
                        False,
                        f"Expected SMS gateway note, got: {note}"
                    )
            else:
                log_test(
                    "4b) NOTIFY: SMS notification",
                    False,
                    f"Response: {json.dumps(notify_result)}"
                )
        else:
            log_test(
                "4b) NOTIFY: SMS notification",
                False,
                f"Status: {response.status_code}, Response: {response.text}"
            )
    except Exception as e:
        log_test("4b) NOTIFY: SMS", False, f"Error: {e}")
    
    # TEST 5: LOGS
    print("\n--- Test 5: LOGS ---")
    try:
        response = requests.get(
            f"{BASE_URL}/admin/partners/{partner_id}/logs",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            logs = response.json()
            
            if isinstance(logs, list):
                # Check for expected log actions from previous tests
                log_actions = [log.get("action") for log in logs]
                
                expected_actions = ["partner.updated", "partner.suspended", "partner.unsuspended"]
                notify_actions = [a for a in log_actions if "partner.notify" in a]
                
                found_actions = []
                for action in expected_actions:
                    if action in log_actions:
                        found_actions.append(action)
                
                if notify_actions:
                    found_actions.append("partner.notify.*")
                
                # Verify log structure
                sample_log = logs[0] if logs else {}
                has_structure = all(key in sample_log for key in ["action", "actor_name", "actor_role", "detail", "created_at"])
                
                if found_actions and has_structure:
                    log_test(
                        "5) LOGS: GET /api/admin/partners/{pid}/logs returns activity logs",
                        True,
                        f"Found {len(logs)} logs including actions: {', '.join(found_actions)}"
                    )
                else:
                    log_test(
                        "5) LOGS: Activity logs",
                        False,
                        f"Expected actions not found or structure incomplete. Found: {log_actions[:5]}"
                    )
            else:
                log_test(
                    "5) LOGS",
                    False,
                    f"Expected array, got: {type(logs)}"
                )
        else:
            log_test(
                "5) LOGS",
                False,
                f"Status: {response.status_code}, Response: {response.text}"
            )
    except Exception as e:
        log_test("5) LOGS", False, f"Error: {e}")
    
    # TEST 6: KYC REJECT REASON
    print("\n--- Test 6: KYC REJECT REASON ---")
    
    # Test 6a: Reject KYC with reason
    try:
        response = requests.post(
            f"{BASE_URL}/admin/kyc/{partner_id}?status=rejected&reason=Docs%20blurry",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            rejected_user = response.json()
            
            # Get detail to verify
            detail_response = requests.get(
                f"{BASE_URL}/admin/users/{partner_id}/detail",
                headers=headers,
                timeout=10
            )
            
            if detail_response.status_code == 200:
                user_detail = detail_response.json().get("user", {})
                
                checks = []
                checks.append(("kyc_status=rejected", user_detail.get("kyc_status") == "rejected"))
                checks.append(("kyc_rejection_reason", user_detail.get("kyc_rejection_reason") == "Docs blurry"))
                
                all_passed = all(check[1] for check in checks)
                failed_checks = [check[0] for check in checks if not check[1]]
                
                if all_passed:
                    log_test(
                        "6a) KYC REJECT: POST /api/admin/kyc/{pid}?status=rejected&reason=... sets rejection reason",
                        True,
                        f"kyc_status=rejected, kyc_rejection_reason='Docs blurry'"
                    )
                else:
                    log_test(
                        "6a) KYC REJECT",
                        False,
                        f"Failed checks: {', '.join(failed_checks)}. User: {json.dumps(user_detail)}"
                    )
            else:
                log_test(
                    "6a) KYC REJECT: Get detail",
                    False,
                    f"Status: {detail_response.status_code}"
                )
        else:
            log_test(
                "6a) KYC REJECT",
                False,
                f"Status: {response.status_code}, Response: {response.text}"
            )
    except Exception as e:
        log_test("6a) KYC REJECT", False, f"Error: {e}")
    
    # Test 6b: Approve KYC (should clear rejection reason)
    try:
        response = requests.post(
            f"{BASE_URL}/admin/kyc/{partner_id}?status=approved",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            approved_user = response.json()
            
            # Get detail to verify
            detail_response = requests.get(
                f"{BASE_URL}/admin/users/{partner_id}/detail",
                headers=headers,
                timeout=10
            )
            
            if detail_response.status_code == 200:
                user_detail = detail_response.json().get("user", {})
                
                checks = []
                checks.append(("kyc_status=approved", user_detail.get("kyc_status") == "approved"))
                checks.append(("kyc_rejection_reason cleared", "kyc_rejection_reason" not in user_detail or not user_detail.get("kyc_rejection_reason")))
                
                all_passed = all(check[1] for check in checks)
                failed_checks = [check[0] for check in checks if not check[1]]
                
                if all_passed:
                    log_test(
                        "6b) KYC APPROVE: POST /api/admin/kyc/{pid}?status=approved clears rejection reason",
                        True,
                        f"kyc_status=approved, kyc_rejection_reason cleared"
                    )
                else:
                    log_test(
                        "6b) KYC APPROVE",
                        False,
                        f"Failed checks: {', '.join(failed_checks)}. User: {json.dumps(user_detail)}"
                    )
            else:
                log_test(
                    "6b) KYC APPROVE: Get detail",
                    False,
                    f"Status: {detail_response.status_code}"
                )
        else:
            log_test(
                "6b) KYC APPROVE",
                False,
                f"Status: {response.status_code}, Response: {response.text}"
            )
    except Exception as e:
        log_test("6b) KYC APPROVE", False, f"Error: {e}")

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    total = test_results['passed'] + test_results['failed']
    print(f"Total Tests: {total}")
    print(f"✅ Passed: {test_results['passed']}")
    print(f"❌ Failed: {test_results['failed']}")
    if total > 0:
        print(f"Success Rate: {test_results['passed'] / total * 100:.1f}%")
    
    if test_results['failed'] > 0:
        print("\n" + "="*80)
        print("FAILED TESTS:")
        print("="*80)
        for test in test_results['tests']:
            if "❌" in test['status']:
                print(f"\n{test['name']}")
                print(f"  {test['details']}")
    
    print("\n" + "="*80)
    print("DETAILED RESULTS BY FEATURE:")
    print("="*80)
    for test in test_results['tests']:
        print(f"{test['status']}: {test['name']}")

def main():
    """Main test runner"""
    print("="*80)
    print("PARTNER MANAGEMENT BACKEND TESTING")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print("="*80)
    
    # Get admin token
    print("\nAuthenticating as admin...")
    admin_token = get_admin_token()
    
    if not admin_token:
        print("❌ Failed to get admin token. Cannot proceed.")
        return
    
    print(f"✅ Admin token obtained: {admin_token[:20]}...")
    
    # Run partner management tests
    test_partner_management(admin_token)
    
    # Print summary
    print_summary()

if __name__ == "__main__":
    main()
