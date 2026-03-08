---
phase: 43-named-themes
plan: "03"
subsystem: ui
tags: [themes, settings, wpf, named-themes, persistence]

# Dependency graph
requires:
  - phase: 43-01
    provides: ThemeDefinition record + BuiltInThemes.TryGet + AppSettings.Theme field
  - phase: 43-02
    provides: SettingsWindow ThemeSelected event + ClearActiveThemeCard() method + PopulateControls ActiveTheme usage
provides:
  - _currentTheme field in MainWindow (tracks active named theme, null = none)
  - ApplyNamedTheme(ThemeDefinition): batch setter that persists theme name through all intermediate saves
  - ClearActiveTheme(): clears field and syncs Settings window ring on manual override
  - SaveSettings() Theme = _currentTheme round-trip to settings.json
  - ApplySettings() startup field-only theme restore (safe before ContentRendered)
  - ResetToDefaults() clears theme and ring
  - GetCurrentSettingsSnapshot() exposes ActiveTheme for Settings window population
  - OpenSettings() ThemeSelected subscription + ClearActiveTheme() in 5 covered-property handlers
  - SettingsSnapshot.ActiveTheme field (resolves CS1061 from Plan 02)
affects: [44-battery-alert, 45-phrase-styles, 46-japanese-phrases]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "_currentTheme set BEFORE individual setters so intermediate SaveSettings() calls persist correct name"
    - "ClearActiveTheme() null-conditional on _settingsWindow — safe when window is closed"
    - "ApplySettings() field-only restore block — never calls ApplyTheme() before ContentRendered"

key-files:
  created: []
  modified:
    - FuzzyClock.App/SettingsSnapshot.cs
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "ApplyNamedTheme sets _currentTheme FIRST before calling setters — each setter's SaveSettings() already captures the theme name"
  - "ApplySettings() theme restore is field-only; ContentRendered calls ApplyTheme() after InitDialDecorations() handles the visual update"
  - "ClearActiveTheme() does NOT call SaveSettings() — the individual setter that triggered it does so"
  - "FontSizeChanged handler now calls SaveSettings() explicitly (ApplyFontSize does not save internally)"

patterns-established:
  - "Named theme field set before batch setters: ensures all intermediate persistence captures correct theme name"
  - "Field-only startup restore: never call UI-touching methods before ContentRendered layout pass"

requirements-completed: [THM-02, THM-03]

# Metrics
duration: 12min
completed: 2026-03-09
---

# Phase 43 Plan 03: Named Themes — MainWindow Wiring Summary

**ThemeSelected event wired end-to-end: clicking a theme card batches all 5 property setters, persists theme name to JSON, restores on restart, and clears the ring on manual override.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-09T00:15:00Z
- **Completed:** 2026-03-09T00:27:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- SettingsSnapshot.ActiveTheme added — resolves CS1061 from Plan 02's PopulateControls
- ApplyNamedTheme() batch-applies all 5 theme properties with _currentTheme set first so every intermediate SaveSettings() persists the name
- ClearActiveTheme() resets the field and syncs the Settings window ring on any manual override
- SaveSettings() with-expression now includes Theme = _currentTheme for JSON round-trip
- ApplySettings() startup restore block restores all theme fields safely (field-only, no ApplyTheme() before ContentRendered)
- ResetToDefaults() clears theme name and ring before final save
- GetCurrentSettingsSnapshot() includes ActiveTheme = _currentTheme for populate-on-open
- OpenSettings() subscribes to ThemeSelected and prepends ClearActiveTheme() to 5 covered-property handlers
- 126 tests (101 Core + 25 App), 0 failures

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ActiveTheme to SettingsSnapshot** - `b18e240` (feat)
2. **Task 2: Wire ApplyNamedTheme, ClearActiveTheme, SaveSettings, ApplySettings, ResetToDefaults, and OpenSettings** - `e8fe49e` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `FuzzyClock.App/SettingsSnapshot.cs` - Added `string? ActiveTheme { get; init; } = null` as last field
- `FuzzyClock.App/MainWindow.xaml.cs` - Added _currentTheme field, ApplyNamedTheme(), ClearActiveTheme(), updated SaveSettings()/ApplySettings()/ResetToDefaults()/GetCurrentSettingsSnapshot()/OpenSettings()

## Decisions Made
- ApplyNamedTheme sets _currentTheme before calling individual setters so each setter's internal SaveSettings() already has the correct name — no risk of intermediate saves with null theme
- ApplySettings() uses field-only restore; ContentRendered's existing ApplyTheme() call handles the visual update after decoration lists are populated
- ClearActiveTheme() omits its own SaveSettings() call — the triggering setter provides it
- FontSizeChanged handler gained an explicit SaveSettings() call (ApplyFontSize does not save internally; this was always required for persistence but not previously present)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- MSB3492 cache-file warning appeared during every `dotnet build --no-restore` invocation. The "Build succeeded" and "0 Error(s)" output confirmed this is a transient lock noise, not a real failure. All builds passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Named themes feature is fully wired end-to-end: UI (Plan 02), data layer (Plan 01), and MainWindow connective tissue (this plan) are all complete
- Phase 43 is done — ready for Phase 44 (battery alert threshold) or next milestone work
- No blockers

---
*Phase: 43-named-themes*
*Completed: 2026-03-09*
