import random
import string
import os
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError
from config.database import db, now_iso, get_settings
from models.user import new_id
from services import money
from services.engines import PricingEngine, CommissionEngine, MatchingEngine, ServiceAreaEngine
from services import realtime as rt
from services import refund_service
from services.schedule_service import schedule_state, format_scheduled, parse_scheduled, set_lead_minutes
from datetime import datetime, timezone, timedelta


# AzoApp Pro perk: seconds of exclusive head-start Pro partners get on new jobs
PRO_HEADSTART_SECONDS = 30


def _abs_media(url: str) -> str:
    """Make a stored media URL absolute + https so it renders as the job image on
    every ring/push channel. FCM (`notification.image`) and Web Push require an
    ABSOLUTE https URL, and Android 15+ blocks cleartext http — a relative path or
    an http URL silently fails to load. Returns "" when it can't be resolved."""
    u = (url or "").strip()
    if not u:
        return ""
    if u.startswith("http://"):
        return "https://" + u[len("http://"):]
    if u.startswith("https://"):
        return u
    base = (os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("PUBLIC_APP_URL") or "").rstrip("/")
    if not base:
        return ""
    if base.startswith("http://"):
        base = "https://" + base[len("http://"):]
    return base + (u if u.startswith("/") else "/" + u)


def _job_brief(b):
    """Compact booking payload broadcast over SSE to partners/admin."""
    addr = b.get("address") or {}
    _sched = schedule_state(b)
    # While a scheduled job is still locked (>30 min out) the partner must not be
    # able to contact the customer — mask the phone in the ring/feed payload too.
    _cust_phone = None if _sched.get("comm_locked") else b.get("customer_phone")
    _items = b.get("items") or []
    _img = _abs_media((_items[0].get("image") if _items else "") or b.get("image") or "")
    _pricing = b.get("pricing") or {}
    # Pre-tax service value for the whole order (base + add-ons, GST EXCLUDED). Used
    # for the incoming-ring so partners see the service cost WITHOUT tax.
    services_total = money.add(_pricing.get("base", 0) or 0, _pricing.get("addons_total", 0) or 0)
    # Per-service list so the incoming-ring can show every service AND its add-ons
    # clearly with price (each price is tax EXCLUDED). Add-ons are flagged so the UI
    # can render them as sub-lines under their parent service.
    items_brief = []
    for it in _items:
        it_addons = it.get("addons") or []
        qty = it.get("qty", 1) or 1
        base_unit = it.get("base_price")
        if base_unit is None:
            addon_sum = sum(float(a.get("price") or 0) for a in it_addons)
            base_unit = float(it.get("unit_service_value") or it.get("price") or it.get("total") or 0) - addon_sum
        items_brief.append({
            "name": it.get("service_name") or it.get("name") or it.get("custom_name") or b.get("service_name"),
            "qty": qty, "price": round(float(base_unit or 0) * qty, 2), "is_addon": False,
        })
        for a in it_addons:
            # Add-on quantity is INDEPENDENT — it is NOT multiplied by the main qty.
            a_qty = int(a.get("qty", 1) or 1)
            items_brief.append({
                "name": a.get("name") or "Add-on", "qty": a_qty,
                "price": round(float(a.get("price") or 0) * a_qty, 2), "is_addon": True,
            })
    if not items_brief and b.get("service_name"):
        base_only = float(_pricing.get("base") or 0) or services_total
        items_brief = [{"name": b.get("service_name"), "qty": 1, "price": base_only, "is_addon": False}]
    # count of real SERVICES (excludes add-on sub-lines) for the title
    service_lines = [x for x in items_brief if not x.get("is_addon")]
    # Partner-facing amount (SOURCE OF TRUTH from the stored booking pricing): the
    # pre-tax amount the partner's commission is computed on. It INCLUDES the visiting
    # charge (and add-ons / surge) and ADDS BACK any coupon discount — the platform
    # absorbs the coupon, so the amount the partner sees is never reduced by it.
    partner_amount = round(PricingEngine.commission_base_excl_tax(_pricing), 2)
    _disc = round(float(_pricing.get("discount") or 0), 2)
    return {
        "id": b.get("id"), "code": b.get("code"),
        "service_name": b.get("service_name"), "category_name": b.get("category_name"),
        "category_id": b.get("category_id"),
        "service_image": _img,
        "items": items_brief,
        "items_count": len(service_lines),
        "customer_name": b.get("customer_name"), "customer_phone": _cust_phone,
        "city": addr.get("city") or addr.get("pincode") or "",
        "address_line": addr.get("line") or "",
        "lat": addr.get("lat"), "lng": addr.get("lng"),
        "status": b.get("status"), "schedule_type": b.get("schedule_type"),
        "scheduled_at": b.get("scheduled_at"),
        "is_scheduled": _sched.get("is_scheduled"),
        "scheduled_date": _sched.get("scheduled_date"),
        "scheduled_time": _sched.get("scheduled_time"),
        "scheduled_label": _sched.get("scheduled_label"),
        "seconds_to_start": _sched.get("seconds_to_start"),
        "schedule": _sched,
        "total": (b.get("pricing") or {}).get("total"),
        "services_total": services_total,
        # Amount to show on the incoming-ring / alert (service + visiting + add-ons,
        # coupon-absorbed, GST excluded).
        "partner_amount": partner_amount,
        "visiting_charge": round(float(_pricing.get("visiting_charge") or 0), 2),
        "coupon_code": b.get("coupon_code") or None,
        "coupon_discount": _disc if b.get("coupon_code") else 0.0,
        "partner_id": b.get("partner_id"), "partner_name": b.get("partner_name"),
        "partner_phone": b.get("partner_phone"),
        "created_at": b.get("created_at"), "updated_at": b.get("updated_at"),
    }


def _otp():
    return f"{random.randint(1000, 9999)}"


def _code():
    return "AZO" + f"{random.randint(10000, 99999)}"


# Booking codes: uniform "AZO" + random alphanumerics for EVERY booking (direct &
# merchant alike). 6 chars from A-Z0-9 = 36^6 ≈ 2.1B combinations, so collisions
# are astronomically rare even at millions of orders. If a collision does occur we
# retry, and after repeated collisions at a length we grow it by one char — so the
# code is guaranteed unique no matter the scale.
_CODE_ALPHABET = string.ascii_uppercase + string.digits


async def _unique_code(length: int = 6, prefix: str = "AZO") -> str:
    L = length
    for attempt in range(1, 1001):
        code = prefix + "".join(random.choices(_CODE_ALPHABET, k=L))
        if not await db.bookings.find_one({"code": code}, {"_id": 1}):
            return code
        if attempt % 25 == 0:      # many collisions at this length → add a char
            L += 1
    return prefix + "".join(random.choices(_CODE_ALPHABET, k=L + 2))


async def slot_availability(date):
    """Bookable START-time slots for a date at the configured interval (default 30 min),
    plus the slots that are fully booked (>= admin slot_capacity)."""
    settings = await get_settings()
    from services.schedule_service import generate_slots, slot_of
    cap = max(1, int(settings.get("slot_capacity", 3) or 3))
    rows = await db.bookings.find({"scheduled_at": {"$regex": f"^{date}"}, "status": {"$nin": ["cancelled"]}},
                                  {"_id": 0, "scheduled_at": 1}).to_list(2000)
    counts = {}
    for r in rows:
        parts = (r.get("scheduled_at") or "").split("T")
        if len(parts) == 2 and len(parts[1]) >= 5:
            bucket = slot_of(parts[1][:5], settings)
            counts[bucket] = counts.get(bucket, 0) + 1
    slots = generate_slots(settings)
    return {"date": date, "capacity": cap, "slots": slots,
            "booked": counts,
            "remaining": {s: max(0, cap - counts.get(s, 0)) for s in slots},
            "full_slots": [s for s, n in counts.items() if n >= cap]}



def _authorize(user, booking):
    """Ensure the caller owns this booking (or is admin)."""
    role = user["role"]
    if role == "admin":
        return
    owner = {"customer": booking.get("customer_id"),
             "partner": booking.get("partner_id"),
             "merchant": booking.get("merchant_id")}.get(role)
    if owner != user["id"]:
        raise HTTPException(status_code=403, detail="Not your booking")


def _visible_otps(user, booking):
    """OTPs whitelisted by ownership — partner never sees them.

    For a future-dated SCHEDULED booking, the customer's Work-Start OTP stays
    HIDDEN until 30 minutes before the scheduled time (spec 8). The completion
    OTP and the underlying stored values are untouched — only visibility timing
    changes."""
    o = booking.get("otps", {})
    role = user["role"]
    if role == "admin":
        return o
    st = schedule_state(booking)
    start = None if st.get("otp_hidden") else o.get("start")
    if role in ("customer", "merchant"):
        return {"start": start, "completion": o.get("completion")}
    return {}


async def _service_or_404(service_id):
    svc = await db.services.find_one({"id": service_id}, {"_id": 0})
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")
    return svc


def _synth_service(name, price, category_id="", category_name=""):
    """Build a service-like dict for an ad-hoc rate-card ('custom') line item.

    Tied to a REAL category so PricingEngine (surge/tax) and MatchingEngine
    (partner eligibility) keep working exactly like a normal fixed-price service."""
    return {
        "id": "custom:" + new_id(),
        "name": (name or "Custom service").strip(),
        "base_price": float(price or 0), "discounted_price": 0,
        "price_type": "fixed", "tax_pct": 0,
        "tiers": [], "addons": [],
        "category_id": category_id or "", "category_name": category_name or "",
        "duration_min": 60, "image": "", "rating": 0,
        "status": "active", "approval_status": "approved", "is_custom": True,
    }


async def _notify(user_id, title, body, event_type=None, ctx=None):
    """Unified dynamic notification: in-app + real-time SSE + push ALWAYS; SMS/email
    fire only when an ACTIVE template exists for the event in the admin Template
    Manager. Every booking activity thus lands as a real device push."""
    ctx = ctx or {}
    _link = f"/{ctx.get('panel', '')}".rstrip("/") or "/"
    try:
        from services.template_service import fire_event
        await fire_event(user_id, event_type or "general", ctx=ctx,
                         fallback_title=title, fallback_body=body, link=_link)
    except Exception:
        pass


def _apply_tier(svc, tier_index):
    tiers = svc.get("tiers") or []
    if tier_index is None or not tiers:
        return svc, None
    try:
        t = tiers[int(tier_index)]
    except (IndexError, ValueError, TypeError):
        return svc, None
    price = float(t.get("price") or 0)
    s = dict(svc)
    s["base_price"] = price
    s["discounted_price"] = price
    return s, t.get("label")


