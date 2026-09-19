"""Dynamic Open-Graph share image: composes the admin-uploaded brand logo onto a
1200x630 card in the theme's primary colour. Nothing is hard-coded — logo, name and
colours all come from Branding & Theme settings. Cached; busted with `site:*`."""
import io
import re
from pathlib import Path

import httpx
from PIL import Image, ImageDraw, ImageFont

from config.database import get_settings
from services import cache_service

UPLOAD_DIR = Path(__file__).parent.parent / "uploads"
W, H = 1200, 630


def _hex(c, fallback=(13, 71, 161)):
    m = re.fullmatch(r"#?([0-9a-fA-F]{6})", (c or "").strip())
    return tuple(int(m.group(1)[i:i + 2], 16) for i in (0, 2, 4)) if m else fallback


async def _load_bytes(url: str) -> bytes | None:
    if not url:
        return None
    m = re.search(r"/api/media/file/([^/?]+)/([^/?]+)", url)
    if m:
        p = UPLOAD_DIR / m.group(1) / m.group(2)
        return p.read_bytes() if p.exists() else None
    if url.startswith("http"):
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                r = await c.get(url)
                return r.content if r.status_code == 200 else None
        except Exception:  # noqa: BLE001
            return None
    return None


def _to_rgba(raw: bytes, url: str, box=(760, 320)) -> Image.Image | None:
    try:
        if url.lower().endswith(".svg") or raw.lstrip()[:5] in (b"<svg", b"<?xml"):
            import cairosvg
            raw = cairosvg.svg2png(bytestring=raw, output_width=box[0] * 2)
        im = Image.open(io.BytesIO(raw)).convert("RGBA")
        im.thumbnail(box, Image.LANCZOS)
        return im
    except Exception:  # noqa: BLE001
        return None


def _font(size):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"):
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


async def _build() -> bytes:
    s = await get_settings()
    branding = s.get("branding") if isinstance(s.get("branding"), dict) else {}
    seo = s.get("seo") or {}
    theme = s.get("theme") or {}
    name = seo.get("site_name") or branding.get("site_name") or "AzoApp"
    tagline = seo.get("meta_description") or branding.get("tagline") or ""
    primary = _hex(theme.get("primary") or branding.get("primary_color"))

    # 1) Admin-provided OG image wins as-is.
    og = seo.get("og_image") or branding.get("og_image")
    if og:
        raw = await _load_bytes(og)
        if raw:
            im = _to_rgba(raw, og, box=(W, H))
            if im:
                canvas = Image.new("RGB", (W, H), primary)
                im = im.resize((W, H)) if abs(im.width / im.height - W / H) < 0.05 else im
                canvas.paste(im, ((W - im.width) // 2, (H - im.height) // 2), im)
                buf = io.BytesIO(); canvas.save(buf, "PNG", optimize=True); return buf.getvalue()

    # 2) Compose from the uploaded logo.
    canvas = Image.new("RGB", (W, H), primary)
    draw = ImageDraw.Draw(canvas)
    lighter = tuple(min(255, int(c * 1.18)) for c in primary)
    draw.ellipse((W - 420, -220, W + 200, 400), fill=lighter)
    draw.ellipse((-260, H - 320, 260, H + 200), fill=lighter)
    card = Image.new("RGBA", (W - 160, H - 160), (255, 255, 255, 255))
    mask = Image.new("L", card.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, card.width, card.height), radius=44, fill=255)
    canvas.paste(card, (80, 80), mask)

    logo = None
    for key in ("logo_light", "logo", "logo_dark", "email_logo"):
        raw = await _load_bytes(branding.get(key) or "")
        if raw:
            logo = _to_rgba(raw, branding.get(key) or "")
            if logo:
                break
    y = 80 + 60
    if logo:
        canvas.paste(logo, ((W - logo.width) // 2, 80 + (card.height - logo.height) // 2 - (60 if tagline else 0)), logo)
        y = 80 + (card.height + logo.height) // 2 - 30
    else:
        f = _font(96)
        tw = draw.textlength(name, font=f)
        draw.text(((W - tw) / 2, H / 2 - 100), name, font=f, fill=primary)
        y = H / 2 + 20
    if tagline:
        f = _font(30)
        words, lines, cur = tagline.split(), [], ""
        for w_ in words:
            t = f"{cur} {w_}".strip()
            if draw.textlength(t, font=f) > card.width - 120:
                lines.append(cur); cur = w_
            else:
                cur = t
        if cur:
            lines.append(cur)
        for i, line in enumerate(lines[:2]):
            tw = draw.textlength(line, font=f)
            draw.text(((W - tw) / 2, y + i * 40), line, font=f, fill=(71, 85, 105))
    buf = io.BytesIO(); canvas.save(buf, "PNG", optimize=True)
    return buf.getvalue()


async def og_image_png() -> bytes:
    import base64
    b64 = await cache_service.cached("site:og-image", 600, lambda: _build_b64())
    return base64.b64decode(b64)


async def _build_b64() -> str:
    import base64
    return base64.b64encode(await _build()).decode()
