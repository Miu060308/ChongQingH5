/* =========================================================
 *  app.js —— 地标卡片 / 底部三大板块 / 问答入口 / 通用 UI
 *  ─────────────────────────────────────────────────────────
 *  地图引擎（Leaflet）见 js/map.js。
 *  本文件只负责：点开地标 → 弹卡片、视频控制、底部 sheet、
 *  问答入口、Toast、Loading。
 *
 *  对外暴露：window.MapApp = { openLandmark, focusLandmark, ... }
 * ========================================================= */
(function () {
  'use strict';

  var CFG = window.APP_CONFIG || {};
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* =========================================================
   *  一、地标信息卡片
   * ========================================================= */
  var modal      = $('#lmModal');
  var lmVideo    = $('#lmVideo');
  var videoCover = $('#videoCover');
  var videoMissing = $('#videoMissing');
  var currentLandmark = null;

  function openModal(el) {
    el.classList.add('is-open');
    void el.offsetWidth;            // 强制 reflow，触发过渡
    el.classList.add('is-show');
  }
  function closeModal(el) {
    el.classList.remove('is-show');
    setTimeout(function () { el.classList.remove('is-open'); }, 300);
  }

  /* 这是 map.js / 缩放控件等都会调用的入口 */
  function openLandmark(lm /*, markerLeaflet */) {
    if (!lm) return;
    currentLandmark = lm;

    /* 让地图上的对应 marker 高亮 */
    if (window.RealMap && RealMap.highlight) RealMap.highlight(lm, true);

    $('#lmTag').textContent  = lm.tag || '文化地标';
    $('#lmName').textContent = lm.name || '';
    $('#lmSub').textContent  = lm.subtitle || '';

    /* 关键数据条 */
    var facts = $('#lmFacts');
    facts.innerHTML = (lm.facts || []).map(function (f) {
      return '<div class="fact"><div class="fact-k">' + f.k + '</div><div class="fact-v">' + f.v + '</div></div>';
    }).join('');

    /* 文字介绍 */
    var textPanel = $('.lm-panel[data-panel="text"]');
    textPanel.className = 'lm-panel scroll-y is-on';
    textPanel.innerHTML = (lm.desc || []).map(function (p) { return '<p>' + p + '</p>'; }).join('');

    /* 实景图 */
    var photoPanel = $('.lm-panel[data-panel="photo"]');
    photoPanel.className = 'lm-panel scroll-y';
    var imgs = lm.images || [];
    if (imgs.length) {
      photoPanel.innerHTML = imgs.map(function (src, i) {
        return '<figure class="ph-item"><img src="' + src + '" alt="实景 ' + (i + 1) + '" loading="lazy"></figure>';
      }).join('');
    } else {
      photoPanel.innerHTML =
        '<p class="ph-note">以下为实景图占位。打开 <code>js/config.js</code> 找到该地标的 <code>images</code> 数组，' +
        '填入图片路径即可替换。</p>' +
        [1, 2].map(function (n) {
          return '<figure class="ph-item ph-placeholder">' +
                 '<span class="ph-badge">实景图占位 ' + n + '</span>' +
                 '<span class="ph-tip">' + (lm.name || '') + ' · 建议尺寸 1080×810 以上</span></figure>';
        }).join('');
    }

    /* 舞蹈视频 */
    var videoPanel = $('.lm-panel[data-panel="video"]');
    videoPanel.className = 'lm-panel scroll-y';
    $('#videoNote').textContent = lm.video ? '' : '提示：视频放入 assets/video/ 后，在 config.js 中填写路径即可自动生效。';
    loadVideo(lm.video);

    switchPanel('text');
    openModal(modal);
    hideHint();

    /* 地图柔聚焦到该点位（可在 config.map.focusOnOpen 关闭） */
    if (CFG.map && CFG.map.focusOnOpen && window.RealMap && RealMap.focusOn) {
      RealMap.focusOn(lm);
    }
  }

  function closeLandmark() {
    closeModal(modal);
    if (window.RealMap && RealMap.highlight && currentLandmark) RealMap.highlight(currentLandmark, false);
    currentLandmark = null;

    lmVideo.pause();
    setTimeout(function () {
      lmVideo.pause();
      lmVideo.controls = false;
      if (lmVideo.getAttribute('src')) {
        videoCover.classList.remove('is-hide');
        videoCover.style.display = 'flex';
      }
    }, 320);
  }

  function loadVideo(src) {
    lmVideo.pause();
    lmVideo.controls = false;
    videoCover.classList.remove('is-hide');
    videoCover.style.display = '';
    videoMissing.style.display = 'none';
    if (src) {
      lmVideo.src = src;
      lmVideo.load();
    } else {
      lmVideo.removeAttribute('src');
      lmVideo.load();
      videoMissing.style.display = 'flex';
      videoCover.style.display = 'none';
    }
  }

  lmVideo.addEventListener('error', function () {
    videoMissing.style.display = 'flex';
    videoCover.style.display = 'none';
  });
  lmVideo.addEventListener('loadeddata', function () {
    videoMissing.style.display = 'none';
    videoCover.style.display = 'flex';
  });

  videoCover.addEventListener('click', function () {
    if (!lmVideo.src) { toast('请先在 config.js 中配置视频路径'); return; }
    videoCover.classList.add('is-hide');
    lmVideo.controls = true;
    lmVideo.muted = false;
    var p = lmVideo.play();
    if (p && p.catch) p.catch(function () { videoCover.classList.remove('is-hide'); });
  });

  $('#btnMute').addEventListener('click', function () {
    lmVideo.muted = !lmVideo.muted;
    this.textContent = lmVideo.muted ? '🔇' : '🔊';
    toast(lmVideo.muted ? '已静音' : '已开启声音');
  });

  function switchPanel(name) {
    $$('.lm-tab').forEach(function (t) { t.classList.toggle('is-on', t.getAttribute('data-panel') === name); });
    $$('.lm-panel').forEach(function (p) {
      p.classList.toggle('is-on', p.getAttribute('data-panel') === name);
    });
    if (name !== 'video' && !lmVideo.paused) lmVideo.pause();
  }
  $$('.lm-tab').forEach(function (t) {
    t.addEventListener('click', function () { switchPanel(t.getAttribute('data-panel')); });
  });

  modal.addEventListener('click', function (e) {
    if (e.target.getAttribute('data-close') === '1') closeLandmark();
  });

  /* =========================================================
   *  二、底部固定常驻三大板块
   * ========================================================= */
  var sheetWrap = $('#sheetWrap');

  function openSheet(key) {
    var site = CFG.site || {};
    var data = site[key];
    if (!data) return;
    $('#sheetTitle').textContent = data.title;
    var body = $('#sheetBody');
    body.className = 'sheet-body scroll-y';

    if (key === 'social') {
      var links = (data.links || []).map(function (l) {
        return '<button class="link-item" data-url="' + (l.url || '') + '" data-name="' + l.name + '">' +
               '<span class="li-ico">' + (l.name || '?').slice(0, 1) + '</span>' +
               '<span class="li-txt"><span class="li-name">' + l.name + '</span>' +
               '<span class="li-desc">' + (l.desc || '') + '</span></span>' +
               '<span class="li-go">›</span></button>';
      }).join('');
      body.innerHTML = (data.paragraphs || []).map(function (p) { return '<p>' + p + '</p>'; }).join('') +
                       '<div class="link-list">' + links + '</div>';
    } else {
      body.innerHTML = (data.paragraphs || []).map(function (p) { return '<p>' + p + '</p>'; }).join('');
    }

    sheetWrap.classList.add('is-open');
    void sheetWrap.offsetWidth;
    sheetWrap.classList.add('is-show');
  }

  function closeSheet() { closeModal(sheetWrap); }

  sheetWrap.addEventListener('click', function (e) {
    if (e.target.getAttribute('data-close') === '1') { closeSheet(); return; }
    var item = e.target.closest('.link-item');
    if (item) {
      var url = item.getAttribute('data-url');
      if (!url) {
        toast('链接未配置：请在 config.js → site.social.links 中填写 url');
        return;
      }
      window.open(url, '_blank');
    }
  });

  $$('.bb-item').forEach(function (b) {
    b.addEventListener('click', function () { openSheet(b.getAttribute('data-sheet')); });
  });

  /* =========================================================
   *  三、自定义缩放 / 复位 / 定位 / 玩法
   * ========================================================= */
  $('#btnZoomIn').addEventListener('click', function () {
    if (window.RealMap) RealMap.map.zoomIn(1);
    hideHint();
  });
  $('#btnZoomOut').addEventListener('click', function () {
    if (window.RealMap) RealMap.map.zoomOut(1);
    hideHint();
  });
  $('#btnReset').addEventListener('click', function () {
    if (window.RealMap) RealMap.fitAll();
    toast('已回到六地标全景');
  });
  $('#btnLocate').addEventListener('click', function () {
    if (window.RealMap) RealMap.fitAll();
  });
  $('#btnTip').addEventListener('click', function () {
    toast('双指缩放 · 拖动平移 · 点击地标看介绍，右下角进入知识问答', 3200);
  });

  /* 提示文字：用户操作后自动消失 */
  var hintEl = $('#mapHint');
  var hintTimer = setTimeout(hideHint, 5200);
  function hideHint() { clearTimeout(hintTimer); hintEl.classList.add('is-hide'); }
  /* 用户一动地图也消失 */
  if (window.RealMap) {
    var onceHide = function () { hideHint(); };
    setTimeout(function () {
      try { RealMap.map.on('movestart', onceHide); } catch (e) {}
    }, 800);
  }

  /* =========================================================
   *  四、问答入口 / Toast
   * ========================================================= */
  $('#quizEntry').addEventListener('click', function () {
    if (window.Quiz && typeof window.Quiz.open === 'function') {
      window.Quiz.open();
    } else {
      toast('问答模块加载中…');
    }
  });

  var toastEl = $('#toast');
  var toastTimer = null;
  function toast(msg, dur) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, dur || 2000);
  }

  /* =========================================================
   *  五、初始化 & 适配
   * ========================================================= */
  function init() {
    if (CFG.meta) {
      $('.topbar-title').textContent = CFG.meta.title;
      $('.topbar-sub').textContent   = CFG.meta.subtitle;
      document.title = CFG.meta.title + ' · 数字舞蹈地图';
    }
    /* 旋转 / 键盘 / 窗口尺寸变化 → 让地图重算尺寸 */
    window.addEventListener('resize', function () {
      if (window.RealMap) RealMap.invalidate();
    });
    window.addEventListener('orientationchange', function () {
      setTimeout(function () { if (window.RealMap) RealMap.invalidate(); }, 260);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* 切到后台自动暂停视频 */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && lmVideo && !lmVideo.paused) lmVideo.pause();
  });

  /* 暴露给 map.js / 控制台调试 */
  window.MapApp = {
    openLandmark: openLandmark,
    closeLandmark: closeLandmark,
    toast: toast
  };
})();