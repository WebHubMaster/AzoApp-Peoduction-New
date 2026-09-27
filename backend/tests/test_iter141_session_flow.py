"""Iteration 141 — Service Session Flow (Start OTP + Complete + Photo).
Tests the maid session flow, OTP secrecy, negative cases, and regressions.
"""
import os
import base64
import datetime as dt
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

HOME_MAID_SERVICE = "43819c8e-d300-4626-a1c0-dc452eddb667"
ADDRESS_ID = "57ab979b-f623-41e3-bd7b-08fe3cbd1caf"

# Existing seed data referenced by main agent
SUB_LAKSHMI_FUTURE = "SUBZXRGVG"   # Lakshmi monthly, start_date in the future
SUB_SUNITA_MONTHLY = "SUBOI7PPF"   # Sunita monthly, has history

# 1x1 png (base64)
PNG_B64 = ("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIA"
           "AAUAAeImBZsAAAAASUVORK5CYII=")
PHOTO_DATA_URL = "data:image/png;base64," + PNG_B64


def _login(phone):
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=10)
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": "123456"}, timeout=10)
    assert r.status_code == 200, r.text
    tok = r.json().get("token")
    assert tok
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def hdr_customer():
    return _login("+919000000004")


@pytest.fixture(scope="module")
def hdr_admin():
    return _login("+919000000000")


@pytest.fixture(scope="module")
def hdr_maid_anita():
    return _login("+919000000023")


@pytest.fixture(scope="module")
def hdr_maid_lakshmi():
    return _login("+919000000022")


@pytest.fixture(scope="module")
def hdr_maid_sunita():
    return _login("+919000000020")


@pytest.fixture(scope="module")
def hdr_raj():
    return _login("+919000000003")


def _today():
    return dt.datetime.utcnow().date().isoformat()


# ----------- Setup fresh daily sub -----------

@pytest.fixture(scope="module")
def fresh_daily_sub(hdr_customer, hdr_admin, hdr_maid_anita):
    """Create a fresh daily subscription, pay, assign to Anita.
    Since today (2026-09-27) is Sunday = weekly_off for Home Maid, we patch today's
    day to 'scheduled' with a known OTP directly in MongoDB so the live start flow
    can be exercised end-to-end. This preserves the invariant that the schedule
    always carries a 4-digit OTP for scheduled days (that's what build_schedule
    does — we're just re-labeling the day so it becomes exercisable)."""
    payload = {
        "service_id": HOME_MAID_SERVICE,
        "plan": "daily",
        "start_date": _today(),
        "address_id": ADDRESS_ID,
    }
    r = requests.post(f"{API}/subscriptions", json=payload, headers=hdr_customer, timeout=15)
    assert r.status_code in (200, 201), r.text
    sub = r.json()
    sid = sub["id"]

    # pay mock
    r = requests.post(f"{API}/subscriptions/{sid}/pay/mock", json={}, headers=hdr_customer, timeout=15)
    assert r.status_code == 200, r.text

    # admin assign to Anita
    r2 = requests.get(f"{API}/subscriptions/admin/{sid}/partners", headers=hdr_admin, timeout=10)
    assert r2.status_code == 200, r2.text
    partners = r2.json()
    anita = next((p for p in partners if "9000000023" in str(p.get("phone", ""))), None)
    assert anita, f"Anita not found in eligible partners: {partners[:3]}"
    r = requests.post(f"{API}/subscriptions/admin/{sid}/assign",
                      json={"partner_id": anita["id"]}, headers=hdr_admin, timeout=10)
    assert r.status_code == 200, r.text

    # If today is weekly_off (Sunday), promote it to scheduled in-place so we can
    # exercise the live OTP start/complete flow. Directly touches MongoDB.
    import pymongo, os
    mc = pymongo.MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = mc[os.environ.get("DB_NAME", "azoapp")]
    today = _today()
    doc = db.subscriptions.find_one({"id": sid})
    changed = False
    for d in doc.get("schedule", []):
        if d["date"] == today and d["status"] == "weekly_off":
            d["status"] = "scheduled"
            if not d.get("otp"):
                d["otp"] = "1234"
            changed = True
            break
    if changed:
        db.subscriptions.update_one({"id": sid}, {"$set": {"schedule": doc["schedule"]}})
    mc.close()
    return sid


