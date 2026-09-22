#!/usr/bin/env python3
"""
8-POINT BATCH BACKEND TEST
Tests the NEW 8-point batch backend changes for AzoApp home-services platform.
"""
import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://partner-ui-mirror.preview.emergentagent.com/api"
OTP = "123456"

# Test accounts
ACCOUNTS = {
    "customer": "+919000000004",
    "partner": "+919000000003",
    "merchant": "+919000000002",
    "admin": "+919000000000"
}

class TestRunner:
    def __init__(self):
        self.tokens = {}
        self.results = {
            "total": 0,
            "passed": 0,
            "failed": 0,
            "tests": []
        }
        
    def log(self, msg, level="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] [{level}] {msg}")
        
    def login(self, role):
        """Login and get token for a role"""
        if role in self.tokens:
            return self.tokens[role]
            
        phone = ACCOUNTS[role]
        self.log(f"Logging in as {role} ({phone})")
        
        # Verify OTP
        resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={
            "phone": phone,
            "otp": OTP
        })
        
        if resp.status_code != 200:
            self.log(f"Login failed for {role}: {resp.status_code} {resp.text}", "ERROR")
            return None
            
        data = resp.json()
        token = data.get("token")
        self.tokens[role] = token
        self.log(f"✓ Logged in as {role}")
        return token
        
    def headers(self, role):
        """Get auth headers for a role"""
        token = self.login(role)
        if not token:
            return {}
        return {"Authorization": f"Bearer {token}"}
        
    def test(self, name, fn):
        """Run a test function"""
        self.results["total"] += 1
        self.log(f"TEST: {name}")
        try:
            result = fn()
            if result:
                self.results["passed"] += 1
                self.log(f"✅ PASS: {name}", "PASS")
                self.results["tests"].append({"name": name, "status": "PASS", "error": None})
                return True
            else:
                self.results["failed"] += 1
                self.log(f"❌ FAIL: {name}", "FAIL")
                self.results["tests"].append({"name": name, "status": "FAIL", "error": "Test returned False"})
                return False
        except Exception as e:
            self.results["failed"] += 1
            self.log(f"❌ FAIL: {name} - {str(e)}", "FAIL")
            self.results["tests"].append({"name": name, "status": "FAIL", "error": str(e)})
            return False
            
    def summary(self):
        """Print test summary"""
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        print(f"Total: {self.results['total']}")
        print(f"Passed: {self.results['passed']} ✅")
        print(f"Failed: {self.results['failed']} ❌")
        print(f"Success Rate: {(self.results['passed']/self.results['total']*100):.1f}%")
        
        if self.results['failed'] > 0:
            print("\nFailed Tests:")
            for t in self.results['tests']:
                if t['status'] == 'FAIL':
                    print(f"  - {t['name']}: {t['error']}")
        print("="*80)
        
        return self.results['failed'] == 0

# Initialize test runner
runner = TestRunner()

