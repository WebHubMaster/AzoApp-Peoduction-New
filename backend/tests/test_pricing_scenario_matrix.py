"""
Pricing scenario matrix — independent reference maths vs. the live API.

Covers: single / multi-service / multi-add-on (independent add-on qty) / same-category
/ multi-category carts × schedule vs emergency × visiting charge (min-threshold, always,
off) × convenience fee ON/OFF × platform fee ON/OFF × coupons (percentage, capped
percentage, fixed, free_visiting, min_order gate) × GST rate.

Then a representative subset is BOOKED exactly the way Checkout does (one /bookings/grouped
call per category) and we assert Σ(booking totals) == checkout preview, every breakdown
reconciles, partner/merchant views hide platform fees, and invoices snapshot correctly.
"""
import os
import re
import uuid
from decimal import Decimal, ROUND_HALF_UP

import pytest
import requests
from pymongo import MongoClient

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_PHONE = "+919000000000"
TEST_PHONE = "+919111100077"
OTP = "123456"
ADDRESS = {"label": "Home", "line": "12 Test Lane", "city": "Patna", "pincode": "800001", "state": "Bihar"}
SCHEDULED_AT = (__import__("datetime").datetime.now(__import__("datetime").timezone.utc) + __import__("datetime").timedelta(days=2)).replace(hour=10, minute=0, second=0, microsecond=0).isoformat()
SURGE_PCT = 15  # seeded pricing_rules: Patna Peak Surge (city scope, 15%)
PCT_RE = re.compile(r"GST\s*\(?\s*\d+\s*%|\d+\s*%\s*GST|(?<![\d.])18\s*%", re.IGNORECASE)

TWO = Decimal("0.01")


def D(x):
    return Decimal(str(x if x is not None else 0))


def q(x):
    return D(x).quantize(TWO, rounding=ROUND_HALF_UP)


def pct(a, p):
    return (D(a) * D(p) / Decimal(100)).quantize(TWO, rounding=ROUND_HALF_UP)


def close(a, b, tol="0.011"):
    return abs(D(a) - D(b)) <= Decimal(tol)


# ---------------------------------------------------------------- settings matrix
SETTINGS_CASES = {
    "vc_min500_noplat": {"gst_pct": 18, "emergency_fee": 150, "business_config": {
        "global_visiting_charge": 100, "min_service_amount_for_visiting": 500,
        "apply_convenience_fee": False, "convenience_fee_pct": 0, "apply_platform_fee": False, "platform_fee": 0}},
    "vc_always_conv5_plat49": {"gst_pct": 18, "emergency_fee": 149, "business_config": {
        "global_visiting_charge": 99, "min_service_amount_for_visiting": 0,
        "apply_convenience_fee": True, "convenience_fee_pct": 5, "apply_platform_fee": True, "platform_fee": 49}},
    "novc_conv3": {"gst_pct": 18, "emergency_fee": 200, "business_config": {
        "global_visiting_charge": 0, "min_service_amount_for_visiting": 0,
        "apply_convenience_fee": True, "convenience_fee_pct": 3, "apply_platform_fee": False, "platform_fee": 0}},
    "all_off_gst5": {"gst_pct": 5, "emergency_fee": 0, "business_config": {
        "global_visiting_charge": 0, "min_service_amount_for_visiting": 0,
        "apply_convenience_fee": False, "convenience_fee_pct": 0, "apply_platform_fee": False, "platform_fee": 0}},
}

# (service name, [(addon name, qty)], qty)
CARTS = {
    "single": [("Tap & Mixer Repair", [], 1)],
    "single_addons": [("Door Repair", [("Lock Replacement", 1), ("Handle Fitting", 2)], 1)],
    "same_cat_multi": [("Switchboard Repair", [("Socket Add-on", 1)], 2), ("Fan Installation", [("Regulator Replace", 1)], 1)],
    "two_cat": [("Tap & Mixer Repair", [("Washer Replacement", 1)], 1), ("Bathroom Cleaning", [("Grout Whitening", 1)], 1)],
    "three_cat": [("Door Repair", [], 1), ("AC Service (Split)", [("Deep Cleaning", 1)], 1), ("Switchboard Repair", [("MCB Replace", 1)], 1)],
}