# ---------- OTP visibility ----------

def test_customer_sees_otp_partner_does_not(fresh_daily_sub, hdr_customer, hdr_maid_anita):
    sid = fresh_daily_sub

    r = requests.get(f"{API}/subscriptions/mine", headers=hdr_customer, timeout=10)
    assert r.status_code == 200, r.text
    mine = r.json()
    sub_c = next((s for s in mine if s["id"] == sid), None)
    assert sub_c, "Customer should see the new sub"
    # OTP must be set for every non-weekly_off scheduled day
    sched_days = [d for d in sub_c.get("schedule", []) if d.get("status") == "scheduled"]
    assert sched_days, "There should be scheduled days"
    for d in sched_days:
        assert d.get("otp"), f"Customer should see OTP on scheduled day, got: {d}"
        assert len(str(d["otp"])) == 4, f"OTP should be 4 digits: {d['otp']}"

    r = requests.get(f"{API}/subscriptions/partner/mine", headers=hdr_maid_anita, timeout=10)
    assert r.status_code == 200, r.text
    plist = r.json()
    sub_p = next((s for s in plist if s["id"] == sid), None)
    assert sub_p, "Assigned partner should see the sub"
    for d in sub_p.get("schedule", []):
        assert d.get("otp") in (None, "", 0) or "otp" not in d, \
            f"Partner MUST NOT see OTP value in schedule day: {d}"
        # Even stricter: field either absent or explicitly null
        assert not d.get("otp"), f"Partner OTP leak: {d}"


# ---------- Negative & positive flow ----------

def test_start_wrong_otp_rejected(fresh_daily_sub, hdr_maid_anita, hdr_customer):
    sid = fresh_daily_sub
    today = _today()
    # Only meaningful if today is a scheduled day (not weekly_off)
    r = requests.get(f"{API}/subscriptions/mine", headers=hdr_customer, timeout=10)
    sub_c = next(s for s in r.json() if s["id"] == sid)
    day_c = next((d for d in sub_c["schedule"] if d["date"] == today), None)
    if not day_c or day_c.get("status") != "scheduled":
        pytest.skip(f"today is not a scheduled day (status={day_c and day_c.get('status')})")
    r = requests.post(f"{API}/subscriptions/{sid}/days/{today}/start",
                      json={"otp": "0000"}, headers=hdr_maid_anita, timeout=10)
    assert r.status_code == 400, r.text
    assert "Invalid" in r.text and "OTP" in r.text


def test_complete_before_start_blocked(fresh_daily_sub, hdr_maid_anita, hdr_customer):
    sid = fresh_daily_sub
    today = _today()
    r = requests.get(f"{API}/subscriptions/mine", headers=hdr_customer, timeout=10)
    sub_c = next(s for s in r.json() if s["id"] == sid)
    day_c = next((d for d in sub_c["schedule"] if d["date"] == today), None)
    if not day_c or day_c.get("status") != "scheduled":
        pytest.skip(f"today is not a scheduled day (status={day_c and day_c.get('status')})")
    r = requests.post(f"{API}/subscriptions/{sid}/days/{today}/complete",
                      json={}, headers=hdr_maid_anita, timeout=10)
    assert r.status_code == 400, r.text
    assert "scheduled" in r.text.lower()


