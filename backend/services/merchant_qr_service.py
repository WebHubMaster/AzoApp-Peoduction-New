"""Merchant QR — real scan tracking + poster/QR config persistence.

Public scan logging (`log_scan`) is called by the customer app whenever a
`?ref=CODE` link/QR is opened. Bookings attributed to the merchant come from the
commission_ledger. `analytics()` powers the merchant QR Performance dashboard.
"""
import hashlib
from datetime import datetime, timezone, timedelta
from config.database import db, now_iso
from models.user import new_id

RANGE_DAYS = {"7d": 7, "30d": 30, "90d": 90, "year": 365}


def _parse(iso):
    if not iso:
        return None
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except Exception:  # noqa: BLE001
        return None


async def _geo_city(ip):
    if not ip or ip.startswith(("10.", "192.168.", "172.", "127.", "::")):
        return ""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=2.0) as c:
            r = await c.get(f"http://ip-api.com/json/{ip}", params={"fields": "city,regionName"})
            j = r.json() or {}
            return j.get("city") or j.get("regionName") or ""
    except Exception:  # noqa: BLE001
        return ""


async def log_scan(code, ip="", source="qr"):
    code = (code or "").strip()
    if not code:
        return {"ok": False}
    from services import merchant_code_service
    m = await merchant_code_service.validate_code(code)
    if not m:
        return {"ok": False}
    vhash = hashlib.sha1((ip or "-").encode()).hexdigest()[:16]
    city = await _geo_city(ip)
    await db.qr_scans.insert_one({
        "id": new_id(), "merchant_id": m["id"], "code": code, "at": now_iso(),
        "city": city or "Unknown", "vhash": vhash, "source": source})
    return {"ok": True}


async def _bookings(merchant_id):
    """Distinct bookings attributed to this merchant → [{booking_id, at}]."""
    rows = await db.commission_ledger.find(
        {"$or": [{"referral_merchant_id": merchant_id}, {"customer_merchant_id": merchant_id}]},
        {"_id": 0, "booking_id": 1, "created_at": 1}).to_list(20000)
    seen = {}
    for r in rows:
        bid = r.get("booking_id")
        if not bid:
            continue
        at = _parse(r.get("created_at"))
        if bid not in seen or (at and seen[bid] and at < seen[bid]):
            seen[bid] = at
    return [{"booking_id": k, "at": v} for k, v in seen.items()]


async def analytics(merchant_id, rng="30d"):
    days = RANGE_DAYS.get(rng, 30)
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    scans = await db.qr_scans.find({"merchant_id": merchant_id}, {"_id": 0}).to_list(30000)
    bookings = await _bookings(merchant_id)

    def in_range(dt):
        return dt is not None and dt >= start

    scan_dts = [(_parse(s.get("at")), s) for s in scans]
    book_dts = [(b.get("at"), b) for b in bookings]

    scans_range = [s for dt, s in scan_dts if in_range(dt)]
    books_range = [b for dt, b in book_dts if in_range(dt)]

    total_scans = len(scans)
    total_bookings = len(bookings)
    unique_visitors = len({s.get("vhash") for s in scans if s.get("vhash")})
    month_scans = len([1 for dt, _ in scan_dts if dt and dt >= month_start])
    month_bookings = len([1 for dt, _ in book_dts if dt and dt >= month_start])
    conv = round(len(books_range) / len(scans_range) * 100, 1) if scans_range else 0.0

    # daily series over the range
    buckets = {}
    for i in range(days):
        d = (start + timedelta(days=i)).strftime("%Y-%m-%d")
        buckets[d] = {"date": d, "scans": 0, "bookings": 0}
    for dt, _ in scan_dts:
        if in_range(dt):
            k = dt.strftime("%Y-%m-%d")
            if k in buckets:
                buckets[k]["scans"] += 1
    for dt, _ in book_dts:
        if in_range(dt):
            k = dt.strftime("%Y-%m-%d")
            if k in buckets:
                buckets[k]["bookings"] += 1
    series = list(buckets.values())

    # recent activity (merged, newest first)
    acts = []
    for dt, s in scan_dts:
        if dt:
            acts.append({"at": s.get("at"), "type": "scan", "label": "QR scanned", "city": s.get("city", "")})
    for dt, b in book_dts:
        if dt:
            acts.append({"at": (dt.isoformat() if dt else ""), "type": "booking", "label": "Booking generated", "city": ""})
    acts.sort(key=lambda a: a["at"] or "", reverse=True)

    return {
        "range": rng,
        "total_scans": total_scans,
        "unique_visitors": unique_visitors,
        "bookings": total_bookings,
        "conversion": conv,
        "range_scans": len(scans_range),
        "range_bookings": len(books_range),
        "month_scans": month_scans,
        "month_bookings": month_bookings,
        "series": series,
        "recent": acts[:12],
    }


async def get_config(merchant_id):
    cfg = await db.merchant_qr_config.find_one({"merchant_id": merchant_id}, {"_id": 0})
    return cfg or {"merchant_id": merchant_id}


async def save_config(merchant_id, data: dict):
    data = {k: v for k, v in (data or {}).items() if k not in ("merchant_id", "_id")}
    data["updated_at"] = now_iso()
    await db.merchant_qr_config.update_one(
        {"merchant_id": merchant_id}, {"$set": data}, upsert=True)
    return await get_config(merchant_id)
