#!/usr/bin/env python3
"""
AzoApp Partner Registration & KYC Backend Testing
Tests the complete partner registration flow, admin KYC management, and notifications
"""

import requests
import json
import sys
import io

# Base URL from frontend/.env
BASE_URL = "https://invoice-sync-mobile-1.preview.emergentagent.com/api"

# Test credentials
ADMIN_PHONE = "+919000000000"
CUSTOMER_PHONE = "+919000000004"
DEMO_OTP = "123456"

# Valid Aadhaar for Verhoeff checksum (from review request)
VALID_AADHAAR = "566226937305"
INVALID_AADHAAR = "123456789012"

# Color codes
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RESET = "\033[0m"

def log(msg, color=RESET):
    print(f"{color}{msg}{RESET}")

def auth_login(phone, otp=DEMO_OTP):
    """Login and return token"""
    log(f"\n🔐 Logging in as {phone}...", BLUE)
    
    # Send OTP
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
    if resp.status_code != 200:
        log(f"❌ Send OTP failed: {resp.status_code} {resp.text}", RED)
        return None
    
    # Verify OTP
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": otp})
    if resp.status_code != 200:
        log(f"❌ Verify OTP failed: {resp.status_code} {resp.text}", RED)
        return None
    
    data = resp.json()
    token = data.get("token")
    user = data.get("user", {})
    log(f"✅ Logged in as {user.get('name')} (role: {user.get('role')})", GREEN)
    return token

def create_partner(phone, name):
    """Create a fresh partner account"""
    log(f"\n📝 Creating partner account: {phone}", BLUE)
    
    resp = requests.post(f"{BASE_URL}/auth/register-provider", json={
        "phone": phone,
        "name": name,
        "role": "partner"
    })
    
    if resp.status_code != 200:
        log(f"❌ Register provider failed: {resp.status_code} {resp.text}", RED)
        return None, None
    
    data = resp.json()
    dev_otp = data.get("dev_otp", DEMO_OTP)
    log(f"✅ Partner registered, dev_otp: {dev_otp}", GREEN)
    
    # Verify OTP
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": dev_otp})
    if resp.status_code != 200:
        log(f"❌ Verify OTP failed: {resp.status_code} {resp.text}", RED)
        return None, None
    
    data = resp.json()
    token = data.get("token")
    user = data.get("user", {})
    log(f"✅ Partner logged in: {user.get('name')} (ID: {user.get('id')})", GREEN)
    
    return token, user.get("id")

def test_meta_endpoint(partner_token):
    """Test 1: GET /api/partner/registration/meta"""
    log("\n" + "="*80, BLUE)
    log("TEST 1: GET /api/partner/registration/meta", BLUE)
    log("="*80, BLUE)
    
    headers = {"Authorization": f"Bearer {partner_token}"}
    resp = requests.get(f"{BASE_URL}/partner/registration/meta", headers=headers)
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Expected 200, got {resp.status_code}", RED)
        log(f"Response: {resp.text}", RED)
        return False, None
    
    data = resp.json()
    educations = data.get("educations", [])
    experiences = data.get("experiences", [])
    categories = data.get("categories", [])
    
    log(f"✅ Educations: {len(educations)} (expected 7)", GREEN if len(educations) == 7 else YELLOW)
    log(f"✅ Experiences: {len(experiences)} (expected 8)", GREEN if len(experiences) == 8 else YELLOW)
    log(f"✅ Categories: {len(categories)} (expected >=6)", GREEN if len(categories) >= 6 else YELLOW)
    
    success = len(educations) == 7 and len(experiences) == 8 and len(categories) >= 6
    return success, data

def test_profile_initial(partner_token):
    """Test 2: GET /api/partner/registration/profile (initial state)"""
    log("\n" + "="*80, BLUE)
    log("TEST 2: GET /api/partner/registration/profile (initial)", BLUE)
    log("="*80, BLUE)
    
    headers = {"Authorization": f"Bearer {partner_token}"}
    resp = requests.get(f"{BASE_URL}/partner/registration/profile", headers=headers)
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Expected 200, got {resp.status_code}", RED)
        log(f"Response: {resp.text}", RED)
        return False, None
    
    data = resp.json()
    profile = data.get("profile", {})
    score = data.get("score", {})
    status = profile.get("status")
    overall_score = score.get("overall", 0)
    
    log(f"Status: {status} (expected 'incomplete')", GREEN if status == "incomplete" else YELLOW)
    log(f"Overall score: {overall_score} (expected 0)", GREEN if overall_score == 0 else YELLOW)
    
    success = status == "incomplete" and overall_score == 0
    return success, profile.get("id")