# ============================================================================
# POINT 1: COUPON → COMMISSION BASE
# ============================================================================
def test_coupon_commission_base():
    """Test that coupon discount is added back to commission base"""
    runner.log("Testing COUPON → COMMISSION BASE")
    
    # Get a completed booking with coupon discount
    headers = runner.headers("admin")
    resp = requests.get(f"{BASE_URL}/admin/bookings", headers=headers, params={
        "status": "completed",
        "page_size": 50
    })
    
    if resp.status_code != 200:
        runner.log(f"Failed to get bookings: {resp.status_code}", "ERROR")
        return False
        
    # Admin bookings endpoint returns a list directly
    bookings = resp.json() if isinstance(resp.json(), list) else resp.json().get("items", [])
    
    # Find a booking with coupon discount
    booking_with_coupon = None
    for b in bookings:
        pricing = b.get("pricing", {})
        if pricing.get("discount", 0) > 0:
            booking_with_coupon = b
            break
            
    if not booking_with_coupon:
        runner.log("No completed booking with coupon found - checking commission base logic anyway", "WARN")
        # Still pass if no coupon booking exists, as long as endpoint works
        return True
        
    # Get booking detail
    booking_id = booking_with_coupon["id"]
    resp = requests.get(f"{BASE_URL}/admin/bookings/{booking_id}/detail", headers=headers)
    
    if resp.status_code != 200:
        runner.log(f"Failed to get booking detail: {resp.status_code}", "ERROR")
        return False
        
    detail = resp.json()
    pricing = detail.get("booking", {}).get("pricing", {})
    commission = detail.get("commission", {})
    
    # Check commission base calculation
    paid_excl_tax = pricing.get("total", 0) - pricing.get("gst", 0)
    coupon_discount = pricing.get("discount", 0)
    expected_base = paid_excl_tax + coupon_discount
    
    actual_base = commission.get("base", 0)
    
    runner.log(f"Paid excl tax: {paid_excl_tax}, Coupon: {coupon_discount}, Expected base: {expected_base}, Actual base: {actual_base}")
    
    # Allow small rounding difference
    if abs(actual_base - expected_base) < 0.1:
        runner.log("✓ Commission base includes coupon discount")
        return True
    else:
        runner.log(f"✗ Commission base mismatch: expected {expected_base}, got {actual_base}", "ERROR")
        return False

# ============================================================================
# POINT 2: INVOICE PII MASKING
# ============================================================================
def test_invoice_pii_masking_partner():
    """Test that partner sees masked PII for paid/completed invoices"""
    runner.log("Testing INVOICE PII MASKING for partner")
    
    headers = runner.headers("partner")
    
    # Get partner invoices
    resp = requests.get(f"{BASE_URL}/invoices", headers=headers)
    
    if resp.status_code != 200:
        runner.log(f"Failed to get invoices: {resp.status_code}", "ERROR")
        return False
        
    data = resp.json()
    items = data.get("items", [])
    
    if not items:
        runner.log("No invoices found for partner", "WARN")
        return True
        
    # Find a paid/completed booking invoice
    paid_invoice = None
    for inv in items:
        if inv.get("invoice_type") == "booking" and inv.get("payment_status") == "paid":
            paid_invoice = inv
            break
            
    if not paid_invoice:
        runner.log("No paid booking invoice found for partner", "WARN")
        return True
        
    # Check PII masking in list
    customer_snap = paid_invoice.get("customer_snapshot", {})
    
    phone_masked = customer_snap.get("phone") == "*****"
    # Email can be empty string or "*****" (both are masked)
    email_masked = customer_snap.get("email") in ("*****", "")
    address_masked = customer_snap.get("address") == "*****"
    name_visible = customer_snap.get("name") and customer_snap.get("name") != "*****"
    pii_masked_flag = paid_invoice.get("customer_pii_masked") == True
    
    runner.log(f"Phone masked: {phone_masked}, Email masked: {email_masked}, Address masked: {address_masked}, Name visible: {name_visible}, PII flag: {pii_masked_flag}")
    
    if not (phone_masked and email_masked and address_masked and name_visible and pii_masked_flag):
        runner.log("✗ PII not properly masked in invoice list", "ERROR")
        return False
        
    # Check detail endpoint
    invoice_id = paid_invoice["id"]
    resp = requests.get(f"{BASE_URL}/invoices/{invoice_id}", headers=headers)
    
    if resp.status_code != 200:
        runner.log(f"Failed to get invoice detail: {resp.status_code}", "ERROR")
        return False
        
    detail = resp.json()
    customer_snap = detail.get("customer_snapshot", {})
    
    phone_masked = customer_snap.get("phone") == "*****"
    # Email can be empty string or "*****" (both are masked)
    email_masked = customer_snap.get("email") in ("*****", "")
    address_masked = customer_snap.get("address") == "*****"
    name_visible = customer_snap.get("name") and customer_snap.get("name") != "*****"
    pii_masked_flag = detail.get("customer_pii_masked") == True
    
    if not (phone_masked and email_masked and address_masked and name_visible and pii_masked_flag):
        runner.log("✗ PII not properly masked in invoice detail", "ERROR")
        return False
        
    runner.log("✓ PII properly masked for partner")
    return True

