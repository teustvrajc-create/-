/**
 * Taza Route — Main application logic
 * Map (Leaflet), i18n (KK/RU), filters, detail slide-over, eco-points, CO₂ calculator
 */

(function () {
  'use strict';

  // --- i18n: UI strings + category labels ---
  const STRINGS = {
    kk: {
      brandTitle: 'Taza Route',
      brandSubtitle: 'Жасыл Алматы картасы',
      ecoScoreLabel: 'Эко-ұпай',
      filterTitle: 'Сүзгілер',
      filterHint: 'Картада көрсетілетін пункт түрлерін таңдаңыз',
      resetFilters: 'Барлық түрді көрсету',
      calcTitle: 'CO₂ үнем есептегіші',
      calcWeightLabel: 'Салмақ (кг)',
      calcMaterialLabel: 'Материал түрі',
      calcResultLabel: 'Шамамен үнемделген CO₂',
      detailSubtitle: 'Пункт мәліметі',
      addressLabel: 'Мекен-жай',
      hoursLabel: 'Жұмыс уақыты',
      materialsLabel: 'Қабылдайтын материалдар',
      btnRecycled: 'Мен осында қайта өңдедім',
      popupHint: 'Толығырақ → басыңыз',
      openMaps: '2GIS / Google Maps',
      cats: {
        plastic: 'Пластик',
        paper: 'Қағаз',
        glass: 'Шыны',
        electronics: 'Электроника',
        hazardous: 'Қауіпті қалдық',
      },
      calcOptions: [
        { value: 'mixed', label: 'Аралас қолданбалы' },
        { value: 'plastic', label: 'Пластик' },
        { value: 'paper', label: 'Қағаз' },
        { value: 'glass', label: 'Шыны' },
        { value: 'electronics', label: 'Электроника' },
        { value: 'metal', label: 'Металл' },
      ],
    },
    ru: {
      brandTitle: 'Taza Route',
      brandSubtitle: 'Карта вторсырья Алматы',
      ecoScoreLabel: 'Эко-очки',
      filterTitle: 'Фильтры',
      filterHint: 'Выберите типы пунктов на карте',
      resetFilters: 'Показать все типы',
      calcTitle: 'Калькулятор CO₂',
      calcWeightLabel: 'Масса (кг)',
      calcMaterialLabel: 'Тип материала',
      calcResultLabel: 'Примерная экономия CO₂',
      detailSubtitle: 'Информация о пункте',
      addressLabel: 'Адрес',
      hoursLabel: 'Часы работы',
      materialsLabel: 'Принимаемые материалы',
      btnRecycled: 'Я сдал здесь вторсырьё',
      popupHint: 'Подробнее → нажмите',
      openMaps: '2GIS / Google Maps',
      cats: {
        plastic: 'Пластик',
        paper: 'Бумага',
        glass: 'Стекло',
        electronics: 'Электроника',
        hazardous: 'Опасные отходы',
      },
      calcOptions: [
        { value: 'mixed', label: 'Смешанные отходы' },
        { value: 'plastic', label: 'Пластик' },
        { value: 'paper', label: 'Бумага' },
        { value: 'glass', label: 'Стекло' },
        { value: 'electronics', label: 'Электроника' },
        { value: 'metal', label: 'Металл' },
      ],
    },
  };

  /** kg CO₂ equivalent saved per kg waste recycled (simplified literature-based demo factors) */
  const CO2_FACTORS_KG_PER_KG = {
    plastic: 1.3,
    paper: 0.95,
    glass: 0.35,
    electronics: 2.2,
    hazardous: 0.5,
    metal: 1.1,
    mixed: 0.75,
  };

  const STORAGE_ECO = 'tazaRouteEcoPoints';
  const ALMATY_CENTER = [43.222, 76.8512];
  const MAP_ZOOM = 11;

  let currentLang = 'kk';
  let map = null;
  /** @type {Map<string, L.Marker>} */
  const markers = new Map();
  /** @type {Set<string>} active filter keys */
  let activeCategories = new Set(Object.keys(CATEGORY_META));
  let selectedPointId = null;

  // --- DOM ---
  const $ = (sel) => document.querySelector(sel);
  const ecoPointsEl = $('#eco-points');
  const filterContainer = $('#filter-chips');
  const ecoStatus = $('#eco-status');
  const filterPanel = $('#filter-panel');
  const calcPanel = $('#calc-panel');
  const fabFilter = $('#fab-filter');
  const fabCalc = $('#fab-calc');
  const fabLocate = $('#fab-locate');
  const toastEl = $('#toast');
  const toastText = $('#toast-text');
  const detailBackdrop = $('#detail-backdrop');
  const detailPanel = $('#detail-panel');
  const detailName = $('#detail-name');
  const detailAddress = $('#detail-address');
  const detailHours = $('#detail-hours');
  const detailMaterials = $('#detail-materials');
  const btnRecycled = $('#btn-recycled');
  const btnClose = $('#detail-close');
  const btnOpenMaps = $('#btn-open-maps');
  const wasteWeight = $('#waste-weight');
  const wasteMaterial = $('#waste-material');
  const co2Result = $('#co2-result');

  /** @type {L.Marker | null} */
  let youMarker = null;
  /** @type {number | null} */
  let toastTimer = null;

  function t(path) {
    const parts = path.split('.');
    let o = STRINGS[currentLang];
    for (const p of parts) {
      o = o && o[p];
    }
    return o != null ? String(o) : path;
  }

  function applyI18n() {
    document.documentElement.lang = currentLang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });

    // Language toggle UI
    const kkBtn = $('#lang-kk');
    const ruBtn = $('#lang-ru');
    if (kkBtn && ruBtn) {
      [kkBtn, ruBtn].forEach((b) => {
        b.classList.remove('bg-white/80', 'text-eco-forest', 'shadow-sm');
        b.classList.add('text-slate-600');
      });
      const active = currentLang === 'kk' ? kkBtn : ruBtn;
      active.classList.add('bg-white/80', 'text-eco-forest', 'shadow-sm');
      active.classList.remove('text-slate-600');
    }

    // Calculator select options
    wasteMaterial.innerHTML = '';
    STRINGS[currentLang].calcOptions.forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      wasteMaterial.appendChild(o);
    });

    updateCo2Display();
    renderFilterChips();
    // Refresh open detail if any
    if (selectedPointId) {
      const p = RECYCLING_POINTS.find((x) => x.id === selectedPointId);
      if (p) fillDetailPanel(p);
    }
    refreshPopups();

    // Keep “You are here” popup localized.
    if (youMarker) {
      youMarker.unbindPopup();
      youMarker.bindPopup(currentLang === 'kk' ? 'Сіз осындасыз' : 'Вы здесь');
    }
  }

  function isMobile() {
    return window.matchMedia('(max-width: 639px)').matches;
  }

  function setFilterOpen(nextOpen) {
    if (!filterPanel || !fabFilter) return;

    const open = Boolean(nextOpen);
    filterPanel.classList.toggle('is-open', open);
    filterPanel.classList.toggle('pointer-events-none', !open);
    filterPanel.classList.toggle('pointer-events-auto', open);

    fabFilter.setAttribute('aria-expanded', open ? 'true' : 'false');

    // If opening filters, minimize calculator so the map remains usable.
    if (open) setCalcOpen(false);

    // Re-layout the map after drawer animation starts.
    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 250);
  }

  function setCalcOpen(nextOpen) {
    if (!calcPanel || !fabCalc) return;

    const open = Boolean(nextOpen);
    calcPanel.classList.toggle('is-open', open);
    calcPanel.classList.toggle('pointer-events-none', !open);
    calcPanel.classList.toggle('pointer-events-auto', open);

    fabCalc.setAttribute('aria-expanded', open ? 'true' : 'false');

    if (open) setFilterOpen(false);

    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 250);
  }

  function renderFilterChips() {
    const cats = STRINGS[currentLang].cats;
    filterContainer.innerHTML = '';
    Object.keys(CATEGORY_META).forEach((key) => {
      const meta = CATEGORY_META[key];
      const on = activeCategories.has(key);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className =
        'filter-chip touch48 w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium border ' +
        (on
          ? 'bg-white/70 border-white/50 text-eco-forest shadow-sm'
          : 'bg-white/25 border-white/20 text-slate-500 line-through decoration-slate-400');
      chip.innerHTML =
        '<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style="background:' +
        meta.color +
        '22;border:2px solid ' +
        meta.color +
        '; box-shadow: 0 10px 25px rgba(0,0,0,0.08)">' +
        (meta.faIcon ? '<i class="' + meta.faIcon + ' text-sm" style="color:' + meta.color + ';"></i>' : meta.icon) +
        '</span>' +
        '<span class="flex-1">' +
        cats[key] +
        '</span>' +
        '<span class="shrink-0 text-xs text-slate-400">' +
        (on ? '✓' : '') +
        '</span>';
      chip.addEventListener('click', () => {
        if (activeCategories.has(key)) {
          if (activeCategories.size <= 1) return;
          activeCategories.delete(key);
        } else {
          activeCategories.add(key);
        }
        renderFilterChips();
        updateMarkerVisibility();
      });
      filterContainer.appendChild(chip);
    });
  }

  function pointMatchesFilters(point) {
    return point.categories.some((c) => activeCategories.has(c));
  }

  function updateMarkerVisibility() {
    markers.forEach((marker, id) => {
      const p = RECYCLING_POINTS.find((x) => x.id === id);
      if (!p) return;

      const match = pointMatchesFilters(p);
      const el = marker.getElement();
      if (el) {
        el.classList.toggle('is-dimmed', !match);
      }
      if (!match) marker.closePopup();
    });
  }

  function primaryCategory(categories) {
    const order = ['hazardous', 'electronics', 'glass', 'plastic', 'paper'];
    for (const k of order) {
      if (categories.includes(k)) return k;
    }
    return categories[0];
  }

  function createMarkerIcon(point) {
    const key = primaryCategory(point.categories);
    const meta = CATEGORY_META[key];
    const isFreedom = point && point.brand === 'freedom';

    // Convert #RRGGBB to "r,g,b" for rgba(var(--accent-rgb), ...).
    function hexToRgbList(hex) {
      const cleaned = String(hex || '').replace('#', '').trim();
      if (cleaned.length !== 6) return '34,197,94';
      const r = parseInt(cleaned.slice(0, 2), 16);
      const g = parseInt(cleaned.slice(2, 4), 16);
      const b = parseInt(cleaned.slice(4, 6), 16);
      return `${r},${g},${b}`;
    }

    const accentRgb = isFreedom ? '251,191,36' : hexToRgbList(meta.color); // #fbbf24
    const freedomBadge = isFreedom ? '<span class="freedom-badge">F</span>' : '';
    return L.divIcon({
      className: '',
      html:
        '<div class="tr-marker" style="--accent-rgb:' +
        accentRgb +
        '; border-color: rgba(var(--accent-rgb),0.95);">' +
        freedomBadge +
        '<i class="' +
        (meta.faIcon || 'fa-solid fa-leaf') +
        '" style="color:rgba(255,255,255,0.98); font-size:16px; filter: drop-shadow(0 8px 12px rgba(0,0,0,0.18));"></i>' +
        '</div>',
      iconSize: [46, 46],
      iconAnchor: [23, 46],
      popupAnchor: [0, -20],
    });
  }

  function getPointLabel(point) {
    return currentLang === 'kk' ? point.nameKk : point.nameRu;
  }

  function getPointAddress(point) {
    return currentLang === 'kk' ? point.addressKk : point.addressRu;
  }

  function getPointHours(point) {
    return currentLang === 'kk' ? point.hoursKk : point.hoursRu;
  }

  function getPointMaterials(point) {
    return currentLang === 'kk' ? point.materialsKk : point.materialsRu;
  }

  function bindPopup(marker, point) {
    const name = getPointLabel(point);
    const hint = t('popupHint');
    marker.bindPopup(
      '<div class="min-w-[160px]"><strong class="text-eco-forest">' +
        name +
        '</strong><p class="text-xs text-slate-500 mt-1">' +
        hint +
        '</p></div>'
    );
  }

  function refreshPopups() {
    markers.forEach((marker, id) => {
      const p = RECYCLING_POINTS.find((x) => x.id === id);
      if (p) {
        marker.unbindPopup();
        bindPopup(marker, p);
      }
    });
  }

  function initMap() {
    map = L.map('map', { zoomControl: true, attributionControl: true }).setView(ALMATY_CENTER, MAP_ZOOM);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    RECYCLING_POINTS.forEach((point) => {
      const marker = L.marker([point.lat, point.lng], {
        icon: createMarkerIcon(point),
      }).addTo(map);

      bindPopup(marker, point);
      marker.on('click', () => {
        if (!pointMatchesFilters(point)) return;
        openDetail(point);
      });

      markers.set(point.id, marker);
    });

    updateMarkerVisibility();
  }

  function openDetail(point) {
    selectedPointId = point.id;

    // Close drawers on mobile to reduce visual clutter.
    if (isMobile()) {
      setFilterOpen(false);
      setCalcOpen(false);
    }

    fillDetailPanel(point);

    // Smooth zoom-to marker on selection.
    if (map) {
      const targetZoom = Math.max(map.getZoom() + 1, MAP_ZOOM + 1);
      map.flyTo([point.lat, point.lng], targetZoom, { duration: 0.85, easeLinearity: 0.35 });
    }

    detailBackdrop.classList.remove('hidden');
    requestAnimationFrame(() => {
      detailBackdrop.classList.remove('opacity-0');
      detailBackdrop.classList.add('opacity-100');
    });
    detailPanel.classList.remove('pointer-events-none', 'invisible');
    detailPanel.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function fillDetailPanel(point) {
    detailName.textContent = getPointLabel(point);
    detailAddress.textContent = getPointAddress(point);
    detailHours.textContent = getPointHours(point);
    detailMaterials.innerHTML = '';

    if (btnOpenMaps && Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
      const destination = `${point.lat},${point.lng}`;
      btnOpenMaps.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
    }

    getPointMaterials(point).forEach((m) => {
      const li = document.createElement('li');
      li.className =
        'flex gap-2 text-sm text-eco-forest bg-white/45 rounded-xl px-3 py-2 border border-white/35';
      li.innerHTML =
        '<i class="fa-solid fa-recycle text-emerald-600 mt-0.5 shrink-0 text-xs"></i><span>' +
        m +
        '</span>';
      detailMaterials.appendChild(li);
    });
  }

  function closeDetail() {
    selectedPointId = null;
    detailBackdrop.classList.add('opacity-0');
    detailBackdrop.classList.remove('opacity-100');
    detailPanel.classList.remove('is-open');
    detailPanel.classList.add('pointer-events-none');
    setTimeout(() => {
      detailBackdrop.classList.add('hidden');
      detailPanel.classList.add('invisible');
      document.body.style.overflow = '';
    }, 350);
  }

  function loadEcoPoints() {
    const n = parseInt(localStorage.getItem(STORAGE_ECO) || '0', 10);
    return Number.isFinite(n) ? n : 0;
  }

  function saveEcoPoints(n) {
    localStorage.setItem(STORAGE_ECO, String(n));
    ecoPointsEl.textContent = String(n);

    // High-visibility feedback on score updates.
    if (ecoStatus) {
      ecoStatus.classList.remove('eco-bounce');
      // Force reflow so the animation restarts reliably.
      void ecoStatus.offsetWidth;
      ecoStatus.classList.add('eco-bounce');
    }
  }

  function triggerConfetti() {
    if (typeof confetti !== 'function') return;
    const canvas = document.getElementById('confetti-canvas');

    const hasCreate = typeof confetti.create === 'function';
    const myConfetti = hasCreate && canvas ? confetti.create(canvas, { resize: true }) : null;

    const fire = (payload) => {
      if (myConfetti) myConfetti(payload);
      else confetti(payload);
    };

    fire({
      particleCount: 140,
      spread: 75,
      origin: { y: 0.65 },
      colors: ['#22c55e', '#3dd598', '#7dd3fc', '#fbbf24', '#fff'],
    });
    setTimeout(() => {
      fire({
        particleCount: 55,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.6 },
        colors: ['#22c55e', '#86efac'],
      });
    }, 120);
    setTimeout(() => {
      fire({
        particleCount: 55,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.6 },
        colors: ['#2dd4bf', '#a7f3d0'],
      });
    }, 200);
  }

  function updateCo2Display() {
    const w = parseFloat(wasteWeight.value);
    const mat = wasteMaterial.value;
    const factor = CO2_FACTORS_KG_PER_KG[mat] ?? CO2_FACTORS_KG_PER_KG.mixed;
    if (!Number.isFinite(w) || w < 0) {
      co2Result.textContent = currentLang === 'kk' ? '0 кг CO₂' : '0 кг CO₂';
      return;
    }
    const kg = w * factor;
    co2Result.textContent = kg.toFixed(2) + ' кг CO₂';
  }

  function onRecycledClick() {
    const next = loadEcoPoints() + 10;
    saveEcoPoints(next);
    triggerConfetti();

    // Gamification: subtle "+10" float from the button.
    const float = document.createElement('span');
    float.className = 'eco-float';
    float.textContent = currentLang === 'kk' ? '+10 ұпай!' : '+10 очков!';
    btnRecycled.appendChild(float);
    setTimeout(() => float.remove(), 980);

    btnRecycled.disabled = true;
    setTimeout(() => {
      btnRecycled.disabled = false;
      applyI18n(); // restores original label + language
    }, 1800);
  }

  function showToast(message) {
    if (!toastEl || !toastText) return;
    toastText.textContent = message;
    toastEl.classList.remove('hidden');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.classList.add('hidden');
    }, 2600);
  }

  function ensureYouMarker(lat, lng) {
    if (!map) return;
    const icon = L.divIcon({
      className: '',
      html:
        '<div class="tr-marker user-marker" style="--accent-rgb:59,130,246; width:40px; height:40px; box-shadow: 0 14px 35px rgba(0,0,0,0.18), 0 0 0 7px rgba(59,130,246,0.12);">' +
        '<i class="fa-solid fa-person" style="color:rgba(255,255,255,0.98); font-size:16px;"></i>' +
        '</div>',
      iconSize: [40, 40],
      iconAnchor: [20, 40],
    });

    if (youMarker) {
      youMarker.setLatLng([lat, lng]);
      youMarker.setIcon(icon);
      return;
    }

    // Non-interactive to avoid competing with recycling marker taps.
    youMarker = L.marker([lat, lng], {
      icon,
      interactive: false,
      keyboard: false,
      zIndexOffset: 2000,
    }).addTo(map);
  }

  function locateMe() {
    if (!navigator.geolocation) {
      showToast(currentLang === 'kk' ? 'Геолокация қолжетімсіз' : 'Геолокация недоступна');
      return;
    }

    showToast(currentLang === 'kk' ? 'Орналасу анықталуда…' : 'Определяем местоположение…');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        ensureYouMarker(latitude, longitude);
        if (map) map.flyTo([latitude, longitude], Math.max(map.getZoom(), 14), { duration: 0.9 });
        showToast(currentLang === 'kk' ? 'Орналасуыңыз табылды' : 'Местоположение найдено');
      },
      (err) => {
        const msg =
          err && err.code === 1
            ? currentLang === 'kk'
              ? 'Орналасуға рұқсат берілмеді'
              : 'Доступ к геолокации запрещён'
            : currentLang === 'kk'
              ? 'Орналасуды анықтау мүмкін болмады'
              : 'Не удалось определить местоположение';
        showToast(msg);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }

  // --- Init ---
  function init() {
    saveEcoPoints(loadEcoPoints());

    // Collapsible panels (mobile-first)
    if (isMobile()) {
      if (filterPanel && calcPanel) {
        filterPanel.classList.remove('is-open');
        calcPanel.classList.remove('is-open');
      }
      if (filterPanel) filterPanel.classList.add('pointer-events-none');
      if (calcPanel) calcPanel.classList.add('pointer-events-none');
    } else {
      // Desktop: panels should be open and interactive by default.
      if (filterPanel) filterPanel.classList.add('is-open');
      if (calcPanel) calcPanel.classList.add('is-open');
      if (filterPanel) filterPanel.classList.remove('pointer-events-none');
      if (calcPanel) calcPanel.classList.remove('pointer-events-none');
    }

    fabFilter?.addEventListener('click', () => {
      const open = !(filterPanel && filterPanel.classList.contains('is-open'));
      setFilterOpen(open);
    });
    fabCalc?.addEventListener('click', () => {
      const open = !(calcPanel && calcPanel.classList.contains('is-open'));
      setCalcOpen(open);
    });
    fabLocate?.addEventListener('click', locateMe);

    $('#lang-kk').addEventListener('click', () => {
      currentLang = 'kk';
      applyI18n();
    });
    $('#lang-ru').addEventListener('click', () => {
      currentLang = 'ru';
      applyI18n();
    });

    $('#reset-filters').addEventListener('click', () => {
      activeCategories = new Set(Object.keys(CATEGORY_META));
      renderFilterChips();
      updateMarkerVisibility();
    });

    btnClose.addEventListener('click', closeDetail);
    detailBackdrop.addEventListener('click', closeDetail);
    btnRecycled.addEventListener('click', onRecycledClick);

    wasteWeight.addEventListener('input', updateCo2Display);
    wasteMaterial.addEventListener('change', updateCo2Display);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && selectedPointId) closeDetail();
    });

    applyI18n();
    initMap();

    // Repaint map after layout (mobile drawers)
    setTimeout(() => map.invalidateSize(), 400);
    window.addEventListener('resize', () => {
      if (map) map.invalidateSize();
    });

    // Mobile gesture handling:
    // If a touch starts outside the map container, temporarily disable map gestures
    // so scrolling/swiping on panels stays responsive.
    setupMobileTouchGestureHandling();
  }

  function setupMobileTouchGestureHandling() {
    if (!map) return;
    if (!isMobile()) return;

    let locked = false;

    function isWithinMap(target) {
      return Boolean(target && target.closest && target.closest('#map'));
    }

    document.addEventListener(
      'touchstart',
      (e) => {
        if (!map) return;
        const touchTarget = e.target;
        const inside = isWithinMap(touchTarget);
        if (inside) return;

        if (!locked) {
          locked = true;
          // Disable panning/zoom while user interacts with UI outside map.
          if (map.dragging) map.dragging.disable();
          if (map.touchZoom) map.touchZoom.disable();
        }
      },
      { passive: true }
    );

    const unlock = () => {
      if (!locked || !map) return;
      locked = false;
      if (map.dragging) map.dragging.enable();
      if (map.touchZoom) map.touchZoom.enable();
    };

    document.addEventListener('touchend', unlock, { passive: true });
    document.addEventListener('touchcancel', unlock, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
