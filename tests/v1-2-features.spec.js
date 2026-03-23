/**
 * Focus Reader v1.2 — Feature tests
 * Covers: both mode removed, scroll rhythm, adaptiveMode default,
 *         column mode DOM bridge, Alt+F toggle via DOM bridge
 *
 * Run: npx playwright test tests/v1-2-features.spec.js
 *
 * NOTE: Tests use DOM attribute bridges (dataset.*) shared between
 * the extension's isolated world and the page's main world.
 * TL;DR and translate features require an Anthropic API key and are
 * tested manually.
 */

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs  = require('fs');

const EXT_PATH = path.resolve(__dirname, '..');

async function launchWithExtension() {
  return chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
    ],
  });
}

async function getEnabledState(page) {
  return page.evaluate(() => document.documentElement.dataset.focusReaderEnabled ?? null);
}

async function getCalibrationStatus(page) {
  return page.evaluate(() => document.documentElement.dataset.focusReaderCalibration ?? null);
}

// ──────────────────────────────────────────────────────
// SUITE 1: 'both' mode removed
// ──────────────────────────────────────────────────────

test.describe('both mode removal', () => {
  // Static check: popup.html must not contain a "both" button
  test('popup.html has no both-mode button (static check)', () => {
    const html = fs.readFileSync(path.join(EXT_PATH, 'popup.html'), 'utf8');
    expect(html).not.toContain('data-mode="both"');
  });

  // Static check: content.js default settings must not use 'both'
  test('content.js default mode is guide, not both (static check)', () => {
    const src = fs.readFileSync(path.join(EXT_PATH, 'content.js'), 'utf8');
    // Default settings object
    expect(src).toContain("mode: 'guide'");
    // Migration code exists
    expect(src).toContain("settings.mode === 'both'");
    expect(src).toContain("settings.mode = 'guide'");
  });

  // Static check: popup.js default state must not use 'both'
  test('popup.js default mode is guide (static check)', () => {
    const src = fs.readFileSync(path.join(EXT_PATH, 'popup.js'), 'utf8');
    expect(src).toContain("mode: 'guide'");
    expect(src).not.toMatch(/mode:\s*'both'/);
  });

  // Static check: update() no longer checks for 'both' in showGuide/showText
  test('content.js update() does not reference both mode (static check)', () => {
    const src = fs.readFileSync(path.join(EXT_PATH, 'content.js'), 'utf8');
    // The update() function should only check 'guide' and 'text'
    expect(src).toContain("settings.mode === 'guide'");
    expect(src).toContain("settings.mode === 'text'");
    // No 'both' in the showGuide/showText logic
    expect(src).not.toMatch(/showGuide.*both/);
    expect(src).not.toMatch(/showText.*both/);
  });
});

// ──────────────────────────────────────────────────────
// SUITE 2: Extension still works in guide mode (E2E)
// ──────────────────────────────────────────────────────

