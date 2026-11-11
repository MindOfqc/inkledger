"""验证 docs 截图中报头主编猫已渲染：在报头区域找橘色毛发像素簇。
用法：python scripts/verify_cat_shots.py（仅开发期）
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

def orange_mask(px, w, h, y0, y1):
    xs, ys = [], []
    n = 0
    for y in range(y0, min(y1, h)):
        for x in range(w):
            r, g, b = px[x, y][:3]
            # 橘猫毛发：红高、绿中、蓝低
            if r > 150 and 60 < g < 190 and b < 130 and r - b > 55:
                xs.append(x); ys.append(y); n += 1
    if not n:
        return None
    return n, (min(xs), min(ys), max(xs), max(ys))

shots = [
    ('hero-desktop.png', 1440, 900, 0, 220, 'desktop-light'),
    ('light-home.png', 1440, 900, 0, 220, 'desktop-dark'),
    ('mobile-home.png', 390, 844, 0, 240, 'mobile-light'),
]
ok = True
for name, w, h, y0, y1, label in shots:
    p = ROOT / 'docs' / name
    im = Image.open(p).convert('RGB')
    assert im.size == (w, h), f'{name} size {im.size}'
    px = im.load()
    res = orange_mask(px, w, h, y0, y1)
    if res is None:
        print(f'[FAIL] {label}: no orange pixels in masthead band')
        ok = False
        continue
    n, (x0, y0b, x1, y1b) = res
    bw, bh = x1 - x0 + 1, y1b - y0 + 1
    # 桌面猫约 104x114，移动约 72x79；簇应 >= 60px 宽
    good = n > 800 and bw >= 60 and bh >= 60
    print(f'[{"ok" if good else "FAIL"}] {label}: orange px={n}, bbox=({x0},{y0b})-({x1},{y1b}) {bw}x{bh}')
    ok = ok and good

# 夜班背景应为暖棕
im = Image.open(ROOT / 'docs' / 'light-home.png').convert('RGB')
corner = im.getpixel((5, 5))
dark_ok = corner[0] < 80 and corner[1] < 70
print(f'[{"ok" if dark_ok else "FAIL"}] dark theme corner rgb={corner}')
ok = ok and dark_ok

print('ALL OK' if ok else 'SOME FAILED')
raise SystemExit(0 if ok else 1)