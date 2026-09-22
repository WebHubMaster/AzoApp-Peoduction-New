#!/usr/bin/env python3
"""
MERCHANT REFERRAL COMMISSION ON CANCELLATION (Model B) - CORRECTED TEST
This test properly sets merchant relationships BEFORE creating bookings.
"""

import requests
import json
import time
from datetime import datetime, timedelta
from pymongo import MongoClient
from bson import ObjectId

# Configuration
BASE_URL = "https://mobile-invoice-build.preview.emergentagent.com/api"
CUSTOMER_PHONE = "+919000000004"
PARTNER_PHONE = "+919000000003"
MERCHANT_PHONE = "+919000000002"
ADMIN_PHONE = "+919000000000"
OTP = "123456"
PINCODE = "800001"

# MongoDB
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "azoapp_database"

def get_merchant_id():
    """Get merchant ID (UUID, not ObjectId) from database"""
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    merchant = db.users.find_one({"phone": MERCHANT_PHONE, "role": "merchant"})
    client.close()
    return merchant["id"] if merchant else None  # Return UUID 'id', not ObjectId '_id'

def setup_scenario(scenario_name, customer_linked=False, partner_linked=False):
    """Setup merchant relationships for a scenario"""
    print(f"\n{'='*80}")
    print(f"SCENARIO: {scenario_name}")
    print(f"{'='*80}")
    
    merchant_id = get_merchant_id()
    if not merchant_id:
        print("❌ Merchant not found")
        return None
    
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Clear relationships first
    db.users.update_one(
        {"phone": CUSTOMER_PHONE, "role": "customer"},
        {"$unset": {"customer_merchant_id": ""}}
    )
    db.users.update_one(
        {"phone": PARTNER_PHONE, "role": "partner"},
        {"$unset": {"referred_by_merchant": ""}}
    )
    
    # Set relationships based on scenario
    if customer_linked:
        db.users.update_one(
            {"phone": CUSTOMER_PHONE, "role": "customer"},
            {"$set": {"customer_merchant_id": merchant_id}}
        )
        print(f"✅ Customer linked to merchant {merchant_id}")
    else:
        print("✅ Customer NOT linked to merchant")
    
    if partner_linked:
        db.users.update_one(
            {"phone": PARTNER_PHONE, "role": "partner"},
            {"$set": {"referred_by_merchant": merchant_id}}
        )
        print(f"✅ Partner linked to merchant {merchant_id}")
    else:
        print("✅ Partner NOT linked to merchant")
    
    # Get initial merchant balance
    merchant = db.users.find_one({"id": merchant_id, "role": "merchant"})
    initial_balance = float(merchant.get("wallet_balance", 0)) if merchant else 0.0
    print(f"✅ Initial merchant balance: ₹{initial_balance}")
    
    client.close()
    return merchant_id, initial_balance

def login(phone):
    """Login and get token"""
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if resp.status_code != 200:
        return None
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    if resp.status_code != 200:
        return None
    return resp.json().get("token")

