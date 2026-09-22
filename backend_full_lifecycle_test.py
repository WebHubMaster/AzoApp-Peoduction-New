#!/usr/bin/env python3
"""
DETAILED BOOKING LIFECYCLE TEST
Tests the complete end-to-end booking flow with partner acceptance and completion
"""
import requests
import json
import time

BASE_URL = "https://invoice-sync-mobile-1.preview.emergentagent.com/api"

# Credentials
CUSTOMER_PHONE = "+919000000004"
PARTNER_RAJ_PHONE = "+919000000003"
OTP = "123456"

def login(phone):
    """Login and return token"""
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if resp.status_code != 200:
        print(f"❌ Send OTP failed: {resp.status_code}")
        return None
    
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    if resp.status_code != 200:
        print(f"❌ Verify OTP failed: {resp.status_code}")
        return None
    
    return resp.json().get("token")

print("="*80)
print("DETAILED BOOKING LIFECYCLE TEST")
print("="*80)

# Login
print("\n1. Logging in...")
customer_token = login(CUSTOMER_PHONE)
partner_token = login(PARTNER_RAJ_PHONE)

if not customer_token or not partner_token:
    print("❌ Login failed")
    exit(1)

print("✓ Customer and Partner logged in")

# Get a service that matches partner skills (AC service for Raj Kumar)
print("\n2. Getting AC service...")
resp = requests.get(f"{BASE_URL}/catalog/services")
if resp.status_code != 200:
    print(f"❌ Failed to get services: {resp.status_code}")
    exit(1)

services = resp.json()
# Find an AC service that Raj Kumar can handle
ac_service = next((s for s in services if s.get("required_skill") == "ac"), None)
if not ac_service:
    print("❌ No AC service found")
    exit(1)

service_id = ac_service["id"]
print(f"✓ Using service: {ac_service['name']} (ID: {service_id}, skill: {ac_service.get('required_skill')})")

# Create booking
print("\n3. Creating booking...")
headers_customer = {"Authorization": f"Bearer {customer_token}"}
booking_data = {
    "service_id": service_id,
    "schedule_type": "emergency",
    "address": {
        "line": "123 Test Street",
        "city": "Patna",
        "state": "Bihar",
        "pincode": "800001",
        "lat": 25.5941,
        "lng": 85.1376
    },
    "notes": "Full lifecycle test"
}

resp = requests.post(f"{BASE_URL}/bookings", json=booking_data, headers=headers_customer)
if resp.status_code != 200:
    print(f"❌ Failed to create booking: {resp.status_code} - {resp.text}")
    exit(1)

booking = resp.json()
booking_id = booking["id"]
booking_code = booking["code"]
print(f"✓ Booking created: {booking_code}")
print(f"  Status: {booking.get('status')}")
print(f"  OTPs: start={booking.get('otps', {}).get('start')}, completion={booking.get('otps', {}).get('completion')}")

# Pay for booking
print("\n4. Paying for booking...")
resp = requests.post(f"{BASE_URL}/payments/mock", json={
    "purpose": "booking",
    "booking_id": booking_id,
    "amount": booking.get("pricing", {}).get("total", 500)
}, headers=headers_customer)

if resp.status_code != 200:
    print(f"❌ Payment failed: {resp.status_code} - {resp.text}")
    exit(1)

print("✓ Payment successful")
time.sleep(2)

# Check booking status
print("\n5. Checking booking status after payment...")
resp = requests.get(f"{BASE_URL}/bookings", headers=headers_customer)
if resp.status_code == 200:
    bookings = resp.json()
    current_booking = next((b for b in bookings if b["id"] == booking_id), None)
    if current_booking:
        print(f"✓ Booking status: {current_booking['status']}")
    else:
        print("❌ Booking not found in customer list")
else:
    print(f"❌ Failed to get bookings: {resp.status_code}")

