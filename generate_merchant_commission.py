#!/usr/bin/env python3
"""
Generate real merchant commission by completing a booking flow.
This creates a booking, assigns it to partner Raj Kumar (referred by merchant),
and completes it to trigger commission settlement.
"""
import requests
import json
import time

BASE_URL = "https://azoapp-services.preview.emergentagent.com/api"
OTP = "123456"

MERCHANT_PHONE = "+919000000002"  # Sharma Electricals
PARTNER_PHONE = "+919000000003"   # Raj Kumar (referred by merchant)
CUSTOMER_PHONE = "+919000000004"  # Priya Verma
ADMIN_PHONE = "+919000000000"


def get_token(phone):
    """Get auth token"""
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if resp.status_code != 200:
        print(f"❌ Failed to send OTP for {phone}: {resp.status_code}")
        return None
    
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    if resp.status_code != 200:
        print(f"❌ Failed to verify OTP for {phone}: {resp.status_code}")
        return None
    
    return resp.json().get("token")


def get_services(token):
    """Get available services"""
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{BASE_URL}/catalog/services", headers=headers)
    if resp.status_code == 200:
        return resp.json()
    return []


def create_booking(customer_token, service, merchant_code=None):
    """Create a booking as customer"""
    headers = {"Authorization": f"Bearer {customer_token}"}
    
    service_id = service.get("id")
    print(f"📋 Service: {service.get('name')} - ₹{service.get('base_price')}")
    
    # Create booking
    booking_data = {
        "items": [{
            "service_id": service_id,
            "quantity": 1
        }],
        "pincode": "800001",
        "address": "Test Address, Patna",
        "schedule_type": "schedule",
        "scheduled_at": "2026-09-15T10:00:00Z"
    }
    
    if merchant_code:
        booking_data["merchant_ref_code"] = merchant_code
    
    resp = requests.post(f"{BASE_URL}/bookings/grouped", json=booking_data, headers=headers)
    if resp.status_code != 200:
        print(f"❌ Failed to create booking: {resp.status_code}")
        print(resp.text)
        return None
    
    booking = resp.json()
    print(f"✅ Booking created: {booking.get('booking_code')} (ID: {booking.get('id')})")
    return booking


def pay_booking(customer_token, booking_id):
    """Pay for booking using mock payment"""
    headers = {"Authorization": f"Bearer {customer_token}"}
    
    # Create payment order
    resp = requests.post(f"{BASE_URL}/payments/order", 
                        json={"purpose": "booking", "booking_id": booking_id},
                        headers=headers)
    if resp.status_code != 200:
        print(f"❌ Failed to create payment order: {resp.status_code}")
        print(resp.text)
        return False
    
    order = resp.json()
    print(f"💳 Payment order created: {order.get('order_id')}")
    
    # Mock payment
    resp = requests.post(f"{BASE_URL}/payments/mock",
                        json={"order_id": order.get("order_id")},
                        headers=headers)
    if resp.status_code != 200:
        print(f"❌ Failed to mock payment: {resp.status_code}")
        print(resp.text)
        return False
    
    print(f"✅ Payment completed (mock)")
    return True


def assign_partner(admin_token, booking_id, partner_id):
    """Assign partner to booking"""
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    resp = requests.post(f"{BASE_URL}/admin/bookings/{booking_id}/assign",
                        json={"partner_id": partner_id},
                        headers=headers)
    if resp.status_code != 200:
        print(f"❌ Failed to assign partner: {resp.status_code}")
        print(resp.text)
        return False
    
    print(f"✅ Partner assigned to booking")
    return True


def complete_booking(partner_token, booking_id):
    """Partner marks booking as completed"""
    headers = {"Authorization": f"Bearer {partner_token}"}
    
    # First, partner accepts the booking
    resp = requests.post(f"{BASE_URL}/partner/bookings/{booking_id}/accept",
                        headers=headers)
    if resp.status_code == 200:
        print(f"✅ Partner accepted booking")
    else:
        print(f"⚠️ Partner accept failed or already accepted: {resp.status_code}")
    
    time.sleep(1)
    
    # Mark as completed
    resp = requests.post(f"{BASE_URL}/partner/bookings/{booking_id}/complete",
                        json={"notes": "Work completed successfully"},
                        headers=headers)
    if resp.status_code != 200:
        print(f"❌ Failed to complete booking: {resp.status_code}")
        print(resp.text)
        return False
    
    print(f"✅ Booking marked as completed by partner")
    return True