COUPONS = {
    None: None,
    "TSTXPCT10": {"discount_type": "percentage", "discount_value": 10, "max_discount": 0, "min_order": 0},
    "TSTXPCT50CAP": {"discount_type": "percentage", "discount_value": 50, "max_discount": 100, "min_order": 0},
    "TSTXFLAT100": {"discount_type": "fixed", "discount_value": 100, "max_discount": 0, "min_order": 0},
    "TSTXFREEVISIT": {"discount_type": "free_visiting", "discount_value": 0, "max_discount": 0, "min_order": 0},
    "TSTXMIN1000": {"discount_type": "fixed", "discount_value": 150, "max_discount": 0, "min_order": 1000},
}
SCHEDULES = ["schedule", "emergency"]


# ---------------------------------------------------------------- helpers
def _login(phone):
    r = requests.post(f"{BASE}/api/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, r.text[:200]
    otp = r.json().get("dev_otp") or OTP
    r = requests.post(f"{BASE}/api/auth/verify-otp", json={"phone": phone, "otp": otp}, timeout=15)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    return d.get("token") or d.get("access_token"), d.get("user") or {}


def _mongo():
    env = {}
    with open("/app/backend/.env") as f:
        for ln in f:
            if "=" in ln and not ln.strip().startswith("#"):
                k, v = ln.strip().split("=", 1)
                env[k] = v.strip().strip('"').strip("'")
    return MongoClient(env["MONGO_URL"])[env["DB_NAME"]]


@pytest.fixture(scope="module")
def admin():
    tok, _ = _login(ADMIN_PHONE)
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def customer():
    tok, user = _login(TEST_PHONE)
    return {"Authorization": f"Bearer {tok}"}, user


@pytest.fixture(scope="module")
def catalog():
    r = requests.get(f"{BASE}/api/catalog/services", timeout=15)
    rows = r.json()
    rows = rows if isinstance(rows, list) else rows.get("items") or rows.get("services")
    by_name = {s["name"]: s for s in rows}
    for cart in CARTS.values():
        for name, addons, _ in cart:
            assert name in by_name, f"catalog missing {name}"
            names = {a["name"] for a in by_name[name].get("addons", [])}
            for an, _q in addons:
                assert an in names, f"{name} missing add-on {an}"
    return by_name


@pytest.fixture(scope="module")
def coupons(admin):
    created = []
    r = requests.get(f"{BASE}/api/admin/coupons", headers=admin, timeout=15).json()
    existing = {c["code"]: c for c in (r if isinstance(r, list) else r.get("items") or [])}
    for code, spec in COUPONS.items():
        if not code:
            continue
        if code in existing:
            requests.delete(f"{BASE}/api/admin/coupons/{existing[code]['id']}", headers=admin, timeout=15)
        body = {"code": code, "title": code, "usage_limit": 100000, "status": "active", **spec}
        rr = requests.post(f"{BASE}/api/admin/coupons", headers=admin, json=body, timeout=15)
        assert rr.status_code in (200, 201), rr.text[:300]
        created.append(rr.json().get("id"))
    yield
    for cid in created:
        if cid:
            requests.delete(f"{BASE}/api/admin/coupons/{cid}", headers=admin, timeout=15)


@pytest.fixture(scope="module")
def settings_guard(admin):
    cur = requests.get(f"{BASE}/api/admin/settings", headers=admin, timeout=15).json()
    orig = {"gst_pct": cur.get("gst_pct"), "emergency_fee": cur.get("emergency_fee"),
            "business_config": {k: (cur.get("business_config") or {}).get(k) for k in (
                "global_visiting_charge", "min_service_amount_for_visiting", "apply_convenience_fee",
                "convenience_fee_pct", "apply_platform_fee", "platform_fee")}}
    yield
    bc = {k: (v if v is not None else 0) for k, v in orig["business_config"].items()}
    requests.put(f"{BASE}/api/admin/settings", headers=admin,
                 json={"gst_pct": orig["gst_pct"], "emergency_fee": orig["emergency_fee"], "business_config": bc}, timeout=15)


@pytest.fixture(scope="module", autouse=True)
def cleanup(customer):
    yield
    db = _mongo()
    uid = customer[1].get("id")
    if uid:
        ids = [b["id"] for b in db.bookings.find({"customer_id": uid}, {"id": 1})]
        db.bookings.delete_many({"customer_id": uid})
        db.invoices.delete_many({"booking_id": {"$in": ids}})
        db.notifications.delete_many({"booking_id": {"$in": ids}})
        db.dispatches.delete_many({"booking_id": {"$in": ids}})
        db.payments.delete_many({"booking_id": {"$in": ids}})


def apply_settings(admin, case):
    r = requests.put(f"{BASE}/api/admin/settings", headers=admin, json=SETTINGS_CASES[case], timeout=15)
    assert r.status_code == 200, r.text[:300]
    s = requests.get(f"{BASE}/api/admin/settings", headers=admin, timeout=15).json()
    bc = s.get("business_config") or {}
    want = SETTINGS_CASES[case]["business_config"]
    for k, v in want.items():
        assert bc.get(k) == v or (not v and not bc.get(k)), f"setting {k} not applied: {bc.get(k)} != {v}"
    assert float(s.get("gst_pct")) == SETTINGS_CASES[case]["gst_pct"]


def cart_items(catalog, cart_key):
    out = []
    for name, addons, qty in CARTS[cart_key]:
        s = catalog[name]
        out.append({"service_id": s["id"], "qty": qty, "category_id": s.get("category_id"),
                    "category_name": s.get("category_name"),
                    "addons": [{"name": an, "qty": aq} for an, aq in addons]})
    return out


# ---------------------------------------------------------------- reference maths
def reference(catalog, case, cart_key, schedule, coupon_code):
    cfg = SETTINGS_CASES[case]
    bc = cfg["business_config"]
    gst_pct = cfg["gst_pct"]
    em_amt = D(cfg["emergency_fee"]) if schedule == "emergency" else Decimal(0)
    vc_amt = D(bc["global_visiting_charge"])
    vc_min = D(bc["min_service_amount_for_visiting"])

    lines = []
    cats = {}
    order = []
    surge = Decimal(0)
    for name, addons, qty in CARTS[cart_key]:
        s = catalog[name]
        base = D(s["base_price"])
        ad = {a["name"]: D(a["price"]) for a in s.get("addons", [])}
        line = q(base * qty) + sum((q(ad[an] * aq) for an, aq in addons), Decimal(0))
        lines.append(line)
        surge += pct(line, SURGE_PCT)  # seeded "Patna Peak Surge" rule: 15% per line
        key = s.get("category_id")
        if key not in cats:
            cats[key] = Decimal(0)
            order.append(key)
        cats[key] += line
    services = sum(lines, Decimal(0))
    emergency = Decimal(0)
    visiting = Decimal(0)
    for key in order:
        emergency += em_amt
        if vc_amt > 0 and (vc_min <= 0 or cats[key] < vc_min):
            visiting += vc_amt
    subtotal = services + emergency + visiting + surge
    conv = pct(subtotal, bc["convenience_fee_pct"]) if bc["apply_convenience_fee"] else Decimal(0)
    plat = D(bc["platform_fee"]) if bc["apply_platform_fee"] else Decimal(0)
    gross = subtotal + conv + plat
    disc = Decimal(0)
    applied = False
    cp = COUPONS.get(coupon_code)
    if cp and (not cp["min_order"] or subtotal >= D(cp["min_order"])):
        applied = True
        if cp["discount_type"] == "percentage":
            disc = pct(gross, cp["discount_value"])
            if cp["max_discount"]:
                disc = min(disc, D(cp["max_discount"]))
        elif cp["discount_type"] == "free_visiting":
            disc = visiting
        else:
            disc = D(cp["discount_value"])
        disc = max(Decimal(0), min(disc, gross))
    taxable = gross - disc
    gst = pct(taxable, gst_pct)
    return {"services": services, "emergency": emergency, "visiting": visiting, "surge": surge, "subtotal": subtotal,
            "conv": conv, "plat": plat, "gross": gross, "discount": disc, "taxable": taxable,
            "gst": gst, "total": taxable + gst, "coupon_applied": applied, "groups": len(order)}


def assert_breakdown_reconciles(bd, where=""):
    charges = sum((D(c["amount"]) for c in bd.get("additional_charges") or []), Decimal(0))
    assert close(D(bd["services_subtotal"]) + charges, bd["subtotal"], "0.001"), f"{where} services+charges != subtotal {bd}"
    assert close(D(bd["subtotal"]) - D(bd["discount"]), bd["taxable"], "0.001"), f"{where} subtotal-discount != taxable {bd}"
    assert close(D(bd["taxable"]) + D(bd["tax"]), bd["total"], "0.001"), f"{where} taxable+tax != total {bd}"
    items_sum = sum((D(it["amount"]) + sum((D(a["amount"]) for a in it.get("addons") or []), Decimal(0))
                     for it in bd.get("service_items") or []), Decimal(0))
    assert close(items_sum, bd["services_subtotal"], "0.001"), f"{where} Σ items != services_subtotal {bd}"
    for c in bd.get("additional_charges") or []:
        assert D(c["amount"]) > 0


# ---------------------------------------------------------------- 1) cart-quote matrix
MATRIX = [(c, k, s, cp) for c in SETTINGS_CASES for k in CARTS for s in SCHEDULES for cp in COUPONS]


@pytest.mark.parametrize("case,cart_key,schedule,coupon_code", MATRIX)
def test_cart_quote_matches_reference(admin, customer, catalog, coupons, settings_guard, case, cart_key, schedule, coupon_code):
    apply_settings(admin, case)
    ref = reference(catalog, case, cart_key, schedule, coupon_code)
    body = {"items": cart_items(catalog, cart_key), "schedule_type": schedule, "address": ADDRESS}
    if coupon_code:
        body["coupon_code"] = coupon_code
    r = requests.post(f"{BASE}/api/bookings/cart-quote", headers=customer[0], json=body, timeout=20)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    p = d["pricing"]
    assert close(p.get("surge") or 0, ref["surge"]), f"surge {p.get('surge')} != {ref['surge']}"
    assert close(p["base"], ref["services"]), f"services {p['base']} != {ref['services']}"
    assert close(p["emergency_fee"], ref["emergency"]), f"emergency {p['emergency_fee']} != {ref['emergency']}"
    assert close(p["visiting_charge"], ref["visiting"]), f"visiting {p['visiting_charge']} != {ref['visiting']}"
    assert close(p["subtotal"], ref["subtotal"]), f"subtotal {p['subtotal']} != {ref['subtotal']}"
    assert close(p["convenience_fee"], ref["conv"]), f"conv {p['convenience_fee']} != {ref['conv']}"
    assert close(p["platform_fee"], ref["plat"]), f"plat {p['platform_fee']} != {ref['plat']}"
    assert close(p["gross_charges"], ref["gross"]), f"gross {p['gross_charges']} != {ref['gross']}"
    assert close(p["discount"], ref["discount"]), f"discount {p['discount']} != {ref['discount']} (coupon {coupon_code})"
    assert d.get("coupon_applied") == ref["coupon_applied"], f"coupon_applied {d.get('coupon_applied')} != {ref['coupon_applied']}"
    assert close(p["taxable"], ref["taxable"]), f"taxable {p['taxable']} != {ref['taxable']}"
    assert close(p["gst"], ref["gst"]), f"gst {p['gst']} != {ref['gst']}"
    assert close(p["total"], ref["total"]), f"total {p['total']} != {ref['total']}"
    # partner-side base never includes platform-only fees
    assert close(p["commissionable_base"], ref["taxable"] - ref["conv"] - ref["plat"])
    # canonical breakdown reconciles and matches pricing
    bd = d["breakdown"]
    assert_breakdown_reconciles(bd, f"{case}/{cart_key}/{schedule}/{coupon_code}")
    assert close(bd["total"], p["total"]) and close(bd["tax"], p["gst"]) and close(bd["services_subtotal"], p["base"])
    keys = [c["key"] for c in bd["additional_charges"]]
    assert ("emergency_fee" in keys) == (ref["emergency"] > 0)
    assert ("surge" in keys) == (ref["surge"] > 0)
    assert ("visiting_charge" in keys) == (ref["visiting"] > 0)
    assert ("convenience_fee" in keys) == (ref["conv"] > 0)
    assert ("platform_fee" in keys) == (ref["plat"] > 0)
    # per-category charges: count and sums
    cc = d.get("category_charges") or []
    assert len(cc) == ref["groups"]
    assert close(sum((D(c["visiting_charge"]) for c in cc), Decimal(0)), ref["visiting"])
    assert close(sum((D(c["emergency_charge"]) for c in cc), Decimal(0)), ref["emergency"])
    # lines: every add-on priced independently (never × main qty)
    for ln, (name, addons, qty) in zip(d["lines"], CARTS[cart_key]):
        s = catalog[name]
        ad = {a["name"]: D(a["price"]) for a in s.get("addons", [])}
        exp = q(D(s["base_price"]) * qty) + sum((q(ad[an] * aq) for an, aq in addons), Decimal(0))
        assert close(ln["line_total"], exp), f"line {name}: {ln['line_total']} != {exp}"
        assert int(ln["qty"]) == qty
        got_addons = {a["name"]: int(a["qty"]) for a in ln.get("addons") or []}
        assert got_addons == {an: aq for an, aq in addons}


# ---------------------------------------------------------------- 2) real bookings (checkout flow)
BOOK_CASES = [
    ("vc_always_conv5_plat49", "two_cat", "emergency", "TSTXFLAT100"),
    ("vc_always_conv5_plat49", "three_cat", "schedule", "TSTXPCT50CAP"),
    ("vc_always_conv5_plat49", "three_cat", "emergency", None),
    ("vc_min500_noplat", "two_cat", "emergency", "TSTXFREEVISIT"),
    ("vc_min500_noplat", "two_cat", "schedule", "TSTXPCT10"),
    ("novc_conv3", "three_cat", "emergency", "TSTXFLAT100"),
    ("vc_min500_noplat", "single_addons", "emergency", "TSTXPCT10"),
    ("vc_always_conv5_plat49", "same_cat_multi", "schedule", "TSTXFLAT100"),
    ("all_off_gst5", "two_cat", "schedule", "TSTXMIN1000"),
]


def checkout_like(customer, catalog, cart_key, schedule, coupon_code):
    """Mirror Checkout.jsx: one /bookings/grouped per category, first group carries the once-per-cart flags."""
    items = cart_items(catalog, cart_key)
    body = {"items": items, "schedule_type": schedule, "address": ADDRESS}
    if coupon_code:
        body["coupon_code"] = coupon_code
    preview = requests.post(f"{BASE}/api/bookings/cart-quote", headers=customer[0], json=body, timeout=20).json()
    groups, order = {}, []
    for it in items:
        k = it["category_id"] or it["category_name"] or "uncategorised"
        if k not in groups:
            groups[k] = []
            order.append(k)
        groups[k].append(it)
    nonce = uuid.uuid4().hex
    created = []
    first = True
    for k in order:
        b = {"items": groups[k], "address": ADDRESS, "schedule_type": schedule, "scheduled_at": (None if schedule == "emergency" else SCHEDULED_AT),
             "coupon_code": coupon_code, "cart_service_total": preview.get("cart_service_total"),
             "apply_visiting": first, "apply_emergency": first, "idempotency_key": f"{nonce}:grp:{k}",
             "order_group_id": nonce, "cart_items": items}
        r = requests.post(f"{BASE}/api/bookings/grouped", headers=customer[0], json=b, timeout=30)
        assert r.status_code == 200, r.text[:400]
        created.append(r.json())
        first = False
    return preview, created, nonce


@pytest.mark.parametrize("case,cart_key,schedule,coupon_code", BOOK_CASES)
def test_bookings_sum_to_checkout_preview(admin, customer, catalog, coupons, settings_guard, case, cart_key, schedule, coupon_code):
    apply_settings(admin, case)
    ref = reference(catalog, case, cart_key, schedule, coupon_code)
    preview, created, nonce = checkout_like(customer, catalog, cart_key, schedule, coupon_code)
    pp = preview["pricing"]
    assert close(pp["total"], ref["total"])
    assert len(created) == ref["groups"]
    tot = sum((D(b["pricing"]["total"]) for b in created), Decimal(0))
    assert close(tot, pp["total"], "0.001"), f"Σ bookings {tot} != preview {pp['total']} ({case}/{cart_key}/{schedule}/{coupon_code})"
    for fld, key in (("base", "services"), ("emergency_fee", "emergency"), ("visiting_charge", "visiting"), ("surge", "surge"),
                     ("convenience_fee", "conv"), ("platform_fee", "plat"), ("discount", "discount"),
                     ("taxable", "taxable"), ("gst", "gst")):
        s = sum((D(b["pricing"].get(fld) or 0) for b in created), Decimal(0))
        assert close(s, ref[key], "0.001"), f"Σ {fld} {s} != {ref[key]}"
    for b in created:
        p = b["pricing"]
        assert close(D(p["taxable"]) + D(p["gst"]), p["total"], "0.001")
        assert D(p["discount"]) <= D(p["gross_charges"])
        assert b.get("coupon_code") == (coupon_code if ref["coupon_applied"] else None) or not coupon_code or not ref["coupon_applied"]
        # stored items carry base + independent add-on qty
        for it in b["items"]:
            s = next(v for v in catalog.values() if v["id"] == it["service_id"])
            ad = {a["name"]: D(a["price"]) for a in s.get("addons", [])}
            exp = q(D(s["base_price"]) * int(it["qty"])) + sum((q(ad[a["name"]] * int(a["qty"])) for a in it["addons"]), Decimal(0))
            assert close(it["price"], exp), f"item {it['service_name']} price {it['price']} != {exp}"
        # customer detail → canonical breakdown reconciles and equals stored pricing
        d = requests.get(f"{BASE}/api/bookings/{b['id']}", headers=customer[0], timeout=15).json()
        bd = d["breakdown"]
        assert_breakdown_reconciles(bd, b["code"])
        assert close(bd["total"], p["total"], "0.001") and close(bd["tax"], p["gst"], "0.001")
        assert close(bd["services_subtotal"], p["base"], "0.001")
        assert bd["services_subtotal"] == d["breakdown"]["services_subtotal"]
    # customer list carries the same numbers (immutable snapshot)
    lst = requests.get(f"{BASE}/api/bookings", headers=customer[0], timeout=15).json()
    by_id = {x["id"]: x for x in lst}
    for b in created:
        assert close(by_id[b["id"]]["pricing"]["total"], b["pricing"]["total"], "0.001")


# ---------------------------------------------------------------- 3) partner / merchant views + invoice snapshot
def test_partner_merchant_views_and_invoice_snapshot(admin, customer, catalog, coupons, settings_guard):
    case = "vc_always_conv5_plat49"
    apply_settings(admin, case)
    preview, created, nonce = checkout_like(customer, catalog, "two_cat", "emergency", "TSTXPCT10")
    db = _mongo()
    partner_tok, partner = _login("+919000000003")
    merchant_tok, _ = _login("+919000000002")
    ph = {"Authorization": f"Bearer {partner_tok}"}
    mh = {"Authorization": f"Bearer {merchant_tok}"}
    for b in created:
        # simulate: partner accepted + job completed & paid → invoice generated
        db.bookings.update_one({"id": b["id"]}, {"$set": {
            "partner_id": partner["id"], "status": "completed", "payment_status": "paid"}})
    # the customer's invoice list triggers the idempotent per-user backfill
    r = requests.get(f"{BASE}/api/invoices", headers=customer[0], timeout=30)
    assert r.status_code == 200, r.text[:200]

    for b in created:
        p = b["pricing"]
        plat_only = D(p["convenience_fee"]) + D(p["platform_fee"])
        # -- partner view
        pv = requests.get(f"{BASE}/api/bookings/{b['id']}", headers=ph, timeout=15)
        assert pv.status_code == 200, pv.text[:200]
        pv = pv.json()
        assert "convenience_fee" not in pv["pricing"] and "platform_fee" not in pv["pricing"]
        pbd = pv["breakdown"]
        assert not [c for c in pbd["additional_charges"] if c["key"] in ("convenience_fee", "platform_fee")]
        assert_breakdown_reconciles(pbd, "partner:" + b["code"])
        assert close(pbd["services_subtotal"], p["base"], "0.001")
        assert close(pbd["taxable"], D(p["taxable"]) - plat_only, "0.001")
        assert close(pbd["tax"], pct(D(p["taxable"]) - plat_only, p["gst_pct"]), "0.001")
        # -- merchant list view (if visible) never carries the fees
        ml = requests.get(f"{BASE}/api/bookings", headers=mh, timeout=15).json()
        for mb in ml:
            assert "convenience_fee" not in (mb.get("pricing") or {}) and "platform_fee" not in (mb.get("pricing") or {})
        # -- customer invoice snapshot == booking pricing
        inv = db.invoices.find_one({"booking_id": b["id"], "invoice_type": "booking"}, {"_id": 0})
        assert inv, f"no booking invoice for {b['code']}"
        assert close(inv["total_amount"], p["total"], "0.001")
        assert close(inv["tax"], p["gst"], "0.001")
        assert inv["tax_label"] == "Est. Govt. Taxes"
        ibd = inv["breakdown"]
        assert_breakdown_reconciles(ibd, "invoice:" + b["code"])
        assert close(ibd["total"], p["total"], "0.001")
        # -- rendered documents: label present, no percentage, partner copy hides platform fees
        for hdr, is_partner in ((customer[0], False), (ph, True)):
            h = requests.get(f"{BASE}/api/invoices/{inv['id']}/view", headers=hdr, timeout=30)
            assert h.status_code == 200, h.text[:200]
            txt = re.sub(r"<[^>]+>", " ", h.text)
            assert "Est. Govt. Taxes" in txt
            assert not PCT_RE.search(txt), PCT_RE.search(txt).group(0)
            if is_partner:
                assert "Convenience Fee" not in txt and "Platform Fee" not in txt
            else:
                assert (D(p["convenience_fee"]) > 0) == ("Convenience Fee" in txt)
                assert (D(p["platform_fee"]) > 0) == ("Platform Fee" in txt)
            pdf = requests.get(f"{BASE}/api/invoices/{inv['id']}/pdf", headers=hdr, timeout=30)
            assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
