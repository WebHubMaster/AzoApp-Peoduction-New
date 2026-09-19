"""One-off cleanup of TEST_ artefacts created by automated suites (keeps preview app tidy)."""
import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]


async def main():
    report = {}
    report["categories"] = (await db.categories.delete_many({"name": {"$regex": "^TEST_"}})).deleted_count
    report["services"] = (await db.services.delete_many({"name": {"$regex": "^TEST_"}})).deleted_count
    report["banners"] = (await db.banners.delete_many({"title": {"$regex": "^TEST_"}})).deleted_count
    report["blogs"] = (await db.blogs.delete_many({"title": {"$regex": "^TEST_"}})).deleted_count
    report["faqs"] = (await db.faqs.delete_many({"question": {"$regex": "^TEST_"}})).deleted_count
    report["plans"] = (await db.plans.delete_many({"name": {"$regex": "^TEST_"}})).deleted_count
    report["notifications"] = (await db.notifications.delete_many({"title": {"$regex": "^TEST_"}})).deleted_count
    report["tickets"] = (await db.tickets.delete_many({"subject": {"$regex": "^TEST_"}})).deleted_count
    print(report)


asyncio.run(main())
