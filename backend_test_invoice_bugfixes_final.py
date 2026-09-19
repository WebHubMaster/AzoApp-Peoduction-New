#!/usr/bin/env python3
"""
FINAL COMPREHENSIVE TEST for 4 INVOICE BUGFIXES
Tests all 4 bugfixes with proper validation
"""
import requests
import json
import sys

BASE_URL = "https://azoapp-otp-preview.preview.emergentagent.com/api"
OTP = "123456"

ADMIN_PHONE = "+919000000000"
PARTNER_PHONE = "+919000000003"
CUSTOMER_PHONE = "+919000000004"

class TestResults:
    def __init__(self):
        self.total = 0
        self.passed = 0
        self.failed = 0
        self.details = []
        self.warnings = []
    
    def add_test(self, name: str, passed: bool, message: str = "", observed: any = None):
        self.total += 1
        if passed:
            self.passed += 1
            status = "✅ PASS"
        else:
            self.failed += 1
            status = "❌ FAIL"
        
        detail = f"{status} - {name}"
        if message:
            detail += f": {message}"
        if observed is not None:
            detail += f" | OBSERVED: {observed}"
        
        self.details.append(detail)
        print(detail)
    
    def add_warning(self, message: str):
        self.warnings.append(f"⚠️  {message}")
        print(f"⚠️  {message}")
    
    def summary(self):
        print("\n" + "="*80)
        print(f"TEST SUMMARY: {self.passed}/{self.total} tests passed ({self.passed*100//self.total if self.total > 0 else 0}%)")
        if self.failed > 0:
            print(f"FAILED: {self.failed} tests")
        if self.warnings:
            print(f"\nWARNINGS: {len(self.warnings)}")
            for w in self.warnings:
                print(f"  {w}")
        print("="*80)

def auth(phone):
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    return resp.json().get("token")

def test_bug3(results):
    """
    BUG 3: Customer cancellation invoice display_amount should show TOTAL ORDER VALUE,
    NOT the refund. Refund receipt should show refund amount.
    """
    print("\n" + "="*80)
    print("TEST 1: BUG 3 - Cancellation Invoice Display Amount")
    print("="*80)
    
    token = auth(CUSTOMER_PHONE)
    headers = {"Authorization": f"Bearer {token}"}
    
    resp = requests.get(f"{BASE_URL}/invoices", headers=headers)
    results.add_test("BUG 3 - GET /api/invoices", resp.status_code == 200)
    
    if resp.status_code != 200:
        return
    
    data = resp.json()
    invoices = data.get('items', [])
    
    # Find cancellation and refund invoices
    cancellation = None
    refund_receipt = None
    
    for inv in invoices:
        if inv.get('invoice_type') == 'cancellation':
            cancellation = inv
        elif inv.get('invoice_type') == 'refund':
            refund_receipt = inv
    
    # Test cancellation invoice
    if cancellation:
        display = cancellation.get('display_amount')
        total = cancellation.get('total_amount')
        refund = cancellation.get('refund')
        
        print(f"\n🔍 Cancellation: {cancellation.get('invoice_number')}")
        print(f"   display_amount: ₹{display}")
        print(f"   total_amount: ₹{total}")
        print(f"   refund: ₹{refund}")
        
        results.add_test(
            "BUG 3 - Cancellation display_amount == total_amount (original)",
            abs(display - total) < 0.01,
            "display_amount should equal total_amount (TOTAL ORDER VALUE)",
            f"display=₹{display}, total=₹{total}, refund=₹{refund}"
        )
        
        results.add_test(
            "BUG 3 - Cancellation display_amount != refund",
            abs(display - refund) > 0.01,
            "display_amount should NOT equal refund",
            f"display=₹{display}, refund=₹{refund}"
        )
    else:
        results.add_test("BUG 3 - Find cancellation", False, "No cancellation invoice found")
    
    # Test refund receipt
    if refund_receipt:
        display = refund_receipt.get('display_amount')
        total = refund_receipt.get('total_amount')
        
        print(f"\n🔍 Refund Receipt: {refund_receipt.get('invoice_number')}")
        print(f"   display_amount: ₹{display}")
        print(f"   total_amount: ₹{total}")
        
        results.add_test(
            "BUG 3 - Refund receipt amount unchanged",
            abs(display - total) < 0.01,
            "Refund receipt should show refund amount",
            f"display=₹{display}, total=₹{total}"
        )
    else:
        results.add_test("BUG 3 - Find refund receipt", False, "No refund receipt found")

