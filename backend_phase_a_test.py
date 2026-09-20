#!/usr/bin/env python3
"""
PHASE-A Backend Testing Script
Tests 3 critical backend features:
1. 30-minute scheduled slots + validation
2. Partner Online toggle → My Availability auto-sync
3. Customer + Partner invoice email correctness
"""

import requests
import json
from datetime import datetime, timedelta
import pytz

# Configuration
BASE_URL = "https://job-ring-notify.preview.emergentagent.com/api"
OTP = "123456"

# Test credentials
ADMIN_PHONE = "+919000000000"
CUSTOMER_PHONE = "+919000000004"
PARTNER_PHONE = "+919000000003"  # Raj, AC skill, Patna 800001

# Service and address
AC_SERVICE_ID = "38f2fe7a-79a9-450a-aba9-d96ec5b09fc9"  # AC Gas Refill
TEST_ADDRESS = {
    "line": "12 MG Road",
    "pincode": "800001",
    "city": "Patna",
    "state": "Bihar",
    "lat": 25.6,
    "lng": 85.1
}

# Test results
results = {
    "task1_30min_slots": {},
    "task2_partner_online_sync": {},
    "task3_invoice_email": {},
    "summary": {}
}

def login(phone):
    """Login and return token"""
    # Send OTP
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if resp.status_code != 200:
        print(f"❌ Send OTP failed for {phone}: {resp.status_code}")
        return None
    
    # Verify OTP
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={
        "phone": phone,
        "otp": OTP,
        "create_if_new": False
    })
    if resp.status_code != 200:
        print(f"❌ Verify OTP failed for {phone}: {resp.status_code}")
        return None
    
    data = resp.json()
    token = data.get("token")
    print(f"✅ Logged in as {phone}")
    return token

def get_headers(token):
    """Get authorization headers"""
    return {"Authorization": f"Bearer {token}"}

def get_ist_date(days_offset=0):
    """Get IST date string (YYYY-MM-DD)"""
    ist = pytz.timezone('Asia/Kolkata')
    now = datetime.now(ist)
    target = now + timedelta(days=days_offset)
    return target.strftime('%Y-%m-%d')

def get_ist_datetime(days_offset=0, hour=14, minute=30):
    """Get IST datetime string (YYYY-MM-DDTHH:MM)"""
    ist = pytz.timezone('Asia/Kolkata')
    now = datetime.now(ist)
    target = now + timedelta(days=days_offset)
    target = target.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return target.strftime('%Y-%m-%dT%H:%M')

print("=" * 80)
print("PHASE-A BACKEND TESTING")
print("=" * 80)

# Login all users
print("\n📝 Logging in users...")
admin_token = login(ADMIN_PHONE)
customer_token = login(CUSTOMER_PHONE)
partner_token = login(PARTNER_PHONE)

if not all([admin_token, customer_token, partner_token]):
    print("❌ Failed to login all users. Exiting.")
    exit(1)

# ============================================================================
# TASK 1: 30-MINUTE SCHEDULED SLOTS + VALIDATION
# ============================================================================
print("\n" + "=" * 80)
print("TASK 1: 30-MINUTE SCHEDULED SLOTS + VALIDATION")
print("=" * 80)

# (a) GET slot-availability - check 30-minute intervals
print("\n📝 TEST 1a: GET /api/bookings/slot-availability (30-minute intervals)")
future_date = get_ist_date(days_offset=7)  # 7 days in future
resp = requests.get(f"{BASE_URL}/bookings/slot-availability", params={"date": future_date})
print(f"   Status: {resp.status_code}")
results["task1_30min_slots"]["1a_status"] = resp.status_code

