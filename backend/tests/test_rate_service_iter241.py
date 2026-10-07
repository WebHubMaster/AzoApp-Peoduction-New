"""Rate Service backend endpoints — pending-reviews / review-prompt-dismiss / review."""
import os
import pytest
import requests

BASE = (os.environ.get("REACT_APP_BACKEND_URL")
        or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0]).strip().rstrip("/")
CUSTOMER_PHONE = "+919000000004"
OTP = "123456"


def _login(phone):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/send-otp", json={"phone": phone})
    assert r.status_code == 200, r.text
    r = s.post(f"{BASE}/api/auth/verify-otp", json={"phone": phone, "otp": OTP})
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, r.text
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def customer():
    return _login(CUSTOMER_PHONE)


@pytest.fixture(scope="module")
def partner():
    return _login("+919000000003")


def _reset_prompts():
    from pymongo import MongoClient
    cli = MongoClient("mongodb://localhost:27017")
    cli["test_database"].bookings.update_many(
        {"customer_id": "c336c969-da1e-4d46-aaad-9bcdb875bb15"},
        {"$unset": {"review_prompt_dismissed": ""}})
    cli.close()


# --- Reseed and reset auto_prompt via mongo to a known state so suite is independent.
@pytest.fixture(scope="module", autouse=True)
def seed_and_reset():
    import subprocess
    subprocess.run(
        "cd /app/backend && set -a && . ./.env && set +a && /root/.venv/bin/python seed_rate_service_demo.py",
        shell=True, check=False, capture_output=True)
    _reset_prompts()
    yield


def test_pending_reviews_shape_and_sort(customer):
    r = customer.get(f"{BASE}/api/bookings/my/pending-reviews")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "count" in data and "items" in data
    assert isinstance(data["items"], list)
    assert data["count"] == len(data["items"])
    assert data["count"] >= 1, "Seed should produce >=1 unrated completed booking"
    # Sorted desc by completed_at
    ats = [i.get("completed_at") or "" for i in data["items"]]
    assert ats == sorted(ats, reverse=True)
    # Required fields
    first = data["items"][0]
    for k in ("id", "code", "service_name", "auto_prompt", "completed_at"):
        assert k in first
    # Right after reset -> all auto_prompt True
    assert all(i["auto_prompt"] is True for i in data["items"])


def test_dismiss_sets_all_auto_prompt_false(customer):
    r = customer.get(f"{BASE}/api/bookings/my/pending-reviews")
    items = r.json()["items"]
    assert items
    bid = items[0]["id"]
    r2 = customer.post(f"{BASE}/api/bookings/{bid}/review-prompt-dismiss")
    assert r2.status_code == 200, r2.text
    assert r2.json().get("ok") is True
    # Now ALL items should have auto_prompt=False (per spec)
    r3 = customer.get(f"{BASE}/api/bookings/my/pending-reviews")
    items3 = r3.json()["items"]
    assert items3, "booking must still be pending (not reviewed)"
    assert all(i["auto_prompt"] is False for i in items3)
    # Count unchanged
    assert r3.json()["count"] == len(items)


def test_submit_review_removes_from_pending_and_silences_rest(customer):
    # Re-enable auto_prompt via DB so we can verify silencing on review
    _reset_prompts()

    r = customer.get(f"{BASE}/api/bookings/my/pending-reviews")
    before = r.json()["items"]
    assert len(before) >= 2
    top = before[0]
    assert top["auto_prompt"] is True

    r2 = customer.post(f"{BASE}/api/bookings/{top['id']}/review",
                       json={"rating": 5, "comment": "TEST_great"})
    assert r2.status_code == 200, r2.text

    r3 = customer.get(f"{BASE}/api/bookings/my/pending-reviews")
    after = r3.json()["items"]
    ids_after = {i["id"] for i in after}
    assert top["id"] not in ids_after, "Rated booking must drop out of pending list"
    assert len(after) == len(before) - 1
    # Remaining must now be silenced
    assert all(i["auto_prompt"] is False for i in after)


def test_review_requires_customer_role(partner):
    r = partner.get(f"{BASE}/api/bookings/my/pending-reviews")
    assert r.status_code in (401, 403)


def test_unauthenticated_blocked():
    r = requests.get(f"{BASE}/api/bookings/my/pending-reviews")
    assert r.status_code in (401, 403)


def test_review_double_submit_rejected(customer):
    r = customer.get(f"{BASE}/api/bookings/my/pending-reviews")
    items = r.json()["items"]
    if not items:
        pytest.skip("no pending items left")
    bid = items[0]["id"]
    r1 = customer.post(f"{BASE}/api/bookings/{bid}/review", json={"rating": 4, "comment": "TEST_ok"})
    assert r1.status_code == 200
    r2 = customer.post(f"{BASE}/api/bookings/{bid}/review", json={"rating": 4, "comment": "TEST_again"})
    assert r2.status_code == 400
