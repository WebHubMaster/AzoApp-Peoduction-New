"""Token Auto-Heal: admin health check must emit SSE 'push_reregister' when the Web API key
transitions from blocked -> ok. We flip settings.push_key_blocked=True to simulate the
previously-blocked state (the health check itself resets it to False)."""
import json
import os
import threading
import time

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

from conftest import API  # noqa: F401

be_env = dotenv_values("/app/backend/.env")
MONGO_URL = os.environ.get("MONGO_URL") or be_env.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or be_env.get("DB_NAME")


@pytest.fixture(scope="module")
def mongo():
    if not MONGO_URL or not DB_NAME:
        pytest.skip("MONGO_URL/DB_NAME missing")
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


def test_push_reregister_emitted_on_key_heal(mongo, admin, partner):
    health = admin.get(f"{API}/admin/notifications/health", timeout=40).json()
    if not (health.get("web_api_key") or {}).get("ok"):
        pytest.skip("web api key not ok in this env; auto-heal path cannot trigger")

    mongo.settings.update_one({"id": "global"}, {"$set": {"push_key_blocked": True}}, upsert=True)
    token = partner.headers["Authorization"].split(" ", 1)[1]
    received = []

    def reader():
        try:
            with requests.get(f"{API}/realtime/stream?token={token}", stream=True, timeout=25) as r:
                for raw in r.iter_lines(decode_unicode=True):
                    if raw and raw.startswith("data:"):
                        received.append(raw.split(":", 1)[1].strip())
                        if any("push_reregister" in x for x in received):
                            return
        except Exception as e:  # noqa: BLE001
            received.append(f"ERR {e}")

    t = threading.Thread(target=reader, daemon=True)
    t.start()
    time.sleep(3)
    r = admin.get(f"{API}/admin/notifications/health", timeout=60)
    assert r.status_code == 200, r.text

    deadline, found = time.time() + 10, None
    while time.time() < deadline and not found:
        for raw in list(received):
            try:
                p = json.loads(raw)
            except Exception:  # noqa: BLE001
                continue
            if p.get("type") == "push_reregister":
                found = p
                break
        if not found:
            time.sleep(0.5)
    assert found, f"no push_reregister event; got {received[:6]}"
    assert (found.get("data") or {}).get("reason") == "api_key_fixed", found
    # flag must have been cleared by the health check (idempotent: no repeat emits)
    s = mongo.settings.find_one({"id": "global"}, {"_id": 0, "push_key_blocked": 1})
    assert s.get("push_key_blocked") is False, s