async def _coupon_checks(customer, code):
    """Shared coupon eligibility (status, validity window, usage/per-user limits,
    first-order) → the coupon doc, or a 400 with the customer-facing reason."""
    code = (code or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Enter a coupon code")
    coupon = await db.coupons.find_one({"code": code}, {"_id": 0})
    if not coupon or coupon.get("status") != "active":
        raise HTTPException(status_code=400, detail="Invalid or inactive coupon")
    today = now_iso()[:10]
    if coupon.get("valid_from") and today < coupon["valid_from"][:10]:
        raise HTTPException(status_code=400, detail="This coupon is not active yet")
    if coupon.get("valid_till") and today > coupon["valid_till"][:10]:
        raise HTTPException(status_code=400, detail="This coupon has expired")
    if coupon.get("usage_limit") and coupon.get("used", 0) >= coupon["usage_limit"]:
        raise HTTPException(status_code=400, detail="This coupon has reached its usage limit")
    if customer:
        used_by_me = await db.bookings.count_documents(
            {"customer_id": customer["id"], "coupon_code": code})
        if coupon.get("per_user_limit") and used_by_me >= coupon["per_user_limit"]:
            raise HTTPException(status_code=400, detail="You have already used this coupon")
        if coupon.get("first_order_only"):
            prior = await db.bookings.count_documents({"customer_id": customer["id"]})
            if prior > 0:
                raise HTTPException(status_code=400, detail="Coupon valid only on your first booking")
    return coupon


async def validate_cart_coupon(customer, code, items, schedule_type="schedule", address=None):
    """Validate a coupon against the WHOLE cart (multi-service / multi-category) using the
    same engine the checkout preview and the bookings use, so the discount shown here is
    exactly what will be charged."""
    coupon = await _coupon_checks(customer, code)
    code = coupon["code"]
    base_q = await cart_quote(customer, items, schedule_type, None, address)
    if coupon.get("min_order") and float(base_q["pricing"]["subtotal"]) < float(coupon["min_order"]):
        raise HTTPException(status_code=400,
                            detail=f"Minimum order ₹{int(coupon['min_order'])} required for this coupon")
    priced_q = await cart_quote(customer, items, schedule_type, code, address)
    if not priced_q.get("coupon_applied"):
        raise HTTPException(status_code=400, detail="This coupon cannot be applied to your order")
    discount = money.add(base_q["pricing"]["total"], -priced_q["pricing"]["total"])
    if coupon.get("discount_type") == "free_visiting":
        discount = base_q["pricing"].get("visiting_charge", 0)
    return {"valid": True, "code": code, "discount": discount,
            "discount_type": coupon.get("discount_type"),
            "message": coupon.get("description") or f"Coupon {code} applied",
            "pricing": priced_q["pricing"]}


async def validate_coupon(customer, code, service_id, schedule_type="schedule", addons=None, tier_index=None):
    """Validate a coupon for a given service/context and return the discount preview.
    Supports types: percentage | fixed | free_visiting, with min_order, usage_limit,
    per_user_limit, first_order_only and valid_from/valid_till windows."""
    coupon = await _coupon_checks(customer, code)
    code = coupon["code"]
    # compute pricing with and without coupon
    svc = await _service_or_404(service_id)
    svc2, _ = _apply_tier(svc, tier_index)
    settings = await get_settings()
    base_pricing = await PricingEngine.compute(svc2, settings, schedule_type, addons or [], None)
    if coupon.get("min_order") and base_pricing["subtotal"] < float(coupon["min_order"]):
        raise HTTPException(status_code=400,
                            detail=f"Minimum order ₹{int(coupon['min_order'])} required for this coupon")
    priced = await PricingEngine.compute(svc2, settings, schedule_type, addons or [], coupon)
    discount = money.add(base_pricing["total"], -priced["total"])
    if coupon.get("discount_type") == "free_visiting":
        discount = base_pricing.get("visiting_charge", 0)
    return {"valid": True, "code": code, "discount": discount,
            "discount_type": coupon.get("discount_type"),
            "message": coupon.get("description") or f"Coupon {code} applied",
            "pricing": priced}


async def _load_coupon(coupon_code, subtotal=None):
    """Active coupon that is actually APPLICABLE right now (validity window, usage
    limit, min_order vs the pre-tax subtotal). Returns None when it must not apply so
    the quote, the booking and the invoice never disagree about the discount."""
    if not coupon_code:
        return None
    c = await db.coupons.find_one({"code": coupon_code.upper(), "status": "active"}, {"_id": 0})
    if not c:
        return None
    today = now_iso()[:10]
    if c.get("valid_from") and today < c["valid_from"][:10]:
        return None
    if c.get("valid_till") and today > c["valid_till"][:10]:
        return None
    if c.get("usage_limit") and c.get("used", 0) >= c["usage_limit"]:
        return None
    if subtotal is not None and c.get("min_order") and float(subtotal) < float(c["min_order"]):
        return None
    return c


async def quote(service_id, schedule_type, addons, coupon_code=None, tier_index=None):
    svc = await _service_or_404(service_id)
    svc, tier_label = _apply_tier(svc, tier_index)
    settings = await get_settings()
    pricing = await PricingEngine.compute(svc, settings, schedule_type, addons, None)
    coupon = await _load_coupon(coupon_code, pricing.get("subtotal"))
    if coupon:
        pricing = await PricingEngine.compute(svc, settings, schedule_type, addons, coupon)
    return {"service": svc, "pricing": pricing, "coupon_applied": bool(coupon), "tier_label": tier_label}


async def cart_quote(user, items, schedule_type="schedule", coupon_code=None, address=None, redeem_points=0,
                     apply_visiting=True, apply_emergency=True, apply_platform=True, cart_service_total=None):
    """Combined quote for a multi-service cart, computed HOLISTICALLY so the numbers
    always reconcile with what the individual bookings actually charge:
      • Each line shows its REAL service price (base + selected add-ons) × qty.
      • Per-ORDER fees — Instant/Emergency fee, Visiting charge, Platform fee — are
        added EXACTLY ONCE for the whole cart (never once per service).
      • Surge is per-service (tied to each line's value) and summed.
      • Convenience fee (%) + GST are computed on the combined subtotal, once.
    This mirrors exactly what booking creation charges (emergency/visiting/platform go
    on the first booking only), so displayed total == amount charged."""
    items = items or []
    settings = await get_settings()
    schedule_type = (schedule_type or "schedule").lower()
    if schedule_type == "now":
        schedule_type = "schedule"
    biz = settings.get("business_config", {}) or {}

    # 1) Resolve every line → real service value + per-line surge.
    lines = []
    services_total = 0.0
    surge_total = 0.0
    labour_total = 0.0
    min_labour = float(biz.get("min_labour_charge", 0) or 0)
    for it in items:
        if it.get("custom"):
            svc = _synth_service(it.get("custom_name"), it.get("custom_price"),
                                 it.get("category_id"), it.get("category_name"))
            tier_label = None
            own_labour = money.money(it.get("labour_charge", 0) or 0)
            # Authoritative min-labour: rate-card rows with NO own labour get the
            # admin's Minimum Labor Charge added on top of their product price.
            if own_labour > 0:
                line_labour = own_labour
            elif min_labour > 0:
                line_labour = min_labour
                svc["base_price"] = money.add(svc.get("base_price", 0), min_labour)
            else:
                line_labour = 0.0
        else:
            svc = await _service_or_404(it.get("service_id"))
            svc, tier_label = _apply_tier(svc, it.get("tier_index"))
            line_labour = 0.0
        addons = it.get("addons") or []
        if isinstance(addons, str):
            addons = [a for a in addons.split(",") if a]
        from services.engines import normalize_addons
        addons_norm = normalize_addons(addons)
        addon_qty = {a["name"]: a["qty"] for a in addons_norm}
        qty = max(1, int(it.get("qty", 1) or 1))
        base = float(svc.get("base_price", 0))
        # Main service = base × main qty. Add-ons are priced INDEPENDENTLY with their
        # OWN quantity (default 1) — an add-on is NEVER multiplied by the main qty.
        line_base_total = money.money(base * qty)
        sel_addons = []
        line_addon_total = 0.0
        for a in svc.get("addons", []):
            if a.get("name") in addon_qty:
                aq = addon_qty[a["name"]]
                ap = money.money(a.get("price", 0))
                line_addon_total = money.add(line_addon_total, ap * aq)
                sel_addons.append({"name": a.get("name"), "price": ap, "qty": aq})
        line_service_total = money.add(line_base_total, line_addon_total)
        services_total += line_service_total
        labour_total = money.add(labour_total, line_labour * qty)
        # Surge is evaluated once on the whole line's service value (base×qty + add-ons).
        s_amt, _rule = await PricingEngine._surge(svc, address, line_service_total)
        surge_total = money.add(surge_total, s_amt)
        lines.append({
            "service_id": svc["id"], "name": svc["name"],
            # category is carried per-line so visiting/emergency charges can be
            # computed CATEGORY-WISE (each category is an independent line item).
            "category_id": it.get("category_id") or svc.get("category_id") or "",
            "category_name": it.get("category_name") or svc.get("category_name") or "Services",
            "tier_label": tier_label, "qty": qty,
            # unit_service_value now holds ONLY the per-unit base (add-ons are listed &
            # priced separately with their own qty so nothing is double-multiplied).
            "unit_service_value": money.money(base),
            "line_base_total": line_base_total,
            "line_addon_total": money.money(line_addon_total),
            "line_service_total": line_service_total,
            # per-line breakdown for the bill/receipt (all Tax-EXCLUDED). base_price is
            # the service's own per-unit price (add-ons carry {name, price, qty}).
            "base_price": money.money(base),
            "addons": sel_addons,
            # labour breakdown for the bill/receipt (part of the per-unit base)
            "labour_charge": line_labour,
            "service_charge": money.add(base, -line_labour),
            # kept for backward-compat: unit_total = per-unit base, line_total = full line
            "unit_total": money.money(base),
            "line_total": line_service_total,
            "price": line_service_total,
            "image": svc.get("image"),
        })
    services_total = money.money(services_total)
    surge_total = money.money(surge_total)

    # 2) CATEGORY-WISE additional charges. Visiting Charge and Emergency Charge are
    # calculated INDEPENDENTLY for every category in the cart (each category is its
    # own service line item / its own order, dispatched to that category's partner):
    #   • Emergency Charge (global amount) is added ONCE PER CATEGORY for an emergency
    #     booking — 2 categories = 2 emergency charges, 3 = 3, etc.
    #   • Visiting Charge (global amount) is judged PER CATEGORY against that category's
    #     OWN service total vs the Min Service Amount — a category below the min pays
    #     the visiting charge; a category at/above it pays ₹0.
    # A charge that does not apply to a category is simply ₹0 for that category, and a
    # category's charge NEVER leaks onto another category (or its partner).
    em_amount = float(settings["emergency_fee"]) if schedule_type == "emergency" else 0.0
    vc_amount = float(biz.get("global_visiting_charge", 0) or 0)
    vc_min = float(biz.get("min_service_amount_for_visiting", 0) or 0)

    # Group the resolved lines by category → per-category service subtotal.
    cat_groups = {}
    cat_order = []
    for ln in lines:
        key = ln.get("category_id") or ln.get("category_name") or "uncategorised"
        if key not in cat_groups:
            cat_groups[key] = {"category_id": ln.get("category_id") or "",
                               "category_name": ln.get("category_name") or "Services",
                               "service_total": 0.0}
            cat_order.append(key)
        cat_groups[key]["service_total"] = money.add(
            cat_groups[key]["service_total"], ln.get("line_service_total", 0))

    emergency_fee = 0.0
    visiting_charge = 0.0
    category_charges = []
    for key in cat_order:
        g = cat_groups[key]
        cst = money.money(g["service_total"])
        cat_em = money.money(em_amount) if em_amount > 0 else 0.0
        cat_vc = vc_amount if (vc_amount > 0 and (vc_min <= 0 or cst < vc_min)) else 0.0
        cat_vc = money.money(cat_vc)
        emergency_fee = money.add(emergency_fee, cat_em)
        visiting_charge = money.add(visiting_charge, cat_vc)
        category_charges.append({
            "category_id": g["category_id"], "category_name": g["category_name"],
            "service_total": cst, "visiting_charge": cat_vc, "emergency_charge": cat_em,
            "category_total": money.add(cst, cat_vc, cat_em),
        })

    subtotal = money.add(services_total, emergency_fee, surge_total, visiting_charge)

    convenience_fee = 0.0
    if biz.get("apply_convenience_fee") and apply_platform:
        convenience_fee = money.pct(subtotal, biz.get("convenience_fee_pct", 0) or 0)
    platform_fee = 0.0
    if biz.get("apply_platform_fee") and apply_platform:
        platform_fee = float(biz.get("platform_fee", 0) or 0)

    # 3) Coupon on the FULL pre-tax charges (once), then GST on what remains.
    coupon = await _load_coupon(coupon_code, subtotal)
    gross = money.add(subtotal, convenience_fee, platform_fee)
    discount = PricingEngine.coupon_discount(coupon, gross, visiting_charge)

    pricing = PricingEngine.finalize({
        "base": money.money(services_total), "addons_total": 0.0,
        "emergency_fee": money.money(emergency_fee), "surge": surge_total,
        "visiting_charge": money.money(visiting_charge),
        "convenience_fee": money.money(convenience_fee), "platform_fee": money.money(platform_fee),
        "subtotal": subtotal, "discount": money.money(discount),
    }, settings["gst_pct"])
    # Active membership → automatic % discount on top (platform-absorbed).
    # Skipped for guests (user is None) — applied once they log in.
    if user:
        from services import membership_service
        await membership_service.apply_to_pricing(user, pricing)
        # Loyalty redemption preview (points → instant discount).
        if redeem_points:
            from services import loyalty_service as _loy
            await _loy.apply_preview(user, pricing, int(redeem_points))
    # Canonical itemised breakdown (SAME engine the final booking/invoice uses) so
    # the checkout preview shows exactly Qty × Rate, add-ons (independent qty), each
    # charge separately, taxable + GST and the final total — never re-derived on the
    # client and always == what the booking will charge.
    _synth = {
        "items": [{
            "service_name": ln["name"], "qty": ln["qty"], "base_price": ln["base_price"],
            "addons": [{"name": a["name"], "price": a["price"], "qty": a["qty"]} for a in ln.get("addons", [])],
        } for ln in lines],
        "pricing": pricing,
    }
    breakdown = PricingEngine.build_breakdown(_synth, settings)
    return {"pricing": pricing, "lines": lines, "breakdown": breakdown,
            "category_charges": category_charges,
            "cart_service_total": services_total,
            "labour_total": money.money(labour_total),
            "coupon_applied": bool(coupon)}


async def _build_booking(customer, svc, address, schedule_type, addons, notes,
                         coupon_code, booking_type, merchant=None, tier_index=None, scheduled_at=None,
                         cart_service_total=None, apply_visiting=True, apply_emergency=True,
                         idempotency_key=None, labour_charge=0):
    # Blocked accounts cannot place bookings (admin-enforced restriction).
    if customer and (customer.get("blocked") or customer.get("status") == "blocked"):
        raise HTTPException(status_code=403, detail="Your account is restricted. Please contact support.")
    # Point 15: only 'schedule' and 'emergency' are allowed (no instant 'now').
    schedule_type = (schedule_type or "schedule").lower()
    if schedule_type == "now":
        schedule_type = "schedule"
    if schedule_type not in ("schedule", "emergency"):
        raise HTTPException(status_code=400, detail="Invalid schedule type")
    if schedule_type == "schedule" and not scheduled_at:
        raise HTTPException(status_code=400, detail="Please pick a date & time for your scheduled booking")
    settings = await get_settings()
    # Scheduled bookings must land on the configured slot grid (default 30-min interval).
    # Emergency/instant bookings are exempt (their time is immediate, not a chosen slot).
    if schedule_type == "schedule" and scheduled_at:
        from services.schedule_service import is_valid_slot
        _t = (str(scheduled_at).split("T", 1)[1][:5] if "T" in str(scheduled_at) else "")
        if _t and not is_valid_slot(_t, settings):
            raise HTTPException(status_code=400, detail="Please pick a valid time slot")
    # Service-area gate — block bookings outside serviced areas when the admin has
    # enabled enforcement in Business Settings (default: enforce when areas exist).
    biz_cfg = settings.get("business_config", {}) or {}
    if biz_cfg.get("enforce_service_area", True):
        cov = await ServiceAreaEngine.check(address)
        if not cov.get("serviceable"):
            # Auto-capture demand so admins can prioritise their next launch area.
            try:
                addr = address or {}
                await db.waitlist.insert_one({
                    "id": new_id(),
                    "pincode": str(addr.get("pincode", "")).strip(),
                    "city": (addr.get("city") or "").strip(),
                    "customer_id": customer.get("id"), "customer_name": customer.get("name"),
                    "customer_phone": customer.get("phone"),
                    "service_name": svc.get("name"), "source": "blocked_booking",
                    "created_at": now_iso(),
                })
            except Exception:
                pass
            cities = ", ".join(cov.get("serviced_cities") or []) or "your city"
            raise HTTPException(
                status_code=400,
                detail=f"Sorry, we're not available in this area yet. We currently serve: {cities}.")
    svc, tier_label = _apply_tier(svc, tier_index)
    # Authoritative Minimum Labor Charge for rate-card ('custom') lines with NO own
    # labour: add it to the base BEFORE pricing so totals/GST/commission are correct,
    # and record the labour portion for a clear bill/receipt line.
    eff_labour = 0.0
    if svc.get("is_custom"):
        own_labour = float(labour_charge or 0)
        min_labour = float((settings.get("business_config") or {}).get("min_labour_charge", 0) or 0)
        if own_labour > 0:
            eff_labour = own_labour
        elif min_labour > 0:
            eff_labour = min_labour
            svc["base_price"] = money.add(svc.get("base_price", 0), min_labour)
    pricing = await PricingEngine.compute(svc, settings, schedule_type, addons, None, address,
                                          cart_service_total=cart_service_total,
                                          apply_visiting=apply_visiting,
                                          apply_emergency=apply_emergency)
    coupon = await _load_coupon(coupon_code, pricing.get("subtotal"))
    if coupon:
        pricing = await PricingEngine.compute(svc, settings, schedule_type, addons, coupon, address,
                                              cart_service_total=cart_service_total,
                                              apply_visiting=apply_visiting,
                                              apply_emergency=apply_emergency)
    else:
        coupon_code = None
    # Active membership → automatic % discount on the charged total (platform-absorbed).
    from services import membership_service
    await membership_service.apply_to_pricing(customer, pricing)
    # Refer-a-friend: apply the configured friend discount on a referred customer's FIRST booking.
    _ref_disc = None
    try:
        from services import referral_service as _refsvc
        _ref_disc = await _refsvc.reserve_referee_discount(customer, pricing)
    except Exception:
        _ref_disc = None
    # Expose the labour portion so the bill/receipt can show it as its own clear line
    # (it is part of `base`, so this does NOT change any totals).
    if eff_labour > 0:
        pricing["labour_charge"] = money.money(min(eff_labour, float(pricing.get("base", 0) or 0)))
    ccfg = {k: settings[k] for k in ("platform_commission_pct", "partner_commission_pct",
            "merchant_referral_pct", "merchant_booking_pct", "referral_base")}
    # snapshot the canonical commission block so later rate changes don't alter this booking
    ccfg["commission"] = dict(settings.get("commission", {}))
    eligible = await MatchingEngine.eligible_partners(svc, settings, address)
    booking = {
        "id": new_id(), "code": await _unique_code(),
        "customer_id": customer["id"], "customer_name": customer.get("name"),
        "customer_phone": customer.get("phone"),
        "service_id": svc["id"], "service_name": svc["name"], "tier_label": tier_label,
        "category_id": svc.get("category_id"), "category_name": svc.get("category_name"),
        "merchant_id": merchant["id"] if merchant else None,
        "merchant_name": merchant["name"] if merchant else None,
        "booking_type": booking_type, "partner_id": None, "partner_name": None,
        "address": address, "schedule_type": schedule_type, "scheduled_at": scheduled_at, "notes": notes,
        "addons": addons, "pricing": pricing, "coupon_code": (coupon_code or "").upper() or None,
        # Point 13: customer must pay upfront — booking waits for payment before
        # it starts searching for a partner.
        "status": "pending_payment",
        "otps": {"start": _otp(), "completion": _otp()},
        "evidence": {"before": [], "after": []},
        "spare_parts": [],
        "eligible_partner_ids": [e["id"] for e in eligible],
        "eligible_detail": {e["id"]: {"name": e.get("name"), "distance_km": e.get("distance_km"),
                                       "eta_min": e.get("eta_min")} for e in eligible},
        "timeline": [{"status": "pending_payment", "at": now_iso()}],
        "payment_status": "pending", "review": None,
        "commission_config": ccfg, "partner_location": None,
        "idempotency_key": idempotency_key,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    try:
        await db.bookings.insert_one(dict(booking))
    except DuplicateKeyError:
        # A concurrent/duplicate retry with the same idempotency_key already created
        # this booking — return the existing one instead of a duplicate.
        existing = await db.bookings.find_one(
            {"customer_id": customer["id"], "idempotency_key": idempotency_key}, {"_id": 0})
        if existing:
            return existing
        raise
    booking.pop("_id", None)
    # Refer-a-friend: lock in the friend discount reservation now that the booking exists.
    if _ref_disc:
        try:
            from services import referral_service as _refsvc
            await _refsvc.mark_referee_discount_used(_ref_disc["referral_id"], booking["id"], _ref_disc["amount"])
        except Exception:
            pass
    # NOTE: partner broadcast + "confirmed" notification happen only after payment
    # succeeds — see mark_paid_and_search().
    return booking


async def list_messages(user, booking_id, after=""):
    """Chat thread between the customer and the assigned partner for a booking."""
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    is_customer = b.get("customer_id") == user["id"]
    is_partner = b.get("partner_id") == user["id"]
    if not (is_customer or is_partner or user.get("role") == "admin"):
        raise HTTPException(status_code=403, detail="Not allowed")
    q = {"booking_id": booking_id}
    if after:
        q["created_at"] = {"$gt": after}
    msgs = await db.booking_messages.find(q, {"_id": 0}).sort("created_at", 1).to_list(500)
    for m in msgs:
        m["status"] = "seen" if m.get("seen_at") else "sent"
    unread = sum(1 for m in msgs if m.get("sender_id") != user["id"] and not m.get("seen_at"))
    st = schedule_state(b)
    enabled = _chat_enabled(b, st)
    partner = None
    if b.get("partner_id"):
        pu = await db.users.find_one({"id": b["partner_id"]}, {"_id": 0, "name": 1, "phone": 1, "photo": 1})
        partner = {"name": (pu or {}).get("name") or b.get("partner_name"),
                   "phone": (pu or {}).get("phone"), "photo": (pu or {}).get("photo")}
    other = b.get("partner_id") if is_customer else b.get("customer_id")
    return {
        "enabled": enabled, "payment_status": b.get("payment_status"), "status": b.get("status"),
        "me": user["id"], "partner": partner, "customer": {"name": b.get("customer_name"), "phone": b.get("customer_phone")},
        "messages": msgs, "schedule": st, "comm_locked": st.get("comm_locked", False),
        "unread": unread, "service_name": b.get("service_name"), "code": b.get("code"),
        "counterpart_online": _is_present(other, booking_id),
    }


CHAT_STATUSES = ("assigned", "arrived_shop", "arrived_customer", "started")


def _chat_enabled(b, st=None):
    st = st or schedule_state(b)
    return (b.get("payment_status") == "paid" and bool(b.get("partner_id"))
            and b.get("status") in CHAT_STATUSES and not st.get("comm_locked"))


# Chat presence: (user_id, booking_id) -> last heartbeat epoch. A user "present"
# in a thread gets only the live SSE frame (no push) — WhatsApp-style behaviour.
_presence: dict = {}
PRESENCE_TTL = 25


def _touch_presence(uid, booking_id):
    import time
    _presence[(uid, booking_id)] = time.time()
    if len(_presence) > 5000:
        cutoff = time.time() - PRESENCE_TTL
        for k in [k for k, v in _presence.items() if v < cutoff]:
            _presence.pop(k, None)


def _is_present(uid, booking_id):
    import time
    return bool(uid) and (time.time() - _presence.get((uid, booking_id), 0)) < PRESENCE_TTL


def _chat_party(b, user):
    is_customer = b.get("customer_id") == user["id"]
    is_partner = b.get("partner_id") == user["id"]
    if not (is_customer or is_partner):
        raise HTTPException(status_code=403, detail="Not allowed")
    other = b.get("partner_id") if is_customer else b.get("customer_id")
    return is_customer, other


async def mark_messages_seen(user, booking_id):
    """Mark every message from the other party as seen (read receipt) and record
    presence. Emits `booking_seen` to both parties so ticks/badges sync live on
    every device (web + mobile)."""
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    _, other = _chat_party(b, user)
    _touch_presence(user["id"], booking_id)
    ts = now_iso()
    res = await db.booking_messages.update_many(
        {"booking_id": booking_id, "sender_id": {"$ne": user["id"]}, "seen_at": None},
        {"$set": {"seen_at": ts}})
    if res.modified_count:
        payload = {"booking_id": booking_id, "seen_by": user["id"], "seen_at": ts, "count": res.modified_count}
        rt.emit_user(other, "booking_seen", payload)
        rt.emit_user(user["id"], "booking_seen", payload)
    return {"ok": True, "seen": res.modified_count, "seen_at": ts}


async def set_typing(user, booking_id, typing, present=True):
    """Ephemeral typing indicator — relayed over SSE only, never stored.
    `present=False` = the user closed the chat → presence cleared so the next
    message pushes immediately instead of waiting for the heartbeat TTL."""
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0, "customer_id": 1, "partner_id": 1})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    _, other = _chat_party(b, user)
    if present:
        _touch_presence(user["id"], booking_id)
    else:
        _presence.pop((user["id"], booking_id), None)
    rt.emit_user(other, "booking_typing", {"booking_id": booking_id, "user_id": user["id"],
                                           "name": user.get("name"), "typing": bool(typing)})
    return {"ok": True}


async def chats_summary(user):
    """Chat list for the current user: one row per open thread with the latest
    message + unread count. Drives unread badges on web and mobile."""
    key = "partner_id" if user.get("role") == "partner" else "customer_id"
    bookings = await db.bookings.find(
        {key: user["id"], "status": {"$in": list(CHAT_STATUSES)}, "partner_id": {"$ne": None}},
        {"_id": 0, "id": 1, "code": 1, "service_name": 1, "status": 1, "customer_name": 1,
         "partner_name": 1, "customer_id": 1, "partner_id": 1, "payment_status": 1,
         "schedule_type": 1, "scheduled_at": 1, "updated_at": 1}).to_list(200)
    ids = [b["id"] for b in bookings]
    msgs = await db.booking_messages.find({"booking_id": {"$in": ids}}, {"_id": 0}).sort("created_at", 1).to_list(5000)
    by_b: dict = {}
    for m in msgs:
        row = by_b.setdefault(m["booking_id"], {"last": None, "unread": 0})
        row["last"] = m
        if m.get("sender_id") != user["id"] and not m.get("seen_at"):
            row["unread"] += 1
    chats = []
    for b in bookings:
        row = by_b.get(b["id"], {"last": None, "unread": 0})
        last = row["last"]
        if last:
            last = {**last, "status": "seen" if last.get("seen_at") else "sent"}
        other_name = b.get("customer_name") if key == "partner_id" else b.get("partner_name")
        chats.append({"booking_id": b["id"], "code": b.get("code"), "service_name": b.get("service_name"),
                      "status": b.get("status"), "counterpart_name": other_name,
                      "enabled": _chat_enabled(b), "unread": row["unread"], "last_message": last,
                      "updated_at": (last or {}).get("created_at") or b.get("updated_at")})
    chats.sort(key=lambda c: c.get("updated_at") or "", reverse=True)
    return {"chats": chats, "total_unread": sum(c["unread"] for c in chats)}


async def send_message(user, booking_id, text):
    text = (text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message is empty")
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    is_customer = b.get("customer_id") == user["id"]
    is_partner = b.get("partner_id") == user["id"]
    if not (is_customer or is_partner):
        raise HTTPException(status_code=403, detail="Not allowed")
    if b.get("payment_status") != "paid" or not b.get("partner_id") or b.get("status") not in ("assigned", "arrived_shop", "arrived_customer", "started"):
        raise HTTPException(status_code=400, detail="Chat opens after payment, once your partner is on the way")
    # Spec 7: for a scheduled job, chat stays locked until 30 minutes before the
    # scheduled time — enforced server-side so a manipulated client cannot bypass it.
    if schedule_state(b).get("comm_locked"):
        raise HTTPException(status_code=423, detail="Chat unlocks 30 minutes before your scheduled time.")
    msg = {"id": new_id(), "booking_id": booking_id, "sender_id": user["id"],
           "sender_role": "customer" if is_customer else "partner",
           "sender_name": user.get("name"), "text": text[:1000], "created_at": now_iso(),
           "seen_at": None}
    await db.booking_messages.insert_one(dict(msg))
    msg.pop("_id", None)
    msg["status"] = "sent"
    _touch_presence(user["id"], booking_id)
    target = b.get("partner_id") if is_customer else b.get("customer_id")
    sender = user.get("name") or ("Customer" if is_customer else "Partner")
    service = b.get("service_name") or "Service"
    code = b.get("code", "")
    # Live frame to BOTH parties (sender's other devices stay in sync too).
    rt.emit_user(target, "booking_message", {"service_name": service, "code": code, **msg})
    rt.emit_user(user["id"], "booking_message", {"service_name": service, "code": code, **msg})
    try:
        from services.notification_service import notify
        # WhatsApp-style: recipient viewing this thread right now → live frame only, no push.
        if target and not _is_present(target, booking_id):
            link = (f"/partner?tab=active&chat={booking_id}" if is_customer
                    else f"/account?tab=orders&chat={booking_id}")
            await notify(target, sender, f"{text[:140]}\n{service} • Booking #{code}",
                         link=link, event="chat_message",
                         data={"type": "chat_message", "booking_id": booking_id, "code": code,
                               "service_name": service, "sender_name": sender,
                               "sender_role": msg["sender_role"], "message_id": msg["id"],
                               "tag": f"chat-{booking_id}", "android_channel": "chat",
                               "title": sender, "body": text[:140]})
    except Exception:
        pass
    return msg


async def add_tip(user, booking_id, amount, method="wallet"):
    """Customer adds a gratuity for the partner after a completed booking."""
    b = await _get_booking(booking_id)
    _authorize(user, b)
    amt = money.money(amount or 0)
    if amt <= 0:
        raise HTTPException(status_code=400, detail="Enter a valid tip amount")
    if b["status"] not in ("completed", "paid"):
        raise HTTPException(status_code=400, detail="You can tip after the service is completed")
    tip = {"amount": amt, "method": method, "at": now_iso()}
    await db.bookings.update_one({"id": booking_id}, {"$set": {"tip": tip}})
    if b.get("partner_id"):
        try:
            await db.transactions.insert_one({
                "id": new_id(), "user_id": b["partner_id"], "amount": amt,
                "type": "credit", "kind": "tip",
                "note": f"Tip from customer · {b.get('code', '')}", "created_at": now_iso()})
            await db.users.update_one({"id": b["partner_id"]}, {"$inc": {"wallet_balance": amt}})
        except Exception:
            pass
        try:
            from services.notification_service import notify
            await notify(b["partner_id"], "You received a tip \U0001F389",
                         f"{b.get('customer_name', 'A customer')} tipped you {amt:.0f} for {b.get('service_name', 'your service')}.",
                         link="/partner")
        except Exception:
            pass
    return {"ok": True, "tip": tip}


async def reschedule_booking(user, booking_id, scheduled_at):
    """Back-compat shim: the old direct-reschedule endpoint now CREATES a mutual
    reschedule REQUEST (spec: request → opposite party accept/reject)."""
    return await request_reschedule(user, booking_id, scheduled_at)


# ── Mutual-approval reschedule (Customer ↔ Partner) ───────────────────────────
# Rule: after a partner is assigned neither party may change the schedule directly.
# One party REQUESTS a new date/time; the ORIGINAL schedule stays active while the
# request is pending; only when the OPPOSITE party ACCEPTS does the confirmed
# scheduled_at change (and all 30-min reminder/unlock/OTP logic recalculates from
# it automatically). Reject → original schedule unchanged. Only ONE pending request
# at a time; every resolution is preserved in reschedule_history + timeline.
_RESCHEDULE_STATES = ("assigned", "arrived_shop", "arrived_customer")


def _party_role(user, b):
    """Return 'customer' or 'partner' if the user is a party to this booking, else None."""
    if b.get("customer_id") == user["id"]:
        return "customer"
    if b.get("partner_id") == user["id"]:
        return "partner"
    return None


async def request_reschedule(user, booking_id, scheduled_at):
    b = await _get_booking(booking_id)
    role = _party_role(user, b)
    if role is None:
        raise HTTPException(status_code=403, detail="Not your booking")
    if (b.get("schedule_type") or "").lower() != "schedule" or not b.get("scheduled_at"):
        raise HTTPException(status_code=400, detail="This booking is not a scheduled booking")
    if not b.get("partner_id"):
        raise HTTPException(status_code=400, detail="A partner must be assigned before rescheduling")
    if b.get("status") not in _RESCHEDULE_STATES:
        raise HTTPException(status_code=400, detail="This booking can no longer be rescheduled")
    existing = b.get("reschedule_request")
    if existing and existing.get("status") == "pending":
        raise HTTPException(status_code=409, detail="A reschedule request is already pending for this booking")
    if not scheduled_at:
        raise HTTPException(status_code=400, detail="Pick a new date and time")
    when = parse_scheduled(scheduled_at)
    if not when:
        raise HTTPException(status_code=400, detail="Invalid date/time")
    if when < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Pick a future date and time")
    # Enforce the configured slot grid (default 30-min interval) on reschedule too.
    from services.schedule_service import is_valid_slot
    _t = (str(scheduled_at).split("T", 1)[1][:5] if "T" in str(scheduled_at) else "")
    if _t and not is_valid_slot(_t, await get_settings()):
        raise HTTPException(status_code=400, detail="Please pick a valid time slot")
    old_at = b.get("scheduled_at")
    new_at = str(scheduled_at)
    if new_at == old_at:
        raise HTTPException(status_code=400, detail="Pick a different date or time")
    old_f = format_scheduled(old_at) or {}
    new_f = format_scheduled(new_at) or {}
    req = {
        "id": new_id(),
        "requested_by_role": role,
        "requested_by_id": user["id"],
        "requester_name": user.get("name") or (role.title()),
        "old_scheduled_at": old_at, "new_scheduled_at": new_at,
        "old_date": old_f.get("date"), "old_time": old_f.get("time"), "old_label": old_f.get("label"),
        "new_date": new_f.get("date"), "new_time": new_f.get("time"), "new_label": new_f.get("label"),
        "status": "pending", "created_at": now_iso(),
    }
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"reschedule_request": req, "updated_at": now_iso()},
         "$push": {"timeline": {"status": "reschedule_requested", "at": now_iso(),
                                "by": user["id"], "by_role": role,
                                "old": old_at, "new": new_at}}})
    # Ring + push the OPPOSITE party (spec 7/8).
    target_id = b.get("partner_id") if role == "customer" else b.get("customer_id")
    other_role = "partner" if role == "customer" else "customer"
    ring = {
        "type": "reschedule_request", "booking_id": booking_id, "code": b.get("code"),
        "service_name": b.get("service_name"), "requester_role": role,
        "requester_name": req["requester_name"],
        "old_scheduled_at": old_at, "new_scheduled_at": new_at,
        "old_date": req["old_date"], "old_time": req["old_time"],
        "new_date": req["new_date"], "new_time": req["new_time"],
        "request_id": req["id"],
    }
    if target_id:
        try:
            rt.emit_user(target_id, "reschedule_request", ring)
        except Exception:  # noqa: BLE001
            pass
        try:
            from services.notification_service import notify
            _who = req["requester_name"]
            await notify(
                target_id, "Reschedule request",
                f"{_who} requested to move {b.get('service_name', 'your service')} ({b.get('code')}) "
                f"from {req['old_label']} to {req['new_label']}. Tap to accept or reject.",
                link=("/partner" if other_role == "partner" else "/account"),
                event="reschedule_request",
                push=(other_role != "partner"),  # partner gets the full-screen RING instead of a tray push
                data={"type": "reschedule_request", "booking_id": booking_id, "code": b.get("code"),
                      "request_id": req["id"]})
        except Exception:  # noqa: BLE001
            pass
        # Partner gets the same full-screen call-style RING as a new job (data-only
        # message → background task → Notifee full-screen + brings app to front).
        if other_role == "partner":
            try:
                from services import push_dispatch
                await push_dispatch.push_to_user(
                    target_id, "Reschedule request",
                    f"{req['requester_name']} wants to move to {req.get('new_label') or ''}",
                    link="/(partner)",
                    data={"type": "reschedule_request", "booking_id": booking_id,
                          "code": str(b.get("code") or ""), "service_name": str(b.get("service_name") or ""),
                          "requester_name": str(req["requester_name"]),
                          "new_date": str(req.get("new_date") or ""), "new_time": str(req.get("new_time") or ""),
                          "old_date": str(req.get("old_date") or ""), "old_time": str(req.get("old_time") or ""),
                          "android_channel": "azo-ring-silent-v1", "tag": f"resched-{booking_id}"},
                    data_only=True)
            except Exception:  # noqa: BLE001
                pass
    return await get_booking(user, booking_id)


