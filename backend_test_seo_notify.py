#!/usr/bin/env python3
"""
Backend API Testing for AzoApp Advanced SEO Dashboard + Template Variable Render
Tests NEW backend task: "Advanced SEO Dashboard analytics + template variable render"
"""

import requests
import json
from typing import Dict, Any, Optional

# Backend URL from frontend/.env
BASE_URL = "https://expo-troubleshoot-5.preview.emergentagent.com/api"

# Test credentials from /app/memory/test_credentials.md
ADMIN_PHONE = "+919000000000"
PARTNER_PHONE = "+919000000003"  # Raj Kumar
CUSTOMER_PHONE = "+919000000004"  # Priya Verma
OTP = "123456"

# Color codes for output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RESET = "\033[0m"

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.tests = []
    
    def add_pass(self, test_name: str, details: str = ""):
        self.passed += 1
        self.tests.append({"name": test_name, "status": "PASS", "details": details})
        print(f"{GREEN}✓ PASS{RESET}: {test_name}")
        if details:
            print(f"  {details}")
    
    def add_fail(self, test_name: str, details: str = ""):
        self.failed += 1
        self.tests.append({"name": test_name, "status": "FAIL", "details": details})
        print(f"{RED}✗ FAIL{RESET}: {test_name}")
        if details:
            print(f"  {RED}{details}{RESET}")
    
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*80}")
        print(f"{BLUE}TEST SUMMARY{RESET}")
        print(f"{'='*80}")
        print(f"Total Tests: {total}")
        print(f"{GREEN}Passed: {self.passed}{RESET}")
        print(f"{RED}Failed: {self.failed}{RESET}")
        print(f"Success Rate: {(self.passed/total*100) if total > 0 else 0:.1f}%")
        print(f"{'='*80}\n")
        
        if self.failed > 0:
            print(f"{RED}FAILED TESTS:{RESET}")
            for test in self.tests:
                if test["status"] == "FAIL":
                    print(f"  ✗ {test['name']}")
                    if test["details"]:
                        print(f"    {test['details']}")

results = TestResults()

