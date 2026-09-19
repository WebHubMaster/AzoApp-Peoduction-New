"""Merchant CRM — real customer records for the merchant panel.

Source of truth:
  * `merchant_customers` collection (merchant-scoped records: manual / imported / synced from bookings)
  * `bookings` (merchant_id == merchant) for stats (bookings, spent, last service, timeline)
  * `merchant_customer_notes` (private notes)
  * `merchant_reminders` (existing Service Reminders module)
Every list call first syncs customers from bookings so customers who booked via the
merchant's QR/ref code appear automatically.
"""
import csv, io, re
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException
from config.database import db, now_iso
from models.user import new_id

_DONE = ("completed", "paid")
_CANCELLED = ("cancelled", "rejected", "failed")
_PHONE_RE = re.compile(r"\D+")


def norm_phone(p: str) -> str:
    d = _PHONE_RE.sub("", str(p or ""))
    if len(d) > 10 and d.startswith("91"):
        d = d[-10:]
    return d


def _now():
    return datetime.now(timezone.utc)


def _parse(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


def _clean(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


# ---------------------------------------------------------------- sync from bookings
async def sync_from_bookings(mid: str):
    bookings = await db.bookings.find({"merchant_id": mid}, {"_id": 0, "customer_phone": 1, "customer_name": 1,
                                                             "customer_id": 1, "address": 1, "created_at": 1}).to_list(5000)
    if not bookings:
        return
    existing = {c["phone_key"]: c for c in await db.merchant_customers.find({"merchant_id": mid}, {"_id": 0, "phone_key": 1, "id": 1, "customer_user_id": 1}).to_list(10000)}
    seen = set()
    for b in sorted(bookings, key=lambda x: x.get("created_at") or ""):
        pk = norm_phone(b.get("customer_phone"))
        if not pk or pk in seen:
            if pk and b.get("customer_id") and pk in existing and not existing[pk].get("customer_user_id"):
                await db.merchant_customers.update_one({"id": existing[pk]["id"]}, {"$set": {"customer_user_id": b["customer_id"]}})
            continue
        seen.add(pk)
        if pk in existing:
            if b.get("customer_id") and not existing[pk].get("customer_user_id"):
                await db.merchant_customers.update_one({"id": existing[pk]["id"]}, {"$set": {"customer_user_id": b["customer_id"]}})
            continue
        addr = b.get("address") or {}
        doc = {
            "id": new_id(), "merchant_id": mid, "phone_key": pk,
            "name": b.get("customer_name") or "Customer", "phone": b.get("customer_phone") or pk,
            "email": "", "address": addr.get("line") or addr.get("address_line") or "", "city": addr.get("city") or "",
            "pincode": str(addr.get("pincode") or ""), "preferred_service": "", "preferred_time": "",
            "status": "active", "source": "booking", "customer_user_id": b.get("customer_id") or "",
            "created_at": b.get("created_at") or now_iso(), "updated_at": now_iso(), "deleted": False,
        }
        await db.merchant_customers.insert_one(dict(doc))
        existing[pk] = doc


# ---------------------------------------------------------------- stats
async def _stats_map(mid: str):
    bookings = await db.bookings.find({"merchant_id": mid}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    m = {}
    for b in bookings:
        pk = norm_phone(b.get("customer_phone"))
        if not pk:
            continue
        s = m.setdefault(pk, {"bookings": 0, "completed": 0, "cancelled": 0, "total_spent": 0.0,
                              "last_service": "", "last_service_at": "", "last_activity_at": "", "first_booking_at": "",
                              "categories": set(), "booking_list": []})
        s["bookings"] += 1
        st = b.get("status")
        total = float((b.get("pricing") or {}).get("total", 0) or 0)
        if st in _DONE:
            s["completed"] += 1
            s["total_spent"] += total
        elif st in _CANCELLED:
            s["cancelled"] += 1
        svc_name = (b.get("service") or {}).get("name") or b.get("service_name") or ""
        cat = (b.get("service") or {}).get("category_name") or b.get("category_name") or ""
        if cat:
            s["categories"].add(cat.lower())
        ts = b.get("updated_at") or b.get("created_at") or ""
        if not s["last_activity_at"] or ts > s["last_activity_at"]:
            s["last_activity_at"] = ts
        if not s["last_service"]:
            s["last_service"] = svc_name
            s["last_service_at"] = b.get("scheduled_at") or b.get("created_at") or ""
        ca = b.get("created_at") or ""
        if not s["first_booking_at"] or ca < s["first_booking_at"]:
            s["first_booking_at"] = ca
        s["booking_list"].append({
            "id": b.get("id"), "code": b.get("code") or b.get("booking_code") or (b.get("id") or "")[:8].upper(),
            "service": svc_name, "category": cat, "date": b.get("scheduled_at") or b.get("created_at"),
            "amount": total, "status": st, "partner_name": b.get("partner_name") or "",
            "payment_status": b.get("payment_status") or ("paid" if st in _DONE else "pending"),
        })
    return m


def _customer_type(s, created_at):
    if not s or s["bookings"] == 0:
        return "new"
    if s["completed"] >= 5 or s["bookings"] >= 5:
        return "regular"
    if s["bookings"] >= 2:
        return "returning"
    return "new"


def _decorate(c: dict, s: dict | None):
    s = s or {}
    c["bookings"] = s.get("bookings", 0)
    c["completed"] = s.get("completed", 0)
    c["cancelled"] = s.get("cancelled", 0)
    c["total_spent"] = round(s.get("total_spent", 0.0), 2)
    c["last_service"] = s.get("last_service", "")
    c["last_service_at"] = s.get("last_service_at", "")
    c["last_activity_at"] = s.get("last_activity_at") or c.get("updated_at") or c.get("created_at")
    c["avg_booking_value"] = round(c["total_spent"] / c["completed"], 2) if c["completed"] else 0
    c["type"] = _customer_type(s, c.get("created_at"))
    la = _parse(c["last_activity_at"])
    if c.get("status") == "blocked":
        c["status_label"] = "blocked"
    elif la and (_now() - la).days > 90 and c["bookings"] > 0:
        c["status_label"] = "inactive"
    else:
        c["status_label"] = "active" if c.get("status") != "inactive" else "inactive"
    c["initials"] = "".join(w[0] for w in (c.get("name") or "C").split()[:2]).upper()
    c["categories"] = sorted(s.get("categories", set())) if s else []
    c["customer_code"] = "CUS-" + (c.get("id") or "")[:6].upper()
    return c


# ---------------------------------------------------------------- list + KPIs
_SORTS = {
    "newest": ("created_at", True), "oldest": ("created_at", False),
    "spent_high": ("total_spent", True), "spent_low": ("total_spent", False),
    "bookings_high": ("bookings", True), "bookings_low": ("bookings", False),
    "recent_active": ("last_activity_at", True), "recent_inactive": ("last_activity_at", False),
    "name_az": ("name_l", False), "name_za": ("name_l", True),
}


async def list_customers(merchant: dict, p: dict):
    mid = merchant["id"]
    await sync_from_bookings(mid)
    docs = await db.merchant_customers.find({"merchant_id": mid, "deleted": {"$ne": True}}, {"_id": 0}).to_list(10000)
    stats = await _stats_map(mid)
    items = [_decorate(dict(c), stats.get(c.get("phone_key"))) for c in docs]

    # ---- KPIs (unfiltered) ----
    now = _now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    prev_month_start = (now.replace(day=1) - timedelta(days=1)).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    total = len(items)
    active = sum(1 for c in items if c["status_label"] == "active")
    new_month = sum(1 for c in items if (c.get("created_at") or "") >= month_start)
    new_prev = sum(1 for c in items if prev_month_start <= (c.get("created_at") or "") < month_start)
    returning = sum(1 for c in items if c["bookings"] >= 2)
    kpis = {
        "total": total, "active": active, "new_this_month": new_month,
        "new_trend": (round(((new_month - new_prev) / new_prev) * 100, 1) if new_prev else (100.0 if new_month else 0.0)),
        "returning": returning, "returning_pct": round((returning / total) * 100) if total else 0,
        "total_spent": round(sum(c["total_spent"] for c in items), 2),
    }

    # ---- filters ----
    q = (p.get("q") or "").strip().lower()
    if q:
        qd = norm_phone(q)
        def hit(c):
            if q in (c.get("name") or "").lower() or q in (c.get("email") or "").lower() or q in c["customer_code"].lower():
                return True
            if qd and qd in (c.get("phone_key") or ""):
                return True
            s = stats.get(c.get("phone_key")) or {}
            return any(q in (b.get("code") or "").lower() for b in s.get("booking_list", []))
        items = [c for c in items if hit(c)]
    st = [x for x in (p.get("status") or "").split(",") if x]
    if st:
        items = [c for c in items if c["status_label"] in st]
    ty = [x for x in (p.get("type") or "").split(",") if x]
    if ty:
        items = [c for c in items if c["type"] in ty]
    cats = [x.lower() for x in (p.get("category") or "").split(",") if x]
    if cats:
        items = [c for c in items if any(any(k in cc for k in cats) for cc in c["categories"]) or ((c.get("preferred_service") or "").lower() in cats)]
    act = p.get("activity") or ""
    if act == "never":
        items = [c for c in items if c["bookings"] == 0]
    elif act == "1":
        items = [c for c in items if c["bookings"] == 1]
    elif act == "2-5":
        items = [c for c in items if 2 <= c["bookings"] <= 5]
    elif act == "5+":
        items = [c for c in items if c["bookings"] > 5]
    ls = p.get("last_service") or ""
    days = {"today": 0, "7d": 7, "30d": 30, "90d": 90}.get(ls)
    if days is not None:
        since = (now - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        items = [c for c in items if (c.get("last_service_at") or "") >= since]
    elif ls == "custom" and (p.get("date_from") or p.get("date_to")):
        f = (p.get("date_from") or "0000") ; t = (p.get("date_to") or "9999") + "T23:59:59"
        items = [c for c in items if f <= (c.get("last_service_at") or "")[:19] <= t]
    sp = p.get("spent") or ""
    rng = {"0-1000": (0, 1000), "1000-5000": (1000, 5000), "5000-10000": (5000, 10000), "10000+": (10000, 1e18)}.get(sp)
    if rng:
        items = [c for c in items if rng[0] <= c["total_spent"] < rng[1]]
    if p.get("since_from"):
        items = [c for c in items if (c.get("created_at") or "")[:10] >= p["since_from"]]
    if p.get("since_to"):
        items = [c for c in items if (c.get("created_at") or "")[:10] <= p["since_to"]]
    loc = (p.get("location") or "").strip().lower()
    if loc:
        items = [c for c in items if loc in (c.get("city") or "").lower() or loc in (c.get("pincode") or "") or loc in (c.get("address") or "").lower()]
    pref = (p.get("preferred_service") or "").strip().lower()
    if pref:
        items = [c for c in items if pref in (c.get("preferred_service") or "").lower()]
    pay = p.get("payment_status") or ""
    if pay:
        def pay_hit(c):
            bl = (stats.get(c.get("phone_key")) or {}).get("booking_list", [])
            return any((b.get("payment_status") or "") == pay for b in bl)
        items = [c for c in items if pay_hit(c)]

    # ---- sort ----
    for c in items:
        c["name_l"] = (c.get("name") or "").lower()
    key, rev = _SORTS.get(p.get("sort") or "newest", ("created_at", True))
    # Handle numeric vs string sorting
    if key in ("total_spent", "bookings", "completed", "cancelled"):
        items.sort(key=lambda c: (c.get(key) is None, c.get(key) or 0), reverse=rev)
    else:
        items.sort(key=lambda c: (c.get(key) is None, c.get(key) or ""), reverse=rev)
    for c in items:
        c.pop("name_l", None)

    page = max(1, int(p.get("page") or 1))
    size = min(100, max(1, int(p.get("page_size") or 20)))
    tot = len(items)
    return {"items": items[(page - 1) * size: page * size], "total": tot, "page": page, "page_size": size,
            "pages": max(1, (tot + size - 1) // size), "kpis": kpis}


async def _get(mid: str, cid: str):
    c = await db.merchant_customers.find_one({"id": cid, "merchant_id": mid, "deleted": {"$ne": True}}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Customer not found")
    return c


# ---------------------------------------------------------------- profile
async def get_profile(merchant: dict, cid: str):
    mid = merchant["id"]
    c = await _get(mid, cid)
    stats = await _stats_map(mid)
    s = stats.get(c.get("phone_key")) or {}
    out = _decorate(dict(c), s)
    bl = sorted(s.get("booking_list", []), key=lambda b: b.get("date") or "", reverse=True)
    out["bookings_list"] = bl[:50]
    out["timeline"] = [{"date": b["date"], "title": b["service"] or "Service", "status": b["status"], "amount": b["amount"], "code": b["code"], "id": b["id"]} for b in bl[:30]]
    # spending series (daily buckets for completed)
    series = {}
    for b in bl:
        if b["status"] in _DONE and b.get("date"):
            d = str(b["date"])[:10]
            series[d] = series.get(d, 0.0) + float(b["amount"] or 0)
    out["spending_series"] = [{"date": d, "amount": round(v, 2)} for d, v in sorted(series.items())]
    out["notes"] = await db.merchant_customer_notes.find({"merchant_id": mid, "customer_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(100)
    pk = c.get("phone_key")
    rems = await db.merchant_reminders.find({"merchant_id": mid, "status": {"$nin": ["done", "cancelled"]}}, {"_id": 0}).sort("due_date", 1).to_list(500)
    out["reminders"] = [r for r in rems if norm_phone(r.get("customer_phone")) == pk][:10]
    # linked customer account (email/address enrichment)
    if c.get("customer_user_id"):
        u = await db.users.find_one({"id": c["customer_user_id"]}, {"_id": 0, "email": 1, "name": 1})
        if u and not out.get("email"):
            out["email"] = u.get("email") or ""
    return out


# ---------------------------------------------------------------- CRUD
def _validate(data: dict, partial=False):
    name = (data.get("name") or "").strip()
    phone = norm_phone(data.get("phone"))
    errs = {}
    if not partial or "name" in data:
        if len(name) < 2:
            errs["name"] = "Full name is required"
    if not partial or "phone" in data:
        if len(phone) != 10:
            errs["phone"] = "Enter a valid 10-digit mobile number"
    email = (data.get("email") or "").strip()
    if email and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        errs["email"] = "Enter a valid email address"
    pin = str(data.get("pincode") or "").strip()
    if pin and not re.match(r"^\d{6}$", pin):
        errs["pincode"] = "Pincode must be 6 digits"
    if errs:
        raise HTTPException(422, {"errors": errs})
    return name, phone, email, pin


async def create_customer(merchant: dict, data: dict):
    mid = merchant["id"]
    name, phone, email, pin = _validate(data)
    dup = await db.merchant_customers.find_one({"merchant_id": mid, "phone_key": phone, "deleted": {"$ne": True}}, {"_id": 0, "id": 1})
    if dup:
        raise HTTPException(409, "A customer with this mobile number already exists")
    user = await db.users.find_one({"phone": {"$regex": phone + "$"}, "role": "customer"}, {"_id": 0, "id": 1})
    doc = {
        "id": new_id(), "merchant_id": mid, "phone_key": phone, "name": name, "phone": "+91" + phone,
        "email": email, "address": (data.get("address") or "").strip(), "city": (data.get("city") or "").strip(),
        "pincode": pin, "preferred_service": (data.get("preferred_service") or "").strip(),
        "preferred_time": (data.get("preferred_time") or "").strip(), "status": "active", "source": data.get("source") or "manual",
        "customer_user_id": (user or {}).get("id", ""), "created_at": now_iso(), "updated_at": now_iso(), "deleted": False,
    }
    await db.merchant_customers.insert_one(dict(doc))
    note = (data.get("notes") or "").strip()
    if note:
        await add_note(merchant, doc["id"], note)
    return _decorate(_clean(doc), None)


async def update_customer(merchant: dict, cid: str, data: dict):
    mid = merchant["id"]
    c = await _get(mid, cid)
    name, phone, email, pin = _validate({**c, **data}, partial=False)
    if phone != c.get("phone_key"):
        dup = await db.merchant_customers.find_one({"merchant_id": mid, "phone_key": phone, "deleted": {"$ne": True}, "id": {"$ne": cid}})
        if dup:
            raise HTTPException(409, "Another customer already uses this mobile number")
    upd = {"name": name, "phone": "+91" + phone, "phone_key": phone, "email": email,
           "address": (data.get("address", c.get("address")) or "").strip(), "city": (data.get("city", c.get("city")) or "").strip(),
           "pincode": pin, "preferred_service": (data.get("preferred_service", c.get("preferred_service")) or "").strip(),
           "preferred_time": (data.get("preferred_time", c.get("preferred_time")) or "").strip(), "updated_at": now_iso()}
    await db.merchant_customers.update_one({"id": cid}, {"$set": upd})
    return await get_profile(merchant, cid)


async def set_status(merchant: dict, cid: str, status: str):
    if status not in ("active", "inactive", "blocked"):
        raise HTTPException(400, "Invalid status")
    await _get(merchant["id"], cid)
    await db.merchant_customers.update_one({"id": cid}, {"$set": {"status": status, "updated_at": now_iso()}})
    return {"ok": True, "status": status}


async def delete_customer(merchant: dict, cid: str):
    await _get(merchant["id"], cid)
    await db.merchant_customers.update_one({"id": cid}, {"$set": {"deleted": True, "deleted_at": now_iso()}})
    return {"ok": True}


# ---------------------------------------------------------------- notes
async def add_note(merchant: dict, cid: str, text: str):
    text = (text or "").strip()
    if not text:
        raise HTTPException(400, "Note cannot be empty")
    await _get(merchant["id"], cid)
    doc = {"id": new_id(), "merchant_id": merchant["id"], "customer_id": cid, "text": text[:2000],
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.merchant_customer_notes.insert_one(dict(doc))
    return _clean(doc)


async def update_note(merchant: dict, cid: str, nid: str, text: str):
    text = (text or "").strip()
    if not text:
        raise HTTPException(400, "Note cannot be empty")
    r = await db.merchant_customer_notes.update_one({"id": nid, "customer_id": cid, "merchant_id": merchant["id"]},
                                                    {"$set": {"text": text[:2000], "updated_at": now_iso()}})
    if not r.matched_count:
        raise HTTPException(404, "Note not found")
    return await db.merchant_customer_notes.find_one({"id": nid}, {"_id": 0})


async def delete_note(merchant: dict, cid: str, nid: str):
    r = await db.merchant_customer_notes.delete_one({"id": nid, "customer_id": cid, "merchant_id": merchant["id"]})
    if not r.deleted_count:
        raise HTTPException(404, "Note not found")
    return {"ok": True}


# ---------------------------------------------------------------- messaging
async def send_message(merchant: dict, cid: str, text: str):
    c = await _get(merchant["id"], cid)
    text = (text or "").strip()
    if not text:
        raise HTTPException(400, "Message cannot be empty")
    shop = merchant.get("shop_name") or merchant.get("name") or "Your merchant"
    delivered_inapp = False
    if c.get("customer_user_id"):
        await db.notifications.insert_one({"id": new_id(), "user_id": c["customer_user_id"], "audience": "user",
                                           "title": f"Message from {shop}", "body": text[:500], "link": "/customer",
                                           "type": "merchant_message", "read": False, "created_at": now_iso()})
        delivered_inapp = True
    await db.merchant_customer_messages.insert_one({"id": new_id(), "merchant_id": merchant["id"], "customer_id": cid,
                                                    "text": text[:2000], "inapp": delivered_inapp, "created_at": now_iso()})
    phone = "91" + (c.get("phone_key") or "")
    from urllib.parse import quote
    return {"ok": True, "inapp": delivered_inapp, "whatsapp_url": f"https://wa.me/{phone}?text={quote(text)}"}


# ---------------------------------------------------------------- bulk
async def bulk_action(merchant: dict, ids: list, action: str, payload: dict):
    mid = merchant["id"]
    ids = [i for i in (ids or []) if i]
    if not ids:
        raise HTTPException(400, "Select at least one customer")
    own = [c["id"] for c in await db.merchant_customers.find({"merchant_id": mid, "id": {"$in": ids}, "deleted": {"$ne": True}}, {"_id": 0, "id": 1}).to_list(1000)]
    if action == "block":
        await db.merchant_customers.update_many({"id": {"$in": own}}, {"$set": {"status": "blocked", "updated_at": now_iso()}})
    elif action == "unblock":
        await db.merchant_customers.update_many({"id": {"$in": own}}, {"$set": {"status": "active", "updated_at": now_iso()}})
    elif action == "delete":
        await db.merchant_customers.update_many({"id": {"$in": own}}, {"$set": {"deleted": True, "deleted_at": now_iso()}})
    elif action == "note":
        for cid in own:
            await add_note(merchant, cid, payload.get("text", ""))
    elif action == "message":
        links = []
        for cid in own:
            r = await send_message(merchant, cid, payload.get("text", ""))
            links.append(r["whatsapp_url"])
        return {"ok": True, "count": len(own), "whatsapp_urls": links}
    else:
        raise HTTPException(400, "Unknown action")
    return {"ok": True, "count": len(own)}


# ---------------------------------------------------------------- import / export
_IMPORT_COLS = {"name": ["name", "full name", "customer", "customer name"], "phone": ["phone", "mobile", "mobile number", "contact"],
                "email": ["email", "e-mail"], "address": ["address", "full address"], "city": ["city"],
                "pincode": ["pincode", "pin", "zip", "postal code"], "preferred_service": ["preferred service", "service"],
                "notes": ["notes", "note", "remarks"]}


def parse_csv(content: bytes):
    text = content.decode("utf-8-sig", errors="ignore")
    rdr = csv.reader(io.StringIO(text))
    rows = [r for r in rdr if any((x or "").strip() for x in r)]
    if not rows:
        raise HTTPException(400, "The file is empty")
    header = [h.strip().lower() for h in rows[0]]
    idx = {}
    for field, aliases in _IMPORT_COLS.items():
        for i, h in enumerate(header):
            if h in aliases:
                idx[field] = i
                break
    if "phone" not in idx or "name" not in idx:
        raise HTTPException(400, "CSV must contain 'Name' and 'Phone' columns")
    out = []
    for n, r in enumerate(rows[1:], start=2):
        rec = {f: (r[i].strip() if i < len(r) else "") for f, i in idx.items()}
        rec["row"] = n
        out.append(rec)
    return out


async def import_preview(merchant: dict, content: bytes):
    recs = parse_csv(content)
    mid = merchant["id"]
    existing = {c["phone_key"] for c in await db.merchant_customers.find({"merchant_id": mid, "deleted": {"$ne": True}}, {"_id": 0, "phone_key": 1}).to_list(10000)}
    seen = set()
    valid = invalid = dupes = 0
    for r in recs:
        errs = []
        pk = norm_phone(r.get("phone"))
        if len((r.get("name") or "")) < 2:
            errs.append("Name missing")
        if len(pk) != 10:
            errs.append("Invalid phone")
        em = r.get("email") or ""
        if em and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", em):
            errs.append("Invalid email")
        if r.get("pincode") and not re.match(r"^\d{6}$", r["pincode"]):
            errs.append("Invalid pincode")
        if pk and (pk in existing or pk in seen):
            r["duplicate"] = True
            dupes += 1
        seen.add(pk)
        r["errors"] = errs
        if errs:
            invalid += 1
        elif not r.get("duplicate"):
            valid += 1
    return {"rows": recs[:500], "total": len(recs), "valid": valid, "invalid": invalid, "duplicates": dupes}


async def import_commit(merchant: dict, content: bytes, skip_duplicates=True):
    prev = await import_preview(merchant, content)
    created = skipped = 0
    for r in prev["rows"]:
        if r["errors"] or r.get("duplicate"):
            skipped += 1
            continue
        try:
            await create_customer(merchant, {**r, "source": "import"})
            created += 1
        except HTTPException:
            skipped += 1
    return {"ok": True, "created": created, "skipped": skipped, "total": prev["total"]}


async def export_csv(merchant: dict, p: dict) -> str:
    p = {**p, "page": 1, "page_size": 100}
    res = await list_customers(merchant, p)
    # fetch all pages
    items = list(res["items"])
    for pg in range(2, res["pages"] + 1):
        items += (await list_customers(merchant, {**p, "page": pg}))["items"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Customer ID", "Name", "Phone", "Email", "City", "Pincode", "Address", "Type", "Status", "Bookings", "Completed",
                "Total Spent", "Last Service", "Last Service Date", "Customer Since"])
    for c in items:
        w.writerow([c["customer_code"], c.get("name"), c.get("phone"), c.get("email"), c.get("city"), c.get("pincode"), c.get("address"),
                    c["type"], c["status_label"], c["bookings"], c["completed"], c["total_spent"], c.get("last_service"),
                    (c.get("last_service_at") or "")[:10], (c.get("created_at") or "")[:10]])
    return buf.getvalue()
