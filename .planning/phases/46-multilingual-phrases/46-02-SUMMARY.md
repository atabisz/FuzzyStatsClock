---
phase: 46-multilingual-phrases
plan: 02
subsystem: app-layer
tags: [csharp, multilingual, settings-window, locale, culture-detection, wpf]

# Dependency graph
requires:
  - phase: 46-01
    provides: Five language providers (fr/es/de/ja/pl) registered in PhraseEngine

provides:
  - AppSettings.PhraseLocale field (persisted language override, default "auto")
  - SettingsSnapshot.PhraseLocale for populate-on-open
  - SettingsWindow Behavior tab CmbPhraseLanguage ComboBox (7 items)
  - LanguageChanged event + handler in MainWindow
  - LANG-01: auto-detect from CultureInfo.CurrentUICulture on launch
  - LANG-04: unsupported locale (e.g. "it") silently stays English

affects:
  - settings.json round-trip (PhraseLocale persisted/restored on next launch)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - CultureInfo.CurrentUICulture.TwoLetterISOLanguageName for OS language detection
    - Guard pattern on SetPhraseStyle: return early when PhraseEngine.CurrentLocale not "en-*"
    - SetLanguage() resolves effective locale from explicit/auto/style dimensions

key-files:
  created: []
  modified:
    - FuzzyClock.App/AppSettings.cs
    - FuzzyClock.App/SettingsSnapshot.cs
    - FuzzyClock.App/SettingsWindow.xaml
    - FuzzyClock.App/SettingsWindow.xaml.cs
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "PhraseLocale default 'auto': absent field in existing settings.json deserializes to 'auto' — backward-compatible"
  - "SetPhraseStyle guard: return early if CurrentLocale does not start with 'en-'; prevents English style overriding active non-English locale"
  - "SetLanguage resolves effective locale at call time: explicit non-English > explicit English (uses PhraseStyle) > auto (CultureInfo gate)"
  - "CmbPhraseStyle.IsEnabled tied to locale: disabled in PopulateControls when auto-detected OR explicit non-English locale is active"

requirements-completed: [LANG-01, LANG-04]

# Metrics
duration: 3min
completed: 2026-03-09
---

# Phase 46 Plan 02: App Language Wiring Summary

**AppSettings/SettingsSnapshot/SettingsWindow/MainWindow wired for multilingual locale selection: auto-detect from CultureInfo.CurrentUICulture (LANG-01), Behavior tab language ComboBox, SetPhraseStyle guard, and PhraseLocale persistence**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-09T05:59:50Z
- **Completed:** 2026-03-09T06:02:43Z
- **Tasks:** 2 (all auto)
- **Files modified:** 5

## Accomplishments

- `AppSettings.PhraseLocale` field added (default `"auto"`, backward-compatible)
- `SettingsSnapshot.PhraseLocale` added for populate-on-open
- `SettingsWindow` Behavior tab: `CmbPhraseLanguage` ComboBox with 7 items (Auto + en/fr/es/de/ja/pl) plus `LanguageChanged` event
- `PopulateControls` sets `CmbPhraseStyle.IsEnabled = false` when auto-detected or explicit non-English locale is active
- `MainWindow._currentPhraseLocale` field tracks persisted locale preference
- `ApplySettings()` implements LANG-01 culture detection logic: explicit override > auto-detect > English fallback (LANG-04)
- `SetPhraseStyle()` guarded: returns early if `PhraseEngine.CurrentLocale` does not start with `"en-"`
- `SetLanguage()` helper resolves effective locale and persists via `SaveSettings()`
- `OpenSettings()` wires `LanguageChanged` event to `SetLanguage()`
- `GetCurrentSettingsSnapshot()` and `SaveSettings()` both persist `PhraseLocale`

## Task Commits

1. **Task 1: AppSettings + SettingsSnapshot + SettingsWindow Language UI** - `da83fb7`
2. **Task 2: MainWindow culture detection + SetPhraseStyle guard + LanguageChanged wiring** - `e54afd0`

**Plan metadata:** (this commit)

## Files Created/Modified

- `FuzzyClock.App/AppSettings.cs` — `PhraseLocale` field (default `"auto"`)
- `FuzzyClock.App/SettingsSnapshot.cs` — `PhraseLocale` field
- `FuzzyClock.App/SettingsWindow.xaml` — `CmbPhraseLanguage` in Behavior tab (7 items)
- `FuzzyClock.App/SettingsWindow.xaml.cs` — `LanguageChanged` event, `CmbPhraseLanguage_SelectionChanged`, updated `PopulateControls`
- `FuzzyClock.App/MainWindow.xaml.cs` — `_currentPhraseLocale` field, updated `ApplySettings()`/`SetPhraseStyle()`/`SetLanguage()`/`OpenSettings()`/`GetCurrentSettingsSnapshot()`/`SaveSettings()`

## Decisions Made

- `PhraseLocale` defaults to `"auto"`: existing `settings.json` files without this key will deserialize cleanly to `"auto"`, preserving English behavior for all existing users.
- `SetPhraseStyle()` guard uses `PhraseEngine.CurrentLocale.StartsWith("en-", StringComparison.Ordinal)`: ordinal comparison avoids culture-sensitive string issues on non-English OS.
- Locale resolution precedence in both `ApplySettings()` and `SetLanguage()` is: explicit non-English > explicit English (uses PhraseStyle variant) > auto-detect from `CultureInfo.CurrentUICulture` > English fallback if unsupported culture.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 46 is now complete: all 5 language providers registered (Plan 01) and wired into App layer (Plan 02)
- LANG-01 (auto-detect) and LANG-04 (unsupported locale fallback) both implemented and tested via build + 224 passing tests
- Remaining open blocker: Japanese phrase naturalness is medium confidence; native-speaker review recommended before v3.2 ships

---
*Phase: 46-multilingual-phrases*
*Completed: 2026-03-09*

## Self-Check: PASSED

- FuzzyClock.App/AppSettings.cs: FOUND (PhraseLocale field: 1 occurrence)
- FuzzyClock.App/SettingsSnapshot.cs: FOUND
- FuzzyClock.App/SettingsWindow.xaml: FOUND (CmbPhraseLanguage: 2 occurrences)
- FuzzyClock.App/SettingsWindow.xaml.cs: FOUND (LanguageChanged: 2 occurrences)
- FuzzyClock.App/MainWindow.xaml.cs: FOUND (CurrentUICulture: 2 occurrences)
- .planning/phases/46-multilingual-phrases/46-02-SUMMARY.md: FOUND
- Commits da83fb7 (Task 1) and e54afd0 (Task 2): FOUND
- All 224 tests pass, 0 failures, 0 build warnings
