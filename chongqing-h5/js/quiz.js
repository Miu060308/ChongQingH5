/* =================================================================
 *  quiz.js —— 地标知识问答游戏
 *  ──────────────────────────────────────────────────────────────
 *  依赖：window.APP_CONFIG.quiz.{roundSize, shuffle, questions}
 *  启动顺序：config.js → quiz.js → app.js → map.js
 *
 *  暴露：window.Quiz = { open, close, start }
 * ================================================================= */
(function () {
  'use strict';

  var CFG = window.APP_CONFIG || {};
  var Q   = (CFG.quiz) || {};

  /* -------------------------------------------------------------
   *  工具
   * ------------------------------------------------------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function shuffle(arr) {
    var a = arr.slice(), i = a.length;
    while (i) {
      var j = Math.floor(Math.random() * i--);
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* -------------------------------------------------------------
   *  通过 from 找到对应的地标名（用于右上角标签 + 背景图）
   * ------------------------------------------------------------- */
  function findLandmark(key) {
    if (!key) return null;
    var list = CFG.landmarks || [];
    return list.find(function (l) {
      return l.id === key || l.name === key || l.pin === key;
    }) || null;
  }
  function landmarkBg(key) {
    var lm = findLandmark(key);
    if (!lm) return '';
    return lm.thumb || (lm.images && lm.images[0]) || '';
  }

  /* -------------------------------------------------------------
   *  状态
   * ------------------------------------------------------------- */
  var state = {
    list: [],
    index: 0,
    score: 0,
    locked: false
  };

  /* -------------------------------------------------------------
   *  打开 / 关闭
   * ------------------------------------------------------------- */
  function open() {
    var layer = $('#quizLayer');
    if (!layer) return;
    layer.classList.add('is-on');
    /* 让上层页面的视频暂停 */
    if (window.MapApp && window.MapApp.pauseAllMedia) window.MapApp.pauseAllMedia();
    showPage('start');
    /* 历史最佳 */
    var best = 0;
    if (window.MapApp && window.MapApp.getBestScore) best = window.MapApp.getBestScore();
    var bestEl = $('#qzBest'); if (bestEl) bestEl.textContent = String(best);
    /* 标题 */
    var titleEl = $('#qzTitle');
    if (titleEl) titleEl.textContent = ((CFG.meta && CFG.meta.title) || '重庆六大文化地标') + '知识大挑战';
    /* 背景：先放空，等待开始页切换 */
    setBg('');
  }
  function close() {
    var layer = $('#quizLayer');
    if (!layer) return;
    layer.classList.remove('is-on');
  }

  function showPage(name) {
    $$('.quiz-page').forEach(function (p) { p.classList.toggle('is-on', p.dataset.page === name); });
  }

  /* -------------------------------------------------------------
   *  切换背景图（每道题对应地标图）
   * ------------------------------------------------------------- */
  function setBg(url) {
    var bg = $('#quizBg');
    if (!bg) return;
    if (url) {
      bg.style.backgroundImage =
        'linear-gradient(rgba(247,240,230,.78),rgba(247,240,230,.78)),url(' + url + ')';
    } else {
      bg.style.backgroundImage = '';
    }
  }

  /* -------------------------------------------------------------
   *  开始 / 渲染题目 / 选项 / 提交
   * ------------------------------------------------------------- */
  function start() {
    var bank = (Q.questions || []).slice();
    if (!bank.length) return;
    var size = Math.min(Q.roundSize || 8, bank.length);
    var useShuffle = Q.shuffle !== false;
    state.list  = (useShuffle ? shuffle(bank) : bank.slice()).slice(0, size);
    state.index = 0;
    state.score = 0;
    state.locked = false;
    setScore(0);
    updateProgress();
    showPage('play');
    renderQuestion();
  }

  function setScore(n) {
    var el = $('#quizScore'); if (el) el.textContent = String(n);
    var box = $('.quiz-score');
    if (box) {
      box.classList.remove('is-bump');
      void box.offsetWidth;
      box.classList.add('is-bump');
    }
  }
  function updateProgress() {
    var bar = $('#quizBar');
    if (!bar) return;
    var pct = state.list.length ? (state.index / state.list.length) * 100 : 0;
    bar.style.width = pct + '%';
  }

  function renderQuestion() {
    state.locked = false;
    var q = state.list[state.index];
    if (!q) return;

    /* 进度 */
    updateProgress();
    /* 题目编号 */
    var idxEl = $('#qzIndex'); if (idxEl) idxEl.textContent = '第 ' + (state.index + 1) + ' / ' + state.list.length + ' 题';
    /* 关联地标名（右上角） */
    var lm = findLandmark(q.from);
    var fromEl = $('#qzFrom'); if (fromEl) fromEl.textContent = lm ? lm.name : (q.from || '');
    /* 题干 */
    var qEl = $('#qzQuestion'); if (qEl) qEl.textContent = q.q;
    /* 背景图 */
    setBg(landmarkBg(q.from));

    /* 选项 */
    var optWrap = $('#qzOptions'); if (!optWrap) return;
    optWrap.innerHTML = '';
    /* 题库内 answer 是「原顺序下标」，但每轮要把选项打乱并重算 answer。
       这样正确答案不会总在 A。 */
    var opt = q.options.map(function (t, i) { return { t: t, isAns: i === q.answer }; });
    var shuffled = shuffle(opt);
    var newAnsIdx = shuffled.findIndex(function (o) { return o.isAns; });
    var keyLabels = ['A', 'B', 'C', 'D', 'E', 'F'];

    shuffled.forEach(function (o, i) {
      var b = el('button', 'qz-opt');
      b.type = 'button';
      b.innerHTML = '<span class="qz-key">' + (keyLabels[i] || (i + 1)) + '</span><span class="qz-text">' + o.t + '</span>';
      b.addEventListener('click', function () { onAnswer(i, newAnsIdx, shuffled); });
      optWrap.appendChild(b);
    });

    /* 解析先隐藏 */
    var ex = $('#qzExplain'); if (ex) ex.classList.remove('is-on');
    /* 「下一题/查看结果」按钮也先隐藏，等答题后再显示 */
    var nw = $('#qzNextWrap'); if (nw) nw.classList.remove('is-on');
  }

  function onAnswer(picked, correctIdx, list) {
    if (state.locked) return;
    state.locked = true;
    var opts = $$('.qz-opt');
    opts.forEach(function (n, i) {
      n.classList.add('is-dim');
      if (i === correctIdx) n.classList.add('is-right');
      if (i === picked && picked !== correctIdx) n.classList.add('is-wrong');
    });

    var q = state.list[state.index];
    var isRight = picked === correctIdx;
    if (isRight) {
      state.score++;
      setScore(state.score);
      flyStar();
    }

    /* 显示解析 */
    var ex = $('#qzExplain'); if (ex) ex.classList.add('is-on');
    /* 显示「下一题/查看结果」按钮（移出 .qz-explain 后独立控制） */
    var nw = $('#qzNextWrap'); if (nw) nw.classList.add('is-on');
    var badge = $('#qxBadge');
    if (badge) {
      badge.className = 'qx-badge ' + (isRight ? 'right' : 'wrong');
      badge.textContent = isRight ? '答对了' : '答错了';
    }
    var txt = $('#qxText'); if (txt) txt.textContent = q.explain || '';
    /* 下一题文案：最后一题换成「查看结果」 */
    var next = $('#qzNext');
    if (next) next.textContent = (state.index === state.list.length - 1) ? '查看结果' : '下一题';
  }

  function next() {
    if (state.index + 1 >= state.list.length) {
      finish();
    } else {
      state.index++;
      renderQuestion();
    }
  }

  function flyStar() {
    var s = el('div', 'fly-star'); s.textContent = '★';
    s.style.left = (window.innerWidth / 2 - 10) + 'px';
    s.style.top  = (window.innerHeight / 2 - 40) + 'px';
    document.body.appendChild(s);
    var t = 0;
    var dx = -window.innerWidth / 2 + 60;
    var dy = -window.innerHeight / 2 + 40;
    var step = function () {
      t += 0.04;
      s.style.transform = 'translate(' + (dx * t) + 'px,' + (dy * t) + 'px) scale(' + (1 - 0.5 * t) + ')';
      s.style.opacity = String(1 - t);
      if (t < 1) requestAnimationFrame(step); else s.remove();
    };
    requestAnimationFrame(step);
  }

  /* -------------------------------------------------------------
   *  结果页
   * ------------------------------------------------------------- */
  function finish() {
    showPage('result');
    var n = state.list.length, s = state.score;
    $('#qzFinalScore').textContent = String(s);
    /* 星星展示 */
    var starWrap = $('#qzStars'); starWrap.innerHTML = '';
    for (var i = 0; i < n; i++) {
      var sp = el('span', i < s ? 'on' : '');
      sp.textContent = '★';
      sp.style.animationDelay = (i * 0.06) + 's';
      starWrap.appendChild(sp);
    }
    /* 评语 */
    var ratio = n ? s / n : 0;
    var comment;
    if (ratio >= 0.9)      comment = '堪称「重庆通」！你对巴渝文化的理解已经超越绝大多数人。';
    else if (ratio >= 0.7) comment = '已经很厉害了，再多刷几题就能全通。';
    else if (ratio >= 0.4) comment = '还不错，继续探索这些地标背后的故事吧。';
    else                   comment = '这里每一个知识点都值得在地图上亲自走一遍。';
    $('#qzComment').textContent = comment;
    /* 最佳 */
    var best = 0;
    if (window.MapApp && window.MapApp.getBestScore) best = window.MapApp.getBestScore();
    var newRec = (s > best);
    if (newRec && window.MapApp && window.MapApp.setBestScore) window.MapApp.setBestScore(s);
    $('#qzNewRecord').textContent = newRec ? ' · 新纪录！' : '';
  }

  /* -------------------------------------------------------------
   *  启动绑定
   * ------------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', function () {
    var lb = $('#qzStart');
    var nextBtn = $('#qzNext');
    var restart = $('#qzRestart');
    var back = $('#qzBackHome');
    var quizBack = $('#quizBack');

    if (lb) lb.addEventListener('click', start);
    if (nextBtn) nextBtn.addEventListener('click', next);
    if (restart) restart.addEventListener('click', start);
    if (back) back.addEventListener('click', function () {
      close();
      if (window.MapApp && window.MapApp.showHome) window.MapApp.showHome();
    });
    if (quizBack) quizBack.addEventListener('click', close);
  });

  /* -------------------------------------------------------------
   *  暴露
   * ------------------------------------------------------------- */
  window.Quiz = { open: open, close: close, start: start };
})();