import requests

BASE_URL = "https://invoice-sync-mobile-1.preview.emergentagent.com/api"

resp = requests.get(f"{BASE_URL}/catalog/services")
services = resp.json()

print("Services with 'plumbing' or 'Test Plumbing Skill':")
for s in services:
    skill = s.get("required_skill", "")
    if "plumb" in skill.lower():
        print(f"  - {s['name']} (ID: {s['id']}): required_skill='{skill}'")
