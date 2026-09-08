/* =========================================================
 *  quiz.js —— 地标知识问答互动小游戏
 *  依赖：window.APP_CONFIG（js/config.js）
 *  对外：window.Quiz.open() / window.Quiz.close()
 * ========================================================= */
(function () {
  'use strict';

  var CFG = window.APP_CONFIG;
  var $  = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var BEST_KEY = 'cq_landmark_quiz_best';

  var layer   = $('#quizLayer');
  var bar     = $('#quizBar');
  var scoreEl = $('#quizScore');
  var scoreBox= document.querySelector('.quiz-score');

  var state = {
    list: [],
    index: 0,
    score: 0,
    locked: false
  };

  /* 根据地标 id / name 找到配置对象（兼容旧浏览器，不用 Array.prototype.find） */
  function findLandmark(key) {
    if (!key) return null;
    var list = (CFG.landmarks || []);
    var i, l;
    for (i = 0; i < list.length; i++) {
      l = list[i];
      if (l.id === key || l.name === key || l.pin === key) return l;
    }
    for (i = 0; i < list.length; i++) {
      l = list[i];
      if ((l.name || '').indexOf(key) !== -1 || (l.pin || '').indexOf(key) !== -1) return l;
    }
    return null;
  }

  /* 切换问答背景为对应地标图片；无图时显示默认渐变 */
  function setQuizBg(lm) {
    var bg = $('#quizBg');
    if (!bg) return;
    var url = lm && (lm.thumb || (lm.images && lm.images[0]));
    if (url) {
      bg.style.backgroundImage = 'url(' + url + ')';
      bg.classList.add('has-img');
    } else {
      bg.style.backgroundImage = '';
      bg.classList.remove('has-img');
    }
  }

  /* ---------- 工具 ---------- */
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function getBest() {
    try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; }
    catch (e) { return 0; }
  }
  function setBest(v) {
    try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) {}
  }

  function showPage(name) {
    $$('.quiz-page').forEach(function (p) {
      p.classList.toggle('is-on', p.getAttribute('data-page') === name);
    });
  }

  /* 星星飞入动画（积分视觉奖励） */
  function flyStar(fromEl) {
    var s = document.createElement('span');
    s.className = 'fly-star';
    s.textContent = '★';
    var r = fromEl.getBoundingClientRect();
    var t = scoreBox.getBoundingClientRect();
    var x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
    var x1 = t.left + t.width / 2, y1 = t.top + t.height / 2;
    s.style.left = x0 + 'px'; s.style.top = y0 + 'px';
    document.body.appendChild(s);
    var start = Date.now(), dur = 620;
    (function step() {
      var p = Math.min(1, (Date.now() - start) / dur);
      var ease = 1 - Math.pow(1 - p, 2);
      var x = x0 + (x1 - x0) * ease;
      var y = y0 + (y1 - y0) * ease - Math.sin(ease * Math.PI) * 70;
      s.style.transform = 'translate(-50%,-50%) scale(' + (1.3 - p * 0.5) + ') rotate(' + (p * 320) + 'deg)';
      s.style.left = x + 'px'; s.style.top = y + 'px';
      s.style.opacity = String(1 - p * 0.35);
      if (p < 1) { requestAnimationFrame(step); }
      else { s.remove(); scoreBox.classList.remove('is-bump'); void scoreBox.offsetWidth; scoreBox.classList.add('is-bump'); }
    })();
  }

  /* ---------- 开始 / 重置 ---------- */
  function start() {
    var bank = (CFG.quiz && CFG.quiz.questions) || [];
    if (!bank.length) {
      /* 题库为空时给一份兜底，保证功能"有" */
      bank = [{
        from: '示例', q: '题库暂无内容，请在 js/config.js 的 quiz.questions 中添加题目。',
        options: ['知道了', '好的', '明白', '收到'], answer: 0,
        explain: '打开 js/config.js，找到 quiz.questions 数组，复制任意一段 {} 修改即可新增题目。'
      }];
    }
    var size = Math.min((CFG.quiz && CFG.quiz.roundSize) || 8, bank.length);
    var useShuffle = !CFG.quiz || CFG.quiz.shuffle !== false;
    var picked = (useShuffle ? shuffle(bank) : bank.slice()).slice(0, size);

    /* 打乱每题的选项顺序并重算正确答案下标，
       避免"正确答案总在 A"被玩家看出来（配置里仍按原顺序写即可） */
    if (useShuffle) {
      picked = picked.map(function (q) {
        var order = shuffle(q.options.map(function (_, i) { return i; }));
        return {
          from: q.from,
          q: q.q,
          options: order.map(function (i) { return q.options[i]; }),
          answer: order.indexOf(q.answer),
          explain: q.explain
        };
      });
    }

    state.list  = picked;
    state.index = 0;
    state.score = 0;
    state.locked = false;

    scoreEl.textContent = '0';
    bar.style.width = '0%';
    showPage('play');
    renderQuestion();
    /* 开始答题后再切到第一题对应地标背景 */
  }

  /* ---------- 渲染题目 ---------- */
  function renderQuestion() {
    var q = state.list[state.index];
    state.locked = false;

    $('#qzIndex').textContent = '第 ' + (state.index + 1) + ' / ' + state.list.length + ' 题';
    $('#qzFrom').textContent  = q.from || '文化地标';
    $('#qzQuestion').textContent = q.q;

    /* 背景跟随题目地标（无图则回退默认渐变） */
    setQuizBg(findLandmark(q.from));

    bar.style.width = (state.index / state.list.length * 100) + '%';

    var box = $('#qzOptions');
    box.innerHTML = '';
    var keys = ['A', 'B', 'C', 'D', 'E', 'F'];
    q.options.forEach(function (opt, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'qz-opt';
      b.innerHTML = '<span class="qz-key">' + (keys[i] || i + 1) + '</span><span>' + opt + '</span>';
      b.addEventListener('click', function () { choose(b, i, q); });
      box.appendChild(b);
    });

    var ex = $('#qzExplain');
    ex.classList.remove('is-on');
    $('#qzNext').textContent = (state.index === state.list.length - 1) ? '查看结果' : '下一题';
  }

  /* ---------- 判题 ---------- */
  function choose(btn, pick, q) {
    if (state.locked) return;
    state.locked = true;

    var opts = $$('.qz-opt');
    var right = q.answer;
    var ok = (pick === right);

    opts.forEach(function (o, i) {
      o.classList.add('is-dim');
      if (i === right) { o.classList.remove('is-dim'); o.classList.add('is-right'); }
      else if (i === pick) { o.classList.remove('is-dim'); o.classList.add('is-wrong'); }
    });

    var badge = $('#qxBadge');
    badge.className = 'qx-badge ' + (ok ? 'right' : 'wrong');
    badge.textContent = ok ? '答对了 +1★' : '答错了';
    $('#qxText').innerHTML = (ok ? '<b>解析：</b>' : '<b>正确答案：' + (['A','B','C','D'][right] || '') + '　</b>') + (q.explain || '');

    if (ok) {
      state.score += 1;
      scoreEl.textContent = String(state.score);
      flyStar(btn);
    }

    $('#qzExplain').classList.add('is-on');
  }

  /* ---------- 下一题 ---------- */
  function next() {
    if (state.index < state.list.length - 1) {
      state.index += 1;
      renderQuestion();
    } else {
      finish();
    }
  }

  /* ---------- 结果页 ---------- */
  function finish() {
    bar.style.width = '100%';
    var total = state.list.length;
    var got = state.score;
    var rate = got / total;

    var medal, title, comment;
    if (rate === 1)        { medal = '🏆'; title = '全对！山城文化通'; comment = '六大地标的故事你都记住了，去给朋友讲讲吧。'; }
    else if (rate >= 0.75) { medal = '🥇'; title = '表现优秀';         comment = '已经掌握大部分地标知识，再刷一轮就能满分。'; }
    else if (rate >= 0.5)  { medal = '🥈'; title = '还不错哦';         comment = '基础扎实，错过的题看看解析就能记住。'; }
    else                   { medal = '🌱'; title = '初探山城';         comment = '别急，回到地图把六个地标卡片都看一遍，再来挑战！'; }

    $('#qzMedal').textContent = medal;
    $('#qzResultTitle').textContent = title;
    $('#qzComment').textContent = comment;
    $('#qzFinalScore').textContent = String(got);

    var stars = $('#qzStars');
    stars.innerHTML = '';
    for (var i = 0; i < total; i++) {
      var s = document.createElement('span');
      s.textContent = i < got ? '★' : '☆';
      if (i < got) s.className = 'on';
      s.style.animationDelay = (i * 0.07) + 's';
      stars.appendChild(s);
    }

    var best = getBest();
    var rec = $('#qzNewRecord');
    if (got > best) { setBest(got); rec.innerHTML = '<span class="new">新纪录！</span>'; }
    else { rec.innerHTML = '（最佳 ' + best + ' 星）'; }

    showPage('result');
  }

  /* ---------- 对外 open / close ---------- */
  function open() {
    layer.classList.add('is-open');
    showPage('start');
    $('#qzTitle').textContent = (CFG.meta && CFG.meta.title ? CFG.meta.title : '重庆六大文化地标') + '知识大挑战';
    $('#qzBest').textContent = String(getBest());
    /* 开始页默认背景：取第一个地标（有图则上图，无图则渐变） */
    setQuizBg((CFG.landmarks && CFG.landmarks[0]) || null);
    /* 让上层页面暂停视频 */
    if (window.MapApp && window.MapApp.pauseAllMedia) window.MapApp.pauseAllMedia();
  }

  function close() {
    layer.classList.remove('is-open');
    showPage('start');
  }

  /* ---------- 事件绑定 ---------- */
  $('#quizBack').addEventListener('click', close);
  $('#qzBackHome').addEventListener('click', close);
  $('#qzStart').addEventListener('click', start);
  $('#qzRestart').addEventListener('click', start);
  $('#qzNext').addEventListener('click', next);

  window.Quiz = { open: open, close: close, start: start };
})();
