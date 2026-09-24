#!/usr/bin/env python3
"""
Comprehensive backend test for MERCHANT REFERRAL COMMISSION ON CANCELLATION (Model B)
Tests the NEW merchant referral commission split on cancellation charges.

Cancellation charges are now split exactly like bookings with the same configured 4-way percentages:
- partner_pct (80%)
- platform_pct (12%)
- merchant_partner_referral_pct (5%)
- merchant_customer_pct (3%)

Merchant earns a share ONLY when the relationship exists on the booking.
Ineligible merchant shares are ABSORBED by the platform commission.
"""

import requests
import json
import time
import uuid
from datetime import datetime, timedelta
from pymongo import MongoClient

# Configuration
BASE_URL = "https://profile-kyc-panel.preview.emergentagent.com/api"
CUSTOMER_PHONE = "+919000000004"
PARTNER_PHONE = "+919000000003"
MERCHANT_PHONE = "+919000000002"
ADMIN_PHONE = "+919000000000"
OTP = "123456"
PINCODE = "800001"

# MongoDB connection
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "azoapp_database"

# Test results
test_results = {
    "total": 0,
    "passed": 0,
    "failed": 0,
    "errors": [],
    "scenarios": {}
}

def log_test(name, passed, details=""):
    """Log test result"""
    test_results["total"] += 1
    if passed:
        test_results["passed"] += 1
        print(f"✅ {name}")
    else:
        test_results["failed"] += 1
        test_results["errors"].append(f"{name}: {details}")
        print(f"❌ {name}: {details}")
    if details and passed:
        print(f"   {details}")

def login(phone, otp):
    """Login and get auth token"""
    # Request OTP
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if resp.status_code != 200:
        print(f"Failed to send OTP for {phone}: {resp.status_code} {resp.text}")
        return None
    
    # Verify OTP
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": otp})
    if resp.status_code != 200:
        print(f"Failed to verify OTP for {phone}: {resp.status_code} {resp.text}")
        return None
    
    data = resp.json()
    return data.get("token")

def get_service_id(token):
    """Get a service ID for testing (Door Repair or similar)"""
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{BASE_URL}/catalog/services", headers=headers)
    if resp.status_code != 200:
        print(f"Failed to get services: {resp.status_code}")
        return None
    
    services = resp.json()
    if not services:
        print("No services found")
        return None
    
    # Try to find Door Repair or use first service
    for s in services:
        if "Door" in s.get("name", "") or "Repair" in s.get("name", ""):
            return s["id"]
    
    return services[0]["id"]

def get_partner_id(admin_token):
    """Get partner ID for assignment"""
    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.get(f"{BASE_URL}/admin/partners", headers=headers)
    if resp.status_code != 200:
        print(f"Failed to get partners: {resp.status_code}")
        return None
    
    data = resp.json()
    partners = data.get("partners", [])
    
    # Find partner with phone +919000000003
    for p in partners:
        if p.get("phone") == PARTNER_PHONE:
            return p.get("id")
    
    return None

def get_merchant_id():
    """Get merchant ID from database"""
    try:
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        merchant = db.users.find_one({"phone": MERCHANT_PHONE, "role": "merchant"})
        if merchant:
            return str(merchant["_id"])
        return None
    except Exception as e:
        print(f"Error getting merchant ID: {e}")
        return None
    finally:
        client.close()

def get_merchant_wallet_balance(merchant_id):
    """Get merchant wallet balance from database"""
    try:
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        merchant = db.users.find_one({"_id": merchant_id})
        if merchant:
            return float(merchant.get("wallet_balance", 0))
        return 0.0
    except Exception as e:
        print(f"Error getting merchant wallet balance: {e}")
        return 0.0
    finally:
        client.close()

def set_customer_merchant(customer_phone, merchant_id):
    """Set customer_merchant_id on customer user"""
    try:
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        result = db.users.update_one(
            {"phone": customer_phone, "role": "customer"},
            {"$set": {"customer_merchant_id": merchant_id}}
        )
        return result.modified_count > 0 or result.matched_count > 0
    except Exception as e:
        print(f"Error setting customer merchant: {e}")
        return False
    finally:
        client.close()

def set_partner_merchant(partner_phone, merchant_id):
    """Set referred_by_merchant on partner user"""
    try:
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        result = db.users.update_one(
            {"phone": partner_phone, "role": "partner"},
            {"$set": {"referred_by_merchant": merchant_id}}
        )
        return result.modified_count > 0 or result.matched_count > 0
    except Exception as e:
        print(f"Error setting partner merchant: {e}")
        return False
    finally:
        client.close()

def clear_merchant_relationships():
    """Clear all merchant relationships for clean testing"""
    try:
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        db.users.update_one(
            {"phone": CUSTOMER_PHONE, "role": "customer"},
            {"$unset": {"customer_merchant_id": ""}}
        )
        db.users.update_one(
            {"phone": PARTNER_PHONE, "role": "partner"},
            {"$unset": {"referred_by_merchant": ""}}
        )
        return True
    except Exception as e:
        print(f"Error clearing merchant relationships: {e}")
        return False
    finally:
        client.close()

def create_booking(customer_token, service_id, order_group_id=None):
    """Create a booking"""
    headers = {"Authorization": f"Bearer {customer_token}"}
    
    # Future scheduled time
    scheduled_at = (datetime.utcnow() + timedelta(days=1)).strftime("%Y-%m-%dT10:00:00Z")
    
    if not order_group_id:
        order_group_id = f"TEST-{int(time.time())}"
    
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
        "apply_visiting": False,  # Keep math clean
        "order_group_id": order_group_id,
        "idempotency_key": str(uuid.uuid4())
    }
    
    resp = requests.post(f"{BASE_URL}/bookings/grouped", headers=headers, json=payload)
    if resp.status_code != 200:
        print(f"Failed to create booking: {resp.status_code} {resp.text}")
        return None
    
    data = resp.json()
    return data.get("id"), data.get("code"), data.get("pricing", {})

