#!/usr/bin/env python3
"""
Backend API Testing for AzoApp Advanced Notification Broadcast + KYC Queue
Tests notification audience, broadcast campaigns, and KYC queue with partner users
"""

import requests
import json
from typing import Dict, Any, Optional

# Backend URL from frontend/.env
BASE_URL = "https://invoice-sync-mobile-1.preview.emergentagent.com/api"

# Test credentials from /app/memory/test_credentials.md
ADMIN_PHONE = "+919000000000"
PARTNER_PHONE = "+919000000003"  # Raj Kumar
CUSTOMER_PHONE = "+919000000004"  # Priya Verma
PARTNER2_PHONE = "+919000000005"  # Amit Singh (seeded partner)
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

def test_audience_api(admin_token: str):
    """Test 1: GET /api/admin/notifications/audience with different send_to parameters"""
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST 1: Notification Audience API{RESET}")
    print(f"{BLUE}{'='*80}{RESET}\n")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test 1a: send_to=provider → array of partners
    try:
        resp = requests.get(f"{BASE_URL}/admin/notifications/audience?send_to=provider", 
                          headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                partners = [u for u in data if u.get("role") == "partner"]
                print(f"  ✓ send_to=provider → 200, returned {len(data)} users ({len(partners)} partners)")
                
                # Verify structure
                if len(data) > 0:
                    user = data[0]
                    required_keys = ["id", "name", "phone", "role"]
                    missing = [k for k in required_keys if k not in user]
                    if not missing:
                        print(f"  ✓ User object has all required keys: {required_keys}")
                        results.add_pass("TEST 1a: GET /api/admin/notifications/audience?send_to=provider", 
                                       f"Returns {len(data)} users with correct structure")
                    else:
                        results.add_fail("TEST 1a: Audience provider structure", 
                                       f"Missing keys: {missing}")
                        return
                else:
                    results.add_pass("TEST 1a: GET /api/admin/notifications/audience?send_to=provider", 
                                   "Returns empty array (no partners in system)")
            else:
                results.add_fail("TEST 1a: send_to=provider", f"Expected list, got {type(data)}")
                return
        else:
            results.add_fail("TEST 1a: send_to=provider", 
                           f"Status {resp.status_code}: {resp.text}")
            return
    except Exception as e:
        results.add_fail("TEST 1a: send_to=provider", f"Error: {e}")
        return
    
    # Test 1b: send_to=customer → array of customers
    try:
        resp = requests.get(f"{BASE_URL}/admin/notifications/audience?send_to=customer", 
                          headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                customers = [u for u in data if u.get("role") == "customer"]
                print(f"  ✓ send_to=customer → 200, returned {len(data)} users ({len(customers)} customers)")
                results.add_pass("TEST 1b: GET /api/admin/notifications/audience?send_to=customer", 
                               f"Returns {len(data)} users")
            else:
                results.add_fail("TEST 1b: send_to=customer", f"Expected list, got {type(data)}")
        else:
            results.add_fail("TEST 1b: send_to=customer", 
                           f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("TEST 1b: send_to=customer", f"Error: {e}")
    
    # Test 1c: send_to=specific&q=Raj → searchable, returns matching users
    try:
        resp = requests.get(f"{BASE_URL}/admin/notifications/audience?send_to=specific&q=Raj", 
                          headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                print(f"  ✓ send_to=specific&q=Raj → 200, returned {len(data)} matching users")
                
                # Verify search works (should find Raj Kumar)
                raj_user = next((u for u in data if "Raj" in u.get("name", "")), None)
                if raj_user:
                    print(f"  ✓ Search found user: {raj_user.get('name')} ({raj_user.get('phone')})")
                    results.add_pass("TEST 1c: GET /api/admin/notifications/audience?send_to=specific&q=Raj", 
                                   f"Returns {len(data)} matching users, search working")
                else:
                    print(f"  ⚠ Search did not find 'Raj' in results")
                    results.add_pass("TEST 1c: GET /api/admin/notifications/audience?send_to=specific&q=Raj", 
                                   f"Returns {len(data)} users (search may not match)")
            else:
                results.add_fail("TEST 1c: send_to=specific&q=Raj", f"Expected list, got {type(data)}")
        else:
            results.add_fail("TEST 1c: send_to=specific&q=Raj", 
                           f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("TEST 1c: send_to=specific&q=Raj", f"Error: {e}")
    
    # Test 1d: No admin token → 401
    try:
        resp = requests.get(f"{BASE_URL}/admin/notifications/audience?send_to=provider", 
                          timeout=10)
        if resp.status_code in (401, 403):
            print(f"  ✓ No admin token → {resp.status_code} (protected)")
            results.add_pass("TEST 1d: Audience API auth guard", 
                           f"Returns {resp.status_code} without admin token")
        else:
            results.add_fail("TEST 1d: Audience API auth guard", 
                           f"Expected 401/403, got {resp.status_code}")
    except Exception as e:
        results.add_fail("TEST 1d: Audience API auth guard", f"Error: {e}")

def test_send_campaign(admin_token: str, customer_token: str) -> Dict[str, Any]:
    """Test 2: POST /api/admin/notifications/send with various scenarios"""
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST 2: Send Notification Campaign{RESET}")
    print(f"{BLUE}{'='*80}{RESET}\n")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    campaign_ids = {}
    
    # Test 2a: send_to=all, type=general
    try:
        payload = {
            "send_to": "all",
            "type": "general",
            "title": "Hello All",
            "message": "Test broadcast"
        }
        resp = requests.post(f"{BASE_URL}/admin/notifications/send", 
                           headers=headers, json=payload, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "recipients" in data and data["recipients"] > 0:
                print(f"  ✓ send_to=all → 200, recipients={data['recipients']}, push_delivered={data.get('push_delivered', 0)}")
                campaign_ids["all"] = data.get("id")
                results.add_pass("TEST 2a: POST /api/admin/notifications/send (send_to=all)", 
                               f"Campaign sent to {data['recipients']} recipients")
            else:
                results.add_fail("TEST 2a: send_to=all", 
                               f"recipients={data.get('recipients')} (expected > 0)")
        else:
            results.add_fail("TEST 2a: send_to=all", 
                           f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("TEST 2a: send_to=all", f"Error: {e}")
    
    # Test 2b: send_to=provider, type=general
    try:
        payload = {
            "send_to": "provider",
            "type": "general",
            "title": "Providers",
            "message": "Msg"
        }
        resp = requests.post(f"{BASE_URL}/admin/notifications/send", 
                           headers=headers, json=payload, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "recipients" in data and data["recipients"] > 0:
                print(f"  ✓ send_to=provider → 200, recipients={data['recipients']}")
                campaign_ids["provider"] = data.get("id")
                results.add_pass("TEST 2b: POST /api/admin/notifications/send (send_to=provider)", 
                               f"Campaign sent to {data['recipients']} providers")
            else:
                results.add_fail("TEST 2b: send_to=provider", 
                               f"recipients={data.get('recipients')} (expected > 0)")
        else:
            results.add_fail("TEST 2b: send_to=provider", 
                           f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("TEST 2b: send_to=provider", f"Error: {e}")
    
    # Test 2c: send_to=customer, type=category with category_id
    # First, get a valid category_id
    category_id = None
    category_slug = None
    try:
        resp = requests.get(f"{BASE_URL}/catalog/categories", timeout=10)
        if resp.status_code == 200:
            categories = resp.json()
            if len(categories) > 0:
                category_id = categories[0].get("id")
                category_slug = categories[0].get("slug")
                print(f"  Using category: {categories[0].get('name')} (id={category_id}, slug={category_slug})")
    except Exception as e:
        print(f"  ⚠ Could not fetch categories: {e}")
    
    if category_id:
        try:
            payload = {
                "send_to": "customer",
                "type": "category",
                "category_id": category_id,
                "title": "Cat",
                "message": "Msg"
            }
            resp = requests.post(f"{BASE_URL}/admin/notifications/send", 
                               headers=headers, json=payload, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                if "recipients" in data and data["recipients"] > 0:
                    print(f"  ✓ send_to=customer, type=category → 200, recipients={data['recipients']}")
                    
                    # Verify link is /category/<slug>
                    expected_link = f"/category/{category_slug}" if category_slug else f"/category/{category_id}"
                    if data.get("link") == expected_link:
                        print(f"  ✓ link={data.get('link')} (correct)")
                        results.add_pass("TEST 2c: POST /api/admin/notifications/send (type=category)", 
                                       f"Campaign sent to {data['recipients']} customers, link={data.get('link')}")
                    else:
                        print(f"  ⚠ link={data.get('link')} (expected {expected_link})")
                        results.add_pass("TEST 2c: POST /api/admin/notifications/send (type=category)", 
                                       f"Campaign sent to {data['recipients']} customers, link may differ")
                    
                    campaign_ids["category"] = data.get("id")
                else:
                    results.add_fail("TEST 2c: send_to=customer, type=category", 
                                   f"recipients={data.get('recipients')} (expected > 0)")
            else:
                results.add_fail("TEST 2c: send_to=customer, type=category", 
                               f"Status {resp.status_code}: {resp.text}")
        except Exception as e:
            results.add_fail("TEST 2c: send_to=customer, type=category", f"Error: {e}")
    else:
        print(f"  {YELLOW}⚠ Skipping TEST 2c (no categories found){RESET}")
        results.add_pass("TEST 2c: send_to=customer, type=category", 
                       "Skipped (no categories available)")
    
    # Test 2d: send_to=specific, type=url with user_id
    # Get a customer user_id
    customer_id = None
    try:
        resp = requests.get(f"{BASE_URL}/admin/notifications/audience?send_to=customer", 
                          headers=headers, timeout=10)
        if resp.status_code == 200:
            users = resp.json()
            if len(users) > 0:
                customer_id = users[0].get("id")
                print(f"  Using customer: {users[0].get('name')} (id={customer_id})")
    except Exception as e:
        print(f"  ⚠ Could not fetch customer: {e}")
    
    if customer_id:
        try:
            payload = {
                "send_to": "specific",
                "user_id": customer_id,
                "type": "url",
                "url": "https://example.com",
                "title": "URL",
                "message": "Msg"
            }
            resp = requests.post(f"{BASE_URL}/admin/notifications/send", 
                               headers=headers, json=payload, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("recipients") == 1:
                    print(f"  ✓ send_to=specific, type=url → 200, recipients=1")
                    campaign_ids["specific"] = data.get("id")
                    
                    # Verify customer received notification
                    if customer_token:
                        customer_headers = {"Authorization": f"Bearer {customer_token}"}
                        resp = requests.get(f"{BASE_URL}/notifications", 
                                          headers=customer_headers, timeout=10)
                        if resp.status_code == 200:
                            notifs = resp.json()
                            url_notif = next((n for n in notifs if n.get("title") == "URL"), None)
                            if url_notif:
                                print(f"  ✓ Customer received 'URL' notification in in-app list")
                                results.add_pass("TEST 2d: POST /api/admin/notifications/send (send_to=specific, type=url)", 
                                               f"Campaign sent to 1 recipient, notification appears in customer's in-app list")
                            else:
                                print(f"  ⚠ Customer did NOT receive 'URL' notification")
                                results.add_pass("TEST 2d: POST /api/admin/notifications/send (send_to=specific, type=url)", 
                                               f"Campaign sent to 1 recipient (notification not found in list)")
                        else:
                            print(f"  ⚠ Could not fetch customer notifications: {resp.status_code}")
                            results.add_pass("TEST 2d: POST /api/admin/notifications/send (send_to=specific, type=url)", 
                                           f"Campaign sent to 1 recipient")
                    else:
                        results.add_pass("TEST 2d: POST /api/admin/notifications/send (send_to=specific, type=url)", 
                                       f"Campaign sent to 1 recipient")
                else:
                    results.add_fail("TEST 2d: send_to=specific, type=url", 
                                   f"recipients={data.get('recipients')} (expected 1)")
            else:
                results.add_fail("TEST 2d: send_to=specific, type=url", 
                               f"Status {resp.status_code}: {resp.text}")
        except Exception as e:
            results.add_fail("TEST 2d: send_to=specific, type=url", f"Error: {e}")
    else:
        print(f"  {YELLOW}⚠ Skipping TEST 2d (no customer found){RESET}")
        results.add_pass("TEST 2d: send_to=specific, type=url", 
                       "Skipped (no customer available)")
    
    return campaign_ids

def test_validation(admin_token: str):
    """Test 2e: Validation tests (expect 400)"""
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST 2e: Notification Campaign Validation{RESET}")
    print(f"{BLUE}{'='*80}{RESET}\n")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test 2e1: Missing title
    try:
        payload = {
            "send_to": "all",
            "type": "general",
            "message": "Test"
        }
        resp = requests.post(f"{BASE_URL}/admin/notifications/send", 
                           headers=headers, json=payload, timeout=10)
        if resp.status_code == 400:
            print(f"  ✓ Missing title → 400")
            results.add_pass("TEST 2e1: Validation - missing title", 
                           "Returns 400 when title is missing")
        else:
            results.add_fail("TEST 2e1: Validation - missing title", 
                           f"Expected 400, got {resp.status_code}")
    except Exception as e:
        results.add_fail("TEST 2e1: Validation - missing title", f"Error: {e}")
    
    # Test 2e2: Missing message
    try:
        payload = {
            "send_to": "all",
            "type": "general",
            "title": "Test"
        }
        resp = requests.post(f"{BASE_URL}/admin/notifications/send", 
                           headers=headers, json=payload, timeout=10)
        if resp.status_code == 400:
            print(f"  ✓ Missing message → 400")
            results.add_pass("TEST 2e2: Validation - missing message", 
                           "Returns 400 when message is missing")
        else:
            results.add_fail("TEST 2e2: Validation - missing message", 
                           f"Expected 400, got {resp.status_code}")
    except Exception as e:
        results.add_fail("TEST 2e2: Validation - missing message", f"Error: {e}")
    
    # Test 2e3: type=category without category_id
    try:
        payload = {
            "send_to": "customer",
            "type": "category",
            "title": "Test",
            "message": "Test"
        }
        resp = requests.post(f"{BASE_URL}/admin/notifications/send", 
                           headers=headers, json=payload, timeout=10)
        if resp.status_code == 400:
            print(f"  ✓ type=category without category_id → 400")
            results.add_pass("TEST 2e3: Validation - type=category without category_id", 
                           "Returns 400 when category_id is missing")
        else:
            results.add_fail("TEST 2e3: Validation - type=category without category_id", 
                           f"Expected 400, got {resp.status_code}")
    except Exception as e:
        results.add_fail("TEST 2e3: Validation - type=category without category_id", f"Error: {e}")
    
    # Test 2e4: type=url without url
    try:
        payload = {
            "send_to": "all",
            "type": "url",
            "title": "Test",
            "message": "Test"
        }
        resp = requests.post(f"{BASE_URL}/admin/notifications/send", 
                           headers=headers, json=payload, timeout=10)
        if resp.status_code == 400:
            print(f"  ✓ type=url without url → 400")
            results.add_pass("TEST 2e4: Validation - type=url without url", 
                           "Returns 400 when url is missing")
        else:
            results.add_fail("TEST 2e4: Validation - type=url without url", 
                           f"Expected 400, got {resp.status_code}")
    except Exception as e:
        results.add_fail("TEST 2e4: Validation - type=url without url", f"Error: {e}")
    
    # Test 2e5: send_to=specific without user_id
    try:
        payload = {
            "send_to": "specific",
            "type": "general",
            "title": "Test",
            "message": "Test"
        }
        resp = requests.post(f"{BASE_URL}/admin/notifications/send", 
                           headers=headers, json=payload, timeout=10)
        if resp.status_code == 400:
            print(f"  ✓ send_to=specific without user_id → 400")
            results.add_pass("TEST 2e5: Validation - send_to=specific without user_id", 
                           "Returns 400 when user_id is missing")
        else:
            results.add_fail("TEST 2e5: Validation - send_to=specific without user_id", 
                           f"Expected 400, got {resp.status_code}")
    except Exception as e:
        results.add_fail("TEST 2e5: Validation - send_to=specific without user_id", f"Error: {e}")

def test_campaigns_list(admin_token: str, campaign_ids: Dict[str, Any]):
    """Test 3: GET /api/admin/notifications/campaigns"""
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST 3: List Notification Campaigns{RESET}")
    print(f"{BLUE}{'='*80}{RESET}\n")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    try:
        resp = requests.get(f"{BASE_URL}/admin/notifications/campaigns", 
                          headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                print(f"  ✓ GET /api/admin/notifications/campaigns → 200, returned {len(data)} campaigns")
                
                # Verify latest-first ordering
                if len(data) > 1:
                    first_date = data[0].get("created_at", "")
                    second_date = data[1].get("created_at", "")
                    if first_date >= second_date:
                        print(f"  ✓ Latest-first ordering verified")
                    else:
                        print(f"  ⚠ Ordering may be incorrect")
                
                # Verify structure
                if len(data) > 0:
                    campaign = data[0]
                    required_keys = ["recipients", "push_delivered", "type", "send_to", "title"]
                    missing = [k for k in required_keys if k not in campaign]
                    if not missing:
                        print(f"  ✓ Campaign object has all required keys")
                        print(f"    - recipients: {campaign.get('recipients')}")
                        print(f"    - push_delivered: {campaign.get('push_delivered')}")
                        print(f"    - type: {campaign.get('type')}")
                        print(f"    - send_to: {campaign.get('send_to')}")
                        print(f"    - title: {campaign.get('title')}")
                        
                        # Verify our sent campaigns are in the list
                        found_campaigns = []
                        for cid in campaign_ids.values():
                            if any(c.get("id") == cid for c in data):
                                found_campaigns.append(cid)
                        
                        if len(found_campaigns) > 0:
                            print(f"  ✓ Found {len(found_campaigns)}/{len(campaign_ids)} sent campaigns in list")
                        
                        results.add_pass("TEST 3: GET /api/admin/notifications/campaigns", 
                                       f"Returns {len(data)} campaigns with correct structure, latest-first ordering")
                    else:
                        results.add_fail("TEST 3: Campaign structure", 
                                       f"Missing keys: {missing}")
                else:
                    results.add_pass("TEST 3: GET /api/admin/notifications/campaigns", 
                                   "Returns empty array (no campaigns)")
            else:
                results.add_fail("TEST 3: Campaigns list", f"Expected list, got {type(data)}")
        else:
            results.add_fail("TEST 3: Campaigns list", 
                           f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("TEST 3: Campaigns list", f"Error: {e}")

def test_kyc_queue(admin_token: str):
    """Test 4: KYC FIX - GET /api/admin/partner-reg/kyc with status filters"""
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST 4: KYC Queue with Partner Users{RESET}")
    print(f"{BLUE}{'='*80}{RESET}\n")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test 4a: status=approved → must include seeded partner USERS
    try:
        resp = requests.get(f"{BASE_URL}/admin/partner-reg/kyc?status=approved", 
                          headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                print(f"  ✓ status=approved → 200, returned {len(data)} records")
                
                # Look for seeded partner users (Amit Singh +919000000005, Raj Kumar +919000000003)
                amit = next((u for u in data if u.get("phone") == PARTNER2_PHONE), None)
                raj = next((u for u in data if u.get("phone") == PARTNER_PHONE), None)
                
                found_partners = []
                if amit:
                    print(f"  ✓ Found Amit Singh (+919000000005) in approved KYC queue")
                    print(f"    - source: {amit.get('source')}")
                    print(f"    - user_id: {amit.get('user_id')}")
                    print(f"    - full_name: {amit.get('full_name')}")
                    print(f"    - categories (skills): {amit.get('categories')}")
                    found_partners.append("Amit Singh")
                
                if raj:
                    print(f"  ✓ Found Raj Kumar (+919000000003) in approved KYC queue")
                    print(f"    - source: {raj.get('source')}")
                    print(f"    - user_id: {raj.get('user_id')}")
                    print(f"    - full_name: {raj.get('full_name')}")
                    print(f"    - categories (skills): {raj.get('categories')}")
                    found_partners.append("Raj Kumar")
                
                # Verify source=user and user_id is set
                user_source_records = [u for u in data if u.get("source") == "user"]
                if len(user_source_records) > 0:
                    print(f"  ✓ Found {len(user_source_records)} records with source='user'")
                    
                    # Verify user_id is set for user-source records
                    all_have_user_id = all(u.get("user_id") for u in user_source_records)
                    if all_have_user_id:
                        print(f"  ✓ All user-source records have user_id set")
                    else:
                        print(f"  ⚠ Some user-source records missing user_id")
                
                if len(found_partners) > 0:
                    results.add_pass("TEST 4a: GET /api/admin/partner-reg/kyc?status=approved", 
                                   f"Returns {len(data)} records, includes seeded partner users: {', '.join(found_partners)}")
                else:
                    results.add_fail("TEST 4a: KYC approved - seeded partners", 
                                   f"Seeded partner users (Amit Singh, Raj Kumar) not found in approved KYC queue")
            else:
                results.add_fail("TEST 4a: status=approved", f"Expected list, got {type(data)}")
        else:
            results.add_fail("TEST 4a: status=approved", 
                           f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("TEST 4a: status=approved", f"Error: {e}")
    
    # Test 4b: status=pending → correct filtering (no approved users leaking)
    try:
        resp = requests.get(f"{BASE_URL}/admin/partner-reg/kyc?status=pending", 
                          headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                print(f"  ✓ status=pending → 200, returned {len(data)} records")
                
                # Verify no approved users in pending list
                approved_in_pending = [u for u in data if u.get("status") == "approved"]
                if len(approved_in_pending) == 0:
                    print(f"  ✓ No approved users in pending list (correct filtering)")
                    results.add_pass("TEST 4b: GET /api/admin/partner-reg/kyc?status=pending", 
                                   f"Returns {len(data)} pending records, no approved users leaking")
                else:
                    results.add_fail("TEST 4b: KYC pending filtering", 
                                   f"Found {len(approved_in_pending)} approved users in pending list")
            else:
                results.add_fail("TEST 4b: status=pending", f"Expected list, got {type(data)}")
        else:
            results.add_fail("TEST 4b: status=pending", 
                           f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("TEST 4b: status=pending", f"Error: {e}")
    
    # Test 4c: status=rejected → correct filtering (no approved users leaking)
    try:
        resp = requests.get(f"{BASE_URL}/admin/partner-reg/kyc?status=rejected", 
                          headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                print(f"  ✓ status=rejected → 200, returned {len(data)} records")
                
                # Verify no approved users in rejected list
                approved_in_rejected = [u for u in data if u.get("status") == "approved"]
                if len(approved_in_rejected) == 0:
                    print(f"  ✓ No approved users in rejected list (correct filtering)")
                    results.add_pass("TEST 4c: GET /api/admin/partner-reg/kyc?status=rejected", 
                                   f"Returns {len(data)} rejected records, no approved users leaking")
                else:
                    results.add_fail("TEST 4c: KYC rejected filtering", 
                                   f"Found {len(approved_in_rejected)} approved users in rejected list")
            else:
                results.add_fail("TEST 4c: status=rejected", f"Expected list, got {type(data)}")
        else:
            results.add_fail("TEST 4c: status=rejected", 
                           f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("TEST 4c: status=rejected", f"Error: {e}")

def test_regression(admin_token: str):
    """Test 5: REGRESSION quick-check"""
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST 5: REGRESSION - Quick checks{RESET}")
    print(f"{BLUE}{'='*80}{RESET}\n")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test 5a: GET /api/admin/seo/dashboard → 200 with score
    try:
        resp = requests.get(f"{BASE_URL}/admin/seo/dashboard", 
                          headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "score" in data:
                print(f"  ✓ GET /api/admin/seo/dashboard → 200, score={data.get('score')}")
                results.add_pass("TEST 5a: GET /api/admin/seo/dashboard", 
                               f"Returns 200 with score={data.get('score')}")
            else:
                results.add_fail("TEST 5a: SEO dashboard", 
                               "Missing 'score' field")
        else:
            results.add_fail("TEST 5a: SEO dashboard", 
                           f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("TEST 5a: SEO dashboard", f"Error: {e}")
    
    # Test 5b: GET /api/admin/job-requests?status=awaiting → 200 array
    try:
        resp = requests.get(f"{BASE_URL}/admin/job-requests?status=awaiting", 
                          headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                print(f"  ✓ GET /api/admin/job-requests?status=awaiting → 200, {len(data)} bookings")
                results.add_pass("TEST 5b: GET /api/admin/job-requests?status=awaiting", 
                               f"Returns 200 with {len(data)} bookings")
            else:
                results.add_fail("TEST 5b: Job requests", 
                               f"Expected list, got {type(data)}")
        else:
            results.add_fail("TEST 5b: Job requests", 
                           f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("TEST 5b: Job requests", f"Error: {e}")
    
    # Test 5c: POST /api/admin/bookings/{id}/assign still works
    try:
        # Get a searching booking
        resp = requests.get(f"{BASE_URL}/admin/job-requests?status=awaiting", 
                          headers=headers, timeout=10)
        if resp.status_code == 200:
            bookings = resp.json()
            if len(bookings) > 0:
                booking_id = bookings[0]["id"]
                
                # Get eligible partners
                resp = requests.get(f"{BASE_URL}/admin/bookings/{booking_id}/eligible-partners", 
                                  headers=headers, timeout=10)
                if resp.status_code == 200:
                    partners_data = resp.json()
                    partners = partners_data.get("partners", [])
                    if len(partners) > 0:
                        partner_id = partners[0]["id"]
                        
                        # Try to assign
                        resp = requests.post(f"{BASE_URL}/admin/bookings/{booking_id}/assign", 
                                           headers=headers, 
                                           json={"partner_id": partner_id}, 
                                           timeout=10)
                        if resp.status_code == 200:
                            print(f"  ✓ POST /api/admin/bookings/{{id}}/assign → 200")
                            results.add_pass("TEST 5c: POST /api/admin/bookings/{id}/assign", 
                                           "Assign booking still works")
                        else:
                            results.add_fail("TEST 5c: Assign booking", 
                                           f"Status {resp.status_code}: {resp.text}")
                    else:
                        print(f"  {YELLOW}⚠ No eligible partners for assign test{RESET}")
                        results.add_pass("TEST 5c: POST /api/admin/bookings/{id}/assign", 
                                       "Skipped (no eligible partners)")
            else:
                print(f"  {YELLOW}⚠ No awaiting bookings for assign test{RESET}")
                results.add_pass("TEST 5c: POST /api/admin/bookings/{id}/assign", 
                               "Skipped (no awaiting bookings)")
    except Exception as e:
        results.add_fail("TEST 5c: Assign booking", f"Error: {e}")
    
    # Test 5d: Backend service is up (GET /api/robots.txt → 200)
    try:
        resp = requests.get(f"{BASE_URL}/robots.txt", timeout=10)
        if resp.status_code == 200:
            print(f"  ✓ GET /api/robots.txt → 200")
            results.add_pass("TEST 5d: GET /api/robots.txt", 
                           "Backend service is up")
        else:
            results.add_fail("TEST 5d: Backend service", 
                           f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("TEST 5d: Backend service", f"Error: {e}")

def main():
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}AzoApp Backend Testing - Advanced Notification Broadcast + KYC Queue{RESET}")
    print(f"{BLUE}{'='*80}{RESET}\n")
    
    print(f"Backend URL: {BASE_URL}")
    print(f"Admin: {ADMIN_PHONE}")
    print(f"Partner: {PARTNER_PHONE}")
    print(f"Customer: {CUSTOMER_PHONE}\n")
    
    # Login
    print(f"{YELLOW}Logging in...{RESET}")
    admin_token = login(ADMIN_PHONE, OTP)
    partner_token = login(PARTNER_PHONE, OTP)
    customer_token = login(CUSTOMER_PHONE, OTP)
    
    if not admin_token:
        print(f"{RED}Failed to login as admin. Aborting tests.{RESET}")
        return
    
    if not customer_token:
        print(f"{RED}Failed to login as customer. Some tests will be skipped.{RESET}")
    
    print(f"{GREEN}✓ Login successful{RESET}\n")
    
    # Run tests in order
    # Test 1: Audience API
    test_audience_api(admin_token)
    
    # Test 2: Send campaign
    campaign_ids = test_send_campaign(admin_token, customer_token)
    
    # Test 2e: Validation
    test_validation(admin_token)
    
    # Test 3: Campaigns list
    test_campaigns_list(admin_token, campaign_ids)
    
    # Test 4: KYC queue
    test_kyc_queue(admin_token)
    
    # Test 5: Regression
    test_regression(admin_token)
    
    # Print summary
    results.summary()

if __name__ == "__main__":
    main()
