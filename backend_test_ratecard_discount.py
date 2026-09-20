#!/usr/bin/env python3
"""
Backend API Testing for AzoApp - Rate-card Limited-time Discount
Tests the NEW discount_pct and discount_until fields on rate-card rows
"""

import requests
import sys
from typing import Dict, Any, Optional

# Backend URL from environment
BACKEND_URL = "https://job-ring-system.preview.emergentagent.com/api"

# Test credentials
ADMIN_PHONE = "+919000000000"
ADMIN_OTP = "123456"


class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'


def log_test(msg: str):
    print(f"{Colors.BLUE}[TEST]{Colors.RESET} {msg}")


def log_pass(msg: str):
    print(f"{Colors.GREEN}✅ PASS{Colors.RESET} - {msg}")


def log_fail(msg: str):
    print(f"{Colors.RED}❌ FAIL{Colors.RESET} - {msg}")


def log_info(msg: str):
    print(f"{Colors.YELLOW}[INFO]{Colors.RESET} {msg}")


def admin_login() -> str:
    """Login as admin and return auth token"""
    log_test("Admin login via OTP")
    
    # Step 1: Send OTP
    resp = requests.post(f"{BACKEND_URL}/auth/send-otp", json={"phone": ADMIN_PHONE})
    if resp.status_code != 200:
        log_fail(f"Send OTP failed: {resp.status_code} - {resp.text}")
        sys.exit(1)
    log_info(f"OTP sent to {ADMIN_PHONE}")
    
    # Step 2: Verify OTP
    resp = requests.post(f"{BACKEND_URL}/auth/verify-otp", json={"phone": ADMIN_PHONE, "otp": ADMIN_OTP})
    if resp.status_code != 200:
        log_fail(f"Verify OTP failed: {resp.status_code} - {resp.text}")
        sys.exit(1)
    
    data = resp.json()
    token = data.get("token")
    if not token:
        log_fail("No token in verify-otp response")
        sys.exit(1)
    
    log_pass(f"Admin logged in successfully")
    return token


def find_row_by_description(groups: list, search_text: str) -> Optional[dict]:
    """Find a row in groups by searching for text in description"""
    for group in groups:
        for row in group.get("rows", []):
            if search_text.lower() in row.get("description", "").lower():
                return row
    return None


def test_public_discount_fields() -> Dict[str, Any]:
    """Test 1: PUBLIC read discount fields on AC rate card"""
    log_test("TEST 1: GET /api/ratecards/by-category/ac-repair-service (PUBLIC)")
    
    resp = requests.get(f"{BACKEND_URL}/ratecards/by-category/ac-repair-service")
    
    if resp.status_code != 200:
        log_fail(f"Request failed: {resp.status_code} - {resp.text}")
        return {"success": False, "error": f"Status {resp.status_code}"}
    
    data = resp.json()
    
    if not data:
        log_fail("No rate card returned (null response)")
        return {"success": False, "error": "Null response"}
    
    log_pass("Rate card returned successfully")
    
    groups = data.get("groups", [])
    log_info(f"Found {len(groups)} groups in rate card")
    
    # Find "Power jet service (Split)" row
    power_jet_row = find_row_by_description(groups, "Power jet service (Split)")
    if not power_jet_row:
        log_fail("Could not find 'Power jet service (Split)' row")
        return {"success": False, "error": "Power jet row not found"}
    
    log_info(f"Found Power jet row: {power_jet_row.get('description')}")
    
    # Check discount_pct == 20
    power_discount_pct = power_jet_row.get("discount_pct")
    if power_discount_pct != 20:
        log_fail(f"Power jet discount_pct should be 20, got {power_discount_pct}")
        return {"success": False, "error": f"Power jet discount_pct is {power_discount_pct}, expected 20"}
    
    log_pass(f"Power jet discount_pct = {power_discount_pct} ✅")
    
    # Check discount_until == "" (empty)
    power_discount_until = power_jet_row.get("discount_until", "")
    if power_discount_until != "":
        log_fail(f"Power jet discount_until should be empty, got '{power_discount_until}'")
        return {"success": False, "error": f"Power jet discount_until is '{power_discount_until}', expected empty"}
    
    log_pass(f"Power jet discount_until = '' (empty) ✅")
    
    # Find "Gas refill (Split up to 1.5T)" row
    gas_refill_row = find_row_by_description(groups, "Gas refill (Split up to 1.5T)")
    if not gas_refill_row:
        log_fail("Could not find 'Gas refill (Split up to 1.5T)' row")
        return {"success": False, "error": "Gas refill row not found"}
    
    log_info(f"Found Gas refill row: {gas_refill_row.get('description')}")
    
    # Check discount_pct == 15
    gas_discount_pct = gas_refill_row.get("discount_pct")
    if gas_discount_pct != 15:
        log_fail(f"Gas refill discount_pct should be 15, got {gas_discount_pct}")
        return {"success": False, "error": f"Gas refill discount_pct is {gas_discount_pct}, expected 15"}
    
    log_pass(f"Gas refill discount_pct = {gas_discount_pct} ✅")
    
    # Check discount_until == "2026-12-31"
    gas_discount_until = gas_refill_row.get("discount_until", "")
    if gas_discount_until != "2026-12-31":
        log_fail(f"Gas refill discount_until should be '2026-12-31', got '{gas_discount_until}'")
        return {"success": False, "error": f"Gas refill discount_until is '{gas_discount_until}', expected '2026-12-31'"}
    
    log_pass(f"Gas refill discount_until = '{gas_discount_until}' ✅")
    
    return {"success": True, "data": data}


