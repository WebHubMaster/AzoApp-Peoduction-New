#!/usr/bin/env python3
"""
Backend API Testing for Category/Subcategory SEO JSON-LD + tax_ids + surge_rules
Tests as per review request:
1. CATEGORY JSON-LD (public)
2. CATEGORY CREATE with SEO + slug
3. SUBCATEGORY with slug + seo
4. SURGE_RULES collection
5. SERVICE tax_ids
6. REGRESSION tests
"""
import sys
import requests
import json

# Base URL from frontend/.env
BASE_URL = "https://fcm-token-fix-3.preview.emergentagent.com/api"

# Test credentials
ADMIN_PHONE = "+919000000000"
ADMIN_OTP = "123456"

def get_admin_token():
    """Get admin auth token"""
    url = f"{BASE_URL}/auth/verify-otp"
    payload = {"phone": ADMIN_PHONE, "otp": ADMIN_OTP}
    resp = requests.post(url, json=payload)
    if resp.status_code != 200:
        print(f"❌ Admin login failed: {resp.status_code} {resp.text}")
        sys.exit(1)
    data = resp.json()
    token = data.get("token")
    if not token:
        print(f"❌ No token in response: {data}")
        sys.exit(1)
    print(f"✅ Admin login successful (token: {token[:20]}...)")
    return token

def test_1_category_jsonld_public(token):
    """
    TEST 1: CATEGORY JSON-LD (public)
    GET /api/catalog/category/ac-repair-service -> verify jsonld with CollectionPage, BreadcrumbList
    Also test with category id, and test unknown slug returns 404
    """
    print("\n" + "="*80)
    print("TEST 1: CATEGORY JSON-LD (public)")
    print("="*80)
    
    # Step 1: Test with known slug "ac-repair-service"
    url = f"{BASE_URL}/catalog/category/ac-repair-service"
    resp = requests.get(url)
    if resp.status_code != 200:
        print(f"❌ GET /catalog/category/ac-repair-service failed: {resp.status_code} {resp.text}")
        return False
    
    cat = resp.json()
    print(f"✅ GET /catalog/category/ac-repair-service returned category: {cat.get('name')}")
    
    # Step 2: Verify jsonld exists
    if "jsonld" not in cat:
        print(f"❌ Response does not contain 'jsonld' key")
        return False
    print(f"✅ Response contains 'jsonld' object")
    
    jsonld = cat["jsonld"]
    
    # Step 3: Verify @type is CollectionPage
    if jsonld.get("@type") != "CollectionPage":
        print(f"❌ jsonld @type is '{jsonld.get('@type')}', expected 'CollectionPage'")
        return False
    print(f"✅ jsonld @type is 'CollectionPage'")
    
    # Step 4: Verify breadcrumb exists with @type BreadcrumbList
    if "breadcrumb" not in jsonld:
        print(f"❌ jsonld does not contain 'breadcrumb' key")
        return False
    
    breadcrumb = jsonld["breadcrumb"]
    if breadcrumb.get("@type") != "BreadcrumbList":
        print(f"❌ breadcrumb @type is '{breadcrumb.get('@type')}', expected 'BreadcrumbList'")
        return False
    print(f"✅ jsonld contains 'breadcrumb' with @type='BreadcrumbList'")
    
    # Step 5: Verify itemListElement array exists
    if "itemListElement" not in breadcrumb:
        print(f"❌ breadcrumb does not contain 'itemListElement' array")
        return False
    
    items = breadcrumb["itemListElement"]
    if not isinstance(items, list) or len(items) == 0:
        print(f"❌ itemListElement is not a valid array: {items}")
        return False
    print(f"✅ breadcrumb contains 'itemListElement' array with {len(items)} items")
    
    # Step 6: Verify name and description present
    if not jsonld.get("name"):
        print(f"❌ jsonld does not contain 'name'")
        return False
    if not jsonld.get("description"):
        print(f"❌ jsonld does not contain 'description'")
        return False
    print(f"✅ jsonld contains name='{jsonld['name']}' and description")
    
    # Step 7: Test with category id (get id from previous response)
    category_id = cat.get("id")
    if category_id:
        url = f"{BASE_URL}/catalog/category/{category_id}"
        resp = requests.get(url)
        if resp.status_code != 200:
            print(f"❌ GET /catalog/category/{category_id} failed: {resp.status_code}")
            return False
        cat2 = resp.json()
        if "jsonld" not in cat2:
            print(f"❌ GET by id does not return jsonld")
            return False
        print(f"✅ GET /catalog/category/{category_id} (by id) also returns jsonld")
    
    # Step 8: Test unknown slug returns 404
    url = f"{BASE_URL}/catalog/category/unknown-category-slug-12345"
    resp = requests.get(url)
    if resp.status_code != 404:
        print(f"❌ GET with unknown slug returned {resp.status_code}, expected 404")
        return False
    print(f"✅ GET with unknown slug correctly returns 404")
    
    print(f"\n✅ TEST 1 PASSED: Category JSON-LD working correctly")
    return True

