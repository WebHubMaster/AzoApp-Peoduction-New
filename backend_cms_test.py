#!/usr/bin/env python3
"""
CMS Advanced Redesign — PHASE 1 BACKEND Testing
Tests all CMS endpoints: blogs, FAQs, FAQ categories, pages, sanitization, auth guards
"""
import requests
import json
from datetime import datetime, timedelta, timezone

# Read BASE_URL from frontend/.env
with open('/app/frontend/.env', 'r') as f:
    for line in f:
        if line.startswith('REACT_APP_BACKEND_URL='):
            BASE_URL = line.split('=', 1)[1].strip() + '/api'
            break

print(f"BASE_URL: {BASE_URL}")

# Test credentials
ADMIN_PHONE = "+919000000000"
CUSTOMER_PHONE = "+919000000004"
OTP = "123456"

# Test results
results = {
    "total_tests": 0,
    "passed": 0,
    "failed": 0,
    "tests": []
}

def test(name, condition, details=""):
    """Record test result"""
    results["total_tests"] += 1
    if condition:
        results["passed"] += 1
        status = "✅ PASS"
    else:
        results["failed"] += 1
        status = "❌ FAIL"
    results["tests"].append({"name": name, "passed": condition, "details": details})
    print(f"{status}: {name}")
    if details and not condition:
        print(f"  Details: {details}")

def login(phone):
    """Login and return token"""
    # Request OTP
    r = requests.post(f"{BASE_URL}/auth/request-otp", json={"phone": phone})
    test(f"Request OTP for {phone}", r.status_code == 200, f"Status: {r.status_code}")
    
    # Verify OTP
    r = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    test(f"Verify OTP for {phone}", r.status_code == 200, f"Status: {r.status_code}")
    
    if r.status_code == 200:
        data = r.json()
        return data.get("token")
    return None

print("\n" + "="*80)
print("SETUP: Login as Admin and Customer")
print("="*80)

admin_token = login(ADMIN_PHONE)
customer_token = login(CUSTOMER_PHONE)

admin_headers = {"Authorization": f"Bearer {admin_token}"}
customer_headers = {"Authorization": f"Bearer {customer_token}"}

# ============================================================================
# (A) PUBLIC ENDPOINTS (no auth)
# ============================================================================
print("\n" + "="*80)
print("(A) PUBLIC ENDPOINTS")
print("="*80)

# Test 1: GET /content/faqs/grouped
print("\nTest 1: GET /content/faqs/grouped")
r = requests.get(f"{BASE_URL}/content/faqs/grouped")
test("GET /content/faqs/grouped returns 200", r.status_code == 200, f"Status: {r.status_code}")
if r.status_code == 200:
    data = r.json()
    test("Response is a list", isinstance(data, list), f"Type: {type(data)}")
    if isinstance(data, list) and len(data) > 0:
        first_group = data[0]
        test("First group has 'category' key", "category" in first_group, f"Keys: {first_group.keys()}")
        test("First group has 'faqs' key", "faqs" in first_group, f"Keys: {first_group.keys()}")
        test("'faqs' is a list", isinstance(first_group.get("faqs"), list), f"Type: {type(first_group.get('faqs'))}")

# Test 2: GET /content/faq-categories
print("\nTest 2: GET /content/faq-categories")
r = requests.get(f"{BASE_URL}/content/faq-categories")
test("GET /content/faq-categories returns 200", r.status_code == 200, f"Status: {r.status_code}")
if r.status_code == 200:
    categories = r.json()
    test("Response is a list", isinstance(categories, list), f"Type: {type(categories)}")
    category_names = [c.get("name") for c in categories]
    
    # Check for seeded defaults
    expected_categories = ["General", "Booking", "Pricing", "Payment", "Partner", "Customer", 
                          "Cancellation", "Refund", "Emergency Service", "Visiting Charge", "Account", "Other"]
    found_categories = [cat for cat in expected_categories if cat in category_names]
    test(f"Found {len(found_categories)}/12 seeded categories", len(found_categories) >= 10, 
         f"Found: {found_categories}")