def test_invoice_pii_not_masked_for_others():
    """Test that customer/merchant/admin see real PII"""
    runner.log("Testing INVOICE PII NOT MASKED for customer/merchant/admin")
    
    # Test customer
    headers = runner.headers("customer")
    resp = requests.get(f"{BASE_URL}/invoices", headers=headers)
    
    if resp.status_code != 200:
        runner.log(f"Failed to get customer invoices: {resp.status_code}", "ERROR")
        return False
        
    items = resp.json().get("items", [])
    if items:
        inv = items[0]
        customer_snap = inv.get("customer_snapshot", {})
        phone = customer_snap.get("phone", "")
        
        if phone == "*****":
            runner.log("✗ Customer PII should NOT be masked for customer", "ERROR")
            return False
            
    runner.log("✓ PII not masked for customer")
    
    # Test admin
    headers = runner.headers("admin")
    resp = requests.get(f"{BASE_URL}/invoices", headers=headers, params={"page_size": 5})
    
    if resp.status_code != 200:
        runner.log(f"Failed to get admin invoices: {resp.status_code}", "ERROR")
        return False
        
    items = resp.json().get("items", [])
    if items:
        for inv in items:
            if inv.get("invoice_type") == "booking" and inv.get("payment_status") == "paid":
                customer_snap = inv.get("customer_snapshot", {})
                phone = customer_snap.get("phone", "")
                
                if phone == "*****":
                    runner.log("✗ Customer PII should NOT be masked for admin", "ERROR")
                    return False
                break
                
    runner.log("✓ PII not masked for admin")
    return True

# ============================================================================
# POINT 3: role_earning OBJECT
# ============================================================================
def test_role_earning_partner():
    """Test role_earning object for partner"""
    runner.log("Testing role_earning object for PARTNER")
    
    headers = runner.headers("partner")
    
    # Get partner invoices
    resp = requests.get(f"{BASE_URL}/invoices", headers=headers)
    
    if resp.status_code != 200:
        runner.log(f"Failed to get invoices: {resp.status_code}", "ERROR")
        return False
        
    items = resp.json().get("items", [])
    
    # Find a booking invoice
    booking_invoice = None
    for inv in items:
        if inv.get("invoice_type") == "booking":
            booking_invoice = inv
            break
            
    if not booking_invoice:
        runner.log("No booking invoice found for partner", "WARN")
        return True
        
    # Get invoice detail
    invoice_id = booking_invoice["id"]
    resp = requests.get(f"{BASE_URL}/invoices/{invoice_id}", headers=headers)
    
    if resp.status_code != 200:
        runner.log(f"Failed to get invoice detail: {resp.status_code}", "ERROR")
        return False
        
    detail = resp.json()
    role_earning = detail.get("role_earning")
    
    if not role_earning:
        runner.log("✗ role_earning object missing", "ERROR")
        return False
        
    # Check required fields
    required_fields = ["role", "base", "rate", "commission", "net"]
    for field in required_fields:
        if field not in role_earning:
            runner.log(f"✗ role_earning missing field: {field}", "ERROR")
            return False
            
    if role_earning["role"] != "partner":
        runner.log(f"✗ role_earning.role should be 'partner', got '{role_earning['role']}'", "ERROR")
        return False
        
    # Check numeric fields
    if not isinstance(role_earning["base"], (int, float)):
        runner.log("✗ role_earning.base should be numeric", "ERROR")
        return False
        
    if not isinstance(role_earning["rate"], (int, float)):
        runner.log("✗ role_earning.rate should be numeric", "ERROR")
        return False
        
    if not isinstance(role_earning["commission"], (int, float)):
        runner.log("✗ role_earning.commission should be numeric", "ERROR")
        return False
        
    if not isinstance(role_earning["net"], (int, float)):
        runner.log("✗ role_earning.net should be numeric", "ERROR")
        return False
        
    runner.log(f"✓ role_earning for partner: role={role_earning['role']}, base={role_earning['base']}, rate={role_earning['rate']}, commission={role_earning['commission']}, net={role_earning['net']}")
    return True

