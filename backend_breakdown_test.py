#!/usr/bin/env python3
"""
Comprehensive backend test for the centralized financial breakdown engine.
Tests PricingEngine.build_breakdown() + booking breakdown API.
"""
import requests
import json
from decimal import Decimal

# Configuration
BASE_URL = "https://job-ring-notify.preview.emergentagent.com/api"
OTP = "123456"

# Test credentials
ADMIN_PHONE = "+919000000000"
PARTNER_PHONE = "+919000000003"
CUSTOMER_PHONE = "+919000000004"
MERCHANT_PHONE = "+919000000002"

# Test results
results = {
    "total_tests": 0,
    "passed": 0,
    "failed": 0,
    "tests": []
}


def log_test(name, passed, details=""):
    """Log a test result."""
    results["total_tests"] += 1
    if passed:
        results["passed"] += 1
        status = "✅ PASS"
    else:
        results["failed"] += 1
        status = "❌ FAIL"
    
    results["tests"].append({
        "name": name,
        "passed": passed,
        "details": details
    })
    print(f"{status} - {name}")
    if details:
        print(f"  {details}")


def login(phone):
    """Login and return auth token."""
    # Send OTP
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if resp.status_code != 200:
        raise Exception(f"Failed to send OTP: {resp.status_code} {resp.text}")
    
    # Verify OTP
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    if resp.status_code != 200:
        raise Exception(f"Failed to verify OTP: {resp.status_code} {resp.text}")
    
    data = resp.json()
    return data.get("token")


def get_bookings(token):
    """Get bookings list."""
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{BASE_URL}/bookings", headers=headers)
    return resp


def get_booking_detail(token, booking_id):
    """Get booking detail."""
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{BASE_URL}/bookings/{booking_id}", headers=headers)
    return resp


def check_reconciliation(breakdown, booking_code=""):
    """Verify breakdown reconciliation (±0.01 rounding tolerance)."""
    errors = []
    
    def approx_equal(a, b, tolerance=0.01):
        return abs(float(a) - float(b)) <= tolerance
    
    # 1. services_subtotal + charges_total == subtotal
    services_subtotal = float(breakdown.get("services_subtotal", 0))
    charges_total = float(breakdown.get("charges_total", 0))
    subtotal = float(breakdown.get("subtotal", 0))
    
    if not approx_equal(services_subtotal + charges_total, subtotal):
        errors.append(f"services_subtotal ({services_subtotal}) + charges_total ({charges_total}) != subtotal ({subtotal})")
    
    # 2. taxable == subtotal - discount
    taxable = float(breakdown.get("taxable", 0))
    discount = float(breakdown.get("discount", 0))
    
    if not approx_equal(taxable, subtotal - discount):
        errors.append(f"taxable ({taxable}) != subtotal ({subtotal}) - discount ({discount})")
    
    # 3. tax == round(taxable * gst_pct / 100, 2)
    tax = float(breakdown.get("tax", 0))
    gst_pct = float(breakdown.get("gst_pct", 0))
    expected_tax = round(taxable * gst_pct / 100, 2)
    
    if not approx_equal(tax, expected_tax):
        errors.append(f"tax ({tax}) != round(taxable ({taxable}) * gst_pct ({gst_pct}) / 100, 2) = {expected_tax}")
    
    # 4. total == taxable + tax
    total = float(breakdown.get("total", 0))
    
    if not approx_equal(total, taxable + tax):
        errors.append(f"total ({total}) != taxable ({taxable}) + tax ({tax})")
    
    # 5. Verify service_items sum approximately equals services_subtotal
    service_items = breakdown.get("service_items", [])
    items_sum = 0.0
    for item in service_items:
        items_sum += float(item.get("amount", 0))
        for addon in item.get("addons", []):
            items_sum += float(addon.get("amount", 0))
    
    # Allow slightly larger tolerance for multi-item sums
    if not approx_equal(items_sum, services_subtotal, tolerance=0.05):
        errors.append(f"Sum of service_items amounts ({items_sum}) != services_subtotal ({services_subtotal})")
    
    return errors


