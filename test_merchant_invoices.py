"""
Comprehensive backend test for Merchant Invoice List API (MY INVOICES REDESIGN).
Tests GET /api/invoices with new sort keys, multi-select filters, customer search, and summary stats.
"""
import requests
import time
from datetime import datetime

# Base URL from frontend/.env
BASE_URL = "https://expo-troubleshoot-5.preview.emergentagent.com/api"

# Test credentials
MERCHANT_PHONE = "+919000000002"  # Sharma Electricals
CUSTOMER_PHONE = "+919000000004"  # Customer with access to their own invoices
OTP = "123456"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def log_test(name, status, details=""):
    color = Colors.GREEN if status == "PASS" else Colors.RED
    print(f"{color}[{status}]{Colors.END} {name}")
    if details:
        print(f"  {details}")

def log_info(msg):
    print(f"{Colors.BLUE}[INFO]{Colors.END} {msg}")

def log_error(msg):
    print(f"{Colors.RED}[ERROR]{Colors.END} {msg}")

def authenticate(phone):
    """Login and return JWT token."""
    log_info(f"Authenticating {phone}...")
    
    # Send OTP
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if resp.status_code != 200:
        log_error(f"Send OTP failed: {resp.status_code} {resp.text}")
        return None
    
    # Verify OTP
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    if resp.status_code != 200:
        log_error(f"Verify OTP failed: {resp.status_code} {resp.text}")
        return None
    
    data = resp.json()
    token = data.get("token")
    if not token:
        log_error(f"No token in response: {data}")
        return None
    
    log_info(f"✓ Authenticated successfully")
    return token

def test_default_response(headers):
    """Test 1: Default GET /api/invoices returns items, total, page, pages, summary with all required fields."""
    log_info("TEST 1: Default GET /api/invoices")
    
    resp = requests.get(f"{BASE_URL}/invoices", headers=headers)
    if resp.status_code != 200:
        log_test("Default response", "FAIL", f"Status {resp.status_code}: {resp.text}")
        return False, None
    
    data = resp.json()
    
    # Check top-level keys
    required_keys = ["items", "total", "page", "pages", "summary"]
    missing = [k for k in required_keys if k not in data]
    if missing:
        log_test("Default response", "FAIL", f"Missing top-level keys: {missing}")
        return False, None
    
    # Check summary keys
    summary = data.get("summary", {})
    summary_keys = ["total_count", "total_amount", "paid_amount", "paid_count", 
                    "pending_amount", "pending_count", "refunded_amount", "refunded_count",
                    "commission_amount", "type_counts", "status_counts"]
    missing_summary = [k for k in summary_keys if k not in summary]
    if missing_summary:
        log_test("Default response", "FAIL", f"Missing summary keys: {missing_summary}")
        return False, None
    
    # Verify type_counts and status_counts are dicts
    if not isinstance(summary.get("type_counts"), dict):
        log_test("Default response", "FAIL", "type_counts is not a dict")
        return False, None
    
    if not isinstance(summary.get("status_counts"), dict):
        log_test("Default response", "FAIL", "status_counts is not a dict")
        return False, None
    
    log_test("Default response", "PASS", 
             f"items={len(data['items'])}, total={data['total']}, "
             f"summary.total_count={summary['total_count']}, "
             f"summary.paid_count={summary['paid_count']}, "
             f"summary.pending_count={summary['pending_count']}")
    return True, data

