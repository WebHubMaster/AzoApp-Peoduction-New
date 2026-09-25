"""Iter 107: Retest — verify _js() escape fix for public share-page XSS."""
import os
import urllib.parse
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://merchant-panel-sync.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"
VALID_CODE = "XZ6SV49"


def _get(params):
    return requests.get(f"{API}/merchant/qr/share-page?{urllib.parse.urlencode(params)}", timeout=45)


class TestSharePageXSSFix:
    def test_script_breakout_payload_is_unicode_escaped(self):
        r = _get({
            "code": VALID_CODE,
            "caption": "<script>alert(1)</script>hi",
            "name": "<b>x",
            "channel": "whatsapp",
        })
        assert r.status_code == 200, r.text
        body = r.text
        # Must NOT contain raw script-breakout sequences from user input
        assert "</script>hi" not in body, "raw </script>hi leaked into HTML"
        assert "<script>alert" not in body, "raw <script>alert leaked into HTML"
        assert "<b>x" not in body, "raw <b>x leaked into HTML (name not escaped)"
        # Must contain the properly \u escaped literal
        expected = "\\u003cscript\\u003ealert(1)\\u003c/script\\u003ehi"
        assert expected in body, f"expected escaped CAP literal not found: {expected}"
        # Name escaped too
        assert "\\u003cb\\u003ex" in body

    def test_regression_normal_caption_with_emoji_and_link(self):
        cap = "Hi 👋 book me: https://example.com/?ref=X"
        r = _get({"code": VALID_CODE, "caption": cap, "channel": "whatsapp"})
        assert r.status_code == 200
        body = r.text
        assert "Share on WhatsApp" in body
        assert "no-store" in r.headers.get("cache-control", "")
        assert "navigator.share" in body
        # emoji preserved (json.dumps default ensure_ascii=True encodes as \ud83d\udc4b)
        assert "\\ud83d\\udc4b" in body or "👋" in body
        # link substring present (either escaped or raw)
        assert "example.com" in body

    def test_invalid_code_still_404(self):
        r = _get({"code": "NOPE___", "caption": "x", "channel": "whatsapp"})
        assert r.status_code == 404
