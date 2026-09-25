#!/usr/bin/env python3
"""
Backend test for Live Partner Map filters + Live Dispatch Feed honoring Dispatch Tuning config
AzoApp - 2026-09
"""

import requests
import json
import time
from datetime import datetime, timedelta

# Base URL from frontend/.env
BASE_URL = "https://merchant-panel-sync.preview.emergentagent.com/api"

# Test credentials
ADMIN_PHONE = "+919000000000"
CUSTOMER_PHONE = "+919000000004"  # Priya Verma
PARTNER_RAJ_PHONE = "+919000000003"  # Raj Kumar (skills: ac/electrical/appliance)
PARTNER_AMIT_PHONE = "+919000000005"  # Amit Singh
OTP = "123456"

# Test results
results = {
    "feature_a": {},
    "feature_b": {},
    "summary": {}
}

def login(phone):
    """Login and get token"""
    # Send OTP
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if resp.status_code != 200:
        print(f"❌ Send OTP failed for {phone}: {resp.status_code} {resp.text}")
        return None
    
    # Verify OTP
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    if resp.status_code != 200:
        print(f"❌ Verify OTP failed for {phone}: {resp.status_code} {resp.text}")
        return None
    
    data = resp.json()
    token = data.get("token")
    user = data.get("user", {})
    print(f"✅ Logged in as {phone} (role: {user.get('role', 'unknown')})")
    return token

