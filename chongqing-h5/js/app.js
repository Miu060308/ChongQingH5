/* =================================================================
 *  app.js  ——  主页面（立体数字地图）与地标卡片逻辑
 *  ──────────────────────────────────────────────────────────────
 *  启动顺序（由 index.html 控制）：
 *    config.js → quiz.js → app.js → map.js
 *
 *  首页地图要点：
 *    · 底图与 marker 同处一个 .home-canvas 变换层
 *    · canvas 尺寸严格按背景图原始宽高比计算 → marker 用百分比定位
 *      ⇒ 任何屏幕尺寸 / 横竖屏 / 缩放状态下，地标落点都不会错位
 *    · 支持双指缩放、单指拖拽、按钮缩放、滚轮缩放、双击缩放
 *    · 缩放区间 minScale~maxScale，平移自动限制边界（拖不出画面）
 *
 *  暴露给 quiz.js / 外部的 API：
 *    MapApp.openLandmark(id)  // 打开某地标卡片
 *    MapApp.pauseAllMedia()   // 暂停所有 video/audio
 *    MapApp.getBestScore() / setBestScore(n)
 *    MapApp.showHome() / showNav()
 *    MapApp.openBottomSheet('intro'|'concept'|'social')
 * ================================================================= */
(function () {
  'use strict';

  var CFG = window.APP_CONFIG;

  /* -------------------------------------------------------------
   *  通用工具
   * ------------------------------------------------------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function clampNum(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* =============================================================
   *  一、首页：立体数字地图（可缩放 / 可拖拽）
   * ============================================================= */
  var HomeMap = {
    wrap: null, canvas: null, bg: null, layer: null,
    view: { x: 0, y: 0, s: 1 },
    base: { w: 0, h: 0 },
    minS: 1, maxS: 4,
    dragged: false,          // 刚刚是否发生过拖拽（用于区分点击 marker）

    init: function () {
      this.wrap   = $('#homeMapWrap');
      this.canvas = $('#homeCanvas');
      this.bg     = $('#homeBg');
      this.layer  = $('#homeMap');
      if (!this.wrap || !this.canvas || !this.layer) return;

      var self = this;

      /* 底图加载完成 / 尺寸变化 → 重新测量 */
      if (this.bg) {
        if (this.bg.complete && this.bg.naturalWidth) this.measure();
        this.bg.addEventListener('load', function () { self.measure(); });
        this.bg.addEventListener('error', function () { self.measure(); });
      }

      this.buildMarkers();
      this.measure();
      this.bindGesture();
      this.bindZoomBtns();

      if (window.ResizeObserver) {
        new ResizeObserver(function () { self.measure(); }).observe(this.wrap);
      } else {
        window.addEventListener('resize', function () { self.measure(); });
      }
      window.addEventListener('orientationchange', function () {
        setTimeout(function () { self.measure(); }, 260);
      });

      /* 手势提示 3.5 秒后淡出 */
      var hint = $('#mapHint');
      if (hint) setTimeout(function () { hint.classList.add('is-hide'); }, 3500);
    },

    /* ---------- 6 个地标点位（三层结构） ---------- */
    buildMarkers: function () {
      var list = CFG.landmarks || [];
      var self = this;
      this.layer.innerHTML = '';
      list.forEach(function (lm, i) {
        var m = el('div', 'hm-marker');
        m.dataset.id = lm.id;
        /* 百分比定位：相对 canvas（与底图同尺寸），永不错位 */
        m.style.left = lm.homeX + '%';
        m.style.top  = lm.homeY + '%';

        var scaleLayer = el('div', 'hm-mk-scale');       // 反向缩放，保持视觉大小
        var floatLayer = el('div', 'hm-mk-float');       // 悬浮呼吸动效
        floatLayer.style.animationDelay = (i * 0.18) + 's';

        floatLayer.appendChild(el('div', 'hm-pulse'));   // 脉动光环
        floatLayer.appendChild(el('div', 'hm-glow'));    // 底部柔光

        /* 实景建筑图 */
        var imgWrap = el('div', 'hm-img');
        var img = el('img');
        img.src = lm.homeIcon || '';
        img.alt = lm.name || '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.onerror = function () {
          imgWrap.classList.add('hm-img-fallback');
          if (img.parentNode) img.parentNode.removeChild(img);
          imgWrap.textContent = String(i + 1);
        };
        imgWrap.appendChild(img);
        floatLayer.appendChild(imgWrap);

        /* 名称标签 */
        var lbl = el('div', 'hm-label');
        lbl.innerHTML =
          '<span class="hm-num">' + (i + 1) + '</span>' +
          '<span>' + (lm.pin || lm.name) + '</span>';
        floatLayer.appendChild(lbl);

        scaleLayer.appendChild(floatLayer);
        m.appendChild(scaleLayer);

        m.addEventListener('click', function (e) {
          e.stopPropagation();
          if (self.dragged) return;      // 刚拖过地图，不算点击
          openLandmark(lm);
        });
        self.layer.appendChild(m);
      });
      /* 首次同步 marker 的反向缩放 */
      this.syncMarkerScale();
    },

    /* ---------- 测量：canvas 按底图宽高比铺满可视区 ---------- */
    measure: function () {
      if (!this.wrap || !this.canvas) return;
      var cw = this.wrap.clientWidth, ch = this.wrap.clientHeight;
      if (!cw || !ch) return;

      var ir = (this.bg && this.bg.naturalWidth && this.bg.naturalHeight)
        ? this.bg.naturalWidth / this.bg.naturalHeight
        : (cw / ch);
      var cr = cw / ch;
      /* contain：完整显示底图，不裁切，保证 6 个地标都在画面内 */
      if (ir > cr) { this.base.w = cw; this.base.h = cw / ir; }
      else         { this.base.h = ch; this.base.w = ch * ir; }

      this.canvas.style.width  = this.base.w + 'px';
      this.canvas.style.height = this.base.h + 'px';
      this.clamp();
      this.apply();
    },

    /* ---------- 边界限制：不让地图被拖出可视区 ---------- */
    clamp: function () {
      var cw = this.wrap.clientWidth, ch = this.wrap.clientHeight;
      var sw = this.base.w * this.view.s;
      var sh = this.base.h * this.view.s;
      /* 比视口小 → 居中；比视口大 → 限制在 [视口-内容, 0] */
      this.view.x = (sw <= cw) ? (cw - sw) / 2 : clampNum(this.view.x, cw - sw, 0);
      this.view.y = (sh <= ch) ? (ch - sh) / 2 : clampNum(this.view.y, ch - sh, 0);
    },

    /* ---------- 应用变换 ---------- */
    apply: function () {
      this.canvas.style.transform =
        'translate3d(' + this.view.x + 'px,' + this.view.y + 'px,0) scale(' + this.view.s + ')';
      this.syncMarkerScale();
    },
    /* marker 反向缩放：缩放地图时图标视觉大小恒定 */
    syncMarkerScale: function () {
      var inv = 1 / this.view.s;
      var ns = this.layer ? this.layer.querySelectorAll('.hm-mk-scale') : [];
      for (var i = 0; i < ns.length; i++) ns[i].style.setProperty('--inv', inv);
    },

    /* ---------- 以某个屏幕点为锚点缩放 ---------- */
    zoomAt: function (ns, clientX, clientY) {
      ns = clampNum(ns, this.minS, this.maxS);
      var r = this.wrap.getBoundingClientRect();
      var px = clientX - r.left, py = clientY - r.top;
      var k = ns / this.view.s;
      this.view.x = px - (px - this.view.x) * k;
      this.view.y = py - (py - this.view.y) * k;
      this.view.s = ns;
      this.clamp();
      this.apply();
    },
    zoomCenter: function (ns) {
      var r = this.wrap.getBoundingClientRect();
      this.zoomAt(ns, r.left + r.width / 2, r.top + r.height / 2);
    },
    reset: function () {
      this.view.s = 1; this.view.x = 0; this.view.y = 0;
      this.clamp(); this.apply();
    },

    /* ---------- 手势：双指缩放 + 单指拖拽 ---------- */
    bindGesture: function () {
      var self = this;
      var w = this.wrap;
      var st = null;

      function dist(t) {
        var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
        return Math.sqrt(dx * dx + dy * dy) || 1;
      }
      function mid(t, k) { return (t[0][k] + t[1][k]) / 2; }

      w.addEventListener('touchstart', function (e) {
        self.dragged = false;
        if (e.touches.length === 1) {
          st = { mode: 1, x: e.touches[0].clientX, y: e.touches[0].clientY,
                 vx: self.view.x, vy: self.view.y };
        } else if (e.touches.length >= 2) {
          st = { mode: 2, d: dist(e.touches), s: self.view.s };
        }
      }, { passive: true });

      w.addEventListener('touchmove', function (e) {
        if (!st) return;
        if (e.cancelable) e.preventDefault();     // 阻止页面整体滚动
        if (st.mode === 1 && e.touches.length === 1) {
          var dx = e.touches[0].clientX - st.x, dy = e.touches[0].clientY - st.y;
          if (Math.abs(dx) > 4 || Math.abs(dy) > 4) self.dragged = true;
          self.view.x = st.vx + dx;
          self.view.y = st.vy + dy;
          w.classList.add('is-drag');
          self.clamp(); self.apply();
        } else if (st.mode === 2 && e.touches.length >= 2) {
          self.dragged = true;
          var nd = dist(e.touches);
          self.zoomAt(st.s * (nd / st.d), mid(e.touches, 'clientX'), mid(e.touches, 'clientY'));
        }
      }, { passive: false });

      function endTouch(e) {
        /* 双指松开一根 → 转为单指拖拽基准，避免跳动 */
        if (st && st.mode === 2 && e.touches && e.touches.length === 1) {
          st = { mode: 1, x: e.touches[0].clientX, y: e.touches[0].clientY,
                 vx: self.view.x, vy: self.view.y };
          return;
        }
        st = null;
        w.classList.remove('is-drag');
        setTimeout(function () { self.dragged = false; }, 60);
      }
      w.addEventListener('touchend', endTouch);
      w.addEventListener('touchcancel', endTouch);

      /* 桌面端：滚轮缩放 + 拖拽平移 + 双击放大
         注意：发生在缩放控件上的操作不算地图手势 */
      function onCtrl(e) {
        return !!(e.target && e.target.closest && e.target.closest('.map-zoom'));
      }
      w.addEventListener('wheel', function (e) {
        if (onCtrl(e)) return;
        e.preventDefault();
        var ns = self.view.s * (e.deltaY < 0 ? 1.12 : 1 / 1.12);
        self.zoomAt(ns, e.clientX, e.clientY);
      }, { passive: false });

      var mst = null;
      w.addEventListener('mousedown', function (e) {
        if (onCtrl(e)) return;
        mst = { x: e.clientX, y: e.clientY, vx: self.view.x, vy: self.view.y };
        w.classList.add('is-drag');
      });
      window.addEventListener('mousemove', function (e) {
        if (!mst) return;
        var dx = e.clientX - mst.x, dy = e.clientY - mst.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) self.dragged = true;
        self.view.x = mst.vx + dx;
        self.view.y = mst.vy + dy;
        self.clamp(); self.apply();
      });
      window.addEventListener('mouseup', function () {
        mst = null;
        w.classList.remove('is-drag');
        setTimeout(function () { self.dragged = false; }, 60);
      });

      w.addEventListener('dblclick', function (e) {
        if (onCtrl(e)) return;
        self.zoomAt(self.view.s >= (self.maxS - 0.01) ? 1 : self.view.s * 1.8, e.clientX, e.clientY);
      });
    },

    /* ---------- 缩放按钮 ---------- */
    bindZoomBtns: function () {
      var self = this;
      var bIn = $('#hzIn'), bOut = $('#hzOut'), bRst = $('#hzReset');
      if (bIn)  bIn.addEventListener('click',  function () { self.zoomCenter(self.view.s * 1.5); });
      if (bOut) bOut.addEventListener('click', function () { self.zoomCenter(self.view.s / 1.5); });
      if (bRst) bRst.addEventListener('click', function () { self.reset(); });
    }
  };

  /* =============================================================
   *  二、地标卡片（居中弹窗：文字 / 实景 / 视频）
   * ============================================================= */
  /* 左右滑动切换轮播：横向位移 > 40px 且大于纵向位移才触发，避免与页面滚动冲突 */
  function bindSwipe(node) {
    if (!node) return;
    var x0 = null, y0 = null;
    node.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { x0 = null; return; }
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
    }, { passive: true });
    node.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - x0, dy = t.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) stepGallery(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  function buildLandmarkCard() {
    var p = $('#lmPanel');
    if (!p) return;
    p.innerHTML =
      '<div class="lm-mask" data-close></div>' +
      '<div class="lm-card">' +
        '<button class="lm-close" type="button" aria-label="关闭">×</button>' +
        /* 卡片顶部：地标题图（自适应不变形） */
        '<div class="lm-gallery" id="lmGallery">' +
          '<div class="lg-stage" id="lmStage"><img class="is-on" alt=""><img alt=""></div>' +
          '<div class="lg-dots" id="lmDots"></div>' +
          '<div class="lg-thumbs" id="lmThumbs"></div>' +
          '<button class="lg-prev" type="button" aria-label="上一张">‹</button>' +
          '<button class="lg-next" type="button" aria-label="下一张">›</button>' +
        '</div>' +
        '<div class="lm-body">' +
          '<div class="lm-tags"><span class="lm-tag" id="lmTag"></span></div>' +
          '<h2 class="lm-title" id="lmTitle"></h2>' +
          '<div class="lm-sub" id="lmSub"></div>' +
          '<div class="lm-facts" id="lmFacts"></div>' +
          '<div class="lm-tabs">' +
            '<button class="lm-tab is-on" data-tab="desc">文化印记</button>' +
            '<button class="lm-tab" data-tab="photo">实景风光</button>' +
            '<button class="lm-tab" data-tab="video">舞蹈影像</button>' +
          '</div>' +
          /* 1. 文字板块 */
          '<div class="lm-desc is-on" id="lmDesc"></div>' +
          /* 2. 实景风光板块（大图 + 切换） */
          '<div class="lm-photo" id="lmPhoto">' +
            '<div class="lp-frame" id="lpFrame"><img class="is-on" alt=""><img alt=""></div>' +
            '<div class="lp-bar">' +
              '<button class="lp-nav" type="button" data-dir="-1" aria-label="上一张">‹ 上一张</button>' +
              '<span class="lp-count" id="lpCount"></span>' +
              '<button class="lp-nav" type="button" data-dir="1" aria-label="下一张">下一张 ›</button>' +
            '</div>' +
          '</div>' +
          /* 3. 原创视频板块 */
          '<div class="lm-video" id="lmVideo">' +
            '<div class="video-box">' +
              '<video id="lmVideoTag" playsinline preload="none" webkit-playsinline></video>' +
              '<button class="video-mute" id="videoMute" type="button" aria-label="静音切换">🔇</button>' +
              '<div class="video-cover" id="videoCover"><span class="vc-play">▶</span>点击播放舞蹈短片</div>' +
              '<div class="video-missing" id="videoMissing">原创短片占位<br>把 mp4 放到 <code>assets/video/</code> 并在 config.js 填 video 路径</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    /* 关闭：遮罩 / 关闭按钮 */
    $$('.lm-mask, .lm-close', p).forEach(function (n) {
      n.addEventListener('click', closeLandmark);
    });

    /* Tab 切换 */
    $$('.lm-tab', p).forEach(function (t) {
      t.addEventListener('click', function () {
        $$('.lm-tab', p).forEach(function (x) { x.classList.remove('is-on'); });
        t.classList.add('is-on');
        var k = t.dataset.tab;
        $('#lmDesc',  p).classList.toggle('is-on', k === 'desc');
        $('#lmPhoto', p).classList.toggle('is-on', k === 'photo');
        $('#lmVideo', p).classList.toggle('is-on', k === 'video');
        /* 离开视频页 → 暂停，避免后台播放 */
        if (k !== 'video') stopVideo();
      });
    });

    /* 顶部轮播左右箭头 */
    $$('.lg-prev, .lg-next', p).forEach(function (b) {
      b.addEventListener('click', function () {
        stepGallery(b.classList.contains('lg-next') ? 1 : -1, true);
      });
    });

    /* 实景风光大图切换 */
    $$('.lp-nav', p).forEach(function (b) {
      b.addEventListener('click', function () {
        stepGallery(parseInt(b.dataset.dir, 10) || 1, true);
      });
    });

    /* 轮播手势：头图与实景大图都支持左右滑动切换 */
    bindSwipe($('#lmGallery', p));
    bindSwipe($('.lp-frame', p));

    /* 静音切换 */
    var muteBtn = $('#videoMute', p);
    if (muteBtn) {
      muteBtn.addEventListener('click', function () {
        var v = $('#lmVideoTag', p);
        if (!v) return;
        v.muted = !v.muted;
        muteBtn.textContent = v.muted ? '🔇' : '🔊';
      });
    }
  }

  /* ---------- 图片轮播（头图 + 实景大图共用一份数据） ----------
     双图层交叉淡入 + 自动轮播，用户交互后重新计时 */
  var gallery = { list: [], idx: 0, timer: null };
  var AUTO_MS = 4200;

  function buildGalleryList(lm) {
    var list = [];
    if (lm.thumb) list.push(lm.thumb);
    (lm.images || []).forEach(function (s) { if (s && list.indexOf(s) < 0) list.push(s); });
    if (!list.length) list = [''];
    return list;
  }

  /* stage 内两个 img 交替淡入淡出 */
  function crossfade(stage, src, alt) {
    if (!stage) return;
    var imgs = stage.querySelectorAll('img');
    if (imgs.length < 2) { if (imgs[0]) imgs[0].src = src; return; }
    var show = imgs[0].classList.contains('is-on') ? imgs[1] : imgs[0];
    var hide = show === imgs[0] ? imgs[1] : imgs[0];
    var swap = function () {
      show.classList.add('is-on');
      hide.classList.remove('is-on');
    };
    show.onload = swap;
    show.onerror = function () { swap(); };
    if (show.complete && show.src === src) swap();
    show.src = src;
    show.alt = alt || '';
  }

  function renderSlide(alt) {
    var src = gallery.list[gallery.idx];
    crossfade(document.getElementById('lmStage'), src, alt);
    crossfade(document.getElementById('lpFrame'), src, alt);
    var cnt = $('#lpCount');
    if (cnt) cnt.textContent = (gallery.idx + 1) + ' / ' + gallery.list.length;
    $$('.lg-thumbs span').forEach(function (t, i) { t.classList.toggle('is-on', i === gallery.idx); });
    $$('.lg-dots i').forEach(function (d, i) { d.classList.toggle('is-on', i === gallery.idx); });
  }

  function stepGallery(d, byUser) {
    if (gallery.list.length < 1) return;
    var n = gallery.list.length;
    gallery.idx = (gallery.idx + d + n) % n;
    renderSlide();
    if (byUser) pokeAuto();
  }
  function gotoSlide(i, byUser) {
    if (i < 0 || i >= gallery.list.length || i === gallery.idx) return;
    gallery.idx = i;
    renderSlide();
    if (byUser) pokeAuto();
  }

  /* 自动轮播 */
  function startAuto() {
    stopAuto();
    if (gallery.list.length > 1) {
      gallery.timer = setInterval(function () { stepGallery(1); }, AUTO_MS);
    }
  }
  function stopAuto() {
    if (gallery.timer) { clearInterval(gallery.timer); gallery.timer = null; }
  }
  function pokeAuto() { startAuto(); }   // 用户操作后重新计时

  /* ---------- 视频控制 ---------- */
  function stopVideo() {
    var p = $('#lmPanel');
    if (!p) return;
    var v = $('#lmVideoTag', p);
    if (!v) return;
    try { v.pause(); } catch (e) {}
    v.currentTime = 0;
    var cover = $('#videoCover', p);
    if (cover) cover.classList.remove('is-hide');
  }

  /* ---------- 打开 / 关闭卡片 ---------- */
  var currentLandmark = null;
  function openLandmark(lm) {
    currentLandmark = lm;
    var p = $('#lmPanel');
    if (!p) return;

    $('#lmTag', p).textContent  = lm.tag || '';
    $('#lmTitle', p).textContent = lm.name || '';
    $('#lmSub', p).textContent   = lm.subtitle || '';

    /* 关键数据条 */
    var facts = $('#lmFacts', p);
    facts.innerHTML = '';
    (lm.facts || []).forEach(function (f) {
      var b = el('div', 'lf-item');
      b.innerHTML = '<span class="lf-k">' + f.k + '</span><span class="lf-v">' + f.v + '</span>';
      facts.appendChild(b);
    });

    /* 文字板块：可滚动长文本 */
    var d = $('#lmDesc', p);
    d.innerHTML = '';
    (lm.desc || []).forEach(function (t) {
      var para = el('p');
      para.textContent = t;
      d.appendChild(para);
    });

    /* 图片轮播：双图层 + 自动播放 */
    gallery.list = buildGalleryList(lm);
    gallery.idx = 0;
    stopAuto();
    var cnt = $('#lpCount');
    if (cnt) cnt.textContent = '1 / ' + gallery.list.length;

    /* 首张直接显示（不淡入），后续切换才做 crossfade */
    var stage = $('#lmStage', p), frame = $('#lpFrame', p);
    ['lmStage', 'lpFrame'].forEach(function (id) {
      var st = document.getElementById(id);
      if (!st) return;
      var imgs = st.querySelectorAll('img');
      imgs[0].classList.add('is-on');
      imgs[0].src = gallery.list[0];
      imgs[0].alt = lm.name || '';
      if (imgs[1]) { imgs[1].classList.remove('is-on'); imgs[1].removeAttribute('src'); }
    });

    /* 圆点指示器 */
    var dots = $('#lmDots', p);
    dots.innerHTML = '';
    if (gallery.list.length > 1) {
      dots.style.display = '';
      gallery.list.forEach(function (s, i) {
        var d = el('i', i === 0 ? 'is-on' : '');
        d.addEventListener('click', function () { gotoSlide(i, true); });
        dots.appendChild(d);
      });
    } else { dots.style.display = 'none'; }

    /* 缩略图条（懒加载小照片） */
    var thumbs = $('#lmThumbs', p);
    thumbs.innerHTML = '';
    if (gallery.list.length > 1) {
      thumbs.style.display = '';
      gallery.list.forEach(function (s, i) {
        var t = el('span', i === 0 ? 'is-on' : '');
        var ti = el('img');
        ti.src = s; ti.alt = ''; ti.loading = 'lazy'; ti.decoding = 'async';
        t.appendChild(ti);
        t.addEventListener('click', function () { gotoSlide(i, true); });
        thumbs.appendChild(t);
      });
    } else {
      thumbs.style.display = 'none';
    }

    /* 视频：默认静音，不自动播放 */
    var v = $('#lmVideoTag', p);
    var cover = $('#videoCover', p);
    var miss  = $('#videoMissing', p);
    var muteB = $('#videoMute', p);
    v.removeAttribute('src');
    v.muted = true;                       // 静默加载，绝不会突然出声
    v.controls = true;
    if (muteB) muteB.textContent = '🔇';
    if (lm.video) {
      v.src = lm.video;
      miss.style.display = 'none';
    } else {
      miss.style.display = 'flex';
    }
    cover.classList.remove('is-hide');
    cover.onclick = function () {
      if (!lm.video) return;
      cover.classList.add('is-hide');
      var pr = v.play();
      if (pr && pr.catch) pr.catch(function () { cover.classList.remove('is-hide'); });
    };

    /* 默认停在「文化印记」 */
    $$('.lm-tab', p).forEach(function (x, i) { x.classList.toggle('is-on', i === 0); });
    $('#lmDesc',  p).classList.add('is-on');
    $('#lmPhoto', p).classList.remove('is-on');
    $('#lmVideo', p).classList.remove('is-on');

    p.classList.add('is-on');
    document.body.style.overflow = 'hidden';
  }

  function closeLandmark() {
    var p = $('#lmPanel');
    if (!p) return;
    stopAuto();                        // 关卡片停自动轮播
    /* 关闭时自动暂停并卸载视频，避免后台持续播放 */
    var v = $('#lmVideoTag', p);
    if (v) {
      try { v.pause(); } catch (e) {}
      v.removeAttribute('src');
      try { v.load(); } catch (e) {}
    }
    var cover = $('#videoCover', p);
    if (cover) cover.classList.remove('is-hide');
    p.classList.remove('is-on');
    document.body.style.overflow = '';
    currentLandmark = null;
  }
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeLandmark();
  });

  /* =============================================================
   *  三、底部导航
   * ============================================================= */
  function bindBottomNav() {
    $$('#bottomNav [data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.dataset.act;
        if (act === 'quiz')     { window.Quiz && window.Quiz.open(); }
        else if (act === 'nav') { showStage('nav'); }
        else                    { openBottomSheet(act); }
      });
    });
    $$('.sheet .sheet-close, #sheetMask').forEach(function (n) {
      n.addEventListener('click', closeBottomSheet);
    });

    fillSheetBody('sheetIntroBody',   CFG.site.intro   && CFG.site.intro.paragraphs);
    fillSheetBody('sheetConceptBody', CFG.site.concept && CFG.site.concept.paragraphs);
    fillSheetBody('sheetSocialBody',  CFG.site.social  && CFG.site.social.paragraphs);
    fillSheetLinks('#sheetIntro .sheet-links',  CFG.site.social && CFG.site.social.links);
    fillSheetLinks('#sheetSocial .sheet-links', CFG.site.social && CFG.site.social.links);
  }

  function fillSheetBody(id, paras) {
    var box = document.getElementById(id);
    if (!box || !paras) return;
    box.innerHTML = '';
    paras.forEach(function (t) {
      var p = el('p'); p.textContent = t; box.appendChild(p);
    });
  }
  function fillSheetLinks(sel, links) {
    var box = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!box || !links) return;
    box.innerHTML = '';
    links.forEach(function (l) {
      var a = el('a', 'sheet-link');
      a.href = l.url || 'javascript:void(0)';
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML =
        '<span class="sl-dot"></span>' +
        '<span class="sl-name">' + (l.name || '') + '</span>' +
        '<span class="sl-desc">' + (l.desc || '') + '</span>';
      box.appendChild(a);
    });
  }

  function openBottomSheet(name) {
    var m = $('#sheetMask');
    var s = $('#sheet' + name.charAt(0).toUpperCase() + name.slice(1));
    if (!m || !s) return;
    m.classList.add('is-on');
    s.classList.add('is-on');
    document.body.style.overflow = 'hidden';
  }
  function closeBottomSheet() {
    $$('.sheet, #sheetMask').forEach(function (n) { n.classList.remove('is-on'); });
    document.body.style.overflow = '';
  }

  /* =============================================================
   *  四、导航页返回 / 舞台切换
   * ============================================================= */
  function bindNavBackBtn() {
    var b = document.getElementById('btnBackHome');
    if (!b) return;
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      closeBottomSheet();
      closeLandmark();
      if (window.Quiz && typeof window.Quiz.close === 'function') window.Quiz.close();
      showStage('home');
    });
  }

  function showStage(name) {
    var home = $('#homeStage');
    var nav  = $('#navStage');
    if (!home || !nav) return;
    if (name === 'home') {
      home.classList.add('is-on');
      nav.classList.remove('is-on');
      if (window.RealMap) RealMap.invalidate();
      /* 回到首页时重新测量，防止尺寸变了地标错位 */
      setTimeout(function () { HomeMap.measure(); }, 60);
    } else {
      nav.classList.add('is-on');
      home.classList.remove('is-on');
      setTimeout(function () {
        if (window.RealMap) { RealMap.invalidate(); RealMap.fitAll(); }
      }, 80);
    }
  }

  function pauseAllMedia() {
    if ($('#lmPanel')) stopVideo();
  }

  /* ---------- 历史最佳 ---------- */
  var BEST_KEY = 'cq_h5_quiz_best_v1';
  function getBestScore() {
    try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) { return 0; }
  }
  function setBestScore(n) {
    try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) {}
  }

  /* ---------- Toast ---------- */
  function toast(msg) {
    var t = $('#topToast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('is-on'); }, 1800);
  }

  /* =============================================================
   *  启动
   * ============================================================= */
  document.addEventListener('DOMContentLoaded', function () {
    buildLandmarkCard();
    HomeMap.init();
    bindBottomNav();
    bindNavBackBtn();
    showStage('home');
  });

  /* =============================================================
   *  暴露 API
   * ============================================================= */
  window.MapApp = {
    openLandmark: function (id) {
      var lm = (CFG.landmarks || []).find(function (x) { return x.id === id; });
      if (!lm) {
        lm = (CFG.landmarks || []).find(function (x) {
          return x.name === id || x.pin === id;
        });
      }
      if (lm) openLandmark(lm);
    },
    pauseAllMedia: pauseAllMedia,
    getBestScore:  getBestScore,
    setBestScore:  setBestScore,
    showHome:      function () { showStage('home'); },
    showNav:       function () { showStage('nav'); },
    openBottomSheet: openBottomSheet,
    closeBottomSheet: closeBottomSheet,
    closeLandmark: closeLandmark,
    toast: toast
  };
})();
