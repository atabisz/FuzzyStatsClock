---
phase: 57-re-introduce-nixie-into-the-new-architecture
plan: 02
subsystem: ui
tags: [csharp, wpf, clocktype, nixie, settings, events]

# Dependency graph
requires:
  - 57-01 (AppSettings/SettingsSnapshot with ClockType enum)
provides:
  - SettingsWindow 3-button Clock Style rail (Phrase/Dial/Nixie)
  - ClockTypeChanged event replaces DialModeChanged
  - All 6 missing SettingsWindow events declared
  - Full solution builds with 0 errors and 298 tests passing
affects:
  - FuzzyClock.App/SettingsWindow.xaml (BtnNixie added)
  - FuzzyClock.App/SettingsWindow.xaml.cs (events + handlers)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ClockTypeChanged event fires with ClockType enum value — replaces bool DialModeChanged"
    - "SetClockStyleButtonStates(ClockType ct) sets Tag on all 3 buttons atomically"
    - "All SettingsWindow events pre-declared even if not yet wired to UI controls (stub pattern)"

key-files:
  created: []
  modified:
    - FuzzyClock.App/SettingsWindow.xaml
    - FuzzyClock.App/SettingsWindow.xaml.cs

key-decisions:
  - "ClockTypeChanged replaces DialModeChanged — single enum event covers Phrase/Dial/Lcd/Nixie selections"
  - "6 LCD and dial-decoration events declared as stubs — MainWindow already subscribes; they will be wired in a future plan when LCD/dial settings UI is built"
  - "_dialMode fix in MainWindow was already committed in Plan 01 Task 2 (cf63c46) — Task 2 of this plan was verification only"

requirements-completed: [NIX-02, NIX-03]

# Metrics
duration: 2min
completed: 2026-03-19
---

# Phase 57 Plan 02: Wire Nixie Through SettingsWindow Summary

**ClockTypeChanged event and BtnNixie button added to SettingsWindow; solution builds with 0 errors and 298 tests passing**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-19T02:00:05Z
- **Completed:** 2026-03-19T02:02:11Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `SettingsWindow.xaml`: Added `BtnNixie` (Content="Nixie", Click="BtnNixie_Click") as third button in the Clock Style rail alongside Phrase and Dial
- `SettingsWindow.xaml.cs`: Replaced `DialModeChanged (Action<bool>)` with `ClockTypeChanged (Action<ClockType>)` plus 6 new event declarations: `LcdUse24HrChanged`, `LcdShowSecondsChanged`, `LcdStyleChanged`, `ShowHourTicksChanged`, `ShowMinuteDotsChanged`, `ShowHourNumbersChanged`
- `SetClockStyleButtonStates` signature updated from `bool dialMode` to `ClockType ct`; now sets Tag on all 3 buttons (Phrase, Dial, Nixie)
- `PopulateControls` updated to call `SetClockStyleButtonStates(s.ClockType)` directly
- `BtnPhrase_Click` and `BtnDial_Click` updated to fire `ClockTypeChanged?.Invoke(ClockType.X)`
- `BtnNixie_Click` added — fires `ClockTypeChanged?.Invoke(ClockType.Nixie)`
- Full solution: `dotnet build` → Build succeeded, 0 errors; `dotnet test` → 298 passed, 0 failures

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace DialModeChanged with ClockTypeChanged and add BtnNixie in SettingsWindow** - `8f21ede` (feat)
2. **Task 2: Fix _dialMode stale reference in MainWindow and verify full build** - verification only (no new commit; MainWindow was already fixed in `cf63c46` from Plan 01)

## Files Created/Modified

- `FuzzyClock.App/SettingsWindow.xaml` - Added `BtnNixie` to Clock Style rail StackPanel
- `FuzzyClock.App/SettingsWindow.xaml.cs` - Replaced `DialModeChanged` with `ClockTypeChanged` + 6 new event stubs; updated `SetClockStyleButtonStates`, `BtnPhrase_Click`, `BtnDial_Click`; added `BtnNixie_Click`

## Decisions Made

- **ClockTypeChanged replaces DialModeChanged.** The boolean `DialModeChanged(bool)` only distinguished Phrase vs Dial. The enum `ClockTypeChanged(ClockType)` covers all four clock modes with a single event, aligning with the ClockType-everywhere approach established in Plan 01.
- **6 LCD/dial-decoration events declared as stubs.** MainWindow (already committed) subscribes to these 6 events at line ~460-481. Declaring them here without wiring them to UI controls eliminates the build errors while deferring the full LCD/dial settings UI to a future plan.
- **Task 2 was verification only.** The `_dialMode` → `_clockType != ClockType.Phrase` fix in `MainWindow.ApplyPhraseWrap` was already applied as part of Plan 01 Task 2 (commit `cf63c46`). Task 2 of this plan confirmed no remaining stale references and that the full build is clean.

## Deviations from Plan

None — plan executed exactly as written. The only note is that Task 2's code fix was already present from Plan 01; Task 2 became a build verification task.

## Issues Encountered

- CS0067 warnings for the 6 newly declared LCD/dial-decoration events (they are declared but not yet invoked from the SettingsWindow UI). These are expected stubs for future plan work and are not errors.

## Next Phase Readiness

- Phase 57 is complete: FuzzyClock.Core and FuzzyClock.App both compile with 0 errors
- Selecting Nixie in SettingsWindow fires `ClockTypeChanged(ClockType.Nixie)` → MainWindow's subscription calls `SetClockType(ClockType.Nixie)` → NixieClockView becomes visible
- 298 tests pass; no regressions

---
*Phase: 57-re-introduce-nixie-into-the-new-architecture*
*Completed: 2026-03-19*
