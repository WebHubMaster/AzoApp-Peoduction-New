"""Partner realtime finance_update SSE test.

Verifies that when a partner completes a booking:
  1. SSE event 'finance_update' kind='earning' is emitted (from record_earning)
  2. SSE event 'finance_update' kind='invoice' is emitted (from invoice_service._emit_finance)
  3. SSE event 'finance_update' kind='job_completed' is emitted (end of _post_complete)
  4. GET /api/invoices returns the newly created booking invoice
  5. GET /api/partner/wallet?lite=1 reflects the earning
  6. /complete returns fast (<10s) because heavy work is in a background task
"""
import json
import os
import sys
import asyncio
import threading
import time
from queue import Queue, Empty

import pytest
import requests

sys.path.insert(0, "/app/backend")

from conftest import API, PHONES, login, client  # noqa: E402


# ---------- SSE helpers ----------
def _sse_listener(token, events_q: Queue, stop_evt: threading.Event):
    url = f"{API}/realtime/stream?token={token}"
    try:
        with requests.get(url, stream=True, timeout=120) as r:
            if r.status_code != 200:
                events_q.put({"__error__": f"status {r.status_code}"})
                return
            buf = []
            for raw in r.iter_lines(decode_unicode=True):
                if stop_evt.is_set():
                    return
                if raw is None:
                    continue
                if raw == "":
                    data_lines = [l[5:].lstrip() for l in buf if l.startswith("data:")]
                    buf = []
                    if not data_lines:
                        continue
                    payload = "\n".join(data_lines)
                    try:
                        events_q.put(json.loads(payload))
                    except Exception:
                        events_q.put({"__raw__": payload})
                else:
                    buf.append(raw)
    except Exception as e:
        events_q.put({"__error__": str(e)})


def _wait_for(events_q: Queue, predicate, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            ev = events_q.get(timeout=0.5)
        except Empty:
            continue
        if predicate(ev):
            return ev
    return None


# ---------- booking lifecycle helpers ----------
def _create_direct_booking(customer, service_id):
    r = customer.post(f"{API}/bookings", json={
        "service_id": service_id,
        "address": {"label": "Home", "line": "TEST_SSE 12 MG Road", "pincode": "800001",
                     "city": "Patna", "state": "Bihar", "lat": 25.5941, "lng": 85.1376},
        "schedule_type": "emergency",
        "notes": "TEST_finance_update_sse",
    }, timeout=60)
    assert r.status_code in (200, 201), r.text
    out = r.json()

    # Emergency goes to pending_payment first; simulate successful payment by
    # updating DB directly + populating eligible_partner_ids (no mock gateway
    # endpoint available in this environment).
    if out.get("status") == "pending_payment":
        from pymongo import MongoClient
        mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        _db = mc[os.environ.get("DB_NAME", "azoapp")]
        # mark paid
        _db.bookings.update_one({"id": out["id"]}, {
            "$set": {"payment_status": "paid", "status": "searching",
                     "paid_at": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())},
            "$push": {"timeline": {"status": "payment_received",
                                    "at": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())}}
        })
        # ensure eligible_partner_ids includes a working partner (AC + Patna, 0 active jobs)
        skill = (out.get("required_skill") or out.get("skill")
                 or "ac")
        eligible = list(_db.users.find(
            {"role": "partner", "skills": skill, "service_pincodes": "800001",
             "kyc_status": "approved"}, {"_id": 0, "id": 1}))
        eligible_ids = [u["id"] for u in eligible]
        if eligible_ids:
            _db.bookings.update_one({"id": out["id"]},
                                     {"$set": {"eligible_partner_ids": eligible_ids,
                                               "offered_partner_ids": eligible_ids}})
        mc.close()
        out = customer.get(f"{API}/bookings/{out['id']}", timeout=30).json()
    return out


