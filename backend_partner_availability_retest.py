#!/usr/bin/env python3
"""
Partner Availability Retest - Date-wise status + max-7 cap
Tests the new POST /api/partner/availability/calendar/set endpoint
"""
import requests
import json
from datetime import datetime, timedelta, timezone

# Configuration
BASE_URL = "https://fullscreen-alert-fix.preview.emergentagent.com/api"
PARTNER_PHONE = "+919000000003"
CUSTOMER_PHONE = "+919000000004"
OTP = "123456"

# IST timezone (UTC+5:30)
IST = timezone(timedelta(hours=5, minutes=30))

def ist_now():
    """Get current time in IST"""
    return datetime.now(IST)

def compute_dates():
    """Compute IST dates: TODAY, TODAY+1...TODAY+8, TODAY-3"""
    now = ist_now()
    today = now.date()
    dates = {
        "TODAY": today.isoformat(),
        "TODAY-3": (today - timedelta(days=3)).isoformat(),
    }
    for i in range(1, 9):
        dates[f"TODAY+{i}"] = (today + timedelta(days=i)).isoformat()
    return dates

def login(phone):
    """Login and get token"""
    # Send OTP
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if resp.status_code != 200:
        raise Exception(f"Send OTP failed: {resp.status_code} {resp.text}")
    
    # Verify OTP
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    if resp.status_code != 200:
        raise Exception(f"Verify OTP failed: {resp.status_code} {resp.text}")
    
    data = resp.json()
    return data.get("token")

def test_get_calendar(token):
    """TEST 1: GET calendar returns correct structure"""
    print("\n" + "="*80)
    print("TEST 1: GET /api/partner/availability/calendar")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{BASE_URL}/partner/availability/calendar", headers=headers)
    
    print(f"Status: {resp.status_code}")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    
    data = resp.json()
    print(f"Response keys: {list(data.keys())}")
    
    # Check required keys
    required_keys = ["calendar", "dates", "available_count", "max_available", "today", "online_today"]
    for key in required_keys:
        assert key in data, f"Missing key: {key}"
        print(f"✓ Has key: {key}")
    
    # Check types
    assert isinstance(data["calendar"], list), "calendar should be a list"
    assert isinstance(data["dates"], list), "dates should be a list"
    assert isinstance(data["available_count"], int), "available_count should be int"
    assert isinstance(data["max_available"], int), "max_available should be int"
    assert isinstance(data["online_today"], bool), "online_today should be bool"
    
    # Check max_available == 7
    assert data["max_available"] == 7, f"max_available should be 7, got {data['max_available']}"
    print(f"✓ max_available == 7")
    
    # Check today matches IST today
    dates = compute_dates()
    assert data["today"] == dates["TODAY"], f"today should be {dates['TODAY']}, got {data['today']}"
    print(f"✓ today == {dates['TODAY']} (IST)")
    
    print(f"\nCurrent state:")
    print(f"  available_count: {data['available_count']}")
    print(f"  dates: {data['dates']}")
    print(f"  calendar entries: {len(data['calendar'])}")
    
    return data

def clean_slate(token):
    """Clean slate: mark all existing available dates as unavailable"""
    print("\n" + "="*80)
    print("SETUP: Clean slate - marking all available dates as unavailable")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get current calendar
    resp = requests.get(f"{BASE_URL}/partner/availability/calendar", headers=headers)
    data = resp.json()
    
    available_dates = data.get("dates", [])
    print(f"Found {len(available_dates)} available dates: {available_dates}")
    
    # Mark each as unavailable
    for date in available_dates:
        resp = requests.post(
            f"{BASE_URL}/partner/availability/calendar/set",
            headers=headers,
            json={"date": date, "status": "unavailable"}
        )
        if resp.status_code == 200:
            print(f"✓ Marked {date} as unavailable")
        else:
            print(f"✗ Failed to mark {date} as unavailable: {resp.status_code}")
    
    # Verify clean slate
    resp = requests.get(f"{BASE_URL}/partner/availability/calendar", headers=headers)
    data = resp.json()
    print(f"\nAfter cleanup: available_count = {data['available_count']}")
    
    return data["available_count"]

def test_set_available(token, dates):
    """TEST 2: SET available status"""
    print("\n" + "="*80)
    print("TEST 2: POST /api/partner/availability/calendar/set (available)")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    date = dates["TODAY+1"]
    
    print(f"Setting {date} (TODAY+1) to available...")
    resp = requests.post(
        f"{BASE_URL}/partner/availability/calendar/set",
        headers=headers,
        json={"date": date, "status": "available"}
    )
    
    print(f"Status: {resp.status_code}")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    
    data = resp.json()
    
    # Check that date is in calendar with status 'available'
    calendar_entry = next((c for c in data["calendar"] if c["date"] == date), None)
    assert calendar_entry is not None, f"Date {date} not in calendar"
    assert calendar_entry["status"] == "available", f"Status should be 'available', got {calendar_entry['status']}"
    print(f"✓ Calendar contains {date} with status 'available'")
    
    # Check that date is in dates list
    assert date in data["dates"], f"Date {date} not in dates list"
    print(f"✓ Date {date} is in dates list")
    
    # Check available_count incremented
    assert data["available_count"] >= 1, f"available_count should be >= 1, got {data['available_count']}"
    print(f"✓ available_count = {data['available_count']}")
    
    return data