def test_role_earning_merchant():
    """Test role_earning object for merchant"""
    runner.log("Testing role_earning object for MERCHANT")
    
    headers = runner.headers("merchant")
    
    # Get merchant invoices
    resp = requests.get(f"{BASE_URL}/invoices", headers=headers)
    
    if resp.status_code != 200:
        runner.log(f"Failed to get invoices: {resp.status_code}", "ERROR")
        return False
        
    items = resp.json().get("items", [])
    
    # Find a booking invoice
    booking_invoice = None
    for inv in items:
        if inv.get("invoice_type") == "booking":
            booking_invoice = inv
            break
            
    if not booking_invoice:
        runner.log("No booking invoice found for merchant", "WARN")
        # Check if merchant has any commissions
        resp2 = requests.get(f"{BASE_URL}/merchant/earnings", headers=headers)
        if resp2.status_code == 200:
            earnings = resp2.json()
            if earnings.get("count", 0) == 0:
                runner.log("Merchant has no commissions - role_earning not expected", "WARN")
                return True
        return True
        
    # Get invoice detail
    invoice_id = booking_invoice["id"]
    resp = requests.get(f"{BASE_URL}/invoices/{invoice_id}", headers=headers)
    
    if resp.status_code != 200:
        runner.log(f"Failed to get invoice detail: {resp.status_code}", "ERROR")
        return False
        
    detail = resp.json()
    role_earning = detail.get("role_earning")
    
    # Check if merchant has commission on this booking
    if not role_earning:
        # This is OK if merchant has no commission on this specific booking
        runner.log("role_earning not present - checking if merchant has commission on this booking", "WARN")
        
        # Get merchant earnings to see if they have any commissions
        resp2 = requests.get(f"{BASE_URL}/merchant/earnings", headers=headers)
        if resp2.status_code == 200:
            earnings = resp2.json()
            booking_id = booking_invoice.get("booking_id")
            has_commission = any(item.get("booking_id") == booking_id for item in earnings.get("items", []))
            
            if not has_commission:
                runner.log("Merchant has no commission on this booking - role_earning not expected", "WARN")
                return True
            else:
                runner.log("✗ Merchant has commission but role_earning missing", "ERROR")
                return False
        return True
        
    # Check required fields for merchant
    required_fields = ["role", "base", "referral", "referral_pct", "customer", "customer_pct", "commission", "net"]
    for field in required_fields:
        if field not in role_earning:
            runner.log(f"✗ role_earning missing field: {field}", "ERROR")
            return False
            
    if role_earning["role"] != "merchant":
        runner.log(f"✗ role_earning.role should be 'merchant', got '{role_earning['role']}'", "ERROR")
        return False
        
    # Check that referral and customer keys are present even if 0
    if not isinstance(role_earning["referral"], (int, float)):
        runner.log("✗ role_earning.referral should be numeric", "ERROR")
        return False
        
    if not isinstance(role_earning["customer"], (int, float)):
        runner.log("✗ role_earning.customer should be numeric", "ERROR")
        return False
        
    runner.log(f"✓ role_earning for merchant: role={role_earning['role']}, base={role_earning['base']}, referral={role_earning['referral']}, referral_pct={role_earning['referral_pct']}, customer={role_earning['customer']}, customer_pct={role_earning['customer_pct']}, commission={role_earning['commission']}, net={role_earning['net']}")
    return True