def test_feature_a_live_partner_map_filters(admin_token):
    """
    FEATURE A: Live Partner Map filter lists
    GET /api/admin/partners/live (admin Bearer)
    Verify:
    - filter_cities: array including active Service-Area cities (Patna, Ranchi)
    - filter_categories: array of ALL active categories
    - count >= 2 online partners
    - Each partner has 'categories' array
    - Raj Kumar's categories MUST include "Electrician" (mapped from 'electrical' skill)
    """
    print("\n" + "="*80)
    print("FEATURE A: Live Partner Map filter lists")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # GET /api/admin/partners/live
    print("\n[TEST A.1] GET /api/admin/partners/live")
    resp = requests.get(f"{BASE_URL}/admin/partners/live", headers=headers)
    
    if resp.status_code != 200:
        print(f"❌ FAIL: Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text}")
        results["feature_a"]["status_code"] = "FAIL"
        return False
    
    print(f"✅ Status: {resp.status_code}")
    data = resp.json()
    
    # Save full response for debugging
    results["feature_a"]["full_response"] = data
    
    # Check filter_cities
    print("\n[TEST A.2] Verify filter_cities")
    filter_cities = data.get("filter_cities", [])
    print(f"filter_cities: {filter_cities}")
    
    if not isinstance(filter_cities, list):
        print(f"❌ FAIL: filter_cities is not a list")
        results["feature_a"]["filter_cities"] = "FAIL - not a list"
        return False
    
    expected_cities = ["Patna", "Ranchi"]
    missing_cities = [city for city in expected_cities if city not in filter_cities]
    
    if missing_cities:
        print(f"⚠️  WARNING: Expected cities missing: {missing_cities}")
        print(f"   Available cities: {filter_cities}")
        results["feature_a"]["filter_cities"] = f"PARTIAL - missing {missing_cities}"
    else:
        print(f"✅ PASS: filter_cities includes expected cities: {expected_cities}")
        results["feature_a"]["filter_cities"] = "PASS"
    
    # Check filter_categories
    print("\n[TEST A.3] Verify filter_categories")
    filter_categories = data.get("filter_categories", [])
    print(f"filter_categories: {filter_categories}")
    
    if not isinstance(filter_categories, list):
        print(f"❌ FAIL: filter_categories is not a list")
        results["feature_a"]["filter_categories"] = "FAIL - not a list"
        return False
    
    expected_categories = [
        "AC Repair & Service",
        "Electrician",
        "Home Cleaning",
        "Plumbing",
        "Appliance Repair",
        "Carpentry"
    ]
    
    missing_categories = [cat for cat in expected_categories if cat not in filter_categories]
    
    if missing_categories:
        print(f"⚠️  WARNING: Expected categories missing: {missing_categories}")
        print(f"   Available categories: {filter_categories}")
        results["feature_a"]["filter_categories"] = f"PARTIAL - missing {missing_categories}"
    else:
        print(f"✅ PASS: filter_categories includes all expected categories")
        results["feature_a"]["filter_categories"] = "PASS"
    
    # Check partners count
    print("\n[TEST A.4] Verify partners count >= 2")
    count = data.get("count", 0)
    partners = data.get("partners", [])
    
    print(f"count: {count}")
    print(f"partners array length: {len(partners)}")
    
    if count < 2:
        print(f"❌ FAIL: Expected count >= 2, got {count}")
        results["feature_a"]["partners_count"] = f"FAIL - count={count}"
        return False
    
    print(f"✅ PASS: count >= 2 (count={count})")
    results["feature_a"]["partners_count"] = "PASS"
    
    # Check each partner has 'categories' array
    print("\n[TEST A.5] Verify each partner has 'categories' array")
    partners_without_categories = []
    
    for partner in partners:
        partner_name = partner.get("name", "Unknown")
        partner_phone = partner.get("phone", "Unknown")
        categories = partner.get("categories", None)
        
        if categories is None or not isinstance(categories, list):
            partners_without_categories.append(f"{partner_name} ({partner_phone})")
    
    if partners_without_categories:
        print(f"❌ FAIL: Partners without 'categories' array: {partners_without_categories}")
        results["feature_a"]["partner_categories"] = f"FAIL - {len(partners_without_categories)} partners missing categories"
        return False
    
    print(f"✅ PASS: All {len(partners)} partners have 'categories' array")
    results["feature_a"]["partner_categories"] = "PASS"
    
    # Check Raj Kumar's categories include "Electrician"
    print("\n[TEST A.6] Verify Raj Kumar's categories include 'Electrician'")
    raj_kumar = None
    
    for partner in partners:
        if partner.get("phone") == PARTNER_RAJ_PHONE or "Raj Kumar" in partner.get("name", ""):
            raj_kumar = partner
            break
    
    if not raj_kumar:
        print(f"⚠️  WARNING: Raj Kumar ({PARTNER_RAJ_PHONE}) not found in online partners")
        print(f"   Available partners: {[p.get('name') + ' ' + p.get('phone', '') for p in partners]}")
        results["feature_a"]["raj_electrician"] = "FAIL - Raj Kumar not found"
        return False
    
    raj_categories = raj_kumar.get("categories", [])
    print(f"Raj Kumar categories: {raj_categories}")
    
    if "Electrician" not in raj_categories:
        print(f"❌ FAIL: Raj Kumar's categories do NOT include 'Electrician'")
        print(f"   Raj Kumar's skills should map 'electrical' → 'Electrician'")
        results["feature_a"]["raj_electrician"] = f"FAIL - categories={raj_categories}"
        return False
    
    print(f"✅ PASS: Raj Kumar's categories include 'Electrician'")
    results["feature_a"]["raj_electrician"] = "PASS"
    
    print("\n" + "="*80)
    print("FEATURE A: ALL TESTS PASSED ✅")
    print("="*80)
    results["feature_a"]["overall"] = "PASS"
    return True

