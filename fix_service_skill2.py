import requests

BASE_URL = "https://azoapp-otp-demo.preview.emergentagent.com/api"
ADMIN_PHONE = "+919000000000"
OTP = "123456"

# Login admin
resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": ADMIN_PHONE})
resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": ADMIN_PHONE, "otp": OTP})
admin_token = resp.json().get("token")
admin_headers = {"Authorization": f"Bearer {admin_token}"}

# Find Blockage Removal service
resp = requests.get(f"{BASE_URL}/catalog/services")
services = resp.json()
blockage_service = None
for s in services:
    if s.get("name") == "Blockage Removal":
        blockage_service = s
        break

if blockage_service:
    service_id = blockage_service["id"]
    print(f"Found service: {blockage_service['name']} (ID: {service_id})")
    print(f"Current required_skill: {blockage_service.get('required_skill')}")
    
    # Update the service to use "Test Plumbing Skill" (matching partner's skill name)
    update_data = {
        "required_skill": "Test Plumbing Skill"
    }
    
    resp = requests.put(f"{BASE_URL}/catalog/services/{service_id}", 
                       headers=admin_headers, json=update_data)
    if resp.status_code == 200:
        print(f"✅ Updated service required_skill to: Test Plumbing Skill")
    else:
        print(f"❌ Failed to update service: {resp.status_code} - {resp.text}")
else:
    print("❌ Blockage Removal service not found")