def test_geo_cascade(partner_token):
    """Test 3: Geo cascade endpoints"""
    log("\n" + "="*80, BLUE)
    log("TEST 3: GEO CASCADE (states, districts, cities, villages)", BLUE)
    log("="*80, BLUE)
    
    headers = {"Authorization": f"Bearer {partner_token}"}
    
    # Step 1: States
    log("\n📋 Step 1: GET /geo/states?q=bih", YELLOW)
    resp = requests.get(f"{BASE_URL}/partner/registration/geo/states?q=bih", headers=headers)
    if resp.status_code != 200:
        log(f"❌ FAIL: States returned {resp.status_code}", RED)
        return False
    
    states = resp.json()
    # States are objects with {id, name}, not strings
    bihar = next((s for s in states if "bihar" in s.get("name", "").lower()), None)
    if not bihar:
        log(f"❌ FAIL: Bihar not found in states", RED)
        return False
    log(f"✅ Found state: {bihar.get('name')}", GREEN)
    
    # Step 2: Districts
    log("\n📋 Step 2: GET /geo/districts?state=Bihar&q=pat", YELLOW)
    resp = requests.get(f"{BASE_URL}/partner/registration/geo/districts?state=Bihar&q=pat", headers=headers)
    if resp.status_code != 200:
        log(f"❌ FAIL: Districts returned {resp.status_code}", RED)
        return False
    
    districts = resp.json()
    patna = next((d for d in districts if "patna" in d.get("name", "").lower()), None)
    if not patna:
        log(f"❌ FAIL: Patna not found in districts", RED)
        return False
    log(f"✅ Found district: {patna.get('name')}", GREEN)
    
    # Step 3: Cities
    log("\n📋 Step 3: GET /geo/cities?state=Bihar&district=Patna", YELLOW)
    resp = requests.get(f"{BASE_URL}/partner/registration/geo/cities?state=Bihar&district=Patna", headers=headers)
    if resp.status_code != 200:
        log(f"❌ FAIL: Cities returned {resp.status_code}", RED)
        return False
    
    cities = resp.json()
    if not cities:
        log(f"❌ FAIL: No cities found", RED)
        return False
    city = cities[0].get("name")
    log(f"✅ Found {len(cities)} cities, first: {city}", GREEN)
    
    # Step 4: Villages
    log(f"\n📋 Step 4: GET /geo/villages?state=Bihar&district=Patna&city={city}", YELLOW)
    resp = requests.get(f"{BASE_URL}/partner/registration/geo/villages?state=Bihar&district=Patna&city={city}", headers=headers)
    if resp.status_code != 200:
        log(f"❌ FAIL: Villages returned {resp.status_code}", RED)
        return False
    
    villages = resp.json()
    log(f"✅ Found {len(villages)} villages", GREEN)
    
    return True

