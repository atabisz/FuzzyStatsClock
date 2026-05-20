# Roadmap: FuzzyStatsClock

## Milestones

- 🚧 **v4.4 Smooth Ghost Fade Under Load** — Phases 85–87 (in progress)
- ✅ **v4.3 Configurable Ghost Override** — Phases 81–84 (shipped 2026-05-07) — [archive](./milestones/v4.3-ROADMAP.md)
- ✅ **v4.2 Temps & Menu** — Phases 75–80 (shipped 2026-05-04) — [archive](./milestones/v4.2-ROADMAP.md)
- ✅ **v4.1 Polish & Phrases** — Phases 70–74 (shipped 2026-04-01) — [archive](./milestones/v4.1-ROADMAP.md)
- ✅ **v4.0 Proximity Ghost Mode** — Phases 66–69 (shipped 2026-03-27) — [archive](./milestones/v4.0-ROADMAP.md)
- ✅ **v3.9 LCD Clock + Japanese** — Phases 61–65 (shipped 2026-03-27) — [archive](./milestones/v3.9-ROADMAP.md)
- ✅ **v3.8 Dial Settings** — Phase 60 (shipped 2026-03-23) — [archive](./milestones/v3.8-ROADMAP.md)
- ✅ **v3.7 Nixie Clock** — Phases 58–59 (shipped 2026-03-23) — [archive](./milestones/v3.7-ROADMAP.md)
- ✅ **v3.6.2 Contrast Fix** — Phase 58 (shipped 2026-03-19) — [archive](./milestones/v3.6.2-ROADMAP.md)
- ✅ **v3.5 Phrase Wrap + Installer** — Phases 48–55 (shipped 2026-03-18) — [archive](./milestones/v3.5-ROADMAP.md)
- ✅ **v3.2 Expanded Experience** — Phases 41–47 (shipped 2026-09-09) — [archive](./milestones/v3.2-ROADMAP.md)
- ✅ **v3.1 Quality + Battery** — Phases 37–40 (shipped 2026-03-08) — [archive](./milestones/v3.1-ROADMAP.md)
- ✅ **v3.0 Date Display** — Phase 36 (shipped 2026-03-07) — [archive](./milestones/v3.0-ROADMAP.md)
- ✅ Earlier milestones (v1.0 – v2.9) — see [archives](./milestones/) + [MILESTONES.md](./MILESTONES.md)

---

## v4.4 Smooth Ghost Fade Under Load

**Milestone Goal:** Make ghost-mode proximity fade visibly smooth under sustained CPU contention (~25–50%) by decoupling sampling cadence from rendering cadence and moving the sampling loop off the UI thread — without changing any user-visible interaction semantics or persisted settings.

**Approach:** Three sequential phases — first refactor `GhostModeController` so sampling runs on a thread-pool timer (Phase 85), then introduce frame-driven opacity rendering in `MainWindow` so the visible fade glides at the display refresh rate (Phase 86), then verify with new pure-static unit tests, the existing 574-test regression suite, and a manual CPU-load smoke run (Phase 87).

## Phases

- [ ] **Phase 85: Off-thread sampling refactor** — Move `GhostModeController` sampling onto `System.Threading.Timer`, marshal UI work via `Dispatcher.BeginInvoke`, expose a tickable seam for tests
- [ ] **Phase 86: Frame-driven opacity rendering** — Subscribe `MainWindow` to `CompositionTarget.Rendering` while ghost mode is enabled, lerp current opacity ratio toward target each frame
- [ ] **Phase 87: Verification & performance acceptance** — Lerp unit tests, tickable-seam tests, full MSTest suite green, manual CPU-load smoothness check

## Phase Details

### Phase 85: Off-thread sampling refactor
**Goal**: `GhostModeController` samples cursor position, computes proximity ratio, and emits target-ratio updates without occupying the UI thread, while preserving every existing ghost interaction semantic (terminal-state ghost activation/restore, modifier override, drag/menu/settings guards observed downstream).
**Depends on**: Nothing (first phase of milestone — continues from Phase 84)
**Requirements**: SAMP-01, SAMP-02, SAMP-03, SAMP-04, SEM-01, SEM-02, SEM-03, SEM-05
**Success Criteria** (what must be TRUE):
  1. `GhostModeController` no longer owns a `DispatcherTimer`; sampling is driven by `System.Threading.Timer` (or equivalent thread-pool timer) at a cadence no slower than 33 ms
  2. `GetCursorPos`, `GetWindowRect`, `GetAsyncKeyState`, and the call to `ComputeProximityRatio` execute on the sampling thread; UI-touching work (`WS_EX_TRANSPARENT` toggle, `ProximityChanged` raise, `Restored` raise) marshals to the window dispatcher via `Dispatcher.BeginInvoke`
  3. Ratio reaching `1.0` still applies `WS_EX_TRANSPARENT`, ratio dropping below `1.0` still removes it immediately, and `Restored` still fires only on full retreat to ratio `0.0` after ghost activation (PROX-03 / D-06 / D-07 invariants from v4.0 hold byte-for-byte)
  4. Configurable Ctrl/Alt/Shift modifier-held check still forces ratio to `0.0` when held (v4.3 override semantics unchanged); ghost-mode tray toggle off still produces zero sampling work, zero events, and zero opacity manipulation
  5. The pure-logic core of `OnTimerTick` is reachable from tests via an internal seam (e.g. `OnSampleTick(int cursorX, int cursorY, RECT, bool modifiersHeld)`) so the new threading machinery is not on the test critical path
