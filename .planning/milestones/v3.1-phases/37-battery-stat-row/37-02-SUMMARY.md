---
phase: 37-battery-stat-row
plan: 02
subsystem: ui
tags: [wpf, xaml, battery, stats-panel, tray-menu, settings-persistence]

requires:
  - phase: 37-01
    provides: BatteryPercent/IsPluggedIn properties on StatsService, BatteryVisible on AppSettings

provides:
  - BattRow XAML element (BattLabel/BattBar/BattBarTrack/BattText) below PagRow in stats panel
  - Battery display logic: N/A when no battery, percentage + lightning bolt when AC connected
  - "Show BATT" tray menu item with live checkmark sync
  - BatteryVisible persisted to settings.json and restored on launch (default true)
  - Auto-collapse when all five stat rows (CPU/GPU/MEM/PAG/BATT) are hidden

affects: [38-tests-cleanup, 39-docs-pass]

tech-stack:
  added: []
  patterns:
    - "BattRow wired identically to PagRow: XAML grid, UpdateStatsDisplay, ApplySettings, SaveSettings, GetCurrentTrayState, SetStatRowVisible, ApplyDisplayColor, ApplyTheme, TrayMenuBuilder"

key-files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml
    - FuzzyClock.App/MainWindow.xaml.cs
    - FuzzyClock.App/TrayMenuBuilder.cs

key-decisions:
  - "Lightning bolt (U+26A1) appended as literal character to percentage text when IsPluggedIn == true (e.g. '72% ⚡')"
  - "No-battery sentinel is BatteryPercent == -1f; shows empty bar and N/A text without exception"
  - "Auto-collapse check extended from four to five rows to include BattRow"

patterns-established:
  - "PAG pattern: copy XAML + all 8 MainWindow.xaml.cs sites + TrayMenuBuilder sites for each new stat row"

requirements-completed: [BATT-01, BATT-02, BATT-03, BATT-04, BATT-05]

duration: 3min
completed: 2026-03-07
---

# Phase 37 Plan 02: Battery Stat Row UI Summary

**BATT row wired end-to-end: XAML layout below PAG, tray "Show BATT" toggle with checkmark sync, BatteryPercent display with AC lightning bolt, N/A on no-battery machines, BatteryVisible persisted in settings.json**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-07T06:56:55Z
- **Completed:** 2026-03-07T06:59:47Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- BattRow Grid element added to MainWindow.xaml after PagRow with identical column layout (label/bar/text)
- UpdateStatsDisplay wired: empty bar + "N/A" when BatteryPercent == -1f; percentage + " ⚡" suffix when IsPluggedIn; bar width proportional to charge
- All 8 MainWindow.xaml.cs integration sites updated (ApplySettings, SaveSettings, GetCurrentTrayState, TrayMenuCallbacks wiring, SetStatRowVisible auto-collapse, ApplyDisplayColor, ApplyTheme)
- TrayMenuBuilder fully updated: TrayMenuState.BatteryVisible, TrayMenuCallbacks.ToggleBattVisible, _battVisible item in Stats submenu between PAG and Uptime, SyncCheckmarks sets _battVisible.Checked
- All 114 tests pass (0 failures, 0 errors)

## Task Commits

Each task was committed atomically:

1. **Task 1 + 2: Wire battery stat row end-to-end** - `399f493` (feat)

_Note: Tasks 1 and 2 were committed together because TrayMenuCallbacks.ToggleBattVisible (Task 2) is a required property referenced in the MainWindow.xaml.cs wiring (Task 1), making them an atomic compilation unit._

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `FuzzyClock.App/MainWindow.xaml` - Added BattRow Grid with BattLabel/BattBar/BattBarTrack/BattText after PagRow
- `FuzzyClock.App/MainWindow.xaml.cs` - All 8 integration sites updated for battery row
- `FuzzyClock.App/TrayMenuBuilder.cs` - TrayMenuState.BatteryVisible, TrayMenuCallbacks.ToggleBattVisible, _battVisible item, SyncCheckmarks

## Decisions Made

- Tasks 1 and 2 committed atomically because the `required` property `ToggleBattVisible` on `TrayMenuCallbacks` (Task 2) must be present for the MainWindow.xaml.cs wiring (Task 1) to compile. Split commits would have resulted in a broken build state between them.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Battery stat row fully functional end-to-end
- Phase 38 (Tests + Code Cleanup) ready to proceed: DateFormatter extraction, AppSettings round-trip tests for BatteryVisible and date fields

---
*Phase: 37-battery-stat-row*
*Completed: 2026-03-07*
