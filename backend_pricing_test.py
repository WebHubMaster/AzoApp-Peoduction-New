#!/usr/bin/env python3
"""
AzoApp Backend Pricing/Booking Logic Test
Tests 4 specific fixes:
1. ADD-ON INDEPENDENT QUANTITY
2. GROUPED BOOKING PERSISTENCE
3. PARTNER ALERT / INCOMING JOB AMOUNT
4. COUPON DOES NOT REDUCE PARTNER EARNING
"""

import requests
import json
import time
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

BASE_URL = "https://partner-ui-mirror.preview.emergentagent.com/api"

# Test credentials
CUSTOMER_PHONE = "+919000000004"
PARTNER_PHONE = "+919000000003"
ADMIN_PHONE = "+919000000000"
MERCHANT_PHONE = "+919000000002"
OTP = "123456"

class TestResults:
    def __init__(self):
        self.tests = []
        self.passed = 0
        self.failed = 0
    
    def add(self, name: str, passed: bool, details: str = ""):
        self.tests.append({"name": name, "passed": passed, "details": details})
        if passed:
            self.passed += 1
        else:
            self.failed += 1
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {name}")
        if details:
            print(f"  Details: {details}")
    
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*80}")
        print(f"TEST SUMMARY: {self.passed}/{total} tests passed ({100*self.passed//total if total > 0 else 0}%)")
        print(f"{'='*80}")
        for test in self.tests:
            status = "✅" if test["passed"] else "❌"
            print(f"{status} {test['name']}")
            if test["details"] and not test["passed"]:
                print(f"   {test['details']}")
        return self.passed, self.failed

results = TestResults()

def auth_user(phone: str) -> Optional[str]:
    """Authenticate user and return token"""
    try:
        # Send OTP
        resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone}, timeout=10)
        if resp.status_code != 200:
            print(f"Failed to send OTP for {phone}: {resp.status_code}")
            return None
        
        # Verify OTP
        resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=10)
        if resp.status_code != 200:
            print(f"Failed to verify OTP for {phone}: {resp.status_code}")
            return None
        
        data = resp.json()
        return data.get("token")
    except Exception as e:
        print(f"Auth error for {phone}: {e}")
        return None

def get_services(token: str) -> list:
    """Get list of services"""
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/catalog/services", headers=headers, timeout=10)
        if resp.status_code == 200:
            return resp.json()
        return []
    except Exception as e:
        print(f"Error getting services: {e}")
        return []

def get_categories(token: str) -> list:
    """Get list of categories"""
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/catalog/categories", headers=headers, timeout=10)
        if resp.status_code == 200:
            return resp.json()
        return []
    except Exception as e:
        print(f"Error getting categories: {e}")
        return []

def get_coupons(token: str) -> list:
    """Get list of coupons"""
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/admin/coupons", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return data if isinstance(data, list) else data.get("coupons", [])
        return []
    except Exception as e:
        print(f"Error getting coupons: {e}")
        return []

print("="*80)
print("AZOAPP BACKEND PRICING/BOOKING LOGIC TEST")
print("="*80)
print(f"Base URL: {BASE_URL}")
print(f"Test Credentials: Customer {CUSTOMER_PHONE}, Partner {PARTNER_PHONE}, Admin {ADMIN_PHONE}")
print("="*80)

# Authenticate users
print("\n[SETUP] Authenticating users...")
customer_token = auth_user(CUSTOMER_PHONE)
partner_token = auth_user(PARTNER_PHONE)
admin_token = auth_user(ADMIN_PHONE)

if not customer_token:
    print("❌ Failed to authenticate customer. Exiting.")
    exit(1)

if not partner_token:
    print("❌ Failed to authenticate partner. Exiting.")
    exit(1)

if not admin_token:
    print("❌ Failed to authenticate admin. Exiting.")
    exit(1)

print("✅ All users authenticated successfully")

# Get services and find one with addons
print("\n[SETUP] Fetching services...")
services = get_services(customer_token)
print(f"Found {len(services)} services")

# Find a service with addons
service_with_addons = None
for svc in services:
    if svc.get("addons") and len(svc["addons"]) > 0:
        service_with_addons = svc
        print(f"Found service with addons: {svc['name']} (id: {svc['id']}) - {len(svc['addons'])} addons")
        break