def create_and_cancel_booking(customer_token, admin_token, partner_id):
    """Create, pay, assign, and cancel a booking"""
    # Get service
    resp = requests.get(f"{BASE_URL}/catalog/services", headers={"Authorization": f"Bearer {customer_token}"})
    if resp.status_code != 200:
        print(f"❌ Failed to get services: {resp.status_code}")
        return None
    services = resp.json()
    service_id = services[0]["id"] if services else None
    
    # Create booking
    scheduled_at = (datetime.utcnow() + timedelta(days=1)).strftime("%Y-%m-%dT10:00:00Z")
    payload = {
        "items": [{"service_id": service_id, "qty": 1}],
        "address": {
            "line": "12 MG Road",
            "pincode": PINCODE,
            "city": "Patna",
            "state": "Bihar",
            "lat": 25.6,
            "lng": 85.1
        },
        "schedule_type": "schedule",
        "scheduled_at": scheduled_at,
        "apply_visiting": False,
        "order_group_id": f"TEST-{int(time.time())}",
        "idempotency_key": f"test-{int(time.time())}"
    }
    
    resp = requests.post(f"{BASE_URL}/bookings/grouped", 
                        headers={"Authorization": f"Bearer {customer_token}"}, 
                        json=payload)
    if resp.status_code != 200:
        print(f"❌ Failed to create booking: {resp.status_code} {resp.text}")
        return None
    
    data = resp.json()
    booking_id = data.get("id")
    booking_code = data.get("code")
    pricing = data.get("pricing", {})
    
    print(f"✅ Created booking {booking_code}")
    print(f"   Base: ₹{pricing.get('commissionable_base')}, GST: ₹{pricing.get('gst')}, Total: ₹{pricing.get('total')}")
    
    # Check if booking has merchant_id
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    booking = db.bookings.find_one({"id": booking_id})
    merchant_id_on_booking = booking.get("merchant_id")
    print(f"   Booking merchant_id: {merchant_id_on_booking}")
    client.close()
    
    # Pay booking
    resp = requests.post(f"{BASE_URL}/payments/order", 
                        headers={"Authorization": f"Bearer {customer_token}"}, 
                        json={"purpose": "booking", "booking_id": booking_id})
    if resp.status_code != 200:
        print(f"❌ Failed to create payment order: {resp.status_code}")
        return None
    
    resp = requests.post(f"{BASE_URL}/payments/mock", 
                        headers={"Authorization": f"Bearer {customer_token}"}, 
                        json={"purpose": "booking", "booking_id": booking_id})
    if resp.status_code != 200:
        print(f"❌ Failed to mock payment: {resp.status_code}")
        return None
    
    print(f"✅ Paid booking")
    
    # Assign partner
    resp = requests.post(f"{BASE_URL}/admin/bookings/{booking_id}/assign",
                        headers={"Authorization": f"Bearer {admin_token}"},
                        json={"partner_id": partner_id})
    if resp.status_code != 200:
        print(f"❌ Failed to assign partner: {resp.status_code}")
        return None
    
    print(f"✅ Assigned partner")
    
    # Cancel booking
    resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/cancel",
                        headers={"Authorization": f"Bearer {customer_token}"},
                        json={"reason": "Test cancellation"})
    if resp.status_code != 200:
        print(f"❌ Failed to cancel booking: {resp.status_code}")
        return None
    
    print(f"✅ Cancelled booking")
    
    # Get booking detail
    resp = requests.get(f"{BASE_URL}/admin/bookings/{booking_id}/detail",
                       headers={"Authorization": f"Bearer {admin_token}"})
    if resp.status_code != 200:
        print(f"❌ Failed to get booking detail: {resp.status_code}")
        return None
    
    detail = resp.json()
    booking = detail.get("booking", {})
    cancellation = booking.get("cancellation", {})
    commission = detail.get("commission", {})
    
    return {
        "booking_id": booking_id,
        "booking_code": booking_code,
        "pricing": pricing,
        "cancellation": cancellation,
        "commission": commission,
        "merchant_id_on_booking": merchant_id_on_booking
    }

def verify_scenario(result, merchant_id, initial_balance, expected_merchant_pct):
    """Verify scenario results"""
    if not result:
        print("❌ Test failed - no result")
        return False
    
    cancellation = result["cancellation"]
    pricing = result["pricing"]
    commission = result["commission"]
    
    base = float(pricing.get("commissionable_base", 0))
    gst = float(pricing.get("gst", 0))
    cancel_charge = float(cancellation.get("cancel_charge", 0))
    partner_cut = float(cancellation.get("partner_cut", 0))
    merchant_customer_comm = float(commission.get("merchant_customer_comm", 0))
    merchant_partner_comm = float(commission.get("merchant_partner_comm", 0))
    admin_cut = float(commission.get("platform_commission", 0))
    refund = float(cancellation.get("refund", 0))
    
    print(f"\n📊 FINANCIAL BREAKDOWN:")
    print(f"   Base: ₹{base}, GST: ₹{gst}")
    print(f"   Cancel charge (20% of base): ₹{cancel_charge}")
    print(f"   Partner cut (80% of charge): ₹{partner_cut}")
    print(f"   Merchant partner comm (5% of charge): ₹{merchant_partner_comm}")
    print(f"   Merchant customer comm (3% of charge): ₹{merchant_customer_comm}")
    print(f"   Admin cut (platform): ₹{admin_cut}")
    print(f"   Customer refund (80% of base+GST): ₹{refund}")
    
    # Expected values
    expected_cancel_charge = round(base * 0.2, 2)
    expected_partner_cut = round(cancel_charge * 0.8, 2)
    expected_merchant_total = round(cancel_charge * expected_merchant_pct / 100, 2)
    expected_refund = round((base + gst) * 0.8, 2)
    
    # Verify cancel charge
    if abs(cancel_charge - expected_cancel_charge) > 0.02:
        print(f"❌ Cancel charge mismatch: expected ₹{expected_cancel_charge}, got ₹{cancel_charge}")
        return False
    print(f"✅ Cancel charge correct: ₹{cancel_charge}")
    
    # Verify partner cut
    if abs(partner_cut - expected_partner_cut) > 0.02:
        print(f"❌ Partner cut mismatch: expected ₹{expected_partner_cut}, got ₹{partner_cut}")
        return False
    print(f"✅ Partner cut correct: ₹{partner_cut}")
    
    # Verify merchant commission
    total_merchant = round(merchant_partner_comm + merchant_customer_comm, 2)
    if abs(total_merchant - expected_merchant_total) > 0.02:
        print(f"❌ Merchant commission mismatch: expected ₹{expected_merchant_total}, got ₹{total_merchant}")
        return False
    print(f"✅ Merchant commission correct: ₹{total_merchant}")
    
    # Verify 100% distribution
    total_distributed = round(partner_cut + admin_cut + merchant_partner_comm + merchant_customer_comm, 2)
    if abs(total_distributed - cancel_charge) > 0.02:
        print(f"❌ Distribution error: total ₹{total_distributed} != charge ₹{cancel_charge}")
        return False
    print(f"✅ 100% distribution verified: ₹{total_distributed} = ₹{cancel_charge}")
    
    # Verify refund
    if abs(refund - expected_refund) > 0.02:
        print(f"❌ Refund mismatch: expected ₹{expected_refund}, got ₹{refund}")
        return False
    print(f"✅ Customer refund correct: ₹{refund}")
    
    # Verify merchant wallet
    time.sleep(1)
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    merchant = db.users.find_one({"id": merchant_id, "role": "merchant"})
    final_balance = float(merchant.get("wallet_balance", 0)) if merchant else 0.0
    balance_increase = round(final_balance - initial_balance, 2)
    client.close()
    
    if abs(balance_increase - expected_merchant_total) > 0.02:
        print(f"❌ Merchant wallet mismatch: expected increase ₹{expected_merchant_total}, got ₹{balance_increase}")
        return False
    print(f"✅ Merchant wallet credited: ₹{balance_increase}")
    
    # Verify transaction
    if expected_merchant_total > 0:
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        tx = db.transactions.find_one(
            {"user_id": merchant_id, "kind": "cancellation_referral_commission"},
            sort=[("created_at", -1)]
        )
        client.close()
        
        if not tx:
            print(f"❌ No merchant transaction found")
            return False
        print(f"✅ Merchant transaction found: {tx.get('note')}")
    
    return True