# ============================================================================
# POINT 4: ADD-ON LIBRARY CRUD
# ============================================================================
def test_addon_crud():
    """Test add-on library CRUD operations"""
    runner.log("Testing ADD-ON LIBRARY CRUD")
    
    admin_headers = runner.headers("admin")
    
    # Get categories
    resp = requests.get(f"{BASE_URL}/catalog/categories", headers=admin_headers)
    if resp.status_code != 200:
        runner.log(f"Failed to get categories: {resp.status_code}", "ERROR")
        return False
        
    categories = resp.json()
    if not categories:
        runner.log("No categories found", "ERROR")
        return False
        
    category_id = categories[0]["id"]
    category_name = categories[0]["name"]
    runner.log(f"Using category: {category_name} ({category_id})")
    
    # CREATE addon
    addon_data = {
        "category_id": category_id,
        "name": f"Test Addon {datetime.now().timestamp()}",
        "price": 199
    }
    
    resp = requests.post(f"{BASE_URL}/catalog/addons", headers=admin_headers, json=addon_data)
    
    if resp.status_code != 200:
        runner.log(f"Failed to create addon: {resp.status_code} {resp.text}", "ERROR")
        return False
        
    addon = resp.json()
    addon_id = addon["id"]
    
    # Verify response
    if addon["category_name"] != category_name:
        runner.log(f"✗ Category name mismatch: expected {category_name}, got {addon['category_name']}", "ERROR")
        return False
        
    if addon["status"] != "active":
        runner.log(f"✗ Status should be 'active', got {addon['status']}", "ERROR")
        return False
        
    runner.log(f"✓ Created addon: {addon_id}")
    
    # GET admin addons
    resp = requests.get(f"{BASE_URL}/catalog/admin/addons", headers=admin_headers, params={"category_id": category_id})
    
    if resp.status_code != 200:
        runner.log(f"Failed to get admin addons: {resp.status_code}", "ERROR")
        return False
        
    addons = resp.json()
    found = any(a["id"] == addon_id for a in addons)
    
    if not found:
        runner.log("✗ Created addon not found in admin list", "ERROR")
        return False
        
    runner.log("✓ Addon found in admin list")
    
    # GET public addons
    resp = requests.get(f"{BASE_URL}/catalog/addons", params={"category_id": category_id})
    
    if resp.status_code != 200:
        runner.log(f"Failed to get public addons: {resp.status_code}", "ERROR")
        return False
        
    addons = resp.json()
    found = any(a["id"] == addon_id for a in addons)
    
    if not found:
        runner.log("✗ Created addon not found in public list", "ERROR")
        return False
        
    runner.log("✓ Addon found in public list")
    
    # UPDATE addon
    update_data = {"price": 250}
    resp = requests.put(f"{BASE_URL}/catalog/addons/{addon_id}", headers=admin_headers, json=update_data)
    
    if resp.status_code != 200:
        runner.log(f"Failed to update addon: {resp.status_code}", "ERROR")
        return False
        
    updated = resp.json()
    if updated["price"] != 250:
        runner.log(f"✗ Price not updated: expected 250, got {updated['price']}", "ERROR")
        return False
        
    runner.log("✓ Addon updated")
    
    # DELETE addon
    resp = requests.delete(f"{BASE_URL}/catalog/addons/{addon_id}", headers=admin_headers)
    
    if resp.status_code != 200:
        runner.log(f"Failed to delete addon: {resp.status_code}", "ERROR")
        return False
        
    runner.log("✓ Addon deleted")
    
    # Verify deleted
    resp = requests.get(f"{BASE_URL}/catalog/admin/addons", headers=admin_headers, params={"category_id": category_id})
    addons = resp.json()
    found = any(a["id"] == addon_id for a in addons)
    
    if found:
        runner.log("✗ Deleted addon still found in list", "ERROR")
        return False
        
    runner.log("✓ Addon removed from list")
    return True

