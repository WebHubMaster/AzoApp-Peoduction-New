"""
ENHANCEMENT-5 (2026-09) Backend Testing
Tests for:
1. Auto Nearby Wave - dispatcher rings nearby-area partners when no in-area partner is free
2. Partner Busy ETA - eligible-partners rows show busy_until, busy_free_in_min, etc.
"""
import requests
import time
from datetime import datetime, timedelta

# Backend URL
API = "https://azoapp-services.preview.emergentagent.com/api"

# Test credentials
ADMIN_PHONE = "+919000000000"
CUSTOMER_PHONE = "+919000000004"
PANKAJ_PHONE = "+919000000018"  # Nearby AC partner (800002, ~3.3km)
OTP = "123456"

# AC service ID from review request
AC_SERVICE_ID = "fc8e56fd-2645-40ae-af7b-c39f334e0e55"

# Booking address (Patna, pincode 800001)
TEST_ADDRESS = {
    "line": "12 MG Road",
    "pincode": "800001",
    "city": "Patna",
    "state": "Bihar",
    "lat": 25.6,
    "lng": 85.1
}


def login(phone, otp="123456"):
    """Login and return auth token"""
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=30)
    assert r.status_code == 200, f"Send OTP failed: {r.status_code} {r.text}"
    
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": otp}, timeout=30)
    assert r.status_code == 200, f"Verify OTP failed: {r.status_code} {r.text}"
    
    data = r.json()
    assert "token" in data, f"No token in response: {data}"
    return data["token"]


def client(token):
    """Return requests session with auth header"""
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


def create_booking(customer_client, service_id, address, schedule_type="schedule"):
    """Create a booking and return booking data"""
    # Calculate scheduled_at (tomorrow at 10 AM)
    tomorrow = datetime.now() + timedelta(days=1)
    scheduled_at = tomorrow.replace(hour=10, minute=0, second=0, microsecond=0).isoformat()
    
    payload = {
        "service_id": service_id,
        "address": address,
        "schedule_type": schedule_type,
        "scheduled_at": scheduled_at,
        "notes": "Test booking for ENHANCEMENT-5"
    }
    
    r = customer_client.post(f"{API}/bookings", json=payload, timeout=60)
    assert r.status_code in (200, 201), f"Create booking failed: {r.status_code} {r.text}"
    
    booking = r.json()
    assert "id" in booking, f"No booking ID in response: {booking}"
    return booking


def mock_payment(customer_client, booking_id):
    """Pay for booking with mock payment"""
    payload = {
        "purpose": "booking",
        "booking_id": booking_id
    }
    
    r = customer_client.post(f"{API}/payments/mock", json=payload, timeout=30)
    assert r.status_code == 200, f"Mock payment failed: {r.status_code} {r.text}"
    return r.json()


def get_booking(client_obj, booking_id):
    """Get booking details"""
    r = client_obj.get(f"{API}/bookings/{booking_id}", timeout=30)
    assert r.status_code == 200, f"Get booking failed: {r.status_code} {r.text}"
    return r.json()


def cancel_booking(customer_client, booking_id, reason="test"):
    """Cancel a booking"""
    payload = {"reason": reason}
    r = customer_client.post(f"{API}/bookings/{booking_id}/cancel", json=payload, timeout=30)
    # Return status code and response for checking
    return r.status_code, r.json() if r.status_code == 200 else r.text


def get_dispatch_feed(admin_client, booking_id):
    """Get dispatch feed for a booking"""
    r = admin_client.get(f"{API}/admin/dispatch-feed", params={"booking_id": booking_id}, timeout=30)
    assert r.status_code == 200, f"Get dispatch feed failed: {r.status_code} {r.text}"
    data = r.json()
    # Return rows array if present, otherwise return empty list
    return data.get("rows", []) if isinstance(data, dict) else []


