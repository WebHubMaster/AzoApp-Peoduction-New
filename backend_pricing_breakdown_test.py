#!/usr/bin/env python3
"""
Comprehensive test for CENTRALIZED DYNAMIC PRICING — PARTNER FINANCIAL VIEW
Tests the new PricingEngine.build_breakdown() partner financial layer.

BASE_URL: REACT_APP_BACKEND_URL + /api
Demo OTP: 123456
Customer: +919000000004
Partner: +919000000003
Admin: +919000000000
Serviceable pincode: 800001
"""
import requests
import json
import sys
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://profile-kyc-panel.preview.emergentagent.com/api"
OTP = "123456"
CUSTOMER_PHONE = "+919000000004"
PARTNER_PHONE = "+919000000003"
ADMIN_PHONE = "+919000000000"

# Test results
results = {
    "total_tests": 0,
    "passed": 0,
    "failed": 0,
    "tests": []
}

def log_test(name, passed, details=""):
    """Log a test result"""
    results["total_tests"] += 1
    if passed:
        results["passed"] += 1
        print(f"✅ {name}")
    else:
        results["failed"] += 1
        print(f"❌ {name}")
        if details:
            print(f"   Details: {details}")
    results["tests"].append({"name": name, "passed": passed, "details": details})

def login(phone):
    """Login and return token"""
    # Request OTP
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if resp.status_code != 200:
        print(f"❌ Failed to request OTP for {phone}: {resp.status_code}")
        print(f"   Response: {resp.text}")
        return None
    
    # Verify OTP
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP, "create_if_new": True})
    if resp.status_code != 200:
        print(f"❌ Failed to verify OTP for {phone}: {resp.status_code}")
        print(f"   Response: {resp.text}")
        return None
    
    data = resp.json()
    return data.get("token")

def get_headers(token):
    """Get authorization headers"""
    return {"Authorization": f"Bearer {token}"}

def reconcile_breakdown(bd, role="customer"):
    """Verify breakdown reconciliation"""
    errors = []
    
    # services_subtotal + sum(additional_charges) == subtotal
    services_subtotal = bd.get("services_subtotal", 0)
    additional_charges = bd.get("additional_charges", [])
    charges_total = sum(c.get("amount", 0) for c in additional_charges)
    subtotal = bd.get("subtotal", 0)
    
    expected_subtotal = round(services_subtotal + charges_total, 2)
    if abs(expected_subtotal - subtotal) > 0.01:
        errors.append(f"services_subtotal ({services_subtotal}) + charges_total ({charges_total}) != subtotal ({subtotal})")
    
    # taxable = subtotal - discount
    discount = bd.get("discount", 0)
    taxable = bd.get("taxable", 0)
    expected_taxable = round(subtotal - discount, 2)
    if abs(expected_taxable - taxable) > 0.01:
        errors.append(f"subtotal ({subtotal}) - discount ({discount}) != taxable ({taxable})")
    
    # tax = taxable * gst_pct / 100
    gst_pct = bd.get("gst_pct", 0)
    tax = bd.get("tax", 0)
    expected_tax = round(taxable * gst_pct / 100, 2)
    if abs(expected_tax - tax) > 0.01:
        errors.append(f"taxable ({taxable}) * gst_pct ({gst_pct}) / 100 != tax ({tax})")
    
    # total = taxable + tax
    total = bd.get("total", 0)
    expected_total = round(taxable + tax, 2)
    if abs(expected_total - total) > 0.01:
        errors.append(f"taxable ({taxable}) + tax ({tax}) != total ({total})")
    
    # Verify service items: amount = rate * qty
    service_items = bd.get("service_items", [])
    for item in service_items:
        rate = item.get("rate", 0)
        qty = item.get("qty", 1)
        amount = item.get("amount", 0)
        expected_amount = round(rate * qty, 2)
        if abs(expected_amount - amount) > 0.01:
            errors.append(f"Service '{item.get('name')}': rate ({rate}) * qty ({qty}) != amount ({amount})")
        
        # Verify add-ons: amount = rate * qty (independent of main service qty)
        addons = item.get("addons", [])
        for addon in addons:
            a_rate = addon.get("rate", 0)
            a_qty = addon.get("qty", 1)
            a_amount = addon.get("amount", 0)
            expected_a_amount = round(a_rate * a_qty, 2)
            if abs(expected_a_amount - a_amount) > 0.01:
                errors.append(f"Add-on '{addon.get('name')}': rate ({a_rate}) * qty ({a_qty}) != amount ({a_amount})")
    
    # Partner-specific checks
    if role == "partner":
        # earning.base == partner_eligible_subtotal
        earning = bd.get("earning", {})
        base = earning.get("base", 0)
        partner_eligible_subtotal = bd.get("partner_eligible_subtotal", 0)
        if abs(base - partner_eligible_subtotal) > 0.01:
            errors.append(f"earning.base ({base}) != partner_eligible_subtotal ({partner_eligible_subtotal})")
        
        # earning.partner_earning == round(base * partner_share_pct / 100, 2)
        partner_share_pct = earning.get("partner_share_pct", 0)
        partner_earning = earning.get("partner_earning", 0)
        expected_partner_earning = round(base * partner_share_pct / 100, 2)
        if abs(expected_partner_earning - partner_earning) > 0.01:
            errors.append(f"earning.partner_earning ({partner_earning}) != base ({base}) * partner_share_pct ({partner_share_pct}) / 100")
        
        # earning.platform_share_pct == 100 - partner_share_pct
        platform_share_pct = earning.get("platform_share_pct", 0)
        expected_platform_share_pct = round(100 - partner_share_pct, 2)
        if abs(expected_platform_share_pct - platform_share_pct) > 0.01:
            errors.append(f"earning.platform_share_pct ({platform_share_pct}) != 100 - partner_share_pct ({partner_share_pct})")
        
        # earning.net_earning == earning.partner_earning
        net_earning = earning.get("net_earning", 0)
        if abs(net_earning - partner_earning) > 0.01:
            errors.append(f"earning.net_earning ({net_earning}) != earning.partner_earning ({partner_earning})")
    
    return errors