def test_profile_completion(partner_token, meta):
    """Test 4-8: Complete profile sections"""
    log("\n" + "="*80, BLUE)
    log("TEST 4-8: PROFILE COMPLETION (basic, work, documents, address)", BLUE)
    log("="*80, BLUE)
    
    headers = {"Authorization": f"Bearer {partner_token}"}
    
    # Get IDs from meta
    education_id = meta.get("educations", [{}])[0].get("id")
    experience_id = meta.get("experiences", [{}])[0].get("id")
    category_id = meta.get("categories", [{}])[0].get("id")
    
    # Step 1: PUT /basic
    log("\n📋 Step 1: PUT /api/partner/registration/basic", YELLOW)
    basic_data = {
        "full_name": "Raj Kumar Test",
        "dob": "1990-01-15",
        "education_id": education_id,
        "state": "Bihar",
        "district": "Patna",
        "city": "Patna",
        "pincode": "800001"
    }
    resp = requests.put(f"{BASE_URL}/partner/registration/basic", headers=headers, json=basic_data)
    if resp.status_code != 200:
        log(f"❌ FAIL: PUT /basic returned {resp.status_code}", RED)
        log(f"Response: {resp.text}", RED)
        return False
    
    data = resp.json()
    score = data.get("score", {})
    basic_score = score.get("sections", {}).get("basic", 0)
    log(f"✅ Basic section score: {basic_score} (expected 100)", GREEN if basic_score == 100 else YELLOW)
    
    # Step 2: PUT /work
    log("\n📋 Step 2: PUT /api/partner/registration/work", YELLOW)
    work_data = {
        "categories": [
            {
                "category_id": category_id,
                "experience_id": experience_id
            }
        ]
    }
    resp = requests.put(f"{BASE_URL}/partner/registration/work", headers=headers, json=work_data)
    if resp.status_code != 200:
        log(f"❌ FAIL: PUT /work returned {resp.status_code}", RED)
        log(f"Response: {resp.text}", RED)
        return False
    
    data = resp.json()
    score = data.get("score", {})
    work_score = score.get("sections", {}).get("work", 0)
    log(f"✅ Work section score: {work_score} (expected 100)", GREEN if work_score == 100 else YELLOW)
    
    # Step 3: PUT /documents (with valid Aadhaar)
    log("\n📋 Step 3: PUT /api/partner/registration/documents", YELLOW)
    docs_data = {
        "aadhaar_number": VALID_AADHAAR,
        "aadhaar_front_url": "https://example.com/aadhaar_front.jpg",
        "aadhaar_back_url": "https://example.com/aadhaar_back.jpg",
        "education_certificate_url": "https://example.com/cert.jpg"
    }
    resp = requests.put(f"{BASE_URL}/partner/registration/documents", headers=headers, json=docs_data)
    if resp.status_code != 200:
        log(f"❌ FAIL: PUT /documents returned {resp.status_code}", RED)
        log(f"Response: {resp.text}", RED)
        return False
    
    data = resp.json()
    score = data.get("score", {})
    docs_score = score.get("sections", {}).get("documents", 0)
    log(f"✅ Documents section score: {docs_score} (expected 100)", GREEN if docs_score == 100 else YELLOW)
    
    # Step 4: PUT /address
    log("\n📋 Step 4: PUT /api/partner/registration/address", YELLOW)
    address_data = {
        "manual_address": "123 Test Street, Patna",
        "lat": 25.5941,
        "lng": 85.1376,
        "location_address": "Patna, Bihar"
    }
    resp = requests.put(f"{BASE_URL}/partner/registration/address", headers=headers, json=address_data)
    if resp.status_code != 200:
        log(f"❌ FAIL: PUT /address returned {resp.status_code}", RED)
        log(f"Response: {resp.text}", RED)
        return False
    
    data = resp.json()
    score = data.get("score", {})
    address_score = score.get("sections", {}).get("address", 0)
    overall_score = score.get("score", 0)  # Changed from "overall" to "score"
    log(f"✅ Address section score: {address_score} (expected 100)", GREEN if address_score == 100 else YELLOW)
    log(f"✅ Overall score: {overall_score} (expected 100)", GREEN if overall_score == 100 else YELLOW)
    
    return overall_score == 100

def test_upload_ocr(partner_token):
    """Test 5: POST /api/partner/registration/upload with OCR"""
    log("\n" + "="*80, BLUE)
    log("TEST 5: POST /api/partner/registration/upload (multipart with OCR)", BLUE)
    log("="*80, BLUE)
    
    headers = {"Authorization": f"Bearer {partner_token}"}
    
    # Create a dummy image file
    dummy_image = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
    
    files = {
        'file': ('aadhaar.png', io.BytesIO(dummy_image), 'image/png')
    }
    data = {
        'doc_type': 'aadhaar_front',
        'aadhaar_number': VALID_AADHAAR
    }
    
    resp = requests.post(f"{BASE_URL}/partner/registration/upload", headers=headers, files=files, data=data)
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Upload returned {resp.status_code}", RED)
        log(f"Response: {resp.text}", RED)
        return False
    
    result = resp.json()
    url = result.get("url")
    ocr = result.get("ocr", {})
    
    log(f"✅ Upload successful, URL: {url}", GREEN)
    log(f"OCR result: {json.dumps(ocr, indent=2)}", RESET)
    
    # OCR should have extracted and matched fields
    if ocr:
        log(f"✅ OCR executed (extracted: {ocr.get('extracted', 'N/A')}, matched: {ocr.get('matched', 'N/A')})", GREEN)
    
    return True

def test_submit_success(partner_token):
    """Test 6: POST /api/partner/registration/submit (success)"""
    log("\n" + "="*80, BLUE)
    log("TEST 6: POST /api/partner/registration/submit (success)", BLUE)
    log("="*80, BLUE)
    
    headers = {"Authorization": f"Bearer {partner_token}"}
    resp = requests.post(f"{BASE_URL}/partner/registration/submit", headers=headers)
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Submit returned {resp.status_code}", RED)
        log(f"Response: {resp.text}", RED)
        return False
    
    data = resp.json()
    status = data.get("status")
    version = data.get("version")
    
    log(f"✅ Status: {status} (expected 'under_review')", GREEN if status == "under_review" else YELLOW)
    log(f"✅ Version: {version} (expected 1)", GREEN if version == 1 else YELLOW)
    
    return status == "under_review" and version == 1

