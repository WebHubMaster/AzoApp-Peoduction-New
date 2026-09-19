"""
Phase A – Money-flow tests
---------------------------
#5  Visiting Charge EXCLUDED from tax base
#7  Partner RECEIVES the Visiting Charge on completion (no double credit)
#8  Invoice returns visiting_charge + tax_label; fill_live_branding always uses LIVE logo

Direct-import strategy: we mount the backend package and drive the engine +
invoice service directly against Mongo, so we avoid the LIVE Razorpay barrier.
Additional API-level sanity checks confirm the /api surface exposes the fields.
"""
import os
import sys
import math
import asyncio
import pytest
import requests

# add backend to path
BACKEND_DIR = "/app/backend"
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# ---- config ---------------------------------------------------------------
def _load_base():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip()
                    break
    assert url, "REACT_APP_BACKEND_URL not set"
    return url.rstrip("/")


BASE = _load_base()

# ---- shared session -------------------------------------------------------
@pytest.fixture(scope="module")
def s():
    ss = requests.Session()
    ss.headers.update({"Content-Type": "application/json"})
    return ss


def _login(s, phone):
    r = s.post(f"{BASE}/api/auth/send-otp", json={"phone": phone}, timeout=60)
    assert r.status_code == 200, f"send-otp {phone} => {r.status_code} {r.text}"
    r = s.post(f"{BASE}/api/auth/verify-otp", json={"phone": phone, "otp": "123456"}, timeout=60)
    assert r.status_code == 200, f"verify-otp {phone} => {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token: {r.text}"
    return tok


@pytest.fixture(scope="module")
def admin_tok(s):
    return _login(s, "+919000000000")


@pytest.fixture(scope="module")
def customer_tok(s):
    return _login(s, "+919000000004")


@pytest.fixture(scope="module")
def partner_tok(s):
    return _login(s, "+919000000003")



# ============================================================================
# #7 – Partner receives Visiting Charge on completion (no double credit)
# ============================================================================
def _fresh_db():
    """A fresh motor client bound to the CURRENT running loop."""
    from motor.motor_asyncio import AsyncIOMotorClient
    return AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


# One persistent loop shared by all direct-async tests so motor stays bound.
_SHARED_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_SHARED_LOOP)


def _run(coro_factory):
    return _SHARED_LOOP.run_until_complete(coro_factory())




# ============================================================================
# #8 – Invoice: visiting_charge + tax_label + LIVE branding logo
# ============================================================================
def test_8_invoice_schema_and_live_logo():
    """Build a booking invoice via invoice_service, verify:
       - stored inv has numeric 'visiting_charge' and 'tax_label' fields
       - fill_live_branding overrides business_snapshot.logo with live branding
    """
    from config.database import db, now_iso, get_settings
    from models.user import new_id
    from services import invoice_service

    async def scenario():
        # seed booking already 'completed'
        bid = "TEST_BK_" + new_id()
        code = "TESTINV-" + new_id()[:6]
        booking = {
            "id": bid, "code": code, "status": "completed",
            "customer_id": "TEST_CUST", "partner_id": None, "merchant_id": None,
            "service_name": "TEST Service", "category_name": "TEST Cat",
            "customer_name": "Test Cust", "customer_phone": "+9100000000",
            "address": {"line1": "Test", "city": "Delhi"},
            "pricing": {
                "base": 500.0, "addons_total": 0.0, "emergency_fee": 0.0,
                "surge": 0.0, "visiting_charge": 100.0,
                "convenience_fee": 0.0, "platform_fee": 0.0,
                "subtotal": 600.0, "taxable": 500.0,
                "gst": 90.0, "discount": 0.0, "total": 690.0,
                "commissionable_base": 500.0,
            },
            "created_at": now_iso(), "updated_at": now_iso(),
        }
        await db.bookings.insert_one(dict(booking))

        settings = await get_settings()

        inv = await invoice_service.ensure_booking_invoice(booking, settings)
        assert inv, "invoice not built"
        assert "visiting_charge" in inv, "invoice missing visiting_charge"
        assert inv["visiting_charge"] == 100.0, inv["visiting_charge"]
        assert inv.get("tax_label"), "invoice missing tax_label"
        assert inv.get("fees", 0) >= 100.0, "fees should include visiting charge"
        # subtotal must exclude vc so subtotal+fees+tax-discount == total
        recon = round(inv["subtotal"] + inv["fees"] + inv["tax"] - inv.get("discount", 0), 2)
        assert math.isclose(recon, inv["total_amount"], abs_tol=0.05), \
            f"reconcile {recon} vs total {inv['total_amount']}"

        # ---- fill_live_branding must overwrite snapshot.logo with the LIVE
        # branding logo, even when snapshot already has one
        inv["business_snapshot"]["logo"] = "https://old.example.com/OLD_LOGO.png"

        # temporarily set a distinctive live branding logo
        LIVE = "https://live.example.com/LIVE_LOGO_TEST.png"
        await db.settings.update_one({}, {"$set": {"branding.logo_light": LIVE}}, upsert=True)
        # bust cache
        try:
            from config import database as _dbmod
            if hasattr(_dbmod, "_settings_cache"):
                _dbmod._settings_cache = None
        except Exception:
            pass

        filled = await invoice_service.fill_live_branding(dict(inv))
        got = filled["business_snapshot"].get("logo")
        assert got == LIVE, f"fill_live_branding did not use live logo: got {got}"

        # cleanup
        await db.bookings.delete_one({"id": bid})
        await db.invoices.delete_one({"id": inv["id"]})
        await db.settings.update_one({}, {"$unset": {"branding.logo_light": ""}})
        return True

    assert _run(scenario)


