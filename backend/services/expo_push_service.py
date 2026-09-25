"""Expo Push channel — sends to devices registered with an ExponentPushToken (Customer/Partner Expo apps)."""
import logging
import httpx
from config.database import db

log = logging.getLogger("azoapp")
EXPO_URL = "https://exp.host/--/api/v2/push/send"


async def send_to_user(user_id: str, title: str, body: str, link: str = "/", data: dict = None) -> dict:
    rows = await db.fcm_devices.find({"user_id": user_id, "is_active": {"$ne": False},
                                      "token": {"$regex": "^ExponentPushToken"}}).to_list(200)
    if not rows:
        return {"success": 0, "failure": 0, "skipped": "no_expo_devices"}
    msgs = [{"to": r["token"], "title": title, "body": body, "sound": "default", "priority": "high",
             "channelId": "default", "data": {"link": link, **{k: str(v) for k, v in (data or {}).items()}}} for r in rows]
    ok = fail = 0
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(EXPO_URL, json=msgs, headers={"Accept": "application/json", "Content-Type": "application/json"})
            out = r.json().get("data", []) if r.status_code == 200 else []
        for row, res in zip(rows, out):
            if res.get("status") == "ok":
                ok += 1
            else:
                fail += 1
                if (res.get("details") or {}).get("error") == "DeviceNotRegistered":
                    await db.fcm_devices.update_one({"id": row.get("id")}, {"$set": {"is_active": False}})
    except Exception as e:  # noqa: BLE001
        log.warning("expo push failed: %s", e)
        return {"success": ok, "failure": len(rows) - ok, "error": str(e)[:120]}
    return {"success": ok, "failure": fail}
