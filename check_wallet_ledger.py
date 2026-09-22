import requests

BASE_URL = "https://partner-ui-mirror.preview.emergentagent.com/api"
PARTNER_PHONE = "+919000000003"
OTP = "123456"

# Login partner
resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": PARTNER_PHONE})
resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": PARTNER_PHONE, "otp": OTP})
partner_token = resp.json().get("token")

# Get wallet
resp = requests.get(f"{BASE_URL}/partner/wallet", headers={"Authorization": f"Bearer {partner_token}"})
wallet = resp.json()

print(f"Available Balance: ₹{wallet.get('available_balance')}")
print(f"Withdrawable Balance: ₹{wallet.get('withdrawable_balance')}")
print(f"\nLedger Entries (last 10):")
for entry in wallet.get("ledger", [])[:10]:
    print(f"  - {entry.get('kind')}: {entry.get('direction')} ₹{entry.get('amount')} ({entry.get('note', '')})")
    if entry.get("kind") == "spare_parts":
        print(f"    SPARE PARTS ENTRY FOUND!")
        print(f"    Credit: ₹{entry.get('credit', 0)}")
        print(f"    Amount: ₹{entry.get('amount', 0)}")
