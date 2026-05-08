---
phase: 55-phrase-personalities
plan: 02
subsystem: ui
tags: [wpf, phrase-engine, combobox, settings, validation]

# Dependency graph
requires:
  - phase: 55-01
    provides: "Six new IPhraseProvider classes (Pirate, Dwarf, Jive, ValleyGirl, Yoda, Shakespeare)"
provides:
  - PhraseEngine._providers registered with 15 entries (9 existing + 6 new)
  - All 5 locale-routing switch sites in MainWindow.xaml.cs include all 6 new personality cases
  - SettingsWindow ComboBox has 10 items with Width=140
  - PopulateControls maps all 10 PhraseStyle strings to indices 0-9
  - SettingsService.Validate() guards PhraseStyle against 10 valid values
affects: [55-03, phase-56]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Provider registration: add entry to PhraseEngine._providers static dict initializer
    - Settings wiring: ComboBoxItem Content + PopulateControls index + Validate guard must all be updated atomically

key-files:
  created: []
  modified:
    - FuzzyClock.Core/PhraseEngine.cs
    - FuzzyClock.App/MainWindow.xaml.cs
    - FuzzyClock.App/SettingsWindow.xaml
    - FuzzyClock.App/SettingsWindow.xaml.cs
    - FuzzyClock.App/SettingsService.cs

key-decisions:
  - "All 5 switch sites in MainWindow updated (research doc said 4, but SetLanguage has both en and auto branches like ApplySettings); all logical paths covered correctly"

patterns-established:
  - "PhraseStyle wiring: 5 touch points — PhraseEngine dict, 5 MainWindow switches, ComboBoxItem, PopulateControls index, Validate guard"

requirements-completed: [PHRASE-08]

# Metrics
duration: 8min
completed: 2026-03-11
---

# Phase 55 Plan 02: Phrase Personalities Wiring Summary

**Six new phrase providers wired end-to-end: registered in PhraseEngine, routed in all MainWindow locale switches, selectable in SettingsWindow ComboBox, persisted with PopulateControls index mapping, and guarded in SettingsService.Validate()**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-11T00:00:00Z
- **Completed:** 2026-03-11T00:08:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- PhraseEngine._providers now has 15 entries — Pirate, Dwarf, Jive, ValleyGirl, Yoda, Shakespeare all registered
- All 5 locale-routing switch sites in MainWindow.xaml.cs extended with the 6 new cases
- SettingsWindow CmbPhraseStyle has 10 ComboBoxItems (Width widened from 120 to 140 to accommodate "Shakespeare")
- PopulateControls correctly maps all 10 PhraseStyle strings to indices 0-9
- SettingsService.Validate() guards PhraseStyle with 10 valid values, consistent with TextStyle/DateFormat pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Register new providers in PhraseEngine and extend all four MainWindow switch sites** - `b362030` (feat)
2. **Task 2: Update SettingsWindow XAML + code-behind and add SettingsService.Validate() guard** - `1580e7a` (feat)

## Files Created/Modified
- `FuzzyClock.Core/PhraseEngine.cs` - Added 6 new provider entries to _providers dict (15 total)
- `FuzzyClock.App/MainWindow.xaml.cs` - Extended all 5 locale switch sites with 6 new personality cases
- `FuzzyClock.App/SettingsWindow.xaml` - Added 6 ComboBoxItems, changed Width from 120 to 140
- `FuzzyClock.App/SettingsWindow.xaml.cs` - Extended PopulateControls switch with indices 4-9
- `FuzzyClock.App/SettingsService.cs` - Added validPhraseStyles guard with all 10 valid values

## Decisions Made
- Research doc said there were 4 switch sites in MainWindow.xaml.cs, but SetLanguage() has both "en" and "auto" branches just like ApplySettings() does, making 5 total. All 5 were extended — this is the correct behavior; the count discrepancy is a minor inaccuracy in the research doc.

## Deviations from Plan

None - plan executed exactly as written (with the minor note above about switch site count being 5 rather than 4, which is handled correctly).

## Issues Encountered
- MSBuild cache file lock error (`FuzzyClock.Core.AssemblyInfoInputs.cache`) appeared twice during `--no-restore` builds. Fixed by deleting the Core `obj/` directory and running a full build with restore. This is a transient Windows file-lock issue unrelated to the code changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 6 new phrase providers are now fully wired and selectable in the Settings UI
- Styles persist across restarts (AppSettings.PhraseStyle serialized as string)
- Settings window correctly restores the selected index on reopening
- Phase 55 Plan 03 (tests) can now verify all 6 providers via PhraseEngine.SetLocale()

---
*Phase: 55-phrase-personalities*
*Completed: 2026-03-11*
