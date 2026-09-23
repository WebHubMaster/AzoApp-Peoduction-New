#!/usr/bin/env python3
"""
Backend test for PARTNER DAILY ONLINE + FUTURE AVAILABILITY feature.
Tests the new partner availability calendar endpoints and daily online logic.
"""
import requests
import json
from datetime import datetime, timedelta, timezone

# Configuration
BASE_URL = "https://partner-invoice-fix.preview.emergentagent.com/api"
OTP = "123456"

# Test accounts
PARTNER_PHONE = "+919000000003"
CUSTOMER_PHONE = "+919000000004"
ADMIN_PHONE = "+919000000000"

# IST timezone offset
IST_OFFSET = timedelta(hours=5, minutes=30)

def get_ist_now():
    """Get current datetime in IST"""
    return datetime.now(timezone.utc) + IST_OFFSET

def get_ist_date(days_offset=0):
    """Get IST date as YYYY-MM-DD string with optional days offset"""
    ist_now = get_ist_now()
    target_date = ist_now + timedelta(days=days_offset)
    return target_date.strftime("%Y-%m-%d")

# Compute test dates
TODAY = get_ist_date(0)
TODAY_PLUS_2 = get_ist_date(2)
TODAY_PLUS_3 = get_ist_date(3)
PAST_DATE = get_ist_date(-5)

print(f"IST TODAY: {TODAY}")
print(f"TODAY+2: {TODAY_PLUS_2}")
print(f"TODAY+3: {TODAY_PLUS_3}")
print(f"PAST DATE: {PAST_DATE}")
print()

# Test results
results = {
    "test_1_get_calendar": {"passed": 0, "failed": 0, "tests": []},
    "test_2_add_dates": {"passed": 0, "failed": 0, "tests": []},
    "test_3_remove_dates": {"passed": 0, "failed": 0, "tests": []},
    "test_4_daily_online": {"passed": 0, "failed": 0, "tests": []},
    "test_5_auto_online_data": {"passed": 0, "failed": 0, "tests": []},
    "test_6_auth_guard": {"passed": 0, "failed": 0, "tests": []},
    "test_7_no_500_errors": {"passed": 0, "failed": 0, "tests": []},
}

def auth_login(phone):
    """Login and return token"""
    # Send OTP
    r = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if r.status_code != 200:
        print(f"❌ Failed to send OTP for {phone}: {r.status_code}")
        return None
    
    # Verify OTP
    r = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    if r.status_code != 200:
        print(f"❌ Failed to verify OTP for {phone}: {r.status_code}")
        return None
    
    data = r.json()
    return data.get("token")

def test_result(category, test_name, passed, details=""):
    """Record test result"""
    results[category]["tests"].append({
        "name": test_name,
        "passed": passed,
        "details": details
    })
    if passed:
        results[category]["passed"] += 1
        print(f"  ✅ {test_name}")
    else:
        results[category]["failed"] += 1
        print(f"  ❌ {test_name}: {details}")