# Test 3: GET /content/blogs (public - only published & due)
print("\nTest 3: GET /content/blogs")
r = requests.get(f"{BASE_URL}/content/blogs")
test("GET /content/blogs returns 200", r.status_code == 200, f"Status: {r.status_code}")
if r.status_code == 200:
    blogs = r.json()
    test("Response is a list", isinstance(blogs, list), f"Type: {type(blogs)}")
    # Check that no drafts or future-scheduled blogs are returned
    for blog in blogs:
        status = blog.get("status", "").lower()
        publish_at = blog.get("publish_at", "")
        now = datetime.now(timezone.utc).isoformat()
        is_draft = status == "draft"
        is_future = publish_at and publish_at > now
        test(f"Blog '{blog.get('title', 'Untitled')[:30]}' is not draft", not is_draft, 
             f"Status: {status}")
        if publish_at:
            test(f"Blog '{blog.get('title', 'Untitled')[:30]}' is not future-scheduled", not is_future, 
                 f"publish_at: {publish_at}, now: {now}")

# Test 4: GET /content/blog/{slug} - test with a non-existent slug first
print("\nTest 4: GET /content/blog/{slug}")
r = requests.get(f"{BASE_URL}/content/blog/non-existent-slug-12345")
test("GET /content/blog/non-existent-slug returns 404", r.status_code == 404, f"Status: {r.status_code}")

# Test 5: GET /site/homepage
print("\nTest 5: GET /site/homepage")
r = requests.get(f"{BASE_URL}/site/homepage")
test("GET /site/homepage returns 200", r.status_code == 200, f"Status: {r.status_code}")
if r.status_code == 200:
    sections = r.json()
    test("Response is a list", isinstance(sections, list), f"Type: {type(sections)}")
    blog_sections = [s for s in sections if s.get("type") in ("blog", "latest_blogs", "blogs", "insights")]
    test("Homepage includes a blog section", len(blog_sections) > 0, 
         f"Found {len(blog_sections)} blog section(s)")
    if blog_sections:
        blog_section = blog_sections[0]
        test("Blog section has 'data' key", "data" in blog_section, f"Keys: {blog_section.keys()}")
        test("Blog section data is a list", isinstance(blog_section.get("data"), list), 
             f"Type: {type(blog_section.get('data'))}")

# ============================================================================
# (B) BLOG CRUD (admin token)
# ============================================================================
print("\n" + "="*80)
print("(B) BLOG CRUD (Admin)")
print("="*80)

# Test 6: POST /admin/blogs with sanitization test
print("\nTest 6: POST /admin/blogs with sanitization")
future_date = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
blog_payload = {
    "title": "My Test Blog!! Special",
    "body": "<p>Hi<script>alert(1)</script><b>b</b><img src=x onerror=alert(1)></p>",
    "category": "Home Appliances",
    "tags": ["a", "b"],
    "status": "published",
    "publish_at": future_date
}

r = requests.post(f"{BASE_URL}/admin/blogs", json=blog_payload, headers=admin_headers)
test("POST /admin/blogs returns 200", r.status_code == 200, f"Status: {r.status_code}")

created_blog = None
if r.status_code == 200:
    created_blog = r.json()
    
    # Check slug auto-generation
    expected_slug = "my-test-blog-special"
    test("Slug auto-generated correctly", created_blog.get("slug") == expected_slug, 
         f"Expected: {expected_slug}, Got: {created_blog.get('slug')}")
    
    # Check status auto-set to 'scheduled' (because publish_at is future)
    test("Status auto-set to 'scheduled'", created_blog.get("status") == "scheduled", 
         f"Status: {created_blog.get('status')}")
    
    # Check body sanitization
    body = created_blog.get("body", "")
    test("Body does NOT contain '<script'", "<script" not in body.lower(), f"Body: {body}")
    test("Body does NOT contain 'onerror'", "onerror" not in body.lower(), f"Body: {body}")
    test("Body DOES contain '<b>'", "<b>" in body, f"Body: {body}")
    test("Body DOES contain '<img'", "<img" in body.lower(), f"Body: {body}")
    test("Body DOES contain 'src'", "src" in body.lower(), f"Body: {body}")

