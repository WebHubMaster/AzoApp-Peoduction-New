"""Iteration 48 — City landing pages + OG image endpoint."""
import io
import os
import requests
from PIL import Image

def _base():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        # fallback: read frontend/.env
        try:
            for line in open("/app/frontend/.env"):
                if line.startswith("REACT_APP_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip()
                    break
        except Exception:
            pass
    return (url or "").rstrip("/")

BASE_URL = _base()


# ---- /api/site/cities ----
def test_cities_list_contains_patna_and_ranchi():
    r = requests.get(f"{BASE_URL}/api/site/cities", timeout=60)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and data, "cities list empty"
    slugs = {c.get("slug"): c for c in data}
    assert "patna" in slugs, f"patna missing, got {list(slugs)}"
    assert "ranchi" in slugs, f"ranchi missing, got {list(slugs)}"
    patna = slugs["patna"]
    for k in ("city", "slug", "areas", "pincodes", "partners", "merchants", "bookings"):
        assert k in patna, f"missing key {k} in patna city record"


# ---- /api/site/city/patna ----
def test_city_patna_full():
    r = requests.get(f"{BASE_URL}/api/site/city/patna", timeout=60)
    assert r.status_code == 200
    d = r.json()
    assert d["city"].lower() == "patna"
    assert d["slug"] == "patna"
    s = d["stats"]
    for k in ("services", "partners", "verified_partners", "merchants", "jobs_done", "reviews", "rating", "online_partners"):
        assert k in s
    # per problem statement expectation
    assert s["partners"] >= 6, f"expected >=6 partners, got {s['partners']}"
    assert s["jobs_done"] >= 2, f"expected >=2 completed bookings, got {s['jobs_done']}"
    assert s["reviews"] >= 1, f"expected >=1 review, got {s['reviews']}"
    assert s["rating"] > 0, "expected positive avg rating"

    # categories only with service_count > 0
    for c in d["categories"]:
        assert c["service_count"] > 0

    # services <= 24, local_bookings > 0 first
    assert len(d["services"]) <= 24
    seen_zero = False
    for s_ in d["services"]:
        if s_.get("local_bookings", 0) == 0:
            seen_zero = True
        elif seen_zero:
            raise AssertionError("services not sorted: local_bookings>0 must precede zeros")

    # partners sorted verified→jobs
    prev = (True, 10**9)
    for p in d["partners"]:
        cur = (p["verified"], p["jobs"])
        assert (prev[0], prev[1]) >= (cur[0], cur[1]) or prev == cur
        prev = cur

    # review structure
    for rv in d["reviews"]:
        for k in ("customer_name", "service_name", "rating", "comment"):
            assert k in rv


def test_city_unknown_returns_404():
    r = requests.get(f"{BASE_URL}/api/site/city/nowhere", timeout=60)
    assert r.status_code == 404


# ---- sitemap ----
def test_sitemap_contains_city_slugs():
    r = requests.get(f"{BASE_URL}/api/sitemap.xml", timeout=60)
    assert r.status_code == 200
    body = r.text
    assert "/city/patna" in body
    assert "/city/ranchi" in body


# ---- /api/site/og-image ----
def test_og_image_is_png_1200_630():
    r = requests.get(f"{BASE_URL}/api/site/og-image", timeout=30)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("image/png")
    assert "cache-control" in {k.lower() for k in r.headers}
    im = Image.open(io.BytesIO(r.content))
    assert (im.width, im.height) == (1200, 630), f"got {im.size}"
    assert im.format == "PNG"


# ---- ranchi (minimal, per prompt) ----
def test_city_ranchi_minimal():
    r = requests.get(f"{BASE_URL}/api/site/city/ranchi", timeout=60)
    assert r.status_code == 200
    d = r.json()
    assert d["slug"] == "ranchi"
    # Ranchi expected 1 partner, 0 jobs → hide reviews stat=0
    assert d["stats"]["partners"] >= 1
