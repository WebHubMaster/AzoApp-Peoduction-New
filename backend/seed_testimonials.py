"""Idempotent seed: default colorful testimonials for the landing page."""
import asyncio
import uuid
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
from config.database import db, now_iso  # noqa: E402

DATA = [
    {"title": "Very time convenient!", "theme": "rose", "rating": 5.0, "name": "Priyanka", "city": "Delhi",
     "service": "Salon at home",
     "text": "Very happy with the salon service. Professional came on time & completed her work with perfection. Overall a great relaxing experience."},
    {"title": "Spotless. Advance tools", "theme": "violet", "rating": 5.0, "name": "Atharva Singh", "city": "Pune",
     "service": "Bathroom cleaning",
     "text": "Amazing! Professional used the scrubbing machine to remove all the hard water stains. Now my bathroom is spotless."},
    {"title": "Expert Professional", "theme": "teal", "rating": 4.7, "name": "Aman", "city": "Gurgaon",
     "service": "AC repair",
     "text": "Professional was very knowledgeable about AC repair. He had all the necessary spare parts for faster & easier service."},
    {"title": "No hidden charges", "theme": "amber", "rating": 5.0, "name": "Sneha Kapoor", "city": "Noida",
     "service": "Deep cleaning",
     "text": "Transparent pricing exactly as shown in the rate card. The team was polite, quick and left my home sparkling clean."},
    {"title": "Booked in a minute", "theme": "sky", "rating": 5.0, "name": "Rahul Verma", "city": "Faridabad",
     "service": "Electrician",
     "text": "The electrician arrived on time and fixed everything perfectly. Booking took less than a minute — super smooth!"},
    {"title": "Highly recommend", "theme": "emerald", "rating": 4.8, "name": "Anjali Mehta", "city": "Delhi",
     "service": "Plumbing",
     "text": "Verified professional, neat work and fair pricing. AzoApp has become my go-to for all home services now."},
]


async def main():
    n = 0
    for i, d in enumerate(DATA):
        exists = await db.testimonials.find_one({"title": d["title"], "name": d["name"]})
        doc = {**d, "order": i, "status": "active", "avatar": ""}
        if exists:
            await db.testimonials.update_one({"id": exists["id"]}, {"$set": doc})
        else:
            doc["id"] = str(uuid.uuid4())
            doc["created_at"] = now_iso()
            await db.testimonials.insert_one(doc)
            n += 1
    total = await db.testimonials.count_documents({})
    print(f"Seeded/updated testimonials. New: {n}, total now: {total}")


if __name__ == "__main__":
    asyncio.run(main())
