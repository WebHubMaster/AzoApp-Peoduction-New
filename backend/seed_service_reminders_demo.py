"""
Premium Service Reminders demo seeder for the AzoApp Merchant Panel.

Force-reseeds m_reminders + m_reminder_notifications for the demo merchant with
rich, production-like data matching the module spec:
  Total 28 · Upcoming 13 · Overdue 9 · Completed 4 · Cancelled 2 · Due today 0

Run:  python seed_service_reminders_demo.py
"""
import asyncio
import random
from datetime import timedelta

from config.database import db, now_iso
from models.user import new_id
import services.merchant_panel_service as mps

MERCHANT_PHONE = "+919000000002"

NAMES = ["Pooja Mishra", "Anjali Nair", "Rahul Sharma", "Sunita Devi", "Vikram Rao",
         "Meena Kumari", "Arjun Patel", "Kavya Reddy", "Deepak Verma", "Ritu Singh",
         "Manoj Gupta", "Sneha Iyer", "Amit Joshi", "Farah Khan", "Rohit Bansal",
         "Priya Menon", "Gaurav Malhotra", "Nisha Aggarwal", "Karan Mehta", "Divya Pillai"]
PRODUCTS = [
    ("Home Appliances", "Front-load Washing Machine", "LG", "FHM1207"),
    ("Home Appliances", "Split AC 1.5 Ton", "Voltas", "SAC183V"),
    ("Home Appliances", "Refrigerator 340L", "Samsung", "RT34M"),
    ("Home Appliances", "Geyser 15L", "Bajaj", "GX15"),
    ("Kitchen", "Chimney 90cm", "Faber", "HOOD90"),
    ("Kitchen", "Microwave Oven", "IFB", "MW25"),
    ("Home Appliances", "Water Purifier RO", "Kent", "GRAND+"),
    ("Electronics", "LED TV 55\"", "Sony", "X75K"),
]
SERVICES = ["General Maintenance", "Deep Cleaning", "Filter Replacement", "Gas Refill",
            "AMC Service", "Installation Check", "Repair Follow-up", "Chimney Cleaning"]
TECHS = ["Ramesh (Sr. Technician)", "Suresh Kumar", "Imran Ali", "Ajay Yadav"]


def _phone():
    return "9" + "".join(str(random.randint(0, 9)) for _ in range(9))


async def main():
    merchant = await db.users.find_one({"phone": MERCHANT_PHONE, "role": "merchant"}, {"_id": 0}) \
        or await db.users.find_one({"role": "merchant"}, {"_id": 0})
    if not merchant:
        print("No merchant found — run the app once first.")
        return
    mid = merchant["id"]
    await db.m_reminders.delete_many({"merchant_id": mid})
    await db.m_reminder_notifications.delete_many({"merchant_id": mid})

    # status plan: 13 upcoming, 9 overdue, 4 completed, 2 cancelled, 0 due today = 28
    plan = ["upcoming"] * 13 + ["overdue"] * 9 + ["completed"] * 4 + ["cancelled"] * 2
    random.shuffle(plan)
    freqs = ["monthly", "quarterly", "half_yearly", "yearly", "one_time"]
    prios = ["low", "medium", "high", "critical"]

    for i, st in enumerate(plan):
        cat, prod, brand, model = random.choice(PRODUCTS)
        svc = random.choice(SERVICES)
        freq = random.choice(freqs)
        name = NAMES[i % len(NAMES)]
        mobile = _phone()
        if st == "upcoming":
            offset = random.randint(3, 60)
        elif st == "overdue":
            offset = -random.randint(1, 45)
        else:
            offset = -random.randint(5, 40)
        nxt = mps._now() + timedelta(days=offset)
        last = nxt - timedelta(days=30 * mps._FREQ_MONTHS.get(freq, 6))
        status = "active"
        completions = []
        if st == "completed":
            status = "completed"
            amt = random.choice([399, 499, 599, 799, 999])
            completions = [{
                "at": mps._iso(mps._now() - timedelta(days=random.randint(1, 20))),
                "service_date": mps._iso(nxt)[:10], "amount": float(amt),
                "technician": random.choice(TECHS),
                "work_done": f"{svc} completed. Cleaned and tested unit.",
                "parts": random.choice(["", "Filter", "Gas top-up", "Belt"]),
                "notes": "Customer satisfied.",
            }]
        elif st == "cancelled":
            status = "cancelled"

        remind_before = random.choice([1, 3, 7, 15])
        doc = {
            "id": new_id(), "merchant_id": mid,
            "customer_name": name, "customer_mobile": mobile,
            "customer_email": f"{name.split()[0].lower()}@example.com",
            "customer_address": f"{random.randint(1,99)}, MG Road, City",
            "product_category": cat, "product": prod, "brand": brand, "model": model,
            "serial_number": f"SN{random.randint(100000,999999)}",
            "invoice_number": f"INV-{random.randint(1000,9999)}",
            "service_type": svc,
            "purchase_date": mps._iso(last - timedelta(days=365))[:10],
            "install_date": mps._iso(last - timedelta(days=350))[:10],
            "last_service_date": mps._iso(last)[:10],
            "next_service_date": mps._iso(nxt)[:10],
            "service_time": random.choice(["", "10:00", "14:30", "11:00"]),
            "reminder_type": "recurring" if freq != "one_time" else "one_time",
            "frequency": freq, "remind_before": remind_before,
            "notify_channels": {"push": True, "whatsapp": True,
                                "sms": random.choice([True, False]), "email": random.choice([True, False])},
            "notify_schedule": {"before": True, "due": True, "overdue": True, "after": True},
            "notes": "", "priority": random.choice(prios),
            "status": status, "completions": completions,
            "history": [{"at": mps._iso(mps._now() - timedelta(days=random.randint(5, 90))),
                         "event": "created", "label": "Service reminder created"}],
            "created_at": mps._iso(mps._now() - timedelta(days=random.randint(5, 90))),
            "updated_at": now_iso(),
        }
        if st == "completed" and completions:
            doc["history"].append({"at": completions[0]["at"], "event": "completed",
                                   "label": f"Service completed · ₹{int(completions[0]['amount'])}",
                                   "date": completions[0]["service_date"]})
        await db.m_reminders.insert_one(dict(doc))
        # notification history
        kinds = ["before", "due", "overdue"] if st in ("upcoming", "overdue") else \
                (["before", "due", "after"] if st == "completed" else ["before"])
        try:
            await mps._record_notifications(mid, doc, kinds)
        except Exception as e:  # noqa: BLE001
            print("notif err", e)

    stats = await mps.reminder_stats(mid)
    notif = await db.m_reminder_notifications.count_documents({"merchant_id": mid})
    print(f"Seeded reminders for {merchant.get('shop_name')}: {stats}")
    print(f"Notification records: {notif}")


if __name__ == "__main__":
    asyncio.run(main())
