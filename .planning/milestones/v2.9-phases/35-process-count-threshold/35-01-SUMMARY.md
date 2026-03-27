---
phase: 35-process-count-threshold
plan: 01
subsystem: ui
tags: [wpf, tray-menu, settings, process-count, threshold]

# Dependency graph
requires:
  - phase: 34-uptime-docs
    provides: "{N}p process count on uptime line using hardcoded pct >= 5.0"
provides:
  - ProcessCountThresholdPercent init property in AppSettings (default 5.0)
  - Three checkable items "Process Threshold: 2%/5%/10%" in tray Stats submenu
  - SetProcessThreshold(double) method in MainWindow persists choice to settings.json
  - UpdateUptimeDisplay() uses _processCountThreshold field (no hardcoded 5.0)
affects: [tray-menu, settings-persistence, uptime-display]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mutually-exclusive checkable submenu items follow the same pattern as Update Interval (SyncCheckmarks on Opening)"
    - "SetProcessThreshold() method mirrors SetStatsInterval() — update field + SaveSettings()"

key-files:
  created: []
  modified:
    - FuzzyClock.App/AppSettings.cs
    - FuzzyClock.App/SettingsService.cs
    - FuzzyClock.App/TrayMenuBuilder.cs
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "Three fixed ladder values (2/5/10%) are sufficient; SettingsService.Validate() guards against any other persisted value by resetting to 5.0"
  - "Exact double comparison for checkmark sync is reliable (same as opacity preset sync pattern)"
  - "AutoContrastEnabled = false added to SettingsService.Defaults() (was an omission discovered during Task 1)"

patterns-established:
  - "Threshold menu pattern: private fields _thresh2/_thresh5/_thresh10; threshItem submenu after intervalItem in Stats; SyncCheckmarks entries parallel to interval items"

requirements-completed: [THRESH-01, THRESH-02]

# Metrics
duration: 5min
completed: 2026-03-05
---

# Phase 35 Plan 01: Process Count Threshold Summary

**Configurable process count threshold (2%/5%/10% CPU) surfaced in tray Stats submenu, persisted to settings.json, used in UpdateUptimeDisplay() replacing the hardcoded 5.0**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-05T05:59:37Z
- **Completed:** 2026-03-05T06:04:30Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- AppSettings gains `ProcessCountThresholdPercent` (double, default 5.0) with SettingsService.Defaults() and Validate() guard
- TrayMenuBuilder Stats submenu now has "Process Threshold" sub-submenu with three mutually-exclusive checkable items (2%/5%/10%)
- MainWindow `_processCountThreshold` field drives `UpdateUptimeDisplay()` (no more hardcoded 5.0); saved/loaded from settings.json; reset to 5.0 on Reset to Defaults

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ProcessCountThresholdPercent to AppSettings and SettingsService** - `b36d010` (feat)
2. **Task 2: Wire threshold through TrayMenuBuilder and MainWindow** - `135d2ac` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified
- `FuzzyClock.App/AppSettings.cs` - Added `ProcessCountThresholdPercent { get; init; } = 5.0`
- `FuzzyClock.App/SettingsService.cs` - Added to Defaults(), added Validate() guard for invalid values, added AutoContrastEnabled to Defaults() (was missing)
- `FuzzyClock.App/TrayMenuBuilder.cs` - Added `_thresh2/_thresh5/_thresh10` fields; `ProcessCountThreshold` to TrayMenuState; `SetProcessThreshold` to TrayMenuCallbacks; threshItem in Build(); SyncCheckmarks entries
- `FuzzyClock.App/MainWindow.xaml.cs` - Added `_processCountThreshold` field; `SetProcessThreshold()` method; wiring in TrayMenuCallbacks; load in ApplySettings(); persist in SaveSettings(); use in UpdateUptimeDisplay(); reset in ResetToDefaults(); add to GetCurrentTrayState()

## Decisions Made
- Three fixed ladder values (2/5/10%) are sufficient for user needs; no free-entry spinner needed
- `SettingsService.Validate()` guards against any persisted value outside {2.0, 5.0, 10.0} by resetting to 5.0
- Exact double comparison for checkmark sync is reliable (same pattern as opacity preset sync)
- `AutoContrastEnabled = false` was found missing from `SettingsService.Defaults()` — added as a minor auto-fix (Rule 1 - Bug: Defaults() was incomplete, but this had no runtime impact since the record default is also false)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added AutoContrastEnabled = false to SettingsService.Defaults()**
- **Found during:** Task 1 (reviewing SettingsService.Defaults() to add ProcessCountThresholdPercent)
- **Issue:** `AutoContrastEnabled` was added to AppSettings in Phase 33 but was never added to `Defaults()`. The record default value (false) happened to match, so there was no user-visible regression — but the omission was inconsistent with the established pattern of explicit Defaults() values.
- **Fix:** Added `AutoContrastEnabled = false` to Defaults() alongside `ProcessCountThresholdPercent = 5.0`
- **Files modified:** FuzzyClock.App/SettingsService.cs
- **Verification:** Build succeeds, all 88 tests pass
- **Committed in:** b36d010 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug/omission)
**Impact on plan:** Minor correctness fix; no scope creep. Plan executed as specified for all 8 wiring points.

## Issues Encountered
- MSBuild WPF temp project build error is a pre-existing environment issue (`MSB3492`/`Microsoft.WinFX.targets` copying nuget props to relative paths). Confirmed pre-existing by `git stash` test. Did not affect test runs. Core/App.Tests projects build and test correctly when built individually.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 35 plan 01 complete; all 88 tests pass, 0 failures
- v2.9 milestone is complete after this plan (only 1 phase, 1 plan)
- Ready for milestone audit and tag

---
*Phase: 35-process-count-threshold*
*Completed: 2026-03-05*

## Self-Check: PASSED

- FOUND: FuzzyClock.App/AppSettings.cs
- FOUND: FuzzyClock.App/SettingsService.cs
- FOUND: FuzzyClock.App/TrayMenuBuilder.cs
- FOUND: FuzzyClock.App/MainWindow.xaml.cs
- FOUND: .planning/phases/35-process-count-threshold/35-01-SUMMARY.md
- FOUND: b36d010 feat(35-01): add ProcessCountThresholdPercent to AppSettings and SettingsService
- FOUND: 135d2ac feat(35-01): wire process count threshold through TrayMenuBuilder and MainWindow
- Tests: 88 passed (74 Core + 14 App), 0 failures