def test_start_correct_otp_then_complete_with_photo(fresh_daily_sub, hdr_customer, hdr_maid_anita):
    sid = fresh_daily_sub
    today = _today()

    # fetch OTP from customer view
    r = requests.get(f"{API}/subscriptions/mine", headers=hdr_customer, timeout=10)
    sub_c = next(s for s in r.json() if s["id"] == sid)
    day_c = next((d for d in sub_c["schedule"] if d["date"] == today), None)
    if not day_c or day_c.get("status") != "scheduled":
        pytest.skip(f"today is not a scheduled day (status={day_c and day_c.get('status')}) — can't run live start flow")
    otp = day_c["otp"]
    per_day = sub_c.get("per_day_earning") or sub_c.get("partner_per_day_earning") or 0
    earn_before = sub_c.get("accrued_earning", 0)

    # start
    r = requests.post(f"{API}/subscriptions/{sid}/days/{today}/start",
                      json={"otp": str(otp)}, headers=hdr_maid_anita, timeout=10)
    assert r.status_code == 200, r.text
    sub_p = r.json()
    day_p = next(d for d in sub_p["schedule"] if d["date"] == today)
    assert day_p["status"] == "in_progress", day_p
    assert day_p.get("started_at"), "started_at should be stamped"

    # complete with base64 photo
    r = requests.post(f"{API}/subscriptions/{sid}/days/{today}/complete",
                      json={"note": "done", "photo": PHOTO_DATA_URL},
                      headers=hdr_maid_anita, timeout=30)
    assert r.status_code == 200, r.text
    sub_p2 = r.json()
    day_done = next(d for d in sub_p2["schedule"] if d["date"] == today)
    assert day_done["status"] == "completed", day_done
    proof = day_done.get("proof_photo") or ""
    assert proof.startswith("http") and "media/file" in proof and "subscriptions/" in proof, \
        f"proof_photo should be https URL under media/file/subscriptions/: {proof}"

    # customer sees accrued_earning increased
    r = requests.get(f"{API}/subscriptions/mine", headers=hdr_customer, timeout=10)
    sub_c2 = next(s for s in r.json() if s["id"] == sid)
    earn_after = sub_c2.get("accrued_earning", 0)
    if per_day:
        assert float(earn_after) >= float(earn_before) + float(per_day) - 0.01, \
            f"earning should grow by per_day={per_day}: before={earn_before} after={earn_after}"
    else:
        assert float(earn_after) > float(earn_before)


# ---------- Future day block & unassigned 403 ----------

def test_future_day_start_blocked(hdr_maid_lakshmi):
    """Lakshmi's active sub starts in the future (2026-09-28)."""
    r = requests.get(f"{API}/subscriptions/partner/mine", headers=hdr_maid_lakshmi, timeout=10)
    assert r.status_code == 200, r.text
    plist = r.json()
    today = _today()
    sub, future_day = None, None
    for s in plist:
        if s.get("status") != "active":
            continue
        fd = next((d for d in s.get("schedule", []) if d["date"] > today
                   and d.get("status") == "scheduled"), None)
        if fd:
            sub, future_day = s, fd
            break
    if not sub:
        pytest.skip("no future scheduled day available on any Lakshmi sub")
    sid = sub["id"]
    r = requests.post(f"{API}/subscriptions/{sid}/days/{future_day['date']}/start",
                      json={"otp": "1234"}, headers=hdr_maid_lakshmi, timeout=10)
    assert r.status_code == 400, r.text
    assert "not arrived" in r.text.lower() or "future" in r.text.lower()

    r = requests.post(f"{API}/subscriptions/{sid}/days/{future_day['date']}/complete",
                      json={}, headers=hdr_maid_lakshmi, timeout=10)
    assert r.status_code == 400, r.text


def test_unassigned_partner_403(fresh_daily_sub, hdr_raj):
    sid = fresh_daily_sub
    r = requests.post(f"{API}/subscriptions/{sid}/days/{_today()}/start",
                      json={"otp": "1234"}, headers=hdr_raj, timeout=10)
    assert r.status_code == 403, r.text


# ---------- Regressions ----------

