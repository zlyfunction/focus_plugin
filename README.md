# Focus Reader

A Chrome extension that highlights the text near your cursor to reduce visual noise and help you stay focused while reading.

## What it does

A soft ellipse follows your mouse as you read. Text inside the ellipse gets highlighted; everything else fades into the background. The effect is subtle — it narrows your visual field without obscuring content.

**Three modes:**
- **导引条** (Guide only) — ellipse follows cursor, no text highlight
- **文字** (Text only) — text near cursor is highlighted, no ellipse
- **两者** (Both) — ellipse + text highlight together

**AdaptiveEngine** — the extension watches how fast you move the mouse across text and adjusts the highlight radius to match your reading pace:
- Fast scanning → smaller, tighter radius (0.8×)
- Normal reading → default radius (1.0×)
- Slow / struggling → wider radius (1.4×) to reduce search effort

Each website calibrates independently. Calibration takes about 10 minutes of active reading. A dwell pulse (brief brightness flash) nudges the eye to keep moving when the cursor sits still for 2.5+ seconds.

## Installation

This extension is not on the Chrome Web Store. Load it manually:

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked** and select the `focus_plugin` folder
5. The extension icon appears in your toolbar — click it to open the popup

## Popup controls

| Control | Options |
|---------|---------|
| Main toggle | Enable / disable the extension |
| 显示方式 (Display) | 导引条 / 文字 / 两者 |
| 高亮颜色 (Color) | Yellow / Green / Blue / Pink |
| 强度 (Intensity) | 淡 (light) / 中 (medium) / 深 (strong) |
| 自适应 (Adaptive) | Status badge: 学习中 N% → 已校准 ✓ |

## Browser compatibility

| Feature | Requirement |
|---------|-------------|
| Extension | Chrome 88+ (Manifest V3) |
| Text highlight | Chrome 105+ (CSS Custom Highlight API) |
| Fallback | On older browsers, text highlight mode falls back to guide-only |

## Development

```bash
# Install test dependencies
npm install

# Run the E2E test suite (requires Chrome)
npx playwright test
```

Tests use Playwright with a real Chrome instance loaded with the extension (`--load-extension`). The suite covers AdaptiveEngine behavior, guide rendering, dwell pulse timing, and cross-domain profile isolation.

## Architecture

```
manifest.json          — Extension manifest (MV3)
background.js          — Service worker: writes default settings on install
content.js             — Main logic injected into every page
  ├─ Guide ellipse      lerp-animated div following the cursor
  ├─ Text brush         CSS Custom Highlight API (or DOM span fallback)
  ├─ Image dimming      hover-based opacity reduction on img elements
  └─ AdaptiveEngine     velocity sampling, calibration, dwell pulse
content.css            — ::highlight() rule for CSS Highlight API
popup.html / popup.js  — Extension popup UI
tests/                 — Playwright E2E tests
```

State is stored in `chrome.storage.local`. The AdaptiveEngine writes per-domain velocity profiles with a 3-day rolling window. Content script state is bridged to the page context via `document.documentElement.dataset` attributes for testability.

## License

MIT
