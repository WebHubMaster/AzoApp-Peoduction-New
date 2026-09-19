"""E2E verification for the cancellation / refund / invoice fixes (local)."""
import requests, time, uuid, json

BASE = "http://localhost:8001/api"
OTP = "123456"
PASS, FAIL = [], []


def ck(name, cond, extra=""):
    (PASS if cond else FAIL).append(name)
    print(("PASS " if cond else "FAIL ") + name + ("  " + extra if extra else ""))


def login(phone):
    requests.post(f"{BASE}/auth/send-otp", json={"phone": phone})
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": phone, "otp": OTP})
    return r.json()["token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


def make_booking(ct):
    svcs = requests.get(f"{BASE}/catalog/services", headers=H(ct)).json()
    svc = (svcs if isinstance(svcs, list) else svcs.get("items") or svcs.get("services"))[0]
    body = {
        "items": [{"service_id": svc["id"], "addons": [], "qty": 1}],
        "address": {"line": "12 MG Road", "pincode": "800001", "city": "Patna",
                    "state": "Bihar", "lat": 25.6, "lng": 85.1},
        "schedule_type": "schedule",
        "scheduled_at": "2026-12-01T10:00:00+00:00",
        "order_group_id": "G-" + uuid.uuid4().hex[:8],
        "idempotency_key": uuid.uuid4().hex,
        "apply_visiting": True, "apply_emergency": False,
    }
    r = requests.post(f"{BASE}/bookings/grouped", headers=H(ct), json=body)
    return r.json()


def pay(ct, bid):
    requests.post(f"{BASE}/payments/order", headers=H(ct), json={"purpose": "booking", "booking_id": bid})
    requests.post(f"{BASE}/payments/mock", headers=H(ct), json={"purpose": "booking", "booking_id": bid})


def get_booking(ct, bid):
    r = requests.get(f"{BASE}/bookings/{bid}", headers=H(ct))
    return r.json()


def invoices(ct):
    return requests.get(f"{BASE}/invoices?page_size=100", headers=H(ct)).json()


def main():
    ct = login("+919000000004")
    at = login("+919000000000")
    partner = requests.get(f"{BASE}/admin/partners", headers=H(at)).json()
    # partner id
    pid = None
    plist = partner if isinstance(partner, list) else partner.get("items") or partner.get("partners") or []
    for p in plist:
        if p.get("phone") == "+919000000003":
            pid = p.get("id")
    print("partner id:", pid)

    # ---------- CASE 1: cancel BEFORE partner assigned -> 100% refund ----------
    b1 = make_booking(ct)
    bid1 = b1["id"]
    pay(ct, bid1)
    b1 = get_booking(ct, bid1)
    total1 = float(b1["pricing"]["total"])
    print(f"\nCASE1 booking {b1['code']} total={total1} partner={b1.get('partner_id')}")
    # cancellation preview (breakdown card)
    pv = requests.get(f"{BASE}/bookings/{bid1}/cancellation-preview", headers=H(ct)).json()
    ck("C1 preview refund == total", abs(float(pv.get("refund", 0)) - total1) < 0.01, str(pv.get("refund")))
    ck("C1 preview cancellable True", pv.get("cancellable") is True)
    ck("C1 preview partner_was_assigned False", pv.get("partner_was_assigned") is False)
    r = requests.post(f"{BASE}/bookings/{bid1}/cancel", headers=H(ct), json={"reason": "Booked by mistake"})
    cj = r.json()
    canc = cj.get("cancellation", {})
    ck("C1 refund_pct == 100", canc.get("refund_pct") == 100, str(canc.get("refund_pct")))
    ck("C1 refund == total (incl tax+fees)", abs(float(canc.get("refund", 0)) - total1) < 0.01,
       f"refund={canc.get('refund')} total={total1}")
    ck("C1 partner_cut == 0", float(canc.get("partner_cut", -1)) == 0)
    ck("C1 partner_was_assigned False", canc.get("partner_was_assigned") is False)

    # invoices for booking 1: ONE cancellation (credit-note) + ONE refund receipt, NO transaction
    inv = invoices(ct)
    items = inv["items"]
    b1_invs = [i for i in items if i.get("booking_id") == bid1 or i.get("booking_code") == b1["code"]]
    canc_invs = [i for i in b1_invs if i.get("invoice_type") == "cancellation"]
    refund_invs = [i for i in b1_invs if i.get("invoice_type") == "refund"]
    txn_invs = [i for i in b1_invs if i.get("invoice_type") == "transaction"]
    ck("C1 exactly 1 cancellation invoice", len(canc_invs) == 1, f"got {len(canc_invs)}")
    ck("C1 exactly 1 refund receipt", len(refund_invs) == 1, f"got {len(refund_invs)}")
    ck("C1 NO transaction invoice for booking", len(txn_invs) == 0, f"got {len(txn_invs)}")
    if canc_invs:
        ci = canc_invs[0]
        ck("C1 cancellation credit-note total == original", abs(float(ci.get("total_amount", 0)) - total1) < 0.01,
           f"inv={ci.get('total_amount')}")
        ck("C1 cancellation payment_status == cancelled", ci.get("payment_status") == "cancelled",
           str(ci.get("payment_status")))
        ck("C1 customer invoice has NO partner_cancellation_amount", "partner_cancellation_amount" not in ci)
    if refund_invs:
        ri = refund_invs[0]
        ck("C1 refund receipt total == refund", abs(float(ri.get("total_amount", 0)) - total1) < 0.01,
           f"inv={ri.get('total_amount')}")
        ck("C1 refund receipt payment_status == refunded", ri.get("payment_status") == "refunded",
           str(ri.get("payment_status")))
        ck("C1 refund receipt label", ri.get("document_label") == "Refund Receipt")

    # ---------- CASE 2: cancel AFTER partner assigned -> configured % split ----------
    b2 = make_booking(ct)
    bid2 = b2["id"]
    pay(ct, bid2)
    # admin assign partner
    ar = requests.post(f"{BASE}/admin/bookings/{bid2}/assign", headers=H(at), json={"partner_id": pid})
    print("assign:", ar.status_code)
    b2 = get_booking(ct, bid2)
    pr = b2["pricing"]
    base = float(pr.get("commissionable_base") or pr.get("subtotal") or pr.get("base") or 0)
    gst = float(pr.get("gst") or 0)
    print(f"CASE2 booking {b2['code']} base={base} gst={gst} partner={b2.get('partner_id')}")
    exp_refund = round((base + gst) * 0.8, 2)
    exp_partner_charge = round(base * 0.2, 2)
    exp_platform = round(exp_partner_charge * 0.32, 2)
    exp_partner_cut = round(exp_partner_charge - exp_platform, 2)
    r = requests.post(f"{BASE}/bookings/{bid2}/cancel", headers=H(ct), json={"reason": "changed mind"})
    cj = r.json()
    canc = cj.get("cancellation", {})
    print("CASE2 cancellation:", json.dumps({k: canc.get(k) for k in
          ["refund_pct", "refund", "partner_cancellation_pct", "cancel_charge", "admin_cut", "partner_cut"]}))
    ck("C2 refund_pct == 80", float(canc.get("refund_pct", 0)) == 80)
    ck("C2 refund == (base+gst)*80%", abs(float(canc.get("refund", 0)) - exp_refund) < 0.02,
       f"got={canc.get('refund')} exp={exp_refund}")
    ck("C2 partner_cancellation_pct == 20", float(canc.get("partner_cancellation_pct", 0)) == 20)
    ck("C2 cancel_charge == base*20%", abs(float(canc.get("cancel_charge", 0)) - exp_partner_charge) < 0.02,
       f"got={canc.get('cancel_charge')} exp={exp_partner_charge}")
    ck("C2 partner_cut == charge - platform32%", abs(float(canc.get("partner_cut", 0)) - exp_partner_cut) < 0.02,
       f"got={canc.get('partner_cut')} exp={exp_partner_cut}")

    inv = invoices(ct)
    b2_invs = [i for i in inv["items"] if i.get("booking_id") == bid2]
    canc_invs = [i for i in b2_invs if i.get("invoice_type") == "cancellation"]
    txn_invs = [i for i in b2_invs if i.get("invoice_type") == "transaction"]
    ck("C2 exactly 1 cancellation invoice", len(canc_invs) == 1, f"got {len(canc_invs)}")
    ck("C2 NO transaction invoice", len(txn_invs) == 0, f"got {len(txn_invs)}")

    # ---------- IDEMPOTENCY: hammer the list concurrently ----------
    import concurrent.futures as cf
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        list(ex.map(lambda _: invoices(ct), range(12)))
    inv = invoices(ct)
    b1c = len([i for i in inv["items"] if i.get("booking_id") == bid1 and i.get("invoice_type") == "cancellation"])
    b2c = len([i for i in inv["items"] if i.get("booking_id") == bid2 and i.get("invoice_type") == "cancellation"])
    ck("IDEMP: booking1 still exactly 1 cancellation invoice after 12x list", b1c == 1, f"got {b1c}")
    ck("IDEMP: booking2 still exactly 1 cancellation invoice after 12x list", b2c == 1, f"got {b2c}")
    ck("IDEMP: no transaction invoices for booking events overall",
       all(i.get("invoice_type") != "transaction" for i in inv["items"]
           if i.get("booking_id") in (bid1, bid2)))

    # admin booking detail breakdown transparency
    d = requests.get(f"{BASE}/admin/bookings/{bid2}/detail", headers=H(at)).json()
    comm = d.get("commission", {})
    ck("ADMIN detail has cancellation breakdown fields",
       all(k in comm for k in ["customer_refund", "partner_cancellation_amount", "platform_commission", "total_adjustment"]))

    print(f"\n==== {len(PASS)} PASS / {len(FAIL)} FAIL ====")
    if FAIL:
        print("FAILURES:", FAIL)


if __name__ == "__main__":
    main()