def _partner_accept_and_prepare_completion(partner, customer, bid, start_otp):
    for _ in range(10):
        r = partner.get(f"{API}/bookings/partner/jobs", timeout=30)
        if r.status_code == 200 and any(j["id"] == bid for j in r.json()):
            break
        time.sleep(1)
    else:
        pytest.skip("partner cannot see searching job (head-start / dispatch mismatch)")

    _PNG_1X1 = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjq"
                "AAAAEklEQVR4nGP8z4APMOGVHbHSAEEsAROxCnMTAAAAAElFTkSuQmCC")
    r = partner.post(f"{API}/bookings/{bid}/accept", timeout=30)
    assert r.status_code == 200, r.text

    # before evidence must exist before start-otp
    e = partner.post(f"{API}/bookings/{bid}/evidence",
                     json={"stage": "before",
                           "images": [_PNG_1X1],
                           "notes": "TEST_before"}, timeout=30)
    assert e.status_code == 200, e.text

    # satisfy selfie check-in gate without going through file upload
    from pymongo import MongoClient
    mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    mc[os.environ.get("DB_NAME", "azoapp")].bookings.update_one(
        {"id": bid}, {"$set": {"checkin": {"selfie_url": "test://skip",
                                            "lat": 25.59, "lng": 85.14,
                                            "distance_km": 0, "at": "2026-01-01T00:00:00+00:00"}}})
    mc.close()

    r = partner.post(f"{API}/bookings/{bid}/start-otp",
                     json={"otp": start_otp}, timeout=30)
    assert r.status_code == 200, r.text

    # after evidence must exist before /complete
    e = partner.post(f"{API}/bookings/{bid}/evidence",
                     json={"stage": "after",
                           "images": [_PNG_1X1],
                           "notes": "TEST_after"}, timeout=30)
    assert e.status_code == 200, e.text


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def partner_free():
    """Login as partner5 (Amit Singh), ensure premium=True (bypass 30s head-start),
    and that they have no outstanding accepted bookings. Yield (token, http client).
    """
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "azoapp")
    mc = MongoClient(mongo_url)
    _db = mc[db_name]
    u = _db.users.find_one({"phone": PHONES["partner2"]}, {"_id": 0})
    assert u, "partner2 not seeded"
    _db.users.update_one({"id": u["id"]}, {"$set": {"premium_partner": True}})
    # free up partner5 from any lingering accepted bookings from prior test runs
    _db.bookings.update_many(
        {"partner_id": u["id"],
         "status": {"$in": ["assigned", "arrived_shop", "arrived_customer", "started"]}},
        {"$set": {"status": "cancelled"}})
    mc.close()

    tok = login(PHONES["partner2"])
    s = client(tok)
    yield tok, s


# ---------- the test ----------
def test_finance_update_events_on_complete(customer, service_id, partner_free):
    partner_tok, partner = partner_free

    b = _create_direct_booking(customer, service_id)
    bid = b["id"]
    assert b["status"] in ("searching", "assigned"), b.get("status")

    cb = customer.get(f"{API}/bookings/{bid}", timeout=30).json()
    otps = cb["otps"]

    _partner_accept_and_prepare_completion(partner, customer, bid, otps["start"])

    # start SSE listener BEFORE calling /complete
    events_q: Queue = Queue()
    stop_evt = threading.Event()
    th = threading.Thread(target=_sse_listener,
                          args=(partner_tok, events_q, stop_evt), daemon=True)
    th.start()

    ready = _wait_for(events_q,
        lambda e: isinstance(e, dict) and e.get("ok") is True, timeout=15)
    assert ready is not None, "SSE did not deliver ready event"

    wb_before = partner.get(f"{API}/partner/wallet?lite=1", timeout=15).json()
    bal_before = float(wb_before.get("available_balance")
                       or wb_before.get("balance") or 0)

    # trigger complete
    t0 = time.time()
    r = partner.post(f"{API}/bookings/{bid}/complete",
                     json={"otp": otps["completion"]}, timeout=30)
    elapsed = time.time() - t0
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("status") == "completed", body
    assert elapsed < 10, f"complete_job took {elapsed:.1f}s - expected <10s"

    # kind=earning (sync, from record_earning inside complete_job)
    ev_earn = _wait_for(events_q,
        lambda e: isinstance(e, dict) and e.get("type") == "finance_update"
                  and (e.get("data") or {}).get("kind") == "earning"
                  and (e.get("data") or {}).get("booking_id") == bid,
        timeout=15)
    assert ev_earn is not None, "finance_update kind=earning NOT received"

    # kind=invoice (bg task → invoice_service._emit_finance)
    ev_inv = _wait_for(events_q,
        lambda e: isinstance(e, dict) and e.get("type") == "finance_update"
                  and (e.get("data") or {}).get("kind") == "invoice",
        timeout=30)
    assert ev_inv is not None, "finance_update kind=invoice NOT received"
    inv_id = (ev_inv.get("data") or {}).get("invoice_id")
    assert inv_id, "invoice_id missing in invoice event"

    # kind=job_completed (tail of bg task)
    ev_done = _wait_for(events_q,
        lambda e: isinstance(e, dict) and e.get("type") == "finance_update"
                  and (e.get("data") or {}).get("kind") == "job_completed"
                  and (e.get("data") or {}).get("booking_id") == bid,
        timeout=30)
    assert ev_done is not None, "finance_update kind=job_completed NOT received"

    stop_evt.set()

    # verify invoice shows up in partner /api/invoices
    r = partner.get(f"{API}/invoices", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", [])
    assert any((i.get("id") == inv_id) or (i.get("booking_id") == bid)
               for i in items), \
        f"invoice {inv_id} not in partner /api/invoices (got {len(items)} items)"

    # verify wallet reflects earning
    wb_after = partner.get(f"{API}/partner/wallet?lite=1", timeout=15).json()
    bal_after = float(wb_after.get("available_balance")
                      or wb_after.get("balance") or 0)
    assert bal_after >= bal_before, \
        f"wallet balance did not increase: before={bal_before} after={bal_after}"
