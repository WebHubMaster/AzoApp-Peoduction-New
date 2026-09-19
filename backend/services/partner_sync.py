"""Partner ↔ area/skill synchronisation.

Why this exists: partners register through the wizard with *category names*
("Electrician") and an address (city / pincode / GPS) that lives on the
partner_profiles document. The MatchingEngine, however, matches on the
service's ``required_skill`` key ("electrical") and on the user document's
``service_pincodes`` / ``city`` / coordinates. When those were never copied
over, a perfectly available partner in the customer's own area never received
a job alert. This module makes the two worlds consistent:

* ``normalize_skills``  – category name / slug / id / key  →  canonical skill key
* ``zone_for``          – which admin Service Area covers a pincode / point
* ``sync_partner``      – copy area + skills from the registration profile to
                          the user document (idempotent, fills gaps only)
* ``repair_all_partners`` – run ``sync_partner`` for every partner (startup)
"""
from __future__ import annotations

from math import radians, sin, cos, asin, sqrt
import logging

from config.database import db, now_iso

logger = logging.getLogger("azoapp.partner_sync")


# ----------------------------------------------------------------- skills
def _norm(s) -> str:
    return " ".join(str(s or "").strip().lower().replace("&", " ").replace("-", " ").replace("_", " ").split())


async def skill_alias_map() -> dict:
    """alias (normalised) -> canonical required_skill key, built from categories
    (name, slug, id, required_skill) plus the partner skills catalog."""
    amap: dict = {}
    cats = await db.categories.find({}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "required_skill": 1}).to_list(500)
    for c in cats:
        key = (c.get("required_skill") or "").strip().lower()
        if not key:
            continue
        for alias in (key, c.get("name"), c.get("slug"), c.get("id")):
            if alias:
                amap[_norm(alias)] = key
                amap[str(alias).strip().lower()] = key
    try:
        for s in await db.partner_skills_catalog.find({}, {"_id": 0, "name": 1, "category_id": 1, "category": 1, "skill": 1}).to_list(1000):
            key = amap.get(str(s.get("category_id") or "").lower()) or amap.get(_norm(s.get("category"))) \
                or amap.get(_norm(s.get("skill"))) or amap.get(_norm(s.get("name")))
            if key and s.get("name"):
                amap.setdefault(_norm(s["name"]), key)
    except Exception:  # noqa: BLE001
        pass
    return amap


def normalize_skills(skills, amap: dict) -> list:
    """Map every stored skill (name / slug / key) to its canonical key; unknown
    values are kept (lower-cased) so nothing is silently lost."""
    out = []
    for s in skills or []:
        if s is None:
            continue
        k = amap.get(_norm(s)) or amap.get(str(s).strip().lower()) or str(s).strip().lower()
        if k and k not in out:
            out.append(k)
    return out


def skill_aliases(skill_key: str, amap: dict) -> list:
    """All stored spellings that mean this skill key (for $in queries)."""
    k = (skill_key or "").strip().lower()
    if not k:
        return []
    out = {k}
    for alias, key in amap.items():
        if key == k:
            out.add(alias)
            out.add(alias.title())
    return sorted(out)


def skill_matches(partner_skills, skill_key: str, amap: dict) -> bool:
    if not skill_key:
        return True
    return skill_key.lower() in normalize_skills(partner_skills, amap)


# ------------------------------------------------------------------ zones
def haversine_km(a, b) -> float:
    lat1, lon1 = radians(a[0]), radians(a[1])
    lat2, lon2 = radians(b[0]), radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * 6371.0 * asin(sqrt(h))


def _point_in_polygon(pt, poly) -> bool:
    """Ray-casting; poly = [{lat,lng}, ...] or [[lat,lng], ...]."""
    try:
        pts = [(float(p["lat"]), float(p["lng"])) if isinstance(p, dict) else (float(p[0]), float(p[1])) for p in poly]
    except Exception:  # noqa: BLE001
        return False
    if len(pts) < 3:
        return False
    x, y = pt[0], pt[1]
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def _zone_center(z):
    c = z.get("center") or {}
    lat = c.get("lat", z.get("lat", z.get("center_lat")))
    lng = c.get("lng", z.get("lng", z.get("center_lng")))
    try:
        if lat is not None and lng is not None:
            return (float(lat), float(lng))
    except (TypeError, ValueError):
        pass
    return None


