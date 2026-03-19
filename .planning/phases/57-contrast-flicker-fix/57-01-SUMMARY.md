---
phase: 57-contrast-flicker-fix
plan: 01
subsystem: ui
tags: [auto-contrast, win32, pinvoke, z-order, contrast-flicker]

# Dependency graph
requires:
  - phase: 33-auto-contrast
    provides: ContrastRefreshController 500ms sampling loop and ContrastService hysteresis state machine
provides:
  - Z-order walk guard in ContrastRefreshController.Tick preventing sampling over empty desktop
  - HasAppWindowBeneath helper detecting shell-only windows beneath widget footprint
affects: [auto-contrast, contrast-flicker, backdrop, ghost-mode]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Z-order walk guard: GetWindow(GW_HWNDNEXT) + GetClassName shell-class check before BitBlt sampling"
    - "P/Invoke declarations private static in consuming class (established codebase pattern)"

key-files:
  created: []
  modified:
    - FuzzyClock.App/ContrastRefreshController.cs

key-decisions:
  - "Skip sampling entirely (return; with no _contrastState mutation) when only Progman/WorkerW/SysListView32 beneath widget — holds hysteresis state stable over empty desktop"
  - "Store _hwnd field set in Initialize via WindowInteropHelper — avoids per-tick allocation and matches GhostModeController pattern"
  - "Manual RECT overlap check (4 inequalities) instead of IntersectRect — avoids extra P/Invoke import, logically equivalent"
  - "Shell classes: exactly Progman, WorkerW, SysListView32 — per user locked decision in 57-CONTEXT.md"

patterns-established:
  - "HasAppWindowBeneath pattern: seed Z-order walk with GetWindow(widgetHwnd, GW_HWNDNEXT) to skip widget itself; check IsWindowVisible before rect/class tests"

requirements-completed: [FIX-01, FIX-02, FIX-03]

# Metrics
duration: 8min
completed: 2026-03-19
---

# Phase 57 Plan 01: Contrast Flicker Fix Summary

**Win32 Z-order walk guard in ContrastRefreshController.Tick eliminates contrast oscillation feedback loop over empty desktop by skipping BitBlt sampling when only shell windows (Progman, WorkerW, SysListView32) are beneath the widget**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-19T00:00:00Z
- **Completed:** 2026-03-19
- **Tasks:** 2 automated + 1 pending human-verify checkpoint
- **Files modified:** 1

## Accomplishments
- Added `HasAppWindowBeneath` private static helper: walks Z-order from widget HWND downward via `GetWindow(GW_HWNDNEXT)`, checks `IsWindowVisible`, rect overlap, and class name against shell whitelist
- Added `Overlaps` helper: four-inequality RECT intersection check (no extra P/Invoke)
- Added P/Invoke declarations: `GetWindow`, `IsWindowVisible`, `GetWindowRect`, `GetClassName` (CharSet.Auto) plus `RECT` struct and `GW_HWNDNEXT = 2`
- Stored `_hwnd` field set in `Initialize` via `WindowInteropHelper` — reuses established `GhostModeController` pattern
- Guard inserted in `Tick` between DPI-coordinate computation and `ContrastSamplerService.Sample` call — holds `_contrastState` stable on skip (no mutation)
- All 274 existing tests pass (249 Core + 25 App), 0 regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Z-order walk guard to ContrastRefreshController** - `9c786c1` (fix)
2. **Task 2: Run full test suite to confirm no regression** - `aa1b79b` (test)
3. **Task 3: Manual verification of contrast stability** - Pending human-verify checkpoint

## Files Created/Modified
- `FuzzyClock.App/ContrastRefreshController.cs` - Added HasAppWindowBeneath Z-order guard, Overlaps helper, 4 P/Invoke declarations, RECT struct, _hwnd field, HWND storage in Initialize

## Decisions Made
- Skip sampling entirely on empty-desktop detection (return without modifying _contrastState) to preserve hysteresis state built from prior valid app-window samples
- Store _hwnd in Initialize field (not computed per-tick) — window HWND is stable post-Show, avoids per-tick WindowInteropHelper allocation
- Shell class whitelist is exactly three strings: Progman, WorkerW, SysListView32 (locked in 57-CONTEXT.md)
- Manual overlap check preferred over IntersectRect to keep P/Invoke surface minimal

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Automated implementation complete; awaiting manual verification (Task 3 checkpoint)
- Once user confirms FIX-01, FIX-02, FIX-03 pass, milestone v3.6.1 is complete
- No blockers

---
*Phase: 57-contrast-flicker-fix*
*Completed: 2026-03-19*
