#!/usr/bin/env python3
"""
Backend test for Physical QR mapping-lock feature.
Tests that agents cannot re-map already-mapped QRs, but admins can reassign.
"""

import requests
import json
import sys
from typing import Dict, Any, Optional

# Base URL from frontend/.env
BASE_URL = "https://mobile-invoice-tools.preview.emergentagent.com/api"

# Test credentials
ADMIN_PHONE = "+919000000000"
AGENT_RAVI_PHONE = "+919000000201"  # Patna batch, prefix PAT*
AGENT_SITA_PHONE = "+919000000202"  # Ranchi batch, prefix RAN*
MERCHANT_PHONE = "+919000000002"  # Sharma Electricals, code 3L6MKM3
OTP = "123456"

# Test results
test_results = {
    "total": 0,
    "passed": 0,
    "failed": 0,
    "tests": []
}

def log_test(name: str, passed: bool, details: str = ""):
    """Log test result"""
    test_results["total"] += 1
    if passed:
        test_results["passed"] += 1
        print(f"✅ {name}")
    else:
        test_results["failed"] += 1
        print(f"❌ {name}")
    
    if details:
        print(f"   {details}")
    
    test_results["tests"].append({
        "name": name,
        "passed": passed,
        "details": details
    })

def verify_otp_login(phone: str) -> Optional[str]:
    """Login with phone and OTP, return token"""
    try:
        response = requests.post(
            f"{BASE_URL}/auth/verify-otp",
            json={"phone": phone, "otp": OTP},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("token")
            user = data.get("user", {})
            print(f"✓ Logged in as {user.get('name', phone)} (role: {user.get('role', 'unknown')})")
            return token
        else:
            print(f"✗ Login failed for {phone}: {response.status_code} {response.text}")
            return None
    except Exception as e:
        print(f"✗ Login error for {phone}: {e}")
        return None

def get_headers(token: str) -> Dict[str, str]:
    """Get authorization headers"""
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

def main():
    print("=" * 80)
    print("PHYSICAL QR MAPPING-LOCK FEATURE TEST")
    print("=" * 80)
    print()
    
    # ========== SETUP: Login all users ==========
    print("SETUP: Logging in users...")
    print("-" * 80)
    
    admin_token = verify_otp_login(ADMIN_PHONE)
    if not admin_token:
        print("FATAL: Admin login failed")
        sys.exit(1)
    
    agent_ravi_token = verify_otp_login(AGENT_RAVI_PHONE)
    if not agent_ravi_token:
        print("FATAL: Agent Ravi login failed")
        sys.exit(1)
    
    agent_sita_token = verify_otp_login(AGENT_SITA_PHONE)
    if not agent_sita_token:
        print("FATAL: Agent Sita login failed")
        sys.exit(1)
    
    print()
    
    # ========== STEP 1: As ADMIN, find UNASSIGNED PAT token and get merchant codes ==========
    print("STEP 1: As ADMIN, find UNASSIGNED PAT token and get merchant codes")
    print("-" * 80)
    
    # Find unassigned PAT token
    try:
        response = requests.get(
            f"{BASE_URL}/admin/physical-qr",
            headers=get_headers(admin_token),
            params={"status": "unassigned", "q": "PAT"},
            timeout=10
        )
        
        log_test(
            "STEP 1.1: GET /admin/physical-qr?status=unassigned&q=PAT",
            response.status_code == 200,
            f"Status: {response.status_code}"
        )
        
        if response.status_code != 200:
            print(f"FATAL: Failed to get unassigned PAT tokens: {response.text}")
            sys.exit(1)
        
        data = response.json()
        items = data.get("items", [])
        
        if not items:
            print("FATAL: No unassigned PAT tokens found")
            sys.exit(1)
        
        T1 = items[0]["token"]
        print(f"✓ Found unassigned PAT token T1: {T1}")
        
        log_test(
            "STEP 1.2: Found unassigned PAT token T1",
            True,
            f"Token: {T1}"
        )
        
    except Exception as e:
        print(f"FATAL: Error finding unassigned token: {e}")
        sys.exit(1)
    
    # Get merchant codes
    try:
        response = requests.get(
            f"{BASE_URL}/admin/physical-qr/merchant-search",
            headers=get_headers(admin_token),
            params={"q": ""},
            timeout=10
        )
        
        log_test(
            "STEP 1.3: GET /admin/physical-qr/merchant-search?q=",
            response.status_code == 200,
            f"Status: {response.status_code}"
        )
        
        if response.status_code != 200:
            print(f"FATAL: Failed to search merchants: {response.text}")
            sys.exit(1)
        
        data = response.json()
        merchants = data.get("merchants", [])
        
        if len(merchants) < 2:
            print(f"FATAL: Need at least 2 merchants, found {len(merchants)}")
            sys.exit(1)
        
        M1_code = merchants[0]["merchant_code"]
        M1_id = merchants[0]["id"]
        M2_code = merchants[1]["merchant_code"]
        M2_id = merchants[1]["id"]
        
        print(f"✓ Found merchant M1: {merchants[0]['shop_name']} (code: {M1_code}, id: {M1_id})")
        print(f"✓ Found merchant M2: {merchants[1]['shop_name']} (code: {M2_code}, id: {M2_id})")
        
        log_test(
            "STEP 1.4: Found two different merchant codes M1 and M2",
            M1_code != M2_code,
            f"M1: {M1_code}, M2: {M2_code}"
        )
        
    except Exception as e:
        print(f"FATAL: Error searching merchants: {e}")
        sys.exit(1)
    
    print()
    
    # ========== STEP 2: As AGENT Ravi, assign T1 to M1 (first map) ==========
    print("STEP 2: As AGENT Ravi, assign T1 to M1 (first map - should succeed)")
    print("-" * 80)
    
    try:
        response = requests.post(
            f"{BASE_URL}/admin/physical-qr/{T1}/assign",
            headers=get_headers(agent_ravi_token),
            json={"merchant_code": M1_code},
            timeout=10
        )
        
        log_test(
            "STEP 2.1: POST /admin/physical-qr/{T1}/assign with M1 as AGENT Ravi",
            response.status_code == 200,
            f"Status: {response.status_code}"
        )
        
        if response.status_code != 200:
            print(f"FATAL: First assignment failed: {response.text}")
            sys.exit(1)
        
        data = response.json()
        qr = data.get("qr", {})
        
        log_test(
            "STEP 2.2: Response has qr object",
            "qr" in data,
            f"Keys: {list(data.keys())}"
        )
        
        log_test(
            "STEP 2.3: qr.status == 'active'",
            qr.get("status") == "active",
            f"Status: {qr.get('status')}"
        )
        
        log_test(
            "STEP 2.4: qr.merchant_code == M1",
            qr.get("merchant_code") == M1_code,
            f"Merchant code: {qr.get('merchant_code')}"
        )
        
        print(f"✓ First assignment successful: T1 → M1 ({M1_code})")
        
    except Exception as e:
        print(f"FATAL: Error in first assignment: {e}")
        sys.exit(1)
    
    print()
    
    # ========== STEP 3: As AGENT Ravi, try to reassign T1 to M2 (should fail with 409) ==========
    print("STEP 3: As AGENT Ravi, try to reassign T1 to M2 (KEY TEST - should fail with 409)")
    print("-" * 80)
    
    try:
        response = requests.post(
            f"{BASE_URL}/admin/physical-qr/{T1}/assign",
            headers=get_headers(agent_ravi_token),
            json={"merchant_code": M2_code},
            timeout=10
        )
        
        log_test(
            "STEP 3.1: POST /admin/physical-qr/{T1}/assign with M2 as AGENT Ravi → 409",
            response.status_code == 409,
            f"Status: {response.status_code} (expected 409)"
        )
        
        if response.status_code == 409:
            data = response.json()
            detail = data.get("detail", "")
            
            log_test(
                "STEP 3.2: Response detail contains 'already mapped'",
                "already mapped" in detail.lower(),
                f"Detail: {detail}"
            )
            
            print(f"✓ Agent correctly blocked from re-mapping: {detail}")
        else:
            print(f"✗ CRITICAL: Agent was able to re-map (status {response.status_code})")
            print(f"   Response: {response.text}")
        
    except Exception as e:
        print(f"ERROR: Error in agent re-map attempt: {e}")
        log_test("STEP 3.1: POST /admin/physical-qr/{T1}/assign with M2 as AGENT Ravi → 409", False, str(e))
    
    print()
    
    # ========== STEP 3b: As AGENT Sita, try to access T1 (should fail with 403 - not in her batch) ==========
    print("STEP 3b: As AGENT Sita (different agent from different batch), try to access T1")
    print("-" * 80)
    
    try:
        response = requests.post(
            f"{BASE_URL}/admin/physical-qr/{T1}/assign",
            headers=get_headers(agent_sita_token),
            json={"merchant_code": M2_code},
            timeout=10
        )
        
        log_test(
            "STEP 3b.1: POST /admin/physical-qr/{T1}/assign as AGENT Sita → 403 (not in her batch)",
            response.status_code == 403,
            f"Status: {response.status_code} (expected 403 - batch scoping)"
        )
        
        if response.status_code == 403:
            data = response.json()
            detail = data.get("detail", "")
            
            log_test(
                "STEP 3b.2: Response detail contains 'not in your assigned batches'",
                "not in your assigned batches" in detail.lower(),
                f"Detail: {detail}"
            )
            
            print(f"✓ Agent Sita correctly blocked by batch scoping: {detail}")
        else:
            print(f"✗ CRITICAL: Agent Sita was able to access QR from another batch (status {response.status_code})")
            print(f"   Response: {response.text}")
        
    except Exception as e:
        print(f"ERROR: Error in different agent access attempt: {e}")
        log_test("STEP 3b.1: POST /admin/physical-qr/{T1}/assign as AGENT Sita → 403 (not in her batch)", False, str(e))
    
    print()
    
    # ========== STEP 4: As ADMIN, reassign T1 to M2 (should succeed) ==========
    print("STEP 4: As ADMIN, reassign T1 to M2 (admin CAN reassign - should succeed)")
    print("-" * 80)
    
    try:
        response = requests.post(
            f"{BASE_URL}/admin/physical-qr/{T1}/assign",
            headers=get_headers(admin_token),
            json={"merchant_code": M2_code},
            timeout=10
        )
        
        log_test(
            "STEP 4.1: POST /admin/physical-qr/{T1}/assign with M2 as ADMIN → 200",
            response.status_code == 200,
            f"Status: {response.status_code}"
        )
        
        if response.status_code != 200:
            print(f"✗ CRITICAL: Admin reassignment failed: {response.text}")
        else:
            data = response.json()
            
            log_test(
                "STEP 4.2: Response has reassigned == true",
                data.get("reassigned") == True,
                f"reassigned: {data.get('reassigned')}"
            )
            
            qr = data.get("qr", {})
            log_test(
                "STEP 4.3: qr.merchant_code == M2 (updated)",
                qr.get("merchant_code") == M2_code,
                f"Merchant code: {qr.get('merchant_code')}"
            )
            
            print(f"✓ Admin reassignment successful: T1 → M2 ({M2_code})")
        
    except Exception as e:
        print(f"ERROR: Error in admin reassignment: {e}")
        log_test("STEP 4.1: POST /admin/physical-qr/{T1}/assign with M2 as ADMIN → 200", False, str(e))
    
    print()
    
    # ========== STEP 5: As AGENT Ravi, find another UNASSIGNED PAT token T2 and assign to M1 ==========
    print("STEP 5: REGRESSION - As AGENT Ravi, find another UNASSIGNED PAT token T2 and assign to M1")
    print("-" * 80)
    
    try:
        # Find another unassigned PAT token
        response = requests.get(
            f"{BASE_URL}/admin/physical-qr",
            headers=get_headers(admin_token),
            params={"status": "unassigned", "q": "PAT"},
            timeout=10
        )
        
        if response.status_code != 200:
            print(f"ERROR: Failed to get unassigned PAT tokens: {response.text}")
            log_test("STEP 5.1: Find another unassigned PAT token T2", False, f"Status: {response.status_code}")
        else:
            data = response.json()
            items = data.get("items", [])
            
            if not items:
                print("WARNING: No more unassigned PAT tokens found for regression test")
                log_test("STEP 5.1: Find another unassigned PAT token T2", False, "No unassigned tokens")
            else:
                T2 = items[0]["token"]
                print(f"✓ Found another unassigned PAT token T2: {T2}")
                
                log_test(
                    "STEP 5.1: Found another unassigned PAT token T2",
                    True,
                    f"Token: {T2}"
                )
                
                # Try to assign T2 to M1 as Agent Ravi
                response = requests.post(
                    f"{BASE_URL}/admin/physical-qr/{T2}/assign",
                    headers=get_headers(agent_ravi_token),
                    json={"merchant_code": M1_code},
                    timeout=10
                )
                
                log_test(
                    "STEP 5.2: POST /admin/physical-qr/{T2}/assign with M1 as AGENT Ravi → 200",
                    response.status_code == 200,
                    f"Status: {response.status_code}"
                )
                
                if response.status_code == 200:
                    print(f"✓ Fresh assignment still works: T2 → M1 ({M1_code})")
                else:
                    print(f"✗ Fresh assignment failed: {response.text}")
        
    except Exception as e:
        print(f"ERROR: Error in regression test: {e}")
        log_test("STEP 5.1: Find another unassigned PAT token T2", False, str(e))
    
    print()
    
    # ========== SUMMARY ==========
    print("=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Total tests: {test_results['total']}")
    print(f"Passed: {test_results['passed']} ✅")
    print(f"Failed: {test_results['failed']} ❌")
    print(f"Success rate: {test_results['passed'] / test_results['total'] * 100:.1f}%")
    print()
    
    # Save results to JSON
    with open("/app/test_results_qr_lock.json", "w") as f:
        json.dump(test_results, f, indent=2)
    
    print("Results saved to /app/test_results_qr_lock.json")
    print()
    
    # Exit with appropriate code
    if test_results['failed'] > 0:
        print("❌ SOME TESTS FAILED")
        sys.exit(1)
    else:
        print("✅ ALL TESTS PASSED")
        sys.exit(0)

if __name__ == "__main__":
    main()