async def active_zones() -> list:
    return await db.service_areas.find({"status": {"$ne": "inactive"}}, {"_id": 0}).to_list(1000)


def zone_contains(z: dict, pincode: str = None, coords=None, city: str = None) -> bool:
    """Does Service Area ``z`` cover this pincode / point / city?"""
    pins = [str(x).strip() for x in (z.get("pincodes") or []) if str(x).strip()]
    if pincode and str(pincode).strip() in pins:
        return True
    if coords:
        poly = z.get("polygon") or z.get("polygon_points")
        if poly and _point_in_polygon(coords, poly):
            return True
        ctr = _zone_center(z)
        try:
            r = float(z.get("radius_km") or 0)
        except (TypeError, ValueError):
            r = 0
        if ctr and r and haversine_km(ctr, coords) <= r:
            return True
    if city and not pincode and not coords and _norm(z.get("city")) == _norm(city):
        return True
    return False


def zone_for(zones: list, pincode: str = None, coords=None, city: str = None):
    for z in zones or []:
        if zone_contains(z, pincode, coords, city):
            return z
    return None


# ------------------------------------------------------------- partner sync
def _partner_coords(u: dict):
    for src in (u.get("live_location"), u.get("location"), u.get("address")):
        if isinstance(src, dict):
            try:
                if src.get("lat") is not None and src.get("lng") is not None:
                    return (float(src["lat"]), float(src["lng"]))
            except (TypeError, ValueError):
                continue
    return None


async def sync_partner(user_id: str, amap: dict = None, zones: list = None) -> dict:
    """Bring a partner's user document in line with their registration profile
    and the admin Service Areas. Idempotent: normalises skills, fills missing
    city/state/pincode/address/location, and derives service_pincodes when the
    partner has none configured (own pincode + pincodes of the zone that covers
    them). Returns the $set applied (empty when nothing changed)."""
    u = await db.users.find_one({"id": user_id, "role": "partner"}, {"_id": 0})
    if not u:
        return {}
    amap = amap if amap is not None else await skill_alias_map()
    zones = zones if zones is not None else await active_zones()
    prof = await db.partner_profiles.find_one({"user_id": user_id}, {"_id": 0, "basic": 1, "address": 1, "work": 1}) or {}
    basic = prof.get("basic") or {}
    paddr = prof.get("address") or {}
    upd: dict = {}

    # --- skills → canonical keys (union of user.skills + registration categories)
    raw = list(u.get("skills") or []) + [c.get("category_name") for c in (prof.get("work") or {}).get("categories", []) if c.get("category_name")]
    norm = normalize_skills(raw, amap)
    if norm and norm != list(u.get("skills") or []):
        upd["skills"] = norm
        # keep the human labels for display
        upd["skill_names"] = sorted({c.get("category_name") for c in (prof.get("work") or {}).get("categories", []) if c.get("category_name")}) or u.get("skill_names") or []

    # --- area fields from registration when missing on the user
    for key in ("city", "state", "district"):
        if not u.get(key) and basic.get(key):
            upd[key] = str(basic[key]).strip()
    own_pin = str(u.get("pincode") or basic.get("pincode") or (u.get("address") or {}).get("pincode") or "").strip()
    if own_pin and not u.get("pincode"):
        upd["pincode"] = own_pin

    # --- structured address + coordinates from the registration map pin
    ua = u.get("address") if isinstance(u.get("address"), dict) else {}
    if paddr and (paddr.get("lat") is not None) and (not ua or ua.get("lat") is None):
        upd["address"] = {
            **ua,
            "line": ua.get("line") or paddr.get("manual_address") or paddr.get("location_address") or "",
            "city": ua.get("city") or basic.get("city") or u.get("city") or "",
            "state": ua.get("state") or basic.get("state") or u.get("state") or "",
            "pincode": ua.get("pincode") or own_pin,
            "lat": paddr.get("lat"), "lng": paddr.get("lng"),
        }
    if not isinstance(u.get("location"), dict) or u["location"].get("lat") is None:
        src = paddr if paddr.get("lat") is not None else (ua if ua.get("lat") is not None else None)
        if src:
            upd["location"] = {"lat": src.get("lat"), "lng": src.get("lng")}

    # --- serviceable pincodes: own pincode + the zone that covers the partner
    pins = [str(x).strip() for x in (u.get("service_pincodes") or []) if str(x).strip()]
    if not pins:
        merged = [own_pin] if own_pin else []
        coords = _partner_coords({**u, **upd})
        city = upd.get("city") or u.get("city")
        z = zone_for(zones, own_pin or None, coords, city)
        if z:
            for pz in (z.get("pincodes") or []):
                pz = str(pz).strip()
                if pz and pz not in merged:
                    merged.append(pz)
            upd["service_area_id"] = z.get("id")
            upd["service_area_name"] = z.get("name")
            if not (upd.get("city") or u.get("city")) and z.get("city"):
                upd["city"] = z["city"]
        if merged:
            upd["service_pincodes"] = merged
    elif not u.get("service_area_id"):
        z = zone_for(zones, pins[0], None, None) or zone_for(zones, None, _partner_coords(u), None)
        if z:
            upd["service_area_id"] = z.get("id")
            upd["service_area_name"] = z.get("name")

    if upd:
        upd["area_synced_at"] = now_iso()
        await db.users.update_one({"id": user_id}, {"$set": upd})
    return upd