async def respond_reschedule(user, booking_id, action):
    action = (action or "").lower()
    if action not in ("accept", "reject"):
        raise HTTPException(status_code=400, detail="Invalid action")
    b = await _get_booking(booking_id)
    req = b.get("reschedule_request")
    if not req or req.get("status") != "pending":
        raise HTTPException(status_code=404, detail="No pending reschedule request")
    role = _party_role(user, b)
    if role is None and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not your booking")
    # Only the OPPOSITE party (not the requester) may accept/reject.
    if role is not None and role == req.get("requested_by_role"):
        raise HTTPException(status_code=403, detail="Only the other party can respond to this request")
    req_id = req.get("id")
    old_at = req.get("old_scheduled_at")
    new_at = req.get("new_scheduled_at")
    requester_id = req.get("requested_by_id")
    if action == "accept":
        resolved = {**req, "status": "accepted", "resolved_at": now_iso(), "resolved_by_id": user["id"]}
        res = await db.bookings.update_one(
            {"id": booking_id, "reschedule_request.id": req_id, "reschedule_request.status": "pending"},
            {"$set": {"scheduled_at": new_at, "reschedule_request": None, "updated_at": now_iso()},
             "$unset": {"scheduled_reminder_sent_at": ""},
             "$push": {"reschedule_history": resolved,
                       "timeline": {"status": "reschedule_accepted", "at": now_iso(),
                                    "by": user["id"], "old": old_at, "new": new_at}}})
        if res.modified_count == 1 and requester_id:
            new_label = req.get("new_label") or ""
            _who = "Partner" if role == "partner" else "Customer"
            try:
                rt.emit_user(requester_id, "reschedule_resolved",
                             {"booking_id": booking_id, "status": "accepted", "new_scheduled_at": new_at})
            except Exception:  # noqa: BLE001
                pass
            try:
                from services.notification_service import notify
                await notify(requester_id, "Reschedule accepted",
                             f"{_who} accepted your reschedule request. New schedule: {new_label}.",
                             link=("/account" if req.get("requested_by_role") == "customer" else "/partner"),
                             event="reschedule_accepted",
                             data={"type": "reschedule_accepted", "booking_id": booking_id, "code": b.get("code")})
            except Exception:  # noqa: BLE001
                pass
    else:  # reject
        resolved = {**req, "status": "rejected", "resolved_at": now_iso(), "resolved_by_id": user["id"]}
        res = await db.bookings.update_one(
            {"id": booking_id, "reschedule_request.id": req_id, "reschedule_request.status": "pending"},
            {"$set": {"reschedule_request": None, "updated_at": now_iso()},
             "$push": {"reschedule_history": resolved,
                       "timeline": {"status": "reschedule_rejected", "at": now_iso(),
                                    "by": user["id"], "old": old_at, "new": new_at}}})
        if res.modified_count == 1 and requester_id:
            _who = "Partner" if role == "partner" else "Customer"
            old_label = req.get("old_label") or ""
            try:
                rt.emit_user(requester_id, "reschedule_resolved",
                             {"booking_id": booking_id, "status": "rejected"})
            except Exception:  # noqa: BLE001
                pass
            try:
                from services.notification_service import notify
                await notify(requester_id, "Reschedule declined",
                             f"{_who} declined your reschedule request. Your booking stays on {old_label}.",
                             link=("/account" if req.get("requested_by_role") == "customer" else "/partner"),
                             event="reschedule_rejected",
                             data={"type": "reschedule_rejected", "booking_id": booking_id, "code": b.get("code")})
            except Exception:  # noqa: BLE001
                pass
    return await get_booking(user, booking_id)


async def cancel_reschedule(user, booking_id):
    """Requester withdraws their own still-pending reschedule request."""
    b = await _get_booking(booking_id)
    req = b.get("reschedule_request")
    if not req or req.get("status") != "pending":
        raise HTTPException(status_code=404, detail="No pending reschedule request")
    if req.get("requested_by_id") != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the requester can withdraw this request")
    resolved = {**req, "status": "cancelled", "resolved_at": now_iso(), "resolved_by_id": user["id"]}
    res = await db.bookings.update_one(
        {"id": booking_id, "reschedule_request.id": req.get("id"), "reschedule_request.status": "pending"},
        {"$set": {"reschedule_request": None, "updated_at": now_iso()},
         "$push": {"reschedule_history": resolved,
                   "timeline": {"status": "reschedule_cancelled", "at": now_iso(), "by": user["id"]}}})
    if res.modified_count == 1:
        role = _party_role(user, b)
        target_id = b.get("partner_id") if role == "customer" else b.get("customer_id")
        if target_id:
            try:
                rt.emit_user(target_id, "reschedule_resolved",
                             {"booking_id": booking_id, "status": "cancelled"})
            except Exception:  # noqa: BLE001
                pass
            try:
                from services.notification_service import notify
                await notify(target_id, "Reschedule withdrawn",
                             f"The reschedule request for {b.get('code')} was withdrawn. "
                             f"Booking stays on {req.get('old_label') or 'its original time'}.",
                             link=("/partner" if role == "customer" else "/account"),
                             event="reschedule_cancelled",
                             data={"type": "reschedule_cancelled", "booking_id": booking_id})
            except Exception:  # noqa: BLE001
                pass
    return await get_booking(user, booking_id)


async def _push_job_request(pid, booking, brief):
    """Data-only web push so the SW can show a rich Accept/Reject notification
    (with the service image) even when the app/browser is closed or the phone is
    locked. No-ops silently if FCM isn't configured or the partner has no device.
    Returns the FCM result dict so the caller can log it in the dispatch feed."""
    try:
        import json as _json
        _items = brief.get("items") or []
        # Compact per-service list (name + pre-tax price) for the SW so the ring
        # shows every individual service instead of "N services · Category".
        items_lite = [{"name": it.get("name"), "qty": it.get("qty", 1),
                       "price": it.get("price", 0)} for it in _items if it.get("name")]
        svc_total = brief.get("services_total")
        if svc_total in (None, ""):
            svc_total = brief.get("total", "")
        # Plain-text summary (used as the SW body fallback) — all prices tax-EXCLUDED.
        summary = " · ".join(
            f"{it['name']}" + (f" ×{it['qty']}" if (it.get('qty') or 1) > 1 else "") +
            (f" \u20b9{it['price']}" if it.get('price') else "")
            for it in items_lite) or brief.get("service_name", "Service")
        from services import push_dispatch
        return await push_dispatch.push_to_user(
            pid, "New job request",
            f"{summary} · {brief.get('city') or 'nearby'}",
            link=f"/partner?job={booking['id']}",
            data={"type": "job_request", "booking_id": booking["id"],
                  "code": brief.get("code", ""), "service_name": brief.get("service_name", ""),
                  "city": brief.get("city", ""), "address_line": brief.get("address_line", ""),
                  "total": str(svc_total), "services_total": str(svc_total),
                  "items_json": _json.dumps(items_lite, ensure_ascii=False),
                  "partner_amount": str(brief.get("partner_amount") or ""),
                  "schedule_type": str(brief.get("schedule_type") or ""),
                  "scheduled_date": str(brief.get("scheduled_date") or ""),
                  "scheduled_time": str(brief.get("scheduled_time") or ""),
                  "android_channel": "azo-job-ring-v3", "tag": f"job-{booking['id']}",
                  "image": brief.get("service_image", "")},
            image=brief.get("service_image") or None, data_only=True)
    except Exception as e:  # noqa: BLE001
        return {"success": 0, "failure": 0, "error": str(e)[:200]}


async def _record_response(user_id, kind):
    """Track partner accept/miss events for streak + weekly insights."""
    try:
        await db.partner_response_events.insert_one(
            {"id": new_id(), "user_id": user_id, "type": kind, "at": now_iso()})
        # NOTE: the accept-streak is NO LONGER advanced here on 'accepted'. A milestone
        # bonus must only be earned once the accepted job is actually COMPLETED (an
        # accept that is later cancelled must never count). The streak is advanced in
        # complete_job via `_advance_accept_streak`. A missed request still breaks it.
        if kind == "missed":
            await db.users.update_one({"id": user_id}, {"$set": {"accept_streak": 0}})
    except Exception:
        pass


async def _advance_accept_streak(partner_id):
    """Advance the partner's accept-streak by ONE and credit a milestone bonus if hit.
    Called ONLY when an accepted job is COMPLETED, so a job that was accepted and then
    cancelled never counts toward the streak / bonus. Never raises."""
    try:
        u = await db.users.find_one({"id": partner_id}, {"_id": 0, "accept_streak": 1, "best_streak": 1})
        streak = int((u or {}).get("accept_streak", 0)) + 1
        best = max(int((u or {}).get("best_streak", 0)), streak)
        await db.users.update_one({"id": partner_id}, {"$set": {"accept_streak": streak, "best_streak": best}})
        from services.partner_service import award_accept_streak_bonus
        await award_accept_streak_bonus(partner_id, streak)
    except Exception:
        pass


# ── Dispatch escalation: radius/priority "waves" + auto re-dispatch ───────────
# The booking's `eligible_partner_ids` is already priority-sorted (nearest/best
# first — see MatchingEngine.eligible_partners). We alert partners in small WAVES:
# the closest few first, then — if nobody accepts within OFFER_TTL_SEC or someone
# rejects — we escalate to the next wave (a wider ring). This gives "nearest first,
# then expand" smart escalation AND an automatic retry cycle. All server-side.
DISPATCH_WAVE_SIZE = 50         # partners alerted per wave (effectively "everyone" free nearby at once)
DISPATCH_OFFER_TTL_SEC = 30     # seconds a wave "rings" before auto-escalation
DISPATCH_MAX_WAVES = 12         # safety cap so we never loop forever


async def _dispatch_settings():
    """Admin-tunable dispatch knobs from business_config; sane defaults otherwise."""
    try:
        s = await get_settings()
        bc = (s or {}).get("business_config", {}) or {}
    except Exception:  # noqa: BLE001
        bc = {}
    def _int(key, default):
        try:
            return max(1, int(bc.get(key, default) or default))
        except (TypeError, ValueError):
            return default
    return {
        "wave_size": _int("dispatch_wave_size", DISPATCH_WAVE_SIZE),
        "ttl_sec": _int("dispatch_offer_ttl_sec", DISPATCH_OFFER_TTL_SEC),
        "max_waves": _int("dispatch_max_waves", DISPATCH_MAX_WAVES),
        # Nearby-area fallback ring: on by default, radius shared with admin manual assign.
        "nearby_wave": bool(bc.get("dispatch_nearby_wave", True)),
        "nearby_km": float(bc.get("nearby_assign_radius_km") or bc.get("max_distance_km") or 15),
    }


async def _nearby_candidates(booking, radius_km):
    """AUTO NEARBY WAVE — partners with the booking's skill who serve a DIFFERENT
    pincode but are reachable: within radius_km by live GPS, or (no GPS) in the same
    city. Online + free right now, approved, not already eligible/offered/rejected.
    Returned nearest-first as [{id, name, distance_km, eta_min}]."""
    from services.engines import MatchingEngine
    from services.partner_sync import skill_alias_map, skill_aliases, skill_matches, active_zones, zone_for, partner_serves
    svc = await db.services.find_one({"id": booking.get("service_id")}, {"_id": 0, "required_skill": 1}) or {}
    skill = (svc.get("required_skill") or "").lower()
    if not skill:
        return []
    amap = await skill_alias_map()
    zones = await active_zones()
    addr = booking.get("address") or {}
    cust_pin = str(addr.get("pincode") or "").strip()
    cust_city = str(addr.get("city") or "").strip().lower()
    cust_coords = MatchingEngine._coords(addr)
    if not cust_coords and not cust_city:
        return []
    cust_zone = zone_for(zones, cust_pin or None, cust_coords, addr.get("city"))
    skip = set(booking.get("eligible_partner_ids") or []) | set(booking.get("offered_partner_ids") or []) \
        | set(booking.get("rejected_partner_ids") or [])
    partners = await db.users.find(
        {"role": "partner", "kyc_status": "approved", "status": "active", "partner_status": "online",
         "suspended": {"$ne": True}, "skills": {"$in": skill_aliases(skill, amap)}},
        {"_id": 0, "id": 1, "name": 1, "city": 1, "pincode": 1, "service_pincodes": 1, "skills": 1,
         "live_location": 1, "location": 1, "address": 1}).to_list(500)
    out = []
    for p in partners:
        if p["id"] in skip or not skill_matches(p.get("skills"), skill, amap):
            continue
        # in-area partners are already in the normal eligible pool (or were rejected)
        in_area, _d, _r = partner_serves(p, addr, float(radius_km), zones, cust_zone)
        if in_area and _r in ("pincode", "zone"):
            continue
        dist = None
        pc = MatchingEngine._coords(p)
        if cust_coords and pc:
            dist = MatchingEngine._haversine_km(cust_coords, pc)
            if dist > float(radius_km):
                continue
        elif not (cust_city and str(p.get("city") or "").strip().lower() == cust_city):
            continue
        out.append({"id": p["id"], "name": p.get("name"),
                    "distance_km": round(dist, 1) if dist is not None else None,
                    "eta_min": max(3, round((dist / 25.0) * 60)) if dist is not None else None})
    out.sort(key=lambda x: x["distance_km"] if x["distance_km"] is not None else 1e9)
    live = await MatchingEngine.available_targets([x["id"] for x in out])
    keep = set(live)
    return [x for x in out if x["id"] in keep]


async def _offer_partners(booking, pids, source):
    """Send the full job alert (in-app notification + SSE ring + FCM data push +
    dispatch-feed record) to a specific set of partners, and mark them offered.
    Returns the list actually offered (already-offered ones are skipped)."""
    address = booking.get("address") or {}
    _area = address.get("city") or address.get("pincode") or "your area"
    brief = _job_brief({**booking, "status": "searching"})
    already = set(booking.get("offered_partner_ids", []))
    fresh = [pid for pid in pids if pid and pid not in already]
    for pid in fresh:
        # Only the full-screen ring — no extra "New job available" push (the ring IS
        # the alert). Real-time SSE covers the foreground; _push_job_request sends the
        # data-only ring that the background task renders as the full-screen ring.
        rt.emit_user(pid, "job_request", brief)
        push_res = await _push_job_request(pid, booking, brief)
        await _record_dispatch(booking, pid, source, push_res)
    if fresh:
        await db.bookings.update_one(
            {"id": booking["id"]},
            {"$addToSet": {"offered_partner_ids": {"$each": fresh}}})
    return fresh


async def _next_wave_targets(booking, wave_size):
    """Compute the next batch of partners to alert: still-eligible, ONLINE + FREE
    right now, NOT already offered, NOT rejected — in nearest/best-first order."""
    from services.engines import MatchingEngine
    ordered = booking.get("eligible_partner_ids", []) or []
    rejected = set(booking.get("rejected_partner_ids", []))
    offered = set(booking.get("offered_partner_ids", []))
    pool = [pid for pid in ordered if pid not in offered and pid not in rejected]
    if not pool:
        return []
    # available_targets re-checks online + not-busy live and preserves order
    live = await MatchingEngine.available_targets(pool)
    return live[:max(1, int(wave_size))]


async def _broadcast_new_job(booking):
    """Move a paid booking to 'searching' and start WAVE 1 of partner dispatch
    (closest/best partners first). Later waves are driven by the escalation sweep
    and by partner rejects — see escalate_dispatch()."""
    await db.bookings.update_one(
        {"id": booking["id"]},
        {"$set": {"status": "searching", "updated_at": now_iso(),
                  "dispatch_wave": 0, "dispatch_started_at": now_iso(),
                  "dispatch_last_wave_at": now_iso(), "dispatch_exhausted": False},
         "$push": {"timeline": {"status": "searching", "at": now_iso()}}})
    await _notify(booking["customer_id"], "Booking confirmed",
                  f"Your {booking['service_name']} booking {booking['code']} is confirmed. Finding a partner…",
                  event_type="booking_confirmed",
                  ctx={"customer_name": booking.get("customer_name", ""), "booking_id": booking["code"]})
    brief = _job_brief({**booking, "status": "searching"})
    rt.emit_admin("job_new", brief)
    # WAVE 1 — nearest/best partners who are online + free right now. (spec 3,11,16,19)
    cfg = await _dispatch_settings()
    fresh = booking.get("id") and await _next_wave_targets(booking, cfg["wave_size"])
    if fresh:
        await _offer_partners(booking, fresh, "auto_broadcast")
        await db.bookings.update_one(
            {"id": booking["id"]},
            {"$set": {"dispatch_wave": 1, "dispatch_last_wave_at": now_iso()}})
    elif booking.get("id"):
        # Nobody free in the customer's own area right now → try the nearby ring at once.
        try:
            await escalate_dispatch(booking["id"], reason="no_local")
        except Exception:  # noqa: BLE001
            pass


async def escalate_dispatch(booking_id, reason="timeout"):
    """Alert the NEXT wave of partners for a still-'searching' booking. Called by
    the background escalation sweep (on wave timeout) and by reject_job (to move
    on immediately). The customer's booking is NEVER cancelled — it just keeps
    searching a wider ring until a partner accepts or partners are exhausted."""
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b or b.get("status") != "searching":
        return {"escalated": False, "reason": "not_searching"}
    cfg = await _dispatch_settings()
    wave = int(b.get("dispatch_wave", 0) or 0)
    if wave >= cfg["max_waves"]:
        if not b.get("dispatch_exhausted"):
            await db.bookings.update_one({"id": booking_id}, {"$set": {"dispatch_exhausted": True}})
        return {"escalated": False, "reason": "max_waves"}
    fresh = await _next_wave_targets(b, cfg["wave_size"])
    if not fresh and cfg.get("nearby_wave"):
        # AUTO NEARBY WAVE — nobody in the customer's own area is free: ring the
        # nearest same-category partners from neighbouring pincodes (within the
        # admin-set radius) as the LAST ring instead of stalling.
        near = await _nearby_candidates(b, cfg["nearby_km"])
        if near:
            batch = near[:max(1, int(cfg["wave_size"]))]
            det = {x["id"]: {"name": x["name"], "distance_km": x["distance_km"],
                             "eta_min": x["eta_min"], "nearby": True} for x in batch}
            await db.bookings.update_one(
                {"id": booking_id},
                {"$addToSet": {"eligible_partner_ids": {"$each": [x["id"] for x in batch]}},
                 "$set": {**{f"eligible_detail.{k}": v for k, v in det.items()},
                          "dispatch_nearby_expanded": True}})
            b = await db.bookings.find_one({"id": booking_id}, {"_id": 0}) or b
            await _offer_partners(b, [x["id"] for x in batch], "auto_nearby_wave")
            await db.bookings.update_one(
                {"id": booking_id},
                {"$set": {"dispatch_wave": wave + 1, "dispatch_last_wave_at": now_iso(),
                          "dispatch_exhausted": False}})
            try:
                rt.emit_admin("job_update", _job_brief(await _get_booking(booking_id)))
            except Exception:  # noqa: BLE001
                pass
            return {"escalated": True, "wave": wave + 1, "count": len(batch), "nearby": True}
    if not fresh:
        # No new online+free partner right now. Keep searching; a partner coming
        # online / freeing up will be picked up on a later sweep. Flag once so the
        # admin can see the booking is waiting for supply.
        if not b.get("dispatch_exhausted"):
            await db.bookings.update_one({"id": booking_id}, {"$set": {"dispatch_exhausted": True}})
            try:
                rt.emit_admin("dispatch_waiting", {"booking_id": booking_id, "code": b.get("code"),
                                                   "service_name": b.get("service_name"),
                                                   "city": (b.get("address") or {}).get("city"),
                                                   "reason": "no_free_partner"})
            except Exception:  # noqa: BLE001
                pass
            try:
                await db.notifications.insert_one({
                    "id": new_id(), "audience": "admin", "user_id": None,
                    "title": "No partner available",
                    "body": f"{b.get('code')} ({b.get('service_name')}) in "
                            f"{(b.get('address') or {}).get('city') or 'the area'} has no free partner. "
                            f"Assign one manually.",
                    "booking_id": booking_id, "kind": "dispatch_waiting",
                    "created_at": now_iso()})
            except Exception:  # noqa: BLE001
                pass
        return {"escalated": False, "reason": "no_targets"}
    await _offer_partners(b, fresh, f"auto_escalation_{reason}")
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"dispatch_wave": wave + 1, "dispatch_last_wave_at": now_iso(),
                  "dispatch_exhausted": False}})
    try:
        rt.emit_admin("job_update", _job_brief(await _get_booking(booking_id)))
    except Exception:  # noqa: BLE001
        pass
    return {"escalated": True, "wave": wave + 1, "count": len(fresh)}


