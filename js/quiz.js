/* =================================================================
 *  quiz.js —— 六大地标 · 关卡式知识问答
 *  ──────────────────────────────────────────────────────────────
 *  规则：
 *    · 六个地标 = 六个关卡，每关 5 题（全部来自该地标题库，顺序打乱）
 *    · 答错即时显示文化解析，可反复挑战
 *    · 满分通关（5/5）→ localStorage 记录点亮 → 首页该地标加学习之星
 *  进度：localStorage 'cqClear_<id>' = '1'
 *  依赖：window.APP_CONFIG.quiz.questions（from 字段 = 地标 id）
 *  暴露：window.Quiz = { open, close, startLevel, isCleared, clearedCount }
 * ================================================================= */
(function () {
  'use strict';

  var CFG = window.APP_CONFIG || {};
  var Q   = (CFG.quiz) || {};
  var LS_PREFIX = 'cqClear_';

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
   *  点亮进度（localStorage）
   * ------------------------------------------------------------- */
  function isCleared(id) {
    try { return localStorage.getItem(LS_PREFIX + id) === '1'; } catch (e) { return false; }
  }
  function setClear(id) {
    try { localStorage.setItem(LS_PREFIX + id, '1'); } catch (e) {}
    /* 通知首页 / 导航页刷新星星 */
    try { window.dispatchEvent(new CustomEvent('cq:clear', { detail: { id: id } })); } catch (e) {}
  }
  function resetAll() {
    (CFG.landmarks || []).forEach(function (l) {
      try { localStorage.removeItem(LS_PREFIX + l.id); } catch (e) {}
    });
    try { window.dispatchEvent(new CustomEvent('cq:clear', { detail: {} })); } catch (e) {}
  }
  function clearedCount() {
    return (CFG.landmarks || []).filter(function (l) { return isCleared(l.id); }).length;
  }

  /* -------------------------------------------------------------
   *  状态
   * ------------------------------------------------------------- */
  var state = {
    level: null,      // 当前关卡地标对象
    list: [],
    index: 0,
    score: 0,
    locked: false
  };

  /* -------------------------------------------------------------
   *  打开 / 关闭 / 页面切换
   * ------------------------------------------------------------- */
  function open() {
    var layer = $('#quizLayer');
    if (!layer) return;
    layer.classList.add('is-on');
    if (window.MapApp && window.MapApp.pauseAllMedia) window.MapApp.pauseAllMedia();
    showPage('start');
    renderLevels();
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
   *  关卡选择页
   * ------------------------------------------------------------- */
  function renderLevels() {
    var wrap = $('#qzLevelList');
    if (!wrap) return;
    wrap.innerHTML = '';
    var list = (CFG.landmarks || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var done = 0;
    list.forEach(function (lm, i) {
      var cleared = isCleared(lm.id);
      if (cleared) done++;
      var n = (Q.questions || []).filter(function (q) { return q.from === lm.id; }).length;
      var card = el('button', 'qz-level' + (cleared ? ' is-cleared' : ''));
      card.type = 'button';
      card.innerHTML =
        '<span class="qlv-no">' + (i + 1) + '</span>' +
        '<span class="qlv-info">' +
          '<span class="qlv-name">' + (lm.name || lm.pin) + '</span>' +
          '<span class="qlv-sub">' + (lm.tag || '') + ' · ' + n + ' 题</span>' +
        '</span>' +
        '<span class="qlv-star">' + (cleared ? '★' : '☆') + '</span>';
      card.addEventListener('click', function () { startLevel(lm.id); });
      wrap.appendChild(card);
    });
    var titleEl = $('#qzDesc');
    if (titleEl) titleEl.textContent =
      '已点亮 ' + done + ' / ' + list.length + ' · 集齐六星解锁「山城文化通」';
  }

  /* -------------------------------------------------------------
   *  开始某关 / 渲染题目
   * ------------------------------------------------------------- */
  function startLevel(id) {
    var lm = findLandmark(id);
    if (!lm) return;
    var bank = (Q.questions || []).filter(function (q) { return q.from === id; });
    if (!bank.length) return;
    state.level  = lm;
    state.list   = shuffle(bank);          // 每关全部题目，顺序打乱
    state.index  = 0;
    state.score  = 0;
    state.locked = false;
    setScore(0);
    updateProgress();
    showPage('play');
    renderQuestion();
  }

  /* 兼容旧入口：默认进第一关 */
  function start() {
    var first = (CFG.landmarks || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); })[0];
    if (first) startLevel(first.id);
  }

  function setScore(n) {
    var e = $('#quizScore'); if (e) e.textContent = String(n);
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

    updateProgress();
    var idxEl = $('#qzIndex');
    if (idxEl) idxEl.textContent = '第 ' + (state.index + 1) + ' / ' + state.list.length + ' 题';
    var fromEl = $('#qzFrom');
    if (fromEl) fromEl.textContent = state.level ? ('关卡·' + (state.level.pin || state.level.name)) : '';

    var qEl = $('#qzQuestion'); if (qEl) qEl.textContent = q.q;
    setBg(landmarkBg(q.from));

    var optWrap = $('#qzOptions'); if (!optWrap) return;
    optWrap.innerHTML = '';
    /* 选项打乱并重算正确下标，正确答案不会总在 A */
    var opt = q.options.map(function (t, i) { return { t: t, isAns: i === q.answer }; });
    var shuffled = shuffle(opt);
    var newAnsIdx = shuffled.findIndex(function (o) { return o.isAns; });
    var keyLabels = ['A', 'B', 'C', 'D', 'E', 'F'];

    shuffled.forEach(function (o, i) {
      var b = el('button', 'qz-opt');
      b.type = 'button';
      b.innerHTML = '<span class="qz-key">' + (keyLabels[i] || (i + 1)) + '</span><span class="qz-text">' + o.t + '</span>';
      b.addEventListener('click', function () { onAnswer(i, newAnsIdx); });
      optWrap.appendChild(b);
    });

    var ex = $('#qzExplain'); if (ex) ex.classList.remove('is-on');
    var nw = $('#qzNextWrap'); if (nw) nw.classList.remove('is-on');
  }

  function onAnswer(picked, correctIdx) {
    if (state.locked) return;
    state.locked = true;
    var opts = $$('.qz-opt');
    opts.forEach(function (n, i) {
      n.classList.add('is-dim');
      if (i === correctIdx) n.classList.add('is-right');
      if (i === picked && picked !== correctIdx) n.classList.add('is-wrong');
    });

    var isRight = picked === correctIdx;
    if (isRight) {
      state.score++;
      setScore(state.score);
      flyStar();
    }

    var q = state.list[state.index];
    var ex = $('#qzExplain'); if (ex) ex.classList.add('is-on');
    var nw = $('#qzNextWrap'); if (nw) nw.classList.add('is-on');
    var badge = $('#qxBadge');
    if (badge) {
      badge.className = 'qx-badge ' + (isRight ? 'right' : 'wrong');
      badge.textContent = isRight ? '答对了' : '答错了';
    }
    var txt = $('#qxText'); if (txt) txt.textContent = q.explain || '';
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
   *  结果页：满分 → 点亮
   * ------------------------------------------------------------- */
  function finish() {
    showPage('result');
    var n = state.list.length, s = state.score;
    var lm = state.level || {};
    var perfect = (n > 0 && s === n);
    var already = isCleared(lm.id);

    $('#qzFinalScore').textContent = String(s);
    var starWrap = $('#qzStars'); starWrap.innerHTML = '';
    for (var i = 0; i < n; i++) {
      var sp = el('span', i < s ? 'on' : '');
      sp.textContent = '★';
      sp.style.animationDelay = (i * 0.06) + 's';
      starWrap.appendChild(sp);
    }

    var titleEl = $('#qzResultTitle');
    var comment = $('#qzComment');
    var newLit = perfect && !already;
    if (perfect) {
      setClear(lm.id);
      if (titleEl) titleEl.textContent = '关卡通关！';
      comment && (comment.textContent = newLit
        ? '恭喜！「' + (lm.name || '') + '」已在地图上点亮学习之星 ★'
        : '「' + (lm.name || '') + '」的学习之星早已点亮，继续保持！');
    } else {
      if (titleEl) titleEl.textContent = '还差一点点';
      var ratio = n ? s / n : 0;
      comment && (comment.textContent =
        ratio >= 0.6 ? '离点亮「' + (lm.name || '') + '」只差 ' + (n - s) + ' 题，再试一次！'
                     : '翻翻「' + (lm.name || '') + '」的介绍卡片，答案都藏在那里。');
    }
    $('#qzNewRecord').textContent = perfect ? ' · 满分！' : '';
    var medal = $('#qzMedal'); if (medal) medal.textContent = perfect ? '🏆' : '📖';
    var restart = $('#qzRestart'); if (restart) restart.textContent = '再挑战一次';
  }

  /* -------------------------------------------------------------
   *  启动绑定
   * ------------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', function () {
    var nextBtn = $('#qzNext');
    var restart = $('#qzRestart');
    var back = $('#qzBackHome');
    var quizBack = $('#quizBack');
    var backLevels = $('#qzBackLevels');
    var resetBtn = $('#qzResetProgress');

    if (nextBtn) nextBtn.addEventListener('click', next);
    if (restart) restart.addEventListener('click', function () {
      if (state.level) startLevel(state.level.id); else showPage('start');
    });
    if (backLevels) backLevels.addEventListener('click', function () {
      showPage('start');
      renderLevels();
    });
    if (back) back.addEventListener('click', function () {
      close();
      if (window.MapApp && window.MapApp.showHome) window.MapApp.showHome();
    });
    if (quizBack) quizBack.addEventListener('click', close);
    if (resetBtn) resetBtn.addEventListener('click', function () {
      if (window.confirm && !window.confirm('确定清除全部点亮进度吗？')) return;
      resetAll();
      renderLevels();
    });
  });

  /* -------------------------------------------------------------
   *  暴露
   * ------------------------------------------------------------- */
  window.Quiz = {
    open: open,
    close: close,
    start: start,
    startLevel: startLevel,
    isCleared: isCleared,
    clearedCount: clearedCount
  };
})();