**Plans**: 4 plans
- [ ] 85-01-PLAN.md — Pure tickable seam: SampleResult struct, GhostTransition enum, OnSampleTick method (no threading change)
- [ ] 85-02-PLAN.md — Volatile config fields: _isEnabled, _useCtrl/Alt/Shift, _ghostFadeRadiusPx, _isGhostMode (cross-thread coherence prep)
- [ ] 85-03-PLAN.md — Off-thread timer: System.Threading.Timer + Interlocked reentrancy guard + Dispatcher.BeginInvoke marshalling
- [ ] 85-04-PLAN.md — Synchronous disposal: _timer.Dispose(WaitHandle) blocking until in-flight tick drains

### Phase 86: Frame-driven opacity rendering
**Goal**: The visible fade traversal glides at display refresh rate via a per-frame lerp pump driven by `CompositionTarget.Rendering`, fully decoupled from sampling cadence, with all `MainWindow` interaction guards (drag, settings window, right-click menu, mouse-wheel opacity) preserved verbatim.
**Depends on**: Phase 85 (consumes `ProximityChanged` as target-ratio source)
**Requirements**: FADE-01, FADE-02, FADE-03, FADE-04, SEM-04
**Success Criteria** (what must be TRUE):
  1. While ghost mode is enabled, `MainWindow` is subscribed to `CompositionTarget.Rendering` and lerps a `_currentRatio` field toward `_targetRatio` (set by `ProximityChanged`) every render frame; while ghost mode is disabled, the subscription is removed and the per-frame loop has zero overhead
  2. `this.Opacity` is computed from `_currentRatio` (not the target), and the contrast-skip predicate observes `_currentRatio > 0.0` (not the target) — visible state and contrast pause are governed by what the user actually sees
  3. When the target ratio reaches a terminal value (`1.0` or `0.0`), `_currentRatio` snaps to that exact value rather than asymptotically approaching it — ghost activation and `Restored` timing remain crisp
  4. Lerp logic is extracted as a pure static helper (`LerpRatio(double current, double target, double alpha, double deltaSeconds)` or equivalent) suitable for unit testing without any WPF/timer dependency
  5. Existing `MainWindow` interaction guards behave identically: `_isDragging` short-circuits opacity writes, settings-window visibility short-circuits opacity writes, `_menuOpen` (RMB-04 right-click menu pin) short-circuits opacity writes, and the mouse-wheel `SetOpacity` path still writes `this.Opacity` directly without contention from the per-frame loop
**Plans**: TBD

### Phase 87: Verification & performance acceptance
**Goal**: The new threading + rendering model is locked in by automated tests and human-observed smoothness — no regressions in the existing 574-test suite, new pure-helper coverage, and a manual smoothness check under sustained CPU load.
**Depends on**: Phase 86 (verification target)
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, PERF-01
**Success Criteria** (what must be TRUE):
  1. Existing pure-static unit tests on `ComputeProximityRatio` (12 cases) and `IsModifierHeld` (configurable-override coverage) pass without modification — proves Phase 85 refactor preserved tested invariants
  2. New unit tests cover the Phase 86 pure-static `LerpRatio` helper across convergence-toward-target, terminal-state snap (`1.0` and `0.0`), and step-size bounds; tests run inside `FuzzyClock.Core.Tests` or `FuzzyClock.App.Tests` (whichever owns the helper) with no WPF/timer setup
  3. Sampling pipeline core has a tickable-seam test (e.g. injecting cursor coords + window rect + modifiers-held into `OnSampleTick`) verifying ratio computation and event emission without spinning real timers/threads
  4. `dotnet test` runs the full MSTest suite (`FuzzyClock.Core.Tests` + `FuzzyClock.App.Tests`) green at milestone end — at least 574 tests, zero failures, zero regressions in the pre-existing ~445 Core + ~129 App split
  5. Manual run with a sustained 25–50% CPU load generator confirms the fade is visibly smooth (no stepping/jank, ≥30 fps subjective) for the full fade traversal — recorded as human-verified in the phase summary
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 85 → 86 → 87

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 85. Off-thread sampling refactor | 0/4 | Not started | - |
| 86. Frame-driven opacity rendering | 0/TBD | Not started | - |
| 87. Verification & performance acceptance | 0/TBD | Not started | - |
