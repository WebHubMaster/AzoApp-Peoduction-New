"""Unified push dispatch.

Sends a notification via BOTH channels so the SAME event reaches a user's web
panel (standard VAPID Web Push) AND their native app (FCM / APK). A device
registers with only ONE channel, so there are no duplicates. Never raises;
returns a merged {success, failure, skipped?, error?, channels} shape that is
drop-in compatible with the old fcm_service.send_to_user callers.
"""


async def push_to_user(user_id: str, title: str, body: str, link: str = "/",
                       data: dict = None, image: str = None, data_only: bool = False) -> dict:
    channels = {}
    try:
        from services.webpush_service import send_to_user as webpush_send
        channels["webpush"] = await webpush_send(user_id, title, body, link, data, image=image, data_only=data_only)
    except Exception as e:  # noqa: BLE001
        channels["webpush"] = {"error": str(e)[:150]}
    try:
        from services.fcm_service import send_to_user as fcm_send
        channels["fcm"] = await fcm_send(user_id, title, body, link, data, image=image, data_only=data_only)
    except Exception as e:  # noqa: BLE001
        channels["fcm"] = {"error": str(e)[:150]}
    # Expo push fallback — a device registered with an ExponentPushToken (older
    # Customer builds without a bundled google-services.json) is skipped by
    # fcm_service (it only sends to raw FCM tokens). Send to those tokens too so the
    # user still gets an alert; native FCM builds simply have no Expo token, so this
    # never duplicates. Expo can't render a lock-screen full-screen intent, so it is a
    # best-effort tray fallback until the raw-FCM (google-services.json) build ships.
    try:
        from services.expo_push_service import send_to_user as expo_send
        channels["expo"] = await expo_send(user_id, title, body, link, data)
    except Exception as e:  # noqa: BLE001
        channels["expo"] = {"error": str(e)[:150]}

    wp = channels.get("webpush") or {}
    fc = channels.get("fcm") or {}
    ex = channels.get("expo") or {}
    success = int(wp.get("success") or 0) + int(fc.get("success") or 0) + int(ex.get("success") or 0)
    failure = int(wp.get("failure") or 0) + int(fc.get("failure") or 0) + int(ex.get("failure") or 0)
    out = {"success": success, "failure": failure, "channels": channels}
    if success == 0 and failure == 0:
        # Nothing was delivered on either channel — surface the most useful reason.
        out["skipped"] = fc.get("skipped") or wp.get("skipped") or "no_devices"
    err = fc.get("error") or wp.get("error")
    if err:
        out["error"] = err
    return out
