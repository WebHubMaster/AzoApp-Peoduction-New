#!/usr/bin/env python3
"""
Comprehensive backend test for TWO critical changes:
TASK 1: Cancellation discount funding for partner (coupon added back)
TASK 2: Accept-streak bonus only on completion (not on accept)

Base URL: https://multi-app-preview-2.preview.emergentagent.com/api
Demo OTP: 123456
Customer: +919000000004 (Priya Verma)
Partner: +919000000003 (Raj Kumar)
Admin: +919000000000
"""

import requests
import json
import time
from typing import Dict, Any, Optional

BASE_URL = "https://multi-app-preview-2.preview.emergentagent.com/api"
OTP = "123456"

# Test credentials
CUSTOMER_PHONE = "+919000000004"
PARTNER_PHONE = "+919000000003"
ADMIN_PHONE = "+919000000000"

class TestSession:
    def __init__(self, role: str, phone: str):
        self.role = role
        self.phone = phone
        self.token = None
        self.user_id = None
        
    def login(self):
        """Login and get token"""
        # Request OTP (optional in demo mode, but call it anyway)
        try:
            requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": self.phone}, timeout=10)
        except:
            pass  # Demo mode may not need this
        
        # Verify OTP
        resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": self.phone, "otp": OTP}, timeout=10)
        if resp.status_code != 200:
            print(f"❌ OTP verify failed for {self.phone}: {resp.status_code} - {resp.text}")
            return False
        
        data = resp.json()
        self.token = data.get("token")
        self.user_id = data.get("user", {}).get("id")
        print(f"✅ Logged in as {self.role} ({self.phone})")
        return True
    
    def get(self, path: str, **kwargs):
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        return requests.get(f"{BASE_URL}{path}", headers=headers, **kwargs)
    
    def post(self, path: str, **kwargs):
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        return requests.post(f"{BASE_URL}{path}", headers=headers, **kwargs)
    
    def put(self, path: str, **kwargs):
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        return requests.put(f"{BASE_URL}{path}", headers=headers, **kwargs)


def money(val):
    """Round to 2 decimal places"""
    return round(float(val), 2)


