#!/usr/bin/env python3
"""
Backend API Testing for AzoApp Commission, Cancellation, Refund & Referral Logic
Tests commission distribution, cancellation refunds, and referral logic
"""
import requests
import json
import sys
import time
from typing import Dict, List, Any

# Configuration
BASE_URL = "https://azoapp-otp-preview.preview.emergentagent.com/api"
ADMIN_PHONE = "+919000000000"
CUSTOMER_PHONE = "+919000000004"
PARTNER_RAJ_PHONE = "+919000000003"
PARTNER_AMIT_PHONE = "+919000000005"
MERCHANT_PHONE = "+919000000002"
OTP = "123456"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'

def log(msg: str, color: str = Colors.RESET):
    print(f"{color}{msg}{Colors.RESET}")

def log_success(msg: str):
    log(f"✅ {msg}", Colors.GREEN)

def log_error(msg: str):
    log(f"❌ {msg}", Colors.RED)

def log_info(msg: str):
    log(f"ℹ️  {msg}", Colors.BLUE)

def log_warning(msg: str):
    log(f"⚠️  {msg}", Colors.YELLOW)

def login(phone: str, otp: str) -> str:
    """Login and return JWT token"""
    log_info(f"Logging in as {phone}...")
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": otp})
    if resp.status_code != 200:
        log_error(f"Login failed: {resp.status_code} - {resp.text}")
        return None
    data = resp.json()
    token = data.get("token")
    log_success(f"Logged in as {phone}")
    return token

def get_settings(token: str) -> Dict:
    """Get app settings"""
    resp = requests.get(f"{BASE_URL}/admin/settings", headers={"Authorization": f"Bearer {token}"})
    if resp.status_code != 200:
        log_error(f"Failed to fetch settings: {resp.status_code}")
        return None
    return resp.json()

def update_settings(token: str, data: Dict) -> Dict:
    """Update app settings"""
    resp = requests.put(f"{BASE_URL}/admin/settings", 
                       json=data,
                       headers={"Authorization": f"Bearer {token}"})
    return resp

def get_services(token: str) -> List[Dict]:
    """Get active services from catalog"""
    resp = requests.get(f"{BASE_URL}/catalog/services", headers={"Authorization": f"Bearer {token}"})
    if resp.status_code != 200:
        log_error(f"Failed to fetch services: {resp.status_code}")
        return []
    return resp.json()

def create_booking(token: str, service_id: str, schedule_type: str = "schedule") -> Dict:
    """Create a booking"""
    payload = {
        "service_id": service_id,
        "schedule_type": schedule_type,
        "address": {
            "line": "123 Test Street",
            "city": "Patna",
            "state": "Bihar",
            "pincode": "800001",
            "lat": 25.5941,
            "lng": 85.1376
        },
        "addons": [],
        "notes": "Test booking for commission verification"
    }
    if schedule_type == "schedule":
        payload["scheduled_at"] = "2026-12-31T10:00:00Z"
    
    resp = requests.post(f"{BASE_URL}/bookings",
                        json=payload,
                        headers={"Authorization": f"Bearer {token}"})
    if resp.status_code != 200:
        log_error(f"Booking creation failed: {resp.status_code} - {resp.text}")
        return None
    return resp.json()

def mock_payment(token: str, booking_id: str) -> Dict:
    """Mock payment for a booking"""
    payload = {"purpose": "booking", "booking_id": booking_id}
    resp = requests.post(f"{BASE_URL}/payments/mock",
                        json=payload,
                        headers={"Authorization": f"Bearer {token}"})
    if resp.status_code != 200:
        log_error(f"Mock payment failed: {resp.status_code} - {resp.text}")
        return None
    return resp.json()

def get_booking(token: str, booking_id: str) -> Dict:
    """Get booking details"""
    resp = requests.get(f"{BASE_URL}/bookings/{booking_id}",
                       headers={"Authorization": f"Bearer {token}"})
    if resp.status_code != 200:
        return None
    return resp.json()

def get_partner_jobs(token: str) -> List[Dict]:
    """Get partner's available jobs"""
    resp = requests.get(f"{BASE_URL}/bookings/partner/jobs",
                       headers={"Authorization": f"Bearer {token}"})
    if resp.status_code != 200:
        return []
    return resp.json()

def accept_job(token: str, booking_id: str) -> Dict:
    """Partner accepts a job"""
    resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/accept",
                        headers={"Authorization": f"Bearer {token}"})
    if resp.status_code != 200:
        log_error(f"Accept job failed: {resp.status_code} - {resp.text}")
        return None
    return resp.json()

def admin_assign_booking(admin_token: str, booking_id: str, partner_id: str) -> Dict:
    """Admin manually assigns booking to partner"""
    payload = {"partner_id": partner_id}
    resp = requests.post(f"{BASE_URL}/admin/bookings/{booking_id}/assign",
                        json=payload,
                        headers={"Authorization": f"Bearer {admin_token}"})
    if resp.status_code != 200:
        log_error(f"Admin assign failed: {resp.status_code} - {resp.text}")
        return None
    return resp.json()

