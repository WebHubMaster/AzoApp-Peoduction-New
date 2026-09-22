import requests
import json

BASE_URL = "https://mobile-invoice-tools.preview.emergentagent.com/api"
CHANDAN = "+919128403769"
OTP = "123456"

# Auth
r = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": CHANDAN})
r = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": CHANDAN, "otp": OTP})
token = r.json()["token"]

# Get invoices
headers = {"Authorization": f"Bearer {token}"}
r = requests.get(f"{BASE_URL}/invoices", headers=headers)
invoices = r.json()["items"]

# Find INV-2026-000014
for inv in invoices:
    if inv.get("invoice_number") == "INV-2026-000014":
        invoice_id = inv["id"]
        print(f"Found INV-2026-000014: {invoice_id}")
        
        # Get full detail
        r = requests.get(f"{BASE_URL}/invoices/{invoice_id}", headers=headers)
        full_inv = r.json()
        
        print("\n=== LINE ITEMS ===")
        for item in full_inv.get("line_items", []):
            print(json.dumps(item, indent=2))
        
        print("\n=== FINANCIAL FIELDS ===")
        fields = ["subtotal", "visiting_charge", "taxable", "tax", "original_amount", 
                  "refund_amount", "refund", "retained_amount", "total_amount"]
        for field in fields:
            print(f"{field}: {full_inv.get(field)}")
        
        break
