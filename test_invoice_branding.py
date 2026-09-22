#!/usr/bin/env python3
"""
AzoApp Invoice Branding + Theme Backend Testing
Tests logo embedding, PDF size optimization, theme propagation, and render endpoints.
"""
import requests
import json
import time
import sys

# Configuration - read from frontend/.env
BASE_URL = "https://mobile-invoice-build.preview.emergentagent.com/api"

# Test accounts
ADMIN_PHONE = "+919000000000"
CUSTOMER_PHONE = "+919000000004"
DEMO_OTP = "123456"

# Test results
results = {
    "passed": 0,
    "failed": 0,
    "tests": []
}


def log(msg, level="INFO"):
    """Log message"""
    print(f"[{level}] {msg}")


def log_test(name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n{status} - {name}")
    if details:
        print(f"  {details}")
    
    results["tests"].append({
        "name": name,
        "passed": passed,
        "details": details
    })
    if passed:
        results["passed"] += 1
    else:
        results["failed"] += 1


def login(phone):
    """Login and return token"""
    log(f"Logging in as {phone}...")
    
    # Request OTP
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone}, timeout=10)
    if resp.status_code != 200:
        log(f"Failed to request OTP: {resp.status_code}", "ERROR")
        return None
    
    # Verify OTP
    resp = requests.post(
        f"{BASE_URL}/auth/verify-otp",
        json={"phone": phone, "otp": DEMO_OTP},
        timeout=10
    )
    
    if resp.status_code == 200:
        token = resp.json().get("token")
        log(f"Login successful, token: {token[:20]}...")
        return token
    else:
        log(f"OTP verification failed: {resp.status_code} - {resp.text}", "ERROR")
        return None


def get_invoice_id(token):
    """Get a real invoice ID from the system"""
    log("Fetching invoices...")
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{BASE_URL}/invoices?page_size=10", headers=headers, timeout=10)
    
    if resp.status_code != 200:
        log(f"Failed to fetch invoices: {resp.status_code}", "ERROR")
        return None
    
    data = resp.json()
    items = data.get("items", [])
    
    if not items:
        log("No invoices found in the system", "ERROR")
        return None
    
    invoice_id = items[0].get("id")
    invoice_number = items[0].get("invoice_number")
    log(f"Using invoice: {invoice_number} (ID: {invoice_id})")
    return invoice_id


def test_logo_embed(token, invoice_id):
    """Test 1: LOGO EMBED - HTML should contain embedded logo and default accent"""
    log("\n" + "="*80)
    log("TEST 1: LOGO EMBED IN HTML VIEW")
    log("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{BASE_URL}/invoices/{invoice_id}/view", headers=headers, timeout=10)
    
    # Check status code
    if resp.status_code != 200:
        log_test(
            "Logo Embed - HTTP 200",
            False,
            f"Expected 200, got {resp.status_code}"
        )
        return False
    
    log_test("Logo Embed - HTTP 200", True, "Status code is 200")
    
    # Check Content-Type
    content_type = resp.headers.get("content-type", "")
    if "text/html" not in content_type.lower():
        log_test(
            "Logo Embed - Content-Type",
            False,
            f"Expected text/html, got {content_type}"
        )
        return False
    
    log_test("Logo Embed - Content-Type", True, f"Content-Type is {content_type}")
    
    html = resp.text
    
    # Check for embedded logo (data:image)
    has_data_img = '<img' in html and 'src="data:image' in html
    log_test(
        "Logo Embed - Data URI Image",
        has_data_img,
        "Found '<img src=\"data:image' in HTML" if has_data_img else "No embedded logo found"
    )
    
    # Check for default accent color (#0D47A1 - azure)
    has_default_accent = '#0D47A1' in html
    log_test(
        "Logo Embed - Default Accent Color",
        has_default_accent,
        "Found default accent #0D47A1 (azure) in HTML" if has_default_accent else "Default accent not found"
    )
    
    return has_data_img and has_default_accent


