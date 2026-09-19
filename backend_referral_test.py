"""
Comprehensive backend test for Refer-a-friend feature.
Tests all endpoints under /api/referral with validation.
"""
import requests
import json

# Base URL from frontend/.env
BASE_URL = "https://azo-app-live.preview.emergentagent.com/api"

# Test credentials from /app/memory/test_credentials.md
CUSTOMER_PHONE = "+919000000004"  # Priya Verma
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

def authenticate_customer():
    """Login as customer and return JWT token."""
    log_info(f"Authenticating customer {CUSTOMER_PHONE}...")
    
    # Verify OTP (demo mode, OTP is always 123456)
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": CUSTOMER_PHONE, "otp": OTP})
    if resp.status_code != 200:
        log_error(f"Verify OTP failed: {resp.status_code} {resp.text}")
        return None
    
    data = resp.json()
    token = data.get("token")
    if not token:
        log_error(f"No token in response: {data}")
        return None
    
    log_info(f"✓ Authenticated successfully as {data.get('user', {}).get('name', 'customer')}")
    return token

def test_referral_summary(headers):
    """
    Test 1: GET /api/referral/summary
    Verify: code == "AZO0004", reward_amount (number), stats object with 
    invited/joined/first_booking/earned/pending, non-empty history array (3 demo referrals seeded)
    """
    log_info("TEST 1: GET /api/referral/summary")
    
    resp = requests.get(f"{BASE_URL}/referral/summary", headers=headers)
    if resp.status_code != 200:
        log_test("GET /api/referral/summary", "FAIL", f"Status {resp.status_code}: {resp.text}")
        return False, None
    
    data = resp.json()
    
    # Verify code == "AZO0004"
    code = data.get("code")
    if code != "AZO0004":
        log_test("GET /api/referral/summary", "FAIL", f"Expected code='AZO0004', got '{code}'")
        return False, None
    
    # Verify reward_amount is a number
    reward_amount = data.get("reward_amount")
    if not isinstance(reward_amount, (int, float)):
        log_test("GET /api/referral/summary", "FAIL", f"reward_amount is not a number: {reward_amount}")
        return False, None
    
    # Verify stats object exists with required keys
    stats = data.get("stats")
    if not stats:
        log_test("GET /api/referral/summary", "FAIL", "Missing 'stats' object")
        return False, None
    
    required_stats = ["invited", "joined", "first_booking", "earned", "pending"]
    missing_stats = [k for k in required_stats if k not in stats]
    if missing_stats:
        log_test("GET /api/referral/summary", "FAIL", f"Missing stats keys: {missing_stats}")
        return False, None
    
    # Verify stats values match expected (invited=3, joined=3, first_booking=1, earned=100, pending=200)
    if stats["invited"] != 3:
        log_test("GET /api/referral/summary", "FAIL", f"Expected invited=3, got {stats['invited']}")
        return False, None
    
    if stats["joined"] != 3:
        log_test("GET /api/referral/summary", "FAIL", f"Expected joined=3, got {stats['joined']}")
        return False, None
    
    if stats["first_booking"] != 1:
        log_test("GET /api/referral/summary", "FAIL", f"Expected first_booking=1, got {stats['first_booking']}")
        return False, None
    
    if stats["earned"] != 100:
        log_test("GET /api/referral/summary", "FAIL", f"Expected earned=100, got {stats['earned']}")
        return False, None
    
    if stats["pending"] != 200:
        log_test("GET /api/referral/summary", "FAIL", f"Expected pending=200, got {stats['pending']}")
        return False, None
    
    # Verify history array is non-empty (3 demo referrals)
    history = data.get("history")
    if not history or not isinstance(history, list):
        log_test("GET /api/referral/summary", "FAIL", "Missing or invalid 'history' array")
        return False, None
    
    if len(history) != 3:
        log_test("GET /api/referral/summary", "FAIL", f"Expected 3 history items, got {len(history)}")
        return False, None
    
    # Verify each history item has required fields: name, date, status, reward, payment_status
    for i, item in enumerate(history):
        required_fields = ["name", "date", "status", "reward", "payment_status"]
        missing_fields = [f for f in required_fields if f not in item]
        if missing_fields:
            log_test("GET /api/referral/summary", "FAIL", 
                    f"History item {i} missing fields: {missing_fields}")
            return False, None
    
    log_test("GET /api/referral/summary", "PASS", 
             f"code={code}, reward_amount={reward_amount}, stats={stats}, history_count={len(history)}")
    return True, code

