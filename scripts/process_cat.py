"""把生成的主编猫插画处理成透明背景贴纸，输出 public/cat-editor.png。
用法：python scripts/process_cat.py
背景为均匀米色旧纸色，从四边泛洪填充（颜色距离容差）抠除；
报纸近白与猫身橘色距离背景均 >50，不会被误删。仅开发期使用。
"""
from collections import deque
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'scripts' / 'art' / 'cat-editor-src.png'
OUT = ROOT / 'public' / 'cat-editor.png'
TOL = 42          # 泛洪容差（背景噪点幅度约 ±10）
MARGIN = 18       # 裁切留白
MAX_SIDE = 640

im = Image.open(SRC).convert('RGBA')
w, h = im.size
px = im.load()

# 背景基准色：四角中位数
corners = [px[2, 2][:3], px[w - 3, 2][:3], px[2, h - 3][:3], px[w - 3, h - 3][:3]]
bg = tuple(sorted(c[i] for c in corners)[len(corners) // 2] for i in range(3))
print('bg =', bg)

def dist2(c):
    return (c[0] - bg[0]) ** 2 + (c[1] - bg[1]) ** 2 + (c[2] - bg[2]) ** 2

tol2 = TOL * TOL
bgmask = bytearray(w * h)  # 1 = 背景
q = deque()
for x in range(w):
    for y in (0, h - 1):
        if dist2(px[x, y]) <= tol2 and not bgmask[y * w + x]:
            bgmask[y * w + x] = 1
            q.append((x, y))
for y in range(h):
    for x in (0, w - 1):
        if dist2(px[x, y]) <= tol2 and not bgmask[y * w + x]:
            bgmask[y * w + x] = 1
            q.append((x, y))
while q:
    x, y = q.popleft()
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if 0 <= nx < w and 0 <= ny < h and not bgmask[ny * w + nx] and dist2(px[nx, ny]) <= tol2:
            bgmask[ny * w + nx] = 1
            q.append((nx, ny))

# 应用透明 + 收集主体包围盒
minx, miny, maxx, maxy = w, h, -1, -1
for y in range(h):
    row = y * w
    for x in range(w):
        if bgmask[row + x]:
            px[x, y] = (0, 0, 0, 0)
        else:
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y
print('subject bbox =', (minx, miny, maxx, maxy))

# 轻微羽化边缘（抗锯齿）
alpha = im.getchannel('A').filter(ImageFilter.GaussianBlur(0.6))
im.putalpha(alpha)

box = (max(0, minx - MARGIN), max(0, miny - MARGIN), min(w, maxx + MARGIN + 1), min(h, maxy + MARGIN + 1))
im = im.crop(box)
scale = MAX_SIDE / max(im.size)
if scale < 1:
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
im.save(OUT, optimize=True)
print(f'[ok] {OUT.name} {im.size[0]}x{im.size[1]} ({OUT.stat().st_size / 1024:.1f} KB)')