def main():
    """Run all scenarios"""
    print("\n" + "="*80)
    print("MERCHANT REFERRAL COMMISSION ON CANCELLATION (Model B) - CORRECTED TEST")
    print("="*80)
    
    # Login
    customer_token = login(CUSTOMER_PHONE)
    admin_token = login(ADMIN_PHONE)
    
    if not customer_token or not admin_token:
        print("❌ Failed to login")
        return 1
    
    # Get partner ID
    resp = requests.get(f"{BASE_URL}/admin/partners", headers={"Authorization": f"Bearer {admin_token}"})
    partners = resp.json().get("partners", [])
    partner_id = None
    for p in partners:
        if p.get("phone") == PARTNER_PHONE:
            partner_id = p.get("id")
            break
    
    if not partner_id:
        print("❌ Partner not found")
        return 1
    
    print(f"✅ Partner ID: {partner_id}")
    
    # SCENARIO 1: Customer via merchant only (3%)
    merchant_id, initial_balance = setup_scenario("CUSTOMER-VIA-MERCHANT ONLY", customer_linked=True, partner_linked=False)
    result = create_and_cancel_booking(customer_token, admin_token, partner_id)
    if not verify_scenario(result, merchant_id, initial_balance, 3):
        print("❌ SCENARIO 1 FAILED")
    else:
        print("✅ SCENARIO 1 PASSED")
    
    # SCENARIO 2: Partner via merchant only (5%)
    merchant_id, initial_balance = setup_scenario("PARTNER-VIA-MERCHANT ONLY", customer_linked=False, partner_linked=True)
    result = create_and_cancel_booking(customer_token, admin_token, partner_id)
    if not verify_scenario(result, merchant_id, initial_balance, 5):
        print("❌ SCENARIO 2 FAILED")
    else:
        print("✅ SCENARIO 2 PASSED")
    
    # SCENARIO 3: Both via same merchant (8%)
    merchant_id, initial_balance = setup_scenario("BOTH VIA SAME MERCHANT", customer_linked=True, partner_linked=True)
    result = create_and_cancel_booking(customer_token, admin_token, partner_id)
    if not verify_scenario(result, merchant_id, initial_balance, 8):
        print("❌ SCENARIO 3 FAILED")
    else:
        print("✅ SCENARIO 3 PASSED")
    
    # SCENARIO 4: No merchant (0%)
    merchant_id, initial_balance = setup_scenario("NO MERCHANT", customer_linked=False, partner_linked=False)
    result = create_and_cancel_booking(customer_token, admin_token, partner_id)
    if not verify_scenario(result, merchant_id, initial_balance, 0):
        print("❌ SCENARIO 4 FAILED")
    else:
        print("✅ SCENARIO 4 PASSED")
    
    print("\n" + "="*80)
    print("TEST COMPLETE")
    print("="*80)
    
    return 0

if __name__ == "__main__":
    exit(main())
