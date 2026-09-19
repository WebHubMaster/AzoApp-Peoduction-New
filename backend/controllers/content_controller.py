"""Generic CRUD for CMS/content + support tickets, notifications, payouts, refunds."""
from fastapi import HTTPException
from config.database import db, now_iso
from models.user import new_id


async def list_docs(coll, q=None, sort=-1):
    return await db[coll].find(q or {}, {"_id": 0}).sort("created_at", sort).to_list(500)


# Public storefront payloads (homepage / promotions / config) are read-through
# cached; any admin write to these collections must invalidate them immediately.
_PUBLIC_COLLS = {"service_areas", "homepage_sections", "banners", "coupons", "offers", "faqs", "testimonials",
                 "membership_plans", "categories", "subcategories", "services", "blogs", "faq_categories"}


async def _bust_public(coll):
    if coll in _PUBLIC_COLLS:
        from services import cache_service
        await cache_service.bust_prefix("site:")


async def create_doc(coll, data):
    from services import sanitize_service
    data = sanitize_service.sanitize_doc(coll, data)
    doc = {"id": new_id(), "created_at": now_iso(), **data}
    if coll == "blogs":
        _prep_blog(doc)
        doc["slug"] = await _unique_blog_slug(doc.get("slug"))
    await db[coll].insert_one(dict(doc))
    doc.pop("_id", None)
    await _bust_public(coll)
    return doc


async def _unique_blog_slug(slug, ignore_id=None):
    """Guarantee the blog slug is unique (append -2, -3, ... on collision)."""
    base = slug or "post"
    candidate = base
    n = 2
    while True:
        q = {"slug": candidate}
        if ignore_id:
            q["id"] = {"$ne": ignore_id}
        exists = await db.blogs.find_one(q, {"_id": 0, "id": 1})
        if not exists:
            return candidate
        candidate = f"{base}-{n}"
        n += 1


async def update_doc(coll, doc_id, data):
    from services import sanitize_service
    data = sanitize_service.sanitize_doc(coll, data)
    upd = {k: v for k, v in data.items() if v is not None}
    if coll == "blogs":
        upd["updated_at"] = now_iso()
        existing = await db[coll].find_one({"id": doc_id}, {"_id": 0}) or {}
        merged = {**existing, **upd}
        _prep_blog(merged, existing_id=doc_id)
        upd["status"] = merged.get("status")
        upd["slug"] = await _unique_blog_slug(merged.get("slug"), ignore_id=doc_id)
    await db[coll].update_one({"id": doc_id}, {"$set": upd})
    await _bust_public(coll)
    return await db[coll].find_one({"id": doc_id}, {"_id": 0})


def _slugify(text):
    import re
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return s[:80] or "post"


def _prep_blog(doc, existing_id=None):
    """Ensure blog has a slug + normalized status/publish_at."""
    if not doc.get("slug"):
        doc["slug"] = _slugify(doc.get("title", ""))
    st = (doc.get("status") or "published").lower()
    if st not in ("draft", "published", "scheduled"):
        st = "published"
    # future publish_at while published => treat as scheduled
    if doc.get("publish_at") and st == "published" and doc["publish_at"] > now_iso():
        st = "scheduled"
    doc["status"] = st


def _blog_is_public(b):
    st = (b.get("status") or "").lower()
    if st == "draft":
        return False
    pa = b.get("publish_at")
    if pa and pa > now_iso():
        return False
    return st in ("published", "scheduled")


