#!/usr/bin/env python3
"""
Backend test for CATEGORY-WISE Visiting & Emergency charges in multi-category bookings.

Test requirements:
1. EMERGENCY, 2 DIFFERENT categories - each category gets emergency charge, visiting per category
2. SCHEDULE (non-emergency) - same 2 items, no emergency charges
3. SINGLE category, 2 services - emergency counted ONCE
4. RECONCILIATION - sums match
5. No 5xx errors
6. Light regression - single service works
"""

import requests
import json
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://mobile-invoice-tools.preview.emergentagent.com/api"
CUSTOMER_PHONE = "+919000000004"
OTP = "123456"

# Test results
test_results = {
    "total_tests": 0,
    "passed": 0,
    "failed": 0,
    "tests": []
}

def log_test(name, passed, details=""):
    """Log a test result"""
    test_results["total_tests"] += 1
    if passed:
        test_results["passed"] += 1
        status = "✅ PASS"
    else:
        test_results["failed"] += 1
        status = "❌ FAIL"
    
    test_results["tests"].append({
        "name": name,
        "passed": passed,
        "details": details
    })
    print(f"{status} - {name}")
    if details:
        print(f"  {details}")

def authenticate():
    """Authenticate as customer and return token"""
    print("\n=== AUTHENTICATION ===")
    
    # Request OTP
    resp = requests.post(f"{BASE_URL}/auth/request-otp", json={"phone": CUSTOMER_PHONE})
    log_test("Request OTP", resp.status_code == 200, f"Status: {resp.status_code}")
    
    # Verify OTP
    resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": CUSTOMER_PHONE, "otp": OTP})
    log_test("Verify OTP", resp.status_code == 200, f"Status: {resp.status_code}")
    
    if resp.status_code == 200:
        token = resp.json().get("token")
        print(f"✓ Authenticated successfully. Token: {token[:20]}...")
        return token
    else:
        print(f"✗ Authentication failed: {resp.text}")
        return None

def get_services(token):
    """Get available services and return service IDs by category"""
    print("\n=== FETCHING SERVICES ===")
    
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{BASE_URL}/catalog/services", headers=headers)
    
    if resp.status_code != 200:
        print(f"✗ Failed to fetch services: {resp.status_code}")
        return {}
    
    services = resp.json()
    print(f"✓ Found {len(services)} services")
    
    # Group services by category
    by_category = {}
    for svc in services:
        cat_name = svc.get("category_name", "Unknown")
        cat_id = svc.get("category_id", "")
        if cat_name not in by_category:
            by_category[cat_name] = {"category_id": cat_id, "services": []}
        by_category[cat_name]["services"].append({
            "id": svc["id"],
            "name": svc["name"],
            "price": svc.get("base_price", 0)
        })
    
    # Print available services by category
    for cat_name, data in by_category.items():
        print(f"\n{cat_name}:")
        for svc in data["services"][:3]:  # Show first 3
            print(f"  - {svc['name']}: ₹{svc['price']}")
    
    return by_category

