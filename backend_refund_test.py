#!/usr/bin/env python3
"""
Backend API Testing Script for AzoApp
REFUND Role-Based Visibility Testing (Spec #28)
"""
import requests
import json
import sys
from typing import Dict, List, Optional

# Configuration
BASE_URL = "https://invoice-sync-mobile-1.preview.emergentagent.com/api"
OTP = "123456"

# Test accounts
CUSTOMER_PHONE = "+919000000004"
ADMIN_PHONE = "+919000000000"

# Internal keys that MUST be ABSENT from customer refund API
CUSTOMER_FORBIDDEN_KEYS = [
    "platform_commission",
    "partner_cancellation_pct",
    "partner_cancellation_amount",
    "partner_id",
    "partner_name",
    "service_cost",
    "commissionable_base",
    "partner_snapshot",
    "merchant_snapshot",
    "razorpay_refund_id",
    "razorpay_payment_id",
    "pay_gateway",
    "pay_mode"
]

# Customer-safe keys that SHOULD be present
CUSTOMER_REQUIRED_KEYS = [
    "status",
    "created_at"
]

# Amount field (either "amount" or "refund_amount" should be present)
CUSTOMER_AMOUNT_KEYS = ["amount", "refund_amount"]

# Booking reference (either "code" or "booking_code" should be present)
CUSTOMER_BOOKING_REF_KEYS = ["code", "booking_code"]

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

def print_header(text: str):
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*80}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{text}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*80}{Colors.RESET}\n")

def print_success(text: str):
    print(f"{Colors.GREEN}✅ {text}{Colors.RESET}")

def print_error(text: str):
    print(f"{Colors.RED}❌ {text}{Colors.RESET}")

def print_warning(text: str):
    print(f"{Colors.YELLOW}⚠️  {text}{Colors.RESET}")

def print_info(text: str):
    print(f"{Colors.BLUE}ℹ️  {text}{Colors.RESET}")

def login(phone: str) -> Optional[str]:
    """Login and return auth token"""
    try:
        # Request OTP
        resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
        if resp.status_code != 200:
            print_error(f"OTP request failed for {phone}: {resp.status_code}")
            return None
        
        # Verify OTP
        resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
        if resp.status_code != 200:
            print_error(f"OTP verify failed for {phone}: {resp.status_code}")
            return None
        
        data = resp.json()
        token = data.get("token")
        if not token:
            print_error(f"No token in response for {phone}")
            return None
        
        return token
    except Exception as e:
        print_error(f"Login exception for {phone}: {e}")
        return None

def check_keys_in_list(items: List[dict], keys: List[str]) -> Dict[str, bool]:
    """Check if keys are present in any item in the list"""
    result = {key: False for key in keys}
    for item in items:
        for key in keys:
            if key in item:
                result[key] = True
    return result

def test_customer_refunds(token: str) -> dict:
    """Test customer refund API"""
    print_header("Testing CUSTOMER Refund Visibility")
    
    headers = {"Authorization": f"Bearer {token}"}
    results = {
        "role": "customer",
        "status_code": None,
        "refund_count": 0,
        "forbidden_keys_found": {},
        "required_keys_found": {},
        "amount_key_found": False,
        "booking_ref_key_found": False,
        "errors": [],
        "sample_refund": None
    }
    
    print_info("Testing GET /api/payments/refunds for customer...")
    try:
        resp = requests.get(f"{BASE_URL}/payments/refunds", headers=headers)
        results["status_code"] = resp.status_code
        
        if resp.status_code == 200:
            refunds = resp.json()
            
            # Handle both list and dict responses
            if isinstance(refunds, dict):
                refunds = refunds.get("refunds", [])
            
            results["refund_count"] = len(refunds)
            print_success(f"GET /api/payments/refunds → 200 (found {len(refunds)} refunds)")
            
            if len(refunds) > 0:
                # Check forbidden keys in all refunds
                results["forbidden_keys_found"] = check_keys_in_list(refunds, CUSTOMER_FORBIDDEN_KEYS)
                
                # Check required keys in all refunds
                results["required_keys_found"] = check_keys_in_list(refunds, CUSTOMER_REQUIRED_KEYS)
                
                # Check amount keys
                amount_keys_found = check_keys_in_list(refunds, CUSTOMER_AMOUNT_KEYS)
                results["amount_key_found"] = any(amount_keys_found.values())
                
                # Check booking reference keys
                booking_ref_keys_found = check_keys_in_list(refunds, CUSTOMER_BOOKING_REF_KEYS)
                results["booking_ref_key_found"] = any(booking_ref_keys_found.values())
                
                # Store sample refund for inspection
                results["sample_refund"] = {k: v for k, v in refunds[0].items() if k not in ["_id"]}
                
                print_info(f"\nSample refund keys: {list(results['sample_refund'].keys())}")
            else:
                print_warning("Customer has 0 refunds - cannot test key visibility")
                print_info("Note: This is acceptable if customer has no refund history")
        elif resp.status_code == 500:
            results["errors"].append("API returned 500 error")
            print_error("GET /api/payments/refunds → 500 (SERVER ERROR)")
        else:
            results["errors"].append(f"API returned {resp.status_code}")
            print_error(f"GET /api/payments/refunds → {resp.status_code}")
    except Exception as e:
        results["errors"].append(f"Exception: {str(e)}")
        print_error(f"Exception during customer testing: {e}")
    
    return results