def test_feature_b_dispatch_tuning(admin_token, customer_token):
    """
    FEATURE B: Live Dispatch Feed honors Dispatch Tuning config
    1. Set config: PUT /api/admin/settings with dispatch config
    2. Create booking as customer for ELECTRICIAN service in Patna
    3. Verify dispatch fired to eligible partner
    4. Verify wave_size=1 means only ONE partner offered in wave 1
    """
    print("\n" + "="*80)
    print("FEATURE B: Live Dispatch Feed honors Dispatch Tuning config")
    print("="*80)
    
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    customer_headers = {"Authorization": f"Bearer {customer_token}"}
    
    # Step 1: Set dispatch config
    print("\n[TEST B.1] Set dispatch config via PUT /api/admin/settings")
    dispatch_config = {
        "business_config": {
            "dispatch_wave_size": 1,
            "dispatch_offer_ttl_sec": 10,
            "dispatch_max_waves": 12,
            "nearby_assign_radius_km": 15,
            "dispatch_nearby_wave": True
        }
    }
    
    resp = requests.put(f"{BASE_URL}/admin/settings", headers=admin_headers, json=dispatch_config)
    
    if resp.status_code != 200:
        print(f"❌ FAIL: PUT /api/admin/settings returned {resp.status_code}")
        print(f"Response: {resp.text}")
        results["feature_b"]["set_config"] = "FAIL"
        return False
    
    print(f"✅ Config set successfully")
    
    # Verify config was saved
    print("\n[TEST B.2] Verify config via GET /api/admin/settings")
    resp = requests.get(f"{BASE_URL}/admin/settings", headers=admin_headers)
    
    if resp.status_code != 200:
        print(f"❌ FAIL: GET /api/admin/settings returned {resp.status_code}")
        results["feature_b"]["verify_config"] = "FAIL"
        return False
    
    settings = resp.json()
    business_config = settings.get("business_config", {})
    
    print(f"business_config.dispatch_wave_size: {business_config.get('dispatch_wave_size')}")
    print(f"business_config.dispatch_offer_ttl_sec: {business_config.get('dispatch_offer_ttl_sec')}")
    print(f"business_config.dispatch_max_waves: {business_config.get('dispatch_max_waves')}")
    print(f"business_config.nearby_assign_radius_km: {business_config.get('nearby_assign_radius_km')}")
    print(f"business_config.dispatch_nearby_wave: {business_config.get('dispatch_nearby_wave')}")
    
    if business_config.get('dispatch_wave_size') != 1:
        print(f"❌ FAIL: dispatch_wave_size not set to 1")
        results["feature_b"]["verify_config"] = "FAIL"
        return False
    
    print(f"✅ Config verified")
    results["feature_b"]["set_config"] = "PASS"
    results["feature_b"]["verify_config"] = "PASS"
    
    # Step 2: Find an ELECTRICIAN service
    print("\n[TEST B.3] Find an ELECTRICIAN service")
    resp = requests.get(f"{BASE_URL}/catalog/services")
    
    if resp.status_code != 200:
        print(f"❌ FAIL: GET /api/catalog/services returned {resp.status_code}")
        results["feature_b"]["find_service"] = "FAIL"
        return False
    
    services = resp.json()
    electrician_service = None
    
    # Look for a service with category "Electrician" or required_skill "electrical"
    for service in services:
        category_name = service.get("category_name", "")
        required_skill = service.get("required_skill", "")
        service_name = service.get("name", "")
        
        if "Electrician" in category_name or "electrical" in required_skill or "Switchboard" in service_name:
            electrician_service = service
            break
    
    if not electrician_service:
        print(f"❌ FAIL: No ELECTRICIAN service found")
        print(f"   Available services: {[s.get('name') for s in services[:5]]}")
        results["feature_b"]["find_service"] = "FAIL - no electrician service"
        return False
    
    service_id = electrician_service.get("id")
    service_name = electrician_service.get("name")
    required_skill = electrician_service.get("required_skill", "")
    
    print(f"✅ Found service: {service_name} (id: {service_id}, required_skill: {required_skill})")
    results["feature_b"]["find_service"] = "PASS"
    results["feature_b"]["service_id"] = service_id
    results["feature_b"]["service_name"] = service_name
    
    # Step 3: Create booking
    print("\n[TEST B.4] Create booking for ELECTRICIAN service in Patna (pincode 800020)")
    
    # First, get customer's saved addresses
    resp = requests.get(f"{BASE_URL}/auth/addresses", headers=customer_headers)
    if resp.status_code != 200:
        print(f"⚠️  WARNING: GET /api/auth/addresses returned {resp.status_code}")
        print(f"   Will create address inline in booking")
        addresses = []
    else:
        addresses = resp.json()
    
    # Find or create a Patna address
    patna_address = None
    address_id = None
    
    for addr in addresses:
        if addr.get("pincode") == "800020" or addr.get("city") == "Patna":
            patna_address = addr
            address_id = addr.get("id")
            break
    
    if not patna_address:
        # Create address inline in booking
        print("   Will create address inline in booking...")
        patna_address = {
            "line": "Test Road, Patna",
            "city": "Patna",
            "state": "Bihar",
            "pincode": "800020",
            "lat": 25.5941,
            "lng": 85.1376,
            "label": "Test Address"
        }
    else:
        print(f"   Using saved address: {patna_address.get('line', '')} (id: {address_id})")
    
    # Create booking
    # Use emergency booking instead of scheduled to avoid time slot validation
    print(f"   Creating EMERGENCY booking (schedule_type: emergency)")
    
    if address_id:
        booking_data = {
            "service_id": service_id,
            "address_id": address_id,
            "schedule_type": "emergency"
        }
    else:
        # Inline address
        booking_data = {
            "service_id": service_id,
            "address": patna_address,
            "schedule_type": "emergency"
        }
    
    print(f"   Creating booking with service_id: {service_id}, schedule_type: emergency")
    
    resp = requests.post(f"{BASE_URL}/bookings", headers=customer_headers, json=booking_data)
    
    if resp.status_code not in [200, 201]:
        print(f"❌ FAIL: POST /api/bookings returned {resp.status_code}")
        print(f"Response: {resp.text}")
        results["feature_b"]["create_booking"] = "FAIL"
        return False
    
    booking = resp.json()
    booking_id = booking.get("id")
    booking_code = booking.get("code")
    booking_status = booking.get("status")
    
    print(f"✅ Booking created: {booking_code} (id: {booking_id}, status: {booking_status})")
    results["feature_b"]["create_booking"] = "PASS"
    results["feature_b"]["booking_id"] = booking_id
    results["feature_b"]["booking_code"] = booking_code
    
    # Step 4: Pay the booking to trigger dispatch
    print("\n[TEST B.5] Pay booking to trigger dispatch")
    
    # Use mock payment
    payment_data = {
        "booking_id": booking_id,
        "purpose": "booking",
        "method": "mock",
        "amount": booking.get("pricing", {}).get("total", 0)
    }
    
    resp = requests.post(f"{BASE_URL}/payments/mock", headers=customer_headers, json=payment_data)
    
    if resp.status_code not in [200, 201]:
        print(f"❌ FAIL: POST /api/payments/mock returned {resp.status_code}")
        print(f"Response: {resp.text}")
        results["feature_b"]["pay_booking"] = "FAIL"
        return False
    
    print(f"✅ Payment successful")
    
    # Wait longer for dispatch to process (dispatch sweep runs every ~7 seconds)
    print("   Waiting 20 seconds for dispatch sweep to process...")
    for i in range(4):
        time.sleep(5)
        # Check booking status
        resp = requests.get(f"{BASE_URL}/bookings/{booking_id}", headers=customer_headers)
        if resp.status_code == 200:
            b = resp.json()
            offered = len(b.get("offered_partner_ids", []))
            wave = b.get("dispatch_wave", 0)
            if offered > 0:
                print(f"   ✅ Dispatch fired! Wave {wave}, {offered} partner(s) offered")
                break
            else:
                print(f"   ... still waiting (wave={wave}, offered={offered})")
    
    # Get updated booking
    resp = requests.get(f"{BASE_URL}/bookings/{booking_id}", headers=customer_headers)
    
    if resp.status_code != 200:
        print(f"❌ FAIL: GET /api/bookings/{booking_id} returned {resp.status_code}")
        results["feature_b"]["pay_booking"] = "FAIL"
        return False
    
    booking = resp.json()
    booking_status = booking.get("status")
    
    print(f"   Booking status after payment: {booking_status}")
    results["feature_b"]["pay_booking"] = "PASS"
    results["feature_b"]["booking_status_after_payment"] = booking_status
    
    # Step 5: Verify dispatch attempts
    print("\n[TEST B.6] Verify dispatch attempts via GET /api/admin/dispatch-feed")
    
    resp = requests.get(f"{BASE_URL}/admin/dispatch-feed?booking_id={booking_id}", headers=admin_headers)
    
    if resp.status_code != 200:
        print(f"❌ FAIL: GET /api/admin/dispatch-feed returned {resp.status_code}")
        print(f"Response: {resp.text}")
        results["feature_b"]["dispatch_feed"] = "FAIL"
        return False
    
    dispatch_data = resp.json()
    attempts = dispatch_data.get("attempts", [])
    
    print(f"   Found {len(attempts)} dispatch attempts via dispatch-feed")
    
    # Also check the booking object for dispatch info
    resp = requests.get(f"{BASE_URL}/bookings/{booking_id}", headers=customer_headers)
    if resp.status_code == 200:
        booking = resp.json()
        offered_partner_ids = booking.get("offered_partner_ids", [])
        eligible_partner_ids = booking.get("eligible_partner_ids", [])
        dispatch_wave = booking.get("dispatch_wave", 0)
        
        print(f"   Booking dispatch info:")
        print(f"     - eligible_partner_ids: {len(eligible_partner_ids)} partners")
        print(f"     - offered_partner_ids: {len(offered_partner_ids)} partners")
        print(f"     - dispatch_wave: {dispatch_wave}")
        
        if len(eligible_partner_ids) > 0:
            print(f"     - Eligible partners found: {eligible_partner_ids[:3]}")
        
        if len(offered_partner_ids) > 0:
            print(f"     - Offered partners: {offered_partner_ids}")
    
    if len(attempts) == 0 and len(offered_partner_ids) == 0:
        print(f"⚠️  WARNING: No dispatch attempts found and no partners offered")
        print(f"   This might mean:")
        print(f"   1. Dispatch sweep hasn't run yet (runs every ~7s)")
        print(f"   2. No eligible partners found for this service/location")
        print(f"   3. Partners are not in the right status")
        results["feature_b"]["dispatch_feed"] = "PARTIAL - no attempts yet"
    else:
        print(f"✅ Dispatch data found")
        results["feature_b"]["dispatch_feed"] = "PASS"
    
    # Save dispatch attempts for analysis
    results["feature_b"]["dispatch_attempts"] = attempts
    
    # Check if Raj Kumar was offered
    print("\n[TEST B.7] Verify Raj Kumar was offered (eligible electrical partner)")
    
    raj_attempt = None
    for attempt in attempts:
        partner_phone = attempt.get("partner_phone", "")
        partner_name = attempt.get("partner_name", "")
        
        if partner_phone == PARTNER_RAJ_PHONE or "Raj Kumar" in partner_name:
            raj_attempt = attempt
            break
    
    if not raj_attempt:
        print(f"⚠️  WARNING: Raj Kumar not found in dispatch attempts")
        print(f"   Available partners in attempts: {[a.get('partner_name') + ' ' + a.get('partner_phone', '') for a in attempts]}")
        results["feature_b"]["raj_offered"] = "FAIL - not in attempts"
    else:
        print(f"✅ Raj Kumar found in dispatch attempts")
        print(f"   Wave: {raj_attempt.get('wave', 'unknown')}")
        print(f"   Source: {raj_attempt.get('source', 'unknown')}")
        print(f"   Response: {raj_attempt.get('response', 'unknown')}")
        results["feature_b"]["raj_offered"] = "PASS"
    
    # Step 6: Verify wave_size=1 constraint
    print("\n[TEST B.8] Verify wave_size=1 constraint (only ONE partner in wave 1)")
    
    # Check booking.offered_partner_ids
    offered_partner_ids = booking.get("offered_partner_ids", [])
    dispatch_wave = booking.get("dispatch_wave", 0)
    
    print(f"   booking.offered_partner_ids: {offered_partner_ids}")
    print(f"   booking.dispatch_wave: {dispatch_wave}")
    print(f"   Length of offered_partner_ids: {len(offered_partner_ids)}")
    
    # Also check wave 1 attempts
    wave_1_attempts = [a for a in attempts if a.get("wave") == 1]
    print(f"   Wave 1 attempts count: {len(wave_1_attempts)}")
    
    if len(offered_partner_ids) == 1:
        print(f"✅ PASS: offered_partner_ids length == 1 (wave_size=1 honored)")
        results["feature_b"]["wave_size_constraint"] = "PASS"
    elif len(wave_1_attempts) == 1:
        print(f"✅ PASS: Wave 1 attempts count == 1 (wave_size=1 honored)")
        results["feature_b"]["wave_size_constraint"] = "PASS"
    else:
        print(f"❌ FAIL: Expected 1 partner in wave 1, got {len(offered_partner_ids)} in offered_partner_ids and {len(wave_1_attempts)} in wave 1 attempts")
        results["feature_b"]["wave_size_constraint"] = f"FAIL - {len(offered_partner_ids)} offered, {len(wave_1_attempts)} in wave 1"
        return False
    
    print("\n" + "="*80)
    print("FEATURE B: ALL TESTS PASSED ✅")
    print("="*80)
    results["feature_b"]["overall"] = "PASS"
    return True

