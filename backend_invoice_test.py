#!/usr/bin/env python3
"""
Backend Invoice Testing Script for AzoApp
Tests the CONTINUATION task: Partner cancelled-order invoice role_earning changes
"""
import requests
import json
import sys
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://customer-auth-native.preview.emergentagent.com/api"
OTP = "123456"

# Test users
ADMIN_PHONE = "+919000000000"
PARTNER_PHONE = "+919000000003"  # Raj Kumar
CUSTOMER_PHONE = "+919000000004"  # Priya Verma

# Known test data from review request
CANCELLATION_INVOICE_ID = "df12dc19-573e-4bd5-b030-203b5141b81e"
CANCELLATION_BOOKING_CODE = "AZO1B9BA6"
PAID_BOOKING_CODE = "AZO3935BD"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'

def log(msg: str, color: str = Colors.RESET):
    print(f"{color}{msg}{Colors.RESET}")

def authenticate(phone: str) -> Optional[str]:
    """Authenticate and return token"""
    log(f"\n🔐 Authenticating {phone}...", Colors.BLUE)
    
    # In demo mode, directly verify OTP (no request-otp needed)
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    if resp.status_code != 200:
        log(f"❌ OTP verify failed: {resp.status_code} {resp.text}", Colors.RED)
        return None
    
    data = resp.json()
    token = data.get("token")
    if not token:
        log(f"❌ No token in response", Colors.RED)
        return None
    
    log(f"✅ Authenticated successfully", Colors.GREEN)
    return token