def get_eligible_partners(admin_client, booking_id, include_offline=False):
    """Get eligible partners for a booking"""
    params = {"include_offline": 1} if include_offline else {}
    r = admin_client.get(f"{API}/admin/bookings/{booking_id}/eligible-partners", params=params, timeout=30)
    assert r.status_code == 200, f"Get eligible partners failed: {r.status_code} {r.text}"
    return r.json()


def get_dispatch_attention(admin_client):
    """Get dispatch attention list"""
    r = admin_client.get(f"{API}/admin/dispatch-attention", timeout=30)
    assert r.status_code == 200, f"Get dispatch attention failed: {r.status_code} {r.text}"
    return r.json()


def update_settings(admin_client, settings):
    """Update admin settings"""
    r = admin_client.put(f"{API}/admin/settings", json=settings, timeout=30)
    assert r.status_code == 200, f"Update settings failed: {r.status_code} {r.text}"
    return r.json()


def get_settings(admin_client):
    """Get admin settings"""
    r = admin_client.get(f"{API}/admin/settings", timeout=30)
    assert r.status_code == 200, f"Get settings failed: {r.status_code} {r.text}"
    return r.json()


def accept_booking(partner_client, booking_id):
    """Partner accepts a booking"""
    r = partner_client.post(f"{API}/bookings/{booking_id}/accept", timeout=30)
    return r.status_code, r.json() if r.status_code == 200 else r.text


