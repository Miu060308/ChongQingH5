# -*- coding: utf-8 -*-
"""
素材批处理工具 —— 换图后重跑一次即可
=====================================
把「程序素材」文件夹里 6 个地标的原始图片，裁剪 / 压缩后输出到 assets/img/lm/，
并自动打印出要填进 js/config.js 的配置片段。

用法：
    1. 安装依赖（只需一次）
         python -m venv .venv-img
         .venv-img/Scripts/python.exe -m pip install Pillow
    2. 运行
         .venv-img/Scripts/python.exe tools/prepare-images.py
    3. 把终端输出的 homeIcon / thumb / images 三行粘进 js/config.js 对应地标

目录约定（源文件夹名必须一致）：
    程序素材/红岩  程序素材/黄山  程序素材/洪崖洞
    程序素材/十八梯 程序素材/山城巷 程序素材/白象

输出规格：
    hero    卡片头图 + 问答背景   16:10   1440x900  q80
    gallery 卡片轮播图            16:10   1200x750  q80
    icon    首页 marker 小方图     1:1     400x400   q85
"""
import os, sys
from PIL import Image, ImageOps

SRC = r"C:\Users\谦\Pictures\程序素材"
DST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "img", "lm")

MAP = [
    ("红岩",   "hongyan"),
    ("黄山",   "huangshan"),
    ("洪崖洞", "hongyadong"),
    ("十八梯", "shibati"),
    ("山城巷", "shanchengxiang"),
    ("白象",   "baixiangju"),
]

EXT = (".jpg", ".jpeg", ".png", ".webp", ".bmp")

HERO_SIZE,    HERO_Q    = (1440, 900), 80
GALLERY_SIZE, GALLERY_Q = (1200, 750), 80
ICON_SIZE,    ICON_Q    = (400, 400),  85

VBias = 0.42   # 竖向裁切重心：0=顶部 0.5=正中 1=底部（建筑主体多在中上部）


def load(p):
    im = ImageOps.exif_transpose(Image.open(p))       # 修正手机照片旋转
    if im.mode != "RGB":
        im = im.convert("RGB")
    return im


def crop_ratio(im, ratio):
    w, h = im.size
    cur = w / h
    if abs(cur - ratio) < 0.005:
        return im
    if cur > ratio:                                    # 过宽 → 裁左右
        nw = int(round(h * ratio))
        left = int(round((w - nw) * 0.5))
        return im.crop((left, 0, left + nw, h))
    nh = int(round(w / ratio))                         # 过高 → 裁上下
    top = max(0, min(int(round((h - nh) * VBias)), h - nh))
    return im.crop((0, top, w, top + nh))


def emit(im, path, size, q):
    im = crop_ratio(im, size[0] / size[1]).resize(size, Image.LANCZOS)
    im.save(path, "JPEG", quality=q, optimize=True, progressive=True)
    return os.path.getsize(path)


def sort_key(it):
    _, w, h = it
    return (0 if w / h >= 1.2 else 1, -(w * h))        # 横图优先，再按像素面积降序


def main():
    if not os.path.isdir(SRC):
        print("!! 找不到素材目录:", SRC)
        return 1
    os.makedirs(DST, exist_ok=True)
    total = 0

    for folder, lid in MAP:
        d = os.path.join(SRC, folder)
        if not os.path.isdir(d):
            print("!! 缺少目录:", folder)
            continue
        items = []
        for name in sorted(os.listdir(d)):
            p = os.path.join(d, name)
            if os.path.isfile(p) and name.lower().endswith(EXT):
                try:
                    im = load(p)
                    items.append((p, im.size[0], im.size[1]))
                except Exception as e:
                    print("   跳过(无法读取):", name, e)
        if not items:
            print("!! 目录为空:", folder)
            continue

        items.sort(key=sort_key)
        hero_p = items[0][0]
        icon_p = items[1][0] if len(items) > 1 else items[0][0]

        total += emit(load(hero_p), os.path.join(DST, "%s-hero.jpg" % lid), HERO_SIZE, HERO_Q)
        total += emit(load(icon_p), os.path.join(DST, "%s-icon.jpg" % lid), ICON_SIZE, ICON_Q)

        gal, i = [], 0
        for p, _, _ in items:
            if p == hero_p:
                continue
            i += 1
            total += emit(load(p), os.path.join(DST, "%s-%d.jpg" % (lid, i)), GALLERY_SIZE, GALLERY_Q)
            gal.append("%s-%d.jpg" % (lid, i))

        print("\n/* %s —— 源 %d 张，输出 %d 张 */" % (folder, len(items), 1 + len(gal)))
        print("      homeIcon: 'assets/img/lm/%s-icon.jpg'," % lid)
        print("      thumb:    'assets/img/lm/%s-hero.jpg'," % lid)
        print("      images: [")
        for g in gal:
            print("        'assets/img/lm/%s'," % g)
        print("      ],")

    print("\n输出目录: %s" % DST)
    print("总体积: %.1f MB" % (total / 1024 / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
