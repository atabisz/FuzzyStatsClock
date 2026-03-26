---
phase: 62-routing-consolidation
plan: 01
subsystem: ui
tags: [phrase-engine, locale, routing, japanese, settings-window]

# Dependency graph
requires:
  - phase: 61-japanese-providers
    provides: Japanese phrase providers (JapaneseTersePhraseProvider, JapanesePoeticPhraseProvider, JapaneseRudePhraseProvider) registered in PhraseEngine
provides:
  - ResolveLocaleKey private static helper in MainWindow eliminating three duplicate switch expressions
  - EnStyleKey private static helper for English style key resolution
  - Japanese locale enabled in SettingsWindow Phrase Style combo (CmbPhraseStyle.IsEnabled)
affects: [63-settings-window-lcd-ui, settings-window, phrase-routing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ResolveLocaleKey(locale, style) is the single entry point for locale+style -> PhraseEngine key resolution"
    - "EnStyleKey(style) is the English-only style switch, called only from ResolveLocaleKey"
    - "SetPhraseStyle guards on fr/es/de/pl and auto-with-non-English-UI; ja is explicitly NOT guarded"

key-files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml.cs
    - FuzzyClock.App/SettingsWindow.xaml.cs

key-decisions:
  - "ResolveLocaleKey handles the auto case using CurrentUICulture.TwoLetterISOLanguageName; returns base locale for fr/es/de/ja/pl, EnStyleKey for auto-English"
  - "SetPhraseStyle auto guard: only blocks when auto-detected UI language is fr/es/de/ja/pl — ja explicit is not blocked"
  - "SettingsWindow isStyleSupported: true for 'en', 'ja', or 'auto' with no non-English UI; false for fr/es/de/pl"

patterns-established:
  - "All locale+style resolution routes through ResolveLocaleKey — no inline switch expressions at call sites"

requirements-completed: [JA-04, JA-05]

# Metrics
duration: 12min
completed: 2026-03-27
---

# Phase 62 Plan 01: Routing Consolidation Summary

**ResolveLocaleKey helper extracted into MainWindow, consolidating three duplicate locale-resolution switch expressions and enabling Japanese phrase style variants in SettingsWindow**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-27T00:00:00Z
- **Completed:** 2026-03-27T00:12:00Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- Added `ResolveLocaleKey(string locale, string style)` and `EnStyleKey(string style)` private static helpers in MainWindow
- Replaced three copies of the locale-resolution switch in ApplySettings, SetLanguage, and SetPhraseStyle with single `ResolveLocaleKey(...)` calls
- `SetPhraseStyle` now guards on fr/es/de/pl only — Japanese locale is no longer blocked from style changes
- SettingsWindow `CmbPhraseStyle.IsEnabled` is now true for "en", "ja", and "auto" (when no non-English UI detected)
- 351 tests pass (314 Core + 37 App), 0 failures, 0 new warnings

## Task Commits

Each task was committed atomically:

1. **Task 1+2: Add helpers and fix SettingsWindow** - `eb2e338` (feat)
2. **Task 3: Build and test verification** - (no code changes, verified in Task 1+2 commit)

## Files Created/Modified
- `FuzzyClock.App/MainWindow.xaml.cs` - Added ResolveLocaleKey and EnStyleKey helpers; simplified ApplySettings, SetLanguage, SetPhraseStyle
- `FuzzyClock.App/SettingsWindow.xaml.cs` - Replaced isNonEnglish pattern with isStyleSupported in PopulateControls and CmbPhraseLanguage_SelectionChanged

## Decisions Made
- `ResolveLocaleKey` auto branch: detects Windows UI language; returns base locale for fr/es/de/ja/pl, delegates to EnStyleKey for English-UI auto
- `SetPhraseStyle` auto guard: when locale is "auto" and UI language is "ja", the style change is blocked (auto-Japanese has no style variants exposed via auto-detect path)
- `SettingsWindow.CmbPhraseLanguage_SelectionChanged`: uses `locale is "en" or "ja" or "auto"` — simple and forward-compatible

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- 6 pre-existing CS0067 warnings for unused LCD stub events (LcdUse24HrChanged, LcdShowSecondsChanged, LcdStyleChanged) confirmed pre-existing before this plan's changes — not introduced by these edits.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 63 (SettingsWindow LCD UI) can now proceed — the routing consolidation dependency (JA-04/JA-05) is fulfilled
- Japanese phrase style variants are fully routable via ResolveLocaleKey; SettingsWindow combo will be enabled when user selects Japanese

---
*Phase: 62-routing-consolidation*
*Completed: 2026-03-27*