def test_2_category_create_with_seo_slug(token):
    """
    TEST 2: CATEGORY CREATE with SEO + slug
    POST /api/catalog/categories with seo fields + slug, verify persistence and jsonld
    """
    print("\n" + "="*80)
    print("TEST 2: CATEGORY CREATE with SEO + slug")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Step 1: Create category with seo + slug
    category_data = {
        "name": "Test SEO Cat",
        "slug": "test-seo-cat",
        "description": "desc",
        "seo": {
            "title": "T",
            "description": "D",
            "keywords": "k"
        },
        "status": "active"
    }
    
    url = f"{BASE_URL}/catalog/categories"
    resp = requests.post(url, json=category_data, headers=headers)
    if resp.status_code not in [200, 201]:
        print(f"❌ POST /catalog/categories failed: {resp.status_code} {resp.text}")
        return False
    
    created_cat = resp.json()
    cat_id = created_cat.get("id")
    print(f"✅ Category created successfully with id: {cat_id}")
    
    # Step 2: GET category by slug and verify jsonld + seo persisted
    url = f"{BASE_URL}/catalog/category/test-seo-cat"
    resp = requests.get(url)
    if resp.status_code != 200:
        print(f"❌ GET /catalog/category/test-seo-cat failed: {resp.status_code} {resp.text}")
        return False
    
    cat = resp.json()
    print(f"✅ GET /catalog/category/test-seo-cat returned category")
    
    # Verify jsonld present
    if "jsonld" not in cat:
        print(f"❌ Response does not contain 'jsonld'")
        return False
    print(f"✅ Response contains 'jsonld'")
    
    # Verify seo persisted
    if "seo" not in cat:
        print(f"❌ Response does not contain 'seo'")
        return False
    
    seo = cat["seo"]
    if seo.get("title") != "T" or seo.get("description") != "D" or seo.get("keywords") != "k":
        print(f"❌ SEO fields not persisted correctly: {seo}")
        return False
    print(f"✅ SEO fields persisted correctly (title='T', description='D', keywords='k')")
    
    # Step 3: Clean up - DELETE category (optional as per review request)
    if cat_id:
        url = f"{BASE_URL}/catalog/categories/{cat_id}"
        resp = requests.delete(url, headers=headers)
        if resp.status_code == 200:
            print(f"✅ Category deleted successfully (cleanup)")
        else:
            print(f"⚠️  Category deletion returned {resp.status_code} (may have dependencies)")
    
    print(f"\n✅ TEST 2 PASSED: Category CREATE with SEO + slug working correctly")
    return True