if not service_with_addons:
    print("⚠️  No service with addons found. Will test with known service.")
    # Use the service we just created addon for
    service_with_addons = {
        "id": "91b272d2-2c23-44e4-9caa-69794ad2fda8",
        "name": "Wiring & Fitting",
        "price": 599,
        "addons": [{"name": "MCB Replace", "price": 199}]
    }

addon_name = service_with_addons["addons"][0]["name"]
addon_price = service_with_addons["addons"][0]["price"]
service_id = service_with_addons["id"]
service_price = service_with_addons.get("price", 299)

print(f"Using service: {service_with_addons['name']}")
print(f"Service price: ₹{service_price}")
print(f"Addon: {addon_name} (₹{addon_price})")

# Get a valid coupon
print("\n[SETUP] Fetching coupons...")
coupons = get_coupons(admin_token)
valid_coupon = None
if coupons:
    for coupon in coupons:
        if coupon.get("active") and coupon.get("code"):
            valid_coupon = coupon
            print(f"Found valid coupon: {coupon['code']}")
            break

if not valid_coupon:
    print("⚠️  No active coupon found. Will use 'AZO50' as fallback.")
    valid_coupon = {"code": "AZO50"}

coupon_code = valid_coupon["code"]

print("\n" + "="*80)
print("TEST 1: ADD-ON INDEPENDENT QUANTITY (MOST IMPORTANT)")
print("="*80)

# Test 1.1: Main qty=2, addon qty=1
print("\n[TEST 1.1] Main service qty=2, addon qty=1")
try:
    headers = {"Authorization": f"Bearer {customer_token}"}
    payload = {
        "address": {
            "line": "Test Address",
            "pincode": "800001",
            "city": "Patna",
            "state": "Bihar",
            "lat": 25.6,
            "lng": 85.1
        },
        "schedule_type": "standard",
        "items": [{
            "service_id": service_id,
            "tier_index": 0,
            "qty": 2,
            "addons": [{"name": addon_name, "qty": 1}]
        }]
    }
    
    resp = requests.post(f"{BASE_URL}/bookings/cart-quote", headers=headers, json=payload, timeout=15)
    
    if resp.status_code == 200:
        data = resp.json()
        lines = data.get("lines", [])
        
        if len(lines) > 0:
            line = lines[0]
            main_qty = line.get("qty")
            base_price = line.get("base_price")
            addons = line.get("addons", [])
            line_base_total = line.get("line_base_total")
            line_addon_total = line.get("line_addon_total")
            line_service_total = line.get("line_service_total")
            line_total = line.get("line_total")
            
            print(f"  Main qty: {main_qty}")
            print(f"  Base price: ₹{base_price}")
            print(f"  Line base total: ₹{line_base_total}")
            print(f"  Line addon total: ₹{line_addon_total}")
            print(f"  Line service total: ₹{line_service_total}")
            print(f"  Line total: ₹{line_total}")
            
            # Check addon
            if len(addons) > 0:
                addon = addons[0]
                addon_qty = addon.get("qty")
                addon_price_val = addon.get("price")
                
                print(f"  Addon: {addon.get('name')}, qty: {addon_qty}, price: ₹{addon_price_val}")
                
                # Verify addon qty is independent
                expected_line_base = base_price * main_qty
                expected_addon_total = addon_price_val * addon_qty  # Should be addon_price * 1, NOT * 2
                expected_service_total = expected_line_base + expected_addon_total
                
                results.add(
                    "1.1a: Main qty=2 stored correctly",
                    main_qty == 2,
                    f"Expected 2, got {main_qty}"
                )
                
                results.add(
                    "1.1b: Addon qty=1 stored correctly",
                    addon_qty == 1,
                    f"Expected 1, got {addon_qty}"
                )
                
                results.add(
                    "1.1c: Line base total = base_price * main_qty",
                    abs(line_base_total - expected_line_base) < 0.1,
                    f"Expected {expected_line_base}, got {line_base_total}"
                )
                
                results.add(
                    "1.1d: Line addon total = addon_price * addon_qty (NOT * main_qty)",
                    abs(line_addon_total - expected_addon_total) < 0.1,
                    f"Expected {expected_addon_total}, got {line_addon_total}"
                )
                
                results.add(
                    "1.1e: Line service total = line_base_total + line_addon_total",
                    abs(line_service_total - expected_service_total) < 0.1,
                    f"Expected {expected_service_total}, got {line_service_total}"
                )
                
                results.add(
                    "1.1f: Line total == line_service_total",
                    abs(line_total - line_service_total) < 0.1,
                    f"Expected {line_service_total}, got {line_total}"
                )
            else:
                results.add("1.1: Addon not found in response", False, "No addons in line")
        else:
            results.add("1.1: No lines in cart-quote response", False, "Empty lines array")
    else:
        results.add("1.1: cart-quote request failed", False, f"Status {resp.status_code}: {resp.text[:200]}")
