【舞蹈短片放这里】

1. 命名建议：hongyan.mp4（地标拼音，与 config.js 中 video 字段同名）
   六个地标拼音：hongyan / huangshan / hongyadong / shibati / shanchengxiang / baixiangju
2. 转码建议：H.264 + MP4，分辨率 1280x720，码率 1.5~2.5Mbps，单条 <= 15MB
   推荐用「小丸工具箱 / 格式工厂 / HandBrake」压缩
3. 放好后在 js/config.js 里对应地标填写：
   video: 'assets/video/hongyan.mp4'
4. 不填也能正常运行，页面会显示“视频占位”。
