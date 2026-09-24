#!/usr/bin/env python3
"""
Backend Test: Custom Job → Service Live Notification Hook
Tests the 8-step scenario for feature_custom_job_service_live_notify
"""
import os
import sys
import json
import time
import requests
from datetime import datetime

# Configuration
BASE_URL = os.getenv("REACT_APP_BACKEND_URL", "https://azo-app-staging.preview.emergentagent.com")
API_BASE = f"{BASE_URL}/api"

# Test credentials (from /app/memory/test_credentials.md)
CUSTOMER_PHONE = "+919000000004"
ADMIN_PHONE = "+919000000000"
OTP = "123456"
SERVICEABLE_PINCODE = "800001"

# Test results
results = {
    "test_name": "Custom Job Service Live Notification",
    "timestamp": datetime.now().isoformat(),
    "base_url": API_BASE,
    "steps": [],
    "summary": {
        "total": 8,
        "passed": 0,
        "failed": 0,
        "errors": []
    }
}

def log_step(step_num, description, status, details=None):
    """Log a test step result"""
    step = {
        "step": step_num,
        "description": description,
        "status": status,
        "details": details or {}
    }
    results["steps"].append(step)
    
    status_icon = "✅" if status == "PASS" else "❌"
    print(f"\n{status_icon} Step {step_num}: {description}")
    if details:
        print(f"   Details: {json.dumps(details, indent=2)}")
    
    if status == "PASS":
        results["summary"]["passed"] += 1
    else:
        results["summary"]["failed"] += 1
        results["summary"]["errors"].append(f"Step {step_num}: {description}")

def auth_user(phone):
    """Authenticate a user and return token"""
    try:
        # Send OTP
        resp = requests.post(f"{API_BASE}/auth/send-otp", json={"phone": phone})
        if resp.status_code != 200:
            return None, f"Send OTP failed: {resp.status_code}"
        
        # Verify OTP
        resp = requests.post(f"{API_BASE}/auth/verify-otp", json={"phone": phone, "otp": OTP})
        if resp.status_code != 200:
            return None, f"Verify OTP failed: {resp.status_code}"
        
        data = resp.json()
        return data.get("token"), None
    except Exception as e:
        return None, str(e)

def get_active_category(token):
    """Get an active category for testing"""
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{API_BASE}/catalog/categories", headers=headers)
        if resp.status_code != 200:
            return None, f"Get categories failed: {resp.status_code}"
        
        categories = resp.json()
        if not categories:
            return None, "No active categories found"
        
        return categories[0], None
    except Exception as e:
        return None, str(e)

