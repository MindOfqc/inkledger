"""把生成的完整实体猫图标原图 scripts/art/cat-icon-src.png 抠底为透明 master。
用法：python scripts/process_icon.py
从四边泛洪填充去除白色背景（徽章纸色与白底区分明显），alpha 羽化，
裁切主体 bbox 留边距，缩放到 1024，输出：
  src/assets/brand-mark.png          （BrandMark 组件与 gen_icons 的唯一源）
  scripts/art/brand-mark-master.png  （gen_cover 复用）
"""
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'scripts' / 'art' / 'cat-icon-src.png'
OUT_ASSET = ROOT / 'src' / 'assets' / 'brand-mark.png'
OUT_ART = ROOT / 'scripts' / 'art' / 'brand-mark-master.png'
TOL = 42          # 与白底的容差
MARGIN = 16
MAX_SIDE = 1024

im = Image.open(SRC).convert('RGB')
w, h = im.size
px = im.load()
bg = (255, 255, 255)


def near(p):
    return sum((a - b) * (a - b) for a, b in zip(p, bg)) <= TOL * TOL


# 从四边种子泛洪填充标记背景
mask = Image.new('L', (w, h), 255)  # 255=保留主体, 0=背景
seen = bytearray(w * h)
stack = []
for x in range(w):
    stack.append((x, 0)); stack.append((x, h - 1))
for y in range(h):
    stack.append((0, y)); stack.append((w - 1, y))
mpx = mask.load()
while stack:
    x, y = stack.pop()
    if x < 0 or y < 0 or x >= w or y >= h:
        continue
    i = y * w + x
    if seen[i]:
        continue
    seen[i] = 1
    if not near(px[x, y]):
        continue
    mpx[x, y] = 0
    stack.append((x + 1, y)); stack.append((x - 1, y))
    stack.append((x, y + 1)); stack.append((x, y - 1))

mask = mask.filter(ImageFilter.GaussianBlur(0.6))
rgba = im.convert('RGBA')
rgba.putalpha(mask)

bbox = mask.getbbox()
if not bbox:
    raise SystemExit('抠底失败：主体为空')
x0, y0, x1, y1 = bbox
x0 = max(0, x0 - MARGIN); y0 = max(0, y0 - MARGIN)
x1 = min(w, x1 + MARGIN); y1 = min(h, y1 + MARGIN)
rgba = rgba.crop((x0, y0, x1, y1))

scale = MAX_SIDE / max(rgba.size)
if scale < 1:
    rgba = rgba.resize((round(rgba.width * scale), round(rgba.height * scale)), Image.LANCZOS)

rgba.save(OUT_ART, optimize=True)
rgba.save(ROOT / 'src' / 'assets' / 'brand-mark.webp', 'WEBP', quality=90, method=6)

total = rgba.width * rgba.height
opaque = sum(1 for p in rgba.getchannel('A').getdata() if p > 16)
print(f'[ok] bbox=({bbox}) out={rgba.size} opaque={opaque / total:.3f}')
for p in (OUT_ASSET, OUT_ART):
    print(f'[ok] {p.relative_to(ROOT)} {p.stat().st_size / 1024:.1f} KB')
# 四角应透明
for name, pos in [('TL', (1, 1)), ('TR', (rgba.width - 2, 1)), ('BL', (1, rgba.height - 2)), ('BR', (rgba.width - 2, rgba.height - 2))]:
    a = rgba.getpixel(pos)[3]
    print(f'[ok] corner {name} alpha={a}')