def test_apply_own_code(headers, own_code):
    """
    Test 2: POST /api/referral/apply with own code
    Verify: ok:false with detail message (cannot use your own code), must NOT 500
    """
    log_info(f"TEST 2: POST /api/referral/apply with own code ({own_code})")
    
    resp = requests.post(f"{BASE_URL}/referral/apply", json={"code": own_code}, headers=headers)
    
    # Must NOT be 500
    if resp.status_code == 500:
        log_test("POST /api/referral/apply (own code)", "FAIL", "Returned 500 (server error)")
        return False
    
    # Should return 200 or 400 with ok:false
    if resp.status_code not in [200, 400]:
        log_test("POST /api/referral/apply (own code)", "FAIL", 
                f"Unexpected status {resp.status_code}: {resp.text}")
        return False
    
    data = resp.json()
    
    # Verify ok:false
    if data.get("ok") is not False:
        log_test("POST /api/referral/apply (own code)", "FAIL", 
                f"Expected ok:false, got ok:{data.get('ok')}")
        return False
    
    # Verify detail message exists
    detail = data.get("detail")
    if not detail:
        log_test("POST /api/referral/apply (own code)", "FAIL", "Missing 'detail' message")
        return False
    
    log_test("POST /api/referral/apply (own code)", "PASS", 
             f"ok:false, detail: '{detail}'")
    return True

def test_apply_invalid_code(headers):
    """
    Test 3: POST /api/referral/apply with invalid code
    Verify: ok:false, detail "Invalid referral code" (or similar), must NOT 500
    """
    log_info("TEST 3: POST /api/referral/apply with invalid code (ZZZZZZ)")
    
    resp = requests.post(f"{BASE_URL}/referral/apply", json={"code": "ZZZZZZ"}, headers=headers)
    
    # Must NOT be 500
    if resp.status_code == 500:
        log_test("POST /api/referral/apply (invalid code)", "FAIL", "Returned 500 (server error)")
        return False
    
    # Should return 200 or 400 with ok:false
    if resp.status_code not in [200, 400]:
        log_test("POST /api/referral/apply (invalid code)", "FAIL", 
                f"Unexpected status {resp.status_code}: {resp.text}")
        return False
    
    data = resp.json()
    
    # Verify ok:false
    if data.get("ok") is not False:
        log_test("POST /api/referral/apply (invalid code)", "FAIL", 
                f"Expected ok:false, got ok:{data.get('ok')}")
        return False
    
    # Verify detail message contains "invalid" or similar
    detail = data.get("detail", "").lower()
    if "invalid" not in detail and "not found" not in detail:
        log_test("POST /api/referral/apply (invalid code)", "FAIL", 
                f"Expected 'Invalid referral code' message, got: '{data.get('detail')}'")
        return False
    
    log_test("POST /api/referral/apply (invalid code)", "PASS", 
             f"ok:false, detail: '{data.get('detail')}'")
    return True

def test_summary_without_auth():
    """
    Test 4: GET /api/referral/summary without Authorization header
    Verify: 401 or 403 (auth required)
    """
    log_info("TEST 4: GET /api/referral/summary without auth")
    
    resp = requests.get(f"{BASE_URL}/referral/summary")
    
    if resp.status_code not in [401, 403]:
        log_test("GET /api/referral/summary (no auth)", "FAIL", 
                f"Expected 401/403, got {resp.status_code}")
        return False
    
    log_test("GET /api/referral/summary (no auth)", "PASS", 
             f"Correctly returned {resp.status_code} (auth required)")
    return True