# Test 7: Scheduled blog must NOT appear in public GET /content/blogs
print("\nTest 7: Scheduled blog NOT in public blogs")
r = requests.get(f"{BASE_URL}/content/blogs")
if r.status_code == 200 and created_blog:
    blogs = r.json()
    blog_ids = [b.get("id") for b in blogs]
    test("Scheduled blog NOT in public blogs list", created_blog.get("id") not in blog_ids, 
         f"Blog ID: {created_blog.get('id')}, Found in list: {created_blog.get('id') in blog_ids}")

# Test 8: PUT /admin/blogs/{id} to make it published
print("\nTest 8: PUT /admin/blogs/{id} to publish")
if created_blog:
    blog_id = created_blog.get("id")
    update_payload = {
        "status": "published",
        "publish_at": ""
    }
    r = requests.put(f"{BASE_URL}/admin/blogs/{blog_id}", json=update_payload, headers=admin_headers)
    test("PUT /admin/blogs/{id} returns 200", r.status_code == 200, f"Status: {r.status_code}")
    
    if r.status_code == 200:
        updated_blog = r.json()
        test("Status updated to 'published'", updated_blog.get("status") == "published", 
             f"Status: {updated_blog.get('status')}")
        
        # Now it should appear in public blogs
        r = requests.get(f"{BASE_URL}/content/blogs")
        if r.status_code == 200:
            blogs = r.json()
            blog_ids = [b.get("id") for b in blogs]
            test("Published blog NOW appears in public blogs list", blog_id in blog_ids, 
                 f"Blog ID: {blog_id}, Found in list: {blog_id in blog_ids}")
            
            # Test GET /content/blog/{slug}
            slug = updated_blog.get("slug")
            r = requests.get(f"{BASE_URL}/content/blog/{slug}")
            test(f"GET /content/blog/{slug} returns 200", r.status_code == 200, f"Status: {r.status_code}")
            if r.status_code == 200:
                blog_detail = r.json()
                test("Response has 'blog' key", "blog" in blog_detail, f"Keys: {blog_detail.keys()}")
                test("Response has 'related' key", "related" in blog_detail, f"Keys: {blog_detail.keys()}")
                test("'related' is a list", isinstance(blog_detail.get("related"), list), 
                     f"Type: {type(blog_detail.get('related'))}")
                test("'related' has at most 3 items", len(blog_detail.get("related", [])) <= 3, 
                     f"Count: {len(blog_detail.get('related', []))}")

# Test 9: DELETE /admin/blogs/{id}
print("\nTest 9: DELETE /admin/blogs/{id}")
if created_blog:
    blog_id = created_blog.get("id")
    r = requests.delete(f"{BASE_URL}/admin/blogs/{blog_id}", headers=admin_headers)
    test("DELETE /admin/blogs/{id} returns 200", r.status_code == 200, f"Status: {r.status_code}")
    
    # Verify it's gone
    r = requests.get(f"{BASE_URL}/content/blogs")
    if r.status_code == 200:
        blogs = r.json()
        blog_ids = [b.get("id") for b in blogs]
        test("Deleted blog NOT in public blogs list", blog_id not in blog_ids, 
             f"Blog ID: {blog_id}, Found in list: {blog_id in blog_ids}")

# ============================================================================
# (C) FAQ CRUD (admin)
# ============================================================================
print("\n" + "="*80)
print("(C) FAQ CRUD (Admin)")
print("="*80)

