---
phase: 51-app-integration
plan: 02
subsystem: ui
tags: [wpf, lcd, tray-menu, settings, xaml, clocktype]

# Dependency graph
requires:
  - phase: 51-app-integration
    plan: 01
    provides: LcdView in MainWindow, LCD fields, SettingsWindow LCD controls and events
provides:
  - SettingsWindow BtnLcd in clock style rail (completes Phrase/Dial/LCD segmented buttons)
  - SettingsWindow collapsible LCD options rows (LcdThemeRow, LcdFormatRow, LcdSecondsRow)
  - SettingsWindow events LcdThemeChanged, LcdUse24HrChanged, LcdShowSecondsChanged
  - TrayMenuBuilder Clock Type submenu with Phrase/Dial/LCD checkable items
  - TrayMenuCallbacks.SetClockType Action<ClockType>
  - MainWindow OpenSettings() wiring for all three LCD events
  - SetClockType dispatched from tray menu via Dispatcher.Invoke
affects: [52-app-integration-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Tray menu clock type items use CheckedItem pattern (not radio group) — SyncCheckmarks updates all three on open
    - SettingsWindow LCD rows toggled via SetLcdRowsVisible() called from SetClockStyleButtonStates()
    - CmbLcdTheme uses ComboBoxItem Tag with Enum.TryParse for theme selection

key-files:
  created: []
  modified:
    - FuzzyClock.App/SettingsWindow.xaml
    - FuzzyClock.App/SettingsWindow.xaml.cs
    - FuzzyClock.App/TrayMenuBuilder.cs
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "TrayMenuCallbacks.SetClockType is required (not optional) — any test constructing TrayMenuCallbacks needs it"
  - "Clock Type submenu inserted after separator at index 1, before Ghost Mode (index 2 push)"
  - "SyncCheckmarks updated to handle all three clock type checkmarks on every menu open"

patterns-established:
  - "LCD rows in SettingsWindow show/hide as a unit via SetLcdRowsVisible() — never toggled individually"

requirements-completed: [F8, F9]

# Metrics
duration: 20min
completed: 2026-03-10
---

# Phase 51 Plan 02: App Integration (LCD UI Surface) Summary

**LCD clock type fully selectable from Settings window (with live theme/format/seconds options) and system tray Clock Type submenu — all three clock types switchable from the UI**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-10T11:42:14Z
- **Completed:** 2026-03-10T11:42:14Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- SettingsWindow Appearance tab extended with BtnLcd in clock style rail (Phrase/Dial/LCD)
- Three collapsible LCD option rows added: LCD Theme (Green/Amber/Blue/Teal/Red), Format (12hr/24hr), Show Seconds
- LCD options rows show/hide based on selected clock type via SetLcdRowsVisible()
- Three new SettingsWindow events: LcdThemeChanged, LcdUse24HrChanged, LcdShowSecondsChanged
- TrayMenuBuilder Clock Type submenu with three checkable items synced on every menu open
- MainWindow wires all three LCD settings events in OpenSettings() for live clock updates
- All 237 tests pass (zero regressions)

## Task Commits

Work was committed as part of plan 51-01 commits due to overlapping execution sessions:

1. **Task 1: Extend SettingsWindow with BtnLcd and LCD options rows** - `7c4ea3c` (feat, labeled 51-01)
2. **Task 2: Add Clock Type submenu to TrayMenuBuilder and wire LCD events** - `bb0a42d` (feat, labeled 51-01)
3. **Task 3: All tests green** - verified 237 passing, no separate commit needed

## Files Created/Modified
- `FuzzyClock.App/SettingsWindow.xaml` - BtnLcd added to clock style rail; three LCD option rows with Visibility.Collapsed
- `FuzzyClock.App/SettingsWindow.xaml.cs` - LcdThemeChanged/LcdUse24HrChanged/LcdShowSecondsChanged events; BtnLcd_Click; CmbLcdTheme_SelectionChanged; BtnLcd12hr/24hr_Click; ChkLcdSeconds_Changed; SetLcdRowsVisible(); PopulateControls LCD section
- `FuzzyClock.App/TrayMenuBuilder.cs` - SetClockType in TrayMenuCallbacks; Clock Type submenu with three checkable items; SyncCheckmarks updated
- `FuzzyClock.App/MainWindow.xaml.cs` - SetClockType callback in TrayMenuCallbacks instantiation; three LCD event subscriptions in OpenSettings()

## Decisions Made
- TrayMenuCallbacks.SetClockType is `required` — consistent with all other callbacks in the record
- Clock Type submenu positioned after separator, before Ghost Mode (same logical grouping as settings)
- LCD event handlers in MainWindow update both the backing field and the live LcdView if currently in LCD mode

## Deviations from Plan

None - plan executed exactly as written. Work was committed across two commits during the prior execution session (both labeled feat(51-01)) since plans 01 and 02 were executed together.

## Issues Encountered
None.

## Next Phase Readiness
- Phase 51 complete: all three clock type switching paths work (settings window, tray menu, programmatic)
- LCD mode fully integrated with live settings updates
- Phase 52 (app integration tests) can verify the full feature surface

---
*Phase: 51-app-integration*
*Completed: 2026-03-10*
