---
phase: 46-multilingual-phrases
plan: 01
subsystem: phrase-engine
tags: [csharp, tdd, phrase-provider, multilingual, french, spanish, german, japanese, polish]

# Dependency graph
requires:
  - phase: 45-english-phrase-style-personalities
    provides: IPhraseProvider interface, PhraseEngine registry, TersePhraseProvider pattern

provides:
  - FrenchPhraseProvider (12 buckets, midi/minuit)
  - SpanishPhraseProvider (12 buckets, mediodía/medianoche)
  - GermanPhraseProvider (12 buckets, Mittag/Mitternacht)
  - JapanesePhraseProvider (12 buckets, 正午/真夜中)
  - PolishPhraseProvider (12 buckets, południe/północ)
  - PhraseEngine with 9 providers (fr/es/de/ja/pl registered)
  - 85 new tests (20 provider contract tests + 5 SetLocale coordinator tests + 60 DataRow probes)
affects:
  - 46-02 (App wiring for locale selection depends on these provider registrations)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Bucket-table phrase provider pattern with {h}/{h1} placeholders (TersePhraseProvider)
    - DoNotParallelize on static-state coordinator tests to prevent locale leaks

key-files:
  created:
    - FuzzyClock.Core/FrenchPhraseProvider.cs
    - FuzzyClock.Core/SpanishPhraseProvider.cs
    - FuzzyClock.Core/GermanPhraseProvider.cs
    - FuzzyClock.Core/JapanesePhraseProvider.cs
    - FuzzyClock.Core/PolishPhraseProvider.cs
    - FuzzyClock.Core.Tests/MultilingualPhraseProviderTests.cs
  modified:
    - FuzzyClock.Core/PhraseEngine.cs
    - FuzzyClock.Core.Tests/PhraseEngineCoordinatorTests.cs

key-decisions:
  - "[DoNotParallelize] added to PhraseEngineCoordinatorTests: SetLocale mutates static PhraseEngine state; parallel tests caused locale contamination (was pre-existing failure in HourWrap test too)"
  - "SetLocale_UnknownLocale test updated from 'fr' to 'zh' as test subject: fr is now a known locale"
  - "Japanese phrases provisional — native-speaker review recommended for bucket naturalness"

patterns-established:
  - "New language providers: follow TersePhraseProvider structure exactly (HourWords array, Buckets array, noon/midnight totalMinutes checks)"
  - "Multilingual provider tests: 4 per language (noon, midnight, AllBuckets DataRow, GetStructuredPhrase qualifier)"
  - "Static PhraseEngine tests: always [DoNotParallelize] to prevent locale race conditions"

requirements-completed: [LANG-02, LANG-03]

# Metrics
duration: 4min
completed: 2026-03-09
---

# Phase 46 Plan 01: Multilingual Phrase Providers Summary

**Five language providers (fr/es/de/ja/pl) with 12-bucket phrase tables registered in PhraseEngine, TDD-verified with 20 contract tests covering noon/midnight/all-buckets/structured-phrase**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-09T04:33:09Z
- **Completed:** 2026-03-09T04:37:06Z
- **Tasks:** 1 (TDD: RED + GREEN, no refactor needed)
- **Files modified:** 8

## Accomplishments
- Five new IPhraseProvider classes following the TersePhraseProvider bucket-table pattern
- PhraseEngine._providers expanded from 4 to 9 entries (fr/es/de/ja/pl added)
- SetLocale("fr"/"es"/"de"/"ja"/"pl") each returns true; SetLocale("zh") returns false (LANG-04 baseline)
- 20 new contract tests (4 per language) plus 5 coordinator SetLocale tests
- Fixed pre-existing flaky HourWrap test caused by parallel static state contamination

## Task Commits

1. **RED: Failing tests** - `c340712` (test)
2. **GREEN: Provider implementations + registry** - `ef7a952` (feat)

**Plan metadata:** (this commit)

_Note: TDD plan — test commit then implementation commit. No refactor pass needed._