def test_sort_params(headers):
    """Test 2: All sort params return 200 and verify specific sort orders."""
    log_info("TEST 2: Sort parameters")
    
    sort_keys = ["newest", "oldest", "amount_high", "amount_low", "number", 
                 "number_asc", "customer", "customer_desc", "status", "status_desc"]
    
    all_pass = True
    for sort_key in sort_keys:
        resp = requests.get(f"{BASE_URL}/invoices?sort={sort_key}", headers=headers)
        if resp.status_code != 200:
            log_test(f"Sort: {sort_key}", "FAIL", f"Status {resp.status_code}")
            all_pass = False
            continue
        
        data = resp.json()
        items = data.get("items", [])
        
        # Verify specific sort orders
        if sort_key == "amount_high" and len(items) >= 2:
            # Should be descending by total_amount
            amounts = [item.get("total_amount", 0) for item in items]
            if amounts != sorted(amounts, reverse=True):
                log_test(f"Sort: {sort_key}", "FAIL", f"Not sorted descending by amount: {amounts[:3]}")
                all_pass = False
                continue
        
        elif sort_key == "amount_low" and len(items) >= 2:
            # Should be ascending by total_amount
            amounts = [item.get("total_amount", 0) for item in items]
            if amounts != sorted(amounts):
                log_test(f"Sort: {sort_key}", "FAIL", f"Not sorted ascending by amount: {amounts[:3]}")
                all_pass = False
                continue
        
        elif sort_key == "customer" and len(items) >= 2:
            # Should be ascending by customer_snapshot.name
            names = [item.get("customer_snapshot", {}).get("name", "") for item in items]
            if names != sorted(names):
                log_test(f"Sort: {sort_key}", "FAIL", f"Not sorted ascending by customer: {names[:3]}")
                all_pass = False
                continue
        
        elif sort_key == "number_asc" and len(items) >= 2:
            # Should be ascending by invoice_number
            numbers = [item.get("invoice_number", "") for item in items]
            if numbers != sorted(numbers):
                log_test(f"Sort: {sort_key}", "FAIL", f"Not sorted ascending by number: {numbers[:3]}")
                all_pass = False
                continue
        
        log_test(f"Sort: {sort_key}", "PASS", f"Returned {len(items)} items")
    
    return all_pass

def test_multi_select_filters(headers):
    """Test 3: Multi-select filters with comma-separated values."""
    log_info("TEST 3: Multi-select filters")
    
    all_pass = True
    
    # Test payment_status=paid,pending (should return all 3 seeded invoices)
    resp = requests.get(f"{BASE_URL}/invoices?payment_status=paid,pending", headers=headers)
    if resp.status_code != 200:
        log_test("Multi-select: payment_status=paid,pending", "FAIL", f"Status {resp.status_code}")
        all_pass = False
    else:
        data = resp.json()
        items = data.get("items", [])
        log_test("Multi-select: payment_status=paid,pending", "PASS", f"Returned {len(items)} items (expected 3)")
        if len(items) != 3:
            log_error(f"Expected 3 items, got {len(items)}")
            all_pass = False
    
    # Test payment_status=pending (should return 0 since all are paid)
    resp = requests.get(f"{BASE_URL}/invoices?payment_status=pending", headers=headers)
    if resp.status_code != 200:
        log_test("Multi-select: payment_status=pending", "FAIL", f"Status {resp.status_code}")
        all_pass = False
    else:
        data = resp.json()
        items = data.get("items", [])
        log_test("Multi-select: payment_status=pending", "PASS", f"Returned {len(items)} items (expected 0)")
        if len(items) != 0:
            log_error(f"Expected 0 items, got {len(items)}")
            all_pass = False
    
    # Test invoice_type=booking,commission (should return 3)
    resp = requests.get(f"{BASE_URL}/invoices?invoice_type=booking,commission", headers=headers)
    if resp.status_code != 200:
        log_test("Multi-select: invoice_type=booking,commission", "FAIL", f"Status {resp.status_code}")
        all_pass = False
    else:
        data = resp.json()
        items = data.get("items", [])
        log_test("Multi-select: invoice_type=booking,commission", "PASS", f"Returned {len(items)} items (expected 3)")
        if len(items) != 3:
            log_error(f"Expected 3 items, got {len(items)}")
            all_pass = False
    
    # Test invoice_type=commission (should return 0)
    resp = requests.get(f"{BASE_URL}/invoices?invoice_type=commission", headers=headers)
    if resp.status_code != 200:
        log_test("Multi-select: invoice_type=commission", "FAIL", f"Status {resp.status_code}")
        all_pass = False
    else:
        data = resp.json()
        items = data.get("items", [])
        log_test("Multi-select: invoice_type=commission", "PASS", f"Returned {len(items)} items (expected 0)")
        if len(items) != 0:
            log_error(f"Expected 0 items, got {len(items)}")
            all_pass = False
    
    return all_pass