def get_partner_id(token: str) -> str:
    """Get partner's user ID"""
    profile = get_user_profile(token)
    if profile:
        return profile.get("id")
    return None

def partner_arrived(token: str, booking_id: str) -> Dict:
    """Partner marks arrived"""
    resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/arrived",
                        headers={"Authorization": f"Bearer {token}"})
    if resp.status_code != 200:
        log_error(f"Arrived failed: {resp.status_code} - {resp.text}")
        return None
    return resp.json()

def verify_start_otp(token: str, booking_id: str, otp: str) -> Dict:
    """Partner verifies start OTP"""
    payload = {
        "otp": otp
    }
    resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/start-otp",
                        json=payload,
                        headers={"Authorization": f"Bearer {token}"})
    if resp.status_code != 200:
        log_error(f"Verify start OTP failed: {resp.status_code} - {resp.text}")
        return None
    return resp.json()

def upload_evidence(token: str, booking_id: str, stage: str = "before", images: List[str] = None) -> Dict:
    """Partner uploads evidence"""
    if images is None:
        images = ["https://example.com/evidence.jpg"]
    payload = {
        "stage": stage,
        "images": images,
        "notes": "Test evidence"
    }
    resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/evidence",
                        json=payload,
                        headers={"Authorization": f"Bearer {token}"})
    if resp.status_code != 200:
        log_error(f"Upload evidence failed: {resp.status_code} - {resp.text}")
        return None
    return resp.json()

def complete_job(token: str, booking_id: str, otp: str) -> Dict:
    """Partner completes job"""
    payload = {
        "otp": otp
    }
    resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/complete",
                        json=payload,
                        headers={"Authorization": f"Bearer {token}"})
    if resp.status_code != 200:
        log_error(f"Complete job failed: {resp.status_code} - {resp.text}")
        return None
    return resp.json()

def cancel_booking(token: str, booking_id: str, reason: str = "Test cancellation") -> Dict:
    """Customer cancels booking"""
    payload = {"reason": reason}
    resp = requests.post(f"{BASE_URL}/bookings/{booking_id}/cancel",
                        json=payload,
                        headers={"Authorization": f"Bearer {token}"})
    return resp

def get_user_profile(token: str) -> Dict:
    """Get user profile"""
    resp = requests.get(f"{BASE_URL}/auth/me",
                       headers={"Authorization": f"Bearer {token}"})
    if resp.status_code != 200:
        return None
    return resp.json()

def get_refunds(token: str) -> List[Dict]:
    """Get customer refunds"""
    resp = requests.get(f"{BASE_URL}/payments/refunds",
                       headers={"Authorization": f"Bearer {token}"})
    if resp.status_code != 200:
        return []
    return resp.json()

def get_admin_refunds(token: str) -> List[Dict]:
    """Get all refunds (admin)"""
    resp = requests.get(f"{BASE_URL}/admin/refunds",
                       headers={"Authorization": f"Bearer {token}"})
    if resp.status_code != 200:
        return []
    return resp.json()

def webhook_refund(data: Dict, signature: str = None) -> requests.Response:
    """Send webhook to refund endpoint"""
    headers = {}
    if signature:
        headers["X-Razorpay-Signature"] = signature
    resp = requests.post(f"{BASE_URL}/payments/webhooks/razorpay-refund",
                        json=data,
                        headers=headers)
    return resp

