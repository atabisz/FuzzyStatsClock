---
phase: 48-clocktype-enum-migration
plan: 01
subsystem: ui
tags: [csharp, wpf, enum, settings, json, migration]

# Dependency graph
requires: []
provides:
  - ClockType enum (Phrase/Dial/Lcd) in FuzzyClock.App
  - AppSettings.ClockType with JsonStringEnumConverter (string serialization)
  - DialMode->ClockType migration in SettingsService.Load() for backward compat
  - ThemeDefinition.ClockType (Neon/Terminal use Dial; others use Phrase)
  - SettingsSnapshot.ClockType replaces DialMode
  - MainWindow SetClockType(ClockType) method and _clockType field
  - SettingsWindow ClockTypeChanged event (Action<ClockType>)
  - TrayMenuState.ClockType field (Phase 51 will wire submenu)
affects:
  - 50-lcd-segments
  - 51-app-integration

# Tech tracking
tech-stack:
  added: []
  patterns:
    - JsonStringEnumConverter on ClockType property (settings serialize as "Phrase"/"Dial"/"Lcd")
    - Backward-compat migration in SettingsService.Load() via JsonDocument.TryGetProperty

key-files:
  created:
    - FuzzyClock.App/ClockType.cs
  modified:
    - FuzzyClock.App/AppSettings.cs
    - FuzzyClock.App/SettingsService.cs
    - FuzzyClock.App/ThemeDefinition.cs
    - FuzzyClock.App/SettingsSnapshot.cs
    - FuzzyClock.App/MainWindow.xaml.cs
    - FuzzyClock.App/SettingsWindow.xaml.cs
    - FuzzyClock.App/TrayMenuBuilder.cs
    - FuzzyClock.App.Tests/AppSettingsTests.cs

key-decisions:
  - "ClockType serializes as string (Phrase/Dial/Lcd) via JsonStringEnumConverter, not integer"
  - "DialMode->ClockType migration only fires if new ClockType field is absent (defaulted to Phrase)"
  - "Lcd enum value added now so phases 50/51 can reference it; no Lcd rendering code in this phase"
  - "SettingsWindow ClockType changes moved into Task 2 commit to avoid intermediate compile break"

patterns-established:
  - "SetClockType(ClockType) replaces SetDialMode(bool) — add Lcd branch in Phase 51"

requirements-completed: [F1]

# Metrics
duration: ~25min
completed: 2026-03-10
---

# Phase 48 Plan 01: ClockType Enum Migration Summary

**Replaced bool DialMode with ClockType enum (Phrase/Dial/Lcd) across 8 files with JSON backward-compat migration and 25/25 App tests passing**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-10T00:27:00Z
- **Completed:** 2026-03-10T00:52:45Z
- **Tasks:** 3
- **Files modified:** 8 (+ 1 created)

## Accomplishments
- Created ClockType enum with Phrase/Dial/Lcd values in FuzzyClock.App namespace
- Migrated all 14 DialMode references in MainWindow.xaml.cs to ClockType
- Added SettingsService.Load() migration so users with "DialMode":true settings automatically load as ClockType.Dial
- AppSettings.DialMode property fully removed; ClockType serializes as a string in JSON
- All 25 App tests pass; full solution builds with 0 errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ClockType enum and update AppSettings + SettingsService foundation** - `71053a7` (feat)
2. **Task 2: Update ThemeDefinition, SettingsSnapshot, MainWindow, SettingsWindow** - `18f1f99` (feat)
3. **Task 3: Remove DialMode, add TrayMenuState.ClockType, update tests** - `a5e6070` (feat)

## Files Created/Modified
- `FuzzyClock.App/ClockType.cs` - New enum: Phrase, Dial, Lcd
- `FuzzyClock.App/AppSettings.cs` - DialMode removed; ClockType added with JsonStringEnumConverter
- `FuzzyClock.App/SettingsService.cs` - Migration block in Load(); ClockType.Phrase in Defaults()
- `FuzzyClock.App/ThemeDefinition.cs` - required ClockType ClockType; Neon/Terminal set to Dial
- `FuzzyClock.App/SettingsSnapshot.cs` - ClockType replaces DialMode
- `FuzzyClock.App/MainWindow.xaml.cs` - _clockType field, SetClockType() method, 14 refs updated
- `FuzzyClock.App/SettingsWindow.xaml.cs` - ClockTypeChanged event, SetClockStyleButtonStates(ClockType)
- `FuzzyClock.App/TrayMenuBuilder.cs` - ClockType field added to TrayMenuState
- `FuzzyClock.App.Tests/AppSettingsTests.cs` - STEST-01 updated to ClockType.Dial; STEST-02 comment updated

## Decisions Made
- ClockType serializes as string via JsonStringEnumConverter so settings.json contains "Phrase"/"Dial"/"Lcd" not integers (forward-compatible if enum values are reordered)
- DialMode->ClockType migration only fires when new ClockType field was absent (defaulted to Phrase), preventing double-migration
- Lcd enum value added now to unblock Phase 51 references; no Lcd rendering exists yet

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SettingsWindow changes partially moved into Task 2 commit**
- **Found during:** Task 2 verification
- **Issue:** ThemeDefinition and SettingsSnapshot changes removed DialMode from SettingsSnapshot, causing SettingsWindow.xaml.cs (which called `s.DialMode`) to fail compilation mid-task. The plan placed SettingsWindow changes in Task 3.
- **Fix:** Applied SettingsWindow event declaration, SetClockStyleButtonStates signature, and button handler changes in Task 2 to restore compilability.
- **Files modified:** FuzzyClock.App/SettingsWindow.xaml.cs
- **Verification:** Build succeeded with 0 errors after Task 2
- **Committed in:** 18f1f99 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (blocking compile break)
**Impact on plan:** No scope creep. Changes were Task 3 work pulled into Task 2 to maintain compilability at each task boundary.

## Issues Encountered
- Pre-existing flaky test `HourWrap_QualifierAndEmphasis (11,50,"nearly","twelve")` in FuzzyClock.Core.Tests fails intermittently (confirmed non-deterministic; present before Phase 48 changes). Out of scope — not caused by this migration.

## Next Phase Readiness
- ClockType enum ready for Phase 50 (LCD segment rendering)
- Phase 51 (App Integration) can reference ClockType.Lcd for three-way clock type selection
- TrayMenuState.ClockType field is a stub for Phase 51 tray submenu wiring
- All 25 App tests pass; full solution builds clean

---
*Phase: 48-clocktype-enum-migration*
*Completed: 2026-03-10*