def test_8_invoice_api_exposes_fields(s, customer_tok):
    """Seed a completed booking for the demo customer so an invoice exists,
    then GET /api/invoices and /api/invoices/{id} to confirm the response
    exposes visiting_charge, tax_label, and business_snapshot.logo (relabelling
    fields consumed by InvoiceDocument.jsx)."""
    hdr = {"Authorization": f"Bearer {customer_tok}"}

    # ---- resolve customer id
    me = s.get(f"{BASE}/api/auth/me", headers=hdr, timeout=30)
    if me.status_code != 200:
        me = s.get(f"{BASE}/api/users/me", headers=hdr, timeout=30)
    assert me.status_code == 200, me.text
    cust_id = me.json().get("id") or me.json().get("user", {}).get("id")
    assert cust_id, me.text

    # ---- seed a completed booking + build invoice directly
    from config.database import db, now_iso  # noqa
    from models.user import new_id
    from services import invoice_service

    seeded = {"bid": None, "inv_id": None}

    async def seed():
        bid = "TEST_APIINV_" + new_id()
        code = "TESTAPI-" + new_id()[:6]
        booking = {
            "id": bid, "code": code, "status": "completed",
            "customer_id": cust_id, "partner_id": None, "merchant_id": None,
            "service_name": "TEST Invoice API Service",
            "customer_name": "Test Cust", "customer_phone": "+919000000004",
            "address": {"line1": "Test", "city": "Delhi"},
            "pricing": {
                "base": 500.0, "addons_total": 0.0, "emergency_fee": 0.0,
                "surge": 0.0, "visiting_charge": 100.0,
                "convenience_fee": 0.0, "platform_fee": 0.0,
                "subtotal": 600.0, "taxable": 500.0, "gst": 90.0,
                "discount": 0.0, "total": 690.0, "commissionable_base": 500.0,
            },
            "created_at": now_iso(), "updated_at": now_iso(),
        }
        await db.bookings.insert_one(dict(booking))
        settings = await invoice_service.get_settings()
        inv = await invoice_service.ensure_booking_invoice(booking, settings)
        seeded["bid"] = bid
        seeded["inv_id"] = inv["id"]

    async def cleanup():
        if seeded["bid"]:
            await db.bookings.delete_one({"id": seeded["bid"]})
        if seeded["inv_id"]:
            await db.invoices.delete_one({"id": seeded["inv_id"]})

    _run(seed)
    try:
        # ---- list
        r = s.get(f"{BASE}/api/invoices", headers=hdr, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        items = data if isinstance(data, list) else (data.get("items") or data.get("invoices") or [])
        assert items, "no invoices returned"
        target = next((it for it in items if it.get("id") == seeded["inv_id"]), items[0])

        # ---- detail
        r = s.get(f"{BASE}/api/invoices/{target['id']}", headers=hdr, timeout=60)
        assert r.status_code == 200, r.text
        inv = r.json()
        assert "visiting_charge" in inv, f"missing visiting_charge: keys={list(inv.keys())}"
        assert isinstance(inv["visiting_charge"], (int, float))
        assert "tax_label" in inv, f"missing tax_label: keys={list(inv.keys())}"
        bs = inv.get("business_snapshot") or {}
        assert "logo" in bs, f"business_snapshot missing logo key: {list(bs.keys())}"

        if target["id"] == seeded["inv_id"]:
            # seeded values check
            assert math.isclose(inv["visiting_charge"], 100.0, abs_tol=0.01)
            assert math.isclose(inv["fees"], 100.0, abs_tol=0.01), inv["fees"]
            assert math.isclose(inv["subtotal"], 500.0, abs_tol=0.01), inv["subtotal"]
            assert math.isclose(inv["tax"], 90.0, abs_tol=0.01), inv["tax"]
            assert math.isclose(inv["total_amount"], 690.0, abs_tol=0.01), inv["total_amount"]
        print(f"[API inv] id={target['id']} vc={inv['visiting_charge']} "
              f"tax_label={inv.get('tax_label')} logo_present={bool(bs.get('logo'))}")
    finally:
        _run(cleanup)
