#!/usr/bin/env python3
"""
AzoApp Phase 3-5 Backend Testing
Tests System Users CRUD, Generic Collections (taxes, offers, service_areas, channels), and Settings
"""

import requests
import json
import sys

# Base URL from frontend/.env
BASE_URL = "https://merchant-mobile-ui.preview.emergentagent.com/api"

# Test credentials (demo accounts with OTP 123456)
ADMIN_PHONE = "+919000000000"
DEMO_OTP = "123456"

# Color codes for output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RESET = "\033[0m"

def log(msg, color=RESET):
    print(f"{color}{msg}{RESET}")

def auth_login(phone, otp=DEMO_OTP):
    """Login and return token"""
    log(f"\n🔐 Logging in as {phone}...", BLUE)
    
    # Send OTP
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if resp.status_code != 200:
        log(f"❌ Send OTP failed: {resp.status_code} {resp.text}", RED)
        return None
    
    # Verify OTP
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": otp})
    if resp.status_code != 200:
        log(f"❌ Verify OTP failed: {resp.status_code} {resp.text}", RED)
        return None
    
    data = resp.json()
    token = data.get("token")
    user = data.get("user", {})
    log(f"✅ Logged in as {user.get('name')} (role: {user.get('role')})", GREEN)
    return token

def test_system_users_crud(token):
    """Test System Users CRUD operations"""
    log("\n" + "="*80, BLUE)
    log("TEST 1: SYSTEM USERS CRUD", BLUE)
    log("="*80, BLUE)
    
    headers = {"Authorization": f"Bearer {token}"}
    test_staff_id = None
    primary_admin_id = None
    
    # Cleanup: Delete any existing test staff user from previous runs
    log("\n🧹 Cleanup: Checking for existing test staff user...", YELLOW)
    resp = requests.get(f"{BASE_URL}/admin/system-users", headers=headers)
    if resp.status_code == 200:
        users_list = resp.json()
        for u in users_list:
            if u.get("phone") == "+919000000201":
                log(f"   Found existing test staff user (id={u.get('id')}), deleting...", YELLOW)
                requests.delete(f"{BASE_URL}/admin/system-users/{u.get('id')}", headers=headers)
                log(f"   Cleanup complete", GREEN)
                break
    
    # 1. Create a new system user
    log("\n1️⃣  Creating new system user (Finance Admin)...", YELLOW)
    create_data = {
        "name": "Test Staff",
        "phone": "+919000000201",
        "email": "t@a.com",
        "system_role": "Finance Admin"
    }
    resp = requests.post(f"{BASE_URL}/admin/system-users", json=create_data, headers=headers)
    if resp.status_code != 200:
        log(f"❌ FAIL: Create system user returned {resp.status_code}: {resp.text}", RED)
        return False
    
    user_data = resp.json()
    test_staff_id = user_data.get("id")
    
    if user_data.get("role") != "admin":
        log(f"❌ FAIL: Expected role='admin', got '{user_data.get('role')}'", RED)
        return False
    
    if user_data.get("system_role") != "Finance Admin":
        log(f"❌ FAIL: Expected system_role='Finance Admin', got '{user_data.get('system_role')}'", RED)
        return False
    
    log(f"✅ PASS: Created system user with id={test_staff_id}, role=admin, system_role=Finance Admin", GREEN)
    log(f"   Response: {json.dumps(user_data, indent=2)}", RESET)
    
    # 2. List system users and verify the new user appears
    log("\n2️⃣  Listing all system users...", YELLOW)
    resp = requests.get(f"{BASE_URL}/admin/system-users", headers=headers)
    if resp.status_code != 200:
        log(f"❌ FAIL: List system users returned {resp.status_code}: {resp.text}", RED)
        return False
    
    users_list = resp.json()
    found = False
    for u in users_list:
        if u.get("id") == test_staff_id:
            found = True
            break
        if u.get("phone") == "+919000000000":
            primary_admin_id = u.get("id")
    
    if not found:
        log(f"❌ FAIL: New user not found in list", RED)
        return False
    
    log(f"✅ PASS: New user appears in system users list (total: {len(users_list)} users)", GREEN)
    
    # 3. Try to create duplicate (same phone)
    log("\n3️⃣  Testing duplicate phone validation...", YELLOW)
    resp = requests.post(f"{BASE_URL}/admin/system-users", json=create_data, headers=headers)
    if resp.status_code != 400:
        log(f"❌ FAIL: Expected 400 for duplicate phone, got {resp.status_code}", RED)
        return False
    
    error_msg = resp.json().get("detail", "")
    if "already exists" not in error_msg.lower():
        log(f"❌ FAIL: Expected 'already exists' error, got: {error_msg}", RED)
        return False
    
    log(f"✅ PASS: Duplicate phone correctly rejected with 400: {error_msg}", GREEN)
    
    # 4. Update system user status to inactive
    log("\n4️⃣  Updating system user status to inactive...", YELLOW)
    update_data = {"status": "inactive"}
    resp = requests.put(f"{BASE_URL}/admin/system-users/{test_staff_id}", json=update_data, headers=headers)
    if resp.status_code != 200:
        log(f"❌ FAIL: Update system user returned {resp.status_code}: {resp.text}", RED)
        return False
    
    updated_user = resp.json()
    if updated_user.get("status") != "inactive":
        log(f"❌ FAIL: Expected status='inactive', got '{updated_user.get('status')}'", RED)
        return False
    
    log(f"✅ PASS: System user status updated to inactive", GREEN)
    
    # 5. Verify staff can login
    log("\n5️⃣  Verifying created staff can login...", YELLOW)
    
    # Send OTP for staff (non-demo account should return dev_otp)
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": "+919000000201"})
    if resp.status_code != 200:
        log(f"❌ FAIL: Staff send OTP failed: {resp.status_code} {resp.text}", RED)
        return False
    
    otp_data = resp.json()
    dev_otp = otp_data.get("dev_otp")
    if not dev_otp:
        log(f"❌ FAIL: No dev_otp returned for non-demo staff account", RED)
        return False
    
    log(f"   dev_otp returned: {dev_otp}", RESET)
    
    # Verify OTP with dev_otp
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": "+919000000201", "otp": dev_otp})
    if resp.status_code != 200:
        log(f"❌ FAIL: Staff OTP verification failed: {resp.status_code} {resp.text}", RED)
        return False
    
    staff_user = resp.json().get("user", {})
    if staff_user.get("role") != "admin":
        log(f"❌ FAIL: Expected staff role='admin', got '{staff_user.get('role')}'", RED)
        return False
    
    log(f"✅ PASS: Staff can login with dev_otp and has role=admin", GREEN)
    
    # 6. Delete the test staff user
    log("\n6️⃣  Deleting test staff user...", YELLOW)
    resp = requests.delete(f"{BASE_URL}/admin/system-users/{test_staff_id}", headers=headers)
    if resp.status_code != 200:
        log(f"❌ FAIL: Delete system user returned {resp.status_code}: {resp.text}", RED)
        return False
    
    # Verify it's gone from the list
    resp = requests.get(f"{BASE_URL}/admin/system-users", headers=headers)
    users_list = resp.json()
    found = False
    for u in users_list:
        if u.get("id") == test_staff_id:
            found = True
            break
    
    if found:
        log(f"❌ FAIL: Deleted user still appears in list", RED)
        return False
    
    log(f"✅ PASS: Test staff user deleted successfully", GREEN)
    
    # 7. Try to delete primary admin (should fail)
    log("\n7️⃣  Testing primary admin deletion protection...", YELLOW)
    if not primary_admin_id:
        log(f"⚠️  WARNING: Could not find primary admin id, skipping this test", YELLOW)
    else:
        resp = requests.delete(f"{BASE_URL}/admin/system-users/{primary_admin_id}", headers=headers)
        if resp.status_code != 400:
            log(f"❌ FAIL: Expected 400 for primary admin deletion, got {resp.status_code}", RED)
            return False
        
        error_msg = resp.json().get("detail", "")
        if "cannot delete" not in error_msg.lower() and "primary admin" not in error_msg.lower():
            log(f"❌ FAIL: Expected 'cannot delete primary admin' error, got: {error_msg}", RED)
            return False
        
        log(f"✅ PASS: Primary admin deletion correctly blocked with 400: {error_msg}", GREEN)
    
    log("\n" + "="*80, GREEN)
    log("✅ ALL SYSTEM USERS CRUD TESTS PASSED", GREEN)
    log("="*80, GREEN)
    return True