def test_negative_incomplete_submit(partner_token):
    """Test 7: Negative - submit with incomplete profile"""
    log("\n" + "="*80, BLUE)
    log("TEST 7: NEGATIVE - Submit with incomplete profile", BLUE)
    log("="*80, BLUE)
    
    # Create a new partner with incomplete profile
    phone = "+919000000093"
    token, _ = create_partner(phone, "Incomplete Test")
    if not token:
        return False
    
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.post(f"{BASE_URL}/partner/registration/submit", headers=headers)
    
    if resp.status_code != 400:
        log(f"❌ FAIL: Expected 400, got {resp.status_code}", RED)
        log(f"Response: {resp.text}", RED)
        return False
    
    log(f"✅ Correctly rejected incomplete profile with 400", GREEN)
    log(f"Response: {resp.json()}", RESET)
    return True

def test_negative_invalid_aadhaar(partner_token, meta):
    """Test 7b: Negative - invalid Aadhaar (Verhoeff check)"""
    log("\n" + "="*80, BLUE)
    log("TEST 7b: NEGATIVE - Invalid Aadhaar (Verhoeff)", BLUE)
    log("="*80, BLUE)
    
    # Create a new partner
    phone = "+919000000094"
    token, _ = create_partner(phone, "Invalid Aadhaar Test")
    if not token:
        return False
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Complete all sections with INVALID Aadhaar
    education_id = meta.get("educations", [{}])[0].get("id")
    experience_id = meta.get("experiences", [{}])[0].get("id")
    category_id = meta.get("categories", [{}])[0].get("id")
    
    # Basic
    requests.put(f"{BASE_URL}/partner/registration/basic", headers=headers, json={
        "full_name": "Test Invalid",
        "dob": "1990-01-15",
        "education_id": education_id,
        "state": "Bihar",
        "district": "Patna",
        "city": "Patna",
        "pincode": "800001"
    })
    
    # Work
    requests.put(f"{BASE_URL}/partner/registration/work", headers=headers, json={
        "categories": [{"category_id": category_id, "experience_id": experience_id}]
    })
    
    # Documents with INVALID Aadhaar
    log(f"\n📋 Using invalid Aadhaar: {INVALID_AADHAAR}", YELLOW)
    requests.put(f"{BASE_URL}/partner/registration/documents", headers=headers, json={
        "aadhaar_number": INVALID_AADHAAR,
        "aadhaar_front_url": "https://example.com/aadhaar_front.jpg",
        "aadhaar_back_url": "https://example.com/aadhaar_back.jpg",
        "education_certificate_url": "https://example.com/cert.jpg"
    })
    
    # Address
    requests.put(f"{BASE_URL}/partner/registration/address", headers=headers, json={
        "manual_address": "123 Test Street",
        "lat": 25.5941,
        "lng": 85.1376,
        "location_address": "Patna"
    })
    
    # Try to submit
    resp = requests.post(f"{BASE_URL}/partner/registration/submit", headers=headers)
    
    if resp.status_code != 400:
        log(f"❌ FAIL: Expected 400 for invalid Aadhaar, got {resp.status_code}", RED)
        log(f"Response: {resp.text}", RED)
        return False
    
    response_text = resp.text.lower()
    if "aadhaar" not in response_text and "valid" not in response_text:
        log(f"⚠️  WARNING: Error message doesn't mention Aadhaar validation", YELLOW)
    
    log(f"✅ Correctly rejected invalid Aadhaar with 400", GREEN)
    log(f"Response: {resp.json()}", RESET)
    return True

def test_role_guards(partner_token):
    """Test 8: Role guards - customer and admin cannot access partner endpoints"""
    log("\n" + "="*80, BLUE)
    log("TEST 8: ROLE GUARDS (customer & admin → 403)", BLUE)
    log("="*80, BLUE)
    
    # Test with customer token
    log("\n📋 Testing customer access...", YELLOW)
    customer_token = auth_login(CUSTOMER_PHONE)
    if not customer_token:
        return False
    
    customer_headers = {"Authorization": f"Bearer {customer_token}"}
    resp = requests.get(f"{BASE_URL}/partner/registration/profile", headers=customer_headers)
    
    if resp.status_code != 403:
        log(f"❌ FAIL: Customer expected 403, got {resp.status_code}", RED)
        return False
    log(f"✅ Customer correctly blocked with 403", GREEN)
    
    # Test with admin token
    log("\n📋 Testing admin access...", YELLOW)
    admin_token = auth_login(ADMIN_PHONE)
    if not admin_token:
        return False
    
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.get(f"{BASE_URL}/partner/registration/profile", headers=admin_headers)
    
    if resp.status_code != 403:
        log(f"❌ FAIL: Admin expected 403, got {resp.status_code}", RED)
        return False
    log(f"✅ Admin correctly blocked with 403", GREEN)
    
    return True