def test_settings_validation(admin_token: str):
    """
    TEST 1: SETTINGS VALIDATION
    - GET /api/admin/settings → confirm commission block exists
    - PUT with invalid commission %s → 400
    - PUT with invalid cancellation split → 400
    - PUT with valid block → 200
    """
    log_info("\n" + "="*80)
    log_info("TEST 1: Settings Validation (Commission Block)")
    log_info("="*80)
    
    # Get current settings
    settings = get_settings(admin_token)
    if not settings:
        log_error("Failed to get settings")
        return False
    
    # Check commission block exists
    commission = settings.get("commission")
    if not commission:
        log_error("Commission block not found in settings")
        return False
    
    required_keys = ["platform_pct", "partner_pct", "merchant_partner_referral_pct", 
                     "merchant_customer_pct", "customer_refund_pct", "partner_cancellation_pct"]
    
    for key in required_keys:
        if key not in commission:
            log_error(f"Missing key in commission: {key}")
            return False
    
    log_success(f"Commission block exists with all required keys")
    log_info(f"  platform_pct: {commission['platform_pct']}")
    log_info(f"  partner_pct: {commission['partner_pct']}")
    log_info(f"  merchant_partner_referral_pct: {commission['merchant_partner_referral_pct']}")
    log_info(f"  merchant_customer_pct: {commission['merchant_customer_pct']}")
    log_info(f"  customer_refund_pct: {commission['customer_refund_pct']}")
    log_info(f"  partner_cancellation_pct: {commission['partner_cancellation_pct']}")
    
    # Save original values for restoration
    original_commission = dict(commission)
    
    # Test 1a: Invalid commission sum (98, not 100)
    log_info("\nTest 1a: Invalid commission sum (98, not 100)")
    invalid_commission = {
        "platform_pct": 30,
        "partner_pct": 60,
        "merchant_partner_referral_pct": 5,
        "merchant_customer_pct": 3,
        "customer_refund_pct": 80,
        "partner_cancellation_pct": 20
    }
    resp = update_settings(admin_token, {"commission": invalid_commission})
    if resp.status_code == 400:
        log_success("✅ Correctly rejected commission sum != 100 (got 98)")
    else:
        log_error(f"❌ Should reject invalid commission sum, got {resp.status_code}")
        return False
    
    # Test 1b: Invalid cancellation split (90, not 100)
    log_info("\nTest 1b: Invalid cancellation split (90, not 100)")
    invalid_cancellation = {
        "platform_pct": 32,
        "partner_pct": 60,
        "merchant_partner_referral_pct": 5,
        "merchant_customer_pct": 3,
        "customer_refund_pct": 70,
        "partner_cancellation_pct": 20
    }
    resp = update_settings(admin_token, {"commission": invalid_cancellation})
    if resp.status_code == 400:
        log_success("✅ Correctly rejected cancellation split != 100 (got 90)")
    else:
        log_error(f"❌ Should reject invalid cancellation split, got {resp.status_code}")
        return False
    
    # Test 1c: Valid commission block
    log_info("\nTest 1c: Valid commission block")
    valid_commission = {
        "platform_pct": 32,
        "partner_pct": 60,
        "merchant_partner_referral_pct": 5,
        "merchant_customer_pct": 3,
        "customer_refund_pct": 80,
        "partner_cancellation_pct": 20
    }
    resp = update_settings(admin_token, {"commission": valid_commission})
    if resp.status_code == 200:
        log_success("✅ Valid commission block accepted")
        # Verify persisted
        settings = get_settings(admin_token)
        if settings and settings.get("commission") == valid_commission:
            log_success("✅ Commission block persisted correctly")
        else:
            log_error("❌ Commission block not persisted correctly")
            return False
    else:
        log_error(f"❌ Valid commission block rejected: {resp.status_code} - {resp.text}")
        return False
    
    # Restore original settings
    log_info("\nRestoring original commission settings...")
    resp = update_settings(admin_token, {"commission": original_commission})
    if resp.status_code == 200:
        log_success("✅ Original settings restored")
    else:
        log_warning(f"⚠️  Failed to restore original settings: {resp.status_code}")
    
    log_success("✅ TEST 1 PASSED: Settings validation working correctly")
    return True

