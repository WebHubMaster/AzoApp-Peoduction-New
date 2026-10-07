"""
Tests for the authorised invoice PDF download endpoint used by the customer
subscription-download bug fix. See iteration review request.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("BACKEND_BASE_URL", "http://localhost:8001").rstrip("/")

OWNER_PHONE = "+919000000004"       # Priya Verma (customer, owner)
OTHER_CUSTOMER_PHONE = "+919000000099"
PARTNER_PHONE = "+919000000003"     # Raj Kumar (partner)
OTP = "123456"

SERVICE_ID = "svc-maid-fulltime"


# ---------- helpers ----------

def login(phone, create_if_new=False, role="customer"):
    r = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone})
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    payload = {"phone": phone, "otp": OTP}
    if create_if_new:
        payload["create_if_new"] = True
        payload["role"] = role
    r = requests.post(f"{BASE_URL}/api/auth/verify-otp", json=payload)
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in {r.json()}"
    return tok


def auth(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def owner_token():
    return login(OWNER_PHONE)


@pytest.fixture(scope="module")
def other_customer_token():
    return login(OTHER_CUSTOMER_PHONE, create_if_new=True, role="customer")


@pytest.fixture(scope="module")
def partner_token():
    return login(PARTNER_PHONE)


@pytest.fixture(scope="module")
def owner_me(owner_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth(owner_token))
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def invoice_id(owner_token, owner_me):
    """Create maid subscription, activate via mock pay, fetch invoice_id."""
    # Need an address
    addrs = owner_me.get("addresses") or owner_me.get("user", {}).get("addresses") or []
    if not addrs:
        r = requests.get(f"{BASE_URL}/api/addresses", headers=auth(owner_token))
        if r.status_code == 200:
            addrs = r.json() if isinstance(r.json(), list) else r.json().get("addresses", [])
    assert addrs, f"owner has no addresses: me={owner_me}"
    addr_id = addrs[0].get("id") or addrs[0].get("_id") or addrs[0].get("address_id")

    sub_payload = {
        "service_id": SERVICE_ID,
        "plan_type": "monthly",
        "address_id": addr_id,
        "start_date": "2026-02-01",
        "preferred_time": "09:00",
    }
    r = requests.post(f"{BASE_URL}/api/subscriptions", json=sub_payload, headers=auth(owner_token))
    assert r.status_code in (200, 201), f"create sub failed: {r.status_code} {r.text}"
    sub = r.json()
    sub_id = sub.get("id") or sub.get("subscription_id") or sub.get("_id")
    assert sub_id, f"no sub id: {sub}"

    r = requests.post(f"{BASE_URL}/api/subscriptions/{sub_id}/pay/mock", headers=auth(owner_token))
    assert r.status_code in (200, 201), f"mock pay failed: {r.status_code} {r.text}"

    r = requests.get(f"{BASE_URL}/api/subscriptions/{sub_id}/invoice", headers=auth(owner_token))
    assert r.status_code == 200, f"get invoice failed: {r.status_code} {r.text}"
    body = r.json()
    inv_id = body.get("invoice_id")
    assert inv_id, f"no invoice_id in {body}"
    return inv_id


# ---------- tests ----------

class TestInvoicePdfDownload:

    def test_owner_can_download_pdf(self, owner_token, invoice_id):
        r = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}/pdf", headers=auth(owner_token))
        assert r.status_code == 200, f"status {r.status_code}, body={r.text[:300]}"
        ct = r.headers.get("Content-Type", "")
        assert "application/pdf" in ct.lower(), f"content-type={ct}"
        cd = r.headers.get("Content-Disposition", "")
        assert "attachment" in cd.lower(), f"content-disposition={cd}"
        assert ".pdf" in cd.lower(), f"filename missing .pdf: {cd}"
        body = r.content
        assert len(body) > 500, f"body too small: {len(body)}"
        assert body[:4] == b"%PDF", f"magic bytes not %PDF: {body[:8]!r}"

    def test_other_customer_forbidden(self, other_customer_token, invoice_id):
        r = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}/pdf", headers=auth(other_customer_token))
        assert r.status_code in (403, 404), f"expected 403, got {r.status_code}: {r.text[:200]}"
        # Must not return a PDF
        assert "application/pdf" not in r.headers.get("Content-Type", "").lower()
        assert not r.content.startswith(b"%PDF")

    def test_partner_forbidden(self, partner_token, invoice_id):
        r = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}/pdf", headers=auth(partner_token))
        assert r.status_code in (403, 404), f"expected 403, got {r.status_code}: {r.text[:200]}"
        assert not r.content.startswith(b"%PDF")

    def test_no_auth_rejected(self, invoice_id):
        r = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}/pdf")
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"
        assert not r.content.startswith(b"%PDF")

    def test_invoice_body_pricing(self, owner_token, invoice_id):
        """Regression: subscription invoice JSON still shows correct maid pricing breakdown."""
        r = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}", headers=auth(owner_token))
        assert r.status_code == 200, r.text
        inv = r.json()
        # locate numeric fields - could be nested
        def find(d, keys):
            for k in keys:
                if isinstance(d, dict) and k in d:
                    return d[k]
            # recurse
            if isinstance(d, dict):
                for v in d.values():
                    out = find(v, keys)
                    if out is not None:
                        return out
            return None

        commission = find(inv, ["commission", "commission_amount"])
        platform = find(inv, ["platform_fee"])
        gst = find(inv, ["gst", "gst_amount", "tax"])
        total = find(inv, ["total", "total_amount", "grand_total"])

        def near(a, b, tol=1.0):
            return a is not None and abs(float(a) - b) <= tol

        assert near(commission, 3200.0), f"commission={commission}"
        assert near(platform, 10.0), f"platform_fee={platform}"
        assert near(gst, 577.80, tol=1.0), f"gst={gst}"
        assert near(total, 8587.80, tol=1.0), f"total={total}"
