---
phase: 45-english-phrase-style-personalities
plan: 01
subsystem: phrase-engine
tags: [phrase-provider, tdd, iphraseProvider, british, poetic, rude]

# Dependency graph
requires:
  - phase: 41-phraseengine-provider-refactor
    provides: IPhraseProvider interface and PhraseEngine provider registry seam
provides:
  - TersePhraseProvider (en-terse): 11-bucket British-idiom phrases
  - PoeticPhraseProvider (en-poetic): hour-range evocative time-of-day phrases
  - RudePhraseProvider (en-rude): 12-bucket blunt callout phrases
  - PhraseEngine: four locale registrations (en-classic, en-terse, en-poetic, en-rude)
  - PhraseStyleProviderTests: 12 tests covering all three new providers
affects: [46-japanese-phrase-provider, plan-02-phrase-style-ui-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Flat independent IPhraseProvider classes (no shared base class)
    - GetStructuredPhrase returns ("", GetPhrase(dt)) for providers with no natural split
    - TDD RED/GREEN/REFACTOR with [TestCleanup] resetting static PhraseEngine locale

key-files:
  created:
    - FuzzyClock.Core/TersePhraseProvider.cs
    - FuzzyClock.Core/PoeticPhraseProvider.cs
    - FuzzyClock.Core/RudePhraseProvider.cs
    - FuzzyClock.Core.Tests/PhraseStyleProviderTests.cs
  modified:
    - FuzzyClock.Core/PhraseEngine.cs

key-decisions:
  - "Terse bucket table uses 11 entries (not 12): half {h1} covers minutes 23-32 so that minute 30 produces British 'half four' — no separate 'half past {h}' entry needed"
  - "Poetic provider uses hour-range conditionals (not bucket walk): semantics are time-of-day segments, not per-minute resolution"
  - "Rude/Terse duplication (HourWords + bucket walk) is acceptable per flat-provider pattern — no extraction to shared base"
  - "All three providers implement GetStructuredPhrase as ('', GetPhrase(dt)): no natural qualifier split exists"

patterns-established:
  - "New style providers: copy bucket walk from EnglishPhraseProvider, replace Buckets array, GetStructuredPhrase returns (\"\", GetPhrase(dt))"
  - "[TestCleanup] mandatory for any [TestClass] that calls PhraseEngine.SetLocale: static state persists across parallel test methods"

requirements-completed: [STYLE-01, STYLE-02, STYLE-03]

# Metrics
duration: 3min
completed: 2026-03-09
---

# Phase 45 Plan 01: English Phrase Style Providers Summary

**Three new IPhraseProvider implementations (en-terse British idiom, en-poetic time-of-day, en-rude callouts) registered in PhraseEngine, test suite grows from 122 to 139 passing tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-09T02:37:29Z
- **Completed:** 2026-03-09T02:40:02Z
- **Tasks:** 2 (RED + GREEN; REFACTOR skipped — no extraction needed)
- **Files modified:** 5

## Accomplishments

- TersePhraseProvider: 11-bucket British-idiom table including "half four" for 3:30, "quarter past three", bare hour word "three"
- PoeticPhraseProvider: hour-range segments (the witching hour, high noon, the small hours, the golden hour, etc.)
- RudePhraseProvider: 12-bucket table with callout suffixes on 5 entries (what do you want, wake up, still here?, move it, get on with it)
- PhraseEngine._providers now holds four locale keys: en-classic, en-terse, en-poetic, en-rude
- PhraseStyleProviderTests.cs: three [TestClass] blocks with 12 tests, each class has [TestCleanup] resetting to en-classic

## Task Commits

Each task was committed atomically:

1. **RED — Failing tests for Terse/Poetic/Rude** - `7519bd4` (test)
2. **GREEN — Three providers + PhraseEngine registry** - `d12cadb` (feat)

**Plan metadata:** (created after this summary)

_Note: TDD tasks have two commits (test RED → feat GREEN). REFACTOR not needed._

## Files Created/Modified

- `FuzzyClock.Core/TersePhraseProvider.cs` — British-idiom bucket table, GetStructuredPhrase returns ("", phrase)
- `FuzzyClock.Core/PoeticPhraseProvider.cs` — Hour-range conditional GetPhrase, GetStructuredPhrase returns ("", phrase)
- `FuzzyClock.Core/RudePhraseProvider.cs` — Blunt callout bucket table, GetStructuredPhrase returns ("", phrase)
- `FuzzyClock.Core/PhraseEngine.cs` — Added en-terse, en-poetic, en-rude to _providers dictionary
- `FuzzyClock.Core.Tests/PhraseStyleProviderTests.cs` — 12 new tests across three [TestClass] blocks

## Decisions Made

- Terse bucket table uses 11 entries: "half {h1}" covers minutes 23-32 so that minute 30 (3:30) produces "half four". The original spec showed `(27, "half {h1}")` and `(32, "half past {h}")` as separate buckets, but that would put minute 30 into "half past three" instead of "half four". Merged into one `(32, "half {h1}")` bucket.
- Poetic provider uses hour-range conditionals rather than a bucket walk: time-of-day segments don't fit the per-minute bucket model.
- HourWords array and bucket walk are duplicated across Terse and Rude — acceptable per project pattern of flat independent providers with no shared base class.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adjusted Terse bucket bounds so minute 30 hits "half {h1}" not "half past {h}"**
- **Found during:** GREEN phase (test run after first implementation)
- **Issue:** Spec showed `(27, "half {h1}")` and `(32, "half past {h}")` as separate buckets. Minute 30 > 27, so it fell into the 32 bucket producing "half past three" instead of the expected "half four".
- **Fix:** Merged into single `(32, "half {h1}")` bucket covering minutes 23-32; removed the separate "half past {h}" entry (it's semantically equivalent in British English).
- **Files modified:** FuzzyClock.Core/TersePhraseProvider.cs
- **Verification:** `Terse_HalfHour_ReturnsBritishHalf` and `Terse_GetStructuredPhrase_ReturnsEmptyQualifier` both pass
- **Committed in:** d12cadb (GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bucket boundary bug)
**Impact on plan:** Necessary for test correctness; no scope change.

## Issues Encountered

None beyond the bucket boundary adjustment above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- en-terse, en-poetic, en-rude are fully registered and testable via PhraseEngine.SetLocale()
- Ready for Plan 02: wire Phrase Style selector in the Settings window to call SetLocale with the new locale keys
- AppSettings.PhraseStyle string field should accept "en-classic" | "en-terse" | "en-poetic" | "en-rude"

---
*Phase: 45-english-phrase-style-personalities*
*Completed: 2026-03-09*
