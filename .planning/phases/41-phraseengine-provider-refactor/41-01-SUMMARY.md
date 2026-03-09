---
phase: 41-phraseengine-provider-refactor
plan: 01
subsystem: core
tags: [phrase-engine, provider-pattern, interface, refactor]

# Dependency graph
requires: []
provides:
  - IPhraseProvider interface in FuzzyClock.Core
  - EnglishPhraseProvider class implementing IPhraseProvider
  - PhraseEngine static facade with SetLocale()/CurrentLocale and _providers dictionary
affects:
  - 42-phrase-styles
  - 45-phrase-styles
  - 46-multilingual

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Provider pattern: phrase logic extracted behind IPhraseProvider interface
    - Static facade: PhraseEngine remains static but routes through active provider instance

key-files:
  created:
    - FuzzyClock.Core/IPhraseProvider.cs
    - FuzzyClock.Core/EnglishPhraseProvider.cs
  modified:
    - FuzzyClock.Core/PhraseEngine.cs

key-decisions:
  - "IPhraseProvider has exactly two methods (GetPhrase, GetStructuredPhrase); SetLocale/CurrentLocale stay on PhraseEngine as coordinator concerns"
  - "EnglishPhraseProvider is public (not internal) to allow direct construction in future isolation tests"
  - "_providers dictionary declared before _activeProvider to avoid static initializer ordering issues"
  - "SetLocale returns bool: true=swapped, false=unknown locale (active provider unchanged)"

patterns-established:
  - "Provider registration: _providers dictionary keyed by locale string (e.g. 'en-classic')"
  - "Locale key format: language-style (e.g. 'en-classic', 'ja-standard')"

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-03-08
---

# Phase 41 Plan 01: PhraseEngine Provider Refactor Summary

**PhraseEngine refactored from monolithic static class to static facade routing through IPhraseProvider, with English Classic logic extracted to EnglishPhraseProvider; all 122 tests pass unchanged**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-08T00:52:08Z
- **Completed:** 2026-03-08T00:54:08Z
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 refactored)

## Accomplishments

- Created `IPhraseProvider` interface with `GetPhrase(DateTime)` and `GetStructuredPhrase(DateTime)` — the extensibility seam for phrase styles and multilingual support
- Extracted all English Classic phrase logic (HourWords, Buckets, both methods) into `EnglishPhraseProvider : IPhraseProvider` verbatim
- Replaced PhraseEngine body with static facade: `_providers` dictionary, `_activeProvider`, `CurrentLocale`, `SetLocale()` — zero changes to public API surface
- All 122 tests (97 Core + 25 App) pass with zero modifications; `MainWindow.xaml.cs` unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Create IPhraseProvider interface** - `04a261a` (feat)
2. **Task 2: Extract EnglishPhraseProvider** - `d0f504e` (feat)
3. **Task 3: Refactor PhraseEngine to static facade** - `65fe454` (refactor)

## Files Created/Modified

- `FuzzyClock.Core/IPhraseProvider.cs` — public interface with two methods; unblocks Phase 46 language providers
- `FuzzyClock.Core/EnglishPhraseProvider.cs` — English Classic phrase logic as IPhraseProvider implementation
- `FuzzyClock.Core/PhraseEngine.cs` — stripped to static facade; retains identical public API (`GetPhrase`, `GetStructuredPhrase`); gains `SetLocale()` and `CurrentLocale`

## Decisions Made

- IPhraseProvider holds only provider concerns (generating phrases); coordination concerns (`SetLocale`, `CurrentLocale`, provider registry) stay on `PhraseEngine`
- `EnglishPhraseProvider` is `public` (not `internal`) to allow direct construction in isolation tests in later phases
- `_providers` dictionary declared before `_activeProvider` field to respect C# static initializer ordering
- `SetLocale()` returns `bool` (true = swapped, false = unknown locale, no state change) rather than throwing

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Provider extensibility seam is in place; Phase 42+ can add new providers by implementing `IPhraseProvider` and registering in `_providers`
- `SetLocale()` is ready to wire into Settings window (Phase 42) and tray menu
- No blockers; `MainWindow.xaml.cs` requires zero changes when new providers are added

## Self-Check: PASSED

- FOUND: FuzzyClock.Core/IPhraseProvider.cs
- FOUND: FuzzyClock.Core/EnglishPhraseProvider.cs
- FOUND: FuzzyClock.Core/PhraseEngine.cs
- FOUND: .planning/phases/41-phraseengine-provider-refactor/41-01-SUMMARY.md
- FOUND commit 04a261a (feat: IPhraseProvider)
- FOUND commit d0f504e (feat: EnglishPhraseProvider)
- FOUND commit 65fe454 (refactor: PhraseEngine facade)

---
*Phase: 41-phraseengine-provider-refactor*
*Completed: 2026-03-08*