def test_commission_distribution(customer_token: str, partner_token: str, admin_token: str, services: List[Dict]):
    """
    TEST 2: COMMISSION DISTRIBUTION ON COMPLETION
    - Create booking → pay → partner accept → OTP flow → complete
    - Verify commission breakdown
    - Verify sum equals base (100% distributed)
    - Test fallback rule (independent partner → platform absorbs merchant shares)
    """
    log_info("\n" + "="*80)
    log_info("TEST 2: Commission Distribution on Completion")
    log_info("="*80)
    
    if not services:
        log_error("No services available")
        return False
    
    service = services[0]
    log_info(f"Using service: {service['name']} (₹{service['base_price']})")
    
    # Get partner profile to check if independent
    partner_profile = get_user_profile(partner_token)
    if not partner_profile:
        log_error("Failed to get partner profile")
        return False
    
    is_independent = not partner_profile.get("referred_by_merchant")
    log_info(f"Partner is independent: {is_independent}")
    
    # Get partner wallet balance before
    partner_wallet_before = partner_profile.get("wallet_balance", 0)
    log_info(f"Partner wallet before: ₹{partner_wallet_before}")
    
    # Create booking
    log_info("\nStep 1: Creating booking...")
    booking = create_booking(customer_token, service["id"])
    if not booking:
        return False
    log_success(f"Booking created: {booking['code']} (status: {booking['status']})")
    
    # Pay booking
    log_info("\nStep 2: Paying booking...")
    payment = mock_payment(customer_token, booking["id"])
    if not payment:
        return False
    log_success("Payment successful")
    
    # Wait a bit for status update
    time.sleep(1)
    
    # Get updated booking
    booking = get_booking(customer_token, booking["id"])
    if not booking:
        log_error("Failed to get updated booking")
        return False
    log_success(f"Booking status: {booking['status']}")
    
    # Partner accepts job (or admin assigns if not in feed)
    log_info("\nStep 3: Partner accepting job...")
    jobs = get_partner_jobs(partner_token)
    job = next((j for j in jobs if j["id"] == booking["id"]), None) if jobs else None
    
    if job:
        accept_result = accept_job(partner_token, booking["id"])
        if not accept_result:
            return False
        log_success("Job accepted by partner")
    else:
        log_warning("Booking not in partner's job feed, using admin assignment...")
        partner_id = get_partner_id(partner_token)
        if not partner_id:
            log_error("Failed to get partner ID")
            return False
        assign_result = admin_assign_booking(admin_token, booking["id"], partner_id)
        if not assign_result:
            return False
        log_success("Job assigned by admin")
    
    # Get start OTP
    booking = get_booking(customer_token, booking["id"])
    start_otp = booking.get("otps", {}).get("start")
    if not start_otp:
        log_error("Start OTP not found")
        return False
    log_info(f"Start OTP: {start_otp}")
    
    # Upload before evidence
    log_info("\nStep 4a: Uploading before evidence...")
    evidence_result = upload_evidence(partner_token, booking["id"], "before")
    if not evidence_result:
        return False
    log_success("Before evidence uploaded")
    
    # Verify start OTP
    log_info("\nStep 4b: Verifying start OTP...")
    start_result = verify_start_otp(partner_token, booking["id"], start_otp)
    if not start_result:
        return False
    log_success("Job started")
    
    # Get completion OTP
    booking = get_booking(customer_token, booking["id"])
    completion_otp = booking.get("otps", {}).get("completion")
    if not completion_otp:
        log_error("Completion OTP not found")
        return False
    log_info(f"Completion OTP: {completion_otp}")
    
    # Upload after evidence
    log_info("\nStep 5a: Uploading after evidence...")
    evidence_result = upload_evidence(partner_token, booking["id"], "after")
    if not evidence_result:
        return False
    log_success("After evidence uploaded")
    
    # Complete job
    log_info("\nStep 5b: Completing job...")
    complete_result = complete_job(partner_token, booking["id"], completion_otp)
    if not complete_result:
        return False
    log_success("Job completed")
    
    # Get final booking with commission
    booking = get_booking(customer_token, booking["id"])
    if not booking:
        log_error("Failed to get final booking")
        return False
    
    # Verify commission breakdown
    log_info("\nStep 6: Verifying commission breakdown...")
    commission = booking.get("commission")
    if not commission:
        log_error("Commission data not found in booking")
        return False
    
    base = commission.get("base")
    partner_earning = commission.get("partner_earning")
    platform_earning = commission.get("platform_earning")
    merchant_referral = commission.get("merchant_referral", 0)
    merchant_customer = commission.get("merchant_customer", 0)
    
    log_info(f"Commission breakdown:")
    log_info(f"  Base (service cost): ₹{base}")
    log_info(f"  Partner earning: ₹{partner_earning}")
    log_info(f"  Platform earning: ₹{platform_earning}")
    log_info(f"  Merchant referral: ₹{merchant_referral}")
    log_info(f"  Merchant customer: ₹{merchant_customer}")
    
    # Verify base equals commissionable_base (service cost, NOT total)
    pricing = booking.get("pricing", {})
    commissionable_base = pricing.get("commissionable_base")
    total = pricing.get("total")
    
    log_info(f"\nPricing:")
    log_info(f"  Commissionable base: ₹{commissionable_base}")
    log_info(f"  Total: ₹{total}")
    
    if abs(base - commissionable_base) < 0.01:
        log_success(f"✅ Base equals commissionable_base (service cost, NOT total)")
    else:
        log_error(f"❌ Base (₹{base}) != commissionable_base (₹{commissionable_base})")
        return False
    
    # Verify sum equals base (100% distributed)
    total_distributed = partner_earning + platform_earning + merchant_referral + merchant_customer
    log_info(f"\nTotal distributed: ₹{total_distributed}")
    log_info(f"Expected (base): ₹{base}")
    
    if abs(total_distributed - base) < 0.01:
        log_success(f"✅ 100% distributed (sum equals base)")
    else:
        log_error(f"❌ Distribution mismatch: ₹{total_distributed} != ₹{base}")
        return False
    
    # Verify fallback rule for independent partner
    if is_independent:
        if merchant_referral == 0 and merchant_customer == 0:
            log_success(f"✅ Independent partner: merchant shares are 0")
            # Platform should have absorbed the merchant shares
            settings = get_settings(admin_token)
            cm = settings.get("commission", {})
            partner_pct = cm.get("partner_pct", 60)
            expected_partner = round(base * partner_pct / 100, 2)
            expected_platform = round(base - expected_partner, 2)
            
            log_info(f"Expected partner earning: ₹{expected_partner}")
            log_info(f"Expected platform earning: ₹{expected_platform}")
            
            if abs(partner_earning - expected_partner) < 0.01:
                log_success(f"✅ Partner earning correct")
            else:
                log_error(f"❌ Partner earning mismatch")
                return False
            
            if abs(platform_earning - expected_platform) < 0.01:
                log_success(f"✅ Platform absorbed unused merchant shares (fallback rule)")
            else:
                log_error(f"❌ Platform earning mismatch")
                return False
        else:
            log_error(f"❌ Independent partner should have 0 merchant shares")
            return False
    
    # Verify partner wallet increased
    partner_profile_after = get_user_profile(partner_token)
    partner_wallet_after = partner_profile_after.get("wallet_balance", 0)
    wallet_increase = partner_wallet_after - partner_wallet_before
    
    log_info(f"\nPartner wallet after: ₹{partner_wallet_after}")
    log_info(f"Wallet increase: ₹{wallet_increase}")
    log_info(f"Expected increase: ₹{partner_earning}")
    
    if abs(wallet_increase - partner_earning) < 0.01:
        log_success(f"✅ Partner wallet increased by partner_earning")
    else:
        log_error(f"❌ Wallet increase mismatch")
        return False
    
    log_success("✅ TEST 2 PASSED: Commission distribution working correctly")
    return True

