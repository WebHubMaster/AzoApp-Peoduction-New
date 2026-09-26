"""Iter 105: Verify `caption` param on GET /api/merchant/panel/qr/poster.

- Without caption: 1080x1350
- With caption: 1080x >1350 (caption strip appended)
- fmt=pdf with caption: 200 application/pdf
- Caption with emoji (server strips): 200
- Very long caption (600+ chars): 200 (server truncates to 600)
"""
import io
import os
import urllib.parse
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://mobile-customer-nav.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

MERCHANT_PHONE = "+919000000002"
OTP = "123456"


def _login(phone):
    requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return d.get("token") or d.get("access_token")


@pytest.fixture(scope="module")
def token():
    return _login(MERCHANT_PHONE)


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


CAPTION_MULTILINE = (
    "Hi 👋, book any home service with me on AzoApp!\n"
    "Fast • Easy • Trusted\n"
    "Tap the link to book now:\n"
    "https://mobile-customer-nav.preview.emergentagent.com/?ref=XZ6SV49"
)


class TestPosterCaption:
    def test_png_without_caption_1080x1350(self, headers):
        r = requests.get(f"{API}/merchant/panel/qr/poster?fmt=png&name=Sharma",
                         headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("image/png")
        from PIL import Image
        im = Image.open(io.BytesIO(r.content))
        assert im.size == (1080, 1350), f"expected 1080x1350 got {im.size}"

    def test_png_with_caption_height_greater(self, headers):
        cap = urllib.parse.quote(CAPTION_MULTILINE, safe="")
        r = requests.get(f"{API}/merchant/panel/qr/poster?fmt=png&name=Sharma&caption={cap}",
                         headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("image/png")
        from PIL import Image
        im = Image.open(io.BytesIO(r.content))
        assert im.size[0] == 1080, f"width expected 1080 got {im.size[0]}"
        assert im.size[1] > 1350, f"expected height > 1350 (caption strip), got {im.size[1]}"

    def test_pdf_with_caption(self, headers):
        cap = urllib.parse.quote(CAPTION_MULTILINE, safe="")
        r = requests.get(f"{API}/merchant/panel/qr/poster?fmt=pdf&name=Sharma&caption={cap}",
                         headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("application/pdf")
        assert r.content[:4] == b"%PDF"

    def test_caption_with_only_emoji_still_ok(self, headers):
        cap = urllib.parse.quote("👋👋👋", safe="")
        r = requests.get(f"{API}/merchant/panel/qr/poster?fmt=png&caption={cap}",
                         headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("image/png")
        # Emoji stripped => no caption lines => height should be 1350
        from PIL import Image
        im = Image.open(io.BytesIO(r.content))
        assert im.size == (1080, 1350), f"emoji-only caption should collapse, got {im.size}"

    def test_caption_with_emoji_and_text(self, headers):
        cap = urllib.parse.quote("Hi 👋 book now\nhttps://example.com/?ref=ABC", safe="")
        r = requests.get(f"{API}/merchant/panel/qr/poster?fmt=png&caption={cap}",
                         headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        from PIL import Image
        im = Image.open(io.BytesIO(r.content))
        assert im.size[1] > 1350

    def test_very_long_caption_600_plus(self, headers):
        long_text = ("Book my service today! " * 40)  # ~920 chars
        assert len(long_text) > 600
        cap = urllib.parse.quote(long_text, safe="")
        r = requests.get(f"{API}/merchant/panel/qr/poster?fmt=png&caption={cap}",
                         headers=headers, timeout=45)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("image/png")
        from PIL import Image
        im = Image.open(io.BytesIO(r.content))
        assert im.size[0] == 1080
        assert im.size[1] > 1350
