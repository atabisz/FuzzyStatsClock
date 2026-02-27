---
phase: 14-hover-backdrop-drag-pause
plan: 01
subsystem: ui
tags: [wpf, xaml, mouseevent, dispatchertimer, drag, backdrop, transparency]

# Dependency graph
requires:
  - phase: 12-hover-fast-refresh
    provides: Window_MouseEnter/Window_MouseLeave handlers guarded by StatsPanel visibility
  - phase: 13-dial-mode
    provides: Full MainWindow.xaml.cs wiring including _statsTimer and DragMove

provides:
  - Hover-conditional semi-transparent backdrop (#59000000) on ContentBorder when stats visible
  - Stats timer pause during drag (DragMove blocking loop) with resume after release
  - Hardcoded Border background (#26000000) removed — transparent by default

affects: [any future phase touching MainWindow.xaml ContentBorder or Grid_MouseLeftButtonDown]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Extend existing MouseEnter/MouseLeave handlers rather than adding new event wires — add backdrop logic after existing fast-refresh logic"
    - "Guard DragMove() with bool wasRunning flag — only restart timer if it was already running, never start timer for hidden stats"
    - "Code-behind drives transparent-by-default Border — XAML sets Background=Transparent, C# sets #59000000 on hover, Transparent on leave"

key-files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "Alpha 0x59 (89/255 ≈ 35%) chosen for backdrop — visible on both light and dark wallpapers without obscuring content"
  - "Remove hardcoded #26000000 from XAML Border; transparent by default; code-behind owns conditional backdrop state"
  - "Bool statsTimerWasRunning flag pattern for DragMove guard — prevents accidentally starting timer when stats are hidden"
  - "Window_MouseLeave always restores Transparent even without the StatsPanel.Visibility guard on backdrop (backdrop must clear regardless)"

patterns-established:
  - "Extend not replace: Phase 12 hover handlers extended with backdrop logic rather than rewritten"
  - "DragMove guard pattern: bool flag before blocking Win32 call, conditional restart after"

requirements-completed: [BACK-01, BACK-02, BACK-03, DRAG-01]

# Metrics
duration: 5min
completed: 2026-02-26
---

# Phase 14 Plan 01: Hover Backdrop + Drag Pause Summary

**Hover-conditional #59000000 WPF backdrop on ContentBorder when stats visible, with _statsTimer stop/start guard around DragMove() — all four v1.7 requirements (BACK-01/02/03, DRAG-01) human-verified**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-26
- **Completed:** 2026-02-26
- **Tasks:** 2 (1 auto + 1 checkpoint)
- **Files modified:** 2

## Accomplishments

- Removed hardcoded `#26000000` Border background from MainWindow.xaml — widget now transparent by default on all wallpapers
- Extended `Window_MouseEnter` and `Window_MouseLeave` to set/clear `ContentBorder.Background` (#59000000 / Transparent) conditional on stats panel visibility
- Added `statsTimerWasRunning` flag guard in `Grid_MouseLeftButtonDown` — stops `_statsTimer` before `DragMove()`, restarts after only if it was running
- All four behavioral requirements confirmed by human verification: hover backdrop shows/clears correctly, drag pause freezes stats and resumes on release

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove hardcoded Border background and wire hover backdrop + drag pause** - `21396d3` (feat)
2. **Task 2: Human verify all 4 criteria (BACK-01/02/03, DRAG-01)** - checkpoint: approved by user

**Plan metadata:** (this commit — docs: complete plan)

## Files Created/Modified

- `FuzzyClock.App/MainWindow.xaml` — Added `x:Name="ContentBorder"` to Border at Grid.Row="0"; changed `Background="#26000000"` to `Background="Transparent"`
- `FuzzyClock.App/MainWindow.xaml.cs` — Extended `Window_MouseEnter` with backdrop set; extended `Window_MouseLeave` with backdrop clear; added `statsTimerWasRunning` guard in `Grid_MouseLeftButtonDown` around `DragMove()`

## Decisions Made

- Alpha 0x59 (89/255 ≈ 35%) chosen for the backdrop — visible on both light and dark wallpapers without obscuring the time phrase or stat values
- `Window_MouseLeave` always restores `Transparent` regardless of stats visibility — this prevents stale backdrop if stats are hidden while mouse is over widget
- Bool flag pattern (`statsTimerWasRunning`) used for DragMove guard — null-safe (`_statsTimer?.IsEnabled ?? false`), prevents accidentally starting timer when stats are hidden

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- v1.7 Visual Polish milestone complete: all four requirements (BACK-01/02/03, DRAG-01) shipped and verified
- No blockers. Widget is transparent by default, shows hover backdrop with stats visible, pauses stats during drag — ready for next milestone planning

---
*Phase: 14-hover-backdrop-drag-pause*
*Completed: 2026-02-26*
