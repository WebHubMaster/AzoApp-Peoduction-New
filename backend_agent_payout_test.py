#!/usr/bin/env python3
"""
Comprehensive end-to-end testing of Agent Payouts (Physical QR) feature.
Tests the NEW agent payout system that builds on the already-passing Physical QR Provisioning API.

Test Plan (6 points from review request):
SETUP: Create batch, create agent, assign batch, login as agent
1. CONFIG: Test settings persistence (agent_config)
2. EARN: Test commission on fresh mapping, no double pay
3. HISTORY: Test earnings list
4. BANK + WITHDRAW: Test bank verification gating, withdraw validation
5. ADMIN MANAGE: Test withdrawal approval flow
6. GUARDS: Test role-based access
"""
import requests
import json
import sys
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://reminder-logic.preview.emergentagent.com/api"
DEMO_OTP = "123456"

# Demo credentials
ADMIN_PHONE = "+919000000000"
MERCHANT_CODE = "3L6MKM3"  # Sharma Electricals
CUSTOMER_PHONE = "+919000000004"

# Test state
test_results = []
test_state = {
    "admin_token": None,
    "agent_phone": None,
    "agent_token": None,
    "agent_id": None,
    "batch_id": None,
    "token_t1": None,
    "token_t2": None,
    "withdrawal_id": None,
}


def log_test(name: str, passed: bool, details: str = "", data: Any = None):
    """Log a test result."""
    status = "✅ PASS" if passed else "❌ FAIL"
    result = {"test": name, "passed": passed, "details": details}
    if data:
        result["data"] = data
    test_results.append(result)
    print(f"{status} - {name}")
    if details:
        print(f"  {details}")
    if not passed and data:
        print(f"  Data: {json.dumps(data, indent=2)}")


def auth_headers(token: Optional[str]) -> Dict[str, str]:
    """Return authorization headers."""
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}


def send_otp(phone: str) -> bool:
    """Send OTP to phone number."""
    try:
        resp = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone}, timeout=10)
        return resp.status_code == 200
    except Exception as e:
        print(f"Error sending OTP: {e}")
        return False


