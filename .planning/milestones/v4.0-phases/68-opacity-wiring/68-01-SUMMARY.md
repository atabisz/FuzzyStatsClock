---
phase: 68-opacity-wiring
plan: 01
subsystem: ui
tags: [ghost-mode, opacity, proximity, contrast, wpf]

# Dependency graph
requires:
  - phase: 67-ghostmodecontroller-extension
    provides: GhostModeController with ProximityChanged, Restored, IsEnabled, GhostFadeRadiusPx
provides:
  - IsEnabled gate in GhostModeController.OnTimerTick (PROX-09)
  - _proximityRatio field in MainWindow wired to ProximityChanged callback
  - ProximityChanged drives this.Opacity via _windowOpacity * (1.0 - ratio) (D-04)
  - Drag guard in ProximityChanged handler (PROX-10)
  - Contrast skip predicate extended with _proximityRatio > 0.0 (PROX-11)
  - Legacy ghost activation block deleted from Window_MouseEnter (D-03)
affects: [69-ghost-settings-slider]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IsEnabled early-return gate: if (!IsEnabled) return; at top of OnTimerTick"
    - "ProximityChanged = ratio => { _proximityRatio = ratio; if (_isDragging) return; this.Opacity = _windowOpacity * (1.0 - ratio); }"
    - "_windowOpacity is NEVER modified in proximity handler; only this.Opacity is assigned"

key-files:
  created: []
  modified:
    - FuzzyClock.App/GhostModeController.cs
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "D-01: IsEnabled gate added at top of OnTimerTick — gates all proximity computation, events, and Activate() when ghost mode disabled"
  - "D-02: _proximityRatio field added to MainWindow between _isDragging and _ghostMode fields"
  - "D-03: Legacy ghost activation block deleted from Window_MouseEnter — timer-driven ProximityChanged now owns all opacity transitions"
  - "D-04: ProximityChanged = ratio => { ... } assigned after _ghostMode.Initialize() with drag guard and _windowOpacity * (1.0 - ratio)"
  - "D-05: _proximityRatio = 0.0 added as first line of Restored handler for clean state after cursor exits zone"
  - "D-06: Contrast skip predicate extended: _ghostMode.IsActive || _windowOpacity == 0.0 || _isDragging || _proximityRatio > 0.0"

patterns-established:
  - "_windowOpacity invariant: configured preference field is never overwritten by proximity or fade logic"
  - "Drag guard pattern: if (_isDragging) return; in any display-mutating callback"

requirements-completed: [PROX-09, PROX-10, PROX-11]

# Metrics
duration: 8min
completed: 2026-03-27
---

# Phase 68 Plan 01: Opacity Wiring Summary

**Proximity fade wired into MainWindow: IsEnabled gate in controller, ProximityChanged drives this.Opacity via linear fade formula, drag guard, and legacy snap-to-ghost block deleted**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-27T07:37:12Z
- **Completed:** 2026-03-27T07:45:22Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `if (!IsEnabled) return;` as first line of `GhostModeController.OnTimerTick` — PROX-09 fully gated at controller level with no MainWindow awareness needed
- Wired `_ghostMode.ProximityChanged` callback in MainWindow ContentRendered after `_ghostMode.Initialize()`: stores ratio, skips opacity update during drag (PROX-10), applies `_windowOpacity * (1.0 - ratio)` to `this.Opacity`
- Extended contrast skip predicate with `|| _proximityRatio > 0.0` so auto-contrast sampler skips during any fade state (PROX-11)
- Added `_proximityRatio = 0.0` to Restored handler to keep field in sync when cursor fully exits proximity zone
- Deleted 18-line legacy ghost activation block from `Window_MouseEnter` (synthetic cleanup + `_ghostMode.Activate()` + `this.Opacity = 0.0`) — timer-driven ProximityChanged now owns all transitions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add IsEnabled gate to GhostModeController.OnTimerTick** - `1621a35` (feat)
2. **Task 2: Wire ProximityChanged into MainWindow opacity and contrast predicate** - `6e3e29f` (feat)

## Files Created/Modified
- `FuzzyClock.App/GhostModeController.cs` - Added `if (!IsEnabled) return;` at top of OnTimerTick
- `FuzzyClock.App/MainWindow.xaml.cs` - Added _proximityRatio field, ProximityChanged handler, updated contrast predicate, updated Restored handler, deleted legacy ghost activation block

## Decisions Made
- `_windowOpacity` is never assigned in the ProximityChanged handler — only `this.Opacity` is modified, preserving the user's configured preference (SC-4)
- Drag guard uses existing `_isDragging` field — no new state, consistent with the contrast controller pattern
- `Activate()` method remains `public` on GhostModeController per D-07 (Phase 69 may demote to internal)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 68 complete: proximity fade is fully wired and visible to the user
- Phase 69 (Ghost Settings Slider) can proceed: add Settings slider for GhostFadeRadiusPx, live-wire `_ghostMode.GhostFadeRadiusPx = value` from slider

---
*Phase: 68-opacity-wiring*
*Completed: 2026-03-27*

## Self-Check: PASSED
- FOUND: .planning/phases/68-opacity-wiring/68-01-SUMMARY.md
- FOUND: FuzzyClock.App/GhostModeController.cs
- FOUND: FuzzyClock.App/MainWindow.xaml.cs
- FOUND: commit 1621a35 (Task 1)
- FOUND: commit 6e3e29f (Task 2)
