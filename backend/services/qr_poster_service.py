"""Server-side render of the merchant QR booking poster (PNG / JPG / PDF).

Mirrors QrBookingPoster (web + mobile): 384×576 base design scaled onto the
1080×1350 "ig_post" canvas. Pure SVG → cairosvg, so the mobile app gets an
identical artifact on every device (Expo Go, APK, web) without native modules.
"""
import base64
import io
import os
import re
import tempfile
from xml.sax.saxutils import escape

import httpx
import segno

FONTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "fonts")
CANVAS_W, CANVAS_H = 1080, 1350
BASE_W, BASE_H = 384, 576
SCALE = min(CANVAS_W / BASE_W, CANVAS_H / BASE_H)
FONT = "Public Sans Thin, Public Sans, Liberation Sans, DejaVu Sans, sans-serif"
HEX6 = re.compile(r"^#[0-9a-fA-F]{6}$")

SERVICES = [
    ("lightbulb", "Electrical\nWork"), ("airVent", "AC Service\n& Repair"), ("refrigerator", "Home\nAppliances"),
    ("cctv", "CCTV\nInstallation"), ("home", "All Home\nServices"),
]
LUCIDE = {
    "lightbulb": ["M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5", "M9 18h6", "M10 22h4"],
    "airVent": ["M18 17.5a2.5 2.5 0 1 1-4 2.03V12", "M6 12H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2", "M6 8h12", "M6.6 15.572A2 2 0 1 0 10 17v-5"],
    "refrigerator": ["M5 6a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6Z", "M5 10h14", "M15 7v6"],
    "cctv": ["M16.75 12h3.632a1 1 0 0 1 .894 1.447l-2.034 4.069a1 1 0 0 1-1.708.134l-2.124-2.97",
             "M17.106 9.053a1 1 0 0 1 .447 1.341l-3.106 6.211a1 1 0 0 1-1.342.447L3.61 12.3a2.92 2.92 0 0 1-1.3-3.91L3.69 5.6a2.92 2.92 0 0 1 3.92-1.3z",
             "M2 19h3.76a2 2 0 0 0 1.8-1.1L9 15", "M2 21v-4", "M7 9h.01"],
    "home": ["M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8", "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
    "chevronRight": ["m9 18 6-6-6-6"],
}

_fontconfig_ready = False


def _setup_fonts():
    """Expose bundled Public Sans to cairo via a private fontconfig file."""
    global _fontconfig_ready
    if _fontconfig_ready:
        return
    _fontconfig_ready = True
    if not os.path.isdir(FONTS_DIR) or os.environ.get("FONTCONFIG_FILE"):
        return
    conf = os.path.join(tempfile.gettempdir(), "azo_poster_fonts.conf")
    with open(conf, "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>'
                '<include ignore_missing="yes">/etc/fonts/fonts.conf</include>'
                f'<dir>{FONTS_DIR}</dir><cachedir>{tempfile.gettempdir()}/azo_fc_cache</cachedir></fontconfig>')
    os.environ["FONTCONFIG_FILE"] = conf


def adjust(hex_color, amt=0):
    h = hex_color.lstrip("#")
    n = int(h, 16)
    r = max(0, min(255, (n >> 16) + amt))
    g = max(0, min(255, ((n >> 8) & 0xFF) + amt))
    b = max(0, min(255, (n & 0xFF) + amt))
    return f"#{r:02x}{g:02x}{b:02x}"


def S(n):
    return n * SCALE


def _f(n):
    return f"{n:.2f}"


def _qr_path(value, size):
    qr = segno.make(value or " ", error="m", boost_error=False)
    rows = list(qr.matrix)
    n = len(rows)
    cell = size / n
    parts = []
    for y, row in enumerate(rows):
        x = 0
        while x < n:
            if row[x]:
                x0 = x
                while x < n and row[x]:
                    x += 1
                parts.append(f"M{_f(x0 * cell)} {_f(y * cell)}h{_f((x - x0) * cell + 0.01)}v{_f(cell + 0.01)}h-{_f((x - x0) * cell + 0.01)}z")
            else:
                x += 1
    return "".join(parts)


async def _fetch_logo(url):
    if not url or not url.startswith(("http://", "https://")):
        return ""
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as c:
            r = await c.get(url)
        if r.status_code != 200 or not r.content:
            return ""
        ctype = (r.headers.get("content-type") or "").split(";")[0].strip() or "image/png"
        if not ctype.startswith("image/"):
            return ""
        return f"data:{ctype};base64,{base64.b64encode(r.content).decode()}"
    except Exception:  # noqa: BLE001
        return ""


def _wrap(text, max_chars, max_lines=2):
    words, lines, cur = text.split(), [], ""
    for w in words:
        cand = f"{cur} {w}".strip()
        if len(cand) <= max_chars or not cur:
            cur = cand
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1][: max(1, max_chars - 1)].rstrip() + "…"
    return [ln if len(ln) <= max_chars else ln[: max_chars - 1] + "…" for ln in lines]