def main():
    print("=" * 80)
    print("CENTRALIZED DYNAMIC PRICING — PARTNER FINANCIAL VIEW TEST")
    print("=" * 80)
    print()
    
    # Login
    print("🔐 Logging in...")
    customer_token = login(CUSTOMER_PHONE)
    partner_token = login(PARTNER_PHONE)
    admin_token = login(ADMIN_PHONE)
    
    if not customer_token or not partner_token or not admin_token:
        print("❌ Failed to login. Exiting.")
        sys.exit(1)
    
    print(f"✅ Customer logged in: {CUSTOMER_PHONE}")
    print(f"✅ Partner logged in: {PARTNER_PHONE}")
    print(f"✅ Admin logged in: {ADMIN_PHONE}")
    print()
    
    # Get available services
    print("📋 Fetching available services...")
    resp = requests.get(f"{BASE_URL}/catalog/services")
    if resp.status_code != 200:
        print(f"❌ Failed to fetch services: {resp.status_code}")
        sys.exit(1)
    
    services = resp.json()
    if not services:
        print("❌ No services available")
        sys.exit(1)
    
    # Find a service with add-ons if possible
    service = None
    for svc in services:
        if svc.get("status") == "active" and svc.get("addons"):
            service = svc
            break
    
    if not service:
        # Fallback to any active service
        service = next((s for s in services if s.get("status") == "active"), None)
    
    if not service:
        print("❌ No active services found")
        sys.exit(1)
    
    print(f"✅ Using service: {service.get('name')} (ID: {service.get('id')})")
    
    # Prepare booking data
    service_id = service.get("id")
    addons = []
    addon_name = None
    if service.get("addons"):
        # Select first add-on - use string format as per DirectBookingRequest model
        addon = service["addons"][0]
        addon_name = addon.get("name")
        # For testing qty, we'll need to use the cart/grouped booking endpoint
        # For now, use simple string format
        addons = [addon_name]
        print(f"   Add-on: {addon_name}")
    
    # Create scheduled booking (to get emergency fee or visiting charge)
    scheduled_at = (datetime.utcnow() + timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M:%S")
    
    booking_data = {
        "service_id": service_id,
        "schedule_type": "emergency",  # Use emergency to get emergency fee
        "scheduled_at": scheduled_at,
        "addons": addons,
        "address": {
            "line": "123 Test Street",
            "city": "Patna",
            "pincode": "800001",
            "lat": 25.5941,
            "lng": 85.1376
        },
        "notes": "Test booking for pricing breakdown"
    }
    
    print()
    print("=" * 80)
    print("TEST 1: CREATE PAID BOOKING")
    print("=" * 80)
    
    # Create booking
    print("📝 Creating booking...")
    resp = requests.post(
        f"{BASE_URL}/bookings",
        json=booking_data,
        headers=get_headers(customer_token)
    )
    
    if resp.status_code != 200:
        print(f"❌ Failed to create booking: {resp.status_code}")
        print(resp.text)
        sys.exit(1)
    
    booking = resp.json()
    booking_id = booking.get("id")
    booking_code = booking.get("code")
    print(f"✅ Booking created: {booking_code} (ID: {booking_id})")
    
    # Mock payment
    print("💳 Paying for booking...")
    resp = requests.post(
        f"{BASE_URL}/payments/mock",
        json={"booking_id": booking_id, "purpose": "booking"},
        headers=get_headers(customer_token)
    )
    
    if resp.status_code != 200:
        print(f"❌ Failed to pay for booking: {resp.status_code}")
        print(resp.text)
        sys.exit(1)
    
    print(f"✅ Booking paid: {booking_code}")
    
    # Assign partner
    print("👷 Assigning partner...")
    
    # First, get the partner user ID
    resp = requests.get(f"{BASE_URL}/auth/me", headers=get_headers(partner_token))
    if resp.status_code != 200:
        print(f"❌ Failed to get partner info: {resp.status_code}")
        sys.exit(1)
    
    partner_user = resp.json()
    partner_id = partner_user.get("id")
    
    resp = requests.post(
        f"{BASE_URL}/admin/bookings/{booking_id}/assign",
        json={"partner_id": partner_id},
        headers=get_headers(admin_token)
    )
    
    if resp.status_code != 200:
        print(f"❌ Failed to assign partner: {resp.status_code}")
        print(resp.text)
        sys.exit(1)
    
    print(f"✅ Partner assigned")
    
    print()
    print("=" * 80)
    print("TEST 2: CUSTOMER BREAKDOWN")
    print("=" * 80)
    
    # Get booking as customer
    resp = requests.get(
        f"{BASE_URL}/bookings/{booking_id}",
        headers=get_headers(customer_token)
    )
    
    if resp.status_code != 200:
        print(f"❌ Failed to get booking as customer: {resp.status_code}")
        sys.exit(1)
    
    customer_booking = resp.json()
    customer_breakdown = customer_booking.get("breakdown", {})
    
    print("📊 Customer Breakdown:")
    print(json.dumps(customer_breakdown, indent=2))
    print()
    
    # Verify customer breakdown structure
    required_fields = [
        "service_items", "services_subtotal", "additional_charges",
        "subtotal", "discount", "taxable", "gst_pct", "tax", "total",
        "paid", "payment_status"
    ]
    
    for field in required_fields:
        if field in customer_breakdown:
            log_test(f"Customer breakdown has '{field}'", True)
        else:
            log_test(f"Customer breakdown has '{field}'", False, f"Missing field: {field}")
    
    # Verify service items structure
    service_items = customer_breakdown.get("service_items", [])
    if service_items:
        item = service_items[0]
        item_fields = ["name", "qty", "rate", "amount"]
        for field in item_fields:
            if field in item:
                log_test(f"Service item has '{field}'", True)
            else:
                log_test(f"Service item has '{field}'", False, f"Missing field: {field}")
        
        # Check add-ons if present
        if addons and item.get("addons"):
            addon_item = item["addons"][0]
            addon_fields = ["name", "qty", "rate", "amount"]
            for field in addon_fields:
                if field in addon_item:
                    log_test(f"Add-on has '{field}'", True)
                else:
                    log_test(f"Add-on has '{field}'", False, f"Missing field: {field}")
    
    # Verify additional charges (fees > 0 only)
    additional_charges = customer_breakdown.get("additional_charges", [])
    for charge in additional_charges:
        amount = charge.get("amount", 0)
        if amount > 0:
            log_test(f"Additional charge '{charge.get('label')}' has amount > 0", True)
        else:
            log_test(f"Additional charge '{charge.get('label')}' has amount > 0", False, f"Amount is {amount}")
    
    # Verify no zero-amount charges
    zero_charges = [c for c in additional_charges if c.get("amount", 0) == 0]
    if not zero_charges:
        log_test("No zero-amount charges in additional_charges", True)
    else:
        log_test("No zero-amount charges in additional_charges", False, f"Found {len(zero_charges)} zero charges")
    
    # Reconcile customer breakdown
    reconcile_errors = reconcile_breakdown(customer_breakdown, "customer")
    if not reconcile_errors:
        log_test("Customer breakdown reconciles correctly", True)
    else:
        for error in reconcile_errors:
            log_test(f"Customer breakdown reconciliation", False, error)
    
    print()
    print("=" * 80)
    print("TEST 3: PARTNER BREAKDOWN")
    print("=" * 80)
    
    # Get booking as partner
    resp = requests.get(
        f"{BASE_URL}/bookings/{booking_id}",
        headers=get_headers(partner_token)
    )
    
    if resp.status_code != 200:
        print(f"❌ Failed to get booking as partner: {resp.status_code}")
        sys.exit(1)
    
    partner_booking = resp.json()
    partner_breakdown = partner_booking.get("breakdown", {})
    
    print("📊 Partner Breakdown:")
    print(json.dumps(partner_breakdown, indent=2))
    print()
    
    # Verify partner breakdown has additional fields
    partner_fields = [
        "partner_eligible_subtotal", "customer_only_charges",
        "customer_paid_total", "earning"
    ]
    
    for field in partner_fields:
        if field in partner_breakdown:
            log_test(f"Partner breakdown has '{field}'", True)
        else:
            log_test(f"Partner breakdown has '{field}'", False, f"Missing field: {field}")
    
    # Verify earning structure
    earning = partner_breakdown.get("earning", {})
    earning_fields = [
        "base", "partner_share_pct", "partner_earning",
        "platform_share_pct", "platform_earning", "net_earning"
    ]
    
    for field in earning_fields:
        if field in earning:
            log_test(f"Earning has '{field}'", True)
        else:
            log_test(f"Earning has '{field}'", False, f"Missing field: {field}")
    
    # Verify customer_only_charges (platform fee if present)
    customer_only_charges = partner_breakdown.get("customer_only_charges", [])
    for charge in customer_only_charges:
        if charge.get("partner_excluded"):
            log_test(f"Customer-only charge '{charge.get('label')}' has partner_excluded=true", True)
        else:
            log_test(f"Customer-only charge '{charge.get('label')}' has partner_excluded=true", False)
    
    # Verify partner additional_charges excludes platform/convenience fee
    partner_additional = partner_breakdown.get("additional_charges", [])
    platform_keys = ["platform_fee", "convenience_fee"]
    has_platform_in_additional = any(c.get("key") in platform_keys for c in partner_additional)
    if not has_platform_in_additional:
        log_test("Partner additional_charges excludes platform/convenience fee", True)
    else:
        log_test("Partner additional_charges excludes platform/convenience fee", False, "Found platform fee in additional_charges")
    
    # Verify customer_paid_total matches customer's total
    customer_paid_total = partner_breakdown.get("customer_paid_total", 0)
    customer_total = customer_breakdown.get("total", 0)
    if abs(customer_paid_total - customer_total) < 0.01:
        log_test("customer_paid_total matches customer's total", True)
    else:
        log_test("customer_paid_total matches customer's total", False, f"customer_paid_total={customer_paid_total}, customer_total={customer_total}")
    
    # Reconcile partner breakdown
    reconcile_errors = reconcile_breakdown(partner_breakdown, "partner")
    if not reconcile_errors:
        log_test("Partner breakdown reconciles correctly", True)
    else:
        for error in reconcile_errors:
            log_test(f"Partner breakdown reconciliation", False, error)
    
    print()
    print("=" * 80)
    print("TEST 4: CANCELLED BOOKING WITH REFUND")
    print("=" * 80)
    
    # Create another booking for cancellation test
    print("📝 Creating second booking for cancellation test...")
    resp = requests.post(
        f"{BASE_URL}/bookings",
        json=booking_data,
        headers=get_headers(customer_token)
    )
    
    if resp.status_code != 200:
        print(f"❌ Failed to create second booking: {resp.status_code}")
    else:
        booking2 = resp.json()
        booking2_id = booking2.get("id")
        booking2_code = booking2.get("code")
        print(f"✅ Second booking created: {booking2_code}")
        
        # Pay for booking
        resp = requests.post(
            f"{BASE_URL}/payments/mock",
            json={"booking_id": booking2_id, "purpose": "booking"},
            headers=get_headers(customer_token)
        )
        
        if resp.status_code == 200:
            print(f"✅ Second booking paid")
            
            # Cancel booking
            print("🚫 Cancelling booking...")
            resp = requests.post(
                f"{BASE_URL}/bookings/{booking2_id}/cancel",
                json={"reason": "Test cancellation"},
                headers=get_headers(customer_token)
            )
            
            if resp.status_code == 200:
                print(f"✅ Booking cancelled")
                
                # Get cancelled booking as customer
                resp = requests.get(
                    f"{BASE_URL}/bookings/{booking2_id}",
                    headers=get_headers(customer_token)
                )
                
                if resp.status_code == 200:
                    cancelled_booking = resp.json()
                    cancelled_breakdown = cancelled_booking.get("breakdown", {})
                    
                    # Verify refund structure
                    refund = cancelled_breakdown.get("refund")
                    if refund:
                        log_test("Cancelled booking has refund", True)
                        
                        refund_fields = ["original_amount", "refund_pct", "refund_amount", "retained"]
                        for field in refund_fields:
                            if field in refund:
                                log_test(f"Refund has '{field}'", True)
                            else:
                                log_test(f"Refund has '{field}'", False, f"Missing field: {field}")
                        
                        # Verify retained = original_amount - refund_amount
                        original = refund.get("original_amount", 0)
                        refund_amt = refund.get("refund_amount", 0)
                        retained = refund.get("retained", 0)
                        expected_retained = round(original - refund_amt, 2)
                        if abs(expected_retained - retained) < 0.01:
                            log_test("retained = original_amount - refund_amount", True)
                        else:
                            log_test("retained = original_amount - refund_amount", False, f"expected={expected_retained}, actual={retained}")
                    else:
                        log_test("Cancelled booking has refund", False, "No refund field")
                    
                    # Get as partner
                    resp = requests.post(
                        f"{BASE_URL}/admin/bookings/{booking2_id}/assign",
                        json={"partner_id": partner_id},
                        headers=get_headers(admin_token)
                    )
                    
                    if resp.status_code == 200:
                        resp = requests.get(
                            f"{BASE_URL}/bookings/{booking2_id}",
                            headers=get_headers(partner_token)
                        )
                        
                        if resp.status_code == 200:
                            partner_cancelled = resp.json()
                            partner_cancelled_bd = partner_cancelled.get("breakdown", {})
                            
                            if partner_cancelled_bd.get("refund"):
                                log_test("Partner sees refund on cancelled booking", True)
                            else:
                                log_test("Partner sees refund on cancelled booking", False)
    
    print()
    print("=" * 80)
    print("TEST 5: REGRESSION - EXISTING ENDPOINTS")
    print("=" * 80)
    
    # Test invoices endpoint
    resp = requests.get(
        f"{BASE_URL}/invoices",
        headers=get_headers(partner_token)
    )
    
    if resp.status_code == 200:
        log_test("Partner invoices endpoint returns 200", True)
    else:
        log_test("Partner invoices endpoint returns 200", False, f"Status: {resp.status_code}")
    
    # Test partner bookings endpoint (commission data is in bookings)
    resp = requests.get(
        f"{BASE_URL}/bookings/partner/jobs",
        headers=get_headers(partner_token)
    )
    
    if resp.status_code == 200:
        log_test("Partner jobs endpoint returns 200", True)
    else:
        log_test("Partner jobs endpoint returns 200", False, f"Status: {resp.status_code}")
    
    print()
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Total tests: {results['total_tests']}")
    print(f"Passed: {results['passed']} ✅")
    print(f"Failed: {results['failed']} ❌")
    print(f"Success rate: {results['passed'] / results['total_tests'] * 100:.1f}%")
    print()
    
    # Save results
    with open("/app/test_results_pricing_breakdown.json", "w") as f:
        json.dump(results, f, indent=2)
    
    print("📄 Results saved to: /app/test_results_pricing_breakdown.json")
    print()
    
    # Print exact JSON values for verification
    print("=" * 80)
    print("EXACT JSON VALUES FOR VERIFICATION")
    print("=" * 80)
    print()
    print("CUSTOMER BREAKDOWN:")
    print(json.dumps(customer_breakdown, indent=2))
    print()
    print("PARTNER BREAKDOWN:")
    print(json.dumps(partner_breakdown, indent=2))
    print()
    
    if results["failed"] > 0:
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == "__main__":
    main()
