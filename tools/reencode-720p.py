# -*- coding: utf-8 -*-
"""舞蹈视频高清重转码：1080p 源 -> 720p H.264（放大全屏更清晰），并重抽封面。
   目标：单文件 6~11MB，远好于旧版 540p（放大发虚）。
"""
import os, subprocess, imageio_ffmpeg, sys

sys.stdout.reconfigure(encoding='utf-8')
FF = imageio_ffmpeg.get_ffmpeg_exe()

SRC = r'C:\Users\谦\Pictures\程序素材\舞蹈视频'
DST = r'C:\Users\谦\WorkBuddy\2026-09-06-14-07-36\chongqing-h5\assets\video'
POSTER = r'C:\Users\谦\WorkBuddy\2026-09-06-14-07-36\chongqing-h5\assets\img\lm'

MAP = {
    '红岩革命': 'hongyan',
    '黄山':     'huangshan',
    '洪崖洞':   'hongyadong',
    '十八梯':   'shibati',
    '山城巷':   'shanchengxiang',
    '白象居':   'baixiangju',
}

for src_name, lid in MAP.items():
    src = os.path.join(SRC, src_name + '.mp4')
    out = os.path.join(DST, lid + '.mp4')
    if not os.path.exists(src):
        print('MISSING', src); continue

    # 720p，质量优先（crf 24），yuv420p 兼容全平台；faststart 便于边下边播
    cmd = [FF, '-y', '-hide_banner', '-loglevel', 'error',
           '-i', src,
           '-vf', 'scale=-2:720:flags=lanczos',
           '-c:v', 'libx264', '-profile:v', 'high', '-level', '3.1',
           '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'medium',
           '-g', '60', '-movflags', '+faststart',
           '-c:a', 'aac', '-b:a', '112k', '-ac', '2', '-ar', '44100',
           out]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='ignore')
    if r.returncode != 0:
        print('FAIL', lid, r.stderr[-300:]); continue

    # 抽封面帧（720p 宽，配合高清视频）
    poster = os.path.join(POSTER, lid + '-poster.jpg')
    pcmd = [FF, '-y', '-hide_banner', '-loglevel', 'error',
            '-ss', '00:00:01.2', '-i', out,
            '-vf', 'scale=-2:720:flags=lanczos', '-frames:v', '1',
            '-q:v', '3', poster]
    subprocess.run(pcmd, capture_output=True, text=True, encoding='utf-8', errors='ignore')

    # 时长
    d = subprocess.run([FF, '-hide_banner', '-i', out], capture_output=True, text=True,
                       encoding='utf-8', errors='ignore')
    dur = ''
    for line in d.stderr.splitlines():
        if 'Duration' in line:
            dur = line.split('Duration:')[1].split(',')[0].strip()
            break

    mb = os.path.getsize(out) / 1024 / 1024
    print('%-14s %-22s %5.1f MB   时长 %s' % (src_name, lid + '.mp4', mb, dur))

total = sum(os.path.getsize(os.path.join(DST, f)) for f in os.listdir(DST) if f.endswith('.mp4'))
print('\n视频目录总计: %.1f MB' % (total / 1024 / 1024))