## Files Created/Modified
- `FuzzyClock.Core/FrenchPhraseProvider.cs` - French phrases (midi/minuit, 12 buckets)
- `FuzzyClock.Core/SpanishPhraseProvider.cs` - Spanish phrases (mediodía/medianoche, 12 buckets)
- `FuzzyClock.Core/GermanPhraseProvider.cs` - German phrases (Mittag/Mitternacht, 12 buckets)
- `FuzzyClock.Core/JapanesePhraseProvider.cs` - Japanese phrases (正午/真夜中, 12 buckets)
- `FuzzyClock.Core/PolishPhraseProvider.cs` - Polish phrases (południe/północ, 12 buckets)
- `FuzzyClock.Core/PhraseEngine.cs` - Registry expanded from 4 to 9 providers
- `FuzzyClock.Core.Tests/MultilingualPhraseProviderTests.cs` - 5 test classes, 20 contract tests
- `FuzzyClock.Core.Tests/PhraseEngineCoordinatorTests.cs` - 5 new SetLocale tests; [DoNotParallelize] added; "fr" test updated to "zh"

## Decisions Made
- `[DoNotParallelize]` applied to `PhraseEngineCoordinatorTests`: `PhraseEngine` is static and `SetLocale` mutates global state. The `MethodLevel` parallelization in `MSTestSettings.cs` caused the existing `HourWrap_QualifierAndEmphasis` test to flake (it called `PhraseEngine.GetStructuredPhrase` while other tests were concurrently mutating the locale). `[DoNotParallelize]` serializes only the coordinator class while keeping all other tests parallel.
- Japanese provider marked "provisional" with comment requesting native-speaker review — confirmed from PLAN.md instructions.
- German provider comment added: "Standard High German; 'halb X' means half past X-1" — distinguishes from Austrian/Swiss variants.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing HourWrap test flakiness via [DoNotParallelize]**
- **Found during:** GREEN phase (test run)
- **Issue:** `HourWrap_QualifierAndEmphasis` was failing intermittently due to parallel test execution mutating `PhraseEngine` static locale state. The test calls `PhraseEngine.GetStructuredPhrase` which uses `_activeProvider`, and concurrent `SetLocale` calls from coordinator tests caused wrong provider to be active.
- **Fix:** Added `[DoNotParallelize]` to `PhraseEngineCoordinatorTests` class, serializing all locale-mutating coordinator tests.
- **Files modified:** FuzzyClock.Core.Tests/PhraseEngineCoordinatorTests.cs
- **Verification:** All 199 tests pass including HourWrap tests
- **Committed in:** ef7a952 (GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Fix resolves pre-existing flaky test, no scope creep.

## Issues Encountered
- Tests initially had 2 failures after GREEN phase due to parallel locale contamination. Adding `[DoNotParallelize]` to the coordinator test class resolved all failures.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 language providers registered and tested; PhraseEngine.SetLocale("fr"/"es"/"de"/"ja"/"pl") each returns true
- Plan 02 (App wiring: tray locale menu, AppSettings.Language, UI integration) is unblocked
- Blocker note: Japanese phrase naturalness is medium confidence; native-speaker review recommended

---
*Phase: 46-multilingual-phrases*
*Completed: 2026-03-09*

## Self-Check: PASSED

- FuzzyClock.Core/FrenchPhraseProvider.cs: FOUND
- FuzzyClock.Core/SpanishPhraseProvider.cs: FOUND
- FuzzyClock.Core/GermanPhraseProvider.cs: FOUND
- FuzzyClock.Core/JapanesePhraseProvider.cs: FOUND
- FuzzyClock.Core/PolishPhraseProvider.cs: FOUND
- FuzzyClock.Core.Tests/MultilingualPhraseProviderTests.cs: FOUND
- .planning/phases/46-multilingual-phrases/46-01-SUMMARY.md: FOUND
- Commits c340712 (RED) and ef7a952 (GREEN): FOUND
- All 199 tests pass, 0 failures