if resp.status_code == 200:
    data = resp.json()
    slots = data.get("slots", [])
    full_slots = data.get("full_slots", [])
    
    print(f"   Slots count: {len(slots)}")
    print(f"   First 5 slots: {slots[:5]}")
    print(f"   Last 5 slots: {slots[-5:]}")
    
    # Check for 30-minute intervals
    has_0830 = "08:30" in slots
    has_1930 = "19:30" in slots
    has_invalid_15 = any(":15" in s for s in slots)
    has_invalid_45 = any(":45" in s for s in slots)
    
    results["task1_30min_slots"]["1a_has_0830"] = has_0830
    results["task1_30min_slots"]["1a_has_1930"] = has_1930
    results["task1_30min_slots"]["1a_has_invalid_15"] = has_invalid_15
    results["task1_30min_slots"]["1a_has_invalid_45"] = has_invalid_45
    
    print(f"   ✅ Has 08:30: {has_0830}")
    print(f"   ✅ Has 19:30: {has_1930}")
    print(f"   ✅ No :15 times: {not has_invalid_15}")
    print(f"   ✅ No :45 times: {not has_invalid_45}")
    
    if has_0830 and has_1930 and not has_invalid_15 and not has_invalid_45:
        print("   ✅ PASS: 30-minute intervals correct")
        results["task1_30min_slots"]["1a_result"] = "PASS"
    else:
        print("   ❌ FAIL: Invalid slot intervals detected")
        results["task1_30min_slots"]["1a_result"] = "FAIL"
else:
    print(f"   ❌ FAIL: Expected 200, got {resp.status_code}")
    results["task1_30min_slots"]["1a_result"] = "FAIL"

# (b) Create SCHEDULED booking with VALID slot (14:30)
print("\n📝 TEST 1b: Create SCHEDULED booking with VALID slot (14:30)")
valid_scheduled_at = get_ist_datetime(days_offset=7, hour=14, minute=30)
booking_payload = {
    "service_id": AC_SERVICE_ID,
    "schedule_type": "schedule",
    "scheduled_at": valid_scheduled_at,
    "address": TEST_ADDRESS,
    "description": "Test AC service - valid slot 14:30"
}
resp = requests.post(f"{BASE_URL}/bookings", json=booking_payload, headers=get_headers(customer_token))
print(f"   Status: {resp.status_code}")
results["task1_30min_slots"]["1b_status"] = resp.status_code

if resp.status_code in [200, 201]:
    data = resp.json()
    valid_booking_id = data.get("id")
    print(f"   ✅ PASS: Booking created with valid slot (ID: {valid_booking_id})")
    results["task1_30min_slots"]["1b_result"] = "PASS"
    results["task1_30min_slots"]["1b_booking_id"] = valid_booking_id
else:
    print(f"   ❌ FAIL: Expected 200/201, got {resp.status_code}")
    print(f"   Response: {resp.text}")
    results["task1_30min_slots"]["1b_result"] = "FAIL"

# (c) Create SCHEDULED booking with INVALID slot (14:15)
print("\n📝 TEST 1c: Create SCHEDULED booking with INVALID slot (14:15) - should reject")
invalid_scheduled_at = get_ist_datetime(days_offset=7, hour=14, minute=15)
booking_payload_invalid = {
    "service_id": AC_SERVICE_ID,
    "schedule_type": "schedule",
    "scheduled_at": invalid_scheduled_at,
    "address": TEST_ADDRESS,
    "description": "Test AC service - invalid slot 14:15"
}
resp = requests.post(f"{BASE_URL}/bookings", json=booking_payload_invalid, headers=get_headers(customer_token))
print(f"   Status: {resp.status_code}")
results["task1_30min_slots"]["1c_status"] = resp.status_code

if resp.status_code == 400:
    data = resp.json()
    detail = data.get("detail", "")
    print(f"   Detail: {detail}")
    results["task1_30min_slots"]["1c_detail"] = detail
    
    if "valid" in detail.lower() and "slot" in detail.lower():
        print(f"   ✅ PASS: Correctly rejected invalid slot with proper message")
        results["task1_30min_slots"]["1c_result"] = "PASS"
    else:
        print(f"   ⚠️ PARTIAL: Rejected but message unclear")
        results["task1_30min_slots"]["1c_result"] = "PARTIAL"
else:
    print(f"   ❌ FAIL: Expected 400, got {resp.status_code}")
    results["task1_30min_slots"]["1c_result"] = "FAIL"

