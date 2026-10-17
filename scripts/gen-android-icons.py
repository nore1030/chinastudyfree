#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
生成安卓应用图标（品牌化）：树蛙绿 #58A700 底 + 白色「聪」字标。

产物（写入 apps/mobile/android/app/src/main/res/）：
  mipmap-{d}/ic_launcher_foreground.png  自适应图标前景（108dp，透明底 + 白色「聪」）
  mipmap-{d}/ic_launcher.png             传统图标（48dp，圆角方块）
  mipmap-{d}/ic_launcher_round.png       传统圆形图标（48dp，圆形）
  values/ic_launcher_background.xml      自适应图标背景色（纯色 #58A700）

自适应图标的 <background> 由 values/ic_launcher_background.xml 提供纯色（#58A700），
前景只负责白色字标 —— 这样在任意桌面（浅色/深色）都清晰可见。

⚠️ apps/mobile/android/ 被 .gitignore 忽略（Capacitor 生成产物）。
   执行过 `npx cap add android` 后 **必须重跑本脚本**，否则启动图标会回退成
   Capacitor 默认模板（白底白图 → 手机主界面看不见图标）。

用法：  python scripts/gen-android-icons.py
"""
from __future__ import annotations

import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    sys.exit("需要 Pillow：pip install Pillow")

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.normpath(
    os.path.join(HERE, "..", "apps", "mobile", "android", "app", "src", "main", "res")
)

BRAND_HEX = "58A700"  # 树蛙绿（chunky-primary）
BRAND = (0x58, 0xA7, 0x00, 255)
WHITE = (255, 255, 255, 255)
CHAR = "聪"
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\msyhbd.ttc",
]

# Android 密度倍率
DENSITIES = {
    "mdpi": 1.0,
    "hdpi": 1.5,
    "xhdpi": 2.0,
    "xxhdpi": 3.0,
    "xxxhdpi": 4.0,
}

SS = 4  # 超采样倍率（先放大再缩小，得到平滑边缘）


def load_font(path: str, px: int) -> "ImageFont.FreeTypeFont":
    return ImageFont.truetype(path, px)


def measure(font, ch: str):
    tmp = Image.new("L", (8, 8))
    d = ImageDraw.Draw(tmp)
    box = d.textbbox((0, 0), ch, font=font)
    return box[2] - box[0], box[3] - box[1], box


def fit_font(path: str, ch: str, target_px: int):
    """二分出使字标墨迹最大边 <= target_px 的最大字号。"""
    lo, hi = 8, target_px * 2 + 8
    best = load_font(path, 8)
    while lo <= hi:
        mid = (lo + hi) // 2
        f = load_font(path, mid)
        w, h, _ = measure(f, ch)
        if max(w, h) <= target_px:
            best = f
            lo = mid + 1
        else:
            hi = mid - 1
    return best


def draw_centered_glyph(draw, font, ch: str, cx: float, cy: float, color):
    w, h, box = measure(font, ch)
    x = cx - w / 2.0 - box[0]
    y = cy - h / 2.0 - box[1]
    draw.text((x, y), ch, font=font, fill=color)


def make_adaptive_foreground(font_path: str, size_px: int) -> Image.Image:
    """透明底 + 居中白色「聪」（内容限制在安全区内）。"""
    big = size_px * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    glyph_target = int(round(big * 0.56))  # 108dp 安全区 72dp -> 0.667，留边取 0.56
    f = fit_font(font_path, CHAR, glyph_target)
    draw_centered_glyph(d, f, CHAR, big / 2.0, big / 2.0, WHITE)
    return img.resize((size_px, size_px), Image.LANCZOS)


def make_square_icon(font_path: str, size_px: int) -> Image.Image:
    """品牌绿圆角方块 + 白色「聪」。"""
    big = size_px * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = int(round(big * 0.24))
    d.rounded_rectangle((0, 0, big - 1, big - 1), radius=radius, fill=BRAND)
    f = fit_font(font_path, CHAR, int(round(big * 0.56)))
    draw_centered_glyph(d, f, CHAR, big / 2.0, big / 2.0, WHITE)
    return img.resize((size_px, size_px), Image.LANCZOS)


def make_round_icon(font_path: str, size_px: int) -> Image.Image:
    """品牌绿圆形 + 白色「聪」。"""
    big = size_px * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((0, 0, big - 1, big - 1), fill=BRAND)
    f = fit_font(font_path, CHAR, int(round(big * 0.52)))
    draw_centered_glyph(d, f, CHAR, big / 2.0, big / 2.0, WHITE)
    return img.resize((size_px, size_px), Image.LANCZOS)


def pick_font() -> str:
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return p
    sys.exit("找不到中文字体（simhei/msyh），无法绘制字标")


def write_background_color() -> None:
    """写自适应图标背景色（纯色）。与前景配套，缺了就会白底白图。"""
    folder = os.path.join(RES, "values")
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, "ic_launcher_background.xml")
    content = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        "    <!-- 自适应图标背景色：树蛙绿（品牌主色），配合白色「聪」前景，在任意桌面清晰可见 -->\n"
        f'    <color name="ic_launcher_background">#{BRAND_HEX}</color>\n'
        "</resources>\n"
    )
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(content)
    print(f"  已写入 values/ic_launcher_background.xml  (#{BRAND_HEX})")


def main() -> int:
    font_path = pick_font()
    print(f"字体: {font_path}")
    print(f"输出: {RES}")
    for dens, ratio in DENSITIES.items():
        folder = os.path.join(RES, f"mipmap-{dens}")
        os.makedirs(folder, exist_ok=True)
        fg_size = int(round(108 * ratio))
        legacy = int(round(48 * ratio))
        make_adaptive_foreground(font_path, fg_size).save(
            os.path.join(folder, "ic_launcher_foreground.png")
        )
        make_square_icon(font_path, legacy).save(
            os.path.join(folder, "ic_launcher.png")
        )
        make_round_icon(font_path, legacy).save(
            os.path.join(folder, "ic_launcher_round.png")
        )
        print(
            f"  {dens:8s} foreground={fg_size}px  launcher/round={legacy}px"
        )
    write_background_color()
    print("完成。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
