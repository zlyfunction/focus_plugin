# Changelog

All notable changes to Focus Reader will be documented here.

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

## [1.0] - Initial release

- Focus guide ellipse follows cursor over text
- CSS Highlight API for text brush highlighting (fallback to DOM span)
- Per-element image dimming on hover
- Lerp animation for smooth guide transitions
- Dark mode support
- Popup with enable/disable toggle and settings (color, opacity, guide size)