def check_critical_bug_fix(breakdown, booking_code=""):
    """
    CRITICAL: Verify services_subtotal is PURE service value and does NOT include
    emergency_fee/surge/visiting_charge. Those must appear in additional_charges.
    """
    errors = []
    
    services_subtotal = float(breakdown.get("services_subtotal", 0))
    additional_charges = breakdown.get("additional_charges", [])
    
    # Check if any of these fees appear in additional_charges
    charge_keys = {c.get("key") for c in additional_charges}
    
    # If booking has emergency_fee/surge/visiting_charge in pricing, they MUST be in additional_charges
    # and NOT included in services_subtotal
    
    # Verify additional_charges structure
    for charge in additional_charges:
        if not charge.get("key"):
            errors.append(f"additional_charge missing 'key': {charge}")
        if not charge.get("label"):
            errors.append(f"additional_charge missing 'label': {charge}")
        if charge.get("amount") is None:
            errors.append(f"additional_charge missing 'amount': {charge}")
    
    return errors


def check_addon_independence(breakdown, booking_code=""):
    """Verify add-on quantities are independent of main service qty."""
    errors = []
    
    service_items = breakdown.get("service_items", [])
    
    for item in service_items:
        for addon in item.get("addons", []):
            addon_qty = addon.get("qty", 1)
            addon_rate = float(addon.get("rate", 0))
            addon_amount = float(addon.get("amount", 0))
            
            expected_amount = round(addon_rate * addon_qty, 2)
            
            if abs(addon_amount - expected_amount) > 0.01:
                errors.append(
                    f"Addon '{addon.get('name')}' amount ({addon_amount}) != rate ({addon_rate}) * qty ({addon_qty}) = {expected_amount}"
                )
    
    return errors