async def dispatch_escalation_tick():
    """One pass of the escalation sweep (invoked periodically from server startup).
    For every 'searching' booking whose current wave has been ringing longer than
    the TTL without an accept, mark the still-pending offers as 'timeout' and open
    the next wave. Returns how many bookings were escalated."""
    cfg = await _dispatch_settings()
    now = datetime.now(timezone.utc)
    escalated = 0
    try:
        searching = await db.bookings.find(
            {"status": "searching"},
            {"_id": 0, "id": 1, "code": 1, "dispatch_last_wave_at": 1,
             "dispatch_started_at": 1}).to_list(500)
    except Exception:  # noqa: BLE001
        return 0
    for b in searching:
        last = b.get("dispatch_last_wave_at") or b.get("dispatch_started_at")
        if last:
            try:
                t0 = datetime.fromisoformat(str(last).replace("Z", "+00:00"))
                if (now - t0).total_seconds() < cfg["ttl_sec"]:
                    continue  # current wave still within its ring window
            except Exception:  # noqa: BLE001
                pass
        # Wave timed out — mark still-pending offers for this booking as 'timeout'
        try:
            pend = await db.booking_dispatches.find(
                {"booking_id": b["id"], "response": "pending"}, {"_id": 0, "partner_id": 1}
            ).to_list(200)
            for row in pend:
                await _record_dispatch_response(b["id"], row["partner_id"], "timeout")
                await _record_response(row["partner_id"], "missed")
        except Exception:  # noqa: BLE001
            pass
        res = await escalate_dispatch(b["id"], reason="timeout")
        if res.get("escalated"):
            escalated += 1
        elif res.get("reason") == "no_targets":
            # Nobody left to ring: re-evaluate the pool so partners who became
            # eligible AFTER creation (approved, synced, came online, moved into the
            # area) are picked up and rung — at most once per TTL window.
            try:
                if await _refresh_eligible_pool(b["id"]):
                    res2 = await escalate_dispatch(b["id"], reason="pool_refresh")
                    if res2.get("escalated"):
                        escalated += 1
            except Exception:  # noqa: BLE001
                pass
    return escalated


# ── Scheduled-booking 30-minute reminder + auto-unlock sweep ──────────────────
# Server-authoritative (spec 4, 5, 12, 13, 14): exactly 30 minutes before a
# scheduled job's start time we (a) ring the assigned partner with a VIEW-only
# reminder (no accept/reject), (b) tell the customer their OTP + contact are now
# available, and (c) unlock Call/Chat/Navigation/Start-Work. The unlock itself is
# computed live from the server clock in schedule_state(), so even if this sweep
# is delayed the permissions are still correct — this job only fires the ONE-TIME
# notifications and live UI refresh. Idempotent: guarded by an atomic flag so a
# retry / duplicate tick never re-sends.
async def _send_schedule_reminders(b, st):
    code = b.get("code", "")
    svc = b.get("service_name", "your service")
    label = st.get("scheduled_label") or ""
    pid = b.get("partner_id")
    if pid:
        try:
            brief = {**_job_brief(b), "reminder": True,
                     "scheduled_date": st.get("scheduled_date"),
                     "scheduled_time": st.get("scheduled_time"),
                     "scheduled_label": label}
            rt.emit_user(pid, "scheduled_reminder", brief)
            rt.emit_user(pid, "schedule_unlocked", {"id": b["id"], "code": code, "role": "partner"})
        except Exception:  # noqa: BLE001
            pass
        try:
            from services.notification_service import notify
            await notify(pid, "\U0001F514 Scheduled Work Reminder",
                         f"{svc} · {code} starts in 30 minutes ({label}). Tap to view your scheduled work.",
                         link=f"/partner?job={b['id']}", event="scheduled_reminder",
                         push=False,  # partner gets the full-screen RING (below) instead of a tray push
                         data={"type": "scheduled_reminder", "booking_id": b["id"], "code": code,
                               "reminder": True, "view_only": True})
        except Exception:  # noqa: BLE001
            pass
        # Full-screen call-style RING (same as new-job / reschedule): data-only push →
        # background task → Notifee full-screen + brings app forward, on locked/closed too.
        try:
            from services import push_dispatch
            await push_dispatch.push_to_user(
                pid, "Scheduled work reminder",
                f"{svc} starts in 30 minutes ({label})",
                link="/(partner)",
                data={"type": "scheduled_reminder", "booking_id": b["id"],
                      "code": str(code or ""), "service_name": str(svc or ""),
                      "scheduled_date": str(st.get("scheduled_date") or ""),
                      "scheduled_time": str(st.get("scheduled_time") or ""),
                      "scheduled_label": str(label or ""),
                      "android_channel": "azo-ring-silent-v1", "tag": f"remind-{b['id']}"},
                data_only=True)
        except Exception:  # noqa: BLE001
            pass
    cid = b.get("customer_id")
    if cid:
        try:
            rt.emit_user(cid, "schedule_unlocked", {"id": b["id"], "code": code, "role": "customer"})
        except Exception:  # noqa: BLE001
            pass
        try:
            from services.notification_service import notify
            await notify(cid, "Your scheduled service starts in 30 minutes",
                         f"{svc} · {code} at {st.get('scheduled_time')}. Your Work-Start OTP is now "
                         f"available and you can contact your partner.",
                         link="/account", event="scheduled_unlock",
                         data={"type": "scheduled_unlock", "booking_id": b["id"], "code": code})
        except Exception:  # noqa: BLE001
            pass


async def scheduled_reminder_tick():
    """One pass: fire the 30-min reminder/unlock for any scheduled job that has
    just entered its 30-minute window. Returns how many bookings were notified."""
    now = datetime.now(timezone.utc)
    sent = 0
    # Keep the live lead time in sync with admin config (business_config, fallback scheduling).
    try:
        _s = await get_settings()
        _lead = (_s.get("business_config") or {}).get("reminder_lead_minutes")
        if _lead is None:
            _lead = (_s.get("scheduling") or {}).get("reminder_lead_minutes")
        set_lead_minutes(_lead)
    except Exception:  # noqa: BLE001
        pass
    try:
        rows = await db.bookings.find(
            {"schedule_type": "schedule",
             "partner_id": {"$ne": None},
             "status": {"$in": ["assigned", "arrived_shop", "arrived_customer"]},
             "scheduled_reminder_sent_at": {"$exists": False}},
            {"_id": 0}).to_list(500)
    except Exception:  # noqa: BLE001
        return 0
    for b in rows:
        st = schedule_state(b)
        if not st.get("is_scheduled"):
            continue
        unlock_at = st.get("unlock_at")
        sched_at = st.get("scheduled_at_utc")
        if not unlock_at or not sched_at:
            continue
        try:
            u = datetime.fromisoformat(unlock_at)
            s = datetime.fromisoformat(sched_at)
        except Exception:  # noqa: BLE001
            continue
        # Only inside the [unlock, start) window — don't fire before or after.
        if now < u or now >= s:
            continue
        # Atomic claim so concurrent/duplicate ticks never double-send (idempotent).
        res = await db.bookings.update_one(
            {"id": b["id"], "scheduled_reminder_sent_at": {"$exists": False}},
            {"$set": {"scheduled_reminder_sent_at": now_iso()},
             "$push": {"timeline": {"status": "reminder_sent", "at": now_iso()}}})
        if res.modified_count != 1:
            continue
        await _send_schedule_reminders(b, st)
        sent += 1
    return sent



async def _refresh_eligible_pool(booking_id) -> int:
    """Recompute skill+area eligibility for a searching booking and add any NEW
    partners to eligible_partner_ids (never removes). Returns number added."""
    from services.engines import MatchingEngine
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b or b.get("status") != "searching" or not b.get("service_id"):
        return 0
    # throttle: re-check a stuck booking at most every 30s
    last = b.get("dispatch_pool_checked_at")
    if last:
        try:
            t0 = datetime.fromisoformat(str(last).replace("Z", "+00:00"))
            if (datetime.now(timezone.utc) - t0).total_seconds() < 30:
                return 0
        except Exception:  # noqa: BLE001
            pass
    svc = await db.services.find_one({"id": b["service_id"]}, {"_id": 0}) or {}
    if not svc:
        return 0
    settings = await get_settings()
    elig = await MatchingEngine.eligible_partners(svc, settings, b.get("address"))
    have = set(b.get("eligible_partner_ids") or [])
    new = [e for e in elig if e["id"] not in have]
    if not new:
        await db.bookings.update_one({"id": booking_id}, {"$set": {"dispatch_pool_checked_at": now_iso()}})
        return 0
    await db.bookings.update_one(
        {"id": booking_id},
        {"$addToSet": {"eligible_partner_ids": {"$each": [e["id"] for e in new]}},
         "$set": {**{f"eligible_detail.{e['id']}": {"name": e.get("name"), "distance_km": e.get("distance_km"),
                                                    "eta_min": e.get("eta_min")} for e in new},
                  "dispatch_exhausted": False, "dispatch_pool_checked_at": now_iso()}})
    return len(new)


async def _record_dispatch(booking, partner_id, source, push_result=None):
    """Persist a `booking_dispatches` row so the admin Live Dispatch Feed can show
    every attempt in real time (which partner, when, via what path, delivered?).
    Also emits an SSE event to the admin channel."""
    try:
        u = await db.users.find_one(
            {"id": partner_id},
            {"_id": 0, "id": 1, "name": 1, "phone": 1, "partner_status": 1,
             "skills": 1, "service_pincodes": 1}) or {}
        push_r = push_result or {}
        _det = (booking.get("eligible_detail") or {}).get(partner_id) or {}
        row = {
            "id": new_id(),
            "booking_id": booking["id"], "booking_code": booking.get("code"),
            "service_name": booking.get("service_name"),
            "required_skill": booking.get("required_skill", ""),
            "partner_id": partner_id, "partner_name": u.get("name"),
            "partner_phone": u.get("phone"),
            "partner_status_at_dispatch": u.get("partner_status") or "offline",
            "source": source,                     # 'auto_broadcast' | 'partner_online' | 'admin_redispatch'
            "sse_emitted": True,                  # we always emit SSE
            "push_success": int(push_r.get("success", 0) or 0),
            "push_failure": int(push_r.get("failure", 0) or 0),
            "push_skipped": push_r.get("skipped") or "",
            "response": "pending", "response_at": None, "response_ms": None,
            "seen_at": None,
            "distance_km": _det.get("distance_km"), "eta_min": _det.get("eta_min"),
            "dispatched_at": now_iso(),
        }
        await db.booking_dispatches.insert_one(dict(row))
        row.pop("_id", None)
        try:
            rt.emit_admin("dispatch_new", row)
        except Exception:  # noqa: BLE001
            pass
    except Exception:  # noqa: BLE001 — telemetry never blocks the dispatch itself
        pass


async def _record_dispatch_response(booking_id, partner_id, response):
    """Mark the latest still-pending dispatch row for (booking, partner) with the
    partner's response and how long it took. Called from accept/reject paths."""
    try:
        row = await db.booking_dispatches.find_one(
            {"booking_id": booking_id, "partner_id": partner_id, "response": "pending"},
            sort=[("dispatched_at", -1)])
        if not row:
            return
        try:
            t0 = datetime.fromisoformat(row["dispatched_at"].replace("Z", "+00:00"))
            t1 = datetime.now(timezone.utc)
            elapsed_ms = int((t1 - t0).total_seconds() * 1000)
        except Exception:  # noqa: BLE001
            elapsed_ms = None
        upd = {"response": response, "response_at": now_iso(), "response_ms": elapsed_ms}
        await db.booking_dispatches.update_one({"id": row["id"]}, {"$set": upd})
        try:
            rt.emit_admin("dispatch_response", {**row, **upd, "_id": None})
        except Exception:  # noqa: BLE001
            pass
    except Exception:  # noqa: BLE001
        pass


async def dispatch_pending_to_partner(partner):
    """When a partner comes ONLINE, push any still-SEARCHING jobs they're eligible
    for but were not offered yet (e.g. nobody was online when the job was created).
    Keeps the searching booking alive and delivers it the moment supply appears.
    (spec 6 — booking stays SEARCHING, next available partner gets the offer.)"""
    pid = partner["id"]
    # Re-evaluate eligibility for still-searching jobs the partner is NOT yet part of
    # (job created before they were approved / synced / online). If they qualify by
    # skill + area now, add them to the pool so they get the alert too.
    try:
        from services.engines import MatchingEngine
        stale = await db.bookings.find(
            {"status": "searching", "eligible_partner_ids": {"$ne": pid},
             "rejected_partner_ids": {"$ne": pid}},
            {"_id": 0, "id": 1, "service_id": 1, "address": 1}).sort("created_at", -1).to_list(50)
        if stale:
            settings = await get_settings()
            svc_cache = {}
            for sb in stale:
                sid = sb.get("service_id")
                if not sid:
                    continue
                svc = svc_cache.get(sid)
                if svc is None:
                    svc = await db.services.find_one({"id": sid}, {"_id": 0}) or {}
                    svc_cache[sid] = svc
                if not svc:
                    continue
                elig = await MatchingEngine.eligible_partners(svc, settings, sb.get("address"))
                hit = next((e for e in elig if e["id"] == pid), None)
                if hit:
                    await db.bookings.update_one(
                        {"id": sb["id"]},
                        {"$addToSet": {"eligible_partner_ids": pid},
                         "$set": {f"eligible_detail.{pid}": {"name": hit.get("name"),
                                                             "distance_km": hit.get("distance_km"),
                                                             "eta_min": hit.get("eta_min")},
                                  "dispatch_exhausted": False}})
    except Exception:  # noqa: BLE001
        pass
    rows = await db.bookings.find(
        {"status": "searching", "eligible_partner_ids": pid,
         "offered_partner_ids": {"$ne": pid}},
        {"_id": 0}).to_list(50)
    for b in rows:
        # re-verify this partner is a valid live target (online + not busy)
        from services.engines import MatchingEngine
        if pid not in await MatchingEngine.available_targets([pid]):
            continue
        _area = (b.get("address") or {}).get("city") or (b.get("address") or {}).get("pincode") or "your area"
        brief = _job_brief(b)
        await _notify(pid, "New job available",
                      f"{b['service_name']} near {_area} · {b['code']}. Open Jobs to accept.",
                      event_type="new_job_available",
                      ctx={"booking_id": b["code"],
                           "_data": {"android_channel": "azo-job-ring-v3", "type": "job_available", "tag": "new-job"}})
        rt.emit_user(pid, "job_request", brief)
        push_res = await _push_job_request(pid, b, brief)
        await _record_dispatch(b, pid, "partner_online", push_res)
        await db.bookings.update_one(
            {"id": b["id"]}, {"$addToSet": {"offered_partner_ids": pid}})
    return {"dispatched": len(rows)}


async def mark_paid_and_search(booking_id):
    """Called by the payment flow once the upfront payment succeeds."""
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    if b.get("payment_status") == "paid":
        return b
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"payment_status": "paid", "paid_at": now_iso(), "updated_at": now_iso()},
         "$push": {"timeline": {"status": "payment_received", "at": now_iso()}}})
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    # consume a membership free-visit if this booking used the waiver (idempotent)
    try:
        from services import membership_service
        await membership_service.consume_free_visit(b.get("customer_id"), b)
    except Exception:
        pass
    if b.get("status") == "pending_payment":
        await _broadcast_new_job(b)
    return await db.bookings.find_one({"id": booking_id}, {"_id": 0})


async def _resolve_referral_merchant(customer, req):
    """Pick up the merchant this customer belongs to for the current booking.

    Priority:
      1. `merchant_ref_code` passed in the current booking request (fresh QR / referral link).
      2. `customer_merchant_id` persisted on the customer's user row from a
         previous QR scan — so a repeat customer stays tagged forever without
         needing to re-scan.

    Side-effect: whenever a fresh code is used, we persist `customer_merchant_id`
    on the user so subsequent bookings auto-link.

    Returns the merchant user dict (or None) — never raises. Silently ignores
    invalid/unknown codes so a bad link never blocks a real booking.
    """
    code = None
    if req is not None:
        code = getattr(req, "merchant_ref_code", None)
        if code is None and isinstance(req, dict):
            code = req.get("merchant_ref_code")
    if code:
        try:
            from services import merchant_code_service
            m = await merchant_code_service.validate_code(code)
        except Exception:  # noqa: BLE001
            m = None
        if m:
            # Persist for repeat bookings — permanent link.
            try:
                await db.users.update_one(
                    {"id": customer["id"]},
                    {"$set": {"customer_merchant_id": m["id"], "customer_merchant_code": m.get("merchant_code")}})
            except Exception:  # noqa: BLE001
                pass
            return m
    # Fallback to already-linked merchant on the customer profile.
    mid = customer.get("customer_merchant_id") if customer else None
    if mid:
        return await db.users.find_one(
            {"id": mid, "role": "merchant"},
            {"_id": 0, "id": 1, "name": 1, "shop_name": 1, "merchant_code": 1, "phone": 1})
    return None


async def create_direct(customer, req):
    # Idempotent retry: if this exact request was already created, return it.
    idem = getattr(req, "idempotency_key", None)
    if idem:
        existing = await db.bookings.find_one(
            {"customer_id": customer["id"], "idempotency_key": idem}, {"_id": 0})
        if existing:
            existing["otps"] = _visible_otps(customer, existing)
            return existing
    if getattr(req, "custom", False):
        if not (req.custom_name or "").strip():
            raise HTTPException(status_code=400, detail="Item name required")
        svc = _synth_service(req.custom_name, req.custom_price, req.category_id, req.category_name)
    else:
        svc = await _service_or_404(req.service_id)
    address = req.address
    if not address and req.address_id:
        for a in customer.get("addresses", []):
            if a["id"] == req.address_id:
                address = a
    if not address:
        raise HTTPException(status_code=400, detail="Address required")
    from services.geo_service import check_serviceable
    chk = await check_serviceable(address=(address or {}))
    if not chk["serviceable"]:
        raise HTTPException(status_code=400, detail="Sorry, we don't service this location yet.")
    b = await _build_booking(customer, svc, address, req.schedule_type, req.addons,
                             req.notes, req.coupon_code, "direct",
                             merchant=await _resolve_referral_merchant(customer, req),
                             tier_index=req.tier_index,
                             scheduled_at=getattr(req, "scheduled_at", None),
                             cart_service_total=getattr(req, "cart_service_total", None),
                             apply_visiting=getattr(req, "apply_visiting", True),
                             apply_emergency=getattr(req, "apply_emergency", True),
                             idempotency_key=idem,
                             labour_charge=(getattr(req, "labour_charge", 0) if getattr(req, "custom", False) else 0))
    b["otps"] = _visible_otps(customer, b)
    # Loyalty redemption (if the customer chose to redeem points at checkout).
    if getattr(req, "redeem_points", 0):
        try:
            from services import loyalty_service as _loy
            b = await _loy.apply_redemption(customer, b, int(req.redeem_points))
        except Exception:
            pass
    return b


def _cart_group_key(it: dict) -> str:
    return it.get("category_id") or it.get("category_name") or "uncategorised"


def _apportion(total: float, weights: list, idx: int) -> float:
    """Deterministic split of `total` across groups by weight; the LAST group takes the
    rounding remainder so the shares always sum EXACTLY to the total."""
    total = money.money(total or 0)
    if total == 0:
        return 0.0
    w_sum = money.add(*weights) if weights else 0.0
    n = len(weights)
    shares = []
    for i in range(n - 1):
        shares.append(money.money(total * (weights[i] / w_sum)) if w_sum > 0 else money.money(total / n))
    shares.append(money.add(total, *[-x for x in shares]))
    return shares[idx]


CART_SPLIT_KEYS = ("convenience_fee", "discount", "membership_discount", "membership_visit_waiver",
                   "loyalty_discount", "referral_discount")


async def _apportion_group_quote(customer, cart_items, items, schedule_type, coupon_code, address, settings):
    """Multi-category checkout: the customer saw ONE preview for the whole cart (coupon,
    convenience fee, membership etc. computed once on the full cart). Each category becomes
    its own order, so every once-per-cart amount is split across the category orders by
    their pre-tax subtotal weight — Σ(order totals) == preview total to the paisa. Returns
    None when the cart has a single category (nothing to split)."""
    groups, order = {}, []
    for it in cart_items:
        k = _cart_group_key(it)
        if k not in groups:
            groups[k] = []
            order.append(k)
        groups[k].append(it)
    me = _cart_group_key(items[0]) if items else None
    if len(order) < 2 or me not in groups:
        return None
    idx = order.index(me)
    full = await cart_quote(customer, cart_items, schedule_type, coupon_code, address, 0, apply_platform=True)
    fp = full["pricing"]
    gq = []
    for k in order:
        gq.append(await cart_quote(None, groups[k], schedule_type, None, address, 0, apply_platform=False))
    weights = [money.money(g["pricing"].get("subtotal") or 0) for g in gq]
    mine = gq[idx]
    p = dict(mine["pricing"])
    for key in CART_SPLIT_KEYS:
        if fp.get(key):
            p[key] = _apportion(fp.get(key), weights, idx)
    # fixed platform fee stays on the FIRST category order (never split into paise)
    p["platform_fee"] = money.money(fp.get("platform_fee") or 0) if idx == 0 else 0.0
    for lbl in ("membership_plan", "membership_discount_pct", "membership_free_visits_left"):
        if fp.get(lbl) is not None and (p.get("membership_discount") or p.get("membership_visit_waiver")):
            p[lbl] = fp.get(lbl)
    PricingEngine.finalize(p, settings["gst_pct"])
    # tax split by the same rule so Σ tax == preview tax exactly (avoids per-order rounding drift)
    gst = _apportion(fp.get("gst"), weights, idx)
    p["gst"] = p["tax"] = gst
    p["total"] = money.add(p["taxable"], gst)
    mine["pricing"] = p
    mine["coupon_applied"] = bool(full.get("coupon_applied"))
    mine["breakdown"] = PricingEngine.build_breakdown({
        "items": [{"service_name": ln["name"], "qty": ln["qty"], "base_price": ln["base_price"],
                   "addons": [{"name": a["name"], "price": a["price"], "qty": a["qty"]} for a in ln.get("addons", [])]}
                  for ln in mine.get("lines", [])],
        "pricing": p}, settings)
    return mine


