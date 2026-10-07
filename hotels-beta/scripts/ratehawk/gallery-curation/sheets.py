# Step 2 (read-only): contact sheets of each hotel's gallery in <work>/sheets.
# 16 tiles per sheet (4 x 4), 380 x 240 each, so a sheet is 1520 x 960 and is
# not downscaled by the API. Needs Pillow. Re-run safe: existing sheets are kept.
#   python sheets.py <work dir>
import json, io, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw, ImageFont
work = sys.argv[1]
hotels = json.load(open(os.path.join(work, 'snapshot.json'), encoding='utf-8'))
font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 22) if os.name == 'nt' else ImageFont.load_default()
W, TH, COLS, PER = 380, 240, 4, 16
def get(u):
    for _ in range(3):
        try:
            b = urllib.request.urlopen(urllib.request.Request(u.replace('{size}', '640x400'), headers={'User-Agent': 'Mozilla/5.0'}), timeout=30).read()
            return Image.open(io.BytesIO(b)).convert('RGB')
        except Exception:
            pass
    return None
def sheets(h):
    imgs = h['images']; chunks = [imgs[i:i+PER] for i in range(0, len(imgs), PER)]
    target = lambda k: os.path.join(work, 'sheets', f"{h['id']}-{k}.jpg")
    if all(os.path.exists(target(k)) for k in range(len(chunks))): return h['id'], []
    with ThreadPoolExecutor(8) as ex: pics = list(ex.map(lambda im: get(im['url']), imgs))
    bad = []
    for k, chunk in enumerate(chunks):
        rows = (len(chunk) + COLS - 1) // COLS
        s = Image.new('RGB', (COLS*W, rows*TH), (40, 40, 40)); d = ImageDraw.Draw(s)
        for j, im in enumerate(chunk):
            p = pics[k*PER + j]; x = (j % COLS)*W; y = (j // COLS)*TH
            if p is None: bad.append(im['slot']); d.text((x+120, y+100), 'BROKEN', fill='red', font=font)
            else:
                p = p.copy(); p.thumbnail((W-4, TH-4)); s.paste(p, (x+2+(W-4-p.width)//2, y+2+(TH-4-p.height)//2))
            lbl = str(im['slot']); d.rectangle([x+2, y+2, x+12+14*len(lbl), y+30], fill='white'); d.text((x+6, y+4), lbl, fill='black', font=font)
        s.save(target(k), quality=84)
    return h['id'], bad
os.makedirs(os.path.join(work, 'sheets'), exist_ok=True)
with ThreadPoolExecutor(6) as ex: res = list(ex.map(sheets, hotels))
broken = {i: b for i, b in res if b}
json.dump(broken, open(os.path.join(work, 'broken.json'), 'w'))
print('done', len(res), 'hotels with broken images', len(broken))