def test_3_subcategory_with_slug_seo(token):
    """
    TEST 3: SUBCATEGORY with slug + seo
    Create subcategory with slug + seo, verify GET /catalog/category/{subcat-slug} resolves and returns jsonld
    """
    print("\n" + "="*80)
    print("TEST 3: SUBCATEGORY with slug + seo")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Step 1: Get an existing category to use as parent
    url = f"{BASE_URL}/catalog/admin/categories"
    resp = requests.get(url, headers=headers)
    if resp.status_code != 200:
        print(f"❌ GET /catalog/admin/categories failed: {resp.status_code}")
        return False
    
    categories = resp.json()
    if not categories:
        print(f"❌ No categories found")
        return False
    
    parent_category_id = categories[0]["id"]
    print(f"✅ Using parent category: {categories[0]['name']} (id: {parent_category_id})")
    
    # Step 2: Create subcategory with slug + seo
    subcat_data = {
        "category_id": parent_category_id,
        "name": "Test SEO Subcat",
        "slug": "test-seo-subcat",
        "description": "Test subcategory with SEO",
        "seo": {
            "title": "Test Subcat SEO Title",
            "description": "Test Subcat SEO Description",
            "keywords": "test, subcat, seo"
        },
        "status": "active"
    }
    
    url = f"{BASE_URL}/catalog/subcategories"
    resp = requests.post(url, json=subcat_data, headers=headers)
    if resp.status_code not in [200, 201]:
        print(f"❌ POST /catalog/subcategories failed: {resp.status_code} {resp.text}")
        return False
    
    created_subcat = resp.json()
    subcat_id = created_subcat.get("id")
    subcat_slug = created_subcat.get("slug")
    print(f"✅ Subcategory created successfully with id: {subcat_id}, slug: {subcat_slug}")
    
    # Step 3: GET subcategory by slug via get_category endpoint (falls back to subcategories)
    url = f"{BASE_URL}/catalog/category/{subcat_slug}"
    resp = requests.get(url)
    if resp.status_code != 200:
        print(f"❌ GET /catalog/category/{subcat_slug} failed: {resp.status_code} {resp.text}")
        return False
    
    subcat = resp.json()
    print(f"✅ GET /catalog/category/{subcat_slug} resolved subcategory: {subcat.get('name')}")
    
    # Step 4: Verify jsonld present
    if "jsonld" not in subcat:
        print(f"❌ Response does not contain 'jsonld'")
        return False
    
    jsonld = subcat["jsonld"]
    if jsonld.get("@type") != "CollectionPage":
        print(f"❌ jsonld @type is '{jsonld.get('@type')}', expected 'CollectionPage'")
        return False
    
    if "breadcrumb" not in jsonld:
        print(f"❌ jsonld does not contain 'breadcrumb'")
        return False
    
    print(f"✅ Subcategory has jsonld with @type='CollectionPage' and breadcrumb")
    
    # Step 5: Verify seo persisted
    if "seo" not in subcat:
        print(f"❌ Response does not contain 'seo'")
        return False
    
    seo = subcat["seo"]
    if seo.get("title") != "Test Subcat SEO Title":
        print(f"❌ SEO title not persisted correctly: {seo.get('title')}")
        return False
    print(f"✅ SEO fields persisted correctly")
    
    # Step 6: Clean up - DELETE subcategory
    if subcat_id:
        url = f"{BASE_URL}/catalog/subcategories/{subcat_id}"
        resp = requests.delete(url, headers=headers)
        if resp.status_code == 200:
            print(f"✅ Subcategory deleted successfully (cleanup)")
        else:
            print(f"⚠️  Subcategory deletion returned {resp.status_code}")
    
    print(f"\n✅ TEST 3 PASSED: Subcategory with slug + seo working correctly")
    return True

def test_4_surge_rules_collection(token):
    """
    TEST 4: SURGE_RULES collection
    POST/GET/DELETE /api/admin/collection/surge_rules
    Also verify pricing_rules collection still works
    """
    print("\n" + "="*80)
    print("TEST 4: SURGE_RULES collection")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Step 1: POST surge_rules
    surge_data = {
        "name": "Peak",
        "scope": "city",
        "match_value": "Patna",
        "surge_type": "percentage",
        "surge_value": 20,
        "status": "active"
    }
    
    url = f"{BASE_URL}/admin/collection/surge_rules"
    resp = requests.post(url, json=surge_data, headers=headers)
    if resp.status_code not in [200, 201]:
        print(f"❌ POST /admin/collection/surge_rules failed: {resp.status_code} {resp.text}")
        return False
    
    created_surge = resp.json()
    surge_id = created_surge.get("id")
    print(f"✅ POST /admin/collection/surge_rules created surge rule with id: {surge_id}")
    
    # Step 2: GET surge_rules (verify it includes the created rule)
    url = f"{BASE_URL}/admin/collection/surge_rules"
    resp = requests.get(url, headers=headers)
    if resp.status_code != 200:
        print(f"❌ GET /admin/collection/surge_rules failed: {resp.status_code}")
        return False
    
    surge_rules = resp.json()
    found = False
    for rule in surge_rules:
        if rule.get("id") == surge_id:
            found = True
            if rule.get("name") != "Peak" or rule.get("surge_value") != 20:
                print(f"❌ Surge rule data incorrect: {rule}")
                return False
            break
    
    if not found:
        print(f"❌ Created surge rule not found in GET response")
        return False
    
    print(f"✅ GET /admin/collection/surge_rules includes created rule (name='Peak', surge_value=20)")
    
    # Step 3: DELETE surge_rules
    url = f"{BASE_URL}/admin/collection/surge_rules/{surge_id}"
    resp = requests.delete(url, headers=headers)
    if resp.status_code != 200:
        print(f"❌ DELETE /admin/collection/surge_rules/{surge_id} failed: {resp.status_code}")
        return False
    print(f"✅ DELETE /admin/collection/surge_rules/{surge_id} successful")
    
    # Step 4: Verify pricing_rules collection still works (regression)
    url = f"{BASE_URL}/admin/collection/pricing_rules"
    resp = requests.get(url, headers=headers)
    if resp.status_code != 200:
        print(f"❌ GET /admin/collection/pricing_rules failed: {resp.status_code}")
        return False
    print(f"✅ GET /admin/collection/pricing_rules still works (regression check)")
    
    print(f"\n✅ TEST 4 PASSED: SURGE_RULES collection working correctly")
    return True