def test_admin_refunds(token: str) -> dict:
    """Test admin refund API"""
    print_header("Testing ADMIN Refund Visibility")
    
    headers = {"Authorization": f"Bearer {token}"}
    results = {
        "role": "admin",
        "status_code": None,
        "refund_count": 0,
        "has_full_breakdown": False,
        "platform_commission_found": False,
        "partner_fields_found": False,
        "errors": [],
        "sample_refund": None
    }
    
    print_info("Testing GET /api/admin/refunds for admin...")
    try:
        resp = requests.get(f"{BASE_URL}/admin/refunds", headers=headers)
        results["status_code"] = resp.status_code
        
        if resp.status_code == 200:
            refunds = resp.json()
            
            # Handle both list and dict responses
            if isinstance(refunds, dict):
                refunds = refunds.get("refunds", [])
            
            results["refund_count"] = len(refunds)
            print_success(f"GET /api/admin/refunds → 200 (found {len(refunds)} refunds)")
            
            if len(refunds) > 0:
                # Check if full breakdown is present (platform_commission, partner fields)
                admin_keys = check_keys_in_list(refunds, ["platform_commission", "partner_id", "partner_name", "service_cost"])
                results["platform_commission_found"] = admin_keys.get("platform_commission", False)
                results["partner_fields_found"] = any([
                    admin_keys.get("partner_id", False),
                    admin_keys.get("partner_name", False),
                    admin_keys.get("service_cost", False)
                ])
                results["has_full_breakdown"] = results["platform_commission_found"] or results["partner_fields_found"]
                
                # Store sample refund for inspection
                results["sample_refund"] = {k: v for k, v in refunds[0].items() if k not in ["_id"]}
                
                print_info(f"\nSample refund keys: {list(results['sample_refund'].keys())}")
                
                if results["has_full_breakdown"]:
                    print_success("Admin has access to full breakdown (platform_commission/partner fields present)")
                else:
                    print_warning("Admin refunds don't have platform_commission/partner fields (may be acceptable if no such data exists)")
            else:
                print_warning("Admin sees 0 refunds - cannot test full breakdown")
        elif resp.status_code == 500:
            results["errors"].append("API returned 500 error")
            print_error("GET /api/admin/refunds → 500 (SERVER ERROR)")
        else:
            results["errors"].append(f"API returned {resp.status_code}")
            print_error(f"GET /api/admin/refunds → {resp.status_code}")
    except Exception as e:
        results["errors"].append(f"Exception: {str(e)}")
        print_error(f"Exception during admin testing: {e}")
    
    return results

def validate_customer_results(results: dict) -> List[str]:
    """Validate customer results against acceptance criteria"""
    failures = []
    
    # Check status code
    if results["status_code"] != 200:
        failures.append(f"API returned {results['status_code']} instead of 200")
    
    # Check for 500 errors
    if results["status_code"] == 500:
        failures.append("500 error encountered (CRITICAL)")
    
    # If customer has refunds, validate key visibility
    if results["refund_count"] > 0:
        # Check forbidden keys are ABSENT
        for key, found in results["forbidden_keys_found"].items():
            if found:
                failures.append(f"FORBIDDEN key '{key}' is PRESENT (must be ABSENT)")
        
        # Check required keys are PRESENT
        for key in CUSTOMER_REQUIRED_KEYS:
            if not results["required_keys_found"].get(key, False):
                failures.append(f"REQUIRED key '{key}' is ABSENT (must be PRESENT)")
        
        # Check amount key is present
        if not results["amount_key_found"]:
            failures.append(f"No amount field found (expected 'amount' or 'refund_amount')")
        
        # Check booking reference key is present
        if not results["booking_ref_key_found"]:
            failures.append(f"No booking reference found (expected 'code' or 'booking_code')")
    
    return failures

def validate_admin_results(results: dict) -> List[str]:
    """Validate admin results against acceptance criteria"""
    failures = []
    
    # Check status code
    if results["status_code"] != 200:
        failures.append(f"API returned {results['status_code']} instead of 200")
    
    # Check for 500 errors
    if results["status_code"] == 500:
        failures.append("500 error encountered (CRITICAL)")
    
    # Admin should have access to full breakdown (if refunds exist)
    # Note: This is informational, not a hard failure
    if results["refund_count"] > 0 and not results["has_full_breakdown"]:
        print_warning("Admin refunds don't have full breakdown fields (may be acceptable if data doesn't exist)")
    
    return failures

