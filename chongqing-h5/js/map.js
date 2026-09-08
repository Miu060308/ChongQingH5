/* =========================================================
 *  map.js —— 真实地图引擎（Leaflet + 高德瓦片）
 *  ─────────────────────────────────────────────────────────
 *  依赖：
 *    · window.APP_CONFIG（含 landmarks 真实经纬度 lat/lng）
 *    · window.L（Leaflet，由 index.html 头部异步加载）
 *    · window.MapApp.openLandmark（app.js 暴露的卡片打开方法）
 *
 *  暴露：window.RealMap = { map, markers, setLayer, focusOn, fitAll, highlight }
 * ========================================================= */
(function () {
  'use strict';

  var CFG = window.APP_CONFIG || {};

  /* 瓦片源（高德） */
  var SRC_VEC = 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}';
  var SRC_SAT = 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}';
  var SUBDOMAINS = ['1', '2', '3', '4'];

  /* Leaflet 的 marker 在移动端会拦截 touch 导致地标不能点
     —— 用 tap:true 让单次点击正常触发；这里再开 gestureHandling:true
     让浏览器在双指操作时显示提示条 */
  function start() {
    if (!window.L) {                  // Leaflet 还没加载好，稍等
      return setTimeout(start, 60);
    }
    var el = document.getElementById('realMap');
    if (!el) return;

    var mapCfg = CFG.map || {};
    var center = mapCfg.center || [29.5595, 106.587];
    var zoom   = mapCfg.zoom   || 14;
    var minZ   = mapCfg.minZoom || 11;
    var maxZ   = mapCfg.maxZoom || 18;

    /* 1. 创建地图实例 */
    var map = L.map(el, {
      center: center,
      zoom: zoom,
      minZoom: minZ,
      maxZoom: maxZ,
      zoomControl: false,             // 用我们自己画的控件
      attributionControl: true,
      tap: true,
      bounceAtZoomLimits: false,
      zoomSnap: 0.5,
      wheelDebounceTime: 20,
      wheelPxPerZoomLevel: 60
    });

    /* 2. 矢量 + 卫星瓦片 */
    var vecLayer = L.tileLayer(SRC_VEC, {
      subdomains: SUBDOMAINS, maxZoom: 18, minZoom: 3, attribution: '© 高德地图'
    }).addTo(map);
    var satLayer = L.tileLayer(SRC_SAT, {
      subdomains: SUBDOMAINS, maxZoom: 18, minZoom: 3, attribution: '© 高德卫星'
    });

    /* 3. 地标 marker：divIcon 自定义 HTML 标记 */
    var list = (CFG.landmarks || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var markers = [];
    var latlngs = [];
    list.forEach(function (lm, i) {
      if (typeof lm.lat !== 'number' || typeof lm.lng !== 'number') return;
      latlngs.push([lm.lat, lm.lng]);

      var pinName = lm.pin || lm.name || ('地标' + (i + 1));
      var small   = pinName.length > 5 ? ' rm-sm' : '';
      var html =
        '<div class="rm-pin" data-lm="' + lm.id + '">' +
          '<span class="rm-num">' + (i + 1) + '</span>' +
          '<span class="rm-arrow"></span>' +
          '<span class="rm-name">' + pinName + '</span>' +
        '</div>';
      /* iconSize / iconAnchor 必须和 CSS 中 .rm-pin 实际尺寸一致，
         且只由 Leaflet 控制定位，CSS 不再写 translate。 */
      var icon = L.divIcon({
        className: 'real-marker' + small,
        html: html,
        iconSize: [100, 80],
        iconAnchor: [50, 46]
      });

      var m = L.marker([lm.lat, lm.lng], { icon: icon, title: lm.name, riseOnHover: true }).addTo(map);
      m._landmark = lm;
      m.on('click', function () {
        if (window.MapApp && typeof window.MapApp.openLandmark === 'function') {
          window.MapApp.openLandmark(lm, m);
        }
      });
      markers.push(m);
    });

    /* 4. 初始 fitBounds：让 6 个 marker 全部可见、留点边距 */
    if (latlngs.length) {
      try {
        var b = L.latLngBounds(latlngs).pad(0.22);
        map.fitBounds(b, { animate: false });
      } catch (e) { /* 个别坐标异常时跳过 */ }
    }

    /* 5. 失效重算：地图容器尺寸变化（手机旋转、键盘弹出）时刷新 */
    setTimeout(function () { map.invalidateSize(); }, 200);
    if (window.ResizeObserver) {
      new ResizeObserver(function () { map.invalidateSize(); }).observe(el);
    }

    /* 6. 对外 API */
    var RealMap = {
      map: map,
      markers: markers,

      /* 切换瓦片：'vec' / 'sat' */
      setLayer: function (type) {
        if (type === 'sat') {
          if (map.hasLayer(vecLayer)) map.removeLayer(vecLayer);
          if (!map.hasLayer(satLayer)) satLayer.addTo(map);
        } else {
          if (map.hasLayer(satLayer)) map.removeLayer(satLayer);
          if (!map.hasLayer(vecLayer)) vecLayer.addTo(map);
        }
      },

      /* 飞到某个地标（飞行动画） */
      focusOn: function (lm) {
        if (!lm || typeof lm.lat !== 'number') return;
        var cur = map.getZoom();
        var target = Math.max(cur, 16);
        map.flyTo([lm.lat, lm.lng], Math.min(maxZ, target), { duration: 0.65 });
      },

      /* 缩放到能看见全部 6 个地标 */
      fitAll: function () {
        if (!latlngs.length) return;
        var b = L.latLngBounds(latlngs).pad(0.22);
        map.flyToBounds(b, { duration: 0.6 });
      },

      /* 高亮某个地标（用于卡片打开时的联动） */
      highlight: function (lm, on) {
        markers.forEach(function (m) {
          if (!m._landmark || m._landmark.id !== lm.id) return;
          var dom = m.getElement();
          if (!dom) return;
          var pin = dom.querySelector('.rm-pin');
          if (pin) pin.classList.toggle('is-active', !!on);
        });
      },

      /* 重新触发容器尺寸计算 */
      invalidate: function () { map.invalidateSize(); }
    };
    window.RealMap = RealMap;

    /* 7. 图层切换按钮 */
    var layerCtrl = document.getElementById('layerCtrl');
    if (layerCtrl) {
      layerCtrl.addEventListener('click', function (e) {
        var btn = e.target.closest('.layer-btn');
        if (!btn) return;
        var t = btn.getAttribute('data-layer');
        if (!t) return;
        layerCtrl.querySelectorAll('.layer-btn').forEach(function (b) {
          b.classList.toggle('is-on', b === btn);
        });
        RealMap.setLayer(t);
      });
    }

    /* 8. 隐藏 loading（地图瓦片已经有几片加载上来了） */
    setTimeout(function () {
      var ld = document.getElementById('loading');
      if (ld) {
        ld.classList.add('is-hide');
        setTimeout(function () { ld.style.display = 'none'; }, 520);
      }
    }, 480);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();