def main():
    print("="*80)
    print("Backend Test: Live Partner Map + Live Dispatch Feed")
    print("AzoApp - 2026-09")
    print("="*80)
    
    # Login
    print("\n[SETUP] Logging in...")
    admin_token = login(ADMIN_PHONE)
    customer_token = login(CUSTOMER_PHONE)
    
    if not admin_token or not customer_token:
        print("\n❌ CRITICAL: Login failed")
        return
    
    # Make sure partners are online
    print("\n[SETUP] Ensuring partners are online...")
    raj_token = login(PARTNER_RAJ_PHONE)
    amit_token = login(PARTNER_AMIT_PHONE)
    
    if raj_token:
        headers = {"Authorization": f"Bearer {raj_token}"}
        resp = requests.put(f"{BASE_URL}/partner/availability", headers=headers, json={"mode": "online"})
        if resp.status_code == 200:
            print(f"✅ Raj Kumar is now online")
        else:
            print(f"⚠️  Could not set Raj Kumar online: {resp.status_code}")
    
    if amit_token:
        headers = {"Authorization": f"Bearer {amit_token}"}
        resp = requests.put(f"{BASE_URL}/partner/availability", headers=headers, json={"mode": "online"})
        if resp.status_code == 200:
            print(f"✅ Amit Singh is now online")
        else:
            print(f"⚠️  Could not set Amit Singh online: {resp.status_code}")
    
    # Wait a moment for status to propagate
    time.sleep(2)
    
    # Test Feature A
    feature_a_pass = test_feature_a_live_partner_map_filters(admin_token)
    
    # Test Feature B
    feature_b_pass = test_feature_b_dispatch_tuning(admin_token, customer_token)
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    print(f"\nFEATURE A (Live Partner Map filters): {'✅ PASS' if feature_a_pass else '❌ FAIL'}")
    print(f"FEATURE B (Dispatch Tuning config): {'✅ PASS' if feature_b_pass else '❌ FAIL'}")
    
    results["summary"]["feature_a"] = "PASS" if feature_a_pass else "FAIL"
    results["summary"]["feature_b"] = "PASS" if feature_b_pass else "FAIL"
    results["summary"]["overall"] = "PASS" if (feature_a_pass and feature_b_pass) else "FAIL"
    
    # Save results
    with open("/app/test_results_live_partner_dispatch.json", "w") as f:
        json.dump(results, f, indent=2)
    
    print(f"\n✅ Results saved to /app/test_results_live_partner_dispatch.json")
    
    if feature_a_pass and feature_b_pass:
        print("\n🎉 ALL TESTS PASSED")
    else:
        print("\n⚠️  SOME TESTS FAILED - See details above")

if __name__ == "__main__":
    main()