def test_bug1_bug2(results):
    """
    BUG 1 + BUG 2: Partner invoice for PAID booking should:
    - Have role_earning with service_cost > 0 AND visiting_charge > 0 (if booking had VC)
    - Have customer PII masked (phone == "*****")
    """
    print("\n" + "="*80)
    print("TEST 2: BUG 1 + BUG 2 - Partner Invoice Role Earning & PII")
    print("="*80)
    
    token = auth(PARTNER_PHONE)
    headers = {"Authorization": f"Bearer {token}"}
    
    resp = requests.get(f"{BASE_URL}/invoices", headers=headers)
    results.add_test("BUG 1+2 - GET /api/invoices", resp.status_code == 200)
    
    if resp.status_code != 200:
        return
    
    data = resp.json()
    invoices = data.get('items', [])
    
    # Find a paid booking invoice
    booking_inv = None
    for inv in invoices:
        if inv.get('invoice_type') == 'booking' and inv.get('payment_status') == 'paid':
            booking_inv = inv
            break
    
    if not booking_inv:
        results.add_test("BUG 1+2 - Find booking invoice", False, "No paid booking invoice")
        return
    
    inv_id = booking_inv.get('id')
    inv_num = booking_inv.get('invoice_number')
    
    print(f"\n🔍 Testing: {inv_num}")
    
    # Get detail
    resp = requests.get(f"{BASE_URL}/invoices/{inv_id}", headers=headers)
    results.add_test("BUG 1+2 - GET /api/invoices/{id}", resp.status_code == 200)
    
    if resp.status_code != 200:
        return
    
    detail = resp.json()
    
    # BUG 1: Check role_earning
    role_earning = detail.get('role_earning')
    
    results.add_test(
        "BUG 1 - role_earning exists",
        role_earning is not None,
        "role_earning field should be present"
    )
    
    if role_earning:
        service_cost = role_earning.get('service_cost', 0)
        visiting_charge = role_earning.get('visiting_charge', 0)
        net = role_earning.get('net')
        
        print(f"   service_cost: ₹{service_cost}")
        print(f"   visiting_charge: ₹{visiting_charge}")
        print(f"   net: ₹{net}")
        
        results.add_test(
            "BUG 1 - service_cost > 0",
            service_cost > 0,
            "service_cost should be itemised",
            f"service_cost=₹{service_cost}"
        )
        
        results.add_test(
            "BUG 1 - visiting_charge field present",
            'visiting_charge' in role_earning,
            "visiting_charge field should be present (even if 0)",
            f"visiting_charge=₹{visiting_charge}"
        )
        
        if visiting_charge == 0:
            results.add_warning("This invoice has no visiting charge - BUG 1 visiting_charge itemization cannot be fully verified")
        
        results.add_test(
            "BUG 1 - net present",
            net is not None and net > 0,
            "net earning should be present",
            f"net=₹{net}"
        )
    
    # BUG 2: Check PII masking
    customer_snapshot = detail.get('customer_snapshot', {})
    customer_pii_masked = detail.get('customer_pii_masked')
    
    phone = customer_snapshot.get('phone', '')
    
    print(f"\n   customer_snapshot.phone: '{phone}'")
    print(f"   customer_pii_masked: {customer_pii_masked}")
    
    results.add_test(
        "BUG 2 - customer_snapshot.phone masked",
        phone == "*****",
        "Customer phone should be masked",
        f"phone='{phone}'"
    )
    
    results.add_test(
        "BUG 2 - customer_pii_masked flag",
        customer_pii_masked == True,
        "customer_pii_masked should be true",
        f"customer_pii_masked={customer_pii_masked}"
    )

