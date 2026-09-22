"""
AzoApp Backend Testing - NEW FEATURES
PART A: Refer-a-friend FIRST-BOOKING DISCOUNT
PART B: LIVE PARTNER CHAT (gated by full payment + assigned partner)

Base URL: https://support-hub-mobile-1.preview.emergentagent.com/api
Auth: Mobile OTP, demo OTP 123456
"""
import requests
import random
import time
from datetime import datetime, timedelta

BASE_URL = "https://support-hub-mobile-1.preview.emergentagent.com/api"
OTP = "123456"

# Test credentials
PRIYA_PHONE = "+919000000004"  # Existing customer with referral code AZO0004


def log(msg):
    """Print timestamped log message"""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")


def login(phone):
    """Login and return auth token"""
    log(f"Logging in as {phone}...")
    
    # Send OTP
    r = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone}, timeout=30)
    assert r.status_code == 200, f"Send OTP failed: {r.status_code} {r.text}"
    
    # Verify OTP
    r = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=30)
    assert r.status_code == 200, f"Verify OTP failed: {r.status_code} {r.text}"
    
    data = r.json()
    token = data.get("token")
    assert token, f"No token in response: {data}"
    
    log(f"✅ Logged in as {data['user'].get('name', phone)}")
    return token


def get_headers(token):
    """Return auth headers"""
    return {"Authorization": f"Bearer {token}"}


