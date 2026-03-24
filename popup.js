/**
 * Focus Reader - Popup Script
 */

const mainToggle = document.getElementById('mainToggle');
const settingsPanel = document.getElementById('settingsPanel');
const compatNote = document.getElementById('compatNote');

let currentState = {
  enabled: true,
  settings: { mode: 'guide', color: 'yellow', opacity: 'medium' },
  hasCSSHighlight: false,
  adaptiveMode: true,
  columnMode: false,
};

// ── 从当前 Tab 读取状态 ───────────────────────────────
async function loadState() {
  // Load API key and profiles from storage (independent of tab)
  const stored = await chrome.storage.local.get(['focusReaderApiKey', 'focusReaderApiEndpoint', 'focusReaderApiModel', 'focusReaderProfiles', 'focusReaderAdaptive', 'focusReaderColumnMode']);
  if (stored.focusReaderApiKey) {
    document.getElementById('apiKeyInput').value = stored.focusReaderApiKey;
  }
  if (stored.focusReaderApiEndpoint) {
    document.getElementById('apiEndpointInput').value = stored.focusReaderApiEndpoint;
  }
  if (stored.focusReaderApiModel) {
    document.getElementById('apiModelInput').value = stored.focusReaderApiModel;
  }
  if (stored.focusReaderAdaptive === false) currentState.adaptiveMode = false;
  if (stored.focusReaderColumnMode === true) currentState.columnMode = true;
  currentState.profiles = stored.focusReaderProfiles || {};

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) { renderUI(); return; }

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getState' });
    if (response) {
      currentState = { ...currentState, ...response };
    }
  } catch (e) {
    // content script 未注入（如 about: 页面）
  }
  renderUI();
}

// ── 向当前 Tab 发消息 ─────────────────────────────────
async function sendToTab(message) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    await chrome.tabs.sendMessage(tab.id, message);
  } catch (e) {
    // 忽略
  }
}

// ── 更新设置并同步 ────────────────────────────────────
async function updateSettings(patch) {
  currentState.settings = { ...currentState.settings, ...patch };

  // 存储到本地
  await chrome.storage.local.set({ focusReaderSettings: currentState.settings });

  // 发送给 content script
  await sendToTab({ action: 'applySettings', settings: currentState.settings });

  renderUI();
}

// ── 域名档案渲染 ──────────────────────────────────────
function speedLabel(avgVelocity) {
  if (avgVelocity > 300) return '扫读';
  if (avgVelocity >= 100) return '正常';
  return '精读';
}

function renderProfiles() {
  const profiles = currentState.profiles || {};
  const domains = Object.keys(profiles).filter(d => profiles[d].calibrated);
  const section = document.getElementById('profilesSection');
  const card = document.getElementById('profilesCard');
  if (!section || !card) return;

  if (domains.length === 0 || !currentState.adaptiveMode) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  card.innerHTML = '';

  domains.forEach((domain, i) => {
    const p = profiles[domain];
    const recent = p.samples.filter(s => s.ts > Date.now() - 7 * 24 * 60 * 60 * 1000);
    const avg = recent.length
      ? Math.round(recent.reduce((sum, s) => sum + s.v, 0) / recent.length)
      : 0;

    const row = document.createElement('div');
    row.className = 'card-row';
    if (i > 0) row.style.borderTop = '0.5px solid #e5e5ea';

    const label = document.createElement('span');
    label.className = 'row-label';
    label.style.cssText = 'max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;';
    label.textContent = domain;
    label.title = domain;

    const right = document.createElement('div');
    right.style.cssText = 'display:flex;align-items:center;gap:8px;';

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = speedLabel(avg);

    const resetBtn = document.createElement('button');
    resetBtn.textContent = '重置';
    resetBtn.style.cssText = 'font-size:11px;color:#ff3b30;background:none;border:none;cursor:pointer;padding:0;font-family:inherit;';
    resetBtn.addEventListener('click', async () => {
      delete profiles[domain];
      currentState.profiles = profiles;
      await chrome.storage.local.set({ focusReaderProfiles: profiles });
      // F011: notify content script to clear the in-memory profile too
      await sendToTab({ action: 'resetProfile', domain });
      renderProfiles();
    });

    right.appendChild(badge);
    right.appendChild(resetBtn);
    row.appendChild(label);
    row.appendChild(right);
    card.appendChild(row);
  });
}

