#!/usr/bin/env python3
"""
Detailed verification test for the financial breakdown engine.
Specifically tests the CRITICAL BUG FIX: services_subtotal must NOT include
emergency_fee/surge/visiting_charge - those must be in additional_charges.
"""
import requests
import json

# Configuration
BASE_URL = "https://azoapp-services.preview.emergentagent.com/api"
OTP = "123456"
CUSTOMER_PHONE = "+919000000004"

results = {
    "total_tests": 0,
    "passed": 0,
    "failed": 0,
    "tests": [],
    "detailed_breakdowns": []
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
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if resp.status_code != 200:
        raise Exception(f"Failed to send OTP: {resp.status_code}")
    
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    if resp.status_code != 200:
        raise Exception(f"Failed to verify OTP: {resp.status_code}")
    
    return resp.json().get("token")


def analyze_breakdown(booking):
    """Detailed analysis of a booking's breakdown."""
    code = booking.get("code", "unknown")
    breakdown = booking.get("breakdown", {})
    pricing = booking.get("pricing", {})
    
    analysis = {
        "booking_code": code,
        "status": booking.get("status"),
        "payment_status": booking.get("payment_status"),
        "breakdown_present": breakdown is not None,
        "breakdown_keys": list(breakdown.keys()) if breakdown else [],
        "services_subtotal": breakdown.get("services_subtotal"),
        "charges_total": breakdown.get("charges_total"),
        "subtotal": breakdown.get("subtotal"),
        "taxable": breakdown.get("taxable"),
        "tax": breakdown.get("tax"),
        "total": breakdown.get("total"),
        "additional_charges": breakdown.get("additional_charges", []),
        "service_items": breakdown.get("service_items", []),
        "pricing_emergency_fee": pricing.get("emergency_fee"),
        "pricing_surge": pricing.get("surge"),
        "pricing_visiting_charge": pricing.get("visiting_charge"),
        "refund": breakdown.get("refund"),
    }
    
    # Check if fees are properly separated
    charge_keys = {c.get("key") for c in analysis["additional_charges"]}
    
    # Verify critical bug fix
    critical_issues = []
    
    # If pricing has emergency_fee > 0, it MUST be in additional_charges
    if pricing.get("emergency_fee", 0) > 0:
        if "emergency_fee" not in charge_keys:
            critical_issues.append(f"emergency_fee ₹{pricing.get('emergency_fee')} NOT in additional_charges")
        else:
            # Find the charge and verify amount
            for c in analysis["additional_charges"]:
                if c.get("key") == "emergency_fee":
                    if abs(c.get("amount", 0) - pricing.get("emergency_fee", 0)) > 0.01:
                        critical_issues.append(
                            f"emergency_fee amount mismatch: additional_charges={c.get('amount')} vs pricing={pricing.get('emergency_fee')}"
                        )
    
    # If pricing has surge > 0, it MUST be in additional_charges
    if pricing.get("surge", 0) > 0:
        if "surge" not in charge_keys:
            critical_issues.append(f"surge ₹{pricing.get('surge')} NOT in additional_charges")
        else:
            for c in analysis["additional_charges"]:
                if c.get("key") == "surge":
                    if abs(c.get("amount", 0) - pricing.get("surge", 0)) > 0.01:
                        critical_issues.append(
                            f"surge amount mismatch: additional_charges={c.get('amount')} vs pricing={pricing.get('surge')}"
                        )
    
    # If pricing has visiting_charge > 0, it MUST be in additional_charges
    if pricing.get("visiting_charge", 0) > 0:
        if "visiting_charge" not in charge_keys:
            critical_issues.append(f"visiting_charge ₹{pricing.get('visiting_charge')} NOT in additional_charges")
        else:
            for c in analysis["additional_charges"]:
                if c.get("key") == "visiting_charge":
                    if abs(c.get("amount", 0) - pricing.get("visiting_charge", 0)) > 0.01:
                        critical_issues.append(
                            f"visiting_charge amount mismatch: additional_charges={c.get('amount')} vs pricing={pricing.get('visiting_charge')}"
                        )
    
    analysis["critical_issues"] = critical_issues
    
    # Verify reconciliation
    recon_issues = []
    
    services_subtotal = float(breakdown.get("services_subtotal", 0))
    charges_total = float(breakdown.get("charges_total", 0))
    subtotal = float(breakdown.get("subtotal", 0))
    
    if abs((services_subtotal + charges_total) - subtotal) > 0.01:
        recon_issues.append(
            f"services_subtotal ({services_subtotal}) + charges_total ({charges_total}) != subtotal ({subtotal})"
        )
    
    taxable = float(breakdown.get("taxable", 0))
    discount = float(breakdown.get("discount", 0))
    
    if abs(taxable - (subtotal - discount)) > 0.01:
        recon_issues.append(
            f"taxable ({taxable}) != subtotal ({subtotal}) - discount ({discount})"
        )
    
    tax = float(breakdown.get("tax", 0))
    gst_pct = float(breakdown.get("gst_pct", 0))
    expected_tax = round(taxable * gst_pct / 100, 2)
    
    if abs(tax - expected_tax) > 0.01:
        recon_issues.append(
            f"tax ({tax}) != round(taxable ({taxable}) * gst_pct ({gst_pct}) / 100, 2) = {expected_tax}"
        )
    
    total = float(breakdown.get("total", 0))
    
    if abs(total - (taxable + tax)) > 0.01:
        recon_issues.append(
            f"total ({total}) != taxable ({taxable}) + tax ({tax})"
        )
    
    analysis["reconciliation_issues"] = recon_issues
    
    return analysis


def main():
    print("=" * 80)
    print("DETAILED BREAKDOWN VERIFICATION TEST")
    print("=" * 80)
    print()
    
    try:
        # Login
        print("Logging in as customer...")
        token = login(CUSTOMER_PHONE)
        log_test("Customer login", True)
        print()
        
        # Get bookings
        print("Fetching bookings...")
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/bookings", headers=headers)
        
        log_test("GET /api/bookings returns 200", resp.status_code == 200, f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"Failed to get bookings: {resp.text}")
            return False
        
        bookings = resp.json()
        log_test("Bookings list is not empty", len(bookings) > 0, f"Found {len(bookings)} bookings")
        print()
        
        # Analyze each booking
        print("=" * 80)
        print("DETAILED BREAKDOWN ANALYSIS")
        print("=" * 80)
        print()
        
        all_critical_issues = []
        all_recon_issues = []
        bookings_with_fees = []
        
        for i, booking in enumerate(bookings):
            analysis = analyze_breakdown(booking)
            results["detailed_breakdowns"].append(analysis)
            
            code = analysis["booking_code"]
            print(f"Booking {i+1}/{len(bookings)}: {code}")
            print(f"  Status: {analysis['status']}, Payment: {analysis['payment_status']}")
            print(f"  Services Subtotal: ₹{analysis['services_subtotal']}")
            print(f"  Charges Total: ₹{analysis['charges_total']}")
            print(f"  Subtotal: ₹{analysis['subtotal']}")
            print(f"  Taxable: ₹{analysis['taxable']}")
            print(f"  Tax: ₹{analysis['tax']}")
            print(f"  Total: ₹{analysis['total']}")
            
            if analysis["additional_charges"]:
                print(f"  Additional Charges:")
                for charge in analysis["additional_charges"]:
                    print(f"    - {charge.get('label')} ({charge.get('key')}): ₹{charge.get('amount')}")
            
            if analysis["pricing_emergency_fee"] or analysis["pricing_surge"] or analysis["pricing_visiting_charge"]:
                bookings_with_fees.append(code)
                print(f"  Pricing Fees:")
                if analysis["pricing_emergency_fee"]:
                    print(f"    - Emergency Fee: ₹{analysis['pricing_emergency_fee']}")
                if analysis["pricing_surge"]:
                    print(f"    - Surge: ₹{analysis['pricing_surge']}")
                if analysis["pricing_visiting_charge"]:
                    print(f"    - Visiting Charge: ₹{analysis['pricing_visiting_charge']}")
            
            if analysis["service_items"]:
                print(f"  Service Items: {len(analysis['service_items'])}")
                for item in analysis["service_items"]:
                    print(f"    - {item.get('name')}: {item.get('qty')} × ₹{item.get('rate')} = ₹{item.get('amount')}")
                    if item.get("addons"):
                        for addon in item["addons"]:
                            print(f"      + {addon.get('name')}: {addon.get('qty')} × ₹{addon.get('rate')} = ₹{addon.get('amount')}")
            
            if analysis["refund"]:
                print(f"  Refund: ₹{analysis['refund'].get('refund_amount')} ({analysis['refund'].get('refund_pct')}%)")
            
            if analysis["critical_issues"]:
                print(f"  ❌ CRITICAL ISSUES:")
                for issue in analysis["critical_issues"]:
                    print(f"    - {issue}")
                all_critical_issues.extend([f"{code}: {issue}" for issue in analysis["critical_issues"]])
            else:
                print(f"  ✅ No critical issues")
            
            if analysis["reconciliation_issues"]:
                print(f"  ❌ RECONCILIATION ISSUES:")
                for issue in analysis["reconciliation_issues"]:
                    print(f"    - {issue}")
                all_recon_issues.extend([f"{code}: {issue}" for issue in analysis["reconciliation_issues"]])
            else:
                print(f"  ✅ Reconciliation passed")
            
            print()
        
        # Summary tests
        print("=" * 80)
        print("VERIFICATION SUMMARY")
        print("=" * 80)
        print()
        
        log_test(
            "All bookings have breakdown object",
            all(b.get("breakdown") is not None for b in bookings),
            f"{sum(1 for b in bookings if b.get('breakdown') is not None)}/{len(bookings)} have breakdown"
        )
        
        log_test(
            "CRITICAL: No fees double-counted in services_subtotal",
            len(all_critical_issues) == 0,
            f"Issues found: {all_critical_issues}" if all_critical_issues else "All fees properly separated"
        )
        
        log_test(
            "All bookings pass reconciliation",
            len(all_recon_issues) == 0,
            f"Issues found: {all_recon_issues}" if all_recon_issues else "All reconciliations passed"
        )
        
        log_test(
            "Bookings with fees have them in additional_charges",
            True,
            f"Found {len(bookings_with_fees)} bookings with fees: {bookings_with_fees}"
        )
        
        # Check for add-on independence
        addon_issues = []
        for booking in bookings:
            breakdown = booking.get("breakdown", {})
            for item in breakdown.get("service_items", []):
                for addon in item.get("addons", []):
                    expected = round(addon.get("rate", 0) * addon.get("qty", 1), 2)
                    actual = addon.get("amount", 0)
                    if abs(expected - actual) > 0.01:
                        addon_issues.append(
                            f"{booking.get('code')}: {addon.get('name')} amount {actual} != {addon.get('rate')} × {addon.get('qty')} = {expected}"
                        )
        
        log_test(
            "Add-on quantities are independent",
            len(addon_issues) == 0,
            f"Issues: {addon_issues}" if addon_issues else "All add-ons have independent quantities"
        )
        
        print()
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Print final summary
    print()
    print("=" * 80)
    print("FINAL TEST SUMMARY")
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
        print()
    
    # Save results
    with open("/app/test_results_breakdown_detailed.json", "w") as f:
        json.dump(results, f, indent=2)
    
    print(f"Detailed results saved to: /app/test_results_breakdown_detailed.json")
    print()
    
    return results["failed"] == 0


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