def main():
    print("=" * 80)
    print("CUSTOM JOB → SERVICE LIVE NOTIFICATION TEST")
    print("=" * 80)
    
    # Authenticate users
    print("\n🔐 Authenticating users...")
    customer_token, err = auth_user(CUSTOMER_PHONE)
    if err:
        log_step(0, "Customer authentication", "FAIL", {"error": err})
        return
    print(f"✓ Customer authenticated: {CUSTOMER_PHONE}")
    
    admin_token, err = auth_user(ADMIN_PHONE)
    if err:
        log_step(0, "Admin authentication", "FAIL", {"error": err})
        return
    print(f"✓ Admin authenticated: {ADMIN_PHONE}")
    
    customer_headers = {"Authorization": f"Bearer {customer_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Get active category
    category, err = get_active_category(customer_token)
    if err:
        log_step(0, "Get active category", "FAIL", {"error": err})
        return
    print(f"✓ Using category: {category.get('name')} ({category.get('id')})")
    
    # STEP 1: Customer creates a custom job
    print("\n" + "=" * 80)
    print("STEP 1: Customer creates a custom job")
    print("=" * 80)
    try:
        custom_job_data = {
            "full_name": "Test Customer",
            "mobile": CUSTOMER_PHONE,
            "work_name": f"Test Service Request {int(time.time())}",
            "description": "This is a test custom job request for automated testing of the service live notification feature.",
            "expected_budget": 500,
            "pincode": SERVICEABLE_PINCODE,
            "category_id": category["id"],
            "idempotency_key": f"test-{int(time.time())}"
        }
        
        resp = requests.post(f"{API_BASE}/custom-jobs", json=custom_job_data, headers=customer_headers)
        
        if resp.status_code != 200:
            log_step(1, "Create custom job", "FAIL", {
                "status_code": resp.status_code,
                "response": resp.text[:500]
            })
            return
        
        job = resp.json()
        job_id = job.get("id")
        request_id = job.get("request_id")
        customer_id = job.get("customer_id")
        
        log_step(1, "Create custom job", "PASS", {
            "job_id": job_id,
            "request_id": request_id,
            "customer_id": customer_id,
            "work_name": job.get("work_name")
        })
    except Exception as e:
        log_step(1, "Create custom job", "FAIL", {"error": str(e)})
        return
    
    # STEP 2: Admin converts custom job to service
    print("\n" + "=" * 80)
    print("STEP 2: Admin converts custom job to service")
    print("=" * 80)
    try:
        resp = requests.post(f"{API_BASE}/custom-jobs/{job_id}/convert", headers=admin_headers)
        
        if resp.status_code != 200:
            log_step(2, "Convert custom job to service", "FAIL", {
                "status_code": resp.status_code,
                "response": resp.text[:500]
            })
            return
        
        convert_result = resp.json()
        service_id = convert_result.get("service_id")
        service = convert_result.get("service", {})
        
        # Verify service is draft/inactive
        if service.get("status") != "inactive":
            log_step(2, "Convert custom job to service", "FAIL", {
                "error": f"Expected service status 'inactive', got '{service.get('status')}'"
            })
            return
        
        # Confirm service is NOT in public catalog
        resp_public = requests.get(f"{API_BASE}/catalog/services")
        public_services = resp_public.json() if resp_public.status_code == 200 else []
        service_in_public = any(s.get("id") == service_id for s in public_services)
        
        log_step(2, "Convert custom job to service", "PASS", {
            "service_id": service_id,
            "service_name": service.get("name"),
            "service_status": service.get("status"),
            "in_public_catalog": service_in_public
        })
    except Exception as e:
        log_step(2, "Convert custom job to service", "FAIL", {"error": str(e)})
        return
    
    # STEP 3: Record customer notification count BEFORE activation
    print("\n" + "=" * 80)
    print("STEP 3: Record customer notification count BEFORE activation")
    print("=" * 80)
    try:
        resp = requests.get(f"{API_BASE}/notifications", headers=customer_headers)
        
        if resp.status_code != 200:
            log_step(3, "Get customer notifications (before)", "FAIL", {
                "status_code": resp.status_code,
                "response": resp.text[:500]
            })
            return
        
        notifications_before = resp.json()
        count_before = len(notifications_before)
        
        log_step(3, "Get customer notifications (before)", "PASS", {
            "notification_count": count_before
        })
    except Exception as e:
        log_step(3, "Get customer notifications (before)", "FAIL", {"error": str(e)})
        return
    
    # STEP 4: Admin activates the service
    print("\n" + "=" * 80)
    print("STEP 4: Admin activates the service")
    print("=" * 80)
    try:
        resp = requests.put(
            f"{API_BASE}/catalog/services/{service_id}",
            json={"status": "active"},
            headers=admin_headers
        )
        
        if resp.status_code != 200:
            log_step(4, "Activate service", "FAIL", {
                "status_code": resp.status_code,
                "response": resp.text[:500]
            })
            return
        
        updated_service = resp.json()
        
        if updated_service.get("status") != "active":
            log_step(4, "Activate service", "FAIL", {
                "error": f"Expected service status 'active', got '{updated_service.get('status')}'"
            })
            return
        
        log_step(4, "Activate service", "PASS", {
            "service_id": service_id,
            "service_status": updated_service.get("status")
        })
        
        # Give notification system a moment to process
        time.sleep(2)
    except Exception as e:
        log_step(4, "Activate service", "FAIL", {"error": str(e)})
        return
    
    # STEP 5: Verify customer received notification
    print("\n" + "=" * 80)
    print("STEP 5: Verify customer received 'service live' notification")
    print("=" * 80)
    try:
        resp = requests.get(f"{API_BASE}/notifications", headers=customer_headers)
        
        if resp.status_code != 200:
            log_step(5, "Verify service live notification", "FAIL", {
                "status_code": resp.status_code,
                "response": resp.text[:500]
            })
            return
        
        notifications_after = resp.json()
        count_after = len(notifications_after)
        
        # Find the new notification
        new_notification = None
        for notif in notifications_after:
            data = notif.get("data", {})
            if (data.get("event") == "custom_job_service_live" and 
                data.get("service_id") == service_id):
                new_notification = notif
                break
        
        if not new_notification:
            log_step(5, "Verify service live notification", "FAIL", {
                "error": "No notification with event 'custom_job_service_live' found",
                "count_before": count_before,
                "count_after": count_after,
                "new_count": count_after - count_before
            })
            return
        
        # Verify notification details
        title = new_notification.get("title", "")
        link = new_notification.get("link", "")
        data = new_notification.get("data", {})
        event = data.get("event", "")
        
        checks = {
            "title_contains_now_live": "now live" in title.lower(),
            "link_correct": link == f"/service/{service_id}",
            "event_correct": event == "custom_job_service_live",
            "data_has_service_id": data.get("service_id") == service_id
        }
        
        all_checks_passed = all(checks.values())
        
        log_step(5, "Verify service live notification", "PASS" if all_checks_passed else "FAIL", {
            "notification_found": True,
            "title": title,
            "link": link,
            "event": event,
            "data": data,
            "checks": checks,
            "count_before": count_before,
            "count_after": count_after
        })
        
        if not all_checks_passed:
            return
    except Exception as e:
        log_step(5, "Verify service live notification", "FAIL", {"error": str(e)})
        return
    
    # STEP 6: Verify custom job audit and service in public catalog
    print("\n" + "=" * 80)
    print("STEP 6: Verify custom job audit and service in public catalog")
    print("=" * 80)
    try:
        # Check custom job audit
        resp = requests.get(f"{API_BASE}/custom-jobs/{job_id}", headers=admin_headers)
        
        if resp.status_code != 200:
            log_step(6, "Verify custom job audit and public catalog", "FAIL", {
                "status_code": resp.status_code,
                "response": resp.text[:500]
            })
            return
        
        job_detail = resp.json()
        audit = job_detail.get("audit", [])
        display_status = job_detail.get("display_status")
        
        # Find service_activated audit entry
        service_activated_audit = None
        for entry in audit:
            if entry.get("action") == "service_activated":
                service_activated_audit = entry
                break
        
        # Check if service is in public catalog
        resp_public = requests.get(f"{API_BASE}/catalog/services")
        public_services = resp_public.json() if resp_public.status_code == 200 else []
        service_in_public = any(s.get("id") == service_id for s in public_services)
        
        checks = {
            "has_service_activated_audit": service_activated_audit is not None,
            "display_status_is_service_active": display_status == "service_active",
            "service_in_public_catalog": service_in_public
        }
        
        all_checks_passed = all(checks.values())
        
        log_step(6, "Verify custom job audit and public catalog", "PASS" if all_checks_passed else "FAIL", {
            "checks": checks,
            "display_status": display_status,
            "service_activated_audit": service_activated_audit,
            "service_in_public": service_in_public
        })
        
        if not all_checks_passed:
            return
    except Exception as e:
        log_step(6, "Verify custom job audit and public catalog", "FAIL", {"error": str(e)})
        return
    
    # STEP 7: Test idempotency - activate again
    print("\n" + "=" * 80)
    print("STEP 7: Test idempotency - activate service again")
    print("=" * 80)
    try:
        # Get current notification count
        resp = requests.get(f"{API_BASE}/notifications", headers=customer_headers)
        notifications_before_reactivate = resp.json() if resp.status_code == 200 else []
        count_before_reactivate = len(notifications_before_reactivate)
        
        # Activate again (or update while active)
        resp = requests.put(
            f"{API_BASE}/catalog/services/{service_id}",
            json={"status": "active"},
            headers=admin_headers
        )
        
        if resp.status_code != 200:
            log_step(7, "Test idempotency", "FAIL", {
                "status_code": resp.status_code,
                "response": resp.text[:500]
            })
            return
        
        # Wait a moment
        time.sleep(2)
        
        # Check notification count again
        resp = requests.get(f"{API_BASE}/notifications", headers=customer_headers)
        notifications_after_reactivate = resp.json() if resp.status_code == 200 else []
        count_after_reactivate = len(notifications_after_reactivate)
        
        # Count should NOT increase
        notification_count_unchanged = count_after_reactivate == count_before_reactivate
        
        log_step(7, "Test idempotency", "PASS" if notification_count_unchanged else "FAIL", {
            "count_before_reactivate": count_before_reactivate,
            "count_after_reactivate": count_after_reactivate,
            "notification_count_unchanged": notification_count_unchanged
        })
        
        if not notification_count_unchanged:
            return
    except Exception as e:
        log_step(7, "Test idempotency", "FAIL", {"error": str(e)})
        return
    
    # STEP 8: Verify normal service activation does NOT create notification
    print("\n" + "=" * 80)
    print("STEP 8: Verify normal service activation does NOT create notification")
    print("=" * 80)
    try:
        # Get current notification count
        resp = requests.get(f"{API_BASE}/notifications", headers=customer_headers)
        notifications_before_normal = resp.json() if resp.status_code == 200 else []
        count_before_normal = len(notifications_before_normal)
        
        # Create a normal service (not from custom job)
        normal_service_data = {
            "category_id": category["id"],
            "name": f"Normal Test Service {int(time.time())}",
            "short_description": "Test service",
            "description": "This is a normal service not from a custom job",
            "base_price": 300,
            "status": "inactive"
        }
        
        resp = requests.post(f"{API_BASE}/catalog/services", json=normal_service_data, headers=admin_headers)
        
        if resp.status_code != 200:
            log_step(8, "Verify normal service does NOT notify", "FAIL", {
                "error": "Failed to create normal service",
                "status_code": resp.status_code
            })
            return
        
        normal_service = resp.json()
        normal_service_id = normal_service.get("id")
        
        # Activate the normal service
        resp = requests.put(
            f"{API_BASE}/catalog/services/{normal_service_id}",
            json={"status": "active"},
            headers=admin_headers
        )
        
        if resp.status_code != 200:
            log_step(8, "Verify normal service does NOT notify", "FAIL", {
                "error": "Failed to activate normal service",
                "status_code": resp.status_code
            })
            return
        
        # Wait a moment
        time.sleep(2)
        
        # Check notification count
        resp = requests.get(f"{API_BASE}/notifications", headers=customer_headers)
        notifications_after_normal = resp.json() if resp.status_code == 200 else []
        count_after_normal = len(notifications_after_normal)
        
        # Check if any new notification is for this normal service
        has_notification_for_normal = False
        for notif in notifications_after_normal:
            data = notif.get("data", {})
            if (data.get("event") == "custom_job_service_live" and 
                data.get("service_id") == normal_service_id):
                has_notification_for_normal = True
                break
        
        no_notification_created = not has_notification_for_normal
        
        log_step(8, "Verify normal service does NOT notify", "PASS" if no_notification_created else "FAIL", {
            "normal_service_id": normal_service_id,
            "count_before": count_before_normal,
            "count_after": count_after_normal,
            "has_notification_for_normal_service": has_notification_for_normal,
            "no_notification_created": no_notification_created
        })
    except Exception as e:
        log_step(8, "Verify normal service does NOT notify", "FAIL", {"error": str(e)})
        return
    
    # Final summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Total steps: {results['summary']['total']}")
    print(f"Passed: {results['summary']['passed']}")
    print(f"Failed: {results['summary']['failed']}")
    
    if results['summary']['failed'] > 0:
        print("\n❌ FAILED STEPS:")
        for error in results['summary']['errors']:
            print(f"  - {error}")
    else:
        print("\n✅ ALL TESTS PASSED!")
    
    # Save results to file
    output_file = "/app/test_results_custom_job_service_live_notify.json"
    with open(output_file, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n📄 Full results saved to: {output_file}")
    
    return results['summary']['failed'] == 0

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