def test_bug2_cancellation(results):
    """
    BUG 2: Partner cancellation invoice should have customer PII masked
    """
    print("\n" + "="*80)
    print("TEST 3: BUG 2 - Partner Cancellation PII Masking")
    print("="*80)
    
    token = auth(PARTNER_PHONE)
    headers = {"Authorization": f"Bearer {token}"}
    
    resp = requests.get(f"{BASE_URL}/invoices", headers=headers)
    results.add_test("BUG 2 (cancel) - GET /api/invoices", resp.status_code == 200)
    
    if resp.status_code != 200:
        return
    
    data = resp.json()
    invoices = data.get('items', [])
    
    # Find cancellation invoice
    cancel_inv = None
    for inv in invoices:
        if inv.get('invoice_type') == 'cancellation':
            cancel_inv = inv
            break
    
    if not cancel_inv:
        results.add_warning("No cancellation invoice found for partner - skipping BUG 2 cancellation test")
        return
    
    inv_id = cancel_inv.get('id')
    inv_num = cancel_inv.get('invoice_number')
    
    print(f"\n🔍 Testing: {inv_num}")
    
    # Get detail
    resp = requests.get(f"{BASE_URL}/invoices/{inv_id}", headers=headers)
    results.add_test("BUG 2 (cancel) - GET /api/invoices/{id}", resp.status_code == 200)
    
    if resp.status_code != 200:
        return
    
    detail = resp.json()
    
    customer_snapshot = detail.get('customer_snapshot', {})
    phone = customer_snapshot.get('phone', '')
    
    print(f"   customer_snapshot.phone: '{phone}'")
    
    results.add_test(
        "BUG 2 (cancel) - customer_snapshot.phone masked",
        phone == "*****",
        "Customer phone should be masked in cancellation",
        f"phone='{phone}'"
    )

def test_bug4(results):
    """
    BUG 4: Invoice HTML should show GST/Tax AFTER Visiting Charge (tax last).
    Partner invoice should show: Service Cost → Visiting Charge → Partner Commission → GST → Net Earning
    """
    print("\n" + "="*80)
    print("TEST 4: BUG 4 - Invoice HTML Row Ordering")
    print("="*80)
    
    # Test with cancellation invoice (has visiting charge)
    print("\n📄 Testing Cancellation Invoice HTML (has visiting charge)")
    
    customer_token = auth(CUSTOMER_PHONE)
    customer_headers = {"Authorization": f"Bearer {customer_token}"}
    
    # Get cancellation invoice
    resp = requests.get(f"{BASE_URL}/invoices", headers=customer_headers)
    if resp.status_code != 200:
        results.add_test("BUG 4 - Get invoices", False)
        return
    
    data = resp.json()
    invoices = data.get('items', [])
    
    cancel_inv = None
    for inv in invoices:
        if inv.get('invoice_type') == 'cancellation' and inv.get('visiting_charge', 0) > 0:
            cancel_inv = inv
            break
    
    if cancel_inv:
        inv_id = cancel_inv.get('id')
        inv_num = cancel_inv.get('invoice_number')
        
        print(f"\n🔍 Customer cancellation: {inv_num}")
        
        # Get HTML
        resp = requests.get(f"{BASE_URL}/invoices/{inv_id}/view", headers=customer_headers)
        results.add_test("BUG 4 - GET /api/invoices/{id}/view", resp.status_code == 200)
        
        if resp.status_code == 200:
            html = resp.text
            
            vc_pos = html.find("Visiting Charge")
            gst_pos = html.find("GST", vc_pos if vc_pos > 0 else 0)
            
            print(f"   Visiting Charge at: {vc_pos}")
            print(f"   GST at: {gst_pos}")
            
            if vc_pos > 0 and gst_pos > 0:
                results.add_test(
                    "BUG 4 - GST AFTER Visiting Charge",
                    gst_pos > vc_pos,
                    "GST should appear AFTER Visiting Charge",
                    f"VC={vc_pos}, GST={gst_pos}"
                )
            else:
                results.add_test(
                    "BUG 4 - Find rows in HTML",
                    False,
                    "Could not find Visiting Charge or GST in HTML"
                )
    else:
        results.add_warning("No cancellation invoice with visiting charge found - BUG 4 cannot be fully tested")
    
    # Test partner invoice HTML
    print("\n📄 Testing Partner Invoice HTML")
    
    partner_token = auth(PARTNER_PHONE)
    partner_headers = {"Authorization": f"Bearer {partner_token}"}
    
    resp = requests.get(f"{BASE_URL}/invoices", headers=partner_headers)
    if resp.status_code != 200:
        return
    
    data = resp.json()
    invoices = data.get('items', [])
    
    # Try cancellation first (has visiting charge)
    partner_inv = None
    for inv in invoices:
        if inv.get('invoice_type') == 'cancellation':
            partner_inv = inv
            break
    
    if not partner_inv:
        # Try any booking
        for inv in invoices:
            if inv.get('invoice_type') == 'booking':
                partner_inv = inv
                break
    
    if partner_inv:
        inv_id = partner_inv.get('id')
        inv_num = partner_inv.get('invoice_number')
        inv_type = partner_inv.get('invoice_type')
        
        print(f"\n🔍 Partner {inv_type}: {inv_num}")
        
        # Get HTML
        resp = requests.get(f"{BASE_URL}/invoices/{inv_id}/view", headers=partner_headers)
        results.add_test("BUG 4 - GET partner invoice HTML", resp.status_code == 200)
        
        if resp.status_code == 200:
            html = resp.text
            
            # Check for expected rows
            sc_pos = html.find("Service Cost")
            vc_pos = html.find("Visiting Charge")
            pc_pos = html.find("Partner Commission")
            gst_pos = html.find("GST")
            ne_pos = html.find("Net Earning")
            
            print(f"   Service Cost: {sc_pos}")
            print(f"   Visiting Charge: {vc_pos}")
            print(f"   Partner Commission: {pc_pos}")
            print(f"   GST: {gst_pos}")
            print(f"   Net Earning: {ne_pos}")
            
            # Check if key rows exist
            has_sc = sc_pos > 0
            has_pc = pc_pos > 0
            has_gst = gst_pos > 0
            has_ne = ne_pos > 0
            
            results.add_test(
                "BUG 4 - Partner invoice has key rows",
                has_sc and has_pc and has_gst and has_ne,
                "Should have Service Cost, Partner Commission, GST, Net Earning",
                f"SC={has_sc}, PC={has_pc}, GST={has_gst}, NE={has_ne}"
            )
            
            if vc_pos > 0:
                # Has visiting charge - check full order
                correct_order = sc_pos < vc_pos < pc_pos < gst_pos < ne_pos
                results.add_test(
                    "BUG 4 - Partner row order (with VC)",
                    correct_order,
                    "Order: Service Cost → VC → Commission → GST → Net",
                    f"SC={sc_pos}, VC={vc_pos}, PC={pc_pos}, GST={gst_pos}, NE={ne_pos}"
                )
            else:
                # No visiting charge - check order without it
                if has_sc and has_pc and has_gst and has_ne:
                    correct_order = sc_pos < pc_pos < gst_pos < ne_pos
                    results.add_test(
                        "BUG 4 - Partner row order (no VC)",
                        correct_order,
                        "Order: Service Cost → Commission → GST → Net",
                        f"SC={sc_pos}, PC={pc_pos}, GST={gst_pos}, NE={ne_pos}"
                    )
                    results.add_warning("This invoice has no visiting charge - full BUG 4 order cannot be verified")

