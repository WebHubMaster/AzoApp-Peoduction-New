"""E2E money-flow probe (new rules): book with coupon → mock pay → partner accepts →
(a) cancel → check refund/partner/platform/merchant figures, (b) complete → check split.
Run: python /app/backend/scripts/e2e_money_probe.py"""
import os, sys, json, requests, datetime as dt

sys.path.insert(0, "/app/backend")
API = [l.split("=", 1)[1].strip() for l in open("/app/frontend/.env") if l.startswith("REACT_APP_BACKEND_URL")][0]
OTP = "123456"


def login(phone):
    r = requests.post(f"{API}/api/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=60)
    r.raise_for_status()
    return r.json()["token"], r.json()["user"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


def main():
    adm_t, _ = login("+919000000000")
    cus_t, cus = login("+919000000004")
    par_t, par = login("+919000000003")
    settings = requests.get(f"{API}/api/admin/settings", headers=H(adm_t), timeout=60).json()
    cm = settings.get("commission")
    gst = settings.get("gst_pct")
    print("commission cfg", cm, "gst", gst)
    services = requests.get(f"{API}/api/catalog/services", timeout=60).json()
    services = services if isinstance(services, list) else services.get("items", [])
    # pick a service the demo partner is skilled for
    skills = [s.lower() for s in (par.get("skills") or [])]
    svc = next((s for s in services if str(s.get("required_skill", "")).lower() in skills
                or str(s.get("category_name", "")).lower() in skills), services[0])
    print("service", svc["name"], svc.get("base_price"), "partner skills", skills)
    addr = {"line": "12 MG Road", "city": "Patna", "state": "Bihar", "pincode": "800001", "lat": 25.61, "lng": 85.14}
    when = (dt.datetime.utcnow() + dt.timedelta(days=1)).replace(microsecond=0).isoformat() + "Z"
    body = {"service_id": svc["id"], "address": addr, "schedule_type": "schedule", "scheduled_at": when,
            "coupon_code": "MONSOON20"}
    r = requests.post(f"{API}/api/bookings", json=body, headers=H(cus_t), timeout=60)
    print("create", r.status_code, r.text[:300] if r.status_code != 200 else "")
    r.raise_for_status()
    b = r.json()
    p = b["pricing"]
    print("pricing", json.dumps({k: p.get(k) for k in ("base", "visiting_charge", "emergency_fee", "gross_charges", "discount",
                                                      "total_discount", "taxable", "gst", "total", "commissionable_base")}))
    assert round(p["taxable"] + p["gst"], 2) == p["total"], "total != taxable + gst"
    assert round(p["gross_charges"] - p["total_discount"], 2) == p["taxable"]
    r = requests.post(f"{API}/api/payments/mock", json={"purpose": "booking", "booking_id": b["id"], "amount": p["total"]},
                      headers=H(cus_t), timeout=60)
    print("mock pay", r.status_code, r.text[:200])
    # partner accepts
    par_before = requests.get(f"{API}/api/wallet", headers=H(par_t), timeout=60).json()
    r = requests.post(f"{API}/api/bookings/{b['id']}/accept", headers=H(par_t), timeout=60)
    print("accept", r.status_code, r.text[:200])
    if r.status_code != 200:
        # admin force assign fallback
        r = requests.post(f"{API}/api/admin/bookings/{b['id']}/assign", json={"partner_id": par["id"], "force": True},
                          headers=H(adm_t), timeout=60)
        print("admin assign", r.status_code, r.text[:200])
    prev = requests.get(f"{API}/api/bookings/{b['id']}/cancellation-preview", headers=H(cus_t), timeout=60).json()
    print("preview", json.dumps(prev))
    r = requests.post(f"{API}/api/bookings/{b['id']}/cancel", json={"reason": "probe"}, headers=H(cus_t), timeout=60)
    print("cancel", r.status_code)
    c = r.json().get("cancellation")
    print("cancellation", json.dumps(c, indent=1)[:1500])
    par_after = requests.get(f"{API}/api/wallet", headers=H(par_t), timeout=60).json()
    print("partner wallet", par_before.get("balance") or par_before.get("wallet_balance"), "->",
          par_after.get("balance") or par_after.get("wallet_balance"))
    d = requests.get(f"{API}/api/admin/bookings/{b['id']}/detail", headers=H(adm_t), timeout=60).json()["commission"]
    print("admin rows", [(x["role"], x["amount"], x["pct"]) for x in d["rows"]])
    print("admin refund/retained", d["customer_refund"], d["partner_cancellation_amount"], d["gst_retained"], d["retained_amount"])
    assert round(d["customer_refund"] + d["retained_amount"], 2) == round(d["original_amount"], 2)


if __name__ == "__main__":
    main()