def settle_booking(admin_token, booking_id):
    """Admin settles the booking to trigger commission"""
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Check if there's a settle endpoint
    resp = requests.post(f"{BASE_URL}/admin/bookings/{booking_id}/settle",
                        headers=headers)
    if resp.status_code == 200:
        print(f"✅ Booking settled")
        return True
    elif resp.status_code == 404:
        print(f"⚠️ No explicit settle endpoint (may auto-settle on complete)")
        return True
    else:
        print(f"⚠️ Settle failed: {resp.status_code}")
        return False


def get_partner_id(admin_token, phone):
    """Get partner ID by phone"""
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    resp = requests.get(f"{BASE_URL}/admin/partners", headers=headers)
    if resp.status_code != 200:
        print(f"❌ Failed to get partners: {resp.status_code}")
        return None
    
    data = resp.json()
    partners = data.get("partners", [])
    
    for p in partners:
        if isinstance(p, dict) and p.get("phone") == phone:
            return p.get("id")
    
    return None


def get_merchant_code(merchant_token):
    """Get merchant referral code"""
    headers = {"Authorization": f"Bearer {merchant_token}"}
    
    resp = requests.get(f"{BASE_URL}/merchant/my-code", headers=headers)
    if resp.status_code == 200:
        data = resp.json()
        return data.get("code")
    return None


def main():
    print("="*80)
    print("GENERATE MERCHANT COMMISSION - E2E BOOKING FLOW")
    print("="*80)
    
    # Authenticate
    print("\n🔐 Authenticating users...")
    customer_token = get_token(CUSTOMER_PHONE)
    partner_token = get_token(PARTNER_PHONE)
    admin_token = get_token(ADMIN_PHONE)
    merchant_token = get_token(MERCHANT_PHONE)
    
    if not all([customer_token, partner_token, admin_token, merchant_token]):
        print("❌ Failed to authenticate all users")
        return
    
    print("✅ All users authenticated")
    
    # Get merchant code
    print("\n📝 Getting merchant referral code...")
    merchant_code = get_merchant_code(merchant_token)
    if merchant_code:
        print(f"✅ Merchant code: {merchant_code}")
    else:
        print("⚠️ No merchant code found (will link via partner referral)")
    
    # Get services
    print("\n📋 Getting available services...")
    services = get_services(customer_token)
    if not services:
        print("❌ No services available")
        return
    
    # Pick first service
    service = services[0]
    service_id = service.get("id")
    print(f"✅ Selected service: {service.get('name')} (ID: {service_id})")
    
    # Get partner ID
    print("\n👷 Getting partner ID...")
    partner_id = get_partner_id(admin_token, PARTNER_PHONE)
    if not partner_id:
        print("❌ Partner not found")
        return
    print(f"✅ Partner ID: {partner_id}")
    
    # Create booking
    print("\n📦 Creating booking...")
    booking = create_booking(customer_token, service, merchant_code)
    if not booking:
        return
    
    booking_id = booking.get("id")
    booking_code = booking.get("booking_code")
    
    # Pay for booking
    print("\n💰 Paying for booking...")
    if not pay_booking(customer_token, booking_id):
        return
    
    # Assign partner
    print("\n👤 Assigning partner...")
    if not assign_partner(admin_token, booking_id, partner_id):
        return
    
    # Complete booking
    print("\n✅ Completing booking...")
    if not complete_booking(partner_token, booking_id):
        return
    
    # Settle booking
    print("\n💸 Settling booking...")
    settle_booking(admin_token, booking_id)
    
    # Wait a bit for settlement to process
    print("\n⏳ Waiting for settlement to process...")
    time.sleep(2)
    
    # Check merchant commission
    print("\n📊 Checking merchant commission...")
    headers = {"Authorization": f"Bearer {merchant_token}"}
    
    resp = requests.get(f"{BASE_URL}/merchant/referral/report", headers=headers)
    if resp.status_code == 200:
        report = resp.json()
        print(f"\n📈 Commission Report:")
        print(f"   Total: ₹{report.get('total', 0)}")
        print(f"   Customer commission: ₹{report.get('customer_commission', 0)}")
        print(f"   Partner commission: ₹{report.get('partner_commission', 0)}")
        print(f"   Transactions: {report.get('transactions', 0)}")
    
    resp = requests.get(f"{BASE_URL}/merchant/referral/commission?page=1&page_size=10", 
                       headers=headers)
    if resp.status_code == 200:
        data = resp.json()
        items = data.get("items", [])
        print(f"\n📋 Commission History ({len(items)} items):")
        for item in items[:3]:
            print(f"   - {item.get('booking_code')}: ₹{item.get('earned')} "
                  f"({item.get('commission_pct')}% of ₹{item.get('eligible_amount')})")
    
    print("\n" + "="*80)
    print(f"✅ BOOKING FLOW COMPLETED: {booking_code}")
    print("="*80)


if __name__ == "__main__":
    main()