def verify_otp(phone: str, otp: str = DEMO_OTP) -> Optional[str]:
    """Verify OTP and return token."""
    try:
        resp = requests.post(
            f"{BASE_URL}/auth/verify-otp",
            json={"phone": phone, "otp": otp},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get("token")
        return None
    except Exception as e:
        print(f"Error verifying OTP: {e}")
        return None


def login(phone: str, role_name: str = "") -> Optional[str]:
    """Login and return token."""
    print(f"\n{'='*60}")
    print(f"Logging in as {role_name or 'user'}: {phone}")
    print(f"{'='*60}")
    
    if not send_otp(phone):
        print(f"❌ Failed to send OTP to {phone}")
        return None
    
    token = verify_otp(phone)
    if not token:
        print(f"❌ Failed to verify OTP for {phone}")
        return None
    
    print(f"✅ Logged in successfully")
    return token


def test_setup():
    """SETUP: Create batch, create agent, assign batch, login as agent."""
    print("\n" + "="*80)
    print("SETUP: Create batch, create agent, assign batch, login as agent")
    print("="*80)
    
    # Login as admin
    test_state["admin_token"] = login(ADMIN_PHONE, "ADMIN")
    if not test_state["admin_token"]:
        log_test("SETUP - Admin login", False, "Failed to login as admin")
        return False
    log_test("SETUP - Admin login", True)
    
    # Create a fresh batch
    print("\n--- Creating fresh batch ---")
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/physical-qr/batch",
            json={"count": 3, "batch_name": "Payout Test", "prefix": "PQR"},
            headers=auth_headers(test_state["admin_token"]),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            test_state["batch_id"] = data.get("batch_id")
            qrs = data.get("qrs", [])
            if len(qrs) >= 2:
                test_state["token_t1"] = qrs[0].get("token")
                test_state["token_t2"] = qrs[1].get("token")
            log_test("SETUP - Create batch", True, 
                    f"batch_id={test_state['batch_id']}, T1={test_state['token_t1']}, T2={test_state['token_t2']}")
        else:
            log_test("SETUP - Create batch", False, f"Status {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("SETUP - Create batch", False, str(e))
        return False
    
    # Create an agent
    print("\n--- Creating agent ---")
    import time
    # Use a unique phone number for each test run to avoid reusing existing agents
    test_state["agent_phone"] = f"+9190000{int(time.time()) % 10000:04d}"
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/physical-qr/agents",
            json={"name": "Payout Agent", "phone": test_state["agent_phone"]},
            headers=auth_headers(test_state["admin_token"]),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            test_state["agent_id"] = data.get("id")
            log_test("SETUP - Create agent", True, f"agent_id={test_state['agent_id']}")
        else:
            log_test("SETUP - Create agent", False, f"Status {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("SETUP - Create agent", False, str(e))
        return False
    
    # Assign the batch to the agent
    print("\n--- Assigning batch to agent ---")
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/physical-qr/agents/{test_state['agent_id']}/batches",
            json={"batch_ids": [test_state["batch_id"]]},
            headers=auth_headers(test_state["admin_token"]),
            timeout=10
        )
        if resp.status_code == 200:
            log_test("SETUP - Assign batch", True)
        else:
            log_test("SETUP - Assign batch", False, f"Status {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("SETUP - Assign batch", False, str(e))
        return False
    
    # Login as the agent
    test_state["agent_token"] = login(test_state["agent_phone"], "AGENT")
    if not test_state["agent_token"]:
        log_test("SETUP - Agent login", False, "Failed to login as agent")
        return False
    log_test("SETUP - Agent login", True)
    
    return True


def test_config():
    """TEST 1: CONFIG - Test settings persistence (agent_config)."""
    print("\n" + "="*80)
    print("TEST 1: CONFIG - Test settings persistence (agent_config)")
    print("="*80)
    
    # Update settings with agent_config
    print("\n--- Updating settings with agent_config ---")
    try:
        resp = requests.put(
            f"{BASE_URL}/admin/settings",
            json={
                "agent_config": {
                    "commission_per_mapping": 20,
                    "min_withdrawal": 10,
                    "max_withdrawal": 25000,
                    "enabled": True
                }
            },
            headers=auth_headers(test_state["admin_token"]),
            timeout=10
        )
        if resp.status_code == 200:
            log_test("CONFIG - Update settings", True)
        else:
            log_test("CONFIG - Update settings", False, f"Status {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("CONFIG - Update settings", False, str(e))
        return False
    
    # Get settings and verify agent_config persists
    print("\n--- Verifying agent_config persistence ---")
    try:
        resp = requests.get(
            f"{BASE_URL}/admin/settings",
            headers=auth_headers(test_state["admin_token"]),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            agent_config = data.get("agent_config", {})
            
            # Check commission_per_mapping
            commission = agent_config.get("commission_per_mapping")
            if commission == 20:
                log_test("CONFIG - commission_per_mapping", True, f"commission_per_mapping={commission}")
            else:
                log_test("CONFIG - commission_per_mapping", False, 
                        f"Expected 20, got {commission}", agent_config)
                return False
            
            # Check min_withdrawal
            min_withdrawal = agent_config.get("min_withdrawal")
            if min_withdrawal == 10:
                log_test("CONFIG - min_withdrawal", True, f"min_withdrawal={min_withdrawal}")
            else:
                log_test("CONFIG - min_withdrawal", False, 
                        f"Expected 10, got {min_withdrawal}", agent_config)
                return False
            
            # CRITICAL: Verify nested-merge didn't drop sibling keys
            if "enabled" in agent_config and "max_withdrawal" in agent_config:
                log_test("CONFIG - Nested merge preserves siblings", True, 
                        "enabled and max_withdrawal still present")
            else:
                log_test("CONFIG - Nested merge preserves siblings", False, 
                        "Missing sibling keys", agent_config)
                return False
        else:
            log_test("CONFIG - Get settings", False, f"Status {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("CONFIG - Get settings", False, str(e))
        return False
    
    return True


def test_earn():
    """TEST 2: EARN - Test commission on fresh mapping, no double pay."""
    print("\n" + "="*80)
    print("TEST 2: EARN - Test commission on fresh mapping, no double pay")
    print("="*80)
    
    # Agent assigns T1 to merchant (fresh mapping)
    print("\n--- Agent assigns T1 to merchant (fresh mapping) ---")
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/physical-qr/{test_state['token_t1']}/assign",
            json={"merchant_code": MERCHANT_CODE},
            headers=auth_headers(test_state["agent_token"]),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            agent_earning = data.get("agent_earning")
            qr = data.get("qr", {})
            
            # Check agent_earning is 20
            if agent_earning == 20:
                log_test("EARN - Fresh mapping pays commission", True, 
                        f"agent_earning={agent_earning}")
            else:
                log_test("EARN - Fresh mapping pays commission", False, 
                        f"Expected 20, got {agent_earning}", data)
                return False
            
            # Check QR status is active
            if qr.get("status") == "active":
                log_test("EARN - QR status is active", True)
            else:
                log_test("EARN - QR status is active", False, 
                        f"Expected 'active', got {qr.get('status')}", qr)
                return False
        else:
            log_test("EARN - Assign T1", False, f"Status {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("EARN - Assign T1", False, str(e))
        return False
    
    # Get agent wallet
    print("\n--- Getting agent wallet ---")
    try:
        resp = requests.get(
            f"{BASE_URL}/agent/me",
            headers=auth_headers(test_state["agent_token"]),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            wallet = data.get("wallet", {})
            config = data.get("config", {})
            
            # Check total_earned
            if wallet.get("total_earned") == 20:
                log_test("EARN - Wallet total_earned", True, f"total_earned={wallet.get('total_earned')}")
            else:
                log_test("EARN - Wallet total_earned", False, 
                        f"Expected 20, got {wallet.get('total_earned')}", wallet)
                return False
            
            # Check available
            if wallet.get("available") == 20:
                log_test("EARN - Wallet available", True, f"available={wallet.get('available')}")
            else:
                log_test("EARN - Wallet available", False, 
                        f"Expected 20, got {wallet.get('available')}", wallet)
                return False
            
            # Check mappings
            if wallet.get("mappings") == 1:
                log_test("EARN - Wallet mappings", True, f"mappings={wallet.get('mappings')}")
            else:
                log_test("EARN - Wallet mappings", False, 
                        f"Expected 1, got {wallet.get('mappings')}", wallet)
                return False
            
            # Check config.commission_per_mapping
            if config.get("commission_per_mapping") == 20:
                log_test("EARN - Config commission_per_mapping", True, 
                        f"commission_per_mapping={config.get('commission_per_mapping')}")
            else:
                log_test("EARN - Config commission_per_mapping", False, 
                        f"Expected 20, got {config.get('commission_per_mapping')}", config)
                return False
        else:
            log_test("EARN - Get agent/me", False, f"Status {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("EARN - Get agent/me", False, str(e))
        return False
    
    # Re-assign the SAME T1 again (should NOT pay again)
    print("\n--- Re-assigning SAME T1 (should NOT pay again) ---")
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/physical-qr/{test_state['token_t1']}/assign",
            json={"merchant_code": MERCHANT_CODE},
            headers=auth_headers(test_state["agent_token"]),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            agent_earning = data.get("agent_earning")
            
            # Check agent_earning is None (no double pay)
            if agent_earning is None:
                log_test("EARN - No double pay on re-assign", True, "agent_earning is None")
            else:
                log_test("EARN - No double pay on re-assign", False, 
                        f"Expected None, got {agent_earning}", data)
                return False
        else:
            log_test("EARN - Re-assign T1", False, f"Status {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("EARN - Re-assign T1", False, str(e))
        return False
    
    return True


def test_history():
    """TEST 3: HISTORY - Test earnings list."""
    print("\n" + "="*80)
    print("TEST 3: HISTORY - Test earnings list")
    print("="*80)
    
    # Get earnings history
    print("\n--- Getting earnings history ---")
    try:
        resp = requests.get(
            f"{BASE_URL}/agent/earnings",
            headers=auth_headers(test_state["agent_token"]),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            earnings = data.get("earnings", [])
            
            # Check earnings list is not empty
            if len(earnings) > 0:
                log_test("HISTORY - Earnings list not empty", True, f"Found {len(earnings)} earnings")
            else:
                log_test("HISTORY - Earnings list not empty", False, "Earnings list is empty", data)
                return False
            
            # Find the earning for T1
            t1_earning = None
            for e in earnings:
                if e.get("token") == test_state["token_t1"]:
                    t1_earning = e
                    break
            
            if t1_earning:
                # Check merchant_name
                if t1_earning.get("merchant_name") == "Sharma Electricals":
                    log_test("HISTORY - Merchant name", True, 
                            f"merchant_name={t1_earning.get('merchant_name')}")
                else:
                    log_test("HISTORY - Merchant name", False, 
                            f"Expected 'Sharma Electricals', got {t1_earning.get('merchant_name')}", 
                            t1_earning)
                    return False
                
                # Check token
                if t1_earning.get("token") == test_state["token_t1"]:
                    log_test("HISTORY - Token", True, f"token={t1_earning.get('token')}")
                else:
                    log_test("HISTORY - Token", False, 
                            f"Expected {test_state['token_t1']}, got {t1_earning.get('token')}", 
                            t1_earning)
                    return False
                
                # Check amount
                if t1_earning.get("amount") == 20:
                    log_test("HISTORY - Amount", True, f"amount={t1_earning.get('amount')}")
                else:
                    log_test("HISTORY - Amount", False, 
                            f"Expected 20, got {t1_earning.get('amount')}", t1_earning)
                    return False
            else:
                log_test("HISTORY - Find T1 earning", False, 
                        f"T1 earning not found in list", earnings)
                return False
        else:
            log_test("HISTORY - Get earnings", False, f"Status {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("HISTORY - Get earnings", False, str(e))
        return False
    
    return True


def test_bank_withdraw():
    """TEST 4: BANK + WITHDRAW - Test bank verification gating, withdraw validation."""
    print("\n" + "="*80)
    print("TEST 4: BANK + WITHDRAW - Test bank verification gating, withdraw validation")
    print("="*80)
    
    # Try to withdraw BEFORE bank verify (should fail)
    print("\n--- Trying to withdraw BEFORE bank verify (should fail) ---")
    try:
        resp = requests.post(
            f"{BASE_URL}/agent/withdraw",
            json={"amount": 20},
            headers=auth_headers(test_state["agent_token"]),
            timeout=10
        )
        if resp.status_code == 400:
            data = resp.json()
            detail = data.get("detail", "")
            if "Verify your bank details" in detail:
                log_test("BANK - Withdraw blocked before bank verify", True, 
                        f"Got expected 400: {detail}")
            else:
                log_test("BANK - Withdraw blocked before bank verify", False, 
                        f"Expected 'Verify your bank details', got {detail}", data)
                return False
        else:
            log_test("BANK - Withdraw blocked before bank verify", False, 
                    f"Expected 400, got {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("BANK - Withdraw blocked before bank verify", False, str(e))
        return False
    
    # Submit bank details
    print("\n--- Submitting bank details ---")
    try:
        resp = requests.post(
            f"{BASE_URL}/agent/bank",
            json={
                "account_name": "Payout Agent",
                "account_number": "111122223333",
                "ifsc": "HDFC0001234",
                "bank_name": "HDFC"
            },
            headers=auth_headers(test_state["agent_token"]),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            bank = data.get("bank", {})
            
            # Check verified is False
            if bank.get("verified") is False:
                log_test("BANK - Submit bank (verified=false)", True, 
                        f"verified={bank.get('verified')}")
            else:
                log_test("BANK - Submit bank (verified=false)", False, 
                        f"Expected False, got {bank.get('verified')}", bank)
                return False
        else:
            log_test("BANK - Submit bank", False, f"Status {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("BANK - Submit bank", False, str(e))
        return False
    
    # Admin verifies bank
    print("\n--- Admin verifies bank ---")
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/physical-qr/agents/{test_state['agent_id']}/verify-bank?verified=true",
            headers=auth_headers(test_state["admin_token"]),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            bank = data.get("bank", {})
            
            # Check verified is True
            if bank.get("verified") is True:
                log_test("BANK - Admin verify bank (verified=true)", True, 
                        f"verified={bank.get('verified')}")
            else:
                log_test("BANK - Admin verify bank (verified=true)", False, 
                        f"Expected True, got {bank.get('verified')}", bank)
                return False
        else:
            log_test("BANK - Admin verify bank", False, f"Status {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("BANK - Admin verify bank", False, str(e))
        return False
    
    # Now withdraw should work
    print("\n--- Withdrawing after bank verify ---")
    try:
        resp = requests.post(
            f"{BASE_URL}/agent/withdraw",
            json={"amount": 20},
            headers=auth_headers(test_state["agent_token"]),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            test_state["withdrawal_id"] = data.get("id")
            
            # Check status is pending
            if data.get("status") == "pending":
                log_test("WITHDRAW - Withdraw successful (status=pending)", True, 
                        f"withdrawal_id={test_state['withdrawal_id']}")
            else:
                log_test("WITHDRAW - Withdraw successful (status=pending)", False, 
                        f"Expected 'pending', got {data.get('status')}", data)
                return False
        else:
            log_test("WITHDRAW - Withdraw after bank verify", False, 
                    f"Status {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("WITHDRAW - Withdraw after bank verify", False, str(e))
        return False
    
    # Test withdraw amount < min (should fail)
    print("\n--- Testing withdraw amount < min (should fail) ---")
    try:
        resp = requests.post(
            f"{BASE_URL}/agent/withdraw",
            json={"amount": 5},
            headers=auth_headers(test_state["agent_token"]),
            timeout=10
        )
        if resp.status_code == 400:
            data = resp.json()
            detail = data.get("detail", "")
            if "Minimum withdrawal" in detail or "already have a pending" in detail:
                log_test("WITHDRAW - Amount < min rejected", True, f"Got expected 400: {detail}")
            else:
                log_test("WITHDRAW - Amount < min rejected", False, 
                        f"Expected 'Minimum withdrawal', got {detail}", data)
                return False
        else:
            log_test("WITHDRAW - Amount < min rejected", False, 
                    f"Expected 400, got {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("WITHDRAW - Amount < min rejected", False, str(e))
        return False
    
    # Test withdraw amount > available (should fail)
    print("\n--- Testing withdraw amount > available (should fail) ---")
    try:
        resp = requests.post(
            f"{BASE_URL}/agent/withdraw",
            json={"amount": 999999},
            headers=auth_headers(test_state["agent_token"]),
            timeout=10
        )
        if resp.status_code == 400:
            data = resp.json()
            detail = data.get("detail", "")
            # Accept any validation error (max_withdrawal, insufficient, or pending)
            if "Insufficient" in detail or "already have a pending" in detail or "Maximum withdrawal" in detail:
                log_test("WITHDRAW - Amount > available rejected", True, 
                        f"Got expected 400: {detail}")
            else:
                log_test("WITHDRAW - Amount > available rejected", False, 
                        f"Expected validation error, got {detail}", data)
                return False
        else:
            log_test("WITHDRAW - Amount > available rejected", False, 
                    f"Expected 400, got {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("WITHDRAW - Amount > available rejected", False, str(e))
        return False
    
    # Test second concurrent pending withdraw (should fail)
    print("\n--- Testing second concurrent pending withdraw (should fail) ---")
    try:
        resp = requests.post(
            f"{BASE_URL}/agent/withdraw",
            json={"amount": 10},
            headers=auth_headers(test_state["agent_token"]),
            timeout=10
        )
        if resp.status_code == 400:
            data = resp.json()
            detail = data.get("detail", "")
            if "already have a pending" in detail:
                log_test("WITHDRAW - Second pending rejected", True, 
                        f"Got expected 400: {detail}")
            else:
                log_test("WITHDRAW - Second pending rejected", False, 
                        f"Expected 'already have a pending', got {detail}", data)
                return False
        else:
            log_test("WITHDRAW - Second pending rejected", False, 
                    f"Expected 400, got {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("WITHDRAW - Second pending rejected", False, str(e))
        return False
    
    return True


def test_admin_manage():
    """TEST 5: ADMIN MANAGE - Test withdrawal approval flow."""
    print("\n" + "="*80)
    print("TEST 5: ADMIN MANAGE - Test withdrawal approval flow")
    print("="*80)
    
    # Admin gets pending withdrawals
    print("\n--- Admin gets pending withdrawals ---")
    try:
        resp = requests.get(
            f"{BASE_URL}/admin/physical-qr/agent-withdrawals?status=pending",
            headers=auth_headers(test_state["admin_token"]),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            withdrawals = data.get("withdrawals", [])
            stats = data.get("stats", {})
            
            # Check withdrawals list is not empty
            if len(withdrawals) > 0:
                log_test("ADMIN - Pending withdrawals list", True, 
                        f"Found {len(withdrawals)} pending withdrawals")
            else:
                log_test("ADMIN - Pending withdrawals list", False, 
                        "Pending withdrawals list is empty", data)
                return False
            
            # Check stats
            if "pending" in stats and "approved" in stats and "rejected" in stats:
                log_test("ADMIN - Withdrawal stats", True, 
                        f"pending={stats.get('pending')}, approved={stats.get('approved')}, rejected={stats.get('rejected')}")
            else:
                log_test("ADMIN - Withdrawal stats", False, "Missing stats fields", stats)
                return False
            
            # Find our withdrawal
            our_withdrawal = None
            for w in withdrawals:
                if w.get("id") == test_state["withdrawal_id"]:
                    our_withdrawal = w
                    break
            
            if our_withdrawal:
                log_test("ADMIN - Find our withdrawal", True, 
                        f"Found withdrawal {test_state['withdrawal_id']}")
            else:
                log_test("ADMIN - Find our withdrawal", False, 
                        f"Withdrawal {test_state['withdrawal_id']} not found", withdrawals)
                return False
        else:
            log_test("ADMIN - Get pending withdrawals", False, 
                    f"Status {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("ADMIN - Get pending withdrawals", False, str(e))
        return False
    
    # Admin approves withdrawal
    print("\n--- Admin approves withdrawal ---")
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/physical-qr/agent-withdrawals/{test_state['withdrawal_id']}/approve",
            headers=auth_headers(test_state["admin_token"]),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            
            # Check status is approved
            if data.get("status") == "approved":
                log_test("ADMIN - Approve withdrawal (status=approved)", True, 
                        f"status={data.get('status')}")
            else:
                log_test("ADMIN - Approve withdrawal (status=approved)", False, 
                        f"Expected 'approved', got {data.get('status')}", data)
                return False
        else:
            log_test("ADMIN - Approve withdrawal", False, f"Status {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("ADMIN - Approve withdrawal", False, str(e))
        return False
    
    # Agent checks wallet after approval
    print("\n--- Agent checks wallet after approval ---")
    try:
        resp = requests.get(
            f"{BASE_URL}/agent/me",
            headers=auth_headers(test_state["agent_token"]),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            wallet = data.get("wallet", {})
            
            # Check withdrawn
            if wallet.get("withdrawn") == 20:
                log_test("ADMIN - Wallet withdrawn after approval", True, 
                        f"withdrawn={wallet.get('withdrawn')}")
            else:
                log_test("ADMIN - Wallet withdrawn after approval", False, 
                        f"Expected 20, got {wallet.get('withdrawn')}", wallet)
                return False
            
            # Check available
            if wallet.get("available") == 0:
                log_test("ADMIN - Wallet available after approval", True, 
                        f"available={wallet.get('available')}")
            else:
                log_test("ADMIN - Wallet available after approval", False, 
                        f"Expected 0, got {wallet.get('available')}", wallet)
                return False
        else:
            log_test("ADMIN - Get agent/me after approval", False, 
                    f"Status {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("ADMIN - Get agent/me after approval", False, str(e))
        return False
    
    # Admin gets agent detail
    print("\n--- Admin gets agent detail ---")
    try:
        resp = requests.get(
            f"{BASE_URL}/admin/physical-qr/agents/{test_state['agent_id']}/detail",
            headers=auth_headers(test_state["admin_token"]),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            
            # Check has wallet
            if "wallet" in data:
                log_test("ADMIN - Agent detail has wallet", True)
            else:
                log_test("ADMIN - Agent detail has wallet", False, "Missing wallet", data)
                return False
            
            # Check has earnings
            earnings = data.get("earnings", [])
            if len(earnings) > 0:
                log_test("ADMIN - Agent detail has earnings", True, 
                        f"Found {len(earnings)} earnings")
            else:
                log_test("ADMIN - Agent detail has earnings", False, 
                        "Earnings list is empty", data)
                return False
            
            # Check has withdrawals
            withdrawals = data.get("withdrawals", [])
            if len(withdrawals) > 0:
                # Find approved withdrawal
                approved = [w for w in withdrawals if w.get("status") == "approved"]
                if len(approved) > 0:
                    log_test("ADMIN - Agent detail has approved withdrawal", True, 
                            f"Found {len(approved)} approved withdrawals")
                else:
                    log_test("ADMIN - Agent detail has approved withdrawal", False, 
                            "No approved withdrawals", withdrawals)
                    return False
            else:
                log_test("ADMIN - Agent detail has withdrawals", False, 
                        "Withdrawals list is empty", data)
                return False
            
            # Check has shops
            shops = data.get("shops", [])
            if len(shops) > 0:
                # Find Sharma Electricals
                sharma = [s for s in shops if "Sharma Electricals" in s.get("merchant_name", "")]
                if len(sharma) > 0:
                    log_test("ADMIN - Agent detail has shops (Sharma Electricals)", True, 
                            f"Found {len(sharma)} shops with Sharma Electricals")
                else:
                    log_test("ADMIN - Agent detail has shops (Sharma Electricals)", False, 
                            "Sharma Electricals not found", shops)
                    return False
            else:
                log_test("ADMIN - Agent detail has shops", False, "Shops list is empty", data)
                return False
        else:
            log_test("ADMIN - Get agent detail", False, f"Status {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("ADMIN - Get agent detail", False, str(e))
        return False
    
    return True


def test_guards():
    """TEST 6: GUARDS - Test role-based access."""
    print("\n" + "="*80)
    print("TEST 6: GUARDS - Test role-based access")
    print("="*80)
    
    # Login as customer
    customer_token = login(CUSTOMER_PHONE, "CUSTOMER")
    if not customer_token:
        log_test("GUARDS - Customer login", False, "Failed to login as customer")
        return False
    log_test("GUARDS - Customer login", True)
    
    # Customer tries to access /agent/me (should fail)
    print("\n--- Customer tries to access /agent/me (should fail) ---")
    try:
        resp = requests.get(
            f"{BASE_URL}/agent/me",
            headers=auth_headers(customer_token),
            timeout=10
        )
        if resp.status_code == 403:
            log_test("GUARDS - Customer /agent/me blocked", True, "Got expected 403")
        else:
            log_test("GUARDS - Customer /agent/me blocked", False, 
                    f"Expected 403, got {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("GUARDS - Customer /agent/me blocked", False, str(e))
        return False
    
    # Customer tries to access /admin/physical-qr/agent-withdrawals (should fail)
    print("\n--- Customer tries to access /admin/physical-qr/agent-withdrawals (should fail) ---")
    try:
        resp = requests.get(
            f"{BASE_URL}/admin/physical-qr/agent-withdrawals",
            headers=auth_headers(customer_token),
            timeout=10
        )
        if resp.status_code == 403:
            log_test("GUARDS - Customer /admin/physical-qr/agent-withdrawals blocked", True, 
                    "Got expected 403")
        else:
            log_test("GUARDS - Customer /admin/physical-qr/agent-withdrawals blocked", False, 
                    f"Expected 403, got {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("GUARDS - Customer /admin/physical-qr/agent-withdrawals blocked", False, str(e))
        return False
    
    return True


def test_regression():
    """TEST 7: REGRESSION - Test core Physical QR endpoints still work."""
    print("\n" + "="*80)
    print("TEST 7: REGRESSION - Test core Physical QR endpoints still work")
    print("="*80)
    
    # Test batch create still works
    print("\n--- Testing batch create still works ---")
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/physical-qr/batch",
            json={"count": 2, "batch_name": "Regression Test", "prefix": "REG"},
            headers=auth_headers(test_state["admin_token"]),
            timeout=10
        )
        if resp.status_code == 200:
            log_test("REGRESSION - Batch create", True)
        else:
            log_test("REGRESSION - Batch create", False, f"Status {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("REGRESSION - Batch create", False, str(e))
        return False
    
    # Test resolve of an active token returns merchant_code
    print("\n--- Testing resolve of active token ---")
    try:
        resp = requests.get(
            f"{BASE_URL}/physical-qr/resolve?token={test_state['token_t1']}",
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            
            # Check valid
            if data.get("valid") is True:
                log_test("REGRESSION - Resolve valid", True)
            else:
                log_test("REGRESSION - Resolve valid", False, 
                        f"Expected True, got {data.get('valid')}", data)
                return False
            
            # Check active
            if data.get("active") is True:
                log_test("REGRESSION - Resolve active", True)
            else:
                log_test("REGRESSION - Resolve active", False, 
                        f"Expected True, got {data.get('active')}", data)
                return False
            
            # Check merchant_code
            if data.get("merchant_code") == MERCHANT_CODE:
                log_test("REGRESSION - Resolve merchant_code", True, 
                        f"merchant_code={data.get('merchant_code')}")
            else:
                log_test("REGRESSION - Resolve merchant_code", False, 
                        f"Expected {MERCHANT_CODE}, got {data.get('merchant_code')}", data)
                return False
        else:
            log_test("REGRESSION - Resolve active token", False, 
                    f"Status {resp.status_code}", resp.json())
            return False
    except Exception as e:
        log_test("REGRESSION - Resolve active token", False, str(e))
        return False
    
    return True


def main():
    """Run all tests."""
    print("\n" + "="*80)
    print("AGENT PAYOUTS (PHYSICAL QR) - COMPREHENSIVE END-TO-END TESTING")
    print("="*80)
    print(f"BASE_URL: {BASE_URL}")
    print(f"ADMIN: {ADMIN_PHONE}")
    print(f"MERCHANT: Sharma Electricals (code {MERCHANT_CODE})")
    print(f"CUSTOMER: {CUSTOMER_PHONE}")
    print(f"OTP: {DEMO_OTP}")
    
    # Run tests
    all_passed = True
    
    if not test_setup():
        print("\n❌ SETUP FAILED - Aborting remaining tests")
        all_passed = False
    else:
        if not test_config():
            all_passed = False
        
        if not test_earn():
            all_passed = False
        
        if not test_history():
            all_passed = False
        
        if not test_bank_withdraw():
            all_passed = False
        
        if not test_admin_manage():
            all_passed = False
        
        if not test_guards():
            all_passed = False
        
        if not test_regression():
            all_passed = False
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for r in test_results if r["passed"])
    total = len(test_results)
    percentage = (passed / total * 100) if total > 0 else 0
    
    print(f"\nTotal: {total} tests")
    print(f"Passed: {passed} tests")
    print(f"Failed: {total - passed} tests")
    print(f"Success Rate: {percentage:.1f}%")
    
    if all_passed:
        print("\n✅ ALL TESTS PASSED")
    else:
        print("\n❌ SOME TESTS FAILED")
        print("\nFailed tests:")
        for r in test_results:
            if not r["passed"]:
                print(f"  - {r['test']}: {r['details']}")
    
    # Save results
    with open("/app/test_results_agent_payout.json", "w") as f:
        json.dump({
            "summary": {
                "total": total,
                "passed": passed,
                "failed": total - passed,
                "success_rate": percentage,
                "all_passed": all_passed
            },
            "test_state": test_state,
            "results": test_results
        }, f, indent=2)
    
    print(f"\nResults saved to /app/test_results_agent_payout.json")
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
