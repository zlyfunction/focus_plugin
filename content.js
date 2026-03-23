/**
 * Focus Reader - Content Script
 * 画笔效果：lerp 平滑跟随光标，高亮附近文字 & 图片
 */
(function () {
  if (window.__focusReaderInjected) return;
  window.__focusReaderInjected = true;

  // ── 状态 ──────────────────────────────────────────────
  let enabled = false;
  let settings = {
    mode: 'both',
    color: 'yellow',
    opacity: 'medium',
  };

  const COLORS = {
    yellow: { h: 48,  s: '100%', l: '58%' },
    green:  { h: 118, s: '55%',  l: '48%' },
    blue:   { h: 208, s: '90%',  l: '58%' },
    pink:   { h: 328, s: '80%',  l: '62%' },
  };

  // 提高透明度，确保效果清晰可见
  const OPACITIES = {
    light:  { guide: 0.22, text: 0.32 },
    medium: { guide: 0.40, text: 0.55 },
    strong: { guide: 0.60, text: 0.72 },
  };

  // ── CSS Custom Highlight API ───────────────────────────
  const HIGHLIGHT_NAME = 'focus-reader-line';
  const hasCSSHighlight = typeof CSS !== 'undefined' &&
                          typeof CSS.highlights !== 'undefined' &&
                          typeof Highlight !== 'undefined';
  let textHighlight = null;

  if (hasCSSHighlight) {
    try {
      textHighlight = new Highlight();
      CSS.highlights.set(HIGHLIGHT_NAME, textHighlight);
    } catch (e) {}
  }

  // ── 导引椭圆 ──────────────────────────────────────────
  let guideEl = null;

  function createGuide() {
    if (guideEl) return;
    guideEl = document.createElement('div');
    guideEl.setAttribute('data-focus-reader', '');
    applyGuideStyle();
    document.documentElement.appendChild(guideEl);
    // 初始化 lerp 状态到屏幕外
    guideCurX = -500; guideCurY = -500;
  }

  function applyGuideStyle() {
    if (!guideEl) return;
    const { h, s, l } = COLORS[settings.color] || COLORS.yellow;
    const { guide: alpha } = OPACITIES[settings.opacity] || OPACITIES.medium;
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // 深色模式用更亮的颜色
    const centerL = isDark ? '75%' : l;
    const ca = Math.min(0.95, alpha);
    const ma = Math.min(0.95, alpha * 0.55);

    // 不用 mix-blend-mode，直接半透明叠加，避免因页面背景导致几乎不可见
    guideEl.style.cssText = `
      position: fixed !important;
      left: 0 !important;
      top: 0 !important;
      width: 140px !important;
      height: 28px !important;
      pointer-events: none !important;
      z-index: 2147483646 !important;
      background: radial-gradient(ellipse at center,
        hsla(${h}, ${s}, ${centerL}, ${ca}) 0%,
        hsla(${h}, ${s}, ${centerL}, ${ma}) 45%,
        hsla(${h}, ${s}, ${centerL}, 0) 100%) !important;
      border-radius: 50% !important;
      will-change: transform, opacity !important;
      opacity: 0 !important;
    `;
    // 重置 lerp 当前尺寸
    guideCurW = 140; guideCurH = 28;
  }

  function removeGuide() {
    if (guideEl) { guideEl.remove(); guideEl = null; }
    stopGuideLerp();
  }

  // ── Lerp 平滑动画 ─────────────────────────────────────
  let guideTargetX = 0, guideTargetY = 0;
  let guideTargetW = 140, guideTargetH = 28;
  let guideTargetOp = 0;
  let guideCurX = -500, guideCurY = -500;
  let guideCurW = 140, guideCurH = 28;
  let guideCurOp = 0;
  let guideLerpId = null;

  const LP = 0.14;   // 位置 lerp 系数（越小越滞后、越丝滑）
  const LS = 0.12;   // 尺寸 lerp 系数
  const LO = 0.20;   // 透明度 lerp 系数

  function startGuideLerp() {
    if (!guideLerpId) guideLerpId = requestAnimationFrame(lerpStep);
  }

  function stopGuideLerp() {
    if (guideLerpId) { cancelAnimationFrame(guideLerpId); guideLerpId = null; }
  }

  function lerpStep() {
    guideLerpId = null;
    if (!guideEl) return;

    guideCurX  += (guideTargetX  - guideCurX)  * LP;
    guideCurY  += (guideTargetY  - guideCurY)  * LP;
    guideCurW  += (guideTargetW  - guideCurW)  * LS;
    guideCurH  += (guideTargetH  - guideCurH)  * LS;
    guideCurOp += (guideTargetOp - guideCurOp) * LO;

    const tx = guideCurX - guideCurW / 2;
    const ty = guideCurY - guideCurH / 2;
    guideEl.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`;
    guideEl.style.width   = guideCurW.toFixed(1) + 'px';
    guideEl.style.height  = guideCurH.toFixed(1) + 'px';
    guideEl.style.opacity = Math.max(0, guideCurOp).toFixed(4);

    const still =
      Math.abs(guideTargetX  - guideCurX)  < 0.4 &&
      Math.abs(guideTargetY  - guideCurY)  < 0.4 &&
      Math.abs(guideTargetW  - guideCurW)  < 0.4 &&
      Math.abs(guideTargetH  - guideCurH)  < 0.4 &&
      Math.abs(guideTargetOp - guideCurOp) < 0.004;

    if (!still) guideLerpId = requestAnimationFrame(lerpStep);
  }

  // ── highlight 颜色 ─────────────────────────────────────
  function updateHighlightColor() {
    const { h, s, l } = COLORS[settings.color] || COLORS.yellow;
    const { text: alpha } = OPACITIES[settings.opacity] || OPACITIES.medium;
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const cl = isDark ? '72%' : l;

    let styleEl = document.getElementById('__focus-reader-style__');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = '__focus-reader-style__';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      ::highlight(${HIGHLIGHT_NAME}) {
        background-color: hsla(${h}, ${s}, ${cl}, ${alpha});
        color: inherit;
      }
    `;
  }

  // ── 画笔范围：光标前后 N 个字符（adaptive engine 可写）──
  let brushRadius = 7;

  function getPaintbrushRange(x, y) {
    if (!textHighlight) return null;
    const cr = document.caretRangeFromPoint(x, y);
    if (!cr) return null;
    const node = cr.startContainer;
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;
    const len = node.textContent.length;
    if (!len) return null;
    const pos   = cr.startOffset;
    const start = Math.max(0, pos - brushRadius);
    const end   = Math.min(len, pos + brushRadius + 1);
    if (start >= end) return null;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    return range;
  }

  // ── 行高检测 ──────────────────────────────────────────
  function getLineHeightAt(x, y) {
    const cr = document.caretRangeFromPoint(x, y);
    if (cr) {
      const node = cr.startContainer;
      if (node && node.nodeType === Node.TEXT_NODE) {
        const pos = Math.min(cr.startOffset, node.textContent.length - 1);
        if (pos >= 0) {
          const r = document.createRange();
          r.setStart(node, pos);
          r.setEnd(node, pos + 1);
          const rect = r.getBoundingClientRect();
          if (rect.height > 0) return rect.height;
        }
      }
    }
    const el = document.elementFromPoint(x, y);
    if (el) {
      const lh = parseFloat(window.getComputedStyle(el).lineHeight);
      if (lh > 0) return lh;
    }
    return 20;
  }

  // ── 图片高亮 ──────────────────────────────────────────
  let highlightedImg = null;

  function applyImageHighlight(img) {
    if (highlightedImg === img) return;
    clearImageHighlight();
    highlightedImg = img;
    const { h, s, l } = COLORS[settings.color] || COLORS.yellow;
    const { guide: alpha } = OPACITIES[settings.opacity] || OPACITIES.medium;
    const glow = Math.min(0.9, alpha * 3.5);
    img.dataset.focusReaderOrig = img.style.cssText;
    img.style.transition = 'filter 0.25s ease';
    img.style.filter = [
      'brightness(1.06)',
      `drop-shadow(0 0  8px hsla(${h}, ${s}, ${l}, ${glow}))`,
      `drop-shadow(0 0 20px hsla(${h}, ${s}, ${l}, ${(glow * 0.5).toFixed(2)}))`,
    ].join(' ');
  }

  function clearImageHighlight() {
    if (!highlightedImg) return;
    // 恢复原始样式
    const orig = highlightedImg.dataset.focusReaderOrig || '';
    highlightedImg.style.cssText = orig;
    delete highlightedImg.dataset.focusReaderOrig;
    highlightedImg = null;
  }

  // ── RAF 更新（计算状态，不直接写 DOM 位置）────────────
  let rafId = null;
  let pendingX = 0, pendingY = 0;

  function isTextPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    if (['input', 'textarea', 'select', 'button', 'a', 'img'].includes(tag)) return false;
    const role = el.getAttribute('role');
    if (role === 'button' || role === 'link') return false;
    const cr = document.caretRangeFromPoint(x, y);
    return cr &&
           cr.startContainer &&
           cr.startContainer.nodeType === Node.TEXT_NODE &&
           cr.startContainer.textContent.trim().length > 0;
  }

  function update() {
    rafId = null;
    if (!enabled) return;

    const x = pendingX;
    const y = pendingY;

    const el    = document.elementFromPoint(x, y);
    const isImg = el && el.tagName.toLowerCase() === 'img';
    const overText = !isImg && isTextPoint(x, y);

    const showGuide = settings.mode === 'guide' || settings.mode === 'both';
    const showText  = (settings.mode === 'text' || settings.mode === 'both') &&
                      hasCSSHighlight && textHighlight;

    // 图片高亮
    if (isImg) applyImageHighlight(el);
    else       clearImageHighlight();

    // 更新 lerp 目标（radius scaled by adaptive engine）
    if (guideEl && showGuide) {
      if (overText) {
        const lineH = getLineHeightAt(x, y);
        const rm    = adaptiveEngine.radiusMultiplier;
        guideTargetW  = Math.max(lineH * 5.5, 90) * rm;
        guideTargetH  = Math.max(lineH * 1.5, 20) * rm;
        guideTargetX  = x;
        guideTargetY  = y;
        guideTargetOp = 1;
        // Dwell pulse: one-shot nudge when cursor stationary >2.5s
        if (adaptiveEngine.shouldPulse()) triggerDwellPulse();
      } else {
        guideTargetOp = 0;
      }
      startGuideLerp();
    }

    // 文字画笔高亮
    if (showText) {
      textHighlight.clear();
      if (overText) {
        const range = getPaintbrushRange(x, y);
        if (range) textHighlight.add(range);
      }
    }
  }

  function scheduleUpdate(x, y) {
    pendingX = x; pendingY = y;
    if (!rafId) rafId = requestAnimationFrame(update);
  }

  // ── 事件监听 ─────────────────────────────────────────
  function onMouseMove(e) {
    if (!enabled) return;
    adaptiveEngine.track(e.clientX, e.clientY);
    scheduleUpdate(e.clientX, e.clientY);
  }

  function onMouseLeave() {
    guideTargetOp = 0;
    startGuideLerp();
    if (textHighlight) textHighlight.clear();
    clearImageHighlight();
  }

  // ── AdaptiveEngine ────────────────────────────────────
  //
  // Signal flow (per domain, stored in chrome.storage.local):
  //
  //   mousemove → track(x,y)
  //        │
  //        └── every 5s: _tick()
  //                ├── velocity = displacement / 5s  (px/s)
  //                ├── push sample → prune >3 days
  //                ├── activeMs += 5000 (if moved >10px)
  //                └── _adapt() — after 10min calibration
  //                        ├── avg velocity >300 → radius 0.8×
  //                        ├── avg velocity 100–300 → radius 1.0×
  //                        └── avg velocity <100  → radius 1.4×
  //
  class AdaptiveEngine {
    constructor() {
      this.radiusMultiplier = 1.0;
      this._profiles  = {};
      this._domain    = '';
      // Mouse state for velocity computation
      this._mouseX    = 0;
      this._mouseY    = 0;
      this._tickX     = 0;
      this._tickY     = 0;
      // Dwell detection
      this._dwellY     = 0;
      this._dwellSince = 0;
      this._pulseFired = false;
      // Timers
      this._sampleId  = null;
      this._flushId   = null;
      this._onHide    = () => { if (document.visibilityState === 'hidden') this._flush(); };
    }

    start() {
      // Idempotency guard — prevent double-interval on rapid toggle
      if (this._sampleId) clearInterval(this._sampleId);
      if (this._flushId)  clearInterval(this._flushId);
      this._domain = new URL(location.href).hostname;
      this._tickX  = this._mouseX;
      this._tickY  = this._mouseY;
      this._loadProfiles();
      this._sampleId = setInterval(() => this._tick(),  5000);
      this._flushId  = setInterval(() => this._flush(), 30000);
      document.addEventListener('visibilitychange', this._onHide);
    }

    stop() {
      clearInterval(this._sampleId);
      clearInterval(this._flushId);
      this._sampleId = null;
      this._flushId  = null;
      document.removeEventListener('visibilitychange', this._onHide);
      this._flush();
    }

    // Call from onMouseMove
    track(x, y) {
      this._mouseX = x;
      this._mouseY = y;
      // Dwell: reset timer when cursor moves vertically more than 8px
      if (Math.abs(y - this._dwellY) > 8) {
        this._dwellY     = y;
        this._dwellSince = Date.now();
        this._pulseFired = false;
      }
    }

    // Returns true once per dwell (cursor stationary >2.5s). One-shot per dwell event.
    shouldPulse() {
      if (this._pulseFired) return false;
      if (Date.now() - this._dwellSince > 2500) {
        this._pulseFired = true;
        return true;
      }
      return false;
    }

    // 'calibrated' | 'learning:N' (N = 0–99)
    get calibrationStatus() {
      const p = this._getProfile();
      if (p.calibrated) return 'calibrated';
      const pct = Math.min(99, Math.round(p.activeMs / (10 * 60 * 1000) * 100));
      return 'learning:' + pct;
    }

    _tick() {
      const now = Date.now();
      // Velocity = displacement since last tick / 5 seconds (px/s)
      const dx   = this._mouseX - this._tickX;
      const dy   = this._mouseY - this._tickY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const velocity = dist / 5; // px/s
      this._tickX = this._mouseX;
      this._tickY = this._mouseY;

      const p = this._getProfile();
      if (dist > 10) { // ignore micro-jitter when mouse is parked
        p.samples.push({ ts: now, v: Math.round(velocity) });
        p.activeMs += 5000;
      }

      // Prune samples older than 3 days
      const cutoff = now - 3 * 24 * 60 * 60 * 1000;
      p.samples = p.samples.filter(s => s.ts > cutoff);

      // Calibration: 10 minutes of active reading
      if (!p.calibrated && p.activeMs >= 10 * 60 * 1000) p.calibrated = true;

      this._adapt(p);
      // Sync DOM bridge so page.evaluate() can read status in tests
      document.documentElement.dataset.focusReaderCalibration = this.calibrationStatus;
    }

    _adapt(p) {
      if (!p.calibrated) return;
      const now    = Date.now();
      const recent = p.samples.filter(s => s.ts > now - 60000);
      if (!recent.length) return;
      const avg = recent.reduce((sum, s) => sum + s.v, 0) / recent.length;

      if (avg > 300)       this.radiusMultiplier = 0.8; // flow: scanning fast
      else if (avg >= 100) this.radiusMultiplier = 1.0; // normal reading
      else                 this.radiusMultiplier = 1.4; // slow / struggling

      brushRadius = Math.round(7 * this.radiusMultiplier);
    }

    _getProfile() {
      if (!this._profiles[this._domain]) {
        this._profiles[this._domain] = { samples: [], calibrated: false, activeMs: 0 };
      }
      return this._profiles[this._domain];
    }

    _loadProfiles() {
      chrome.storage.local.get(['focusReaderProfiles']).then(r => {
        if (r.focusReaderProfiles) this._profiles = r.focusReaderProfiles;
      }).catch(() => {});
    }

    _flush() {
      chrome.storage.local.set({ focusReaderProfiles: this._profiles }).catch(() => {});
    }
  }

  const adaptiveEngine = new AdaptiveEngine();

  // Dwell pulse: brief brightness flash nudges the eye to keep moving
  function triggerDwellPulse() {
    if (!guideEl) return;
    guideEl.style.transition = 'filter 0.1s ease-in';
    guideEl.style.filter = 'brightness(2.2)';
    setTimeout(() => {
      if (!guideEl) return;
      guideEl.style.transition = 'filter 0.25s ease-out';
      guideEl.style.filter = '';
      setTimeout(() => { if (guideEl) guideEl.style.transition = ''; }, 250);
    }, 100);
  }

  // ── 启用 / 禁用 ──────────────────────────────────────
  function syncStatusToDOM() {
    document.documentElement.dataset.focusReaderEnabled     = String(enabled);
    document.documentElement.dataset.focusReaderCalibration = adaptiveEngine.calibrationStatus;
  }

  function enable() {
    enabled = true;
    updateHighlightColor();
    createGuide();
    applyGuideStyle();
    document.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('mouseleave', onMouseLeave);
    adaptiveEngine.start();
    syncStatusToDOM();
  }

  function disable() {
    enabled = false;
    removeGuide();
    if (textHighlight) textHighlight.clear();
    clearImageHighlight();
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseleave', onMouseLeave);
    adaptiveEngine.stop();
    syncStatusToDOM();
  }

  function applySettings(newSettings) {
    settings = { ...settings, ...newSettings };
    if (enabled) {
      updateHighlightColor();
      applyGuideStyle();
    }
  }

  // ── 消息通信 ─────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.action) {
      case 'enable':        enable();                             sendResponse({ ok: true }); break;
      case 'disable':       disable();                            sendResponse({ ok: true }); break;
      case 'applySettings': applySettings(message.settings);     sendResponse({ ok: true }); break;
      case 'getState':      sendResponse({ enabled, settings, hasCSSHighlight, calibrationStatus: adaptiveEngine.calibrationStatus }); break;
    }
    return true;
  });

  // ── 初始化 ───────────────────────────────────────────
  chrome.storage.local.get(['focusReaderEnabled', 'focusReaderSettings'])
    .then((result) => {
      if (result.focusReaderSettings) settings = { ...settings, ...result.focusReaderSettings };
      if (result.focusReaderEnabled !== false) enable();
    })
    .catch(() => enable());

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (enabled) { updateHighlightColor(); applyGuideStyle(); }
  });

  // Testing bridge: content scripts run in an isolated world; page.evaluate() runs in
  // the main world. window properties set here are invisible to page.evaluate().
  // DOM attributes ARE shared between worlds, so we write status there instead.
})();
