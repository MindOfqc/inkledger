"""生成 GitHub 仓库介绍封面 docs/brand-cover.png（1280×640）。
用法：先 pnpm build && node scripts/gen-screenshots.mjs 拍出 docs/hero-desktop.png，
再 python scripts/gen_cover.py。
左侧：品牌标识 + 喵账本 / MeowLedger / 个人记账平台文案；右侧：真实桌面界面截图。
复用 scripts/art/brand-mark-master.png（gen_icons.py 产物）。仅开发期使用。
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'scripts' / 'art'
DOCS = ROOT / 'docs'
DOCS.mkdir(parents=True, exist_ok=True)

W, H = 1280, 640
PAPER_TOP = (251, 245, 230)   # #fbf5e6
PAPER_BOT = (240, 230, 207)   # #f0e6cf
INK = (84, 64, 43)            # #54402b 浅棕文字
DIM = (125, 103, 72)          # #7d6748
ORANGE = (236, 154, 60)       # #ec9a3c
GREEN = (51, 114, 79)         # #33724f
LINE = (201, 183, 145)        # #c9b791

FONT_DIR = Path(r'C:\Windows\Fonts')
FONT_BOLD = FONT_DIR / 'msyhbd.ttc'
FONT_REG = FONT_DIR / 'msyh.ttc'


def font(size, bold=False):
    p = FONT_BOLD if bold and FONT_BOLD.exists() else FONT_REG
    return ImageFont.truetype(str(p), size)


def paper_bg():
    grad = Image.new('RGB', (1, H))
    gp = grad.load()
    for y in range(H):
        t = y / (H - 1)
        gp[0, y] = tuple(round(PAPER_TOP[i] + (PAPER_BOT[i] - PAPER_TOP[i]) * t) for i in range(3))
    return grad.resize((W, H)).convert('RGBA')


canvas = paper_bg()
d = ImageDraw.Draw(canvas)

# 报纸双线外框
d.rectangle([18, 18, W - 19, H - 19], outline=LINE, width=2)
d.rectangle([24, 24, W - 25, H - 25], outline=LINE, width=1)

# ---- 左侧品牌区 ----
LEFT = 64
mark = Image.open(ART / 'brand-mark-master.png').convert('RGBA')
ms = 150
scale = ms / max(mark.size)
mark = mark.resize((round(mark.width * scale), round(mark.height * scale)), Image.LANCZOS)
canvas.alpha_composite(mark, (LEFT, 70))

tx = LEFT + ms + 28
d.text((tx, 78), '喵账本', font=font(64, bold=True), fill=INK)
d.text((tx + 2, 156), 'MeowLedger', font=font(30, bold=True), fill=ORANGE)
d.text((tx + 2, 198), '个人记账平台 · PWA', font=font(22), fill=DIM)

# 分隔线
d.line([LEFT, 268, 600, 268], fill=LINE, width=2)

# 文案
lines = [
    '把每一笔收支，记成生活的小新闻。',
    '卡通小猫 × 复古报刊编辑部风格，',
    '纯静态 · 数据自持 · 离线可用。',
]
y = 296
for ln in lines:
    d.text((LEFT, y), ln, font=font(24), fill=INK)
    y += 42

# 功能小徽章
badges = ['微信/支付宝导入', 'GitHub 私有同步', '预算 · 报表 · 撤销']
bx = LEFT
by = 452
for b in badges:
    f = font(18)
    tw = d.textlength(b, font=f)
    bw = int(tw) + 32
    d.rounded_rectangle([bx, by, bx + bw, by + 40], radius=20, fill=(253, 246, 232), outline=LINE, width=1)
    d.text((bx + 16, by + 9), b, font=f, fill=GREEN)
    bx += bw + 14

# 底部署名
d.text((LEFT, H - 78), '记账助手「墨墨」替你核对每一笔 · 数据只属于你', font=font(18), fill=DIM)

# ---- 右侧界面截图 ----
shot_path = DOCS / 'hero-desktop.png'
if shot_path.exists():
    shot = Image.open(shot_path).convert('RGBA')
    # 目标区域
    rx, ry, rw, rh = 660, 96, 556, 452
    # 圆角裁切
    sw, sh = shot.size
    ratio = rw / sw
    nh = round(sh * ratio)
    shot = shot.resize((rw, nh), Image.LANCZOS)
    if nh > rh:
        shot = shot.crop((0, 0, rw, rh))
    mask = Image.new('L', shot.size, 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, shot.width - 1, shot.height - 1], radius=14, fill=255)
    shot.putalpha(mask)
    # 阴影
    shadow = Image.new('RGBA', (rw + 24, rh + 24), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([12, 14, rw + 12, rh + 14], radius=16, fill=(91, 70, 50, 70))
    canvas.alpha_composite(shadow, (rx - 12, ry - 10))
    canvas.alpha_composite(shot, (rx, ry))
    d.rounded_rectangle([rx, ry, rx + rw - 1, ry + min(rh, nh) - 1], radius=14, outline=LINE, width=2)
else:
    d.text((700, 300), '（先运行 gen-screenshots.mjs）', font=font(22), fill=DIM)

canvas.convert('RGB').save(DOCS / 'brand-cover.png', optimize=True)
print(f'[ok] docs/brand-cover.png {W}x{H} ({(DOCS / "brand-cover.png").stat().st_size / 1024:.1f} KB)')