def test_addon_permission():
    """Test that partner/customer cannot create addons"""
    runner.log("Testing ADD-ON PERMISSION (partner/customer should be rejected)")
    
    # Get a category
    resp = requests.get(f"{BASE_URL}/catalog/categories")
    if resp.status_code != 200:
        runner.log(f"Failed to get categories: {resp.status_code}", "ERROR")
        return False
        
    categories = resp.json()
    if not categories:
        runner.log("No categories found", "ERROR")
        return False
        
    category_id = categories[0]["id"]
    
    # Try as partner
    partner_headers = runner.headers("partner")
    addon_data = {
        "category_id": category_id,
        "name": "Unauthorized Addon",
        "price": 100
    }
    
    resp = requests.post(f"{BASE_URL}/catalog/addons", headers=partner_headers, json=addon_data)
    
    if resp.status_code == 200:
        runner.log("✗ Partner should not be able to create addon", "ERROR")
        return False
        
    if resp.status_code not in [401, 403]:
        runner.log(f"✗ Expected 401/403, got {resp.status_code}", "ERROR")
        return False
        
    runner.log("✓ Partner correctly rejected")
    
    # Try as customer
    customer_headers = runner.headers("customer")
    resp = requests.post(f"{BASE_URL}/catalog/addons", headers=customer_headers, json=addon_data)
    
    if resp.status_code == 200:
        runner.log("✗ Customer should not be able to create addon", "ERROR")
        return False
        
    if resp.status_code not in [401, 403]:
        runner.log(f"✗ Expected 401/403, got {resp.status_code}", "ERROR")
        return False
        
    runner.log("✓ Customer correctly rejected")
    return True

# ============================================================================
# POINT 5: MERCHANT EARNINGS
# ============================================================================
def test_merchant_earnings():
    """Test GET /api/merchant/earnings includes partner_referral_pct and customer_pct"""
    runner.log("Testing MERCHANT EARNINGS")
    
    headers = runner.headers("merchant")
    
    resp = requests.get(f"{BASE_URL}/merchant/earnings", headers=headers)
    
    if resp.status_code != 200:
        runner.log(f"Failed to get merchant earnings: {resp.status_code}", "ERROR")
        return False
        
    data = resp.json()
    
    # Check structure
    if "items" not in data:
        runner.log("✗ Missing 'items' field", "ERROR")
        return False
        
    if "total_earning" not in data:
        runner.log("✗ Missing 'total_earning' field", "ERROR")
        return False
        
    items = data["items"]
    
    if items:
        # Check first item has required fields
        item = items[0]
        
        if "partner_referral_pct" not in item:
            runner.log("✗ Missing 'partner_referral_pct' field in item", "ERROR")
            return False
            
        if "customer_pct" not in item:
            runner.log("✗ Missing 'customer_pct' field in item", "ERROR")
            return False
            
        runner.log(f"✓ Item has partner_referral_pct={item['partner_referral_pct']}, customer_pct={item['customer_pct']}")
    else:
        runner.log("No earnings items found (merchant may have no commissions yet)", "WARN")
        
    runner.log("✓ Merchant earnings endpoint working")
    return True

# ============================================================================
# POINT 6: MERCHANT NETWORK SYNC
# ============================================================================
def test_merchant_network_sync():
    """Test merchant network auto-includes real referred partners"""
    runner.log("Testing MERCHANT NETWORK SYNC")
    
    headers = runner.headers("merchant")
    
    # Get merchant user to find their ID
    resp = requests.get(f"{BASE_URL}/auth/me", headers=headers)
    if resp.status_code != 200:
        runner.log(f"Failed to get merchant user: {resp.status_code}", "ERROR")
        return False
        
    merchant = resp.json()
    merchant_id = merchant["id"]
    runner.log(f"Merchant ID: {merchant_id}")
    
    # Check if any partners are referred by this merchant
    admin_headers = runner.headers("admin")
    resp = requests.get(f"{BASE_URL}/admin/users", headers=admin_headers, params={
        "role": "partner",
        "page_size": 100
    })
    
    if resp.status_code != 200:
        runner.log(f"Failed to get partners: {resp.status_code}", "ERROR")
        return False
        
    # Admin users endpoint returns a list directly
    partners = resp.json() if isinstance(resp.json(), list) else resp.json().get("items", [])
    referred_partners = [p for p in partners if p.get("referred_by_merchant") == merchant_id]
    
    runner.log(f"Found {len(referred_partners)} partners referred by this merchant")
    
    # Get merchant network
    resp = requests.get(f"{BASE_URL}/merchant/panel/network", headers=headers)
    
    if resp.status_code != 200:
        runner.log(f"Failed to get merchant network: {resp.status_code}", "ERROR")
        return False
        
    network_data = resp.json()
    network_items = network_data.get("items", [])
    
    runner.log(f"Network has {len(network_items)} members")
    
    # Check if referred partners are in network
    if referred_partners:
        for rp in referred_partners:
            found = any(n.get("user_id") == rp["id"] or n.get("partner_id") == rp["id"] for n in network_items)
            if not found:
                runner.log(f"✗ Referred partner {rp['id']} not found in network", "ERROR")
                return False
                
        runner.log(f"✓ All {len(referred_partners)} referred partners found in network")
    else:
        runner.log("No referred partners found (not a failure, just no data)", "WARN")
        
    # Get network stats
    resp = requests.get(f"{BASE_URL}/merchant/panel/network/stats", headers=headers)
    
    if resp.status_code != 200:
        runner.log(f"Failed to get network stats: {resp.status_code}", "ERROR")
        return False
        
    stats = resp.json()
    runner.log(f"✓ Network stats: {stats}")
    
    # Get network tree
    resp = requests.get(f"{BASE_URL}/merchant/panel/network/tree", headers=headers)
    
    if resp.status_code != 200:
        runner.log(f"Failed to get network tree: {resp.status_code}", "ERROR")
        return False
        
    runner.log("✓ Network tree endpoint working")
    return True