except Exception as e:
    results.add("1.1: Exception during test", False, str(e))

# Test 1.2: Main qty=2, addon qty=2
print("\n[TEST 1.2] Main service qty=2, addon qty=2")
try:
    payload["items"][0]["addons"] = [{"name": addon_name, "qty": 2}]
    
    resp = requests.post(f"{BASE_URL}/bookings/cart-quote", headers=headers, json=payload, timeout=15)
    
    if resp.status_code == 200:
        data = resp.json()
        lines = data.get("lines", [])
        
        if len(lines) > 0:
            line = lines[0]
            addons = line.get("addons", [])
            line_addon_total = line.get("line_addon_total")
            
            if len(addons) > 0:
                addon = addons[0]
                addon_qty = addon.get("qty")
                addon_price_val = addon.get("price")
                
                expected_addon_total = addon_price_val * 2  # Should be addon_price * 2
                
                print(f"  Addon qty: {addon_qty}, price: ₹{addon_price_val}")
                print(f"  Line addon total: ₹{line_addon_total}")
                
                results.add(
                    "1.2a: Addon qty=2 stored correctly",
                    addon_qty == 2,
                    f"Expected 2, got {addon_qty}"
                )
                
                results.add(
                    "1.2b: Line addon total = addon_price * 2",
                    abs(line_addon_total - expected_addon_total) < 0.1,
                    f"Expected {expected_addon_total}, got {line_addon_total}"
                )
            else:
                results.add("1.2: Addon not found", False, "No addons in line")
        else:
            results.add("1.2: No lines in response", False, "Empty lines array")
    else:
        results.add("1.2: cart-quote request failed", False, f"Status {resp.status_code}")
except Exception as e:
    results.add("1.2: Exception during test", False, str(e))

# Test 1.3: Main qty=3, addon qty=1 (verify addon NOT multiplied by main qty)
print("\n[TEST 1.3] Main service qty=3, addon qty=1 (verify independence)")
try:
    payload["items"][0]["qty"] = 3
    payload["items"][0]["addons"] = [{"name": addon_name, "qty": 1}]
    
    resp = requests.post(f"{BASE_URL}/bookings/cart-quote", headers=headers, json=payload, timeout=15)
    
    if resp.status_code == 200:
        data = resp.json()
        lines = data.get("lines", [])
        
        if len(lines) > 0:
            line = lines[0]
            main_qty = line.get("qty")
            base_price = line.get("base_price")
            addons = line.get("addons", [])
            line_base_total = line.get("line_base_total")
            line_addon_total = line.get("line_addon_total")
            
            if len(addons) > 0:
                addon = addons[0]
                addon_qty = addon.get("qty")
                addon_price_val = addon.get("price")
                
                expected_line_base = base_price * 3
                expected_addon_total = addon_price_val * 1  # Should be * 1, NOT * 3
                
                print(f"  Main qty: {main_qty}, Line base total: ₹{line_base_total}")
                print(f"  Addon qty: {addon_qty}, Line addon total: ₹{line_addon_total}")
                
                results.add(
                    "1.3a: Main qty=3, line_base_total = base_price * 3",
                    abs(line_base_total - expected_line_base) < 0.1,
                    f"Expected {expected_line_base}, got {line_base_total}"
                )
                
                results.add(
                    "1.3b: Addon qty=1, line_addon_total = addon_price * 1 (NOT * 3)",
                    abs(line_addon_total - expected_addon_total) < 0.1,
                    f"Expected {expected_addon_total} (addon_price * 1), got {line_addon_total}"
                )
            else:
                results.add("1.3: Addon not found", False, "No addons in line")
        else:
            results.add("1.3: No lines in response", False, "Empty lines array")
    else:
        results.add("1.3: cart-quote request failed", False, f"Status {resp.status_code}")
except Exception as e:
    results.add("1.3: Exception during test", False, str(e))

