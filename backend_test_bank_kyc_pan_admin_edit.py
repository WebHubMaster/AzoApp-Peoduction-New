#!/usr/bin/env python3
"""
Backend test script for Bank & KYC unmasking + PAN lock + Admin edit wizard proxy.
Tests 3 newly changed areas as per review request.
"""
import requests
import json
import sys
import time
from typing import Dict, Any, Optional

# Base URL from frontend/.env
BASE_URL = "https://expo-troubleshoot-5.preview.emergentagent.com/api"

# Test credentials from test_credentials.md
ADMIN_PHONE = "+919000000000"
OTP = "123456"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    END = '\033[0m'

def log(msg: str, color: str = ""):
    print(f"{color}{msg}{Colors.END}" if color else msg)

def admin_login() -> str:
    """Admin login and return token."""
    log("\n=== ADMIN LOGIN ===", Colors.BLUE)
    
    # Send OTP
    res = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": ADMIN_PHONE})
    if res.status_code != 200:
        log(f"❌ Send OTP failed: {res.status_code} {res.text}", Colors.RED)
        sys.exit(1)
    log(f"✅ OTP sent to {ADMIN_PHONE}")
    
    # Verify OTP
    res = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": ADMIN_PHONE, "otp": OTP})
    if res.status_code != 200:
        log(f"❌ Verify OTP failed: {res.status_code} {res.text}", Colors.RED)
        sys.exit(1)
    
    data = res.json()
    token = data.get("token")
    if not token:
        log(f"❌ No token in response: {data}", Colors.RED)
        sys.exit(1)
    
    log(f"✅ Admin logged in successfully (role: {data.get('user', {}).get('role')})")
    return token

def partner_login(phone: str) -> str:
    """Partner login and return token."""
    log(f"\n=== PARTNER LOGIN ({phone}) ===", Colors.BLUE)
    
    # Send OTP
    res = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if res.status_code != 200:
        log(f"❌ Send OTP failed: {res.status_code} {res.text}", Colors.RED)
        sys.exit(1)
    log(f"✅ OTP sent to {phone}")
    
    # Verify OTP
    res = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    if res.status_code != 200:
        log(f"❌ Verify OTP failed: {res.status_code} {res.text}", Colors.RED)
        sys.exit(1)
    
    data = res.json()
    token = data.get("token")
    if not token:
        log(f"❌ No token in response: {data}", Colors.RED)
        sys.exit(1)
    
    log(f"✅ Partner logged in successfully")
    return token

