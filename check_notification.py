import requests
import json

BASE_URL = "https://registration-cleanup-1.preview.emergentagent.com/api"
CUSTOMER_PHONE = "+919000000004"
OTP = "123456"

# Auth
resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": CUSTOMER_PHONE})
resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": CUSTOMER_PHONE, "otp": OTP})
token = resp.json().get("token")

# Get notifications
headers = {"Authorization": f"Bearer {token}"}
resp = requests.get(f"{BASE_URL}/notifications", headers=headers)
notifications = resp.json()

print(f"Total notifications: {len(notifications)}")
print("\nMost recent notification:")
if notifications:
    latest = notifications[0]
    print(json.dumps(latest, indent=2))
    
print("\n\nAll notification events:")
for n in notifications[:10]:
    print(f"- {n.get('event')}: {n.get('title')}")