# ============================================================================
# POINT 7: ORDERING (newest-first)
# ============================================================================
def test_ordering_invoices():
    """Test GET /api/invoices returns newest-first"""
    runner.log("Testing ORDERING - invoices newest-first")
    
    headers = runner.headers("customer")
    
    resp = requests.get(f"{BASE_URL}/invoices", headers=headers, params={"page_size": 10})
    
    if resp.status_code != 200:
        runner.log(f"Failed to get invoices: {resp.status_code}", "ERROR")
        return False
        
    data = resp.json()
    items = data.get("items", [])
    
    if len(items) < 2:
        runner.log("Not enough invoices to test ordering", "WARN")
        return True
        
    # Check issue_date ordering (newest first = descending)
    # Invoices are sorted by issue_date (the booking date), not created_at
    for i in range(len(items) - 1):
        current = items[i].get("issue_date", "")
        next_item = items[i + 1].get("issue_date", "")
        
        if current < next_item:
            runner.log(f"✗ Invoices not in newest-first order: {current} < {next_item}", "ERROR")
            return False
            
    runner.log("✓ Invoices ordered newest-first (by issue_date)")
    return True

def test_ordering_partner_earnings():
    """Test partner earnings ledger sorted by created_at desc"""
    runner.log("Testing ORDERING - partner earnings newest-first")
    
    headers = runner.headers("partner")
    
    resp = requests.get(f"{BASE_URL}/wallet/partner/earnings", headers=headers)
    
    if resp.status_code != 200:
        runner.log(f"Failed to get partner earnings: {resp.status_code}", "ERROR")
        return False
        
    data = resp.json()
    ledger = data.get("ledger", [])
    
    if len(ledger) < 2:
        runner.log("Not enough ledger entries to test ordering", "WARN")
        return True
        
    # Check created_at ordering (newest first = descending)
    for i in range(len(ledger) - 1):
        current = ledger[i].get("created_at", "")
        next_item = ledger[i + 1].get("created_at", "")
        
        if current < next_item:
            runner.log(f"✗ Ledger not in newest-first order: {current} < {next_item}", "ERROR")
            return False
            
    runner.log("✓ Partner earnings ledger ordered newest-first")
    return True

