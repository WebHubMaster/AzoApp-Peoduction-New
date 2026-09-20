"""Idempotent seed: settings, admin, demo customer/partner/merchant, categories, services, coupon."""
import re
from datetime import datetime, timezone
from config.database import db, now_iso, DEFAULT_SETTINGS
from models.user import build_user, new_id


def slugify(text: str) -> str:
    """Generate URL-friendly slug from text."""
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return s or new_id()[:8]

CATEGORIES = [
    {"name": "AC Repair & Service", "icon": "air-vent", "required_skill": "ac",
     "image": "https://images.pexels.com/photos/6471913/pexels-photo-6471913.jpeg"},
    {"name": "Electrician", "icon": "zap", "required_skill": "electrical",
     "image": "https://images.pexels.com/photos/17063686/pexels-photo-17063686.jpeg"},
    {"name": "Home Cleaning", "icon": "sparkles", "required_skill": "cleaning",
     "image": "https://images.pexels.com/photos/6195274/pexels-photo-6195274.jpeg"},
    {"name": "Plumbing", "icon": "droplet", "required_skill": "plumbing",
     "image": "https://images.pexels.com/photos/6419128/pexels-photo-6419128.jpeg"},
    {"name": "Appliance Repair", "icon": "washing-machine", "required_skill": "appliance",
     "image": "https://images.pexels.com/photos/38190070/pexels-photo-38190070.jpeg"},
    {"name": "Carpentry", "icon": "hammer", "required_skill": "carpentry",
     "image": "https://images.pexels.com/photos/1094767/pexels-photo-1094767.jpeg"},
]

SERVICES = {
    "AC Repair & Service": [
        ("AC Service (Split)", 499, 60, [("Gas Check", 99), ("Deep Cleaning", 199), ("Anti-Rust Coating", 149)]),
        ("AC Installation", 1299, 120, [("Extra Piping", 350), ("Stabilizer Setup", 249), ("Wall Drilling", 199)]),
        ("AC Gas Refill", 2499, 90, [("Leak Sealing", 399), ("Filter Replacement", 199)]),
    ],
    "Electrician": [
        ("Fan Installation", 299, 45, [("Extra Wiring", 149), ("Regulator Replace", 129)]),
        ("Switchboard Repair", 249, 40, [("Socket Add-on", 99), ("MCB Replace", 199)]),
        ("Wiring & Fitting", 599, 90, [("MCB Replace", 199), ("Concealed Wiring (per point)", 249)]),
    ],
    "Home Cleaning": [
        ("Full Home Deep Clean", 1999, 240, [("Sofa Cleaning", 499), ("Fridge Cleaning", 199), ("Balcony Cleaning", 249)]),
        ("Bathroom Cleaning", 399, 60, [("Grout Whitening", 199), ("Exhaust Fan Clean", 99)]),
        ("Kitchen Cleaning", 699, 90, [("Chimney Cleaning", 299), ("Fridge Cleaning", 199)]),
    ],
    "Plumbing": [
        ("Tap & Mixer Repair", 199, 30, [("Washer Replacement", 79), ("New Tap Install", 149)]),
        ("Blockage Removal", 449, 60, [("Machine Cleaning", 299), ("Drain Pipe Flush", 199)]),
    ],
    "Appliance Repair": [
        ("Washing Machine Repair", 399, 60, [("Drain Cleaning", 199), ("Inlet Valve Replace", 299)]),
        ("Refrigerator Repair", 449, 60, [("Gas Charging", 1899), ("Thermostat Replace", 349)]),
    ],
    "Carpentry": [
        ("Furniture Repair", 349, 60, [("Hinge Replacement", 99), ("Polish Touch-up", 199)]),
        ("Door Repair", 299, 45, [("Lock Replacement", 249), ("Handle Fitting", 129)]),
    ],
}