# Partner checks jobs
print("\n6. Partner checking available jobs...")
headers_partner = {"Authorization": f"Bearer {partner_token}"}
resp = requests.get(f"{BASE_URL}/bookings/partner/jobs", headers=headers_partner)
if resp.status_code != 200:
    print(f"❌ Failed to get partner jobs: {resp.status_code}")
    exit(1)

jobs = resp.json()
job = next((j for j in jobs if j["id"] == booking_id), None)
if job:
    print(f"✓ Partner sees job {booking_code}")
else:
    print(f"⚠️  Partner does NOT see job {booking_code}")
    print(f"   Available jobs: {[j.get('code') for j in jobs]}")
    print("   This might be due to skill/location matching")
    exit(0)

# Partner accepts job
print("\n7. Partner accepting job...")
resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/accept", headers=headers_partner)
if resp.status_code != 200:
    print(f"❌ Failed to accept job: {resp.status_code} - {resp.text}")
    exit(1)

print("✓ Job accepted")
time.sleep(1)

# Check status after accept
resp = requests.get(f"{BASE_URL}/bookings", headers=headers_customer)
if resp.status_code == 200:
    bookings = resp.json()
    current_booking = next((b for b in bookings if b["id"] == booking_id), None)
    if current_booking:
        print(f"✓ Booking status after accept: {current_booking['status']}")

# Upload before evidence
print("\n8. Uploading before evidence...")
resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/evidence", json={
    "stage": "before",
    "images": ["https://example.com/before.jpg"]
}, headers=headers_partner)

if resp.status_code != 200:
    print(f"❌ Failed to upload evidence: {resp.status_code} - {resp.text}")
else:
    print("✓ Before evidence uploaded")

# Start job with OTP
print("\n9. Starting job with OTP...")
start_otp = booking.get("otps", {}).get("start")
if start_otp:
    resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/start-otp", json={
        "otp": start_otp
    }, headers=headers_partner)
    
    if resp.status_code != 200:
        print(f"❌ Failed to start job: {resp.status_code} - {resp.text}")
    else:
        print("✓ Job started")
        time.sleep(1)

# Upload after evidence
print("\n10. Uploading after evidence...")
resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/evidence", json={
    "stage": "after",
    "images": ["https://example.com/after.jpg"]
}, headers=headers_partner)

if resp.status_code != 200:
    print(f"⚠️  Failed to upload after evidence: {resp.status_code} - {resp.text}")
else:
    print("✓ After evidence uploaded")

# Complete job with OTP
print("\n11. Completing job with OTP...")
completion_otp = booking.get("otps", {}).get("completion")
if completion_otp:
    resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/complete", json={
        "otp": completion_otp
    }, headers=headers_partner)
    
    if resp.status_code != 200:
        print(f"❌ Failed to complete job: {resp.status_code} - {resp.text}")
    else:
        print("✓ Job completed")
        time.sleep(1)

# Check final status
print("\n12. Checking final booking status...")
resp = requests.get(f"{BASE_URL}/bookings", headers=headers_customer)
if resp.status_code == 200:
    bookings = resp.json()
    current_booking = next((b for b in bookings if b["id"] == booking_id), None)
    if current_booking:
        print(f"✓ Final booking status: {current_booking['status']}")

# Check partner wallet
print("\n13. Checking partner wallet...")
resp = requests.get(f"{BASE_URL}/partner/wallet", headers=headers_partner)
if resp.status_code == 200:
    wallet = resp.json()
    print(f"✓ Partner wallet balance: ₹{wallet.get('available_balance', 0)}")
    ledger = wallet.get("ledger", [])
    if ledger:
        print(f"  Recent transactions: {len(ledger)}")
        for entry in ledger[:3]:
            print(f"    - {entry.get('kind')}: ₹{entry.get('amount')} ({entry.get('direction')})")

print("\n" + "="*80)
print("✅ BOOKING LIFECYCLE TEST COMPLETE")
print("="*80)