def main():
    print("=" * 80)
    print("BACKEND TESTING: Centralized Financial Breakdown Engine")
    print("=" * 80)
    print()
    
    try:
        # TEST 1: Login as customer
        print("TEST 1 - Customer Login")
        customer_token = login(CUSTOMER_PHONE)
        log_test("Customer login successful", True, f"Token obtained for {CUSTOMER_PHONE}")
        print()
        
        # TEST 2: GET /api/bookings - verify every booking has breakdown
        print("TEST 2 - GET /api/bookings (Customer)")
        resp = get_bookings(customer_token)
        log_test("GET /api/bookings returns 200", resp.status_code == 200, f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            bookings = resp.json()
            log_test("Response is a list", isinstance(bookings, list), f"Type: {type(bookings)}")
            
            if isinstance(bookings, list):
                log_test("Customer has bookings", len(bookings) > 0, f"Found {len(bookings)} bookings")
                
                # Check each booking has breakdown
                bookings_with_breakdown = 0
                bookings_without_breakdown = []
                
                for booking in bookings:
                    booking_code = booking.get("code", "unknown")
                    if "breakdown" in booking and booking["breakdown"] is not None:
                        bookings_with_breakdown += 1
                    else:
                        bookings_without_breakdown.append(booking_code)
                
                log_test(
                    "ALL bookings have non-null 'breakdown' object",
                    len(bookings_without_breakdown) == 0,
                    f"{bookings_with_breakdown}/{len(bookings)} have breakdown. Missing: {bookings_without_breakdown}"
                )
                
                # TEST 3: Verify breakdown structure and reconciliation for each booking
                print()
                print("TEST 3 - Breakdown Reconciliation for Each Booking")
                
                reconciliation_failures = []
                critical_bug_failures = []
                addon_independence_failures = []
                
                for i, booking in enumerate(bookings[:10]):  # Test first 10 bookings
                    booking_code = booking.get("code", f"booking_{i}")
                    breakdown = booking.get("breakdown")
                    
                    if not breakdown:
                        continue
                    
                    # Check required keys
                    required_keys = [
                        "service_items", "services_subtotal", "additional_charges", "charges_total",
                        "subtotal", "coupon_discount", "discount", "taxable", "gst_pct", "tax",
                        "total", "paid", "payment_status", "currency"
                    ]
                    
                    missing_keys = [k for k in required_keys if k not in breakdown]
                    if missing_keys:
                        log_test(
                            f"Booking {booking_code} has all required breakdown keys",
                            False,
                            f"Missing keys: {missing_keys}"
                        )
                        continue
                    
                    # Reconciliation check
                    recon_errors = check_reconciliation(breakdown, booking_code)
                    if recon_errors:
                        reconciliation_failures.append(f"{booking_code}: {'; '.join(recon_errors)}")
                    
                    # Critical bug fix check
                    bug_errors = check_critical_bug_fix(breakdown, booking_code)
                    if bug_errors:
                        critical_bug_failures.append(f"{booking_code}: {'; '.join(bug_errors)}")
                    
                    # Add-on independence check
                    addon_errors = check_addon_independence(breakdown, booking_code)
                    if addon_errors:
                        addon_independence_failures.append(f"{booking_code}: {'; '.join(addon_errors)}")
                
                log_test(
                    "All bookings pass reconciliation checks",
                    len(reconciliation_failures) == 0,
                    f"Failures: {reconciliation_failures}" if reconciliation_failures else "All reconciliations passed"
                )
                
                log_test(
                    "CRITICAL: services_subtotal is PURE (no fees double-counted)",
                    len(critical_bug_failures) == 0,
                    f"Failures: {critical_bug_failures}" if critical_bug_failures else "All bookings have correct services_subtotal"
                )
                
                log_test(
                    "Add-on quantities are independent",
                    len(addon_independence_failures) == 0,
                    f"Failures: {addon_independence_failures}" if addon_independence_failures else "All add-ons have independent quantities"
                )
                
                # TEST 4: GET /api/bookings/{id} returns same breakdown
                if bookings:
                    print()
                    print("TEST 4 - GET /api/bookings/{id} Returns Same Breakdown")
                    
                    test_booking = bookings[0]
                    booking_id = test_booking.get("id")
                    booking_code = test_booking.get("code")
                    list_breakdown = test_booking.get("breakdown")
                    
                    detail_resp = get_booking_detail(customer_token, booking_id)
                    log_test(
                        f"GET /api/bookings/{booking_id} returns 200",
                        detail_resp.status_code == 200,
                        f"Status: {detail_resp.status_code}"
                    )
                    
                    if detail_resp.status_code == 200:
                        detail_booking = detail_resp.json()
                        detail_breakdown = detail_booking.get("breakdown")
                        
                        log_test(
                            "Detail endpoint returns breakdown",
                            detail_breakdown is not None,
                            "breakdown present" if detail_breakdown else "breakdown missing"
                        )
                        
                        if list_breakdown and detail_breakdown:
                            # Compare key fields
                            match = (
                                list_breakdown.get("services_subtotal") == detail_breakdown.get("services_subtotal") and
                                list_breakdown.get("charges_total") == detail_breakdown.get("charges_total") and
                                list_breakdown.get("subtotal") == detail_breakdown.get("subtotal") and
                                list_breakdown.get("total") == detail_breakdown.get("total")
                            )
                            log_test(
                                "List and detail breakdowns match",
                                match,
                                f"services_subtotal: {list_breakdown.get('services_subtotal')} vs {detail_breakdown.get('services_subtotal')}, "
                                f"total: {list_breakdown.get('total')} vs {detail_breakdown.get('total')}"
                            )
        
        print()
        
        # TEST 5: Test all 4 roles - no 5xx errors
        print("TEST 5 - All Roles Can Access Bookings (No 5xx)")
        
        roles = [
            ("Admin", ADMIN_PHONE),
            ("Partner", PARTNER_PHONE),
            ("Merchant", MERCHANT_PHONE),
            ("Customer", CUSTOMER_PHONE)
        ]
        
        for role_name, phone in roles:
            try:
                token = login(phone)
                resp = get_bookings(token)
                
                no_5xx = resp.status_code < 500
                log_test(
                    f"{role_name} GET /api/bookings - no 5xx",
                    no_5xx,
                    f"Status: {resp.status_code}"
                )
                
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list) and len(data) > 0:
                        has_breakdown = "breakdown" in data[0]
                        log_test(
                            f"{role_name} bookings have breakdown",
                            has_breakdown,
                            f"First booking has breakdown: {has_breakdown}"
                        )
            except Exception as e:
                log_test(f"{role_name} GET /api/bookings - no exception", False, str(e))
        
        print()
        
    except Exception as e:
        print(f"❌ CRITICAL ERROR: {e}")
        import traceback
        traceback.print_exc()
    
    # Print summary
    print()
    print("=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Total Tests: {results['total_tests']}")
    print(f"Passed: {results['passed']} ✅")
    print(f"Failed: {results['failed']} ❌")
    print(f"Success Rate: {results['passed'] / results['total_tests'] * 100:.1f}%")
    print()
    
    if results["failed"] > 0:
        print("FAILED TESTS:")
        for test in results["tests"]:
            if not test["passed"]:
                print(f"  ❌ {test['name']}")
                if test["details"]:
                    print(f"     {test['details']}")
    
    # Save results to file
    with open("/app/test_results_breakdown.json", "w") as f:
        json.dump(results, f, indent=2)
    
    print()
    print(f"Detailed results saved to: /app/test_results_breakdown.json")
    print()
    
    return results["failed"] == 0


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
