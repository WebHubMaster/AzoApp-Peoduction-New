#!/usr/bin/env python3
"""
DE-EMERGENT LLM SWAP Verification Test
Tests the replacement of emergentintegrations + EMERGENT_LLM_KEY with standard LiteLLM.
Verifies graceful behavior with NO API keys configured (no 500s, friendly fallback messages).
"""
import requests
import json
import sys
import io
from PIL import Image

# Configuration
BASE_URL = "https://mobile-invoice-tools.preview.emergentagent.com/api"
OTP = "123456"
ADMIN_PHONE = "+919000000000"
CUSTOMER_PHONE = "+919000000004"
PARTNER_PHONE = "+919000000003"

# Test results
results = {
    "total_tests": 0,
    "passed": 0,
    "failed": 0,
    "tests": []
}


def log_test(name, passed, details=""):
    """Log a test result."""
    results["total_tests"] += 1
    if passed:
        results["passed"] += 1
        status = "✅ PASS"
    else:
        results["failed"] += 1
        status = "❌ FAIL"
    
    results["tests"].append({
        "name": name,
        "passed": passed,
        "details": details
    })
    print(f"{status}: {name}")
    if details:
        print(f"  {details}")


def login(phone):
    """Login and return auth token."""
    # Request OTP
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if resp.status_code != 200:
        print(f"❌ Failed to send OTP for {phone}: {resp.status_code}")
        print(f"   Response: {resp.text}")
        return None
    
    # Verify OTP
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    if resp.status_code != 200:
        print(f"❌ Failed to verify OTP for {phone}: {resp.status_code}")
        print(f"   Response: {resp.text}")
        return None
    
    data = resp.json()
    token = data.get("token")
    if not token:
        print(f"❌ No token in response for {phone}")
        print(f"   Response: {json.dumps(data, indent=2)}")
        return None
    
    print(f"✅ Logged in as {phone}")
    return token


def create_dummy_aadhaar_image():
    """Create a dummy Aadhaar-like image for OCR testing."""
    # Create a simple image with text
    img = Image.new('RGB', (400, 200), color='white')
    
    # Save to bytes
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='JPEG')
    img_bytes.seek(0)
    
    return img_bytes.getvalue()


