"""从品牌 master scripts/art/brand-mark-master.png 同源生成 PWA / favicon 图标（PNG）。
用法：python scripts/gen_icons.py
master 由 scripts/process_icon.py 从生成的实体猫图标原图抠底而来；
左上角 BrandMark（src/assets/brand-mark.webp）与 favicon / PWA 图标同源，保证品牌一致：
  public/icon-192.png   any：透明底，主体 ~94%
  public/icon-512.png   maskable：米白纸底铺满方形，主体落在中心 ~72% 安全区
  public/favicon.png    64×64
仅开发期使用，不参与构建。
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / 'public'
MASTER = ROOT / 'scripts' / 'art' / 'brand-mark-master.png'

PAPER_TOP = (251, 245, 230)   # #fbf5e6
PAPER_BOT = (240, 230, 207)   # #f0e6cf


def paper_bg(size):
    grad = Image.new('RGB', (1, size))
    gp = grad.load()
    for y in range(size):
        t = y / (size - 1)
        gp[0, y] = tuple(round(PAPER_TOP[i] + (PAPER_BOT[i] - PAPER_TOP[i]) * t) for i in range(3))
    return grad.resize((size, size)).convert('RGBA')


def fit(img, target):
    scale = target / max(img.size)
    return img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)


master = Image.open(MASTER).convert('RGBA')
opaque = master.getchannel('A').getextrema()[1]
if opaque < 16:
    raise SystemExit('master 异常：几乎全透明')
print(f'[ok] master {master.size} ({MASTER.stat().st_size / 1024:.1f} KB)')

# any：透明底，主体占满 ~94%
icon192 = Image.new('RGBA', (192, 192), (0, 0, 0, 0))
m = fit(master, int(192 * 0.94))
icon192.alpha_composite(m, ((192 - m.width) // 2, (192 - m.height) // 2))
icon192.save(PUB / 'icon-192.png', optimize=True)

# maskable：纸底铺满方形，主体 ~72% 安全区
icon512 = paper_bg(512)
m = fit(master, int(512 * 0.72))
icon512.alpha_composite(m, ((512 - m.width) // 2, (512 - m.height) // 2))
icon512.save(PUB / 'icon-512.png', optimize=True)

# favicon：透明底，主体略大
fav = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
m = fit(master, int(64 * 0.96))
fav.alpha_composite(m, ((64 - m.width) // 2, (64 - m.height) // 2))
fav.save(PUB / 'favicon.png', optimize=True)

for n in ['icon-192.png', 'icon-512.png', 'favicon.png']:
    p = PUB / n
    print(f'[ok] {n} {Image.open(p).size} ({p.stat().st_size / 1024:.1f} KB)')