def test_customer_search(headers):
    """Test 4: Customer search filters."""
    log_info("TEST 4: Customer search filters")
    
    all_pass = True
    
    # Test customer=Ravi (should return 2)
    resp = requests.get(f"{BASE_URL}/invoices?customer=Ravi", headers=headers)
    if resp.status_code != 200:
        log_test("Customer search: Ravi", "FAIL", f"Status {resp.status_code}")
        all_pass = False
    else:
        data = resp.json()
        items = data.get("items", [])
        log_test("Customer search: Ravi", "PASS", f"Returned {len(items)} items (expected 2)")
        if len(items) != 2:
            log_error(f"Expected 2 items, got {len(items)}")
            all_pass = False
    
    # Test customer=9822 (Sunita's phone, should return 1)
    resp = requests.get(f"{BASE_URL}/invoices?customer=9822", headers=headers)
    if resp.status_code != 200:
        log_test("Customer search: 9822", "FAIL", f"Status {resp.status_code}")
        all_pass = False
    else:
        data = resp.json()
        items = data.get("items", [])
        log_test("Customer search: 9822", "PASS", f"Returned {len(items)} items (expected 1)")
        if len(items) != 1:
            log_error(f"Expected 1 item, got {len(items)}")
            all_pass = False
    
    # Test search=Sunita (should return 1)
    resp = requests.get(f"{BASE_URL}/invoices?search=Sunita", headers=headers)
    if resp.status_code != 200:
        log_test("Search: Sunita", "FAIL", f"Status {resp.status_code}")
        all_pass = False
    else:
        data = resp.json()
        items = data.get("items", [])
        log_test("Search: Sunita", "PASS", f"Returned {len(items)} items (expected 1)")
        if len(items) != 1:
            log_error(f"Expected 1 item, got {len(items)}")
            all_pass = False
    
    return all_pass

def test_booking_id_filter(headers, default_data):
    """Test 5: booking_id filter."""
    log_info("TEST 5: booking_id filter")
    
    # Get a booking_code from the default response
    items = default_data.get("items", [])
    if not items:
        log_test("booking_id filter", "FAIL", "No items to test with")
        return False
    
    booking_code = items[0].get("booking_code")
    if not booking_code:
        log_test("booking_id filter", "FAIL", "No booking_code in first item")
        return False
    
    resp = requests.get(f"{BASE_URL}/invoices?booking_id={booking_code}", headers=headers)
    if resp.status_code != 200:
        log_test("booking_id filter", "FAIL", f"Status {resp.status_code}")
        return False
    
    data = resp.json()
    items = data.get("items", [])
    if len(items) < 1:
        log_test("booking_id filter", "FAIL", f"Expected >=1 items, got {len(items)}")
        return False
    
    log_test("booking_id filter", "PASS", f"booking_code={booking_code}, returned {len(items)} items")
    return True

def test_amount_filters(headers):
    """Test 6: min_amount and max_amount filters."""
    log_info("TEST 6: Amount filters")
    
    all_pass = True
    
    # Test min_amount=1000 (should return 2)
    resp = requests.get(f"{BASE_URL}/invoices?min_amount=1000", headers=headers)
    if resp.status_code != 200:
        log_test("Amount filter: min_amount=1000", "FAIL", f"Status {resp.status_code}")
        all_pass = False
    else:
        data = resp.json()
        items = data.get("items", [])
        log_test("Amount filter: min_amount=1000", "PASS", f"Returned {len(items)} items (expected 2)")
        if len(items) != 2:
            log_error(f"Expected 2 items, got {len(items)}")
            all_pass = False
    
    # Test max_amount=900 (should return 1)
    resp = requests.get(f"{BASE_URL}/invoices?max_amount=900", headers=headers)
    if resp.status_code != 200:
        log_test("Amount filter: max_amount=900", "FAIL", f"Status {resp.status_code}")
        all_pass = False
    else:
        data = resp.json()
        items = data.get("items", [])
        log_test("Amount filter: max_amount=900", "PASS", f"Returned {len(items)} items (expected 1)")
        if len(items) != 1:
            log_error(f"Expected 1 item, got {len(items)}")
            all_pass = False
    
    return all_pass

