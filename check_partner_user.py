import requests

BASE_URL = "https://partner-panel-kyc.preview.emergentagent.com/api"
ADMIN_PHONE = "+919000000000"
PARTNER_PHONE = "+919000000003"
OTP = "123456"

# Login admin
resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": ADMIN_PHONE})
resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": ADMIN_PHONE, "otp": OTP})
admin_token = resp.json().get("token")

# Login partner to get ID
resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": PARTNER_PHONE})
resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": PARTNER_PHONE, "otp": OTP})
partner_id = resp.json().get("user", {}).get("id")
partner_user = resp.json().get("user", {})

print(f"Partner ID: {partner_id}")
print(f"Partner Name: {partner_user.get('name')}")
print(f"Partner KYC Status: {partner_user.get('kyc_status')}")
print(f"Partner Status: {partner_user.get('status')}")
print(f"Partner Availability: {partner_user.get('availability')}")
print(f"Partner Skills (from user doc): {partner_user.get('skills', [])}")
print(f"Partner Rating: {partner_user.get('rating')}")
print(f"Partner Jobs Completed: {partner_user.get('jobs_completed')}")

# Get partner detail from admin endpoint
resp = requests.get(f"{BASE_URL}/admin/partner/{partner_id}/detail", 
                   headers={"Authorization": f"Bearer {admin_token}"})
if resp.status_code == 200:
    detail = resp.json()
    print(f"\nPartner Detail (from admin endpoint):")
    print(f"  Skills: {detail.get('skills', [])}")
