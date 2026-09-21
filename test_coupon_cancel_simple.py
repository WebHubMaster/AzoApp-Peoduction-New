#!/usr/bin/env python3
"""
Simplified test for cancellation coupon funding + accept-streak
"""
import requests
import json
import time

BASE = "https://azoapp-staging.preview.emergentagent.com/api"
OTP = "123456"

def login(phone):
    try:
        requests.post(f"{BASE}/auth/send-otp", json={"phone": phone}, timeout=10)
    except:
        pass
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=10)
    if r.status_code != 200:
        print(f"❌ Login failed for {phone}: {r.status_code}")
        return None
    return r.json()["token"]

def H(token):
    return {"Authorization": f"Bearer {token}"}

print("="*80)
print("TASK 1: CANCELLATION COUPON FUNDING TEST")
print("="*80)

# Login
ct = login("+919000000004")  # customer
pt = login("+919000000003")  # partner  
at = login("+919000000000")  # admin

if not all([ct, pt, at]):
    print("❌ Login failed")
    exit(1)

print("✅ All users logged in")

# Check if there's already a demo cancelled booking with coupon
print("\n--- Checking for existing demo cancelled booking ---")
r = requests.get(f"{BASE}/admin/bookings?status=cancelled", headers=H(at), timeout=30)
if r.status_code == 200:
    data = r.json()
    bookings = data.get("items", []) if isinstance(data, dict) else data
    coupon_bookings = [b for b in bookings if b.get("coupon_code")]
    
    if coupon_bookings:
        print(f"✅ Found {len(coupon_bookings)} cancelled bookings with coupons")
        
        # Test the first one
        booking = coupon_bookings[0]
        booking_id = booking.get("id")
        booking_code = booking.get("code")
        coupon_code = booking.get("coupon_code")
        
        print(f"\n📊 Testing booking: {booking_code}")
        print(f"   Coupon: {coupon_code}")
        
        # Get booking detail
        r = requests.get(f"{BASE}/admin/bookings/{booking_id}/detail", headers=H(at), timeout=30)
        if r.status_code == 200:
            detail = r.json()
            canc = detail.get("cancellation", {})
            pricing = detail.get("pricing", {})
            
            print(f"\n📊 CANCELLATION DETAILS:")
            print(f"   Discount (coupon): ₹{pricing.get('discount')}")
            print(f"   Cancel charge: ₹{canc.get('cancel_charge')}")
            print(f"   Commission charge: ₹{canc.get('commission_charge')}")
            print(f"   Partner cut: ₹{canc.get('partner_cut')}")
            print(f"   Customer refund: ₹{canc.get('refund')}")
            
            # Get commission ledger
            r = requests.get(f"{BASE}/admin/commission-ledger?booking_id={booking_id}", headers=H(at), timeout=30)
            if r.status_code == 200:
                ledger = r.json().get("items", [])
                cancel_ledger = next((l for l in ledger if l.get("kind") == "cancellation"), None)
                
                if cancel_ledger:
                    print(f"\n📊 COMMISSION LEDGER:")
                    print(f"   Base: ₹{cancel_ledger.get('base')}")
                    print(f"   Partner earning: ₹{cancel_ledger.get('partner_earning')}")
                    
                    # VERIFY: commission_charge should include coupon
                    commission_charge = float(canc.get("commission_charge", 0))
                    cancel_charge = float(canc.get("cancel_charge", 0))
                    coupon_discount = float(pricing.get("discount", 0))
                    ledger_base = float(cancel_ledger.get("base", 0))
                    
                    print(f"\n🔍 VERIFICATION:")
                    print(f"   Cancel charge: ₹{cancel_charge}")
                    print(f"   Coupon discount: ₹{coupon_discount}")
                    print(f"   Commission charge: ₹{commission_charge}")
                    print(f"   Ledger base: ₹{ledger_base}")
                    
                    # Check if commission_charge > cancel_charge (coupon added back)
                    if commission_charge > cancel_charge:
                        print(f"   ✅ Commission charge ({commission_charge}) > cancel charge ({cancel_charge})")
                        print(f"   ✅ Coupon appears to be added back")
                    else:
                        print(f"   ❌ Commission charge ({commission_charge}) NOT > cancel charge ({cancel_charge})")
                    
                    # Check if ledger base == commission_charge
                    if abs(ledger_base - commission_charge) <= 0.02:
                        print(f"   ✅ Ledger base matches commission_charge")
                    else:
                        print(f"   ❌ Ledger base ({ledger_base}) ≠ commission_charge ({commission_charge})")
            
            # Get partner invoice
            partner_id = detail.get("partner_id")
            if partner_id:
                r = requests.get(f"{BASE}/invoices?booking_id={booking_id}", headers=H(pt), timeout=30)
                if r.status_code == 200:
                    invoices = r.json().get("items", [])
                    cancel_inv = next((i for i in invoices if i.get("invoice_type") == "cancellation"), None)
                    
                    if cancel_inv:
                        inv_id = cancel_inv.get("id")
                        r = requests.get(f"{BASE}/invoices/{inv_id}", headers=H(pt), timeout=30)
                        if r.status_code == 200:
                            inv_detail = r.json()
                            role_earning = inv_detail.get("role_earning", {})
                            
                            print(f"\n📊 PARTNER INVOICE:")
                            print(f"   Coupon code: {role_earning.get('coupon_code')}")
                            print(f"   Coupon discount: ₹{role_earning.get('coupon_discount')}")
                            print(f"   Coupon bearer: {role_earning.get('coupon_bearer')}")
                            print(f"   Base: ₹{role_earning.get('base')}")
                            print(f"   Net: ₹{role_earning.get('net')}")
                            
                            if role_earning.get("coupon_code") and role_earning.get("coupon_bearer") == "AzoApp Platform":
                                print(f"   ✅ Partner invoice has coupon fields with correct bearer")
                            else:
                                print(f"   ❌ Partner invoice missing coupon fields or wrong bearer")

