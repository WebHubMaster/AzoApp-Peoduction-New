import requests

BASE_URL = "https://push-notify-fix-16.preview.emergentagent.com/api"
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
    
    # Update the service to use partner's skill_id
    partner_skill_id = "94e40b6b-8bf3-47a8-a8ea-6b54102e891e"
    
    update_data = {
        "required_skill": partner_skill_id  # Update to partner's skill_id
    }
    
    resp = requests.put(f"{BASE_URL}/catalog/services/{service_id}", 
                       headers=admin_headers, json=update_data)
    if resp.status_code == 200:
        print(f"✅ Updated service required_skill to: {partner_skill_id}")
    else:
        print(f"❌ Failed to update service: {resp.status_code} - {resp.text}")
else:
    print("❌ Blockage Removal service not found")
