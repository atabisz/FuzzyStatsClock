---
phase: 17-context-aware-font-size-menu
plan: 01
subsystem: ui
tags: [wpf, xaml, context-menu, dial-mode, font-size, menu-visibility]

# Dependency graph
requires:
  - phase: 16-dial-face-decorations
    provides: DIAL-09 pattern — MenuDialFace.Visibility controlled from ContextMenu_Opened and SetDialMode; MenuFontSize mirrors this
provides:
  - Font Size submenu hidden in dial mode (contextually irrelevant there)
  - Font Size submenu restored on return to phrase mode
  - x:Name="MenuFontSize" on Font Size MenuItem for code-behind access
affects: [future context-menu phases, any phase touching SetDialMode or ContextMenu_Opened]

# Tech tracking
tech-stack:
  added: []
  patterns: [MENU-01 — inverse of DIAL-09: phrase-mode-only menu items hidden via Visibility.Collapsed in dial mode, synced in both ContextMenu_Opened and SetDialMode]

key-files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "MENU-01 mirrors DIAL-09 exactly with inverted logic: dialMode ? Collapsed : Visible (vs Visible : Collapsed for dial-only items)"
  - "Sync in both ContextMenu_Opened (every-open guard) and SetDialMode (immediate update on toggle) — same two-hook pattern as DIAL-09"
  - "ApplySettings() deliberately not touched — font size preference (_currentFontSize) is unaffected by mode switches"

patterns-established:
  - "MENU-01: phrase-mode-only menu items use MenuFontSize.Visibility = dialMode ? Collapsed : Visible in both ContextMenu_Opened and SetDialMode"

requirements-completed: [MENU-01]

# Metrics
duration: 1min
completed: 2026-02-26
---

# Phase 17 Plan 01: Context-Aware Font Size Menu Summary

**Font Size submenu hidden in dial mode via MENU-01 pattern (inverse of DIAL-09), synced in ContextMenu_Opened and SetDialMode with x:Name="MenuFontSize"**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-26T10:30:21Z
- **Completed:** 2026-02-26T10:31:30Z
- **Tasks:** 1 of 1
- **Files modified:** 2

## Accomplishments

- Added `x:Name="MenuFontSize"` to the Font Size MenuItem in MainWindow.xaml for code-behind access
- Added `MenuFontSize.Visibility = _dialMode ? Collapsed : Visible` in `ContextMenu_Opened` (synced on every menu open)
- Added `MenuFontSize.Visibility = dialMode ? Collapsed : Visible` in `SetDialMode` (immediate update on mode toggle)
- Build: 0 errors, 0 warnings. 51 tests pass.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add x:Name to Font Size MenuItem and wire MenuFontSize.Visibility in code-behind** - `1f6db55` (feat)

**Plan metadata:** (docs commit — see final commit hash below)

## Files Created/Modified

- `FuzzyClock.App/MainWindow.xaml` - Added `x:Name="MenuFontSize"` to Font Size parent MenuItem
- `FuzzyClock.App/MainWindow.xaml.cs` - Added `MenuFontSize.Visibility` assignments in `ContextMenu_Opened` and `SetDialMode`

## Decisions Made

- Used inverse of DIAL-09 logic (`dialMode ? Collapsed : Visible`) so Font Size is phrase-mode-only, while Dial Face is dial-mode-only
- Chose the same two-hook placement (ContextMenu_Opened + SetDialMode) to guarantee consistency whether the mode switch happens before or while the menu is open
- Did not touch `ApplySettings()` — menus don't exist pre-Show and font size preference is stored in `_currentFontSize` which SetDialMode never modifies

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 17 complete. Font Size submenu is now context-aware: hidden in dial mode, visible in phrase mode.
- No blockers. v1.9 Context-Aware Menus milestone is now complete.

---
*Phase: 17-context-aware-font-size-menu*
*Completed: 2026-02-26*

## Self-Check: PASSED

- FOUND: FuzzyClock.App/MainWindow.xaml
- FOUND: FuzzyClock.App/MainWindow.xaml.cs
- FOUND: .planning/phases/17-context-aware-font-size-menu/17-01-SUMMARY.md
- FOUND: commit 1f6db55