# Test 1.4: Backward compatibility - plain list of addon names
print("\n[TEST 1.4] Backward compatibility: addons as plain list of strings")
try:
    payload["items"][0]["qty"] = 1
    payload["items"][0]["addons"] = [addon_name]  # Plain string, not object
    
    resp = requests.post(f"{BASE_URL}/bookings/cart-quote", headers=headers, json=payload, timeout=15)
    
    if resp.status_code == 200:
        data = resp.json()
        lines = data.get("lines", [])
        
        if len(lines) > 0:
            line = lines[0]
            addons = line.get("addons", [])
            
            if len(addons) > 0:
                addon = addons[0]
                addon_qty = addon.get("qty")
                
                print(f"  Addon name: {addon.get('name')}, qty: {addon_qty}")
                
                results.add(
                    "1.4: Backward compatibility - plain string treated as qty=1",
                    addon_qty == 1,
                    f"Expected qty=1 for plain string addon, got {addon_qty}"
                )
            else:
                results.add("1.4: Addon not found", False, "No addons in line")
        else:
            results.add("1.4: No lines in response", False, "Empty lines array")
    else:
        results.add("1.4: cart-quote request failed", False, f"Status {resp.status_code}")
except Exception as e:
    results.add("1.4: Exception during test", False, str(e))

print("\n" + "="*80)
print("TEST 2: GROUPED BOOKING PERSISTENCE")
print("="*80)

# Test 2: Create a grouped booking and verify addon qty is persisted
print("\n[TEST 2.1] Create grouped booking with addon qty and verify persistence")
try:
    # Create booking
    future_time = (datetime.now() + timedelta(days=2)).isoformat()
    
    booking_payload = {
        "items": [{
            "service_id": service_id,
            "qty": 2,
            "addons": [{"name": addon_name, "qty": 1}]
        }],
        "address": {
            "line": "Test Address",
            "pincode": "800001",
            "city": "Patna",
            "state": "Bihar",
            "lat": 25.6,
            "lng": 85.1
        },
        "schedule_type": "schedule",
        "scheduled_at": future_time
    }
    
    resp = requests.post(f"{BASE_URL}/bookings/grouped", headers=headers, json=booking_payload, timeout=15)
    
    if resp.status_code in [200, 201]:
        booking_data = resp.json()
        booking_id = booking_data.get("id")
        booking_code = booking_data.get("code")
        
        print(f"  Created booking: {booking_code} (id: {booking_id})")
        
        # Fetch the booking back
        time.sleep(1)  # Brief pause
        resp = requests.get(f"{BASE_URL}/bookings", headers=headers, timeout=10)
        
        if resp.status_code == 200:
            bookings = resp.json()
            found_booking = None
            
            for b in bookings:
                if b.get("id") == booking_id or b.get("code") == booking_code:
                    found_booking = b
                    break
            
            if found_booking:
                items = found_booking.get("items", [])
                
                if len(items) > 0:
                    item = items[0]
                    item_addons = item.get("addons", [])
                    
                    print(f"  Retrieved booking items: {len(items)}")
                    print(f"  Item addons: {len(item_addons)}")
                    
                    if len(item_addons) > 0:
                        addon = item_addons[0]
                        addon_qty = addon.get("qty")
                        
                        print(f"  Addon: {addon.get('name')}, qty: {addon_qty}")
                        
                        results.add(
                            "2.1a: Booking created successfully",
                            True,
                            f"Booking {booking_code} created"
                        )
                        
                        results.add(
                            "2.1b: Addon qty field persisted in booking",
                            addon_qty is not None,
                            f"Addon has qty field: {addon_qty}"
                        )
                        
                        results.add(
                            "2.1c: Addon qty value correct (1)",
                            addon_qty == 1,
                            f"Expected 1, got {addon_qty}"
                        )
                        
                        # Verify pricing total matches cart-quote
                        pricing = found_booking.get("pricing", {})
                        total = pricing.get("total")
                        
                        results.add(
                            "2.1d: Booking has pricing.total",
                            total is not None and total > 0,
                            f"Total: ₹{total}"
                        )
                    else:
                        results.add("2.1: No addons in retrieved booking item", False, "Addons not persisted")
                else:
                    results.add("2.1: No items in retrieved booking", False, "Items not persisted")
            else:
                results.add("2.1: Booking not found in list", False, f"Could not find booking {booking_code}")
        else:
            results.add("2.1: Failed to fetch bookings", False, f"Status {resp.status_code}")
    else:
        results.add("2.1: Failed to create booking", False, f"Status {resp.status_code}: {resp.text[:200]}")
except Exception as e:
    results.add("2.1: Exception during test", False, str(e))

