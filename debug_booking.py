import requests

BASE_URL = "https://profile-kyc-panel.preview.emergentagent.com/api"
CUSTOMER_PHONE = "+919000000004"
PARTNER_PHONE = "+919000000003"
OTP = "123456"

# Login
resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": CUSTOMER_PHONE})
resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": CUSTOMER_PHONE, "otp": OTP})
customer_token = resp.json().get("token")

resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": PARTNER_PHONE})
resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": PARTNER_PHONE, "otp": OTP})
partner_token = resp.json().get("token")
partner_id = resp.json().get("user", {}).get("id")

# Get services with the updated skill
resp = requests.get(f"{BASE_URL}/catalog/services")
services = resp.json()
print("Services with partner's skill_id:")
partner_skill_id = "94e40b6b-8bf3-47a8-a8ea-6b54102e891e"
for s in services:
    if s.get("required_skill") == partner_skill_id:
        print(f"  - {s['name']} (ID: {s['id']})")
        service_id = s['id']
        
        # Create booking with this service
        booking_data = {
            "service_id": service_id,
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
        resp = requests.post(f"{BASE_URL}/bookings", headers={"Authorization": f"Bearer {customer_token}"}, json=booking_data)
        if resp.status_code == 200:
            booking = resp.json()
            print(f"\n  Booking created: {booking.get('code')}")
            print(f"  Eligible partners: {booking.get('eligible_partner_ids', [])}")
            print(f"  Partner {partner_id} eligible: {partner_id in booking.get('eligible_partner_ids', [])}")
            
            # Try to accept
            booking_id = booking.get('id')
            resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/accept", 
                               headers={"Authorization": f"Bearer {partner_token}"})
            print(f"  Accept status: {resp.status_code}")
            if resp.status_code != 200:
                print(f"  Error: {resp.text}")
        else:
            print(f"  Failed to create booking: {resp.status_code}")
        break
