---
phase: 56-nixie-tube-clock
plan: 02
subsystem: ui
tags: [wpf, xaml, clock-type, nixie, settings, tray]

# Dependency graph
requires:
  - phase: 56-01
    provides: NixieDigit + NixieClockView UserControls (NixieSize enum, NixieSizeMap)
provides:
  - ClockType.Nixie = 3 in ClockType enum
  - NixieClockView wired into MainWindow.xaml XAML and all 5 code-behind touch points
  - BtnNixie in SettingsWindow.xaml Clock Style row
  - SetClockStyleButtonStates + BtnNixie_Click in SettingsWindow.xaml.cs
  - _nixieClockItem field + Build() item + SyncCheckmarks() entry in TrayMenuBuilder.cs
affects: [56-03, phase-57, any phase that handles ClockType or SettingsWindow clock style row]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ClockType enum extension: add new value + update all 5 MainWindow touch points + SettingsWindow + TrayMenuBuilder in same phase"
    - "SetClockType switch: collapse-all block always includes NixieView.Visibility = Collapsed before the switch"
    - "Timer tick guard pattern: if (_clockType != ClockType.Lcd && _clockType != ClockType.Nixie) for self-managing views"

key-files:
  created: []
  modified:
    - FuzzyClock.App/ClockType.cs
    - FuzzyClock.App/MainWindow.xaml
    - FuzzyClock.App/MainWindow.xaml.cs
    - FuzzyClock.App/SettingsWindow.xaml
    - FuzzyClock.App/SettingsWindow.xaml.cs
    - FuzzyClock.App/TrayMenuBuilder.cs

key-decisions:
  - "NixieView XAML placement: immediately after LcdView in ContentBorder Grid, same Collapsed/Center pattern"
  - "Timer tick guard uses && not separate if-blocks: if (_clockType != ClockType.Lcd && _clockType != ClockType.Nixie)"
  - "PopulateControls Nixie: no switch case needed — SetClockStyleButtonStates(s.ClockType) handles all types including Nixie"

patterns-established:
  - "Self-managing clock views (LcdClockView, NixieClockView) excluded from timer tick phrase-engine updates via tick guard"
  - "New clock type integration: 6 files always touched — ClockType.cs, MainWindow.xaml, MainWindow.xaml.cs (5 sites), SettingsWindow.xaml, SettingsWindow.xaml.cs, TrayMenuBuilder.cs"

requirements-completed: [NIXIE-01, NIXIE-06, NIXIE-07]

# Metrics
duration: 7min
completed: 2026-03-11
---

# Phase 56 Plan 02: Nixie Integration Wiring Summary

**ClockType.Nixie = 3 wired into all 6 integration touch points: enum, MainWindow (5 sites), SettingsWindow (XAML + code-behind), and TrayMenuBuilder — Nixie now selectable, persistent, and visibility-switched**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-03-11T10:51:20Z
- **Completed:** 2026-03-11T10:55:50Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- ClockType enum extended with Nixie = 3 (JsonStringEnumConverter serializes automatically)
- NixieClockView element added to MainWindow.xaml ContentBorder Grid
- All 5 MainWindow.xaml.cs touch points updated: collapse-all blocks, SetClockType case, ApplySettings branch, timer tick guard, ApplyFontSize propagation
- BtnNixie added to SettingsWindow.xaml Clock Style row; SetClockStyleButtonStates + BtnNixie_Click wired
- TrayMenuBuilder has _nixieClockItem field, Build() item, and SyncCheckmarks() entry
- 265 tests pass, 0 regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: ClockType enum + MainWindow integration (all 5 code-behind sites + XAML element)** - `4dd4dab` (feat)
2. **Task 2: SettingsWindow + TrayMenuBuilder wiring** - `0d368c8` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified
- `FuzzyClock.App/ClockType.cs` - Added Nixie = 3 to enum
- `FuzzyClock.App/MainWindow.xaml` - Added NixieClockView element after LcdView
- `FuzzyClock.App/MainWindow.xaml.cs` - 5 touch points: SetClockType Nixie case, NixieView collapse-all (x2), ApplySettings Nixie branch, timer tick guard, ApplyFontSize NixieView.Size
- `FuzzyClock.App/SettingsWindow.xaml` - BtnNixie added to Clock Style row
- `FuzzyClock.App/SettingsWindow.xaml.cs` - BtnNixie.Tag in SetClockStyleButtonStates; BtnNixie_Click handler
- `FuzzyClock.App/TrayMenuBuilder.cs` - _nixieClockItem field, Build() entry, SyncCheckmarks() entry

## Decisions Made
- PopulateControls Nixie: no switch case needed — `SetClockStyleButtonStates(s.ClockType)` already handles all types including Nixie once the Tag assignment was added. The plan mentioned adding a case but existing dispatch pattern handles it.
- Timer tick guard uses `&&` to keep both exclusions on a single condition line, consistent with codebase style.

## Deviations from Plan

None - plan executed exactly as written. The plan noted "PopulateControls() — find the existing switch/if block" but the existing code uses a direct `SetClockStyleButtonStates(s.ClockType)` call (not a switch), so no new case was needed — the Tag assignment in SetClockStyleButtonStates itself covers all paths. This is the same pattern as the existing Phrase/Dial/Lcd handling.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Nixie integration complete; NixieClockView is now selectable via Settings and Tray
- Phase 56 Plan 03 (visual review / runtime tuning) can proceed
- Settings persistence round-trips through JsonStringEnumConverter automatically (no migration code needed)

## Self-Check: PASSED

- FOUND: FuzzyClock.App/ClockType.cs
- FOUND: FuzzyClock.App/MainWindow.xaml
- FOUND: FuzzyClock.App/MainWindow.xaml.cs
- FOUND: FuzzyClock.App/SettingsWindow.xaml
- FOUND: FuzzyClock.App/SettingsWindow.xaml.cs
- FOUND: FuzzyClock.App/TrayMenuBuilder.cs
- FOUND: .planning/phases/56-nixie-tube-clock/56-02-SUMMARY.md
- FOUND: commit 4dd4dab (Task 1)
- FOUND: commit 0d368c8 (Task 2)
- Build: 0 errors
- Tests: 265 passed, 0 failed

---
*Phase: 56-nixie-tube-clock*
*Completed: 2026-03-11*