def test_generic_collections(token):
    """Test Generic Collections CRUD for taxes, offers, service_areas, channels"""
    log("\n" + "="*80, BLUE)
    log("TEST 2: GENERIC COLLECTIONS (taxes, offers, service_areas, channels)", BLUE)
    log("="*80, BLUE)
    
    headers = {"Authorization": f"Bearer {token}"}
    collections = ["taxes", "offers", "service_areas", "channels"]
    
    for coll_name in collections:
        log(f"\n{'='*80}", YELLOW)
        log(f"Testing collection: {coll_name}", YELLOW)
        log(f"{'='*80}", YELLOW)
        
        # 1. GET collection - should return seeded rows
        log(f"\n1️⃣  GET /api/admin/collection/{coll_name}...", YELLOW)
        resp = requests.get(f"{BASE_URL}/admin/collection/{coll_name}", headers=headers)
        if resp.status_code != 200:
            log(f"❌ FAIL: GET collection returned {resp.status_code}: {resp.text}", RED)
            return False
        
        items = resp.json()
        if not isinstance(items, list):
            log(f"❌ FAIL: Expected array, got {type(items)}", RED)
            return False
        
        log(f"✅ PASS: GET collection returned {len(items)} seeded rows", GREEN)
        if len(items) > 0:
            log(f"   Sample item: {json.dumps(items[0], indent=2)}", RESET)
        
        # 2. POST - create new item
        log(f"\n2️⃣  POST /api/admin/collection/{coll_name} (create new item)...", YELLOW)
        
        # Prepare test data based on collection type
        test_data = {
            "taxes": {"name": "Cess", "percentage": 2, "applies_to": "services", "status": "active"},
            "offers": {"title": "Test Offer", "code": "TEST50", "discount": 50, "audience": "customer", "status": "active"},
            "service_areas": {"name": "Test Zone", "city": "Delhi", "pincodes": ["110001"], "radius_km": 10, "status": "active"},
            "channels": {"name": "Test Channel", "type": "whatsapp", "status": "active"}
        }
        
        create_data = test_data[coll_name]
        resp = requests.post(f"{BASE_URL}/admin/collection/{coll_name}", json=create_data, headers=headers)
        if resp.status_code != 200:
            log(f"❌ FAIL: POST collection returned {resp.status_code}: {resp.text}", RED)
            return False
        
        created_item = resp.json()
        item_id = created_item.get("id")
        if not item_id:
            log(f"❌ FAIL: Created item has no id", RED)
            return False
        
        log(f"✅ PASS: Created new item with id={item_id}", GREEN)
        log(f"   Response: {json.dumps(created_item, indent=2)}", RESET)
        
        # 3. PUT - update the item
        log(f"\n3️⃣  PUT /api/admin/collection/{coll_name}/{item_id} (update item)...", YELLOW)
        
        update_data = {"status": "inactive"}
        resp = requests.put(f"{BASE_URL}/admin/collection/{coll_name}/{item_id}", json=update_data, headers=headers)
        if resp.status_code != 200:
            log(f"❌ FAIL: PUT collection returned {resp.status_code}: {resp.text}", RED)
            return False
        
        updated_item = resp.json()
        if updated_item.get("status") != "inactive":
            log(f"❌ FAIL: Expected status='inactive', got '{updated_item.get('status')}'", RED)
            return False
        
        log(f"✅ PASS: Item updated successfully (status changed to inactive)", GREEN)
        
        # 4. DELETE - remove the item
        log(f"\n4️⃣  DELETE /api/admin/collection/{coll_name}/{item_id}...", YELLOW)
        resp = requests.delete(f"{BASE_URL}/admin/collection/{coll_name}/{item_id}", headers=headers)
        if resp.status_code != 200:
            log(f"❌ FAIL: DELETE collection returned {resp.status_code}: {resp.text}", RED)
            return False
        
        # Verify it's gone
        resp = requests.get(f"{BASE_URL}/admin/collection/{coll_name}", headers=headers)
        items_after = resp.json()
        found = False
        for item in items_after:
            if item.get("id") == item_id:
                found = True
                break
        
        if found:
            log(f"❌ FAIL: Deleted item still appears in collection", RED)
            return False
        
        log(f"✅ PASS: Item deleted successfully", GREEN)
    
    # 5. Test invalid collection name
    log(f"\n{'='*80}", YELLOW)
    log(f"Testing invalid collection name", YELLOW)
    log(f"{'='*80}", YELLOW)
    
    log(f"\n5️⃣  GET /api/admin/collection/does_not_exist (should return 404)...", YELLOW)
    resp = requests.get(f"{BASE_URL}/admin/collection/does_not_exist", headers=headers)
    if resp.status_code != 404:
        log(f"❌ FAIL: Expected 404 for invalid collection, got {resp.status_code}", RED)
        return False
    
    log(f"✅ PASS: Invalid collection correctly returns 404", GREEN)
    
    log("\n" + "="*80, GREEN)
    log("✅ ALL GENERIC COLLECTIONS TESTS PASSED", GREEN)
    log("="*80, GREEN)
    return True