async def public_blogs(limit=500):
    rows = await db.blogs.find({"status": {"$ne": "draft"}}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    rows = [b for b in rows if _blog_is_public(b)]
    return rows[:limit]


async def public_blog_by_slug(slug):
    b = await db.blogs.find_one({"slug": slug}, {"_id": 0})
    if not b:
        b = await db.blogs.find_one({"id": slug}, {"_id": 0})
    if not b or not _blog_is_public(b):
        return None
    return b


async def faqs_grouped():
    """Active FAQs grouped by category, ordered by category order then FAQ order."""
    cats = await db.faq_categories.find({"status": {"$ne": "inactive"}}, {"_id": 0}).sort("order", 1).to_list(200)
    faqs = await db.faqs.find({"status": "active"}, {"_id": 0}).to_list(1000)
    faqs.sort(key=lambda f: (f.get("order", 0), f.get("created_at", "")))
    cat_order = {c["name"]: i for i, c in enumerate(cats)}
    buckets = {}
    for f in faqs:
        cat = (f.get("category") or "General").strip() or "General"
        buckets.setdefault(cat, []).append(f)
    groups = []
    for cat in sorted(buckets.keys(), key=lambda c: (cat_order.get(c, 999), c.lower())):
        groups.append({"category": cat, "faqs": buckets[cat]})
    return groups


async def delete_doc(coll, doc_id):
    await db[coll].delete_one({"id": doc_id})
    await _bust_public(coll)
    return {"deleted": True}


# ---- notifications ----
async def send_notification(data):
    return await create_doc("notifications", {**data, "read_by": []})


async def user_notifications(user):
    return await db.notifications.find(
        {"$or": [{"audience": {"$in": ["all", user["role"]]}}, {"user_id": user["id"]}]},
        {"_id": 0}).sort("created_at", -1).to_list(100)


# ---- support tickets ----
async def create_ticket(user, data):
    return await create_doc("tickets", {
        **data, "user_id": user["id"], "user_name": user["name"], "role": user["role"],
        "status": "open", "replies": [],
    })


async def list_tickets(user=None):
    q = {} if not user else {"user_id": user["id"]}
    return await list_docs("tickets", q)


async def reply_ticket(ticket_id, by, text):
    await db.tickets.update_one({"id": ticket_id}, {
        "$push": {"replies": {"by": by, "text": text, "at": now_iso()}},
        "$set": {"status": "answered"}})
    return await db.tickets.find_one({"id": ticket_id}, {"_id": 0})


async def close_ticket(ticket_id):
    await db.tickets.update_one({"id": ticket_id}, {"$set": {"status": "closed"}})
    return await db.tickets.find_one({"id": ticket_id}, {"_id": 0})


# ---- payouts / payment requests ----
async def request_payout(user, amount, method):
    if amount > float(user.get("wallet_balance", 0)):
        raise HTTPException(status_code=400, detail="Amount exceeds wallet balance")
    return await create_doc("payouts", {
        "user_id": user["id"], "name": user["name"], "role": user["role"],
        "phone": user["phone"], "amount": amount, "method": method, "status": "pending"})


async def list_payouts(user=None):
    q = {} if not user else {"user_id": user["id"]}
    return await list_docs("payouts", q)


async def approve_payout(payout_id, status):
    p = await db.payouts.find_one({"id": payout_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Payout not found")
    if p["status"] != "pending":
        raise HTTPException(status_code=400, detail="Already processed")
    if status == "approved":
        await db.users.update_one({"id": p["user_id"]}, {"$inc": {"wallet_balance": -p["amount"]}})
        await db.transactions.insert_one({
            "id": new_id(), "user_id": p["user_id"], "amount": p["amount"], "type": "debit",
            "kind": "payout", "note": f"Payout via {p['method']}", "created_at": now_iso()})
    await db.payouts.update_one({"id": payout_id}, {"$set": {"status": status, "processed_at": now_iso()}})
    return await db.payouts.find_one({"id": payout_id}, {"_id": 0})


# ---- refunds (derived from booking payments + explicit refunds) ----
async def list_refunds():
    from services import refund_service
    return await refund_service.list_all()


async def refund_detail(rid):
    from services import refund_service
    r = await refund_service.get_detail(rid)
    if not r:
        raise HTTPException(status_code=404, detail="Refund not found")
    return r


async def create_refund(booking_id, amount, reason):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    if b.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail="Refund allowed only on paid bookings")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    prior = await db.refunds.find({"booking_id": booking_id}, {"_id": 0, "amount": 1}).to_list(100)
    already = sum(r.get("amount", 0) for r in prior)
    total = float(b["pricing"]["total"])
    if round(already + amount, 2) > round(total, 2):
        raise HTTPException(status_code=400, detail=f"Exceeds refundable amount (max {round(total - already, 2)})")
    r = await create_doc("refunds", {
        "booking_id": booking_id, "booking_code": b["code"], "customer_id": b["customer_id"],
        "amount": amount, "reason": reason, "status": "processed"})
    await db.users.update_one({"id": b["customer_id"]}, {"$inc": {"wallet_balance": amount}})
    await db.transactions.insert_one({
        "id": new_id(), "user_id": b["customer_id"], "amount": amount, "type": "credit",
        "kind": "refund", "note": f"Refund for {b['code']}", "created_at": now_iso()})
    return r