def main():
    print("=" * 80)
    print("DE-EMERGENT LLM SWAP VERIFICATION TEST")
    print("=" * 80)
    print()
    
    # ========================================================================
    # TEST 1: Backend Healthy
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST 1: Backend Healthy")
    print("=" * 80)
    
    try:
        resp = requests.get(f"{BASE_URL}/")
        log_test(
            "Backend health check GET /api/",
            resp.status_code == 200,
            f"Status: {resp.status_code}"
        )
    except Exception as e:
        log_test("Backend health check GET /api/", False, f"Exception: {str(e)}")
    
    # ========================================================================
    # TEST 2: AI CHAT Graceful (No Key Configured)
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST 2: AI CHAT Graceful (No Key Configured)")
    print("=" * 80)
    
    customer_token = login(CUSTOMER_PHONE)
    if not customer_token:
        log_test("Customer login", False, "Failed to login as customer")
        print("\n⚠️  Skipping AI chat tests due to login failure")
    else:
        log_test("Customer login", True, f"Token obtained for {CUSTOMER_PHONE}")
        
        headers = {"Authorization": f"Bearer {customer_token}"}
        
        # First AI chat call
        try:
            resp = requests.post(
                f"{BASE_URL}/ai/chat",
                headers=headers,
                json={"message": "AC not cooling"}
            )
            
            log_test(
                "AI chat returns 200 (NOT 500)",
                resp.status_code == 200,
                f"Status: {resp.status_code}"
            )
            
            if resp.status_code == 200:
                data = resp.json()
                session_id = data.get("session_id")
                reply = data.get("reply", "")
                
                log_test(
                    "AI chat response has session_id",
                    bool(session_id),
                    f"session_id: {session_id}"
                )
                
                # Check for graceful fallback message (Hinglish)
                expected_phrases = ["AI assistant", "configure", "Integration Center"]
                has_fallback = any(phrase.lower() in reply.lower() for phrase in expected_phrases)
                
                log_test(
                    "AI chat returns graceful fallback message (no key configured)",
                    has_fallback,
                    f"Reply: {reply[:200]}"
                )
                
                # Second call with same session_id (history persistence)
                if session_id:
                    try:
                        resp2 = requests.post(
                            f"{BASE_URL}/ai/chat",
                            headers=headers,
                            json={"message": "What should I check?", "session_id": session_id}
                        )
                        
                        log_test(
                            "AI chat with session_id returns 200 (history persistence)",
                            resp2.status_code == 200,
                            f"Status: {resp2.status_code}"
                        )
                        
                        if resp2.status_code == 200:
                            data2 = resp2.json()
                            log_test(
                                "Second AI chat response has same session_id",
                                data2.get("session_id") == session_id,
                                f"session_id: {data2.get('session_id')}"
                            )
                    except Exception as e:
                        log_test(
                            "AI chat with session_id returns 200 (history persistence)",
                            False,
                            f"Exception: {str(e)}"
                        )
        except Exception as e:
            log_test("AI chat returns 200 (NOT 500)", False, f"Exception: {str(e)}")
    
    # ========================================================================
    # TEST 3: OCR Graceful (No Key Configured)
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST 3: OCR Graceful (No Key Configured)")
    print("=" * 80)
    
    partner_token = login(PARTNER_PHONE)
    if not partner_token:
        log_test("Partner login", False, "Failed to login as partner")
        print("\n⚠️  Skipping OCR tests due to login failure")
    else:
        log_test("Partner login", True, f"Token obtained for {PARTNER_PHONE}")
        
        headers = {"Authorization": f"Bearer {partner_token}"}
        
        # Create a dummy Aadhaar image
        dummy_image = create_dummy_aadhaar_image()
        
        try:
            # Test OCR endpoint with no API key configured
            files = {
                'file': ('aadhaar.jpg', dummy_image, 'image/jpeg')
            }
            data = {
                'aadhaar_number': '123456789012'
            }
            
            resp = requests.post(
                f"{BASE_URL}/partner/registration/aadhaar-ocr",
                headers=headers,
                files=files,
                data=data
            )
            
            log_test(
                "OCR endpoint returns 200 (NOT 500)",
                resp.status_code == 200,
                f"Status: {resp.status_code}"
            )
            
            if resp.status_code == 200:
                ocr_result = resp.json()
                
                # Check for graceful error response
                # The response structure is: {ocr_ran, extracted, matched, error, checked_at}
                ocr_ran = ocr_result.get("ocr_ran")
                error = ocr_result.get("error", "")
                
                log_test(
                    "OCR returns ocr_ran:false (no key configured)",
                    ocr_ran == False,
                    f"ocr_ran: {ocr_ran}"
                )
                
                log_test(
                    "OCR returns graceful error message (ocr_not_configured)",
                    "ocr_not_configured" in error or "not configured" in error.lower(),
                    f"error: {error}"
                )
                
                print(f"Full OCR response: {json.dumps(ocr_result, indent=2)}")
        
        except Exception as e:
            log_test("OCR endpoint returns 200 (NOT 500)", False, f"Exception: {str(e)}")
    
    # ========================================================================
    # TEST 4: Integration Center Exposure
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST 4: Integration Center Exposure")
    print("=" * 80)
    
    admin_token = login(ADMIN_PHONE)
    if not admin_token:
        log_test("Admin login", False, "Failed to login as admin")
        print("\n⚠️  Skipping Integration Center tests due to login failure")
    else:
        log_test("Admin login", True, f"Token obtained for {ADMIN_PHONE}")
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        try:
            resp = requests.get(
                f"{BASE_URL}/admin/partner-reg/integration-center",
                headers=headers
            )
            
            log_test(
                "Integration Center GET returns 200",
                resp.status_code == 200,
                f"Status: {resp.status_code}"
            )
            
            if resp.status_code == 200:
                data = resp.json()
                integrations = data.get("integrations", {})
                
                # Check AI keys
                ai_enabled = integrations.get("ai_enabled")
                ai_provider = integrations.get("ai_provider")
                ai_model = integrations.get("ai_model")
                ai_api_key = integrations.get("ai_api_key")
                
                log_test(
                    "Integration Center has ai_enabled",
                    ai_enabled is not None,
                    f"ai_enabled: {ai_enabled}"
                )
                
                log_test(
                    "Integration Center has ai_provider (default 'anthropic')",
                    ai_provider is not None,
                    f"ai_provider: {ai_provider}"
                )
                
                log_test(
                    "Integration Center has ai_model (default 'claude-3-5-sonnet-20241022')",
                    ai_model is not None,
                    f"ai_model: {ai_model}"
                )
                
                log_test(
                    "Integration Center has ai_api_key (empty string)",
                    ai_api_key is not None,
                    f"ai_api_key: {'(empty)' if ai_api_key == '' else '(set)'}"
                )
                
                # Check OCR keys
                ocr_provider = integrations.get("ocr_provider")
                ocr_model = integrations.get("ocr_model")
                ocr_api_key = integrations.get("ocr_api_key")
                
                log_test(
                    "Integration Center has ocr_provider",
                    ocr_provider is not None,
                    f"ocr_provider: {ocr_provider}"
                )
                
                log_test(
                    "Integration Center has ocr_model",
                    ocr_model is not None,
                    f"ocr_model: {ocr_model}"
                )
                
                log_test(
                    "Integration Center has ocr_api_key",
                    ocr_api_key is not None,
                    f"ocr_api_key: {'(empty)' if ocr_api_key == '' else '(set)'}"
                )
                
                # ========================================================================
                # TEST 5: Save + Persistence + No Sibling Wipe
                # ========================================================================
                print("\n" + "=" * 80)
                print("TEST 5: Save + Persistence + No Sibling Wipe")
                print("=" * 80)
                
                # Save a sibling key value for comparison
                original_sms_provider = integrations.get("sms_provider")
                original_razorpay_mode = integrations.get("razorpay_mode")
                original_otp_expiry_sec = integrations.get("otp_expiry_sec")
                
                print(f"Original sibling values:")
                print(f"  sms_provider: {original_sms_provider}")
                print(f"  razorpay_mode: {original_razorpay_mode}")
                print(f"  otp_expiry_sec: {original_otp_expiry_sec}")
                
                # Update AI settings
                try:
                    resp = requests.put(
                        f"{BASE_URL}/admin/settings",
                        headers=headers,
                        json={
                            "integrations": {
                                "ai_provider": "openai",
                                "ai_model": "gpt-4o",
                                "ai_api_key": "sk-test-xxx"
                            }
                        }
                    )
                    
                    log_test(
                        "Update AI settings returns 200",
                        resp.status_code == 200,
                        f"Status: {resp.status_code}"
                    )
                    
                    if resp.status_code == 200:
                        # Re-fetch integration center
                        resp = requests.get(
                            f"{BASE_URL}/admin/partner-reg/integration-center",
                            headers=headers
                        )
                        
                        if resp.status_code == 200:
                            data = resp.json()
                            integrations = data.get("integrations", {})
                            
                            # Check AI values persisted
                            new_ai_provider = integrations.get("ai_provider")
                            new_ai_model = integrations.get("ai_model")
                            new_ai_api_key = integrations.get("ai_api_key")
                            
                            log_test(
                                "AI provider persisted (openai)",
                                new_ai_provider == "openai",
                                f"ai_provider: {new_ai_provider}"
                            )
                            
                            log_test(
                                "AI model persisted (gpt-4o)",
                                new_ai_model == "gpt-4o",
                                f"ai_model: {new_ai_model}"
                            )
                            
                            log_test(
                                "AI API key persisted (sk-test-xxx)",
                                new_ai_api_key == "sk-test-xxx",
                                f"ai_api_key: {new_ai_api_key[:20]}..." if new_ai_api_key else "ai_api_key: (empty)"
                            )
                            
                            # Check sibling keys NOT wiped
                            new_sms_provider = integrations.get("sms_provider")
                            new_razorpay_mode = integrations.get("razorpay_mode")
                            new_otp_expiry_sec = integrations.get("otp_expiry_sec")
                            
                            log_test(
                                "Sibling key sms_provider NOT wiped",
                                new_sms_provider == original_sms_provider,
                                f"sms_provider: {new_sms_provider} (was {original_sms_provider})"
                            )
                            
                            log_test(
                                "Sibling key razorpay_mode NOT wiped",
                                new_razorpay_mode == original_razorpay_mode,
                                f"razorpay_mode: {new_razorpay_mode} (was {original_razorpay_mode})"
                            )
                            
                            log_test(
                                "Sibling key otp_expiry_sec NOT wiped",
                                new_otp_expiry_sec == original_otp_expiry_sec,
                                f"otp_expiry_sec: {new_otp_expiry_sec} (was {original_otp_expiry_sec})"
                            )
                            
                            # Reset AI API key back to empty
                            print("\nResetting AI settings back to defaults...")
                            resp = requests.put(
                                f"{BASE_URL}/admin/settings",
                                headers=headers,
                                json={
                                    "integrations": {
                                        "ai_provider": "anthropic",
                                        "ai_model": "claude-3-5-sonnet-20241022",
                                        "ai_api_key": ""
                                    }
                                }
                            )
                            
                            log_test(
                                "Reset AI settings to defaults returns 200",
                                resp.status_code == 200,
                                f"Status: {resp.status_code}"
                            )
                            
                            if resp.status_code == 200:
                                # Verify reset
                                resp = requests.get(
                                    f"{BASE_URL}/admin/partner-reg/integration-center",
                                    headers=headers
                                )
                                
                                if resp.status_code == 200:
                                    data = resp.json()
                                    integrations = data.get("integrations", {})
                                    reset_ai_provider = integrations.get("ai_provider")
                                    reset_ai_model = integrations.get("ai_model")
                                    reset_ai_api_key = integrations.get("ai_api_key")
                                    
                                    log_test(
                                        "ai_provider reset to anthropic verified",
                                        reset_ai_provider == "anthropic",
                                        f"ai_provider: {reset_ai_provider}"
                                    )
                                    
                                    log_test(
                                        "ai_model reset to claude-3-5-sonnet-20241022 verified",
                                        reset_ai_model == "claude-3-5-sonnet-20241022",
                                        f"ai_model: {reset_ai_model}"
                                    )
                                    
                                    log_test(
                                        "ai_api_key reset to empty verified",
                                        reset_ai_api_key == "",
                                        f"ai_api_key: {'(empty)' if reset_ai_api_key == '' else reset_ai_api_key}"
                                    )
                
                except Exception as e:
                    log_test("Update AI settings returns 200", False, f"Exception: {str(e)}")
        
        except Exception as e:
            log_test("Integration Center GET returns 200", False, f"Exception: {str(e)}")
    
    # ========================================================================
    # TEST 6: Regression
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST 6: Regression")
    print("=" * 80)
    
    # Test existing endpoints still work
    try:
        resp = requests.get(f"{BASE_URL}/site/config")
        log_test(
            "Existing endpoint GET /api/site/config still works",
            resp.status_code == 200,
            f"Status: {resp.status_code}"
        )
    except Exception as e:
        log_test(
            "Existing endpoint GET /api/site/config still works",
            False,
            f"Exception: {str(e)}"
        )
    
    if admin_token:
        headers = {"Authorization": f"Bearer {admin_token}"}
        try:
            resp = requests.get(f"{BASE_URL}/admin/settings", headers=headers)
            log_test(
                "Existing endpoint GET /api/admin/settings still works",
                resp.status_code == 200,
                f"Status: {resp.status_code}"
            )
        except Exception as e:
            log_test(
                "Existing endpoint GET /api/admin/settings still works",
                False,
                f"Exception: {str(e)}"
            )
    
    # ========================================================================
    # Summary
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Total tests: {results['total_tests']}")
    print(f"Passed: {results['passed']} ✅")
    print(f"Failed: {results['failed']} ❌")
    print(f"Success rate: {results['passed'] / results['total_tests'] * 100:.1f}%")
    
    # Save results to file
    with open("/app/test_results_llm_swap.json", "w") as f:
        json.dump(results, f, indent=2)
    
    print(f"\nDetailed results saved to: /app/test_results_llm_swap.json")
    
    # Exit with appropriate code
    sys.exit(0 if results['failed'] == 0 else 1)


if __name__ == "__main__":
    main()