def test_cancellation_before_started(customer_token: str, partner_token: str, services: List[Dict]):
    """
    TEST 3: CANCELLATION BEFORE WORK STARTS
    - Create+pay booking → cancel before started
    - Verify refund record created
    - Verify customer wallet increased by refund amount
    - Verify partner wallet increased by partner_cut
    """
    log_info("\n" + "="*80)
    log_info("TEST 3: Cancellation Before Work Starts (Mock/Wallet Refund)")
    log_info("="*80)
    
    if not services:
        log_error("No services available")
        return False
    
    service = services[0]
    log_info(f"Using service: {service['name']}")
    
    # Get customer wallet before
    customer_profile = get_user_profile(customer_token)
    customer_wallet_before = customer_profile.get("wallet_balance", 0)
    log_info(f"Customer wallet before: ₹{customer_wallet_before}")
    
    # Get partner wallet before
    partner_profile = get_user_profile(partner_token)
    partner_wallet_before = partner_profile.get("wallet_balance", 0)
    log_info(f"Partner wallet before: ₹{partner_wallet_before}")
    
    # Create booking
    log_info("\nStep 1: Creating booking...")
    booking = create_booking(customer_token, service["id"])
    if not booking:
        return False
    log_success(f"Booking created: {booking['code']}")
    
    # Pay booking
    log_info("\nStep 2: Paying booking...")
    payment = mock_payment(customer_token, booking["id"])
    if not payment:
        return False
    log_success("Payment successful")
    
    time.sleep(1)
    
    # Partner accepts job (optional - test both with and without partner)
    log_info("\nStep 3: Partner accepting job...")
    jobs = get_partner_jobs(partner_token)
    if jobs:
        job = next((j for j in jobs if j["id"] == booking["id"]), None)
        if job:
            accept_result = accept_job(partner_token, booking["id"])
            if accept_result:
                log_success("Job accepted by partner")
            else:
                log_warning("Partner accept failed, continuing without partner")
        else:
            log_warning("Booking not in partner feed")
    
    # Get booking before cancel
    booking = get_booking(customer_token, booking["id"])
    total_paid = booking["pricing"]["total"]
    log_info(f"Total paid: ₹{total_paid}")
    
    # Cancel booking
    log_info("\nStep 4: Cancelling booking...")
    cancel_resp = cancel_booking(customer_token, booking["id"], "Changed plans")
    if cancel_resp.status_code != 200:
        log_error(f"Cancel failed: {cancel_resp.status_code} - {cancel_resp.text}")
        return False
    
    cancelled_booking = cancel_resp.json()
    log_success(f"Booking cancelled (status: {cancelled_booking['status']})")
    
    # Verify cancellation block
    log_info("\nStep 5: Verifying cancellation block...")
    cancellation = cancelled_booking.get("cancellation")
    if not cancellation:
        log_error("Cancellation block not found")
        return False
    
    refund_pct = cancellation.get("refund_pct")
    refund = cancellation.get("refund")
    partner_cancellation_pct = cancellation.get("partner_cancellation_pct")
    cancel_charge = cancellation.get("cancel_charge")
    admin_cut = cancellation.get("admin_cut")
    partner_cut = cancellation.get("partner_cut")
    refund_id = cancellation.get("refund_id")
    refund_status = cancellation.get("refund_status")
    
    log_info(f"Cancellation breakdown:")
    log_info(f"  Refund %: {refund_pct}%")
    log_info(f"  Refund amount: ₹{refund}")
    log_info(f"  Partner cancellation %: {partner_cancellation_pct}%")
    log_info(f"  Cancel charge: ₹{cancel_charge}")
    log_info(f"  Admin cut: ₹{admin_cut}")
    log_info(f"  Partner cut: ₹{partner_cut}")
    log_info(f"  Refund ID: {refund_id}")
    log_info(f"  Refund status: {refund_status}")
    
    # Verify percentages
    if refund_pct == 80:
        log_success(f"✅ Refund % correct (80%)")
    else:
        log_error(f"❌ Refund % wrong: {refund_pct}%")
        return False
    
    if partner_cancellation_pct == 20:
        log_success(f"✅ Partner cancellation % correct (20%)")
    else:
        log_error(f"❌ Partner cancellation % wrong: {partner_cancellation_pct}%")
        return False
    
    # Verify amounts
    expected_refund = round(total_paid * 0.8, 2)
    expected_cancel_charge = round(total_paid * 0.2, 2)
    
    if abs(refund - expected_refund) < 0.01:
        log_success(f"✅ Refund amount correct")
    else:
        log_error(f"❌ Refund amount wrong: ₹{refund}, expected ₹{expected_refund}")
        return False
    
    if abs(cancel_charge - expected_cancel_charge) < 0.01:
        log_success(f"✅ Cancel charge correct")
    else:
        log_error(f"❌ Cancel charge wrong: ₹{cancel_charge}, expected ₹{expected_cancel_charge}")
        return False
    
    # Verify customer wallet increased
    time.sleep(1)  # Wait for wallet update
    customer_profile_after = get_user_profile(customer_token)
    customer_wallet_after = customer_profile_after.get("wallet_balance", 0)
    wallet_increase = customer_wallet_after - customer_wallet_before
    
    log_info(f"\nCustomer wallet after: ₹{customer_wallet_after}")
    log_info(f"Wallet increase: ₹{wallet_increase}")
    log_info(f"Expected increase: ₹{refund}")
    
    if abs(wallet_increase - refund) < 0.01:
        log_success(f"✅ Customer wallet increased by refund amount (mock path)")
    else:
        log_error(f"❌ Customer wallet increase mismatch")
        return False
    
    # Verify refund record
    log_info("\nStep 6: Verifying refund record...")
    refunds = get_refunds(customer_token)
    if not refunds:
        log_error("No refunds found")
        return False
    
    refund_record = next((r for r in refunds if r["id"] == refund_id), None)
    if not refund_record:
        log_error("Refund record not found")
        return False
    
    log_info(f"Refund record:")
    log_info(f"  Status: {refund_record.get('status')}")
    log_info(f"  Method: {refund_record.get('method')}")
    log_info(f"  Refund amount: ₹{refund_record.get('refund_amount')}")
    log_info(f"  Partner cancellation amount: ₹{refund_record.get('partner_cancellation_amount')}")
    log_info(f"  Platform commission: ₹{refund_record.get('platform_commission')}")
    
    if refund_record.get("status") == "processed":
        log_success(f"✅ Refund status is 'processed'")
    else:
        log_error(f"❌ Refund status wrong: {refund_record.get('status')}")
        return False
    
    if refund_record.get("method") == "wallet":
        log_success(f"✅ Refund method is 'wallet' (mock path)")
    else:
        log_error(f"❌ Refund method wrong: {refund_record.get('method')}")
        return False
    
    # Verify partner wallet increased (if partner was assigned)
    if cancelled_booking.get("partner_id"):
        partner_profile_after = get_user_profile(partner_token)
        partner_wallet_after = partner_profile_after.get("wallet_balance", 0)
        partner_wallet_increase = partner_wallet_after - partner_wallet_before
        
        log_info(f"\nPartner wallet after: ₹{partner_wallet_after}")
        log_info(f"Partner wallet increase: ₹{partner_wallet_increase}")
        log_info(f"Expected increase: ₹{partner_cut}")
        
        if abs(partner_wallet_increase - partner_cut) < 0.01:
            log_success(f"✅ Partner wallet increased by partner_cut")
        else:
            log_error(f"❌ Partner wallet increase mismatch")
            return False
    
    log_success("✅ TEST 3 PASSED: Cancellation before started working correctly")
    return True

