---
phase: 45-english-phrase-style-personalities
plan: 02
subsystem: phrase-style-ui
tags: [phrase-style, settings-window, wiring, combobox, setlocale]

# Dependency graph
requires:
  - phase: 45-01
    provides: en-terse, en-poetic, en-rude providers registered in PhraseEngine
provides:
  - CmbPhraseStyle with four items (Classic/Terse/Poetic/Rude)
  - SetPhraseStyle() helper in MainWindow with SetLocale + redraw + save
  - PopulateControls selects ComboBox by saved PhraseStyle value
  - ApplySettings restores PhraseEngine locale on startup
affects: [46-japanese-phrase-provider]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - SetXxx helper pattern: update field, call PhraseEngine.SetLocale, invalidate cache, redraw, save
    - ApplySettings inline SetLocale: avoids extra SaveSettings() call at startup while still restoring locale

key-files:
  created: []
  modified:
    - FuzzyClock.App/SettingsWindow.xaml
    - FuzzyClock.App/SettingsWindow.xaml.cs
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "ApplySettings uses inline SetLocale rather than calling SetPhraseStyle: avoids redundant SaveSettings at startup while still restoring PhraseEngine locale"
  - "SetPhraseStyle clears PhraseText.Text to force UpdatePhraseIfChanged to re-render; without this the guard cache prevents immediate phrase update"
  - "TODO Phase 46 comment placed near both SetPhraseStyle and PopulateControls to flag CmbPhraseStyle disable-on-non-English requirement"

patterns-established:
  - "Phrase style selection: ComboBox Content strings are PascalCase (Classic/Terse/Poetic/Rude); SetPhraseStyle uses ToLowerInvariant() to map to locale keys"

requirements-completed: [STYLE-01, STYLE-02, STYLE-03, STYLE-04]

# Metrics
duration: 3min
completed: 2026-03-09
---

# Phase 45 Plan 02: Phrase Style UI Wiring Summary

**End-to-end phrase style selection: four-item ComboBox wired to PhraseEngine.SetLocale() with immediate live update, persistence, and startup restore**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-09T02:41:15Z
- **Completed:** 2026-03-09T02:44:12Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- SettingsWindow.xaml: CmbPhraseStyle now has four items — Classic, Terse, Poetic, Rude
- SettingsWindow.xaml.cs: PopulateControls selects by saved PhraseStyle value (switch on "Terse"/"Poetic"/"Rude"/default) instead of hardcoded index 0
- MainWindow.xaml.cs: SetPhraseStyle() helper added near SetOpacity/SetTextStyle — updates field, calls PhraseEngine.SetLocale(), clears PhraseText.Text cache, calls UpdatePhraseIfChanged(), saves settings
- MainWindow.xaml.cs: PhraseStyleChanged subscription replaced stub (bare assign+save) with SetPhraseStyle(ps) call
- MainWindow.xaml.cs: ApplySettings inline SetLocale added after _currentPhraseStyle assignment so locale is restored on startup
- TODO Phase 46 comments added at both SetPhraseStyle and PopulateControls for non-English disable requirement
- All 139 tests pass (114 Core + 25 App)

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add Terse/Poetic/Rude items to CmbPhraseStyle and fix PopulateControls | f294433 | SettingsWindow.xaml, SettingsWindow.xaml.cs |
| 2 | Add SetPhraseStyle helper and fix ApplySettings + PhraseStyleChanged wiring | 06f3635 | MainWindow.xaml.cs |

## Files Created/Modified

- `FuzzyClock.App/SettingsWindow.xaml` — Added Terse/Poetic/Rude ComboBoxItem entries
- `FuzzyClock.App/SettingsWindow.xaml.cs` — PopulateControls now selects by saved PhraseStyle value
- `FuzzyClock.App/MainWindow.xaml.cs` — SetPhraseStyle helper, fixed PhraseStyleChanged subscription, fixed ApplySettings locale restore

## Decisions Made

- ApplySettings uses inline `PhraseEngine.SetLocale(...)` rather than calling `SetPhraseStyle()`. This avoids a redundant `SaveSettings()` call at startup (the values already on disk are being applied). The key requirement — PhraseEngine.CurrentLocale matches saved PhraseStyle after ApplySettings completes — is met either way.
- `SetPhraseStyle` clears `PhraseText.Text = ""` before calling `UpdatePhraseIfChanged()`. Without this the guard cache (`_lastPhrase == newPhrase`) prevents any visible update when style changes to one that happens to produce the same phrase text for the current minute.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. One transient test failure (1 of 139) on first full `dotnet test` run resolved immediately on re-run. Root cause: static `PhraseEngine` locale state interference between parallel test project runs; `[TestCleanup]` in each test class handles this correctly. Confirmed 139/139 pass on second run.

## User Setup Required

None.

## Next Phase Readiness

- STYLE-01 through STYLE-04 all fulfilled: providers exist, UI has four items, selection wires to SetLocale, persists, and restores on startup
- Ready for Phase 46: Japanese phrase provider (non-English locale path)
- Phase 46 TODO: CmbPhraseStyle should be disabled when a non-English locale is active

## Self-Check: PASSED

- FuzzyClock.App/SettingsWindow.xaml: FOUND
- FuzzyClock.App/SettingsWindow.xaml.cs: FOUND
- FuzzyClock.App/MainWindow.xaml.cs: FOUND
- .planning/phases/45-english-phrase-style-personalities/45-02-SUMMARY.md: FOUND
- Commit f294433: FOUND
- Commit 06f3635: FOUND

---
*Phase: 45-english-phrase-style-personalities*
*Completed: 2026-03-09*
