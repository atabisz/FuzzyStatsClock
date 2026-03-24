---
phase: 62-routing-consolidation
plan: 01
subsystem: phrase-routing
tags: [refactor, routing, japanese, phrase-engine, settings-window]
dependency_graph:
  requires: [61-02-SUMMARY.md]
  provides: [ResolveLocaleKey helper, consolidated locale routing, ja-* combo enable]
  affects: [MainWindow.xaml.cs, SettingsWindow.xaml.cs, PhraseEngine.cs, PhraseEngineCoordinatorTests.cs]
tech_stack:
  added: []
  patterns: [ResolveLocaleKey private helper consolidating all locale switch ladders]
key_files:
  modified:
    - FuzzyClock.App/MainWindow.xaml.cs
    - FuzzyClock.Core/PhraseEngine.cs
    - FuzzyClock.App/SettingsWindow.xaml.cs
    - FuzzyClock.Core.Tests/PhraseEngineCoordinatorTests.cs
decisions:
  - "ResolveLocaleKey uses phraseLocale, phraseStyle, uiLang params; auto+Japanese routes to ja-style (not bare ja)"
  - "Bare ja key removed from PhraseEngine._providers; all Japanese routing via ja-classic/terse/poetic/rude"
  - "SettingsWindow enables phrase style combo for explicit en or ja only; auto-detected Japanese stays disabled"
metrics:
  duration: 4m
  completed: "2026-03-24"
  tasks_completed: 2
  files_modified: 4
requirements_addressed: [JA-04, JA-05]
---

# Phase 62 Plan 01: Routing Consolidation Summary

**One-liner:** Extracted ResolveLocaleKey private helper consolidating three duplicate locale-switch ladders; removed bare "ja" key from PhraseEngine; enabled phrase style combo for explicit Japanese selection in SettingsWindow.

## Objective

Consolidate duplicate locale-routing logic so Japanese phrase style selection works end-to-end (persist, restore, live switch). Unblocks Phase 63+ which depends on stable routing.

## Tasks Completed

| Task | Name | Commit | Files Modified |
|------|------|--------|----------------|
| 1 | Extract ResolveLocaleKey, consolidate routing, remove bare ja key, update SettingsWindow combo | a87e738 | MainWindow.xaml.cs, PhraseEngine.cs, SettingsWindow.xaml.cs |
| 2 | Update coordinator tests — fix broken bare-ja test and add GetPhrase round-trip tests | 01b0852 | PhraseEngineCoordinatorTests.cs |

## Changes Made

### Task 1: Production code changes

**ResolveLocaleKey helper (MainWindow.xaml.cs)**

Added `private string ResolveLocaleKey(string phraseLocale, string phraseStyle, string uiLang)` after `SetLanguage`. The helper consolidates all locale-routing logic:
- `fr/es/de/pl` explicit → return bare language code (style ignored)
- `ja` explicit → route through ja-style switch (classic/terse/poetic/rude)
- `en` explicit → route through en-style switch (classic/terse/poetic/rude/pirate/dwarf/jive/valleygirl/yoda/shakespeare)
- `auto` + fr/es/de/pl system → return bare language code
- `auto` + Japanese system → route through ja-style switch (NOT bare "ja" — bare key removed)
- `auto` + English system → route through en-style switch

**Routing site consolidations (MainWindow.xaml.cs)**

- ApplySettings: replaced 43-line if/else ladder with `ResolveLocaleKey(_currentPhraseLocale, _currentPhraseStyle, uiLang)`
- SetLanguage: replaced 35-line if/else block with `ResolveLocaleKey(locale, _currentPhraseStyle, uiLang)`
- SetPhraseStyle: widened guard from `!StartsWith("en-")` to also allow `"ja-"`; replaced switch ladder with `ResolveLocaleKey("ja", style, uiLang)` or `ResolveLocaleKey("en", style, uiLang)` based on current locale prefix

**PhraseEngine.cs**

Removed `["ja"] = new JapanesePhraseProvider()` entry. `["ja-classic"]` remains; all Japanese routing now exclusively uses `ja-classic/terse/poetic/rude`.

**SettingsWindow.xaml.cs**

- `PopulateControls`: replaced `bool isNonEnglish = nonEnglishActive || s.PhraseLocale is ...` with `CmbPhraseStyle.IsEnabled = s.PhraseLocale is "en" or "ja" || (s.PhraseLocale == "auto" && !nonEnglishActive)`
- `CmbPhraseLanguage_SelectionChanged`: replaced `locale is "fr" or "es" or "de" or "ja" or "pl"` with `locale is "en" or "ja"` (positive enable condition)

### Task 2: Test updates

- Renamed `SetLocale_Ja_ReturnsTrue` to `SetLocale_JaBare_ReturnsFalse_AfterKeyRemoval`, inverted assertion to `IsFalse` (documents bare "ja" intentionally unsupported post-Phase 62)
- Added four new GetPhrase round-trip tests: `GetPhrase_JaClassic_ReturnsNonEmpty`, `GetPhrase_JaTerse_ReturnsNonEmpty`, `GetPhrase_JaPoetic_ReturnsNonEmpty`, `GetPhrase_JaRude_ReturnsNonEmpty`

## Verification Results

- Build: 0 errors, 6 warnings (all pre-existing LCD stub event warnings from Phase 58)
- FuzzyClock.Core.Tests: 318 passed, 0 failed (299 baseline + 15 Phase 61 + 4 new)
- FuzzyClock.App.Tests: 37 passed, 0 failed (no regressions)
- `ResolveLocaleKey` appears at 4 call sites in MainWindow.xaml.cs (definition + 3 routing sites)
- No bare `["ja"]` key remains in PhraseEngine.cs
- SettingsWindow combo enable: `s.PhraseLocale is "en" or "ja"` confirmed at line 103 and 437

## Deviations from Plan

None — plan executed exactly as written. All decisions D-01 through D-10 implemented as specified in CONTEXT.md.

## Known Stubs

None — all routing is live and connected.

## Self-Check: PASSED

- `FuzzyClock.App/MainWindow.xaml.cs` — modified (ResolveLocaleKey + consolidated routing)
- `FuzzyClock.Core/PhraseEngine.cs` — modified (bare ja key removed)
- `FuzzyClock.App/SettingsWindow.xaml.cs` — modified (combo enable logic updated)
- `FuzzyClock.Core.Tests/PhraseEngineCoordinatorTests.cs` — modified (bare-ja test inverted + 4 new tests)
- Commit a87e738 — confirmed in git log
- Commit 01b0852 — confirmed in git log
- 318 tests pass, 0 failures