def _icon(paths, x, y, size, color, stroke_w=1.9):
    d = "".join(f'<path d="{p}"/>' for p in paths)
    return (f'<g transform="translate({_f(x)} {_f(y)}) scale({_f(size / 24)})" fill="none" stroke="{color}" '
            f'stroke-width="{stroke_w}" stroke-linecap="round" stroke-linejoin="round">{d}</g>')


def _text(x, y, txt, size, weight=400, color="#000", anchor="middle", ls=0, italic=False, family=FONT, extra=""):
    style = ' font-style="italic"' if italic else ""
    return (f'<text x="{_f(x)}" y="{_f(y)}" font-family="{family}" font-size="{_f(size)}" font-weight="{weight}" '
            f'fill="{color}" text-anchor="{anchor}" letter-spacing="{_f(ls)}"{style}{extra}>{escape(txt)}</text>')


def _strip_emoji(text):
    return re.sub(r"[\U00010000-\U0010FFFF\u2600-\u27BF\uFE0F]", "", text or "").replace("  ", " ")


def _caption_lines(caption, primary):
    """Wrap the share message into [(text, is_link)] lines for the caption strip."""
    max_chars = 58
    lines = []
    for para in _strip_emoji(caption).replace("\r", "").split("\n"):
        para = para.strip()
        if not para:
            lines.append(("", False))
            continue
        if para.startswith(("http://", "https://")):
            lines.append((para, True))
            continue
        for ln in _wrap(para, max_chars, max_lines=6):
            lines.append((ln, False))
    while lines and lines[-1][0] == "":
        lines.pop()
    return lines[:14]


def build_caption_strip(caption, primary, y0, width):
    """SVG for a message strip under the poster (looks like a WhatsApp caption)."""
    lines = _caption_lines(caption, primary)
    if not lines:
        return "", 0
    fs, lh, pad = 30, 42, 48
    h = pad * 2 + lh * len(lines)
    out = [f'<rect x="0" y="{_f(y0)}" width="{width}" height="{_f(h)}" fill="#F8FAFC"/>',
           f'<rect x="0" y="{_f(y0)}" width="{width}" height="3" fill="{primary}" fill-opacity="0.25"/>']
    y = y0 + pad + fs
    for txt, is_link in lines:
        if txt:
            size = fs if not is_link else min(fs, (width - 2 * 60) / max(1, len(txt) * 0.56))
            out.append(_text(60, y, txt, size, 700 if is_link else 500, primary if is_link else "#1F2A3A", anchor="start"))
        y += lh
    return "".join(out), h