async def create_grouped_booking(customer, req):
    """Create ONE booking (order) for a set of SAME-category services so that a single
    partner accepts and completes them all. Cross-category grouping is done client-side:
    each category becomes its own order, dispatched to that category's partners."""
    if customer and (customer.get("blocked") or customer.get("status") == "blocked"):
        raise HTTPException(status_code=403, detail="Your account is restricted. Please contact support.")
    items = req.get("items") or []
    if not items:
        raise HTTPException(status_code=400, detail="No items to book")
    address = req.get("address")
    if not address:
        raise HTTPException(status_code=400, detail="Address required")
    idem = req.get("idempotency_key")
    if idem:
        existing = await db.bookings.find_one(
            {"customer_id": customer["id"], "idempotency_key": idem}, {"_id": 0})
        if existing:
            existing["otps"] = _visible_otps(customer, existing)
            return existing
    schedule_type = req.get("schedule_type") or "schedule"
    scheduled_at = req.get("scheduled_at")

    # Primary item seeds the full, correct booking scaffold (eligible partners by the
    # shared category, commission snapshot, OTPs). We then extend it with every
    # sibling service + the combined price so it reads as a single multi-service order.
    primary = items[0]
    if primary.get("custom"):
        psvc = _synth_service(primary.get("custom_name"), primary.get("custom_price"),
                              primary.get("category_id"), primary.get("category_name"))
    else:
        psvc = await _service_or_404(primary.get("service_id"))

    b = await _build_booking(
        customer, psvc, address, schedule_type, primary.get("addons") or [],
        req.get("notes"), req.get("coupon_code"), "direct",
        merchant=await _resolve_referral_merchant(customer, req),
        tier_index=primary.get("tier_index"),
        scheduled_at=scheduled_at,
        cart_service_total=req.get("cart_service_total"),
        apply_visiting=req.get("apply_visiting", True),
        apply_emergency=req.get("apply_emergency", True),
        idempotency_key=idem,
        labour_charge=(primary.get("labour_charge", 0) if primary.get("custom") else 0))

    # Combined pricing for this category-group (reuses the cart engine). Visiting &
    # Emergency charges are now computed CATEGORY-WISE inside cart_quote (each category
    # gets its own), so they are NOT gated per group. Only the platform/convenience fee
    # stays once-per-cart → gated to the FIRST group via apply_platform.
    _first = req.get("apply_visiting", True)
    quote = None
    if req.get("cart_items"):
        quote = await _apportion_group_quote(customer, req.get("cart_items") or [], items, schedule_type,
                                             req.get("coupon_code"), address, await get_settings())
    if quote is None:
        quote = await cart_quote(customer, items, schedule_type,
                                 req.get("coupon_code"), address, 0,
                                 apply_visiting=True, apply_emergency=True, apply_platform=_first,
                                 cart_service_total=None)
    detail = [{
        "service_id": l.get("service_id"), "service_name": l.get("name"), "name": l.get("name"),
        "qty": l.get("qty", 1), "price": l.get("line_service_total") or l.get("line_total") or 0,
        "base_price": l.get("base_price"), "unit_service_value": l.get("unit_service_value"),
        "addons": l.get("addons") or [],
        "tier_label": l.get("tier_label"), "image": l.get("image"),
    } for l in quote.get("lines", [])]
    n = len(detail) or 1
    cat = primary.get("category_name") or b.get("category_name") or ""
    svc_name = detail[0]["name"] if n == 1 else f"{n} services \u00b7 {cat}"
    # Point #13: all category-orders created in ONE checkout share an order_group_id
    # so the customer can pay for ALL of them with a single combined payment.
    group_id = (req.get("order_group_id") or "")[:64] or None
    applied_code = ((req.get("coupon_code") or "").upper() or None) if quote.get("coupon_applied") else None
    await db.bookings.update_one({"id": b["id"]}, {"$set": {
        "items": detail, "pricing": quote["pricing"], "service_name": svc_name,
        "coupon_code": applied_code,
        "is_multi": n > 1, "order_group_id": group_id, "updated_at": now_iso()}})
    b["items"] = detail
    b["pricing"] = quote["pricing"]
    b["coupon_code"] = applied_code
    b["service_name"] = svc_name
    b["is_multi"] = n > 1
    b["order_group_id"] = group_id
    b["otps"] = _visible_otps(customer, b)
    return b



async def create_guest(req):
    settings = await get_settings()
    if not settings.get("auth_config", {}).get("guest_checkout", True):
        raise HTTPException(status_code=403, detail="Guest checkout is disabled")
    svc = await _service_or_404(req.service_id)
    if not req.address:
        raise HTTPException(status_code=400, detail="Address required")
    from services.geo_service import check_serviceable
    chk = await check_serviceable(address=(req.address or {}))
    if not chk["serviceable"]:
        raise HTTPException(status_code=400, detail="Sorry, we don't service this location yet.")
    customer = await db.users.find_one({"phone": req.customer_phone}, {"_id": 0})
    if not customer:
        from models.user import build_user
        customer = build_user(req.customer_phone, "customer", req.customer_name or "Guest Customer")
        customer["is_guest"] = True
        await db.users.insert_one(dict(customer))
        customer.pop("_id", None)
    b = await _build_booking(customer, svc, req.address, req.schedule_type, req.addons,
                             req.notes, req.coupon_code, "guest",
                             merchant=await _resolve_referral_merchant(customer, req),
                             scheduled_at=getattr(req, "scheduled_at", None))
    b["otps"] = _visible_otps(customer, b)
    return b


async def create_merchant(merchant, req):
    svc = await _service_or_404(req.service_id)
    customer = await db.users.find_one({"phone": req.customer_phone}, {"_id": 0})
    if not customer:
        from models.user import build_user
        customer = build_user(req.customer_phone, "customer", req.customer_name or "Guest Customer")
        await db.users.insert_one(dict(customer))
        customer.pop("_id", None)
    b = await _build_booking(customer, svc, req.address, req.schedule_type, [],
                             req.problem, None, "merchant", merchant, scheduled_at=getattr(req, "scheduled_at", None))
    b["otps"] = _visible_otps(merchant, b)
    return b


async def list_bookings(user):
    role = user["role"]
    if role == "customer":
        q = {"customer_id": user["id"]}
    elif role == "merchant":
        q = {"merchant_id": user["id"]}
    elif role == "partner":
        q = {"partner_id": user["id"]}
    else:
        q = {}
    rows = await db.bookings.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    settings = await get_settings()
    for b in rows:
        b["otps"] = _visible_otps(user, b)
        b["schedule"] = schedule_state(b)
        # Canonical financial breakdown (single source of truth) — every panel renders
        # THIS, never re-derives amounts locally.
        b["breakdown"] = PricingEngine.build_breakdown(b, settings, audience=role)
        if role in ("partner", "merchant"):
            _hide_platform_fees(b)
        # Partner viewing a still-locked scheduled job cannot see the customer phone.
        if role == "partner" and b["schedule"].get("comm_locked"):
            b["customer_phone"] = None
    # Customer needs the assigned partner's phone for the one-tap Call (tel:) button —
    # backfill it for any assigned booking whose doc doesn't already carry it.
    if role == "customer":
        need = list({b.get("partner_id") for b in rows if b.get("partner_id") and not b.get("partner_phone")})
        phones = {}
        if need:
            async for u in db.users.find({"id": {"$in": need}}, {"_id": 0, "id": 1, "phone": 1}):
                phones[u["id"]] = u.get("phone")
        for b in rows:
            if b.get("partner_id") and not b.get("partner_phone"):
                b["partner_phone"] = phones.get(b["partner_id"])
            elif "partner_phone" not in b:
                # ensure key is always present so frontend can safely read b.partner_phone
                b["partner_phone"] = None
            # Customer viewing a still-locked scheduled job cannot Call the partner yet.
            if (b.get("schedule") or {}).get("comm_locked"):
                b["partner_phone"] = None
    return rows


async def _get_booking(booking_id):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    return b


async def get_booking(user, booking_id):
    b = await _get_booking(booking_id)
    _authorize(user, b)
    st = schedule_state(b)
    b["schedule"] = st
    b["otps"] = _visible_otps(user, b)
    b["breakdown"] = PricingEngine.build_breakdown(b, await get_settings(), audience=user.get("role"))
    if user.get("role") in ("partner", "merchant"):
        _hide_platform_fees(b)
    # Customer needs the assigned partner's phone for the one-tap Call (tel:) button —
    # backfill it if the booking doc doesn't already carry it.
    if user.get("role") == "customer" and b.get("partner_id") and not b.get("partner_phone"):
        pu = await db.users.find_one({"id": b["partner_id"]}, {"_id": 0, "phone": 1})
        b["partner_phone"] = (pu or {}).get("phone")
    # Comm lock (spec 2/6/7): while a scheduled job is still locked, hide the other
    # party's phone so Call cannot be initiated before the 30-min unlock.
    if st.get("comm_locked"):
        role = user.get("role")
        if role == "partner":
            b["customer_phone"] = None
        elif role == "customer":
            b["partner_phone"] = None
    return b


# ---- partner job feed & lifecycle ----
def _hide_platform_fees(b: dict) -> dict:
    """Provider-facing (partner/merchant) payload must never carry the 100%-platform fees."""
    pr = b.get("pricing")
    if isinstance(pr, dict):
        pr = dict(pr)
        pr.pop("convenience_fee", None)
        pr.pop("platform_fee", None)
        b["pricing"] = pr
    return b


def _partner_view(b: dict, settings: dict) -> dict:
    """Partner-facing booking: canonical breakdown + platform-only fees hidden."""
    b["breakdown"] = PricingEngine.build_breakdown(b, settings, audience="partner")
    return _hide_platform_fees(b)


async def partner_jobs(partner):
    # Point 11: only show jobs matching this partner's categories/skills feed.
    # AzoApp Pro perk: premium partners get a head-start — non-Pro partners only
    # see each new job after PRO_HEADSTART_SECONDS, giving Pro members priority.
    q = {"status": "searching", "eligible_partner_ids": partner["id"]}
    if not partner.get("premium_partner"):
        from datetime import datetime, timezone, timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(seconds=PRO_HEADSTART_SECONDS)).isoformat()
        q["created_at"] = {"$lte": cutoff}
    rows = await db.bookings.find(
        q, {"_id": 0, "otps": 0}).sort("created_at", -1).to_list(100)
    settings = await get_settings()
    for b in rows:
        st = schedule_state(b)
        b["schedule"] = st
        if st.get("comm_locked"):
            b["customer_phone"] = None
        _partner_view(b, settings)
    return rows


async def partner_ring_pending(partner):
    """Searching jobs already OFFERED to this partner (a dispatch row exists) that
    they have not accepted/rejected — the ones that must be ringing on screen.
    Used by the partner app as a polling fallback + on tab focus, so a missed SSE
    event or a closed push never means a missed job. Only when the partner is
    online and not busy on another job."""
    pid = partner["id"]
    if partner.get("partner_status") != "online":
        return []
    from services.engines import MatchingEngine
    if pid not in await MatchingEngine.available_targets([pid]):
        return []
    from datetime import datetime, timezone, timedelta
    since = (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat()
    rows = await db.bookings.find(
        {"status": "searching", "offered_partner_ids": pid,
         "rejected_partner_ids": {"$ne": pid}, "created_at": {"$gte": since}},
        {"_id": 0, "otps": 0}).sort("created_at", -1).to_list(20)
    return [_job_brief(b) for b in rows]


async def partner_reschedule_pending(partner):
    """Customer-initiated reschedule requests still PENDING on this partner's bookings —
    polling / app-launch fallback so the full-screen reschedule RING shows even when the
    SSE event or push was missed because the app was closed or the phone was locked.
    Mirrors partner_ring_pending for the reschedule call-style alert."""
    pid = partner["id"]
    rows = await db.bookings.find(
        {"partner_id": pid,
         "reschedule_request.status": "pending",
         "reschedule_request.requested_by_role": "customer"},
        {"_id": 0}).sort("updated_at", -1).to_list(10)
    out = []
    for b in rows:
        r = b.get("reschedule_request") or {}
        out.append({
            "type": "reschedule_request", "booking_id": b.get("id"), "code": b.get("code"),
            "service_name": b.get("service_name"), "requester_role": r.get("requested_by_role"),
            "requester_name": r.get("requester_name"),
            "old_date": r.get("old_date"), "old_time": r.get("old_time"),
            "new_date": r.get("new_date"), "new_time": r.get("new_time"),
            "request_id": r.get("id"),
        })
    return out


async def partner_reminder_pending(partner):
    """Scheduled jobs currently inside their 30-min pre-start window that should RING
    the assigned partner — polling/launch fallback for the full-screen reminder so a
    missed SSE/push (app closed or phone locked) never hides it."""
    pid = partner["id"]
    now = datetime.now(timezone.utc)
    rows = await db.bookings.find(
        {"partner_id": pid, "schedule_type": "schedule",
         "status": {"$in": ["assigned", "arrived_shop", "arrived_customer"]}},
        {"_id": 0}).sort("scheduled_at", 1).to_list(20)
    out = []
    for b in rows:
        st = schedule_state(b)
        if not st.get("is_scheduled"):
            continue
        unlock_at = st.get("unlock_at")
        sched_at = st.get("scheduled_at_utc")
        if not unlock_at or not sched_at:
            continue
        try:
            u = datetime.fromisoformat(str(unlock_at))
            s = datetime.fromisoformat(str(sched_at))
        except Exception:  # noqa: BLE001
            continue
        if u <= now <= s + timedelta(minutes=10):
            out.append({
                "type": "scheduled_reminder", "booking_id": b.get("id"), "code": b.get("code"),
                "service_name": b.get("service_name"),
                "scheduled_date": st.get("scheduled_date"), "scheduled_time": st.get("scheduled_time"),
                "scheduled_label": st.get("scheduled_label"),
            })
    return out


async def partner_active_jobs(partner):
    """Jobs this partner has accepted and are in progress (Active Job menu)."""
    rows = await db.bookings.find(
        {"partner_id": partner["id"],
         "status": {"$in": ["assigned", "arrived_shop", "arrived_customer", "started"]}},
        {"_id": 0, "eligible_partner_ids": 0, "idempotency_key": 0}).sort("updated_at", -1).to_list(100)
    settings = await get_settings()
    is_demo = bool(partner.get("is_demo"))
    for b in rows:
        _slim_partner_job(b, partner["id"])
        # Demo accounts see the customer's Start/Completion OTP so the full active-job
        # flow is testable end-to-end in the demo app. Real accounts never do.
        b["demo_otps"] = (b.get("otps") or {}) if is_demo else {}
        b.pop("otps", None)
        st = schedule_state(b)
        b["schedule"] = st
        # Locked scheduled job → hide customer phone until the 30-min unlock (spec 2).
        if st.get("comm_locked"):
            b["customer_phone"] = None
        _partner_view(b, settings)
    return rows


async def partner_history(partner, status="all"):
    """Completed & cancelled jobs for this partner — the Job History screen.
    Supports an optional status filter (all | completed | cancelled)."""
    wanted = {"completed": ["completed", "paid"], "cancelled": ["cancelled"]}.get(
        status, ["completed", "paid", "cancelled"])
    rows = await db.bookings.find(
        {"partner_id": partner["id"], "status": {"$in": wanted}},
        {"_id": 0, "otps": 0, "eligible_partner_ids": 0, "eligible_detail": 0,
         "idempotency_key": 0}).sort("updated_at", -1).to_list(500)
    settings = await get_settings()
    for b in rows:
        b["schedule"] = schedule_state(b)
        _partner_view(b, settings)
    return rows


async def partner_job_detail(partner, booking_id):
    """View a job's details before accepting (must be in the partner's feed)."""
    b = await _get_booking(booking_id)
    if b.get("partner_id") == partner["id"] or partner["id"] in b.get("eligible_partner_ids", []):
        b.pop("otps", None)
        st = schedule_state(b)
        b["schedule"] = st
        if st.get("comm_locked"):
            b["customer_phone"] = None
        b["still_available"] = b.get("status") == "searching"
        _partner_view(b, await get_settings())
        return b
    raise HTTPException(status_code=403, detail="This job is not available to you")


# Partner growth tiers — derived purely from REAL lifetime completed jobs.
# (Not a fake reward system; a progress indicator over an existing number.)
PARTNER_TIERS = [
    {"key": "new", "label": "New Partner", "min": 0, "color": "#64748b"},
    {"key": "bronze", "label": "Bronze", "min": 10, "color": "#b45309"},
    {"key": "silver", "label": "Silver", "min": 50, "color": "#64748b"},
    {"key": "gold", "label": "Gold", "min": 150, "color": "#d97706"},
    {"key": "platinum", "label": "Platinum", "min": 400, "color": "#0ea5e9"},
]


def _partner_tier(lifetime_jobs):
    lifetime_jobs = int(lifetime_jobs or 0)
    cur = PARTNER_TIERS[0]
    for t in PARTNER_TIERS:
        if lifetime_jobs >= t["min"]:
            cur = t
    higher = [t for t in PARTNER_TIERS if t["min"] > cur["min"]]
    nxt = min(higher, key=lambda t: t["min"]) if higher else None
    if nxt:
        span = nxt["min"] - cur["min"]
        done = lifetime_jobs - cur["min"]
        progress = round(min(100, max(0, (done / span) * 100))) if span else 100
        to_next = max(0, nxt["min"] - lifetime_jobs)
    else:
        progress, to_next = 100, 0
    return {
        "key": cur["key"], "label": cur["label"], "color": cur["color"],
        "next_label": nxt["label"] if nxt else None,
        "next_min": nxt["min"] if nxt else None,
        "jobs_to_next": to_next, "progress": progress,
        "lifetime_jobs": lifetime_jobs,
    }


async def partner_dashboard(partner, range="30d", date_from="", date_to=""):
    """Advanced analytics for the logged-in partner (Point 11).

    Supports preset ranges (7d/30d/90d/365d/all) and a custom date range
    (date_from / date_to as YYYY-MM-DD). All numbers are computed from real
    collections — bookings, partner_ledger and partner_response_events."""
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    custom = bool(date_from and date_to)
    if custom:
        since = f"{date_from}T00:00:00+00:00"
        until = f"{date_to}T23:59:59+00:00"
        range_key = "custom"
    else:
        days = {"7d": 7, "30d": 30, "90d": 90, "365d": 365, "all": 3650}.get(range, 30)
        since = (now - timedelta(days=days)).isoformat()
        until = now.isoformat()
        range_key = range
    pid = partner["id"]

    def _in_range(iso):
        return since <= (iso or "") <= until

    all_mine = await db.bookings.find(
        {"$or": [{"partner_id": pid}, {"eligible_partner_ids": pid}]},
        {"_id": 0, "otps": 0}).to_list(3000)
    mine = [b for b in all_mine if b.get("partner_id") == pid]
    ranged = [b for b in mine if _in_range(b.get("created_at"))]
    completed = [b for b in ranged if b.get("status") in ("completed", "paid")]
    active = [b for b in mine if b.get("status") in ("assigned", "arrived_shop", "arrived_customer", "started")]
    cancelled = [b for b in ranged if b.get("status") == "cancelled"]

    # ---- earnings from the wallet ledger (source of truth) ----
    all_ledger = await db.partner_ledger.find({"partner_id": pid}, {"_id": 0}).to_list(8000)

    def _credit(e):
        return e.get("direction") == "credit" and e.get("status") == "completed"

    def _sum_since(iso_start):
        return money.add(*[e["amount"] for e in all_ledger
                           if _credit(e) and (e.get("created_at") or "") >= iso_start])

    earnings = money.add(*[e["amount"] for e in all_ledger
                           if _credit(e) and _in_range(e.get("created_at"))])
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_start = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0).isoformat()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_earnings = _sum_since(today_start)
    week_earnings = _sum_since(week_start)
    month_earnings = _sum_since(month_start)
    total_earnings = money.add(*[e["amount"] for e in all_ledger if _credit(e)])

    # ---- wallet balances (mirror of partner_service.wallet_summary) ----
    balance = float(partner.get("wallet_balance", 0) or 0)
    locked = money.add(*[e["amount"] for e in all_ledger
                         if e.get("kind") == "withdrawal" and e.get("status") == "pending"])
    total_withdrawn = money.add(*[e["amount"] for e in all_ledger
                                  if e.get("kind") == "withdrawal" and e.get("status") == "completed"])
    wallet = {
        "available": money.money(balance),
        "withdrawable": max(money.add(balance, -locked), 0.0),
        "pending": money.money(locked),
        "total_withdrawn": money.money(total_withdrawn),
    }

    # ---- earnings + jobs series (zero-filled/bucketed across the whole window) ----
    # Build the raw per-day totals first, then densify across the ENTIRE selected
    # window so the trend line always spans the full range (a continuous chart)
    # instead of collapsing into a meaningless 1-2 point diagonal when the partner
    # only had activity on a couple of days.
    from datetime import date as _date, timedelta as _td
    raw = {}
    for e in all_ledger:
        if _credit(e) and _in_range(e.get("created_at")):
            d = (e.get("created_at") or "")[:10]
            if d:
                row = raw.setdefault(d, {"amount": 0.0, "jobs": 0})
                row["amount"] = money.add(row["amount"], e["amount"])
    for b in completed:
        d = (b.get("updated_at") or b.get("created_at") or "")[:10]
        if d:
            row = raw.setdefault(d, {"amount": 0.0, "jobs": 0})
            row["jobs"] += 1

    def _pdate(s):
        try:
            return _date.fromisoformat((s or "")[:10])
        except Exception:
            return None

    end_d = _pdate(until) or now.date()
    start_d = _pdate(since) or end_d
    # For "all", don't draw empty years — clamp the start to earliest activity.
    if range_key == "all":
        data_days = [dd for dd in (_pdate(k) for k in raw.keys()) if dd]
        start_d = min(data_days) if data_days else (end_d - _td(days=29))
    if start_d > end_d:
        start_d = end_d

    span = (end_d - start_d).days
    gran = "day" if span <= 92 else ("week" if span <= 550 else "month")

    def _bucket_key(dd):
        if gran == "day":
            return dd.isoformat()
        if gran == "week":
            return (dd - _td(days=dd.weekday())).isoformat()
        return dd.strftime("%Y-%m")

    def _bucket_seq():
        keys = []
        if gran == "day":
            cur = start_d
            while cur <= end_d:
                keys.append(cur.isoformat()); cur += _td(days=1)
        elif gran == "week":
            cur = start_d - _td(days=start_d.weekday())
            while cur <= end_d:
                keys.append(cur.isoformat()); cur += _td(days=7)
        else:
            y, m = start_d.year, start_d.month
            while (y, m) <= (end_d.year, end_d.month):
                keys.append(f"{y:04d}-{m:02d}")
                m += 1
                if m > 12:
                    m = 1; y += 1
        return keys

    buckets = {k: {"amount": 0.0, "jobs": 0} for k in _bucket_seq()}
    for d, row in raw.items():
        dd = _pdate(d)
        if not dd:
            continue
        bk = _bucket_key(dd)
        bucket = buckets.setdefault(bk, {"amount": 0.0, "jobs": 0})
        bucket["amount"] = money.add(bucket["amount"], row["amount"])
        bucket["jobs"] += row["jobs"]

    chart = [{"date": k, "amount": money.money(v["amount"]), "jobs": v["jobs"]}
             for k, v in sorted(buckets.items())]

    # ---- response stats → acceptance rate + missed jobs (real events) ----
    events = await db.partner_response_events.find(
        {"user_id": pid}, {"_id": 0, "type": 1, "at": 1}).to_list(8000)
    ev_ranged = [e for e in events if _in_range(e.get("at"))]
    accepted_n = sum(1 for e in ev_ranged if e.get("type") == "accepted")
    missed_n = sum(1 for e in ev_ranged if e.get("type") == "missed")
    rejected_n = sum(1 for e in ev_ranged if e.get("type") == "rejected")
    offered_n = accepted_n + missed_n + rejected_n
    acceptance_rate = round(accepted_n / offered_n * 100) if offered_n else None
    terminal = len(completed) + len(cancelled)
    completion_rate = round(len(completed) / terminal * 100) if terminal else None
    cancellation_rate = round(len(cancelled) / terminal * 100) if terminal else None
    avg_per_job = money.money(earnings / len(completed)) if completed else 0

    fresh = await db.users.find_one({"id": pid}, {"_id": 0, "rating": 1, "jobs_completed": 1,
                                                  "partner_status": 1, "wallet_balance": 1,
                                                  "reviews_count": 1, "accept_streak": 1,
                                                  "best_streak": 1, "premium_partner": 1,
                                                  "partner_badge": 1})
    fresh = fresh or {}
    feed_count = await db.bookings.count_documents({"status": "searching", "eligible_partner_ids": pid})
    lifetime_jobs = fresh.get("jobs_completed", 0)

    return {
        "range": range_key,
        "date_from": date_from, "date_to": date_to,
        "kpis": {
            "jobs_completed": len(completed),
            "active_jobs": len(active),
            "cancelled": len(cancelled),
            "missed_jobs": missed_n,
            "earnings": earnings,
            "today_earnings": today_earnings,
            "week_earnings": week_earnings,
            "month_earnings": month_earnings,
            "total_earnings": total_earnings,
            "avg_per_job": avg_per_job,
            "rating": round(float(fresh.get("rating", 0) or 0), 1),
            "reviews_count": int(fresh.get("reviews_count", 0) or 0),
            "lifetime_jobs": lifetime_jobs,
            "wallet_balance": money.money(fresh.get("wallet_balance", 0) or 0),
            "open_requests": feed_count,
            "status": fresh.get("partner_status", "offline"),
            "acceptance_rate": acceptance_rate,
            "completion_rate": completion_rate,
            "cancellation_rate": cancellation_rate,
            "offered": offered_n,
            "accepted": accepted_n,
            "accept_streak": int(fresh.get("accept_streak", 0) or 0),
            "best_streak": int(fresh.get("best_streak", 0) or 0),
            "premium_partner": bool(fresh.get("premium_partner")),
            "partner_badge": fresh.get("partner_badge"),
        },
        "wallet": wallet,
        "growth": _partner_tier(lifetime_jobs),
        "earnings_chart": chart,
        "recent": sorted(mine, key=lambda x: x.get("updated_at", ""), reverse=True)[:8],
    }


