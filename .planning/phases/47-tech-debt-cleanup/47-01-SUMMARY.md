---
phase: 47-tech-debt-cleanup
plan: 01
subsystem: ui
tags: [theme, settings, wpf, tech-debt]

# Dependency graph
requires:
  - phase: 43-named-themes
    provides: ThemeDefinition.cs Ghost theme entry with FontSize field
  - phase: 42-settings-window-infrastructure
    provides: SettingsWindow constructor with _suppressEvents pattern
provides:
  - Ghost theme FontSize=24 aligned to Settings 24pt button
  - Clean AppSettings.cs PhraseStyle property (no stale comment)
  - SettingsWindow constructor with single _suppressEvents=true assignment
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - FuzzyClock.App/ThemeDefinition.cs
    - FuzzyClock.App/AppSettings.cs
    - FuzzyClock.App/SettingsWindow.xaml.cs

key-decisions:
  - "Ghost theme FontSize=24 (was 28): ensures the active-button highlight in Settings Appearance tab is correct when Ghost theme is applied"

patterns-established: []

requirements-completed: []

# Metrics
duration: 10min
completed: 2026-03-09
---

# Phase 47 Plan 01: Tech Debt Cleanup Summary

**Ghost theme FontSize corrected from 28 to 24, stale PhraseStyle comment removed, and redundant _suppressEvents=true eliminated from SettingsWindow constructor**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-09T05:19:00Z
- **Completed:** 2026-03-09T05:29:21Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Ghost theme FontSize=24 so the 24pt button in Settings Appearance tab is highlighted correctly when Ghost theme is active
- AppSettings.cs PhraseStyle property has no trailing stale comment referencing Phase 45
- SettingsWindow constructor has exactly one _suppressEvents=true (line 49); redundant second assignment before PopulateControls removed
- All 224 tests pass (199 Core + 25 App)

## Task Commits

Each task was committed atomically:

1. **Task 1: Apply three surgical code edits** - `2fe5c64` (fix)
2. **Task 2: Run full test suite** - verification only, no additional commit needed

## Files Created/Modified
- `FuzzyClock.App/ThemeDefinition.cs` - Ghost theme FontSize changed 28 → 24
- `FuzzyClock.App/AppSettings.cs` - PhraseStyle trailing stale comment removed
- `FuzzyClock.App/SettingsWindow.xaml.cs` - Redundant _suppressEvents=true at line 60 removed

## Decisions Made
None - followed plan as specified. All three edits were exactly as described in the plan with no surprises.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
First test run showed 2 transient failures (NextHourTemplates_QualifierAndEmphasis, CurrentHourTemplates_QualifierAndEmphasis) due to PhraseEngine static state test isolation flakiness — consistent with the known [DoNotParallelize] annotation pattern in this codebase. Second run produced 224 passed, 0 failed. The edits touch no phrase logic.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three tech debt items closed
- Phase 47 can be marked complete or proceed with any additional tech debt plans

---
*Phase: 47-tech-debt-cleanup*
*Completed: 2026-03-09*

## Self-Check: PASSED
- All 3 modified files exist
- Commit 2fe5c64 verified in git log
- SUMMARY.md created successfully