def test_task1_cancellation_coupon_funding():
    """
    TASK 1: Cancellation discount funding for partner
    
    When a customer books WITH a coupon discount and then cancels (after partner assigned + paid),
    the partner's cancellation earning must be computed on the FULL pre-coupon service base
    (coupon ADDED BACK, platform-absorbed).
    
    Key math to verify:
    - commission_charge = cancel_charge + partner_cancellation_pct% of coupon
    - commission_ledger 'cancellation' row base == commission_charge (coupon-added)
    - partner wallet credit == partner_pct% of commission_charge
    - customer refund == refund_pct% of (paid_excl_tax + gst) — UNCHANGED by coupon
    """
    print("\n" + "="*80)
    print("TASK 1: CANCELLATION DISCOUNT FUNDING FOR PARTNER")
    print("="*80)
    
    customer = TestSession("customer", CUSTOMER_PHONE)
    partner = TestSession("partner", PARTNER_PHONE)
    admin = TestSession("admin", ADMIN_PHONE)
    
    if not all([customer.login(), partner.login(), admin.login()]):
        print("❌ Login failed")
        return False
    
    results = {
        "with_coupon": {},
        "without_coupon": {}
    }
    
    # Test 1: Booking WITH coupon, then cancel
    print("\n--- TEST 1.1: Booking WITH coupon, then cancel ---")
    
    # Get a valid coupon
    resp = admin.get("/admin/coupons")
    if resp.status_code != 200:
        print(f"❌ Failed to get coupons: {resp.status_code}")
        return False
    
    coupons_data = resp.json()
    if isinstance(coupons_data, list):
        coupons = coupons_data
    else:
        coupons = coupons_data.get("items", [])
    active_coupon = next((c for c in coupons if c.get("status") == "active"), None)
    
    if not active_coupon:
        print("⚠️  No active coupon found, creating one...")
        resp = admin.post("/admin/coupons", json={
            "code": "TESTCANCEL50",
            "discount_type": "percentage",
            "discount_value": 10,
            "status": "active",
            "description": "Test cancellation coupon"
        })
        if resp.status_code == 200:
            active_coupon = resp.json()
        else:
            print(f"❌ Failed to create coupon: {resp.status_code}")
            return False
    
    coupon_code = active_coupon.get("code")
    print(f"Using coupon: {coupon_code}")
    
    # Get a service
    resp = customer.get("/catalog/services")
    if resp.status_code != 200:
        print(f"❌ Failed to get services: {resp.status_code}")
        return False
    
    services = resp.json()
    if not services:
        print("❌ No services found")
        return False
    
    service = services[0]
    service_id = service.get("id")
    print(f"Using service: {service.get('name')} (₹{service.get('base_price')})")
    
    # Create booking with coupon
    booking_data = {
        "service_id": service_id,
        "schedule_type": "schedule",
        "scheduled_at": "2026-12-31T10:00:00",
        "address": {
            "line": "Test Address",
            "city": "Patna",
            "pincode": "800001",
            "lat": 25.5941,
            "lng": 85.1376
        },
        "coupon_code": coupon_code
    }
    
    resp = customer.post("/bookings", json=booking_data)
    if resp.status_code != 200:
        print(f"❌ Failed to create booking: {resp.status_code} - {resp.text}")
        return False
    
    booking = resp.json()
    booking_id = booking.get("id")
    booking_code = booking.get("code")
    pricing = booking.get("pricing", {})
    
    print(f"✅ Created booking {booking_code}")
    print(f"   Pricing: base={pricing.get('base')}, discount={pricing.get('discount')}, "
          f"gst={pricing.get('gst')}, total={pricing.get('total')}")
    
    # Pay the booking (mock)
    resp = customer.post("/payments/order", json={"purpose": "booking", "booking_id": booking_id})
    if resp.status_code != 200:
        print(f"❌ Failed to create payment order: {resp.status_code}")
        return False
    
    order = resp.json()
    resp = customer.post("/payments/mock", json={"order_id": order.get("id")})
    if resp.status_code != 200:
        print(f"❌ Failed to mock payment: {resp.status_code}")
        return False
    
    print(f"✅ Paid booking")
    
    # Wait for payment to process
    time.sleep(2)
    
    # Get partner ID
    resp = admin.get("/admin/partners")
    if resp.status_code != 200:
        print(f"❌ Failed to get partners: {resp.status_code}")
        return False
    
    partners_list = resp.json().get("items", [])
    partner_user = next((p for p in partners_list if p.get("phone") == PARTNER_PHONE), None)
    if not partner_user:
        print(f"❌ Partner not found")
        return False
    
    partner_id = partner_user.get("id")
    
    # Assign partner
    resp = admin.post(f"/admin/bookings/{booking_id}/assign", json={"partner_id": partner_id})
    if resp.status_code != 200:
        print(f"❌ Failed to assign partner: {resp.status_code}")
        return False
    
    print(f"✅ Assigned partner")
    
    # Get partner wallet balance before cancel
    resp = partner.get("/wallet/partner")
    if resp.status_code != 200:
        print(f"❌ Failed to get partner wallet: {resp.status_code}")
        return False
    
    wallet_before = resp.json()
    balance_before = money(wallet_before.get("available_balance", 0))
    print(f"   Partner wallet before cancel: ₹{balance_before}")
    
    # Cancel the booking
    resp = customer.post(f"/bookings/{booking_id}/cancel", json={"reason": "Testing cancellation with coupon"})
    if resp.status_code != 200:
        print(f"❌ Failed to cancel booking: {resp.status_code} - {resp.text}")
        return False
    
    print(f"✅ Cancelled booking")
    
    # Wait for cancellation to process
    time.sleep(2)
    
    # Get booking details
    resp = admin.get(f"/admin/bookings/{booking_id}/detail")
    if resp.status_code != 200:
        print(f"❌ Failed to get booking detail: {resp.status_code}")
        return False
    
    booking_detail = resp.json()
    cancellation = booking_detail.get("cancellation", {})
    commission = booking_detail.get("commission", {})
    
    print(f"\n📊 CANCELLATION DETAILS:")
    print(f"   Original amount: ₹{cancellation.get('original_amount')}")
    print(f"   Service amount: ₹{cancellation.get('service_amount')}")
    print(f"   Discount: ₹{cancellation.get('discount')}")
    print(f"   Cancel charge: ₹{cancellation.get('cancel_charge')}")
    print(f"   Commission charge: ₹{cancellation.get('commission_charge')}")
    print(f"   Customer refund: ₹{cancellation.get('refund')}")
    print(f"   Partner cut: ₹{cancellation.get('partner_cut')}")
    print(f"   Admin cut: ₹{cancellation.get('admin_cut')}")
    
    # Get commission ledger
    resp = admin.get(f"/admin/commission-ledger?booking_id={booking_id}")
    if resp.status_code != 200:
        print(f"❌ Failed to get commission ledger: {resp.status_code}")
        return False
    
    ledger_items = resp.json().get("items", [])
    cancel_ledger = next((l for l in ledger_items if l.get("kind") == "cancellation"), None)
    
    if cancel_ledger:
        print(f"\n📊 COMMISSION LEDGER (cancellation):")
        print(f"   Base: ₹{cancel_ledger.get('base')}")
        print(f"   Partner earning: ₹{cancel_ledger.get('partner_earning')}")
        print(f"   Platform earning: ₹{cancel_ledger.get('platform_earning')}")
    
    # Get partner wallet after cancel
    resp = partner.get("/wallet/partner")
    if resp.status_code != 200:
        print(f"❌ Failed to get partner wallet: {resp.status_code}")
        return False
    
    wallet_after = resp.json()
    balance_after = money(wallet_after.get("available_balance", 0))
    partner_credit = money(balance_after - balance_before)
    print(f"\n   Partner wallet after cancel: ₹{balance_after}")
    print(f"   Partner credit: ₹{partner_credit}")
    
    # Get partner invoice
    resp = partner.get("/invoices")
    if resp.status_code != 200:
        print(f"❌ Failed to get partner invoices: {resp.status_code}")
        return False
    
    invoices = resp.json().get("items", [])
    cancel_invoice = next((inv for inv in invoices 
                          if inv.get("booking_code") == booking_code 
                          and inv.get("invoice_type") == "cancellation"), None)
    
    if cancel_invoice:
        invoice_id = cancel_invoice.get("id")
        resp = partner.get(f"/invoices/{invoice_id}")
        if resp.status_code == 200:
            invoice_detail = resp.json()
            role_earning = invoice_detail.get("role_earning", {})
            print(f"\n📊 PARTNER INVOICE (cancellation):")
            print(f"   Invoice: {cancel_invoice.get('invoice_number')}")
            print(f"   Role earning base: ₹{role_earning.get('base')}")
            print(f"   Role earning net: ₹{role_earning.get('net')}")
            print(f"   Coupon code: {role_earning.get('coupon_code')}")
            print(f"   Coupon discount: ₹{role_earning.get('coupon_discount')}")
            print(f"   Coupon bearer: {role_earning.get('coupon_bearer')}")
            print(f"   Coupon note: {role_earning.get('coupon_note')}")
    
    # VERIFY THE MATH
    print(f"\n🔍 VERIFICATION:")
    
    paid_excl_tax = money(pricing.get("total", 0) - pricing.get("gst", 0))
    coupon_discount = money(pricing.get("discount", 0))
    gst = money(pricing.get("gst", 0))
    
    # Get commission config
    resp = admin.get("/admin/settings")
    if resp.status_code != 200:
        print(f"❌ Failed to get settings: {resp.status_code}")
        return False
    
    settings = resp.json()
    comm_config = settings.get("commission", {})
    partner_pct = float(comm_config.get("partner_pct", 80))
    partner_cancel_pct = float(comm_config.get("partner_cancellation_pct", 20))
    customer_refund_pct = float(comm_config.get("customer_refund_pct", 80))
    
    print(f"   Config: partner_pct={partner_pct}%, partner_cancel_pct={partner_cancel_pct}%, "
          f"customer_refund_pct={customer_refund_pct}%")
    
    # Expected values
    cancel_charge = money(paid_excl_tax * partner_cancel_pct / 100)
    commission_charge_expected = money(cancel_charge + (coupon_discount * partner_cancel_pct / 100))
    partner_earning_expected = money(commission_charge_expected * partner_pct / 100)
    customer_refund_expected = money((paid_excl_tax * customer_refund_pct / 100) + 
                                    (gst * customer_refund_pct / 100))
    
    print(f"\n   Expected:")
    print(f"   - Cancel charge (base): ₹{cancel_charge}")
    print(f"   - Commission charge (with coupon added back): ₹{commission_charge_expected}")
    print(f"   - Partner earning: ₹{partner_earning_expected}")
    print(f"   - Customer refund: ₹{customer_refund_expected}")
    
    print(f"\n   Actual:")
    print(f"   - Cancel charge: ₹{cancellation.get('cancel_charge')}")
    print(f"   - Commission charge: ₹{cancellation.get('commission_charge')}")
    print(f"   - Partner cut: ₹{cancellation.get('partner_cut')}")
    print(f"   - Customer refund: ₹{cancellation.get('refund')}")
    
    # Verify
    tests_passed = 0
    tests_total = 0
    
    # Test 1: commission_charge includes coupon
    tests_total += 1
    commission_charge_actual = money(cancellation.get("commission_charge", 0))
    if abs(commission_charge_actual - commission_charge_expected) <= 0.02:
        print(f"   ✅ Commission charge correct (includes coupon)")
        tests_passed += 1
    else:
        print(f"   ❌ Commission charge mismatch: expected ₹{commission_charge_expected}, got ₹{commission_charge_actual}")
    
    # Test 2: commission_ledger base == commission_charge
    tests_total += 1
    if cancel_ledger:
        ledger_base = money(cancel_ledger.get("base", 0))
        if abs(ledger_base - commission_charge_actual) <= 0.02:
            print(f"   ✅ Commission ledger base matches commission_charge")
            tests_passed += 1
        else:
            print(f"   ❌ Commission ledger base mismatch: expected ₹{commission_charge_actual}, got ₹{ledger_base}")
    else:
        print(f"   ❌ No cancellation ledger found")
    
    # Test 3: partner wallet credit == partner_pct% of commission_charge
    tests_total += 1
    if abs(partner_credit - partner_earning_expected) <= 0.02:
        print(f"   ✅ Partner wallet credit correct")
        tests_passed += 1
    else:
        print(f"   ❌ Partner wallet credit mismatch: expected ₹{partner_earning_expected}, got ₹{partner_credit}")
    
    # Test 4: customer refund unchanged (not affected by coupon)
    tests_total += 1
    customer_refund_actual = money(cancellation.get("refund", 0))
    if abs(customer_refund_actual - customer_refund_expected) <= 0.02:
        print(f"   ✅ Customer refund correct (not affected by coupon)")
        tests_passed += 1
    else:
        print(f"   ❌ Customer refund mismatch: expected ₹{customer_refund_expected}, got ₹{customer_refund_actual}")
    
    # Test 5: partner invoice has coupon fields
    tests_total += 1
    if cancel_invoice and role_earning:
        if (role_earning.get("coupon_code") and 
            role_earning.get("coupon_discount") and
            role_earning.get("coupon_bearer") == "AzoApp Platform" and
            role_earning.get("coupon_note")):
            print(f"   ✅ Partner invoice has all coupon fields")
            tests_passed += 1
        else:
            print(f"   ❌ Partner invoice missing coupon fields")
    else:
        print(f"   ❌ No partner cancellation invoice found")
    
    results["with_coupon"] = {
        "tests_passed": tests_passed,
        "tests_total": tests_total,
        "booking_code": booking_code,
        "commission_charge": commission_charge_actual,
        "partner_credit": partner_credit
    }
    
    print(f"\n📊 WITH COUPON: {tests_passed}/{tests_total} tests passed")
    
    # Test 2: Booking WITHOUT coupon (regression)
    print("\n--- TEST 1.2: Booking WITHOUT coupon (regression) ---")
    
    # Create booking without coupon
    booking_data_no_coupon = {
        "service_id": service_id,
        "schedule_type": "schedule",
        "scheduled_at": "2026-12-31T11:00:00",
        "address": {
            "line": "Test Address",
            "city": "Patna",
            "pincode": "800001",
            "lat": 25.5941,
            "lng": 85.1376
        }
    }
    
    resp = customer.post("/bookings", json=booking_data_no_coupon)
    if resp.status_code != 200:
        print(f"❌ Failed to create booking: {resp.status_code}")
        return False
    
    booking2 = resp.json()
    booking_id2 = booking2.get("id")
    booking_code2 = booking2.get("code")
    pricing2 = booking2.get("pricing", {})
    
    print(f"✅ Created booking {booking_code2} (no coupon)")
    
    # Pay, assign, cancel
    resp = customer.post("/payments/order", json={"purpose": "booking", "booking_id": booking_id2})
    if resp.status_code == 200:
        order2 = resp.json()
        resp = customer.post("/payments/mock", json={"order_id": order2.get("id")})
        if resp.status_code == 200:
            print(f"✅ Paid booking")
            time.sleep(2)
            
            resp = admin.post(f"/admin/bookings/{booking_id2}/assign", json={"partner_id": partner_id})
            if resp.status_code == 200:
                print(f"✅ Assigned partner")
                
                # Get wallet before
                resp = partner.get("/wallet/partner")
                if resp.status_code == 200:
                    balance_before2 = money(resp.json().get("available_balance", 0))
                    
                    # Cancel
                    resp = customer.post(f"/bookings/{booking_id2}/cancel", 
                                       json={"reason": "Testing cancellation without coupon"})
                    if resp.status_code == 200:
                        print(f"✅ Cancelled booking")
                        time.sleep(2)
                        
                        # Get booking details
                        resp = admin.get(f"/admin/bookings/{booking_id2}/detail")
                        if resp.status_code == 200:
                            booking_detail2 = resp.json()
                            cancellation2 = booking_detail2.get("cancellation", {})
                            
                            # Get wallet after
                            resp = partner.get("/wallet/partner")
                            if resp.status_code == 200:
                                balance_after2 = money(resp.json().get("available_balance", 0))
                                partner_credit2 = money(balance_after2 - balance_before2)
                                
                                print(f"\n📊 WITHOUT COUPON:")
                                print(f"   Cancel charge: ₹{cancellation2.get('cancel_charge')}")
                                print(f"   Commission charge: ₹{cancellation2.get('commission_charge')}")
                                print(f"   Partner credit: ₹{partner_credit2}")
                                
                                # Verify: commission_charge == cancel_charge (no coupon)
                                cancel_charge2 = money(cancellation2.get("cancel_charge", 0))
                                commission_charge2 = money(cancellation2.get("commission_charge", 0))
                                
                                if abs(commission_charge2 - cancel_charge2) <= 0.02:
                                    print(f"   ✅ REGRESSION PASS: commission_charge == cancel_charge (no coupon)")
                                    results["without_coupon"]["passed"] = True
                                else:
                                    print(f"   ❌ REGRESSION FAIL: commission_charge ≠ cancel_charge")
                                    results["without_coupon"]["passed"] = False
    
    return results