async def _advance(booking_id, status):
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": status, "updated_at": now_iso()},
         "$push": {"timeline": {"status": status, "at": now_iso()}}})
    b = await _get_booking(booking_id)
    brief = _job_brief(b)
    rt.emit_admin("job_update", brief)
    rt.emit_user(b.get("customer_id"), "booking_update", brief)
    return b


async def accept_job(partner, booking_id):
    b = await _get_booking(booking_id)
    if partner["id"] not in b.get("eligible_partner_ids", []):
        raise HTTPException(status_code=403, detail="You are not eligible for this job")
    # atomic claim: only one partner can move it out of 'searching'
    res = await db.bookings.update_one(
        {"id": booking_id, "status": "searching"},
        {"$set": {"partner_id": partner["id"], "partner_name": partner["name"],
                  "partner_premium": bool(partner.get("premium_partner")),
                  "partner_badge": partner.get("partner_badge") if partner.get("premium_partner") else None,
                  "partner_rating": partner.get("rating"),
                  "status": "assigned", "updated_at": now_iso()},
         "$push": {"timeline": {"status": "assigned", "at": now_iso()}}})
    if res.modified_count != 1:
        raise HTTPException(status_code=400, detail="Job no longer available")
    out = await _get_booking(booking_id)
    await _record_response(partner["id"], "accepted")
    await _record_dispatch_response(booking_id, partner["id"], "accepted")
    await _notify(out["customer_id"], "Partner assigned",
                  f"{partner['name']} is assigned to {out['code']} and on the way.",
                  event_type="partner_assigned",
                  ctx={"customer_name": out.get("customer_name", ""), "partner_name": partner["name"], "booking_id": out["code"]})
    # first-accept-wins: close this request on every other partner. Mark their
    # still-pending dispatch rows 'superseded' (for the admin feed) and stop their
    # ring via a job_taken event. (spec 12, 16, 17, 21)
    brief = _job_brief(out)
    others = set(b.get("offered_partner_ids", []) or []) | set(b.get("eligible_partner_ids", []) or [])
    try:
        pend = await db.booking_dispatches.find(
            {"booking_id": booking_id, "response": "pending"}, {"_id": 0, "partner_id": 1}
        ).to_list(200)
        for row in pend:
            if row["partner_id"] != partner["id"]:
                await _record_dispatch_response(booking_id, row["partner_id"], "superseded")
    except Exception:  # noqa: BLE001
        pass
    for pid in others:
        if pid != partner["id"]:
            rt.emit_user(pid, "job_taken", {"id": booking_id, "code": out.get("code")})
            try:
                # Silent data push → cancels the ringing full-screen alert on a
                # backgrounded/killed device (mobile background handler).
                from services import push_dispatch
                await push_dispatch.push_to_user(
                    pid, "Job taken", "", link="/partner",
                    data={"type": "job_taken", "booking_id": booking_id, "code": out.get("code", "")},
                    data_only=True)
            except Exception:  # noqa: BLE001
                pass
    rt.emit_user(partner["id"], "job_accepted", brief)
    rt.emit_admin("job_update", brief)
    out["otps"] = {}
    return out


async def reject_job(partner, booking_id, reason=""):
    """Partner declines/rejects a job. If they were the assigned partner, the
    booking is re-opened (back to 'searching') and admins are alerted so it can
    be re-assigned. If it was only a broadcast in their feed, it's just removed
    from their feed."""
    b = await _get_booking(booking_id)
    if b.get("status") in ("completed", "paid", "cancelled"):
        raise HTTPException(status_code=400, detail="Cannot reject this booking")
    if (reason or "").startswith("auto"):
        await _record_response(partner["id"], "missed")
    await _record_dispatch_response(booking_id, partner["id"], "rejected")
    # Record the rejection so this partner is NOT offered the same job again in
    # this dispatch cycle. (spec 15) The customer's booking is never cancelled.
    await db.bookings.update_one(
        {"id": booking_id}, {"$addToSet": {"rejected_partner_ids": partner["id"]}})
    is_assigned = b.get("partner_id") == partner["id"]
    remaining = [x for x in b.get("eligible_partner_ids", []) if x != partner["id"]]
    if is_assigned:
        # The already-assigned partner backed out — re-open the booking and alert
        # admins, then immediately resume dispatch from the next wave. (spec 4,20)
        await db.bookings.update_one({"id": booking_id}, {
            "$set": {"partner_id": None, "partner_name": None, "status": "searching",
                     "dispatch_last_wave_at": now_iso(), "dispatch_exhausted": False,
                     "updated_at": now_iso()},
            "$push": {"timeline": {"status": "rejected", "at": now_iso(),
                                   "by": partner["id"], "reason": reason or ""}}})
        await db.notifications.insert_one({"id": new_id(), "audience": "admin", "user_id": None,
                                           "title": "Job rejected by partner",
                                           "body": f"{partner.get('name')} rejected {b.get('code')} "
                                                   f"({b.get('service_name')}). Re-dispatching.",
                                           "created_at": now_iso()})
        await escalate_dispatch(booking_id, reason="assigned_reject")
        rt.emit_admin("job_update", _job_brief(await _get_booking(booking_id)))
        return {"ok": True, "status": "searching", "reopened": True}
    if partner["id"] not in b.get("eligible_partner_ids", []):
        raise HTTPException(status_code=400, detail="This job is not in your feed")
    # A broadcast offer was declined — remove from this partner's feed and move on
    # to the next wave right away so we don't wait for the timeout. Booking stays
    # SEARCHING. (spec 8, 14, 15, 25)
    await db.bookings.update_one({"id": booking_id}, {
        "$set": {"eligible_partner_ids": remaining, "updated_at": now_iso()},
        "$push": {"timeline": {"status": "declined", "at": now_iso(), "by": partner["id"]}}})
    await escalate_dispatch(booking_id, reason="reject")
    rt.emit_admin("job_update", _job_brief(await _get_booking(booking_id)))
    return {"ok": True, "status": b.get("status"), "reopened": False}


async def mark_job_seen(partner, booking_id):
    """Partner's device actually DISPLAYED the incoming-job ring. Stamp the latest
    pending dispatch row with seen_at so the admin Live Dispatch feed can show
    'delivered → seen → responded'. Best-effort; never blocks the UI."""
    try:
        row = await db.booking_dispatches.find_one(
            {"booking_id": booking_id, "partner_id": partner["id"], "response": "pending"},
            sort=[("dispatched_at", -1)])
        if not row or row.get("seen_at"):
            return {"ok": True}
        seen_at = now_iso()
        await db.booking_dispatches.update_one({"id": row["id"]}, {"$set": {"seen_at": seen_at}})
        try:
            rt.emit_admin("dispatch_seen", {"id": row["id"], "booking_id": booking_id,
                                            "partner_id": partner["id"], "seen_at": seen_at})
        except Exception:  # noqa: BLE001
            pass
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True}



async def update_location(partner, booking_id, lat, lng):
    b = await _partner_owns(partner, booking_id)
    # Spec 2: partner live-location sharing is LOCKED until 30 min before a scheduled
    # job (server-authoritative — a direct API call cannot bypass it).
    if schedule_state(b).get("comm_locked"):
        raise HTTPException(status_code=423,
                            detail="Location sharing unlocks 30 minutes before your scheduled time.")
    await db.bookings.update_one({"id": booking_id},
                                 {"$set": {"partner_location": {"lat": lat, "lng": lng, "at": now_iso()}}})
    # Keep the partner's global live location in sync + push to admin live map.
    await db.users.update_one({"id": partner["id"]},
                              {"$set": {"live_location": {"lat": lat, "lng": lng}, "live_location_at": now_iso()}})
    rt.emit_admin("partner_location", {
        "id": partner["id"], "name": partner.get("name"), "phone": partner.get("phone"),
        "lat": lat, "lng": lng, "at": now_iso(), "booking_id": booking_id,
    })
    return {"ok": True}


async def _partner_owns(partner, booking_id):
    b = await _get_booking(booking_id)
    if b.get("partner_id") != partner["id"]:
        raise HTTPException(status_code=403, detail="Not your job")
    return b


async def verify_start_otp(partner, booking_id, otp):
    b = await _partner_owns(partner, booking_id)
    if b["status"] not in ("assigned", "arrived_shop"):
        raise HTTPException(status_code=400, detail="Invalid step")
    # Spec 2/18: Start-Work is locked until 30 minutes before a scheduled job.
    if schedule_state(b).get("comm_locked"):
        raise HTTPException(status_code=423,
                            detail="Work can start 30 minutes before the scheduled time.")
    if not (b.get("evidence", {}).get("before") or []):
        raise HTTPException(status_code=400, detail="Please upload 'before' work photos before starting.")
    if b["otps"]["start"] != otp:
        raise HTTPException(status_code=400, detail="Invalid customer start OTP")
    out = await _advance(booking_id, "started")
    out["otps"] = {}
    return _slim_partner_job(out, partner["id"])


def _slim_partner_job(b: dict, partner_id: str = None) -> dict:
    """Drop heavy, partner-irrelevant fields from a booking payload (dispatch lists can
    hold hundreds of ids). Keeps only this partner's own eligible_detail entry."""
    b.pop("eligible_partner_ids", None)
    b.pop("idempotency_key", None)
    det = b.get("eligible_detail")
    if isinstance(det, dict) and partner_id:
        b["eligible_detail"] = {partner_id: det[partner_id]} if partner_id in det else {}
    return b


async def _materialize_evidence(b: dict, partner: dict, stage: str, images: list) -> list:
    """Turn any inline base64 `data:` images into stored files (S3/local) and return
    URL-only list. Base64 must NEVER be persisted in the booking document — it bloats
    every list/poll/OTP response by megabytes and is the #1 cause of app latency."""
    import asyncio as _aio
    from services import storage_service
    folder = storage_service.job_folder(b, partner, stage)

    async def _one(img: str) -> str:
        try:
            return await storage_service.materialize_data_url((img or "").strip(), folder, max_side=1600)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    urls = await _aio.gather(*[_one(i) for i in images])
    return [u for u in urls if u]


async def upload_evidence(partner, booking_id, req):
    if req.stage not in ("before", "after"):
        raise HTTPException(status_code=400, detail="stage must be 'before' or 'after'")
    b = await _partner_owns(partner, booking_id)
    # Spec 2: Before-Work photo is LOCKED until 30 min before a scheduled job.
    if req.stage == "before" and schedule_state(b).get("comm_locked"):
        raise HTTPException(status_code=423,
                            detail="Before-work photo unlocks 30 minutes before your scheduled time.")
    urls = await _materialize_evidence(b, partner, req.stage, req.images or [])
    if urls:
        await db.bookings.update_one(
            {"id": booking_id}, {"$push": {f"evidence.{req.stage}": {"$each": urls}}})
    out = await _get_booking(booking_id)
    out["otps"] = {}
    return _slim_partner_job(out, partner["id"])


async def upload_evidence_file(partner, booking_id, stage, raw, content_type):
    """Camera-captured work proof (before/after). Saves the image via storage_service
    and appends its URL to the booking's evidence.{stage}. Camera-only capture is
    enforced on the client; this just persists the captured frame."""
    from services import storage_service
    if stage not in ("before", "after"):
        raise HTTPException(status_code=400, detail="stage must be 'before' or 'after'")
    b = await _partner_owns(partner, booking_id)
    # Spec 2: Before-Work photo is LOCKED until 30 min before a scheduled job.
    if stage == "before" and schedule_state(b).get("comm_locked"):
        raise HTTPException(status_code=423,
                            detail="Before-work photo unlocks 30 minutes before your scheduled time.")
    try:
        res = await storage_service.save_image(raw, content_type or "image/jpeg",
                                               folder=storage_service.job_folder(b, partner, stage), max_side=1600)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    url = res["url"]
    await db.bookings.update_one(
        {"id": booking_id}, {"$push": {f"evidence.{stage}": url}})
    return {"ok": True, "stage": stage, "url": url}


async def remove_evidence(partner, booking_id, stage, url):
    """Remove a single uploaded work-proof photo so the partner can re-capture it.
    Same 30-min lock applies to 'before'. No duplicate/stale record remains."""
    if stage not in ("before", "after"):
        raise HTTPException(status_code=400, detail="stage must be 'before' or 'after'")
    if not (url or "").strip():
        raise HTTPException(status_code=400, detail="Photo url required")
    b = await _partner_owns(partner, booking_id)
    if stage == "before" and schedule_state(b).get("comm_locked"):
        raise HTTPException(status_code=423,
                            detail="Before-work photo unlocks 30 minutes before your scheduled time.")
    await db.bookings.update_one(
        {"id": booking_id}, {"$pull": {f"evidence.{stage}": url}})
    out = await _get_booking(booking_id)
    out["otps"] = {}
    return _slim_partner_job(out, partner["id"])


async def add_spare_part(partner, booking_id, req):
    b = await _partner_owns(partner, booking_id)
    if b["status"] not in ("started", "arrived_customer"):
        raise HTTPException(status_code=400, detail="Add parts only during an active service")
    settings = await get_settings()
    needs_approval = settings.get("spare_parts_customer_approval", True)
    part = {"id": new_id(), "name": req.name, "quantity": req.quantity,
            "price": round(float(req.price), 2), "total": round(float(req.price) * req.quantity, 2),
            "notes": req.notes, "status": "pending" if needs_approval else "approved",
            "added_at": now_iso()}
    await db.bookings.update_one({"id": booking_id}, {"$push": {"spare_parts": part}})
    if needs_approval:
        await _notify(b["customer_id"], "Spare part approval needed",
                      f"{req.name} × {req.quantity} — ₹{part['total']} for {b['code']}. Please approve in the app.",
                      event_type="spare_part_approval", ctx={"booking_id": b["code"]})
    out = await _get_booking(booking_id)
    out["otps"] = {}
    return out


async def act_spare_part(customer, booking_id, part_id, action):
    b = await _get_booking(booking_id)
    if b["customer_id"] != customer["id"]:
        raise HTTPException(status_code=403, detail="Not your booking")
    parts = b.get("spare_parts", [])
    target = next((p for p in parts if p["id"] == part_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Spare part not found")
    if target["status"] != "pending":
        raise HTTPException(status_code=400, detail="Already processed")
    if action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be approve|reject")
    new_status = "approved" if action == "approve" else "rejected"
    await db.bookings.update_one(
        {"id": booking_id, "spare_parts.id": part_id},
        {"$set": {"spare_parts.$.status": new_status}})
    if b.get("partner_id"):
        await _notify(b["partner_id"], f"Spare part {new_status}",
                      f"Customer {new_status} {target['name']} for {b['code']}.")
    out = await _get_booking(booking_id)
    out["otps"] = _visible_otps(customer, out)
    return out


def _num(v):
    try:
        return money.money(v or 0)
    except (TypeError, ValueError):
        return 0.0


async def _recompute_additional(booking, settings):
    """Recompute additional-work totals + partner/platform split.
    Parts = full to partner (no commission). Labour = platform commission applies."""
    addl = booking.get("additional") or {}
    items = addl.get("items") or []
    parts_total = money.add(*[_num(i.get("part_charge")) for i in items])
    labour_total = money.add(*[_num(i.get("labour_charge")) for i in items])
    cm = CommissionEngine._cm(booking.get("commission_config") or settings)
    platform_pct = float(cm.get("platform_pct", 32))
    labour_platform = money.pct(labour_total, platform_pct)
    labour_partner = money.add(labour_total, -labour_platform)
    gst_pct = float(settings.get("gst_pct", 0) or 0)
    gst = money.pct(money.add(parts_total, labour_total), gst_pct)
    addl["parts_total"] = parts_total
    addl["labour_total"] = labour_total
    addl["gst"] = gst
    addl["total"] = money.add(parts_total, labour_total, gst)
    addl["platform_pct"] = platform_pct
    addl["partner_earning"] = money.add(parts_total, labour_partner)
    addl["platform_earning"] = money.add(labour_platform, gst)
    return addl


async def add_additional_work(partner, booking_id, req):
    b = await _partner_owns(partner, booking_id)
    if b["status"] not in ("started", "arrived_customer"):
        raise HTTPException(status_code=400, detail="Add additional work only during an active service")
    if not req.items:
        raise HTTPException(status_code=400, detail="Select at least one item")
    addl = b.get("additional") or {}
    if addl.get("status") == "paid":
        raise HTTPException(status_code=400, detail="Additional work already paid — create a fresh service for more work")
    items = addl.get("items") or []
    settings = await get_settings()
    for it in req.items:
        if _num(it.part_charge) <= 0 and _num(it.labour_charge) <= 0:
            continue
        items.append({
            "id": new_id(),
            "description": (it.description or "Additional work").strip(),
            "part_charge": _num(it.part_charge),
            "labour_charge": _num(it.labour_charge),
            "warranty": (it.warranty or "").strip(),
            "ratecard_row_id": it.ratecard_row_id or "",
            "category_id": it.category_id or b.get("category_id", ""),
            "added_at": now_iso(),
        })
    if not items:
        raise HTTPException(status_code=400, detail="Each item needs a part or labour charge")
    addl["items"] = items
    addl["status"] = "pending_payment"
    addl.setdefault("created_at", now_iso())
    addl = await _recompute_additional({**b, "additional": addl}, settings)
    await db.bookings.update_one({"id": booking_id}, {"$set": {"additional": addl, "updated_at": now_iso()}})
    await _notify(b["customer_id"], "Additional work added",
                  f"Your partner added additional work worth ₹{addl['total']} to {b['code']}. "
                  f"Please complete the additional payment in the app so the work can be finished.",
                  event_type="additional_work_added", ctx={"booking_id": b["code"]})
    out = await _get_booking(booking_id)
    out["otps"] = {}
    return out


async def remove_additional_item(partner, booking_id, item_id):
    b = await _partner_owns(partner, booking_id)
    addl = b.get("additional") or {}
    if addl.get("status") == "paid":
        raise HTTPException(status_code=400, detail="Paid additional work cannot be edited")
    items = [i for i in (addl.get("items") or []) if i.get("id") != item_id]
    settings = await get_settings()
    if not items:
        await db.bookings.update_one({"id": booking_id}, {"$unset": {"additional": ""}, "$set": {"updated_at": now_iso()}})
    else:
        addl["items"] = items
        addl["status"] = "pending_payment"
        addl = await _recompute_additional({**b, "additional": addl}, settings)
        await db.bookings.update_one({"id": booking_id}, {"$set": {"additional": addl, "updated_at": now_iso()}})
    out = await _get_booking(booking_id)
    out["otps"] = {}
    return out


async def pay_additional(customer, booking_id, method="online"):
    b = await _get_booking(booking_id)
    if b["customer_id"] != customer["id"]:
        raise HTTPException(status_code=403, detail="Not your booking")
    addl = b.get("additional") or {}
    if float(addl.get("total", 0) or 0) <= 0:
        raise HTTPException(status_code=400, detail="No additional work to pay for")
    if addl.get("status") == "paid":
        raise HTTPException(status_code=400, detail="Additional work already paid")
    total = money.money(addl.get("total", 0))
    if method == "wallet":
        fresh = await db.users.find_one({"id": customer["id"]}, {"_id": 0, "wallet_balance": 1})
        balance = float((fresh or {}).get("wallet_balance", 0) or 0)
        if balance < total:
            raise HTTPException(status_code=400, detail=f"Insufficient wallet balance. Need ₹{money.add(total, -balance)} more.")
        await db.users.update_one({"id": customer["id"]}, {"$inc": {"wallet_balance": -total}})
    await db.transactions.insert_one({
        "id": new_id(), "user_id": customer["id"], "amount": total, "type": "debit",
        "kind": "additional_work_payment", "note": f"Additional work payment for {b['code']}",
        "created_at": now_iso()})
    addl["status"] = "paid"
    addl["paid_at"] = now_iso()
    addl["paid_method"] = "wallet" if method == "wallet" else "online"
    await db.bookings.update_one({"id": booking_id}, {"$set": {"additional": addl, "updated_at": now_iso()}})
    if b.get("partner_id"):
        await _notify(b["partner_id"], "Additional payment received",
                      f"Customer paid ₹{total} for additional work on {b['code']}. You can now complete the job.")
    out = await _get_booking(booking_id)
    out["otps"] = _visible_otps(customer, out)
    return out


async def complete_job(partner, booking_id, otp):
    b = await _partner_owns(partner, booking_id)
    if b["status"] != "started":
        raise HTTPException(status_code=400, detail="Job not started yet")
    if not (b.get("evidence", {}).get("after") or []):
        raise HTTPException(status_code=400, detail="Please upload 'after' work photos before completing.")
    # Additional work must be PAID by the customer before the job can be completed.
    addl = b.get("additional") or {}
    if float(addl.get("total", 0) or 0) > 0 and addl.get("status") != "paid":
        raise HTTPException(
            status_code=400,
            detail="Additional work payment is pending. Please ask the customer to complete the additional payment before finishing the job.")
    if b["otps"]["completion"] != otp:
        raise HTTPException(status_code=400, detail="Invalid completion OTP")
    settings = await get_settings()
    ledger = await CommissionEngine.settle(b, settings, partner)
    await db.users.update_one({"id": partner["id"]}, {"$inc": {"jobs_completed": 1}})
    # approved spare parts are reimbursed to the partner
    spare_total = money.add(*[p.get("total", 0) for p in b.get("spare_parts", [])
                              if p.get("status") == "approved"])
    # Module 3: mirror earning into partner wallet ledger
    try:
        from services import partner_service as _ps
        await _ps.record_earning(partner["id"], ledger.get("partner_earning", 0),
                                 b.get("code"), booking_id)
        # visiting charge (travel reimbursement) → partner ledger for visibility
        _vc = money.money(ledger.get("visiting_charge") or 0)
        if _vc > 0:
            await db.partner_ledger.insert_one({
                "id": new_id(), "partner_id": partner["id"], "kind": "visiting_charge",
                "direction": "credit", "amount": _vc, "ref_type": "booking",
                "ref_id": booking_id, "note": f"Visiting charge · {b.get('code')}",
                "status": "completed", "created_at": now_iso()})
        if spare_total > 0:
            await db.users.update_one({"id": partner["id"]}, {"$inc": {"wallet_balance": spare_total}})
            await db.partner_ledger.insert_one({
                "id": new_id(), "partner_id": partner["id"], "kind": "spare_parts",
                "direction": "credit", "amount": spare_total, "ref_type": "booking",
                "ref_id": booking_id, "note": f"Spare parts reimbursement · {b.get('code')}",
                "status": "completed", "created_at": now_iso()})
    except Exception:
        pass
    # Additional work (paid by customer before completion): reimburse parts in full
    # (no commission) + labour minus the platform commission → straight to wallet.
    addl_partner = 0.0
    if addl and addl.get("status") == "paid":
        addl_partner = money.money(addl.get("partner_earning", 0) or 0)
        addl_platform = money.money(addl.get("platform_earning", 0) or 0)
        try:
            if addl_partner > 0:
                await db.users.update_one({"id": partner["id"]}, {"$inc": {"wallet_balance": addl_partner}})
                await db.transactions.insert_one({
                    "id": new_id(), "user_id": partner["id"], "amount": addl_partner, "type": "credit",
                    "kind": "additional_work", "note": f"Additional work earning · {b.get('code')}",
                    "created_at": now_iso()})
                await db.partner_ledger.insert_one({
                    "id": new_id(), "partner_id": partner["id"], "kind": "additional_work",
                    "direction": "credit", "amount": addl_partner, "ref_type": "booking",
                    "ref_id": booking_id, "note": f"Additional work (parts + labour) · {b.get('code')}",
                    "status": "completed", "created_at": now_iso()})
            await db.commission_ledger.insert_one({
                "id": new_id(), "booking_id": booking_id, "booking_code": b.get("code"),
                "partner_id": partner["id"], "partner_earning": addl_partner,
                "platform_earning": addl_platform, "merchant_referral": 0.0, "merchant_customer": 0.0,
                "base": money.add(addl.get("parts_total", 0), addl.get("labour_total", 0)),
                "gross": float(addl.get("total", 0)), "kind": "additional_work", "created_at": now_iso()})
        except Exception:
            pass
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": "completed", "payment_status": "paid",
                  "payment_method": b.get("payment_method") or "prepaid",
                  "commission": ledger, "updated_at": now_iso()},
         "$push": {"timeline": {"status": "completed", "at": now_iso()}}})
    # Accept-Streak Rewards: the milestone bonus is earned ONLY now that the accepted
    # job is actually COMPLETED — an accept that was later cancelled never counts.
    await _advance_accept_streak(partner["id"])
    if partner.get("referred_by_merchant") and ledger["merchant_referral"]:
        await db.merchant_partner_referrals.update_one(
            {"merchant_id": partner["referred_by_merchant"], "partner_phone": partner["phone"]},
            {"$inc": {"total_jobs": 1, "total_commission": ledger["merchant_referral"]}})
    out = await _get_booking(booking_id)
    rt.emit_admin("job_update", _job_brief(out))

    # Everything below is a side-effect the partner does NOT need to wait for
    # (loyalty points, referral credit, cashback, incentives, invoice, customer
    # notification). Run it in ONE background task so the "Complete Job" tap returns
    # as soon as the job is completed + the partner's earning is credited.
    async def _post_complete():
        try:
            from services import loyalty_service as _loy
            await _loy.earn(b.get("customer_id"), b.get("pricing", {}).get("total", 0), b.get("code"))
        except Exception:
            pass
        try:
            from services import referral_service as _ref
            await _ref.on_booking_completed(b.get("customer_id"), b)
        except Exception:
            pass
        try:
            from services import growth_service as _growth
            await _growth.issue_for_booking(await _get_booking(booking_id) or b)
        except Exception:
            pass
        try:
            from services import partner_service as _ps
            await _ps.auto_award_incentives(partner["id"])
        except Exception:
            pass
        try:
            from services import invoice_service as _inv
            fresh = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
            await _inv.ensure_booking_invoice(fresh, settings)
        except Exception:
            pass
        await _notify(
            b["customer_id"], "Service completed",
            f"Invoice for {b['code']} is ready: ₹{b['pricing']['total']}. Please rate your experience.",
            event_type="booking_completed",
            ctx={"customer_name": b.get("customer_name", ""), "booking_id": b["code"]})

    import asyncio as _aio
    try:
        _aio.create_task(_post_complete())
    except RuntimeError:
        await _post_complete()
    out["otps"] = {}
    return _slim_partner_job(out, partner["id"])


