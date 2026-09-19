"""Geo helpers: reverse/forward geocoding + serviceability check.

Geocoding prefers **Google** (accurate street + pincode) using the admin-configured
`integrations.google_maps_api_key`, and transparently falls back to OpenStreetMap
Nominatim when no key is set or Google is unreachable. Best-effort throughout: if
everything upstream fails we still return the raw coordinates so GPS auto-detect
degrades gracefully. Serviceability rules are admin-configurable via Service Areas.
"""
import httpx
from config.database import db

NOMINATIM = "https://nominatim.openstreetmap.org/reverse"
NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search"
GOOGLE_GEOCODE = "https://maps.googleapis.com/maps/api/geocode/json"


async def _google_key() -> str:
    try:
        s = await db.settings.find_one({}) or {}
        return ((s.get("integrations") or {}).get("google_maps_api_key") or "").strip()
    except Exception:
        return ""


def _g_components(result: dict) -> dict:
    comps = result.get("address_components", []) or []

    def g(*types):
        for c in comps:
            if any(t in (c.get("types") or []) for t in types):
                return c.get("long_name", "")
        return ""

    return {
        "display": result.get("formatted_address", ""),
        "line": ", ".join([x for x in [g("premise"), g("street_number"), g("route"),
                            g("sublocality_level_1", "sublocality"), g("neighborhood")] if x]),
        "city": g("locality") or g("postal_town") or g("administrative_area_level_2") or g("sublocality"),
        "state": g("administrative_area_level_1"),
        "pincode": g("postal_code"),
    }


async def _google_reverse(lat: float, lng: float, key: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(GOOGLE_GEOCODE, params={"latlng": f"{lat},{lng}", "key": key})
        d = r.json()
    if d.get("status") != "OK" or not d.get("results"):
        return None
    out = _g_components(d["results"][0])
    out.update({"lat": float(lat), "lng": float(lng)})
    return out


async def _google_forward(query: str, key: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(GOOGLE_GEOCODE, params={"address": query, "region": "in", "key": key})
        d = r.json()
    if d.get("status") != "OK" or not d.get("results"):
        return None
    res = d["results"][0]
    comp = _g_components(res)
    loc = (res.get("geometry") or {}).get("location") or {}
    return {"found": True, "lat": float(loc.get("lat")), "lng": float(loc.get("lng")),
            "display": comp["display"], "city": comp["city"], "state": comp["state"],
            "pincode": comp["pincode"]}


async def forward_geocode(query: str) -> dict:
    """Resolve a free-text location (city / pincode / area) → coordinates.
    Google first (when a key is configured), else OSM Nominatim. Biased to India."""
    q = (query or "").strip()
    base = {"found": False, "lat": None, "lng": None, "display": "", "city": "", "state": "", "pincode": ""}
    if not q:
        return base
    key = await _google_key()
    if key:
        try:
            g = await _google_forward(q, key)
            if g and g.get("lat") is not None:
                return g
        except Exception:
            pass
    # OSM fallback: (1) India-restricted, then (2) '<q> India' unrestricted.
    attempts = [
        {"q": q, "format": "json", "addressdetails": 1, "limit": 1, "countrycodes": "in"},
        {"q": f"{q} India", "format": "json", "addressdetails": 1, "limit": 1},
    ]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            for params in attempts:
                r = await client.get(NOMINATIM_SEARCH, params=params,
                                     headers={"User-Agent": "AzoApp/1.0 (home-services)"})
                arr = r.json()
                if isinstance(arr, list) and arr:
                    d = arr[0]
                    a = d.get("address", {})
                    base.update({
                        "found": True, "lat": float(d.get("lat")), "lng": float(d.get("lon")),
                        "display": d.get("display_name", ""),
                        "city": a.get("city") or a.get("town") or a.get("village") or a.get("state_district") or "",
                        "state": a.get("state", ""), "pincode": a.get("postcode", ""),
                    })
                    return base
    except Exception:
        pass
    return base


async def reverse_geocode(lat: float, lng: float) -> dict:
    """(lat,lng) → {display,line,city,state,pincode}. Google first, OSM fallback."""
    base = {"display": "", "line": "", "city": "", "state": "", "pincode": "",
            "lat": float(lat), "lng": float(lng)}
    key = await _google_key()
    if key:
        try:
            g = await _google_reverse(lat, lng, key)
            if g and (g.get("pincode") or g.get("city") or g.get("display")):
                base.update(g)
                return base
        except Exception:
            pass
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(NOMINATIM, params={"lat": lat, "lon": lng, "format": "json", "addressdetails": 1},
                                 headers={"User-Agent": "AzoApp/1.0 (home-services)"})
            d = r.json()
            a = d.get("address", {})
            base["display"] = d.get("display_name", "")
            base["line"] = ", ".join([x for x in [a.get("house_number"), a.get("road"),
                                                   a.get("neighbourhood") or a.get("suburb")] if x])
            base["city"] = a.get("city") or a.get("town") or a.get("village") or a.get("state_district") or ""
            base["state"] = a.get("state", "")
            base["pincode"] = a.get("postcode", "")
    except Exception:
        pass
    return base


async def check_serviceable(pincode: str = "", address: dict = None) -> dict:
    """Serviceability is driven entirely by the admin-managed **Service Areas**
    (pincode lists, radius circles, custom polygons and city fallbacks). The old
    address_config.serviceable_pincodes list has been retired to keep a single
    source of truth. If no active service areas exist the platform is treated as
    open so nothing breaks before setup."""
    from services.engines import ServiceAreaEngine
    addr = address if address else {"pincode": str(pincode or "").strip()}
    cov = await ServiceAreaEngine.check(addr)
    reason = {"open": "no_areas_configured", "pincode": "in_area", "polygon": "in_area",
              "radius": "in_area", "city": "in_area", "none": "not_serviceable"}.get(
                  cov.get("match"), "checked")
    return {"serviceable": bool(cov.get("serviceable")), "reason": reason,
            "area": cov.get("area"), "match": cov.get("match"),
            "serviced_cities": cov.get("serviced_cities") or []}


def registration_block_message(pincode: str = "", serviced_cities=None) -> str:
    """English notice shown when a partner/merchant tries to register from a
    pincode that is outside the admin-configured Service Areas."""
    pin = str(pincode or "").strip()
    msg = "Registration is not available in your area yet."
    if pin:
        msg += f" Pincode {pin} is outside our current service areas."
    msg += (" Partner and merchant registration is allowed only within serviceable "
            "pincodes.")
    cities = [c for c in (serviced_cities or []) if c]
    if cities:
        msg += " We currently serve: " + ", ".join(cities[:12]) + "."
    msg += " Please contact support if you believe this is an error."
    return msg