def get_headers(token: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

def test_partner_cancellation_invoice_json(token: str) -> Dict[str, Any]:
    """TEST 1: PARTNER cancelled-order earning (NEW) - JSON response"""
    log("\n" + "="*80, Colors.BLUE)
    log("TEST 1: PARTNER Cancellation Invoice JSON (role_earning)", Colors.BLUE)
    log("="*80, Colors.BLUE)
    
    results = {
        "test_name": "Partner Cancellation Invoice JSON",
        "passed": 0,
        "failed": 0,
        "tests": []
    }
    
    url = f"{BASE_URL}/invoices/{CANCELLATION_INVOICE_ID}"
    log(f"\n📡 GET {url}")
    
    resp = requests.get(url, headers=get_headers(token))
    log(f"Status: {resp.status_code}")
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Expected 200, got {resp.status_code}", Colors.RED)
        log(f"Response: {resp.text}", Colors.RED)
        results["failed"] += 1
        results["tests"].append({"name": "HTTP 200", "passed": False, "error": f"Got {resp.status_code}"})
        return results
    
    results["passed"] += 1
    results["tests"].append({"name": "HTTP 200", "passed": True})
    
    data = resp.json()
    log(f"\n📄 Response keys: {list(data.keys())}")
    
    # Check role_earning exists
    if "role_earning" not in data:
        log(f"❌ FAIL: role_earning field missing", Colors.RED)
        results["failed"] += 1
        results["tests"].append({"name": "role_earning exists", "passed": False, "error": "Field missing"})
        return results
    
    results["passed"] += 1
    results["tests"].append({"name": "role_earning exists", "passed": True})
    
    re = data["role_earning"]
    log(f"\n📊 role_earning: {json.dumps(re, indent=2)}", Colors.YELLOW)
    
    # Test is_cancellation
    test = {"name": "is_cancellation == true"}
    if re.get("is_cancellation") == True:
        log(f"✅ is_cancellation: {re.get('is_cancellation')}", Colors.GREEN)
        results["passed"] += 1
        test["passed"] = True
    else:
        log(f"❌ FAIL: is_cancellation = {re.get('is_cancellation')}, expected True", Colors.RED)
        results["failed"] += 1
        test["passed"] = False
        test["error"] = f"Got {re.get('is_cancellation')}"
    results["tests"].append(test)
    
    # Test net > 0 (Your Earning)
    test = {"name": "net > 0 (Your Earning)"}
    net = re.get("net")
    if net and float(net) > 0:
        log(f"✅ net (Your Earning): ₹{net}", Colors.GREEN)
        results["passed"] += 1
        test["passed"] = True
        test["value"] = net
    else:
        log(f"❌ FAIL: net = {net}, expected > 0", Colors.RED)
        results["failed"] += 1
        test["passed"] = False
        test["error"] = f"Got {net}"
    results["tests"].append(test)
    
    # Test platform > 0 (Platform Share)
    test = {"name": "platform > 0 (Platform Share)"}
    platform = re.get("platform")
    if platform and float(platform) > 0:
        log(f"✅ platform (Platform Share): ₹{platform}", Colors.GREEN)
        results["passed"] += 1
        test["passed"] = True
        test["value"] = platform
    else:
        log(f"❌ FAIL: platform = {platform}, expected > 0", Colors.RED)
        results["failed"] += 1
        test["passed"] = False
        test["error"] = f"Got {platform}"
    results["tests"].append(test)
    
    # Test base > 0 (Cancellation Charge)
    test = {"name": "base > 0 (Cancellation Charge)"}
    base = re.get("base")
    if base and float(base) > 0:
        log(f"✅ base (Cancellation Charge): ₹{base}", Colors.GREEN)
        results["passed"] += 1
        test["passed"] = True
        test["value"] = base
    else:
        log(f"❌ FAIL: base = {base}, expected > 0", Colors.RED)
        results["failed"] += 1
        test["passed"] = False
        test["error"] = f"Got {base}"
    results["tests"].append(test)
    
    # Test labels
    test = {"name": "net_label == 'Your Earning'"}
    net_label = re.get("net_label")
    if net_label == "Your Earning":
        log(f"✅ net_label: '{net_label}'", Colors.GREEN)
        results["passed"] += 1
        test["passed"] = True
    else:
        log(f"❌ FAIL: net_label = '{net_label}', expected 'Your Earning'", Colors.RED)
        results["failed"] += 1
        test["passed"] = False
        test["error"] = f"Got '{net_label}'"
    results["tests"].append(test)
    
    test = {"name": "service_label == 'Cancellation Charge'"}
    service_label = re.get("service_label")
    if service_label == "Cancellation Charge":
        log(f"✅ service_label: '{service_label}'", Colors.GREEN)
        results["passed"] += 1
        test["passed"] = True
    else:
        log(f"❌ FAIL: service_label = '{service_label}', expected 'Cancellation Charge'", Colors.RED)
        results["failed"] += 1
        test["passed"] = False
        test["error"] = f"Got '{service_label}'"
    results["tests"].append(test)
    
    test = {"name": "platform_label == 'Platform Share'"}
    platform_label = re.get("platform_label")
    if platform_label == "Platform Share":
        log(f"✅ platform_label: '{platform_label}'", Colors.GREEN)
        results["passed"] += 1
        test["passed"] = True
    else:
        log(f"❌ FAIL: platform_label = '{platform_label}', expected 'Platform Share'", Colors.RED)
        results["failed"] += 1
        test["passed"] = False
        test["error"] = f"Got '{platform_label}'"
    results["tests"].append(test)
    
    # Test rate is a number
    test = {"name": "rate is a number"}
    rate = re.get("rate")
    if rate is not None and isinstance(rate, (int, float)):
        log(f"✅ rate: {rate}%", Colors.GREEN)
        results["passed"] += 1
        test["passed"] = True
        test["value"] = rate
    else:
        log(f"❌ FAIL: rate = {rate}, expected a number", Colors.RED)
        results["failed"] += 1
        test["passed"] = False
        test["error"] = f"Got {rate} (type: {type(rate).__name__})"
    results["tests"].append(test)
    
    # Test customer phone masked
    test = {"name": "customer phone masked"}
    cust_snap = data.get("customer_snapshot", {})
    phone = cust_snap.get("phone")
    if phone == "*****":
        log(f"✅ customer phone masked: '{phone}'", Colors.GREEN)
        results["passed"] += 1
        test["passed"] = True
    else:
        log(f"❌ FAIL: customer phone = '{phone}', expected '*****'", Colors.RED)
        results["failed"] += 1
        test["passed"] = False
        test["error"] = f"Got '{phone}'"
    results["tests"].append(test)
    
    return results

def test_partner_cancellation_invoice_html(token: str) -> Dict[str, Any]:
    """TEST 2: PARTNER cancellation invoice HTML/preview (NEW)"""
    log("\n" + "="*80, Colors.BLUE)
    log("TEST 2: PARTNER Cancellation Invoice HTML (summary order)", Colors.BLUE)
    log("="*80, Colors.BLUE)
    
    results = {
        "test_name": "Partner Cancellation Invoice HTML",
        "passed": 0,
        "failed": 0,
        "tests": []
    }
    
    url = f"{BASE_URL}/invoices/{CANCELLATION_INVOICE_ID}/view"
    log(f"\n📡 GET {url}")
    
    resp = requests.get(url, headers=get_headers(token))
    log(f"Status: {resp.status_code}")
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Expected 200, got {resp.status_code}", Colors.RED)
        log(f"Response: {resp.text[:500]}", Colors.RED)
        results["failed"] += 1
        results["tests"].append({"name": "HTTP 200", "passed": False, "error": f"Got {resp.status_code}"})
        return results
    
    results["passed"] += 1
    results["tests"].append({"name": "HTTP 200", "passed": True})
    
    html = resp.text
    log(f"\n📄 HTML length: {len(html)} chars")
    
    # Check for required strings
    test = {"name": "Contains 'Cancellation Charge'"}
    if "Cancellation Charge" in html:
        log(f"✅ Found 'Cancellation Charge' in HTML", Colors.GREEN)
        results["passed"] += 1
        test["passed"] = True
    else:
        log(f"❌ FAIL: 'Cancellation Charge' not found in HTML", Colors.RED)
        results["failed"] += 1
        test["passed"] = False
    results["tests"].append(test)
    
    test = {"name": "Contains 'Platform Share'"}
    if "Platform Share" in html:
        log(f"✅ Found 'Platform Share' in HTML", Colors.GREEN)
        results["passed"] += 1
        test["passed"] = True
    else:
        log(f"❌ FAIL: 'Platform Share' not found in HTML", Colors.RED)
        results["failed"] += 1
        test["passed"] = False
    results["tests"].append(test)
    
    test = {"name": "Contains 'Your Earning'"}
    if "Your Earning" in html:
        log(f"✅ Found 'Your Earning' in HTML", Colors.GREEN)
        results["passed"] += 1
        test["passed"] = True
    else:
        log(f"❌ FAIL: 'Your Earning' not found in HTML", Colors.RED)
        results["failed"] += 1
        test["passed"] = False
    results["tests"].append(test)
    
    # Check NO GST/tax in summary for cancellation
    test = {"name": "NO 'GST' in summary (cancellation has no tax)"}
    # Look for GST in the summary section (after "Cancellation Charge")
    if "Cancellation Charge" in html:
        summary_section = html.split("Cancellation Charge")[1] if "Cancellation Charge" in html else html
        if "GST" not in summary_section[:1000]:  # Check next 1000 chars after Cancellation Charge
            log(f"✅ No 'GST' found in summary section", Colors.GREEN)
            results["passed"] += 1
            test["passed"] = True
        else:
            log(f"❌ FAIL: 'GST' found in summary section (should not be present for cancellation)", Colors.RED)
            results["failed"] += 1
            test["passed"] = False
    else:
        log(f"⚠️  SKIP: Cannot verify GST absence (Cancellation Charge not found)", Colors.YELLOW)
        test["passed"] = True
        test["skipped"] = True
    results["tests"].append(test)
    
    # Check NO Balance line
    test = {"name": "NO 'Balance' line in summary"}
    if "Balance" not in html or html.count("Balance") == 0:
        log(f"✅ No 'Balance' line found", Colors.GREEN)
        results["passed"] += 1
        test["passed"] = True
    else:
        log(f"❌ FAIL: 'Balance' line found (should not be present)", Colors.RED)
        results["failed"] += 1
        test["passed"] = False
    results["tests"].append(test)
    
    return results

def test_partner_paid_booking_invoice(token: str) -> Dict[str, Any]:
    """TEST 3: REGRESSION — PARTNER paid booking invoice"""
    log("\n" + "="*80, Colors.BLUE)
    log("TEST 3: REGRESSION - PARTNER Paid Booking Invoice", Colors.BLUE)
    log("="*80, Colors.BLUE)
    
    results = {
        "test_name": "Partner Paid Booking Invoice (Regression)",
        "passed": 0,
        "failed": 0,
        "tests": []
    }
    
    # First, get the list of invoices to find the booking invoice
    log(f"\n📡 GET {BASE_URL}/invoices (finding booking invoice for {PAID_BOOKING_CODE})")
    resp = requests.get(f"{BASE_URL}/invoices", headers=get_headers(token))
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Cannot list invoices: {resp.status_code}", Colors.RED)
        results["failed"] += 1
        results["tests"].append({"name": "List invoices", "passed": False, "error": f"Got {resp.status_code}"})
        return results
    
    results["passed"] += 1
    results["tests"].append({"name": "List invoices", "passed": True})
    
    data = resp.json()
    items = data.get("items", [])
    log(f"Found {len(items)} invoices")
    
    # Find booking invoice for AZO3935BD
    booking_invoice = None
    for inv in items:
        if inv.get("booking_code") == PAID_BOOKING_CODE and inv.get("invoice_type") == "booking":
            booking_invoice = inv
            break
    
    if not booking_invoice:
        log(f"❌ FAIL: Booking invoice for {PAID_BOOKING_CODE} not found", Colors.RED)
        results["failed"] += 1
        results["tests"].append({"name": "Find booking invoice", "passed": False, "error": "Not found"})
        return results
    
    results["passed"] += 1
    results["tests"].append({"name": "Find booking invoice", "passed": True})
    
    invoice_id = booking_invoice["id"]
    log(f"✅ Found booking invoice: {invoice_id}")
    
    # Get invoice detail
    url = f"{BASE_URL}/invoices/{invoice_id}"
    log(f"\n📡 GET {url}")
    resp = requests.get(url, headers=get_headers(token))
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Expected 200, got {resp.status_code}", Colors.RED)
        results["failed"] += 1
        results["tests"].append({"name": "GET invoice detail", "passed": False, "error": f"Got {resp.status_code}"})
        return results
    
    results["passed"] += 1
    results["tests"].append({"name": "GET invoice detail", "passed": True})
    
    inv_data = resp.json()
    
    # Check role_earning exists
    test = {"name": "role_earning exists"}
    if "role_earning" not in inv_data:
        log(f"❌ FAIL: role_earning missing", Colors.RED)
        results["failed"] += 1
        test["passed"] = False
        results["tests"].append(test)
        return results
    
    results["passed"] += 1
    test["passed"] = True
    results["tests"].append(test)
    
    re = inv_data["role_earning"]
    log(f"\n📊 role_earning: {json.dumps(re, indent=2)}", Colors.YELLOW)
    
    # Check service_cost > 0
    test = {"name": "service_cost > 0"}
    service_cost = re.get("service_cost")
    if service_cost and float(service_cost) > 0:
        log(f"✅ service_cost: ₹{service_cost}", Colors.GREEN)
        results["passed"] += 1
        test["passed"] = True
        test["value"] = service_cost
    else:
        log(f"❌ FAIL: service_cost = {service_cost}, expected > 0", Colors.RED)
        results["failed"] += 1
        test["passed"] = False
        test["error"] = f"Got {service_cost}"
    results["tests"].append(test)
    
    # Check commission present
    test = {"name": "commission present"}
    commission = re.get("commission")
    if commission is not None:
        log(f"✅ commission: ₹{commission}", Colors.GREEN)
        results["passed"] += 1
        test["passed"] = True
        test["value"] = commission
    else:
        log(f"❌ FAIL: commission missing", Colors.RED)
        results["failed"] += 1
        test["passed"] = False
    results["tests"].append(test)
    
    # Check net_label == "Net Earning"
    test = {"name": "net_label == 'Net Earning'"}
    net_label = re.get("net_label")
    if net_label == "Net Earning":
        log(f"✅ net_label: '{net_label}'", Colors.GREEN)
        results["passed"] += 1
        test["passed"] = True
    else:
        log(f"❌ FAIL: net_label = '{net_label}', expected 'Net Earning'", Colors.RED)
        results["failed"] += 1
        test["passed"] = False
        test["error"] = f"Got '{net_label}'"
    results["tests"].append(test)
    
    # Check net > 0
    test = {"name": "net > 0"}
    net = re.get("net")
    if net and float(net) > 0:
        log(f"✅ net: ₹{net}", Colors.GREEN)
        results["passed"] += 1
        test["passed"] = True
        test["value"] = net
    else:
        log(f"❌ FAIL: net = {net}, expected > 0", Colors.RED)
        results["failed"] += 1
        test["passed"] = False
        test["error"] = f"Got {net}"
    results["tests"].append(test)
    
    # Check is_cancellation is falsy
    test = {"name": "is_cancellation is falsy"}
    is_cancel = re.get("is_cancellation")
    if not is_cancel:
        log(f"✅ is_cancellation: {is_cancel} (falsy)", Colors.GREEN)
        results["passed"] += 1
        test["passed"] = True
    else:
        log(f"❌ FAIL: is_cancellation = {is_cancel}, expected falsy", Colors.RED)
        results["failed"] += 1
        test["passed"] = False
        test["error"] = f"Got {is_cancel}"
    results["tests"].append(test)
    
    # Get HTML view
    url = f"{BASE_URL}/invoices/{invoice_id}/view"
    log(f"\n📡 GET {url}")
    resp = requests.get(url, headers=get_headers(token))
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Expected 200, got {resp.status_code}", Colors.RED)
        results["failed"] += 1
        results["tests"].append({"name": "GET HTML view", "passed": False, "error": f"Got {resp.status_code}"})
        return results
    
    results["passed"] += 1
    results["tests"].append({"name": "GET HTML view", "passed": True})
    
    html = resp.text
    
    # Check order: cost lines first, then GST last, then Net Earning
    # Use LAST occurrence of each (the summary section)
    test = {"name": "HTML order: cost lines → GST → Net Earning"}
    if "Service Cost" in html and "GST" in html and "Net Earning" in html:
        service_pos = html.rfind("Service Cost")  # Last occurrence
        gst_pos = html.rfind("GST")  # Last occurrence
        net_pos = html.rfind("Net Earning")  # Last occurrence
        
        if service_pos < gst_pos < net_pos:
            log(f"✅ Correct order: Service Cost → GST → Net Earning", Colors.GREEN)
            results["passed"] += 1
            test["passed"] = True
        else:
            log(f"❌ FAIL: Incorrect order. Positions: Service Cost={service_pos}, GST={gst_pos}, Net Earning={net_pos}", Colors.RED)
            results["failed"] += 1
            test["passed"] = False
            test["error"] = f"Positions: Service Cost={service_pos}, GST={gst_pos}, Net Earning={net_pos}"
    else:
        log(f"⚠️  Cannot verify order (missing elements)", Colors.YELLOW)
        test["passed"] = True
        test["skipped"] = True
    results["tests"].append(test)
    
    # Check customer PII masked
    test = {"name": "Customer PII masked"}
    cust_snap = inv_data.get("customer_snapshot", {})
    phone = cust_snap.get("phone")
    if phone == "*****":
        log(f"✅ Customer phone masked: '{phone}'", Colors.GREEN)
        results["passed"] += 1
        test["passed"] = True
    else:
        log(f"❌ FAIL: Customer phone = '{phone}', expected '*****'", Colors.RED)
        results["failed"] += 1
        test["passed"] = False
        test["error"] = f"Got '{phone}'"
    results["tests"].append(test)
    
    return results

def test_customer_invoice_ordering(token: str) -> Dict[str, Any]:
    """TEST 4: REGRESSION — CUSTOMER invoice ordering"""
    log("\n" + "="*80, Colors.BLUE)
    log("TEST 4: REGRESSION - CUSTOMER Invoice Ordering", Colors.BLUE)
    log("="*80, Colors.BLUE)
    
    results = {
        "test_name": "Customer Invoice Ordering (Regression)",
        "passed": 0,
        "failed": 0,
        "tests": []
    }
    
    # Get list of invoices
    log(f"\n📡 GET {BASE_URL}/invoices")
    resp = requests.get(f"{BASE_URL}/invoices", headers=get_headers(token))
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Cannot list invoices: {resp.status_code}", Colors.RED)
        results["failed"] += 1
        results["tests"].append({"name": "List invoices", "passed": False, "error": f"Got {resp.status_code}"})
        return results
    
    results["passed"] += 1
    results["tests"].append({"name": "List invoices", "passed": True})
    
    data = resp.json()
    items = data.get("items", [])
    log(f"Found {len(items)} invoices")
    
    # Find a booking invoice
    booking_invoice = None
    for inv in items:
        if inv.get("invoice_type") == "booking":
            booking_invoice = inv
            break
    
    if not booking_invoice:
        log(f"⚠️  No booking invoice found for customer", Colors.YELLOW)
        results["tests"].append({"name": "Find booking invoice", "passed": True, "skipped": True})
        return results
    
    results["passed"] += 1
    results["tests"].append({"name": "Find booking invoice", "passed": True})
    
    invoice_id = booking_invoice["id"]
    log(f"✅ Found booking invoice: {invoice_id}")
    
    # Get HTML view
    url = f"{BASE_URL}/invoices/{invoice_id}/view"
    log(f"\n📡 GET {url}")
    resp = requests.get(url, headers=get_headers(token))
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Expected 200, got {resp.status_code}", Colors.RED)
        results["failed"] += 1
        results["tests"].append({"name": "GET HTML view", "passed": False, "error": f"Got {resp.status_code}"})
        return results
    
    results["passed"] += 1
    results["tests"].append({"name": "GET HTML view", "passed": True})
    
    html = resp.text
    
    # Check GST appears AFTER all cost/charge lines (Visiting Charge, Discount)
    test = {"name": "GST appears AFTER cost/charge lines"}
    
    # Find positions
    visiting_pos = html.find("Visiting Charge") if "Visiting Charge" in html else -1
    discount_pos = html.find("Discount") if "Discount" in html else -1
    gst_pos = html.find("GST") if "GST" in html else -1
    total_pos = html.find("Total")
    
    log(f"Positions: Visiting Charge={visiting_pos}, Discount={discount_pos}, GST={gst_pos}, Total={total_pos}")
    
    if gst_pos > 0:
        # GST should be after Visiting Charge (if present)
        if visiting_pos > 0 and gst_pos < visiting_pos:
            log(f"❌ FAIL: GST ({gst_pos}) appears BEFORE Visiting Charge ({visiting_pos})", Colors.RED)
            results["failed"] += 1
            test["passed"] = False
            test["error"] = f"GST before Visiting Charge"
        # GST should be after Discount (if present)
        elif discount_pos > 0 and gst_pos < discount_pos:
            log(f"❌ FAIL: GST ({gst_pos}) appears BEFORE Discount ({discount_pos})", Colors.RED)
            results["failed"] += 1
            test["passed"] = False
            test["error"] = f"GST before Discount"
        # GST should be before Total
        elif total_pos > 0 and gst_pos > total_pos:
            log(f"❌ FAIL: GST ({gst_pos}) appears AFTER Total ({total_pos})", Colors.RED)
            results["failed"] += 1
            test["passed"] = False
            test["error"] = f"GST after Total"
        else:
            log(f"✅ GST appears in correct position (after cost lines, before Total)", Colors.GREEN)
            results["passed"] += 1
            test["passed"] = True
    else:
        log(f"⚠️  GST not found in HTML", Colors.YELLOW)
        test["passed"] = True
        test["skipped"] = True
    
    results["tests"].append(test)
    
    return results

def test_no_500_errors(partner_token: str, customer_token: str) -> Dict[str, Any]:
    """TEST 5: No 500 errors on any endpoint"""
    log("\n" + "="*80, Colors.BLUE)
    log("TEST 5: No 500 Errors on Any Endpoint", Colors.BLUE)
    log("="*80, Colors.BLUE)
    
    results = {
        "test_name": "No 500 Errors",
        "passed": 0,
        "failed": 0,
        "tests": []
    }
    
    endpoints = [
        ("Partner GET /invoices", f"{BASE_URL}/invoices", partner_token),
        ("Customer GET /invoices", f"{BASE_URL}/invoices", customer_token),
        ("Partner GET cancellation invoice", f"{BASE_URL}/invoices/{CANCELLATION_INVOICE_ID}", partner_token),
        ("Partner GET cancellation HTML", f"{BASE_URL}/invoices/{CANCELLATION_INVOICE_ID}/view", partner_token),
    ]
    
    for name, url, token in endpoints:
        log(f"\n📡 {name}: {url}")
        resp = requests.get(url, headers=get_headers(token))
        log(f"Status: {resp.status_code}")
        
        test = {"name": name, "url": url}
        if resp.status_code == 500:
            log(f"❌ FAIL: Got 500 error", Colors.RED)
            log(f"Response: {resp.text[:500]}", Colors.RED)
            results["failed"] += 1
            test["passed"] = False
            test["error"] = "500 error"
        else:
            log(f"✅ No 500 error (got {resp.status_code})", Colors.GREEN)
            results["passed"] += 1
            test["passed"] = True
        
        results["tests"].append(test)
    
    return results

def main():
    log("\n" + "="*80, Colors.BLUE)
    log("🧪 AzoApp Backend Invoice Testing", Colors.BLUE)
    log("="*80, Colors.BLUE)
    log(f"Base URL: {BASE_URL}")
    log(f"Cancellation Invoice ID: {CANCELLATION_INVOICE_ID}")
    log(f"Cancellation Booking: {CANCELLATION_BOOKING_CODE}")
    log(f"Paid Booking: {PAID_BOOKING_CODE}")
    
    # Authenticate users
    partner_token = authenticate(PARTNER_PHONE)
    if not partner_token:
        log("❌ Failed to authenticate partner", Colors.RED)
        sys.exit(1)
    
    customer_token = authenticate(CUSTOMER_PHONE)
    if not customer_token:
        log("❌ Failed to authenticate customer", Colors.RED)
        sys.exit(1)
    
    # Run tests
    all_results = []
    
    # Test 1: Partner cancellation invoice JSON
    result1 = test_partner_cancellation_invoice_json(partner_token)
    all_results.append(result1)
    
    # Test 2: Partner cancellation invoice HTML
    result2 = test_partner_cancellation_invoice_html(partner_token)
    all_results.append(result2)
    
    # Test 3: Partner paid booking invoice (regression)
    result3 = test_partner_paid_booking_invoice(partner_token)
    all_results.append(result3)
    
    # Test 4: Customer invoice ordering (regression)
    result4 = test_customer_invoice_ordering(customer_token)
    all_results.append(result4)
    
    # Test 5: No 500 errors
    result5 = test_no_500_errors(partner_token, customer_token)
    all_results.append(result5)
    
    # Summary
    log("\n" + "="*80, Colors.BLUE)
    log("📊 TEST SUMMARY", Colors.BLUE)
    log("="*80, Colors.BLUE)
    
    total_passed = sum(r["passed"] for r in all_results)
    total_failed = sum(r["failed"] for r in all_results)
    total_tests = total_passed + total_failed
    
    for result in all_results:
        status = "✅ PASS" if result["failed"] == 0 else "❌ FAIL"
        color = Colors.GREEN if result["failed"] == 0 else Colors.RED
        log(f"{status} {result['test_name']}: {result['passed']}/{result['passed'] + result['failed']} tests passed", color)
    
    log(f"\n{'='*80}")
    if total_failed == 0:
        log(f"✅ ALL TESTS PASSED: {total_passed}/{total_tests}", Colors.GREEN)
    else:
        log(f"❌ SOME TESTS FAILED: {total_passed}/{total_tests} passed, {total_failed}/{total_tests} failed", Colors.RED)
    log(f"{'='*80}\n")
    
    # Save results
    with open("/app/invoice_test_results.json", "w") as f:
        json.dump({
            "summary": {
                "total_tests": total_tests,
                "passed": total_passed,
                "failed": total_failed,
                "success_rate": round(total_passed / total_tests * 100, 1) if total_tests > 0 else 0
            },
            "results": all_results
        }, f, indent=2)
    
    log(f"📄 Results saved to /app/invoice_test_results.json", Colors.BLUE)
    
    sys.exit(0 if total_failed == 0 else 1)

if __name__ == "__main__":
    main()
