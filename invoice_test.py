#!/usr/bin/env python3
"""
Comprehensive test for NEW invoice enhancement endpoints in AzoApp.
Tests GST report CSV, bulk ZIP download, email invoice, authorization, and regression.
"""
import requests
import sys
import io
import csv
import zipfile
from pymongo import MongoClient
import os

# Configuration
BACKEND_URL = "https://partner-ui-mirror.preview.emergentagent.com/api"
ADMIN_PHONE = "+919000000000"
CUSTOMER_PHONE = "+919000000004"
MERCHANT_PHONE = "+919000000002"
PARTNER_PHONE = "+919000000003"
OTP = "123456"

# MongoDB connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = "azoapp_database"

# Test results
passed = 0
failed = 0
test_results = []


def log_test(name, success, message=""):
    """Log test result"""
    global passed, failed
    status = "✅ PASS" if success else "❌ FAIL"
    result = f"{status}: {name}"
    if message:
        result += f" - {message}"
    print(result)
    test_results.append({"name": name, "success": success, "message": message})
    if success:
        passed += 1
    else:
        failed += 1


def login(phone):
    """Login and get JWT token"""
    # Send OTP
    resp = requests.post(f"{BACKEND_URL}/auth/send-otp", json={"phone": phone})
    if resp.status_code != 200:
        print(f"❌ Failed to send OTP to {phone}: {resp.status_code} {resp.text}")
        return None
    
    # Verify OTP
    resp = requests.post(f"{BACKEND_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    if resp.status_code != 200:
        print(f"❌ Failed to verify OTP for {phone}: {resp.status_code} {resp.text}")
        return None
    
    data = resp.json()
    token = data.get("token")
    user = data.get("user", {})
    print(f"✅ Logged in as {user.get('name')} (role: {user.get('role')}, phone: {phone})")
    return token


def ensure_invoices_exist(admin_token):
    """Ensure invoices exist by calling sync endpoint"""
    print("\n=== ENSURING INVOICES EXIST ===")
    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.post(f"{BACKEND_URL}/invoices/sync", headers=headers)
    if resp.status_code == 200:
        print("✅ Invoice sync completed")
        return True
    else:
        print(f"⚠️  Invoice sync returned {resp.status_code}: {resp.text[:200]}")
        return False


def test_gst_report_csv(admin_token):
    """TEST 1: GET /api/invoices/report/gst?year=2026 (admin only)"""
    print("\n=== TEST 1: GST Report CSV (Admin) ===")
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test with year=2026
    resp = requests.get(f"{BACKEND_URL}/invoices/report/gst?year=2026", headers=headers)
    
    if resp.status_code != 200:
        log_test("GST Report CSV - Status Code", False, f"Expected 200, got {resp.status_code}: {resp.text[:200]}")
        return None
    
    log_test("GST Report CSV - Status Code", True, "Returned 200")
    
    # Check Content-Type
    content_type = resp.headers.get("Content-Type", "")
    if "text/csv" not in content_type:
        log_test("GST Report CSV - Content-Type", False, f"Expected text/csv, got {content_type}")
    else:
        log_test("GST Report CSV - Content-Type", True, "Content-Type is text/csv")
    
    # Check Content-Disposition header
    content_disp = resp.headers.get("Content-Disposition", "")
    if "attachment" not in content_disp:
        log_test("GST Report CSV - Content-Disposition", False, f"Expected 'attachment' in header, got: {content_disp}")
    else:
        log_test("GST Report CSV - Content-Disposition", True, f"Content-Disposition header present: {content_disp}")
    
    # Parse CSV and verify structure
    try:
        csv_content = resp.text
        lines = csv_content.strip().split('\n')
        
        if len(lines) < 3:
            log_test("GST Report CSV - Structure", False, f"Expected at least 3 lines (title, header, data), got {len(lines)}")
            return None
        
        # Check title line
        if "GST" not in lines[0] and "Tax" not in lines[0]:
            log_test("GST Report CSV - Title Line", False, f"Title line doesn't contain 'GST' or 'Tax': {lines[0]}")
        else:
            log_test("GST Report CSV - Title Line", True, f"Title line present: {lines[0]}")
        
        # Parse header row
        reader = csv.reader(io.StringIO(csv_content))
        rows = list(reader)
        
        if len(rows) < 2:
            log_test("GST Report CSV - Header Row", False, "Could not parse CSV rows")
            return None
        
        header = rows[1]  # Second row should be header
        expected_cols = ["Month", "Invoices", "Subtotal", "Discount", "Tax/GST", "Total"]
        
        if header != expected_cols:
            log_test("GST Report CSV - Header Row", False, f"Expected {expected_cols}, got {header}")
        else:
            log_test("GST Report CSV - Header Row", True, "Header row matches expected format")
        
        # Check for 12 month rows + TOTAL row
        data_rows = rows[2:]  # Skip title and header
        if len(data_rows) < 13:
            log_test("GST Report CSV - Month Rows", False, f"Expected 13 rows (12 months + TOTAL), got {len(data_rows)}")
        else:
            log_test("GST Report CSV - Month Rows", True, f"Found {len(data_rows)} rows (12 months + TOTAL)")
        
        # Check TOTAL row exists
        total_row = data_rows[-1] if data_rows else []
        if total_row and total_row[0] == "TOTAL":
            log_test("GST Report CSV - TOTAL Row", True, "TOTAL row present at end")
        else:
            log_test("GST Report CSV - TOTAL Row", False, f"TOTAL row not found, last row: {total_row}")
        
        return csv_content
        
    except Exception as e:
        log_test("GST Report CSV - Parsing", False, f"Failed to parse CSV: {str(e)}")
        return None


def test_bulk_zip(admin_token):
    """TEST 2: GET /api/invoices/bulk/zip?range=all (admin only)"""
    print("\n=== TEST 2: Bulk ZIP Download (Admin) ===")
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    resp = requests.get(f"{BACKEND_URL}/invoices/bulk/zip?range=all", headers=headers)
    
    if resp.status_code != 200:
        log_test("Bulk ZIP - Status Code", False, f"Expected 200, got {resp.status_code}: {resp.text[:200]}")
        return None
    
    log_test("Bulk ZIP - Status Code", True, "Returned 200")
    
    # Check Content-Type
    content_type = resp.headers.get("Content-Type", "")
    if "application/zip" not in content_type:
        log_test("Bulk ZIP - Content-Type", False, f"Expected application/zip, got {content_type}")
    else:
        log_test("Bulk ZIP - Content-Type", True, "Content-Type is application/zip")
    
    # Check body is non-empty
    if len(resp.content) == 0:
        log_test("Bulk ZIP - Non-Empty Body", False, "Response body is empty")
        return None
    
    log_test("Bulk ZIP - Non-Empty Body", True, f"Response body size: {len(resp.content)} bytes")
    
    # Verify it's a valid ZIP file
    try:
        zip_file = zipfile.ZipFile(io.BytesIO(resp.content))
        file_list = zip_file.namelist()
        
        if len(file_list) == 0:
            log_test("Bulk ZIP - Valid ZIP", False, "ZIP file is empty (no files inside)")
            return None
        
        log_test("Bulk ZIP - Valid ZIP", True, f"ZIP contains {len(file_list)} files")
        
        # Check for PDF files named like INV-*.pdf
        pdf_files = [f for f in file_list if f.endswith('.pdf')]
        if len(pdf_files) == 0:
            log_test("Bulk ZIP - PDF Files", False, "No PDF files found in ZIP")
        else:
            log_test("Bulk ZIP - PDF Files", True, f"Found {len(pdf_files)} PDF files")
        
        # Check naming pattern (INV-*.pdf)
        inv_pattern_files = [f for f in pdf_files if f.startswith('INV-')]
        if len(inv_pattern_files) > 0:
            log_test("Bulk ZIP - INV-*.pdf Pattern", True, f"Found {len(inv_pattern_files)} files matching INV-*.pdf pattern")
        else:
            log_test("Bulk ZIP - INV-*.pdf Pattern", False, f"No files matching INV-*.pdf pattern. Files: {pdf_files[:5]}")
        
        return file_list
        
    except zipfile.BadZipFile as e:
        log_test("Bulk ZIP - Valid ZIP", False, f"Invalid ZIP file: {str(e)}")
        return None
    except Exception as e:
        log_test("Bulk ZIP - Verification", False, f"Error verifying ZIP: {str(e)}")
        return None


def test_email_invoice(admin_token):
    """TEST 3: POST /api/invoices/{id}/email (authenticated owner/admin)"""
    print("\n=== TEST 3: Email Invoice (Admin) ===")
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # First, get list of invoices to find an ID
    resp = requests.get(f"{BACKEND_URL}/invoices", headers=headers)
    if resp.status_code != 200:
        log_test("Email Invoice - Get Invoice List", False, f"Failed to get invoices: {resp.status_code}")
        return None
    
    data = resp.json()
    items = data.get("items", [])
    
    if len(items) == 0:
        log_test("Email Invoice - Get Invoice List", False, "No invoices found to test email")
        return None
    
    invoice_id = items[0].get("id")
    log_test("Email Invoice - Get Invoice List", True, f"Found invoice ID: {invoice_id}")
    
    # Try to email the invoice
    resp = requests.post(f"{BACKEND_URL}/invoices/{invoice_id}/email", headers=headers)
    
    # Since no SMTP is configured and demo customer has no email, expect 400 with clear message
    if resp.status_code == 500:
        log_test("Email Invoice - Not 500 Error", False, f"Got 500 error (should be 400): {resp.text[:200]}")
        return None
    
    log_test("Email Invoice - Not 500 Error", True, "Did not return 500 error")
    
    if resp.status_code == 400:
        error_msg = resp.text
        # Check for clear error message about email not configured OR no email address
        if "email" in error_msg.lower() or "configured" in error_msg.lower() or "smtp" in error_msg.lower():
            log_test("Email Invoice - Clear Error Message", True, f"Returned 400 with clear message: {error_msg[:100]}")
        else:
            log_test("Email Invoice - Clear Error Message", False, f"400 error but unclear message: {error_msg[:200]}")
    elif resp.status_code == 200:
        log_test("Email Invoice - Response", True, "Email sent successfully (200)")
    else:
        log_test("Email Invoice - Response", False, f"Unexpected status code: {resp.status_code}, body: {resp.text[:200]}")
    
    return invoice_id


def test_authorization_customer(customer_token):
    """TEST 4: Authorization - Customer should get 403 on admin-only endpoints"""
    print("\n=== TEST 4: Authorization - Customer Access to Admin Endpoints ===")
    headers = {"Authorization": f"Bearer {customer_token}"}
    
    # Test GST report (admin only)
    resp = requests.get(f"{BACKEND_URL}/invoices/report/gst?year=2026", headers=headers)
    if resp.status_code == 403:
        log_test("Customer Access - GST Report (403)", True, "Customer correctly denied access (403)")
    else:
        log_test("Customer Access - GST Report (403)", False, f"Expected 403, got {resp.status_code}: {resp.text[:200]}")
    
    # Test bulk ZIP (admin only)
    resp = requests.get(f"{BACKEND_URL}/invoices/bulk/zip?range=all", headers=headers)
    if resp.status_code == 403:
        log_test("Customer Access - Bulk ZIP (403)", True, "Customer correctly denied access (403)")
    else:
        log_test("Customer Access - Bulk ZIP (403)", False, f"Expected 403, got {resp.status_code}: {resp.text[:200]}")


def test_cross_access_email(admin_token, customer_token):
    """TEST 5: Cross-access email - Customer should get 403 for invoice they don't own"""
    print("\n=== TEST 5: Cross-Access Email Authorization ===")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    customer_headers = {"Authorization": f"Bearer {customer_token}"}
    
    # Get all invoices as admin
    resp = requests.get(f"{BACKEND_URL}/invoices", headers=admin_headers)
    if resp.status_code != 200:
        log_test("Cross-Access Email - Get Invoices", False, f"Failed to get invoices: {resp.status_code}")
        return
    
    data = resp.json()
    items = data.get("items", [])
    
    # Find an invoice that does NOT belong to customer +919000000004
    # Look for merchant/partner withdrawal invoices or bookings for other customers
    customer_id = None
    
    # First get customer ID
    resp = requests.get(f"{BACKEND_URL}/invoices", headers=customer_headers)
    if resp.status_code == 200:
        cust_data = resp.json()
        cust_items = cust_data.get("items", [])
        if cust_items:
            customer_id = cust_items[0].get("customer_id")
    
    # Find invoice NOT belonging to this customer
    other_invoice_id = None
    for inv in items:
        # Skip if this invoice belongs to the customer
        if inv.get("customer_id") == customer_id:
            continue
        # Found an invoice that doesn't belong to customer
        other_invoice_id = inv.get("id")
        invoice_type = inv.get("invoice_type")
        print(f"  Found invoice {other_invoice_id} (type: {invoice_type}) not belonging to customer")
        break
    
    if not other_invoice_id:
        log_test("Cross-Access Email - Find Other Invoice", False, "Could not find invoice not belonging to customer")
        return
    
    log_test("Cross-Access Email - Find Other Invoice", True, f"Found invoice {other_invoice_id} not owned by customer")
    
    # Try to email this invoice as customer
    resp = requests.post(f"{BACKEND_URL}/invoices/{other_invoice_id}/email", headers=customer_headers)
    
    if resp.status_code == 403:
        log_test("Cross-Access Email - 403 Forbidden", True, "Customer correctly denied access to other's invoice (403)")
    else:
        log_test("Cross-Access Email - 403 Forbidden", False, f"Expected 403, got {resp.status_code}: {resp.text[:200]}")


def test_regression_list_invoices(admin_token, customer_token):
    """TEST 6: Regression - GET /api/invoices still works with role scoping"""
    print("\n=== TEST 6: Regression - List Invoices with Role Scoping ===")
    
    # Test as admin
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.get(f"{BACKEND_URL}/invoices", headers=admin_headers)
    
    if resp.status_code != 200:
        log_test("Regression - Admin List Invoices", False, f"Expected 200, got {resp.status_code}: {resp.text[:200]}")
    else:
        data = resp.json()
        required_keys = ["items", "total", "page", "page_size", "pages", "summary"]
        missing_keys = [k for k in required_keys if k not in data]
        
        if missing_keys:
            log_test("Regression - Admin List Invoices", False, f"Missing keys: {missing_keys}")
        else:
            log_test("Regression - Admin List Invoices", True, f"Returned valid structure with {len(data.get('items', []))} items")
    
    # Test as customer (should only see own invoices)
    customer_headers = {"Authorization": f"Bearer {customer_token}"}
    resp = requests.get(f"{BACKEND_URL}/invoices", headers=customer_headers)
    
    if resp.status_code != 200:
        log_test("Regression - Customer List Invoices", False, f"Expected 200, got {resp.status_code}: {resp.text[:200]}")
    else:
        data = resp.json()
        items = data.get("items", [])
        
        # Verify all items belong to customer
        if items:
            # Get customer ID from first item
            customer_id = items[0].get("customer_id")
            all_belong_to_customer = all(inv.get("customer_id") == customer_id for inv in items)
            
            if all_belong_to_customer:
                log_test("Regression - Customer Role Scoping", True, f"Customer sees only own invoices ({len(items)} items)")
            else:
                log_test("Regression - Customer Role Scoping", False, "Customer sees invoices from other users")
        else:
            log_test("Regression - Customer Role Scoping", True, "Customer has no invoices (empty list ok)")


def test_regression_get_invoice(admin_token, customer_token):
    """TEST 7: Regression - GET /api/invoices/{id} enforces 403 on cross-access"""
    print("\n=== TEST 7: Regression - Get Invoice with Cross-Access Check ===")
    
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    customer_headers = {"Authorization": f"Bearer {customer_token}"}
    
    # Get all invoices as admin
    resp = requests.get(f"{BACKEND_URL}/invoices", headers=admin_headers)
    if resp.status_code != 200:
        log_test("Regression - Get Invoice Setup", False, "Failed to get invoices")
        return
    
    data = resp.json()
    items = data.get("items", [])
    
    if len(items) == 0:
        log_test("Regression - Get Invoice Setup", False, "No invoices to test")
        return
    
    # Get customer's own invoices
    resp = requests.get(f"{BACKEND_URL}/invoices", headers=customer_headers)
    if resp.status_code != 200:
        log_test("Regression - Get Customer Invoices", False, "Failed to get customer invoices")
        return
    
    cust_data = resp.json()
    cust_items = cust_data.get("items", [])
    
    # Test 1: Customer can access their own invoice
    if cust_items:
        own_invoice_id = cust_items[0].get("id")
        resp = requests.get(f"{BACKEND_URL}/invoices/{own_invoice_id}", headers=customer_headers)
        
        if resp.status_code == 200:
            log_test("Regression - Customer Access Own Invoice", True, "Customer can access own invoice (200)")
        else:
            log_test("Regression - Customer Access Own Invoice", False, f"Expected 200, got {resp.status_code}")
    
    # Test 2: Customer gets 403 for other's invoice
    customer_id = cust_items[0].get("customer_id") if cust_items else None
    other_invoice_id = None
    
    for inv in items:
        if inv.get("customer_id") != customer_id:
            other_invoice_id = inv.get("id")
            break
    
    if other_invoice_id:
        resp = requests.get(f"{BACKEND_URL}/invoices/{other_invoice_id}", headers=customer_headers)
        
        if resp.status_code == 403:
            log_test("Regression - Customer Cross-Access 403", True, "Customer correctly denied access to other's invoice (403)")
        else:
            log_test("Regression - Customer Cross-Access 403", False, f"Expected 403, got {resp.status_code}: {resp.text[:200]}")
    else:
        log_test("Regression - Customer Cross-Access 403", True, "No other invoices to test (skipped)")


def main():
    """Run all tests"""
    print("=" * 80)
    print("AZOAPP INVOICE ENHANCEMENT ENDPOINTS TEST")
    print("Testing NEW invoice features: GST report CSV, bulk ZIP, email invoice")
    print("=" * 80)
    
    # Login as different users
    print("\n=== LOGIN PHASE ===")
    admin_token = login(ADMIN_PHONE)
    if not admin_token:
        print("\n❌ FATAL: Failed to get admin token. Cannot proceed.")
        sys.exit(1)
    
    customer_token = login(CUSTOMER_PHONE)
    if not customer_token:
        print("\n❌ FATAL: Failed to get customer token. Cannot proceed.")
        sys.exit(1)
    
    # Ensure invoices exist
    ensure_invoices_exist(admin_token)
    
    # Run tests
    test_gst_report_csv(admin_token)
    test_bulk_zip(admin_token)
    test_email_invoice(admin_token)
    test_authorization_customer(customer_token)
    test_cross_access_email(admin_token, customer_token)
    test_regression_list_invoices(admin_token, customer_token)
    test_regression_get_invoice(admin_token, customer_token)
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Total Tests: {passed + failed}")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"Success Rate: {(passed / (passed + failed) * 100):.1f}%" if (passed + failed) > 0 else "N/A")
    
    if failed > 0:
        print("\n❌ FAILED TESTS:")
        for result in test_results:
            if not result["success"]:
                print(f"  - {result['name']}: {result['message']}")
    
    print("=" * 80)
    
    # Exit with appropriate code
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