print("\nTest 10: POST /admin/faqs with sanitization")
faq_payload = {
    "question": "Test Q?",
    "answer": "<p>a<script>x</script></p>",
    "category": "Booking",
    "order": 1
}

r = requests.post(f"{BASE_URL}/admin/faqs", json=faq_payload, headers=admin_headers)
test("POST /admin/faqs returns 200", r.status_code == 200, f"Status: {r.status_code}")

created_faq = None
if r.status_code == 200:
    created_faq = r.json()
    
    # Check answer sanitization
    answer = created_faq.get("answer", "")
    test("Answer does NOT contain '<script'", "<script" not in answer.lower(), f"Answer: {answer}")
    
    # Check category stored
    test("Category is 'Booking'", created_faq.get("category") == "Booking", 
         f"Category: {created_faq.get('category')}")

# Test 11: DELETE /admin/faqs/{id}
print("\nTest 11: DELETE /admin/faqs/{id}")
if created_faq:
    faq_id = created_faq.get("id")
    r = requests.delete(f"{BASE_URL}/admin/faqs/{faq_id}", headers=admin_headers)
    test("DELETE /admin/faqs/{id} returns 200", r.status_code == 200, f"Status: {r.status_code}")

# ============================================================================
# (D) FAQ CATEGORIES (admin)
# ============================================================================
print("\n" + "="*80)
print("(D) FAQ CATEGORIES (Admin)")
print("="*80)

print("\nTest 12: POST /admin/faq-categories")
category_payload = {"name": "Warranty"}

r = requests.post(f"{BASE_URL}/admin/faq-categories", json=category_payload, headers=admin_headers)
test("POST /admin/faq-categories returns 200", r.status_code == 200, f"Status: {r.status_code}")

created_category = None
if r.status_code == 200:
    created_category = r.json()
    
    # Check slug auto-generation
    test("Slug auto-generated as 'warranty'", created_category.get("slug") == "warranty", 
         f"Slug: {created_category.get('slug')}")

# Test 13: POST same name again (idempotent)
print("\nTest 13: POST /admin/faq-categories with same name (idempotent)")
r = requests.post(f"{BASE_URL}/admin/faq-categories", json=category_payload, headers=admin_headers)
test("POST same name returns 200", r.status_code == 200, f"Status: {r.status_code}")
if r.status_code == 200:
    returned_category = r.json()
    test("Returns existing category (same ID)", returned_category.get("id") == created_category.get("id"), 
         f"Original ID: {created_category.get('id')}, Returned ID: {returned_category.get('id')}")

# Test 14: GET /admin/faq-categories
print("\nTest 14: GET /admin/faq-categories")
r = requests.get(f"{BASE_URL}/admin/faq-categories", headers=admin_headers)
test("GET /admin/faq-categories returns 200", r.status_code == 200, f"Status: {r.status_code}")
if r.status_code == 200 and created_category:
    categories = r.json()
    category_ids = [c.get("id") for c in categories]
    test("Created category in list", created_category.get("id") in category_ids, 
         f"Category ID: {created_category.get('id')}")

# Test 15: PUT /admin/faq-categories/{id} (rename)
print("\nTest 15: PUT /admin/faq-categories/{id} (rename)")
if created_category:
    category_id = created_category.get("id")
    update_payload = {"name": "Warranty Care"}
    r = requests.put(f"{BASE_URL}/admin/faq-categories/{category_id}", json=update_payload, headers=admin_headers)
    test("PUT /admin/faq-categories/{id} returns 200", r.status_code == 200, f"Status: {r.status_code}")
    if r.status_code == 200:
        updated_category = r.json()
        test("Name updated to 'Warranty Care'", updated_category.get("name") == "Warranty Care", 
             f"Name: {updated_category.get('name')}")

