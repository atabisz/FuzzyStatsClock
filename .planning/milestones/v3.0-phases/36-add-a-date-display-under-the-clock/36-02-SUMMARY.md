---
phase: 36-add-a-date-display-under-the-clock
plan: 02
subsystem: ui
tags: [tray-menu, date-display, winforms, settings-persistence]

# Dependency graph
requires:
  - phase: 36-01
    provides: DateText, _showDate/_dateFormat fields, UpdateDateDisplay(), TrayMenuState stubs
provides:
  - Show Date checkable tray menu item wired to SetDateVisible()
  - Date Format submenu (Short/Long/Numeric/ISO) wired to SetDateFormat()
  - SetDateVisible() and SetDateFormat() helpers in MainWindow.xaml.cs
  - SyncCheckmarks coverage for all 5 new date-related items
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ToggleDateVisible pattern: Dispatcher.Invoke(() => SetDateVisible(DateText.Visibility != Visibility.Visible))"
    - "SetDateFormat clears _currentDateText change-guard to force redraw on format switch within same day"

key-files:
  created: []
  modified:
    - FuzzyClock.App/TrayMenuBuilder.cs
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "SetDateFormat clears _currentDateText to force UpdateDateDisplay to re-render even when the calendar date hasn't changed (same day, format switch)"
  - "ToggleDateVisible uses DateText.Visibility != Visibility.Visible for toggle logic — consistent with ToggleStatsVisible pattern"

patterns-established:
  - "Date helpers (SetDateVisible/SetDateFormat) follow exact same SaveSettings() pattern as SetUptimeRowVisible and SetTextStyle"

requirements-completed: [DATE-01]

# Metrics
duration: 2min
completed: 2026-03-07
---

# Phase 36 Plan 02: Tray Menu Integration (Show Date + Date Format) Summary

**Show Date toggle and Date Format submenu wired into tray ContextMenuStrip with full SyncCheckmarks coverage**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-07T03:23:56Z
- **Completed:** 2026-03-07T03:24:42Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `TrayMenuCallbacks` extended with `ToggleDateVisible` and `SetDateFormat` required actions
- `TrayMenuBuilder` gains 5 new fields (`_showDateItem` + 4 format items), bringing total to 43 ToolStripMenuItem references
- Show Date checkable item and Date Format submenu (Short/Long/Numeric/ISO) inserted in Build() after Auto-Contrast separator
- `SyncCheckmarks()` covers all 5 new items, synced from `TrayMenuState.ShowDate` and `TrayMenuState.DateFormat`
- `SetDateVisible()` and `SetDateFormat()` helpers added to MainWindow — follow established SaveSettings() pattern
- `ToggleDateVisible` and `SetDateFormat` wired in `TrayMenuCallbacks` initializer in `ContentRendered`
- 114 tests pass, 0 failures

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend TrayMenuBuilder with Show Date and Date Format submenu** - `9f6f786` (feat)
2. **Task 2: Wire date callbacks in MainWindow and run full test suite** - `4f81fbe` (feat)

## Files Created/Modified

- `FuzzyClock.App/TrayMenuBuilder.cs` - ToggleDateVisible/SetDateFormat actions in TrayMenuCallbacks; 5 new fields; Show Date + Date Format items in Build(); SyncCheckmarks; comment updated to 43
- `FuzzyClock.App/MainWindow.xaml.cs` - SetDateVisible() and SetDateFormat() helpers; ToggleDateVisible and SetDateFormat wired in TrayMenuCallbacks initializer

## Decisions Made

- `SetDateFormat()` clears `_currentDateText` to force `UpdateDateDisplay()` to re-render even when calendar date unchanged — ensures immediate feedback when user switches formats mid-day
- `ToggleDateVisible` uses `DateText.Visibility != Visibility.Visible` for toggle — consistent with existing `ToggleStatsVisible` pattern throughout the callbacks block

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The `dotnet build` with `-q` flag reports stale cache file warnings as errors in the tail output. Building without `-q` confirmed the build succeeded cleanly. This is the same known transient MSBuild cache file issue documented in 36-01-SUMMARY.

The test count is 114 (not 88 as expected in the plan). The suite has grown since the documented baseline — all tests pass, 0 failures.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 36 is complete: date display (Plan 01) + tray menu integration (Plan 02) fully shipped
- The date feature is end-to-end: DateText visible by default, Show Date toggle in tray, Date Format submenu with Short/Long/Numeric/ISO, all persisted via AppSettings/SettingsService
- Ready for `/gsd:complete-milestone` or next milestone planning

---
*Phase: 36-add-a-date-display-under-the-clock*
*Completed: 2026-03-07*
