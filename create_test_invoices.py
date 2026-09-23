#!/usr/bin/env python3
"""
Create test bookings with visiting charges for invoice bugfix testing
"""
import requests
import json
import time
from datetime import datetime, timedelta

BASE_URL = "https://partner-invoice-fix.preview.emergentagent.com/api"
OTP = "123456"

CUSTOMER_PHONE = "+919000000004"
PARTNER_PHONE = "+919000000003"
ADMIN_PHONE = "+919000000000"

def auth(phone):
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    return resp.json().get("token")

def create_booking_with_visiting_charge():
    """Create a booking with visiting charge"""
    print("\n📝 Creating booking with visiting charge...")
    
    customer_token = auth(CUSTOMER_PHONE)
    headers = {"Authorization": f"Bearer {customer_token}"}
    
    # Get a service
    resp = requests.get(f"{BASE_URL}/catalog/services", headers=headers)
    services = resp.json()
    service = services[0] if services else None
    
    if not service:
        print("❌ No services found")
        return None
    
    print(f"   Using service: {service.get('name')} (id: {service.get('id')})")
    
    # Create booking with visiting charge
    scheduled_at = (datetime.utcnow() + timedelta(hours=2)).isoformat() + "Z"
    
    booking_data = {
        "items": [{
            "service_id": service.get('id'),
            "qty": 1
        }],
        "address": {
            "line": "12 MG Road",
            "pincode": "800001",
            "city": "Patna",
            "state": "Bihar",
            "lat": 25.6,
            "lng": 85.1
        },
        "schedule_type": "schedule",
        "scheduled_at": scheduled_at,
        "apply_visiting": True,  # This should add visiting charge
        "idempotency_key": f"test-{int(time.time())}"
    }
    
    resp = requests.post(f"{BASE_URL}/bookings/grouped", json=booking_data, headers=headers)
    
    if resp.status_code != 200:
        print(f"❌ Failed to create booking: {resp.status_code} {resp.text}")
        return None
    
    booking = resp.json()
    booking_id = booking.get('id')
    booking_code = booking.get('booking_code')
    visiting_charge = booking.get('pricing', {}).get('visiting_charge', 0)
    
    print(f"   ✅ Created booking: {booking_code} (id: {booking_id})")
    print(f"   Visiting Charge: ₹{visiting_charge}")
    
    return booking

def pay_booking(booking_id):
    """Pay for a booking using mock payment"""
    print(f"\n💳 Paying for booking {booking_id}...")
    
    customer_token = auth(CUSTOMER_PHONE)
    headers = {"Authorization": f"Bearer {customer_token}"}
    
    # Create payment order
    resp = requests.post(f"{BASE_URL}/payments/order", 
                        json={"purpose": "booking", "booking_id": booking_id},
                        headers=headers)
    
    if resp.status_code != 200:
        print(f"❌ Failed to create payment order: {resp.status_code} {resp.text}")
        return False
    
    # Mock payment
    resp = requests.post(f"{BASE_URL}/payments/mock",
                        json={"purpose": "booking", "booking_id": booking_id},
                        headers=headers)
    
    if resp.status_code != 200:
        print(f"❌ Failed to mock payment: {resp.status_code} {resp.text}")
        return False
    
    print(f"   ✅ Payment successful")
    return True

def assign_partner(booking_id):
    """Assign partner to booking"""
    print(f"\n👷 Assigning partner to booking {booking_id}...")
    
    admin_token = auth(ADMIN_PHONE)
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Get partner ID
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": PARTNER_PHONE, "otp": OTP})
    partner_token = resp.json().get("token")
    
    partner_headers = {"Authorization": f"Bearer {partner_token}"}
    resp = requests.get(f"{BASE_URL}/auth/me", headers=partner_headers)
    partner_id = resp.json().get('id')
    
    print(f"   Partner ID: {partner_id}")
    
    # Assign partner
    resp = requests.post(f"{BASE_URL}/admin/bookings/{booking_id}/assign",
                        json={"partner_id": partner_id},
                        headers=headers)
    
    if resp.status_code != 200:
        print(f"❌ Failed to assign partner: {resp.status_code} {resp.text}")
        return False
    
    print(f"   ✅ Partner assigned")
    return True

def cancel_booking(booking_id):
    """Cancel a booking to create cancellation invoice"""
    print(f"\n❌ Cancelling booking {booking_id}...")
    
    customer_token = auth(CUSTOMER_PHONE)
    headers = {"Authorization": f"Bearer {customer_token}"}
    
    resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/cancel",
                        json={"reason": "Test cancellation"},
                        headers=headers)
    
    if resp.status_code != 200:
        print(f"❌ Failed to cancel booking: {resp.status_code} {resp.text}")
        return False
    
    print(f"   ✅ Booking cancelled")
    return True

def main():
    print("="*80)
    print("CREATING TEST INVOICES WITH VISITING CHARGES")
    print("="*80)
    
    # Create booking 1: Paid booking with visiting charge (for BUG 1, 2, 4)
    print("\n\n### TEST CASE 1: Paid Booking with Visiting Charge ###")
    booking1 = create_booking_with_visiting_charge()
    if booking1:
        booking1_id = booking1.get('id')
        if pay_booking(booking1_id):
            assign_partner(booking1_id)
            print(f"\n✅ Test booking 1 ready: {booking1.get('booking_code')}")
            print(f"   Use this for BUG 1, 2, 4 testing")
    
    time.sleep(2)
    
    # Create booking 2: Cancelled booking with visiting charge (for BUG 2, 3)
    print("\n\n### TEST CASE 2: Cancelled Booking with Visiting Charge ###")
    booking2 = create_booking_with_visiting_charge()
    if booking2:
        booking2_id = booking2.get('id')
        if pay_booking(booking2_id):
            if assign_partner(booking2_id):
                time.sleep(1)
                cancel_booking(booking2_id)
                print(f"\n✅ Test booking 2 ready: {booking2.get('booking_code')}")
                print(f"   Use this for BUG 2, 3 testing")
    
    print("\n\n" + "="*80)
    print("TEST DATA CREATION COMPLETE")
    print("="*80)
    print("\nNow run: python backend_test_invoice_bugfixes.py")

if __name__ == "__main__":
    main()