def main():
    print("=" * 80)
    print("PARTNER DAILY ONLINE + FUTURE AVAILABILITY - Backend Test")
    print("=" * 80)
    print()
    
    # Login
    print("🔐 Authenticating...")
    partner_token = auth_login(PARTNER_PHONE)
    customer_token = auth_login(CUSTOMER_PHONE)
    
    if not partner_token:
        print("❌ Failed to authenticate partner")
        return
    if not customer_token:
        print("❌ Failed to authenticate customer")
        return
    
    print(f"✅ Partner authenticated")
    print(f"✅ Customer authenticated")
    print()
    
    partner_headers = {"Authorization": f"Bearer {partner_token}"}
    customer_headers = {"Authorization": f"Bearer {customer_token}"}
    
    # Track all status codes for 500 check
    all_status_codes = []
    
    # TEST 1: GET calendar
    print("TEST 1: GET /api/partner/availability/calendar")
    print("-" * 80)
    r = requests.get(f"{BASE_URL}/partner/availability/calendar", headers=partner_headers)
    all_status_codes.append(r.status_code)
    
    if r.status_code == 200:
        test_result("test_1_get_calendar", "GET calendar returns 200", True)
        data = r.json()
        
        # Check required keys
        has_online_today = "online_today" in data
        test_result("test_1_get_calendar", "Response has 'online_today' key", has_online_today, 
                   f"Keys: {list(data.keys())}")
        
        has_online_date = "online_date" in data
        test_result("test_1_get_calendar", "Response has 'online_date' key", has_online_date)
        
        has_today = "today" in data
        test_result("test_1_get_calendar", "Response has 'today' key", has_today)
        
        has_dates = "dates" in data
        test_result("test_1_get_calendar", "Response has 'dates' key", has_dates)
        
        # Check today matches IST today
        if has_today:
            today_matches = data["today"] == TODAY
            test_result("test_1_get_calendar", f"'today' == IST today ({TODAY})", today_matches,
                       f"Got: {data.get('today')}")
        
        # Check online_today is boolean
        if has_online_today:
            is_bool = isinstance(data["online_today"], bool)
            test_result("test_1_get_calendar", "'online_today' is boolean", is_bool,
                       f"Type: {type(data['online_today'])}")
        
        # Check dates is array
        if has_dates:
            is_array = isinstance(data["dates"], list)
            test_result("test_1_get_calendar", "'dates' is array", is_array,
                       f"Type: {type(data['dates'])}")
        
        print(f"Response: {json.dumps(data, indent=2)}")
    else:
        test_result("test_1_get_calendar", "GET calendar returns 200", False, 
                   f"Status: {r.status_code}, Body: {r.text[:200]}")
    print()
    
    # TEST 2: ADD dates
    print("TEST 2: POST /api/partner/availability/calendar (ADD dates)")
    print("-" * 80)
    
    # 2a: Add TODAY+2 and TODAY+3
    print(f"Adding dates: {TODAY_PLUS_2}, {TODAY_PLUS_3}")
    r = requests.post(f"{BASE_URL}/partner/availability/calendar", 
                     headers=partner_headers,
                     json={"dates": [TODAY_PLUS_2, TODAY_PLUS_3]})
    all_status_codes.append(r.status_code)
    
    if r.status_code == 200:
        test_result("test_2_add_dates", "POST add dates returns 200", True)
        data = r.json()
        dates = data.get("dates", [])
        
        # Check both dates present
        has_plus_2 = TODAY_PLUS_2 in dates
        test_result("test_2_add_dates", f"Response includes {TODAY_PLUS_2}", has_plus_2,
                   f"Dates: {dates}")
        
        has_plus_3 = TODAY_PLUS_3 in dates
        test_result("test_2_add_dates", f"Response includes {TODAY_PLUS_3}", has_plus_3,
                   f"Dates: {dates}")
        
        # Check sorted ascending
        if len(dates) >= 2:
            is_sorted = dates == sorted(dates)
            test_result("test_2_add_dates", "Dates are sorted ascending", is_sorted,
                       f"Dates: {dates}")
        
        print(f"Response dates: {dates}")
    else:
        test_result("test_2_add_dates", "POST add dates returns 200", False,
                   f"Status: {r.status_code}, Body: {r.text[:200]}")
    print()
    
    # 2b: Add PAST date (should return 400 since all dates are invalid)
    print(f"Adding ONLY PAST date: {PAST_DATE} (all-invalid should return 400)")
    r = requests.post(f"{BASE_URL}/partner/availability/calendar",
                     headers=partner_headers,
                     json={"dates": [PAST_DATE]})
    all_status_codes.append(r.status_code)
    
    is_400 = r.status_code == 400
    test_result("test_2_add_dates", "POST only past date returns 400 (all-invalid)", is_400,
               f"Status: {r.status_code}")
    print()
    
    # 2c: Add mix of valid and past dates (past should be filtered out)
    print(f"Adding mix: valid {TODAY_PLUS_2} + past {PAST_DATE} (past filtered)")
    r = requests.post(f"{BASE_URL}/partner/availability/calendar",
                     headers=partner_headers,
                     json={"dates": [TODAY_PLUS_2, PAST_DATE]})
    all_status_codes.append(r.status_code)
    
    if r.status_code == 200:
        test_result("test_2_add_dates", "POST mix valid+past returns 200", True)
        data = r.json()
        dates = data.get("dates", [])
        
        # Valid date should be present
        has_valid = TODAY_PLUS_2 in dates
        test_result("test_2_add_dates", f"Valid date {TODAY_PLUS_2} in dates", has_valid,
                   f"Dates: {dates}")
        
        # Past date should NOT be in dates (filtered)
        past_filtered = PAST_DATE not in dates
        test_result("test_2_add_dates", f"Past date {PAST_DATE} NOT in dates (filtered)", past_filtered,
                   f"Dates: {dates}")
        
        print(f"Response dates: {dates}")
    else:
        test_result("test_2_add_dates", "POST mix valid+past returns 200", False,
                   f"Status: {r.status_code}")
    print()
    
    # 2d: Empty dates array (should return 400)
    print("Adding empty dates array (should return 400)")
    r = requests.post(f"{BASE_URL}/partner/availability/calendar",
                     headers=partner_headers,
                     json={"dates": []})
    all_status_codes.append(r.status_code)
    
    is_400 = r.status_code == 400
    test_result("test_2_add_dates", "POST empty dates returns 400", is_400,
               f"Status: {r.status_code}")
    print()
    
    # 2e: Re-add TODAY+2 (idempotent - no duplicate)
    print(f"Re-adding {TODAY_PLUS_2} (idempotent test)")
    r = requests.post(f"{BASE_URL}/partner/availability/calendar",
                     headers=partner_headers,
                     json={"dates": [TODAY_PLUS_2]})
    all_status_codes.append(r.status_code)
    
    if r.status_code == 200:
        test_result("test_2_add_dates", "POST re-add date returns 200", True)
        data = r.json()
        dates = data.get("dates", [])
        
        # Count occurrences of TODAY+2 (should be exactly 1)
        count = dates.count(TODAY_PLUS_2)
        is_idempotent = count == 1
        test_result("test_2_add_dates", f"{TODAY_PLUS_2} appears exactly once (idempotent)", is_idempotent,
                   f"Count: {count}, Dates: {dates}")
        
        print(f"Response dates: {dates}")
    else:
        test_result("test_2_add_dates", "POST re-add date returns 200", False,
                   f"Status: {r.status_code}")
    print()
    
    # TEST 3: REMOVE dates
    print("TEST 3: DELETE /api/partner/availability/calendar (REMOVE dates)")
    print("-" * 80)
    
    print(f"Removing date: {TODAY_PLUS_2}")
    r = requests.delete(f"{BASE_URL}/partner/availability/calendar",
                       headers=partner_headers,
                       json={"dates": [TODAY_PLUS_2]})
    all_status_codes.append(r.status_code)
    
    if r.status_code == 200:
        test_result("test_3_remove_dates", "DELETE date returns 200", True)
        data = r.json()
        dates = data.get("dates", [])
        
        # TODAY+2 should NOT be present
        plus_2_removed = TODAY_PLUS_2 not in dates
        test_result("test_3_remove_dates", f"{TODAY_PLUS_2} no longer in dates", plus_2_removed,
                   f"Dates: {dates}")
        
        # TODAY+3 should still be present
        plus_3_remains = TODAY_PLUS_3 in dates
        test_result("test_3_remove_dates", f"{TODAY_PLUS_3} still in dates", plus_3_remains,
                   f"Dates: {dates}")
        
        print(f"Response dates: {dates}")
    else:
        test_result("test_3_remove_dates", "DELETE date returns 200", False,
                   f"Status: {r.status_code}, Body: {r.text[:200]}")
    print()
    
    # TEST 4: DAILY ONLINE
    print("TEST 4: PUT /api/partner/availability (DAILY ONLINE)")
    print("-" * 80)
    
    # 4a: Set online
    print("Setting mode to 'online'")
    r = requests.put(f"{BASE_URL}/partner/availability",
                    headers=partner_headers,
                    json={"mode": "online"})
    all_status_codes.append(r.status_code)
    
    if r.status_code == 200:
        test_result("test_4_daily_online", "PUT online returns 200", True)
        data = r.json()
        
        # Check partner_status is 'online'
        status_online = data.get("partner_status") == "online"
        test_result("test_4_daily_online", "partner_status == 'online'", status_online,
                   f"Got: {data.get('partner_status')}")
        
        # Check online_date is today
        online_date_today = data.get("online_date") == TODAY
        test_result("test_4_daily_online", f"online_date == today ({TODAY})", online_date_today,
                   f"Got: {data.get('online_date')}")
        
        print(f"Response: {json.dumps(data, indent=2)}")
    else:
        test_result("test_4_daily_online", "PUT online returns 200", False,
                   f"Status: {r.status_code}, Body: {r.text[:200]}")
    print()
    
    # 4b: GET calendar to verify online_today
    print("GET calendar to verify online_today == true")
    r = requests.get(f"{BASE_URL}/partner/availability/calendar", headers=partner_headers)
    all_status_codes.append(r.status_code)
    
    if r.status_code == 200:
        data = r.json()
        online_today_true = data.get("online_today") == True
        test_result("test_4_daily_online", "GET calendar: online_today == true", online_today_true,
                   f"Got: {data.get('online_today')}")
        
        online_date_matches = data.get("online_date") == TODAY
        test_result("test_4_daily_online", f"GET calendar: online_date == today ({TODAY})", online_date_matches,
                   f"Got: {data.get('online_date')}")
        
        print(f"online_today: {data.get('online_today')}, online_date: {data.get('online_date')}")
    else:
        test_result("test_4_daily_online", "GET calendar after online", False,
                   f"Status: {r.status_code}")
    print()
    
    # 4c: Set offline
    print("Setting mode to 'offline'")
    r = requests.put(f"{BASE_URL}/partner/availability",
                    headers=partner_headers,
                    json={"mode": "offline"})
    all_status_codes.append(r.status_code)
    
    if r.status_code == 200:
        test_result("test_4_daily_online", "PUT offline returns 200", True)
        print(f"Response: {json.dumps(r.json(), indent=2)}")
    else:
        test_result("test_4_daily_online", "PUT offline returns 200", False,
                   f"Status: {r.status_code}")
    print()
    
    # 4d: GET calendar to verify online_today is false
    print("GET calendar to verify online_today == false")
    r = requests.get(f"{BASE_URL}/partner/availability/calendar", headers=partner_headers)
    all_status_codes.append(r.status_code)
    
    if r.status_code == 200:
        data = r.json()
        online_today_false = data.get("online_today") == False
        test_result("test_4_daily_online", "GET calendar: online_today == false", online_today_false,
                   f"Got: {data.get('online_today')}")
        
        print(f"online_today: {data.get('online_today')}")
    else:
        test_result("test_4_daily_online", "GET calendar after offline", False,
                   f"Status: {r.status_code}")
    print()
    
    # TEST 5: AUTO-ONLINE DATA
    print("TEST 5: AUTO-ONLINE via calendar (POST today's date)")
    print("-" * 80)
    
    print(f"Adding TODAY ({TODAY}) to calendar")
    r = requests.post(f"{BASE_URL}/partner/availability/calendar",
                     headers=partner_headers,
                     json={"dates": [TODAY]})
    all_status_codes.append(r.status_code)
    
    if r.status_code == 200:
        test_result("test_5_auto_online_data", "POST today's date returns 200", True)
        data = r.json()
        dates = data.get("dates", [])
        
        # TODAY should be in dates
        today_in_dates = TODAY in dates
        test_result("test_5_auto_online_data", f"TODAY ({TODAY}) in dates", today_in_dates,
                   f"Dates: {dates}")
        
        print(f"Response dates: {dates}")
        print("NOTE: The periodic sweep auto-onlines calendar-available partners.")
        print("      It may take up to 5 min. Endpoint + stored date are correct.")
    else:
        test_result("test_5_auto_online_data", "POST today's date returns 200", False,
                   f"Status: {r.status_code}")
    print()
    
    # TEST 6: AUTH GUARD
    print("TEST 6: AUTH GUARD (Customer should get 403)")
    print("-" * 80)
    
    # 6a: Customer GET calendar
    print("Customer GET /api/partner/availability/calendar")
    r = requests.get(f"{BASE_URL}/partner/availability/calendar", headers=customer_headers)
    all_status_codes.append(r.status_code)
    
    is_403 = r.status_code == 403
    test_result("test_6_auth_guard", "Customer GET calendar returns 403", is_403,
               f"Status: {r.status_code}")
    print()
    
    # 6b: Customer POST calendar
    print("Customer POST /api/partner/availability/calendar")
    r = requests.post(f"{BASE_URL}/partner/availability/calendar",
                     headers=customer_headers,
                     json={"dates": [TODAY_PLUS_2]})
    all_status_codes.append(r.status_code)
    
    is_403 = r.status_code == 403
    test_result("test_6_auth_guard", "Customer POST calendar returns 403", is_403,
               f"Status: {r.status_code}")
    print()
    
    # TEST 7: NO 500 ERRORS
    print("TEST 7: NO 500 ERRORS")
    print("-" * 80)
    
    has_500 = any(code >= 500 for code in all_status_codes)
    no_500 = not has_500
    test_result("test_7_no_500_errors", "No 500 errors in any request", no_500,
               f"Status codes: {all_status_codes}")
    print()
    
    # Summary
    print("=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    total_passed = 0
    total_failed = 0
    
    for category, result in results.items():
        passed = result["passed"]
        failed = result["failed"]
        total = passed + failed
        total_passed += passed
        total_failed += failed
        
        status = "✅ PASS" if failed == 0 else "❌ FAIL"
        print(f"{status} {category}: {passed}/{total} tests passed")
    
    print()
    print(f"OVERALL: {total_passed}/{total_passed + total_failed} tests passed")
    
    if total_failed == 0:
        print("✅ ALL TESTS PASSED")
    else:
        print(f"❌ {total_failed} TESTS FAILED")
    
    # Save results
    with open("/app/test_results_partner_availability.json", "w") as f:
        json.dump({
            "summary": {
                "total_passed": total_passed,
                "total_failed": total_failed,
                "total_tests": total_passed + total_failed
            },
            "results": results,
            "all_status_codes": all_status_codes,
            "test_dates": {
                "TODAY": TODAY,
                "TODAY_PLUS_2": TODAY_PLUS_2,
                "TODAY_PLUS_3": TODAY_PLUS_3,
                "PAST_DATE": PAST_DATE
            }
        }, f, indent=2)
    
    print()
    print("Results saved to: /app/test_results_partner_availability.json")

if __name__ == "__main__":
    main()
