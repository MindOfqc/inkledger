"""从手绘主编猫插画生成 PWA / favicon 图标（PNG）。
用法：python scripts/gen_icons.py
以 src/assets/cats/cat-editor.webp（端坐读报的墨墨）为主体，
合成到米白报纸圆角徽章上，输出：
  public/icon-192.png / icon-512.png（maskable：主体落在中心 80% 安全区）
  public/favicon.png（64×64）
仅开发期使用，不参与构建。
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
CAT = ROOT / 'src' / 'assets' / 'cats' / 'cat-editor.webp'
PUB = ROOT / 'public'

PAPER_TOP = (248, 241, 224)
PAPER_BOT = (238, 227, 203)
FRAME = (201, 183, 145)


def paper_tile(size, radius_ratio=0.22):
    """竖向渐变的米白报纸底 + 圆角。maskable 用（背景铺满整块）。"""
    grad = Image.new('RGB', (1, size))
    gp = grad.load()
    for y in range(size):
        t = y / (size - 1)
        gp[0, y] = tuple(round(PAPER_TOP[i] + (PAPER_BOT[i] - PAPER_TOP[i]) * t) for i in range(3))
    base = grad.resize((size, size)).convert('RGBA')
    # 圆角遮罩
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255)
    base.putalpha(mask)
    # 内框线（装饰，落在安全区边缘内侧）
    inset = int(size * 0.09)
    frame = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(frame).rounded_rectangle(
        [inset, inset, size - 1 - inset, size - 1 - inset],
        radius=int(size * radius_ratio * 0.7), outline=FRAME + (255,), width=max(1, size // 96)
    )
    return Image.alpha_composite(base, frame)


def compose(size, fill_ratio, radius_ratio=0.22, full_bleed=False):
    tile = paper_tile(size, radius_ratio)
    if full_bleed:
        # maskable：背景铺满方形（无透明角），主体居中落在安全区
        bg = Image.new('RGBA', (size, size), PAPER_BOT + (255,))
        # 用未圆角的渐变铺满
        grad = Image.new('RGB', (1, size))
        gp = grad.load()
        for y in range(size):
            t = y / (size - 1)
            gp[0, y] = tuple(round(PAPER_TOP[i] + (PAPER_BOT[i] - PAPER_TOP[i]) * t) for i in range(3))
        bg = grad.resize((size, size)).convert('RGBA')
        tile = bg
    cat = Image.open(CAT).convert('RGBA')
    target = int(size * fill_ratio)
    scale = target / max(cat.size)
    cat = cat.resize((round(cat.width * scale), round(cat.height * scale)), Image.LANCZOS)
    # 轻微投影
    sh = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    a = cat.getchannel('A').filter(ImageFilter.GaussianBlur(size * 0.012))
    shadow = Image.new('RGBA', cat.size, (60, 40, 20, 90))
    shadow.putalpha(a)
    x = (size - cat.width) // 2
    y = (size - cat.height) // 2
    sh.alpha_composite(shadow, (x + int(size * 0.01), y + int(size * 0.02)))
    out = Image.alpha_composite(tile, sh)
    out.alpha_composite(cat, (x, y))
    return out


# 常规图标（圆角、留白稍多）
compose(192, 0.74).save(PUB / 'icon-192.png', optimize=True)
# maskable：铺满方形背景，主体落在中心 ~72% 安全区
compose(512, 0.70, full_bleed=True).save(PUB / 'icon-512.png', optimize=True)
# favicon（小尺寸，主体略大以便识别）
compose(64, 0.82, radius_ratio=0.24).save(PUB / 'favicon.png', optimize=True)

for n in ['icon-192.png', 'icon-512.png', 'favicon.png']:
    p = PUB / n
    print(f'[ok] {n} {Image.open(p).size} ({p.stat().st_size / 1024:.1f} KB)')