def test_part_a_referral_first_booking_discount():
    """
    PART A — Refer-a-friend FIRST-BOOKING DISCOUNT
    1) Create/login a BRAND-NEW customer with random unused phone
    2) Apply referral code "AZO0004" (Priya's code)
    3) Get a bookable service and check referee_discount
    4) Create a booking and verify referral_discount is applied
    5) Verify the discount actually reduces the total
    6) Create a SECOND booking and verify NO discount (first-booking only)
    """
    log("\n" + "="*80)
    log("PART A — REFER-A-FRIEND FIRST-BOOKING DISCOUNT")
    log("="*80)
    
    # Step 1: Create/login a BRAND-NEW customer with random unused phone
    log("\n[STEP 1] Creating brand-new customer with random unused phone...")
    random_digits = ''.join([str(random.randint(0, 9)) for _ in range(5)])
    new_phone = f"+9199000{random_digits}"
    log(f"New customer phone: {new_phone}")
    
    new_customer_token = login(new_phone)
    headers = get_headers(new_customer_token)
    
    # Verify this is a new customer with 0 bookings
    r = requests.get(f"{BASE_URL}/auth/me", headers=headers, timeout=30)
    assert r.status_code == 200, f"Get me failed: {r.status_code} {r.text}"
    customer_data = r.json()
    customer_id = customer_data.get("id")
    log(f"✅ New customer created: {customer_data.get('name', 'New User')} (ID: {customer_id})")
    
    # Step 2: Apply referral code "AZO0004" (Priya's code)
    log("\n[STEP 2] Applying referral code AZO0004 (Priya's code)...")
    r = requests.post(f"{BASE_URL}/referral/apply", 
                     json={"code": "AZO0004"}, 
                     headers=headers, 
                     timeout=30)
    assert r.status_code == 200, f"Apply referral failed: {r.status_code} {r.text}"
    apply_result = r.json()
    assert apply_result.get("ok") == True, f"Apply referral not ok: {apply_result}"
    log(f"✅ Referral code applied: {apply_result.get('detail')}")
    
    # Step 3: Get a bookable service and check referee_discount
    log("\n[STEP 3] Getting bookable service and checking referee_discount...")
    
    # Get referral summary to check referee_discount
    r = requests.get(f"{BASE_URL}/referral/summary", headers=headers, timeout=30)
    assert r.status_code == 200, f"Get referral summary failed: {r.status_code} {r.text}"
    summary = r.json()
    referee_discount = summary.get("referee_discount", 0)
    log(f"✅ Referee discount from summary: ₹{referee_discount}")
    assert referee_discount > 0, f"Referee discount should be > 0, got {referee_discount}"
    
    # Get a bookable service
    r = requests.get(f"{BASE_URL}/catalog/services", timeout=30)
    assert r.status_code == 200, f"Get services failed: {r.status_code} {r.text}"
    services = r.json()
    assert len(services) > 0, "No services found"
    
    # Pick first active service
    service = services[0]
    service_id = service["id"]
    service_name = service["name"]
    service_price = service["base_price"]
    log(f"✅ Selected service: {service_name} (ID: {service_id}, Price: ₹{service_price})")
    
    # Step 4: Create a booking and verify referral_discount is applied
    log("\n[STEP 4] Creating first booking with referral discount...")
    
    # Prepare booking data (using emergency to avoid scheduled_at requirement)
    booking_data = {
        "service_id": service_id,
        "address": {
            "line": "Test Address Line",
            "city": "Patna",
            "pincode": "800001",
            "state": "Bihar",
            "lat": 25.6,
            "lng": 85.1
        },
        "schedule_type": "emergency",
        "addons": []
    }
    
    # Create booking
    r = requests.post(f"{BASE_URL}/bookings", 
                     json=booking_data, 
                     headers=headers, 
                     timeout=30)
    assert r.status_code == 200, f"Create booking failed: {r.status_code} {r.text}"
    booking = r.json()
    booking_id = booking.get("id")
    booking_code = booking.get("code")
    log(f"✅ Booking created: {booking_code} (ID: {booking_id})")
    
    # Get booking details to check pricing
    r = requests.get(f"{BASE_URL}/bookings/{booking_id}", headers=headers, timeout=30)
    assert r.status_code == 200, f"Get booking failed: {r.status_code} {r.text}"
    booking_detail = r.json()
    pricing = booking_detail.get("pricing", {})
    
    log(f"\n📊 Booking Pricing Breakdown:")
    log(f"   Base: ₹{pricing.get('base', 0)}")
    log(f"   Subtotal: ₹{pricing.get('subtotal', 0)}")
    log(f"   GST: ₹{pricing.get('gst', 0)}")
    log(f"   Referral Discount: ₹{pricing.get('referral_discount', 0)}")
    log(f"   Total: ₹{pricing.get('total', 0)}")
    
    # Step 5: Verify the discount actually reduces the total
    log("\n[STEP 5] Verifying referral discount is applied...")
    referral_discount = pricing.get("referral_discount", 0)
    total = pricing.get("total", 0)
    
    assert referral_discount > 0, f"❌ FAIL: referral_discount should be > 0, got {referral_discount}"
    log(f"✅ PASS: Referral discount applied: ₹{referral_discount}")
    
    # Verify discount is capped to referee_discount or total-1
    expected_discount = min(referee_discount, pricing.get("subtotal", 0) + pricing.get("gst", 0) - 1)
    assert abs(referral_discount - expected_discount) < 1, \
        f"❌ FAIL: Discount {referral_discount} doesn't match expected {expected_discount}"
    log(f"✅ PASS: Discount amount is correct (capped to ₹{expected_discount})")
    
    # Verify total is reduced
    total_before_discount = pricing.get("subtotal", 0) + pricing.get("gst", 0)
    expected_total = round(total_before_discount - referral_discount, 2)
    assert abs(total - expected_total) < 0.1, \
        f"❌ FAIL: Total {total} doesn't match expected {expected_total}"
    log(f"✅ PASS: Total is correctly reduced: ₹{total} (was ₹{total_before_discount})")
    
    # Step 6: Create a SECOND booking and verify NO discount (first-booking only)
    log("\n[STEP 6] Creating second booking to verify NO discount...")
    
    # Create second booking
    r = requests.post(f"{BASE_URL}/bookings", 
                     json=booking_data, 
                     headers=headers, 
                     timeout=30)
    assert r.status_code == 200, f"Create second booking failed: {r.status_code} {r.text}"
    booking2 = r.json()
    booking2_id = booking2.get("id")
    booking2_code = booking2.get("code")
    log(f"✅ Second booking created: {booking2_code} (ID: {booking2_id})")
    
    # Get second booking details
    r = requests.get(f"{BASE_URL}/bookings/{booking2_id}", headers=headers, timeout=30)
    assert r.status_code == 200, f"Get second booking failed: {r.status_code} {r.text}"
    booking2_detail = r.json()
    pricing2 = booking2_detail.get("pricing", {})
    
    log(f"\n📊 Second Booking Pricing Breakdown:")
    log(f"   Base: ₹{pricing2.get('base', 0)}")
    log(f"   Subtotal: ₹{pricing2.get('subtotal', 0)}")
    log(f"   GST: ₹{pricing2.get('gst', 0)}")
    log(f"   Referral Discount: ₹{pricing2.get('referral_discount', 0)}")
    log(f"   Total: ₹{pricing2.get('total', 0)}")
    
    referral_discount2 = pricing2.get("referral_discount", 0)
    assert referral_discount2 == 0, \
        f"❌ FAIL: Second booking should have NO referral discount, got ₹{referral_discount2}"
    log(f"✅ PASS: Second booking has NO referral discount (first-booking only)")
    
    log("\n" + "="*80)
    log("✅ PART A COMPLETE - ALL TESTS PASSED")
    log("="*80)
    
    return {
        "new_customer_phone": new_phone,
        "new_customer_token": new_customer_token,
        "first_booking_id": booking_id,
        "first_booking_code": booking_code,
        "referral_discount": referral_discount,
        "second_booking_id": booking2_id,
        "second_booking_code": booking2_code
    }


