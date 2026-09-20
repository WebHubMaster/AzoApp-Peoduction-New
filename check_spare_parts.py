import requests

BASE_URL = "https://job-ring-notify.preview.emergentagent.com/api"
CUSTOMER_PHONE = "+919000000004"
OTP = "123456"

# Login customer
resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": CUSTOMER_PHONE})
resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": CUSTOMER_PHONE, "otp": OTP})
customer_token = resp.json().get("token")

# Get bookings
resp = requests.get(f"{BASE_URL}/bookings", headers={"Authorization": f"Bearer {customer_token}"})
bookings = resp.json()

# Find the most recent booking with spare parts
for b in bookings:
    if b.get("spare_parts") and len(b["spare_parts"]) > 0:
        print(f"Booking: {b.get('code')} (Status: {b.get('status')})")
        print(f"Spare Parts:")
        for part in b["spare_parts"]:
            print(f"  - {part.get('name')}: {part}")
        break