def test_pdf_size(token, invoice_id):
    """Test 2: PDF SIZE - Should be reasonable (8KB-300KB), confirming logo downscaling"""
    log("\n" + "="*80)
    log("TEST 2: PDF SIZE OPTIMIZATION")
    log("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{BASE_URL}/invoices/{invoice_id}/pdf", headers=headers, timeout=15)
    
    # Check status code
    if resp.status_code != 200:
        log_test(
            "PDF Size - HTTP 200",
            False,
            f"Expected 200, got {resp.status_code}"
        )
        return False
    
    log_test("PDF Size - HTTP 200", True, "Status code is 200")
    
    # Check Content-Type
    content_type = resp.headers.get("content-type", "")
    if "application/pdf" not in content_type.lower():
        log_test(
            "PDF Size - Content-Type",
            False,
            f"Expected application/pdf, got {content_type}"
        )
        return False
    
    log_test("PDF Size - Content-Type", True, f"Content-Type is {content_type}")
    
    # Check PDF signature
    pdf_content = resp.content
    starts_with_pdf = pdf_content[:4] == b'%PDF'
    log_test(
        "PDF Size - PDF Signature",
        starts_with_pdf,
        "PDF starts with '%PDF'" if starts_with_pdf else "Invalid PDF signature"
    )
    
    # Check size (should be > 8KB but < 300KB)
    size_bytes = len(pdf_content)
    size_kb = size_bytes / 1024
    size_ok = 8000 < size_bytes < 300000
    
    log_test(
        "PDF Size - Size Check",
        size_ok,
        f"PDF size: {size_kb:.2f} KB ({size_bytes} bytes) - {'PASS' if size_ok else 'FAIL'} (expected 8KB-300KB)"
    )
    
    return starts_with_pdf and size_ok


def test_detail_stays_light(token, invoice_id):
    """Test 3: DETAIL STAYS LIGHT - JSON response should have URL, not giant data URI"""
    log("\n" + "="*80)
    log("TEST 3: DETAIL JSON STAYS LIGHT")
    log("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{BASE_URL}/invoices/{invoice_id}", headers=headers, timeout=10)
    
    # Check status code
    if resp.status_code != 200:
        log_test(
            "Detail Light - HTTP 200",
            False,
            f"Expected 200, got {resp.status_code}"
        )
        return False
    
    log_test("Detail Light - HTTP 200", True, "Status code is 200")
    
    data = resp.json()
    biz_snapshot = data.get("business_snapshot", {})
    logo = biz_snapshot.get("logo", "")
    
    # Check that logo is a URL/path, not a data URI
    is_url = logo.startswith("/api/media") or logo.startswith("http")
    is_data_uri = logo.startswith("data:")
    
    # Response size check
    response_size = len(resp.content)
    size_kb = response_size / 1024
    size_reasonable = response_size < 100000  # Less than 100KB
    
    log_test(
        "Detail Light - Logo Format",
        is_url and not is_data_uri,
        f"Logo: {logo[:50]}... - {'URL/path (PASS)' if is_url else 'Data URI (FAIL)' if is_data_uri else 'Empty/Other'}"
    )
    
    log_test(
        "Detail Light - Response Size",
        size_reasonable,
        f"Response size: {size_kb:.2f} KB ({response_size} bytes) - {'PASS' if size_reasonable else 'FAIL'} (expected < 100KB)"
    )
    
    return is_url and not is_data_uri and size_reasonable


