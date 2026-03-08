---
phase: 42-settings-window-infrastructure
plan: 01
subsystem: ui
tags: [appsettings, data-contracts, settings-window, phrase-style]

# Dependency graph
requires: []
provides:
  - AppSettings.PhraseStyle init-property with "Classic" default
  - SettingsSnapshot internal sealed record with 19 init-properties
affects: [42-02, 42-03, 45-phrase-styles]

# Tech tracking
tech-stack:
  added: []
  patterns: [populate-on-open strategy for SettingsWindow via SettingsSnapshot constructor arg]

key-files:
  created:
    - FuzzyClock.App/SettingsSnapshot.cs
  modified:
    - FuzzyClock.App/AppSettings.cs

key-decisions:
  - "PhraseStyle and TextStyle are separate: TextStyle governs text layout (Classic/Split/Literary/Mono); PhraseStyle governs phrase vocabulary (Classic/Terse/Poetic/Rude)"
  - "SettingsSnapshot excludes ShowHourTicks/ShowMinuteDots/ShowHourNumbers — dial decoration toggles not exposed in SettingsWindow"
  - "SettingsSnapshot excludes MonitorPositions/LastActiveMonitor — position/session fields not shown in Settings"

patterns-established:
  - "SettingsSnapshot pattern: immutable read-only record passed to SettingsWindow constructor; changes flow out via events, nothing flows back in"

requirements-completed: [SETT-03, SETT-06]

# Metrics
duration: 2min
completed: 2026-03-08
---

# Phase 42 Plan 01: Settings Window Infrastructure Summary

**AppSettings gains PhraseStyle property and SettingsSnapshot record created as the data contracts for SettingsWindow Plans 02 and 03**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-08T19:54:36Z
- **Completed:** 2026-03-08T19:55:46Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `PhraseStyle` init-property to `AppSettings` with `"Classic"` default; JSON forward/backward compatible
- Created `SettingsSnapshot` internal sealed record with 19 init-properties capturing all live widget state
- All 126 tests pass (101 Core + 25 App), zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add PhraseStyle to AppSettings** - `03ab44d` (feat)
2. **Task 2: Create SettingsSnapshot record** - `89a71b0` (feat)

## Files Created/Modified

- `FuzzyClock.App/AppSettings.cs` - Added PhraseStyle string init-property after TextStyle
- `FuzzyClock.App/SettingsSnapshot.cs` - New internal sealed record with 19 init-properties for SettingsWindow construction

## Decisions Made

- PhraseStyle and TextStyle kept separate: they are different dimensions (vocabulary vs. layout)
- SettingsSnapshot omits dial decoration toggles (ShowHourTicks/ShowMinuteDots/ShowHourNumbers) — not exposed in SettingsWindow
- SettingsSnapshot omits MonitorPositions/LastActiveMonitor — position/session state not user-configurable via Settings

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 (SettingsWindow XAML) can now reference `SettingsSnapshot` type for constructor parameter
- Plan 03 (SettingsWindow code-behind) can bind to `PhraseStyle` and all 19 SettingsSnapshot fields
- Phase 45 (Phrase Styles) has the `PhraseStyle` AppSettings field it will need to extend

---
*Phase: 42-settings-window-infrastructure*
*Completed: 2026-03-08*
