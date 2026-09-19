import requests
import json

BASE_URL = "https://azoapp-otp-preview.preview.emergentagent.com/api"
CHANDAN = "+919128403769"
OTP = "123456"

# Auth
r = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": CHANDAN})
r = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": CHANDAN, "otp": OTP})
token = r.json()["token"]

# Get bookings
headers = {"Authorization": f"Bearer {token}"}
r = requests.get(f"{BASE_URL}/bookings", headers=headers)
bookings = r.json()

print(f"Response type: {type(bookings)}")
if isinstance(bookings, list):
    print(f"Found {len(bookings)} bookings for Chandan")
    for b in bookings:
        print(f"\nBooking: {b.get('code')} - Status: {b.get('status')}")
        print(f"  Service: {b.get('service_name')}")
        if b.get("items"):
            print(f"  Items: {len(b['items'])}")
            for item in b["items"]:
                print(f"    - {item.get('service_name')} qty={item.get('qty')} base_price={item.get('base_price')}")
else:
    print(json.dumps(bookings, indent=2))