def test_auto_nearby_wave():
    """
    TEST 1: Auto Nearby Wave
    
    When no in-area partner is online+free, dispatcher rings nearby-area partners
    (within business_config.nearby_assign_radius_km, default 15) as the next wave.
    
    Steps:
    1. Free Pankaj by cancelling his current booking (fc8cb4aa-10bb-40b9-91f0-c699fdf960c3)
    2. Enable nearby wave settings (dispatch_nearby_wave=true, nearby_assign_radius_km=15)
    3. Create+pay a NEW AC booking (pincode 800001)
    4. Verify dispatch-feed shows Pankaj with source='auto_nearby_wave', distance_km≈3.3
    5. Verify booking has eligible_partner_ids containing Pankaj, eligible_detail[Pankaj].nearby=true
    6. Verify booking.dispatch_nearby_expanded=true, status='searching'
    7. Pankaj accepts → status='assigned'
    8. Negative tests:
       a) dispatch_nearby_wave=false → no auto_nearby_wave row
       b) nearby_assign_radius_km=2 (Pankaj is 3.3km) → no nearby row
    9. Restore settings
    """
    print("\n" + "="*80)
    print("TEST 1: Auto Nearby Wave")
    print("="*80)
    
    # Login
    print("\n[1] Logging in...")
    admin_token = login(ADMIN_PHONE)
    customer_token = login(CUSTOMER_PHONE)
    pankaj_token = login(PANKAJ_PHONE)
    
    admin_client = client(admin_token)
    customer_client = client(customer_token)
    pankaj_client = client(pankaj_token)
    
    print("✓ All users logged in successfully")
    
    # Step 1: Free Pankaj by cancelling his current booking
    print("\n[2] Freeing Pankaj by cancelling his current booking...")
    pankaj_booking_id = "fc8cb4aa-10bb-40b9-91f0-c699fdf960c3"
    status_code, response = cancel_booking(customer_client, pankaj_booking_id, "test - freeing partner")
    
    if status_code == 200:
        print(f"✓ Cancelled booking {pankaj_booking_id} successfully")
    elif status_code == 400 and "already" in str(response).lower():
        print(f"⚠ Booking {pankaj_booking_id} already cancelled/completed - continuing")
    else:
        print(f"⚠ Cancel returned {status_code}: {response} - continuing anyway")
    
    # Step 2: Enable nearby wave settings
    print("\n[3] Configuring nearby wave settings...")
    update_settings(admin_client, {
        "business_config": {
            "dispatch_nearby_wave": True,
            "nearby_assign_radius_km": 15
        }
    })
    
    settings = get_settings(admin_client)
    bc = settings.get("business_config", {})
    assert bc.get("dispatch_nearby_wave") == True, "dispatch_nearby_wave not set"
    assert bc.get("nearby_assign_radius_km") == 15, "nearby_assign_radius_km not set"
    print("✓ Settings configured: dispatch_nearby_wave=True, nearby_assign_radius_km=15")
    
    # Step 3: Create and pay for a new AC booking
    print("\n[4] Creating new AC booking at pincode 800001...")
    booking = create_booking(customer_client, AC_SERVICE_ID, TEST_ADDRESS)
    booking_id = booking["id"]
    booking_code = booking.get("code", "N/A")
    print(f"✓ Created booking {booking_code} (ID: {booking_id})")
    
    print(f"\n[5] Paying for booking {booking_code}...")
    mock_payment(customer_client, booking_id)
    print(f"✓ Payment successful")
    
    # Wait for escalation sweep to trigger (immediate 'no_local' escalation + server sweep runs every 7s)
    print("\n[6] Waiting up to 15 seconds for auto nearby wave escalation...")
    time.sleep(15)
    
    # Step 4: Verify dispatch-feed shows Pankaj with source='auto_nearby_wave'
    print("\n[7] Checking dispatch feed for auto_nearby_wave...")
    feed = get_dispatch_feed(admin_client, booking_id)
    
    nearby_rows = [r for r in feed if r.get("source") == "auto_nearby_wave"]
    print(f"   Found {len(nearby_rows)} auto_nearby_wave row(s)")
    
    assert len(nearby_rows) > 0, "❌ FAIL: No auto_nearby_wave rows found in dispatch feed"
    
    # Find Pankaj's row
    pankaj_row = None
    for row in nearby_rows:
        if row.get("partner_phone") == PANKAJ_PHONE:
            pankaj_row = row
            break
    
    assert pankaj_row is not None, f"❌ FAIL: Pankaj ({PANKAJ_PHONE}) not found in auto_nearby_wave rows"
    print(f"✓ Found Pankaj in dispatch feed with source='auto_nearby_wave'")
    
    # Verify distance_km ≈ 3.3
    distance_km = pankaj_row.get("distance_km")
    assert distance_km is not None, "❌ FAIL: distance_km is None"
    assert 2.0 <= distance_km <= 5.0, f"❌ FAIL: distance_km={distance_km}, expected ≈3.3 (range 2-5)"
    print(f"✓ distance_km={distance_km} (within expected range 2-5)")
    
    # Verify eta_min
    eta_min = pankaj_row.get("eta_min")
    assert eta_min is not None, "❌ FAIL: eta_min is None"
    assert eta_min > 0, f"❌ FAIL: eta_min={eta_min}, expected > 0"
    print(f"✓ eta_min={eta_min}")
    
    # Step 5: Verify booking has Pankaj in eligible_partner_ids with nearby=true
    print("\n[8] Checking booking eligible_partner_ids and eligible_detail...")
    booking_detail = get_booking(admin_client, booking_id)
    
    eligible_ids = booking_detail.get("eligible_partner_ids", [])
    print(f"   eligible_partner_ids count: {len(eligible_ids)}")
    
    # Get Pankaj's user ID from the dispatch feed row
    pankaj_id = pankaj_row.get("partner_id")
    assert pankaj_id in eligible_ids, f"❌ FAIL: Pankaj ID {pankaj_id} not in eligible_partner_ids"
    print(f"✓ Pankaj ({pankaj_id}) is in eligible_partner_ids")
    
    # Check eligible_detail
    eligible_detail = booking_detail.get("eligible_detail", {})
    pankaj_detail = eligible_detail.get(pankaj_id, {})
    
    assert pankaj_detail.get("nearby") == True, f"❌ FAIL: eligible_detail[{pankaj_id}].nearby != True"
    print(f"✓ eligible_detail[{pankaj_id}].nearby = True")
    
    # Step 6: Verify booking.dispatch_nearby_expanded=true, status='searching'
    assert booking_detail.get("dispatch_nearby_expanded") == True, "❌ FAIL: dispatch_nearby_expanded != True"
    print(f"✓ booking.dispatch_nearby_expanded = True")
    
    assert booking_detail.get("status") == "searching", f"❌ FAIL: status={booking_detail.get('status')}, expected 'searching'"
    print(f"✓ booking.status = 'searching'")
    
    # Step 7: Pankaj accepts → status='assigned'
    print(f"\n[9] Pankaj accepting booking {booking_code}...")
    status_code, response = accept_booking(pankaj_client, booking_id)
    assert status_code == 200, f"❌ FAIL: Accept failed with {status_code}: {response}"
    print(f"✓ Pankaj accepted booking successfully")
    
    booking_after_accept = get_booking(customer_client, booking_id)
    assert booking_after_accept.get("status") == "assigned", f"❌ FAIL: status after accept={booking_after_accept.get('status')}, expected 'assigned'"
    assert booking_after_accept.get("partner_name") == "Pankaj Sinha", f"❌ FAIL: partner_name={booking_after_accept.get('partner_name')}, expected 'Pankaj Sinha'"
    print(f"✓ Booking status = 'assigned', partner_name = 'Pankaj Sinha'")
    
    # Step 8a: Negative test - dispatch_nearby_wave=false
    print("\n[10] NEGATIVE TEST (a): dispatch_nearby_wave=false...")
    
    # Free Pankaj again by cancelling the booking we just created
    print("    Cancelling current booking to free Pankaj...")
    cancel_booking(customer_client, booking_id, "test - negative test")
    
    # Disable nearby wave
    update_settings(admin_client, {
        "business_config": {
            "dispatch_nearby_wave": False,
            "nearby_assign_radius_km": 15
        }
    })
    print("    ✓ Set dispatch_nearby_wave=False")
    
    # Create new booking
    print("    Creating new booking with nearby wave disabled...")
    booking2 = create_booking(customer_client, AC_SERVICE_ID, TEST_ADDRESS)
    booking2_id = booking2["id"]
    booking2_code = booking2.get("code", "N/A")
    print(f"    ✓ Created booking {booking2_code}")
    
    mock_payment(customer_client, booking2_id)
    print("    ✓ Payment successful")
    
    # Wait for potential escalation
    print("    Waiting 15 seconds...")
    time.sleep(15)
    
    # Check dispatch feed - should have NO auto_nearby_wave rows
    feed2 = get_dispatch_feed(admin_client, booking2_id)
    nearby_rows2 = [r for r in feed2 if r.get("source") == "auto_nearby_wave"]
    
    assert len(nearby_rows2) == 0, f"❌ FAIL: Found {len(nearby_rows2)} auto_nearby_wave rows when dispatch_nearby_wave=False"
    print(f"    ✓ No auto_nearby_wave rows found (as expected)")
    
    # Check dispatch_exhausted flag
    booking2_detail = get_booking(admin_client, booking2_id)
    assert booking2_detail.get("dispatch_exhausted") == True, "❌ FAIL: dispatch_exhausted should be True when no partners available"
    print(f"    ✓ booking.dispatch_exhausted = True (as expected)")
    
    # Step 8b: Negative test - nearby_assign_radius_km=2 (Pankaj is 3.3km away)
    print("\n[11] NEGATIVE TEST (b): nearby_assign_radius_km=2 (Pankaj is 3.3km away)...")
    
    # Cancel previous booking
    cancel_booking(customer_client, booking2_id, "test - negative test")
    
    # Set radius to 2km (Pankaj is 3.3km away)
    update_settings(admin_client, {
        "business_config": {
            "dispatch_nearby_wave": True,
            "nearby_assign_radius_km": 2
        }
    })
    print("    ✓ Set dispatch_nearby_wave=True, nearby_assign_radius_km=2")
    
    # Create new booking
    print("    Creating new booking with radius=2km...")
    booking3 = create_booking(customer_client, AC_SERVICE_ID, TEST_ADDRESS)
    booking3_id = booking3["id"]
    booking3_code = booking3.get("code", "N/A")
    print(f"    ✓ Created booking {booking3_code}")
    
    mock_payment(customer_client, booking3_id)
    print("    ✓ Payment successful")
    
    # Wait for potential escalation
    print("    Waiting 15 seconds...")
    time.sleep(15)
    
    # Check dispatch feed - should have NO auto_nearby_wave rows (Pankaj is outside 2km radius)
    feed3 = get_dispatch_feed(admin_client, booking3_id)
    nearby_rows3 = [r for r in feed3 if r.get("source") == "auto_nearby_wave"]
    
    assert len(nearby_rows3) == 0, f"❌ FAIL: Found {len(nearby_rows3)} auto_nearby_wave rows when radius=2km (Pankaj is 3.3km)"
    print(f"    ✓ No auto_nearby_wave rows found (as expected - Pankaj outside 2km radius)")
    
    # Step 9: Restore settings
    print("\n[12] Restoring settings...")
    update_settings(admin_client, {
        "business_config": {
            "dispatch_nearby_wave": True,
            "nearby_assign_radius_km": 15
        }
    })
    print("✓ Settings restored: dispatch_nearby_wave=True, nearby_assign_radius_km=15")
    
    # Cleanup
    cancel_booking(customer_client, booking3_id, "test cleanup")
    
    print("\n" + "="*80)
    print("✅ TEST 1 PASSED: Auto Nearby Wave")
    print("="*80)


