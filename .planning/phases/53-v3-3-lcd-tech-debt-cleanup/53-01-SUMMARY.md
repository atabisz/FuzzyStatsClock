---
phase: 53-v3-3-lcd-tech-debt-cleanup
plan: 01
subsystem: ui
tags: [lcd, settings, wpf, csharp, readme]

# Dependency graph
requires:
  - phase: 52-tests-readme
    provides: LcdSize enum, 245 passing tests, SettingsSnapshot record
provides:
  - LcdSize persisted in SaveSettings() via FontSizeToLcdSize derivation
  - LcdSize field on SettingsSnapshot with Medium default
  - README LCD theme table with Ghost color column (3 columns)
affects: [future-settingswindow-lcdsize-wiring, settings-persistence]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml.cs
    - FuzzyClock.App/SettingsSnapshot.cs
    - README.md

key-decisions:
  - "LcdSize in SaveSettings() and GetCurrentSettingsSnapshot() is derived via FontSizeToLcdSize(_currentFontSize), matching the existing pattern at ApplySettings() and SetClockType() — no new backing field added"
  - "SettingsSnapshot.LcdSize defaults to LcdSize.Medium, matching AppSettings record default"

patterns-established: []

requirements-completed: []

# Metrics
duration: 10min
completed: 2026-03-11
---

# Phase 53 Plan 01: v3.3 LCD Tech Debt Cleanup Summary

**LcdSize now persists to settings.json on save, SettingsSnapshot carries an LcdSize field, and the README LCD theme table has a Ghost color column with correct hex values for all five themes.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-11T00:00:00Z
- **Completed:** 2026-03-11T00:10:00Z
- **Tasks:** 4
- **Files modified:** 3

## Accomplishments

- LcdSize written to settings.json on every SaveSettings() call using FontSizeToLcdSize() derivation (no new backing field)
- SettingsSnapshot.LcdSize property added with LcdSize.Medium default — future SettingsWindow LcdSize wiring will compile correctly
- README LCD theme table expanded from 2 columns (Lit / Background) to 3 columns (Lit / Ghost / Background) with accurate hex values from REQUIREMENTS.md F3
- Build: 0 errors, 0 warnings. App.Tests: 33/33 passed. Core.Tests: 211/212 (1 pre-existing unrelated failure in PhraseEngineTests.cs, confirmed pre-existing by stash-test)

## Task Commits

Each task was committed atomically:

1. **Task 1: Persist LcdSize in SaveSettings() and GetCurrentSettingsSnapshot()** - `94ae23a` (feat)
2. **Task 2: Add LcdSize to SettingsSnapshot record** - `c97c61e` (feat)
3. **Task 3: Add Ghost color column to README LCD theme table** - `01234a3` (docs)
4. **Task 4: Build verification** - (no code changes, build passed)

## Files Created/Modified

- `FuzzyClock.App/MainWindow.xaml.cs` - Added LcdSize = FontSizeToLcdSize(_currentFontSize) to GetCurrentSettingsSnapshot() (line 386) and SaveSettings() (line 515)
- `FuzzyClock.App/SettingsSnapshot.cs` - Added LcdSize property with LcdSize.Medium default after LcdShowSeconds
- `README.md` - Replaced 2-column LCD theme table with 3-column version including Ghost color column

## Decisions Made

- LcdSize is always derived from _currentFontSize via FontSizeToLcdSize() — no backing field added. This is consistent with how LcdSize is used throughout MainWindow.xaml.cs (ApplySettings, SetClockType).
- SettingsSnapshot.LcdSize defaults to LcdSize.Medium, matching the AppSettings record default.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing Core test failure (`HourWrap_QualifierAndEmphasis` in PhraseEngineTests.cs) was present before and after all changes. Confirmed via git stash check. Out of scope for this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

All three v3.3 tech debt gaps are closed. Phase 53 plan 01 is the only plan in this phase. v3.3 milestone is complete with all consistency gaps resolved.

---
*Phase: 53-v3-3-lcd-tech-debt-cleanup*
*Completed: 2026-03-11*