def test_admin_kyc_workflow(admin_token, profile_id):
    """Test 9: Admin KYC management"""
    log("\n" + "="*80, BLUE)
    log("TEST 9: ADMIN KYC MANAGEMENT", BLUE)
    log("="*80, BLUE)
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Step 1: GET /api/admin/partner-reg/kyc?status=pending
    log("\n📋 Step 1: GET /api/admin/partner-reg/kyc?status=pending", YELLOW)
    resp = requests.get(f"{BASE_URL}/admin/partner-reg/kyc?status=pending", headers=headers)
    
    if resp.status_code != 200:
        log(f"❌ FAIL: List KYC returned {resp.status_code}", RED)
        return False
    
    profiles = resp.json()
    found = any(p.get("id") == profile_id for p in profiles)
    log(f"✅ Found {len(profiles)} pending profiles, target profile present: {found}", GREEN if found else YELLOW)
    
    # Step 2: GET /api/admin/partner-reg/kyc/{profile_id}
    log(f"\n📋 Step 2: GET /api/admin/partner-reg/kyc/{profile_id}", YELLOW)
    resp = requests.get(f"{BASE_URL}/admin/partner-reg/kyc/{profile_id}", headers=headers)
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Get KYC detail returned {resp.status_code}", RED)
        return False
    
    detail = resp.json()
    has_basic = "basic" in detail
    has_work = "work" in detail
    has_documents = "documents" in detail
    has_address = "address" in detail
    has_user = "user" in detail
    
    log(f"✅ KYC detail has basic: {has_basic}, work: {has_work}, documents: {has_documents}, address: {has_address}, user: {has_user}", 
        GREEN if all([has_basic, has_work, has_documents, has_address, has_user]) else YELLOW)
    
    # Step 3: POST reject without reason (should fail)
    log(f"\n📋 Step 3: POST /api/admin/partner-reg/kyc/{profile_id}/reject (no reason)", YELLOW)
    resp = requests.post(f"{BASE_URL}/admin/partner-reg/kyc/{profile_id}/reject", headers=headers, json={})
    
    if resp.status_code != 400:
        log(f"❌ FAIL: Expected 400 for empty reason, got {resp.status_code}", RED)
        return False
    log(f"✅ Correctly rejected empty reason with 400", GREEN)
    
    # Step 4: POST reject with reason
    log(f"\n📋 Step 4: POST /api/admin/partner-reg/kyc/{profile_id}/reject (with reason)", YELLOW)
    resp = requests.post(f"{BASE_URL}/admin/partner-reg/kyc/{profile_id}/reject", headers=headers, json={
        "reason": "Documents are not clear, please resubmit"
    })
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Reject returned {resp.status_code}", RED)
        log(f"Response: {resp.text}", RED)
        return False
    log(f"✅ Rejection successful", GREEN)
    
    return True

def test_partner_rejection_flow(partner_token):
    """Test 9b: Partner sees rejection and can resubmit"""
    log("\n" + "="*80, BLUE)
    log("TEST 9b: PARTNER REJECTION FLOW", BLUE)
    log("="*80, BLUE)
    
    headers = {"Authorization": f"Bearer {partner_token}"}
    
    # Check profile status
    log("\n📋 Step 1: GET /api/partner/registration/profile (check rejection)", YELLOW)
    resp = requests.get(f"{BASE_URL}/partner/registration/profile", headers=headers)
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Get profile returned {resp.status_code}", RED)
        return False
    
    data = resp.json()
    profile = data.get("profile", {})
    status = profile.get("status")
    rejection_reason = data.get("rejection_reason", "")
    
    log(f"Status: {status} (expected 'rejected')", GREEN if status == "rejected" else YELLOW)
    log(f"Rejection reason: {rejection_reason}", RESET)
    
    if status != "rejected":
        log(f"❌ FAIL: Status is not 'rejected'", RED)
        return False
    
    # Resubmit
    log("\n📋 Step 2: POST /api/partner/registration/submit (resubmit)", YELLOW)
    resp = requests.post(f"{BASE_URL}/partner/registration/submit", headers=headers)
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Resubmit returned {resp.status_code}", RED)
        log(f"Response: {resp.text}", RED)
        return False
    
    data = resp.json()
    status = data.get("status")
    version = data.get("version")
    
    log(f"✅ Status: {status} (expected 'under_review')", GREEN if status == "under_review" else YELLOW)
    log(f"✅ Version: {version} (expected 2)", GREEN if version == 2 else YELLOW)
    
    return status == "under_review" and version == 2

