---
phase: 55-update-the-poetic-phrase-clock-to-be-poetic-but-provide-more-hints-to-the-actual-time
plan: 01
subsystem: ui
tags: [phrase-engine, poetic, hour-words, GetStructuredPhrase, templates]

# Dependency graph
requires:
  - phase: 53-fix-phrase-update-rate
    provides: PoeticPhraseProvider with 12 minute-buckets and GetSegmentKey pattern established
provides:
  - PoeticPhraseProvider with 48 candidate templates, all containing {h} or {h1} hour placeholders
  - GetStructuredPhrase returns (qualifier, hourWord) split for typographic hierarchy
  - 8 new tests covering emphasis, qualifier, and all-buckets hour-word assertions
affects: [phrase-display, GetStructuredPhrase callers, PhraseWrapService, MainWindow phrase rendering]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PoeticPhraseProvider follows RudePhraseProvider template pattern exactly: HourWords array, (UpperBound, Candidates[]) buckets, Random.Shared.Next selection, {h}/{h1} placeholders"
    - "Buckets 0-7 end with {h} (current hour), buckets 8-11 end with {h1} (next hour) — constraint enforced by acceptance criteria"
    - "GetStructuredPhrase splits qualifier/emphasis using EndsWith('{h}') and EndsWith('{h1}') — same as EnglishPhraseProvider"

key-files:
  created: []
  modified:
    - FuzzyClock.Core/PoeticPhraseProvider.cs
    - FuzzyClock.Core.Tests/PhraseStyleProviderTests.cs

key-decisions:
  - "All 48 candidate templates end with {h} or {h1} — no text after the hour placeholder; GetStructuredPhrase split relies on this guarantee"
  - "Buckets 0-7 use {h} (past-half, naming current hour); buckets 8-11 use {h1} (to-half, naming next hour)"
  - "Special cases witching hour (00:00) and high noon (12:00) preserved exactly; GetStructuredPhrase returns ('', special-phrase) for both"
  - "GetSegmentKey body unchanged — keys en-poetic:witching, en-poetic:noon, en-poetic:{i} are stable"

patterns-established:
  - "Template-end constraint: all poetic candidates must end with exactly {h} or {h1} for GetStructuredPhrase to work correctly"

requirements-completed: [POETIC-01]

# Metrics
duration: 15min
completed: 2026-03-18
---

# Phase 55 Plan 01: Poetic Provider Hour-Hint Rewrite Summary

**PoeticPhraseProvider rewritten with 48 {h}/{h1} templates naming the current or next hour in every phrase, plus a proper GetStructuredPhrase splitting qualifier from emphasis**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-18T07:30:00Z
- **Completed:** 2026-03-18T07:45:00Z
- **Tasks:** 2 (TDD: Task 1 implementation, Task 2 tests)
- **Files modified:** 2

## Accomplishments
- PoeticPhraseProvider completely rewritten — 48 atmospheric candidates (4 per bucket x 12 buckets), every template ends with `{h}` (buckets 0-7) or `{h1}` (buckets 8-11)
- GetStructuredPhrase now returns `(qualifier, hourWord)` — splits at the placeholder so callers get the hour word as emphasis separately from the atmospheric context
- 8 new test methods replace the single old test, covering all split scenarios, special cases, and all-12-buckets assertion
- Full test suite 274 tests (249 Core + 25 App) all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite PoeticPhraseProvider** - `c593115` (feat) + `30b0a68` (fix: placeholder constraint)
2. **Task 2: Update and expand poetic tests** - `921ce40` (test)

_Note: Task 1 has two commits — the implementation commit and a Rule 1 auto-fix for two candidates that had text after the {h} placeholder._

## Files Created/Modified
- `FuzzyClock.Core/PoeticPhraseProvider.cs` - Complete rewrite with HourWords, 12 buckets of 4 templates, GetPhrase with placeholder resolution, GetStructuredPhrase with qualifier/emphasis split, GetSegmentKey unchanged
- `FuzzyClock.Core.Tests/PhraseStyleProviderTests.cs` - Replaced 1 old test with 8 new tests for the poetic provider

## Decisions Made
- All bucket templates must end with `{h}` or `{h1}` — this is required for GetStructuredPhrase's EndsWith split logic to correctly extract the hour word as emphasis
- Buckets 0-7 (past-half: minute 0-37) use `{h}` to name the current hour; buckets 8-11 (to-half: minute 38-59) use `{h1}` to name the approaching next hour
- GetSegmentKey body left completely unchanged as specified

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two candidate templates had text after {h} placeholder**
- **Found during:** Task 1 verification (reviewing all bucket entries)
- **Issue:** `"the hour of {h} leans forward"` and `"nearly half of {h} spent"` both had words after the `{h}` placeholder; GetStructuredPhrase's EndsWith check would have returned the full resolved phrase in the fallback path instead of splitting qualifier/emphasis
- **Fix:** Reworded both: `"the hour leans forward from {h}"` and `"the half-hour approaches, still {h}"`
- **Files modified:** FuzzyClock.Core/PoeticPhraseProvider.cs
- **Verification:** `grep '".*{h}[^"}1].*"'` returns no matches; all tests pass
- **Committed in:** `30b0a68` (separate fix commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — correctness bug)
**Impact on plan:** Required for GetStructuredPhrase correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed template constraint violation.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- PoeticPhraseProvider now fully consistent with RudePhraseProvider structure and EnglishPhraseProvider GetStructuredPhrase pattern
- GetStructuredPhrase callers (MainWindow split-layout rendering) will now receive the hour word as emphasis for poetic style
- No blockers

---
*Phase: 55-update-the-poetic-phrase-clock-to-be-poetic-but-provide-more-hints-to-the-actual-time*
*Completed: 2026-03-18*

## Self-Check: PASSED

- FuzzyClock.Core/PoeticPhraseProvider.cs — FOUND
- FuzzyClock.Core.Tests/PhraseStyleProviderTests.cs — FOUND
- 55-01-SUMMARY.md — FOUND
- Commit c593115 (feat: rewrite) — FOUND
- Commit 30b0a68 (fix: placeholder constraint) — FOUND
- Commit 921ce40 (test: expanded tests) — FOUND
