---
phase: 53-fix-phrase-update-rate-only-update-on-time-segment-change
plan: 02
subsystem: ui
tags: [phrase-engine, segment-key, bucket-guard, mainwindow, random-candidates]

# Dependency graph
requires:
  - phase: 53-fix-phrase-update-rate-only-update-on-time-segment-change
    plan: 01
    provides: PhraseEngine.GetSegmentKey static facade and IPhraseProvider.GetSegmentKey across all 9 providers

provides:
  - Segment-key guard in UpdatePhraseIfChanged — GetPhrase only called when bucket changes
  - _lastSegmentKey field tracking last rendered segment key in MainWindow
  - Cache clears (_lastSegmentKey = "") at all 4 manual refresh sites

affects: [any future phrase provider or MainWindow phrase update changes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Segment-key guard pattern: check GetSegmentKey before calling GetPhrase to avoid random re-roll within same bucket
    - Dual cache clear: manual refresh sites clear both _currentRawPhrase and _lastSegmentKey to force fresh pick

key-files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "Segment-key guard replaces phrase-string comparison guard in UpdatePhraseIfChanged — segment key is stable per bucket, phrase string is not (random candidates)"
  - "All 4 manual refresh sites clear _lastSegmentKey in addition to _currentRawPhrase so explicit user actions (style change, language switch, wrap toggle) still trigger an immediate fresh phrase pick"
  - "ResetToDefaults calls SetLanguage which handles _lastSegmentKey clear — no separate change needed at ResetToDefaults call site"

patterns-established:
  - "Dual cache clear pattern: whenever _currentRawPhrase is cleared at a manual refresh site, _lastSegmentKey must also be cleared"

requirements-completed: [SEGKEY-03]

# Metrics
duration: 5min
completed: 2026-03-18
---

# Phase 53 Plan 02: Wire Segment-Key Guard into MainWindow Summary

**_lastSegmentKey field and PhraseEngine.GetSegmentKey bucket guard wired into UpdatePhraseIfChanged, eliminating 10-second random re-roll on Rude and Poetic providers; all 4 manual refresh sites clear the key cache**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-18T16:15:00Z
- **Completed:** 2026-03-18T16:20:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added `_lastSegmentKey` field to MainWindow alongside `_currentRawPhrase`
- Replaced the old phrase-string comparison guard (`if (newPhrase == _currentRawPhrase) return`) with a segment-key guard that skips `GetPhrase()` entirely when the bucket has not changed
- Cleared `_lastSegmentKey = ""` at all 4 manual refresh sites: `SetPhraseStyle`, `SetLanguage`, `SetPhraseWrapEnabled`, `SetPhraseWrapStyle`
- Full solution builds with 0 errors, 267 tests pass (242 Core + 25 App)

## Task Commits

1. **Task 1: Wire segment-key guard into UpdatePhraseIfChanged and clear cache at manual refresh sites** — `05745be` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `FuzzyClock.App/MainWindow.xaml.cs` — Added `_lastSegmentKey` field; rewrote UpdatePhraseIfChanged guard; added `_lastSegmentKey = ""` at 4 cache-clear sites

## Decisions Made

- Segment-key guard replaces phrase-string comparison guard: the old guard prevented layout re-runs but still allowed GetPhrase to return a different random candidate. The new guard skips GetPhrase entirely when the segment key is unchanged, which is the correct fix for random re-roll.
- All 4 manual refresh sites clear both `_currentRawPhrase` and `_lastSegmentKey` so explicit user actions (style change, language switch, wrap toggle, wrap style change) still trigger an immediate fresh phrase pick by causing the next UpdatePhraseIfChanged call to see a new key.
- `ResetToDefaults` does not need a separate `_lastSegmentKey = ""` because it calls `SetLanguage("auto")` which already clears both caches.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 53 is now complete. The phrase update rate bug (random re-roll every 10 seconds on Rude/Poetic providers) is fixed.
- Phase 54 (backdrop enhancement) can proceed.

---
*Phase: 53-fix-phrase-update-rate-only-update-on-time-segment-change*
*Completed: 2026-03-18*