def test_date_range_filters(headers):
    """Test 7: Date range filters."""
    log_info("TEST 7: Date range filters")
    
    all_pass = True
    
    # Test range=today (should return 3 if issued today, or state actual)
    resp = requests.get(f"{BASE_URL}/invoices?range=today", headers=headers)
    if resp.status_code != 200:
        log_test("Date range: today", "FAIL", f"Status {resp.status_code}")
        all_pass = False
    else:
        data = resp.json()
        items = data.get("items", [])
        log_test("Date range: today", "PASS", f"Returned {len(items)} items")
        # Note: Expected 3 if issued today, but actual may vary
    
    # Test range=custom with past dates (should return 0)
    resp = requests.get(f"{BASE_URL}/invoices?range=custom&date_from=2020-01-01&date_to=2020-01-02", headers=headers)
    if resp.status_code != 200:
        log_test("Date range: custom (past)", "FAIL", f"Status {resp.status_code}")
        all_pass = False
    else:
        data = resp.json()
        items = data.get("items", [])
        log_test("Date range: custom (past)", "PASS", f"Returned {len(items)} items (expected 0)")
        if len(items) != 0:
            log_error(f"Expected 0 items, got {len(items)}")
            all_pass = False
    
    return all_pass

def test_pagination(headers):
    """Test 8: Pagination with page_size=2&page=2."""
    log_info("TEST 8: Pagination")
    
    resp = requests.get(f"{BASE_URL}/invoices?page_size=2&page=2", headers=headers)
    if resp.status_code != 200:
        log_test("Pagination", "FAIL", f"Status {resp.status_code}")
        return False
    
    data = resp.json()
    items = data.get("items", [])
    pages = data.get("pages")
    
    if len(items) != 1:
        log_test("Pagination", "FAIL", f"Expected 1 item on page 2, got {len(items)}")
        return False
    
    if pages != 2:
        log_test("Pagination", "FAIL", f"Expected pages=2, got {pages}")
        return False
    
    log_test("Pagination", "PASS", f"page=2, page_size=2, items={len(items)}, pages={pages}")
    return True

def test_invoice_detail_and_pdf(headers, default_data):
    """Test 9: GET /api/invoices/{id} and GET /api/invoices/{id}/pdf."""
    log_info("TEST 9: Invoice detail and PDF")
    
    items = default_data.get("items", [])
    if not items:
        log_test("Invoice detail/PDF", "FAIL", "No items to test with")
        return False
    
    invoice_id = items[0].get("id")
    if not invoice_id:
        log_test("Invoice detail/PDF", "FAIL", "No id in first item")
        return False
    
    all_pass = True
    
    # Test GET /api/invoices/{id}
    resp = requests.get(f"{BASE_URL}/invoices/{invoice_id}", headers=headers)
    if resp.status_code != 200:
        log_test("Invoice detail: GET /{id}", "FAIL", f"Status {resp.status_code}")
        all_pass = False
    else:
        data = resp.json()
        if data.get("id") != invoice_id:
            log_test("Invoice detail: GET /{id}", "FAIL", f"ID mismatch")
            all_pass = False
        else:
            log_test("Invoice detail: GET /{id}", "PASS", f"invoice_id={invoice_id}")
    
    # Test GET /api/invoices/{id}/pdf
    resp = requests.get(f"{BASE_URL}/invoices/{invoice_id}/pdf", headers=headers)
    if resp.status_code != 200:
        log_test("Invoice PDF: GET /{id}/pdf", "FAIL", f"Status {resp.status_code}")
        all_pass = False
    elif resp.headers.get("content-type") != "application/pdf":
        log_test("Invoice PDF: GET /{id}/pdf", "FAIL", f"Content-Type is not application/pdf")
        all_pass = False
    else:
        log_test("Invoice PDF: GET /{id}/pdf", "PASS", f"PDF size={len(resp.content)} bytes")
    
    return all_pass

