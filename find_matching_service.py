import requests

BASE_URL = "https://reminder-logic.preview.emergentagent.com/api"
PARTNER_PHONE = "+919000000003"
OTP = "123456"

# Login partner
resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": PARTNER_PHONE})
resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": PARTNER_PHONE, "otp": OTP})
partner_token = resp.json().get("token")
partner_id = resp.json().get("user", {}).get("id")

# Get partner skills
resp = requests.get(f"{BASE_URL}/partner/skills", headers={"Authorization": f"Bearer {partner_token}"})
skills = resp.json()
print("Partner Skills:")
for skill in skills:
    if skill.get("verified"):
        print(f"  - {skill['skill_name']} (ID: {skill['skill_id']}, Verified: {skill['verified']})")

# Get all services
resp = requests.get(f"{BASE_URL}/catalog/services")
services = resp.json()

print("\nAll Services with required_skill:")
for s in services:
    print(f"  - {s['name']}: required_skill='{s.get('required_skill', 'none')}'")

# Check if any service uses the partner's skill_id
partner_skill_id = "94e40b6b-8bf3-47a8-a8ea-6b54102e891e"  # Test Plumbing Skill
print(f"\nServices matching partner's skill_id ({partner_skill_id}):")
for s in services:
    if s.get("required_skill") == partner_skill_id:
        print(f"  - {s['name']} (ID: {s['id']})")
