"""Backend tests for iter130: Wallet, Invoices, Scratch cards, Payments (mock)."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://customer-auto-deploy.preview.emergentagent.com').rstrip('/')
PHONE = "+919000000004"
OTP = "123456"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": PHONE}, timeout=15)
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp",
                      json={"phone": PHONE, "otp": OTP, "create_if_new": False}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


# ----- Scratch Cards -----
def test_scratch_cards_list(client):
    r = client.get(f"{BASE_URL}/api/growth/scratch-cards", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, (list, dict))
    print("scratch cards:", data if isinstance(data, list) else list(data.keys()))


# ----- Wallet -----
def test_wallet_get(client):
    r = client.get(f"{BASE_URL}/api/wallet", timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    # tolerate different shapes
    bal = j.get("balance") if isinstance(j, dict) else None
    print("wallet:", j if not isinstance(j, dict) else {k: j[k] for k in list(j)[:6]})
    assert bal is not None or "wallet" in j or "transactions" in j


def test_wallet_topup_flow(client):
    # get initial balance
    r0 = client.get(f"{BASE_URL}/api/wallet", timeout=15)
    j0 = r0.json()
    bal0 = j0.get("balance") if isinstance(j0, dict) else (j0.get("wallet") or {}).get("balance", 0)
    if bal0 is None:
        bal0 = 0

    payload = {"purpose": "wallet", "amount": 100}
    order = client.post(f"{BASE_URL}/api/payments/order", json=payload, timeout=15)
    assert order.status_code == 200, order.text
    print("order:", order.json())

    mock = client.post(f"{BASE_URL}/api/payments/mock", json=payload, timeout=15)
    assert mock.status_code == 200, mock.text
    print("mock:", mock.json())

    import time
    time.sleep(1)
    r1 = client.get(f"{BASE_URL}/api/wallet", timeout=15)
    j1 = r1.json()
    bal1 = j1.get("balance") if isinstance(j1, dict) else (j1.get("wallet") or {}).get("balance", 0)
    print(f"bal before={bal0} after={bal1}")
    assert bal1 >= bal0 + 100 - 0.5  # tolerance


# ----- Invoices -----
def test_invoices_list_default(client):
    r = client.get(f"{BASE_URL}/api/invoices",
                   params={"page": 1, "page_size": 10, "range": "all",
                           "invoice_type": "all", "payment_status": "all", "sort": "newest"},
                   timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "items" in j or isinstance(j, list) or "invoices" in j
    print("invoices keys:", list(j.keys()) if isinstance(j, dict) else "list")
    return j


def test_invoices_sort_amount_high(client):
    r = client.get(f"{BASE_URL}/api/invoices",
                   params={"page": 1, "page_size": 10, "sort": "amount_high"}, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    items = j.get("items") or j.get("invoices") or (j if isinstance(j, list) else [])
    if len(items) >= 2:
        # Extract amounts
        def amt(x):
            for k in ("total_amount", "total", "amount", "grand_total"):
                if k in x:
                    return float(x[k] or 0)
            return 0
        amts = [amt(x) for x in items]
        print("amounts:", amts)
        assert amts == sorted(amts, reverse=True), f"not sorted desc: {amts}"


def test_invoice_detail_and_share(client):
    r = client.get(f"{BASE_URL}/api/invoices", params={"page_size": 1}, timeout=15)
    j = r.json()
    items = j.get("items") or j.get("invoices") or (j if isinstance(j, list) else [])
    if not items:
        pytest.skip("no invoices for user")
    inv = items[0]
    inv_id = inv.get("id") or inv.get("invoice_id") or inv.get("_id")
    assert inv_id
    d = client.get(f"{BASE_URL}/api/invoices/{inv_id}", timeout=15)
    assert d.status_code == 200, d.text
    print("detail keys:", list(d.json().keys()))
    s = client.get(f"{BASE_URL}/api/invoices/{inv_id}/share-link", timeout=15)
    assert s.status_code == 200, s.text
    sj = s.json()
    assert "path" in sj or "url" in sj or "sig" in sj
    print("share:", sj)