def test_wallet_regression(headers):
    """
    Test 5: Regression - GET /api/wallet
    Verify: 200 with balance + transactions array (ensure referral changes didn't break wallet)
    """
    log_info("TEST 5: Regression - GET /api/wallet")
    
    resp = requests.get(f"{BASE_URL}/wallet", headers=headers)
    if resp.status_code != 200:
        log_test("GET /api/wallet (regression)", "FAIL", f"Status {resp.status_code}: {resp.text}")
        return False
    
    data = resp.json()
    
    # Verify balance exists
    if "balance" not in data:
        log_test("GET /api/wallet (regression)", "FAIL", "Missing 'balance' field")
        return False
    
    # Verify transactions array exists
    if "transactions" not in data or not isinstance(data["transactions"], list):
        log_test("GET /api/wallet (regression)", "FAIL", "Missing or invalid 'transactions' array")
        return False
    
    log_test("GET /api/wallet (regression)", "PASS", 
             f"balance={data['balance']}, transactions_count={len(data['transactions'])}")
    return True

def test_bookings_regression(headers):
    """
    Test 6: Regression - GET /api/bookings
    Verify: 200 with list (ensure referral changes didn't break bookings)
    """
    log_info("TEST 6: Regression - GET /api/bookings")
    
    resp = requests.get(f"{BASE_URL}/bookings", headers=headers)
    if resp.status_code != 200:
        log_test("GET /api/bookings (regression)", "FAIL", f"Status {resp.status_code}: {resp.text}")
        return False
    
    data = resp.json()
    
    # Should be a list or object with items
    if isinstance(data, list):
        bookings = data
    elif isinstance(data, dict) and "items" in data:
        bookings = data["items"]
    else:
        log_test("GET /api/bookings (regression)", "FAIL", "Invalid response structure")
        return False
    
    log_test("GET /api/bookings (regression)", "PASS", 
             f"bookings_count={len(bookings)}")
    return True

def main():
    print("\n" + "="*80)
    print("REFER-A-FRIEND BACKEND TEST SUITE")
    print("="*80 + "\n")
    
    # Authenticate
    token = authenticate_customer()
    if not token:
        log_error("Authentication failed. Aborting tests.")
        return
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Track results
    results = []
    
    # Test 1: GET /api/referral/summary
    success, own_code = test_referral_summary(headers)
    results.append(("GET /api/referral/summary", success))
    
    if own_code:
        # Test 2: POST /api/referral/apply with own code
        results.append(("POST /api/referral/apply (own code)", test_apply_own_code(headers, own_code)))
    else:
        log_error("Skipping Test 2 (no code from Test 1)")
        results.append(("POST /api/referral/apply (own code)", False))
    
    # Test 3: POST /api/referral/apply with invalid code
    results.append(("POST /api/referral/apply (invalid code)", test_apply_invalid_code(headers)))
    
    # Test 4: GET /api/referral/summary without auth
    results.append(("GET /api/referral/summary (no auth)", test_summary_without_auth()))
    
    # Test 5: Regression - GET /api/wallet
    results.append(("GET /api/wallet (regression)", test_wallet_regression(headers)))
    
    # Test 6: Regression - GET /api/bookings
    results.append(("GET /api/bookings (regression)", test_bookings_regression(headers)))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    passed = sum(1 for _, r in results if r)
    total = len(results)
    print(f"\nPassed: {passed}/{total}")
    print(f"Failed: {total - passed}/{total}")
    
    if passed == total:
        print(f"\n{Colors.GREEN}✓ ALL TESTS PASSED (100%){Colors.END}")
    else:
        print(f"\n{Colors.RED}✗ SOME TESTS FAILED{Colors.END}")
        print("\nFailed tests:")
        for name, result in results:
            if not result:
                print(f"  - {name}")
    
    print("\n" + "="*80 + "\n")
    
    return passed, total

if __name__ == "__main__":
    passed, total = main()
    exit(0 if passed == total else 1)
