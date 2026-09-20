from config.database import db, now_iso, get_settings
from models.user import new_id
from services import money
from fastapi import HTTPException
import re
import math
from datetime import datetime, timezone


def _norm(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def _haversine_km(a_lat, a_lng, b_lat, b_lng):
    """Great-circle distance in km between two lat/lng points."""
    try:
        r = 6371.0
        p1, p2 = math.radians(a_lat), math.radians(b_lat)
        dphi = math.radians(b_lat - a_lat)
        dl = math.radians(b_lng - a_lng)
        h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return round(2 * r * math.asin(math.sqrt(h)), 2)
    except Exception:
        return None


def _minutes_since(iso):
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return max(0, int((datetime.now(timezone.utc) - dt).total_seconds() // 60))
    except Exception:
        return None


async def user_detail(user_id):
    u = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    bq = {"customer": {"customer_id": user_id}, "partner": {"partner_id": user_id},
          "merchant": {"merchant_id": user_id}}.get(u["role"], {"id": "__none__"})
    bookings = await db.bookings.find(bq, {"_id": 0}).sort("created_at", -1).to_list(100)
    txns = await db.transactions.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    out = {"user": u, "bookings": bookings, "transactions": txns}

    # Partner 360: full registration profile, documents, skills, certificates,
    # wallet ledger and activity — everything the partner submitted + did.
    if u["role"] == "partner":
        from services import partner_code_service
        await partner_code_service.ensure_code(u)
        profile = await db.partner_profiles.find_one({"user_id": user_id}, {"_id": 0})
        skills = await db.partner_skills.find({"partner_id": user_id}, {"_id": 0}).to_list(100)
        certs = await db.partner_certificates.find({"partner_id": user_id}, {"_id": 0}).to_list(100)
        ledger = await db.partner_ledger.find({"partner_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
        withdrawals = await db.partner_withdrawals.find({"partner_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
        penalties = await db.partner_penalties.find({"partner_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
        notifs = await db.notifications.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
        audit = await db.partner_audit.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(50) \
            if "partner_audit" in await db.list_collection_names() else []
        completed = [b for b in bookings if b["status"] in ("completed", "paid")]
        earned = sum(l.get("amount", 0) for l in ledger if l.get("direction") == "credit")
        wallet = {
            "balance": u.get("wallet_balance", 0),
            "earned": round(earned, 2),
            "total_jobs": u.get("total_jobs", len(completed)),
            "completed_jobs": len(completed),
            "rating": u.get("rating", 0),
        }
        out.update({
            "profile": profile, "skills": skills, "certificates": certs,
            "ledger": ledger, "withdrawals": withdrawals, "penalties": penalties,
            "notifications": notifs, "activity": audit, "wallet": wallet,
        })
    elif u["role"] in ("customer", "merchant"):
        notifs = await db.notifications.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
        out["notifications"] = notifs
        completed = [b for b in bookings if b["status"] in ("completed", "paid")]
        spent = sum((b.get("pricing") or {}).get("total", 0) for b in bookings if b["status"] in ("completed", "paid"))
        if u["role"] == "customer":
            cancelled = [b for b in bookings if b["status"] in ("cancelled", "rejected")]
            # favourite services (top by count)
            svc_count = {}
            for b in bookings:
                nm = b.get("service_name") or "Service"
                svc_count[nm] = svc_count.get(nm, 0) + 1
            favourite_services = sorted(
                [{"name": k, "count": v} for k, v in svc_count.items()],
                key=lambda x: x["count"], reverse=True)[:5]
            last_booking_at = bookings[0].get("created_at") if bookings else None
            aov = round(spent / len(completed), 2) if completed else 0
            _active_st = ("searching", "assigned", "arrived_shop", "arrived_customer", "started", "pending", "on_hold")
            active_ct = len([b for b in bookings if b.get("status") in _active_st])
            invoices = await db.invoices.find({"customer_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(300)
            refunds = await db.refunds.find({"customer_phone": u.get("phone", "")}, {"_id": 0}).sort("created_at", -1).to_list(300)
            total_refund = round(sum((r.get("amount", 0) or 0) for r in refunds), 2)
            out["invoices"] = invoices
            out["refunds"] = refunds
            out["stats"] = {
                "bookings": len(bookings), "completed": len(completed),
                "cancelled": len(cancelled), "active": active_ct,
                "total_spent": round(spent, 2), "total_paid": round(spent, 2),
                "total_refund": total_refund, "wallet": u.get("wallet_balance", 0),
                "addresses": len(u.get("addresses", [])), "member_since": u.get("created_at"),
                "last_booking_at": last_booking_at, "avg_order_value": aov,
                "blocked": bool(u.get("blocked")), "status": u.get("status", "active"),
            }
            out["favourite_services"] = favourite_services
        else:  # merchant
            referred_partners = await db.users.find(
                {"role": "partner", "referred_by_merchant": user_id},
                {"_id": 0, "id": 1, "name": 1, "phone": 1, "kyc_status": 1,
                 "jobs_completed": 1, "rating": 1, "partner_status": 1}).to_list(500)
            commission_earned = sum(t.get("amount", 0) for t in txns if t.get("type") == "credit")
            ref_customer_ids = await db.bookings.distinct("customer_id", {"merchant_id": user_id})
            out["network"] = referred_partners
            out["stats"] = {
                "partners": len(referred_partners), "customers": len(ref_customer_ids),
                "commission_earned": round(commission_earned, 2), "wallet": u.get("wallet_balance", 0),
                "bookings": len(bookings), "member_since": u.get("created_at"),
                "status": u.get("status", "active"),
            }
    return out


async def waitlist_demand():
    """Aggregated out-of-area demand — grouped by pincode so admins can pick the
    next city/area to launch."""
    rows = await db.waitlist.find({}, {"_id": 0}).to_list(5000)
    by_pin = {}
    for r in rows:
        pin = str(r.get("pincode", "")).strip() or "—"
        g = by_pin.setdefault(pin, {"pincode": pin, "city": r.get("city") or "", "count": 0, "last_at": ""})
        g["count"] += 1
        if not g["city"] and r.get("city"):
            g["city"] = r["city"]
        if (r.get("created_at") or "") > g["last_at"]:
            g["last_at"] = r.get("created_at") or ""
    demand = sorted(by_pin.values(), key=lambda x: x["count"], reverse=True)
    return {"demand": demand, "total_requests": len(rows), "unique_pincodes": len(by_pin)}


async def pincodes_in_radius(lat: float, lng: float, radius_km: float):
    """Sample a grid of points inside the radius and reverse-geocode each to
    collect the real pincodes covered. Best-effort (OSM); capped for speed."""
    import math
    from services.geo_service import reverse_geocode
    radius_km = max(0.5, min(radius_km, 25))          # keep sampling sane
    # rings of sample points: centre + up to 2 rings of 8 points each
    points = [(lat, lng)]
    rings = [radius_km * 0.55, radius_km * 0.95]
    for r in rings:
        dlat = r / 111.0
        dlng = r / (111.0 * max(0.2, math.cos(math.radians(lat))))
        for k in range(8):
            ang = math.radians(k * 45)
            points.append((lat + dlat * math.sin(ang), lng + dlng * math.cos(ang)))
    seen, found = set(), []
    for (plat, plng) in points[:17]:
        try:
            g = await reverse_geocode(plat, plng)
            pin = (g.get("pincode") or "").strip()
            if pin and pin not in seen:
                seen.add(pin)
                found.append({"pincode": pin, "city": g.get("city") or ""})
        except Exception:
            continue
    return {"pincodes": [f["pincode"] for f in found], "details": found,
            "sampled": len(points), "radius_km": radius_km}


async def coverage_map():
    """Active service areas + geocoded launch-demand pins for the coverage map."""
    from services.geo_service import forward_geocode
    areas = await db.service_areas.find({}, {"_id": 0}).to_list(1000)
    areas = [a for a in areas if str(a.get("status", "active")).lower() != "inactive"]
    out_areas = [{
        "name": a.get("name"), "city": a.get("city"),
        "center_lat": a.get("center_lat"), "center_lng": a.get("center_lng"),
        "radius_km": a.get("radius_km"), "polygon": a.get("polygon"),
        "pincodes": a.get("pincodes"),
    } for a in areas]
    # top launch-demand pincodes → pins (geocoded, capped)
    rows = await db.waitlist.find({}, {"_id": 0}).to_list(5000)
    by_pin = {}
    for r in rows:
        pin = str(r.get("pincode", "")).strip()
        if not pin:
            continue
        g = by_pin.setdefault(pin, {"pincode": pin, "city": r.get("city") or "", "count": 0})
        g["count"] += 1
    top = sorted(by_pin.values(), key=lambda x: x["count"], reverse=True)[:25]
    pins = []
    for d in top:
        try:
            g = await forward_geocode(d["pincode"] or d["city"])
            if g.get("found"):
                pins.append({**d, "lat": g["lat"], "lng": g["lng"]})
        except Exception:
            continue
    return {"areas": out_areas, "demand_pins": pins}



async def partners_live():
    """Online partners with their last-known GPS + current active job (incl. live
    ETA to the customer and a delay flag), for the admin live map."""
    AVG_KMPH = 24.0  # assumed city travel speed for ETA estimation
    partners = await db.users.find(
        {"role": "partner", "partner_status": "online"},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "live_location": 1, "live_location_at": 1,
         "rating": 1, "partner_status": 1, "city": 1, "skills": 1}).to_list(1000)
    # Reverse map: canonical skill key -> active category name (for per-partner
    # category tagging so the map's category filter works for available partners too).
    cat_rows = await db.categories.find(
        {"status": "active"}, {"_id": 0, "name": 1, "required_skill": 1, "order": 1}).sort("order", 1).to_list(500)
    skill_to_cat = {(c.get("required_skill") or "").strip().lower(): c.get("name")
                    for c in cat_rows if c.get("required_skill") and c.get("name")}
    out = []
    for p in partners:
        loc = p.get("live_location")
        if not loc:
            continue
        job = await db.bookings.find_one(
            {"partner_id": p["id"], "status": {"$in": ["assigned", "arrived_shop", "arrived_customer", "started"]}},
            {"_id": 0, "code": 1, "status": 1, "service_name": 1, "category_name": 1,
             "address": 1, "customer_name": 1, "created_at": 1, "timeline": 1})
        city = p.get("city")
        category = None
        if job:
            addr = job.get("address") or {}
            city = addr.get("city") or city
            category = job.get("category_name")
            elapsed = _minutes_since(job.get("created_at"))
            eta_min = None
            dist = None
            if job.get("status") == "started":
                eta_label = "On site"
                eta_min = 0
            else:
                clat, clng = addr.get("lat"), addr.get("lng")
                if clat is not None and clng is not None and loc.get("lat") is not None:
                    dist = _haversine_km(loc["lat"], loc["lng"], clat, clng)
                    if dist is not None:
                        eta_min = max(2, int(round(dist / AVG_KMPH * 60)))
                eta_label = f"{eta_min} min" if eta_min is not None else "—"
            # Delayed: still en route with a long ETA, or the job has been open too long.
            delayed = bool(
                (job.get("status") != "started" and eta_min is not None and eta_min > 25)
                or (elapsed is not None and elapsed > 45 and job.get("status") != "started")
            )
            job = {**job, "eta_min": eta_min, "eta_label": eta_label,
                   "distance_km": dist, "elapsed_min": elapsed, "delayed": delayed}
        # Category names this partner serves (from their skills) — lets the map's
        # category filter match available partners, not just those on a job.
        p_categories = sorted({skill_to_cat.get(str(s).strip().lower())
                               for s in (p.get("skills") or [])
                               if skill_to_cat.get(str(s).strip().lower())})
        out.append({**p, "active_job": job, "city": city, "category": category,
                    "categories": p_categories})
    # Live surge % per distinct city (manual rules + auto-surge) for the map badges.
    from services.engines import PricingEngine
    cities = sorted({(p.get("city") or "").strip() for p in out if p.get("city")})
    surge_by_city = {}
    for c in cities:
        amt, rule = await PricingEngine._surge({"category_name": ""}, {"city": c}, 100.0)
        if amt > 0:
            surge_by_city[c] = {"pct": amt, "rule": rule}
    # Active service areas (for drawing coverage circles on the map).
    areas = await db.service_areas.find({}, {"_id": 0}).to_list(1000)
    areas = [{"name": a.get("name"), "city": a.get("city"),
              "center_lat": a.get("center_lat"), "center_lng": a.get("center_lng"),
              "radius_km": a.get("radius_km")}
             for a in areas if str(a.get("status", "active")).lower() != "inactive"]
    # All active service-area cities + all active categories — for the map filter
    # dropdowns (independent of who is currently online).
    filter_cities = sorted({(c or "").strip()
                            for c in await db.service_areas.distinct("city", {"status": {"$ne": "inactive"}})
                            if c and str(c).strip()})
    filter_categories = [c["name"] for c in cat_rows if c.get("name")]
    return {"partners": out, "count": len(out), "generated_at": now_iso(),
            "surge_by_city": surge_by_city, "areas": areas,
            "filter_cities": filter_cities, "filter_categories": filter_categories}



def _pct_change(cur, prev):
    """Signed percentage change of cur vs prev. None when there is no baseline."""
    try:
        cur = float(cur or 0)
        prev = float(prev or 0)
    except (TypeError, ValueError):
        return None
    if prev == 0:
        return 100.0 if cur > 0 else 0.0
    return round((cur - prev) / abs(prev) * 100.0, 1)


async def dashboard(range: str = "30d", date_from: str = "", date_to: str = "",
                    city: str = "", service: str = "", status: str = "",
                    booking_type: str = "", payment_status: str = "",
                    partner: str = "", customer: str = "", category: str = "",
                    merchant: str = "", bucket: str = "auto"):
    """Executive analytics — delegated to services.dashboard_service (real data only)."""
    from services import dashboard_service
    return await dashboard_service.build(
        range=range, date_from=date_from, date_to=date_to, city=city, service=service,
        status=status, booking_type=booking_type, payment_status=payment_status,
        partner=partner, customer=customer, category=category, merchant=merchant, bucket=bucket)


async def get_settings_ctrl():
    return await get_settings()


async def payments_status_ctrl():
    """Resolved pay-in & payout state for the Integration Center "Active Payment
    Gateway" panel — shows the exact gateway + mode each direction runs in, plus a
    per-gateway/per-mode configured matrix. No secrets are returned."""
    from services import gateway_resolver as gr
    s = await get_settings()
    g = s.get("integrations", {}) or {}
    payin = gr.resolve_payin(g)
    payout = gr.resolve_payout(g)

    def _clean(res):
        return {k: res[k] for k in ("gateway", "mode", "env", "enabled",
                                    "configured", "incomplete", "error", "missing")}
    return {
        "payin": _clean(payin),
        "payout": _clean(payout),
        "gateways": {
            "payin": [gr.gateway_state(g, "payin", gw) for gw in gr.GATEWAYS],
            "payout": [gr.gateway_state(g, "payout", gw) for gw in gr.GATEWAYS],
        },
    }


def _is_secret(k: str) -> bool:
    return any(t in k.lower() for t in ("key", "secret", "token", "password"))


def _mask_val(k, v):
    if isinstance(v, dict):
        return {kk: ("***" if _is_secret(kk) and vv else vv) for kk, vv in v.items()}
    return "***" if _is_secret(k) and v else v


def _audit_val(k, v):
    """Mask secret values for the audit trail (mirror of _mask_val, scalar only)."""
    return "***" if _is_secret(k) and v else v


def _diff_settings(cur: dict, upd: dict):
    """Compute a structured per-field diff (old vs new) for the audit log."""
    changes = []
    for key, val in upd.items():
        if isinstance(val, dict):
            base = cur.get(key) or {}
            for sk, sv in val.items():
                ov = base.get(sk)
                if ov != sv:
                    changes.append({"section": key, "field": sk,
                                    "old": _audit_val(sk, ov), "new": _audit_val(sk, sv)})
        else:
            ov = cur.get(key)
            if ov != val:
                changes.append({"section": "", "field": key,
                                "old": _audit_val(key, ov), "new": _audit_val(key, val)})
    return changes[:80]


async def update_settings(data: dict, admin: dict = None):
    upd = {k: v for k, v in data.items() if v is not None}
    cur = await get_settings()
    # Merge nested config dicts so partial saves never wipe sibling keys.
    for nested in ("integrations", "business_config", "general", "alert_config", "referral",
                   "cashback", "packages", "pwa", "agent_config", "fees_config", "home_stats"):
        if isinstance(upd.get(nested), dict):
            upd[nested] = {**(cur.get(nested) or {}), **upd[nested]}
    # Payment/Payout activation guard: a gateway may be ENABLED only when its ACTIVE
    # mode is fully configured (NO test/live credential mixing, NO fallback).
    if isinstance(upd.get("integrations"), dict):
        from services import gateway_resolver as _gr
        merged = upd["integrations"]
        for _gw in _gr.GATEWAYS:
            if merged.get(f"{_gw}_enabled"):
                amode = _gr.active_mode(merged, _gw, "payin")
                if not _gr.mode_configured(merged, "payin", _gw, amode):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cannot activate {_gw.capitalize()} {amode.upper()} MODE — {amode} pay-in credentials are incomplete.")
        if merged.get("razorpayx_enabled"):
            pmode = _gr.active_mode(merged, "razorpay", "payout")
            if not _gr.mode_configured(merged, "payout", "razorpay", pmode):
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot activate RazorpayX {pmode.upper()} MODE — {pmode} payout credentials are incomplete.")
    # Enforce the commission invariants: the four commission %s must total 100 (platform
    # absorbs any ineligible merchant share → nothing is left over), and the cancellation
    # split (customer refund + partner cancellation) must total 100.
    cm = upd.get("commission")
    if isinstance(cm, dict):
        comm_keys = ("platform_pct", "partner_pct", "merchant_partner_referral_pct", "merchant_customer_pct")
        if all(k in cm for k in comm_keys):
            csum = round(sum(float(cm.get(k, 0) or 0) for k in comm_keys), 2)
            if abs(csum - 100.0) > 0.01:
                raise HTTPException(status_code=400,
                                    detail=f"Commission %s (Platform + Partner + Merchant-Partner-Referral + Merchant-Customer) must total 100. Currently {csum:g}.")
        if "customer_refund_pct" in cm and "partner_cancellation_pct" in cm:
            rsum = round(float(cm.get("customer_refund_pct", 0) or 0) + float(cm.get("partner_cancellation_pct", 0) or 0), 2)
            if abs(rsum - 100.0) > 0.01:
                raise HTTPException(status_code=400,
                                    detail=f"Cancellation split (Customer Refund % + Partner Cancellation %) must total 100. Currently {rsum:g}.")
    if upd:
        changes = _diff_settings(cur, upd)
        await db.settings.update_one({"id": "global"}, {"$set": upd}, upsert=True)
        # Invalidate public read-through caches so branding/theme/config changes
        # show immediately instead of after the TTL.
        try:
            from services import cache_service
            await cache_service.bust_prefix("site:")
        except Exception:  # noqa: BLE001
            pass
        detail = ", ".join(f"{k}={_mask_val(k, v)}" for k, v in upd.items())
        actor_name = (admin or {}).get("name") or "Admin"
        actor_phone = (admin or {}).get("phone") or ""
        await db.audit_logs.insert_one({"id": new_id(), "action": "settings.update",
                                        "detail": detail, "actor": actor_name, "created_at": now_iso()})
        if changes:
            await db.settings_audit.insert_one({
                "id": new_id(),
                "actor_id": (admin or {}).get("id") or "",
                "actor_name": actor_name,
                "actor_phone": actor_phone,
                "changes": changes,
                "count": len(changes),
                "created_at": now_iso(),
            })
    return await get_settings()


async def settings_audit(limit: int = 50):
    rows = await db.settings_audit.find({}, {"_id": 0}).sort("created_at", -1).to_list(int(limit or 50))
    return {"entries": rows}


async def s3_test_connection(overrides: dict):
    """Merge saved integration secrets with any posted overrides, then run a
    live S3 round-trip diagnostic."""
    from services import storage_service
    cur = await get_settings()
    integ = dict(cur.get("integrations", {}) or {})
    for k in ("aws_access_key_id", "aws_secret_access_key", "aws_bucket",
              "aws_region", "aws_public_base", "aws_folder"):
        if k in overrides and str(overrides.get(k) or "").strip() != "":
            integ[k] = overrides[k]
    result = await storage_service.test_connection(integ)
    repaired = 0
    if result.get("ok"):
        repaired = await storage_service.repair_s3_urls()
    result["repaired_refs"] = repaired
    await db.settings.update_one({"id": "global"}, {"$set": {"integrations.aws_s3_health": {
        "ok": bool(result.get("ok")), "public": bool(result.get("public")),
        "error": result.get("error"), "checked_at": now_iso()}}}, upsert=True)
    return result


async def s3_migrate():
    """Move all locally-stored uploads to S3 and re-point every reference."""
    from services import storage_service
    return await storage_service.migrate_local_to_s3()


async def partner_kyc_action(admin, user_id, action, reason=""):
    """Approve/Reject a partner's KYC by user_id (works whether or not a
    multi-step registration profile exists). Used by the unified Partners module."""
    from services import partner_reg_service as prs
    u = await db.users.find_one({"id": user_id, "role": "partner"}, {"_id": 0})
    if not u:
        raise HTTPException(404, "Partner not found")
    action = (action or "").lower()
    if action not in ("approve", "reject"):
        raise HTTPException(400, "Invalid action")
    if action == "reject" and not (reason or "").strip():
        raise HTTPException(400, "Rejection reason is required")
    prof = await db.partner_profiles.find_one({"user_id": user_id}, {"_id": 0, "id": 1})
    if prof:
        if action == "approve":
            return await prs.admin_approve_kyc(admin, prof["id"])
        return await prs.admin_reject_kyc(admin, prof["id"], reason)
    # no profile — operate directly on the user doc
    if action == "approve":
        await db.users.update_one({"id": user_id},
                                  {"$set": {"kyc_status": "approved", "verified_partner": True}})
    else:
        await db.users.update_one({"id": user_id},
                                  {"$set": {"kyc_status": "rejected", "verified_partner": False,
                                            "kyc_rejection_reason": reason.strip()}})
    try:
        from services import activity_service
        await activity_service.log("admin", admin.get("id"), admin.get("name"),
                                   f"partner.kyc.{'approved' if action == 'approve' else 'rejected'}",
                                   f"KYC {action} for {u.get('name')}",
                                   target_id=user_id, target_role="partner")
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "status": "approved" if action == "approve" else "rejected"}


async def list_users(role=None):
    q = {"role": role} if role else {}
    return await db.users.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


async def list_partners(tab="all", q="", date_from="", date_to="", category="",
                        partner_status="", kyc="", sort_by="created_at", premium=False):
    """Unified partner directory with tabs + advanced filters (Module: Partners).

    tabs: all | pending | approved | rejected | online | offline
    premium=True restricts to AzoApp Pro (premium_partner) members only.
    """
    query = {"role": "partner"}
    # AzoApp Pro (premium) partners only — used by the "Pro Partner" directory
    if premium in (True, "true", "1", 1):
        query["premium_partner"] = True
    tab = (tab or "all").lower()
    if tab in ("pending", "approved", "rejected"):
        # 'pending' covers users still awaiting review (pending or under_review)
        query["kyc_status"] = {"$in": ["pending", "under_review"]} if tab == "pending" else tab
    elif tab in ("online", "offline"):
        query["partner_status"] = tab
    # explicit extra filters (advanced)
    if kyc:
        query["kyc_status"] = {"$in": ["pending", "under_review"]} if kyc == "pending" else kyc
    if partner_status:
        query["partner_status"] = partner_status
    if category:
        query["skills"] = {"$in": [category]}
    if q:
        rx = {"$regex": q.strip(), "$options": "i"}
        query["$or"] = [{"name": rx}, {"phone": rx}, {"email": rx}, {"partner_code": rx}]
    if date_from or date_to:
        rng = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to + "T23:59:59"
        query["created_at"] = rng

    rows = await db.users.find(
        query,
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1, "city": 1, "state": 1,
         "skills": 1, "gender": 1, "rating": 1, "jobs_completed": 1, "partner_status": 1,
         "kyc_status": 1, "partner_code": 1, "photo": 1, "created_at": 1, "wallet_balance": 1,
         "referred_by_merchant": 1, "suspended": 1, "verified_partner": 1,
         "premium_partner": 1, "partner_badge": 1}
    ).sort(sort_by, -1).to_list(3000)

    # attach profile completion score + rejection reason where available
    prof = {p["user_id"]: p for p in await db.partner_profiles.find(
        {}, {"_id": 0, "user_id": 1, "completion_score": 1, "rejection_reason": 1, "id": 1}).to_list(5000)}
    for r in rows:
        p = prof.get(r["id"])
        r["profile_id"] = p.get("id") if p else None
        r["completion_score"] = (p.get("completion_score") if p else None)
        r["kyc_rejection_reason"] = (p.get("rejection_reason") if p else "") or r.get("kyc_rejection_reason", "")

    # counts for tab badges (respect q/date/category but ignore tab)
    base = {k: v for k, v in query.items() if k not in ("kyc_status", "partner_status")}
    async def _cnt(extra):
        return await db.users.count_documents({**base, **extra})
    counts = {
        "all": await _cnt({}),
        "pending": await _cnt({"kyc_status": {"$in": ["pending", "under_review"]}}),
        "approved": await _cnt({"kyc_status": "approved"}),
        "rejected": await _cnt({"kyc_status": "rejected"}),
        "online": await _cnt({"partner_status": "online"}),
        "offline": await _cnt({"partner_status": "offline"}),
    }
    return {"partners": rows, "counts": counts, "tab": tab}


async def list_merchants(tab="all", q="", date_from="", date_to="", category="", sort_by="created_at"):
    """Unified merchant directory with tabs + advanced filters.

    Mirrors list_partners so the admin list UI can be reused without redesign.
    tabs: all | pending | approved | rejected | verified | unverified
    """
    query = {"role": "merchant"}
    tab = (tab or "all").lower()
    if tab in ("pending", "approved", "rejected"):
        query["kyc_status"] = ({"$in": ["pending", "under_review", "submitted"]}
                               if tab == "pending" else tab)
    elif tab == "verified":
        query["verified_merchant"] = True
    elif tab == "unverified":
        query["verified_merchant"] = {"$ne": True}
    if category:
        query["merchant_categories"] = {"$in": [category]}
    if q:
        rx = {"$regex": q.strip(), "$options": "i"}
        query["$or"] = [{"name": rx}, {"phone": rx}, {"email": rx},
                        {"shop_name": rx}, {"merchant_code": rx}]
    if date_from or date_to:
        rng = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to + "T23:59:59"
        query["created_at"] = rng

    rows = await db.users.find(
        query,
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1, "city": 1, "state": 1,
         "shop_name": 1, "shop_type": 1, "merchant_categories": 1, "gender": 1,
         "rating": 1, "kyc_status": 1, "merchant_code": 1, "photo": 1,
         "created_at": 1, "wallet_balance": 1, "suspended": 1, "verified_merchant": 1}
    ).sort(sort_by, -1).to_list(3000)

    prof = {p["user_id"]: p for p in await db.merchant_profiles.find(
        {}, {"_id": 0, "user_id": 1, "completion_score": 1, "rejection_reason": 1, "id": 1}).to_list(5000)}
    for r in rows:
        p = prof.get(r["id"])
        r["profile_id"] = p.get("id") if p else None
        r["completion_score"] = (p.get("completion_score") if p else None)
        r["kyc_rejection_reason"] = (p.get("rejection_reason") if p else "") or ""

    base = {k: v for k, v in query.items() if k not in ("kyc_status", "verified_merchant")}
    async def _cnt(extra):
        return await db.users.count_documents({**base, **extra})
    counts = {
        "all": await _cnt({}),
        "pending": await _cnt({"kyc_status": {"$in": ["pending", "under_review", "submitted"]}}),
        "approved": await _cnt({"kyc_status": "approved"}),
        "rejected": await _cnt({"kyc_status": "rejected"}),
        "verified": await _cnt({"verified_merchant": True}),
        "unverified": await _cnt({"verified_merchant": {"$ne": True}}),
    }
    return {"merchants": rows, "counts": counts, "tab": tab}


async def merchant_kyc_action(admin, user_id, action, reason=""):
    """Approve/Reject a merchant's KYC by user_id (unified Merchants module)."""
    from services import merchant_reg_service as mrs
    u = await db.users.find_one({"id": user_id, "role": "merchant"}, {"_id": 0})
    if not u:
        raise HTTPException(404, "Merchant not found")
    action = (action or "").lower()
    if action not in ("approve", "reject"):
        raise HTTPException(400, "Invalid action")
    if action == "reject" and not (reason or "").strip():
        raise HTTPException(400, "Rejection reason is required")
    if action == "approve":
        return await mrs.admin_approve_kyc(admin, user_id)
    return await mrs.admin_reject_kyc(admin, user_id, reason)



# Fields shared by the partner directory and Area-Partner views (so the list UI
# can be reused without any redesign).
_PARTNER_PROJ = {
    "_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1, "city": 1, "state": 1,
    "skills": 1, "gender": 1, "rating": 1, "jobs_completed": 1, "partner_status": 1,
    "kyc_status": 1, "partner_code": 1, "photo": 1, "created_at": 1, "wallet_balance": 1,
    "referred_by_merchant": 1, "suspended": 1, "verified_partner": 1,
    "pincode": 1, "service_pincodes": 1, "service_area_name": 1, "skill_names": 1}


async def area_partners(city="", category=""):
    """Area Partner overview: city-wise + category-wise registered/active counts,
    a filtered partner list (same shape as the Partners directory so the row UI is
    reused), and dynamic summary. 'Active' = KYC approved and not suspended."""
    cats = await db.categories.find({}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "required_skill": 1}).to_list(500)
    cat_by_key = {}
    for c in cats:
        for k in (c.get("id"), c.get("slug"), c.get("required_skill")):
            if k:
                cat_by_key[str(k)] = c
                cat_by_key[_norm(str(k))] = c
        if c.get("name"):
            cat_by_key[_norm(c["name"])] = c

    def cat_of(skill):
        if skill is None:
            return None
        return cat_by_key.get(str(skill)) or cat_by_key.get(_norm(str(skill)))

    # ONLY cities that exist as admin Service Areas are shown — the Area Partner view
    # mirrors Services Config → Service Areas (no stray/dummy cities).
    zones = await db.service_areas.find({"status": {"$ne": "inactive"}},
                                        {"_id": 0, "id": 1, "name": 1, "city": 1, "pincodes": 1}).to_list(1000)
    zone_cities = {}
    for z in zones:
        zc = (z.get("city") or "").strip()
        if zc:
            zone_cities.setdefault(zc.lower(), zc)
    zone_pins = {str(pn).strip(): (z.get("city") or "").strip() for z in zones for pn in (z.get("pincodes") or []) if str(pn).strip()}

    query = {"role": "partner"}
    if city:
        query["city"] = {"$regex": f"^{re.escape(city)}$", "$options": "i"}
    if category:
        # the category filter value can be a category id/slug/name; partner skills store
        # skill codes (e.g. "ac"), so resolve to every possible key it may be stored as.
        cobj = cat_of(category)
        skill_keys = [category]
        if cobj:
            for k in (cobj.get("required_skill"), cobj.get("slug"), cobj.get("id"), cobj.get("name")):
                if k and k not in skill_keys:
                    skill_keys.append(k)
        query["skills"] = {"$in": skill_keys}

    rows = await db.users.find(query, _PARTNER_PROJ).sort("created_at", -1).to_list(3000)
    # Resolve each partner's Service-Area city (by city name, else by any serviceable /
    # own pincode that belongs to a zone) and keep only partners inside a zone.
    kept = []
    for r in rows:
        rc = (r.get("city") or "").strip()
        zc = zone_cities.get(rc.lower()) if rc else None
        if not zc:
            for pn in list(r.get("service_pincodes") or []) + ([r.get("pincode")] if r.get("pincode") else []):
                zc = zone_pins.get(str(pn).strip())
                if zc:
                    break
        if not zc:
            continue
        r["city"] = zc
        r["has_service_area"] = True
        kept.append(r)
    rows = kept
    prof = {p["user_id"]: p for p in await db.partner_profiles.find(
        {}, {"_id": 0, "user_id": 1, "completion_score": 1, "rejection_reason": 1, "id": 1}).to_list(5000)}
    for r in rows:
        p = prof.get(r["id"])
        r["profile_id"] = p.get("id") if p else None
        r["completion_score"] = (p.get("completion_score") if p else None)

    def is_active(r):
        return r.get("kyc_status") == "approved" and not r.get("suspended")

    matrix = {}
    cities_seen, cats_seen = set(), set()
    for r in rows:
        rc = ((r.get("city") or "").strip()) or "Unknown"
        cities_seen.add(rc)
        seen, matched = set(), False
        for sk in (r.get("skills") or []):
            c = cat_of(sk)
            name = (c["name"] if c else str(sk)).strip()
            if not name:
                continue
            if category:
                # only tally the category being filtered
                if not (c and (c.get("id") == category or c.get("slug") == category or c.get("required_skill") == category)) and _norm(name) != _norm(category):
                    continue
            if name in seen:
                continue
            seen.add(name)
            matched = True
            cats_seen.add(name)
            m = matrix.setdefault((rc, name), {"city": rc, "category": name, "registered": 0, "active": 0})
            m["registered"] += 1
            if is_active(r):
                m["active"] += 1
        if not matched and not category:
            name = "Unassigned"
            cats_seen.add(name)
            m = matrix.setdefault((rc, name), {"city": rc, "category": name, "registered": 0, "active": 0})
            m["registered"] += 1
            if is_active(r):
                m["active"] += 1

    matrix_list = sorted(matrix.values(), key=lambda x: (x["city"], x["category"]))
    summary = {
        "registered": len(rows),
        "active": sum(1 for r in rows if is_active(r)),
        "cities": len(cities_seen),
        "categories": len(cats_seen),
    }
    all_categories = [{"id": c["id"], "name": c["name"]} for c in sorted(cats, key=lambda x: x.get("name", ""))]

    for m in matrix_list:
        m["has_service_area"] = True
    summary["cities"] = len({m["city"] for m in matrix_list}) if matrix_list else 0
    summary["service_area_cities"] = sorted(zone_cities.values())
    summary["cities_without_service_area"] = []
    # filter options mirror the Service Areas exactly
    all_cities = sorted(zone_cities.values())

    return {"summary": summary, "matrix": matrix_list, "partners": rows,
            "service_areas": [{"id": z.get("id"), "name": z.get("name"), "city": z.get("city"),
                               "pincodes": z.get("pincodes") or []} for z in zones],
            "filter_options": {"cities": all_cities, "categories": all_categories}}


async def approve_kyc(user_id, status, reason="", admin=None):
    upd = {"kyc_status": status}
    unset = {}
    if status == "rejected":
        upd["kyc_rejection_reason"] = (reason or "").strip()
    else:
        unset["kyc_rejection_reason"] = ""
    ops = {"$set": upd}
    if unset:
        ops["$unset"] = unset
    await db.users.update_one({"id": user_id}, ops)
    u = await db.users.find_one({"id": user_id}, {"_id": 0})
    if u and u["role"] == "partner":
        if status == "approved":
            try:
                from services.partner_sync import sync_partner
                await sync_partner(user_id)
            except Exception:  # noqa: BLE001
                pass
        await db.merchant_partner_referrals.update_one(
            {"partner_phone": u["phone"]},
            {"$set": {"status": "active" if status == "approved" else "pending_kyc"}})
        try:
            from services import activity_service
            aid = (admin or {}).get("id"); aname = (admin or {}).get("name") or "Admin"
            det = f"KYC {status} for {u.get('name')}" + (f": {reason}" if status == "rejected" and reason else "")
            await activity_service.log("admin", aid, aname, f"partner.kyc.{status}", det,
                                       target_id=user_id, target_role="partner")
        except Exception:  # noqa: BLE001
            pass
    return u


async def all_bookings(status=None):
    q = {"status": status} if status else {}
    return await db.bookings.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


async def _merchant_public(mid):
    """Minimal, safe merchant profile for the booking detail view."""
    if not mid:
        return None
    m = await db.users.find_one(
        {"id": mid},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1, "photo": 1,
         "shop_name": 1, "shop_type": 1, "company_name": 1, "gst_number": 1,
         "city": 1, "state": 1, "kyc_status": 1, "verified_merchant": 1, "created_at": 1})
    return m


async def booking_detail(booking_id):
    """Rich, admin-facing booking detail: full booking + accepted partner (with
    experience/skills), any merchant involvement (referral + customer channel),
    refunds, and a computed commission breakdown (who gets how much)."""
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    settings = await get_settings()

    # ---- Partner enrichment (accepted / assigned professional) ----
    partner = None
    if b.get("partner_id"):
        pu = await db.users.find_one(
            {"id": b["partner_id"]},
            {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1, "photo": 1,
             "rating": 1, "jobs_completed": 1, "total_jobs": 1, "skills": 1,
             "partner_code": 1, "partner_status": 1, "kyc_status": 1, "city": 1,
             "state": 1, "referred_by_merchant": 1, "created_at": 1})
        if pu:
            prof = await db.partner_profiles.find_one({"user_id": b["partner_id"]}, {"_id": 0}) or {}
            pu["experience_years"] = prof.get("experience_years") or prof.get("experience") or pu.get("experience")
            pu["bio"] = prof.get("bio") or prof.get("about")
            # skills catalog names (fallback to raw skill codes)
            pu["skills"] = pu.get("skills") or prof.get("skills") or []
            partner = pu

    # ---- Merchant involvement ----
    referral_merchant_id = (partner or {}).get("referred_by_merchant")   # onboarded the partner
    customer_merchant_id = b.get("merchant_id")                          # customer booked via merchant
    referral_merchant = await _merchant_public(referral_merchant_id)
    customer_merchant = await _merchant_public(customer_merchant_id)

    # ---- Refunds tied to this booking ----
    refunds = await db.refunds.find(
        {"$or": [{"booking_id": b["id"]}, {"booking_code": b.get("code")}]},
        {"_id": 0}).sort("created_at", -1).to_list(50) if "refunds" in await db.list_collection_names() else []

    # ---- Commission breakdown (single source of truth: CommissionEngine + _compute_cancellation) ----
    from services.engines import CommissionEngine
    from controllers.booking_controller import _compute_cancellation
    cm = CommissionEngine._cm(b.get("commission_config") or settings)
    pricing = b.get("pricing") or {}
    total = money.money(pricing.get("total") or 0)
    gst_amt = money.money(pricing.get("gst") or pricing.get("tax") or 0)
    from services.engines import PricingEngine
    taxable_amount = PricingEngine.paid_excl_tax(pricing)
    disc_total = money.money(pricing.get("total_discount") if pricing.get("total_discount") is not None
                             else money.add(*[pricing.get(k) or 0 for k in
                                              ("discount", "membership_discount", "membership_visit_waiver",
                                               "loyalty_discount", "referral_discount")]))
    gross_charges = money.add(taxable_amount, disc_total)
    _known = money.add(*[pricing.get(k) or 0 for k in ("base", "addons_total", "emergency_fee", "surge",
                                                       "visiting_charge", "convenience_fee", "platform_fee")])
    bill = {
        "service_amount": money.money(pricing.get("base") or 0),
        # legacy records may carry a total not explained by the itemised charges
        "other_charges": max(0.0, money.add(gross_charges, -_known)),
        "addons_total": money.money(pricing.get("addons_total") or 0),
        "emergency_fee": money.money(pricing.get("emergency_fee") or 0),
        "surge": money.money(pricing.get("surge") or 0),
        "visiting_charge": money.money(pricing.get("visiting_charge") or 0),
        "convenience_fee": money.money(pricing.get("convenience_fee") or 0),
        "platform_fee": money.money(pricing.get("platform_fee") or 0),
        "gross_charges": gross_charges,
        "discounts": {k: money.money(pricing.get(k) or 0) for k in
                      ("discount", "membership_discount", "membership_visit_waiver", "loyalty_discount", "referral_discount")
                      if money.money(pricing.get(k) or 0) > 0},
        "total_discount": disc_total, "taxable": taxable_amount,
        "gst_pct": float(pricing.get("gst_pct") if pricing.get("gst_pct") is not None else settings.get("gst_pct", 0) or 0),
        "gst": gst_amt, "total": total, "coupon_code": b.get("coupon_code"),
    }
    cur = settings.get("currency", "INR")
    status = (b.get("status") or "").lower()
    is_cancelled = status == "cancelled"
    settled = status in ("completed", "paid")
    brand = settings.get("brand", "Platform")
    mref_name = (referral_merchant or {}).get("shop_name") or (referral_merchant or {}).get("name")
    mcust_name = (customer_merchant or {}).get("shop_name") or (customer_merchant or {}).get("name")

    def _rows(split, base, partner_note, eligible_partner):
        rates = split["rates"]
        return [
            {"role": "partner", "name": (partner or {}).get("name") or b.get("partner_name") or "Not assigned",
             "pct": rates["partner_pct"], "amount": split["partner_earning"], "eligible": eligible_partner,
             "note": partner_note},
            {"role": "platform", "name": brand,
             "pct": money.money(split["platform_earning"] / base * 100) if base else rates["platform_pct"],
             "amount": split["platform_earning"], "eligible": True,
             "note": f"Platform receives {rates['platform_pct']:g}%" + (
                 " + un-referred merchant shares" if not (split["referral_merchant_id"] and split["customer_merchant_id"]) else "")},
            {"role": "merchant_referral", "name": mref_name or "—",
             "pct": rates["merchant_partner_referral_pct"], "amount": split["merchant_referral"],
             "eligible": bool(split["referral_merchant_id"]),
             "note": "Merchant who onboarded the partner" if split["referral_merchant_id"] else "Partner is direct — share stays with platform"},
            {"role": "merchant_customer", "name": mcust_name or "—",
             "pct": rates["merchant_customer_pct"], "amount": split["merchant_customer"],
             "eligible": bool(split["customer_merchant_id"]),
             "note": "Merchant through whom the customer booked" if split["customer_merchant_id"] else "Customer is direct — share stays with platform"},
        ]

    if is_cancelled:
        canc = b.get("cancellation") or {}
        if canc.get("cancel_charge") is None:
            # legacy record → project with the live rule
            canc = _compute_cancellation(b, settings, partner)
        base_c = money.money(canc.get("cancel_charge") or 0)
        split = {
            "base": base_c, "partner_earning": money.money(canc.get("partner_cut") or 0),
            "platform_gross": money.money(canc.get("platform_gross") if canc.get("platform_gross") is not None
                                          else money.add(base_c, -(canc.get("partner_cut") or 0))),
            "platform_earning": money.money(canc.get("admin_cut") or 0),
            "merchant_referral": money.money(canc.get("merchant_partner_comm") or 0),
            "referral_merchant_id": canc.get("merchant_partner_id"),
            "merchant_customer": money.money(canc.get("merchant_customer_comm") or 0),
            "customer_merchant_id": canc.get("merchant_customer_id"),
            "rates": {"partner_pct": float(canc.get("partner_split_pct", canc.get("partner_pct", cm.get("partner_pct", 60)))),
                      "platform_pct": float(canc.get("platform_pct", cm.get("platform_pct", 32))),
                      "merchant_partner_referral_pct": float(canc.get("merchant_partner_pct", cm.get("merchant_partner_referral_pct", 5))),
                      "merchant_customer_pct": float(canc.get("merchant_customer_pct", cm.get("merchant_customer_pct", 3)))},
        }
        partner_was_assigned = bool(canc.get("partner_was_assigned"))
        cust_amt = money.money(canc.get("refund") or 0)
        original_amount = money.money(canc.get("original_amount") or total)
        gst_c = money.money(canc.get("tax") if canc.get("tax") is not None else gst_amt)
        gst_refund = money.money(canc.get("gst_refund") or 0)
        gst_retained = money.money(canc.get("gst_retained") if canc.get("gst_retained") is not None
                                   else money.add(gst_c, -gst_refund))
        rows = [{"role": "customer", "name": b.get("customer_name"), "pct": float(canc.get("refund_pct") or 0),
                 "amount": cust_amt, "eligible": True,
                 "note": "Refunded to customer (service share + proportional tax)"}]
        rows += _rows(split, base_c,
                      "Partner cancellation compensation" if partner_was_assigned else "No partner assigned — no charge",
                      partner_was_assigned)
        commission = {"kind": "cancellation", "currency": cur, "settled": True, "rows": rows, "bill": bill,
                      "base": base_c, "total": total, "original_amount": original_amount,
                      "service_amount": money.money(canc.get("service_amount") or 0), "tax": gst_c,
                      "taxable": taxable_amount, "gst": gst_amt,
                      "partner_was_assigned": partner_was_assigned,
                      "customer_refund_pct": float(canc.get("refund_pct") or 0), "customer_refund": cust_amt,
                      "service_refund": money.money(canc.get("service_refund") or 0), "gst_refund": gst_refund,
                      "partner_cancellation_pct": float(canc.get("partner_cancellation_pct") or 0),
                      "partner_cancellation_amount": base_c, "gst_retained": gst_retained,
                      "retained_amount": money.add(base_c, gst_retained),
                      "partner_net": split["partner_earning"], "platform_gross": split["platform_gross"],
                      "platform_commission": split["platform_earning"],
                      "merchant_partner_pct": split["rates"]["merchant_partner_referral_pct"],
                      "merchant_partner_comm": split["merchant_referral"], "merchant_partner_name": mref_name,
                      "merchant_customer_pct": split["rates"]["merchant_customer_pct"],
                      "merchant_customer_comm": split["merchant_customer"], "merchant_customer_name": mcust_name,
                      "total_merchant_comm": money.add(split["merchant_referral"], split["merchant_customer"]),
                      "total_adjustment": money.add(original_amount, -cust_amt),
                      "item_refunds": canc.get("item_refunds") or [], "rates": split["rates"]}
    else:
        split = CommissionEngine.compute_split(b, settings, partner)
        rows = _rows(split, split["base"], "Service professional earning", bool(b.get("partner_id")))
        commission = {"kind": "completion", "currency": cur, "settled": settled, "rows": rows, "bill": bill,
                      "base": split["base"], "total": total, "original_amount": total, "gst": gst_amt,
                      "taxable": taxable_amount, "service_amount": bill["service_amount"],
                      "addons_total": bill["addons_total"], "surge": bill["surge"],
                      "visiting_charge": bill["visiting_charge"], "convenience_fee": bill["convenience_fee"],
                      "platform_fee": bill["platform_fee"],
                      "partner_earning": split["partner_earning"], "platform_gross": split["platform_gross"],
                      "platform_earning": split["platform_earning"],
                      "merchant_referral": split["merchant_referral"], "merchant_customer": split["merchant_customer"],
                      "merchant_partner_name": mref_name, "merchant_customer_name": mcust_name,
                      "distributed": split["distributed"], "rates": split["rates"]}

    return {
        "booking": b,
        "partner": partner,
        "referral_merchant": referral_merchant,
        "customer_merchant": customer_merchant,
        "refunds": refunds,
        "commission": commission,
    }


VALID_BOOKING_STATUSES = {
    "searching", "assigned", "arrived_shop", "arrived_customer", "started",
    "completed", "paid", "cancelled", "on_hold",
}


async def update_booking_status(booking_id, status):
    if status not in VALID_BOOKING_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    timeline = b.get("timeline", [])
    timeline.append({"status": status, "at": now_iso(), "by": "admin"})
    upd = {"status": status, "timeline": timeline, "updated_at": now_iso()}
    if status == "paid":
        upd["payment_status"] = "paid"
    await db.bookings.update_one({"id": booking_id}, {"$set": upd})
    return await db.bookings.find_one({"id": booking_id}, {"_id": 0})


async def reschedule_booking(booking_id, scheduled_at):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    timeline = b.get("timeline", [])
    timeline.append({"status": "rescheduled", "at": now_iso(), "by": "admin", "to": scheduled_at})
    await db.bookings.update_one({"id": booking_id}, {"$set": {
        "schedule_type": "scheduled", "scheduled_at": scheduled_at,
        "timeline": timeline, "updated_at": now_iso(),
    }})
    # notify the customer about the new slot
    try:
        when = scheduled_at.replace("T", " ")
        await db.notifications.insert_one({"id": new_id(), "user_id": b.get("customer_id"), "audience": "user",
                                           "title": "Booking rescheduled",
                                           "body": f"Your {b.get('service_name')} booking {b.get('code')} is rescheduled to {when}.",
                                           "created_at": now_iso()})
    except Exception:
        pass
    return await db.bookings.find_one({"id": booking_id}, {"_id": 0})


# ---------- Job Requests (admin live booking requests + manual assign) ----------
async def job_requests(status: str = None):
    """Live customer work-requests for the Job Requests console."""
    if status in (None, "", "all"):
        q = {}
    elif status == "awaiting":
        q = {"status": "searching"}
    elif status == "assigned":
        q = {"partner_id": {"$ne": None},
             "status": {"$in": ["assigned", "arrived_shop", "arrived_customer", "started"]}}
    elif status == "completed":
        q = {"status": {"$in": ["completed", "paid"]}}
    elif status == "cancelled":
        q = {"status": "cancelled"}
    else:
        q = {"status": status}
    rows = await db.bookings.find(q, {"_id": 0, "otps": 0}).sort("created_at", -1).to_list(500)
    out = []
    for b in rows:
        addr = b.get("address") or {}
        out.append({
            "id": b["id"], "code": b.get("code"),
            "service_name": b.get("service_name"), "tier_label": b.get("tier_label"),
            "category_id": b.get("category_id"), "category_name": b.get("category_name"),
            "customer_name": b.get("customer_name"), "customer_phone": b.get("customer_phone"),
            "city": addr.get("city") or addr.get("pincode") or "",
            "schedule_type": b.get("schedule_type"), "scheduled_at": b.get("scheduled_at"),
            "status": b.get("status"), "partner_id": b.get("partner_id"),
            "partner_name": b.get("partner_name"),
            "total": (b.get("pricing") or {}).get("total", 0),
            "eligible_count": len(b.get("eligible_partner_ids") or []),
            "created_at": b.get("created_at"),
        })
    return out


async def job_request_detail(booking_id):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0, "otps": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    return b


async def _busy_eta_map(active_rows):
    """For partners on an active job: when are they expected to be free?
    finish = (started_at | scheduled_at | assigned time) + service duration_min
    (+ items' durations for multi-service). Returns {partner_id: {busy_until,
    busy_free_in_min, busy_job_code, busy_job_service, busy_job_status}} — using the
    LATEST-ending job when a partner has several."""
    from datetime import datetime, timezone, timedelta
    if not active_rows:
        return {}
    svc_ids = list({r.get("service_id") for r in active_rows if r.get("service_id")})
    for r in active_rows:
        for it in (r.get("items") or []):
            if it.get("service_id"):
                svc_ids.append(it["service_id"])
    svcs = await db.services.find({"id": {"$in": svc_ids}}, {"_id": 0, "id": 1, "duration_min": 1}).to_list(1000)
    dur = {s["id"]: int(s.get("duration_min") or 60) for s in svcs}
    now = datetime.now(timezone.utc)

    def _parse(v):
        try:
            d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except Exception:  # noqa: BLE001
            return None
    out = {}
    for r in active_rows:
        pid = r.get("partner_id")
        total_min = dur.get(r.get("service_id"), 60)
        if r.get("items"):
            total_min = sum(dur.get(it.get("service_id"), 60) for it in r["items"]) or total_min
        start = None
        if r.get("status") == "started":
            start = _parse(r.get("started_at"))
            if not start:
                tl = [t for t in (r.get("timeline") or []) if t.get("status") == "started"]
                start = _parse(tl[-1]["at"]) if tl else None
        if not start:
            sched = _parse(r.get("scheduled_at"))
            # a scheduled job in the future frees the partner after schedule + duration;
            # an overdue/unscheduled one is assumed to be underway from now.
            start = sched if (sched and sched > now) else None
        if not start:
            start = now
        # add ~20 min travel buffer when the partner has not reached the customer yet
        buffer_min = 0 if r.get("status") == "started" else 20
        finish = start + timedelta(minutes=total_min + buffer_min)
        free_in = max(1, int((finish - now).total_seconds() // 60))
        cur = out.get(pid)
        if not cur or finish > _parse(cur["busy_until"]):
            out[pid] = {"busy_until": finish.isoformat(), "busy_free_in_min": free_in,
                        "busy_job_code": r.get("code"), "busy_job_service": r.get("service_name"),
                        "busy_job_status": r.get("status")}
    return out


async def booking_eligible_partners(booking_id, include_offline: bool = False):
    """For admin (re)assignment: return online, active, KYC-approved partners who
    (a) belong to the booking's work category (service.required_skill) AND
    (b) serve the SAME AREA the customer booked from — the customer's pincode must be
        in the partner's service_pincodes (fallback: partner's own pincode / city when
        no pincodes are configured). Partners from other areas are never listed.
    Sorted nearest-first (live GPS distance) with ETA so admin picks the fastest pro."""
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    from services.engines import MatchingEngine
    from services.partner_sync import skill_alias_map, skill_matches, active_zones, zone_for, partner_serves
    amap = await skill_alias_map()
    zones = await active_zones()
    svc = await db.services.find_one({"id": b.get("service_id")}, {"_id": 0}) or {}
    if not svc and b.get("service_name"):
        svc = await db.services.find_one({"name": b.get("service_name")}, {"_id": 0}) or {}
    skill = (svc.get("required_skill") or "").lower()
    cat_name = svc.get("category_name") or b.get("category_name")
    if not skill:
        # fall back to the category (by id / name) or infer from the service name
        cats = await db.categories.find({}, {"_id": 0, "id": 1, "name": 1, "required_skill": 1}).to_list(100)
        cat = next((c for c in cats if c.get("id") == (svc.get("category_id") or b.get("category_id"))), None) \
            or next((c for c in cats if cat_name and c.get("name") == cat_name), None)
        if not cat:
            sname = (b.get("service_name") or "").lower()
            for c in cats:
                tokens = [t for t in (c.get("name") or "").lower().replace("&", " ").split() if len(t) > 2 and t not in ("repair", "service", "home")]
                if any(t in sname for t in tokens) or (c.get("required_skill") or "") in sname:
                    cat = c
                    break
        if cat:
            skill = (cat.get("required_skill") or "").lower()
            cat_name = cat_name or cat.get("name")
    addr = b.get("address") or {}
    if not addr.get("pincode") and not addr.get("city"):
        # no address on the booking (legacy / merchant rows): use the customer's saved
        # address, else the merchant's shop address, so the area gate still applies.
        for uid in (b.get("customer_id"), b.get("user_id"), b.get("merchant_id")):
            if not uid:
                continue
            u = await db.users.find_one({"$or": [{"id": uid}, {"phone": uid}, {"phone": f"+91{uid}"}]},
                                        {"_id": 0, "addresses": 1, "address": 1, "pincode": 1, "city": 1, "state": 1})
            if not u:
                continue
            cand = (u.get("addresses") or [None])[0] or u.get("address") or \
                ({"pincode": u.get("pincode"), "city": u.get("city"), "state": u.get("state")} if (u.get("pincode") or u.get("city")) else None)
            if cand and (cand.get("pincode") or cand.get("city")):
                addr = cand
                break
    cust_pin = str(addr.get("pincode") or "").strip()
    cust_city = str(addr.get("city") or "").strip().lower()
    cust_coords = MatchingEngine._coords(addr)
    already = set(b.get("eligible_partner_ids") or [])
    q = {"role": "partner", "kyc_status": "approved", "status": "active", "suspended": {"$ne": True}}
    if not include_offline:
        q["partner_status"] = "online"
    partners = await db.users.find(
        q,
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "rating": 1, "jobs_completed": 1,
         "total_jobs": 1, "skills": 1, "partner_status": 1, "kyc_status": 1,
         "city": 1, "state": 1, "pincode": 1, "service_pincodes": 1,
         "live_location": 1, "location": 1, "address": 1, "last_seen_at": 1,
         "live_location_at": 1}
    ).to_list(500)
    # partners currently on an active job are shown but flagged busy — with an ETA of
    # when they are expected to be free (job start/schedule + service duration).
    busy_rows = await db.bookings.find(
        {"status": {"$in": ["assigned", "arrived_shop", "arrived_customer", "started"]},
         "partner_id": {"$ne": None}},
        {"_id": 0, "partner_id": 1, "code": 1, "service_id": 1, "service_name": 1, "status": 1,
         "scheduled_at": 1, "started_at": 1, "timeline": 1, "updated_at": 1, "items": 1}).to_list(2000)
    busy_ids = {r["partner_id"] for r in busy_rows}
    busy_info = await _busy_eta_map(busy_rows)
    # NEARBY radius (km): admin business_config.nearby_assign_radius_km, else max_distance_km, else 15
    settings = await get_settings()
    bcfg = settings.get("business_config") or {}
    try:
        nearby_km = float(bcfg.get("nearby_assign_radius_km") or bcfg.get("max_distance_km") or 15)
    except (TypeError, ValueError):
        nearby_km = 15.0
    if bcfg.get("max_distance_km") and not bcfg.get("nearby_assign_radius_km") and str(bcfg.get("distance_unit", "km")).startswith("mile"):
        nearby_km *= 1.60934
    out, nearby = [], []
    try:
        limit_km = float(bcfg.get("max_distance_km") or 15)
    except (TypeError, ValueError):
        limit_km = 15.0
    cust_zone = zone_for(zones, cust_pin or None, cust_coords, addr.get("city")) if (cust_pin or cust_coords or cust_city) else None
    for p in partners:
        # CATEGORY GATE (alias-aware): skill key OR category name/slug as stored
        if skill and not skill_matches(p.get("skills") or [], skill, amap):
            continue
        p_pins = [str(x).strip() for x in (p.get("service_pincodes") or []) if str(x).strip()]
        p_city = str(p.get("city") or "").strip().lower()
        dist_km = eta_min = None
        p_coords = MatchingEngine._coords(p)
        if cust_coords and p_coords:
            dist_km = round(MatchingEngine._haversine_km(cust_coords, p_coords), 1)
            eta_min = max(3, round((dist_km / 25.0) * 60))
        # AREA GATE — same realistic rules as live dispatch (pincode → Service Area
        # zone → GPS for partners without pincodes → city). Admin can see partners
        # up to the larger of max-distance / nearby radius; farther ones are hidden.
        in_area, _d, area_reason = partner_serves(p, addr, max(limit_km, nearby_km), zones, cust_zone)
        if in_area and dist_km is not None and dist_km > limit_km:
            in_area = False   # serves the pincode but is too far right now → nearby bucket
        if not (cust_pin or cust_coords or cust_city):
            in_area = True    # booking has no address at all → cannot gate by area
        # NEARBY FALLBACK: same category, outside the customer's area, but reachable —
        # within the nearby radius by live GPS, or (no GPS) same city as the customer.
        is_nearby = False
        if not in_area:
            if dist_km is not None:
                is_nearby = dist_km <= nearby_km
            elif cust_city and p_city:
                is_nearby = p_city == cust_city
            if not is_nearby:
                continue
        row = {
            "id": p["id"], "name": p.get("name"), "phone": p.get("phone"),
            "rating": p.get("rating", 5),
            "jobs_completed": p.get("jobs_completed", p.get("total_jobs", 0)),
            "partner_status": p.get("partner_status") or "offline",
            "kyc_status": p.get("kyc_status"),
            "city": p.get("city"), "state": p.get("state"),
            "service_pincodes": p_pins,
            "distance_km": dist_km, "eta_min": eta_min,
            "busy": p["id"] in busy_ids and p["id"] != b.get("partner_id"),
            **(busy_info.get(p["id"]) or {}),
            "offline": (p.get("partner_status") or "offline") != "online",
            "last_seen_at": p.get("live_location_at") or p.get("last_seen_at"),
            "nearby": is_nearby,
            "area_match": None if is_nearby else area_reason,
            "in_pool": p["id"] in already,
            "is_current": p["id"] == b.get("partner_id"),
        }
        (nearby if is_nearby else out).append(row)
    # current partner first, then online before offline, free before busy, then nearest / best-rated
    def _key(x):
        return (not x["is_current"], x["offline"], x["busy"],
                x["distance_km"] if x["distance_km"] is not None else 1e9,
                -(x.get("rating") or 0), -(x.get("jobs_completed") or 0))
    out.sort(key=_key)
    nearby.sort(key=_key)
    free_in_area = sum(1 for x in out if not x["busy"] and not x["offline"])
    return {"booking_id": booking_id, "partners": out, "nearby_partners": nearby,
            "nearby_radius_km": round(nearby_km, 1), "free_in_area": free_in_area,
            "include_offline": bool(include_offline),
            "category": cat_name, "skill": skill,
            "area": {"pincode": cust_pin or None, "city": addr.get("city"), "state": addr.get("state")},
            "area_known": bool(cust_pin or cust_city),
            "category_known": bool(skill)}


async def assign_booking(booking_id, partner_id, admin=None):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    if b.get("status") in ("completed", "paid", "cancelled"):
        raise HTTPException(status_code=400, detail="Cannot assign a completed or cancelled booking")
    p = await db.users.find_one({"id": partner_id, "role": "partner"}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Partner not found")
    if p.get("kyc_status") != "approved":
        raise HTTPException(status_code=400, detail="Partner KYC is not approved")
    if p.get("suspended"):
        raise HTTPException(status_code=400, detail="Partner is suspended")
    timeline = b.get("timeline", [])
    timeline.append({"status": "assigned", "at": now_iso(), "by": "admin",
                     "note": "Manually assigned by admin"})
    await db.bookings.update_one({"id": booking_id}, {
        "$set": {"partner_id": partner_id, "partner_name": p.get("name"),
                 "status": "assigned", "timeline": timeline, "updated_at": now_iso()},
        "$addToSet": {"eligible_partner_ids": partner_id},
    })
    code = b.get("code")
    svc_name = b.get("service_name")
    area = (b.get("address") or {}).get("city") or (b.get("address") or {}).get("pincode") or "your area"
    title = "New job assigned"
    body = f"{svc_name} near {area} · {code} has been assigned to you by admin. Open Jobs to view."
    # in-app
    await db.notifications.insert_one({"id": new_id(), "user_id": partner_id, "audience": "user",
                                       "title": title, "body": body, "created_at": now_iso()})
    # SMS (best-effort — only sends when SMS integration is active)
    if p.get("phone"):
        try:
            from services.sms_service import send_text_sms
            await send_text_sms(p["phone"], f"AzoApp: {title}. {body}")
        except Exception:
            pass
    # Email (best-effort — only sends when SMTP is configured)
    if p.get("email"):
        try:
            from services.email_service import send_email, build_email_html
            html = build_email_html(f"<p>Hi {p.get('name', 'Partner')},</p><p>{body}</p>", subject=title)
            await send_email(p["email"], title, html, body)
        except Exception:
            pass
    # notify customer
    try:
        await db.notifications.insert_one({"id": new_id(), "user_id": b.get("customer_id"),
                                           "audience": "user", "title": "Partner assigned",
                                           "body": f"{p.get('name')} has been assigned to your booking {code}.",
                                           "created_at": now_iso()})
    except Exception:
        pass
    # audit
    try:
        await db.audit_logs.insert_one({"id": new_id(), "action": "booking.assign",
                                        "booking_id": booking_id, "partner_id": partner_id,
                                        "by": (admin or {}).get("id"), "at": now_iso()})
    except Exception:
        pass
    return await db.bookings.find_one({"id": booking_id}, {"_id": 0, "otps": 0})


async def _count(coll):
    try:
        return await db[coll].count_documents({})
    except Exception:
        return 0


async def seo_dashboard():
    """Full SEO audit for the marketplace: coverage %, health score, concrete
    issues to fix, and an action checklist to rank higher (nation-wide)."""
    from services.seo_service import site_base, sitemap_url

    def _flags(doc):
        seo = doc.get("seo") or {}
        return {
            "title": bool((seo.get("title") or "").strip()),
            "description": bool((seo.get("description") or "").strip()),
            "keywords": bool((seo.get("keywords") or "").strip()),
            "slug": bool((doc.get("slug") or "").strip()),
        }

    cats = await db.categories.find({"status": "active"}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "seo": 1}).to_list(2000)
    subs = await db.subcategories.find({"status": "active"}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "seo": 1}).to_list(3000)
    svcs = await db.services.find(
        {"status": "active", "approval_status": {"$ne": "disapproved"}},
        {"_id": 0, "id": 1, "name": 1, "slug": 1, "seo": 1, "description": 1, "short_description": 1, "gallery": 1, "image": 1}
    ).to_list(5000)

    coverage = {}
    issues = []
    total_fields = 0
    done_fields = 0
    for kind, docs in (("category", cats), ("subcategory", subs), ("service", svcs)):
        agg = {"title": 0, "description": 0, "keywords": 0, "slug": 0}
        for d in docs:
            f = _flags(d)
            for k in agg:
                agg[k] += 1 if f[k] else 0
            total_fields += 4
            done_fields += sum(1 for v in f.values() if v)
            missing = [k for k, ok in f.items() if not ok]
            if kind == "service":
                if not (d.get("gallery") or d.get("image")):
                    missing.append("image")
                if not ((d.get("description") or d.get("short_description") or "").strip()):
                    missing.append("content")
            if missing:
                issues.append({"type": kind, "id": d.get("id"), "name": d.get("name") or "—", "missing": missing})
        n = len(docs) or 1
        coverage[kind] = {
            "total": len(docs),
            "title_pct": round(agg["title"] * 100 / n),
            "description_pct": round(agg["description"] * 100 / n),
            "keywords_pct": round(agg["keywords"] * 100 / n),
            "slug_pct": round(agg["slug"] * 100 / n),
        }

    settings = await get_settings()
    g = settings.get("seo", {}) or {}
    global_seo = {
        "site_title": bool((g.get("site_title") or "").strip()),
        "meta_description": bool((g.get("meta_description") or "").strip()),
        "meta_keywords": bool((g.get("meta_keywords") or "").strip()),
        "og_image": bool((g.get("og_image") or "").strip()),
    }
    global_done = sum(1 for v in global_seo.values() if v)

    schema_count = await _count("schema_markup")
    redirects_count = await _count("redirects")

    # sitemap + last ping
    try:
        from routes.site_routes import _build_sitemap_urls
        urls = await _build_sitemap_urls()
        total_urls = len(urls)
    except Exception:
        total_urls = 0
    ping = await db.settings.find_one({"id": "seo_ping"}, {"_id": 0}) or {}

    field_score = (done_fields / total_fields) if total_fields else 0
    global_score = global_done / 4
    has_schema = 1 if schema_count > 0 else 0
    has_sitemap = 1 if total_urls > 0 else 0
    pinged = 1 if ping.get("last_ping") else 0
    score = round((0.5 * field_score + 0.2 * global_score + 0.1 * has_schema
                   + 0.1 * has_sitemap + 0.1 * pinged) * 100)

    recommendations = [
        {"key": "meta_all", "title": "Add meta title, description & keywords to every service & category",
         "done": field_score >= 0.99,
         "detail": f"{done_fields}/{total_fields} SEO fields filled across catalog."},
        {"key": "global", "title": "Complete site-wide SEO (title, description, keywords, OG image)",
         "done": global_done == 4, "detail": f"{global_done}/4 global fields set."},
        {"key": "schema", "title": "Publish structured data / JSON-LD (Organization + LocalBusiness)",
         "done": has_schema == 1, "detail": f"{schema_count} schema block(s) configured. Auto Service/Category JSON-LD is already emitted."},
        {"key": "sitemap", "title": "Keep sitemap.xml complete & submit to Google Search Console",
         "done": has_sitemap == 1, "detail": f"{total_urls} canonical URLs in sitemap.xml (auto-updated)."},
        {"key": "ping", "title": "Ping Google & Bing after catalog changes (auto-ping enabled)",
         "done": pinged == 1, "detail": ("Last pinged: " + ping.get("last_ping", "")) if pinged else "Not pinged yet — auto-pings on catalog changes."},
        {"key": "images", "title": "Add images to every service (rich results & better CTR)",
         "done": not any("image" in i["missing"] for i in issues), "detail": "Services without images hurt image-search visibility."},
        {"key": "content", "title": "Write unique, keyword-rich descriptions for each service",
         "done": not any("content" in i["missing"] for i in issues), "detail": "Thin content ranks poorly."},
        {"key": "local", "title": "Create city/area landing pages for nation-wide local SEO",
         "done": False, "detail": "Target 'service in <city>' keywords across India (Service Areas)."},
    ]

    return {
        "score": score,
        "coverage": coverage,
        "global_seo": global_seo,
        "counts": {
            "categories": len(cats), "subcategories": len(subs), "services": len(svcs),
            "schema": schema_count, "redirects": redirects_count, "sitemap_urls": total_urls,
        },
        "issues": issues[:100],
        "issues_total": len(issues),
        "recommendations": recommendations,
        "sitemap_url": f"{site_base()}/api/sitemap.xml",
        "robots_url": f"{site_base()}/api/robots.txt",
        "last_ping": ping.get("last_ping"),
        "last_ping_results": ping.get("last_results", []),
    }


async def slot_availability(date, capacity):
    """Return list of 'HH:00' slots that are FULL for the given date (scheduled bookings >= capacity)."""
    rows = await db.bookings.find({"scheduled_at": {"$regex": f"^{date}"}, "status": {"$nin": ["cancelled"]}},
                                  {"_id": 0, "scheduled_at": 1}).to_list(2000)
    counts = {}
    for r in rows:
        t = (r.get("scheduled_at") or "").split("T")
        if len(t) == 2:
            hh = t[1][:2] + ":00"
            counts[hh] = counts.get(hh, 0) + 1
    cap = max(1, int(capacity or 3))
    return [slot for slot, n in counts.items() if n >= cap]


async def _coupon_usage_map():
    """Aggregate booking usage per coupon code → {redemptions, discount, revenue, customers}."""
    rows = await db.bookings.find(
        {"coupon_code": {"$nin": [None, ""]}},
        {"_id": 0, "coupon_code": 1, "customer_id": 1, "pricing": 1, "total_amount": 1},
    ).to_list(20000)
    m = {}
    for b in rows:
        code = (b.get("coupon_code") or "").upper()
        if not code:
            continue
        pr = b.get("pricing") or {}
        disc = float(pr.get("discount") or 0)
        rev = float(pr.get("total") or b.get("total_amount") or 0)
        e = m.setdefault(code, {"redemptions": 0, "discount": 0.0, "revenue": 0.0, "customers": set()})
        e["redemptions"] += 1
        e["discount"] += disc
        e["revenue"] += rev
        if b.get("customer_id"):
            e["customers"].add(b["customer_id"])
    return m


async def list_coupons():
    coupons = await db.coupons.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    usage = await _coupon_usage_map()
    for c in coupons:
        u = usage.get((c.get("code") or "").upper())
        red = u["redemptions"] if u else int(c.get("used") or 0)
        c["redemptions"] = red
        c["discount_given"] = round(u["discount"], 2) if u else 0.0
        c["revenue"] = round(u["revenue"], 2) if u else 0.0
        c["unique_customers"] = len(u["customers"]) if u else 0
        limit = int(c.get("usage_limit") or 0)
        c["remaining"] = max(limit - red, 0) if limit else None
    return coupons


async def coupon_stats():
    coupons = await db.coupons.find({}, {"_id": 0}).to_list(500)
    usage = await _coupon_usage_map()
    now = now_iso()
    active = expired = 0
    for c in coupons:
        vt = c.get("valid_till") or ""
        is_expired = bool(vt) and vt[:10] < now[:10]
        if c.get("status") == "active" and not is_expired:
            active += 1
        elif is_expired or c.get("status") in ("expired", "inactive"):
            expired += 1
    total_red = sum(u["redemptions"] for u in usage.values())
    total_disc = sum(u["discount"] for u in usage.values())
    total_rev = sum(u["revenue"] for u in usage.values())
    return {
        "total": len(coupons),
        "active": active,
        "expired": expired,
        "redemptions": total_red,
        "discount_given": round(total_disc, 2),
        "revenue": round(total_rev, 2),
    }


async def coupon_usage(coupon_id: str):
    c = await db.coupons.find_one({"id": coupon_id}, {"_id": 0})
    if not c:
        return {"coupon": None, "orders": [], "customers": []}
    code = (c.get("code") or "").upper()
    rows = await db.bookings.find(
        {"coupon_code": {"$regex": f"^{code}$", "$options": "i"}},
        {"_id": 0, "id": 1, "booking_code": 1, "customer_id": 1, "customer_name": 1,
         "pricing": 1, "total_amount": 1, "status": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(1000)
    orders = []
    cust = {}
    for b in rows:
        pr = b.get("pricing") or {}
        rev = float(pr.get("total") or b.get("total_amount") or 0)
        disc = float(pr.get("discount") or 0)
        orders.append({
            "booking_id": b.get("id"), "booking_code": b.get("booking_code"),
            "customer_id": b.get("customer_id"), "customer_name": b.get("customer_name") or "—",
            "amount": round(rev, 2), "discount": round(disc, 2),
            "status": b.get("status"), "created_at": b.get("created_at"),
        })
        cid = b.get("customer_id")
        if cid:
            e = cust.setdefault(cid, {"customer_id": cid, "customer_name": b.get("customer_name") or "—", "uses": 0, "discount": 0.0})
            e["uses"] += 1
            e["discount"] += disc
    for e in cust.values():
        e["discount"] = round(e["discount"], 2)
    return {"coupon": c, "orders": orders, "customers": list(cust.values())}


async def coupon_absorption_report(date_from: str = None, date_to: str = None):
    """Per-coupon PLATFORM ABSORPTION report. Since commission is split on the PRE-coupon
    service amount (partner earns as if no coupon), every rupee of coupon discount is
    borne by the platform. For each coupon over completed/paid bookings:
      discount_absorbed   = Σ pricing.discount (coupon only)
      service_value       = Σ commission base (pre-coupon, tax-excl)
      customer_paid_excl  = Σ (base − coupon)
      partner_paid        = Σ partner_earning  (from ledger, else computed)
      platform_net        = Σ (customer_paid_excl − partner − merchant shares)
      platform_share_lost = discount_absorbed (what the platform gave up)"""
    from services.engines import CommissionEngine, PricingEngine
    q = {"status": {"$in": ["completed", "paid"]},
         "coupon_code": {"$nin": [None, ""]}, "pricing.discount": {"$gt": 0}}
    if date_from:
        q["created_at"] = {"$gte": date_from}
    if date_to:
        q.setdefault("created_at", {})["$lte"] = date_to + "T23:59:59"
    rows = await db.bookings.find(
        q, {"_id": 0, "id": 1, "code": 1, "coupon_code": 1, "pricing": 1, "partner_id": 1,
            "merchant_id": 1, "commission_config": 1, "created_at": 1, "customer_name": 1}
    ).sort("created_at", -1).to_list(5000)
    settings = await get_settings()
    bids = [b["id"] for b in rows]
    ledgers = {}
    if bids:
        async for l in db.commission_ledger.find({"booking_id": {"$in": bids}, "kind": {"$ne": "cancellation"}}, {"_id": 0}):
            ledgers[l["booking_id"]] = l
    partners = {}
    pids = list({b.get("partner_id") for b in rows if b.get("partner_id")})
    if pids:
        async for p in db.users.find({"id": {"$in": pids}}, {"_id": 0, "id": 1, "referred_by_merchant": 1}):
            partners[p["id"]] = p
    by_code, orders = {}, []
    for b in rows:
        pr = b.get("pricing") or {}
        code = (b.get("coupon_code") or "").upper()
        coupon = float(pr.get("discount") or 0)
        base = PricingEngine.commission_base_excl_tax(pr)
        paid_excl = max(0.0, base - coupon)
        l = ledgers.get(b["id"])
        if l:
            partner_e = float(l.get("partner_earning") or 0)
            merch = float(l.get("merchant_referral") or 0) + float(l.get("merchant_customer", l.get("merchant_booking", 0)) or 0)
        else:
            s = CommissionEngine.compute_split(b, settings, partners.get(b.get("partner_id")) or {})
            partner_e = float(s.get("partner_earning") or 0)
            merch = float(s.get("merchant_referral") or 0) + float(s.get("merchant_customer") or 0)
        platform_net = round(paid_excl - partner_e - merch, 2)
        agg = by_code.setdefault(code, {"coupon_code": code, "bookings": 0, "discount_absorbed": 0.0,
                                        "service_value": 0.0, "customer_paid_excl_tax": 0.0,
                                        "partner_paid": 0.0, "merchant_paid": 0.0, "platform_net": 0.0})
        agg["bookings"] += 1
        agg["discount_absorbed"] += coupon
        agg["service_value"] += base
        agg["customer_paid_excl_tax"] += paid_excl
        agg["partner_paid"] += partner_e
        agg["merchant_paid"] += merch
        agg["platform_net"] += platform_net
        orders.append({"booking_id": b["id"], "booking_code": b.get("code"), "coupon_code": code,
                       "customer_name": b.get("customer_name") or "—", "created_at": b.get("created_at"),
                       "service_value": round(base, 2), "discount_absorbed": round(coupon, 2),
                       "customer_paid_excl_tax": round(paid_excl, 2), "partner_paid": round(partner_e, 2),
                       "merchant_paid": round(merch, 2), "platform_net": platform_net})
    coupons = await db.coupons.find({}, {"_id": 0, "code": 1, "title": 1, "discount_type": 1, "discount_value": 1, "status": 1}).to_list(500)
    cmap = {(c.get("code") or "").upper(): c for c in coupons}
    out = []
    for code, a in by_code.items():
        for k in ("discount_absorbed", "service_value", "customer_paid_excl_tax", "partner_paid", "merchant_paid", "platform_net"):
            a[k] = round(a[k], 2)
        c = cmap.get(code, {})
        a.update({"title": c.get("title") or "", "discount_type": c.get("discount_type") or "",
                  "discount_value": c.get("discount_value"), "coupon_status": c.get("status") or "",
                  "absorb_pct_of_service": round(a["discount_absorbed"] / a["service_value"] * 100, 1) if a["service_value"] else 0.0})
        out.append(a)
    out.sort(key=lambda x: x["discount_absorbed"], reverse=True)
    totals = {k: round(sum(a[k] for a in out), 2) for k in
              ("discount_absorbed", "service_value", "customer_paid_excl_tax", "partner_paid", "merchant_paid", "platform_net")}
    totals["bookings"] = sum(a["bookings"] for a in out)
    totals["coupons"] = len(out)
    return {"coupons": out, "orders": orders, "totals": totals,
            "note": "Commission is split on the PRE-coupon service amount, so the full coupon discount is absorbed by the platform."}


async def update_coupon(coupon_id: str, data: dict):
    upd = {k: v for k, v in (data or {}).items() if k not in ("id", "_id", "created_at", "used")}
    if "code" in upd and upd["code"]:
        upd["code"] = str(upd["code"]).upper()
    upd["updated_at"] = now_iso()
    await db.coupons.update_one({"id": coupon_id}, {"$set": upd})
    from services import cache_service as _cs; await _cs.bust_prefix("site:")
    c = await db.coupons.find_one({"id": coupon_id}, {"_id": 0})
    return c


async def delete_coupon(coupon_id: str):
    await db.coupons.delete_one({"id": coupon_id})
    from services import cache_service as _cs; await _cs.bust_prefix("site:")
    return {"ok": True}


async def create_coupon(data: dict):
    c = {"id": new_id(), "used": 0, "created_at": now_iso(), **data}
    c["code"] = c["code"].upper()
    await db.coupons.insert_one(dict(c))
    from services import cache_service as _cs; await _cs.bust_prefix("site:")
    c.pop("_id", None)
    return c


async def commission_ledger():
    return await db.commission_ledger.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


async def list_deletion_requests():
    return await db.deletion_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


async def process_deletion(req_id, action):
    r = await db.deletion_requests.find_one({"id": req_id}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Deletion request not found")
    if r["status"] != "pending":
        raise HTTPException(status_code=400, detail="Already processed")
    if action == "approve":
        await db.users.delete_one({"id": r["user_id"]})
        status = "approved"
    else:
        await db.users.update_one({"id": r["user_id"]}, {"$set": {"status": "active"}})
        status = "rejected"
    await db.deletion_requests.update_one({"id": req_id}, {"$set": {"status": status, "processed_at": now_iso()}})
    await db.audit_logs.insert_one({"id": new_id(), "action": "account.deletion." + status,
                                    "detail": f"{r.get('name')} ({r.get('phone')})", "actor": "admin",
                                    "created_at": now_iso()})
    return await db.deletion_requests.find_one({"id": req_id}, {"_id": 0})


# ============================ PARTNER MANAGEMENT ============================
from datetime import timedelta  # noqa: E402
from services import activity_service  # noqa: E402

# Fields an admin is allowed to edit on a partner (internal id is never editable).
_EDITABLE_PARTNER_FIELDS = {
    "name", "phone", "email", "gender", "language", "alternate_mobile",
    "photo", "skills", "city", "state", "district",
    "village", "pincode", "address", "shop_name", "languages",
}


def _actor(admin):
    return (admin or {}).get("id"), (admin or {}).get("name") or "Admin"


async def _get_partner(pid):
    u = await db.users.find_one({"id": pid, "role": "partner"}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Partner not found")
    return u


async def suspend_partner(admin, pid, data: dict):
    u = await _get_partner(pid)
    days = int(data.get("days") or 0)
    reason = (data.get("reason") or "").strip()
    if days <= 0:
        raise HTTPException(status_code=400, detail="Suspension days must be at least 1")
    if not reason:
        raise HTTPException(status_code=400, detail="Suspension reason is required")
    until = datetime.now(timezone.utc) + timedelta(days=days)
    aid, aname = _actor(admin)
    await db.users.update_one({"id": pid}, {"$set": {
        "suspended": True, "suspend_reason": reason,
        "suspend_until": until.isoformat(), "suspend_days": days,
        "suspended_at": now_iso(), "suspended_by": aname,
        "partner_status": "offline",
    }})
    await activity_service.log("admin", aid, aname, "partner.suspended",
                               f"{u.get('name')} suspended for {days} day(s): {reason}",
                               target_id=pid, target_role="partner",
                               meta={"days": days, "until": until.isoformat()})
    return await db.users.find_one({"id": pid}, {"_id": 0})


async def unsuspend_partner(admin, pid):
    u = await _get_partner(pid)
    aid, aname = _actor(admin)
    await db.users.update_one({"id": pid}, {"$set": {"suspended": False}, "$unset": {
        "suspend_reason": "", "suspend_until": "", "suspend_days": "",
        "suspended_at": "", "suspended_by": ""}})
    await activity_service.log("admin", aid, aname, "partner.unsuspended",
                               f"{u.get('name')} re-activated by admin",
                               target_id=pid, target_role="partner")
    return await db.users.find_one({"id": pid}, {"_id": 0})


async def update_partner(admin, pid, data: dict):
    u = await _get_partner(pid)
    changes = {k: v for k, v in (data or {}).items() if k in _EDITABLE_PARTNER_FIELDS}
    if not changes:
        raise HTTPException(status_code=400, detail="No editable fields provided")
    if "phone" in changes and changes["phone"] and changes["phone"] != u.get("phone"):
        dup = await db.users.find_one({"phone": changes["phone"], "id": {"$ne": pid}}, {"_id": 0, "id": 1})
        if dup:
            raise HTTPException(status_code=400, detail="This phone number is already in use")
    if "skills" in changes and isinstance(changes["skills"], str):
        changes["skills"] = [s.strip() for s in changes["skills"].split(",") if s.strip()]
    if "languages" in changes and isinstance(changes["languages"], str):
        changes["languages"] = [s.strip() for s in changes["languages"].split(",") if s.strip()]
    await db.users.update_one({"id": pid}, {"$set": changes})
    aid, aname = _actor(admin)
    await activity_service.log("admin", aid, aname, "partner.updated",
                               f"Updated {', '.join(changes.keys())} for {u.get('name')}",
                               target_id=pid, target_role="partner", meta={"fields": list(changes.keys())})
    return await db.users.find_one({"id": pid}, {"_id": 0})


async def list_notify_templates(channel: str):
    """Active templates for a channel — used by the profile SMS/Email/Push picker.
    Also returns the dynamic variables found in each template so the UI can render
    an input field per variable (Point 6)."""
    import re as _re
    from services import template_service as ts
    rows = await ts.list_templates(channel=channel)
    out = []
    for t in rows:
        if not t.get("active"):
            continue
        blob = " ".join([t.get("subject", ""), t.get("title", ""), t.get("body", "")])
        # supports {{var}} and {var}
        found = _re.findall(r"\{\{?\s*([a-zA-Z0-9_]+)\s*\}?\}", blob)
        seen, variables = set(), []
        for v in found:
            if v not in seen:
                seen.add(v)
                variables.append(v)
        out.append({"id": t["id"], "name": t.get("name"), "event": t.get("event"),
                    "category": t.get("category"), "channel": t.get("channel"),
                    "subject": t.get("subject", ""), "title": t.get("title", ""),
                    "body": t.get("body", ""), "variables": variables})
    return out


async def preview_notify_template(template_id, variables):
    """Render a live preview of a template with admin-supplied variable values."""
    from services.template_service import render
    tmpl = await db.notification_templates.find_one({"id": template_id}, {"_id": 0})
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    ctx = {k: str(v) for k, v in (variables or {}).items() if v is not None}
    return {
        "subject": render(tmpl.get("subject") or "", ctx),
        "title": render(tmpl.get("title") or "", ctx),
        "body": render(tmpl.get("body") or "", ctx),
        "channel": tmpl.get("channel"),
    }


async def notify_partner(admin, pid, data: dict):
    u = await _get_partner(pid)
    channel = (data.get("channel") or "push").lower()
    template_id = data.get("template_id")
    if not template_id:
        raise HTTPException(status_code=400, detail="Please select a template")
    from services.template_service import db as _tdb  # noqa: F401
    tmpl = await db.notification_templates.find_one({"id": template_id}, {"_id": 0})
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    if not tmpl.get("active"):
        raise HTTPException(status_code=400, detail="This template is inactive")
    if tmpl.get("channel") != channel:
        raise HTTPException(status_code=400, detail="Template channel mismatch")

    from services.template_service import render
    ctx = {"name": u.get("name", "Partner"), "business": "AzoApp",
           "partner_code": u.get("partner_code", ""), "reason": "", "otp": ""}
    # admin-supplied values for dynamic {{placeholders}} take precedence
    ctx.update({k: str(v) for k, v in (data.get("variables") or {}).items() if v is not None})
    from services.notification_service import notify
    subject = render(tmpl.get("subject") or tmpl.get("name") or "AzoApp", ctx)
    body = render(tmpl.get("body") or "", ctx)
    kwargs = {"link": "/partner"}
    if channel == "sms":
        kwargs["sms_text"] = body
        kwargs["email_subject"] = False
    elif channel == "email":
        kwargs["email_subject"] = subject
        kwargs["email_html"] = body
        kwargs["sms_text"] = False
    else:  # push
        kwargs["sms_text"] = False
    title = render(tmpl.get("title") or tmpl.get("name") or subject, ctx)
    res = await notify(u["id"], title, body, **kwargs)

    settings = await get_settings()
    integ = settings.get("integrations", {}) or {}
    configured = {
        "sms": bool(integ.get("sms_enabled") and integ.get("fast2sms_api_key")),
        "email": bool(integ.get("email_enabled") and integ.get("smtp_host")),
        "push": bool(integ.get("fcm_enabled")),
    }
    aid, aname = _actor(admin)
    await activity_service.log("admin", aid, aname, f"partner.notify.{channel}",
                               f"Sent {channel.upper()} template '{tmpl.get('name')}' to {u.get('name')}",
                               target_id=pid, target_role="partner", meta={"template": tmpl.get("name")})
    note = None
    if channel != "push" and not configured.get(channel):
        note = f"{channel.upper()} gateway not configured — delivered as in-app notification only."
    return {"ok": True, "channel": channel, "in_app": True, "template": tmpl.get("name"),
            "channel_configured": configured.get(channel, channel == "push"),
            "note": note, "result": res}


async def partner_logs(pid):
    await _get_partner(pid)
    return await activity_service.list_logs(target_id=pid, actor_id=pid, limit=500)



# ================= Customers directory + 360 admin actions =================

HIGH_VALUE_THRESHOLD = 5000.0  # ₹ lifetime spend to qualify as a "high value" customer

# Loyalty tiers driven by lifetime completed spend. Perks are shown on the
# customer profile so support/admins know the promise made to each segment.
LOYALTY_TIERS = [
    {"key": "platinum", "label": "Platinum", "min": 15000, "color": "violet",
     "perks": ["Dedicated relationship manager", "15% wallet cashback", "Free cancellations", "Top-priority scheduling"]},
    {"key": "gold", "label": "Gold", "min": 5000, "color": "amber",
     "perks": ["Priority scheduling", "10% wallet cashback", "Free visiting fee"]},
    {"key": "silver", "label": "Silver", "min": 2000, "color": "slate",
     "perks": ["Priority support", "5% wallet cashback"]},
    {"key": "bronze", "label": "Bronze", "min": 1, "color": "orange",
     "perks": ["Standard support", "Seasonal offers"]},
    {"key": "new", "label": "New", "min": 0, "color": "sky",
     "perks": ["Welcome offer on first booking"]},
]


def _loyalty(spent):
    spent = spent or 0
    for t in LOYALTY_TIERS:  # ordered high -> low
        if spent >= t["min"]:
            return t
    return LOYALTY_TIERS[-1]


def _loyalty_progress(spent):
    """Return (tier, next_tier_or_None, amount_to_next)."""
    spent = spent or 0
    tier = _loyalty(spent)
    higher = [t for t in LOYALTY_TIERS if t["min"] > tier["min"]]
    if not higher:
        return tier, None, 0
    nxt = min(higher, key=lambda t: t["min"])
    return tier, nxt, max(0, round(nxt["min"] - spent, 2))



async def _get_customer(uid):
    u = await db.users.find_one({"id": uid, "role": "customer"}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Customer not found")
    return u


async def list_customers(tab="all", q="", date_from="", date_to="", city="", sort_by="created_at"):
    """Unified customer directory with tabs + advanced filters, mirroring the
    partner/merchant hubs so the admin UI stays consistent.

    tabs: all | active | new | repeat | high_value | blocked
      - new       : joined in the last 30 days
      - repeat    : 2+ bookings (loyal)
      - high_value: lifetime spend >= HIGH_VALUE_THRESHOLD
      - blocked   : admin-blocked accounts
    """
    query = {"role": "customer"}
    tab = (tab or "all").lower()
    if city:
        query["city"] = {"$regex": f"^{re.escape(city)}$", "$options": "i"}
    if q:
        rx = {"$regex": q.strip(), "$options": "i"}
        query["$or"] = [{"name": rx}, {"phone": rx}, {"email": rx}]
    if date_from or date_to:
        rng = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to + "T23:59:59"
        query["created_at"] = rng

    users = await db.users.find(
        query,
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1, "city": 1, "state": 1,
         "gender": 1, "photo": 1, "created_at": 1, "wallet_balance": 1,
         "blocked": 1, "status": 1, "last_login_at": 1}
    ).sort(sort_by, -1).to_list(5000)

    # per-customer booking aggregate (bookings + lifetime spend + last order)
    ids = [u["id"] for u in users]
    agg = {}
    if ids:
        pipeline = [
            {"$match": {"customer_id": {"$in": ids}}},
            {"$group": {
                "_id": "$customer_id",
                "bookings": {"$sum": 1},
                "spent": {"$sum": {"$cond": [
                    {"$in": ["$status", ["completed", "paid"]]},
                    {"$ifNull": ["$pricing.total", 0]}, 0]}},
                "last_at": {"$max": "$created_at"},
            }},
        ]
        async for r in db.bookings.aggregate(pipeline):
            agg[r["_id"]] = r

    now30 = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    for u in users:
        a = agg.get(u["id"], {})
        u["bookings_count"] = a.get("bookings", 0)
        u["total_spent"] = round(a.get("spent", 0) or 0, 2)
        u["last_booking_at"] = a.get("last_at")
        u["is_new"] = (u.get("created_at") or "") >= now30
        u["is_repeat"] = u["bookings_count"] >= 2
        u["is_high_value"] = u["total_spent"] >= HIGH_VALUE_THRESHOLD
        u["is_blocked"] = bool(u.get("blocked"))
        _t = _loyalty(u["total_spent"])
        u["tier"] = _t["key"]
        u["tier_label"] = _t["label"]

    def _match(u, t):
        if t == "all":
            return True
        if t == "active":
            return not u["is_blocked"]
        if t == "new":
            return u["is_new"]
        if t == "repeat":
            return u["is_repeat"]
        if t == "high_value":
            return u["is_high_value"]
        if t == "blocked":
            return u["is_blocked"]
        return True

    counts = {
        "all": len(users),
        "active": sum(1 for u in users if not u["is_blocked"]),
        "new": sum(1 for u in users if u["is_new"]),
        "repeat": sum(1 for u in users if u["is_repeat"]),
        "high_value": sum(1 for u in users if u["is_high_value"]),
        "blocked": sum(1 for u in users if u["is_blocked"]),
    }
    rows = [u for u in users if _match(u, tab)]

    # summary strip for the hub header
    summary = {
        "total": len(users),
        "total_gmv": round(sum(u["total_spent"] for u in users), 2),
        "total_wallet": round(sum(u.get("wallet_balance", 0) or 0 for u in users), 2),
        "avg_bookings": round(sum(u["bookings_count"] for u in users) / len(users), 1) if users else 0,
    }
    return {"customers": rows, "counts": counts, "summary": summary, "tab": tab}


async def block_customer(admin, uid, block: bool, reason=""):
    u = await _get_customer(uid)
    aid, aname = _actor(admin)
    if block:
        await db.users.update_one({"id": uid}, {"$set": {
            "blocked": True, "block_reason": (reason or "").strip(),
            "blocked_at": now_iso(), "blocked_by": aname, "status": "blocked"}})
        det = f"{u.get('name')} blocked" + (f": {reason}" if reason else "")
        try:
            from services.notification_service import notify
            await notify(uid, "Account restricted",
                         "Your account has been restricted by support. Contact us for help.",
                         link="/account", sms_text=False)
        except Exception:
            pass
    else:
        await db.users.update_one({"id": uid}, {"$set": {"blocked": False, "status": "active"},
                                                "$unset": {"block_reason": "", "blocked_at": "", "blocked_by": ""}})
        det = f"{u.get('name')} unblocked"
    await activity_service.log("admin", aid, aname, "customer.block" if block else "customer.unblock",
                               det, target_id=uid, target_role="customer")
    return await db.users.find_one({"id": uid}, {"_id": 0})


async def adjust_customer_wallet(admin, uid, amount: float, direction: str, note=""):
    u = await _get_customer(uid)
    try:
        amount = round(float(amount), 2)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid amount")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    direction = (direction or "credit").lower()
    if direction not in ("credit", "debit"):
        raise HTTPException(status_code=400, detail="Direction must be credit or debit")
    bal = u.get("wallet_balance", 0) or 0
    if direction == "debit" and amount > bal:
        raise HTTPException(status_code=400, detail=f"Insufficient wallet balance (₹{bal})")
    delta = amount if direction == "credit" else -amount
    await db.users.update_one({"id": uid}, {"$inc": {"wallet_balance": delta}})
    await db.transactions.insert_one({
        "id": new_id(), "user_id": uid, "amount": amount, "type": direction,
        "kind": "admin_adjustment", "note": (note or "").strip() or "Manual wallet adjustment by admin",
        "created_at": now_iso()})
    aid, aname = _actor(admin)
    await activity_service.log("admin", aid, aname, "customer.wallet." + direction,
                               f"{direction.title()} ₹{amount} to {u.get('name')}'s wallet"
                               + (f" ({note})" if note else ""),
                               target_id=uid, target_role="customer", meta={"amount": amount, "direction": direction})
    try:
        from services.notification_service import notify
        await notify(uid, "Wallet updated",
                     f"₹{amount} {'added to' if direction == 'credit' else 'deducted from'} your wallet."
                     + (f" {note}" if note else ""), link="/account", sms_text=False)
    except Exception:
        pass
    fresh = await db.users.find_one({"id": uid}, {"_id": 0, "wallet_balance": 1})
    return {"ok": True, "wallet_balance": fresh.get("wallet_balance", 0)}


async def notify_customer(admin, uid, data: dict):
    u = await _get_customer(uid)
    title = (data.get("title") or "").strip()
    body = (data.get("body") or "").strip()
    if not title or not body:
        raise HTTPException(status_code=400, detail="Title and message are required")
    channel = (data.get("channel") or "push").lower()
    from services.notification_service import notify
    kwargs = {"link": "/account"}
    if channel == "sms":
        kwargs["sms_text"] = body
    elif channel == "email":
        kwargs["email_subject"] = title
        kwargs["email_html"] = f"<p>{body}</p>"
        kwargs["sms_text"] = False
    else:
        kwargs["sms_text"] = False
    res = await notify(uid, title, body, **kwargs)
    settings = await get_settings()
    integ = settings.get("integrations", {}) or {}
    configured = {
        "sms": bool(integ.get("sms_enabled") and integ.get("fast2sms_api_key")),
        "email": bool(integ.get("email_enabled") and integ.get("smtp_host")),
        "push": bool(integ.get("fcm_enabled")),
    }
    aid, aname = _actor(admin)
    await activity_service.log("admin", aid, aname, f"customer.notify.{channel}",
                               f"Sent {channel.upper()} '{title}' to {u.get('name')}",
                               target_id=uid, target_role="customer")
    note = None
    if channel != "push" and not configured.get(channel):
        note = f"{channel.upper()} gateway not configured — delivered as in-app notification only."
    return {"ok": True, "channel": channel, "in_app": True, "note": note,
            "channel_configured": configured.get(channel, channel == "push"), "result": res}


async def admin_delete_customer(admin, uid, reason=""):
    """Admin-initiated account deletion. Admins have authority so this deletes
    immediately, but we keep an approved record in deletion_requests for history."""
    u = await _get_customer(uid)
    aid, aname = _actor(admin)
    await db.deletion_requests.update_one(
        {"user_id": uid, "status": "pending"},
        {"$set": {"status": "approved", "processed_at": now_iso(), "processed_by": aname}})
    await db.deletion_requests.insert_one({
        "id": new_id(), "user_id": uid, "name": u.get("name"), "phone": u.get("phone"),
        "email": u.get("email", ""), "role": "customer", "reason": (reason or "Deleted by admin"),
        "status": "approved", "source": "admin", "created_at": now_iso(),
        "processed_at": now_iso(), "processed_by": aname})
    await db.users.delete_one({"id": uid})
    await activity_service.log("admin", aid, aname, "customer.deleted",
                               f"{u.get('name')} ({u.get('phone')}) deleted by admin"
                               + (f": {reason}" if reason else ""),
                               target_id=uid, target_role="customer")
    await db.audit_logs.insert_one({"id": new_id(), "action": "account.deletion.admin",
                                    "detail": f"{u.get('name')} ({u.get('phone')})", "actor": aname,
                                    "created_at": now_iso()})
    return {"ok": True, "deleted": True}


async def customer_logs(uid):
    await _get_customer(uid)
    return await activity_service.list_logs(target_id=uid, actor_id=uid, limit=500)


async def customer_timeline(uid):
    """Single chronological feed mixing bookings, wallet/payments, messages and
    account events — the customer's whole story in one scrollable list."""
    await _get_customer(uid)
    events = []
    bookings = await db.bookings.find({"customer_id": uid}, {"_id": 0}).sort("created_at", -1).to_list(300)
    for b in bookings:
        events.append({
            "type": "booking", "at": b.get("created_at"),
            "title": b.get("service_name") or "Booking",
            "subtitle": f"#{b.get('code', '')} · {str(b.get('status', '')).replace('_', ' ')}",
            "status": b.get("status"),
            "amount": (b.get("pricing") or {}).get("total"),
        })
    txns = await db.transactions.find({"user_id": uid}, {"_id": 0}).sort("created_at", -1).to_list(300)
    for t in txns:
        events.append({
            "type": "transaction", "at": t.get("created_at"),
            "title": str(t.get("kind", "transaction")).replace("_", " ").title(),
            "subtitle": t.get("note") or "",
            "direction": t.get("type"),
            "amount": t.get("amount"),
        })
    notifs = await db.notifications.find({"user_id": uid}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for n in notifs:
        events.append({
            "type": "message", "at": n.get("created_at"),
            "title": n.get("title") or "Notification",
            "subtitle": n.get("body") or "",
        })
    dels = await db.deletion_requests.find({"user_id": uid}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for dq in dels:
        events.append({
            "type": "account", "at": dq.get("created_at"),
            "title": "Account deletion " + str(dq.get("status", "requested")),
            "subtitle": dq.get("reason") or "",
        })
    events = [e for e in events if e.get("at")]
    events.sort(key=lambda e: e["at"], reverse=True)
    return {"events": events, "count": len(events)}


async def bulk_notify_customers(admin, data: dict):
    ids = data.get("ids") or []
    if not ids:
        raise HTTPException(status_code=400, detail="Select at least one customer")
    title = (data.get("title") or "").strip()
    body = (data.get("body") or "").strip()
    if not title or not body:
        raise HTTPException(status_code=400, detail="Title and message are required")
    channel = (data.get("channel") or "push").lower()
    from services.notification_service import notify
    sent = 0
    for uid in ids:
        u = await db.users.find_one({"id": uid, "role": "customer"}, {"_id": 0, "id": 1})
        if not u:
            continue
        kwargs = {"link": "/account"}
        if channel == "sms":
            kwargs["sms_text"] = body
        elif channel == "email":
            kwargs["email_subject"] = title
            kwargs["email_html"] = f"<p>{body}</p>"
            kwargs["sms_text"] = False
        else:
            kwargs["sms_text"] = False
        try:
            await notify(uid, title, body, **kwargs)
            sent += 1
        except Exception:
            pass
    aid, aname = _actor(admin)
    await activity_service.log("admin", aid, aname, f"customer.bulk_notify.{channel}",
                               f"Sent '{title}' to {sent} customer(s)",
                               meta={"count": sent, "channel": channel})
    return {"ok": True, "sent": sent, "channel": channel}


async def _winback_customers(days: int):
    """Customers whose most-recent booking is older than `days` (or who never
    booked). Returns the full list with basic fields for preview + send."""
    days = max(1, int(days or 60))
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    customers = await db.users.find({"role": "customer", "blocked": {"$ne": True}},
                                    {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(10000)
    ids = [c["id"] for c in customers]
    last = {}
    if ids:
        pipeline = [
            {"$match": {"customer_id": {"$in": ids}}},
            {"$group": {"_id": "$customer_id", "last_at": {"$max": "$created_at"}}},
        ]
        async for r in db.bookings.aggregate(pipeline):
            last[r["_id"]] = r.get("last_at")
    out = []
    for c in customers:
        la = last.get(c["id"])
        if la is None or la < cutoff:
            out.append({**c, "last_booking_at": la})
    return out


async def winback_preview(days: int = 60):
    rows = await _winback_customers(days)
    return {"days": int(days or 60), "count": len(rows), "sample": rows[:12]}


async def winback_send(admin, data: dict):
    days = int(data.get("days") or 60)
    title = (data.get("title") or "We miss you!").strip()
    body = (data.get("body") or "Here's a special offer to welcome you back. Book now and save!").strip()
    channel = (data.get("channel") or "push").lower()
    rows = await _winback_customers(days)
    from services.notification_service import notify
    sent = 0
    for c in rows:
        kwargs = {"link": "/services"}
        if channel == "sms":
            kwargs["sms_text"] = body
        elif channel == "email":
            kwargs["email_subject"] = title
            kwargs["email_html"] = f"<p>{body}</p>"
            kwargs["sms_text"] = False
        else:
            kwargs["sms_text"] = False
        try:
            await notify(c["id"], title, body, **kwargs)
            sent += 1
        except Exception:
            pass
    aid, aname = _actor(admin)
    await activity_service.log("admin", aid, aname, f"customer.winback.{channel}",
                               f"Win-back '{title}' sent to {sent} inactive customer(s) (>{days}d)",
                               meta={"count": sent, "days": days, "channel": channel})
    return {"ok": True, "sent": sent, "days": days, "channel": channel}



# ================= Customer booking-payment transactions =================

async def list_payments(tab="all", q="", date_from="", date_to="", method=""):
    """Customer payment attempts for service bookings — successful, failed,
    pending and refunded — with a summary strip for the advanced Transactions
    screen."""
    query = {}
    tab = (tab or "all").lower()
    if method:
        query["method"] = method
    if q:
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"txn_ref": rx}, {"customer_name": rx}, {"customer_phone": rx},
                        {"service_name": rx}, {"booking_code": rx}, {"gateway_payment_id": rx}]
    if date_from or date_to:
        rng = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to + "T23:59:59"
        query["created_at"] = rng

    rows = await db.payment_transactions.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)

    def _match(r, t):
        return t == "all" or r.get("status") == t

    counts = {
        "all": len(rows),
        "success": sum(1 for r in rows if r.get("status") == "success"),
        "failed": sum(1 for r in rows if r.get("status") == "failed"),
        "pending": sum(1 for r in rows if r.get("status") == "pending"),
        "refunded": sum(1 for r in rows if r.get("status") == "refunded"),
    }
    collected = sum(r.get("amount", 0) for r in rows if r.get("status") == "success")
    failed_amt = sum(r.get("amount", 0) for r in rows if r.get("status") == "failed")
    refunded_amt = sum(r.get("amount", 0) for r in rows if r.get("status") == "refunded")
    attempted = counts["success"] + counts["failed"]
    summary = {
        "collected": round(collected, 2), "failed_amount": round(failed_amt, 2),
        "refunded_amount": round(refunded_amt, 2), "total": len(rows),
        "success_rate": round(counts["success"] / attempted * 100, 1) if attempted else 0,
    }
    filtered = [r for r in rows if _match(r, tab)]
    return {"payments": filtered, "counts": counts, "summary": summary, "tab": tab}


async def payment_detail(pid):
    p = await db.payment_transactions.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Transaction not found")
    # attach the live booking if the order was created
    if p.get("booking_code"):
        b = await db.bookings.find_one({"code": p["booking_code"]}, {"_id": 0})
        if b:
            p["booking"] = {"id": b.get("id"), "code": b.get("code"), "status": b.get("status"),
                            "scheduled_at": b.get("scheduled_at"), "address": b.get("address")}
    return p


async def finance_report(date_from="", date_to=""):
    """Full financial report: revenue/refund/payout KPIs plus breakdowns by
    payment method, service category, day and top services — everything the
    admin needs on one screen."""
    def _in(dt):
        if date_from and (dt or "") < date_from:
            return False
        if date_to and (dt or "") > date_to + "T23:59:59":
            return False
        return True

    pays = [p for p in await db.payment_transactions.find({}, {"_id": 0}).to_list(10000) if _in(p.get("created_at"))]
    ledger = [x for x in await db.commission_ledger.find({}, {"_id": 0}).to_list(10000) if _in(x.get("created_at"))]
    refunds = [r for r in await db.refunds.find({}, {"_id": 0}).to_list(10000) if _in(r.get("created_at"))]
    wds = [w for w in await db.partner_withdrawals.find({}, {"_id": 0}).to_list(10000) if _in(w.get("created_at") or w.get("requested_at"))]

    succ = [p for p in pays if p.get("status") == "success"]
    collected = sum(p.get("amount", 0) for p in succ)
    refunded = sum(r.get("refund_amount", r.get("amount", 0)) for r in refunds if r.get("status") == "processed")
    tax = sum((p.get("invoice") or {}).get("tax", 0) for p in succ)
    failed_ct = sum(1 for p in pays if p.get("status") == "failed")
    attempted = len(succ) + failed_ct
    platform_rev = sum(x.get("platform_earning", 0) for x in ledger)
    partner_earn = sum(x.get("partner_earning", 0) for x in ledger)
    merchant_ref = sum(x.get("merchant_referral", 0) for x in ledger)
    wd_paid = sum(w.get("amount", 0) for w in wds if w.get("status") == "completed")
    wd_pending = sum(w.get("amount", 0) for w in wds if w.get("status") == "pending")

    def _group(items, key, amt=lambda x: x.get("amount", 0)):
        g = {}
        for it in items:
            k = it.get(key) or "Other"
            e = g.setdefault(k, {"key": k, "count": 0, "amount": 0})
            e["count"] += 1
            e["amount"] = round(e["amount"] + (amt(it) or 0), 2)
        return sorted(g.values(), key=lambda x: x["amount"], reverse=True)

    by_method = [{"method": r["key"], "label": next((p.get("method_label") for p in succ if p.get("method") == r["key"]), r["key"]),
                  "count": r["count"], "amount": r["amount"]} for r in _group(succ, "method")]
    by_category = [{"category": r["key"], "count": r["count"], "amount": r["amount"]} for r in _group(succ, "category")]
    top_services = [{"name": r["key"], "count": r["count"], "amount": r["amount"]} for r in _group(succ, "service_name")][:8]

    # daily trend
    day = {}
    for p in succ:
        d = (p.get("created_at") or "")[:10]
        day.setdefault(d, {"date": d, "collected": 0, "refunds": 0, "orders": 0})
        day[d]["collected"] = round(day[d]["collected"] + p.get("amount", 0), 2)
        day[d]["orders"] += 1
    for r in refunds:
        if r.get("status") != "processed":
            continue
        d = (r.get("created_at") or "")[:10]
        day.setdefault(d, {"date": d, "collected": 0, "refunds": 0, "orders": 0})
        day[d]["refunds"] = round(day[d]["refunds"] + r.get("refund_amount", r.get("amount", 0)), 2)
    for d in day.values():
        d["net"] = round(d["collected"] - d["refunds"], 2)
    by_day = sorted(day.values(), key=lambda x: x["date"], reverse=True)

    kpis = {
        "gross_revenue": round(collected, 2), "refunds": round(refunded, 2),
        "net_revenue": round(collected - refunded, 2), "tax_collected": round(tax, 2),
        "platform_revenue": round(platform_rev, 2), "partner_earnings": round(partner_earn, 2),
        "merchant_referral": round(merchant_ref, 2), "withdrawals_paid": round(wd_paid, 2),
        "pending_payouts": round(wd_pending, 2), "orders": len(succ), "refund_count": len(refunds),
        "success_rate": round(len(succ) / attempted * 100, 1) if attempted else 0,
        "avg_order_value": round(collected / len(succ), 2) if succ else 0,
    }
    return {"kpis": kpis, "by_method": by_method, "by_category": by_category,
            "top_services": top_services, "by_day": by_day,
            "range": {"date_from": date_from, "date_to": date_to}}




# =============================================================================
# DISPATCH TRACE — read-only diagnostic so admins can debug the notification
# fan-out chain step by step: "for this booking, who was eligible, who was
# actually notified, and if not, why?" No side-effects.
# =============================================================================

async def booking_dispatch_trace(booking_id):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    svc = await db.services.find_one({"id": b.get("service_id")}, {"_id": 0}) or {}
    settings = await get_settings()
    from services.engines import MatchingEngine
    address = b.get("address") or {}
    cust_pin = str(address.get("pincode", "")).strip()
    cust_coords = MatchingEngine._coords(address)

    partners = await db.users.find(
        {"role": "partner"},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "skills": 1,
         "service_pincodes": 1, "service_radius_km": 1, "kyc_status": 1,
         "status": 1, "partner_status": 1, "suspended": 1, "availability": 1,
         "lat": 1, "lng": 1, "location": 1, "address": 1, "premium_partner": 1,
         "rating": 1, "jobs_completed": 1}).to_list(1000)

    # partners with an in-progress job right now = busy
    busy_rows = await db.bookings.find(
        {"status": {"$in": ["accepted", "in_progress"]},
         "partner_id": {"$ne": None}}, {"_id": 0, "partner_id": 1}).to_list(2000)
    busy_ids = {r["partner_id"] for r in busy_rows}

    skill = (svc.get("required_skill") or "").lower()
    bcfg = settings.get("business_config", {}) or {}
    max_km = bcfg.get("max_distance_km")
    if max_km and str(bcfg.get("distance_unit", "km")).startswith("mile"):
        max_km = float(max_km) * 1.60934

    offered = set(b.get("offered_partner_ids") or [])
    eligible_pool = set(b.get("eligible_partner_ids") or [])

    result = []
    for p in partners:
        reasons = []
        # KYC / account
        if p.get("kyc_status") != "approved":
            reasons.append(f"kyc_status={p.get('kyc_status')!r} (need 'approved')")
        if p.get("status") != "active":
            reasons.append(f"account_status={p.get('status')!r} (need 'active')")
        if p.get("suspended"):
            reasons.append("account_suspended")
        # Skill / category
        p_skills = [s.lower() for s in (p.get("skills") or [])]
        if skill and skill not in p_skills:
            reasons.append(f"skill_missing: need '{skill}', has {p_skills or 'none'}")
        # Pincode
        p_pins = [str(x).strip() for x in (p.get("service_pincodes") or []) if str(x).strip()]
        if p_pins and cust_pin and cust_pin not in p_pins:
            reasons.append(f"pincode_out_of_area: cust={cust_pin} vs partner_pins={p_pins}")
        # Distance
        limit_km = None
        if p.get("service_radius_km"):
            try:
                limit_km = float(p.get("service_radius_km"))
            except (TypeError, ValueError):
                limit_km = None
        if limit_km is None and max_km:
            limit_km = float(max_km)
        dist_km = None
        p_coords = MatchingEngine._coords(p)
        if limit_km and cust_coords and p_coords:
            dist_km = round(MatchingEngine._haversine_km(cust_coords, p_coords), 2)
            if dist_km > float(limit_km):
                reasons.append(f"too_far: {dist_km}km > radius {limit_km}km")
        # Now the "available for push" gate (only applied at broadcast time)
        push_reasons = []
        if p.get("partner_status") != "online":
            push_reasons.append(f"partner_status={p.get('partner_status')!r} (need 'online')")
        if p["id"] in busy_ids:
            push_reasons.append("busy: currently on an accepted/in_progress job")

        eligible = not reasons
        would_get_push = eligible and not push_reasons
        result.append({
            "id": p["id"], "name": p.get("name"), "phone": p.get("phone"),
            "skills": p_skills, "pincodes": p_pins,
            "partner_status": p.get("partner_status") or "offline",
            "kyc_status": p.get("kyc_status"),
            "distance_km": dist_km, "radius_km": limit_km,
            "in_eligible_pool": p["id"] in eligible_pool,
            "in_offered_pool": p["id"] in offered,
            "would_be_eligible": eligible,
            "would_get_notified_now": would_get_push,
            "eligibility_blockers": reasons,
            "notification_blockers": push_reasons,
        })

    # sort: notification-ready first, then eligible-but-offline, then rest
    result.sort(key=lambda x: (
        not x["would_get_notified_now"],
        not x["would_be_eligible"],
        x.get("distance_km") if x.get("distance_km") is not None else 9999,
    ))

    summary = {
        "total_partners": len(result),
        "eligible": sum(1 for x in result if x["would_be_eligible"]),
        "would_get_notified_now": sum(1 for x in result if x["would_get_notified_now"]),
        "already_offered": len(offered),
    }
    return {
        "booking": {
            "id": b["id"], "code": b.get("code"), "status": b.get("status"),
            "service_id": b.get("service_id"), "service_name": b.get("service_name"),
            "required_skill": skill, "customer_pincode": cust_pin,
            "customer_coords": {"lat": cust_coords[0], "lng": cust_coords[1]} if cust_coords else None,
        },
        "summary": summary, "partners": result,
    }


async def booking_redispatch(booking_id):
    """Manually re-run the broadcast for a booking that's still in SEARCHING.
    Useful when a partner just came online after the original broadcast."""
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    if b.get("status") not in ("searching", "pending_partner"):
        raise HTTPException(
            status_code=400,
            detail=f"Booking is in status {b.get('status')!r} — only searching bookings can be re-dispatched.")
    # Re-compute the eligible pool from scratch to pick up partners that were added
    # or came online since the original broadcast.
    svc = await db.services.find_one({"id": b.get("service_id")}, {"_id": 0}) or {}
    settings = await get_settings()
    from services.engines import MatchingEngine
    eligible = await MatchingEngine.eligible_partners(svc, settings, b.get("address"))
    new_ids = [e["id"] for e in eligible]
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"eligible_partner_ids": new_ids, "updated_at": now_iso()}})
    b["eligible_partner_ids"] = new_ids
    from controllers import booking_controller as bc
    await bc._broadcast_new_job(b)
    return {"ok": True, "eligible_count": len(new_ids)}


# =============================================================================
# LIVE DISPATCH FEED — chronological log of every partner-alert attempt so admin
# can watch, in real time, "who was pinged, when, via what channel, did they
# respond, how fast?". Rows are appended by booking_controller._record_dispatch
# and updated by _record_dispatch_response.
# =============================================================================

async def dispatch_feed(status: str = "", partner_id: str = "", booking_id: str = "",
                       limit: int = 100):
    q = {}
    if status:
        q["response"] = status                   # pending | accepted | rejected
    if partner_id:
        q["partner_id"] = partner_id
    if booking_id:
        q["booking_id"] = booking_id
    limit = min(max(int(limit or 100), 1), 500)
    rows = await db.booking_dispatches.find(
        q, {"_id": 0}).sort("dispatched_at", -1).limit(limit).to_list(limit)
    # aggregate quick stats over the same query
    pipeline = [{"$match": q}, {"$group": {
        "_id": "$response", "n": {"$sum": 1},
        "avg_ms": {"$avg": "$response_ms"}}}]
    stats = {r["_id"]: {"count": r["n"], "avg_ms": r.get("avg_ms")}
             async for r in db.booking_dispatches.aggregate(pipeline)}
    # global tallies (independent of filters) for the header cards
    tot = await db.booking_dispatches.count_documents({})
    accepted = await db.booking_dispatches.count_documents({"response": "accepted"})
    rejected = await db.booking_dispatches.count_documents({"response": "rejected"})
    pending = await db.booking_dispatches.count_documents({"response": "pending"})
    pushed = await db.booking_dispatches.count_documents({"push_success": {"$gt": 0}})
    # avg response time across accepted rows
    avg_pipe = [{"$match": {"response_ms": {"$ne": None}}},
                {"$group": {"_id": None, "avg": {"$avg": "$response_ms"}}}]
    avg_row = None
    async for r in db.booking_dispatches.aggregate(avg_pipe):
        avg_row = r
    avg_ms = round(avg_row["avg"]) if avg_row and avg_row.get("avg") else None
    return {
        "rows": rows,
        "stats": stats,
        "totals": {"total": tot, "accepted": accepted, "rejected": rejected,
                   "pending": pending, "pushed": pushed,
                   "avg_response_ms": avg_ms},
    }


async def dispatch_attention():
    """Bookings that are stuck 'searching' with NO partner reachable right now
    (offline / busy / none in area). Powers the admin 'No partner available' alert
    + one-tap manual assign. Returns each waiting booking with its full eligible
    partner list (incl. offline ones) so the admin can force-assign anyone."""
    from services.engines import MatchingEngine
    searching = await db.bookings.find(
        {"status": "searching"},
        {"_id": 0, "id": 1, "code": 1, "service_name": 1, "address": 1,
         "eligible_partner_ids": 1, "eligible_detail": 1, "pricing": 1,
         "customer_name": 1, "created_at": 1, "dispatch_wave": 1, "service_id": 1, "category_name": 1}
    ).sort("created_at", 1).to_list(200)
    cats_all = await db.categories.find({}, {"_id": 0, "name": 1, "required_skill": 1}).to_list(100)
    cat_by_skill = {(c.get("required_skill") or "").lower(): c.get("name") for c in cats_all if c.get("required_skill")}
    svc_ids = [b.get("service_id") for b in searching if b.get("service_id")]
    svcs = await db.services.find({"id": {"$in": svc_ids}}, {"_id": 0, "id": 1, "required_skill": 1, "category_name": 1}).to_list(500)
    svc_map = {s["id"]: s for s in svcs}
    out = []
    for b in searching:
        svc = svc_map.get(b.get("service_id")) or {}
        skill = (svc.get("required_skill") or "").lower()
        elig = b.get("eligible_partner_ids", []) or []
        live = await MatchingEngine.available_targets(elig)
        if live:
            continue  # someone can still be alerted — not stuck
        # Build an assignable partner list: same category + same area (incl. offline, so the
        # admin can force-assign), followed by NEARBY-area partners within the radius.
        parts = []
        try:
            ep = await booking_eligible_partners(b["id"], include_offline=True)
        except HTTPException:
            ep = {"partners": [], "nearby_partners": []}
        cat_label = ep.get("category") or cat_by_skill.get(skill)
        for d in list(ep.get("partners") or []) + list(ep.get("nearby_partners") or []):
            online = (d.get("partner_status") or "offline") == "online"
            parts.append({
                "id": d["id"], "name": d.get("name"), "phone": d.get("phone"),
                "partner_status": d.get("partner_status"), "rating": d.get("rating"),
                "busy": bool(d.get("busy")), "nearby": bool(d.get("nearby")),
                "category": cat_label,
                "area": " ".join([x for x in [d.get("city"), (d.get("service_pincodes") or [None])[0]] if x]) or None,
                "availability": "busy" if d.get("busy") else ("online" if online else "offline"),
                "busy_free_in_min": d.get("busy_free_in_min"), "busy_until": d.get("busy_until"),
                "busy_job_code": d.get("busy_job_code"), "busy_job_service": d.get("busy_job_service"),
                "distance_km": d.get("distance_km"), "eta_min": d.get("eta_min"),
            })
        out.append({
            "id": b["id"], "code": b.get("code"), "service_name": b.get("service_name"),
            "category_name": svc.get("category_name") or b.get("category_name") or cat_by_skill.get(skill),
            "customer_name": b.get("customer_name"),
            "city": (b.get("address") or {}).get("city"),
            "pincode": (b.get("address") or {}).get("pincode"),
            "total": (b.get("pricing") or {}).get("total"),
            "created_at": b.get("created_at"), "wave": b.get("dispatch_wave", 0),
            "eligible_partners": parts,
        })
    return {"rows": out, "count": len(out)}


# ============================ DISPATCH TIMELINE MAP ============================
async def booking_dispatch_timeline(booking_id: str):
    """Visual 'who was rung → who saw → who accepted/rejected' map for one booking:
    per-partner lanes (grouped by wave/source) + a merged chronological event rail."""
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0, "otps": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    rows = await db.booking_dispatches.find({"booking_id": booking_id}, {"_id": 0}).sort("dispatched_at", 1).to_list(500)
    det = b.get("eligible_detail") or {}
    lanes, events = [], []
    for r in rows:
        pid = r.get("partner_id")
        d = det.get(pid) or {}
        stage = "rung"
        if r.get("response") in ("accepted", "rejected", "timeout"):
            stage = r["response"]
        elif r.get("seen_at"):
            stage = "seen"
        lanes.append({
            "dispatch_id": r.get("id"), "partner_id": pid, "partner_name": r.get("partner_name") or d.get("name"),
            "partner_phone": r.get("partner_phone"), "source": r.get("source"),
            "status_at_dispatch": r.get("partner_status_at_dispatch"),
            "distance_km": r.get("distance_km", d.get("distance_km")), "eta_min": r.get("eta_min", d.get("eta_min")),
            "nearby": bool(d.get("nearby")),
            "rung_at": r.get("dispatched_at"), "seen_at": r.get("seen_at"),
            "response": r.get("response") or "pending", "response_at": r.get("response_at"),
            "response_ms": r.get("response_ms"),
            "push": "sent" if (r.get("push_success") or 0) > 0 else (r.get("push_skipped") or ("failed" if (r.get("push_failure") or 0) > 0 else "sse_only")),
            "stage": stage,
        })
        events.append({"at": r.get("dispatched_at"), "type": "rung", "partner_id": pid, "partner_name": r.get("partner_name"), "source": r.get("source")})
        if r.get("seen_at"):
            events.append({"at": r["seen_at"], "type": "seen", "partner_id": pid, "partner_name": r.get("partner_name")})
        if r.get("response_at") and r.get("response") in ("accepted", "rejected", "timeout"):
            events.append({"at": r["response_at"], "type": r["response"], "partner_id": pid, "partner_name": r.get("partner_name"), "response_ms": r.get("response_ms")})
    for t in b.get("timeline") or []:
        events.append({"at": t.get("at"), "type": "status", "status": t.get("status"),
                       "partner_name": b.get("partner_name") if t.get("status") == "assigned" else None})
    if b.get("assigned_by_admin") or (b.get("assignment_source") == "admin"):
        events.append({"at": b.get("assigned_at") or b.get("updated_at"), "type": "manual_assign", "partner_name": b.get("partner_name")})
    events = [e for e in events if e.get("at")]
    events.sort(key=lambda e: e["at"])
    # eligible partners that were never rung (still waiting / busy / offline)
    rung_ids = {l["partner_id"] for l in lanes}
    waiting = [{"partner_id": pid, "partner_name": (det.get(pid) or {}).get("name"), "eta_min": (det.get(pid) or {}).get("eta_min"),
                "distance_km": (det.get(pid) or {}).get("distance_km"), "nearby": bool((det.get(pid) or {}).get("nearby"))}
               for pid in (b.get("eligible_partner_ids") or []) if pid not in rung_ids]
    summary = {
        "eligible": len(b.get("eligible_partner_ids") or []), "rung": len(lanes),
        "seen": sum(1 for l in lanes if l["seen_at"]),
        "accepted": sum(1 for l in lanes if l["response"] == "accepted"),
        "rejected": sum(1 for l in lanes if l["response"] == "rejected"),
        "timeout": sum(1 for l in lanes if l["response"] == "timeout"),
        "pending": sum(1 for l in lanes if l["response"] == "pending"),
        "waves": int(b.get("dispatch_wave") or 0), "exhausted": bool(b.get("dispatch_exhausted")),
        "nearby_expanded": bool(b.get("dispatch_nearby_expanded")),
    }
    return {"booking": {"id": b["id"], "code": b.get("code"), "status": b.get("status"), "service_name": b.get("service_name"),
                        "partner_id": b.get("partner_id"), "partner_name": b.get("partner_name"),
                        "dispatch_started_at": b.get("dispatch_started_at"), "created_at": b.get("created_at")},
            "summary": summary, "lanes": lanes, "waiting": waiting, "events": events}


# ============================ TEST RING (delivery proof) ============================
async def send_test_ring(partner_id: str, requested_by: str = "partner"):
    """Fire a synthetic incoming-job ring at ONE partner via every channel we use for
    real jobs (SSE full-screen ring + FCM data push). Nothing is booked; the ring
    is flagged is_test so the partner app dismisses it locally."""
    from services import realtime as rt
    from services import fcm_service
    u = await db.users.find_one({"id": partner_id, "role": "partner"}, {"_id": 0, "id": 1, "name": 1, "city": 1, "partner_status": 1})
    if not u:
        raise HTTPException(status_code=404, detail="Partner not found")
    tid = f"test-{new_id()[:8]}"
    brief = {
        "id": tid, "code": "TEST-RING", "is_test": True,
        "service_name": "Test job ring", "category_name": "Alert check",
        "service_image": "", "items": [{"name": "Test job ring — no real job", "qty": 1, "price": 0}], "items_count": 1,
        "customer_name": "AzoApp", "customer_phone": "",
        "city": u.get("city") or "Your area", "address_line": "This is a test alert. Tap Accept or Reject to dismiss.",
        "lat": None, "lng": None, "status": "searching", "schedule_type": "emergency",
        "scheduled_at": None, "total": 0, "partner_id": None, "partner_name": None,
    }
    rt.emit_user(partner_id, "job_request", brief)
    from services import push_dispatch
    push = await push_dispatch.push_to_user(
        partner_id, "Test job ring", "Agar ye dikh raha hai to alerts 100% kaam kar rahe hain.",
        link="/partner?job=" + tid + "&ring=open",
        data={"type": "job_request", "booking_id": tid, "code": "TEST-RING", "service_name": "Test job ring",
              "city": brief["city"], "address_line": brief["address_line"], "total": "0", "is_test": "1"},
        data_only=True)
    try:
        await db.push_test_rings.insert_one({"id": new_id(), "partner_id": partner_id, "requested_by": requested_by,
                                             "push": push, "partner_status": u.get("partner_status"), "at": now_iso()})
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "test_id": tid, "partner": {"id": u["id"], "name": u.get("name"), "partner_status": u.get("partner_status")},
            "sse": True, "push": push}

# ─────────────────────────────────────────────────────────────────────────────
# SERVICE-WISE RATINGS & REVIEWS (Point #12) — admin view of every customer review
# grouped by service, with per-service average + star distribution, and a flat
# filterable/paginated review list (which service/order, stars, comment).
# ─────────────────────────────────────────────────────────────────────────────
async def reviews_overview(service_id: str = "", rating: int = 0, q: str = "",
                           page: int = 1, page_size: int = 20):
    # Every reviewed booking (review is a sub-doc on the booking).
    rows = await db.bookings.find(
        {"review": {"$ne": None}},
        {"_id": 0, "id": 1, "code": 1, "service_id": 1, "service_name": 1,
         "category_name": 1, "partner_id": 1, "partner_name": 1,
         "customer_name": 1, "review": 1, "created_at": 1}).sort("created_at", -1).to_list(5000)

    def _flat(b):
        r = b.get("review") or {}
        return {
            "booking_id": b.get("id"),
            "booking_code": b.get("code") or r.get("booking_code"),
            "service_id": b.get("service_id") or "",
            "service_name": b.get("service_name") or r.get("service_name") or "Service",
            "category_name": b.get("category_name") or "",
            "partner_name": b.get("partner_name") or "",
            "customer_name": b.get("customer_name") or r.get("customer_name") or "Customer",
            "rating": int(r.get("rating") or 0),
            "comment": r.get("comment") or "",
            "at": r.get("at") or b.get("created_at"),
        }

    flat = [_flat(b) for b in rows]

    # Per-service rollup (average + count + star distribution) — used for the
    # "service-wise" grouped view.
    svc = {}
    for it in flat:
        key = it["service_id"] or it["service_name"]
        g = svc.setdefault(key, {
            "service_id": it["service_id"], "service_name": it["service_name"],
            "category_name": it["category_name"], "count": 0, "sum": 0,
            "dist": {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}, "latest_at": None})
        g["count"] += 1
        g["sum"] += it["rating"]
        if 1 <= it["rating"] <= 5:
            g["dist"][it["rating"]] += 1
        if not g["latest_at"] or (it["at"] or "") > g["latest_at"]:
            g["latest_at"] = it["at"]
    services = []
    for g in svc.values():
        services.append({
            "service_id": g["service_id"], "service_name": g["service_name"],
            "category_name": g["category_name"], "count": g["count"],
            "avg_rating": round(g["sum"] / g["count"], 2) if g["count"] else 0,
            "distribution": {str(k): v for k, v in g["dist"].items()},
            "latest_at": g["latest_at"],
        })
    services.sort(key=lambda s: (-s["count"], -s["avg_rating"]))

    # Filtered + paginated flat review list.
    ql = (q or "").strip().lower()
    filt = []
    for it in flat:
        if service_id and it["service_id"] != service_id:
            continue
        if rating and it["rating"] != int(rating):
            continue
        if ql and ql not in (
                (it["service_name"] or "").lower() + " " + (it["comment"] or "").lower()
                + " " + (it["customer_name"] or "").lower() + " " + (it["partner_name"] or "").lower()
                + " " + (it["booking_code"] or "").lower()):
            continue
        filt.append(it)

    total_all = len(flat)
    avg_all = round(sum(x["rating"] for x in flat) / total_all, 2) if total_all else 0
    page = max(1, int(page or 1))
    page_size = min(100, max(1, int(page_size or 20)))
    start = (page - 1) * page_size
    items = filt[start:start + page_size]
    return {
        "summary": {"total_reviews": total_all, "avg_rating": avg_all,
                    "services_reviewed": len(services)},
        "services": services,
        "items": items,
        "total": len(filt),
        "page": page,
        "page_size": page_size,
    }
