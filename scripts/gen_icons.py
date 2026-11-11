"""从品牌标识 src/assets/brand-mark.svg 同源生成 PWA / favicon 图标（PNG）。
用法：python scripts/gen_icons.py
左上角 BrandMark、favicon、PWA 图标共用同一份 SVG，保证品牌一致。
SVG 经 Edge headless 渲染为透明 PNG（无 cairosvg 依赖），再用 Pillow 合成：
  public/icon-192.png   any：透明底，徽章本体
  public/icon-512.png   maskable：米白纸底铺满方形，主体落在中心 ~72% 安全区
  public/favicon.png    64×64
另存 scripts/art/brand-mark-master.png（1024 透明）供 gen_cover.py 复用。
仅开发期使用，不参与构建。
"""
import subprocess
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SVG = ROOT / 'src' / 'assets' / 'brand-mark.svg'
PUB = ROOT / 'public'
ART = ROOT / 'scripts' / 'art'
ART.mkdir(parents=True, exist_ok=True)

EDGE_CANDIDATES = [
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
]
EDGE = next((p for p in EDGE_CANDIDATES if Path(p).exists()), None)
if not EDGE:
    raise SystemExit('未找到 Edge，无法渲染 SVG')

PAPER_TOP = (251, 245, 230)   # #fbf5e6
PAPER_BOT = (240, 230, 207)   # #f0e6cf
MASTER = 1024


def render_master(size=MASTER):
    """Edge headless 把 SVG 渲染成透明 PNG。"""
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        html = td / 'mark.html'
        html.write_text(
            '<!doctype html><html><head><meta charset="utf-8">'
            '<style>html,body{margin:0;padding:0;background:transparent}'
            f'img{{display:block;width:{size}px;height:{size}px}}</style></head>'
            f'<body><img src="{SVG.as_uri()}"></body></html>',
            encoding='utf-8',
        )
        out = td / 'mark.png'
        subprocess.run(
            [EDGE, '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
             '--hide-scrollbars', '--force-device-scale-factor=1',
             '--default-background-color=00000000',
             f'--window-size={size},{size}', f'--screenshot={out}',
             f'--user-data-dir={td / "profile"}', html.as_uri()],
            check=True, timeout=90,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        img = Image.open(out).convert('RGBA')
    # 裁到实际不透明 bbox，避免视口留白
    bbox = img.getchannel('A').getbbox()
    if bbox:
        img = img.crop(bbox)
    return img


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


master = render_master()
master.save(ART / 'brand-mark-master.png', optimize=True)
opaque = sum(1 for p in master.getchannel('A').getdata() if p > 16)
if opaque < master.width * master.height * 0.1:
    raise SystemExit(f'渲染异常：不透明像素过少 ({opaque})')
print(f'[ok] master {master.size} opaque={opaque / (master.width * master.height):.2%}')

# any：透明底，徽章占满 ~92%
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