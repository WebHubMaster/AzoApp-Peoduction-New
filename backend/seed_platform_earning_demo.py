"""Dev-only seed for the Platform Earning module. Creates realistic bookings and their
financial records (payment txn, commission ledger via the REAL CommissionEngine.split,
refunds, withdrawals, registration fees, kit purchases). Every row is tagged
_seed="platform_earning" and is removed/re-created on each run."""
import asyncio
import os
import random
import uuid
from datetime import datetime, timezone, timedelta

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from config.database import db  # noqa: E402
from services.engines import CommissionEngine  # noqa: E402

TAG = "platform_earning"
CITIES = [("Patna", "Bihar", "800001", 0.38), ("Gaya", "Bihar", "823001", 0.16), ("Muzaffarpur", "Bihar", "842001", 0.14),
          ("Bhagalpur", "Bihar", "812001", 0.10), ("Ranchi", "Jharkhand", "834001", 0.14), ("Darbhanga", "Bihar", "846004", 0.08)]
METHODS = [("upi", "UPI", 0.55, 0.0), ("card", "Card", 0.2, 2.0), ("netbanking", "Net Banking", 0.1, 1.9),
           ("wallet", "Wallet", 0.1, 1.9), ("cod", "Cash", 0.05, 0.0)]
GST = 18.0


def nid():
    return str(uuid.uuid4())


def r2(x):
    return round(float(x) + 1e-9, 2)


def wpick(items, wi):
    return random.choices(items, weights=[i[wi] for i in items], k=1)[0]


async def clear():
    for c in ["bookings", "payment_transactions", "commission_ledger", "refunds", "partner_withdrawals",
              "merchant_withdrawals", "starter_kit_purchases"]:
        await db[c].delete_many({"_seed": TAG})