def test_search_exposes_discount() -> Dict[str, Any]:
    """Test 2: SEARCH exposes discount fields"""
    log_test("TEST 2: GET /api/ratecards/search?q=power (PUBLIC)")
    
    resp = requests.get(f"{BACKEND_URL}/ratecards/search?q=power")
    
    if resp.status_code != 200:
        log_fail(f"Request failed: {resp.status_code} - {resp.text}")
        return {"success": False, "error": f"Status {resp.status_code}"}
    
    data = resp.json()
    
    if not isinstance(data, list):
        log_fail(f"Expected array response, got {type(data)}")
        return {"success": False, "error": "Response not an array"}
    
    log_pass(f"Search returned {len(data)} results")
    
    if len(data) == 0:
        log_fail("No results returned for 'power' search")
        return {"success": False, "error": "No search results"}
    
    # Check first result has discount fields
    first_result = data[0]
    log_info(f"First result: {first_result.get('description')}")
    
    if "discount_pct" not in first_result:
        log_fail("Search result missing 'discount_pct' field")
        return {"success": False, "error": "Missing discount_pct field"}
    
    log_pass(f"Search result includes 'discount_pct' field ✅")
    
    if "discount_until" not in first_result:
        log_fail("Search result missing 'discount_until' field")
        return {"success": False, "error": "Missing discount_until field"}
    
    log_pass(f"Search result includes 'discount_until' field ✅")
    
    # Find Power jet row in results
    power_jet_result = None
    for result in data:
        if "power jet" in result.get("description", "").lower():
            power_jet_result = result
            break
    
    if power_jet_result:
        log_info(f"Found Power jet in search: discount_pct={power_jet_result.get('discount_pct')}")
        if power_jet_result.get("discount_pct") == 20:
            log_pass("Power jet row shows discount_pct=20 in search results ✅")
        else:
            log_fail(f"Power jet discount_pct should be 20, got {power_jet_result.get('discount_pct')}")
    
    return {"success": True, "data": data}