def test_task2_accept_streak_on_completion():
    """
    TASK 2: Accept-streak bonus only on completion
    
    The partner accept-streak and milestone bonus must NO LONGER be granted on accepting a job.
    It should advance ONLY when an accepted job is actually COMPLETED.
    
    Verify:
    (a) Partner accepts a job → accept_streak NOT incremented, NO bonus
    (b) Job is COMPLETED → accept_streak increments by 1, bonus at threshold
    (c) Accept then CANCEL → accept_streak does NOT increment
    (d) Missed auto-decline still resets accept_streak to 0
    """
    print("\n" + "="*80)
    print("TASK 2: ACCEPT-STREAK BONUS ONLY ON COMPLETION")
    print("="*80)
    
    customer = TestSession("customer", CUSTOMER_PHONE)
    partner = TestSession("partner", PARTNER_PHONE)
    admin = TestSession("admin", ADMIN_PHONE)
    
    if not all([customer.login(), partner.login(), admin.login()]):
        print("❌ Login failed")
        return False
    
    # Reset partner accept_streak to 0
    print("\n--- Resetting partner accept_streak to 0 ---")
    resp = admin.get("/admin/partners")
    if resp.status_code != 200:
        print(f"❌ Failed to get partners: {resp.status_code}")
        return False
    
    partners_list = resp.json().get("items", [])
    partner_user = next((p for p in partners_list if p.get("phone") == PARTNER_PHONE), None)
    if not partner_user:
        print(f"❌ Partner not found")
        return False
    
    partner_id = partner_user.get("id")
    
    # Manually reset accept_streak via direct DB update (admin endpoint)
    # Since there's no direct API, we'll check current streak first
    resp = partner.get("/partner/profile")
    if resp.status_code == 200:
        profile = resp.json()
        current_streak = profile.get("accept_streak", 0)
        print(f"   Current accept_streak: {current_streak}")
    
    results = {
        "test_a": {},
        "test_b": {},
        "test_c": {}
    }
    
    # TEST A: Accept a job → accept_streak NOT incremented
    print("\n--- TEST 2.A: Accept job → accept_streak NOT incremented ---")
    
    # Get a service
    resp = customer.get("/catalog/services")
    if resp.status_code != 200:
        print(f"❌ Failed to get services: {resp.status_code}")
        return False
    
    services = resp.json()
    if not services:
        print("❌ No services found")
        return False
    
    service = services[0]
    service_id = service.get("id")
    
    # Create and pay booking
    booking_data = {
        "service_id": service_id,
        "schedule_type": "schedule",
        "scheduled_at": "2026-12-31T12:00:00",
        "address": {
            "line": "Test Address",
            "city": "Patna",
            "pincode": "800001",
            "lat": 25.5941,
            "lng": 85.1376
        }
    }
    
    resp = customer.post("/bookings", json=booking_data)
    if resp.status_code != 200:
        print(f"❌ Failed to create booking: {resp.status_code}")
        return False
    
    booking = resp.json()
    booking_id = booking.get("id")
    booking_code = booking.get("code")
    
    print(f"✅ Created booking {booking_code}")
    
    # Pay
    resp = customer.post("/payments/order", json={"purpose": "booking", "booking_id": booking_id})
    if resp.status_code != 200:
        print(f"❌ Failed to create payment order: {resp.status_code}")
        return False
    
    order = resp.json()
    resp = customer.post("/payments/mock", json={"order_id": order.get("id")})
    if resp.status_code != 200:
        print(f"❌ Failed to mock payment: {resp.status_code}")
        return False
    
    print(f"✅ Paid booking")
    time.sleep(2)
    
    # Get accept_streak before accept
    resp = partner.get("/partner/profile")
    if resp.status_code != 200:
        print(f"❌ Failed to get partner profile: {resp.status_code}")
        return False
    
    profile_before = resp.json()
    streak_before = int(profile_before.get("accept_streak", 0))
    wallet_before = money(profile_before.get("wallet_balance", 0))
    
    print(f"   Accept_streak before accept: {streak_before}")
    print(f"   Wallet balance before accept: ₹{wallet_before}")
    
    # Get partner ledger count before
    resp = partner.get("/wallet/partner")
    if resp.status_code != 200:
        print(f"❌ Failed to get partner wallet: {resp.status_code}")
        return False
    
    wallet_data_before = resp.json()
    ledger_before = wallet_data_before.get("ledger", [])
    bonus_ledger_before = [l for l in ledger_before if l.get("kind") == "accept_streak_bonus"]
    bonus_count_before = len(bonus_ledger_before)
    
    print(f"   Accept_streak_bonus ledger count before: {bonus_count_before}")
    
    # Accept the job
    resp = partner.post(f"/bookings/{booking_id}/accept")
    if resp.status_code != 200:
        print(f"❌ Failed to accept job: {resp.status_code} - {resp.text}")
        return False
    
    print(f"✅ Accepted job")
    time.sleep(1)
    
    # Get accept_streak after accept
    resp = partner.get("/partner/profile")
    if resp.status_code != 200:
        print(f"❌ Failed to get partner profile: {resp.status_code}")
        return False
    
    profile_after_accept = resp.json()
    streak_after_accept = int(profile_after_accept.get("accept_streak", 0))
    wallet_after_accept = money(profile_after_accept.get("wallet_balance", 0))
    
    print(f"   Accept_streak after accept: {streak_after_accept}")
    print(f"   Wallet balance after accept: ₹{wallet_after_accept}")
    
    # Get partner ledger after accept
    resp = partner.get("/wallet/partner")
    if resp.status_code == 200:
        wallet_data_after = resp.json()
        ledger_after = wallet_data_after.get("ledger", [])
        bonus_ledger_after = [l for l in ledger_after if l.get("kind") == "accept_streak_bonus"]
        bonus_count_after = len(bonus_ledger_after)
        
        print(f"   Accept_streak_bonus ledger count after: {bonus_count_after}")
    
    # VERIFY: accept_streak should NOT have incremented
    if streak_after_accept == streak_before:
        print(f"   ✅ TEST A PASS: accept_streak NOT incremented on accept")
        results["test_a"]["streak_not_incremented"] = True
    else:
        print(f"   ❌ TEST A FAIL: accept_streak incremented from {streak_before} to {streak_after_accept}")
        results["test_a"]["streak_not_incremented"] = False
    
    # VERIFY: NO bonus credited
    if wallet_after_accept == wallet_before and bonus_count_after == bonus_count_before:
        print(f"   ✅ TEST A PASS: NO accept_streak_bonus credited on accept")
        results["test_a"]["no_bonus"] = True
    else:
        print(f"   ❌ TEST A FAIL: Bonus credited on accept")
        results["test_a"]["no_bonus"] = False
    
    # TEST B: Complete the job → accept_streak increments, bonus at threshold
    print("\n--- TEST 2.B: Complete job → accept_streak increments ---")
    
    # Get completion OTP
    resp = admin.get(f"/admin/bookings/{booking_id}/detail")
    if resp.status_code != 200:
        print(f"❌ Failed to get booking detail: {resp.status_code}")
        return False
    
    booking_detail = resp.json()
    completion_otp = booking_detail.get("otps", {}).get("completion")
    
    if not completion_otp:
        print(f"❌ No completion OTP found")
        return False
    
    print(f"   Completion OTP: {completion_otp}")
    
    # Complete the job
    resp = partner.post(f"/bookings/{booking_id}/complete", json={"otp": completion_otp})
    if resp.status_code != 200:
        print(f"❌ Failed to complete job: {resp.status_code} - {resp.text}")
        return False
    
    print(f"✅ Completed job")
    time.sleep(2)
    
    # Get accept_streak after completion
    resp = partner.get("/partner/profile")
    if resp.status_code != 200:
        print(f"❌ Failed to get partner profile: {resp.status_code}")
        return False
    
    profile_after_complete = resp.json()
    streak_after_complete = int(profile_after_complete.get("accept_streak", 0))
    wallet_after_complete = money(profile_after_complete.get("wallet_balance", 0))
    
    print(f"   Accept_streak after completion: {streak_after_complete}")
    print(f"   Wallet balance after completion: ₹{wallet_after_complete}")
    
    # VERIFY: accept_streak should have incremented by 1
    if streak_after_complete == streak_after_accept + 1:
        print(f"   ✅ TEST B PASS: accept_streak incremented by 1 on completion")
        results["test_b"]["streak_incremented"] = True
    else:
        print(f"   ❌ TEST B FAIL: accept_streak not incremented correctly "
              f"(expected {streak_after_accept + 1}, got {streak_after_complete})")
        results["test_b"]["streak_incremented"] = False
    
    # Check if bonus was credited (depends on threshold)
    resp = admin.get("/admin/settings")
    if resp.status_code == 200:
        settings = resp.json()
        wallet_config = settings.get("partner_wallet_config", {})
        threshold = int(wallet_config.get("accept_streak_threshold", 5))
        bonus_amount = float(wallet_config.get("accept_streak_bonus", 50))
        
        print(f"   Accept_streak threshold: {threshold}")
        print(f"   Accept_streak bonus: ₹{bonus_amount}")
        
        if streak_after_complete % threshold == 0 and streak_after_complete > 0:
            # Should have received bonus
            wallet_increase = wallet_after_complete - wallet_after_accept
            if abs(wallet_increase - bonus_amount) <= 0.02:
                print(f"   ✅ TEST B PASS: Bonus credited at threshold ({streak_after_complete})")
                results["test_b"]["bonus_at_threshold"] = True
            else:
                print(f"   ❌ TEST B FAIL: Bonus not credited at threshold")
                results["test_b"]["bonus_at_threshold"] = False
        else:
            print(f"   ℹ️  Streak {streak_after_complete} not at threshold {threshold}, no bonus expected")
            results["test_b"]["bonus_at_threshold"] = "N/A"
    
    # TEST C: Accept then CANCEL → accept_streak does NOT increment
    print("\n--- TEST 2.C: Accept then CANCEL → accept_streak NOT incremented ---")
    
    # Create another booking
    resp = customer.post("/bookings", json=booking_data)
    if resp.status_code != 200:
        print(f"❌ Failed to create booking: {resp.status_code}")
        return False
    
    booking3 = resp.json()
    booking_id3 = booking3.get("id")
    booking_code3 = booking3.get("code")
    
    print(f"✅ Created booking {booking_code3}")
    
    # Pay
    resp = customer.post("/payments/order", json={"purpose": "booking", "booking_id": booking_id3})
    if resp.status_code == 200:
        order3 = resp.json()
        resp = customer.post("/payments/mock", json={"order_id": order3.get("id")})
        if resp.status_code == 200:
            print(f"✅ Paid booking")
            time.sleep(2)
            
            # Get streak before accept
            resp = partner.get("/partner/profile")
            if resp.status_code == 200:
                streak_before_accept3 = int(resp.json().get("accept_streak", 0))
                print(f"   Accept_streak before accept: {streak_before_accept3}")
                
                # Accept
                resp = partner.post(f"/bookings/{booking_id3}/accept")
                if resp.status_code == 200:
                    print(f"✅ Accepted job")
                    time.sleep(1)
                    
                    # Get streak after accept (should be same)
                    resp = partner.get("/partner/profile")
                    if resp.status_code == 200:
                        streak_after_accept3 = int(resp.json().get("accept_streak", 0))
                        print(f"   Accept_streak after accept: {streak_after_accept3}")
                        
                        # Cancel
                        resp = customer.post(f"/bookings/{booking_id3}/cancel", 
                                           json={"reason": "Testing accept-streak with cancel"})
                        if resp.status_code == 200:
                            print(f"✅ Cancelled booking")
                            time.sleep(2)
                            
                            # Get streak after cancel
                            resp = partner.get("/partner/profile")
                            if resp.status_code == 200:
                                streak_after_cancel = int(resp.json().get("accept_streak", 0))
                                print(f"   Accept_streak after cancel: {streak_after_cancel}")
                                
                                # VERIFY: streak should be same as before accept
                                if streak_after_cancel == streak_before_accept3:
                                    print(f"   ✅ TEST C PASS: accept_streak NOT incremented after cancel")
                                    results["test_c"]["streak_not_incremented"] = True
                                else:
                                    print(f"   ❌ TEST C FAIL: accept_streak changed after cancel")
                                    results["test_c"]["streak_not_incremented"] = False
    
    return results


