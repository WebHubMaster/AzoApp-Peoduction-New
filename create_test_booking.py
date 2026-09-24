#!/usr/bin/env python3
"""Create a test booking and cancel it to generate invoices"""
import requests
import json
import time

BASE_URL = "https://azo-app-staging.preview.emergentagent.com/api"
OTP = "123456"

def login(phone):
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    return resp.json().get("token")

def main():
    print("Creating test booking...")
    
    # Login as customer
    customer_token = login("+919000000004")
    admin_token = login("+919000000000")
    partner_token = login("+919000000003")
    
    headers_customer = {"Authorization": f"Bearer {customer_token}"}
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    headers_partner = {"Authorization": f"Bearer {partner_token}"}
    
    # Get a service
    resp = requests.get(f"{BASE_URL}/catalog/services", params={"page_size": 1})
    data = resp.json()
    if isinstance(data, list):
        services = data
    else:
        services = data.get("services", [])
    
    if not services:
        print("No services found")
        return
    
    service = services[0]
    print(f"Using service: {service['name']}")
    
    # Create booking
    booking_data = {
        "items": [{"service_id": service["id"], "qty": 1}],
        "address": {
            "line": "12 MG Road",
            "pincode": "800001",
            "city": "Patna",
            "state": "Bihar",
            "lat": 25.6,
            "lng": 85.1
        },
        "schedule_type": "schedule",
        "scheduled_at": "2026-09-15T10:00:00Z",
        "idempotency_key": f"test-{int(time.time())}"
    }
    
    resp = requests.post(f"{BASE_URL}/bookings/grouped", headers=headers_customer, json=booking_data)
    if resp.status_code != 200:
        print(f"Failed to create booking: {resp.status_code} {resp.text}")
        return
    
    booking = resp.json()
    booking_id = booking["id"]
    booking_code = booking.get("booking_code", booking.get("code", "N/A"))
    print(f"Created booking: {booking_code} (ID: {booking_id})")
    
    # Pay with mock
    resp = requests.post(f"{BASE_URL}/payments/order", headers=headers_customer, 
                        json={"purpose": "booking", "booking_id": booking_id})
    resp = requests.post(f"{BASE_URL}/payments/mock", headers=headers_customer,
                        json={"purpose": "booking", "booking_id": booking_id})
    print(f"Paid booking")
    
    # Get partner ID
    resp = requests.get(f"{BASE_URL}/auth/me", headers=headers_partner)
    partner_id = resp.json()["id"]
    
    # Assign partner
    resp = requests.post(f"{BASE_URL}/admin/bookings/{booking_id}/assign", 
                        headers=headers_admin, json={"partner_id": partner_id})
    print(f"Assigned partner")
    
    # Cancel booking
    resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/cancel",
                        headers=headers_customer, json={"reason": "Test cancellation"})
    if resp.status_code != 200:
        print(f"Failed to cancel: {resp.status_code} {resp.text}")
        return
    
    print(f"Cancelled booking")
    
    # Check invoices
    resp = requests.get(f"{BASE_URL}/invoices", headers=headers_customer)
    invoices = resp.json().get("invoices", [])
    print(f"\nGenerated {len(invoices)} invoices:")
    for inv in invoices:
        print(f"  - {inv['invoice_type']}: {inv['invoice_number']} (ID: {inv['id']})")
    
    return booking_id, invoices

if __name__ == "__main__":
    main()