def test_part_b_live_partner_chat():
    """
    PART B — LIVE PARTNER CHAT (gated by full payment + assigned partner)
    7) Login customer Priya, find booking AZO8136D0 (status assigned, payment paid, partner assigned)
    8) GET messages → enabled=true, partner info present
    9) POST message → works, returns message with sender_role "customer"
    10) NEGATIVE: find booking AZOEFDFF4 (status searching, payment pending, no partner) → POST message fails
    11) AUTH: GET messages with no auth → 401/403
    """
    log("\n" + "="*80)
    log("PART B — LIVE PARTNER CHAT")
    log("="*80)
    
    # Step 7: Login as Priya and find booking AZO8136D0
    log("\n[STEP 7] Logging in as Priya and finding booking AZO8136D0...")
    priya_token = login(PRIYA_PHONE)
    headers = get_headers(priya_token)
    
    # Get Priya's bookings
    r = requests.get(f"{BASE_URL}/bookings", headers=headers, timeout=30)
    assert r.status_code == 200, f"Get bookings failed: {r.status_code} {r.text}"
    bookings = r.json()
    
    # Find booking AZO8136D0
    target_booking = None
    for b in bookings:
        if b.get("code") == "AZO8136D0":
            target_booking = b
            break
    
    if not target_booking:
        log("⚠️  Booking AZO8136D0 not found, searching for any assigned+paid booking...")
        # Find any booking with status=assigned, payment_status=paid, partner assigned
        for b in bookings:
            if (b.get("status") == "assigned" and 
                b.get("payment_status") == "paid" and 
                b.get("partner_id")):
                target_booking = b
                log(f"✅ Found alternative booking: {b.get('code')}")
                break
    
    assert target_booking, "❌ FAIL: No suitable booking found (status=assigned, payment=paid, partner assigned)"
    
    booking_id = target_booking.get("id")
    booking_code = target_booking.get("code")
    log(f"✅ Found booking: {booking_code} (ID: {booking_id})")
    log(f"   Status: {target_booking.get('status')}")
    log(f"   Payment: {target_booking.get('payment_status')}")
    log(f"   Partner: {target_booking.get('partner_name', 'N/A')}")
    
    # Step 8: GET messages → enabled=true, partner info present
    log("\n[STEP 8] Getting messages for booking...")
    r = requests.get(f"{BASE_URL}/bookings/{booking_id}/messages", headers=headers, timeout=30)
    assert r.status_code == 200, f"Get messages failed: {r.status_code} {r.text}"
    messages_data = r.json()
    
    log(f"\n📨 Messages Response:")
    log(f"   Enabled: {messages_data.get('enabled')}")
    log(f"   Payment Status: {messages_data.get('payment_status')}")
    log(f"   Booking Status: {messages_data.get('status')}")
    log(f"   Partner: {messages_data.get('partner', {}).get('name', 'N/A')}")
    log(f"   Partner Phone: {messages_data.get('partner', {}).get('phone', 'N/A')}")
    log(f"   Messages Count: {len(messages_data.get('messages', []))}")
    
    assert messages_data.get("enabled") == True, \
        f"❌ FAIL: Chat should be enabled, got {messages_data.get('enabled')}"
    log(f"✅ PASS: Chat is enabled")
    
    partner = messages_data.get("partner", {})
    assert partner.get("name"), f"❌ FAIL: Partner name should be present"
    assert partner.get("phone"), f"❌ FAIL: Partner phone should be present"
    log(f"✅ PASS: Partner info present (name: {partner.get('name')}, phone: {partner.get('phone')})")
    
    assert isinstance(messages_data.get("messages"), list), \
        f"❌ FAIL: Messages should be a list"
    log(f"✅ PASS: Messages is a list with {len(messages_data.get('messages', []))} items")
    
    # Step 9: POST message → works, returns message with sender_role "customer"
    log("\n[STEP 9] Posting test message...")
    test_message = f"Test hello from automated test at {datetime.now().strftime('%H:%M:%S')}"
    
    r = requests.post(f"{BASE_URL}/bookings/{booking_id}/messages",
                     json={"text": test_message},
                     headers=headers,
                     timeout=30)
    assert r.status_code == 200, f"Post message failed: {r.status_code} {r.text}"
    message_response = r.json()
    
    log(f"\n📤 Posted Message:")
    log(f"   ID: {message_response.get('id')}")
    log(f"   Text: {message_response.get('text')}")
    log(f"   Sender Role: {message_response.get('sender_role')}")
    log(f"   Created At: {message_response.get('created_at')}")
    
    assert message_response.get("sender_role") == "customer", \
        f"❌ FAIL: Sender role should be 'customer', got {message_response.get('sender_role')}"
    log(f"✅ PASS: Message posted with sender_role='customer'")
    
    assert message_response.get("text") == test_message, \
        f"❌ FAIL: Message text doesn't match"
    log(f"✅ PASS: Message text matches")
    
    # Verify message appears in list
    log("\n[STEP 9b] Verifying message appears in list...")
    r = requests.get(f"{BASE_URL}/bookings/{booking_id}/messages", headers=headers, timeout=30)
    assert r.status_code == 200, f"Get messages failed: {r.status_code} {r.text}"
    messages_data = r.json()
    
    messages = messages_data.get("messages", [])
    found_message = False
    for msg in messages:
        if msg.get("id") == message_response.get("id"):
            found_message = True
            break
    
    assert found_message, f"❌ FAIL: Posted message not found in messages list"
    log(f"✅ PASS: Posted message appears in messages list")
    
    # Step 10: NEGATIVE - find booking with status=searching, payment=pending, no partner
    log("\n[STEP 10] NEGATIVE TEST: Attempting to post message to booking without partner...")
    
    # Find booking AZOEFDFF4 or any booking with status=searching, payment=pending
    negative_booking = None
    for b in bookings:
        if b.get("code") == "AZOEFDFF4":
            negative_booking = b
            break
    
    if not negative_booking:
        log("⚠️  Booking AZOEFDFF4 not found, searching for any searching+pending booking...")
        for b in bookings:
            if (b.get("status") == "searching" and 
                b.get("payment_status") == "pending" and 
                not b.get("partner_id")):
                negative_booking = b
                log(f"✅ Found alternative booking: {b.get('code')}")
                break
    
    if negative_booking:
        negative_booking_id = negative_booking.get("id")
        negative_booking_code = negative_booking.get("code")
        log(f"✅ Found negative test booking: {negative_booking_code}")
        log(f"   Status: {negative_booking.get('status')}")
        log(f"   Payment: {negative_booking.get('payment_status')}")
        log(f"   Partner: {negative_booking.get('partner_name', 'None')}")
        
        # Try to post message - should fail with 400
        r = requests.post(f"{BASE_URL}/bookings/{negative_booking_id}/messages",
                         json={"text": "This should fail"},
                         headers=headers,
                         timeout=30)
        
        assert r.status_code == 400, \
            f"❌ FAIL: Should return 400 for booking without partner, got {r.status_code}"
        log(f"✅ PASS: POST message correctly rejected with 400 for booking without partner")
        
        error_detail = r.json().get("detail", "")
        log(f"   Error message: {error_detail}")
        
        # Try to get messages - should return enabled=false
        r = requests.get(f"{BASE_URL}/bookings/{negative_booking_id}/messages", 
                        headers=headers, 
                        timeout=30)
        assert r.status_code == 200, f"Get messages failed: {r.status_code} {r.text}"
        neg_messages_data = r.json()
        
        assert neg_messages_data.get("enabled") == False, \
            f"❌ FAIL: Chat should be disabled for booking without partner"
        log(f"✅ PASS: GET messages returns enabled=false for booking without partner")
    else:
        log("⚠️  WARNING: No suitable negative test booking found (skipping negative test)")
    
    # Step 11: AUTH - GET messages with no auth → 401/403
    log("\n[STEP 11] AUTH TEST: Attempting to get messages without auth...")
    
    r = requests.get(f"{BASE_URL}/bookings/{booking_id}/messages", timeout=30)
    assert r.status_code in (401, 403), \
        f"❌ FAIL: Should return 401/403 without auth, got {r.status_code}"
    log(f"✅ PASS: GET messages without auth correctly rejected with {r.status_code}")
    
    log("\n" + "="*80)
    log("✅ PART B COMPLETE - ALL TESTS PASSED")
    log("="*80)
    
    return {
        "booking_id": booking_id,
        "booking_code": booking_code,
        "message_id": message_response.get("id"),
        "partner_name": partner.get("name")
    }