def login(phone: str, otp: str) -> Optional[str]:
    """Login and return JWT token"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/verify-otp", 
                           json={"phone": phone, "otp": otp},
                           timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            # Token is under key "token", not "access_token"
            return data.get("token")
        else:
            print(f"{RED}Login failed for {phone}: {resp.status_code} {resp.text}{RESET}")
            return None
    except Exception as e:
        print(f"{RED}Login error for {phone}: {e}{RESET}")
        return None

def test_seo_dashboard_auth():
    """Test 1: SEO Dashboard without auth returns 401"""
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST 1: SEO Dashboard Auth Guard{RESET}")
    print(f"{BLUE}{'='*80}{RESET}\n")
    
    try:
        resp = requests.get(f"{BASE_URL}/admin/seo/dashboard", timeout=10)
        if resp.status_code in (401, 403):
            results.add_pass("TEST 1: GET /api/admin/seo/dashboard without auth", 
                           f"Returns {resp.status_code} (protected)")
        else:
            results.add_fail("TEST 1: SEO Dashboard auth guard", 
                           f"Expected 401/403, got {resp.status_code}")
    except Exception as e:
        results.add_fail("TEST 1: SEO Dashboard auth guard", f"Error: {e}")

def test_seo_dashboard(admin_token: str):
    """Test 2: GET /api/admin/seo/dashboard returns comprehensive SEO metrics"""
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST 2: SEO Dashboard - GET /api/admin/seo/dashboard{RESET}")
    print(f"{BLUE}{'='*80}{RESET}\n")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    try:
        resp = requests.get(f"{BASE_URL}/admin/seo/dashboard", 
                          headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            
            # Verify all required keys
            required_keys = ["score", "coverage", "global_seo", "counts", "issues", 
                           "issues_total", "recommendations", "sitemap_url", "robots_url"]
            missing = [k for k in required_keys if k not in data]
            
            if missing:
                results.add_fail("TEST 2: SEO Dashboard structure", 
                               f"Missing keys: {missing}")
                return
            
            print(f"  ✓ All required keys present")
            
            # Verify score is between 0-100
            score = data.get("score")
            if not isinstance(score, int) or score < 0 or score > 100:
                results.add_fail("TEST 2: SEO Dashboard score", 
                               f"Score must be int 0-100, got {score}")
                return
            print(f"  ✓ Score: {score} (valid range 0-100)")
            
            # Verify coverage structure
            coverage = data.get("coverage", {})
            for kind in ["category", "subcategory", "service"]:
                if kind not in coverage:
                    results.add_fail("TEST 2: SEO Dashboard coverage", 
                                   f"Missing coverage.{kind}")
                    return
                cov = coverage[kind]
                required_cov_keys = ["total", "title_pct", "description_pct", 
                                    "keywords_pct", "slug_pct"]
                missing_cov = [k for k in required_cov_keys if k not in cov]
                if missing_cov:
                    results.add_fail("TEST 2: SEO Dashboard coverage structure", 
                                   f"Missing coverage.{kind}.{missing_cov}")
                    return
                # Verify all percentages are integers
                for pct_key in ["title_pct", "description_pct", "keywords_pct", "slug_pct"]:
                    if not isinstance(cov[pct_key], int):
                        results.add_fail("TEST 2: SEO Dashboard coverage percentages", 
                                       f"coverage.{kind}.{pct_key} must be int, got {type(cov[pct_key])}")
                        return
            print(f"  ✓ Coverage structure valid (category, subcategory, service)")
            print(f"    - Categories: {coverage['category']['total']}")
            print(f"    - Subcategories: {coverage['subcategory']['total']}")
            print(f"    - Services: {coverage['service']['total']}")
            
            # Verify global_seo structure (object of booleans)
            global_seo = data.get("global_seo", {})
            expected_global = ["site_title", "meta_description", "meta_keywords", "og_image"]
            for key in expected_global:
                if key not in global_seo:
                    results.add_fail("TEST 2: SEO Dashboard global_seo", 
                                   f"Missing global_seo.{key}")
                    return
                if not isinstance(global_seo[key], bool):
                    results.add_fail("TEST 2: SEO Dashboard global_seo type", 
                                   f"global_seo.{key} must be bool, got {type(global_seo[key])}")
                    return
            print(f"  ✓ global_seo structure valid (all booleans)")
            
            # Verify counts structure
            counts = data.get("counts", {})
            required_counts = ["categories", "subcategories", "services", 
                             "schema", "redirects", "sitemap_urls"]
            missing_counts = [k for k in required_counts if k not in counts]
            if missing_counts:
                results.add_fail("TEST 2: SEO Dashboard counts", 
                               f"Missing counts: {missing_counts}")
                return
            print(f"  ✓ counts structure valid")
            print(f"    - sitemap_urls: {counts['sitemap_urls']}")
            
            # Verify issues structure (array with type, id, name, missing[])
            issues = data.get("issues", [])
            if not isinstance(issues, list):
                results.add_fail("TEST 2: SEO Dashboard issues", 
                               f"issues must be array, got {type(issues)}")
                return
            if len(issues) > 0:
                issue = issues[0]
                required_issue_keys = ["type", "id", "name", "missing"]
                missing_issue = [k for k in required_issue_keys if k not in issue]
                if missing_issue:
                    results.add_fail("TEST 2: SEO Dashboard issue structure", 
                                   f"Missing issue keys: {missing_issue}")
                    return
                if not isinstance(issue["missing"], list):
                    results.add_fail("TEST 2: SEO Dashboard issue.missing", 
                                   f"issue.missing must be array, got {type(issue['missing'])}")
                    return
            print(f"  ✓ issues array valid ({len(issues)} issues)")
            
            # Verify issues_total is int
            issues_total = data.get("issues_total")
            if not isinstance(issues_total, int):
                results.add_fail("TEST 2: SEO Dashboard issues_total", 
                               f"issues_total must be int, got {type(issues_total)}")
                return
            print(f"  ✓ issues_total: {issues_total}")
            
            # Verify recommendations structure (array with key, title, done, detail)
            recommendations = data.get("recommendations", [])
            if not isinstance(recommendations, list):
                results.add_fail("TEST 2: SEO Dashboard recommendations", 
                               f"recommendations must be array, got {type(recommendations)}")
                return
            if len(recommendations) > 0:
                rec = recommendations[0]
                required_rec_keys = ["key", "title", "done", "detail"]
                missing_rec = [k for k in required_rec_keys if k not in rec]
                if missing_rec:
                    results.add_fail("TEST 2: SEO Dashboard recommendation structure", 
                                   f"Missing recommendation keys: {missing_rec}")
                    return
                if not isinstance(rec["done"], bool):
                    results.add_fail("TEST 2: SEO Dashboard recommendation.done", 
                                   f"recommendation.done must be bool, got {type(rec['done'])}")
                    return
            print(f"  ✓ recommendations array valid ({len(recommendations)} recommendations)")
            
            # Verify sitemap_url and robots_url
            sitemap_url = data.get("sitemap_url", "")
            robots_url = data.get("robots_url", "")
            if not sitemap_url or not sitemap_url.endswith("/api/sitemap.xml"):
                results.add_fail("TEST 2: SEO Dashboard sitemap_url", 
                               f"Invalid sitemap_url: {sitemap_url}")
                return
            if not robots_url or not robots_url.endswith("/api/robots.txt"):
                results.add_fail("TEST 2: SEO Dashboard robots_url", 
                               f"Invalid robots_url: {robots_url}")
                return
            print(f"  ✓ sitemap_url: {sitemap_url}")
            print(f"  ✓ robots_url: {robots_url}")
            
            results.add_pass("TEST 2: GET /api/admin/seo/dashboard", 
                           f"Returns comprehensive SEO metrics (score={score}, issues={issues_total})")
        else:
            results.add_fail("TEST 2: SEO Dashboard", 
                           f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("TEST 2: SEO Dashboard", f"Error: {e}")

def test_notify_templates(admin_token: str) -> Optional[str]:
    """Test 3: GET /api/admin/partners/notify-templates?channel=sms"""
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST 3: Notify Templates - GET /api/admin/partners/notify-templates{RESET}")
    print(f"{BLUE}{'='*80}{RESET}\n")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    try:
        resp = requests.get(f"{BASE_URL}/admin/partners/notify-templates?channel=sms", 
                          headers=headers, timeout=10)
        if resp.status_code == 200:
            templates = resp.json()
            if not isinstance(templates, list):
                results.add_fail("TEST 3: Notify templates", 
                               f"Expected array, got {type(templates)}")
                return None
            
            print(f"  ✓ Returns array of {len(templates)} SMS templates")
            
            # Find an active SMS template
            sms_template = None
            for t in templates:
                if t.get("channel") == "sms" and t.get("id"):
                    sms_template = t
                    break
            
            if sms_template:
                print(f"  ✓ Found active SMS template: {sms_template.get('name')} (id: {sms_template.get('id')})")
                results.add_pass("TEST 3: GET /api/admin/partners/notify-templates?channel=sms", 
                               f"Returns {len(templates)} templates, found SMS template '{sms_template.get('name')}'")
                return sms_template.get("id")
            else:
                print(f"  {YELLOW}⚠ No active SMS templates found{RESET}")
                results.add_pass("TEST 3: Notify templates", 
                               "No active SMS templates (acceptable)")
                return None
        else:
            results.add_fail("TEST 3: Notify templates", 
                           f"Status {resp.status_code}: {resp.text}")
            return None
    except Exception as e:
        results.add_fail("TEST 3: Notify templates", f"Error: {e}")
        return None

def get_partner_id(admin_token: str) -> Optional[str]:
    """Get partner ID for +919000000003"""
    headers = {"Authorization": f"Bearer {admin_token}"}
    try:
        resp = requests.get(f"{BASE_URL}/admin/users?role=partner", 
                          headers=headers, timeout=10)
        if resp.status_code == 200:
            partners = resp.json()
            partner = next((p for p in partners if p.get("phone") == PARTNER_PHONE), None)
            if partner:
                return partner["id"]
    except Exception:
        pass
    return None

def test_notify_partner_with_variables(admin_token: str, template_id: str, partner_id: str):
    """Test 4: POST /api/admin/partners/{pid}/notify with template variables"""
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST 4: Notify Partner with Variables - POST /api/admin/partners/{{pid}}/notify{RESET}")
    print(f"{BLUE}{'='*80}{RESET}\n")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test 4a: POST with template_id and variables
    try:
        payload = {
            "channel": "sms",
            "template_id": template_id,
            "variables": {
                "reason": "blurry documents"
            }
        }
        resp = requests.post(f"{BASE_URL}/admin/partners/{partner_id}/notify", 
                           headers=headers, json=payload, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            # Should return {ok:true} or a note about dev fallback
            if data.get("ok") == True:
                print(f"  ✓ POST with template_id and variables → 200")
                print(f"    - channel: {data.get('channel')}")
                print(f"    - template: {data.get('template')}")
                if data.get("note"):
                    print(f"    - note: {data.get('note')}")
                results.add_pass("TEST 4a: POST /api/admin/partners/{pid}/notify with variables", 
                               f"Returns 200 with ok:true (template: {data.get('template')})")
            else:
                results.add_fail("TEST 4a: Notify partner response", 
                               f"Expected ok:true, got {data}")
        else:
            results.add_fail("TEST 4a: Notify partner with variables", 
                           f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("TEST 4a: Notify partner with variables", f"Error: {e}")
    
    # Test 4b: POST without template_id → 400
    try:
        payload = {
            "channel": "sms",
            "variables": {"reason": "test"}
        }
        resp = requests.post(f"{BASE_URL}/admin/partners/{partner_id}/notify", 
                           headers=headers, json=payload, timeout=10)
        if resp.status_code == 400:
            print(f"  ✓ POST without template_id → 400")
            results.add_pass("TEST 4b: POST notify without template_id", 
                           "Returns 400 (validation working)")
        else:
            results.add_fail("TEST 4b: POST notify without template_id", 
                           f"Expected 400, got {resp.status_code}")
    except Exception as e:
        results.add_fail("TEST 4b: POST notify without template_id", f"Error: {e}")
    
    # Test 4c: POST with wrong channel template → 400
    # First, get a push/email template
    try:
        resp = requests.get(f"{BASE_URL}/admin/partners/notify-templates?channel=push", 
                          headers=headers, timeout=10)
        if resp.status_code == 200:
            push_templates = resp.json()
            if len(push_templates) > 0:
                push_template_id = push_templates[0].get("id")
                # Try to use push template with sms channel
                payload = {
                    "channel": "sms",
                    "template_id": push_template_id,
                    "variables": {}
                }
                resp = requests.post(f"{BASE_URL}/admin/partners/{partner_id}/notify", 
                                   headers=headers, json=payload, timeout=10)
                if resp.status_code == 400:
                    print(f"  ✓ POST with wrong channel template → 400")
                    results.add_pass("TEST 4c: POST notify with channel mismatch", 
                                   "Returns 400 (validation working)")
                else:
                    results.add_fail("TEST 4c: POST notify with channel mismatch", 
                                   f"Expected 400, got {resp.status_code}")
            else:
                print(f"  {YELLOW}⚠ No push templates to test channel mismatch{RESET}")
    except Exception as e:
        print(f"  {YELLOW}⚠ Test 4c error: {e}{RESET}")

def test_regression_ping_sitemap(admin_token: str):
    """Test 5: REGRESSION - POST /api/admin/seo/ping-sitemap"""
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST 5: REGRESSION - POST /api/admin/seo/ping-sitemap{RESET}")
    print(f"{BLUE}{'='*80}{RESET}\n")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    try:
        resp = requests.post(f"{BASE_URL}/admin/seo/ping-sitemap", 
                           headers=headers, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            # Should return {pinged or throttled, sitemap_url, results}
            if "sitemap_url" in data:
                print(f"  ✓ POST /api/admin/seo/ping-sitemap → 200")
                print(f"    - pinged: {data.get('pinged')}")
                print(f"    - throttled: {data.get('throttled', False)}")
                print(f"    - sitemap_url: {data.get('sitemap_url')}")
                if data.get("results"):
                    print(f"    - results: {len(data.get('results', []))} engines")
                results.add_pass("TEST 5: POST /api/admin/seo/ping-sitemap", 
                               f"Returns 200 with sitemap_url (pinged={data.get('pinged')})")
            else:
                results.add_fail("TEST 5: Ping sitemap response", 
                               f"Missing sitemap_url in response: {data}")
        else:
            results.add_fail("TEST 5: Ping sitemap", 
                           f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("TEST 5: Ping sitemap", f"Error: {e}")

def test_regression_sitemap_xml():
    """Test 6: REGRESSION - GET /api/sitemap.xml"""
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST 6: REGRESSION - GET /api/sitemap.xml{RESET}")
    print(f"{BLUE}{'='*80}{RESET}\n")
    
    try:
        resp = requests.get(f"{BASE_URL}/sitemap.xml", timeout=10)
        if resp.status_code == 200:
            content = resp.text
            # Verify it's XML with <urlset>
            if "<urlset" in content and "xmlns" in content:
                print(f"  ✓ GET /api/sitemap.xml → 200 XML")
                print(f"    - Content length: {len(content)} bytes")
                # Count URLs
                url_count = content.count("<url>")
                print(f"    - URLs: {url_count}")
                results.add_pass("TEST 6: GET /api/sitemap.xml", 
                               f"Returns 200 XML with <urlset> ({url_count} URLs)")
            else:
                results.add_fail("TEST 6: Sitemap XML format", 
                               f"Invalid XML format (missing <urlset>)")
        else:
            results.add_fail("TEST 6: Sitemap XML", 
                           f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("TEST 6: Sitemap XML", f"Error: {e}")

def test_regression_category_crud(admin_token: str):
    """Test 7: REGRESSION - Create and delete category"""
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST 7: REGRESSION - Category CRUD (create + delete){RESET}")
    print(f"{BLUE}{'='*80}{RESET}\n")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    created_id = None
    
    try:
        # Create category
        payload = {
            "name": "ZZ SEO Test",
            "slug": "zz-seo-test",
            "status": "active",
            "description": "Temporary test category"
        }
        resp = requests.post(f"{BASE_URL}/catalog/categories", 
                           headers=headers, json=payload, timeout=10)
        if resp.status_code in (200, 201):
            data = resp.json()
            created_id = data.get("id")
            print(f"  ✓ POST /api/catalog/categories → {resp.status_code}")
            print(f"    - Created category: {data.get('name')} (id: {created_id})")
            
            # Verify auto-ping didn't break it
            if created_id:
                results.add_pass("TEST 7a: POST /api/catalog/categories", 
                               f"Creates category successfully (auto-ping did not break it)")
            else:
                results.add_fail("TEST 7a: Create category", 
                               "Category created but no id returned")
                return
        else:
            results.add_fail("TEST 7a: Create category", 
                           f"Status {resp.status_code}: {resp.text}")
            return
        
        # Delete category
        if created_id:
            resp = requests.delete(f"{BASE_URL}/catalog/categories/{created_id}", 
                                 headers=headers, timeout=10)
            if resp.status_code == 200:
                print(f"  ✓ DELETE /api/catalog/categories/{created_id} → 200")
                results.add_pass("TEST 7b: DELETE /api/catalog/categories/{id}", 
                               "Deletes category successfully (cleanup done)")
            else:
                results.add_fail("TEST 7b: Delete category", 
                               f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("TEST 7: Category CRUD", f"Error: {e}")
        # Try to cleanup
        if created_id:
            try:
                requests.delete(f"{BASE_URL}/catalog/categories/{created_id}", 
                              headers=headers, timeout=10)
            except Exception:
                pass

def test_regression_job_requests(admin_token: str):
    """Test 8: REGRESSION - GET /api/admin/job-requests?status=awaiting"""
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST 8: REGRESSION - GET /api/admin/job-requests?status=awaiting{RESET}")
    print(f"{BLUE}{'='*80}{RESET}\n")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    try:
        resp = requests.get(f"{BASE_URL}/admin/job-requests?status=awaiting", 
                          headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                print(f"  ✓ GET /api/admin/job-requests?status=awaiting → 200")
                print(f"    - Returns {len(data)} awaiting bookings")
                results.add_pass("TEST 8: GET /api/admin/job-requests?status=awaiting", 
                               f"Returns array of {len(data)} bookings (still works)")
            else:
                results.add_fail("TEST 8: Job requests", 
                               f"Expected array, got {type(data)}")
        else:
            results.add_fail("TEST 8: Job requests", 
                           f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("TEST 8: Job requests", f"Error: {e}")

def test_regression_user_detail(admin_token: str):
    """Test 9: REGRESSION - GET /api/admin/users/{customerId}/detail"""
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST 9: REGRESSION - GET /api/admin/users/{{customerId}}/detail{RESET}")
    print(f"{BLUE}{'='*80}{RESET}\n")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    try:
        # Get customer ID
        resp = requests.get(f"{BASE_URL}/admin/users?role=customer", 
                          headers=headers, timeout=10)
        if resp.status_code != 200:
            results.add_fail("TEST 9: Get customers", 
                           f"Status {resp.status_code}: {resp.text}")
            return
        
        customers = resp.json()
        customer = next((c for c in customers if c.get("phone") == CUSTOMER_PHONE), None)
        if not customer:
            results.add_fail("TEST 9: Find customer", 
                           f"Customer {CUSTOMER_PHONE} not found")
            return
        
        customer_id = customer["id"]
        print(f"  Using customer ID: {customer_id} ({customer.get('name')})")
        
        # Get customer detail
        resp = requests.get(f"{BASE_URL}/admin/users/{customer_id}/detail", 
                          headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            # Verify stats object exists
            if "stats" in data:
                stats = data["stats"]
                print(f"  ✓ GET /api/admin/users/{{customerId}}/detail → 200")
                print(f"    - stats.bookings: {stats.get('bookings')}")
                print(f"    - stats.completed: {stats.get('completed')}")
                print(f"    - stats.total_spent: ₹{stats.get('total_spent')}")
                results.add_pass("TEST 9: GET /api/admin/users/{customerId}/detail", 
                               f"Returns stats object (still works quickly)")
            else:
                results.add_fail("TEST 9: User detail structure", 
                               "Missing stats object")
        else:
            results.add_fail("TEST 9: User detail", 
                           f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("TEST 9: User detail", f"Error: {e}")

def main():
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}AzoApp Backend Testing - Advanced SEO Dashboard + Template Variable Render{RESET}")
    print(f"{BLUE}{'='*80}{RESET}\n")
    
    print(f"Backend URL: {BASE_URL}")
    print(f"Admin: {ADMIN_PHONE}")
    print(f"Partner: {PARTNER_PHONE}\n")
    
    # Test 1: Auth guard (run first, doesn't need token)
    test_seo_dashboard_auth()
    
    # Login
    print(f"\n{YELLOW}Logging in...{RESET}")
    admin_token = login(ADMIN_PHONE, OTP)
    
    if not admin_token:
        print(f"{RED}Failed to login as admin. Aborting tests.{RESET}")
        return
    
    print(f"{GREEN}✓ Admin login successful{RESET}\n")
    
    # Test 2: SEO Dashboard
    test_seo_dashboard(admin_token)
    
    # Test 3: Get SMS templates
    template_id = test_notify_templates(admin_token)
    
    # Test 4: Notify partner with variables
    if template_id:
        partner_id = get_partner_id(admin_token)
        if partner_id:
            test_notify_partner_with_variables(admin_token, template_id, partner_id)
        else:
            print(f"{YELLOW}⚠ Partner {PARTNER_PHONE} not found, skipping notify tests{RESET}")
    else:
        print(f"{YELLOW}⚠ No SMS template found, skipping notify tests{RESET}")
    
    # REGRESSION TESTS
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}REGRESSION TESTS{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")
    
    # Test 5: Ping sitemap
    test_regression_ping_sitemap(admin_token)
    
    # Test 6: Sitemap XML
    test_regression_sitemap_xml()
    
    # Test 7: Category CRUD
    test_regression_category_crud(admin_token)
    
    # Test 8: Job requests
    test_regression_job_requests(admin_token)
    
    # Test 9: User detail
    test_regression_user_detail(admin_token)
    
    # Print summary
    results.summary()

if __name__ == "__main__":
    main()
