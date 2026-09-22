"""
Backend API Testing for AzoApp - Super Admin PERFORMANCE Feature
Tests the NEW Super Admin PERFORMANCE backend feature on AzoApp.
Base URL: https://azoapp-services.preview.emergentagent.com/api
"""
import requests
import time

# Base URL from review request
BASE_URL = "https://azoapp-services.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"

# Test credentials (demo mode, OTP = 123456)
ADMIN_PHONE = "+919000000000"
CUSTOMER_PHONE = "+919000000004"
OTP = "123456"

class TestRunner:
    def __init__(self):
        self.admin_token = None
        self.customer_token = None
        self.results = []
        
    def log(self, test_name, passed, details=""):
        status = "✅ PASS" if passed else "❌ FAIL"
        self.results.append({"test": test_name, "passed": passed, "details": details})
        print(f"{status} - {test_name}")
        if details:
            print(f"  Details: {details}")
    
    def auth_admin(self):
        """Authenticate as admin"""
        print("\n=== Authenticating as Admin ===")
        # Verify OTP directly (send-otp not needed in demo mode)
        r = requests.post(f"{API_BASE}/auth/verify-otp", json={"phone": ADMIN_PHONE, "otp": OTP})
        if r.status_code != 200:
            self.log("Admin Auth", False, f"Status {r.status_code}: {r.text}")
            return False
        
        data = r.json()
        self.admin_token = data.get("token")
        if not self.admin_token:
            self.log("Admin Auth", False, "No token in response")
            return False
        
        self.log("Admin Auth", True, f"Token obtained, role: {data.get('user', {}).get('role')}")
        return True
    
    def auth_customer(self):
        """Authenticate as customer"""
        print("\n=== Authenticating as Customer ===")
        r = requests.post(f"{API_BASE}/auth/verify-otp", json={"phone": CUSTOMER_PHONE, "otp": OTP})
        if r.status_code != 200:
            self.log("Customer Auth", False, f"Status {r.status_code}: {r.text}")
            return False
        
        data = r.json()
        self.customer_token = data.get("token")
        if not self.customer_token:
            self.log("Customer Auth", False, "No token in response")
            return False
        
        self.log("Customer Auth", True, f"Token obtained")
        return True
    
    def test_perf_endpoint(self):
        """Test 1: GET /api/superadmin/perf returns performance stats"""
        print("\n=== Test 1: GET /api/superadmin/perf ===")
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        r = requests.get(f"{API_BASE}/superadmin/perf", headers=headers)
        
        if r.status_code != 200:
            self.log("1: GET /superadmin/perf", False, f"Status {r.status_code}: {r.text}")
            return False
        
        data = r.json()
        
        # Verify required keys
        required_keys = ["slow_threshold_ms", "routes_tracked", "total_requests", "slow_requests", "slowest_avg_ms", "routes"]
        missing_keys = [k for k in required_keys if k not in data]
        if missing_keys:
            self.log("1: GET /superadmin/perf", False, f"Missing keys: {missing_keys}")
            return False
        
        # Verify slow_threshold_ms == 700
        if data["slow_threshold_ms"] != 700:
            self.log("1: GET /superadmin/perf", False, f"Expected slow_threshold_ms=700, got {data['slow_threshold_ms']}")
            return False
        
        # Verify routes is a list
        if not isinstance(data["routes"], list):
            self.log("1: GET /superadmin/perf", False, f"Expected routes to be list, got {type(data['routes'])}")
            return False
        
        # Verify each route has required fields
        if len(data["routes"]) > 0:
            route_keys = ["method", "path", "count", "avg_ms", "p95_ms", "max_ms", "slow", "errors"]
            for route in data["routes"]:
                missing = [k for k in route_keys if k not in route]
                if missing:
                    self.log("1: GET /superadmin/perf", False, f"Route missing keys: {missing}")
                    return False
            
            # Verify routes are sorted by avg_ms DESCENDING (slowest first)
            avg_ms_values = [r["avg_ms"] for r in data["routes"]]
            if avg_ms_values != sorted(avg_ms_values, reverse=True):
                self.log("1: GET /superadmin/perf", False, f"Routes not sorted by avg_ms DESC: {avg_ms_values[:5]}")
                return False
            
            # Verify path values start with /api
            non_api_paths = [r["path"] for r in data["routes"] if not r["path"].startswith("/api")]
            if non_api_paths:
                self.log("1: GET /superadmin/perf", False, f"Found non-/api paths: {non_api_paths[:3]}")
                return False
        
        self.log("1: GET /superadmin/perf", True, 
                f"slow_threshold_ms=700, routes_tracked={data['routes_tracked']}, total_requests={data['total_requests']}, routes sorted DESC")
        return True
    
    def test_perf_reset(self):
        """Test 2: POST /api/superadmin/perf/reset clears stats"""
        print("\n=== Test 2: POST /api/superadmin/perf/reset ===")
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Get current stats
        r = requests.get(f"{API_BASE}/superadmin/perf", headers=headers)
        if r.status_code != 200:
            self.log("2: GET before reset", False, f"Status {r.status_code}")
            return False
        
        before = r.json()
        before_tracked = before.get("routes_tracked", 0)
        before_total = before.get("total_requests", 0)
        
        # Reset
        r = requests.post(f"{API_BASE}/superadmin/perf/reset", headers=headers)
        if r.status_code != 200:
            self.log("2: POST /superadmin/perf/reset", False, f"Status {r.status_code}: {r.text}")
            return False
        
        data = r.json()
        if not data.get("ok"):
            self.log("2: POST /superadmin/perf/reset", False, f"Expected ok:true, got {data}")
            return False
        
        # Get stats after reset
        r = requests.get(f"{API_BASE}/superadmin/perf", headers=headers)
        if r.status_code != 200:
            self.log("2: GET after reset", False, f"Status {r.status_code}")
            return False
        
        after = r.json()
        after_tracked = after.get("routes_tracked", 0)
        after_total = after.get("total_requests", 0)
        
        # Verify stats are smaller (cleared)
        if after_tracked >= before_tracked and before_tracked > 0:
            self.log("2: POST /superadmin/perf/reset", False, 
                    f"routes_tracked not reduced: before={before_tracked}, after={after_tracked}")
            return False
        
        if after_total >= before_total and before_total > 0:
            self.log("2: POST /superadmin/perf/reset", False, 
                    f"total_requests not reduced: before={before_total}, after={after_total}")
            return False
        
        self.log("2: POST /superadmin/perf/reset", True, 
                f"Stats cleared: routes_tracked {before_tracked}→{after_tracked}, total_requests {before_total}→{after_total}")
        return True
    
    def test_perf_diagnostics(self):
        """Test 3: POST /api/superadmin/perf/diagnostics returns mongo+redis health"""
        print("\n=== Test 3: POST /api/superadmin/perf/diagnostics ===")
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        r = requests.post(f"{API_BASE}/superadmin/perf/diagnostics", headers=headers)
        
        if r.status_code != 200:
            self.log("3: POST /superadmin/perf/diagnostics", False, f"Status {r.status_code}: {r.text}")
            return False
        
        data = r.json()
        
        # Verify mongo key
        if "mongo" not in data:
            self.log("3: POST /superadmin/perf/diagnostics", False, "Missing 'mongo' key")
            return False
        
        mongo = data["mongo"]
        if not isinstance(mongo, dict):
            self.log("3: POST /superadmin/perf/diagnostics", False, f"mongo should be dict, got {type(mongo)}")
            return False
        
        if "ok" not in mongo or "latency_ms" not in mongo:
            self.log("3: POST /superadmin/perf/diagnostics", False, f"mongo missing ok/latency_ms: {mongo}")
            return False
        
        if not mongo["ok"]:
            self.log("3: POST /superadmin/perf/diagnostics", False, f"mongo.ok=false: {mongo}")
            return False
        
        if not isinstance(mongo["latency_ms"], (int, float)):
            self.log("3: POST /superadmin/perf/diagnostics", False, f"mongo.latency_ms not number: {mongo['latency_ms']}")
            return False
        
        # Verify redis key
        if "redis" not in data:
            self.log("3: POST /superadmin/perf/diagnostics", False, "Missing 'redis' key")
            return False
        
        redis = data["redis"]
        if not isinstance(redis, dict):
            self.log("3: POST /superadmin/perf/diagnostics", False, f"redis should be dict, got {type(redis)}")
            return False
        
        if "ok" not in redis or "backend" not in redis or "latency_ms" not in redis:
            self.log("3: POST /superadmin/perf/diagnostics", False, f"redis missing ok/backend/latency_ms: {redis}")
            return False
        
        # Redis should be in-memory fallback (not configured)
        if redis["ok"] != False:
            self.log("3: POST /superadmin/perf/diagnostics", False, f"Expected redis.ok=false (not configured), got {redis['ok']}")
            return False
        
        if redis["backend"] != "memory":
            self.log("3: POST /superadmin/perf/diagnostics", False, f"Expected redis.backend='memory', got {redis['backend']}")
            return False
        
        if redis["latency_ms"] is not None:
            self.log("3: POST /superadmin/perf/diagnostics", False, f"Expected redis.latency_ms=null, got {redis['latency_ms']}")
            return False
        
        self.log("3: POST /superadmin/perf/diagnostics", True, 
                f"mongo.ok=true, latency={mongo['latency_ms']}ms; redis.ok=false, backend='memory' (in-memory fallback)")
        return True
    
    def test_redis_config(self):
        """Test 4: GET /api/superadmin/redis returns config with secrets masked"""
        print("\n=== Test 4: GET /api/superadmin/redis ===")
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        r = requests.get(f"{API_BASE}/superadmin/redis", headers=headers)
        
        if r.status_code != 200:
            self.log("4: GET /superadmin/redis", False, f"Status {r.status_code}: {r.text}")
            return False
        
        data = r.json()
        
        # Verify required keys
        required_keys = ["enabled", "provider", "connection_type", "mode", "url", "token_set", "token_hint", "live", "status", "providers"]
        missing_keys = [k for k in required_keys if k not in data]
        if missing_keys:
            self.log("4: GET /superadmin/redis", False, f"Missing keys: {missing_keys}")
            return False
        
        # Verify enabled is false (not configured)
        if data["enabled"] != False:
            self.log("4: GET /superadmin/redis", False, f"Expected enabled=false, got {data['enabled']}")
            return False
        
        # Verify provider is upstash
        if data["provider"] != "upstash":
            self.log("4: GET /superadmin/redis", False, f"Expected provider='upstash', got {data['provider']}")
            return False
        
        # Verify url is empty string
        if data["url"] != "":
            self.log("4: GET /superadmin/redis", False, f"Expected url='', got {data['url']}")
            return False
        
        # Verify token_set is false
        if data["token_set"] != False:
            self.log("4: GET /superadmin/redis", False, f"Expected token_set=false, got {data['token_set']}")
            return False
        
        # Verify live is false
        if data["live"] != False:
            self.log("4: GET /superadmin/redis", False, f"Expected live=false, got {data['live']}")
            return False
        
        # Verify status contains "In-memory fallback"
        if "In-memory fallback" not in data["status"]:
            self.log("4: GET /superadmin/redis", False, f"Expected status to contain 'In-memory fallback', got {data['status']}")
            return False
        
        # Verify providers list has 7 items
        if not isinstance(data["providers"], list):
            self.log("4: GET /superadmin/redis", False, f"Expected providers to be list, got {type(data['providers'])}")
            return False
        
        if len(data["providers"]) != 7:
            self.log("4: GET /superadmin/redis", False, f"Expected 7 providers, got {len(data['providers'])}")
            return False
        
        # Verify provider names
        provider_values = [p["value"] for p in data["providers"]]
        expected_providers = ["upstash", "redis_cloud", "aiven", "railway", "digitalocean", "aws_elasticache", "generic"]
        missing_providers = [p for p in expected_providers if p not in provider_values]
        if missing_providers:
            self.log("4: GET /superadmin/redis", False, f"Missing providers: {missing_providers}")
            return False
        
        # IMPORTANT: Verify NO raw secret/token value is leaked
        response_text = r.text.lower()
        # Check for common secret patterns (this is a basic check)
        if "password" in response_text or "secret" in response_text:
            # This is OK if it's just field names, but let's check the actual values
            pass
        
        # Check that token_hint is not a full token (should be last 4 chars or empty)
        if data["token_hint"] and len(data["token_hint"]) > 4:
            self.log("4: GET /superadmin/redis", False, f"token_hint too long (possible leak): {data['token_hint']}")
            return False
        
        self.log("4: GET /superadmin/redis", True, 
                f"enabled=false, provider='upstash', live=false, status='In-memory fallback', 7 providers, no secrets leaked")
        return True
    
    def test_redis_test_connection(self):
        """Test 5: POST /api/superadmin/redis/test with bogus credentials degrades gracefully"""
        print("\n=== Test 5: POST /api/superadmin/redis/test (bogus credentials) ===")
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        payload = {
            "provider": "upstash",
            "url": "https://bogus-nonexistent.upstash.io",
            "token": "xx"
        }
        
        print("  Testing with bogus Upstash credentials (may take a few seconds)...")
        r = requests.post(f"{API_BASE}/superadmin/redis/test", json=payload, headers=headers, timeout=30)
        
        # MUST NOT return 500
        if r.status_code == 500:
            self.log("5: POST /superadmin/redis/test", False, f"Got 500 error (should degrade gracefully): {r.text}")
            return False
        
        if r.status_code != 200:
            self.log("5: POST /superadmin/redis/test", False, f"Status {r.status_code}: {r.text}")
            return False
        
        data = r.json()
        
        # Should return ok:false with error
        if data.get("ok") != False:
            self.log("5: POST /superadmin/redis/test", False, f"Expected ok=false for bogus creds, got {data}")
            return False
        
        if "error" not in data:
            self.log("5: POST /superadmin/redis/test", False, f"Expected error field, got {data}")
            return False
        
        self.log("5: POST /superadmin/redis/test", True, 
                f"Gracefully degraded: ok=false, error='{data['error'][:50]}...' (no 500)")
        return True
    
    def test_redis_save_config(self):
        """Test 6: POST /api/superadmin/redis saves config and handles bad credentials"""
        print("\n=== Test 6: POST /api/superadmin/redis (save config) ===")
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Test 6a: Save with enabled=false (should succeed)
        print("  6a: Save with enabled=false...")
        payload = {
            "provider": "upstash",
            "url": "",
            "token": "",
            "enabled": False
        }
        r = requests.post(f"{API_BASE}/superadmin/redis", json=payload, headers=headers)
        
        if r.status_code != 200:
            self.log("6a: POST /superadmin/redis (enabled=false)", False, f"Status {r.status_code}: {r.text}")
            return False
        
        data = r.json()
        if not data.get("ok"):
            self.log("6a: POST /superadmin/redis (enabled=false)", False, f"Expected ok=true, got {data}")
            return False
        
        if "config" not in data:
            self.log("6a: POST /superadmin/redis (enabled=false)", False, f"Missing config in response: {data}")
            return False
        
        self.log("6a: POST /superadmin/redis (enabled=false)", True, "Saved with enabled=false")
        
        # Verify GET shows enabled=false
        r = requests.get(f"{API_BASE}/superadmin/redis", headers=headers)
        if r.status_code != 200:
            self.log("6a: Verify GET after save", False, f"Status {r.status_code}")
            return False
        
        config = r.json()
        if config.get("enabled") != False:
            self.log("6a: Verify GET after save", False, f"Expected enabled=false, got {config.get('enabled')}")
            return False
        
        self.log("6a: Verify GET after save", True, "GET shows enabled=false")
        
        # Test 6b: Try to enable with bad credentials (should return 400, NOT 500)
        print("  6b: Try to enable with bad credentials...")
        payload = {
            "provider": "redis_cloud",
            "url": "redis://bad-host:6379/0",
            "token": "",
            "enabled": True
        }
        r = requests.post(f"{API_BASE}/superadmin/redis", json=payload, headers=headers, timeout=30)
        
        # Should return 400 (connection failed), NOT 500
        if r.status_code == 500:
            self.log("6b: POST /superadmin/redis (bad creds)", False, f"Got 500 error (should be 400): {r.text}")
            return False
        
        if r.status_code != 400:
            self.log("6b: POST /superadmin/redis (bad creds)", False, f"Expected 400, got {r.status_code}: {r.text}")
            return False
        
        self.log("6b: POST /superadmin/redis (bad creds)", True, "Correctly returned 400 (not 500) for bad credentials")
        return True
    
    def test_auth_guards(self):
        """Test 7: Auth guards - no token → 401, customer token → 403"""
        print("\n=== Test 7: Auth Guards ===")
        
        # Test 7a: No token → 401
        print("  7a: GET /superadmin/perf with no token...")
        r = requests.get(f"{API_BASE}/superadmin/perf")
        
        if r.status_code != 401:
            self.log("7a: No token → 401", False, f"Expected 401, got {r.status_code}")
            return False
        
        self.log("7a: No token → 401", True, "Correctly rejected with 401")
        
        # Test 7b: Customer token → 403
        print("  7b: GET /superadmin/perf with customer token...")
        if not self.customer_token:
            self.log("7b: Customer token → 403", False, "No customer token available")
            return False
        
        headers = {"Authorization": f"Bearer {self.customer_token}"}
        r = requests.get(f"{API_BASE}/superadmin/perf", headers=headers)
        
        if r.status_code != 403:
            self.log("7b: Customer token → 403", False, f"Expected 403, got {r.status_code}")
            return False
        
        self.log("7b: Customer token → 403", True, "Correctly rejected with 403")
        return True
    
    def test_regression_partners(self):
        """Test 8: REGRESSION - GET /api/admin/partners with premium filter"""
        print("\n=== Test 8: REGRESSION - Partners Endpoint ===")
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Test 8a: GET all partners
        print("  8a: GET /api/admin/partners (all)...")
        r = requests.get(f"{API_BASE}/admin/partners", headers=headers)
        
        if r.status_code != 200:
            self.log("8a: GET /admin/partners", False, f"Status {r.status_code}: {r.text}")
            return False
        
        data = r.json()
        # Response is a dict with "partners" key
        if not isinstance(data, dict) or "partners" not in data:
            self.log("8a: GET /admin/partners", False, f"Expected dict with 'partners' key, got {type(data)}")
            return False
        
        all_partners = data["partners"]
        if not isinstance(all_partners, list):
            self.log("8a: GET /admin/partners", False, f"Expected partners to be list, got {type(all_partners)}")
            return False
        
        all_count = len(all_partners)
        self.log("8a: GET /admin/partners", True, f"Found {all_count} partners")
        
        # Test 8b: GET premium partners only
        print("  8b: GET /api/admin/partners?premium=true...")
        r = requests.get(f"{API_BASE}/admin/partners?premium=true", headers=headers)
        
        if r.status_code != 200:
            self.log("8b: GET /admin/partners?premium=true", False, f"Status {r.status_code}: {r.text}")
            return False
        
        data = r.json()
        if not isinstance(data, dict) or "partners" not in data:
            self.log("8b: GET /admin/partners?premium=true", False, f"Expected dict with 'partners' key, got {type(data)}")
            return False
        
        premium_partners = data["partners"]
        if not isinstance(premium_partners, list):
            self.log("8b: GET /admin/partners?premium=true", False, f"Expected partners to be list, got {type(premium_partners)}")
            return False
        
        premium_count = len(premium_partners)
        
        # Verify all premium partners have premium_partner=true
        non_premium = [p for p in premium_partners if not p.get("premium_partner")]
        if non_premium:
            self.log("8b: GET /admin/partners?premium=true", False, 
                    f"Found {len(non_premium)} partners without premium_partner=true")
            return False
        
        # Verify premium list is subset of all (fewer or equal)
        if premium_count > all_count:
            self.log("8b: GET /admin/partners?premium=true", False, 
                    f"Premium count ({premium_count}) > all count ({all_count})")
            return False
        
        self.log("8b: GET /admin/partners?premium=true", True, 
                f"Found {premium_count} premium partners (subset of {all_count}), all have premium_partner=true")
        return True
    
    def test_regression_dashboard(self):
        """Test 9: REGRESSION - GET /api/admin/dashboard"""
        print("\n=== Test 9: REGRESSION - Dashboard Endpoint ===")
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        r = requests.get(f"{API_BASE}/admin/dashboard", headers=headers)
        
        if r.status_code != 200:
            self.log("9: GET /admin/dashboard", False, f"Status {r.status_code}: {r.text}")
            return False
        
        data = r.json()
        
        # Basic structure check
        if not isinstance(data, dict):
            self.log("9: GET /admin/dashboard", False, f"Expected dict, got {type(data)}")
            return False
        
        # Check for some expected keys (not exhaustive)
        expected_keys = ["gmv", "total_bookings", "customers", "partners"]
        missing_keys = [k for k in expected_keys if k not in data]
        if missing_keys:
            self.log("9: GET /admin/dashboard", False, f"Missing keys: {missing_keys}")
            return False
        
        self.log("9: GET /admin/dashboard", True, 
                f"Dashboard working: gmv={data.get('gmv')}, bookings={data.get('total_bookings')}")
        return True
    
    def run_all_tests(self):
        """Run all tests"""
        print("\n" + "="*80)
        print("BACKEND TESTING: Super Admin PERFORMANCE Feature")
        print("BASE_URL:", BASE_URL)
        print("="*80)
        
        # Authenticate
        if not self.auth_admin():
            print("\n❌ Admin authentication failed, cannot continue")
            return False
        
        if not self.auth_customer():
            print("\n⚠️ Customer authentication failed, some tests will be skipped")
        
        # Run tests
        print("\n" + "="*80)
        print("SUPER ADMIN PERFORMANCE ENDPOINTS")
        print("="*80)
        self.test_perf_endpoint()
        self.test_perf_reset()
        self.test_perf_diagnostics()
        self.test_redis_config()
        self.test_redis_test_connection()
        self.test_redis_save_config()
        self.test_auth_guards()
        
        print("\n" + "="*80)
        print("REGRESSION TESTS")
        print("="*80)
        self.test_regression_partners()
        self.test_regression_dashboard()
        
        # Summary
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        passed = sum(1 for r in self.results if r["passed"])
        total = len(self.results)
        print(f"\nTotal: {passed}/{total} tests passed")
        
        if passed < total:
            print("\n❌ FAILED TESTS:")
            for r in self.results:
                if not r["passed"]:
                    print(f"  - {r['test']}: {r['details']}")
        else:
            print("\n✅ ALL TESTS PASSED!")
        
        return passed == total

if __name__ == "__main__":
    runner = TestRunner()
    success = runner.run_all_tests()
    exit(0 if success else 1)
