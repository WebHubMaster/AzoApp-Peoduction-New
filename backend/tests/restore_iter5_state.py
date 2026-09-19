"""One-off cleanup/restore after iteration-5 testing:
- restore admin alert_config to seed values (tone classic, volume 0.7, dnd off)
- remove any leftover QA fcm_devices token
- restore Kundan Kumar's push_state to the token_failed report (seed-like state)
"""
import requests
from conftest import API, PHONES, client, login


def main():
    admin = client(login(PHONES["admin"]))
    r = admin.put(f"{API}/admin/settings", json={"alert_config": {
        "tone": "classic", "volume": 0.7, "dnd_enabled": False,
        "dnd_start": "22:00", "dnd_end": "07:00",
        "custom_sound_url": "", "custom_sound_name": ""}}, timeout=60)
    print("alert_config restored:", r.status_code, r.json().get("alert_config"))

    kundan = client(login("+918252754050"))
    print("my-devices:", kundan.get(f"{API}/notifications/my-devices", timeout=30).json())
    s = kundan.post(f"{API}/notifications/push-status", json={
        "ok": False, "reason": "token_failed", "error": "installations/request-failed",
        "permission": "granted", "user_agent": "restore"}, timeout=30)
    print("push-status restored:", s.status_code, s.text[:100])


if __name__ == "__main__":
    main()
