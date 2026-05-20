# Milestone v4.4 Requirements — Smooth Ghost Fade Under Load

**Goal:** Make ghost-mode proximity fade visibly smooth even when the system is under CPU contention (~25%+) by decoupling sampling from rendering and moving sampling off the UI thread.

**Out of scope rationale:** No new user-visible features beyond improved smoothness. No settings UI changes. No persistence changes (no new fields in `AppSettings`).

---

## v4.4 Requirements

### FADE — Frame-driven opacity rendering

- [ ] **FADE-01**: A frame-driven lerp drives `this.Opacity` toward a target ratio every render frame via `CompositionTarget.Rendering`, so visible fade smoothness is governed by display refresh rate rather than sampling cadence
- [ ] **FADE-02**: `GhostModeController` exposes a target ratio set by sampling; `MainWindow` holds the current ratio updated per render frame; the contrast-skip predicate observes the current ratio (not the target)
- [ ] **FADE-03**: When the target ratio reaches `1.0` or `0.0`, the current ratio snaps to that terminal value rather than asymptotically approaching it — preserving crisp ghost activation and `Restored` timing
- [ ] **FADE-04**: The `CompositionTarget.Rendering` subscription is added when ghost mode is enabled and removed when disabled, so the per-frame loop has zero overhead when the feature is off

### SAMP — Off-thread proximity sampling

- [ ] **SAMP-01**: `GhostModeController` sampling uses a `System.Threading.Timer` (or equivalent thread-pool timer) instead of a UI-thread `DispatcherTimer`, so sampling no longer competes with WPF layout/input/render
- [ ] **SAMP-02**: `GetCursorPos`, `GetWindowRect`, and `GetAsyncKeyState` calls plus the pure ratio computation run on the sampling thread — never on the UI thread
- [ ] **SAMP-03**: All UI-touching work — `WS_EX_TRANSPARENT` toggle, `Activate`/`Restore`, `ProximityChanged` and `Restored` event raises — marshals to the dispatcher via `Dispatcher.BeginInvoke` so WPF/Win32 thread-affinity invariants are preserved
- [ ] **SAMP-04**: Sampling cadence is no slower than the existing 33 ms cadence — target-ratio updates are observed at least as quickly as today

### SEM — Preserved interaction semantics

- [x] **SEM-01**: Ratio reaching `1.0` activates `WS_EX_TRANSPARENT`; ratio dropping below `1.0` removes it immediately (PROX-03 / D-06 / D-07 invariants from v4.0 still hold) — Plan 85-01 (encoded as `GhostTransition.Activate` / `RestoreNoEvent` / `RestoreWithEvent` in `OnSampleTick`)
- [x] **SEM-02**: `Restored` fires only when ratio fully reaches `0.0` after ghost activation — never on intermediate sub-`1.0` ticks during cursor retreat — Plan 85-01 (encoded as `RestoreWithEvent` only when `ratio == 0.0`)
- [x] **SEM-03**: Configurable Ctrl/Alt/Shift modifier-held check still forces ratio to `0.0` exactly as in v4.3 — no behavior change to override semantics — Plan 85-01 (`OnSampleTick` forces `ratio = 0.0` when `(useCtrl || useAlt || useShift) && modifiersHeld`)
- [ ] **SEM-04**: `MainWindow` drag freeze (`_isDragging`), settings-window-open freeze, RMB-04 right-click menu pin (`_menuOpen`), and mouse-wheel direct opacity all behave identically — the new render pump must respect the same guards
- [x] **SEM-05**: Ghost-mode tray toggle off → no sampling, no event raises, no opacity manipulation (PROX-09 disable-gate invariant) — Plan 85-01 (`OnSampleTick` early-bails on `!IsEnabled`; `OnTimerTick` retains its own pre-seam `!IsEnabled` bail)

### TEST — Test coverage

- [ ] **TEST-01**: Existing pure-static unit tests on `ComputeProximityRatio` (12 cases) and `IsModifierHeld` (configurable-override coverage) keep passing without modification
- [ ] **TEST-02**: New per-frame lerp logic is extracted as a pure static method (e.g. `LerpRatio`) with unit tests covering convergence toward target, terminal-state snap (`1.0` and `0.0`), and step-size bounds
- [ ] **TEST-03**: The sampling loop's pure-logic core is reachable from tests without spinning up real timers or threads — via a tickable seam (e.g. internal `OnSampleTick` method that takes injected cursor/rect/key-state) so threading is not on the critical test path
- [ ] **TEST-04**: Full MSTest suite (`FuzzyClock.Core.Tests` + `FuzzyClock.App.Tests`) is green at milestone end with no regressions in the existing 574 tests

### PERF — Observable performance criterion

- [ ] **PERF-01**: Under sustained 25–50% CPU load, ghost-fade is visibly smooth (no stepping/jank) at 30+ fps for the full fade traversal — verified by manual run with a CPU-load generator and human visual confirmation

---

## Future Requirements

- Per-frame lerp speed exposed as a settings-backed tunable (deferred — YAGNI for v4.4; revisit only if users report fade duration preferences)

---

## Out of Scope (with reasoning)

- **No settings UI changes** — milestone is purely architectural; user-visible surface unchanged
- **No new persisted fields in `AppSettings`** — preserves zero settings.json migration cost
- **Replacing `WH_MOUSE_LL` low-level hook for sampling** — bigger commit; not needed if `System.Threading.Timer` solves the responsiveness problem
- **Coalescing or rate-limiting `Dispatcher.BeginInvoke` calls** — premature optimization; revisit only if measurement shows dispatcher saturation

---

## Traceability

Every v4.4 requirement maps to exactly one phase. The owning phase is the one that introduces the capability; the requirement is verified there even if downstream phases consume or re-verify it.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FADE-01 | Phase 86 | Pending |
| FADE-02 | Phase 86 | Pending |
| FADE-03 | Phase 86 | Pending |
| FADE-04 | Phase 86 | Pending |
| SAMP-01 | Phase 85 | Pending |
| SAMP-02 | Phase 85 | Pending |
| SAMP-03 | Phase 85 | Pending |
| SAMP-04 | Phase 85 | Pending |
| SEM-01  | Phase 85 (Plan 85-01) | Complete |
| SEM-02  | Phase 85 (Plan 85-01) | Complete |
| SEM-03  | Phase 85 (Plan 85-01) | Complete |
| SEM-04  | Phase 86 | Pending |
| SEM-05  | Phase 85 (Plan 85-01) | Complete |
| TEST-01 | Phase 87 | Pending |
| TEST-02 | Phase 87 | Pending |
| TEST-03 | Phase 87 | Pending |
| TEST-04 | Phase 87 | Pending |
| PERF-01 | Phase 87 | Pending |

**Coverage:** 18/18 requirements mapped (100%) — no orphans, no duplicates.

**Per-phase totals:**
- Phase 85 — Off-thread sampling refactor: 8 requirements (SAMP-01..04, SEM-01, SEM-02, SEM-03, SEM-05)
- Phase 86 — Frame-driven opacity rendering: 5 requirements (FADE-01..04, SEM-04)
- Phase 87 — Verification & performance acceptance: 5 requirements (TEST-01..04, PERF-01)