def test_toggle_unavailable(token, dates):
    """TEST 3: TOGGLE to unavailable"""
    print("\n" + "="*80)
    print("TEST 3: POST /api/partner/availability/calendar/set (unavailable)")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    date = dates["TODAY+1"]
    
    print(f"Setting {date} (TODAY+1) to unavailable...")
    resp = requests.post(
        f"{BASE_URL}/partner/availability/calendar/set",
        headers=headers,
        json={"date": date, "status": "unavailable"}
    )
    
    print(f"Status: {resp.status_code}")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    
    data = resp.json()
    
    # Check that date is in calendar with status 'unavailable'
    calendar_entry = next((c for c in data["calendar"] if c["date"] == date), None)
    if calendar_entry:
        assert calendar_entry["status"] == "unavailable", f"Status should be 'unavailable', got {calendar_entry['status']}"
        print(f"✓ Calendar entry for {date} has status 'unavailable'")
    else:
        print(f"✓ Date {date} removed from calendar (also acceptable)")
    
    # Check that date is NOT in dates list
    assert date not in data["dates"], f"Date {date} should not be in dates list"
    print(f"✓ Date {date} is NOT in dates list")
    
    return data

def test_max_7_cap(token, dates):
    """TEST 4: MAX-7 CAP enforcement"""
    print("\n" + "="*80)
    print("TEST 4: MAX-7 CAP enforcement")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # First, ensure we start with 0 available dates
    print("\nStep 1: Ensuring clean slate (0 available dates)...")
    clean_slate(token)
    
    # Add 7 dates (TODAY+1 through TODAY+7)
    print("\nStep 2: Adding 7 available dates (TODAY+1 through TODAY+7)...")
    for i in range(1, 8):
        date = dates[f"TODAY+{i}"]
        resp = requests.post(
            f"{BASE_URL}/partner/availability/calendar/set",
            headers=headers,
            json={"date": date, "status": "available"}
        )
        print(f"  {date}: {resp.status_code}")
        assert resp.status_code == 200, f"Expected 200 for {date}, got {resp.status_code}"
    
    # Verify we have 7 available dates
    resp = requests.get(f"{BASE_URL}/partner/availability/calendar", headers=headers)
    data = resp.json()
    assert data["available_count"] == 7, f"Should have 7 available dates, got {data['available_count']}"
    print(f"✓ Successfully added 7 available dates")
    
    # Try to add 8th date (TODAY+8) - should fail with 400
    print("\nStep 3: Trying to add 8th date (TODAY+8) - should fail...")
    date8 = dates["TODAY+8"]
    resp = requests.post(
        f"{BASE_URL}/partner/availability/calendar/set",
        headers=headers,
        json={"date": date8, "status": "available"}
    )
    print(f"  Status: {resp.status_code}")
    assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
    
    # Check error message contains "maximum of 7"
    error_msg = resp.json().get("detail", "")
    assert "maximum of 7" in error_msg.lower() or "7" in error_msg, f"Error message should mention max 7: {error_msg}"
    print(f"✓ Got 400 with message: {error_msg}")
    
    # Free a slot by marking TODAY+1 as unavailable
    print("\nStep 4: Freeing a slot by marking TODAY+1 as unavailable...")
    resp = requests.post(
        f"{BASE_URL}/partner/availability/calendar/set",
        headers=headers,
        json={"date": dates["TODAY+1"], "status": "unavailable"}
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert data["available_count"] == 6, f"Should have 6 available dates, got {data['available_count']}"
    print(f"✓ Freed a slot, now have {data['available_count']} available dates")
    
    # Retry adding TODAY+8 - should now succeed
    print("\nStep 5: Retrying TODAY+8 - should now succeed...")
    resp = requests.post(
        f"{BASE_URL}/partner/availability/calendar/set",
        headers=headers,
        json={"date": date8, "status": "available"}
    )
    print(f"  Status: {resp.status_code}")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert data["available_count"] == 7, f"Should have 7 available dates, got {data['available_count']}"
    assert date8 in data["dates"], f"TODAY+8 should be in dates list"
    print(f"✓ Successfully added TODAY+8 after freeing a slot")
    
    return data

def test_validation(token, dates):
    """TEST 5: VALIDATION (past dates, bad status, bad date format)"""
    print("\n" + "="*80)
    print("TEST 5: VALIDATION")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test 5a: Past date should return 400
    print("\nTest 5a: Past date (TODAY-3) should return 400...")
    resp = requests.post(
        f"{BASE_URL}/partner/availability/calendar/set",
        headers=headers,
        json={"date": dates["TODAY-3"], "status": "available"}
    )
    print(f"  Status: {resp.status_code}")
    assert resp.status_code == 400, f"Expected 400 for past date, got {resp.status_code}"
    print(f"  Error: {resp.json().get('detail', '')}")
    print(f"✓ Past date rejected with 400")
    
    # Test 5b: Bad status should return 400
    print("\nTest 5b: Bad status ('weird') should return 400...")
    resp = requests.post(
        f"{BASE_URL}/partner/availability/calendar/set",
        headers=headers,
        json={"date": dates["TODAY+1"], "status": "weird"}
    )
    print(f"  Status: {resp.status_code}")
    assert resp.status_code == 400, f"Expected 400 for bad status, got {resp.status_code}"
    print(f"  Error: {resp.json().get('detail', '')}")
    print(f"✓ Bad status rejected with 400")
    
    # Test 5c: Bad date format should return 400
    print("\nTest 5c: Bad date format ('2026/13/40') should return 400...")
    resp = requests.post(
        f"{BASE_URL}/partner/availability/calendar/set",
        headers=headers,
        json={"date": "2026/13/40", "status": "available"}
    )
    print(f"  Status: {resp.status_code}")
    assert resp.status_code == 400, f"Expected 400 for bad date format, got {resp.status_code}"
    print(f"  Error: {resp.json().get('detail', '')}")
    print(f"✓ Bad date format rejected with 400")
    
    return True

def test_auth(customer_token):
    """TEST 6: AUTH - Customer should get 403"""
    print("\n" + "="*80)
    print("TEST 6: AUTH - Customer should get 403")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {customer_token}"}
    dates = compute_dates()
    
    print(f"Customer attempting POST /api/partner/availability/calendar/set...")
    resp = requests.post(
        f"{BASE_URL}/partner/availability/calendar/set",
        headers=headers,
        json={"date": dates["TODAY+1"], "status": "available"}
    )
    
    print(f"Status: {resp.status_code}")
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
    print(f"✓ Customer correctly denied with 403")
    
    return True

def main():
    print("="*80)
    print("PARTNER AVAILABILITY RETEST - Date-wise status + max-7 cap")
    print("="*80)
    print(f"BASE_URL: {BASE_URL}")
    print(f"Partner: {PARTNER_PHONE}")
    print(f"Customer: {CUSTOMER_PHONE}")
    print(f"OTP: {OTP}")
    
    # Compute IST dates
    dates = compute_dates()
    print(f"\nIST Dates:")
    for key, value in dates.items():
        print(f"  {key}: {value}")
    
    results = {
        "total": 0,
        "passed": 0,
        "failed": 0,
        "errors": []
    }
    
    try:
        # Login as partner
        print("\n" + "="*80)
        print("SETUP: Partner Login")
        print("="*80)
        partner_token = login(PARTNER_PHONE)
        print(f"✓ Partner logged in successfully")
        
        # Login as customer
        print("\n" + "="*80)
        print("SETUP: Customer Login")
        print("="*80)
        customer_token = login(CUSTOMER_PHONE)
        print(f"✓ Customer logged in successfully")
        
        # Clean slate
        initial_count = clean_slate(partner_token)
        
        # Run tests
        tests = [
            ("GET calendar", lambda: test_get_calendar(partner_token)),
            ("SET available", lambda: test_set_available(partner_token, dates)),
            ("TOGGLE unavailable", lambda: test_toggle_unavailable(partner_token, dates)),
            ("MAX-7 CAP", lambda: test_max_7_cap(partner_token, dates)),
            ("VALIDATION", lambda: test_validation(partner_token, dates)),
            ("AUTH", lambda: test_auth(customer_token)),
        ]
        
        for test_name, test_func in tests:
            results["total"] += 1
            try:
                test_func()
                results["passed"] += 1
                print(f"\n✅ TEST PASSED: {test_name}")
            except AssertionError as e:
                results["failed"] += 1
                results["errors"].append(f"{test_name}: {str(e)}")
                print(f"\n❌ TEST FAILED: {test_name}")
                print(f"   Error: {str(e)}")
            except Exception as e:
                results["failed"] += 1
                results["errors"].append(f"{test_name}: {str(e)}")
                print(f"\n❌ TEST ERROR: {test_name}")
                print(f"   Error: {str(e)}")
        
        # Summary
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        print(f"Total tests: {results['total']}")
        print(f"Passed: {results['passed']}")
        print(f"Failed: {results['failed']}")
        print(f"Success rate: {results['passed']/results['total']*100:.1f}%")
        
        if results["errors"]:
            print("\nErrors:")
            for error in results["errors"]:
                print(f"  - {error}")
        
        # Save results
        with open("/app/test_results_partner_availability_retest.json", "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nResults saved to: /app/test_results_partner_availability_retest.json")
        
        # Check for 500 errors
        print("\n" + "="*80)
        print("TEST 7: No 500 errors")
        print("="*80)
        if results["failed"] == 0:
            print("✓ All tests passed with expected status codes (200/400/403)")
            print("✓ No 500 errors encountered")
        else:
            print("⚠ Some tests failed - check if any were 500 errors")
        
        return results["failed"] == 0
        
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
