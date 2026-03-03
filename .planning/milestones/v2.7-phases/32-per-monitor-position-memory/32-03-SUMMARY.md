---
phase: 32-per-monitor-position-memory
plan: 03
subsystem: ui
tags: [wpf, monitors, settings, per-monitor, drag, position-restore]

# Dependency graph
requires:
  - phase: 32-01
    provides: MonitorService.GetCurrentMonitorKey/GetPrimaryMonitorKey/GetKeyForScreen, MonitorPosition record, AppSettings.MonitorPositions + LastActiveMonitor
  - phase: 32-02
    provides: SettingsService.Clamp(MonitorPosition,...) overloads, migration in Load(), Validate() null-guard
provides:
  - MainWindow wired for per-monitor position restore on startup and save on drag-end
  - Cross-monitor drag detection: clears source monitor entry before writing destination
  - FindScreenForKey helper for fallback-to-primary when saved monitor is disconnected
  - _settings cache field enabling record with-expression updates in SaveSettings
affects:
  - 33-auto-contrast (MainWindow has no more Left/Top flat references; all position via MonitorPositions)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ApplySettings caches _settings for use in SaveSettings record with-expression updates"
    - "SaveSettings: GetCurrentMonitorKey + dict copy + upsert via record with-expression"
    - "Cross-monitor drag: compare prevKey vs newKey before SaveSettings; remove prevKey from dict"
    - "FindScreenForKey: Screen.AllScreens.FirstOrDefault + GetKeyForScreen + fallback to PrimaryScreen"
    - "ContentRendered: FindScreenForKey(_currentMonitorKey) for monitor-aware startup clamp"
    - "All Clamp sites: Screen.FromPoint(center) instead of virtual screen Clamp(AppSettings,...)"

key-files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml.cs
    - FuzzyClock.App.Tests/AppSettingsTests.cs

key-decisions:
  - "_settings cached in ApplySettings (before Show()) so SaveSettings can use record with-expression without constructing new AppSettings from scratch"
  - "Cross-monitor drag removes source entry so the old monitor position doesn't persist after move; destination is written by SaveSettings() immediately after"
  - "FindScreenForKey uses MonitorService.GetKeyForScreen to match keys — same logic as key construction, so round-trips correctly"
  - "ResetToDefaults clears all MonitorPositions (clean slate) and sets _currentMonitorKey = primary so next SaveSettings writes to primary"
  - "AppSettingsTests updated to use MonitorPositions dict instead of removed Left/Top fields; added STEST-03 for missing MonitorPositions default"

patterns-established:
  - "Position save: GetCurrentMonitorKey -> copy dict -> upsert -> _settings with { MonitorPositions = ..., LastActiveMonitor = ... } -> SettingsService.Save"
  - "Position restore: TryGetValue(LastActiveMonitor) -> apply Left/Top -> cache _currentMonitorKey -> ContentRendered clamps to FindScreenForKey result"

requirements-completed: [MON-01, MON-02, MON-03]

# Metrics
duration: 3min
completed: 2026-03-03
---

# Phase 32 Plan 03: MainWindow Per-Monitor Position Wiring Summary

**MainWindow fully wired for per-monitor position save/restore: startup restores from MonitorPositions[LastActiveMonitor], drag-end saves to current monitor key, cross-monitor drag clears source entry, all Clamp sites use monitor-aware Screen overload**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-03T02:57:02Z
- **Completed:** 2026-03-03T03:00:22Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- ApplySettings now restores Left/Top from `MonitorPositions[LastActiveMonitor]` and caches `_settings` for SaveSettings
- SaveSettings uses `_settings with { ... }` record expression to preserve existing MonitorPositions entries while upserting current monitor
- Grid_MouseLeftButtonDown detects cross-monitor drag (prevKey != newKey) and removes source entry before SaveSettings
- ContentRendered uses `FindScreenForKey(_currentMonitorKey)` + `SettingsService.Clamp(MonitorPosition, ..., screen)` for monitor-aware startup clamping
- All 6 Clamp call sites updated from old `Clamp(AppSettings,...)` to new `Clamp(MonitorPosition,..., Screen.FromPoint(center))`
- ResetToDefaults sets `_currentMonitorKey = GetPrimaryMonitorKey()` and clears all MonitorPositions for clean slate
- Added `FindScreenForKey` private helper with fallback to PrimaryScreen when saved monitor is disconnected
- Updated AppSettingsTests: removed `Left/Top` field references (no longer in AppSettings), added STEST-03 for MonitorPositions default behavior
- Final test count: 78 (64 Core + 14 App) — all pass, 0 failures

