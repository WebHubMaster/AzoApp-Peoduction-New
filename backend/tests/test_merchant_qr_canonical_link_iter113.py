"""Iter 113 — Verify canonical customer-facing ref_url contract for Merchant Scan QR.

- GET /api/merchant/my-code returns {merchant_code, ref_url} where ref_url ends with `/?ref=<code>`
- GET /api/merchant/qr/share-page rewrites foreign hosts in link+caption to canonical ref_url
- GET /api/merchant/panel/qr/poster (fmt=png) returns 200 image/png
"""
import os
import re

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
PHONE = "+919000000002"
OTP = "123456"


@pytest.fixture(scope="module")
def merchant_token():
    s = requests.Session()
    r = s.post(f"{API}/auth/send-otp", json={"phone": PHONE}, timeout=30)
    assert r.status_code == 200, r.text
    r = s.post(f"{API}/auth/verify-otp", json={"phone": PHONE, "otp": OTP, "role": "merchant"}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, r.text
    return tok


@pytest.fixture(scope="module")
def hdr(merchant_token):
    return {"Authorization": f"Bearer {merchant_token}"}


@pytest.fixture(scope="module")
def my_code(hdr):
    r = requests.get(f"{API}/merchant/my-code", headers=hdr, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_my_code_returns_ref_url(my_code):
    assert my_code.get("merchant_code"), my_code
    assert my_code.get("ref_url"), my_code
    code = my_code["merchant_code"]
    ref_url = my_code["ref_url"]
    assert ref_url.endswith(f"/?ref={code}"), f"ref_url shape wrong: {ref_url}"
    # base should be a real http(s) URL
    assert re.match(r"^https?://[^/]+/\?ref=" + re.escape(code) + r"$", ref_url), ref_url


def test_share_page_rewrites_foreign_host(my_code):
    code = my_code["merchant_code"]
    canonical = my_code["ref_url"]
    foreign_link = f"https://api.example.com/?ref={code}"
    caption = f"Book now: https://api.example.com/?ref={code}"
    r = requests.get(
        f"{API}/merchant/qr/share-page",
        params={"code": code, "link": foreign_link, "caption": caption},
        timeout=60,
    )
    assert r.status_code == 200, r.text
    body = r.text
    assert "api.example.com" not in body, "Foreign host leaked in share-page HTML"
    # canonical ref link should appear (inside the JS CAP constant at least)
    assert f"/?ref={code}" in body
    # base host from canonical must appear
    base = canonical.rsplit("/?ref=", 1)[0]
    assert base in body, f"canonical base {base} not found in share-page HTML"


def test_poster_png_ok(hdr):
    r = requests.get(
        f"{API}/merchant/panel/qr/poster",
        params={"fmt": "png"},
        headers=hdr,
        timeout=90,
    )
    assert r.status_code == 200, r.text[:400]
    assert r.headers.get("content-type", "").startswith("image/png"), r.headers
    assert len(r.content) > 1000, "poster png too small"