async def expire_stale_jobs():
    """DISABLED: searching bookings are never auto-cancelled anymore."""
    return 0


async def _expire_stale_jobs_legacy():
    """Auto-cancel bookings still in 'searching' past the configured timeout with no
    partner accepting, refund the customer, and alert admin. Runs every minute."""
    from datetime import datetime, timezone, timedelta
    settings = await get_settings()
    mins = int(settings.get("job_auto_expiry_minutes", 5) or 5)
    if mins <= 0:
        return 0
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=mins)).isoformat()
    stale = await db.bookings.find(
        {"status": "searching", "created_at": {"$lt": cutoff}}, {"_id": 0}).to_list(100)
    n = 0
    for b in stale:
        pricing = b.get("pricing", {}) or {}
        total_paid = float(pricing.get("total", 0)) if b.get("payment_status") == "paid" else 0.0
        refund_rec = None
        if total_paid > 0:
            refund_rec = await refund_service.initiate_refund(
                b, total_paid, "No partner was available in time (auto-cancelled)",
                breakdown={"refund_pct": 100, "partner_cancellation_pct": 0,
                           "partner_cancellation_amount": 0, "platform_commission": 0,
                           "service_cost": float(pricing.get("commissionable_base", 0)),
                           "tax_amount": float(pricing.get("gst", 0))})
        await db.bookings.update_one({"id": b["id"]}, {"$set": {
            "status": "cancelled", "payment_status": "refunded" if total_paid > 0 else b.get("payment_status"),
            "cancellation": {"by": "system", "reason": "auto_expired_no_partner",
                             "refund_pct": 100 if total_paid > 0 else 0, "refund": total_paid,
                             "at": now_iso()}, "updated_at": now_iso()},
            "$push": {"timeline": {"status": "cancelled", "at": now_iso(), "reason": "auto-expired (no partner)"}}})
        # Generate the two clearly-typed documents in order (Cancellation note first,
        # then the Refund Receipt) — both idempotent, so safe against cron re-runs.
        try:
            from services import invoice_service as _inv
            fresh_b = await db.bookings.find_one({"id": b["id"]}, {"_id": 0})
            await _inv.ensure_booking_invoice(fresh_b, settings)
            if refund_rec:
                fresh_r = await db.refunds.find_one({"id": refund_rec["id"]}, {"_id": 0}) or refund_rec
                await _inv.ensure_refund_invoice(fresh_r, settings)
        except Exception:
            pass
        await _notify(b["customer_id"], "Booking auto-cancelled",
                      f"No partner was available for {b.get('code')} in {mins} min."
                      + (f" ₹{total_paid} refund is being processed." if total_paid > 0 else ""))
        await db.notifications.insert_one({"id": new_id(), "audience": "admin", "user_id": None,
                                           "title": "Job auto-expired",
                                           "body": f"{b.get('code')} auto-cancelled — no partner accepted in {mins} min.",
                                           "link": "/admin", "read": False, "created_at": now_iso()})
        rt.emit_admin("job_update", _job_brief({**b, "status": "cancelled"}))
        n += 1
    return n


def _compute_cancellation(b: dict, settings: dict, partner: dict = None) -> dict:
    """Single source of truth for cancellation money-math — used by the live cancel,
    the pre-cancel preview AND the admin booking detail. No DB writes.

      paid_total      = what the customer ACTUALLY paid (discounts already excluded —
                        a discount is never refunded)
      tax             = GST paid on that amount
      service_amount  = paid_total − tax            (all charges, tax-excluded)
      CASE 1 no partner yet   → 100% refund of paid_total
      CASE 2 partner assigned → customer gets Customer Refund % of service_amount
                                + the SAME % of the tax (proportional tax refund);
                                the remaining service_amount (Partner Cancellation %)
                                is split exactly like a completed booking
                                (partner% → platform → merchant C/D); the remaining
                                tax stays with the platform as tax liability."""
    cm = CommissionEngine._cm(b.get("commission_config") or settings)
    pricing = b.get("pricing", {}) or {}
    paid = b.get("payment_status") == "paid"
    total_paid = money.money(pricing.get("total") or 0) if paid else 0.0
    gst_full = money.money(pricing.get("gst") or pricing.get("tax") or 0)
    if paid:
        gst = min(gst_full, total_paid)
        base = money.add(total_paid, -gst)
    else:
        gst = gst_full
        base = PricingEngine.paid_excl_tax(pricing)
    original_amount = total_paid if paid else money.add(base, gst)
    partner_on_job = bool(b.get("partner_id"))
    merchant_partner_id = (partner or {}).get("referred_by_merchant") if partner_on_job else None
    merchant_customer_id = b.get("merchant_id") if partner_on_job else None
    # Coupon discount is platform-absorbed. It is ADDED BACK to the partner/merchant/platform
    # cancellation split base (mirrors completion's commission_base_excl_tax) so a coupon
    # NEVER reduces the partner's cancellation earning — AzoApp funds it. The customer's
    # refund/retained is unaffected (a discount is never refunded to the customer).
    coupon_disc = money.money(pricing.get("discount") or 0)
    coupon_code = b.get("coupon_code") or None
    if not partner_on_job or not paid:
        refund_pct = 100.0 if not partner_on_job else float(cm.get("customer_refund_pct", 80))
        partner_cancel_pct = 0.0 if not partner_on_job else float(cm.get("partner_cancellation_pct", 20))
        service_refund, gst_refund = (base, gst) if (paid and not partner_on_job) else (0.0, 0.0)
        refund_amt = original_amount if (paid and not partner_on_job) else 0.0
        cancel_charge = gst_retained = 0.0
        commission_charge = 0.0
        split = CommissionEngine.split(0, cm, None, None)
    else:
        refund_pct = float(cm.get("customer_refund_pct", 80))
        partner_cancel_pct = float(cm.get("partner_cancellation_pct", 20))
        service_refund = money.pct(base, refund_pct)
        gst_refund = money.pct(gst, refund_pct)
        refund_amt = money.add(service_refund, gst_refund)
        # Retained portion is the exact remainder so refund + retained == paid (no leak).
        cancel_charge = money.add(base, -service_refund)
        gst_retained = money.add(gst, -gst_refund)
        # Split base = the retained cancellation charge WITH the coupon added back
        # (proportional to the cancellation %). This is what the partner/merchant/platform
        # split runs on, so the partner earns as if no coupon were used.
        # Convenience & Platform fees are 100% platform revenue: the partner/merchant
        # split runs on the SERVICE-side retained charge only (fees excluded) so a
        # cancellation never pays partner/merchant any part of these platform fees.
        _pf = PricingEngine.platform_only_fees(pricing)
        base_service = money.money(max(0.0, money.add(base, -_pf)))
        cancel_charge_service = money.add(base_service, -money.pct(base_service, refund_pct))
        commission_charge = money.add(cancel_charge_service, money.pct(coupon_disc, partner_cancel_pct))
        split = CommissionEngine.split(commission_charge, cm, merchant_partner_id, merchant_customer_id)
    item_refunds = []
    for it in (b.get("items") or []):
        iqty = max(1, int(it.get("qty", 1) or 1))
        it_addons = it.get("addons") or []
        base_unit = it.get("base_price")
        if base_unit is None:
            base_unit = float(it.get("unit_service_value") or 0) - sum(
                float(a.get("price") or 0) * int(a.get("qty", 1) or 1) for a in it_addons)
        # Add-on quantity is INDEPENDENT of the main service quantity.
        line_base = money.add(float(base_unit or 0) * iqty,
                              *[float(a.get("price") or 0) * int(a.get("qty", 1) or 1) for a in it_addons])
        item_refunds.append({"service_name": it.get("service_name") or it.get("name") or "Service",
                             "qty": iqty, "service_amount": line_base,
                             "refund": money.pct(line_base, refund_pct)})
    fees = money.add(pricing.get("platform_fee") or 0, pricing.get("convenience_fee") or 0,
                     pricing.get("visiting_charge") or 0)
    return {
        "partner_was_assigned": partner_on_job, "paid": paid,
        "original_amount": original_amount, "service_amount": base, "tax": gst, "fees": fees,
        "discount": money.money(pricing.get("total_discount") if pricing.get("total_discount") is not None
                                else pricing.get("discount") or 0),
        "refund_pct": refund_pct, "refund": refund_amt,
        "service_refund": service_refund, "gst_refund": gst_refund,
        "partner_cancellation_pct": partner_cancel_pct,
        "cancel_charge": cancel_charge, "gst_retained": gst_retained,
        # Coupon-added-back base the partner/platform/merchant split actually runs on
        # (== cancel_charge when there was no coupon). Used as the ledger/invoice base.
        "commission_charge": commission_charge,
        "coupon_code": coupon_code,
        "coupon_discount": coupon_disc if coupon_code else 0.0,
        "admin_cut": split["platform_earning"], "partner_cut": split["partner_earning"],
        "platform_gross": split["platform_gross"],
        "merchant_partner_comm": split["merchant_referral"], "merchant_customer_comm": split["merchant_customer"],
        "merchant_partner_id": merchant_partner_id, "merchant_customer_id": merchant_customer_id,
        "merchant_partner_pct": split["rates"]["merchant_partner_referral_pct"],
        "merchant_customer_pct": split["rates"]["merchant_customer_pct"],
        "partner_pct": split["rates"]["partner_pct"], "platform_pct": split["rates"]["platform_pct"],
        "retained_amount": money.add(cancel_charge, gst_retained),
        "total_adjustment": money.add(original_amount, -refund_amt),
        "item_refunds": item_refunds, "currency": settings.get("currency", "INR"),
    }


async def cancellation_preview(customer, booking_id):
    """Return the cancellation refund/retained breakdown WITHOUT cancelling — powers the
    customer 'Cancellation Breakdown' confirmation card."""
    b = await _get_booking(booking_id)
    _authorize(customer, b)
    status = b.get("status")
    cancellable = status not in ("started", "completed", "paid", "cancelled")
    settings = await get_settings()
    partner = None
    if b.get("partner_id"):
        partner = await db.users.find_one({"id": b["partner_id"]},
                                          {"_id": 0, "referred_by_merchant": 1})
    calc = _compute_cancellation(b, settings, partner)
    # Customer-safe view — never expose partner/platform internal splits.
    return {
        "cancellable": cancellable,
        "booking_code": b.get("code"),
        "partner_was_assigned": calc["partner_was_assigned"],
        "currency": calc["currency"],
        "original_amount": calc["original_amount"],
        "service_amount": calc["service_amount"],
        "tax": calc["tax"],
        "fees": calc["fees"],
        "refund_pct": calc["refund_pct"],
        "refund": calc["refund"],
        "service_refund": calc["service_refund"], "gst_refund": calc["gst_refund"],
        "discount": calc["discount"],
        "retained_from_you": money.add(calc["original_amount"], -calc["refund"]),
        "item_refunds": calc["item_refunds"],
        "reason": ("Full refund — no professional was assigned yet."
                   if not calc["partner_was_assigned"]
                   else f"A professional was already assigned, so {calc['refund_pct']:g}% of the service amount is refunded."),
    }


async def cancel_booking(customer, booking_id, reason=""):
    """Customer cancels a booking.
    - Allowed only BEFORE the work has started (once started → not cancellable).
    - Case 1 (no partner assigned yet): 100% refund of everything paid; partner gets nothing.
    - Case 2 (partner already accepted): admin-configured Customer Refund % on
      (service base + proportional GST) refunded; Partner Cancellation % of the pre-tax
      base is retained (platform commission out of it, remainder to the partner).
    - A rich refund record + a Refund Receipt document are created and processed."""
    b = await _get_booking(booking_id)
    _authorize(customer, b)
    status = b.get("status")
    if status in ("started",):
        raise HTTPException(status_code=400, detail="Work has already started — this booking can't be cancelled.")
    if status in ("completed", "paid", "cancelled"):
        raise HTTPException(status_code=400, detail="This booking can't be cancelled.")
    settings = await get_settings()
    partner_id = b.get("partner_id")
    partner = None
    if partner_id:
        partner = await db.users.find_one({"id": partner_id},
                                          {"_id": 0, "id": 1, "referred_by_merchant": 1})
    calc = _compute_cancellation(b, settings, partner)
    paid = calc["paid"]
    base = calc["service_amount"]
    gst = calc["tax"]
    original_amount = calc["original_amount"]
    partner_on_job = calc["partner_was_assigned"]
    refund_pct = calc["refund_pct"]
    partner_cancel_pct = calc["partner_cancellation_pct"]
    service_refund = calc["service_refund"]
    gst_refund = calc["gst_refund"]
    refund_amt = calc["refund"]
    cancel_charge = calc["cancel_charge"]
    commission_charge = calc["commission_charge"]
    admin_cut = calc["admin_cut"]
    partner_cut = calc["partner_cut"]
    item_refunds = calc["item_refunds"]
    fees = calc["fees"]
    merchant_partner_comm = calc["merchant_partner_comm"]
    merchant_customer_comm = calc["merchant_customer_comm"]
    merchant_partner_id = calc["merchant_partner_id"]
    merchant_customer_id = calc["merchant_customer_id"]

    # 1) Create + process the customer refund (back to source / wallet). Only when there
    #    is actually money to return (avoids empty ₹0 refund records for unpaid bookings).
    refund_rec = None
    if refund_amt > 0:
        refund_rec = await refund_service.initiate_refund(
            b, refund_amt, reason,
            breakdown={"refund_pct": refund_pct, "partner_cancellation_pct": partner_cancel_pct,
                       "partner_cancellation_amount": cancel_charge, "platform_commission": admin_cut,
                       "merchant_partner_commission": merchant_partner_comm,
                       "merchant_customer_commission": merchant_customer_comm,
                       "service_cost": base, "service_refund": service_refund,
                       "gst_refund": gst_refund, "tax_amount": gst})

    # 2) Credit the assigned partner the cancellation compensation (minus platform cut).
    partner_id = b.get("partner_id")
    if partner_id and partner_cut > 0:
        await db.users.update_one({"id": partner_id}, {"$inc": {"wallet_balance": partner_cut}})
        await db.partner_ledger.insert_one({
            "id": new_id(), "partner_id": partner_id, "kind": "cancellation_comp",
            "direction": "credit", "amount": partner_cut, "ref_type": "booking",
            "ref_id": booking_id, "note": f"Cancellation compensation · {b.get('code')}",
            "status": "completed", "created_at": now_iso()})
        await _notify(partner_id, "Booking cancelled — compensation credited",
                      f"{b.get('code')} was cancelled. ₹{partner_cut} credited to your wallet.")

    # 2b) Merchant referral commission out of the cancellation charge — the SAME
    #     referral flow as a completed booking (Model B): the merchant earns its
    #     configured Customer and/or Partner referral % of the cancellation charge,
    #     but only for relationships that actually exist on this booking. If the same
    #     merchant referred BOTH sides, one combined wallet transaction is created.
    #     No eligible merchant → NO zero/duplicate wallet transaction is created.
    if partner_on_job and cancel_charge > 0:
        if merchant_partner_id and merchant_customer_id and merchant_partner_id == merchant_customer_id:
            _m_total = money.add(merchant_partner_comm, merchant_customer_comm)
            if _m_total > 0:
                await CommissionEngine._credit(
                    merchant_partner_id, _m_total, "cancellation_referral_commission",
                    f"Cancellation referral commission · {b.get('code')} · "
                    f"Partner referral ₹{merchant_partner_comm} + Customer referral ₹{merchant_customer_comm}")
                await _notify(merchant_partner_id, "Cancellation referral commission credited",
                              f"₹{_m_total} credited for cancelled booking {b.get('code')} "
                              f"(partner ₹{merchant_partner_comm} + customer ₹{merchant_customer_comm}).")
        else:
            if merchant_partner_comm > 0 and merchant_partner_id:
                await CommissionEngine._credit(
                    merchant_partner_id, merchant_partner_comm, "cancellation_referral_commission",
                    f"Cancellation referral commission · {b.get('code')} · Partner referral")
                await _notify(merchant_partner_id, "Cancellation referral commission credited",
                              f"₹{merchant_partner_comm} credited for cancelled booking {b.get('code')} (partner referral).")
            if merchant_customer_comm > 0 and merchant_customer_id:
                await CommissionEngine._credit(
                    merchant_customer_id, merchant_customer_comm, "cancellation_referral_commission",
                    f"Cancellation referral commission · {b.get('code')} · Customer referral")
                await _notify(merchant_customer_id, "Cancellation referral commission credited",
                              f"₹{merchant_customer_comm} credited for cancelled booking {b.get('code')} (customer referral).")

    # 3) Record the cancellation split in the immutable ledger (even when the
    #    platform's own cut is ₹0 but merchant/partner shares moved money).
    if cancel_charge > 0:
        await db.commission_ledger.insert_one({
            "id": new_id(), "booking_id": booking_id, "booking_code": b.get("code"),
            "partner_id": partner_id, "partner_earning": partner_cut, "platform_earning": admin_cut,
            "merchant_referral": merchant_partner_comm, "referral_merchant_id": merchant_partner_id,
            "merchant_customer": merchant_customer_comm, "customer_merchant_id": merchant_customer_id,
            # legacy aliases so existing merchant-facing readers keep working
            "merchant_booking": merchant_customer_comm, "merchant_id": merchant_customer_id,
            "platform_gross": calc["platform_gross"], "tax": calc["gst_retained"],
            "base": commission_charge, "gross": original_amount, "kind": "cancellation",
            "created_at": now_iso()})

    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": "cancelled",
                  "payment_status": "refunded" if (paid and refund_amt > 0) else b.get("payment_status"),
                  "cancellation": {"by": "customer", "reason": reason,
                                   "partner_was_assigned": partner_on_job,
                                   "original_amount": original_amount,
                                   "service_amount": base, "tax": gst, "fees": fees,
                                   "refund_pct": refund_pct, "refund": refund_amt,
                                   "service_refund": service_refund, "gst_refund": gst_refund,
                                   "partner_cancellation_pct": partner_cancel_pct,
                                   "cancel_charge": cancel_charge, "penalty": cancel_charge,
                                   "commission_charge": commission_charge,
                                   "admin_cut": admin_cut, "partner_cut": partner_cut,
                                   "platform_gross": calc["platform_gross"], "gst_retained": calc["gst_retained"],
                                   "discount": calc["discount"], "platform_pct": calc["platform_pct"],
                                   "merchant_partner_comm": merchant_partner_comm,
                                   "merchant_customer_comm": merchant_customer_comm,
                                   "merchant_partner_id": merchant_partner_id,
                                   "merchant_customer_id": merchant_customer_id,
                                   "merchant_partner_pct": calc["merchant_partner_pct"],
                                   "merchant_customer_pct": calc["merchant_customer_pct"],
                                   "partner_split_pct": calc["partner_pct"],
                                   "item_refunds": item_refunds,
                                   "refund_id": refund_rec.get("id") if refund_rec else None,
                                   "refund_status": refund_rec.get("status") if refund_rec else None,
                                   "at": now_iso()},
                  "updated_at": now_iso()},
         "$push": {"timeline": {"status": "cancelled", "at": now_iso(), "reason": reason}}})
    # Generate the two clearly-typed documents for this cancellation now, at the event
    # (both idempotent — safe against retries / double-clicks / reloads):
    #   • Cancellation / Adjustment  → the credit-note for the cancelled service
    #   • Refund Receipt             → proof of the money returned to the customer
    try:
        from services import invoice_service as _inv
        fresh_b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
        await _inv.ensure_booking_invoice(fresh_b, settings)
        if refund_rec:
            fresh_r = await db.refunds.find_one({"id": refund_rec["id"]}, {"_id": 0}) or refund_rec
            await _inv.ensure_refund_invoice(fresh_r, settings)
    except Exception:
        pass
    _refund_msg = (f" ₹{refund_amt} ({refund_pct:g}%) refund is being processed."
                   if refund_amt > 0 else "")
    await _notify(customer["id"], "Booking cancelled",
                  f"{b.get('code')} cancelled.{_refund_msg}")
    out = await _get_booking(booking_id)
    rt.emit_admin("job_update", _job_brief(out))
    if b.get("partner_id"):
        rt.emit_user(b.get("partner_id"), "booking_update", _job_brief(out))
    out["otps"] = {}
    return out


