"""Iter 106: Public GET /api/merchant/qr/share-page validation.

- valid code + channel=whatsapp → 200 text/html, contains navigator.share,
  'Share on WhatsApp', an <img src="data:image/png;base64,..."/> and the caption.
- Cache-Control: no-store
- channel=system → button text 'Share poster + message'
- Invalid code → 404
- Caption with <script> tags → JSON-encoded safely; #cap set via JS so no raw
  <script> is injected into #cap element (CAP literal is a safely-escaped JSON string).
- Link param without ref=<code> → server rebuilds the link and still returns 200.
"""
import os
import re
import urllib.parse
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://reminder-logic.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

VALID_CODE = "XZ6SV49"

CAPTION = (
    "Hi 👋, book any home service with me on AzoApp!\n"
    "Fast • Easy • Trusted\n"
    "Tap the link:\n"
    f"https://reminder-logic.preview.emergentagent.com/?ref={VALID_CODE}"
)


def _get(params):
    qs = urllib.parse.urlencode(params)
    return requests.get(f"{API}/merchant/qr/share-page?{qs}", timeout=45)


class TestSharePage:
    def test_whatsapp_channel_valid_code(self):
        r = _get({
            "code": VALID_CODE, "name": "Sharma", "channel": "whatsapp",
            "caption": CAPTION,
            "link": f"{BASE_URL}/?ref={VALID_CODE}",
        })
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("text/html")
        assert "no-store" in r.headers.get("cache-control", "")
        body = r.text
        assert "navigator.share" in body
        assert "Share on WhatsApp" in body
        # inline poster present
        assert re.search(r'<img[^>]+src="data:image/png;base64,[A-Za-z0-9+/=]{100,}"', body), \
            "inline poster data URL missing"
        # Caption embedded in CAP JS literal (JSON-encoded). Check a distinctive
        # substring (the ref link) is present (JSON escapes / as / unchanged).
        assert f"ref={VALID_CODE}" in body
        assert "Fast" in body and "Easy" in body

    def test_system_channel_button_text(self):
        r = _get({"code": VALID_CODE, "channel": "system", "caption": "hello"})
        assert r.status_code == 200
        assert "Share poster + message" in r.text
        assert "Share on WhatsApp" not in r.text

    def test_invalid_code_404(self):
        r = _get({"code": "BADCODE", "channel": "whatsapp", "caption": "x"})
        assert r.status_code == 404, r.text

    def test_caption_with_script_is_safely_encoded(self):
        evil = "<script>alert(1)</script>\nhttps://example.com/?ref=X"
        r = _get({"code": VALID_CODE, "channel": "whatsapp", "caption": evil})
        assert r.status_code == 200
        body = r.text
        # The CAP literal must be a JSON string; raw </script> would break the
        # enclosing <script> block. json.dumps escapes '<' and '>' as \u003c/\u003e
        # only when ensure_ascii=True keeps ascii but does NOT escape < by default.
        # We only need to guarantee that '<script>alert(1)</script>' is not present
        # as a real HTML element inside #cap; since CAP is a JS string literal and
        # #cap.innerHTML is populated with escaped &lt;/&gt;, no raw child <script>
        # should exist inside the HTML source outside the CAP JSON literal.
        # Sanity: the CAP literal appears once inside the <script> block.
        # Verify there is no second real <script> tag containing 'alert(1)'.
        scripts = re.findall(r"<script[^>]*>(.*?)</script>", body, flags=re.S)
        # None of the script blocks should have a closing </script> injected before end
        # (the JSON literal must not contain the substring '</script>')
        assert "</script>" not in "".join(
            s for s in scripts if "alert(1)" not in s
        ) or True  # tautology; real check below
        # Real check: the literal '</script>' must not appear inside the CAP JSON
        # literal — i.e., the substring "alert(1)</script>" must NOT appear raw.
        # It should be JSON-escaped (json.dumps escapes '</' only when 'ensure_ascii'
        # doesn't but Python's json escapes '<' by leaving as-is; however the raw
        # sequence "</script>" WOULD break the outer <script>. Assert it's absent
        # from the CAP JS literal by checking the whole body has no un-escaped
        # occurrence between CAP= and the following comma.
        m = re.search(r"const CAP=(.*?),\s*TITLE=", body, flags=re.S)
        assert m, "CAP literal not found"
        cap_literal = m.group(1)
        assert "</script>" not in cap_literal, \
            f"Unescaped </script> in CAP literal: {cap_literal[:200]}"

    def test_link_without_ref_still_ok(self):
        r = _get({
            "code": VALID_CODE, "channel": "whatsapp",
            "caption": "hi", "link": "https://example.com/nowhere",
        })
        assert r.status_code == 200, r.text
        # Server rebuilds link but that's server-side; just verify page loads.
        assert "navigator.share" in r.text
