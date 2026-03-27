---
phase: 55-phrase-personalities
plan: 03
subsystem: testing
tags: [mstest, phrase-engine, provider-tests, static-state, parallelism]

# Dependency graph
requires:
  - phase: 55-02
    provides: "All 6 new IPhraseProvider classes registered in PhraseEngine and wired in Settings UI"
provides:
  - Six new test classes (Pirate, Dwarf, Jive, ValleyGirl, Yoda, Shakespeare) each with [TestCleanup] and 3 test methods
  - Updated Rude tests (already current from Plan 02) verified passing
  - Pre-existing HourWrap_QualifierAndEmphasis race condition fixed via serial test execution
  - 265 total tests (232 Core + 33 App), 0 failures, deterministic
affects: [phase-56, phase-57]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MSTest serial execution: remove [assembly: Parallelize] when static shared state causes race conditions"
    - "GetStructuredPhraseTests: [DoNotParallelize] + [TestInitialize] EnsureClassicLocale as belt-and-suspenders"

key-files:
  created: []
  modified:
    - FuzzyClock.Core.Tests/PhraseStyleProviderTests.cs
    - FuzzyClock.Core.Tests/PhraseEngineTests.cs
    - FuzzyClock.Core.Tests/MSTestSettings.cs

key-decisions:
  - "Removed [assembly: Parallelize(Scope = ExecutionScope.MethodLevel)] from MSTestSettings.cs: PhraseEngine has a single global _activeProvider static field; MethodLevel parallelism causes non-deterministic locale races; serial execution costs <50ms extra"
  - "PhraseEngineTests: added [TestInitialize] EnsureClassicLocale for future-proofing; redundant under serial execution but guards against accidental re-introduction of parallelism"

patterns-established:
  - "Provider test class pattern: [TestCleanup] EnsureClassicLocale + SetLocale_En{Style}_ReturnsTrue + noon AreEqual + on-the-hour StringAssert.Contains"

requirements-completed: [PHRASE-09]

# Metrics
duration: 20min
completed: 2026-03-11
---

# Phase 55 Plan 03: Phrase Personalities Tests Summary

**Six new provider test classes (265 total tests) with pre-existing MethodLevel parallelism race condition fixed by removing assembly-level Parallelize attribute**

## Performance

- **Duration:** 20 min
- **Started:** 2026-03-11T08:36:50Z
- **Completed:** 2026-03-11T08:56:50Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added PiratePhraseProviderTests, DwarfPhraseProviderTests, JivePhraseProviderTests, ValleyGirlPhraseProviderTests, YodaPhraseProviderTests, ShakespearePhraseProviderTests — each with [TestCleanup], SetLocale returns-true check, noon special AreEqual, and on-the-hour StringAssert.Contains
- RudePhraseProviderTests already had correct internet-slang assertions from Plan 02 commit; confirmed passing
- Fixed pre-existing race condition: MethodLevel parallelism + shared PhraseEngine._activeProvider caused ~40% flaky failure rate with 18 new locale-setting tests; resolved by removing Parallelize attribute (serial execution, no architectural changes needed)
- Total test count: 265 (232 Core + 33 App), all passing deterministically in 10/10 consecutive runs

## Task Commits

Each task was committed atomically:

1. **Task 1: Add six new provider test classes and fix locale isolation** - `0792395` (feat)
2. **Task 1 bug fix: Eliminate parallel test flakiness** - `f4066e9` (fix)
3. **Task 2: Full solution test run and count verification** - confirmed via final run

## Files Created/Modified
- `FuzzyClock.Core.Tests/PhraseStyleProviderTests.cs` - Added 6 new test classes (18 new test methods)
- `FuzzyClock.Core.Tests/PhraseEngineTests.cs` - Added [TestInitialize] EnsureClassicLocale to PhraseEngineTests and GetStructuredPhraseTests; added [DoNotParallelize] to GetStructuredPhraseTests
- `FuzzyClock.Core.Tests/MSTestSettings.cs` - Replaced MethodLevel Parallelize with serial execution (comment-only file)

## Decisions Made
- Serial test execution chosen over architectural change to PhraseEngine: `PhraseEngine._activeProvider` is global mutable static state; making it ThreadLocal would work but is an architectural change (Rule 4). Since tests run in <150ms total, serial execution has zero practical cost and eliminates the race permanently.
- Rude tests were already correct (Plan 02 had updated them) — no changes needed to RudePhraseProviderTests methods.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing test flakiness: MethodLevel parallelism races with PhraseEngine static state**
- **Found during:** Task 1 verification
- **Issue:** HourWrap_QualifierAndEmphasis(12,55) and various bucket tests in PhraseEngineTests failed intermittently (~40-60% failure rate). Root cause: [assembly: Parallelize(Scope = ExecutionScope.MethodLevel)] caused multiple test threads to concurrently set PhraseEngine._activeProvider (one global static field). Provider-switching tests in new classes raced with PhraseEngineTests which assumed "en-classic" was always active.
- **Fix:** Removed Parallelize attribute from MSTestSettings.cs (serial execution). Added [DoNotParallelize] and [TestInitialize] EnsureClassicLocale to GetStructuredPhraseTests as belt-and-suspenders. Added [TestInitialize] EnsureClassicLocale to PhraseEngineTests.
- **Files modified:** FuzzyClock.Core.Tests/MSTestSettings.cs, FuzzyClock.Core.Tests/PhraseEngineTests.cs
- **Verification:** 10/10 consecutive full solution test runs passing
- **Committed in:** f4066e9

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Required fix for correctness — the race condition was masked before Plan 55 added 18 new locale-setting tests. Serial execution adds <50ms and eliminates the race permanently.

## Issues Encountered
- First attempt used [TestInitialize] alone on GetStructuredPhraseTests — insufficient; race window between TestInitialize and test body still existed
- Second attempt added [DoNotParallelize] to PhraseEngineTests — this caused PhraseEngineTests.TestInitialize to interfere with parallel Terse/Poetic/Rude tests (TestInitialize ran mid-flight of those tests)
- Third attempt (correct): removed the Parallelize assembly attribute entirely, making all tests serial; MSTest `ExecutionScope.None` is not a valid enum value so the attribute was removed rather than changed

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 265 tests pass deterministically (0 failures, 10/10 runs)
- Phase 55 complete: all 6 new providers implemented, wired, tested
- Phase 56 (Nixie Clock) can proceed; test infrastructure is now stable

---
*Phase: 55-phrase-personalities*
*Completed: 2026-03-11*
