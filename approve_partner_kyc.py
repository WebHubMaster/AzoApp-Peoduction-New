import requests

BASE_URL = "https://invoice-sync-mobile-1.preview.emergentagent.com/api"
ADMIN_PHONE = "+919000000000"
OTP = "123456"

def login(phone):
    r = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    r = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    return r.json().get("token")

def get_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

admin_token = login(ADMIN_PHONE)

# Get partner
r = requests.get(f"{BASE_URL}/admin/partners", headers=get_headers(admin_token))
partners = r.json().get("partners", [])
if partners:
    partner_id = partners[0]["id"]
    print(f"Partner ID: {partner_id}")
    print(f"Current KYC status: {partners[0].get('kyc_status')}")
    
    # Approve KYC
    payload = {"action": "approve"}
    r = requests.post(f"{BASE_URL}/admin/partners/{partner_id}/kyc-action", 
                     headers=get_headers(admin_token), json=payload)
    
    if r.status_code == 200:
        print("✅ Partner KYC approved")
    else:
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text}")
