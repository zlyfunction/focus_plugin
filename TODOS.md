# TODOS — Focus Reader

## AdaptiveEngine

### Velocity Sparkline in Popup
**Priority:** P3
**Effort:** S (CC: ~15 min)
**What:** Render the last 5 velocity samples as a tiny inline SVG sparkline in `popup.html` next to the adaptive status badge.
**Why:** The badge text ("Learning 40%" / "Calibrated ✓") tells users the engine is working, but shows nothing about the trend. A sparkline makes calibration feel alive and tangible.
**Pros:** ~15 lines of JS + SVG; zero new permissions; purely cosmetic.
**Cons:** Adds complexity to `popup.js` renderUI(); sparkline data must survive popup close/reopen (store last 5 samples in `chrome.storage.local`).
**Context:** Deferred from v1.2 cherry-pick ceremony (SELECTIVE EXPANSION mode). AdaptiveEngine already stores velocity samples; this is a read-only visualization layer.

### Cross-User Baseline Seeding
**Priority:** P4
**Effort:** L (CC: ~30 min + backend required)
**What:** Seed new domains with an aggregate median from all users' calibrated velocity profiles so the first experience already feels tuned, rather than starting from the default radius and calibrating from scratch.
**Why:** New users on a new domain always start cold (10-minute calibration window). A shared baseline would make day-1 feel polished.
**Pros:** Dramatically improves first impression for new domains; privacy-safe if anonymized.
**Cons:** Requires a sync endpoint or shared storage mechanism — breaks the local-only model which is currently a feature. Non-trivial infrastructure investment.
**Context:** Deferred from v1.2 cherry-pick ceremony. Blocked by: backend infrastructure decision.

## Column Mode

### Full SPA Support via MutationObserver
**Priority:** P2
**Effort:** M (CC: ~20 min)
**What:** Add a `MutationObserver` watching `document.body` subtree to detect when the column mode target element is removed or replaced by a SPA navigation, triggering full teardown automatically.
**Why:** SPAs (React, Vue, Angular) replace DOM on route change. The current pushState monkey-patch heuristic (500ms delay) is best-effort and will leave orphaned `.fr-column-wrapper` elements on some sites.
**Pros:** Production-grade SPA reliability; graceful teardown; no user-visible glitches.
**Cons:** MutationObserver on `body` subtree has a small perf cost; must be disconnected during teardown to avoid re-triggering.
**Context:** Deferred from v1.2. The pushState heuristic ships in v1.2 as a partial mitigation. The MutationObserver approach is the complete solution.
**Depends on:** Column mode shipped in v1.2.

## UX / Shortcuts

### Alt+T Conflict Notice in Popup
**Priority:** P3
**Effort:** S (CC: ~10 min)
**What:** Add a one-line note below the TL;DR row in `popup.html`: "If Alt+T doesn't respond, configure shortcuts at chrome://extensions/shortcuts."
**Why:** Alt+T conflicts with browser shortcuts on some platforms (Firefox on Windows uses Alt+T for the Tools menu). Users who hit the conflict have no in-product guidance.
**Pros:** Zero runtime cost; prevents confusion; 1 line of HTML.
**Cons:** Adds visual noise to the popup for the ~90% of users who don't hit the conflict.
**Context:** Deferred from v1.2 cherry-pick ceremony. Blocked by: none.

## Marketing / Distribution

### Demo GIF + Show HN Post
**Priority:** P2
**Effort:** S (human: ~1h)
**What:** Record a 30–60 second GIF showing: focus guide following text, TL;DR (`Alt+T`) summarizing a paragraph, translation (`Alt+Shift+T`), and column mode activated. Post to Show HN and ProductHunt after v1.2 ships.
**Why:** A well-crafted GIF is the single highest-leverage distribution asset for a browser extension. Most users discover extensions through demos, not descriptions.
**Pros:** Minimal effort for potentially high reach; assets reusable for Chrome Web Store listing.
**Cons:** Human time only (CC can't record screen); requires v1.2 to be shipped first.
**Context:** Deferred from v1.2. Ship v1.2 first, then record.
**Depends on:** v1.2 shipped.

## Completed

<!-- Items completed in prior versions will be listed here -->