def test_partner_busy_eta():
    """
    TEST 2: Partner Busy ETA
    
    eligible-partners rows for busy partners include busy_until (ISO), busy_free_in_min (int>=1),
    busy_job_code, busy_job_service, busy_job_status.
    dispatch-attention eligible_partners carry busy_free_in_min + busy_job_code too.
    
    Steps:
    1. Create a searching booking (in-area AC partners Raj/Amit/Manoj are all busy)
    2. GET /api/admin/bookings/{id}/eligible-partners
    3. Verify busy partners (Raj/Amit/Manoj) have:
       - busy_until (ISO string, future)
       - busy_free_in_min >= 1
       - busy_job_code (string)
       - busy_job_service (string)
       - busy_job_status in [assigned, arrived_shop, arrived_customer, started]
    4. Verify non-busy partners do NOT have busy_until
    5. GET /api/admin/dispatch-attention
    6. Verify rows[].eligible_partners[] busy items include busy_free_in_min and busy_job_code
    7. Regression: GET /api/admin/settings → 200
    """
    print("\n" + "="*80)
    print("TEST 2: Partner Busy ETA")
    print("="*80)
    
    # Login
    print("\n[1] Logging in...")
    admin_token = login(ADMIN_PHONE)
    customer_token = login(CUSTOMER_PHONE)
    
    admin_client = client(admin_token)
    customer_client = client(customer_token)
    
    print("✓ All users logged in successfully")
    
    # Create a searching booking
    print("\n[2] Creating AC booking at pincode 800001...")
    booking = create_booking(customer_client, AC_SERVICE_ID, TEST_ADDRESS)
    booking_id = booking["id"]
    booking_code = booking.get("code", "N/A")
    print(f"✓ Created booking {booking_code} (ID: {booking_id})")
    
    print(f"\n[3] Paying for booking {booking_code}...")
    mock_payment(customer_client, booking_id)
    print(f"✓ Payment successful - booking should be 'searching'")
    
    # Wait a moment for dispatch to process
    time.sleep(3)
    
    # Get eligible partners
    print("\n[4] Getting eligible partners...")
    ep_data = get_eligible_partners(admin_client, booking_id)
    
    partners = ep_data.get("partners", [])
    print(f"   Found {len(partners)} in-area partners")
    
    # Expected busy partners (Raj, Amit, Manoj)
    expected_busy_phones = ["+919000000003", "+919000000005", "+919000000013"]
    expected_busy_names = ["Raj Kumar", "Amit Singh", "Manoj Prasad"]
    
    busy_partners = [p for p in partners if p.get("busy") == True]
    non_busy_partners = [p for p in partners if p.get("busy") == False]
    
    print(f"   Busy partners: {len(busy_partners)}")
    print(f"   Non-busy partners: {len(non_busy_partners)}")
    
    # Verify busy partners have all required fields
    print("\n[5] Verifying busy partner ETA fields...")
    
    for p in busy_partners:
        name = p.get("name", "Unknown")
        phone = p.get("phone", "Unknown")
        print(f"\n   Checking {name} ({phone})...")
        
        # busy_until (ISO string, future)
        busy_until = p.get("busy_until")
        assert busy_until is not None, f"❌ FAIL: {name} has no busy_until"
        
        # Parse and verify it's in the future
        try:
            busy_until_dt = datetime.fromisoformat(busy_until.replace("Z", "+00:00"))
            now = datetime.now(busy_until_dt.tzinfo)
            assert busy_until_dt > now, f"❌ FAIL: {name} busy_until is not in the future: {busy_until}"
            print(f"      ✓ busy_until: {busy_until} (future)")
        except Exception as e:
            raise AssertionError(f"❌ FAIL: {name} busy_until parse error: {e}")
        
        # busy_free_in_min >= 1
        busy_free_in_min = p.get("busy_free_in_min")
        assert busy_free_in_min is not None, f"❌ FAIL: {name} has no busy_free_in_min"
        assert isinstance(busy_free_in_min, int), f"❌ FAIL: {name} busy_free_in_min is not int: {type(busy_free_in_min)}"
        assert busy_free_in_min >= 1, f"❌ FAIL: {name} busy_free_in_min={busy_free_in_min}, expected >= 1"
        print(f"      ✓ busy_free_in_min: {busy_free_in_min}")
        
        # busy_job_code (string)
        busy_job_code = p.get("busy_job_code")
        assert busy_job_code is not None, f"❌ FAIL: {name} has no busy_job_code"
        assert isinstance(busy_job_code, str), f"❌ FAIL: {name} busy_job_code is not string: {type(busy_job_code)}"
        assert len(busy_job_code) > 0, f"❌ FAIL: {name} busy_job_code is empty"
        print(f"      ✓ busy_job_code: {busy_job_code}")
        
        # busy_job_service (string)
        busy_job_service = p.get("busy_job_service")
        assert busy_job_service is not None, f"❌ FAIL: {name} has no busy_job_service"
        assert isinstance(busy_job_service, str), f"❌ FAIL: {name} busy_job_service is not string: {type(busy_job_service)}"
        print(f"      ✓ busy_job_service: {busy_job_service}")
        
        # busy_job_status in [assigned, arrived_shop, arrived_customer, started]
        busy_job_status = p.get("busy_job_status")
        assert busy_job_status is not None, f"❌ FAIL: {name} has no busy_job_status"
        valid_statuses = ["assigned", "arrived_shop", "arrived_customer", "started"]
        assert busy_job_status in valid_statuses, f"❌ FAIL: {name} busy_job_status={busy_job_status}, expected one of {valid_statuses}"
        print(f"      ✓ busy_job_status: {busy_job_status}")
    
    print(f"\n   ✓ All {len(busy_partners)} busy partners have complete ETA fields")
    
    # Verify non-busy partners do NOT have busy_until
    print("\n[6] Verifying non-busy partners do NOT have busy_until...")
    for p in non_busy_partners:
        name = p.get("name", "Unknown")
        busy_until = p.get("busy_until")
        assert busy_until is None, f"❌ FAIL: Non-busy partner {name} has busy_until={busy_until}"
    
    if non_busy_partners:
        print(f"   ✓ All {len(non_busy_partners)} non-busy partners have no busy_until")
    else:
        print(f"   ⚠ No non-busy partners found (all busy - this is expected state)")
    
    # Get dispatch-attention
    print("\n[7] Getting dispatch-attention...")
    attention = get_dispatch_attention(admin_client)
    
    rows = attention.get("rows", [])
    count = attention.get("count", 0)
    print(f"   Found {count} bookings in dispatch-attention")
    
    # Find our booking in the attention list
    our_row = None
    for row in rows:
        if row.get("id") == booking_id:
            our_row = row
            break
    
    if our_row:
        print(f"   ✓ Found booking {booking_code} in dispatch-attention")
        
        # Verify eligible_partners have busy ETA fields
        print("\n[8] Verifying dispatch-attention eligible_partners busy ETA fields...")
        
        eligible_partners = our_row.get("eligible_partners", [])
        print(f"   Found {len(eligible_partners)} eligible partners in attention row")
        
        busy_in_attention = [p for p in eligible_partners if p.get("availability") == "busy"]
        print(f"   Busy partners in attention: {len(busy_in_attention)}")
        
        for p in busy_in_attention:
            name = p.get("name", "Unknown")
            print(f"\n      Checking {name}...")
            
            # busy_free_in_min
            busy_free_in_min = p.get("busy_free_in_min")
            assert busy_free_in_min is not None, f"❌ FAIL: {name} in attention has no busy_free_in_min"
            assert isinstance(busy_free_in_min, int), f"❌ FAIL: {name} busy_free_in_min is not int"
            assert busy_free_in_min >= 1, f"❌ FAIL: {name} busy_free_in_min={busy_free_in_min}, expected >= 1"
            print(f"         ✓ busy_free_in_min: {busy_free_in_min}")
            
            # busy_job_code
            busy_job_code = p.get("busy_job_code")
            assert busy_job_code is not None, f"❌ FAIL: {name} in attention has no busy_job_code"
            assert isinstance(busy_job_code, str), f"❌ FAIL: {name} busy_job_code is not string"
            print(f"         ✓ busy_job_code: {busy_job_code}")
            
            # busy_until (optional but should be present for busy partners)
            busy_until = p.get("busy_until")
            if busy_until:
                print(f"         ✓ busy_until: {busy_until}")
        
        print(f"\n   ✓ All busy partners in dispatch-attention have required ETA fields")
    else:
        print(f"   ⚠ Booking {booking_code} not in dispatch-attention (may have free partners available)")
    
    # Regression: GET /api/admin/settings
    print("\n[9] Regression test: GET /api/admin/settings...")
    settings = get_settings(admin_client)
    assert "business_config" in settings, "❌ FAIL: No business_config in settings"
    print("   ✓ GET /api/admin/settings → 200 with business_config")
    
    # Cleanup
    cancel_booking(customer_client, booking_id, "test cleanup")
    
    print("\n" + "="*80)
    print("✅ TEST 2 PASSED: Partner Busy ETA")
    print("="*80)


if __name__ == "__main__":
    print("\n" + "="*80)
    print("ENHANCEMENT-5 (2026-09) Backend Testing")
    print("Testing Auto Nearby Wave + Partner Busy ETA")
    print("="*80)
    
    try:
        # Run Test 1: Auto Nearby Wave
        test_auto_nearby_wave()
        
        # Run Test 2: Partner Busy ETA
        test_partner_busy_eta()
        
        print("\n" + "="*80)
        print("✅✅✅ ALL TESTS PASSED (2/2) ✅✅✅")
        print("="*80)
        print("\nSUMMARY:")
        print("  ✅ TEST 1: Auto Nearby Wave - PASSED")
        print("  ✅ TEST 2: Partner Busy ETA - PASSED")
        print("\nNo critical issues found. ENHANCEMENT-5 is fully functional.")
        print("="*80)
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        raise
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        raise
