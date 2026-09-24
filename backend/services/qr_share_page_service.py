"""Public share page: opened by the mobile app (Expo Go) in the system browser so the
Web Share API can hand WhatsApp the poster image + caption in ONE message."""
import base64
import json

from fastapi import HTTPException
from fastapi.responses import HTMLResponse

from services import merchant_code_service
from services import qr_poster_service as qps


def _js(v):
    """JSON literal safe to inline inside <script> (escapes <, >, & as \\u escapes)."""
    return json.dumps(v).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


async def share_page(*, code, link, name, primary, secondary, logo, site, trust, caption, channel):
    m = await merchant_code_service.validate_code((code or "").strip())
    if not m:
        raise HTTPException(status_code=404, detail="Invalid merchant code")
    code = m.get("merchant_code") or code
    if not link or f"ref={code}" not in link:
        from services.physical_qr_service import _app_url
        link = f"{_app_url()}/?ref={code}"
    name = name or m.get("shop_name") or m.get("name") or ""
    _, png = await qps.render_poster(fmt="png", link=link, code=code, merchant_name=name, primary=primary, secondary=secondary,
                                     logo_url=logo, site_name=site, trust_line=trust)
    b64 = base64.b64encode(png).decode()
    accent = primary if qps.HEX6.match(primary or "") else "#0D47A1"
    wa = channel == "whatsapp"
    file_name = f"azoapp-poster-{code}.png"
    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>Share poster</title>
<style>
:root{{--p:{accent}}}*{{box-sizing:border-box}}body{{margin:0;min-height:100vh;background:#0b1220;color:#e2e8f0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;flex-direction:column;align-items:center;padding:16px 16px 120px}}
.poster{{width:min(78vw,300px);border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.5);display:block;margin:8px auto 14px}}
.cap{{width:100%;max-width:420px;background:#0f5c3d;border-radius:14px;padding:12px 14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-break:break-word;color:#fff}}
.cap a{{color:#8fd3ff}}
.bar{{position:fixed;left:0;right:0;bottom:0;padding:14px 16px calc(14px + env(safe-area-inset-bottom));background:linear-gradient(180deg,rgba(11,18,32,0),#0b1220 40%)}}
button{{width:100%;max-width:420px;display:block;margin:0 auto;height:52px;border:0;border-radius:14px;font-size:16px;font-weight:700;color:#fff;background:{'#22c55e' if wa else 'var(--p)'};box-shadow:0 10px 30px rgba(0,0,0,.35)}}
button:active{{transform:scale(.98)}}button[disabled]{{opacity:.6}}
.hint{{text-align:center;font-size:12px;color:#94a3b8;margin:10px 0 0}}
.ok{{display:none;text-align:center;margin-top:18px}}.ok h2{{margin:0 0 6px;font-size:18px}}
</style></head><body>
<img class="poster" src="data:image/png;base64,{b64}" alt="Poster"/>
<div class="cap" id="cap"></div>
<div class="ok" id="ok"><h2>Sent ✓</h2><div class="hint">You can close this tab and go back to the app.</div></div>
<div class="bar"><button id="go">{'Share on WhatsApp' if wa else 'Share poster + message'}</button>
<p class="hint" id="hint">Poster image and your message go together as one message.</p></div>
<script>
const CAP={_js(caption or "")}, TITLE={_js(name)}, FILE={_js(file_name)}, WA={_js(wa)};
const capEl=document.getElementById('cap');capEl.innerHTML=CAP.replace(/[&<>]/g,c=>({{'&':'&amp;','<':'&lt;','>':'&gt;'}}[c])).replace(/(https?:\\/\\/[^\\s]+)/g,'<a href="$1">$1</a>');
async function file(){{const r=await fetch(document.querySelector('.poster').src);const b=await r.blob();return new File([b],FILE,{{type:'image/png'}});}}
function fallback(){{const a=document.createElement('a');a.href=document.querySelector('.poster').src;a.download=FILE;a.click();
  location.href=(WA?'https://wa.me/?text=':'https://wa.me/?text=')+encodeURIComponent(CAP);}}
document.getElementById('go').addEventListener('click',async()=>{{const b=document.getElementById('go');b.disabled=true;
  try{{const f=await file();if(navigator.canShare&&navigator.canShare({{files:[f]}})){{await navigator.share({{files:[f],text:CAP,title:TITLE}});
      document.getElementById('ok').style.display='block';document.getElementById('hint').textContent='Done — go back to the app.';setTimeout(()=>window.close(),600);return;}}
    fallback();}}catch(e){{if(!/abort/i.test(String(e&&e.name)))fallback();}}finally{{b.disabled=false;}}}});
</script></body></html>"""
    return HTMLResponse(html, headers={"Cache-Control": "no-store"})
