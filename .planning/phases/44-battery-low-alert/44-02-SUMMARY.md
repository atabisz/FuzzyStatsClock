---
phase: 44-battery-low-alert
plan: 02
subsystem: ui
tags: [wpf, battery, alert, mainwindow, settings]

# Dependency graph
requires:
  - phase: 44-battery-low-alert
    plan: 01
    provides: AppSettings.BatteryAlertThresholdPercent, SettingsSnapshot.BatteryAlertThreshold, BatteryAlertThresholdChanged event
affects:
  - BattBar.Background (red #FFFF4444 when unplugged + battery <= threshold)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - _batteryAlertActive bool field guards BattBar.Background in both ApplyTheme() and ApplyDisplayColor()
    - 1% dead-band on alert clear prevents threshold-boundary flicker
    - UpdateBatteryAlertState() piggybacks on existing _statsTimer via UpdateStatsDisplay() — no new timer
    - SetBatteryAlertThreshold() pattern mirrors SetProcessThreshold(): update field, save, re-evaluate state

key-files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "_batteryAlertActive guards BattBar.Background only — BattLabel and BattText keep accent/display color throughout"
  - "No direct call to ApplyTheme() from SetBatteryAlertThreshold() — UpdateBatteryAlertState() handles bar directly"
  - "1% dead-band: shouldClear uses (threshold + 1f) to prevent oscillation at the boundary"
  - "Sentinel -1f (no battery present) clears any stale alert state and returns early — never triggers alert"

requirements-completed: [ALERT-01, ALERT-02, ALERT-03]

# Metrics
duration: 4min
completed: 2026-03-09
---

# Phase 44 Plan 02: Battery Alert Logic in MainWindow Summary

**Battery low-alert wired end-to-end: red bar (#FFFF4444) when unplugged and battery <= threshold, with ApplyTheme/ApplyDisplayColor guards, 1% dead-band, and threshold event subscription from SettingsWindow**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-09T01:51:00Z
- **Completed:** 2026-03-09T01:54:34Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added `_batteryAlertActive` (bool) and `_batteryAlertThreshold` (int, default 20) fields to MainWindow
- Added `UpdateBatteryAlertState()` private method called at tail of `UpdateStatsDisplay()` every stats tick
- Alert activates when `!IsPluggedIn AND BatteryPercent <= threshold`; clears when `IsPluggedIn OR BatteryPercent > threshold + 1f` (dead-band)
- No-battery sentinel (-1f) never triggers alert; cleans up any stale active state
- Both `ApplyTheme()` and `ApplyDisplayColor()` guard `BattBar.Background` with `!_batteryAlertActive`
- `BattLabel` and `BattText` intentionally unguarded — keep accent/display color throughout
- `ApplySettings()` loads `_batteryAlertThreshold` from `s.BatteryAlertThresholdPercent`
- `SaveSettings()` persists `_batteryAlertThreshold` as `BatteryAlertThresholdPercent`
- `GetCurrentSettingsSnapshot()` includes `BatteryAlertThreshold` for populate-on-open
- `OpenSettings()` subscribes `BatteryAlertThresholdChanged` to `SetBatteryAlertThreshold()`
- `SetBatteryAlertThreshold()` updates field, saves, and immediately re-evaluates alert state

## Task Commits

1. **Task 1: Add alert fields, UpdateBatteryAlertState helper, ApplyTheme/ApplyDisplayColor guards** - `bd53856` (feat)
2. **Task 2: Wire threshold setting through ApplySettings, SaveSettings, GetCurrentSettingsSnapshot, and OpenSettings** - `d03457a` (feat)

**Plan metadata:** (docs commit — see final commit)

## Files Created/Modified

- `FuzzyClock.App/MainWindow.xaml.cs` — All alert logic: fields, UpdateBatteryAlertState(), guards, SetBatteryAlertThreshold(), settings wiring

## Decisions Made

- `_batteryAlertActive` guards `BattBar.Background` only — `BattLabel` and `BattText` keep accent/display color to remain readable regardless of alert state
- `SetBatteryAlertThreshold()` calls `UpdateBatteryAlertState()` directly (not `ApplyTheme()`), matching the minimal-repaint pattern used by other Set* helpers
- 1% dead-band on clear (shouldClear: `BatteryPercent > threshold + 1f`) prevents rapid on/off oscillation when battery hovers at the threshold
- `ApplyNamedTheme()` correctly stays red during alert because it calls `ApplyTheme()`, which now has the `!_batteryAlertActive` guard

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. Full test suite: 126 tests passed (101 Core + 25 App), 0 failures.

## User Setup Required

None.

## Next Phase Readiness

- Phase 44 is complete. All three ALERT requirements (ALERT-01, ALERT-02, ALERT-03) are fulfilled.
- The battery low-alert feature is fully operational: red bar on low/unplugged, accent color restored on charge/plug-in, threshold persisted, Settings window wired.

---
*Phase: 44-battery-low-alert*
*Completed: 2026-03-09*