# (d) Reschedule validation - need an assigned booking
print("\n📝 TEST 1d: Reschedule validation (invalid vs valid slot)")
# First, we need to pay and assign the valid booking from 1b
if results["task1_30min_slots"].get("1b_result") == "PASS":
    valid_booking_id = results["task1_30min_slots"].get("1b_booking_id")
    
    # Pay the booking (mock payment)
    print("   📝 Paying booking via mock payment...")
    payment_payload = {
        "purpose": "booking",
        "booking_id": valid_booking_id
    }
    resp = requests.post(f"{BASE_URL}/payments/mock", json=payment_payload, headers=get_headers(customer_token))
    print(f"   Payment status: {resp.status_code}")
    
    # Assign partner (admin action)
    print("   📝 Assigning partner to booking...")
    # First get partner ID
    resp = requests.get(f"{BASE_URL}/admin/partners", headers=get_headers(admin_token))
    if resp.status_code == 200:
        partners = resp.json().get("partners", [])
        partner_raj = next((p for p in partners if p.get("phone") == PARTNER_PHONE), None)
        if partner_raj:
            partner_id = partner_raj.get("id")
            assign_payload = {"partner_id": partner_id}
            resp = requests.post(f"{BASE_URL}/admin/bookings/{valid_booking_id}/assign", json=assign_payload, headers=get_headers(admin_token))
            print(f"   Assign status: {resp.status_code}")
            
            if resp.status_code == 200:
                # Now test reschedule with invalid slot (15:15)
                print("   📝 Testing reschedule with INVALID slot (15:15)...")
                invalid_reschedule_time = get_ist_datetime(days_offset=7, hour=15, minute=15)
                reschedule_payload = {"scheduled_at": invalid_reschedule_time}
                resp = requests.post(f"{BASE_URL}/bookings/{valid_booking_id}/reschedule/request", json=reschedule_payload, headers=get_headers(customer_token))
                print(f"   Status: {resp.status_code}")
                results["task1_30min_slots"]["1d_invalid_status"] = resp.status_code
                
                if resp.status_code == 400:
                    print(f"   ✅ PASS: Invalid slot rejected (400)")
                    results["task1_30min_slots"]["1d_invalid_result"] = "PASS"
                else:
                    print(f"   ❌ FAIL: Expected 400, got {resp.status_code}")
                    results["task1_30min_slots"]["1d_invalid_result"] = "FAIL"
                
                # Test reschedule with valid slot (15:30)
                print("   📝 Testing reschedule with VALID slot (15:30)...")
                valid_reschedule_time = get_ist_datetime(days_offset=7, hour=15, minute=30)
                reschedule_payload = {"scheduled_at": valid_reschedule_time}
                resp = requests.post(f"{BASE_URL}/bookings/{valid_booking_id}/reschedule/request", json=reschedule_payload, headers=get_headers(customer_token))
                print(f"   Status: {resp.status_code}")
                results["task1_30min_slots"]["1d_valid_status"] = resp.status_code
                
                if resp.status_code == 200:
                    print(f"   ✅ PASS: Valid slot accepted (200)")
                    results["task1_30min_slots"]["1d_valid_result"] = "PASS"
                else:
                    print(f"   ❌ FAIL: Expected 200, got {resp.status_code}")
                    results["task1_30min_slots"]["1d_valid_result"] = "FAIL"
            else:
                print(f"   ⚠️ SKIP: Could not assign partner (status {resp.status_code})")
                results["task1_30min_slots"]["1d_result"] = "SKIP"
        else:
            print(f"   ⚠️ SKIP: Partner Raj not found")
            results["task1_30min_slots"]["1d_result"] = "SKIP"
    else:
        print(f"   ⚠️ SKIP: Could not fetch partners")
        results["task1_30min_slots"]["1d_result"] = "SKIP"
else:
    print("   ⚠️ SKIP: No valid booking from 1b to test reschedule")
    results["task1_30min_slots"]["1d_result"] = "SKIP"

# ============================================================================
# TASK 2: PARTNER ONLINE TOGGLE → MY AVAILABILITY AUTO-SYNC
# ============================================================================
print("\n" + "=" * 80)
print("TASK 2: PARTNER ONLINE TOGGLE → MY AVAILABILITY AUTO-SYNC")
print("=" * 80)

# Get today's date in IST
today_ist = get_ist_date(days_offset=0)
print(f"   Today (IST): {today_ist}")

