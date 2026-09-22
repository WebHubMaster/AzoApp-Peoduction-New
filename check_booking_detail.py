import requests
import json

BASE_URL = "https://mobile-invoice-tools.preview.emergentagent.com/api"
ADMIN = "+919000000000"
OTP = "123456"

# Auth as admin
r = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": ADMIN})
r = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": ADMIN, "otp": OTP})
token = r.json()["token"]

# Get all bookings
headers = {"Authorization": f"Bearer {token}"}
r = requests.get(f"{BASE_URL}/admin/bookings", headers=headers)
bookings = r.json()

if isinstance(bookings, list):
    # Find AZO9HWVU1
    for b in bookings:
        if b.get("code") == "AZO9HWVU1":
            print("Found AZO9HWVU1")
            print("Items:", json.dumps(b.get("items"), indent=2))
            print(f"\nPricing: {json.dumps(b.get('pricing'), indent=2)}")
            break
else:
    print("Response:", json.dumps(bookings, indent=2))
