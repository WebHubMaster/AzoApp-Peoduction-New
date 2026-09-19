"""India location cascade (State -> District -> City/SubDistrict -> Village).

Data imported once from /app/backend/data/geo_data.json into Mongo:
  geo_states  : {id, name, name_lower}
  geo_districts: {id, state, name, name_lower}
  geo_cities  : {id, state, district, name, name_lower, villages:[...]}
NOTE: source dataset has NO pincode field, so pincode is captured manually /
via GPS reverse-geocode in the address step.
"""
import json
import re
from pathlib import Path
from config.database import db
from models.user import new_id

DATA_FILE = Path(__file__).parent.parent / "data" / "geo_data.json"


def _low(s: str) -> str:
    return (s or "").strip().lower()


async def import_geo(force: bool = False):
    """Idempotent bulk import. Skips if already imported unless force=True."""
    existing = await db.geo_states.count_documents({})
    if existing > 0 and not force:
        return {"imported": False, "states": existing}

    if force:
        await db.geo_states.delete_many({})
        await db.geo_districts.delete_many({})
        await db.geo_cities.delete_many({})

    if not DATA_FILE.exists():
        return {"imported": False, "error": "geo_data.json missing"}

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    states, districts, cities = [], [], []
    for s in data:
        sname = (s.get("state") or "").strip()
        if not sname:
            continue
        states.append({"id": new_id(), "name": sname, "name_lower": _low(sname)})
        for d in s.get("districts", []):
            dname = (d.get("district") or "").strip()
            if not dname:
                continue
            districts.append({"id": new_id(), "state": sname, "name": dname,
                              "name_lower": _low(dname)})
            for sd in d.get("subDistricts", []):
                cname = (sd.get("subDistrict") or "").strip()
                if not cname:
                    continue
                villages = [v for v in (sd.get("villages") or []) if v]
                cities.append({"id": new_id(), "state": sname, "district": dname,
                               "name": cname, "name_lower": _low(cname),
                               "villages": villages})

    if states:
        await db.geo_states.insert_many(states)
    # batch inserts for the large collections
    for coll, rows in (("geo_districts", districts), ("geo_cities", cities)):
        for i in range(0, len(rows), 2000):
            await db[coll].insert_many(rows[i:i + 2000])

    await db.geo_states.create_index("name_lower")
    await db.geo_districts.create_index([("state", 1), ("name_lower", 1)])
    await db.geo_cities.create_index([("state", 1), ("district", 1), ("name_lower", 1)])

    return {"imported": True, "states": len(states),
            "districts": len(districts), "cities": len(cities)}


def _rx(q: str):
    return re.compile(re.escape(q.strip()), re.IGNORECASE) if q and q.strip() else None


async def list_states(q: str = "", limit: int = 60):
    query = {}
    if _rx(q):
        query["name_lower"] = {"$regex": _low(q)}
    rows = await db.geo_states.find(query, {"_id": 0, "id": 1, "name": 1}) \
        .sort("name", 1).limit(limit).to_list(limit)
    return rows


async def list_districts(state: str, q: str = "", limit: int = 100):
    query = {"state": state}
    if q and q.strip():
        query["name_lower"] = {"$regex": _low(q)}
    rows = await db.geo_districts.find(query, {"_id": 0, "id": 1, "name": 1}) \
        .sort("name", 1).limit(limit).to_list(limit)
    return rows


async def list_cities(state: str, district: str, q: str = "", limit: int = 200):
    query = {"state": state, "district": district}
    if q and q.strip():
        query["name_lower"] = {"$regex": _low(q)}
    rows = await db.geo_cities.find(query, {"_id": 0, "id": 1, "name": 1}) \
        .sort("name", 1).limit(limit).to_list(limit)
    return rows


async def list_villages(state: str, district: str, city: str, q: str = "", limit: int = 100):
    doc = await db.geo_cities.find_one(
        {"state": state, "district": district, "name": city},
        {"_id": 0, "villages": 1})
    villages = (doc or {}).get("villages", [])
    if q and q.strip():
        ql = _low(q)
        villages = [v for v in villages if ql in v.lower()]
    return villages[:limit]