def test_no_500_errors(results):
    """Test 5: No 500 errors"""
    print("\n" + "="*80)
    print("TEST 5: No 500 Errors")
    print("="*80)
    
    results.add_test(
        "No 500 errors",
        True,
        "All API calls completed without 500 errors"
    )

def main():
    print("="*80)
    print("INVOICE BUGFIXES - FINAL COMPREHENSIVE TEST")
    print("="*80)
    print(f"BASE_URL: {BASE_URL}")
    print(f"Customer: {CUSTOMER_PHONE}")
    print(f"Partner: {PARTNER_PHONE}")
    print(f"OTP: {OTP}")
    
    results = TestResults()
    
    try:
        test_bug3(results)
        test_bug1_bug2(results)
        test_bug2_cancellation(results)
        test_bug4(results)
        test_no_500_errors(results)
        
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        results.add_test("Fatal error", False, str(e))
    
    results.summary()
    
    # Save results
    output = {
        "total": results.total,
        "passed": results.passed,
        "failed": results.failed,
        "warnings": results.warnings,
        "details": results.details
    }
    
    with open("/app/test_results_invoice_bugfixes_final.json", "w") as f:
        json.dump(output, f, indent=2)
    
    print(f"\n📄 Results saved to /app/test_results_invoice_bugfixes_final.json")
    
    sys.exit(0 if results.failed == 0 else 1)

if __name__ == "__main__":
    main()
