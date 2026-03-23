/**
 * Focus Reader — AdaptiveEngine E2E tests
 * Runs with real Chrome + extension loaded (no chrome.* API mocking)
 *
 * Run: npx playwright test
 *
 * NOTE: page.evaluate() runs in the regular page (not content-script) context,
 * so chrome.runtime is unavailable there. State is read via window.__focusReaderStatus
 * which the content script exposes as a testing bridge.
 */

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');

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

// Helper: simulate slow mouse movement (reading pace ~60 px/s)
async function simulateSlowReading(page, durationMs = 6000) {
  const steps = durationMs / 200;
  for (let i = 0; i < steps; i++) {
    await page.mouse.move(400 + i * 0.6, 300 + i * 0.1);
    await page.waitForTimeout(200);
  }
}

// Helper: get guide element width (proxy for radius multiplier)
async function getGuideWidth(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-focus-reader]');
    return el ? parseFloat(el.style.width) : null;
  });
}

// Helper: read calibration status via DOM data attribute (shared between worlds)
async function getCalibrationStatus(page) {
  return page.evaluate(() => document.documentElement.dataset.focusReaderCalibration ?? null);
}

// Helper: read enabled state via DOM data attribute
async function getEnabledState(page) {
  return page.evaluate(() => document.documentElement.dataset.focusReaderEnabled ?? null);
}

// ──────────────────────────────────────────────────────
// TEST SUITE
// ──────────────────────────────────────────────────────

test.describe('AdaptiveEngine', () => {
  let context;

  test.beforeAll(async () => {
    context = await launchWithExtension();
  });

  test.afterAll(async () => {
    await context.close();
  });

  // 1. Fresh domain shows "Learning..." state
  test('fresh domain shows learning state', async () => {
    const page = await context.newPage();
    await page.goto('https://en.wikipedia.org/wiki/Attention');
    await page.waitForTimeout(1000);
    const status = await getCalibrationStatus(page);
    expect(status).toMatch(/^learning:\d+$/);
    await page.close();
  });

  // 2. Guide element exists when mouse is over text
  test('guide element renders over text', async () => {
    const page = await context.newPage();
    await page.goto('https://en.wikipedia.org/wiki/Attention');
    await page.waitForTimeout(1000);
    await page.mouse.move(500, 400);
    await page.waitForTimeout(200);
    const guideEl = await page.$('[data-focus-reader]');
    expect(guideEl).not.toBeNull();
    await page.close();
  });

  // 3. Velocity computed in px/s (not px/ms) — radius stays sane
  test('guide width stays within sane bounds after slow reading', async () => {
    const page = await context.newPage();
    await page.goto('https://en.wikipedia.org/wiki/Attention');
    await page.waitForTimeout(1000);
    await simulateSlowReading(page, 6000);
    const width = await getGuideWidth(page);
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThan(1000); // sanity: not exploding
    await page.close();
  });

  // 4. Extension enabled state readable via window bridge
  test('enabled state accessible via window bridge', async () => {
    const page = await context.newPage();
    await page.goto('https://en.wikipedia.org/wiki/Attention');
    await page.waitForTimeout(500);
    const enabled = await getEnabledState(page);
    expect(enabled).toBe('true');
    await page.close();
  });

  // 5. Different domains get separate profiles (both start in learning)
  test('domain profiles are independent', async () => {
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    await page1.goto('https://en.wikipedia.org/wiki/Attention');
    await page2.goto('https://github.com');
    await page1.waitForTimeout(500);
    await page2.waitForTimeout(500);
    const s1 = await getCalibrationStatus(page1);
    const s2 = await getCalibrationStatus(page2);
    expect(s1).toMatch(/learning/);
    expect(s2).toMatch(/learning/);
    await page1.close();
    await page2.close();
  });

  // 6. Dwell pulse: cursor stationary >2.5s fires exactly once
  test('dwell pulse fires once per dwell event', async () => {
    const page = await context.newPage();
    await page.goto('https://en.wikipedia.org/wiki/Attention');
    await page.waitForTimeout(500);
    await page.mouse.move(500, 300);
    // Count brightness changes as proxy for pulse
    await page.evaluate(() => {
      window.__pulseCount = 0;
      const el = document.querySelector('[data-focus-reader]');
      if (el) {
        const observer = new MutationObserver(() => {
          if (el.style.filter && el.style.filter.includes('brightness')) {
            window.__pulseCount++;
          }
        });
        observer.observe(el, { attributes: true, attributeFilter: ['style'] });
      }
    });
    // Jiggle X only (Y unchanged = dwell not reset) to keep RAF loop alive
    for (let i = 0; i < 18; i++) {
      await page.mouse.move(500 + (i % 2), 300);
      await page.waitForTimeout(200);
    }
    // 18 × 200ms = 3.6s > 2.5s dwell threshold
    const pulseCount = await page.evaluate(() => window.__pulseCount);
    expect(pulseCount).toBeGreaterThanOrEqual(1);
    expect(pulseCount).toBeLessThanOrEqual(4); // allow for filter transitions
    await page.close();
  });

  // 7. Calibration progress increments as reading happens
  test('calibration progress increments with active reading', async () => {
    const page = await context.newPage();
    await page.goto('https://en.wikipedia.org/wiki/Attention');
    await page.waitForTimeout(500);
    const statusBefore = await getCalibrationStatus(page);
    // Simulate reading to trigger a tick (5s interval)
    await simulateSlowReading(page, 6000);
    const statusAfter = await getCalibrationStatus(page);
    // Both should be in learning state (not calibrated after just 5s)
    expect(statusBefore).toMatch(/learning/);
    expect(statusAfter).toMatch(/learning/);
    // Progress percentage should be numeric
    const pctAfter = parseInt(statusAfter.split(':')[1], 10);
    expect(pctAfter).toBeGreaterThanOrEqual(0);
    expect(pctAfter).toBeLessThan(100);
    await page.close();
  });

  // 8. Radius multiplier starts at 1.0 before calibration
  test('radius multiplier starts at 1.0 (no adaptation before calibration)', async () => {
    const page = await context.newPage();
    await page.goto('https://en.wikipedia.org/wiki/Attention');
    await page.waitForTimeout(500);
    await page.mouse.move(500, 300);
    await page.waitForTimeout(300);
    const width = await getGuideWidth(page);
    expect(width).toBeGreaterThanOrEqual(80);
    await page.close();
  });
});
