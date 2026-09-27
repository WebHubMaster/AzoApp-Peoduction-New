from rembg import remove, new_session
from PIL import Image
s = new_session("u2netp")  # smaller/faster model
out = remove(Image.open('/app/.tmp_assets/person_raw.jpeg'), session=s)
out = out.crop(out.getbbox())
out.save('/app/.tmp_assets/welcome-person-new.png')
open('/app/.tmp_assets/DONE','w').write(str(out.size))