def test_admin_approve(admin_token, profile_id, partner_phone):
    """Test 9c: Admin approves KYC"""
    log("\n" + "="*80, BLUE)
    log("TEST 9c: ADMIN APPROVE KYC", BLUE)
    log("="*80, BLUE)
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Approve
    log(f"\n📋 Step 1: POST /api/admin/partner-reg/kyc/{profile_id}/approve", YELLOW)
    resp = requests.post(f"{BASE_URL}/admin/partner-reg/kyc/{profile_id}/approve", headers=headers)
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Approve returned {resp.status_code}", RED)
        log(f"Response: {resp.text}", RED)
        return False
    log(f"✅ Approval successful", GREEN)
    
    # Verify partner status - need to get fresh OTP
    log(f"\n📋 Step 2: Partner GET /api/auth/me (verify kyc_status)", YELLOW)
    log(f"Getting fresh OTP for {partner_phone}...", BLUE)
    
    # Send new OTP
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": partner_phone})
    if resp.status_code != 200:
        log(f"❌ Send OTP failed: {resp.status_code}", RED)
        return False
    
    otp_data = resp.json()
    dev_otp = otp_data.get("dev_otp", DEMO_OTP)
    
    # Verify with fresh OTP
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": partner_phone, "otp": dev_otp})
    if resp.status_code != 200:
        log(f"❌ Verify OTP failed: {resp.status_code} {resp.text}", RED)
        return False
    
    data = resp.json()
    partner_token = data.get("token")
    
    partner_headers = {"Authorization": f"Bearer {partner_token}"}
    resp = requests.get(f"{BASE_URL}/auth/me", headers=partner_headers)
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Get /auth/me returned {resp.status_code}", RED)
        return False
    
    user = resp.json()
    kyc_status = user.get("kyc_status")
    verified_partner = user.get("verified_partner")
    
    log(f"✅ kyc_status: {kyc_status} (expected 'approved')", GREEN if kyc_status == "approved" else YELLOW)
    log(f"✅ verified_partner: {verified_partner} (expected True)", GREEN if verified_partner else YELLOW)
    
    return kyc_status == "approved" and verified_partner

def test_masters_crud(admin_token, meta):
    """Test 10: Education and Experience masters CRUD"""
    log("\n" + "="*80, BLUE)
    log("TEST 10: MASTERS CRUD (educations & experiences)", BLUE)
    log("="*80, BLUE)
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test Education CRUD
    log("\n📋 Testing Education CRUD...", YELLOW)
    
    # GET
    resp = requests.get(f"{BASE_URL}/admin/partner-reg/educations", headers=headers)
    if resp.status_code != 200:
        log(f"❌ FAIL: GET educations returned {resp.status_code}", RED)
        return False
    educations = resp.json()
    log(f"✅ GET educations: {len(educations)} items", GREEN)
    
    # POST
    resp = requests.post(f"{BASE_URL}/admin/partner-reg/educations", headers=headers, json={
        "name": "Test Degree",
        "order": 99
    })
    if resp.status_code != 200:
        log(f"❌ FAIL: POST education returned {resp.status_code}", RED)
        return False
    new_edu = resp.json()
    new_edu_id = new_edu.get("id")
    log(f"✅ POST education: created ID {new_edu_id}", GREEN)
    
    # PUT
    resp = requests.put(f"{BASE_URL}/admin/partner-reg/educations/{new_edu_id}", headers=headers, json={
        "name": "Test Degree Updated",
        "order": 100
    })
    if resp.status_code != 200:
        log(f"❌ FAIL: PUT education returned {resp.status_code}", RED)
        return False
    log(f"✅ PUT education: updated", GREEN)
    
    # Verify it appears in partner meta
    log("\n📋 Verifying new education appears in partner /meta...", YELLOW)
    partner_token = auth_login("+919000000092")  # Use the main test partner
    if partner_token:
        partner_headers = {"Authorization": f"Bearer {partner_token}"}
        resp = requests.get(f"{BASE_URL}/partner/registration/meta", headers=partner_headers)
        if resp.status_code == 200:
            meta_data = resp.json()
            educations = meta_data.get("educations", [])
            found = any(e.get("id") == new_edu_id for e in educations)
            log(f"✅ New education appears in partner /meta: {found}", GREEN if found else YELLOW)
    
    # DELETE
    resp = requests.delete(f"{BASE_URL}/admin/partner-reg/educations/{new_edu_id}", headers=headers)
    if resp.status_code != 200:
        log(f"❌ FAIL: DELETE education returned {resp.status_code}", RED)
        return False
    log(f"✅ DELETE education: removed", GREEN)
    
    # Test Experience CRUD (abbreviated)
    log("\n📋 Testing Experience CRUD...", YELLOW)
    
    resp = requests.get(f"{BASE_URL}/admin/partner-reg/experiences", headers=headers)
    if resp.status_code != 200:
        log(f"❌ FAIL: GET experiences returned {resp.status_code}", RED)
        return False
    log(f"✅ GET experiences: {len(resp.json())} items", GREEN)
    
    resp = requests.post(f"{BASE_URL}/admin/partner-reg/experiences", headers=headers, json={
        "name": "Test Experience",
        "order": 99
    })
    if resp.status_code != 200:
        log(f"❌ FAIL: POST experience returned {resp.status_code}", RED)
        return False
    new_exp = resp.json()
    new_exp_id = new_exp.get("id")
    log(f"✅ POST experience: created ID {new_exp_id}", GREEN)
    
    resp = requests.delete(f"{BASE_URL}/admin/partner-reg/experiences/{new_exp_id}", headers=headers)
    if resp.status_code != 200:
        log(f"❌ FAIL: DELETE experience returned {resp.status_code}", RED)
        return False
    log(f"✅ DELETE experience: removed", GREEN)
    
    return True

