# Changelog

All notable changes to Focus Reader will be documented here.

## [1.2] - 2026-03-23

### Added
- **TL;DR summarize** (Alt+T): select text → in-place summary via AI API; original text restored via "还原" button
- **In-place translate** (Alt+Shift+T): translate selected text to English or Chinese in-place
  - Cross-block selection guard: refuses multi-paragraph selections to prevent layout corruption
  - Rapid invocation guard: drops duplicate requests while one is already loading
  - XSS prevention: LLM result written via `textContent` (never `innerHTML`)
  - Shadow DOM safety: `cloneContents()` wrapped in try/catch for cross-shadow-root edge case
  - OpenAI-compatible API backend (`gpt-4o-mini` via `https://free.v36.cm`) — API key saved locally in extension settings
- **Alt+F toggle**: keyboard shortcut to enable/disable Focus Reader globally
- **Reading column mode**: wraps the best content element in a 65ch column with sibling dimming; teardown fully restores original layout
  - Body guard: refuses to wrap `document.body` (shows toast instead)
  - SPA-safe: `pushState` monkey-patch with idempotency flag to reset column on navigation
- **Domain profile viewer** in popup: lists calibrated domains with speed label (扫读/正常/精读) and per-domain reset button
  - Reset syncs both storage and content script in-memory state
- **Adaptive mode toggle** in popup: turn off AdaptiveEngine without reloading; status row hidden when adaptive is off
- **Scroll rhythm signal**: `AdaptiveEngine` blends scroll velocity (30%) with mouse velocity (70%) for more accurate reading speed during scroll-heavy reading sessions
- **27 new Playwright tests** across 7 suites (static structural + E2E), covering all v1.2 features

### Changed
- **"Both" mode removed**: default mode changed from `'both'` → `'guide'`; migration code upgrades stored settings on load
- Popup AI section label changed from "Anthropic API Key" to "AI API Key" to reflect OpenAI-compatible backend
- API key saves on both `blur` and debounced `input` (800ms) to handle popup-close without blur event

### Fixed
- `visibilitychange` listener accumulation on rapid enable/disable (F008: deregister before re-registering in `start()`)
- `disableColumnMode` null-reference after SPA navigation (F004: store `window.__frColumnWrapper` reference at enable time)
- AdaptiveEngine tick runs when extension is disabled (F013: guard `adaptiveMode` flag in `disable()`)
- Profile reset only cleared storage, not in-memory `_profiles` map (F011: `resetProfile` message dispatched to content script)
- API key only saved on `blur`; popup close without blur lost edits (F015: added debounced `input` handler)

## [1.1] - 2026-03-23

### Added
- **AdaptiveEngine**: per-domain behavioral learning that adjusts the focus guide radius based on reading velocity
  - Mouse velocity sampled every 5 seconds (px/s); 3-day rolling window stored via `chrome.storage.local`
  - Guide radius scales 0.8× (fast scanning), 1.0× (normal), 1.4× (slow/struggling) after 10-minute calibration
  - Dwell pulse: brief brightness flash when cursor is stationary >2.5 seconds, nudging eye to keep moving
  - Domain profiles are independent — different sites calibrate separately
- **Popup adaptive status badge**: shows "Learning… N%" (orange) or "Calibrated ✓" (green)
- **E2E test suite**: 8 Playwright tests with real Chrome extension loading via `--load-extension`
  - DOM data attribute bridge (`dataset.focusReaderCalibration`, `dataset.focusReaderEnabled`) for cross-world state access in tests

### Changed
- `brushRadius` changed from `const` to `let` to allow runtime adjustment by AdaptiveEngine
- `getState` message response now includes `calibrationStatus`
- Adaptive section label and badge text localized to Chinese
- Adaptive section hidden when extension is disabled
- Footer compat note left-aligned (avoids ragged wrap in narrow popup)

### Improved
- Touch targets: option buttons raised to 32px min-height; color dots enlarged to 26px
- Keyboard accessibility: `focus-visible` rings on buttons and color dots; color dots gain `tabindex`, `role="radio"`, `aria-label`, and `keydown` (Enter/Space) support
- Adaptive section wrapped in `aria-live="polite"` for screen reader announcements
- Hint text line added below adaptive label for contextual status messages

## [1.0] - Initial release

- Focus guide ellipse follows cursor over text
- CSS Highlight API for text brush highlighting (fallback to DOM span)
- Per-element image dimming on hover
- Lerp animation for smooth guide transitions
- Dark mode support
- Popup with enable/disable toggle and settings (color, opacity, guide size)
