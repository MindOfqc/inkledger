"""把四姿势墨墨设定稿（2×2）切成独立透明贴纸。
用法：python scripts/process_cat_poses.py
源图 scripts/art/cat-poses-src.png（1024×1024，四格均匀米色背景）：
  左上=读报 reading / 右上=打盹 sleep / 左下=挥手 wave / 右下=抱存钱罐 savings
每格从四边泛洪抠背景，裁切留白后输出 public/cat-<pose>.png。仅开发期使用。
"""
from collections import deque
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'scripts' / 'art' / 'cat-poses-src.png'
TOL = 42
MARGIN = 16
MAX_SIDE = 560

# (name, 左上角 x, 左上角 y)
POSES = [
    ('reading', 0, 0),
    ('sleep', 512, 0),
    ('wave', 0, 512),
    ('savings', 512, 512),
]

im = Image.open(SRC).convert('RGBA')
W, H = im.size
assert (W, H) == (1024, 1024), f'expect 1024x1024, got {W}x{H}'


def extract(cell):
    w, h = cell.size
    px = cell.load()
    corners = [px[2, 2][:3], px[w - 3, 2][:3], px[2, h - 3][:3], px[w - 3, h - 3][:3]]
    bg = tuple(sorted(c[i] for c in corners)[len(corners) // 2] for i in range(3))
    tol2 = TOL * TOL

    def dist2(c):
        return (c[0] - bg[0]) ** 2 + (c[1] - bg[1]) ** 2 + (c[2] - bg[2]) ** 2

    bgmask = bytearray(w * h)
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

    minx, miny, maxx, maxy = w, h, -1, -1
    opaque = 0
    for y in range(h):
        row = y * w
        for x in range(w):
            if bgmask[row + x]:
                px[x, y] = (0, 0, 0, 0)
            else:
                opaque += 1
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
    alpha = cell.getchannel('A').filter(ImageFilter.GaussianBlur(0.6))
    cell.putalpha(alpha)
    box = (max(0, minx - MARGIN), max(0, miny - MARGIN),
           min(w, maxx + MARGIN + 1), min(h, maxy + MARGIN + 1))
    cell = cell.crop(box)
    scale = MAX_SIDE / max(cell.size)
    if scale < 1:
        cell = cell.resize((round(cell.width * scale), round(cell.height * scale)), Image.LANCZOS)
    return cell, (minx, miny, maxx, maxy), opaque


for name, ox, oy in POSES:
    cell = im.crop((ox, oy, ox + 512, oy + 512))
    out, bbox, opaque = extract(cell)
    dst = ROOT / 'public' / f'cat-{name}.png'
    out.save(dst, optimize=True)
    a = out.load()
    w, h = out.size
    corners_transparent = all(a[x, y][3] == 0 for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)])
    ratio = opaque / (512 * 512)
    print(f'[ok] cat-{name}.png {w}x{h} ({dst.stat().st_size / 1024:.1f} KB) '
          f'bbox={bbox} opaque={ratio:.3f} corners_clear={corners_transparent}')