def get_headers(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def find_partner_with_bank_pan(token: str) -> Optional[str]:
    """Find a partner with bank/pan data (seeded by seed_partner_bank_demo)."""
    log("\n=== FINDING PARTNER WITH BANK/PAN DATA ===", Colors.BLUE)
    headers = get_headers(token)
    
    # Get list of partners
    res = requests.get(f"{BASE_URL}/admin/people/partner?page_size=50", headers=headers)
    if res.status_code != 200:
        log(f"❌ Get partners failed: {res.status_code} {res.text}", Colors.RED)
        return None
    
    data = res.json()
    partners = data.get("items", [])
    log(f"Found {len(partners)} partners total")
    
    # Try each partner to find one with bank/pan data
    for partner in partners:
        uid = partner.get("id")
        name = partner.get("name", "Unknown")
        
        # Check bank section
        res = requests.get(f"{BASE_URL}/admin/people/partner/{uid}/sections/bank", headers=headers)
        if res.status_code == 200:
            bank_data = res.json()
            banks = bank_data.get("banks", [])
            pan = bank_data.get("pan")
            
            if banks and pan:
                log(f"✅ Found partner with bank/pan: {name} (UID: {uid})")
                log(f"   Banks: {len(banks)}, PAN: {pan.get('pan_number', 'N/A')[:4]}...")
                return uid
    
    log(f"⚠️  No partner with bank/pan data found in first 50", Colors.YELLOW)
    return None

# ============================================================================
# TASK 1: Bank & KYC tab UNMASKING + viewable docs
# ============================================================================

def test_task1_bank_kyc_unmasking(token: str, partner_uid: str) -> bool:
    """
    TASK 1 — Bank & KYC tab UNMASKING + viewable docs
    Verify:
    - banks[].account_number is FULL (no '•' masking)
    - pan.pan_number is FULL (no '•')
    - upi (if present) NOT masked
    - response includes pan_documents[] and bank_documents[]
    - banks[].passbook_url is a real url (NOT '[document on file]')
    - NO '•' character anywhere in bank section JSON
    - KYC section documents[].value not masked
    """
    log("\n" + "="*80, Colors.CYAN)
    log("TASK 1: Bank & KYC tab UNMASKING + viewable docs", Colors.CYAN)
    log("="*80, Colors.CYAN)
    
    headers = get_headers(token)
    passed = True
    
    # Test 1a: GET bank section
    log("\n--- Test 1a: GET /api/admin/people/partner/{uid}/sections/bank ---", Colors.BLUE)
    res = requests.get(f"{BASE_URL}/admin/people/partner/{partner_uid}/sections/bank", headers=headers)
    
    if res.status_code != 200:
        log(f"❌ FAIL: Expected 200, got {res.status_code}: {res.text}", Colors.RED)
        return False
    
    log(f"✅ Status: 200")
    bank_data = res.json()
    bank_json = json.dumps(bank_data, indent=2)
    
    # Check for masking character '•' anywhere in JSON
    if '•' in bank_json:
        log(f"❌ FAIL: Found masking character '•' in bank section JSON", Colors.RED)
        log(f"   JSON preview: {bank_json[:500]}...", Colors.YELLOW)
        passed = False
    else:
        log(f"✅ NO masking character '•' found in bank section JSON")
    
    # Check banks array
    banks = bank_data.get("banks", [])
    log(f"\nBanks count: {len(banks)}")
    
    if not banks:
        log(f"⚠️  No banks found for this partner", Colors.YELLOW)
    else:
        for i, bank in enumerate(banks):
            log(f"\n  Bank {i+1}:")
            
            # Check account_number is FULL (not masked)
            acc_num = bank.get("account_number", "")
            if '•' in str(acc_num):
                log(f"    ❌ FAIL: account_number is MASKED: {acc_num}", Colors.RED)
                passed = False
            else:
                log(f"    ✅ account_number is FULL (unmasked): {acc_num}")
            
            # Check passbook_url is a real URL (not '[document on file]')
            passbook_url = bank.get("passbook_url", "")
            if passbook_url == "[document on file]":
                log(f"    ❌ FAIL: passbook_url is literal '[document on file]'", Colors.RED)
                passed = False
            elif passbook_url:
                log(f"    ✅ passbook_url is a real URL: {passbook_url[:50]}...")
            else:
                log(f"    ⚠️  passbook_url is empty", Colors.YELLOW)
    
    # Check PAN
    pan = bank_data.get("pan")
    log(f"\nPAN present: {pan is not None}")
    
    if pan:
        pan_number = pan.get("pan_number", "")
        if '•' in str(pan_number):
            log(f"  ❌ FAIL: pan_number is MASKED: {pan_number}", Colors.RED)
            passed = False
        else:
            log(f"  ✅ pan_number is FULL (unmasked): {pan_number}")
    else:
        log(f"  ⚠️  No PAN found for this partner", Colors.YELLOW)
    
    # Check UPI
    upi = bank_data.get("upi")
    if upi:
        if '•' in str(upi):
            log(f"  ❌ FAIL: upi is MASKED: {upi}", Colors.RED)
            passed = False
        else:
            log(f"  ✅ upi is NOT masked: {upi}")
    
    # Check pan_documents array
    pan_documents = bank_data.get("pan_documents", [])
    log(f"\npan_documents count: {len(pan_documents)}")
    if pan and not pan_documents:
        log(f"  ⚠️  PAN exists but pan_documents[] is empty (may be OK if no pan_url)", Colors.YELLOW)
    elif pan_documents:
        log(f"  ✅ pan_documents[] present with {len(pan_documents)} items")
        for doc in pan_documents:
            log(f"    - {doc.get('label')}: {doc.get('url', '')[:50]}... (kind: {doc.get('kind')})")
    
    # Check bank_documents array
    bank_documents = bank_data.get("bank_documents", [])
    log(f"\nbank_documents count: {len(bank_documents)}")
    if banks and not bank_documents:
        log(f"  ⚠️  Banks exist but bank_documents[] is empty (may be OK if no passbook_url)", Colors.YELLOW)
    elif bank_documents:
        log(f"  ✅ bank_documents[] present with {len(bank_documents)} items")
        for doc in bank_documents:
            log(f"    - {doc.get('label')}: {doc.get('url', '')[:50]}... (kind: {doc.get('kind')})")
    
    # Test 1b: GET KYC section
    log("\n--- Test 1b: GET /api/admin/people/partner/{uid}/sections/kyc ---", Colors.BLUE)
    res = requests.get(f"{BASE_URL}/admin/people/partner/{partner_uid}/sections/kyc", headers=headers)
    
    if res.status_code != 200:
        log(f"❌ FAIL: Expected 200, got {res.status_code}: {res.text}", Colors.RED)
        return False
    
    log(f"✅ Status: 200")
    kyc_data = res.json()
    kyc_json = json.dumps(kyc_data, indent=2)
    
    # Check for masking character '•' anywhere in KYC JSON
    if '•' in kyc_json:
        log(f"❌ FAIL: Found masking character '•' in KYC section JSON", Colors.RED)
        log(f"   JSON preview: {kyc_json[:500]}...", Colors.YELLOW)
        passed = False
    else:
        log(f"✅ NO masking character '•' found in KYC section JSON")
    
    # Check documents array
    documents = kyc_data.get("documents", [])
    log(f"\nKYC documents count: {len(documents)}")
    if documents:
        for doc in documents:
            value = doc.get("value", "")
            if '•' in str(value):
                log(f"  ❌ FAIL: document value is MASKED: {doc.get('type')}: {value}", Colors.RED)
                passed = False
    
    # Check kyc object
    kyc_obj = kyc_data.get("kyc")
    if kyc_obj:
        kyc_obj_json = json.dumps(kyc_obj)
        if '•' in kyc_obj_json:
            log(f"  ❌ FAIL: kyc object contains masking character '•'", Colors.RED)
            passed = False
        else:
            log(f"  ✅ kyc object is NOT masked")
    
    if passed:
        log(f"\n{'='*80}", Colors.GREEN)
        log(f"✅ TASK 1 PASSED: Bank & KYC sections return UNMASKED data", Colors.GREEN)
        log(f"{'='*80}", Colors.GREEN)
    else:
        log(f"\n{'='*80}", Colors.RED)
        log(f"❌ TASK 1 FAILED: Found masking issues", Colors.RED)
        log(f"{'='*80}", Colors.RED)
    
    return passed

# ============================================================================
# TASK 2: PAN one-only + lock-until-rejected
# ============================================================================

def test_task2_pan_lock(token: str) -> bool:
    """
    TASK 2 — PAN one-only + lock-until-rejected
    Verify:
    - Partner can submit PAN once
    - Second submission while pending returns 400 with lock message
    - If PAN already approved, submission returns 400 'already verified and locked'
    - Only ONE PAN record exists per partner
    """
    log("\n" + "="*80, Colors.CYAN)
    log("TASK 2: PAN one-only + lock-until-rejected", Colors.CYAN)
    log("="*80, Colors.CYAN)
    
    # We need to find a partner WITHOUT an approved PAN
    # Let's use Raj Kumar from test_credentials.md
    # Raj Kumar +919000000003 (AC, Patna 800001)
    
    test_partner_phone = "+919000000003"
    log(f"\nUsing test partner: {test_partner_phone} (Raj Kumar)")
    
    # Login as partner
    partner_token = partner_login(test_partner_phone)
    partner_headers = get_headers(partner_token)
    
    passed = True
    
    # Check current PAN status
    log("\n--- Checking current PAN status ---", Colors.BLUE)
    res = requests.get(f"{BASE_URL}/partner/finance-kyc", headers=partner_headers)
    if res.status_code == 200:
        finance_data = res.json()
        pan = finance_data.get("pan")
        if pan:
            pan_status = pan.get("status")
            log(f"Current PAN status: {pan_status}")
            
            if pan_status == "approved":
                log(f"⚠️  PAN is already approved, testing 'already verified and locked' scenario", Colors.YELLOW)
                
                # Try to submit again
                log("\n--- Test 2a: Submit PAN when already approved ---", Colors.BLUE)
                res = requests.post(f"{BASE_URL}/partner/finance-kyc/pan", 
                                   json={"pan_number": "NEWPN1234Z", "pan_url": "/uploads/test_pan.png"},
                                   headers=partner_headers)
                
                if res.status_code == 400:
                    error_msg = res.json().get("detail", "")
                    if "already verified" in error_msg.lower() or "locked" in error_msg.lower():
                        log(f"✅ PASS: Got 400 with lock message: {error_msg}")
                    else:
                        log(f"❌ FAIL: Got 400 but wrong message: {error_msg}", Colors.RED)
                        passed = False
                else:
                    log(f"❌ FAIL: Expected 400, got {res.status_code}: {res.text}", Colors.RED)
                    passed = False
                
                # Skip further tests since PAN is already approved
                if passed:
                    log(f"\n{'='*80}", Colors.GREEN)
                    log(f"✅ TASK 2 PASSED: PAN lock working (already approved scenario)", Colors.GREEN)
                    log(f"{'='*80}", Colors.GREEN)
                else:
                    log(f"\n{'='*80}", Colors.RED)
                    log(f"❌ TASK 2 FAILED", Colors.RED)
                    log(f"{'='*80}", Colors.RED)
                
                return passed
            
            elif pan_status == "pending":
                log(f"⚠️  PAN is already pending, testing resubmission lock", Colors.YELLOW)
                
                # Try to submit again with different PAN
                log("\n--- Test 2b: Submit different PAN while pending ---", Colors.BLUE)
                res = requests.post(f"{BASE_URL}/partner/finance-kyc/pan",
                                   json={"pan_number": "ZYXWV9876K", "pan_url": "/uploads/test_pan2.png"},
                                   headers=partner_headers)
                
                if res.status_code == 400:
                    error_msg = res.json().get("detail", "")
                    if "under review" in error_msg.lower() or "already submitted" in error_msg.lower():
                        log(f"✅ PASS: Got 400 with lock message: {error_msg}")
                    else:
                        log(f"❌ FAIL: Got 400 but wrong message: {error_msg}", Colors.RED)
                        passed = False
                else:
                    log(f"❌ FAIL: Expected 400, got {res.status_code}: {res.text}", Colors.RED)
                    passed = False
                
                if passed:
                    log(f"\n{'='*80}", Colors.GREEN)
                    log(f"✅ TASK 2 PASSED: PAN lock working (pending scenario)", Colors.GREEN)
                    log(f"{'='*80}", Colors.GREEN)
                else:
                    log(f"\n{'='*80}", Colors.RED)
                    log(f"❌ TASK 2 FAILED", Colors.RED)
                    log(f"{'='*80}", Colors.RED)
                
                return passed
        else:
            log(f"No PAN found, partner can submit fresh")
    
    # If we reach here, partner has no PAN or PAN is rejected
    # Test fresh submission
    log("\n--- Test 2c: Submit PAN (first time or after rejection) ---", Colors.BLUE)
    res = requests.post(f"{BASE_URL}/partner/finance-kyc/pan",
                       json={"pan_number": "ABCDE1234F", "pan_url": "/uploads/test_pan.png"},
                       headers=partner_headers)
    
    if res.status_code == 200:
        log(f"✅ First PAN submission successful (status: pending)")
        pan_data = res.json()
        log(f"   PAN: {pan_data.get('pan_number')}, Status: {pan_data.get('status')}")
    else:
        log(f"❌ FAIL: First submission failed: {res.status_code} {res.text}", Colors.RED)
        passed = False
        return passed
    
    # Immediately try to submit again with different PAN
    log("\n--- Test 2d: Submit different PAN immediately (should be locked) ---", Colors.BLUE)
    res = requests.post(f"{BASE_URL}/partner/finance-kyc/pan",
                       json={"pan_number": "ZYXWV9876K", "pan_url": "/uploads/test_pan2.png"},
                       headers=partner_headers)
    
    if res.status_code == 400:
        error_msg = res.json().get("detail", "")
        if "under review" in error_msg.lower() or "already submitted" in error_msg.lower():
            log(f"✅ PASS: Got 400 with lock message: {error_msg}")
        else:
            log(f"❌ FAIL: Got 400 but wrong message: {error_msg}", Colors.RED)
            passed = False
    else:
        log(f"❌ FAIL: Expected 400, got {res.status_code}: {res.text}", Colors.RED)
        passed = False
    
    # Verify only ONE PAN record exists
    log("\n--- Test 2e: Verify only ONE PAN record exists ---", Colors.BLUE)
    res = requests.get(f"{BASE_URL}/partner/finance-kyc", headers=partner_headers)
    if res.status_code == 200:
        finance_data = res.json()
        pan = finance_data.get("pan")
        if pan and isinstance(pan, dict):
            log(f"✅ PASS: Single PAN object returned (not array)")
        elif isinstance(pan, list):
            log(f"❌ FAIL: PAN is an array with {len(pan)} items (should be single object)", Colors.RED)
            passed = False
        else:
            log(f"⚠️  No PAN object in response", Colors.YELLOW)
    
    if passed:
        log(f"\n{'='*80}", Colors.GREEN)
        log(f"✅ TASK 2 PASSED: PAN one-only + lock-until-rejected working", Colors.GREEN)
        log(f"{'='*80}", Colors.GREEN)
    else:
        log(f"\n{'='*80}", Colors.RED)
        log(f"❌ TASK 2 FAILED", Colors.RED)
        log(f"{'='*80}", Colors.RED)
    
    return passed

# ============================================================================
# TASK 3: Admin edit wizard proxy
# ============================================================================

def test_task3_admin_edit_wizard(token: str) -> bool:
    """
    TASK 3 — Admin edit wizard proxy
    Verify:
    - GET /api/admin/partners/{uid}/reg/profile returns profile with basic/work/documents/address
    - GET /api/admin/partners/{uid}/reg/meta returns educations/experiences/categories
    - PUT /api/admin/partners/{uid}/reg/basic with changed full_name persists
    - PUT /api/admin/partners/{uid}/reg/address with changed manual_address persists
    - Partner kyc_status stays 'approved' after edits (NOT forced to under_review)
    """
    log("\n" + "="*80, Colors.CYAN)
    log("TASK 3: Admin edit wizard proxy", Colors.CYAN)
    log("="*80, Colors.CYAN)
    
    headers = get_headers(token)
    passed = True
    
    # Find an APPROVED partner with a valid registration profile
    # We know Pankaj Sinha has a valid profile from earlier testing
    log("\n--- Finding an APPROVED partner with valid registration profile ---", Colors.BLUE)
    res = requests.get(f"{BASE_URL}/admin/people/partner?q=Pankaj&kyc=approved&page_size=10", headers=headers)
    if res.status_code != 200:
        log(f"❌ FAIL: Get partners failed: {res.status_code} {res.text}", Colors.RED)
        return False
    
    data = res.json()
    partners = data.get("items", [])
    
    if not partners:
        log(f"❌ FAIL: No approved partners found", Colors.RED)
        return False
    
    # Try to find one with a valid profile
    partner_uid = None
    partner_name = None
    partner_kyc_status = None
    
    for p in partners:
        uid = p.get("id")
        # Test if this partner has a valid profile
        test_res = requests.get(f"{BASE_URL}/admin/partners/{uid}/reg/profile", headers=headers)
        if test_res.status_code == 200:
            partner_uid = uid
            partner_name = p.get("name", "Unknown")
            partner_kyc_status = p.get("kyc_status")
            log(f"✅ Found approved partner with valid profile: {partner_name} (UID: {partner_uid}, KYC: {partner_kyc_status})")
            break
    
    if not partner_uid:
        log(f"❌ FAIL: No approved partner with valid registration profile found", Colors.RED)
        return False
    
    # Test 3a: GET profile
    log("\n--- Test 3a: GET /api/admin/partners/{uid}/reg/profile ---", Colors.BLUE)
    res = requests.get(f"{BASE_URL}/admin/partners/{partner_uid}/reg/profile", headers=headers)
    
    if res.status_code != 200:
        log(f"❌ FAIL: Expected 200, got {res.status_code}: {res.text}", Colors.RED)
        return False
    
    log(f"✅ Status: 200")
    profile_data = res.json()
    
    # Check required keys
    required_keys = ["profile", "kyc_status", "score"]
    for key in required_keys:
        if key not in profile_data:
            log(f"❌ FAIL: Missing key '{key}' in response", Colors.RED)
            passed = False
        else:
            log(f"✅ Key '{key}' present")
    
    # Check profile sub-keys
    profile = profile_data.get("profile", {})
    profile_keys = ["basic", "work", "documents", "address"]
    for key in profile_keys:
        if key not in profile:
            log(f"⚠️  Missing profile.{key}", Colors.YELLOW)
        else:
            log(f"✅ profile.{key} present")
    
    # Save original basic data
    original_basic = profile.get("basic", {})
    original_full_name = original_basic.get("full_name", "")
    log(f"\nOriginal full_name: {original_full_name}")
    
    # Test 3b: GET meta
    log("\n--- Test 3b: GET /api/admin/partners/{uid}/reg/meta ---", Colors.BLUE)
    res = requests.get(f"{BASE_URL}/admin/partners/{partner_uid}/reg/meta", headers=headers)
    
    if res.status_code != 200:
        log(f"❌ FAIL: Expected 200, got {res.status_code}: {res.text}", Colors.RED)
        return False
    
    log(f"✅ Status: 200")
    meta_data = res.json()
    
    # Check required keys
    meta_keys = ["educations", "experiences", "categories"]
    for key in meta_keys:
        if key not in meta_data:
            log(f"❌ FAIL: Missing key '{key}' in meta response", Colors.RED)
            passed = False
        else:
            log(f"✅ Key '{key}' present (count: {len(meta_data[key]) if isinstance(meta_data[key], list) else 'N/A'})")
    
    # Test 3c: PUT basic with changed full_name
    log("\n--- Test 3c: PUT /api/admin/partners/{uid}/reg/basic (change full_name) ---", Colors.BLUE)
    
    new_full_name = f"{original_full_name} (edited)"
    updated_basic = dict(original_basic)
    updated_basic["full_name"] = new_full_name
    
    log(f"Changing full_name to: {new_full_name}")
    
    res = requests.put(f"{BASE_URL}/admin/partners/{partner_uid}/reg/basic",
                      json=updated_basic,
                      headers=headers)
    
    if res.status_code != 200:
        log(f"❌ FAIL: Expected 200, got {res.status_code}: {res.text}", Colors.RED)
        passed = False
    else:
        log(f"✅ Status: 200")
        
        # Verify persistence by getting profile again
        log("\n--- Verifying full_name persisted ---", Colors.BLUE)
        res = requests.get(f"{BASE_URL}/admin/partners/{partner_uid}/reg/profile", headers=headers)
        if res.status_code == 200:
            profile_data = res.json()
            current_full_name = profile_data.get("profile", {}).get("basic", {}).get("full_name", "")
            
            if current_full_name == new_full_name:
                log(f"✅ PASS: full_name persisted correctly: {current_full_name}")
            else:
                log(f"❌ FAIL: full_name not persisted. Expected: {new_full_name}, Got: {current_full_name}", Colors.RED)
                passed = False
        else:
            log(f"❌ FAIL: Could not verify persistence: {res.status_code}", Colors.RED)
            passed = False
    
    # Test 3d: PUT address with changed manual_address
    log("\n--- Test 3d: PUT /api/admin/partners/{uid}/reg/address (change manual_address) ---", Colors.BLUE)
    
    original_address = profile.get("address", {})
    original_manual_address = original_address.get("manual_address", "")
    new_manual_address = f"{original_manual_address} (edited)" if original_manual_address else "123 Test Street (edited)"
    
    updated_address = dict(original_address)
    updated_address["manual_address"] = new_manual_address
    
    log(f"Changing manual_address to: {new_manual_address}")
    
    res = requests.put(f"{BASE_URL}/admin/partners/{partner_uid}/reg/address",
                      json=updated_address,
                      headers=headers)
    
    if res.status_code != 200:
        log(f"❌ FAIL: Expected 200, got {res.status_code}: {res.text}", Colors.RED)
        passed = False
    else:
        log(f"✅ Status: 200")
        
        # Verify persistence
        log("\n--- Verifying manual_address persisted ---", Colors.BLUE)
        res = requests.get(f"{BASE_URL}/admin/partners/{partner_uid}/reg/profile", headers=headers)
        if res.status_code == 200:
            profile_data = res.json()
            current_manual_address = profile_data.get("profile", {}).get("address", {}).get("manual_address", "")
            
            if current_manual_address == new_manual_address:
                log(f"✅ PASS: manual_address persisted correctly: {current_manual_address}")
            else:
                log(f"❌ FAIL: manual_address not persisted. Expected: {new_manual_address}, Got: {current_manual_address}", Colors.RED)
                passed = False
        else:
            log(f"❌ FAIL: Could not verify persistence: {res.status_code}", Colors.RED)
            passed = False
    
    # Test 3e: Verify partner kyc_status is STILL 'approved'
    log("\n--- Test 3e: Verify partner kyc_status is STILL 'approved' ---", Colors.BLUE)
    
    res = requests.get(f"{BASE_URL}/admin/people/partner/{partner_uid}/overview", headers=headers)
    if res.status_code == 200:
        overview_data = res.json()
        current_kyc_status = overview_data.get("user", {}).get("kyc_status")
        
        if current_kyc_status == "approved":
            log(f"✅ PASS: Partner kyc_status is STILL 'approved' (NOT forced to under_review)")
        else:
            log(f"❌ FAIL: Partner kyc_status changed to '{current_kyc_status}' (should stay 'approved')", Colors.RED)
            passed = False
    else:
        log(f"❌ FAIL: Could not verify kyc_status: {res.status_code}", Colors.RED)
        passed = False
    
    if passed:
        log(f"\n{'='*80}", Colors.GREEN)
        log(f"✅ TASK 3 PASSED: Admin edit wizard proxy working correctly", Colors.GREEN)
        log(f"{'='*80}", Colors.GREEN)
    else:
        log(f"\n{'='*80}", Colors.RED)
        log(f"❌ TASK 3 FAILED", Colors.RED)
        log(f"{'='*80}", Colors.RED)
    
    return passed

# ============================================================================
# MAIN
# ============================================================================

def main():
    log("=" * 80, Colors.BLUE)
    log("BACKEND TEST: Bank & KYC Unmasking + PAN Lock + Admin Edit Wizard", Colors.BLUE)
    log("=" * 80, Colors.BLUE)
    
    # Admin login
    admin_token = admin_login()
    
    # Find partner with bank/pan data for TASK 1
    partner_uid = find_partner_with_bank_pan(admin_token)
    
    results = {}
    
    # TASK 1: Bank & KYC unmasking
    if partner_uid:
        results["task1"] = test_task1_bank_kyc_unmasking(admin_token, partner_uid)
    else:
        log(f"\n⚠️  SKIPPING TASK 1: No partner with bank/pan data found", Colors.YELLOW)
        results["task1"] = None
    
    # TASK 2: PAN lock
    results["task2"] = test_task2_pan_lock(admin_token)
    
    # TASK 3: Admin edit wizard
    results["task3"] = test_task3_admin_edit_wizard(admin_token)
    
    # Summary
    log("\n" + "=" * 80, Colors.BLUE)
    log("SUMMARY", Colors.BLUE)
    log("=" * 80, Colors.BLUE)
    
    task_names = {
        "task1": "TASK 1: Bank & KYC tab UNMASKING + viewable docs",
        "task2": "TASK 2: PAN one-only + lock-until-rejected",
        "task3": "TASK 3: Admin edit wizard proxy"
    }
    
    passed_count = 0
    failed_count = 0
    skipped_count = 0
    
    for task_key, task_name in task_names.items():
        result = results.get(task_key)
        if result is True:
            log(f"✅ {task_name}", Colors.GREEN)
            passed_count += 1
        elif result is False:
            log(f"❌ {task_name}", Colors.RED)
            failed_count += 1
        else:
            log(f"⚠️  {task_name} (SKIPPED)", Colors.YELLOW)
            skipped_count += 1
    
    log(f"\nTotal: {passed_count} passed, {failed_count} failed, {skipped_count} skipped")
    
    if failed_count == 0 and passed_count > 0:
        log("\n" + "=" * 80, Colors.GREEN)
        log("ALL TESTS PASSED!", Colors.GREEN)
        log("=" * 80, Colors.GREEN)
        return 0
    else:
        log("\n" + "=" * 80, Colors.RED)
        log("SOME TESTS FAILED!", Colors.RED)
        log("=" * 80, Colors.RED)
        return 1

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        log(f"\n❌ TEST FAILED WITH EXCEPTION: {e}", Colors.RED)
        import traceback
        traceback.print_exc()
        sys.exit(1)
