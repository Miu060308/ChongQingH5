# -*- coding: utf-8 -*-
"""
把素材根目录的 6 张 3D 等距建筑模型图处理成首页缩略图 {id}-model.jpg。
- 自动检测模型内容边界，四周只留 ~7% 呼吸边
- 输出 1:1 400x400（与首页 marker 比例匹配），背景米白与页面融合
"""
import os
from PIL import Image, ImageOps, ImageChops

SRC_DIR = r"C:/Users/谦/Pictures/程序素材"
OUT_DIR = r"C:/Users/谦/WorkBuddy/2026-09-06-14-07-36/chongqing-h5/assets/img/lm"

MAP = {
    'hongyan':       '微信图片_20260909230602_59_70.jpg',   # 红岩革命纪念馆模型
    'huangshan':     '微信图片_20260909230603_60_70.jpg',   # 重庆抗战遗址博物馆牌坊
    'hongyadong':    '微信图片_20260909230604_61_70.jpg',   # 洪崖洞吊脚楼群
    'shibati':       '微信图片_20260909230604_62_70.jpg',   # 十八梯阶梯老街
    'shanchengxiang':'微信图片_20260909230605_63_70.jpg',   # 山城巷红桥石板巷
    'baixiangju':    '微信图片_20260909230606_64_70.jpg',   # 白象居高层+牌坊
}


def content_crop(img, keep=0.07):
    """检测非背景内容 bbox，收边保留 keep 比例的空白"""
    g = ImageOps.grayscale(img)
    # 背景接近 245+，阈值以下的算内容
    mask = g.point(lambda v: 255 if v < 238 else 0)
    bbox = mask.getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    w, h = img.size
    pad_x = int((r - l) * keep)
    pad_y = int((b - t) * keep)
    l = max(0, l - pad_x); t = max(0, t - pad_y)
    r = min(w, r + pad_x); b = min(h, b + pad_y)
    return img.crop((l, t, r, b))


def main():
    for lid, fname in MAP.items():
        src = os.path.join(SRC_DIR, fname)
        dst = os.path.join(OUT_DIR, lid + '-model.jpg')
        if not os.path.exists(src):
            print('MISS', src); continue
        img = Image.open(src).convert('RGB')
        img = ImageOps.exif_transpose(img)
        img = content_crop(img)
        # 1:1 居中裁（不足则补背景色）
        s = min(img.size)
        img = ImageOps.fit(img, (s, s), Image.LANCZOS, centering=(0.5, 0.5))
        img = img.resize((400, 400), Image.LANCZOS)
        img = ImageOps.expand(img, border=2, fill=(247, 240, 230))  # 细米色描边
        img.save(dst, 'JPEG', quality=88, optimize=True, progressive=True)
        print('OK  %-26s %5.0f KB' % (os.path.basename(dst), os.path.getsize(dst) / 1024.0))


if __name__ == '__main__':
    main()