def test_cancellation_after_started(customer_token: str, partner_token: str, admin_token: str, services: List[Dict]):
    """
    TEST 4: CANCELLATION AFTER STARTED → 400
    - Create+pay booking → partner accept → start job → try to cancel → 400
    """
    log_info("\n" + "="*80)
    log_info("TEST 4: Cancellation After Started (Should Fail)")
    log_info("="*80)
    
    if not services:
        log_error("No services available")
        return False
    
    service = services[0]
    log_info(f"Using service: {service['name']}")
    
    # Create booking
    log_info("\nStep 1: Creating booking...")
    booking = create_booking(customer_token, service["id"])
    if not booking:
        return False
    log_success(f"Booking created: {booking['code']}")
    
    # Pay booking
    log_info("\nStep 2: Paying booking...")
    payment = mock_payment(customer_token, booking["id"])
    if not payment:
        return False
    log_success("Payment successful")
    
    time.sleep(1)
    
    # Partner accepts job (or admin assigns if not in feed)
    log_info("\nStep 3: Partner accepting job...")
    jobs = get_partner_jobs(partner_token)
    job = next((j for j in jobs if j["id"] == booking["id"]), None) if jobs else None
    
    if job:
        accept_result = accept_job(partner_token, booking["id"])
        if not accept_result:
            return False
        log_success("Job accepted by partner")
    else:
        log_warning("Booking not in partner's job feed, using admin assignment...")
        partner_id = get_partner_id(partner_token)
        if not partner_id:
            log_error("Failed to get partner ID")
            return False
        assign_result = admin_assign_booking(admin_token, booking["id"], partner_id)
        if not assign_result:
            return False
        log_success("Job assigned by admin")
    
    # Get start OTP and start job
    booking = get_booking(customer_token, booking["id"])
    start_otp = booking.get("otps", {}).get("start")
    if not start_otp:
        log_error("Start OTP not found")
        return False
    
    # Upload before evidence
    log_info("\nStep 4a: Uploading before evidence...")
    evidence_result = upload_evidence(partner_token, booking["id"], "before")
    if not evidence_result:
        return False
    log_success("Before evidence uploaded")
    
    log_info("\nStep 4b: Starting job...")
    start_result = verify_start_otp(partner_token, booking["id"], start_otp)
    if not start_result:
        return False
    log_success("Job started")
    
    # Try to cancel
    log_info("\nStep 5: Trying to cancel (should fail)...")
    cancel_resp = cancel_booking(customer_token, booking["id"], "Test cancellation")
    
    if cancel_resp.status_code == 400:
        log_success(f"✅ Cancellation correctly rejected with 400")
        error_msg = cancel_resp.json().get("detail", "")
        if "started" in error_msg.lower() or "can't be cancelled" in error_msg.lower():
            log_success(f"✅ Error message mentions work has started: '{error_msg}'")
        else:
            log_warning(f"⚠️  Error message: '{error_msg}'")
    else:
        log_error(f"❌ Should return 400, got {cancel_resp.status_code}")
        return False
    
    log_success("✅ TEST 4 PASSED: Cancellation after started correctly blocked")
    return True

