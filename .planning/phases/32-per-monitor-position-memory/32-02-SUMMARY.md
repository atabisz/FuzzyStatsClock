---
phase: 32-per-monitor-position-memory
plan: 02
subsystem: settings
tags: [settings, per-monitor, migration, clamping, json]

# Dependency graph
requires:
  - phase: 32-01
    provides: MonitorService + AppSettings schema (MonitorPositions dict, LastActiveMonitor, MonitorPosition record)
provides:
  - SettingsService updated to persist and migrate per-monitor positions
  - Migration path from old Left/Top JSON to MonitorPositions[primaryKey]
  - Clamp(MonitorPosition,...) overloads replacing old Clamp(AppSettings,...) overloads
  - Tests for new Clamp(MonitorPosition,...) and Defaults() assertions
affects:
  - 32-03 (MainWindow wiring uses new SettingsService.Clamp(MonitorPosition,...) and migration path)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "JsonDocument pre-parse for old field detection before Deserialize (migration probe pattern)"
    - "Pure Clamp overload with explicit bounds for unit-test safety (no WinForms/WPF dependency)"

key-files:
  created: []
  modified:
    - FuzzyClock.App/SettingsService.cs
    - FuzzyClock.App.Tests/SettingsServiceTests.cs

key-decisions:
  - "Migrate old Left/Top to MonitorPositions[primaryKey] only when Left != -1 (old no-position sentinel)"
  - "JsonDocument.Parse used only for detecting old fields; Deserialize<AppSettings> handles the actual parse (ignores unknown Left/Top fields)"
  - "Clamp(MonitorPosition,...) uses Screen.WorkingArea not Bounds to respect taskbar"
  - "Pure Clamp overload (double bounds) has no WinForms reference for safe unit test usage"

patterns-established:
  - "Migration probe: use JsonDocument.TryGetProperty before Deserialize to detect legacy field presence"
  - "Validate() includes MonitorPositions null-guard matching existing Opacity/AccentColor guard pattern"

requirements-completed: [MON-02, MON-03]

# Metrics
duration: 2min
completed: 2026-03-03
---

# Phase 32 Plan 02: SettingsService Per-Monitor Schema Summary

**SettingsService rewritten with JsonDocument migration from old Left/Top JSON, new Clamp(MonitorPosition,...) overloads, and 5 new test cases covering per-monitor clamping and Defaults()**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-03T02:52:10Z
- **Completed:** 2026-03-03T02:54:10Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Defaults() returns AppSettings with empty MonitorPositions dict and LastActiveMonitor=""
- Validate() adds null-guard for MonitorPositions (consistent with existing guards)
- Load() migrates old Left/Top JSON to MonitorPositions[primaryKey] when Left != -1
- Old Clamp(AppSettings,...) overloads removed; new Clamp(MonitorPosition,...) overloads added
- SettingsServiceTests updated: 2 Clamp tests use new MonitorPosition signature; 4 new tests added (3 DataRow + 1 Defaults)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite SettingsService — Defaults, Validate, migration, new Clamp overloads** - `de0fe11` (feat)
2. **Task 2: Update SettingsServiceTests — fix Defaults assertions, add MonitorPosition Clamp tests** - `1bce537` (test)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `FuzzyClock.App/SettingsService.cs` - Rewritten: migration in Load(), new Clamp(MonitorPosition,...) overloads, updated Defaults(), null-guard in Validate()
- `FuzzyClock.App.Tests/SettingsServiceTests.cs` - Updated: Clamp tests use MonitorPosition; 4 new test methods added

## Decisions Made
- Migrate old Left/Top to primary monitor key only when Left != -1 (old sentinel value meaning "no saved position"). When Left == -1, just return Defaults() migration-free.
- JsonDocument.Parse for migration probe is separate from JsonSerializer.Deserialize; Deserialize silently ignores unknown Left/Top fields in new AppSettings, so pre-parse is only for reading the old values before they are discarded.
- Used Screen.WorkingArea in the Screen-accepting overload to respect taskbar placement; pure bounds overload leaves the choice to the caller.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. All MainWindow.xaml.cs errors are expected (those are addressed in Plan 03).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SettingsService fully updated for per-monitor schema
- All non-MainWindow code compiles with 0 errors
- Ready for Plan 03: MainWindow.xaml.cs wiring (position save/restore logic using new SettingsService API)

---
*Phase: 32-per-monitor-position-memory*
*Completed: 2026-03-03*