def test_render_html_endpoint(admin_token, customer_token):
    """Test 4: RENDER HTML ENDPOINT - Custom theme, auth checks"""
    log("\n" + "="*80)
    log("TEST 4: RENDER HTML ENDPOINT")
    log("="*80)
    
    # Get sample invoice data
    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.get(f"{BASE_URL}/invoices/preview/sample", headers=headers, timeout=10)
    
    if resp.status_code != 200:
        log_test(
            "Render HTML - Get Sample",
            False,
            f"Failed to get sample invoice: {resp.status_code}"
        )
        return False
    
    sample = resp.json()
    log_test("Render HTML - Get Sample", True, "Got sample invoice data")
    
    # Modify theme
    sample["business_snapshot"]["accent"] = "#047857"  # emerald
    sample["business_snapshot"]["letterhead"] = "band"
    
    # Test with admin token - should work
    resp = requests.post(
        f"{BASE_URL}/invoices/render/html",
        headers=headers,
        json=sample,
        timeout=10
    )
    
    if resp.status_code != 200:
        log_test(
            "Render HTML - Admin Auth",
            False,
            f"Expected 200, got {resp.status_code}"
        )
        return False
    
    log_test("Render HTML - Admin Auth", True, "Admin can render HTML")
    
    html = resp.text
    has_emerald = "#047857" in html
    log_test(
        "Render HTML - Custom Accent",
        has_emerald,
        "Found custom accent #047857 (emerald) in HTML" if has_emerald else "Custom accent not applied"
    )
    
    # Test without token - should be 401
    resp = requests.post(
        f"{BASE_URL}/invoices/render/html",
        json=sample,
        timeout=10
    )
    
    is_401 = resp.status_code == 401
    log_test(
        "Render HTML - No Auth",
        is_401,
        f"No token → {resp.status_code} {'(PASS)' if is_401 else '(FAIL, expected 401)'}"
    )
    
    # Test with customer token - should be 403
    customer_headers = {"Authorization": f"Bearer {customer_token}"}
    resp = requests.post(
        f"{BASE_URL}/invoices/render/html",
        headers=customer_headers,
        json=sample,
        timeout=10
    )
    
    is_403 = resp.status_code == 403
    log_test(
        "Render HTML - Customer Auth",
        is_403,
        f"Customer token → {resp.status_code} {'(PASS)' if is_403 else '(FAIL, expected 403)'}"
    )
    
    return has_emerald and is_401 and is_403