def test_admin_refund_history(admin_token: str):
    """
    TEST 5: ADMIN REFUND HISTORY
    - GET /api/admin/refunds → returns rich records
    """
    log_info("\n" + "="*80)
    log_info("TEST 5: Admin Refund History")
    log_info("="*80)
    
    log_info("Fetching admin refunds...")
    refunds = get_admin_refunds(admin_token)
    
    if refunds is None:
        log_error("Failed to fetch admin refunds")
        return False
    
    log_success(f"Found {len(refunds)} refund records")
    
    if len(refunds) == 0:
        log_warning("No refunds found (may be expected if no cancellations yet)")
        return True
    
    # Check first refund has all required fields
    refund = refunds[0]
    required_fields = ["booking_code", "customer_name", "service_name", "original_amount",
                      "refund_amount", "refund_pct", "partner_cancellation_amount",
                      "platform_commission", "method", "status"]
    
    log_info(f"\nChecking refund record structure:")
    all_present = True
    for field in required_fields:
        if field in refund:
            log_success(f"  ✅ {field}: {refund[field]}")
        else:
            log_error(f"  ❌ Missing field: {field}")
            all_present = False
    
    if not all_present:
        return False
    
    # Verify latest-first ordering
    if len(refunds) > 1:
        first_date = refunds[0].get("created_at", "")
        second_date = refunds[1].get("created_at", "")
        if first_date >= second_date:
            log_success(f"✅ Refunds ordered latest-first")
        else:
            log_error(f"❌ Refunds not ordered correctly")
            return False
    
    log_success("✅ TEST 5 PASSED: Admin refund history working correctly")
    return True

def test_webhook_signature_guard(admin_token: str):
    """
    TEST 6: WEBHOOK SIGNATURE GUARD
    - POST /api/payments/webhooks/razorpay-refund with bad signature → 400
    """
    log_info("\n" + "="*80)
    log_info("TEST 6: Webhook Signature Guard")
    log_info("="*80)
    
    # Test with bogus signature
    log_info("Test 6a: Webhook with bogus signature...")
    webhook_data = {
        "event": "refund.processed",
        "payload": {
            "refund": {
                "entity": {
                    "id": "rfnd_test123",
                    "status": "processed"
                }
            }
        }
    }
    
    resp = webhook_refund(webhook_data, signature="bogus_signature_12345")
    if resp.status_code == 400:
        log_success(f"✅ Correctly rejected bogus signature with 400")
    else:
        log_error(f"❌ Should return 400, got {resp.status_code}")
        return False
    
    # Test with missing signature
    log_info("\nTest 6b: Webhook with missing signature...")
    resp = webhook_refund(webhook_data, signature=None)
    if resp.status_code == 400:
        log_success(f"✅ Correctly rejected missing signature with 400")
    else:
        log_error(f"❌ Should return 400, got {resp.status_code}")
        return False
    
    # Verify server didn't crash
    log_info("\nTest 6c: Verifying server is still running...")
    settings = get_settings(admin_token)
    if settings:
        log_success(f"✅ Server still responding (not crashed)")
    else:
        log_error(f"❌ Server not responding")
        return False
    
    log_success("✅ TEST 6 PASSED: Webhook signature guard working correctly")
    return True

