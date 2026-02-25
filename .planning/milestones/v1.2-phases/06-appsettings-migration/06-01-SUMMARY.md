---
phase: 06-appsettings-migration
plan: 01
subsystem: settings

tags: [csharp, wpf, system-text-json, appsettings, records]

# Dependency graph
requires:
  - phase: 05-font-size-selection-persistence
    provides: FontSize field in AppSettings positional record and SettingsService.Save/Load/Clamp/Defaults
provides:
  - Init-property AppSettings record with StatsVisible and StatsIntervalSeconds fields and safe defaults
  - SettingsService.Defaults() using object-initializer syntax with all 5 fields
  - SettingsService.Load() guard clause preventing zero StatsIntervalSeconds from reaching DispatcherTimer
  - All four positional AppSettings constructions in MainWindow.xaml.cs converted to object-initializer syntax
affects:
  - 07-stats-data-layer
  - 08-stats-ui-panel
  - 09-stats-wiring

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Init-property record pattern for JSON-serializable settings with explicit per-property defaults
    - Guard clause pattern for defensive deserialization of missing/corrupted numeric fields
    - with-expression compatibility: Clamp() uses s with { Left = left, Top = top } unchanged against init-property record

key-files:
  created: []
  modified:
    - FuzzyClock.App/AppSettings.cs
    - FuzzyClock.App/SettingsService.cs
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "Init-property record (not positional) chosen so System.Text.Json can deserialize partial JSON (v1.1 files missing new fields) using per-property init defaults — positional records require all constructor args to be present"
  - "StatsIntervalSeconds <= 0 guard in Load() prevents zero-interval DispatcherTimer CPU spike from old settings.json or corrupted file — replaces with Defaults().StatsIntervalSeconds (3)"
  - "New stats fields omitted from MainWindow.xaml.cs call sites — Phase 9 extends SaveSettings() with the full field set when stats UI is wired"

patterns-established:
  - "Guard clause after deserialization: validate all numeric fields that will drive timers or layout before returning from Load()"
  - "Object-initializer construction for AppSettings at all call sites — enables adding fields without touching unrelated call sites"

requirements-completed: [STAT-05]

# Metrics
duration: 2min
completed: 2026-02-25
---

# Phase 6 Plan 01: AppSettings Migration Summary

**Init-property AppSettings record with StatsVisible/StatsIntervalSeconds fields, zero-interval guard in SettingsService.Load(), and all four positional constructions in MainWindow.xaml.cs converted to object-initializer syntax**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-25T06:10:52Z
- **Completed:** 2026-02-25T06:13:17Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Converted AppSettings from positional record to init-property record with 5 explicit-default properties (Left, Top, FontSize, StatsVisible, StatsIntervalSeconds)
- Added zero-interval guard in SettingsService.Load() preventing a corrupt or old settings.json from causing a CPU-spike DispatcherTimer
- Fixed all four positional `new AppSettings(...)` constructions in MainWindow.xaml.cs; build succeeds with 0 errors, 0 warnings
- All 51 existing PhraseEngine tests continue to pass confirming no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite AppSettings.cs and update SettingsService.cs** - `27f1280` (feat)
2. **Task 2: Fix positional AppSettings construction in MainWindow.xaml.cs** - `19734ed` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `FuzzyClock.App/AppSettings.cs` - Rewritten from positional to init-property record; added StatsVisible (bool, default false) and StatsIntervalSeconds (int, default 3)
- `FuzzyClock.App/SettingsService.cs` - Defaults() updated to object-initializer syntax; Load() extended with StatsIntervalSeconds <= 0 guard clause
- `FuzzyClock.App/MainWindow.xaml.cs` - All four `new AppSettings(Left, Top, _currentFontSize)` calls replaced with `new AppSettings { Left = Left, Top = Top, FontSize = _currentFontSize }`

## Decisions Made
- Init-property record enables System.Text.Json to deserialize v1.1 settings.json (missing StatsVisible/StatsIntervalSeconds) using per-property init defaults — positional records would throw on missing args
- Guard clause placed in Load() not Defaults() — Defaults() always returns 3, Load() is the single path where deserialized zero can appear
- StatsVisible and StatsIntervalSeconds intentionally omitted from MainWindow.xaml.cs call sites — Phase 9 will extend SaveSettings() to persist stats UI state when the panel is wired

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- AppSettings.cs, SettingsService.cs, and MainWindow.xaml.cs are in the state required for Phase 7 (stats data layer) and Phase 9 (stats wiring)
- v1.1 settings.json forward-compatibility is verified: missing new fields produce StatsVisible=false, StatsIntervalSeconds=3
- Zero-interval guard is active: corrupted StatsIntervalSeconds=0 is silently replaced with 3 before any DispatcherTimer receives it
- No blockers

## Self-Check: PASSED

All created/modified files verified present. All task commits verified in git history.

---
*Phase: 06-appsettings-migration*
*Completed: 2026-02-25*