def main():
    """Run all tests"""
    log("\n" + "="*80)
    log("AZOAPP BACKEND TESTING - NEW FEATURES")
    log("Base URL: " + BASE_URL)
    log("="*80)
    
    results = {}
    
    try:
        # Run Part A
        part_a_results = test_part_a_referral_first_booking_discount()
        results["part_a"] = {"status": "PASS", "details": part_a_results}
    except Exception as e:
        log(f"\n❌ PART A FAILED: {str(e)}")
        results["part_a"] = {"status": "FAIL", "error": str(e)}
        import traceback
        traceback.print_exc()
    
    try:
        # Run Part B
        part_b_results = test_part_b_live_partner_chat()
        results["part_b"] = {"status": "PASS", "details": part_b_results}
    except Exception as e:
        log(f"\n❌ PART B FAILED: {str(e)}")
        results["part_b"] = {"status": "FAIL", "error": str(e)}
        import traceback
        traceback.print_exc()
    
    # Print summary
    log("\n" + "="*80)
    log("TEST SUMMARY")
    log("="*80)
    log(f"PART A (Referral First-Booking Discount): {results.get('part_a', {}).get('status', 'NOT RUN')}")
    log(f"PART B (Live Partner Chat): {results.get('part_b', {}).get('status', 'NOT RUN')}")
    
    if all(r.get("status") == "PASS" for r in results.values()):
        log("\n✅ ALL TESTS PASSED")
        return 0
    else:
        log("\n❌ SOME TESTS FAILED")
        return 1


if __name__ == "__main__":
    exit(main())
