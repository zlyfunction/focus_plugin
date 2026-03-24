/**
 * Focus Reader - Background Service Worker
 * Handles: install defaults, keyboard commands, OpenAI-compatible API proxy
 */

// ── Install defaults ──────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    await chrome.storage.local.set({
      focusReaderEnabled: true,
      focusReaderAdaptive: true,
      focusReaderSettings: {
        mode: 'guide',
        color: 'yellow',
        opacity: 'medium',
      },
    });
  }
});

// ── Keyboard commands → forward to active tab ─────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, { action: command }).catch(() => {});
});

// ── API proxy (port-based, keeps service worker alive) ────────────
//
// Supports two providers detected by endpoint URL:
//   • Gemini  — endpoint contains "googleapis.com"
//               URL:  {endpoint}/{model}:generateContent
//               Auth: X-goog-api-key header
//   • OpenAI-compatible (default)
//               URL:  endpoint as-is
//               Auth: Authorization: Bearer header
//
// Security: API key is read here in background.js directly from storage.
// Content script only sends { text, mode, lang } — never the key itself.
//
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'tldr') return;

  let aborted = false;
  let processing = false; // F003: prevent concurrent invocations on same port
  port.onDisconnect.addListener(() => { aborted = true; });

  port.onMessage.addListener(async (msg) => {
    if (processing) return; // F003: drop duplicate messages
    processing = true;
    let { text, mode, lang } = msg;
    // F002: validate lang against BCP-47 to prevent prompt injection via lang field
    if (!/^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{2,8})*$/.test(lang)) lang = 'zh-CN';

    const stored = await chrome.storage.local.get(['focusReaderApiKey', 'focusReaderApiEndpoint', 'focusReaderApiModel']);
    const focusReaderApiKey = stored.focusReaderApiKey;
    if (!focusReaderApiKey) {
      if (!aborted) port.postMessage({ error: 'no_api_key' });
      return;
    }
    const apiEndpoint = stored.focusReaderApiEndpoint || 'https://free.v36.cm/v1/chat/completions';
    const apiModel    = stored.focusReaderApiModel    || 'gpt-4o-mini';

    const prompt = buildPrompt(text, mode, lang);
    const isGemini = apiEndpoint.includes('googleapis.com');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    port.onDisconnect.addListener(() => controller.abort());

    let result;
    try {
      let fetchUrl, fetchHeaders, fetchBody;

      if (isGemini) {
        // Gemini API: POST {base}/{model}:generateContent?key=...
        const base = apiEndpoint.replace(/\/$/, '');
        fetchUrl = `${base}/${apiModel}:generateContent`;
        fetchHeaders = {
          'Content-Type': 'application/json',
          'X-goog-api-key': focusReaderApiKey,
        };
        fetchBody = JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        });
      } else {
        // OpenAI-compatible
        fetchUrl = apiEndpoint;
        fetchHeaders = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${focusReaderApiKey}`,
        };
        fetchBody = JSON.stringify({
          model: apiModel,
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        });
      }

      const response = await fetch(fetchUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: fetchHeaders,
        body: fetchBody,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      if (isGemini) {
        result = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      } else {
        result = data.choices?.[0]?.message?.content?.trim() || '';
      }
    } catch (e) {
      clearTimeout(timeout);
      if (!aborted) {
        port.postMessage({ error: e.name === 'AbortError' ? 'timeout' : 'api_error' });
      }
      return;
    }

    if (!aborted) port.postMessage({ result });
  });
});

// ── Prompt builder ────────────────────────────────────────────────
function buildPrompt(text, mode, lang) {
  if (mode === 'summarize') {
    // Respond in the same language as the input text, not the browser UI language
    return `请用简洁的1-2句话总结以下文字，必须使用与原文完全相同的语言输出，不要加任何前缀或解释：\n\n${text}`;
  }
  // translate: go to the opposite language
  const targetLang = lang.startsWith('zh') ? 'English' : '中文';
  return `请将以下文字翻译为${targetLang}，只输出译文，不要加任何前缀或解释：\n\n${text}`;
}