async def repair_all_partners() -> int:
    """Startup / admin maintenance: sync every partner. Returns count updated."""
    amap = await skill_alias_map()
    zones = await active_zones()
    ids = [u["id"] for u in await db.users.find({"role": "partner"}, {"_id": 0, "id": 1}).to_list(10000)]
    n = 0
    for pid in ids:
        try:
            if await sync_partner(pid, amap, zones):
                n += 1
        except Exception as e:  # noqa: BLE001
            logger.warning("partner sync failed for %s: %s", pid, e)
    if n:
        logger.info("partner_sync: repaired %d partner(s)", n)
    return n


# ----------------------------------------------------------- serviceability
def partner_serves(p: dict, address: dict, limit_km: float, zones: list, cust_zone: dict = None):
    """Realistic area check used by dispatch + admin assign.

    Returns (ok, dist_km, reason). Checked in order:
      too_far  – partner's live position is known and farther than limit_km →
                 never eligible (cannot reach in time), even if pincode matches
      pincode  – customer's pincode is one of the partner's serviceable pincodes
                 (or the partner's own pincode)
      zone     – partner sits inside the same admin Service Area as the customer
                 (by their pincode(s) or live GPS) — pincode lists need not match
      gps      – partner configured NO pincodes: live position within limit_km
      city     – partner has no pincodes and no GPS: same city
      unknown  – neither side has any area data (never block legacy data)
    Partners outside these rules are handled by the nearby-area wave.
    """
    address = address or {}
    cust_pin = str(address.get("pincode") or "").strip()
    cust_city = _norm(address.get("city"))
    cust_coords = None
    try:
        if address.get("lat") is not None and address.get("lng") is not None:
            cust_coords = (float(address["lat"]), float(address["lng"]))
    except (TypeError, ValueError):
        cust_coords = None
    p_pins = [str(x).strip() for x in (p.get("service_pincodes") or []) if str(x).strip()]
    own_pin = str(p.get("pincode") or (p.get("address") or {}).get("pincode") or "").strip()
    p_city = _norm(p.get("city"))
    p_coords = _partner_coords(p)
    dist = haversine_km(cust_coords, p_coords) if (cust_coords and p_coords) else None
    if dist is not None and limit_km and dist > float(limit_km):
        return False, dist, "too_far"
    if cust_pin and (cust_pin in p_pins or (own_pin and own_pin == cust_pin)):
        return True, dist, "pincode"
    if cust_zone is None and zones:
        cust_zone = zone_for(zones, cust_pin or None, cust_coords, address.get("city"))
    if cust_zone and (zone_contains(cust_zone, own_pin or None, p_coords, None)
                      or any(zone_contains(cust_zone, pz) for pz in p_pins)):
        return True, dist, "zone"
    if not p_pins:
        if dist is not None:
            return True, dist, "gps"          # already known to be within limit_km
        if p_coords is None:
            if cust_city and p_city:
                return (p_city == cust_city), dist, "city"
            if (not cust_pin and not cust_city) or (not p_city and not own_pin):
                return True, dist, "unknown"
        if not cust_pin and not cust_coords:
            return True, dist, "unknown"
        return False, dist, "no_match"
    if cust_pin:
        return False, dist, "pincode_mismatch"
    if cust_city and p_city:
        return (p_city == cust_city), dist, "city"
    return (dist is None and not cust_coords), dist, "no_data"
