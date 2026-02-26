---
phase: 15-unconditional-hover-backdrop
plan: 01
subsystem: ui
tags: [wpf, hover, backdrop, mouse-events]

# Dependency graph
requires:
  - phase: 14-hover-backdrop-drag-pause
    provides: Window_MouseEnter/MouseLeave handlers with backdrop and fast-refresh logic; ContentBorder.Background pattern
provides:
  - Window_MouseEnter: backdrop assignment is first statement, unconditional; StatsPanel.Visibility guard retained only for fast-refresh block
affects:
  - 16-dial-face-decorations

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Separation of concerns in mouse event handlers: backdrop logic (always runs) separated from stats-specific logic (guarded)"

key-files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "Backdrop is a general hover affordance, not a stats-specific feature — decoupled from StatsPanel.Visibility guard"
  - "StatsPanel.Visibility guard retained in Window_MouseEnter to gate only the _statsTimer fast-refresh block (Phase 12 behavior preserved)"
  - "Window_MouseLeave left unchanged — it already clears backdrop unconditionally (correct since Phase 14)"

patterns-established:
  - "Handler ordering pattern: unconditional side-effects first, guarded side-effects after early-return guards"

requirements-completed:
  - BACK-04

# Metrics
duration: 5min
completed: 2026-02-26
---

# Phase 15 Plan 01: Unconditional Hover Backdrop Summary

**Decoupled hover backdrop from stats guard in Window_MouseEnter — ContentBorder.Background set unconditionally as first statement, before StatsPanel.Visibility early-return**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-26
- **Completed:** 2026-02-26
- **Tasks:** 2 (1 auto + 1 checkpoint:human-verify)
- **Files modified:** 1

## Accomplishments

- Moved `ContentBorder.Background` assignment to be the first statement in `Window_MouseEnter`, before any visibility guard
- Backdrop (`#59000000`, ~35% black) now shows on hover regardless of stats panel state
- `StatsPanel.Visibility` guard retained — it gates only the `_statsTimer` fast-refresh block (Phase 12 behavior unchanged)
- `Window_MouseLeave` left untouched — it already clears backdrop unconditionally
- All three BACK-04 success criteria confirmed by human verification

## Task Commits

1. **Task 1: Restructure Window_MouseEnter — backdrop before stats guard** - `628061e` (feat)

**Plan metadata:** _(docs commit — this summary)_

## Files Created/Modified

- `FuzzyClock.App/MainWindow.xaml.cs` — `Window_MouseEnter` restructured: backdrop assignment moved to first statement; stats guard now gates only fast-refresh block

## Decisions Made

- Backdrop is a general hover affordance (not a stats feature) — it belongs before any stats-specific guard. Phase 14 inadvertently tied them via a shared early-return; Phase 15 decouples them.
- `Window_MouseLeave` required no change: it was already unconditional (backdrop clears before the stats guard check) since Phase 14.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 16 (Dial Face Decorations) can proceed: BACK-04 complete, v1.8 hover behavior fully correct
- No blockers

---
*Phase: 15-unconditional-hover-backdrop*
*Completed: 2026-02-26*