async def seed():
    # settings
    if not await db.settings.find_one({"id": "global"}):
        await db.settings.insert_one(dict(DEFAULT_SETTINGS))

    # admin (platform owner)
    if not await db.users.find_one({"role": "admin"}):
        admin = build_user("+919000000000", "admin", "AzoApp Admin", is_demo=True, email="nodewaptechnology@gmail.com")
        await db.users.insert_one(dict(admin))

    # demo merchant
    merchant = await db.users.find_one({"phone": "+919000000002", "role": "merchant"}, {"_id": 0})
    if not merchant:
        merchant = build_user("+919000000002", "merchant", "Sharma Electricals", is_demo=True,
                              shop_name="Sharma Electricals", shop_type="Electrical")
        merchant["kyc_status"] = "approved"
        await db.users.insert_one(dict(merchant))
        merchant.pop("_id", None)

    # demo partner (referred by merchant → lifetime commission)
    if not await db.users.find_one({"phone": "+919000000003", "role": "partner"}):
        partner = build_user("+919000000003", "partner", "Raj Kumar", is_demo=True,
                             skills=["ac", "electrical", "appliance"],
                             service_pincodes=["800001"], referred_by_merchant=merchant["id"])
        partner["kyc_status"] = "approved"
        partner["partner_status"] = "online"
        partner["city"] = "Patna"
        partner["state"] = "Bihar"
        partner["jobs_completed"] = 42
        partner["rating"] = 4.8
        await db.users.insert_one(dict(partner))
        await db.merchant_partner_referrals.insert_one({
            "id": new_id(), "merchant_id": merchant["id"], "merchant_name": merchant["name"],
            "partner_phone": "+919000000003", "partner_name": "Raj Kumar",
            "status": "active", "lifetime": True, "total_jobs": 42, "total_commission": 0.0,
            "created_at": now_iso(),
        })

    # second independent partner
    if not await db.users.find_one({"phone": "+919000000005", "role": "partner"}):
        p2 = build_user("+919000000005", "partner", "Amit Singh", is_demo=True,
                        skills=["ac", "cleaning", "plumbing"], service_pincodes=["800001"])
        p2["kyc_status"] = "approved"
        p2["partner_status"] = "online"
        p2["city"] = "Patna"
        p2["state"] = "Bihar"
        p2["jobs_completed"] = 18
        await db.users.insert_one(dict(p2))

    # additional city-based demo partners so the Area Partner matrix is meaningful
    # (city-wise × category-wise breakdown, e.g. Patna / Gaya).
    _area_demo = [
        ("+919000000011", "Suresh Yadav", "Patna", ["electrical"], "approved", "online", 27, 4.6),
        ("+919000000012", "Vikash Kumar", "Patna", ["plumbing"], "approved", "offline", 15, 4.4),
        ("+919000000013", "Manoj Prasad", "Gaya", ["ac", "electrical", "appliance"], "approved", "online", 33, 4.7),
        ("+919000000014", "Ramesh Sahni", "Gaya", ["ac"], "pending", "offline", 0, 5.0),
        ("+919000000015", "Sunil Das", "Gaya", ["cleaning"], "approved", "offline", 9, 4.2),
        ("+919000000016", "Deepak Singh", "Patna", ["carpentry"], "approved", "online", 21, 4.5),
        # Different-area partner (Ranchi, pincode 834001): must NOT appear in the
        # admin "Assign partner" list for a Patna/800001 booking (area gate demo).
        ("+919000000017", "Rakesh Mahto", "Ranchi", ["ac", "electrical"], "approved", "online", 19, 4.6),
        # Neighbouring-pincode partner (Patna 800002, ~3 km from the demo customer): must
        # appear in the admin "Nearby" section, not in the same-area list, for 800001 bookings.
        ("+919000000018", "Pankaj Sinha", "Patna", ["ac", "appliance"], "approved", "online", 24, 4.7),
    ]
    _pin_map = {"+919000000017": (["834001"], "Jharkhand", {"lat": 23.3441, "lng": 85.3096}),
                "+919000000018": (["800002"], "Bihar", {"lat": 25.6250, "lng": 85.1180})}
    for _ph, _nm, _city, _skills, _kyc, _pstat, _jobs, _rt in _area_demo:
        if not await db.users.find_one({"phone": _ph, "role": "partner"}):
            _pins, _state, _loc = _pin_map.get(_ph, (["800001"], "Bihar", None))
            _p = build_user(_ph, "partner", _nm, is_demo=True,
                            skills=_skills, service_pincodes=_pins)
            _p["kyc_status"] = _kyc
            _p["partner_status"] = _pstat
            _p["city"] = _city
            _p["state"] = _state
            if _loc:
                _p["live_location"] = _loc
            _p["jobs_completed"] = _jobs
            _p["rating"] = _rt
            await db.users.insert_one(dict(_p))

    # Mark a few demo partners as AzoApp Pro (premium_partner) so the admin
    # "Pro Partner" directory has data even without a live Starter-Kit purchase.
    # Idempotent — only sets the flag when it isn't already present.
    _pro_phones = ["+919000000003", "+919000000018", "+919000000013"]
    for _pp in _pro_phones:
        _u = await db.users.find_one({"phone": _pp, "role": "partner"}, {"_id": 0, "premium_partner": 1})
        if _u is not None and not _u.get("premium_partner"):
            await db.users.update_one({"phone": _pp, "role": "partner"}, {"$set": {
                "premium_partner": True,
                "partner_badge": "AzoApp Pro",
                "pro_since": now_iso(),
                "starter_kit": {"status": "paid", "tracking_status": "delivered", "amount": 999,
                                "purchased_at": now_iso()},
            }})


    # Demo live GPS locations for online partners (scattered around Patna) so the
    # Live Partner Map shows multiple markers once a Google Maps key is added.
    _patna_pts = [
        {"lat": 25.5941, "lng": 85.1376}, {"lat": 25.6100, "lng": 85.1440},
        {"lat": 25.5800, "lng": 85.1200}, {"lat": 25.6000, "lng": 85.1600},
        {"lat": 25.5700, "lng": 85.1000}, {"lat": 25.6200, "lng": 85.1300},
        {"lat": 25.5850, "lng": 85.1550}, {"lat": 25.6050, "lng": 85.1100},
    ]
    _online = await db.users.find({"role": "partner", "partner_status": "online"}).to_list(50)
    for _i, _op in enumerate(_online):
        if not _op.get("live_location"):
            await db.users.update_one({"id": _op["id"]}, {"$set": {
                "live_location": _patna_pts[_i % len(_patna_pts)],
                "live_location_at": now_iso(),
            }})

    # demo customer
    if not await db.users.find_one({"phone": "+919000000004", "role": "customer"}):
        cust = build_user("+919000000004", "customer", "Priya Verma", is_demo=True)
        cust["addresses"] = [{"id": new_id(), "label": "Home", "line": "12 MG Road", "pincode": "800001",
                              "city": "Patna", "property_type": "Apartment", "floor": "3", "landmark": "Near Park"}]
        await db.users.insert_one(dict(cust))

    # categories + services
    if await db.categories.count_documents({}) == 0:
        for c in CATEGORIES:
            cat = {"id": new_id(), "name": c["name"], "slug": slugify(c["name"]), "icon": c["icon"], "image": c["image"],
                   "required_skill": c["required_skill"], "description": f"Professional {c['name']} at your doorstep.",
                   "status": "active", "created_at": now_iso()}
            await db.categories.insert_one(dict(cat))
            for (sname, price, dur, addons) in SERVICES.get(c["name"], []):
                await db.services.insert_one({
                    "id": new_id(), "category_id": cat["id"], "category_name": c["name"],
                    "name": sname, "description": f"{sname} by verified AzoApp experts.",
                    "image": c["image"], "base_price": price, "price_type": "fixed",
                    "duration_min": dur, "required_skill": c["required_skill"],
                    "addons": [{"name": a[0], "price": a[1]} for a in addons],
                    "status": "active", "rating": 4.8, "created_at": now_iso(),
                })

    if not await db.coupons.find_one({"code": "AZO50"}):
        await db.coupons.insert_one({
            "id": new_id(), "code": "AZO50", "discount_type": "percentage", "discount_value": 50,
            "min_order": 199, "max_discount": 150, "usage_limit": 1000, "used": 0,
            "title": "Flat 50% OFF", "description": "New user special on your first booking",
            "status": "active", "created_at": now_iso(),
        })
    for extra in [
        {"code": "SAVE100", "discount_type": "flat", "discount_value": 100, "min_order": 499,
         "max_discount": 100, "usage_limit": 5000, "used": 0, "title": "\u20b9100 OFF",
         "description": "On orders above \u20b9499"},
        {"code": "MONSOON20", "discount_type": "percentage", "discount_value": 20, "min_order": 299,
         "max_discount": 200, "usage_limit": 5000, "used": 0, "title": "Monsoon 20% OFF",
         "description": "Limited period seasonal deal"},
    ]:
        if not await db.coupons.find_one({"code": extra["code"]}):
            await db.coupons.insert_one({"id": new_id(), "status": "active",
                                         "created_at": now_iso(), **extra})

    # --- promotional offer cards (creative homepage offers, admin-controllable) ---
    if await db.offers.count_documents({}) == 0:
        _offers = [
            {"title": "First Booking? Get 50% OFF", "subtitle": "NEW USER OFFER",
             "description": "Use code AZO50 and save big on your very first home service.",
             "discount_label": "50% OFF", "coupon_code": "AZO50", "cta_text": "Grab Offer",
             "link": "/services", "bg_color": "#4f46e5", "order": 1, "status": "active",
             "image": "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800"},
            {"title": "Save \u20b9100 on Deep Cleaning", "subtitle": "LIMITED TIME",
             "description": "Sparkling homes for less. Apply SAVE100 at checkout.",
             "discount_label": "\u20b9100 OFF", "coupon_code": "SAVE100", "cta_text": "Book Now",
             "link": "/services", "bg_color": "#0ea5e9", "order": 2, "status": "active",
             "image": "https://images.unsplash.com/photo-1628177142898-93e36e4e3a50?w=800"},
            {"title": "Monsoon Special \u2014 20% OFF", "subtitle": "SEASONAL",
             "description": "Get your appliances serviced before the rains. Code MONSOON20.",
             "discount_label": "20% OFF", "coupon_code": "MONSOON20", "cta_text": "Explore",
             "link": "/services", "bg_color": "#059669", "order": 3, "status": "active",
             "image": "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=800"},
        ]
        for o in _offers:
            await db.offers.insert_one({"id": new_id(), "created_at": now_iso(), **o})

    # --- homepage sections (dynamic, admin-controllable) ---
    if await db.homepage_sections.count_documents({}) == 0:
        for i, sec in enumerate([
            {"type": "hero_banner", "title": "", "subtitle": "", "enabled": True, "config": {}},
            {"type": "popular_categories", "title": "What do you need today?", "subtitle": "CATEGORIES",
             "enabled": True, "config": {"limit": 8}},
            {"type": "featured_services", "title": "Featured services", "subtitle": "HANDPICKED",
             "enabled": True, "config": {"limit": 8}},
            {"type": "trending_services", "title": "Trending near you", "subtitle": "POPULAR",
             "enabled": True, "config": {"limit": 8}},
            {"type": "coupons", "title": "Offers for you", "subtitle": "SAVE MORE", "enabled": True, "config": {"limit": 6}},
            {"type": "faq", "title": "Frequently asked questions", "subtitle": "HELP", "enabled": True, "config": {"limit": 6}},
            {"type": "blog", "title": "Latest from our blog", "subtitle": "INSIGHTS", "enabled": True, "config": {"limit": 3}},
        ]):
            await db.homepage_sections.insert_one({"id": new_id(), "order": i, "created_at": now_iso(), **sec})

    # tiered packs demo (Urban-Company style) on one AC service
    if await db.services.count_documents({"tiers.0": {"$exists": True}}) == 0:
        ac = await db.services.find_one({"$or": [{"name": {"$regex": "AC", "$options": "i"}},
                                                 {"category_name": {"$regex": "AC", "$options": "i"}}]}, {"_id": 0})
        if ac:
            aci = "https://images.pexels.com/photos/6474471/pexels-photo-6474471.jpeg"
            await db.services.update_one({"id": ac["id"]}, {"$set": {"tiers": [
                {"label": "1 AC", "qty": 1, "price": 599, "original_price": 599, "badge": "", "image": aci, "rating": 4.72, "review_count": 210000, "description": "Foam-jet deep clean"},
                {"label": "2 ACs", "qty": 2, "price": 1098, "original_price": 1198, "badge": "Bestseller", "image": aci, "rating": 4.75, "review_count": 2900000, "description": "Save 8% · 2 units"},
                {"label": "3 ACs", "qty": 3, "price": 1497, "original_price": 1797, "badge": "", "image": aci, "rating": 4.74, "review_count": 540000, "description": "Save 17% · 3 units"},
                {"label": "4 ACs", "qty": 4, "price": 1796, "original_price": 2396, "badge": "", "image": aci, "rating": 4.73, "review_count": 120000, "description": "Save 25% · 4 units"},
            ]}})

    # Enrich AC service with highlights + review_count for rich snippets (idempotent)
    ac2 = await db.services.find_one({"name": {"$regex": "AC", "$options": "i"}, "highlights": {"$exists": False}}, {"_id": 0})
    if ac2:
        await db.services.update_one({"id": ac2["id"]}, {"$set": {
            "rating": 4.75, "review_count": 2900000,
            "highlights": [
                "Highly rated by customers for better cooling & sanitisation",
                "Foam-jet technology deep cleans AC coils",
                "Verified & trained professionals",
                "30-day service warranty",
            ]}})

    # mark a few services featured/trending so homepage isn't empty (idempotent, only first run)
    if await db.services.count_documents({"is_featured": True}) == 0:
        feat = await db.services.find({}, {"_id": 0, "id": 1}).limit(6).to_list(6)
        for idx, s in enumerate(feat):
            await db.services.update_one({"id": s["id"]}, {"$set": {
                "is_featured": idx < 4, "is_trending": idx >= 2, "show_on_home": True,
                "approval_status": "approved", "at_doorstep": True, "cancelable": True,
                "max_qty": 5, "members_required": 1, "discounted_price": 0, "tax_inclusive": False,
            }})

    # --- idempotent maintenance (runs every startup) ---
    APPLIANCE_IMG = "https://images.pexels.com/photos/38190070/pexels-photo-38190070.jpeg"
    await db.categories.update_one({"name": "Appliance Repair"}, {"$set": {"image": APPLIANCE_IMG}})
    acat = await db.categories.find_one({"name": "Appliance Repair"}, {"_id": 0, "id": 1})
    if acat:
        await db.services.update_many({"category_id": acat["id"]}, {"$set": {"image": APPLIANCE_IMG}})
    
    # Populate slugs for existing categories that don't have them
    categories_without_slug = await db.categories.find({"$or": [{"slug": {"$exists": False}}, {"slug": None}, {"slug": ""}]}, {"_id": 0}).to_list(1000)
    for cat in categories_without_slug:
        await db.categories.update_one({"id": cat["id"]}, {"$set": {"slug": slugify(cat["name"])}})
    for ph in ["+919000000000", "+919000000002", "+919000000003", "+919000000004"]:
        await db.users.update_one({"phone": ph}, {"$set": {"is_demo": True}})
    s = await db.settings.find_one({"id": "global"})
    if s is not None and "demo_mode" not in s:
        await db.settings.update_one({"id": "global"}, {"$set": {"demo_mode": True, "demo_otp": "123456"}})
    if s is not None and "auth_config" not in s:
        await db.settings.update_one({"id": "global"}, {"$set": {
            "auth_config": DEFAULT_SETTINGS["auth_config"], "profile_fields": DEFAULT_SETTINGS["profile_fields"]}})
    # security cleanup: only the seeded admin phone may hold the admin role
    await db.users.delete_many({"role": "admin", "phone": {"$ne": "+919000000000"}})

    # --- Add-ons backfill + Rate cards (idempotent, every startup) ---
    try:
        from data.rate_card_seed import RATE_CARDS, ADDON_BACKFILL, GENERIC_ADDONS_BY_CATEGORY, CATALOG_ADDONS

        # 0) Seed the reusable Add-on LIBRARY (db.catalog_addons) per category.
        #    This is the source of truth for the admin "Add-on Services" page and
        #    for customer-facing "Frequently Added / Add-ons". Idempotent by (category, name).
        for _c in await db.categories.find({}, {"_id": 0, "id": 1, "name": 1, "slug": 1}).to_list(1000):
            slug = _c.get("slug") or slugify(_c.get("name", ""))
            for (nm, price, desc) in CATALOG_ADDONS.get(slug, []):
                exists = await db.catalog_addons.find_one(
                    {"category_id": _c["id"], "name": {"$regex": f"^{re.escape(nm)}$", "$options": "i"}},
                    {"_id": 0, "id": 1},
                )
                if exists:
                    continue
                await db.catalog_addons.insert_one({
                    "id": new_id(),
                    "name": nm,
                    "price": float(price),
                    "category_id": _c["id"],
                    "category_name": _c.get("name", ""),
                    "description": desc,
                    "status": "active",
                    "created_at": now_iso(),
                })

        # 1) Ensure EVERY service has at least one add-on service.
        cat_slug_by_id = {}
        for _c in await db.categories.find({}, {"_id": 0, "id": 1, "slug": 1, "name": 1}).to_list(1000):
            cat_slug_by_id[_c["id"]] = _c.get("slug") or slugify(_c.get("name", ""))
        svcs_no_addons = await db.services.find(
            {"$or": [{"addons": {"$exists": False}}, {"addons": {"$size": 0}}, {"addons": None}]},
            {"_id": 0, "id": 1, "name": 1, "category_id": 1},
        ).to_list(2000)
        for _s in svcs_no_addons:
            pairs = ADDON_BACKFILL.get(_s.get("name"))
            if not pairs:
                pairs = GENERIC_ADDONS_BY_CATEGORY.get(cat_slug_by_id.get(_s.get("category_id"), ""), [])
            if pairs:
                await db.services.update_one(
                    {"id": _s["id"]},
                    {"$set": {"addons": [{"name": a[0], "price": float(a[1])} for a in pairs]}},
                )

        # 2) Seed a Standard rate card for every category that has none.
        for _c in await db.categories.find({}, {"_id": 0, "id": 1, "name": 1, "slug": 1}).to_list(1000):
            slug = _c.get("slug") or slugify(_c.get("name", ""))
            spec = RATE_CARDS.get(slug)
            if not spec:
                continue
            if await db.rate_cards.find_one({"category_id": _c["id"]}, {"_id": 0, "id": 1}):
                continue

            def _norm_rows(rows):
                return [{
                    "id": new_id(),
                    "description": r.get("description", ""),
                    "service_charge": str(r.get("service_charge", "")),
                    "labour_charge": str(r.get("labour_charge", "")),
                    "original_charge": str(r.get("original_charge", "")),
                    "warranty": r.get("warranty", ""),
                    "note": r.get("note", ""),
                    "discount_pct": float(r.get("discount_pct", 0) or 0),
                    "discount_until": "",
                    "order": j,
                } for j, r in enumerate(rows)]

            groups = [{
                "id": new_id(),
                "name": g.get("name", ""),
                "note": g.get("note", ""),
                "order": i,
                "rows": _norm_rows(g.get("rows", [])),
            } for i, g in enumerate(spec.get("groups", []))]
            await db.rate_cards.insert_one({
                "id": new_id(),
                "category_id": _c["id"],
                "category_name": _c.get("name", ""),
                "title": "Standard rate card",
                "subtitle": spec.get("subtitle", ""),
                "brand_label": "AzoCover",
                "intro": spec.get("intro", ""),
                "footer_note": spec.get("footer_note", ""),
                "accent_color": spec.get("accent_color", "#0D47A1"),
                "status": "active",
                "groups": groups,
                "created_at": now_iso(),
                "updated_at": now_iso(),
            })
    except Exception as _e:  # never block startup on sample-data seeding
        print("rate-card/addon seed skipped:", _e)


    # --- Phase 3-5 module sample data (idempotent) ---
    async def _seed(coll, docs):
        if await db[coll].count_documents({}) == 0:
            for d in docs:
                await db[coll].insert_one({"id": new_id(), "created_at": now_iso(), **d})
    await _seed("locations", [
        {"name": "Patna", "state": "Bihar", "pincode": "800001", "status": "active"},
        {"name": "Ranchi", "state": "Jharkhand", "pincode": "834001", "status": "active"},
        {"name": "Jamshedpur", "state": "Jharkhand", "pincode": "831001", "status": "active"}])
    await _seed("memberships", [
        {"name": "Silver", "price": 499, "benefits": "5% off, priority support", "status": "active"},
        {"name": "Gold", "price": 999, "benefits": "10% off, free visits", "status": "active"},
        {"name": "Platinum", "price": 1999, "benefits": "15% off, dedicated manager", "status": "active"}])
    await _seed("loyalty", [
        {"name": "Booking Points", "points": 10, "action": "per booking"},
        {"name": "Referral Points", "points": 50, "action": "per referral"}])
    await _seed("vendors", [
        {"name": "CoolParts Distributors", "gst": "10ABCDE1234F1Z5", "category": "AC Spares", "status": "active"}])
    await _seed("spare_parts", [
        {"name": "AC Capacitor 25uF", "sku": "CAP-25", "cost_price": 250, "selling_price": 450, "stock": 40},
        {"name": "Ceiling Fan Regulator", "sku": "FAN-REG", "cost_price": 90, "selling_price": 180, "stock": 60}])
    await _seed("feature_flags", [
        {"name": "ai_assistant", "enabled": "true"},
        {"name": "partner_bidding", "enabled": "false"},
        {"name": "wallet", "enabled": "true"}])

    # ---- dummy withdrawal requests (for advanced list + pagination demo) ----
    if await db.partner_withdrawals.count_documents({}) < 5:
        import random as _rnd
        from datetime import timedelta as _td
        prts = await db.users.find({"role": "partner"}, {"_id": 0, "id": 1, "name": 1}).to_list(20)
        if prts:
            _st = ["pending", "completed", "rejected"]
            for i in range(26):
                p = prts[i % len(prts)]
                amt = _rnd.choice([500, 750, 1000, 1500, 2000, 2500, 3200, 4200])
                fee = round(amt * 0.02, 2)
                method = "upi" if i % 2 == 0 else "bank"
                st = "pending" if i < 6 else _st[i % 3]
                dt = (datetime.now(timezone.utc) - _td(days=i)).isoformat()
                fn = (p.get("name") or "partner").split(" ")[0].lower()
                doc = {"id": new_id(), "partner_id": p["id"], "partner_name": p.get("name", "Partner"),
                       "amount": amt, "fee": fee, "net_amount": round(amt - fee, 2), "method": method,
                       "status": st, "requested_at": dt, "created_at": dt}
                if method == "upi":
                    doc["upi_id"] = f"{fn}@okhdfc"
                else:
                    doc["bank"] = {"bank_name": "HDFC Bank", "account_number": f"5010{100000 + i}", "ifsc": "HDFC0001234"}
                if st == "completed":
                    doc["payout"] = {"payout_id": f"pout_DEMO{i:04d}", "simulated": True, "utr": f"UTR{300000 + i}"}
                if st == "rejected":
                    doc["reason"] = "Bank details mismatch"
                await db.partner_withdrawals.insert_one(doc)

    # ---- dummy commission ledger (Transactions screen + pagination demo) ----
    if await db.commission_ledger.count_documents({}) < 5:
        import random as _rnd2
        from datetime import timedelta as _td2
        for i in range(32):
            gross = _rnd2.choice([399, 599, 799, 1199, 1499, 1999, 2499])
            partner = round(gross * 0.75, 2)
            platform = round(gross * 0.20, 2)
            merchant = round(gross * 0.05, 2)
            dt = (datetime.now(timezone.utc) - _td2(days=i, hours=i)).isoformat()
            await db.commission_ledger.insert_one({
                "id": new_id(), "booking_code": f"AZO{10240 + i}", "gross": gross,
                "partner_earning": partner, "platform_earning": platform,
                "merchant_referral": merchant, "created_at": dt})

    # ---- some withdrawals with a FAILED payout (for the Retry Payout demo) ----
    if await db.partner_withdrawals.count_documents({"payout.status": "failed"}) == 0:
        fails = await db.partner_withdrawals.find({"status": "pending"}, {"_id": 0, "id": 1}).limit(3).to_list(3)
        for j, fw in enumerate(fails):
            await db.partner_withdrawals.update_one({"id": fw["id"]}, {"$set": {
                "status": "failed",
                "payout": {"payout_id": f"pout_FAIL{j:03d}", "simulated": True, "status": "failed",
                           "failure_reason": ["Beneficiary bank rejected", "Invalid IFSC", "Account frozen"][j % 3]},
                "processed_at": now_iso()}})

    # ---- customer booking-payment transactions (advanced Transactions screen) ----
    if await db.payment_transactions.count_documents({}) < 5:
        import random as _r3
        from datetime import timedelta as _td3
        custs = await db.users.find({"role": "customer"}, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(30)
        if not custs:
            custs = [{"id": new_id(), "name": "Demo Customer", "phone": "+9198" + str(10000000 + 1)}]
        svcs = ["AC Service & Repair", "Deep Home Cleaning", "Bathroom Cleaning", "Sofa Cleaning",
                "Plumbing Visit", "Electrician Visit", "Salon for Women", "Men's Grooming",
                "Pest Control", "Kitchen Cleaning", "Geyser Repair", "RO Service"]
        cats = {"AC Service & Repair": "Appliance", "Geyser Repair": "Appliance", "RO Service": "Appliance",
                "Deep Home Cleaning": "Cleaning", "Bathroom Cleaning": "Cleaning", "Sofa Cleaning": "Cleaning",
                "Kitchen Cleaning": "Cleaning", "Plumbing Visit": "Home Repair", "Electrician Visit": "Home Repair",
                "Salon for Women": "Beauty", "Men's Grooming": "Beauty", "Pest Control": "Home Repair"}
        methods = ["upi", "upi", "upi", "card", "netbanking", "wallet", "cod"]
        m_label = {"upi": "UPI", "card": "Credit/Debit Card", "netbanking": "Net Banking", "wallet": "AzoApp Wallet", "cod": "Cash on Delivery"}
        fail_reasons = ["Insufficient funds", "Card declined by issuing bank", "UPI PIN entered incorrectly",
                        "Payment cancelled by user on gateway", "Bank OTP not entered in time",
                        "Payment gateway timeout", "Daily transaction limit exceeded"]
        # weighted status pool
        statuses = (["success"] * 12) + (["failed"] * 5) + (["pending"] * 2) + (["refunded"] * 2)
        for i in range(40):
            c = _r3.choice(custs)
            svc = _r3.choice(svcs)
            method = _r3.choice(methods)
            st = statuses[i % len(statuses)]
            amount = _r3.choice([299, 399, 499, 599, 799, 999, 1199, 1499, 1999, 2499, 3199])
            tax = round(amount * 0.18 / 1.18, 2)
            visiting = _r3.choice([0, 0, 49, 99])
            discount = _r3.choice([0, 0, 50, 100, 150])
            total = amount + visiting - discount
            dt = datetime.now(timezone.utc) - _td3(days=i, hours=_r3.randint(0, 20), minutes=_r3.randint(0, 59))
            ref = f"TXN-AZO-{50100 + i}"
            gpid = f"pay_{new_id()[:14]}"
            goid = f"order_{new_id()[:14]}"
            order_created = st in ("success", "refunded")
            code = f"AZO{20500 + i}" if order_created else None
            tl = [{"at": dt.isoformat(), "label": "Payment initiated"}]
            reason = None
            if method != "cod":
                tl.append({"at": (dt + _td3(seconds=8)).isoformat(), "label": f"Redirected to {m_label[method]} gateway"})
            if st == "success":
                tl += [{"at": (dt + _td3(seconds=25)).isoformat(), "label": "Payment authorised"},
                       {"at": (dt + _td3(seconds=27)).isoformat(), "label": "Payment captured"},
                       {"at": (dt + _td3(seconds=30)).isoformat(), "label": f"Order {code} created"}]
            elif st == "failed":
                reason = _r3.choice(fail_reasons)
                tl += [{"at": (dt + _td3(seconds=22)).isoformat(), "label": f"Payment failed — {reason}"},
                       {"at": (dt + _td3(seconds=23)).isoformat(), "label": "Order NOT created (payment not captured)"}]
            elif st == "pending":
                tl.append({"at": (dt + _td3(seconds=20)).isoformat(), "label": "Awaiting bank confirmation"})
            elif st == "refunded":
                tl += [{"at": (dt + _td3(seconds=27)).isoformat(), "label": "Payment captured"},
                       {"at": (dt + _td3(seconds=30)).isoformat(), "label": f"Order {code} created"},
                       {"at": (dt + _td3(hours=6)).isoformat(), "label": "Refund initiated (order cancelled)"},
                       {"at": (dt + _td3(days=2)).isoformat(), "label": "Refund completed"}]
            doc = {
                "id": new_id(), "txn_ref": ref, "customer_id": c["id"], "customer_name": c.get("name"),
                "customer_phone": c.get("phone"), "service_name": svc, "category": cats.get(svc, "Service"),
                "amount": total, "method": method, "method_label": m_label[method], "status": st,
                "gateway": "cod_manual" if method == "cod" else "razorpay",
                "gateway_payment_id": None if (st == "pending" or method == "cod") else gpid,
                "gateway_order_id": goid, "order_created": order_created, "booking_code": code,
                "failure_reason": reason, "invoice": {
                    "lines": [{"label": svc, "amount": amount}]
                    + ([{"label": "Visiting charge", "amount": visiting}] if visiting else [])
                    + ([{"label": "Discount", "amount": -discount}] if discount else []),
                    "subtotal": round(amount - tax, 2), "tax": tax, "visiting": visiting,
                    "discount": discount, "total": total},
                "timeline": tl, "created_at": dt.isoformat(),
                "updated_at": (dt + _td3(days=2)).isoformat() if st == "refunded" else dt.isoformat()}
            await db.payment_transactions.insert_one(doc)

    # ---- cancellations & refunds (advanced Refunds screen) ----
    if await db.refunds.count_documents({}) < 5:
        import random as _r4
        from datetime import timedelta as _td4
        rcusts = await db.users.find({"role": "customer"}, {"_id": 0, "name": 1, "phone": 1}).to_list(30)
        rprts = await db.users.find({"role": "partner"}, {"_id": 0, "name": 1}).to_list(20)
        rsvcs = ["AC Service & Repair", "Deep Home Cleaning", "Bathroom Cleaning", "Plumbing Visit",
                 "Electrician Visit", "Salon for Women", "Pest Control", "Geyser Repair"]
        r_reasons = {
            "customer": ["Changed my mind", "Found a cheaper option", "Booked by mistake", "Rescheduling later",
                         "Partner was late", "No longer need the service"],
            "partner": ["Partner unavailable", "Out of service area", "Tool/parts unavailable"],
            "admin": ["Duplicate booking", "Fraud check", "Service not deliverable"],
        }
        r_status = (["processed"] * 14) + (["initiated"] * 6) + (["failed"] * 4)
        for i in range(24):
            cust = _r4.choice(rcusts) if rcusts else {"name": "Customer", "phone": "+910000000000"}
            prt = _r4.choice(rprts) if rprts else {"name": "Partner"}
            svc = _r4.choice(rsvcs)
            who = _r4.choice(["customer", "customer", "customer", "partner", "admin"])
            st = r_status[i % len(r_status)]
            original = _r4.choice([499, 799, 999, 1299, 1799, 2499])
            tax = round(original * 0.18 / 1.18, 2)
            # refund policy: customer cancel -> partial; partner/admin cancel -> full
            refund_pct = _r4.choice([100, 100, 75, 50]) if who == "customer" else 100
            partner_pct = 100 - refund_pct
            refund_amount = round(original * refund_pct / 100, 2)
            partner_cancel_amt = round(original * partner_pct / 100 * 0.7, 2)
            platform_comm = round(original * partner_pct / 100 * 0.3, 2)
            cdt = datetime.now(timezone.utc) - _td4(days=i, hours=_r4.randint(0, 12))
            code = f"AZO{21000 + i}"
            tl = [{"at": cdt.isoformat(), "label": f"Booking cancelled by {who}"}]
            if st in ("initiated", "processed", "failed"):
                tl.append({"at": (cdt + _td4(minutes=5)).isoformat(), "label": f"Refund of {refund_amount} initiated to {'wallet' if who != 'customer' else 'source'}"})
            if st == "processed":
                tl.append({"at": (cdt + _td4(days=2)).isoformat(), "label": "Refund completed"})
            if st == "failed":
                tl.append({"at": (cdt + _td4(hours=6)).isoformat(), "label": "Refund failed — gateway error", "fail": True})
            await db.refunds.insert_one({
                "id": new_id(), "booking_id": new_id(), "booking_code": code,
                "customer_name": cust.get("name"), "customer_phone": cust.get("phone"),
                "partner_name": prt.get("name"), "service_name": svc,
                "original_amount": original, "service_cost": round(original - tax, 2), "tax_amount": tax,
                "refund_pct": refund_pct, "partner_cancellation_pct": partner_pct,
                "refund_amount": refund_amount, "amount": refund_amount,
                "partner_cancellation_amount": partner_cancel_amt, "platform_commission": platform_comm,
                "method": "source" if who == "customer" else "wallet", "status": st,
                "cancelled_by": who, "cancellation_reason": _r4.choice(r_reasons[who]),
                "razorpay_payment_id": f"pay_{new_id()[:14]}",
                "razorpay_refund_id": f"rfnd_{new_id()[:14]}" if st != "failed" else None,
                "timeline": tl, "cancelled_at": cdt.isoformat(),
                "initiated_at": (cdt + _td4(minutes=5)).isoformat() if st != "pending" else None,
                "completed_at": (cdt + _td4(days=2)).isoformat() if st == "processed" else None,
                "webhook_response": st == "processed", "created_at": cdt.isoformat()})


    await _seed("campaigns", [
        {"name": "Monsoon AC Push", "channel": "whatsapp", "audience": "customer", "status": "active"}])
    await _seed("pricing_rules", [
        {"name": "Patna Peak Surge", "scope": "city", "match_value": "Patna", "service_category": "",
         "surge_type": "percentage", "surge_value": 15, "status": "active"}])

    # ---- membership plans (advanced Membership module) ----
    if await db.membership_plans.count_documents({}) == 0:
        _mplans = [
            {"name": "Silver Saver", "slug": "silver-saver", "tagline": "Great for occasional bookings",
             "description": "Start saving on every home service with instant member pricing.",
             "price": 299, "original_price": 499, "duration_days": 365, "discount_pct": 5,
             "max_discount_per_booking": 200, "free_visits": 1, "priority_support": False,
             "benefits": ["5% off every booking", "1 free visiting charge", "Member-only offers"],
             "badge": "", "color": "#64748b", "icon": "shield", "sort_order": 1, "status": "active"},
            {"name": "Gold Plus", "slug": "gold-plus", "tagline": "Best value for regular customers",
             "description": "Our most popular plan — bigger savings and priority support all year.",
             "price": 699, "original_price": 1199, "duration_days": 365, "discount_pct": 10,
             "max_discount_per_booking": 500, "free_visits": 3, "priority_support": True,
             "benefits": ["10% off every booking", "3 free visiting charges", "Priority support",
                          "Early access to seasonal offers"],
             "badge": "Most Popular", "color": "#f59e0b", "icon": "crown", "sort_order": 2, "status": "active"},
            {"name": "Platinum Elite", "slug": "platinum-elite", "tagline": "Maximum savings & VIP care",
             "description": "The ultimate plan for power users who want the biggest discount and white-glove service.",
             "price": 1299, "original_price": 2499, "duration_days": 365, "discount_pct": 15,
             "max_discount_per_booking": 1000, "free_visits": 6, "priority_support": True,
             "benefits": ["15% off every booking", "6 free visiting charges", "Dedicated priority support",
                          "Free rescheduling", "Exclusive Platinum offers"],
             "badge": "Best Value", "color": "#6366f1", "icon": "gem", "sort_order": 3, "status": "active"},
        ]
        for p in _mplans:
            await db.membership_plans.insert_one({
                "id": new_id(), "created_at": now_iso(), "updated_at": now_iso(), **p})

    # --- SMS templates (event-based, active/inactive) ---
    from services.sms_templates_service import seed_sms_templates
    await seed_sms_templates()

    # --- Unified Template Manager defaults (push / sms / email, event-driven) ---
    from services.template_service import seed_templates
    await seed_templates()

    # --- Phase 5 module sample data (idempotent) ---
    await _seed("service_requests", [
        {"name": "Rohan Gupta", "phone": "+919812345678", "service": "AC Deep Clean", "detail": "Split AC not cooling", "status": "open"},
        {"name": "Meena Kumari", "phone": "+919898989898", "service": "Sofa Cleaning", "detail": "3-seater fabric sofa", "status": "assigned"}])
    await _seed("checklists", [
        {"title": "AC Service Checklist", "service": "AC Repair", "items": ["Check gas", "Clean filter", "Test cooling"], "status": "active"},
        {"title": "Deep Cleaning Checklist", "service": "Home Cleaning", "items": ["Dust", "Mop", "Sanitize"], "status": "active"}])
    await _seed("service_areas", [
        {"name": "Patna Central", "city": "Patna", "pincodes": ["800001", "800002"], "radius_km": 15,
         "center_lat": 25.5941, "center_lng": 85.1376, "status": "active"},
        {"name": "Ranchi Zone", "city": "Ranchi", "pincodes": ["834001"], "radius_km": 12,
         "center_lat": 23.3441, "center_lng": 85.3096, "status": "active"}])
    await _seed("taxes", [
        {"name": "GST", "percentage": 18, "applies_to": "services", "status": "active"},
        {"name": "Service Tax", "percentage": 5, "applies_to": "spare_parts", "status": "inactive"}])
    await _seed("offers", [
        {"title": "Monsoon 20% Off", "code": "MONSOON20", "discount": 20, "audience": "customer", "status": "active"},
        {"title": "First Booking ₹100 Off", "code": "FIRST100", "discount": 100, "audience": "customer", "status": "active"}])
    await _seed("merchant_services", [
        {"merchant": "Sharma Electricals", "service": "Inverter Repair", "price": 599, "status": "active"}])
    await _seed("merchant_orders", [
        {"order_no": "MO-1001", "merchant": "Sharma Electricals", "amount": 1299, "status": "completed"}])
    await _seed("merchant_settlements", [
        {"merchant": "Sharma Electricals", "amount": 8400, "period": "Jul 2025", "status": "pending"}])
    await _seed("settlements", [
        {"partner": "Raj Kumar", "amount": 5200, "period": "Jul 2025", "status": "paid"},
        {"partner": "Amit Singh", "amount": 3100, "period": "Jul 2025", "status": "pending"}])
    await _seed("pages", [
        {"title": "How It Works", "slug": "how-it-works", "body": "Book, relax, done.", "status": "published"},
        {"title": "Careers", "slug": "careers", "body": "Join our team.", "status": "draft"}])
    await _seed("category_seo", [
        {"page": "AC Repair", "title": "AC Repair Services in Patna", "description": "Best AC repair near you", "keywords": "ac repair, ac service"}])
    await _seed("service_seo", [
        {"page": "AC Deep Clean", "title": "AC Deep Cleaning at Home", "description": "Foam jet AC cleaning", "keywords": "ac cleaning, deep clean"}])
    await _seed("redirects", [
        {"from_path": "/old-ac", "to_path": "/services/ac-repair", "type": "301"}])
    await _seed("channels", [
        {"name": "Transactional SMS", "type": "sms", "status": "active"},
        {"name": "Promo Email", "type": "email", "status": "inactive"},
        {"name": "Push Notifications", "type": "push", "status": "active"}])
    await _seed("schema_markup", [
        {"name": "Organization", "type": "Organization", "code": "{\"@type\":\"Organization\",\"name\":\"AzoApp\"}"}])
    await _seed("login_activity", [
        {"user": "AzoApp Admin", "role": "admin", "ip": "103.21.44.10", "device": "Chrome / Windows", "status": "success"},
        {"user": "Raj Kumar", "role": "partner", "ip": "49.36.12.5", "device": "Android App", "status": "success"}])

    # --- CMS seed content ---
    if await db.banners.count_documents({}) == 0:
        for b in [
            {"title": "Monsoon AC Service", "subtitle": "Flat 30% off on AC deep cleaning", "image": "https://images.pexels.com/photos/6471913/pexels-photo-6471913.jpeg", "status": "active"},
            {"title": "Sparkling Homes", "subtitle": "Book deep cleaning from ₹1999", "image": "https://images.pexels.com/photos/6195274/pexels-photo-6195274.jpeg", "status": "active"},
        ]:
            await db.banners.insert_one({"id": new_id(), "created_at": now_iso(), "link": "", **b})
    if await db.faqs.count_documents({}) == 0:
        for f in [
            {"question": "How does AzoApp verify partners?", "answer": "Every partner completes KYC and is background-checked before approval.", "category": "Trust"},
            {"question": "How is pricing decided?", "answer": "Transparent upfront pricing shown before you book. No hidden charges.", "category": "Pricing"},
            {"question": "What is the merchant referral program?", "answer": "Shopkeepers earn lifetime commission on every job their referred partners complete.", "category": "Merchant"},
        ]:
            await db.faqs.insert_one({"id": new_id(), "created_at": now_iso(), "status": "active", **f})
    if await db.blogs.count_documents({}) == 0:
        await db.blogs.insert_one({"id": new_id(), "created_at": now_iso(), "title": "5 signs your AC needs servicing",
            "slug": "5-signs-your-ac-needs-servicing", "category": "Home Appliances", "tags": ["AC", "maintenance"],
            "excerpt": "Weak cooling, strange noises and high bills — here's when to call an expert.",
            "body": "<p>Regular AC servicing improves efficiency and extends life...</p>", "author": "AzoApp",
            "image": "https://images.pexels.com/photos/6471913/pexels-photo-6471913.jpeg", "status": "published"})

    # --- FAQ categories (idempotent seed) ---
    if await db.faq_categories.count_documents({}) == 0:
        for i, name in enumerate(["General", "Booking", "Pricing", "Payment", "Partner", "Customer",
                                  "Cancellation", "Refund", "Emergency Service", "Visiting Charge", "Account", "Other"]):
            import re as _re
            await db.faq_categories.insert_one({
                "id": new_id(), "created_at": now_iso(), "name": name,
                "slug": _re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"),
                "order": i, "status": "active"})

    # --- ensure a homepage "blog" section exists (below FAQ) for existing installs ---
    if await db.homepage_sections.count_documents({}) > 0 and \
       await db.homepage_sections.count_documents({"type": {"$in": ["blog", "latest_blogs"]}}) == 0:
        last = await db.homepage_sections.find({}, {"_id": 0, "order": 1}).sort("order", -1).to_list(1)
        nxt = (last[0].get("order", 0) + 1) if last else 99
        await db.homepage_sections.insert_one({
            "id": new_id(), "order": nxt, "created_at": now_iso(), "type": "blog",
            "title": "Latest from our blog", "subtitle": "INSIGHTS", "enabled": True, "config": {"limit": 3}})
    if await db.plans.count_documents({}) == 0:
        for p in [
            {"name": "Partner Starter", "price": 0, "duration_days": 30, "audience": "partner", "features": ["Up to 20 jobs/mo", "Standard support"]},
            {"name": "Partner Pro", "price": 499, "duration_days": 30, "audience": "partner", "features": ["Unlimited jobs", "Priority matching", "Lower commission"]},
            {"name": "Merchant Growth", "price": 999, "duration_days": 30, "audience": "merchant", "features": ["Unlimited referrals", "Analytics", "Priority support"]},
        ]:
            await db.plans.insert_one({"id": new_id(), "created_at": now_iso(), "status": "active", **p})

    # --- static pages (About / Contact) ---
    if await db.pages.count_documents({"key": "about"}) == 0:
        await db.pages.insert_one({"id": new_id(), "created_at": now_iso(), "key": "about",
            "title": "About AzoApp", "body": "<p>AzoApp brings trusted, verified home-service professionals to your doorstep. From AC repair and deep cleaning to electricians, plumbers and carpenters, we make booking simple, transparent and safe with 3-way OTP verified service and upfront pricing.</p>"})
    if await db.pages.count_documents({"key": "contact"}) == 0:
        await db.pages.insert_one({"id": new_id(), "created_at": now_iso(), "key": "contact",
            "title": "Contact Us", "phone": "+91 90000 00000", "email": "support@azoapp.com",
            "address": "AzoApp HQ, Patna, Bihar, India", "hours": "Mon–Sun, 8am–9pm",
            "body": "<p>Have a question or need help with a booking? Our support team is here for you.</p>"})


    # --- Advanced Support / Helpdesk demo tickets ---
    if await db.support_tickets.count_documents({}) == 0:
        cust = await db.users.find_one({"role": "customer"}, {"_id": 0})
        part = await db.users.find_one({"role": "partner"}, {"_id": 0})
        _n = 100000
        demo = []
        if cust:
            _n += 1
            demo.append({
                "id": new_id(), "code": f"TKT-{_n}", "user_id": cust["id"],
                "user_name": cust.get("name") or "Customer", "user_role": "customer",
                "user_phone": cust.get("phone", ""), "subject": "Partner arrived late for AC service",
                "category": "booking", "priority": "medium", "status": "open", "booking_code": "",
                "assigned_to": None, "assigned_name": None,
                "messages": [{"id": new_id(), "sender_id": cust["id"], "sender_role": "customer",
                              "sender_name": cust.get("name") or "Customer",
                              "text": "The technician came 45 minutes late. Please look into this.",
                              "attachments": [], "at": now_iso(), "system": False}],
                "unread_admin": 1, "unread_user": 0,
                "created_at": now_iso(), "updated_at": now_iso(), "last_message_at": now_iso(),
                "first_response_at": None, "resolved_at": None, "closed_at": None, "rating": None})
        if part:
            _n += 1
            demo.append({
                "id": new_id(), "code": f"TKT-{_n}", "user_id": part["id"],
                "user_name": part.get("name") or "Partner", "user_role": "partner",
                "user_phone": part.get("phone", ""), "subject": "Withdrawal not received in bank",
                "category": "payment", "priority": "high", "status": "in_progress", "booking_code": "",
                "assigned_to": None, "assigned_name": None,
                "messages": [
                    {"id": new_id(), "sender_id": part["id"], "sender_role": "partner",
                     "sender_name": part.get("name") or "Partner",
                     "text": "I requested a withdrawal 3 days ago but haven't received it.",
                     "attachments": [], "at": now_iso(), "system": False},
                    {"id": new_id(), "sender_id": "admin", "sender_role": "admin",
                     "sender_name": "Support", "text": "We're checking with our payments team, will update you shortly.",
                     "attachments": [], "at": now_iso(), "system": False}],
                "unread_admin": 0, "unread_user": 1,
                "created_at": now_iso(), "updated_at": now_iso(), "last_message_at": now_iso(),
                "first_response_at": now_iso(), "resolved_at": None, "closed_at": None, "rating": None})
        if demo:
            await db.support_tickets.insert_many(demo)

    # --- RBAC roles with real permission matrices (idempotent by name) ---
    from services.rbac_service import ACTIONS as _RB_ACT
    def _perm(view_mods, full_mods=()):
        p = {}
        for m in view_mods:
            p[m] = {a: False for a in _RB_ACT}
            p[m]["view"] = True
        for m in full_mods:
            p[m] = {a: True for a in _RB_ACT}
        return p
    _rbac_roles = [
        {"name": "Operations Manager", "description": "Bookings, live ops & partners",
         "permissions": _perm(["dashboard", "customers", "merchants"],
                              ["bookings", "live_operations", "live_partner_map", "services", "partners", "partner_growth"])},
        {"name": "Finance Manager", "description": "Payments, refunds & reports",
         "permissions": _perm(["dashboard", "bookings"],
                              ["finance", "reports_analytics"])},
        {"name": "Support Agent", "description": "Support desk & customers",
         "permissions": _perm(["dashboard", "bookings"],
                              ["communication", "customers"])},
        {"name": "Content Editor", "description": "Website, blog & SEO",
         "permissions": _perm(["dashboard"], ["website_cms", "seo", "marketing"])},
    ]
    for r in _rbac_roles:
        existing = await db.roles.find_one({"name": r["name"]}, {"_id": 0})
        if not existing:
            await db.roles.insert_one({"id": new_id(), "created_at": now_iso(), "status": "active", **r})
        elif not isinstance(existing.get("permissions"), dict):
            # upgrade a legacy string-permission role to the real matrix
            await db.roles.update_one({"id": existing["id"]},
                                      {"$set": {"permissions": r["permissions"], "description": r["description"]}})

    # --- Module 3: Partner verification workflow, wallet config, skills, incentive ---
    from services.partner_service import DEFAULT_STAGES, DEFAULT_WALLET_CONFIG
    if not await db.partner_verification_config.find_one({"id": "config"}):
        await db.partner_verification_config.insert_one(
            {"id": "config", "stages": DEFAULT_STAGES, "updated_at": now_iso()})
    if not await db.partner_wallet_config.find_one({"id": "config"}):
        await db.partner_wallet_config.insert_one(dict(DEFAULT_WALLET_CONFIG))

    if await db.partner_skills_catalog.count_documents({}) == 0:
        SKILLS = [
            {"name": "Split AC Repair", "category": "AC Repair", "min_experience": 2,
             "requires_certificate": False, "requires_assessment": True, "passing_score": 70,
             "questions": [
                 {"id": "q1", "q": "What refrigerant is common in modern split ACs?",
                  "options": ["R22", "R32", "Water", "Air"], "answer_index": 1},
                 {"id": "q2", "q": "Normal operating pressure is measured using a?",
                  "options": ["Multimeter", "Manifold gauge", "Ruler", "Thermometer"], "answer_index": 1},
                 {"id": "q3", "q": "First safety step before servicing an AC?",
                  "options": ["Spray water", "Switch off power", "Open gas valve", "Remove PCB"], "answer_index": 1},
             ]},
            {"name": "AC Installation", "category": "AC Repair", "min_experience": 1,
             "requires_certificate": False, "requires_assessment": False},
            {"name": "Gas Charging", "category": "AC Repair", "min_experience": 3,
             "requires_certificate": True, "requires_assessment": True, "passing_score": 80,
             "questions": [
                 {"id": "q1", "q": "Overcharging refrigerant causes?",
                  "options": ["Better cooling", "High pressure & compressor damage", "Nothing", "Lower bills"],
                  "answer_index": 1}]},
            {"name": "Plumbing", "category": "Plumbing", "min_experience": 1,
             "requires_certificate": False, "requires_assessment": False},
            {"name": "Electrical Wiring", "category": "Electrical", "min_experience": 2,
             "requires_certificate": True, "requires_assessment": False},
            {"name": "Deep Cleaning", "category": "Cleaning", "min_experience": 0,
             "requires_certificate": False, "requires_assessment": False},
        ]
        for s in SKILLS:
            s.setdefault("levels", ["Beginner", "Intermediate", "Advanced", "Expert", "Master"])
            s.setdefault("requires_assessment", False)
            s.setdefault("requires_certificate", False)
            s.setdefault("passing_score", 70)
            s.setdefault("max_attempts", 3)
            s.setdefault("time_limit_min", 15)
            s.setdefault("questions", [])
            s.setdefault("eligible_services", [])
            await db.partner_skills_catalog.insert_one(
                {"id": new_id(), "status": "active", "created_at": now_iso(), **s})

    if await db.partner_incentives.count_documents({}) == 0:
        await db.partner_incentives.insert_one({
            "id": new_id(), "name": "Monthly Superstar", "description": "Complete 20 jobs this month with 4.5+ rating",
            "job_target": 20, "revenue_target": 0, "rating_min": 4.5, "bonus_amount": 2000,
            "category": "", "start_date": "", "end_date": "", "auto_approve": False,
            "status": "active", "created_at": now_iso()})

    if await db.partner_training.count_documents({}) == 0:
        await db.partner_training.insert_many([
            {"id": new_id(), "title": "AzoApp Partner Code of Conduct",
             "description": "Safety, etiquette and customer handling basics for every partner.",
             "video_url": "https://www.youtube.com/watch?v=aqz-KE-bpKQ", "duration_min": 8,
             "assign_type": "all", "assign_value": "", "mandatory": False,
             "status": "active", "created_at": now_iso()},
            {"id": new_id(), "title": "AC Technician Safety Training",
             "description": "Mandatory safety module required before the Training verification stage.",
             "video_url": "https://www.youtube.com/watch?v=aqz-KE-bpKQ", "duration_min": 12,
             "assign_type": "stage", "assign_value": "training", "mandatory": True,
             "status": "active", "created_at": now_iso()}])


    # --- Demo operational activity (bookings, wallet, notifications) so every
    #     portal (customer / partner / admin) shows populated data. Idempotent. ---
    await seed_demo_activity()
    await seed_merchant_demo()
    await seed_merchant_referral_commission()
    # --- Growth features demo (scratch reward pool, combo packages, referrals). Idempotent. ---
    try:
        from seed_growth_demo import seed_reward_pool, seed_packages, seed_referrals_and_cards
        await seed_reward_pool()
        await seed_packages()
        await seed_referrals_and_cards()
    except Exception as _e:
        print("growth seed skipped:", _e)


def _pricing(base, discount=0):
    gst = round(base * 0.18, 2)
    total = round(base + gst - discount, 2)
    return {"base": base, "addons_total": 0, "emergency_fee": 0, "surge": 0,
            "surge_rule": None, "subtotal": base, "convenience_fee": 0,
            "platform_fee": 0, "gst": gst, "discount": discount,
            "total": max(total, 0), "commissionable_base": base}


def _bcode():
    return "AZO" + new_id().replace("-", "")[:6].upper()


async def seed_demo_activity():
    """Create a handful of demo bookings + transactions so dashboards look alive.
    Runs only once (skips if any booking already exists)."""
    if await db.bookings.count_documents({}) > 0:
        return
    cust = await db.users.find_one({"phone": "+919000000004", "role": "customer"}, {"_id": 0})
    partner = await db.users.find_one({"phone": "+919000000003", "role": "partner"}, {"_id": 0})
    svcs = await db.services.find({}, {"_id": 0}).to_list(10)
    if not (cust and partner and svcs):
        return

    addr = {"line": "12 Kankarbagh Main Road", "city": "Patna", "state": "Bihar",
            "pincode": "800020", "lat": 25.5941, "lng": 85.1376}

    def _svc(i):
        return svcs[i % len(svcs)]

    def _mk(status, svc, base, *, with_partner, payment="pending", review=None, days_ago=0):
        ts = now_iso()
        tl = [{"status": "searching", "at": ts}]
        for s in ["assigned", "arrived_customer", "started", "completed", "paid"]:
            tl.append({"status": s, "at": ts})
            if s == status:
                break
        return {
            "id": new_id(), "code": _bcode(),
            "customer_id": cust["id"], "customer_name": cust.get("name"),
            "customer_phone": cust.get("phone"),
            "service_id": svc["id"], "service_name": svc["name"], "tier_label": None,
            "category_id": svc.get("category_id"), "category_name": svc.get("category_name"),
            "merchant_id": None, "merchant_name": None,
            "booking_type": "direct",
            "partner_id": partner["id"] if with_partner else None,
            "partner_name": partner["name"] if with_partner else None,
            "address": addr, "schedule_type": "now", "scheduled_at": None,
            "notes": "", "addons": [], "pricing": _pricing(base),
            "status": status,
            "otps": {"shop": "1234", "start": "1234", "completion": "1234"},
            "evidence": {"before": [], "after": []}, "spare_parts": [],
            "eligible_partner_ids": [partner["id"]],
            "timeline": tl if status != "searching" else [{"status": "searching", "at": ts}],
            "payment_status": payment, "review": review,
            "commission_config": {}, "partner_location": None,
            "created_at": ts, "updated_at": ts,
        }

    bookings = [
        _mk("paid", _svc(0), 599, with_partner=True, payment="paid",
            review={"rating": 5, "comment": "Excellent, on-time service!"}),
        _mk("completed", _svc(1), 899, with_partner=True, payment="pending"),
        _mk("assigned", _svc(2), 499, with_partner=True, payment="paid"),
        _mk("started", _svc(3), 1299, with_partner=True, payment="paid"),
        _mk("searching", _svc(4), 799, with_partner=False),
        _mk("cancelled", _svc(0), 599, with_partner=False),
    ]
    await db.bookings.insert_many([dict(b) for b in bookings])

    # customer wallet + a debit transaction for the paid booking
    paid = bookings[0]
    await db.users.update_one({"id": cust["id"]}, {"$set": {"wallet_balance": 250}})
    await db.transactions.insert_one({
        "id": new_id(), "user_id": cust["id"], "amount": paid["pricing"]["total"],
        "type": "debit", "kind": "booking_payment",
        "note": f"Payment for {paid['code']}", "created_at": now_iso()})

    # partner earnings -> wallet + ledger
    earn = round(paid["pricing"]["base"] * 0.75, 2)
    await db.users.update_one({"id": partner["id"]},
                              {"$inc": {"wallet_balance": earn, "total_jobs": 1}})
    await db.partner_ledger.insert_one({
        "id": new_id(), "partner_id": partner["id"], "kind": "earning",
        "direction": "credit", "amount": earn, "ref_type": "booking",
        "ref_id": paid["id"], "note": f"Earning · {paid['code']}",
        "status": "completed", "created_at": now_iso()})

    # a few notifications
    await db.notifications.insert_many([
        {"id": new_id(), "user_id": cust["id"], "audience": "user",
         "title": "Booking completed", "body": f"Your booking {paid['code']} is complete. Please rate your experience.",
         "link": "/account", "read": False, "created_at": now_iso()},
        {"id": new_id(), "user_id": partner["id"], "audience": "user",
         "title": "New job available", "body": f"A new job {bookings[4]['code']} is available near you.",
         "link": "/partner", "read": False, "created_at": now_iso()},
    ])

async def seed_merchant_demo():
    """Idempotent demo bookings for the demo merchant so Merchant panels
    (My Customers, Top Customers, Bulk Reminders, tags) show live data.
    Field names match merchant_ops_service expectations."""
    merchant = await db.users.find_one({"phone": "+919000000002", "role": "merchant"}, {"_id": 0})
    if not merchant:
        return
    mid = merchant["id"]
    if await db.bookings.count_documents({"merchant_id": mid}) > 0:
        return
    svc = await db.services.find_one({}, {"_id": 0})
    svc_name = svc["name"] if svc else "AC Service"
    ts = now_iso()
    rows = [
        ("Ravi Kumar", "9811111111", 1200, "completed"),
        ("Ravi Kumar", "9811111111", 800, "completed"),
        ("Sunita Devi", "9822222222", 1500, "completed"),
        ("Amit Shah", "9833333333", 600, "pending"),
    ]
    docs = []
    for i, (nm, ph, amt, st) in enumerate(rows):
        _bc = _bcode()
        docs.append({
            "id": new_id(), "booking_code": _bc, "code": _bc,
            "merchant_id": mid, "merchant_name": merchant.get("shop_name") or merchant.get("name"),
            "booking_type": "merchant", "customer_name": nm, "customer_phone": ph, "customer_id": ph,
            "service": {"name": svc_name}, "service_name": svc_name,
            "status": st, "pricing": {"base": amt, "total": amt},
            "created_at": ts, "updated_at": ts,
        })
    await db.bookings.insert_many(docs)
    # pre-tag the top repeat customer as VIP + AMC
    await db.merchant_customer_tags.update_one(
        {"merchant_id": mid, "customer_key": "9811111111"},
        {"$set": {"merchant_id": mid, "customer_key": "9811111111",
                  "tags": ["vip", "amc"], "updated_at": ts}}, upsert=True)


async def seed_merchant_referral_commission():
    """Idempotent demo: give the demo merchant REAL, consistent referral commission
    so the Referral & Commission dashboard shows live numbers. Commission is computed
    by the SAME CommissionEngine used at settlement (configured %s, never hardcoded),
    and attributed to the merchant's already-referred customers + partner. Because all
    merchant views read this single ledger, every screen stays perfectly consistent."""
    from datetime import timedelta
    from config.database import get_settings
    from services.engines import CommissionEngine, PricingEngine

    merchant = await db.users.find_one({"phone": "+919000000002", "role": "merchant"}, {"_id": 0})
    if not merchant:
        return
    mid = merchant["id"]
    # idempotent — skip if this merchant already has any attributed commission
    if await db.commission_ledger.count_documents(
            {"$or": [{"referral_merchant_id": mid}, {"customer_merchant_id": mid}]}) > 0:
        return

    cm = CommissionEngine._cm(await get_settings() or {})
    now = datetime.now(timezone.utc)

    def _iso_days(d):
        return (now - timedelta(days=d)).isoformat()

    entries = []

    # ── CUSTOMER referral commission (from the merchant's referred-customer bookings) ──
    cust_bookings = await db.bookings.find({"merchant_id": mid}, {"_id": 0}).to_list(50)
    day_offsets = [0, 1, 9, 20, 40, 55]
    for i, b in enumerate(cust_bookings):
        pricing = b.get("pricing") or {}
        base = PricingEngine.commission_base_excl_tax(pricing) or float(pricing.get("base") or 0)
        if base <= 0:
            continue
        s = CommissionEngine.split(base, cm, None, mid)  # customer_merchant_id = mid
        if s["merchant_customer"] <= 0:
            continue
        entries.append({
            "id": new_id(), "booking_id": b.get("id"),
            "booking_code": b.get("booking_code") or b.get("code"),
            "customer_id": b.get("customer_id"), "partner_id": None,
            "base": s["base"], "gross": float(pricing.get("total") or base),
            "merchant_customer": s["merchant_customer"], "customer_merchant_id": mid,
            "merchant_booking": s["merchant_customer"], "merchant_id": mid,
            "merchant_referral": 0.0, "referral_merchant_id": None,
            "partner_earning": s["partner_earning"], "platform_earning": s["platform_earning"],
            "rates": s["rates"], "kind": "completion",
            "created_at": _iso_days(day_offsets[i % len(day_offsets)]),
        })

    # ── PARTNER referral commission (referred partner registered with merchant code) ──
    partner = await db.users.find_one({"referred_by_merchant": mid, "role": "partner"}, {"_id": 0})
    if partner:
        pid = partner["id"]
        pname = partner.get("name") or "Partner"
        samples = [("AC Repair & Service", 2000, 0), ("Electrician Visit", 1500, 3),
                   ("Plumbing Work", 1200, 16), ("Deep Home Cleaning", 3000, 35)]
        for sname, base, days in samples:
            s = CommissionEngine.split(base, cm, mid, None)  # partner_merchant_id = mid
            if s["merchant_referral"] <= 0:
                continue
            bcode = _bcode()
            bid = new_id()
            created = _iso_days(days)
            # synth a completed booking so service name + completed count resolve
            await db.bookings.insert_one({
                "id": bid, "code": bcode, "booking_code": bcode,
                "partner_id": pid, "partner_name": pname,
                "service_name": sname, "service": {"name": sname},
                "status": "completed", "pricing": {"base": base, "total": base},
                "created_at": created, "updated_at": created,
            })
            entries.append({
                "id": new_id(), "booking_id": bid, "booking_code": bcode,
                "partner_id": pid, "customer_id": None,
                "base": s["base"], "gross": base,
                "merchant_referral": s["merchant_referral"], "referral_merchant_id": mid,
                "merchant_customer": 0.0, "customer_merchant_id": None,
                "partner_earning": s["partner_earning"], "platform_earning": s["platform_earning"],
                "rates": s["rates"], "kind": "completion", "created_at": created,
            })

    if entries:
        await db.commission_ledger.insert_many(entries)