def test_customer_regression(headers, merchant_invoice_id):
    """Test 10: Regression - customer can call GET /api/invoices but cannot access merchant's invoice by id (403)."""
    log_info("TEST 10: Customer regression test")
    
    # Authenticate as customer
    customer_token = authenticate(CUSTOMER_PHONE)
    if not customer_token:
        log_test("Customer regression", "FAIL", "Failed to authenticate customer")
        return False
    
    customer_headers = {"Authorization": f"Bearer {customer_token}"}
    
    all_pass = True
    
    # Test customer can call GET /api/invoices (200)
    resp = requests.get(f"{BASE_URL}/invoices", headers=customer_headers)
    if resp.status_code != 200:
        log_test("Customer regression: GET /invoices", "FAIL", f"Status {resp.status_code}")
        all_pass = False
    else:
        log_test("Customer regression: GET /invoices", "PASS", "Customer can list their own invoices")
    
    # Test customer cannot access merchant's invoice by id (403)
    resp = requests.get(f"{BASE_URL}/invoices/{merchant_invoice_id}", headers=customer_headers)
    if resp.status_code != 403:
        log_test("Customer regression: GET /{merchant_id}", "FAIL", f"Expected 403, got {resp.status_code}")
        all_pass = False
    else:
        log_test("Customer regression: GET /{merchant_id}", "PASS", "Customer correctly blocked from merchant invoice (403)")
    
    return all_pass

def main():
    print("\n" + "="*80)
    print("MERCHANT INVOICE LIST API TEST (MY INVOICES REDESIGN)")
    print("="*80 + "\n")
    
    # Authenticate as merchant
    merchant_token = authenticate(MERCHANT_PHONE)
    if not merchant_token:
        log_error("Failed to authenticate merchant. Exiting.")
        return
    
    headers = {"Authorization": f"Bearer {merchant_token}"}
    
    # Run tests
    results = []
    
    # Test 1: Default response
    success, default_data = test_default_response(headers)
    results.append(("Default response", success))
    
    if not default_data:
        log_error("Cannot proceed without default data. Exiting.")
        return
    
    # Test 2: Sort params
    results.append(("Sort params", test_sort_params(headers)))
    
    # Test 3: Multi-select filters
    results.append(("Multi-select filters", test_multi_select_filters(headers)))
    
    # Test 4: Customer search
    results.append(("Customer search", test_customer_search(headers)))
    
    # Test 5: booking_id filter
    results.append(("booking_id filter", test_booking_id_filter(headers, default_data)))
    
    # Test 6: Amount filters
    results.append(("Amount filters", test_amount_filters(headers)))
    
    # Test 7: Date range filters
    results.append(("Date range filters", test_date_range_filters(headers)))
    
    # Test 8: Pagination
    results.append(("Pagination", test_pagination(headers)))
    
    # Test 9: Invoice detail and PDF
    results.append(("Invoice detail/PDF", test_invoice_detail_and_pdf(headers, default_data)))
    
    # Test 10: Customer regression
    merchant_invoice_id = default_data.get("items", [{}])[0].get("id")
    if merchant_invoice_id:
        results.append(("Customer regression", test_customer_regression(headers, merchant_invoice_id)))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    for name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {name}")
    
    print(f"\nTotal: {passed}/{total} tests passed ({100*passed//total}%)")
    
    if passed == total:
        print(f"\n{Colors.GREEN}ALL TESTS PASSED!{Colors.END}")
    else:
        print(f"\n{Colors.RED}SOME TESTS FAILED!{Colors.END}")

if __name__ == "__main__":
    main()
