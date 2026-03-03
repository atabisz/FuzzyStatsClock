---
phase: 32-per-monitor-position-memory
plan: 01
subsystem: ui
tags: [wpf, win32, monitors, settings, p-invoke, querydisplayconfig]

# Dependency graph
requires:
  - phase: 31-auto-launch-at-login
    provides: AppSettings init-property record pattern, AutoLaunchEnabled field example
provides:
  - MonitorService static class with GetCurrentMonitorKey, GetPrimaryMonitorKey, GetKeyForScreen
  - MonitorPosition record type
  - AppSettings.MonitorPositions dictionary + LastActiveMonitor string
  - Removal of flat Left/Top from AppSettings
affects:
  - 32-02 (SettingsService migration)
  - 32-03 (MainWindow position restore/save wiring)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "QueryDisplayConfig P/Invoke for Win32 friendly monitor names with GDI fallback"
    - "Lazy _keyMap cache invalidated by Screen.AllScreens.Length change"
    - "Duplicate monitor name deduplication: first occurrence keeps bare name, subsequent get -2, -3"

key-files:
  created:
    - FuzzyClock.App/MonitorService.cs
  modified:
    - FuzzyClock.App/AppSettings.cs

key-decisions:
  - "Monitor keys are lowercased friendly names (e.g. 'dell u2720q'); GDI device name (e.g. 'display1') used as fallback when QueryDisplayConfig unavailable"
  - "Duplicate same-name monitors: first occurrence = bare name, second = name-2, third = name-3 (ordering by Screen.AllScreens index)"
  - "MonitorPositions dictionary uses string keys (required by System.Text.Json); LastActiveMonitor empty string = no saved monitor sentinel"
  - "Left/Top flat properties removed from AppSettings; compile errors in SettingsService and MainWindow are expected, fixed in Plans 02/03"

patterns-established:
  - "MonitorService.GetCurrentMonitorKey(window): compute center in device pixels, call Screen.FromPoint, then GetKeyForScreen"
  - "GetFriendlyNameForDevice: QueryDisplayConfig path enumeration + DisplayConfigGetDeviceInfo per path + GDI short name substring match"

requirements-completed: [MON-01]

# Metrics
duration: 5min
completed: 2026-03-03
---

# Phase 32 Plan 01: MonitorService + AppSettings Schema Summary

**QueryDisplayConfig-based MonitorService with friendly-name deduplication, plus AppSettings schema updated to Dictionary<string, MonitorPosition> per-monitor storage**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-03T02:47:46Z
- **Completed:** 2026-03-03T02:52:46Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created MonitorService with Win32 QueryDisplayConfig P/Invoke for friendly monitor names (e.g. "Dell U2720Q"), GDI fallback (e.g. "display1"), and -2/-3 suffix deduplication
- Added MonitorPosition record and MonitorPositions + LastActiveMonitor to AppSettings
- Removed flat Left/Top from AppSettings; downstream breaks in SettingsService and MainWindow are expected and scoped to Plans 02/03

## Task Commits

Each task was committed atomically:

1. **Task 1: Create MonitorService with friendly-name monitor identification** - `8e1997f` (feat)
2. **Task 2: Update AppSettings — add MonitorPositions and LastActiveMonitor, remove Left/Top** - `06c0a04` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `FuzzyClock.App/MonitorService.cs` - Static monitor identification service; GetCurrentMonitorKey, GetPrimaryMonitorKey, GetKeyForScreen, BuildKeyMap, GetFriendlyNameForDevice
- `FuzzyClock.App/AppSettings.cs` - Added MonitorPosition record, MonitorPositions dict, LastActiveMonitor; removed Left/Top

## Decisions Made
- QueryDisplayConfig is the primary Win32 path for friendly monitor names; falls back to stripped GDI device name (e.g. "display1") on any failure
- Duplicate monitor name handling: first occurrence = bare key, subsequent = key-2, key-3 (ordered by Screen.AllScreens index)
- LastActiveMonitor empty string is the "no saved monitor" sentinel (analogous to old Left=-1)
- Compile errors in SettingsService.cs (Clamp/Defaults reference Left/Top) and MainWindow.xaml.cs are expected; Plans 02 and 03 fix them

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MonitorService and AppSettings schema are complete
- Plan 02 must update SettingsService (Clamp, Defaults, migration) to eliminate Left/Top references
- Plan 03 must update MainWindow to call MonitorService.GetCurrentMonitorKey and restore from MonitorPositions

## Self-Check: PASSED

- FOUND: `FuzzyClock.App/MonitorService.cs`
- FOUND: `FuzzyClock.App/AppSettings.cs`
- FOUND: `.planning/phases/32-per-monitor-position-memory/32-01-SUMMARY.md`
- FOUND commit `8e1997f` (Task 1)
- FOUND commit `06c0a04` (Task 2)
- FOUND commit `acccb15` (docs metadata)

---
*Phase: 32-per-monitor-position-memory*
*Completed: 2026-03-03*