async def main():
    random.seed(42)
    await clear()
    settings = await db.settings.find_one({}, {"_id": 0}) or {}
    cm = CommissionEngine._cm(settings)
    services = await db.services.find({}, {"_id": 0, "id": 1, "name": 1, "category_id": 1, "base_price": 1}).to_list(100)
    cats = {c["id"]: c["name"] for c in await db.categories.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(100)}
    partners = await db.users.find({"role": "partner"}, {"_id": 0}).to_list(100)
    merchants = await db.users.find({"role": "merchant"}, {"_id": 0}).to_list(100)
    customers = await db.users.find({"role": "customer"}, {"_id": 0}).to_list(200)
    now = datetime.now(timezone.utc)
    bookings, pays, ledgers, refunds = [], [], [], []
    n = 0
    for day in range(200, -1, -1):
        base_day = now - timedelta(days=day)
        growth = 1 + (200 - day) / 200
        for _ in range(random.randint(2, int(4 * growth) + 2)):
            n += 1
            svc = random.choice(services)
            cust = random.choice(customers)
            partner = random.choice(partners)
            city, state, pin, _w = wpick(CITIES, 3)
            method, mlabel, _mw, gw_pct = wpick(METHODS, 2)
            via_merchant = merchants and random.random() < 0.12
            merchant = merchants[0] if via_merchant else None
            at = (base_day.replace(hour=random.randint(7, 21), minute=random.randint(0, 59), second=random.randint(0, 59)))
            iso = at.isoformat()
            service_net = r2(float(svc.get("base_price") or 399) * random.choice([1, 1, 1, 1.2, 1.5, 2]))
            conv = random.choice([0, 29, 49])
            pfee = random.choice([0, 0, 19])
            commission = r2(service_net * float(cm.get("platform_pct", 32)) / 100)
            gst = r2((commission + conv + pfee) * GST / 100)
            total = r2(service_net + conv + pfee + gst)
            pricing = {"base": service_net, "addons_total": 0, "subtotal": service_net, "service_net": service_net,
                       "convenience_fee": conv, "platform_fee": pfee, "gst": gst, "tax": gst, "discount": 0,
                       "total": total, "commissionable_base": service_net}
            roll = random.random()
            status = "paid" if roll < 0.84 else "cancelled" if roll < 0.95 else random.choice(["searching", "assigned", "started"])
            code = f"AZPE{100000 + n}"
            bid = nid()
            bookings.append({
                "id": bid, "code": code, "customer_id": cust["id"], "customer_name": cust.get("name"),
                "customer_phone": cust.get("phone"), "service_id": svc["id"], "service_name": svc["name"],
                "category_id": svc.get("category_id"), "category_name": cats.get(svc.get("category_id"), "Other"),
                "merchant_id": merchant["id"] if merchant else None,
                "merchant_name": (merchant.get("shop_name") or merchant.get("name")) if merchant else None,
                "booking_type": "direct", "partner_id": partner["id"], "partner_name": partner.get("name"),
                "address": {"line": "Demo address", "city": city, "state": state, "pincode": pin},
                "schedule_type": "now", "pricing": pricing, "status": status,
                "payment_status": "paid" if status == "paid" else "refunded" if status == "cancelled" else "pending",
                "payment_method": "cos" if method == "cod" else "prepaid",
                "timeline": [{"status": "searching", "at": iso}, {"status": status, "at": iso}],
                "created_at": iso, "updated_at": iso, "_seed": TAG,
            })
            if status not in ("paid", "cancelled"):
                continue
            txn_ref = f"TXN-PE-{500000 + n}"
            pays.append({
                "id": nid(), "txn_ref": txn_ref, "customer_id": cust["id"], "customer_name": cust.get("name"),
                "customer_phone": cust.get("phone"), "service_name": svc["name"],
                "category": cats.get(svc.get("category_id"), "Other"), "amount": total, "method": method,
                "method_label": mlabel, "status": "refunded" if status == "cancelled" else "success",
                "gateway": "cash" if method == "cod" else "razorpay",
                "gateway_payment_id": f"pay_{uuid.uuid4().hex[:14]}", "gateway_order_id": f"order_{uuid.uuid4().hex[:14]}",
                "gateway_fee": r2(total * gw_pct / 100), "order_created": True, "booking_code": code,
                "invoice": {"subtotal": r2(total - gst), "tax": gst, "total": total},
                "timeline": [{"at": iso, "label": "Payment initiated"}, {"at": iso, "label": "Payment captured"}],
                "created_at": iso, "updated_at": iso, "_seed": TAG,
            })
            if status == "paid":
                s = CommissionEngine.split(service_net, cm, partner.get("referred_by_merchant"),
                                           merchant["id"] if merchant else None)
                done = (at + timedelta(hours=random.randint(1, 6))).isoformat()
                ledgers.append({
                    "id": nid(), "booking_id": bid, "booking_code": code, "partner_id": partner["id"],
                    "customer_id": cust["id"], "partner_earning": s["partner_earning"], "visiting_charge": 0.0,
                    "partner_total": s["partner_earning"], "platform_gross": s["platform_gross"],
                    "platform_earning": s["platform_earning"], "merchant_referral": s["merchant_referral"],
                    "referral_merchant_id": s["referral_merchant_id"], "merchant_customer": s["merchant_customer"],
                    "customer_merchant_id": s["customer_merchant_id"], "merchant_booking": s["merchant_customer"],
                    "merchant_id": s["customer_merchant_id"], "base": s["base"], "gross": total, "tax": gst,
                    "platform_fees": r2(conv + pfee), "platform_total": r2(s["platform_earning"] + conv + pfee),
                    "rates": s["rates"], "kind": "completion_cos" if method == "cod" else "completion",
                    "cash_mode": method == "cod", "created_at": done, "_seed": TAG,
                })
            else:
                rpct = random.choice([100, 80, 80, 75])
                ppct = 0 if rpct == 100 else float(cm.get("partner_cancellation_pct", 20))
                ref_amt = r2(total * rpct / 100)
                remaining = r2(total - ref_amt)
                partner_cut = r2(remaining * 0.7) if rpct < 100 else 0.0
                platform_cut = r2(remaining - partner_cut)
                c_at = (at + timedelta(minutes=random.randint(10, 300))).isoformat()
                rstatus = random.choices(["processed", "initiated", "failed"], weights=[0.86, 0.1, 0.04])[0]
                refunds.append({
                    "id": nid(), "booking_id": bid, "booking_code": code, "customer_name": cust.get("name"),
                    "customer_phone": cust.get("phone"), "partner_name": partner.get("name"),
                    "service_name": svc["name"], "original_amount": total, "service_cost": r2(total - gst),
                    "tax_amount": gst, "refund_pct": rpct, "partner_cancellation_pct": ppct,
                    "refund_amount": ref_amt, "amount": ref_amt, "partner_cancellation_amount": partner_cut,
                    "platform_commission": platform_cut, "method": "source", "status": rstatus,
                    "cancelled_by": random.choice(["customer", "customer", "partner"]),
                    "cancellation_reason": random.choice(["Found a cheaper option", "Plan changed", "Partner delayed", "Booked by mistake"]),
                    "timeline": [{"at": c_at, "label": "Booking cancelled"}, {"at": c_at, "label": f"Refund of {ref_amt} initiated"}],
                    "cancelled_at": c_at, "initiated_at": c_at,
                    "completed_at": c_at if rstatus == "processed" else None,
                    "created_at": c_at, "_seed": TAG,
                })
    # one duplicate gateway reference (anomaly the dashboard should surface)
    if len(pays) > 10:
        dup = dict(pays[5]); dup["id"] = nid(); dup["_seed"] = TAG
        pays.append(dup)

    wds, mwds = [], []
    for i in range(70):
        p = random.choice(partners)
        at = (now - timedelta(days=random.randint(0, 190), hours=random.randint(0, 23))).isoformat()
        amt = float(random.choice([500, 1000, 1500, 2000, 3000, 5000]))
        st = random.choices(["completed", "pending", "failed", "rejected"], weights=[0.75, 0.12, 0.07, 0.06])[0]
        fee = r2(amt * 0.02)
        wds.append({"id": nid(), "partner_id": p["id"], "partner_name": p.get("name"), "amount": amt, "fee": fee,
                    "net_amount": r2(amt - fee), "method": random.choice(["upi", "bank"]), "status": st,
                    "requested_at": at, "created_at": at, "processed_at": at if st != "pending" else None,
                    "payout": {"simulated": True, "status": st}, "_seed": TAG})
    for m in merchants:
        for i in range(14):
            at = (now - timedelta(days=random.randint(0, 190))).isoformat()
            amt = float(random.choice([300, 600, 900, 1200]))
            st = random.choices(["completed", "pending", "failed"], weights=[0.8, 0.14, 0.06])[0]
            mwds.append({"id": nid(), "merchant_id": m["id"], "merchant_name": m.get("shop_name") or m.get("name"),
                         "amount": amt, "fee": 0.0, "net_amount": amt, "method": "upi", "upi_id": "", "bank": {},
                         "status": st, "reason": "", "requested_at": at, "created_at": at,
                         "processed_at": at if st != "pending" else None, "_seed": TAG})
    regs, kits = [], []
    for p in partners:
        at = (now - timedelta(days=random.randint(5, 190))).isoformat()
        regs.append({"id": nid(), "txn_ref": f"REG-PE-{uuid.uuid4().hex[:8].upper()}", "purpose": "partner_registration_fee",
                     "customer_id": p["id"], "customer_name": p.get("name"), "customer_phone": p.get("phone"),
                     "amount": 499.0, "method": "upi", "method_label": "UPI", "status": "success", "gateway": "razorpay",
                     "gateway_fee": r2(499 * 0.02), "service_name": "Partner Registration Fee", "category": "Registration",
                     "created_at": at, "updated_at": at, "_seed": TAG})
        if random.random() < 0.6:
            at2 = (now - timedelta(days=random.randint(0, 150))).isoformat()
            kits.append({"id": nid(), "user_id": p["id"], "user_name": p.get("name"), "user_phone": p.get("phone"),
                         "amount": 1499.0, "method": "razorpay", "status": "paid", "tracking_status": "delivered",
                         "created_at": at2, "_seed": TAG})

    for coll, rows in [("bookings", bookings), ("payment_transactions", pays + regs), ("commission_ledger", ledgers),
                       ("refunds", refunds), ("partner_withdrawals", wds), ("merchant_withdrawals", mwds),
                       ("starter_kit_purchases", kits)]:
        if rows:
            await db[coll].insert_many(rows)
        print(f"{coll}: {len(rows)}")


if __name__ == "__main__":
    asyncio.run(main())