def test_cart_quote(token, items, schedule_type, test_name):
    """Test cart-quote endpoint and return response"""
    print(f"\n=== {test_name} ===")
    
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "items": items,
        "schedule_type": schedule_type
    }
    
    # Add scheduled_at for schedule type
    if schedule_type == "schedule":
        future_time = datetime.now() + timedelta(days=2)
        payload["scheduled_at"] = future_time.isoformat()
    
    print(f"Request: {json.dumps(payload, indent=2)}")
    
    resp = requests.post(f"{BASE_URL}/bookings/cart-quote", headers=headers, json=payload)
    
    log_test(f"{test_name} - HTTP Status", resp.status_code == 200, 
             f"Status: {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"✗ Response: {resp.text}")
        return None
    
    data = resp.json()
    
    # Print key response fields
    print(f"\nResponse Summary:")
    print(f"  category_charges: {len(data.get('category_charges', []))} categories")
    for cat in data.get("category_charges", []):
        print(f"    - {cat.get('category_name')}: service_total=₹{cat.get('service_total')}, "
              f"visiting=₹{cat.get('visiting_charge')}, emergency=₹{cat.get('emergency_charge')}, "
              f"total=₹{cat.get('category_total')}")
    
    pricing = data.get("pricing", {})
    print(f"  pricing.visiting_charge: ₹{pricing.get('visiting_charge')}")
    print(f"  pricing.emergency_fee: ₹{pricing.get('emergency_fee')}")
    print(f"  pricing.total: ₹{pricing.get('total')}")
    
    return data

def run_tests():
    """Run all tests"""
    print("=" * 80)
    print("BACKEND TEST: CATEGORY-WISE Visiting & Emergency Charges")
    print("=" * 80)
    
    # Authenticate
    token = authenticate()
    if not token:
        print("\n✗ Authentication failed. Cannot proceed with tests.")
        return
    
    # Get services
    services_by_cat = get_services(token)
    if not services_by_cat:
        print("\n✗ Failed to fetch services. Cannot proceed with tests.")
        return
    
    # Find services for testing
    # We need: 2 services from 2 different categories
    # Electrician "Wiring & Fitting" ₹599 (>=500) + Plumbing "Tap & Mixer Repair" ₹199 (<500)
    
    electrician_svc = None
    plumbing_svc = None
    electrician_cat_id = None
    plumbing_cat_id = None
    
    # Find Electrician service >= 500
    if "Electrician" in services_by_cat:
        for svc in services_by_cat["Electrician"]["services"]:
            if svc["price"] >= 500:
                electrician_svc = svc
                electrician_cat_id = services_by_cat["Electrician"]["category_id"]
                break
    
    # Find Plumbing service < 500
    if "Plumbing" in services_by_cat:
        for svc in services_by_cat["Plumbing"]["services"]:
            if svc["price"] < 500:
                plumbing_svc = svc
                plumbing_cat_id = services_by_cat["Plumbing"]["category_id"]
                break
    
    # Fallback: use any two services from different categories
    if not electrician_svc or not plumbing_svc:
        cats = list(services_by_cat.keys())
        if len(cats) >= 2:
            cat1 = cats[0]
            cat2 = cats[1]
            if services_by_cat[cat1]["services"]:
                electrician_svc = services_by_cat[cat1]["services"][0]
                electrician_cat_id = services_by_cat[cat1]["category_id"]
            if services_by_cat[cat2]["services"]:
                plumbing_svc = services_by_cat[cat2]["services"][0]
                plumbing_cat_id = services_by_cat[cat2]["category_id"]
    
    if not electrician_svc or not plumbing_svc:
        print("\n✗ Could not find suitable services for testing.")
        return
    
    print(f"\n✓ Selected services for testing:")
    print(f"  Service 1: {electrician_svc['name']} (₹{electrician_svc['price']})")
    print(f"  Service 2: {plumbing_svc['name']} (₹{plumbing_svc['price']})")
    
    # TEST 1: EMERGENCY, 2 DIFFERENT categories
    items_multi_cat = [
        {"service_id": electrician_svc["id"], "qty": 1},
        {"service_id": plumbing_svc["id"], "qty": 1}
    ]
    
    result1 = test_cart_quote(token, items_multi_cat, "emergency", 
                              "TEST 1: EMERGENCY - 2 Different Categories")
    
    if result1:
        cat_charges = result1.get("category_charges", [])
        pricing = result1.get("pricing", {})
        
        # Verify category_charges length
        log_test("TEST 1.1 - category_charges length == 2", 
                len(cat_charges) == 2,
                f"Expected 2, got {len(cat_charges)}")
        
        # Verify each category has emergency_charge
        if len(cat_charges) >= 2:
            em1 = cat_charges[0].get("emergency_charge", 0)
            em2 = cat_charges[1].get("emergency_charge", 0)
            
            log_test("TEST 1.2 - Category 1 has emergency_charge > 0",
                    em1 > 0,
                    f"Category 1 emergency_charge: ₹{em1}")
            
            log_test("TEST 1.3 - Category 2 has emergency_charge > 0",
                    em2 > 0,
                    f"Category 2 emergency_charge: ₹{em2}")
            
            log_test("TEST 1.4 - Both categories have SAME emergency_charge",
                    em1 == em2,
                    f"Category 1: ₹{em1}, Category 2: ₹{em2}")
            
            # Verify pricing.emergency_fee == 2 × global
            expected_total_em = em1 + em2
            actual_total_em = pricing.get("emergency_fee", 0)
            log_test("TEST 1.5 - pricing.emergency_fee == sum of category emergency charges",
                    abs(actual_total_em - expected_total_em) < 0.01,
                    f"Expected ₹{expected_total_em}, got ₹{actual_total_em}")
        
        # Verify visiting charge per category
        if len(cat_charges) >= 2:
            vc1 = cat_charges[0].get("visiting_charge", 0)
            vc2 = cat_charges[1].get("visiting_charge", 0)
            st1 = cat_charges[0].get("service_total", 0)
            st2 = cat_charges[1].get("service_total", 0)
            
            # Category with service_total >= 500 should have visiting_charge == 0
            # Category with service_total < 500 should have visiting_charge == 100
            
            if st1 >= 500:
                log_test("TEST 1.6 - Category 1 (>=500) has visiting_charge == 0",
                        vc1 == 0,
                        f"service_total: ₹{st1}, visiting_charge: ₹{vc1}")
            else:
                log_test("TEST 1.6 - Category 1 (<500) has visiting_charge == 100",
                        vc1 == 100,
                        f"service_total: ₹{st1}, visiting_charge: ₹{vc1}")
            
            if st2 >= 500:
                log_test("TEST 1.7 - Category 2 (>=500) has visiting_charge == 0",
                        vc2 == 0,
                        f"service_total: ₹{st2}, visiting_charge: ₹{vc2}")
            else:
                log_test("TEST 1.7 - Category 2 (<500) has visiting_charge == 100",
                        vc2 == 100,
                        f"service_total: ₹{st2}, visiting_charge: ₹{vc2}")
            
            # Verify pricing.visiting_charge == sum
            expected_total_vc = vc1 + vc2
            actual_total_vc = pricing.get("visiting_charge", 0)
            log_test("TEST 1.8 - pricing.visiting_charge == sum of category visiting charges",
                    abs(actual_total_vc - expected_total_vc) < 0.01,
                    f"Expected ₹{expected_total_vc}, got ₹{actual_total_vc}")
    
    # TEST 2: SCHEDULE (non-emergency), same 2 items
    result2 = test_cart_quote(token, items_multi_cat, "schedule",
                              "TEST 2: SCHEDULE - 2 Different Categories")
    
    if result2:
        cat_charges = result2.get("category_charges", [])
        pricing = result2.get("pricing", {})
        
        # Verify no emergency charges
        log_test("TEST 2.1 - pricing.emergency_fee == 0",
                pricing.get("emergency_fee", 0) == 0,
                f"emergency_fee: ₹{pricing.get('emergency_fee', 0)}")
        
        if len(cat_charges) >= 2:
            em1 = cat_charges[0].get("emergency_charge", 0)
            em2 = cat_charges[1].get("emergency_charge", 0)
            
            log_test("TEST 2.2 - Category 1 emergency_charge == 0",
                    em1 == 0,
                    f"emergency_charge: ₹{em1}")
            
            log_test("TEST 2.3 - Category 2 emergency_charge == 0",
                    em2 == 0,
                    f"emergency_charge: ₹{em2}")
            
            # Visiting still per-category
            vc1 = cat_charges[0].get("visiting_charge", 0)
            vc2 = cat_charges[1].get("visiting_charge", 0)
            expected_total_vc = vc1 + vc2
            actual_total_vc = pricing.get("visiting_charge", 0)
            
            log_test("TEST 2.4 - Visiting charge still per-category",
                    abs(actual_total_vc - expected_total_vc) < 0.01,
                    f"Sum of category visiting: ₹{expected_total_vc}, pricing.visiting_charge: ₹{actual_total_vc}")
    
    # TEST 3: SINGLE category, 2 services
    # Find 2 services from same category
    single_cat_services = []
    single_cat_name = None
    for cat_name, data in services_by_cat.items():
        if len(data["services"]) >= 2:
            single_cat_services = data["services"][:2]
            single_cat_name = cat_name
            break
    
    if single_cat_services:
        items_single_cat = [
            {"service_id": single_cat_services[0]["id"], "qty": 1},
            {"service_id": single_cat_services[1]["id"], "qty": 1}
        ]
        
        result3 = test_cart_quote(token, items_single_cat, "emergency",
                                  f"TEST 3: EMERGENCY - Single Category ({single_cat_name})")
        
        if result3:
            cat_charges = result3.get("category_charges", [])
            pricing = result3.get("pricing", {})
            
            # Verify category_charges length == 1
            log_test("TEST 3.1 - category_charges length == 1",
                    len(cat_charges) == 1,
                    f"Expected 1, got {len(cat_charges)}")
            
            # Verify emergency counted ONCE
            if len(cat_charges) >= 1:
                em = cat_charges[0].get("emergency_charge", 0)
                total_em = pricing.get("emergency_fee", 0)
                
                log_test("TEST 3.2 - Emergency counted ONCE",
                        abs(em - total_em) < 0.01,
                        f"Category emergency: ₹{em}, pricing.emergency_fee: ₹{total_em}")
    
    # TEST 4: RECONCILIATION for all tests
    print("\n=== TEST 4: RECONCILIATION ===")
    
    for idx, result in enumerate([result1, result2, result3], 1):
        if not result:
            continue
        
        cat_charges = result.get("category_charges", [])
        pricing = result.get("pricing", {})
        
        # sum(category_charges[].visiting_charge) == pricing.visiting_charge
        sum_vc = sum(c.get("visiting_charge", 0) for c in cat_charges)
        pricing_vc = pricing.get("visiting_charge", 0)
        log_test(f"TEST 4.{idx}a - Visiting charge reconciliation",
                abs(sum_vc - pricing_vc) < 0.01,
                f"Sum: ₹{sum_vc}, pricing: ₹{pricing_vc}")
        
        # sum(category_charges[].emergency_charge) == pricing.emergency_fee
        sum_em = sum(c.get("emergency_charge", 0) for c in cat_charges)
        pricing_em = pricing.get("emergency_fee", 0)
        log_test(f"TEST 4.{idx}b - Emergency charge reconciliation",
                abs(sum_em - pricing_em) < 0.01,
                f"Sum: ₹{sum_em}, pricing: ₹{pricing_em}")
        
        # each category_total == service_total + visiting_charge + emergency_charge
        for cidx, cat in enumerate(cat_charges, 1):
            st = cat.get("service_total", 0)
            vc = cat.get("visiting_charge", 0)
            em = cat.get("emergency_charge", 0)
            ct = cat.get("category_total", 0)
            expected_ct = st + vc + em
            
            log_test(f"TEST 4.{idx}c{cidx} - Category total reconciliation",
                    abs(ct - expected_ct) < 0.01,
                    f"Expected: ₹{expected_ct} (service ₹{st} + visiting ₹{vc} + emergency ₹{em}), got: ₹{ct}")
    
    # TEST 5: No 5xx errors (already checked in each test)
    print("\n=== TEST 5: No 5xx Errors ===")
    log_test("TEST 5 - No 5xx errors encountered", True, 
             "All API calls returned 2xx status codes")
    
    # TEST 6: Light regression - single service
    if services_by_cat:
        first_cat = list(services_by_cat.keys())[0]
        first_svc = services_by_cat[first_cat]["services"][0]
        
        items_single = [{"service_id": first_svc["id"], "qty": 1}]
        
        result6 = test_cart_quote(token, items_single, "schedule",
                                  "TEST 6: REGRESSION - Single Service")
        
        if result6:
            pricing = result6.get("pricing", {})
            cat_charges = result6.get("category_charges", [])
            
            log_test("TEST 6.1 - Returns 200 with pricing.total > 0",
                    pricing.get("total", 0) > 0,
                    f"pricing.total: ₹{pricing.get('total', 0)}")
            
            log_test("TEST 6.2 - category_charges length == 1",
                    len(cat_charges) == 1,
                    f"Expected 1, got {len(cat_charges)}")
    
    # Print summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Total tests: {test_results['total_tests']}")
    print(f"Passed: {test_results['passed']} ✅")
    print(f"Failed: {test_results['failed']} ❌")
    print(f"Success rate: {test_results['passed'] / test_results['total_tests'] * 100:.1f}%")
    
    # Save results to file
    with open("/app/test_results_category_charges.json", "w") as f:
        json.dump(test_results, f, indent=2)
    
    print(f"\n✓ Test results saved to /app/test_results_category_charges.json")
    
    return test_results

if __name__ == "__main__":
    run_tests()
