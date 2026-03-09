---
phase: 44-battery-low-alert
plan: 01
subsystem: ui
tags: [wpf, settings, battery, appsettings, settingswindow]

# Dependency graph
requires:
  - phase: 42-settings-window-infrastructure
    provides: SettingsWindow, SettingsSnapshot, event-driven settings architecture
  - phase: 43-named-themes
    provides: latest SettingsWindow state (ThemeSelected event, RefreshControls)
provides:
  - AppSettings.BatteryAlertThresholdPercent (int, default 20, persisted via JSON)
  - SettingsSnapshot.BatteryAlertThreshold (int, default 20)
  - SettingsService.Validate() guard for {10,15,20} alert threshold
  - SettingsWindow Behavior tab Battery Alert section with RbAlert10/RbAlert15/RbAlert20
  - BatteryAlertThresholdChanged event (Action<int>) on SettingsWindow
affects:
  - 44-02 (MainWindow wires BatteryAlertThresholdChanged to apply alert logic)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - init-property record addition for AppSettings backward-compat JSON deserialization
    - int[] validAlertThresholds guard in SettingsService.Validate() mirroring ProcessCountThreshold pattern
    - _suppressEvents guard in Checked handlers prevents spurious events during PopulateControls

key-files:
  created: []
  modified:
    - FuzzyClock.App/AppSettings.cs
    - FuzzyClock.App/SettingsSnapshot.cs
    - FuzzyClock.App/SettingsService.cs
    - FuzzyClock.App/SettingsWindow.xaml
    - FuzzyClock.App/SettingsWindow.xaml.cs

key-decisions:
  - "BatteryAlertThresholdPercent is int (not double) — matches the 10/15/20 discrete ladder; avoids floating-point equality issues"
  - "Validation set is {10,15,20} only — rejects any manually edited value outside ladder, falls back to 20"
  - "SettingsWindow Height 510 -> 600 to give Behavior tab room for the new section without cramping"

patterns-established:
  - "Battery Alert radio group follows exact RbThresh pattern: GroupName attribute, _suppressEvents guard, event?.Invoke(int)"

requirements-completed: [ALERT-03]

# Metrics
duration: 2min
completed: 2026-03-09
---

# Phase 44 Plan 01: Battery Alert Threshold — Data Model and Settings UI Summary

**BatteryAlertThresholdPercent (int, default 20) wired through AppSettings/SettingsSnapshot/SettingsService with three-option radio group (10%/15%/20%) in SettingsWindow Behavior tab**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-09T01:48:23Z
- **Completed:** 2026-03-09T01:50:16Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- AppSettings gains `BatteryAlertThresholdPercent` (int, default 20) — persists via JSON, backward-compatible
- SettingsSnapshot gains `BatteryAlertThreshold` (int, default 20) for populate-on-open pattern
- SettingsService.Validate() guards against values outside {10,15,20}; SettingsService.Defaults() returns 20
- SettingsWindow Behavior tab extended with "Battery Alert" section: heading, description, RbAlert10/RbAlert15/RbAlert20
- `BatteryAlertThresholdChanged` event (Action<int>) declared; PopulateControls sets radio buttons; _suppressEvents guard in all three Checked handlers

## Task Commits

1. **Task 1: Extend AppSettings, SettingsSnapshot, and SettingsService** - `6fe4855` (feat)
2. **Task 2: Add Battery Alert section to SettingsWindow Behavior tab + event wiring** - `094cd27` (feat)

**Plan metadata:** (docs commit — see final commit)

## Files Created/Modified
- `FuzzyClock.App/AppSettings.cs` - Added `BatteryAlertThresholdPercent { get; init; } = 20`
- `FuzzyClock.App/SettingsSnapshot.cs` - Added `BatteryAlertThreshold { get; init; } = 20`
- `FuzzyClock.App/SettingsService.cs` - Added validAlertThresholds guard in Validate(); BatteryAlertThresholdPercent = 20 in Defaults()
- `FuzzyClock.App/SettingsWindow.xaml` - Height 510->600; Battery Alert section after ChkAutoLaunch
- `FuzzyClock.App/SettingsWindow.xaml.cs` - BatteryAlertThresholdChanged event; PopulateControls lines; three Checked handlers

## Decisions Made
- `BatteryAlertThresholdPercent` is `int` (not `double`) to match the discrete 10/15/20 ladder and avoid floating-point equality pitfalls
- Validation set {10,15,20} only; out-of-range values silently reset to 20 (same pattern as ProcessCountThresholdPercent)
- Window Height increased from 510 to 600 — plan specification followed exactly

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. Full test suite: 126 tests passed (0 failures). Count is 126 rather than the plan's stated 122 because phases 41-43 added 4 tests after the plan was authored; all new tests also pass.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- Plan 02 can now subscribe to `BatteryAlertThresholdChanged` and read `SettingsSnapshot.BatteryAlertThreshold` to wire the actual alert logic in MainWindow
- `AppSettings.BatteryAlertThresholdPercent` is already persisted — no migration needed

---
*Phase: 44-battery-low-alert*
*Completed: 2026-03-09*