def build_svg(*, link, code, merchant_name, primary, secondary, logo_data_uri, site_name, trust_line, show_link=True, caption=""):
    primary = primary if HEX6.match(primary or "") else "#0D47A1"
    secondary = secondary if HEX6.match(secondary or "") else adjust(primary, 46)
    site = site_name or "AzoApp"
    W, H = CANVAS_W, CANVAS_H
    strip_svg, strip_h = build_caption_strip(caption, primary, H, W) if caption else ("", 0)
    total_h = H + strip_h
    cx = W / 2
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{_f(total_h)}" viewBox="0 0 {W} {_f(total_h)}">']
    out.append(
        f'<defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{primary}"/><stop offset="1" stop-color="{secondary}"/></linearGradient>'
        f'<linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{secondary}"/><stop offset="1" stop-color="{primary}"/></linearGradient>'
        f'<linearGradient id="cta" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{adjust(primary, 34)}"/><stop offset="1" stop-color="{primary}"/></linearGradient>'
        f'<clipPath id="page"><rect width="{W}" height="{H}"/></clipPath></defs>')
    out.append(f'<rect width="{W}" height="{_f(total_h)}" fill="#FFFFFF"/>')
    out.append('<g clip-path="url(#page)">')
    # decorative bleed shapes
    out.append(f'<circle cx="{_f(-S(70) + S(75))}" cy="{_f(-S(70) + S(75))}" r="{_f(S(75))}" fill="url(#g1)"/>')
    out.append(f'<circle cx="{_f(W + S(95) - S(122))}" cy="{_f(H + S(198) - S(122))}" r="{_f(S(122))}" fill="{primary}" fill-opacity="0.06"/>')
    out.append(f'<circle cx="{_f(W + S(70) - S(103))}" cy="{_f(H + S(176) - S(103))}" r="{_f(S(103))}" fill="url(#g2)"/>')
    out.append(f'<circle cx="{_f(-S(72) + S(75))}" cy="{_f(H + S(110) - S(75))}" r="{_f(S(75))}" fill="{primary}" fill-opacity="0.08"/>')

    # ── group heights (space-between like the RN/web poster) ──
    name_lines = _wrap(merchant_name, 24) if merchant_name else []
    g1 = (S(46) if logo_data_uri else S(56)) + (S(8) + S(11) + S(2) + S(22) * len(name_lines) if merchant_name else 0) + (S(3) + S(14) if trust_line else 0)
    g2 = S(17) * 2 + S(156) + (S(6) + S(12) if code else 0)
    g3 = S(64)
    g4 = S(44) + S(6) + S(11) * 2 + S(12) + S(11) + (S(7) + S(12) if show_link and link else 0)
    top, bottom = S(30), S(16)
    gap = max(S(8), (H - top - bottom - g1 - g2 - g3 - g4) / 3)

    # GROUP 1 — brand
    y = top
    if logo_data_uri:
        out.append(f'<image href="{logo_data_uri}" x="{_f(cx - S(100))}" y="{_f(y)}" width="{_f(S(200))}" height="{_f(S(46))}" preserveAspectRatio="xMidYMid meet"/>')
        y += S(46)
    else:
        out.append(_text(cx, y + S(46), site, S(56), 900, primary, ls=-S(2)))
        y += S(56)
    if merchant_name:
        y += S(8)
        out.append(_text(cx, y + S(8.5), f"{site.upper()} PARTNER", S(9), 800, primary, ls=S(2), extra=' fill-opacity="0.7"'))
        y += S(11) + S(2)
        for ln in name_lines:
            out.append(_text(cx, y + S(17), ln, S(21), 900, "#1F2A3A"))
            y += S(22)
    if trust_line:
        y += S(3)
        tw = len(trust_line) * S(12) * 0.53
        out.append(f'<rect x="{_f(cx - tw / 2 - S(8) - S(18))}" y="{_f(y + S(6))}" width="{_f(S(18))}" height="{_f(S(2))}" rx="{_f(S(1))}" fill="{primary}"/>')
        out.append(f'<rect x="{_f(cx + tw / 2 + S(8))}" y="{_f(y + S(6))}" width="{_f(S(18))}" height="{_f(S(2))}" rx="{_f(S(1))}" fill="{primary}"/>')
        out.append(_text(cx, y + S(11), trust_line, S(12), 700, primary, ls=S(0.3)))
        y += S(14)

    # GROUP 2 — QR card
    y += gap
    card = S(17) * 2 + S(156)
    cx0 = cx - card / 2
    out.append(f'<rect x="{_f(cx0)}" y="{_f(y)}" width="{_f(card)}" height="{_f(card)}" rx="{_f(S(22))}" fill="#FFFFFF" stroke="{primary}" stroke-opacity="0.15" stroke-width="{_f(S(0.8))}"/>')
    b, L, sw = S(28), S(10), S(5)
    for (dx, dy, hx, vy) in [(0, 0, 1, 1), (1, 0, -1, 1), (0, 1, 1, -1), (1, 1, -1, -1)]:
        px = cx0 + L + (card - 2 * L - b) * dx
        py = y + L + (card - 2 * L - b) * dy
        # corner bracket: horizontal + vertical bar meeting at the outer corner
        ox = px if hx > 0 else px + b
        oy = py if vy > 0 else py + b
        out.append(f'<path d="M{_f(ox)} {_f(oy + vy * b)} L{_f(ox)} {_f(oy)} L{_f(ox + hx * b)} {_f(oy)}" fill="none" stroke="{secondary}" stroke-width="{_f(sw)}" stroke-linejoin="round"/>')
    qs = S(156)
    out.append(f'<g transform="translate({_f(cx - qs / 2)} {_f(y + S(17))})"><rect width="{_f(qs)}" height="{_f(qs)}" fill="#ffffff"/><path d="{_qr_path(link, qs)}" fill="#0f172a"/></g>')
    y += card
    if code:
        y += S(6)
        out.append(_text(cx, y + S(9), code, S(10), 400, "#B4BECC", ls=S(1), family="Liberation Mono, DejaVu Sans Mono, monospace"))
        y += S(12)

    # GROUP 3 — CTA
    y += gap
    bw, bh = S(324), S(64)
    bx = cx - bw / 2
    out.append(f'<rect x="{_f(bx)}" y="{_f(y)}" width="{_f(bw)}" height="{_f(bh)}" rx="{_f(bh / 2)}" fill="url(#cta)"/>')
    out.append(f'<circle cx="{_f(bx + S(9) + S(23))}" cy="{_f(y + S(9) + S(23))}" r="{_f(S(23))}" fill="#ffffff"/>')
    ps = S(26)
    px, py = bx + S(9) + S(23) - ps / 2, y + S(9) + S(23) - ps / 2
    out.append(f'<g transform="translate({_f(px)} {_f(py)}) scale({_f(ps / 32)})" fill="none" stroke="{primary}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'
               f'<rect x="8" y="3" width="16" height="26" rx="3"/><path d="M12.5 12.5v-1.5h1.5M18 11h1.5v1.5M19.5 18v1.5H18M14 19.5h-1.5V18"/><circle cx="16" cy="15.5" r="0.9" fill="{primary}" stroke="none"/></g>')
    out.append(f'<rect x="{_f(bx + S(64))}" y="{_f(y + S(16))}" width="{_f(S(1.5))}" height="{_f(S(32))}" fill="#ffffff" fill-opacity="0.5"/>')
    out.append(_text(cx + S(8), y + S(15) + S(14), "Scan to Book a Service", S(16), 800, "#ffffff"))
    out.append(_text(cx + S(8), y + S(15) + S(18) + S(2) + S(8), "Fast  •  Easy  •  Trusted", S(9), 600, "#ffffff", ls=S(0.5), extra=' fill-opacity="0.82"'))
    out.append(f'<circle cx="{_f(bx + bw - S(9) - S(21))}" cy="{_f(y + S(11) + S(21))}" r="{_f(S(21))}" fill="#ffffff" fill-opacity="0.22"/>')
    out.append(_icon(LUCIDE["chevronRight"], bx + bw - S(9) - S(21) - S(11.5), y + S(11) + S(21) - S(11.5), S(23), "#ffffff", 2.8))
    y += bh

    # GROUP 4 — services + footer
    y += gap
    inner_w = W - 2 * S(24)
    slot = S(63)
    step = (inner_w - slot) / (len(SERVICES) - 1)
    for i, (icon, label) in enumerate(SERVICES):
        sx = S(24) + i * step + slot / 2
        out.append(f'<circle cx="{_f(sx)}" cy="{_f(y + S(22))}" r="{_f(S(22))}" fill="{primary}" fill-opacity="0.08"/>')
        out.append(_icon(LUCIDE[icon], sx - S(11.5), y + S(22) - S(11.5), S(23), primary))
        for j, ln in enumerate(label.split("\n")):
            out.append(_text(sx, y + S(44) + S(6) + S(11) * j + S(8.5), ln, S(9.5), 700, "#2C3A4B"))
    y += S(44) + S(6) + S(11) * 2 + S(12)
    out.append(_text(cx, y + S(8), "— BETTER HOMES BRIGHTER TOMORROW —", S(8.5), 700, primary, ls=S(1.4), extra=' fill-opacity="0.7"'))
    y += S(11)
    if show_link and link:
        y += S(7)
        fs = min(S(9.5), inner_w / max(1, len(link) * 0.56))
        out.append(_text(cx, y + S(9), link, fs, 600, primary))

    # top-right decorative circle + script tagline
    out.append(f'<circle cx="{_f(W + S(42) - S(86))}" cy="{_f(-S(42) + S(86))}" r="{_f(S(86))}" fill="{primary}" fill-opacity="0.08"/>')
    tx = W - S(10) - S(60)
    out.append(_text(tx, S(28) + S(12), "Your Home", S(13), 400, primary, italic=True))
    out.append(_text(tx, S(28) + S(15) + S(12), "Our Priority", S(13), 700, primary, italic=True))
    out.append("</g>")
    out.append(strip_svg)
    out.append("</svg>")
    return "".join(out)


def render(svg: str, fmt: str) -> bytes:
    _setup_fonts()
    import cairosvg
    data = svg.encode("utf-8")
    m = re.search(r'height="([\d.]+)"', svg)
    out_h = int(float(m.group(1))) if m else CANVAS_H
    if fmt == "pdf":
        return cairosvg.svg2pdf(bytestring=data, output_width=CANVAS_W, output_height=out_h)
    png = cairosvg.svg2png(bytestring=data, output_width=CANVAS_W, output_height=out_h, background_color="#ffffff")
    if fmt == "jpg":
        from PIL import Image
        im = Image.open(io.BytesIO(png)).convert("RGB")
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=92)
        return buf.getvalue()
    return png


async def render_poster(*, fmt, link, code, merchant_name, primary, secondary, logo_url, site_name, trust_line, caption=""):
    fmt = fmt if fmt in ("png", "jpg", "pdf") else "png"
    logo = await _fetch_logo(logo_url) if logo_url else ""
    svg = build_svg(link=link, code=code, merchant_name=merchant_name, primary=primary, secondary=secondary,
                    logo_data_uri=logo, site_name=site_name, trust_line=trust_line, caption=caption)
    import asyncio
    return fmt, await asyncio.to_thread(render, svg, fmt)
