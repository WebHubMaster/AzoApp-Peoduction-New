"""Backend regression for AzoApp partner active job timing card (instant vs scheduled)."""
import os
import re
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback: read from frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

TARGET_BOOKING_ID = "ba936117-834f-40a2-a19c-65d3d4628050"
TARGET_CODE = "AZOAF1BBB"


def _login(phone: str) -> str:
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=45)
    assert r.status_code == 200, f"send-otp {phone}: {r.status_code} {r.text}"
    r = s.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": phone, "otp": "123456"}, timeout=45)
    assert r.status_code == 200, f"verify-otp {phone}: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token") or data.get("jwt")
    assert token, f"no token in response: {data}"
    return token


@pytest.fixture(scope="module")
def partner_token():
    return _login("+919000000003")


@pytest.fixture(scope="module")
def partner_client(partner_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {partner_token}", "Content-Type": "application/json"})
    return s


def test_partner_active_returns_instant_schedule(partner_client):
    r = partner_client.get(f"{BASE_URL}/api/bookings/partner/active", timeout=15)
    assert r.status_code == 200, r.text
    jobs = r.json()
    # response may be list or dict
    if isinstance(jobs, dict):
        jobs = jobs.get("jobs") or jobs.get("bookings") or jobs.get("data") or []
    assert isinstance(jobs, list) and len(jobs) > 0, f"no active jobs: {jobs}"

    target = None
    for j in jobs:
        if j.get("code") == TARGET_CODE or j.get("id") == TARGET_BOOKING_ID or j.get("booking_id") == TARGET_BOOKING_ID:
            target = j
            break
    assert target is not None, f"target booking {TARGET_CODE} not in active list: {[j.get('code') for j in jobs]}"

    sched = target.get("schedule")
    assert sched is not None, f"schedule missing on job: keys={list(target.keys())}"
    print("SCHEDULE:", sched)

    assert sched.get("is_instant") is True, f"is_instant not True: {sched}"
    assert sched.get("is_scheduled") is False, f"is_scheduled not False: {sched}"
    assert sched.get("comm_locked") is False
    assert sched.get("otp_hidden") is False
    assert sched.get("unlock_at") in (None, ""), f"unlock_at should be null: {sched.get('unlock_at')}"
    assert sched.get("phase") in ("due", "active"), f"phase={sched.get('phase')}"

    # date & time strings
    sd = sched.get("scheduled_date") or ""
    st = sched.get("scheduled_time") or ""
    assert re.match(r"^\d{1,2} \w{3} \d{4}$", sd), f"scheduled_date format bad: {sd}"
    assert re.match(r"^\d{1,2}:\d{2} (AM|PM)$", st), f"scheduled_time format bad: {st}"

    label = sched.get("scheduled_label") or ""
    assert label.lower().startswith("now · booked") or label.lower().startswith("now"), f"label={label}"


def test_partner_job_detail_matches(partner_client):
    r = partner_client.get(f"{BASE_URL}/api/bookings/partner/job/{TARGET_BOOKING_ID}", timeout=15)
    assert r.status_code == 200, r.text
    job = r.json()
    sched = job.get("schedule")
    assert sched is not None
    assert sched.get("is_instant") is True
    assert sched.get("is_scheduled") is False
    assert sched.get("comm_locked") is False
    label = sched.get("scheduled_label") or ""
    assert "now" in label.lower(), f"label lacking 'now': {label}"


def test_scheduled_booking_regression_if_any(partner_client):
    """If any scheduled booking exists across active jobs, verify is_scheduled True path."""
    r = partner_client.get(f"{BASE_URL}/api/bookings/partner/active", timeout=15)
    assert r.status_code == 200
    jobs = r.json()
    if isinstance(jobs, dict):
        jobs = jobs.get("jobs") or jobs.get("bookings") or jobs.get("data") or []
    scheduled = [j for j in jobs if (j.get("schedule") or {}).get("is_scheduled") is True]
    if not scheduled:
        pytest.skip("no scheduled bookings to regress")
    s = scheduled[0]["schedule"]
    assert s.get("is_instant") is False
    assert s.get("scheduled_date")
    assert s.get("scheduled_time")