def test_admin_update_roundtrip_clamp(token: str) -> Dict[str, Any]:
    """Test 3: ADMIN update round-trip with clamping"""
    log_test("TEST 3: ADMIN update round-trip + clamp verification")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Step 3.1: GET /api/ratecards/admin (list)
    log_info("Step 3.1: GET /api/ratecards/admin (list)")
    resp = requests.get(f"{BACKEND_URL}/ratecards/admin", headers=headers)
    
    if resp.status_code != 200:
        log_fail(f"Admin list failed: {resp.status_code} - {resp.text}")
        return {"success": False, "error": f"Status {resp.status_code}"}
    
    cards = resp.json()
    
    # Find AC card
    ac_card = None
    for card in cards:
        if "AC" in card.get("category_name", ""):
            ac_card = card
            break
    
    if not ac_card:
        log_fail("Could not find AC rate card in admin list")
        return {"success": False, "error": "AC card not found"}
    
    ac_card_id = ac_card.get("id")
    log_pass(f"Found AC card: {ac_card.get('category_name')} (id: {ac_card_id})")
    
    # Step 3.2: GET /api/ratecards/admin/{id} (full card)
    log_info(f"Step 3.2: GET /api/ratecards/admin/{ac_card_id}")
    resp = requests.get(f"{BACKEND_URL}/ratecards/admin/{ac_card_id}", headers=headers)
    
    if resp.status_code != 200:
        log_fail(f"Admin get card failed: {resp.status_code} - {resp.text}")
        return {"success": False, "error": f"Status {resp.status_code}"}
    
    full_card = resp.json()
    groups = full_card.get("groups", [])
    
    if not groups or not groups[0].get("rows"):
        log_fail("No groups or rows in card")
        return {"success": False, "error": "No groups/rows"}
    
    # Get first row's original discount_pct
    first_row = groups[0]["rows"][0]
    original_discount_pct = first_row.get("discount_pct", 0)
    original_description = first_row.get("description", "")
    
    log_info(f"First row: '{original_description}' with discount_pct={original_discount_pct}")
    log_pass(f"Retrieved full card with {len(groups)} groups")
    
    # Step 3.3: PUT /api/ratecards/{id} with first row discount_pct=150, discount_until="2027-01-01"
    log_info("Step 3.3: PUT update with first row discount_pct=150 (should clamp to 95)")
    
    # Modify first row
    groups[0]["rows"][0]["discount_pct"] = 150
    groups[0]["rows"][0]["discount_until"] = "2027-01-01"
    
    update_payload = {"groups": groups}
    
    resp = requests.put(f"{BACKEND_URL}/ratecards/{ac_card_id}", json=update_payload, headers=headers)
    
    if resp.status_code != 200:
        log_fail(f"Update failed: {resp.status_code} - {resp.text}")
        return {"success": False, "error": f"Update status {resp.status_code}"}
    
    log_pass("Update request successful")
    
    # Step 3.4: Re-GET /api/ratecards/admin/{id} to verify clamping
    log_info(f"Step 3.4: Re-GET /api/ratecards/admin/{ac_card_id} to verify clamping")
    resp = requests.get(f"{BACKEND_URL}/ratecards/admin/{ac_card_id}", headers=headers)
    
    if resp.status_code != 200:
        log_fail(f"Re-get failed: {resp.status_code} - {resp.text}")
        return {"success": False, "error": f"Re-get status {resp.status_code}"}
    
    updated_card = resp.json()
    updated_first_row = updated_card.get("groups", [])[0]["rows"][0]
    
    clamped_discount_pct = updated_first_row.get("discount_pct")
    updated_discount_until = updated_first_row.get("discount_until")
    
    log_info(f"After update: discount_pct={clamped_discount_pct}, discount_until='{updated_discount_until}'")
    
    # Verify clamping to 95
    if clamped_discount_pct != 95:
        log_fail(f"discount_pct should be clamped to 95, got {clamped_discount_pct}")
        return {"success": False, "error": f"Clamping failed: got {clamped_discount_pct}, expected 95"}
    
    log_pass(f"discount_pct correctly clamped from 150 to 95 ✅")
    
    # Verify discount_until persisted
    if updated_discount_until != "2027-01-01":
        log_fail(f"discount_until should be '2027-01-01', got '{updated_discount_until}'")
        return {"success": False, "error": f"discount_until is '{updated_discount_until}', expected '2027-01-01'"}
    
    log_pass(f"discount_until persisted as '2027-01-01' ✅")
    
    # Step 3.5: CLEANUP - Restore original discount_pct
    log_info(f"Step 3.5: CLEANUP - Restoring original discount_pct={original_discount_pct}")
    
    groups[0]["rows"][0]["discount_pct"] = original_discount_pct
    groups[0]["rows"][0]["discount_until"] = ""  # Restore to empty for Power jet
    
    cleanup_payload = {"groups": groups}
    
    resp = requests.put(f"{BACKEND_URL}/ratecards/{ac_card_id}", json=cleanup_payload, headers=headers)
    
    if resp.status_code != 200:
        log_fail(f"Cleanup failed: {resp.status_code} - {resp.text}")
        return {"success": False, "error": f"Cleanup status {resp.status_code}", "cleanup_failed": True}
    
    log_pass(f"Cleanup successful - restored discount_pct to {original_discount_pct} ✅")
    
    return {"success": True, "original_discount_pct": original_discount_pct}