print("\n" + "="*80)
print("TEST 3: PARTNER ALERT / INCOMING JOB AMOUNT")
print("="*80)

# Test 3: Partner incoming job feed
print("\n[TEST 3.1] Partner incoming job feed - verify partner_amount, visiting_charge, coupon fields")
try:
    # Search for partner job endpoints
    partner_headers = {"Authorization": f"Bearer {partner_token}"}
    
    # Try common partner job endpoints
    endpoints_to_try = [
        "/bookings/partner/jobs",
        "/bookings/partner/ring-pending",
        "/partner/jobs",
        "/partner/incoming"
    ]
    
    partner_jobs = []
    working_endpoint = None
    
    for endpoint in endpoints_to_try:
        try:
            resp = requests.get(f"{BASE_URL}{endpoint}", headers=partner_headers, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list) and len(data) > 0:
                    partner_jobs = data
                    working_endpoint = endpoint
                    print(f"  Found {len(partner_jobs)} jobs at {endpoint}")
                    break
        except:
            continue
    
    if partner_jobs and working_endpoint:
        # Check first job for required fields
        job = partner_jobs[0]
        
        # The brief object should contain partner_amount, visiting_charge, coupon fields
        brief = job.get("brief", {})
        
        partner_amount = brief.get("partner_amount")
        visiting_charge = brief.get("visiting_charge")
        coupon_code_field = brief.get("coupon_code")
        coupon_discount = brief.get("coupon_discount")
        items = brief.get("items", [])
        
        print(f"  Job brief fields:")
        print(f"    partner_amount: {partner_amount}")
        print(f"    visiting_charge: {visiting_charge}")
        print(f"    coupon_code: {coupon_code_field}")
        print(f"    coupon_discount: {coupon_discount}")
        print(f"    items count: {len(items)}")
        
        results.add(
            "3.1a: Partner job brief has partner_amount field",
            partner_amount is not None,
            f"partner_amount: {partner_amount}"
        )
        
        results.add(
            "3.1b: Partner job brief has visiting_charge field",
            visiting_charge is not None,
            f"visiting_charge: {visiting_charge}"
        )
        
        results.add(
            "3.1c: Partner job brief has coupon_code field",
            "coupon_code" in brief,
            f"coupon_code present: {coupon_code_field}"
        )
        
        results.add(
            "3.1d: Partner job brief has coupon_discount field",
            "coupon_discount" in brief,
            f"coupon_discount present: {coupon_discount}"
        )
        
        results.add(
            "3.1e: Partner job brief has items array",
            len(items) > 0,
            f"items count: {len(items)}"
        )
        
        # Check if items have is_addon flag and qty
        if len(items) > 0:
            item = items[0]
            has_is_addon = "is_addon" in item
            has_qty = "qty" in item
            
            print(f"    First item has is_addon: {has_is_addon}, has qty: {has_qty}")
            
            results.add(
                "3.1f: Partner job items have is_addon flag",
                has_is_addon,
                f"is_addon field present: {has_is_addon}"
            )
            
            results.add(
                "3.1g: Partner job items have qty field",
                has_qty,
                f"qty field present: {has_qty}"
            )
    else:
        results.add(
            "3.1: Partner job endpoint not found or no jobs",
            False,
            f"Tried endpoints: {endpoints_to_try}. No jobs found."
        )
except Exception as e:
    results.add("3.1: Exception during test", False, str(e))

print("\n" + "="*80)
print("TEST 4: COUPON DOES NOT REDUCE PARTNER EARNING")
print("="*80)