def test_settings(token):
    """Test Settings (seo, general, storage)"""
    log("\n" + "="*80, BLUE)
    log("TEST 3: SETTINGS (seo, general, storage)", BLUE)
    log("="*80, BLUE)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. GET settings
    log("\n1️⃣  GET /api/admin/settings...", YELLOW)
    resp = requests.get(f"{BASE_URL}/admin/settings", headers=headers)
    if resp.status_code != 200:
        log(f"❌ FAIL: GET settings returned {resp.status_code}: {resp.text}", RED)
        return False
    
    settings = resp.json()
    
    # Verify seo object exists
    if "seo" not in settings:
        log(f"❌ FAIL: Settings missing 'seo' object", RED)
        return False
    
    seo = settings.get("seo", {})
    if "site_title" not in seo:
        log(f"❌ FAIL: SEO object missing 'site_title'", RED)
        return False
    
    log(f"✅ PASS: Settings contains seo object with site_title='{seo.get('site_title')}'", GREEN)
    
    # Verify general object exists
    if "general" not in settings:
        log(f"❌ FAIL: Settings missing 'general' object", RED)
        return False
    
    general = settings.get("general", {})
    if "site_name" not in general:
        log(f"❌ FAIL: General object missing 'site_name'", RED)
        return False
    
    log(f"✅ PASS: Settings contains general object with site_name='{general.get('site_name')}'", GREEN)
    
    # Verify storage object exists
    if "storage" not in settings:
        log(f"❌ FAIL: Settings missing 'storage' object", RED)
        return False
    
    storage = settings.get("storage", {})
    if "provider" not in storage:
        log(f"❌ FAIL: Storage object missing 'provider'", RED)
        return False
    
    log(f"✅ PASS: Settings contains storage object with provider='{storage.get('provider')}'", GREEN)
    
    # 2. Update SEO settings
    log("\n2️⃣  PUT /api/admin/settings (update SEO)...", YELLOW)
    update_data = {
        "seo": {
            "site_title": "UI SEO Title",
            "meta_description": "Y",
            "meta_keywords": "z",
            "og_image": ""
        }
    }
    resp = requests.put(f"{BASE_URL}/admin/settings", json=update_data, headers=headers)
    if resp.status_code != 200:
        log(f"❌ FAIL: PUT settings returned {resp.status_code}: {resp.text}", RED)
        return False
    
    # Verify the update persisted
    resp = requests.get(f"{BASE_URL}/admin/settings", headers=headers)
    settings = resp.json()
    seo = settings.get("seo", {})
    
    if seo.get("site_title") != "UI SEO Title":
        log(f"❌ FAIL: Expected site_title='UI SEO Title', got '{seo.get('site_title')}'", RED)
        return False
    
    log(f"✅ PASS: SEO settings updated successfully (site_title='UI SEO Title')", GREEN)
    
    # 3. Update general settings
    log("\n3️⃣  PUT /api/admin/settings (update general)...", YELLOW)
    update_data = {
        "general": {
            "site_name": "MyBrand",
            "support_email": "s@b.com",
            "support_phone": "+91...",
            "support_hours": "9-9",
            "company_address": "Addr"
        }
    }
    resp = requests.put(f"{BASE_URL}/admin/settings", json=update_data, headers=headers)
    if resp.status_code != 200:
        log(f"❌ FAIL: PUT settings returned {resp.status_code}: {resp.text}", RED)
        return False
    
    # Verify the update persisted
    resp = requests.get(f"{BASE_URL}/admin/settings", headers=headers)
    settings = resp.json()
    general = settings.get("general", {})
    
    if general.get("site_name") != "MyBrand":
        log(f"❌ FAIL: Expected site_name='MyBrand', got '{general.get('site_name')}'", RED)
        return False
    
    if general.get("support_email") != "s@b.com":
        log(f"❌ FAIL: Expected support_email='s@b.com', got '{general.get('support_email')}'", RED)
        return False
    
    log(f"✅ PASS: General settings updated successfully (site_name='MyBrand', support_email='s@b.com')", GREEN)
    
    # 4. Update storage settings
    log("\n4️⃣  PUT /api/admin/settings (update storage)...", YELLOW)
    update_data = {
        "storage": {
            "provider": "s3",
            "s3_bucket": "b",
            "s3_region": "ap-south-1",
            "s3_access_key": "k",
            "s3_secret_key": "x"
        }
    }
    resp = requests.put(f"{BASE_URL}/admin/settings", json=update_data, headers=headers)
    if resp.status_code != 200:
        log(f"❌ FAIL: PUT settings returned {resp.status_code}: {resp.text}", RED)
        return False
    
    # Verify the update persisted
    resp = requests.get(f"{BASE_URL}/admin/settings", headers=headers)
    settings = resp.json()
    storage = settings.get("storage", {})
    
    if storage.get("provider") != "s3":
        log(f"❌ FAIL: Expected provider='s3', got '{storage.get('provider')}'", RED)
        return False
    
    if storage.get("s3_bucket") != "b":
        log(f"❌ FAIL: Expected s3_bucket='b', got '{storage.get('s3_bucket')}'", RED)
        return False
    
    if storage.get("s3_region") != "ap-south-1":
        log(f"❌ FAIL: Expected s3_region='ap-south-1', got '{storage.get('s3_region')}'", RED)
        return False
    
    log(f"✅ PASS: Storage settings updated successfully (provider='s3', s3_bucket='b', s3_region='ap-south-1')", GREEN)
    
    log("\n" + "="*80, GREEN)
    log("✅ ALL SETTINGS TESTS PASSED", GREEN)
    log("="*80, GREEN)
    return True