# (a) Set partner online
print("\n📝 TEST 2a: PUT /api/auth/partner/online-status {online:true}")
resp = requests.put(f"{BASE_URL}/auth/partner/online-status", json={"online": True}, headers=get_headers(partner_token))
print(f"   Status: {resp.status_code}")
results["task2_partner_online_sync"]["2a_status"] = resp.status_code

if resp.status_code == 200:
    print(f"   ✅ Set online: 200")
    results["task2_partner_online_sync"]["2a_result"] = "PASS"
else:
    print(f"   ❌ FAIL: Expected 200, got {resp.status_code}")
    results["task2_partner_online_sync"]["2a_result"] = "FAIL"

# (b) Check availability calendar - today should be available
print("\n📝 TEST 2b: GET /api/partner/availability/calendar (verify today available)")
resp = requests.get(f"{BASE_URL}/partner/availability/calendar", headers=get_headers(partner_token))
print(f"   Status: {resp.status_code}")
results["task2_partner_online_sync"]["2b_status"] = resp.status_code

if resp.status_code == 200:
    data = resp.json()
    calendar = data.get("calendar", [])
    dates = data.get("dates", [])
    online_today = data.get("online_today", False)
    online_date = data.get("online_date", "")
    
    print(f"   online_today: {online_today}")
    print(f"   online_date: {online_date}")
    print(f"   dates: {dates}")
    
    # Find today in calendar
    today_entry = next((c for c in calendar if c.get("date") == today_ist), None)
    today_status = today_entry.get("status") if today_entry else None
    
    print(f"   Today ({today_ist}) status in calendar: {today_status}")
    
    results["task2_partner_online_sync"]["2b_online_today"] = online_today
    results["task2_partner_online_sync"]["2b_online_date"] = online_date
    results["task2_partner_online_sync"]["2b_today_in_dates"] = today_ist in dates
    results["task2_partner_online_sync"]["2b_today_status"] = today_status
    
    # Verify all conditions
    checks = [
        (today_status == "available", f"Today status is 'available'"),
        (today_ist in dates, f"Today in dates array"),
        (online_today == True, f"online_today is True"),
        (online_date == today_ist, f"online_date matches today")
    ]
    
    all_pass = True
    for check, desc in checks:
        if check:
            print(f"   ✅ {desc}")
        else:
            print(f"   ❌ {desc}")
            all_pass = False
    
    if all_pass:
        print(f"   ✅ PASS: Online toggle synced to calendar")
        results["task2_partner_online_sync"]["2b_result"] = "PASS"
    else:
        print(f"   ❌ FAIL: Calendar not synced correctly")
        results["task2_partner_online_sync"]["2b_result"] = "FAIL"
else:
    print(f"   ❌ FAIL: Expected 200, got {resp.status_code}")
    results["task2_partner_online_sync"]["2b_result"] = "FAIL"

# (c) Set partner offline
print("\n📝 TEST 2c: PUT /api/auth/partner/online-status {online:false}")
resp = requests.put(f"{BASE_URL}/auth/partner/online-status", json={"online": False}, headers=get_headers(partner_token))
print(f"   Status: {resp.status_code}")
results["task2_partner_online_sync"]["2c_status"] = resp.status_code

if resp.status_code == 200:
    print(f"   ✅ Set offline: 200")
    results["task2_partner_online_sync"]["2c_result"] = "PASS"
else:
    print(f"   ❌ FAIL: Expected 200, got {resp.status_code}")
    results["task2_partner_online_sync"]["2c_result"] = "FAIL"

# (d) Check availability calendar - today should be unavailable
print("\n📝 TEST 2d: GET /api/partner/availability/calendar (verify today unavailable)")
resp = requests.get(f"{BASE_URL}/partner/availability/calendar", headers=get_headers(partner_token))
print(f"   Status: {resp.status_code}")
results["task2_partner_online_sync"]["2d_status"] = resp.status_code

