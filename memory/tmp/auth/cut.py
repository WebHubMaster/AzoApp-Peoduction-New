from rembg import remove
from PIL import Image
import sys
jobs = [("partner_arms", "/app/frontend/assets/hero-partner-arms.png"), ("merchant_apron", "/app/frontend/assets/hero-merchant-apron.png"), ("login_ill", "/app/frontend/assets/auth-login-illustration.png")]
for src, dst in jobs:
    im = Image.open(f"/app/memory/tmp/auth/{src}.jpg").convert("RGBA")
    out = remove(im)
    out = out.crop(out.getbbox())
    out.thumbnail((700, 900))
    out.save(dst)
    print(dst, out.size, flush=True)
bg = Image.open("/app/memory/tmp/auth/welcome_bg.jpg").convert("RGB")
bg.thumbnail((900, 1400))
bg.save("/app/frontend/assets/auth-welcome-bg.png", optimize=True)
print("bg", bg.size, flush=True)