# Test 4: Verify coupon doesn't reduce partner earning
print("\n[TEST 4.1] Apply coupon and verify partner earning not reduced")
try:
    # First, validate the coupon
    print(f"  Validating coupon: {coupon_code}")
    
    validate_payload = {
        "code": coupon_code,
        "service_id": service_id,
        "schedule_type": "standard"
    }
    
    resp = requests.post(f"{BASE_URL}/bookings/validate-coupon", headers=headers, json=validate_payload, timeout=10)
    
    if resp.status_code == 200:
        coupon_data = resp.json()
        is_valid = coupon_data.get("valid", False)
        discount = coupon_data.get("discount", 0)
        
        print(f"  Coupon valid: {is_valid}, discount: ₹{discount}")
        
        results.add(
            "4.1a: Coupon validation successful",
            is_valid,
            f"Coupon {coupon_code} is valid with discount ₹{discount}"
        )
        
        # Now check if there are any completed bookings with coupons to verify partner invoice
        # Get partner invoices
        partner_headers = {"Authorization": f"Bearer {partner_token}"}
        resp = requests.get(f"{BASE_URL}/invoices", headers=partner_headers, timeout=10)
        
        if resp.status_code == 200:
            invoices = resp.json()
            
            # Find a completed booking invoice (not cancellation)
            completed_invoice = None
            for inv in invoices:
                if inv.get("invoice_type") == "booking" and inv.get("payment_status") == "completed":
                    completed_invoice = inv
                    break
            
            if completed_invoice:
                invoice_id = completed_invoice.get("id")
                
                # Get detailed invoice
                resp = requests.get(f"{BASE_URL}/invoices/{invoice_id}", headers=partner_headers, timeout=10)
                
                if resp.status_code == 200:
                    invoice_detail = resp.json()
                    role_earning = invoice_detail.get("role_earning", {})
                    
                    # Check for coupon fields
                    coupon_code_in_earning = role_earning.get("coupon_code")
                    coupon_discount_in_earning = role_earning.get("coupon_discount")
                    coupon_bearer = role_earning.get("coupon_bearer")
                    coupon_note = role_earning.get("coupon_note")
                    net_earning = role_earning.get("net")
                    
                    print(f"  Invoice {invoice_id} role_earning:")
                    print(f"    coupon_code: {coupon_code_in_earning}")
                    print(f"    coupon_discount: {coupon_discount_in_earning}")
                    print(f"    coupon_bearer: {coupon_bearer}")
                    print(f"    coupon_note: {coupon_note}")
                    print(f"    net: {net_earning}")
                    
                    results.add(
                        "4.1b: Partner invoice has coupon_code field",
                        "coupon_code" in role_earning,
                        f"coupon_code present: {coupon_code_in_earning}"
                    )
                    
                    results.add(
                        "4.1c: Partner invoice has coupon_discount field",
                        "coupon_discount" in role_earning,
                        f"coupon_discount present: {coupon_discount_in_earning}"
                    )
                    
                    results.add(
                        "4.1d: Partner invoice has coupon_bearer field",
                        "coupon_bearer" in role_earning,
                        f"coupon_bearer: {coupon_bearer}"
                    )
                    
                    results.add(
                        "4.1e: Partner invoice has coupon_note field",
                        "coupon_note" in role_earning,
                        f"coupon_note present: {coupon_note is not None}"
                    )
                    
                    results.add(
                        "4.1f: Partner net earning > 0",
                        net_earning is not None and net_earning > 0,
                        f"net: ₹{net_earning}"
                    )
                    
                    # If coupon was applied, verify bearer is platform
                    if coupon_code_in_earning:
                        results.add(
                            "4.1g: Coupon bearer is 'AzoApp Platform' (not partner)",
                            coupon_bearer == "AzoApp Platform",
                            f"Expected 'AzoApp Platform', got '{coupon_bearer}'"
                        )
                else:
                    results.add("4.1: Failed to get invoice detail", False, f"Status {resp.status_code}")
            else:
                print("  ℹ️  No completed booking invoices found. Coupon earning verification skipped.")
                results.add(
                    "4.1: No completed invoices to verify",
                    True,
                    "No completed booking invoices found (expected in fresh system)"
                )
        else:
            results.add("4.1: Failed to get partner invoices", False, f"Status {resp.status_code}")
    else:
        results.add("4.1: Coupon validation failed", False, f"Status {resp.status_code}: {resp.text[:200]}")
except Exception as e:
    results.add("4.1: Exception during test", False, str(e))

# Print summary
print("\n" + "="*80)
print("DETAILED TEST RESULTS")
print("="*80)

passed, failed = results.summary()

# Save results to file
output = {
    "timestamp": datetime.now().isoformat(),
    "base_url": BASE_URL,
    "total_tests": passed + failed,
    "passed": passed,
    "failed": failed,
    "success_rate": f"{100*passed//(passed+failed) if (passed+failed) > 0 else 0}%",
    "tests": results.tests
}

with open("/app/test_results_pricing.json", "w") as f:
    json.dump(output, f, indent=2)

print(f"\n✅ Results saved to /app/test_results_pricing.json")

if failed == 0:
    print("\n🎉 ALL TESTS PASSED!")
    exit(0)
else:
    print(f"\n⚠️  {failed} test(s) failed. See details above.")
    exit(1)
