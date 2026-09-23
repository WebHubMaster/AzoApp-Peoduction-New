#!/usr/bin/env python3
"""
END-TO-END TEST: MERCHANT REFERRAL ATTRIBUTION FLOW
Tests that a customer booking via merchant QR/link gets:
(a) tagged to that merchant
(b) generates ACTUAL merchant commission on completion
(c) shows up in merchant's referral panel with that commission
"""

import requests
import json
import time
from datetime import datetime, timedelta

BASE_URL = "https://merchant-mobile-ui.preview.emergentagent.com/api"

# Test accounts from review_request
MERCHANT_PHONE = "+919000000002"  # Sharma Electricals, merchant_code = "3L6MKM3"
CUSTOMER_PHONE = "+919000000004"  # Priya
PARTNER_PHONE = "+919000000003"   # Raj Kumar
ADMIN_PHONE = "+919000000000"
OTP = "123456"

def get_token(phone):
    """Get auth token for a phone number"""
    # Send OTP
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    print(f"Send OTP to {phone}: {resp.status_code}")
    
    # Verify OTP
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    print(f"Verify OTP for {phone}: {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        token = data.get("token") or data.get("access_token")
        user = data.get("user", {})
        print(f"  Token obtained for {phone}, user_id: {user.get('id')}, role: {user.get('role')}")
        return token, user
    else:
        print(f"  ERROR: {resp.text}")
        return None, None

def get_merchant_info(merchant_token):
    """Get merchant code and ID"""
    headers = {"Authorization": f"Bearer {merchant_token}"}
    resp = requests.get(f"{BASE_URL}/merchant/my-code", headers=headers)
    print(f"\nGET /api/merchant/my-code: {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        print(f"  Merchant code: {data.get('merchant_code')}")
        print(f"  Merchant ID: {data.get('merchant_id')}")
        return data
    else:
        print(f"  ERROR: {resp.text}")
        return None

def get_baseline_report(merchant_token):
    """Get baseline merchant referral report"""
    headers = {"Authorization": f"Bearer {merchant_token}"}
    resp = requests.get(f"{BASE_URL}/merchant/referral/report", headers=headers)
    print(f"\nGET /api/merchant/referral/report: {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        print(f"  Total: ₹{data.get('total', 0)}")
        print(f"  Customer commission: ₹{data.get('customer_commission', 0)}")
        print(f"  Customer count: {data.get('customer_count', 0)}")
        return data
    else:
        print(f"  ERROR: {resp.text}")
        return None

def get_baseline_customers(merchant_token):
    """Get baseline merchant referral customers"""
    headers = {"Authorization": f"Bearer {merchant_token}"}
    resp = requests.get(f"{BASE_URL}/merchant/referral/customers", headers=headers)
    print(f"\nGET /api/merchant/referral/customers: {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        customers = data.get('customers', [])
        print(f"  Customer count: {len(customers)}")
        
        # Check if Priya is present
        priya = None
        for c in customers:
            if c.get('phone') == CUSTOMER_PHONE:
                priya = c
                print(f"  Priya found: total_commission=₹{c.get('total_commission', 0)}")
                break
        
        if not priya:
            print(f"  Priya NOT found in customer list")
        
        return data, priya
    else:
        print(f"  ERROR: {resp.text}")
        return None, None

def get_active_service(customer_token):
    """Get an active service for booking"""
    headers = {"Authorization": f"Bearer {customer_token}"}
    resp = requests.get(f"{BASE_URL}/catalog/services", headers=headers)
    print(f"\nGET /api/catalog/services: {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        # Handle both list and dict responses
        if isinstance(data, list):
            services = data
        else:
            services = data.get('services', [])
        
        if services:
            service = services[0]
            print(f"  Using service: {service.get('name')} (id: {service.get('id')}, price: ₹{service.get('price')})")
            return service
        else:
            print(f"  ERROR: No services found")
            return None
    else:
        print(f"  ERROR: {resp.text}")
        return None

def create_booking_with_merchant_ref(customer_token, service_id, merchant_ref_code):
    """Create a booking with merchant referral code"""
    headers = {"Authorization": f"Bearer {customer_token}"}
    
    # Schedule for tomorrow
    scheduled_at = (datetime.utcnow() + timedelta(days=1)).isoformat() + "Z"
    
    payload = {
        "items": [
            {
                "service_id": service_id,
                "qty": 1
            }
        ],
        "address": {
            "line1": "123 Test Street",
            "line2": "Near Test Market",
            "city": "Patna",
            "state": "Bihar",
            "pincode": "800001",
            "landmark": "Test Landmark"
        },
        "schedule_type": "schedule",
        "scheduled_at": scheduled_at,
        "merchant_ref_code": merchant_ref_code
    }
    
    print(f"\nPOST /api/bookings/grouped with merchant_ref_code={merchant_ref_code}")
    resp = requests.post(f"{BASE_URL}/bookings/grouped", headers=headers, json=payload)
    print(f"  Status: {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        # Handle both direct booking and nested booking response
        if 'booking' in data:
            booking = data.get('booking', {})
        else:
            booking = data
        
        print(f"  Response keys: {list(data.keys())}")
        print(f"  Booking created: {booking.get('code')}")
        print(f"  Booking ID: {booking.get('id')}")
        print(f"  Merchant ID: {booking.get('merchant_id')}")
        print(f"  Status: {booking.get('status')}")
        return booking
    else:
        print(f"  ERROR: {resp.text}")
        return None

def get_customer_bookings(customer_token):
    """Get customer bookings"""
    headers = {"Authorization": f"Bearer {customer_token}"}
    resp = requests.get(f"{BASE_URL}/bookings", headers=headers)
    print(f"\nGET /api/bookings (customer): {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        # Handle both list and dict responses
        if isinstance(data, list):
            bookings = data
        else:
            bookings = data.get('bookings', [])
        print(f"  Total bookings: {len(bookings)}")
        return bookings
    else:
        print(f"  ERROR: {resp.text}")
        return []

def create_second_booking_without_ref(customer_token, service_id):
    """Create a second booking WITHOUT merchant_ref_code to test auto-link"""
    headers = {"Authorization": f"Bearer {customer_token}"}
    
    scheduled_at = (datetime.utcnow() + timedelta(days=1)).isoformat() + "Z"
    
    payload = {
        "items": [
            {
                "service_id": service_id,
                "qty": 1
            }
        ],
        "address": {
            "line1": "123 Test Street",
            "line2": "Near Test Market",
            "city": "Patna",
            "state": "Bihar",
            "pincode": "800001",
            "landmark": "Test Landmark"
        },
        "schedule_type": "schedule",
        "scheduled_at": scheduled_at
        # NO merchant_ref_code
    }
    
    print(f"\nPOST /api/bookings/grouped WITHOUT merchant_ref_code (testing auto-link)")
    resp = requests.post(f"{BASE_URL}/bookings/grouped", headers=headers, json=payload)
    print(f"  Status: {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        # Handle both direct booking and nested booking response
        if 'booking' in data:
            booking = data.get('booking', {})
        else:
            booking = data
        
        print(f"  Booking created: {booking.get('code')}")
        print(f"  Merchant ID: {booking.get('merchant_id')} (should be auto-linked)")
        return booking
    else:
        print(f"  ERROR: {resp.text}")
        return None

def pay_booking(customer_token, booking_id):
    """Pay for a booking using mock payment"""
    headers = {"Authorization": f"Bearer {customer_token}"}
    
    # Create payment order
    print(f"\nPOST /api/payments/order for booking {booking_id}")
    resp = requests.post(f"{BASE_URL}/payments/order", headers=headers, json={
        "purpose": "booking",
        "booking_id": booking_id
    })
    print(f"  Status: {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"  ERROR: {resp.text}")
        return False
    
    order_data = resp.json()
    print(f"  Order created: {order_data.get('order_id')}")
    
    # Mock payment
    print(f"\nPOST /api/payments/mock for booking {booking_id}")
    resp = requests.post(f"{BASE_URL}/payments/mock", headers=headers, json={
        "purpose": "booking",
        "booking_id": booking_id
    })
    print(f"  Status: {resp.status_code}")
    
    if resp.status_code == 200:
        print(f"  Payment successful")
        return True
    else:
        print(f"  ERROR: {resp.text}")
        return False

def assign_partner(admin_token, booking_id, partner_id):
    """Assign partner to booking"""
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    print(f"\nPOST /api/admin/bookings/{booking_id}/assign")
    resp = requests.post(f"{BASE_URL}/admin/bookings/{booking_id}/assign", headers=headers, json={
        "partner_id": partner_id
    })
    print(f"  Status: {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        print(f"  Partner assigned successfully")
        print(f"  Booking status after assignment: {data.get('status')}")
        return True, data.get('status')
    else:
        print(f"  ERROR: {resp.text}")
        return False, None

def partner_accept_booking(partner_token, booking_id):
    """Partner accepts the booking"""
    headers = {"Authorization": f"Bearer {partner_token}"}
    
    # First, try to get the booking from ring-pending
    print(f"\nGET /api/bookings/partner/ring-pending (checking for booking)")
    resp = requests.get(f"{BASE_URL}/bookings/partner/ring-pending", headers=headers)
    print(f"  Status: {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        pending = data if isinstance(data, list) else data.get('bookings', [])
        print(f"  Pending jobs: {len(pending)}")
        
        # Check if our booking is in the list
        our_booking = None
        for b in pending:
            if b.get('id') == booking_id:
                our_booking = b
                print(f"  Found our booking {b.get('code')} in ring-pending")
                break
        
        if not our_booking:
            print(f"  Our booking NOT in ring-pending, trying direct accept")
    
    print(f"\nPOST /api/bookings/{booking_id}/accept")
    resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/accept", headers=headers)
    print(f"  Status: {resp.status_code}")
    
    if resp.status_code == 200:
        print(f"  Booking accepted by partner")
        return True
    else:
        print(f"  ERROR: {resp.text}")
        # Try alternative endpoint if available
        print(f"\n  Trying alternative: POST /api/bookings/partner/{booking_id}/accept")
        resp = requests.post(f"{BASE_URL}/bookings/partner/{booking_id}/accept", headers=headers)
        print(f"  Status: {resp.status_code}")
        
        if resp.status_code == 200:
            print(f"  Booking accepted by partner (alternative endpoint)")
            return True
        else:
            print(f"  ERROR: {resp.text}")
            return False

def partner_upload_evidence(partner_token, booking_id):
    """Partner uploads before work evidence"""
    headers = {"Authorization": f"Bearer {partner_token}"}
    
    print(f"\nPOST /api/bookings/{booking_id}/evidence (uploading before photos)")
    resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/evidence", headers=headers, json={
        "stage": "before",
        "images": ["https://via.placeholder.com/400x300.png?text=Before+Work+Photo"]
    })
    print(f"  Status: {resp.status_code}")
    
    if resp.status_code == 200:
        print(f"  Evidence uploaded")
        return True
    else:
        print(f"  ERROR: {resp.text}")
        return False

def partner_start_work(partner_token, booking_id, start_otp):
    """Partner starts work"""
    headers = {"Authorization": f"Bearer {partner_token}"}
    
    print(f"\nPOST /api/bookings/{booking_id}/start-otp with OTP {start_otp}")
    resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/start-otp", headers=headers, json={
        "otp": start_otp
    })
    print(f"  Status: {resp.status_code}")
    
    if resp.status_code == 200:
        print(f"  Work started")
        return True
    else:
        print(f"  ERROR: {resp.text}")
        return False

def partner_complete_work(partner_token, booking_id, completion_otp):
    """Partner completes work"""
    headers = {"Authorization": f"Bearer {partner_token}"}
    
    print(f"\nPOST /api/bookings/{booking_id}/complete with OTP {completion_otp}")
    resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/complete", headers=headers, json={
        "otp": completion_otp
    })
    print(f"  Status: {resp.status_code}")
    
    if resp.status_code == 200:
        print(f"  Work completed")
        return True
    else:
        print(f"  ERROR: {resp.text}")
        return False

def get_booking_detail(admin_token, booking_id):
    """Get booking detail from admin"""
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    print(f"\nGET /api/admin/bookings/{booking_id}/detail")
    resp = requests.get(f"{BASE_URL}/admin/bookings/{booking_id}/detail", headers=headers)
    print(f"  Status: {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        print(f"  Booking detail keys: {list(data.keys())[:10]}")
        if 'otps' in data:
            print(f"  OTPs: {data.get('otps')}")
        return data
    else:
        print(f"  ERROR: {resp.text}")
        return None

def check_commission_ledger(booking_id):
    """Check commission ledger for the booking (direct DB query via admin endpoint if available)"""
    # This would require a direct DB query or admin endpoint
    # For now, we'll check via the merchant panel
    pass

def get_merchant_report_after(merchant_token):
    """Get merchant referral report after booking completion"""
    headers = {"Authorization": f"Bearer {merchant_token}"}
    resp = requests.get(f"{BASE_URL}/merchant/referral/report", headers=headers)
    print(f"\nGET /api/merchant/referral/report (AFTER): {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        print(f"  Total: ₹{data.get('total', 0)}")
        print(f"  Customer commission: ₹{data.get('customer_commission', 0)}")
        print(f"  Customer count: {data.get('customer_count', 0)}")
        return data
    else:
        print(f"  ERROR: {resp.text}")
        return None

def get_merchant_customers_after(merchant_token, customer_id):
    """Get merchant referral customers after booking completion"""
    headers = {"Authorization": f"Bearer {merchant_token}"}
    resp = requests.get(f"{BASE_URL}/merchant/referral/customers", headers=headers)
    print(f"\nGET /api/merchant/referral/customers (AFTER): {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        customers = data.get('customers', [])
        print(f"  Customer count: {len(customers)}")
        
        # Find Priya
        priya = None
        for c in customers:
            if c.get('phone') == CUSTOMER_PHONE or c.get('id') == customer_id:
                priya = c
                print(f"  Priya found: total_commission=₹{c.get('total_commission', 0)}")
                break
        
        if not priya:
            print(f"  Priya NOT found in customer list")
        
        return data, priya
    else:
        print(f"  ERROR: {resp.text}")
        return None, None

def get_merchant_customer_detail(merchant_token, customer_id):
    """Get merchant referral customer detail"""
    headers = {"Authorization": f"Bearer {merchant_token}"}
    resp = requests.get(f"{BASE_URL}/merchant/referral/customers/{customer_id}", headers=headers)
    print(f"\nGET /api/merchant/referral/customers/{customer_id}: {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        print(f"  Customer detail retrieved")
        
        # Check for privacy leaks
        if 'phone' in data or 'email' in data or 'address' in data:
            print(f"  ⚠️ WARNING: Contact fields leaked in customer detail!")
            print(f"    Phone: {data.get('phone')}")
            print(f"    Email: {data.get('email')}")
            print(f"    Address: {data.get('address')}")
        else:
            print(f"  ✅ No contact fields leaked (privacy-safe)")
        
        # Check service-wise commission
        jobs = data.get('jobs', [])
        print(f"  Jobs count: {len(jobs)}")
        for job in jobs:
            print(f"    Job: {job.get('booking_code')}, eligible_amount: ₹{job.get('eligible_amount', 0)}, commission_pct: {job.get('commission_pct', 0)}%, earned: ₹{job.get('earned', 0)}")
        
        return data
    else:
        print(f"  ERROR: {resp.text}")
        return None

def get_merchant_commission_history(merchant_token):
    """Get merchant referral commission history"""
    headers = {"Authorization": f"Bearer {merchant_token}"}
    resp = requests.get(f"{BASE_URL}/merchant/referral/commission", headers=headers)
    print(f"\nGET /api/merchant/referral/commission: {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        items = data.get('items', [])
        print(f"  Commission items count: {len(items)}")
        
        # Find Customer-type row for our booking
        for item in items:
            if item.get('type') == 'Customer':
                print(f"    Customer commission: booking={item.get('booking_code')}, earned=₹{item.get('earned', 0)}")
        
        return data
    else:
        print(f"  ERROR: {resp.text}")
        return None

def main():
    print("=" * 80)
    print("MERCHANT REFERRAL ATTRIBUTION FLOW - END-TO-END TEST")
    print("=" * 80)
    
    # Get tokens
    print("\n### STEP 0: GET AUTH TOKENS ###")
    merchant_token, merchant_user = get_token(MERCHANT_PHONE)
    customer_token, customer_user = get_token(CUSTOMER_PHONE)
    partner_token, partner_user = get_token(PARTNER_PHONE)
    admin_token, admin_user = get_token(ADMIN_PHONE)
    
    if not all([merchant_token, customer_token, partner_token, admin_token]):
        print("\n❌ FAILED: Could not get all auth tokens")
        return
    
    merchant_id = merchant_user.get('id')
    customer_id = customer_user.get('id')
    partner_id = partner_user.get('id')
    
    print(f"\nMerchant ID: {merchant_id}")
    print(f"Customer ID: {customer_id}")
    print(f"Partner ID: {partner_id}")
    
    # Get merchant info
    merchant_info = get_merchant_info(merchant_token)
    if not merchant_info:
        print("\n❌ FAILED: Could not get merchant info")
        return
    
    merchant_code = merchant_info.get('merchant_code')
    print(f"\nMerchant code: {merchant_code}")
    
    # STEP 1: BASELINE
    print("\n" + "=" * 80)
    print("### STEP 1: BASELINE - Get current merchant referral data ###")
    print("=" * 80)
    
    baseline_report = get_baseline_report(merchant_token)
    baseline_customers, baseline_priya = get_baseline_customers(merchant_token)
    
    if not baseline_report:
        print("\n❌ FAILED: Could not get baseline report")
        return
    
    baseline_total = baseline_report.get('total', 0)
    baseline_customer_commission = baseline_report.get('customer_commission', 0)
    baseline_customer_count = baseline_report.get('customer_count', 0)
    baseline_priya_commission = baseline_priya.get('total_commission', 0) if baseline_priya else 0
    
    print(f"\nBaseline recorded:")
    print(f"  Total: ₹{baseline_total}")
    print(f"  Customer commission: ₹{baseline_customer_commission}")
    print(f"  Customer count: {baseline_customer_count}")
    print(f"  Priya commission: ₹{baseline_priya_commission}")
    
    # STEP 2: BOOK WITH MERCHANT REF CODE
    print("\n" + "=" * 80)
    print("### STEP 2: BOOK WITH MERCHANT REF CODE ###")
    print("=" * 80)
    
    # Get active service
    service = get_active_service(customer_token)
    if not service:
        print("\n❌ FAILED: Could not get active service")
        return
    
    service_id = service.get('id')
    
    # Create booking with merchant ref code
    booking1 = create_booking_with_merchant_ref(customer_token, service_id, merchant_code)
    if not booking1:
        print("\n❌ FAILED: Could not create booking with merchant ref code")
        return
    
    booking1_id = booking1.get('id')
    booking1_code = booking1.get('code')
    booking1_merchant_id = booking1.get('merchant_id')
    booking1_otps = booking1.get('otps', {})
    
    print(f"\n✅ TEST 2.1: Booking created with merchant_ref_code")
    print(f"  Booking code: {booking1_code}")
    print(f"  Booking merchant_id: {booking1_merchant_id}")
    print(f"  Booking OTPs: start={booking1_otps.get('start')}, complete={booking1_otps.get('complete')}")
    
    if booking1_merchant_id == merchant_id:
        print(f"  ✅ PASS: booking.merchant_id matches merchant ID")
    else:
        print(f"  ❌ FAIL: booking.merchant_id does NOT match merchant ID")
        print(f"    Expected: {merchant_id}")
        print(f"    Got: {booking1_merchant_id}")
    
    # Verify in customer bookings list
    bookings = get_customer_bookings(customer_token)
    booking1_from_list = None
    for b in bookings:
        if b.get('id') == booking1_id:
            booking1_from_list = b
            break
    
    if booking1_from_list:
        print(f"\n✅ TEST 2.2: Booking found in customer bookings list")
        print(f"  Merchant ID from list: {booking1_from_list.get('merchant_id')}")
        
        if booking1_from_list.get('merchant_id') == merchant_id:
            print(f"  ✅ PASS: booking.merchant_id persisted correctly")
        else:
            print(f"  ❌ FAIL: booking.merchant_id NOT persisted correctly")
    else:
        print(f"\n❌ FAIL: Booking NOT found in customer bookings list")
    
    # Create second booking WITHOUT merchant_ref_code (test auto-link)
    print(f"\n### TEST 2.3: Create second booking WITHOUT merchant_ref_code (auto-link test) ###")
    booking2 = create_second_booking_without_ref(customer_token, service_id)
    
    if booking2:
        booking2_merchant_id = booking2.get('merchant_id')
        
        if booking2_merchant_id == merchant_id:
            print(f"  ✅ PASS: Second booking auto-linked to merchant (customer_merchant_id stamped)")
        else:
            print(f"  ❌ FAIL: Second booking NOT auto-linked to merchant")
            print(f"    Expected merchant_id: {merchant_id}")
            print(f"    Got: {booking2_merchant_id}")
    
    # STEP 3: COMPLETE + SETTLE THE BOOKING
    print("\n" + "=" * 80)
    print("### STEP 3: COMPLETE + SETTLE THE BOOKING ###")
    print("=" * 80)
    
    # Pay booking
    if not pay_booking(customer_token, booking1_id):
        print("\n❌ FAILED: Could not pay booking")
        return
    
    # Assign partner
    success, booking_status = assign_partner(admin_token, booking1_id, partner_id)
    if not success:
        print("\n❌ FAILED: Could not assign partner")
        return
    
    print(f"\n  Booking status after assignment: {booking_status}")
    
    # Partner accepts (only if status is 'assigned')
    # If status is 'accepted', admin assignment auto-accepted it
    if booking_status == 'assigned':
        if not partner_accept_booking(partner_token, booking1_id):
            print("\n⚠️ WARNING: Partner could not accept booking, but continuing (might be auto-accepted)")
            # Don't fail here, continue to check if we can start work
    elif booking_status == 'accepted':
        print(f"\n  Booking auto-accepted by admin assignment, skipping partner accept step")
    else:
        print(f"\n  Unexpected booking status: {booking_status}")
    
    # Upload before work evidence
    if not partner_upload_evidence(partner_token, booking1_id):
        print("\n❌ FAILED: Partner could not upload evidence")
        return
    
    # Partner starts work
    start_otp = booking1_otps.get('start', OTP)
    if not partner_start_work(partner_token, booking1_id, start_otp):
        print("\n❌ FAILED: Partner could not start work")
        return
    
    # Get booking detail from admin to get complete OTP
    print(f"\nGET /api/admin/bookings/{booking1_id}/detail to get complete OTP")
    booking_detail_for_otp = get_booking_detail(admin_token, booking1_id)
    if booking_detail_for_otp:
        # The detail response has a nested 'booking' key
        booking_data = booking_detail_for_otp.get('booking', booking_detail_for_otp)
        otps = booking_data.get('otps', {})
        print(f"  Full OTPs object: {otps}")
        complete_otp = otps.get('completion', otps.get('complete', OTP))
        print(f"  Complete OTP from admin: {complete_otp}")
    else:
        complete_otp = OTP
        print(f"  Could not get booking detail, using default OTP")
    
    # Upload after work evidence
    print(f"\nPOST /api/bookings/{booking1_id}/evidence (uploading after photos)")
    resp = requests.post(f"{BASE_URL}/bookings/{booking1_id}/evidence", headers={"Authorization": f"Bearer {partner_token}"}, json={
        "stage": "after",
        "images": ["https://via.placeholder.com/400x300.png?text=After+Work+Photo"]
    })
    print(f"  Status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"  ERROR: {resp.text}")
        print("\n❌ FAILED: Partner could not upload after evidence")
        return
    print(f"  After evidence uploaded")
    
    # Partner completes work
    if not partner_complete_work(partner_token, booking1_id, complete_otp):
        print("\n❌ FAILED: Partner could not complete work")
        return
    
    print(f"\n✅ Booking {booking1_code} completed successfully")
    
    # Get booking detail to check commission
    print(f"\n### Checking commission ledger via admin booking detail ###")
    booking_detail = get_booking_detail(admin_token, booking1_id)
    
    if booking_detail:
        commission = booking_detail.get('commission', {})
        print(f"\nCommission data:")
        print(f"  Kind: {commission.get('kind')}")
        print(f"  Commission base: ₹{commission.get('commission_base', 0)}")
        print(f"  Merchant customer commission: ₹{commission.get('merchant_customer_comm', 0)}")
        print(f"  Merchant customer pct: {commission.get('merchant_customer_pct', 0)}%")
        
        merchant_customer_comm = commission.get('merchant_customer_comm', 0)
        merchant_customer_pct = commission.get('merchant_customer_pct', 0)
        commission_base = commission.get('commission_base', 0)
        
        if merchant_customer_comm > 0:
            print(f"\n✅ TEST 3.1: Merchant customer commission generated (₹{merchant_customer_comm})")
            
            # Verify percentage calculation
            expected_comm = round(commission_base * merchant_customer_pct / 100, 2)
            if abs(merchant_customer_comm - expected_comm) < 0.02:
                print(f"  ✅ PASS: Commission = commission_base × merchant_customer_pct")
                print(f"    Expected: ₹{expected_comm}")
                print(f"    Got: ₹{merchant_customer_comm}")
            else:
                print(f"  ❌ FAIL: Commission calculation incorrect")
                print(f"    Expected: ₹{expected_comm}")
                print(f"    Got: ₹{merchant_customer_comm}")
        else:
            print(f"\n❌ FAIL: No merchant customer commission generated")
    else:
        print(f"\n❌ FAILED: Could not get booking detail")
    
    # STEP 4: MERCHANT PANEL REFLECTS IT
    print("\n" + "=" * 80)
    print("### STEP 4: MERCHANT PANEL REFLECTS IT ###")
    print("=" * 80)
    
    # Wait a bit for settlement to complete
    print("\nWaiting 2 seconds for settlement to complete...")
    time.sleep(2)
    
    # Get updated report
    after_report = get_merchant_report_after(merchant_token)
    
    if after_report:
        after_total = after_report.get('total', 0)
        after_customer_commission = after_report.get('customer_commission', 0)
        after_customer_count = after_report.get('customer_count', 0)
        
        print(f"\n### TEST 4.1: Merchant referral report updated ###")
        print(f"  Before: total=₹{baseline_total}, customer_commission=₹{baseline_customer_commission}, customer_count={baseline_customer_count}")
        print(f"  After:  total=₹{after_total}, customer_commission=₹{after_customer_commission}, customer_count={after_customer_count}")
        
        total_increase = after_total - baseline_total
        customer_comm_increase = after_customer_commission - baseline_customer_commission
        customer_count_increase = after_customer_count - baseline_customer_count
        
        print(f"  Increase: total=₹{total_increase}, customer_commission=₹{customer_comm_increase}, customer_count={customer_count_increase}")
        
        if merchant_customer_comm > 0:
            if abs(customer_comm_increase - merchant_customer_comm) < 0.02:
                print(f"  ✅ PASS: Customer commission increased by exactly merchant_customer_comm")
            else:
                print(f"  ❌ FAIL: Customer commission increase does NOT match merchant_customer_comm")
                print(f"    Expected increase: ₹{merchant_customer_comm}")
                print(f"    Actual increase: ₹{customer_comm_increase}")
        
        if customer_count_increase >= 1:
            print(f"  ✅ PASS: Customer count increased by {customer_count_increase}")
        else:
            print(f"  ❌ FAIL: Customer count did NOT increase")
    
    # Get updated customers list
    after_customers, after_priya = get_merchant_customers_after(merchant_token, customer_id)
    
    if after_priya:
        after_priya_commission = after_priya.get('total_commission', 0)
        
        print(f"\n### TEST 4.2: Priya appears in merchant customers list ###")
        print(f"  Priya total_commission: ₹{after_priya_commission}")
        
        if after_priya_commission > 0:
            print(f"  ✅ PASS: Priya has commission > 0")
            
            if abs(after_priya_commission - merchant_customer_comm) < 0.02:
                print(f"  ✅ PASS: Priya commission matches merchant_customer_comm")
            else:
                print(f"  ⚠️ WARNING: Priya commission does NOT match merchant_customer_comm")
                print(f"    Expected: ₹{merchant_customer_comm}")
                print(f"    Got: ₹{after_priya_commission}")
        else:
            print(f"  ❌ FAIL: Priya commission is 0")
    else:
        print(f"\n❌ FAIL: Priya NOT found in merchant customers list after booking")
    
    # Get customer detail
    if after_priya:
        customer_detail = get_merchant_customer_detail(merchant_token, after_priya.get('id'))
        
        if customer_detail:
            print(f"\n### TEST 4.3: Customer detail shows service-wise commission ###")
            
            jobs = customer_detail.get('jobs', [])
            our_job = None
            for job in jobs:
                if job.get('booking_code') == booking1_code:
                    our_job = job
                    break
            
            if our_job:
                print(f"  ✅ PASS: Booking {booking1_code} found in customer jobs")
                print(f"    Eligible amount: ₹{our_job.get('eligible_amount', 0)}")
                print(f"    Commission pct: {our_job.get('commission_pct', 0)}%")
                print(f"    Earned: ₹{our_job.get('earned', 0)}")
                
                if abs(our_job.get('earned', 0) - merchant_customer_comm) < 0.02:
                    print(f"  ✅ PASS: Job earned matches merchant_customer_comm")
                else:
                    print(f"  ❌ FAIL: Job earned does NOT match merchant_customer_comm")
            else:
                print(f"  ❌ FAIL: Booking {booking1_code} NOT found in customer jobs")
    
    # Get commission history
    commission_history = get_merchant_commission_history(merchant_token)
    
    if commission_history:
        print(f"\n### TEST 4.4: Commission history shows Customer-type row ###")
        
        items = commission_history.get('items', [])
        our_commission = None
        for item in items:
            if item.get('type') == 'Customer' and item.get('booking_code') == booking1_code:
                our_commission = item
                break
        
        if our_commission:
            print(f"  ✅ PASS: Customer commission row found for booking {booking1_code}")
            print(f"    Earned: ₹{our_commission.get('earned', 0)}")
            
            if abs(our_commission.get('earned', 0) - merchant_customer_comm) < 0.02:
                print(f"  ✅ PASS: Commission earned matches merchant_customer_comm")
            else:
                print(f"  ❌ FAIL: Commission earned does NOT match merchant_customer_comm")
        else:
            print(f"  ❌ FAIL: Customer commission row NOT found for booking {booking1_code}")
    
    # STEP 5: CONSISTENCY
    print("\n" + "=" * 80)
    print("### STEP 5: CONSISTENCY CHECK ###")
    print("=" * 80)
    
    print(f"\nSingle source of truth verification:")
    print(f"  Commission base: ₹{commission_base}")
    print(f"  Merchant customer pct: {merchant_customer_pct}%")
    print(f"  Merchant customer commission: ₹{merchant_customer_comm}")
    
    print(f"\nConsistency across all endpoints:")
    print(f"  Report customer_commission increase: ₹{customer_comm_increase}")
    print(f"  Priya total_commission: ₹{after_priya_commission if after_priya else 0}")
    print(f"  Customer detail job earned: ₹{our_job.get('earned', 0) if our_job else 0}")
    print(f"  Commission history earned: ₹{our_commission.get('earned', 0) if our_commission else 0}")
    
    # Check consistency
    amounts = [
        customer_comm_increase,
        after_priya_commission if after_priya else 0,
        our_job.get('earned', 0) if our_job else 0,
        our_commission.get('earned', 0) if our_commission else 0
    ]
    
    # All amounts should be equal (within 0.02 tolerance)
    consistent = all(abs(amt - merchant_customer_comm) < 0.02 for amt in amounts if amt > 0)
    
    if consistent:
        print(f"\n✅ PASS: All amounts are consistent (single source of truth)")
    else:
        print(f"\n❌ FAIL: Amounts are NOT consistent")
    
    # FINAL SUMMARY
    print("\n" + "=" * 80)
    print("### FINAL SUMMARY ###")
    print("=" * 80)
    
    tests = {
        "Booking merchant_id set from merchant_ref_code": booking1_merchant_id == merchant_id,
        "Repeat customer auto-link via customer_merchant_id": booking2 and booking2.get('merchant_id') == merchant_id if booking2 else False,
        "Commission generated on settlement with customer_merchant_id": merchant_customer_comm > 0,
        "Merchant panel report shows customer + commission": after_priya and after_priya_commission > 0 if after_priya else False,
        "Customer detail shows service-wise commission": our_job and our_job.get('earned', 0) > 0 if our_job else False,
        "Commission history shows Customer-type row": our_commission and our_commission.get('earned', 0) > 0 if our_commission else False,
        "All amounts consistent (single source of truth)": consistent
    }
    
    passed = sum(1 for v in tests.values() if v)
    total = len(tests)
    
    print(f"\nTest Results: {passed}/{total} PASSED")
    for test_name, result in tests.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status}: {test_name}")
    
    if passed == total:
        print(f"\n🎉 ALL TESTS PASSED - MERCHANT REFERRAL ATTRIBUTION FLOW WORKING END-TO-END")
    else:
        print(f"\n⚠️ SOME TESTS FAILED - SEE DETAILS ABOVE")
    
    print("\n" + "=" * 80)

if __name__ == "__main__":
    main()