async def add_review(customer, booking_id, req):
    b = await _get_booking(booking_id)
    _authorize(customer, b)
    if b["status"] not in ("completed", "paid"):
        raise HTTPException(status_code=400, detail="Can review only after completion")
    if b.get("review"):
        raise HTTPException(status_code=400, detail="Already reviewed")
    review = {"rating": req.rating, "comment": req.comment, "at": now_iso(),
              "customer_name": b.get("customer_name", ""),
              "service_name": b.get("service_name", ""),
              "booking_code": b.get("code", "")}
    await db.bookings.update_one({"id": booking_id}, {"$set": {"review": review}})
    if b.get("partner_id"):
        agg = await db.bookings.find({"partner_id": b["partner_id"], "review": {"$ne": None}},
                                     {"_id": 0, "review": 1}).to_list(1000)
        ratings = [x["review"]["rating"] for x in agg]  # already includes this review
        if ratings:
            await db.users.update_one({"id": b["partner_id"]},
                                      {"$set": {"rating": round(sum(ratings) / len(ratings), 1)}})
        # Streak Bonuses + Auto Payout: update the consecutive 5-star streak
        # (auto-credits a growing bonus at each milestone), then re-check
        # incentives since the new rating may have unlocked one.
        try:
            from services import partner_service as _ps
            await _ps.process_streak(b["partner_id"], req.rating)
            await _ps.auto_award_incentives(b["partner_id"])
        except Exception:
            pass
    out = await _get_booking(booking_id)
    out["otps"] = _visible_otps(customer, out)
    return out



# ---- pay from wallet (server-side, secure) ----
async def pay_from_wallet(user, booking_id):
    b = await _get_booking(booking_id)
    if b["customer_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your booking")
    if b.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Already paid")
    # Upfront wallet payment (pending_payment) pays & confirms the booking; the
    # legacy post-completion path settles a finished job.
    if b["status"] not in ("completed", "pending_payment"):
        raise HTTPException(status_code=400, detail="This booking is not awaiting payment")
    total = float(b["pricing"]["total"])
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "wallet_balance": 1})
    balance = float(fresh.get("wallet_balance", 0))
    if balance < total:
        raise HTTPException(status_code=400, detail=f"Insufficient wallet balance. Need ₹{money.add(total, -balance)} more.")
    await db.users.update_one({"id": user["id"]}, {"$inc": {"wallet_balance": -total}})
    await db.transactions.insert_one({
        "id": new_id(), "user_id": user["id"], "amount": total, "type": "debit",
        "kind": "booking_payment", "note": f"Wallet payment for {b['code']}", "created_at": now_iso()})
    if b["status"] == "pending_payment":
        # Upfront payment → confirm + start partner search (notifies eligible partners).
        await db.bookings.update_one({"id": booking_id}, {"$set": {
            "payment_method": "wallet", "updated_at": now_iso()}})
        await mark_paid_and_search(booking_id)
    else:
        await db.bookings.update_one({"id": booking_id}, {"$set": {
            "status": "paid", "payment_status": "paid", "payment_method": "wallet", "updated_at": now_iso()},
            "$push": {"timeline": {"status": "paid", "at": now_iso()}}})
    out = await _get_booking(booking_id)
    try:
        from services import membership_service
        await membership_service.consume_free_visit(user["id"], out)
    except Exception:
        pass
    out["otps"] = _visible_otps(user, out)
    return out


async def pay_group_from_wallet(user, group_id):
    """Point #13: pay for ALL unpaid bookings of one checkout (order group) from the
    wallet in a SINGLE combined debit, then confirm each booking & notify partners."""
    if not group_id:
        raise HTTPException(status_code=400, detail="Missing order group id")
    rows = await db.bookings.find(
        {"customer_id": user["id"], "order_group_id": group_id}, {"_id": 0}).to_list(50)
    if not rows:
        raise HTTPException(status_code=404, detail="No bookings found for this order")
    unpaid = [b for b in rows if b.get("payment_status") != "paid" and b.get("status") == "pending_payment"]
    if not unpaid:
        raise HTTPException(status_code=400, detail="This order is already paid")
    total = money.add(*[(b.get("pricing") or {}).get("total") or 0 for b in unpaid])
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "wallet_balance": 1})
    balance = float(fresh.get("wallet_balance", 0))
    if balance < total:
        raise HTTPException(status_code=400, detail=f"Insufficient wallet balance. Need ₹{money.add(total, -balance)} more.")
    codes = [b.get("code") for b in unpaid]
    await db.users.update_one({"id": user["id"]}, {"$inc": {"wallet_balance": -total}})
    await db.transactions.insert_one({
        "id": new_id(), "user_id": user["id"], "amount": total, "type": "debit",
        "kind": "booking_payment", "note": f"Wallet payment for order {'/'.join(codes[:4])}", "created_at": now_iso()})
    paid_ids = []
    for b in unpaid:
        await db.bookings.update_one({"id": b["id"]}, {"$set": {
            "payment_method": "wallet", "updated_at": now_iso()}})
        await mark_paid_and_search(b["id"])
        paid_ids.append(b["id"])
    return {"ok": True, "count": len(paid_ids), "booking_ids": paid_ids, "total": total}


# ---- repeat booking (validate current service state) ----
async def repeat_preview(user, booking_id):
    old = await _get_booking(booking_id)
    if old["customer_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your booking")
    svc = await db.services.find_one({"id": old["service_id"]}, {"_id": 0})
    issues = []
    available = True
    if not svc:
        return {"available": False, "issues": ["Service no longer exists"], "service": None}
    if svc.get("status") != "active" or svc.get("approval_status", "approved") != "approved":
        available = False
        issues.append("Service is currently unavailable")
    cat = await db.categories.find_one({"id": svc.get("category_id")}, {"_id": 0})
    if not cat or cat.get("status") != "active":
        available = False
        issues.append("Category is currently unavailable")
    old_price = old.get("pricing", {}).get("base") or old.get("pricing", {}).get("total")
    cur_price = svc.get("discounted_price") or svc.get("base_price")
    price_changed = bool(old_price and cur_price and round(float(old_price), 2) != round(float(cur_price), 2))
    # validate old addons still exist
    valid_addons = [a["name"] for a in svc.get("addons", [])]
    old_addons = old.get("addons", [])
    dropped = [a for a in old_addons if a not in valid_addons]
    return {
        "available": available, "issues": issues, "service": svc,
        "address": old.get("address"), "addons": [a for a in old_addons if a in valid_addons],
        "dropped_addons": dropped, "price_changed": price_changed,
        "old_price": old_price, "current_price": cur_price,
    }



# ─────────────────────────────────────────────────────────────────────────────
# LIVE BOOKING TRACKING (customer-facing) — real GPS when available, else a smooth
# demo simulation so the map + ETA visibly update while the partner is en route.
# ─────────────────────────────────────────────────────────────────────────────
import math

# Friendly, ordered timeline the customer sees while a job progresses.
_TRACK_STEPS = [
    ("searching", "Finding your professional"),
    ("assigned", "Professional assigned — on the way"),
    ("arrived_customer", "Arrived at your location"),
    ("started", "Service in progress"),
    ("completed", "Service completed"),
]
# Statuses during which the partner is travelling to the customer.
_ENROUTE_STATES = ("assigned", "arrived_shop")
# Default centre used only if a booking address has no coordinates (Patna).
_DEFAULT_CENTER = {"lat": 25.5941, "lng": 85.1376}
_DEMO_TRAVEL_SECONDS = 120  # compressed travel time so the demo is watchable


def _haversine_km(a_lat, a_lng, b_lat, b_lng):
    R = 6371.0
    dlat = math.radians(b_lat - a_lat)
    dlng = math.radians(b_lng - a_lng)
    x = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(a_lat)) * math.cos(math.radians(b_lat)) * math.sin(dlng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x))


def _addr_coords(addr):
    addr = addr or {}
    for la, lo in (("lat", "lng"), ("latitude", "longitude")):
        try:
            if addr.get(la) is not None and addr.get(lo) is not None:
                return {"lat": float(addr[la]), "lng": float(addr[lo])}
        except (TypeError, ValueError):
            pass
    loc = addr.get("location") or {}
    try:
        if loc.get("lat") is not None and loc.get("lng") is not None:
            return {"lat": float(loc["lat"]), "lng": float(loc["lng"])}
    except (TypeError, ValueError):
        pass
    return dict(_DEFAULT_CENTER)


def _lerp(a, b, t):
    return a + (b - a) * t


async def track_booking(user, booking_id):
    b = await _get_booking(booking_id)
    _authorize(user, b)  # customer owner, assigned partner, or admin
    status = b.get("status")
    settings = await get_settings()
    demo_mode = bool(settings.get("demo_mode", False))

    cust = _addr_coords(b.get("address"))
    partner_loc = None
    eta_minutes = None
    demo = False
    now = datetime.now(timezone.utc)

    # A real, recent partner GPS ping always wins over the simulation.
    real = b.get("partner_location")
    real_fresh = False
    if real and real.get("lat") is not None:
        try:
            ts = datetime.fromisoformat(real.get("at")) if real.get("at") else None
            if ts and (now - ts).total_seconds() < 120:
                real_fresh = True
        except (TypeError, ValueError):
            real_fresh = bool(real.get("lat"))

    if b.get("partner_id") and status in _ENROUTE_STATES:
        if real_fresh:
            partner_loc = {"lat": float(real["lat"]), "lng": float(real["lng"])}
            d = _haversine_km(partner_loc["lat"], partner_loc["lng"], cust["lat"], cust["lng"])
            eta_minutes = max(1, int(round(d / 0.4)))  # ~24 km/h city speed
        elif demo_mode:
            demo = True
            dt = b.get("demo_track")
            if not dt:
                # Start ~4 km away on a fixed bearing from the customer.
                dt = {
                    "start": {"lat": cust["lat"] + 0.035, "lng": cust["lng"] + 0.028},
                    "started_at": now.isoformat(),
                    "dur_s": _DEMO_TRAVEL_SECONDS,
                }
                await db.bookings.update_one({"id": booking_id}, {"$set": {"demo_track": dt}})
            try:
                started = datetime.fromisoformat(dt["started_at"])
            except (TypeError, ValueError):
                started = now
            elapsed = (now - started).total_seconds()
            prog = max(0.0, min(1.0, elapsed / float(dt.get("dur_s") or _DEMO_TRAVEL_SECONDS)))
            partner_loc = {
                "lat": round(_lerp(dt["start"]["lat"], cust["lat"], prog), 6),
                "lng": round(_lerp(dt["start"]["lng"], cust["lng"], prog), 6),
            }
            eta_minutes = max(0, int(round((1 - prog) * (dt.get("dur_s", _DEMO_TRAVEL_SECONDS) / 60.0) * 4)))
    elif b.get("partner_id") and status in ("arrived_customer", "started"):
        # Partner has reached the customer — pin them at the doorstep.
        partner_loc = dict(cust)
        eta_minutes = 0

    # Build the customer-facing timeline with reached flags + timestamps.
    tl = b.get("timeline") or []
    reached_at = {}
    for ev in tl:
        st = ev.get("status")
        if st and st not in reached_at:
            reached_at[st] = ev.get("at")
    order_reached = {s: i for i, (s, _) in enumerate(_TRACK_STEPS)}
    cur_idx = order_reached.get(status, -1)
    # 'paid' & 'pending_payment' map before 'searching'; treat >=assigned appropriately
    if status in ("paid",):
        cur_idx = order_reached.get("completed", 4)
    timeline = []
    for i, (key, label) in enumerate(_TRACK_STEPS):
        timeline.append({
            "key": key, "label": label,
            "reached": (key in reached_at) or (cur_idx >= i and cur_idx >= 0),
            "current": key == status,
            "at": reached_at.get(key),
        })

    partner = None
    if b.get("partner_id"):
        pu = await db.users.find_one({"id": b["partner_id"]},
                                     {"_id": 0, "name": 1, "phone": 1, "rating": 1,
                                      "jobs_completed": 1, "vehicle": 1, "avatar": 1})
        if pu:
            partner = {
                "id": b["partner_id"], "name": pu.get("name"), "phone": pu.get("phone"),
                "rating": round(float(pu.get("rating", 0) or 0), 1),
                "jobs_completed": pu.get("jobs_completed", 0),
                "vehicle": pu.get("vehicle"), "avatar": pu.get("avatar"),
            }

    distance_km = None
    if partner_loc:
        distance_km = round(_haversine_km(partner_loc["lat"], partner_loc["lng"],
                                          cust["lat"], cust["lng"]), 2)

    if status in ("arrived_customer", "started"):
        eta_text = "Professional has arrived"
    elif eta_minutes == 0 and partner_loc:
        eta_text = "Arriving now"
    elif eta_minutes:
        eta_text = f"{eta_minutes} min away"
    else:
        eta_text = ""

    sched_st = schedule_state(b)
    if sched_st.get("comm_locked") and partner:
        partner["phone"] = None

    return {
        "id": b["id"], "code": b.get("code"), "status": status,
        "service_name": b.get("service_name"),
        "trackable": status in _ENROUTE_STATES or status in ("arrived_customer", "started"),
        "partner": partner,
        "partner_location": partner_loc,
        "customer_location": cust,
        "address_line": (b.get("address") or {}).get("line") or (b.get("address") or {}).get("full_address") or "",
        "eta_minutes": eta_minutes, "eta_text": eta_text,
        "distance_km": distance_km,
        "timeline": timeline,
        "demo": demo,
        "schedule": sched_st,
        "otps": {},
    }


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC PARTNER REVIEWS (shown on a partner's public profile) + partner's own list
# ─────────────────────────────────────────────────────────────────────────────
def _review_public(b):
    r = b.get("review") or {}
    return {
        "rating": r.get("rating"),
        "comment": r.get("comment", ""),
        "at": r.get("at"),
        "service_name": r.get("service_name") or b.get("service_name", ""),
        "customer_name": (r.get("customer_name") or b.get("customer_name") or "A customer"),
    }


def _mask_name(name):
    name = (name or "").strip()
    if not name:
        return "A customer"
    parts = name.split()
    first = parts[0]
    last_i = (parts[-1][0] + ".") if len(parts) > 1 else ""
    return f"{first} {last_i}".strip()


async def partner_public_reviews(partner_id, limit=50):
    pu = await db.users.find_one({"id": partner_id, "role": "partner"},
                                 {"_id": 0, "name": 1, "rating": 1, "jobs_completed": 1, "avatar": 1})
    if not pu:
        raise HTTPException(status_code=404, detail="Partner not found")
    docs = await db.bookings.find(
        {"partner_id": partner_id, "review": {"$ne": None}},
        {"_id": 0, "review": 1, "service_name": 1, "customer_name": 1}
    ).sort("review.at", -1).to_list(limit)
    reviews = []
    dist = {5: 0, 4: 0, 3: 0, 2: 0, 1: 0}
    for d in docs:
        rv = _review_public(d)
        rv["customer_name"] = _mask_name(rv["customer_name"])
        reviews.append(rv)
        rt_val = rv.get("rating")
        if rt_val in dist:
            dist[rt_val] += 1
    return {
        "partner": {
            "id": partner_id, "name": pu.get("name"),
            "rating": round(float(pu.get("rating", 0) or 0), 1),
            "jobs_completed": pu.get("jobs_completed", 0),
            "avatar": pu.get("avatar"),
        },
        "count": len(reviews),
        "distribution": dist,
        "reviews": reviews,
    }


async def my_partner_reviews(partner, limit=100):
    return await partner_public_reviews(partner["id"], limit)


# ── Customer live dispatch status (cab-app style "Searching partner · 3 rung · 1 seen")
async def customer_dispatch_status(user, booking_id):
    b = await _get_booking(booking_id)
    _authorize(user, b)
    rows = await db.booking_dispatches.find({"booking_id": booking_id}, {"_id": 0, "partner_id": 1, "seen_at": 1, "response": 1, "dispatched_at": 1}).to_list(500)
    seen_pids = {r["partner_id"] for r in rows if r.get("seen_at")}
    rung_pids = {r["partner_id"] for r in rows}
    cfg = await _dispatch_settings()
    started = b.get("dispatch_started_at") or b.get("created_at")
    elapsed = None
    try:
        elapsed = int((datetime.now(timezone.utc) - datetime.fromisoformat(str(started).replace("Z", "+00:00"))).total_seconds())
    except Exception:  # noqa: BLE001
        pass
    det = b.get("eligible_detail") or {}
    etas = sorted(int(d["eta_min"]) for d in det.values() if isinstance(d, dict) and d.get("eta_min") is not None)
    return {
        "booking_id": b["id"], "code": b.get("code"), "status": b.get("status"),
        "searching": b.get("status") == "searching",
        "eligible": len(b.get("eligible_partner_ids") or []),
        "rung": len(rung_pids), "seen": len(seen_pids),
        "ringing_now": sum(1 for r in rows if r.get("response") == "pending"),
        "declined": sum(1 for r in rows if r.get("response") in ("rejected", "timeout")),
        "wave": int(b.get("dispatch_wave") or 0), "max_waves": cfg["max_waves"],
        "nearby_expanded": bool(b.get("dispatch_nearby_expanded")),
        "exhausted": bool(b.get("dispatch_exhausted")),
        "elapsed_sec": elapsed, "nearest_eta_min": etas[0] if etas else None,
        "partner_name": b.get("partner_name") if b.get("status") != "searching" else None,
        "partner_rating": b.get("partner_rating") if b.get("status") != "searching" else None,
    }


# ── Partner: jobs missed while offline / unanswered, still open → one-tap re-grab
async def partner_missed_jobs(partner):
    pid = partner["id"]
    since = (datetime.now(timezone.utc) - timedelta(hours=12)).isoformat()
    rows = await db.bookings.find(
        {"status": "searching", "eligible_partner_ids": pid, "rejected_partner_ids": {"$ne": pid},
         "created_at": {"$gte": since}},
        {"_id": 0, "otps": 0}).sort("created_at", -1).to_list(50)
    if not rows:
        return []
    ids = [b["id"] for b in rows]
    disp = await db.booking_dispatches.find(
        {"booking_id": {"$in": ids}, "partner_id": pid}, {"_id": 0, "booking_id": 1, "response": 1, "dispatched_at": 1}).to_list(500)
    last = {}
    for d in sorted(disp, key=lambda x: x.get("dispatched_at") or ""):
        last[d["booking_id"]] = d
    out = []
    for b in rows:
        d = last.get(b["id"])
        if d and d.get("response") == "pending":
            continue  # currently ringing — handled by the live ring, not "missed"
        reason = "offline" if not d else ("no_answer" if d.get("response") == "timeout" else "taken_back")
        det = (b.get("eligible_detail") or {}).get(pid) or {}
        out.append({**_job_brief(b), "missed_reason": reason, "eta_min": det.get("eta_min"),
                    "distance_km": det.get("distance_km"), "created_at": b.get("created_at"),
                    "wave": int(b.get("dispatch_wave") or 0)})
    return out


# ── Admin: ring ONE partner again with the REAL job (from Live Dispatch Feed)
async def admin_ring_partner(booking_id, partner_id, admin=None):
    b = await _get_booking(booking_id)
    if b.get("status") != "searching":
        raise HTTPException(status_code=400, detail=f"Booking is already {b.get('status')} — nothing to ring")
    p = await db.users.find_one({"id": partner_id, "role": "partner"}, {"_id": 0, "id": 1, "name": 1, "partner_status": 1, "kyc_status": 1})
    if not p:
        raise HTTPException(status_code=404, detail="Partner not found")
    await db.bookings.update_one(
        {"id": booking_id},
        {"$addToSet": {"eligible_partner_ids": partner_id},
         "$pull": {"offered_partner_ids": partner_id, "rejected_partner_ids": partner_id}})
    b = await _get_booking(booking_id)
    # supersede this partner's older pending row so only the fresh ring counts
    await db.booking_dispatches.update_many(
        {"booking_id": booking_id, "partner_id": partner_id, "response": "pending"},
        {"$set": {"response": "timeout", "response_at": now_iso()}})
    sent = await _offer_partners(b, [partner_id], "admin_ring")
    row = await db.booking_dispatches.find_one({"booking_id": booking_id, "partner_id": partner_id}, {"_id": 0}, sort=[("dispatched_at", -1)])
    return {"ok": bool(sent), "booking": {"id": b["id"], "code": b.get("code"), "service_name": b.get("service_name"), "status": b.get("status")},
            "partner": p, "push": {k: row.get(k) for k in ("push_success", "push_failure", "push_skipped")} if row else {}}