if resp.status_code == 200:
    data = resp.json()
    calendar = data.get("calendar", [])
    online_today = data.get("online_today", False)
    
    print(f"   online_today: {online_today}")
    
    # Find today in calendar
    today_entry = next((c for c in calendar if c.get("date") == today_ist), None)
    today_status = today_entry.get("status") if today_entry else None
    
    print(f"   Today ({today_ist}) status in calendar: {today_status}")
    
    results["task2_partner_online_sync"]["2d_online_today"] = online_today
    results["task2_partner_online_sync"]["2d_today_status"] = today_status
    
    # Verify conditions
    checks = [
        (today_status == "unavailable", f"Today status is 'unavailable'"),
        (online_today == False, f"online_today is False")
    ]
    
    all_pass = True
    for check, desc in checks:
        if check:
            print(f"   ✅ {desc}")
        else:
            print(f"   ❌ {desc}")
            all_pass = False
    
    if all_pass:
        print(f"   ✅ PASS: Offline toggle synced to calendar")
        results["task2_partner_online_sync"]["2d_result"] = "PASS"
    else:
        print(f"   ❌ FAIL: Calendar not synced correctly")
        results["task2_partner_online_sync"]["2d_result"] = "FAIL"
else:
    print(f"   ❌ FAIL: Expected 200, got {resp.status_code}")
    results["task2_partner_online_sync"]["2d_result"] = "FAIL"

# ============================================================================
# TASK 3: CUSTOMER + PARTNER INVOICE EMAIL CORRECTNESS
# ============================================================================
print("\n" + "=" * 80)
print("TASK 3: CUSTOMER + PARTNER INVOICE EMAIL CORRECTNESS")
print("=" * 80)

# Create a new booking for completion flow
print("\n📝 TEST 3: Complete booking end-to-end and verify invoice")

# Step 1: Create booking
print("   📝 Step 1: Create booking...")
booking_payload = {
    "service_id": AC_SERVICE_ID,
    "schedule_type": "schedule",
    "scheduled_at": get_ist_datetime(days_offset=0, hour=10, minute=0),  # Today, past time so it's unlocked
    "address": TEST_ADDRESS,
    "description": "Test AC service for invoice verification"
}
resp = requests.post(f"{BASE_URL}/bookings", json=booking_payload, headers=get_headers(customer_token))
print(f"   Create booking status: {resp.status_code}")

if resp.status_code not in [200, 201]:
    print(f"   ❌ FAIL: Could not create booking")
    results["task3_invoice_email"]["result"] = "FAIL"
    results["task3_invoice_email"]["error"] = "Could not create booking"