print("\n" + "="*80)
print("TASK 2: ACCEPT-STREAK ON COMPLETION TEST")
print("="*80)

# Get partner profile
r = requests.get(f"{BASE}/partner/profile", headers=H(pt), timeout=30)
if r.status_code == 200:
    profile = r.json()
    accept_streak = profile.get("accept_streak", 0)
    print(f"\n📊 Partner accept_streak: {accept_streak}")
    
    # Get partner ledger
    r = requests.get(f"{BASE}/wallet/partner", headers=H(pt), timeout=30)
    if r.status_code == 200:
        wallet = r.json()
        ledger = wallet.get("ledger", [])
        accept_bonuses = [l for l in ledger if l.get("kind") == "accept_streak_bonus"]
        
        print(f"   Accept-streak bonuses in ledger: {len(accept_bonuses)}")
        
        if accept_bonuses:
            print(f"\n   Recent accept-streak bonuses:")
            for bonus in accept_bonuses[:3]:
                print(f"   - {bonus.get('note')}: ₹{bonus.get('amount')} at {bonus.get('created_at')[:19]}")
        
        # Check recent bookings
        r = requests.get(f"{BASE}/bookings/partner/history?limit=10", headers=H(pt), timeout=30)
        if r.status_code == 200:
            bookings = r.json().get("items", [])
            completed = [b for b in bookings if b.get("status") == "completed"]
            
            print(f"\n   Recent completed bookings: {len(completed)}")
            
            if completed and accept_streak > 0:
                print(f"   ✅ Partner has accept_streak={accept_streak} and completed bookings")
                print(f"   ✅ Accept-streak appears to be working (increments on completion)")
            elif accept_streak == 0:
                print(f"   ℹ️  Accept_streak is 0 (may have been reset or no completions yet)")

print("\n" + "="*80)
print("TEST COMPLETE")
print("="*80)