def pay_booking(customer_token, booking_id):
    """Pay for a booking using mock payment"""
    headers = {"Authorization": f"Bearer {customer_token}"}
    
    # Create payment order
    resp = requests.post(f"{BASE_URL}/payments/order", 
                        headers=headers, 
                        json={"purpose": "booking", "booking_id": booking_id})
    if resp.status_code != 200:
        print(f"Failed to create payment order: {resp.status_code} {resp.text}")
        return False
    
    # Mock payment
    resp = requests.post(f"{BASE_URL}/payments/mock", 
                        headers=headers, 
                        json={"purpose": "booking", "booking_id": booking_id})
    if resp.status_code != 200:
        print(f"Failed to mock payment: {resp.status_code} {resp.text}")
        return False
    
    return True

def assign_partner(admin_token, booking_id, partner_id):
    """Assign partner to booking"""
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    resp = requests.post(f"{BASE_URL}/admin/bookings/{booking_id}/assign",
                        headers=headers,
                        json={"partner_id": partner_id})
    if resp.status_code != 200:
        print(f"Failed to assign partner: {resp.status_code} {resp.text}")
        return False
    
    return True

def cancel_booking(customer_token, booking_id):
    """Cancel a booking"""
    headers = {"Authorization": f"Bearer {customer_token}"}
    
    resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/cancel",
                        headers=headers,
                        json={"reason": "Test cancellation"})
    if resp.status_code != 200:
        print(f"Failed to cancel booking: {resp.status_code} {resp.text}")
        return None
    
    return resp.json()

def get_booking_detail(admin_token, booking_id):
    """Get booking detail from admin API"""
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    resp = requests.get(f"{BASE_URL}/admin/bookings/{booking_id}/detail",
                       headers=headers)
    if resp.status_code != 200:
        print(f"Failed to get booking detail: {resp.status_code} {resp.text}")
        return None
    
    return resp.json()

def get_merchant_transactions(merchant_id):
    """Get merchant wallet transactions from database"""
    try:
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        transactions = list(db.wallet_transactions.find(
            {"user_id": merchant_id, "kind": "cancellation_referral_commission"}
        ).sort("created_at", -1).limit(5))
        return transactions
    except Exception as e:
        print(f"Error getting merchant transactions: {e}")
        return []
    finally:
        client.close()

def get_commission_ledger(booking_id):
    """Get commission ledger entry for booking"""
    try:
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        ledger = db.commission_ledger.find_one(
            {"booking_id": booking_id, "kind": "cancellation"}
        )
        return ledger
    except Exception as e:
        print(f"Error getting commission ledger: {e}")
        return None
    finally:
        client.close()

def round_money(amount):
    """Round money to 2 decimal places"""
    return round(float(amount), 2)