else:
    data = resp.json()
    invoice_booking_id = data.get("id")
    print(f"   ✅ Booking created: {invoice_booking_id}")
    results["task3_invoice_email"]["booking_id"] = invoice_booking_id
    
    # Step 2: Pay booking
    print("   📝 Step 2: Pay booking...")
    payment_payload = {
        "purpose": "booking",
        "booking_id": invoice_booking_id
    }
    resp = requests.post(f"{BASE_URL}/payments/mock", json=payment_payload, headers=get_headers(customer_token))
    print(f"   Payment status: {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"   ❌ FAIL: Could not pay booking")
        results["task3_invoice_email"]["result"] = "FAIL"
        results["task3_invoice_email"]["error"] = "Could not pay booking"
    else:
        # Step 3: Get partner ID and assign
        print("   📝 Step 3: Assign partner...")
        resp = requests.get(f"{BASE_URL}/admin/partners", headers=get_headers(admin_token))
        if resp.status_code == 200:
            partners = resp.json().get("partners", [])
            partner_raj = next((p for p in partners if p.get("phone") == PARTNER_PHONE), None)
            if partner_raj:
                partner_id = partner_raj.get("partner_id")
                assign_payload = {"partner_id": partner_id}
                resp = requests.post(f"{BASE_URL}/admin/bookings/{invoice_booking_id}/assign", json=assign_payload, headers=get_headers(admin_token))
                print(f"   Assign status: {resp.status_code}")
                
                if resp.status_code != 200:
                    print(f"   ❌ FAIL: Could not assign partner")
                    results["task3_invoice_email"]["result"] = "FAIL"
                    results["task3_invoice_email"]["error"] = "Could not assign partner"
                else:
                    # Step 4: Partner accepts job
                    print("   📝 Step 4: Partner accepts job...")
                    resp = requests.post(f"{BASE_URL}/bookings/{invoice_booking_id}/accept", headers=get_headers(partner_token))
                    print(f"   Accept status: {resp.status_code}")
                    
                    # Step 5: Complete the job (admin path for simplicity)
                    print("   📝 Step 5: Complete job (admin)...")
                    resp = requests.post(f"{BASE_URL}/admin/bookings/{invoice_booking_id}/complete", headers=get_headers(admin_token))
                    print(f"   Complete status: {resp.status_code}")
                    results["task3_invoice_email"]["complete_status"] = resp.status_code
                    
                    if resp.status_code == 500:
                        print(f"   ❌ FAIL: Completion returned 500 error")
                        print(f"   Response: {resp.text}")
                        results["task3_invoice_email"]["result"] = "FAIL"
                        results["task3_invoice_email"]["error"] = "500 error on completion"
                    elif resp.status_code == 200:
                        print(f"   ✅ Completion returned 200 (no error)")
                        
                        # Step 6: Check if invoice exists
                        print("   📝 Step 6: Check invoice exists...")
                        resp = requests.get(f"{BASE_URL}/admin/invoices", headers=get_headers(admin_token))
                        if resp.status_code == 200:
                            invoices = resp.json().get("invoices", [])
                            booking_invoice = next((inv for inv in invoices if inv.get("booking_id") == invoice_booking_id), None)
                            
                            if booking_invoice:
                                invoice_id = booking_invoice.get("invoice_id")
                                print(f"   ✅ Invoice found: {invoice_id}")
                                results["task3_invoice_email"]["invoice_id"] = invoice_id
                                
                                # Check for customer_snapshot and partner_snapshot
                                has_customer_snapshot = "customer_snapshot" in booking_invoice
                                has_partner_snapshot = "partner_snapshot" in booking_invoice
                                
                                print(f"   customer_snapshot present: {has_customer_snapshot}")
                                print(f"   partner_snapshot present: {has_partner_snapshot}")
                                
                                results["task3_invoice_email"]["has_customer_snapshot"] = has_customer_snapshot
                                results["task3_invoice_email"]["has_partner_snapshot"] = has_partner_snapshot
                                
                                # Check for emailed_at / partner_emailed_at (idempotency markers)
                                emailed_at = booking_invoice.get("emailed_at")
                                partner_emailed_at = booking_invoice.get("partner_emailed_at")
                                
                                print(f"   emailed_at: {emailed_at}")
                                print(f"   partner_emailed_at: {partner_emailed_at}")
                                
                                results["task3_invoice_email"]["emailed_at"] = emailed_at
                                results["task3_invoice_email"]["partner_emailed_at"] = partner_emailed_at
                                
                                # Verify partner invoice excludes convenience/platform fees
                                print("   📝 Step 7: Verify partner invoice excludes fees...")
                                resp = requests.get(f"{BASE_URL}/invoices/{invoice_id}", headers=get_headers(partner_token))
                                if resp.status_code == 200:
                                    partner_invoice = resp.json()
                                    breakdown = partner_invoice.get("breakdown", {})
                                    additional_charges = breakdown.get("additional_charges", [])
                                    
                                    # Check if convenience_fee or platform_fee are in breakdown
                                    has_convenience_fee = any(c.get("label") == "Convenience Fee" for c in additional_charges)
                                    has_platform_fee = any(c.get("label") == "Platform Fee" for c in additional_charges)
                                    
                                    print(f"   Partner invoice has convenience_fee: {has_convenience_fee}")
                                    print(f"   Partner invoice has platform_fee: {has_platform_fee}")
                                    
                                    results["task3_invoice_email"]["partner_has_convenience_fee"] = has_convenience_fee
                                    results["task3_invoice_email"]["partner_has_platform_fee"] = has_platform_fee
                                    
                                    # Partner invoice should NOT have these fees
                                    if not has_convenience_fee and not has_platform_fee:
                                        print(f"   ✅ Partner invoice correctly excludes fees")
                                    else:
                                        print(f"   ⚠️ Partner invoice contains fees (should be excluded)")
                                
                                # Test idempotency - re-fetch invoice
                                print("   📝 Step 8: Test idempotency (re-fetch)...")
                                resp = requests.get(f"{BASE_URL}/invoices/{invoice_id}", headers=get_headers(customer_token))
                                if resp.status_code == 200:
                                    print(f"   ✅ Re-fetch successful (no error)")
                                    results["task3_invoice_email"]["idempotent"] = True
                                else:
                                    print(f"   ❌ Re-fetch failed: {resp.status_code}")
                                    results["task3_invoice_email"]["idempotent"] = False
                                
                                # Final assessment
                                if has_customer_snapshot and has_partner_snapshot:
                                    print(f"   ✅ PASS: Invoice has both customer and partner snapshots")
                                    results["task3_invoice_email"]["result"] = "PASS"
                                else:
                                    print(f"   ❌ FAIL: Missing snapshots")
                                    results["task3_invoice_email"]["result"] = "FAIL"
                            else:
                                print(f"   ❌ FAIL: Invoice not found for booking")
                                results["task3_invoice_email"]["result"] = "FAIL"
                                results["task3_invoice_email"]["error"] = "Invoice not found"
                        else:
                            print(f"   ❌ FAIL: Could not fetch invoices")
                            results["task3_invoice_email"]["result"] = "FAIL"
                            results["task3_invoice_email"]["error"] = "Could not fetch invoices"
                    else:
                        print(f"   ⚠️ Completion returned {resp.status_code}")
                        results["task3_invoice_email"]["result"] = "PARTIAL"
            else:
                print(f"   ❌ FAIL: Partner Raj not found")
                results["task3_invoice_email"]["result"] = "FAIL"
                results["task3_invoice_email"]["error"] = "Partner not found"
        else:
            print(f"   ❌ FAIL: Could not fetch partners")
            results["task3_invoice_email"]["result"] = "FAIL"
            results["task3_invoice_email"]["error"] = "Could not fetch partners"

# ============================================================================
# SUMMARY
# ============================================================================
print("\n" + "=" * 80)
print("TEST SUMMARY")
print("=" * 80)

# Count passes
task1_tests = ["1a_result", "1b_result", "1c_result", "1d_invalid_result", "1d_valid_result"]
task1_pass = sum(1 for t in task1_tests if results["task1_30min_slots"].get(t) == "PASS")
task1_total = len([t for t in task1_tests if results["task1_30min_slots"].get(t) in ["PASS", "FAIL", "PARTIAL"]])

task2_tests = ["2a_result", "2b_result", "2c_result", "2d_result"]
task2_pass = sum(1 for t in task2_tests if results["task2_partner_online_sync"].get(t) == "PASS")
task2_total = len([t for t in task2_tests if results["task2_partner_online_sync"].get(t) in ["PASS", "FAIL"]])

task3_result = results["task3_invoice_email"].get("result")
task3_pass = 1 if task3_result == "PASS" else 0
task3_total = 1 if task3_result in ["PASS", "FAIL", "PARTIAL"] else 0

total_pass = task1_pass + task2_pass + task3_pass
total_tests = task1_total + task2_total + task3_total

print(f"\nTASK 1 (30-minute slots): {task1_pass}/{task1_total} tests passed")
print(f"TASK 2 (Partner online sync): {task2_pass}/{task2_total} tests passed")
print(f"TASK 3 (Invoice email): {task3_pass}/{task3_total} tests passed")
print(f"\nOVERALL: {total_pass}/{total_tests} tests passed ({100*total_pass//total_tests if total_tests > 0 else 0}%)")

results["summary"] = {
    "task1_pass": task1_pass,
    "task1_total": task1_total,
    "task2_pass": task2_pass,
    "task2_total": task2_total,
    "task3_pass": task3_pass,
    "task3_total": task3_total,
    "total_pass": total_pass,
    "total_tests": total_tests,
    "pass_rate": f"{100*total_pass//total_tests if total_tests > 0 else 0}%"
}

# Save results
with open("/app/test_results_phase_a.json", "w") as f:
    json.dump(results, f, indent=2)

print(f"\n✅ Results saved to /app/test_results_phase_a.json")
print("=" * 80)