def main():
    log("\n" + "="*80, BLUE)
    log("🚀 AZOAPP PHASE 3-5 BACKEND TESTING", BLUE)
    log("="*80, BLUE)
    
    # Login as admin
    admin_token = auth_login(ADMIN_PHONE, DEMO_OTP)
    if not admin_token:
        log("\n❌ FATAL: Admin login failed. Cannot proceed with tests.", RED)
        sys.exit(1)
    
    # Run all tests
    results = []
    
    # Test 1: System Users CRUD
    try:
        results.append(("System Users CRUD", test_system_users_crud(admin_token)))
    except Exception as e:
        log(f"\n❌ EXCEPTION in System Users CRUD: {str(e)}", RED)
        import traceback
        traceback.print_exc()
        results.append(("System Users CRUD", False))
    
    # Test 2: Generic Collections
    try:
        results.append(("Generic Collections", test_generic_collections(admin_token)))
    except Exception as e:
        log(f"\n❌ EXCEPTION in Generic Collections: {str(e)}", RED)
        import traceback
        traceback.print_exc()
        results.append(("Generic Collections", False))
    
    # Test 3: Settings
    try:
        results.append(("Settings", test_settings(admin_token)))
    except Exception as e:
        log(f"\n❌ EXCEPTION in Settings: {str(e)}", RED)
        import traceback
        traceback.print_exc()
        results.append(("Settings", False))
    
    # Summary
    log("\n" + "="*80, BLUE)
    log("📊 TEST SUMMARY", BLUE)
    log("="*80, BLUE)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        color = GREEN if result else RED
        log(f"{status}: {test_name}", color)
    
    log(f"\n{'='*80}", BLUE)
    log(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}%)", GREEN if passed == total else RED)
    log(f"{'='*80}", BLUE)
    
    if passed == total:
        log("\n🎉 ALL TESTS PASSED! Phase 3-5 backend is working correctly.", GREEN)
        sys.exit(0)
    else:
        log(f"\n⚠️  {total - passed} test(s) failed. Please review the output above.", RED)
        sys.exit(1)

if __name__ == "__main__":
    main()
