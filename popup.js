/**
 * Focus Reader - Popup Script
 */

const mainToggle = document.getElementById('mainToggle');
const settingsPanel = document.getElementById('settingsPanel');
const compatNote = document.getElementById('compatNote');

let currentState = {
  enabled: true,
  settings: { mode: 'both', color: 'yellow', opacity: 'medium' },
  hasCSSHighlight: false,
};

// ── 从当前 Tab 读取状态 ───────────────────────────────
async function loadState() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getState' });
    if (response) {
      currentState = response;
      renderUI();
    }
  } catch (e) {
    // content script 未注入（如 about: 页面）
    renderUI();
  }
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

  // 颜色点
  document.querySelectorAll('[data-color]').forEach(dot => {
    dot.classList.toggle('active', dot.dataset.color === settings.color);
  });

  // 强度按钮
  document.querySelectorAll('[data-opacity]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.opacity === settings.opacity);
  });

  // 兼容性提示
  if (!hasCSSHighlight && (settings.mode === 'text' || settings.mode === 'both')) {
    compatNote.textContent = '文字高亮需 Safari 17.2+，当前使用导引条模式';
  } else {
    compatNote.textContent = '';
  }

  // Adaptive status badge
  const adaptiveStatusEl = document.getElementById('adaptiveStatus');
  if (adaptiveStatusEl) {
    const s = currentState.calibrationStatus;
    if (s === 'calibrated') {
      adaptiveStatusEl.textContent = 'Calibrated ✓';
      adaptiveStatusEl.className = 'badge badge-calibrated';
    } else if (s && s.startsWith('learning:')) {
      const pct = s.split(':')[1];
      adaptiveStatusEl.textContent = `Learning… ${pct}%`;
      adaptiveStatusEl.className = 'badge badge-learning';
    } else {
      adaptiveStatusEl.textContent = '—';
      adaptiveStatusEl.className = 'badge';
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
});

// 强度按钮
document.querySelectorAll('[data-opacity]').forEach(btn => {
  btn.addEventListener('click', () => updateSettings({ opacity: btn.dataset.opacity }));
});

// ── 初始化 ────────────────────────────────────────────
loadState();