def test_backdated_complete_without_otp_still_works(hdr_customer, hdr_admin, hdr_maid_anita):
    """Regression: past scheduled day can be completed without OTP.
    Create a fresh daily sub, then inject a past scheduled day and complete it."""
    payload = {
        "service_id": HOME_MAID_SERVICE, "plan": "daily",
        "start_date": _today(), "address_id": ADDRESS_ID,
    }
    r = requests.post(f"{API}/subscriptions", json=payload, headers=hdr_customer, timeout=15)
    assert r.status_code in (200, 201), r.text
    sid = r.json()["id"]
    requests.post(f"{API}/subscriptions/{sid}/pay/mock", json={}, headers=hdr_customer, timeout=15)
    r2 = requests.get(f"{API}/subscriptions/admin/{sid}/partners", headers=hdr_admin, timeout=10)
    anita = next(p for p in r2.json() if "9000000023" in str(p.get("phone", "")))
    requests.post(f"{API}/subscriptions/admin/{sid}/assign",
                  json={"partner_id": anita["id"]}, headers=hdr_admin, timeout=10)

    # Inject a past scheduled day
    import pymongo, os
    from datetime import datetime, timezone, timedelta
    yesterday = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    mc = pymongo.MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = mc[os.environ.get("DB_NAME", "azoapp")]
    doc = db.subscriptions.find_one({"id": sid})
    doc["schedule"].insert(0, {"date": yesterday, "weekday": 5, "status": "scheduled",
                                "earning": 0.0, "served_by": None, "replacement_partner_id": None,
                                "note": "", "marked_by": None, "marked_at": None, "otp": "9999",
                                "started_at": None, "completed_at": None, "proof_photo": None})
    db.subscriptions.update_one({"id": sid}, {"$set": {"schedule": doc["schedule"]}})
    mc.close()

    # Complete past day WITHOUT OTP
    r = requests.post(f"{API}/subscriptions/{sid}/days/{yesterday}/complete",
                      json={}, headers=hdr_maid_anita, timeout=15)
    assert r.status_code == 200, r.text
    day_done = next(d for d in r.json()["schedule"] if d["date"] == yesterday)
    assert day_done["status"] == "completed"


def test_admin_mark_day_maid_absent(hdr_customer, hdr_admin, hdr_maid_anita):
    """Admin can mark any past scheduled day as maid_absent."""
    payload = {
        "service_id": HOME_MAID_SERVICE, "plan": "daily",
        "start_date": _today(), "address_id": ADDRESS_ID,
    }
    r = requests.post(f"{API}/subscriptions", json=payload, headers=hdr_customer, timeout=15)
    sid = r.json()["id"]
    requests.post(f"{API}/subscriptions/{sid}/pay/mock", json={}, headers=hdr_customer, timeout=15)
    r2 = requests.get(f"{API}/subscriptions/admin/{sid}/partners", headers=hdr_admin, timeout=10)
    anita = next(p for p in r2.json() if "9000000023" in str(p.get("phone", "")))
    requests.post(f"{API}/subscriptions/admin/{sid}/assign",
                  json={"partner_id": anita["id"]}, headers=hdr_admin, timeout=10)

    import pymongo, os
    from datetime import datetime, timezone, timedelta
    yesterday = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    mc = pymongo.MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = mc[os.environ.get("DB_NAME", "azoapp")]
    doc = db.subscriptions.find_one({"id": sid})
    doc["schedule"].insert(0, {"date": yesterday, "weekday": 5, "status": "scheduled",
                                "earning": 0.0, "served_by": None, "replacement_partner_id": None,
                                "note": "", "marked_by": None, "marked_at": None, "otp": "8888",
                                "started_at": None, "completed_at": None, "proof_photo": None})
    db.subscriptions.update_one({"id": sid}, {"$set": {"schedule": doc["schedule"]}})
    mc.close()

    r = requests.post(f"{API}/subscriptions/admin/{sid}/days/{yesterday}",
                      json={"status": "maid_absent"}, headers=hdr_admin, timeout=10)
    assert r.status_code == 200, r.text
    day_after = next(d for d in r.json()["schedule"] if d["date"] == yesterday)
    assert day_after["status"] == "maid_absent"
