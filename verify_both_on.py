import requests

BASE_URL = "https://customer-auth-native.preview.emergentagent.com/api"
ADMIN_PHONE = "+919000000000"
CUSTOMER_PHONE = "+919000000004"
OTP = "123456"

def login(phone):
    r = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    r = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    return r.json().get("token")

def get_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# Login
admin_token = login(ADMIN_PHONE)
customer_token = login(CUSTOMER_PHONE)

# Get the BOTH ON booking
booking_id = "f990b7e7-f91e-45a3-9e6e-ec5f7e565ecb"

# Get as customer
r = requests.get(f"{BASE_URL}/bookings/{booking_id}", headers=get_headers(customer_token))
if r.status_code == 200:
    booking = r.json()
    pricing = booking.get("pricing", {})
    breakdown = booking.get("breakdown", {})
    
    print("="*80)
    print("BOTH ON BOOKING VERIFICATION (Customer View)")
    print("="*80)
    print(f"Booking ID: {booking_id}")
    print(f"Service: {booking.get('service_name')}")
    print(f"\nPRICING:")
    print(f"  Base: ₹{pricing.get('base', 0)}")
    print(f"  Surge: ₹{pricing.get('surge', 0)}")
    print(f"  Visiting Charge: ₹{pricing.get('visiting_charge', 0)}")
    print(f"  Subtotal: ₹{pricing.get('subtotal', 0)}")
    print(f"  Convenience Fee (5%): ₹{pricing.get('convenience_fee', 0)}")
    print(f"  Platform Fee: ₹{pricing.get('platform_fee', 0)}")
    print(f"  Taxable: ₹{pricing.get('taxable', 0)}")
    print(f"  GST (18%): ₹{pricing.get('gst', 0)}")
    print(f"  Total: ₹{pricing.get('total', 0)}")
    print(f"  Commissionable Base: ₹{pricing.get('commissionable_base', 0)}")
    print(f"  Platform Only Fees: ₹{pricing.get('platform_only_fees', 0)}")
    
    print(f"\nBREAKDOWN:")
    add_charges = breakdown.get("additional_charges", [])
    for charge in add_charges:
        print(f"  {charge.get('label')}: ₹{charge.get('amount', 0)}")
    
    print(f"\nVERIFICATION:")
    # Check that commissionable_base = taxable - (convenience + platform)
    taxable = float(pricing.get('taxable', 0))
    conv = float(pricing.get('convenience_fee', 0))
    plat = float(pricing.get('platform_fee', 0))
    comm_base = float(pricing.get('commissionable_base', 0))
    
    expected_comm_base = taxable - conv - plat
    print(f"  Taxable: ₹{taxable}")
    print(f"  - Convenience Fee: ₹{conv}")
    print(f"  - Platform Fee: ₹{plat}")
    print(f"  = Expected Commissionable Base: ₹{expected_comm_base}")
    print(f"  Actual Commissionable Base: ₹{comm_base}")
    print(f"  Match: {'✅' if abs(comm_base - expected_comm_base) < 0.01 else '❌'}")
    
    # Check fees are in breakdown
    fee_keys = [c.get('key') for c in add_charges]
    print(f"\n  Convenience fee in breakdown: {'✅' if 'convenience_fee' in fee_keys else '❌'}")
    print(f"  Platform fee in breakdown: {'✅' if 'platform_fee' in fee_keys else '❌'}")

# Get as admin
r = requests.get(f"{BASE_URL}/bookings/{booking_id}", headers=get_headers(admin_token))
if r.status_code == 200:
    booking = r.json()
    pricing = booking.get("pricing", {})
    
    print("\n" + "="*80)
    print("ADMIN VIEW")
    print("="*80)
    print(f"  Convenience Fee: ₹{pricing.get('convenience_fee', 0)}")
    print(f"  Platform Fee: ₹{pricing.get('platform_fee', 0)}")
    print(f"  Platform Only Fees: ₹{pricing.get('platform_only_fees', 0)}")
    print(f"  Commissionable Base: ₹{pricing.get('commissionable_base', 0)}")