## Task Commits

Each task was committed atomically:

1. **Task 1: Update MainWindow — ApplySettings, SaveSettings, drag handler, all Clamp call sites** - `39bb298` (feat)
2. **Task 2: Full build and test pass validation** - `39bb298` (same commit — no additional code changes required; build and tests passed after Task 1)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `FuzzyClock.App/MainWindow.xaml.cs` - Per-monitor position restore/save wiring: _currentMonitorKey + _settings fields, ApplySettings/SaveSettings rewritten, cross-monitor drag detection, FindScreenForKey helper, all Clamp sites updated, ResetToDefaults updated
- `FuzzyClock.App.Tests/AppSettingsTests.cs` - Updated STEST-01 to use MonitorPositions dict; updated STEST-02 JSON (old Left/Top removed); added STEST-03 for MonitorPositions absent default

## Decisions Made
- `_settings` field cached in `ApplySettings` so `SaveSettings` can use record `with`-expression rather than constructing a fresh `new AppSettings { ... }`. This preserves all fields not explicitly updated (especially `AutoLaunchEnabled`, `GhostModeEnabled`) and future-proofs for additional fields.
- Cross-monitor drag detection compares `prevKey` (captured before `DragMove()`) vs `newKey` (after `DragMove()`). When different, source key is removed from a copy of the dict before `SaveSettings()` writes the destination. This ensures a clean per-monitor mapping with no stale entries.
- `FindScreenForKey` uses `MonitorService.GetKeyForScreen` for key matching to ensure the same deduplication logic used at write time is used at lookup time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated AppSettingsTests to remove Left/Top field references**
- **Found during:** Task 1 (initial build after MainWindow changes)
- **Issue:** `AppSettingsTests.cs` (STEST-01 and STEST-02) referenced `AppSettings.Left` and `AppSettings.Top` which were removed in Plan 01. Plan 03 caused build errors when the test project was compiled.
- **Fix:** Rewrote STEST-01 to use `MonitorPositions` dictionary assertions (Left/Top of the dict entry). Updated STEST-02 JSON to omit old fields (System.Text.Json silently ignores unknown fields). Added new STEST-03 verifying `MonitorPositions` defaults to empty dict when absent.
- **Files modified:** `FuzzyClock.App.Tests/AppSettingsTests.cs`
- **Verification:** Build succeeded with 0 errors; all 78 tests pass
- **Committed in:** `39bb298` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Required fix — AppSettingsTests had stale references to removed AppSettings fields. Fix updated tests to match current schema and added STEST-03 for completeness. No scope creep.

## Issues Encountered
None beyond the auto-fixed AppSettingsTests update.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 32 complete: MonitorService (Plan 01), SettingsService migration + Clamp overloads (Plan 02), MainWindow wiring (Plan 03)
- Per-monitor position memory is fully functional end-to-end
- Phase 33 (auto-contrast) can proceed; no MainWindow position API dependencies remain to change

## Self-Check: PASSED

- FOUND: `FuzzyClock.App/MainWindow.xaml.cs`
- FOUND: `FuzzyClock.App.Tests/AppSettingsTests.cs`
- FOUND commit `39bb298` (Task 1 + 2)
- Build: 0 errors (Debug + Release)
- Tests: 78 passed, 0 failed

---
*Phase: 32-per-monitor-position-memory*
*Completed: 2026-03-03*