def test_admin_role_guards():
    """Test 11: Admin endpoints block partner/customer"""
    log("\n" + "="*80, BLUE)
    log("TEST 11: ADMIN ROLE GUARDS (partner/customer → 403)", BLUE)
    log("="*80, BLUE)
    
    # Test with partner token - get fresh OTP
    log("\n📋 Testing partner access to admin endpoints...", YELLOW)
    partner_phone = "+919000000092"
    
    # Send new OTP
    resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": partner_phone})
    if resp.status_code != 200:
        log(f"❌ Send OTP failed: {resp.status_code}", RED)
        return False
    
    otp_data = resp.json()
    dev_otp = otp_data.get("dev_otp", DEMO_OTP)
    
    # Verify with fresh OTP
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": partner_phone, "otp": dev_otp})
    if resp.status_code != 200:
        log(f"❌ Verify OTP failed: {resp.status_code}", RED)
        return False
    
    data = resp.json()
    partner_token = data.get("token")
    
    partner_headers = {"Authorization": f"Bearer {partner_token}"}
    resp = requests.get(f"{BASE_URL}/admin/partner-reg/kyc", headers=partner_headers)
    
    if resp.status_code != 403:
        log(f"❌ FAIL: Partner expected 403, got {resp.status_code}", RED)
        return False
    log(f"✅ Partner correctly blocked with 403", GREEN)
    
    # Test with customer token
    log("\n📋 Testing customer access to admin endpoints...", YELLOW)
    customer_token = auth_login(CUSTOMER_PHONE)
    if not customer_token:
        return False
    
    customer_headers = {"Authorization": f"Bearer {customer_token}"}
    resp = requests.get(f"{BASE_URL}/admin/partner-reg/kyc", headers=customer_headers)
    
    if resp.status_code != 403:
        log(f"❌ FAIL: Customer expected 403, got {resp.status_code}", RED)
        return False
    log(f"✅ Customer correctly blocked with 403", GREEN)
    
    return True

def test_notifications_config():
    """Test 12: GET /api/notifications/push-config"""
    log("\n" + "="*80, BLUE)
    log("TEST 12: GET /api/notifications/push-config", BLUE)
    log("="*80, BLUE)
    
    resp = requests.get(f"{BASE_URL}/notifications/push-config")
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Expected 200, got {resp.status_code}", RED)
        log(f"Response: {resp.text}", RED)
        return False
    
    data = resp.json()
    enabled = data.get("enabled")
    has_web_config = "web_config" in data
    has_vapid_key = "vapid_key" in data
    
    log(f"✅ enabled: {enabled} (expected False)", GREEN if enabled == False else YELLOW)
    log(f"✅ has web_config: {has_web_config}", GREEN if has_web_config else YELLOW)
    log(f"✅ has vapid_key: {has_vapid_key}", GREEN if has_vapid_key else YELLOW)
    
    return enabled == False and has_web_config and has_vapid_key

