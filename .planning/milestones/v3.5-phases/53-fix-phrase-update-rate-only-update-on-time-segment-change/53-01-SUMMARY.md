---
phase: 53-fix-phrase-update-rate-only-update-on-time-segment-change
plan: 01
subsystem: phrase-engine
tags: [phrase-provider, segment-key, bucket-based, random-candidates, poetic-provider]

# Dependency graph
requires:
  - phase: 47-phrase-styles-and-multilingual
    provides: IPhraseProvider interface with GetPhrase and GetStructuredPhrase; all 9 providers

provides:
  - IPhraseProvider.GetSegmentKey(DateTime) — stable bucket-identity method, random-independent
  - PhraseEngine.GetSegmentKey static facade
  - RudePhraseProvider.GetSegmentKey returning en-rude:N bucket-index keys
  - PoeticPhraseProvider rewritten with 12 minute-buckets and 3-4 random candidates each
  - PoeticPhraseProvider.GetSegmentKey returning en-poetic:N / en-poetic:witching / en-poetic:noon
  - 7 deterministic providers (English, Terse, French, Spanish, German, Japanese, Polish) return GetPhrase as key
  - SegmentKeyTests.cs — contract tests for same-bucket/adjacent-bucket/special-key invariants

affects: [53-02-phrase-update-rate-mainwindow, any future phrase provider additions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - GetSegmentKey returns bucket-index key independent of random candidate selection
    - Locale-prefixed keys (en-rude:N, en-poetic:N) prevent cross-provider collisions
    - Deterministic providers use phrase text as segment key (stable by definition)

key-files:
  created:
    - FuzzyClock.Core.Tests/SegmentKeyTests.cs
  modified:
    - FuzzyClock.Core/IPhraseProvider.cs
    - FuzzyClock.Core/PhraseEngine.cs
    - FuzzyClock.Core/PoeticPhraseProvider.cs
    - FuzzyClock.Core/RudePhraseProvider.cs
    - FuzzyClock.Core/EnglishPhraseProvider.cs
    - FuzzyClock.Core/TersePhraseProvider.cs
    - FuzzyClock.Core/FrenchPhraseProvider.cs
    - FuzzyClock.Core/SpanishPhraseProvider.cs
    - FuzzyClock.Core/GermanPhraseProvider.cs
    - FuzzyClock.Core/JapanesePhraseProvider.cs
    - FuzzyClock.Core/PolishPhraseProvider.cs
    - FuzzyClock.Core.Tests/PhraseStyleProviderTests.cs

key-decisions:
  - "GetSegmentKey uses locale-prefixed bucket-index keys (en-rude:0..11) so different providers never produce colliding keys for the same time"
  - "Deterministic providers use GetPhrase as GetSegmentKey — phrase text is inherently stable between 10s ticks within the same bucket"
  - "PoeticPhraseProvider rewritten from hour-range single-phrase to minute-bucket with 3-4 random candidates matching RudePhraseProvider structure"
  - "PoeticPhraseProvider witching hour (00:00) and high noon (12:00) specials preserved with named keys en-poetic:witching and en-poetic:noon"

patterns-established:
  - "Segment key pattern: bucket-index key independent of random selection — same bucket always same key"
  - "Locale prefix on keys: en-rude:N and en-poetic:N prevent cross-provider collisions when comparing keys"

requirements-completed: [SEGKEY-01, SEGKEY-02, POETIC-01]

# Metrics
duration: 10min
completed: 2026-03-18
---

# Phase 53 Plan 01: Add GetSegmentKey to IPhraseProvider and Rewrite PoeticPhraseProvider Summary

**GetSegmentKey(DateTime) added to all 9 phrase providers with locale-prefixed bucket-index keys; PoeticPhraseProvider rewritten from hour-range to minute-bucket structure with 3-4 random atmospheric candidates per bucket**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-18T16:00:00Z
- **Completed:** 2026-03-18T16:10:00Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- Added `string GetSegmentKey(DateTime dt)` to `IPhraseProvider` and `PhraseEngine` static facade
- Implemented GetSegmentKey across all 9 providers: 7 deterministic (returns GetPhrase) + RudePhraseProvider (en-rude:N bucket index) + PoeticPhraseProvider (en-poetic:N bucket index)
- Rewrote PoeticPhraseProvider from broad hour-range single phrases to 12 minute-buckets with 3-4 atmospheric random candidates each, preserving witching hour and high noon specials
- Created SegmentKeyTests.cs with 20 new tests covering same-bucket invariant, adjacent-bucket differentiation, and special-key contracts for both Rude and Poetic providers
- All 242 Core tests pass (was 222, +20 new)

## Task Commits

1. **Task 1: Add GetSegmentKey to IPhraseProvider and all providers** — `a82cd2a` (feat)
2. **Task 2: SegmentKeyTests and updated PoeticPhraseProviderTests** — `83d95c9` (test)

## Files Created/Modified

- `FuzzyClock.Core/IPhraseProvider.cs` — Added GetSegmentKey method declaration
- `FuzzyClock.Core/PhraseEngine.cs` — Added GetSegmentKey static facade
- `FuzzyClock.Core/PoeticPhraseProvider.cs` — Full rewrite: 12 minute-buckets, 3-4 random candidates, GetSegmentKey
- `FuzzyClock.Core/RudePhraseProvider.cs` — Added GetSegmentKey with en-rude:N bucket-index keys
- `FuzzyClock.Core/EnglishPhraseProvider.cs` — Added GetSegmentKey returning GetPhrase
- `FuzzyClock.Core/TersePhraseProvider.cs` — Added GetSegmentKey returning GetPhrase
- `FuzzyClock.Core/FrenchPhraseProvider.cs` — Added GetSegmentKey returning GetPhrase
- `FuzzyClock.Core/SpanishPhraseProvider.cs` — Added GetSegmentKey returning GetPhrase
- `FuzzyClock.Core/GermanPhraseProvider.cs` — Added GetSegmentKey returning GetPhrase
- `FuzzyClock.Core/JapanesePhraseProvider.cs` — Added GetSegmentKey returning GetPhrase
- `FuzzyClock.Core/PolishPhraseProvider.cs` — Added GetSegmentKey returning GetPhrase
- `FuzzyClock.Core.Tests/PhraseStyleProviderTests.cs` — Replaced Poetic_SmallHours test with Poetic_WitchingHour + Poetic_RegularTime
- `FuzzyClock.Core.Tests/SegmentKeyTests.cs` — New: RudeSegmentKeyTests, PoeticSegmentKeyTests, DeterministicSegmentKeyTests

## Decisions Made

- GetSegmentKey uses locale-prefixed bucket-index keys (en-rude:0..11, en-poetic:0..11) so keys from different providers can never collide, enabling future cross-provider comparisons without namespace conflicts.
- Deterministic providers return `GetPhrase(dt)` as the segment key — since the same bucket always produces the same phrase text, this is a valid stable key.
- PoeticPhraseProvider rewritten to mirror RudePhraseProvider's bucket structure exactly (same 12 bucket boundaries: 2, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 59), making the two providers consistent in update granularity.
- The witching hour (00:00) and high noon (12:00) specials get named keys (en-poetic:witching, en-poetic:noon) rather than falling into a bucket, matching how RudePhraseProvider handles midnight and noon.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. The build error (CS0535 on PoeticPhraseProvider) was expected — Task 1 required completing PoeticPhraseProvider's GetSegmentKey before the build would pass, so the PoeticPhraseProvider rewrite was folded into the Task 1 commit. Both tasks were committed separately as planned.

## Next Phase Readiness

- Plan 02 can now wire `PhraseEngine.GetSegmentKey` into MainWindow to fix the 10-second phrase flickering bug on random-candidate providers (Rude and Poetic)
- All Core-layer segment-key infrastructure is complete and tested

---
*Phase: 53-fix-phrase-update-rate-only-update-on-time-segment-change*
*Completed: 2026-03-18*