def test_5_service_tax_ids(token):
    """
    TEST 5: SERVICE tax_ids
    Create service with tax_ids + tax_pct, verify persistence
    Update service with different tax_ids, verify persistence
    """
    print("\n" + "="*80)
    print("TEST 5: SERVICE tax_ids")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Step 1: Get a valid category_id
    url = f"{BASE_URL}/catalog/admin/categories"
    resp = requests.get(url, headers=headers)
    if resp.status_code != 200:
        print(f"❌ GET /catalog/admin/categories failed: {resp.status_code}")
        return False
    
    categories = resp.json()
    if not categories:
        print(f"❌ No categories found")
        return False
    
    category_id = categories[0]["id"]
    print(f"✅ Using category_id: {category_id} ({categories[0]['name']})")
    
    # Step 2: POST service with tax_ids + tax_pct
    service_data = {
        "category_id": category_id,
        "name": "Tax Test Service",
        "short_description": "Service to test tax_ids",
        "base_price": 1000,
        "tax_ids": ["tax-1", "tax-2"],
        "tax_pct": 20,
        "seo": {
            "title": "Tax Test Service",
            "description": "Testing tax_ids field",
            "keywords": "tax, test"
        }
    }
    
    url = f"{BASE_URL}/catalog/services"
    resp = requests.post(url, json=service_data, headers=headers)
    if resp.status_code not in [200, 201]:
        print(f"❌ POST /catalog/services failed: {resp.status_code} {resp.text}")
        return False
    
    created_service = resp.json()
    service_id = created_service.get("id")
    print(f"✅ Service created successfully with id: {service_id}")
    
    # Step 3: GET service (admin) and verify tax_ids + tax_pct persisted
    url = f"{BASE_URL}/catalog/admin/services/{service_id}"
    resp = requests.get(url, headers=headers)
    if resp.status_code != 200:
        print(f"❌ GET /catalog/admin/services/{service_id} failed: {resp.status_code}")
        return False
    
    service = resp.json()
    
    if "tax_ids" not in service:
        print(f"❌ Service does not contain 'tax_ids' field")
        return False
    
    tax_ids = service["tax_ids"]
    if tax_ids != ["tax-1", "tax-2"]:
        print(f"❌ tax_ids not persisted correctly: {tax_ids}, expected ['tax-1', 'tax-2']")
        return False
    
    if service.get("tax_pct") != 20:
        print(f"❌ tax_pct not persisted correctly: {service.get('tax_pct')}, expected 20")
        return False
    
    print(f"✅ GET /catalog/admin/services/{service_id} returns tax_ids=['tax-1', 'tax-2'] and tax_pct=20")
    
    # Step 4: PUT service with different tax_ids + tax_pct
    update_data = {
        "tax_ids": ["tax-1"],
        "tax_pct": 18
    }
    
    url = f"{BASE_URL}/catalog/services/{service_id}"
    resp = requests.put(url, json=update_data, headers=headers)
    if resp.status_code != 200:
        print(f"❌ PUT /catalog/services/{service_id} failed: {resp.status_code} {resp.text}")
        return False
    
    updated_service = resp.json()
    
    if updated_service.get("tax_ids") != ["tax-1"]:
        print(f"❌ Updated tax_ids not persisted correctly: {updated_service.get('tax_ids')}")
        return False
    
    if updated_service.get("tax_pct") != 18:
        print(f"❌ Updated tax_pct not persisted correctly: {updated_service.get('tax_pct')}")
        return False
    
    print(f"✅ PUT /catalog/services/{service_id} updated tax_ids=['tax-1'] and tax_pct=18 successfully")
    
    # Step 5: Clean up - DELETE service
    url = f"{BASE_URL}/catalog/services/{service_id}"
    resp = requests.delete(url, headers=headers)
    if resp.status_code == 200:
        print(f"✅ Service deleted successfully (cleanup)")
    else:
        print(f"⚠️  Service deletion returned {resp.status_code}")
    
    print(f"\n✅ TEST 5 PASSED: SERVICE tax_ids working correctly")
    return True