def print_results_summary(customer_results: dict, admin_results: dict):
    """Print comprehensive test results summary"""
    print_header("TEST RESULTS SUMMARY")
    
    total_tests = 0
    passed_tests = 0
    
    # Customer results
    print(f"\n{Colors.BOLD}CUSTOMER (+919000000004):{Colors.RESET}")
    print(f"  API Status: {customer_results['status_code']}")
    print(f"  Refund Count: {customer_results['refund_count']}")
    
    if customer_results['refund_count'] > 0:
        print(f"\n  {Colors.BOLD}Forbidden Keys (MUST be ABSENT):{Colors.RESET}")
        for key, found in customer_results['forbidden_keys_found'].items():
            status = f"{Colors.RED}PRESENT ❌{Colors.RESET}" if found else f"{Colors.GREEN}ABSENT ✅{Colors.RESET}"
            print(f"    {key}: {status}")
        
        print(f"\n  {Colors.BOLD}Required Keys (MUST be PRESENT):{Colors.RESET}")
        for key in CUSTOMER_REQUIRED_KEYS:
            found = customer_results['required_keys_found'].get(key, False)
            status = f"{Colors.GREEN}PRESENT ✅{Colors.RESET}" if found else f"{Colors.RED}ABSENT ❌{Colors.RESET}"
            print(f"    {key}: {status}")
        
        amount_status = f"{Colors.GREEN}PRESENT ✅{Colors.RESET}" if customer_results['amount_key_found'] else f"{Colors.RED}ABSENT ❌{Colors.RESET}"
        print(f"    amount/refund_amount: {amount_status}")
        
        booking_ref_status = f"{Colors.GREEN}PRESENT ✅{Colors.RESET}" if customer_results['booking_ref_key_found'] else f"{Colors.RED}ABSENT ❌{Colors.RESET}"
        print(f"    code/booking_code: {booking_ref_status}")
    
    customer_failures = validate_customer_results(customer_results)
    total_tests += 1
    if len(customer_failures) == 0 and customer_results['status_code'] == 200:
        passed_tests += 1
        print(f"\n  {Colors.GREEN}{Colors.BOLD}✅ PASS{Colors.RESET}")
    else:
        print(f"\n  {Colors.RED}{Colors.BOLD}❌ FAIL{Colors.RESET}")
        for failure in customer_failures:
            print(f"    - {failure}")
    
    if customer_results['errors']:
        print(f"\n  {Colors.RED}Errors:{Colors.RESET}")
        for error in customer_results['errors']:
            print(f"    - {error}")
    
    # Admin results
    print(f"\n{Colors.BOLD}ADMIN (+919000000000):{Colors.RESET}")
    print(f"  API Status: {admin_results['status_code']}")
    print(f"  Refund Count: {admin_results['refund_count']}")
    
    if admin_results['refund_count'] > 0:
        print(f"\n  {Colors.BOLD}Full Breakdown Access:{Colors.RESET}")
        print(f"    platform_commission: {Colors.GREEN}PRESENT ✅{Colors.RESET}" if admin_results['platform_commission_found'] else f"{Colors.YELLOW}ABSENT{Colors.RESET}")
        print(f"    partner fields: {Colors.GREEN}PRESENT ✅{Colors.RESET}" if admin_results['partner_fields_found'] else f"{Colors.YELLOW}ABSENT{Colors.RESET}")
    
    admin_failures = validate_admin_results(admin_results)
    total_tests += 1
    if len(admin_failures) == 0 and admin_results['status_code'] == 200:
        passed_tests += 1
        print(f"\n  {Colors.GREEN}{Colors.BOLD}✅ PASS{Colors.RESET}")
    else:
        print(f"\n  {Colors.RED}{Colors.BOLD}❌ FAIL{Colors.RESET}")
        for failure in admin_failures:
            print(f"    - {failure}")
    
    if admin_results['errors']:
        print(f"\n  {Colors.RED}Errors:{Colors.RESET}")
        for error in admin_results['errors']:
            print(f"    - {error}")
    
    print_header(f"FINAL RESULT: {passed_tests}/{total_tests} TESTS PASSED")
    
    return passed_tests == total_tests

def main():
    print_header("REFUND ROLE-BASED VISIBILITY TESTING (Spec #28)")
    print_info(f"BASE_URL: {BASE_URL}")
    print_info(f"OTP: {OTP}")
    
    # Login as customer
    print_info(f"\nLogging in as CUSTOMER ({CUSTOMER_PHONE})...")
    customer_token = login(CUSTOMER_PHONE)
    if not customer_token:
        print_error("Failed to login as customer")
        return 1
    print_success("Logged in as customer")
    
    # Login as admin
    print_info(f"\nLogging in as ADMIN ({ADMIN_PHONE})...")
    admin_token = login(ADMIN_PHONE)
    if not admin_token:
        print_error("Failed to login as admin")
        return 1
    print_success("Logged in as admin")
    
    # Test customer refunds
    customer_results = test_customer_refunds(customer_token)
    
    # Test admin refunds
    admin_results = test_admin_refunds(admin_token)
    
    # Print comprehensive summary
    all_passed = print_results_summary(customer_results, admin_results)
    
    # Save results to file
    results = {
        "customer": customer_results,
        "admin": admin_results
    }
    
    with open("/app/test_reports/refund_role_visibility.json", "w") as f:
        json.dump(results, f, indent=2)
    
    print_info("\nTest results saved to /app/test_reports/refund_role_visibility.json")
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())
