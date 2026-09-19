"""Server-side HTML sanitization for admin-authored rich content (XSS protection).

Admin editors (About/Privacy/Terms/Refund/Blog/FAQ answers) allow rich HTML.
Never render admin HTML blindly — every write passes through sanitize_html().
Uses bleach with an allow-list tuned for a CMS rich-text editor (TipTap output).
"""
from __future__ import annotations

try:
    import bleach
    from bleach.css_sanitizer import CSSSanitizer
    _HAS_BLEACH = True
except Exception:  # pragma: no cover - fallback if bleach missing
    _HAS_BLEACH = False

# Tags a rich-text editor legitimately produces.
ALLOWED_TAGS = [
    "p", "br", "hr", "div", "span",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "b", "em", "i", "u", "s", "strike", "del", "mark", "sub", "sup",
    "blockquote", "pre", "code",
    "ul", "ol", "li",
    "a", "img", "figure", "figcaption",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
    "iframe",  # embeds (youtube/vimeo) — src validated below
]

ALLOWED_ATTRS = {
    "*": ["class", "style", "id", "data-align", "data-width"],
    "a": ["href", "title", "target", "rel"],
    "img": ["src", "alt", "title", "width", "height", "data-align"],
    "iframe": ["src", "width", "height", "frameborder", "allow", "allowfullscreen", "title"],
    "td": ["colspan", "rowspan"],
    "th": ["colspan", "rowspan", "scope"],
    "col": ["span", "width", "style"],
    "colgroup": ["span"],
}

ALLOWED_PROTOCOLS = ["http", "https", "mailto", "tel", "data"]

# Only allow a small set of safe inline CSS props (alignment/sizing/color).
ALLOWED_CSS_PROPS = [
    "text-align", "float", "width", "height", "max-width", "margin", "margin-left",
    "margin-right", "color", "background-color", "font-weight", "font-style",
    "text-decoration", "border", "vertical-align",
]

# iframe embeds restricted to trusted providers.
_IFRAME_ALLOW = ("youtube.com", "youtube-nocookie.com", "youtu.be", "player.vimeo.com",
                 "google.com/maps", "maps.google.com", "www.google.com/maps")


def _iframe_filter(tag, name, value):
    if name in ("width", "height", "frameborder", "allow", "allowfullscreen", "title"):
        return True
    if name == "src":
        v = (value or "").lower()
        return v.startswith("https://") and any(d in v for d in _IFRAME_ALLOW)
    return False


def sanitize_html(html) -> str:
    """Return XSS-safe HTML. Strips scripts/handlers/unsafe URLs, keeps rich formatting."""
    if not html or not isinstance(html, str):
        return "" if html in (None, False) else str(html or "")
    if not _HAS_BLEACH:
        # Extremely defensive fallback: drop script/style blocks + on* handlers.
        import re
        s = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", "", html)
        s = re.sub(r"(?is)\son\w+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", "", s)
        s = re.sub(r"(?is)(href|src)\s*=\s*([\"'])\s*javascript:[^\"']*\2", r"\1=\2#\2", s)
        return s

    attrs = dict(ALLOWED_ATTRS)

    def _attr_ok(tag, name, value):
        if tag == "iframe":
            return _iframe_filter(tag, name, value)
        allowed = attrs.get(tag, []) + attrs.get("*", [])
        return name in allowed

    css_sanitizer = CSSSanitizer(allowed_css_properties=ALLOWED_CSS_PROPS)
    cleaned = bleach.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=_attr_ok,
        protocols=ALLOWED_PROTOCOLS,
        css_sanitizer=css_sanitizer,
        strip=True,
        strip_comments=True,
    )
    return cleaned


# Which HTML fields to sanitize per collection on admin writes.
HTML_FIELDS = {
    "blogs": ["body"],
    "faqs": ["answer"],
    "pages": ["body"],
}


def sanitize_doc(coll: str, data: dict) -> dict:
    """Sanitize known rich-HTML fields for a given collection (in-place-safe copy)."""
    if not isinstance(data, dict):
        return data
    fields = HTML_FIELDS.get(coll)
    if not fields:
        return data
    out = dict(data)
    for f in fields:
        if f in out and isinstance(out[f], str):
            out[f] = sanitize_html(out[f])
    return out
