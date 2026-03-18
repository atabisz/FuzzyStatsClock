---
phase: 49-fixes-edge-snapping
plan: 02
subsystem: ui
tags: [wpf, drag, edge-snap, phrase-reset, settings]

# Dependency graph
requires:
  - phase: 41-settings-window
    provides: PhraseStyle/PhraseLocale fields in AppSettings + SetLanguage() method
provides:
  - ResetToDefaults() fully resets _currentPhraseStyle and _currentPhraseLocale
  - SnapToEdge() helper called post-DragMove for 8px edge snapping
  - EdgeSnapThresholdPx constant (8.0)
affects: [any-phase-touching-drag-or-reset]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direct field assignment _currentPhraseStyle = Classic bypasses non-English SetPhraseStyle guard"
    - "SnapToEdge() is post-DragMove-only — never called from timers or resize paths"
    - "Screen.WorkingArea (not Screen.Bounds) for taskbar-aware edge geometry"

key-files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "Set _currentPhraseStyle directly in ResetToDefaults rather than calling SetPhraseStyle() — the SetPhraseStyle guard (StartsWith en-) would silently no-op on non-English systems"
  - "SnapToEdge called only post-DragMove, never from LocationChanged or timers — WM_MOVING hook is unreliable during DragMove modal loop"
  - "Screen.WorkingArea used for snap geometry so widget never slides under taskbar"
  - "EdgeSnapThresholdPx = 8.0 — intentional near-edge placements preserved beyond this distance"

patterns-established:
  - "Post-DragMove snap pattern: call helper immediately after _isDragging = false, before cross-monitor check and SaveSettings"

requirements-completed: [FIX-01, SNAP-01, SNAP-02, SNAP-03]

# Metrics
duration: 10min
completed: 2026-03-18
---

# Phase 49 Plan 02: Fixes + Edge Snapping Summary

**ResetToDefaults now fully resets phrase style/locale on all locales, and post-drag edge snapping snaps the widget flush to Screen.WorkingArea within 8px**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-18T00:00:00Z
- **Completed:** 2026-03-18T00:10:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- ResetToDefaults sets `_currentPhraseStyle = "Classic"` directly and calls `SetLanguage("auto")` — bypasses the non-English guard in `SetPhraseStyle()` so reset works correctly on fr/es/de/ja/pl systems
- `SnapToEdge()` private method added using `Screen.WorkingArea` (taskbar-excluded) with 8px threshold — snaps horizontally and vertically independently
- `SnapToEdge()` wired to `Grid_MouseLeftButtonDown` immediately after `_isDragging = false`, before the cross-monitor check and `SaveSettings()`
- All 224 tests pass (199 Core + 25 App)

## Task Commits

Each task was committed atomically:

1. **Task 1: Complete ResetToDefaults with phrase style and locale reset (FIX-01)** - `d4a0ecb` (fix)
2. **Task 2: Add SnapToEdge helper and call post-DragMove (SNAP-01/02/03)** - `72c4c2c` (feat)

## Files Created/Modified
- `FuzzyClock.App/MainWindow.xaml.cs` - ResetToDefaults phrase reset + EdgeSnapThresholdPx constant + SnapToEdge() method + call site in Grid_MouseLeftButtonDown

## Decisions Made
- Set `_currentPhraseStyle` directly rather than via `SetPhraseStyle()`: the guard `!CurrentLocale.StartsWith("en-")` would silently no-op on non-English systems, leaving the style unreset.
- `SnapToEdge()` is post-DragMove only: calling from `LocationChanged` or a timer would cause unexpected position changes during non-drag events.
- `Screen.WorkingArea` over `Screen.Bounds`: ensures the widget never overlaps the taskbar when snapping to the bottom or side where the taskbar lives.

## Deviations from Plan

None - plan executed exactly as written. The `ApplyCurrentSettings`/`BuildSettingsSnapshot` conditional was correctly omitted as those methods do not exist in the codebase.

## Issues Encountered
- Pre-existing time-dependent test failure (`HourWrap_QualifierAndEmphasis`) appeared on one run but passed on others — confirmed pre-existing by reverting changes and observing same failure. Not caused by this plan's changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- FIX-01, SNAP-01/02/03 requirements fully satisfied
- Phase 49 only had 2 plans; both are now complete
- Ready for Phase 50 (single-instance bring-to-front) or Phase 51 (Inno Setup installer)

---
*Phase: 49-fixes-edge-snapping*
*Completed: 2026-03-18*
