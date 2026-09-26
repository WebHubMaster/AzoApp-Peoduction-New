import requests

BASE_URL = "https://customer-auto-deploy.preview.emergentagent.com/api"
ADMIN_PHONE = "+919000000000"
OTP = "123456"

# Login admin
resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": ADMIN_PHONE})
resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": ADMIN_PHONE, "otp": OTP})
admin_token = resp.json().get("token")
admin_headers = {"Authorization": f"Bearer {admin_token}"}

# Get all services
resp = requests.get(f"{BASE_URL}/catalog/services")
services = resp.json()

# Update all plumbing services
for s in services:
    if s.get("required_skill") == "plumbing":
        service_id = s["id"]
        print(f"Updating {s['name']} (ID: {service_id})")
        
        update_data = {
            "required_skill": "Test Plumbing Skill"
        }
        
        resp = requests.put(f"{BASE_URL}/catalog/services/{service_id}", 
                           headers=admin_headers, json=update_data)
        if resp.status_code == 200:
            print(f"  ✅ Updated to: Test Plumbing Skill")
        else:
            print(f"  ❌ Failed: {resp.status_code} - {resp.text}")