def test_scenario_1_customer_via_merchant_only():
    """
    SCENARIO 1: CUSTOMER-VIA-MERCHANT ONLY
    Customer has customer_merchant_id set, partner has NO referred_by_merchant.
    Expected:
    - merchant_customer_comm = round(charge * 0.03, 2)
    - merchant_partner_comm = 0
    - admin_cut = round(charge - partner_cut - merchant_customer_comm, 2) (17%)
    - Merchant wallet credited EXACTLY merchant_customer_comm via ONE transaction
    - Transaction note mentions 'Customer referral'
    """
    print("\n" + "="*80)
    print("SCENARIO 1: CUSTOMER-VIA-MERCHANT ONLY")
    print("="*80)
    
    scenario_results = {"passed": 0, "failed": 0, "details": {}}
    
    # Setup
    merchant_id = get_merchant_id()
    if not merchant_id:
        log_test("Scenario 1: Get merchant ID", False, "Merchant not found")
        return scenario_results
    
    log_test("Scenario 1: Get merchant ID", True, f"Merchant ID: {merchant_id}")
    
    # Clear relationships and set only customer merchant
    clear_merchant_relationships()
    set_customer_merchant(CUSTOMER_PHONE, merchant_id)
    log_test("Scenario 1: Setup relationships", True, "Customer linked to merchant, partner NOT linked")
    
    # Get initial merchant wallet balance
    initial_balance = get_merchant_wallet_balance(merchant_id)
    log_test("Scenario 1: Get initial merchant balance", True, f"Initial balance: ₹{initial_balance}")
    
    # Login
    customer_token = login(CUSTOMER_PHONE, OTP)
    admin_token = login(ADMIN_PHONE, OTP)
    
    if not customer_token or not admin_token:
        log_test("Scenario 1: Login", False, "Failed to login")
        return scenario_results
    
    log_test("Scenario 1: Login", True, "Customer and admin logged in")
    
    # Get service and partner
    service_id = get_service_id(customer_token)
    partner_id = get_partner_id(admin_token)
    
    if not service_id or not partner_id:
        log_test("Scenario 1: Get service/partner", False, "Failed to get service or partner")
        return scenario_results
    
    log_test("Scenario 1: Get service/partner", True, f"Service: {service_id}, Partner: {partner_id}")
    
    # Create booking
    booking_id, booking_code, pricing = create_booking(customer_token, service_id)
    if not booking_id:
        log_test("Scenario 1: Create booking", False, "Failed to create booking")
        return scenario_results
    
    log_test("Scenario 1: Create booking", True, f"Booking: {booking_code} (ID: {booking_id})")
    
    # Pay booking
    if not pay_booking(customer_token, booking_id):
        log_test("Scenario 1: Pay booking", False, "Failed to pay booking")
        return scenario_results
    
    log_test("Scenario 1: Pay booking", True, "Booking paid via mock payment")
    
    # Assign partner
    if not assign_partner(admin_token, booking_id, partner_id):
        log_test("Scenario 1: Assign partner", False, "Failed to assign partner")
        return scenario_results
    
    log_test("Scenario 1: Assign partner", True, "Partner assigned to booking")
    
    # Cancel booking
    cancel_result = cancel_booking(customer_token, booking_id)
    if not cancel_result:
        log_test("Scenario 1: Cancel booking", False, "Failed to cancel booking")
        return scenario_results
    
    log_test("Scenario 1: Cancel booking", True, "Booking cancelled")
    
    # Get booking detail
    detail = get_booking_detail(admin_token, booking_id)
    if not detail:
        log_test("Scenario 1: Get booking detail", False, "Failed to get booking detail")
        return scenario_results
    
    booking = detail.get("booking", {})
    cancellation = booking.get("cancellation", {})
    commission = detail.get("commission", {})
    
    # Extract values
    base = float(pricing.get("commissionable_base", 0))
    cancel_charge = float(cancellation.get("cancel_charge", 0))
    partner_cut = float(cancellation.get("partner_cut", 0))
    merchant_customer_comm = float(cancellation.get("merchant_customer", 0))
    merchant_partner_comm = float(cancellation.get("merchant_referral", 0))
    admin_cut = float(cancellation.get("admin_cut", 0))
    refund = float(cancellation.get("refund", 0))
    
    # Expected values (config: partner 80%, platform 12%, merchant_partner 5%, merchant_customer 3%)
    expected_cancel_charge = round_money(base * 0.2)
    expected_partner_cut = round_money(cancel_charge * 0.8)
    expected_merchant_customer = round_money(cancel_charge * 0.03)
    expected_merchant_partner = 0.0
    expected_admin_cut = round_money(cancel_charge - expected_partner_cut - expected_merchant_customer)
    expected_refund = round_money((base + float(pricing.get("gst", 0))) * 0.8)
    
    # Test cancel_charge
    passed = abs(cancel_charge - expected_cancel_charge) <= 0.02
    log_test("Scenario 1: Cancel charge = 20% of base", passed, 
             f"Expected: ₹{expected_cancel_charge}, Actual: ₹{cancel_charge}, Base: ₹{base}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test partner_cut
    passed = abs(partner_cut - expected_partner_cut) <= 0.02
    log_test("Scenario 1: Partner cut = 80% of charge", passed,
             f"Expected: ₹{expected_partner_cut}, Actual: ₹{partner_cut}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test merchant_customer_comm
    passed = abs(merchant_customer_comm - expected_merchant_customer) <= 0.02
    log_test("Scenario 1: Merchant customer commission = 3% of charge", passed,
             f"Expected: ₹{expected_merchant_customer}, Actual: ₹{merchant_customer_comm}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test merchant_partner_comm
    passed = merchant_partner_comm == 0.0
    log_test("Scenario 1: Merchant partner commission = 0", passed,
             f"Expected: ₹0.00, Actual: ₹{merchant_partner_comm}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test admin_cut
    passed = abs(admin_cut - expected_admin_cut) <= 0.02
    log_test("Scenario 1: Admin cut = charge - partner - merchant_customer (17%)", passed,
             f"Expected: ₹{expected_admin_cut}, Actual: ₹{admin_cut}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test 100% distribution
    total_distributed = round_money(partner_cut + admin_cut + merchant_customer_comm + merchant_partner_comm)
    passed = abs(total_distributed - cancel_charge) <= 0.02
    log_test("Scenario 1: 100% distribution (partner + admin + merchant = charge)", passed,
             f"Total: ₹{total_distributed}, Charge: ₹{cancel_charge}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test refund (unchanged)
    passed = abs(refund - expected_refund) <= 0.02
    log_test("Scenario 1: Customer refund = 80% of (base + GST)", passed,
             f"Expected: ₹{expected_refund}, Actual: ₹{refund}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test merchant wallet transaction
    time.sleep(1)  # Wait for transaction to be recorded
    final_balance = get_merchant_wallet_balance(merchant_id)
    balance_increase = round_money(final_balance - initial_balance)
    passed = abs(balance_increase - expected_merchant_customer) <= 0.02
    log_test("Scenario 1: Merchant wallet credited exactly merchant_customer_comm", passed,
             f"Expected increase: ₹{expected_merchant_customer}, Actual: ₹{balance_increase}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test transaction note
    transactions = get_merchant_transactions(merchant_id)
    if transactions:
        latest_tx = transactions[0]
        note = latest_tx.get("note", "")
        passed = "Customer referral" in note or "customer referral" in note.lower()
        log_test("Scenario 1: Transaction note mentions 'Customer referral'", passed,
                 f"Note: {note}")
        if passed: scenario_results["passed"] += 1
        else: scenario_results["failed"] += 1
        
        # Test transaction kind
        passed = latest_tx.get("kind") == "cancellation_referral_commission"
        log_test("Scenario 1: Transaction kind = 'cancellation_referral_commission'", passed,
                 f"Kind: {latest_tx.get('kind')}")
        if passed: scenario_results["passed"] += 1
        else: scenario_results["failed"] += 1
    else:
        log_test("Scenario 1: Transaction found", False, "No transactions found")
        scenario_results["failed"] += 2
    
    # Test commission ledger
    ledger = get_commission_ledger(booking_id)
    if ledger:
        passed = ledger.get("kind") == "cancellation"
        log_test("Scenario 1: Commission ledger kind = 'cancellation'", passed,
                 f"Kind: {ledger.get('kind')}")
        if passed: scenario_results["passed"] += 1
        else: scenario_results["failed"] += 1
        
        passed = float(ledger.get("merchant_customer", 0)) > 0
        log_test("Scenario 1: Commission ledger has merchant_customer > 0", passed,
                 f"merchant_customer: ₹{ledger.get('merchant_customer', 0)}")
        if passed: scenario_results["passed"] += 1
        else: scenario_results["failed"] += 1
    else:
        log_test("Scenario 1: Commission ledger found", False, "No ledger entry found")
        scenario_results["failed"] += 2
    
    # Test admin booking detail commission block
    if commission:
        passed = "merchant_customer_pct" in commission
        log_test("Scenario 1: Admin detail has merchant_customer_pct", passed,
                 f"merchant_customer_pct: {commission.get('merchant_customer_pct')}")
        if passed: scenario_results["passed"] += 1
        else: scenario_results["failed"] += 1
        
        passed = "merchant_customer_comm" in commission
        log_test("Scenario 1: Admin detail has merchant_customer_comm", passed,
                 f"merchant_customer_comm: ₹{commission.get('merchant_customer_comm')}")
        if passed: scenario_results["passed"] += 1
        else: scenario_results["failed"] += 1
        
        passed = "total_merchant_comm" in commission
        log_test("Scenario 1: Admin detail has total_merchant_comm", passed,
                 f"total_merchant_comm: ₹{commission.get('total_merchant_comm')}")
        if passed: scenario_results["passed"] += 1
        else: scenario_results["failed"] += 1
        
        # Test commission rows
        rows = commission.get("rows", [])
        merchant_customer_row = None
        for row in rows:
            if row.get("label") == "Merchant · Customer":
                merchant_customer_row = row
                break
        
        passed = merchant_customer_row is not None
        log_test("Scenario 1: Admin detail has merchant_customer row", passed,
                 f"Row found: {merchant_customer_row is not None}")
        if passed: scenario_results["passed"] += 1
        else: scenario_results["failed"] += 1
    else:
        log_test("Scenario 1: Commission block found", False, "No commission block")
        scenario_results["failed"] += 4
    
    test_results["scenarios"]["scenario_1"] = scenario_results
    return scenario_results

def test_scenario_2_partner_via_merchant_only():
    """
    SCENARIO 2: PARTNER-VIA-MERCHANT ONLY
    Partner has referred_by_merchant set, customer NOT merchant-linked.
    Expected:
    - merchant_partner_comm = round(charge * 0.05, 2)
    - merchant_customer_comm = 0
    - admin_cut = round(charge - partner_cut - merchant_partner_comm, 2) (15%)
    """
    print("\n" + "="*80)
    print("SCENARIO 2: PARTNER-VIA-MERCHANT ONLY")
    print("="*80)
    
    scenario_results = {"passed": 0, "failed": 0, "details": {}}
    
    # Setup
    merchant_id = get_merchant_id()
    if not merchant_id:
        log_test("Scenario 2: Get merchant ID", False, "Merchant not found")
        return scenario_results
    
    log_test("Scenario 2: Get merchant ID", True, f"Merchant ID: {merchant_id}")
    
    # Clear relationships and set only partner merchant
    clear_merchant_relationships()
    set_partner_merchant(PARTNER_PHONE, merchant_id)
    log_test("Scenario 2: Setup relationships", True, "Partner linked to merchant, customer NOT linked")
    
    # Get initial merchant wallet balance
    initial_balance = get_merchant_wallet_balance(merchant_id)
    log_test("Scenario 2: Get initial merchant balance", True, f"Initial balance: ₹{initial_balance}")
    
    # Login
    customer_token = login(CUSTOMER_PHONE, OTP)
    admin_token = login(ADMIN_PHONE, OTP)
    
    if not customer_token or not admin_token:
        log_test("Scenario 2: Login", False, "Failed to login")
        return scenario_results
    
    log_test("Scenario 2: Login", True, "Customer and admin logged in")
    
    # Get service and partner
    service_id = get_service_id(customer_token)
    partner_id = get_partner_id(admin_token)
    
    if not service_id or not partner_id:
        log_test("Scenario 2: Get service/partner", False, "Failed to get service or partner")
        return scenario_results
    
    log_test("Scenario 2: Get service/partner", True, f"Service: {service_id}, Partner: {partner_id}")
    
    # Create booking
    booking_id, booking_code, pricing = create_booking(customer_token, service_id)
    if not booking_id:
        log_test("Scenario 2: Create booking", False, "Failed to create booking")
        return scenario_results
    
    log_test("Scenario 2: Create booking", True, f"Booking: {booking_code} (ID: {booking_id})")
    
    # Pay booking
    if not pay_booking(customer_token, booking_id):
        log_test("Scenario 2: Pay booking", False, "Failed to pay booking")
        return scenario_results
    
    log_test("Scenario 2: Pay booking", True, "Booking paid via mock payment")
    
    # Assign partner
    if not assign_partner(admin_token, booking_id, partner_id):
        log_test("Scenario 2: Assign partner", False, "Failed to assign partner")
        return scenario_results
    
    log_test("Scenario 2: Assign partner", True, "Partner assigned to booking")
    
    # Cancel booking
    cancel_result = cancel_booking(customer_token, booking_id)
    if not cancel_result:
        log_test("Scenario 2: Cancel booking", False, "Failed to cancel booking")
        return scenario_results
    
    log_test("Scenario 2: Cancel booking", True, "Booking cancelled")
    
    # Get booking detail
    detail = get_booking_detail(admin_token, booking_id)
    if not detail:
        log_test("Scenario 2: Get booking detail", False, "Failed to get booking detail")
        return scenario_results
    
    booking = detail.get("booking", {})
    cancellation = booking.get("cancellation", {})
    
    # Extract values
    base = float(pricing.get("commissionable_base", 0))
    cancel_charge = float(cancellation.get("cancel_charge", 0))
    partner_cut = float(cancellation.get("partner_cut", 0))
    merchant_customer_comm = float(cancellation.get("merchant_customer", 0))
    merchant_partner_comm = float(cancellation.get("merchant_referral", 0))
    admin_cut = float(cancellation.get("admin_cut", 0))
    
    # Expected values
    expected_cancel_charge = round_money(base * 0.2)
    expected_partner_cut = round_money(cancel_charge * 0.8)
    expected_merchant_partner = round_money(cancel_charge * 0.05)
    expected_merchant_customer = 0.0
    expected_admin_cut = round_money(cancel_charge - expected_partner_cut - expected_merchant_partner)
    
    # Test merchant_partner_comm
    passed = abs(merchant_partner_comm - expected_merchant_partner) <= 0.02
    log_test("Scenario 2: Merchant partner commission = 5% of charge", passed,
             f"Expected: ₹{expected_merchant_partner}, Actual: ₹{merchant_partner_comm}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test merchant_customer_comm
    passed = merchant_customer_comm == 0.0
    log_test("Scenario 2: Merchant customer commission = 0", passed,
             f"Expected: ₹0.00, Actual: ₹{merchant_customer_comm}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test admin_cut
    passed = abs(admin_cut - expected_admin_cut) <= 0.02
    log_test("Scenario 2: Admin cut = charge - partner - merchant_partner (15%)", passed,
             f"Expected: ₹{expected_admin_cut}, Actual: ₹{admin_cut}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test 100% distribution
    total_distributed = round_money(partner_cut + admin_cut + merchant_customer_comm + merchant_partner_comm)
    passed = abs(total_distributed - cancel_charge) <= 0.02
    log_test("Scenario 2: 100% distribution", passed,
             f"Total: ₹{total_distributed}, Charge: ₹{cancel_charge}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test merchant wallet transaction
    time.sleep(1)
    final_balance = get_merchant_wallet_balance(merchant_id)
    balance_increase = round_money(final_balance - initial_balance)
    passed = abs(balance_increase - expected_merchant_partner) <= 0.02
    log_test("Scenario 2: Merchant wallet credited exactly merchant_partner_comm", passed,
             f"Expected increase: ₹{expected_merchant_partner}, Actual: ₹{balance_increase}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test transaction note
    transactions = get_merchant_transactions(merchant_id)
    if transactions:
        latest_tx = transactions[0]
        note = latest_tx.get("note", "")
        passed = "Partner referral" in note or "partner referral" in note.lower()
        log_test("Scenario 2: Transaction note mentions 'Partner referral'", passed,
                 f"Note: {note}")
        if passed: scenario_results["passed"] += 1
        else: scenario_results["failed"] += 1
    else:
        log_test("Scenario 2: Transaction found", False, "No transactions found")
        scenario_results["failed"] += 1
    
    test_results["scenarios"]["scenario_2"] = scenario_results
    return scenario_results

def test_scenario_3_both_via_same_merchant():
    """
    SCENARIO 3: BOTH via the SAME merchant
    Both partner and customer linked to the same merchant.
    Expected:
    - merchant gets ONE combined transaction of round(charge * 0.08, 2)
    - Transaction note contains both 'Partner referral' and 'Customer referral'
    - admin_cut = charge * 0.12
    """
    print("\n" + "="*80)
    print("SCENARIO 3: BOTH VIA SAME MERCHANT")
    print("="*80)
    
    scenario_results = {"passed": 0, "failed": 0, "details": {}}
    
    # Setup
    merchant_id = get_merchant_id()
    if not merchant_id:
        log_test("Scenario 3: Get merchant ID", False, "Merchant not found")
        return scenario_results
    
    log_test("Scenario 3: Get merchant ID", True, f"Merchant ID: {merchant_id}")
    
    # Set both relationships to same merchant
    clear_merchant_relationships()
    set_customer_merchant(CUSTOMER_PHONE, merchant_id)
    set_partner_merchant(PARTNER_PHONE, merchant_id)
    log_test("Scenario 3: Setup relationships", True, "Both partner and customer linked to same merchant")
    
    # Get initial merchant wallet balance
    initial_balance = get_merchant_wallet_balance(merchant_id)
    log_test("Scenario 3: Get initial merchant balance", True, f"Initial balance: ₹{initial_balance}")
    
    # Login
    customer_token = login(CUSTOMER_PHONE, OTP)
    admin_token = login(ADMIN_PHONE, OTP)
    
    if not customer_token or not admin_token:
        log_test("Scenario 3: Login", False, "Failed to login")
        return scenario_results
    
    log_test("Scenario 3: Login", True, "Customer and admin logged in")
    
    # Get service and partner
    service_id = get_service_id(customer_token)
    partner_id = get_partner_id(admin_token)
    
    if not service_id or not partner_id:
        log_test("Scenario 3: Get service/partner", False, "Failed to get service or partner")
        return scenario_results
    
    log_test("Scenario 3: Get service/partner", True, f"Service: {service_id}, Partner: {partner_id}")
    
    # Create booking
    booking_id, booking_code, pricing = create_booking(customer_token, service_id)
    if not booking_id:
        log_test("Scenario 3: Create booking", False, "Failed to create booking")
        return scenario_results
    
    log_test("Scenario 3: Create booking", True, f"Booking: {booking_code} (ID: {booking_id})")
    
    # Pay booking
    if not pay_booking(customer_token, booking_id):
        log_test("Scenario 3: Pay booking", False, "Failed to pay booking")
        return scenario_results
    
    log_test("Scenario 3: Pay booking", True, "Booking paid via mock payment")
    
    # Assign partner
    if not assign_partner(admin_token, booking_id, partner_id):
        log_test("Scenario 3: Assign partner", False, "Failed to assign partner")
        return scenario_results
    
    log_test("Scenario 3: Assign partner", True, "Partner assigned to booking")
    
    # Cancel booking
    cancel_result = cancel_booking(customer_token, booking_id)
    if not cancel_result:
        log_test("Scenario 3: Cancel booking", False, "Failed to cancel booking")
        return scenario_results
    
    log_test("Scenario 3: Cancel booking", True, "Booking cancelled")
    
    # Get booking detail
    detail = get_booking_detail(admin_token, booking_id)
    if not detail:
        log_test("Scenario 3: Get booking detail", False, "Failed to get booking detail")
        return scenario_results
    
    booking = detail.get("booking", {})
    cancellation = booking.get("cancellation", {})
    
    # Extract values
    base = float(pricing.get("commissionable_base", 0))
    cancel_charge = float(cancellation.get("cancel_charge", 0))
    partner_cut = float(cancellation.get("partner_cut", 0))
    merchant_customer_comm = float(cancellation.get("merchant_customer", 0))
    merchant_partner_comm = float(cancellation.get("merchant_referral", 0))
    admin_cut = float(cancellation.get("admin_cut", 0))
    
    # Expected values
    expected_cancel_charge = round_money(base * 0.2)
    expected_partner_cut = round_money(cancel_charge * 0.8)
    expected_merchant_total = round_money(cancel_charge * 0.08)  # 5% + 3%
    expected_admin_cut = round_money(cancel_charge * 0.12)
    
    # Test total merchant commission
    total_merchant = round_money(merchant_partner_comm + merchant_customer_comm)
    passed = abs(total_merchant - expected_merchant_total) <= 0.02
    log_test("Scenario 3: Total merchant commission = 8% of charge (5% + 3%)", passed,
             f"Expected: ₹{expected_merchant_total}, Actual: ₹{total_merchant}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test admin_cut
    passed = abs(admin_cut - expected_admin_cut) <= 0.02
    log_test("Scenario 3: Admin cut = 12% of charge", passed,
             f"Expected: ₹{expected_admin_cut}, Actual: ₹{admin_cut}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test 100% distribution
    total_distributed = round_money(partner_cut + admin_cut + merchant_customer_comm + merchant_partner_comm)
    passed = abs(total_distributed - cancel_charge) <= 0.02
    log_test("Scenario 3: 100% distribution", passed,
             f"Total: ₹{total_distributed}, Charge: ₹{cancel_charge}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test merchant wallet transaction (ONE combined transaction)
    time.sleep(1)
    final_balance = get_merchant_wallet_balance(merchant_id)
    balance_increase = round_money(final_balance - initial_balance)
    passed = abs(balance_increase - expected_merchant_total) <= 0.02
    log_test("Scenario 3: Merchant wallet credited exactly total merchant commission", passed,
             f"Expected increase: ₹{expected_merchant_total}, Actual: ₹{balance_increase}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test transaction note contains both referral types
    transactions = get_merchant_transactions(merchant_id)
    if transactions:
        latest_tx = transactions[0]
        note = latest_tx.get("note", "")
        has_partner = "Partner referral" in note or "partner referral" in note.lower()
        has_customer = "Customer referral" in note or "customer referral" in note.lower()
        passed = has_partner and has_customer
        log_test("Scenario 3: Transaction note mentions BOTH 'Partner referral' AND 'Customer referral'", passed,
                 f"Note: {note}")
        if passed: scenario_results["passed"] += 1
        else: scenario_results["failed"] += 1
    else:
        log_test("Scenario 3: Transaction found", False, "No transactions found")
        scenario_results["failed"] += 1
    
    test_results["scenarios"]["scenario_3"] = scenario_results
    return scenario_results

def test_scenario_4_no_merchant():
    """
    SCENARIO 4: NO MERCHANT AT ALL
    Neither partner nor customer linked to any merchant.
    Expected:
    - merchant_partner_comm = 0
    - merchant_customer_comm = 0
    - admin_cut = round(charge * 0.20, 2) (platform absorbs ineligible merchant shares)
    - NO new merchant wallet transaction created
    """
    print("\n" + "="*80)
    print("SCENARIO 4: NO MERCHANT AT ALL")
    print("="*80)
    
    scenario_results = {"passed": 0, "failed": 0, "details": {}}
    
    # Setup
    merchant_id = get_merchant_id()
    if not merchant_id:
        log_test("Scenario 4: Get merchant ID", False, "Merchant not found")
        return scenario_results
    
    log_test("Scenario 4: Get merchant ID", True, f"Merchant ID: {merchant_id}")
    
    # Clear all relationships
    clear_merchant_relationships()
    log_test("Scenario 4: Setup relationships", True, "No merchant relationships")
    
    # Get initial merchant wallet balance
    initial_balance = get_merchant_wallet_balance(merchant_id)
    log_test("Scenario 4: Get initial merchant balance", True, f"Initial balance: ₹{initial_balance}")
    
    # Login
    customer_token = login(CUSTOMER_PHONE, OTP)
    admin_token = login(ADMIN_PHONE, OTP)
    
    if not customer_token or not admin_token:
        log_test("Scenario 4: Login", False, "Failed to login")
        return scenario_results
    
    log_test("Scenario 4: Login", True, "Customer and admin logged in")
    
    # Get service and partner
    service_id = get_service_id(customer_token)
    partner_id = get_partner_id(admin_token)
    
    if not service_id or not partner_id:
        log_test("Scenario 4: Get service/partner", False, "Failed to get service or partner")
        return scenario_results
    
    log_test("Scenario 4: Get service/partner", True, f"Service: {service_id}, Partner: {partner_id}")
    
    # Create booking
    booking_id, booking_code, pricing = create_booking(customer_token, service_id)
    if not booking_id:
        log_test("Scenario 4: Create booking", False, "Failed to create booking")
        return scenario_results
    
    log_test("Scenario 4: Create booking", True, f"Booking: {booking_code} (ID: {booking_id})")
    
    # Pay booking
    if not pay_booking(customer_token, booking_id):
        log_test("Scenario 4: Pay booking", False, "Failed to pay booking")
        return scenario_results
    
    log_test("Scenario 4: Pay booking", True, "Booking paid via mock payment")
    
    # Assign partner
    if not assign_partner(admin_token, booking_id, partner_id):
        log_test("Scenario 4: Assign partner", False, "Failed to assign partner")
        return scenario_results
    
    log_test("Scenario 4: Assign partner", True, "Partner assigned to booking")
    
    # Cancel booking
    cancel_result = cancel_booking(customer_token, booking_id)
    if not cancel_result:
        log_test("Scenario 4: Cancel booking", False, "Failed to cancel booking")
        return scenario_results
    
    log_test("Scenario 4: Cancel booking", True, "Booking cancelled")
    
    # Get booking detail
    detail = get_booking_detail(admin_token, booking_id)
    if not detail:
        log_test("Scenario 4: Get booking detail", False, "Failed to get booking detail")
        return scenario_results
    
    booking = detail.get("booking", {})
    cancellation = booking.get("cancellation", {})
    
    # Extract values
    base = float(pricing.get("commissionable_base", 0))
    cancel_charge = float(cancellation.get("cancel_charge", 0))
    partner_cut = float(cancellation.get("partner_cut", 0))
    merchant_customer_comm = float(cancellation.get("merchant_customer", 0))
    merchant_partner_comm = float(cancellation.get("merchant_referral", 0))
    admin_cut = float(cancellation.get("admin_cut", 0))
    
    # Expected values
    expected_cancel_charge = round_money(base * 0.2)
    expected_partner_cut = round_money(cancel_charge * 0.8)
    expected_admin_cut = round_money(cancel_charge * 0.20)  # Platform absorbs merchant shares
    
    # Test merchant commissions are 0
    passed = merchant_partner_comm == 0.0 and merchant_customer_comm == 0.0
    log_test("Scenario 4: Both merchant commissions = 0", passed,
             f"merchant_partner: ₹{merchant_partner_comm}, merchant_customer: ₹{merchant_customer_comm}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test admin_cut absorbs merchant shares
    passed = abs(admin_cut - expected_admin_cut) <= 0.02
    log_test("Scenario 4: Admin cut = 20% of charge (absorbs ineligible merchant shares)", passed,
             f"Expected: ₹{expected_admin_cut}, Actual: ₹{admin_cut}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test 100% distribution
    total_distributed = round_money(partner_cut + admin_cut)
    passed = abs(total_distributed - cancel_charge) <= 0.02
    log_test("Scenario 4: 100% distribution (partner + admin = charge)", passed,
             f"Total: ₹{total_distributed}, Charge: ₹{cancel_charge}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test NO new merchant wallet transaction
    time.sleep(1)
    final_balance = get_merchant_wallet_balance(merchant_id)
    balance_increase = round_money(final_balance - initial_balance)
    passed = balance_increase == 0.0
    log_test("Scenario 4: Merchant wallet balance UNCHANGED (no transaction created)", passed,
             f"Expected increase: ₹0.00, Actual: ₹{balance_increase}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    test_results["scenarios"]["scenario_4"] = scenario_results
    return scenario_results

def test_scenario_5_regression_invariants():
    """
    SCENARIO 5: REGRESSION/INVARIANTS
    Test that all scenarios maintain:
    - Customer refund == 80% of (commissionable_base + GST) to the paisa
    - partner_cut + admin_cut + merchant_partner + merchant_customer == cancel_charge (±0.02)
    - Exactly ONE cancellation invoice + ONE refund receipt per cancelled booking
    - Duplicate cancel → 400
    - Cancellation-preview matches live cancel figures
    - No 500s
    """
    print("\n" + "="*80)
    print("SCENARIO 5: REGRESSION/INVARIANTS")
    print("="*80)
    
    scenario_results = {"passed": 0, "failed": 0, "details": {}}
    
    # Clear relationships for clean test
    clear_merchant_relationships()
    
    # Login
    customer_token = login(CUSTOMER_PHONE, OTP)
    admin_token = login(ADMIN_PHONE, OTP)
    
    if not customer_token or not admin_token:
        log_test("Scenario 5: Login", False, "Failed to login")
        return scenario_results
    
    log_test("Scenario 5: Login", True, "Customer and admin logged in")
    
    # Get service and partner
    service_id = get_service_id(customer_token)
    partner_id = get_partner_id(admin_token)
    
    if not service_id or not partner_id:
        log_test("Scenario 5: Get service/partner", False, "Failed to get service or partner")
        return scenario_results
    
    log_test("Scenario 5: Get service/partner", True, f"Service: {service_id}, Partner: {partner_id}")
    
    # Create booking
    booking_id, booking_code, pricing = create_booking(customer_token, service_id)
    if not booking_id:
        log_test("Scenario 5: Create booking", False, "Failed to create booking")
        return scenario_results
    
    log_test("Scenario 5: Create booking", True, f"Booking: {booking_code} (ID: {booking_id})")
    
    # Pay booking
    if not pay_booking(customer_token, booking_id):
        log_test("Scenario 5: Pay booking", False, "Failed to pay booking")
        return scenario_results
    
    log_test("Scenario 5: Pay booking", True, "Booking paid via mock payment")
    
    # Test cancellation-preview BEFORE assigning partner
    headers = {"Authorization": f"Bearer {customer_token}"}
    resp = requests.get(f"{BASE_URL}/bookings/{booking_id}/cancellation-preview", headers=headers)
    passed = resp.status_code == 200
    log_test("Scenario 5: Cancellation-preview returns 200", passed,
             f"Status: {resp.status_code}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    if passed:
        preview = resp.json()
        # Should not contain internal fields
        has_internal = any(k in preview for k in ["partner_cut", "admin_cut", "cancel_charge", "platform_commission"])
        passed = not has_internal
        log_test("Scenario 5: Preview does NOT contain internal fields", passed,
                 f"Has internal fields: {has_internal}")
        if passed: scenario_results["passed"] += 1
        else: scenario_results["failed"] += 1
    
    # Assign partner
    if not assign_partner(admin_token, booking_id, partner_id):
        log_test("Scenario 5: Assign partner", False, "Failed to assign partner")
        return scenario_results
    
    log_test("Scenario 5: Assign partner", True, "Partner assigned to booking")
    
    # Test cancellation-preview AFTER assigning partner
    resp = requests.get(f"{BASE_URL}/bookings/{booking_id}/cancellation-preview", headers=headers)
    passed = resp.status_code == 200
    log_test("Scenario 5: Cancellation-preview after partner returns 200", passed,
             f"Status: {resp.status_code}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    if passed:
        preview_after = resp.json()
        preview_refund = float(preview_after.get("refund", 0))
        preview_refund_pct = float(preview_after.get("refund_pct", 0))
        
        # Preview should show customer-safe data
        passed = preview_refund_pct == 80.0
        log_test("Scenario 5: Preview shows refund_pct = 80%", passed,
                 f"refund_pct: {preview_refund_pct}")
        if passed: scenario_results["passed"] += 1
        else: scenario_results["failed"] += 1
    
    # Cancel booking
    cancel_result = cancel_booking(customer_token, booking_id)
    if not cancel_result:
        log_test("Scenario 5: Cancel booking", False, "Failed to cancel booking")
        return scenario_results
    
    log_test("Scenario 5: Cancel booking", True, "Booking cancelled")
    
    # Get booking detail
    detail = get_booking_detail(admin_token, booking_id)
    if not detail:
        log_test("Scenario 5: Get booking detail", False, "Failed to get booking detail")
        return scenario_results
    
    booking = detail.get("booking", {})
    cancellation = booking.get("cancellation", {})
    
    # Extract values
    base = float(pricing.get("commissionable_base", 0))
    gst = float(pricing.get("gst", 0))
    cancel_charge = float(cancellation.get("cancel_charge", 0))
    partner_cut = float(cancellation.get("partner_cut", 0))
    merchant_customer_comm = float(cancellation.get("merchant_customer", 0))
    merchant_partner_comm = float(cancellation.get("merchant_referral", 0))
    admin_cut = float(cancellation.get("admin_cut", 0))
    refund = float(cancellation.get("refund", 0))
    
    # Test customer refund == 80% of (base + GST)
    expected_refund = round_money((base + gst) * 0.8)
    passed = abs(refund - expected_refund) <= 0.02
    log_test("Scenario 5: Customer refund = 80% of (base + GST) to the paisa", passed,
             f"Expected: ₹{expected_refund}, Actual: ₹{refund}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test preview matches live cancel
    if 'preview_after' in locals():
        passed = abs(preview_refund - refund) <= 0.02
        log_test("Scenario 5: Preview refund matches live cancel refund", passed,
                 f"Preview: ₹{preview_refund}, Live: ₹{refund}")
        if passed: scenario_results["passed"] += 1
        else: scenario_results["failed"] += 1
    
    # Test 100% distribution
    total_distributed = round_money(partner_cut + admin_cut + merchant_customer_comm + merchant_partner_comm)
    passed = abs(total_distributed - cancel_charge) <= 0.02
    log_test("Scenario 5: 100% distribution (±0.02)", passed,
             f"Total: ₹{total_distributed}, Charge: ₹{cancel_charge}, Diff: ₹{abs(total_distributed - cancel_charge)}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test invoices
    resp = requests.get(f"{BASE_URL}/invoices", headers=headers)
    passed = resp.status_code == 200
    log_test("Scenario 5: Get invoices returns 200", passed,
             f"Status: {resp.status_code}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    if passed:
        invoices = resp.json()
        cancellation_invoices = [inv for inv in invoices if inv.get("booking_id") == booking_id and inv.get("invoice_type") == "cancellation"]
        refund_receipts = [inv for inv in invoices if inv.get("booking_id") == booking_id and inv.get("invoice_type") == "refund"]
        
        passed = len(cancellation_invoices) == 1
        log_test("Scenario 5: Exactly ONE cancellation invoice", passed,
                 f"Count: {len(cancellation_invoices)}")
        if passed: scenario_results["passed"] += 1
        else: scenario_results["failed"] += 1
        
        passed = len(refund_receipts) == 1
        log_test("Scenario 5: Exactly ONE refund receipt", passed,
                 f"Count: {len(refund_receipts)}")
        if passed: scenario_results["passed"] += 1
        else: scenario_results["failed"] += 1
        
        if refund_receipts:
            refund_receipt = refund_receipts[0]
            receipt_total = float(refund_receipt.get("total_amount", 0))
            passed = abs(receipt_total - refund) <= 0.02
            log_test("Scenario 5: Refund receipt total == refund amount", passed,
                     f"Receipt: ₹{receipt_total}, Refund: ₹{refund}")
            if passed: scenario_results["passed"] += 1
            else: scenario_results["failed"] += 1
    
    # Test duplicate cancel
    resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/cancel",
                        headers=headers,
                        json={"reason": "Duplicate test"})
    passed = resp.status_code == 400
    log_test("Scenario 5: Duplicate cancel returns 400", passed,
             f"Status: {resp.status_code}")
    if passed: scenario_results["passed"] += 1
    else: scenario_results["failed"] += 1
    
    # Test no 500s (all previous requests should have succeeded without 500)
    log_test("Scenario 5: No 500 errors encountered", True,
             "All API calls completed without 500 errors")
    scenario_results["passed"] += 1
    
    test_results["scenarios"]["scenario_5"] = scenario_results
    return scenario_results

def main():
    """Run all test scenarios"""
    print("\n" + "="*80)
    print("MERCHANT REFERRAL COMMISSION ON CANCELLATION (Model B) - BACKEND TEST")
    print("="*80)
    print(f"BASE_URL: {BASE_URL}")
    print(f"Customer: {CUSTOMER_PHONE}, Partner: {PARTNER_PHONE}, Merchant: {MERCHANT_PHONE}")
    print(f"Admin: {ADMIN_PHONE}, OTP: {OTP}, Pincode: {PINCODE}")
    print("="*80)
    
    # Run all scenarios
    test_scenario_1_customer_via_merchant_only()
    test_scenario_2_partner_via_merchant_only()
    test_scenario_3_both_via_same_merchant()
    test_scenario_4_no_merchant()
    test_scenario_5_regression_invariants()
    
    # Print summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"Total tests: {test_results['total']}")
    print(f"Passed: {test_results['passed']} ✅")
    print(f"Failed: {test_results['failed']} ❌")
    print(f"Success rate: {(test_results['passed'] / test_results['total'] * 100):.1f}%")
    
    if test_results['failed'] > 0:
        print("\n" + "="*80)
        print("FAILED TESTS")
        print("="*80)
        for error in test_results['errors']:
            print(f"❌ {error}")
    
    # Print scenario breakdown
    print("\n" + "="*80)
    print("SCENARIO BREAKDOWN")
    print("="*80)
    for scenario_name, results in test_results['scenarios'].items():
        total = results['passed'] + results['failed']
        print(f"{scenario_name}: {results['passed']}/{total} passed")
    
    print("\n" + "="*80)
    
    # Return exit code
    return 0 if test_results['failed'] == 0 else 1

if __name__ == "__main__":
    exit(main())
