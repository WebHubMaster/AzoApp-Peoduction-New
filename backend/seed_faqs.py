"""Idempotent seed: add common customer FAQs so the homepage FAQ section looks full."""
import asyncio
import uuid
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
from config.database import db, now_iso  # noqa: E402

FAQS = [
    ("How do I book a service?",
     "Just pick a category, choose a service, select a slot and confirm. You can also add multiple services to one booking before checkout."),
    ("Is there a visiting charge?",
     "A small visiting charge may apply, but it is waived on most repairs when you get the work done. The exact amount is always shown before you confirm."),
    ("How is pricing decided?",
     "Every service has transparent, fixed pricing shown upfront. Spare-part prices are listed in the category rate card and confirmed by the professional after inspection."),
    ("Are your professionals verified?",
     "Yes. Every partner goes through ID, background and skill verification before they can accept jobs, so you always get a trusted expert at your doorstep."),
    ("Can I reschedule or cancel a booking?",
     "Absolutely. You can reschedule or cancel from your dashboard. Cancellations before the professional starts are eligible for a refund as per our policy."),
    ("What payment methods are accepted?",
     "You can pay securely online via UPI, cards and net-banking, or use your wallet. Payments are 100% secure and refundable."),
    ("Is there any warranty on the service?",
     "Most repairs come with a service warranty (shown on each item in the rate card). If an issue recurs within the warranty period, we fix it free."),
    ("Do you offer services in my area?",
     "We are expanding fast. Enter your location on the homepage — if we are live in your area you can book instantly, otherwise you can join the waitlist."),
    ("What is the merchant referral program?",
     "Shopkeepers can refer partners and book services for their customers to earn lifetime commission on every completed job."),
]


async def main():
    n = 0
    for i, (q, a) in enumerate(FAQS):
        exists = await db.faqs.find_one({"question": q})
        doc = {"question": q, "answer": a, "category": "General", "status": "active"}
        if exists:
            await db.faqs.update_one({"id": exists["id"]}, {"$set": {**doc, "order": i}})
        else:
            doc.update({"id": str(uuid.uuid4()), "order": i, "created_at": now_iso()})
            await db.faqs.insert_one(doc)
            n += 1
    total = await db.faqs.count_documents({"status": "active"})
    print(f"FAQ seed done. New: {n}, active total: {total}")


if __name__ == "__main__":
    asyncio.run(main())