def test_regression(customer_token: str, services: List[Dict]):
    """
    TEST 7: REGRESSION
    - Confirm normal booking create → mock pay → searching still works
    - GET /api/bookings/quote still returns correct pricing
    """
    log_info("\n" + "="*80)
    log_info("TEST 7: Regression Tests")
    log_info("="*80)
    
    if not services:
        log_error("No services available")
        return False
    
    service = services[0]
    
    # Test 7a: Quote endpoint
    log_info("Test 7a: GET /api/bookings/quote...")
    params = {
        "service_id": service["id"],
        "schedule_type": "emergency",
        "addons": []
    }
    resp = requests.get(f"{BASE_URL}/bookings/quote",
                       params=params,
                       headers={"Authorization": f"Bearer {customer_token}"})
    
    if resp.status_code != 200:
        log_error(f"Quote endpoint failed: {resp.status_code}")
        return False
    
    quote = resp.json()
    pricing = quote.get("pricing", {})
    
    if "emergency_fee" in pricing and "visiting_charge" in pricing:
        log_success(f"✅ Quote endpoint working (emergency_fee: ₹{pricing['emergency_fee']})")
    else:
        log_error(f"❌ Quote endpoint missing pricing fields")
        return False
    
    # Test 7b: Create booking → pay → searching
    log_info("\nTest 7b: Create booking → pay → searching...")
    booking = create_booking(customer_token, service["id"])
    if not booking:
        return False
    log_success(f"Booking created: {booking['code']}")
    
    payment = mock_payment(customer_token, booking["id"])
    if not payment:
        return False
    log_success("Payment successful")
    
    time.sleep(1)
    
    booking = get_booking(customer_token, booking["id"])
    if booking and booking.get("status") == "searching":
        log_success(f"✅ Booking status changed to 'searching'")
    else:
        log_error(f"❌ Booking status wrong: {booking.get('status') if booking else 'N/A'}")
        return False
    
    log_success("✅ TEST 7 PASSED: Regression tests passed")
    return True

def main():
    log_info("="*80)
    log_info("AzoApp Commission, Cancellation, Refund & Referral Logic Testing")
    log_info("="*80)
    
    # Login
    admin_token = login(ADMIN_PHONE, OTP)
    if not admin_token:
        log_error("Failed to login as admin")
        sys.exit(1)
    
    customer_token = login(CUSTOMER_PHONE, OTP)
    if not customer_token:
        log_error("Failed to login as customer")
        sys.exit(1)
    
    partner_raj_token = login(PARTNER_RAJ_PHONE, OTP)
    if not partner_raj_token:
        log_error("Failed to login as partner Raj")
        sys.exit(1)
    
    # Get services
    services = get_services(customer_token)
    if not services:
        log_error("No services available")
        sys.exit(1)
    
    log_success(f"Found {len(services)} services")
    
    # Run tests
    results = []
    
    results.append(("TEST 1: Settings Validation", 
                   test_settings_validation(admin_token)))
    
    results.append(("TEST 2: Commission Distribution", 
                   test_commission_distribution(customer_token, partner_raj_token, admin_token, services)))
    
    results.append(("TEST 3: Cancellation Before Started", 
                   test_cancellation_before_started(customer_token, partner_raj_token, services)))
    
    results.append(("TEST 4: Cancellation After Started", 
                   test_cancellation_after_started(customer_token, partner_raj_token, admin_token, services)))
    
    results.append(("TEST 5: Admin Refund History", 
                   test_admin_refund_history(admin_token)))
    
    results.append(("TEST 6: Webhook Signature Guard", 
                   test_webhook_signature_guard(admin_token)))
    
    results.append(("TEST 7: Regression", 
                   test_regression(customer_token, services)))
    
    # Summary
    log_info("\n" + "="*80)
    log_info("TEST SUMMARY")
    log_info("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        if result:
            log_success(f"✅ {test_name}")
        else:
            log_error(f"❌ {test_name}")
    
    log_info("\n" + "="*80)
    if passed == total:
        log_success(f"ALL TESTS PASSED ({passed}/{total})")
        log_info("="*80)
        sys.exit(0)
    else:
        log_error(f"SOME TESTS FAILED ({passed}/{total} passed)")
        log_info("="*80)
        sys.exit(1)

if __name__ == "__main__":
    main()
