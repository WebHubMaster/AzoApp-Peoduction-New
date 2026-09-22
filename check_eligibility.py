import requests

BASE_URL = "https://invoice-sync-mobile-1.preview.emergentagent.com/api"
PARTNER_PHONE = "+919000000003"
CUSTOMER_PHONE = "+919000000004"
OTP = "123456"

# Login partner
resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": PARTNER_PHONE})
resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": PARTNER_PHONE, "otp": OTP})
partner_token = resp.json().get("token")
partner_id = resp.json().get("user", {}).get("id")
partner_headers = {"Authorization": f"Bearer {partner_token}"}

# Login customer
resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": CUSTOMER_PHONE})
resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": CUSTOMER_PHONE, "otp": OTP})
customer_token = resp.json().get("token")
customer_headers = {"Authorization": f"Bearer {customer_token}"}

print(f"Partner ID: {partner_id}")

# Get partner eligibility
resp = requests.get(f"{BASE_URL}/partner/eligibility", headers=partner_headers)
print("\nPartner Eligibility:")
print(resp.json())

# Get partner verification status
resp = requests.get(f"{BASE_URL}/partner/verification", headers=partner_headers)
print("\nPartner Verification:")
verification = resp.json()
print(f"Overall: {verification.get('overall')}")
print(f"Current Stage: {verification.get('current_stage')}")

# Find plumbing service
resp = requests.get(f"{BASE_URL}/catalog/services")
services = resp.json()
plumbing_service = None
for s in services:
    if s.get("required_skill") == "plumbing":
        plumbing_service = s
        break

if plumbing_service:
    print(f"\nPlumbing Service: {plumbing_service['name']} (ID: {plumbing_service['id']})")
    print(f"Required Skill: {plumbing_service.get('required_skill')}")
    
    # Create a booking
    booking_data = {
        "service_id": plumbing_service["id"],
        "address": {
            "line": "123 Test Street",
            "city": "Patna",
            "pincode": "800001",
            "lat": 25.5941,
            "lng": 85.1376
        },
        "schedule_type": "now",
        "addons": []
    }
    resp = requests.post(f"{BASE_URL}/bookings", headers=customer_headers, json=booking_data)
    if resp.status_code == 200:
        booking = resp.json()
        booking_id = booking.get("id")
        print(f"\nBooking Created: {booking.get('code')}")
        print(f"Eligible Partner IDs: {booking.get('eligible_partner_ids', [])}")
        print(f"Partner {partner_id} in eligible list: {partner_id in booking.get('eligible_partner_ids', [])}")
        
        # Try to accept
        resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/accept", headers=partner_headers)
        print(f"\nAccept Response: {resp.status_code}")
        if resp.status_code != 200:
            print(f"Error: {resp.text}")
    else:
        print(f"\nFailed to create booking: {resp.status_code} - {resp.text}")