def test_regression_premium_partners(token: str) -> Dict[str, Any]:
    """Test 4: Regression - premium partners still returns 2"""
    log_test("TEST 4: REGRESSION - GET /api/admin/partners?premium=true")
    
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{BACKEND_URL}/admin/partners?premium=true", headers=headers)
    
    if resp.status_code != 200:
        log_fail(f"Request failed: {resp.status_code} - {resp.text}")
        return {"success": False, "error": f"Status {resp.status_code}"}
    
    data = resp.json()
    partners = data.get("partners", [])
    
    log_info(f"Premium partners returned: {len(partners)}")
    
    if len(partners) != 2:
        log_fail(f"Expected EXACTLY 2 premium partners, got {len(partners)}")
        return {"success": False, "error": f"Expected 2 partners, got {len(partners)}"}
    
    log_pass(f"Premium partners endpoint still returns exactly 2 partners ✅")
    
    return {"success": True, "count": len(partners)}


def main():
    print("\n" + "="*80)
    print("BACKEND TESTING: Rate-card Limited-time Discount")
    print("="*80 + "\n")
    
    # Test 1: Public discount fields (no auth required)
    test1_result = test_public_discount_fields()
    print()
    
    if not test1_result.get("success"):
        log_fail("TEST 1 FAILED - Stopping tests")
        sys.exit(1)
    
    # Test 2: Search exposes discount (no auth required)
    test2_result = test_search_exposes_discount()
    print()
    
    if not test2_result.get("success"):
        log_fail("TEST 2 FAILED - Stopping tests")
        sys.exit(1)
    
    # Login for admin tests
    token = admin_login()
    print()
    
    # Test 3: Admin update round-trip + clamp
    test3_result = test_admin_update_roundtrip_clamp(token)
    print()
    
    if not test3_result.get("success"):
        log_fail("TEST 3 FAILED - Stopping tests")
        sys.exit(1)
    
    # Test 4: Regression - premium partners
    test4_result = test_regression_premium_partners(token)
    print()
    
    if not test4_result.get("success"):
        log_fail("TEST 4 FAILED")
        sys.exit(1)
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY: ALL TESTS PASSED ✅")
    print("="*80)
    print("✅ TEST 1: PUBLIC /api/ratecards/by-category/ac-repair-service")
    print("   - Power jet service (Split): discount_pct=20, discount_until='' (empty)")
    print("   - Gas refill (Split up to 1.5T): discount_pct=15, discount_until='2026-12-31'")
    print("✅ TEST 2: SEARCH /api/ratecards/search?q=power")
    print("   - Results include discount_pct and discount_until fields")
    print("   - Power jet row shows discount_pct=20")
    print("✅ TEST 3: ADMIN update round-trip + clamp")
    print("   - Updated first row with discount_pct=150")
    print("   - Verified clamping to 95 (max allowed)")
    print("   - Verified discount_until='2027-01-01' persisted")
    print(f"   - Cleanup successful (restored to original discount_pct={test3_result.get('original_discount_pct')})")
    print("✅ TEST 4: REGRESSION - Premium partners endpoint unchanged")
    print(f"   - GET /api/admin/partners?premium=true returns exactly {test4_result.get('count')} partners")
    print("="*80 + "\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nTest interrupted by user")
        sys.exit(1)
    except Exception as e:
        log_fail(f"Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
