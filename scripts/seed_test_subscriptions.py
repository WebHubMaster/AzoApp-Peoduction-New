import requests, datetime as dt, sys
B = sys.argv[1] + "/api"
def tok(p):
    return requests.post(f"{B}/auth/verify-otp", json={"phone": p, "otp": "123456"}).json()["token"]
C = {"Authorization": f"Bearer {tok('+919000000004')}"}
A = {"Authorization": f"Bearer {tok('+919000000000')}"}
addr = {"line": "12 Boring Road", "city": "Patna", "pincode": "800001", "lat": 25.6, "lng": 85.13}
today = dt.date.today()
plans = [("monthly", -20), ("weekly", -10), ("weekly", -3), ("monthly", 2), ("daily", 0), ("weekly", 5)]
ids = []
for i, (pt, off) in enumerate(plans):
    r = requests.post(f"{B}/subscriptions", headers=C, json={"service_id": "svc-maid-fulltime", "plan_type": pt,
        "start_date": (today + dt.timedelta(days=off)).isoformat(), "preferred_time": "09:00", "address": addr})
    print("create", pt, r.status_code, r.text[:120] if r.status_code != 200 else r.json()["code"])
    if r.status_code != 200: continue
    s = r.json(); ids.append(s["id"])
    if i == 5: continue  # leave pending payment
    o = requests.post(f"{B}/subscriptions/{s['id']}/pay/order", headers=C).json()
    v = requests.post(f"{B}/subscriptions/{s['id']}/pay/verify", headers=C, json={"order_id": o.get("order_id") or o.get("id") or "", "payment_id": "pay_mock", "signature": "mock"})
    print(" pay", v.status_code, v.text[:100])
parts = requests.get(f"{B}/subscriptions/admin/{ids[0]}/partners", headers=A).json()
pid = parts[0]["id"] if parts else None
for sid in ids[:3]:
    if pid:
        print(" assign", requests.post(f"{B}/subscriptions/admin/{sid}/assign", headers=A, json={"partner_id": pid}).status_code)
    sub = requests.get(f"{B}/subscriptions/{sid}", headers=A).json()
    for j, d in enumerate([d for d in sub.get("schedule", []) if d["status"] == "scheduled" and d["date"] <= today.isoformat()]):
        st = "maid_absent" if j == 2 else "completed"
        requests.post(f"{B}/subscriptions/admin/{sid}/days/{d['date']}", headers=A, json={"status": st})
f = requests.post(f"{B}/subscriptions/admin/{ids[1]}/finalize", headers=A); print("finalize", f.status_code, f.text[:120])
print(requests.get(f"{B}/subscriptions/admin/stats", headers=A).json())