def test_live_theme_propagation(token, invoice_id):
    """Test 5: LIVE THEME PROPAGATION - Theme changes should reflect in invoice view"""
    log("\n" + "="*80)
    log("TEST 5: LIVE THEME PROPAGATION")
    log("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get current settings
    resp = requests.get(f"{BASE_URL}/admin/settings", headers=headers, timeout=10)
    if resp.status_code != 200:
        log_test(
            "Theme Propagation - Get Settings",
            False,
            f"Failed to get settings: {resp.status_code}"
        )
        return False
    
    original_settings = resp.json()
    original_invoice_config = original_settings.get("invoice_config", {})
    log_test("Theme Propagation - Get Settings", True, "Got current settings")
    
    # Change theme to emerald + band
    new_invoice_config = dict(original_invoice_config)
    new_invoice_config["invoice_theme"] = "emerald"
    new_invoice_config["letterhead"] = "band"
    
    resp = requests.put(
        f"{BASE_URL}/admin/settings",
        headers=headers,
        json={"invoice_config": new_invoice_config},
        timeout=10
    )
    
    if resp.status_code != 200:
        log_test(
            "Theme Propagation - Update to Emerald",
            False,
            f"Failed to update settings: {resp.status_code}"
        )
        return False
    
    log_test("Theme Propagation - Update to Emerald", True, "Updated theme to emerald/band")
    time.sleep(1)  # Brief pause
    
    # Get invoice view - should show emerald accent
    resp = requests.get(f"{BASE_URL}/invoices/{invoice_id}/view", headers=headers, timeout=10)
    
    if resp.status_code != 200:
        log_test(
            "Theme Propagation - View with Emerald",
            False,
            f"Failed to get invoice view: {resp.status_code}"
        )
        # Restore settings before returning
        requests.put(
            f"{BASE_URL}/admin/settings",
            headers=headers,
            json={"invoice_config": original_invoice_config},
            timeout=10
        )
        return False
    
    html = resp.text
    has_emerald = "#047857" in html
    log_test(
        "Theme Propagation - Emerald Applied",
        has_emerald,
        "Invoice view contains #047857 (emerald)" if has_emerald else "Emerald accent not found"
    )
    
    # Restore original theme (azure + classic)
    restore_config = dict(original_invoice_config)
    restore_config["invoice_theme"] = "azure"
    restore_config["letterhead"] = "classic"
    
    resp = requests.put(
        f"{BASE_URL}/admin/settings",
        headers=headers,
        json={"invoice_config": restore_config},
        timeout=10
    )
    
    if resp.status_code != 200:
        log_test(
            "Theme Propagation - Restore Azure",
            False,
            f"Failed to restore settings: {resp.status_code}"
        )
        return False
    
    log_test("Theme Propagation - Restore Azure", True, "Restored theme to azure/classic")
    time.sleep(1)  # Brief pause
    
    # Get invoice view again - should show azure accent
    resp = requests.get(f"{BASE_URL}/invoices/{invoice_id}/view", headers=headers, timeout=10)
    
    if resp.status_code != 200:
        log_test(
            "Theme Propagation - View with Azure",
            False,
            f"Failed to get invoice view: {resp.status_code}"
        )
        return False
    
    html = resp.text
    has_azure = "#0D47A1" in html
    log_test(
        "Theme Propagation - Azure Restored",
        has_azure,
        "Invoice view contains #0D47A1 (azure)" if has_azure else "Azure accent not found"
    )
    
    return has_emerald and has_azure


def test_render_pdf_endpoint(token):
    """Test 6: RENDER PDF ENDPOINT - Should return 200 application/pdf"""
    log("\n" + "="*80)
    log("TEST 6: RENDER PDF ENDPOINT")
    log("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get sample invoice data
    resp = requests.get(f"{BASE_URL}/invoices/preview/sample", headers=headers, timeout=10)
    
    if resp.status_code != 200:
        log_test(
            "Render PDF - Get Sample",
            False,
            f"Failed to get sample invoice: {resp.status_code}"
        )
        return False
    
    sample = resp.json()
    log_test("Render PDF - Get Sample", True, "Got sample invoice data")
    
    # Render PDF
    resp = requests.post(
        f"{BASE_URL}/invoices/render/pdf",
        headers=headers,
        json=sample,
        timeout=15
    )
    
    if resp.status_code != 200:
        log_test(
            "Render PDF - HTTP 200",
            False,
            f"Expected 200, got {resp.status_code}"
        )
        return False
    
    log_test("Render PDF - HTTP 200", True, "Status code is 200")
    
    # Check Content-Type
    content_type = resp.headers.get("content-type", "")
    is_pdf = "application/pdf" in content_type.lower()
    log_test(
        "Render PDF - Content-Type",
        is_pdf,
        f"Content-Type is {content_type}"
    )
    
    return is_pdf


def main():
    """Run all tests"""
    log("="*80)
    log("AZOAPP INVOICE BRANDING + THEME BACKEND TESTING")
    log("="*80)
    log(f"Base URL: {BASE_URL}")
    
    # Login as admin
    admin_token = login(ADMIN_PHONE)
    if not admin_token:
        log("Failed to login as admin", "ERROR")
        sys.exit(1)
    
    # Login as customer (for auth tests)
    customer_token = login(CUSTOMER_PHONE)
    if not customer_token:
        log("Failed to login as customer", "ERROR")
        sys.exit(1)
    
    # Get a real invoice ID
    invoice_id = get_invoice_id(admin_token)
    if not invoice_id:
        log("Failed to get invoice ID", "ERROR")
        sys.exit(1)
    
    # Run tests
    test_logo_embed(admin_token, invoice_id)
    test_pdf_size(admin_token, invoice_id)
    test_detail_stays_light(admin_token, invoice_id)
    test_render_html_endpoint(admin_token, customer_token)
    test_live_theme_propagation(admin_token, invoice_id)
    test_render_pdf_endpoint(admin_token)
    
    # Summary
    log("\n" + "="*80)
    log("TEST SUMMARY")
    log("="*80)
    log(f"Total Tests: {results['passed'] + results['failed']}")
    log(f"Passed: {results['passed']} ✅")
    log(f"Failed: {results['failed']} ❌")
    
    if results['failed'] == 0:
        log("\n🎉 ALL TESTS PASSED!", "SUCCESS")
        sys.exit(0)
    else:
        log(f"\n⚠️  {results['failed']} TEST(S) FAILED", "ERROR")
        sys.exit(1)


if __name__ == "__main__":
    main()
