"""Backend test: Homepage Trust Stats (home_stats) persistence + cache bust
for admin settings and homepage-sections updates.
"""
import os
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or os.environ.get("BACKEND_URL", "http://localhost:8001").rstrip("/")
# fall back: read from frontend .env if not present in env
if not BASE or BASE == "http://localhost:8001":
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL"):
                    BASE = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

ADMIN_PHONE = "+919000000000"
OTP = "123456"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/api/auth/send-otp", json={"phone": ADMIN_PHONE}, timeout=15)
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE}/api/auth/verify-otp", json={"phone": ADMIN_PHONE, "otp": OTP}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def auth(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def test_home_stats_manual_persists_and_cache_busts(auth):
    payload = {
        "home_stats": {
            "live": False,
            "rating": "4.7",
            "reviews": "12K+",
            "jobs_done": "47K+",
            "verified_partners": "2,500+",
            "partners": "3,500+",
            "merchants": "300+",
            "customers": "4.5L+",
        }
    }
    r = requests.put(f"{BASE}/api/admin/settings", json=payload, headers=auth, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    hs = body.get("home_stats") or body.get("settings", {}).get("home_stats")
    assert hs is not None, f"home_stats missing from PUT response: {body}"
    assert hs["live"] is False
    assert hs["rating"] == "4.7"
    assert hs["verified_partners"] == "2,500+"

    # GET admin/settings
    r = requests.get(f"{BASE}/api/admin/settings", headers=auth, timeout=15)
    assert r.status_code == 200
    hs2 = r.json().get("home_stats")
    assert hs2 and hs2["reviews"] == "12K+"

    # Site config immediately reflects (cache busted)
    r = requests.get(f"{BASE}/api/site/config", timeout=15)
    assert r.status_code == 200
    stats = r.json().get("stats") or {}
    assert stats.get("live") is False, f"stats.live not False: {stats}"
    assert str(stats.get("rating")) == "4.7"
    assert stats.get("jobs_done") == "47K+"
    assert stats.get("verified_partners") == "2,500+"
    assert stats.get("partners") == "3,500+"
    assert stats.get("merchants") == "300+"
    assert stats.get("customers") == "4.5L+"


def test_home_stats_live_toggle(auth):
    r = requests.put(f"{BASE}/api/admin/settings", json={"home_stats": {"live": True}}, headers=auth, timeout=15)
    assert r.status_code == 200
    r = requests.get(f"{BASE}/api/site/config", timeout=15)
    stats = r.json().get("stats") or {}
    assert stats.get("live") is True, f"stats.live not True: {stats}"


def _find_trending(sections):
    for s in sections:
        title = (s.get("title") or "").lower()
        stype = (s.get("type") or s.get("kind") or "").lower()
        if "trending" in title or stype == "trending":
            return s
    return None


def test_homepage_sections_cache_bust_on_update(auth):
    r = requests.get(f"{BASE}/api/admin/homepage-sections", headers=auth, timeout=15)
    assert r.status_code == 200, r.text
    sections = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    trending = _find_trending(sections)
    if not trending:
        pytest.skip("No trending section found")
    sid = trending.get("id") or trending.get("_id")
    original_title = trending.get("title", "Trending near you")

    # Update title
    r = requests.put(f"{BASE}/api/admin/homepage-sections/{sid}", json={"title": "Trending TEST"}, headers=auth, timeout=15)
    assert r.status_code == 200, r.text

    # Immediate reflect in /api/site/homepage
    r = requests.get(f"{BASE}/api/site/homepage", timeout=15)
    assert r.status_code == 200
    hp = r.json()
    hp_sections = hp if isinstance(hp, list) else hp.get("sections", [])
    tr = _find_trending(hp_sections)
    assert tr and tr.get("title") == "Trending TEST", f"cache not busted (no city): {tr}"

    # With city param
    r = requests.get(f"{BASE}/api/site/homepage", params={"city": "Patna"}, timeout=15)
    assert r.status_code == 200
    hp2 = r.json()
    hp_sections2 = hp2 if isinstance(hp2, list) else hp2.get("sections", [])
    tr2 = _find_trending(hp_sections2)
    assert tr2 and tr2.get("title") == "Trending TEST", f"cache not busted (city=Patna): {tr2}"

    # Restore
    r = requests.put(f"{BASE}/api/admin/homepage-sections/{sid}", json={"title": original_title}, headers=auth, timeout=15)
    assert r.status_code == 200
    r = requests.get(f"{BASE}/api/site/homepage", timeout=15)
    hp3 = r.json()
    hp_sections3 = hp3 if isinstance(hp3, list) else hp3.get("sections", [])
    tr3 = _find_trending(hp_sections3)
    assert tr3 and tr3.get("title") == original_title, f"restore failed: {tr3}"