// ── 渲染 UI ───────────────────────────────────────────
function renderUI() {
  const { enabled, settings, hasCSSHighlight } = currentState;

  // 主开关
  mainToggle.classList.toggle('on', enabled);

  // 设置面板可见性
  settingsPanel.style.opacity = enabled ? '1' : '0.4';
  settingsPanel.style.pointerEvents = enabled ? '' : 'none';

  // 模式按钮
  document.querySelectorAll('[data-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === settings.mode);
  });

  // 阅读列模式开关
  const columnToggleEl = document.getElementById('columnToggle');
  if (columnToggleEl) columnToggleEl.classList.toggle('on', currentState.columnMode);

  // 颜色点
  document.querySelectorAll('[data-color]').forEach(dot => {
    dot.classList.toggle('active', dot.dataset.color === settings.color);
  });

  // 强度按钮
  document.querySelectorAll('[data-opacity]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.opacity === settings.opacity);
  });

  // 域名档案
  renderProfiles();

  // 兼容性提示
  if (!hasCSSHighlight && settings.mode === 'text') {
    compatNote.textContent = '文字高亮需 Safari 17.2+，当前使用导引条模式';
  } else {
    compatNote.textContent = '';
  }

  // Adaptive section: hidden when extension is disabled
  const adaptiveSection = document.getElementById('adaptiveSection');
  if (adaptiveSection) adaptiveSection.style.display = enabled ? '' : 'none';

  // Adaptive toggle
  const adaptiveToggleEl = document.getElementById('adaptiveToggle');
  if (adaptiveToggleEl) adaptiveToggleEl.classList.toggle('on', currentState.adaptiveMode);

  // Adaptive status row: hidden when adaptiveMode is off
  const adaptiveStatusRow = document.getElementById('adaptiveStatusRow');
  if (adaptiveStatusRow) adaptiveStatusRow.style.display = currentState.adaptiveMode ? '' : 'none';

  // Adaptive status badge
  const adaptiveStatusEl = document.getElementById('adaptiveStatus');
  const adaptiveHintEl   = document.getElementById('adaptiveHint');
  if (adaptiveStatusEl) {
    const s = currentState.calibrationStatus;
    if (s === 'calibrated') {
      adaptiveStatusEl.textContent = '已校准 ✓';
      adaptiveStatusEl.className   = 'badge badge-calibrated';
      adaptiveStatusEl.title       = '导引圈大小已根据您的阅读速度自动调整';
      if (adaptiveHintEl) adaptiveHintEl.textContent = '正在根据阅读速度自动调整';
    } else if (s && s.startsWith('learning:')) {
      const pct = s.split(':')[1];
      adaptiveStatusEl.textContent = `学习中 ${pct}%`;
      adaptiveStatusEl.className   = 'badge badge-learning';
      adaptiveStatusEl.title       = '正在观察您的阅读节奏，约 10 分钟后完成校准';
      if (adaptiveHintEl) adaptiveHintEl.textContent = '正在观察您的阅读节奏';
    } else {
      adaptiveStatusEl.textContent = '—';
      adaptiveStatusEl.className   = 'badge';
      adaptiveStatusEl.title       = '';
      if (adaptiveHintEl) adaptiveHintEl.textContent = '';
    }
  }
}

// ── 事件绑定 ──────────────────────────────────────────

// 主开关
mainToggle.addEventListener('click', async () => {
  const newEnabled = !currentState.enabled;
  currentState.enabled = newEnabled;

  await chrome.storage.local.set({ focusReaderEnabled: newEnabled });
  await sendToTab({ action: newEnabled ? 'enable' : 'disable' });

  renderUI();
});

// 模式按钮
document.querySelectorAll('[data-mode]').forEach(btn => {
  btn.addEventListener('click', () => updateSettings({ mode: btn.dataset.mode }));
});

// 颜色选择
document.querySelectorAll('[data-color]').forEach(dot => {
  dot.addEventListener('click', () => updateSettings({ color: dot.dataset.color }));
  dot.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); updateSettings({ color: dot.dataset.color }); }
  });
});

// 强度按钮
document.querySelectorAll('[data-opacity]').forEach(btn => {
  btn.addEventListener('click', () => updateSettings({ opacity: btn.dataset.opacity }));
});

// 自适应模式开关
document.getElementById('adaptiveToggle').addEventListener('click', async () => {
  const newAdaptive = !currentState.adaptiveMode;
  currentState.adaptiveMode = newAdaptive;
  await chrome.storage.local.set({ focusReaderAdaptive: newAdaptive });
  await sendToTab({ action: 'setAdaptiveMode', enabled: newAdaptive });
  renderUI();
});

// 阅读列模式开关
document.getElementById('columnToggle').addEventListener('click', async () => {
  const newCol = !currentState.columnMode;
  currentState.columnMode = newCol;
  await chrome.storage.local.set({ focusReaderColumnMode: newCol });
  await sendToTab({ action: 'setColumnMode', enabled: newCol });
  renderUI();
});

// AI 设置输入（blur 时保存，debounce input 保存 — F015: popup 关闭不一定触发 blur）
function makeDebounced(storageKey, trim = true) {
  let timer = null;
  function save(value) {
    const v = trim ? value.trim() : value;
    chrome.storage.local.set({ [storageKey]: v });
  }
  return (el) => {
    el.addEventListener('blur', (e) => {
      clearTimeout(timer);
      const v = trim ? e.target.value.trim() : e.target.value;
      e.target.value = v;
      save(v);
    });
    el.addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => save(e.target.value), 800);
    });
  };
}

makeDebounced('focusReaderApiKey')(document.getElementById('apiKeyInput'));
makeDebounced('focusReaderApiEndpoint')(document.getElementById('apiEndpointInput'));
makeDebounced('focusReaderApiModel')(document.getElementById('apiModelInput'));

// ── 初始化 ────────────────────────────────────────────
loadState();