def main():
    log("\n" + "="*80, BLUE)
    log("🚀 AZOAPP PARTNER REGISTRATION & KYC BACKEND TESTING", BLUE)
    log("="*80, BLUE)
    log(f"Base URL: {BASE_URL}", RESET)
    
    results = {}
    
    # Create fresh partner for testing - use unique phone each time
    import time
    partner_phone = f"+9190000000{int(time.time()) % 100:02d}"
    partner_token, partner_user_id = create_partner(partner_phone, "KYC Test Partner")
    if not partner_token:
        log("❌ Failed to create partner, aborting tests", RED)
        return 1
    
    # Get admin token
    admin_token = auth_login(ADMIN_PHONE)
    if not admin_token:
        log("❌ Failed to login as admin, aborting tests", RED)
        return 1
    
    # Store meta for later tests
    meta = None
    profile_id = None
    
    # Run all tests
    try:
        success, meta = test_meta_endpoint(partner_token)
        results["Test 1: GET /meta (educations=7, experiences=8, categories>=6)"] = success
    except Exception as e:
        log(f"❌ Test 1 crashed: {e}", RED)
        results["Test 1: GET /meta"] = False
    
    try:
        success, profile_id = test_profile_initial(partner_token)
        results["Test 2: GET /profile (initial status=incomplete, score=0)"] = success
    except Exception as e:
        log(f"❌ Test 2 crashed: {e}", RED)
        results["Test 2: GET /profile"] = False
    
    try:
        results["Test 3: Geo cascade (states/districts/cities/villages)"] = test_geo_cascade(partner_token)
    except Exception as e:
        log(f"❌ Test 3 crashed: {e}", RED)
        results["Test 3: Geo cascade"] = False
    
    if meta:
        try:
            results["Test 4: Profile completion (basic/work/documents/address → 100%)"] = test_profile_completion(partner_token, meta)
        except Exception as e:
            log(f"❌ Test 4 crashed: {e}", RED)
            results["Test 4: Profile completion"] = False
    
    try:
        results["Test 5: POST /upload (multipart with OCR)"] = test_upload_ocr(partner_token)
    except Exception as e:
        log(f"❌ Test 5 crashed: {e}", RED)
        results["Test 5: POST /upload"] = False
    
    try:
        results["Test 6: POST /submit → status=under_review, version=1"] = test_submit_success(partner_token)
    except Exception as e:
        log(f"❌ Test 6 crashed: {e}", RED)
        results["Test 6: POST /submit"] = False
    
    try:
        results["Test 7a: NEGATIVE - incomplete profile → 400"] = test_negative_incomplete_submit(partner_token)
    except Exception as e:
        log(f"❌ Test 7a crashed: {e}", RED)
        results["Test 7a: NEGATIVE - incomplete"] = False
    
    if meta:
        try:
            results["Test 7b: NEGATIVE - invalid Aadhaar → 400"] = test_negative_invalid_aadhaar(partner_token, meta)
        except Exception as e:
            log(f"❌ Test 7b crashed: {e}", RED)
            results["Test 7b: NEGATIVE - invalid Aadhaar"] = False
    
    try:
        results["Test 8: Role guards (customer/admin → 403 on partner endpoints)"] = test_role_guards(partner_token)
    except Exception as e:
        log(f"❌ Test 8 crashed: {e}", RED)
        results["Test 8: Role guards"] = False
    
    if profile_id:
        try:
            results["Test 9a: Admin KYC list/detail/reject"] = test_admin_kyc_workflow(admin_token, profile_id)
        except Exception as e:
            log(f"❌ Test 9a crashed: {e}", RED)
            results["Test 9a: Admin KYC"] = False
        
        try:
            results["Test 9b: Partner sees rejection & resubmits (version=2)"] = test_partner_rejection_flow(partner_token)
        except Exception as e:
            log(f"❌ Test 9b crashed: {e}", RED)
            results["Test 9b: Partner rejection"] = False
        
        try:
            results["Test 9c: Admin approve → kyc_status=approved, verified_partner=true"] = test_admin_approve(admin_token, profile_id, partner_phone)
        except Exception as e:
            log(f"❌ Test 9c crashed: {e}", RED)
            results["Test 9c: Admin approve"] = False
    
    if meta:
        try:
            results["Test 10: Masters CRUD (educations/experiences)"] = test_masters_crud(admin_token, meta)
        except Exception as e:
            log(f"❌ Test 10 crashed: {e}", RED)
            results["Test 10: Masters CRUD"] = False
    
    try:
        results["Test 11: Admin role guards (partner/customer → 403)"] = test_admin_role_guards()
    except Exception as e:
        log(f"❌ Test 11 crashed: {e}", RED)
        results["Test 11: Admin role guards"] = False
    
    try:
        results["Test 12: GET /notifications/push-config"] = test_notifications_config()
    except Exception as e:
        log(f"❌ Test 12 crashed: {e}", RED)
        results["Test 12: Notifications config"] = False
    
    # Summary
    log("\n" + "="*80, BLUE)
    log("📊 TEST SUMMARY", BLUE)
    log("="*80, BLUE)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = f"{GREEN}✅ PASS{RESET}" if result else f"{RED}❌ FAIL{RESET}"
        log(f"{test_name}: {status}", RESET)
    
    log("\n" + "="*80, BLUE)
    log(f"TOTAL: {passed}/{total} tests passed ({passed*100//total if total > 0 else 0}%)", 
        GREEN if passed == total else (YELLOW if passed > 0 else RED))
    log("="*80, BLUE)
    
    return 0 if passed == total else 1

if __name__ == "__main__":
    sys.exit(main())