test.describe('guide mode works correctly without both', () => {
  let context;

  test.beforeAll(async () => {
    context = await launchWithExtension();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('guide element renders over text content', async () => {
    const page = await context.newPage();
    await page.goto('https://en.wikipedia.org/wiki/Attention');
    await page.waitForTimeout(1000);
    await page.mouse.move(500, 400);
    await page.waitForTimeout(200);
    const guideEl = await page.$('[data-focus-reader]');
    expect(guideEl).not.toBeNull();
    await page.close();
  });

  test('extension enabled state is true on load', async () => {
    const page = await context.newPage();
    await page.goto('https://en.wikipedia.org/wiki/Attention');
    await page.waitForTimeout(800);
    const enabled = await getEnabledState(page);
    expect(enabled).toBe('true');
    await page.close();
  });

  test('calibration status is set (learning or calibrated)', async () => {
    const page = await context.newPage();
    await page.goto('https://en.wikipedia.org/wiki/Attention');
    await page.waitForTimeout(800);
    const status = await getCalibrationStatus(page);
    expect(status).toMatch(/^(learning:\d+|calibrated)$/);
    await page.close();
  });
});

// ──────────────────────────────────────────────────────
// SUITE 3: Scroll rhythm signal (E2E)
// ──────────────────────────────────────────────────────

test.describe('scroll rhythm in AdaptiveEngine', () => {
  let context;

  test.beforeAll(async () => {
    context = await launchWithExtension();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('scroll events do not crash engine or invalidate calibration status', async () => {
    const page = await context.newPage();
    await page.goto('https://en.wikipedia.org/wiki/Attention');
    await page.waitForTimeout(800);

    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(500);

    const status = await getCalibrationStatus(page);
    expect(status).toMatch(/^(learning:\d+|calibrated)$/);

    await page.mouse.move(400, 300);
    await page.waitForTimeout(200);
    const guideEl = await page.$('[data-focus-reader]');
    expect(guideEl).not.toBeNull();
    await page.close();
  });

  test('guide width remains sane after combined scroll+mouse reading', async () => {
    const page = await context.newPage();
    await page.goto('https://en.wikipedia.org/wiki/Attention');
    await page.waitForTimeout(800);

    for (let i = 0; i < 15; i++) {
      await page.mouse.move(400 + i * 2, 300 + i * 0.5);
      await page.mouse.wheel(0, 80);
      await page.waitForTimeout(200);
    }

    await page.mouse.move(400, 300);
    await page.waitForTimeout(200);
    const width = await page.evaluate(() => {
      const el = document.querySelector('[data-focus-reader]');
      return el ? parseFloat(el.style.width) : null;
    });
    expect(width).not.toBeNull();
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThan(1000);
    await page.close();
  });

  // Static check: scroll listener is attached in start() and removed in stop()
  test('scroll rhythm listener is properly registered and cleaned up (static check)', () => {
    const src = fs.readFileSync(path.join(EXT_PATH, 'content.js'), 'utf8');
    expect(src).toContain("window.addEventListener('scroll', this._scrollListener");
    expect(src).toContain("window.removeEventListener('scroll', this._scrollListener)");
    expect(src).toContain('this._scrollVelocity = 0');
    expect(src).toContain('0.7 * mouseVelocity + 0.3 * this._scrollVelocity');
  });
});

// ──────────────────────────────────────────────────────
// SUITE 4: Column mode (static + structural checks)
// ──────────────────────────────────────────────────────

test.describe('column mode', () => {
  // Static: column mode implementation is present and correct
  test('enableColumnMode creates 65ch wrapper (static check)', () => {
    const src = fs.readFileSync(path.join(EXT_PATH, 'content.js'), 'utf8');
    expect(src).toContain('fr-column-wrapper');
    expect(src).toContain('max-width:65ch');
    expect(src).toContain('margin:0 auto');
  });

  test('disableColumnMode restores siblings (static check)', () => {
    const src = fs.readFileSync(path.join(EXT_PATH, 'content.js'), 'utf8');
    expect(src).toContain('frDimOrig');
    expect(src).toContain('wrapper.remove()');
    expect(src).toContain('wrapperParent');
    // Null guard present (F004 updated to use __frColumnWrapper ref)
    expect(src).toContain('if (!window.__frColumnState) return');
    expect(src).toContain('window.__frColumnWrapper');
  });

  test('sibling dimming excludes the wrapper itself (static check)', () => {
    const src = fs.readFileSync(path.join(EXT_PATH, 'content.js'), 'utf8');
    // Wrapper exclusion logic
    expect(src).toContain('if (el === wrapper || !(el instanceof HTMLElement)) return');
  });

  test('SPA pushState monkey-patch is guarded with idempotency flag (static check)', () => {
    const src = fs.readFileSync(path.join(EXT_PATH, 'content.js'), 'utf8');
    expect(src).toContain('__frPushStatePatched');
    expect(src).toContain('history.pushState');
  });

  test('popup.html has column mode toggle (static check)', () => {
    const html = fs.readFileSync(path.join(EXT_PATH, 'popup.html'), 'utf8');
    expect(html).toContain('id="columnToggle"');
    expect(html).toContain('阅读列模式');
  });
});

// ──────────────────────────────────────────────────────
// SUITE 5: TL;DR / translate (static checks)
// ──────────────────────────────────────────────────────

test.describe('TL;DR and translate (static checks)', () => {
  test('handleTldr uses textContent not innerHTML (XSS prevention)', () => {
    const src = fs.readFileSync(path.join(EXT_PATH, 'content.js'), 'utf8');
    // XSS guard: result must use textContent
    expect(src).toContain('resultSpan.textContent = msg.result');
    // Must NOT use innerHTML for result
    expect(src).not.toMatch(/resultSpan\.innerHTML\s*=/);
  });

  test('handleTldr removes restore button before re-inserting fragment', () => {
    const src = fs.readFileSync(path.join(EXT_PATH, 'content.js'), 'utf8');
    // Double-invocation guard
    expect(src).toContain('restoreBtn.remove()');
    expect(src).toContain("originalFragment.cloneNode(true)");
  });

  test('cross-block selection guard uses querySelectorAll', () => {
    const src = fs.readFileSync(path.join(EXT_PATH, 'content.js'), 'utf8');
    expect(src).toContain('querySelectorAll(blockTags).length > 1');
  });

  test('rapid invocation guard prevents double-loading', () => {
    const src = fs.readFileSync(path.join(EXT_PATH, 'content.js'), 'utf8');
    expect(src).toContain("document.querySelector('.fr-tldr-loading')");
  });

  test('originalFragment captured BEFORE deleteContents (snapshot timing)', () => {
    const src = fs.readFileSync(path.join(EXT_PATH, 'content.js'), 'utf8');
    // guardFragment (reused as originalFragment) captured via cloneContents before deleteContents
    const fragIdx = src.indexOf('guardFragment = range.cloneContents()');
    const delIdx  = src.indexOf('range.deleteContents()');
    expect(fragIdx).toBeGreaterThan(-1);
    expect(delIdx).toBeGreaterThan(-1);
    expect(fragIdx).toBeLessThan(delIdx);
  });

  test('manifest has commands for tldr-summarize and tldr-translate', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(EXT_PATH, 'manifest.json'), 'utf8'));
    expect(manifest.commands).toBeDefined();
    expect(manifest.commands['tldr-summarize']).toBeDefined();
    expect(manifest.commands['tldr-translate']).toBeDefined();
    expect(manifest.commands['tldr-summarize'].suggested_key.default).toBe('Alt+T');
    expect(manifest.commands['tldr-translate'].suggested_key.default).toBe('Alt+Shift+T');
  });
});

// ──────────────────────────────────────────────────────
// SUITE 6: Alt+F toggle (static check)
// ──────────────────────────────────────────────────────

test.describe('Alt+F extension toggle', () => {
  test('manifest has toggle-extension command with Alt+F (static check)', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(EXT_PATH, 'manifest.json'), 'utf8'));
    expect(manifest.commands['toggle-extension']).toBeDefined();
    expect(manifest.commands['toggle-extension'].suggested_key.default).toBe('Alt+F');
  });

  test('content.js handles toggle-extension and updates storage (static check)', () => {
    const src = fs.readFileSync(path.join(EXT_PATH, 'content.js'), 'utf8');
    expect(src).toContain("case 'toggle-extension'");
    expect(src).toContain('focusReaderEnabled');
  });

  test('background.js forwards keyboard commands to active tab (static check)', () => {
    const src = fs.readFileSync(path.join(EXT_PATH, 'background.js'), 'utf8');
    expect(src).toContain('chrome.commands.onCommand.addListener');
    expect(src).toContain('chrome.tabs.sendMessage');
  });
});

// ──────────────────────────────────────────────────────
// SUITE 7: API security (static checks)
// ──────────────────────────────────────────────────────

test.describe('API key security', () => {
  test('background.js reads API key from storage (never from port message)', () => {
    const src = fs.readFileSync(path.join(EXT_PATH, 'background.js'), 'utf8');
    expect(src).toContain("chrome.storage.local.get(['focusReaderApiKey']");
    // Port message destructure must not include apiKey (let destructure after F002 lang validation)
    expect(src).toContain('let { text, mode, lang } = msg');
    expect(src).not.toContain('msg.apiKey');
  });

  test('background.js uses AbortController for 30-second timeout', () => {
    const src = fs.readFileSync(path.join(EXT_PATH, 'background.js'), 'utf8');
    expect(src).toContain('AbortController');
    expect(src).toContain('30000');
    expect(src).toContain('controller.abort()');
  });

  test('manifest has host_permission for AI API endpoint', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(EXT_PATH, 'manifest.json'), 'utf8'));
    expect(manifest.host_permissions).toContain('https://free.v36.cm/*');
  });
});