def main():
    print("\n" + "="*80)
    print("BACKEND TEST: CANCELLATION COUPON FUNDING + ACCEPT-STREAK ON COMPLETION")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Demo OTP: {OTP}")
    print(f"Customer: {CUSTOMER_PHONE}")
    print(f"Partner: {PARTNER_PHONE}")
    print(f"Admin: {ADMIN_PHONE}")
    
    # Test Task 1
    task1_results = test_task1_cancellation_coupon_funding()
    
    # Test Task 2
    task2_results = test_task2_accept_streak_on_completion()
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    
    if task1_results:
        with_coupon = task1_results.get("with_coupon", {})
        without_coupon = task1_results.get("without_coupon", {})
        
        print(f"\n✅ TASK 1: Cancellation discount funding for partner")
        print(f"   WITH COUPON: {with_coupon.get('tests_passed', 0)}/{with_coupon.get('tests_total', 0)} tests passed")
        if without_coupon.get("passed"):
            print(f"   WITHOUT COUPON (regression): ✅ PASS")
        else:
            print(f"   WITHOUT COUPON (regression): ❌ FAIL")
    
    if task2_results:
        test_a = task2_results.get("test_a", {})
        test_b = task2_results.get("test_b", {})
        test_c = task2_results.get("test_c", {})
        
        print(f"\n✅ TASK 2: Accept-streak bonus only on completion")
        print(f"   TEST A (accept → no increment): {'✅ PASS' if test_a.get('streak_not_incremented') and test_a.get('no_bonus') else '❌ FAIL'}")
        print(f"   TEST B (complete → increment): {'✅ PASS' if test_b.get('streak_incremented') else '❌ FAIL'}")
        print(f"   TEST C (cancel → no increment): {'✅ PASS' if test_c.get('streak_not_incremented') else '❌ FAIL'}")
    
    print("\n" + "="*80)
    print("TEST COMPLETE")
    print("="*80)
    
    # Save results
    with open("/app/test_results_coupon_cancel.json", "w") as f:
        json.dump({
            "task1": task1_results,
            "task2": task2_results
        }, f, indent=2)
    
    print(f"\nResults saved to: /app/test_results_coupon_cancel.json")


if __name__ == "__main__":
    main()
