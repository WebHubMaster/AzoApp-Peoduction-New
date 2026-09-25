#!/usr/bin/env python3
"""
Backend test for GENERAL SETTINGS integration (Social & Apps → public site config + change-history integrity).
Review request: Focused test of GENERAL SETTINGS backend integration.
"""
import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://merchant-panel-sync.preview.emergentagent.com/api"
ADMIN_PHONE = "+919000000000"
CUSTOMER_PHONE = "+919000000004"
OTP = "123456"

# Test results
results = {
    "total_tests": 0,
    "passed": 0,
    "failed": 0,
    "tests": []
}

def log_test(name, passed, details=""):
    """Log a test result"""
    results["total_tests"] += 1
    if passed:
        results["passed"] += 1
        print(f"✅ {name}")
    else:
        results["failed"] += 1
        print(f"❌ {name}")
        if details:
            print(f"   Details: {details}")
    results["tests"].append({"name": name, "passed": passed, "details": details})

def login(phone, otp):
    """Login and get token"""
    try:
        # Request OTP
        resp = requests.post(f"{BASE_URL}/auth/request-otp", json={"phone": phone}, timeout=10)
        
        # Verify OTP
        resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": otp}, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("token")
        else:
            print(f"Login failed for {phone}: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        print(f"Login error for {phone}: {e}")
        return None

def main():
    print("=" * 80)
    print("GENERAL SETTINGS BACKEND INTEGRATION TEST")
    print("=" * 80)
    print(f"BASE_URL: {BASE_URL}")
    print(f"Admin: {ADMIN_PHONE}, Customer: {CUSTOMER_PHONE}, OTP: {OTP}")
    print()

    # Login as admin
    print("Logging in as admin...")
    admin_token = login(ADMIN_PHONE, OTP)
    if not admin_token:
        print("❌ FATAL: Admin login failed")
        sys.exit(1)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    print("✅ Admin login successful")
    print()

    # Login as customer
    print("Logging in as customer...")
    customer_token = login(CUSTOMER_PHONE, OTP)
    if not customer_token:
        print("❌ FATAL: Customer login failed")
        sys.exit(1)
    customer_headers = {"Authorization": f"Bearer {customer_token}"}
    print("✅ Customer login successful")
    print()

    # ========================================================================
    # TEST 1: SOCIAL/APPS → PUBLIC CONFIG
    # ========================================================================
    print("=" * 80)
    print("TEST 1: SOCIAL/APPS → PUBLIC CONFIG")
    print("=" * 80)
    
    # PUT /admin/settings with general settings
    general_settings = {
        "general": {
            "facebook_url": "https://facebook.com/azotest",
            "instagram_url": "",
            "playstore_url": "https://play.google.com/store/apps/details?id=com.azo",
            "appstore_url": "",
            "site_name": "AzoApp",
            "currency_symbol": "₹",
            "support_phone": "+91 90000 11111"
        }
    }
    
    try:
        resp = requests.put(f"{BASE_URL}/admin/settings", json=general_settings, headers=admin_headers, timeout=10)
        log_test("PUT /admin/settings with general settings", resp.status_code == 200, 
                 f"Status: {resp.status_code}, Response: {resp.text[:200]}")
        
        if resp.status_code == 200:
            # GET /site/config (no auth) to verify mapping
            resp = requests.get(f"{BASE_URL}/site/config", timeout=10)
            log_test("GET /site/config (no auth)", resp.status_code == 200, 
                     f"Status: {resp.status_code}")
            
            if resp.status_code == 200:
                config = resp.json()
                
                # Verify branding.social.facebook
                facebook = config.get("branding", {}).get("social", {}).get("facebook")
                log_test("branding.social.facebook == 'https://facebook.com/azotest'", 
                         facebook == "https://facebook.com/azotest",
                         f"Got: {facebook}")
                
                # Verify branding.social.instagram is empty/absent
                instagram = config.get("branding", {}).get("social", {}).get("instagram")
                log_test("branding.social.instagram is empty/absent (empty => omitted)", 
                         instagram == "" or instagram is None,
                         f"Got: {instagram}")
                
                # Verify apps.playstore
                playstore = config.get("apps", {}).get("playstore")
                log_test("apps.playstore == 'https://play.google.com/store/apps/details?id=com.azo'", 
                         playstore == "https://play.google.com/store/apps/details?id=com.azo",
                         f"Got: {playstore}")
                
                # Verify apps.appstore is empty
                appstore = config.get("apps", {}).get("appstore")
                log_test("apps.appstore == ''", 
                         appstore == "",
                         f"Got: {appstore}")
                
                # Verify business.site_name
                site_name = config.get("business", {}).get("site_name")
                log_test("business.site_name == 'AzoApp'", 
                         site_name == "AzoApp",
                         f"Got: {site_name}")
                
                # Verify business.currency_symbol
                currency_symbol = config.get("business", {}).get("currency_symbol")
                log_test("business.currency_symbol == '₹'", 
                         currency_symbol == "₹",
                         f"Got: {currency_symbol}")
    except Exception as e:
        log_test("TEST 1 execution", False, f"Exception: {e}")
    
    print()

    # ========================================================================
    # TEST 2: NESTED MERGE (no sibling wipe)
    # ========================================================================
    print("=" * 80)
    print("TEST 2: NESTED MERGE (no sibling wipe)")
    print("=" * 80)
    
    # PUT /admin/settings with only tagline
    tagline_update = {
        "general": {
            "tagline": "On-demand home services"
        }
    }
    
    try:
        resp = requests.put(f"{BASE_URL}/admin/settings", json=tagline_update, headers=admin_headers, timeout=10)
        log_test("PUT /admin/settings with only tagline", resp.status_code == 200, 
                 f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            # GET /admin/settings to verify facebook_url is preserved
            resp = requests.get(f"{BASE_URL}/admin/settings", headers=admin_headers, timeout=10)
            log_test("GET /admin/settings", resp.status_code == 200, 
                     f"Status: {resp.status_code}")
            
            if resp.status_code == 200:
                settings = resp.json()
                
                # Verify facebook_url is still present
                facebook_url = settings.get("general", {}).get("facebook_url")
                log_test("general.facebook_url STILL == 'https://facebook.com/azotest' (preserved)", 
                         facebook_url == "https://facebook.com/azotest",
                         f"Got: {facebook_url}")
                
                # Verify tagline is updated
                tagline = settings.get("general", {}).get("tagline")
                log_test("general.tagline == 'On-demand home services'", 
                         tagline == "On-demand home services",
                         f"Got: {tagline}")
    except Exception as e:
        log_test("TEST 2 execution", False, f"Exception: {e}")
    
    print()

    # ========================================================================
    # TEST 3: CHANGE HISTORY — NO FALSE RECORD
    # ========================================================================
    print("=" * 80)
    print("TEST 3: CHANGE HISTORY — NO FALSE RECORD")
    print("=" * 80)
    
    try:
        # GET /admin/settings-audit to note the newest entry id
        resp = requests.get(f"{BASE_URL}/admin/settings-audit?limit=5", headers=admin_headers, timeout=10)
        log_test("GET /admin/settings-audit (before no-op save)", resp.status_code == 200, 
                 f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            audit_before = resp.json()
            entries_before = audit_before.get("entries", [])
            newest_id_before = entries_before[0].get("id") if entries_before else None
            count_before = len(entries_before)
            
            print(f"   Newest entry id before: {newest_id_before}, count: {count_before}")
            
            # PUT /admin/settings with SAME facebook_url (no change)
            no_change_update = {
                "general": {
                    "facebook_url": "https://facebook.com/azotest"
                }
            }
            
            resp = requests.put(f"{BASE_URL}/admin/settings", json=no_change_update, headers=admin_headers, timeout=10)
            log_test("PUT /admin/settings with SAME facebook_url (no change)", resp.status_code == 200, 
                     f"Status: {resp.status_code}")
            
            if resp.status_code == 200:
                # GET /admin/settings-audit again
                resp = requests.get(f"{BASE_URL}/admin/settings-audit?limit=5", headers=admin_headers, timeout=10)
                log_test("GET /admin/settings-audit (after no-op save)", resp.status_code == 200, 
                         f"Status: {resp.status_code}")
                
                if resp.status_code == 200:
                    audit_after = resp.json()
                    entries_after = audit_after.get("entries", [])
                    newest_id_after = entries_after[0].get("id") if entries_after else None
                    count_after = len(entries_after)
                    
                    print(f"   Newest entry id after: {newest_id_after}, count: {count_after}")
                    
                    # Verify the newest entry id is UNCHANGED (no new audit row)
                    log_test("Newest entry id is UNCHANGED (no new audit row for no-op save)", 
                             newest_id_before == newest_id_after,
                             f"Before: {newest_id_before}, After: {newest_id_after}")
    except Exception as e:
        log_test("TEST 3 execution", False, f"Exception: {e}")
    
    print()

    # ========================================================================
    # TEST 4: CHANGE HISTORY — REAL CHANGE RECORDED
    # ========================================================================
    print("=" * 80)
    print("TEST 4: CHANGE HISTORY — REAL CHANGE RECORDED")
    print("=" * 80)
    
    try:
        # GET /admin/settings-audit to note the newest entry id
        resp = requests.get(f"{BASE_URL}/admin/settings-audit?limit=5", headers=admin_headers, timeout=10)
        if resp.status_code == 200:
            audit_before = resp.json()
            entries_before = audit_before.get("entries", [])
            newest_id_before = entries_before[0].get("id") if entries_before else None
            
            print(f"   Newest entry id before: {newest_id_before}")
            
            # PUT /admin/settings with NEW twitter_url
            twitter_update = {
                "general": {
                    "twitter_url": "https://x.com/azotest"
                }
            }
            
            resp = requests.put(f"{BASE_URL}/admin/settings", json=twitter_update, headers=admin_headers, timeout=10)
            log_test("PUT /admin/settings with NEW twitter_url", resp.status_code == 200, 
                     f"Status: {resp.status_code}")
            
            if resp.status_code == 200:
                # GET /admin/settings-audit again
                resp = requests.get(f"{BASE_URL}/admin/settings-audit?limit=5", headers=admin_headers, timeout=10)
                log_test("GET /admin/settings-audit (after real change)", resp.status_code == 200, 
                         f"Status: {resp.status_code}")
                
                if resp.status_code == 200:
                    audit_after = resp.json()
                    entries_after = audit_after.get("entries", [])
                    newest_entry = entries_after[0] if entries_after else None
                    newest_id_after = newest_entry.get("id") if newest_entry else None
                    
                    print(f"   Newest entry id after: {newest_id_after}")
                    
                    # Verify a NEW audit entry was created
                    log_test("NEW audit entry created (id changed)", 
                             newest_id_before != newest_id_after,
                             f"Before: {newest_id_before}, After: {newest_id_after}")
                    
                    # Verify the newest entry has a change with field "twitter_url"
                    if newest_entry:
                        changes = newest_entry.get("changes", [])
                        twitter_change = None
                        for change in changes:
                            if change.get("field") == "twitter_url":
                                twitter_change = change
                                break
                        
                        log_test("Newest entry has change with field 'twitter_url'", 
                                 twitter_change is not None,
                                 f"Changes: {changes}")
                        
                        if twitter_change:
                            log_test("twitter_url change has new value 'https://x.com/azotest'", 
                                     twitter_change.get("new") == "https://x.com/azotest",
                                     f"New value: {twitter_change.get('new')}")
    except Exception as e:
        log_test("TEST 4 execution", False, f"Exception: {e}")
    
    print()

    # ========================================================================
    # TEST 5: AUTH
    # ========================================================================
    print("=" * 80)
    print("TEST 5: AUTH")
    print("=" * 80)
    
    try:
        # Customer PUT /admin/settings should return 403
        resp = requests.put(f"{BASE_URL}/admin/settings", json={"general": {"site_name": "Test"}}, 
                           headers=customer_headers, timeout=10)
        log_test("Customer PUT /admin/settings → 403", 
                 resp.status_code == 403,
                 f"Status: {resp.status_code}")
        
        # Customer GET /admin/settings-audit should return 403
        resp = requests.get(f"{BASE_URL}/admin/settings-audit", headers=customer_headers, timeout=10)
        log_test("Customer GET /admin/settings-audit → 403", 
                 resp.status_code == 403,
                 f"Status: {resp.status_code}")
    except Exception as e:
        log_test("TEST 5 execution", False, f"Exception: {e}")
    
    print()

    # ========================================================================
    # TEST 6: NO 500 ERRORS
    # ========================================================================
    print("=" * 80)
    print("TEST 6: NO 500 ERRORS")
    print("=" * 80)
    
    # Check if any test encountered a 500 error
    has_500 = any("500" in test.get("details", "") for test in results["tests"])
    log_test("No 500 errors encountered", not has_500, 
             "All endpoints returned expected status codes")
    
    print()

    # ========================================================================
    # SUMMARY
    # ========================================================================
    print("=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Total tests: {results['total_tests']}")
    print(f"Passed: {results['passed']} ✅")
    print(f"Failed: {results['failed']} ❌")
    print(f"Pass rate: {results['passed'] / results['total_tests'] * 100:.1f}%")
    print()

    # Save results to file
    with open("/app/test_results_general_settings.json", "w") as f:
        json.dump(results, f, indent=2)
    print("Results saved to: /app/test_results_general_settings.json")
    print()

    # Exit with appropriate code
    sys.exit(0 if results['failed'] == 0 else 1)

if __name__ == "__main__":
    main()