# Test 16: DELETE /admin/faq-categories/{id}
print("\nTest 16: DELETE /admin/faq-categories/{id}")
if created_category:
    category_id = created_category.get("id")
    r = requests.delete(f"{BASE_URL}/admin/faq-categories/{category_id}", headers=admin_headers)
    test("DELETE /admin/faq-categories/{id} returns 200", r.status_code == 200, f"Status: {r.status_code}")

# ============================================================================
# (E) PAGES (admin)
# ============================================================================
print("\n" + "="*80)
print("(E) PAGES (Admin)")
print("="*80)

print("\nTest 17: PUT /admin/pages/about with sanitization")
page_payload = {
    "title": "About AzoApp",
    "body": "<p>About us<script>bad()</script></p>",
    "seo_title": "About",
    "seo_description": "desc"
}

r = requests.put(f"{BASE_URL}/admin/pages/about", json=page_payload, headers=admin_headers)
test("PUT /admin/pages/about returns 200", r.status_code == 200, f"Status: {r.status_code}")

if r.status_code == 200:
    updated_page = r.json()
    
    # Check body sanitization
    body = updated_page.get("body", "")
    test("Body does NOT contain '<script'", "<script" not in body.lower(), f"Body: {body}")
    
    # Check SEO fields
    test("seo_title is 'About'", updated_page.get("seo_title") == "About", 
         f"seo_title: {updated_page.get('seo_title')}")
    test("seo_description is 'desc'", updated_page.get("seo_description") == "desc", 
         f"seo_description: {updated_page.get('seo_description')}")

# Test 18: GET /content/about
print("\nTest 18: GET /content/about")
r = requests.get(f"{BASE_URL}/content/about")
test("GET /content/about returns 200", r.status_code == 200, f"Status: {r.status_code}")
if r.status_code == 200:
    page = r.json()
    body = page.get("body", "")
    test("Body does NOT contain '<script'", "<script" not in body.lower(), f"Body: {body}")
    test("seo_title is 'About'", page.get("seo_title") == "About", 
         f"seo_title: {page.get('seo_title')}")

# ============================================================================
# (F) AUTH GUARDS (customer should get 403 on admin endpoints)
# ============================================================================
print("\n" + "="*80)
print("(F) AUTH GUARDS (Customer)")
print("="*80)

print("\nTest 19: Customer access to admin endpoints")

# Test POST /admin/blogs
r = requests.post(f"{BASE_URL}/admin/blogs", json=blog_payload, headers=customer_headers)
test("Customer POST /admin/blogs returns 403", r.status_code == 403, f"Status: {r.status_code}")

# Test POST /admin/faqs
r = requests.post(f"{BASE_URL}/admin/faqs", json=faq_payload, headers=customer_headers)
test("Customer POST /admin/faqs returns 403", r.status_code == 403, f"Status: {r.status_code}")

# Test POST /admin/faq-categories
r = requests.post(f"{BASE_URL}/admin/faq-categories", json=category_payload, headers=customer_headers)
test("Customer POST /admin/faq-categories returns 403", r.status_code == 403, f"Status: {r.status_code}")

# Test PUT /admin/pages/about
r = requests.put(f"{BASE_URL}/admin/pages/about", json=page_payload, headers=customer_headers)
test("Customer PUT /admin/pages/about returns 403", r.status_code == 403, f"Status: {r.status_code}")

# ============================================================================
# FINAL SUMMARY
# ============================================================================
print("\n" + "="*80)
print("FINAL SUMMARY")
print("="*80)
print(f"Total Tests: {results['total_tests']}")
print(f"Passed: {results['passed']} ✅")
print(f"Failed: {results['failed']} ❌")
print(f"Success Rate: {(results['passed']/results['total_tests']*100):.1f}%")

# Save results to file
with open('/app/test_results_cms.json', 'w') as f:
    json.dump(results, f, indent=2)

print(f"\nDetailed results saved to: /app/test_results_cms.json")

# Exit with error code if any tests failed
if results['failed'] > 0:
    exit(1)