def test_6_regression(token):
    """
    TEST 6: REGRESSION
    - POST /catalog/services/{id}/duplicate still returns inactive copy
    - Price validation (discounted>base -> 400) still holds
    - GET /catalog/services (public) still returns services with jsonld
    """
    print("\n" + "="*80)
    print("TEST 6: REGRESSION")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Step 1: Test duplicate endpoint
    # Get a service to duplicate
    url = f"{BASE_URL}/catalog/admin/services"
    resp = requests.get(url, headers=headers)
    if resp.status_code != 200:
        print(f"❌ GET /catalog/admin/services failed: {resp.status_code}")
        return False
    
    services = resp.json()
    if not services:
        print(f"❌ No services found")
        return False
    
    source_service_id = services[0]["id"]
    source_service_name = services[0]["name"]
    print(f"✅ Using service for duplication: {source_service_name} (id: {source_service_id})")
    
    # Duplicate the service
    url = f"{BASE_URL}/catalog/services/{source_service_id}/duplicate"
    resp = requests.post(url, headers=headers)
    if resp.status_code not in [200, 201]:
        print(f"❌ POST /catalog/services/{source_service_id}/duplicate failed: {resp.status_code} {resp.text}")
        return False
    
    duplicated = resp.json()
    dup_id = duplicated.get("id")
    
    # Verify status is inactive
    if duplicated.get("status") != "inactive":
        print(f"❌ Duplicated service status is '{duplicated.get('status')}', expected 'inactive'")
        return False
    
    print(f"✅ POST /catalog/services/{source_service_id}/duplicate returns inactive copy (status='inactive')")
    
    # Clean up duplicated service
    url = f"{BASE_URL}/catalog/services/{dup_id}"
    requests.delete(url, headers=headers)
    
    # Step 2: Test price validation (discounted > base -> 400)
    url = f"{BASE_URL}/catalog/admin/categories"
    resp = requests.get(url, headers=headers)
    categories = resp.json()
    category_id = categories[0]["id"]
    
    invalid_service = {
        "category_id": category_id,
        "name": "Invalid Price Test",
        "base_price": 500,
        "discounted_price": 600  # Invalid: discounted > base
    }
    
    url = f"{BASE_URL}/catalog/services"
    resp = requests.post(url, json=invalid_service, headers=headers)
    if resp.status_code != 400:
        print(f"❌ POST with invalid pricing returned {resp.status_code}, expected 400")
        return False
    
    print(f"✅ Price validation (discounted > base) correctly returns 400")
    
    # Step 3: Test GET /catalog/services (public) returns services with jsonld
    url = f"{BASE_URL}/catalog/services"
    resp = requests.get(url)
    if resp.status_code != 200:
        print(f"❌ GET /catalog/services failed: {resp.status_code}")
        return False
    
    public_services = resp.json()
    if not public_services:
        print(f"❌ No public services found")
        return False
    
    # Check first service has jsonld
    first_service = public_services[0]
    service_id = first_service.get("id")
    
    # Get individual service to check jsonld
    url = f"{BASE_URL}/catalog/services/{service_id}"
    resp = requests.get(url)
    if resp.status_code != 200:
        print(f"❌ GET /catalog/services/{service_id} failed: {resp.status_code}")
        return False
    
    service = resp.json()
    if "jsonld" not in service:
        print(f"❌ Public service does not contain 'jsonld'")
        return False
    
    jsonld = service["jsonld"]
    if jsonld.get("@type") != "Service":
        print(f"❌ Service jsonld @type is '{jsonld.get('@type')}', expected 'Service'")
        return False
    
    print(f"✅ GET /catalog/services (public) returns services with jsonld (@type='Service')")
    
    print(f"\n✅ TEST 6 PASSED: Regression tests passed")
    return True

def main():
    print("="*80)
    print("BACKEND API TESTING: Category/Subcategory SEO JSON-LD + tax_ids + surge_rules")
    print("="*80)
    
    # Get admin token
    token = get_admin_token()
    
    # Run tests
    results = {}
    
    # Test 1: Category JSON-LD (public)
    results["test_1_category_jsonld"] = test_1_category_jsonld_public(token)
    
    # Test 2: Category CREATE with SEO + slug
    results["test_2_category_create_seo"] = test_2_category_create_with_seo_slug(token)
    
    # Test 3: Subcategory with slug + seo
    results["test_3_subcategory_seo"] = test_3_subcategory_with_slug_seo(token)
    
    # Test 4: SURGE_RULES collection
    results["test_4_surge_rules"] = test_4_surge_rules_collection(token)
    
    # Test 5: SERVICE tax_ids
    results["test_5_service_tax_ids"] = test_5_service_tax_ids(token)
    
    # Test 6: REGRESSION
    results["test_6_regression"] = test_6_regression(token)
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{test_name}: {status}")
    
    print(f"\nTotal: {passed}/{total} tests passed ({passed*100//total}%)")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