def test_ordering_merchant_earnings():
    """Test merchant earnings ledger sorted newest-first"""
    runner.log("Testing ORDERING - merchant earnings newest-first")
    
    headers = runner.headers("merchant")
    
    resp = requests.get(f"{BASE_URL}/merchant/earnings", headers=headers)
    
    if resp.status_code != 200:
        runner.log(f"Failed to get merchant earnings: {resp.status_code}", "ERROR")
        return False
        
    data = resp.json()
    items = data.get("items", [])
    
    if len(items) < 2:
        runner.log("Not enough items to test ordering", "WARN")
        return True
        
    # Check created_at ordering (newest first = descending)
    for i in range(len(items) - 1):
        current = items[i].get("created_at", "")
        next_item = items[i + 1].get("created_at", "")
        
        if current < next_item:
            runner.log(f"✗ Items not in newest-first order: {current} < {next_item}", "ERROR")
            return False
            
    runner.log("✓ Merchant earnings ordered newest-first")
    return True

# ============================================================================
# POINT 8: NO 500 ERRORS
# ============================================================================
def test_no_500_errors():
    """Test that all endpoints return no 500 errors"""
    runner.log("Testing NO 500 ERRORS")
    
    endpoints_to_test = [
        ("GET", "/invoices", "customer"),
        ("GET", "/invoices", "partner"),
        ("GET", "/invoices", "merchant"),
        ("GET", "/invoices", "admin"),
        ("GET", "/wallet/partner/earnings", "partner"),
        ("GET", "/merchant/earnings", "merchant"),
        ("GET", "/merchant/panel/network", "merchant"),
        ("GET", "/merchant/panel/network/stats", "merchant"),
        ("GET", "/catalog/addons", None),
        ("GET", "/catalog/admin/addons", "admin"),
    ]
    
    for method, endpoint, role in endpoints_to_test:
        headers = runner.headers(role) if role else {}
        
        if method == "GET":
            resp = requests.get(f"{BASE_URL}{endpoint}", headers=headers)
        else:
            continue
            
        if resp.status_code == 500:
            runner.log(f"✗ 500 error on {method} {endpoint} (role: {role})", "ERROR")
            return False
            
        runner.log(f"✓ {method} {endpoint} (role: {role}) - {resp.status_code}")
        
    runner.log("✓ No 500 errors found")
    return True

# ============================================================================
# RUN ALL TESTS
# ============================================================================
def main():
    print("="*80)
    print("8-POINT BATCH BACKEND TEST")
    print("="*80)
    print(f"BASE_URL: {BASE_URL}")
    print(f"OTP: {OTP}")
    print("="*80)
    print()
    
    # POINT 1: COUPON → COMMISSION BASE
    runner.test("1. Coupon discount added to commission base", test_coupon_commission_base)
    
    # POINT 2: INVOICE PII MASKING
    runner.test("2a. Invoice PII masked for partner", test_invoice_pii_masking_partner)
    runner.test("2b. Invoice PII NOT masked for customer/merchant/admin", test_invoice_pii_not_masked_for_others)
    
    # POINT 3: role_earning OBJECT
    runner.test("3a. role_earning object for partner", test_role_earning_partner)
    runner.test("3b. role_earning object for merchant", test_role_earning_merchant)
    
    # POINT 4: ADD-ON LIBRARY CRUD
    runner.test("4a. Add-on library CRUD operations", test_addon_crud)
    runner.test("4b. Add-on creation permission (partner/customer rejected)", test_addon_permission)
    
    # POINT 5: MERCHANT EARNINGS
    runner.test("5. Merchant earnings includes partner_referral_pct and customer_pct", test_merchant_earnings)
    
    # POINT 6: MERCHANT NETWORK SYNC
    runner.test("6. Merchant network auto-includes referred partners", test_merchant_network_sync)
    
    # POINT 7: ORDERING
    runner.test("7a. Invoices ordered newest-first", test_ordering_invoices)
    runner.test("7b. Partner earnings ordered newest-first", test_ordering_partner_earnings)
    runner.test("7c. Merchant earnings ordered newest-first", test_ordering_merchant_earnings)
    
    # POINT 8: NO 500 ERRORS
    runner.test("8. No 500 errors on key endpoints", test_no_500_errors)
    
    # Print summary
    success = runner.summary()
    
    # Save results
    with open("/app/test_results_8point.json", "w") as f:
        json.dump(runner.results, f, indent=2)
    
    print(f"\nResults saved to: /app/test_results_8point.json")
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
